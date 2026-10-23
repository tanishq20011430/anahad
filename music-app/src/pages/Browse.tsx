/** Genre & mood discovery: card grids + track shelves driven by config data. */

import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Smile, Compass } from 'lucide-react'
import { GENRES, MOODS, genreById, moodById } from '../config/catalog'
import { shelfSearchOptions } from '../lib/discover'
import { unifiedTrackSearch } from '../lib/searchService'
import { TrackRow } from '../components/TrackRow'
import { EmptyState, ErrorState, Chip, DegradedSources, Skeleton } from '../components/ui'

export function GenresPage() {
  return (
    <div className="space-y-5">
      <header className="flex items-center gap-3 pt-2">
        <Compass className="h-6 w-6 text-accent" aria-hidden />
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Genres</h1>
          <p className="text-sm text-zinc-500">Curated shelves mapped to real catalogs: YouTube, Audius, live radio and Creative Commons.</p>
        </div>
      </header>
      <CardGrid items={GENRES.map((g) => ({ id: g.id, label: g.label, description: g.description, gradient: g.gradient, to: `/genres/${g.id}` }))} />
    </div>
  )
}

export function MoodsPage() {
  return (
    <div className="space-y-5">
      <header className="flex items-center gap-3 pt-2">
        <Smile className="h-6 w-6 text-accent" aria-hidden />
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Moods</h1>
          <p className="text-sm text-zinc-500">
            Mood shelves use real mood tags where a source provides them (Audius), and keyword-matching elsewhere —
            estimated moods are always labeled as such.
          </p>
        </div>
      </header>
      <CardGrid items={MOODS.map((m) => ({ id: m.id, label: m.label, description: m.description, gradient: m.gradient, to: `/moods/${m.id}` }))} />
    </div>
  )
}

interface CardItem {
  id: string
  label: string
  description: string
  gradient: string
  to: string
}

function CardGrid({ items }: { items: CardItem[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {items.map((g) => (
        <Link
          key={g.id}
          to={g.to}
          className={`group relative min-h-[110px] overflow-hidden rounded-xl bg-gradient-to-br ${g.gradient} p-4 transition hover:scale-[1.02]`}
        >
          <div className="absolute inset-0 bg-black/25 transition group-hover:bg-black/10" aria-hidden />
          <div className="relative flex h-full flex-col justify-end">
            <p className="text-sm font-bold text-white drop-shadow">{g.label}</p>
            <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-white/80">{g.description}</p>
          </div>
        </Link>
      ))}
    </div>
  )
}

/** Shared track shelf page for a genre or mood. */
export function ShelfPage({ kind }: { kind: 'genre' | 'mood' }) {
  const { id } = useParams<{ id: string }>()
  const def = kind === 'genre' ? genreById(id) : moodById(id)

  const opts = def
    ? kind === 'genre'
      ? shelfSearchOptions({ genreId: id, rows: 24 })
      : shelfSearchOptions({ moodId: id, rows: 24 })
    : null

  const tracks = useQuery({
    queryKey: ['shelf-tracks', kind, id, opts],
    queryFn: ({ signal }) => unifiedTrackSearch({ ...opts!, signal }),
    staleTime: 5 * 60 * 1000,
    enabled: Boolean(def && opts)
  })

  if (!def || !opts) {
    return <EmptyState title="Category not found" hint="It may have been renamed. Browse the full list instead." />
  }

  const list = tracks.data?.tracks ?? []

  return (
    <div className="space-y-6">
      <header className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${def.gradient} p-6 md:p-8`}>
        <div className="absolute inset-0 bg-black/30" aria-hidden />
        <div className="relative">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-white/70">{kind === 'genre' ? 'Genre' : 'Mood'}</p>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-white md:text-3xl">{def.label}</h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-white/85">{def.description}</p>
          {kind === 'mood' ? (
            <p className="mt-3">
              <Chip tone="warn">Mood matching is partly keyword-based (estimated)</Chip>
            </p>
          ) : null}
        </div>
      </header>

      {tracks.isPending ? (
        <section aria-label="Loading shelf" className="space-y-2">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </section>
      ) : tracks.isError ? (
        <ErrorState message="This shelf couldn't load — a source may be busy. Try again." onRetry={() => void tracks.refetch()} />
      ) : list.length === 0 ? (
        <EmptyState
          title="Nothing found on this shelf right now"
          hint="The connected catalogs answered, but had no matches. Check another category or search directly."
        />
      ) : (
        <section aria-label="Tracks on this shelf" className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-zinc-100">Tracks</h2>
            <p className="text-[11px] text-zinc-600">{list.length} results across enabled sources</p>
          </div>
          <DegradedSources degraded={tracks.data?.degraded} />
          <div className="divide-y divide-white/5 rounded-xl bg-surface-raised/50 ring-1 ring-white/5">
            {list.map((t) => (
              <TrackRow key={t.id} track={t} contextTracks={list} contextLabel={def.label} showAlbum={false} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
