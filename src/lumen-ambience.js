// Where Lumen's sounds are and when they play (stage 3, s3-sound): the city
// system that reads the map, the weather clock and where you stand, and tells
// the voices in audio-lumen.js what to do. Started only on a map with a `city`
// block (the hub makes one system per flag; other maps never get it); on
// Lumen it also knows the places (`LUMEN_SITES`), on any other city map (the
// test street) it plays just the city's hum, the wind and the rain.
//
// It plugs in twice:
//   - as a city system (registerCitySystem 'sound' at the bottom): the hub
//     hands it every frame { sim, dt, clock, player, ... } and the maps' emitters;
//   - to the Soundscape, once, from main.js (`lumenAmbience(map, view, sound)`):
//     `sound.lumen` is then the LumenSound whose graph audio.js builds on start.
//
// What it does each frame: the power sag's edges, the placed one-shots that fall due (all from the
// weather clock, so every player hears the same thunder, train, chimes and
// sirens at the same moment, nothing sent); ten times a second the beds:
// where you are decides how much hum, buzz, wind, rain, drumming, gutter,
// drone and district sound there is, and whether you are indoors (the room's
// own tone, the city muffled through the doorways).
//
// The rest of the game reaches it through: `pigeon(kind, x, y, z, n)` and
// `rat(kind, x, z)` (the life system), `water(kind, x, z, strength)` (the
// water effects' onSound), `onImpact`/`onFall` (the hub's world events, a
// splash on wet ground), and `signs.onBreak` / `onSpark` (wired when the signs
// exist).
import { registerCitySystem } from './render/city-registry.js';
import { rainAt, wetnessAt, rainPhase, shapeBox } from './effects/rain.js';
import { sagAt, TRAFFIC } from './render/city-signs.js';
import { HEARING, hearingLevel } from './audio.js';
import { buildingContains } from './map-kit.js';
import { ROADS, CROSSROADS } from './maps/lumen-layout.js';
import { intersections } from './world/lumen-ground.js';
import { LUMEN_VENTS, ventState } from './maps/lumen-vents.js';
import {
  LumenSound, LUMEN_SOUND, newMix, hash01, slotFire, THUNDER, strikeTime, strikeDelay, strikePower, rainCycle,
  trainAt, humAt, gustAt, roomKindOf, newLifeMix, compressorAt,
} from './audio-lumen.js';
import { BUS_DOORS } from './effects/lumen-interior-life.js'; // (stage 5: the doors' leaves move on the same events)
import { HOLOGRAMS } from './effects/lumen-holograms.js';

export const hasLumenSound = map => !!map?.city && map.city.sound !== false;

// Where things are on Lumen and how often they happen (metres; seconds of the
// weather clock). Positions are where the design puts them (section 6, 14);
// the cars that alarm or blink are found from the map's props (the nearest to
// the spot), so a stage-4 move of a car takes its sound with it.
export const LUMEN_SITES = Object.freeze({
  chime: Object.freeze({ x: -21, z: -10.5, group: 'convenience', period: 34, spread: 26, reach: 16 }),
  busDoors: Object.freeze([[49.64, 4.54], [55.51, 5.785]]),
  bus: Object.freeze({ period: BUS_DOORS.period, spread: BUS_DOORS.spread, open: BUS_DOORS.open, reach: 14 }), // (stage 5: every ~20 s, open 9: effects/lumen-interior-life.js slides the leaves on these events)
  phone: Object.freeze({ x: -7.5, z: 21, group: 'pharmacy', period: 9.5, spread: 3, reach: 22 }),
  // Sparks: the crackling EV (nearest compact to `near`: the charging lot's, where the water effects' hot spot is) and the downed cable at the fallen pole.
  ev: Object.freeze({ near: [-15.6, 39.6], period: 1.3, spread: 1.1, reach: 14, volume: .8 }),
  cable: Object.freeze({ x: -30.35, z: 29.75, period: 1.1, spread: .9, reach: 16, volume: 1 }),
  smoulder: Object.freeze({ x: 27.2, z: -4, near: 3, reach: 6 }),
  // The looping car alarm: the nearest sedan to `near` (the Boulevard's western jam).
  alarm: Object.freeze({ near: [-36, 4], cycle: 29, on: 22, near1: 12, reach: 20 }),
  // Hazards ticking when the signs list none: the cars nearest these.
  hazards: Object.freeze([[12, 9.5], [-11, -1], [40.7, 34.7]]),
  tarps: Object.freeze([[-12, -40.6], [-44.5, -30]]),
  // The screens that jingle: the flatiron prow, the Crossroads island, the Boulevard wall, the garage wall, the metro pillar.
  jingles: Object.freeze([{ x: 30.5, z: 13, period: 41, spread: 30 }, { x: 6, z: -4.6, period: 67, spread: 50 }, { x: 31.75, z: 7.85, period: 71, spread: 50 },
    { x: -35.35, z: 30.25, period: 73, spread: 50 }, { x: 26.5, z: 37.5, period: 79, spread: 55 }]),
  // The metro: the entrance, and the gratings the train is heard through.
  metro: Object.freeze({ entrance: [28.5, 46], gratings: Object.freeze([[26, 40], [22, 54], [38, 48]]) }),
  siren: Object.freeze({ period: 83, spread: 55 }),
  signBreakReach: 15,   // m: a sign or screen shot out is heard within this (the owner's rule), fading to nothing at it
  // The Stacks: the pipes dripping in the courtyard, the far TV; the market; Velvet Row's club.
  stacks: Object.freeze({ drip: [-45, -27], dripReach: 20, tv: [-46, -24], tvNear: 6, box: [-64, -36, -56, -10.5] }),
  market: Object.freeze({ box: [-24, -2, -60, -42] }),
  club: Object.freeze({ group: 'club', reach: 9 }),
  // Whistling where wind rushes through: the alley mouths (plus the junction corners, found from the roads).
  mouths: Object.freeze([[-24, -23.75], [-2, -23.75], [-42, 36], [-42, 48]]),
});

