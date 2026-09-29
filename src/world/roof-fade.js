// Roofs, walls and trees never hide a character standing outside under or
// behind them (stage 4 audit: the meetinghouse's portico pediment and the
// stoops' hoods hid the hat of anyone standing there, your own and, worse, an
// opponent's; an eave or a tall roof does the same to someone by a wall; the
// trees' limbs, merged into the scenery, hid a body north of a trunk). Every
// character the view draws who is OUTSIDE every building (including open
// sheds) opens a see-through patch round the point that stands between
// the camera and their head (on the line from the head to the camera: the
// camera looks down from the south, so a point `rise` m above the head hides
// what is about `rise` x CAMERA_TILT m north of it mid-screen, more toward the
// top). A character inside a building is under its own roof by design (you
// see into rooms only through doors), so they open nothing. One shared list
// per view, updated once a frame.
//
// The patch is smooth, not dithered (v0.985a, owner: "I don't like the noise
// under trees or under the edges of roofs"). The faded surface is drawn twice:
//  - its own opaque material leaves the patch out altogether (a clean cut, so
//    the depth test and everything under it work as before);
//  - a blended copy of the mesh (`fadeOverlay`: the same geometry, a child of
//    the mesh, its own transparent material) draws only the patch, at the
//    opacity the fade leaves, after everything opaque.
// A copy is shown only on frames when someone is near its mesh (`prepareFades`,
// before each render), so the extra draws come only where a patch is open.
//
// Trees (`treeFade`, world/trees.js): standing under a tree's crown, or behind
// it from the camera, fades that whole tree: its leaf clumps to CANOPY, its
// limbs as far as LIMBS from TREE_FADE.to up, easing back to solid down to
// TREE_FADE.from over its foot, so the branches fade into the trunk and the
// trunk stays solid cover. Each vertex (limbs) or clump (leaves) carries its
// tree: `treeAt` (trunk x, z, crown radius, ground y at the trunk).
//
// Colonial roofs fade by SECTION, whole (s6-roofs, owner: "make it bigger and
// make it make the whole front section of the roof transparent"; the patch
// above is the walls' now). Each roof is cut into sections as it is built
// (world/colonial-buildings.js): each slope of the main roof, each gable end,
// each door's hood, the portico, the belfry, the tomb's mound; chimneys and
// the ridge go with the slope they stand on. Every vertex of the baked roof
// carries its section (`roofSection`: an index into ONE table of fades shared
// by every roof, `SECTION_FADE.slots`, index 0 never fades). Once a frame
// (prepareFades) each section's target is decided here, on the CPU, from its
// shapes (a slope or gable as a slab whose top follows the roof line, the
// rest as boxes, in the building's frame): a section fades when a character
// in the list stands under it or it hides them from the camera (the line
// from their waist or head toward the camera passes under its top, within
// `reach` of it). A door's hood takes the face of the roof behind it along,
// so standing at a door fades the whole front. Each section eases to its
// target (smoothstep over `fadeIn` s in, `fadeOut` s out). The roof's opaque
// draw drops a faded section's vertices (no fragments, no discard) and its
// blended copy draws only those, at 1 - fade x strength.
import * as THREE from 'three';
import { buildingContains } from '../map-kit.js';

export const ROOF_FADE = Object.freeze({ slots: 8, head: 1.6, inner: .5, outer: 1.05, strength: .92, cut: .004, reach: 8 });
// Colonial walls (the shell of each building: walls, clapboard, trim, sashes):
// the same patch, but only from the waist up and only on the camera's side of
// the body (owner, stage 5 review: someone against a north wall was hidden
// by the wall itself, a head shorter than it; the wall behind someone
// standing in front of it stays whole). Renderer 'wall' batches. A little
// bigger than the old roof patch (s6-roofs: inner .5, outer 1.05 before).
export const WALL_FADE = Object.freeze({ above: .9, ahead: true, inner: .65, outer: 1.3 });
// A colonial building's ceiling (v0.990a, owner: running against a wall let
// him see inside): the patch it opens, only on the line to someone behind the
// building (on the camera's side of them, over their waist), tighter than the
// walls' so someone beside a wall or under a front eave opens none of it.
export const CEILING_FADE = Object.freeze({ above: .9, ahead: true, inner: .4, outer: .75, colours: ['#51463b', '#493f35'], board: .32, drop: .03 });
// The roofs' sections (s6-roofs): the table's size (Hollow Wick uses about a
// third), how see-through a faded section goes, its ease in and out (s), how
// near a character's line must pass to fade it (m: a little under the body's
// .38 radius, so a hat brim grazing a gable's overhang from a side door does
// not fade the whole roof), the waist (m over the feet: lower down the walls
// hide a body anyway), and how far over the roof line a slope's shingles,
// rake boards and ridge reach.
// The soft patch a faded roof section opens (m: fully open within `inner` of
// the point on the character's line, the roof whole again past `outer`).
export const ROOF_PATCH = Object.freeze({ inner: .8, outer: 1.9, above: 0, ahead: false });
export const SECTION_FADE = Object.freeze({ slots: 256, strength: .85, fadeIn: .16, fadeOut: .24, reach: .3, edge: .08, waist: .9, thick: .3, band: .5 });
// Whole trees (owner, v0.985a): how see-through the leaves and the limbs go,
// and where a limb eases back to solid (m over the ground at the trunk); the
// crown's edge is soft over `edge` m inside it to `out` m outside it.
export const TREE_FADE = Object.freeze({ canopy: .85, limbs: .8, from: 1.6, to: 4.2, edge: .08, out: .5 });

