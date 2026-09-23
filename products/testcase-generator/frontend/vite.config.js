import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  base: process.env.VITE_BASE || '/',
  plugins: [react()],
  resolve: {
    // shared/ui is plain source with no node_modules of its own, so Rollup resolves any bare
    // import inside it relative to that directory and fails the production build. Aliasing to
    // this app's own copy is what every other product does.
    alias: {
      'lucide-react': fileURLToPath(new URL('./node_modules/lucide-react', import.meta.url)),
    },
  },
  server: {
    port: 5177,
    fs: { allow: ['..', '../../../shared'] },
    proxy: {
      '/api': 'http://127.0.0.1:8083',
    },
  },
});
