// Lumen's ground (stage 1): what lies on the street, as plain data made from
// the layout (maps/lumen-layout.js), for the city ground builder
// (world/city-ground.js) to paint and draw. Pure JS, seeded: the same every
// load, testable in Node (tests/lumen-ground.test.js).
//   shapes    painted into the ground's colour texture, in order (later on top):
//             { poly: [[x, z], ...], colour, blur? (m of soft edge), alpha? }
//   markings  worn paint and kerbs as flat strips (crisp geometry over the
//             texture): { quad: [[x, z] x4], colour, y? }
//   puddles   standing water (never dries): { x, z, rx, rz, angle }
// Colours from claude/lumen-design.md section 15 (palette, area shifts).
import { ROADS, CROSSROADS, BACK_ALLEY, VELVET_LANE, OUTLINE, DISTRICTS, BUILDING_PLAN } from '../maps/lumen-layout.js';
import { cityMarkShapes } from './city-marks.js';

// Darker (owner, 2026-09-30: "make roads and sidewalks darker and make the
// crosswalks contrast less"): the night look's light dropped (maps/lumen.js
// `look`), and the lighter grounds a step more on top: sidewalks #474a52 ->
// #40434a, kerbs, plazas and the districts' stone and tile with them, so a
// sidewalk no longer reads pale grey beside the road. The paint dulled most:
// crosswalk bars #878a8f -> #505358 (faded #383b40..#44474c; on screen a bar
// reads about #5c6474 in the moon on #242938 asphalt, was #bdc2cb on
// #2e3445), lane paint #83858a -> #5a5c61, the lemon line #6a6327 ->
// #4c4825: readable, never a white ladder across the street.
export const LUMEN_GROUND = Object.freeze({
  asphalt: '#2c2f36', laneCentre: '#30333a', sidewalk: '#40434a', kerb: '#4d5057', gutter: '#222429', lot: '#383b41',
  plaza: '#44474e', alley: '#2b2926', velvet: '#262831', median: '#34373e',
  // (the named grounds: the Stacks' courtyard, Uptown's plaza stone, the metro's tile)
  courtyard: '#37352f', uptownStone: '#494d55', metroTile: '#464a52',
  // (Paint is worn and dull: it is lit, and a bright bar blooms and tires the eye.)
  paint: '#5a5c61', lemon: '#4c4825', crosswalk: '#505358', crosswalkFaded: ['#3c3f44', '#44474c', '#383b40'], zebraFaded: .32,
  // Area shifts (section 15, about dE 3-8): each district's ground is
  // multiplied by its tint, soft-edged over the transition band (m), so
  // sidewalk and road keep their contrast while the district leans warmer,
  // cooler, dirtier or cleaner.
  band: 10,
  areas: {
    uptown: { walk: '#494d55', road: '#2c3039' }, stacks: { walk: '#37352f', road: '#2b2a28' },
    'night-market': { walk: '#39352f', road: '#2c2b2a' }, garage: { walk: '#424240', road: '#2a2b2f' },
    'velvet-row': { walk: '#2c262d', road: '#262831' }, charging: { walk: '#3e3f43', road: '#2a2c32' },
    metro: { walk: '#464a52', road: '#24272e' }, flatiron: { walk: '#464a52', road: '#262a31' },
    'south-frontage': { walk: '#42454c', road: '#2c2f36' },
  },
  // Worn paint: this share of each dash, stripe or bar is missing (seeded).
  wear: .18,
});

// The multiply tint (darkening) and screen tint (lightening) that take the
// colour `base` to `target` channel by channel; null where nothing is needed.
export function shiftTints(base, target) {
  const hex = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16) / 255), out = v => '#' + v.map(x => Math.round(Math.max(0, Math.min(1, x)) * 255).toString(16).padStart(2, '0')).join('');
  const b = hex(base), t = hex(target);
  const mul = b.map((v, i) => t[i] < v ? t[i] / v : 1), scr = b.map((v, i) => t[i] > v ? 1 - (1 - t[i]) / (1 - v) : 0);
  return [mul.some(v => v < .999) ? out(mul) : null, scr.some(v => v > .001) ? out(scr) : null];
}

