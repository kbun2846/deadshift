// Lumen stage 4: the builder Lumen's street furniture, breakables and trees are
// made with (world/lumen-furniture.js, world/lumen-breakables.js). A model is
// `make(view, p, g)` (world/lumen-props.js registerLumenModel); this gives it
// boxes, cylinders and balls in a colour, a seeded random stream that is the
// same on every load and every screen, and one way to finish.
//
// Two kinds of prop, two ways of being drawn cheaply:
//  - Solid scenery (health null) goes in the static group; renderer.batch()
//    bakes every plain-coloured part into the map-wide vertex-coloured
//    material and merges it per 24 m cell, so a bench costs no draw of its own.
//  - A breakable (health set) has to hide and come back on its own
//    (prop-instances.js), and that merges parts by material: a material per
//    colour would make a draw per colour per cell. So a breakable's parts are
//    baked into ONE vertex-coloured mesh on the same plain material the static
//    batch uses (bakeColors), and done() does it. Lit parts (litBox) stay
//    separate: they are the unlit lit-part material.
// Nothing here allocates per frame (models are built once at load).
import * as THREE from 'three';
import { bakeColors } from '../render/bake-colors.js';
import { litBox, litMaterial } from './lumen-glow.js';
import { setLumenModelFinish } from './lumen-props.js';
import { lab, hexRgb, deltaE2000 } from '../render/look-contrast.js';
import { TEAMS } from '../config/match.js';

// The city's colours (design section 15) and the lit set. Never Amber
// #ffb020, Cyan #2ee6ff or Violet #b77bff.
export const CITY = Object.freeze({
  concrete: '#474a52', concreteDark: '#3a3d44', concretePale: '#585b63', stone: '#5a5e67',
  steel: '#a2abb5', steelMid: '#7c838c', steelDark: '#5a6068', graphite: '#33363e', black: '#181b22', panel: '#2b2e36',
  rust: '#5e3d30', rustDark: '#472e25', grime: '#2e2b27', asphalt: '#2c2f36',
  glass: '#2b4058', glassPale: '#5b7794', glassDark: '#1c2735',
  hazard: '#b8ad4a', hazardDark: '#2c2f36', white: '#c3c6cc', paper: '#b8b0a0', cardboard: '#7d6a4f', cardboardDark: '#5f5039',
  tarp: '#2e4e7a', soil: '#2a2320', dead: '#4a4438', ash: '#7c7a72',
  plastic: '#5b6a8c', plasticRed: '#8a2f3a', plasticGreen: '#3a6a52', plasticBlue: '#3a5a8c', plasticYellow: '#8c9a34', plasticWhite: '#b6b9bf', plasticGrey: '#6a6e76',
  leaf: '#3f5a3a', leafDim: '#56603f', trunk: '#2a2320', wood: '#5f4a38', woodPale: '#7a634a',
  litWhite: '#e6f0ff', litWarm: '#fff1d6', litLemon: '#fcee0a', litPink: '#ff2d8a', litBlue: '#3d6bff', litGreen: '#2bff8a', litRed: '#ff3040',
});

