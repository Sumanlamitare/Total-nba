import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: 'client',
  plugins: [react()],
  build: {
    outDir: '../dist', emptyOutDir: true,
    // Motion marks its React files "use client" (for server frameworks); harmless in a browser-only build.
    rollupOptions: { onwarn(w, warn) { if (w.code === 'MODULE_LEVEL_DIRECTIVE') return; warn(w); } },
  },
});
