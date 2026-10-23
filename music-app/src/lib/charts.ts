/**
 * Music charts — Apple Music's public "most played" feeds (keyless, updated
 * daily per country), played through YouTube.
 *
 * Why Apple: YouTube's own chart playlists can't be read through the Piped
 * relays (they return empty track lists — verified 2026-10-23), and no keyless
 * source publishes YouTube likes. Apple's RSS feeds are the most reliable free
 * chart data, but they send no CORS headers, so:
 * - web: fetched through a same-origin proxy (/api/charts → vercel.json
 *   rewrite in production, Vite proxy in dev)
 * - Android app: fetched natively with CapacitorHttp (no CORS in native code)
 *
 * Chart entries carry no audio. Each becomes a Track with a `lookup` query
 * that resolve.ts turns into the best-matching YouTube video at play time.
 */

import { CapacitorHttp } from '@capacitor/core'
import { isNativeApp } from './nativeMedia'
import type { Track } from '../types'

const APPLE_FEEDS = 'https://rss.marketingtools.apple.com/api/v2'
const PROXY_PREFIX = '/api/charts'
const CACHE_MS = 30 * 60 * 1000
const COUNTRY_KEY = 'anahad.chartCountry'

export const CHART_COUNTRIES = [
  { code: 'in', label: 'India' },
  { code: 'us', label: 'United States' },
  { code: 'gb', label: 'United Kingdom' },
  { code: 'ca', label: 'Canada' },
  { code: 'au', label: 'Australia' },
  { code: 'ae', label: 'UAE' }
] as const

export type ChartCountry = (typeof CHART_COUNTRIES)[number]['code']

export interface ChartEntry {
  rank: number
  track: Track
  /** ISO date (YYYY-MM-DD) from the feed. */
  releaseDate: string | null
  /** Feed genres, minus the generic "Music". */
  genres: string[]
}

export interface Chart {
  country: ChartCountry
  /** When Apple last updated the feed. */
  updated: Date | null
  entries: ChartEntry[]
}

interface AppleFeedResult {
  id: string
  name: string
  artistName: string
  artworkUrl100?: string
  releaseDate?: string
  url?: string
  genres?: { name: string }[]
}

interface AppleFeed {
  feed?: { updated?: string; results?: AppleFeedResult[] }
}

export class ChartsUnavailableError extends Error {
  /** True when retrying can't help (e.g. the host has no proxy). */
  readonly permanent: boolean

  constructor(message = 'Charts are unavailable right now', permanent = false) {
    super(message)
    this.permanent = permanent
    this.name = 'ChartsUnavailableError'
  }
}

/** Remembered country choice (per device). */
export function getChartCountry(): ChartCountry {
  try {
    const v = localStorage.getItem(COUNTRY_KEY)
    if (v && CHART_COUNTRIES.some((c) => c.code === v)) return v as ChartCountry
  } catch {
    /* storage blocked — use the default */
  }
  return 'in'
}

export function setChartCountry(code: ChartCountry): void {
  try {
    localStorage.setItem(COUNTRY_KEY, code)
  } catch {
    /* non-essential */
  }
}

/** Removes "(feat. …)" / "[feat. …]" — YouTube titles rarely match them exactly. */
function stripFeat(title: string): string {
  return title.replace(/\s*[([](feat\.?|ft\.?|featuring)\s[^)\]]*[)\]]/gi, '').trim()
}

export function appleResultToEntry(r: AppleFeedResult, rank: number): ChartEntry {
  const title = r.name.trim()
  const artist = r.artistName.trim()
  const genres = (r.genres ?? []).map((g) => g.name).filter((g) => g && g !== 'Music')
  const track: Track = {
    id: `youtube:chart-${r.id}`,
    source: 'youtube',
    identifier: `chart-${r.id}`,
    fileName: '',
    title,
    artist,
    album: '',
    // Feed art is 100px; Apple's image service serves any size from the same path.
    artwork: r.artworkUrl100 ? r.artworkUrl100.replace(/\/\d+x\d+bb\./, '/600x600bb.') : null,
    durationSec: null,
    formats: [],
    embed: null,
    lookup: { query: `${stripFeat(title)} ${artist}` },
    licenseUrl: 'https://www.youtube.com/t/terms',
    licenseName: 'YouTube Terms of Service (official embed)',
    language: null,
    genres,
    estimatedMoods: [],
    year: r.releaseDate ? Number(r.releaseDate.slice(0, 4)) || null : null,
    itemPage: r.url ?? 'https://music.apple.com',
    collection: null
  }
  return { rank, track, releaseDate: r.releaseDate ?? null, genres }
}

