/**
 * Search orchestration across providers. Currently Internet Archive is the
 * only zero-credential source; the architecture supports adding providers
 * without touching calling code. Adds cross-provider dedupe and graceful
 * degradation (if one source fails, others still return).
 */

import type { AlbumResult, SearchOptions, SearchResponse } from '../types'
import { internetArchiveProvider } from './archive'
import { dedupeKey } from './format'
import type { MusicProvider } from '../types'

export const PROVIDERS: MusicProvider[] = [internetArchiveProvider]

export function providerById(id: string): MusicProvider | undefined {
  return PROVIDERS.find((p) => p.id === id)
}

export async function unifiedSearch(options: SearchOptions): Promise<SearchResponse> {
  const results = await Promise.allSettled(PROVIDERS.map((p) => p.searchAlbums(options)))

  const fulfilled = results.filter((r): r is PromiseFulfilledResult<SearchResponse> => r.status === 'fulfilled')
  if (fulfilled.length === 0) {
    // All providers failed — surface the first rejection.
    const first = results[0] as PromiseRejectedResult
    throw first.reason instanceof Error ? first.reason : new Error('Search unavailable')
  }

  const seen = new Set<string>()
  const albums: AlbumResult[] = []
  for (const r of fulfilled) {
    for (const a of r.value.albums) {
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

  const total = fulfilled.reduce((sum, r) => sum + r.value.total, 0)
  return { albums: merged, total, page: options.page ?? 1, rows: options.rows ?? 24 }
}

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
