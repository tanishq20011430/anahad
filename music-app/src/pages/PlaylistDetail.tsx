/** Single playlist: reorder, remove, play. */

import { useParams, Link } from 'react-router-dom'
import { ArrowDown, ArrowUp, ListMusic, Pause, Play, Trash2 } from 'lucide-react'
import { useLibrary } from '../stores/library'
import { usePlayer } from '../stores/player'
import { TrackRow } from '../components/TrackRow'
import { EmptyState } from '../components/ui'

export function PlaylistDetailPage() {
  const { id } = useParams<{ id: string }>()
  const playlist = useLibrary((s) => s.playlists.find((p) => p.id === id))
  const player = usePlayer()

  if (!playlist) {
    return (
      <EmptyState
        icon={<ListMusic className="h-10 w-10" />}
        title="Playlist not found"
        hint="It may have been deleted."
      />
    )
  }

  const isPlayingThis = player.queue.length > 0 && player.contextLabel === playlist.name && player.isPlaying

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4 pt-2">
        <div>
          <Link to="/playlists" className="text-xs text-zinc-500 hover:text-zinc-300">
            ← All playlists
          </Link>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight">{playlist.name}</h1>
          <p className="text-sm text-zinc-500">
            {playlist.trackIds.length} track{playlist.trackIds.length === 1 ? '' : 's'} · local only
          </p>
        </div>
        {playlist.tracks.length > 0 ? (
          <button
            onClick={() => (isPlayingThis ? void player.togglePlay() : void player.playTracks(playlist.tracks, 0, playlist.name))}
            className="flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 text-sm font-bold text-black transition hover:bg-accent-soft"
          >
            {isPlayingThis ? <Pause className="h-4 w-4 fill-current" /> : <Play className="h-4 w-4 fill-current" />}
            {isPlayingThis ? 'Pause' : 'Play'}
          </button>
        ) : null}
      </header>

      {playlist.tracks.length === 0 ? (
        <EmptyState title="Empty playlist" hint="Use “Add to playlist…” from any track's ⋯ menu." />
      ) : (
        <div className="divide-y divide-white/5 rounded-xl bg-surface-raised/50 ring-1 ring-white/5">
          {playlist.tracks.map((t, i) => (
            <div key={`${t.id}-${i}`} className="flex items-center">
              <div className="flex flex-col">
                <button
                  onClick={() => void useLibrary.getState().moveInPlaylist(playlist.id, t.id, -1)}
                  disabled={i === 0}
                  aria-label={`Move ${t.title} up`}
                  className="rounded p-0.5 text-zinc-600 hover:text-zinc-200 disabled:opacity-20"
                >
                  <ArrowUp className="h-3 w-3" />
                </button>
                <button
                  onClick={() => void useLibrary.getState().moveInPlaylist(playlist.id, t.id, 1)}
                  disabled={i === playlist.tracks.length - 1}
                  aria-label={`Move ${t.title} down`}
                  className="rounded p-0.5 text-zinc-600 hover:text-zinc-200 disabled:opacity-20"
                >
                  <ArrowDown className="h-3 w-3" />
                </button>
              </div>
              <div className="min-w-0 flex-1">
                <TrackRow
                  track={t}
                  index={i}
                  contextTracks={playlist.tracks}
                  contextLabel={playlist.name}
                  onRemove={() => void useLibrary.getState().removeFromPlaylist(playlist.id, t.id)}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="text-[11px] leading-relaxed text-zinc-600">
        Playlists store track references + metadata snapshots, never audio files. If the archive item changes, tracks
        re-resolve on play; genuinely removed files will surface a clear error instead of fake playback.
      </p>
      <button
        onClick={() => void useLibrary.getState().deletePlaylist(playlist.id)}
        className="flex items-center gap-1.5 text-xs text-zinc-600 transition hover:text-red-400"
      >
        <Trash2 className="h-3.5 w-3.5" /> Delete this playlist
      </button>
    </div>
  )
}
