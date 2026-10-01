// Lumen's pigeons and rats (lumen-design.md 6 and 14b; stage 3, agent E): where
// they stand and how they behave. No three.js here (effects/lumen-life.js draws
// them), so the rules run in node tests, as Hollow Wick's crows do
// (effects/crow-rules.js). The animals are cosmetic: nothing collides with them,
// they deal and take nothing, they carry no simulation state and the sim is never
// asked anything for them.
//
// The rules (owner's brief, design 14b):
//  - Pigeons walk and peck on sidewalks, plazas and the market's edges; perch on
//    ledges (dumpster lids, bins, the kiosk, the shelter's back panel, planters),
//    the low buildings' eaves, the bus roof, traffic-light mast arms and lamp arms
//    (read from map.citySigns); take off in a clattering flock at gunfire, a blast
//    or a visible player within ~5 m, circle once, and land somewhere else; now
//    and then a few fly across, along a street, high.
//  - Rats work the wall bases of the Stacks courtyard, the market and Back Alley
//    (round the body pile), and the dumpsters anywhere; they bolt from anyone
//    within ~4 m and at gunfire into the nearest drain or under a dumpster, stay
//    hidden a while, then creep back. They never enter water.
//  - NEVER: inside a building, a prop or any collider (a grid of the ground is
//    made from the map's own colliders), on the roadway (rats) or in a puddle,
//    and only ever react to the players the view draws (the frame's `others` and
//    your own player), so nothing here can give away a player the view hides.
//  - Moved only inside the camera's window: an animal outside the screen and a
//    margin is asleep (no timers, no draw); one left far behind is moved, unseen,
//    to a spot just outside the window, so a handful still fills the screen.
//
// Nothing here allocates once running: animals are plain objects made in the
// constructor, spots and grids are typed arrays, and the frame's numbers reach
// the code through object fields, never through throwaway arrays or closures.
import { mapColliders, mapProps, buildingContains } from '../map-kit.js';
import { LUMEN_DETAIL_TYPES } from '../world/lumen-detail.js';
import { OUTDOOR_CAMERA_HEIGHT, CAMERA_TILT, fairFov } from '../render/camera-framing.js';
import { ROADS, CROSSROADS } from '../maps/lumen-layout.js';
import { waterPlaces } from './lumen-water-places.js';

// Numbers in one place. Metres, seconds, radians.
export const LIFE = Object.freeze({
  seed: 5805,
  // Per preset (design 14b): pigeons, rats, and how many extra pigeons may be
  // flying across at once (they come on top of the pigeons on the ground).
  pigeons: Object.freeze({ potato: 4, performance: 8, balanced: 12, quality: 18, extreme: 24 }),
  rats: Object.freeze({ potato: 0, performance: 3, balanced: 6, quality: 10, extreme: 14 }),
  flyovers: Object.freeze({ potato: 0, performance: 1, balanced: 1, quality: 2, extreme: 3 }),
  // How many of them are seated round the Back Alley body pile at first
  // (pigeons peck round it, rats nose round it).
  pileBirds: Object.freeze({ potato: 1, performance: 1, balanced: 2, quality: 2, extreme: 3 }),
  pileRats: Object.freeze({ potato: 0, performance: 1, balanced: 2, quality: 3, extreme: 4 }),
  // The ground grid (m) and how far a collider is padded for each kind of animal.
  cell: .25, padHard: .18, padSoft: .42,
  // The camera's window, as margins (m) beyond the screen: an animal inside
  // `active` is alive and drawn; one outside `keep` is sent back near the
  // action; a relocated animal lands between `band` (just outside `active`)
  // and `reach`.
  active: 6, keep: 24, bandIn: 9, bandOut: 20, gatherEvery: .3, jump: 34,
  // --- Pigeons ---
  // A visible player this close sends the flock up (a bird up on a roof, ledge
  // or arm is warier of nothing: it is further from the feet, so closer is needed).
  approach: 5, approachHigh: 3.5, lowPerch: 2.5,
  // A round's line, an impact, a blast, a falling body this close.
  roundLine: 5, roundImpact: 6, blast: 18, fall: 5,
  // Neighbours of a bird that goes up go too, within this, a moment later.
  flock: 4.5, flockDelay: Object.freeze([.05, .32]),
  walk: Object.freeze([.45, .85]), wander: 2.6,
  peck: Object.freeze([2, 5]), pauses: Object.freeze([.7, 2.6]),
  climbSpeed: 5, cruise: Object.freeze([7, 9]), altitude: Object.freeze([7.6, 10]),
  circleRadius: Object.freeze([3.2, 5.4]), landRadius: .3,
  settle: Object.freeze([12, 34]), keepAway: 9, turnRate: 3.6, flyClear: 1, ceiling: 9, // (nothing flies higher than this: taller buildings are walls)
  coo: Object.freeze([6, 16]), hush: 20,
  flyoverEvery: Object.freeze([16, 38]), flyoverHeight: Object.freeze([8.6, 11.5]), flyoverSpeed: 8.5, flyoverReach: 40,
  // --- Rats ---
  ratBolt: 4, ratRound: 7, ratImpact: 6, ratBlast: 18, ratFall: 3,
  ratWander: 2.4, ratCreep: Object.freeze([.9, 1.6]), ratDash: Object.freeze([2.4, 3.6]), ratRun: 6.4,
  ratPause: Object.freeze([.35, 2.2]), ratHide: Object.freeze([6, 13]), ratHideNear: 11, ratWary: 6.5,
  ratMove: .07, // chance a foraging rat moves house (between dumpsters) after a pause
  ratShrink: .12,
});

// Where the Back Alley body pile stands (stage 5 builds it and its collider;
// design 6: ~8-10 bodies heaped against the alley's north wall, x -14..-10,
// in a wall recess so the alley keeps 1.8 m clear). The animals keep off this
// box already, and gather round its edges.
export const BODY_PILE = Object.freeze({ x0: -14.4, x1: -9.6, z0: -26, z1: -23.9 });

// Where rats work (besides dumpsters): boxes [x0, x1, z0, z1].
export const RAT_ZONES = Object.freeze({
  courtyard: [-52, -34, -36, -20], market: [-26, 0, -56, -38], alley: [-26, -1, -26, -21.5],
});

// Perches on props: the top's height, and where on it (local x, z; a bird sits
// on the lid, the panel, the pole's foot cap).
export const PERCH_PROPS = Object.freeze({
  cityDumpster: { y: 1.4, at: [[-.55, 0], [.55, 0]] }, cityUtilityBox: { y: 1.3, at: [[0, 0]] },
  cityKiosk: { y: 2.6, at: [[-.8, .3], [.8, -.3]] }, cityBollard: { y: .9, at: [[0, 0]] },
  cityJersey: { y: 1.2, at: [[-.6, 0], [.6, 0]] }, cityPlanterTall: { y: 1.2, at: [[-.5, 0], [.5, 0]] },
  cityPlanter: { y: .65, at: [[-.4, 0], [.4, 0]] }, cityShelter: { y: 2.4, at: [[-1.2, -.7], [0, -.7], [1.2, -.7]] },
  cityAdPillar: { y: 2.8, at: [[0, 0]] },
});

// The water effects' own places (effects/lumen-water-places.js, made once per
// map and shared): the storm drains rats bolt into, and the downspouts' feet
// (where rain runoff splashes and runs: a wet patch to keep out of).
function waterOf(map) {
  try { return map.city?.water === false ? null : waterPlaces(map); } catch { return null; }
}
const SPOUT_FOOT = 1.1;

const HARD = 1, SOFT = 2, WATER = 4, ROAD = 8;
export const FLAGS = Object.freeze({ HARD, SOFT, WATER, ROAD });
const TAU = Math.PI * 2;
const TILT_LENGTH = Math.hypot(1, CAMERA_TILT), LOOK = OUTDOOR_CAMERA_HEIGHT * TILT_LENGTH * TILT_LENGTH;

// A repeatable 0..1 stream (the same every load).
export function seededRandom(seed = LIFE.seed) { let s = seed >>> 0 || 1; return () => (s = Math.imul(s, 1664525) + 1013904223 >>> 0) / 4294967296; }

