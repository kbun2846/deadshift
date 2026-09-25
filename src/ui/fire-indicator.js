// Where the shooting is: when someone you can hear fires (another player or
// a robot, on screen or off it), a pink arc fades in on a ring round you, on
// the side the shots come from, shivers a little, and fades out. Shots from
// every side light the whole ring. Louder (nearer) shots are brighter.
//
// One small 2D canvas over the game, drawn only while something is showing:
// 32 slices of the ring, each with a level that rises fast and fades slowly.
export const FIRE_INDICATOR = Object.freeze({ slices: 32, rise: 14, fade: 1.3, spread: 2, radius: .3, width: 12, floor: .4, hold: .35, color: '255,92,160' });

export function createFireIndicator(parent) {
 const canvas = document.createElement('canvas'); canvas.className = 'fire-indicator'; canvas.setAttribute('aria-hidden', 'true');
 parent.append(canvas);
 const ctx = canvas.getContext('2d'), n = FIRE_INDICATOR.slices;
 const want = new Float32Array(n), level = new Float32Array(n), held = new Float32Array(n);
 let showing = false, time = 0;
 return {
  // A shot heard from `angle` (screen radians, 0 = right, clockwise) at `strength` 0-1.
  add(angle, strength) {
   if (!(strength > 0)) return;
   // Even a faint shot shows clearly; nearer ones are brighter still.
   strength = FIRE_INDICATOR.floor + (1 - FIRE_INDICATOR.floor) * Math.min(1, strength);
   const at = ((angle / (Math.PI * 2)) % 1 + 1) % 1 * n;
   for (let d = -FIRE_INDICATOR.spread - 1; d <= FIRE_INDICATOR.spread + 1; d++) {
    const i = ((Math.round(at) + d) % n + n) % n, near = 1 - Math.min(1, Math.abs(Math.round(at) + d - at) / (FIRE_INDICATOR.spread + 1));
    const s = strength * near; if (s > want[i]) { want[i] = s; held[i] = FIRE_INDICATOR.hold; }
   }
  },
  clear() { want.fill(0); level.fill(0); held.fill(0); if (showing) { ctx.clearRect(0, 0, canvas.width, canvas.height); showing = false; } },
  // Once a frame. `cx`, `cy`: your position on screen (CSS pixels).
  update(dt, cx, cy, width, height) {
   time += dt;
   let any = false;
   for (let i = 0; i < n; i++) {
    if (want[i] > level[i]) level[i] = Math.min(want[i], level[i] + dt * FIRE_INDICATOR.rise);
    else level[i] = Math.max(0, level[i] - dt * FIRE_INDICATOR.fade);
    if (held[i] > 0) held[i] -= dt; else want[i] = Math.max(0, want[i] - dt * FIRE_INDICATOR.fade * 1.4);
    if (level[i] > .01) any = true;
   }
   if (!any && !showing) return;
   const ratio = Math.min(2, devicePixelRatio || 1), w = Math.round(width * ratio), h = Math.round(height * ratio);
   if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
   ctx.setTransform(ratio, 0, 0, ratio, 0, 0); ctx.clearRect(0, 0, width, height);
   showing = any; if (!any) return;
   const r = Math.min(width, height) * FIRE_INDICATOR.radius, step = Math.PI * 2 / n;
   ctx.lineCap = 'round';
   for (let i = 0; i < n; i++) {
    const a = level[i]; if (a <= .01) continue;
    // A slight shiver: the arc's radius and ends move a little, per slice.
    const jitter = Math.sin(time * 47 + i * 3.1) * 2.2 * a, start = i * step - step * .5 - .01, end = start + step + .02;
    // A soft wide stroke under a bright narrow one (a canvas shadow blur on
    // every arc was costly on phones).
    ctx.beginPath(); ctx.arc(cx, cy, r + jitter, start, end);
    ctx.strokeStyle = `rgba(${FIRE_INDICATOR.color},${(.28 * a).toFixed(3)})`; ctx.lineWidth = FIRE_INDICATOR.width * (1.6 + .8 * a); ctx.stroke();
    ctx.strokeStyle = `rgba(${FIRE_INDICATOR.color},${Math.min(1, 1.3 * a).toFixed(3)})`; ctx.lineWidth = FIRE_INDICATOR.width * (.6 + .4 * a); ctx.stroke();
   }
  },
 };
}
