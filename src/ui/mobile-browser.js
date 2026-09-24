// Playing in a phone's browser, not an app: the browser's own gestures and
// chrome get in the way. This takes them off the game's hands.
//   - Zoom: no double-tap zoom and no pinch zoom (iOS ignores the viewport's
//     user-scalable=no, so its gesture events and quick second taps are
//     cancelled here; menus' buttons and fields keep their taps). If the
//     page does end up zoomed, it is snapped back to 1:1 (re-applying the
//     viewport tag is what makes iOS reset its zoom).
//   - Scrolling: no rubber-band bounce or pull-to-refresh; only a menu that
//     really scrolls (a long settings list) takes a drag.
//   - Long press: no callout menu or text selection.
//   - Size: the canvas follows the game's box (viewport.js) and is resized
//     whenever the toolbars show or hide, the phone turns, or the visual
//     viewport changes, again a moment after a turn (iOS reports the old size
//     first).
//   - Full screen: on touch, starting a game asks the browser for full screen
//     (hides the address bar and toolbars) when it can and the setting is on
//     (Settings > Mobile > FULL SCREEN). iPhones have no full-screen for pages;
//     there, Share > Add to Home Screen opens the game as its own full-screen
//     app (manifest + apple-mobile-web-app tags in index.html).
const INTERACTIVE = 'button,input,select,textarea,a,label,summary,[role=button],[role=tab],[contenteditable=true]';

export function fullscreenSupported() {
 const d = typeof document !== 'undefined' ? document.documentElement : null;
 return !!(d && (d.requestFullscreen || d.webkitRequestFullscreen)) && !isStandalone();
}
export function isStandalone() {
 return typeof matchMedia === 'function' && (matchMedia('(display-mode: fullscreen)').matches || matchMedia('(display-mode: standalone)').matches || navigator.standalone === true);
}
export function isFullscreen() { return !!(document.fullscreenElement || document.webkitFullscreenElement); }

// From a tap or click (browsers only allow it from one). Never throws.
export function enterFullscreen() {
 if (!fullscreenSupported() || isFullscreen()) return;
 const d = document.documentElement;
 try {
  const done = d.requestFullscreen ? d.requestFullscreen({ navigationUI: 'hide' }) : d.webkitRequestFullscreen();
  done?.catch?.(() => {});
 } catch { /* inside a frame that does not allow it, and so on */ }
}

// A zoomed-in page on iOS goes back to 1:1 when the viewport tag changes.
function unzoom() {
 const tag = document.querySelector('meta[name=viewport]'); if (!tag) return;
 const content = tag.getAttribute('content');
 tag.setAttribute('content', content + ',x'); tag.setAttribute('content', content);
}

// Is there something under this touch that scrolls the way it could move?
function scrollableFrom(target) {
 for (let e = target instanceof Element ? target : null; e && e !== document.body; e = e.parentElement) {
  const style = getComputedStyle(e);
  if ((/(auto|scroll)/.test(style.overflowY) && e.scrollHeight > e.clientHeight + 1) || (/(auto|scroll)/.test(style.overflowX) && e.scrollWidth > e.clientWidth + 1)) return true;
 }
 return false;
}

export function installMobileBrowser({ onResize }) {
 const opts = { passive: false };
 // iOS pinch zoom.
 for (const type of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(type, e => e.preventDefault(), opts);
 // Two fingers never zoom; one finger only scrolls what can scroll.
 document.addEventListener('touchmove', e => {
  if (e.touches.length > 1) { e.preventDefault(); return; }
  if (e.target instanceof Element && e.target.closest('input[type=range]')) return; // sliders drag
  if (!scrollableFrom(e.target)) e.preventDefault();
 }, opts);
 // A quick second tap outside the menus' controls would zoom on iOS.
 let lastTap = 0, lastX = 0, lastY = 0;
 document.addEventListener('touchend', e => {
  const t = e.changedTouches[0], now = performance.now();
  const quick = now - lastTap < 350 && t && Math.hypot(t.clientX - lastX, t.clientY - lastY) < 40;
  if (quick && !(e.target instanceof Element && e.target.closest(INTERACTIVE))) e.preventDefault();
  lastTap = now; if (t) { lastX = t.clientX; lastY = t.clientY; }
 }, opts);
 document.addEventListener('dblclick', e => { if (!(e.target instanceof Element && e.target.closest('input,textarea'))) e.preventDefault(); }, opts);
 // Long press: no callout (images, links) on touch.
 document.addEventListener('contextmenu', e => { if (e.pointerType === 'touch' || matchMedia('(pointer: coarse)').matches) e.preventDefault(); });
 // Size changes the window's resize event misses or reports early.
 let queued = 0;
 const resize = () => { if (queued) return; queued = requestAnimationFrame(() => { queued = 0; onResize(); }); };
 const vv = window.visualViewport;
 vv?.addEventListener('resize', () => { if (vv.scale > 1.01) unzoom(); resize(); });
 addEventListener('orientationchange', () => { resize(); setTimeout(resize, 350); setTimeout(resize, 900); });
 document.addEventListener('fullscreenchange', resize); document.addEventListener('webkitfullscreenchange', resize);
 const game = document.getElementById('game');
 if (game && typeof ResizeObserver === 'function') new ResizeObserver(resize).observe(game);
}
