import { describe, it, expect } from 'vitest'
import { buildProfile, scoreTrack, getRecommendations, describeTaste, WEIGHTS } from '../src/lib/recommend'
import { inferMoods, MOODS, GENRES, LANGUAGES, normalizeLanguageCode } from '../src/config/catalog'
import type { PlayEvent, Track } from '../src/types'

const DAY = 86_400_000

function makeTrack(overrides: Partial<Track> = {}): Track {
  return {
    id: 'internet-archive:item1:file1.mp3',
    source: 'internet-archive',
    identifier: 'item1',
    fileName: 'file1.mp3',
    title: 'Test Song',
    artist: 'Test Artist',
    album: 'Test Album',
    artwork: null,
    durationSec: 180,
    formats: [{ url: 'https://x/f.mp3', fileName: 'f.mp3', label: 'VBR MP3', approxBitrateKbps: 192, sizeBytes: 1000, isLossless: false, mimeType: 'audio/mpeg' }],
    licenseUrl: null,
    language: 'hindi',
    genres: ['bhajan'],
    estimatedMoods: ['devotional'],
    year: 1970,
    itemPage: 'https://archive.org/details/item1',
    collection: 'netlabels',
    ...overrides
  }
}

function makeEvent(track: Track, opts: Partial<PlayEvent> = {}): PlayEvent {
  return { trackId: track.id, track, playedAt: Date.now(), completedRatio: 1, skipped: false, ...opts }
}

describe('buildProfile', () => {
  it('accumulates genre/mood/artist/language weights from completions', () => {
    const t = makeTrack()
    const profile = buildProfile([makeEvent(t)], {})
    expect(profile.genreWeights['bhajan']).toBeGreaterThan(0)
    expect(profile.moodWeights['devotional']).toBeGreaterThan(0)
    expect(profile.artistWeights['test artist']).toBeGreaterThan(0)
    expect(profile.languageWeights['hindi']).toBeGreaterThan(0)
  })

  it('weights recent plays higher than old ones (recency half-life)', () => {
    const t = makeTrack()
    const recent = buildProfile([makeEvent(t, { playedAt: Date.now() - DAY })], {})
    const old = buildProfile([makeEvent(t, { playedAt: Date.now() - 60 * DAY })], {})
    expect(recent.genreWeights['bhajan']).toBeGreaterThan(old.genreWeights['bhajan'])
  })

  it('penalizes skipped tracks (negative artist signal)', () => {
    const t = makeTrack({ artist: 'Skip Me' })
    const profile = buildProfile([makeEvent(t, { skipped: true, completedRatio: 0.05 })], {})
    expect(profile.artistWeights['skip me']).toBeLessThan(0)
  })

  it('boosts signals from liked tracks', () => {
    const t = makeTrack()
    const profile = buildProfile([], { [t.id]: t })
    expect(profile.artistWeights['test artist']).toBeGreaterThan(0)
    expect(profile.likedIds.has(t.id)).toBe(true)
  })
})

