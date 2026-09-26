// Hollow Wick's colonial buildings (s2-buildings): New England about
// 1790-1820, abandoned. Used for every building with `style: 'colonial'`
// (world-build.js makeBuilding hands them here; Deadwater's buildings never
// come here). The data: maps/hollow-wick-buildings.js.
//
// What a building gets: clapboard walls (a shadow line every board; vertical
// boards on the barn; fieldstone below on the mill), corner boards and an eave
// frieze, small-pane sash windows (dark glass, panes missing, some shutters
// hanging, some shuttered shut), plank double doors standing open, a plank
// stoop under a little shed hood, a steep shingled roof (gable, saltbox with
// its long slope to the north, gambrel, lean-to, or the tomb's turf mound)
// with gable ends, rake boards, a ridge cap and seeded wear, and big brick or
// stone chimneys. Special pieces: the meetinghouse's open belfry tower and
// pedimented portico, the tavern's picture sign, the forge's hood and stack,
// the barn's hay door, the mill's loft door, the tomb's granite face.
//
// Everything is built in the building's own frame (x along its width, z along
// its depth, y up from its floor), then stood on its pad at baseY and turned.
// Walls, trim and dressing join the static group (merged by colour with the
// rest of the map); everything above the eaves (roof, gables, chimneys, the
// tower, hoods) is the roof group, which fades out when you go in, exactly
// like Deadwater's roofs (renderer.js update: roof.doors, roof.reach).
import * as THREE from 'three';
import { buildingOpenings, localOpenings } from '../map-kit.js';
import { bakeColors } from '../render/bake-colors.js';
import { ROOF_PREPASS_ORDER } from '../render/renderer.js';
import { makeDetailedInterior } from './detailed-interiors.js';
import { COLONIAL_TYPES } from './colonial-parts.js';
import { takeLifeParts } from './hollow-life.js'; // s5-life: loose shutters, the tavern's sign, chimney smoke
import { fadeRoofMaterial, fadeRoofMeshes, roofOverlayMaterial, registerOverlay } from './roof-fade.js';
import { mergeTransformed } from '../render/merge-transformed.js';

export const isColonialPart = type => !!COLONIAL_TYPES[type];

const pick = (list, n) => list[((n % list.length) + list.length) % list.length];
const T = .38; // wall thickness (map-kit.js buildingWalls)
const SILL = .5, HEAD = 1.75; // a window's opening (the low wall under it is a collider)
const GLASS = '#1d2124', MUNTIN = '#3a3632', IRON = '#34373a', PLANK = '#5a4a3a', PLANK_DARK = '#46392d';
const FLOOR = '#4f4336', STONES = ['#7f7b72', '#6a665c', '#5f5c56', '#77736a'];

const shades = new Map();
export function shade(hex, k) {
  const key = hex + k;
  if (!shades.has(key)) shades.set(key, '#' + new THREE.Color(hex).multiplyScalar(k).getHexString());
  return shades.get(key);
}
// The same wear every game for a building (seeded by its id).
function seeded(id) {
  let seed = 2166136261; for (const c of String(id)) seed = Math.imul(seed ^ c.charCodeAt(0), 16777619);
  return () => { seed = Math.imul(seed ^ seed >>> 15, 2246822507) + 0x6d2b79f5 | 0; return ((seed ^ seed >>> 13) >>> 0) / 4294967296; };
}
function glow(view, color, emissive, intensity) {
  const key = color + emissive + intensity, cache = view.colonialGlows ||= new Map();
  if (!cache.has(key)) cache.set(key, new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: intensity, roughness: 1, metalness: 0 }));
  return cache.get(key);
}

// A side's frame: where a point `along` the wall and `out` from its middle
// plane is, and the turn that faces a part outward (its +z out).
const SIDES = ['front', 'back', 'left', 'right'];
const TURN = { front: 0, back: Math.PI, left: -Math.PI / 2, right: Math.PI / 2 };
function sidePoint(b, side, along, out) {
  if (side === 'front') return [along, b.d / 2 + out];
  if (side === 'back') return [-along, -b.d / 2 - out];
  if (side === 'left') return [-b.w / 2 - out, along];
  return [b.w / 2 + out, -along];
}
// (Offsets as map-kit.js uses them: along x on the front and back, along z on
// the sides. sidePoint's `along` runs left to right as seen from outside, so
// an opening's offset is flipped where that differs.)
const alongOf = (side, offset) => side === 'back' || side === 'right' ? -offset : offset;
const sideLength = (b, side) => side === 'front' || side === 'back' ? b.w : b.d;

// A side's wall, cut at its doors and windows (as map-kit.js buildingWalls
// cuts it, so what is drawn is exactly what collides).
function sidePieces(b, side) {
  const span = sideLength(b, side), pieces = [];
  const openings = localOpenings(b).filter(o => o.side === side).map(o => ({ ...o, from: alongOf(side, o.offset) - o.width / 2, to: alongOf(side, o.offset) + o.width / 2 })).sort((p, q) => p.from - q.from);
  let cursor = -span / 2;
  for (const o of openings) {
    if (o.from > cursor) pieces.push({ from: cursor, to: o.from, kind: 'solid' });
    pieces.push({ from: o.from, to: o.to, kind: o.type, opening: o });
    cursor = o.to;
  }
  if (cursor < span / 2) pieces.push({ from: cursor, to: span / 2, kind: 'solid' });
  return pieces;
}

