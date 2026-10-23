/** Library: liked songs, saved albums, favorite artists, sync disclosure. */

import { Link } from 'react-router-dom'
import { Heart, Info, ListMusic } from 'lucide-react'
import { useLibrary } from '../stores/library'
import { usePlayer } from '../stores/player'
import { TrackRow } from '../components/TrackRow'
import { EmptyState } from '../components/ui'

export function LibraryPage() {
  const likedTracks = useLibrary((s) => s.likedTracks)
  const savedAlbums = useLibrary((s) => s.savedAlbums)
  const favoriteArtists = useLibrary((s) => s.favoriteArtists)
  const player = usePlayer()

  const liked = Object.values(likedTracks)

  return (
    <div className="space-y-8">
      <header className="pt-2">
        <h1 className="text-2xl font-extrabold tracking-tight">Your library</h1>
        <p className="mt-1 flex items-start gap-1.5 text-sm text-zinc-500">
          <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" aria-hidden />
          Lives in this browser via IndexedDB. It doesn't sync across devices and disappears if site data is cleared.
        </p>
      </header>

      <section aria-label="Liked songs">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold">Liked songs</h2>
          {liked.length > 0 ? (
            <button
              onClick={() => void player.playTracks(liked, 0, 'Liked songs')}
              className="rounded-full bg-accent px-4 py-2 text-xs font-bold text-black transition hover:bg-accent-soft"
            >
              Play {liked.length}
            </button>
          ) : null}
        </div>
        {liked.length === 0 ? (
          <EmptyState icon={<Heart className="h-8 w-8" />} title="No liked songs yet" hint="Tap the ♥ on any track — likes tune your recommendations." />
        ) : (
          <div className="divide-y divide-white/5 rounded-xl bg-surface-raised/50 ring-1 ring-white/5">
            {liked.map((t) => (
              <TrackRow key={t.id} track={t} contextTracks={liked} contextLabel="Liked songs" />
            ))}
          </div>
        )}
      </section>

      <section aria-label="Saved albums">
        <h2 className="mb-3 text-lg font-bold">Saved albums</h2>
        {Object.keys(savedAlbums).length === 0 ? (
          <EmptyState title="No saved albums" hint="Save albums from any album page to find them here." />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {Object.values(savedAlbums).map((a) => (
              <Link key={a.identifier} to={`/album/${encodeURIComponent(a.identifier)}`} className="group rounded-xl bg-surface-raised p-3 ring-1 ring-white/5 transition hover:bg-surface-overlay">
                <img src={a.artwork} alt={`Cover: ${a.title}`} loading="lazy" className="mb-2 aspect-square w-full rounded-lg object-cover" />
                <p className="truncate text-sm font-semibold text-zinc-100">{a.title}</p>
                <p className="truncate text-xs text-zinc-500">{a.creator}</p>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section aria-label="Favorite artists">
        <h2 className="mb-3 text-lg font-bold">Favorite artists</h2>
        {Object.keys(favoriteArtists).length === 0 ? (
          <EmptyState icon={<ListMusic className="h-8 w-8" />} title="No favorite artists yet" hint="Follow artists from their pages." />
        ) : (
          <div className="flex flex-wrap gap-3">
            {Object.values(favoriteArtists).map((a) => (
              <Link key={a.name} to={`/artist/${encodeURIComponent(a.name)}`} className="flex items-center gap-2 rounded-full bg-surface-raised py-1.5 pl-1.5 pr-4 ring-1 ring-white/5 transition hover:bg-surface-overlay">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-accent/40 to-amber-700/40 text-sm font-bold text-white" aria-hidden>
                  {a.name.slice(0, 1).toUpperCase()}
                </span>
                <span className="max-w-[160px] truncate text-xs font-medium text-zinc-200">{a.name}</span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
