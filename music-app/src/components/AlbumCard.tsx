/** Album (archive.org item) card with hover play. */

import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Music2, Play, Pause } from 'lucide-react'
import type { AlbumResult } from '../types'
import { internetArchiveProvider } from '../lib/archive'
import { usePlayer, selectCurrentTrack } from '../stores/player'
import { useLibrary } from '../stores/library'
import { Spinner } from './ui'

export function AlbumCard({ album, contextLabel }: { album: AlbumResult; contextLabel?: string }) {
  const player = usePlayer()
  const current = usePlayer(selectCurrentTrack)
  const { refetch, isFetching } = useQuery({
    queryKey: ['item-tracks', album.identifier],
    queryFn: ({ signal }) => internetArchiveProvider.getItemTracks(album.identifier, signal),
    enabled: false,
    staleTime: 10 * 60 * 1000
  })
  const isSaved = useLibrary((s) => Boolean(s.savedAlbums[album.identifier]))

  const isPlayingThis = current?.identifier === album.identifier && player.isPlaying

  async function handlePlay() {
    if (isPlayingThis) {
      void player.togglePlay()
      return
    }
    const { data } = await refetch()
    const tracks = data ?? []
    if (tracks.length > 0) {
      void player.playTracks(tracks, 0, contextLabel ?? album.title)
    }
  }

  return (
    <div className="group relative w-40 flex-shrink-0 rounded-xl bg-surface-raised p-3 ring-1 ring-white/5 transition hover:bg-surface-overlay hover:ring-white/10 sm:w-44">
      <div className="relative mb-2 aspect-square overflow-hidden rounded-lg bg-zinc-800">
        <img
          src={album.artwork}
          alt={`Cover art for ${album.title}`}
          loading="lazy"
          className="h-full w-full object-cover"
          onError={(e) => {
            ;(e.target as HTMLImageElement).style.visibility = 'hidden'
          }}
        />
        <button
          onClick={() => void handlePlay()}
          aria-label={isPlayingThis ? `Pause ${album.title}` : `Play ${album.title}`}
          className="absolute bottom-2 right-2 flex h-10 w-10 items-center justify-center rounded-full bg-accent text-black opacity-0 shadow-lg transition hover:scale-105 focus-visible:opacity-100 group-hover:opacity-100"
        >
          {isFetching ? <Spinner className="h-4 w-4" /> : isPlayingThis ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 translate-x-0.5" />}
        </button>
      </div>
      <Link to={`/album/${encodeURIComponent(album.identifier)}`} className="block truncate text-sm font-semibold text-zinc-100 hover:underline" title={album.title}>
        {album.title}
      </Link>
      <p className="truncate text-xs text-zinc-500" title={album.creator}>
        {album.creator}
      </p>
      <div className="mt-1 flex items-center gap-1">
        {isSaved ? <Music2 className="h-3 w-3 text-accent" aria-label="Saved in library" /> : null}
        {album.year ? <span className="text-[10px] text-zinc-600">{album.year}</span> : null}
      </div>
    </div>
  )
}

export function AlbumCardSkeleton() {
  return (
    <div className="w-40 flex-shrink-0 rounded-xl bg-surface-raised p-3">
      <div className="mb-2 aspect-square animate-pulse rounded-lg bg-white/5" />
      <div className="mb-1 h-3.5 w-3/4 animate-pulse rounded bg-white/5" />
      <div className="h-3 w-1/2 animate-pulse rounded bg-white/5" />
    </div>
  )
}
