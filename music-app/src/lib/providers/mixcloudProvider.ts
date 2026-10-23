/**
 * Mixcloud provider — DJ sets, radio shows and mixes, keyless.
 *
 * Verified against the live API (2026-10-23):
 * - `https://api.mixcloud.com/search/?q=…&type=cloudcast` responds HTTP 200
 *   with origin-REFLECTING `Access-Control-Allow-Origin` — browser-callable
 *   from any origin without keys.
 * - Real devotional content exists (e.g. "In harmony with Sai — Sat Bhajans").
 *
 * Honest boundaries:
 * - Mixcloud does not expose direct audio stream URLs, so playback happens
 *   through the OFFICIAL Mixcloud widget player (provider-controlled, like
 *   Spotify embeds). Anahad's transport buttons hand off to the widget.
 * - Show duration is not part of the search payload; we show "—" rather
 *   than guessing. Queue auto-advance can't hear the widget end, so after
 *   a Mixcloud item finishes, the user advances manually.
 */

import type { MusicProvider, ProviderCapabilities, SearchOptions, Track, TrackSearchResponse } from '../../types'
import { inferMoods } from '../../config/catalog'
import { LRUCache } from '../cache'

const REQUEST_TIMEOUT_MS = 12_000

export class MixcloudUnavailableError extends Error {
  constructor() {
    super('Mixcloud search is unreachable right now')
    this.name = 'MixcloudUnavailableError'
  }
}

interface McTag {
  name?: string
  key?: string
}

interface McCloudcast {
  key?: string
  url?: string
  name?: string
  user?: { username?: string; name?: string }
  tags?: McTag[]
  pictures?: Record<string, string> | null
  play_count?: number
  created_time?: string
  slug?: string
}

async function fetchJson(url: string, signal?: AbortSignal): Promise<unknown> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(new DOMException('timeout', 'TimeoutError')), REQUEST_TIMEOUT_MS)
  const onOuterAbort = () => ctrl.abort()
  signal?.addEventListener('abort', onOuterAbort, { once: true })
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return (await res.json()) as unknown
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onOuterAbort)
  }
}

/** Map a Mixcloud show to a Track (embed-playback, no duration guesses). */
export function normalizeMixcloudShow(r: McCloudcast): Track | null {
  const key = r.key
  const name = (r.name ?? '').trim()
  if (!key || !name || !/^\/.+\/.+\/$/.test(key)) return null

  return {
    id: `mixcloud:${key}`,
    source: 'mixcloud',
    identifier: key,
    fileName: '',
    title: name,
    artist: r.user?.name?.trim() || r.user?.username?.trim() || 'Unknown uploader',
    album: '',
    artwork: r.pictures?.medium_mobile ?? r.pictures?.thumbnail ?? null,
    durationSec: null,
    formats: [], // deliberate: official widget transport, no direct stream URLs
    embed: { kind: 'mixcloud', id: key },
    licenseUrl: r.url ?? 'https://www.mixcloud.com',
    licenseName: 'Mixcloud — rights retained by the uploader',
    language: null,
    genres: (r.tags ?? []).map((t) => t.name?.trim() ?? '').filter(Boolean).slice(0, 6),
    estimatedMoods: inferMoods(name, (r.tags ?? []).map((t) => t.name ?? '')),
    year: r.created_time ? Number(r.created_time.slice(0, 4)) || null : null,
    itemPage: r.url ?? `https://www.mixcloud.com${key}`,
    collection: 'mixcloud-show'
  }
}

function normalizeList(payload: unknown): { tracks: Track[]; total: number } {
  const data = (payload as { data?: McCloudcast[] })?.data
  const list = Array.isArray(data) ? data : []
  const tracks: Track[] = []
  const seen = new Set<string>()
  for (const r of list) {
    const t = normalizeMixcloudShow(r)
    if (!t || seen.has(t.id)) continue
    seen.add(t.id)
    tracks.push(t)
  }
  return { tracks, total: tracks.length }
}

const searchCache = new LRUCache<TrackSearchResponse>(80, 20 * 60 * 1000)

export async function mixcloudSearchTracks(options: SearchOptions): Promise<TrackSearchResponse> {
  const q = options.query?.trim()
  if (!q) return { tracks: [], total: 0 }
  const rows = Math.min(20, Math.max(1, options.rows ?? 10))
  const page = Math.max(1, options.page ?? 1)
  const path = `https://api.mixcloud.com/search/?q=${encodeURIComponent(q)}&type=cloudcast&limit=${rows}&page=${page}`
  const cached = searchCache.get(path)
  if (cached) return cached
  const payload = await fetchJson(path, options.signal)
  const res = normalizeList(payload)
  searchCache.set(path, res)
  return res
}

/** Resolve one show's full metadata (includes real audio_length seconds). */
export async function mixcloudShowByKey(key: string, signal?: AbortSignal): Promise<Track | null> {
  const detail = (await fetchJson(`https://api.mixcloud.com${key}`, signal)) as McCloudcast & {
    audio_length?: number
  }
  const base = normalizeMixcloudShow(detail)
  if (base && typeof detail.audio_length === 'number' && detail.audio_length > 0) {
    base.durationSec = Math.round(detail.audio_length)
  }
  return base
}

const capabilities: ProviderCapabilities = {
  searchableMetadata: true,
  artworkAvailable: true,
  directAudio: false,
  embeddedPlayback: true,
  externalLinkOnly: false,
  licenseInfoAvailable: false,
  qualityMetadataAvailable: false
}

export const mixcloudProvider: MusicProvider = {
  id: 'mixcloud',
  label: 'Mixcloud',
  sourceLabel: 'Mixcloud · official widget',
  attribution:
    'Shows, sets and mixes discovered via the keyless Mixcloud public API and played through the official Mixcloud widget. All rights remain with uploaders.',
  homeUrl: 'https://www.mixcloud.com',
  enabledByDefault: true,
  capabilities,

  searchTracks: mixcloudSearchTracks,

  async resolveTrack(track, signal) {
    try {
      const fresh = await mixcloudShowByKey(track.identifier, signal)
      return fresh ?? track
    } catch {
      return track
    }
  },

  async getRelatedTracks(track, signal) {
    // Real relation: more shows from the same uploader (public search).
    if (!track.artist || track.artist === 'Unknown uploader') return []
    try {
      const res = await mixcloudSearchTracks({ query: track.artist, rows: 8, signal })
      return res.tracks.filter((t) => t.id !== track.id).slice(0, 5)
    } catch {
      return []
    }
  }
}