// How the sounds fall off with distance: full within `near`, then exp(-(d - near) / reach).
export const fadeAt = (d, near, reach) => d <= near ? 1 : Math.exp(-(d - near) / reach);
const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
const due = t => t === t; // (slotFire gives NaN when nothing falls in the window)
const PROP_CAR = /^city(Compact|Sedan|Suv|Taxi|Sports|Van|Truck|Wreck|Pileup)$/;

// --- The plan: the map's places, once, as flat data ----------------------------
export function soundPlan(map) {
  const plan = {
    lumen: map?.id === 'lumen', groups: [], groupIndex: new Map(), rooms: map?.buildings || [], doors: [], cars: [], shelters: [], vending: [], puddles: map?.city?.puddles || [],
    corners: [], gutters: [], crossings: [], sites: null,
  };
  // Buildings: one box each (their rooms' union), tall or low, and its doors.
  for (const r of plan.rooms) {
    if (!r.group) continue;
    const [x0, z0, x1, z1] = shapeBox(r);
    let g = plan.groupIndex.get(r.group);
    if (g === undefined) { g = plan.groups.length; plan.groupIndex.set(r.group, g); plan.groups.push({ id: r.group, x0, x1, z0, z1, tall: false, low: false, pitch: 47 + 20 * hash01(g, 9) }); }
    else { const b = plan.groups[g]; b.x0 = Math.min(b.x0, x0); b.x1 = Math.max(b.x1, x1); b.z0 = Math.min(b.z0, z0); b.z1 = Math.max(b.z1, z1); }
  }
  for (const spec of map?.cityBuildings || []) {
    const g = plan.groupIndex.get(spec.id); if (g === undefined) continue;
    plan.groups[g].tall = !!spec.tall; plan.groups[g].low = !spec.tall;
    for (const d of spec.doors || []) plan.doors.push({ x: d.at[0], z: d.at[1], group: g });
  }
  // The bus is a room and a metal roof: its drumming counts double.
  for (const p of map?.props || []) {
    if (PROP_CAR.test(p.type)) plan.cars.push({ x: p.x, z: p.z, w: p.type === 'cityTruck' ? 1.6 : 1, type: p.type });
    else if (p.type === 'cityShelter') plan.shelters.push({ x: p.x, z: p.z, w: 1 });
    else if (p.type === 'cityStall') plan.shelters.push({ x: p.x, z: p.z, w: .7 });
    else if (p.type === 'cityVending') plan.vending.push({ x: p.x, z: p.z });
  }
  const bus = plan.groupIndex.get('bus');
  if (bus !== undefined) { const b = plan.groups[bus]; plan.cars.push({ x: (b.x0 + b.x1) / 2, z: (b.z0 + b.z1) / 2, w: 2.2, type: 'bus' }); }
  for (const c of map?.city?.canopies || []) { const [x0, z0, x1, z1] = shapeBox(c); plan.shelters.push({ x: (x0 + x1) / 2, z: (z0 + z1) / 2, w: 1.2 }); }
  if (plan.lumen) lumenPlan(plan);
  return plan;
}

function lumenPlan(plan) {
  const S = LUMEN_SITES;
  // The wind whistles at every junction corner, the plaza's corners and the alley mouths.
  for (const j of intersections()) for (const [x, z] of [[j.x0, j.z0], [j.x1, j.z0], [j.x0, j.z1], [j.x1, j.z1]]) plan.corners.push([x, z]);
  const C = CROSSROADS; for (const [x, z] of [[C.x0, C.z0], [C.x1, C.z0], [C.x0, C.z1], [C.x1, C.z1]]) plan.corners.push([x, z]);
  for (const [x, z] of S.mouths) plan.corners.push([x, z]);
  // Gutters run along both kerbs of every straight road.
  for (const r of ROADS) if (r.axis !== 'diagonal') for (const s of [-1, 1]) plan.gutters.push({ axis: r.axis, at: r.centre + s * r.width / 2, from: r.from, to: r.to });
  const nearest = (list, [x, z]) => { let best = null, bd = Infinity; for (const c of list) { const d = Math.hypot(c.x - x, c.z - z); if (d < bd) { bd = d; best = c; } } return best; };
  const sedans = plan.cars.filter(c => c.type === 'citySedan'), compacts = plan.cars.filter(c => c.type === 'cityCompact');
  plan.sites = {
    alarm: nearest(sedans.length ? sedans : plan.cars, S.alarm.near),
    ev: nearest(compacts.length ? compacts : plan.cars, S.ev.near),
    hazards: S.hazards.map(p => nearest(plan.cars, p)).filter(Boolean),
  };
  const club = plan.groupIndex.get(S.club.group); plan.club = club === undefined ? -1 : club;
}

