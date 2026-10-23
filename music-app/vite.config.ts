import { defineConfig, type UserConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base: './' keeps asset URLs relative so the build works on:
// - GitHub Pages project sites (https://user.github.io/repo/)
// - Vercel
// - Any static host subdirectory
// Apple Music chart feeds send no CORS headers; proxy them same-origin in dev
// and preview (production uses the matching rewrite in vercel.json).
const chartsProxy = {
  target: 'https://rss.marketingtools.apple.com',
  changeOrigin: true,
  rewrite: (path: string) => path.replace(/^\/api\/charts/, '/api/v2')
}

const config: UserConfig = {
  base: './',
  plugins: [react()],
  server: { port: 5173, host: true, proxy: { '/api/charts': chartsProxy } },
  preview: { port: 4173, host: true, proxy: { '/api/charts': chartsProxy } },
  build: {
    sourcemap: false,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          query: ['@tanstack/react-query'],
          icons: ['lucide-react']
        }
      }
    }
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './tests/setup.ts',
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts']
  } as UserConfig['test']
}

export default defineConfig(config)
