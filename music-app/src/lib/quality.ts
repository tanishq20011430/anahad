/**
 * Quality picking — choose the best playable format for a quality preference,
 * given what the browser actually supports. Never invents bitrates — only
 * chooses among the formats the source truly provides.
 */

import type { AudioFormat, QualityPreference, Track } from '../types'

export function pickFormat(
  track: Track,
  quality: QualityPreference,
  canPlay: (type: string) => boolean
): AudioFormat | null {
  const playable = track.formats.filter((f) => canPlay(f.mimeType) || canPlay(f.url))
  if (playable.length === 0) return null
  const withBitrate = playable.filter((f) => f.approxBitrateKbps !== null)
  const sortedByBitrate = [...(withBitrate.length ? withBitrate : playable)].sort(
    (a, b) => (a.approxBitrateKbps ?? 0) - (b.approxBitrateKbps ?? 0)
  )

  switch (quality) {
    case 'lossless': {
      const flac = playable.find((f) => f.isLossless)
      if (flac) return flac
      return null // genuine lossless not available — caller decides fallback
    }
    case 'highest': {
      const flac = playable.find((f) => f.isLossless)
      if (flac) return flac
      return sortedByBitrate[sortedByBitrate.length - 1] ?? playable[0]
    }
    case 'data-saver':
      return sortedByBitrate[0] ?? playable[0]
    case 'standard': {
      const cands = sortedByBitrate.filter((f) => (f.approxBitrateKbps ?? Infinity) <= 128)
      return (cands[cands.length - 1] ?? sortedByBitrate[0]) ?? playable[0]
    }
    case 'high': {
      const cands = sortedByBitrate.filter((f) => (f.approxBitrateKbps ?? 0) >= 192)
      return (cands[0] ?? sortedByBitrate[sortedByBitrate.length - 1]) ?? playable[0]
    }
    case 'auto':
    default: {
      // Balanced default: best MP3 up to ~192kbps, else best available.
      const mp3s = sortedByBitrate.filter((f) => !f.isLossless && (f.approxBitrateKbps ?? 0) <= 192)
      if (mp3s.length) return mp3s[mp3s.length - 1]
      return sortedByBitrate[sortedByBitrate.length - 1] ?? playable[0]
    }
  }
}

/**
 * YouTube quality mapping — REQUESTED quality only. YouTube's adaptive
 * streaming decides the actual delivery; the UI labels this honestly.
 */
export function ytQualityFor(quality: QualityPreference): string | null {
  switch (quality) {
    case 'data-saver':
      return 'small'
    case 'standard':
      return 'medium'
    case 'high':
    case 'highest':
      return 'hd720'
    case 'lossless':
      return 'hd1080'
    default:
      return null // auto — YouTube decides
  }
}
