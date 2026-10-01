// Lumen's city systems in one place (AGENTS.md > Lumen): the tall shells and
// their cut (city-shells.js, world/city-cut.js), rain and wet ground
// (effects/rain.js, render/wet-ground.js), the wet mirror (ground-mirror.js),
// the sign, screen and traffic-light materials (city-signs.js) and the fixed
// pool of real lights (light-pool.js).
//
// Built only for a map with a `city` block; every other map never makes one,
// so nothing here can change them. The view calls four hooks:
//   constructor (after the buildings are made), setQuality(name) (before the
//   warm-up), update(sim, dt, elapsed) (each frame, after the camera moves),
//   beforeRender() (drawFrame, before the scene is drawn: the mirror pass),
// and the warm-up calls warm() inside its one-pixel draw.
//
// Shared state lives in `uniforms` (one object, handed to every material that
// needs it, so a value set here reaches every shader at once, no recompile):
//   time          seconds (view.effectTime)
//   wetness       0 dry .. 1 soaked (rain.js, from the weather clock)
//   rain          0 .. 1 how hard it is raining now
//   sag           0 .. 1 the power sag (signs and screens dim)
//   puddleMask    R8 texture over maskBounds: 1 where water stands (never dries)
//   roofMask      R8 texture over maskBounds: 1 under a roof or canopy (no rain)
//   maskBounds    vec4 (x0, z0, x1, z1) the masks cover
//   mirrorMap     the mirror pass's texture (ground-mirror.js), or null
//   mirrorMatrix  world -> mirror texture coordinates (projective)
//   mirrorStrength 0 none (Potato..Balanced) .. 1
//   cutEye, cutTargets, cutRadii  the cut's scoop capsules (world/city-cut.js)
//   cutTexture    the cut table: row 0 per building slot (cut, open, first
//                 floor, top), row 1 its eligibility for each scoop capsule,
//                 row 2 (x) the height the scoop lowers it to
// `emitters` is every bright light source in the city ({ x, y, z, colour,
// intensity, reach, id, kind }): the signs register them, the light pool and
// the mirror's streak cards read them.
import * as THREE from 'three';
import { CityShells, SHELLS } from './city-shells.js';
import { buildCityGround } from '../world/city-ground.js';
import { buildBarricades } from '../world/city-barricades.js';
import { CITY_SYSTEMS } from './city-registry.js';


// How a city map's ground effects and players read (owner, 2026-09-29;
// design 12). The renderer takes these for any map with a `city` block; a
// map overrides any part through its own `look` (map.look.dust with a
// `colour`, map.look.footprint, map.look.readable). Other maps never see it.
//   dust       what walking, dashing and shots kick up: grey grit on dry
//              asphalt, a paler, finer, shorter-lived spray while the ground
//              is wet (no sand haze then), mixed by the wetness where it is
//              kicked (never wet under a roof)
//   footprint  dark wet marks that fade over `life` seconds while wet and
//              hardly show dry (`dry` of the wet strength)
//   readable   base rings a touch emissive (colour x ring, opacity x
//              ringOpacity), blood's thin brighter wet rim, enemy Static orbs'
//              brighter rim (aura colour and opacity, core glow)
export const CITY_LOOK = Object.freeze({
  dust: Object.freeze({ colour: '#5b606a', wet: '#a3abb7', wetLife: .5, wetCount: .7, haze: .5 }),
  footprint: Object.freeze({ colour: '#16181d', opacity: .4, dry: .14, life: 4 }),
  readable: Object.freeze({ ring: 1.35, ringOpacity: 1.3, bloodRim: '#c23a48', orbRim: '#6c98ff', orbRimOpacity: .24, orbGlow: 1.7 }),
});
// The ground-effects look for a map: null for every map without a city
// (their dust and prints stay exactly as they were).
export function cityLook(map) {
  if (!map?.city) return null;
  const look = map.look || {}, pick = (key, base) => Object.freeze({ ...base, ...(look[key]?.colour || key !== 'dust' ? look[key] : null) });
  return Object.freeze({ dust: pick('dust', CITY_LOOK.dust), footprint: pick('footprint', CITY_LOOK.footprint), readable: look.readable === false ? null : pick('readable', CITY_LOOK.readable) });
}