const boxDist = (x, z, x0, x1, z0, z1) => { const dx = x < x0 ? x0 - x : x > x1 ? x - x1 : 0, dz = z < z0 ? z0 - z : z > z1 ? z - z1 : 0; return Math.hypot(dx, dz); };
const groupDist = (x, z, g) => boxDist(x, z, g.x0, g.x1, g.z0, g.z1);

// The beds at (x, z): every field of `out` (newMix) set from where you stand and
// the weather. Pure and allocation-free (the tests and the ambience use it).
// `env`: { rain, wet, gust, sag, train, humDrop, clock }; `buzz`: sign buzz 0..1.
export function bedsAt(plan, x, z, env, out, buzz = .25) {
  const S = LUMEN_SITES;
  out.humDrop = env.humDrop; out.sag = env.sag; out.hum = 1; out.buzz = buzz;
  // Wind: stronger between the towers; the whistle at corners and alley mouths.
  let canyon = plan.lumen ? .3 : .15, low = 0, lowGroup = -1, eaves = 0;
  for (let i = 0; i < plan.groups.length; i++) {
    const g = plan.groups[i], d = groupDist(x, z, g);
    if (g.tall) canyon = Math.max(canyon, fadeAt(d, 4, 8));
    else { const h = fadeAt(d, 2.5, 6); if (h > low) { low = h; lowGroup = i; } eaves = Math.max(eaves, fadeAt(d, 1, 2.6)); }
  }
  let exposure = 0;
  for (let i = 0; i < plan.corners.length; i++) exposure = Math.max(exposure, fadeAt(Math.hypot(x - plan.corners[i][0], z - plan.corners[i][1]), 3, 9));
  const gust = env.gust;
  out.wind = (.5 + .5 * canyon) * (1 + 1.5 * gust); out.windHz = 300 + 320 * gust;
  out.whistle = exposure * (.25 + 1.1 * gust); out.whistleHz = 720 + 340 * gust + 50 * Math.sin(env.clock * .3);
  // Rain, soft and ambient, following the schedule with the gusts swelling it; the hiss of wet ground after.
  const rain = env.rain;
  out.rain = Math.pow(rain, .85) * (1 + .3 * gust); out.hiss = clamp01(.45 * rain + .55 * env.wet);
  // Drumming on the roofs of cars and the bus near you; patter on shelters, stalls, canopies and eaves.
  let cars = 0; for (let i = 0; i < plan.cars.length; i++) { const c = plan.cars[i]; cars += c.w * fadeAt(Math.hypot(x - c.x, z - c.z), 2.2, 3.2); }
  out.drum = rain * (1 - Math.exp(-cars * .9));
  let cover = eaves * .7; for (let i = 0; i < plan.shelters.length; i++) { const s = plan.shelters[i]; cover = Math.max(cover, s.w * fadeAt(Math.hypot(x - s.x, z - s.z), 1.5, 3.5)); }
  out.patter = rain * clamp01(cover);
  // Gutters run after rain: along the kerbs, louder wet.
  let gutter = 0;
  for (let i = 0; i < plan.gutters.length; i++) {
    const k = plan.gutters[i], along = k.axis === 'x' ? x : z, across = k.axis === 'x' ? z : x;
    if (along < k.from || along > k.to) continue;
    gutter = Math.max(gutter, fadeAt(Math.abs(across - k.at), .9, 2.2));
  }
  out.gutter = gutter * env.wet * (.4 + .6 * rain);
  // Rooftop drones by low buildings (each its own pitch).
  out.hvac = low; out.hvacHz = lowGroup >= 0 ? plan.groups[lowGroup].pitch : 52;
  out.market = 0; out.tv = 0; out.club = 0; out.clubIn = 0; out.vending = 0; out.train = 0; out.steam = 0; out.smoulder = 0; out.alarm = 0; out.alarmPattern = 0;
  if (plan.lumen) {
    const M = S.market.box; out.market = fadeAt(boxDist(x, z, M[0], M[1], M[2], M[3]), 0, 8);
    const T = S.stacks; out.tv = fadeAt(Math.hypot(x - T.tv[0], z - T.tv[1]), T.tvNear, 8) * .9;
    if (plan.club >= 0) out.club = fadeAt(groupDist(x, z, plan.groups[plan.club]), 0, S.club.reach);
    // The train, felt through the gratings and the metro's mouth, faintly anywhere.
    let near = fadeAt(Math.hypot(x - S.metro.entrance[0], z - S.metro.entrance[1]), 4, 12);
    for (const [gx, gz] of S.metro.gratings) near = Math.max(near, fadeAt(Math.hypot(x - gx, z - gz), 2.5, 9));
    out.train = env.train * (.14 + .86 * near);
    // The smouldering pileup: hot metal, hissing more in rain.
    out.smoulder = fadeAt(Math.hypot(x - S.smoulder.x, z - S.smoulder.z), S.smoulder.near, S.smoulder.reach) * (.7 + .8 * rain);
    const A = plan.sites.alarm;
    if (A) {
      const ph = ((env.clock % S.alarm.cycle) + S.alarm.cycle) % S.alarm.cycle;
      if (ph < S.alarm.on) { out.alarm = fadeAt(Math.hypot(x - A.x, z - A.z), S.alarm.near1, S.alarm.reach); out.alarmPattern = ph < 8 ? 0 : ph < 15 ? 1 : 2; }
    }
  }
  for (let i = 0; i < plan.vending.length; i++) out.vending = Math.max(out.vending, fadeAt(Math.hypot(x - plan.vending[i].x, z - plan.vending[i].z), .8, 3.2));
  return out;
}

