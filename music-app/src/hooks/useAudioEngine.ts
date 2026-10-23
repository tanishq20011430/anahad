/**
 * AudioEngine — owns the single HTML5 <audio> element for the whole app.
 *
 * Responsibilities:
 * - Bind element events to player-store callbacks (time, duration, ended, error…)
 * - Expose an imperative controller to the store (load/play/pause/seek/volume)
 * - Sync Media Session metadata + system media keys
 * - Clean up all listeners on unmount (no leaked resources between tracks/pages)
 */

import { useEffect, useRef } from 'react'
import { usePlayer } from '../stores/player'
import type { AudioController } from '../stores/player'

export function useAudioEngine(): void {
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    const audio = new Audio()
    audio.preload = 'auto'
    audio.crossOrigin = 'anonymous' // safe for CORS-enabled sources; plain playback unaffected
    audioRef.current = audio

    const store = () => usePlayer.getState()

    const onTime = () => store().onTimeUpdate(audio.currentTime)
    const onMeta = () => store().onDuration(audio.duration)
    const onPlaying = () => store().onPlaying()
    const onWaiting = () => store().onWaiting()
    const onPause = () => store().onPause()
    const onEnded = () => void store().onEnded()
    const onError = () => {
      // Network errors during load: surface through store for fallback logic.
      if (audio.src && audio.error) void store().onError()
    }

    audio.addEventListener('timeupdate', onTime)
    audio.addEventListener('loadedmetadata', onMeta)
    audio.addEventListener('durationchange', onMeta)
    audio.addEventListener('playing', onPlaying)
    audio.addEventListener('waiting', onWaiting)
    audio.addEventListener('pause', onPause)
    audio.addEventListener('ended', onEnded)
    audio.addEventListener('error', onError)

    const controller: AudioController = {
      load(url) {
        // Cancel in-flight decoder work from the previous track.
        audio.pause()
        audio.removeAttribute('src')
        audio.load()
        audio.src = url
        audio.load()
      },
      play: () => audio.play(),
      pause: () => audio.pause(),
      seekTo: (sec) => {
        if (Number.isFinite(sec)) audio.currentTime = Math.max(0, sec)
      },
      setVolume: (v) => {
        audio.volume = v
        audio.muted = false
      },
      setMuted: (m) => {
        audio.muted = m
      },
      setSpeed: (s) => {
        audio.playbackRate = s
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
        audio.removeEventListener('timeupdate', onTime)
        audio.removeEventListener('loadedmetadata', onMeta)
        audio.removeEventListener('durationchange', onMeta)
        audio.removeEventListener('playing', onPlaying)
        audio.removeEventListener('waiting', onWaiting)
        audio.removeEventListener('pause', onPause)
        audio.removeEventListener('ended', onEnded)
        audio.removeEventListener('error', onError)
        audio.pause()
        audio.removeAttribute('src')
        audio.load()
      }
    }

    return () => {
      audio.removeEventListener('timeupdate', onTime)
      audio.removeEventListener('loadedmetadata', onMeta)
      audio.removeEventListener('durationchange', onMeta)
      audio.removeEventListener('playing', onPlaying)
      audio.removeEventListener('waiting', onWaiting)
      audio.removeEventListener('pause', onPause)
      audio.removeEventListener('ended', onEnded)
      audio.removeEventListener('error', onError)
      audio.pause()
      audio.removeAttribute('src')
      audio.load()
    }
  }, [])
}
