import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { readFileSync } from 'node:fs';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

// Tauri attend un port fixe (devUrl de tauri.conf.json) et une sortie dans
// dist/ (frontendDist). La cible suit WebView2 (Chromium récent).
export default defineConfig({
  plugins: [preact()],
  define: { 'import.meta.env.VITE_APP_VERSION': JSON.stringify(version) },
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  envPrefix: ['VITE_', 'TAURI_ENV_'],
  build: { target: 'chrome120', outDir: 'dist', emptyOutDir: true },
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.js'],
    include: ['tests/**/*.test.{js,jsx}'],
    // Gate de couverture sur la logique (comme le lecteur bureau) : l'interface
    // est vérifiée à l'œil et sur Windows, pas ici.
    coverage: {
      provider: 'v8',
      include: ['src/core/**', 'src/api/**', 'src/playback/**'],
      reporter: ['text', 'html', 'json-summary'],
      thresholds: { lines: 95 },
    },
  },
});
