import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { chartGenres, fetchTopSongs, newReleases, parseAppleFeed, resetChartsCache, ChartsUnavailableError } from '../src/lib/charts'
import { bestLookupMatch, isPlayable, resolveTrackFormats } from '../src/lib/resolve'
import { resetPipedClient } from '../src/lib/providers/pipedClient'
import { makeYtTrack } from './helpers'

const feed = {
  feed: {
    updated: 'Fri, 23 Oct 2026 17:17:39 +0000',
    results: [
      {
        id: '111',
        name: 'Ashke',
        artistName: 'Karan Aujla & MXRCI',
        artworkUrl100: 'https://is1-ssl.mzstatic.com/image/thumb/a/b/100x100bb.jpg',
        releaseDate: '2026-09-25',
        url: 'https://music.apple.com/in/song/111',
        genres: [{ name: 'Hip-Hop/Rap' }, { name: 'Music' }]
      },
      {
        id: '222',
        name: 'Veezha Veera (feat. Arun S)',
        artistName: 'Sai Abhyankkar',
        releaseDate: '2026-10-19',
        genres: [{ name: 'Tamil' }, { name: 'Music' }]
      },
      { id: '333', name: 'Old Hit', artistName: 'Someone', releaseDate: '2025-01-01', genres: [{ name: 'Tamil' }] }
    ]
  }
}

describe('charts — Apple feed parsing', () => {
  it('maps entries to ranked lookup tracks with upsized artwork', () => {
    const chart = parseAppleFeed(feed, 'in')
    expect(chart.entries.map((e) => e.rank)).toEqual([1, 2, 3])
    const t = chart.entries[0].track
    expect(t.id).toBe('youtube:chart-111')
    expect(t.formats).toEqual([])
    expect(t.embed).toBeNull()
    expect(t.artwork).toBe('https://is1-ssl.mzstatic.com/image/thumb/a/b/600x600bb.jpg')
    expect(chart.entries[0].genres).toEqual(['Hip-Hop/Rap'])
    expect(isPlayable(t)).toBe(true)
  })

  it('drops "(feat. …)" from the YouTube search query', () => {
    const chart = parseAppleFeed(feed, 'in')
    expect(chart.entries[1].track.lookup?.query).toBe('Veezha Veera Sai Abhyankkar')
  })

  it('finds new releases relative to the feed update time', () => {
    const chart = parseAppleFeed(feed, 'in')
    expect(newReleases(chart, 7).map((e) => e.track.title)).toEqual(['Veezha Veera (feat. Arun S)'])
    expect(newReleases(chart, 40).length).toBe(2)
  })

  it('lists genres by frequency', () => {
    expect(chartGenres(parseAppleFeed(feed, 'in'), 1)).toEqual(['Tamil', 'Hip-Hop/Rap'])
  })

  it('rejects malformed feeds', () => {
    expect(() => parseAppleFeed({}, 'in')).toThrow(ChartsUnavailableError)
  })
})

describe('charts — fetching through the proxy', () => {
  beforeEach(() => resetChartsCache())
  afterEach(() => vi.unstubAllGlobals())

  it('requests the same-origin proxy path', async () => {
    const fetchMock = vi.fn(async (_url: string) => Response.json(feed))
    vi.stubGlobal('fetch', fetchMock)
    const chart = await fetchTopSongs('us')
    expect(String(fetchMock.mock.calls[0][0])).toBe('/api/charts/us/music/most-played/100/songs.json')
    expect(chart.entries.length).toBe(3)
  })

  it('explains the missing proxy when a static host returns index.html', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<!doctype html>', { headers: { 'content-type': 'text/html' } })))
    await expect(fetchTopSongs('in')).rejects.toThrow(/proxy/)
  })
})

describe('charts — matching entries to YouTube videos', () => {
  const entry = parseAppleFeed(feed, 'in').entries[0].track

  it('prefers the result sharing the most title/artist words', () => {
    const wrong = makeYtTrack(1, { title: 'Totally different song', artist: 'Other' })
    const right = makeYtTrack(2, { title: 'Ashke (Official Video)', artist: 'Karan Aujla' })
    expect(bestLookupMatch(entry, [wrong, right])?.id).toBe(right.id)
  })

  it('penalizes covers and karaoke versions', () => {
    const cover = makeYtTrack(1, { title: 'Ashke Karan Aujla cover karaoke', artist: 'Fan' })
    const real = makeYtTrack(2, { title: 'Ashke', artist: 'Karan Aujla' })
    expect(bestLookupMatch(entry, [cover, real])?.id).toBe(real.id)
  })

  it('returns null when nothing matches', () => {
    expect(bestLookupMatch(entry, [makeYtTrack(1, { title: 'zzz', artist: 'qqq' })])).toBeNull()
  })

  it('resolves a chart entry to the matched video embed, keeping chart metadata', async () => {
    resetPipedClient()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          items: [{ url: '/watch?v=AshkeVid001', type: 'stream', title: 'Ashke', uploaderName: 'Karan Aujla', duration: 200, isShort: false }]
        })
      )
    )
    const resolved = await resolveTrackFormats(entry)
    expect(resolved.embed).toEqual({ kind: 'youtube', id: 'AshkeVid001' })
    expect(resolved.id).toBe(entry.id)
    expect(resolved.title).toBe('Ashke')
    expect(resolved.artwork).toBe(entry.artwork)
    vi.unstubAllGlobals()
  })
})

describe('charts — transient feed failures', () => {
  beforeEach(() => resetChartsCache())
  afterEach(() => vi.unstubAllGlobals())

  it('retries a 502 from the feed host', async () => {
    let calls = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => (++calls === 1 ? new Response('<html>bad gateway</html>', { status: 502 }) : Response.json(feed)))
    )
    const chart = await fetchTopSongs('gb')
    expect(calls).toBe(2)
    expect(chart.entries.length).toBe(3)
  })
})

describe('charts — artist-aware matching', () => {
  it('prefers the artist upload over a cover that lists the artists in its title', () => {
    const entry = parseAppleFeed(
      { feed: { results: [{ id: '9', name: 'BbY WOW', artistName: 'KAROL G, Judeline & rusowsky' }] } },
      'us'
    ).entries[0].track
    const real = makeYtTrack(1, { title: 'BbY WOW', artist: 'KAROL G' })
    const edit = makeYtTrack(2, { title: 'Bby Wow (Turreo Edit)', artist: 'DJ Mutha' })
    const cover = makeYtTrack(3, { title: 'BbY WOW ((KAROL G, Judeline, rusowsky))', artist: 'Epic Symphonic Orchestra' })
    expect(bestLookupMatch(entry, [cover, edit, real])?.id).toBe(real.id)
  })
})
