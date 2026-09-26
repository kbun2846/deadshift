// Furniture inside buildings: WHERE each piece stands, and how solid it is.
// One list per building, read by both sides of the game:
//  - the renderer draws every piece from it (interior-details.js draws the
//    generic rooms' counter, stools, stoves, shelves, sacks, wheels and floor
//    clutter at exactly these spots; detailed-interiors.js draws the styled
//    rooms' own cover);
//  - map-kit.js mapColliders turns every piece that is not walk-over clutter
//    into a collider of the piece's footprint and height.
// So nothing is drawn that a body walks through, and there is no second list
// to drift (owner, 2026-09-26: "make Deadwater furniture solid").
//
// Doors and walkways come first. Inside every doorway a strip the door's width
// (plus a margin) and DOOR_DEPTH deep stays empty, and a WALKWAY-wide lane runs
// clear from each door to the room's centre, so every door reaches the centre
// and every other door. A piece that would touch either takes its next
// candidate spot or is left out. Pieces keep GAP from one another, so the
// slots between them are either too narrow to enter or wide enough to walk.
//
// Coordinates are the building's own (x across, z front(+)/back(-), metres),
// the same frame as interiorCover(b).
import { interiorCover } from './detailed-interiors.js';

// id -> [floor, dark, accent, theme]: each room's colours and what it was.
export const THEMES = {
  saloon:['#82705a','#665544','#795447','bar'],
  supplies:['#99866c','#796750','#78816c','provisions'],
  sheriff:['#8f8270','#746957','#6c7a76','office'],
  freight:['#847764','#685e50','#8b8067','freight'],
  'boarding-house':['#97816b','#7d6958','#797c68','lodging'],
  'abandoned-store':['#817a66','#676250','#7f7560','abandoned'],
  'old-house':['#95836e','#796854','#8c725d','hearth'],
  workshop:['#837360','#665c50','#778077','workshop'],
  'south-store':['#a08a6d','#7a6854','#81714e','drygoods'],
  farmhouse:['#a18e70','#807259','#899078','farm'],
  barn:['#86765b','#6d5d47','#a3915b','barn'],
  'west-mercantile':['#928774','#726955','#697d75','mercantile'],
  'west-homestead':['#927f68','#74614e','#83736b','homestead'],
  'west-depot':['#8a7f6d','#706451','#71817b','depot'],
};
export const themeOf = b => THEMES[b.id] || THEMES.freight;

// Each kind's collider height (metres, as drawn). All of it stops bodies and
// robots; none of it stops rounds: the plain rooms' furniture is waist high
// or stands against a wall, so rounds fly over it as through a window's sill
// (a playerOnly collider) and the fights in these rooms play as they did.
// (The styled rooms' interiorCover is still cover that stops fire.) A kind
// given `cover: true` would stop rounds too. `walkOver` pieces are floor
// clutter: drawn from this list, never a collider.
export const FURNITURE = Object.freeze({
  counter: { h: .8 },
  stool: { h: .56 },
  stove: { h: 1.2 },       // the small corner stove (its flue is thin)
  range: { h: 1.2 },       // the big stove against a wall
  woodpile: { h: .5 },
  sacks: { h: .8 },
  wheel: { h: 1.0 },
  shelf: { h: 1.5 },       // a wall shelf and its supports
  brokenChair: { h: .5, walkOver: true },
  litter: { h: .1, walkOver: true },
});

export const DOOR_DEPTH = 1.5;   // clear strip inside a doorway (1.3 m + the wall's half thickness)
export const DOOR_MARGIN = .3;   // each side of the door's width
export const WALKWAY = 1.3;      // clear lane from each door to the centre
export const GAP = .25;          // between two pieces
const WALL = .19;                // half a wall's thickness
// The pocket check: a body this round (a robot's nav clearance, RULES.radius
// .38 + .08, and a little more) must reach every spot of floor it fits on
// from a door, on a grid this fine.
const POCKET_BODY = .5, POCKET_CELL = .2;

// The room's own seeded random, shared with the dressing in interior-details.js.
export function roomRandom(b) {
  const seed = [...b.id].reduce((n, c) => n + c.charCodeAt(0), 0);
  return i => { const v = Math.sin(i * 127.1 + seed * 31.7) * 43758.5; return v - Math.floor(v); };
}