// A seeded random stream (the same numbers every load).
export function seeded(seed) { let s = seed >>> 0 || 1; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }
const rect = (x0, x1, z0, z1) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];

// Every road's roadway and sidewalk outlines.
export function roadGeometry(r) {
  if (r.axis === 'x') {
    const h = r.width / 2, s = r.sidewalk;
    return { road: rect(r.from, r.to, r.centre - h, r.centre + h), walks: [rect(r.from, r.to, r.centre - h - s, r.centre - h), rect(r.from, r.to, r.centre + h, r.centre + h + s)] };
  }
  if (r.axis === 'z') {
    const h = r.width / 2, s = r.sidewalk;
    return { road: rect(r.centre - h, r.centre + h, r.from, r.to), walks: [rect(r.centre - h - s, r.centre - h, r.from, r.to), rect(r.centre + h, r.centre + h + s, r.from, r.to)] };
  }
  const [ax, az] = r.a, [bx, bz] = r.b, len = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / len, uz = (bz - az) / len, nx = -uz, nz = ux;
  // run on past both ends: into the Crossroads and out under the barricade into the haze
  const x0 = ax - ux * 8, z0 = az - uz * 8, x1 = bx + ux * 30, z1 = bz + uz * 30;
  const band = (h0, h1) => [[x0 + nx * h0, z0 + nz * h0], [x1 + nx * h0, z1 + nz * h0], [x1 + nx * h1, z1 + nz * h1], [x0 + nx * h1, z0 + nz * h1]];
  const h = r.width / 2, s = r.sidewalk;
  return { road: band(-h, h), walks: [band(h, h + s), band(-h - s, -h)], ux, uz, nx, nz, a: [x0, z0], b: [x1, z1] };
}

// A doorway's threshold (owner, 2026-09-30: doorways "subtly more
// apparent", read from above): a strip of paler worn concrete on the ground
// outside every outer doorway, its width and a little more, from the wall's
// face out THRESHOLD.depth. `doors`: maps/lumen-signs.js lumenDoors() (the
// door's middle on its wall line, its outward normal and its wall's way).
export const THRESHOLD = Object.freeze({ wall: .19, depth: .45, over: .12, colour: '#4d5057', alpha: .7 });
export function thresholdShapes(doors = []) {
  const T = THRESHOLD, out = [], q = v => Math.round(v * 1000) / 1000;
  for (const d of doors) {
    const hw = d.width / 2 + T.over, a = T.wall, b = T.wall + T.depth;
    const corner = (s, o) => [q(d.x + d.ux * s + d.nx * o), q(d.z + d.uz * s + d.nz * o)];
    out.push({ poly: [corner(-hw, a), corner(hw, a), corner(hw, b), corner(-hw, b)], colour: T.colour, alpha: T.alpha });
  }
  return out;
}

