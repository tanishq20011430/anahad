/** Artist page: top hits ranked by Apple's popularity data, played via YouTube. */

import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Mic2, Play, Shuffle } from 'lucide-react'
import { fetchArtistHits } from '../lib/artists'
import { TrackRow } from '../components/TrackRow'
import { EmptyState, ErrorState, Skeleton } from '../components/ui'
import { usePlayer } from '../stores/player'

export function ArtistPage() {
  const { name = '' } = useParams()
  const artist = decodeURIComponent(name)
  const q = useQuery({
    queryKey: ['artist-hits', artist.toLowerCase()],
    queryFn: ({ signal }) => fetchArtistHits(artist, signal),
    staleTime: 60 * 60 * 1000,
    retry: 1
  })
  const displayName = q.data?.name ?? artist
  const tracks = q.data?.tracks ?? []
  const contextLabel = `${displayName} · top hits`

  function play(shuffle: boolean) {
    if (tracks.length === 0) return
    const start = shuffle ? Math.floor(Math.random() * tracks.length) : 0
    void usePlayer.getState().playTracks(tracks, start, contextLabel).then(() => {
      if (shuffle !== Boolean(usePlayer.getState().shuffledOrder)) usePlayer.getState().toggleShuffle()
    })
  }

  return (
    <div className="space-y-5">
      <header className="flex items-center gap-4 pt-2">
        <div className="flex h-24 w-24 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-raised ring-1 ring-white/10 md:h-32 md:w-32">
          {q.data?.artwork ? (
            <img src={q.data.artwork} alt="" className="h-full w-full object-cover" />
          ) : (
            <Mic2 className="h-10 w-10 text-zinc-600" aria-hidden />
          )}
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Artist</p>
          <h1 className="truncate text-2xl font-extrabold tracking-tight md:text-4xl">{displayName}</h1>
          <p className="mt-1 text-xs text-zinc-500">
            {tracks.length > 0 ? `${tracks.length} top songs, most popular first` : 'Top songs, most popular first'}
          </p>
        </div>
      </header>

      {q.isPending ? (
        <div className="space-y-2">
          {[...Array(8)].map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : q.isError ? (
        <ErrorState message="Couldn't load this artist's hits right now." onRetry={() => void q.refetch()} />
      ) : tracks.length === 0 ? (
        <EmptyState
          icon={<Mic2 className="h-6 w-6" />}
          title={`No hits found for ${displayName}`}
          hint="Apple's catalog has no songs credited to this exact name. Channel names (like record labels) won't have an artist page."
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => play(false)}
              className="flex items-center gap-1.5 whitespace-nowrap rounded-full bg-accent px-4 py-2 text-sm font-bold text-black transition hover:bg-accent-soft"
            >
              <Play className="h-4 w-4 fill-current" aria-hidden /> Play hits
            </button>
            <button
              onClick={() => play(true)}
              className="flex items-center gap-1.5 whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold text-zinc-200 ring-1 ring-white/15 transition hover:bg-white/5"
            >
              <Shuffle className="h-4 w-4" aria-hidden /> Shuffle
            </button>
          </div>
          <ol className="divide-y divide-white/5 rounded-xl bg-surface-raised/50 ring-1 ring-white/5">
            {tracks.map((t, i) => (
              <li key={t.id} className="flex items-center">
                <span className="w-8 flex-shrink-0 text-right text-sm font-bold tabular-nums text-zinc-500" aria-label={`Rank ${i + 1}`}>
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <TrackRow track={t} contextTracks={tracks} contextLabel={contextLabel} showAlbum={false} />
                </div>
              </li>
            ))}
          </ol>
        </>
      )}

      <p className="pb-4 text-[11px] leading-relaxed text-zinc-600">
        Ranking: Apple's iTunes catalog, ordered by Apple's popularity-weighted relevance. Each song plays through YouTube's
        official player, matched by title and artist when it starts.
      </p>
    </div>
  )
}
