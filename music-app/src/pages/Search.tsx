/** Search: debounced unified multi-source search with filters + suggestions. */

import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Filter, Link2, Mic2, Play, Search as SearchIcon, X } from 'lucide-react'
import { fetchArtistHits, searchArtists } from '../lib/artists'
import { artistPath } from '../components/ArtistLinks'
import { usePlayer } from '../stores/player'
import { unifiedTrackSearch, buildSuggestions, PROVIDERS } from '../lib/searchService'
import { GENRES, LANGUAGES } from '../config/catalog'
import { TrackRow } from '../components/TrackRow'
import { EmptyState, Skeleton, DegradedSources, Spinner, toast } from '../components/ui'
import { parseExternalUrl, embedSrc } from '../lib/external'
import { useDebounce } from '../hooks/useDebounce'
import type { ExternalEmbed, SourceId, UnifiedTrackSearchResponse } from '../types'

export function SearchPage() {
  const [params, setParams] = useSearchParams()
  const urlQuery = params.get('q') ?? ''
  const [input, setInput] = useState(urlQuery)
  const [genre, setGenre] = useState(params.get('genre') ?? '')
  const [language, setLanguage] = useState(params.get('lang') ?? '')
  const [showFilters, setShowFilters] = useState(false)
  const [focused, setFocused] = useState(false)
  const debounced = useDebounce(urlQuery, 350)

  useEffect(() => {
    const next = new URLSearchParams()
    if (input.trim()) next.set('q', input.trim())
    if (genre) next.set('genre', genre)
    if (language) next.set('lang', language)
    setParams(next, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input, genre, language])

  const suggestions = focused && input.trim() ? buildSuggestions(input) : []
  const genreDef = GENRES.find((g) => g.id === genre)
  const langDef = LANGUAGES.find((l) => l.id === language)

  return (
    <div className="space-y-5">
      <div className="sticky top-0 z-30 -mx-4 bg-surface/95 px-4 pb-3 pt-2 backdrop-blur md:-mx-6 md:px-6">
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" aria-hidden />
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setTimeout(() => setFocused(false), 150)}
            onKeyDown={(e) => e.key === 'Escape' && (e.target as HTMLInputElement).blur()}
            placeholder="Songs, artists, shows, stations, genres…"
            aria-label="Search music across connected sources"
            role="searchbox"
            className="w-full rounded-full bg-surface-raised py-3 pl-10 pr-24 text-sm text-zinc-100 placeholder-zinc-500 ring-1 ring-white/10 transition focus:outline-none focus:ring-accent/50"
            enterKeyHint="search"
          />
          <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
            {input ? (
              <button onClick={() => setInput('')} aria-label="Clear search" className="rounded-full p-1.5 text-zinc-500 hover:text-zinc-200">
                <X className="h-4 w-4" />
              </button>
            ) : null}
            <button
              onClick={() => setShowFilters((s) => !s)}
              aria-label="Toggle filters"
              aria-expanded={showFilters}
              className={`rounded-full p-1.5 transition ${showFilters || genre || language ? 'bg-accent/15 text-accent' : 'text-zinc-500 hover:text-zinc-200'}`}
            >
              <Filter className="h-4 w-4" />
            </button>
          </div>
        </div>

        {suggestions.length > 0 ? (
          <div className="absolute inset-x-4 top-full z-40 mt-1 overflow-hidden rounded-xl bg-surface-overlay shadow-2xl ring-1 ring-white/10 md:inset-x-6">
            {suggestions.map((s) => (
              <button
                key={s.label}
                onMouseDown={() => {
                  if (s.label.startsWith('Search ')) setInput(s.to.split('q=')[1] ? decodeURIComponent(s.to.split('q=')[1]) : '')
                }}
                className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-xs text-zinc-300 hover:bg-white/5"
              >
                <SearchIcon className="h-3 w-3 text-zinc-600" aria-hidden />
                {s.label}
              </button>
            ))}
          </div>
        ) : null}

        {showFilters ? (
          <div className="mt-3 flex flex-wrap gap-2">
            <select
              value={genre}
              onChange={(e) => setGenre(e.target.value)}
              aria-label="Filter by genre"
              className="rounded-full bg-surface-raised px-3 py-1.5 text-xs text-zinc-200 ring-1 ring-white/10 focus:outline-none"
            >
              <option value="">All genres</option>
              {GENRES.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.label}
                </option>
              ))}
            </select>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              aria-label="Filter by language"
              className="rounded-full bg-surface-raised px-3 py-1.5 text-xs text-zinc-200 ring-1 ring-white/10 focus:outline-none"
            >
              <option value="">All languages</option>
              {LANGUAGES.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </select>
            {(genre || language) && (
              <button
                onClick={() => {
                  setGenre('')
                  setLanguage('')
                }}
                className="rounded-full bg-white/5 px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200"
              >
                Reset filters
              </button>
            )}
          </div>
        ) : null}
      </div>

      {debounced.trim() && !genre && !language ? <ArtistResults query={debounced} /> : null}

      {debounced.trim() ? (
        <TrackResults
          query={debounced}
          opts={{
            query: debounced || undefined,
            tag: genreDef?.openverseTag,
            audiusGenre: genreDef?.audiusGenre,
            radioTag: genreDef?.radioTag,
            radioName: genreDef?.radioName,
            radioLanguage: langDef?.radioLanguage
          }}
        />
      ) : (
        <EmptyState
          title="Search every connected source"
          hint="Type above to search YouTube, Audius, live radio, Creative Commons catalogs and Mixcloud at once — real catalogs, no fake results."
        />
      )}
      <ExternalLinkTool />
    </div>
  )
}