// The doors of a room, each with the strip inside it and the lane to the
// centre, as boxes { x0, x1, z0, z1 } in the building's frame. `b.doors` are
// centred on their side; `b.openings` ({ side, offset, width }, extra
// doorways) may sit anywhere along it, and their lane runs straight in to the
// room's middle line and along it to the centre (`lane` and `along`).
export function doorZones(b) {
  const zones = [], hw = b.w / 2, hd = b.d / 2, lane = WALKWAY / 2;
  const doors = [...(b.doors || ['front']).map(side => ({ side, offset: 0, width: b.doorWidth || 2.6 })),
    ...(b.openings || []).map(o => ({ offset: 0, width: b.doorWidth || 2.6, ...o }))];
  for (const { side, offset, width } of doors) {
    const dw = width / 2 + DOOR_MARGIN, o = offset;
    const along = o ? { x0: Math.min(0, o) - lane, x1: Math.max(0, o) + lane, z0: -lane, z1: lane } : null;
    const alongZ = o ? { x0: -lane, x1: lane, z0: Math.min(0, o) - lane, z1: Math.max(0, o) + lane } : null;
    if (side === 'front') zones.push({ side, strip: { x0: o - dw, x1: o + dw, z0: hd - DOOR_DEPTH, z1: hd }, lane: { x0: o - lane, x1: o + lane, z0: -lane, z1: hd }, along });
    if (side === 'back') zones.push({ side, strip: { x0: o - dw, x1: o + dw, z0: -hd, z1: -hd + DOOR_DEPTH }, lane: { x0: o - lane, x1: o + lane, z0: -hd, z1: lane }, along });
    if (side === 'left') zones.push({ side, strip: { x0: -hw, x1: -hw + DOOR_DEPTH, z0: o - dw, z1: o + dw }, lane: { x0: -hw, x1: lane, z0: o - lane, z1: o + lane }, along: alongZ });
    if (side === 'right') zones.push({ side, strip: { x0: hw - DOOR_DEPTH, x1: hw, z0: o - dw, z1: o + dw }, lane: { x0: -lane, x1: hw, z0: o - lane, z1: o + lane }, along: alongZ });
  }
  return zones;
}

const boxOf = p => ({ x0: p.x - p.w / 2, x1: p.x + p.w / 2, z0: p.z - p.d / 2, z1: p.z + p.d / 2 });
const overlaps = (a, b, gap = 0) => a.x0 < b.x1 + gap && b.x0 < a.x1 + gap && a.z0 < b.z1 + gap && b.z0 < a.z1 + gap;

const layouts = new WeakMap();

