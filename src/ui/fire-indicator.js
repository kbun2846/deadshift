// Where the shooting is: when someone you can hear fires (another player or
// a robot, on screen or off it), a pink arc fades in on a ring round you, on
// the side the shots come from, shivers a little, and fades out. Shots from
// every side light the whole ring. Louder (nearer) shots are brighter.
//
// One small 2D canvas over the game, drawn only while something is showing:
// 32 slices of the ring, each with a level that rises fast and fades slowly.
export const FIRE_INDICATOR = Object.freeze({ slices: 32, rise: 14, fade: 1.3, spread: 2, radius: .3, width: 12, floor: .4, hold: .35, color: '255,92,160' });

export function createFireIndicator(parent) {
 return createDirectionalIndicator(parent, FIRE_INDICATOR, 'fire-indicator');
}

// Shared drawing keeps the hit arc in the same visual language as gunfire.
export function createDirectionalIndicator(parent, look, className) {
 const canvas = document.createElement('canvas'); canvas.className = className; canvas.setAttribute('aria-hidden', 'true');
 parent.append(canvas);
 const ctx = canvas.getContext('2d'), n = look.slices;
 const want = new Float32Array(n), level = new Float32Array(n), held = new Float32Array(n);
 let showing = false, time = 0, surroundLevel = 0, surroundHeld = 0, surroundAge = 0;
 function light(i, strength) {
  if (strength > want[i] || look.instant && strength > 0 && strength === want[i]) {
   want[i] = Math.max(want[i], strength); held[i] = look.hold;
   if (look.instant) level[i] = want[i];
  }
 }
 function drawArc(cx, cy, radius, start, end, width, a) {
  ctx.beginPath(); ctx.arc(cx, cy, radius, start, end);
  ctx.strokeStyle = `rgba(${look.color},${((look.softness ?? .28) * a).toFixed(3)})`; ctx.lineWidth = width * (1.6 + .8 * a); ctx.stroke();
  ctx.strokeStyle = `rgba(${look.color},${Math.min(1, 1.3 * a).toFixed(3)})`; ctx.lineWidth = width * (.6 + .4 * a); ctx.stroke();
 }
 return {
  // A shot heard from `angle` (screen radians, 0 = right, clockwise) at `strength` 0-1.
  add(angle, strength) {
   if (!(strength > 0) || !Number.isFinite(angle)) return;
   // Even a faint shot shows clearly; nearer ones are brighter still.
   strength = look.floor + (1 - look.floor) * Math.min(1, strength);
   const at = ((angle / (Math.PI * 2)) % 1 + 1) % 1 * n;
   for (let d = -look.spread - 1; d <= look.spread + 1; d++) {
    const i = ((Math.round(at) + d) % n + n) % n, near = 1 - Math.min(1, Math.abs(Math.round(at) + d - at) / (look.spread + 1));
    light(i, strength * near);
   }
  },
  // Underfoot damage has no bearing. Keep its pulse separate so continuous
  // fire neither fills directional gaps nor keeps an old hit direction alive.
  surround(strength) {
   if (!(strength > 0)) return;
   if (look.surroundSegments) {
    if (surroundLevel <= .01) surroundAge = 0;
    surroundLevel = Math.max(surroundLevel, Math.min(1, strength)); surroundHeld = look.hold;
   } else for (let i = 0; i < n; i++) light(i, Math.min(1, strength));
  },
  clear() { want.fill(0); level.fill(0); held.fill(0); surroundLevel = surroundHeld = surroundAge = 0; if (showing) { ctx.clearRect(0, 0, canvas.width, canvas.height); showing = false; } },
  // Once a frame. `cx`, `cy`: your position on screen (CSS pixels).
  update(dt, cx, cy, width, height) {
   time += dt;
   surroundAge += dt;
   const surroundFading = Math.max(0, dt - surroundHeld); surroundHeld = Math.max(0, surroundHeld - dt);
   surroundLevel = Math.max(0, surroundLevel - surroundFading * look.fade);
   let any = surroundLevel > .01;
   for (let i = 0; i < n; i++) {
    if (look.instant) {
     const fading = Math.max(0, dt - held[i]); held[i] = Math.max(0, held[i] - dt);
     level[i] = want[i] = Math.max(0, want[i] - fading * look.fade);
    } else {
     if (want[i] > level[i]) level[i] = Math.min(want[i], level[i] + dt * look.rise);
     else level[i] = Math.max(0, level[i] - dt * look.fade);
     if (held[i] > 0) held[i] -= dt; else want[i] = Math.max(0, want[i] - dt * look.fade * 1.4);
    }
    if (level[i] > .01) any = true;
   }
   if (!any && !showing) return;
   // (Soft arcs: drawn at no more than 1.25x, not the screen's 2x, v0.999a: a quarter
   // of the canvas pixels on an iPad or a retina laptop, every frame of a fight.)
   const ratio = Math.min(1.25, devicePixelRatio || 1), w = Math.round(width * ratio), h = Math.round(height * ratio);
   if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
   ctx.setTransform(ratio, 0, 0, ratio, 0, 0); ctx.clearRect(0, 0, width, height);
   showing = any; if (!any) return;
   const r = Math.max(1, Math.min(width, height) * look.radius - (look.inset || 0)), step = Math.PI * 2 / n;
   ctx.lineCap = 'round';
   if (surroundLevel > .01) {
    const pulse = .25 + .75 * (.5 + .5 * Math.cos(surroundAge * Math.PI * 2 / look.surroundPeriod));
    const segment = Math.PI * 2 / look.surroundSegments, half = segment * look.surroundCoverage / 2;
    for (let i = 0; i < look.surroundSegments; i++) {
     drawArc(cx, cy, r, i * segment - half, i * segment + half, look.width * .72, surroundLevel * pulse);
    }
   }
   for (let i = 0; i < n; i++) {
    const a = level[i]; if (a <= .01) continue;
    // A slight shiver: the arc's radius and ends move a little, per slice.
    const jitter = Math.sin(time * 47 + i * 3.1) * (look.jitter ?? 2.2) * a, start = i * step - step * .5 - .01, end = start + step + .02;
    // A soft wide stroke under a bright narrow one (a canvas shadow blur on
    // every arc was costly on phones).
    drawArc(cx, cy, r + jitter, start, end, look.width, a);
   }
  },
 };
}