// The paint, in order.
export function groundShapes(pools = [], drags = [], doors = []) {
  const G = LUMEN_GROUND, shapes = [];
  // 1. Lots (under and between buildings), then the district's own ground over them, soft-edged.
  shapes.push({ poly: rect(-92, 92, -84, 84), colour: G.lot });
  // Named grounds: the Stacks' cracked courtyard, Uptown's plaza stone, the metro's tile.
  shapes.push({ poly: rect(-50, -36, -38, -16), colour: G.courtyard, blur: 1 });
  shapes.push({ poly: rect(38, 60, -38, -10.5), colour: G.uptownStone, blur: 2 });
  shapes.push({ poly: [[16, 16], [16, 56], [34, 56], [44, 46], [16, 17.9]], colour: G.metroTile, blur: 1.5 });
  // 2. Sidewalks (every road's), then the Crossroads' paving.
  for (const r of ROADS) for (const w of roadGeometry(r).walks) shapes.push({ poly: w, colour: G.sidewalk });
  const C = CROSSROADS;
  shapes.push({ poly: rect(C.x0, C.x1, C.z0, C.z1), colour: G.plaza });
  // 3. Roadways (the crossing roads cut through the sidewalks: crossings).
  for (const r of ROADS) {
    const g = roadGeometry(r);
    shapes.push({ poly: g.road, colour: G.asphalt });
    if (r.median) for (const [a, b] of [[r.from, C.x0], [C.x1, r.to]]) shapes.push({ poly: rect(a, b, r.centre - r.median / 2, r.centre + r.median / 2), colour: G.median });
  }
  // 4. The one alley and Velvet Row's lane.
  shapes.push({ poly: rect(BACK_ALLEY.x0, BACK_ALLEY.x1, BACK_ALLEY.z0, BACK_ALLEY.z1), colour: G.alley });
  for (const l of VELVET_LANE) shapes.push({ poly: rect(l.x0, l.x1, l.z0, l.z1), colour: G.velvet });
  // 5. The districts' area shifts (section 15): each district's roads and
  // sidewalks moved toward its own colours, soft-edged over the band and kept
  // to those surfaces (a clip: `within`), by a darkening and a lightening
  // pass worked out from the colours below and the targets.
  const walks = ROADS.flatMap(r => roadGeometry(r).walks), roads = ROADS.map(r => roadGeometry(r).road);
  for (const d of DISTRICTS) {
    const area = G.areas[d.id]; if (!area) continue; const [x0, x1, z0, z1] = d.box;
    for (const [surface, base, target] of [[walks, G.sidewalk, area.walk], [roads, G.asphalt, area.road]]) {
      if (!target) continue;
      const [darken, lighten] = shiftTints(base, target);
      if (darken) shapes.push({ poly: rect(x0, x1, z0, z1), colour: darken, blur: G.band / 2, blend: 'multiply', within: surface });
      if (lighten) shapes.push({ poly: rect(x0, x1, z0, z1), colour: lighten, blur: G.band / 2, blend: 'screen', within: surface });
    }
  }
  // 6. Wear: repair patches, cracks, oil, grime at the walls (seeded).
  const rand = seeded(9127);
  for (let i = 0; i < 70; i++) {
    const r = ROADS[Math.floor(rand() * ROADS.length)], g = roadGeometry(r), [p0, p1, p2] = g.road;
    const t = rand(), u = .15 + rand() * .7, x = p0[0] + (p1[0] - p0[0]) * t + (p2[0] - p1[0]) * u, z = p0[1] + (p1[1] - p0[1]) * t + (p2[1] - p1[1]) * u;
    const w = .8 + rand() * 2.6, d = .6 + rand() * 1.8;
    shapes.push({ poly: rect(x - w / 2, x + w / 2, z - d / 2, z + d / 2), colour: rand() < .6 ? '#25282e' : '#313439', alpha: .75 });
  }
  for (let i = 0; i < 26; i++) { // oil stains: the garage, the charging lot, West Street
    const [x, z] = [[-52, 22], [-44, 30], [-30, 18], [-14, 46], [-8, 52], [-20, 50]][i % 6], dx = (rand() - .5) * 10, dz = (rand() - .5) * 8;
    shapes.push({ poly: rect(x + dx - .7, x + dx + .7, z + dz - .45, z + dz + .45), colour: '#25252a', blur: .3, alpha: .8 });
  }
  // Stage 5 ground marks (world/city-marks.js): skids to every crash, oil,
  // cracks, repairs, tyre marks, worn paths, lane drips; `drags` the dead's.
  shapes.push(...cityMarkShapes({ drags }));
  // The doorways' thresholds (over the wear, under the light).
  shapes.push(...thresholdShapes(doors));
  // 7. The light pools of the lamps, steady neon and screens (last: light lies over the wear).
  shapes.push(...poolShapes(pools));
  return shapes;
}

