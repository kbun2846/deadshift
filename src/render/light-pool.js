// Lumen's fixed pool of real lights (design doc 12, cost row "Real lights").
//
// The city's glow is mostly painted (emissive colour, halo cards, baked ground
// pools). A few real point lights on top make the ground and the players near
// the camera pick up the colour of the nearest signs and lamps. There are only
// a handful, and they hop between emitters:
//
//   Potato 0 / Performance 0 / Balanced 2 / Quality 4 / Extreme 6.
//
// The count only ever changes in setQuality(name). three.js compiles the number
// of lights into every shader's program key, so adding, removing or hiding a
// light during play would rebuild every material mid-fight. An unused light is
// therefore never hidden: it stays in the scene with intensity 0 and colour
// black, and the renderer skips a black light's lighting (shader-savings.js,
// "Dark effects light"), so an idle slot costs nothing.
//
// About four times a second the pool looks at city.emitters and picks the best
// few for the view. Every frame, update() only slides each light's fade and its
// intensity: no picking, no allocation.
import * as THREE from 'three';
import { registerCitySystem } from './city-registry.js';

export const LIGHT_POOL = Object.freeze({
  // Lights per preset (Extreme is Quality plus, never minus).
  counts: Object.freeze({ potato: 0, performance: 0, balanced: 2, quality: 4, extreme: 6 }),
  // How many times a second the choice is remade. The choice is cheap (one
  // pass over the emitters) but there is no need to do it every frame.
  pickHz: 4,
  // Only emitters this close to the camera target (metres, on the ground plane)
  // can be chosen: it is what the view can see, and a light beyond it would
  // light nothing on screen.
  viewReach: 26,
  // Hysteresis. A light that already has an emitter scores this much higher, so
  // a challenger must beat it by 35% before it takes the light. Without it two
  // lamps at nearly the same distance would swap every time the camera moved a
  // step.
  keepBonus: 1.35,
  // Seconds to fade out (then move, then fade in) when a light changes emitter.
  fade: 0.3,
  // Emitter intensity 1 is one street lamp. three.js point lights are in
  // candela with inverse-square falloff: a lamp about 4.5 m up, over ground of
  // albedo ~0.3, gives an extra ~0.25 of radiance right under it and still
  // reads at 7 m, roughly a 6-8 m circle that lifts the ground without washing
  // it out. Retune this one number for the look.
  intensityScale: 46,
  // (2026-09-30, the darker night, owner: colour "subtle... but still pop"):
  // 55 -> 46, and each light's colour taken this share of the way to its own
  // grey, so a green signal or a pink sign tints the street and the players
  // near it instead of dyeing them.
  desaturate: .35,
  // Each light's own cut-off distance (metres): the emitter's `reach`, kept in
  // this band so a huge sign does not flood the street and a tiny one still
  // lights something.
  minDistance: 6,
  maxDistance: 14,
  distanceWhenUnknown: 10,
  // three's physical falloff; 2 is the real inverse-square law.
  decay: 2,
  // How much of a light the power sag removes at city.uniforms.sag = 1.
  sagDim: 0.9,
  // A wall sign's, panel's or screen's emitter sits on its wall; a point light
  // there would blow a hot spot into the wall (which already carries its baked
  // wash, city-shells.js bakeLight) and hardly touch the street. Those lights
  // stand this far out from the wall along its facing instead, so the street,
  // the cars and the players in front of it take the colour and the wall only
  // a soft share. Lamps and signals hang free and stay where they are.
  standoff: 1.4,
  standoffKinds: Object.freeze(['neon', 'panel', 'screen']),
});

