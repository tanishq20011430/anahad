/**
 * Shared track resolution: fill in playable formats for tracks that carry
 * references only (imported playlist entries, preloaded queue entries).
 * Multi-source aware — dispatches on track.source.
 */

import type { Track } from '../types'
import { internetArchiveProvider } from './archive'
import { openverseProvider } from './openverse'

const memory = new Map<string, Track>()

export async function resolveTrackFormats(track: Track): Promise<Track> {
  if (track.formats.length > 0) {
    memory.set(track.id, track)
    return track
  }
  const cached = memory.get(track.id)
  if (cached && cached.formats.length > 0) return cached

  try {
    let resolved: Track | null = null
    if (track.source === 'internet-archive') {
      const tracks = await internetArchiveProvider.getItemTracks(track.identifier)
      resolved = tracks.find((t) => t.fileName === track.fileName) ?? tracks.find((t) => t.id === track.id) ?? null
    } else if (track.source === 'openverse') {
      resolved = (await openverseProvider.getItemTracks(track.identifier)).find((t) => t.id === track.id) ?? null
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
