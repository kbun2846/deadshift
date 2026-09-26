// Hollow Wick's rooms (stage 2, s2-interiors): the furniture of a New England
// village about 1790-1820, left as it was the day everyone stopped.
//
// Two halves, like detailed-interiors.js (which dispatches here on the
// interiorStyle names below):
// - colonialCover(b): the pieces a body bumps into, in the building's own
//   frame (x across its width, z across its depth, front +z), each with a
//   height for the low-cover rules. map-kit.js mapColliders turns them into
//   colliders; the robots' nav grid and the spawn picker read those.
// - makeColonialInterior(view, b): draws them, and the walk-over clutter
//   (floors, dust, things left mid-task) that never collides.
//
// Layouts are written as wishes, not coordinates set in stone: each piece has
// a list of spots (its first choice, then fallbacks), and a spot is taken only
// if it stays inside the walls, clear of every doorway (1.2 m in from the
// door, the door's width plus 0.2 m each side), clear of the pieces already
// placed, and leaves the room walkable (roomCheck: a 1.4 m walkway joining
// every door, one connected floor a body can reach from them, and every
// reachable spot within a couple of metres of the walkway). So the same layout
// works whichever walls the building's doors are in, and a piece with no
// spot left is simply not there.
import * as THREE from 'three';

export const COLONIAL_STYLES = new Set(['colonial-house', 'colonial-lit-house', 'colonial-tavern', 'meetinghouse',
  'smithy', 'barn', 'gristmill', 'shed', 'horse-sheds', 'tomb']);
export const isColonial = b => COLONIAL_STYLES.has(b?.interiorStyle);

// Walls are 0.38 m thick and centred on the building's outline.
export const HALF_WALL = .19;
export const DOOR_CLEAR = 1.2;      // nothing this far in from a door
export const DOOR_SIDE = .2;        // ... nor this far past its jambs
export const WALKWAY = 1.4;         // a clear walkway this wide from every door
export const WALK_REACH = 1.0;      // (checkGrids)
export const WALK_SHARE = .6;
export const BODY = .38;            // RULES.radius (config/gameplay.js)
const GAP = .03;                    // pieces stand this far off a wall
// A gap between two pieces (or a piece and a wall) close to a body's width
// is where a body jams: keep every gap out of this band.
export const SNUG = [.72, .86];
const PI = Math.PI;

export function roomFrame(b) {
  const W = b.w / 2 - HALF_WALL, D = b.d / 2 - HALF_WALL;
  // Every doorway as { side, offset, width }: the named sides (centred,
  // doorWidth wide) and the extra openings along a side (map-kit.js
  // localOpenings: the horse sheds' bays, the sheds' back doors).
  const dw = b.doorWidth || 2.6;
  const doors = [...(b.doors || ['front']).map(side => ({ side, offset: 0, width: dw })),
    ...(b.openings || []).map(o => ({ side: o.side, offset: o.offset || 0, width: o.width || dw }))];
  return { W, D, w: b.w, d: b.d, doors, dw, id: String(b.id || ''), windows: b.windows || [] };
}

// Inside-the-door keep-clear rectangles, local frame: { x, z, w, d, side }.
export function doorZones(b) {
  const { W, D, doors } = roomFrame(b);
  return doors.map(({ side, offset: o, width }) => {
    const span = width + 2 * DOOR_SIDE;
    return side === 'front' ? { side, x: o, z: D - DOOR_CLEAR / 2, w: span, d: DOOR_CLEAR }
      : side === 'back' ? { side, x: o, z: -D + DOOR_CLEAR / 2, w: span, d: DOOR_CLEAR }
      : side === 'left' ? { side, x: -W + DOOR_CLEAR / 2, z: o, w: DOOR_CLEAR, d: span }
      : { side, x: W - DOOR_CLEAR / 2, z: o, w: DOOR_CLEAR, d: span };
  });
}

// Signed separation of two rectangles: negative when they overlap.
export function separation(a, b) {
  const gx = Math.abs(a.x - b.x) - (a.w + b.w) / 2, gz = Math.abs(a.z - b.z) - (a.d + b.d) / 2;
  if (gx < 0 && gz < 0) return Math.max(gx, gz);
  if (gx >= 0 && gz >= 0) return Math.hypot(gx, gz);
  return Math.max(gx, gz);
}
const snug = g => g > SNUG[0] && g < SNUG[1];

// --- walkability ----------------------------------------------------------
// A grid over the room's floor (cells `step` apart). For a body of radius r a
// cell is open when the body standing there touches no wall and no piece.
const STEP = .1;
function makeGrid(frame, r) {
  const { W, D } = frame, nx = Math.max(1, Math.round(2 * W / STEP)), nz = Math.max(1, Math.round(2 * D / STEP));
  const blocked = new Uint16Array(nx * nz);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const x = -W + (i + .5) * STEP, z = -D + (j + .5) * STEP;
    if (Math.abs(x) > W - r || Math.abs(z) > D - r) blocked[j * nx + i] = 1;
  }
  return { frame, r, nx, nz, blocked };
}
function markPiece(grid, p, sign) {
  const { frame: { W, D }, r, nx, nz, blocked } = grid;
  const i0 = Math.max(0, Math.floor((p.x - p.w / 2 - r + W) / STEP - .5)), i1 = Math.min(nx - 1, Math.ceil((p.x + p.w / 2 + r + W) / STEP - .5));
  const j0 = Math.max(0, Math.floor((p.z - p.d / 2 - r + D) / STEP - .5)), j1 = Math.min(nz - 1, Math.ceil((p.z + p.d / 2 + r + D) / STEP - .5));
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const x = -W + (i + .5) * STEP, z = -D + (j + .5) * STEP;
    const dx = Math.max(0, Math.abs(x - p.x) - p.w / 2), dz = Math.max(0, Math.abs(z - p.z) - p.d / 2);
    if (Math.hypot(dx, dz) < r) blocked[j * nx + i] += sign;
  }
}
// Cells just inside a door where a body of the grid's radius can stand
// (worked out once per grid; the caller drops the blocked ones).
function doorCells(grid, { side, offset, width }) {
  const { frame: { W, D }, r, nx, nz } = grid, cells = [];
  const half = width / 2 - r;
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const x = -W + (i + .5) * STEP, z = -D + (j + .5) * STEP;
    const along = side === 'front' || side === 'back' ? x : z;
    const depth = side === 'front' ? D - z : side === 'back' ? z + D : side === 'left' ? x + W : W - x;
    if (Math.abs(along - offset) <= half && depth >= r - 1e-9 && depth <= r + STEP * 1.5) cells.push(j * nx + i);
  }
  return cells;
}
function doorSeeds(grid, door) {
  const cells = (grid.doorCells ||= {})[door.side + ':' + door.offset] ||= doorCells(grid, door);
  return cells.filter(k => !grid.blocked[k]);
}
function flood(grid, seeds, limit = Infinity) {
  const { nx, nz, blocked } = grid, n = nx * nz;
  const dist = new Float32Array(n).fill(-1), queue = new Int32Array(n);
  let tail = 0;
  for (const k of seeds) if (!blocked[k] && dist[k] < 0) { dist[k] = 0; queue[tail++] = k; }
  for (let q = 0; q < tail; q++) {
    const k = queue[q], i = k % nx, next = dist[k] + STEP;
    if (next > limit) continue;
    if (i + 1 < nx && !blocked[k + 1] && dist[k + 1] < 0) { dist[k + 1] = next; queue[tail++] = k + 1; }
    if (i > 0 && !blocked[k - 1] && dist[k - 1] < 0) { dist[k - 1] = next; queue[tail++] = k - 1; }
    if (k + nx < n && !blocked[k + nx] && dist[k + nx] < 0) { dist[k + nx] = next; queue[tail++] = k + nx; }
    if (k - nx >= 0 && !blocked[k - nx] && dist[k - nx] < 0) { dist[k - nx] = next; queue[tail++] = k - nx; }
  }
  return dist;
}

// Is the room walkable with these pieces? { ok, why, share }. Grids are
// passed in already marked (the resolver keeps them up to date piece by
// piece). The walkway must join every door and run through the room: at
// least WALK_SHARE of the floor a body can stand on lies within WALK_REACH
// of it.
function checkGrids(body, walk) {
  // (A doorway narrower than the walkway, a shed's back door, needs a body
  // through it but no walkway.)
  const doors = body.frame.doors, wide = doors.filter(d => d.width / 2 > walk.r);
  const bodySeeds = doors.map(d => doorSeeds(body, d)), walkSeeds = wide.map(d => doorSeeds(walk, d));
  if (bodySeeds.some(s => !s.length)) return { ok: false, why: 'a doorway is blocked' };
  if (!walkSeeds.length || walkSeeds.some(s => !s.length)) return { ok: false, why: 'no walkway from a door' };
  const walked = flood(walk, walkSeeds[0]);
  if (walkSeeds.some(s => !s.some(k => walked[k] >= 0))) return { ok: false, why: 'the walkway does not join every door' };
  const reached = flood(body, bodySeeds[0]);
  let free = 0;
  for (let k = 0; k < reached.length; k++) if (!body.blocked[k]) { free++; if (reached[k] < 0) return { ok: false, why: 'a pocket of floor cannot be reached' }; }
  const walkway = []; for (let k = 0; k < walked.length; k++) if (walked[k] >= 0) walkway.push(k);
  const near = flood(body, walkway, WALK_REACH);
  let close = 0; for (let k = 0; k < near.length; k++) if (near[k] >= 0) close++;
  const share = close / Math.max(1, free);
  if (share < WALK_SHARE) return { ok: false, why: 'the walkway does not run through the room (' + share.toFixed(2) + ')', share };
  return { ok: true, share };
}
export function roomCheck(b, pieces) {
  const frame = roomFrame(b), body = makeGrid(frame, BODY), walk = makeGrid(frame, Math.min(WALKWAY / 2, frame.dw / 2 - .05));
  for (const p of pieces) { markPiece(body, p, 1); markPiece(walk, p, 1); }
  return checkGrids(body, walk);
}

