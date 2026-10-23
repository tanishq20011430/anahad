import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'app.anahad.music',
  appName: 'Anahad',
  webDir: 'dist',
  // Matches the app's dark theme so there's no white flash behind the WebView.
  backgroundColor: '#0b0b0f',
  plugins: {
    SystemBars: {
      // Light status/navigation bar icons on the always-dark app.
      style: 'DARK',
      // Fit content between the system bars via CSS safe-area insets.
      insetsHandling: 'css',
      // index.html uses viewport-fit=cover; telling Android up front avoids a layout jump.
      initialViewportFitValueHint: 'cover'
    }
  }
}

export default config
