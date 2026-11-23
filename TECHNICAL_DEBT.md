# Anime Together — Technical Debt & Security Audit

**Date:** November 21, 2026  
**Auditor / Lead:** Antigravity Lead Full-Stack Engineering  
**Version:** 0.6.0 (Phase 2.4 Complete: Two-Device Validation Preparation, WebRTC Telemetry HUD & NAT Traversal)

---

## 1. Resolved Security Vulnerabilities & Remediations

### 1.1 Broadcast Secret Eavesdropping & Replay Attack (RESOLVED IN PHASE 2.1)
- **Vulnerability:** In Phase 2, the static `hostToken` was broadcast directly over Supabase Realtime in playback payloads (`auth: hostToken`). Room participants could sniff the token via DevTools or WebSocket frames and replay it to forge playback commands without possessing the host private key.
- **Remediation Implemented:**
  1. **Asymmetric Digital Signatures (ECDSA P-256):** Replaced static tokens with native Web Crypto ECDSA digital signatures. The private key never leaves the host's session storage. Broadcast messages carry only `{ sig, nonce, ts }`.
  2. **Anti-Replay Nonce Cache & Clock Drift Window:** Every command carries an 8-byte cryptographically random nonce and epoch timestamp. Peers enforce a 5-second freshness window and track nonces in memory to reject duplicate or stale commands.
  3. **Server-Side Public Key Registration:** The host registers `host_pubkey` via `register_host_pubkey(p_room, p_pubkey)`. Peers verify signatures using the public key retrieved from the database.
  4. **Adversarial Verification:** 28 automated attack scenarios in `scripts/adversarial-security-test.ts` verify rejection of spoofed, tampered, stale, and duplicate messages.

### 1.2 Unearned Bingo Win & Competitive Board Theft (RESOLVED IN PHASE 2.1)
- **Vulnerability:** In `supabase/schema.sql`, `claim_bingo_win` verified that the game was active, but failed to verify that the board actually had a completed line. Any participant could claim an unearned win on an empty board. It also failed to check board ownership in competitive mode.
- **Remediation Implemented:**
  1. **Authoritative Line Verification:** Added PostgreSQL helper `public.has_bingo_line(p_board)` checking all 12 win lines (5 rows, 5 columns, 2 diagonals) with center free space inclusion.
  2. **Competitive Board Ownership:** Enforced `if g.mode = 'competitive' and (b.user_id is null or b.user_id <> auth.uid()) then raise exception`.
  3. **Row Locks:** Added `for update` row-level locks on `bingo_games`.

### 1.3 Prediction Double Resolution & Locked Answer Tampering (RESOLVED IN PHASE 2.1)
- **Vulnerability:** `resolve_prediction` permitted duplicate resolution calls, causing points to be awarded multiple times. `submit_prediction_answer` did not check if an answer had already been locked.
- **Remediation Implemented:**
  1. Added guard `if pred.status = 'resolved' then raise exception 'Prediction is already resolved'` with `for update` row lock.
  2. Added check rejecting updates if `existing_ans.locked` is `true`.

### 1.4 WebRTC ICE Candidate Arrival Race Condition (RESOLVED IN PHASE 1)
- **Remediation:** Added `candidateQueue: RTCIceCandidateInit[]` buffer on each `PeerState` in `src/media/mediaManager.ts`. Candidates received before `setRemoteDescription` are buffered and flushed once remote descriptions are set.

### 1.5 `import.meta.env` Crash in Test/Node Environments (RESOLVED IN PHASE 1)
- **Remediation:** Safe environment accessor in `src/lib/env.ts` checking `import.meta.env` first and falling back to `process.env`.

### 1.6 Post-Refresh Replay Vulnerability & Sequence Recovery (RESOLVED IN PHASE 2.3)
- **Vulnerability:** If a receiver's JavaScript memory was wiped (e.g. by refreshing the browser tab or soft reconnecting), sequence tracking was reset to 0. An attacker who captured a valid playback command could replay it within its 5-second timestamp window. Since the receiver had no established baseline, `seq > 0` was accepted, reverting the participant to an outdated playback state.
- **Remediation Implemented:**
  1. **Persistent Sequence Recovery:** Implemented `initSequenceBaseline` and `loadStoredSeq` in `src/lib/security.ts`. Tab refreshes restore the last verified sequence from `sessionStorage` (`at_peer_seq_${roomId}_${epoch}`).
  2. **Authoritative Room Baseline:** Added `host_seq int not null default 0` to `public.rooms`. Joining or reconnecting receivers initialize `lastSeq` to the highest value between session storage and authoritative database/store state (`info.hostSeq` / `info.playbackState.seq`).
  3. **Zero Trust on Initial Broadcast:** Receivers never trust incoming broadcast messages to establish their sequence baseline. Any packet with `seq <= lastSeq` is dropped.
  4. **Host/Peer Storage Decoupling:** Separated host outgoing counters (`at_host_seq_...`) from peer incoming verifiers (`at_peer_seq_...`), preventing counter collisions in multi-tab or single-process testing.
  5. **Adversarial Verification:** Added Section [10] in `scripts/adversarial-security-test.ts` verifying refresh replay rejection, epoch invalidation on host transfer, and cross-room sequence isolation.

