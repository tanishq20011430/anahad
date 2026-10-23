# Anahad

**Free music discovery and streaming from multiple open sources — with zero configuration and a premium playback engine.**

No accounts. No API keys. No database. No ads. No tracking. Deploy anywhere and it just works.

Anahad streams genuinely playable music from **five verified keyless sources**: **YouTube** (search via community Piped relays, playback through the official YouTube IFrame Player), **Audius** (official open API, full-length tracks), **Radio Browser** (the open live-radio directory), the **Openverse** API (full-length Creative Commons tracks from Jamendo, Wikimedia Commons and Freesound) and **Mixcloud** (keyless search + official widget). The Internet Archive integration was removed in v3 by choice, to focus the app on music-first catalogs.

---

## Features

| Area | What you get |
|---|---|
| **Multi-source search** | One search box across YouTube, Audius, live radio, CC catalogs and Mixcloud — per-source queries so one slow or down source never blocks the others; honest per-source degradation notices; filters by genre and language |
| **Streaming engine** | Native HTML5 `<audio>` streaming with a MediaSource (MSE) progressive pipeline for CORS+Range-verified MP3 hosts, automatic per-host fallback, buffering indicators, buffered-range shading on the seek bar — plus a hidden **official YouTube IFrame transport** driven by the app's own controls |
| **Next-track preloading** | Metadata resolved early; for CORS-verified hosts a ~256 KB leading slice is buffered into RAM; for YouTube the next video is **cued in a second hidden official player** and promoted at track end for an instant continue |
| **Temporary audio cache** | Bounded, RAM-only, short-lived: Off / 32 MB / 96 MB budget (user-set), LRU eviction, 30-min TTL, abandoned downloads aborted, released on track end / queue change / clear. Never persisted to disk. YouTube audio is never cached by the app |
| **Live radio** | Radio Browser stations stream directly with a LIVE badge, no seeking (by design), and real codec/bitrate labels from the directory |
| **Player** | Persistent queue, shuffle, repeat-one/all, seek, volume, playback speed, keyboard shortcuts, Media Session (lock-screen controls), mini + full-screen players |
| **Audio quality** | Capability-driven: Auto / Data saver / Standard / High / Highest / Lossless — only from formats a source truly publishes. Radio shows real directory bitrates; Audius/Openverse say "source-provided"; YouTube sends a quality *request* that YouTube's adaptive streaming may honor — labeled honestly |
| **Discovery** | Genre, mood and language shelves mapped to **real source-native parameters** (YouTube search phrases, Audius genre/mood constants, Radio Browser tags, Openverse tags) — devotional music and bhajans included across sources, plus a live devotional radio shelf |
| **Related + session mix** | Source-provided relations (Openverse `/related`, same-uploader searches, same-tag stations), same-artist cross-source matches, an explainable local engine — and a "Session mix" from this tab's plays (in-memory only) |
| **Recommendations** | Local, explainable, content-based scoring (genre/mood/artist/language affinity, completions, skips, recency). Every pick shows *why* |
| **Library** | Playlists (create/rename/reorder/delete/export/import — multi-source aware), liked songs, favorite artists, history — IndexedDB, yours alone |
| **Privacy** | History toggle, clear-history, clear-all-data, cache clear + live cache usage. No accounts, no server, no analytics, no ads |
| **Honest embeds** | Paste a YouTube/Spotify/Mixcloud link to load their *official* embedded players. No stream extraction, no ad circumvention, no keys |
| **Responsive** | Desktop sidebar + mobile bottom nav, safe-area aware, 320px → 1920px, reduced-motion support, WCAG-minded labels and focus states |

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173
```

That's it. No `.env`, no credentials, no setup. The app talks directly to each source's public endpoints from the browser.

Other scripts:

```bash
npm run build      # type-check + production build into dist/
npm run preview    # serve the production build locally
npm test           # Vitest unit suite (128 tests)
npm run typecheck  # TypeScript strict check only
```

## Deployment

### Vercel

1. Push this folder to a Git repository.
2. Import it at vercel.com — Vercel auto-detects Vite. **Leave every environment variable empty.**
3. Deploy. `vercel.json` already handles SPA rewrites and asset caching.

CLI equivalent: `npx vercel --prod`

### GitHub Pages

A ready workflow lives at `.github/workflows/deploy-pages.yml`:

1. Push the repository to GitHub (branch `main`).
2. Repository **Settings → Pages → Source: GitHub Actions**.
3. The workflow builds, tests and publishes on every push. No secrets needed.

`vite.config.ts` sets `base: './'` (relative assets) and the app uses **hash routing**, so it works from any sub-path (`user.github.io/repo/`) without configuration.

### Any other static host

`dist/` is fully static — upload it anywhere (Netlify, Cloudflare Pages, S3, nginx). Hash routing means no server config is required.

## Music sources — verified 2026-10-23

Every integrated source was probed live (CORS behaviour, payload shapes, real audio bytes where applicable) before being enabled, and the app displays only what each source can actually do. The in-app **Settings → Sources** page mirrors this table with live toggles, and **Privacy** documents attribution and limitations.

### ✅ Connected

| Source | Access model | Verified facts |
|---|---|---|
| **YouTube** | Search via community [Piped](https://github.com/TeamPiped/Piped) relay APIs (`api.piped.private.coffee`, `pipedapi.ducks.party` — both HTTP 200, `ACAO: *`); playback **only** via the official YouTube IFrame Player API | Real song-level results (`filter=music_songs` returns YouTube Music data — titles, artists, durations). Official player provides seek/volume/quality inside the app's controls. A second hidden player is cued with the next track and **promoted at track end** for instant continue. No stream extraction, no ad bypass, no keys |
| **Audius** (`audius.co`) | Official keyless API (`app_name` free-form param only); `api.audius.co` host discovery; `ACAO: *` on every endpoint | Search + trending + genre/mood browsing; the stream endpoint serves `audio/mpeg` with `ACAO: *` **and** `Accept-Ranges: bytes` end-to-end (verified 10.7 MB full-length file) — full prebuffering and bounded RAM caching work |
| **Radio Browser** (`radio-browser.info`) | Open community directory API, keyless, `ACAO: *` | Tens of thousands of live stations; search by name/tag/language; real codec + bitrate metadata (e.g. "AAC 128 kbps"). HTTPS-only streams surfaced; HLS-only and broken stations filtered out. Live badge, no seeking — by design, not omission |
| **Openverse** (`api.openverse.org`) | Keyless, `ACAO: *`; anonymous quota ~20 req/min, 200/day | Aggregates **Jamendo** (full-length CC tracks; storage host reflects allowed origins + Range), **Wikimedia Commons** (`ACAO: *`) and **Freesound** (CDN `ACAO: *`, Range). Results cached 45 min to respect quota; 429/timeouts degrade gracefully with a visible notice |
| **Mixcloud** (`api.mixcloud.com`) | Keyless public search API with origin-reflecting CORS | Shows, DJ sets and long-form mixes (large devotional catalogs included) played through the **official Mixcloud widget** — provider-controlled transport, honestly labeled. Durations only on detail lookup; queue auto-advance can't hear the widget end |

### ❌ Evaluated but not integrated (access rules honored)

| Source | Reason |
|---|---|
| **Internet Archive** | Removed in v3 by product choice (music-first focus). Its APIs remain open and keyless — nothing about this reflects an access problem. v2 playlist exports with archive.org references can no longer be imported |
| **Invidious** (as YouTube relay) | Probed as a fallback: reachable instances block anonymous/datacenter access (403/530) or lock CORS to their own web-app origin. Piped relays are the only community option that accepts third-party browser clients |
| **Free Music Archive** | Public API shut down by FMA |
| **Free To Use** | Public API origin-allowlisted to freetouse.com — not browser-callable from third parties |
| **ccMixter** | Open JSON API but audio is hotlink-protected to ccmixter.org (verified 403/206) — playing it would require spoofing Referer, i.e. circumventing access rules |
| **FreePD** | Site closed |
| **Jamendo (direct)** | API requires a client_id (breaks zero-config). Jamendo music IS available via Openverse |
| **Spotify** | No keyless search API. Paste-link official embed supported |

## Architecture (v3)

```
┌────────────────────────────  UI (React 18 + Tailwind)  ───────────────────────────┐
│  Home · Search (per-source queries) · Genres/Moods · Track detail · Playlists      │
│  Library · History · Queue · Settings · Privacy          PlayerBar + Expanded      │
└───────────────────────────────────────┬───────────────────────────────────────────┘
                                        │
                       ┌────────────────▼─────────────────┐
                       │  Player store (Zustand)          │  queue · shuffle · repeat
                       │  loadCurrent() dispatch:         │  format fallback · tokens
                       └───────┬──────────────────┬───────┘
              direct audio     │                  │  embed / youtube
       ┌───────────────────────▼───┐      ┌───────▼──────────────────────┐
       │ <audio> element            │      │ ytTransport (official IFrame)│
       │ MSE progressive pipeline   │      │ active player + cued spare   │
       │ per-host native fallback   │      │ promotion at track end       │
       └───────────────┬────────────┘      └───────┬──────────────────────┘
                       │                           │
       ┌───────────────▼───────────────────────────▼──────────────────────┐
       │ Providers (capability model)                                      │
       │ audius · youtube(Piped) · radioBrowser · openverse · mixcloud     │
       └───────────────┬──────────────────────────────────────────────────┘
                       │
       ┌───────────────▼──────────────────────────────────────────────────┐
       │ Preload orchestrator: metadata prefetch → 256 KB prime (CORS      │
       │ hosts) / cueVideoById (YouTube) · bounded RAM cache · cleanup     │
       └───────────────────────────────────────────────────────────────────┘