// Light pools (maps/lumen-signs.js lumenLightPools): each a soft radial glow
// (world/city-ground.js GLOW_PROFILE: near inverse-square over the middle, a
// shoulder to zero at the rim) of the pool's tint, painted with the normal
// blend, `strength` of the tint at the centre. Normal, not screen: a tint
// screened over the lifted night ground bleaches to a pastel that Cyan,
// Violet and the coats vanish in (tools/contrast-check.mjs; the tints are
// F's, tools/contrast-lib.mjs POOLS, the albedo that reads as section 15's
// lit-ground tint under the night look). White is a dim grey, red barely
// above the ground (blood is red): red neon belongs on walls and doorways.
// (2026-09-30: solved again for the darker night so a lamp's pool keeps its
// presence in a darker street, a shade dimmer and greyer: tools/contrast-lib.mjs
// POOLS / POOL_READS.)
export const POOL_TINTS = Object.freeze({ white: '#646564', blue: '#353853', lemon: '#4e4a27', green: '#314b38', pink: '#4e2e39', red: '#3e2121', sodium: '#594832' });
export const POOL_BLEND = 'source-over';
export function poolShapes(pools) {
  const out = [];
  for (const p of pools) {
    const colour = POOL_TINTS[p.tone]; if (!colour) continue;
    const q = v => Math.round(v * 100) / 100;
    out.push({ glow: { x: q(p.x), z: q(p.z), rx: q(p.rx), rz: q(p.rz), angle: Math.round((p.angle || 0) * 1000) / 1000 }, colour, alpha: Math.round(Math.min(1, p.strength ?? 1) * 1000) / 1000 });
  }
  return out;
}

