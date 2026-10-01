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
import { RIFLE, SIGHTLINE, RULES } from '../config/gameplay.js';

const PELLET_SPEED = 85, STALE = Object.freeze({ stop: undefined, surge: undefined });
const r2 = v => Math.round(v * 100) / 100;

export function pack(sim) {
 const orb = s => ({ id: s.id, x: r2(s.x), z: r2(s.z), vx: r2(s.vx || 0), vz: r2(s.vz || 0), age: r2(s.age || 0), launched: !!s.launched, hex: !!s.hex,
  originX: s.originX, originZ: s.originZ, muzzleX: s.muzzleX, muzzleZ: s.muzzleZ });
 return {
  ...(sim.weapon==='sightline'?{sightline:(sim.sightlineRounds||[]).map(b=>({id:b.id,x:r2(b.x),z:r2(b.z),y:r2(b.y),dx:b.dx,dz:b.dz,rise:b.flight?.slope||0,travel:b.travel,range:Math.min(b.range,b.stop??Infinity),speed:b.pistol?SIGHTLINE.pistolSpeed:SIGHTLINE.speed,pistol:b.pistol,special:b.special,below:b.below}))}:{}),
  ichor:(sim.ichorWaves||[]).map(({hit,...w})=>({...w})),
  sidekick:(sim.sidekickRounds||[]).map(b=>({id:b.id,x:r2(b.x),z:r2(b.z),y:r2(b.y),dx:b.dx,dz:b.dz,travel:b.travel,range:b.stop??b.range,rise:b.flight?.slope||0})),
  mines:(sim.sidekickMines||[]).map(m=>({...m,age:r2(m.age)})),
  omen:(sim.omenBolts||[]).map(b=>({id:b.id,kind:b.kind,x:r2(b.x),z:r2(b.z),y:r2(b.y??.75),dx:r2(b.dx),dz:r2(b.dz),speed:b.speed,below:!!b.below})),
  curses:(sim.omen?.marks||[]).map(m=>({...m,left:r2(m.left)})),
  omenPrime:sim.weapon==='omen'&&sim.omen?.primed&&!sim.player.dead?{x:r2(sim.player.x),z:r2(sim.player.z),below:!!sim.player.below}:null,
  orbs: sim.shots.filter(s => !s.dead).map(orb),
  hex: sim.hexOrbs.filter(s => !s.dead).map(orb),
  // (Hills: `stop`, where the ground takes a round; only ever set there.)
  bullets: sim.rifleBullets.filter(b => !b.dead).map(b => ({ x: r2(b.x), z: r2(b.z), dx: r2(b.dx), dz: r2(b.dz), travel: r2(b.travel), ...(b.surge ? { surge: 1 } : {}), ...(b.stop !== undefined ? { stop: r2(b.stop) } : {}) })),
  pellets: sim.shotgunPellets.filter(b => !b.dead).map(b => ({ x: r2(b.x), z: r2(b.z), dx: r2(b.dx), dz: r2(b.dz), travel: r2(b.travel), range: b.range, ...(b.stop !== undefined ? { stop: r2(b.stop) } : {}) })),
  scatter: (sim.scatterShells || []).map(b => ({ id: b.id, big: b.big, x: r2(b.x), z: r2(b.z), dx: r2(b.dx), dz: r2(b.dz), speed: b.speed, travel: r2(b.travel), limit: r2(b.limit) })),
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
   const old = this.byPlayer.get(slot) || { orbs: new Map(), bullets: [], pellets: [], grenades: new Map(), scatter: new Map() };
   const base = (slot + 1) * 1e6;
   const orbs = new Map();
   for (const s of [...(lists.orbs || []), ...(lists.hex || [])]) {
    const id = base + s.id, kept = old.orbs.get(id) || {};
    orbs.set(id, Object.assign(kept, s, { id, stamp: now }));
   }
   // Bullets and pellets carry no id: matched by order, which is stable
   // because each list only ever loses its oldest rounds and gains new ones.
   // (An object a new round takes over drops the old one's ground `stop` and
   // Surge glow: only what the new round's own packet says.)
   const keep = (previous, list) => list.map((b, i) => Object.assign(previous[i] || {}, STALE, b, { stamp: now }));
   const grenades = new Map();
   for (const g of lists.grenades || []) { const id = base + g.id; grenades.set(id, Object.assign(old.grenades.get(id) || {}, g, { id, stamp: now })); }
   // Scatter shells by id (new small ones appear mid-list when a big one splits).
   const scatter = new Map();
   for (const b of lists.scatter || []) { const id = base + b.id; scatter.set(id, Object.assign(old.scatter?.get(id) || {}, b, { id, stamp: now })); }
   this.byPlayer.set(slot, { ichor:(lists.ichor||[]).map(w=>({...w,id:base+w.id,stamp:now})),sidekick:(lists.sidekick||[]).map(b=>({...b,id:base+b.id,stamp:now})),mines:(lists.mines||[]).map(m=>({...m,id:base+m.id,stamp:now})), sightline:(lists.sightline||[]).map(b=>({...b,id:base+b.id,stamp:now})), omen:(lists.omen||[]).map(b=>({...b,id:base+b.id,stamp:now})), curses:(lists.curses||[]).map(m=>({...m,caster:slot,stamp:now})), omenPrime:lists.omenPrime?{...lists.omenPrime,caster:slot,stamp:now}:null, orbs, bullets: keep(old.bullets, lists.bullets || []), pellets: keep(old.pellets, lists.pellets || []), grenades, scatter });
  }
  for (const slot of [...this.byPlayer.keys()]) if (!seen.has(slot)) this.byPlayer.delete(slot);
 }

 // Everything to draw, moved on from its snapshot by `now - stamp` (capped).
 // `isEnemy(slot)`: whose orbs are drawn darker (owner, v0.9b: an enemy's
 // Static orbs a deeper blue, a teammate's as your own). Default: everyone.
 lists(now, isEnemy = null) {
  const out = { ichorWaves:[],sidekickRounds:[],sidekickMines:[], sightlineRounds:[], omenBolts:[],omenMarks:[],omenPrimers:[], shots: [], hexOrbs: [], rifleBullets: [], shotgunPellets: [], grenades: [], scatterShells: [] };
  for (const [slot, player] of this.byPlayer) {
   for(const w of player.ichor||[]){const ahead=Math.min(.1,Math.max(0,now-w.stamp))*23;if(w.travel+ahead<17)out.ichorWaves.push({...w,x:w.x+w.dx*ahead,z:w.z+w.dz*ahead,travel:w.travel+ahead});}
   for(const b of player.sightline||[]){const ahead=Math.min(.1,Math.max(0,now-b.stamp))*b.speed;if(b.travel+ahead<=b.range)out.sightlineRounds.push({...b,x:b.x+b.dx*ahead,y:b.y+(b.rise||0)*ahead,z:b.z+b.dz*ahead,travel:b.travel+ahead});}
   if(player.omenPrime&&now-player.omenPrime.stamp<.3)out.omenPrimers.push(player.omenPrime);
   for(const b of player.omen||[]){const ahead=Math.min(.1,Math.max(0,now-b.stamp))*b.speed;out.omenBolts.push({...b,x:b.x+b.dx*ahead,z:b.z+b.dz*ahead});}
   for(const m of player.curses||[]){const left=Math.max(0,m.left-Math.max(0,now-m.stamp));if(left>0)out.omenMarks.push({...m,left});}
   for(const b of player.sidekick||[]){const ahead=Math.min(.1,Math.max(0,now-b.stamp))*65;if(b.travel+ahead<=b.range)out.sidekickRounds.push({...b,x:b.x+b.dx*ahead,y:b.y+(b.rise||0)*ahead,z:b.z+b.dz*ahead,travel:b.travel+ahead});}
   const enemy = isEnemy ? !!isEnemy(slot) : true;
   for(const m of player.mines||[])out.sidekickMines.push({...m,enemy,age:m.age+Math.max(0,now-m.stamp)});
   for (const s of player.orbs.values()) {
    const ahead = Math.min(.12, Math.max(0, now - s.stamp));
    s.drawX ??= s.x;
    // Into the orb's own draw object (no new object per orb per frame).
    const view = Object.assign(s.view ||= {}, s); view.view = undefined; view.enemy = enemy; view.x = s.x + s.vx * ahead; view.z = s.z + s.vz * ahead;
    (s.hex ? out.hexOrbs : out.shots).push(view);
   }
   for (const b of player.bullets) {
    const ahead = Math.min(.1 * RIFLE.bulletSpeed, Math.max(0, now - b.stamp) * RIFLE.bulletSpeed, b.stop === undefined ? Infinity : Math.max(0, b.stop - b.travel));
    out.rifleBullets.push(Object.assign(b.view ||= {}, b, { x: b.x + b.dx * ahead, z: b.z + b.dz * ahead, travel: b.travel + ahead }));
   }
   for (const b of player.pellets) {
    const ahead = Math.min(.1, Math.max(0, now - b.stamp), Math.max(0, ((b.stop ?? b.range) - b.travel) / PELLET_SPEED)) * PELLET_SPEED;
    out.shotgunPellets.push(Object.assign(b.view ||= {}, b, { x: b.x + b.dx * ahead, z: b.z + b.dz * ahead, travel: b.travel + ahead }));
   }
   for (const g of player.grenades.values()) out.grenades.push(g);
   for (const b of player.scatter?.values() || []) {
    const ahead = Math.min(.1, Math.max(0, now - b.stamp), Math.max(0, (b.limit - b.travel) / b.speed)) * b.speed;
    out.scatterShells.push(Object.assign(b.view ||= {}, b, { x: b.x + b.dx * ahead, z: b.z + b.dz * ahead }));
   }
  }
  return out;
 }
}

