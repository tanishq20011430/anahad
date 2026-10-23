/** Listening history: recent plays with completion + clear controls. */

import { History as HistoryIcon } from 'lucide-react'
import { useLibrary } from '../stores/library'
import { useSettings } from '../stores/settings'
import { TrackRow } from '../components/TrackRow'
import { EmptyState, toast } from '../components/ui'

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

export function HistoryPage() {
  const history = useLibrary((s) => s.history)
  const historyEnabled = useSettings((s) => s.historyEnabled)

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3 pt-2">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Listening history</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {historyEnabled
              ? 'Stored locally, feeds your recommendations, never uploaded.'
              : 'History collection is currently OFF — nothing new is recorded.'}
          </p>
        </div>
        {history.length > 0 ? (
          <button
            onClick={() => {
              void useLibrary.getState().clearHistory()
              toast('Listening history cleared')
            }}
            className="rounded-full bg-white/5 px-4 py-2 text-xs font-medium text-zinc-300 ring-1 ring-white/10 transition hover:bg-red-500/10 hover:text-red-300"
          >
            Clear history
          </button>
        ) : null}
      </header>

      {history.length === 0 ? (
        <EmptyState
          icon={<HistoryIcon className="h-10 w-10" />}
          title={historyEnabled ? 'Nothing played yet' : 'History is paused'}
          hint={historyEnabled ? 'Your plays will appear here and shape recommendations.' : 'Turn history back on in Settings to record what you play.'}
        />
      ) : (
        <div className="divide-y divide-white/5 rounded-xl bg-surface-raised/50 ring-1 ring-white/5">
          {history.slice(0, 100).map((ev) => (
            <div key={`${ev.trackId}-${ev.playedAt}`}>
              <p className="pl-12 pt-1.5 text-[11px] text-zinc-600">
                {timeAgo(ev.playedAt)}
                {ev.skipped ? ' · skipped' : ev.completedRatio > 0.85 ? ' · played fully' : ` · heard ${Math.round(ev.completedRatio * 100)}%`}
              </p>
              <TrackRow track={ev.track} contextLabel="History" />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
