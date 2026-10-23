/**
 * Internet Archive provider adapter.
 *
 * - Metadata/search: public `advancedsearch.php` + `metadata/{id}` JSON APIs
 *   (both send `Access-Control-Allow-Origin: *`, verified 2026).
 * - Playback: direct item file URLs via `archive.org/download/...`.
 *   The HTML5 <audio> element follows the 302 redirect to the storage node;
 *   plain media playback does not require CORS.
 * - Licenses: item `licenseurl` is surfaced per track; collections like
 *   `etree` are band-approved live recordings. Nothing is assumed public
 *   domain without explicit license data — labels stay honest.
 */

import type { AlbumResult, AudioFormat, MusicProvider, SearchOptions, SearchResponse, Track } from '../types'
import { computeBitrateKbps, escapeLucene, parseLength, parseYear, prettifyFileName } from './format'
import { LRUCache } from './cache'

const SEARCH_URL = 'https://archive.org/advancedsearch.php'
const METADATA_URL = 'https://archive.org/metadata'
const DOWNLOAD_URL = 'https://archive.org/download'
const DETAILS_URL = 'https://archive.org/details'
const IMAGE_URL = 'https://archive.org/services/img'

export function itemArtwork(identifier: string): string {
  return `${IMAGE_URL}/${encodeURIComponent(identifier)}`
}
export function itemPage(identifier: string): string {
  return `${DETAILS_URL}/${encodeURIComponent(identifier)}`
}
export function fileDownloadUrl(identifier: string, fileName: string): string {
  // Encode each path segment, keep '/' separators.
  const enc = fileName.split('/').map(encodeURIComponent).join('/')
  return `${DOWNLOAD_URL}/${encodeURIComponent(identifier)}/${enc}`
}

/* ------------------------------- query builder ------------------------------ */

export interface RawQuery {
  clause: string
  sort: 'relevance' | 'downloads' | 'date'
}

export function buildQuery(options: SearchOptions): RawQuery {
  const parts: string[] = ['mediatype:(audio)']
  const playableOnly = options.playableOnly !== false
  if (playableOnly) parts.push('format:(MP3)')

  const q = escapeLucene(options.query ?? '')
  if (q) parts.push(`(${q})`)
  if (options.genre) parts.push(`(${options.genre})`)
  if (options.mood) parts.push(`(${options.mood})`)
  if (options.language) parts.push(`(${options.language})`)
  if (options.collection) parts.push(`collection:(${options.collection})`)
  if (options.creator) {
    const name = options.creator.replace(/["\\]/g, ' ').replace(/\s+/g, ' ').trim()
    if (name) parts.push(`creator:("${name}")`)
  }

  return { clause: parts.join(' AND '), sort: options.sort ?? 'downloads' }
}

export function buildSearchUrl(raw: RawQuery, page: number, rows: number): string {
  const params = new URLSearchParams()
  params.set('q', raw.clause)
  for (const f of ['identifier', 'title', 'creator', 'year', 'date', 'subject', 'language', 'licenseurl', 'downloads', 'collection']) {
    params.append('fl[]', f)
  }
  params.set('rows', String(rows))
  params.set('page', String(page))
  params.set('output', 'json')
  if (raw.sort === 'downloads') params.append('sort[]', 'downloads desc')
  if (raw.sort === 'date') params.append('sort[]', 'date desc')
  return `${SEARCH_URL}?${params.toString()}`
}

/* ------------------------------- fetch helpers ------------------------------ */

const DEFAULT_TIMEOUT_MS = 12_000

async function fetchWithTimeout(url: string, signal?: AbortSignal, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<Response> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(new DOMException('timeout', 'TimeoutError')), timeoutMs)
  const onOuterAbort = () => ctrl.abort()
  signal?.addEventListener('abort', onOuterAbort)
  try {
    return await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } })
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onOuterAbort)
  }
}

