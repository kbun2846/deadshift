// The life left running in Lumen's interiors (stage 5; design 5 and 6): what
// the machines and the stoves are still doing with nobody there.
//   steam     pots and steamer stacks steaming (the noodle bar's range, the
//             dumpling shop's baskets, the Stacks' hot plate, the laundromat's
//             back room, the hotel kitchen)
//   fog       the market's walk-in cold room, its door run back, cold fog
//             spilling low across the floor
//   screens   TVs of static (the Stacks, the pawn shop, a VR booth, a dead
//             cabinet), the arcade's cabinets in attract mode
//   machines  the pachinko rows flashing (balls running down the playfields,
//             a fever burst now and then, the lamp headers chasing), the
//             server racks' lights blinking, the metro's and the tower's gates
//             blinking red and green
//   the club  the dance floor's tiles pulsing on the beat the soundscape plays
//             (the same clock: CLUB.bpm), spots sweeping the empty floor
//   the rest  the laundromat's one machine spinning (its drum turning behind
//             the lit glass), a VR headset swinging on its cable
//   the bus   its two doors sliding open and shut on the schedule the doors'
//             hiss plays on (BUS_DOORS, lumen-ambience.js reads it), the light
//             strip down its ceiling flickering with its windows (the signs'
//             flicker, seed .63)
// Each is placed from the interior piece it belongs to (world/city-interiors.js
// cityPieces: the kind, its footprint and turn), at the part of the model it
// animates (the local positions below are the models' own, from
// maps/lumen-interiors-*.js and render/city-interior-models.js), so a moved
// piece takes its life with it.
//
// Cost: TWO instanced meshes, one ShaderMaterial each, built in the
// constructor: `puffs` (camera-facing soft puffs, alpha-blended: the steam and
// the fog) and `glow` (quads with a pattern each, premultiplied alpha so one
// material both adds light and darkens: the screens, the lamps, the tiles, the
// drum, the headset's and the doors' faces). Every instance belongs to a
// building; a building's instances draw only while the shells show its
// interior (render/city-shells.js interiorList: you are in it or by one of its
// doors), and a mesh is hidden while none of its buildings shows. The bus's
// doors are the outside's: shown within `busReach` of the camera's focus. The
// CPU's work a frame: one visibility read per building (14), the doors' open
// amount and the strip's flicker level (two numbers), the clock. Nothing
// allocated.
//   Potato: the glow mesh's core (screens, machines, tiles, the drum, the
//   doors and the strip), no puffs; Performance up: the puffs, the headset, the
//   floor's spot pools; Balanced up: the spots' beams. Puffs a source by
//   preset (INTERIOR_LIFE.presets).
import * as THREE from 'three';
import { registerCitySystem } from '../render/city-registry.js';
import { SIGN } from '../render/city-signs.js';
import { cityPieces } from '../world/city-interiors.js';
import { puffGeometry } from './lumen-wrecks.js';
import { EventClock } from './lumen-holograms.js';
import { BUS, busPoint } from '../maps/lumen-vehicle-lights.js';

// The bus doors' schedule: they open at `site`'s events on the weather clock (every `period` s give or take
// `spread`), stay open `open` s, then shut. lumen-ambience.js plays the hiss on the same events.
// The bus's windows flicker on this seed (maps/lumen-vehicle-lights.js busLightEntries); the ceiling strip with them.
export const BUS_STRIP_SEED = .63;
export const BUS_DOORS = Object.freeze({ site: 2, period: 20, spread: 4, open: 9, opening: .9, closing: .75, leaf: .78, height: 2.42, plug: .13, reach: 40 });

export const INTERIOR_LIFE = Object.freeze({
  presets: Object.freeze({
    potato:      Object.freeze({ steam: 0, fog: 0, tier: 0 }),
    performance: Object.freeze({ steam: 4, fog: 6, tier: 1 }),
    balanced:    Object.freeze({ steam: 6, fog: 9, tier: 2 }),
    quality:     Object.freeze({ steam: 8, fog: 12, tier: 2 }),
    extreme:     Object.freeze({ steam: 10, fog: 16, tier: 2 }),
  }),
  maxSteam: 10, maxFog: 16,   // puffs a source (the pools hold Extreme's)
  steam: Object.freeze({ life: 2.6, rise: .9, size: .09, grow: 2.2, opacity: .3, colour: '#e9e6df' }),
  fog: Object.freeze({ life: 6.5, size: .38, grow: 1.6, opacity: .2, lift: .22, colour: '#b9c6c9' }),
  // The glow's colours (never the team colours: tests/lumen-interior-life.test.js measures them at their gain).
  colours: Object.freeze({
    static: '#c8d0d8', attract: Object.freeze(['#ff2a7a', '#3d6bff', '#ff3040']), pachinko: '#ffe0ea', chase: '#fff1d6',
    leds: Object.freeze(['#6aff5a', '#3d6bff', '#ff2a3a']), red: '#ff2a3a', green: '#6aff5a',
    tiles: Object.freeze(['#ff2a66', '#3d6bff', '#8aff4a', '#fcee0a', '#ff5a8c', '#ff2a3a']), spots: Object.freeze(['#ff2a66', '#3d6bff', '#8aff4a', '#fcee0a']),
    drum: '#6f93b3', clothes: '#4a5a78', headset: '#e8ecef', visor: '#2a2d33', cable: '#15171b', glass: '#1b2433', frame: '#c9ccd0', strip: '#eef4ff',
  }),
  gain: 1.7,          // HDR: the glow patterns' brightest
  // Each pattern's brightest, as a multiple of its colour before `gain` (the shader's numbers; the test measures the team gap there).
  peaks: Object.freeze({ static: 1.1, attract: 2, pachinko: .6, chase: 1.2, leds: 2.2, blink: 2, tiles: .3, pool: .5, beam: .22, drum: .8, strip: .16 }),
  beat: 60 / 122,     // s: the club's kick (audio-lumen.js CLUB.bpm)
  busReach: 40,       // m: the bus's doors are drawn within this of the camera's focus
  headsetSwing: .32,  // rad: the headset's swing
});