const f = v => v.toFixed(4);

// The shared list: { fade: vec4[] (x, z, feet y, on), count: { value } (how
// many slots are in use: they fill from the first), update() (once a frame:
// a mesh's onBeforeRender), refresh() (now), overlays }.
export function roofFade(view) {
 if (view.roofFade) return view.roofFade;
 const fade = Array.from({ length: ROOF_FADE.slots }, () => new THREE.Vector4()), count = { value: 0 };
 let frame = -1, n = 0;
 // (Made once: nothing here allocates per frame.)
 const add = p => {
  if (n >= ROOF_FADE.slots) return;
  const buildings = view.map?.buildings;
  if (buildings) for (let i = 0; i < buildings.length; i++) { const b = buildings[i]; if (buildingContains(b, p)) return; }
  fade[n++].set(p.x, p.z, p.y, 1);
 };
 const addAvatar = a => { if (a.root?.visible && a.root.parent) add(a.root.position); };
 const refresh = () => {
  n = 0;
  if (view.player && view.player.visible !== false) add(view.player.position);
  view.remote?.avatars?.forEach(addAvatar);
  for (let i = n; i < ROOF_FADE.slots; i++) fade[i].w = 0;
  count.value = n;
 };
 const update = () => {
  const now = view.renderer?.info?.render?.frame; if (now !== undefined && now === frame) return; frame = now ?? -1;
  refresh();
 };
 return (view.roofFade = { fade, count, update, refresh, overlays: [] });
}