// The sim the views draw from: yours, plus everyone else's projectiles. Reads
// fall through to your sim for everything else (player, colliders, time...).
export function drawSim(sim, foreign) {
 if (!foreign) return sim;
 const view = Object.create(sim);
 view.ichorWaves=[...(sim.ichorWaves||[]),...(foreign.ichorWaves||[])];
 view.sidekickRounds=[...(sim.sidekickRounds||[]),...(foreign.sidekickRounds||[])];
 view.sidekickMines=[...(sim.sidekickMines||[]),...(foreign.sidekickMines||[])];
 view.sightlineRounds=[...(sim.sightlineRounds||[]),...(foreign.sightlineRounds||[])];
 view.omenBolts=[...(sim.omenBolts||[]),...(foreign.omenBolts||[])];
 view.omenMarks=[...(sim.omen?.marks||[]),...(foreign.omenMarks||[])];
 view.omenPrimers=foreign.omenPrimers||[];
 view.shots = [...sim.shots, ...foreign.shots];
 view.hexOrbs = [...sim.hexOrbs, ...foreign.hexOrbs];
 view.rifleBullets = [...sim.rifleBullets, ...foreign.rifleBullets];
 view.shotgunPellets = [...sim.shotgunPellets, ...foreign.shotgunPellets];
 view.grenades = [...sim.grenades, ...foreign.grenades];
 view.scatterShells = [...(sim.scatterShells || []), ...(foreign.scatterShells || [])];
 // Practice targets online: the host's match holds them (see online-play.js).
 if (foreign.targets) view.targets = foreign.targets;
 // Only your own parked orbs drift around you and crackle at your gun.
 Object.defineProperty(view, 'seeds', { value: sim.seeds });
 return view;
}

