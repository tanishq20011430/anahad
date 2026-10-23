/**
 * Source registry status — single source of truth for "which sources exist,
 * which are verified working, and why others are NOT integrated".
 *
 * Honesty rules:
 * - `verified` entries have been exercised with real requests (CORS headers,
 *   payload shapes, real audio bytes where applicable) on 2026-10-23 from
 *   this codebase.
 * - `excluded` entries document the exact access-rule reason; nothing here
 *   bypasses hotlink protection, origin allowlists or missing APIs.
 * - YouTube is integrated through community Piped relays for SEARCH and the
 *   official IFrame Player for PLAYBACK — no stream extraction, no ad
 *   circumvention, no API keys, ever.
 */

import type { SourceId } from '../types'

export interface VerifiedSource {
  id: SourceId
  label: string
  homeUrl: string
  /** What the user gets from this source. */
  summary: string
  /** Which upstream catalogs are reachable through it. */
  catalogs: string[]
  verifiedAt: string
  /** Known operational limits, shown in Settings. */
  limits: string[]
}

export const VERIFIED_SOURCES: VerifiedSource[] = [
  {
    id: 'youtube',
    label: 'YouTube',
    homeUrl: 'https://www.youtube.com',
    summary:
      'Search YouTube\'s catalog through community Piped relay APIs and play through the OFFICIAL YouTube IFrame Player — queue, seek, volume and next-track pre-buffering included.',
    catalogs: ['YouTube videos & YouTube Music (via Piped relays)'],
    verifiedAt: '2026-10-23',
    limits: [
      'Search depends on community Piped instances; if both configured relays are down, the source degrades with a notice (other sources unaffected).',
      'Playback runs inside YouTube\'s official player. The quality picker can REQUEST a level, but YouTube\'s adaptive streaming always decides the delivery.',
      'No streams are extracted and no ads are bypassed — the official player enforces YouTube\'s own rules.'
    ]
  },
  {
    id: 'audius',
    label: 'Audius',
    homeUrl: 'https://audius.co',
    summary:
      'Full-length tracks from Audius artists via the official keyless API. The stream endpoint serves audio/mpeg with CORS + Range support end-to-end, so pre-buffering and the bounded RAM cache work fully.',
    catalogs: ['Audius artist uploads (Electronic, Hip-Hop, Devotional, Lo-Fi and more)'],
    verifiedAt: '2026-10-23',
    limits: [
      'The API exposes no bitrate metadata, so quality shows "Original (source-provided)" — we never invent numbers.',
      'Tracks remain the property of their uploaders; licenses vary per upload.'
    ]
  },
  {
    id: 'radio',
    label: 'Radio Browser',
    homeUrl: 'https://www.radio-browser.info/',
    summary:
      'Tens of thousands of live radio stations from the open radio-browser.info directory — including large devotional/bhajan, classical and regional-language categories. Codec and bitrate metadata are real, from the directory.',
    catalogs: ['Community radio directory (worldwide, all languages)'],
    verifiedAt: '2026-10-23',
    limits: [
      'Only HTTPS streams are offered — HTTP-only stations would break mixed-content rules, so they are filtered out, not proxied.',
      'Streams are live: no duration, no seeking. HLS-only stations are excluded rather than half-supported.',
      'Stream uptime depends on each broadcaster.'
    ]
  },
  {
    id: 'openverse',
    label: 'Openverse',
    homeUrl: 'https://openverse.org',
    summary: 'Openly-licensed full-length tracks aggregated by the Openverse API (Creative Commons / WordPress-run).',
    catalogs: ['Jamendo', 'Wikimedia Commons', 'Freesound'],
    verifiedAt: '2026-10-23',
    limits: [
      'Anonymous API quota: ~20 searches/min, 200/day — results are cached locally to respect it.',
      'Bitrate metadata is usually absent upstream, so the quality picker shows "source-provided" instead of guessing.'
    ]
  },
  {
    id: 'mixcloud',
    label: 'Mixcloud',
    homeUrl: 'https://www.mixcloud.com',
    summary:
      'DJ sets, radio shows and long-form mixes (including large devotional catalogs) via the keyless Mixcloud public API, played through the official Mixcloud widget.',
    catalogs: ['Mixcloud shows & DJ sets'],
    verifiedAt: '2026-10-23',
    limits: [
      'Mixcloud does not expose direct audio URLs — playback uses their official widget, so Anahad\'s transport hands off to it.',
      'Show duration is not in the search payload, so durations show "—". Auto-advance can\'t hear the widget end; advance manually after a show.'
    ]
  }
]