// Before each render (renderer.js drawFrame): the list as it stands, the
// roofs' sections decided and eased, and each blended copy shown only if a
// patch can fall on its mesh. For a building's shell (`near: 'line'`): the
// line from someone's head toward the camera, as high as the mesh reaches,
// passes within the patch's reach (`pad`) of the mesh's bounds. For a roof
// (`near: 'sections'`): any of its sections (`start` to `end` in the table)
// is faded, or still fading out. For the trees' copies (`near: 'trees'`):
// one of its trees is faded.
export function prepareFades(view) {
 const r = view.roofFade; if (!r) return;
 r.refresh();
 const S = view.roofSections;
 if (S) updateSections(view, sectionStep(S));
 const n = r.count.value, eye = view.camera?.position;
 for (let k = 0; k < r.overlays.length; k++) {
  const e = r.overlays[k];
  let show = false;
  if (e.skip && e.skip()) show = false;
  else if (e.near === 'sections') { for (let i = e.start; i < e.end && !show; i++) show = S.values[i] > ROOF_FADE.cut; }
  else if (n > 0) {
   if (e.near === 'line' && eye) {
    const box = e.box || (e.box = worldBox(e.base)), pad = e.pad;
    for (let i = 0; i < n && !show; i++) {
     const c = r.fade[i], headY = c.z + ROOF_FADE.head, rise = Math.max(0, box.max.y - headY), down = Math.max(1, eye.y - headY);
     const bx = c.x + (eye.x - c.x) / down * rise, bz = c.y + (eye.z - c.y) / down * rise;
     show = segmentNearBox(c.x, c.y, bx, bz, box, pad);
    }
   } else if (e.near === 'trees' && eye) {
    // Its trees (x, z, crown radius, ground): one faded if someone stands
    // under its crown or behind it, on the line toward the camera.
    const t = e.trees || (e.trees = treesOf(e.base));
    for (let i = 0; i < n && !show; i++) {
     const c = r.fade[i], headY = c.z + ROOF_FADE.head, down = Math.max(1, eye.y - headY);
     for (let j = 0; j < t.length; j += 4) {
      const rise = Math.max(0, t[j + 3] + TREE_TOP - headY), bx = c.x + (eye.x - c.x) / down * rise, bz = c.y + (eye.z - c.y) / down * rise;
      const reach = t[j + 2] + TREE_FADE.out + .2;
      if (segmentPointDistance2(c.x, c.y, bx, bz, t[j], t[j + 1]) < reach * reach) { show = true; break; }
     }
    }
   } else {
    const s = e.sphere || (e.sphere = worldSphere(e.base)), reach = s.radius + ROOF_FADE.reach, far = reach * reach;
    for (let i = 0; i < n; i++) { const c = r.fade[i], dx = c.x - s.center.x, dz = c.y - s.center.z; if (dx * dx + dz * dz < far) { show = true; break; } }
   }
  }
  if (e.mesh.visible !== show) e.mesh.visible = show;
 }
}
// (No tree reaches higher than this over the ground at its trunk.)
const TREE_TOP = 12;
function segmentPointDistance2(ax, az, bx, bz, px, pz) {
 const dx = bx - ax, dz = bz - az, l = dx * dx + dz * dz, t = l > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l)) : 0;
 const x = ax + dx * t - px, z = az + dz * t - pz;
 return x * x + z * z;
}
// The trees a mesh carries (its `treeAt` attribute, each tree once), as
// x, z, radius, ground quads; none without a radius.
function treesOf(mesh) {
 const a = mesh.geometry.attributes.treeAt, seen = new Set(), out = [];
 if (!a) return new Float32Array(0);
 for (let i = 0; i < a.count; i++) {
  const r = a.getZ(i); if (!(r > 0)) continue;
  const key = `${a.getX(i)},${a.getY(i)}`; if (seen.has(key)) continue;
  seen.add(key); out.push(a.getX(i), a.getY(i), r, a.getW(i));
 }
 return new Float32Array(out);
}
function worldSphere(mesh) {
 mesh.updateWorldMatrix(true, false);
 if (mesh.isInstancedMesh) { if (!mesh.boundingSphere) mesh.computeBoundingSphere(); return mesh.boundingSphere.clone().applyMatrix4(mesh.matrixWorld); }
 if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere();
 return mesh.geometry.boundingSphere.clone().applyMatrix4(mesh.matrixWorld);
}
function worldBox(mesh) {
 mesh.updateWorldMatrix(true, false);
 if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
 return mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld);
}
// Does the segment (ax, az)-(bx, bz) pass within `pad` of the box (x and z)?
// (Liang-Barsky against the grown box; no closures: it runs every frame.)
export function segmentNearBox(ax, az, bx, bz, box, pad) {
 CLIP.ax = ax; CLIP.az = az; CLIP.bx = bx; CLIP.bz = bz;
 CLIP.x0 = box.min.x - pad; CLIP.x1 = box.max.x + pad; CLIP.z0 = box.min.z - pad; CLIP.z1 = box.max.z + pad;
 return clipSegment();
}
// The numbers the tests below work on live on these two long-lived objects,
// not in arguments (s6-roofs): a number handed to or returned from a call the
// engine does not inline is boxed, a small allocation, and these run for
// everyone by every roof, every frame. CLIP: the segment (a to b) and the
// grown rectangle; clipSegment leaves the part inside as t0 to t1 (fractions
// of the segment). LINE: the character and the line being tested.
const CLIP = { ax: .5, az: .5, bx: .5, bz: .5, x0: .5, x1: .5, z0: .5, z1: .5, t0: .5, t1: .5 };
const LINE = { px: .5, pz: .5, feet: .5, hx: .5, hz: .5, wx: .5, wz: .5, reach: .5, h: .5, vx: .5, vz: .5, a0: .5, a1: .5, e0: .5, e1: .5, lo: .5, top: .5, u: .5 };
function clipSegment() {
 const ax = CLIP.ax, az = CLIP.az, dx = CLIP.bx - ax, dz = CLIP.bz - az;
 let t0 = 0, t1 = 1;
 for (let side = 0; side < 4; side++) {
  const p = side === 0 ? -dx : side === 1 ? dx : side === 2 ? -dz : dz;
  const q = side === 0 ? ax - CLIP.x0 : side === 1 ? CLIP.x1 - ax : side === 2 ? az - CLIP.z0 : CLIP.z1 - az;
  if (p === 0) { if (q < 0) return false; continue; }
  const t = q / p;
  if (p < 0) { if (t > t1) return false; if (t > t0) t0 = t; } else { if (t < t0) return false; if (t < t1) t1 = t; }
 }
 CLIP.t0 = t0; CLIP.t1 = t1;
 return t0 <= t1;
}