// The glow's pattern modes (aO.w).
export const MODES = Object.freeze({ static: 0, attract: 1, pachinko: 2, chase: 3, leds: 4, blink: 5, tiles: 6, pool: 7, beam: 8, drum: 9, solid: 10, glass: 11, strip: 12 });

// --- Where: the pieces' animated parts, in their own frame (x across, y up, +z their front) -----
const STEAM_AT = Object.freeze({
  'noodle-range': [[-.65, 1.35, 0], [0, 1.27, 0], [.65, 1.19, 0]],
  'tenb-range': [[-.6, 1.35, 0], [0, 1.28, 0]],
  'stacks-kitchenette-b': [[-.35, 1.22, 0]],
  'hot-plate': [[-.15, .99, 0]],
  'kitchen-range': [[0, 1.15, -.14]],
});
// Screens: [x, y, z (in front of the face), w, h, mode, colour, facing ('x': the booth's side screen)].
const SCREENS = Object.freeze({
  'stacks-tv': [-.04, 1.0, .19, .44, .32, 'static'],
  'pawn-tv-stack': [-.05, .9, .266, .6, .38, 'static'],
  'vr-booth-c': [-.683, 1.68, 0, .8, .5, 'static', null, 'x'],
  'arcade-cab-a': [0, 1.52, .15, .6, .44, 'attract', 0],
  'arcade-cab-c': [0, 1.52, .15, .6, .44, 'attract', 1],
  'arcade-cab-d': [0, 1.52, .15, .6, .44, 'static'],
});
const SERVER_KINDS = /^(server-row|server-row-b|network-rack|stacks-server-rack)$/;

const stream = seed => { let s = seed >>> 0 || 1; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; };
const hexLinear = hex => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };

// A piece's frame: a local point or direction into the world (rotation.y = angle).
function frameOf(p) {
  const c = Math.cos(p.angle || 0), s = Math.sin(p.angle || 0);
  return { pt: (x, y, z) => [p.x + x * c + z * s, y, p.z - x * s + z * c], dir: (x, y, z) => [x * c + z * s, y, -x * s + z * c] };
}
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const neg = a => [-a[0], -a[1], -a[2]];
const add = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];

