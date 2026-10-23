/**
 * Discovery data helpers: genre/mood/language track fetches and the local
 * recommendation pipeline (profile → candidates from the user's top genres →
 * multi-source track queries → rank → explain). Fully on-device.
 */

import type { SearchOptions, Track } from '../types'
import { unifiedTrackSearch } from './searchService'
import { genreById, moodById, languageById } from '../config/catalog'
import { buildProfile, getRecommendations, describeTaste, type UserProfile } from './recommend'
import { useLibrary } from '../stores/library'

/** Map curated catalog entries to real source-native search parameters. */
export function shelfSearchOptions(params: {
  genreId?: string
  moodId?: string
  languageId?: string
  rows?: number
  page?: number
}): SearchOptions {
  const genre = genreById(params.genreId)
  const mood = moodById(params.moodId)
  const language = languageById(params.languageId)
  return {
    query: genre?.ytQuery ?? mood?.ytQuery ?? language?.ytQuery,
    tag: genre?.openverseTag ?? mood?.openverseTag,
    audiusGenre: genre?.audiusGenre,
    audiusMood: mood?.audiusMood,
    radioTag: genre?.radioTag ?? mood?.radioTag,
    radioName: genre?.radioName,
    radioLanguage: language?.radioLanguage,
    rows: params.rows ?? 12,
    page: params.page ?? 1
  }
}

export interface RecommendationBundle {
  recommendations: ReturnType<typeof getRecommendations>
  profile: UserProfile
  tasteLabels: string[]
  candidatesConsidered: number
}

/**
 * Build recommendations entirely on-device:
 * 1. Profile from local history + likes (IndexedDB, never leaves browser).
 * 2. Candidate pool: multi-source track searches for the user's top
 *    genres/moods (bounded to two signals).
 * 3. Rank with diversity caps; attach explanations.
 */
export async function fetchRecommendations(limit = 10, signal?: AbortSignal): Promise<RecommendationBundle> {
  const lib = useLibrary.getState()
  const profile = buildProfile(lib.history, lib.likedTracks)
  const tasteLabels = describeTaste(profile)

  const coldStart = Object.keys(profile.genreWeights).length === 0 && Object.keys(profile.moodWeights).length === 0

  // Candidate selection: top signals, or a friendly default mix for new listeners.
  const signalKeys = [...Object.entries(profile.genreWeights), ...Object.entries(profile.moodWeights)]
    .sort((a, b) => b[1] - a[1])
    .map(([k]) => k)
    .slice(0, 2)

  const candidates: Track[] = []
  const popularityMap: Record<string, number> = {}

  if (coldStart) {
    const opts = shelfSearchOptions({ genreId: 'lo-fi', rows: 12 })
    const res = await unifiedTrackSearch({ ...opts, signal }).catch(() => null)
    if (res) candidates.push(...res.tracks)
    const opts2 = shelfSearchOptions({ genreId: 'bhajans', rows: 10 })
    const res2 = await unifiedTrackSearch({ ...opts2, signal }).catch(() => null)
    if (res2) candidates.push(...res2.tracks)
  } else {
    for (const key of signalKeys) {
      const isGenre = Boolean(genreById(key))
      const opts = shelfSearchOptions(
        isGenre ? { genreId: key, rows: 12 } : { moodId: key, rows: 12 }
      )
      const res = await unifiedTrackSearch({ ...opts, signal }).catch(() => null)
      if (res) candidates.push(...res.tracks)
      if (candidates.length >= 40) break
    }
    // Mix in liked artists' other work for "similar artists" reasons.
    const favArtist = Object.entries(profile.artistWeights)
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1])[0]?.[0]
    if (favArtist) {
      const res = await unifiedTrackSearch({ query: favArtist, rows: 12, signal }).catch(() => null)
      if (res) candidates.push(...res.tracks)
    }
  }

  const recommendations = getRecommendations(dedupe(candidates), profile, {
    limit,
    requirePlayable: true,
    popularityMap,
    excludeIds: new Set([...lib.history.slice(0, 8).map((h) => h.trackId)])
  })

  return { recommendations, profile, tasteLabels, candidatesConsidered: candidates.length }
}

function dedupe(tracks: Track[]): Track[] {
  const seen = new Set<string>()
  return tracks.filter((t) => (seen.has(t.id) ? false : (seen.add(t.id), true)))
}