// --- layouts ----------------------------------------------------------------
// Spot helpers: [x, z, w, d, rot]. `rot` turns the model so its front (the
// side a body uses: a bed's open side, a hearth's mouth) faces into the room:
// 0 faces +z (front), PI faces -z, PI/2 faces +x, -PI/2 faces -x.
function spotsFor(f) {
  const { W, D } = f;
  return {
    back: (x, L, T) => [x, -D + GAP + T / 2, L, T, 0],
    front: (x, L, T) => [x, D - GAP - T / 2, L, T, PI],
    left: (z, L, T) => [-W + GAP + T / 2, z, T, L, PI / 2],
    right: (z, L, T) => [W - GAP - T / 2, z, T, L, -PI / 2],
    free: (x, z, L, T, rot = 0) => Math.abs(Math.sin(rot)) > .5 ? [x, z, T, L, rot] : [x, z, L, T, rot],
  };
}
// Spots in front of an already placed piece: `out` metres off its front
// face, slid `along` it, facing it. (Already in the room's own frame.)
function around(placed, kind, outs, alongs, L, T) {
  const q = placed.find(p => p.kind === kind); if (!q) return [];
  const nx = Math.sin(q.rot || 0), nz = Math.cos(q.rot || 0), qT = Math.abs(nx) > .5 ? q.w : q.d, spots = [];
  for (const out of outs) for (const along of alongs) {
    const dist = qT / 2 + out + T / 2, x = q.x + nx * dist + nz * along, z = q.z + nz * dist - nx * along;
    const rot = (q.rot || 0) + PI, turned = Math.abs(nx) > .5;
    spots.push({ fixed: true, spot: [x, z, turned ? T : L, turned ? L : T, rot] });
  }
  return spots;
}
const near = (kind, reach) => (p, placed) => placed.some(q => q.kind === kind && Math.hypot(q.x - p.x, q.z - p.z) <= reach);

// One entry per piece: { kind, h, spots, need?, ...extra for the model }.
const LAYOUTS = {
  'colonial-house': f => houseLayout(f, false),
  'colonial-lit-house': f => houseLayout(f, true),
  'colonial-tavern': f => {
    const { W, D } = f, { back, front, left, right, free } = spotsFor(f), h = f.height;
    return [
      { kind: 'hearth', h, spots: [left(0, 2.8, 1.2), right(0, 2.8, 1.2), back(-W + 2, 2.8, 1.2), front(-W + 2, 2.8, 1.2)] },
      { kind: 'barCage', h: 1.2, spots: [back(W - GAP - 1.25, 2.5, 2.3), back(-W + GAP + 1.25, 2.5, 2.3), front(W - GAP - 1.25, 2.5, 2.3)] },
      // The high-backed settle turned to the fire.
      { kind: 'settle', h: 1.3, need: near('hearth', 2.6), spots: [free(-W + 2.6, 0, 1.9, .5, PI / 2), free(W - 2.6, 0, 1.9, .5, -PI / 2), free(-W + 2, -D + 2.6, 1.9, .5, 0), free(-W + 2, D - 2.6, 1.9, .5, PI)] },
      { kind: 'caskRack', h: 1.1, spots: [back(-W + 1.3, 2, .8), front(-W + 1.3, 2, .8), back(1.9, 2, .8)] },
      ...[[-W + 2.6, D - 1.6], [W - 2.8, D - 2.1], [1.4, -.4], [-2.1, -D + 1.3], [-W + 2.4, -D + 1.3]]
        .map(([x, z], i) => ({ kind: 'tavernTable', h: .8, seat: i, spots: [free(x, z, 1.5, 1.4), free(x, z - .6, 1.5, 1.4), free(x + .6, z, 1.5, 1.4)] })),
      { kind: 'cupboard', h: 1.9, spots: [right(D - 1.5, 1.2, .5), left(D - 1.5, 1.2, .5), front(W - 2, 1.2, .5)] },
    ];
  },
  meetinghouse: f => {
    const { W, D } = f, { back, front, left, right, free } = spotsFor(f);
    const pews = [];
    const rows = [D - 2.06, 0, -D + 2.06];
    for (const s of [-1, 1]) for (const [a, b] of [[1.0, 3.0], [4.0, W - GAP]]) for (const z of rows)
      pews.push({ kind: 'pew', h: 1.0, spots: [free(s * (a + b) / 2, z, b - a, 1.3, 0)] });
    return [
      { kind: 'pulpit', h: 2.0, spots: [back(0, 2.0, 1.3), left(0, 2.0, 1.3), right(0, 2.0, 1.3), front(0, 2.0, 1.3), back(-W + 2.5, 2.0, 1.3)] },
      { kind: 'communionTable', h: .8, spots: placed => around(placed, 'pulpit', [.8, 1.0], [0], 1.3, .6) },
      ...pews,
    ];
  },
  smithy: f => {
    const { W, D } = f, { back, front, left, right, free } = spotsFor(f);
    return [
      // The forge and its great bellows are one brick-and-leather mass.
      { kind: 'forge', h: 1.0, spots: [back(-W + 1.33, 2.6, 1.2), back(W - 1.33, 2.6, 1.2), left(-D + 1.33, 2.6, 1.2), right(-D + 1.33, 2.6, 1.2), front(-W + 1.33, 2.6, 1.2), back(-W + 1.13, 2.2, 1.15), back(W - 1.13, 2.2, 1.15), front(-W + 1.13, 2.2, 1.15)] },
      // The anvil a stride out from the fire, the quench tub at the smith's elbow.
      { kind: 'anvil', h: .8, spots: placed => around(placed, 'forge', [1.1, 1.35], [0, .5, -.5, 1, -1], .8, .45) },
      { kind: 'tub', h: .6, spots: placed => around(placed, 'anvil', [-.1, .4], [1.3, -1.3, 1.6, -1.6], .7, .7) },
      { kind: 'workbench', h: .9, spots: [back(W - 1.2, 2, .6), right(-D + 1.1, 2, .6), front(W - 1.2, 2, .6), left(D - 1.1, 2, .6), front(-W + 1.2, 2, .6)] },
      { kind: 'charcoal', h: .7, spots: [front(W - .6, 1, .9), front(-W + .6, 1, .9), back(W - .6, 1, .9)] },
    ];
  },
  gristmill: f => {
    const { W, D } = f, { back, front, left, right, free } = spotsFor(f);
    return [
      { kind: 'hurst', h: 1.2, spots: [free(-1.4, .1, 2.2, 2.6), free(1.4, .1, 2.2, 2.6), free(0, .1, 2.2, 2.6), free(-1.4, -.2, 2.2, 2.4)] },
      { kind: 'bin', h: 1.2, spots: [back(W - 2.2, 1.2, .8), back(-W + 1.8, 1.2, .8), left(-D + 1, 1.2, .8)] },
      { kind: 'sacks', h: .9, spots: [back(W - .75, 1.4, 1), front(W - .75, 1.4, 1), front(-W + .75, 1.4, 1), back(-W + .75, 1.4, 1)] },
      { kind: 'bolter', h: 1.1, spots: [front(W - 1.9, 1.9, .8), right(-.2, 1.9, .8), front(-W + 1.9, 1.9, .8), left(.8, 1.9, .8)] },
      // A spare runner stone stood on edge against a wall, waiting to be dressed.
      { kind: 'spareStone', h: 1.3, spots: [left(-D + 1.2, 1.3, .4), back(-W + 1.2, 1.3, .4), right(D - 1.2, 1.3, .4), front(-W + 1.2, 1.3, .4), back(0, 1.3, .4)] },
    ];
  },
  barn: f => {
    const { W, D } = f, { back, front, left, free } = spotsFor(f);
    const bay = (2 * W) / 4, pieces = [];
    for (let i = 0; i < 4; i++) pieces.push({ kind: 'manger', h: .9, spots: [back(-W + bay * (i + .5), bay - .16, .55)] });
    for (let i = 1; i < 4; i++) pieces.push({ kind: 'stallBoard', h: 1.4, spots: [free(-W + bay * i, -D + GAP + 1.3, .12, 2.6)] });
    const third = (2 * W - .2) / 3;
    for (let i = 0; i < 3; i++) pieces.push({ kind: 'hayMow', h: 1.8, part: i, spots: [front(-W + GAP + third * (i + .5) + i * .07, third - .04, 2.4)] });
    pieces.push({ kind: 'grainChest', h: .8, spots: [left(D - 3.2, 1.2, .6), left(-D + 3.6, 1.2, .6), free(W - .33, D - 3.2, 1.2, .6, -PI / 2)] });
    return pieces;
  },
  shed: f => f.id.includes('hearse') ? hearseLayout(f) : woodshedLayout(f),
  'horse-sheds': f => {
    const { W, D } = f, { back, free } = spotsFor(f), pieces = [];
    for (const x of [-4, -2, 2, 4]) pieces.push({ kind: 'stallBoard', h: 1.5, spots: [free(x, -D + GAP + .55, .12, 1.1)] });
    pieces.push({ kind: 'chaise', h: 1.1, spots: [free(3, -D + GAP + .55, 1.6, 1.1), free(-3, -D + GAP + .55, 1.6, 1.1)] });
    for (const [a, b] of [[-W, -4.06], [-3.94, -2.06], [-1.94, 1.94], [2.06, 3.94], [4.06, W]])
      pieces.push({ kind: 'manger', h: .9, spots: [back((a + b) / 2, b - a - .1, .4)] });
    return pieces;
  },
  tomb: f => {
    const { W, D } = f, { back, left, right, free } = spotsFor(f);
    return [
      { kind: 'coffinShelf', h: 1.3, spots: [left(-D + GAP + .9, 1.8, .75), left(D - GAP - .9, 1.8, .75)] },
      { kind: 'coffinShelf', h: 1.3, spots: [right(-D + GAP + .9, 1.8, .75), right(D - GAP - .9, 1.8, .75)] },
      // One fallen from its shelf, lid off, empty.
      { kind: 'floorCoffin', h: .45, spots: [back(0, 1.8, .55), free(0, D - GAP - .275, 1.8, .55)] },
    ];
  },
};

