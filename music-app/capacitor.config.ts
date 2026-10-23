import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'app.anahad.music',
  appName: 'Anahad',
  webDir: 'dist',
  // Matches the app's dark theme so there's no white flash behind the WebView.
  backgroundColor: '#0b0b0f'
}

export default config
