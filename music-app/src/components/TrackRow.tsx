/** Track row: play, like, queue actions, add-to-playlist. Capability-honest. */

import { Link } from 'react-router-dom'
import { useState } from 'react'
import { Heart, ListEnd, ListPlus, ListStart, Loader2, MoreHorizontal, Pause, Play, Plus, X } from 'lucide-react'
import type { Track } from '../types'
import { usePlayer, selectCurrentTrack } from '../stores/player'
import { useLibrary } from '../stores/library'
import { formatDuration } from '../lib/format'
import { sourceChipFor } from '../lib/sourceStatus'
import { isPlayable } from '../lib/resolve'
import { toast } from './ui'
import { AddToPlaylistModal } from './AddToPlaylistModal'

export function TrackRow({
  track,
  index,
  contextTracks,
  contextLabel,
  /* legacy prop (album links were removed with the Internet Archive source) */
  showAlbum: _showAlbum,
  onRemove
}: {
  track: Track
  index?: number
  contextTracks?: Track[]
  contextLabel?: string | null
  showAlbum?: boolean
  onRemove?: () => void
}) {
  const player = usePlayer()
  const current = usePlayer(selectCurrentTrack)
  const isCurrent = current?.id === track.id
  const isPlaying = isCurrent && player.isPlaying && !player.isLoading
  const isBuffering = isCurrent && player.isBuffering && !player.isLoading
  const liked = useLibrary((s) => Boolean(s.likedTracks[track.id]))
  const [menuOpen, setMenuOpen] = useState(false)
  const [playlistModal, setPlaylistModal] = useState(false)

  const playable = isPlayable(track)

  function handlePlay() {
    if (isCurrent) {
      void player.togglePlay()
      return
    }
    if (contextTracks && contextTracks.length > 0) {
      const idx = Math.max(0, contextTracks.findIndex((t) => t.id === track.id))
      void player.playTracks(contextTracks, idx, contextLabel ?? null)
    } else {
      void player.playTracks([track], 0, null)
    }
  }

  return (
    <div
      className={`group flex items-center gap-3 rounded-lg px-2 py-2 transition ${isCurrent ? 'bg-accent/10' : 'hover:bg-white/5'}`}
      onDoubleClick={handlePlay}
    >
      <button
        onClick={handlePlay}
        aria-label={isPlaying ? `Pause ${track.title}` : `Play ${track.title}`}
        className="relative flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-md bg-zinc-800"
      >
        {track.artwork ? (
          <img src={track.artwork} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
        ) : null}
        <span className={`absolute inset-0 flex items-center justify-center bg-black/60 transition ${playable ? 'opacity-0 group-hover:opacity-100' : 'opacity-100'}`}>
          {isPlaying ? <Pause className="h-4 w-4 text-accent-soft" /> : <Play className="h-4 w-4 text-white" />}
        </span>
        {isPlaying ? (
          <span className="eq absolute bottom-1 right-1 text-accent-soft" aria-hidden>
            <span className="h-2" />
            <span className="h-2" />
            <span className="h-2" />
          </span>
        ) : null}
        {isBuffering ? (
          <span className="absolute bottom-1 right-1" aria-hidden>
            <Loader2 className="h-3 w-3 animate-spin text-amber-400" />
          </span>
        ) : null}
      </button>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {typeof index === 'number' ? <span className="hidden w-5 flex-shrink-0 text-right text-xs tabular-nums text-zinc-600 sm:inline">{index + 1}</span> : null}
          {track.lookup ? (
            // Chart entry: no detail page until it's matched to a video at play time.
            <span className="truncate text-sm font-medium text-zinc-100">{track.title}</span>
          ) : playable ? (
            <Link to={`/track/${track.source}/${encodeURIComponent(track.identifier)}`} className="truncate text-sm font-medium text-zinc-100 hover:underline">
              {track.title}
            </Link>
          ) : (
            <span className="truncate text-sm font-medium text-zinc-500" title="No playable audio at source">
              {track.title} (unavailable)
            </span>
          )}
          {track.isLive ? (
            <span className="flex-shrink-0 rounded bg-red-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-red-400" title="Live stream — no seeking">
              Live
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-1.5 text-xs text-zinc-500">
          <span className="truncate">{track.artist}</span>
          <span aria-hidden>·</span>
          <span className="flex-shrink-0 text-[10px] uppercase tracking-wide text-zinc-600">{sourceChipFor(track.source, track.collection)}</span>
        </div>
      </div>

      <span className="hidden flex-shrink-0 text-xs tabular-nums text-zinc-500 sm:block">{track.isLive ? '—' : formatDuration(track.durationSec)}</span>

      <div className="flex flex-shrink-0 items-center gap-0.5">
        <button
          onClick={() => useLibrary.getState().toggleLike(track)}
          aria-label={liked ? `Unlike ${track.title}` : `Like ${track.title}`}
          aria-pressed={liked}
          className={`rounded-full p-1.5 transition ${liked ? 'text-accent' : 'text-zinc-500 hover:text-zinc-200'} opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100`}
        >
          <Heart className={`h-4 w-4 ${liked ? 'fill-current' : ''}`} />
        </button>
        <div className="relative">
          <button
            onClick={() => setMenuOpen((o) => !o)}
            aria-label={`More actions for ${track.title}`}
            aria-expanded={menuOpen}
            className="rounded-full p-1.5 text-zinc-500 transition hover:text-zinc-200 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
          {menuOpen ? (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} aria-hidden />
              <div className="absolute right-0 z-50 mt-1 w-52 overflow-hidden rounded-xl bg-surface-overlay py-1 shadow-2xl ring-1 ring-white/10" role="menu">
                <MenuItem
                  icon={<ListStart className="h-4 w-4" />}
                  label="Play next"
                  onClick={() => {
                    player.playNext(track)
                    setMenuOpen(false)
                    toast('Playing next')
                  }}
                />
                <MenuItem
                  icon={<ListEnd className="h-4 w-4" />}
                  label="Add to queue"
                  onClick={() => {
                    player.addToQueue(track)
                    setMenuOpen(false)
                    toast('Added to queue')
                  }}
                />
                <MenuItem
                  icon={<Plus className="h-4 w-4" />}
                  label="Add to playlist…"
                  onClick={() => {
                    setMenuOpen(false)
                    setPlaylistModal(true)
                  }}
                />
                {onRemove ? (
                  <MenuItem
                    icon={<X className="h-4 w-4" />}
                    label="Remove"
                    onClick={() => {
                      onRemove()
                      setMenuOpen(false)
                    }}
                  />
                ) : null}
              </div>
            </>
          ) : null}
        </div>
      </div>

      {playlistModal ? <AddToPlaylistModal track={track} onClose={() => setPlaylistModal(false)} /> : null}
    </div>
  )
}

function MenuItem({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      role="menuitem"
      className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs text-zinc-200 transition hover:bg-white/5"
    >
      <span className="text-zinc-500">{icon}</span>
      {label}
    </button>
  )
}

export function ListPlusIconPlaceholder() {
  return <ListPlus className="h-4 w-4" aria-hidden />
}
