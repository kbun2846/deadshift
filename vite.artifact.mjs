import { defineConfig } from 'vite';

// The artifact host serves one self-contained page with no network, so the
// build that feeds it must not code-split: a split build resolves its sibling
// chunks with `new URL(dep, import.meta.url)`, and on a blob module that base
// is `blob:null`, which throws before the game ever starts.
export default defineConfig({
  root: '/home/claude/deadshift',
  base: '.',
  build: {
    outDir: '/tmp/claude-0/art/dist',
    emptyOutDir: true,
    assetsInlineLimit: 100000000,
    cssCodeSplit: false,
    modulePreload: { polyfill: false },
    rollupOptions: { output: { inlineDynamicImports: true, manualChunks: undefined } },
  },
});
