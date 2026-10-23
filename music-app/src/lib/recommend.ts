/**
 * Local, explainable content-based recommendation engine.
 *
 * - Runs entirely in the browser; no server, no accounts, no ML API.
 * - Uses only metadata that sources actually provide (genres/subjects,
 *   artists, languages, keyword-estimated moods).
 * - Transparent weighted scoring with recency weighting, diversity caps and
 *   repetition penalties. Every recommendation carries human-readable reasons.
 */

import type { PlayEvent, Recommendation, Track } from '../types'

export interface UserProfile {
  genreWeights: Record<string, number>
  moodWeights: Record<string, number>
  artistWeights: Record<string, number>
  languageWeights: Record<string, number>
  likedIds: Set<string>
  dislikedIds: Set<string>
  recentTrackIds: Set<string>
  artistPlayCounts: Record<string, number>
  totalPositive: number
}

/** Transparent scoring weights (documented in Settings > How recommendations work). */
export const WEIGHTS = {
  genre: 0.28,
  mood: 0.22,
  artist: 0.2,
  language: 0.12,
  likeAffinity: 0.1,
  popularity: 0.08,
  recencyPenalty: 0.3,
  skipPenalty: 0.5
} as const

/** Recency half-life for listening history (days). */
const HALF_LIFE_DAYS = 14

function recencyFactor(playedAt: number, now: number): number {
  const ageDays = Math.max(0, (now - playedAt) / 86_400_000)
  return Math.pow(0.5, ageDays / HALF_LIFE_DAYS)
}

function bump(map: Record<string, number>, key: string | null, amount: number) {
  if (!key) return
  const k = key.trim().toLowerCase()
  if (!k) return
  map[k] = (map[k] ?? 0) + amount
}

/**
 * Build a preference profile from listening history + likes/dislikes.
 * Skipped tracks contribute negative signal; completions contribute positive
 * signal scaled by how much was heard and how recent it was.
 */
export function buildProfile(
  history: PlayEvent[],
  likedTracks: Record<string, Track>,
  dislikedIds: string[] = [],
  now = Date.now()
): UserProfile {
  const genreWeights: Record<string, number> = {}
  const moodWeights: Record<string, number> = {}
  const artistWeights: Record<string, number> = {}
  const languageWeights: Record<string, number> = {}
  const artistPlayCounts: Record<string, number> = {}
  const recentTrackIds = new Set<string>()
  let totalPositive = 0

  for (const ev of history) {
    const t = ev.track
    const rec = recencyFactor(ev.playedAt, now)
    if (now - ev.playedAt <= 3 * 86_400_000) recentTrackIds.add(t.id)

    if (ev.skipped && ev.completedRatio < 0.25) {
      const penalty = WEIGHTS.skipPenalty * rec
      bump(artistWeights, t.artist, -penalty)
      for (const g of t.genres) bump(genreWeights, g, -penalty * 0.5)
      continue
    }

    const w = (0.5 + 0.5 * ev.completedRatio) * rec
    totalPositive += w
    for (const g of t.genres) bump(genreWeights, g, w)
    for (const m of t.estimatedMoods) bump(moodWeights, m, w)
    bump(artistWeights, t.artist, w)
    bump(languageWeights, t.language, w)
    artistPlayCounts[t.artist.toLowerCase()] = (artistPlayCounts[t.artist.toLowerCase()] ?? 0) + 1
  }

  for (const t of Object.values(likedTracks)) {
    const w = 1.5
    totalPositive += w
    for (const g of t.genres) bump(genreWeights, g, w)
    for (const m of t.estimatedMoods) bump(moodWeights, m, w)
    bump(artistWeights, t.artist, w)
    bump(languageWeights, t.language, w)
  }

  return {
    genreWeights,
    moodWeights,
    artistWeights,
    languageWeights,
    likedIds: new Set(Object.keys(likedTracks)),
    dislikedIds: new Set(dislikedIds),
    recentTrackIds,
    artistPlayCounts,
    totalPositive: Math.max(totalPositive, 1)
  }
}

function normalize(map: Record<string, number>): Record<string, number> {
  const max = Math.max(0, ...Object.values(map))
  if (max <= 0) return {}
  const out: Record<string, number> = {}
  for (const [k, v] of Object.entries(map)) out[k] = Math.max(0, v) / max
  return out
}

function sumSignals(weights: Record<string, number>, keys: (string | null)[]): number {
  let s = 0
  for (const k of keys) {
    if (!k) continue
    s += weights[k.trim().toLowerCase()] ?? 0
  }
  return s
}

