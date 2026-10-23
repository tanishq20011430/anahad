/**
 * Related tracks — assembled from real signals only, each with a reason:
 * 1. Source-provided relations (Openverse's /related endpoint).
 * 2. Same-artist recordings from the same catalog (bounded album expansion).
 * 3. Local-engine fallback: candidates from the user's top genres, scored by
 *    the explainable recommendation engine (never a black box).
 */

import type { Track } from '../types'
import { unifiedSearch, unifiedTrackSearch } from './searchService'
import { internetArchiveProvider } from './archive'
import { openverseProvider as openverse } from './openverse'
import { buildProfile, scoreTrack } from './recommend'
import { genreById } from '../config/catalog'
import { useLibrary } from '../stores/library'
import { usePlayer } from '../stores/player'

export interface RelatedTrack {
  track: Track
  reason: string
}

const LIMIT = 8

function dedupe(candidates: RelatedTrack[], excludeIds: Set<string>): RelatedTrack[] {
  const seen = new Set<string>(excludeIds)
  const out: RelatedTrack[] = []
  for (const c of candidates) {
    if (seen.has(c.track.id)) continue
    if (c.track.formats.length === 0) continue
    seen.add(c.track.id)
    out.push(c)
  }
  return out
}

/** Tracks that play right after this one in the current queue context. */
function fromQueue(track: Track): RelatedTrack[] {
  const queue = usePlayer.getState().queue
  return queue
    .filter((t) => t.id !== track.id && t.identifier === track.identifier && t.source === track.source)
    .slice(0, 3)
    .map((t) => ({ track: t, reason: 'From the same album' }))
}

export async function fetchRelatedTracks(track: Track, signal?: AbortSignal): Promise<RelatedTrack[]> {
  const exclude = new Set<string>([track.id])
  const out: RelatedTrack[] = []

  // 1. Source-provided related (Openverse /related).
  if (track.source === 'openverse' && openverse.getRelatedTracks) {
    try {
      const rel = await openverse.getRelatedTracks(track, signal)
      out.push(...rel.map((t) => ({ track: t, reason: 'Related on Openverse' })))
    } catch {
      // quota/network — other signals still apply
    }
  }

  // 2. Same album (already-known siblings) — cheap and genuinely relevant.
  out.push(...fromQueue(track))

  // 3. Same artist from the same source.
  if (track.source === 'internet-archive' && track.artist && track.artist !== 'Unknown artist') {
    try {
      const res = await unifiedSearch({ creator: track.artist, rows: 12, sort: 'downloads', signal })
      const ids = res.albums.filter((a) => a.identifier !== track.identifier).slice(0, 2).map((a) => a.identifier)
      for (const id of ids) {
        try {
          const tracks = await internetArchiveProvider.getItemTracks(id, signal)
          out.push(...tracks.slice(0, 3).map((t) => ({ track: t, reason: `More from ${track.artist}` })))
        } catch {
          /* skip album */
        }
      }
    } catch {
      /* skip */
    }
  }

  // 4. Local-engine fallback: score candidates from the user's top genre.
  if (dedupe(out, exclude).length < LIMIT) {
    try {
      const lib = useLibrary.getState()
      const profile = buildProfile(lib.history, lib.likedTracks)
      const topGenre = Object.entries(profile.genreWeights).sort((a, b) => b[1] - a[1])[0]?.[0]
      const tag = topGenre ? (genreById(topGenre)?.openverseTag ?? undefined) : undefined
      const clause = topGenre ? (genreById(topGenre)?.clause ?? undefined) : undefined
      const res = await unifiedTrackSearch({ query: undefined, genre: clause, tag, rows: 10, signal })
      for (const t of res.tracks.slice(0, 12)) {
        const s = scoreTrack(t, profile, null)
        out.push({
          track: t,
          reason: s.reasons[0] ?? 'Because of what you listened to in this session'
        })
        if (dedupe(out, exclude).length >= LIMIT) break
      }
    } catch {
      /* skip */
    }
  }

  return dedupe(out, exclude).slice(0, LIMIT)
}

/* ------------------------ session-based recommendations ------------------------ */

/** In-memory plays from THIS browser session (never persisted). */
const sessionPlays: { track: Track; at: number }[] = []

export function recordSessionPlay(track: Track): void {
  sessionPlays.unshift({ track, at: Date.now() })
  if (sessionPlays.length > 30) sessionPlays.length = 30
}

export function getSessionPlays(): Track[] {
  return sessionPlays.map((p) => p.track)
}

/**
 * "Session mix": related material anchored on what was heard this session —
 * fully local, explainable, bounded network use.
 */
export async function fetchSessionMix(limit = 6, signal?: AbortSignal): Promise<RelatedTrack[]> {
  const plays = getSessionPlays()
  if (plays.length === 0) return []
  const anchor = plays.find((t) => t.formats.length > 0) ?? plays[0]
  const related = await fetchRelatedTracks(anchor, signal)
  const exclude = new Set<string>(plays.map((p) => p.id).concat(anchor.id))
  return dedupe(related, exclude).slice(0, limit)
}
