// Lumen's vehicles, the data side (stage 4): which car is which, what its
// lights are doing, the lit panels the signs system draws for them and the
// light they throw on the wet road. Pure data and maths (no three.js): the
// models (world/lumen-vehicles.js), the wreck scenes (effects/lumen-wrecks.js)
// and the tests all read the same numbers from here, so a car's head bar, its
// glow on the road and the sound that goes with it never drift apart.
//
// Design 6, 7 and 12: "two or three abandoned cars mid-lane, doors open,
// headlights on, hazards blinking, one alarm looping; headlight cones on the
// wet road". Most cars are simply dead (dark glass, no light): a city that
// emptied in a hurry keeps a few engines running. The sound scene
// (lumen-ambience.js LUMEN_SITES) finds its alarm car, its hazard cars and
// its crackling EV as the nearest car to a spot; the same rule here lights
// those same cars, so the tick, the alarm and the sparks come from a car that
// looks the part.
//
// Colours: head bars cold white, tails red, hazards lemon #fcee0a (traffic
// yellow, never Amber), the smouldering car's glow a red-orange far from
// Amber; the EV's arcs white-lemon. None near Amber #ffb020, Cyan #2ee6ff or
// Violet #b77bff (tests/lumen-vehicles.test.js measures them).
import { LUMEN_PROPS } from './lumen-cover.js';
import { LUMEN_BUILDINGS_EAST } from './lumen-buildings-east.js';

export const VEHICLE_TYPES = Object.freeze(['cityCompact', 'citySedan', 'citySuv', 'cityTaxi', 'citySports', 'cityVan', 'cityTruck', 'cityWreck', 'cityPileup', 'cityMotorbike']);
// The whole cars (with an intact body, lights and doors), by type.
export const INTACT_CARS = Object.freeze(['cityCompact', 'citySedan', 'citySuv', 'cityTaxi', 'citySports', 'cityVan', 'cityTruck']);
const PROP_CAR = /^city(Compact|Sedan|Suv|Taxi|Sports|Van|Truck|Wreck|Pileup)$/; // (as lumen-ambience.js: what the sound scene may pick)

// Each intact car's proportions, metres, in the prop's local frame (x along
// the car, nose at +x, y up, z across; the centre of the footprint at the
// origin). L, W, H are the collision box (world/lumen-props.js): the model
// fills them and keeps inside them.
//   clear    ground clearance under the body
//   belt     the beltline (the top of the lower body, the bottom of the glass)
//   noseH    the height of the hood's front edge; tailH the same at the tail
//   cabin    [x of the cabin base at the rear, at the front]
//   roof     [x of the roof's rear edge, its front edge] (the cabin tapers)
//   inset    how far each side of the glass leans in from the body's side to the roof
//   wheelR   wheel radius;  axles [front x, rear x]
//   head / tail  the light bars: height of their middle and half their width
export const CAR_RIG = Object.freeze({
  cityCompact: { L: 3.6, W: 1.7, H: 1.4, clear: .2, belt: .74, noseH: .62, tailH: .82, cabin: [-1.55, .6], roof: [-1.4, .05], inset: .24, wheelR: .29, axles: [1.15, -1.1], head: { y: .58, half: .5 }, tail: { y: .8, half: .55 } },
  citySedan: { L: 4.6, W: 1.9, H: 1.4, clear: .2, belt: .7, noseH: .56, tailH: .76, cabin: [-1.5, .85], roof: [-1.05, .2], inset: .28, wheelR: .34, axles: [1.5, -1.4], head: { y: .5, half: .62 }, tail: { y: .7, half: .7 } },
  citySuv: { L: 4.9, W: 2, H: 1.7, clear: .3, belt: .98, noseH: .9, tailH: 1, cabin: [-2.25, 1.05], roof: [-2.15, .8], inset: .16, wheelR: .43, axles: [1.62, -1.55], head: { y: .8, half: .7 }, tail: { y: .94, half: .78 } },
  cityTaxi: { L: 4.5, W: 1.9, H: 1.4, clear: .2, belt: .68, noseH: .56, tailH: .72, cabin: [-1.4, .8], roof: [-1.15, .3], inset: .26, wheelR: .33, axles: [1.45, -1.35], head: { y: .5, half: .62 }, tail: { y: .66, half: .7 } },
  citySports: { L: 4.4, W: 2, H: 1.2, clear: .14, belt: .5, noseH: .4, tailH: .62, cabin: [-1, .55], roof: [-.6, 0], inset: .36, wheelR: .35, axles: [1.4, -1.3], head: { y: .36, half: .7 }, tail: { y: .56, half: .82 } },
  cityVan: { L: 5.2, W: 2.1, H: 2.3, clear: .3, belt: 1.05, noseH: .96, tailH: 1.2, cabin: [.8, 2], roof: [.8, 1.38], inset: .2, wheelR: .38, axles: [1.78, -1.7], head: { y: .76, half: .78 }, tail: { y: 1.1, half: .86 } },
  cityTruck: { L: 7.4, W: 2.5, H: 3.1, clear: .45, belt: 1.35, noseH: 1.3, tailH: 1.3, cabin: [1.05, 3.7], roof: [1.05, 3.2], inset: .2, wheelR: .5, axles: [2.6, -1.95], head: { y: .95, half: .95 }, tail: { y: 1.25, half: 1.05 } },
});

