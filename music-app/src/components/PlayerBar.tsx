/**
 * Persistent player bar.
 * - Desktop: full transport + seek + volume + quality + queue toggle.
 * - Mobile: compact mini-player; tapping opens the full-screen player.
 * - Embedded sources render honest "provider-controlled" transport.
 */

import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Heart,
  Loader2,
  Maximize2,
  MicVocal,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume1,
  Volume2,
  VolumeX,
  X
} from 'lucide-react'
import { usePlayer, selectCurrentTrack } from '../stores/player'
import { useLibrary } from '../stores/library'
import { formatDuration, clamp } from '../lib/format'
import { sourceChipFor } from '../lib/sourceStatus'
import { QualityMenu } from './QualityMenu'
import { ExpandedPlayer } from './ExpandedPlayer'

export function PlayerBar({ onToggleQueue, queueOpen }: { onToggleQueue: () => void; queueOpen: boolean }) {
  const player = usePlayer()
  const track = usePlayer(selectCurrentTrack)
  const [expanded, setExpanded] = useState(false)
  const [scrub, setScrub] = useState<number | null>(null)

  if (!track) return null

  const isEmbed = track.source === 'youtube' || track.source === 'spotify'
  const duration = player.duration || track.durationSec || 0
  const shownTime = scrub ?? player.currentTime
  const fill = duration > 0 ? clamp((shownTime / duration) * 100, 0, 100) : 0
  const bufferedPct = duration > 0 ? clamp((player.bufferedEnd / duration) * 100, 0, 100) : 0
  const showBufferSpinner = player.isBuffering && !player.isLoading
  const VolIcon = player.muted || player.volume === 0 ? VolumeX : player.volume < 0.5 ? Volume1 : Volume2

  const transport = (
    <div className="flex items-center gap-1.5">
      <button
        onClick={player.toggleShuffle}
        aria-label={`Shuffle ${player.shuffledOrder ? 'on' : 'off'}`}
        aria-pressed={Boolean(player.shuffledOrder)}
        className={`hidden rounded-full p-2 transition sm:block ${player.shuffledOrder ? 'text-accent' : 'text-zinc-500 hover:text-zinc-200'}`}
      >
        <Shuffle className="h-4 w-4" />
      </button>
      <button
        onClick={() => void player.prev()}
        aria-label="Previous track"
        disabled={isEmbed}
        className="rounded-full p-2 text-zinc-300 transition hover:text-white disabled:opacity-30"
      >
        <SkipBack className="h-5 w-5 fill-current" />
      </button>
      <button
        onClick={() => void player.togglePlay()}
        aria-label={player.isPlaying ? 'Pause' : 'Play'}
        className="relative flex h-10 w-10 items-center justify-center rounded-full bg-white text-black transition hover:scale-105 active:scale-95"
      >
        {player.isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : player.isPlaying ? <Pause className="h-5 w-5 fill-current" /> : <Play className="h-5 w-5 translate-x-px fill-current" />}
      </button>
      <button onClick={() => void player.next()} aria-label="Next track" disabled={isEmbed} className="rounded-full p-2 text-zinc-300 transition hover:text-white disabled:opacity-30">
        <SkipForward className="h-5 w-5 fill-current" />
      </button>
      <button
        onClick={player.cycleRepeat}
        aria-label={`Repeat mode: ${player.repeat}`}
        className={`hidden rounded-full p-2 transition sm:block ${player.repeat !== 'off' ? 'text-accent' : 'text-zinc-500 hover:text-zinc-200'}`}
      >
        {player.repeat === 'one' ? <Repeat1 className="h-4 w-4" /> : <Repeat className="h-4 w-4" />}
      </button>
    </div>
  )

  return (
    <>
      {/* ── Mobile mini player ─────────────────────────────── */}
      <div
        className="fixed inset-x-2 z-40 md:hidden"
        style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 60px)' }}
        role="region"
        aria-label="Mini player"
      >
        <div className="overflow-hidden rounded-2xl bg-surface-overlay/95 shadow-2xl ring-1 ring-white/10 backdrop-blur">
          <div className="h-0.5 w-full bg-white/10">
            <div className="h-full bg-accent transition-[width]" style={{ width: `${fill}%` }} />
          </div>
          <div className="flex items-center gap-3 p-2.5">
            <button onClick={() => setExpanded(true)} className="flex min-w-0 flex-1 items-center gap-3 text-left" aria-label={`Open full player — ${track.title} by ${track.artist}`}>
              <img src={track.artwork ?? ''} alt="" className="h-10 w-10 flex-shrink-0 rounded-lg bg-zinc-800 object-cover" />
              <span className="min-w-0">
                <span className="block truncate text-xs font-semibold text-zinc-100">{track.title}</span>
                <span className="block truncate text-[11px] text-zinc-500">{track.artist}</span>
              </span>
            </button>
            <button onClick={() => void player.togglePlay()} aria-label={player.isPlaying ? 'Pause' : 'Play'} className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-white text-black">
              {player.isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : player.isPlaying ? <Pause className="h-4 w-4 fill-current" /> : <Play className="h-4 w-4 translate-x-px fill-current" />}
            </button>
            <button onClick={() => void player.next()} aria-label="Next track" disabled={isEmbed} className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-zinc-300 disabled:opacity-30">
              <SkipForward className="h-4 w-4 fill-current" />
            </button>
          </div>
          {player.error ? <p className="px-3 pb-2 text-[10px] text-amber-400">{player.error}</p> : null}
        </div>
      </div>

      {/* ── Desktop player bar ─────────────────────────────── */}
      <div className="fixed inset-x-0 bottom-0 z-40 hidden border-t border-white/5 bg-surface-raised/90 backdrop-blur md:block" role="region" aria-label="Player">
        {player.error ? (
          <div className="flex items-center justify-center gap-2 bg-amber-500/10 py-1 text-[11px] text-amber-300">
            <span>{player.error}</span>
            <button onClick={() => void player.retry()} className="rounded-full bg-amber-400/20 px-2 py-0.5 font-semibold text-amber-200 hover:bg-amber-400/30">
              Retry
            </button>
            <button onClick={player.reset} aria-label="Dismiss error" className="text-amber-300/60 hover:text-amber-200">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : null}
        <div className="mx-auto grid max-w-screen-2xl grid-cols-[minmax(180px,1fr)_minmax(0,2fr)_minmax(180px,1fr)] items-center gap-4 px-4 py-3">
          {/* Track info */}
          <div className="flex min-w-0 items-center gap-3">
            {track.artwork ? (
              <img src={track.artwork} alt="" className="h-12 w-12 flex-shrink-0 rounded-lg bg-zinc-800 object-cover" />
            ) : (
              <div className="h-12 w-12 flex-shrink-0 rounded-lg bg-zinc-800" />
            )}
            <div className="min-w-0">
              <Link to={`/track/${encodeURIComponent(track.identifier)}/${encodeURIComponent(track.fileName)}`} className="block truncate text-sm font-semibold text-zinc-100 hover:underline">
                {track.title}
              </Link>
              <Link to={`/artist/${encodeURIComponent(track.artist)}`} className="block truncate text-xs text-zinc-500 hover:text-zinc-300 hover:underline">
                {track.artist}
              </Link>
              <p className="truncate text-[10px] text-zinc-600">
                {sourceChipFor(track.source, track.collection)}
                {player.contextLabel ? ` · from ${player.contextLabel}` : ''}
              </p>
            </div>
            <LikeButton />
          </div>

          {/* Transport + seek */}
          <div className="flex flex-col items-center gap-1">
            {transport}
            <div className="flex w-full items-center gap-2">
              <span className="w-10 text-right text-[10px] tabular-nums text-zinc-500">{formatDuration(shownTime)}</span>
              <div className="relative flex-1">
                <input
                  type="range"
                  min={0}
                  max={duration || 1}
                  step={1}
                  value={shownTime}
                  onChange={(e) => setScrub(Number(e.target.value))}
                  onPointerUp={() => {
                    if (scrub !== null) player.seek(scrub)
                    setScrub(null)
                  }}
                  onKeyUp={() => {
                    if (scrub !== null) player.seek(scrub)
                    setScrub(null)
                  }}
                  aria-label="Seek"
                  aria-valuetext={`${formatDuration(shownTime)} of ${formatDuration(duration)}`}
                  disabled={isEmbed}
                  data-buffered={bufferedPct > fill + 0.5 ? '1' : undefined}
                  style={{
                    ['--fill' as string]: `${fill}%`,
                    ['--buffered' as string]: `${Math.max(bufferedPct, fill)}%`
                  }}
                  className="w-full"
                />
                {showBufferSpinner ? (
                  <span className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2" aria-hidden>
                    <Loader2 className="h-3 w-3 animate-spin text-amber-400/80" />
                  </span>
                ) : null}
              </div>
              <span className="w-10 text-[10px] tabular-nums text-zinc-500">{formatDuration(duration)}</span>
              <span className="sr-only" role="status">
                {showBufferSpinner ? 'Buffering' : player.playbackFromCache ? 'Playing from preloaded audio' : ''}
              </span>
            </div>
          </div>

          {/* Right controls */}
          <div className="flex items-center justify-end gap-1.5">
            <QualityMenu />
            <button
              onClick={onToggleQueue}
              aria-label="Toggle queue panel"
              aria-pressed={queueOpen}
              className={`rounded-full p-2 transition ${queueOpen ? 'bg-white/10 text-accent' : 'text-zinc-500 hover:text-zinc-200'}`}
            >
              <MicVocal className="h-4 w-4" />
            </button>
            <button
              onClick={player.toggleMute}
              aria-label={player.muted ? 'Unmute' : 'Mute'}
              className="rounded-full p-2 text-zinc-500 transition hover:text-zinc-200"
            >
              <VolIcon className="h-4 w-4" />
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.02}
              value={player.muted ? 0 : player.volume}
              onChange={(e) => player.setVolume(Number(e.target.value))}
              aria-label="Volume"
              className="hidden w-20 lg:block"
              style={{ ['--fill' as string]: `${(player.muted ? 0 : player.volume) * 100}%` }}
            />
            <button onClick={() => setExpanded(true)} aria-label="Expand player" className="rounded-full p-2 text-zinc-500 transition hover:text-zinc-200">
              <Maximize2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {expanded ? <ExpandedPlayer onClose={() => setExpanded(false)} /> : null}
    </>
  )
}

function LikeButton() {
  const track = usePlayer(selectCurrentTrack)
  const liked = useLibrary((s) => (track ? Boolean(s.likedTracks[track.id]) : false))
  if (!track) return null
  return (
    <button
      onClick={() => useLibrary.getState().toggleLike(track)}
      aria-label={liked ? 'Unlike current track' : 'Like current track'}
      aria-pressed={liked}
      className={`ml-1 flex-shrink-0 rounded-full p-2 transition ${liked ? 'text-accent' : 'text-zinc-500 hover:text-zinc-200'}`}
    >
      <Heart className={`h-4 w-4 ${liked ? 'fill-current' : ''}`} />
    </button>
  )
}