// Worn paint and kerbs, as flat strips.
export function groundMarkings() {
  const G = LUMEN_GROUND, out = [], rand = seeded(4410);
  const strip = (x0, z0, x1, z1, width, colour, y = .012) => {
    const len = Math.hypot(x1 - x0, z1 - z0); if (len < .05) return;
    const nx = -(z1 - z0) / len * width / 2, nz = (x1 - x0) / len * width / 2;
    out.push({ quad: [[x0 + nx, z0 + nz], [x1 + nx, z1 + nz], [x1 - nx, z1 - nz], [x0 - nx, z0 - nz]], colour, y });
  };
  // dashes along a line, skipping where `skip(x, z)` (intersections)
  // (A solid line is dash 1, gap 0: metre pieces, so it can stop at a
  // junction; runs of kept pieces are joined back into one strip.)
  const dashes = (x0, z0, x1, z1, width, colour, dash, gap, skip, worn = .6) => {
    // (The length to the millimetre and a whole number of dashes: the same
    // pieces, and so the same seeded wear, on every browser's maths.)
    const len = Math.round(Math.hypot(x1 - x0, z1 - z0) * 1000) / 1000, ux = (x1 - x0) / len, uz = (z1 - z0) / len, count = Math.ceil(len / (dash + gap) - 1e-6);
    let run = null;
    const flush = () => { if (run) strip(x0 + ux * run[0], z0 + uz * run[0], x0 + ux * run[1], z0 + uz * run[1], width, colour); run = null; };
    for (let k = 0; k < count; k++) {
      const t = k * (dash + gap), a = t, b = Math.min(len, t + dash), mx = x0 + ux * (a + b) / 2, mz = z0 + uz * (a + b) / 2;
      if (skip(mx, mz) || rand() < G.wear * worn) { flush(); continue; }
      if (gap === 0 && run && Math.abs(run[1] - a) < 1e-6) run[1] = b; else { flush(); run = [a, b]; }
      if (gap > 0) flush();
    }
    flush();
  };
  const junctions = intersections();
  // Where a kerb or gutter must stop: a junction's crosswalks (the mouth of
  // the crossing road) and the Crossroads.
  const mouths = junctions.flatMap(j => j.crosswalks);
  const atMouth = (x, z) => mouths.some(c => x > c.x0 - .3 && x < c.x1 + .3 && z > c.z0 - .3 && z < c.z1 + .3) || junctions.some(j => x > j.x0 - .3 && x < j.x1 + .3 && z > j.z0 - .3 && z < j.z1 + .3) || (x > CROSSROADS.x0 && x < CROSSROADS.x1 && z > CROSSROADS.z0 && z < CROSSROADS.z1);
  const inJunction = (x, z, m = 0) => junctions.some(j => x > j.x0 - m && x < j.x1 + m && z > j.z0 - m && z < j.z1 + m) || (x > CROSSROADS.x0 - m && x < CROSSROADS.x1 + m && z > CROSSROADS.z0 - m && z < CROSSROADS.z1 + m);
  for (const r of ROADS) {
    const h = r.width / 2;
    if (r.id === 'boulevard') {
      for (const s of [-1, 1]) dashes(r.from, s * 4, r.to, s * 4, .15, G.paint, 3, 6, (x, z) => inJunction(x, z, 3.5));
      for (const s of [-1, 1]) dashes(r.from, s * 1.1, r.to, s * 1.1, .12, G.lemon, 1, 0, (x, z) => inJunction(x, z, 1), .15); // the median's edge lines
    } else if (r.id === 'avenue') {
      for (const x of [r.centre - 1.7, r.centre + 1.7]) dashes(x, r.from, x, r.to, .13, G.lemon, 1, 0, (px, pz) => inJunction(px, pz, 3.5), .15);
    } else if (r.axis === 'x' || r.axis === 'z') {
      const along = r.axis === 'x';
      dashes(along ? r.from : r.centre, along ? r.centre : r.from, along ? r.to : r.centre, along ? r.centre : r.to, .13, G.lemon, 2.5, 4, (x, z) => inJunction(x, z, 3));
    } else {
      const g = roadGeometry(r), [ax, az] = g.a, [bx, bz] = g.b;
      for (const s of [-.15, .15]) dashes(ax + g.nx * s, az + g.nz * s, bx + g.nx * s, bz + g.nz * s, .12, G.lemon, 1, 0, (x, z) => x < CROSSROADS.x1 + 2 && z < CROSSROADS.z1 + 2, .15);
    }
    // Kerbs: a pale edge and a dark gutter along both sides of the roadway.
    if (r.axis !== 'diagonal') {
      for (const s of [-1, 1]) {
        const off = s * (h + .1), gut = s * (h - .2);
        if (r.axis === 'x') { dashes(r.from, r.centre + off, r.to, r.centre + off, .22, G.kerb, 1, 0, atMouth, 0); dashes(r.from, r.centre + gut, r.to, r.centre + gut, .35, G.gutter, 1, 0, atMouth, 0); }
        else { dashes(r.centre + off, r.from, r.centre + off, r.to, .22, G.kerb, 1, 0, atMouth, 0); dashes(r.centre + gut, r.from, r.centre + gut, r.to, .35, G.gutter, 1, 0, atMouth, 0); }
      }
    } else {
      const g = roadGeometry(r), [ax, az] = g.a, [bx, bz] = g.b;
      for (const s of [-1, 1]) { const o = s * (h + .1); dashes(ax + g.nx * o, az + g.nz * o, bx + g.nx * o, bz + g.nz * o, .22, G.kerb, 1, 0, atMouth, 0); }
    }
  }
  // Crosswalks: zebra stripes on each arm of each junction, in line with the crossing road's sidewalk.
  for (const j of junctions) for (const cw of j.crosswalks) zebra(out, cw, rand);
  // The Crossroads' scramble: corner to corner, and straight across each arm.
  const C = CROSSROADS, cx = C.centre[0], cz = C.centre[1];
  // (Where the two diagonals cross, both pause over the overlap and resume
  // past it: no bar lies on the other crossing, owner.)
  const diagonals = [[C.x0 + 4, C.z0 + 4, C.x1 - 4, C.z1 - 4], [C.x1 - 4, C.z0 + 4, C.x0 + 4, C.z1 - 4]];
  const offLine = ([ax, az, bx, bz], x, z) => { const len = Math.hypot(bx - ax, bz - az); return Math.abs((x - ax) * (bz - az) - (z - az) * (bx - ax)) / len; };
  for (const d of diagonals) {
    const [ax, az, bx, bz] = d, other = diagonals.find(o => o !== d);
    const len = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / len, uz = (bz - az) / len;
    for (let t = 0; t < len; t += 1.1) {
      const x = ax + ux * t, z = az + uz * t;
      if (offLine(other, x, z) < 2.2) continue; // (the other crossing's 1.6 m half-band, and this bar's reach toward it)
      strip(x - uz * 1.6, z + ux * 1.6, x + uz * 1.6, z - ux * 1.6, .5, zebraColour(rand));
    }
  }
  // The Crossroads' own arms: straight across each road where it enters the plaza.
  const ave = ROADS.find(r => r.id === 'avenue'), blvd = ROADS.find(r => r.id === 'boulevard');
  for (const cw of [
    { x0: C.x0, x1: C.x0 + 3, z0: -blvd.width / 2, z1: blvd.width / 2, across: 'z' }, { x0: C.x1 - 3, x1: C.x1, z0: -blvd.width / 2, z1: blvd.width / 2, across: 'z' },
    { x0: ave.centre - ave.width / 2, x1: ave.centre + ave.width / 2, z0: C.z0, z1: C.z0 + 3, across: 'x' }, { x0: ave.centre - ave.width / 2, x1: ave.centre + ave.width / 2, z0: C.z1 - 3, z1: C.z1, across: 'x' },
  ]) zebra(out, cw, rand);
  // Stop lines before each crosswalk on the approach side.
  for (const j of junctions) for (const cw of j.crosswalks) if (cw.stop) strip(...cw.stop, .35, G.paint);
  return out;
}

