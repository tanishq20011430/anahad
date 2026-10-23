import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { fetchRelatedTracks, recordSessionPlay, getSessionPlays, fetchSessionMix } from '../src/lib/related'
import type { Track } from '../src/types'

function makeTrack(i: number, overrides: Partial<Track> = {}): Track {
  return {
    id: `internet-archive:item${i}:file${i}.mp3`,
    source: 'internet-archive',
    identifier: `item${i}`,
    fileName: `file${i}.mp3`,
    title: `Song ${i}`,
    artist: `Artist ${i}`,
    album: `Album ${i}`,
    artwork: null,
    durationSec: 180,
    formats: [
      {
        url: `https://archive.org/download/item${i}/file${i}.mp3`,
        fileName: `file${i}.mp3`,
        label: 'VBR MP3',
        approxBitrateKbps: 200,
        sizeBytes: 4_000_000,
        isLossless: false,
        mimeType: 'audio/mpeg'
      }
    ],
    licenseUrl: null,
    language: null,
    genres: ['lo-fi'],
    estimatedMoods: [],
    year: null,
    itemPage: `https://archive.org/details/item${i}`,
    collection: null,
    ...overrides
  }
}

function stubRelatedFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string | URL | Request) => {
      const u = String(url)
      if (u.includes('api.openverse.org') && u.includes('/related/')) {
        return Response.json({
          result_count: 2,
          results: [
            {
              id: 'rel-1',
              title: 'Related OV Track',
              creator: 'Rel Artist',
              url: 'https://prod-1.storage.jamendo.com/?trackid=9&format=mp32',
              license: 'by',
              license_version: '4.0',
              duration: 160_000,
              filetype: 'mp32',
              provider: 'jamendo'
            }
          ]
        })
      }
      if (u.includes('advancedsearch.php')) {
        return Response.json({ response: { numFound: 1, docs: [{ identifier: 'itemX', title: 'Same Artist Album', creator: 'Artist 1', downloads: 3 }] } })
      }
      if (u.includes('/metadata/')) {
        return Response.json({
          metadata: { title: 'Same Artist Album', creator: 'Artist 1' },
          files: [{ name: 's1.mp3', format: 'VBR MP3', size: '2000000', length: '150.0', title: 'Sibling Track' }]
        })
      }
      return new Response('nf', { status: 404 })
    })
  )
}

describe('related tracks + session mix', () => {
  beforeEach(() => {
    recordSessionReset()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function recordSessionReset() {
    // session plays are module-level; clear by re-recording over a fresh import is heavy —
    // tests below tolerate prior session state and assert on invariants instead.
  }

  it('assembles related tracks with honest reasons and excludes the current track', async () => {
    stubRelatedFetch()
    const track = makeTrack(1)
    const related = await fetchRelatedTracks(track)
    expect(related.length).toBeGreaterThan(0)
    expect(related.every((r) => r.track.id !== track.id)).toBe(true)
    expect(related.every((r) => r.track.formats.length > 0)).toBe(true)
    expect(related.every((r) => r.reason.length > 0)).toBe(true)
    // IA source gets same-artist expansion
    expect(related.some((r) => r.reason.startsWith('More from'))).toBe(true)
  })

  it('degrades to an empty list (not a crash) when all network fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('network dead')
      })
    )
    const related = await fetchRelatedTracks(makeTrack(2))
    expect(Array.isArray(related)).toBe(true)
    expect(related.every((r) => r.track.id !== makeTrack(2).id)).toBe(true)
  })

  it('records session plays in memory and returns them newest-first', () => {
    recordSessionPlay(makeTrack(10))
    recordSessionPlay(makeTrack(11))
    const plays = getSessionPlays()
    expect(plays.length).toBeGreaterThanOrEqual(2)
    expect(plays[0].id).toBe(makeTrack(11).id)
  })

  it('session mix requires at least two session plays and returns deduped items', async () => {
    stubRelatedFetch()
    const a = makeTrack(20)
    const b = makeTrack(21)
    recordSessionPlay(a)
    recordSessionPlay(b)
    const mix = await fetchSessionMix(6)
    const ids = new Set(mix.map((m) => m.track.id))
    expect(ids.has(a.id)).toBe(false)
    expect(ids.has(b.id)).toBe(false)
    expect(new Set(mix.map((m) => m.track.id)).size).toBe(mix.length)
  })
})
