import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { port: 5173, strictPort: true },
  build: { rollupOptions: { output: { manualChunks: { three: ['three'] } } } },
});
