// Where Hollow Wick's static dressing (stage 5, task s5-props:
// src/maps/hollow-wick-dressing.js) may stand. Shared by
// tests/hollow-dressing.test.js and anyone placing more of it. Returns a list
// of what is wrong with one placed piece (empty: fine).
//
// The rules are the ones every other stage-5 piece keeps:
//  - the breakables' rules (tests/hollow-breakables-rules.js
//    placementProblems: inside the fence, out of the stream and its banks, off
//    decks, gentle ground, off retaining walls, off every path's walking lane,
//    1 m off buildings and 2.5 m clear of their long (door) sides, bases,
//    practice targets, not overlapping other props);
//  - the detail pass's rules (tools/place-detail.mjs problems(p), copied
//    here): colliders 1.1 m from every spawn point, every doorway's 2.4 m
//    apron clear, 0.35 m from other solids and 1.2 m from tree trunks, stumps
//    and logs, level ground under a solid piece (under 0.38 m of rise), off
//    the building pads by 0.5 m and 2.4 m from every side's middle, 5.5 m
//    (+1.2) from a base's centre, clear of a practice target's run, no
//    collider corner on a slope over 0.34, 2.5 m from the drag trail and
//    clear of the set pieces (KEEP_CLEAR + 1.2 m);
//  - and a few more: 3 m from every deck's end, out of the ford, 0.4 m clear of
//    every grave, headstone and tomb, and no collider in the water.
//
// Some pieces only make sense touching something, and say so in their data
// (each is then checked for exactly that, and every other rule still holds):
//  - `at: '<building id>'`: belongs at that building: leans on it or stands
//    under its eaves or before it (the coffin lid and the bier at the hearse
//    house, the millstones, the rain barrels, the hay wagon at the barn's
//    doors, the stocks and the mounting block at the meetinghouse, the slag at
//    the forge, the tavern's hitching rail). Its 1 m /
//    door-side / pad / side's-middle rules for that building are replaced by
//    the real doorways' 2.4 m aprons (checked for every piece anyway) and by
//    its colliders either touching that building's walls (a gap under 0.15 m
//    to one of them, never cutting into one: tucked in, it leaves nothing a
//    body can squeeze into) or keeping the usual 0.35 m from all of them. It
//    must stand within 2.5 m of that building.
//  - `bank: true`: belongs at the water's edge (the rowboat, the eel pot).
//    Its footprint may reach into the stream and lie on the bank's slope (every
//    bank is about 0.55: the channel's own grade), but it must reach the water,
//    and its colliders (the boat's dry half) stand dry, their middles outside
//    the banks (tests/wading.test.js: nothing solid in the stream).
//  - `on: [x, z]`: rests on or leans on the prop at that spot (the lantern on
//    a table tomb, the scythe on a fence panel): it may overlap that one prop.
//  - `by: '<set piece>'`: stands beside a set piece (SET_PIECES) inside its
//    keep-clear circle, but clear of the set piece's own pieces by 0.5 m.
//
// Where the breakables' rules measure a piece by its radius (a stand-in for
// round things), a long piece is measured again by its real outline before a
// retaining-wall problem is counted: the rule (0.5 m off the wall's line) is
// the same, the radius just overstates a long, thin piece's reach.
import { PROP_TYPES, mapColliders, buildingOpenings } from '../src/map-kit.js';
import { placementProblems, RULES } from './hollow-breakables-rules.js';
import { DRAG_TRAIL, KEEP_CLEAR, lineDistance } from '../src/maps/hollow-wick-tree-rules.js';
import { BUILDING_PADS, BASES } from '../src/maps/hollow-wick.js';
import { CROSSING_EXITS } from '../src/maps/hollow-wick-props.js';
import { GRAVE_TYPES } from '../src/world/graveyard.js';
import { TERRAIN } from '../src/config/gameplay.js';

// Set pieces a dressing piece may stand beside: the KEEP_CLEAR marks that
// belong to it (hollow-wick-tree-rules.js) and the types that are the set piece
// itself (kept 0.5 m clear). The open grave's marks: its first mark (now
// inside the hearse house's west end) and the mounds' mark beside it.
export const SET_PIECES = {
  'open grave': { marks: [[-27, -7.5], [-28, -5]], types: ['openGrave', 'freshMound'] },
};

export const DRESSING_RULES = Object.freeze({
  spawn: 1.1, apron: 2.4, solid: .35, touch: .15, trunk: 1.2, uneven: .38, pad: .5, middle: 2.4,
  base: 5.5 + 1.2, slope: .34, trail: 2.5, setPiece: 1.2, deckEnd: 3, ford: 1, grave: .4, at: 2.5, setPieceClear: .5,
  squeeze: [.7, 1.4], // m: a gap to a wall is under the first (closed) or at least the second (a robot's lane)
});