// ---------------------------------------------------------------------------
// The ground: which parts of the street an animal may stand on. One byte per
// quarter metre: HARD (inside or against a building, prop, collider or the map
// edge: nothing stands), SOFT (a little further out: pigeons keep off it),
// WATER (a puddle), ROAD (the roadway proper: rats keep off it, pigeons walk
// only on sidewalks and plazas). `tall` is the height of the tallest
// building or solid over the cell (m, whole metres), for what flies.
export class LifeField {
  constructor(map) {
    const area = map.playableArea || [[-map.width / 2, -map.depth / 2], [map.width / 2, map.depth / 2]];
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const [x, z] of area) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    const cell = LIFE.cell;
    this.cell = cell; this.inv = 1 / cell; this.x0 = Math.floor(x0 - 2); this.z0 = Math.floor(z0 - 2);
    this.nx = Math.ceil((x1 + 2 - this.x0) * this.inv); this.nz = Math.ceil((z1 + 2 - this.z0) * this.inv);
    this.flags = new Uint8Array(this.nx * this.nz); this.tall = new Uint8Array(this.nx * this.nz); this.wide = null;
    this.build(map, area);
  }

  flag(x, z) {
    const ix = Math.floor((x - this.x0) * this.inv), iz = Math.floor((z - this.z0) * this.inv);
    if (ix < 0 || iz < 0 || ix >= this.nx || iz >= this.nz) return 15;
    return this.flags[iz * this.nx + ix];
  }
  // The tallest building over (x, z), in whole metres: `rawTallAt` exactly, `tallAt`
  // grown by LIFE.flyClear on every side (what steering looks at).
  rawTallAt(x, z) {
    const ix = Math.floor((x - this.x0) * this.inv), iz = Math.floor((z - this.z0) * this.inv);
    if (ix < 0 || iz < 0 || ix >= this.nx || iz >= this.nz) return 255;
    return this.tall[iz * this.nx + ix];
  }
  tallAt(x, z) {
    const ix = Math.floor((x - this.x0) * this.inv), iz = Math.floor((z - this.z0) * this.inv);
    if (ix < 0 || iz < 0 || ix >= this.nx || iz >= this.nz) return 255;
    return this.wide[iz * this.nx + ix];
  }
  // May a pigeon stand at (x, z)? A rat?
  pigeonFree(x, z) { return (this.flag(x, z) & (HARD | SOFT | WATER | ROAD)) === 0; }
  ratFree(x, z) { return (this.flag(x, z) & (HARD | WATER | ROAD)) === 0; }

  // A padded, turned rectangle: HARD within padHard of it, SOFT within padSoft
  // (both of the cell's centre), `height` recorded where the cell is inside it.
  rect(cx, cz, hw, hd, angle, padHard, padSoft, height) {
    const c = Math.cos(angle), s = Math.sin(angle), r = Math.hypot(hw, hd) + padSoft + this.cell;
    const ia = Math.max(0, Math.floor((cx - r - this.x0) * this.inv)), ib = Math.min(this.nx - 1, Math.ceil((cx + r - this.x0) * this.inv));
    const ja = Math.max(0, Math.floor((cz - r - this.z0) * this.inv)), jb = Math.min(this.nz - 1, Math.ceil((cz + r - this.z0) * this.inv));
    for (let j = ja; j <= jb; j++) for (let i = ia; i <= ib; i++) {
      const px = this.x0 + (i + .5) * this.cell - cx, pz = this.z0 + (j + .5) * this.cell - cz;
      const ax = Math.abs(px * c - pz * s) - hw, az = Math.abs(px * s + pz * c) - hd, k = j * this.nx + i;
      if (ax <= padSoft && az <= padSoft) {
        this.flags[k] |= SOFT;
        if (ax <= padHard && az <= padHard) this.flags[k] |= HARD;
        if (height && ax <= this.cell * .5 && az <= this.cell * .5) this.tall[k] = Math.max(this.tall[k], Math.min(255, Math.ceil(height)));
      }
    }
  }

  build(map, area) {
    const { padHard, padSoft } = LIFE;
    this.outline(area);
    // Every collider the game has (walls, props, solids, the ring of towers).
    for (const c of mapColliders(map)) {
      this.rect(c.x, c.z, (c.localW ?? c.w) / 2, (c.localD ?? c.d) / 2, c.angle || 0, padHard, padSoft, c.wall && (c.height ?? 0) >= 3 ? c.height : 0);
    }
    // The set dressing lying on the ground (the dead, spills, mats, a fallen
    // pane: walk-over pieces with no collider, so rounds fly over them: stage 5
    // review) is still ground an animal keeps off, as when they had one; the
    // street detail's ankle litter (world/lumen-detail.js) is not.
    for (const p of mapProps(map)) if (p.walkOver && p.collisionBoxes?.length === 0 && !LUMEN_DETAIL_TYPES[p.type]) {
      const s = p.scale || 1; this.rect(p.x, p.z, p.w * s / 2, p.d * s / 2, p.angle || 0, padHard, padSoft, 0);
    }
    // Every room: its whole floor (an animal is never inside), and its wall height for what flies.
    const point = { x: 0, z: 0 };
    for (const b of map.buildings || []) {
      const hw = b.w / 2 + padSoft, hd = b.d / 2 + padSoft;
      const ia = Math.max(0, Math.floor((b.x - hw - this.x0) * this.inv)), ib = Math.min(this.nx - 1, Math.ceil((b.x + hw - this.x0) * this.inv));
      const ja = Math.max(0, Math.floor((b.z - hd - this.z0) * this.inv)), jb = Math.min(this.nz - 1, Math.ceil((b.z + hd - this.z0) * this.inv));
      const h = Math.min(255, Math.ceil(b.wallHeight ?? b.height ?? 4));
      for (let j = ja; j <= jb; j++) for (let i = ia; i <= ib; i++) {
        point.x = this.x0 + (i + .5) * this.cell; point.z = this.z0 + (j + .5) * this.cell;
        if (b.quad || b.angle ? buildingContains(b, point) : Math.abs(point.x - b.x) < b.w / 2 && Math.abs(point.z - b.z) < b.d / 2) { const k = j * this.nx + i; this.flags[k] |= HARD | SOFT; if (this.tall[k] < h) this.tall[k] = h; }
      }
    }
    // The body pile's place (its collider comes in stage 5).
    const P = BODY_PILE;
    this.rect((P.x0 + P.x1) / 2, (P.z0 + P.z1) / 2, (P.x1 - P.x0) / 2, (P.z1 - P.z0) / 2, 0, padHard, padSoft, 0);
    // Standing water, a little out from its edge.
    for (const p of map.city?.puddles || []) {
      const c = Math.cos(p.angle || 0), s = Math.sin(p.angle || 0), r = Math.max(p.rx, p.rz) + .6;
      const ia = Math.max(0, Math.floor((p.x - r - this.x0) * this.inv)), ib = Math.min(this.nx - 1, Math.ceil((p.x + r - this.x0) * this.inv));
      const ja = Math.max(0, Math.floor((p.z - r - this.z0) * this.inv)), jb = Math.min(this.nz - 1, Math.ceil((p.z + r - this.z0) * this.inv));
      for (let j = ja; j <= jb; j++) for (let i = ia; i <= ib; i++) {
        const px = this.x0 + (i + .5) * this.cell - p.x, pz = this.z0 + (j + .5) * this.cell - p.z;
        const u = (px * c - pz * s) / (p.rx + .35), v = (px * s + pz * c) / (p.rz + .35);
        if (u * u + v * v <= 1) this.flags[j * this.nx + i] |= WATER;
      }
    }
    // The downspouts' feet, where the roof's rain runs down onto the ground.
    for (const sp of waterOf(map)?.spouts || []) {
      const r = SPOUT_FOOT, ia = Math.max(0, Math.floor((sp.x - r - this.x0) * this.inv)), ib = Math.min(this.nx - 1, Math.ceil((sp.x + r - this.x0) * this.inv));
      const ja = Math.max(0, Math.floor((sp.z - r - this.z0) * this.inv)), jb = Math.min(this.nz - 1, Math.ceil((sp.z + r - this.z0) * this.inv));
      for (let j = ja; j <= jb; j++) for (let i = ia; i <= ib; i++) {
        const x = this.x0 + (i + .5) * this.cell - sp.x, z = this.z0 + (j + .5) * this.cell - sp.z;
        if (x * x + z * z <= r * r) this.flags[j * this.nx + i] |= WATER;
      }
    }
    // The roadway proper (the Crossroads is a paved plaza).
    const C = CROSSROADS;
    for (const r of ROADS) {
      const h = r.width / 2;
      const bx0 = r.axis === 'x' ? r.from : r.axis === 'z' ? r.centre - h : Math.min(r.a[0], r.b[0]) - h, bx1 = r.axis === 'x' ? r.to : r.axis === 'z' ? r.centre + h : Math.max(r.a[0], r.b[0]) + h;
      const bz0 = r.axis === 'z' ? r.from : r.axis === 'x' ? r.centre - h : Math.min(r.a[1], r.b[1]) - h, bz1 = r.axis === 'z' ? r.to : r.axis === 'x' ? r.centre + h : Math.max(r.a[1], r.b[1]) + h;
      const ia = Math.max(0, Math.floor((bx0 - this.x0) * this.inv)), ib = Math.min(this.nx - 1, Math.ceil((bx1 - this.x0) * this.inv));
      const ja = Math.max(0, Math.floor((bz0 - this.z0) * this.inv)), jb = Math.min(this.nz - 1, Math.ceil((bz1 - this.z0) * this.inv));
      for (let j = ja; j <= jb; j++) for (let i = ia; i <= ib; i++) {
        const x = this.x0 + (i + .5) * this.cell, z = this.z0 + (j + .5) * this.cell;
        if (x > C.x0 && x < C.x1 && z > C.z0 && z < C.z1) continue;
        if (onRoad(r, x, z)) this.flags[j * this.nx + i] |= ROAD;
      }
    }
    this.growTall(LIFE.flyClear);
  }

  // What flies keeps clear of a facade: the tall map grows by `metres` on every side.
  growTall(metres) {
    const r = Math.round(metres * this.inv), tmp = new Uint8Array(this.tall.length); this.wide = new Uint8Array(this.tall.length);
    for (let j = 0; j < this.nz; j++) for (let i = 0; i < this.nx; i++) {
      let m = 0; for (let k = Math.max(0, i - r); k <= Math.min(this.nx - 1, i + r); k++) m = Math.max(m, this.tall[j * this.nx + k]);
      tmp[j * this.nx + i] = m;
    }
    for (let j = 0; j < this.nz; j++) for (let i = 0; i < this.nx; i++) {
      let m = 0; for (let k = Math.max(0, j - r); k <= Math.min(this.nz - 1, j + r); k++) m = Math.max(m, tmp[k * this.nx + i]);
      this.wide[j * this.nx + i] = m;
    }
  }

  // Outside the playable outline and within half a metre of it: nothing stands.
  outline(area) {
    this.flags.fill(HARD | SOFT);
    const xs = [];
    for (let j = 0; j < this.nz; j++) {
      const z = this.z0 + (j + .5) * this.cell; xs.length = 0;
      for (let i = 0, k = area.length - 1; i < area.length; k = i++) {
        const ax = area[k][0], az = area[k][1], bx = area[i][0], bz = area[i][1];
        if ((az > z) !== (bz > z)) xs.push((bx - ax) * (z - az) / (bz - az) + ax);
      }
      xs.sort((a, b) => a - b);
      for (let n = 0; n + 1 < xs.length; n += 2) {
        const ia = Math.max(0, Math.ceil((xs[n] - this.x0) * this.inv - .5)), ib = Math.min(this.nx - 1, Math.floor((xs[n + 1] - this.x0) * this.inv - .5));
        for (let i = ia; i <= ib; i++) this.flags[j * this.nx + i] = 0;
      }
    }
    // The edge itself: a margin along every side.
    const m = .45;
    for (let e = 0, k = area.length - 1; e < area.length; k = e++) {
      const ax = area[k][0], az = area[k][1], bx = area[e][0], bz = area[e][1], dx = bx - ax, dz = bz - az, len2 = dx * dx + dz * dz;
      const ia = Math.max(0, Math.floor((Math.min(ax, bx) - m - this.x0) * this.inv)), ib = Math.min(this.nx - 1, Math.ceil((Math.max(ax, bx) + m - this.x0) * this.inv));
      const ja = Math.max(0, Math.floor((Math.min(az, bz) - m - this.z0) * this.inv)), jb = Math.min(this.nz - 1, Math.ceil((Math.max(az, bz) + m - this.z0) * this.inv));
      for (let j = ja; j <= jb; j++) for (let i = ia; i <= ib; i++) {
        const x = this.x0 + (i + .5) * this.cell, z = this.z0 + (j + .5) * this.cell, t = len2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / len2)) : 0;
        if ((x - ax - dx * t) ** 2 + (z - az - dz * t) ** 2 < m * m) this.flags[j * this.nx + i] |= HARD | SOFT;
      }
    }
  }
}

