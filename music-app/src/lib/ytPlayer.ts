/**
 * YouTube transport — official IFrame Player API wrapper.
 *
 * Architecture:
 * - ONE active hidden player performs playback. The store drives it through
 *   the same AudioController interface used for <audio> (load/play/pause/
 *   seek/volume), so queue, repeat, shuffle and Media Session all work.
 * - A SECOND hidden player (the "spare") is cued with the next track by the
 *   preload orchestrator. cueVideoById makes YouTube start buffering that
 *   video early; when the current track ends, the cued player is promoted
 *   to active and playVideo() continues instantly — the smoothest legal
 *   transition available without extracting streams (which we never do).
 * - Quality is a REQUEST via setPlaybackQuality; YouTube's adaptive
 *   streaming always decides what is actually delivered. The UI says so.
 *
 * Autoplay policy: the first playVideo() happens inside a user-gesture
 * chain; subsequent transitions occur while the player already has audio
 * focus, which YouTube's embed allows.
 */

/* Minimal typings for the IFrame API (no external dependency). */
interface YtPlayer {
  loadVideoById(id: string): void
  cueVideoById(id: string): void
  playVideo(): void
  pauseVideo(): void
  stopVideo(): void
  seekTo(sec: number, allowSeekAhead: boolean): void
  setVolume(v: number): void
  getVolume(): number
  mute(): void
  unMute(): void
  isMuted(): boolean
  setPlaybackRate(r: number): void
  setPlaybackQuality(q: string): void
  getCurrentTime(): number
  getDuration(): number
  getVideoLoadedFraction(): number
  getPlayerState(): number
  destroy(): void
  getIframe(): HTMLIFrameElement
}

interface YtPlayerVars {
  autoplay: 0 | 1
  controls: 0 | 1
  disablekb: 0 | 1
  playsinline: 0 | 1
  rel: 0 | 1
  fs: 0 | 1
  iv_load_policy: 1 | 3
  origin?: string
}

interface YtEvent {
  target: YtPlayer
  data: number
}

interface YtNamespace {
  Player: new (
    el: HTMLElement | string,
    opts: {
      videoId?: string
      host?: string
      playerVars?: YtPlayerVars
      events?: {
        onReady?: (e: YtEvent) => void
        onStateChange?: (e: YtEvent) => void
        onError?: (e: YtEvent) => void
      }
    }
  ) => YtPlayer
  PlayerState: { ENDED: number; PLAYING: number; PAUSED: number; BUFFERING: number; CUED: number }
}

declare global {
  interface Window {
    YT?: YtNamespace
    onYouTubeIframeAPIReady?: () => void
  }
}

export type YtState = 'idle' | 'cued' | 'buffering' | 'playing' | 'paused' | 'ended' | 'error'

export interface YtFrame {
  state: YtState
  currentTime: number
  duration: number
  /** 0..1 — how much of the video YouTube has buffered ahead. */
  loadedFraction: number
}

const SCRIPT_URL = 'https://www.youtube.com/iframe_api'
const STATE_MAP: Record<number, YtState> = {
  [-1]: 'cued',
  0: 'ended',
  1: 'playing',
  2: 'paused',
  3: 'buffering',
  5: 'cued'
}

let apiPromise: Promise<YtNamespace> | null = null

/** Load (once) the official IFrame API script. */
export function loadIframeApi(): Promise<YtNamespace> {
  if (apiPromise) return apiPromise
  apiPromise = new Promise<YtNamespace>((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('No window'))
      return
    }
    if (window.YT?.Player) {
      resolve(window.YT)
      return
    }
    const existing = document.querySelector<HTMLScriptElement>('script[data-anahad-yt]')
    const timer = setTimeout(() => reject(new Error('YouTube IFrame API timed out')), 15_000)
    const done = () => {
      if (window.YT?.Player) {
        clearTimeout(timer)
        resolve(window.YT)
      }
    }
    if (window.onYouTubeIframeAPIReady) {
      const prev = window.onYouTubeIframeAPIReady
      window.onYouTubeIframeAPIReady = () => {
        prev()
        done()
      }
    } else {
      window.onYouTubeIframeAPIReady = done
    }
    if (!existing) {
      const s = document.createElement('script')
      s.src = SCRIPT_URL
      s.async = true
      s.dataset.anahadYt = 'true'
      s.onerror = () => {
        clearTimeout(timer)
        apiPromise = null
        reject(new Error('YouTube IFrame API failed to load'))
      }
      document.head.appendChild(s)
    }
  })
  return apiPromise
}

