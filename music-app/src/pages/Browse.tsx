/** Genre & mood discovery: card grids + detail pages driven by config data. */

import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Smile, Compass } from 'lucide-react'
import { GENRES, MOODS, genreById, moodById } from '../config/catalog'
import { fetchAlbumsFor } from '../lib/discover'
import { AlbumCard, AlbumCardSkeleton } from '../components/AlbumCard'
import { EmptyState, ErrorState, Chip } from '../components/ui'

export function GenresPage() {
  return (
    <div className="space-y-5">
      <header className="flex items-center gap-3 pt-2">
        <Compass className="h-6 w-6 text-accent" aria-hidden />
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Genres</h1>
          <p className="text-sm text-zinc-500">Curated shelves mapped to real archive.org collections and subjects.</p>
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
            Mood shelves use keyword matching over real metadata. When a mood is estimated rather than tagged, tracks are
            labeled “estimated” — we never invent tags.
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

/** Shared shelf page for a genre or mood. */
export function ShelfPage({ kind }: { kind: 'genre' | 'mood' }) {
  const { id } = useParams<{ id: string }>()
  const [page, setPage] = useState(1)
  const def = kind === 'genre' ? genreById(id) : moodById(id)

  const q = useQuery({
    queryKey: ['shelf', kind, id, page],
    queryFn: ({ signal: _signal }) => fetchAlbumsFor({ genreId: kind === 'genre' ? id : undefined, moodId: kind === 'mood' ? id : undefined, rows: 24, page }),
    enabled: Boolean(def)
  })

  if (!def) {
    return <EmptyState title="Category not found" hint="It may have been renamed. Browse the full list instead." />
  }

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
              <Chip tone="warn">Mood matching is keyword-based (estimated)</Chip>
            </p>
          ) : null}
        </div>
      </header>

      {q.isPending ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {[...Array(10)].map((_, i) => (
            <AlbumCardSkeleton key={i} />
          ))}
        </div>
      ) : q.isError ? (
        <ErrorState message="This shelf couldn't load — the archive may be busy. Try again." onRetry={() => void q.refetch()} />
      ) : q.data.albums.length === 0 ? (
        <EmptyState title="No recordings found for this shelf right now" hint="The archive's index may be reorganizing. Check another category." />
      ) : (
        <>
          <p className="text-xs text-zinc-500">{new Intl.NumberFormat().format(q.data.total)} recordings · sorted by community listening</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {q.data.albums.map((a) => (
              <AlbumCard key={a.identifier} album={a} contextLabel={def.label} />
            ))}
          </div>
          {q.data.albums.length >= 24 ? (
            <div className="flex items-center justify-center gap-2">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="rounded-full bg-white/5 px-4 py-2 text-xs text-zinc-300 disabled:opacity-30">
                Previous
              </button>
              <span className="text-xs tabular-nums text-zinc-500">Page {page}</span>
              <button onClick={() => setPage((p) => p + 1)} className="rounded-full bg-white/5 px-4 py-2 text-xs text-zinc-300 hover:bg-white/10">
                Next
              </button>
            </div>
          ) : null}
        </>
      )}
    </div>
  )
}