// --- The plan: every source, from the map (pure; the tests read it) -------------------------------
// { buildings: [id...] (the index a source's `b` names; the last is 'bus-outside'), puffs: rows, glow: rows, sounds: [...] }
// puff row: [x, y, z, kind 0 steam / 1 fog,  phase, rank, b, 0,  dirX, dirZ, length, size]
// glow row: [cx, cy, cz, mode,  Ux, Uy, Uz, halfW,  Vx, Vy, Vz, halfH,  b, tier, seed, param,  r, g, b, param2,  w0, w1, w2, w3]
export function interiorLifePlan(map) {
  const C = INTERIOR_LIFE.colours, rooms = new Map();
  for (const r of map?.buildings || []) if (r.group) { if (!rooms.has(r.group)) rooms.set(r.group, []); rooms.get(r.group).push(r); }
  const plan = { buildings: [], puffs: [], glow: [], sounds: [], steamOf: [], glowOf: [] };
  const index = id => { let i = plan.buildings.indexOf(id); if (i < 0) { i = plan.buildings.length; plan.buildings.push(id); } return i; };
  const rnd = stream(40417);
  const quad = (b, tier, mode, c, U, hw, V, hh, colour, seed = rnd(), param = 0, param2 = 0, w = [0, 0, 0, 0]) => {
    const col = typeof colour === 'string' ? hexLinear(colour) : colour || [1, 1, 1];
    plan.glow.push([...c, MODES[mode], ...U, hw, ...V, hh, b, tier, seed, param, ...col, param2, ...w]);
  };
  const facingQuad = (b, tier, mode, c, F, w, h, colour, seed, param, param2) => quad(b, tier, mode, c, [F[2], 0, -F[0]], w / 2, [0, 1, 0], h / 2, colour, seed, param, param2);
  // A box's six faces (X, Y, Z its unit axes; hx, hy, hz half sizes), each drawn from outside.
  const box = (b, tier, mode, c, X, Y, Z, hx, hy, hz, colour, w, param = 0) => {
    for (const [n, h, U, hu, V, hv] of [[Z, hz, X, hx, Y, hy], [neg(Z), hz, neg(X), hx, Y, hy], [X, hx, neg(Z), hz, Y, hy], [neg(X), hx, Z, hz, Y, hy], [Y, hy, X, hx, neg(Z), hz], [neg(Y), hy, X, hx, Z, hz]])
      quad(b, tier, mode, add(c, n, h), U, hu, V, hv, colour, rnd(), param, 0, w);
  };
  const sound = (kind, x, z, group) => plan.sounds.push({ kind, x, z, group });

  for (const [id, list] of rooms) {
    let pieces;
    try { pieces = cityPieces(id, list); } catch { pieces = []; }
    for (const p of pieces) {
      const F = frameOf(p), front = F.dir(0, 0, 1), side = F.dir(1, 0, 0), kind = p.kind;
      if (STEAM_AT[kind]) for (const at of STEAM_AT[kind]) {
        const b = index(id), [x, y, z] = F.pt(...at);
        for (let k = 0; k < INTERIOR_LIFE.maxSteam; k++) plan.puffs.push([x, y, z, 0, rnd(), k, b, 0, 0, 0, 0, INTERIOR_LIFE.steam.size * (.8 + rnd() * .5)]);
        sound('simmer', x, z, id);
      }
      if (kind === 'market-fog') {
        // Pooled palest at its +x end (the cold room's doorway), creeping toward -x along the floor.
        const b = index(id), [x, , z] = F.pt(p.w / 2 - .35, 0, 0), dir = F.dir(-1, 0, 0);
        for (let k = 0; k < INTERIOR_LIFE.maxFog; k++) plan.puffs.push([x + (rnd() - .5) * .3 * side[0], .06, z + (rnd() - .5) * .3 * side[2], 1, rnd(), k, b, 0, dir[0], dir[2], p.w - .6, INTERIOR_LIFE.fog.size * (.75 + rnd() * .5)]);
        sound('compressor', x, z, id);
      }
      if (SCREENS[kind]) {
        const [sx, sy, sz, w, h, mode, colour, facing] = SCREENS[kind], b = index(id);
        const F2 = facing === 'x' ? side : front;
        facingQuad(b, mode === 'attract' ? 1 : 0, mode, F.pt(sx, sy, sz), F2, w, h, mode === 'attract' ? C.attract[colour] : C.static, rnd(), 0, 0);
        sound(mode === 'attract' ? 'arcade' : 'tv', ...F.pt(sx, sy, sz).filter((_, i) => i !== 1), id);
      }
      if (kind === 'washer' && p.params.v === 2) {
        const b = index(id);
        facingQuad(b, 0, 'drum', F.pt(0, .42, p.d / 2 + .036), front, .42, .42, C.drum, rnd(), 5.5, 0);
        // (Its front faces into the hall, away from the camera: a window on its top shows the drum turning, seen from above.)
        quad(b, 0, 'drum', F.pt(0, p.h + .006, .04), side, .16, neg(front), .16, C.drum, rnd(), 5.5, 0);
        sound('washer', p.x, p.z, id);
      }
      if (/^pachinko-(wall|double)-/.test(kind)) {
        const b = index(id), sides = kind.includes('double') ? [1, -1] : [1], n = Math.max(1, Math.round(p.w / .74)), step = p.w / n;
        for (const s of sides) for (let i = 0; i < n; i++) {
          const x = -p.w / 2 + step * (i + .5), dir = F.dir(0, 0, s);
          facingQuad(b, 0, 'pachinko', F.pt(x, 1.15, s * (p.d / 2 + .04)), dir, step - .2, .62, C.pachinko, rnd(), 0, 0);
          facingQuad(b, 0, 'chase', F.pt(x, 1.54, s * (p.d / 2 + .05)), dir, step - .24, .085, C.chase, rnd(), 0, 0);
        }
        sound('pachinko', p.x, p.z, id);
      }
      if (SERVER_KINDS.test(kind)) {
        const b = index(id);
        if (kind === 'server-row' || kind === 'server-row-b') {
          const rw = p.w / 5;
          for (let k = 0; k < 5; k++) if (!(kind === 'server-row-b' && k === 3)) facingQuad(b, 0, 'leds', F.pt(-p.w / 2 + rw * (k + .5), p.h / 2, p.d / 2 + .018), front, rw - .12, p.h - .3, C.leds[0], rnd(), 3, 12);
        } else if (kind === 'network-rack') facingQuad(b, 0, 'leds', F.pt(0, 1.0, p.d / 2 - .02), front, p.w - .16, 1.6, C.leds[1], rnd(), 8, 9);
        else facingQuad(b, 0, 'leds', F.pt(0, .8, p.d / 2 + .012), front, .3, 1.35, C.leds[0], rnd(), 4, 7);
        sound('servers', p.x, p.z, id);
      }
      if (kind === 'fare-gate') {
        const b = index(id);
        facingQuad(b, 0, 'blink', F.pt(-p.w / 2 + .09, p.h - .07, p.d / 2 + .014), front, .11, .11, C.red, rnd(), .8, 0);
        facingQuad(b, 0, 'blink', F.pt(-p.w / 2 + .16, p.h - .07, -p.d / 2 - .014), neg(front), .12, .06, C.green, rnd(), .8, .5);
      }
      if (kind === 'speed-gate') {
        const b = index(id);
        for (const s of [1, -1]) {
          facingQuad(b, 0, 'blink', F.pt(-p.w / 4, p.h - .09, s * (p.d / 2 + .01)), F.dir(0, 0, s), .09, .05, C.red, rnd(), 1.1, 0);
          facingQuad(b, 0, 'blink', F.pt(p.w / 4, p.h - .09, s * (p.d / 2 + .01)), F.dir(0, 0, s), .09, .05, C.green, rnd(), 1.1, .5);
        }
      }
      if (kind === 'dance-tiles') {
        const b = index(id);
        quad(b, 0, 'tiles', F.pt(0, .036, 0), side, p.w / 2, neg(front), p.d / 2, [1, 1, 1], rnd(), 8, 0);
      }
      if (kind === 'light-rig') {
        // Spots on the truss sweeping the floor: a pool each (Performance up), the beam down to it (Balanced up).
        const b = index(id), y = p.h - .25 - .26;
        for (let k = 0; k < 8; k++) {
          const sideK = k % 4, t = (Math.floor(k / 4) + .5) / 2 - .5, lx = sideK < 2 ? t * p.w : (sideK === 2 ? -1 : 1) * p.w / 2, lz = sideK < 2 ? (sideK === 0 ? -1 : 1) * p.d / 2 : t * p.d;
          const spot = F.pt(lx, y, lz), col = C.spots[k % C.spots.length], seed = rnd(), speed = .35 + rnd() * .35, reach = 1.2 + rnd() * 1.1;
          const centre = F.pt(lx * .35, .045, lz * .35);
          quad(b, 1, 'pool', centre, side, .75, neg(front), .75, col, seed, speed, reach);
          quad(b, 2, 'beam', spot, [0, 0, 0], .05, [0, 0, 0], .6, col, seed, speed, reach, [...centre, 0]);
        }
        sound('club', p.x, p.z, id);
      }
      if (kind === 'vr-booth-a') {
        // The headset hanging from the boom on its cable, swinging across the booth.
        const b = index(id), pivot = F.pt(.05, p.h - .15, 0), yaw = p.angle || 0, w = [...pivot, INTERIOR_LIFE.headsetSwing];
        const X = side, Y = [0, 1, 0], Z = front;
        box(b, 1, 'solid', F.pt(.05, p.h - .15 - .38, 0), X, Y, Z, .006, .38, .006, C.cable, w, yaw);
        box(b, 1, 'solid', F.pt(.05, p.h - .15 - .82, 0), X, Y, Z, .1, .055, .075, C.headset, w, yaw);
        box(b, 1, 'solid', F.pt(.05, p.h - .15 - .84, .078), X, Y, Z, .085, .032, .006, C.visor, w, yaw);
        sound('arcade', p.x, p.z, id);
      }
      if (kind === 'bus-light') {
        // The ceiling strip's six live sections flickering with the windows (the dead one stays dead). The strip
        // faces down, under its rail: seen from above, its flicker is the light it throws on the aisle's floor.
        const b = index(id);
        for (let k = 0; k < 7; k++) if (k !== 4) quad(b, 0, 'strip', F.pt(-p.w / 2 + .75 + k * 1.5, .05, 0), side, .8, neg(front), .55, C.strip, rnd(), k === 2 ? 1 : 0, 0);
      }
    }
  }
  // The bus's doors, seen from outside: two leaves a door, sliding apart along the flank after a
  // plug outward. Each leaf a thin box; w = (the slide's direction x, z, its length, the plug).
  const bo = index('bus-outside'), U = [BUS.ux, 0, BUS.uz], N = [BUS.vx, 0, BUS.vz], Y = [0, 1, 0], out = BUS.hw + BUS.wall, D = BUS_DOORS;
  for (const d of BUS.doors) for (const s of [-1, 1]) {
    const c = busPoint(d.x + s * d.width / 4, .06 + D.height / 2, out + .015);
    box(bo, 0, 'glass', c, U, Y, N, D.leaf / 2, D.height / 2, .018, C.glass, [U[0] * s, U[2] * s, d.width / 2 - .02, D.plug], 0);
  }
  plan.steamOf = plan.buildings.map((_, b) => plan.puffs.some(r => r[6] === b));
  plan.glowOf = plan.buildings.map((_, b) => plan.glow.some(r => r[12] === b));
  return plan;
}