export class LightPool {
  constructor(view, map, city) {
    this.view = view; this.map = map; this.city = city;
    // One slot per light: the light itself and the state of its emitter.
    //   emitter  the emitter it is (or was, while fading out) lighting
    //   pending  the emitter it moves to once it has faded out
    //   keep     false once its emitter lost the pick: it is fading out
    //   fade     0..1, the fade level of the light right now
    this.slots = [];
    this.count = 0;
    this.pickTimer = Infinity; // pick on the first update after (re)building the pool
    // Scratch for the pick, sized for the largest preset so nothing is allocated later.
    const most = Math.max(...Object.values(LIGHT_POOL.counts));
    this.picks = new Array(most).fill(null);
    this.pickScores = new Float64Array(most);
    this.pickTaken = new Uint8Array(most);
    this.pickCount = 0;
    this.colourCache = new Map();
  }

  // The only place the light count changes.
  setQuality(name) {
    const want = LIGHT_POOL.counts[name] ?? 0;
    const scene = this.view.scene;
    while (this.slots.length < want) {
      const light = new THREE.PointLight('#000000', 0, LIGHT_POOL.distanceWhenUnknown, LIGHT_POOL.decay);
      light.castShadow = false;
      light.position.set(0, -50, 0);
      scene.add(light);
      this.slots.push({ light, emitter: null, pending: null, keep: false, fade: 0, claimed: false, ox: 0, oz: 0 });
    }
    while (this.slots.length > want) {
      const { light } = this.slots.pop();
      light.removeFromParent(); light.dispose?.();
    }
    this.count = want;
    this.pickTimer = Infinity;
  }

  update(frame) {
    const n = this.slots.length;
    if (!n) return;
    const dt = frame.dt > 0 ? frame.dt : 0;
    this.pickTimer += dt;
    if (this.pickTimer >= 1 / LIGHT_POOL.pickHz) { this.pickTimer = 0; this.pick(frame.focus); }

    const step = dt / LIGHT_POOL.fade;
    const sag = 1 - Math.min(1, Math.max(0, this.city.uniforms?.sag?.value ?? 0)) * LIGHT_POOL.sagDim;
    for (let i = 0; i < n; i++) {
      const slot = this.slots[i], light = slot.light;
      let e = slot.emitter;
      // Fade toward lit while it holds a good emitter, toward dark otherwise
      // (an emitter that broke since the last pick fades at once).
      const target = e && slot.keep && !e.broken ? 1 : 0;
      slot.fade = slot.fade < target ? Math.min(target, slot.fade + step) : Math.max(target, slot.fade - step);
      if (slot.fade <= 0) {
        // Fully dark: now it may move to its next emitter (or go idle).
        if (slot.pending) { this.assign(slot, slot.pending); slot.pending = null; e = slot.emitter; }
        else if (e && !slot.keep) { this.release(slot); e = null; }
      }
      if (!e) { light.intensity = 0; continue; }
      light.position.set(e.x + slot.ox, e.y, e.z + slot.oz); // an emitter may move (a car's headlights)
      light.intensity = e.intensity * (e.level ?? 1) * LIGHT_POOL.intensityScale * slot.fade * sag;
    }
  }

  // Put the emitter on the slot's light, at full dark, and start it fading in.
  assign(slot, emitter) {
    slot.emitter = emitter; slot.keep = true;
    const light = slot.light, colour = emitter.colour;
    light.color.copy(colour?.isColor ? colour : this.parsed(colour ?? '#ffffff'));
    const c = light.color, grey = .2126 * c.r + .7152 * c.g + .0722 * c.b, k = LIGHT_POOL.desaturate;
    c.setRGB(c.r + (grey - c.r) * k, c.g + (grey - c.g) * k, c.b + (grey - c.b) * k);
    light.distance = Math.min(LIGHT_POOL.maxDistance, Math.max(LIGHT_POOL.minDistance, emitter.reach ?? LIGHT_POOL.distanceWhenUnknown));
    const out = LIGHT_POOL.standoffKinds.includes(emitter.kind) ? LIGHT_POOL.standoff : 0, f = emitter.facing || 0;
    slot.ox = Math.sin(f) * out; slot.oz = Math.cos(f) * out;
    light.position.set(emitter.x + slot.ox, emitter.y, emitter.z + slot.oz);
  }