export function makeColonialBuilding(view, b) {
  const angle = b.angle || 0, baseY = b.baseY || 0;
  const rand = seeded(b.id), e = b.height, trim = b.trim || '#8a857a';
  const g = new THREE.Group(); view.static.add(g);
  const roof = new THREE.Group(); view.scene.add(roof);
  const box = (parent, x, y, z, w, h, d, color, rx = 0, ry = 0, rz = 0) => {
    const m = view.box(x, y, z, w, h, d, color, parent);
    if (rx || ry || rz) m.rotation.set(rx, ry, rz, 'YXZ');
    return m;
  };
  // A box on a side: `along` the wall, `out` from its middle plane.
  const onSide = (parent, side, along, y, out, w, h, d, color, rx = 0, rz = 0) => {
    const [x, z] = sidePoint(b, side, along, out);
    return box(parent, x, y, z, w, h, d, color, rx, TURN[side], rz);
  };
  const doorTop = b.open ? e - .3 : Math.min(2.15, e - .3);

  // The floor: wide old boards.
  const floor = view.mesh(new THREE.PlaneGeometry(b.w - .1, b.d - .1).rotateX(-Math.PI / 2), FLOOR, 0, .06, 0, g); floor.castShadow = false;
  for (let x = -b.w / 2 + .9; x < b.w / 2 - .2; x += .9) box(g, x, .062, 0, .02, .006, b.d - .5, shade(FLOOR, .8));

  // --- Walls -------------------------------------------------------------
  const board = b.finish === 'boards';
  // A run of wall from y0 to y1 between `from` and `to` along a side, with its
  // outer dressing: fieldstone (the mill, up to b.stone), clapboard or boards.
  const wallRun = (side, from, to, y0, y1) => {
    const len = to - from, mid = (from + to) / 2;
    if (len <= .01 || y1 - y0 <= .01) return;
    const stone = Math.min(Math.max(b.stone || 0, y0), y1);
    if (stone > y0) onSide(g, side, mid, (y0 + stone) / 2, 0, len, stone - y0, T, STONES[1]);
    if (y1 > stone) onSide(g, side, mid, (stone + y1) / 2, 0, len, y1 - stone, T, b.color);
    const face = T / 2 + .012;
    // Fieldstone: courses of blocks of three greys.
    for (let y = y0, row = 0; y < stone - .05; y += .32, row++) {
      const h = Math.min(.3, stone - y - .02);
      for (let a = from + (row % 2 ? .25 : 0) - .25; a < to; a += .55 + rand() * .3) {
        const l = Math.min(to, a + .5 + rand() * .3) - Math.max(from, a);
        if (l > .08) onSide(g, side, Math.max(from, a) + l / 2, y + h / 2 + .01, face, l - .04, h, .05, pick(STONES, row + Math.floor(a * 3)));
      }
    }
    if (board) { // vertical boards with battens
      for (let a = from + .2; a < to - .05; a += .42) onSide(g, side, a, (stone + y1) / 2, face, .06, y1 - stone - .02, .03, shade(b.color, .78));
    }
  };
  // Clapboard: each board's lower lip a darker line, run the length of the
  // wall wherever the wall is there at that height (one strip per run).
  const clapboard = side => {
    if (board) return;
    const pieces = sidePieces(b, side), lap = shade(b.color, .8), face = T / 2 + .012;
    for (let y = Math.max(.26, Math.ceil(((b.stone || 0) + .1) / .26) * .26); y < e - .08; y += .26) {
      let run = null;
      const flush = () => { if (run && run[1] - run[0] > .1) onSide(g, side, (run[0] + run[1]) / 2, y, face, run[1] - run[0] - .02, .035, .025, lap); run = null; };
      for (const p of pieces) {
        const there = p.kind === 'solid' || (p.kind === 'window' && !p.opening.collapsed && (y < SILL - .03 || y > HEAD + .03)) || (p.kind === 'door' && y > doorTop + .03);
        if (!there) { flush(); continue; }
        if (run && Math.abs(run[1] - p.from) < 1e-6) run[1] = p.to; else { flush(); run = [p.from, p.to]; }
      }
      flush();
    }
  };
  for (const side of SIDES) {
    clapboard(side);
    for (const piece of sidePieces(b, side)) {
      if (piece.kind === 'solid') wallRun(side, piece.from, piece.to, 0, e);
      else if (piece.kind === 'window') {
        const o = piece.opening;
        if (o.collapsed) collapsedWall(view, b, g, side, piece, rand, onSide);
        else { wallRun(side, piece.from, piece.to, 0, SILL); wallRun(side, piece.from, piece.to, HEAD, e); sash(view, b, g, side, piece, rand, onSide, trim); }
      } else {
        wallRun(side, piece.from, piece.to, doorTop, e);
        doorway(view, b, g, roof, side, piece, rand, onSide, trim, doorTop);
      }
    }
    // A door shut and barred from within (`shutDoors`, s5-interiors: the
    // farm's back door): plank leaf, battens and frame on the outer face, no
    // opening and no stoop (the interior draws its bar).
    for (const d of (b.shutDoors || []).filter(d => d.side === side)) {
      const a = alongOf(side, d.offset || 0), dw = d.width || 1, top = Math.min(2.05, e - .35);
      onSide(g, side, a, top / 2, T / 2 + .03, dw, top, .04, PLANK_DARK);
      for (let k = -1; k <= 1; k += 2) onSide(g, side, a + k * dw / 4, top / 2, T / 2 + .055, .02, top - .08, .02, PLANK);
      for (const y of [.35, top - .4]) onSide(g, side, a, y, T / 2 + .06, dw - .1, .12, .03, PLANK);
      for (const s of [-1, 1]) onSide(g, side, a + s * (dw / 2 + .05), top / 2, T / 2 + .04, .12, top, .1, trim);
      onSide(g, side, a, top + .08, T / 2 + .05, dw + .34, .16, .12, trim);
    }
    // Shuttered-shut windows are plain wall behind closed plank shutters.
    for (const o of (b.windows || []).filter(o => o.side === side && o.boarded)) {
      const a = alongOf(side, o.offset);
      for (const s of [-1, 1]) onSide(g, side, a + s * o.width / 4, (SILL + HEAD) / 2, T / 2 + .05, o.width / 2 - .02, HEAD - SILL, .05, shade(trim, .62));
      onSide(g, side, a, (SILL + HEAD) / 2, T / 2 + .09, o.width + .1, .1, .04, shade(trim, .5), 0, .5);
      onSide(g, side, a, HEAD + .08, T / 2 + .06, o.width + .3, .14, .1, trim);
      onSide(g, side, a, SILL - .03, T / 2 + .08, o.width + .2, .06, .2, trim);
    }
  }
  // Corner boards, and the frieze board under the eaves.
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(g, sx * b.w / 2, e / 2, sz * b.d / 2, T + .1, e, T + .1, trim);
  const eaves = b.roof?.axis === 'z' ? ['left', 'right'] : ['front', 'back'];
  if (b.roof?.kind !== 'mound') for (const side of eaves) onSide(g, side, 0, e - .12, T / 2 + .04, sideLength(b, side) + .1, .24, .08, trim);
  if (b.stone) for (const side of SIDES) onSide(g, side, 0, b.stone + .04, T / 2 + .05, sideLength(b, side) + .08, .1, .12, STONES[0]);

  // --- Roof --------------------------------------------------------------
  const r = b.roof || { kind: 'gable', axis: 'x', rise: 2.5 };
  const yaw = r.axis === 'z' ? Math.PI / 2 : 0, cy = Math.cos(yaw), sy = Math.sin(yaw);
  const L = r.axis === 'z' ? b.d : b.w, H = (r.axis === 'z' ? b.w : b.d) / 2;
  // A box in the roof's frame: X along the ridge, Z across it (+Z is the
  // building's front for a ridge along x, its right for a ridge along z).
  const rb = (x, y, z, w, h, d, color, rx = 0, parent = roof) => box(parent, x * cy + z * sy, y, -x * sy + z * cy, w, h, d, color, rx, yaw);
  const profile = roofProfile(r, H, e);
  const heightAt = z => profileHeight(profile, z);
  const tones = [b.roofColor, shade(b.roofColor, 1.1), shade(b.roofColor, .9)];
  if (r.kind === 'mound') moundRoof(b, rb, L, H, e, r, rand);
  else {
    const gOver = .3, len = L + 2 * gOver;
    // The eaves run on past the walls, down the slope (less on a side facing
    // north: eaveRun).
    const pts = profile.map(p => p.slice());
    const ext = (i, j, over) => { const dz = pts[i][0] - pts[j][0], dy = pts[i][1] - pts[j][1], k = over / Math.abs(dz); pts[i] = [pts[i][0] + dz * k, pts[i][1] + dy * k]; };
    ext(0, 1, eaveRun(b, 1)); ext(pts.length - 1, pts.length - 2, eaveRun(b, -1));
    for (let i = 1; i < pts.length; i++) {
      let [za, ya] = pts[i - 1], [zb, yb] = pts[i];
      if (za > zb) [za, ya, zb, yb] = [zb, yb, za, ya];
      const seg = Math.hypot(zb - za, yb - ya), th = Math.atan2(-(yb - ya), zb - za), nY = Math.cos(th), nZ = Math.sin(th), dz = (zb - za) / seg, dyv = (yb - ya) / seg;
      rb(0, (ya + yb) / 2 + nY * .07, (za + zb) / 2 + nZ * .07, len, .14, seg + .02, shade(b.roofColor, .7), th);
      // Shingle courses, laid in runs of random length, three tones; a few
      // missing (the dark boards show) or lifted.
      for (let s = .14, row = 0; s < seg - .05; s += .3, row++) {
        const zc = za + dz * s, yc = ya + dyv * s;
        for (let x = -len / 2 + (row % 2) * .4 - .4; x < len / 2; ) {
          const piece = 1.2 + rand() * 2, x0 = Math.max(-len / 2, x), x1 = Math.min(len / 2, x + piece); x += piece + .03;
          if (x1 - x0 < .15) continue;
          const roll = rand(), missing = roll < .025, lifted = roll > .975, tone = pick(tones, row + Math.floor(x0 * 1.7));
          if (missing && x1 - x0 > .8) {
            // A shingle or two gone from the run (0.25-0.6 m), the dark board
            // under it showing, not the whole 1-3 m run (stage 5 review: long
            // black slots read as holes on the lighter roofs).
            const g = .25 + rand() * .35, g0 = x0 + .2 + rand() * (x1 - x0 - g - .4), g1 = g0 + g;
            for (const [a, b2] of [[x0, g0], [g1, x1]]) view.noShadows(rb((a + b2) / 2, yc + nY * .16, zc + nZ * .16, b2 - a, .035, .34, tone, th));
            view.noShadows(rb((g0 + g1) / 2, yc + nY * .142, zc + nZ * .142, g, .035, .34, shade(b.roofColor, .45), th));
            continue;
          }
          const m = rb((x0 + x1) / 2, yc + nY * .16, zc + nZ * .16, x1 - x0, .035, .34, tone, th + (lifted ? .12 : 0));
          view.noShadows(m);
        }
      }
      // Rake boards up each gable edge.
      for (const sx of [-1, 1]) view.noShadows(rb(sx * (len / 2 + .02), (ya + yb) / 2 + nY * .12, (za + zb) / 2 + nZ * .12, .09, .24, seg, trim, th));
    }
    // Fascia along the eaves, the ridge cap (and the gambrel's knuckles).
    for (const i of [0, pts.length - 1]) view.noShadows(rb(0, pts[i][1] - .02, pts[i][0], len, .2, .07, trim));
    for (let i = 1; i < profile.length - 1; i++) view.noShadows(rb(0, profile[i][1] + .2, profile[i][0], len + .04, .12, .3, shade(b.roofColor, .75)));
    // The gable ends: the wall carried up under the roof, clapboarded.
    for (const sx of [-1, 1]) gable(view, b, roof, rb, profile, sx * L / 2, e, sx, board);
  }
  const smoke = []; // s5-life: the tops of flues that smoke (a chimney's `smoke`), in the building's frame
  for (const c of b.chimneys || []) { const [x, y, z] = chimney(b, rb, c, heightAt, e, rand); if (c.smoke) smoke.push(new THREE.Vector3(x * cy + z * sy, y, -x * sy + z * cy)); }

  // --- Special pieces ----------------------------------------------------
  const features = b.features || [];
  if (features.includes('belfry')) belfry(view, b, g, roof, box, e, heightAt(0), trim);
  if (features.includes('portico')) portico(view, b, g, roof, box, e, trim);
  if (features.includes('tavern-sign')) tavernSign(view, b, g, box);
  if (features.includes('forge-stack')) {
    // The hood over the hearth (forge-hearth prop at local (-1.3, -.35)) and its stack up through the roof.
    box(g, -1.3, 1.95, -.35, 1.4, .5, 1.1, STONES[2]); box(g, -1.3, 1.62, -.35, 1.5, .1, 1.2, STONES[1]);
    box(g, -1.3, 2.3, -.35, .8, .5, .7, STONES[2]);
    box(roof, -1.3, (e - .3 + heightAt(-.35) + .9) / 2, -.35, .7, heightAt(-.35) + 1.2 - e, .6, STONES[0]);
    box(roof, -1.3, heightAt(-.35) + .95, -.35, .84, .12, .74, STONES[2]);
  }
  if (features.includes('hay-door')) { // high in the north gable, hanging open
    box(roof, 0, e + 1.15, -b.d / 2 - T / 2 - .02, 1.5, 1.3, .04, '#16140f');
    box(roof, -1.15, e + 1.15, -b.d / 2 - .45, .75, 1.3, .06, shade(b.color, .8), 0, 1.2);
    box(roof, 0, heightAt(0) - .45, -b.d / 2 - .6, .16, .16, 1.3, PLANK_DARK);
  }
  if (features.includes('loft-door')) { // the mill's east gable: a loft door and the hoist beam over it
    box(roof, b.w / 2 + T / 2 + .02, e + .75, 0, .04, 1.2, 1.1, '#16140f');
    box(roof, b.w / 2 + .6, e + 1.55, 0, 1.2, .16, .16, PLANK_DARK);
    box(roof, b.w / 2 + 1.1, e + 1.1, 0, .03, .9, .03, '#5c5446');
  }
  if (features.includes('granite-face')) graniteFace(b, g, onSide, e, rand);

  // The shell (walls, clapboard, trim, sashes, doors) opens round anyone
  // standing behind it, as the roof does (renderer.js bakeKind 'wall',
  // world/roof-fade.js WALL_FADE).
  g.traverse(o => { if (o.isMesh) o.userData.wallFade = true; });

  // --- The roof's fade (as world-build.js makeBuilding) --------------------
  g.position.set(b.x, baseY, b.z); g.rotation.y = angle;
  roof.position.set(b.x, baseY, b.z); roof.rotation.y = angle;
  // s5-life: the parts marked to move (a loose shutter, the tavern's sign)
  // leave the static group, and smoking flues start their smoke
  // (world/hollow-life.js).
  takeLifeParts(view, g, smoke.map(v => g.localToWorld(v)), b.id);
  shellOverlay(view, g);
  registerRoof(view, b, roof);

  // The interior (the interiors builder's styles; detailed-interiors.js):
  // built at angle 0 round (b.x, b.z), then stood on the pad and turned.
  if (b.interiorStyle) {
    const before = new Set(view.static.children);
    makeDetailedInterior(view, { ...b, angle: 0 });
    const pivot = new THREE.Group(); pivot.position.set(b.x, baseY, b.z); pivot.rotation.y = angle;
    for (const mesh of [...view.static.children].filter(m => !before.has(m))) { mesh.position.x -= b.x; mesh.position.z -= b.z; pivot.add(mesh); }
    view.static.add(pivot);
    // Furniture under a closed roof never sees the sun: no shadow casters.
    view.noShadows(pivot);
  }
}

