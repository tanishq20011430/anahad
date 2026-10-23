/**
 * MseStream — progressive fetch→MediaSource streaming for MP3.
 *
 * Why: a partial Blob played via object URL would END when the bytes run out.
 * The correct "instant start + smooth continue" pipeline is:
 *   1. append the prebuffered leading slice (from AudioBlobCache) into a
 *      SourceBuffer, so playback starts from RAM immediately;
 *   2. keep Range-fetching the remainder of the SAME file and appending,
 *      so playback continues seamlessly into the network;
 *   3. on ANY problem (unsupported codec, quota, network death, out-of-buffer
 *      seek) fall back to the native <audio src> path, preserving position.
 *
 * Robustness rules (learned from live incidents, 2026-10-23):
 * - Every fetch has a HEADER deadline — a silent server can never hang the
 *   pipeline (a live-radio stall once froze the player at "Buffering").
 * - Response bodies are read with a bounded reader, never `res.blob()` —
 *   a live stream's body NEVER ends, so blob() never resolves. Bounded
 *   reads also cap RAM even when a server ignores Range entirely.
 * - When a server ignores Range from byte 0 (live radio, simple file
 *   servers) the SAME 200 body is streamed progressively and appended as
 *   it arrives — one request, no preflight (no Range header on the first
 *   request), works for both finite files and endless live streams.
 * - A mid-stream 200 (server stopped honoring Range) and any other error
 *   surface through fail() → the engine's native fallback — the pump is
 *   NEVER allowed to break silently into an eternal "Buffering" state.
 *
 * Guardrails:
 * - Only used for 'audio/mpeg' (MSE has no reliable support for raw
 *   FLAC/OGG/MP4 appends) and only when MediaSource.isTypeSupported agrees.
 * - This is still the native <audio> element playing; MediaSource is the
 *   standard web-platform streaming API (no emulation, no DRM circumvention).
 */

const CHUNK_BYTES = 256 * 1024
/** Append granularity for progressive (200-from-start) bodies. Each pump
 *  cycle appends one window, so start() resolves after the first window and
 *  playback begins while the live body keeps flowing. */
const PROGRESSIVE_APPEND_BYTES = 32 * 1024
/** Deadline for response HEADERS (not body) on every fetch. */
const HEADER_TIMEOUT_MS = 12_000
/** Deadline for reading one bounded body window. */
const BODY_TIMEOUT_MS = 20_000

export interface MseStartResult {
  /** true = MediaSource streaming attached; false = caller should use native src. */
  streaming: boolean
  /** Bound disposer — always call on track change / unmount. */
  stop: () => void
}

function onceEvent(target: EventTarget, event: string, timeoutMs?: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      target.removeEventListener(event, onOk)
      if (timeoutMs) clearTimeout(timer)
    }
    const onOk = () => {
      cleanup()
      resolve()
    }
    const timer = timeoutMs
      ? setTimeout(() => {
          cleanup()
          reject(new Error(`timeout waiting for ${event}`))
        }, timeoutMs)
      : undefined
    target.addEventListener(event, onOk, { once: true })
  })
}

function waitForSourceBufferFree(sb: SourceBuffer): Promise<void> {
  if (!sb.updating) return Promise.resolve()
  return onceEvent(sb, 'updateend', 10_000)
}

function parseTotalFromContentRange(header: string | null): number | null {
  if (!header) return null
  const m = header.match(/bytes\s+\d+-\d+\/(\d+|\*)/i)
  if (!m) return null
  if (m[1] === '*') return null
  const n = Number(m[1])
  return Number.isFinite(n) && n > 0 ? n : null
}

/**
 * Read at most `cap` bytes from a streaming response, then cancel the rest.
 * A deadline guards against servers that open the body and stall forever.
 */
async function readBounded(res: Response, cap: number, signal: AbortSignal, deadlineMs: number): Promise<Blob> {
  if (!res.body) {
    // No stream support: only safe when the response is already bounded (206).
    const whole = await res.blob()
    return whole.size <= cap ? whole : whole.slice(0, cap)
  }
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  const ctrl = new AbortController()
  const onOuterAbort = () => ctrl.abort()
  signal.addEventListener('abort', onOuterAbort, { once: true })
  const timer = setTimeout(() => ctrl.abort(), deadlineMs)
  try {
    while (true) {
      if (ctrl.signal.aborted) break
      const { done, value } = await reader.read()
      if (done) break
      if (value) {
        chunks.push(value)
        total += value.byteLength
        if (total >= cap) break
      }
    }
  } finally {
    clearTimeout(timer)
    signal.removeEventListener('abort', onOuterAbort)
    void reader.cancel().catch(() => undefined)
  }
  return new Blob(chunks as BlobPart[])
}

