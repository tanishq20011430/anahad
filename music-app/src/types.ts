/**
 * Anahad — shared domain types.
 *
 * The capability model is central: every track and provider records what it
 * can actually do. The UI only ever renders controls backed by real
 * capabilities and never fabricates playback, bitrates, or licenses.
 */

/**
 * Connected sources.
 * - `youtube`  — search via community scraper APIs (Piped), playback through
 *                the official YouTube IFrame Player API.
 * - `audius`   — official keyless API, direct full-length audio (CORS+Range).
 * - `radio`    — Radio Browser open directory, direct live streams.
 * - `openverse`— CC tracks aggregated by the Openverse API.
 * - `mixcloud` — keyless search API, playback via the official widget embed.
 * - `spotify`  — paste-link official embed only (no keyless search API).
 */
export type SourceId = 'youtube' | 'audius' | 'radio' | 'openverse' | 'mixcloud' | 'spotify'

/** A concrete, playable audio file/URL with verifiable metadata. */
export interface AudioFormat {
  /** Direct media URL (authorized by the source). */
  url: string
  /** Original file/stream name at the source. */
  fileName: string
  /** Human label, e.g. "MP3 128 kbps", "AAC 64 kbps", "MP3 (original)". */
  label: string
  /** Bitrate when the source provides it. Never computed or invented. */
  approxBitrateKbps: number | null
  sizeBytes: number | null
  isLossless: boolean
  mimeType: string
}

/** Embedded player reference for sources that play through official widgets. */
export interface TrackEmbed {
  kind: 'youtube' | 'mixcloud'
  /** YouTube video id, or Mixcloud cloudcast key ("/user/slug/"). */
  id: string
}

export interface ProviderCapabilities {
  searchableMetadata: boolean
  artworkAvailable: boolean
  /** Streams real audio directly through the app's own transport. */
  directAudio: boolean
  /** Plays through an official embedded player (provider controls transport). */
  embeddedPlayback: boolean
  externalLinkOnly: boolean
  licenseInfoAvailable: boolean
  qualityMetadataAvailable: boolean
}

export interface Track {
  /** Stable unique id: `${source}:${identifier}` (plus file name when useful). */
  id: string
  source: SourceId
  /** Source item identifier (e.g. Openverse uuid, Audius id, station uuid). */
  identifier: string
  fileName: string
  title: string
  artist: string
  album: string
  artwork: string | null
  durationSec: number | null
  /** True for live streams (no duration, no seek). */
  isLive?: boolean
  /** All playable derivatives, ordered best-first. Empty = not directly playable. */
  formats: AudioFormat[]
  /** Official embed reference when playback goes through the provider's player. */
  embed: TrackEmbed | null
  /**
   * Chart entry with no audio of its own: resolved at play time by searching
   * YouTube for this query (see lib/resolve.ts). Never set on regular tracks.
   */
  lookup?: { query: string } | null
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

export interface SearchOptions {
  query?: string
  /** Source-native tag for tag-first providers (Openverse). */
  tag?: string
  /** Audius genre constant, e.g. "Electronic", "Devotional", "Lo-Fi". */
  audiusGenre?: string
  /** Audius mood constant, e.g. "Peaceful", "Energizing". */
  audiusMood?: string
  /** Radio Browser tag search (e.g. "jazz", "bhajan"). */
  radioTag?: string
  /** Radio Browser station-name-contains search. */
  radioName?: string
  /** Radio Browser language search (lowercase name, e.g. "hindi"). */
  radioLanguage?: string
  /** Restrict the search to these sources (default: all enabled). */
  providers?: SourceId[]
  page?: number
  rows?: number
  signal?: AbortSignal
}

/** Track-first search response (every provider in v3 is track-shaped). */
export interface TrackSearchResponse {
  tracks: Track[]
  total: number
}

export interface SourceDegradation {
  source: SourceId
  /** Honest, user-displayable reason (quota, CORS, outage…). */
  message: string
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
  searchTracks(options: SearchOptions): Promise<TrackSearchResponse>
  /** Source-provided related tracks, when the API offers them. */
  getRelatedTracks?(track: Track, signal?: AbortSignal): Promise<Track[]>
  /** Re-fetch full playable data for a track that carries a reference only. */
  resolveTrack?(track: Track, signal?: AbortSignal): Promise<Track>
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

/** Official embed rendered from a pasted link (Search page tool). */
export interface ExternalEmbed {
  source: 'youtube' | 'spotify' | 'mixcloud'
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
