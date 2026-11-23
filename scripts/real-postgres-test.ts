import { execSync } from 'child_process';

/**
 * Real PostgreSQL Database Integration Test Suite.
 * Executes live SQL queries against the running PostgreSQL container in Docker.
 * Tests RLS policies and SECURITY DEFINER RPCs across separate authenticated roles.
 */

function runSql(sql: string): string {
  try {
    return execSync(`docker exec -i pg-anime-test psql -U postgres -v ON_ERROR_STOP=1 -At`, {
      input: sql,
      encoding: 'utf-8'
    });
  } catch (e: any) {
    const stderr = e.stderr ? e.stderr.toString() : e.message;
    throw new Error(stderr);
  }
}

function extractJson(output: string): any {
  const lines = output.trim().split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (line.startsWith('{') && line.endsWith('}')) {
      return JSON.parse(line);
    }
  }
  return {};
}

function extractScalar(output: string): string {
  const lines = output.trim().split('\n').map((l) => l.trim()).filter((l) => !['BEGIN', 'SET', 'COMMIT', 'DO'].includes(l));
  return lines[lines.length - 1] || '';
}

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
  console.log('  ANIME TOGETHER — REAL POSTGRESQL INTEGRATION TEST SUITE');
  console.log('  Testing live against PostgreSQL 16 container (pg-anime-test)');
  console.log('════════════════════════════════════════════════════════════════\n');

  // Verify DB connectivity
  try {
    const version = runSql('SELECT version();');
    check('Live PostgreSQL database is reachable and operational', version.includes('PostgreSQL 16'));
  } catch (e: any) {
    console.error('Cannot connect to pg-anime-test container:', e.message);
    process.exit(1);
  }

  // Setup identities: Host, Guest, Rogue
  const hostId = '11111111-1111-1111-1111-111111111111';
  const guestId = '22222222-2222-2222-2222-222222222222';
  const rogueId = '33333333-3333-3333-3333-333333333333';

  runSql(`
    INSERT INTO auth.users (id, email) VALUES
      ('${hostId}', 'host@test.com'),
      ('${guestId}', 'guest@test.com'),
      ('${rogueId}', 'rogue@test.com')
    ON CONFLICT (id) DO NOTHING;
  `);

  console.log('\n▶ [1] Room Creation & Host Public Key Registration');
  // 1. Host creates room
  const createRes = runSql(`
    BEGIN;
    SET LOCAL ROLE authenticated;
    SET LOCAL "request.jwt.claim.sub" = '${hostId}';
    SELECT public.create_room('TatsumakiHost');
    COMMIT;
  `);
  const roomData = extractJson(createRes);
  const roomId = roomData.id;
  check('Host creates room via create_room RPC', typeof roomId === 'string' && roomId.length === 20);

  // 2. Guest joins room
  runSql(`
    BEGIN;
    SET LOCAL ROLE authenticated;
    SET LOCAL "request.jwt.claim.sub" = '${guestId}';
    SELECT public.join_room('${roomId}', 'FubukiGuest');
    COMMIT;
  `);
  check('Guest joins room via join_room RPC', true);

  // 3. Host registers public key
  const testPubkey = '{"kty":"EC","crv":"P-256","x":"test-x","y":"test-y"}';
  runSql(`
    BEGIN;
    SET LOCAL ROLE authenticated;
    SET LOCAL "request.jwt.claim.sub" = '${hostId}';
    SELECT public.register_host_pubkey('${roomId}', '${testPubkey}', 1);
    COMMIT;
  `);
  const pubkeyCheck = runSql(`SELECT host_pubkey FROM public.rooms WHERE id = '${roomId}';`).trim();
  check('Host successfully registers public key via register_host_pubkey', pubkeyCheck === testPubkey);

  // 4. Unauthorized guest attempting to register public key
  let guestKeyBlocked = false;
  try {
    runSql(`
      BEGIN;
      SET LOCAL ROLE authenticated;
      SET LOCAL "request.jwt.claim.sub" = '${guestId}';
      SELECT public.register_host_pubkey('${roomId}', '{"kty":"rogue"}', 1);
      COMMIT;
    `);
  } catch (e: any) {
    guestKeyBlocked = e.message.includes('Only the host can register a host key');
  }
  check('Unauthorized guest calling register_host_pubkey is BLOCKED by server', guestKeyBlocked);

  console.log('\n▶ [2] Host-Only Control & Playback Authorization');
  // 1. Host sets host-only mode
  runSql(`
    BEGIN;
    SET LOCAL ROLE authenticated;
    SET LOCAL "request.jwt.claim.sub" = '${hostId}';
    SELECT public.set_host_only('${roomId}', true);
    COMMIT;
  `);
  const hostOnlyCheck = runSql(`SELECT host_only FROM public.rooms WHERE id = '${roomId}';`).trim();
  check('Host enables host-only mode via set_host_only', hostOnlyCheck === 't');

  // 2. Guest attempting to toggle host-only mode
  let guestHostOnlyBlocked = false;
  try {
    runSql(`
      BEGIN;
      SET LOCAL ROLE authenticated;
      SET LOCAL "request.jwt.claim.sub" = '${guestId}';
      SELECT public.set_host_only('${roomId}', false);
      COMMIT;
    `);
  } catch (e: any) {
    guestHostOnlyBlocked = e.message.includes('Only the host can change host-only controls');
  }
  check('Unauthorized guest calling set_host_only is BLOCKED by server', guestHostOnlyBlocked);

  // 3. Host updates playback with sequence number
  runSql(`
    BEGIN;
    SET LOCAL ROLE authenticated;
    SET LOCAL "request.jwt.claim.sub" = '${hostId}';
    SELECT public.update_playback('${roomId}', 'seek', 120.5, true, '{"title":"Ep 1","url":"https://cdn/1.mp4","kind":"mp4"}'::jsonb, 10);
    COMMIT;
  `);
  const pbSeqCheck = runSql(`SELECT host_seq FROM public.rooms WHERE id = '${roomId}';`).trim();
  check('Host updates playback state with sequence number (seq=10)', pbSeqCheck === '10');

  // 4. Guest attempting to update playback in host-only mode
  let guestPlaybackBlocked = false;
  try {
    runSql(`
      BEGIN;
      SET LOCAL ROLE authenticated;
      SET LOCAL "request.jwt.claim.sub" = '${guestId}';
      SELECT public.update_playback('${roomId}', 'pause', 0, false, null, 11);
      COMMIT;
    `);
  } catch (e: any) {
    guestPlaybackBlocked = e.message.includes('Host-only mode is active; unauthorized control attempt');
  }
  check('Unauthorized guest updating playback in host-only mode is BLOCKED', guestPlaybackBlocked);

  // 5. Invalid playback time rejection
  let invalidTimeBlocked = false;
  try {
    runSql(`
      BEGIN;
      SET LOCAL ROLE authenticated;
      SET LOCAL "request.jwt.claim.sub" = '${hostId}';
      SELECT public.update_playback('${roomId}', 'seek', -5::numeric, true, null::jsonb, 10);
      COMMIT;
    `);
  } catch (e: any) {
    invalidTimeBlocked = e.message.includes('Invalid playback time');
  }
  check('Negative playback time is REJECTED by database bounds check', invalidTimeBlocked);

  console.log('\n▶ [3] Host Transfer & Epoch Increment Lifecycle');
  // 1. Transfer host to Guest
  runSql(`
    BEGIN;
    SET LOCAL ROLE authenticated;
    SET LOCAL "request.jwt.claim.sub" = '${hostId}';
    SELECT public.transfer_host('${roomId}', '${guestId}');
    COMMIT;
  `);
  const postTransfer = runSql(`SELECT host_id, host_epoch, host_seq, host_pubkey FROM public.rooms WHERE id = '${roomId}';`).trim().split('|');
  const [newHost, newEpoch, newSeq, newPubkey] = postTransfer;
  check('Host transferred: host_id updated to Guest', newHost === guestId);
  check('Host transferred: host_epoch incremented to 2', newEpoch === '2');
  check('Host transferred: host_seq reset to 0', newSeq === '0');
  check('Host transferred: old host_pubkey invalidated (null)', newPubkey === '');

  // 2. Old host attempting host commands after transfer is rejected
  let oldHostBlocked = false;
  try {
    runSql(`
      BEGIN;
      SET LOCAL ROLE authenticated;
      SET LOCAL "request.jwt.claim.sub" = '${hostId}';
      SELECT public.set_host_only('${roomId}', false);
      COMMIT;
    `);
  } catch (e: any) {
    oldHostBlocked = e.message.includes('Only the host can change host-only controls');
  }
  check('Deposed previous host attempting host controls is REJECTED', oldHostBlocked);

  // 3. Claim host while current host is active (< 30s) is rejected
  let claimActiveBlocked = false;
  try {
    runSql(`
      BEGIN;
      SET LOCAL ROLE authenticated;
      SET LOCAL "request.jwt.claim.sub" = '${hostId}';
      SELECT public.claim_host('${roomId}');
      COMMIT;
    `);
  } catch (e: any) {
    claimActiveBlocked = e.message.includes('Current host is still active');
  }
  check('Claiming host while current host is active is BLOCKED', claimActiveBlocked);

  console.log('\n▶ [4] Anime Bingo Security & Authoritative Line Verification');
  // 1. Create competitive Bingo game
  const tropes = JSON.stringify(Array.from({ length: 25 }, (_, i) => ({ id: `t${i}`, text: `Trope ${i}`, category: 'general' })));
  const gameRes = runSql(`
    BEGIN;
    SET LOCAL ROLE authenticated;
    SET LOCAL "request.jwt.claim.sub" = '${guestId}'; -- guest is now host
    SELECT public.create_bingo_game('${roomId}', 'competitive', 'general', '${tropes}'::jsonb);
    COMMIT;
  `);
  const gameData = extractJson(gameRes);
  const gameId = gameData.game?.id;
  const guestBoardId = gameData.board?.id;
  check('Host creates competitive Bingo game via create_bingo_game', typeof gameId === 'string');

  // Both players get their competitive boards
  const hostBoardRes = runSql(`
    BEGIN;
    SET LOCAL ROLE authenticated;
    SET LOCAL "request.jwt.claim.sub" = '${hostId}';
    SELECT public.join_bingo_board('${gameId}', '${tropes}'::jsonb);
    COMMIT;
  `);
  const hostBoardId = extractJson(hostBoardRes).id;
  check('Distinct competitive boards created for each participant', hostBoardId !== guestBoardId);

  // 2. Guest tampering with Host's board
  let tamperBlocked = false;
  try {
    runSql(`
      BEGIN;
      SET LOCAL ROLE authenticated;
      SET LOCAL "request.jwt.claim.sub" = '${guestId}';
      SELECT public.mark_bingo_square('${gameId}', '${hostBoardId}', 0);
      COMMIT;
    `);
  } catch (e: any) {
    tamperBlocked = e.message.includes('Cannot mark another participant’s competitive board');
  }
  check('Participant marking another user’s competitive board is BLOCKED', tamperBlocked);

  // 3. Unearned win claim on incomplete board
  let unearnedBlocked = false;
  try {
    runSql(`
      BEGIN;
      SET LOCAL ROLE authenticated;
      SET LOCAL "request.jwt.claim.sub" = '${hostId}';
      SELECT public.claim_bingo_win('${gameId}', '${hostBoardId}');
      COMMIT;
    `);
  } catch (e: any) {
    unearnedBlocked = e.message.includes('Board does not have a complete Bingo line');
  }
  check('Unearned Bingo win claim on incomplete board is REJECTED', unearnedBlocked);

  // 4. Mark complete line (indices 0, 1, 2, 3, 4 = Row 0)
  for (const idx of [0, 1, 2, 3, 4]) {
    runSql(`
      BEGIN;
      SET LOCAL ROLE authenticated;
      SET LOCAL "request.jwt.claim.sub" = '${hostId}';
      SELECT public.mark_bingo_square('${gameId}', '${hostBoardId}', ${idx});
      COMMIT;
    `);
  }
  // Claim legitimate win
  runSql(`
    BEGIN;
    SET LOCAL ROLE authenticated;
    SET LOCAL "request.jwt.claim.sub" = '${hostId}';
    SELECT public.claim_bingo_win('${gameId}', '${hostBoardId}');
    COMMIT;
  `);
  const winnerCheck = runSql(`SELECT winner_id, status FROM public.bingo_games WHERE id = '${gameId}';`).trim().split('|');
  check('Valid Bingo win with complete 5-in-a-row line is ACCEPTED', winnerCheck[0] === hostId && winnerCheck[1] === 'completed');

  // Verify points awarded in player_scores
  const scoreCheck = runSql(`SELECT score, bingos_won FROM public.player_scores WHERE room_id = '${roomId}' AND user_id = '${hostId}';`).trim().split('|');
  check('Winning player awarded 25 score points and 1 bingos_won in player_scores', scoreCheck[0] === '25' && scoreCheck[1] === '1');

  // 5. Re-claiming on already completed game
  let doubleWinBlocked = false;
  try {
    runSql(`
      BEGIN;
      SET LOCAL ROLE authenticated;
      SET LOCAL "request.jwt.claim.sub" = '${hostId}';
      SELECT public.claim_bingo_win('${gameId}', '${hostBoardId}');
      COMMIT;
    `);
  } catch (e: any) {
    doubleWinBlocked = e.message.includes('Game not active') || e.message.includes('Game is not active');
  }
  check('Claiming win again on already completed game is REJECTED', doubleWinBlocked);

  console.log('\n▶ [5] Episode Predictions: Privacy, Immutability & Double Resolution');
  // 1. Create prediction
  const predRes = runSql(`
    BEGIN;
    SET LOCAL ROLE authenticated;
    SET LOCAL "request.jwt.claim.sub" = '${guestId}'; -- current host
    SELECT public.create_prediction(
      p_room := '${roomId}',
      p_question := 'Will Luffy go Gear 5 in episode 1071?',
      p_kind := 'choice',
      p_options := '[{"id":"yes","text":"Yes"},{"id":"no","text":"No"}]'::jsonb,
      p_points := 20
    );
    COMMIT;
  `);
  const predId = extractJson(predRes).id;
  check('Host creates prediction via create_prediction RPC', typeof predId === 'string');

  // 2. Both participants submit answers
  runSql(`
    BEGIN;
    SET LOCAL ROLE authenticated;
    SET LOCAL "request.jwt.claim.sub" = '${hostId}';
    SELECT public.submit_prediction_answer('${predId}', 'yes');
    COMMIT;
  `);
  runSql(`
    BEGIN;
    SET LOCAL ROLE authenticated;
    SET LOCAL "request.jwt.claim.sub" = '${guestId}';
    SELECT public.submit_prediction_answer('${predId}', 'no');
    COMMIT;
  `);

  // 3. Check RLS privacy BEFORE reveal: Host querying prediction_answers table
  // Policy pred_ans_select: user_id = auth.uid() or revealed/resolved.
  // Host should only see their own answer!
  const hostVisibleAnswers = extractScalar(runSql(`
    BEGIN;
    SET LOCAL ROLE authenticated;
    SET LOCAL "request.jwt.claim.sub" = '${hostId}';
    SELECT count(*) FROM public.prediction_answers WHERE prediction_id = '${predId}';
    COMMIT;
  `));
  check('RLS Privacy: Host querying table before reveal only sees their own answer (count=1)', hostVisibleAnswers === '1');

  // 4. Lock prediction
  runSql(`
    BEGIN;
    SET LOCAL ROLE authenticated;
    SET LOCAL "request.jwt.claim.sub" = '${guestId}';
    SELECT public.lock_prediction('${predId}');
    COMMIT;
  `);
  // Attempt to edit answer after lock
  let postLockBlocked = false;
  try {
    runSql(`
      BEGIN;
      SET LOCAL ROLE authenticated;
      SET LOCAL "request.jwt.claim.sub" = '${hostId}';
      SELECT public.submit_prediction_answer('${predId}', 'no');
      COMMIT;
    `);
  } catch (e: any) {
    postLockBlocked = e.message.includes('Prediction is locked') || e.message.includes('Your answer has already been locked');
  }
  check('Modifying prediction answer after lock is REJECTED', postLockBlocked);

  // 5. Reveal prediction
  runSql(`
    BEGIN;
    SET LOCAL ROLE authenticated;
    SET LOCAL "request.jwt.claim.sub" = '${guestId}';
    SELECT public.reveal_prediction('${predId}');
    COMMIT;
  `);
  // Now Host queries prediction_answers: both answers should be visible!
  const postRevealAnswers = extractScalar(runSql(`
    BEGIN;
    SET LOCAL ROLE authenticated;
    SET LOCAL "request.jwt.claim.sub" = '${hostId}';
    SELECT count(*) FROM public.prediction_answers WHERE prediction_id = '${predId}';
    COMMIT;
  `));
  check('RLS Privacy: After reveal, all participant answers become visible (count=2)', postRevealAnswers === '2');

  // 6. Guest (non-host) attempting to resolve prediction is rejected
  let rogueResolveBlocked = false;
  try {
    runSql(`
      BEGIN;
      SET LOCAL ROLE authenticated;
      SET LOCAL "request.jwt.claim.sub" = '${hostId}'; -- hostId is now guest
      SELECT public.resolve_prediction('${predId}', 'yes');
      COMMIT;
    `);
  } catch (e: any) {
    rogueResolveBlocked = e.message.includes('Only the host or creator can resolve this prediction') || e.message.includes('Only the room host can resolve predictions');
  }
  check('Non-host attempting to resolve prediction is REJECTED', rogueResolveBlocked);

  // 7. Host resolves prediction: 'yes' wins
  runSql(`
    BEGIN;
    SET LOCAL ROLE authenticated;
    SET LOCAL "request.jwt.claim.sub" = '${guestId}'; -- current host
    SELECT public.resolve_prediction('${predId}', 'yes');
    COMMIT;
  `);
  const winnerPoints = runSql(`SELECT score, predictions_won FROM public.player_scores WHERE room_id = '${roomId}' AND user_id = '${hostId}';`).trim().split('|');
  check('Correct voter awarded +20 points (total score=45, predictions_won=1)', winnerPoints[0] === '45' && winnerPoints[1] === '1');

  // 8. Double resolution attack rejection
  let doubleResolveBlocked = false;
  try {
    runSql(`
      BEGIN;
      SET LOCAL ROLE authenticated;
      SET LOCAL "request.jwt.claim.sub" = '${guestId}';
      SELECT public.resolve_prediction('${predId}', 'yes');
      COMMIT;
    `);
  } catch (e: any) {
    doubleResolveBlocked = e.message.includes('Prediction is already resolved');
  }
  check('Double resolution score inflation attack is REJECTED', doubleResolveBlocked);

  console.log('\n▶ [6] Expired Room Access Enforcement');
  // Create an expired room
  const expiredRes = runSql(`
    INSERT INTO public.rooms (id, host_id, expires_at)
    VALUES ('expiredroom234567234', '${hostId}', now() - interval '2 hours')
    ON CONFLICT (id) DO UPDATE SET expires_at = now() - interval '2 hours'
    RETURNING id;
  `);
  let expiredJoinBlocked = false;
  try {
    runSql(`
      BEGIN;
      SET LOCAL ROLE authenticated;
      SET LOCAL "request.jwt.claim.sub" = '${guestId}';
      SELECT public.join_room('expiredroom234567234', 'LateGuest');
      COMMIT;
    `);
  } catch (e: any) {
    expiredJoinBlocked = e.message.includes('Room not found or expired');
  }
  check('Joining an expired room is REJECTED by PostgreSQL', expiredJoinBlocked);

  console.log('\n▶ [7] Realtime Channel RLS & Private Topic Authorization');
  // Setup grants and enable RLS on realtime.messages
  runSql(`
    GRANT USAGE ON SCHEMA realtime TO authenticated, anon;
    GRANT SELECT, INSERT ON realtime.messages TO authenticated;
    ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;
    DELETE FROM realtime.messages;
  `);

  // 1. Authorized member can insert into realtime.messages with matching topic
  let memberRealtimeInsert = false;
  try {
    runSql(`
      BEGIN;
      SET LOCAL ROLE authenticated;
      SET LOCAL "request.jwt.claim.sub" = '${hostId}';
      SET LOCAL "request.jwt.claim.topic" = 'room:${roomId}';
      INSERT INTO realtime.messages (id) VALUES ('11111111-aaaa-bbbb-cccc-111111111111');
      COMMIT;
    `);
    memberRealtimeInsert = true;
  } catch (e: any) {
    memberRealtimeInsert = false;
  }
  check('Authorized room member can broadcast on private channel topic', memberRealtimeInsert);

  // 2. Authorized member can select from realtime.messages
  const memberSelectCount = extractScalar(runSql(`
    BEGIN;
    SET LOCAL ROLE authenticated;
    SET LOCAL "request.jwt.claim.sub" = '${hostId}';
    SET LOCAL "request.jwt.claim.topic" = 'room:${roomId}';
    SELECT count(*)::text FROM realtime.messages WHERE id = '11111111-aaaa-bbbb-cccc-111111111111';
    COMMIT;
  `));
  check('Authorized room member can receive messages on private channel topic', memberSelectCount === '1');

  // 3. Rogue non-member attempting to insert on room topic is REJECTED
  let rogueRealtimeBlocked = false;
  try {
    runSql(`
      BEGIN;
      SET LOCAL ROLE authenticated;
      SET LOCAL "request.jwt.claim.sub" = '${rogueId}';
      SET LOCAL "request.jwt.claim.topic" = 'room:${roomId}';
      INSERT INTO realtime.messages (id) VALUES ('33333333-aaaa-bbbb-cccc-333333333333');
      COMMIT;
    `);
  } catch (e: any) {
    rogueRealtimeBlocked = e.message.includes('insufficient_privilege') || e.message.includes('violates row-level security policy') || e.message.includes('42501');
  }
  check('Unauthorized non-member broadcasting on private room channel is BLOCKED by RLS', rogueRealtimeBlocked);

  // 4. Authorized member on WRONG topic is REJECTED
  let wrongTopicBlocked = false;
  try {
    runSql(`
      BEGIN;
      SET LOCAL ROLE authenticated;
      SET LOCAL "request.jwt.claim.sub" = '${hostId}';
      SET LOCAL "request.jwt.claim.topic" = 'room:wrongroomtopic999';
      INSERT INTO realtime.messages (id) VALUES ('11111111-aaaa-bbbb-cccc-222222222222');
      COMMIT;
    `);
  } catch (e: any) {
    wrongTopicBlocked = e.message.includes('insufficient_privilege') || e.message.includes('violates row-level security policy') || e.message.includes('42501');
  }
  check('Member broadcasting on mismatched channel topic is BLOCKED by RLS', wrongTopicBlocked);

  // 5. Unauthenticated (anon) attempting to insert on room topic is REJECTED
  let anonRealtimeBlocked = false;
  try {
    runSql(`
      BEGIN;
      SET LOCAL ROLE anon;
      SET LOCAL "request.jwt.claim.topic" = 'room:${roomId}';
      INSERT INTO realtime.messages (id) VALUES ('44444444-aaaa-bbbb-cccc-444444444444');
      COMMIT;
    `);
  } catch (e: any) {
    anonRealtimeBlocked = e.message.includes('insufficient_privilege') || e.message.includes('violates row-level security policy') || e.message.includes('permission denied') || e.message.includes('42501');
  }
  check('Unauthenticated anon role broadcasting on private room channel is BLOCKED', anonRealtimeBlocked);

  console.log('\n════════════════════════════════════════════════════════════════');
  console.log(`  REAL POSTGRESQL TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('════════════════════════════════════════════════════════════════\n');

  if (failed > 0) process.exit(1);
}

run().catch((e) => {
  console.error('Fatal test error:', e);
  process.exit(1);
});
