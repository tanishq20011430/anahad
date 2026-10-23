/** Horizontal scroll section used across discovery pages. */

import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import type { ReactNode } from 'react'

export function Section({
  title,
  subtitle,
  seeAllTo,
  children
}: {
  title: string
  subtitle?: string
  seeAllTo?: string
  children: ReactNode
}) {
  return (
    <section className="animate-fade-in" aria-label={title}>
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-zinc-100">{title}</h2>
          {subtitle ? <p className="text-xs text-zinc-500">{subtitle}</p> : null}
        </div>
        {seeAllTo ? (
          <Link to={seeAllTo} className="flex items-center gap-0.5 text-xs font-semibold text-zinc-400 transition hover:text-accent">
            See all <ChevronRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        ) : null}
      </div>
      {children}
    </section>
  )
}
