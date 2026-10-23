/** Charts: Top 10 / Top 100 / new releases from Apple Music's most-played feeds, played via YouTube. */

import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Play, Shuffle, TrendingUp } from 'lucide-react'
import {
  CHART_COUNTRIES,
  chartGenres,
  fetchTopSongs,
  getChartCountry,
  newReleases,
  setChartCountry,
  type ChartCountry,
  type ChartEntry
} from '../lib/charts'
import { ChartList } from '../components/ChartList'
import { EmptyState, ErrorState, Skeleton } from '../components/ui'
import { usePlayer } from '../stores/player'

const VIEWS = [
  { id: 'top10', label: 'Top 10' },
  { id: 'top100', label: 'Top 100' },
  { id: 'new', label: 'New this week' }
] as const
type ViewId = (typeof VIEWS)[number]['id']

export function ChartsPage() {
  const [params, setParams] = useSearchParams()
  const view: ViewId = VIEWS.some((v) => v.id === params.get('view')) ? (params.get('view') as ViewId) : 'top10'
  const [country, setCountry] = useState<ChartCountry>(getChartCountry)
  const [genre, setGenre] = useState<string | null>(null)

  const chart = useQuery({
    queryKey: ['chart-top-songs', country],
    queryFn: ({ signal }) => fetchTopSongs(country, signal),
    staleTime: 30 * 60 * 1000,
    retry: 1
  })

  const countryLabel = CHART_COUNTRIES.find((c) => c.code === country)?.label ?? country
  const genres = chart.data ? chartGenres(chart.data) : []

  // "New this week": released in the 7 days before the feed update. When a
  // quiet week has fewer than 5, widen to 14 days and say so.
  let newWindow = 7
  let entries: ChartEntry[] = []
  if (chart.data) {
    if (view === 'top10') entries = chart.data.entries.slice(0, 10)
    else if (view === 'top100') entries = chart.data.entries
    else {
      entries = newReleases(chart.data, 7)
      if (entries.length < 5) {
        newWindow = 14
        entries = newReleases(chart.data, 14)
      }
    }
    if (genre && view !== 'top10') entries = entries.filter((e) => e.genres.includes(genre))
  }
  const tracks = entries.map((e) => e.track)
  const contextLabel = `${VIEWS.find((v) => v.id === view)!.label} · ${countryLabel}`

  function play(shuffle: boolean) {
    if (tracks.length === 0) return
    const player = usePlayer.getState()
    const start = shuffle ? Math.floor(Math.random() * tracks.length) : 0
    void player.playTracks(tracks, start, contextLabel).then(() => {
      if (shuffle !== Boolean(usePlayer.getState().shuffledOrder)) usePlayer.getState().toggleShuffle()
    })
  }

  return (
    <div className="space-y-5">
      <header className="flex items-start gap-3 pt-2">
        <TrendingUp className="mt-1 h-6 w-6 flex-shrink-0 text-accent" aria-hidden />
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Charts</h1>
          <p className="text-sm text-zinc-500">
            The most played songs in {countryLabel} on Apple Music, updated daily. Each song plays through YouTube's official
            player.
          </p>
        </div>
      </header>

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0" role="tablist" aria-label="Chart">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            role="tab"
            aria-selected={view === v.id}
            onClick={() => setParams(v.id === 'top10' ? {} : { view: v.id }, { replace: true })}
            className={`flex-shrink-0 rounded-full px-4 py-1.5 text-sm font-semibold transition ${
              view === v.id ? 'bg-accent text-black' : 'bg-surface-raised text-zinc-300 ring-1 ring-white/10 hover:bg-white/10'
            }`}
          >
            {v.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-xs text-zinc-500">
          Country
          <select
            value={country}
            onChange={(e) => {
              const code = e.target.value as ChartCountry
              setCountry(code)
              setChartCountry(code)
              setGenre(null)
            }}
            className="rounded-lg bg-surface-raised px-2.5 py-1.5 text-sm text-zinc-100 ring-1 ring-white/10"
          >
            {CHART_COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        {view !== 'top10' && genres.length > 0 ? (
          <div className="-mx-4 flex w-full gap-1.5 overflow-x-auto px-4 md:mx-0 md:w-auto md:px-0">
            {[null, ...genres].map((g) => (
              <button
                key={g ?? 'all'}
                onClick={() => setGenre(g)}
                className={`flex-shrink-0 rounded-full px-3 py-1 text-xs transition ${
                  genre === g ? 'bg-white/15 text-zinc-100' : 'text-zinc-400 ring-1 ring-white/10 hover:bg-white/5'
                }`}
              >
                {g ?? 'All genres'}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {chart.isPending ? (
        <div className="space-y-2">
          {[...Array(8)].map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : chart.isError ? (
        <ErrorState
          message={chart.error instanceof Error ? chart.error.message : 'Charts are unavailable right now.'}
          onRetry={() => void chart.refetch()}
        />
      ) : entries.length === 0 ? (
        <EmptyState
          icon={<TrendingUp className="h-6 w-6" />}
          title={view === 'new' ? 'No new releases in the chart right now' : 'Nothing in this genre right now'}
          hint={view === 'new' ? 'Songs released in the last two weeks show up here once they chart.' : 'Try another genre or country.'}
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => play(false)}
              className="flex items-center gap-1.5 whitespace-nowrap rounded-full bg-accent px-4 py-2 text-sm font-bold text-black transition hover:bg-accent-soft"
            >
              <Play className="h-4 w-4 fill-current" aria-hidden /> Play all
            </button>
            <button
              onClick={() => play(true)}
              className="flex items-center gap-1.5 whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold text-zinc-200 ring-1 ring-white/15 transition hover:bg-white/5"
            >
              <Shuffle className="h-4 w-4" aria-hidden /> Shuffle
            </button>
            <p className="w-full text-[11px] text-zinc-500 sm:ml-auto sm:w-auto">
              {entries.length} song{entries.length === 1 ? '' : 's'}
              {view === 'new' ? ` · released in the last ${newWindow} days` : ''}
              {chart.data?.updated ? ` · updated ${chart.data.updated.toLocaleDateString()}` : ''}
            </p>
          </div>
          <ChartList entries={entries} contextLabel={contextLabel} showRelease={view === 'new'} />
        </>
      )}

      <p className="pb-4 text-[11px] leading-relaxed text-zinc-600">
        Chart rankings: Apple Music public RSS feeds. Each song is matched to a YouTube video when it plays, so a match can
        occasionally be a different upload of the same song. YouTube doesn't publish like counts or its own charts through
        any keyless source, so there's no "most liked" chart.
      </p>
    </div>
  )
}
