import { describe, it, expect, vi, afterEach } from 'vitest'
import { normalizeAudiusTrack, audiusProvider, audiusStreamUrl } from '../src/lib/providers/audiusProvider'

describe('audiusProvider — normalization honesty', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('uses the official stream endpoint as the audio URL', () => {
    expect(audiusStreamUrl('vJXMV')).toBe('https://discoveryprovider.audius.co/v1/tracks/vJXMV/stream?app_name=ANAHAD')
  })

  it('maps a real track with no invented bitrate', () => {
    const t = normalizeAudiusTrack({
      id: 'vJXMV',
      title: 'NewGapy - Bhajan (Original Mix)',
      user: { name: 'NewGapy' },
      duration: 268,
      genre: 'Trance',
      mood: 'Fiery',
      tags: 'psytrance,goa,mantra',
      artwork: { '480x480': 'https://content.audius.co/a.jpg' },
      permalink: 'https://audius.co/newgapy/bhajan',
      is_streamable: true,
      is_delete: false
    })
    expect(t).not.toBeNull()
    expect(t!.source).toBe('audius')
    expect(t!.formats[0].url).toContain('/v1/tracks/vJXMV/stream')
    expect(t!.formats[0].label).toBe('Original (source-provided)')
    expect(t!.formats[0].approxBitrateKbps).toBeNull() // API exposes none — stays null
    expect(t!.genres).toContain('Trance')
    expect(t!.genres).toContain('psytrance')
    expect(t!.durationSec).toBe(268)
  })

  it('filters deleted/unavailable/over-short entries', () => {
    expect(normalizeAudiusTrack({ id: 'x', title: 'T', duration: 200, is_delete: true })).toBeNull()
    expect(normalizeAudiusTrack({ id: 'x', title: 'T', duration: 200, is_available: false })).toBeNull()
    expect(normalizeAudiusTrack({ id: 'x', title: 'T', duration: 20 })).toBeNull()
    expect(normalizeAudiusTrack({ id: 'x', title: '', duration: 200 })).toBeNull()
  })

  it('searches via the official API paths (query + genre trending)', async () => {
    const seen: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL | Request) => {
        const u = String(url)
        seen.push(u)
        if (u === 'https://api.audius.co') return Response.json({ data: ['https://discoveryprovider.audius.co'] })
        return Response.json({ data: [{ id: 'a1', title: 'Some Track', duration: 200, user: { name: 'A' } }] })
      })
    )
    await audiusProvider.searchTracks({ query: 'bhajan', rows: 5 })
    expect(seen.some((u) => u.includes('/v1/tracks/search') && u.includes('query=bhajan'))).toBe(true)
    seen.length = 0
    await audiusProvider.searchTracks({ audiusGenre: 'Devotional', rows: 5 })
    expect(seen.some((u) => u.includes('/v1/tracks/trending') && u.includes('genre=Devotional'))).toBe(true)
    vi.unstubAllGlobals()
  })

  it('exposes no fabricated quality metadata', () => {
    expect(audiusProvider.capabilities.qualityMetadataAvailable).toBe(false)
    expect(audiusProvider.capabilities.directAudio).toBe(true)
  })
})
