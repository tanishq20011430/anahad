# Worklog

---
Task ID: 1
Agent: main (Z.ai)
Task: Build a complete, zero-configuration music streaming web app (Anahad) — React + TypeScript + Vite + Tailwind, Internet Archive as the sole built-in source, local recommendation engine, playlists, privacy controls, deployment configs.

Work Log:
- Loaded fullstack-dev skill; inspected environment (no Next.js project actually present; sandbox serves preview from port 3000).
- Verified archive.org endpoints with curl: advancedsearch.php + metadata APIs send `Access-Control-Allow-Origin: *`; download URLs 302 to storage nodes (native <audio> playback, no CORS needed); artwork service OK.
- Verified live content: netlabels (77k CC items), bhajans (1.4k), qawwali/ghazal/carnatic/hindustani, language filters (hin/pan/tam…), musopen, georgeblood 78rpm (187k), etree (293k). Noted `length` fields come in both "421.12" and "07:01" formats; radio-program noise negated via `NOT collection:(radioprograms)` where needed.
- Scaffolded `/home/z/my-project/music-app` — Vite 5 + React 18.3 + TS strict + Tailwind 3.4 + Zustand 4.5 + TanStack Query 5 + React Router 6 (hash) + Vitest. `npm install` from registry (React 18.3.1, Vite 5.4.21 locked).
- Built IA provider adapter (`src/lib/archive.ts`): query builder with Lucene sanitization, search + metadata normalization, file-derivative grouping (original vs 64kb/vbr), real bitrate computation (size×8/duration), quality picker (auto/data-saver/standard/high/highest/lossless) driven by actual formats + browser canPlayType.
- Built stores: player (queue/shuffle/repeat/format-fallback/skip-after-error/load tokens), library (playlists/likes/albums/artists/history → IndexedDB), settings (localStorage persist).
- Built local explainable recommendation engine (`recommend.ts`): transparent weights (genre .28/mood .22/artist .2/language .12/like .1/popularity .08), recency half-life, skip penalties, per-artist diversity caps, human-readable reasons; candidate pipeline in `discover.ts` bounded to 8 album expansions.
- Built UI: layout (collapsible sidebar + mobile bottom nav + safe areas), persistent player bar (mini + full), expanded player, queue panel, quality menu, TrackRow/AlbumCard, add-to-playlist modal, toasts.
- Built 15 pages (Home, Search, Genres, Moods, shelf, Album, Artist, Track, Playlists, PlaylistDetail, Library, History, Queue, Settings, Privacy/NotFound) with lazy routes + hash routing.
- External embeds: YouTube (youtube-nocookie) / Spotify official iframes from pasted links — no keys, no stream extraction, provider-controlled transport honestly labeled.
- Wrote 72 Vitest tests. They caught real bugs: invalid NON_AUDIO regex (unterminated group — would break everything at runtime), `primary.fileName` vs `primary.name` field bug, conditional-hooks crash on Album page (React #310, found via browser testing), prettify ordering, case-sensitive OR splitting, jsdom gaps.
- Fixed all; 72/72 pass; production build clean (~350KB raw / ~115KB gzip, route-split).
- Deployment: vercel.json (SPA rewrites + cache headers), GitHub Actions workflow (build + test + Pages deploy, zero secrets), README with full setup/deploy/troubleshooting/attribution docs, .gitignore.
- Sandbox preview: root package.json `dev` script serves music-app/dist on port 3000 (scripts/serve-preview.cjs).
- Browser verification (agent-browser, headless Chromium): app loads with real archive data; clicked Play → audio actually advanced (0:26→0:30); MediaSession metadata set; next-track advanced queue; search "bhajan" returned real Hindi results; album page rendered 4-track list; playback from album context worked; queue panel "4 tracks"; no horizontal overflow at 320/390/768/1280/1920; mini-player + bottom nav on mobile; light/dark toggle both ways; playlist creation; keyboard shortcut "k"; privacy page disclosures; zero console errors after full sweep.
- Improved Bollywood genre clause (negated quran/naat/sermon noise) and verified better results (Lata Mangeshkar, 1960s Old Hindi Songs).

Stage Summary:
- Deliverable repo: /home/z/my-project/music-app (npm install && npm run dev / build / test — zero config, no .env, no keys, no backend).
- Preview: port 3000 static server (root package.json dev script) serving production build.
- Verified capabilities: real search, real playback (IA MP3/Ogg), queue/player/shuffle/repeat, quality menu with computed bitrates, local explainable recommendations, playlists/likes/history in IndexedDB, privacy toggles + clear-all-data, embed tool, responsive 320–1920, a11y labels/focus, 72 unit tests, Vercel + GH Pages configs.
- Known honest limitations (documented in-app + README): Jamendo/FMA excluded (would require client IDs / unstable), YouTube/Spotify embed-only via pasted links (no keyless search API), moods are keyword-estimated and labeled as such, FLAC only where items genuinely include it (not on Safari/iOS).