// The scenes that need a particular car or a particular spot (metres, world).
// Sound sites (lumen-ambience.js LUMEN_SITES) are found the same way.
export const VEHICLE_SCENES = Object.freeze({
  alarm: Object.freeze({ near: [-36, 4], type: 'citySedan' }),               // the looping alarm: the sedan nearest here
  hazards: Object.freeze([[12, 9.5], [-11, -1], [40.7, 34.7]]),              // the abandoned cars with hazards, doors open, headlights on
  ev: Object.freeze({ near: [-15.6, 39.6], type: 'cityCompact' }),           // the crackling EV in the charging lot
  shopfront: Object.freeze({ x: -22.9, z: 8.15 }),                           // the sedan nosed through the laundromat's glass front (maps/lumen-cover.js SHOPFRONT_CAR)
  pileup: Object.freeze({ x: 27.2, z: -4 }),                                 // the Boulevard pileup
  cable: Object.freeze({ x: -30.35, z: 29.75 }),                             // the fallen signal pole, the downed cable beside it
});

// The pileup's three cars (local frame of the prop; the boxes of
// world/lumen-props.js cityPileup): [x, z, length along x, width along z, nose direction]
// for a car lying east-west, and the smouldering middle one lying north-south
// (nose to the north, -z). `smoulder`: [x, y, z] of the glow on its west side;
// `hood`: [x, y, z] the smoke and embers rise from.
export const PILEUP = Object.freeze({
  cars: Object.freeze([{ x: -.7, z: -2.35, w: 4, d: 1.9, nose: 1 }, { x: 1.85, z: .45, w: 1.9, d: 4.4, nose: -1, smoulders: true }, { x: -.85, z: 2.35, w: 3.9, d: 1.9, nose: -1 }]),
  smoulder: Object.freeze([.9, .78, -.85]),
  hood: Object.freeze([1.85, 1.05, -1.0]),
});

export const VEHICLE_LIGHTS = Object.freeze({
  head: '#e6f0ff', tail: '#ff3040', hazard: '#fcee0a', smoulder: '#ff4a1c', arc: '#fff2b0',
  // (2026-09-30, owner: the headlight and hazard blobs "not so bright and
  // contrasty": the lamps a third dimmer, their painted cones and blinking
  // pool cards smaller and fainter; render/city-signs.js POOLS.)
  headStrength: 1.05, tailDim: .32, tailOn: .9, hazardStrength: 1.05,
  // Most cars are dead. A few run their lights; the numbers are caps (the
  // seeded shuffle picks who), so the emitters and panels stay few.
  headMax: 9, hazardMax: 6, tailShare: .32, doorShare: .16,
  hazardSeed: .1,     // the blink mode's period is .9 + 1.2 x seed: 1 Hz, the sound's tick
  pool: Object.freeze({ ahead: 2.7, rx: 2.9, rz: 1.2, strength: .45 }), // a headlight cone painted on the road (was 3.6 x 1.5 at .8)
});

// A stable 32-bit hash of a string or numbers, then 0..1.
export function hash01(...values) {
  let h = 2166136261 >>> 0;
  for (const v of values) { const s = String(v); for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0; h = Math.imul(h ^ 0x9e37, 0x85ebca6b) >>> 0; }
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d) >>> 0; h ^= h >>> 12; h = Math.imul(h, 0x297a2d39) >>> 0; h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}
// A seeded stream of numbers 0..1 (the same on every engine).
export function stream(seed) { let s = Math.floor(seed * 4294967296) >>> 0 || 1; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }

export const vehicleKey = p => `${Math.round(p.x * 100)},${Math.round(p.z * 100)}`;
const round = (v, k = 100) => Math.round(v * k) / k;

