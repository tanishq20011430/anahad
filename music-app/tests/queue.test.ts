import { describe, it, expect, beforeEach } from 'vitest'
import { usePlayer } from '../src/stores/player'
import { makeTrack, makeYtTrack } from './helpers'

/** Stub audio controller so store transitions run without a real element. */
function stubController() {
  const calls: string[] = []
  usePlayer.getState().registerController({
    load: (req) => {
      calls.push(`load:${req.url}`)
      return Promise.resolve()
    },
    play: async () => {
      calls.push('play')
    },
    pause: () => calls.push('pause'),
    seekTo: (s) => calls.push(`seek:${s}`),
    setVolume: (v) => calls.push(`vol:${v}`),
    setMuted: () => calls.push('muted'),
    setSpeed: () => calls.push('speed')
  })
  return calls
}

describe('player store — queue behavior', () => {
  beforeEach(() => {
    usePlayer.getState().reset()
    usePlayer.setState({ shuffledOrder: null, repeat: 'off', error: null })
  })

  it('playTracks sets queue, index and context label', async () => {
    stubController()
    const tracks = [makeTrack(0), makeTrack(1), makeTrack(2)]
    await usePlayer.getState().playTracks(tracks, 1, 'Test context')
    const s = usePlayer.getState()
    expect(s.queue).toHaveLength(3)
    expect(s.currentIndex).toBe(1)
    expect(s.contextLabel).toBe('Test context')
    expect(s.currentFormat?.label).toBe('128Kbps MP3')
  })

  it('playNext inserts immediately after current; addToQueue appends', async () => {
    stubController()
    const tracks = [makeTrack(0), makeTrack(1)]
    await usePlayer.getState().playTracks(tracks, 0, null)
    usePlayer.getState().playNext(makeTrack(9))
    expect(usePlayer.getState().queue[1].identifier).toBe('item9')
    usePlayer.getState().addToQueue(makeTrack(8))
    expect(usePlayer.getState().queue[3].identifier).toBe('item8')
  })

  it('removeFromQueue adjusts currentIndex when removing earlier entries', async () => {
    stubController()
    const tracks = [makeTrack(0), makeTrack(1), makeTrack(2)]
    await usePlayer.getState().playTracks(tracks, 2, null)
    usePlayer.getState().removeFromQueue(0)
    const s = usePlayer.getState()
    expect(s.queue).toHaveLength(2)
    expect(s.currentIndex).toBe(1)
    expect(s.queue[s.currentIndex].identifier).toBe('item2')
  })

  it('clearQueue keeps the current track only', async () => {
    stubController()
    await usePlayer.getState().playTracks([makeTrack(0), makeTrack(1), makeTrack(2)], 1, null)
    usePlayer.getState().clearQueue()
    const s = usePlayer.getState()
    expect(s.queue).toHaveLength(1)
    expect(s.queue[0].identifier).toBe('item1')
  })

  it('next() advances and stop at end with repeat off', async () => {
    stubController()
    const { useSettings } = await import('../src/stores/settings')
    useSettings.setState({ artistAutoplay: false })
    await usePlayer.getState().playTracks([makeTrack(0), makeTrack(1)], 0, null)
    await usePlayer.getState().next()
    expect(usePlayer.getState().currentIndex).toBe(1)
    await usePlayer.getState().next()
    expect(usePlayer.getState().currentIndex).toBe(1)
    expect(usePlayer.getState().isPlaying).toBe(false)
  })

  it('repeat all wraps to queue start', async () => {
    stubController()
    usePlayer.setState({ repeat: 'all' })
    await usePlayer.getState().playTracks([makeTrack(0), makeTrack(1)], 1, null)
    await usePlayer.getState().next()
    expect(usePlayer.getState().currentIndex).toBe(0)
  })

  it('repeat one replays via engine (seek 0 + play) without advancing', async () => {
    const calls = stubController()
    usePlayer.setState({ repeat: 'one' })
    await usePlayer.getState().playTracks([makeTrack(0), makeTrack(1)], 0, null)
    calls.length = 0
    await usePlayer.getState().onEnded()
    expect(usePlayer.getState().currentIndex).toBe(0)
    expect(calls.some((c) => c.startsWith('seek:0'))).toBe(true)
  })

  it('shuffle builds an order containing every index and advances through it', async () => {
    stubController()
    const tracks = [0, 1, 2, 3, 4].map((i) => makeTrack(i))
    await usePlayer.getState().playTracks(tracks, 2, null)
    usePlayer.getState().toggleShuffle()
    const s = usePlayer.getState()
    expect(s.shuffledOrder).not.toBeNull()
    expect([...new Set(s.shuffledOrder!)].sort()).toEqual([0, 1, 2, 3, 4])
    expect(s.shuffledOrder![0]).toBe(2) // current track first
    const before = s.currentIndex
    await usePlayer.getState().next()
    expect(usePlayer.getState().currentIndex).not.toBe(before)
    expect(usePlayer.getState().shufflePointer).toBe(1)
  })

  it('toggleShuffle off returns to linear order', async () => {
    stubController()
    await usePlayer.getState().playTracks([makeTrack(0), makeTrack(1)], 0, null)
    usePlayer.getState().toggleShuffle()
    usePlayer.getState().toggleShuffle()
    expect(usePlayer.getState().shuffledOrder).toBeNull()
  })

  it('prev() restarts track when >3s in, otherwise goes back', async () => {
    stubController()
    await usePlayer.getState().playTracks([makeTrack(0), makeTrack(1)], 1, null)
    usePlayer.setState({ currentTime: 10 })
    await usePlayer.getState().prev()
    expect(usePlayer.getState().currentIndex).toBe(1)
    usePlayer.setState({ currentTime: 1 })
    await usePlayer.getState().prev()
    expect(usePlayer.getState().currentIndex).toBe(0)
  })

  it('onEnded records completion and advances when autoplayNext is on', async () => {
    stubController()
    await usePlayer.getState().playTracks([makeTrack(0), makeTrack(1)], 0, null)
    usePlayer.setState({ duration: 100, currentTime: 95 })
    await usePlayer.getState().onEnded()
    expect(usePlayer.getState().currentIndex).toBe(1)
  })

  it('volume clamps and mute toggles', async () => {
    stubController()
    usePlayer.getState().setVolume(1.5)
    expect(usePlayer.getState().volume).toBe(1)
    usePlayer.getState().setVolume(-2)
    expect(usePlayer.getState().volume).toBe(0)
    usePlayer.getState().setVolume(0.5)
    expect(usePlayer.getState().muted).toBe(false)
    usePlayer.getState().toggleMute()
    expect(usePlayer.getState().muted).toBe(true)
    usePlayer.getState().toggleMute()
    expect(usePlayer.getState().muted).toBe(false)
  })

  it('circuit breaker stops auto-advance after 4 consecutive dead tracks', async () => {
    stubController()
    // YouTube-shaped tracks (no formats): every failure goes to the breaker path.
    const tracks = [0, 1, 2, 3, 4].map((i) => makeYtTrack(i))
    await usePlayer.getState().playTracks(tracks, 0, null)
    const { useSettings } = await import('../src/stores/settings')
    useSettings.setState({ autoplayNext: true })
    await usePlayer.getState().onError()
    expect(usePlayer.getState().currentIndex).toBe(1)
    await usePlayer.getState().onError()
    expect(usePlayer.getState().currentIndex).toBe(2)
    await usePlayer.getState().onError()
    expect(usePlayer.getState().currentIndex).toBe(3)
    await usePlayer.getState().onError() // 4th consecutive failure → stop
    expect(usePlayer.getState().currentIndex).toBe(3)
    expect(usePlayer.getState().error).toMatch(/Several tracks in a row/i)
    // a successful play resets the counter
    usePlayer.getState().onPlaying()
    expect(usePlayer.getState().consecutiveErrors).toBe(0)
  })
})
