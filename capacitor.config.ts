import type { CapacitorConfig } from '@capacitor/cli';

// Thin native shell: the WebView loads the deployed production app.
// webDir points at public/ only to satisfy the platform-add requirement;
// runtime content comes from server.url, not bundled assets.
const config: CapacitorConfig = {
  appId: 'com.backtothepast.app',
  appName: 'Back to the Past',
  webDir: 'public',
  server: {
    url: 'https://www.guess-history.com',
  },
};

export default config;