function houseLayout(f, lit) {
  const { W, D } = f, { back, front, left, right, free } = spotsFor(f), h = f.height;
  return [
    // The centre chimney: the kitchen hearth opens to the back (the hall).
    // (Its mouth faces the front: the camera looks from the south.)
    { kind: 'chimney', h, spots: [free(0, -.35, 2.2, 1.7, 0), free(0, -.1, 2.2, 1.5, 0)] },
    ...(lit ? [{ kind: 'litTable', h: .8, spots: [[1, 1, 1.5], [-1, 1, 1.5], [1, -1, 1.5], [-1, -1, 1.5], [1, 1, 1.2], [-1, 1, 1.2], [1, -1, 1.2], [-1, -1, 1.2]].map(([sx, sz, in_]) => free(sx * (W - 1.2), sz * (D - in_), 1.4, 1.2, sz > 0 ? PI : 0)) }] : []),
    { kind: 'trestle', h: .8, spots: [free(-W + 1.8, -D + 1.1, 1.8, 1.5), free(-W + .9, -D + 1, 1.8, 1.5, PI / 2), free(W - 1.8, -D + 1.1, 1.8, 1.5), free(-W + 1.8, D - 1.5, 1.8, 1.5), free(-W + 1.2, 0, 1.8, 1.5, PI / 2)] },
    { kind: 'dresser', h: 1.9, spots: [back(W - 1.4, 1.5, .5), back(-W + 1.4, 1.5, .5), right(-D + 1.2, 1.5, .5), left(-D + 1.2, 1.5, .5)] },
    { kind: 'bed', h: .6, spots: [front(W - 1, 1.9, 1.35), front(-W + 1, 1.9, 1.35), right(D - 1.5, 1.9, 1.35), left(D - 1.5, 1.9, 1.35)] },
    { kind: 'chest', h: .6, need: near('bed', 2.2), spots: [free(W - .83, D - 1.95, 1, .5, PI), free(-W + .83, D - 1.95, 1, .5, PI), free(W - 2.3, D - .28, 1, .5, PI), free(-W + 2.3, D - .28, 1, .5, PI), free(W - 2, D - .3, 1, .5, PI)] },
    { kind: 'spinningWheel', h: .9, spots: [free(2.1, -1.1, .9, .5), free(-2.1, -1.1, .9, .5), free(2.2, 1.2, .9, .5), free(-2.2, 1.2, .9, .5)] },
    { kind: 'tableSet', h: .8, spots: [free(-W + 1.3, D - 1.2, 1.3, 1.2), free(W - 1.3, D - 1.2, 1.3, 1.2), free(-W + 1.3, .3, 1.3, 1.2), free(W - 1.3, .3, 1.3, 1.2)] },
    { kind: 'cupboard', h: 1.9, spots: [left(-.3, 1.2, .5), right(-.3, 1.2, .5), front(-W + 1, 1.2, .5), back(-W + 1, 1.2, .5)] },
    ...(lit ? [] : [{ kind: 'cradle', h: .6, spots: [free(-2.2, -.1, .9, .5), free(2.2, -.1, .9, .5), free(-2.2, 1.3, .9, .5)] }]),
  ];
}
function woodshedLayout(f) {
  const { W, D } = f, { back, front, left, right, free } = spotsFor(f);
  return [
    { kind: 'woodpile', h: 1.3, spots: [left(0, 2 * D - 2 * GAP, .75), back(-W + .55, 1, .75), front(-W + .55, 1, .75)] },
    { kind: 'woodpile', h: 1.3, spots: [right(0, 2 * D - 2 * GAP, .75), back(W - .55, 1, .75), front(W - .55, 1, .75)] },
    { kind: 'sawbuck', h: .9, spots: [free(0, -D + .8, 1.1, .5), free(0, D - .8, 1.1, .5), free(-.2, 0, 1.1, .5, PI / 2)] },
    { kind: 'block', h: .5, spots: [free(1.1, 0, .55, .55), free(-1.1, 0, .55, .55), free(1.1, -D + .6, .55, .55)] },
  ];
}
function hearseLayout(f) {
  const { W, D } = f, { back, front, left, right } = spotsFor(f);
  return [
    { kind: 'bier', h: 1.0, spots: [back(0, 2.4, .8), front(0, 2.4, .8), left(0, 2.4, .8), right(0, 2.4, .8)] },
    { kind: 'coffinStack', h: .9, spots: [right(0, 1.9, .6), left(0, 1.9, .6), back(W - .7, 1.2, .6), front(W - .7, 1.2, .6)] },
  ];
}

// Houses differ from each other: some are the mirror image of the next.
function mirrored(f) {
  let n = 0; for (const c of f.id) n = (n * 31 + c.charCodeAt(0)) >>> 0;
  return n % 2 === 1;
}

const cache = new Map();
export function colonialCover(b, debug) {
  if (!isColonial(b)) return [];
  const f = { ...roomFrame(b), height: Math.max(2.4, (b.height || 3) - .05) };
  const key = JSON.stringify([b.interiorStyle, f.id, f.w, f.d, f.doors, f.dw, f.windows, f.height]);
  if (!debug && cache.has(key)) return cache.get(key);
  const zones = doorZones(b), flip = mirrored(f) ? -1 : 1;
  const body = makeGrid(f, BODY), walk = makeGrid(f, Math.min(WALKWAY / 2, f.dw / 2 - .05));
  const placed = [];
  for (const entry of LAYOUTS[b.interiorStyle](f)) {
    const { spots, need, ...rest } = entry;
    for (const spot of typeof spots === 'function' ? spots(placed) : spots) {
      const fixed = !!spot.fixed, [x0, z, w, d, rot = 0] = fixed ? spot.spot : spot, m = fixed ? 1 : flip;
      const p = { ...rest, x: x0 * m, z, w, d, rot: m < 0 ? -rot : rot };
      const why = debug ? m => debug.push(`${p.kind} ${p.x.toFixed(2)},${p.z.toFixed(2)}: ${m}`) : () => {};
      if (Math.abs(p.x) + w / 2 > f.W + 1e-6 || Math.abs(p.z) + d / 2 > f.D + 1e-6) { why('outside'); continue; }
      const wallGaps = [f.W - Math.abs(p.x) - w / 2, f.D - Math.abs(p.z) - d / 2];
      if (wallGaps.some(snug)) { why('snug to a wall'); continue; }
      const zone = zones.find(zone => separation(zone, p) < 0);
      if (zone) { why('in the ' + zone.side + ' doorway'); continue; }
      const other = placed.find(q => { const g = separation(q, p); return g < 0 || snug(g); });
      if (other) { why('against ' + other.kind + ' ' + separation(other, p).toFixed(2)); continue; }
      if (need && !need(p, placed)) { why('not near what it needs'); continue; }
      markPiece(body, p, 1); markPiece(walk, p, 1);
      const check = checkGrids(body, walk);
      if (!check.ok) { why(check.why); markPiece(body, p, -1); markPiece(walk, p, -1); continue; }
      placed.push(p); break;
    }
  }
  const out = placed.map(p => Object.freeze(p));
  if (!debug) cache.set(key, out);
  return out;
}

// --- models ------------------------------------------------------------------
const C = {
  wood: '#6b5a45', dark: '#4f4234', worn: '#7d6a52', pale: '#8e7b60', black: '#2e2a26',
  iron: '#3e403d', pewter: '#8a8c86', brick: '#6e4436', brickDark: '#5a372d', stone: '#7f7b72', stoneDark: '#5f5c56',
  ash: '#57544f', soot: '#2f2d2a', straw: '#a8925a', hay: '#9c8a55', hayDark: '#857448', cloth: '#6a6258', linen: '#a59a84',
  wool: '#b3a88f', dust: '#8a8274', grime: '#625849', rot: '#4b4a2e', mould: '#5d6444', bone: '#d8ccb0', leather: '#5a4232', meal: '#b5ab96',
  floorA: '#5f5242', floorB: '#665846', floorC: '#58493a', earth: '#4a4136', cinder: '#35312c', flag: '#67645d',
};
const AMBER = '#d9a24a';

// The one light-coloured thing in a dark house: a lantern's candle and its
// pierced tin glowing amber (emissive: no new light). Also the smithy's banked
// coals, darker. Shared per view.
function glow(view, colour, strength) {
  const store = view.colonialGlow ||= new Map(), key = colour + strength;
  if (!store.has(key)) store.set(key, new THREE.MeshStandardMaterial({ color: colour, emissive: colour, emissiveIntensity: strength, roughness: 1 }));
  return store.get(key);
}

export function makeColonialInterior(view, b) {
  const g = new THREE.Group(); g.position.set(b.x, 0, b.z); view.static.add(g);
  // (The room's height too: the pulpit's sounding board and the forge's hood hang from it.)
  const f = { ...roomFrame(b), height: Math.max(2.4, (b.height || 3) - .05) }, pieces = colonialCover(b);
  let seed = 2166136261; for (const c of f.id + b.interiorStyle) seed = Math.imul(seed ^ c.charCodeAt(0), 16777619);
  const rand = () => { seed = Math.imul(seed ^ seed >>> 15, 2246822507) + 0x6d2b79f5 | 0; return ((seed ^ seed >>> 13) >>> 0) / 4294967296; };
  const box = (x, y, z, w, h, d, c, parent = g) => view.box(x, y, z, w, h, d, c, parent);
  const cyl = (x, y, z, r, h, c, parent = g, seg = 8, top = r) => view.cylinder(x, y, z, r, h, c, parent, seg, top);
  const ctx = { view, g, f, b, rand, box, cyl };
  floor(ctx);
  for (const p of pieces) {
    const s = new THREE.Group(); s.position.set(p.x, 0, p.z); s.rotation.y = p.rot || 0; g.add(s);
    const turned = Math.abs(Math.sin(p.rot || 0)) > .5, L = turned ? p.d : p.w, T = turned ? p.w : p.d;
    // Which end of the piece (its local -x or +x) looks into the room.
    const r = p.rot || 0, open = -p.x * Math.cos(r) + p.z * Math.sin(r) < 0 ? -1 : 1;
    (MODELS[p.kind] || MODELS.block)({ ...ctx, s, p, L, T, open, bx: (x, y, z, w, h, d, c) => box(x, y, z, w, h, d, c, s), cy: (x, y, z, r, h, c, seg, top) => cyl(x, y, z, r, h, c, s, seg, top) });
  }
  extras(ctx, pieces);
}

