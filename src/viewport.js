// The game's size in CSS pixels: the #game element's box (fixed to the layout
// viewport), not window.innerWidth/innerHeight. On iOS those follow the
// *visual* viewport, so any zoom (a double tap, a pinch) used to shrink the
// canvas to the zoomed part: a quarter of the screen drawn, the rest the page
// colour. The element's box stays the same while zoomed and follows the
// browser's toolbars showing and hiding. Everything that sizes or maps
// against the screen (renderer, aim overlay, touch layout, menus) reads this.
// The size is cached: reading clientWidth after the HUD has changed forces a
// synchronous layout, and the game asks many times a frame (it showed up in
// profiles). Any resize (window, visual viewport, orientation, or the element
// itself) drops the cache, so the next read measures again.
let box = null, width = 0, height = 0;
const element = () => (box && box.isConnected ? box : (width = 0, box = typeof document !== 'undefined' && typeof document.getElementById === 'function' ? document.getElementById('game') : null));
const forget = () => { width = 0; };
if (typeof addEventListener === 'function') {
 addEventListener('resize', forget, true); addEventListener('orientationchange', forget);
 globalThis.visualViewport?.addEventListener?.('resize', forget);
}
let observed = null;
function measure() {
 const e = element();
 if (e && observed !== e && typeof ResizeObserver === 'function') { observed = e; new ResizeObserver(forget).observe(e); }
 if (!width && e && e.clientWidth) { width = e.clientWidth; height = e.clientHeight; }
 return e && width;
}
export function viewWidth() { return measure() ? width : (typeof innerWidth === 'number' ? innerWidth : 1); }
export function viewHeight() { return measure() ? height : (typeof innerHeight === 'number' ? innerHeight : 1); }