// The roof's top line at the walls, front (+Z) to back: [[z, y], ...].
// How far an eave runs past its wall (m, level): `side` +1 for the eave at the
// roof's +Z (the building's front for a ridge along x, its right for one
// along z), -1 the other. A saltbox's long back slope runs on further (the
// lean-to's look). An eave facing north runs on less (owner, stage 5 review):
// the camera looks from the south, so the slope turned away from it hid the
// strip under its eave, and whoever stood there, from everyone.
export const EAVE = Object.freeze({ run: .45, north: .2, saltbox: .45, saltboxNorth: .2 });
export function eaveRun(b, side) {
  const r = b.roof || {}, a = b.angle || 0;
  // The eave's outward way in the building's frame, then its world z (-z is north).
  const lx = r.axis === 'z' ? side : 0, lz = r.axis === 'z' ? 0 : side, north = -lx * Math.sin(a) + lz * Math.cos(a) < -.5;
  const back = r.kind === 'saltbox' && side < 0 ? (north ? EAVE.saltboxNorth : EAVE.saltbox) : 0;
  return (north ? EAVE.north : EAVE.run) + back;
}
function roofProfile(r, H, e) {
  const R = r.rise;
  if (r.kind === 'saltbox') return [[H, e], [H * .32, e + R], [-H, e]];
  if (r.kind === 'gambrel') return [[H, e], [H * .58, e + R * .7], [0, e + R], [-H * .58, e + R * .7], [-H, e]];
  if (r.kind === 'shed') return r.high === 'front' ? [[H, e + R], [-H, e]] : [[H, e], [-H, e + R]];
  if (r.kind === 'mound') return [[H, e], [0, e + R], [-H, e]];
  return [[H, e], [0, e + R], [-H, e]];
}
function profileHeight(profile, z) {
  for (let i = 1; i < profile.length; i++) {
    const [za, ya] = profile[i - 1], [zb, yb] = profile[i];
    if ((z <= za && z >= zb) || (z >= za && z <= zb)) return za === zb ? Math.max(ya, yb) : ya + (yb - ya) * (z - za) / (zb - za);
  }
  return profile[0][1];
}
// Where a profile stands above height y: [zMin, zMax].
function profileSpan(profile, y) {
  const zs = [];
  for (let i = 1; i < profile.length; i++) {
    const [za, ya] = profile[i - 1], [zb, yb] = profile[i];
    if ((y - ya) * (y - yb) <= 0 && ya !== yb) zs.push(za + (zb - za) * (y - ya) / (yb - ya));
  }
  if (profile[0][1] >= y) zs.push(profile[0][0]);
  if (profile.at(-1)[1] >= y) zs.push(profile.at(-1)[0]);
  return zs.length ? [Math.min(...zs), Math.max(...zs)] : null;
}