// Floors and the dust on them.
function floor({ f, b, rand, box }) {
  const { W, D } = f, style = b.interiorStyle;
  const flags = style === 'tomb', dirt = style === 'smithy' || style === 'shed' || style === 'horse-sheds';
  if (flags) {
    for (let x = -W; x < W - .05; x += .8) for (let z = -D, row = 0; z < D - .05; z += .7, row++) {
      const w = Math.min(.76, W - x - .02), d = Math.min(.66, D - z - .02);
      box(x + w / 2 + .01, .075, z + d / 2 + .01, w, .02, d, rand() < .5 ? C.flag : C.stoneDark);
    }
  } else if (dirt) {
    box(0, .072, 0, 2 * W, .01, 2 * D, C.earth);
    for (let i = 0; i < 14; i++) { const c = box((rand() - .5) * 2 * (W - .3), .079, (rand() - .5) * 2 * (D - .3), .08 + rand() * .2, .005, .06 + rand() * .15, rand() < .5 ? C.cinder : C.grime); c.rotation.y = rand() * PI; }
  }
  if (!flags && !dirt) {
    // Wide pine boards, the way they were laid: along the building's length.
    const barn = style === 'barn';
    for (let z = -D, row = 0; z < D - .02; z += .46, row++) {
      const d = Math.min(.44, D - z - .01);
      for (let x = -W, n = 0; x < W - .02; n++) {
        const len = Math.min(1.6 + ((row * 7 + n * 3) % 5) * .7, W - x);
        if (!barn || Math.abs(z) < 2.2) box(x + len / 2, .074, z + d / 2 + .005, len - .015, .012, d, [C.floorA, C.floorB, C.floorC][(row + n) % 3]);
        x += len;
      }
    }
    if (barn) box(0, .071, 0, 2 * W, .01, 2 * D, C.earth);
  }
  // Grey dust where nobody has walked, heaviest along the walls.
  const flour = style === 'gristmill';
  for (let i = 0; i < 12; i++) {
    const side = i % 4, t = (rand() - .5) * 2;
    const x = side < 2 ? t * (W - .5) : (side === 2 ? -1 : 1) * (W - .35 - rand() * .5);
    const z = side < 2 ? (side === 0 ? -1 : 1) * (D - .35 - rand() * .5) : t * (D - .5);
    const d = box(x, .083, z, .3 + rand() * .5, .003, .2 + rand() * .3, flour ? C.meal : C.grime); d.rotation.y = rand() * .6;
  }
}

// Small things with no collider: left mid-task, dropped, never tidied.
function extras({ f, b, rand, box, cyl, view, g }, pieces) {
  const { W, D } = f, style = b.interiorStyle;
  const clear = (x, z, r = .4) => Math.abs(x) < W - r && Math.abs(z) < D - r && pieces.every(p => separation(p, { x, z, w: 2 * r, d: 2 * r }) > 0)
    && doorZones(b).every(zone => separation(zone, { x, z, w: 2 * r, d: 2 * r }) > 0);
  const spot = (tries = 30, r = .4) => { for (let i = 0; i < tries; i++) { const x = (rand() - .5) * 2 * (W - r), z = (rand() - .5) * 2 * (D - r); if (clear(x, z, r)) return [x, z]; } return null; };
  const house = style === 'colonial-house' || style === 'colonial-lit-house';
  if (house || style === 'colonial-tavern') {
    // A ladder-back chair left facing the wall.
    const at = spot(); if (at) { const c = new THREE.Group(); c.position.set(at[0], 0, at[1]); c.rotation.y = rand() * PI * 2; g.add(c); chair(view, c, C.wood); }
    // A pewter mug rolled under things, a broom dropped across the boards.
    const m = spot(20, .2); if (m) { const mug = cyl(m[0], .12, m[1], .06, .12, C.pewter); mug.rotation.z = PI / 2; }
    const br = spot(20, .6); if (br) { const s = box(br[0], .1, br[1], 1.2, .03, .03, C.worn); s.rotation.y = rand() * PI; box(br[0] + Math.cos(-s.rotation.y) * .6, .1, br[1] + Math.sin(-s.rotation.y) * .6, .12, .06, .28, C.straw).rotation.y = s.rotation.y; }
  }
  if (house) {
    // Eerie, and of the period (owner: "eerie horror movies, colonial New
    // England, Puritan"): a corn-husk doll face down on the boards, a pair of
    // buckled shoes set side by side as if someone stepped out of them, and
    // scratches in the floor by the hearth, all walk-over.
    const d = spot(20, .3);
    if (d) {
      const doll = new THREE.Group(); doll.position.set(d[0], .08, d[1]); doll.rotation.y = rand() * PI * 2; g.add(doll);
      box(0, .03, 0, .09, .05, .2, C.straw, doll); box(0, .03, .14, .07, .05, .07, C.straw, doll);
      box(0, .025, -.08, .2, .03, .14, C.cloth, doll);
      for (const sx of [-1, 1]) box(sx * .09, .02, .04, .12, .025, .03, C.hay, doll).rotation.y = sx * .5;
    }
    const sh = spot(20, .3);
    if (sh) {
      const pair = new THREE.Group(); pair.position.set(sh[0], .08, sh[1]); pair.rotation.y = rand() * PI * 2; g.add(pair);
      for (const sx of [-.07, .07]) { box(sx, .035, 0, .09, .07, .26, C.black, pair); box(sx, .075, -.02, .07, .012, .05, C.pewter, pair); }
    }
    const hearth = pieces.find(p => p.kind === 'chimney');
    if (hearth) for (let i = 0; i < 5; i++) {
      const x = hearth.x - .5 + i * .22 + (rand() - .5) * .05, z = hearth.z + hearth.d / 2 + .35 + rand() * .12;
      if (clear(x, z, .15)) box(x, .082, z, .012, .003, .3 + rand() * .15, C.black).rotation.y = .12 + (rand() - .5) * .1;
    }
  }
  if (style === 'colonial-tavern') {
    // A tankard on its side in a dried stain, and a long clay pipe dropped by it.
    const t = spot(20, .5);
    if (t) {
      const stain = view.mesh(new THREE.CircleGeometry(.42, 9), C.rot, t[0] + .2, .079, t[1], g); stain.rotation.x = -PI / 2; stain.scale.set(1, .7, 1); stain.castShadow = false;
      const mug = cyl(t[0], .13, t[1], .07, .15, C.pewter); mug.rotation.z = PI / 2;
      const pipe = box(t[0] - .25, .09, t[1] + .25, .34, .015, .015, C.bone); pipe.rotation.y = .7;
      box(t[0] - .39, .1, t[1] + .38, .04, .04, .04, C.bone);
    }
  }
  if (style === 'colonial-lit-house') {
    // The lantern still lit in the window. On a sill it would hide under the
    // wall from the south-tilted camera, so it stands on a candlestand just
    // inside, and the window's opening glows faintly amber (seen from the
    // street); with no window it stands by the front wall.
    const win = f.windows.find(w => !w.boarded) || f.windows[0];
    const side = win?.side || 'front', off = win ? win.offset : W * .5, inset = .55;
    const across = side === 'front' || side === 'back', sign = side === 'back' || side === 'left' ? -1 : 1;
    const x = across ? off : sign * (W - inset), z = across ? sign * (D - inset) : off;
    // (Something already stands there: the lantern sits on it instead.)
    const under = pieces.find(p => separation(p, { x, z, w: .4, d: .4 }) < 0);
    if (!under) { cyl(x, .35, z, .03, .7, C.dark); cyl(x, .72, z, .16, .03, C.dark); cyl(x, .02, z, .18, .04, C.dark); }
    const l = new THREE.Group(); l.position.set(x, under ? Math.min(under.h, 1.4) + .01 : .735, z); l.scale.setScalar(1.3); g.add(l);
    lantern(view, l, true);
    const pool = view.mesh(new THREE.CircleGeometry(.9, 12), glow(view, '#6a4a22', .45), x, .082, z, g); pool.rotation.x = -PI / 2; pool.castShadow = false;
    if (win) {
      const pw = Math.max(.3, (win.width || 1) - .25), wx = across ? off : sign * (f.w / 2), wz = across ? sign * (f.d / 2) : off;
      view.mesh(new THREE.BoxGeometry(across ? pw : .03, .95, across ? .03 : pw), glow(view, AMBER, .35), wx, 1.15, wz, g).castShadow = false;
    }
  }
  if (style === 'meetinghouse') {
    // A shawl dropped in the aisle, a psalter face down.
    const a = spot(20, .3); if (a) { const s = box(a[0], .085, a[1], .7, .02, .45, C.cloth); s.rotation.y = rand() * PI; }
    const p = spot(20, .2); if (p) { const s = box(p[0], .1, p[1], .16, .04, .22, C.black); s.rotation.y = rand() * PI; }
    // The tithingman's rod laid across a pew's door, and guttered candle stubs
    // in their own wax on the boards.
    const pew = pieces.find(q => q.kind === 'pew');
    if (pew) { const rod = box(pew.x, pew.h + .02, pew.z + pew.d / 2 - .05, Math.min(1.6, pew.w * .9), .025, .025, C.dark); rod.rotation.y = .04; box(pew.x + Math.min(.8, pew.w * .45), pew.h + .04, pew.z + pew.d / 2 - .05, .08, .06, .06, C.pewter); }
    for (let i = 0; i < 3; i++) { const c = spot(20, .15); if (!c) break; cyl(c[0], .1, c[1], .1, .02, C.bone); cyl(c[0], .13, c[1], .025, .06 + rand() * .04, C.wool); }
  }
  if (style === 'barn' || style === 'horse-sheds') {
    for (let i = 0; i < 40; i++) { const x = (rand() - .5) * 2 * (W - .3), z = (rand() - .5) * 2 * (D - .3); const s = box(x, .08, z, .02, .01, .2 + rand() * .3, rand() < .5 ? C.straw : C.hay); s.rotation.y = rand() * PI; }
    const fl = spot(20, .6); if (fl) { const s = box(fl[0], .1, fl[1], 1.4, .04, .04, C.worn); s.rotation.y = rand() * PI; box(fl[0] + .5, .1, fl[1] + .2, .6, .045, .045, C.pale).rotation.y = s.rotation.y + .6; }
  }
  if (style === 'barn') {
    // The dead horse in a stall: its ribs and skull, long picked clean.
    const stall = pieces.filter(p => p.kind === 'manger').sort((a, c) => a.x - c.x)[0];
    if (stall) {
      const x = stall.x, z = stall.z + (stall.rot === 0 ? 1.2 : -1.2);
      for (let i = 0; i < 6; i++) { const r = view.mesh(new THREE.TorusGeometry(.26 - Math.abs(i - 2.5) * .03, .025, 4, 10, PI), C.bone, x - .35 + i * .14, .08, z, g); r.rotation.set(-PI / 2, 0, PI / 2); }
      box(x, .09, z, .9, .05, .06, C.bone);
      const skull = box(x + .75, .12, z + .15, .45, .12, .2, C.bone); skull.rotation.y = .5;
      box(x - .8, .085, z + .3, .5, .035, .05, C.bone).rotation.y = 1.1;
    }
  }
  if (style === 'tomb') {
    // Bones spilled from the fallen coffin, a snuffed candle on the floor.
    const c = pieces.find(p => p.kind === 'floorCoffin');
    if (c) { for (let i = 0; i < 5; i++) box(c.x - .6 + i * .3, .09, c.z + .45 + (i % 2) * .08, .28, .04, .04, C.bone).rotation.y = i * .7; cyl(c.x + .9, .14, c.z + .5, .09, .1, C.bone, g, 8); }
    const k = spot(20, .15); if (k) { cyl(k[0], .09, k[1], .05, .02, C.iron); cyl(k[0], .14, k[1], .025, .09, C.linen); }
  }
  if (style === 'gristmill') {
    // Meal spilled from a split sack, a scoop left in it.
    const m = spot(20, .5); if (m) { const s = view.mesh(new THREE.CylinderGeometry(.5, .6, .06, 7), C.meal, m[0], .1, m[1], g); s.scale.z = .7; box(m[0] + .2, .15, m[1], .3, .06, .12, C.worn); }
  }
  if (style === 'smithy') {
    // Horseshoes kicked about, a wagon tyre leaning.
    for (let i = 0; i < 4; i++) { const at = spot(10, .2); if (!at) break; const h = view.mesh(new THREE.TorusGeometry(.09, .02, 4, 8, PI * 1.3), C.iron, at[0], .09, at[1], g); h.rotation.set(-PI / 2, 0, rand() * PI); }
  }
}