// --- Roof sections (s6-roofs) -----------------------------------------------
// A section's shapes are slabs in its building's frame (x across the width, z
// along the depth, y up from the floor): { x0, x1, z0, z1, y0 (bottom), t0,
// t1 (top), along }. A box (`along` 0) has one top (t0). A slope or a gable
// end (`along` 1: its top runs from t0 at x0 to t1 at x1; 2: the same along
// z) follows the roof line; a slope's bottom is -Infinity (anything under it
// is under the roof).
//
// Does the slab hide the body point LINE.h m up (the building's frame) at
// (LINE.px, LINE.pz), whose line toward the camera runs (LINE.vx, LINE.vz)
// per metre of rise? The line, from its own height (or the slab's bottom) to
// the slab's top, comes within LINE.reach of the slab, and there it is under
// the slab's top.
function slabHides(s) {
 const h = LINE.h, top = s.t0 > s.t1 ? s.t0 : s.t1, lo = h > s.y0 ? h : s.y0;
 if (lo > top) return false;
 const px = LINE.px, pz = LINE.pz, vx = LINE.vx, vz = LINE.vz, reach = LINE.reach;
 CLIP.ax = px + vx * (lo - h); CLIP.az = pz + vz * (lo - h); CLIP.bx = px + vx * (top - h); CLIP.bz = pz + vz * (top - h);
 CLIP.x0 = s.x0 - reach; CLIP.x1 = s.x1 + reach; CLIP.z0 = s.z0 - reach; CLIP.z1 = s.z1 + reach;
 if (!clipSegment()) return false;
 if (!s.along) return true; // (a box: the line is within its height all the way)
 // A slope: its top is linear along its axis (held level past the ends), the
 // line rises straight; the gap is widest at an end of the part inside or
 // where the top's line bends.
 const u0 = CLIP.t0, u1 = CLIP.t1, a0 = s.along === 1 ? CLIP.ax : CLIP.az, a1 = s.along === 1 ? CLIP.bx : CLIP.bz, e0 = s.along === 1 ? s.x0 : s.z0, e1 = s.along === 1 ? s.x1 : s.z1;
 LINE.a0 = a0; LINE.a1 = a1; LINE.e0 = e0; LINE.e1 = e1; LINE.lo = lo; LINE.top = top;
 // The gap (the slab's top less the line's height) is piecewise linear, so its
 // least and greatest values over the part inside are at those points. The
 // line is hidden where the gap is between 0 and the slab's `band` (a slope is
 // the roof itself, `band` deep under its top: v0.999a, owner "the roof when
 // going up against some buildings still disappears". It was solid all the way
 // down, so anyone within reach of an eave, even on the camera's side of it
 // with nothing over them on screen, faded the whole slope); a slab with no
 // band is solid under its top (gap at least 0 anywhere is enough).
 LINE.lo = lo; let lo2 = Infinity, hi = -Infinity, g;
 LINE.u = u0; g = slabGap(s); if (g < lo2) lo2 = g; if (g > hi) hi = g;
 LINE.u = u1; g = slabGap(s); if (g < lo2) lo2 = g; if (g > hi) hi = g;
 if (a1 !== a0) {
  const k0 = (e0 - a0) / (a1 - a0), k1 = (e1 - a0) / (a1 - a0);
  if (k0 > u0 && k0 < u1) { LINE.u = k0; g = slabGap(s); if (g < lo2) lo2 = g; if (g > hi) hi = g; }
  if (k1 > u0 && k1 < u1) { LINE.u = k1; g = slabGap(s); if (g < lo2) lo2 = g; if (g > hi) hi = g; }
 }
 return hi >= 0 && (!(s.band > 0) || lo2 <= s.band);
}
// The slab's top less the line's height at fraction LINE.u of it.
function slabGap(s) {
 const u = LINE.u, a = LINE.a0 + (LINE.a1 - LINE.a0) * u, e0 = LINE.e0, e1 = LINE.e1, k = e1 > e0 ? Math.max(0, Math.min(1, (a - e0) / (e1 - e0))) : 0;
 return s.t0 + (s.t1 - s.t0) * k - (LINE.lo + (LINE.top - LINE.lo) * u);
}
// Does a section fade for the character LINE holds: at (px, pz), feet `feet`
// (the building's frame), their head's and waist's lines toward the camera
// running (hx, hz) and (wx, wz) per metre of rise? Standing under one of its
// boxes (a hood, the portico, the mound's edge), or hidden by any of its shapes.
function hidesLine(section) {
 const shapes = section.shapes, px = LINE.px, pz = LINE.pz, reach = SECTION_FADE.reach, head = LINE.feet + ROOF_FADE.head, waist = LINE.feet + SECTION_FADE.waist;
 for (let k = 0; k < shapes.length; k++) {
  const s = shapes[k];
  if (!s.along && s.y0 > waist && px > s.x0 - reach && px < s.x1 + reach && pz > s.z0 - reach && pz < s.z1 + reach) return true;
  LINE.reach = reach;
  LINE.h = waist; LINE.vx = LINE.wx; LINE.vz = LINE.wz; if (slabHides(s)) return true;
  // (The head's line against a slope or a gable end only when the roof is
  // over its middle, not a brim's width off it: `edge`. Hugging a wall under
  // the eave, the roof over a sliver of the hat is not worth the whole slope.)
  LINE.reach = s.along ? SECTION_FADE.edge : reach;
  LINE.h = head; LINE.vx = LINE.hx; LINE.vz = LINE.hz; if (slabHides(s)) return true;
 }
 return false;
}

