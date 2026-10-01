// Lumen stage 5: ground marks, painted into the city ground's one colour
// texture (world/city-ground.js paintGround, called with the shapes from
// world/lumen-ground.js groundShapes), so every preset has them and they cost
// no draw, no triangle and nothing per frame. Pure data (no three.js, no
// DOM): each mark is a polygon `{ poly, colour, alpha }` in world metres.
//
// What they tell (claude/lumen-design.md 6, 18b "Everywhere at street level",
// Garage and Charging): skid marks leading to every crash and every car that
// stopped in the road (the pileup, the car in the shopfront, the taxis, the
// wrecks, the jams; parked cars get none), oil where cars bled or were
// worked on (under the wrecks, the pileup, the garage apron, the charging
// lot), cracked asphalt and darker repair patches, tyre marks turning into
// the garage and the parking structure, paths worn by feet (the Stacks
// courtyard, the charging lot, the doors, the metro), the oil-drip line down
// the middle of each lane, and an old dried drag mark type for the dead's
// scenes (stage 5 S2 owns where: `dragMarkShapes`).
//
// Rules: nothing painted inside a building's footprint (a room's floor
// covers it anyway) or outside the playable outline; no lettering, no team
// colour (every colour is a dark, low-chroma grey or brown; the test checks
// they are 15+ CIEDE2000 from Amber, Cyan and Violet). No `blur` shapes: a
// blurred shape repaints the whole canvas once (paintGround's scratch
// upscale), so softness comes from a few stacked alphas instead.
//
// The oil's sheen: the wet-ground shader has one mask (puddles, red only);
// giving oil a wetness-driven sheen needs a second channel there
// (render/wet-ground.js + effects/rain.js buildPuddleMask), which is shared
// code. Until then oil is a dark stain with a faint low-chroma rim (bronze,
// slate, bottle green) that reads as a film on the wet street; `oilPatches()`
// lists each patch (x, z, r) for that hook.
import { ROADS, CROSSROADS, FOOTPRINTS, OUTLINE, BACK_ALLEY } from '../maps/lumen-layout.js';
import { LUMEN_PROPS, DENSITY_ZONES } from '../maps/lumen-cover.js';

export const CITY_MARKS = Object.freeze({
  // Skids: the rubber a braking tyre leaves (dark, darkest at the car).
  skid: Object.freeze({ colour: '#131417', width: .2, alpha: .62, step: .9, steps: 4 }),
  // Per kind of stop: length (m) [min, max], sideways drift at the far end (m), four tracks (a slide) or two.
  stops: Object.freeze({
    crash: Object.freeze({ length: [11, 17], drift: [.8, 2.2], slide: true }),
    taxi: Object.freeze({ length: [6, 8], drift: [.2, .6], slide: false }),
    stopped: Object.freeze({ length: [2.6, 5], drift: [0, .25], slide: false }),
  }),
  oil: Object.freeze({ stain: '#17181b', film: '#1d1e22', rims: Object.freeze(['#2e3138', '#34302b', '#2b322f']) }),
  crack: Object.freeze({ colour: '#191b1f', width: .09, count: 150, alligator: 22 }),
  patch: Object.freeze({ asphalt: '#24272d', seam: '#1a1c20', slab: '#53565e', count: 46, trenches: 7 }),
  tyre: Object.freeze({ colour: '#17181b', alpha: .34, gauge: 1.55, width: .2 }),
  worn: Object.freeze({ walk: '#575a62', yard: '#33312d', alpha: .13 }),
  drip: Object.freeze({ colour: '#202328', alpha: .22, width: .7 }),
  // Old blood, dried and darkened by age: never a fresh-blood red.
  drag: Object.freeze({ colour: '#3a1e1c', edge: '#2c1b1a', alpha: .55, width: .42 }),
});

// The vehicles a stop is read from (not the bus: a room; not motorbikes).
const VEHICLES = Object.freeze({ cityCompact: [3.6, 1.7], citySedan: [4.6, 1.9], citySuv: [4.9, 2], cityTaxi: [4.5, 1.9], citySports: [4.4, 2], cityVan: [5.2, 2.1], cityTruck: [7.4, 2.5], cityWreck: [4.3, 1.9] });
// Lots where cars were parked, not stopped: no skids.
const PARKED = DENSITY_ZONES.filter(z => z.id === 'garage-frontage' || z.id === 'charging-lot').map(z => z.poly);