// --- the pieces ------------------------------------------------------------
// Each draws in its own frame: L along x, T along z, the back at -T/2
// (against the wall), the front (+z) facing into the room.
function chair(view, c, colour) {
  const box = (x, y, z, w, h, d, k = colour) => view.box(x, y, z, w, h, d, k, c);
  box(0, .45, 0, .44, .05, .42, C.straw);
  for (const x of [-.19, .19]) { box(x, .23, .18, .04, .46, .04); box(x, .52, -.19, .045, 1.04, .045); }
  for (const y of [.72, .86, 1.0]) box(0, y, -.19, .38, .055, .03);
}
function lantern(view, l, lit) {
  const cyl = (x, y, z, r, h, c, seg = 6, top = r) => view.cylinder(x, y, z, r, h, c, l, seg, top);
  // A pierced-tin lantern: a punched cylinder, a cone cap and a ring.
  const tin = lit ? glow(view, AMBER, .9) : C.pewter;
  view.mesh(new THREE.CylinderGeometry(.09, .1, .26, 8), tin, 0, .13, 0, l);
  view.mesh(new THREE.ConeGeometry(.1, .12, 8), C.pewter, 0, .32, 0, l);
  const ring = view.mesh(new THREE.TorusGeometry(.04, .01, 4, 8), C.iron, 0, .41, 0, l); ring.castShadow = false;
  if (lit) for (let i = 0; i < 6; i++) { const dot = view.mesh(new THREE.BoxGeometry(.02, .02, .01), glow(view, '#ffd58a', 1.4), Math.sin(i) * .1, .08 + (i % 3) * .06, Math.cos(i) * .1, l); dot.rotation.y = i; }
  cyl(0, .005, 0, .1, .01, C.iron);
}
function candlestick(ctx, s, x, y, z, burnt = .6) {
  ctx.view.cylinder(x, y + .015, z, .05, .03, C.pewter, s, 6);
  ctx.view.cylinder(x, y + .07, z, .018, .1, C.pewter, s, 6);
  ctx.view.cylinder(x, y + .12 + .06 * burnt, z, .02, .12 * burnt, C.linen, s, 6);
}
function plate(ctx, s, x, y, z, food) {
  ctx.view.cylinder(x, y + .01, z, .13, .02, C.pewter, s, 10);
  if (food) for (let i = 0; i < 3; i++) ctx.view.mesh(new THREE.DodecahedronGeometry(.045 + i * .01), i ? C.rot : C.mould, x - .04 + i * .04, y + .04, z + (i % 2) * .03, s).scale.y = .5;
}

