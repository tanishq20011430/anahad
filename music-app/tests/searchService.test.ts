import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { unifiedSearch, unifiedTrackSearch, PROVIDERS } from '../src/lib/searchService'
import { useSettings } from '../src/stores/settings'

/** Fetch mock that answers real endpoints with verified-shape fixtures. */
function stubMultiSourceFetch(opts: { openverseFails?: boolean; iaFails?: boolean } = {}) {
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
      if (u.includes('advancedsearch.php')) {
        if (opts.iaFails) return new Response('nope', { status: 500 })
        return Response.json({
          response: {
            numFound: 1,
            docs: [{ identifier: 'iaitem1', title: 'IA Album', creator: 'IA Artist', downloads: 10, year: '1970' }]
          }
        })
      }
      if (u.includes('/metadata/')) {
        return Response.json({
          metadata: { identifier: 'iaitem1', title: 'IA Album', creator: 'IA Artist' },
          files: [{ name: 'track1.mp3', format: 'VBR MP3', size: '3000000', length: '180.5', title: 'IA Track 1' }]
        })
      }
      return new Response('not found', { status: 404 })
    })
  )
}

describe('searchService — multi-source orchestration', () => {
  beforeEach(() => {
    useSettings.setState({ sources: { 'internet-archive': true, openverse: true } })
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('registers both verified providers', () => {
    expect(PROVIDERS.map((p) => p.id)).toEqual(['internet-archive', 'openverse'])
    expect(PROVIDERS[1].searchTracks).toBeTypeOf('function')
    expect(PROVIDERS[1].capabilities.qualityMetadataAvailable).toBe(false)
  })

  it('unifiedTrackSearch merges IA album expansion + Openverse tracks', async () => {
    stubMultiSourceFetch()
    const res = await unifiedTrackSearch({ query: 'test', rows: 10 })
    const sources = res.tracks.map((t) => t.source)
    expect(sources).toContain('internet-archive')
    expect(sources).toContain('openverse')
    // interleave: the first track comes from the first bucket (IA)
    expect(res.tracks[0].source).toBe('internet-archive')
    // dedupe: no duplicate ids
    expect(new Set(res.tracks.map((t) => t.id)).size).toBe(res.tracks.length)
    expect(res.degraded).toBeUndefined()
  })

  it('reports degraded sources honestly when Openverse hits its quota', async () => {
    stubMultiSourceFetch({ openverseFails: true })
    // distinct query → bypasses the (intentional) 45-min search cache
    const res = await unifiedTrackSearch({ query: 'quota-probe', rows: 10 })
    expect(res.tracks.every((t) => t.source === 'internet-archive')).toBe(true)
    expect(res.degraded).toHaveLength(1)
    expect(res.degraded![0].source).toBe('openverse')
    expect(res.degraded![0].message).toMatch(/quota/i)
  })

  it('respects the per-source toggle (Openverse off)', async () => {
    stubMultiSourceFetch()
    useSettings.setState({ sources: { 'internet-archive': true, openverse: false } })
    const res = await unifiedTrackSearch({ query: 'test', rows: 10 })
    expect(res.tracks.every((t) => t.source === 'internet-archive')).toBe(true)
    expect(res.degraded).toBeUndefined()
  })

  it('unifiedSearch returns albums from IA and stays empty for track-first providers', async () => {
    stubMultiSourceFetch()
    const res = await unifiedSearch({ query: 'test' })
    expect(res.albums.length).toBeGreaterThan(0)
    expect(res.albums[0].source).toBe('internet-archive')
  })

  it('unifiedSearch still resolves (honestly degraded) when IA fails — track-first providers carry no albums', async () => {
    stubMultiSourceFetch({ iaFails: true })
    const res = await unifiedSearch({ query: 'x' })
    expect(res.albums).toHaveLength(0) // Openverse contributes no fabricated albums
    expect(res.degraded![0].source).toBe('internet-archive')
  })

  it('unifiedSearch throws only when every enabled album provider fails', async () => {
    stubMultiSourceFetch({ iaFails: true })
    useSettings.setState({ sources: { 'internet-archive': true, openverse: false } })
    await expect(unifiedSearch({ query: 'x' })).rejects.toThrow()
  })
})
