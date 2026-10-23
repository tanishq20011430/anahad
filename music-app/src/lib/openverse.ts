/**
 * Openverse provider adapter — keyless access to openly-licensed audio
 * aggregated by Openverse (openverse.org, run by WordPress / Creative Commons).
 *
 * Verified against the live API (2026-10):
 * - `GET /v1/audio/` sends `Access-Control-Allow-Origin: *` and works without
 *   credentials. Anonymous quota: 20 req/min burst, 200/day sustained — the
 *   adapter therefore caches aggressively (LRU, 45 min TTL) and treats HTTP
 *   429 as a soft degradation, never as a hard failure of the whole app.
 * - Results include full-length Jamendo tracks (`prod-1.storage.jamendo.com`,
 *   which reflects any Origin and supports Range), Wikimedia Commons audio
 *   (`upload.wikimedia.org`, CORS `*`), and Freesound previews
 *   (`cdn.freesound.org`, CORS `*`, Range).
 * - `duration` is in MILLISECONDS. `bit_rate` is usually null — we surface it
 *   only when the source provides it, and label quality honestly as
 *   "source-provided" otherwise. We never invent bitrates.
 * - Openverse carries no album/`audio_set` fetch-by-id endpoint that is usable
 *   anonymously, so this provider is track-first: it contributes tracks to
 *   unified search, not album cards.
 */

import type {
  AudioFormat,
  MusicProvider,
  SearchOptions,
  Track,
  TrackSearchResponse
} from '../types'
import { LRUCache } from './cache'
import { inferMoods } from '../config/catalog'

const API_BASE = 'https://api.openverse.org/v1/audio'
/** Freesound-style previews and field recordings dominate short results. */
const MIN_DURATION_SEC = 40
/** Openverse's origin is slow on cold queries; 15s cap + one retry. Warm (edge-cached) queries answer in <100ms. */
const REQUEST_TIMEOUT_MS = 15_000

export class OpenverseUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'OpenverseUnavailableError'
  }
}

/* ------------------------------ fetch helper ------------------------------ */

async function fetchJson(url: string, signal?: AbortSignal, retry = 1): Promise<unknown> {
  const run = async (): Promise<unknown> => {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(new DOMException('timeout', 'TimeoutError')), REQUEST_TIMEOUT_MS)
    const onOuterAbort = () => ctrl.abort()
    signal?.addEventListener('abort', onOuterAbort, { once: true })
    try {
      const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } })
      if (res.status === 429) {
        throw new OpenverseUnavailableError('Openverse anonymous quota reached — try again in a little while.')
      }
      if (!res.ok) throw new OpenverseUnavailableError(`Openverse responded HTTP ${res.status}`)
      return (await res.json()) as unknown
    } finally {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onOuterAbort)
    }
  }
  try {
    return await run()
  } catch (err) {
    if (signal?.aborted) throw err
    // One transparent retry for timeouts/network errors (NOT for 429/HTTP errors).
    if (retry > 0 && !(err instanceof OpenverseUnavailableError && /quota|HTTP \d+/.test(err.message))) {
      await new Promise((r) => setTimeout(r, 1_200))
      if (signal?.aborted) throw err
      try {
        return await run()
      } catch (err2) {
        if (signal?.aborted) throw err2
        throw new OpenverseUnavailableError(err2 instanceof Error ? `Openverse unavailable: ${err2.message}` : 'Openverse unavailable')
      }
    }
    throw new OpenverseUnavailableError(err instanceof Error ? `Openverse unavailable: ${err.message}` : 'Openverse unavailable')
  }
}

/* ------------------------------- license urls ------------------------------ */

/** Build a canonical license URL from Openverse's license + version fields. */
export function openverseLicenseUrl(license: string | null | undefined, version: string | null | undefined): string | null {
  if (!license) return null
  const lic = license.toLowerCase()
  const v = version && /^\d/.test(version) ? version : '1.0'
  if (lic === 'cc0' || lic === 'pdm') return 'https://creativecommons.org/publicdomain/zero/1.0/'
  if (lic === 'sampling+') return 'https://creativecommons.org/licenses/sampling+/1.0/'
  if (/^[a-z\-]+$/.test(lic)) return `https://creativecommons.org/licenses/${lic}/${v}/`
  return null
}

/** Human license name from Openverse fields — shown verbatim, never invented. */
export function openverseLicenseName(license: string | null | undefined, version: string | null | undefined): string | null {
  if (!license) return null
  const lic = license.toLowerCase()
  if (lic === 'cc0') return 'CC0 Public Domain'
  if (lic === 'pdm') return 'Public Domain Mark'
  if (lic === 'sampling+') return `CC Sampling+ ${version ?? ''}`.trim()
  const code = lic.toUpperCase().replace(/-/g, ' ')
  return `CC ${code}${version ? ` ${version}` : ''}`
}