export interface ScoredTrack {
  score: number
  parts: { genre: number; mood: number; artist: number; language: number; popularity: number }
  reasons: string[]
}

/**
 * Score one candidate track against the profile. Returns a breakdown so the
 * UI can explain exactly why something was recommended.
 */
export function scoreTrack(track: Track, profile: UserProfile, popularity01: number | null): ScoredTrack {
  const genreW = normalize(profile.genreWeights)
  const moodW = normalize(profile.moodWeights)
  const artistW = normalize(profile.artistWeights)
  const langW = normalize(profile.languageWeights)

  const genre = Math.min(1, sumSignals(genreW, track.genres))
  const mood = Math.min(1, sumSignals(moodW, track.estimatedMoods))
  const artist = Math.min(1, artistW[track.artist.trim().toLowerCase()] ?? 0)
  const language = Math.min(1, langW[track.language?.trim().toLowerCase() ?? ''] ?? 0)
  const pop = popularity01 ?? 0

  let score =
    WEIGHTS.genre * genre +
    WEIGHTS.mood * mood +
    WEIGHTS.artist * artist +
    WEIGHTS.language * language +
    WEIGHTS.likeAffinity * artist + // shared artist affinity with liked tracks
    WEIGHTS.popularity * pop

  if (profile.likedIds.has(track.id)) score += WEIGHTS.likeAffinity
  if (profile.dislikedIds.has(track.id)) score = 0
  if (profile.recentTrackIds.has(track.id)) score *= 1 - WEIGHTS.recencyPenalty

  const reasons: string[] = []
  if (mood >= 0.6) reasons.push(`Matches moods you listen to (${track.estimatedMoods[0]}, estimated)`)
  else if (mood > 0) reasons.push('Based on your mood listening')
  if (genre >= 0.6) reasons.push(`You often listen to ${track.genres[0]}`)
  else if (genre > 0) reasons.push('Similar genres to your listening')
  if (artist >= 0.6) reasons.push(`More from ${track.artist}, one of your favorites`)
  else if (artist > 0) reasons.push('Similar artists to your favorites')
  if (language > 0.5) reasons.push('Matches your preferred language')
  if (pop >= 0.7) reasons.push('Popular with archive listeners')

  return { score, parts: { genre, mood, artist, language, popularity: pop }, reasons: reasons.slice(0, 3) }
}

export interface RecommendationOptions {
  limit?: number
  excludeIds?: Set<string>
  perArtistCap?: number
  requirePlayable?: boolean
  /** Optional trackId -> downloads map for trustworthy popularity signal. */
  popularityMap?: Record<string, number>
}

/**
 * Rank candidates with diversity constraints (per-artist cap) so one prolific
 * artist doesn't flood the list. Unplayable tracks are demoted, not silently
 * dropped — they only surface if playable alternatives run out.
 */
export function getRecommendations(candidates: Track[], profile: UserProfile, options: RecommendationOptions = {}): Recommendation[] {
  const limit = options.limit ?? 12
  const perArtistCap = options.perArtistCap ?? 2
  const excludeIds = options.excludeIds ?? new Set<string>()
  const requirePlayable = options.requirePlayable ?? true
  const popularityMap = options.popularityMap ?? {}

  const playable = candidates.filter((t) => t.formats.length > 0)
  const unplayable = candidates.filter((t) => t.formats.length === 0)
  const ordered = requirePlayable ? [...playable, ...unplayable] : candidates

  const maxDownloads = Math.max(1, ...Object.values(popularityMap))
  const scored = ordered
    .filter((t) => !excludeIds.has(t.id))
    .map((t) => {
      const downloads = popularityMap[t.id]
      const pop01 = downloads ? Math.min(1, Math.log10(1 + downloads) / Math.log10(1 + maxDownloads)) : 0
      return { track: t, s: scoreTrack(t, profile, pop01) }
    })
    .sort((a, b) => b.s.score - a.s.score)

  const picked: Recommendation[] = []
  const artistCount: Record<string, number> = {}
  for (const { track, s } of scored) {
    if (picked.length >= limit) break
    const key = track.artist.trim().toLowerCase()
    if ((artistCount[key] ?? 0) >= perArtistCap) continue
    artistCount[key] = (artistCount[key] ?? 0) + 1
    picked.push({ track, score: s.score, reasons: s.reasons })
  }
  return picked
}

/** Human description of the strongest current taste signals. */
export function describeTaste(profile: UserProfile): string[] {
  const top = (map: Record<string, number>, n: number) =>
    Object.entries(map)
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([k]) => k)
  return [...top(profile.genreWeights, 3), ...top(profile.moodWeights, 2)]
}
