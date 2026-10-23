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

---
Task ID: 2
Agent: main (Z.ai)
Task: Upgrade Anahad with a free multi-source streaming system (Internet Archive + Free To Use + Free Music Archive + ccMixter where access rules permit) and a premium playback engine (next-track preloading, bounded temporary audio caching, buffering UX), in the existing repository.

Work Log:
- Verified sources with live probes (scripts/verify_sources_upgrade.sh, round2-4): Internet Archive storage nodes send ACAO:* + Accept-Ranges (fetch-caching viable); Openverse API keyless + ACAO:* (anon quota 20/min, 200/day) aggregating Jamendo (full-length CC tracks, origin-reflecting CORS + Range), Wikimedia Commons, Freesound; Free To Use public API exists but ACAO is origin-allowlisted to freetouse.com (not browser-callable — excluded honestly); ccMixter query API open but files Referer-locked to ccmixter.org (403/206 verified — excluded, no bypass); Free Music Archive API officially shut down; FreePD closed.
- Extended provider model: SourceId + openverse, MusicProvider gains sourceLabel/homeUrl/enabledByDefault/searchTracks/getRelatedTracks, SearchOptions gains tag/providers, SearchResponse gains degraded[], CacheMode types; settings store gains preloadEnabled/cacheMode/sources toggles.
- Built src/lib/audioCache.ts: bounded RAM-only blob cache (Off/32/96 MB, LRU eviction, 30-min TTL sweeps, one in-flight download per URL with AbortController, bounded stream reads, per-host unavailable memo, policy release/releaseExcept/clear, readBounded cap enforcement).
- Built src/lib/mseStream.ts: fetch→MediaSource progressive MP3 streaming (seed slice → instant start; Range chunks → seamless continue; out-of-buffer seek / error → native fallback preserving position; quota handling; URL revocation).
- Built src/lib/preload.ts: next-track orchestrator (shuffle/repeat-aware next pick, metadata prefetch via resolve.ts, 256 KB prime into cache, debounced planning, progress trigger at 60% throttled 5s, cache policy keep {current,next}, onTrackEnded release, cancelAll on queue changes; window.__anahadEngine diagnostics hook).
- Built src/lib/openverse.ts adapter: q/category=music search, ms→s durations, honest null bitrates (qualityMetadataAvailable:false), CC license URL/name builders (cc0/pdm/sampling+/standard), alt_files formats, tag/genre mapping, /related endpoint, LRU 45-min cache + single-flight, 15s timeout + 1 retry (not on 429), OpenverseUnavailableError for honest degradation.
- searchService: provider registry with settings toggles, unifiedSearch with degraded[], unifiedTrackSearch with deterministic provider-ordered interleave + IA album expansion (3 albums × 6 tracks) + providers filter.
- Engine wiring: player store (PlaybackRequest {url,mimeType,seed}, bufferedEnd/playbackFromCache state, onBuffered/onCanPlay, cache seed on load, preload hooks on load/ended/reset, source-aware embed branch); useAudioEngine (native+MSE hybrid transport with position-preserving fallback, progress/buffered/stalled/canplay events, NO crossOrigin — verified Jamendo localhost-CORS breakage, removed); resolve.ts multi-source dispatch.
- related.ts: source-provided related (Openverse /related), same-artist IA expansion, local-engine fallback with reasons; session mix (in-memory session plays → related shelf).
- UI: PlayerBar (buffered seek-bar shading via --buffered CSS var, buffering spinner, source chip, sr-only status), TrackRow (source chip, buffering dot, album-link gating for non-IA), ExpandedPlayer/QualityMenu (single-format honesty), Search (per-source track queries — slow Openverse can't block fast IA — plus degraded banners), ShelfPage tracks via openverseTag, TrackDetail provider-aware (uuid routes) + related section + honest format notes, Settings (Playback engine card with live cache/preload diagnostics + Clear now; Sources card with verified toggles + excluded-sources reasons), Privacy (RAM-only cache disclosure + updated attribution/limitations), Home (Session mix shelf, updated footer).
- css: buffered-range gradient shading for webkit/moz track.
- Tests: +45 new (audioCache 11, preload 9, openverse 8, searchService 7, related 4, engine 6) → 117/117 green; fixed real bugs the tests caught (deterministic interleave order, cacheMode check in orchestrator, abort reason accuracy).
- Browser E2E (agent-browser): multi-source search renders IA + Jamendo tracks; Jamendo track plays (real audio 0:10→0:16); MSE verified on IA (blob src, mseActive:true, buffered=100% shading); auto-advance consumed the primed 256KB slice ("Playing from preloaded audio", next-next track re-primed; cache held exactly {current,next}); source toggle degradation; offline→Retry recovery; 320/390/768/1920 no horizontal overflow; dark/light toggle; console clean.
- Fixed during verification: removed global crossOrigin='anonymous' (broke native playback on origin-allowlisted hosts); split Search tracks into per-source queries (Openverse cold-URL slowness up to 30s+ must not block IA); +1 transparent retry on Openverse timeouts.
- README rewritten (multi-source table with verified facts, streaming-engine diagram, cache policy, 117 tests, troubleshooting incl. localhost-prebuffering note); screenshots saved to download/.

Stage Summary:
- Repo: /home/z/my-project/music-app — v2.0 multi-source premium playback; 117/117 tests; production build clean (~118KB gzip core, route-split); vercel.json + GitHub Pages workflow unchanged (static-first).
- Connected sources: Internet Archive (primary) + Openverse (Jamendo/Wikimedia/Freesound) — both keyless, verified; excluded with in-app documented reasons: FMA (API shut down), FreePD (closed), ccMixter (hotlink-locked), Free To Use (origin-allowlisted API), Jamendo-direct (client_id).
- Acceptance evidence: search real catalogs → play real audio (both sources) → next-track preloading (256KB primed slice consumed at auto-advance) → automatic continue; cache bounded/RAM-only/policy-cleaned; graceful degradation everywhere; honest quality/license labeling.
- Known limitations (documented in-app): Openverse cold-query latency + 200/day anon quota (cached + degraded notices); Jamendo storage reflects ACAO only for public origins (localhost dev streams natively, deployed origins get full prebuffering); Openverse /related endpoint also slow when cold.