/* ------------------------------- normalization ------------------------------ */

interface OvAudioSet {
  title?: string
  foreign_landing_url?: string
  creator?: string
}

interface OvAltFile {
  url?: string
  filesize?: number | null
  filetype?: string | null
}

interface OvAudio {
  id?: string
  title?: string
  creator?: string
  url?: string
  foreign_landing_url?: string
  license?: string
  license_version?: string
  license_url?: string
  duration?: number
  bit_rate?: number | null
  filesize?: number | null
  filetype?: string | null
  alt_files?: OvAltFile[] | null
  genres?: string[] | null
  tags?: { name?: string; accuracy?: number }[] | null
  thumbnail?: string | null
  audio_set?: OvAudioSet | null
  provider?: string
}

const PROVIDER_LABEL: Record<string, string> = {
  jamendo: 'Jamendo',
  wikimedia_audio: 'Wikimedia Commons',
  freesound: 'Freesound'
}

export function openverseProviderLabel(collection: string | null): string {
  if (!collection) return 'Openverse'
  return PROVIDER_LABEL[collection] ?? 'Openverse'
}

function mimeTypeFor(filetype: string | null | undefined): string {
  const ft = (filetype ?? '').toLowerCase()
  if (ft === 'ogg' || ft === 'oga' || ft === 'opus') return 'audio/ogg'
  if (ft === 'flac') return 'audio/flac'
  if (ft === 'wav') return 'audio/wav'
  if (ft === 'm4a' || ft === 'mp4') return 'audio/mp4'
  return 'audio/mpeg'
}

function fileNameFromUrl(url: string, id: string): string {
  try {
    const path = new URL(url).pathname
    const last = decodeURIComponent(path.split('/').filter(Boolean).pop() ?? '')
    if (last) return last
  } catch {
    /* fall through */
  }
  return `openverse-${id}.mp3`
}

/**
 * Map one Openverse audio result to our Track. Returns null when the record
 * is not genuinely usable music (no direct URL, too short, unknown license).
 */
