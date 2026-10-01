// Build settings shared by vite.config.js and vite.artifact.mjs so the game
// also starts on older browsers (owner, 2026-09-30: an older MacBook's Safari
// showed a frozen title). See AGENTS.md > Older browsers.

// The JavaScript is compiled down to what Safari 14 / Chrome 87 / Firefox 78
// read (the game itself needs WebGL 2, so Safari 15 is the real floor);
// src/polyfills.js adds the few newer built-ins the code calls.
export const BUILD_TARGET = ['es2020', 'safari14', 'chrome87', 'firefox78', 'edge88'];

// CSS: `dvh` / `svh` / `lvh` (Safari 15.4+) get a plain `vh` line in front, so
// an older browser keeps a sensible size instead of dropping the rule.
export const viewportUnitFallback = {
  postcssPlugin: 'viewport-unit-fallback',
  Declaration(decl) {
    if (!/\d(?:d|s|l)vh\b/.test(decl.value)) return;
    const fallback = decl.value.replace(/(\d)(?:d|s|l)vh\b/g, '$1vh');
    const prev = decl.prev();
    if (prev && prev.type === 'decl' && prev.prop === decl.prop && prev.value === fallback) return;
    decl.cloneBefore({ value: fallback });
  },
};
