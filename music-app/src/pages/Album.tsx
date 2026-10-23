/** Album detail (archive.org item): artwork, metadata, real tracklist. */

import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ExternalLink, Heart, ListEnd, Pause, Play } from 'lucide-react'
import { internetArchiveProvider } from '../lib/archive'
import { TrackRow } from '../components/TrackRow'
import { EmptyState, ErrorState, Spinner, Chip, toast } from '../components/ui'
import { usePlayer } from '../stores/player'
import { useLibrary } from '../stores/library'
import { licenseLabel, formatDuration } from '../lib/format'

export function AlbumPage() {
  const { identifier } = useParams<{ identifier: string }>()
  const player = usePlayer()
  const isSaved = useLibrary((s) => Boolean(identifier && s.savedAlbums[identifier]))
  const q = useQuery({
    queryKey: ['item-tracks', identifier],
    queryFn: ({ signal }) => internetArchiveProvider.getItemTracks(identifier!, signal),
    enabled: Boolean(identifier),
    staleTime: 10 * 60 * 1000
  })

  if (!identifier) return <EmptyState title="Album not found" />
  if (q.isPending)
    return (
      <div className="flex justify-center py-24">
        <Spinner className="h-8 w-8 text-accent" />
      </div>
    )
  if (q.isError) return <ErrorState message="This album's metadata couldn't load. The archive may be busy." onRetry={() => void q.refetch()} />

  const tracks = q.data
  const first = tracks[0]
  const totalDuration = tracks.reduce((sum, t) => sum + (t.durationSec ?? 0), 0)

  if (!first) {
    return (
      <EmptyState
        title="No playable audio in this item"
        hint="Some archive items are metadata-only or use formats browsers can't play. Try another album."
      />
    )
  }

  const isPlayingThis = player.queue[0]?.identifier === identifier && player.isPlaying

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-5 sm:flex-row sm:items-end">
        <img
          src={first.artwork ?? ''}
          alt={`Cover art for ${first.album}`}
          className="h-44 w-44 flex-shrink-0 rounded-2xl bg-zinc-800 object-cover shadow-2xl"
          onError={(e) => ((e.target as HTMLImageElement).style.visibility = 'hidden')}
        />
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">Album</p>
          <h1 className="mt-1 break-words text-2xl font-extrabold tracking-tight md:text-3xl">{first.album}</h1>
          <Link to={`/artist/${encodeURIComponent(first.artist)}`} className="mt-1 inline-block text-sm text-zinc-400 hover:text-accent hover:underline">
            {first.artist}
          </Link>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Chip>{tracks.length} tracks</Chip>
            {totalDuration > 0 ? <Chip>{formatDuration(totalDuration)}</Chip> : null}
            {first.year ? <Chip>{first.year}</Chip> : null}
            {licenseLabel(first.licenseUrl, first.collection) ? <Chip tone="accent">{licenseLabel(first.licenseUrl, first.collection)}</Chip> : null}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              onClick={() => (isPlayingThis ? void player.togglePlay() : void player.playTracks(tracks, 0, first.album))}
              className="flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 text-sm font-bold text-black transition hover:bg-accent-soft"
              aria-label={isPlayingThis ? 'Pause album' : `Play album ${first.album}`}
            >
              {isPlayingThis ? <Pause className="h-4 w-4 fill-current" /> : <Play className="h-4 w-4 fill-current" />}
              {isPlayingThis ? 'Pause' : 'Play album'}
            </button>
            <button
              onClick={() => {
                player.addToQueue(tracks)
                toast(`Queued ${tracks.length} tracks`)
              }}
              className="flex items-center gap-2 rounded-full bg-white/5 px-4 py-2.5 text-sm font-medium text-zinc-200 ring-1 ring-white/10 transition hover:bg-white/10"
            >
              <ListEnd className="h-4 w-4" /> Queue all
            </button>
            <button
              onClick={() => useLibrary.getState().toggleSaveAlbum({ identifier, title: first.album, creator: first.artist, artwork: first.artwork ?? '', itemPage: first.itemPage, source: first.source })}
              aria-pressed={isSaved}
              className={`rounded-full p-2.5 ring-1 ring-white/10 transition ${isSaved ? 'bg-accent/15 text-accent' : 'bg-white/5 text-zinc-400 hover:text-white'}`}
              aria-label={isSaved ? 'Remove album from library' : 'Save album to library'}
            >
              <Heart className={`h-4 w-4 ${isSaved ? 'fill-current' : ''}`} />
            </button>
            <a
              href={first.itemPage}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 rounded-full bg-white/5 px-4 py-2.5 text-xs text-zinc-400 ring-1 ring-white/10 transition hover:text-white"
            >
              <ExternalLink className="h-3.5 w-3.5" /> Archive.org
            </a>
          </div>
        </div>
      </header>

      <section aria-label="Tracklist" className="divide-y divide-white/5 rounded-xl bg-surface-raised/50 ring-1 ring-white/5">
        {tracks.map((t, i) => (
          <TrackRow key={t.id} track={t} index={i} contextTracks={tracks} contextLabel={first.album} />
        ))}
      </section>

      <p className="text-[11px] leading-relaxed text-zinc-600">
        Audio files stream directly from archive.org. License and reuse terms are defined per item by the uploader —
        verify rights before redistributing. Duration and bitrates shown are parsed from real file metadata.
      </p>
    </div>
  )
}