// The table every colonial roof reads (one per view): `values` (the uniform:
// each section's fade, 0..1, eased), the roofs and their sections.
export function roofSections(view) {
 return view.roofSections ||= { values: new Float32Array(SECTION_FADE.slots), next: 1, roofs: [], clock: -1 };
}
// A building's roof sections, numbered from the table's next free index:
// `sections` [{ name, shapes, pull }] (pull: the index in this list of the
// section a hood takes along, or -1). Returns its record (`start`: the first index);
// its `entry` (the view's roof: its whole fade, renderer.js) and `box` (the
// roof's world bounds) are set once the roof is baked; until then it is left
// alone. Null (the roof never fades by section) if the table is full.
export function registerSections(view, building, sections) {
 const S = roofSections(view), n = sections.length;
 if (!n || S.next + n > SECTION_FADE.slots) { if (n) console.warn(`roof sections: the table is full (${building.id})`); return null; }
 const start = S.next, a = building.angle || 0; S.next += n;
 const record = { id: building.id, building, entry: null, box: null, x: building.x, z: building.z, y: building.baseY || 0, cos: Math.cos(a), sin: Math.sin(a), start,
  sections: sections.map((s, i) => ({ index: start + i, name: s.name, shapes: s.shapes, pull: s.pull ?? -1, target: 0, value: 0 })) };
 S.roofs.push(record);
 return record;
}
// Real seconds since the last frame (at most a tenth: a paused game or a
// stalled tab eases on from where it was; none before the first).
function sectionStep(S) {
 const now = performance.now(), dt = S.clock < 0 ? 0 : Math.min(.1, Math.max(0, (now - S.clock) / 1000));
 S.clock = now;
 return dt;
}
// Once a frame (prepareFades): each section's target from the list, then its
// ease. Nothing here allocates.
export function updateSections(view, dt) {
 const S = view.roofSections; if (!S) return;
 const r = view.roofFade, n = r ? r.count.value : 0, eye = view.camera?.position, reach = SECTION_FADE.reach;
 for (let i = 0; i < S.roofs.length; i++) {
  const R = S.roofs[i], list = R.sections;
  if (!R.box) continue;
  // A roof lifting whole (you inside, at its door or on its stoop), or not
  // yet back: no section of it fades on its own, so it never comes off in
  // parts (v0.990a, owner). It comes back whole, and its sections ease in
  // again from there.
  if (R.entry && (R.entry.lifting || R.entry.opacity < .995)) { for (let k = 0; k < list.length; k++) { const s = list[k]; s.target = 0; s.value = 0; S.values[s.index] = 0; } continue; }
  for (let k = 0; k < list.length; k++) list[k].target = 0;
  if (eye) for (let c = 0; c < n; c++) {
   const f = r.fade[c], waistY = f.z + SECTION_FADE.waist, headY = f.z + ROOF_FADE.head;
   const ex = eye.x - f.x, ez = eye.z - f.y, kw = 1 / Math.max(eye.y - waistY, 1), kh = 1 / Math.max(eye.y - headY, 1);
   // (First the roof's own bounds: the waist's line, as high as the roof reaches.)
   const rise = Math.max(0, R.box.max.y - waistY), box = R.box;
   CLIP.ax = f.x; CLIP.az = f.y; CLIP.bx = f.x + ex * kw * rise; CLIP.bz = f.y + ez * kw * rise;
   CLIP.x0 = box.min.x - reach; CLIP.x1 = box.max.x + reach; CLIP.z0 = box.min.z - reach; CLIP.z1 = box.max.z + reach;
   if (!clipSegment()) continue;
   // Into the building's frame (as buildingContains turns a point).
   const dx = f.x - R.x, dz = f.y - R.z, rx = ex * R.cos - ez * R.sin, rz = ex * R.sin + ez * R.cos;
   LINE.px = dx * R.cos - dz * R.sin; LINE.pz = dx * R.sin + dz * R.cos; LINE.feet = f.z - R.y; LINE.reach = reach;
   LINE.hx = rx * kh; LINE.hz = rz * kh; LINE.wx = rx * kw; LINE.wz = rz * kw;
   for (let k = 0; k < list.length; k++) { const s = list[k]; if (!s.target && hidesLine(s)) s.target = 1; }
  }
  // A door's hood takes the roof's face behind it along: at a door the
  // whole front fades, not the hood alone.
  for (let k = 0; k < list.length; k++) { const s = list[k]; if (s.target && s.pull >= 0) list[s.pull].target = 1; }
  for (let k = 0; k < list.length; k++) {
   const s = list[k];
   s.value = s.target ? Math.min(1, s.value + dt / SECTION_FADE.fadeIn) : Math.max(0, s.value - dt / SECTION_FADE.fadeOut);
   S.values[s.index] = s.value * s.value * (3 - 2 * s.value);
  }
 }
}

// The gameplay guard (s6-roofs): a faded section shows the room under it from
// outside (its furniture is fine), but never who is in it. May this view draw
// a remote player or robot at `p`? Not while they stand inside a closed
// building with a sectioned roof, unless you are inside it too (`sim.roofId`)
// or its roof is lifting for you (you in its doorway: renderer.js fades it
// as a whole). An open shed's occupants are left to roomShowsEntity
// (render/vision-polygons.js): since v0.990a nobody outside a shed sees who is in it.
export function shownInside(view, sim, p) {
 const roofs = view.roofSections?.roofs; if (!roofs) return true;
 for (let i = 0; i < roofs.length; i++) {
  const R = roofs[i], b = R.building, dx = p.x - R.x, dz = p.z - R.z;
  // (Inside: as buildingContains, with the turn the record keeps.)
  if (!R.entry || b.open || !(Math.abs(dx * R.cos - dz * R.sin) < b.w / 2 && Math.abs(dx * R.sin + dz * R.cos) < b.d / 2)) continue;
  return sim?.roofId === R.id || R.entry.opacity < .995;
 }
 return true;
}