const MODELS = {
  chimney(ctx) { hearthModel(ctx, true); },
  hearth(ctx) { hearthModel(ctx, false); },

  trestle(ctx) { trestleModel(ctx); },

  litTable({ bx, cy, L, T, s, view }) {
    // A place laid for one: the plate of food gone to mould, a cup, a knife,
    // the candle burnt to a stub, the chair shoved back. The other chair lies
    // on its back beside the table, as if someone stood up all at once.
    const tw = L - .35, td = T - .5;
    bx(0, .76, -.15, tw, .05, td, C.worn);
    for (const x of [-1, 1]) for (const z of [-1, 1]) bx(x * (tw / 2 - .07), .38, -.15 + z * (td / 2 - .07), .06, .74, .06, C.dark);
    bx(0, .79, -.05, .55, .01, .4, C.linen);
    plate({ view }, s, 0, .79, 0, true);
    cy(.3, .845, -.05, .045, .11, C.pewter);
    bx(-.22, .8, .02, .18, .01, .025, C.iron);
    candlestick({ view }, s, -.3, .785, -.35, .12);
    const c = new THREE.Group(); c.position.set(.05, 0, T / 2 - .25); c.rotation.y = PI + .35; s.add(c); chair(view, c, C.wood);
    const down = new THREE.Group(); down.position.set(L / 2 + .35, .23, -.2); down.rotation.set(-PI / 2 + .1, .5, 0); s.add(down); chair(view, down, C.wood);
  },

  tableSet({ bx, cy, L, T, s, view, rand }) {
    bx(0, .76, 0, L - .5, .05, T - .5, C.worn);
    for (const x of [-1, 1]) for (const z of [-1, 1]) bx(x * (L / 2 - .33), .38, z * (T / 2 - .33), .06, .74, .06, C.dark);
    for (const [x, z, r] of [[-L / 2 + .25, 0, PI / 2], [L / 2 - .25, .05, -PI / 2 + .3]]) { const c = new THREE.Group(); c.position.set(x, 0, z); c.rotation.y = r; s.add(c); chair(view, c, C.wood); c.scale.setScalar(.9); }
    cy(.1, .82, .05, .06, .1, C.pewter); bx(-.15, .8, -.1, .3, .015, .22, C.linen);
    candlestick({ view }, s, .25, .785, -.15, .3);
  },

  bed({ bx, L, T, rand }) {
    // A rope bed: low posts, the rope lattice showing where the tick has slid off.
    for (const x of [-1, 1]) for (const z of [-1, 1]) bx(x * (L / 2 - .05), .32, z * (T / 2 - .05), .09, .64, .09, C.dark);
    for (const z of [-1, 1]) bx(0, .34, z * (T / 2 - .05), L - .1, .08, .06, C.wood);
    for (const x of [-1, 1]) bx(x * (L / 2 - .05), .34, 0, .06, .08, T - .1, C.wood);
    for (let i = 0; i < 6; i++) bx(-L / 2 + .2 + i * (L - .4) / 5, .36, 0, .015, .015, T - .15, C.straw);
    for (let i = 0; i < 4; i++) bx(0, .36, -T / 2 + .25 + i * (T - .5) / 3, L - .15, .015, .015, C.straw);
    bx(-.15, .45, -.1, L - .6, .12, T - .4, C.linen);
    bx(-L / 2 + .3, .55, 0, .35, .1, T - .5, C.wool);
    const quilt = bx(.3, .5, .35, L * .55, .05, T * .6, C.cloth); quilt.rotation.x = -.35; quilt.rotation.y = rand() * .3;
  },

  chest({ bx, L, T }) {
    bx(0, .28, 0, L, .5, T, C.dark);
    for (const x of [-1, 1]) bx(x * (L / 2 - .08), .03, 0, .1, .06, T, C.dark);
    const lid = bx(0, .57, -.05, L + .03, .04, T + .02, C.wood); lid.rotation.x = -.3;
    bx(0, .5, T / 2, .08, .1, .02, C.iron);
    bx(.15, .53, .1, .5, .06, .3, C.cloth).rotation.z = .2;
  },

  dresser({ bx, cy, L, T, view, s }) {
    bx(0, .45, 0, L, .9, T, C.wood);
    bx(0, .92, 0, L + .05, .04, T + .04, C.worn);
    bx(0, 1.4, -T / 2 + .1, L, .96, .2, C.dark);
    for (const y of [1.25, 1.6]) bx(0, y, -T / 2 + .19, L - .08, .03, .18, C.worn);
    for (let i = 0; i < 4; i++) { const pl = cy(-L / 2 + .3 + i * .32, 1.36, -T / 2 + .18, .12, .02, C.pewter, 10); pl.rotation.x = PI / 2 - .2; }
    for (let i = 0; i < 3; i++) cy(-L / 2 + .35 + i * .45, 1.68, -T / 2 + .2, .05, .12, i === 1 ? C.linen : C.pewter);
    for (const x of [-.35, .35]) bx(x, .45, T / 2 + .005, .6, .7, .02, C.dark);
    const door = bx(.35 + .05, .45, T / 2 + .2, .6, .7, .02, C.dark); door.rotation.y = -1.1; door.position.x = .67;
  },

  cupboard({ bx, L, T }) {
    bx(0, .95, 0, L, 1.9, T, C.dark);
    bx(0, 1.92, 0, L + .06, .06, T + .06, C.wood);
    bx(-L / 4, .95, T / 2 + .01, L / 2 - .06, 1.6, .02, C.wood);
    const door = bx(L / 2 - .02, .95, T / 2 + .25, .02, 1.6, .5, C.wood); door.rotation.y = .5;
    bx(L / 4 - .1, 1.3, 0, .2, .2, .2, C.pewter);
  },

  spinningWheel({ bx, cy, L, T, s, view }) {
    // The treadle wheel: slanted bench, the big wheel, the flyer, and wool
    // on the distaff with the yarn still running to the bobbin.
    const bench = bx(0, .45, 0, L - .1, .06, .22, C.worn); bench.rotation.z = -.12;
    for (const [x, z] of [[-L / 2 + .1, -.08], [-L / 2 + .1, .08], [L / 2 - .1, 0]]) bx(x, .22, z, .05, .44 + (x > 0 ? .08 : 0), .05, C.dark);
    const wheel = view.mesh(new THREE.TorusGeometry(.3, .025, 4, 16), C.wood, -.1, .8, 0, s);
    for (let i = 0; i < 4; i++) bx(-.1, .8, 0, .02, .58, .02, C.dark).rotation.z = i * PI / 4;
    for (const z of [-.06, .06]) bx(-.1, .62, z, .04, .36, .04, C.dark);
    bx(.3, .6, 0, .12, .06, .06, C.dark);
    cy(.36, .8, 0, .025, .45, C.dark, 6);
    view.mesh(new THREE.DodecahedronGeometry(.1), C.wool, .36, 1.05, 0, s);
    bx(.08, .78, 0, .5, .005, .005, C.linen).rotation.z = -.4;
    bx(-.2, .07, .12, .35, .025, .08, C.worn);
  },

  cradle({ bx, L, T, view, s }) {
    for (const z of [-1, 1]) { const rocker = view.mesh(new THREE.TorusGeometry(.35, .025, 4, 8, PI * .6), C.dark, 0, .38, z * (T / 2 - .06), s); rocker.rotation.z = PI + PI * .2; }
    bx(0, .32, 0, L - .15, .05, T - .1, C.wood);
    for (const z of [-1, 1]) bx(0, .44, z * (T / 2 - .05), L - .15, .25, .03, C.wood);
    bx(-L / 2 + .09, .5, 0, .03, .38, T - .1, C.wood);
    bx(L / 2 - .09, .42, 0, .03, .22, T - .1, C.wood);
    bx(-.1, .37, 0, .45, .04, T - .2, C.linen);
  },

  settle({ bx, L, T }) {
    bx(0, .42, .05, L, .06, T - .1, C.worn);
    bx(0, .7, -T / 2 + .04, L, 1.3, .06, C.dark);
    bx(0, 1.34, -T / 2 + .06, L + .04, .06, .12, C.dark);
    for (const x of [-1, 1]) { bx(x * (L / 2 - .03), .55, 0, .06, 1.1, T, C.dark); bx(x * (L / 2 - .03), .2, .1, .06, .4, T - .2, C.wood); }
    bx(-.3, .47, .05, .4, .05, .3, C.cloth);
  },

  barCage({ bx: put, cy: round, L, T, s, view, open }) {
    // Drawn with its counter along the end that faces the room.
    const m = -open, bx = (x, ...rest) => put(x * m, ...rest), cy = (x, ...rest) => round(x * m, ...rest);
    // The tavern keeper's cage: a counter with a slatted grille to the
    // ceiling (the grille's gate hanging open), shelves of bottles and a
    // cask behind it.
    const fx = L / 2, fz = T / 2;
    bx(-fx + .25, .55, -.2, .5, 1.1, T - .4, C.dark);
    bx(0, .55, fz - .25, L, 1.1, .5, C.dark);
    bx(0, 1.13, fz - .25, L + .05, .05, .56, C.worn);
    bx(-fx + .25, 1.13, -.2, .56, .05, T - .4, C.worn);
    for (let i = 0; i < 11; i++) bx(-L / 2 + .15 + i * (L - .3) / 10, 1.7, fz - .45, .03, 1.1, .03, C.dark);
    for (let i = 0; i < 7; i++) bx(-fx + .45, 1.7, -T / 2 + .3 + i * (T - .9) / 6, .03, 1.1, .03, C.dark);
    bx(0, 2.27, fz - .45, L, .06, .06, C.dark);
    bx(-fx + .45, 2.27, 0, .06, .06, T, C.dark);
    // Shelves on the walls behind.
    bx(.2, 1.3, -T / 2 + .12, L - .9, .04, .22, C.worn);
    for (let i = 0; i < 6; i++) cy(-.4 + i * .25, 1.42, -T / 2 + .12, .045, .2, i % 2 ? '#4b5a4e' : '#5c4b3a', 6);
    const cask = cy(fx - .45, .35, -.1, .3, .7, C.wood, 10); cask.rotation.x = PI / 2;
    for (const z of [-.35, .15]) { const hoop = cy(fx - .45, .35, z, .31, .04, C.iron, 10); hoop.rotation.x = PI / 2; }
    // Tankards on the counter, one knocked over.
    for (let i = 0; i < 3; i++) { const t = cy(-.3 + i * .35, 1.22, fz - .25, .055, .13, C.pewter); if (i === 2) { t.rotation.z = PI / 2; t.position.y = 1.19; } }
    const l = new THREE.Group(); l.position.set(-.2 * m, 1.16, fz - .25); s.add(l); lantern(view, l, false);
  },

  caskRack({ bx, cy, L, T }) {
    for (const x of [-1, 1]) bx(x * (L / 2 - .1), .2, 0, .12, .4, T - .05, C.dark);
    for (let i = 0; i < 3; i++) {
      const x = -L / 2 + L / 6 + i * L / 3;
      const c = cy(x, .62, 0, .34, T - .1, i === 1 ? C.worn : C.wood, 10); c.rotation.x = PI / 2;
      for (const z of [-T / 2 + .15, T / 2 - .15]) { const h = cy(x, .62, z, .35, .04, C.iron, 10); h.rotation.x = PI / 2; }
      if (i === 2) cy(x, .55, T / 2 - .02, .04, .04, C.dark).rotation.x = PI / 2;
    }
  },

  tavernTable({ bx, cy, L, T, s, view, p }) {
    bx(0, .76, 0, 1.0, .05, .9, C.worn);
    bx(0, .4, 0, .12, .72, .7, C.dark); bx(0, .1, 0, .8, .06, .1, C.dark);
    const chairs = [[-L / 2 + .25, 0, PI / 2], [L / 2 - .25, .1, -PI / 2], [0, -T / 2 + .25, 0]];
    chairs.forEach(([x, z, r], i) => { if (i === 2 && p.seat % 2) return; const c = new THREE.Group(); c.position.set(x, 0, z); c.rotation.y = r + (i ? .2 : -.15); s.add(c); chair(view, c, C.wood); });
    cy(-.2, .84, .1, .06, .13, C.pewter); cy(.25, .84, -.15, .06, .13, C.pewter);
    if (p.seat === 0) for (let i = 0; i < 5; i++) bx(-.1 + i * .06, .79, .25, .05, .01, .08, C.linen).rotation.y = i * .5;
    if (p.seat === 1) candlestick({ view }, s, 0, .785, 0, .2);
    if (p.seat === 2) { const t = cy(.3, .82, .25, .06, .13, C.pewter); t.rotation.z = PI / 2; bx(.1, .79, .3, .3, .004, .2, C.rot); }
  },

  pew({ bx, L, T, cy, rand, p }) {
    // A box pew: panelled walls about a metre high, benches inside on two
    // sides, a foot stove on the floor, a door on the aisle end.
    for (const z of [-1, 1]) bx(0, .5, z * (T / 2 - .03), L, 1.0, .06, C.pale);
    for (const x of [-1, 1]) bx(x * (L / 2 - .03), .5, 0, .06, 1.0, T - .12, C.pale);
    for (const z of [-1, 1]) bx(0, 1.02, z * (T / 2 - .03), L + .04, .04, .1, C.worn);
    for (const x of [-1, 1]) bx(x * (L / 2 - .03), 1.02, 0, .1, .04, T, C.worn);
    bx(0, .42, -T / 2 + .25, L - .14, .05, .36, C.worn);
    bx(-L / 2 + .25, .42, .1, .36, .05, T - .56, C.worn);
    bx(.2, .16, .15, .25, .16, .2, C.iron); bx(.2, .25, .15, .27, .02, .22, C.dark);
    if (rand() < .4) bx(-.2, .46, -T / 2 + .25, .15, .04, .2, C.black);
    if (rand() < .3) bx(.4, .45, -T / 2 + .3, .5, .03, .3, C.cloth).rotation.y = .4;
    bx(L / 2 - .04, .7, .25, .02, .08, .08, C.iron);
  },

  pulpit({ bx, cy, L, T, s, view, f }) {
    // The raised pulpit: a panelled drum on a base, reached by stairs at its
    // side, a closed Bible on the desk, and the sounding board over it.
    bx(0, 1.0, -.05, L - .3, 2.0, T - .2, C.pale);
    bx(0, 2.03, T / 2 - .25, L - .2, .06, .35, C.worn);
    const bible = bx(0, 2.1, T / 2 - .25, .35, .07, .26, C.black); bible.rotation.x = -.15;
    for (let i = 0; i < 5; i++) bx(L / 2 - .12, .2 + i * .38, -T / 2 + .15 + i * .2, .24, .06, .3, C.worn);
    bx(0, 1.8, -T / 2 + .06, .25, 3.2, .1, C.pale);
    const y = Math.min(3.2, f.height - .25);
    view.mesh(new THREE.CylinderGeometry(.95, .95, .12, 8), C.pale, 0, y, .1, s);
    view.mesh(new THREE.ConeGeometry(.9, .25, 8), C.worn, 0, y + .18, .1, s);
  },

  communionTable({ bx, L, T }) {
    bx(0, .78, 0, L, .05, T, C.worn);
    for (const x of [-1, 1]) for (const z of [-1, 1]) bx(x * (L / 2 - .08), .38, z * (T / 2 - .08), .07, .76, .07, C.dark);
    bx(-.2, .83, 0, .4, .04, .3, C.linen);
  },

  forge({ bx, cy, L, T, view, s, f }) {
    // A brick forge on the left, the great bellows on the right.
    const fl = L * .58, fxc = -L / 2 + fl / 2;
    bx(fxc, .45, 0, fl, .9, T, C.brick);
    bx(fxc, .92, 0, fl + .06, .06, T + .06, C.brickDark);
    bx(fxc, .96, .05, fl - .5, .04, T - .45, C.soot);
    view.mesh(new THREE.CylinderGeometry(.28, .22, .06, 8), glow(view, '#a8431f', .55), fxc, .99, .05, s);
    for (let i = 0; i < 5; i++) view.mesh(new THREE.DodecahedronGeometry(.07), C.cinder, fxc - .25 + i * .12, 1.01, -.15 + (i % 2) * .3, s);
    // The hood and flue above (open below, so the fire is seen from above).
    for (const x of [-1, 1]) bx(fxc + x * (fl / 2 - .1), 1.55, -T / 2 + .3, .2, 1.3, .6, C.brickDark);
    bx(fxc, Math.min(f.height - .3, 2.4), -T / 2 + .3, fl, .5, .6, C.brickDark);
    // Bellows: a leather teardrop on a frame, the rocker pole over it.
    const bxc = L / 2 - (L - fl) / 2;
    for (const z of [-1, 1]) bx(bxc, .45, z * (T / 2 - .1), .08, .9, .08, C.dark);
    const leather = view.mesh(new THREE.CylinderGeometry(.42, .08, .3, 8), C.leather, bxc - .05, .75, 0, s); leather.rotation.z = PI / 2; leather.scale.z = .9;
    bx(bxc - .05, .93, 0, .9, .04, .7, C.wood);
    const pole = bx(bxc + .1, 1.4, .2, .06, .06, 1.6, C.worn); pole.rotation.x = .5;
    cy(-L / 2 + fl, .75, 0, .05, .5, C.iron, 6).rotation.z = PI / 2;
  },

  anvil({ bx, cy, view, s }) {
    cy(0, .3, 0, .3, .6, C.dark, 8);
    bx(0, .66, 0, .3, .12, .16, C.iron);
    bx(0, .76, 0, .5, .1, .2, C.iron);
    const horn = view.mesh(new THREE.ConeGeometry(.08, .25, 6), C.iron, .36, .77, 0, s); horn.rotation.z = -PI / 2;
    const hammer = bx(-.05, .84, .02, .28, .04, .04, C.worn); hammer.rotation.y = .6; bx(-.16, .85, -.05, .1, .06, .06, C.iron);
    view.mesh(new THREE.TorusGeometry(.08, .018, 4, 8, PI * 1.3), '#7a4a2e', .1, .82, 0, s).rotation.x = -PI / 2;
    const tongs = bx(.1, .08, .3, .55, .03, .04, C.iron); tongs.rotation.y = .3;
  },

  tub({ cy, view, s }) {
    cy(0, .3, 0, .33, .6, C.wood, 10, .35);
    cy(0, .59, 0, .31, .02, '#23292a', 10);
    for (const y of [.12, .48]) cy(0, y, 0, .345, .04, C.iron, 10);
  },

  workbench({ bx, cy, L, T }) {
    bx(0, .88, 0, L, .07, T, C.worn);
    for (const x of [-1, 1]) for (const z of [-1, 1]) bx(x * (L / 2 - .08), .43, z * (T / 2 - .08), .08, .86, .08, C.dark);
    bx(0, .25, 0, L - .2, .04, T - .1, C.dark);
    bx(L / 2 - .25, .98, T / 2 - .05, .18, .14, .12, C.iron);
    for (let i = 0; i < 4; i++) bx(-L / 2 + .3 + i * .3, .93, -.05 + (i % 2) * .1, .25, .025, .04, C.iron).rotation.y = i * .4;
    for (let i = 0; i < 5; i++) bx(-L / 2 + .3 + i * .32, 1.5, -T / 2 + .02, .04, .3, .03, C.iron);
    bx(0, 1.62, -T / 2 + .03, L - .2, .05, .04, C.dark);
  },

  charcoal({ view, s, L, T }) {
    for (let i = 0; i < 12; i++) view.mesh(new THREE.DodecahedronGeometry(.16 + (i % 3) * .05), C.cinder, (i % 4 - 1.5) * .2, .15 + Math.floor(i / 4) * .14, (Math.floor(i / 4) - 1) * .22, s).rotation.set(i, i * 2, 0);
  },

  hurst({ bx, cy, L, T, view, s, rand }) {
    // The millstones in their wooden tun on the hurst frame, the hopper over
    // them on its horse, and the great pit wheel standing at the wheel side.
    bx(0, .5, -.2, L, 1.0, T - .5, C.wood);
    for (const x of [-1, 1]) for (const z of [-1, 1]) bx(x * (L / 2 - .08), .55, -.2 + z * ((T - .5) / 2 - .08), .16, 1.1, .16, C.dark);
    cy(0, 1.2, -.2, .82, .38, C.worn, 12);
    cy(0, 1.4, -.2, .75, .04, C.stone, 12);
    for (let i = 0; i < 6; i++) bx(0, 1.425, -.2, 1.3, .006, .04, C.stoneDark).rotation.y = i * PI / 6 + .2;
    for (const x of [-.45, .45]) bx(x, 1.75, -.2, .06, .7, .06, C.dark);
    bx(0, 2.05, -.2, 1.0, .06, .06, C.dark);
    view.mesh(new THREE.CylinderGeometry(.45, .08, .55, 4), C.wood, 0, 2.0, -.2, s).rotation.y = PI / 4;
    view.mesh(new THREE.CylinderGeometry(.34, .34, .02, 4), '#9a8456', 0, 2.26, -.2, s).rotation.y = PI / 4;
    const shoe = bx(0, 1.62, .1, .12, .04, .35, C.wood); shoe.rotation.x = .3;
    // Pit wheel: a big spoked gear in a slot at the front (+z) side.
    const gear = view.mesh(new THREE.TorusGeometry(.8, .07, 4, 16), C.dark, 0, .95, T / 2 - .15, s);
    for (let i = 0; i < 4; i++) bx(0, .95, T / 2 - .15, .05, 1.55, .06, C.wood).rotation.z = i * PI / 4;
    for (let i = 0; i < 16; i++) { const a = i * PI / 8; bx(Math.cos(a) * .9, .95 + Math.sin(a) * .9, T / 2 - .15, .08, .08, .1, C.worn).rotation.z = a; }
    const shaft = cy(0, .95, T / 2, .1, .5, C.dark, 8); shaft.rotation.x = PI / 2;
    // Flour caked on everything.
    bx(.3, 1.01, .2, .6, .01, .5, C.meal);
  },

  bin({ bx, L, T }) {
    bx(0, .6, 0, L, 1.2, T, C.wood);
    bx(0, 1.18, 0, L - .1, .03, T - .1, '#9a8456');
    for (let i = 0; i < 4; i++) bx(0, .15 + i * .3, T / 2 + .005, L, .02, .01, C.dark);
    const lid = bx(0, 1.25, -T / 2 + .05, L, .04, .5, C.dark); lid.rotation.x = -1.1; lid.position.z = -T / 2 - .1; lid.position.y = 1.4;
  },

  sacks({ view, s, L, T }) {
    for (let i = 0; i < 5; i++) {
      const sack = view.mesh(new THREE.CylinderGeometry(.24, .28, .62, 7), i === 4 ? C.linen : C.meal, -L / 2 + .3 + (i % 3) * .42, i < 3 ? .3 : .75, (i < 3 ? -.12 : .05) + (i % 2) * .15, s);
      sack.rotation.z = PI / 2; sack.rotation.y = i * .4; sack.scale.x = .8;
    }
  },

  bolter({ bx, cy, L, T }) {
    bx(0, .55, 0, L, 1.1, T - .1, C.worn);
    bx(0, 1.12, 0, L + .04, .04, T - .06, C.dark);
    bx(-L / 2 + .3, .3, T / 2 - .02, .4, .3, .06, C.dark);
    cy(L / 2 + .01, .8, 0, .04, .1, C.iron).rotation.z = PI / 2;
    bx(L / 2 + .05, .72, 0, .04, .2, .04, C.iron);
  },

  spareStone({ bx, cy, view, s }) {
    const stone = view.mesh(new THREE.CylinderGeometry(.62, .62, .28, 12), C.stone, 0, .64, .02, s); stone.rotation.x = PI / 2 - .12;
    cy(0, .64, .1, .12, .3, C.stoneDark, 8).rotation.x = PI / 2 - .12;
    for (let i = 0; i < 4; i++) bx(0, .64, .17, 1.05, .006, .03, C.stoneDark).rotation.z = i * PI / 4;
    bx(0, .05, .12, .9, .1, .12, C.dark);
    const pick = bx(.5, .1, .35, .35, .04, .04, C.worn); pick.rotation.y = .7;
  },

  manger({ bx, L, T }) {
    bx(0, .45, -.05, L, .9, T - .1, C.dark);
    bx(0, .88, .05, L, .05, T - .1, C.wood);
    bx(0, .82, .02, L - .15, .08, T - .25, C.hay);
    for (let i = 0; i < 6; i++) bx(-L / 2 + .15 + i * (L - .3) / 5, 1.35, -T / 2 + .06, .03, .9, .03, C.worn);
  },

  stallBoard({ bx, L, T, p }) {
    bx(0, p.h / 2, 0, L, p.h, T, C.worn);
    bx(0, p.h + .02, 0, L + .04, .06, T, C.dark);
    bx(0, p.h / 2 + .1, T / 2 - .06, L + .08, p.h + .2, .12, C.dark);
  },

  hayMow({ bx, L, T, p, rand }) {
    // A loose mow: uneven heaped slabs, straw hanging off the front, a fork left in it.
    bx(0, .5, 0, L, 1.0, T, C.hayDark);
    for (let i = 0; i < 5; i++) { const s = bx((rand() - .5) * (L - .6), 1.1 + rand() * .45, (rand() - .5) * (T - .8) - .1, .6 + rand() * (L - 1.2), .5, .6 + rand() * .8, i % 2 ? C.hay : C.straw); s.rotation.y = (rand() - .5) * .4; }
    bx(0, .9, T / 2 - .15, L - .2, .5, .3, C.hay);
    if (p.part === 1) { const fork = bx(.2, 1.5, T / 2 - .3, .04, 1.6, .04, C.worn); fork.rotation.x = .45; }
  },

  grainChest({ bx, L, T }) {
    bx(0, .38, 0, L, .76, T, C.dark);
    const lid = bx(0, .79, 0, L + .04, .04, T + .04, C.wood); lid.rotation.x = -.12;
    bx(.2, .81, .05, .3, .04, .2, '#9a8456');
  },

  chaise({ bx, cy, L, T, view, s }) {
    // An old one-horse chaise, its hood rotted, shafts down on the floor.
    for (const x of [-1, 1]) { const wh = view.mesh(new THREE.TorusGeometry(.5, .04, 4, 12), C.dark, x * (L / 2 - .1), .52, 0, s); wh.rotation.y = PI / 2; bx(x * (L / 2 - .1), .52, 0, .04, .9, .04, C.worn); }
    bx(0, .75, 0, L - .45, .35, .8, C.black);
    bx(0, 1.0, -.25, L - .45, .4, .1, C.black);
    const hood = view.mesh(new THREE.CylinderGeometry(.5, .5, L - .5, 8, 1, true, 0, PI), C.leather, 0, 1.05, -.1, s); hood.rotation.z = PI / 2;
    for (const x of [-.35, .35]) { const shaft = bx(x, .35, T / 2 + .1, .05, .05, 1.0, C.worn); shaft.rotation.x = .6; }
  },

  woodpile({ bx, cy, L, T, s }) {
    // Cordwood: log ends facing the room, stacked between two stakes.
    for (const x of [-1, 1]) bx(x * (L / 2 - .05), .65, 0, .08, 1.3, .08, C.dark);
    const per = Math.max(2, Math.floor((L - .2) / .2));
    for (let row = 0; row < 6; row++) for (let i = 0; i < per; i++) {
      const log = cy(-L / 2 + .15 + i * (L - .3) / (per - 1) + (row % 2) * .05, .12 + row * .2, 0, .09 + ((i + row) % 3) * .012, T - .05, (i + row) % 3 ? C.wood : C.worn, 5);
      log.rotation.x = PI / 2;
    }
  },

  sawbuck({ bx, cy, L, T, s }) {
    for (const x of [-1, 1]) for (const r of [-.5, .5]) { const leg = bx(x * (L / 2 - .15), .45, 0, .05, 1.0, .05, C.dark); leg.rotation.x = r; }
    bx(0, .35, 0, L - .2, .04, .04, C.dark);
    const log = cy(0, .82, 0, .12, L + .3, C.wood, 6); log.rotation.z = PI / 2;
    bx(.1, .82, 0, .02, .26, .26, C.pale);
    const saw = bx(.1, .98, .05, .02, .3, .6, C.iron); saw.rotation.x = .3;
  },

  block({ bx, cy, p }) {
    if (p.kind !== 'block') { bx(0, p.h / 2, 0, p.w, p.h, p.d, C.wood); return; }
    cy(0, .25, 0, .27, .5, C.worn, 8);
    cy(0, .505, 0, .25, .01, C.pale, 8);
    const axe = bx(.05, .7, 0, .04, .5, .04, C.worn); axe.rotation.z = .5; bx(-.05, .52, 0, .15, .1, .03, C.iron);
    for (let i = 0; i < 4; i++) bx(.35 + i * .06, .1, -.2 + i * .12, .2, .06, .08, C.pale).rotation.y = i;
  },

  bier({ bx, L, T }) {
    // The parish bier: carrying poles, legs, and a coffin still on it.
    for (const z of [-1, 1]) bx(0, .62, z * (T / 2 - .06), L, .06, .06, C.dark);
    for (const x of [-1, 1]) for (const z of [-1, 1]) bx(x * (L / 2 - .5), .31, z * (T / 2 - .06), .06, .62, .06, C.dark);
    coffin(bx, 0, .65, 0, 1.85, .5, false);
  },

  coffinStack({ bx, L, T }) {
    // Unfinished coffin boards and two plain coffins stacked, waiting.
    coffin(bx, 0, 0, 0, Math.min(L - .1, 1.8), T - .1, true);
    coffin(bx, 0, .42, 0, Math.min(L - .1, 1.8), T - .1, true);
  },

  coffinShelf({ bx, L, T, rand }) {
    // Two stone shelves in the vault wall, a coffin on each.
    for (const y of [.1, .75]) { bx(0, y, 0, L, .12, T, C.stone); coffin(bx, (rand() - .5) * .1, y + .06, .02, Math.min(L - .1, 1.8), T - .15, rand() < .5); }
    for (const x of [-1, 1]) bx(x * (L / 2 - .05), .65, 0, .1, 1.3, T, C.stoneDark);
    bx(0, .72, T / 2 - .05, .14, .06, .1, C.bone);
  },

  floorCoffin({ bx, L, T }) {
    coffin(bx, 0, 0, 0, L, T, false, true);
  },
};

