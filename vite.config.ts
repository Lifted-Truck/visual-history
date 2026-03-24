import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  server: {
    fs: {
      // Allow serving dist/graph.json from outside the default src/ boundary
      allow: ['..'],
    },
  },
  optimizeDeps: {
    include: ['deck.gl', 'maplibre-gl'],
  },
});