// A seeded stream (the same marks every load).
function seeded(seed) { let s = seed >>> 0 || 1; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }
const q2 = v => Math.round(v * 100) / 100;
const hex2 = v => Math.max(0, Math.min(1, Math.round(v * 1000) / 1000));

export function pointInPoly(poly, x, z) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, az] = poly[j], [bx, bz] = poly[i];
    if ((az > z) !== (bz > z) && x < (bx - ax) * (z - az) / (bz - az) + ax) inside = !inside;
  }
  return inside;
}
// Every building's footprint as polygons (the layout's rects and quads).
export const FOOTPRINT_POLYS = Object.freeze(FOOTPRINTS.flatMap(f => [...(f.parts || []).map(([x0, x1, z0, z1]) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]), ...(f.quads || [])]));
// Ground a mark may lie on: inside the outline (by `margin`), off every footprint (grown by `pad`).
const RECTS = FOOTPRINTS.flatMap(f => f.parts || []);
const QUADS = FOOTPRINTS.flatMap(f => f.quads || []).map(q => ({ q, x0: Math.min(...q.map(p => p[0])), x1: Math.max(...q.map(p => p[0])), z0: Math.min(...q.map(p => p[1])), z1: Math.max(...q.map(p => p[1])) }));
// The outline as a raster (0.25 m, scanline-filled once on first use): the
// marks ask about tens of thousands of points, and the polygon tests cost
// ~70 ms a paint where this costs ~2 ms. The margin is checked at the four
// points `margin` away (a square, not a circle: fine for paint).
const CELL = .25, GX0 = -70, GZ0 = -62, GW = 560, GH = 496;
let INSIDE = null;
function insideRaster() {
  INSIDE = new Uint8Array(GW * GH);
  for (let k = 0; k < GH; k++) {
    const z = GZ0 + (k + .5) * CELL, xs = [];
    for (let i = 0, j = OUTLINE.length - 1; i < OUTLINE.length; j = i++) { const [ax, az] = OUTLINE[j], [bx, bz] = OUTLINE[i]; if ((az > z) !== (bz > z)) xs.push(ax + (bx - ax) * (z - az) / (bz - az)); }
    xs.sort((a, b) => a - b);
    for (let s = 0; s + 1 < xs.length; s += 2) for (let c = Math.max(0, Math.ceil((xs[s] - GX0) / CELL - .5)); c < GW && GX0 + (c + .5) * CELL < xs[s + 1]; c++) INSIDE[k * GW + c] = 1;
  }
  return INSIDE;
}
const inside = (x, z) => { const c = Math.floor((x - GX0) / CELL), k = Math.floor((z - GZ0) / CELL); return c >= 0 && k >= 0 && c < GW && k < GH && (INSIDE || insideRaster())[k * GW + c] === 1; };
export function openGround(x, z, margin = .3, pad = .05) {
  for (let i = 0; i < RECTS.length; i++) { const r = RECTS[i]; if (x > r[0] - pad && x < r[1] + pad && z > r[2] - pad && z < r[3] + pad) return false; }
  for (let i = 0; i < QUADS.length; i++) { const Q = QUADS[i]; if (x > Q.x0 && x < Q.x1 && z > Q.z0 && z < Q.z1 && pointInPoly(Q.q, x, z)) return false; }
  return inside(x, z) && inside(x - margin, z) && inside(x + margin, z) && inside(x, z - margin) && inside(x, z + margin);
}

// A thick polyline as one polygon (left side out, right side back).
export function ribbon(points, width) {
  const n = points.length, left = [], right = [];
  if (n < 2) return null;
  for (let i = 0; i < n; i++) {
    const [ax, az] = points[Math.max(0, i - 1)], [bx, bz] = points[Math.min(n - 1, i + 1)];
    const len = Math.hypot(bx - ax, bz - az) || 1, hw = (Array.isArray(width) ? width[i] : width) / 2;
    const nx = -(bz - az) / len * hw, nz = (bx - ax) / len * hw, [x, z] = points[i];
    left.push([q2(x + nx), q2(z + nz)]); right.push([q2(x - nx), q2(z - nz)]);
  }
  return [...left, ...right.reverse()];
}

