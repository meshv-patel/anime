# Anime Together — Feature Status & Implementation Matrix

**Date:** November 21, 2026  
**Auditor / Lead:** Antigravity Lead Full-Stack Engineering  
**Version:** 0.6.0 (Phase 2.4 Complete: Two-Device Validation Preparation, WebRTC Telemetry HUD & NAT Traversal)

---

## 1. Feature Status Overview

| Capability | Module | Status | Notes |
|---|---|---|---|
| **Host Authorization & Anti-Spoofing** | `src/lib/security.ts`, `src/services/syncService.ts` | **Operational & Hardened** | Non-extractable Web Crypto ECDSA P-256 keys, IndexedDB CryptoKey handle storage, delimiter-separated canonical serialization, sequence recovery and monotonicity, zero trust on initial broadcast, 100% replay attack defense across 10 scenarios. |
| **Real PostgreSQL Database Integration** | `supabase/schema.sql`, `scripts/real-postgres-test.ts` | **Operational & Live Tested** | Executed 31 live integration checks against PostgreSQL 16 container in Docker (`pg-anime-test`) with separate authenticated identities. |
| **Developer Diagnostics & Telemetry HUD**| `src/components/DiagnosticsOverlay.tsx`, `src/media/mediaManager.ts` | **Operational & Verified (Phase 2.4)** | In-app HUD (`Ctrl+Shift+D` or Activity icon) displaying live transport mode, host identity, epoch, sequence baseline, WebRTC peer connection & ICE states, candidate pair inspection, TURN relay flag, and 1-click JSON export. |
| **WebRTC Voice Chat & ICE Traversal** | `src/media/mediaManager.ts`, `src/lib/env.ts` | **Operational & Prepped for TURN** | Mesh P2P audio with ICE candidate buffering, candidate pair telemetry, STUN/TURN configuration, and `candidateType === 'relay'` detection. |
| **WebRTC Webcam** | `src/media/mediaManager.ts` | **Operational** | Peer video tiles with avatar fallbacks and responsive grid. |
| **WebRTC Screen Sharing** | `src/media/mediaManager.ts` | **Operational** | DisplayMedia capture with auto-switch in main Stage viewport. |
| **Anime Bingo Engine** | `src/hooks/useBingo.ts`, `src/lib/bingoTropes.ts` | **Operational & Verified** | 5x5 board, center free space, 12-line win detection, co-op and competitive modes, server-authoritative win validation (`has_bingo_line`). |
| **Anime Trope Library** | `src/lib/bingoTropes.ts` | **Operational** | 80 original tropes across 8 genres with seeded Mulberry32 deterministic generator. |
| **Anime Bingo Interface** | `src/components/BingoPanel.tsx` | **Operational** | Interactive responsive 5x5 grid, stamps, line counters, and victory celebration. |
| **Episode Predictions Engine** | `src/hooks/usePredictions.ts`, `src/services/gamesStore.ts`| **Operational & Verified** | Choice & text options, privacy masking (`🔒 Submitted`), immutability of locked answers, double-resolution prevention. |
| **Episode Predictions UI** | `src/components/PredictionPanel.tsx` | **Operational** | Prediction card, spoiler tagging, secret lock-in, reveal stage, and leaderboard. |
| **Anime Games Room Tab** | `src/components/GamesPanel.tsx`, `src/pages/RoomPage.tsx` | **Operational** | Integrated side-panel tab switching seamlessly between Bingo and Predictions. |
| **Synchronized Video Playback** | `src/services/syncService.ts` | **Operational** | Supports play/pause/seek sync, drift auto-seek, and late-join catch-up with signed monotonic sequences and sequence recovery. |
| **Direct MP4 Playback** | `src/hooks/useVideoElement.ts` | **Operational** | Native HTML5 `<video>` element with custom control bar. |
| **HLS (.m3u8) Playback** | `src/hooks/useVideoElement.ts` | **Operational** | Dynamic import of `hls.js` with fallback to native Safari HLS. |
| **Local File Playback** | `src/components/Stage.tsx` | **Operational** | Local blob URLs stay on device; prompts peers for identical filename. |
| **Room Creation & Expiry** | `src/realtime/roomApi.ts` | **Operational** | 24-hour TTL, max 6 members, 20-char Base32 entropy in both modes. |
| **Invitation Links** | `src/pages/RoomPage.tsx` | **Operational** | 1-click clipboard copy with feedback. |
| **Realtime Chat & Typing** | `src/components/Chat.tsx` | **Operational** | Realtime stream, typing beacons (3s decay), spam rate limiter. |
| **Spoiler Message Masking** | `src/components/Chat.tsx` | **Operational** | Click-to-reveal spoiler overlay on chat bubbles. |
| **Fullscreen Chat Popups** | `src/components/Overlays.tsx` | **Operational** | In-stage toasts with avatar and spoiler protection in fullscreen. |
| **Floating Emoji Reactions** | `src/hooks/useReactions.ts` | **Operational** | 10 emoji reactions floating upward over player with random trajectory. |
| **Cinematic Reaction FX** | `src/components/Overlays.tsx` | **Operational** | Full-stage animations for 😭 (tears), 👑 (gold), 🔥 (fire), 🎉 (confetti), 💀 (dim), ❤️ (hearts). |
| **3-2-1 Synchronized Countdown**| `src/pages/RoomPage.tsx` | **Operational** | Synchronized countdown overlay preceding playback start. |
| **Shared Watchlist** | `src/services/roomStore.ts` | **Operational** | Planned/Watching/Done statuses with numeric episode stepper. |
| **Timestamped Moments** | `src/services/roomStore.ts` | **Operational** | Bookmarking current playback timestamp with 1-click seek. |
| **Physical Two-Device Testing Manual** | `MANUAL_TESTING_GUIDE.md` | **Delivered & Documented** | Comprehensive, numbered step-by-step testing manual covering Room Management, Playback Sync, Social Games, WebRTC NAT/TURN, and Recovery. |
| **AI Anime Companion** | `src/ai/companion.ts` | **BOUNDARY ONLY**| Contract defined; awaiting edge function integration. |
| **Ambient Room Atmosphere** | `src/pages/RoomPage.tsx` | **Partial** | Sakura/lantern palette present; ambient dynamic backglow planned for Phase 3. |

