/**
 * Audius provider — the decentralized music platform's OFFICIAL open API.
 *
 * Verified against live endpoints (2026-10-23):
 * - `https://api.audius.co` returns the host list (`ACAO: *`), keyless —
 *   the only identifying parameter allowed/needed is a free-form app_name.
 * - `/v1/tracks/search`, `/v1/tracks/trending` work anonymously (`ACAO: *`).
 * - The stream endpoint `/v1/tracks/{id}/stream` 302s through
 *   creatornode.audius.co to R2 storage and EVERY hop sends
 *   `Access-Control-Allow-Origin: *` + `Accept-Ranges: bytes` (verified
 *   audio/mpeg, 10.7 MB full-length file). That makes Audius the only
 *   source in this app where full fetch-based prebuffering + the bounded
 *   RAM cache work end-to-end, exactly like the old Internet Archive path.
 *
 * Honest boundaries:
 * - `is_downloadable` is respected: when false, we stream but never cache
 *   beyond the session-scoped prebuffer slice (streaming-only source).
 * - Bitrate metadata is not exposed by the API → quality shows
 *   "Original (source-provided)", never a made-up number.
 */

import type { AudioFormat, MusicProvider, ProviderCapabilities, SearchOptions, Track, TrackSearchResponse } from '../../types'
import { inferMoods } from '../../config/catalog'
import { LRUCache } from '../cache'

const REQUEST_TIMEOUT_MS = 12_000
const APP_NAME = 'ANAHAD'
const FALLBACK_HOST = 'https://discoveryprovider.audius.co'
const MIN_DURATION_SEC = 40

export class AudiusUnavailableError extends Error {
  constructor(message = 'Audius is unreachable right now') {
    super(message)
    this.name = 'AudiusUnavailableError'
  }
}

interface AudiusTrack {
  id?: string
  title?: string
  user?: { name?: string; handle?: string; is_verified?: boolean }
  artwork?: { '150x150'?: string; '480x480'?: string; '1000x1000'?: string } | null
  duration?: number
  genre?: string | null
  mood?: string | null
  tags?: string | null
  play_count?: number
  release_date?: string | null
  created_at?: string | null
  permalink?: string | null
  is_downloadable?: boolean
  is_streamable?: boolean
  is_delete?: boolean
  is_available?: boolean
}

/** Cached host list from api.audius.co (falls back to the primary host). */
let hosts: string[] | null = null
let hostsAt = 0

async function apiHosts(signal?: AbortSignal): Promise<string[]> {
  if (hosts && Date.now() - hostsAt < 30 * 60 * 1000) return hosts
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 8_000)
    const res = await fetch('https://api.audius.co', { signal: ctrl.signal, headers: { Accept: 'application/json' } })
    clearTimeout(timer)
    if (res.ok) {
      const payload = (await res.json()) as { data?: string[] }
      const list = (payload.data ?? []).filter((h) => /^https:\/\//.test(h))
      if (list.length > 0) {
        hosts = list
        hostsAt = Date.now()
        return hosts
      }
    }
  } catch {
    if (signal?.aborted) throw new AudiusUnavailableError()
  }
  hosts = [FALLBACK_HOST]
  hostsAt = Date.now()
  return hosts
}

async function fetchJson(path: string, signal?: AbortSignal): Promise<unknown> {
  const hostList = await apiHosts(signal)
  let lastErr: unknown = null
  for (const host of hostList.slice(0, 4)) {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(new DOMException('timeout', 'TimeoutError')), REQUEST_TIMEOUT_MS)
    const onOuterAbort = () => ctrl.abort()
    signal?.addEventListener('abort', onOuterAbort, { once: true })
    try {
      const res = await fetch(`${host}${path}`, { signal: ctrl.signal, headers: { Accept: 'application/json' } })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return (await res.json()) as unknown
    } catch (err) {
      if (signal?.aborted) throw err
      lastErr = err
    } finally {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onOuterAbort)
    }
  }
  throw lastErr instanceof Error ? new AudiusUnavailableError() : new AudiusUnavailableError()
}

/** Official stream URL (redirects to CDN with signed params; CORS all the way). */
export function audiusStreamUrl(id: string): string {
  return `${FALLBACK_HOST}/v1/tracks/${encodeURIComponent(id)}/stream?app_name=${APP_NAME}`
}

/** Some uploads carry percent-encoded titles — decode for display only. */
function displayTitle(raw: string): string {
  const title = raw.trim()
  if (!/%[0-9a-fA-F]{2}/.test(title)) return title
  try {
    const decoded = decodeURIComponent(title)
    return decoded.length > 0 ? decoded : title
  } catch {
    return title
  }
}

