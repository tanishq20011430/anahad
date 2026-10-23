/**
 * Radio Browser provider — the open radio-station directory
 * (radio-browser.info, community-run, used by many open-source players).
 *
 * Verified against the live API (2026-10-23):
 * - `de1.api.radio-browser.info` responds HTTP 200 with
 *   `Access-Control-Allow-Origin: *`, keyless.
 * - Station records carry REAL codec + bitrate metadata (e.g. "AAC 128")
 *   and `url_resolved` stream endpoints.
 *
 * Honest boundaries:
 * - Only HTTPS streams are offered. HTTP streams would break on any HTTPS
 *   deployment (mixed content), so they are filtered out, not proxied.
 * - Streams are LIVE: no duration, no seeking. The UI shows a LIVE badge
 *   and disables the progress bar.
 * - Bitrate/codec come verbatim from the directory — never invented.
 */

import type { AudioFormat, MusicProvider, ProviderCapabilities, SearchOptions, Track, TrackSearchResponse } from '../../types'
import { inferMoods } from '../../config/catalog'
import { LRUCache } from '../cache'

const API_SERVERS = ['de1.api.radio-browser.info', 'nl1.api.radio-browser.info', 'at1.api.radio-browser.info']
const REQUEST_TIMEOUT_MS = 12_000
const MIN_VOTES = 0

export class RadioUnavailableError extends Error {
  constructor() {
    super('Radio directory is unreachable right now')
    this.name = 'RadioUnavailableError'
  }
}

interface RbStation {
  stationuuid?: string
  name?: string
  url_resolved?: string
  url?: string
  homepage?: string
  favicon?: string
  tags?: string
  country?: string
  language?: string
  codec?: string
  bitrate?: number
  votes?: number
  lastcheckok?: number
  hls?: number
}