// --- Sign buzz: stronger near neon, screens and lamps ---------------------------
const BUZZ_WEIGHT = Object.freeze({ neon: 1, screen: .7, panel: .5, lamp: .3 });
export function buzzOf(list, count, x, z) {
  // list: Float32Array of [x, z, weight] triples
  let sum = 0;
  for (let i = 0; i < count; i++) {
    const dx = list[i * 3] - x, dz = list[i * 3 + 1] - z, d2 = dx * dx + dz * dz;
    if (d2 > 225) continue;
    sum += list[i * 3 + 2] * Math.exp(-Math.sqrt(d2) / 5);
  }
  return 1 - Math.exp(-sum * .55);
}

// A pedestrian signal's state at `clock`: 2 walk, 1 flashing, 0 stop. The same
// cycle as city-signs.js trafficPhase (the test checks them against each other),
// without the object it returns.
export function walkState(clock, phaseOffset, group) {
  const T = TRAFFIC, c = (((clock + phaseOffset + group * T.cycle / 2) % T.cycle) + T.cycle) % T.cycle;
  return c < T.walk ? 2 : c < T.green ? 1 : 0;
}

// --- The system ------------------------------------------------------------------
export class LumenAmbience {
  constructor(view, map, city) {
    this.view = view; this.map = map; this.city = city; this.plan = soundPlan(map);
    this.voice = null; this.sound = null; this.quality = 'balanced';
    this.env = { rain: 0, wet: 0, gust: 0, sag: 0, train: 0, humDrop: 1, clock: 0 };
    this.mixed = newMix(); this.mixIn = 0;
    this.prevClock = NaN; this.sagWas = 0; this.room = null; this.groupNow = -1; this.door = 0; this.roomStamp = -9;
    this.x = 0; this.z = 0; this.point = { x: 0, z: 0 };
    // Things found from the emitters once they exist: sign buzz, crossings, hazards.
    this.emitterCount = -1; this.buzzList = new Float32Array(0); this.buzzCount = 0; this.peds = []; this.pedIdx = null; this.hazards = []; this.hazardIdx = null;
    this.vents = LUMEN_VENTS; this.ventOut = {}; this.ventLevel = 0;
    this.hazardK = new Int32Array(8); this.wiredSigns = null; this.wiredLife = null; this.wiredWater = null;
    this.nextDrip = 0; this.nextPlink = 0; this.nextPipe = 0; this.tarpK = new Int32Array(2); this.clackK = 0;
    this.life = newLifeMix(); this.nextBlup = 0; this.nextBalls = 0; this.nextTune = 0; this.arcade = 0; // (stage 5: lifeTick)
  }

  setQuality(name) { this.quality = name; this.voice?.setQuality(name); }

  // Given the Soundscape (main.js, once): its LumenSound is `sound.lumen`, built
  // by audio.js start() (there is no audio before a gesture).
  attach(sound) {
    if (!sound || this.voice) return this.voice;
    this.sound = sound; this.voice = sound.lumen = new LumenSound(sound, { map: this.map, quality: this.view?.qualityName || this.quality });
    if (sound.context) this.voice.start(sound);
    return this.voice;
  }

  // --- The public API (the life system, the water effects, the vents) ---------
  levelAt(x, z, carry = 1) { return hearingLevel(Math.hypot(x - this.x, z - this.z) / carry); }
  pigeon(kind, x, y, z, n = 1) { const v = this.voice; if (v) v.pigeon(kind, this.levelAt(x, z), n); }
  rat(kind, x, z) { const v = this.voice; if (v) v.rat(kind, fadeAt(Math.hypot(x - this.x, z - this.z), 2, 4.5)); }
  water(kind, x, z, strength = 1) { const v = this.voice; if (v) v.water(kind, this.levelAt(x, z), strength); }
  // The hub's world events: a round or blast meeting wet ground, a body falling into it.
  onImpact(x, z, kind = 'round') {
    const v = this.voice; if (!v || this.env.wet < .3) return;
    const level = this.levelAt(x, z); if (level < HEARING.silent) return;
    if (kind === 'blast') v.water('splash', level, 1.6); else v.plink(level, .35);
  }
  // Your footfall (the hub's step event): wet ground and puddles splash under it; indoors and on dry ground nothing is added. Other people's steps are not sounded (that would give them away through walls).
  onStep(x, z, speed = 1, strong = false) {
    const v = this.voice; if (!v || !this.mixed.stepMode) return;
    if (Math.abs(x - this.x) > 1.2 || Math.abs(z - this.z) > 1.2) return;
    v.wetStep(this.mixed.stepMode, strong);
  }
  onFall(x, z) { const v = this.voice; if (v && this.env.wet > .3) v.water('splash', this.levelAt(x, z), 1.2); }
  // A sign or screen shot out (signs.onBreak(x, z, piece)): heard within 15 m (full to 6 m, fading to nothing at 15).
  signBreak(x, z, piece) {
    const v = this.voice; if (!v) return;
    const d = Math.hypot(x - this.x, z - this.z); if (d >= LUMEN_SITES.signBreakReach) return;
    v.signBreak(fadeAt(d, 6, 6) * clamp01((LUMEN_SITES.signBreakReach - d) / 4), piece?.kind === 'screen');
  }
  // A sign sparking by itself (signs.onSpark(x, y, z)).
  signSpark(x, y, z) {
    const v = this.voice; if (!v) return;
    const d = Math.hypot(x - this.x, z - this.z); if (d > 22) return;
    v.sparks(fadeAt(d, 5, 6) * .7, this.env.wet, this.groupNow >= 0);
  }
  // The steam vents' schedule (maps/lumen-vents.js): replace to test or to add vents.
  setVents(list) { this.vents = list; }

