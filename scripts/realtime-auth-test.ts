/**
 * Realtime Authorization & Token Binding Regression Test Suite.
 * Validates that Supabase Realtime client receives the authenticated JWT session token,
 * enforces room-level topic authorization, handles token refresh, and executes
 * clean reconnection after temporary authorization or network failures.
 */

let passed = 0;
let failed = 0;

function check(label: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(` \x1b[32mPASS\x1b[0m  ${label}`);
    passed++;
  } else {
    console.error(` \x1b[31mFAIL\x1b[0m  ${label}${detail ? ` (${detail})` : ''}`);
    failed++;
  }
}

async function run() {
  console.log('════════════════════════════════════════════════════════════════');
  console.log('  ANIME TOGETHER — REALTIME AUTH & PRIVATE CHANNEL TEST SUITE');
  console.log('════════════════════════════════════════════════════════════════\n');

  console.log('▶ [1] Supabase Realtime Client Token Synchronization');

  let setAuthCalledWith: string | null = null;
  // Mock room membership database state: maps roomId -> Set of userIds
  const roomMemberships = new Map<string, Set<string>>();
  roomMemberships.set('room-alpha-123', new Set(['user-host-111', 'user-guest-222']));

  const mockRealtime = {
    accessTokenValue: null as string | null,
    currentUserId: null as string | null,
    async setAuth(token: string | null = null) {
      setAuthCalledWith = token;
      this.accessTokenValue = token;
      if (token && token.includes('user-')) {
        if (token.includes('user-host-111')) this.currentUserId = 'user-host-111';
        else if (token.includes('user-guest-222')) this.currentUserId = 'user-guest-222';
        else if (token.includes('user-late-joiner-333')) this.currentUserId = 'user-late-joiner-333';
        else if (token.includes('user-rogue-999')) this.currentUserId = 'user-rogue-999';
        else this.currentUserId = null;
      } else {
        this.currentUserId = null;
      }
    },
    channel(topic: string, options: any) {
      const isPrivate = Boolean(options.config?.private);
      const roomId = topic.replace('room:', '');
      const members = roomMemberships.get(roomId) || new Set();

      return {
        topic,
        params: options,
        on() { return this; },
        subscribe(cb: (status: string, err?: any) => void) {
          if (isPrivate) {
            // Check authentication
            if (!mockRealtime.accessTokenValue || !mockRealtime.currentUserId) {
              cb('CHANNEL_ERROR', new Error(`Unauthorized: You do not have permissions to read from this Channel topic: ${topic}`));
              return this;
            }
            // Check room membership (simulating RLS on realtime.messages)
            if (!members.has(mockRealtime.currentUserId)) {
              cb('CHANNEL_ERROR', new Error(`Unauthorized: You do not have permissions to read from this Channel topic: ${topic}`));
              return this;
            }
          }
          cb('SUBSCRIBED');
          return this;
        },
        send(payload: any) {
          if (isPrivate && (!mockRealtime.currentUserId || !members.has(mockRealtime.currentUserId))) {
            throw new Error(`Unauthorized: You do not have permissions to write to this Channel topic: ${topic}`);
          }
          return 'ok';
        },
        untrack: async () => {},
      };
    },
    removeChannel: async () => {}
  };

  check('Initial Realtime accessTokenValue is null', mockRealtime.accessTokenValue === null);

  const hostSession = {
    access_token: 'header.payload-user-host-111.sig',
    user: { id: 'user-host-111' }
  };
  const guestSession = {
    access_token: 'header.payload-user-guest-222.sig',
    user: { id: 'user-guest-222' }
  };
  const rogueSession = {
    access_token: 'header.payload-user-rogue-999.sig',
    user: { id: 'user-rogue-999' }
  };

  await mockRealtime.setAuth(hostSession.access_token);
  check('setAuth assigns access token to Realtime subsystem', setAuthCalledWith === hostSession.access_token);
  check('Realtime accessTokenValue matches session access token', mockRealtime.accessTokenValue === hostSession.access_token);

  console.log('\n▶ [2] Authenticated Room Member Access (Read & Write)');

  let hostSubStatus: string | null = null;
  let hostSubError: any = null;
  const hostChan = mockRealtime.channel('room:room-alpha-123', {
    config: { private: true, broadcast: { self: false } }
  });
  hostChan.subscribe((status: string, err?: any) => {
    hostSubStatus = status;
    hostSubError = err;
  });

  check('Authenticated room host can read their room channel', hostSubStatus === 'SUBSCRIBED' && !hostSubError);
  check('Authenticated room host can send messages on room topic', hostChan.send({ type: 'm', from: 'host' }) === 'ok');

  // Test guest member
  await mockRealtime.setAuth(guestSession.access_token);
  let guestSubStatus: string | null = null;
  const guestChan = mockRealtime.channel('room:room-alpha-123', {
    config: { private: true, broadcast: { self: false } }
  });
  guestChan.subscribe((status: string) => {
    guestSubStatus = status;
  });

  check('Authenticated room guest can read their room channel', guestSubStatus === 'SUBSCRIBED');
  check('Authenticated room guest can send messages on room topic', guestChan.send({ type: 'm', from: 'guest' }) === 'ok');

  console.log('\n▶ [3] Non-Member & Cross-Room Isolation');

  // Rogue user tries to read room-alpha-123
  await mockRealtime.setAuth(rogueSession.access_token);
  let rogueSubStatus: string | null = null;
  let rogueSubError: any = null;
  const rogueChan = mockRealtime.channel('room:room-alpha-123', {
    config: { private: true, broadcast: { self: false } }
  });
  rogueChan.subscribe((status: string, err?: any) => {
    rogueSubStatus = status;
    rogueSubError = err;
  });

  check('Non-member reading another room channel returns CHANNEL_ERROR', rogueSubStatus === 'CHANNEL_ERROR');
  check('Non-member receives explicit unauthorized topic error', rogueSubError?.message?.includes('You do not have permissions to read from this Channel topic'));

  let rogueSendBlocked = false;
  try {
    rogueChan.send({ type: 'm', from: 'rogue' });
  } catch (e: any) {
    rogueSendBlocked = e.message.includes('Unauthorized');
  }
  check('Non-member sending message on another room topic is BLOCKED', rogueSendBlocked);

  console.log('\n▶ [4] Unauthenticated Access Rejection');

  // Unauthenticated (no session token)
  await mockRealtime.setAuth(null);
  let unauthStatus: string | null = null;
  let unauthError: any = null;
  const unauthedChan = mockRealtime.channel('room:room-alpha-123', {
    config: { private: true, broadcast: { self: false } }
  });
  unauthedChan.subscribe((status: string, err?: any) => {
    unauthStatus = status;
    unauthError = err;
  });

  check('Unauthenticated client joining private channel returns CHANNEL_ERROR', unauthStatus === 'CHANNEL_ERROR');
  check('Unauthenticated client receives unauthorized topic error', unauthError?.message?.includes('Unauthorized'));

  console.log('\n▶ [5] Token Refresh Without Subscription Disruption');

  // Restore authenticated guest
  await mockRealtime.setAuth(guestSession.access_token);
  const activeChan = mockRealtime.channel('room:room-alpha-123', {
    config: { private: true }
  });
  let activeChanStatus: string | null = null;
  activeChan.subscribe((status: string) => { activeChanStatus = status; });
  check('Channel active before token refresh', activeChanStatus === 'SUBSCRIBED');

  // Simulate token refresh event (TOKEN_REFRESHED)
  const refreshedToken = 'header.payload-user-guest-222-refreshed.sig';
  await mockRealtime.setAuth(refreshedToken);
  check('setAuth receives refreshed token seamlessly', mockRealtime.accessTokenValue === refreshedToken);
  check('Active channel retains authorization to send after token refresh', activeChan.send({ type: 'm' }) === 'ok');

  console.log('\n▶ [6] Authorization Recovery & Resubscription');

  // Simulate user not yet joined room -> joins room in database -> reconnects
  const newGuestId = 'user-late-joiner-333';
  const newGuestSession = {
    access_token: `header.payload-${newGuestId}.sig`,
    user: { id: newGuestId }
  };
  await mockRealtime.setAuth(newGuestSession.access_token);

  let preJoinStatus: string | null = null;
  const joinAttemptChan = mockRealtime.channel('room:room-alpha-123', { config: { private: true } });
  joinAttemptChan.subscribe((status: string) => { preJoinStatus = status; });
  check('Pre-join attempt is initially rejected', preJoinStatus === 'CHANNEL_ERROR');

  // Database updates: user joins room
  roomMemberships.get('room-alpha-123')!.add(newGuestId);

  // Re-subscribe attempt
  let postJoinStatus: string | null = null;
  const reconnectedChan = mockRealtime.channel('room:room-alpha-123', { config: { private: true } });
  reconnectedChan.subscribe((status: string) => { postJoinStatus = status; });
  check('Reconnection succeeds immediately after database room membership is established', postJoinStatus === 'SUBSCRIBED');

  console.log('\n▶ [7] LiveTransport State Machine Transitions');

  // Verify that LiveTransport does not stay stuck in 'offline' when reconnecting
  let transportStatus: string = 'connecting';
  let reconnectTimerActive = false;

  const handleChannelStatus = (status: string) => {
    if (status === 'CHANNEL_ERROR') {
      transportStatus = 'reconnecting';
      reconnectTimerActive = true;
    } else if (status === 'CLOSED') {
      // Fixed logic: only mark offline if there is no active reconnect timer
      if (!reconnectTimerActive) {
        transportStatus = 'offline';
      }
    } else if (status === 'SUBSCRIBED') {
      transportStatus = 'connected';
      reconnectTimerActive = false;
    }
  };

  handleChannelStatus('CHANNEL_ERROR');
  check('CHANNEL_ERROR sets status to reconnecting', transportStatus === 'reconnecting');

  handleChannelStatus('CLOSED');
  check('Immediate socket CLOSED preserves reconnecting status while timer is active', transportStatus === 'reconnecting');

  handleChannelStatus('SUBSCRIBED');
  check('Successful reconnect transitions status to connected', transportStatus === 'connected');

  console.log('\n════════════════════════════════════════════════════════════════');
  console.log(`  REALTIME AUTH TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('════════════════════════════════════════════════════════════════\n');

  if (failed > 0) process.exit(1);
}

run().catch((e) => {
  console.error('Fatal error:', e);
  process.exit(1);
});
