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
 * Guardrails:
 * - Only used for 'audio/mpeg' (MSE has no reliable support for raw
 *   FLAC/OGG/MP4 appends) and only when MediaSource.isTypeSupported agrees.
 * - Fetching requires the host to be CORS-open + Range-capable — that fact is
 *   verified per-host by the preload/cache layer, never assumed.
 * - This is still the native <audio> element playing; MediaSource is the
 *   standard web-platform streaming API (no emulation, no DRM circumvention).
 */

const CHUNK_BYTES = 256 * 1024

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

  private async fetchAndAppendChunk(): Promise<boolean> {
    if (!this.sourceBuffer) return false
    const start = this.appendedBytes
    const end = start + CHUNK_BYTES - 1
    try {
      const res = await fetch(this.url, {
        signal: this.aborter.signal,
        headers: { Range: `bytes=${start}-${end}` }
      })
      if (res.status === 416) {
        this.finish()
        return true
      }
      // A 200 here means the server ignored Range: bytes would restart at 0
      // and duplicate what we already appended — fall back instead.
      if (!res.ok || (res.status === 200 && this.appendedBytes > 0)) return false
      const blob = await res.blob()
      if (blob.size === 0) {
        this.finish()
        return true
      }
      await this.append(blob)
      this.appendedBytes += blob.size
      const total = parseTotalFromContentRange(res.headers.get('content-range'))
      if (total !== null && this.appendedBytes >= total) this.finish()
      return true
    } catch (err) {
      if (this.aborter.signal.aborted) return false
      // Network death mid-stream: one transparent retry, then give up.
      if (this.retryCount < 1) {
        this.retryCount++
        await new Promise((r) => setTimeout(r, 800))
        if (this.aborter.signal.aborted) return false
        return this.fetchAndAppendChunk()
      }
      this.fail()
      return false
    }
  }

  private retryCount = 0

  private async pump(): Promise<void> {
    while (!this.finished && !this.failed && !this.aborter.signal.aborted) {
      const ok = await this.fetchAndAppendChunk()
      if (!ok) break
      if (this.finished) break
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