export class MseStream {
  private audio: HTMLAudioElement | null = null
  private mediaSource: MediaSource | null = null
  private sourceBuffer: SourceBuffer | null = null
  private objectUrl: string | null = null
  private aborter = new AbortController()
  private appendedBytes = 0
  private finished = false
  private failed = false
  private url = ''
  private fatalCb: ((positionSec: number) => void) | null = null
  /** Active when the server serves one endless/Range-less 200 body. */
  private progressiveReader: ReadableStreamDefaultReader<Uint8Array> | null = null
  private progressiveTotal: number | null = null
  private retryCount = 0
  /** Response produced by tryFetchChunk, consumed by consumeChunkResponse. */
  private pendingResponse: Response | null = null
  /** True when a Range request died BEFORE any response (preflight/host). */
  private rangeFailedBeforeResponse = false

  /** MSE + MP3 support probe (Safari/iOS → false → native path). */
  static supported(): boolean {
    return (
      typeof MediaSource !== 'undefined' &&
      typeof MediaSource.isTypeSupported === 'function' &&
      MediaSource.isTypeSupported('audio/mpeg')
    )
  }

  get active(): boolean {
    return !this.failed && !this.finished && this.sourceBuffer !== null
  }

  /**
   * Attach MediaSource streaming to `audio`. Appends `seed` (the prebuffered
   * slice, may be null) and then streams the rest of `url` via Range chunks.
   * Resolves {streaming:true} once the first chunk is appended and playable
   * start is imminent; resolves {streaming:false} on any setup failure.
   */
  async start(
    audio: HTMLAudioElement,
    url: string,
    seed: Blob | null,
    onFatal: (positionSec: number) => void
  ): Promise<MseStartResult> {
    this.audio = audio
    this.url = url
    this.fatalCb = onFatal

    if (!MseStream.supported()) return { streaming: false, stop: () => this.stop() }

    try {
      this.mediaSource = new MediaSource()
      this.objectUrl = URL.createObjectURL(this.mediaSource)
      const opened = onceEvent(this.mediaSource, 'sourceopen', 8_000)
      audio.src = this.objectUrl
      await opened

      if (!this.mediaSource || this.mediaSource.readyState !== 'open') {
        return { streaming: false, stop: () => this.stop() }
      }
      this.sourceBuffer = this.mediaSource.addSourceBuffer('audio/mpeg')
      if (this.sourceBuffer) {
        try {
          this.sourceBuffer.mode = 'sequence'
        } catch {
          /* 'sequence' unsupported — defaults are fine for mp3 */
        }
      }
      audio.addEventListener('seeking', this.handleSeeking)
      audio.addEventListener('error', this.handleError)

      if (seed && seed.size > 0) {
        await this.append(seed)
        this.appendedBytes = seed.size
      } else {
        const ok = await this.fetchAndAppendChunk()
        if (!ok) return { streaming: false, stop: () => this.stop() }
      }
      void this.pump()
      return { streaming: true, stop: () => this.stop() }
    } catch {
      return { streaming: false, stop: () => this.stop() }
    }
  }

  /* ------------------------------ internals ------------------------------ */

  /** One fetch+append step of the pump. Returns false ONLY when the pump must stop. */
  private async fetchAndAppendChunk(): Promise<boolean> {
    if (!this.sourceBuffer) return false
    if (this.progressiveReader) return this.readProgressiveStep()

    const start = this.appendedBytes
    const end = start + CHUNK_BYTES - 1
    // Range-first: Range-capable hosts answer 206 and the file streams in
    // paced 256KB windows (RAM stays bounded, network paced by playback).
    // The FIRST request doubles as the host probe — see tryFetchChunk.
    const withRange = await this.tryFetchChunk(`bytes=${start}-${end}`)
    if (withRange) return this.consumeChunkResponse()
    if (this.aborter.signal.aborted) return false
    if (this.rangeFailedBeforeResponse && this.appendedBytes === 0) {
      // The host died on the Range request itself — the classic signature of
      // a live-stream host that rejects Range preflights (CORS allow-list
      // without Range). Retry ONCE without the header: a CORS "simple
      // request", no preflight, served progressively (see consumeChunkResponse).
      this.rangeFailedBeforeResponse = false
      const plain = await this.tryFetchChunk(null)
      if (plain) return this.consumeChunkResponse()
    }
    return false
  }

