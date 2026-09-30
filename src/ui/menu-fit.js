// Menus stay in place (owner, 2026-09-29: "It shouldn't scroll, it should be
// an in place menu. All overarching menus should be in place (not the drop
// down scrollable ones)"). A full-screen menu (the main menu's pages, the
// lobby screen) never scrolls: its box is the visible viewport (menu-theme.css:
// 100dvh, safe-area padding, overflow clipped) and a page taller than that
// (a phone with its browser's toolbar showing, a phone on its side, a short
// window) is scaled down, from its top centre, until it fits, then centred in
// the space. Lists inside a page (dropdown grids, the weapon and map lists,
// the settings body) still scroll inside themselves.
//
// The scale is a transform, not a change of layout: every size the layout
// and the lettering fit (button-typography.js) read stays the same, so the
// fitted letters are fitted once. ResizeObservers on the container (the
// toolbar showing or hiding, a turn) and on each page (a page shown, rows
// added or hidden) refit before the next paint; a transform does not change
// the observed sizes, so this never feeds back into itself.

// How much a page `natural` px tall must shrink to fit `available` px, and how
// far down to move it (after scaling from its top) to centre it.
export function fitPlacement(natural, available) {
 if (!(natural > 0) || !(available > 0) || natural <= available + 0.5) return { scale: 1, shift: 0 };
 const scale = Math.floor(available / natural * 1000) / 1000;
 return { scale, shift: Math.max(0, (available - natural * scale) / 2) };
}

const FITTED = 'menu-fitted';
function clear(item) {
 if (!item?.classList?.contains(FITTED)) return;
 item.classList.remove(FITTED); item.style.removeProperty('--fit-scale'); item.style.removeProperty('--fit-shift');
}

// `container`: the full-screen box (a grid that centres its item). `pick()`:
// the element to fit now (the visible page), or null. `items()`: every
// element pick() can return, observed for size changes.
export function installMenuFit(container, { pick, items = () => [] }) {
 if (!container || typeof ResizeObserver !== 'function') return { refit() {} };
 let current = null;
 function refit() {
  const item = pick();
  if (current && current !== item) clear(current);
  current = item;
  if (!item || !container.getClientRects().length || !item.getClientRects().length) return;
  const style = getComputedStyle(container);
  const available = container.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
  const { scale, shift } = fitPlacement(item.offsetHeight, available);
  if (scale >= 1) { clear(item); return; }
  item.classList.add(FITTED);
  item.style.setProperty('--fit-scale', String(scale));
  item.style.setProperty('--fit-shift', `${shift.toFixed(1)}px`);
 }
 const observer = new ResizeObserver(refit);
 observer.observe(container);
 const watched = new Set();
 const watch = () => { for (const item of items()) if (!watched.has(item)) { watched.add(item); observer.observe(item); } };
 watch();
 // Pages or cards made later (the lobby's) join when they appear.
 new MutationObserver(() => { watch(); refit(); }).observe(container, { childList: true });
 // The box is clipped (overflow: clip); where a browser only has hidden, a
 // focus() or scrollIntoView could still shift it: put it back.
 container.addEventListener('scroll', () => { if (container.scrollTop || container.scrollLeft) container.scrollTo(0, 0); }, { passive: true });
 addEventListener('orientationchange', () => setTimeout(refit, 350));
 globalThis.visualViewport?.addEventListener?.('resize', refit);
 refit();
 return { refit };
}
