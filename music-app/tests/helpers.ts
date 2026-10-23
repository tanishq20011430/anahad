/** Shared Track fixtures for tests — multi-source aware. */

import type { Track, SourceId } from '../src/types'

export function makeTrack(i: number = 1, overrides: Partial<Track> = {}): Track {
  const source = (overrides.source ?? 'openverse') as SourceId
  return {
    id: overrides.id ?? `${source}:item${i}`,
    source,
    identifier: overrides.identifier ?? `item${i}`,
    fileName: `file${i}.mp3`,
    title: `Song ${i}`,
    artist: `Artist ${i % 3}`,
    album: `Album ${i}`,
    artwork: null,
    durationSec: 100 + i,
    formats: [
      {
        url: `https://storage.example.com/download/item${i}/file${i}.mp3`,
        fileName: `file${i}.mp3`,
        label: '128Kbps MP3',
        approxBitrateKbps: 128,
        sizeBytes: 1000,
        isLossless: false,
        mimeType: 'audio/mpeg'
      }
    ],
    embed: null,
    licenseUrl: null,
    language: null,
    genres: [],
    estimatedMoods: [],
    year: null,
    itemPage: `https://example.com/item${i}`,
    collection: null,
    ...overrides
  } as Track
}

/** A YouTube-shaped track (official-embed transport, no direct formats). */
export function makeYtTrack(i: number, overrides: Partial<Track> = {}): Track {
  return makeTrack(i, {
    source: 'youtube',
    identifier: `vid${i}`,
    formats: [],
    embed: { kind: 'youtube', id: `vid${i}` },
    durationSec: 200 + i,
    fileName: '',
    collection: '/channel/x',
    ...overrides
  })
}
