import { defineConfig } from 'vite';
import { BUILD_TARGET, viewportUnitFallback } from './css-fallbacks.mjs';

export default defineConfig({
  base: './',
  server: { port: 5173, strictPort: true },
  css: { postcss: { plugins: [viewportUnitFallback] } },
  // Older Safari (owner's mom's MacBook): see css-fallbacks.mjs and src/polyfills.js.
  build: { target: BUILD_TARGET, rollupOptions: { output: { manualChunks: { three: ['three'] } } } },
});