  // --- Each frame -----------------------------------------------------------------
  update(frame) {
    const clock = frame.clock ?? 0, env = this.env;
    if (!Number.isFinite(clock)) return;
    const p = frame.player || frame.sim?.player; if (!p) return;
    this.x = p.x; this.z = p.z;
    const prev = this.prevClock; this.prevClock = clock;
    // (The first frame, a pause and a seek are not "time passing": no catching up on events.)
    const passing = prev <= clock && clock - prev < 1.5;
    const v = this.voice; if (v) { v.last.x = p.x; v.last.z = p.z; }
    const sag = sagAt(clock);
    if (v?.live && passing) {
      if (this.sagWas < .05 && sag >= .05) v.sagDown();
      else if (this.sagWas >= .05 && sag < .05) v.sagBack();
    }
    this.sagWas = sag; env.sag = sag;
    if (!v?.live) { this.mixIn = 0; return; }
    if ((this.mixIn -= frame.dt || 0) <= 0) { this.mixIn = .1; this.tick(frame, clock, p); }
    if (passing) this.fire(prev, clock, p);
  }

  // The beds, ten times a second.
  tick(frame, clock, p) {
    const env = this.env, v = this.voice, m = this.mixed, x = p.x, z = p.z;
    if (this.city && this.city.emitters?.length !== this.emitterCount) this.scanEmitters();
    if (this.city?.signs && this.city.signs !== this.wiredSigns) this.wireSigns(this.city.signs);
    if (this.city?.life && this.city.life !== this.wiredLife) this.wireLife(this.city.life);
    if (this.city?.water && this.city.water !== this.wiredWater) this.wireWater(this.city.water);
    env.clock = clock; env.rain = rainAt(clock); env.wet = wetnessAt(clock); env.gust = gustAt(clock); env.train = trainAt(clock); env.humDrop = humAt(clock);
    v.wetness = env.wet;
    const buzz = this.buzzCount ? Math.max(.12, buzzOf(this.buzzList, this.buzzCount, x, z)) : .3;
    bedsAt(this.plan, x, z, env, m, buzz);
    // Steam hissing from the vents that are venting.
    let steam = 0;
    const vents = this.city?.vents?.vents || this.vents;
    if (this.plan.lumen && vents) for (let i = 0; i < vents.length; i++) {
      const s = ventState(clock, i, vents.length, this.ventOut); if (s.hiss <= 0) continue;
      steam = Math.max(steam, s.hiss * fadeAt(Math.hypot(x - vents[i].x, z - vents[i].z), 2.5, 6));
    }
    m.steam = steam;
    // Indoors: your room's own tone; the city and the rain muffled through the walls, more where a door is near.
    this.locate(x, z);
    const inside = this.room !== null;
    m.muffle = inside ? 1 : 0; m.door = inside ? this.door : 0; m.room = inside ? 1 : 0;
    if (inside) {
      m.roomKind = roomKindOf(this.room.group, this.room.room);
      const g = this.plan.groups[this.groupNow];
      if (this.plan.lumen && g && g.id === LUMEN_SITES.club.group) { m.clubIn = 1; m.club *= .5; }
    }
    // Your footsteps: wet ground, or through a puddle, outdoors only.
    m.stepMode = inside ? 0 : this.inPuddle(x, z) ? 2 : env.wet > .3 ? 1 : 0;
    v.mix(m, clock);
    this.slow(clock, x, z, inside);
    this.lifeTick(clock, x, z, inside);
  }

  // The room you are in (the map's room list), and how near an outer door.
  locate(x, z) {
    let room = this.room; const pt = this.point; pt.x = x; pt.z = z;
    if (room && !buildingContains(room, pt)) room = null;
    if (!room) { const list = this.plan.rooms; for (let i = 0; i < list.length; i++) if (buildingContains(list[i], pt)) { room = list[i]; break; } }
    this.room = room; this.groupNow = room ? this.plan.groupIndex.get(room.group) ?? -1 : -1;
    if (!room) { this.door = 0; return; }
    const M = LUMEN_SOUND.muffle; let best = Infinity;
    for (const d of this.plan.doors) if (d.group === this.groupNow) best = Math.min(best, Math.hypot(d.x - x, d.z - z));
    this.door = best === Infinity ? 0 : clamp01(1 - (best - M.doorNear) / (M.doorFar - M.doorNear));
  }