// A gable end at roof-frame x: the wall's triangle (or a shed's slope) above
// the eave, with its clapboard lines (or boards).
function gable(view, b, roof, rb, profile, x, e, sx, board) {
  const poly = [...(profile[0][1] > e ? [[profile[0][0], e]] : []), ...profile, ...(profile.at(-1)[1] > e ? [[profile.at(-1)[0], e]] : [])];
  const shape = new THREE.Shape();
  poly.forEach(([z, y], i) => (i ? shape.lineTo(z, y - e) : shape.moveTo(z, y - e)));
  shape.closePath();
  const m = view.mesh(new THREE.ExtrudeGeometry(shape, { depth: T, bevelEnabled: false }), b.color, 0, 0, 0, roof);
  // Shape x is the roof's Z; the extrusion runs toward roof -X.
  const yaw = b.roof?.axis === 'z' ? Math.PI / 2 : 0, px = x + T / 2;
  m.position.set(px * Math.cos(yaw), e, -px * Math.sin(yaw)); m.rotation.y = yaw - Math.PI / 2;
  const top = Math.max(...profile.map(p => p[1]));
  const face = x + sx * (T / 2 + .012);
  if (board) {
    const [z0, z1] = [profile.at(-1)[0], profile[0][0]];
    for (let z = Math.min(z0, z1) + .2; z < Math.max(z0, z1) - .05; z += .42) {
      const h = profileHeight(profile, z) - e - .08;
      if (h > .1) view.noShadows(rb(face, e + h / 2, z, .03, h, .06, shade(b.color, .78)));
    }
    return;
  }
  for (let y = e + .21; y < top - .12; y += .21) {
    const span = profileSpan(profile, y + .03); if (!span) continue;
    const l = span[1] - span[0] - .1; if (l < .12) continue;
    view.noShadows(rb(face, y, (span[0] + span[1]) / 2, .025, .035, l, shade(b.color, .8)));
  }
}