### 1.7 WebRTC Observability, Telemetry & Relay Visibility (IMPLEMENTED IN PHASE 2.4)
- **Problem:** When testing WebRTC between two separate devices or across mobile networks, black-box failure modes (silent audio drops, peer connections stalling in `checking`, or falling back to high-latency paths) made troubleshooting impossible without opening browser internal flags (`chrome://webrtc-internals`). Furthermore, testers had no way to know whether their active connection was direct P2P (via STUN) or relayed through a TURN server.
- **Remediation Implemented:**
  1. **Candidate Pair & Stats Telemetry:** Enhanced `MediaManager.getDiagnostics()` in `src/media/mediaManager.ts` to query `RTCPeerConnection.getStats()`, extracting the active nominated candidate pair (`localCandidateType`, `remoteCandidateType`, and `isRelay`).
  2. **Developer Diagnostics Overlay:** Built `DiagnosticsOverlay` (`Ctrl+Shift+D` or header Activity icon), rendering real-time ICE connection states, candidate types (`host`, `srflx`, `relay`), live byte counters, and a visible `🟢 TURN RELAY` status badge.
  3. **Sanitized JSON Telemetry Export:** 1-click clipboard export of non-sensitive diagnostic state for side-by-side device verification during manual audits.
  4. **Zero-Secret Disclosure:** Verified that private keys, host tokens, and TURN credentials are never exposed or rendered in the telemetry UI.

---

## 2. Documented Remaining Limitations & Architectural Trade-offs

### 2.1 WebRTC NAT Traversal & Physical Testing Prerequisites (DOCUMENTED IN PHASE 2.4)
- **Status:** Requires production deployment credentials and HTTPS hosting.
- **Detail:** In local and default demo modes, Google's public STUN server (`stun:stun.l.google.com:19302`) is utilized. While sufficient for loopback, same-LAN, and open NAT topologies, WebRTC between two separate devices over symmetric NAT (cellular 4G/5G data, carrier-grade NAT [CGNAT], university eduroam, and enterprise firewalls) requires a TURN relay server configured in `.env` (`VITE_TURN_URL`, `VITE_TURN_USERNAME`, `VITE_TURN_CREDENTIAL`).
- **Symmetric NAT Failure Mode:** Symmetric NAT allocates a unique external port for every distinct destination IP/port. The port discovered via STUN is invalid for the remote peer, causing direct peer-to-peer UDP packet drops and `iceConnectionState: 'failed'`.
- **Relay Solution:** When a TURN relay is configured, `MediaManager` routes media through the relay server, and `DiagnosticsOverlay` indicates `🟢 TURN RELAY (relay → relay)`.
- **Physical Testing Prerequisite:** Testing on two physical devices requires deploying the build to an HTTPS-enabled host (e.g. Vercel, Netlify, or Ngrok tunnel) and providing valid Supabase and TURN credentials as detailed in `MANUAL_TESTING_GUIDE.md`.

### 2.2 Local Demo Mode Storage Inspection
- **Status:** Inherent to browser `localStorage`.
- **Detail:** In Local Demo Mode, all data is stored unencrypted in the browser's `localStorage`. While answer masking is enforced in code by `getPredictionAnswers`, a user opening DevTools → Application → Local Storage in the same browser profile can inspect raw values. In Supabase Live Mode, this is strictly prevented by PostgreSQL RLS (`pred_ans_select`), where the database engine refuses to return unrevealed answers across the network.

### 2.3 CORS & Video Stream Headers
- **Status:** External server restriction.
- **Detail:** HLS (.m3u8) video streaming requires the remote video host to supply standard `Access-Control-Allow-Origin: *` headers. Streams hosted without CORS headers cannot be played due to browser security sandboxing.

### 2.4 Device Clock Skew Limit
- **Status:** Protocol constraint (+/- 5000ms).
- **Detail:** Playback commands require synchronization within +/- 5 seconds of UTC epoch time. If a participant's device clock is desynchronized by more than 5 seconds, commands are rejected as stale or future-dated. Standard NTP synchronization on client devices satisfies this requirement.

---

## 3. Code Smells & Refactoring Candidates

### 3.1 AudioContext Autoplay Warning
- **Location:** `src/hooks/useChat.ts`
- **Observation:** `audioCtx` is initialized on first message notification. In browsers with strict autoplay policies, this produces a console warning if no prior user gesture occurred.
- **Plan:** Resume AudioContext on first intentional click in the chat input or UI.

### 3.2 Granular Postgres Change Subscriptions
- **Location:** `src/services/gamesStore.ts`, `src/services/roomStore.ts`
- **Observation:** Watchlist and moments updates use broadcast ping invalidations (`wl`, `mom`) to prompt a refetch.
- **Plan:** In Phase 4, subscribe directly to Supabase Realtime Postgres Changes (`postgres_changes`) for optimistic single-row updates.