// Every vehicle's state, by vehicleKey: { type, x, z, angle, seed, head, hazard, alarm, tail (0 off, 1 dim, 2 on), doors, scene }.
// Computed from the whole list once (the scenes name their car by position).
const CACHE = new WeakMap();
export function vehicleStates(props = LUMEN_PROPS) {
  let states = CACHE.get(props);
  if (states) return states;
  states = new Map();
  const cars = [];
  for (const p of props) {
    if (!VEHICLE_TYPES.includes(p.type)) continue;
    const s = { type: p.type, x: p.x, z: p.z, angle: p.angle || 0, seed: hash01('lumen-car', vehicleKey(p)), head: false, hazard: false, alarm: false, tail: 0, doors: false, scene: null };
    states.set(vehicleKey(p), s);
    if (INTACT_CARS.includes(p.type) || p.type === 'cityWreck' || p.type === 'cityPileup') cars.push(s);
  }
  const nearest = (list, [x, z]) => { let best = null, bd = Infinity; for (const c of list) { const d = Math.hypot(c.x - x, c.z - z); if (d < bd) { bd = d; best = c; } } return best; };
  const sound = cars.filter(c => PROP_CAR.test(c.type));
  // The sound scene's cars: the alarm, the hazards, the EV.
  const alarm = nearest(sound.filter(c => c.type === VEHICLE_SCENES.alarm.type), VEHICLE_SCENES.alarm.near) || nearest(sound, VEHICLE_SCENES.alarm.near);
  if (alarm) { alarm.alarm = alarm.head = alarm.hazard = true; alarm.tail = 2; alarm.scene = 'alarm'; alarm.doors = true; }
  for (const spot of VEHICLE_SCENES.hazards) {
    const c = nearest(sound, spot);
    if (c && INTACT_CARS.includes(c.type)) { c.hazard = c.head = c.doors = true; c.tail = 2; c.scene ||= 'hazard'; }
  }
  const ev = nearest(sound.filter(c => c.type === VEHICLE_SCENES.ev.type), VEHICLE_SCENES.ev.near);
  if (ev) { ev.scene = 'ev'; ev.head = false; ev.tail = 0; ev.doors = false; }
  for (const c of cars) {
    if (c.type === 'cityPileup') c.scene = 'pileup';
    if (Math.hypot(c.x - VEHICLE_SCENES.shopfront.x, c.z - VEHICLE_SCENES.shopfront.z) < .3 && c.type === 'citySedan') c.scene = 'shopfront';
  }
  // The rest: a seeded few run their lights, a third have dim tails, some
  // stand with a door open (the model checks the door is clear of a
  // sidewalk and may decline).
  const free = cars.filter(c => INTACT_CARS.includes(c.type) && !c.scene).sort((a, b) => a.seed - b.seed);
  const V = VEHICLE_LIGHTS;
  let heads = [...states.values()].filter(c => c.head).length, hazards = [...states.values()].filter(c => c.hazard).length;
  for (const c of free) {
    if (heads < V.headMax && hash01('head', c.seed) < .4) { c.head = true; heads++; c.tail = 2; }
    else if (hazards < V.hazardMax && hash01('haz', c.seed) < .2) { c.hazard = true; hazards++; c.tail = 2; }
    else if (hash01('tail', c.seed) < V.tailShare) c.tail = 1;
    c.doors = c.doors || hash01('door', c.seed) < V.doorShare;
  }
  CACHE.set(props, states);
  return states;
}
export const stateOf = (p, props) => vehicleStates(props).get(vehicleKey(p)) || null;

// --- The lit panels (render/city-signs.js addList format) ----------------------
// World point and heading of a local point on car `s`.
function toWorld(s, lx, ly, lz) {
  const c = Math.cos(s.angle), n = Math.sin(s.angle);
  return [round(s.x + lx * c + lz * n), round(ly), round(s.z - lx * n + lz * c)];
}
// A panel's `facing`: the world direction (dx, dz) as the signs system wants it (sin f, cos f).
const facingOf = (s, dir) => round(Math.atan2(dir * Math.cos(s.angle), dir * -Math.sin(s.angle)), 1000);

