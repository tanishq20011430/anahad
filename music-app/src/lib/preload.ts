/**
 * Next-track preload orchestrator.
 *
 * Reduces the gap between songs without downloading whole playlists:
 * 1. Metadata phase — resolves the upcoming track's playable formats early
 *    (cheap JSON, cached by the providers) as soon as a track starts, and at
 *    ~60% of the current track as a re-check.
 * 2. Audio phase — when the cache is enabled and the host supports Range +
 *    CORS (verified per-host, never assumed), fetches a small leading slice
 *    (default 256 KB) of the chosen next format into the in-memory
 *    AudioBlobCache. Playback then starts from RAM and streams the rest.
 *
 * Cancellation policy: every queue/index/shuffle/quality change aborts the
 * in-flight prebuffer and re-plans; the finished track's slice is released
 * when it ends (except repeat-one), and the cache keeps only {current, next}.
 * Nothing here ever persists to disk.
 */

import type { Track } from '../types'
import { usePlayer } from '../stores/player'
import { useSettings } from '../stores/settings'
import { audioCache } from './audioCache'
import { resolveTrackFormats } from './resolve'
import { pickFormat } from './archive'

const PRIME_BYTES = 256 * 1024
const PROGRESS_TRIGGER = 0.6
const DEBOUNCE_MS = 600
const PROGRESS_THROTTLE_MS = 5_000

export interface PreloadInfo {
  nextTrackId: string | null
  nextUrl: string | null
  state: 'idle' | 'priming' | 'primed' | 'skipped'
  reason?: string
}

const canPlayType = (type: string): boolean => {
  if (typeof Audio === 'undefined') return false
  return new Audio().canPlayType(type) !== ''
}

class PreloadOrchestrator {
  private timer: ReturnType<typeof setTimeout> | null = null
  private lastProgressPlan = 0
  private lastNextKey: string | null = null
  private generation = 0

  private info: PreloadInfo = { nextTrackId: null, nextUrl: null, state: 'idle' }
  private listeners = new Set<() => void>()

  /** Compute the track that plays next given the current queue semantics. */
  private nextTrack(): Track | null {
    const s = usePlayer.getState()
    if (s.queue.length === 0) return null
    if (s.repeat === 'one') return null // current track loops; nothing to preload
    if (s.shuffledOrder) {
      const p = s.shufflePointer + 1
      if (p < s.shuffledOrder.length) return s.queue[s.shuffledOrder[p]] ?? null
      return s.repeat === 'all' ? (s.queue[s.shuffledOrder[0]] ?? null) : null
    }
    const i = s.currentIndex + 1
    if (i < s.queue.length) return s.queue[i] ?? null
    return s.repeat === 'all' ? (s.queue[0] ?? null) : null
  }

  private currentUrl(): string | null {
    return usePlayer.getState().currentFormat?.url ?? null
  }

  /** Plan (debounced): resolve next track, prime its audio, enforce cache policy. */
  plan(immediate = false): void {
    if (this.timer) clearTimeout(this.timer)
    if (immediate) {
      void this.execute()
      return
    }
    this.timer = setTimeout(() => {
      this.timer = null
      void this.execute()
    }, DEBOUNCE_MS)
  }

  /** Awaiting variant used by diagnostics/tests — runs one full plan now. */
  async planNow(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    await this.execute()
  }