type TrackQuery = ReturnType<typeof useQuery<UnifiedTrackSearchResponse>>

/** Artists matching the query: open their page or play their top hits in one tap. */
function ArtistResults({ query }: { query: string }) {
  const q = useQuery({
    queryKey: ['artist-search', query.toLowerCase()],
    queryFn: ({ signal }) => searchArtists(query, 4, signal),
    staleTime: 10 * 60 * 1000,
    retry: 0
  })
  const [loading, setLoading] = useState<string | null>(null)
  const artists = q.data ?? []
  if (artists.length === 0) return null

  async function playHits(name: string) {
    setLoading(name)
    try {
      const hits = await fetchArtistHits(name)
      if (hits.tracks.length === 0) toast(`No hits found for ${name}`, 'error')
      else await usePlayer.getState().playTracks(hits.tracks, 0, `${hits.name} · top hits`)
    } catch {
      toast("Couldn't load this artist's hits right now", 'error')
    } finally {
      setLoading(null)
    }
  }

  return (
    <section aria-label="Artists">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Artists</p>
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0">
        {artists.map((a) => (
          <div key={a.id} className="flex flex-shrink-0 items-center gap-2 rounded-full bg-surface-raised py-1.5 pl-1.5 pr-2 ring-1 ring-white/10">
            <Link to={artistPath(a.name)} className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-accent/15 text-accent" aria-hidden>
                <Mic2 className="h-4 w-4" />
              </span>
              <span className="max-w-[10rem]">
                <span className="block truncate text-sm font-semibold text-zinc-100">{a.name}</span>
                {a.genre ? <span className="block truncate text-[10px] text-zinc-500">{a.genre}</span> : null}
              </span>
            </Link>
            <button
              onClick={() => void playHits(a.name)}
              disabled={loading !== null}
              aria-label={`Play top hits by ${a.name}`}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-black transition hover:bg-accent-soft disabled:opacity-60"
            >
              {loading === a.name ? <Spinner className="h-4 w-4" /> : <Play className="h-4 w-4 fill-current" />}
            </button>
          </div>
        ))}
      </div>
    </section>
  )
}