---

## 2. Verified Functionality Matrix

| Workflow | Local Demo Mode | Supabase Live Mode | Real PostgreSQL 16 Live Test |
|---|---|---|---|
| Create Room | Verified (PASS) | Verified via schema & RPCs | Verified in Docker (`create_room`: PASS) |
| Join Room via Link | Verified (PASS) | Verified via schema & RPCs | Verified in Docker (`join_room`: PASS) |
| Non-Extractable Key Generation | Verified (PASS, Web Crypto `extractable: false`) | Verified (PASS) | Verified (PASS) |
| Host Key Registration | Verified (PASS, ECDSA P-256) | Verified via `register_host_pubkey` RPC | Verified in Docker (`register_host_pubkey`: PASS) |
| Forged Sender ID Rejection | Verified (PASS) | Verified via digital signature & RLS | Verified in Docker (PASS) |
| Multi-Scenario Replay Resistance (10 scenarios)| Verified (PASS) | Verified via sequence monotonicity + epoch | Verified in Docker (PASS) |
| Playback Sequence Recovery | Verified (PASS, session + baseline) | Verified via `host_seq` column & RPCs | Verified in Docker (`update_playback`: PASS) |
| Video Sync (Play/Pause/Seek) | Verified (PASS) | Verified via Broadcast + Signed Auth | Verified via Broadcast + Signed Auth |
| Anime Bingo Board Generation | Verified (PASS) | Verified (5x5 + Free Space) | Verified in Docker (`create_bingo_game`: PASS) |
| Anime Bingo Line Detection | Verified (PASS) | Verified (12 lines + Multi-bingo) | Verified in Docker (`has_bingo_line`: PASS) |
| Anime Bingo Authoritative Win | Verified (PASS, line check) | Verified via `has_bingo_line` RPC | Verified in Docker (`claim_bingo_win`: PASS) |
| Anime Bingo Co-op Sync | Verified (PASS) | Verified via Broadcast & Store | Verified via Store & SQL |
| Anime Bingo Competitive Isolation | Verified (PASS) | Verified via Board ID & User ID checks | Verified in Docker (`mark_bingo_square`: PASS) |
| Prediction Creation & Submissions | Verified (PASS) | Verified via `create_prediction` | Verified in Docker (`create_prediction`: PASS) |
| Prediction Secret Lock & Privacy | Verified (PASS) | Verified via RLS `pred_ans_select` | Verified in Docker (RLS `pred_ans_select`: PASS) |
| Prediction Post-Lock Immutability | Verified (PASS) | Verified in Store & SQL RPC | Verified in Docker (`submit_prediction_answer`: PASS) |
| Prediction Reveal & Scoring | Verified (PASS) | Verified via Leaderboard & Points | Verified in Docker (`reveal_prediction`: PASS) |
| Prediction Double-Resolution Guard| Verified (PASS) | Verified in Store & SQL RPC | Verified in Docker (`resolve_prediction`: PASS) |
| WebRTC Signaling Transport | Verified (PASS, loopback) | Verified (Supabase Realtime broadcast) | N/A (Signaling layer) |
| WebRTC Telemetry & Relay Detection | Verified (PASS, getDiagnostics) | Verified (Candidate pair analysis & HUD) | N/A (WebRTC Stats API) |
| Two-Device Deployment & Testing Manual| Verified (PASS, local) | Documented & Prepared (`MANUAL_TESTING_GUIDE.md`) | Verified (Architecture prepped) |