// A collider's or footprint's corners, turned as mapColliders turns them.
export const corners = c => {
  const a = c.angle || 0, cs = Math.cos(a), sn = Math.sin(a), w = (c.localW ?? c.w) / 2, d = (c.localD ?? c.d) / 2;
  return [[-w, -d], [w, -d], [w, d], [-w, d]].map(([lx, lz]) => [c.x + lx * cs + lz * sn, c.z - lx * sn + lz * cs]);
};
const segDistance = (px, pz, [ax, az], [bx, bz]) => {
  const dx = bx - ax, dz = bz - az, l = dx * dx + dz * dz, t = l ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l)) : 0;
  return Math.hypot(px - ax - dx * t, pz - az - dz * t);
};
const inside = ([x, z], poly) => {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [ax, az] = poly[i], [bx, bz] = poly[j]; if ((az > z) !== (bz > z) && x < (bx - ax) * (z - az) / (bz - az) + ax) hit = !hit; }
  return hit;
};
const crossing = (a, b, c, d) => {
  const o = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  return o(a, b, c) !== o(a, b, d) && o(c, d, a) !== o(c, d, b);
};
// The gap between two convex outlines (0 when they touch or overlap).
export function gap(A, B) {
  if (A.some(p => inside(p, B)) || B.some(p => inside(p, A))) return 0;
  let best = Infinity;
  for (let i = 0; i < A.length; i++) for (let j = 0; j < B.length; j++) {
    const a0 = A[i], a1 = A[(i + 1) % A.length], b0 = B[j], b1 = B[(j + 1) % B.length];
    if (crossing(a0, a1, b0, b1)) return 0;
    best = Math.min(best, segDistance(...a0, b0, b1), segDistance(...a1, b0, b1), segDistance(...b0, a0, a1), segDistance(...b1, a0, a1));
  }
  return best;
}
// How far a point lies inside a (turned) box.
const inset = (x, z, c) => {
  const a = c.angle || 0, cs = Math.cos(a), sn = Math.sin(a), dx = x - c.x, dz = z - c.z;
  return Math.min((c.localW ?? c.w) / 2 - Math.abs(dx * cs - dz * sn), (c.localD ?? c.d) / 2 - Math.abs(dx * sn + dz * cs));
};
// A point's distance to an outline (0 inside it).
const pointGap = (x, z, poly) => inside([x, z], poly) ? 0 : Math.min(...poly.map((p, i) => segDistance(x, z, p, poly[(i + 1) % poly.length])));

// What the rules need from the map, worked out once per map.
const CONTEXT = new WeakMap();
export function dressingContext(map) {
  let ctx = CONTEXT.get(map);
  if (ctx) return ctx;
  const props = map.props.map((p, i) => ({ ...p, id: p.id || 'prop-' + i }));
  ctx = {
    props,
    points: [...map.bases.flatMap(b => b.points), ...map.ffaSpawns],
    doors: map.buildings.flatMap(b => buildingOpenings(b).filter(o => o.type === 'door').map(o => ({ b, o }))),
    windows: map.buildings.flatMap(b => buildingOpenings(b).filter(o => o.type === 'window').map(o => ({ b, o }))),
    walls: mapColliders(map).filter(c => c.terrainEdge || (c.buildingId !== undefined && !c.furniture && !c.interiorCover)),
    solids: mapColliders(map).filter(c => !c.walkOver && !c.terrainEdge),
    graves: props.filter(p => GRAVE_TYPES[p.type] && !/^fieldWall/.test(p.type)).map(p => ({ p, outline: corners({ ...p, w: GRAVE_TYPES[p.type].w * (p.scale || 1), d: GRAVE_TYPES[p.type].d * (p.scale || 1) }) })),
  };
  CONTEXT.set(map, ctx);
  return ctx;
}
// One piece's own colliders (as mapColliders makes them), alone.
export const collidersOf = (map, p) => mapColliders({ ...map, buildings: [], trees: null, fences: [], crossings: null, terrain: null, props: [{ ...p, id: p.id || 'probe' }] });
const outlineOf = p => corners({ x: p.x, z: p.z, angle: p.angle || 0, w: PROP_TYPES[p.type].w * (p.scale || 1), d: PROP_TYPES[p.type].d * (p.scale || 1) });