/** Hidden offscreen host — audio-first usage of the official player. */
function hostContainer(): HTMLElement {
  let host = document.getElementById('anahad-yt-host')
  if (!host) {
    host = document.createElement('div')
    host.id = 'anahad-yt-host'
    host.setAttribute('aria-hidden', 'true')
    host.style.cssText =
      'position:fixed;left:-9999px;top:0;width:240px;height:135px;overflow:hidden;opacity:0.01;pointer-events:none;'
    document.body.appendChild(host)
  }
  return host
}

export class YtTransport {
  private active: YtPlayer | null = null
  private spare: YtPlayer | null = null
  private spareCuedId: string | null = null
  private pendingLoad: string | null = null
  private ticker: ReturnType<typeof setInterval> | null = null
  private requestedQuality: string | null = null

  state: YtState = 'idle'
  private listeners = new Set<(f: YtFrame) => void>()
  private errorListeners = new Set<(code: number) => void>()

  onFrame(fn: (f: YtFrame) => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  onError(fn: (code: number) => void): () => void {
    this.errorListeners.add(fn)
    return () => this.errorListeners.delete(fn)
  }

  private emit() {
    const p = this.active
    const frame: YtFrame = {
      state: this.state,
      currentTime: 0,
      duration: 0,
      loadedFraction: 0
    }
    try {
      if (p) {
        frame.currentTime = p.getCurrentTime() || 0
        frame.duration = p.getDuration() || 0
        frame.loadedFraction = p.getVideoLoadedFraction() || 0
      }
    } catch {
      /* player mid-destroy — zeros are honest */
    }
    for (const l of this.listeners) l(frame)
  }

  private setState(s: YtState) {
    this.state = s
    this.emit()
  }

  private startTicker() {
    if (this.ticker) return
    this.ticker = setInterval(() => {
      if (this.state === 'playing' || this.state === 'buffering') this.emit()
    }, 400)
  }

  private stopTicker() {
    if (this.ticker) {
      clearInterval(this.ticker)
      this.ticker = null
    }
  }

  private async createPlayer(): Promise<YtPlayer> {
    const YT = await loadIframeApi()
    const host = hostContainer()
    const slot = document.createElement('div')
    host.appendChild(slot)
    const playerVars: YtPlayerVars = {
      autoplay: 0,
      controls: 0,
      disablekb: 1,
      playsinline: 1,
      rel: 0,
      fs: 0,
      iv_load_policy: 3,
      origin: typeof location !== 'undefined' ? location.origin : undefined
    }
    // Resolve only after the API reports onReady, so callers (load/cue) can
    // immediately use loadVideoById/cueVideoById. onReady may fire early or
    // late — the microtask deferral keeps the `player` binding safe.
    return new Promise<YtPlayer>((resolveReady, rejectReady) => {
      const timer = setTimeout(() => rejectReady(new Error('YouTube player never became ready')), 20_000)
      const player = new YT.Player(slot, {
        playerVars,
        events: {
          onReady: () => {
            queueMicrotask(() => {
              const pending = this.pendingLoad
              if (pending && this.active === player) {
                this.pendingLoad = null
                this.applyQuality(player)
                player.loadVideoById(pending)
              }
              clearTimeout(timer)
              resolveReady(player)
            })
          },
          onStateChange: (e) => this.handleState(e, player),
          onError: (e) => {
            if (player === this.active) {
              this.setState('error')
              for (const l of this.errorListeners) l(e.data)
            }
          }
        }
      })
      void player
    })
  }

  /** Single-flight player creation (no double iframes under races). */
  private creating: Promise<YtPlayer> | null = null

  private ensureActive(): Promise<YtPlayer> {
    if (this.active) return Promise.resolve(this.active)
    if (!this.creating) {
      this.creating = this.createPlayer()
        .then((p) => {
          this.active = p
          this.creating = null
          return p
        })
        .catch((err) => {
          this.creating = null
          throw err
        })
    }
    return this.creating
  }

  private handleState(e: YtEvent, player: YtPlayer) {
    const s = STATE_MAP[e.data]
    if (s === undefined) return
    if (player === this.spare) {
      // Spare reports CUED → preload confirmed; other states are noise.
      if (s === 'cued') this.emit()
      return
    }
    if (player !== this.active) return
    this.setState(s)
    if (s === 'ended') this.stopTicker()
    else this.startTicker()
  }

  private applyQuality(p: YtPlayer) {
    if (!this.requestedQuality) return
    try {
      p.setPlaybackQuality(this.requestedQuality)
    } catch {
      /* YouTube may ignore the hint — that's allowed and labeled honestly */
    }
  }

  /** Request a quality level (YouTube decides the actual delivery). */
  setRequestedQuality(q: string | null) {
    this.requestedQuality = q
    if (this.active) this.applyQuality(this.active)
  }

  /** Load a video into the active player (or promote the cued spare). */
  async load(videoId: string): Promise<void> {
    // Instant continue: the preload layer already cued exactly this video.
    if (this.spare && this.spareCuedId === videoId) {
      const old = this.active
      this.active = this.spare
      this.spare = null
      this.spareCuedId = null
      this.setState('buffering')
      this.startTicker()
      try {
        this.active.playVideo()
      } catch {
        /* fall through — state events drive the UI either way */
      }
      if (old) {
        const doomed = old
        // Short grace period so the ENDED event dispatch fully unwinds
        // before we tear down the old iframe.
        setTimeout(() => {
          try {
            doomed.destroy()
          } catch {
            /* already gone */
          }
        }, 300)
      }
      return
    }
    if (!this.active) {
      this.pendingLoad = videoId
      const p = await this.ensureActive()
      // If onReady already consumed the pending load, nothing else to do —
      // the microtask handler called loadVideoById for exactly this id.
      if (this.pendingLoad === videoId) {
        this.pendingLoad = null
        this.applyQuality(p)
        p.loadVideoById(videoId)
      }
      this.setState('buffering')
      this.startTicker()
      return
    }
    this.applyQuality(this.active)
    this.active.loadVideoById(videoId)
    this.setState('buffering')
    this.startTicker()
  }

  play(): Promise<void> {
    try {
      this.active?.playVideo()
    } catch {
      /* surfaced via state/error events */
    }
    return Promise.resolve()
  }

  pause(): void {
    try {
      this.active?.pauseVideo()
    } catch {
      /* ignore */
    }
    this.setState('paused')
  }

  seekTo(sec: number): void {
    try {
      this.active?.seekTo(sec, true)
    } catch {
      /* ignore */
    }
  }

  setVolume(v: number): void {
    try {
      this.active?.setVolume(Math.round(v * 100))
      if (v > 0) this.active?.unMute()
    } catch {
      /* ignore */
    }
  }

  setMuted(m: boolean): void {
    try {
      if (m) this.active?.mute()
      else this.active?.unMute()
    } catch {
      /* ignore */
    }
  }

  setSpeed(s: number): void {
    try {
      this.active?.setPlaybackRate(s)
    } catch {
      /* ignore */
    }
  }

  /** Cue the next video in the hidden spare player (preloads + buffers). */
  async cue(videoId: string): Promise<boolean> {
    if (!videoId) return false
    if (this.spareCuedId === videoId) return true
    try {
      if (!this.spare) this.spare = await this.createPlayer()
      this.spare.cueVideoById(videoId)
      this.spareCuedId = videoId
      return true
    } catch {
      return false
    }
  }

  /** Drop the cued spare (queue changed / preloading disabled). */
  releaseCue(): void {
    this.spareCuedId = null
    if (this.spare) {
      const doomed = this.spare
      this.spare = null
      setTimeout(() => {
        try {
          doomed.destroy()
        } catch {
          /* already gone */
        }
      }, 200)
    }
  }

  /** Diagnostics for Settings/support. */
  stats(): { active: boolean; cuedNext: string | null; state: YtState } {
    return { active: Boolean(this.active), cuedNext: this.spareCuedId, state: this.state }
  }

  /** Test isolation hook — drops all player references without touching DOM. */
  resetForTests(): void {
    this.active = null
    this.spare = null
    this.spareCuedId = null
    this.pendingLoad = null
    this.creating = null
    this.state = 'idle'
    this.stopTicker()
  }
}

/** Singleton transport — one active player + one cued spare for the app. */
export const ytTransport = new YtTransport()
