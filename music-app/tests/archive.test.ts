import { describe, it, expect } from 'vitest'
import { buildQuery, buildSearchUrl, normalizeItemToTracks, pickFormat, groupAudioFiles, fileDownloadUrl } from '../src/lib/archive'
import { parseLength, formatDuration, computeBitrateKbps, prettifyFileName, escapeLucene, dedupeKey, licenseLabel, parseYear } from '../src/lib/format'
import { parseExternalUrl, embedSrc } from '../src/lib/external'
import { LRUCache } from '../src/lib/cache'

describe('format utils', () => {
  it('parses both archive.org length formats', () => {
    expect(parseLength('421.12')).toBe(421)
    expect(parseLength('07:01')).toBe(421)
    expect(parseLength('1:07:01')).toBe(4021)
    expect(parseLength('')).toBeNull()
    expect(parseLength('garbage')).toBeNull()
    expect(parseLength(215.4)).toBe(215)
  })
  it('formats durations', () => {
    expect(formatDuration(421)).toBe('7:01')
    expect(formatDuration(4021)).toBe('1:07:01')
    expect(formatDuration(null)).toBe('--:--')
    expect(formatDuration(0)).toBe('0:00')
  })
  it('computes real bitrates from size + duration', () => {
    // 13,475,840 bytes over 421.12s ≈ 256 kbps
    expect(computeBitrateKbps(13_475_840, 421)).toBe(256)
    expect(computeBitrateKbps(0, 100)).toBeNull()
    expect(computeBitrateKbps(1000, 0)).toBeNull()
  })
  it('prettifies file stems', () => {
    expect(prettifyFileName('01_my_song_name')).toBe('My Song Name')
    expect(prettifyFileName('track_02-blue_skies_64kb')).toBe('Track 02-Blue Skies')
  })
  it('escapes lucene special chars in user input', () => {
    expect(escapeLucene('hello: (world)')).toBe('hello world')
    expect(escapeLucene('a AND b OR c')).toBe('a AND b OR c')
  })
  it('dedupe keys normalize punctuation + case + scripts', () => {
    expect(dedupeKey('My Song!', 'The Artist')).toBe(dedupeKey('my song', 'the artist'))
    expect(dedupeKey('भजन संग्रह', 'कलाकार')).toBe(dedupeKey('भजन संग्रह', 'कलाकार'))
  })
  it('license labels stay honest', () => {
    expect(licenseLabel('http://creativecommons.org/licenses/by-nc-sa/3.0/')).toBe('CC BY-NC-SA-3.0')
    expect(licenseLabel('http://creativecommons.org/publicdomain/zero/1.0/')).toBe('CC0 Public Domain')
    expect(licenseLabel(null, 'etree')).toBe('Band-approved live recording')
    expect(licenseLabel(null, 'other')).toBeNull()
  })
  it('parses years from messy dates', () => {
    expect(parseYear('1967-03-01T00:00:00Z')).toBe(1967)
    expect(parseYear('nonsense')).toBeNull()
  })
})

describe('archive query builder', () => {
  it('always constrains to audio + playable MP3 by default', () => {
    const q = buildQuery({ query: 'love songs' })
    expect(q.clause).toContain('mediatype:(audio)')
    expect(q.clause).toContain('format:(MP3)')
    expect(q.clause).toContain('(love songs)')
  })
  it('combines genre, language and collection filters', () => {
    const q = buildQuery({ genre: 'subject:(bhajan)', language: 'language:(hin OR hindi)', collection: 'netlabels' })
    expect(q.clause).toContain('(subject:(bhajan))')
    expect(q.clause).toContain('(language:(hin OR hindi))')
    expect(q.clause).toContain('collection:(netlabels)')
  })
  it('sanitizes creator search', () => {
    const q = buildQuery({ creator: 'Nusrat "Fateh" Ali Khan' })
    expect(q.clause).toContain('creator:("Nusrat Fateh Ali Khan")')
  })
  it('builds a URL with expected params', () => {
    const url = buildSearchUrl({ clause: 'mediatype:(audio)', sort: 'downloads' }, 2, 24)
    expect(url).toContain('https://archive.org/advancedsearch.php')
    expect(url).toContain('page=2')
    expect(url).toContain('rows=24')
    expect(url).toContain('downloads')
  })
  it('encodes download URLs per path segment', () => {
    expect(fileDownloadUrl('some item', 'Disc 1/my song.mp3')).toBe('https://archive.org/download/some%20item/Disc%201/my%20song.mp3')
  })
})

