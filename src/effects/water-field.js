// A map's streams as a field the drawing side can ask about (no three.js, no
// DOM): where the water stands, how deep it is over the ground there, which
// way and how fast it flows, and where a point sits along and across its
// channel. The water's mesh (render/water-mesh.js) is built from the same
// sections, and every effect on the water (effects/water-effects.js) asks it.
//
// Everything here keys on "the ground is below the water's surface", never
// on the ford or the crossings by name: if the stream is ever made wadeable
// everywhere, bodies in it wade, splash and slow down with no new code.
//
// The sections: every half metre along each channel's line (map.terrain.water
// points [x, z, half, bed]), each with its normal eased between neighbours so
// bends do not pinch, its half width and how far it reaches (half + bank +
// .3: the water runs out under the banks, where the ground hides it).
// `surface` { up, down, damX, flow }: the water stands at `up` upstream of
// damX and at `down` below it (a short drop at the dam: the weir). `flow` 1
// runs east (the order of the channel's points), -1 west (Hollow Wick's).
// A channel's `dir` is that sign: its sections' dx, dz point downstream.

import { insidePoly } from '../world/heightfield.js';

export const SECTION_STEP = .5;
// Metres per second down the middle of a channel 2.9 m in half width; a
// narrower one runs faster, the edges slower (FLOW.edge of it at the bank).
export const FLOW = Object.freeze({ speed: .55, width: 2.9, edge: .45, weir: 4, weirBoost: .9 });
// Shallow enough to see the bed (the ford's pebbles) through.
export const SHALLOW = .42;

// The water's height at x on one channel spec.
export function surfaceLevel(channel, x) {
 const s = channel.surface || { up: channel.level ?? 0, down: channel.level ?? 0, damX: Infinity };
 return (x - (s.damX ?? Infinity)) * (s.flow ?? 1) < 0 ? s.up : s.down;
}

// Extreme's gentle swell (the same formula as the water shader, so a leaf
// rides the facet it floats on). `along` metres, `across` -1..1 of the
// ribbon, `t` seconds; none at the banks.
export function swellAt(along, across, t, dir = 1) {
 const edge = 1 - across * across; along *= dir;
 return .022 * edge * (.5 * Math.sin(along * 1.7 - t * 2.1 + across * 1.3) + .3 * Math.sin(along * 2.9 + across * 4.1 - t * 2.9) + .2 * Math.sin(along * 4.3 - across * 6.7 - t * 3.4 + 1.9));
}