// The room's furniture: [{ kind, x, z, w, d, h, cover?, walkOver?, side?,
// group? }], plus `counter` (the counter's segments, for what stands on it).
// Styled rooms (b.interiorStyle) keep their interiorCover(b) as it is and get
// only the extra pieces placed around it; rail cars get nothing.
export function roomLayout(b) {
  let layout = layouts.get(b);
  if (layout) return layout;
  layout = { pieces: [], counter: [] };
  layouts.set(b, layout);
  // Rail cars have no furniture; a building with its own construction
  // (`style`, e.g. Hollow Wick's colonial houses) draws and lays out its own
  // room (interiorCover), so nothing is added to it here.
  if (b.cargo || b.style) return layout;
  const [, , , theme] = themeOf(b), rand = roomRandom(b), hw = b.w / 2, hd = b.d / 2;
  const zones = doorZones(b), keepOut = zones.flatMap(z => [z.strip, z.lane, z.along].filter(Boolean));
  const taken = interiorCover(b).map(boxOf);
  const solid = interiorCover(b).map(boxOf);
  const pocketFree = extra => !hasPocket(b, [...solid, ...extra]);
  const fits = (box, gap = GAP) => box.x0 >= -hw + WALL + .01 && box.x1 <= hw - WALL - .01 && box.z0 >= -hd + WALL + .01 && box.z1 <= hd - WALL - .01
    && !keepOut.some(k => overlaps(box, k)) && !taken.some(t => overlaps(box, t, gap));
  // A solid piece must also leave no pocket: floor a body fits on but cannot
  // reach from a door (hasPocket, below).
  const fitsSolid = (...boxes) => boxes.every(x => fits(x)) && pocketFree(boxes);
  const add = (kind, x, z, w, d, extra = {}) => {
    const piece = { kind, x, z, w, d, h: FURNITURE[kind].h, ...extra };
    if (FURNITURE[kind].cover) piece.cover = true;
    if (FURNITURE[kind].walkOver) piece.walkOver = true;
    layout.pieces.push(piece); taken.push(boxOf(piece));
    if (!piece.walkOver) solid.push(boxOf(piece));
    return piece;
  };
  // The first candidate spot [x, z] where a w x d piece fits, or null.
  const spot = (candidates, w, d, walkOver) => candidates.find(([x, z]) => walkOver ? fits(boxOf({ x, z, w, d })) : fitsSolid(boxOf({ x, z, w, d }))) || null;
  const place = (kind, candidates, w, d, extra) => { const s = spot(candidates, w, d, FURNITURE[kind].walkOver); return s ? add(kind, s[0], s[1], w, d, extra) : null; };

  // The counter along the back wall (the plain rooms'), cut where a doorway or
  // its lane crosses it; a stub under a metre is left out.
  if (!b.interiorStyle) {
    const z = -hd + 1.1, d = .65, half = (b.w - (b.finish === 'plaster' ? 3.5 : 2)) / 2;
    let runs = [[-half, half]];
    for (const k of keepOut) {
      if (!(k.z0 < z + d / 2 + GAP && z - d / 2 - GAP < k.z1)) continue;
      runs = runs.flatMap(([a, c]) => [[a, Math.min(c, k.x0 - GAP)], [Math.max(a, k.x1 + GAP), c]]).filter(([a, c]) => c - a >= 1);
    }
    for (const [a, c] of runs) { add('counter', (a + c) / 2, z, c - a, d); layout.counter.push({ x0: a, x1: c, z }); }
    // Two stools in front of it (moved out a step, or left out, when a lane needs the floor).
    const sx = b.finish === 'vertical' ? 1.5 : 2;
    for (const side of [-1, 1]) place('stool', [[side * sx, -hd + 2.2], [side * (sx + .8), -hd + 2.2]], .64, .64);
  }

  // The theme's big corner piece: a small stove, a stack of sacks or a spare
  // wheel, in a back corner (in front of the counter where there is one),
  // else a front corner.
  const cornerKinds = { provisions: [['sacks', -1]], office: [['stove', -1]], freight: [['wheel', -1]], hearth: [['stove', -1]],
    workshop: [['wheel', 1]], drygoods: [['sacks', 1]], farm: [['sacks', 1]], barn: [['wheel', -1], ['sacks', 1]], homestead: [['stove', 1]] }[theme] || [];
  const cornerSize = { stove: [.7, .7], sacks: [.9, .85], wheel: [1, .4] };
  for (const [kind, side] of cornerKinds) {
    const [w, d] = cornerSize[kind], x = hw - WALL - .08 - w / 2;
    const back = -hd + WALL + .1 + d / 2, front = -hd + 1.425 + GAP + .02 + d / 2;
    place(kind, [[side * x, back], [side * x, front], [side * x, hd - 1.1], [-side * x, back], [-side * x, front], [-side * x, hd - 1.1]], w, d, { side });
  }

  // A shelf board along a solid side wall, full length where the wall has room,
  // shorter or further along it where a side door needs the floor.
  const shelfSide = rand(11) < .5 ? -1 : 1, run = Math.min(3.2, b.d - 3.2);
  if (run > 1.4) {
    const candidates = [];
    for (const side of [shelfSide, -shelfSide]) for (const length of [run, Math.min(run, 2.2), 1.5]) {
      const reach = hd - WALL - .02 - length / 2;
      for (const z of [0, -b.d * .18, b.d * .18, -reach, reach]) candidates.push([side, z, length]);
    }
    const x = hw - WALL - .02 - .16;
    const found = candidates.find(([side, z, length]) => fitsSolid(boxOf({ x: side * x, z, w: .32, d: length })));
    if (found) add('shelf', found[0] * x, found[1], .32, found[2], { side: found[0] });
  }

  // A stove against a wall with its woodpile beside it (rooms whose theme
  // already has a corner stove do not get a second). The stove and its wood
  // are two pieces placed together; `facing` is the way the stove's door and
  // the wood face (+1 into the room from the back wall, -1 from the front).
  if (theme !== 'hearth' && theme !== 'homestead') {
    const at = (sx, sz, facing) => {
      const logSide = sx < 0 ? 1 : -1;
      return [{ x: sx, z: sz + facing * .05, w: .84, d: .8 }, { x: sx + logSide * .71, z: sz + facing * .6, w: .3, d: .76 }];
    };
    const ex = hw - 1.15, candidates = [[-shelfSide * ex, -hd + 1.05, 1], [shelfSide * ex, -hd + 1.05, 1], [-shelfSide * ex, -hd + 2.3, 1],
      [shelfSide * ex, -hd + 2.3, 1], [-shelfSide * ex, hd - 1.05, -1], [shelfSide * ex, hd - 1.05, -1]];
    for (const [sx, sz, facing] of candidates) {
      const [stove, wood] = at(sx, sz, facing);
      if (!fitsSolid(boxOf(stove), boxOf(wood))) continue;
      const group = layout.pieces.length;
      add('range', stove.x, stove.z, stove.w, stove.d, { group, stoveX: sx, stoveZ: sz, facing });
      add('woodpile', wood.x, wood.z, wood.w, wood.d, { group });
      break;
    }
  }

  // Floor clutter last (walk-over, so it may sit anywhere off the lanes): the
  // chair that lost a leg, and scraps swept into a corner.
  place('brokenChair', [[hw - 1.15, -hd + 1.3], [hw - 1.1, -hd + 2.4], [-(hw - 1.1), hd - 2], [hw - 1.1, hd - 2], [-(hw - 1.1), -hd + 2.4]], 1.1, 1);
  place('litter', [[-hw + .95, -hd + .85], [-hw + .95, -hd + 2.1], [-hw + .95, hd - .85], [hw - .95, hd - .85]], 1.4, 1.2);
  return layout;
}

