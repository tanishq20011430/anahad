/**
 * YouTube provider — search via Piped (community scraper APIs), playback via
 * the OFFICIAL YouTube IFrame Player API.
 *
 * Verified against live endpoints (2026-10-23):
 * - `api.piped.private.coffee` and `pipedapi.ducks.party` respond HTTP 200
 *   with `Access-Control-Allow-Origin: *` to third-party origins.
 * - `filter=music_songs` returns YouTube-Music-shaped results with real
 *   song titles/artists (e.g. "Laal Ishq — Sanjay Leela Bhansali").
 *
 * Honest boundaries:
 * - Thumbnails are fetched directly from i.ytimg.com (no Piped proxy needed).
 * - `formats` stays EMPTY: this app never extracts or streams YouTube's raw
 *   media URLs. Transport is the official embed, so the quality picker can
 *   only REQUEST a level — YouTube's adaptive streaming always decides.
 * - Public API only; nothing here requires keys or bypasses access rules.
 */

import type { MusicProvider, ProviderCapabilities, SearchOptions, Track, TrackSearchResponse } from '../../types'
import { inferMoods } from '../../config/catalog'
import { pipedGetCached, PipedUnavailableError } from './pipedClient'

interface PipedItem {
  url?: string
  type?: string
  title?: string
  thumbnail?: string
  uploaderName?: string
  uploaderUrl?: string
  duration?: number
  views?: number
  isShort?: boolean
  uploadedDate?: string | null
}

interface PipedSearchPayload {
  items?: PipedItem[]
  corrected?: boolean
}

export function videoIdFromUrl(url: string | undefined): string | null {
  if (!url) return null
  const m = url.match(/[?&]v=([\w-]{6,20})/)
  return m ? m[1] : null
}

/** Direct YouTube thumbnail — always https, no third-party proxy involved. */
export function ytThumbnail(videoId: string, big = false): string {
  return `https://i.ytimg.com/vi/${videoId}/${big ? 'hqdefault' : 'mqdefault'}.jpg`
}

const MIN_DURATION_SEC = 45

/** Map one Piped result to a Track. Returns null for non-music junk. */
export function normalizePipedItem(r: PipedItem): Track | null {
  const id = videoIdFromUrl(r.url)
  if (!id || r.type !== 'stream') return null
  if (r.isShort) return null
  const duration = typeof r.duration === 'number' && r.duration > 0 ? Math.round(r.duration) : null
  if (!duration || duration < MIN_DURATION_SEC) return null
  const title = (r.title ?? '').trim()
  if (!title) return null

  return {
    id: `youtube:${id}`,
    source: 'youtube',
    identifier: id,
    fileName: '',
    title,
    artist: (r.uploaderName ?? '').trim() || 'Unknown artist',
    album: '',
    artwork: ytThumbnail(id),
    durationSec: duration,
    formats: [], // deliberate: transport is the official embed, never raw streams
    embed: { kind: 'youtube', id },
    licenseUrl: 'https://www.youtube.com/t/terms',
    licenseName: 'YouTube Terms of Service (official embed)',
    language: null,
    genres: [],
    estimatedMoods: inferMoods(title, []),
    year: r.uploadedDate ? Number(r.uploadedDate.slice(0, 4)) || null : null,
    itemPage: `https://www.youtube.com/watch?v=${id}`,
    collection: r.uploaderUrl ?? null
  }
}

function normalizeList(payload: PipedSearchPayload): { tracks: Track[]; total: number } {
  const tracks: Track[] = []
  const seen = new Set<string>()
  for (const r of payload.items ?? []) {
    const t = normalizePipedItem(r)
    if (!t || seen.has(t.id)) continue
    seen.add(t.id)
    tracks.push(t)
  }
  return { tracks, total: tracks.length }
}

function searchPath(opts: SearchOptions): string {
  const q = opts.query?.trim() ?? ''
  const params = new URLSearchParams({ q, filter: 'music_songs' })
  return `/search?${params.toString()}`
}