  inPuddle(x, z) {
    for (const q of this.plan.puddles) {
      const dx = x - q.x, dz = z - q.z; if (dx * dx + dz * dz > 9) continue;
      const c = Math.cos(q.angle || 0), s = Math.sin(q.angle || 0), u = (dx * c + dz * s) / q.rx, w = (-dx * s + dz * c) / q.rz;
      if (u * u + w * w < 1) return true;
    }
    return false;
  }

  // The lists that come from the signs' emitters (once they exist, again if they change).
  scanEmitters() {
    const list = this.city?.emitters || []; this.emitterCount = list.length;
    let n = 0; for (const e of list) if (BUZZ_WEIGHT[e.kind]) n++;
    this.buzzList = new Float32Array(n * 3); this.buzzCount = n; let k = 0;
    this.peds.length = 0; this.hazards.length = 0;
    for (const e of list) {
      const w = BUZZ_WEIGHT[e.kind];
      if (w) { this.buzzList[k * 3] = e.x; this.buzzList[k * 3 + 1] = e.z; this.buzzList[k * 3 + 2] = w * Math.min(1, (e.intensity || 1) / 2); k++; }
      const s = e.source;
      if (e.kind === 'ped' && s && s[0] === 2) { const state = Math.floor(s[3] / 4); if (state === 0) this.peds.push({ x: e.x, z: e.z, phaseOffset: s[2], group: s[3] - state * 4, idx: -1 }); }
      else if (s && s[0] === 2 && s[1] === 5) { const state = Math.floor(s[3] / 4); if (state === 0) this.hazards.push({ x: e.x, z: e.z, phaseOffset: s[2], idx: -1 }); }
    }
  }

  wireSigns(signs) {
    this.wiredSigns = signs;
    const brk = signs.onBreak, spark = signs.onSpark;
    signs.onBreak = (x, z, piece) => { brk?.(x, z, piece); this.signBreak(x, z, piece); };
    signs.onSpark = (x, y, z) => { spark?.(x, y, z); this.signSpark(x, y, z); };
  }

  // The pigeons and rats (effects/lumen-life.js: onFlock(x, z, n), onCoo(x, z), onSqueak(x, z)).
  wireLife(life) {
    this.wiredLife = life;
    const flock = life.onFlock, coo = life.onCoo, squeak = life.onSqueak;
    life.onFlock = (x, z, n) => { flock?.(x, z, n); this.pigeon('flap', x, 0, z, n); };
    life.onCoo = (x, z) => { coo?.(x, z); this.pigeon('coo', x, 0, z, 1); };
    life.onSqueak = (x, z) => { squeak?.(x, z); this.rat('bolt', x, z); };
  }
  // The water effects' sounds (effects/lumen-water.js): onSound(kind, x, z, strength), the kinds LumenSound.water plays.
  wireWater(water) {
    this.wiredWater = water; const was = water.onSound;
    water.onSound = (kind, x, z, strength) => { was?.(kind, x, z, strength); this.water(kind, x, z, strength); };
  }

  // Slower, random-timed sounds (drips, plinks, pipes) at the beds' tick.
  slow(clock, x, z, inside) {
    const v = this.voice, env = this.env, S = LUMEN_SITES;
    const step = .1;
    // Drips off awnings and edges: after the rain, and a little during it.
    this.nextDrip -= step;
    if (this.nextDrip <= 0 && !inside) {
      const rate = env.wet * (1 - env.rain) * 1.1 + env.rain * .25;
      this.nextDrip = rate > .02 ? (.4 + Math.random() * 1.2) / rate : .6;
      if (rate > .02) v.drip(.35 + Math.random() * .45, false);
    }
    // Puddles taking drops: plinks while it rains, from the puddles near you.
    this.nextPlink -= step;
    if (this.nextPlink <= 0) {
      this.nextPlink = env.rain > .05 ? (.25 + Math.random() * .6) / env.rain : .8;
      if (env.rain > .05 && !inside) for (const q of this.plan.puddles) { const d = Math.hypot(q.x - x, q.z - z); if (d < 12) { v.plink(fadeAt(d, 3, 5) * .8, .25); break; } }
    }
    // The Stacks' pipes: a drip now and again, ringing, heard across the courtyard.
    this.nextPipe -= step;
    if (this.nextPipe <= 0 && this.plan.lumen) {
      this.nextPipe = 1.2 + Math.random() * 2.8;
      const d = Math.hypot(x - S.stacks.drip[0], z - S.stacks.drip[1]);
      if (d < S.stacks.dripReach) v.drip(fadeAt(d, 3, 7) * .9, true, inside && this.plan.groups[this.groupNow]?.id === 'stacks-main');
    }
  }