export function parseAppleFeed(json: AppleFeed, country: ChartCountry): Chart {
  const results = json.feed?.results
  if (!Array.isArray(results)) throw new ChartsUnavailableError('Chart feed had an unexpected format')
  const updated = json.feed?.updated ? new Date(json.feed.updated) : null
  return {
    country,
    updated: updated && !Number.isNaN(updated.getTime()) ? updated : null,
    entries: results.filter((r) => r && r.id && r.name).map((r, i) => appleResultToEntry(r, i + 1))
  }
}

/**
 * Apple's feed host intermittently answers 502 or stalls (seen repeatedly on
 * 2026-10-23, independent of client), so transient failures are retried.
 */
async function getFeedJson(path: string, signal?: AbortSignal): Promise<AppleFeed> {
  const ATTEMPTS = 3
  let lastErr: unknown
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      return await getFeedJsonOnce(path, signal)
    } catch (err) {
      lastErr = err
      if (signal?.aborted || (err instanceof ChartsUnavailableError && err.permanent)) throw err
      if (attempt < ATTEMPTS) await new Promise((r) => setTimeout(r, 700 * attempt))
    }
  }
  throw lastErr instanceof ChartsUnavailableError ? lastErr : new ChartsUnavailableError()
}

async function getFeedJsonOnce(path: string, signal?: AbortSignal): Promise<AppleFeed> {
  if (isNativeApp) {
    const res = await CapacitorHttp.get({ url: `${APPLE_FEEDS}${path}`, connectTimeout: 12_000, readTimeout: 12_000 })
    if (res.status !== 200) throw new ChartsUnavailableError(`Chart feed returned HTTP ${res.status}`)
    return (typeof res.data === 'string' ? JSON.parse(res.data) : res.data) as AppleFeed
  }
  const res = await fetch(`${PROXY_PREFIX}${path}`, { signal, headers: { Accept: 'application/json' } })
  // Static hosts without the proxy (e.g. GitHub Pages) answer with index.html or 404.
  if (res.ok && !(res.headers.get('content-type') ?? '').includes('json')) {
    throw new ChartsUnavailableError('Charts need the /api/charts proxy (works on Vercel and in the Android app)', true)
  }
  if (res.status === 404) throw new ChartsUnavailableError('Charts need the /api/charts proxy (works on Vercel and in the Android app)', true)
  if (!res.ok) throw new ChartsUnavailableError(`Chart feed returned HTTP ${res.status}`)
  return (await res.json()) as AppleFeed
}

const cache = new Map<string, { at: number; chart: Promise<Chart> }>()

/** Top 100 most-played songs for a country (cached 30 min, single-flight). */
export function fetchTopSongs(country: ChartCountry, signal?: AbortSignal): Promise<Chart> {
  const hit = cache.get(country)
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.chart
  const chart = getFeedJson(`/${country}/music/most-played/100/songs.json`, signal).then((json) => parseAppleFeed(json, country))
  cache.set(country, { at: Date.now(), chart })
  chart.catch(() => cache.delete(country))
  return chart
}

/** Chart songs released within `days` of the feed's update time, in chart order. */
export function newReleases(chart: Chart, days: number): ChartEntry[] {
  const ref = (chart.updated ?? new Date()).getTime()
  return chart.entries.filter((e) => {
    if (!e.releaseDate) return false
    const t = Date.parse(e.releaseDate)
    return Number.isFinite(t) && ref - t <= days * 86_400_000 && t <= ref + 86_400_000
  })
}

/** Genres present in the chart, most common first. */
export function chartGenres(chart: Chart, min = 3): string[] {
  const counts = new Map<string, number>()
  for (const e of chart.entries) for (const g of e.genres) counts.set(g, (counts.get(g) ?? 0) + 1)
  return [...counts.entries()].filter(([, n]) => n >= min).sort((a, b) => b[1] - a[1]).map(([g]) => g)
}

/** Test hook. */
export function resetChartsCache(): void {
  cache.clear()
}
