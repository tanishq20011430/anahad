/**
 * Quality menu — capability-driven. Only offers choices the current track's
 * source actually supports; shows verifiable format/bitrate, otherwise says
 * the quality is source-controlled/unknown.
 */

import { useEffect, useRef, useState } from 'react'
import { AudioLines, ChevronDown } from 'lucide-react'
import type { QualityPreference } from '../types'
import { useSettings } from '../stores/settings'
import { usePlayer, selectCurrentTrack } from '../stores/player'

const OPTIONS: { id: QualityPreference; label: string }[] = [
  { id: 'auto', label: 'Auto' },
  { id: 'highest', label: 'Highest available' },
  { id: 'data-saver', label: 'Data saver' },
  { id: 'standard', label: 'Standard' },
  { id: 'high', label: 'High' },
  { id: 'lossless', label: 'Lossless' }
]

export function QualityMenu({ compact = false }: { compact?: boolean }) {
  const [open, setOpen] = useState(false)
  const quality = useSettings((s) => s.quality)
  const setQuality = useSettings((s) => s.setQuality)
  const track = usePlayer(selectCurrentTrack)
  const player = usePlayer()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const hasLossless = Boolean(track?.formats.some((f) => f.isLossless))
  const currentLabel = player.currentFormat
    ? `${player.currentFormat.label}${player.currentFormat.approxBitrateKbps ? ` · ≈${player.currentFormat.approxBitrateKbps} kbps` : ''}`
    : track && track.source !== 'internet-archive'
      ? 'Provider-controlled'
      : 'Source default'

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={`Audio quality: ${quality}. Current: ${currentLabel}`}
        aria-expanded={open}
        className={`flex items-center gap-1.5 rounded-full bg-white/5 px-2.5 py-1.5 text-[11px] font-medium text-zinc-300 transition hover:bg-white/10 ${compact ? '' : 'min-w-0 max-w-[180px]'}`}
      >
        <AudioLines className="h-3.5 w-3.5 flex-shrink-0 text-accent" aria-hidden />
        <span className="truncate">{currentLabel}</span>
        <ChevronDown className="h-3 w-3 flex-shrink-0" aria-hidden />
      </button>
      {open ? (
        <div className="absolute bottom-full right-0 z-50 mb-2 w-60 overflow-hidden rounded-xl bg-surface-overlay p-1.5 shadow-2xl ring-1 ring-white/10" role="menu" aria-label="Choose audio quality">
          {OPTIONS.map((opt) => {
            const disabled = opt.id === 'lossless' && !hasLossless
            return (
              <button
                key={opt.id}
                role="menuitemradio"
                aria-checked={quality === opt.id}
                disabled={disabled && quality !== opt.id}
                onClick={() => {
                  setQuality(opt.id)
                  setOpen(false)
                  // Re-pick the format for the current track without losing position when possible
                  if (player.queue.length) void player.retry()
                }}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-xs transition ${
                  quality === opt.id ? 'bg-accent/15 text-accent-soft' : 'text-zinc-300 hover:bg-white/5'
                } ${disabled ? 'cursor-not-allowed opacity-40' : ''}`}
              >
                <span>{opt.label}</span>
                {opt.id === 'lossless' && !hasLossless ? <span className="text-[10px] text-zinc-500">not in this track</span> : null}
                {quality === opt.id ? <span aria-hidden>✓</span> : null}
              </button>
            )
          })}
          <p className="px-3 py-2 text-[10px] leading-relaxed text-zinc-500">
            {hasLossless
              ? 'Lossless (FLAC) available for this track.'
              : 'Bitrates are computed from real file sizes — never invented. Options the source doesn’t provide are disabled.'}
          </p>
        </div>
      ) : null}
    </div>
  )
}