// A blended copy for the patch, as a child of `base`: the same geometry (and,
// for an instanced mesh, the same instances), `material` (made transparent
// here), hidden until prepareFades shows it. `skip()`: true while the copy
// must stay hidden anyway (a roof fading as a whole, you inside it). `near`:
// how prepareFades judges it ('sections': roofs, with `start`/`end`; 'line':
// shells; 'trees'; 'sphere').
export function fadeOverlay(view, base, material, skip = null, near = 'sphere', more = {}) {
 const mesh = base.isInstancedMesh ? new THREE.InstancedMesh(base.geometry, material, base.count) : new THREE.Mesh(base.geometry, material);
 if (base.isInstancedMesh) { mesh.instanceMatrix = base.instanceMatrix; mesh.instanceColor = base.instanceColor; mesh.boundingSphere = base.boundingSphere; }
 mesh.castShadow = false; mesh.receiveShadow = base.receiveShadow; mesh.frustumCulled = base.frustumCulled;
 mesh.matrixAutoUpdate = false;
 base.add(mesh);
 return registerOverlay(view, mesh, { ...more, base, skip, near });
}
// A mesh that is itself a blended copy (a building's shell, merged on its own:
// world/colonial-buildings.js), hidden until prepareFades shows it. `pad`: how
// near the line must pass ('line'; the patch's outer edge and a little).
// `opaque` (a ceiling): shown and hidden the same way, but drawn as it is.
export function registerOverlay(view, mesh, { base = mesh, skip = null, near = 'line', pad = ROOF_FADE.outer + .1, start = 0, end = 0, opaque = false } = {}) {
 if (!opaque) overlayMaterial(mesh.material);
 mesh.castShadow = false; mesh.visible = false; mesh.userData.fadeOverlay = true;
 roofFade(view).overlays.push({ mesh, base, skip, near, pad, start, end, sphere: null, box: null });
 return mesh;
}
// The copy's material: transparent, writing no depth (what is under it is
// already drawn), and never casting.
function overlayMaterial(material) { material.transparent = true; material.depthWrite = false; return material; }

