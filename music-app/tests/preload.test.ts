import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { preload } from '../src/lib/preload'
import { audioCache } from '../src/lib/audioCache'
import { usePlayer } from '../src/stores/player'
import { useSettings } from '../src/stores/settings'
import type { Track } from '../src/types'

function makeTrack(i: number, url: string): Track {
  return {
    id: `openverse:item${i}`,
    source: 'openverse',
    identifier: `item${i}`,
    fileName: `file${i}.mp3`,
    title: `Song ${i}`,
    artist: `Artist ${i}`,
    album: `Album ${i}`,
    artwork: null,
    durationSec: 200,
    formats: [{ url, fileName: `file${i}.mp3`, label: 'VBR MP3', approxBitrateKbps: 200, sizeBytes: 5_000_000, isLossless: false, mimeType: 'audio/mpeg' }],
    embed: null,
    licenseUrl: null,
    language: null,
    genres: [],
    estimatedMoods: [],
    year: null,
    itemPage: `https://openverse.org/item${i}`,
    collection: 'jamendo'
  }
}

const HOST = 'https://storage.example.com'
const CURRENT_URL = `${HOST}/download/item0/file0.mp3`
const NEXT_URL = `${HOST}/download/item1/file1.mp3`

describe('preload orchestrator — next-track preloading', () => {
  beforeEach(() => {
    preload.cancelAll() // reset singleton state (lastNextKey/info) between tests
    usePlayer.getState().reset()
    usePlayer.setState({
      queue: [makeTrack(0, CURRENT_URL), makeTrack(1, NEXT_URL), makeTrack(2, 'https://storage.example.com/download/item2/file2.mp3')],
      currentIndex: 0,
      currentFormat: {
        url: CURRENT_URL,
        fileName: 'file0.mp3',
        label: 'VBR MP3',
        approxBitrateKbps: 200,
        sizeBytes: 5_000_000,
        isLossless: false,
        mimeType: 'audio/mpeg'
      },
      shuffledOrder: null,
      shufflePointer: 0,
      repeat: 'off',
      duration: 200,
      currentTime: 0
    })
    useSettings.setState({ preloadEnabled: true, cacheMode: 'standard', quality: 'auto' })
    audioCache.clear()
    audioCache.configure('standard')
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
        void url
        void init
        return new Response(new Uint8Array(262144).fill(2).buffer, {
          status: 206,
          headers: { 'content-type': 'audio/mpeg', 'content-range': 'bytes 0-262143/5242880' }
        })
      })
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    preload.cancelAll()
  })

  it('primes the next track and reports primed state', async () => {
    await preload.planNow()
    expect(audioCache.has(NEXT_URL)).toBe(true)
    const info = preload.getInfo()
    expect(info.state).toBe('primed')
    expect(info.nextUrl).toBe(NEXT_URL)
  })

  it('respects shuffle order when picking the next track', async () => {
    // shuffled order visits index 2 next (pointer 0 → order[1] = 2)
    usePlayer.setState({ shuffledOrder: [0, 2, 1], shufflePointer: 0 })
    await preload.planNow()
    expect(preload.getInfo().nextUrl).toBe('https://storage.example.com/download/item2/file2.mp3')
  })

  it('skips when repeat-one loops the current track', async () => {
    usePlayer.setState({ repeat: 'one' })
    await preload.planNow()
    expect(preload.getInfo().state).toBe('idle')
    expect(preload.getInfo().nextTrackId).toBeNull()
  })

  it('skips when preloading is disabled', async () => {
    useSettings.setState({ preloadEnabled: false })
    await preload.planNow()
    const info = preload.getInfo()
    expect(info.state).toBe('skipped')
    expect(info.reason).toMatch(/disabled/i)
    expect(audioCache.has(NEXT_URL)).toBe(false)
  })

  it('skips the audio phase when the cache is off but still resolves metadata', async () => {
    useSettings.setState({ cacheMode: 'off' })
    await preload.planNow()
    const info = preload.getInfo()
    expect(info.nextUrl).toBe(NEXT_URL)
    expect(info.state).toBe('skipped') // canPrime returns false with cache off
    expect(audioCache.has(NEXT_URL)).toBe(false)
  })

  it('enforces cache policy: keeps only current + next, drops stale slices', async () => {
    // Simulate a stale slice from an earlier track.
    await audioCache.prime('https://storage.example.com/download/item9/stale.mp3')
    expect(audioCache.has('https://storage.example.com/download/item9/stale.mp3')).toBe(true)
    await preload.planNow()
    expect(audioCache.has('https://storage.example.com/download/item9/stale.mp3')).toBe(false)
    expect(audioCache.has(CURRENT_URL) || audioCache.has(NEXT_URL)).toBe(true)
  })

  it('releases the finished track on track end (policy hook)', async () => {
    await audioCache.prime(CURRENT_URL)
    expect(audioCache.has(CURRENT_URL)).toBe(true)
    preload.onTrackEnded(CURRENT_URL, false)
    expect(audioCache.has(CURRENT_URL)).toBe(false)
  })

  it('keeps the finished track when repeat-one will replay it', async () => {
    await audioCache.prime(CURRENT_URL)
    preload.onTrackEnded(CURRENT_URL, true)
    expect(audioCache.has(CURRENT_URL)).toBe(true)
  })

  it('records progress-triggered planning only past 60% of the track', async () => {
    preload.notifyProgress(50) // 25% — below trigger
    expect(audioCache.has(NEXT_URL)).toBe(false)
    preload.notifyProgress(190) // 95% — trigger
    await preload.planNow()
    expect(audioCache.has(NEXT_URL)).toBe(true)
  })
})