// A big chimney: brick or stone, from under the roof to above the ridge,
// with a corbelled cap and dark flues.
function chimney(b, rb, c, heightAt, e, rand) {
  const across = c.across || 0, ridge = heightAt(across), top = Math.max(ridge + .75, heightAt(across + c.d / 2) + .6);
  const base = e - .4, h = top - base, colour = c.kind === 'stone' ? STONES[0] : '#6e4436';
  rb(c.at, base + h / 2, across, c.w, h, c.d, colour);
  if (c.kind === 'stone') { // rough stacked courses
    for (let y = ridge - .5, i = 0; y < top - .3; y += .34, i++) rb(c.at + (rand() - .5) * .06, y, across + (rand() - .5) * .06, c.w + .05, .3, c.d + .05, STONES[i % 4]);
  } else for (let y = ridge - .4; y < top - .3; y += .3) rb(c.at, y, across, c.w + .02, .03, c.d + .02, '#5a372c');
  rb(c.at, top - .1, across, c.w + .16, .18, c.d + .16, c.kind === 'stone' ? STONES[2] : '#5a372c');
  const flues = c.w > 1.25 ? [-c.w / 4, c.w / 4] : [0];
  for (const f of flues) rb(c.at + f, top + .01, across, Math.min(.36, c.w / 2 - .12), .02, c.d - .4, '#141312');
  return [c.at + flues[0], top + .01, across]; // s5-life: the first flue's top, in the roof's frame (where smoke leaves)
}

// The tomb vault's roof: a turf mound banked over it, with a few stones.
function moundRoof(b, rb, L, H, e, r, rand) {
  const turf = b.roofColor, earth = '#544a37';
  rb(0, e + .08, 0, L + .7, .3, 2 * H + .7, earth);
  rb(0, e + .3, 0, L + .3, .3, 2 * H + .3, shade(turf, .92));
  rb(0, e + .52, -.1, L - .4, .3, 2 * H - .5, turf);
  rb(0, e + r.rise, -.15, L - 1.3, .25, 2 * H - 1.4, shade(turf, 1.08));
  for (let i = 0; i < 7; i++) { const s = .15 + rand() * .2; rb((rand() - .5) * (L - .6), e + .6 + rand() * .2, (rand() - .5) * (2 * H - .6), s * 1.6, s, s * 1.2, STONES[i % 4]); }
  // Dry grass tufts on the turf.
  for (let i = 0; i < 12; i++) rb((rand() - .5) * (L - .2), e + .75, (rand() - .5) * (2 * H - .2), .04, .3, .04, i % 2 ? '#8a7a4e' : '#7d7658', .3 * (rand() - .5));
}

// A window: casing, sill, head, 9-over-6 sash with dark glass and missing
// panes, maybe one shutter hanging.
function sash(view, b, g, side, piece, rand, onSide, trim) {
  const a = (piece.from + piece.to) / 2, wd = piece.to - piece.from, o = T / 2;
  onSide(g, side, a, HEAD + .09, o + .05, wd + .3, .16, .12, trim);
  onSide(g, side, a, HEAD + .19, o + .08, wd + .38, .05, .18, trim);
  onSide(g, side, a, SILL + .02, o + .07, wd + .22, .06, .22, trim);
  for (const s of [-1, 1]) onSide(g, side, a + s * (wd / 2 + .04), (SILL + HEAD) / 2, o + .04, .1, HEAD - SILL, .1, trim);
  // The sash: three panes across, three rows over two.
  const mid = 1.13;
  for (const s of [-1, 1]) onSide(g, side, a + s * wd / 6, (SILL + HEAD) / 2, -.02, .035, HEAD - SILL, .035, MUNTIN);
  for (const y of [.87, 1.0 + .47, mid]) onSide(g, side, a, y, -.02, wd, y === mid ? .06 : .035, .04, MUNTIN);
  const glass = piece.opening.lit ? glow(view, '#6a4a22', '#d9a24a', 1.3) : GLASS;
  // Dark glass in each sash; here and there a pane broken out.
  for (const [y0, y1] of [[SILL, mid], [mid, HEAD]]) {
    const gone = piece.opening.lit ? -1 : Math.floor(rand() * 5) - 1;
    if (gone < 0) { onSide(g, side, a, (y0 + y1) / 2, -.03, wd - .04, y1 - y0 - .03, .015, glass); continue; }
    const c = gone % 3 - 1; // one column out: glass either side of it
    for (let k = -1; k <= 1; k++) if (k !== c) onSide(g, side, a + k * wd / 3, (y0 + y1) / 2, -.03, wd / 3 - .02, y1 - y0 - .03, .015, glass);
  }
  if (rand() < .45) { // one shutter left, hanging off a hinge
    const s = rand() < .5 ? -1 : 1, tilt = s * (.08 + rand() * .12);
    // (s5-life: a `loose` window's shutter is the moving one below instead.)
    if (!piece.opening.loose) onSide(g, side, a + s * (wd / 2 + .28), (SILL + HEAD) / 2 - .05, o + .1, wd / 2 + .02, HEAD - SILL - .05, .05, shade(trim, .62), 0, tilt);
  }
  // s5-life: a loose shutter (`loose`: the side it hangs on, -1 or 1) swings
  // in the wind from its one top hinge. Only its hinge is marked here; the
  // shutter is built and moved by world/hollow-life.js (takeLifeParts).
  if (piece.opening.loose) {
    const s = piece.opening.loose, [x, z] = sidePoint(b, side, a + s * (wd / 2 + .09), o + .1), hinge = new THREE.Group();
    hinge.position.set(x, HEAD - .075, z); hinge.rotation.y = TURN[side];
    hinge.userData.lifeShutter = { s, width: wd / 2 + .02, height: HEAD - SILL - .05, colour: shade(trim, .62) };
    g.add(hinge);
  }
}

// The fallen-in wall (the tomb): a heap of stones over the low collider,
// the jagged ends of the wall either side.
function collapsedWall(view, b, g, side, piece, rand, onSide) {
  const a = (piece.from + piece.to) / 2, wd = piece.to - piece.from;
  for (let i = 0; i < 14; i++) {
    const s = .16 + rand() * .18, [x, z] = sidePoint(b, side, a + (rand() - .5) * wd, (rand() - .5) * .9);
    const m = view.mesh(new THREE.DodecahedronGeometry(s, 0), STONES[i % 4], x, .12 + rand() * .3, z, g); m.scale.set(1, .7, 1); m.rotation.set(rand() * 3, rand() * 3, 0);
  }
  for (const s of [-1, 1]) for (let k = 0; k < 3; k++) onSide(g, side, a + s * (wd / 2 - .1 - k * .08), .9 + k * .5, 0, .25, .5, T - .04, STONES[(k + 1) % 4]);
}