  // The placed one-shots that fall due between the last frame and this one.
  fire(prev, clock, p) {
    const v = this.voice, plan = this.plan, S = LUMEN_SITES, env = this.env, x = p.x, z = p.z;
    // Thunder: the strike's sound arrives after its delay; heard everywhere (between the towers), louder for a strong one.
    const cycle = rainCycle(clock), start = clock - rainPhase(clock);
    for (let k = 0; k < THUNDER.perCycle; k++) {
      const t = start + strikeTime(cycle, k) + strikeDelay(cycle, k);
      if (t > prev && t <= clock) { const power = strikePower(cycle, k); v.thunder(.5 + .5 * power, power); }
    }
    // The train's wheels on the rail, while it passes.
    if (env.train > .25) {
      const idx = Math.floor(clock * 6.5), near = Math.max(fadeAt(Math.hypot(x - S.metro.entrance[0], z - S.metro.entrance[1]), 4, 14), .1);
      if (idx !== this.clackK) { this.clackK = idx; v.clack(env.train * near); }
    }
    // A siren far away, never coming closer.
    const siren = slotFire(90, prev, clock, S.siren.period, S.siren.spread);
    if (due(siren)) v.siren(.6 + .4 * hash01(91, Math.floor(siren)));
    this.glitches(prev, clock, x, z);
    if (!plan.lumen) return;
    const groupId = this.groupNow >= 0 ? plan.groups[this.groupNow].id : '';
    // The convenience store's door chime, on and on.
    const c = S.chime;
    if (due(slotFire(1, prev, clock, c.period, c.spread))) {
      const d = Math.hypot(x - c.x, z - c.z);
      if (d < 40) v.chime(fadeAt(d, 5, c.reach), groupId === c.group);
    }
    // The bus doors, opening and (a few seconds on) shutting.
    this.busDoorAt(true, 0, prev, clock, x, z);
    this.busDoorAt(false, S.bus.open, prev, clock, x, z);
    // A phone ringing in the pharmacy, unanswered.
    const ph = S.phone;
    if (due(slotFire(20, prev, clock, ph.period, ph.spread))) {
      const d = Math.hypot(x - ph.x, z - ph.z), sameRoom = groupId === ph.group;
      if (d < 50) v.phone(fadeAt(d, 6, ph.reach) * (sameRoom || d < 4 ? 1 : .55), sameRoom);
    }
    // Sparks at the EV and the downed cable (sizzling in the wet).
    this.sparkAt(10, plan.sites.ev, S.ev, prev, clock, x, z);
    this.sparkAt(11, S.cable, S.cable, prev, clock, x, z);
    // Jingles off the screens (a torn frame's worth), echoing between the towers.
    for (let i = 0; i < S.jingles.length; i++) {
      const j = S.jingles[i], t = slotFire(40 + i, prev, clock, j.period, j.spread); if (!due(t)) continue;
      const d = Math.hypot(x - j.x, z - j.z); if (d < 60) v.jingle(fadeAt(d, 8, 16) * (i === 0 ? 1 : .75), Math.floor(t) + i * 977, false);
    }
    // The tarps flapping loose in the gusts.
    if (env.gust > .18) for (let i = 0; i < S.tarps.length; i++) {
      const t = slotFire(30 + i, prev, clock, 1.1, .9); if (!due(t)) continue;
      const d = Math.hypot(x - S.tarps[i][0], z - S.tarps[i][1]); if (d < 32) v.flap(fadeAt(d, 4, 9), env.gust);
    }
    this.signals(clock, x, z);
  }

  sparkAt(site, at, k, prev, clock, x, z) {
    if (!at || !due(slotFire(site, prev, clock, k.period, k.spread))) return;
    const d = Math.hypot(x - at.x, z - at.z); if (d < 40) this.voice.sparks(fadeAt(d, 4, k.reach / 2) * k.volume, this.env.wet, false);
  }
  busDoorAt(open, delay, prev, clock, x, z) {
    const B = LUMEN_SITES.bus; if (!due(slotFire(2, prev - delay, clock - delay, B.period, B.spread))) return;
    let d = Infinity; for (let i = 0; i < LUMEN_SITES.busDoors.length; i++) d = Math.min(d, Math.hypot(x - LUMEN_SITES.busDoors[i][0], z - LUMEN_SITES.busDoors[i][1]));
    if (d < 40) this.voice.busDoor(fadeAt(d, 6, B.reach), open);
  }

  // Ticking hazard lights and the crossings' chirps: edges of their own cycles.
  signals(clock, x, z) {
    const v = this.voice, T = TRAFFIC;
    for (const h of this.hazards) {
      const d = Math.hypot(x - h.x, z - h.z); if (d > 22) continue;
      const idx = Math.floor(2 * (clock + h.phaseOffset) / T.hazard);
      if (idx !== h.idx) { const first = h.idx < 0; h.idx = idx; if (!first) v.tick(fadeAt(d, 3, 6), idx % 2 === 0); }
    }
    if (!this.hazards.length && this.plan.sites) for (let i = 0; i < this.plan.sites.hazards.length; i++) {
      const c = this.plan.sites.hazards[i], d = Math.hypot(x - c.x, z - c.z); if (d > 22) continue;
      const idx = Math.floor(2 * (clock + i * .13) / T.hazard);
      if (idx !== this.hazardK[i]) { this.hazardK[i] = idx; v.tick(fadeAt(d, 3, 6), idx % 2 === 0); }
    }
    for (const s of this.peds) {
      const d = Math.hypot(x - s.x, z - s.z); if (d > 26) continue;
      const w = walkState(clock, s.phaseOffset, s.group); if (!w) { s.idx = -1; continue; }
      const idx = Math.floor(clock * (w === 2 ? 2.4 : 5)) * 4 + w;
      if (idx !== s.idx) { const first = s.idx < 0; s.idx = idx; if (!first) v.chirp(fadeAt(d, 3, 8), w === 2); }
    }
  }