export class WaterField {
 // `ground`: world/heightfield.js Ground; `terrain`: the map's terrain spec.
 constructor(ground, terrain) {
  this.ground = ground; this.channels = [];
  for (const spec of terrain?.water || []) {
   const sections = [], damX = spec.surface?.damX ?? Infinity, dir = (spec.surface?.flow ?? 1) < 0 ? -1 : 1;
   let run = 0;
   for (let i = 1; i < spec.points.length; i++) {
    const a = spec.points[i - 1], b = spec.points[i], length = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(length / SECTION_STEP));
    const fx = (b[0] - a[0]) / length, fz = (b[1] - a[1]) / length;
    for (let k = i === 1 ? 0 : 1; k <= n; k++) {
     const t = k / n, x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t;
     const half = (a[2] ?? spec.half) + ((b[2] ?? spec.half) - (a[2] ?? spec.half)) * t;
     if (x < ground.minX - 2 || x > ground.maxX + 2) continue;
     sections.push({ x, z, fx, fz, half, water: half + (spec.edgeOffset ?? .75), reach: half + (spec.bank ?? 1) + .3, level: surfaceLevel(spec, x), along: run + length * t });
    }
    run += length;
   }
   // Ease the directions between neighbours (and the normals with them).
   for (let i = 0; i < sections.length; i++) {
    const p = sections[Math.max(0, i - 1)], q = sections[Math.min(sections.length - 1, i + 1)], s = sections[i];
    const fx = p.fx + q.fx, fz = p.fz + q.fz, l = Math.hypot(fx, fz) || 1;
    s.mx = -fz / l; s.mz = fx / l; s.dx = dir * fx / l; s.dz = dir * fz / l;
   }
   if (sections.length > 1) this.channels.push({ id: spec.id || 'channel', spec, sections, damX, dir, length: run });
  }
  this.decks = (terrain?.decks || []).map(d => ({ poly: d.poly, x0: Math.min(...d.poly.map(p => p[0])), x1: Math.max(...d.poly.map(p => p[0])), z0: Math.min(...d.poly.map(p => p[1])), z1: Math.max(...d.poly.map(p => p[1])) }));
  this.buildLookup();
 }

 // Is (x, z) on one of the crossings' decks (a bridge, the log, the dam walk)?
 onDeck(x, z) {
  for (const d of this.decks) if (x >= d.x0 && x <= d.x1 && z >= d.z0 && z <= d.z1 && insidePoly(x, z, d.poly)) return true;
  return false;
 }

 // A 1 m grid over the channels' boxes: the nearest section to each cell's
 // centre, or -1 where no channel reaches. A query refines from there.
 buildLookup() {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const c of this.channels) for (const s of c.sections) { x0 = Math.min(x0, s.x - s.reach); x1 = Math.max(x1, s.x + s.reach); z0 = Math.min(z0, s.z - s.reach); z1 = Math.max(z1, s.z + s.reach); }
  if (!(x1 > x0)) { this.cols = 0; return; }
  this.x0 = Math.floor(x0) - 1; this.z0 = Math.floor(z0) - 1;
  this.cols = Math.ceil(x1 - this.x0) + 2; this.rows = Math.ceil(z1 - this.z0) + 2;
  const best = new Float32Array(this.cols * this.rows).fill(Infinity);
  this.cellChannel = new Int16Array(this.cols * this.rows).fill(-1); this.cellSection = new Int32Array(this.cols * this.rows);
  this.channels.forEach((c, ci) => c.sections.forEach((s, si) => {
   const r = s.reach + 1;
   for (let row = Math.max(0, Math.floor(s.z - r - this.z0)); row <= Math.min(this.rows - 1, Math.ceil(s.z + r - this.z0)); row++)
    for (let col = Math.max(0, Math.floor(s.x - r - this.x0)); col <= Math.min(this.cols - 1, Math.ceil(s.x + r - this.x0)); col++) {
     const d = Math.hypot(this.x0 + col + .5 - s.x, this.z0 + row + .5 - s.z), k = row * this.cols + col;
     if (d < r && d < best[k]) { best[k] = d; this.cellChannel[k] = ci; this.cellSection[k] = si; }
    }
  }));
 }

 // Where (x, z) is on the water, or null outside every channel's reach.
 // `out`: { channel, index (section, fractional), along, across (m, + to the
 // right of the flow), water (the water's half width there), reach, level,
 // depth (the surface over the ground you stand on: decks count, so under a
 // bridge it is negative), dx, dz (the flow's way), speed (m/s) }.
 sample(x, z, out = {}) {
  if (!this.cols) return null;
  const col = Math.floor(x - this.x0), row = Math.floor(z - this.z0);
  if (col < 0 || row < 0 || col >= this.cols || row >= this.rows) return null;
  const k = row * this.cols + col, ci = this.cellChannel[k];
  if (ci < 0) return null;
  const channel = this.channels[ci], list = channel.sections, guess = this.cellSection[k];
  let bestD = Infinity, bi = 0, bt = 0;
  for (let i = Math.max(0, guess - 4); i < Math.min(list.length - 1, guess + 4); i++) {
   const a = list[i], b = list[i + 1], ex = b.x - a.x, ez = b.z - a.z, l2 = ex * ex + ez * ez;
   const t = l2 ? Math.max(0, Math.min(1, ((x - a.x) * ex + (z - a.z) * ez) / l2)) : 0;
   const px = a.x + ex * t - x, pz = a.z + ez * t - z, d = px * px + pz * pz;
   if (d < bestD) { bestD = d; bi = i; bt = t; }
  }
  const a = list[bi], b = list[bi + 1], lerp = (p, q) => p + (q - p) * bt;
  const cx = lerp(a.x, b.x), cz = lerp(a.z, b.z), dx = lerp(a.dx, b.dx), dz = lerp(a.dz, b.dz), dl = Math.hypot(dx, dz) || 1;
  const across = (x - cx) * -dz / dl + (z - cz) * dx / dl, reach = lerp(a.reach, b.reach);
  if (Math.abs(across) > reach) return null;
  // The drop at the dam sits between two sections: the level is by x.
  const level = surfaceLevel(channel.spec, x);
  out.channel = channel; out.index = bi + bt; out.along = lerp(a.along, b.along); out.across = across;
  out.water = lerp(a.water, b.water); out.reach = reach; out.level = level;
  // On a deck you stand on the deck (dry); off it, the drawn bed (the
  // physics grid is raised half a metre past a deck's edge, over water).
  out.depth = level - (this.onDeck(x, z) ? this.ground.heightAt(x, z) : this.ground.drawnHeightAt(x, z));
  out.dx = dx / dl; out.dz = dz / dl;
  out.speed = flowSpeed(out.water, across, x, channel.damX, channel.dir);
  return out;
 }

 // How deep the water over the ground you would stand on at (x, z) (<= 0:
 // dry, or no water here).
 depthAt(x, z) { const s = this.sample(x, z, this.scratch ||= {}); return s ? s.depth : -Infinity; }
 // Is the water's surface over the ground here (its drawn ribbon showing)?
 wet(x, z, depth = .02) { return this.depthAt(x, z) > depth; }

 // A point on `channel` at `along` metres and `across` metres to the right of
 // its line: { x, z, dx, dz, level, water, reach, speed }, or null past its ends.
 pointAt(channel, along, across, out = {}) {
  const list = channel.sections;
  if (along < list[0].along || along > list[list.length - 1].along) return null;
  let lo = 0, hi = list.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (list[mid].along <= along) lo = mid; else hi = mid; }
  const a = list[lo], b = list[hi], t = b.along > a.along ? (along - a.along) / (b.along - a.along) : 0, lerp = (p, q) => p + (q - p) * t;
  const dx = lerp(a.dx, b.dx), dz = lerp(a.dz, b.dz), dl = Math.hypot(dx, dz) || 1;
  out.dx = dx / dl; out.dz = dz / dl;
  out.x = lerp(a.x, b.x) - out.dz * across; out.z = lerp(a.z, b.z) + out.dx * across;
  out.water = lerp(a.water, b.water); out.reach = lerp(a.reach, b.reach);
  out.level = surfaceLevel(channel.spec, out.x);
  out.speed = flowSpeed(out.water, across, out.x, channel.damX, channel.dir);
  return out;
 }
}