  private async execute(): Promise<void> {
    const gen = ++this.generation
    const settings = useSettings.getState()
    const currentUrl = this.currentUrl()
    const next = this.nextTrack()

    // Cache policy: keep only what matters — current slice + (soon) next slice.
    const keep = new Set<string>()
    if (currentUrl) keep.add(currentUrl)
    audioCache.releaseExcept(keep)

    if (!next) {
      this.setInfo({ nextTrackId: null, nextUrl: null, state: 'idle' })
      return
    }

    const nextKey = `${next.id}:${settings.quality}`
    if (!settings.preloadEnabled) {
      this.setInfo({ nextTrackId: next.id, nextUrl: null, state: 'skipped', reason: 'Preloading disabled in Settings' })
      this.lastNextKey = nextKey
      return
    }

    if (nextKey !== this.lastNextKey) {
      // Phase 1 — metadata (formats) for the upcoming track.
      const resolved = await resolveTrackFormats(next)
      if (gen !== this.generation) return // superseded
      this.lastNextKey = nextKey
      if (resolved.formats.length === 0) {
        this.setInfo({ nextTrackId: next.id, nextUrl: null, state: 'skipped', reason: 'Next track has no playable audio' })
        return
      }
      const fmt = pickFormat(resolved, settings.quality, canPlayType) ?? resolved.formats[0]
      if (!fmt || fmt.url === currentUrl) {
        this.setInfo({ nextTrackId: next.id, nextUrl: null, state: 'skipped' })
        return
      }
      this.setInfo({ nextTrackId: next.id, nextUrl: fmt.url, state: 'idle' })
    }

    const targetUrl = this.info.nextUrl
    if (!targetUrl) return

    // Phase 2 — audio prebuffer (bounded Range fetch into memory).
    if (settings.cacheMode === 'off' || !audioCache.canPrime(targetUrl)) {
      this.setInfo({ nextTrackId: next.id, nextUrl: targetUrl, state: 'skipped', reason: 'Source streams directly (no Range/CORS prebuffer)' })
      return
    }
    if (audioCache.has(targetUrl)) {
      this.setInfo({ nextTrackId: next.id, nextUrl: targetUrl, state: 'primed' })
      return
    }
    this.setInfo({ nextTrackId: next.id, nextUrl: targetUrl, state: 'priming' })
    const result = await audioCache.prime(targetUrl, { maxBytes: PRIME_BYTES })
    if (gen !== this.generation) return
    this.setInfo(
      result.ok
        ? { nextTrackId: next.id, nextUrl: targetUrl, state: 'primed' }
        : { nextTrackId: next.id, nextUrl: targetUrl, state: 'skipped', reason: result.reason }
    )
  }

  private setInfo(i: PreloadInfo): void {
    this.info = i
    for (const l of this.listeners) l()
  }

  getInfo(): PreloadInfo {
    return this.info
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  /* --------------------------- triggers (from store) --------------------------- */

  /** Track changed (new track loaded successfully). */
  notifyTrackChanged(): void {
    this.lastNextKey = null
    this.plan()
  }

  /** Queue composition changed — abort in-flight downloads, re-plan. */
  notifyQueueChanged(): void {
    this.generation++
    this.lastNextKey = null
    this.plan()
  }

  /** Playback progress — primes at ~60% of the current track (throttled). */
  notifyProgress(currentTime: number): void {
    const s = usePlayer.getState()
    const dur = s.duration || s.queue[s.currentIndex]?.durationSec || 0
    if (!dur || currentTime < dur * PROGRESS_TRIGGER) return
    const now = Date.now()
    if (now - this.lastProgressPlan < PROGRESS_THROTTLE_MS) return
    this.lastProgressPlan = now
    void this.execute()
  }

  /** Full stop (reset / playback off). */
  cancelAll(): void {
    this.generation++
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    audioCache.cancelAll()
    this.lastNextKey = null
    this.setInfo({ nextTrackId: null, nextUrl: null, state: 'idle' })
  }

  /** Policy hook after a track finishes: release its slice unless looping. */
  onTrackEnded(currentUrl: string | null, repeatOne: boolean): void {
    if (repeatOne || !currentUrl) return
    // The slice has been consumed; free it now instead of waiting for TTL.
    audioCache.release(currentUrl)
  }
}

export const preload = new PreloadOrchestrator()

/** Minimal diagnostics hook for support/verification (read-only). */
if (typeof window !== 'undefined') {
  ;(window as unknown as Record<string, unknown>).__anahadEngine = {
    cacheStats: () => audioCache.stats(),
    preloadInfo: () => preload.getInfo()
  }
}

/** Wire orchestrator triggers to store events — called once from App. */
export function startPreloadEngine(): () => void {
  const unsubPlayer = usePlayer.subscribe((state, prev) => {
    if (state.currentIndex !== prev.currentIndex || state.queue !== prev.queue) {
      preload.notifyQueueChanged()
    }
    if (state.currentTime !== prev.currentTime) {
      preload.notifyProgress(state.currentTime)
    }
  })
  return () => {
    unsubPlayer()
    preload.cancelAll()
  }
}
