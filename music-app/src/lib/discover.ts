/**
 * Discovery data helpers: genre/mood album fetches and the local
 * recommendation pipeline (profile → candidates from user's top genres →
 * expand albums to tracks → rank → explain).
 */

import type { Track } from '../types'
import { unifiedSearch } from './searchService'
import { internetArchiveProvider } from './archive'
import { genreById, moodById, languageById } from '../config/catalog'
import { buildProfile, getRecommendations, describeTaste, type UserProfile } from './recommend'
import { useLibrary } from '../stores/library'

export async function fetchAlbumsFor(params: { genreId?: string; moodId?: string; languageId?: string; rows?: number; page?: number }) {
  const genre = genreById(params.genreId)
  const mood = moodById(params.moodId)
  return unifiedSearch({
    genre: genre?.clause,
    mood: mood?.clause,
    language: params.languageId ? languageById(params.languageId)?.clause : undefined,
    rows: params.rows ?? 24,
    page: params.page ?? 1,
    sort: 'downloads'
  })
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
 * 2. Candidate pool: fetch albums for the user's top 2 genres/moods.
 * 3. Expand up to 8 albums into real playable tracks (bounded, cached).
 * 4. Rank with diversity caps; attach explanations.
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
    const res = await unifiedSearch({ genre: genreById('lo-fi')?.clause, rows: 12, sort: 'downloads', signal })
    const res2 = await unifiedSearch({ genre: genreById('live')?.clause, rows: 12, sort: 'downloads', signal }).catch(() => null)
    const albums = [...res.albums, ...(res2?.albums ?? [])].slice(0, 8)
    const tracks = await expandAlbums(albums.map((a) => a.identifier), signal)
    candidates.push(...tracks)
  } else {
    for (const key of signalKeys) {
      const g = genreById(key)
      const m = moodById(key)
      if (!g && !m) continue
      const res = await unifiedSearch({
        genre: g?.clause,
        mood: m?.clause,
        rows: 12,
        sort: 'downloads',
        signal
      }).catch(() => null)
      if (res) candidates.push(...(await expandAlbums(res.albums.slice(0, 4).map((a) => a.identifier), signal)))
      if (candidates.length >= 40) break
    }
    // Mix in liked artists' other work for "similar artists" reasons.
    const favArtist = Object.entries(profile.artistWeights)
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1])[0]?.[0]
    if (favArtist) {
      const res = await unifiedSearch({ creator: favArtist, rows: 12, sort: 'downloads', signal }).catch(() => null)
      if (res) candidates.push(...(await expandAlbums(res.albums.slice(0, 3).map((a) => a.identifier), signal)))
    }
  }

  // Attach popularity from album search downloads when we have the album page.
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

/** Expand albums → tracks with bounded concurrency (keeps provider load sane). */
export async function expandAlbums(identifiers: string[], signal?: AbortSignal, max = 8): Promise<Track[]> {
  const ids = identifiers.slice(0, max)
  const results: Track[] = []
  const CONCURRENCY = 4
  for (let i = 0; i < ids.length; i += CONCURRENCY) {
    const batch = ids.slice(i, i + CONCURRENCY)
    const settled = await Promise.allSettled(batch.map((id) => internetArchiveProvider.getItemTracks(id, signal)))
    for (const r of settled) {
      if (r.status === 'fulfilled') results.push(...r.value.slice(0, 6))
    }
  }
  return results
}