// How open the bus's doors are at `clock` (0 shut .. 1 open): the events the hiss plays on.
const smoothUnit = x => { x = x < 0 ? 0 : x > 1 ? 1 : x; return x * x * (3 - 2 * x); };
const doorEvents = new EventClock(BUS_DOORS.site, BUS_DOORS.period, BUS_DOORS.spread);
export function busDoorOpen(clock, events = doorEvents) {
  const D = BUS_DOORS, age = clock - events.at(clock), s = smoothUnit;
  if (age < 0) return 0;
  if (age < D.opening) return s(age / D.opening);
  if (age < D.open) return 1;
  return 1 - s((age - D.open) / D.closing);
}

// --- The materials ----------------------------------------------------------------------------
const f = v => Number(v).toFixed(4);
const c3 = hex => { const c = new THREE.Color(hex); return new THREE.Vector3(c.r, c.g, c.b); };

export function puffMaterial(show) {
  const S = INTERIOR_LIFE.steam, F = INTERIOR_LIFE.fog;
  const material = new THREE.ShaderMaterial({
    uniforms: { uClock: { value: 0 }, uCount: { value: new THREE.Vector2() }, uShow: show, uSteam: { value: c3(S.colour) }, uFog: { value: c3(F.colour) } },
    vertexShader: `
attribute vec4 aP;
attribute vec4 aQ;
attribute vec4 aR;
uniform float uClock;
uniform vec2 uCount;
uniform float uShow[32];
uniform vec3 uSteam;
uniform vec3 uFog;
varying vec3 vCol;
varying float vAlpha;
varying vec2 vUv;
void main() {
  vUv = position.xy; vAlpha = 0.0; vCol = uSteam;
  bool fog = aP.w > .5;
  int b = int(aQ.z + .5);
  if (uShow[b] < .5 || aQ.y >= (fog ? uCount.y : uCount.x)) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  vec3 p = aP.xyz;
  float radius;
  if (!fog) {
    // A wisp off a pot: rising, curling, spreading, gone.
    float t = fract(uClock / ${f(S.life)} + aQ.x);
    float rise = ${f(S.rise)} * t * (.8 + .4 * aQ.x);
    p += vec3(sin(t * 5.0 + aQ.x * 23.0) * .06 * t + .05 * t, rise, cos(t * 4.3 + aQ.x * 17.0) * .05 * t);
    radius = aR.w * (.6 + ${f(S.grow)} * t);
    vAlpha = smoothstep(0.0, .12, t) * pow(1.0 - t, 1.3) * ${f(S.opacity)};
  } else {
    // A roll of cold fog creeping out along the floor, swelling and thinning.
    float t = fract(uClock / ${f(F.life)} + aQ.x);
    vec2 dir = aR.xy;
    float along = aR.z * t;
    vec2 across = vec2(-dir.y, dir.x) * sin(t * 3.0 + aQ.x * 31.0) * .35 * t;
    p += vec3(dir.x * along + across.x, ${f(F.lift)} * t * (.5 + .5 * aQ.x), dir.y * along + across.y);
    radius = aR.w * (.7 + ${f(F.grow)} * t);
    vAlpha = smoothstep(0.0, .15, t) * pow(1.0 - t, 1.1) * ${f(F.opacity)};
    vCol = uFog;
  }
  vec4 mv = viewMatrix * vec4(p, 1.0);
  mv.xy += position.xy * radius;
  gl_Position = projectionMatrix * mv;
}`,
    fragmentShader: `
varying vec3 vCol;
varying float vAlpha;
varying vec2 vUv;
void main() {
  float d = length(vUv);
  if (d > 1.0 || vAlpha <= .002) discard;
  gl_FragColor = vec4(vCol, vAlpha * (1.0 - smoothstep(.3, 1.0, d)));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`,
    transparent: true, depthWrite: false, fog: false,
  });
  material.customProgramCacheKey = () => 'lumen-interior-puffs-v1';
  return material;
}