// A doorway: casing and lintel, plank double doors standing open (a single
// leaf in a narrow one), and on a house a plank stoop under a shed hood.
function doorway(view, b, g, roof, side, piece, rand, onSide, trim, doorTop) {
  const a = (piece.from + piece.to) / 2, wd = piece.to - piece.from, o = T / 2, e = b.height;
  if (b.open) { // a beam over the open side
    onSide(g, side, a, doorTop + .15, o - .05, wd + .1, .3, .22, PLANK_DARK);
    return;
  }
  for (const s of [-1, 1]) onSide(g, side, a + s * (wd / 2 + .05), doorTop / 2, o + .04, .14, doorTop, .12, trim);
  onSide(g, side, a, doorTop + .1, o + .06, wd + .4, .2, .14, trim);
  // The tower's door (meetinghouse, east) and the portico's (south) get no hood.
  const tower = b.features?.includes('belfry') && side === 'right', portico = b.features?.includes('portico') && side === 'front';
  if (!tower && !portico) onSide(g, side, a, doorTop + .26, o + .12, wd + .6, .1, .22, trim);
  // The doors, open outward (a narrow doorway has one leaf).
  const leaves = wd > 1.7 ? [-1, 1] : [rand() < .5 ? -1 : 1];
  const lw = wd / leaves.length - .04;
  for (const s of leaves) {
    const phi = (b.roof?.kind === 'mound' ? 2.75 : 2.8 + rand() * .25), ux = -s * Math.cos(phi), uz = Math.sin(phi);
    const along = a + s * wd / 2 + ux * lw / 2, out = o + .06 + uz * lw / 2;
    const [x, z] = sidePoint(b, side, along, out);
    const leaf = new THREE.Group(); leaf.position.set(x, 0, z); leaf.rotation.y = TURN[side] + Math.atan2(-uz, ux); g.add(leaf);
    const sag = rand() < .3 ? (rand() - .5) * .12 : 0; leaf.rotation.z = sag;
    view.box(0, (doorTop - .06) / 2, 0, lw, doorTop - .1, .06, PLANK, leaf);
    for (let k = -1; k <= 1; k += 2) view.box(k * lw / 4, (doorTop - .06) / 2, .04, .02, doorTop - .14, .02, PLANK_DARK, leaf);
    for (const y of [.35, doorTop - .4]) view.box(0, y, -.045, lw - .1, .14, .04, PLANK_DARK, leaf);
    view.box(-s * .0 + (s > 0 ? -1 : 1) * (lw / 2 - .08), doorTop * .5, .05, .05, .05, .04, IRON, leaf);
  }
  if (tower || portico || b.finish === 'boards' || b.roof?.kind === 'mound') return;
  // The stoop: a plank step, and a shed hood over the door (in the roof
  // group: it lifts with the roof when you stand in the doorway).
  // (`stoopRun[side]`: the step runs on that far past the door's +along side:
  // the gambrel's, where the rocking chair sits.)
  const run = b.stoopRun?.[side] || 0, stoop = sidePoint(b, side, a + run / 2, o + .55);
  const ry = TURN[side];
  const step = view.box(stoop[0], .09, stoop[1], wd + .7 + run, .18, 1.0, PLANK, g); step.rotation.y = ry;
  for (let k = 1; k <= Math.floor(run / .5); k++) { const [x, z] = sidePoint(b, side, a + (wd + .7) / 2 + k * .5 - .25, o + .55); const l = view.box(x, .185, z, .02, .01, .96, PLANK_DARK, g); l.rotation.y = ry; }
  for (let k = -2; k <= 2; k++) { const [x, z] = sidePoint(b, side, a + k * (wd + .5) / 5, o + .55); const l = view.box(x, .185, z, .02, .01, .96, PLANK_DARK, g); l.rotation.y = ry; }
  const [x, z] = sidePoint(b, side, a, o + .42);
  const hood = view.box(x, doorTop + .4, z, wd + .9, .08, .9, shade(b.roofColor, .95), roof); hood.rotation.set(.34, ry, 0, 'YXZ');
  for (let k = -3; k <= 3; k++) { const [sx2, sz2] = sidePoint(b, side, a + k * (wd + .8) / 7, o + .45); const sh = view.box(sx2, doorTop + .45, sz2, (wd + .8) / 7 - .03, .03, .84, shade(b.roofColor, k % 2 ? 1.1 : .9), roof); sh.rotation.set(.34, ry, 0, 'YXZ'); view.noShadows(sh); }
  for (const s of [-1, 1]) { const [bx, bz] = sidePoint(b, side, a + s * (wd / 2 + .3), o + .22); const k = view.box(bx, doorTop + .18, bz, .07, .07, .5, trim, roof); k.rotation.set(-.7, ry, 0, 'YXZ'); }
}

// The meetinghouse's belfry: a square tower rising from the east gable, its
// open bell stage with a bell, a cap and a spire with a vane (no letters).
function belfry(view, b, g, roof, box, e, ridge, trim) {
  const s = 3.2, x = b.w / 2 - s / 2, base = e - .2, stage = ridge + .5, open = 1.9;
  box(roof, x, (base + stage) / 2, 0, s, stage - base, s, b.color);
  for (let y = base + .25; y < stage - .1; y += .21) for (const [dx, dz, w, d] of [[s / 2 + .012, 0, .025, s], [0, s / 2 + .012, s, .025], [0, -s / 2 - .012, s, .025]]) view.noShadows(box(roof, x + dx, y, dz, w, .035, d, shade(b.color, .82)));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(roof, x + sx * s / 2, (base + stage) / 2, sz * s / 2, .2, stage - base, .2, trim);
  box(roof, x, stage + .05, 0, s + .3, .12, s + .3, trim);
  // The open stage: corner posts, a low rail each side, the bell on its beam.
  const ps = s - .4;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(roof, x + sx * ps / 2, stage + open / 2, sz * ps / 2, .26, open, .26, b.color);
  for (const [dx, dz, w, d] of [[ps / 2, 0, .12, ps], [-ps / 2, 0, .12, ps], [0, ps / 2, ps, .12], [0, -ps / 2, ps, .12]]) {
    box(roof, x + dx, stage + .5, dz, w, .08, d, trim);
    for (let k = -2; k <= 2; k++) box(roof, x + dx + (w < .5 ? 0 : k * ps / 6), stage + .28, dz + (w < .5 ? k * ps / 6 : 0), .05, .42, .05, b.color);
  }
  box(roof, x, stage + open - .2, 0, ps, .16, .16, PLANK_DARK);
  view.mesh(new THREE.CylinderGeometry(.24, .48, .65, 10), '#4a3d2a', x, stage + open - .6, 0, roof);
  view.mesh(new THREE.SphereGeometry(.12, 6, 4), '#3a2f22', x, stage + .9, 0, roof);
  // The cap: an eave, a low roof, the octagonal spire and its vane.
  box(roof, x, stage + open + .1, 0, s + .4, .2, s + .4, trim);
  view.mesh(new THREE.CylinderGeometry(s * .42, s * .68, .55, 4), b.roofColor, x, stage + open + .47, 0, roof).rotation.y = Math.PI / 4;
  view.mesh(new THREE.ConeGeometry(.9, 2.3, 8), b.roofColor, x, stage + open + 1.85, 0, roof);
  box(roof, x, stage + open + 3.2, 0, .04, .5, .04, IRON);
  box(roof, x, stage + open + 3.3, 0, .6, .05, .03, IRON); box(roof, x + .3, stage + open + 3.3, 0, .12, .16, .02, IRON);
  // Down the east wall: the tower's face, flush, to the ground (pilasters),
  // with a pediment over the east door.
  for (const sz of [-1, 1]) box(g, b.w / 2 + .03, e / 2, sz * (s / 2 - .1), .34, e, .24, trim);
  box(g, b.w / 2 + .05, e - .2, 0, .36, .3, s, trim);
  const tri = new THREE.Shape(); tri.moveTo(-1.5, 0); tri.lineTo(1.5, 0); tri.lineTo(0, .55); tri.closePath();
  view.mesh(new THREE.ExtrudeGeometry(tri, { depth: .14, bevelEnabled: false }), trim, b.w / 2 + .33, 2.45, 0, g).rotation.y = -Math.PI / 2;
}

