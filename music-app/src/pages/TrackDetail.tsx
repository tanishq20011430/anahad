/** Track detail: full capability display + actions + related tracks. Provider-aware. */

import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ExternalLink, ListEnd, ListStart, Pause, Play } from 'lucide-react'
import { internetArchiveProvider } from '../lib/archive'
import { openverseProvider } from '../lib/openverse'
import { fetchRelatedTracks } from '../lib/related'
import { TrackRow } from '../components/TrackRow'
import { EmptyState, ErrorState, Spinner, Chip, toast } from '../components/ui'
import { usePlayer, selectCurrentTrack } from '../stores/player'
import { formatDuration, licenseLabel } from '../lib/format'
import { sourceChipFor } from '../lib/sourceStatus'
import { moodById } from '../config/catalog'
import type { Track } from '../types'

export function TrackDetailPage() {
  const { identifier, fileName } = useParams<{ identifier: string; fileName: string }>()

  // Detect source from identifier shape: Openverse ids are uuids.
  const isUuid = Boolean(identifier && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(identifier))

  const q = useQuery({
    queryKey: ['track-detail', isUuid ? 'openverse' : 'ia', identifier],
    queryFn: ({ signal }) => {
      if (isUuid) return openverseProvider.getItemTracks(identifier!, signal)
      return internetArchiveProvider.getItemTracks(identifier!, signal)
    },
    enabled: Boolean(identifier),
    staleTime: 10 * 60 * 1000
  })

  if (!identifier || !fileName) return <EmptyState title="Track not found" />
  if (q.isPending)
    return (
      <div className="flex justify-center py-24">
        <Spinner className="h-8 w-8 text-accent" />
      </div>
    )
  if (q.isError) return <ErrorState message="Track metadata couldn't load." onRetry={() => void q.refetch()} />

  const tracks = q.data
  const track = tracks.find((t) => decodeURIComponent(t.fileName) === decodeURIComponent(fileName)) ?? tracks.find((t) => t.id === decodeURIComponent(fileName)) ?? tracks[0]
  if (!track) return <EmptyState title="Track not found at its source" hint="The file may have been removed upstream." />

  return <TrackDetailBody track={track} tracks={tracks} isAlbumContext={!isUuid} />
}