export async function fetchJsonWithRetry<T>(url: string, signal?: AbortSignal, retries = 1): Promise<T> {
  let lastErr: unknown
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetchWithTimeout(url, signal)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return (await res.json()) as T
    } catch (err) {
      if (signal?.aborted) throw err
      lastErr = err
      if (attempt < retries) await new Promise((r) => setTimeout(r, 600))
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('fetch failed')
}

/* --------------------------------- searching -------------------------------- */

type Doc = Record<string, unknown>

function asString(v: unknown): string | null {
  if (typeof v === 'string' && v.trim()) return v.trim()
  if (typeof v === 'number') return String(v)
  if (Array.isArray(v)) {
    const s = v.find((x) => typeof x === 'string' && x.trim())
    return typeof s === 'string' ? s.trim() : null
  }
  return null
}
function asStringArray(v: unknown): string[] {
  if (typeof v === 'string') return v.trim() ? [v.trim()] : []
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0).map((s) => s.trim())
  return []
}

export function normalizeDoc(doc: Doc): AlbumResult | null {
  const identifier = asString(doc.identifier)
  if (!identifier) return null
  return {
    identifier,
    source: 'internet-archive',
    title: asString(doc.title) ?? identifier,
    creator: asString(doc.creator) ?? 'Unknown artist',
    year: asString(doc.year) ? Number(asString(doc.year)) : parseYear(asString(doc.date)),
    artwork: itemArtwork(identifier),
    downloads: typeof doc.downloads === 'number' ? doc.downloads : 0,
    subjects: asStringArray(doc.subject),
    language: asString(doc.language),
    licenseUrl: asString(doc.licenseurl),
    itemPage: itemPage(identifier)
  }
}

interface SearchPayload {
  response?: { numFound?: number; start?: number; docs?: Doc[] }
}

/* ------------------------------ item -> tracks ------------------------------ */

interface IAFile {
  name: string
  format?: string
  size?: string
  length?: string
  track?: string
  title?: string
}

interface IAMetadata {
  metadata?: Record<string, unknown>
  files?: IAFile[]
}

const AUDIO_EXT = /\.(mp3|flac|ogg|oga|m4a)$/i
const DERIV_SUFFIX = /_(64kb|96kb|128kb|192kb|224kb|256kb|320kb|vbr|sample|preview)$/i
const NON_AUDIO = /__ia_thumb|_sample|_preview|\.(png|jpg|jpeg|gif|txt|xml|json|sfk|cue|nfo|md5|sha1)$/i

function mimeTypeFor(name: string): string {
  if (/\.flac$/i.test(name)) return 'audio/flac'
  if (/\.(ogg|oga)$/i.test(name)) return 'audio/ogg'
  if (/\.m4a$/i.test(name)) return 'audio/mp4'
  return 'audio/mpeg'
}

interface FileGroup {
  stem: string
  files: IAFile[]
}

export function groupAudioFiles(files: IAFile[]): FileGroup[] {
  const groups = new Map<string, FileGroup>()
  for (const f of files) {
    if (!f.name || !AUDIO_EXT.test(f.name)) continue
    if (NON_AUDIO.test(f.name)) continue
    if (f.format && /sample/i.test(f.format)) continue
    const stem = f.name.replace(AUDIO_EXT, '').replace(DERIV_SUFFIX, '')
    const g = groups.get(stem) ?? { stem, files: [] }
    g.files.push(f)
    groups.set(stem, g)
  }
  // Drop groups that contain only sample/preview derivatives
  return [...groups.values()].filter((g) =>
    g.files.some((f) => !/(_sample|_preview)/i.test(f.name))
  )
}

function sizeOf(f: IAFile): number {
  const n = Number(f.size)
  return Number.isFinite(n) && n > 0 ? n : 0
}

