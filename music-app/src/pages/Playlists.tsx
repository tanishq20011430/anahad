/** Playlists: create, rename, delete, export, import. All local. */

import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ListMusic, Pencil, Play, Plus, Trash2, Upload, Download } from 'lucide-react'
import { useLibrary } from '../stores/library'
import { EmptyState, toast } from '../components/ui'
import { usePlayer } from '../stores/player'
import { resolveTrackFormats } from '../lib/resolve'

export function PlaylistsPage() {
  const playlists = useLibrary((s) => s.playlists)
  const [name, setName] = useState('')
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  function create() {
    if (!name.trim()) return
    useLibrary.getState().createPlaylist(name)
    setName('')
    toast('Playlist created')
  }

  function importFile(file: File) {
    const reader = new FileReader()
    reader.onload = () => {
      const result = useLibrary.getState().importPlaylist(String(reader.result))
      toast(result.message, result.ok ? 'info' : 'error')
    }
    reader.readAsText(file)
  }

  async function playAll(playlistId: string) {
    const p = useLibrary.getState().playlists.find((x) => x.id === playlistId)
    if (!p || p.tracks.length === 0) return
    // Re-resolve formats for imported/reference tracks before playing.
    const resolved = await Promise.all(
      p.tracks.map(async (t) => (t.formats.length === 0 && !t.embed ? await resolveTrackFormats(t) : t))
    )
    void usePlayer.getState().playTracks(resolved, 0, p.name)
  }

  return (
    <div className="space-y-6">
      <header className="pt-2">
        <h1 className="text-2xl font-extrabold tracking-tight">Playlists</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Stored in this browser only (IndexedDB). Export to move them elsewhere — importing brings back track references
          that re-resolve from their source (YouTube, Audius, radio, Openverse, Mixcloud).
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && create()}
          placeholder="New playlist name"
          aria-label="New playlist name"
          className="min-w-0 flex-1 rounded-lg bg-surface-raised px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 ring-1 ring-white/10 focus:outline-none focus:ring-accent/50 sm:max-w-xs"
        />
        <button onClick={create} disabled={!name.trim()} className="flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-bold text-black transition hover:bg-accent-soft disabled:opacity-40">
          <Plus className="h-4 w-4" /> Create
        </button>
        <button
          onClick={() => fileRef.current?.click()}
          className="flex items-center gap-1.5 rounded-lg bg-white/5 px-4 py-2 text-sm text-zinc-300 ring-1 ring-white/10 transition hover:bg-white/10"
        >
          <Upload className="h-4 w-4" /> Import
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          className="hidden"
          aria-label="Import playlist JSON"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) importFile(f)
            e.target.value = ''
          }}
        />
      </div>

      {playlists.length === 0 ? (
        <EmptyState icon={<ListMusic className="h-10 w-10" />} title="No playlists yet" hint="Create one above, or use “Add to playlist” on any track." />
      ) : (
        <ul className="space-y-2">
          {playlists.map((p) => (
            <li key={p.id} className="group flex items-center gap-3 rounded-xl bg-surface-raised/60 p-3 ring-1 ring-white/5 transition hover:bg-surface-overlay">
              <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-accent/30 to-purple-800/30">
                <ListMusic className="h-5 w-5 text-accent-soft" aria-hidden />
              </div>
              {renamingId === p.id ? (
                <input
                  autoFocus
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onBlur={() => {
                    useLibrary.getState().renamePlaylist(p.id, renameValue)
                    setRenamingId(null)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      useLibrary.getState().renamePlaylist(p.id, renameValue)
                      setRenamingId(null)
                    }
                  }}
                  aria-label="Rename playlist"
                  className="min-w-0 flex-1 rounded bg-black/30 px-2 py-1 text-sm ring-1 ring-accent/50 focus:outline-none"
                />
              ) : (
                <Link to={`/playlist/${p.id}`} className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-zinc-100">{p.name}</p>
                  <p className="text-xs text-zinc-500">{p.trackIds.length} track{p.trackIds.length === 1 ? '' : 's'} · updated {new Date(p.updatedAt).toLocaleDateString()}</p>
                </Link>
              )}
              <div className="flex flex-shrink-0 items-center gap-0.5">
                <IconBtn label={`Play ${p.name}`} onClick={() => void playAll(p.id)} disabled={p.tracks.length === 0}>
                  <Play className="h-4 w-4 fill-current" />
                </IconBtn>
                <IconBtn
                  label={`Rename ${p.name}`}
                  onClick={() => {
                    setRenamingId(p.id)
                    setRenameValue(p.name)
                  }}
                >
                  <Pencil className="h-4 w-4" />
                </IconBtn>
                <IconBtn label={`Export ${p.name}`} onClick={() => useLibrary.getState().exportPlaylist(p.id)}>
                  <Download className="h-4 w-4" />
                </IconBtn>
                <IconBtn
                  label={`Delete ${p.name}`}
                  danger
                  onClick={() => {
                    void useLibrary.getState().deletePlaylist(p.id)
                    toast('Playlist deleted')
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </IconBtn>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function IconBtn({ label, onClick, danger, disabled, children }: { label: string; onClick: () => void; danger?: boolean; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      disabled={disabled}
      className={`rounded-full p-2 transition disabled:opacity-30 ${danger ? 'text-zinc-500 hover:bg-red-500/10 hover:text-red-300' : 'text-zinc-500 hover:bg-white/5 hover:text-zinc-100'}`}
    >
      {children}
    </button>
  )
}