  /**
   * Issue one chunk fetch. Resolves true when `pendingResponse` holds a
   * usable response; false on failure (pump retry policy applies).
   */
  private async tryFetchChunk(range: string | null): Promise<boolean> {
    const headers: HeadersInit = range ? { Range: range } : {}
    const ctrl = new AbortController()
    const onOuterAbort = () => ctrl.abort()
    this.aborter.signal.addEventListener('abort', onOuterAbort, { once: true })
    const headerTimer = setTimeout(() => ctrl.abort(), HEADER_TIMEOUT_MS)
    try {
      this.pendingResponse = await fetch(this.url, { signal: ctrl.signal, headers })
      return true
    } catch {
      // A network-level death BEFORE any response (preflight rejection,
      // dead host, timeout). Distinguish it for the no-Range fallback.
      this.rangeFailedBeforeResponse = range !== null
      return false
    } finally {
      clearTimeout(headerTimer)
      this.aborter.signal.removeEventListener('abort', onOuterAbort)
    }
  }

  /** Consume `pendingResponse`: append one bounded window or go progressive. */
  private async consumeChunkResponse(): Promise<boolean> {
    const res = this.pendingResponse
    this.pendingResponse = null
    if (!res) return false
    if (this.aborter.signal.aborted) return false

    if (res.status === 416) {
      // Past EOF — the file is fully appended.
      this.finish()
      return true
    }
    if (res.status === 200 && this.appendedBytes > 0) {
      // The server honored our earlier Ranges but now ignores Range — the
      // body would duplicate data. Surface to the native fallback, which
      // preserves the playhead, instead of stalling forever.
      this.fail()
      return false
    }
    if (!res.ok) {
      return false
    }

    if (res.status === 200 && this.appendedBytes === 0) {
      // Server ignores Range from the start (live radio / simple file host).
      // Stream THIS body progressively — it may be a finite file or an
      // endless live stream; both are appended as bytes arrive.
      if (!res.body) {
        this.fail() // cannot bound the read on this legacy browser → native
        return false
      }
      const lenHeader = Number(res.headers.get('content-length'))
      this.progressiveTotal = Number.isFinite(lenHeader) && lenHeader > 0 ? lenHeader : null
      this.progressiveReader = res.body.getReader()
      return this.readProgressiveStep()
    }

    // 206 (or a 200 we deliberately bounded): read exactly one window.
    const blob = await readBounded(res, CHUNK_BYTES, this.aborter.signal, BODY_TIMEOUT_MS)
    if (this.aborter.signal.aborted) return false
    if (blob.size === 0) {
      this.finish()
      return true
    }
    await this.append(blob)
    this.appendedBytes += blob.size
    const total = parseTotalFromContentRange(res.headers.get('content-range'))
    if (total !== null && this.appendedBytes >= total) this.finish()
    return true
  }

  /**
   * Progressive mode: drain ONE window of the open 200 body, append it, and
   * return so the pump can cycle (start() therefore resolves quickly even on
   * an endless live body — the same reader continues on the next cycle).
   * Returns false only when the pump must stop.
   */
  private async readProgressiveStep(): Promise<boolean> {
    const reader = this.progressiveReader
    if (!reader) return false
    const pending: Uint8Array[] = []
    let pendingBytes = 0
    const flush = async (): Promise<void> => {
      if (pendingBytes === 0) return
      const blob = new Blob(pending.splice(0) as BlobPart[])
      pendingBytes = 0
      await this.append(blob)
      this.appendedBytes += blob.size
    }
    try {
      let sawDone = false
      while (!this.aborter.signal.aborted) {
        const { done, value } = await reader.read()
        if (done) {
          sawDone = true
          break
        }
        if (!value) continue
        pending.push(value)
        pendingBytes += value.byteLength
        if (pendingBytes >= PROGRESSIVE_APPEND_BYTES) break
      }
      if (this.aborter.signal.aborted) return false
      await flush()
      if (!sawDone) return true // window appended; body still open → next cycle continues it
    } catch {
      if (this.aborter.signal.aborted) return false
      // Body died mid-stream (live connection drop). Drop the reader so a
      // reconnect issues a FRESH request — the pump retries once, and the
      // reconnect path decides: Range-capable hosts resume, Range-less hosts
      // surface the native fallback via fail().
      void reader.cancel().catch(() => undefined)
      this.progressiveReader = null
      return false
    }
    // Body ended (done). A finite file reached EOF; a live stream was cut short.
    this.progressiveReader = null
    if (this.progressiveTotal !== null && this.appendedBytes >= this.progressiveTotal) {
      this.finish()
      return true
    }
    // Unknown/short body — one reconnect through the normal path.
    return false
  }