```

- **Capability model** (`types.ts`): every track carries `formats` (direct audio), `embed` (official-player transport), `isLive`, and license labels. The UI renders only what's real.
- **Honest quality**: bitrates shown verbatim from sources; "source-provided" when absent; YouTube marked "Requested · YouTube decides".
- **Cache policy**: RAM-only blobs, `{current, next}` retention, release on end/queue change, 30-min TTL, per-host unavailable memo, `URL.revokeObjectURL` on drop.

## Testing

128 Vitest unit tests cover the queue semantics (shuffle/repeat/next/prev), the preload orchestrator (prime/skip/policy/cancel), the bounded audio cache, every provider adapter (normalization honesty, junk filtering, failover), the Piped relay client (sticky health + cooldown + typed errors), the YouTube transport (load/cue/promote/errors with a fake IFrame API), quality picking, the recommendation engine, library persistence and search orchestration. The suite runs offline via fetch stubs.

## Attribution & licenses

Every track links back to its source page (Audius/YouTube/Mixcloud/Jamendo/Wikimedia/Freesound). Openverse tracks carry their CC license; Audius and Mixcloud tracks remain the property of their uploaders; radio streams belong to their broadcasters. Playback happens through each provider's own delivery (direct file, official stream endpoint, or official player) — nothing is re-hosted or extracted.

## Troubleshooting

- **"YouTube search relays unavailable"** — both configured Piped instances are down or rate-limited. Other sources keep working; retry later. The relay pool is defined in `src/lib/providers/pipedClient.ts`.
- **No sound on a radio station** — broadcasters do go offline; skip to the next track. HTTP-only stations are hidden on HTTPS deployments by browser mixed-content rules (by design).
- **Mixcloud shows don't auto-advance** — the official widget doesn't expose playback events to third parties; use next/previous after a show.
- **Quality picker shows "source-provided"** — that source doesn't publish bitrates; we never invent numbers.
- **Localhost prebuffering note** — some CDNs (Jamendo) reflect allowed origins for public hosts; from `localhost` those streams play natively while deployed origins get the full prebuffering path.