// The shared uniforms and the patch's loop: `roofOpen` 0..1 at this fragment.
const HOLE_UNIFORMS = S => `uniform vec4 roofFade[${S}];\nuniform int roofFadeCount;`;
function holeLoop({ inner, outer, above, ahead }) {
 return `float roofOpen = 0.0;
 if (roofFadeCount > 0) {
  // (Only the slots in use: nearly always one or two of the eight.)
  for (int i = 0; i < ${ROOF_FADE.slots}; i++) {
   if (i >= roofFadeCount) break;
   vec4 c = roofFade[i];
   if (c.w <= 0.0 || vRoofWorld.y < c.z + ${f(above)}) continue;
   // The point on the line from the head to this view's camera at this
   // fragment's height (stage 5 review, owner: a fixed tilt was right only at
   // the middle of the screen; toward its top the camera looks in lower, the
   // patch fell short and someone under a north eave stayed hidden).
   float headY = c.z + ${f(ROOF_FADE.head)}, rise = max(0.0, vRoofWorld.y - headY);
   vec2 toCamera = (cameraPosition.xz - c.xy) / max(cameraPosition.y - headY, 1.0);
   float away = length(vRoofWorld.xz - (c.xy + toCamera * rise));${ahead ? `
   if (dot(vRoofWorld.xz - c.xy, cameraPosition.xz - c.xy) < -0.3) continue; // (behind the body, as the camera sees it)` : ''}
   roofOpen = max(roofOpen, 1.0 - smoothstep(${f(inner)}, ${f(outer)}, away));
  }
 }`;
}
// The cut (opaque: leave the patch out) or the patch (blended copy: only it,
// at the opacity the fade leaves).
const cutOrPatch = (open, strength, overlay) => overlay
 ? `if (${open} <= ${f(ROOF_FADE.cut)}) discard;\n diffuseColor.a *= 1.0 - ${open} * ${f(strength)};`
 : `if (${open} > ${f(ROOF_FADE.cut)}) discard;`;

// Patch a material with the fade: `inner`/`outer` the patch's soft edge (m),
// `above` how far over a character's feet a fragment must be to fade (0: any),
// `ahead` only fragments on the camera's side of the body, `overlay` the
// blended copy's variant. (The name is the old one: it dithered until v0.985a.)
export function ditherFade(view, material, { key, inner = ROOF_FADE.inner, outer = ROOF_FADE.outer, strength = ROOF_FADE.strength, above = 0, ahead = false, overlay = false }) {
 const { fade, count } = roofFade(view);
 if (overlay) overlayMaterial(material);
 const before = material.onBeforeCompile, beforeKey = material.customProgramCacheKey?.bind(material);
 material.onBeforeCompile = (shader, renderer) => {
  before?.call(material, shader, renderer);
  shader.uniforms.roofFade = { value: fade }; shader.uniforms.roofFadeCount = count;
  shader.vertexShader = shader.vertexShader
   .replace('#include <common>', '#include <common>\nvarying vec3 vRoofWorld;')
   .replace('#include <begin_vertex>', `#include <begin_vertex>
 #ifdef USE_INSTANCING
  vRoofWorld = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
 #else
  vRoofWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
 #endif`);
  shader.fragmentShader = shader.fragmentShader
   .replace('#include <common>', `#include <common>\n${HOLE_UNIFORMS(ROOF_FADE.slots)}\nvarying vec3 vRoofWorld;`)
   .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
 ${holeLoop({ inner, outer, above, ahead })}
 ${cutOrPatch('roofOpen', strength, overlay)}`);
 };
 material.customProgramCacheKey = () => (beforeKey ? beforeKey() + '|' : '') + key + (overlay ? '|overlay' : '');
}

// A colonial roof's material (one program for every colonial roof), and the
// one blended material all their copies share (s6-roofs: whole sections, see
// the top). Each vertex reads its section's fade from the table (four to a
// vec4); the opaque draw drops a faded section's vertices (placed outside the
// view: no fragments and no discard, so the early depth test stays, as the
// trees' clumps), the blended copy draws only those, at 1 - fade x strength.
// Both variants of the roof's own material (opaque, and blended while it
// fades as a whole) drop them; the copy stays hidden during a whole fade.
export function fadeRoofMaterial(view, material) { sectionFade(view, material, { key: 'colonial-roof-sections' }); }
// The ceilings' one material (world/colonial-buildings.js ceiling): boards in
// their vertex colours, cut by CEILING_FADE's patch.
export function ceilingMaterial(view) {
 if (view.ceilingMaterial) return view.ceilingMaterial;
 const material = new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: 1 });
 ditherFade(view, material, { key: 'colonial-ceiling', ...CEILING_FADE });
 return (view.ceilingMaterial = material);
}
export function roofOverlayMaterial(view) {
 if (view.roofOverlay) return view.roofOverlay;
 const material = new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: 1 });
 sectionFade(view, material, { key: 'colonial-roof-sections', overlay: true });
 return (view.roofOverlay = material);
}
function sectionFade(view, material, { key, overlay = false }) {
 const { values } = roofSections(view), { fade, count } = roofFade(view), cut = f(ROOF_FADE.cut);
 if (overlay) overlayMaterial(material);
 const before = material.onBeforeCompile, beforeKey = material.customProgramCacheKey?.bind(material);
 material.onBeforeCompile = (shader, renderer) => {
  before?.call(material, shader, renderer);
  shader.uniforms.roofSections = { value: values };
  shader.uniforms.roofFade = { value: fade }; shader.uniforms.roofFadeCount = count;
  // (v0.999a, owner: "it should have the regular roof with a seamless
  // transition into a faded portion just for where the edge of it is". A
  // faded section no longer goes whole: its fade is a gate on a soft patch,
  // ROOF_PATCH, round the point of the roof on each character's line to the
  // camera. The rest of the section stays as it is; the patch's edge is a
  // smooth ramp drawn by the blended copy.)
  shader.vertexShader = shader.vertexShader
   .replace('#include <common>', `#include <common>\nattribute float roofSection;\nuniform vec4 roofSections[${SECTION_FADE.slots / 4}];\nvarying float vSectionFade;\nvarying vec3 vRoofWorld;`)
   .replace('#include <begin_vertex>', `#include <begin_vertex>
 #ifdef USE_INSTANCING
  vRoofWorld = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
 #else
  vRoofWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
 #endif`)
   .replace('#include <project_vertex>', `#include <project_vertex>
 int sectionIndex = int(roofSection + 0.5), sectionRow = sectionIndex / 4, sectionColumn = sectionIndex - sectionRow * 4;
 vec4 sectionFour = roofSections[sectionRow];
 vSectionFade = sectionColumn == 0 ? sectionFour.x : sectionColumn == 1 ? sectionFour.y : sectionColumn == 2 ? sectionFour.z : sectionFour.w;`);
  shader.fragmentShader = shader.fragmentShader
   .replace('#include <common>', `#include <common>\n${HOLE_UNIFORMS(ROOF_FADE.slots)}\nvarying float vSectionFade;\nvarying vec3 vRoofWorld;`)
   .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
 float sectionOpen = 0.0;
 if (vSectionFade > ${cut}) {
  ${holeLoop(ROOF_PATCH)}
  sectionOpen = roofOpen * vSectionFade;
 }
 ${overlay ? `if (sectionOpen <= ${cut}) discard;\n diffuseColor.a *= 1.0 - sectionOpen * ${f(SECTION_FADE.strength)};` : `if (sectionOpen > ${cut}) discard;`}`);
 };
 material.customProgramCacheKey = () => (beforeKey ? beforeKey() + '|' : '') + key + '|patch' + (overlay ? '|overlay' : '');
}

// Each faded mesh brings the list up to date before it is drawn (once a
// frame), and gets its blended copy (`overlay`: the copies' material; `skip`
// as fadeOverlay's). `meshes`: a root to walk or a list. With `sections`
// ({ start, end }: a colonial roof's, in the table) the copy shows while any
// of them is faded, and no hook is needed (prepareFades decides them).
export function fadeRoofMeshes(view, meshes, overlay = null, skip = null, sections = null) {
 const { update } = roofFade(view), list = [];
 if (Array.isArray(meshes)) list.push(...meshes); else meshes.traverse(m => list.push(m));
 for (const m of list) {
  if (!m.isMesh || m.userData.roofPrepass || m.userData.fadeOverlay) continue;
  if (sections) { if (overlay) fadeOverlay(view, m, overlay, skip, 'sections', sections); continue; }
  // (No wrapper unless the mesh has a hook of its own: the wrapper's rest
  // arguments were an array a mesh a frame.)
  const before = m.onBeforeRender;
  m.onBeforeRender = before === THREE.Object3D.prototype.onBeforeRender ? update : function (renderer, scene, camera, geometry, material, group) { update(); before.call(this, renderer, scene, camera, geometry, material, group); };
  if (overlay) fadeOverlay(view, m, overlay, skip, 'line');
 }
}

// The trees' fade (world/trees.js): `instanced` the leaf clumps (each clump's
// tree from its instance's `treeAt`; the whole clump fades together, worked
// out per vertex; a clump that fades is dropped from the opaque draw by its
// vertices, so the opaque pass keeps its early depth test), else the limbs
// (per fragment, easing to solid toward the trunk's foot).
export function treeFade(view, material, { key, instanced = false, strength, overlay = false }) {
 const { fade, count } = roofFade(view), S = ROOF_FADE.slots;
 if (overlay) overlayMaterial(material);
 // How far `t`'s tree is faded for the characters in the list, seen from a
 // point `h` m up (the clump's middle, the fragment): standing under its
 // crown, or behind it on the line to the camera.
 const under = `float treeUnder(vec4 t, float h) {
  float under = 0.0;
  if (t.z <= 0.0 || roofFadeCount <= 0) return 0.0;
  for (int i = 0; i < ${S}; i++) {
   if (i >= roofFadeCount) break;
   vec4 c = roofFade[i]; if (c.w <= 0.0) continue;
   float headY = c.z + ${f(ROOF_FADE.head)};
   vec2 toCamera = (cameraPosition.xz - c.xy) / max(cameraPosition.y - headY, 1.0);
   float d = min(length(c.xy - t.xy), length(c.xy + toCamera * max(0.0, h - headY) - t.xy));
   under = max(under, 1.0 - smoothstep(t.z - ${f(TREE_FADE.edge)}, t.z + ${f(TREE_FADE.out)}, d));
  }
  return under;
 }`;
 const before = material.onBeforeCompile, beforeKey = material.customProgramCacheKey?.bind(material);
 material.onBeforeCompile = (shader, renderer) => {
  before?.call(material, shader, renderer);
  shader.uniforms.roofFade = { value: fade }; shader.uniforms.roofFadeCount = count;
  if (instanced) {
   shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `#include <common>\n${HOLE_UNIFORMS(S)}\nattribute vec4 treeAt;\nvarying float vTreeFade;\n${under}`)
    .replace('#include <begin_vertex>', `#include <begin_vertex>
 float treeGone = treeUnder(treeAt, (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).y) * ${f(strength)};
 vTreeFade = treeGone;`)
    // (Dropped from this draw: placed outside the view, so it makes no fragments.)
    .replace('#include <project_vertex>', `#include <project_vertex>
 if (${overlay ? `treeGone <= ${f(ROOF_FADE.cut)}` : `treeGone > ${f(ROOF_FADE.cut)}`}) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);`);
   shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\nvarying float vTreeFade;')
    .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>${overlay ? '\n diffuseColor.a *= 1.0 - vTreeFade;' : ''}`);
  } else {
   // (The blended copy drops every tree nobody can be fading by its
   // vertices, a whole tree at once: nobody's line toward the camera, as
   // high as a tree grows, comes within its crown. Only faded trees reach
   // the rasterizer.)
   const far = overlay ? `
 bool treeFar(vec4 t) {
  if (t.z <= 0.0 || roofFadeCount <= 0) return true;
  for (int i = 0; i < ${S}; i++) {
   if (i >= roofFadeCount) break;
   vec4 c = roofFade[i]; if (c.w <= 0.0) continue;
   float headY = c.z + ${f(ROOF_FADE.head)};
   vec2 toCamera = (cameraPosition.xz - c.xy) / max(cameraPosition.y - headY, 1.0);
   vec2 ab = toCamera * max(0.0, t.w + ${f(TREE_TOP)} - headY);
   float l = dot(ab, ab), k = l > 0.0 ? clamp(dot(t.xy - c.xy, ab) / l, 0.0, 1.0) : 0.0;
   if (length(c.xy + ab * k - t.xy) < t.z + ${f(TREE_FADE.out + .1)}) return false;
  }
  return true;
 }` : '';
   shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `#include <common>\nattribute vec4 treeAt;\nvarying vec4 vTreeAt;\nvarying vec3 vRoofWorld;${overlay ? `\n${HOLE_UNIFORMS(S)}${far}` : ''}`)
    .replace('#include <begin_vertex>', `#include <begin_vertex>
 vTreeAt = treeAt;
 vRoofWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;`)
    .replace('#include <project_vertex>', `#include <project_vertex>${overlay ? '\n if (treeFar(treeAt)) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);' : ''}`);
   shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>\n${HOLE_UNIFORMS(S)}\nvarying vec4 vTreeAt;\nvarying vec3 vRoofWorld;\n${under}`)
    .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
 float treeGone = 0.0;
 if (roofFadeCount > 0 && vTreeAt.z > 0.0) treeGone = treeUnder(vTreeAt, vRoofWorld.y) * smoothstep(vTreeAt.w + ${f(TREE_FADE.from)}, vTreeAt.w + ${f(TREE_FADE.to)}, vRoofWorld.y);
 ${cutOrPatch('treeGone', strength, overlay)}`);
  }
 };
 material.customProgramCacheKey = () => (beforeKey ? beforeKey() + '|' : '') + key + (overlay ? '|overlay' : '');
}