  // Emitters name their colour as a CSS string or a number, and parsing one
  // allocates; the same few colours come round again and again, so each is
  // parsed once.
  parsed(colour) {
    let c = this.colourCache.get(colour);
    if (!c) this.colourCache.set(colour, c = new THREE.Color(colour));
    return c;
  }

  // Idle: intensity 0 and colour black, so the renderer skips the light.
  release(slot) {
    slot.emitter = null; slot.pending = null; slot.keep = false; slot.fade = 0; slot.ox = slot.oz = 0;
    slot.light.color.setRGB(0, 0, 0); slot.light.intensity = 0;
  }

  // Choose the best emitters for the view and hand them to the lights.
  pick(focus) {
    const slots = this.slots, n = slots.length, emitters = this.city.emitters;
    const { picks, pickScores, pickTaken } = this;
    const reach = LIGHT_POOL.viewReach, reachSq = reach * reach;
    let count = 0;
    if (emitters && focus) {
      for (let i = 0, len = emitters.length; i < len; i++) {
        const e = emitters[i];
        if (!e || e.broken) continue;
        const power = e.intensity * (e.level ?? 1);
        if (!(power > 0.001)) continue;
        const dx = e.x - focus.x, dz = e.z - focus.z, dSq = dx * dx + dz * dz;
        if (dSq >= reachSq) continue;
        // Nearer and brighter wins. The falloff is squared so the nearest few
        // matter most, like the light itself does.
        const near = 1 - Math.sqrt(dSq) / reach;
        let score = power * near * near;
        if (this.holds(e)) score *= LIGHT_POOL.keepBonus;
        // Insert into the sorted top n.
        if (count === n && score <= pickScores[n - 1]) continue;
        let at = count < n ? count : n - 1;
        while (at > 0 && pickScores[at - 1] < score) { picks[at] = picks[at - 1]; pickScores[at] = pickScores[at - 1]; at--; }
        picks[at] = e; pickScores[at] = score;
        if (count < n) count++;
      }
    }
    this.pickCount = count;
    pickTaken.fill(0);

    // 1. Lights whose emitter is still among the best keep it. (A light that
    //    was fading out from an emitter that came back into favour fades back in.)
    for (let s = 0; s < n; s++) {
      const slot = slots[s];
      slot.claimed = false;
      if (slot.pending) {
        const at = this.indexInPicks(slot.pending);
        if (at >= 0 && !pickTaken[at]) { pickTaken[at] = 1; slot.claimed = true; continue; }
        slot.pending = null;
      }
      if (slot.emitter) {
        const at = this.indexInPicks(slot.emitter);
        if (at >= 0 && !pickTaken[at]) { pickTaken[at] = 1; slot.claimed = true; slot.keep = true; continue; }
        slot.keep = false;
      }
    }
    // 2. Each new emitter takes an unclaimed light: an idle one if there is,
    //    else the dimmest one, which finishes fading out and then moves.
    for (let p = 0; p < count; p++) {
      if (pickTaken[p]) continue;
      let best = null;
      for (let s = 0; s < n; s++) {
        const slot = slots[s];
        if (slot.claimed) continue;
        if (!best || (slot.emitter ? slot.fade : -1) < (best.emitter ? best.fade : -1)) best = slot;
      }
      if (!best) break; // cannot happen: picks never outnumber lights
      best.claimed = true;
      if (!best.emitter || best.fade <= 0) this.assign(best, picks[p]); else best.pending = picks[p];
    }
    for (let p = 0; p < n; p++) picks[p] = null; // do not keep emitters alive through the scratch
  }

  holds(e) {
    for (let s = 0; s < this.slots.length; s++) { const slot = this.slots[s]; if ((slot.emitter === e && slot.keep) || slot.pending === e) return true; }
    return false;
  }

  indexInPicks(e) {
    for (let p = 0; p < this.pickCount; p++) if (this.picks[p] === e) return p;
    return -1;
  }

  dispose() { this.setQuality('potato'); }
}

registerCitySystem('lights', (view, map, city) => new LightPool(view, map, city));