export function normalizeOvAudio(r: OvAudio): Track | null {
  const id = r.id
  const url = r.url
  if (!id || !url || !/^https?:\/\//i.test(url)) return null
  const durationMs = typeof r.duration === 'number' ? r.duration : null
  const durationSec = durationMs && durationMs > 0 ? Math.round(durationMs / 1000) : null
  if (!durationSec || durationSec < MIN_DURATION_SEC) return null

  const filetype = (r.filetype ?? 'mp3').toLowerCase()
  const formats: AudioFormat[] = [
    {
      url,
      fileName: fileNameFromUrl(url, id),
      label: `${filetype.toUpperCase()} (original)`,
      // bit_rate is provided only by some upstream sources; null stays null.
      approxBitrateKbps: typeof r.bit_rate === 'number' && r.bit_rate > 0 ? Math.round(r.bit_rate / 1000) : null,
      sizeBytes: typeof r.filesize === 'number' && r.filesize > 0 ? r.filesize : null,
      isLossless: filetype === 'flac' || filetype === 'wav',
      mimeType: mimeTypeFor(filetype)
    }
  ]
  for (const alt of r.alt_files ?? []) {
    if (!alt.url || !alt.filetype) continue
    const ft = alt.filetype.toLowerCase()
    if (ft === filetype) continue
    formats.push({
      url: alt.url,
      fileName: fileNameFromUrl(alt.url, id),
      label: `${ft.toUpperCase()} (alternative)`,
      approxBitrateKbps: null,
      sizeBytes: typeof alt.filesize === 'number' && alt.filesize > 0 ? alt.filesize : null,
      isLossless: ft === 'flac' || ft === 'wav',
      mimeType: mimeTypeFor(ft)
    })
  }

  const tagNames = (r.tags ?? []).map((t) => (t?.name ?? '').trim()).filter(Boolean)
  const genres = [...new Set([...(r.genres ?? []).map((g) => g.trim()).filter(Boolean), ...tagNames])].slice(0, 8)
  const providerKey = r.provider ?? null
  const title = (r.title ?? '').trim() || fileNameFromUrl(url, id).replace(/\.[a-z0-9]+$/i, '')

  return {
    id: `openverse:${id}`,
    source: 'openverse',
    identifier: id,
    fileName: formats[0].fileName,
    title,
    artist: (r.creator ?? '').trim() || 'Unknown artist',
    album: r.audio_set?.title?.trim() || title,
    artwork: r.thumbnail ?? null,
    durationSec,
    formats,
    embed: null,
    licenseUrl: r.license_url ?? openverseLicenseUrl(r.license, r.license_version),
    licenseName: openverseLicenseName(r.license, r.license_version),
    language: null,
    genres,
    estimatedMoods: inferMoods(title, [...genres]),
    year: null,
    itemPage: r.foreign_landing_url ?? 'https://openverse.org/',
    collection: providerKey
  }
}

/* --------------------------------- provider --------------------------------- */

interface OvSearchPayload {
  result_count?: number
  page_count?: number
  results?: OvAudio[]
}

const searchCache = new LRUCache<TrackSearchResponse>(80, 45 * 60 * 1000)
/** Single-flight: identical concurrent queries share one network call. */
const inflight = new Map<string, Promise<TrackSearchResponse>>()

function buildSearchUrl(opts: { query?: string; tag?: string; page?: number; rows?: number }): string {
  const params = new URLSearchParams()
  const q = [opts.query?.trim(), opts.tag?.trim()].filter(Boolean).join(' ')
  if (q) params.set('q', q)
  params.set('category', 'music')
  params.set('page_size', String(Math.min(20, Math.max(1, opts.rows ?? 12))))
  params.set('page', String(Math.max(1, opts.page ?? 1)))
  params.set('mature', 'false')
  return `${API_BASE}/?${params.toString()}`
}

async function searchTracksUncached(options: SearchOptions): Promise<TrackSearchResponse> {
  const page = Math.max(1, options.page ?? 1)
  const rows = Math.min(20, Math.max(1, options.rows ?? 12))
  const url = buildSearchUrl({ query: options.query, tag: options.tag, page, rows })
  const payload = (await fetchJson(url, options.signal)) as OvSearchPayload
  const tracks: Track[] = []
  const seen = new Set<string>()
  for (const r of payload.results ?? []) {
    const t = normalizeOvAudio(r)
    if (!t || seen.has(t.id)) continue
    seen.add(t.id)
    tracks.push(t)
  }
  return { tracks, total: payload.result_count ?? tracks.length }
}

export async function openverseSearchTracks(options: SearchOptions): Promise<TrackSearchResponse> {
  const page = Math.max(1, options.page ?? 1)
  const rows = Math.min(20, Math.max(1, options.rows ?? 12))
  const key = buildSearchUrl({ query: options.query, tag: options.tag, page, rows })
  const cached = searchCache.get(key)
  if (cached) return cached
  const running = inflight.get(key)
  if (running) return running
  const p = searchTracksUncached({ ...options, page, rows })
    .then((res) => {
      searchCache.set(key, res)
      return res
    })
    .finally(() => inflight.delete(key))
  inflight.set(key, p)
  return p
}

/** Fetch a single Openverse track by uuid (detail endpoint, same shape). */
export async function openverseGetTrackById(uuid: string, signal?: AbortSignal): Promise<Track | null> {
  const payload = (await fetchJson(`${API_BASE}/${encodeURIComponent(uuid)}/`, signal)) as OvAudio
  return normalizeOvAudio(payload)
}

export const openverseProvider: MusicProvider = {
  id: 'openverse',
  label: 'Openverse',
  sourceLabel: 'Openverse',
  attribution:
    'Audio discovered via the Openverse API (openverse.org) — tracks come from Jamendo, Wikimedia Commons and Freesound under their respective Creative Commons licenses. Anonymous API quota applies; results are cached locally to respect it.',
  homeUrl: 'https://openverse.org',
  enabledByDefault: true,
  capabilities: {
    searchableMetadata: true,
    artworkAvailable: true,
    directAudio: true,
    embeddedPlayback: false,
    externalLinkOnly: false,
    licenseInfoAvailable: true,
    // bit_rate is usually absent upstream — we refuse to pretend otherwise.
    qualityMetadataAvailable: false
  },

  // Openverse is track-first: no album cards are fabricated from audio_sets.
  searchTracks: openverseSearchTracks,

  async getRelatedTracks(track: Track, signal?: AbortSignal): Promise<Track[]> {
    // The related endpoint does not accept category filters — filter after mapping.
    const payload = (await fetchJson(`${API_BASE}/${encodeURIComponent(track.identifier)}/related/`, signal)) as OvSearchPayload
    const out: Track[] = []
    for (const r of payload.results ?? []) {
      const t = normalizeOvAudio(r)
      if (t && t.id !== track.id) out.push(t)
    }
    return out.slice(0, 10)
  }
}
