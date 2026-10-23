/**
 * Search orchestration across providers.
 *
 * - Provider registry with user toggles (Settings > Sources).
 * - Every provider in v3 is track-first (YouTube, Audius, Radio Browser,
 *   Openverse, Mixcloud); results merge into a deterministic provider-ordered
 *   interleave so no single source dominates the first screen.
 * - Graceful degradation: a failing or quota-limited source never breaks the
 *   whole search — it is reported honestly in `degraded` and the UI shows it.
 */

import type {
  MusicProvider,
  SearchOptions,
  SourceDegradation,
  Track,
  UnifiedTrackSearchResponse
} from '../types'
import { youtubeProvider } from './providers/youtubeProvider'
import { audiusProvider } from './providers/audiusProvider'
import { radioProvider } from './providers/radioProvider'
import { mixcloudProvider } from './providers/mixcloudProvider'
import { openverseProvider } from './openverse'
import { isSourceEnabled } from '../stores/settings'

/** Registry order = interleave priority (fast/direct sources first). */
export const PROVIDERS: MusicProvider[] = [
  audiusProvider,
  youtubeProvider,
  radioProvider,
  openverseProvider,
  mixcloudProvider
]

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

/**
 * Unified track-first search across all enabled providers (or the requested
 * subset). Buckets are pre-allocated in provider order so interleaving is
 * deterministic regardless of which provider responds first.
 */
export async function unifiedTrackSearch(options: SearchOptions): Promise<UnifiedTrackSearchResponse> {
  const wanted = options.providers
  const providers = activeProviders().filter((p) => !wanted || wanted.includes(p.id))
  const degraded: SourceDegradation[] = []
  const buckets: Track[][] = providers.map(() => [])
  let total = 0

  await Promise.allSettled(
    providers.map(async (p, i) => {
      try {
        const res = await p.searchTracks({ ...options, rows: Math.min(options.rows ?? 12, 30) })
        buckets[i].push(...res.tracks)
        total += res.total
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
    'bhajan',
    'qawwali',
    'sitar',
    'lo-fi beats',
    'jazz',
    'bhangra',
    'ambient',
    'ghazal',
    'arijit singh',
    'piano sonata'
  ]
  const matched = staticSeeds.filter((s) => s.includes(q) || q.includes(s)).slice(0, 4)
  for (const m of matched) seeds.push({ label: m, to: `/search?q=${encodeURIComponent(m)}` })
  seeds.push({ label: `Search “${input.trim()}”`, to: `/search?q=${encodeURIComponent(input.trim())}` })
  return seeds.slice(0, 6)
}
