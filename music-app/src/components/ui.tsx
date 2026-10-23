/** Small shared UI primitives + a minimal toast system. */

import { create } from 'zustand'
import { AlertTriangle, Loader2, Disc3 } from 'lucide-react'
import type { ReactNode } from 'react'

export function Spinner({ className = 'h-5 w-5' }: { className?: string }) {
  return <Loader2 className={`animate-spin ${className}`} aria-hidden />
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-white/5 ${className}`} aria-hidden />
}

export function EmptyState({ icon, title, hint }: { icon?: ReactNode; title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <div className="text-zinc-500">{icon ?? <Disc3 className="h-10 w-10" aria-hidden />}</div>
      <p className="text-sm font-medium text-zinc-300">{title}</p>
      {hint ? <p className="max-w-sm text-xs leading-relaxed text-zinc-500">{hint}</p> : null}
    </div>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-14 text-center" role="alert">
      <AlertTriangle className="h-8 w-8 text-amber-400" aria-hidden />
      <p className="max-w-sm text-sm text-zinc-300">{message}</p>
      {onRetry ? (
        <button
          onClick={onRetry}
          className="rounded-full bg-accent px-4 py-1.5 text-xs font-semibold text-black transition hover:bg-accent-soft"
        >
          Try again
        </button>
      ) : null}
    </div>
  )
}

export function Chip({ children, tone = 'default' }: { children: ReactNode; tone?: 'default' | 'accent' | 'warn' }) {
  const tones = {
    default: 'bg-white/5 text-zinc-400 ring-1 ring-white/10',
    accent: 'bg-accent/10 text-accent-soft ring-1 ring-accent/30',
    warn: 'bg-amber-500/10 text-amber-300 ring-1 ring-amber-500/30'
  }
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${tones[tone]}`}>{children}</span>
}

/* ---------------------------------- toasts ---------------------------------- */

interface Toast {
  id: number
  message: string
  tone: 'info' | 'error'
}

interface ToastState {
  toasts: Toast[]
  push: (message: string, tone?: 'info' | 'error') => void
  dismiss: (id: number) => void
}

let toastId = 0

export const useToasts = create<ToastState>((set) => ({
  toasts: [],
  push: (message, tone = 'info') => {
    const id = ++toastId
    set((s) => ({ toasts: [...s.toasts.slice(-3), { id, message, tone }] }))
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 3500)
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
}))

export function toast(message: string, tone: 'info' | 'error' = 'info') {
  useToasts.getState().push(message, tone)
}

export function ToastContainer() {
  const toasts = useToasts((s) => s.toasts)
  return (
    <div className="pointer-events-none fixed left-1/2 top-4 z-[100] flex w-full max-w-md -translate-x-1/2 flex-col gap-2 px-4" aria-live="polite">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto animate-fade-in rounded-xl px-4 py-2.5 text-sm shadow-lg backdrop-blur ${
            t.tone === 'error' ? 'bg-red-950/90 text-red-200 ring-1 ring-red-500/30' : 'bg-zinc-900/90 text-zinc-100 ring-1 ring-white/10'
          }`}
        >
          {t.message}
        </div>
      ))}
    </div>
  )
}
