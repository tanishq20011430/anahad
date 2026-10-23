/**
 * Player + queue store.
 *
 * Owns playback state and queue semantics; the <audio> element lives in the
 * AudioEngine hook which registers a controller here. State transitions are
 * pure and unit-tested; the engine only executes load/play/pause/seek.
 *
 * Capability honesty: for embedded sources (YouTube/Spotify) the transport
 * shows "provider-controlled" instead of pretending our buttons work.
 */

import { create } from 'zustand'
import type { AudioFormat, ExternalEmbed, RepeatMode, Track } from '../types'
import { pickFormat } from '../lib/archive'
import { resolveTrackFormats } from '../lib/resolve'
import { audioCache } from '../lib/audioCache'
import { preload } from '../lib/preload'
import { useSettings } from './settings'
import { useLibrary } from './library'
import { clamp } from '../lib/format'

export interface PlaybackRequest {
  /** Original network URL (identity for cache/preload policies). */
  url: string
  mimeType: string
  /** Prebuffered leading slice (null when none) — used by the MSE pipeline. */
  seed: Blob | null
}

export interface AudioController {
  load(req: PlaybackRequest): Promise<void>
  play(): Promise<void>
  pause(): void
  seekTo(sec: number): void
  setVolume(v: number): void
  setMuted(m: boolean): void
  setSpeed(s: number): void
}

interface PlayerState {
  queue: Track[]
  currentIndex: number
  shuffledOrder: number[] | null
  shufflePointer: number
  contextLabel: string | null

  isPlaying: boolean
  isLoading: boolean
  isBuffering: boolean
  currentTime: number
  /** End of the buffered range around the playhead (for seek-bar shading). */
  bufferedEnd: number
  /** True when the current track started from a prebuffered slice. */
  playbackFromCache: boolean
  duration: number
  volume: number
  muted: boolean
  speed: number
  repeat: RepeatMode

  currentFormat: AudioFormat | null
  embed: ExternalEmbed | null
  error: string | null
  /** fileNames already tried for the current track (format fallback). */
  triedFormats: string[]
  loadToken: number

  controller: AudioController | null

  /* commands */
  registerController: (c: AudioController) => void
  playTracks: (tracks: Track[], startIndex?: number, contextLabel?: string | null) => Promise<void>
  playNext: (track: Track) => void
  addToQueue: (tracks: Track | Track[]) => void
  removeFromQueue: (index: number) => void
  clearQueue: () => void
  playAt: (index: number) => Promise<void>
  next: (opts?: { auto?: boolean }) => Promise<void>
  prev: () => Promise<void>
  togglePlay: () => Promise<void>
  seek: (sec: number) => void
  setVolume: (v: number) => void
  toggleMute: () => void
  setSpeed: (s: number) => void
  cycleRepeat: () => void
  toggleShuffle: () => void
  setQueuePanelOpen: (open: boolean) => void
  setExpandedOpen: (open: boolean) => void
  retry: () => Promise<void>
  reset: () => void

  /* engine callbacks */
  onTimeUpdate: (t: number) => void
  onBuffered: (end: number) => void
  onDuration: (d: number) => void
  onPlaying: () => void
  onCanPlay: () => void
  onWaiting: () => void
  onPause: () => void
  onEnded: () => Promise<void>
  onError: () => Promise<void>
}

const canPlayType = (type: string): boolean => {
  if (typeof Audio === 'undefined') return false
  const a = new Audio()
  // '' = unsupported; 'maybe'/'probably' = supported
  return a.canPlayType(type) !== ''
}