export interface ExcludedSource {
  label: string
  homeUrl: string
  /** The precise, factual reason this source is not connected. */
  reason: string
  verifiedAt: string
}

export const EXCLUDED_SOURCES: ExcludedSource[] = [
  {
    label: 'Internet Archive (removed by choice)',
    homeUrl: 'https://archive.org',
    reason:
      'Previously the primary source; removed in v3 to focus the app on music-first catalogs (YouTube, Audius, radio). Its APIs remain keyless and open — nothing about this removal reflects an access problem.',
    verifiedAt: '2026-10-23'
  },
  {
    label: 'Free Music Archive',
    homeUrl: 'https://freemusicarchive.org',
    reason: 'FMA shut down its public API ("Due to the heavy load… we had to shut down our API", per their app-developers page). No keyless catalog API remains, so there is nothing legitimate to integrate.',
    verifiedAt: '2026-10-23'
  },
  {
    label: 'Free To Use (freetouse.com)',
    homeUrl: 'https://freetouse.com',
    reason: 'A public API exists, but it sends Access-Control-Allow-Origin only for freetouse.com origins — third-party web apps cannot call it from the browser. Their audio CDN is open, but the catalog API is not. We do not spoof origins or proxy around access rules.',
    verifiedAt: '2026-10-23'
  },
  {
    label: 'ccMixter',
    homeUrl: 'https://ccmixter.org',
    reason: 'The JSON query API is open, but audio files are served with hotlink protection (Referer must be a ccmixter.org domain — verified 403/206 behaviour). Playing from a third-party app would require spoofing Referer, i.e. circumventing access rules, which we will not do.',
    verifiedAt: '2026-10-23'
  },
  {
    label: 'FreePD',
    homeUrl: 'https://freepd.com',
    reason: 'The site is closed ("FreePD.com — Site Closed"). Its public-domain catalog is no longer served.',
    verifiedAt: '2026-10-23'
  },
  {
    label: 'Invidious (as a YouTube relay)',
    homeUrl: 'https://invidious.io',
    reason:
      'Public Invidious instances were probed as a YouTube search fallback: every reachable instance either blocks datacenter/anonymous access (HTTP 403/530) or sends an Access-Control-Allow-Origin fixed to its own web app origin. Only Piped relays currently allow third-party browser clients, so they are the configured relays.',
    verifiedAt: '2026-10-23'
  },
  {
    label: 'Jamendo (direct)',
    homeUrl: 'https://www.jamendo.com',
    reason: 'Jamendo\u2019s own API requires a client_id (a registered key), which would break the zero-configuration rule. Jamendo music IS available in-app through the Openverse aggregator, which is keyless.',
    verifiedAt: '2026-10-23'
  },
  {
    label: 'Spotify',
    homeUrl: 'https://open.spotify.com',
    reason: 'No keyless search/playback APIs for third parties. Supported embed-only: paste a link and Anahad renders the official player — provider-controlled transport, no stream extraction, no ad bypass.',
    verifiedAt: '2026-10-23'
  }
]

/** Short label shown on track rows / player bar, e.g. "Jamendo · Openverse". */
export function sourceChipFor(source: SourceId, collection: string | null | undefined): string {
  switch (source) {
    case 'youtube':
      return 'YouTube'
    case 'audius':
      return 'Audius'
    case 'radio':
      return 'Live radio'
    case 'mixcloud':
      return 'Mixcloud'
    case 'openverse': {
      switch (collection) {
        case 'jamendo':
          return 'Jamendo · Openverse'
        case 'wikimedia_audio':
          return 'Wikimedia · Openverse'
        case 'freesound':
          return 'Freesound · Openverse'
        default:
          return 'Openverse'
      }
    }
    case 'spotify':
      return 'Spotify embed'
    default:
      return 'Open web'
  }
}