describe('item → tracks normalization', () => {
  const fixture = {
    metadata: {
      identifier: 'testitem',
      title: 'Test Album',
      creator: 'Test Artist',
      licenseurl: 'http://creativecommons.org/licenses/by/4.0/',
      language: 'hin',
      subject: ['bhajan', 'devotional'],
      year: '1975',
      collection: ['netlabels']
    },
    files: [
      { name: '01_-_first_song.mp3', format: 'VBR MP3', size: '13475840', length: '421.12', track: '1' },
      { name: '01_-_first_song_64kb.mp3', format: '64Kbps MP3', size: '3369504', length: '07:01', track: '1' },
      { name: '02_second.flac', format: 'Flac', size: '30000000', length: '300', track: '2' },
      { name: 'thumb.png', format: 'PNG', size: '1000' },
      { name: 'meta.xml', format: 'Metadata', size: '1000' },
      { name: '01_-_first_song_sample.mp3', format: 'MP3 Sample', size: '5000', length: '10' }
    ]
  }

  it('groups derivatives and skips non-audio', () => {
    const groups = groupAudioFiles(fixture.files)
    expect(groups).toHaveLength(2)
    // original + 64kb derivative (sample excluded at ingestion)
    expect(groups[0].files).toHaveLength(2)
  })

  it('produces tracks with real durations, formats and computed bitrates', () => {
    const tracks = normalizeItemToTracks(fixture, 'testitem')
    expect(tracks).toHaveLength(2)
    const first = tracks[0]
    expect(first.title).toBe('First Song')
    expect(first.artist).toBe('Test Artist')
    expect(first.album).toBe('Test Album')
    expect(first.durationSec).toBe(421)
    expect(first.formats.length).toBeGreaterThanOrEqual(2)
    expect(first.formats[0]).toMatchObject({ approxBitrateKbps: expect.any(Number) })
    // best-first ordering: highest bitrate (or lossless) first
    expect(first.formats[0].approxBitrateKbps!).toBeGreaterThanOrEqual(first.formats[1].approxBitrateKbps!)
    expect(first.licenseUrl).toContain('creativecommons.org')
    expect(first.genres).toEqual(['bhajan', 'devotional'])
    expect(first.year).toBe(1975)
    expect(first.id).toBe('internet-archive:testitem:01_-_first_song.mp3')
  })

  it('keeps lossless detection accurate (only FLAC is lossless)', () => {
    const tracks = normalizeItemToTracks(fixture, 'testitem')
    const flacTrack = tracks.find((t) => t.fileName === '02_second.flac')!
    expect(flacTrack.formats.some((f) => f.isLossless)).toBe(true)
    const mp3Track = tracks[0]
    expect(mp3Track.formats.every((f) => !f.isLossless)).toBe(true)
  })
})

describe('quality picking (capability-driven, never fabricated)', () => {
  const formats = [
    { url: 'u1', fileName: 'a_64kb.mp3', label: '64Kbps MP3', approxBitrateKbps: 64, sizeBytes: 1, isLossless: false, mimeType: 'audio/mpeg' },
    { url: 'u2', fileName: 'a.mp3', label: 'VBR MP3', approxBitrateKbps: 220, sizeBytes: 1, isLossless: false, mimeType: 'audio/mpeg' },
    { url: 'u3', fileName: 'a.flac', label: 'Flac', approxBitrateKbps: 900, sizeBytes: 1, isLossless: true, mimeType: 'audio/flac' }
  ]
  const track: import('../src/types').Track = { formats } as unknown as import('../src/types').Track

  const canAll = () => true
  const mp3Only = (t: string) => t === 'audio/mpeg'

  it('data saver picks lowest bitrate', () => {
    expect(pickFormat(track, 'data-saver', canAll)?.label).toBe('64Kbps MP3')
  })
  it('highest prefers genuine lossless when playable', () => {
    expect(pickFormat(track, 'highest', canAll)?.isLossless).toBe(true)
  })
  it('highest falls back to best mp3 when flac unsupported', () => {
    expect(pickFormat(track, 'highest', mp3Only)?.label).toBe('VBR MP3')
  })
  it('lossless returns null when only lossy is available (honest)', () => {
    const lossyOnly = { ...track, formats: formats.filter((f) => !f.isLossless) }
    expect(pickFormat(lossyOnly, 'lossless', canAll)).toBeNull()
  })
  it('standard picks ≤128 target', () => {
    expect(pickFormat(track, 'standard', canAll)?.label).toBe('64Kbps MP3')
  })
  it('high picks ≥192 when available', () => {
    expect(pickFormat(track, 'high', canAll)?.label).toBe('VBR MP3')
  })
  it('auto stays within ~192 kbps when possible', () => {
    expect(pickFormat(track, 'auto', canAll)?.label).toBe('64Kbps MP3')
  })
})

describe('external embed parsing (official players only)', () => {
  it('parses YouTube watch/short/shortlink URLs', () => {
    expect(parseExternalUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')?.embedId).toBe('dQw4w9WgXcQ')
    expect(parseExternalUrl('https://youtu.be/dQw4w9WgXcQ')?.embedId).toBe('dQw4w9WgXcQ')
    expect(parseExternalUrl('https://www.youtube.com/shorts/abcdefghij')?.embedId).toBe('abcdefghij')
  })
  it('parses Spotify track/album links', () => {
    const e = parseExternalUrl('https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT')
    expect(e?.embedId).toBe('track:4cOdK2wGLETKBW3PvgPWqT')
    expect(embedSrc(e!, false)).toContain('open.spotify.com/embed/track')
  })
  it('uses privacy-enhanced YouTube embeds', () => {
    const e = parseExternalUrl('youtube.com/watch?v=abc12345678')
    expect(embedSrc(e!, true)).toContain('youtube-nocookie.com')
  })
  it('rejects non-media URLs', () => {
    expect(parseExternalUrl('https://example.com/video/123')).toBeNull()
    expect(parseExternalUrl('not a url')).toBeNull()
  })
})

describe('LRU cache bounds', () => {
  it('evicts oldest beyond max and expires by TTL', () => {
    const c = new LRUCache<number>(2, 10)
    c.set('a', 1)
    c.set('b', 2)
    c.set('c', 3)
    expect(c.get('a')).toBeUndefined()
    expect(c.get('c')).toBe(3)
    c.set('d', 4)
    expect(c.get('b')).toBeUndefined()
    expect(c.size).toBe(2)
  })
})