export function glowMaterial(show, shared = {}) {
  const L = INTERIOR_LIFE, C = L.colours, M = MODES, v3 = list => list.map(c3);
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uClock: { value: 0 }, uTier: { value: 0 }, uShow: show, uBusOpen: { value: 0 }, uBusN: { value: new THREE.Vector2(BUS.vx, BUS.vz) },
      uSignTime: shared.time || { value: 0 }, uSag: shared.sag || { value: 0 }, // (the signs' time: the strip flickers with the bus's windows)
      uTiles: { value: v3(C.tiles) }, uLeds: { value: v3(C.leds) }, uCloth: { value: c3(C.clothes) }, uFrame: { value: c3(C.frame) },
    },
    vertexShader: `
attribute vec4 aO;
attribute vec4 aU;
attribute vec4 aV;
attribute vec4 aS;
attribute vec4 aT;
attribute vec4 aW;
uniform float uClock;
uniform float uTier;
uniform float uShow[32];
uniform float uBusOpen;
uniform vec2 uBusN;
uniform float uSignTime;
uniform float uSag;
varying float vLevel;
// The signs' flicker (city-signs.js signModeLevel, mode 'flicker'), on the same PCG hash: the bus's windows' seed.
uint lumenPcg(uint v) { uint s = v * 747796405u + 2891336453u; uint w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u; return (w >> 22u) ^ w; }
float lumenHash(float a, float b, float c) { return float(lumenPcg(uint(int(a)) + lumenPcg(uint(int(b)) + lumenPcg(uint(int(c)))))) * 2.3283064365386963e-10; }
float flickerLevel(float seed, float t) {
  float s = floor(seed * 65535.0 + 0.5), w = floor(t / ${f(SIGN.flicker.window)});
  if (lumenHash(w, s, 11.0) >= ${f(SIGN.flicker.chance)}) return 1.0;
  float start = ${f(SIGN.flicker.quantum)} + lumenHash(w, s, 12.0) * (${f(SIGN.flicker.window - (SIGN.flicker.quanta + 2) * SIGN.flicker.quantum)}), local = t - w * ${f(SIGN.flicker.window)} - start;
  if (local < 0.0 || local >= ${f(SIGN.flicker.quanta * SIGN.flicker.quantum)}) return 1.0;
  float h = lumenHash(w * 8.0 + floor(local / ${f(SIGN.flicker.quantum)}), s, 13.0);
  return h < ${f(SIGN.flicker.out)} ? 0.0 : h < ${f(SIGN.flicker.dimFrom)} ? ${f(SIGN.flicker.dim)} : 1.0;
}
varying vec2 vUv;
varying float vMode;
varying vec3 vCol;
varying vec4 vP;   // seed, param, param2, size ratio
varying vec3 vN;
varying float vSide;
vec3 turn(vec3 v, vec3 a, float th) { float c = cos(th), s = sin(th); return v * c + cross(a, v) * s + a * dot(a, v) * (1.0 - c); }
void main() {
  int b = int(aS.x + .5);
  vUv = position.xy; vMode = aO.w; vCol = aT.rgb; vP = vec4(aS.z, aS.w, aT.w, aU.w / max(aV.w, .001)); vSide = 0.0;
  vLevel = 1.0;
  if (uShow[b] < .5 || aS.y > uTier + .5) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  float t = uClock, mode = aO.w;
  vec3 c = aO.xyz, U = aU.xyz, V = aV.xyz;
  vN = cross(U, V);
  vec4 mv;
  if (mode > ${M.beam - .5} && mode < ${M.beam + .5}) {
    // A spot's beam: from the truss down to its pool, camera-facing, wider at the floor.
    vec3 floorAt = aW.xyz + vec3(cos(t * aS.w + aS.z * 6.28), 0.0, sin(t * aS.w * 1.3 + aS.z * 4.0)) * aT.w;
    vec4 ma = viewMatrix * vec4(c, 1.0), mb = viewMatrix * vec4(floorAt, 1.0);
    float u = position.x * .5 + .5;
    mv = mix(ma, mb, u);
    vec2 dir = mb.xy - ma.xy; dir = length(dir) < .0001 ? vec2(1.0, 0.0) : normalize(dir);
    mv.xy += vec2(-dir.y, dir.x) * position.y * mix(aU.w, aV.w, u);
    vSide = position.y; vUv = vec2(u, position.y);
  } else {
    vec3 local = U * position.x * aU.w + V * position.y * aV.w;
    if (mode > ${M.pool - .5} && mode < ${M.pool + .5}) c += vec3(cos(t * aS.w + aS.z * 6.28), 0.0, sin(t * aS.w * 1.3 + aS.z * 4.0)) * aT.w;
    vec3 w = c + local;
    if (mode > ${M.solid - .5} && mode < ${M.solid + .5}) {
      // The headset: the whole thing swings about the boom, across the booth.
      vec3 axis = vec3(sin(aS.w), 0.0, cos(aS.w));
      float th = aW.w * (.75 + .25 * sin(t * .21)) * sin(t * 3.3069 + 1.3);
      w = aW.xyz + turn(w - aW.xyz, axis, th);
      vN = turn(vN, axis, th);
    } else if (mode > ${M.glass - .5} && mode < ${M.glass + .5}) {
      // A door leaf: out on its plug, then along the flank.
      float plug = smoothstep(0.0, .3, uBusOpen), slide = smoothstep(.22, 1.0, uBusOpen);
      w += vec3(uBusN.x, 0.0, uBusN.y) * aW.w * plug + vec3(aW.x, 0.0, aW.y) * aW.z * slide;
    }
    mv = viewMatrix * vec4(w, 1.0);
    if (mode > ${M.strip - .5} && mode < ${M.strip + .5}) vLevel = flickerLevel(${f(BUS_STRIP_SEED)}, uSignTime) * (1.0 - .6 * uSag);
  }
  gl_Position = projectionMatrix * mv;
}`,
    fragmentShader: `
uniform float uClock;
uniform vec3 uTiles[6];
uniform vec3 uLeds[3];
uniform vec3 uCloth;
uniform vec3 uFrame;
varying vec2 vUv;
varying float vMode;
varying vec3 vCol;
varying vec4 vP;
varying vec3 vN;
varying float vSide;
varying float vLevel;
float h21(vec2 p) { vec3 q = fract(vec3(p.xyx) * .1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
bool is(float m) { return abs(vMode - m) < .5; }
void main() {
  float t = uClock, seed = vP.x;
  vec2 uv = vUv * .5 + .5;
  vec3 rgb = vec3(0.0); float a = 0.0;
  if (is(${f(M.static)})) {
    // Static: grain changing every frame of the set, a rolling bar, a faint darkening under it.
    float n = h21(floor(uv * vec2(46.0, 34.0)) + floor(t * 24.0) * 7.13 + seed * 91.0);
    float roll = smoothstep(.0, .12, abs(fract(uv.y - t * .31 + seed) - .5));
    rgb = vCol * (.25 + .75 * n) * (.7 + .3 * roll) * 1.1; a = .25;
  } else if (is(${f(M.attract)})) {
    // Attract mode: blocks of its colour stepping (1.5 a second), a bright sprite gliding, a bar scrolling.
    vec2 cell = floor(uv * vec2(6.0, 4.0));
    float step1 = floor(t * 1.5 + seed * 10.0), on = step(.55, h21(cell + step1 * 3.7));
    vec2 sp = vec2(.5 + .32 * sin(t * 1.3 + seed * 6.0), .55 + .25 * sin(t * 1.9 + seed * 4.0));
    float sprite = smoothstep(.12, .08, length((uv - sp) * vec2(1.4, 1.0)));
    float bar = step(.86, fract(uv.y * 3.0 + t * .5)) * .5;
    rgb = vCol * (.3 + 1.2 * on + bar) + vec3(1.0) * sprite * 1.2; a = .15;
  } else if (is(${f(M.pachinko)})) {
    // A playfield: balls running down its pins in six lanes, and now and then a fever burst (slow pulses).
    float lane = floor(uv.x * 6.0), lx = (lane + .5) / 6.0 + .04 * sin(uv.y * 30.0 + lane);
    float by = fract(-t * (.45 + .3 * h21(vec2(lane, seed * 50.0))) + h21(vec2(lane * 3.0, seed * 20.0)));
    float ball = smoothstep(.035, .015, length((uv - vec2(lx, by)) * vec2(1.0, 1.6)));
    float k = floor(t / 3.7 + seed * 9.0), fever = step(.72, h21(vec2(k, seed * 13.0))) * smoothstep(0.0, .2, fract(t / 3.7 + seed * 9.0)) * (1.0 - fract(t / 3.7 + seed * 9.0));
    float pulse = .5 + .5 * sin(t * 9.4 + seed * 20.0);
    rgb = vec3(1.0, .95, .97) * ball * 1.4 + vCol * (.06 + .5 * fever * pulse); a = 0.0;
  } else if (is(${f(M.chase)})) {
    // The header's lamps chasing along it.
    float lit = step(fract(uv.x * 2.5 - t * .9 + seed), .3);
    rgb = vCol * lit * 1.2; a = 0.0;
  } else if (is(${f(M.leds)})) {
    // A rack face of LEDs (columns x rows), each on its own slow blink, green, blue or red.
    vec2 g = vec2(vP.y, vP.z), cell = floor(uv * g), inCell = fract(uv * g) - .5;
    float hv = h21(cell + seed * 31.0);
    if (hv < .3) discard;
    float blink = step(.35, fract(t * (.25 + 1.6 * h21(cell * 1.7 + 4.0)) + hv * 7.0));
    vec3 led = hv < .78 ? uLeds[0] : hv < .92 ? uLeds[1] : uLeds[2];
    rgb = led * blink * smoothstep(.3, .12, length(inCell * vec2(1.0, g.y / g.x * vP.w))) * 2.2; a = 0.0;
  } else if (is(${f(M.blink)})) {
    // A gate lamp blinking (under 1.5 Hz), red and green out of step.
    float on = step(.5, fract(t * vP.y + vP.z));
    rgb = vCol * on * 2.0 * smoothstep(1.0, .5, max(abs(vUv.x), abs(vUv.y))); a = 0.0;
  } else if (is(${f(M.tiles)})) {
    // The dance floor: 8 x 8 tiles, lit on the kick (the sound's clock), a wave rolling over it, the colours changing each bar.
    float beat = ${f(L.beat)}, n = vP.y;
    vec2 tile = floor(uv * n), inT = fract(uv * n);
    float edge = step(.06, inT.x) * step(.06, inT.y) * step(inT.x, .94) * step(inT.y, .94);
    float kick = exp(-fract(t / beat) * 4.0);
    float bar = floor(t / (beat * 8.0));
    float pick = h21(tile + bar * 5.31);
    float wave = .5 + .5 * sin((tile.x + tile.y) * .8 - t * 3.1);
    int ci = int(floor(h21(tile * 1.9 + bar) * 5.99));
    vec3 col = uTiles[0];
    for (int i = 1; i < 6; i++) if (i == ci) col = uTiles[i];
    rgb = col * edge * step(.42, pick) * (.04 + .26 * kick * (.4 + .6 * wave)); a = 0.0;
  } else if (is(${f(M.pool)})) {
    float d = length(vUv);
    rgb = vCol * .5 * (1.0 - smoothstep(.2, 1.0, d)); a = 0.0;
  } else if (is(${f(M.beam)})) {
    rgb = vCol * .22 * (1.0 - vSide * vSide) * (1.0 - .45 * vUv.x); a = 0.0;
  } else if (is(${f(M.drum)})) {
    // The spinning drum behind the lit glass: clothes tumbling round.
    float d = length(vUv);
    if (d > 1.0) discard;
    float ang = atan(vUv.y, vUv.x) + t * vP.y;
    float cloth = step(.2, sin(ang * 3.0 + d * 5.0 + seed * 6.0) * .5 + .5 - .25 * d) * smoothstep(.25, .45, d) * step(d, .92);
    rgb = vCol * (1.0 - cloth) * (.55 + .25 * sin(ang * 2.0)) + uCloth * cloth * .35; a = cloth * .8;
  } else if (is(${f(M.solid)})) {
    if (!gl_FrontFacing) discard;
    float lit = .55 + .45 * max(dot(normalize(vN), normalize(vec3(.3, .9, .35))), 0.0);
    rgb = vCol * lit * .6; a = 1.0;
  } else if (is(${f(M.glass)})) {
    // A door leaf: pearl frame round dark glass, a pale streak of reflection across it.
    if (!gl_FrontFacing) discard;
    vec2 m = vec2(1.0 - abs(vUv.x), 1.0 - abs(vUv.y)) * vec2(vP.w, 1.0);
    if (min(m.x, m.y) < .045) { rgb = uFrame * .5; a = 1.0; }
    else { float streak = smoothstep(.06, 0.0, abs(fract(vUv.x * .5 + vUv.y * .35 + .2) - .5)) * .06; rgb = vCol * .6 + vec3(streak); a = .82; }
  } else if (is(${f(M.strip)})) {
    // A section of the bus's ceiling light, flickering with its windows: its pool of light on the floor.
    float level = vP.y > .5 ? vLevel * (.4 + .6 * step(.3, fract(t * .37 + seed))) : vLevel;
    rgb = vCol * ${f(L.peaks.strip)} * level * (1.0 - smoothstep(.25, 1.0, length(vUv))); a = 0.0;
  }
  if (a <= .002 && max(rgb.r, max(rgb.g, rgb.b)) <= .002) discard;
  gl_FragColor = vec4(rgb * ${f(L.gain)} * (a >= 1.0 ? 1.0 / ${f(L.gain)} : 1.0), a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`,
    transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendEquation: THREE.AddEquation,
  });
  material.customProgramCacheKey = () => 'lumen-interior-glow-v1';
  return material;
}

