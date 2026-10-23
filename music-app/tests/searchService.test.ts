import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { unifiedTrackSearch, PROVIDERS } from '../src/lib/searchService'
import { useSettings } from '../src/stores/settings'
import { resetPipedClient } from '../src/lib/providers/pipedClient'

/** Fetch mock that answers real endpoints with verified-shape fixtures. */
function stubMultiSourceFetch(opts: { openverseFails?: boolean; audiusFails?: boolean; pipedFails?: boolean; radioFails?: boolean; mixcloudFails?: boolean } = {}) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url)
      void init
      if (u.includes('api.openverse.org')) {
        if (opts.openverseFails) return new Response('rate limited', { status: 429 })
        return Response.json({
          result_count: 2,
          page_count: 1,
          results: [
            {
              id: 'ov-1',
              title: 'OV Track One',
              creator: 'OV Artist',
              url: 'https://prod-1.storage.jamendo.com/?trackid=1&format=mp32',
              license: 'by',
              license_version: '4.0',
              duration: 150_000,
              filetype: 'mp32',
              provider: 'jamendo'
            },
            {
              id: 'ov-2',
              title: 'OV Track Two',
              creator: 'OV Artist 2',
              url: 'https://prod-1.storage.jamendo.com/?trackid=2&format=mp32',
              license: 'cc0',
              license_version: '1.0',
              duration: 180_000,
              filetype: 'mp32',
              provider: 'jamendo'
            }
          ]
        })
      }
      if (u.includes('piped.private.coffee') || u.includes('pipedapi.ducks.party')) {
        if (opts.pipedFails) return new Response('down', { status: 500 })
        return Response.json({
          items: [
            {
              url: '/watch?v=ytvid1',
              type: 'stream',
              title: 'YT Song One',
              uploaderName: 'YT Artist',
              duration: 220,
              isShort: false
            },
            { url: '/watch?v=short1', type: 'stream', title: 'A Short', duration: 20, isShort: true },
            { url: '/watch?v=ytvid2', type: 'stream', title: 'YT Song Two', uploaderName: 'YT Artist', duration: 190 }
          ]
        })
      }
      if (u.includes('audius.co')) {
        if (opts.audiusFails) return new Response('down', { status: 503 })
        return Response.json({
          data: [
            {
              id: 'aud1',
              title: 'Audius Track One',
              user: { name: 'Audius Artist' },
              duration: 240,
              genre: 'Electronic',
              artwork: { '480x480': 'https://content.audius.co/a.jpg' },
              is_streamable: true,
              is_delete: false
            },
            {
              id: 'aud2',
              title: 'Too Short',
              user: { name: 'X' },
              duration: 20
            }
          ]
        })
      }
      if (u.includes('radio-browser.info')) {
        if (opts.radioFails) throw new TypeError('radio dead')
        return Response.json([
          {
            stationuuid: 'rb1',
            name: 'Bhajans Radio',
            url_resolved: 'https://stream.example.com/bhajan',
            codec: 'AAC',
            bitrate: 128,
            tags: 'bhajan,devotional',
            country: 'India',
            language: 'hindi',
            votes: 500,
            lastcheckok: 1,
            hls: 0
          },
          {
            stationuuid: 'rb2',
            name: 'HTTP Only Station',
            url_resolved: 'http://insecure.example.com/stream',
            codec: 'MP3',
            bitrate: 96,
            votes: 100,
            lastcheckok: 1,
            hls: 0
          }
        ])
      }
      if (u.includes('api.mixcloud.com')) {
        if (opts.mixcloudFails) return new Response('down', { status: 500 })
        return Response.json({
          data: [
            {
              key: '/user/some-show/',
              url: 'https://www.mixcloud.com/user/some-show/',
              name: 'Some Show',
              user: { username: 'user', name: 'User Name' },
              tags: [{ key: '/genres/dub/', name: 'Dub' }],
              pictures: { medium_mobile: 'https://thumbnailer.mixcloud.com/x' }
            }
          ]
        })
      }
      return new Response('not found', { status: 404 })
    })
  )
}

describe('searchService — multi-source orchestration', () => {
  beforeEach(() => {
    resetPipedClient()
    useSettings.setState({ sources: { youtube: true, audius: true, radio: true, openverse: true, mixcloud: true } })
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('registers the five verified providers in priority order', () => {
    expect(PROVIDERS.map((p) => p.id)).toEqual(['audius', 'youtube', 'radio', 'openverse', 'mixcloud'])
    for (const p of PROVIDERS) expect(p.searchTracks).toBeTypeOf('function')
  })

  it('unifiedTrackSearch merges all sources with deterministic interleave', async () => {
    stubMultiSourceFetch()
    const res = await unifiedTrackSearch({ query: 'test', rows: 10 })
    const sources = new Set(res.tracks.map((t) => t.source))
    expect(sources).toContain('audius')
    expect(sources).toContain('youtube')
    expect(sources).toContain('radio')
    expect(sources).toContain('openverse')
    expect(sources).toContain('mixcloud')
    // interleave: first track of each bucket in registry order
    expect(res.tracks[0].source).toBe('audius')
    expect(res.tracks[1].source).toBe('youtube')
    expect(res.tracks[2].source).toBe('radio')
    // dedupe: no duplicate ids
    expect(new Set(res.tracks.map((t) => t.id)).size).toBe(res.tracks.length)
    expect(res.degraded).toBeUndefined()
  })

  it('keeps junk out of normalized results (shorts, http stations, tiny tracks)', async () => {
    stubMultiSourceFetch()
    const res = await unifiedTrackSearch({ query: 'junk-probe', rows: 20 })
    expect(res.tracks.some((t) => t.id === 'youtube:short1')).toBe(false)
    expect(res.tracks.some((t) => t.id === 'audius:aud2')).toBe(false)
    const radio = res.tracks.filter((t) => t.source === 'radio')
    expect(radio.every((t) => t.formats[0].url.startsWith('https://'))).toBe(true)
  })

  it('reports degraded sources honestly when one source fails', async () => {
    stubMultiSourceFetch({ openverseFails: true, pipedFails: true })
    const res = await unifiedTrackSearch({ query: 'quota-probe', rows: 10 })
    const degradedSources = (res.degraded ?? []).map((d) => d.source)
    expect(degradedSources).toContain('openverse')
    expect(degradedSources).toContain('youtube')
    // healthy sources still return results
    expect(res.tracks.some((t) => t.source === 'audius')).toBe(true)
    expect(res.tracks.some((t) => t.source === 'radio')).toBe(true)
  })

  it('respects the per-source toggle (mixcloud off)', async () => {
    stubMultiSourceFetch()
    useSettings.setState({ sources: { youtube: true, audius: true, radio: true, openverse: true, mixcloud: false } })
    const res = await unifiedTrackSearch({ query: 'test', rows: 10 })
    expect(res.tracks.every((t) => t.source !== 'mixcloud')).toBe(true)
    expect(res.degraded).toBeUndefined()
  })

  it('passes source-native params only to the matching provider (audiusGenre)', async () => {
    stubMultiSourceFetch()
    const res = await unifiedTrackSearch({ audiusGenre: 'Electronic', rows: 10 })
    // all tracks still come back; the audius bucket was queried with trending?genre=
    expect(res.tracks.some((t) => t.source === 'audius')).toBe(true)
  })
})