function TrackDetailBody({ track, tracks, isAlbumContext }: { track: Track; tracks: Track[]; isAlbumContext: boolean }) {
  const player = usePlayer()
  const current = usePlayer(selectCurrentTrack)

  const isCurrent = current?.id === track.id
  const license = licenseLabel(track.licenseUrl, track.collection) ?? track.licenseName ?? null
  const iaItem = track.source === 'internet-archive'

  const related = useQuery({
    queryKey: ['related', track.id],
    queryFn: ({ signal }) => fetchRelatedTracks(track, signal),
    staleTime: 5 * 60 * 1000
  })

  const contextTracks = related.data?.map((r) => r.track) ?? []

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-5 sm:flex-row sm:items-end">
        {track.artwork ? (
          <img
            src={track.artwork}
            alt={`Artwork for ${track.title}`}
            className="h-40 w-40 flex-shrink-0 rounded-2xl bg-zinc-800 object-cover shadow-2xl"
            onError={(e) => ((e.target as HTMLImageElement).style.visibility = 'hidden')}
          />
        ) : (
          <div className="flex h-40 w-40 flex-shrink-0 items-center justify-center rounded-2xl bg-zinc-800 text-3xl font-black text-zinc-600" aria-hidden>
            {track.title.slice(0, 1).toUpperCase()}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">Track · {sourceChipFor(track.source, track.collection)}</p>
          <h1 className="mt-1 break-words text-2xl font-extrabold tracking-tight md:text-3xl">{track.title}</h1>
          <p className="mt-1 text-sm text-zinc-400">
            by{' '}
            <Link to={`/artist/${encodeURIComponent(track.artist)}`} className="hover:text-accent hover:underline">
              {track.artist}
            </Link>
            {iaItem ? (
              <>
                {' · from '}
                <Link to={`/album/${encodeURIComponent(track.identifier)}`} className="hover:text-accent hover:underline">
                  {track.album}
                </Link>
              </>
            ) : track.album && track.album !== track.title ? (
              <> · from {track.album}</>
            ) : null}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {track.durationSec ? <Chip>{formatDuration(track.durationSec)}</Chip> : null}
            {track.year ? <Chip>{track.year}</Chip> : null}
            {license ? <Chip tone="accent">{license}</Chip> : null}
            {track.estimatedMoods.map((m) => (
              <Chip key={m} tone="warn">
                {moodById(m)?.label ?? m} (estimated)
              </Chip>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              onClick={() =>
                isCurrent
                  ? void player.togglePlay()
                  : void player.playTracks([track], 0, track.source === 'openverse' ? 'Openverse' : track.album)
              }
              className="flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 text-sm font-bold text-black transition hover:bg-accent-soft"
            >
              {isCurrent && player.isPlaying ? <Pause className="h-4 w-4 fill-current" /> : <Play className="h-4 w-4 fill-current" />}
              {isCurrent && player.isPlaying ? 'Pause' : 'Play'}
            </button>
            <button
              onClick={() => {
                player.playNext(track)
                toast('Playing next')
              }}
              className="flex items-center gap-2 rounded-full bg-white/5 px-4 py-2.5 text-sm text-zinc-200 ring-1 ring-white/10 hover:bg-white/10"
            >
              <ListStart className="h-4 w-4" /> Play next
            </button>
            <button
              onClick={() => {
                player.addToQueue(track)
                toast('Added to queue')
              }}
              className="flex items-center gap-2 rounded-full bg-white/5 px-4 py-2.5 text-sm text-zinc-200 ring-1 ring-white/10 hover:bg-white/10"
            >
              <ListEnd className="h-4 w-4" /> Add to queue
            </button>
          </div>
        </div>
      </header>

      <section aria-label="Available audio formats" className="rounded-xl bg-surface-raised/50 p-4 ring-1 ring-white/5">
        <h2 className="text-sm font-bold text-zinc-100">Available formats (from source)</h2>
        <p className="mt-1 text-xs text-zinc-500">
          {iaItem
            ? 'Bitrates are computed from the real file sizes — approximate for variable-bitrate files.'
            : 'This source publishes one original file per track; bitrate stays “source-provided” when upstream does not verify it.'}
        </p>
        <div className="mt-3 space-y-1.5">
          {track.formats.map((f) => (
            <div key={f.fileName} className="flex items-center justify-between rounded-lg bg-black/20 px-3 py-2 text-xs">
              <span className="font-medium text-zinc-200">{f.label}</span>
              <span className="text-zinc-500">
                {f.approxBitrateKbps ? `≈${f.approxBitrateKbps} kbps` : 'bitrate not published by source'} · {(f.sizeBytes ?? 0) > 0 ? `${(f.sizeBytes! / 1024 / 1024).toFixed(1)} MB` : ''} {f.isLossless ? '· lossless' : ''}
              </span>
            </div>
          ))}
        </div>
      </section>

      {isAlbumContext && tracks.length > 1 ? (
        <section aria-label="More from this album">
          <h2 className="mb-2 text-sm font-bold text-zinc-100">More from {track.album}</h2>
          <div className="divide-y divide-white/5 rounded-xl bg-surface-raised/50 ring-1 ring-white/5">
            {tracks
              .filter((t) => t.id !== track.id)
              .slice(0, 8)
              .map((t) => (
                <TrackRow key={t.id} track={t} contextTracks={tracks} contextLabel={track.album} showAlbum={false} />
              ))}
          </div>
        </section>
      ) : null}

      <section aria-label="Related tracks">
        <h2 className="mb-2 text-sm font-bold text-zinc-100">Related tracks</h2>
        {related.isPending ? (
          <p className="rounded-xl bg-surface-raised/50 p-4 text-xs text-zinc-500 ring-1 ring-white/5">Looking for related recordings…</p>
        ) : related.isError || !related.data || related.data.length === 0 ? (
          <p className="rounded-xl bg-surface-raised/50 p-4 text-xs text-zinc-500 ring-1 ring-white/5">
            No related tracks found right now — the sources may be busy or out of quota.
          </p>
        ) : (
          <div className="divide-y divide-white/5 rounded-xl bg-surface-raised/50 ring-1 ring-white/5">
            {related.data.map((r) => (
              <div key={r.track.id}>
                <p className="pl-12 pt-1.5 text-[11px] italic text-zinc-500">{r.reason}</p>
                <TrackRow track={r.track} contextTracks={contextTracks} contextLabel="Related" showAlbum={false} />
              </div>
            ))}
          </div>
        )}
      </section>

      <a
        href={track.itemPage}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300"
      >
        <ExternalLink className="h-3.5 w-3.5" /> View and verify this track at its source
      </a>
    </div>
  )
}