// Is (x, z) on this road's roadway (not its sidewalk)?
function onRoad(r, x, z) {
  const h = r.width / 2;
  if (r.axis === 'x') return x >= r.from && x <= r.to && Math.abs(z - r.centre) < h;
  if (r.axis === 'z') return z >= r.from && z <= r.to && Math.abs(x - r.centre) < h;
  const dx = r.b[0] - r.a[0], dz = r.b[1] - r.a[1], t = Math.max(0, Math.min(1, ((x - r.a[0]) * dx + (z - r.a[1]) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(x - r.a[0] - dx * t, z - r.a[1] - dz * t) < h;
}

// ---------------------------------------------------------------------------
// Every spot the animals use, made once from the map: { ground: pigeons' walking
// spots [x, z, ...], perches [x, y, z, yaw, ...], ratHomes [x, z, ...],
// hides [x, z, kind, ...] (kind 0 drain, 1 dumpster), pileBirds, pileRats }.
export function lifeSpots(map, field, seed = LIFE.seed) {
  const rand = seededRandom(seed), ground = [], perches = [], ratHomes = [], hides = [], pileBirds = [], pileRats = [];
  const props = mapProps(map), point = { x: 0, z: 0 };

  // Pigeons' ground: a jittered grid over the whole city; what is free of
  // colliders, water and roadway is a place to peck. (Sidewalks, plazas, the
  // market's edges and the lots: everything that is not road.)
  const x1 = field.x0 + field.nx * field.cell, z1 = field.z0 + field.nz * field.cell;
  for (let z = field.z0; z < z1; z += 1.5) for (let x = field.x0; x < x1; x += 1.5) {
    const px = x + (rand() - .5) * 1.2, pz = z + (rand() - .5) * 1.2;
    if (field.pigeonFree(px, pz) && field.pigeonFree(px + .3, pz) && field.pigeonFree(px - .3, pz) && field.pigeonFree(px, pz + .3) && field.pigeonFree(px, pz - .3)) ground.push(round2(px), round2(pz));
  }

  // The pile: pigeons peck along its alley side and beside its ends, rats nose
  // round its foot. All measured from BODY_PILE, so stage 5 moves them by moving that box.
  const P = BODY_PILE;
  const alleySide = (t, out) => [P.x0 + t * (P.x1 - P.x0), P.z1 + out]; // t 0..1 along the face toward the alley, `out` m out from it
  const endOf = (side, out, back) => [side < 0 ? P.x0 - out : P.x1 + out, P.z1 - back]; // beside an end, `back` m in from that face
  const keep = (list, free, spots) => { for (const [x, z] of spots) if (free(x, z)) list.push(round2(x), round2(z)); };
  keep(pileBirds, (x, z) => field.pigeonFree(x, z), [alleySide(.08, .7), alleySide(.25, 1.1), alleySide(.5, .6), alleySide(.75, 1), alleySide(.92, .7), alleySide(.4, 1.5), alleySide(.62, 1.4), alleySide(.15, 1.6),
    endOf(-1, .9, .5), endOf(-1, .5, 1), endOf(1, .9, .6), endOf(1, .5, 1.1)]);
  keep(pileRats, (x, z) => field.ratFree(x, z), [alleySide(.04, .38), alleySide(.18, .42), alleySide(.36, .34), alleySide(.52, .4), alleySide(.7, .36), alleySide(.9, .4),
    endOf(-1, .45, .3), endOf(-1, .45, .9), endOf(1, .45, .3), endOf(1, .45, 1)]);

  // Rats' homes: the wall bases inside their zones, and beside every dumpster.
  const nearWall = (x, z) => { for (let k = 0; k < 8; k++) { const a = k * TAU / 8; if (field.flag(x + Math.cos(a) * .55, z + Math.sin(a) * .55) & HARD) return true; } return false; };
  for (const box of Object.values(RAT_ZONES)) for (let z = box[2]; z < box[3]; z += .7) for (let x = box[0]; x < box[1]; x += .7) {
    const px = x + (rand() - .5) * .5, pz = z + (rand() - .5) * .5;
    if (field.ratFree(px, pz) && nearWall(px, pz)) ratHomes.push(round2(px), round2(pz));
  }
  const trash = props.filter(p => p.type === 'cityDumpster' || p.type === 'cityTrashBags');
  for (const p of trash) {
    const c = Math.cos(p.angle), s = Math.sin(p.angle);
    for (let k = 0; k < 12; k++) {
      const lx = (rand() - .5) * (p.w + 1.4), lz = (rand() < .5 ? -1 : 1) * (p.d / 2 + .3 + rand() * .5);
      const x = p.x + lx * c + lz * s, z = p.z - lx * s + lz * c;
      if (field.ratFree(x, z)) ratHomes.push(round2(x), round2(z));
    }
  }

  // Hiding places: under a dumpster (its side, the rat runs in), and the drains.
  for (const p of props) if (p.type === 'cityDumpster') {
    const c = Math.cos(p.angle), s = Math.sin(p.angle);
    for (const [lx, lz] of [[0, -(p.d / 2 + .06)], [0, p.d / 2 + .06], [-(p.w / 2 + .06), 0], [p.w / 2 + .06, 0]]) {
      const x = p.x + lx * c + lz * s, z = p.z - lx * s + lz * c;
      // (The dumpster's padded edge is HARD, so look one step further out.)
      const ox = lx ? Math.sign(lx) * .35 : 0, oz = lz ? Math.sign(lz) * .35 : 0;
      const fx = x + ox * c + oz * s, fz = z - ox * s + oz * c;
      if (field.ratFree(fx, fz) && !(field.flag(x, z) & ROAD)) hides.push(round2(x), round2(z), 1);
    }
  }
  // (The storm drains the water effects draw, in the gutters and the alley; else a list of my own along the kerbs.)
  const drains = waterOf(map)?.drains;
  if (drains?.length) for (const d of drains) hides.push(round2(d.x), round2(d.z), 0);
  for (const [x, z] of drainCandidates(rand, !drains?.length)) {
    const at = nudgeFree(field, x, z);
    if (at) hides.push(round2(at[0]), round2(at[1]), 0);
  }

  // Perches. Low buildings' eaves (outer edges), the bus roof, props' tops, the
  // signs' poles and signal heads.
  const eaves = [];
  for (const b of map.cityBuildings || []) {
    if (b.tall) continue;
    const y = (b.height ?? 4) + .02;
    if (b.id === 'bus') {
      // (The bus roof: three spots along its length.)
      const q = b.rooms[0].quad, mx = (q[0][0] + q[1][0]) / 2, mz = (q[0][1] + q[1][1]) / 2, nx = (q[2][0] + q[3][0]) / 2, nz = (q[2][1] + q[3][1]) / 2;
      const cx = (mx + nx) / 2, cz = (mz + nz) / 2, dx = (q[1][0] - q[0][0]) / 4, dz = (q[1][1] - q[0][1]) / 4, yaw = Math.atan2(dx, dz);
      for (const t of [-1, 0, 1]) perches.push(round2(cx + dx * t), y + .12, round2(cz + dz * t), yaw + Math.PI / 2);
      continue;
    }
    for (const r of b.rooms) {
      const pts = r.quad ? r.quad : [[r.rect[0], r.rect[2]], [r.rect[1], r.rect[2]], [r.rect[1], r.rect[3]], [r.rect[0], r.rect[3]]];
      let cx = 0, cz = 0; for (const p of pts) { cx += p[0] / pts.length; cz += p[1] / pts.length; }
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], c = pts[(i + 1) % pts.length], len = Math.hypot(c[0] - a[0], c[1] - a[1]);
        if (len < 2) continue;
        const ux = (c[0] - a[0]) / len, uz = (c[1] - a[1]) / len;
        let nx = uz, nz = -ux; if ((a[0] - cx) * nx + (a[1] - cz) * nz < 0) { nx = -nx; nz = -nz; }
        for (let t = .8 + rand() * 1.2; t < len - .8; t += 2.2 + rand() * 1.6) {
          const ex = a[0] + ux * t, ez = a[1] + uz * t, ox = ex + nx * .7, oz = ez + nz * .7;
          // Only the edge that faces outdoors: a point just outside must be in no room.
          if ((map.buildings || []).some(bb => { point.x = ox; point.z = oz; return buildingContains(bb, point); })) continue;
          eaves.push(round2(ex - nx * .2), y, round2(ez - nz * .2), Math.atan2(nx, nz) + (rand() < .5 ? Math.PI / 2 : -Math.PI / 2) + (rand() - .5) * .8);
        }
      }
    }
  }
  // (A share of the eaves, so there is room for pigeons on the ground too.)
  for (let i = 0; i < eaves.length; i += 4) if (rand() < .55) perches.push(eaves[i], eaves[i + 1], eaves[i + 2], eaves[i + 3]);
  for (const p of props) {
    const spec = PERCH_PROPS[p.type]; if (!spec) continue;
    const c = Math.cos(p.angle), s = Math.sin(p.angle);
    for (const [lx, lz] of spec.at) perches.push(round2(p.x + lx * c + lz * s), spec.y + .02, round2(p.z - lx * s + lz * c), p.angle + (rand() < .5 ? 0 : Math.PI));
  }
  signPerches(map.citySigns, perches, rand);

  return { ground: new Float32Array(ground), perches: new Float32Array(perches), ratHomes: new Float32Array(ratHomes), hides: new Float32Array(hides), pileBirds: new Float32Array(pileBirds), pileRats: new Float32Array(pileRats) };
}

const round2 = v => Math.round(v * 100) / 100;

// The nearest spot within 2.5 m that is free of everything for a rat.
function nudgeFree(field, x, z) {
  if (field.ratFree(x, z) && field.ratFree(x + .3, z) && field.ratFree(x - .3, z)) return [x, z];
  for (let r = .3; r <= 2.5; r += .3) for (let k = 0; k < 12; k++) {
    const a = k * TAU / 12, px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
    if (field.ratFree(px, pz) && field.ratFree(px + .3, pz) && field.ratFree(px - .3, pz)) return [px, pz];
  }
  return null;
}

// Storm drains: in the kerb of every straight road (on the sidewalk side, an
// inlet in the kerb face), every so often; and a few in the alley, the courtyard
// and the market where the rats work.
function drainCandidates(rand, kerbs = true) {
  const out = [];
  for (const r of ROADS) {
    if (r.axis === 'diagonal' || !kerbs) continue;
    const h = r.width / 2 + .32;
    for (let t = r.from + 6 + rand() * 6; t < r.to - 4; t += 16 + rand() * 10) for (const side of [-1, 1]) {
      if (rand() < .35) continue;
      out.push(r.axis === 'x' ? [t, r.centre + side * h] : [r.centre + side * h, t]);
    }
  }
  out.push([-16.6, -23.2], [-8.0, -23.3], [-20.5, -23.4], [-4.5, -23.6], [-46.2, -24.6], [-39.6, -29.8], [-48.2, -21.6], [-19.5, -41.6], [-8.5, -41.6], [-3, -41.6]);
  return out;
}

// Traffic-light mast arms and lamp arms: where a pigeon can sit. Read from
// map.citySigns ({ kind: 'pole' | 'lamp', at, facing, height, arm }; render/city-signs.js,
// maps/lumen-signs.js) if the map has them. A signal head hangs under its arm
// and its housing top is against the arm, so heads are not perches: the arm
// above them is (two spots along it, clear of the heads' hangers is not needed:
// a head is below the arm's top face).
export function signPerches(list, out, rand = () => .5) {
  if (!Array.isArray(list)) return;
  for (const s of list) {
    const at = s.at ?? [s.x ?? 0, s.y ?? 0, s.z ?? 0], facing = s.facing ?? 0, fx = Math.sin(facing), fz = Math.cos(facing);
    if (s.kind === 'pole' && (s.arm ?? 0) > 1) {
      // (The mast arm's top face is at height - .18 - .02; a bird sits on it.)
      for (const f of [.42, .85]) out.push(round2(at[0] + fx * s.arm * f), round2(at[1] + (s.height ?? 6) - .16), round2(at[2] + fz * s.arm * f), facing + (rand() < .5 ? 0 : Math.PI));
    } else if (s.kind === 'lamp' && s.pole !== false) {
      out.push(round2(at[0] + fx * (s.arm ?? 1.6) * .5), round2(at[1] + (s.height ?? 7) - .0), round2(at[2] + fz * (s.arm ?? 1.6) * .5), facing);
    }
  }
}

// ---------------------------------------------------------------------------
// The animals.
export const BIRD = Object.freeze({ GROUND: 0, PERCH: 1, STARTLE: 2, FLY: 3, OFF: 4 });
export const RAT = Object.freeze({ FORAGE: 0, BOLT: 1, HIDDEN: 2, RETURN: 3 });
// A flying bird's phase.
const CLIMB = 0, CIRCLE = 1, GLIDE = 2, CRUISE = 3;
const MAX_PIGEONS = Math.max(...Object.values(LIFE.pigeons)), MAX_FLYOVERS = Math.max(...Object.values(LIFE.flyovers)), MAX_RATS = Math.max(...Object.values(LIFE.rats));

class Bird {
  constructor(index, flyover) {
    this.index = index; this.flyover = flyover; this.on = false; this.act = false; this.st = BIRD.OFF;
    this.x = 0; this.y = 0; this.z = 0; this.yaw = 0; this.pitch = 0; this.bob = 0; this.beat = 0; this.flap = 0; this.tone = index % 4;
    this.t = 0; this.mode = 0; this.dips = 0; this.dipT = 0; this.coo = 0; this.delay = 0;
    this.hx = 0; this.hz = 0; this.tx = 0; this.tz = 0; this.ty = 0; this.spot = -1; this.perched = false; this.sticky = false;
    this.phase = 0; this.speed = 0; this.alt = 8; this.turn = 0; this.turned = 0; this.age = 0; this.ox = 0; this.oz = 0; this.ax = 0; this.az = 0;
    this.landPerch = false; this.landSpot = -1; this.landYaw = 0; this.oy = 0; this.operch = false; this.endX = 0; this.endZ = 0; this.pile = false;
  }
}
class Rat {
  constructor(index) {
    this.index = index; this.on = false; this.act = false; this.st = RAT.FORAGE; this.x = 0; this.z = 0; this.yaw = 0; this.vis = 1; this.tone = index % 3;
    this.t = 0; this.mode = 0; this.gait = 0; this.hx = 0; this.hz = 0; this.tx = 0; this.tz = 0; this.spot = -1; this.hide = -1; this.hidden = false;
    this.speed = 0; this.stuck = 0; this.sticky = false; this.wary = 0; this.age = 0;
  }
}

const angleDiff = (a, b) => { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; else if (d < -Math.PI) d += TAU; return d; };
const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;

const worlds = new WeakMap();
export class LifeWorld {
  constructor(map, { quality = 'balanced', seed = LIFE.seed } = {}) {
    // (The ground and the spots are the same for a map every time: made once.)
    let made = worlds.get(map);
    if (!made || made.seed !== seed) { const field = new LifeField(map); worlds.set(map, made = { seed, field, spots: lifeSpots(map, field, seed) }); }
    this.field = made.field; this.spots = made.spots; this.map = map; this.seed = seed; this.s = seed >>> 0 || 1;
    this.usedGround = new Uint8Array(this.spots.ground.length / 2); this.usedPerch = new Uint8Array(this.spots.perches.length / 4); this.usedHome = new Uint8Array(this.spots.ratHomes.length / 2);
    this.pigeons = Array.from({ length: MAX_PIGEONS + MAX_FLYOVERS }, (_, i) => new Bird(i, i >= MAX_PIGEONS));
    this.rats = Array.from({ length: MAX_RATS }, (_, i) => new Rat(i));
    this.roads = ROADS.filter(r => r.axis !== 'diagonal');
    // The frame.
    this.fx = 0; this.fz = 0; this.aspect = 16 / 9; this.tan = Math.tan(fairFov(16 / 9) * Math.PI / 360); this.me = null; this.others = EMPTY; this.time = 0;
    this.thX = 0; this.thZ = 0; this.filled = false; this.gatherT = 0; this.gatherAt = 0; this.gatherRat = 0; this.gatherBird = 0; this.flyT = 12; this.hushUntil = 0;
    this.flockN = 0; this.flockX = 0; this.flockZ = 0; this.flockT = 0; this.squeakT = 0; this.lastLandX = 0; this.lastLandZ = 0; this.lastLandT = -99;
    // Sound hooks (agent D): a flock going up, a squeak, a coo.
    this.onFlock = null; this.onSqueak = null; this.onCoo = null;
    this.quality = quality; this.pigeonCount = 0; this.ratCount = 0; this.flyoverCap = 0; this.pileBirdCount = 0; this.pileRatCount = 0;
    this.setQuality(quality);
    this.scatterAll(); // (placed across the map until the first frame gathers them round the camera)
  }

  // --- The seeded stream (a method, so the state lives on the object) ---
  rnd() { this.s = Math.imul(this.s, 1664525) + 1013904223 >>> 0; return this.s / 4294967296; }
  between(range) { return range[0] + this.rnd() * (range[1] - range[0]); }

  setQuality(name) {
    this.quality = LIFE.pigeons[name] === undefined ? 'balanced' : name; const q = this.quality;
    this.pigeonCount = LIFE.pigeons[q]; this.ratCount = LIFE.rats[q]; this.flyoverCap = LIFE.flyovers[q]; this.pileBirdCount = LIFE.pileBirds[q]; this.pileRatCount = Math.min(LIFE.pileRats[q], this.ratCount);
    for (let i = 0; i < this.pigeons.length; i++) {
      const b = this.pigeons[i], want = !b.flyover && i < this.pigeonCount;
      if (want !== b.on) { b.on = want; if (!want) { if (b.st === BIRD.FLY && b.landSpot >= 0) (b.landPerch ? this.usedPerch : this.usedGround)[b.landSpot] = 0; this.releaseBird(b); b.st = BIRD.OFF; } else b.st = BIRD.GROUND; }
      if (b.flyover && b.st !== BIRD.OFF) { b.st = BIRD.OFF; b.on = false; }
    }
    for (let i = 0; i < this.rats.length; i++) {
      const r = this.rats[i], want = i < this.ratCount;
      if (want !== r.on) { r.on = want; if (!want) this.releaseRat(r); }
    }
    this.filled = false;
  }

  // The number of animals alive (pigeons on the ground or up, rats; flyovers in the air).
  counts() {
    let p = 0, f = 0, r = 0;
    for (let i = 0; i < this.pigeons.length; i++) { const b = this.pigeons[i]; if (b.flyover) { if (b.st !== BIRD.OFF) f++; } else if (b.on) p++; }
    for (let i = 0; i < this.rats.length; i++) if (this.rats[i].on) r++;
    return { pigeons: p, flyovers: f, rats: r };
  }

  releaseBird(b) { if (b.spot >= 0) { (b.perched ? this.usedPerch : this.usedGround)[b.spot] = 0; b.spot = -1; } }
  releaseRat(r) { if (r.spot >= 0) { this.usedHome[r.spot] = 0; r.spot = -1; } }

  // --- Where the window is -------------------------------------------------
  // Is (x, z) inside the ground the camera shows, grown by `margin` metres? The
  // outdoor camera as drawn (render/camera-framing.js onScreenOf, which cannot
  // grow a window, only shrink it): OUTDOOR_CAMERA_HEIGHT up, CAMERA_TILT back,
  // fairFov(aspect); at ground level. Numbers come from the frame's fields.
  inWindow(x, z, margin) {
    const dx = x - this.fx, dz = z - this.fz, depth = LOOK - CAMERA_TILT * dz;
    if (depth <= 0) return false;
    return Math.abs(dz) <= depth * this.tan + margin && Math.abs(dx) <= depth / TILT_LENGTH * this.tan * this.aspect + margin;
  }

  // Your player and the others the view draws: is anyone within r of (x, z)?
  // The nearest is left in thX, thZ. Only players the view draws are ever here.
  threat(x, z, r) {
    let best = r * r, hit = false;
    const me = this.me;
    if (me) { const dx = x - me.x, dz = z - me.z, d = dx * dx + dz * dz; if (d < best) { best = d; this.thX = me.x; this.thZ = me.z; hit = true; } }
    const o = this.others;
    for (let i = 0; i < o.length; i++) { const p = o[i], dx = x - p.x, dz = z - p.z, d = dx * dx + dz * dz; if (d < best) { best = d; this.thX = p.x; this.thZ = p.z; hit = true; } }
    return hit;
  }

  // --- Placement -----------------------------------------------------------
  // The very first placement (before any frame): spread over the whole city, so
  // the counts, positions and colliders can be read without a camera.
  scatterAll() {
    for (let i = 0; i < this.pigeons.length; i++) { const b = this.pigeons[i]; if (b.on) this.placeBird(b, -1); }
    for (let i = 0; i < this.rats.length; i++) { const r = this.rats[i]; if (r.on) this.placeRat(r, -1); }
  }

  // Put every animal near the camera (at the start, after a teleport, on a preset change).
  fill() {
    this.usedGround.fill(0); this.usedPerch.fill(0); this.usedHome.fill(0);
    for (let i = 0; i < this.pigeons.length; i++) { const b = this.pigeons[i]; b.spot = -1; b.pile = i < this.pileBirdCount && !b.flyover; if (b.on) this.placeBird(b, b.pile ? 26 : i % 2 ? 4 : 26, b.pile); }
    for (let i = 0; i < this.rats.length; i++) { const r = this.rats[i]; r.spot = -1; if (r.on) this.placeRat(r, i % 2 ? 26 : 3, i < this.pileRatCount); }
    this.filled = true;
  }

  // Send `b` to a random spot. reach > 0: only spots inside the screen grown by that
  // much (and, with bandIn > 0, outside the screen grown by bandIn). pile: round the body pile.
  placeBird(b, reach, pile = false, bandIn = 0) {
    this.releaseBird(b);
    const sp = this.spots;
    b.age = 0; b.sticky = pile; b.act = false; b.pitch = 0; b.beat = 0; b.mode = 0; b.t = .4 + this.rnd() * 2;
    b.coo = this.between(LIFE.coo) * this.rnd();
    if (pile && sp.pileBirds.length) {
      const k = Math.floor(this.rnd() * sp.pileBirds.length / 2) * 2;
      this.settleBird(b, sp.pileBirds[k], sp.pileBirds[k + 1], 0, false, -1);
      return;
    }
    const nGround = sp.ground.length / 2, nPerch = sp.perches.length / 4;
    for (let tries = 0; tries < 90; tries++) {
      const perch = nPerch > 0 && this.rnd() < .22;
      if (perch) {
        const k = Math.floor(this.rnd() * nPerch); if (this.usedPerch[k]) continue;
        const x = sp.perches[k * 4], y = sp.perches[k * 4 + 1], z = sp.perches[k * 4 + 2];
        if (!this.okSpot(x, z, reach, bandIn)) continue;
        this.settleBird(b, x, z, y, true, k, sp.perches[k * 4 + 3]);
        return;
      }
      if (!nGround) break;
      const k = Math.floor(this.rnd() * nGround); if (this.usedGround[k]) continue;
      const x = sp.ground[k * 2], z = sp.ground[k * 2 + 1];
      if (!this.okSpot(x, z, reach, bandIn)) continue;
      // (Pigeons feed together: half the time, only near another.)
      if (tries < 40 && this.rnd() < .5 && !this.nearBird(b, x, z, 4)) continue;
      this.settleBird(b, x, z, 0, false, k);
      return;
    }
    // (No spot in the wanted band: anywhere on the map.)
    if (nGround) { const k = Math.floor(this.rnd() * nGround); this.settleBird(b, sp.ground[k * 2], sp.ground[k * 2 + 1], 0, false, k); }
  }
  okSpot(x, z, reach, bandIn) {
    if (reach < 0) return true;
    if (!this.inWindow(x, z, reach)) return false;
    if (bandIn > 0 && this.inWindow(x, z, bandIn)) return false;
    return !this.threat(x, z, LIFE.keepAway * .6);
  }
  nearBird(self, x, z, r) {
    for (let i = 0; i < this.pigeons.length; i++) { const o = this.pigeons[i]; if (o !== self && o.on && o.st < BIRD.STARTLE && (o.x - x) ** 2 + (o.z - z) ** 2 < r * r) return true; }
    return false;
  }
  settleBird(b, x, z, y, perch, spot, yaw) {
    b.x = x; b.z = z; b.y = y; b.hx = x; b.hz = z; b.perched = perch; b.spot = spot; b.st = perch ? BIRD.PERCH : BIRD.GROUND;
    if (spot >= 0) (perch ? this.usedPerch : this.usedGround)[spot] = 1;
    b.yaw = yaw ?? this.rnd() * TAU; b.pitch = 0; b.mode = 0; b.t = .3 + this.rnd() * 1.8; b.phase = 0; b.beat = 0;
  }

  placeRat(r, reach, pile = false, bandIn = 0) {
    this.releaseRat(r);
    const sp = this.spots, nHome = sp.ratHomes.length / 2;
    r.sticky = pile; r.st = RAT.FORAGE; r.vis = 1; r.hidden = false; r.hide = -1; r.mode = 0; r.t = this.rnd() * 1.5; r.stuck = 0; r.wary = 0;
    if (pile && sp.pileRats.length) {
      const k = Math.floor(this.rnd() * sp.pileRats.length / 2) * 2;
      r.x = r.hx = sp.pileRats[k]; r.z = r.hz = sp.pileRats[k + 1]; r.yaw = this.rnd() * TAU; r.spot = -1; return;
    }
    for (let tries = 0; tries < 90 && nHome; tries++) {
      const k = Math.floor(this.rnd() * nHome); if (this.usedHome[k]) continue;
      const x = sp.ratHomes[k * 2], z = sp.ratHomes[k * 2 + 1];
      if (!this.okSpot(x, z, reach, bandIn)) continue;
      r.x = r.hx = x; r.z = r.hz = z; r.spot = k; this.usedHome[k] = 1; r.yaw = this.rnd() * TAU; return;
    }
    if (nHome) { const k = Math.floor(this.rnd() * nHome); r.x = r.hx = sp.ratHomes[k * 2]; r.z = r.hz = sp.ratHomes[k * 2 + 1]; r.spot = k; this.usedHome[k] = 1; r.yaw = this.rnd() * TAU; }
  }

  // --- The frame -------------------------------------------------------------
  // fx, fz: where the camera looks; aspect: the screen's; me: your player's
  // position; others: every other player the view draws (positions). Nothing
  // is made per call.
  update(dt, fx, fz, aspect, me, others) {
    if (dt > .1) dt = .1; else if (dt < 0) dt = 0;
    const jumped = (fx - this.fx) ** 2 + (fz - this.fz) ** 2 > LIFE.jump * LIFE.jump;
    this.time += dt; this.fx = fx; this.fz = fz; this.aspect = aspect > .2 ? aspect : 16 / 9; this.tan = Math.tan(fairFov(this.aspect) * Math.PI / 360); this.me = me || null; this.others = others || EMPTY;
    if (!this.filled || jumped) this.fill();

    for (let i = 0; i < this.pigeons.length; i++) { const b = this.pigeons[i]; if (b.on || b.st === BIRD.FLY) this.updateBird(b, dt); }
    for (let i = 0; i < this.rats.length; i++) { const r = this.rats[i]; if (r.on) this.updateRat(r, dt); }

    // Animals left behind are moved, unseen, to just outside the window: one a beat.
    this.gatherT -= dt;
    if (this.gatherT <= 0) { this.gatherT = LIFE.gatherEvery; this.gather(); }
    // A few pigeons fly across now and then.
    if (this.flyoverCap > 0) {
      this.flyT -= dt;
      if (this.flyT <= 0) { this.flyT = this.between(LIFE.flyoverEvery); this.launchFlyover(); }
    }
    // One sound event for a flock going up (its birds leave over a few tenths of a second).
    if (this.flockN > 0 && this.time - this.flockT > .3) {
      if (this.onFlock) this.onFlock(this.flockX / this.flockN, this.flockZ / this.flockN, this.flockN);
      this.flockN = 0; this.flockX = 0; this.flockZ = 0;
    }
  }

  gather() {
    // Pigeons and rats take turns; each beat looks at the next animal in line.
    const list = this.gatherAt % 2 === 0, n = list ? this.pigeons.length : this.rats.length, k = list ? this.gatherBird : this.gatherRat;
    this.gatherAt++;
    for (let step = 0; step < n; step++) {
      const i = (k + step) % n;
      if (list) {
        const b = this.pigeons[i];
        if (!b.on || b.st > BIRD.PERCH || this.inWindow(b.x, b.z, LIFE.keep)) continue;
        if (b.pile) {
          // A bird of the body pile: back to it if it has strayed.
          const P = BODY_PILE;
          if ((b.x - (P.x0 + P.x1) / 2) ** 2 + (b.z - (P.z0 + P.z1) / 2) ** 2 < 100) continue;
          this.gatherBird = (i + 1) % n; this.placeBird(b, LIFE.bandOut, true); return;
        }
        if (b.sticky) continue;
        this.gatherBird = (i + 1) % n; this.placeBird(b, LIFE.bandOut, false, LIFE.bandIn); return;
      } else {
        const r = this.rats[i];
        if (!r.on || r.sticky || r.st !== RAT.FORAGE || this.inWindow(r.x, r.z, LIFE.keep)) continue;
        this.gatherRat = (i + 1) % n; this.placeRat(r, LIFE.bandOut, false, LIFE.bandIn); return;
      }
    }
  }

  // --- Events (the hub's world events) ----------------------------------------
  // A round's path this step: pigeons and rats near it go.
  onShot(ax, az, bx, bz) {
    this.hushUntil = this.time + LIFE.hush;
    const dx = bx - ax, dz = bz - az, len2 = dx * dx + dz * dz;
    for (let i = 0; i < this.pigeons.length; i++) {
      const b = this.pigeons[i]; if (!b.on || b.st > BIRD.PERCH) continue;
      const t = len2 ? clamp01(((b.x - ax) * dx + (b.z - az) * dz) / len2) : 0, px = ax + dx * t, pz = az + dz * t;
      if ((b.x - px) ** 2 + (b.z - pz) ** 2 < LIFE.roundLine * LIFE.roundLine) this.startle(b, px, pz, this.rnd() * .18);
    }
    for (let i = 0; i < this.rats.length; i++) {
      const r = this.rats[i]; if (!r.on || r.st === RAT.HIDDEN || r.st === RAT.BOLT) continue;
      const t = len2 ? clamp01(((r.x - ax) * dx + (r.z - az) * dz) / len2) : 0, px = ax + dx * t, pz = az + dz * t;
      if ((r.x - px) ** 2 + (r.z - pz) ** 2 < LIFE.ratRound * LIFE.ratRound) this.bolt(r, px, pz);
    }
  }
  // A round or blast meeting the ground.
  onImpact(x, z, kind) {
    this.hushUntil = this.time + LIFE.hush;
    const blast = kind === 'blast', rp = blast ? LIFE.blast : LIFE.roundImpact, rr = blast ? LIFE.ratBlast : LIFE.ratImpact;
    for (let i = 0; i < this.pigeons.length; i++) { const b = this.pigeons[i]; if (b.on && b.st <= BIRD.PERCH && (b.x - x) ** 2 + (b.z - z) ** 2 < rp * rp) this.startle(b, x, z, this.rnd() * .15); }
    for (let i = 0; i < this.rats.length; i++) { const r = this.rats[i]; if (r.on && (r.st === RAT.FORAGE || r.st === RAT.RETURN) && (r.x - x) ** 2 + (r.z - z) ** 2 < rr * rr) this.bolt(r, x, z); }
  }
  // A body falling.
  onFall(x, z) {
    for (let i = 0; i < this.pigeons.length; i++) { const b = this.pigeons[i]; if (b.on && b.st <= BIRD.PERCH && (b.x - x) ** 2 + (b.z - z) ** 2 < LIFE.fall * LIFE.fall) this.startle(b, x, z, this.rnd() * .2); }
    for (let i = 0; i < this.rats.length; i++) { const r = this.rats[i]; if (r.on && (r.st === RAT.FORAGE || r.st === RAT.RETURN) && (r.x - x) ** 2 + (r.z - z) ** 2 < LIFE.ratFall * LIFE.ratFall) this.bolt(r, x, z); }
  }

  // --- Pigeons ---------------------------------------------------------------
  // Frighten a sitting bird: after `delay` s it goes up, away from (fromX, fromZ).
  startle(b, fromX, fromZ, delay) {
    if (b.st !== BIRD.GROUND && b.st !== BIRD.PERCH) return;
    b.st = BIRD.STARTLE; b.delay = delay; b.ox = b.x; b.oz = b.z; b.oy = b.y; b.operch = b.perched;
    let dx = b.x - fromX, dz = b.z - fromZ; const d = Math.hypot(dx, dz);
    if (d < .05) { const a = this.rnd() * TAU; dx = Math.cos(a); dz = Math.sin(a); } else { dx /= d; dz /= d; }
    b.ax = dx; b.az = dz; b.act = true;
  }

  takeOff(b) {
    this.releaseBird(b);
    b.st = BIRD.FLY; b.phase = CLIMB; b.age = 0; b.t = 0; b.sticky = false;
    b.yaw = Math.atan2(b.ax, b.az) + (this.rnd() - .5) * 1.1; b.speed = 3.2; b.alt = this.between(LIFE.altitude);
    const radius = this.between(LIFE.circleRadius); b.turn = (this.rnd() < .5 ? -1 : 1) * LIFE.cruise[0] / radius; b.turned = 0; b.beat = 1;
    b.pitch = -.35; b.act = true;
    // A flock goes together: neighbours a moment later.
    for (let i = 0; i < this.pigeons.length; i++) {
      const o = this.pigeons[i];
      if (o === b || !o.on || (o.st !== BIRD.GROUND && o.st !== BIRD.PERCH)) continue;
      const d2 = (o.x - b.x) ** 2 + (o.z - b.z) ** 2;
      if (d2 < LIFE.flock * LIFE.flock) this.startle(o, b.ox - b.ax * 2, b.oz - b.az * 2, LIFE.flockDelay[0] + Math.sqrt(d2) * .045 + this.rnd() * (LIFE.flockDelay[1] - LIFE.flockDelay[0]));
    }
    if (this.flockN === 0) this.flockT = this.time;
    this.flockN++; this.flockX += b.x; this.flockZ += b.z; this.flockT = this.time;
  }

  updateBird(b, dt) {
    b.age += dt;
    if (b.st === BIRD.FLY) { this.fly(b, dt); return; }
    b.act = this.inWindow(b.x, b.z, LIFE.active);
    if (!b.act && b.st !== BIRD.STARTLE) return;
    if (b.st === BIRD.STARTLE) {
      b.delay -= dt; b.pitch = -.15 + Math.sin(b.age * 40) * .05;
      if (b.delay <= 0) this.takeOff(b);
      return;
    }
    // Anyone the view draws within reach sends it up (higher perches are further from the feet).
    const reach = b.st === BIRD.PERCH && b.y > LIFE.lowPerch ? LIFE.approachHigh : LIFE.approach;
    if (this.threat(b.x, b.z, reach)) { this.startle(b, this.thX, this.thZ, this.rnd() * .12); return; }
    // A coo now and then (not after gunfire).
    b.coo -= dt;
    if (b.coo <= 0) { b.coo = this.between(LIFE.coo); if (this.onCoo && this.time > this.hushUntil) this.onCoo(b.x, b.z); }
    if (b.st === BIRD.PERCH) { b.t -= dt; if (b.t <= 0) { b.t = 1.5 + this.rnd() * 4; b.yaw += (this.rnd() - .5) * 1.2; } b.pitch *= .9; return; }
    this.walkBird(b, dt);
  }

  // On the ground: pause and look, peck, or walk a few steps (head bobbing).
  walkBird(b, dt) {
    b.t -= dt;
    if (b.mode === 0) {
      b.pitch *= Math.pow(.02, dt); b.yaw += Math.sin(b.age * 1.3 + b.index) * dt * .25;
      if (b.t <= 0) {
        if (this.rnd() < .5) { b.mode = 1; b.dips = Math.round(this.between(LIFE.peck)); b.dipT = 0; }
        else if (this.pickWalk(b)) { b.mode = 2; b.speed = this.between(LIFE.walk); }
        else b.t = this.between(LIFE.pauses);
      }
    } else if (b.mode === 1) {
      // A peck: nose down and back up, about twice a second.
      b.dipT += dt * 5.2; const phase = b.dipT % 1;
      b.pitch = phase < .4 ? Math.sin(phase / .4 * Math.PI) * .95 : 0;
      if (b.dipT >= b.dips) { b.mode = 0; b.t = this.between(LIFE.pauses); }
    } else {
      // Walk: turn to the goal, step, bob.
      const dx = b.tx - b.x, dz = b.tz - b.z, d = Math.hypot(dx, dz);
      if (d < .12) { b.mode = 0; b.t = this.between(LIFE.pauses); return; }
      const want = Math.atan2(dx, dz), turn = angleDiff(b.yaw, want), max = 5 * dt;
      b.yaw += turn > max ? max : turn < -max ? -max : turn;
      if (Math.abs(turn) < .9) {
        const step = Math.min(d, b.speed * dt), nx = b.x + Math.sin(b.yaw) * step, nz = b.z + Math.cos(b.yaw) * step;
        if (this.field.pigeonFree(nx, nz)) { b.x = nx; b.z = nz; } else { b.mode = 0; b.t = this.between(LIFE.pauses); }
      }
      b.bob += dt * 11; b.pitch = Math.sin(b.bob) * .16;
    }
  }
  pickWalk(b) {
    for (let k = 0; k < 6; k++) {
      const a = this.rnd() * TAU, r = .5 + this.rnd() * LIFE.wander, tx = b.hx + Math.cos(a) * r, tz = b.hz + Math.sin(a) * r;
      if (!this.field.pigeonFree(tx, tz)) continue;
      // (The way there, too.)
      let clear = true;
      for (let s = 1; s <= 4 && clear; s++) { const px = b.x + (tx - b.x) * s / 4, pz = b.z + (tz - b.z) * s / 4; if (!this.field.pigeonFree(px, pz)) clear = false; }
      if (clear) { b.tx = tx; b.tz = tz; return true; }
    }
    return false;
  }

  // In the air: climb, circle once, glide to a new place and land (a flyover just crosses).
  fly(b, dt) {
    b.flap += dt * 24; b.beat = 1;
    if (b.phase === CRUISE) {
      // A flyover: straight along its street, a little wander, until it leaves.
      b.x += Math.sin(b.yaw) * b.speed * dt; b.z += Math.cos(b.yaw) * b.speed * dt; b.pitch = Math.sin(b.age * 2.1) * .06 - .04; b.y += Math.sin(b.age * 1.7 + b.index) * .3 * dt;
      b.beat = Math.sin(b.age * 3.1 + b.index) > .55 ? 0 : 1; // now and then a glide
      if ((b.x - b.endX) * Math.sin(b.yaw) + (b.z - b.endZ) * Math.cos(b.yaw) > 0 || b.age > 30) { b.st = BIRD.OFF; b.act = false; }
      b.act = this.inWindow(b.x, b.z, LIFE.active + 20);
      return;
    }
    b.act = true;
    if (b.phase === CLIMB) {
      b.t += dt; b.speed = Math.min(LIFE.cruise[0], b.speed + 10 * dt); b.y += LIFE.climbSpeed * dt; b.pitch = -.45;
      if (b.y >= b.alt * .8 || b.t > 1.4) { b.phase = CIRCLE; b.pitch = -.1; }
    } else if (b.phase === CIRCLE) {
      // (Round it goes, unless the air that way is shut: a street too narrow to circle in is flown along.)
      const next = b.yaw + b.turn * dt;
      if (this.openAhead(b, next) === 2) { b.yaw = next; b.turned += Math.abs(b.turn) * dt; } else b.turned += Math.abs(b.turn) * dt * .35;
      b.speed = LIFE.cruise[0]; b.y += (b.alt - b.y) * Math.min(1, 2 * dt); b.pitch = -.05;
      if (b.turned >= TAU) { this.pickLanding(b); b.phase = GLIDE; }
    } else {
      // Glide: turn toward the landing, come down as it nears.
      const dx = b.tx - b.x, dz = b.tz - b.z, d = Math.hypot(dx, dz);
      if (d < LIFE.landRadius + .1 && Math.abs(b.y - b.ty) < .3 || b.age > (b.act ? 30 : 16)) { this.land(b); return; }
      const want = Math.atan2(dx, dz), turn = angleDiff(b.yaw, want), max = LIFE.turnRate * dt;
      b.yaw += turn > max ? max : turn < -max ? -max : turn;
      b.speed = Math.max(2.2, Math.min(b.speed, LIFE.cruise[0] * (d > 6 ? 1 : .35 + d / 9)));
      let yt = b.ty + (b.alt - b.ty) * clamp01((d - 1.2) / 9);
      // (Stay above the roofs on the way: the descent starts where the way ahead is clear.)
      if (d > 3) { const F = this.field, sx = Math.sin(b.yaw), sz = Math.cos(b.yaw); let roof = Math.max(F.rawTallAt(b.x + sx * 1.5, b.z + sz * 1.5), F.rawTallAt(b.x + sx * 3, b.z + sz * 3), F.rawTallAt(b.x + sx * 4.5, b.z + sz * 4.5)); if (roof > 0 && roof <= LIFE.ceiling) yt = Math.max(yt, roof + .7); }
      b.y += (yt - b.y) * Math.min(1, 3.5 * dt); b.pitch = d < 4 ? .25 : .05;
      if (d < 2.2) { b.flap += dt * 10; }
    }
    // Keep clear of what is taller than the bird (the towers): look ahead, veer.
    if (!(b.phase === GLIDE && (b.tx - b.x) ** 2 + (b.tz - b.z) ** 2 < 16)) this.steer(b, dt);
    // Never into a building: if the step would enter one under its roofline, turn instead.
    const nx = b.x + Math.sin(b.yaw) * b.speed * dt, nz = b.z + Math.cos(b.yaw) * b.speed * dt;
    const landing = b.phase === GLIDE && (b.tx - b.x) ** 2 + (b.tz - b.z) ** 2 < 16;
    if (!landing && this.field.rawTallAt(nx, nz) > Math.min(b.y, LIFE.ceiling) + .05) { b.yaw += (b.turn >= 0 ? 1 : -1) * 2.4 * dt * 3; b.y += 1.5 * dt; return; }
    b.x = nx; b.z = nz;
  }

  // How open is the air ahead if `b` flew on at heading `yaw`? 2: the way and both
  // sides of it are clear of anything at its height; 1: the way ahead is; 0: not.
  openAhead(b, yaw) {
    const F = this.field, look = 1.6 + b.speed * .25, lim = Math.min(b.y, LIFE.ceiling) - .3;
    if (F.tallAt(b.x + Math.sin(yaw) * look, b.z + Math.cos(yaw) * look) >= lim) return 0;
    const l = look * .6;
    return F.tallAt(b.x + Math.sin(yaw + .6) * l, b.z + Math.cos(yaw + .6) * l) < lim && F.tallAt(b.x + Math.sin(yaw - .6) * l, b.z + Math.cos(yaw - .6) * l) < lim ? 2 : 1;
  }

  // Keep clear of what is taller than the bird (the towers): look ahead, veer
  // toward the nearest open heading (a street or alley it can follow).
  steer(b, dt) {
    const here = this.openAhead(b, b.yaw);
    if (here === 2) return;
    const pref = b.turn >= 0 ? 1 : -1;
    let found = -1, foundScore = here;
    for (let k = 1; k <= 6 && foundScore < 2; k++) for (let s = 0; s < 2 && foundScore < 2; s++) {
      const a = b.yaw + (s ? -pref : pref) * k * .42, score = this.openAhead(b, a);
      if (score > foundScore) { foundScore = score; found = a; }
    }
    if (found === -1) { if (here === 0) b.y += 2.5 * dt; return; } // (boxed in: rise)
    const turn = angleDiff(b.yaw, found), max = 5 * dt; b.yaw += turn > max ? max : turn < -max ? -max : turn;
  }

  // Choose where a bird that has circled once lands: far enough from here, away from
  // everyone, preferably on screen, with a clear way there at its flying height.
  pickLanding(b) {
    const sp = this.spots, nGround = sp.ground.length / 2, nPerch = sp.perches.length / 4, together = this.time - this.lastLandT < 3;
    let best = -1, bestPerch = false;
    // A bird of the body pile goes back to it, if nobody is there.
    if (b.pile && this.spots.pileBirds.length && this.rnd() < .65) {
      const k = Math.floor(this.rnd() * this.spots.pileBirds.length / 2) * 2, x = this.spots.pileBirds[k] + (this.rnd() - .5) * .6, z = this.spots.pileBirds[k + 1] + (this.rnd() - .5) * .4;
      if (!this.threat(x, z, LIFE.keepAway) && this.field.pigeonFree(x, z)) { b.tx = x; b.tz = z; b.ty = 0; b.landPerch = false; b.landSpot = -1; b.landYaw = this.rnd() * TAU; this.lastLandT = -99; return; }
    }
    // First a place with a clear way there; failing that, any place well away.
    for (let pass = 0; pass < 2 && best < 0; pass++) for (let tries = 0; tries < 30 && best < 0; tries++) {
      const perch = nPerch > 0 && this.rnd() < .28;
      const k = Math.floor(this.rnd() * (perch ? nPerch : nGround));
      if (perch ? this.usedPerch[k] : this.usedGround[k]) continue;
      const x = perch ? sp.perches[k * 4] : sp.ground[k * 2], z = perch ? sp.perches[k * 4 + 2] : sp.ground[k * 2 + 1];
      const d2 = (x - b.ox) ** 2 + (z - b.oz) ** 2;
      if (d2 < LIFE.settle[0] * LIFE.settle[0] || d2 > LIFE.settle[1] * LIFE.settle[1]) continue;
      if (this.threat(x, z, LIFE.keepAway)) continue;
      // The flock comes down together.
      if (pass === 0 && together && tries < 20 && (x - this.lastLandX) ** 2 + (z - this.lastLandZ) ** 2 > 64) continue;
      if (pass === 0 && !together && tries < 14 && !this.inWindow(x, z, LIFE.active + 8) && this.rnd() < .8) continue;
      if (pass === 0 && !this.pathClear(b.x, b.z, x, z, b.alt, !perch)) continue;
      best = k; bestPerch = perch;
    }
    if (best < 0) {
      // (Nowhere to go: back to where it rose from, on the same perch or ground.)
      b.tx = b.ox; b.tz = b.oz; b.ty = b.oy; b.landPerch = b.operch; b.landSpot = -1; b.landYaw = this.rnd() * TAU; return;
    }
    if (bestPerch) { b.tx = sp.perches[best * 4]; b.ty = sp.perches[best * 4 + 1]; b.tz = sp.perches[best * 4 + 2]; b.landYaw = sp.perches[best * 4 + 3]; this.usedPerch[best] = 1; }
    else { b.tx = sp.ground[best * 2]; b.ty = 0; b.tz = sp.ground[best * 2 + 1]; b.landYaw = this.rnd() * TAU; this.usedGround[best] = 1; }
    b.landPerch = bestPerch; b.landSpot = best; this.lastLandX = b.tx; this.lastLandZ = b.tz; this.lastLandT = this.time;
  }

  // Is the way from (x0, z0) to (x1, z1) at height `alt` clear of buildings? The
  // last few metres are checked at the height of a bird coming down to a landing
  // (`low`: to the ground; not for a roof edge, which is reached over the roof).
  pathClear(x0, z0, x1, z1, alt, low = true) {
    const dx = x1 - x0, dz = z1 - z0, d = Math.hypot(dx, dz), steps = Math.floor(d / 1.2);
    for (let i = 2; i < steps; i++) {
      const t = i / steps, left = d * (1 - t), x = x0 + dx * t, z = z0 + dz * t;
      if (left < 3.6 && !low) continue;
      if (this.field.tallAt(x, z) >= (left < 6 && low ? 1 : alt - .5) && left > 1.6) return false;
    }
    return true;
  }

  land(b) {
    b.st = b.landPerch ? BIRD.PERCH : BIRD.GROUND; b.perched = b.landPerch; b.spot = b.landSpot; b.x = b.tx; b.z = b.tz; b.y = b.ty; b.hx = b.tx; b.hz = b.tz;
    b.pitch = 0; b.beat = 0; b.mode = 0; b.t = .6 + this.rnd() * 1.5; b.coo = this.between(LIFE.coo) * .5; b.age = 0; b.sticky = false;
    b.yaw = b.landYaw;
  }

  // A pigeon crossing the sky along a street near the camera.
  launchFlyover() {
    let slot = null, active = 0;
    for (let i = MAX_PIGEONS; i < this.pigeons.length; i++) { const b = this.pigeons[i]; if (b.st !== BIRD.OFF) active++; else if (!slot) slot = b; }
    if (!slot || active >= this.flyoverCap) return;
    // A street with the camera near it.
    const n = this.roads.length, first = Math.floor(this.rnd() * n);
    for (let k = 0; k < n; k++) {
      const r = this.roads[(first + k) % n], along = r.axis === 'x' ? this.fx : this.fz, across = r.axis === 'x' ? this.fz : this.fx;
      if (Math.abs(across - r.centre) > 16 || along < r.from - 10 || along > r.to + 10) continue;
      const dir = this.rnd() < .5 ? 1 : -1, lane = r.centre + (this.rnd() - .5) * r.width * .6, reach = LIFE.flyoverReach;
      const a0 = Math.max(r.from + 1, Math.min(r.to - 1, along - dir * reach)), a1 = Math.max(r.from + 1, Math.min(r.to - 1, along + dir * reach));
      if (Math.abs(a1 - a0) < 20) continue;
      slot.st = BIRD.FLY; slot.on = false; slot.phase = CRUISE; slot.age = 0; slot.beat = 1; slot.act = true; slot.perched = false; slot.spot = -1;
      slot.speed = LIFE.flyoverSpeed * (.9 + this.rnd() * .2); slot.y = this.between(LIFE.flyoverHeight); slot.pitch = 0;
      if (r.axis === 'x') { slot.x = a0; slot.z = lane; slot.yaw = dir > 0 ? Math.PI / 2 : -Math.PI / 2; slot.endX = a1; slot.endZ = lane; }
      else { slot.x = lane; slot.z = a0; slot.yaw = dir > 0 ? 0 : Math.PI; slot.endX = lane; slot.endZ = a1; }
      return;
    }
  }

  // --- Rats -------------------------------------------------------------------
  // Send a rat for cover from (fromX, fromZ): the nearest drain or dumpster side
  // that is not toward the danger.
  bolt(r, fromX, fromZ) {
    if (r.st === RAT.HIDDEN || r.st === RAT.BOLT) return;
    const h = this.spots.hides, n = h.length / 3;
    let best = -1, bestScore = 1e9;
    for (let i = 0; i < n; i++) {
      const dx = h[i * 3] - r.x, dz = h[i * 3 + 1] - r.z, d = Math.hypot(dx, dz);
      if (d > LIFE.ratHideNear) continue;
      // (Not toward what frightened it: its own distance to the danger must not shrink much.)
      const toDanger = Math.hypot(h[i * 3] - fromX, h[i * 3 + 1] - fromZ), here = Math.hypot(r.x - fromX, r.z - fromZ);
      if (toDanger < 1.2 || toDanger < here - 2.5 || !this.lineFree(r.x, r.z, h[i * 3], h[i * 3 + 1])) continue;
      const score = d + (toDanger < here ? 3 : 0);
      if (score < bestScore) { bestScore = score; best = i; }
    }
    r.st = RAT.BOLT; r.t = 0; r.stuck = 0; r.act = true;
    if (best >= 0) { r.hide = best; r.tx = h[best * 3]; r.tz = h[best * 3 + 1]; }
    else {
      // No cover near: run off from it.
      r.hide = -1; let dx = r.x - fromX, dz = r.z - fromZ; const d = Math.hypot(dx, dz) || 1; dx /= d; dz /= d;
      let len = 6; while (len > 1 && !this.field.ratFree(r.x + dx * len, r.z + dz * len)) len -= 1;
      r.tx = r.x + dx * len; r.tz = r.z + dz * len;
    }
    if (this.onSqueak && this.time - this.squeakT > .25) { this.squeakT = this.time; this.onSqueak(r.x, r.z); }
  }

  // Can a rat run straight from (x0, z0) to (x1, z1)? (Its last metre is the hole itself.)
  lineFree(x0, z0, x1, z1) {
    const dx = x1 - x0, dz = z1 - z0, d = Math.hypot(dx, dz), steps = Math.floor(d / .3);
    for (let i = 1; i < steps; i++) { const t = i / steps; if (d * (1 - t) > .9 && !this.field.ratFree(x0 + dx * t, z0 + dz * t)) return false; }
    return true;
  }

  updateRat(r, dt) {
    r.age += dt;
    if (r.st === RAT.HIDDEN) {
      r.act = false; r.t -= dt;
      if (r.t <= 0) {
        // Out again once nobody the view draws is near.
        if (this.threat(r.x, r.z, LIFE.ratWary)) r.t = 1.5;
        else { r.st = RAT.RETURN; r.hidden = false; r.vis = 0; r.tx = r.hx; r.tz = r.hz; r.wary = 3; }
      }
      return;
    }
    r.act = this.inWindow(r.x, r.z, LIFE.active);
    if (!r.act && r.st === RAT.FORAGE) return;
    if (r.st === RAT.BOLT) { this.runRat(r, dt); return; }
    if (r.vis < 1) r.vis = Math.min(1, r.vis + dt / LIFE.ratShrink);
    // Anyone the view draws within ~4 m.
    if (this.threat(r.x, r.z, LIFE.ratBolt)) { this.bolt(r, this.thX, this.thZ); return; }
    if (r.st === RAT.RETURN) {
      if (this.stepRat(r, dt, LIFE.ratCreep[1], false) || (r.x - r.tx) ** 2 + (r.z - r.tz) ** 2 < .1) { r.st = RAT.FORAGE; r.mode = 0; r.t = this.between(LIFE.ratPause); }
      return;
    }
    // Forage: sniff, then creep or dart a little way along the wall.
    r.t -= dt;
    if (r.mode === 0) {
      r.yaw += Math.sin(r.age * 2.3 + r.index) * dt * .8;
      if (r.t <= 0) {
        if (!r.sticky && this.rnd() < LIFE.ratMove && this.moveHouse(r)) { r.mode = 1; r.speed = this.between(LIFE.ratDash); }
        else if (this.pickRatWalk(r)) { r.mode = 1; r.speed = this.rnd() < .35 ? this.between(LIFE.ratDash) : this.between(LIFE.ratCreep); }
        else r.t = this.between(LIFE.ratPause);
      }
    } else if (this.stepRat(r, dt, r.speed, false) || (r.x - r.tx) ** 2 + (r.z - r.tz) ** 2 < .04) { r.mode = 0; r.t = this.between(LIFE.ratPause) * (r.wary > 0 ? .6 : 1); }
    if (r.wary > 0) r.wary -= dt;
  }

  pickRatWalk(r) {
    for (let k = 0; k < 6; k++) {
      const a = this.rnd() * TAU, d = .4 + this.rnd() * LIFE.ratWander, tx = r.hx + Math.cos(a) * d, tz = r.hz + Math.sin(a) * d;
      if (!this.field.ratFree(tx, tz)) continue;
      let clear = true;
      for (let s = 1; s <= 5 && clear; s++) { const px = r.x + (tx - r.x) * s / 5, pz = r.z + (tz - r.z) * s / 5; if (!this.field.ratFree(px, pz)) clear = false; }
      if (clear) { r.tx = tx; r.tz = tz; return true; }
    }
    return false;
  }
  // Move house: to another rat home not far off (between dumpsters and corners).
  moveHouse(r) {
    const h = this.spots.ratHomes, n = h.length / 2;
    for (let k = 0; k < 12 && n; k++) {
      const i = Math.floor(this.rnd() * n), d2 = (h[i * 2] - r.x) ** 2 + (h[i * 2 + 1] - r.z) ** 2;
      if (d2 < 4 || d2 > 100 || this.usedHome[i]) continue;
      if (!this.field.ratFree(h[i * 2], h[i * 2 + 1])) continue;
      this.releaseRat(r); r.spot = i; this.usedHome[i] = 1; r.hx = r.tx = h[i * 2]; r.hz = r.tz = h[i * 2 + 1]; return true;
    }
    return false;
  }

  // One step toward (tx, tz) at `speed`, sliding round what is in the way.
  // Returns true when stuck for good. `enter`: may end in blocked ground (the hide).
  stepRat(r, dt, speed, enter) {
    const dx = r.tx - r.x, dz = r.tz - r.z, d = Math.hypot(dx, dz);
    if (d < .02) return false;
    const want = Math.atan2(dx, dz), turn = angleDiff(r.yaw, want), max = 14 * dt;
    r.yaw += turn > max ? max : turn < -max ? -max : turn;
    r.gait += dt * (6 + speed * 3);
    if (Math.abs(turn) > 1.2) return false;
    const step = Math.min(d, speed * dt);
    // Try straight on, then a little either side.
    for (let k = 0; k < 5; k++) {
      const a = r.yaw + (k === 0 ? 0 : (k % 2 ? 1 : -1) * Math.ceil(k / 2) * .55), nx = r.x + Math.sin(a) * step, nz = r.z + Math.cos(a) * step;
      if ((enter && d < .9) || this.field.ratFree(nx, nz)) { r.x = nx; r.z = nz; r.stuck = 0; return false; }
    }
    r.stuck += dt;
    return r.stuck > .6;
  }

  runRat(r, dt) {
    r.t += dt;
    const cover = r.hide >= 0, stuck = this.stepRat(r, dt, LIFE.ratRun, cover), d2 = (r.x - r.tx) ** 2 + (r.z - r.tz) ** 2;
    if (cover && d2 < .36) r.vis = Math.sqrt(d2) / .6; // (it goes into the drain, under the dumpster)
    if (d2 < .09 || stuck || r.t > 3) {
      if (cover) { r.st = RAT.HIDDEN; r.hidden = true; r.vis = 0; r.t = this.between(LIFE.ratHide); }
      else { r.st = RAT.FORAGE; r.mode = 0; r.t = .8 + this.rnd(); r.wary = 4; }
    }
  }
}

const EMPTY = Object.freeze([]);