export const roomFurniture = b => roomLayout(b).pieces;

// Is there floor in the room a body fits on (POCKET_BODY round, clear of the
// walls and of every box in `boxes`) that it cannot walk to from a doorway?
// A flood over a POCKET_CELL grid in the building's frame, from each door.
export function hasPocket(b, boxes) {
  const hw = b.w / 2, hd = b.d / 2, r = POCKET_BODY, cols = Math.ceil(b.w / POCKET_CELL), rows = Math.ceil(b.d / POCKET_CELL);
  const open = new Uint8Array(cols * rows), seen = new Uint8Array(cols * rows), at = i => [-hw + (i % cols + .5) * POCKET_CELL, -hd + (Math.floor(i / cols) + .5) * POCKET_CELL];
  const doors = doorZones(b);
  for (let i = 0; i < open.length; i++) {
    const [x, z] = at(i);
    // Inside the walls, or in a doorway's own gap in them.
    const inside = Math.abs(x) <= hw - WALL - r && Math.abs(z) <= hd - WALL - r;
    const inDoor = doors.some(({ side, strip }) => {
      // The doorway's own gap: the strip's middle, less the margin and the body.
      const half = (side === 'front' || side === 'back' ? strip.x1 - strip.x0 : strip.z1 - strip.z0) / 2 - DOOR_MARGIN - r, mid = side === 'front' || side === 'back' ? (strip.x0 + strip.x1) / 2 : (strip.z0 + strip.z1) / 2;
      return side === 'front' ? Math.abs(x - mid) <= half && z >= 0 && z <= hd
        : side === 'back' ? Math.abs(x - mid) <= half && z <= 0 && z >= -hd
        : side === 'left' ? Math.abs(z - mid) <= half && x <= 0 && x >= -hw : Math.abs(z - mid) <= half && x >= 0 && x <= hw;
    });
    if (!inside && !inDoor) continue;
    if (boxes.some(q => { const cx = Math.max(q.x0, Math.min(q.x1, x)), cz = Math.max(q.z0, Math.min(q.z1, z)); return (x - cx) ** 2 + (z - cz) ** 2 < r * r; })) continue;
    open[i] = 1;
  }
  const queue = [];
  for (const { side, strip } of doors) {
    const mx = (strip.x0 + strip.x1) / 2, mz = (strip.z0 + strip.z1) / 2;
    const [x, z] = { front: [mx, hd - POCKET_CELL], back: [mx, -hd + POCKET_CELL], left: [-hw + POCKET_CELL, mz], right: [hw - POCKET_CELL, mz] }[side];
    const i = Math.min(rows - 1, Math.max(0, Math.floor((z + hd) / POCKET_CELL))) * cols + Math.min(cols - 1, Math.max(0, Math.floor((x + hw) / POCKET_CELL)));
    if (open[i] && !seen[i]) { seen[i] = 1; queue.push(i); }
  }
  while (queue.length) {
    const i = queue.pop(), col = i % cols, row = Math.floor(i / cols);
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const c = col + dc, w = row + dr; if (c < 0 || w < 0 || c >= cols || w >= rows) continue;
      const j = w * cols + c; if (open[j] && !seen[j]) { seen[j] = 1; queue.push(j); }
    }
  }
  for (let i = 0; i < open.length; i++) if (open[i] && !seen[i]) return true;
  return false;
}

// Where something standing on the counter goes: x itself when it is on a
// counter segment (with a margin), else the nearest spot that is, else null
// (no counter, so the thing is not drawn).
export function onCounter(b, x, margin = .25) {
  let best = null;
  for (const s of roomLayout(b).counter) {
    const c = Math.max(s.x0 + margin, Math.min(s.x1 - margin, x));
    if (best === null || Math.abs(c - x) < Math.abs(best - x)) best = c;
  }
  return best;
}

// Everything in the room a body bumps into: the styled rooms' cover (always
// cover, as before) and the placed furniture, without the walk-over clutter.
// map-kit.js mapColliders builds one collider from each.
export function solidFurniture(b) {
  return [...interiorCover(b).map(p => ({ ...p, cover: true, styled: true })),
    ...roomFurniture(b).filter(p => !p.walkOver)];
}
