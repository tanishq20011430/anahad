/**
 * App settings — persisted to localStorage (small, synchronous, syncs at boot).
 * Listening history lives separately in IndexedDB and can be disabled.
 */

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { QualityPreference } from '../types'

export interface SettingsState {
  theme: 'dark' | 'light'
  quality: QualityPreference
  historyEnabled: boolean
  autoplayNext: boolean
  setTheme: (t: 'dark' | 'light') => void
  setQuality: (q: QualityPreference) => void
  setHistoryEnabled: (v: boolean) => void
  setAutoplayNext: (v: boolean) => void
}

function applyTheme(theme: 'dark' | 'light') {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  root.classList.toggle('dark', theme === 'dark')
  root.style.colorScheme = theme
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      theme: 'dark',
      quality: 'auto',
      historyEnabled: true,
      autoplayNext: true,
      setTheme: (t) => {
        applyTheme(t)
        set({ theme: t })
      },
      setQuality: (q) => set({ quality: q }),
      setHistoryEnabled: (v) => set({ historyEnabled: v }),
      setAutoplayNext: (v) => set({ autoplayNext: v })
    }),
    {
      name: 'anahad-settings',
      storage: createJSONStorage(() => localStorage),
      onRehydrateStorage: () => (state) => {
        if (state) applyTheme(state.theme)
      }
    }
  )
)

/** Apply theme once at boot before React rehydration completes. */
export function bootTheme() {
  applyTheme(useSettings.getState().theme)
}

export function useQuality(): QualityPreference {
  return useSettings((s) => s.quality)
}