// The vehicles standing in the road (a stop), each with its kind, heading
// and size: the map's cars and wrecks, the pileup's three cars.
export function vehicleStops(props = LUMEN_PROPS) {
  const out = [];
  for (const p of props) {
    const a = p.angle || 0;
    if (p.type === 'cityPileup') {
      // Three cars in one piece (world/lumen-props.js: two lying east-west,
      // one north-south between them) on the westbound lanes: they came in
      // from the east, the middle one spun.
      for (const [lx, lz, L, W, turn, drift] of [[-.7, -2.35, 4, 1.9, 0, .9], [1.85, .45, 4.4, 1.9, Math.PI / 2, 2.6], [-.85, 2.35, 3.9, 1.9, 0, 1.4]]) {
        const x = p.x + lx * Math.cos(a) + lz * Math.sin(a), z = p.z - lx * Math.sin(a) + lz * Math.cos(a);
        out.push({ x, z, heading: Math.PI + a, body: turn, length: L, width: W, kind: 'crash', drift, id: `pileup-${out.length}` });
      }
      continue;
    }
    const size = VEHICLES[p.type]; if (!size) continue;
    if (PARKED.some(poly => pointInPoly(poly, p.x, p.z))) continue;
    const kind = p.type === 'cityWreck' || (p.x === -22.9 && p.z === 8.15) ? 'crash' : p.type === 'cityTaxi' ? 'taxi' : 'stopped';
    out.push({ x: p.x, z: p.z, heading: a, body: 0, length: size[0], width: size[1], kind, id: `${p.type}@${p.x},${p.z}` });
  }
  return out;
}

// Skid marks behind each stop: the tracks run back from the wheels against
// the direction of travel, drifting sideways toward where the braking began
// (a crash's tracks slide and curve; a stopped car's are short and straight),
// darkest at the car and fading out. Each track is `steps` ribbons of
// falling alpha, cut short where it would run into a building or off the map.
export function skidShapes(stops = vehicleStops(), spec = CITY_MARKS) {
  const S = spec.skid, out = [], rand = seeded(5171);
  for (const v of stops) {
    const kind = spec.stops[v.kind], length = kind.length[0] + rand() * (kind.length[1] - kind.length[0]);
    const drift = (v.drift ?? (kind.drift[0] + rand() * (kind.drift[1] - kind.drift[0]))) * (rand() < .5 ? -1 : 1);
    // travel direction (world): local +x is (cos a, -sin a)
    const hx = Math.cos(v.heading), hz = -Math.sin(v.heading), nx = -hz, nz = hx;
    // the body's own axis (the spun car of the pileup lies across its track)
    const bx = Math.cos(v.heading + v.body), bz = -Math.sin(v.heading + v.body), cx = -bz, cz = bx;
    const wheels = [];
    for (const side of [-1, 1]) {
      wheels.push([v.x + bx * v.length * .32 + cx * side * v.width * .4, v.z + bz * v.length * .32 + cz * side * v.width * .4]);
      if (kind.slide) wheels.push([v.x - bx * v.length * .32 + cx * side * v.width * .4, v.z - bz * v.length * .32 + cz * side * v.width * .4]);
    }
    for (const [wx, wz] of wheels) {
      const pts = [];
      for (let t = 0; t <= length + 1e-6; t += S.step) {
        const u = t / length, off = drift * u * u, x = wx - hx * t + nx * off, z = wz - hz * t + nz * off;
        if (!openGround(x, z, .4)) break;
        pts.push([x, z]);
      }
      if (pts.length < 2) continue;
      const per = Math.ceil(pts.length / S.steps);
      for (let k = 0; k < S.steps; k++) {
        const part = pts.slice(k * per, Math.min(pts.length, (k + 1) * per + 1));
        if (part.length < 2) break;
        const poly = ribbon(part, S.width * (1 - k * .08));
        if (poly) out.push({ poly, colour: S.colour, alpha: hex2(S.alpha * (1 - k / S.steps) * (.85 + rand() * .3)), mark: 'skid', of: v.id });
      }
    }
  }
  return out;
}

// An irregular blob: `sides` corners round (x, z), radius r jittered.
function blob(rand, x, z, r, sides = 9, jitter = .35, squash = 1, turn = 0) {
  const pts = [];
  for (let i = 0; i < sides; i++) {
    const a = i / sides * Math.PI * 2, rr = r * (1 - jitter / 2 + rand() * jitter), lx = Math.cos(a) * rr, lz = Math.sin(a) * rr * squash;
    pts.push([q2(x + lx * Math.cos(turn) - lz * Math.sin(turn)), q2(z + lx * Math.sin(turn) + lz * Math.cos(turn))]);
  }
  return pts;
}

