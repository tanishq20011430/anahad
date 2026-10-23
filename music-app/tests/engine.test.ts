import { describe, it, expect } from 'vitest'
import { MseStream } from '../src/lib/mseStream'
import { resolveTrackFormats } from '../src/lib/resolve'
import { sourceChipFor, VERIFIED_SOURCES, EXCLUDED_SOURCES } from '../src/lib/sourceStatus'

describe('MseStream — capability gating', () => {
  it('reports support honestly for the current environment', () => {
    // In jsdom MediaSource is undefined → unsupported. This exact check is
    // what routes Safari/iOS (and old browsers) to native streaming.
    expect(MseStream.supported()).toBe(typeof MediaSource !== 'undefined')
  })

  it('falls back to native when unsupported (start resolves streaming:false)', async () => {
    if (MseStream.supported()) return // real MSE available in this env — skip
    const audio = document.createElement('audio')
    const res = await new MseStream().start(audio, 'https://h.example/a.mp3', null, () => undefined)
    expect(res.streaming).toBe(false)
    res.stop() // must be safe to call
  })
})

describe('resolveTrackFormats — multi-source dispatch', () => {
  it('returns tracks that already carry formats untouched (no network)', async () => {
    const t = {
      id: 'openverse:uuid-1:f.mp3',
      source: 'openverse',
      identifier: 'uuid-1',
      fileName: 'f.mp3',
      title: 'T',
      artist: 'A',
      album: 'T',
      artwork: null,
      durationSec: 100,
      formats: [{ url: 'https://h.example/f.mp3', fileName: 'f.mp3', label: 'MP3 (original)', approxBitrateKbps: null, sizeBytes: null, isLossless: false, mimeType: 'audio/mpeg' }],
      licenseUrl: null,
      language: null,
      genres: [],
      estimatedMoods: [],
      year: null,
      itemPage: 'https://openverse.org/',
      collection: 'jamendo'
    } as import('../src/types').Track
    const resolved = await resolveTrackFormats(t)
    expect(resolved).toBe(t) // same reference — no resolution needed
  })
})

describe('source registry — verified vs excluded', () => {
  it('lists only verified-working sources as connected', () => {
    expect(VERIFIED_SOURCES.map((s) => s.id)).toEqual(['internet-archive', 'openverse'])
    for (const s of VERIFIED_SOURCES) {
      expect(s.verifiedAt).toBeTruthy()
      expect(s.summary.length).toBeGreaterThan(20)
    }
  })

  it('documents an explicit access-rule reason for every excluded source', () => {
    const labels = EXCLUDED_SOURCES.map((e) => e.label)
    for (const l of ['Free Music Archive', 'ccMixter', 'Free To Use (freetouse.com)', 'FreePD']) {
      expect(labels).toContain(l)
    }
    for (const e of EXCLUDED_SOURCES) {
      expect(e.reason.length).toBeGreaterThan(30)
    }
  })

  it('maps source chips honestly', () => {
    expect(sourceChipFor('internet-archive', null)).toBe('Internet Archive')
    expect(sourceChipFor('openverse', 'jamendo')).toBe('Jamendo · Openverse')
    expect(sourceChipFor('openverse', 'wikimedia_audio')).toBe('Wikimedia · Openverse')
    expect(sourceChipFor('openverse', 'freesound')).toBe('Freesound · Openverse')
    expect(sourceChipFor('openverse', null)).toBe('Openverse')
    expect(sourceChipFor('youtube', null)).toBe('YouTube embed')
  })
})
