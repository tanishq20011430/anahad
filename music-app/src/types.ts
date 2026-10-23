/**
 * Anahad — shared domain types.
 *
 * The capability model is central: every track and provider records what it
 * can actually do. The UI only ever renders controls backed by real
 * capabilities and never fabricates playback, bitrates, or licenses.
 */

/**
 * Connected sources. `youtube`/`spotify` remain embed-only (official iframes,
 * provider-controlled transport). All others stream real audio directly.
 */
export type SourceId = 'internet-archive' | 'openverse' | 'youtube' | 'spotify'

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
  /** Source item identifier (e.g. archive.org item id or Openverse uuid). */
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
  /** Human license label when the source provides one verbatim (never invented). */
  licenseName?: string | null
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
  /** Source-native tag for track-first providers (e.g. Openverse tag). */
  tag?: string
  /** Restrict the search to these sources (default: all enabled). */
  providers?: SourceId[]
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

/** Track-first search response (Openverse and friends). */
export interface TrackSearchResponse {
  tracks: Track[]
  total: number
}

export interface SourceDegradation {
  source: SourceId
  /** Honest, user-displayable reason (quota, CORS, outage…). */
  message: string
}

export interface SearchResponse {
  albums: AlbumResult[]
  total: number
  page: number
  rows: number
  /** Sources that failed or were skipped during this search (empty = all healthy). */
  degraded?: SourceDegradation[]
}

export interface UnifiedTrackSearchResponse {
  tracks: Track[]
  total: number
  degraded?: SourceDegradation[]
}

export interface MusicProvider {
  id: SourceId
  label: string
  /** Shown under tracks, e.g. "Jamendo · via Openverse". */
  sourceLabel: string
  attribution: string
  homeUrl: string
  capabilities: ProviderCapabilities
  /** Whether this provider participates in multi-source search by default. */
  enabledByDefault: boolean
  searchAlbums(options: SearchOptions): Promise<SearchResponse>
  /** Track-first search — present on providers whose catalog is track-shaped. */
  searchTracks?(options: SearchOptions): Promise<TrackSearchResponse>
  /** Fetch all playable tracks of an item (album / single-track resource). */
  getItemTracks(identifier: string, signal?: AbortSignal): Promise<Track[]>
  /** Source-provided related tracks, when the API offers them. */
  getRelatedTracks?(track: Track, signal?: AbortSignal): Promise<Track[]>
}

export type CacheMode = 'off' | 'small' | 'standard'

export const CACHE_BUDGET_BYTES: Record<CacheMode, number> = {
  off: 0,
  small: 32 * 1024 * 1024,
  standard: 96 * 1024 * 1024
}

export const CACHE_BUDGET_LABEL: Record<CacheMode, string> = {
  off: 'Off',
  small: 'Small (32 MB)',
  standard: 'Standard (96 MB)'
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
