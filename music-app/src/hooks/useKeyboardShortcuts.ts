/**
 * Global keyboard shortcuts (ignored while typing in inputs):
 *  Space / K   play-pause        ← / →   seek ∓5s (Shift: ±10s)
 *  J / L       previous / next   M       mute
 *  ↑ / ↓       volume            S       shuffle
 *  R           repeat mode       Q       queue panel
 */

import { useEffect } from 'react'
import { usePlayer } from '../stores/player'

export function useKeyboardShortcuts(): void {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return
      if (e.metaKey || e.ctrlKey || e.altKey) return

      const s = usePlayer.getState()
      const step = e.shiftKey ? 10 : 5
      switch (e.key) {
        case ' ':
        case 'k':
        case 'K':
          e.preventDefault()
          void s.togglePlay()
          break
        case 'ArrowLeft':
          if (s.queue.length) {
            e.preventDefault()
            s.seek(s.currentTime - step)
          }
          break
        case 'ArrowRight':
          if (s.queue.length) {
            e.preventDefault()
            s.seek(s.currentTime + step)
          }
          break
        case 'j':
        case 'J':
          e.preventDefault()
          void s.prev()
          break
        case 'l':
        case 'L':
          e.preventDefault()
          void s.next()
          break
        case 'm':
        case 'M':
          s.toggleMute()
          break
        case 'ArrowUp':
          e.preventDefault()
          s.setVolume(Math.min(1, s.volume + 0.05))
          break
        case 'ArrowDown':
          e.preventDefault()
          s.setVolume(Math.max(0, s.volume - 0.05))
          break
        case 's':
        case 'S':
          s.toggleShuffle()
          break
        case 'r':
        case 'R':
          s.cycleRepeat()
          break
        default:
          break
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])
}