// The lit parts of one car as list entries: the head bar (a steady panel on
// the hood's leading edge, leaning back like the nose; an emitter, so the
// light pool and the halo cards find it), the tail bar (dim or on), four
// hazard lamps (lemon, blinking, in phase; emitters on two corners), and the
// smouldering car's hood glow. `breakable: false`: cars' lamps are not signs.
export function carLightEntries(s, emit) {
  const rig = CAR_RIG[s.type];
  if (!rig) return;
  const V = VEHICLE_LIGHTS, half = rig.W / 2 - .1;
  const front = facingOf(s, 1), back = facingOf(s, -1), id = vehicleKey(s);
  if (s.head) {
    const alarm = s.alarm;
    emit({ kind: 'panel', id: `car-head:${id}`, area: 'vehicles', at: toWorld(s, rig.L / 2 + .02, rig.head.y, 0), facing: front, tilt: 32, w: rig.head.half * 2, h: .1, depth: .05, colour: 'coldWhite', intensity: V.headStrength,
      mode: alarm ? 'blink' : 'steady', seed: alarm ? V.hazardSeed : undefined, emitter: true, breakable: false });
  }
  if (s.tail) {
    emit({ kind: 'panel', id: `car-tail:${id}`, area: 'vehicles', at: toWorld(s, -rig.L / 2 - .02, rig.tail.y, 0), facing: back, tilt: 30, w: rig.tail.half * 2, h: .08, depth: .05, colour: 'red', intensity: s.tail === 2 ? V.tailOn : V.tailDim, mode: 'steady', emitter: false, breakable: false });
  }
  if (s.hazard) {
    const seed = round(V.hazardSeed + (hash01('hz', s.seed) - .5) * .04, 1000);
    for (const [end, dir, y] of [[1, 1, rig.noseH - .1], [-1, -1, rig.tailH - .1]]) for (const side of [-1, 1]) {
      // (an emitter on the front-left and rear-right lamps: two pools a car, not four)
      const emitter = (end === 1) === (side === -1);
      emit({ kind: 'panel', id: `car-hazard:${id}:${end}:${side}`, area: 'vehicles', at: toWorld(s, end * (rig.L / 2 + .02), y, side * (half - .16)), facing: dir > 0 ? front : back, tilt: 28, w: .24, h: .11, depth: .05, colour: 'lemon', intensity: V.hazardStrength, mode: 'blink', seed, emitter, breakable: false });
    }
  }
}

// The scene lights beside the cars: the smouldering car's hood glow, the EV's
// sparking sills. (Flickering panels: their pool cards are the light on the
// wet road.) Positions are the prop's local frame.
export function sceneLightEntries(s, emit) {
  const V = VEHICLE_LIGHTS, id = vehicleKey(s);
  if (s.type === 'cityPileup') {
    // The middle car, the one lying north-south with its nose to the north,
    // smoulders; its glow shows through the crushed hood's seam toward the
    // open west pocket (the panel faces west, on the car's west side).
    const world = toWorld(s, PILEUP.smoulder[0] - .04, PILEUP.smoulder[1], PILEUP.smoulder[2]);
    emit({ kind: 'panel', id: `wreck-glow:${id}`, area: 'vehicles', at: world, facing: round(Math.atan2(-1, 0), 1000), tilt: 12, w: 1.3, h: .22, depth: .05, colour: V.smoulder, intensity: 1.15, mode: 'flicker', seed: .27, emitter: true, breakable: false });
  }
  if (s.scene === 'ev') {
    for (const side of [-1, 1]) {
      // (A local +z side faces world (sin a, cos a).)
      emit({ kind: 'panel', id: `ev-sill:${id}:${side}`, area: 'vehicles', at: toWorld(s, 0, .26, side * .82), facing: round(Math.atan2(side * Math.sin(s.angle), side * Math.cos(s.angle)), 1000), tilt: 0, w: 1.7, h: .06, depth: .04,
        colour: V.arc, intensity: 1.5, mode: 'flicker', seed: side < 0 ? .41 : .68, emitter: true, breakable: false });
    }
  }
}

// --- The bus and the downed cable -------------------------------------------------
// The bus is a building: one quad room (maps/lumen-buildings-east.js). Its frame
// here: the centre, the unit vector along it (u, toward the nose: east), across it
// (v, toward the kerb side and the doors: south), half its length and width to the
// footprint's edge; the shell's wall stands centred on that edge, so its outer
// face is `wall` (half the 0.38 m wall) further out.
export const BUS = (() => {
  const spec = LUMEN_BUILDINGS_EAST.find(b => b.id === 'bus'), q = spec.rooms[0].quad;
  const cx = (q[0][0] + q[1][0] + q[2][0] + q[3][0]) / 4, cz = (q[0][1] + q[1][1] + q[2][1] + q[3][1]) / 4;
  const len = Math.hypot(q[1][0] - q[0][0], q[1][1] - q[0][1]), ux = (q[1][0] - q[0][0]) / len, uz = (q[1][1] - q[0][1]) / len;
  const wid = Math.hypot(q[2][0] - q[1][0], q[2][1] - q[1][1]);
  const doors = spec.doors.map(d => ({ x: (d.at[0] - cx) * ux + (d.at[1] - cz) * uz, width: d.width ?? 1.6 }));
  return Object.freeze({ cx, cz, ux, uz, vx: -uz, vz: ux, hl: len / 2, hw: wid / 2, wall: .19, height: spec.height, doors: Object.freeze(doors) });
})();
// A point of the bus's own frame (along, up, across) in the world.
export const busPoint = (x, y, z) => [BUS.cx + BUS.ux * x + BUS.vx * z, y, BUS.cz + BUS.uz * x + BUS.vz * z];