// Where oil lies: under the wrecks and the pileup, a few of the stopped cars,
// the garage's apron and bays, the charging lot, and drips on the lanes.
export function oilPatches(stops = vehicleStops()) {
  const rand = seeded(6203), out = [];
  for (const v of stops) {
    if (v.kind === 'crash') { out.push({ x: v.x + Math.cos(v.heading) * v.length * .3, z: v.z - Math.sin(v.heading) * v.length * .3, r: 1.1 + rand() * .7 }); if (rand() < .6) out.push({ x: v.x - Math.cos(v.heading) * 1.8, z: v.z + Math.sin(v.heading) * 1.8, r: .5 + rand() * .4 }); }
    else if (rand() < .3) out.push({ x: v.x + Math.cos(v.heading) * v.length * .3, z: v.z - Math.sin(v.heading) * v.length * .3, r: .45 + rand() * .35 });
  }
  // The garage (bay door at -55.5, 10.5 onto the Boulevard; the workshop and the parking structure beside it) and the charging lot.
  for (const [x, z, r] of [[-55.5, 8.6, 1.3], [-53.2, 7.9, .7], [-57.6, 9.1, .6], [-47.5, 8.8, .8], [-38.5, 8.9, .9], [-35, 16.4, .8], [-38.4, 25.6, .7], [-16.5, 43.2, 1], [-12.8, 47.6, .8], [-18.6, 52.2, .6], [-7.4, 40.5, .7], [-44.8, 25.9, .6], [-52.2, 26.1, .9]])
    out.push({ x, z, r });
  return out.filter(o => openGround(o.x, o.z, .5)).map(o => ({ x: q2(o.x), z: q2(o.z), r: q2(o.r) }));
}
export function oilShapes(patches = oilPatches(), spec = CITY_MARKS) {
  const O = spec.oil, rand = seeded(7019), out = [];
  for (const o of patches) {
    const turn = rand() * Math.PI, squash = .55 + rand() * .35;
    out.push({ poly: blob(rand, o.x, o.z, o.r * 1.25, 11, .4, squash, turn), colour: O.film, alpha: .45, mark: 'oil' });
    out.push({ poly: blob(rand, o.x, o.z, o.r, 10, .45, squash, turn), colour: O.stain, alpha: .6, mark: 'oil' });
    // The rim: short arcs of film colour just inside the edge (bronze, slate, bottle green).
    for (let k = 0; k < 3; k++) {
      const a0 = rand() * Math.PI * 2, span = .8 + rand() * 1.2, rr = o.r * (.72 + k * .09), pts = [];
      for (let s = 0; s <= 6; s++) { const a = a0 + span * s / 6, lx = Math.cos(a) * rr, lz = Math.sin(a) * rr * squash; pts.push([o.x + lx * Math.cos(turn) - lz * Math.sin(turn), o.z + lx * Math.sin(turn) + lz * Math.cos(turn)]); }
      out.push({ poly: ribbon(pts, .07 + o.r * .04), colour: O.rims[k], alpha: .5, mark: 'oil' });
    }
  }
  return out;
}

// A point on a random road's roadway or sidewalk (the Cut's too), open ground only.
function roadPoint(rand, where = 'road') {
  for (let tries = 0; tries < 40; tries++) {
    const r = ROADS[Math.floor(rand() * ROADS.length)], h = r.width / 2;
    let x, z;
    const across = where === 'road' ? (rand() * 2 - 1) * (h - .4) : (rand() < .5 ? -1 : 1) * (h + .3 + rand() * (r.sidewalk - .6));
    if (r.axis === 'x') { x = r.from + rand() * (r.to - r.from); z = r.centre + across; }
    else if (r.axis === 'z') { z = r.from + rand() * (r.to - r.from); x = r.centre + across; }
    else { const t = rand(), len = Math.hypot(r.b[0] - r.a[0], r.b[1] - r.a[1]), ux = (r.b[0] - r.a[0]) / len, uz = (r.b[1] - r.a[1]) / len; x = r.a[0] + ux * len * t - uz * across; z = r.a[1] + uz * len * t + ux * across; }
    if (openGround(x, z, 1)) return [x, z, r];
  }
  return null;
}

