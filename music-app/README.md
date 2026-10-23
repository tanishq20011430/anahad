# Anahad

**Free music discovery and streaming from multiple open sources — with zero configuration and a premium playback engine.**

No accounts. No API keys. No database. No ads. No tracking. Deploy anywhere and it just works.

Anahad streams genuinely playable, legally shareable music from **two verified keyless sources**: the [Internet Archive](https://archive.org) (Creative Commons netlabels, band-approved live concerts, digitized 78rpm discs, public-domain classical, thousands of Hindi film songs, bhajans, ghazals, qawwalis) and the [Openverse](https://openverse.org) API, which aggregates **full-length Creative Commons tracks from Jamendo, Wikimedia Commons and Freesound**.

---

## Features

| Area | What you get |
|---|---|
| **Multi-source search** | Debounced unified search across sources — track-first results (IA + Openverse/Jamendo/Wikimedia/Freesound) plus IA albums; filters, suggestions, pagination, dedupe, request cancellation, per-source degradation notices |
| **Streaming engine** | HTML5 `<audio>` native streaming with a **MediaSource (MSE) progressive pipeline for MP3** (instant start, seamless continue), automatic per-host fallback, buffering indicators, buffered-range shading on the seek bar |
| **Next-track preloading** | Upcoming track metadata is resolved early and a small (~256 KB) leading slice is buffered into RAM (where the source host is CORS+Range verified), so automatic track transitions start without a gap |
| **Temporary audio cache** | Bounded, RAM-only, short-lived: Off / 32 MB / 96 MB budget (user-set), LRU eviction, 30-min TTL, aborted abandoned downloads, released on track end / queue change / clear. Never persisted to disk |
| **Player** | Persistent queue, shuffle, repeat-one/all, seek, volume, playback speed, keyboard shortcuts, Media Session (lock-screen controls), mini + full-screen players |
| **Audio quality** | Capability-driven: Auto / Data saver / Standard / High / Highest / Lossless (FLAC only when the item truly contains it). Bitrates come from real file sizes or stay honestly "source-provided" when upstream doesn't publish them |
| **Discovery** | 24 genre shelves (Bollywood → Carnatic → lo-fi → electronic) and 13 mood shelves mapped to real source queries; devotional music and bhajans included |
| **Related + session mix** | Source-provided relations (Openverse `/related`), same-artist expansion (IA), plus an explainable local engine — and a "Session mix" built from this tab's plays (in-memory only) |
| **Recommendations** | Local, explainable, content-based scoring (genre/mood/artist/language affinity, completions, skips, recency). Every pick shows *why* |
| **Library** | Playlists (create/rename/reorder/delete/export/import), liked songs, saved albums, favorite artists, history — IndexedDB, yours alone |
| **Privacy** | History toggle, clear-history, clear-all-data, cache clear + live cache usage. No accounts, no server, no analytics, no ads |
| **Honest embeds** | Paste a YouTube/Spotify link to load their *official* embedded players. No stream extraction, no ad circumvention, no keys |
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
npm test           # Vitest unit suite (117 tests)
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

Every integrated source was probed live (CORS behaviour, Range support, real audio bytes, license metadata) before being enabled, and the app displays only what each source can actually do.

### ✅ Connected

| Source | Access model | Verified facts |
|---|---|---|
| **Internet Archive** (`archive.org`) | Public search/metadata APIs (`ACAO: *`); file downloads 302 to storage nodes that send `ACAO: *` **and** `Accept-Ranges: bytes` | Full search, artwork, direct playback, and fetch-based prebuffering/MSE all work |
| **Openverse** (`api.openverse.org`) | Keyless, `ACAO: *`; anonymous quota ~20 req/min, 200/day | Aggregates **Jamendo** (full-length CC tracks; storage host reflects allowed origins + Range), **Wikimedia Commons** (`ACAO: *`) and **Freesound** (CDN `ACAO: *`, Range). Results cached 45 min to respect quota; 429/timeouts degrade gracefully with a visible notice while other sources keep working |

### ❌ Evaluated and deliberately NOT integrated (access rules honored)

| Source | Reason (verified) |
|---|---|
| **Free Music Archive** | Their own statement: the public API was shut down ("Due to the heavy load… we had to shut down our API"). Nothing keyless remains to integrate. |
| **Free To Use** (`freetouse.com`) | A public API exists, but it sends `Access-Control-Allow-Origin` only for `freetouse.com` origins (verified). Third-party browser apps cannot call it; their audio CDN is open but the catalog API is not. No origin spoofing, no proxying. |
| **ccMixter** | The JSON query API is open, but audio files are hotlink-protected (Referer must be a ccmixter.org domain — verified 403 vs 206 behaviour). Playing from here would require spoofing Referer = circumventing access rules. |
| **FreePD** | The site is closed ("FreePD.com — Site Closed"). |
| **Jamendo direct** | Their own API requires a registered `client_id`. Jamendo music **is** available in-app via Openverse. |
| **YouTube / Spotify** | No keyless search/playback APIs. Supported embed-only via official players for pasted links. |

The full list with reasons is shown in-app (Settings → Sources and Privacy & sources).

## The streaming engine

```
load track ──▶ quality picker (real formats × canPlayType × preference)
                  │
                  ├─ seed in cache? ─▶ MediaSource pipeline:
                  │     append 256 KB primed slice ─▶ play instantly
                  │     Range-fetch remainder ─▶ append ─▶ seamless continue
                  │     any failure ─▶ native <audio src> fallback (position kept)
                  │
                  └─ no seed / non-MP3 / unsupported ─▶ native <audio src> streaming
                        (works for ANY host — no CORS needed for plain playback)

in parallel ──▶ preload orchestrator:
                  resolve NEXT track's formats (metadata prefetch)
                  prime 256 KB of the chosen format into the RAM cache
                  (cancelled + re-planned on any queue/index/quality change)
```

**Cache policy (enforced in code, disclosed in the app):** RAM only — never IndexedDB/Cache Storage/disk; hard byte budget with LRU eviction; 30-minute TTL with periodic sweeps; one in-flight download per URL with AbortController cancellation; finished tracks release their slice (except repeat-one); the cache holds only {current, next}; object/ MediaSource URLs are revoked on teardown. Hosts that refuse CORS/Range are remembered for the session and stream natively instead — nothing is ever bypassed.

## Architecture

```
src/
├── types.ts            # Capability-honest domain model (Track, AudioFormat, provider contract)
├── config/catalog.ts   # Genre/mood/language definitions (+ Openverse tag mapping) — pure data
├── lib/
│   ├── archive.ts      # Internet Archive provider adapter + quality picker
│   ├── openverse.ts    # Openverse adapter (Jamendo/Wikimedia/Freesound) — quota-aware, honest quality
│   ├── searchService.ts# Provider registry, unified album + track search, degradation reporting
│   ├── resolve.ts      # Multi-source format resolution for reference-only tracks
│   ├── audioCache.ts   # Bounded RAM blob cache (LRU + TTL + abort + host memo + policy release)
│   ├── mseStream.ts    # fetch → MediaSource progressive MP3 streaming with native fallback
│   ├── preload.ts      # Next-track orchestrator (metadata prefetch + 256 KB prebuffer)
│   ├── related.ts      # Related tracks (source-provided + same-artist + local engine) + session mix
│   ├── recommend.ts    # Explainable recommendation scoring
│   ├── discover.ts     # Recommendation candidate pipeline (bounded fetching)
│   ├── sourceStatus.ts # Verified/excluded source registry (single source of truth)
│   ├── external.ts     # Official YouTube/Spotify embed parsing
│   ├── db.ts           # Tiny IndexedDB wrapper
│   ├── cache.ts        # Bounded LRU caches (metadata)
│   └── format.ts       # Duration/bitrate parsing, license labels
├── stores/
│   ├── player.ts       # Queue + playback state machine (pure, unit-tested)
│   ├── library.ts      # Playlists/likes/history → IndexedDB
│   └── settings.ts     # Theme/quality/history/preload/cache/source prefs → localStorage
├── hooks/              # Audio engine (native + MSE transport), keyboard shortcuts
├── components/         # Player bar (buffer shading), expanded player, queue panel, rows, cards
└── pages/              # 15 lazy-loaded routes (hash routing)
```

**Stack**: React 18 · TypeScript (strict) · Vite · Tailwind CSS · Zustand · TanStack Query · React Router (hash) · Lucide · Vitest.

## Testing

117 unit tests cover: the audio cache (budget eviction, TTL sweep, abort, host-unavailable memo, policy release, Range caps), the preload orchestrator (priming, shuffle-aware next pick, repeat-one skip, disabled modes, policy enforcement, track-end release), Openverse normalization (ms→s durations, license URLs, honest null bitrates, alt formats, short-result filtering), multi-source search (merge, interleave, dedupe, per-source degradation, toggles), related tracks and session mix, MSE capability gating, source registry honesty, plus the original suite (recommendations, queue semantics, archive parsing, playlists, privacy):

```bash
npm test
```

Browser-verified (headless Chromium, 2026-10-23): real search across both sources, real Jamendo playback, real IA playback via the MSE pipeline, auto-advance consuming the preloaded slice, cache policy holding {current, next}, buffering indicators and buffered shading, source-toggle degradation, offline→recovery via Retry, 320/390/768/1920px layouts without horizontal overflow, dark/light toggle, clean console.

## Troubleshooting

- **"Openverse is not answering right now"** — Openverse's origin can be slow on cold queries and enforces an anonymous quota (≈200 searches/day). Results are cached; Internet Archive results are unaffected. Try again shortly.
- **"Search is unavailable right now"** — archive.org is rate-limiting or briefly down. Retry in a moment; other sections keep working.
- **A track errors and skips** — the source file may be missing or unreadable. Anahad tries every format the item offers, then moves on and says so honestly.
- **No sound on first tap (mobile)** — browsers require a user gesture before audio; tap play once and subsequent transitions autoplay.
- **Prebuffering skipped for some sources** — hosts that don't reflect your origin (e.g. Jamendo storage only allows public origins, not localhost) stream natively instead. Deployed sites (vercel.app, github.io, custom domains) get the full prebuffering path.
- **FLAC doesn't play on iPhone Safari** — Safari/iOS lacks FLAC/OGG; pick Auto or Data saver to stream MP3. Safari also takes the native path (no MSE for raw MP3) — playback is unaffected, just element-driven.
- **History/recommendations reset** — clearing site data wipes IndexedDB. Export playlists first (Playlists → ⤓).
- **Imported playlist tracks fail** — they re-resolve live from their source; if the item changed since export, playback reports it instead of pretending.

## Privacy summary

- All personal data (playlists, likes, history, settings) stays in your browser. Nothing is ever uploaded.
- The temporary audio cache is RAM-only, bounded by your chosen budget, and auto-deleted (track end / queue change / 30 min / clear now). No audio is ever written to persistent storage.
- Requests to archive.org and api.openverse.org are visible to those services under their own privacy policies; Anahad adds nothing to them.
- No accounts, no ads, no analytics, no trackers. Source attribution and per-track licenses are shown in the app.
- "Clear all local data" (Settings) removes every trace, including settings.

## License & attribution

Application code: MIT. Music and artwork belong to their respective owners and are streamed under each track's own license — shown per track in the UI (Internet Archive item pages; CC licenses for Jamendo/Wikimedia/Freesound via Openverse, verifiable through every track's source link). Anahad is not affiliated with the Internet Archive, Openverse, WordPress, Creative Commons, Jamendo, Wikimedia or Freesound.
