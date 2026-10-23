/**
 * Related tracks — assembled from real signals only, each with a reason:
 * 1. Source-provided relations (Openverse /related, same-uploader searches on
 *    YouTube/Audius/Mixcloud, same-tag stations on Radio Browser).
 * 2. Queue siblings that share the source item.
 * 3. Local-engine fallback: candidates from the user's top genres, scored by
 *    the explainable recommendation engine (never a black box).
 */

import type { Track } from '../types'
import { unifiedTrackSearch } from './searchService'
import { PROVIDERS, providerById } from './searchService'
import { buildProfile, scoreTrack } from './recommend'
import { shelfSearchOptions } from './discover'
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
    if (c.track.formats.length === 0 && !c.track.embed) continue
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
    .map((t) => ({ track: t, reason: 'From the same source item' }))
}

export async function fetchRelatedTracks(track: Track, signal?: AbortSignal): Promise<RelatedTrack[]> {
  const exclude = new Set<string>([track.id])
  const out: RelatedTrack[] = []

  // 1. Source-provided related (each provider defines what "related" really
  //    means there — never invented).
  const provider = providerById(track.source)
  if (provider?.getRelatedTracks) {
    try {
      const rel = await provider.getRelatedTracks(track, signal)
      out.push(...rel.map((t) => ({ track: t, reason: `Related on ${provider.label}` })))
    } catch {
      // quota/network — other signals still apply
    }
  }

  // 2. Queue siblings — cheap and genuinely relevant.
  out.push(...fromQueue(track))

  // 3. Same artist across other sources (real metadata match).
  if (track.artist && track.artist !== 'Unknown artist' && track.artist !== 'Unknown uploader') {
    const otherSources = PROVIDERS.filter((p) => p.id !== track.source).map((p) => p.id)
    try {
      const res = await unifiedTrackSearch({ query: track.artist, rows: 10, providers: otherSources, signal })
      for (const t of res.tracks.slice(0, 6)) {
        out.push({ track: t, reason: `${track.artist} on ${t.source === 'radio' ? 'the radio' : t.source}` })
        if (dedupe(out, exclude).length >= LIMIT) break
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
      const topSignal = [
        ...Object.entries(profile.genreWeights),
        ...Object.entries(profile.moodWeights)
      ]
        .sort((a, b) => b[1] - a[1])[0]?.[0]
      const opts = topSignal
        ? genreOrMoodOpts(topSignal)
        : shelfSearchOptions({ genreId: 'lo-fi', rows: 10 })
      const res = await unifiedTrackSearch({ ...opts, rows: 10, signal })
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

function genreOrMoodOpts(key: string): ReturnType<typeof shelfSearchOptions> {
  // Genres and moods share one id namespace in the profile; pick the def
  // that actually exists (genre ids and mood ids never collide by design,
  // except "devotional" where either mapping is meaningful).
  if (genreById(key)) return shelfSearchOptions({ genreId: key, rows: 10 })
  return shelfSearchOptions({ moodId: key, rows: 10 })
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
  const anchor = plays.find((t) => t.formats.length > 0 || t.embed) ?? plays[0]
  const related = await fetchRelatedTracks(anchor, signal)
  const exclude = new Set<string>(plays.map((p) => p.id).concat(anchor.id))
  return dedupe(related, exclude).slice(0, limit)
}
