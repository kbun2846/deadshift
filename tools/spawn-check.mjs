#!/usr/bin/env node
// Checks a map's authored spawns (s2-spawns): node tools/spawn-check.mjs [map-id]
// (default hollow-wick). No browser; the map's own data and ground.
//
//  - every base point and FFA point: valid (net/map-spawns.js spawnProblem:
//    playable, dry, not on a deck, level enough, outside no-spawn areas and
//    buildings, 1 m from every collider) and its ground height and slope;
//  - FFA spacing: each point's nearest neighbour, how many points are a
//    screen (SPAWN_APART) away, and pairs hidden from each other (by the
//    ground, ground.sightClear, or a building's wall), within 40 m;
//  - base sightlines: from every base point, rays every 4 degrees out to
//    where something stops sight or fire (the ground, a sight-blocking
//    collider, or a building's wall: from above you see over it, but it
//    stops every round, so it guards a spawn just the same) or
//    the real 16:9 screen ends (render/camera-framing.js onScreenOf, with the
//    height difference: higher ground leaves the top sooner). The longest
//    line that leaves the base polygon is reported; over 18 m is flagged
//    (design notes: no sightline out of a base longer than 18 m). East-west
//    the screen reaches 19 m, so an open flank shows up here until a screen
//    (a shed, a wall) is built.
// Exit code 1 when a point is invalid (sightlines only warn).
import { maps, mapColliders, groundFor } from '../src/maps.js';
import { spawnProblem } from '../src/net/map-spawns.js';
import { SPAWN_APART } from '../src/config/match.js';
import { onScreenOf } from '../src/render/camera-framing.js';
import { segmentBox } from '../src/simulation.js';
import { insidePoly } from '../src/world/heightfield.js';

const id = process.argv[2] || 'hollow-wick', map = maps[id];
if (!map) { console.error('no map ' + id); process.exit(2); }
if (!map.bases?.length && !map.ffaSpawns?.length) { console.log(id + ': no authored spawns (building interiors are its spawns)'); process.exit(0); }
const ground = groundFor(map), colliders = mapColliders(map), blockers = colliders.filter(c => c.blocksSight || (c.buildingId && !c.playerOnly));
const d = (a, b) => Math.hypot(a.x - b.x, a.z - b.z), f1 = v => v.toFixed(1), g = { x: 0, z: 0 };
// Sight or fire stopped between two points: the ground, a sight blocker, a building's wall.
const blocked = (a, b) => !ground.sightClear(a.x, a.z, b.x, b.z) || blockers.some(c => segmentBox(a.x, a.z, b.x, b.z, c, 0) !== null);
let invalid = 0;
const row = (label, p) => {
 const why = spawnProblem(map, colliders, p.x, p.z); if (why) invalid++;
 ground.gradientAt(p.x, p.z, g);
 return `${label.padEnd(8)} (${f1(p.x)}, ${f1(p.z)})  h ${ground.heightAt(p.x, p.z).toFixed(2)}  slope ${Math.hypot(g.x, g.z).toFixed(2)}  ${why ? 'INVALID: ' + why : 'ok'}`;
};

console.log(`${map.name}: ${map.bases?.length || 0} bases, ${map.ffaSpawns?.length || 0} FFA points, ${colliders.length} colliders (${blockers.length} block sight or fire)\n`);
for (const base of map.bases || []) {
 console.log(`base ${base.id} (${base.name || ''}) at (${base.x}, ${base.z}), ${base.points.length} points`);
 for (const p of base.points) console.log('  ' + row(base.id, p));
}
if (map.teamBases) console.log('\nteam bases: ' + Object.entries(map.teamBases).map(([n, ids]) => `${n} sides: ${ids.join(' / ')}`).join(', '));

const pts = map.ffaSpawns || [];
console.log(`\nFFA points (${pts.length}):`);
let hiddenPairs = 0, nearPairs = 0, minPair = Infinity;
for (const p of pts) {
 const others = pts.filter(q => q !== p), nearest = Math.min(...others.map(q => d(p, q))), apart = others.filter(q => d(p, q) >= SPAWN_APART).length;
 const close = others.filter(q => d(p, q) < 40), hidden = close.filter(q => blocked(p, q)).length;
 minPair = Math.min(minPair, nearest); nearPairs += close.length; hiddenPairs += hidden;
 console.log('  ' + row('ffa', p) + `  nearest ${f1(nearest)} m, ${apart}/${others.length} a screen away, ground or walls hide ${hidden}/${close.length} within 40 m`);
}
console.log(`  closest pair ${f1(minPair)} m; the ground or walls hide ${hiddenPairs / 2}/${nearPairs / 2} pairs within 40 m`);

// Sightlines out of each base on the real 16:9 screen.
console.log('\nsightlines out of each base (16:9 screen; over 18 m flagged):');
for (const base of map.bases || []) {
 let worst = { len: 0 };
 for (const p of base.points) {
  const hp = ground.heightAt(p.x, p.z);
  for (let a = 0; a < 360; a += 4) {
   const dx = Math.cos(a * Math.PI / 180), dz = Math.sin(a * Math.PI / 180);
   let len = 0;
   for (let r = .5; r <= 40; r += .5) {
    const q = { x: p.x + dx * r, z: p.z + dz * r };
    if (!onScreenOf(16 / 9, q.x - p.x, q.z - p.z, ground.heightAt(q.x, q.z) - hp) || blocked(p, q)) break;
    if (!insidePoly(q.x, q.z, base.poly)) len = r;
   }
   if (len > worst.len) worst = { len, from: p, bearing: a };
  }
 }
 const dir = worst.from ? ['east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east'][Math.round(worst.bearing / 45) % 8] : '-';
 console.log(`  ${base.id}: longest ${f1(worst.len)} m ${dir}${worst.from ? ` from (${worst.from.x}, ${worst.from.z})` : ''}${worst.len > 18 ? '  OVER 18 m: needs a screen (shed, wall) that way' : ''}`);
}
console.log(invalid ? `\n${invalid} invalid point(s)` : '\nall points valid');
process.exit(invalid ? 1 : 0);
