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

const memory = new Map<string, Track>()

export async function resolveTrackFormats(track: Track): Promise<Track> {
  if (track.formats.length > 0 || track.embed) {
    memory.set(track.id, track)
    return track
  }
  const cached = memory.get(track.id)
  if (cached && (cached.formats.length > 0 || cached.embed)) return cached

  try {
    let resolved: Track | null = null
    if (track.source === 'openverse') {
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