describe('inferMoods (keyword-based, always labeled estimated by UI)', () => {
  it('detects sad + devotional from title and subjects', () => {
    const moods = inferMoods('A sad song of tears', ['bhajan'])
    expect(moods).toContain('sad')
    expect(moods).toContain('devotional')
  })
  it('detects romantic hindi keywords', () => {
    const moods = inferMoods('Ishq mein dil pyar', [])
    expect(moods).toContain('romantic')
  })
  it('returns empty for unknown metadata (never fabricates)', () => {
    expect(inferMoods('Completely unrelated words', [])).toEqual([])
  })
  it('every mood id in MOODS is unique', () => {
    const ids = MOODS.map((m) => m.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('scoreTrack', () => {
  it('ranks tracks matching strong listening signals higher', () => {
    const loved = makeTrack({ id: 't1', genres: ['bhajan'], estimatedMoods: ['devotional'], artist: 'Test Artist', language: 'hindi' })
    const other = makeTrack({ id: 't2', genres: ['techno'], estimatedMoods: ['energetic'], artist: 'Someone Else', language: 'english' })
    const t = makeTrack()
    const profile = buildProfile([makeEvent(t)], {})
    const s1 = scoreTrack(loved, profile, null)
    const s2 = scoreTrack(other, profile, null)
    expect(s1.score).toBeGreaterThan(s2.score)
    expect(s1.reasons.length).toBeGreaterThan(0)
  })

  it('explains mood affinity (sad songs scenario)', () => {
    const sadHistory = [1, 2, 3].map((i) =>
      makeEvent(makeTrack({ id: `s${i}`, title: `Sad song ${i}`, estimatedMoods: ['sad'], genres: [] }))
    )
    const profile = buildProfile(sadHistory, {})
    const candidate = makeTrack({ id: 'c1', title: 'Lonely tears', estimatedMoods: ['sad'], genres: [] })
    const s = scoreTrack(candidate, profile, null)
    expect(s.parts.mood).toBeGreaterThan(0)
    expect(s.reasons.some((r) => r.toLowerCase().includes('mood') || r.toLowerCase().includes('sad'))).toBe(true)
  })

  it('zeroes disliked tracks', () => {
    const t = makeTrack({ id: 'bad' })
    const profile = buildProfile([], {}, ['bad'])
    expect(scoreTrack(t, profile, null).score).toBe(0)
  })

  it('penalizes recently played tracks', () => {
    const t = makeTrack()
    const history = [makeEvent(t)]
    const withRecent = buildProfile(history, {})
    const withoutRecent = buildProfile([], {})
    const sRecent = scoreTrack(t, withRecent, null)
    const sFresh = scoreTrack(t, withoutRecent, null)
    if (sFresh.score > 0) {
      expect(sRecent.score).toBeLessThanOrEqual(sFresh.score)
    }
  })

  it('weights sum to 1 for transparency', () => {
    const sum = WEIGHTS.genre + WEIGHTS.mood + WEIGHTS.artist + WEIGHTS.language + WEIGHTS.likeAffinity + WEIGHTS.popularity
    expect(sum).toBeCloseTo(1.0, 5)
  })
})

describe('getRecommendations', () => {
  it('respects per-artist diversity cap', () => {
    const profile = buildProfile([], {})
    const candidates = Array.from({ length: 6 }, (_, i) =>
      makeTrack({ id: `x${i}`, artist: 'Prolific Artist', title: `Song ${i}` })
    )
    const recs = getRecommendations(candidates, profile, { perArtistCap: 2, limit: 10 })
    expect(recs.filter((r) => r.track.artist === 'Prolific Artist')).toHaveLength(2)
  })

  it('excludes excluded ids', () => {
    const profile = buildProfile([], {})
    const candidates = [makeTrack({ id: 'a' }), makeTrack({ id: 'b' })]
    const recs = getRecommendations(candidates, profile, { excludeIds: new Set(['a']), limit: 10 })
    expect(recs.find((r) => r.track.id === 'a')).toBeUndefined()
    expect(recs.find((r) => r.track.id === 'b')).toBeDefined()
  })

  it('demotes unplayable tracks below playable ones (never fabricates playback)', () => {
    const profile = buildProfile([], {})
    const playable = makeTrack({ id: 'playable', formats: [makeTrack().formats[0]] })
    const unplayable = makeTrack({ id: 'unplayable', formats: [] })
    const recs = getRecommendations([unplayable, playable], profile, { limit: 10 })
    expect(recs[0].track.id).toBe('playable')
  })

  it('honors limit', () => {
    const profile = buildProfile([], {})
    const candidates = Array.from({ length: 20 }, (_, i) => makeTrack({ id: `n${i}`, artist: `A${i}` }))
    expect(getRecommendations(candidates, profile, { limit: 5 })).toHaveLength(5)
  })
})

describe('describeTaste', () => {
  it('returns top human-readable signals', () => {
    const t = makeTrack()
    const profile = buildProfile([makeEvent(t)], {})
    const labels = describeTaste(profile)
    expect(labels).toContain('bhajan')
    expect(labels).toContain('devotional')
  })
})

describe('catalog config sanity', () => {
  it('has the user-required genres', () => {
    const ids = GENRES.map((g) => g.id)
    for (const required of ['bollywood', 'hindi-indie', 'indian-classical', 'hindustani-classical', 'carnatic', 'bhajans', 'devotional', 'ghazals', 'sufi', 'punjabi', 'folk', 'pop', 'rock', 'hip-hop', 'electronic', 'jazz', 'blues', 'classical', 'lo-fi', 'ambient', 'instrumental', 'acoustic', 'regional-indian']) {
      expect(ids).toContain(required)
    }
  })
  it('has the user-required moods', () => {
    const ids = MOODS.map((m) => m.id)
    for (const required of ['sad', 'happy', 'romantic', 'peaceful', 'devotional', 'motivational', 'energetic', 'relaxing', 'focus', 'workout', 'nostalgic', 'melancholic', 'sleep']) {
      expect(ids).toContain(required)
    }
  })
  it('supports the required languages', () => {
    const ids = LANGUAGES.map((l) => l.id)
    for (const required of ['hindi', 'english', 'punjabi', 'sanskrit', 'tamil', 'telugu', 'bengali', 'marathi', 'gujarati', 'malayalam', 'kannada']) {
      expect(ids).toContain(required)
    }
  })
  it('normalizes archive.org language codes', () => {
    expect(normalizeLanguageCode('hin')).toBe('hindi')
    expect(normalizeLanguageCode('pan')).toBe('punjabi')
    expect(normalizeLanguageCode('zzz')).toBeNull()
  })
})