// The bus's interior light: window panels on both flanks that stutter together
// (the sign system's flicker: at most two and a half flashes a second), the
// nearest window on each flank an emitter.
export function busLightEntries(emit) {
  const outer = BUS.hw + BUS.wall + .035, seed = .63;
  const windows = [-5.2, -3.7, 1.3, 2.7];
  for (const side of [1, -1]) windows.forEach((x, i) => {
    const facing = round(Math.atan2(side * BUS.vx, side * BUS.vz), 1000);
    emit({ kind: 'panel', id: `bus-window:${side}:${i}`, area: 'boulevard', at: busPoint(x, 1.75, side * outer).map(v => round(v)), facing, tilt: 0, w: 1.2, h: .82, depth: .04, colour: 'warmWhite', intensity: .55, mode: 'flicker', seed, emitter: i === 3, breakable: false }); // (.85 -> .55: the darker night, 2026-09-30)
  });
}

// The downed cable: from the top of the fallen signal pole's stump (the
// cityFallenPole prop, world/lumen-props.js: a stump at its local -3.6 m) it
// drops to the road and snakes across West Street to a cut end that sparks.
// Points [x, y, z], metres; `end` is the spark.
export function cableRoute(props = LUMEN_PROPS) {
  const pole = props.find(p => p.type === 'cityFallenPole') || { x: VEHICLE_SCENES.cable.x, z: VEHICLE_SCENES.cable.z, angle: -.785 };
  const a = pole.angle || 0, c = Math.cos(a), n = Math.sin(a);
  const stump = [pole.x - 3.6 * c, pole.z + 3.6 * n];
  const points = [[stump[0] + .1, 1.4, stump[1] - .05]];
  const N = 12, reach = [5.6, 1.5];
  for (let i = 1; i <= N; i++) {
    const t = i / N, y = i < 3 ? 1.4 * (1 - i / 3) * (1 - i / 3) + .06 : .06;
    points.push([round(stump[0] + reach[0] * t + Math.sin(t * 9) * .18), round(y), round(stump[1] + reach[1] * t + Math.sin(t * 6.5 + 1) * .3)]);
  }
  points[0] = points[0].map(v => round(v));
  return { points, end: points[points.length - 1] };
}
export function cableLightEntries(emit, props = LUMEN_PROPS) {
  const { end } = cableRoute(props);
  emit({ kind: 'panel', id: 'cable-glow', area: 'vehicles', at: [end[0], .09, end[2]], facing: 0, tilt: 90, w: .7, h: .7, depth: .03, colour: VEHICLE_LIGHTS.arc, intensity: 1.3, mode: 'flicker', seed: .53, emitter: true, breakable: false });
}

// The whole vehicle light list. `props` is the map's prop list (LUMEN_PROPS).
export function lumenVehicleLights(props = LUMEN_PROPS) {
  const out = [];
  const states = vehicleStates(props);
  for (const s of states.values()) { carLightEntries(s, e => out.push(e)); sceneLightEntries(s, e => out.push(e)); }
  busLightEntries(e => out.push(e));
  cableLightEntries(e => out.push(e), props);
  return out;
}

// Headlight cones on the wet road, painted into the ground like the lamps'
// pools (maps/lumen-signs.js lumenLightPools: { x, z, rx, rz, angle, tone,
// strength }). A steady light gets no pool card from the signs system (only
// changing ones do), so the cone is painted. The alarm car's flash is a card.
export function lumenVehiclePools(props = LUMEN_PROPS) {
  const pools = [], P = VEHICLE_LIGHTS.pool;
  for (const s of vehicleStates(props).values()) {
    const rig = CAR_RIG[s.type];
    if (!rig || !s.head || s.alarm) continue;
    const ahead = rig.L / 2 + P.ahead, c = Math.cos(s.angle), n = Math.sin(s.angle);
    pools.push({ x: round(s.x + c * ahead), z: round(s.z - n * ahead), rx: P.rx, rz: P.rz, angle: round(-s.angle, 1000) || 0, tone: 'white', strength: P.strength });
  }
  return pools;
}
