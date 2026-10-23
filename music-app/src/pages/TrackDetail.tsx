/** Track detail: full capability display + actions + related tracks. Provider-aware. */

import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ExternalLink, ListEnd, ListStart, Pause, Play } from 'lucide-react'
import { providerById } from '../lib/searchService'
import { fetchRelatedTracks } from '../lib/related'
import { TrackRow } from '../components/TrackRow'
import { EmptyState, ErrorState, Spinner, Chip, toast } from '../components/ui'
import { usePlayer, selectCurrentTrack } from '../stores/player'
import { useLibrary } from '../stores/library'
import { formatDuration, licenseLabel } from '../lib/format'
import { sourceChipFor } from '../lib/sourceStatus'
import { moodById } from '../config/catalog'
import type { SourceId, Track } from '../types'

/** Deep-link lookup: local stores first (instant + offline), then the source. */
function useTrackLookup(source: SourceId | undefined, identifier: string | undefined) {
  return useQuery({
    queryKey: ['track-detail', source, identifier],
    queryFn: async ({ signal }): Promise<Track | null> => {
      if (!source || !identifier) return null
      const player = usePlayer.getState()
      const lib = useLibrary.getState()
      const local =
        player.queue.find((t) => t.source === source && t.identifier === identifier) ??
        lib.likedTracks[`${source}:${identifier}`] ??
        lib.history.find((h) => h.track.source === source && h.track.identifier === identifier)?.track ??
        null
      if (local) return local
      const provider = providerById(source)
      if (!provider) return null
      // Deep links carry references only — resolve a full snapshot from the source.
      const reference: Track = {
        id: `${source}:${identifier}`,
        source,
        identifier,
        fileName: '',
        title: '',
        artist: '',
        album: '',
        artwork: null,
        durationSec: null,
        formats: [],
        embed: null,
        licenseUrl: null,
        language: null,
        genres: [],
        estimatedMoods: [],
        year: null,
        itemPage: '',
        collection: null
      }
      const resolved = provider.resolveTrack
        ? await provider.resolveTrack(reference, signal)
        : null
      return resolved && (resolved.title || resolved.formats.length > 0) ? resolved : null
    },
    enabled: Boolean(source && identifier),
    staleTime: 10 * 60 * 1000,
    retry: 0
  })
}

export function TrackDetailPage() {
  const { source, identifier } = useParams<{ source: SourceId; identifier: string }>()
  const q = useTrackLookup(source, identifier)

  if (!source || !identifier) return <EmptyState title="Track not found" />
  if (q.isPending)
    return (
      <div className="flex justify-center py-24">
        <Spinner className="h-8 w-8 text-accent" />
      </div>
    )
  if (q.isError || !q.data) {
    return (
      <ErrorState
        message="Track metadata couldn't load — it may have been removed at its source."
        onRetry={() => void q.refetch()}
      />
    )
  }

  return <TrackDetailBody track={q.data} />
}

function TrackDetailBody({ track }: { track: Track }) {
  const player = usePlayer()
  const current = usePlayer(selectCurrentTrack)

  const isCurrent = current?.id === track.id
  const isEmbedSource = Boolean(track.embed?.kind === 'mixcloud')
  const license = licenseLabel(track.licenseUrl, track.collection) ?? track.licenseName ?? null

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
          <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">
            {track.isLive ? 'Live stream' : 'Track'} · {sourceChipFor(track.source, track.collection)}
          </p>
          <h1 className="mt-1 break-words text-2xl font-extrabold tracking-tight md:text-3xl">{track.title}</h1>
          <p className="mt-1 text-sm text-zinc-400">by {track.artist}</p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {track.isLive ? <Chip tone="warn">Live — no seeking</Chip> : null}
            {!track.isLive && track.durationSec ? <Chip>{formatDuration(track.durationSec)}</Chip> : null}
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
                isCurrent ? void player.togglePlay() : void player.playTracks([track], 0, sourceChipFor(track.source, track.collection))
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

      {/* Capability-honest transport info per source. */}
      <section aria-label="Playback details" className="rounded-xl bg-surface-raised/50 p-4 ring-1 ring-white/5">
        <h2 className="text-sm font-bold text-zinc-100">Playback details (from source)</h2>
        <p className="mt-1 text-xs leading-relaxed text-zinc-500">
          {track.source === 'youtube'
            ? 'Plays through the official YouTube player embedded offscreen. Quality requests are hints — YouTube’s adaptive streaming decides the delivery. No streams are extracted.'
            : track.source === 'mixcloud'
              ? 'Plays through the official Mixcloud widget (provider-controlled transport) because Mixcloud does not expose direct audio URLs.'
              : track.isLive
                ? 'Live stream — starts directly from the broadcaster. No duration, no seeking; the quality shown is what the station broadcasts.'
                : 'This source publishes its real audio metadata below; bitrate stays “source-provided” when upstream does not verify it.'}
        </p>
        {track.formats.length > 0 ? (
          <div className="mt-3 space-y-1.5">
            {track.formats.map((f) => (
              <div key={f.fileName} className="flex items-center justify-between rounded-lg bg-black/20 px-3 py-2 text-xs">
                <span className="font-medium text-zinc-200">{f.label}</span>
                <span className="text-zinc-500">
                  {f.approxBitrateKbps ? `${f.approxBitrateKbps} kbps (as published)` : 'bitrate not published by source'}{' '}
                  {(f.sizeBytes ?? 0) > 0 ? `· ${(f.sizeBytes! / 1024 / 1024).toFixed(1)} MB` : ''} {f.isLossless ? '· lossless' : ''}
                </span>
              </div>
            ))}
          </div>
        ) : null}
        {isEmbedSource ? (
          <p className="mt-3 rounded-lg bg-black/20 px-3 py-2 text-[11px] text-zinc-500">
            Auto-advance can't detect when an official widget ends — use next/previous to keep listening after a show.
          </p>
        ) : null}
      </section>

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
