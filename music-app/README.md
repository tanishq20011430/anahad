# Anahad

**Free music discovery and streaming from open archives — with zero configuration.**

No accounts. No API keys. No database. No ads. No tracking. Deploy anywhere and it just works.

Anahad streams genuinely playable, legally shareable music from the [Internet Archive](https://archive.org) — Creative Commons netlabel releases, band-approved live concerts, digitized 78rpm discs, public-domain classical, and thousands of Hindi film songs, bhajans, ghazals, qawwalis and regional Indian recordings.

---

## Features

| Area | What you get |
|---|---|
| **Search** | Debounced unified search, suggestions, genre/language filters, pagination, duplicate detection, request cancellation |
| **Player** | Persistent player with queue, shuffle, repeat-one/all, seek, volume, playback speed, keyboard shortcuts, Media Session (lock-screen controls), mini + full-screen players |
| **Audio quality** | Capability-driven: Auto / Data saver / Standard / High / Highest / Lossless (FLAC only when an item truly contains it). Bitrates are computed from real file sizes — never invented |
| **Discovery** | 24 curated genre shelves (Bollywood → Carnatic → lo-fi → electronic) and 13 mood shelves, all backed by real archive queries |
| **Recommendations** | Local, explainable, content-based scoring (genre/mood/artist/language affinity + listening completion + skips + recency). Every pick shows *why*. Runs in your browser; nothing leaves it |
| **Library** | Playlists (create/rename/reorder/delete/export/import), liked songs, saved albums, favorite artists, listening history — stored in IndexedDB, yours alone |
| **Privacy** | History toggle, clear-history, clear-all-data. No accounts, no server, no analytics, no ads |
| **Honest embeds** | Paste a YouTube/Spotify link to load their *official* embedded players. No stream extraction, no ad circumvention, no keys |
| **Responsive** | Desktop sidebar + mobile bottom nav, safe-area aware, 320px → 1920px, reduced-motion support, WCAG-minded labels and focus states |

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173
```

That's it. No `.env`, no credentials, no setup. The app talks directly to archive.org's public endpoints from the browser.

Other scripts:

```bash
npm run build      # type-check + production build into dist/
npm run preview    # serve the production build locally
npm test           # Vitest unit suite (recommendations, queue, parsing, playlists)
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
3. The workflow builds and publishes on every push. No secrets needed.

`vite.config.ts` sets `base: './'` (relative assets) and the app uses **hash routing**, so it works from any sub-path (`user.github.io/repo/`) without configuration. A `404.html` fallback is generated as belt-and-braces.

### Any other static host

`dist/` is fully static — upload it anywhere (Netlify, Cloudflare Pages, S3, nginx). Hash routing means no server config is required.

## How playback stays legal and key-free

| Source | Access model | Status |
|---|---|---|
| **Internet Archive** (`archive.org`) | Public metadata + search APIs (`Access-Control-Allow-Origin: *`), direct file URLs streamed by the HTML5 audio element | ✅ Built-in, the only catalog |
| Netlabels / etree / 78rpm / Musopen | Collections inside the Internet Archive with per-item licenses (CC, public domain, band-approved) | ✅ Surfaced with license labels + source links |
| **Jamendo, Free Music Archive** | Require client IDs / have unstable availability | ❌ Deliberately not integrated — they would break zero-config |
| **YouTube / Spotify** | Official embedded players only, for links you paste; no keyless discovery API exists | ⚠️ Embed-only, clearly labeled |

Every track records what its source can actually do (artwork, direct audio, license info, quality metadata). The UI never shows a control the source can't honor, never fakes a playing state, and never invents bitrates or moods — keyword-estimated moods are explicitly labeled *estimated*.

## Architecture

```
src/
├── types.ts            # Capability-honest domain model (Track, AudioFormat, …)
├── config/catalog.ts   # Genre/mood/language definitions — pure data, extend freely
├── lib/
│   ├── archive.ts      # Internet Archive provider adapter + quality picker
│   ├── searchService.ts# Multi-provider orchestration + dedupe
│   ├── recommend.ts    # Explainable recommendation scoring
│   ├── discover.ts     # Recommendation candidate pipeline (bounded fetching)
│   ├── external.ts     # Official YouTube/Spotify embed parsing
│   ├── db.ts           # Tiny IndexedDB wrapper
│   ├── cache.ts        # Bounded LRU caches
│   └── format.ts       # Duration/bitrate parsing, license labels
├── stores/
│   ├── player.ts       # Queue + playback state machine (pure, unit-tested)
│   ├── library.ts      # Playlists/likes/history → IndexedDB
│   └── settings.ts     # Theme/quality/history prefs → localStorage
├── hooks/              # Audio engine (single <audio> + MediaSession), shortcuts
├── components/         # Player bar, expanded player, queue panel, rows, cards
└── pages/              # 15 lazy-loaded routes (hash routing)
```

**Stack**: React 18 · TypeScript (strict) · Vite · Tailwind CSS · Zustand · TanStack Query · React Router (hash) · Lucide · Vitest.

## Testing

72 unit tests cover: recommendation scoring and mood matching, queue semantics (shuffle/repeat/fallback), archive query building and sanitization, file-derivative grouping, bitrate computation, license labeling, embed URL parsing, playlist lifecycle, and history privacy behavior:

```bash
npm test
```

## Troubleshooting

- **"Search is unavailable right now"** — archive.org is rate-limiting or briefly down. Retry in a moment; other shelves keep working. Requests are cached and bounded to stay well under normal rate limits.
- **A track errors and skips** — the source file may be missing or unreadable. Anahad tries every format the item offers, then moves on and says so honestly.
- **No sound on first tap (mobile)** — browsers require a user gesture before audio; tap play once and subsequent transitions autoplay.
- **FLAC doesn't play on iPhone Safari** — Safari/iOS lacks FLAC/OGG; pick Auto or Data saver to stream MP3.
- **History/recommendations reset** — clearing site data wipes IndexedDB. Export playlists first (Playlists → ⤓).
- **Imported playlist tracks fail** — they re-resolve live from the archive; if the item changed since export, playback reports it instead of pretending.

## Privacy summary

- All personal data (playlists, likes, history, settings) stays in your browser. Nothing is ever uploaded.
- Requests to archive.org are visible to them under their own privacy policy; Anahad adds nothing.
- No accounts, no ads, no analytics, no trackers. Source attribution and per-item licenses are shown in the app.
- "Clear all local data" (Settings) removes every trace, including settings.

## License & attribution

Application code: MIT. Music and artwork belong to their respective owners and are streamed under each archive.org item's own terms — shown per track in the UI and verifiable on every item's archive.org page. Anahad is not affiliated with the Internet Archive.
