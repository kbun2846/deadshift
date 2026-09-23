// Other players' shots, drawn with the same views as your own.
//
// The views (renderer orbs, rifle-view bullets, shotgun-view pellets,
// grenade-view grenades) draw from a sim's lists. In multiplayer those lists
// only hold what your own sim fires, so for drawing we hand the views a
// "draw sim": your sim with everyone else's projectiles appended.
//
// pack() turns one player's sim into a small, rounded list (it travels in
// snapshots). ProjectileMirror keeps a stable object per projectile (the
// views track some by identity, e.g. pellet trails) and moves each one along
// its velocity between snapshots so fast rounds do not stutter at 20 Hz.
// Orb ids are made unique per player (slot * 1e6 + id), because each sim
// counts its own from 1 and the renderer keys orbs by id.
import { RIFLE } from '../config/gameplay.js';

const PELLET_SPEED = 85;
const r2 = v => Math.round(v * 100) / 100;

export function pack(sim) {
 const orb = s => ({ id: s.id, x: r2(s.x), z: r2(s.z), vx: r2(s.vx || 0), vz: r2(s.vz || 0), age: r2(s.age || 0), launched: !!s.launched, hex: !!s.hex,
  originX: s.originX, originZ: s.originZ, muzzleX: s.muzzleX, muzzleZ: s.muzzleZ });
 return {
  orbs: sim.shots.filter(s => !s.dead).map(orb),
  hex: sim.hexOrbs.filter(s => !s.dead).map(orb),
  bullets: sim.rifleBullets.filter(b => !b.dead).map(b => ({ x: r2(b.x), z: r2(b.z), dx: r2(b.dx), dz: r2(b.dz), travel: r2(b.travel) })),
  pellets: sim.shotgunPellets.filter(b => !b.dead).map(b => ({ x: r2(b.x), z: r2(b.z), dx: r2(b.dx), dz: r2(b.dz), travel: r2(b.travel), range: b.range })),
  grenades: sim.grenades.filter(g => g.released).map(g => ({ id: g.id, x: r2(g.x), y: r2(g.y), z: r2(g.z), age: r2(g.age), flight: g.flight, released: true })),
 };
}

export class ProjectileMirror {
 constructor() { this.byPlayer = new Map(); }

 // `packed`: { [slot]: pack() output }; `now`: seconds. Anyone missing is gone.
 update(packed, now) {
  const seen = new Set();
  for (const [slotText, lists] of Object.entries(packed || {})) {
   const slot = Number(slotText); seen.add(slot);
   const old = this.byPlayer.get(slot) || { orbs: new Map(), bullets: [], pellets: [], grenades: new Map() };
   const base = (slot + 1) * 1e6;
   const orbs = new Map();
   for (const s of [...(lists.orbs || []), ...(lists.hex || [])]) {
    const id = base + s.id, kept = old.orbs.get(id) || {};
    orbs.set(id, Object.assign(kept, s, { id, stamp: now }));
   }
   // Bullets and pellets carry no id: matched by order, which is stable
   // because each list only ever loses its oldest rounds and gains new ones.
   const keep = (previous, list) => list.map((b, i) => Object.assign(previous[i] || {}, b, { stamp: now }));
   const grenades = new Map();
   for (const g of lists.grenades || []) { const id = base + g.id; grenades.set(id, Object.assign(old.grenades.get(id) || {}, g, { id, stamp: now })); }
   this.byPlayer.set(slot, { orbs, bullets: keep(old.bullets, lists.bullets || []), pellets: keep(old.pellets, lists.pellets || []), grenades });
  }
  for (const slot of [...this.byPlayer.keys()]) if (!seen.has(slot)) this.byPlayer.delete(slot);
 }

 // Everything to draw, moved on from its snapshot by `now - stamp` (capped).
 lists(now) {
  const out = { shots: [], hexOrbs: [], rifleBullets: [], shotgunPellets: [], grenades: [] };
  for (const player of this.byPlayer.values()) {
   for (const s of player.orbs.values()) {
    const ahead = Math.min(.12, Math.max(0, now - s.stamp));
    s.drawX ??= s.x; const moved = { ...s, x: s.x + s.vx * ahead, z: s.z + s.vz * ahead };
    (s.hex ? out.hexOrbs : out.shots).push(Object.assign(s.view ||= {}, moved));
   }
   for (const b of player.bullets) {
    const ahead = Math.min(.1, Math.max(0, now - b.stamp)) * RIFLE.bulletSpeed;
    out.rifleBullets.push(Object.assign(b.view ||= {}, b, { x: b.x + b.dx * ahead, z: b.z + b.dz * ahead, travel: b.travel + ahead }));
   }
   for (const b of player.pellets) {
    const ahead = Math.min(.1, Math.max(0, now - b.stamp), Math.max(0, (b.range - b.travel) / PELLET_SPEED)) * PELLET_SPEED;
    out.shotgunPellets.push(Object.assign(b.view ||= {}, b, { x: b.x + b.dx * ahead, z: b.z + b.dz * ahead, travel: b.travel + ahead }));
   }
   for (const g of player.grenades.values()) out.grenades.push(g);
  }
  return out;
 }
}

// The sim the views draw from: yours, plus everyone else's projectiles. Reads
// fall through to your sim for everything else (player, colliders, time...).
export function drawSim(sim, foreign) {
 if (!foreign) return sim;
 const view = Object.create(sim);
 view.shots = [...sim.shots, ...foreign.shots];
 view.hexOrbs = [...sim.hexOrbs, ...foreign.hexOrbs];
 view.rifleBullets = [...sim.rifleBullets, ...foreign.rifleBullets];
 view.shotgunPellets = [...sim.shotgunPellets, ...foreign.shotgunPellets];
 view.grenades = [...sim.grenades, ...foreign.grenades];
 // Only your own parked orbs drift around you and crackle at your gun.
 Object.defineProperty(view, 'seeds', { value: sim.seeds });
 return view;
}
