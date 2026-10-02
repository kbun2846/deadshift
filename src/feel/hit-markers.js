// Hit markers that say how hard you hit (owner-approved: "small tick for a
// graze, bigger for big hits, a red X for the kill"; a one-shot its own
// marker). Drawn where the hit landed, like the old single diamond: four
// short ticks round the point for a hit (shorter and finer for a graze,
// longer, thicker and pushed out for a big hit), a red X for a kill, and for
// a one-shot a white-hot X in a red ring that bursts outward.
//
// The markers live in the old #hit-marker element (index.html), so every rule
// that hides it (the death screen, the 1V1 aftermath, the robot lab, media
// mode's crosshair toggle) hides them too. A few pooled elements, reused in
// turn; each is placed with one transform and replayed by flipping its
// animation between two names (data-play a / b), so nothing is created or
// laid out per hit. Styles: styles/feel.css.
import { FEEL } from '../config/feel.js';
import { setStyle, setAttr } from '../ui/dom-writes.js';

export function createHitMarkers(host, cfg = FEEL.marker) {
 host.className = 'hit-markers';
 host.setAttribute('aria-hidden', 'true');
 const pool = [];
 for (let i = 0; i < cfg.pool; i++) {
  const el = document.createElement('div');
  el.className = 'hm';
  el.innerHTML = '<i></i><i></i><i></i><i></i><b></b>';
  host.append(el);
  pool.push({ el, play: 'a', left: 0 });
 }
 let next = 0;
 return {
  // kind: 'tick' | 'hit' | 'big' | 'kill' | 'oneshot' | 'blocked'; weight
  // 0-1 inside its tier; (x, y) on screen.
  show(kind, x, y, weight = .5) {
   const slot = pool[next]; next = (next + 1) % pool.length;
   slot.play = slot.play === 'a' ? 'b' : 'a';
   slot.left = kind === 'oneshot' ? cfg.oneShotLife : kind === 'kill' ? cfg.killLife : cfg.life;
   setStyle(slot.el, 'transform', `translate(${Math.round(x)}px,${Math.round(y)}px)`);
   setStyle(slot.el, '--hw', (Math.round(weight * 100) / 100).toString());
   setAttr(slot.el, 'data-kind', kind);
   setAttr(slot.el, 'data-play', slot.play);
  },
  // Real seconds: finished markers are put away (display none, off the compositor).
  update(dt) {
   for (const slot of pool) if (slot.left > 0) { slot.left -= dt; if (slot.left <= 0) setAttr(slot.el, 'data-play', ''); }
  },
  clear() { for (const slot of pool) { slot.left = 0; setAttr(slot.el, 'data-play', ''); } },
 };
}