  private async pump(): Promise<void> {
    while (!this.finished && !this.failed && !this.aborter.signal.aborted) {
      const ok = await this.fetchAndAppendChunk()
      if (ok) {
        this.retryCount = 0
        continue
      }
      if (this.finished || this.failed || this.aborter.signal.aborted) break
      // One transparent retry for transient failures, then surface the
      // native fallback — never starve the element into a silent stall.
      if (this.retryCount < 1) {
        this.retryCount++
        await new Promise((r) => setTimeout(r, 800))
        continue
      }
      this.fail()
      break
    }
  }

  private async append(blob: Blob): Promise<void> {
    const sb = this.sourceBuffer
    if (!sb) return
    try {
      await waitForSourceBufferFree(sb)
      const buf = await blob.arrayBuffer()
      sb.appendBuffer(buf)
      await waitForSourceBufferFree(sb)
    } catch (err) {
      if (err instanceof DOMException && err.name === 'QuotaExceededError') {
        // Extremely unlikely for audio; trim the oldest half and continue.
        try {
          await waitForSourceBufferFree(sb)
          const b = sb.buffered
          if (b.length > 0 && this.audio) {
            const mid = b.end(b.length - 1) / 2
            if (mid > this.audio.currentTime) sb.remove(0, mid)
          }
        } catch {
          this.fail()
        }
      } else if (!this.aborter.signal.aborted) {
        this.fail()
      }
    }
  }

  private finish(): void {
    if (this.finished || this.failed) return
    this.finished = true
    try {
      if (this.mediaSource && this.mediaSource.readyState === 'open') void this.mediaSource.endOfStream()
    } catch {
      /* already ended */
    }
  }

  private handleSeeking = (): void => {
    const a = this.audio
    const sb = this.sourceBuffer
    if (!a || !sb || sb.updating) return
    const t = a.currentTime
    const b = a.buffered
    let covered = false
    for (let i = 0; i < b.length; i++) {
      if (t >= b.start(i) - 0.25 && t <= b.end(i) + 0.5) {
        covered = true
        break
      }
    }
    // In-buffer seek: MSE handles it. Out-of-buffer: native fallback keeps UX smooth.
    if (!covered) this.fail()
  }

  private handleError = (): void => {
    if (this.audio?.error) this.fail()
  }

  private fail(): void {
    if (this.failed || this.finished) return
    this.failed = true
    const pos = this.audio?.currentTime ?? 0
    this.detachListeners()
    try {
      this.aborter.abort()
    } catch {
      /* ignore */
    }
    void this.progressiveReader?.cancel().catch(() => undefined)
    this.progressiveReader = null
    this.fatalCb?.(pos)
  }

  private detachListeners(): void {
    this.audio?.removeEventListener('seeking', this.handleSeeking)
    this.audio?.removeEventListener('error', this.handleError)
  }

  private teardownMedia(): void {
    try {
      if (this.mediaSource && this.mediaSource.readyState === 'open') {
        this.mediaSource.endOfStream()
      }
    } catch {
      /* ignore */
    }
    try {
      if (this.sourceBuffer) {
        if (this.sourceBuffer.updating) this.sourceBuffer.abort()
      }
    } catch {
      /* ignore */
    }
    this.sourceBuffer = null
    this.mediaSource = null
  }

  /** Clean teardown on track change / unmount. */
  stop(): void {
    this.aborter.abort()
    this.detachListeners()
    void this.progressiveReader?.cancel().catch(() => undefined)
    this.progressiveReader = null
    this.teardownMedia()
    const a = this.audio
    if (a && this.objectUrl) {
      a.removeAttribute('src')
      a.load()
    }
    if (this.objectUrl) {
      try {
        URL.revokeObjectURL(this.objectUrl)
      } catch {
        /* ignore */
      }
    }
    this.objectUrl = null
  }
}