export const usePlayer = create<PlayerState>((set, get) => {
  /** Core loader: resolves formats, applies quality, loads into audio element. */
  async function loadCurrent() {
    const state = get()
    const track = state.queue[state.currentIndex]
    const token = state.loadToken + 1
    set({ loadToken: token, error: null, triedFormats: [], embed: null, currentFormat: null })

    if (!track) {
      set({ isPlaying: false, isLoading: false, currentTime: 0, duration: 0 })
      return
    }

    const resolved = await resolveTrackFormats(track)
    if (get().loadToken !== token) return // stale load — a newer command superseded it

    // Embedded sources: render official iframe, provider controls playback.
    if (resolved.source === 'youtube' || resolved.source === 'spotify') {
      set({ isPlaying: false, isLoading: false })
      return
    }

    if (resolved.formats.length === 0) {
      set({ error: 'This track has no playable audio at its source.', isLoading: false, isPlaying: false })
      return
    }

    let quality = useSettings.getState().quality
    let fmt = pickFormat(resolved, quality, canPlayType)
    // canPlayType can return '' in some environments (webviews, tests) even
    // for MP3, which browsers universally play. Make an honest attempt with
    // the best MP3 rather than failing outright — the error handler still
    // falls back/skips if the file truly can't play.
    if (!fmt) {
      fmt = resolved.formats.find((f) => f.mimeType === 'audio/mpeg') ?? resolved.formats[0] ?? null
    }
    // Honest fallback: requested lossless but source only has lossy MP3 →
    // fall back to best available instead of failing.
    if (!fmt && quality === 'lossless') {
      quality = 'auto'
      fmt = pickFormat(resolved, quality, canPlayType)
    }
    if (!fmt) {
      set({ error: 'No audio format this browser can play.', isLoading: false, isPlaying: false })
      return
    }

    // Seed from the bounded audio cache when this exact URL was preloaded —
    // playback then starts from RAM via the MediaSource pipeline.
    const cacheOn = useSettings.getState().cacheMode !== 'off'
    const seed = cacheOn && audioCache.has(fmt.url) ? audioCache.peekBlob(fmt.url) : null

    set({
      currentFormat: fmt,
      triedFormats: [fmt.fileName],
      duration: resolved.durationSec ?? 0,
      isLoading: true,
      isBuffering: false,
      bufferedEnd: 0,
      playbackFromCache: Boolean(seed)
    })
    const ctrl = get().controller
    if (!ctrl) {
      set({ isLoading: false })
      return
    }
    await ctrl.load({ url: fmt.url, mimeType: fmt.mimeType, seed })
    if (get().loadToken !== token) return
    ctrl.setVolume(get().muted ? 0 : get().volume)
    ctrl.setSpeed(get().speed)
    try {
      await ctrl.play()
      if (get().loadToken !== token) return
      set({ isPlaying: true })
      preload.notifyTrackChanged()
    } catch {
      // Autoplay policy or transient failure — surface honestly.
      if (get().loadToken !== token) return
      set({ isPlaying: false, isLoading: false, error: 'Playback could not start (tap play to retry).' })
    }
  }

  function rememberPlay(skipped: boolean) {
    const state = get()
    const track = state.queue[state.currentIndex]
    if (!track) return
    const duration = state.duration || track.durationSec || 0
    const ratio = duration > 0 ? clamp(state.currentTime / duration, 0, 1) : 0
    useLibrary.getState().recordPlay(track, ratio, skipped)
    // Session-only signal for the "Session mix" shelf (in-memory, never persisted).
    void import('../lib/related').then((m) => m.recordSessionPlay(track))
  }

  function buildShuffledOrder(queueLen: number, currentIndex: number): number[] {
    const rest = Array.from({ length: queueLen }, (_, i) => i).filter((i) => i !== currentIndex)
    for (let i = rest.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[rest[i], rest[j]] = [rest[j], rest[i]]
    }
    return [currentIndex, ...rest]
  }

  return {
    queue: [],
    currentIndex: 0,
    shuffledOrder: null,
    shufflePointer: 0,
    contextLabel: null,

    isPlaying: false,
    isLoading: false,
    isBuffering: false,
    currentTime: 0,
    bufferedEnd: 0,
    playbackFromCache: false,
    duration: 0,
    volume: 0.9,
    muted: false,
    speed: 1,
    repeat: 'off',

    currentFormat: null,
    embed: null,
    error: null,
    triedFormats: [],
    loadToken: 0,

    controller: null,

    registerController: (c) => set({ controller: c }),

    playTracks: async (tracks, startIndex = 0, contextLabel = null) => {
      const playable = tracks.filter((t) => t.source !== 'internet-archive' || t.formats.length >= 0)
      if (playable.length === 0) return
      const idx = clamp(startIndex, 0, playable.length - 1)
      set((s) => ({
        queue: playable,
        currentIndex: idx,
        contextLabel,
        shuffledOrder: s.shuffledOrder ? buildShuffledOrder(playable.length, idx) : null,
        shufflePointer: 0,
        currentTime: 0,
        duration: playable[idx]?.durationSec ?? 0
      }))
      await loadCurrent()
    },

    playNext: (track) => {
      set((s) => {
        const queue = [...s.queue]
        queue.splice(s.currentIndex + 1, 0, track)
        const shuffledOrder = s.shuffledOrder ? buildShuffledOrder(queue.length, s.currentIndex) : null
        return { queue, shuffledOrder }
      })
    },

    addToQueue: (tracks) => {
      const list = Array.isArray(tracks) ? tracks : [tracks]
      set((s) => {
        const queue = [...s.queue, ...list]
        const shuffledOrder = s.shuffledOrder ? buildShuffledOrder(queue.length, s.currentIndex) : null
        return { queue, shuffledOrder }
      })
    },

    removeFromQueue: (index) => {
      set((s) => {
        if (index === s.currentIndex) return s // use skip controls for current track
        const queue = s.queue.filter((_, i) => i !== index)
        const currentIndex = index < s.currentIndex ? s.currentIndex - 1 : s.currentIndex
        const shuffledOrder = s.shuffledOrder ? buildShuffledOrder(queue.length, currentIndex) : null
        return { queue, currentIndex, shuffledOrder }
      })
    },

    clearQueue: () => {
      const s = get()
      const current = s.queue[s.currentIndex]
      set({
        queue: current ? [current] : [],
        currentIndex: current ? 0 : 0,
        shuffledOrder: null,
        shufflePointer: 0
      })
    },

    playAt: async (index) => {
      const s = get()
      if (index < 0 || index >= s.queue.length) return
      set({ currentIndex: index, currentTime: 0 })
      await loadCurrent()
    },

    next: async (opts) => {
      const auto = opts?.auto ?? false
      const s = get()
      if (s.queue.length === 0) return
      rememberPlay(auto ? false : true)

      if (s.shuffledOrder) {
        const nextPointer = s.shufflePointer + 1
        if (nextPointer < s.shuffledOrder.length) {
          set({ shufflePointer: nextPointer, currentIndex: s.shuffledOrder[nextPointer], currentTime: 0 })
        } else if (s.repeat === 'all') {
          set({ shufflePointer: 0, currentIndex: s.shuffledOrder[0], currentTime: 0 })
        } else {
          set({ isPlaying: false, currentTime: 0 })
          return
        }
      } else {
        const nextIndex = s.currentIndex + 1
        if (nextIndex < s.queue.length) {
          set({ currentIndex: nextIndex, currentTime: 0 })
        } else if (s.repeat === 'all') {
          set({ currentIndex: 0, currentTime: 0 })
        } else {
          set({ isPlaying: false, currentTime: 0 })
          return
        }
      }
      await loadCurrent()
    },

    prev: async () => {
      const s = get()
      if (s.currentTime > 3 || s.queue.length === 0) {
        get().seek(0)
        return
      }
      if (s.shuffledOrder) {
        const prevPointer = Math.max(0, s.shufflePointer - 1)
        set({ shufflePointer: prevPointer, currentIndex: s.shuffledOrder[prevPointer], currentTime: 0 })
      } else {
        const prevIndex = Math.max(0, s.currentIndex - 1)
        set({ currentIndex: prevIndex, currentTime: 0 })
      }
      await loadCurrent()
    },

    togglePlay: async () => {
      const s = get()
      const ctrl = s.controller
      if (!ctrl) return
      if (s.embed) return // provider-controlled
      if (s.isPlaying) {
        ctrl.pause()
        set({ isPlaying: false })
      } else {
        if (s.error && s.queue[s.currentIndex]) {
          await loadCurrent()
          return
        }
        try {
          await ctrl.play()
          set({ isPlaying: true, error: null })
        } catch {
          set({ error: 'Playback could not start (tap play to retry).' })
        }
      }
    },

    seek: (sec) => {
      const s = get()
      const d = s.duration || 0
      const target = clamp(sec, 0, d > 0 ? d - 0.25 : sec)
      s.controller?.seekTo(target)
      set({ currentTime: target })
    },

    setVolume: (v) => {
      const vol = clamp(v, 0, 1)
      get().controller?.setVolume(vol)
      set({ volume: vol, muted: vol === 0 })
    },

    toggleMute: () => {
      const m = !get().muted
      get().controller?.setMuted(m)
      set({ muted: m })
    },

    setSpeed: (s2) => {
      const speed = clamp(s2, 0.5, 2.5)
      get().controller?.setSpeed(speed)
      set({ speed })
    },

    cycleRepeat: () => {
      const order: RepeatMode[] = ['off', 'all', 'one']
      const cur = order.indexOf(get().repeat)
      set({ repeat: order[(cur + 1) % order.length] })
    },

    toggleShuffle: () => {
      set((s) => {
        if (s.shuffledOrder) return { shuffledOrder: null, shufflePointer: 0 }
        return { shuffledOrder: buildShuffledOrder(s.queue.length, s.currentIndex), shufflePointer: 0 }
      })
    },

    setQueuePanelOpen: (open) => {
      // Queue panel visibility is UI-local; kept here for keyboard shortcut wiring.
      void open
    },

    setExpandedOpen: (open) => {
      void open
    },

    retry: async () => {
      await loadCurrent()
    },

    reset: () => {
      get().controller?.pause()
      preload.cancelAll()
      audioCache.clear()
      set({ queue: [], currentIndex: 0, isPlaying: false, currentTime: 0, duration: 0, embed: null, error: null, contextLabel: null })
    },

    onTimeUpdate: (t) => set({ currentTime: t }),
    onBuffered: (end) => {
      if (Number.isFinite(end) && end >= 0) set({ bufferedEnd: end })
    },
    onDuration: (d) => set({ duration: Number.isFinite(d) && d > 0 ? d : get().duration }),
    onPlaying: () => set({ isPlaying: true, isLoading: false, isBuffering: false, error: null }),
    onCanPlay: () => set({ isBuffering: false }),
    onWaiting: () => set({ isBuffering: true }),
    onPause: () => set({ isPlaying: false }),

    onEnded: async () => {
      const s = get()
      rememberPlay(false)
      // Cache policy: the finished track's prebuffered slice is consumed —
      // release it now (unless repeat-one will replay it from RAM).
      preload.onTrackEnded(s.currentFormat?.url ?? null, s.repeat === 'one')
      if (s.repeat === 'one') {
        s.controller?.seekTo(0)
        try {
          await s.controller?.play()
          set({ isPlaying: true, currentTime: 0 })
        } catch {
          set({ error: 'Replay failed — tap play.' })
        }
        return
      }
      if (useSettings.getState().autoplayNext) await get().next({ auto: true })
      else set({ isPlaying: false })
    },
    onError: async () => {
      const s = get()
      const track = s.queue[s.currentIndex]
      if (!track) return
      const token = get().loadToken
      // Format fallback: try the next format we haven't tried.
      const untried = track.formats.filter((f) => !s.triedFormats.includes(f.fileName) && (canPlayType(f.mimeType) || canPlayType(f.url)))
      if (untried.length > 0) {
        const fmt = untried[0]
        set({ currentFormat: fmt, triedFormats: [...s.triedFormats, fmt.fileName], isLoading: true, bufferedEnd: 0 })
        await s.controller?.load({ url: fmt.url, mimeType: fmt.mimeType, seed: null })
        try {
          await s.controller?.play()
          if (get().loadToken === token) set({ isPlaying: true })
        } catch {
          set({ isLoading: false })
        }
        return
      }
      // All formats failed — record honest error and move on automatically.
      set({ error: `Couldn't play “${track.title}”. Skipped to the next available track.`, isLoading: false, isPlaying: false })
      if (useSettings.getState().autoplayNext) await get().next({ auto: true })
    }
  }
})

/** Selectors */
export const selectCurrentTrack = (s: PlayerState): Track | undefined => s.queue[s.currentIndex]
export const selectQueueLength = (s: PlayerState): number => s.queue.length
