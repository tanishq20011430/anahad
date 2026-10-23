/**
 * AudioEngine — owns the single HTML5 <audio> element for the whole app.
 *
 * Transport decision per load (premium playback, honest fallbacks):
 * 1. MSE streaming (preferred for MP3): appends the prebuffered next-track
 *    slice to a SourceBuffer for instant start, then streams the remainder
 *    of the file over Range requests. Any failure falls back to (2)
 *    automatically, preserving the playhead position.
 * 2. Native <audio src> streaming: the default for every non-MP3 format and
 *    every host without verified CORS/Range.
 *
 * Responsibilities:
 * - Bind element events to player-store callbacks (time, buffered, waiting,
 *   ended, error…)
 * - Expose an imperative controller to the store (load/play/pause/seek/volume)
 * - Sync Media Session metadata + system media keys
 * - Clean up all listeners + MSE resources on unmount / track change
 */

import { useEffect, useRef } from 'react'
import { usePlayer } from '../stores/player'
import type { AudioController, PlaybackRequest } from '../stores/player'
import { MseStream, type MseStartResult } from '../lib/mseStream'
import { ytTransport } from '../lib/ytPlayer'

export function useAudioEngine(): void {
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    const audio = new Audio()
    audio.preload = 'auto'
    // NOTE: deliberately NO crossOrigin. Native <audio> playback never needs
    // CORS (that's the point of "prefer native streaming"), and setting
    // crossOrigin='anonymous' would BREAK playback on hosts that don't
    // reflect our origin (verified: Jamendo storage allowlists public
    // origins only). The MSE pipeline uses fetch() with its own CORS
    // handling and falls back to this native path per host.
    audioRef.current = audio

    let stream: MseStream | null = null

    /** Diagnostics hook (read-only) — used by Settings/support verification. */
    const engineWindow = window as unknown as Record<string, { audio?: () => Record<string, unknown> }>
    engineWindow.__anahadEngine = engineWindow.__anahadEngine ?? {}
    engineWindow.__anahadEngine.audio = () => ({
      error: audio.error ? { code: audio.error.code, message: audio.error.message } : null,
      src: audio.src.slice(0, 90),
      paused: audio.paused,
      currentTime: audio.currentTime,
      readyState: audio.readyState,
      networkState: audio.networkState,
      mseActive: Boolean(stream && stream.active)
    })

    const store = () => usePlayer.getState()

    const onTime = () => {
      store().onTimeUpdate(audio.currentTime)
      // Report how much is buffered for the seek-bar shading.
      store().onBuffered(bufferedEndFor(audio))
    }
    const onMeta = () => store().onDuration(audio.duration)
    const onPlaying = () => store().onPlaying()
    const onCanPlay = () => store().onCanPlay()
    const onWaiting = () => store().onWaiting()
    const onPause = () => store().onPause()
    const onEnded = () => void store().onEnded()
    const onError = () => {
      if (audio.src && audio.error) void store().onError()
    }
    const onProgress = () => store().onBuffered(bufferedEndFor(audio))

    audio.addEventListener('timeupdate', onTime)
    audio.addEventListener('loadedmetadata', onMeta)
    audio.addEventListener('durationchange', onMeta)
    audio.addEventListener('playing', onPlaying)
    audio.addEventListener('canplay', onCanPlay)
    audio.addEventListener('waiting', onWaiting)
    audio.addEventListener('stalled', onWaiting)
    audio.addEventListener('pause', onPause)
    audio.addEventListener('ended', onEnded)
    audio.addEventListener('error', onError)
    audio.addEventListener('progress', onProgress)

    function bufferedEndFor(el: HTMLAudioElement): number {
      const b = el.buffered
      const t = el.currentTime
      let end = 0
      for (let i = 0; i < b.length; i++) {
        if (t >= b.start(i) - 0.5 && t <= b.end(i)) end = Math.max(end, b.end(i))
        else if (b.start(i) <= t) end = Math.max(end, b.end(i))
      }
      return Number.isFinite(end) ? end : 0
    }

    async function nativeLoad(url: string, startAtSec: number): Promise<void> {
      stream?.stop()
      stream = null
      audio.pause()
      audio.removeAttribute('src')
      audio.load()
      audio.src = url
      audio.load()
      if (startAtSec > 0.05) {
        const onMeta2 = () => {
          try {
            audio.currentTime = startAtSec
          } catch {
            /* not seekable yet */
          }
          audio.removeEventListener('loadedmetadata', onMeta2)
        }
        audio.addEventListener('loadedmetadata', onMeta2)
      }
    }

    /* ------------------- YouTube transport event wiring ------------------- */
    let activeTransport: 'audio' | 'yt' = 'audio'
    const unsubYtFrame = ytTransport.onFrame((f) => {
      switch (f.state) {
        case 'playing':
          store().onPlaying()
          if (f.duration > 0) store().onDuration(f.duration)
          store().onTimeUpdate(f.currentTime)
          store().onBuffered(f.loadedFraction * f.duration)
          break
        case 'buffering':
          store().onWaiting()
          if (f.duration > 0) store().onDuration(f.duration)
          store().onBuffered(f.loadedFraction * f.duration)
          break
        case 'paused':
          store().onPause()
          store().onTimeUpdate(f.currentTime)
          break
        case 'ended':
          void store().onEnded()
          break
        default:
          break
      }
    })
    const unsubYtError = ytTransport.onError(() => {
      // Embedding disabled / video gone → honest skip through the normal path.
      void store().onError()
    })

    const controller: AudioController = {
      async load(req: PlaybackRequest) {
        if (req.videoId) {
          // YouTube path — park the audio element, hand over to the official
          // hidden player (promotion of a cued spare happens inside).
          activeTransport = 'yt'
          stream?.stop()
          stream = null
          audio.pause()
          audio.removeAttribute('src')
          audio.load()
          await ytTransport.load(req.videoId)
          return
        }
        // Audio path — make sure the YouTube transport is silent.
        activeTransport = 'audio'
        ytTransport.pause()
        stream?.stop()
        stream = null
        audio.pause()
        audio.removeAttribute('src')
        audio.load()

        // Prefer MSE streaming for MP3 from hosts with verified CORS+Range
        // (the preload layer tracks that per host). Everything else native.
        if (req.mimeType === 'audio/mpeg' && MseStream.supported()) {
          const candidate = new MseStream()
          // Hard guard: MSE setup must resolve within 12s. A hung source
          // (dead host, silent proxy) falls back to native streaming instead
          // of leaving the player in an eternal "Buffering" state.
          let guardTimer: number | undefined
          const guard = new Promise<MseStartResult>((resolve) => {
            guardTimer = window.setTimeout(() => resolve({ streaming: false, stop: () => candidate.stop() }), 12_000)
          })
          const res = await Promise.race([
            candidate.start(audio, req.url, req.seed, (pos) => {
              // Fatal stream error mid-playback → native fallback at position.
              stream = null
              void nativeLoad(req.url, pos).then(() => {
                if (store().isPlaying) audio.play().catch(() => undefined)
              })
            }),
            guard
          ])
          if (res.streaming) {
            window.clearTimeout(guardTimer) // start() won — never fire the guard
            stream = candidate
            return
          }
          candidate.stop()
        }
        await nativeLoad(req.url, 0)
      },
      play: () => (activeTransport === 'yt' ? ytTransport.play() : audio.play()),
      pause: () => (activeTransport === 'yt' ? ytTransport.pause() : audio.pause()),
      seekTo: (sec) => {
        if (!Number.isFinite(sec)) return
        if (activeTransport === 'yt') ytTransport.seekTo(sec)
        else audio.currentTime = Math.max(0, sec)
      },
      setVolume: (v) => {
        if (activeTransport === 'yt') {
          ytTransport.setVolume(v)
        } else {
          audio.volume = v
          audio.muted = false
        }
      },
      setMuted: (m) => {
        if (activeTransport === 'yt') ytTransport.setMuted(m)
        else audio.muted = m
      },
      setSpeed: (s) => {
        if (activeTransport === 'yt') ytTransport.setSpeed(s)
        else audio.playbackRate = s
      }
    }
    store().registerController(controller)

    /* ------------------------------ Media Session ------------------------------ */
    if ('mediaSession' in navigator) {
      const updateSession = () => {
        const s = store()
        const track = s.queue[s.currentIndex]
        if (!track || s.embed) {
          navigator.mediaSession.metadata = null
          return
        }
        navigator.mediaSession.metadata = new MediaMetadata({
          title: track.title,
          artist: track.artist,
          album: track.album,
          artwork: track.artwork ? [{ src: track.artwork, sizes: '512x512', type: 'image/jpeg' }] : []
        })
        navigator.mediaSession.setActionHandler('play', () => void store().togglePlay())
        navigator.mediaSession.setActionHandler('pause', () => void store().togglePlay())
        navigator.mediaSession.setActionHandler('previoustrack', () => void store().prev())
        navigator.mediaSession.setActionHandler('nexttrack', () => void store().next())
      }
      const unsub = usePlayer.subscribe(updateSession)
      return () => {
        unsub()
        unsubYtFrame()
        unsubYtError()
        for (const [name, fn] of listeners()) audio.removeEventListener(name, fn)
        stream?.stop()
        stream = null
        audio.pause()
        audio.removeAttribute('src')
        audio.load()
      }
    }

    function listeners(): [string, EventListenerOrEventListenerObject][] {
      return [
        ['timeupdate', onTime],
        ['loadedmetadata', onMeta],
        ['durationchange', onMeta],
        ['playing', onPlaying],
        ['canplay', onCanPlay],
        ['waiting', onWaiting],
        ['stalled', onWaiting],
        ['pause', onPause],
        ['ended', onEnded],
        ['error', onError],
        ['progress', onProgress]
      ]
    }

    return () => {
      unsubYtFrame()
      unsubYtError()
      for (const [name, fn] of listeners()) audio.removeEventListener(name, fn)
      stream?.stop()
      stream = null
      audio.pause()
      audio.removeAttribute('src')
      audio.load()
    }
  }, [])
}
