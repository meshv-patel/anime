# 🌸 Anime Together

A private watch-party web app for you and a few friends: synced playback, chat, reactions, shared watchlist, and optional screen sharing / voice / webcam. React + TypeScript + Vite + Tailwind, with Supabase Realtime for live mode. No always-on server.

> **Honesty note.** This project was built in a sandbox with no real browser and no Supabase project. What was and was not verified is listed under [Verification](#verification). Please run the [testing checklist](#testing-checklist) before relying on it.

## Quick start (Local Demo Mode, no keys)

```bash
npm install
npm run dev          # http://localhost:5173
npm run build        # production build -> dist/
npm run test:sync    # headless test of the playback-sync logic
```

With no `.env`, the app runs in **Local Demo Mode**: rooms, sync, chat, reactions, watchlist and screen share work **between tabs of the same browser on the same device** (BroadcastChannel). It is **not** cross-device realtime. A badge in the UI always shows which mode is active.

Try it: create a room, copy the invitation link, open it in a second tab (use a different nickname), load an MP4 URL or pick the same local file in both tabs.

## Live Mode (Supabase)

1. Create a free project at supabase.com.
2. **Authentication → Providers → enable "Anonymous sign-ins"** (people join with just a nickname).
3. SQL editor → paste and run `supabase/schema.sql`.
4. Copy `.env.example` to `.env` and fill `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (Project settings → API → *anon public* key). **Never use the service-role key in this app.**
5. `npm run dev`. The badge should read "Live mode · Supabase".

If realtime does not connect, first try `VITE_REALTIME_PRIVATE=false` to see whether the private-channel policies are the problem (public channels rely on the unguessable room ID only).

### How security works
- Room IDs: 20 chars of base32 from `crypto.getRandomValues` (100 bits).
- Rooms, members, watchlist and moments are protected by RLS; room/host/membership changes happen only via `security definer` RPCs (`create_room`, `join_room`, `transfer_host`, `claim_host`, ...). Capacity (default 6) and 24h expiry are enforced server-side in `join_room`.
- The **host is stored in the database**, not trusted from clients. Automatic reassignment: if the host's heartbeat is >30s stale, the longest-present member can `claim_host`.
- With `VITE_REALTIME_PRIVATE=true` the Realtime channel `room:<id>` is private: only room members may send or receive (policies on `realtime.messages`).
- Chat and playback events are validated and rate-limited on receive; sender identity comes from Presence, not from message payloads.

## Deployment (Cloudflare Pages, free)

1. Push the project to GitHub (`.env` is git-ignored).
2. Cloudflare Pages → Create project → connect repo. Build command `npm run build`, output directory `dist`.
3. Add environment variables (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, optional `VITE_TURN_*`). They are baked in at build time.
4. `public/_redirects` already provides SPA routing. Netlify and Vercel (add a rewrite to `/index.html`) also work.
5. The site is served over HTTPS, which screen sharing / mic / camera require.

## Features and honest status

| Area | Status |
|---|---|
| Landing page, create/join flow, avatar picker, invite link | Implemented |
| Unguessable room IDs, 6-person limit, 24h expiry | Implemented (Live: server-enforced; Demo: expiry only) |
| Media: direct MP4, HLS (hls.js / native Safari), per-viewer local file | Implemented |
| Sync: play, pause, seek, source change, late joiners, drift correction, status badge, host-only mode, host transfer, auto host reassignment | Implemented; core logic covered by `npm run test:sync`; not browser-tested |
| Reconnection | Supabase client reconnects and re-tracks presence; app re-requests state. Not tested under real network loss |
| Chat: realtime, avatars, timestamps, typing, join/leave notices, unread counter, collapse, optional sound, spam limits, spoiler messages, discussion prompts | Implemented |
| Fullscreen chat toasts (rendered inside the fullscreen stage element), duration/disable settings | Implemented; not browser-tested |
| Reactions (10 emoji, floating + nickname, special scenes for 😭 👑 🔥 🎉 💀 ❤️, rate limits) | Implemented; not browser-tested |
| Synced 3-2-1 countdown | Implemented (each client counts locally; initiator resumes) |
| Shared watchlist with progress, saved moments (click to seek) | Implemented (Live: Supabase tables; Demo: localStorage) |
| Screen sharing (WebRTC, signaling over Supabase Broadcast, STUN + optional TURN, end detection, indicator, view switch, fullscreen) | Implemented; **not tested across two devices** |
| Voice chat, webcam | Implemented on the same WebRTC mesh; **untested** |
| Theater mode | Implemented |
| Recently watched (landing) | Implemented (this browser only) |
| Fūrin (風鈴) Japanese wind chime & global button sound | Implemented (Web Audio API synthesis, local-only, all button interactions, mute toggle) |
| Japanese Seasonal Atmosphere (四時の気配) | Implemented (Spring, Summer, Autumn, Winter + Auto Tokyo Calendar, particle effects, reduced-motion) |
| Ema Wish Board (絵馬) | Implemented (Traditional wooden plaques, 4 wood finishes, 4 categories, author-only delete, RLS protected) |
| Anime bingo, episode predictions | Implemented (Board generation, card state, sync, predictions betting/points) |
| AI companion | **Not implemented.** Only the interface in `src/ai/companion.ts` |
| Watch history table, profiles table | Not implemented (profile and history live in localStorage) |

## Screen sharing, voice and webcam

- Uses `getDisplayMedia` / `getUserMedia` and a full-mesh of `RTCPeerConnection`s with "perfect negotiation". Only signaling (`rtc`, `mm` events) goes through Supabase Broadcast; **media never does**. Signaling messages are addressed to a peer but travel on the room channel, so other members' browsers receive them too (they ignore them).
- **HTTPS is required** (localhost is exempt).
- **Browsers:** desktop Chrome/Edge/Firefox/Safari support screen capture. Mobile browsers generally do **not** support `getDisplayMedia`; the UI reports "unsupported". Tab audio capture works mainly in Chromium. Safari/Firefox share video only in most cases.
- **STUN** is preconfigured (`stun.l.google.com`). **TURN** is needed when either side is behind a symmetric NAT or strict firewall. Set `VITE_TURN_URL` (comma-separated allowed), `VITE_TURN_USERNAME`, `VITE_TURN_CREDENTIAL`. Static TURN credentials in a public build are visible to users; for anything beyond friends, mint short-lived credentials from a small backend.
- Mesh scales to a handful of people; bigger rooms would need an SFU.
- One screen share at a time (UI rule). Ending the share via the browser's "Stop sharing" bar is detected. Leaving participants' connections and tracks are cleaned up.
- Voice/webcam/screen failures never affect the synced player; they live in a separate `MediaManager`.

## Japanese Ambient & Personal Atmosphere

- **Fūrin (風鈴) Wind Chime & Global Interaction Sound**: Delicate blown-glass bell synthesized via the Web Audio API on the user's device only. 0 network calls, 0 Supabase RPCs, 0 WebRTC events. Extended globally to all enabled button interactions with duplicate-click protection and disabled-button safety. Right-click, keyboard (`m`/`M`), or room panel to mute.
- **Four Seasonal Themes (四時の気配 — Shiji no Kehai)**:
  - **Haru (春 · Spring)**: Soft sakura pink, warm ivory, drifting cherry blossom petals.
  - **Natsu (夏 · Summer)**: Twilight sky blue, soft festival lantern firefly shimmer, complements the Fūrin.
  - **Aki (秋 · Autumn)**: Warm amber, evening twilight, drifting momiji (Japanese maple) leaves.
  - **Fuyu (冬 · Winter)**: Quiet snow drift, muted blue, warm candlelight contrast.
  - **Automatic Mode**: Follows Japan's seasonal calendar in the `Asia/Tokyo` timezone (March-May: Spring, June-Aug: Summer, Sept-Nov: Autumn, Dec-Feb: Winter).
  - **Zero Network**: Stored in `localStorage` (`at_season`), purely client-side, zero Realtime overhead.
  - **Accessibility**: All particles are `pointer-events: none` and `aria-hidden="true"`. Fully respects `@media (prefers-reduced-motion: reduce)`.
- **Subtle Cultural Expressions (Paired with English)**:
  - *Okaeri* (おかえり · Welcome back) in lobby greeting.
  - *Issho ni* (一緒に · Together) in watchlist empty state.
  - *Omoide* (思い出 · Memories) in moments empty state.
  - *Kizuna* (絆 · Connection) in room membership heading.
  - *Arigatou* (ありがとう · Thank you) in chat empty state.
  - *Mata ne* (またね · See you soon) in room departure action.
- **Responsive Navigation Bar**: Side drawer tabs (Chat, Watchlist, Moments, Ema, Games, Room) feature horizontal overflow scrolling with smooth automatic scrolling to keep selected tabs in view on any viewport.
- **Ema Wish Board (絵馬 — Ema Board)**:
  - **Traditional Shinto Wooden Plaques**: Shared room board where participants hang handwritten wishes, goals, thoughts, and messages.
  - **Authentic Plaque Geometry & Cord Details**: Pentagonal plaque silhouette with traditional red/gold top-hanging cord and kanji corner seals.
  - **4 Wooden Finishes**: *Hinoki* (檜 · Cypress), *Sakura* (桜 · Rosewood), *Matsu* (松 · Pine), and *Kuro* (黒 · Lacquered).
  - **4 Categories**: *Wish* (願 · 願い事), *Dream & Goal* (夢 · 夢や目標), *Gratitude* (感 · 感謝の気持ち), and *Message* (届 · 届けたい言葉).
  - **Security & Authorization**: Row Level Security (RLS) ensures only room members can view plaques (`ema_select`), only authenticated members can insert (`ema_insert`), and **only the plaque author can delete their own plaque** (`ema_delete` checking `author_id = auth.uid()`).
  - **Realtime Sync**: Database is authoritative; clients broadcast a lightweight `'ema'` notification to trigger cache invalidation and re-fetch across the room.
  - **Live Mode Migration**: Run `supabase/migrations/20261121_create_ema_cards.sql` in the Supabase SQL editor to install the table and RLS policies. Demo Mode persists to `localStorage` (`at_ema_<roomId>`).

## Known limitations

- Playback sync uses host heartbeats every 3 s, a 1.2 s seek threshold, and no clock-offset or latency estimation, so expect ~0.2-1 s of looseness. Autoplay policies may require a click ("Tap to join playback").
- **Host-only mode is enforced by honest clients.** Because Broadcast is peer-sent, a malicious *member* could forge events. Non-members cannot, in Live mode with private channels. Treat members as trusted invitees.
- Anyone with the link can join until the room is full or expired; there is no kick/ban or per-invite revocation yet.
- Demo rooms exist only in the creating browser's localStorage; invitations don't work across devices.
- Remote MP4/HLS URLs must allow cross-origin playback. Streaming-service pages (YouTube, Netflix, ...) are intentionally unsupported; the app does not bypass DRM. YouTube is not implemented.
- iPhone Safari does not support element fullscreen, so fullscreen toasts there are untested/likely unavailable.
- Watchlist/moments sync by "refetch on ping"; a missed ping shows up on next reload.
- Bundle includes hls.js (~190 kB gzip), loaded only when an HLS source is used.

## Verification

Done in the build sandbox:
- `npm install`, `tsc --noEmit` (strict) and `npm run build`: succeed.
- `npm run test:sync`: 11 headless checks (source change, play/pause/seek propagation, no echo, drift handling, late joiner, host-only enforcement, unsafe URL rejection) pass using two `LocalTransport` instances and mock players.

**Not done** (no browser, no Supabase project, no second device): rendering/visual review, responsive layouts, real video playback, fullscreen overlays, reaction animations, WebRTC, the SQL schema and RLS against a live database, and reconnection. Treat these as unverified.

## Testing checklist

Demo mode (two tabs, different nicknames):
- [ ] Landing page loads; mobile width looks right
- [ ] Create room → navigates to `/room/<id>`; copy link; open in tab 2 and join
- [ ] Load an MP4 URL: play/pause/seek in tab 1 mirror in tab 2
- [ ] Tab 3 joins late and lands at the current position
- [ ] Local file: choose the same file in both tabs; mismatched size shows a warning
- [ ] Chat both ways, typing indicator, spoiler reveal, prompts, unread badge when panel collapsed
- [ ] Each of the 10 reactions; special scenes for 😭 👑 🔥 🎉 💀 ❤️; spamming is throttled
- [ ] Fullscreen on the player: send a message from tab 2 → toast appears; controls remain usable
- [ ] Host-only mode blocks tab 2 controls; "Make host" works; closing host tab reassigns host after ~20 s
- [ ] Countdown; watchlist add/progress; save moment and click to seek
- [ ] Share screen in tab 1 → tab 2 switches to shared view; stop via browser bar clears it

Live mode (two devices, HTTPS):
- [ ] Schema applied, anonymous sign-in on; create and join across devices
- [ ] A third device is refused when room is full; expired rooms are refused
- [ ] Everything above across devices, plus mic and camera; try with and without TURN on different networks

## Project layout

```
src/realtime   transports (local BroadcastChannel / Supabase), room API (RPC or localStorage)
src/services   syncService (playback sync, no React), roomStore (watchlist/moments)
src/media      mediaManager (WebRTC: mic, cam, screen)
src/hooks      useRoomSession, useChat, useReactions, useVideoElement, useFullscreen, useRoomStore
src/components Stage, ControlBar, Overlays, Chat, Panels, MediaDock, SourceForm ...
src/ai         AI companion interface (not implemented)
supabase       schema.sql (tables, RLS, RPCs, realtime policies)
scripts        sync-selftest.ts
```

## Features still needing development
AI companion, anime bingo, episode predictions, watch-history persistence in Supabase, kick/ban and invite revocation, YouTube/other providers behind the media-source layer, latency-aware sync, SFU for large rooms, short-lived TURN credentials, mobile-fullscreen fallback, automated UI/e2e tests.