export function dressingProblems(map, ground, p, ctx = dressingContext(map)) {
  const out = [], R = DRESSING_RULES, t = PROP_TYPES[p.type];
  if (!t) return [`unknown type ${p.type}`];
  const mine = collidersOf(map, p), outline = outlineOf(p);
  // The piece's body for the doorway check: its colliders, or its footprint
  // when it has none (a walked-over piece still never lies in a doorway).
  const body = mine.length ? mine.map(corners) : [outline];
  const onProp = p.on && ctx.props.find(o => o !== p && o.id !== p.id && Math.abs(o.x - p.on[0]) < 1e-6 && Math.abs(o.z - p.on[1]) < 1e-6);

  // 1. The breakables' rules, less what the piece is declared to do.
  for (const why of placementProblems(map, ground, p, map.props)) {
    if (p.at && (why === `against ${p.at}` || why === `before ${p.at}'s door side`)) continue;
    if (p.bank && (why === 'in the stream' || why.startsWith('on a slope '))) continue;
    if (onProp && why === `overlaps ${onProp.type} at ${onProp.x},${onProp.z}`) continue;
    if (why === 'against a retaining wall' && ground.edges.every(e => Math.min(...outline.map(([x, z]) => segDistance(x, z, [e.ax, e.az], [e.bx, e.bz]))) >= RULES.edgeClear
      && !outline.some((q, i) => crossing(q, outline[(i + 1) % 4], [e.ax, e.az], [e.bx, e.bz])))) continue;
    out.push(why);
  }

  // 2. The detail pass's rules.
  if (ctx.points.some(s => mine.some(c => pointGap(s.x, s.z, corners(c)) < R.spawn))) out.push('spawn');
  for (const { b, o } of ctx.doors) {
    const mx = (o.a.x + o.b.x) / 2, mz = (o.a.z + o.b.z) / 2, ux = o.b.x - o.a.x, uz = o.b.z - o.a.z, len = Math.hypot(ux, uz);
    let nx = -uz / len, nz = ux / len; if (nx * (mx - b.x) + nz * (mz - b.z) < 0) { nx = -nx; nz = -nz; }
    let hit = false;
    for (const out2 of [.5, 1.2, 2, R.apron]) for (const side of [-.7, 0, .7]) if (body.some(poly => pointGap(mx + nx * out2 + ux / len * side, mz + nz * out2 + uz / len * side, poly) < .55)) hit = true;
    if (hit) out.push(`door of ${b.id}`);
  }
  // No squeeze: between a piece and a wall (a building's or a retaining
  // wall) a body either cannot pass at all or a robot can too. A gap of
  // 0.7-1.4 m let a player slip through where robots (0.46 m round, on
  // 0.5 m squares) had to go the long way (stage 5 review: the grindstone,
  // the hay wagon and the plough).
  for (const c of mine) {
    if (c.walkOver) continue;
    const cc = corners(c);
    for (const w of ctx.walls) {
      // (By the boxes' extents: a retaining wall's box is a long thin one.)
      if (Math.abs(w.x - c.x) > (w.w + c.w) / 2 + 2 || Math.abs(w.z - c.z) > (w.d + c.d) / 2 + 2 || (p.at && w.buildingId === p.at)) continue;
      const g = gap(cc, corners(w));
      if (g > R.squeeze[0] && g < R.squeeze[1]) { out.push(`a squeeze by ${w.terrainEdge ? 'a retaining wall' : w.buildingId}`); break; }
    }
  }
  // Every open window keeps a lane outside it, as colonial-interiors.js's
  // windowZones inside: a round fired out through it flies 1.5 m past the
  // wall before anything that meets rounds can stop it (stage 5 review: the
  // stocks and the mounting block stopped rounds out of two meetinghouse
  // windows). A knee-high piece a round flies over (lowTop) may stand there.
  const meets = mine.filter(c => !c.playerOnly && !(c.lowTop && (c.height ?? 2) < TERRAIN.roundHeight));
  if (meets.length) for (const { b, o } of ctx.windows) {
    const mx = (o.a.x + o.b.x) / 2, mz = (o.a.z + o.b.z) / 2, ux = o.b.x - o.a.x, uz = o.b.z - o.a.z, len = Math.hypot(ux, uz);
    let nx = -uz / len, nz = ux / len; if (nx * (mx - b.x) + nz * (mz - b.z) < 0) { nx = -nx; nz = -nz; }
    let hit = false;
    for (const out2 of [.3, .8, 1.5]) for (const t of [0, .5, 1]) {
      const x = o.a.x + ux * t + nx * out2, z = o.a.z + uz * t + nz * out2;
      if (meets.some(c => pointGap(x, z, corners(c)) < .05)) hit = true;
    }
    if (hit) out.push(`window of ${b.id}`);
  }
  for (const c of mine) {
    const cc = corners(c), home = [];
    for (const s of ctx.solids) {
      if (s.propId === p.id || (onProp && s.propId === onProp.id) || Math.abs(s.x - c.x) > 12 || Math.abs(s.z - c.z) > 12) continue;
      const g = gap(cc, corners(s));
      if (p.at && s.buildingId === p.at) { home.push(g); if (cc.some(([x, z]) => pointGap(x, z, corners(s)) === 0 && inset(x, z, s) > .05)) out.push(`in the walls of ${p.at}`); continue; }
      if (s.tree ? g < R.trunk : g < R.solid) { out.push(`solid by ${s.propId ?? s.buildingId ?? (s.tree ? 'a tree' : 'a wall')}`); break; }
    }
    if (home.length && !home.some(g => g < R.touch) && home.some(g => g < R.solid)) out.push(`a gap to ${p.at}`);
    if (p.bank) continue; // (it lies on the bank: its own rules below)
    const hs = cc.map(([x, z]) => ground.heightAt(x, z));
    if (Math.max(...hs) - Math.min(...hs) > R.uneven) out.push('uneven');
    for (const [x, z] of cc) { const g = ground.gradientAt(x, z); if (Math.hypot(g.x, g.z) > R.slope) { out.push('slope'); break; } }
  }
  const pts = mine.length ? mine.flatMap(corners) : outline;
  for (const b of BUILDING_PADS) {
    if (b.id === p.at) continue;
    const a = b.angle || 0, cs = Math.cos(a), sn = Math.sin(a);
    for (const [x, z] of pts) {
      const lx = (x - b.x) * cs - (z - b.z) * sn, lz = (x - b.x) * sn + (z - b.z) * cs;
      if (Math.abs(lx) <= b.w / 2 + R.pad && Math.abs(lz) <= b.d / 2 + R.pad) { out.push(`pad of ${b.id}`); break; }
      if ([[0, b.d / 2], [0, -b.d / 2], [b.w / 2, 0], [-b.w / 2, 0]].some(([mx, mz]) => Math.hypot(lx - mx, lz - mz) <= R.middle)) { out.push(`${b.id}'s side's middle`); break; }
    }
  }
  if (Object.values(BASES).some(([bx, bz]) => Math.hypot(p.x - bx, p.z - bz) < R.base)) out.push('base');
  for (const tg of map.targets || []) if (Math.abs(p.z - tg.z) < 3 && p.x > tg.x - (tg.travel || 0) - 3 && p.x < tg.x + (tg.travel || 0) + 3) out.push(`target ${tg.id}`);
  if (lineDistance(p.x, p.z, DRAG_TRAIL) < R.trail) out.push('drag trail');
  const beside = p.by && SET_PIECES[p.by];
  for (const [kx, kz, kr] of KEEP_CLEAR) {
    if (Math.hypot(p.x - kx, p.z - kz) >= kr + R.setPiece) continue;
    if (beside?.marks.some(([mx, mz]) => mx === kx && mz === kz)) continue;
    out.push(`set piece at ${kx},${kz}`);
  }

  // 3. More.
  for (const [x, z] of CROSSING_EXITS) if (pointGap(x, z, outline) < R.deckEnd) { out.push('a deck\'s end'); break; }
  for (const f of map.terrain.fords || []) if (outline.some(([x, z]) => lineDistance(x, z, f.points) < f.width / 2 + R.ford)) out.push('the ford');
  for (const { p: q, outline: o } of ctx.graves) if ((!onProp || q.id !== onProp.id) && gap(outline, o) < R.grave) { out.push(`on the graves (${q.type} at ${q.x},${q.z})`); break; }
  for (const c of mine) if (ground.bankDistance(c.x, c.z) < 0 || corners(c).some(([x, z]) => ground.wetAt(x, z))) { out.push('solid in the water'); break; }

  // 4. The declared exceptions hold.
  if (p.at) {
    const walls = ctx.solids.filter(s => s.buildingId === p.at && !s.furniture && !s.interiorCover);
    if (!walls.length || Math.min(...walls.map(w => gap(outline, corners(w)))) > R.at) out.push(`not at ${p.at}`);
  }
  if (p.bank && !outline.some(([x, z]) => ground.wetAt(x, z))) out.push('not at the water');
  if (p.on && (!onProp || gap(outline, outlineOf(onProp)) > 0)) out.push('not on what it rests on');
  if (p.by) {
    if (!beside) out.push(`unknown set piece ${p.by}`);
    else {
      if (!beside.marks.some(([mx, mz]) => KEEP_CLEAR.some(([kx, kz, kr]) => kx === mx && kz === mz && Math.hypot(p.x - kx, p.z - kz) < kr + R.setPiece))) out.push(`not by the ${p.by}`);
      for (const q of ctx.props) if (beside.types.includes(q.type) && gap(outline, outlineOf(q)) < R.setPieceClear) out.push(`on the ${p.by}`);
    }
  }
  return [...new Set(out)];
}
