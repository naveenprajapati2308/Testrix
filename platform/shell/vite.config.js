import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    // shared/ui/dashboard's chart components import these bare specifiers, but that
    // directory has no node_modules of its own (it's plain shared source, not a
    // package) — Rollup resolves bare imports relative to the importing file's real
    // disk location, so without this alias a production build fails to find them.
    alias: {
      'chart.js': fileURLToPath(new URL('./node_modules/chart.js', import.meta.url)),
      'react-chartjs-2': fileURLToPath(new URL('./node_modules/react-chartjs-2', import.meta.url)),
      'lucide-react': fileURLToPath(new URL('./node_modules/lucide-react', import.meta.url)),
    },
  },
  server: {
    port: 5170,
    fs: { allow: ['..', '../../shared'] },
    proxy: {
      '/platform/api': { target: 'http://127.0.0.1:18081', rewrite: (p) => p.replace('/platform', '') },
      // Profile pictures are written and served by the platform service.
      '/uploads/profiles': { target: 'http://127.0.0.1:18081' },
      '/automation/api': { target: 'http://127.0.0.1:18080', rewrite: (p) => p.replace('/automation', '') },
      '/apitest/api': { target: 'http://127.0.0.1:8081', rewrite: (p) => p.replace('/apitest', '') },
      '/genai': { target: 'http://127.0.0.1:3000', rewrite: (p) => p.replace('/genai', '') },
      // Mirrors gateway/nginx.conf's /health/* rewrites so the dashboard's health
      // dots work the same in `npm run dev` as they do behind the real gateway.
      '/health/platform': { target: 'http://127.0.0.1:18081', rewrite: () => '/actuator/health' },
      '/health/automation': { target: 'http://127.0.0.1:18080', rewrite: () => '/actuator/health' },
      '/health/apitest': { target: 'http://127.0.0.1:8081', rewrite: () => '/actuator/health' },
      '/health/genai': { target: 'http://127.0.0.1:3000', rewrite: () => '/' }
    }
  }
});