async function fetchJson(path: string, signal?: AbortSignal): Promise<unknown> {
  let lastErr: unknown = null
  for (const server of API_SERVERS) {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(new DOMException('timeout', 'TimeoutError')), REQUEST_TIMEOUT_MS)
    const onOuterAbort = () => ctrl.abort()
    signal?.addEventListener('abort', onOuterAbort, { once: true })
    try {
      const res = await fetch(`https://${server}${path}`, { signal: ctrl.signal, headers: { Accept: 'application/json' } })
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
  throw lastErr instanceof Error ? new RadioUnavailableError() : new RadioUnavailableError()
}

export function mimeTypeForCodec(codec: string | undefined): string {
  const c = (codec ?? '').toUpperCase()
  if (c.includes('AAC')) return 'audio/aac'
  if (c.includes('OGG') || c.includes('VORBIS') || c.includes('OPUS')) return 'audio/ogg'
  if (c.includes('FLAC')) return 'audio/flac'
  return 'audio/mpeg' // MP3 and unknown codecs — browsers negotiate stream types
}

/** Map a directory station to a Track. Returns null for unusable entries. */
export function normalizeStation(r: RbStation): Track | null {
  const id = r.stationuuid
  const name = (r.name ?? '').trim()
  const streamUrl = (r.url_resolved ?? r.url ?? '').trim()
  if (!id || !name || !streamUrl) return null
  if (!streamUrl.startsWith('https://')) return null // mixed-content honesty
  if (r.lastcheckok === 0) return null
  if (r.hls === 1) return null // HLS needs a different transport; be honest, not broken

  const codec = (r.codec ?? '').trim()
  const bitrate = typeof r.bitrate === 'number' && r.bitrate > 0 ? r.bitrate : null
  const format: AudioFormat = {
    url: streamUrl,
    fileName: `${name}.stream`,
    label: `${codec || 'Stream'}${bitrate ? ` ${bitrate} kbps` : ''}`.trim(),
    approxBitrateKbps: bitrate,
    sizeBytes: null,
    isLossless: (codec ?? '').toUpperCase().includes('FLAC'),
    mimeType: mimeTypeForCodec(codec)
  }

  const tags = (r.tags ?? '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 8)
  const language = (r.language ?? '').split(',')[0]?.trim() || null

  return {
    id: `radio:${id}`,
    source: 'radio',
    identifier: id,
    fileName: format.fileName,
    title: name,
    artist: r.country?.trim() || 'Radio station',
    album: '',
    artwork: r.favicon?.trim() || null,
    durationSec: null,
    isLive: true,
    formats: [format],
    embed: null,
    licenseUrl: r.homepage?.trim() || 'https://www.radio-browser.info/',
    licenseName: 'Community radio directory entry — stream remains the broadcaster\'s',
    language,
    genres: tags,
    estimatedMoods: inferMoods(name, tags),
    year: null,
    itemPage: r.homepage?.trim() || 'https://www.radio-browser.info/',
    collection: 'radio-station'
  }
}

function normalizeList(payload: unknown): { tracks: Track[]; total: number } {
  const list = Array.isArray(payload) ? (payload as RbStation[]) : []
  const tracks: Track[] = []
  const seen = new Set<string>()
  for (const r of list) {
    if ((r.votes ?? 0) < MIN_VOTES) continue
    const t = normalizeStation(r)
    if (!t || seen.has(t.id)) continue
    seen.add(t.id)
    tracks.push(t)
  }
  return { tracks, total: tracks.length }
}

const searchCache = new LRUCache<TrackSearchResponse>(120, 15 * 60 * 1000)

function buildPath(opts: SearchOptions): string {
  const p = new URLSearchParams({
    limit: String(Math.min(30, Math.max(1, opts.rows ?? 12))),
    hidebroken: 'true',
    order: 'votes',
    reverse: 'true'
  })
  if (opts.radioName) p.set('name', opts.radioName)
  else if (opts.radioTag) p.set('tag', opts.radioTag)
  else if (opts.radioLanguage) p.set('language', opts.radioLanguage)
  else if (opts.query?.trim()) p.set('name', opts.query.trim())
  else p.set('tag', 'music')
  return `/json/stations/search?${p.toString()}`
}

export async function radioSearchTracks(options: SearchOptions): Promise<TrackSearchResponse> {
  const path = buildPath(options)
  const cached = searchCache.get(path)
  if (cached) return cached
  const payload = await fetchJson(path, options.signal)
  const res = normalizeList(payload)
  searchCache.set(path, res)
  return res
}

/** Resolve one station by uuid via the directory's /json/url endpoint. */
export async function radioStationByUuid(uuid: string, signal?: AbortSignal): Promise<Track | null> {
  const payload = await fetchJson(`/json/url/${encodeURIComponent(uuid)}`, signal)
  const station = Array.isArray(payload) ? (payload as RbStation[])[0] : (payload as RbStation)
  return station ? normalizeStation(station) : null
}

const capabilities: ProviderCapabilities = {
  searchableMetadata: true,
  artworkAvailable: true,
  directAudio: true,
  embeddedPlayback: false,
  externalLinkOnly: false,
  licenseInfoAvailable: false,
  // Codec + bitrate are real directory metadata, so the quality picker can
  // show exactly what the station broadcasts — and no more.
  qualityMetadataAvailable: true
}

export const radioProvider: MusicProvider = {
  id: 'radio',
  label: 'Radio Browser',
  sourceLabel: 'Radio · Radio Browser',
  attribution:
    'Live radio stations from the radio-browser.info open directory (community-maintained). Streams remain the property of their broadcasters; codec and bitrate metadata come from the directory.',
  homeUrl: 'https://www.radio-browser.info/',
  enabledByDefault: true,
  capabilities,

  searchTracks: radioSearchTracks,

  async resolveTrack(track, signal) {
    const fresh = await radioStationByUuid(track.identifier, signal)
    return fresh ?? track
  },

  async getRelatedTracks(track, signal) {
    // Real relation: stations sharing the directory's own tags.
    const tag = track.genres[0]
    if (!tag) return []
    try {
      const res = await radioSearchTracks({ radioTag: tag, rows: 8, signal })
      return res.tracks.filter((t) => t.id !== track.id).slice(0, 6)
    } catch {
      return []
    }
  }
}
