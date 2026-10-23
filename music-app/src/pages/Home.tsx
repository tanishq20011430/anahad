/** Home: continue listening, made-for-you recommendations, multi-source shelves. */

import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Sparkles, Clock3, Radio } from 'lucide-react'
import { CHART_COUNTRIES, fetchTopSongs, getChartCountry, newReleases } from '../lib/charts'
import { ChartList } from '../components/ChartList'
import { shelfSearchOptions, fetchRecommendations } from '../lib/discover'
import { fetchSessionMix, getSessionPlays } from '../lib/related'
import { unifiedTrackSearch } from '../lib/searchService'
import { GENRES } from '../config/catalog'
import { Section } from '../components/Section'
import { TrackRow } from '../components/TrackRow'
import { ErrorState, Skeleton } from '../components/ui'
import { useLibrary } from '../stores/library'
import { usePlayer } from '../stores/player'
import type { SearchOptions, Track } from '../types'

/** Curated multi-source shelves (genre ids from the catalog). */
const SPOTLIGHTS = ['bhajans', 'lo-fi', 'bollywood', 'electronic']

export function HomePage() {
  const history = useLibrary((s) => s.history)

  const continueListening = (() => {
    const seen = new Set<string>()
    const out: Track[] = []
    for (const ev of history) {
      if (seen.has(ev.track.id)) continue
      seen.add(ev.track.id)
      out.push(ev.track)
      if (out.length >= 6) break
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
          Real music from real catalogs — YouTube through its official player, full-length Audius tracks, live radio from
          every language, and Creative Commons releases. No account, no ads, and your listening never leaves this browser.
        </p>
      </header>

      {continueListening.length > 0 ? (
        <Section title="Continue listening" subtitle="Picked up from your local history">
          <div className="divide-y divide-white/5 rounded-xl bg-surface-raised/50 ring-1 ring-white/5">
            {continueListening.map((t) => (
              <TrackRow key={t.id} track={t} contextTracks={continueListening} contextLabel="Continue listening" showAlbum={false} />
            ))}
          </div>
        </Section>
      ) : null}

      <ChartShelves />

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
                  <TrackRow track={r.track} contextTracks={recs.data.recommendations.map((x) => x.track)} contextLabel="Made for you" showAlbum={false} />
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

      <SessionMix />

      <LiveDevotionalShelf />

      {SPOTLIGHTS.map((id) => (
        <TrackShelf key={id} genreId={id} />
      ))}

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
        Audio streamed from YouTube (official player), Audius, Radio Browser stations, Mixcloud (official widget) and Openverse
        (Jamendo · Wikimedia · Freesound) under each track's own terms.{' '}
        <Link to="/privacy" className="underline hover:text-zinc-400">
          How attribution works
        </Link>
      </footer>
    </div>
  )
}

/** Live devotional stations — Radio Browser's own tags, played as live streams. */
function LiveDevotionalShelf() {
  const q = useQuery({
    queryKey: ['shelf-live-devotional'],
    queryFn: ({ signal }) => unifiedTrackSearch({ radioTag: 'bhajan', rows: 6, providers: ['radio'], signal }),
    staleTime: 10 * 60 * 1000
  })
  const list = q.data?.tracks ?? []
  if (!q.isPending && list.length === 0) return null
  return (
    <Section title="Live devotional radio" subtitle="24/7 bhajan and spiritual stations from the open radio directory">
      {q.isPending ? (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : (
        <div className="divide-y divide-white/5 rounded-xl bg-surface-raised/50 ring-1 ring-white/5">
          {list.map((t) => (
            <TrackRow key={t.id} track={t} contextTracks={list} contextLabel="Live devotional radio" showAlbum={false} />
          ))}
        </div>
      )}
    </Section>
  )
}

/** One multi-source genre shelf. */
function TrackShelf({ genreId }: { genreId: string }) {
  const genre = GENRES.find((g) => g.id === genreId)!
  const opts: SearchOptions = shelfSearchOptions({ genreId, rows: 6 })
  const q = useQuery({
    queryKey: ['shelf', genreId, opts],
    queryFn: ({ signal }) => unifiedTrackSearch({ ...opts, signal }),
    staleTime: 10 * 60 * 1000
  })
  const list = (q.data?.tracks ?? []).slice(0, 6)

  return (
    <Section title={genre.label} subtitle={genre.description} seeAllTo={`/genres/${genre.id}`}>
      {q.isPending ? (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : q.isError || list.length === 0 ? (
        <p className="rounded-xl bg-surface-raised p-4 text-xs text-zinc-500 ring-1 ring-white/5">
          This shelf is temporarily unavailable — the sources may be busy. Other sections still work.
        </p>
      ) : (
        <div className="divide-y divide-white/5 rounded-xl bg-surface-raised/50 ring-1 ring-white/5">
          {list.map((t) => (
            <TrackRow key={t.id} track={t} contextTracks={list} contextLabel={genre.label} showAlbum={false} />
          ))}
        </div>
      )}
    </Section>
  )
}

/** "Session mix" — related to what you played this session (in-memory only). */
function SessionMix() {
  const sessionCount = usePlayer((s) => s.queue.length) // re-render hook: engine events refresh this
  const plays = getSessionPlays()
  const mix = useQuery({
    queryKey: ['session-mix', plays.length, plays[0]?.id ?? null, sessionCount],
    queryFn: ({ signal }) => fetchSessionMix(6, signal),
    staleTime: 60 * 1000,
    enabled: plays.length >= 2
  })

  if (plays.length < 2 || mix.isPending || mix.isError || !mix.data || mix.data.length === 0) return null

  return (
    <Section
      title="Session mix"
      subtitle="Related to what you've been playing in this tab — computed locally, never stored"
    >
      <div className="divide-y divide-white/5 rounded-xl bg-surface-raised/50 ring-1 ring-white/5">
        {mix.data.map((r) => (
          <div key={r.track.id}>
            <p className="pl-12 pt-1.5 text-[11px] italic text-zinc-500">
              <Radio className="mr-1 inline h-3 w-3 text-accent" aria-hidden />
              {r.reason}
            </p>
            <TrackRow track={r.track} contextTracks={mix.data!.map((x) => x.track)} contextLabel="Session mix" showAlbum={false} />
          </div>
        ))}
      </div>
    </Section>
  )
}

/** Top 10 + new releases from the daily charts (country remembered from the Charts page). */
function ChartShelves() {
  const country = getChartCountry()
  const label = CHART_COUNTRIES.find((c) => c.code === country)?.label ?? country
  const q = useQuery({
    queryKey: ['chart-top-songs', country],
    queryFn: ({ signal }) => fetchTopSongs(country, signal),
    staleTime: 30 * 60 * 1000,
    retry: 1
  })
  // Hide quietly when charts can't load (e.g. a static host without the proxy).
  if (q.isError) return null
  const fresh = q.data ? newReleases(q.data, 7).slice(0, 5) : []
  return (
    <>
      <Section title={`Top 10 in ${label}`} subtitle="Most played right now · updated daily" seeAllTo="/charts">
        {q.isPending ? (
          <div className="space-y-2">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : (
          <ChartList entries={q.data.entries.slice(0, 10)} contextLabel={`Top 10 · ${label}`} />
        )}
      </Section>
      {fresh.length > 0 ? (
        <Section title="New this week" subtitle={`Fresh releases already charting in ${label}`} seeAllTo="/charts?view=new">
          <ChartList entries={fresh} contextLabel={`New this week · ${label}`} showRelease />
        </Section>
      ) : null}
    </>
  )
}
