import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  // Served at /automation/ behind the Testrix gateway (VITE_BASE set in the
  // gateway image build); plain '/' for local dev.
  base: process.env.VITE_BASE || '/',
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
    port: 5173,
    fs: { allow: ['..', '../../../../shared'] },
    proxy: {
      // Session refresh and logout are owned by the platform service, not this product.
      '/platform/api': { target: 'http://127.0.0.1:18081', rewrite: (p) => p.replace('/platform', '') },
      '/api':         'http://127.0.0.1:18080',
      '/uploads':     'http://127.0.0.1:18080',
      '/swagger-ui':  'http://127.0.0.1:18080',
      '/v3/api-docs': 'http://127.0.0.1:18080',
    }
  }
});
