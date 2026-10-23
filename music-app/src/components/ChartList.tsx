/** Ranked chart list: rank number + TrackRow, optional release date. */

import type { ChartEntry } from '../lib/charts'
import { TrackRow } from './TrackRow'

export function ChartList({ entries, contextLabel, showRelease = false }: { entries: ChartEntry[]; contextLabel: string; showRelease?: boolean }) {
  const tracks = entries.map((e) => e.track)
  return (
    <ol className="divide-y divide-white/5 rounded-xl bg-surface-raised/50 ring-1 ring-white/5">
      {entries.map((e) => (
        <li key={e.track.id} className="flex items-center">
          <span className="w-8 flex-shrink-0 text-right text-sm font-bold tabular-nums text-zinc-500" aria-label={`Rank ${e.rank}`}>
            {e.rank}
          </span>
          <div className="min-w-0 flex-1">
            <TrackRow track={e.track} contextTracks={tracks} contextLabel={contextLabel} showAlbum={false} />
            {showRelease && e.releaseDate ? (
              <p className="-mt-1.5 pb-1.5 pl-[3.75rem] text-[11px] text-zinc-500">Released {new Date(e.releaseDate).toLocaleDateString()}</p>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  )
}
