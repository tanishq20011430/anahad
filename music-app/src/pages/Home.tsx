/** Home: continue listening, made-for-you recommendations, genre spotlights. */

import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Sparkles, Clock3 } from 'lucide-react'
import { fetchAlbumsFor, fetchRecommendations } from '../lib/discover'
import { GENRES } from '../config/catalog'
import { AlbumCard, AlbumCardSkeleton } from '../components/AlbumCard'
import { Section } from '../components/Section'
import { TrackRow } from '../components/TrackRow'
import { ErrorState, Skeleton } from '../components/ui'
import { useLibrary } from '../stores/library'
import type { AlbumResult } from '../types'

const SPOTLIGHTS = ['bollywood', 'sufi', 'lo-fi', 'live', 'carnatic', 'electronic']

export function HomePage() {
  const history = useLibrary((s) => s.history)

  const continueListening = (() => {
    const seen = new Set<string>()
    const out: AlbumResult[] = []
    for (const ev of history) {
      const key = ev.track.identifier
      if (seen.has(key)) continue
      seen.add(key)
      out.push({
        identifier: ev.track.identifier,
        source: ev.track.source,
        title: ev.track.album,
        creator: ev.track.artist,
        year: ev.track.year,
        artwork: ev.track.artwork ?? '',
        downloads: 0,
        subjects: [],
        language: ev.track.language,
        licenseUrl: ev.track.licenseUrl,
        itemPage: ev.track.itemPage
      })
      if (out.length >= 12) break
    }
    return out
  })()

  const recs = useQuery({
    queryKey: ['recommendations', history.length, Object.keys(useLibrary.getState().likedTracks).length],
    queryFn: ({ signal }) => fetchRecommendations(10, signal),
    staleTime: 5 * 60 * 1000
  })

  return (
    <div className="space-y-8">
      <header className="pt-2">
        <h1 className="text-2xl font-extrabold tracking-tight md:text-3xl">Listen freely</h1>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-zinc-400">
          Real music from open archives — public-domain treasures, Creative Commons netlabels and band-approved live
          recordings. No account, no ads, and your listening never leaves this browser.
        </p>
      </header>

      {continueListening.length > 0 ? (
        <Section title="Continue listening" subtitle="Picked up from your local history">
          <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0">
            {continueListening.map((a) => (
              <AlbumCard key={a.identifier} album={a} contextLabel="Continue listening" />
            ))}
          </div>
        </Section>
      ) : null}

      <Section
        title="Made for you"
        subtitle="Ranked on this device from your listening — every pick explains itself"
        seeAllTo="/moods"
      >
        {recs.isPending ? (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : recs.isError ? (
          <ErrorState message="Recommendations couldn't load right now. Discovery still works — try a genre below." onRetry={() => void recs.refetch()} />
        ) : recs.data && recs.data.recommendations.length > 0 ? (
          <div>
            {recs.data.tasteLabels.length > 0 ? (
              <p className="mb-2 flex items-center gap-1.5 text-xs text-zinc-500">
                <Sparkles className="h-3.5 w-3.5 text-accent" aria-hidden />
                Tuned to: {recs.data.tasteLabels.join(', ')}
              </p>
            ) : null}
            <div className="divide-y divide-white/5">
              {recs.data.recommendations.map((r) => (
                <div key={r.track.id}>
                  {r.reasons.length > 0 ? (
                    <p className="pl-12 pt-1.5 text-[11px] italic text-zinc-500">{r.reasons[0]}</p>
                  ) : null}
                  <TrackRow track={r.track} contextTracks={recs.data.recommendations.map((x) => x.track)} contextLabel="Made for you" />
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="rounded-xl bg-surface-raised p-4 text-sm text-zinc-400 ring-1 ring-white/5">
            Play a few tracks and like what you enjoy — recommendations will shape themselves around your listening.
          </p>
        )}
      </Section>

      <SpotlightRows />

      <Section title="Browse by genre" seeAllTo="/genres">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {GENRES.slice(0, 8).map((g) => (
            <Link
              key={g.id}
              to={`/genres/${g.id}`}
              className={`group relative overflow-hidden rounded-xl bg-gradient-to-br ${g.gradient} p-4 transition hover:scale-[1.02]`}
            >
              <div className="absolute inset-0 bg-black/25 transition group-hover:bg-black/10" aria-hidden />
              <div className="relative">
                <p className="text-sm font-bold text-white drop-shadow">{g.label}</p>
                <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-white/80">{g.description}</p>
              </div>
            </Link>
          ))}
        </div>
      </Section>

      <footer className="flex items-center gap-2 pb-4 pt-2 text-[11px] text-zinc-600">
        <Clock3 className="h-3.5 w-3.5" aria-hidden />
        Audio streamed from archive.org under each item's own license. <Link to="/privacy" className="underline hover:text-zinc-400">How attribution works</Link>
      </footer>
    </div>
  )
}

function SpotlightRows() {
  return (
    <>
      {SPOTLIGHTS.map((id) => (
        <SpotlightRow key={id} genreId={id} />
      ))}
    </>
  )
}

function SpotlightRow({ genreId }: { genreId: string }) {
  const genre = GENRES.find((g) => g.id === genreId)!
  const q = useQuery({
    queryKey: ['spotlight', genreId],
    queryFn: ({ signal: _signal }) => fetchAlbumsFor({ genreId, rows: 12 }),
    staleTime: 10 * 60 * 1000
  })

  return (
    <Section title={genre.label} subtitle={genre.description} seeAllTo={`/genres/${genre.id}`}>
      {q.isPending ? (
        <div className="no-scrollbar -mx-4 flex gap-3 overflow-hidden px-4 md:mx-0 md:px-0">
          {[...Array(6)].map((_, i) => (
            <AlbumCardSkeleton key={i} />
          ))}
        </div>
      ) : q.isError || q.data.albums.length === 0 ? (
        <p className="rounded-xl bg-surface-raised p-4 text-xs text-zinc-500 ring-1 ring-white/5">
          This shelf is temporarily unavailable — the archive may be busy. Other sections still work.
        </p>
      ) : (
        <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0">
          {q.data.albums.map((a) => (
            <AlbumCard key={a.identifier} album={a} contextLabel={genre.label} />
          ))}
        </div>
      )}
    </Section>
  )
}