function buildFormats(group: FileGroup, durationSec: number | null): AudioFormat[] {
  const byLabel = new Map<string, AudioFormat>()
  for (const f of group.files) {
    if (/(_sample|_preview)/i.test(f.name)) continue
    const isFlac = /\.flac$/i.test(f.name)
    const label = (f.format ?? (isFlac ? 'Flac' : 'MP3')).trim()
    const fmt: AudioFormat = {
      url: '', // filled by caller (needs identifier)
      fileName: f.name,
      label,
      approxBitrateKbps: computeBitrateKbps(sizeOf(f), durationSec),
      sizeBytes: sizeOf(f) || null,
      isLossless: isFlac || /flac|wav|lossless/i.test(label),
      mimeType: mimeTypeFor(f.name)
    }
    const existing = byLabel.get(label)
    if (!existing) {
      byLabel.set(label, fmt)
      continue
    }
    // Prefer the original (no derivative suffix); among equals prefer the larger file.
    const isOriginal = !DERIV_SUFFIX.test(f.name.replace(AUDIO_EXT, ''))
    const existingIsOriginal = !DERIV_SUFFIX.test(existing.fileName.replace(AUDIO_EXT, ''))
    if ((isOriginal && !existingIsOriginal) || (isOriginal === existingIsOriginal && sizeOf(f) > (existing.sizeBytes ?? 0))) {
      byLabel.set(label, fmt)
    }
  }
  const list = [...byLabel.values()]
  // Best-first: lossless, then by bitrate desc (nulls last)
  list.sort((a, b) => {
    if (a.isLossless !== b.isLossless) return a.isLossless ? -1 : 1
    return (b.approxBitrateKbps ?? 0) - (a.approxBitrateKbps ?? 0)
  })
  return list
}

export function normalizeItemToTracks(payload: IAMetadata, identifier: string): Track[] {
  const meta = payload.metadata ?? {}
  const files = payload.files ?? []
  const title = asString(meta.title) ?? identifier
  const artist = asString(meta.creator) ?? 'Unknown artist'
  const licenseUrl = asString(meta.licenseurl)
  const language = asString(meta.language)
  const collections = asStringArray(meta.collection)
  const subjects = asStringArray(meta.subject)
  const year = asString(meta.year) ? Number(asString(meta.year)) : parseYear(asString(meta.date))

  const groups = groupAudioFiles(files)
  const tracks: Track[] = []
  for (const g of groups) {
    const primary =
      g.files.find((f) => f.name.replace(AUDIO_EXT, '').replace(DERIV_SUFFIX, '') === g.stem && /\.mp3$/i.test(f.name)) ??
      [...g.files].sort((a, b) => sizeOf(b) - sizeOf(a))[0]
    if (!primary) continue
    const lengths = g.files.map((f) => parseLength(f.length)).filter((n): n is number => n !== null)
    const durationSec = parseLength(primary.length) ?? (lengths.length ? Math.max(...lengths) : null)
    const formats = buildFormats(g, durationSec).map((f) => ({ ...f, url: fileDownloadUrl(identifier, f.fileName) }))
    if (formats.length === 0) continue
    const trackNum = primary.track ? parseInt(primary.track, 10) : NaN
    tracks.push({
      id: `internet-archive:${identifier}:${primary.name}`,
      source: 'internet-archive',
      identifier,
      fileName: primary.name,
      title: asString(primary.title) ?? prettifyFileName(g.stem.split('/').pop() ?? g.stem),
      artist,
      album: title,
      artwork: itemArtwork(identifier),
      durationSec,
      formats,
      licenseUrl,
      language,
      genres: subjects,
      estimatedMoods: [], // filled by inferMoods() in config/moods.ts
      year: Number.isFinite(year) ? (year as number) : null,
      itemPage: itemPage(identifier),
      collection: collections[0] ?? null
    })
    void trackNum
  }
  tracks.sort((a, b) => a.fileName.localeCompare(b.fileName, undefined, { numeric: true, sensitivity: 'base' }))
  return tracks
}

/* --------------------------------- provider --------------------------------- */

const searchCache = new LRUCache<SearchResponse>(120, 8 * 60 * 1000)
const tracksCache = new LRUCache<Track[]>(300, 20 * 60 * 1000)

