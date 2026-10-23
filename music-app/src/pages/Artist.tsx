/** Artist page: creator search + their albums. Favorite toggle. */

import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Heart } from 'lucide-react'
import { unifiedSearch } from '../lib/searchService'
import { AlbumCard, AlbumCardSkeleton } from '../components/AlbumCard'
import { EmptyState, ErrorState } from '../components/ui'
import { useLibrary } from '../stores/library'

export function ArtistPage() {
  const { name } = useParams<{ name: string }>()
  const artist = decodeURIComponent(name ?? '')
  const isFav = useLibrary((s) => Boolean(artist && s.favoriteArtists[artist]))

  const q = useQuery({
    queryKey: ['artist', artist],
    queryFn: ({ signal }) => unifiedSearch({ creator: artist, rows: 24, sort: 'downloads', signal }),
    enabled: Boolean(artist)
  })

  if (!artist) return <EmptyState title="Unknown artist" />

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-4 pt-2">
        <div className="flex h-20 w-20 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-accent/40 to-amber-700/40 text-2xl font-black text-white ring-1 ring-white/10" aria-hidden>
          {artist.slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">Artist</p>
          <h1 className="break-words text-2xl font-extrabold tracking-tight">{artist}</h1>
          <button
            onClick={() => useLibrary.getState().toggleFavoriteArtist(artist)}
            aria-pressed={isFav}
            className={`mt-2 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium ring-1 ring-white/10 transition ${
              isFav ? 'bg-accent/15 text-accent' : 'bg-white/5 text-zinc-400 hover:text-white'
            }`}
          >
            <Heart className={`h-3.5 w-3.5 ${isFav ? 'fill-current' : ''}`} />
            {isFav ? 'Favorite' : 'Add to favorites'}
          </button>
        </div>
      </header>

      {q.isPending ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {[...Array(10)].map((_, i) => (
            <AlbumCardSkeleton key={i} />
          ))}
        </div>
      ) : q.isError ? (
        <ErrorState message="Couldn't load this artist's recordings." onRetry={() => void q.refetch()} />
      ) : q.data.albums.length === 0 ? (
        <EmptyState title="No recordings found" hint="The artist may be listed under a different name in the archive." />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {q.data.albums.map((a) => (
            <AlbumCard key={a.identifier} album={a} contextLabel={artist} />
          ))}
        </div>
      )}
    </div>
  )
}