export class CityFeatures {
  constructor(view, map) {
    this.view = view; this.map = map; this.emitters = [];
    this.uniforms = {
      time: { value: 0 }, wetness: { value: 0 }, rain: { value: 0 }, sag: { value: 0 },
      puddleMask: { value: null }, roofMask: { value: null }, maskBounds: { value: new THREE.Vector4(-1, -1, 1, 1) },
      mirrorMap: { value: null }, mirrorMatrix: { value: new THREE.Matrix4() }, mirrorStrength: { value: 0 }, mirrorSrgb: { value: 0 },
      // The cut's scoop (world/city-cut.js SCOOP_GLSL; the shells set them each frame).
      cutEye: { value: new Float32Array(4) }, cutTargets: { value: new Float32Array(16) }, cutRadii: { value: new Float32Array(16) },
    };
    // The cut table as a texture (one texel per building slot: cut, open,
    // first-floor height, top), for shaders that are not the shells' own.
    // Row 1: each building's eligibility for the 4 scoop capsules; row 2: the
    // height the scoop lowers it to (world/city-cut.js).
    this.cutTexture = new THREE.DataTexture(new Float32Array(SHELLS.slots * 12), SHELLS.slots, 3, THREE.RGBAFormat, THREE.FloatType);
    this.cutTexture.magFilter = this.cutTexture.minFilter = THREE.NearestFilter; this.cutTexture.needsUpdate = true;
    this.uniforms.cutTexture = { value: this.cutTexture };
    this.systems = [];
    this.shells = new CityShells(view, map, this); this.systems.push(this.shells);
    this.loadOptional();
    // The facade wash: every emitter the systems added, baked into the
    // shells' walls once (render/city-shells.js bakeLight).
    this.shells.bakeLight(this.emitters);
    // The ground reads the masks and uniforms the systems above set up.
    this.ground = buildCityGround(view, map, this); this.systems.push(this.ground);
    // The road-end barricades, into the view's static scenery (merged with it).
    buildBarricades(view, map);
  }

  // The systems built in their own files. Each is { setQuality?(name),
  // update?(frame), beforeRender?(renderer, scene, camera), warm?(renderer),
  // dispose?() }. Made synchronously from the static imports below.
  loadOptional() {
    const c = this.map.city || {};
    for (const [flag, make] of CITY_SYSTEMS) if (c[flag] !== false && make) { const s = make(this.view, this.map, this); if (s) { this[flag] = s; this.systems.push(s); } }
  }

  setQuality(name) { this.quality = name; for (const s of this.systems) s.setQuality?.(name); }

  // The weather clock: the match's own clock, the same for the host and every
  // joiner (Simulation.worldTime: sim.worldClock when the session sets it,
  // main.js, from the host's tick), else the sim's time.
  clock(sim) { return sim?.worldTime?.() ?? sim?.worldClock ?? sim?.time ?? 0; }

  update(sim, dt, elapsed) {
    this.uniforms.time.value = elapsed;
    const view = this.view, frame = this.frame ||= { sim: null, dt: 0, elapsed: 0, clock: 0, camera: view.camera, focus: view.focus, player: null, others: [] };
    frame.sim = sim; frame.dt = dt; frame.elapsed = elapsed; frame.clock = this.clock(sim); frame.player = view.player?.position;
    // Everyone else you can see (the cut keeps them in view).
    frame.others.length = 0;
    const avatars = view.remote?.avatars;
    // (forEach with one cached callback: for..of over a Map makes an iterator every frame.)
    if (avatars) avatars.forEach(this.collectOther ||= a => { if (a.root?.visible && a.root.parent) this.frame.others.push(a.root.position); });
    for (const s of this.systems) s.update?.(frame);
  }

  beforeRender() { const { renderer, scene, camera } = this.view; for (const s of this.systems) s.beforeRender?.(renderer, scene, camera); }
  // How wet the ground is at a point, 0..1: the rain's wetness, none under a
  // roof (rooms stay dry), standing water in a puddle between showers.
  wetAt(x, z) {
    const rain = this.rain, wet = this.uniforms.wetness.value;
    if (!rain?.roofAt) return wet;
    if (rain.roofAt(x, z) >= .5) return 0;
    return Math.max(wet, rain.puddleAt(x, z) * (.75 + .25 * wet));
  }
  warm(renderer) { for (const s of this.systems) s.warm?.(renderer); }
  // Register a bright emitter (city-signs.js and friends).
  addEmitter(e) { e.id ??= this.emitters.length; this.emitters.push(e); return e; }

  // World events for the city's systems (stage 3): the view and the effects
  // call these; each system that wants one implements `on<Name>`. Plain
  // numbers only (no objects made per call). Contract:
  //   step(x, z, speed, strong)      a footfall (strong: a dodge or dash landing); yours at every
  //                                  stride, indoors too (read the roof mask), others' outdoors
  //   impact(x, z, kind)             a round or blast meeting the ground (kind: 'round' | 'blast';
  //                                  'wall': a round stopped by a wall or cover, at its foot)
  //   blood(x, z, amount)            blood reaching the ground (amount 0-1)
  //   fall(x, z)                     a body falling
  //   casing(x, z)                   a spent casing landing
  step(x, z, speed = 1, strong = false) { for (const s of this.systems) s.onStep?.(x, z, speed, strong); }
  impact(x, z, kind = 'round') { for (const s of this.systems) s.onImpact?.(x, z, kind); }
  blood(x, z, amount = .5) { for (const s of this.systems) s.onBlood?.(x, z, amount); }
  fall(x, z) { for (const s of this.systems) s.onFall?.(x, z); }
  casing(x, z) { for (const s of this.systems) s.onCasing?.(x, z); }
  //   shot(ax, az, bx, bz, y)        a round's path this step (y: its height), for what it can break (signs)
  shot(ax, az, bx, bz, y = 1.28) { for (const s of this.systems) s.onShot?.(ax, az, bx, bz, y); }
}

export { BRIGHT_LAYER, GROUND_LAYER, CITY_SYSTEMS, registerCitySystem } from './city-registry.js';