export const internetArchiveProvider: MusicProvider = {
  id: 'internet-archive',
  label: 'Internet Archive',
  attribution: 'Audio and metadata served from archive.org (Internet Archive). Licenses vary per item — see each track’s details.',
  capabilities: {
    searchableMetadata: true,
    artworkAvailable: true,
    directAudio: true,
    embeddedPlayback: false,
    externalLinkOnly: false,
    licenseInfoAvailable: true,
    qualityMetadataAvailable: true
  },

  async searchAlbums(options: SearchOptions): Promise<SearchResponse> {
    const page = Math.max(1, options.page ?? 1)
    const rows = Math.min(60, Math.max(6, options.rows ?? 24))
    const raw = buildQuery(options)
    const url = buildSearchUrl(raw, page, rows)
    const cacheKey = url
    const cached = searchCache.get(cacheKey)
    if (cached) return cached

    const payload = await fetchJsonWithRetry<SearchPayload>(url, options.signal)
    const docs = payload.response?.docs ?? []
    const albums: AlbumResult[] = []
    const seen = new Set<string>()
    for (const doc of docs) {
      const a = normalizeDoc(doc)
      if (!a) continue
      const key = `${a.title.toLowerCase()}|${a.creator.toLowerCase()}`
      if (seen.has(key)) continue // duplicate detection across results
      seen.add(key)
      albums.push(a)
    }
    const result: SearchResponse = { albums, total: payload.response?.numFound ?? 0, page, rows }
    searchCache.set(cacheKey, result)
    return result
  },

  async getItemTracks(identifier: string, signal?: AbortSignal): Promise<Track[]> {
    const cached = tracksCache.get(identifier)
    if (cached) return cached
    const payload = await fetchJsonWithRetry<IAMetadata>(`${METADATA_URL}/${encodeURIComponent(identifier)}`, signal)
    const tracks = normalizeItemToTracks(payload, identifier)
    tracksCache.set(identifier, tracks)
    return tracks
  }
}

/* ------------------------------ quality picking ------------------------------ */

/**
 * Choose the best playable format for a quality preference, given what the
 * browser actually supports. Never invents bitrates — only chooses among the
 * formats the source truly provides.
 */
export function pickFormat(
  track: Track,
  quality: 'auto' | 'highest' | 'data-saver' | 'standard' | 'high' | 'lossless',
  canPlay: (type: string) => boolean
): AudioFormat | null {
  const playable = track.formats.filter((f) => canPlay(f.mimeType) || canPlay(f.url))
  if (playable.length === 0) return null
  const withBitrate = playable.filter((f) => f.approxBitrateKbps !== null)
  const sortedByBitrate = [...(withBitrate.length ? withBitrate : playable)].sort(
    (a, b) => (a.approxBitrateKbps ?? 0) - (b.approxBitrateKbps ?? 0)
  )

  switch (quality) {
    case 'lossless': {
      const flac = playable.find((f) => f.isLossless)
      if (flac) return flac
      return null // genuine lossless not available — caller decides fallback
    }
    case 'highest': {
      const flac = playable.find((f) => f.isLossless)
      if (flac) return flac
      return sortedByBitrate[sortedByBitrate.length - 1] ?? playable[0]
    }
    case 'data-saver':
      return sortedByBitrate[0] ?? playable[0]
    case 'standard': {
      const cands = sortedByBitrate.filter((f) => (f.approxBitrateKbps ?? Infinity) <= 128)
      return (cands[cands.length - 1] ?? sortedByBitrate[0]) ?? playable[0]
    }
    case 'high': {
      const cands = sortedByBitrate.filter((f) => (f.approxBitrateKbps ?? 0) >= 192)
      return (cands[0] ?? sortedByBitrate[sortedByBitrate.length - 1]) ?? playable[0]
    }
    case 'auto':
    default: {
      // Balanced default: best MP3 up to ~192kbps, else best available.
      const mp3s = sortedByBitrate.filter((f) => !f.isLossless && (f.approxBitrateKbps ?? 0) <= 192)
      if (mp3s.length) return mp3s[mp3s.length - 1]
      return sortedByBitrate[sortedByBitrate.length - 1] ?? playable[0]
    }
  }
}