  // --- Stage 5: the life in the lights and the interiors --------------------------
  // The beds (ten a second): the nearest shown hologram's hum, the insects at a
  // lamp with moths (from Balanced up, where they are drawn), and the machines
  // of the interior you are in (faint through the walls from beside one); then
  // the random one-shots that go with them (a pot's bubbles, pachinko balls,
  // an attract tune). What is where comes from the systems themselves:
  // city.holograms (its holograms and how shown each is), city.lightLife (the
  // swarms' sites), city.interiorLife (its `sounds`).
  lifeTick(clock, x, z, inside) {
    const v = this.voice, l = this.life, city = this.city;
    let holo = 0, hz = 172;
    const H = city?.holograms;
    if (H) for (let n = 0; n < H.count; n++) {
      const o = H.holos[n]; if (!(o.vis > 0)) continue;
      const k = fadeAt(Math.hypot(x - o.x, (o.y - 1.5) * .6, z - o.z), 5, 5) * o.vis;
      if (k > holo) { holo = k; hz = 150 + 40 * ((n * .37) % 1); }
    }
    l.holo = inside ? holo * .3 : holo; l.holoHz = hz;
    let insects = 0;
    const LL = city?.lightLife;
    if (LL?.on && LL.counts?.moths && !inside) { const s = LL.sites; for (let i = 0; i < s.length; i += 2) { const dx = x - s[i], dz = z - s[i + 1], d2 = dx * dx + dz * dz; if (d2 < 36) insects = Math.max(insects, fadeAt(Math.sqrt(d2), 1.2, 2.5)); } }
    l.insects = insects;
    l.simmer = 0; l.tv = 0; l.washer = 0; l.compressor = 0; l.pachinko = 0; l.servers = 0; let arcade = 0;
    const list = city?.interiorLife?.sounds, group = this.groupNow >= 0 ? this.plan.groups[this.groupNow].id : '';
    if (list) for (let i = 0; i < list.length; i++) {
      const s = list[i], same = s.group === group, d = Math.hypot(x - s.x, z - s.z);
      if (!same && d > 12) continue;
      const k = same ? fadeAt(d, 2, 5) : fadeAt(d, 0, 2.5) * .15, kind = s.kind;
      if (kind === 'simmer') l.simmer = Math.max(l.simmer, k); else if (kind === 'tv') l.tv = Math.max(l.tv, k); else if (kind === 'washer') l.washer = Math.max(l.washer, k);
      else if (kind === 'compressor') l.compressor = Math.max(l.compressor, k); else if (kind === 'pachinko') l.pachinko = Math.max(l.pachinko, k); else if (kind === 'servers') l.servers = Math.max(l.servers, k);
      else if (kind === 'arcade') arcade = Math.max(arcade, k);
    }
    l.compressor *= compressorAt(clock);
    this.arcade = arcade;
    v.lifeMix?.(l);
    const step = .1;
    if ((this.nextBlup -= step) <= 0) { this.nextBlup = .35 + Math.random() * 1.2; if (l.simmer > .05) v.blup?.(l.simmer * (.5 + Math.random() * .5), inside); }
    if ((this.nextBalls -= step) <= 0) { this.nextBalls = .35 + Math.random() * .8; if (l.pachinko > .05) v.pachinkoBalls?.(l.pachinko, inside); }
    if ((this.nextTune -= step) <= 0) { this.nextTune = 4 + Math.random() * 5; if (arcade > .08) v.arcadeTune?.(arcade, Math.floor(clock * 7) + 13, inside); }
  }
  // A hologram glitching (effects/lumen-holograms.js: the same events) crackles within 30 m.
  glitches(prev, clock, x, z) {
    const H = this.city?.holograms, G = HOLOGRAMS.glitch; if (!H) return;
    for (let n = 0; n < H.count; n++) {
      const o = H.holos[n]; if (!(o.vis > .2)) continue;
      if (!due(slotFire(G.site + n, prev, clock, G.period, G.spread))) continue;
      const d = Math.hypot(x - o.x, (o.y - 1.5) * .6, z - o.z);
      if (d < 30) this.voice.holoGlitch?.(fadeAt(d, 4, 6) * o.vis);
    }
  }

  // Never a leftover voice across a match reset.
  reset() { this.voice?.reset(); this.prevClock = NaN; }
  dispose() { const s = this.wiredSigns; if (s) { s.onBreak = null; s.onSpark = null; } if (this.wiredLife) this.wiredLife.onFlock = this.wiredLife.onCoo = this.wiredLife.onSqueak = null; if (this.wiredWater) this.wiredWater.onSound = null; if (this.sound && this.sound.lumen === this.voice) this.sound.lumen = null; }
}

// main.js: `lumenAmbience(map, view, sound)`, once after the view is made.
// Null (and nothing else happens) on a map without the city block.
export function lumenAmbience(map, view, sound) {
  if (!hasLumenSound(map)) return null;
  const system = view?.city?.sound; if (!system) return null;
  system.attach(sound);
  return system;
}

registerCitySystem('sound', (view, map, city) => hasLumenSound(map) ? new LumenAmbience(view, map, city) : null);
