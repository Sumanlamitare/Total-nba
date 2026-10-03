import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The data/ folder is served next to the built app (copied in by the deploy workflow).
export default defineConfig({
  root: 'client',
  base: './',
  plugins: [react()],
  build: { outDir: '../dist', emptyOutDir: true },
  publicDir: false,
  server: { fs: { allow: ['..'] } },
});
