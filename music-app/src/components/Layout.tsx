/** App shell: collapsible desktop sidebar, mobile top header + bottom nav. */

import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  Clock,
  Compass,
  Heart,
  Home,
  Info,
  Library,
  ListMusic,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Settings,
  Smile,
  TrendingUp
} from 'lucide-react'
import { usePlayer, selectCurrentTrack } from '../stores/player'
import { PlayerBar } from './PlayerBar'
import { QueuePanel } from './QueuePanel'
import { ToastContainer } from './ui'

const NAV = [
  { to: '/', label: 'Home', icon: Home },
  { to: '/search', label: 'Search', icon: Search },
  { to: '/charts', label: 'Charts', icon: TrendingUp },
  { to: '/genres', label: 'Genres', icon: Compass },
  { to: '/moods', label: 'Moods', icon: Smile },
  { to: '/playlists', label: 'Playlists', icon: ListMusic },
  { to: '/library', label: 'Library', icon: Library },
  { to: '/history', label: 'History', icon: Clock },
  { to: '/settings', label: 'Settings', icon: Settings },
  { to: '/privacy', label: 'Privacy & sources', icon: Info }
]

const MOBILE_NAV = [
  { to: '/', label: 'Home', icon: Home },
  { to: '/search', label: 'Search', icon: Search },
  { to: '/charts', label: 'Charts', icon: TrendingUp },
  { to: '/genres', label: 'Genres', icon: Compass },
  { to: '/library', label: 'Library', icon: Library }
]

export function Layout() {
  const [collapsed, setCollapsed] = useState(false)
  const [queueOpen, setQueueOpen] = useState(false)
  const hasQueue = usePlayer((s) => s.queue.length > 0)
  const current = usePlayer(selectCurrentTrack)
  const location = useLocation()

  // Close queue drawer on navigation
  useEffect(() => {
    setQueueOpen(false)
  }, [location.pathname])

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-surface text-zinc-100">
      <div className="flex min-h-0 flex-1">
        {/* Desktop sidebar */}
        <aside
          className={`hidden shrink-0 flex-col border-r border-white/5 bg-surface-raised/60 transition-all duration-200 md:flex ${collapsed ? 'w-16' : 'w-60'}`}
          aria-label="Primary navigation"
        >
          <div className="flex items-center gap-2 px-4 py-5">
            <LogoMark />
            {!collapsed ? (
              <div className="min-w-0">
                <p className="truncate text-sm font-extrabold tracking-tight">Anahad</p>
                <p className="truncate text-[10px] text-zinc-500">open music, no strings</p>
              </div>
            ) : null}
          </div>
          <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 pb-4">
            {NAV.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                    isActive ? 'bg-accent/15 text-accent-soft' : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-100'
                  } ${collapsed ? 'justify-center' : ''}`
                }
                title={collapsed ? label : undefined}
              >
                <Icon className="h-5 w-5 shrink-0" aria-hidden />
                {!collapsed ? <span className="truncate">{label}</span> : <span className="sr-only">{label}</span>}
              </NavLink>
            ))}
          </nav>
          <button
            onClick={() => setCollapsed((c) => !c)}
            className="mx-2 mb-4 flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs text-zinc-500 transition hover:bg-white/5 hover:text-zinc-300"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            {!collapsed ? 'Collapse' : null}
          </button>
        </aside>

        {/* Main content */}
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="safe-top flex items-center gap-3 border-b border-white/5 px-4 py-3 md:hidden">
            <LogoMark />
            <div className="min-w-0">
              <p className="text-sm font-extrabold tracking-tight">Anahad</p>
            </div>
            <NavLink
              to="/search"
              aria-label="Search music"
              className="ml-auto flex h-9 w-9 items-center justify-center rounded-full bg-white/5 text-zinc-300 transition hover:text-white"
            >
              <Search className="h-4.5 w-4.5" aria-hidden />
            </NavLink>
          </header>

          <main className="min-h-0 flex-1 overflow-y-auto" id="main-scroll">
            <div className={`mx-auto w-full max-w-6xl px-4 pb-44 pt-4 md:px-6 md:pb-40 md:pt-6 ${hasQueue || current ? '' : ''}`}>
              <Outlet />
            </div>
          </main>
        </div>

        {/* Queue drawer (desktop side / mobile overlay) */}
        <QueuePanel open={queueOpen} onClose={() => setQueueOpen(false)} />
      </div>

      {/* Player (persistent across navigation) */}
      <PlayerBar onToggleQueue={() => setQueueOpen((o) => !o)} queueOpen={queueOpen} />

      {/* Mobile bottom nav */}
      <nav
        className="safe-bottom fixed inset-x-0 bottom-0 z-40 flex border-t border-white/5 bg-surface-raised/95 backdrop-blur md:hidden"
        aria-label="Mobile navigation"
      >
        {MOBILE_NAV.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition ${isActive ? 'text-accent-soft' : 'text-zinc-500'}`
            }
          >
            <Icon className="h-5 w-5" aria-hidden />
            {label}
          </NavLink>
        ))}
      </nav>

      <ToastContainer />
    </div>
  )
}

function LogoMark() {
  return (
    <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-accent/15 ring-1 ring-accent/30" aria-hidden>
      <Heart className="h-4 w-4 text-accent-soft" />
    </span>
  )
}
