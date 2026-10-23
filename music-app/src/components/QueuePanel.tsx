/** Queue drawer: desktop side panel / mobile overlay. */

import { X, Trash2 } from 'lucide-react'
import { usePlayer, selectCurrentTrack } from '../stores/player'
import { TrackRow } from './TrackRow'
import { EmptyState } from './ui'

export function QueuePanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queue = usePlayer((s) => s.queue)
  const currentIndex = usePlayer((s) => s.currentIndex)
  const current = usePlayer(selectCurrentTrack)
  const clearQueue = usePlayer((s) => s.clearQueue)

  return (
    <aside
      className={`safe-top safe-bottom fixed inset-y-0 right-0 z-[70] flex w-full max-w-sm flex-col border-l border-white/5 bg-surface-raised/95 backdrop-blur transition-transform duration-300 lg:static lg:z-auto lg:transition-all ${
        open ? 'translate-x-0' : 'pointer-events-none translate-x-full lg:hidden lg:pointer-events-auto'
      }`}
      aria-label="Playback queue"
      aria-hidden={!open}
    >
      <div className="flex items-center justify-between border-b border-white/5 px-4 py-3.5">
        <h2 className="text-sm font-bold text-zinc-100">
          Queue <span className="ml-1 text-xs font-normal text-zinc-500">{queue.length} track{queue.length === 1 ? '' : 's'}</span>
        </h2>
        <div className="flex items-center gap-1">
          {queue.length > 1 ? (
            <button
              onClick={clearQueue}
              className="flex items-center gap-1 rounded-full px-2.5 py-1.5 text-[11px] text-zinc-500 transition hover:bg-white/5 hover:text-red-300"
              aria-label="Clear queue (keeps current track)"
            >
              <Trash2 className="h-3.5 w-3.5" /> Clear
            </button>
          ) : null}
          <button onClick={onClose} aria-label="Close queue panel" className="rounded-full p-1.5 text-zinc-500 hover:text-zinc-200 lg:hidden">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {queue.length === 0 ? (
          <EmptyState title="Queue is empty" hint="Play an album, playlist, or use “Add to queue” on any track." />
        ) : (
          <>
            {current ? (
              <div className="mb-2">
                <p className="px-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-zinc-600">Now playing</p>
                <TrackRow track={current} contextLabel={null} showAlbum={false} />
              </div>
            ) : null}
            <p className="px-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-zinc-600">Next up</p>
            {queue.map((t, i) =>
              i === currentIndex ? null : (
                <TrackRow
                  key={`${t.id}-${i}`}
                  track={t}
                  index={i}
                  showAlbum={false}
                  onRemove={() => usePlayer.getState().removeFromQueue(i)}
                />
              )
            )}
          </>
        )}
      </div>
    </aside>
  )
}
