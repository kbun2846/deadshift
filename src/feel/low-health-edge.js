// The low-health warning on screen: a red glow round the edge of the screen
// that pulses with the heartbeat (feel/low-health.js decides how strong and
// when). One element, its opacity written only when it changes by a visible
// step (a compositor-only property: no layout). Media mode hides it with the
// vignette (data-media="vignette"). Styles: feel.css.
import { setStyle } from '../ui/dom-writes.js';

export function createLowHealthEdge(parent) {
 const root = document.createElement('div');
 root.className = 'low-health-edge'; root.setAttribute('aria-hidden', 'true'); root.setAttribute('data-media', 'vignette');
 parent.append(root);
 let shown = -1;
 return {
  root,
  // level 0-1 (the warning's strength), pulse 0-1 (the beat's flash).
  set(level, pulse) {
   const v = level > 0 ? Math.min(1, level * (.62 + .38 * pulse)) : 0;
   const q = Math.round(v * 50) / 50;
   if (q === shown) return;
   shown = q;
   setStyle(root, 'opacity', String(q));
   setStyle(root, 'display', q > 0 ? 'block' : 'none');
  },
  clear() { this.set(0, 0); },
 };
}
