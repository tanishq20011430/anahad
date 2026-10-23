import { describe, it, expect } from 'vitest'
import { pickFormat, ytQualityFor } from '../src/lib/quality'
import type { Track } from '../src/types'
import { makeTrack, makeYtTrack } from './helpers'

const always = () => true
const never = () => false

describe('pickFormat — quality honesty', () => {
  it('data-saver picks the lowest bitrate the source truly offers', () => {
    const t = makeTrack(1, {
      formats: [
        { url: 'https://x/64.mp3', fileName: '64.mp3', label: '64Kbps MP3', approxBitrateKbps: 64, sizeBytes: null, isLossless: false, mimeType: 'audio/mpeg' },
        { url: 'https://x/320.mp3', fileName: '320.mp3', label: '320Kbps MP3', approxBitrateKbps: 320, sizeBytes: null, isLossless: false, mimeType: 'audio/mpeg' }
      ]
    })
    expect(pickFormat(t, 'data-saver', always)?.approxBitrateKbps).toBe(64)
    expect(pickFormat(t, 'highest', always)?.approxBitrateKbps).toBe(320)
  })

  it('lossless returns null when the source has no lossless format (no faking)', () => {
    const t = makeTrack(1)
    expect(pickFormat(t, 'lossless', always)).toBeNull()
  })

  it('respects browser codec support', () => {
    const t = makeTrack(1, {
      formats: [
        { url: 'https://x/a.flac', fileName: 'a.flac', label: 'FLAC', approxBitrateKbps: 900, sizeBytes: null, isLossless: true, mimeType: 'audio/flac' },
        { url: 'https://x/a.mp3', fileName: 'a.mp3', label: 'MP3', approxBitrateKbps: 192, sizeBytes: null, isLossless: false, mimeType: 'audio/mpeg' }
      ]
    })
    const can = (m: string) => m === 'audio/mpeg'
    expect(pickFormat(t, 'highest', can)?.mimeType).toBe('audio/mpeg')
    expect(pickFormat(t, 'highest', never)).toBeNull()
  })

  it('embed-only tracks have nothing to pick (transport is official)', () => {
    const t = makeYtTrack(3)
    expect(pickFormat(t, 'highest', always)).toBeNull()
  })
})

describe('ytQualityFor — requested-level mapping', () => {
  it('maps preferences to YouTube request levels', () => {
    expect(ytQualityFor('data-saver')).toBe('small')
    expect(ytQualityFor('standard')).toBe('medium')
    expect(ytQualityFor('high')).toBe('hd720')
    expect(ytQualityFor('lossless')).toBe('hd1080')
    expect(ytQualityFor('auto')).toBeNull()
  })
})

describe('Track fixtures — multi-source shapes', () => {
  it('embed tracks have formats: [] by design', () => {
    const t: Track = makeYtTrack(1)
    expect(t.formats).toHaveLength(0)
    expect(t.embed?.kind).toBe('youtube')
  })
})
