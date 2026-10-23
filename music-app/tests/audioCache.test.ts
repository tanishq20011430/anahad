import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { AudioBlobCache } from '../src/lib/audioCache'

function jsonResponse(status: number, body: ArrayBuffer, headers: Record<string, string> = {}): Response {
  return new Response(status === 416 ? null : body, {
    status,
    headers: { 'content-type': 'audio/mpeg', ...headers }
  })
}

function bytes(n: number, fill = 1): ArrayBuffer {
  const arr = new Uint8Array(n)
  arr.fill(fill)
  return arr.buffer
}

describe('AudioBlobCache — bounded temporary audio storage', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
        const range = ((init?.headers as Record<string, string> | undefined)?.Range as string | undefined) ?? ''
        void url
        if (range.includes('bytes=0-')) return jsonResponse(206, bytes(262144), { 'content-range': 'bytes 0-262143/1048576' })
        return jsonResponse(200, bytes(1024))
      })
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('primes a URL and reports it via stats/has/peekBlob', async () => {
    const c = new AudioBlobCache()
    const res = await c.prime('https://host.example/a.mp3')
    expect(res.ok).toBe(true)
    expect(c.has('https://host.example/a.mp3')).toBe(true)
    const blob = c.peekBlob('https://host.example/a.mp3')
    expect(blob).not.toBeNull()
    expect(blob!.size).toBe(262144)
    expect(c.stats().bytes).toBe(262144)
  })

  it('sends a Range request bounded to the cap', async () => {
    const c = new AudioBlobCache()
    c.setPrimeBytes(64 * 1024)
    await c.prime('https://host.example/b.mp3')
    const calls = (fetch as ReturnType<typeof vi.fn>).mock.calls as [string, RequestInit?][]
    const hd = (calls[0][1]?.headers ?? {}) as Record<string, string>
    expect(hd.Range).toBe('bytes=0-65535')
  })

  it('evicts LRU entries when the byte budget is exceeded', async () => {
    const c = new AudioBlobCache()
    // budget small → configure('off' is 0) — use direct maxBytes via configure mode 'small' then shrink manually
    c.configure('small') // 32 MB — too big for the test; set custom via prime cap instead
    // shrink budget by priming with tiny maxBytes and clearing stats — instead test eviction by inserting 3 slices into a tiny cache:
    const tiny = new AudioBlobCache()
    ;(tiny as unknown as { maxBytes: number }).maxBytes = 300 * 1024
    await tiny.prime('https://h.example/1.mp3') // 256KB
    await tiny.prime('https://h.example/2.mp3') // 256KB → evicts 1
    await tiny.prime('https://h.example/3.mp3') // 256KB → evicts 2
    expect(tiny.has('https://h.example/1.mp3')).toBe(false)
    expect(tiny.has('https://h.example/2.mp3')).toBe(false)
    expect(tiny.has('https://h.example/3.mp3')).toBe(true)
    expect(tiny.stats().bytes).toBeLessThanOrEqual(300 * 1024)
  })

  it('respects cacheMode off (disabled)', async () => {
    const c = new AudioBlobCache()
    c.configure('off')
    const res = await c.prime('https://h.example/x.mp3')
    expect(res.ok).toBe(false)
    expect(res.reason).toBe('disabled')
    expect(c.stats().maxBytes).toBe(0)
  })

  it('sweeps entries past the TTL', async () => {
    vi.useFakeTimers()
    const c = new AudioBlobCache()
    const p = c.prime('https://h.example/ttl.mp3')
    await vi.advanceTimersByTimeAsync(10)
    await p
    expect(c.has('https://h.example/ttl.mp3')).toBe(true)
    await vi.advanceTimersByTime(31 * 60 * 1000)
    c.sweep()
    expect(c.has('https://h.example/ttl.mp3')).toBe(false)
    expect(c.stats().bytes).toBe(0)
  })

  it('abandons an in-flight download when prime is re-requested (single flight)', async () => {
    const c = new AudioBlobCache()
    const first = c.prime('https://h.example/sf.mp3')
    const second = c.prime('https://h.example/sf.mp3')
    const [r1, r2] = await Promise.all([first, second])
    // one of the two was aborted or superseded — exactly one entry lands
    expect(r1.ok || r2.ok).toBe(true)
    expect(c.has('https://h.example/sf.mp3')).toBe(true)
    expect(c.stats().entries).toBe(1)
  })

  it('marks a host unavailable after 403 and falls back (native streaming)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(403, bytes(10))))
    const c = new AudioBlobCache()
    const r1 = await c.prime('https://locked.example/a.mp3')
    expect(r1.ok).toBe(false)
    expect(r1.reason).toBe('http-error')
    // second attempt short-circuits without touching the network
    const r2 = await c.prime('https://locked.example/b.mp3')
    expect(r2.ok).toBe(false)
    expect(r2.reason).toBe('host-unavailable')
    expect(c.stats().unavailableHosts).toContain('locked.example')
  })

  it('marks a host unavailable on network/CORS failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('Failed to fetch (CORS)')
    }))
    const c = new AudioBlobCache()
    const r = await c.prime('https://corsfail.example/a.mp3')
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('host-unavailable')
  })

  it('rejects oversized 200 responses that ignore Range', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, bytes(2 * 1024 * 1024))))
    const c = new AudioBlobCache()
    const r = await c.prime('https://greedy.example/a.mp3')
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('oversized')
    expect(c.has('https://greedy.example/a.mp3')).toBe(false)
  })

  it('releaseExcept keeps only policy URLs; clear empties everything', async () => {
    const c = new AudioBlobCache()
    await c.prime('https://h.example/keep.mp3')
    await c.prime('https://h.example/drop.mp3')
    c.releaseExcept(['https://h.example/keep.mp3'])
    expect(c.has('https://h.example/keep.mp3')).toBe(true)
    expect(c.has('https://h.example/drop.mp3')).toBe(false)
    c.clear()
    expect(c.stats().entries).toBe(0)
  })

  it('cancel(url) aborts the in-flight download', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string | URL | Request, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
          })
      )
    )
    const c = new AudioBlobCache()
    const p = c.prime('https://slow.example/a.mp3')
    c.cancel('https://slow.example/a.mp3')
    const r = await p
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('aborted')
  })
})
