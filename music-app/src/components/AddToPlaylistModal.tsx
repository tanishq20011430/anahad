/** Modal to add a track to an existing playlist or a new one. */

import { useState } from 'react'
import { ListMusic, Plus, X } from 'lucide-react'
import type { Track } from '../types'
import { useLibrary } from '../stores/library'
import { toast } from './ui'

export function AddToPlaylistModal({ track, onClose }: { track: Track; onClose: () => void }) {
  const playlists = useLibrary((s) => s.playlists)
  const [newName, setNewName] = useState('')

  function add(id: string) {
    void useLibrary.getState().addToPlaylist(id, track).then((added) => {
      toast(added ? `Added to playlist` : 'Already in that playlist')
      onClose()
    })
  }

  function createAndAdd() {
    const name = newName.trim()
    if (!name) return
    const p = useLibrary.getState().createPlaylist(name)
    void useLibrary.getState().addToPlaylist(p.id, track).then(() => {
      toast(`Added to “${p.name}”`)
      onClose()
    })
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center" role="dialog" aria-modal="true" aria-label="Add to playlist">
      <div className="absolute inset-0" onClick={onClose} aria-hidden />
      <div className="relative w-full max-w-sm rounded-2xl bg-surface-overlay p-5 shadow-2xl ring-1 ring-white/10">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-bold text-zinc-100">Add to playlist</h3>
          <button onClick={onClose} aria-label="Close" className="rounded-full p-1 text-zinc-500 hover:text-zinc-200">
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mb-4 truncate rounded-lg bg-white/5 px-3 py-2 text-xs text-zinc-300">{track.title}</p>
        <div className="mb-4 max-h-52 space-y-1 overflow-y-auto">
          {playlists.length === 0 ? <p className="py-4 text-center text-xs text-zinc-500">No playlists yet — create one below.</p> : null}
          {playlists.map((p) => (
            <button
              key={p.id}
              onClick={() => add(p.id)}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-zinc-200 transition hover:bg-white/5"
            >
              <ListMusic className="h-4 w-4 flex-shrink-0 text-accent" aria-hidden />
              <span className="truncate">{p.name}</span>
              <span className="ml-auto text-xs text-zinc-600">{p.trackIds.length}</span>
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && createAndAdd()}
            placeholder="New playlist name"
            aria-label="New playlist name"
            className="min-w-0 flex-1 rounded-lg bg-black/30 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 ring-1 ring-white/10 focus:outline-none focus:ring-accent/50"
          />
          <button
            onClick={createAndAdd}
            disabled={!newName.trim()}
            aria-label="Create playlist and add track"
            className="flex items-center gap-1 rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-black transition hover:bg-accent-soft disabled:opacity-40"
          >
            <Plus className="h-4 w-4" /> Create
          </button>
        </div>
      </div>
    </div>
  )
}