function TrackResults({
  query,
  opts
}: {
  query: string
  opts: { query?: string; tag?: string; audiusGenre?: string; radioTag?: string; radioName?: string; radioLanguage?: string }
}) {
  // One independent query per source: a slow or dead source can never block
  // the others, and each degrades with its own honest notice. Hooks run in a
  // fixed, unconditional order (rules of hooks).
  const audiusQ = useTrackQuery('audius', opts)
  const youtubeQ = useTrackQuery('youtube', opts)
  const radioQ = useTrackQuery('radio', opts)
  const openverseQ = useTrackQuery('openverse', opts)
  const mixcloudQ = useTrackQuery('mixcloud', opts)
  const bySource: [SourceId, TrackQuery][] = [
    ['audius', audiusQ],
    ['youtube', youtubeQ],
    ['radio', radioQ],
    ['openverse', openverseQ],
    ['mixcloud', mixcloudQ]
  ]

  const anyLoading = bySource.some(([, q]) => q.isPending)
  const allEmpty = bySource.every(([, q]) => (q.data?.tracks ?? []).length === 0)
  const degraded = bySource.flatMap(([, q]) => q.data?.degraded ?? [])

  if (anyLoading && allEmpty) {
    return (
      <section aria-label="Matching tracks" className="space-y-2">
        <h2 className="text-sm font-bold text-zinc-100">Tracks</h2>
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </section>
    )
  }

  return (
    <section aria-label="Matching tracks" className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-zinc-100">Tracks</h2>
        <p className="text-[11px] text-zinc-600">searched across every enabled source</p>
      </div>
      {degraded.length > 0 ? <DegradedSources degraded={degraded} /> : null}
      {allEmpty ? (
        <p className="rounded-xl bg-surface-raised p-3 text-xs text-zinc-500 ring-1 ring-white/5">
          No matches for “{query}” right now — sources that failed are listed above.
        </p>
      ) : (
        bySource.map(([source, q]) => {
          const p = providerFor(source)
          const tracks = q.data?.tracks ?? []
          if (!tracks.length && !q.isPending && !q.isError) return null
          return (
            <div key={source} className="space-y-1">
              <div className="flex items-center gap-2 px-1">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">From {p.label}</p>
                {q.isPending ? <Spinner className="h-3 w-3 text-accent" /> : null}
              </div>
              {q.isError ? (
                <p className="rounded-xl bg-amber-500/10 p-3 text-[11px] text-amber-300/90 ring-1 ring-amber-500/20" role="status">
                  {p.label} is not answering right now — other sources are unaffected.
                </p>
              ) : tracks.length > 0 ? (
                <div className="divide-y divide-white/5 rounded-xl bg-surface-raised/50 ring-1 ring-white/5">
                  {tracks.map((t) => (
                    <TrackRow key={t.id} track={t} contextTracks={tracks} contextLabel={`Search: ${query}`} showAlbum={false} />
                  ))}
                </div>
              ) : null}
            </div>
          )
        })
      )}
    </section>
  )
}

function providerFor(source: SourceId) {
  return PROVIDERS.find((p) => p.id === source)!
}

function useTrackQuery(source: SourceId, opts: { query?: string; tag?: string; audiusGenre?: string; radioTag?: string; radioName?: string; radioLanguage?: string }): TrackQuery {
  return useQuery({
    queryKey: ['track-search', source, opts],
    queryFn: ({ signal }) => unifiedTrackSearch({ ...opts, providers: [source], rows: 12, signal }),
    staleTime: 3 * 60 * 1000,
    retry: 0, // adapters handle their own transient retries + honest errors
    enabled: Boolean(opts.query?.trim())
  })
}

/** Official-embed tool: paste a YouTube/Spotify/Mixcloud link to play it. No keys. */
function ExternalLinkTool() {
  const [url, setUrl] = useState('')
  const [embed, setEmbed] = useState<ExternalEmbed | null>(null)

  function add() {
    const parsed = parseExternalUrl(url)
    if (!parsed) {
      toast('That doesn\'t look like a YouTube, Spotify or Mixcloud link', 'error')
      return
    }
    setEmbed(parsed)
    setUrl('')
    toast('Embedded player added below — playback is provider-controlled', 'info')
  }

  return (
    <section className="rounded-xl bg-surface-raised p-4 ring-1 ring-white/5" aria-label="External link player">
      <h3 className="flex items-center gap-2 text-sm font-bold text-zinc-100">
        <Link2 className="h-4 w-4 text-accent" aria-hidden /> Play an official embed
      </h3>
      <p className="mt-1 text-xs leading-relaxed text-zinc-500">
        Paste a YouTube, Spotify or Mixcloud link to add its <strong className="text-zinc-400">official embedded player</strong> below.
        Their controls handle playback; Anahad never extracts streams or bypasses ads.
      </p>
      <div className="mt-3 flex gap-2">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          placeholder="https://www.youtube.com/watch?v=… or https://www.mixcloud.com/…"
          aria-label="External media URL"
          className="min-w-0 flex-1 rounded-lg bg-black/30 px-3 py-2 text-xs text-zinc-100 placeholder-zinc-600 ring-1 ring-white/10 focus:outline-none focus:ring-accent/50"
        />
        <button onClick={add} className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-black transition hover:bg-accent-soft">
          <Play className="h-3.5 w-3.5" /> Embed
        </button>
      </div>
      {embed ? (
        <div className="mt-3 overflow-hidden rounded-lg">
          <iframe
            title={`Official ${embed.source} embed`}
            src={embedSrc(embed, false)}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className={embed.source === 'spotify' ? 'h-36 w-full' : 'aspect-video w-full'}
          />
        </div>
      ) : null}
    </section>
  )
}