// A unit quad, x and y in -1..1, facing +z (counter-clockwise from the front).
export function quadGeometry() {
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  return g;
}

function instanced(geometry, rows, layout) {
  for (const [name, from] of layout) {
    const a = new Float32Array(Math.max(1, rows.length) * 4);
    rows.forEach((r, n) => { for (let k = 0; k < 4; k++) a[n * 4 + k] = r[from + k]; });
    geometry.setAttribute(name, new THREE.InstancedBufferAttribute(a, 4));
  }
  geometry.instanceCount = rows.length;
  return geometry;
}

export class LumenInteriorLife {
  constructor(view, map, city) {
    this.view = view; this.city = city;
    const plan = this.plan = interiorLifePlan(map);
    this.sounds = plan.sounds; // (lumen-ambience.js: where the simmer, static, washer, compressor, pachinko, servers and arcade are)
    this.show = { value: new Float32Array(32) };
    const interiors = city?.shells?.interiors;
    // Each building's shells entry (its interior group shows or not), or the bus's outside.
    this.entries = plan.buildings.map(id => id === 'bus-outside' ? 'bus' : interiors?.get(id) || null);
    this.puffs = this.mesh(instanced(puffGeometry(), plan.puffs, [['aP', 0], ['aQ', 4], ['aR', 8]]), puffMaterial(this.show), 'lumen-interior-puffs', 3);
    this.glow = this.mesh(instanced(quadGeometry(), plan.glow, [['aO', 0], ['aU', 4], ['aV', 8], ['aS', 12], ['aT', 16], ['aW', 20]]), glowMaterial(this.show, city?.uniforms), 'lumen-interior-glow', 3);
    this.busAt = busPoint(0, 0, 0);
    this.doorEvents = new EventClock(BUS_DOORS.site, BUS_DOORS.period, BUS_DOORS.spread);
    this.setQuality(view.qualityName || 'balanced');
  }
  mesh(geometry, material, name, order) {
    const m = new THREE.Mesh(geometry, material);
    m.name = name; m.frustumCulled = false; m.renderOrder = order; m.raycast = () => {}; m.visible = false; m.matrixAutoUpdate = false;
    this.view.scene?.add(m);
    return m;
  }
  setQuality(name) {
    const p = this.preset = INTERIOR_LIFE.presets[name] || INTERIOR_LIFE.presets.balanced;
    this.puffs.material.uniforms.uCount.value.set(p.steam, p.fog);
    this.glow.material.uniforms.uTier.value = p.tier;
    this.puffsOn = p.steam > 0 || p.fog > 0;
  }
  update(frame) {
    const plan = this.plan, show = this.show.value, focus = frame.focus, R = INTERIOR_LIFE.busReach;
    const clock = Number.isFinite(frame.clock) ? frame.clock : frame.elapsed || 0;
    let puffs = false, glow = false, bus = false;
    for (let b = 0; b < this.entries.length; b++) {
      const e = this.entries[b];
      let on = false;
      if (e === 'bus') { on = !!focus && (focus.x - this.busAt[0]) ** 2 + (focus.z - this.busAt[2]) ** 2 < R * R; bus = bus || on; }
      else if (e) on = e.group.visible;
      show[b] = on ? 1 : 0;
      if (on) { if (plan.steamOf[b]) puffs = true; if (plan.glowOf[b]) glow = true; }
    }
    this.puffs.visible = puffs && this.puffsOn;
    this.glow.visible = glow;
    if (this.puffs.visible) this.puffs.material.uniforms.uClock.value = clock;
    if (glow) {
      const u = this.glow.material.uniforms;
      u.uClock.value = clock;
      u.uBusOpen.value = busDoorOpen(clock, this.doorEvents);
    }
  }
  warm() { this.puffs.visible = true; this.glow.visible = true; }
  dispose() { for (const m of [this.puffs, this.glow]) { m.removeFromParent(); m.geometry.dispose(); m.material.dispose(); } }
}

registerCitySystem('interiorLife', (view, map, city) => (map.city?.interiorLife ?? map.id === 'lumen') ? new LumenInteriorLife(view, map, city) : null);
