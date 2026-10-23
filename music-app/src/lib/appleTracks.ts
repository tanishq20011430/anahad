/**
 * Apple catalog song → Anahad Track.
 *
 * Shared by Charts (Apple Music RSS) and Artists (iTunes Search). Apple
 * provides the ranking and metadata only; the resulting track carries a
 * `lookup` query that resolve.ts turns into a YouTube video at play time.
 */

import type { Track } from '../types'

export interface AppleSong {
  /** Apple song/track id (same id space in RSS feeds and the iTunes API). */
  id: string | number
  title: string
  artist: string
  album?: string | null
  /** Any Apple artwork URL; resized to 600px. */
  artwork?: string | null
  releaseDate?: string | null
  durationMs?: number | null
  genres?: string[]
  url?: string | null
}

/** Removes "(feat. …)" / "[feat. …]" — YouTube titles rarely match them exactly. */
export function stripFeat(title: string): string {
  return title.replace(/\s*[([](feat\.?|ft\.?|featuring)\s[^)\]]*[)\]]/gi, '').trim()
}

/** Apple's image service serves any size from the same path. */
export function appleArtwork(url: string | null | undefined, size = 600): string | null {
  return url ? url.replace(/\/\d+x\d+bb\./, `/${size}x${size}bb.`) : null
}

export function appleSongToTrack(song: AppleSong, idPrefix: string): Track {
  const title = song.title.trim()
  const artist = song.artist.trim()
  return {
    id: `youtube:${idPrefix}-${song.id}`,
    source: 'youtube',
    identifier: `${idPrefix}-${song.id}`,
    fileName: '',
    title,
    artist,
    album: (song.album ?? '').replace(/\s*\((Original )?(Motion Picture )?Soundtrack\)/i, '').trim(),
    artwork: appleArtwork(song.artwork),
    durationSec: song.durationMs ? Math.round(song.durationMs / 1000) : null,
    formats: [],
    embed: null,
    lookup: { query: `${stripFeat(title)} ${artist}` },
    licenseUrl: 'https://www.youtube.com/t/terms',
    licenseName: 'YouTube Terms of Service (official embed)',
    language: null,
    genres: song.genres ?? [],
    estimatedMoods: [],
    year: song.releaseDate ? Number(song.releaseDate.slice(0, 4)) || null : null,
    itemPage: song.url ?? 'https://music.apple.com',
    collection: null
  }
}

/**
 * Splits a credit line into individual artists:
 * "Asha Bhosle, Kishore Kumar & R.D. Burman" → ["Asha Bhosle", "Kishore Kumar", "R.D. Burman"].
 */
export function splitArtists(credit: string): string[] {
  return credit
    .split(/\s*(?:,|&|\+|\bfeat\.?\s|\bft\.?\s|\bfeaturing\s|\bx\s|\bwith\s)\s*/i)
    .map((a) => a.replace(/\s*-\s*Topic$/i, '').replace(/VEVO$/i, '').trim())
    .filter(Boolean)
}