// Cracks: wandering lines with a branch or two; and patches of alligator
// cracking (a jittered net) where the asphalt has failed.
export function crackShapes(spec = CITY_MARKS) {
  const C = spec.crack, rand = seeded(8123), out = [];
  const walk = (x, z, dir, steps, width) => {
    const pts = [[x, z]];
    for (let i = 0; i < steps; i++) {
      dir += (rand() - .5) * 1.1; const len = .35 + rand() * .55;
      x += Math.cos(dir) * len; z += Math.sin(dir) * len;
      if (!openGround(x, z, .5)) break;
      pts.push([x, z]);
      if (rand() < .16 && steps > 3) walk(x, z, dir + (rand() < .5 ? 1 : -1) * (.7 + rand() * .6), Math.ceil(steps / 2), width * .7);
    }
    if (pts.length >= 2) out.push({ poly: ribbon(pts, pts.map((_, i) => width * (1 - i / pts.length * .6))), colour: C.colour, alpha: hex2(.42 + rand() * .25), mark: 'crack' });
  };
  for (let i = 0; i < C.count; i++) { const at = roadPoint(rand, rand() < .72 ? 'road' : 'walk'); if (at) walk(at[0], at[1], rand() * Math.PI * 2, 4 + Math.floor(rand() * 8), C.width * (.8 + rand() * .6)); }
  for (let i = 0; i < C.alligator; i++) {
    const at = roadPoint(rand, 'road'); if (!at) continue;
    const [cx, cz] = at, cell = .38, n = 3 + Math.floor(rand() * 3), m = 2 + Math.floor(rand() * 3), grid = [];
    for (let a = 0; a <= n; a++) { grid.push([]); for (let b = 0; b <= m; b++) grid[a].push([cx + (a - n / 2) * cell + (rand() - .5) * cell * .6, cz + (b - m / 2) * cell + (rand() - .5) * cell * .6]); }
    const edge = (p, q) => { if (openGround(p[0], p[1], .5) && openGround(q[0], q[1], .5)) out.push({ poly: ribbon([p, q], C.width * .55), colour: C.colour, alpha: .4, mark: 'crack' }); };
    for (let a = 0; a <= n; a++) for (let b = 0; b <= m; b++) { if (a < n && rand() < .8) edge(grid[a][b], grid[a + 1][b]); if (b < m && rand() < .8) edge(grid[a][b], grid[a][b + 1]); }
  }
  return out;
}

// Repairs: darker rectangles of newer asphalt with a sealed seam, long
// trench patches where a utility was dug along a lane, and paler replaced
// slabs on the sidewalks.
export function patchShapes(spec = CITY_MARKS) {
  const P = spec.patch, rand = seeded(9241), out = [];
  const rect = (x, z, w, d, a) => { const c = Math.cos(a), s = Math.sin(a); return [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]].map(([lx, lz]) => [q2(x + lx * c - lz * s), q2(z + lx * s + lz * c)]); };
  const fits = poly => poly.every(([x, z]) => openGround(x, z, .4));
  const along = r => r.axis === 'x' ? 0 : r.axis === 'z' ? Math.PI / 2 : Math.atan2(r.b[1] - r.a[1], r.b[0] - r.a[0]);
  const seamed = (x, z, w, d, a, colour, alpha) => {
    const poly = rect(x, z, w, d, a); if (!fits(poly)) return false;
    out.push({ poly, colour, alpha, mark: 'patch' });
    for (let k = 0; k < 4; k++) out.push({ poly: ribbon([poly[k], poly[(k + 1) % 4]], .06), colour: P.seam, alpha: .7, mark: 'patch' });
    return true;
  };
  for (let i = 0; i < P.count; i++) { const at = roadPoint(rand, 'road'); if (at) seamed(at[0], at[1], .9 + rand() * 2.4, .7 + rand() * 1.6, along(at[2]) + (rand() - .5) * .08, P.asphalt, .8); }
  for (let i = 0; i < P.trenches; i++) { const at = roadPoint(rand, 'road'); if (at) seamed(at[0], at[1], 5 + rand() * 7, .55 + rand() * .2, along(at[2]), P.asphalt, .75); }
  for (let i = 0; i < 26; i++) { const at = roadPoint(rand, 'walk'); if (at) { const s = .9 + rand() * .4; seamed(at[0], at[1], s, s, along(at[2]), P.slab, .45); } }
  return out;
}