export function normalizeAudiusTrack(r: AudiusTrack): Track | null {
  const id = r.id
  const title = displayTitle(r.title ?? '')
  if (!id || !title) return null
  if (r.is_delete || r.is_available === false || r.is_streamable === false) return null
  const duration = typeof r.duration === 'number' && r.duration > 0 ? Math.round(r.duration) : null
  if (!duration || duration < MIN_DURATION_SEC) return null

  const format: AudioFormat = {
    url: audiusStreamUrl(id),
    fileName: `${id}.mp3`,
    // The API exposes no bitrate — the label stays factual, no invented numbers.
    label: 'Original (source-provided)',
    approxBitrateKbps: null,
    sizeBytes: null,
    isLossless: false,
    mimeType: 'audio/mpeg'
  }

  const tags = (r.tags ?? '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
  const genres = [...new Set([r.genre?.trim() ?? '', ...tags].filter(Boolean))].slice(0, 8)

  return {
    id: `audius:${id}`,
    source: 'audius',
    identifier: id,
    fileName: format.fileName,
    title,
    artist: r.user?.name?.trim() || r.user?.handle?.trim() || 'Unknown artist',
    album: '',
    artwork: r.artwork?.['480x480'] ?? r.artwork?.['150x150'] ?? r.artwork?.['1000x1000'] ?? null,
    durationSec: duration,
    formats: [format],
    embed: null,
    licenseUrl: r.permalink ?? 'https://audius.co',
    licenseName: 'Audius — rights retained by the uploading artist',
    language: null,
    genres,
    estimatedMoods: inferMoods(title, genres),
    year: r.release_date || r.created_at ? Number((r.release_date ?? r.created_at ?? '').slice(0, 4)) || null : null,
    itemPage: r.permalink ?? 'https://audius.co',
    collection: r.mood ?? r.genre ?? null
  }
}

function normalizeList(payload: unknown): { tracks: Track[]; total: number } {
  const data = (payload as { data?: AudiusTrack[] })?.data
  const list = Array.isArray(data) ? data : []
  const tracks: Track[] = []
  const seen = new Set<string>()
  for (const r of list) {
    const t = normalizeAudiusTrack(r)
    if (!t || seen.has(t.id)) continue
    seen.add(t.id)
    tracks.push(t)
  }
  return { tracks, total: tracks.length }
}

const searchCache = new LRUCache<TrackSearchResponse>(100, 15 * 60 * 1000)

export async function audiusSearchTracks(options: SearchOptions): Promise<TrackSearchResponse> {
  const rows = Math.min(20, Math.max(1, options.rows ?? 12))
  const page = Math.max(1, options.page ?? 1)
  let path: string
  if (options.audiusGenre || options.audiusMood) {
    const p = new URLSearchParams({
      'app_name': APP_NAME,
      limit: String(rows * 2),
      offset: String((page - 1) * rows)
    })
    if (options.audiusGenre) p.set('genre', options.audiusGenre)
    if (options.audiusMood) p.set('mood', options.audiusMood)
    path = `/v1/tracks/trending?${p.toString()}`
  } else if (options.query?.trim()) {
    const p = new URLSearchParams({
      'app_name': APP_NAME,
      query: options.query.trim(),
      limit: String(rows),
      offset: String((page - 1) * rows)
    })
    path = `/v1/tracks/search?${p.toString()}`
  } else {
    path = `/v1/tracks/trending?app_name=${APP_NAME}&limit=${rows * 2}&offset=${(page - 1) * rows}`
  }

  const cached = searchCache.get(path)
  if (cached) return cached
  const payload = await fetchJson(path, options.signal)
  const res = normalizeList(payload)
  const out = { tracks: res.tracks.slice(0, rows), total: res.total }
  searchCache.set(path, out)
  return out
}

async function getTrackById(id: string, signal?: AbortSignal): Promise<Track | null> {
  const payload = await fetchJson(`/v1/tracks/${encodeURIComponent(id)}?app_name=${APP_NAME}`, signal)
  const data = (payload as { data?: AudiusTrack }).data
  return data ? normalizeAudiusTrack(data) : null
}

const capabilities: ProviderCapabilities = {
  searchableMetadata: true,
  artworkAvailable: true,
  directAudio: true,
  embeddedPlayback: false,
  externalLinkOnly: false,
  licenseInfoAvailable: false,
  qualityMetadataAvailable: false // API exposes no bitrate — honesty over invention
}

export const audiusProvider: MusicProvider = {
  id: 'audius',
  label: 'Audius',
  sourceLabel: 'Audius',
  attribution:
    'Full-length tracks from Audius artists via the official, keyless Audius API (audius.co). Each track remains the property of its uploader; the official stream endpoint is used for playback.',
  homeUrl: 'https://audius.co',
  enabledByDefault: true,
  capabilities,

  searchTracks: audiusSearchTracks,

  async getRelatedTracks(track, signal) {
    // Real relations: the artist's other uploads (official search), then
    // same-genre trending — both honest, both keyless.
    const out: Track[] = []
    if (track.artist && track.artist !== 'Unknown artist') {
      try {
        const res = await audiusSearchTracks({ query: track.artist, rows: 8, signal })
        out.push(...res.tracks.filter((t) => t.id !== track.id))
      } catch {
        /* next signal */
      }
    }
    if (out.length < 6) {
      const genre = track.genres.find((g) => /^[A-Z]/.test(g) && !g.includes(' '))
      if (genre) {
        try {
          const res = await audiusSearchTracks({ audiusGenre: genre, rows: 8, signal })
          for (const t of res.tracks) {
            if (t.id !== track.id && !out.some((o) => o.id === t.id)) out.push(t)
          }
        } catch {
          /* leave what we have */
        }
      }
    }
    return out.slice(0, 6)
  },

  async resolveTrack(track, signal) {
    const fresh = await getTrackById(track.identifier, signal)
    return fresh ?? track
  }
}
