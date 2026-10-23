/**
 * Search orchestration across providers.
 *
 * - Provider registry with user toggles (Settings > Sources).
 * - Album search (Internet Archive's model) and track-first search
 *   (Openverse: Jamendo / Wikimedia / Freesound) merge into unified results.
 * - Graceful degradation: a failing or quota-limited source never breaks the
 *   whole search — it is reported honestly in `degraded` and the UI shows it.
 * - Cross-provider dedupe + round-robin interleave so no single source
 *   dominates the first screen.
 */

import type {
  AlbumResult,
  MusicProvider,
  SearchOptions,
  SearchResponse,
  SourceDegradation,
  Track,
  UnifiedTrackSearchResponse
} from '../types'
import { internetArchiveProvider } from './archive'
import { openverseProvider } from './openverse'
import { dedupeKey } from './format'
import { isSourceEnabled } from '../stores/settings'

export const PROVIDERS: MusicProvider[] = [internetArchiveProvider, openverseProvider]

export function providerById(id: string): MusicProvider | undefined {
  return PROVIDERS.find((p) => p.id === id)
}

function activeProviders(): MusicProvider[] {
  return PROVIDERS.filter((p) => isSourceEnabled(p.id))
}

function degradationFor(err: unknown, provider: MusicProvider): SourceDegradation {
  const msg = err instanceof Error ? err.message : 'Unavailable'
  return { source: provider.id, message: `${provider.label}: ${msg}` }
}

/* --------------------------------- albums --------------------------------- */

export async function unifiedSearch(options: SearchOptions): Promise<SearchResponse> {
  const providers = activeProviders()
  const results = await Promise.allSettled(providers.map((p) => p.searchAlbums(options)))

  const degraded: SourceDegradation[] = []
  const fulfilled: SearchResponse[] = []
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') fulfilled.push(r.value)
    else degraded.push(degradationFor(r.reason, providers[i]))
  })
  if (fulfilled.length === 0 && degraded.length > 0) {
    const first = results.find((r) => r.status === 'rejected') as PromiseRejectedResult
    throw first.reason instanceof Error ? first.reason : new Error('Search unavailable')
  }

  const seen = new Set<string>()
  const albums: AlbumResult[] = []
  for (const r of fulfilled) {
    for (const a of r.albums) {
      const key = dedupeKey(a.title, a.creator)
      if (seen.has(key)) continue
      seen.add(key)
      albums.push(a)
    }
  }
  // Interleave providers so no single source dominates the first screen.
  const byProvider = new Map<string, AlbumResult[]>()
  for (const a of albums) {
    const list = byProvider.get(a.source) ?? []
    list.push(a)
    byProvider.set(a.source, list)
  }
  const merged: AlbumResult[] = []
  let added = true
  while (added) {
    added = false
    for (const list of byProvider.values()) {
      const next = list.shift()
      if (next) {
        merged.push(next)
        added = true
      }
    }
  }

  const total = fulfilled.reduce((sum, r) => sum + r.total, 0)
  return { albums: merged, total, page: options.page ?? 1, rows: options.rows ?? 24, degraded }
}

/* --------------------------------- tracks --------------------------------- */

/**
 * Unified track-first search.
 * - Track providers (Openverse) are queried directly.
 * - Album providers (Internet Archive) contribute by expanding their top
 *   matching albums into real tracks — bounded to keep latency sane.
 */
export async function unifiedTrackSearch(options: SearchOptions): Promise<UnifiedTrackSearchResponse> {
  const wanted = options.providers
  const providers = activeProviders().filter((p) => !wanted || wanted.includes(p.id))
  const degraded: SourceDegradation[] = []
  // Buckets are pre-allocated in provider order so interleaving is
  // deterministic regardless of which provider responds first.
  const buckets: Track[][] = providers.map(() => [])
  let total = 0

  const ALBUM_EXPAND_ALBUMS = 3
  const ALBUM_TRACKS_PER_ALBUM = 6

  await Promise.allSettled(
    providers.map(async (p, i) => {
      try {
        if (p.searchTracks) {
          const res = await p.searchTracks({ ...options, rows: Math.min(options.rows ?? 12, 20) })
          buckets[i].push(...res.tracks)
          total += res.total
        } else {
          // Album-provider path: search albums, expand the first few.
          const res = await p.searchAlbums({ ...options, rows: 8 })
          const ids = res.albums.slice(0, ALBUM_EXPAND_ALBUMS).map((a) => a.identifier)
          const tracks: Track[] = []
          for (const id of ids) {
            try {
              const item = await p.getItemTracks(id, options.signal)
              tracks.push(...item.slice(0, ALBUM_TRACKS_PER_ALBUM))
            } catch {
              // single album failing shouldn't sink the source
            }
          }
          buckets[i].push(...tracks)
          total += res.total
        }
      } catch (err) {
        degraded.push(degradationFor(err, p))
      }
    })
  )

  const tracks = interleave(buckets)
  return { tracks, total, degraded: degraded.length ? degraded : undefined }
}

function interleave(buckets: Track[][]): Track[] {
  const queues = buckets.map((b) => [...b])
  const out: Track[] = []
  const seen = new Set<string>()
  let added = true
  while (added) {
    added = false
    for (const q of queues) {
      while (q.length) {
        const t = q.shift()!
        if (seen.has(t.id)) continue
        seen.add(t.id)
        out.push(t)
        added = true
        break
      }
    }
  }
  return out
}

/* -------------------------------- suggestions ------------------------------- */

/** Search suggestions from curated seeds + user free text (no fabricated metadata). */
export function buildSuggestions(input: string): { label: string; to: string }[] {
  const q = input.trim().toLowerCase()
  const seeds: { label: string; to: string }[] = []
  if (q.length === 0) return seeds
  const staticSeeds = [
    'qawwali',
    'sitar',
    'lo-fi beats',
    'old hindi songs',
    'jazz',
    'bhangra',
    'ambient',
    'ghazal',
    'grateful dead live',
    'piano sonata'
  ]
  const matched = staticSeeds.filter((s) => s.includes(q) || q.includes(s)).slice(0, 4)
  for (const m of matched) seeds.push({ label: m, to: `/search?q=${encodeURIComponent(m)}` })
  seeds.push({ label: `Search “${input.trim()}”`, to: `/search?q=${encodeURIComponent(input.trim())}` })
  return seeds.slice(0, 6)
}