// A plain six-board coffin; `open`: its lid slid off beside it, empty.
function coffin(bx, x, y, z, L, T, plain, open = false) {
  const shade = plain ? C.worn : C.dark;
  bx(x, y + .2, z, L, .36, T * .78, shade);
  bx(x - L * .15, y + .2, z, L * .5, .36, T, shade);
  if (!open) { bx(x - L * .1, y + .4, z, L * .92, .04, T * .9, C.wood); return; }
  bx(x, y + .37, z, L - .1, .01, T * .7, C.soot);
  const lid = bx(x + .15, y + .03, z + T * .75, L * .92, .04, T * .9, C.wood); lid.rotation.y = .15; lid.rotation.z = .08;
}

function hearthModel({ bx, cy, L, T, p, view, s }, stack) {
  // A brick chimney mass with a wide cooking hearth in its front face: ash
  // bed, andirons, charred logs, the iron crane swung out with a pot on its
  // hook, a mantel with a candlestick and a fowling piece on pegs.
  const H = p.h, mouth = Math.min(1.6, L - .5), deep = Math.min(.7, T - .4);
  bx(0, H / 2, -deep / 2, L, H, T - deep, C.brick);
  for (const x of [-1, 1]) bx(x * (L / 2 - (L - mouth) / 4), H / 2, T / 2 - deep / 2, (L - mouth) / 2, H, deep, C.brick);
  bx(0, 1.2 + (H - 1.2) / 2, T / 2 - deep / 2, mouth, H - 1.2, deep, C.brick);
  bx(0, 1.25, T / 2 + .06, L - .1, .08, .16, C.dark);
  bx(0, .09, T / 2 - deep / 2, mouth, .02, deep, C.soot);
  bx(0, .1, T / 2 - deep / 2 + .05, mouth - .3, .02, deep - .2, C.ash);
  bx(0, .085, T / 2 + .35, mouth + .5, .02, .7, C.stoneDark);
  for (const x of [-.35, .35]) { bx(x, .2, T / 2 - deep / 2, .04, .2, deep - .15, C.iron); bx(x, .3, T / 2 - .12, .04, .12, .04, C.iron); }
  for (let i = 0; i < 3; i++) { const log = cy(-.2 + i * .2, .2, T / 2 - deep / 2, .07, .7, i ? C.soot : C.black, 5); log.rotation.x = PI / 2; log.rotation.y = (i - 1) * .3; }
  // Crane: an upright on the jamb and the arm swung out over the ashes.
  const cx = -mouth / 2 + .08;
  bx(cx, .75, T / 2 - deep + .1, .04, 1.1, .04, C.iron);
  const arm = bx(cx + .35, 1.1, T / 2 - deep / 2 + .05, .75, .035, .035, C.iron); arm.rotation.y = -.5;
  bx(cx + .6, .9, T / 2 - deep / 2 + .25, .015, .4, .015, C.iron);
  cy(cx + .6, .62, T / 2 - deep / 2 + .25, .16, .22, C.black, 8, .13);
  candlestick({ view }, s, L / 2 - .3, 1.29, T / 2 + .06, .4);
  bx(-L / 2 + .3, 1.34, T / 2 + .06, .2, .08, .1, C.pewter);
  const gun = bx(0, 1.55, T / 2 + .02, 1.5, .05, .04, C.dark); gun.rotation.z = .03; bx(-.62, 1.54, T / 2 + .02, .3, .09, .05, C.wood);
  // The top as the camera sees it with the roof gone: the flue's sooty
  // mouth and a darker course of brick.
  bx(0, H + .005, -deep / 2 - .1, Math.min(.9, L - .6), .01, Math.min(.5, T - deep - .2), C.soot);
  bx(0, H - .15, 0, L + .02, .06, T + .02, C.brickDark);
  if (stack) {
    // The other side of a centre chimney: a small parlour fireplace.
    bx(0, .6, -T / 2 - .01, .7, .6, .02, C.soot);
    bx(0, .95, -T / 2 - .04, 1.1, .06, .1, C.dark);
  }
}