// A zebra bar's paint: never missing (a crossing has no gaps, owner), but
// about a third of the bars are old and faded toward the asphalt.
function zebraColour(rand) {
  const G = LUMEN_GROUND, r = rand();
  return r < G.zebraFaded ? G.crosswalkFaded[Math.floor(r / G.zebraFaded * G.crosswalkFaded.length)] : G.crosswalk;
}
function zebra(out, cw, rand) {
  // cw: { x0, x1, z0, z1, across: 'x' | 'z' } stripes run along `across`'s other axis
  // (bars spaced evenly across the whole crossing, kerb to kerb)
  const w = .55, gap = .5;
  const bars = (a0, a1) => { const n = Math.max(1, Math.floor((a1 - a0 - .5 + gap) / (w + gap))), start = a0 + (a1 - a0 - (n * w + (n - 1) * gap)) / 2; return Array.from({ length: n }, (_, i) => start + i * (w + gap)); };
  if (cw.across === 'x') for (const x of bars(cw.x0, cw.x1)) out.push({ quad: rect(x, x + w, cw.z0 + .25, cw.z1 - .25), colour: zebraColour(rand), y: .013 });
  else for (const z of bars(cw.z0, cw.z1)) out.push({ quad: rect(cw.x0 + .25, cw.x1 - .25, z, z + w), colour: zebraColour(rand), y: .013 });
}

// The six junctions (five with signals; West St x South St is dead) and the
// crosswalks on their arms.
export function intersections() {
  const road = id => ROADS.find(r => r.id === id);
  // `arms`: which arms get a crosswalk (n, s: across the N-S road north and
  // south of the junction; w, e: across the E-W road west and east of it).
  // Not every road needs one (owner): the dead corner has none, the lanes one.
  const cross = (ew, ns, id, signals = 'normal', arms = 'nswe') => {
    const a = road(ew), b = road(ns), ha = a.width / 2, hb = b.width / 2, sa = a.sidewalk, sb = b.sidewalk;
    const x0 = b.centre - hb, x1 = b.centre + hb, z0 = a.centre - ha, z1 = a.centre + ha;
    const crosswalks = [];
    // across the N-S road, on the E-W road's sidewalk lines (north and south arms)
    if (arms.includes('n') && b.from < z0 - sa) crosswalks.push({ x0, x1, z0: z0 - sa, z1: z0, across: 'x', stop: [x0, z0 - sa - .6, x0 + hb, z0 - sa - .6] });
    if (arms.includes('s') && b.to > z1 + sa) crosswalks.push({ x0, x1, z0: z1, z1: z1 + sa, across: 'x', stop: [x0 + hb, z1 + sa + .6, x1, z1 + sa + .6] });
    // across the E-W road, on the N-S road's sidewalk lines (west and east arms)
    if (arms.includes('w') && a.from < x0 - sb) crosswalks.push({ x0: x0 - sb, x1: x0, z0, z1, across: 'z', stop: [x0 - sb - .6, a.centre, x0 - sb - .6, z1] });
    if (arms.includes('e') && a.to > x1 + sb) crosswalks.push({ x0: x1, x1: x1 + sb, z0, z1, across: 'z', stop: [x1 + sb + .6, z0, x1 + sb + .6, a.centre] });
    return { id, x0, x1, z0, z1, x: b.centre, z: a.centre, signals, crosswalks };
  };
  return [
    cross('boulevard', 'west-street', 'boulevard-west', 'normal', 'nse'),
    cross('north-lane', 'west-street', 'north-west', 'blink', 'e'),
    cross('north-lane', 'avenue', 'north-avenue', 'normal', 'ws'),
    cross('south-street', 'avenue', 'south-avenue', 'normal', 'wn'),
    cross('south-street', 'west-street', 'south-west', 'dead', ''),
  ];
}

