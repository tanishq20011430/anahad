/**
 * Temporary browser-side audio cache — bounded, short-lived, memory-only.
 *
 * Policy (enforced in code, disclosed in Privacy & Settings):
 * - Audio blobs live in RAM only. Nothing is written to IndexedDB, Cache
 *   Storage, or any other persistent store. Closing the tab releases all of it.
 * - Hard byte budget (user-selectable: off / 32 MB / 96 MB). LRU eviction.
 * - Every entry has a TTL (default 30 min) and is swept periodically and
 *   before every new prime.
 * - Downloads are small Range requests (default 256 KB) — never whole
 *   playlists; an abandoned preload is aborted through its AbortController.
 * - Primed slices are handed to the MediaSource streaming pipeline (see
 *   mseStream.ts) and released when the track completes or the queue
 *   changes. Hosts that refuse CORS/Range fall back to native streaming.
 * - Host capability memo: if a host refuses CORS/Range (network error, 403,
 *   oversized 200), it is marked non-primeable for the session and we fall
 *   back to plain native streaming for it. No access rules are ever bypassed.
 */

import { CACHE_BUDGET_BYTES, type CacheMode } from '../types'

export interface AudioCacheOptions {
  maxBytes: number
  ttlMs: number
  primeBytes: number
}

export interface CacheStats {
  bytes: number
  entries: number
  maxBytes: number
  primedUrls: string[]
  unavailableHosts: string[]
}

interface CacheEntry {
  blob: Blob
  size: number
  cachedAt: number
  lastUsedAt: number
}

export interface PrimeResult {
  ok: boolean
  /** Present when ok=false — honest machine-readable cause. */
  reason?: 'disabled' | 'host-unavailable' | 'http-error' | 'aborted' | 'oversized'
  status?: number
}

const DEFAULTS: AudioCacheOptions = {
  maxBytes: CACHE_BUDGET_BYTES.standard,
  ttlMs: 30 * 60 * 1000,
  primeBytes: 256 * 1024
}