// A seeded stream (mulberry32) from a prop's spot and type, so a bench is
// the same shape every load and on every screen (no Math.random in a model).
export function propStream(p, salt = 0) {
  let h = 2166136261 ^ Math.round((p.x ?? 0) * 100) ^ Math.imul(Math.round((p.z ?? 0) * 100), 16777619) ^ salt;
  for (const c of String(p.type)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  let s = h >>> 0 || 1;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

// `#rrggbb` moved toward black (amount < 0) or white (> 0) by that share,
// snapped to a few steps so wear makes only a handful of distinct colours
// (each is a material until it is baked).
const STEPS = 5;
export function tone(hex, amount, steps = STEPS) {
  const step = Math.round(Math.max(-1, Math.min(1, amount)) * steps) / steps;
  if (!step) return hex;
  const n = parseInt(hex.slice(1), 16), f = step < 0 ? 0 : 255, k = Math.abs(step);
  const c = shift => Math.round(((n >> shift) & 255) * (1 - k) + f * k);
  return '#' + ((1 << 24) | c(16) << 16 | c(8) << 8 | c(0)).toString(16).slice(1);
}

// Obstacles read off the street (owner, 2026-10-01: "the obstacles all over
// the map kind of just blend in too much ... make it like a little bit more
// lit up. So it's a little bit more contrasting to the obstacles. So you can
// kind of tell what's what"). Every plain part of a piece a body bumps into
// (it has a collider and is not walk-over: the street furniture, the
// breakables, the set pieces, the bike rails) is lifted a step: each sRGB
// channel x `gain` + `add`, so the dark ones (bins, crates, graphite and
// black parts) come up most and every colour keeps its hue. What a body walks
// over (the street detail, ground dressing) and the lit parts are not, so the
// ground and its litter stay a step under what blocks. Built once at load:
// no cost a frame. (The cars are world/lumen-vehicles.js's own and keep
// their paint: big, lit and already apart from the road.)
// A lifted colour that would land within 16 (CIEDE2000) of a team colour
// (Amber, Cyan, Violet) keeps its own.
export const OBSTACLE_LIFT = Object.freeze({ gain: 1.1, add: .05 });
const TEAM_LABS = TEAMS.map(t => lab(hexRgb(t.colour))), LIFTED = new Map();
export function liftHex(hex) {
  let out = LIFTED.get(hex);
  if (out) return out;
  const { gain, add } = OBSTACLE_LIFT, n = parseInt(hex.slice(1), 16), c = shift => Math.min(255, Math.round((((n >> shift) & 255) / 255 * gain + add) * 255));
  out = '#' + ((1 << 24) | c(16) << 16 | c(8) << 8 | c(0)).toString(16).slice(1);
  const at = lab(hexRgb(out));
  if (TEAM_LABS.some(t => deltaE2000(at, t) < 16)) out = hex;
  LIFTED.set(hex, out);
  return out;
}
export const isObstacle = p => !p.walkOver && (p.collisionBoxes?.length ?? 0) > 0;

// A part no thicker than FLAT_PART.height (a sheet, a stain, a mat, a grate's
// bar lying flat, tipped no more than FLAT_PART.tilt) is drawn as its top face
// alone: two triangles, not a box's twelve (the camera looks down; its sides
// are under a pixel). Stage 5 review: the triangle budget on Performance.
// Solid scenery only: a breakable's parts fly apart and show their undersides.
export const FLAT_PART = Object.freeze({ height: .02, tilt: .6, ball: .07 });

// Two parts of a model often share a face's plane: a leg's top flush with
// the cap over it, a base's end flush with a leg's side, a plate or a poster
// flush with the box or board it is on. Merged into one mesh, the two faces
// drew through each other in a shifting patchwork as the camera moved
// (owner, 2026-09-30: "these things flicker and jitter as I move"); that
// takes a few millimetres between them on some GPUs (measured: one
// millimetre still fought), so unflush() finds every such pair once the
// model is built and steps the later part's face out by FLUSH.step, on that
// side only (the later part is the one laid on: a plate, a leg, a rim).
// Boxes and flat boards (a board's one face) whose axes are the model's own;
// parts of one colour are left alone (nothing changes when one shows instead
// of the other). Load time only (models are built once).
export const FLUSH = Object.freeze({ step: .004, tol: 1e-4 });
const UNFLUSH = { rel: new THREE.Matrix4(), inv: new THREE.Matrix4(), box: new THREE.Box3() };
export function unflush(root) {
  root.updateMatrixWorld(true);
  const { rel, inv, box } = UNFLUSH, parts = [];
  inv.copy(root.matrixWorld).invert();
  // (axis-aligned in the root's frame, scale only: then a nudge in the part's
  // own frame is a nudge in the root's)
  const square = o => { rel.multiplyMatrices(inv, o.matrixWorld); const e = rel.elements; return Math.abs(e[1]) + Math.abs(e[2]) + Math.abs(e[4]) + Math.abs(e[6]) + Math.abs(e[8]) + Math.abs(e[9]) < 1e-6 && e[0] > 0 && e[5] > 0 && e[10] > 0 ? e : null; };
  // (the model's own height, kept: see below; measured only if needed)
  let low = Infinity, high = -Infinity;
  const height = () => {
    if (high > low) return;
    root.traverse(o => {
      if (!o.isMesh || o === root) return;
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      rel.multiplyMatrices(inv, o.matrixWorld); box.copy(o.geometry.boundingBox).applyMatrix4(rel);
      low = Math.min(low, box.min.y); high = Math.max(high, box.max.y);
    });
  };
  root.traverse(o => {
    if (!o.isMesh || o === root) return;
    const kind = o.geometry.type; if (kind !== 'BoxGeometry' && kind !== 'PlaneGeometry') return;
    const e = square(o); if (!e) return;
    // (a box's own size, else its bounds: a board is translated off its centre)
    const prm = o.geometry.parameters;
    if (kind === 'BoxGeometry' && prm) box.min.set(-prm.width / 2, -prm.height / 2, -prm.depth / 2), box.max.set(prm.width / 2, prm.height / 2, prm.depth / 2);
    else { if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); box.copy(o.geometry.boundingBox); }
    box.applyMatrix4(rel);
    const scale = [e[0], e[5], e[10]], min = box.min.toArray(), max = box.max.toArray();
    if (o.parent !== root) { const pe = square(o.parent); if (!pe || Math.abs(pe[0] - 1) + Math.abs(pe[5] - 1) + Math.abs(pe[10] - 1) > 1e-6) return; }
    // a board has one face, on its flat axis, facing + (frontFace, topFace)
    const flat = kind === 'PlaneGeometry' ? [0, 1, 2].find(i => max[i] - min[i] < 1e-7) : -1;
    if (kind === 'PlaneGeometry' && flat === undefined) return;
    parts.push({ o, min, max, flat, colour: o.material?.color?.getHex?.() ?? -1, scale });
  });
  const { step, tol } = FLUSH;
  // Faces indexed by axis, side and where they stand (0.1 mm cells), so each
  // face looks only at the faces in its own plane.
  const faces = new Map(), cell = (ax, side, c) => ax * 2 + (side === 'max' ? 1 : 0) + 8 * Math.round(c / tol);
  const index = (q, ax, side, add) => { const k = cell(ax, side, q[side][ax]); let list = faces.get(k); if (!list) faces.set(k, list = []); if (add) list.push(q); else list.splice(list.indexOf(q), 1); };
  parts.forEach((q, n) => { q.n = n; q.before = [...q.min, ...q.max]; for (let ax = 0; ax < 3; ax++) { index(q, ax, 'min', true); index(q, ax, 'max', true); } });
  // Each face of a part B: the earlier parts A with a face flush with it
  // (same side, overlapping).
  const flushWith = (B, ax, side) => {
    const u = (ax + 1) % 3, v = (ax + 2) % 3, out = [], k = cell(ax, side, B[side][ax]);
    if (B.flat >= 0 && (B.flat !== ax || side === 'min')) return out; // (a board has only its + face)
    for (const kk of [k - 8, k, k + 8]) for (const A of faces.get(kk) || []) {
      if (A.n >= B.n || A.colour === B.colour) continue;
      if (A.flat >= 0 && (A.flat !== ax || side === 'min')) continue;
      if (Math.abs(A[side][ax] - B[side][ax]) > tol) continue;
      if (Math.min(A.max[u], B.max[u]) - Math.max(A.min[u], B.min[u]) < tol || Math.min(A.max[v], B.max[v]) - Math.max(A.min[v], B.min[v]) < tol) continue;
      out.push(A);
    }
    return out;
  };
  const move = (q, ax, side, d) => {
    index(q, ax, side, false); q[side][ax] += d; index(q, ax, side, true);
    if (q.flat === ax) { const other = side === 'max' ? 'min' : 'max'; index(q, ax, other, false); q[other][ax] = q[side][ax]; index(q, ax, other, true); }
  };
  for (const B of parts) {
    for (let ax = 0; ax < 3; ax++) for (const side of ['min', 'max']) {
      let under = flushWith(B, ax, side); if (!under.length) continue;
      const out = side === 'max' ? 1 : -1;
      // The later part is the one laid on (a plate, a cap, a rim): its face
      // steps out. At the model's top or foot (placement and the cover rules
      // measure its height, tools/lumen-place-detail.mjs) the parts under it
      // step in instead.
      if (ax === 1) height();
      if (ax === 1 && Math.abs(B[side][ax] - (side === 'max' ? high : low)) < tol) for (const A of under) move(A, ax, side, -out * step);
      else for (let n = 0; n < 4 && under.length; n++) { move(B, ax, side, out * step); under = flushWith(B, ax, side); }
    }
  }
  // Apply: each moved part's own scale and position (in its parent's frame).
  for (const q of parts) {
    if (q.min.every((v, i) => v === q.before[i]) && q.max.every((v, i) => v === q.before[i + 3])) continue;
    const o = q.o, prm = o.geometry.parameters;
    if (o.geometry.type !== 'BoxGeometry' && !o.geometry.boundingBox) o.geometry.computeBoundingBox();
    const g = o.geometry.type === 'BoxGeometry' && prm ? { min: { x: -prm.width / 2, y: -prm.height / 2, z: -prm.depth / 2 }, max: { x: prm.width / 2, y: prm.height / 2, z: prm.depth / 2 } } : o.geometry.boundingBox;
    for (let ax = 0; ax < 3; ax++) {
      const was0 = q.before[ax], was1 = q.before[ax + 3], now0 = q.min[ax], now1 = q.max[ax];
      if (was0 === now0 && was1 === now1) continue;
      const k = 'xyz'[ax], size = g.max[k] - g.min[k];
      if (size > 1e-7) o.scale[k] *= (now1 - now0) / (was1 - was0);
      // (the centre moves by the mean shift; a board's plane by its shift)
      o.position[k] += size > 1e-7 ? ((now0 + now1) - (was0 + was1)) / 2 - ((g.min[k] + g.max[k]) / 2) * (o.scale[k] - q.scale[ax]) : now1 - was1;
    }
  }
}
setLumenModelFinish(unflush);
const TOPS = new Map();
function topFace(w, h, d) {
  const key = w + ',' + h + ',' + d;
  let geometry = TOPS.get(key);
  if (!geometry) {
    geometry = new THREE.PlaneGeometry(w, d); geometry.rotateX(-Math.PI / 2); geometry.translate(0, h / 2, 0);
    geometry.userData.shared = true; geometry.computeBoundingSphere(); TOPS.set(key, geometry);
  }
  return geometry;
}
// A board as thin as FLAT_PART.height standing on a wall (a poster, a sticker, a
// plate on a wall piece: world/lumen-detail.js): its front face (+z) alone, the
// back being against the wall.
const FRONTS = new Map();
export function frontFace(w, h, d) {
  const key = w + ',' + h + ',' + d;
  let geometry = FRONTS.get(key);
  if (!geometry) { geometry = new THREE.PlaneGeometry(w, h); geometry.translate(0, 0, d / 2); geometry.userData.shared = true; geometry.computeBoundingSphere(); FRONTS.set(key, geometry); }
  return geometry;
}
// A disc as thin (a lid, a counter, a coin of a stone): its top alone, `segments` triangles.
const DISCS = new Map();
function topDisc(r, h, segments) {
  const key = r + ',' + h + ',' + segments;
  let geometry = DISCS.get(key);
  if (!geometry) {
    geometry = new THREE.CircleGeometry(r, segments); geometry.rotateX(-Math.PI / 2); geometry.translate(0, h / 2, 0);
    geometry.userData.shared = true; geometry.computeBoundingSphere(); DISCS.set(key, geometry);
  }
  return geometry;
}
// Small balls (fruit, a knob: FLAT_PART.ball m across and under) are octahedra, 8 triangles, not 20.
const SMALL_BALL = new Map();
const smallBall = r => { let geometry = SMALL_BALL.get(r); if (!geometry) { geometry = new THREE.OctahedronGeometry(r, 0); geometry.userData.shared = true; SMALL_BALL.set(r, geometry); } return geometry; };
const lying = (h, rot) => h <= FLAT_PART.height && (!rot || (Math.abs(rot[0] || 0) <= FLAT_PART.tilt && Math.abs(rot[2] || 0) <= FLAT_PART.tilt));

// The builder for one prop: `K.box(x, y, z, w, h, d, colour, rotation?)` and so
// on, in the prop's local frame from y 0 up (the group sits on the ground).
// `rotation` is [rx, ry, rz]. The lit parts take a colour and a strength.
export function kit(view, p, g) {
  const breakable = p.health !== null && p.health !== undefined;
  const rand = propStream(p);
  // Each prop has its own age: every plain part is a touch lighter or darker (five shades either way),
  // so two of a type never read as the same object. Its own stream, so the model's wear draws are unchanged.
  const age = (propStream(p, 7919)() - .5) * .5;
  // (a coloured part only ever darkens, so wear never drifts toward Amber, Cyan or Violet; greys go either way)
  // (then an obstacle's colour lifted: OBSTACLE_LIFT)
  const lift = isObstacle(p) ? liftHex : hex => hex;
  const dye = hex => { const n = parseInt(hex.slice(1), 16), r = n >> 16, gg = n >> 8 & 255, b = n & 255; return lift(tone(hex, Math.max(r, gg, b) - Math.min(r, gg, b) > 40 ? -Math.abs(age) : age, 10)); };
  const put = (mesh, rot) => { if (rot) mesh.rotation.set(rot[0] || 0, rot[1] || 0, rot[2] || 0); return mesh; };
  const K = {
    g, view, p, rand, breakable,
    // A seeded pick, and a seeded tone shift of a colour (wear: a little lighter or darker).
    pick: list => list[Math.floor(rand() * list.length) % list.length],
    wear: (hex, amount = .3) => tone(hex, (rand() - .5) * amount),
    box: (x, y, z, w, h, d, colour, rot) => put(!breakable && lying(h, rot) ? view.mesh(topFace(w, h, d), dye(colour), x, y, z, g) : view.box(x, y, z, w, h, d, dye(colour), g), rot),
    // A cylinder (a prism with `segments` sides) standing on its centre y; `top` its top radius.
    cyl: (x, y, z, r, h, colour, segments = 8, top = r, rot) => put(!breakable && lying(h, rot) ? view.mesh(topDisc(top, h, segments), dye(colour), x, y, z, g) : view.cylinder(x, y, z, r, h, dye(colour), g, segments, top), rot),
    // A squashed ball (icosahedron, detail 0 = 20 faces): a bag, a bush, a lump.
    ball: (x, y, z, r, colour, sy = 1, sx = 1, sz = 1, rot) => { const m = view.mesh(!breakable && r <= FLAT_PART.ball ? smallBall(r) : new THREE.IcosahedronGeometry(r, 0), dye(colour), x, y, z, g); m.scale.set(sx, sy, sz); return put(m, rot); },
    // A ring (tube) lying flat (rotate it to stand it up): a cable coil, a tyre, a hoop.
    ring: (x, y, z, radius, tube, colour, rot, segments = 8, tubeSegments = 5) => put(view.mesh(new THREE.TorusGeometry(radius, tube, tubeSegments, segments), dye(colour), x, y, z, g), rot || [Math.PI / 2, 0, 0]),
    // A part of any geometry (an extrusion, a cone) in a colour.
    mesh: (geometry, colour, x, y, z, rot) => put(view.mesh(geometry, dye(colour), x, y, z, g), rot),
    // A lit part (world/lumen-glow.js): a box whose colour is x strength, unlit.
    lit: (x, y, z, w, h, d, colour, strength = 1, rot) => put(litBox(view, g, x, y, z, w, h, d, colour, strength), rot),
    // Lets the prop's smallest parts stop casting shadows (statics: shadowBySize does it; here for both).
    quiet(mesh) { mesh.castShadow = false; return mesh; },
    // Finish. A breakable's plain parts become one vertex-coloured mesh on the
    // static batch's own material (see the header); it casts no shadow (small
    // clutter; a shadow-caster variant would split the prop batches).
    done() {
      if (!breakable) return null;
      // (a breakable's parts are merged right here, so they are unflushed
      // first; solid scenery is, once built, by world/lumen-props.js)
      unflush(g);
      const lit = litMaterial(view);
      const merged = bakeColors(g, { material: view.bakedMaterial('plain'), pick: m => m.material !== lit });
      if (merged) { merged.castShadow = false; merged.receiveShadow = true; }
      return merged;
    },
  };
  return K;
}

// The bounding box of a built model (metres, in its own frame), from every
// mesh under `g` (the tests use it to hold a model inside its collision boxes).
const BOX = new THREE.Box3();
export function modelBounds(g) {
  g.updateMatrixWorld(true);
  return BOX.setFromObject(g);
}