// Standing water: along the gutters, in low corners, in the alley (seeded;
// never on a building's lot, the crosswalks' middles or a doorway).
export function lumenPuddles(count = 40) {
  const rand = seeded(7781), out = [], G = LUMEN_GROUND;
  const spots = [];
  for (const r of ROADS) {
    if (r.axis === 'diagonal') continue;
    const h = r.width / 2;
    for (const s of [-1, 1]) spots.push(r.axis === 'x' ? t => [r.from + (r.to - r.from) * t, r.centre + s * (h - .7)] : t => [r.centre + s * (h - .7), r.from + (r.to - r.from) * t]);
  }
  for (let i = 0; i < count; i++) {
    let x, z;
    if (i < count - 6) [x, z] = spots[Math.floor(rand() * spots.length)](.08 + rand() * .84);
    else [x, z] = [[-19, -22.7], [-8, -23], [-42, 48], [44, -22], [-40, -28], [22, 34]][i - (count - 6)];
    if (!insideOutline(x, z, 2) || !puddleSpot(x, z)) continue;
    out.push({ x: +x.toFixed(2), z: +z.toFixed(2), rx: +(.7 + rand() * 1.6).toFixed(2), rz: +(.45 + rand() * .8).toFixed(2), angle: +(rand() * Math.PI).toFixed(3) });
  }
  void G;
  return out;
}

// Where standing water may lie: not in the Crossroads, on a crosswalk or
// on a building's lot (from the layout's plan).
function puddleSpot(x, z) {
  const C = CROSSROADS;
  if (x > C.x0 - 1 && x < C.x1 + 1 && z > C.z0 - 1 && z < C.z1 + 1) return false;
  for (const j of intersections()) for (const c of j.crosswalks) if (x > c.x0 - 1.5 && x < c.x1 + 1.5 && z > c.z0 - 1.5 && z < c.z1 + 1.5) return false;
  for (const b of BUILDING_PLAN) {
    for (const [x0, x1, z0, z1] of b.parts) if (x > x0 - 1 && x < x1 + 1 && z > z0 - 1 && z < z1 + 1) return false;
    for (const q of b.quads) { const xs = q.map(p => p[0]), zs = q.map(p => p[1]); if (x > Math.min(...xs) - 1 && x < Math.max(...xs) + 1 && z > Math.min(...zs) - 1 && z < Math.max(...zs) + 1) return false; }
  }
  return true;
}

export function insideOutline(x, z, margin = 0) {
  let inside = false; const pts = OUTLINE;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [ax, az] = pts[j], [bx, bz] = pts[i];
    if ((az > z) !== (bz > z) && x < (bx - ax) * (z - az) / (bz - az) + ax) inside = !inside;
    if (margin > 0) { const dx = bx - ax, dz = bz - az, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz))); if ((x - ax - dx * t) ** 2 + (z - az - dz * t) ** 2 < margin * margin) return false; }
  }
  return inside;
}
