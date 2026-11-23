# Anime Together — Physical Two-Device End-to-End Testing Guide

**Document Version:** 1.0.0 (Phase 2.4)  
**Target Environment:** Cross-Device Supabase Live Mode & WebRTC NAT Traversal  
**Updated:** November 21, 2026  
**Auditor / Lead:** Antigravity Lead Full-Stack Engineering  

---

## 1. Executive Overview & Critical Architectural Prerequisites

### 1.1 Scope of this Guide
This manual testing guide provides reproducible, numbered verification procedures for testing **Anime Together** across **two physically separate devices** (e.g. Device A on home Wi-Fi and Device B on cellular 4G/5G or an external network).

### 1.2 Local Demo Mode vs. Supabase Live Mode
> [!IMPORTANT]
> **Local Demo Mode does NOT synchronize across physically separate devices.**  
> In Local Demo Mode, all messaging utilizes the browser's `BroadcastChannel` and `localStorage`, which are scoped exclusively to the same origin within the same browser profile on a single machine.  
> **To test between two physical devices, you MUST configure Supabase Live Mode.**

| Capability | Local Demo Mode | Supabase Live Mode |
|---|---|---|
| **Cross-Device Sync** | ❌ No (same-browser only) | ✅ Yes (cross-device & cross-network) |
| **Transport** | `BroadcastChannel` | Supabase Realtime Channels (`websocket`) |
| **Persistence** | `localStorage` (unencrypted) | PostgreSQL 16 with Row Level Security (RLS) |
| **Security Enforcement** | In-memory verification | Web Crypto ECDSA P-256 + Server PL/pgSQL RPCs |
| **Signaling** | Local broadcast | Realtime broadcast channel |

---

## 2. Environment Setup & Configuration

### 2.1 Hardware & Network Topology Matrix

| Device Role | Hardware Example | Recommended Browser | Network Connection |
|---|---|---|---|
| **Device A (Host)** | Laptop / Desktop (Mac/PC) | Google Chrome or Microsoft Edge | Home / Office Wi-Fi |
| **Device B (Guest)** | Smartphone or 2nd Laptop (iOS/Android/PC) | Safari, Chrome, or Firefox | Cellular 4G/5G Hotspot or separate Wi-Fi |

### 2.2 Live Backend Configuration (.env)
Create or update your `.env` (or cloud hosting environment variables) with live credentials:

```bash
# 1. Supabase Project Credentials (Required for Live Mode)
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...your-safe-public-anon-key...

# 2. Private Realtime Channels (Must be true for production security)
VITE_REALTIME_PRIVATE=true

# 3. WebRTC STUN & TURN Servers
VITE_STUN_URLS=stun:stun.l.google.com:19302

# 4. TURN Server Configuration (Required for Cross-Network / Cellular NAT Traversal)
VITE_TURN_URL=turn:global.relay.metered.ca:80
VITE_TURN_USERNAME=your-turn-username
VITE_TURN_CREDENTIAL=your-turn-password
```

