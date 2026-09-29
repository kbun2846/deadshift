// Deterministic, irregular tiles: simulation owns burning and removal, not graphics.
export const CROP_FIRE = Object.freeze({ duration: 8, spreadDelay: 1.5, damagePerSecond: 25 });
export function cropAt(crops, point) {
  return crops.find(s => s.state !== 'gone' && Math.abs(point.x - s.x) <= s.w / 2 + 1e-8 && Math.abs(point.z - s.z) <= s.d / 2 + 1e-8) || null;
}
export function cropImmersion(crops,point,radius=.38) {
  const near=cropAt(crops,point)||crops.find(s=>s.state!=='gone'&&Math.hypot(Math.max(0,Math.abs(point.x-s.x)-s.w/2),Math.max(0,Math.abs(point.z-s.z)-s.d/2))<radius);
  if(!near)return null;
  const field=crops.filter(s=>s.fieldId===near.fieldId);
  const left=Math.min(...field.map(s=>s.x-s.w/2)),right=Math.max(...field.map(s=>s.x+s.w/2));
  const top=Math.min(...field.map(s=>s.z-s.d/2)),bottom=Math.max(...field.map(s=>s.z+s.d/2));
  let clearance=Math.min(point.x-left,right-point.x,point.z-top,bottom-point.z);
  for(const s of field)if(s.state==='gone')clearance=Math.min(clearance,Math.hypot(Math.max(0,Math.abs(point.x-s.x)-s.w/2),Math.max(0,Math.abs(point.z-s.z)-s.d/2)));
  if(!cropAt(crops,point))clearance=Math.min(0,clearance);
  const smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
  return {crop:near,full:clearance>=radius,entryOpacity:smooth((clearance+radius)/.9),outerOpacity:smooth((clearance-radius)/2),sections:field.filter(s=>s.state!=='gone')};
}
// (v0.999a, owner: "remove all features that involve going into crops to hide.
// Players should be visible inside of crops to all players ... they should
// still burn ... but they shouldn't do all the darkness stuff.") Nobody is
// hidden by a crop any more, from players or robots; kept as the one place
// the rule lives.
export function cropEntityVisible() { return true; }
export function cropSegments(map) {
  const segments = [];
  for (const f of map.crops || []) {
    // (s2-props: a field may set its own rows and cols; Deadwater's are 8 x 7.)
    const rows = f.rows || 8, cols = f.cols || 7;
    const weights = Array.from({ length: rows }, (_, i) => .85 + (Math.sin(i * 7 + 3) + 1) * .25);
    const sum = weights.reduce((a, b) => a + b, 0);
    let z = f.z - f.d / 2;
    for (let row = 0; row < rows; row++) {
      const d = f.d * weights[row] / sum;
      const widths = Array.from({ length: cols }, (_, i) => .7 + (Math.sin(i * 13 + row * 7) + 1) * .4);
      const total = widths.reduce((a, b) => a + b, 0); let x = f.x - f.w / 2;
      for (let col = 0; col < cols; col++) {
        const w = f.w * widths[col] / total;
        segments.push({ id: `${f.id}-${row}-${col}`, fieldId: f.id, x: x + w / 2, z: z + d / 2, w, d, visibility: f.visibility, state: 'standing', burnAge: 0 }); x += w;
      }
      z += d;
    }
  }
  for (const a of segments) a.neighbors = segments.filter(b => b !== a && b.fieldId === a.fieldId &&
    Math.max(0, Math.abs(a.x - b.x) - (a.w + b.w) / 2) < .02 &&
    Math.max(0, Math.abs(a.z - b.z) - (a.d + b.d) / 2) < .02).map(b => b.id);
  return segments;
}
export const cropPoint = (s, p) => ({ x: Math.max(s.x - s.w / 2, Math.min(s.x + s.w / 2, p.x)), z: Math.max(s.z - s.d / 2, Math.min(s.z + s.d / 2, p.z)) });
export function affectCrop(sim, s, electric = false) {
  if (s.state === 'gone' || (!electric && s.state === 'burning')) return;
  s.state = electric ? 'gone' : 'burning'; s.burnAge = 0;
  if (!electric) s.charred = true;
  sim.events.push({ type: electric ? 'cropDust' : 'cropIgnite', x: s.x, z: s.z, w: s.w, d: s.d });
}
// Cut through (v0.999a, owner: "when melee weapons cut through the crops, they
// shouldn't break like holes, like squares. They should break in the parts
// where the melee weapon actually cuts ... maybe a little bit more"). A cut no
// longer takes whole tiles away: it is a shape (the blade's sweep, or the
// line a draw-cut or blood wave runs down), and only the stalks inside it,
// plus `CROP_CUT_MARGIN`, fall (world/crop-view.js). The tiles stay standing,
// so a mown field still burns and spreads fire as before; crops hide nobody
// now, so nothing in the rules depends on the stalks being up.
//   line: { kind: 'line', ax, az, bx, bz, r }            (r: half its width)
//   arc:  { kind: 'arc', x, z, cx, cz, reach, arc }       (cx, cz: its middle)
export const CROP_CUT_MARGIN = .25;
export function cropCutMeets(cut, x, z, margin = CROP_CUT_MARGIN) {
  if (cut.kind === 'line') {
    const ux = cut.bx - cut.ax, uz = cut.bz - cut.az, l2 = ux * ux + uz * uz;
    const t = l2 > 1e-9 ? Math.max(0, Math.min(1, ((x - cut.ax) * ux + (z - cut.az) * uz) / l2)) : 0;
    return Math.hypot(x - cut.ax - ux * t, z - cut.az - uz * t) <= cut.r + margin;
  }
  const dx = x - cut.x, dz = z - cut.z, d = Math.hypot(dx, dz);
  if (d > cut.reach + margin) return false;
  if (d < .45 || cut.arc >= Math.PI * 2 - 1e-6) return true;
  let a = Math.atan2(dz, dx) - Math.atan2(cut.cz, cut.cx);
  a = Math.atan2(Math.sin(a), Math.cos(a));
  // The margin as an angle at that distance: a little past the arc's ends.
  return Math.abs(a) <= cut.arc / 2 + margin / Math.max(d, .5);
}
// The cut's box, for effects and for finding the stalks it may reach.
export function cropCutBox(cut) {
  const m = CROP_CUT_MARGIN;
  if (cut.kind === 'line') { const r = cut.r + m; return { x0: Math.min(cut.ax, cut.bx) - r, x1: Math.max(cut.ax, cut.bx) + r, z0: Math.min(cut.az, cut.bz) - r, z1: Math.max(cut.az, cut.bz) + r }; }
  const r = cut.reach + m; return { x0: cut.x - r, x1: cut.x + r, z0: cut.z - r, z1: cut.z + r };
}
// One event per stroke that reaches a standing or burning field (`tiles`: the
// ones it met; none, nothing happens). `dx`, `dz`: the way the chaff flies.
export function cutCrops(sim, cut, tiles, dx = 0, dz = 0) {
  if (!tiles.length) return false;
  sim.events.push({ type: 'cropCut', ...cut, dx, dz });
  return true;
}
export function cropCircle(sim, origin, radius, electric, clear) {
  for (const s of sim.crops) {
    const point = cropPoint(s, origin);
    if (Math.hypot(point.x - origin.x, point.z - origin.z) <= radius && clear(origin, point)) affectCrop(sim, s, electric);
  }
}
export function stepCrops(sim, dt, clear) {
  // (v0.999a: nothing is made and nothing walked for every body when no crop
  // burns, which is nearly every step; indexed loops, no spread of the bodies.
  // Same order and results as before.)
  const crops = sim.crops, burning = [];
  for (let i = 0; i < crops.length; i++) if (crops[i].state === 'burning') burning.push(crops[i]);
  if (!burning.length) return;
  const ignite = new Set();
  // One exposure per entity, even on shared boundaries; never multiply overlapping fires.
  const exposeTo = entity => {
    if (entity.hp <= 0) return;
    let exposure = 0;
    for (const s of burning) if (Math.abs(entity.x - s.x) <= s.w / 2 + 1e-8 && Math.abs(entity.z - s.z) <= s.d / 2 + 1e-8)
      exposure = Math.max(exposure, Math.min(dt, Math.max(0, CROP_FIRE.duration - s.burnAge)));
    if (exposure > 0) sim.damageEnvironment(entity, exposure * CROP_FIRE.damagePerSecond);
  };
  exposeTo(sim.player);
  for (let i = 0; i < sim.targets.length; i++) exposeTo(sim.targets[i]);
  for (const s of burning) {
    s.burnAge += dt;
    s.scorch = Math.min(1, s.burnAge / CROP_FIRE.duration);
    if (s.burnAge >= CROP_FIRE.spreadDelay && !s.spread) {
      s.spread = true;
      for (const id of s.neighbors) {
        const next = crops.find(n => n.id === id);
        if (next.state === 'standing' && clear(s, next)) ignite.add(next);
      }
    }
    if (s.burnAge >= CROP_FIRE.duration - 1e-8) { s.state = 'gone'; s.scorch = 1; sim.events.push({ type: 'cropAsh', x: s.x, z: s.z, w: s.w, d: s.d }); }
  }
  for (const s of ignite) affectCrop(sim, s);
}