function trestleModel({ bx, cy, L, T, s, view }) {
  // A trestle table (board on two trestles) with a bench along each side.
  const top = L, tw = T - .7;
  bx(0, .76, 0, top, .05, tw, C.worn);
  for (const x of [-1, 1]) { bx(x * (top / 2 - .25), .38, 0, .07, .72, tw - .2, C.dark); bx(x * (top / 2 - .25), .06, 0, .12, .1, tw - .05, C.dark); }
  bx(0, .3, 0, top - .5, .06, .06, C.dark);
  for (const z of [-1, 1]) { bx(0, .44, z * (T / 2 - .17), top - .2, .05, .28, C.wood); for (const x of [-1, 1]) bx(x * (top / 2 - .3), .21, z * (T / 2 - .17), .06, .42, .24, C.dark); }
  {
    // Supper being made: a bowl of apples half pared, the peel on the board.
    cy(-.3, .82, 0, .16, .08, C.worn, 10, .2);
    for (let i = 0; i < 4; i++) view.mesh(new THREE.DodecahedronGeometry(.05), '#6f4a2a', -.35 + (i % 2) * .08, .88, -.04 + i * .025, s);
    bx(.15, .79, .05, .25, .01, .03, C.iron);
    for (let i = 0; i < 4; i++) bx(.3 + i * .04, .79, -.05 + (i % 2) * .05, .06, .006, .02, '#6f4a2a').rotation.y = i;
    plate({ view }, s, .6, .785, 0, false);
  }
}
