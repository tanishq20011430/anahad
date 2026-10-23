/** Full-screen (expanded) player for mobile tap-through and desktop expand. */

import { ChevronDown, ExternalLink, Gauge, Loader2, Pause, Play, Repeat, Repeat1, Shuffle, SkipBack, SkipForward } from 'lucide-react'
import { useState } from 'react'
import { usePlayer, selectCurrentTrack } from '../stores/player'
import { formatDuration, clamp, licenseLabel } from '../lib/format'
import { sourceChipFor } from '../lib/sourceStatus'
import { embedSrc } from '../lib/external'
import { QualityMenu } from './QualityMenu'
import { Chip } from './ui'
import { moodById } from '../config/catalog'
import { useLibrary } from '../stores/library'

const SPEEDS = [0.75, 1, 1.25, 1.5, 2]

export function ExpandedPlayer({ onClose }: { onClose: () => void }) {
  const player = usePlayer()
  const track = usePlayer(selectCurrentTrack)
  const [scrub, setScrub] = useState<number | null>(null)
  const [speedOpen, setSpeedOpen] = useState(false)
  const liked = useLibrary((s) => (track ? Boolean(s.likedTracks[track.id]) : false))

  if (!track) return null
  const isProviderControlled = Boolean(player.embed)
  const isLive = Boolean(track.isLive)
  const duration = player.duration || track.durationSec || 0
  const shownTime = scrub ?? player.currentTime
  const fill = duration > 0 ? clamp((shownTime / duration) * 100, 0, 100) : 0
  const bufferedPct = duration > 0 ? clamp((player.bufferedEnd / duration) * 100, 0, 100) : 0
  const license = licenseLabel(track.licenseUrl, track.collection) ?? track.licenseName ?? null

  return (
    <div className="safe-bottom fixed inset-0 z-[80] flex flex-col bg-gradient-to-b from-surface-raised via-surface to-black animate-slide-up" role="dialog" aria-modal="true" aria-label={`Now playing: ${track.title}`}>
      <div className="safe-top flex items-center justify-between px-4 py-3">
        <button onClick={onClose} aria-label="Close full player" className="rounded-full p-2 text-zinc-400 hover:text-white">
          <ChevronDown className="h-6 w-6" />
        </button>
        {player.contextLabel ? <p className="max-w-[50%] truncate text-xs text-zinc-500">from {player.contextLabel}</p> : <span />}
        <QualityMenu compact />
      </div>

      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-5 overflow-y-auto px-6 pb-6">
        <div className="relative aspect-square w-full max-w-[min(70vw,340px)] overflow-hidden rounded-2xl shadow-2xl">
          {track.artwork ? (
            <img src={track.artwork} alt={`Cover art for ${track.album}`} className="h-full w-full object-cover" />
          ) : (
            <div className="h-full w-full bg-zinc-800" />
          )}
          {player.isLoading ? (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50">
              <Loader2 className="h-8 w-8 animate-spin text-accent" />
            </div>
          ) : null}
        </div>

        <div className="w-full max-w-md text-center">
          <h2 className="truncate text-xl font-bold text-zinc-50">{track.title}</h2>
          <span className="text-sm text-zinc-400">{track.artist}</span>
          <div className="mt-2 flex flex-wrap items-center justify-center gap-1.5">
            <Chip>{sourceChipFor(track.source, track.collection)}</Chip>
            {license ? <Chip tone="accent">{license}</Chip> : null}
            {track.year ? <Chip>{track.year}</Chip> : null}
            {track.estimatedMoods.slice(0, 2).map((m) => (
              <Chip key={m} tone="warn">
                {moodById(m)?.label ?? m} (estimated)
              </Chip>
            ))}
            {track.formats[0]?.approxBitrateKbps ? <Chip>≈{track.formats[0].approxBitrateKbps} kbps</Chip> : null}
          </div>
        </div>

        {/* Official provider widget for provider-controlled sources (Mixcloud).
            Their player stays in control — honestly labeled, no extraction. */}
        {player.embed ? (
          <div className="w-full max-w-md overflow-hidden rounded-xl ring-1 ring-white/10">
            <iframe
              title={`Official ${player.embed.source} widget`}
              src={embedSrc(player.embed, false)}
              allow="autoplay; clipboard-write; encrypted-media; picture-in-picture"
              allowFullScreen
              className={player.embed.source === 'spotify' ? 'h-36 w-full' : 'aspect-video w-full'}
            />
            <p className="bg-black/40 px-3 py-2 text-[10px] leading-relaxed text-zinc-500">
              Official {player.embed.source} player — playback, ads and quality are controlled by the provider.
            </p>
          </div>
        ) : null}

        {/* Seek */}
        <div className="flex w-full max-w-md items-center gap-3">
          <span className="w-11 text-right text-[11px] tabular-nums text-zinc-500">{isLive ? 'LIVE' : formatDuration(shownTime)}</span>
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
            disabled={isProviderControlled || isLive || duration <= 0}
            data-buffered={bufferedPct > fill + 0.5 ? '1' : undefined}
            style={{
              ['--fill' as string]: `${fill}%`,
              ['--buffered' as string]: `${Math.max(bufferedPct, fill)}%`
            }}
            className="w-full flex-1"
          />
          <span className="w-11 text-[11px] tabular-nums text-zinc-500">{isLive ? '●' : formatDuration(duration)}</span>
        </div>

        {/* Transport */}
        <div className="flex items-center gap-5">
          <button onClick={player.toggleShuffle} aria-pressed={Boolean(player.shuffledOrder)} aria-label="Shuffle" className={`p-2 ${player.shuffledOrder ? 'text-accent' : 'text-zinc-500'}`}>
            <Shuffle className="h-5 w-5" />
          </button>
          <button onClick={() => void player.prev()} aria-label="Previous" className="p-2 text-zinc-200">
            <SkipBack className="h-7 w-7 fill-current" />
          </button>
          <button
            onClick={() => void player.togglePlay()}
            aria-label={player.isPlaying ? 'Pause' : 'Play'}
            className="flex h-16 w-16 items-center justify-center rounded-full bg-accent text-black shadow-xl transition hover:scale-105 active:scale-95"
          >
            {player.isLoading ? <Loader2 className="h-7 w-7 animate-spin" /> : player.isPlaying ? <Pause className="h-7 w-7 fill-current" /> : <Play className="h-7 w-7 translate-x-0.5 fill-current" />}
          </button>
          <button onClick={() => void player.next()} aria-label="Next" className="p-2 text-zinc-200">
            <SkipForward className="h-7 w-7 fill-current" />
          </button>
          <button onClick={player.cycleRepeat} aria-label={`Repeat: ${player.repeat}`} className={`p-2 ${player.repeat !== 'off' ? 'text-accent' : 'text-zinc-500'}`}>
            {player.repeat === 'one' ? <Repeat1 className="h-5 w-5" /> : <Repeat className="h-5 w-5" />}
          </button>
        </div>

        {/* Speed + like + source link */}
        <div className="relative flex items-center gap-3">
          <button
            onClick={() => setSpeedOpen((o) => !o)}
            aria-label={`Playback speed ${player.speed}x`}
            className="flex items-center gap-1.5 rounded-full bg-white/5 px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/10 disabled:opacity-30"
            disabled={isProviderControlled || isLive}
          >
            <Gauge className="h-3.5 w-3.5" /> {player.speed}×
          </button>
          {speedOpen ? (
            <div className="absolute bottom-full left-1/2 z-10 mb-2 flex -translate-x-1/2 gap-1 rounded-xl bg-surface-overlay p-1 ring-1 ring-white/10">
              {SPEEDS.map((s) => (
                <button
                  key={s}
                  onClick={() => {
                    player.setSpeed(s)
                    setSpeedOpen(false)
                  }}
                  className={`rounded-lg px-2.5 py-1.5 text-xs ${player.speed === s ? 'bg-accent/20 text-accent-soft' : 'text-zinc-300 hover:bg-white/5'}`}
                >
                  {s}×
                </button>
              ))}
            </div>
          ) : null}
          <button
            onClick={() => track && useLibrary.getState().toggleLike(track)}
            aria-pressed={liked}
            aria-label={liked ? 'Unlike' : 'Like'}
            className={`rounded-full px-3 py-1.5 text-xs ${liked ? 'text-accent' : 'text-zinc-300 hover:bg-white/10'}`}
          >
            {liked ? '♥ Liked' : '♡ Like'}
          </button>
          <a
            href={track.itemPage}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 rounded-full bg-white/5 px-3 py-1.5 text-xs text-zinc-400 transition hover:text-white"
          >
            <ExternalLink className="h-3.5 w-3.5" /> Source
          </a>
        </div>
        {player.error ? <p className="text-xs text-amber-400">{player.error}</p> : null}
      </div>
    </div>
  )
}
