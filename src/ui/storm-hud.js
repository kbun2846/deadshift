// The storm's readout (storm.js), and the screen's tension as a match or a
// round nears its end (owner, 2026-09-29: FFA "should stay there and the game
// should have effects and stuff showing how close the game is getting to the
// end, building tension").
//  - A small line under the health bar: STORM CLOSING 1:42 (to the final
//    zone), FINAL ZONE 0:24 (team rounds: to sudden death; FFA: to the end),
//    SUDDEN DEATH; red, with a thin bar running down.
//  - body.storm-final while the final zone holds, body.storm-sudden in sudden
//    death / FFA's last seconds: the match clock pulses red and a red vignette
//    breathes at the screen's edges (menu-theme.css), faster the closer the end.
// Nothing here shows the storm's damage (owner: "the ongame indicators of
// sound/damage shouldnt show this damage").
import { setStyle, setText } from './dom-writes.js';

const clock = s => { const t = Math.max(0, Math.ceil(s)); return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'); };

// `parent`: the game (the vignette); `under`: what the readout sits under
// (the health bar, so it follows it wherever a mode puts it).
export function createStormHud(parent, under = parent) {
 const root = document.createElement('div'); root.className = 'storm-hud'; root.hidden = true; root.setAttribute('aria-live', 'off');
 root.innerHTML = '<span class="storm-label"></span><b class="storm-time"></b><i class="storm-bar"><s></s></i>';
 const vignette = document.createElement('div'); vignette.className = 'storm-vignette'; vignette.setAttribute('aria-hidden', 'true');
 under.append(root); parent.append(vignette);
 const label = root.querySelector('.storm-label'), time = root.querySelector('.storm-time'), bar = root.querySelector('.storm-bar s');
 let shown = '';
 return {
  // `phase`: stormPhase() ({ phase, left }) or null; `end`: seconds left in an
  // FFA match (its final zone counts down to that), else null; `tension` 0-1.
  update(phase, { end = null, tension = 0, total = 0 } = {}) {
   const on = !!phase;
   if (root.hidden !== !on) root.hidden = !on;
   const body = document.body;
   body.classList.toggle('storm-final', on && phase.phase !== 'closing');
   body.classList.toggle('storm-sudden', on && (phase.phase === 'sudden' || tension > .8));
   setStyle(vignette, 'opacity', on ? (tension * .9).toFixed(2) : '0');
   setStyle(vignette, 'animation-duration', (1.6 - tension * 1.05).toFixed(2) + 's');
   if (!on) { shown = ''; return; }
   const left = phase.phase === 'final' && end != null ? end : phase.left;
   const name = phase.phase === 'closing' ? 'STORM CLOSING' : phase.phase === 'final' ? 'FINAL ZONE' : 'SUDDEN DEATH';
   const text = Number.isFinite(left) ? clock(left) : '';
   const key = name + text;
   if (key !== shown) { shown = key; setText(label, name); setText(time, text); root.dataset.phase = phase.phase; }
   setStyle(bar, 'transform', `scaleX(${total > 0 && Number.isFinite(left) ? Math.max(0, Math.min(1, left / total)).toFixed(3) : 0})`);
  },
 };
}
