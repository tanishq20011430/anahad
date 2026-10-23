/**
 * Shared track resolution: fill in playable formats for tracks that carry
 * references only (imported playlist entries, preloaded queue entries).
 * Multi-source aware — dispatches on track.source. YouTube/Mixcloud tracks
 * are self-contained (their playback is the official embed), so they resolve
 * to themselves by design.
 */

import type { Track } from '../types'
import { audiusProvider } from './providers/audiusProvider'
import { openverseGetTrackById } from './openverse'
import { youtubeSearchTracks } from './providers/youtubeProvider'

const memory = new Map<string, Track>()

/** True when a track can be queued: it has audio, an embed, or a play-time lookup. */
export function isPlayable(track: Track): boolean {
  return track.formats.length > 0 || Boolean(track.embed) || Boolean(track.lookup)
}

function words(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .normalize('NFKD')
      // Keep combining marks (\p{M}): Indic scripts write vowels with them.
      .replace(/[^\p{L}\p{M}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 1)
  )
}

const ALT_VERSION_WORDS = [
  'cover', 'karaoke', 'instrumental', 'remix', 'slowed', 'reverb', 'sped', '8d', 'lyrics',
  'edit', 'orchestra', 'symphonic', 'tribute', 'piano', 'acoustic'
]

/**
 * Picks the search result that best matches a chart entry:
 * - one point per chart-title word found in the video title
 * - +3 when the uploader is (one of) the chart artists, +1 when the artist is
 *   only named in the title (label uploads such as T-Series)
 * - -3 per alternate-version marker (cover, remix, orchestra…) the chart title lacks
 * Ties go to YouTube's own ranking. Returns null when nothing scores above 0.
 */
export function bestLookupMatch(entry: Track, candidates: Track[]): Track | null {
  const wantTitle = words(entry.title)
  const wantArtist = words(entry.artist)
  const chartTitle = entry.title.toLowerCase()
  let best: Track | null = null
  let bestScore = 0
  for (const c of candidates.slice(0, 8)) {
    const title = words(c.title)
    const uploader = words(c.artist)
    let score = 0
    for (const w of wantTitle) if (title.has(w)) score++
    if ([...wantArtist].some((w) => uploader.has(w))) score += 3
    else if ([...wantArtist].some((w) => title.has(w))) score += 1
    for (const bad of ALT_VERSION_WORDS) {
      if ((title.has(bad) || uploader.has(bad)) && !chartTitle.includes(bad)) score -= 3
    }
    if (score > bestScore) {
      best = c
      bestScore = score
    }
  }
  return best
}

async function resolveLookup(track: Track): Promise<Track | null> {
  if (!track.lookup) return null
  const res = await youtubeSearchTracks({ query: track.lookup.query, rows: 8 })
  const match = bestLookupMatch(track, res.tracks)
  // Keep the chart's identity (id, title, artwork) so the UI and history stay
  // consistent; playback uses the matched video's official embed.
  return match ? { ...track, embed: match.embed, durationSec: match.durationSec, itemPage: match.itemPage, collection: match.collection } : null
}

export async function resolveTrackFormats(track: Track): Promise<Track> {
  if (track.formats.length > 0 || track.embed) {
    memory.set(track.id, track)
    return track
  }
  const cached = memory.get(track.id)
  if (cached && (cached.formats.length > 0 || cached.embed)) return cached

  try {
    let resolved: Track | null = null
    if (track.lookup) {
      resolved = await resolveLookup(track)
    } else if (track.source === 'openverse') {
      const fresh = await openverseGetTrackById(track.identifier, undefined)
      resolved = fresh && fresh.id === track.id ? fresh : null
    } else if (track.source === 'audius' && audiusProvider.resolveTrack) {
      resolved = await audiusProvider.resolveTrack(track)
    }
    if (resolved) {
      memory.set(track.id, resolved)
      return resolved
    }
  } catch {
    return track
  }
  return track
}
