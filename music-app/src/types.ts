/**
 * Anahad — shared domain types.
 *
 * The capability model is central: every track and provider records what it
 * can actually do. The UI only ever renders controls backed by real
 * capabilities and never fabricates playback, bitrates, or licenses.
 */

export type SourceId = 'internet-archive' | 'youtube' | 'spotify'

/** A concrete, playable audio file derivative with verifiable metadata. */
export interface AudioFormat {
  /** Direct media URL (authorized by the source). */
  url: string
  /** Original file name at the source. */
  fileName: string
  /** Human label, e.g. "VBR MP3", "64Kbps MP3", "FLAC". */
  label: string
  /** Average bitrate computed from file size + duration. Approximate for VBR. */
  approxBitrateKbps: number | null
  sizeBytes: number | null
  isLossless: boolean
  mimeType: string
}

export interface ProviderCapabilities {
  searchableMetadata: boolean
  artworkAvailable: boolean
  directAudio: boolean
  embeddedPlayback: boolean
  externalLinkOnly: boolean
  licenseInfoAvailable: boolean
  qualityMetadataAvailable: boolean
}

export interface Track {
  /** Stable unique id: `${source}:${identifier}:${fileName}` */
  id: string
  source: SourceId
  /** Source item identifier (e.g. archive.org item id). */
  identifier: string
  fileName: string
  title: string
  artist: string
  album: string
  artwork: string | null
  durationSec: number | null
  /** All playable derivatives, ordered best-first. Empty = not directly playable. */
  formats: AudioFormat[]
  licenseUrl: string | null
  language: string | null
  /** Raw subject tags from the source (may be empty — never invented). */
  genres: string[]
  /** Keyword-inferred moods. Always flagged as "estimated" in the UI. */
  estimatedMoods: string[]
  year: number | null
  /** Public item page at the source, for attribution. */
  itemPage: string
  collection: string | null
}

export interface AlbumResult {
  identifier: string
  source: SourceId
  title: string
  creator: string
  year: number | null
  artwork: string
  downloads: number
  subjects: string[]
  language: string | null
  licenseUrl: string | null
  itemPage: string
}

export interface SearchOptions {
  query?: string
  genre?: string
  mood?: string
  language?: string
  collection?: string
  /** Exact creator/artist field search (sanitized internally). */
  creator?: string
  page?: number
  rows?: number
  playableOnly?: boolean
  sort?: 'relevance' | 'downloads' | 'date'
  signal?: AbortSignal
}

export interface SearchResponse {
  albums: AlbumResult[]
  total: number
  page: number
  rows: number
}

export interface MusicProvider {
  id: SourceId
  label: string
  attribution: string
  capabilities: ProviderCapabilities
  searchAlbums(options: SearchOptions): Promise<SearchResponse>
  /** Fetch all playable tracks of an item (album). */
  getItemTracks(identifier: string, signal?: AbortSignal): Promise<Track[]>
}

/* ---------------------------------- Library ---------------------------------- */

export interface Playlist {
  id: string
  name: string
  trackIds: string[]
  /** Track metadata snapshot so playlists survive offline metadata churn. */
  tracks: Track[]
  createdAt: number
  updatedAt: number
}

export interface PlayEvent {
  trackId: string
  /** Track snapshot at play time (title/artist/genres/etc). */
  track: Track
  playedAt: number
  /** 0..1 — how much of the track was heard. */
  completedRatio: number
  skipped: boolean
}

export type RepeatMode = 'off' | 'one' | 'all'

export type QualityPreference = 'auto' | 'highest' | 'data-saver' | 'standard' | 'high' | 'lossless'

/* -------------------------------- Embeds ---------------------------------- */

export interface ExternalEmbed {
  source: 'youtube' | 'spotify'
  /** Canonical id used by the official embed player. */
  embedId: string
  originalUrl: string
  title: string
}

export interface Recommendation {
  track: Track
  score: number
  /** Explainable reasons, e.g. "Because you often listen to bhajans". */
  reasons: string[]
}