### 2.3 Supabase Database Initialization
1. In your [Supabase Dashboard](https://app.supabase.com):
   - Navigate to **Authentication → Providers → Anonymous Sign-ins** and ensure **Anonymous Sign-ins** is **ENABLED**.
   - Navigate to **SQL Editor → New Query**.
   - Paste the complete contents of `supabase/schema.sql` and click **Run**.
2. Verify in **Table Editor** that tables `rooms`, `bingo_games`, `bingo_boards`, `predictions`, `prediction_answers`, `player_scores`, `watchlist`, and `moments` are present with RLS enabled.

### 2.4 Hosting Options for Physical Device Access
Because WebRTC camera, microphone, and Web Crypto APIs require a **Secure Context** (`https://` or `localhost`), use one of these hosting methods:

- **Option A (Vercel / Netlify / Cloudflare Pages — Recommended):**  
  Deploy the repository to Vercel or Netlify. Add your `.env` variables in project settings. Provides an automatic HTTPS URL accessible by both devices.
- **Option B (Ngrok / Cloudflare Tunnel for Local Dev):**  
  Run the dev server: `npm run dev -- --host`  
  In a separate terminal: `ngrok http 5173`  
  Open the generated `https://<id>.ngrok-free.app` URL on both devices.
- **Option C (Local LAN HTTPS):**  
  Run Vite with `vite-plugin-basic-ssl` to expose `https://192.168.x.x:5173` across your local Wi-Fi.

---

## 3. WebRTC NAT Traversal & TURN Server Deep Dive

### 3.1 Why STUN Fails Across Cellular / Symmetric NAT
- **STUN (Session Traversal Utilities for NAT)** asks an external server: *"What is my public IP and port?"*
- In standard **Full Cone** or **Port-Restricted NAT** (most home routers), the NAT router maps outgoing requests to a single external port. When the remote peer sends media packets to that port, the NAT router allows them in.
- In **Symmetric NAT** (standard in mobile 4G/5G cellular data, Carrier-Grade NAT / CGNAT, university campuses, and enterprise firewalls), the NAT assigns a **different external port** for every distinct destination endpoint. The public port discovered via the STUN server is *different* from the port needed to reach the remote peer. When the peer sends media packets to the STUN-discovered port, the symmetric NAT firewall drops them.
- **The Result:** WebRTC signaling succeeds over Supabase Realtime, but the peer connection hangs indefinitely in `iceConnectionState: 'checking'` or fails with `iceConnectionState: 'failed'`.

### 3.2 How TURN Resolves the Block
- **TURN (Traversal Using Relays around NAT)** provides a public relay server.
- Both Device A and Device B establish an outgoing connection to the TURN relay.
- Media packets flow: `Device A → TURN Relay → Device B`.
- Because both connections are outbound client-to-server requests, symmetric NATs and enterprise firewalls do not block them.

### 3.3 Free / Low-Cost TURN Providers
1. **Metered.ca:** Free 50 GB/month TURN relay. Create an account, copy the TURN URL, username, and credential.
2. **Twilio Network Traversal Service:** Pay-as-you-go TURN credentials.
3. **Coturn (Self-Hosted):** Open-source TURN server deployable on a \$5/mo VPS.

---

## 4. Developer Diagnostics HUD (`Ctrl+Shift+D`)

The application includes an in-app telemetry overlay to observe internal protocol states in real time:

- **How to Open:** Press `Ctrl+Shift+D` (or `Cmd+Shift+D` on Mac), or click the **Activity (Pulse)** icon in the room header bar.
- **Key Metrics Available:**
  1. **Transport Mode:** Confirms `Supabase Live Mode` vs `Local Demo Mode`.
  2. **Security & Cryptography:** Host ID, Host Epoch, Authoritative Seq, Receiver Last Seq, and ECDSA Host Public Key Fingerprint.
  3. **WebRTC Mesh & ICE Candidate Pairs:**
     - Peer Connection State: `new` → `connecting` → `connected`.
     - ICE Connection State: `checking` → `connected` / `completed`.
     - Selected Candidate Pair: `local_type → remote_type` (e.g. `host → host`, `srflx → srflx`, or `relay → relay`).
     - Relay Indicator: Shows `🟢 TURN RELAY` when traffic is relayed through TURN, or `⚪ DIRECT / STUN` when direct P2P.
  4. **Copy JSON:** 1-click clipboard export of telemetry for side-by-side device verification.

---

## 5. Numbered Testing Procedures

### SECTION A — Room Management & Presence

#### Test A.1: Room Creation
1. On **Device A (Host)**, navigate to the deployed app URL.
2. Enter nickname (e.g. `HostAlice`) and choose an avatar. Click **Create Room**.
3. **Verify:**
   - URL updates to `/room/[20-character-id]`.
   - Header displays the room ID and a green **Connected** badge.
   - Host crown icon appears next to `HostAlice (you)`.
   - Open Diagnostics (`Ctrl+Shift+D`); verify `Role: Host 👑`, `Host Epoch: 1`, `Authoritative Seq: 0`.

#### Test A.2: Guest Joining via Invitation Link
1. On Device A, click the **Copy Invitation Link** button.
2. Send or open the invitation URL on **Device B (Guest)**.
3. On Device B, enter nickname (e.g. `GuestBob`) and click **Join Room**.
4. **Verify:**
   - Both devices immediately show both avatars in the header presence list.
   - Device B header displays `Host: HostAlice`.
   - Open Diagnostics on Device B; verify `Role: Guest`, `Host ID` matches Device A's User ID.

#### Test A.3: Host Refresh & Cryptographic Recovery
1. On Device A, refresh the browser page (`Cmd+R` / `F5`).
2. **Verify:**
   - Page reloads and automatically re-attaches to the room without throwing an error.
   - Device A retains the host crown (`HostAlice (you)`).
   - In Diagnostics on Device A: `Non-Extractable Key: Active in Memory` and public key fingerprint matches the previous session (retrieved from IndexedDB `HostKeyStore`).
   - Device B continues to show Device A in presence without disconnect flickering.

#### Test A.4: Guest Refresh & Sequence Baseline Recovery
1. On Device B, refresh the browser page.
2. **Verify:**
   - Device B rejoins smoothly.
   - In Diagnostics on Device B: `Receiver Last Seq` restores to the authoritative baseline from database state, preventing playback sequence replay.

#### Test A.5: Temporary Network Drop & Reconnect
1. On Device B, temporarily toggle Wi-Fi / Airplane Mode off for 8 seconds, then turn it back on.
2. **Verify:**
   - Device B status transitions from `Connected` → `Reconnecting…` → `Connected`.
   - Presence auto-heals; Device A still sees Device B once reconnected.

#### Test A.6: Host Transfer
1. On Device A, open the **Room** tab in the side panel.
2. In the Members list next to `GuestBob`, click the **Crown (Transfer Host)** button.
3. Confirm transfer in the prompt.
4. **Verify:**
   - Device B immediately gains the crown (`Host: GuestBob (you)`).
   - Device A loses the crown (`Host: GuestBob`).
   - In Diagnostics on both devices: `Host Epoch` increments from `1` to `2`, and `Authoritative Seq` resets to `0`.
   - Device A's old private key can no longer issue valid playback commands.

---

### SECTION B — Playback Synchronization

#### Public Test Media URLs:
- **Direct MP4 Stream:** `https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4`
- **HLS (.m3u8) Adaptive Stream:** `https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8`

#### Test B.1: Video Source Loading
1. On Device B (now Host, or transfer back to Device A), enter one of the test URLs into the **Video Source** input.
2. Click **Load Stream**.
3. **Verify:**
   - Both Device A and Device B load the video player simultaneously.
   - Video title and duration render identically on both screens.

#### Test B.2: Synchronous Play & Pause
1. On Host, click **Play**.
2. **Verify:** Both video players start playing simultaneously. Time drift should remain under 200 milliseconds.
3. On Host, click **Pause**.
4. **Verify:** Both video players immediately freeze on the exact same frame.
5. In Diagnostics, verify `Authoritative Seq` increments with each playback action.

#### Test B.3: Seeking Forward and Backward
1. On Host, drag the seek bar to `01:30` (or jump 30s forward).
2. **Verify:**
   - Both devices seek immediately to `01:30`.
   - No "seek echo" loops occur (Host is not re-seeked by its own broadcast).

#### Test B.4: Late Joiner Catch-Up
1. While video is playing on Device A and Device B, open a third browser or private window on Device B to join as `LateGuest`.
2. **Verify:**
   - `LateGuest` automatically receives the active video source, current play state (`playing: true`), and current playback time (`currentTime`).
   - Video starts playing on `LateGuest` aligned with the other participants.

#### Test B.5: Host-Only Playback Enforcement
1. On Host, in the Room tab, toggle **Host controls playback** to **ON**.
2. On Guest, attempt to click Play or Seek on the video player.
3. **Verify:**
   - Guest cannot override playback.
   - Player controls for non-hosts indicate playback is restricted to the host.
   - Any forged client broadcast from Guest is rejected by receiver signature checks and database RLS.

---

### SECTION C — Social Features & Interactive Anime Games

#### Test C.1: Real-Time Chat & Spoiler Tags
1. On Device A, open the **Chat** tab and send: `"Episode 4 was incredible!"`
2. **Verify:** Message arrives on Device B within < 100ms.
3. On Device B, type: `||Major plot twist: the mentor is the villain!||` and send.
4. **Verify:** Message arrives on Device A with a blurred spoiler overlay. Clicking the overlay reveals the text.

#### Test C.2: Real-Time Typing Beacons
1. On Device B, begin typing in the chat input without pressing send.
2. **Verify:** Device A displays `"GuestBob is typing..."` above the chat bar.
3. Stop typing; verify the indicator disappears after 3 seconds.

#### Test C.3: Floating Emoji Reactions & Fullscreen Popups
1. On Device B, click the 🔥 and 🌸 reaction buttons on the ReactionBar.
2. **Verify:** Floating animated reaction sprites drift upward on Device A's stage.
3. Put Device A into **Fullscreen** (`F` key or Fullscreen icon).
4. Send a chat message from Device B.
5. **Verify:** A translucent chat notification toast appears on Device A inside the fullscreen viewport.

#### Test C.4: Shared Watchlist & Timestamped Moments
1. In the **Watchlist** tab on Device A, add `"Frieren: Beyond Journey's End"`, status `Watching`, episode `10`.
2. **Verify:** Watchlist item appears on Device B.
3. Play video to `00:45`. In the **Moments** tab on Device B, click **Bookmark Moment** with note: `"Epic battle scene"`.
4. On Device A, seek video away to `02:00`.
5. In the Moments tab on Device A, click the saved moment bookmark.
6. **Verify:** Video immediately jumps back to `00:45`.

#### Test C.5: 3-2-1 Synchronized Countdown
1. On Host, click the **3-2-1 Countdown** button.
2. **Verify:** Both screens display a cinematic countdown overlay: `3` → `2` → `1` → `Play!`. Video resumes synchronously on `0`.

#### Test C.6: Anime Bingo (Cooperative & Competitive Modes)
1. In the **Games** tab, select **Anime Bingo**.
2. **Cooperative Mode Test:**
   - Host starts a Cooperative game.
   - Device A and Device B see the exact same 5x5 trope card.
   - Device A clicks square `(0, 0)`. Verify it marks on Device B.
3. **Competitive Mode Test:**
   - Host clicks **Reset / New Game** and selects **Competitive**.
   - Device A and Device B receive different, randomly shuffled 5x5 boards.
   - Device A marks squares along Row 0 to complete 5-in-a-row.
   - Device A clicks **Claim Bingo!**.
   - **Verify:** Victory celebration triggers, server awards 25 points to Device A.
   - Device B attempts to claim bingo on an incomplete board; verify claim is rejected.

#### Test C.7: Episode Predictions
1. In the **Games** tab, select **Predictions**.
2. Host clicks **Create Prediction**:
   - Question: `"Will the hero use the forbidden technique?"`
   - Option A: `"Yes"`, Option B: `"No"`
   - Reward: `20` points.
3. On Device A, select `"Yes"`. On Device B, select `"No"`.
4. **Privacy Lock Test:**
   - Verify before reveal, Device A sees its own choice (`Yes`), but Device B's vote shows only as `🔒 Submitted`.
5. Host clicks **Lock Submissions**. Verify neither participant can modify their vote.
6. Host clicks **Reveal Answers**. Verify both votes become visible to everyone.
7. Host clicks **Resolve** and selects `"Yes"`.
8. **Verify:** Device A is awarded +20 points on the room leaderboard; Device B receives 0. Double-resolution attempts are blocked by the database.

---

### SECTION D — WebRTC Audio, Video, Screen Sharing & NAT Traversal

#### Test D.1: WebRTC Voice Chat (Microphone)
1. On Device A, in the Media Dock, click **Unmute Mic**. Grant browser permission when prompted.
2. On Device B, verify remote audio is heard clearly through speakers/headphones.
3. Open Diagnostics HUD (`Ctrl+Shift+D`) on Device B:
   - Verify `webrtcPeers` shows Device A with `connectionState: connected` and `iceConnectionState: connected` (or `completed`).

#### Test D.2: WebRTC Webcam Video
1. On Device B, click **Start Camera**. Grant permission.
2. **Verify:** Device B's webcam video stream appears in the MediaDock on Device A.

#### Test D.3: WebRTC Screen Sharing
1. On Device A (Desktop/Laptop), click **Share Screen**.
2. Select an application window or screen.
3. **Verify:**
   - Device B's main stage automatically switches from Video Player to **Screen View**.
   - The shared desktop renders at full resolution on Device B with low latency.
   - When Device A clicks **Stop Sharing**, Device B automatically returns to the video player.

#### Test D.4: Cross-Network NAT Traversal (Wi-Fi vs Cellular)
> [!TIP]
> This test explicitly validates whether WebRTC traverses symmetric NATs via TURN.
1. Connect **Device A to Home Wi-Fi** and **Device B to Mobile Hotspot / Cellular 4G/5G**.
2. Start Mic or Camera on both devices.
3. Open the Diagnostics HUD (`Ctrl+Shift+D`) on both devices:
   - Check the **WebRTC Mesh & ICE Candidate Pairs** card.
   - Inspect the candidate types:
     - If both devices were on the same Wi-Fi, you would see: `host → host` (Direct LAN).
     - Across Wi-Fi and Cellular with open NAT, you might see: `srflx → srflx` (STUN).
     - Across strict Symmetric NAT (cellular carriers like AT&T, Verizon, Jio, Vodafone), you will see:
       - **Local Candidate:** `relay`
       - **Remote Candidate:** `relay`
       - **Badge:** `🟢 TURN RELAY`
4. **Verify:** Audio and video stream reliably without dropping packets even though direct peer-to-peer UDP is blocked by the mobile carrier.

---

### SECTION E — Edge Cases & Recovery

#### Test E.1: Unclean Host Disconnect & Automatic Migration
1. With video playing between Device A (Host) and Device B (Guest), abruptly close Device A's browser window.
2. On Device B, observe the presence list:
   - Within 15–20 seconds, the heartbeat monitor detects the host is absent.
   - Device B's client automatically invokes the `claim_host` RPC.
   - Device B promotes itself to Host (`Host: GuestBob (you)`), incrementing the epoch.
3. On Device B, verify full host playback and game management controls are active.

#### Test E.2: Room Expiration
1. Manually set `expires_at = now() - interval '1 minute'` in the database for the test room (or wait for the 24-hour TTL).
2. Attempt to perform an action on either device.
3. **Verify:** Application displays `"This room has expired."` banner and rejects further updates.

---

## 6. Two-Device Verification Checklist & Sign-Off

Use this checklist during physical device testing:

| Test Item | Device A (Host) | Device B (Guest) | Telemetry HUD Check | Sign-Off |
|---|---|---|---|---|
| Room Creation & Presence | Initialized as Host | Joined as Guest | Both peers listed in HUD | [ ] |
| Cryptographic Host Token & Key | Non-extractable key in memory | Verified Host public key | `hasPrivateKey: true` on Host only | [ ] |
| Video Sync: Play / Pause | Host plays/pauses | Syncs < 200ms | `hostSeq` increments monotonically | [ ] |
| Video Sync: Seeking | Seeks to 01:30 | Seeks to 01:30 | Zero re-seek loops | [ ] |
| Host-Only Enforcement | Controls active | Controls restricted | Unauthorized actions rejected | [ ] |
| Chat & Typing Indicators | Sends/receives message | Typing beacon displays | Message received < 100ms | [ ] |
| Floating Reactions & FX | Sprites render | Sprites render | Realtime reaction channel verified | [ ] |
| Anime Bingo (Co-op & Competitive) | Boards synced | Win validated by server | Score points awarded in DB | [ ] |
| Episode Predictions | Answers locked | Answers revealed | Points awarded on leaderboard | [ ] |
| WebRTC Voice & Webcam | Mic/Cam streaming | Mic/Cam receiving | `iceConnectionState: connected` | [ ] |
| WebRTC Screen Share | Shares screen | Stage auto-switches | High-resolution screen rendering | [ ] |
| Cross-Network TURN Traversal | On Wi-Fi | On Cellular 4G/5G | `🟢 TURN RELAY` active in HUD | [ ] |
| Host Departure & Claim | Disconnects | Promoted to Host | `hostEpoch` increments in HUD | [ ] |