// The meetinghouse's south portico: a platform, four columns, half walls
// each side (their colliders: the colonialPortico prop), an entablature and
// a pediment roof (in the roof group).
function portico(view, b, g, roof, box, e, trim) {
  const z0 = b.d / 2, depth = 1.7, half = 2.6, zc = z0 + depth / 2;
  box(g, 0, .11, zc, 2 * half + .3, .22, depth, STONES[3]);
  box(g, 0, .05, z0 + depth + .25, 2 * half - .6, .1, .5, STONES[1]);
  for (const sx of [-1, 1]) {
    for (const z of [z0 + depth - .2]) view.cylinder(sx * 2.45, (.22 + e - .35) / 2, z, .17, e - .57, b.color, g, 10);
    box(g, sx * 2.45, e - .35 - .05, z0 + depth - .2, .42, .12, .42, trim);
    box(g, sx * 2.45, .3, z0 + depth - .2, .42, .16, .42, trim);
    box(g, sx * 2.45, .85 / 2 + .1, z0 + depth / 2 - .15, .3, .85 - .1, depth - .5, b.color);
    box(g, sx * 2.45, .88, z0 + depth / 2 - .15, .38, .07, depth - .45, trim);
    box(g, sx * 2.45, (e - .35) / 2, z0 + .25, .34, e - .35, .24, trim);
  }
  // Entablature and pediment.
  box(roof, 0, e - .2, z0 + depth - .2, 2 * half + .4, .34, .3, trim);
  const rise = 1.25, run = half + .35, th = Math.atan2(rise, run), len = Math.hypot(rise, run);
  for (const sx of [-1, 1]) {
    const m = box(roof, sx * run / 2, e + rise / 2 + .02, z0 + depth / 2 - .5, len, .12, depth + 1.3, b.roofColor);
    m.rotation.set(0, 0, -sx * th, 'YXZ');
    for (let k = 0; k < 5; k++) { const t = (k + .5) / 5, s2 = box(roof, sx * run * (1 - t), e + rise * t + .1, z0 + depth / 2 - .5, len / 5 - .03, .03, depth + 1.3, shade(b.roofColor, k % 2 ? 1.08 : .94)); s2.rotation.set(0, 0, -sx * th, 'YXZ'); view.noShadows(s2); }
  }
  const tri = new THREE.Shape(); tri.moveTo(-half, 0); tri.lineTo(half, 0); tri.lineTo(0, rise - .05); tri.closePath();
  view.mesh(new THREE.ExtrudeGeometry(tri, { depth: .2, bevelEnabled: false }), b.color, 0, e - .03, z0 + depth - .32, roof);
  const round = view.mesh(new THREE.CylinderGeometry(.34, .34, .06, 12), trim, 0, e + .38, z0 + depth - .1, roof); round.rotation.x = Math.PI / 2;
}

// The tavern's hanging sign: a picture, never letters: a candle burning in
// its stick (Hollow Wick), on a dark board under an iron bracket.
function tavernSign(view, b, g, box) {
  const x = -4.1, z0 = b.d / 2 + T / 2, y = 2.85;
  box(g, x, y, z0 + .6, .06, .06, 1.2, IRON);
  const brace = box(g, x, y - .35, z0 + .35, .04, .04, .9, IRON); brace.rotation.x = .75;
  // s5-life: the sign and its two hooks hang in their own group from the arm
  // (its pivot), which world/hollow-life.js takes out of the static merge and
  // swings in the wind.
  const hang = new THREE.Group(); hang.position.set(x, y, z0 + .95); hang.userData.lifeSwing = 'sign'; g.add(hang);
  for (const dx of [-.33, .33]) box(hang, dx, -.17, 0, .02, .3, .02, IRON);
  const sign = new THREE.Group(); sign.position.set(0, -.72, 0); sign.rotation.x = -.38; hang.add(sign);
  view.box(0, 0, 0, .95, .78, .05, '#2a2622', sign);
  for (const [dx, dy, w, h] of [[0, .41, 1.01, .05], [0, -.41, 1.01, .05], [.49, 0, .05, .83], [-.49, 0, .05, .83]]) view.box(dx, dy, .01, w, h, .06, '#6e5446', sign);
  view.box(0, -.27, .03, .36, .06, .02, '#8b8a80', sign); // the dish
  view.box(.16, -.2, .03, .1, .08, .02, '#8b8a80', sign); // its handle
  view.box(0, -.06, .035, .1, .36, .02, '#cfc8b6', sign); // the candle
  const flame = view.box(0, .2, .04, .09, .09, .02, '#d9a24a', sign); flame.rotation.z = Math.PI / 4; flame.scale.set(1, 1.5, 1);
  view.box(0, .2, .045, .03, .06, .02, '#e8c878', sign);
}

