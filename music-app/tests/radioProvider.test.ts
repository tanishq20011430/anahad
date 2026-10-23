import { describe, it, expect, vi, afterEach } from 'vitest'
import { normalizeStation, radioProvider, mimeTypeForCodec } from '../src/lib/providers/radioProvider'

describe('radioProvider — station normalization honesty', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('maps a real directory record with codec + bitrate metadata', () => {
    const t = normalizeStation({
      stationuuid: '4507925d-4c86-432d-bf24-9d041cc9185a',
      name: 'Bhajans Radio Guyana',
      url_resolved: 'https://s5.citrus3.com:8148/stream',
      codec: 'AAC',
      bitrate: 128,
      tags: 'bhajan,hindi',
      country: 'India',
      language: 'hindi',
      votes: 1079,
      lastcheckok: 1,
      hls: 0
    })
    expect(t).not.toBeNull()
    expect(t!.source).toBe('radio')
    expect(t!.isLive).toBe(true)
    expect(t!.durationSec).toBeNull()
    expect(t!.formats[0].label).toBe('AAC 128 kbps')
    expect(t!.formats[0].approxBitrateKbps).toBe(128) // real directory metadata
    expect(t!.genres).toContain('bhajan')
    expect(t!.language).toBe('hindi')
  })

  it('filters HTTP-only stations (mixed-content honesty)', () => {
    expect(
      normalizeStation({ stationuuid: 'x', name: 'S', url_resolved: 'http://insecure/stream', codec: 'MP3', bitrate: 96 })
    ).toBeNull()
  })

  it('filters HLS-only stations rather than half-supporting them', () => {
    expect(
      normalizeStation({ stationuuid: 'x', name: 'S', url_resolved: 'https://ok/stream', hls: 1, codec: 'AAC' })
    ).toBeNull()
  })

  it('filters broken stations', () => {
    expect(
      normalizeStation({ stationuuid: 'x', name: 'S', url_resolved: 'https://ok/stream', lastcheckok: 0, codec: 'MP3' })
    ).toBeNull()
  })

  it('maps codecs to honest mime types', () => {
    expect(mimeTypeForCodec('AAC')).toBe('audio/aac')
    expect(mimeTypeForCodec('OGG')).toBe('audio/ogg')
    expect(mimeTypeForCodec('MP3')).toBe('audio/mpeg')
    expect(mimeTypeForCodec('UNKNOWN')).toBe('audio/mpeg')
  })

  it('the provider claims quality metadata because the directory publishes it', () => {
    expect(radioProvider.capabilities.qualityMetadataAvailable).toBe(true)
    expect(radioProvider.capabilities.directAudio).toBe(true)
  })

  it('resolves a single station via /json/url', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          stationuuid: 'rb1',
          name: 'Single Station',
          url_resolved: 'https://ok/stream',
          codec: 'MP3',
          bitrate: 128,
          votes: 10,
          lastcheckok: 1,
          hls: 0
        })
      )
    )
    const base = {
      id: 'radio:rb1',
      source: 'radio' as const,
      identifier: 'rb1',
      fileName: '',
      title: '',
      artist: '',
      album: '',
      artwork: null,
      durationSec: null,
      formats: [],
      embed: null,
      licenseUrl: null,
      language: null,
      genres: [],
      estimatedMoods: [],
      year: null,
      itemPage: '',
      collection: null
    }
    const resolved = await radioProvider.resolveTrack!(base)
    expect(resolved.title).toBe('Single Station')
    expect(resolved.isLive).toBe(true)
  })
})
