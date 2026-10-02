// The target lock's marker (target-lock.js): four pink corner brackets round
// the target the arrows (or a swipe) locked, so a keyboard or touch player
// can see what the aim is holding. Subtle: thin, the HUD's pink accent
// (--ui-accent), a short close-in when a target is taken, fainter while the
// lock drifts (a dodge, cover). While the target is hidden the marker sits
// on the drifting aim point, never on the hidden body (no wallhack).
// Hidden with the crosshair in media mode (data-media="crosshair").
// main.js hands it a screen point and radius once a frame.
import { setStyle, setAttr } from './dom-writes.js';

// in: seconds the close-in takes; grow: how much bigger it starts.
// pad: px of space between the body's outline and the brackets; least: the
// smallest half-size (px), so a far target still reads.
export const LOCK_MARKER = Object.freeze({ in: .16, grow: .6, pad: 10, least: 18 });

export function createLockMarker(game) {
 const el = document.createElement('div');
 el.className = 'lock-marker'; el.dataset.media = 'crosshair'; el.setAttribute('aria-hidden', 'true');
 el.innerHTML = '<i></i><i></i><i></i><i></i>';
 el.style.display = 'none';
 game.append(el);
 let shownId = null, age = 0;
 return {
  element: el,
  hide() { if (shownId !== null || el.style.display !== 'none') { setStyle(el, 'display', 'none'); shownId = null; } },
  // (x, y): the target's middle on screen; radius: its body's on-screen
  // radius (px); seen: the target is in sight (not drifting).
  show(id, x, y, radius, seen, dt) {
   if (id !== shownId) { shownId = id; age = 0; } else age += dt;
   const t = Math.min(1, age / LOCK_MARKER.in), ease = 1 - (1 - t) * (1 - t) * (1 - t);
   const half = Math.max(LOCK_MARKER.least, radius + LOCK_MARKER.pad), scale = 1 + LOCK_MARKER.grow * (1 - ease);
   setStyle(el, 'display', 'block');
   setStyle(el, '--lock-size', Math.round(half * 2) + 'px');
   setStyle(el, 'transform', `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0) translate(-50%,-50%) scale(${scale.toFixed(3)})`);
   setStyle(el, 'opacity', ((seen ? 1 : .45) * ease).toFixed(2));
   setAttr(el, 'data-seen', seen ? 'true' : 'false');
  },
 };
}