// The tomb's granite face on its door end: dressed blocks proud of the wall,
// pilasters, and a lintel stone above the turf.
function graniteFace(b, g, onSide, e, rand) {
  const side = 'right', len = b.d, granite = '#8b8a80', dark = '#6f6e66';
  for (let y = .25, row = 0; y < e + .5; y += .5, row++) for (const s of [-1, 1]) {
    const from = s < 0 ? -len / 2 - .15 : b.doorWidth / 2 + .02, to = s < 0 ? -b.doorWidth / 2 - .02 : len / 2 + .15;
    if (y > 1.95) { onSide(g, side, 0, y, T / 2 + .08, len + .3, .48, .16, row % 2 ? granite : dark); break; }
    onSide(g, side, (from + to) / 2 + (rand() - .5) * .02, y, T / 2 + .08, to - from, .48, .16, (row + (s > 0)) % 2 ? granite : dark);
  }
  onSide(g, side, 0, e + .72, T / 2 + .08, len + .5, .18, .3, granite);
  for (const s of [-1, 1]) onSide(g, side, s * (len / 2 + .05), (e + .6) / 2, T / 2 + .12, .34, e + .6, .22, granite);
}

// The shell's blended copy for the see-through patch (world/roof-fade.js):
// this building's own merged copy of its walls, clapboard, trim and sashes,
// in the colours the batches bake, drawn only while a patch can fall on it
// (the shell itself is merged per 40 m cell with its neighbours', so a copy of
// the cell would draw every house in it for one).
function shellOverlay(view, g) {
  g.updateMatrixWorld(true);
  const buckets = new Map();
  g.traverse(o => {
    if (!o.isMesh || Array.isArray(o.material) || o.material.map || !o.material.color || o.geometry.attributes.color) return;
    const key = `${!!o.geometry.index}-${Object.keys(o.geometry.attributes).sort().join(',')}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(o);
  });
  const material = view.bakedMaterial('wall-overlay');
  for (const meshes of buckets.values()) {
    const geometry = mergeTransformed(meshes.map(m => ({ geometry: m.geometry, matrix: m.matrixWorld, color: m.material.color })));
    if (!geometry) continue;
    geometry.computeBoundingSphere(); geometry.computeBoundingBox();
    const mesh = new THREE.Mesh(geometry, material); mesh.matrixAutoUpdate = false; mesh.receiveShadow = true;
    view.scene.add(mesh);
    registerOverlay(view, mesh);
  }
}

// As world-build.js makeBuilding: batch the roof, bake its shades into one
// material, keep depth-only copies for the fade, and register it with its
// reach and doorways.
function registerRoof(view, b, roof) {
  roof.updateMatrixWorld(true);
  view.batch(roof, false);
  const roofMaterial = new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: 1, transparent: true });
  fadeRoofMaterial(view, roofMaterial); // (stage 4: never hides a character standing outside under it: world/roof-fade.js)
  // (One mesh, one draw: its shingles, which never cast, after the parts that
  // do; the shadow pass draws only those: bake-colors.js castersFirst.)
  bakeColors(roof, { material: roofMaterial, castersFirst: true });
  roof.traverse(m => { if (m.isMesh) m.receiveShadow = false; });
  const casters = []; roof.traverse(m => { if (m.isMesh && m.castShadow) casters.push(m); });
  const depthOnly = view.roofDepthMaterial ||= new THREE.MeshBasicMaterial({ colorWrite: false, transparent: true, depthWrite: true });
  const colour = [], prepass = [];
  roof.traverse(m => { if (m.isMesh) colour.push(m); });
  for (const m of colour) {
    const copy = m.clone(false); copy.material = depthOnly; copy.castShadow = copy.receiveShadow = false;
    copy.renderOrder = ROOF_PREPASS_ORDER; copy.visible = false; copy.userData.roofPrepass = true;
    m.parent.add(copy); prepass.push(copy);
  }
  roof.updateMatrixWorld(true); const reach = new THREE.Box3().setFromObject(roof);
  const doors = buildingOpenings(b).filter(o => o.type !== 'window').map(o => { const len = Math.hypot(o.b.x - o.a.x, o.b.z - o.a.z) || 1; return { x: (o.a.x + o.b.x) / 2, z: (o.a.z + o.b.z) / 2, ux: (o.b.x - o.a.x) / len, uz: (o.b.z - o.a.z) / len, half: len / 2 + .15 }; });
  const entry = { ...b, group: roof, casters, materials: [roofMaterial], colour, prepass, opacity: 1, reach, doors };
  view.roofs.push(entry);
  // The fade: each roof mesh keeps the list current before it draws, and has
  // a blended copy for the see-through patch, hidden while the roof fades as
  // a whole (you inside, or in a doorway: world/roof-fade.js; near a door the
  // roof is already on its blended shader at full opacity, and the patch
  // still draws then).
  fadeRoofMeshes(view, colour, roofOverlayMaterial(view), () => entry.opacity < .995);
}

// The forge's parts (props: world/colonial-parts.js), built from y 0 on the
// ground. The portico's prop is only its colliders (drawn with the meetinghouse).
export function makeColonialPart(view, p, g) {
  if (p.type === 'forgeHearth') {
    view.box(0, .42, 0, 1.3, .84, 1, STONES[1], g);
    for (let i = 0; i < 6; i++) view.box(-.45 + (i % 3) * .45, .2 + Math.floor(i / 3) * .36, .505, .4, .3, .02, STONES[i % 4], g);
    view.box(0, .86, 0, 1.36, .06, 1.06, STONES[0], g);
    view.box(0, .9, .05, .8, .06, .56, glow(view, '#3a1a0c', '#e0662a', 1.8), g);
    view.box(0, .885, .05, .92, .05, .66, '#2b2826', g);
    // The bellows at its back.
    const bellows = view.box(0, 1.05, -.62, .5, .14, .6, '#4a3528', g); bellows.rotation.x = -.35;
    view.box(0, 1.12, -.95, .05, .05, .5, PLANK_DARK, g);
  } else if (p.type === 'anvil') {
    view.cylinder(0, .28, 0, .3, .56, '#4a3b2e', g, 8);
    view.box(0, .63, 0, .26, .14, .2, IRON, g);
    view.box(0, .76, 0, .5, .13, .2, IRON, g);
    view.box(0, .83, 0, .46, .02, .18, '#55585a', g);
    const horn = view.mesh(new THREE.ConeGeometry(.08, .28, 6), IRON, .38, .77, 0, g); horn.rotation.z = -Math.PI / 2;
    view.box(-.05, .87, .04, .3, .03, .03, '#2a2c2e', g); // tongs left lying on it
  } else if (p.type === 'quenchTub') {
    view.cylinder(0, .27, 0, .38, .54, '#5b4a38', g, 10, .4);
    for (const y of [.12, .44]) view.cylinder(0, y, 0, .405, .05, IRON, g, 10);
    view.cylinder(0, .5, 0, .34, .02, '#1f2426', g, 10);
  }
}