// Tyre marks turning in: from the roadway through the doorway of the EV
// garage's bay and the parking structure's ramps, and across the charging
// lot to the posts (two tracks a gauge apart on a quarter bend).
export function tyreShapes(spec = CITY_MARKS) {
  const T = spec.tyre, rand = seeded(3301), out = [];
  const bend = (a, c, b, n = 12) => Array.from({ length: n + 1 }, (_, i) => { const t = i / n, u = 1 - t; return [u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]]; });
  const pair = (a, c, b) => {
    const mid = bend(a, c, b);
    for (const side of [-1, 1]) {
      const pts = mid.map((p, i) => { const [ax, az] = mid[Math.max(0, i - 1)], [bx, bz] = mid[Math.min(mid.length - 1, i + 1)], len = Math.hypot(bx - ax, bz - az) || 1; return [p[0] - (bz - az) / len * side * T.gauge / 2, p[1] + (bx - ax) / len * side * T.gauge / 2]; }).filter(([x, z]) => openGround(x, z, .3, -.01));
      if (pts.length >= 2) out.push({ poly: ribbon(pts, T.width), colour: T.colour, alpha: hex2(T.alpha * (.8 + rand() * .4)), mark: 'tyre' });
    }
  };
  // EV garage bay (door -57.25..-53.75 at z 10.5): in from both lanes of the eastbound Boulevard.
  pair([-47, 5.2], [-55.5, 5.5], [-55.5, 10.3]); pair([-64, 4.8], [-55.4, 4.6], [-55.2, 10.3]); pair([-49.5, 2.2], [-54.6, 4], [-54.8, 10.3]);
  // The parking structure: its Boulevard ramp (x -40.4..-36.6) and West Street ramp (z 14.1..18.9), and out onto South Street.
  pair([-30, 5], [-38.5, 5.4], [-38.5, 10.3]); pair([-31.2, 8], [-31.5, 16.4], [-35.8, 16.5]); pair([-38.5, 24.2], [-38.3, 28.5], [-30, 28.8]);
  // The charging lot: to the posts and out to the Avenue mouth.
  pair([-2.5, 44], [-12, 44.5], [-19.5, 44.8]); pair([-3, 50.5], [-14, 50.2], [-18, 50]); pair([-16, 40], [-10, 38], [-3.5, 39.5]);
  return out;
}

// Worn paths: where feet have polished the paving (paler) or packed the
// yard's grit (darker): across the Stacks courtyard from its mouth to its
// doors, across the charging lot, up to the metro, and aprons at busy doors.
export function wornShapes(spec = CITY_MARKS) {
  const W = spec.worn, rand = seeded(4721), out = [];
  const path = (pts, colour, width) => {
    const good = pts.filter(([x, z]) => openGround(x, z, .3));
    if (good.length < 2) return;
    for (const [k, a] of [[1, W.alpha], [.55, W.alpha]]) out.push({ poly: ribbon(good, good.map(() => width * k * (.85 + rand() * .3))), colour, alpha: hex2(a), mark: 'worn' });
  };
  // the Stacks courtyard: from the West Street mouth to the three doors
  path([[-36.5, -28.5], [-39.5, -28.2], [-43, -29], [-46.5, -31.5], [-47.2, -33.4]], W.yard, 1.4);
  path([[-39.5, -28.2], [-44, -27], [-48, -25.2], [-49.4, -25]], W.yard, 1.2);
  path([[-42, -28], [-45, -24.6], [-46.5, -22.6]], W.yard, 1.1);
  // the charging lot and the office
  path([[-3, 42], [-7, 44.5], [-9.6, 47]], W.walk, 1.1);
  // the metro: in from the Cut's sidewalk and the plaza to the gates
  path([[20, 25], [23, 32], [26.5, 38], [28.5, 43.6]], W.walk, 1.6);
  path([[34, 28], [32.5, 35], [29.5, 43.6]], W.walk, 1.3);
  // Back Alley's middle line
  path([[BACK_ALLEY.x0 + .5, -23.8], [-16, -23.6], [-8, -23.9], [BACK_ALLEY.x1 - .5, -23.7]], W.yard, 1.3);
  // the Crossroads' scramble corners (where everyone waited)
  const C = CROSSROADS;
  for (const [x, z] of [[C.x0 + 2.8, C.z0 + 2.8], [C.x1 - 2.8, C.z0 + 2.8], [C.x0 + 2.8, C.z1 - 2.8], [C.x1 - 2.8, C.z1 - 2.8]]) if (openGround(x, z, .3)) out.push({ poly: blob(rand, x, z, 1.6, 10, .3, .8, rand() * 3), colour: W.walk, alpha: hex2(W.alpha * .9), mark: 'worn' });
  return out;
}

