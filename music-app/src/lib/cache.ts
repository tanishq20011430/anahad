/**
 * Bounded in-memory caches to keep memory predictable and respect providers.
 * - LRUCache: eviction by recency, optional TTL, hard entry cap.
 */

export class LRUCache<V> {
  private max: number
  private ttlMs: number
  private map: Map<string, { value: V; at: number }>

  constructor(max = 200, ttlMs = 10 * 60 * 1000) {
    this.max = max
    this.ttlMs = ttlMs
    this.map = new Map()
  }

  get(key: string): V | undefined {
    const hit = this.map.get(key)
    if (!hit) return undefined
    if (Date.now() - hit.at > this.ttlMs) {
      this.map.delete(key)
      return undefined
    }
    // refresh recency
    this.map.delete(key)
    this.map.set(key, hit)
    return hit.value
  }

  set(key: string, value: V): void {
    if (this.map.has(key)) this.map.delete(key)
    this.map.set(key, { value, at: Date.now() })
    while (this.map.size > this.max) {
      const oldest = this.map.keys().next().value as string | undefined
      if (oldest === undefined) break
      this.map.delete(oldest)
    }
  }

  has(key: string): boolean {
    return this.get(key) !== undefined
  }

  clear(): void {
    this.map.clear()
  }

  get size(): number {
    return this.map.size
  }
}
