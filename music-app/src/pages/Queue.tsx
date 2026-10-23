/** Full-page queue (mobile-friendly mirror of the side panel). */

import { Trash2 } from 'lucide-react'
import { usePlayer, selectCurrentTrack } from '../stores/player'
import { TrackRow } from '../components/TrackRow'
import { EmptyState } from '../components/ui'

export function QueuePage() {
  const queue = usePlayer((s) => s.queue)
  const currentIndex = usePlayer((s) => s.currentIndex)
  const current = usePlayer(selectCurrentTrack)

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3 pt-2">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Queue</h1>
          <p className="mt-1 text-sm text-zinc-500">{queue.length} track{queue.length === 1 ? '' : 's'} lined up</p>
        </div>
        {queue.length > 1 ? (
          <button
            onClick={() => usePlayer.getState().clearQueue()}
            className="flex items-center gap-1.5 rounded-full bg-white/5 px-4 py-2 text-xs text-zinc-300 ring-1 ring-white/10 transition hover:bg-red-500/10 hover:text-red-300"
          >
            <Trash2 className="h-3.5 w-3.5" /> Clear (keep current)
          </button>
        ) : null}
      </header>

      {queue.length === 0 ? (
        <EmptyState title="Queue is empty" hint="Play an album or playlist, or add tracks with “Add to queue”." />
      ) : (
        <div className="divide-y divide-white/5 rounded-xl bg-surface-raised/50 ring-1 ring-white/5">
          {queue.map((t, i) => (
            <div key={`${t.id}-${i}`} className={i === currentIndex ? 'bg-accent/5' : ''}>
              {i === currentIndex ? <p className="pl-12 pt-1.5 text-[10px] font-bold uppercase tracking-wider text-accent">Now playing</p> : null}
              <TrackRow
                track={t}
                index={i}
                showAlbum={false}
                onRemove={i === currentIndex ? undefined : () => usePlayer.getState().removeFromQueue(i)}
              />
            </div>
          ))}
        </div>
      )}
      {current && queue.length > 1 ? (
        <p className="text-[11px] text-zinc-600">
          {current.title} will be followed by the tracks above. Shuffle and repeat controls live in the player bar.
        </p>
      ) : null}
    </div>
  )
}