// Down the middle faster than at the banks; quicker where the channel is
// narrow, and quickening over the last few metres before the weir.
export function flowSpeed(water, across, x, damX = Infinity, dir = 1) {
 const k = Math.min(1, Math.abs(across) / Math.max(.5, water));
 let speed = FLOW.speed * Math.max(.75, Math.min(1.35, FLOW.width / Math.max(.5, water - .75))) * (1 - (1 - FLOW.edge) * k * k);
 // (Upstream of the weir: `ahead` metres before the drop, the way it flows.)
 const ahead = (damX - x) * dir;
 if (ahead > 0 && ahead < FLOW.weir) speed *= 1 + FLOW.weirBoost * (1 - ahead / FLOW.weir);
 return speed;
}

// ---- The depth as the simulation would read it (plain arithmetic) ----
// How deep the water over the ground at (x, z) on a terrain map (0 when dry
// or on a map without water): the channel's surface over `ground.heightAt`
// (decks count, so a bridge is dry). Plain arithmetic only (no hypot), so every
// host and browser gets the same answer for the same numbers.
export function waterDepth(ground, terrain, x, z) {
 const channels = terrain?.water;
 if (!channels || ground.flat) return 0;
 let depth = 0;
 for (const w of channels) {
  const pts = w.points; let near = false;
  for (let i = 1; i < pts.length && !near; i++) {
   const a = pts[i - 1], b = pts[i], ex = b[0] - a[0], ez = b[1] - a[1], l2 = ex * ex + ez * ez;
   let t = l2 ? ((x - a[0]) * ex + (z - a[1]) * ez) / l2 : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
   const px = a[0] + ex * t - x, pz = a[1] + ez * t - z, half = (a[2] ?? w.half) + ((b[2] ?? w.half) - (a[2] ?? w.half)) * t, reach = half + (w.bank ?? 1);
   near = px * px + pz * pz < reach * reach;
  }
  if (near) depth = Math.max(depth, surfaceLevel(w, x) - ground.heightAt(x, z));
 }
 return depth;
}