async function searchUncached(options: SearchOptions): Promise<TrackSearchResponse> {
  const q = options.query?.trim() ?? ''
  if (!q) return { tracks: [], total: 0 }
  const rows = Math.min(20, Math.max(1, options.rows ?? 12))
  const primary = await pipedGetCached<PipedSearchPayload>(searchPath({ ...options, query: q }), options.signal)
  let { tracks } = normalizeList(primary)
  // Fall back to the general video filter when the music index has nothing
  // (still real YouTube search — same relays, same honesty rules).
  if (tracks.length === 0) {
    const params = new URLSearchParams({ q, filter: 'videos' })
    const alt = await pipedGetCached<PipedSearchPayload>(`/search?${params.toString()}`, options.signal)
    tracks = normalizeList(alt).tracks
  }
  return { tracks: tracks.slice(0, rows), total: tracks.length }
}

/** Track-level cache with single-flight so parallel shelves don't duplicate work. */
const memo = new Map<string, Promise<TrackSearchResponse>>()

export function youtubeSearchTracks(options: SearchOptions): Promise<TrackSearchResponse> {
  const key = `yt:${options.query ?? ''}:${options.rows ?? 12}`
  const running = memo.get(key)
  if (running) return running
  const p = searchUncached(options).finally(() => {
    setTimeout(() => memo.delete(key), 30_000)
  })
  memo.set(key, p)
  return p
}

/**
 * Resolve one video's metadata via YouTube's official oEmbed endpoint
 * (CORS origin-reflecting, keyless — verified 2026-10-23). Duration is not
 * part of oEmbed; it arrives from the player once playback starts.
 */
export async function youtubeVideoMeta(videoId: string, signal?: AbortSignal): Promise<Track | null> {
  const url = `https://www.youtube.com/oembed?url=${encodeURIComponent(
    `https://www.youtube.com/watch?v=${videoId}`
  )}&format=json`
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 10_000)
  const onOuterAbort = () => ctrl.abort()
  signal?.addEventListener('abort', onOuterAbort, { once: true })
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } })
    if (!res.ok) return null
    const meta = (await res.json()) as { title?: string; author_name?: string; thumbnail_url?: string }
    const title = (meta.title ?? '').trim()
    if (!title) return null
    return {
      id: `youtube:${videoId}`,
      source: 'youtube',
      identifier: videoId,
      fileName: '',
      title,
      artist: (meta.author_name ?? '').trim() || 'Unknown artist',
      album: '',
      artwork: meta.thumbnail_url ?? ytThumbnail(videoId),
      durationSec: null,
      formats: [],
      embed: { kind: 'youtube', id: videoId },
      licenseUrl: 'https://www.youtube.com/t/terms',
      licenseName: 'YouTube Terms of Service (official embed)',
      language: null,
      genres: [],
      estimatedMoods: inferMoods(title, []),
      year: null,
      itemPage: `https://www.youtube.com/watch?v=${videoId}`,
      collection: null
    }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onOuterAbort)
  }
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

export const youtubeProvider: MusicProvider = {
  id: 'youtube',
  label: 'YouTube',
  sourceLabel: 'YouTube · official embed',
  attribution:
    'Search results from YouTube via community Piped relay APIs; audio always plays through the official YouTube IFrame Player. No streams are extracted, no ads are bypassed, no API keys are used.',
  homeUrl: 'https://www.youtube.com',
  enabledByDefault: true,
  capabilities,

  searchTracks: youtubeSearchTracks,

  async resolveTrack(track, signal) {
    const fresh = await youtubeVideoMeta(track.identifier, signal)
    return fresh ?? track
  },

  async getRelatedTracks(track, signal) {
    // Real metadata signal: more from the same uploader (a genuine YouTube
    // relation), fetched through the same relay. Never fabricated.
    if (!track.collection || track.artist === 'Unknown artist') return []
    try {
      const res = await youtubeSearchTracks({ query: track.artist, rows: 8, signal })
      return res.tracks.filter((t) => t.id !== track.id).slice(0, 6)
    } catch (err) {
      if (err instanceof PipedUnavailableError && signal?.aborted) throw err
      return []
    }
  }
}
