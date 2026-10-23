/**
 * Source registry status — single source of truth for "which sources exist,
 * which are verified working, and why others are NOT integrated".
 *
 * Honesty rules:
 * - `verified` entries have been exercised with real requests (CORS + Range +
 *   real audio bytes) on 2026-10-23 from this codebase.
 * - `excluded` entries document the exact access-rule reason; nothing here
 *   bypasses hotlink protection, origin allowlists or missing APIs.
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
    id: 'internet-archive',
    label: 'Internet Archive',
    homeUrl: 'https://archive.org',
    summary: 'Search, artwork and direct playback from archive.org items (netlabels, etree, 78rpm, bhajans and more).',
    catalogs: ['Internet Archive audio collections'],
    verifiedAt: '2026-10-23',
    limits: ['Licenses vary per item — shown on every track.']
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
    label: 'Jamendo (direct)',
    homeUrl: 'https://www.jamendo.com',
    reason: 'Jamendo\u2019s own API requires a client_id (a registered key), which would break the zero-configuration rule. Jamendo music IS available in-app through the Openverse aggregator, which is keyless.',
    verifiedAt: '2026-10-23'
  },
  {
    label: 'YouTube / Spotify',
    homeUrl: 'https://open.spotify.com',
    reason: 'No keyless search/playback APIs for third parties. Supported embed-only: paste a link and Anahad renders the official player — provider-controlled transport, no stream extraction, no ad bypass.',
    verifiedAt: '2026-10-23'
  }
]

/** Short label shown on track rows / player bar, e.g. "Jamendo · Openverse". */
export function sourceChipFor(source: SourceId, collection: string | null | undefined): string {
  if (source === 'internet-archive') return 'Internet Archive'
  if (source === 'openverse') {
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
  if (source === 'youtube') return 'YouTube embed'
  if (source === 'spotify') return 'Spotify embed'
  return 'Open web'
}
