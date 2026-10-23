/** App root: providers, router, persistent audio engine, shortcuts. */

import { Suspense, lazy, useEffect } from 'react'
import { HashRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Layout } from './components/Layout'
import { Spinner } from './components/ui'
import { useAudioEngine } from './hooks/useAudioEngine'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { bootTheme } from './stores/settings'
import { useLibrary } from './stores/library'

const HomePage = lazy(() => import('./pages/Home').then((m) => ({ default: m.HomePage })))
const SearchPage = lazy(() => import('./pages/Search').then((m) => ({ default: m.SearchPage })))
const GenresPage = lazy(() => import('./pages/Browse').then((m) => ({ default: m.GenresPage })))
const MoodsPage = lazy(() => import('./pages/Browse').then((m) => ({ default: m.MoodsPage })))
const ShelfPage = lazy(() => import('./pages/Browse').then((m) => ({ default: m.ShelfPage })))
const AlbumPage = lazy(() => import('./pages/Album').then((m) => ({ default: m.AlbumPage })))
const ArtistPage = lazy(() => import('./pages/Artist').then((m) => ({ default: m.ArtistPage })))
const TrackDetailPage = lazy(() => import('./pages/TrackDetail').then((m) => ({ default: m.TrackDetailPage })))
const PlaylistsPage = lazy(() => import('./pages/Playlists').then((m) => ({ default: m.PlaylistsPage })))
const PlaylistDetailPage = lazy(() => import('./pages/PlaylistDetail').then((m) => ({ default: m.PlaylistDetailPage })))
const LibraryPage = lazy(() => import('./pages/Library').then((m) => ({ default: m.LibraryPage })))
const HistoryPage = lazy(() => import('./pages/History').then((m) => ({ default: m.HistoryPage })))
const QueuePage = lazy(() => import('./pages/Queue').then((m) => ({ default: m.QueuePage })))
const SettingsPage = lazy(() => import('./pages/Settings').then((m) => ({ default: m.SettingsPage })))
const PrivacyPage = lazy(() => import('./pages/Privacy').then((m) => ({ default: m.PrivacyPage })))
const NotFoundPage = lazy(() => import('./pages/NotFound').then((m) => ({ default: m.NotFoundPage })))

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false
    }
  }
})

function PageFallback() {
  return (
    <div className="flex justify-center py-24" role="status" aria-label="Loading page">
      <Spinner className="h-7 w-7 text-accent" />
    </div>
  )
}

export default function App() {
  bootTheme()
  useAudioEngine()
  useKeyboardShortcuts()

  useEffect(() => {
    void useLibrary.getState().init()
  }, [])

  return (
    <QueryClientProvider client={queryClient}>
      <HashRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route
              path="/"
              element={
                <Suspense fallback={<PageFallback />}>
                  <HomePage />
                </Suspense>
              }
            />
            <Route path="/search" element={<Suspense fallback={<PageFallback />}><SearchPage /></Suspense>} />
            <Route path="/genres" element={<Suspense fallback={<PageFallback />}><GenresPage /></Suspense>} />
            <Route path="/moods" element={<Suspense fallback={<PageFallback />}><MoodsPage /></Suspense>} />
            <Route path="/genres/:id" element={<Suspense fallback={<PageFallback />}><ShelfPage kind="genre" /></Suspense>} />
            <Route path="/moods/:id" element={<Suspense fallback={<PageFallback />}><ShelfPage kind="mood" /></Suspense>} />
            <Route path="/album/:identifier" element={<Suspense fallback={<PageFallback />}><AlbumPage /></Suspense>} />
            <Route path="/artist/:name" element={<Suspense fallback={<PageFallback />}><ArtistPage /></Suspense>} />
            <Route path="/track/:identifier/:fileName" element={<Suspense fallback={<PageFallback />}><TrackDetailPage /></Suspense>} />
            <Route path="/playlists" element={<Suspense fallback={<PageFallback />}><PlaylistsPage /></Suspense>} />
            <Route path="/playlist/:id" element={<Suspense fallback={<PageFallback />}><PlaylistDetailPage /></Suspense>} />
            <Route path="/library" element={<Suspense fallback={<PageFallback />}><LibraryPage /></Suspense>} />
            <Route path="/history" element={<Suspense fallback={<PageFallback />}><HistoryPage /></Suspense>} />
            <Route path="/queue" element={<Suspense fallback={<PageFallback />}><QueuePage /></Suspense>} />
            <Route path="/settings" element={<Suspense fallback={<PageFallback />}><SettingsPage /></Suspense>} />
            <Route path="/privacy" element={<Suspense fallback={<PageFallback />}><PrivacyPage /></Suspense>} />
            <Route path="*" element={<Suspense fallback={<PageFallback />}><NotFoundPage /></Suspense>} />
          </Route>
        </Routes>
      </HashRouter>
    </QueryClientProvider>
  )
}
