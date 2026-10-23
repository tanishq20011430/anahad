/**
 * Artists — search and "top hits" from Apple's iTunes Search API.
 *
 * Why iTunes: it's keyless, allows browser requests (CORS *), and orders
 * results by Apple's popularity-weighted relevance, so an artist's biggest
 * songs come first (verified 2026-10-23: Kishore Kumar → "Pal Pal Dil Ke Paas",
 * "O Mere Dil Ke Chain", "Ek Ajnabee Haseena Se"…). Deezer's artist top-tracks
 * came back empty for Indian catalog and has no CORS.
 *
 * Hits play through YouTube via the same play-time lookup as Charts.
 */

import type { Track } from '../types'
import { appleArtwork, appleSongToTrack, splitArtists } from './appleTracks'
import { getChartCountry } from './charts'

const ITUNES = 'https://itunes.apple.com'
const CACHE_MS = 60 * 60 * 1000

export interface ArtistSummary {
  /** Apple artist id (informational; artists are addressed by name). */
  id: number
  name: string
  genre: string | null
}

interface ItunesSong {
  trackId: number
  trackName: string
  artistName: string
  collectionName?: string
  artworkUrl100?: string
  releaseDate?: string
  trackTimeMillis?: number
  primaryGenreName?: string
  trackViewUrl?: string
  isStreamable?: boolean
}

interface ItunesArtist {
  artistId: number
  artistName: string
  primaryGenreName?: string
}

function norm(s: string): string {
  return s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ').trim()
}

/** Song title without version/source suffixes, for de-duplicating re-releases. */
export function baseTitle(title: string): string {
  return norm(title.replace(/\s*[([][^)\]]*[)\]]/g, '').replace(/\s+-\s+.*$/, ''))
}

/** True when `name` is one of the individual artists credited on `credit`. */
export function isCredited(name: string, credit: string): boolean {
  const want = norm(name)
  return splitArtists(credit).some((a) => norm(a) === want)
}

async function itunesGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  let lastErr: unknown
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(`${ITUNES}${path}`, { signal, headers: { Accept: 'application/json' } })
      if (!res.ok) throw new Error(`iTunes returned HTTP ${res.status}`)
      return (await res.json()) as T
    } catch (err) {
      lastErr = err
      if (signal?.aborted) throw err
      if (attempt < 2) await new Promise((r) => setTimeout(r, 600))
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('iTunes is unavailable right now')
}

/** Artists matching a search query, best match first. */
export async function searchArtists(query: string, limit = 4, signal?: AbortSignal): Promise<ArtistSummary[]> {
  const q = query.trim()
  if (q.length < 2) return []
  const params = new URLSearchParams({ term: q, entity: 'musicArtist', country: getChartCountry(), limit: String(limit * 2) })
  const data = await itunesGet<{ results?: ItunesArtist[] }>(`/search?${params}`, signal)
  const seen = new Set<string>()
  const out: ArtistSummary[] = []
  // Apple lists the same name several times (one entry per catalog region/genre); keep the first.
  for (const a of data.results ?? []) {
    const key = norm(a.artistName)
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push({ id: a.artistId, name: a.artistName, genre: a.primaryGenreName ?? null })
    if (out.length >= limit) break
  }
  return out
}

export interface ArtistHits {
  name: string
  /** Artwork of the top hit, used as the artist's picture. */
  artwork: string | null
  tracks: Track[]
}

/** Pure part of fetchArtistHits: filter to the artist's credits, de-duplicate, keep order. */
export function hitsFromSongs(name: string, songs: ItunesSong[], max = 100): Track[] {
  const seen = new Set<string>()
  const tracks: Track[] = []
  for (const s of songs) {
    if (!s.trackId || !s.trackName || !isCredited(name, s.artistName)) continue
    const key = baseTitle(s.trackName)
    if (!key || seen.has(key)) continue
    seen.add(key)
    tracks.push(
      appleSongToTrack(
        {
          id: s.trackId,
          title: s.trackName,
          artist: s.artistName,
          album: s.collectionName,
          artwork: s.artworkUrl100,
          releaseDate: s.releaseDate,
          durationMs: s.trackTimeMillis,
          genres: s.primaryGenreName && s.primaryGenreName !== 'Music' ? [s.primaryGenreName] : [],
          url: s.trackViewUrl
        },
        'itunes'
      )
    )
    if (tracks.length >= max) break
  }
  return tracks
}

const hitsCache = new Map<string, { at: number; hits: Promise<ArtistHits> }>()

/**
 * An artist's most popular songs (up to 100), in Apple's popularity order.
 * Only songs that credit this exact artist are kept (Apple's artist search
 * also returns e.g. "G.V. Prakash Kumar" for "Kishore Kumar"), and re-releases
 * of the same song are collapsed to their most popular version.
 */
export function fetchArtistHits(name: string, signal?: AbortSignal): Promise<ArtistHits> {
  const key = `${getChartCountry()}:${norm(name)}`
  const hit = hitsCache.get(key)
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.hits
  const params = new URLSearchParams({ term: name, entity: 'song', attribute: 'artistTerm', country: getChartCountry(), limit: '200' })
  const hits = itunesGet<{ results?: ItunesSong[] }>(`/search?${params}`, signal).then((data) => {
    const tracks = hitsFromSongs(name, data.results ?? [])
    const first = (data.results ?? []).find((s) => isCredited(name, s.artistName))
    return { name: first ? (splitArtists(first.artistName).find((a) => norm(a) === norm(name)) ?? name) : name, artwork: appleArtwork(first?.artworkUrl100), tracks }
  })
  hitsCache.set(key, { at: Date.now(), hits })
  hits.catch(() => hitsCache.delete(key))
  return hits
}

/**
 * The artist to continue with after `track`: the first credited artist for
 * catalog tracks, the uploader for YouTube/Audius. Null for radio/Mixcloud,
 * where the "artist" is a station country or a show host.
 */
export function continuationArtist(track: Track): string | null {
  if (track.source === 'radio' || track.source === 'mixcloud' || track.isLive) return null
  const first = splitArtists(track.artist)[0]
  if (!first || /^unknown/i.test(first)) return null
  return first
}

/** Test hook. */
export function resetArtistsCache(): void {
  hitsCache.clear()
}