// The drip line: a dark band down the middle of each traffic lane where cars
// idled (broken into pieces, each its own strength).
export function dripShapes(spec = CITY_MARKS) {
  const D = spec.drip, rand = seeded(2207), out = [];
  const lanes = [];
  for (const r of ROADS) {
    if (r.axis === 'diagonal') { const len = Math.hypot(r.b[0] - r.a[0], r.b[1] - r.a[1]), ux = (r.b[0] - r.a[0]) / len, uz = (r.b[1] - r.a[1]) / len; for (const off of [-2.25, 2.25]) lanes.push([r.a[0] - uz * off, r.a[1] + ux * off, ux, uz, len]); continue; }
    const offs = r.id === 'boulevard' ? [-5.5, -2.5, 2.5, 5.5] : r.id === 'avenue' ? [-3.3, 3.3] : [-1.75, 1.75];
    for (const off of offs) lanes.push(r.axis === 'x' ? [r.from, r.centre + off, 1, 0, r.to - r.from] : [r.centre + off, r.from, 0, 1, r.to - r.from]);
  }
  for (const [ox, oz, ux, uz, len] of lanes) for (let t = 0; t < len; t += 3.2) {
    const a = [ox + ux * t, oz + uz * t], b = [ox + ux * (t + 2.6 + rand()), oz + uz * (t + 2.6 + rand())];
    if (!openGround(a[0], a[1], 1) || !openGround(b[0], b[1], 1) || rand() < .3) continue;
    out.push({ poly: ribbon([a, b], D.width * (.7 + rand() * .5)), colour: D.colour, alpha: hex2(D.alpha * (.5 + rand() * .7)), mark: 'drip' });
  }
  return out;
}

// An old drag mark (the dead's scenes, stage 5 S2): a smeared band along
// `points` ([[x, z], ...], from where it starts to where the body lies),
// ragged at its edges, heavy where it starts and thinning out, with a few
// finger smears; dried and dark (CITY_MARKS.drag). Pure: S2 passes its own
// points (maps/lumen-bodies.js), and groundShapes paints what cityMarkShapes
// is given in `drags`.
export function dragMarkShapes(points, seed = 1, spec = CITY_MARKS) {
  const D = spec.drag, rand = seeded(seed * 7919 + 13), out = [];
  if (!points || points.length < 2) return out;
  const n = points.length;
  out.push({ poly: ribbon(points, points.map((_, i) => D.width * (1.15 - .6 * i / n) * (.85 + rand() * .3))), colour: D.edge, alpha: hex2(D.alpha * .6), mark: 'drag' });
  out.push({ poly: ribbon(points, points.map((_, i) => D.width * (.75 - .4 * i / n))), colour: D.colour, alpha: hex2(D.alpha), mark: 'drag' });
  for (let f = 0; f < 3; f++) {
    const [x, z] = points[0], a = rand() * Math.PI * 2, len = .3 + rand() * .3;
    out.push({ poly: ribbon([[x, z], [x + Math.cos(a) * len, z + Math.sin(a) * len]], .05), colour: D.colour, alpha: hex2(D.alpha * .8), mark: 'drag' });
  }
  return out;
}

// Every mark, in paint order (repairs and cracks first, then the lane drips,
// the tyre marks and skids over them, oil and wear on top; drags last).
// `drags`: [{ points, seed }] from the dead's scenes (S2).
export function cityMarkShapes({ props = LUMEN_PROPS, drags = [] } = {}) {
  const stops = vehicleStops(props);
  return [...patchShapes(), ...crackShapes(), ...dripShapes(), ...tyreShapes(), ...skidShapes(stops), ...oilShapes(oilPatches(stops)), ...wornShapes(),
    ...drags.flatMap((d, i) => dragMarkShapes(d.points, d.seed ?? i + 1))].filter(s => s.poly && s.poly.length >= 3);
}
