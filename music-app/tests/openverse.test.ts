import { describe, it, expect } from 'vitest'
import { normalizeOvAudio, openverseLicenseUrl, openverseLicenseName, openverseProviderLabel } from '../src/lib/openverse'
import type { Track } from '../src/types'

const base = {
  id: '37c21842-ff1a-4705-9ff4-612fa0f9287e',
  title: 'Lofi relax hip hop lofi lofi beats',
  creator: 'PeryCreep',
  url: 'https://prod-1.storage.jamendo.com/?trackid=1865545&format=mp32',
  foreign_landing_url: 'https://www.jamendo.com/track/1865545/x',
  license: 'by-nc-nd',
  license_version: '3.0',
  duration: 139_000,
  filetype: 'mp32',
  provider: 'jamendo',
  genres: ['chillhop', 'lofi'],
  tags: [{ name: 'calm' }, { name: 'study' }],
  thumbnail: 'https://api.openverse.org/v1/audio/37c21842-ff1a-4705-9ff4-612fa0f9287e/thumb/',
  audio_set: { title: 'Lo-fi Album', foreign_landing_url: 'https://www.jamendo.com/album/446126/lofi' }
}

describe('Openverse normalization — real API shape (verified 2026-10)', () => {
  it('maps duration ms → seconds and keeps provider metadata honest', () => {
    const t = normalizeOvAudio(base)
    expect(t).not.toBeNull()
    const track = t as Track
    expect(track.durationSec).toBe(139)
    expect(track.source).toBe('openverse')
    expect(track.collection).toBe('jamendo')
    expect(track.artist).toBe('PeryCreep')
    expect(track.album).toBe('Lo-fi Album')
    expect(track.formats).toHaveLength(1)
    expect(track.formats[0].label).toBe('MP32 (original)')
    // upstream bit_rate absent → must stay null (never invented)
    expect(track.formats[0].approxBitrateKbps).toBeNull()
    expect(track.formats[0].mimeType).toBe('audio/mpeg')
  })

  it('keeps a provided bit_rate and derives lossless-ness for flac/wav', () => {
    const t = normalizeOvAudio({ ...base, id: 'x1', bit_rate: 192_000, filesize: 4_000_000, filetype: 'flac' })
    expect(t!.formats[0].approxBitrateKbps).toBe(192)
    expect(t!.formats[0].sizeBytes).toBe(4_000_000)
    expect(t!.formats[0].isLossless).toBe(true)
    expect(t!.formats[0].mimeType).toBe('audio/flac')
  })

  it('maps alt_files into additional honest formats', () => {
    const t = normalizeOvAudio({
      ...base,
      id: 'x2',
      alt_files: [{ url: 'https://h.example/a.flac', filetype: 'flac', filesize: 20_000_000 }]
    })
    expect(t!.formats).toHaveLength(2)
    expect(t!.formats[1].label).toBe('FLAC (alternative)')
    expect(t!.formats[1].isLossless).toBe(true)
  })

  it('estimates moods from tags and genres (labeled as estimates downstream)', () => {
    const t = normalizeOvAudio(base)!
    expect(t.estimatedMoods).toContain('peaceful') // 'calm' keyword
    expect(t.estimatedMoods).toContain('focus') // 'study' keyword
  })

  it('drops records that are too short to be full music', () => {
    expect(normalizeOvAudio({ ...base, id: 'short', duration: 12_000 })).toBeNull()
  })

  it('drops records without a direct playable URL', () => {
    expect(normalizeOvAudio({ ...base, id: 'nourl', url: undefined })).toBeNull()
  })

  it('handles wikimedia + freesound providers and cc0/sampling+ licenses', () => {
    const t1 = normalizeOvAudio({ ...base, id: 'w1', provider: 'wikimedia_audio', license: 'cc0', license_version: '1.0' })!
    expect(t1.collection).toBe('wikimedia_audio')
    expect(t1.licenseUrl).toContain('publicdomain/zero/1.0')
    expect(t1.licenseName).toBe('CC0 Public Domain')
    const t2 = normalizeOvAudio({ ...base, id: 'f1', provider: 'freesound', license: 'sampling+', license_version: '1.0' })!
    expect(t2.licenseName).toBe('CC Sampling+ 1.0')
    expect(openverseProviderLabel('freesound')).toBe('Freesound')
    expect(openverseProviderLabel('wikimedia_audio')).toBe('Wikimedia Commons')
    expect(openverseProviderLabel(null)).toBe('Openverse')
  })

  it('builds canonical license URLs for standard CC codes', () => {
    expect(openverseLicenseUrl('by', '4.0')).toBe('https://creativecommons.org/licenses/by/4.0/')
    expect(openverseLicenseUrl('by-nc-sa', '3.0')).toBe('https://creativecommons.org/licenses/by-nc-sa/3.0/')
    expect(openverseLicenseUrl('pdm', undefined)).toContain('publicdomain')
    expect(openverseLicenseUrl(undefined, '1.0')).toBeNull()
    expect(openverseLicenseName('by-nc-nd', '3.0')).toBe('CC BY NC ND 3.0')
  })
})