function hostOf(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

export class AudioBlobCache {
  private maxBytes = DEFAULTS.maxBytes
  private ttlMs = DEFAULTS.ttlMs
  private primeBytes = DEFAULTS.primeBytes
  private enabled = true

  private entries = new Map<string, CacheEntry>()
  private inflight = new Map<string, AbortController>()
  /** Hosts that refused Range/CORS downloads this session (fallback: native stream). */
  private unavailableHosts = new Set<string>()

  configure(mode: CacheMode): void {
    this.maxBytes = CACHE_BUDGET_BYTES[mode]
    this.enabled = mode !== 'off'
    if (!this.enabled) this.clear()
    else this.evictToBudget()
  }

  setPrimeBytes(bytes: number): void {
    this.primeBytes = Math.max(32 * 1024, Math.min(2 * 1024 * 1024, bytes))
  }

  get enabled_(): boolean {
    return this.enabled && this.maxBytes > 0
  }

  stats(): CacheStats {
    let bytes = 0
    for (const e of this.entries.values()) bytes += e.size
    return {
      bytes,
      entries: this.entries.size,
      maxBytes: this.enabled ? this.maxBytes : 0,
      primedUrls: [...this.entries.keys()],
      unavailableHosts: [...this.unavailableHosts]
    }
  }

  canPrime(url: string): boolean {
    return this.enabled_ && !this.unavailableHosts.has(hostOf(url))
  }

  has(url: string): boolean {
    const e = this.entries.get(url)
    return Boolean(e && Date.now() - e.cachedAt <= this.ttlMs)
  }

  /**
   * Download a small leading slice of `url` into memory.
   * Cancels itself if the outer signal aborts; cancels any previous attempt
   * for the same URL first (one in-flight download per URL).
   */
  async prime(url: string, opts: { maxBytes?: number; signal?: AbortSignal } = {}): Promise<PrimeResult> {
    if (!this.enabled_) return { ok: false, reason: 'disabled' }
    const host = hostOf(url)
    if (this.unavailableHosts.has(host)) return { ok: false, reason: 'host-unavailable' }

    this.sweep()
    const existing = this.entries.get(url)
    if (existing) {
      existing.lastUsedAt = Date.now()
      return { ok: true }
    }

    const prev = this.inflight.get(url)
    if (prev) prev.abort()

    const ctrl = new AbortController()
    this.inflight.set(url, ctrl)
    const onOuterAbort = () => ctrl.abort()
    opts.signal?.addEventListener('abort', onOuterAbort, { once: true })

    const cap = Math.min(opts.maxBytes ?? this.primeBytes, this.maxBytes)
    try {
      const res = await fetch(url, {
        signal: ctrl.signal,
        headers: { Range: `bytes=0-${cap - 1}` }
      })
      if (!res.ok && res.status !== 206) {
        if (res.status === 403 || res.status === 405) this.unavailableHosts.add(host)
        return { ok: false, reason: 'http-error', status: res.status }
      }
      // Some servers ignore Range and return 200 with the full body — read
      // at most `cap` bytes then cancel the stream.
      const blob = await readBounded(res, cap, ctrl.signal)
      if (ctrl.signal.aborted) return { ok: false, reason: 'aborted' }
      if (blob.size === 0) return { ok: false, reason: 'http-error', status: res.status }
      if (res.status === 200 && blob.size > cap) {
        // Server ignored Range AND we somehow read more than the cap —
        // treat as non-primeable rather than hoarding unbounded data.
        this.unavailableHosts.add(host)
        return { ok: false, reason: 'oversized' }
      }
      this.insert(url, blob)
      return { ok: true }
    } catch (err) {
      if (ctrl.signal.aborted) return { ok: false, reason: 'aborted' }
      // CORS / network failure — remember the host, native streaming still works.
      this.unavailableHosts.add(host)
      return { ok: false, reason: 'host-unavailable' }
    } finally {
      this.inflight.delete(url)
      opts.signal?.removeEventListener('abort', onOuterAbort)
    }
  }

  cancel(url: string): void {
    this.inflight.get(url)?.abort()
    this.inflight.delete(url)
  }

  cancelAll(): void {
    for (const c of this.inflight.values()) c.abort()
    this.inflight.clear()
  }

  /**
   * The prebuffered leading slice for `url` (or null). Used to seed the
   * MediaSource pipeline for instant start — the blob is appended to the
   * buffer and the SAME file then streams in from the network, so playback
   * never ends early (a pitfall of naive object-URL playback of partial
   * blobs, which we deliberately avoid).
   */
  peekBlob(url: string): Blob | null {
    const e = this.entries.get(url)
    if (!e) return null
    e.lastUsedAt = Date.now()
    // Refresh LRU order.
    this.entries.delete(url)
    this.entries.set(url, e)
    return e.blob
  }

  /** Policy: release one entry (its bytes become collectable immediately). */
  release(url: string): void {
    this.entries.delete(url)
  }

  /** Policy: keep only the given URLs (and what is still downloading). */
  releaseExcept(keep: Iterable<string>): void {
    const keepSet = new Set(keep)
    for (const url of [...this.entries.keys()]) {
      if (!keepSet.has(url)) this.release(url)
    }
  }

  clear(): void {
    for (const url of [...this.entries.keys()]) this.release(url)
    this.entries.clear()
  }

  /** Drop entries past their TTL. Called on an interval + before primes. */
  sweep(): void {
    const now = Date.now()
    for (const [url, e] of this.entries) {
      if (now - e.cachedAt > this.ttlMs) this.release(url)
    }
  }

  private insert(url: string, blob: Blob): void {
    this.entries.delete(url) // re-insert as most-recent
    this.entries.set(url, { blob, size: blob.size, cachedAt: Date.now(), lastUsedAt: Date.now() })
    this.evictToBudget()
  }

  private evictToBudget(): void {
    let total = 0
    for (const e of this.entries.values()) total += e.size
    for (const url of this.entries.keys()) {
      if (total <= this.maxBytes) break
      const e = this.entries.get(url)
      if (!e) break
      total -= e.size
      this.release(url)
    }
  }
}

/** Read at most `cap` bytes from a streaming response, then cancel the rest. */
async function readBounded(res: Response, cap: number, signal?: AbortSignal): Promise<Blob> {
  if (!res.body) {
    // Very old browsers: degrade to reading the whole body and slicing.
    const whole = await res.blob()
    return whole.size <= cap ? whole : whole.slice(0, cap)
  }
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      if (signal?.aborted) break
      const { done, value } = await reader.read()
      if (done) break
      if (value) {
        chunks.push(value)
        total += value.byteLength
        if (total >= cap) break
      }
    }
  } finally {
    void reader.cancel().catch(() => undefined)
  }
  return new Blob(chunks as BlobPart[])
}

/** Singleton used across the app. */
export const audioCache = new AudioBlobCache()
