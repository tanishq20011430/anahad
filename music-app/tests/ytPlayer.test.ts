import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ytTransport } from '../src/lib/ytPlayer'

/**
 * Fake YT IFrame API — captures constructor opts so tests can fire onReady /
 * onStateChange exactly like the real script does.
 */
interface FakePlayer {
  opts: {
    events?: {
      onReady?: (e: { target: FakePlayer }) => void
      onStateChange?: (e: { target: FakePlayer; data: number }) => void
      onError?: (e: { target: FakePlayer; data: number }) => void
    }
    playerVars?: Record<string, unknown>
  }
  calls: string[]
}

let lastPlayer: FakePlayer | null = null
const players: FakePlayer[] = []

function installFakeYT() {
  const YT = {
    PlayerState: { ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 },
    Player: function (this: unknown, _el: unknown, opts: FakePlayer['opts']) {
      const p: FakePlayer = {
        opts,
        calls: []
      }
      ;(p as unknown as Record<string, unknown>).loadVideoById = (id: string) => p.calls.push(`load:${id}`)
      ;(p as unknown as Record<string, unknown>).cueVideoById = (id: string) => p.calls.push(`cue:${id}`)
      ;(p as unknown as Record<string, unknown>).playVideo = () => p.calls.push('play')
      ;(p as unknown as Record<string, unknown>).pauseVideo = () => p.calls.push('pause')
      ;(p as unknown as Record<string, unknown>).seekTo = (s: number) => p.calls.push(`seek:${s}`)
      ;(p as unknown as Record<string, unknown>).setVolume = (v: number) => p.calls.push(`vol:${v}`)
      ;(p as unknown as Record<string, unknown>).unMute = () => p.calls.push('unmute')
      ;(p as unknown as Record<string, unknown>).mute = () => p.calls.push('mute')
      ;(p as unknown as Record<string, unknown>).setPlaybackRate = (r: number) => p.calls.push(`rate:${r}`)
      ;(p as unknown as Record<string, unknown>).setPlaybackQuality = (q: string) => p.calls.push(`quality:${q}`)
      ;(p as unknown as Record<string, unknown>).getCurrentTime = () => 3.5
      ;(p as unknown as Record<string, unknown>).getDuration = () => 200
      ;(p as unknown as Record<string, unknown>).getVideoLoadedFraction = () => 0.4
      ;(p as unknown as Record<string, unknown>).destroy = () => p.calls.push('destroy')
      players.push(p)
      lastPlayer = p
      // Real API fires onReady asynchronously; sync is fine for the logic tests.
      opts.events?.onReady?.({ target: p })
      return p as unknown as Record<string, unknown>
    } as unknown as { new (el: unknown, opts: FakePlayer['opts']): Record<string, unknown> }
  }
  ;(window as unknown as { YT?: unknown }).YT = YT
}

describe('ytTransport — official-player control logic', () => {
  beforeEach(() => {
    installFakeYT()
    players.length = 0
    lastPlayer = null
    ytTransport.resetForTests()
  })

  it('loads a video into the hidden player via loadVideoById', async () => {
    await ytTransport.load('vid1')
    const active = lastPlayer!
    expect(active.calls).toContain('load:vid1')
    expect(ytTransport.stats().active).toBe(true)
  })

  it('cues the next video in the spare player (preload path)', async () => {
    await ytTransport.load('vid1')
    const ok = await ytTransport.cue('vid2')
    expect(ok).toBe(true)
    expect(ytTransport.stats().cuedNext).toBe('vid2')
    const spare = lastPlayer!
    expect(spare).not.toBe(players[0])
    expect(spare.calls).toContain('cue:vid2')
  })

  it('promotes the cued spare for an instant continue (no re-fetch)', async () => {
    await ytTransport.load('vid1')
    const first = players[0]
    await ytTransport.cue('vid2')
    const spare = players[1]
    await ytTransport.load('vid2') // track ended → store asks for the cued video
    expect(spare.calls).toContain('play') // promoted + played, not re-loaded
    expect(spare.calls.some((c) => c.startsWith('load:vid2'))).toBe(false)
    // old player released after its short grace period
    await vi.waitFor(() => expect(first.calls).toContain('destroy'), { timeout: 2_000 })
    expect(ytTransport.stats().cuedNext).toBeNull()
  })

  it('falls back to loadVideoById when advancing to a non-cued video', async () => {
    await ytTransport.load('vid1')
    await ytTransport.load('other')
    expect(players[0].calls).toContain('load:other')
  })

  it('releaseCue destroys the spare and forgets the id', async () => {
    await ytTransport.load('vid1')
    await ytTransport.cue('vid2')
    ytTransport.releaseCue()
    expect(ytTransport.stats().cuedNext).toBeNull()
  })

  it('maps frames honestly (time, duration, buffered fraction)', async () => {
    const frames: unknown[] = []
    const unsub = ytTransport.onFrame((f) => frames.push(f))
    await ytTransport.load('vid1')
    expect(frames.length).toBeGreaterThan(0)
    const last = frames[frames.length - 1] as { currentTime: number; duration: number; loadedFraction: number }
    expect(last.currentTime).toBe(3.5)
    expect(last.duration).toBe(200)
    expect(last.loadedFraction).toBe(0.4)
    unsub()
  })

  it('surfaces player errors as error events', async () => {
    const codes: number[] = []
    const unsub = ytTransport.onError((c) => codes.push(c))
    await ytTransport.load('vid1')
    const p = players[0]
    p.opts.events?.onError?.({ target: p, data: 150 }) // embedding disabled
    expect(codes).toContain(150)
    expect(ytTransport.stats().state).toBe('error')
    unsub()
  })

  it('requests quality levels but never claims control of delivery', async () => {
    await ytTransport.load('vid1')
    ytTransport.setRequestedQuality('small')
    expect(players[0].calls).toContain('quality:small')
    ytTransport.setRequestedQuality(null) // auto
  })
})