// A joiner's own prediction (client-session.js; hex fix, 2026-09-30): the
// other players' hexes as shields (Simulation.hexShield's shape), from the
// hex orbs they carry in `proj` (packed by slot) and the players list (id,
// slot, team, dead), so the predicted body stays out of an enemy's hex as the
// host keeps the real one out. Nothing new travels. Into `out`.
// A pulsed hex spins on for RULES.hexSpinDuration with no orbs to send
// (review 2026-09-30: a joiner walked into it and the host pulled it back):
// with `memo` (a Map kept by the caller) and `now` (seconds), a hex whose
// orbs vanish before its fade age, its caster still standing, is kept at its
// last size for that long from the first snapshot without it.
const HEX_FADE = RULES.hexRange / RULES.hexSpeed + RULES.hexLinger;
export function hexShieldsFrom(proj, players, selfId, out = [], memo = null, now = 0) {
 out.length = 0;
 if (!proj) return out;
 for (const pl of players || []) {
  if (pl.id === selfId || pl.present === false) continue;
  const hex = proj[pl.slot]?.hex;
  if (hex?.length) {
   const o = hex[0], r = Math.min((o.age || 0) * RULES.hexSpeed, RULES.hexRange);
   out.push({ x: o.originX, z: o.originZ, rotation: 0, radius: r, limit: r * Math.cos(Math.PI / 6), owner: pl.id, team: pl.team ?? null, round: true });
   if (memo) { const m = memo.get(pl.id) || {}; m.x = o.originX; m.z = o.originZ; m.r = r; m.age = o.age || 0; m.team = pl.team ?? null; m.spunAt = null; memo.set(pl.id, m); }
   continue;
  }
  const m = memo?.get(pl.id); if (!m) continue;
  // Faded (or never formed enough to pulse), or its caster is down: gone.
  if (pl.dead || m.age < RULES.hexFormationTime - .05 || m.age >= HEX_FADE - .1) { memo.delete(pl.id); continue; }
  m.spunAt ??= now;
  if (now - m.spunAt >= RULES.hexSpinDuration) { memo.delete(pl.id); continue; }
  out.push({ x: m.x, z: m.z, rotation: 0, radius: m.r, limit: m.r * Math.cos(Math.PI / 6), owner: pl.id, team: m.team, round: true });
 }
 // (Anyone gone from the list is forgotten.)
 if (memo?.size) for (const id of memo.keys()) if (!(players || []).some(pl => pl.id === id)) memo.delete(id);
 return out;
}
