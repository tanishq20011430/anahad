/**
 * Native (Android app) media bridge.
 *
 * In the Capacitor Android build, the BackgroundAudio plugin
 * (android/app/src/main/java/app/anahad/music/) runs a foreground service so
 * playback survives the screen turning off, and shows the media notification
 * + lock-screen controls. This module mirrors now-playing state into it and
 * routes its buttons back into the player store. On the web it is inert.
 */

import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core'

export type NativeMediaAction = 'play' | 'pause' | 'next' | 'prev'

interface BackgroundAudioPlugin {
  update(opts: { title: string; artist: string; artwork?: string; playing: boolean }): Promise<void>
  stop(): Promise<void>
  addListener(
    event: 'action',
    cb: (e: { action: NativeMediaAction }) => void
  ): Promise<PluginListenerHandle>
}

export const isNativeApp = Capacitor.isNativePlatform()

const BackgroundAudio = registerPlugin<BackgroundAudioPlugin>('BackgroundAudio')

export interface NowPlaying {
  title: string
  artist: string
  artwork?: string
  playing: boolean
}

/** Starts mirroring; returns a cleanup function. No-op outside the native app. */
export function bindNativeMedia(
  getNowPlaying: () => NowPlaying | null,
  subscribe: (fn: () => void) => () => void,
  onAction: (action: NativeMediaAction) => void
): () => void {
  if (!isNativeApp) return () => undefined

  let lastKey = ''
  const sync = () => {
    const np = getNowPlaying()
    const key = np ? JSON.stringify(np) : ''
    if (key === lastKey) return
    lastKey = key
    if (np) BackgroundAudio.update(np).catch(() => { lastKey = '' /* retry on next change */ })
    else BackgroundAudio.stop().catch(() => undefined)
  }

  const handle = BackgroundAudio.addListener('action', (e) => onAction(e.action))
  const unsub = subscribe(sync)
  sync()

  return () => {
    unsub()
    void handle.then((h) => h.remove())
    void BackgroundAudio.stop().catch(() => undefined)
  }
}
