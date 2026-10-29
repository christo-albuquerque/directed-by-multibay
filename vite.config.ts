import { defineConfig } from 'vite';

export default defineConfig({
  base: '/directed-by-multibay/',
  // Three.js alone is ~600 kB; it is the only runtime dependency, so one bundle is fine.
  build: { chunkSizeWarningLimit: 800 },
});
