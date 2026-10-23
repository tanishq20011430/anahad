/**
 * Piped client — keyless YouTube search via community "scraper-backed" APIs.
 *
 * What this is, honestly:
 * - Piped instances run open-source servers that query YouTube and expose a
 *   JSON API with permissive CORS. They are the scraping layer; this app
 *   only consumes their public JSON.
 * - Playback NEVER uses extracted stream URLs. Every result is played through
 *   the official YouTube IFrame Player API (provider-controlled transport).
 *   No ad circumvention, no stream extraction, no API keys.
 *
 * Reliability model:
 * - A small pool of instances is tried in order with a per-request timeout.
 * - The first healthy instance is remembered (sticky) with a cooldown for
 *   instances that fail — repeated requests don't pay the failover cost.
 * - If every instance fails, a PipedUnavailableError is thrown and the source
 *   degrades honestly (other sources are unaffected).
 */

import { LRUCache } from '../cache'

const REQUEST_TIMEOUT_MS = 10_000
/** A failed instance sits out for this long before being retried. */
const COOLDOWN_MS = 2 * 60 * 1000
/** Sticky-success TTL: after this, the next request re-checks the top choice. */
const STICKY_MS = 10 * 60 * 1000

/**
 * Instance pool. Every entry below was probed from a browser-like client
 * (HTTP 200 + `Access-Control-Allow-Origin: *`) on 2026-10-23.
 */
export const PIPED_INSTANCES = ['api.piped.private.coffee', 'pipedapi.ducks.party']

export class PipedUnavailableError extends Error {
  constructor(message = 'YouTube search relays (Piped) are unreachable right now') {
    super(message)
    this.name = 'PipedUnavailableError'
  }
}

interface Health {
  stickyUntil: number
  cooldownUntil: number
}

const health = new Map<string, Health>()
const searchCache = new LRUCache<unknown>(80, 10 * 60 * 1000)

function order(): string[] {
  const now = Date.now()
  return [...PIPED_INSTANCES].sort((a, b) => {
    const ha = health.get(a)
    const hb = health.get(b)
    const aSticky = ha && ha.stickyUntil > now ? 1 : 0
    const bSticky = hb && hb.stickyUntil > now ? 1 : 0
    if (aSticky !== bSticky) return bSticky - aSticky
    const aCool = ha && ha.cooldownUntil > now ? 1 : 0
    const bCool = hb && hb.cooldownUntil > now ? 1 : 0
    return aCool - bCool
  })
}

async function fetchFrom(instance: string, path: string, signal?: AbortSignal): Promise<unknown> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(new DOMException('timeout', 'TimeoutError')), REQUEST_TIMEOUT_MS)
  const onOuterAbort = () => ctrl.abort()
  signal?.addEventListener('abort', onOuterAbort, { once: true })
  try {
    const res = await fetch(`https://${instance}${path}`, {
      signal: ctrl.signal,
      headers: { Accept: 'application/json' }
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return (await res.json()) as unknown
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onOuterAbort)
  }
}

/** GET a Piped path with instance failover, sticky health and error typing. */
export async function pipedGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  let lastMessage = ''
  for (const instance of order()) {
    const h = health.get(instance)
    if (h && h.cooldownUntil > Date.now()) continue
    try {
      const data = (await fetchFrom(instance, path, signal)) as T
      health.set(instance, { stickyUntil: Date.now() + STICKY_MS, cooldownUntil: 0 })
      return data
    } catch (err) {
      if (signal?.aborted) throw err
      health.set(instance, { stickyUntil: 0, cooldownUntil: Date.now() + COOLDOWN_MS })
      lastMessage = err instanceof Error ? err.message : 'failed'
    }
  }
  throw lastMessage
    ? new PipedUnavailableError(`YouTube search relays unavailable (${lastMessage})`)
    : new PipedUnavailableError()
}

/** Cached variant — identical queries within the TTL share one network call. */
export async function pipedGetCached<T>(path: string, signal?: AbortSignal): Promise<T> {
  const cached = searchCache.get(path)
  if (cached !== undefined) return cached as T
  const data = await pipedGet<T>(path, signal)
  searchCache.set(path, data)
  return data
}

/** Test/verification hook — clears memoized instance health + cache. */
export function resetPipedClient(): void {
  health.clear()
  searchCache.clear()
}
