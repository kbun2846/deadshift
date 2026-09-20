// Deterministic, irregular tiles: simulation owns burning and removal, not graphics.
export const CROP_FIRE = Object.freeze({ duration: 8, spreadDelay: 1.5, damagePerSecond: 10 });
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
// Shared visibility rule for practice targets and future remote players.
export function cropEntityVisible(crops, viewer, entity) {
  if (viewer === entity || (viewer.id && viewer.id === entity.id)) return true;
  const cover = cropAt(crops, entity), viewerCover = cropAt(crops, viewer);
  if (viewerCover && (cover || cropImmersion(crops,viewer)?.full) && Math.hypot(entity.x - viewer.x, entity.z - viewer.z) > viewerCover.visibility) return false;
  if (!cover) return true;
  return !!viewerCover && viewerCover.fieldId === cover.fieldId;
}
export function cropSegments(map) {
  const segments = [];
  for (const f of map.crops || []) {
    const weights = Array.from({ length: 8 }, (_, i) => .85 + (Math.sin(i * 7 + 3) + 1) * .25);
    const sum = weights.reduce((a, b) => a + b, 0);
    let z = f.z - f.d / 2;
    for (let row = 0; row < 8; row++) {
      const d = f.d * weights[row] / sum;
      const widths = Array.from({ length: 7 }, (_, i) => .7 + (Math.sin(i * 13 + row * 7) + 1) * .4);
      const total = widths.reduce((a, b) => a + b, 0); let x = f.x - f.w / 2;
      for (let col = 0; col < 7; col++) {
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
export function cropCircle(sim, origin, radius, electric, clear) {
  for (const s of sim.crops) {
    const point = cropPoint(s, origin);
    if (Math.hypot(point.x - origin.x, point.z - origin.z) <= radius && clear(origin, point)) affectCrop(sim, s, electric);
  }
}
export function stepCrops(sim, dt, clear) {
  const ignite = new Set();
  // One exposure per entity, even on shared boundaries; never multiply overlapping fires.
  for (const entity of [sim.player, ...sim.targets]) {
    if (entity.hp <= 0) continue;
    let exposure = 0;
    for (const s of sim.crops) if (s.state === 'burning' && Math.abs(entity.x - s.x) <= s.w / 2 + 1e-8 && Math.abs(entity.z - s.z) <= s.d / 2 + 1e-8)
      exposure = Math.max(exposure, Math.min(dt, Math.max(0, CROP_FIRE.duration - s.burnAge)));
    if (exposure > 0) sim.damageEnvironment(entity, exposure * CROP_FIRE.damagePerSecond);
  }
  for (const s of sim.crops) if (s.state === 'burning') {
    s.burnAge += dt;
    s.scorch = Math.min(1, s.burnAge / CROP_FIRE.duration);
    if (s.burnAge >= CROP_FIRE.spreadDelay && !s.spread) {
      s.spread = true;
      for (const id of s.neighbors) {
        const next = sim.crops.find(n => n.id === id);
        if (next.state === 'standing' && clear(s, next)) ignite.add(next);
      }
    }
    if (s.burnAge >= CROP_FIRE.duration - 1e-8) { s.state = 'gone'; s.scorch = 1; sim.events.push({ type: 'cropAsh', x: s.x, z: s.z, w: s.w, d: s.d }); }
  }
  for (const s of ignite) affectCrop(sim, s);
}
