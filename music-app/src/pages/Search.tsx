/** Search: debounced unified search with filters, suggestions, pagination. */

import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Filter, Link2, Play, Search as SearchIcon, X } from 'lucide-react'
import { unifiedSearch, buildSuggestions } from '../lib/searchService'
import { GENRES, LANGUAGES } from '../config/catalog'
import { AlbumCard, AlbumCardSkeleton } from '../components/AlbumCard'
import { EmptyState, ErrorState, toast } from '../components/ui'
import { parseExternalUrl, embedSrc } from '../lib/external'
import { useDebounce } from '../hooks/useDebounce'
import type { ExternalEmbed } from '../types'

export function SearchPage() {
  const [params, setParams] = useSearchParams()
  const urlQuery = params.get('q') ?? ''
  const [input, setInput] = useState(urlQuery)
  const [genre, setGenre] = useState(params.get('genre') ?? '')
  const [language, setLanguage] = useState(params.get('lang') ?? '')
  const [showFilters, setShowFilters] = useState(false)
  const [focused, setFocused] = useState(false)
  const [page, setPage] = useState(1)
  const debounced = useDebounce(urlQuery, 350)

  const search = useQuery({
    queryKey: ['search', debounced, genre, language, page],
    queryFn: ({ signal }) =>
      unifiedSearch({
        query: debounced || undefined,
        genre: genre ? (GENRES.find((g) => g.id === genre)?.clause ?? undefined) : undefined,
        language: language ? (LANGUAGES.find((l) => l.id === language)?.clause ?? undefined) : undefined,
        rows: 24,
        page,
        sort: debounced ? 'relevance' : 'downloads',
        signal
      })
  })

  // Reset page when filters change
  useEffect(() => {
    setPage(1)
  }, [debounced, genre, language])

  useEffect(() => {
    const next = new URLSearchParams()
    if (input.trim()) next.set('q', input.trim())
    if (genre) next.set('genre', genre)
    if (language) next.set('lang', language)
    setParams(next, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input, genre, language])

  const suggestions = focused && input.trim() ? buildSuggestions(input) : []

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
            placeholder="Songs, artists, albums, genres…"
            aria-label="Search music"
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

      <SearchResults search={search} page={page} onPage={setPage} query={debounced} />
      <ExternalLinkTool />
    </div>
  )
}

function SearchResults({
  search,
  page,
  onPage,
  query
}: {
  search: ReturnType<typeof useQuery<{ albums: import('../types').AlbumResult[]; total: number }>>
  page: number
  onPage: (p: number) => void
  query: string
}) {
  if (search.isPending) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {[...Array(10)].map((_, i) => (
          <AlbumCardSkeleton key={i} />
        ))}
      </div>
    )
  }
  if (search.isError) {
    return <ErrorState message="Search is unavailable right now — the archive may be rate-limiting us. Please try again shortly." onRetry={() => void search.refetch()} />
  }
  const albums = search.data?.albums ?? []
  if (albums.length === 0) {
    return (
      <EmptyState
        title={query ? `No results for “${query}”` : 'Nothing to show yet'}
        hint={query ? 'Check the spelling, or try broader terms like a genre or artist name.' : 'Type above to search thousands of freely licensed recordings.'}
      />
    )
  }
  return (
    <div className="space-y-4">
      <p className="text-xs text-zinc-500">
        {search.data?.total ? `${new Intl.NumberFormat().format(search.data.total)} matching recordings` : 'Results'} · source: Internet Archive
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {albums.map((a) => (
          <AlbumCard key={a.identifier} album={a} contextLabel={query ? `Search: ${query}` : 'Browse'} />
        ))}
      </div>
      {albums.length >= 24 ? (
        <div className="flex items-center justify-center gap-2 pt-2">
          <button
            onClick={() => onPage(Math.max(1, page - 1))}
            disabled={page === 1}
            className="rounded-full bg-white/5 px-4 py-2 text-xs text-zinc-300 disabled:opacity-30"
          >
            Previous
          </button>
          <span className="text-xs tabular-nums text-zinc-500">Page {page}</span>
          <button onClick={() => onPage(page + 1)} className="rounded-full bg-white/5 px-4 py-2 text-xs text-zinc-300 hover:bg-white/10">
            Next
          </button>
        </div>
      ) : null}
    </div>
  )
}

/** Official-embed tool: paste a YouTube/Spotify link to queue it. No keys. */
function ExternalLinkTool() {
  const [url, setUrl] = useState('')
  const [embed, setEmbed] = useState<ExternalEmbed | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  function add() {
    const parsed = parseExternalUrl(url)
    if (!parsed) {
      toast('That doesn\'t look like a YouTube or Spotify link', 'error')
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
        Paste a YouTube or Spotify link to add its <strong className="text-zinc-400">official embedded player</strong> below.
        Their controls handle playback; Anahad never extracts streams or bypasses ads.
      </p>
      <div className="mt-3 flex gap-2">
        <input
          ref={inputRef}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          placeholder="https://www.youtube.com/watch?v=… or https://open.spotify.com/track/…"
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
            className="aspect-video w-full"
          />
        </div>
      ) : null}
    </section>
  )
}
