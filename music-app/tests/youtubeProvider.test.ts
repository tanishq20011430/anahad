import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { normalizePipedItem, videoIdFromUrl, ytThumbnail, youtubeProvider } from '../src/lib/providers/youtubeProvider'
import { pipedGet, resetPipedClient, PIPED_INSTANCES, PipedUnavailableError } from '../src/lib/providers/pipedClient'

describe('pipedClient — instance failover', () => {
  beforeEach(() => resetPipedClient())
  afterEach(() => vi.unstubAllGlobals())

  it('has a curated instance pool', () => {
    expect(PIPED_INSTANCES.length).toBeGreaterThanOrEqual(2)
    expect(PIPED_INSTANCES).toContain('api.piped.private.coffee')
  })

  it('fails over to the second instance when the first is down', async () => {
    const tried: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL | Request) => {
        const host = String(url).replace(/^https:\/\//, '').split('/')[0]
        tried.push(host)
        if (host === PIPED_INSTANCES[0]) return new Response('down', { status: 500 })
        return Response.json({ ok: true })
      })
    )
    const data = await pipedGet<{ ok: boolean }>('/search?q=x')
    expect(data.ok).toBe(true)
    expect(tried).toEqual([PIPED_INSTANCES[0], PIPED_INSTANCES[1]])
  })

  it('throws a typed error when every instance is down', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('down', { status: 503 }))
    )
    await expect(pipedGet('/search?q=x')).rejects.toBeInstanceOf(PipedUnavailableError)
  })
})

describe('youtubeProvider — normalization honesty', () => {
  it('extracts video ids from watch URLs', () => {
    expect(videoIdFromUrl('/watch?v=C2GMIavjuVI')).toBe('C2GMIavjuVI')
    expect(videoIdFromUrl('/channel/x')).toBeNull()
  })

  it('builds direct i.ytimg.com thumbnails (no proxy dependency)', () => {
    expect(ytThumbnail('abc123')).toBe('https://i.ytimg.com/vi/abc123/mqdefault.jpg')
  })

  it('maps a real music result to an embed-transport track with no direct formats', () => {
    const t = normalizePipedItem({
      url: '/watch?v=C2GMIavjuVI',
      type: 'stream',
      title: 'Laal Ishq',
      uploaderName: 'Sanjay Leela Bhansali',
      duration: 388,
      isShort: false
    })
    expect(t).not.toBeNull()
    expect(t!.source).toBe('youtube')
    expect(t!.id).toBe('youtube:C2GMIavjuVI')
    expect(t!.artist).toBe('Sanjay Leela Bhansali')
    expect(t!.durationSec).toBe(388)
    expect(t!.formats).toEqual([]) // deliberate: official embed only
    expect(t!.embed).toEqual({ kind: 'youtube', id: 'C2GMIavjuVI' })
    expect(t!.licenseName).toMatch(/YouTube/)
  })

  it('filters shorts, non-streams and too-short videos', () => {
    expect(normalizePipedItem({ url: '/watch?v=short1', type: 'stream', title: 'S', duration: 20, isShort: true })).toBeNull()
    expect(normalizePipedItem({ url: '/watch?v=long1', type: 'playlist', title: 'P', duration: 500 })).toBeNull()
    expect(normalizePipedItem({ url: '/watch?v=x1', type: 'stream', title: 'Tiny', duration: 30 })).toBeNull()
    expect(normalizePipedItem({ url: '/watch?v=y1', type: 'stream', duration: 120 })).toBeNull() // no title
  })

  it('the provider exposes resolveTrack via oEmbed and related via same-uploader search', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL | Request) => {
        const u = String(url)
        if (u.includes('youtube.com/oembed')) {
          return Response.json({ title: 'Real Title', author_name: 'Real Artist', thumbnail_url: 'https://i.ytimg.com/vi/x/hq.jpg' })
        }
        if (u.includes('piped')) {
          return Response.json({ items: [{ url: '/watch?v=nextvid1', type: 'stream', title: 'More', uploaderName: 'Real Artist', duration: 200 }] })
        }
        return new Response('nf', { status: 404 })
      })
    )
    resetPipedClient()
    const base = {
      id: 'youtube:vidX',
      source: 'youtube' as const,
      identifier: 'vidX',
      fileName: '',
      title: '',
      artist: 'Real Artist',
      album: '',
      artwork: null,
      durationSec: null,
      formats: [],
      embed: { kind: 'youtube' as const, id: 'vidX' },
      licenseUrl: null,
      language: null,
      genres: [],
      estimatedMoods: [],
      year: null,
      itemPage: '',
      collection: '/channel/x'
    }
    const resolved = await youtubeProvider.resolveTrack!(base)
    expect(resolved.title).toBe('Real Title')
    const related = await youtubeProvider.getRelatedTracks!(base)
    expect(related.some((t) => t.id === 'youtube:nextvid1')).toBe(true)
    vi.unstubAllGlobals()
  })
})
