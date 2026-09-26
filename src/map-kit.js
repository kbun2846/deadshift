// The shared map kit: the building helper, every prop type, and the functions
// that turn a map's plain data into walls, props and colliders. Maps
// themselves live one per file in src/maps/ and are listed in src/maps.js.
// Coordinates are metres: x east, z south, y height.
import { ROADSIDE_TYPES } from './world/roadside.js';
import { RAIL_TYPES } from './world/rail-depot.js';
import { HOLLOW_BREAKABLES } from './world/hollow-breakables.js'; // s2-breakables
import { COLONIAL_TYPES } from './world/colonial-parts.js'; // s2-buildings
import { GRAVE_TYPES } from './world/graveyard.js'; // s2-graveyard
import { HOLLOW_TYPES } from './world/hollow-props.js'; // (s2-props: Hollow Wick's open-ground pieces)
import { solidFurniture } from './world/room-furniture.js'; // dw-furniture: all furniture solid
import { FLAT, groundFromBaked, edgeCollider } from './world/heightfield.js';
import { BAKED_TERRAIN } from './maps/terrain/index.js';
import { treeColliders } from './world/tree-kinds.js'; // s2-trees

// The ground under a map (world/heightfield.js): FLAT for a map without a
// `terrain` spec, otherwise its prebaked grid, built once per map id and
// shared by every simulation, robot and view of it.
const grounds = new Map();
export function groundFor(map) {
  if (!map?.terrain) return FLAT;
  let ground = grounds.get(map.id);
  if (!ground) {
    const baked = BAKED_TERRAIN[map.id];
    if (!baked) throw new Error(`Map ${map.id} has no baked terrain: run node tools/bake-terrain.mjs`);
    grounds.set(map.id, ground = groundFromBaked(baked, map.terrain));
  }
  return ground;
}

// A building's roof footprint is independent of its physical wall colliders.
export const building = (id, x, z, w, d, height, label, color, roofColor) => ({
  id, x, z, w, d, height, label, color, roofColor, doorWidth: 2.6,
});

export const PROP_TYPES = Object.freeze({
  ...ROADSIDE_TYPES, ...RAIL_TYPES,
  ...COLONIAL_TYPES, // s2-buildings: Hollow Wick's portico and forge parts
  ...GRAVE_TYPES, // s2-graveyard
  ...HOLLOW_TYPES, // (s2-props)
  ...HOLLOW_BREAKABLES, // s2-breakables: Hollow Wick's breakables
  // Breakable scenery shares one low health so a single orb clears it on the way
  // through. They are dressing and light cover, never a damage sponge that eats
  // a volley meant for something behind them.
  barrel: { w: 1, d: 1, health: 5 }, crate: { w: 1.25, d: 1.25, health: 5 },
  cactus: { w: 1.5, d: .55, health: 5 }, sign: { w: 2.2, d: .4, health: 5 },
  deadwood: { w: 1.2, d: .7, health: 5 },
  // Ankle-height floor clutter. Breakable and shootable like the rest, but
  // `walkOver` keeps it out of the movement solver: a pot that snags the player
  // in a two-metre gap between a counter and a wall is a bug, not detail. A
  // dash still takes them, and a stray round still finds them.
  pot: { w: .52, d: .52, health: 5, walkOver: true },
  pottedPlant: { w: .58, d: .58, health: 5, walkOver: true },
  brokenChair: { w: .78, d: .78, health: 5, walkOver: true },
  hay: { w: 1.6, d: 1.25, health: 5 }, well: { w: 2, d: 2, health: null },
  tower: { w: 3.2, d: 3.2, health: null }, cart: { w: 2.5, d: 1.5, health: null },
  brokenWagon: { w: 3.5, d: 2.2, health: null }, windmill: { w: 2.6, d: 2.6, health: null }, trough: { w: 2.8, d: 1, health: null },
  cistern: { w: 4.2, d: 4.2, health: null }, ruinedArch: { w: 4, d: 1.3, health: null, collisionBoxes: [[-1.4,0,.88,1.15],[1.4,0,.88,1.15]] }, telegraph: { w: .4, d: .4, health: null },
  boulder: { w: 3, d: 2.5, health: null }, deadTree: { w: .9, d: .9, health: null }, stump: { w: .9, d: .9, health: null },
});

// Some crates were already coming apart before the player got here. Purely
// dressing: the footprint, the health and the cover are identical to a whole
// crate, so nothing about a fight changes — only how much of the crate is
// still standing. Derived from the crate's own position so the same ones are
// always the broken ones, run to run, and overridable per prop with `broken`.
export const BROKEN_CRATE_SHARE = .26;
export function crateIsBroken(p, i) {
  if (p.broken !== undefined) return !!p.broken;
  if (p.type !== 'crate') return false;
  const seed = Math.sin(p.x * 34.771 + p.z * 91.443 + i * 7.13) * 21817.531;
  return seed - Math.floor(seed) < BROKEN_CRATE_SHARE;
}

export function mapProps(map) {
  return map.props.map((p, i) => ({ ...PROP_TYPES[p.type], ...p, angle: propAngle(p,i), id: p.id || 'prop-' + i,
    broken: crateIsBroken(p, i),
    w: PROP_TYPES[p.type].w * (p.scale || 1), d: PROP_TYPES[p.type].d * (p.scale || 1) }));
}

// Anything that has to stay square to something man-made keeps a heading of
// zero: road-spanning pieces end up lying across the carriageway otherwise,
// and rolling stock ends up off its own rails.
const ROAD_ALIGNED = ['checkpoint','culvert','telegraph','sign','fallenPole','locomotive','boxcar','railBuffer'];
function propAngle(p,i) {
  if(p.angle!==undefined)return p.angle;
  if(ROAD_ALIGNED.includes(p.type))return 0;
  const seed=Math.sin(p.x*12.9898+p.z*78.233+i)*43758.5453,unit=seed-Math.floor(seed);
  if(['cactus','barrel','boulder','deadTree','stump','deadwood'].includes(p.type))return unit*Math.PI*2;
  if(['crate','hay','cart','freightScreen','timberStack','rockRidge'].includes(p.type))return (unit-.5)*1.15;
  if(['stoneBoundary','freightWreck','repairStation','oreSite'].includes(p.type))return (unit-.5)*.55;
  // Built structures were put up facing whatever mattered at the time, not due
  // north. A modest spread is enough: the `i%4===0` shortcut that used to sit
  // at the top of this function pinned a quarter of every prop on the map to
  // exactly zero, which is why so much of it looked laid out on a grid.
  if(['pot','pottedPlant','brokenChair'].includes(p.type))return unit*Math.PI*2;
  if(['coachStop','loadingPlatform','wateringStation','waterTank','graveyard','well','trough','cistern','brokenWagon','windmill','ruinedArch','tower','oreSite','repairStation','sandbags','plankBarricade'].includes(p.type))return (unit-.5)*.7;
  return 0;
}

export function buildingWalls(b) {
  const walls = [];
  const c = Math.cos(b.angle || 0), s = Math.sin(b.angle || 0);
  for (const side of ['front', 'back', 'left', 'right']) {
    const horizontal = side === 'front' || side === 'back', sign = side === 'back' || side === 'left' ? -1 : 1;
    const span = horizontal ? b.w : b.d, across = sign * (horizontal ? b.d : b.w) / 2;
    const openings = localOpenings(b).filter(o => o.side === side).sort((a, b) => a.offset - b.offset);
    const pieces = []; let cursor = -span / 2;
    for (const opening of openings) {
      const left = opening.offset - opening.width / 2, right = opening.offset + opening.width / 2;
      if (left > cursor) pieces.push({ from: cursor, to: left });
      if (opening.type === 'window') pieces.push({ from: left, to: right, playerOnly: true });
      cursor = right;
    }
    if (cursor < span / 2) pieces.push({ from: cursor, to: span / 2 });
    for (const piece of pieces) {
      const along = (piece.from + piece.to) / 2, length = piece.to - piece.from;
      const x = horizontal ? along : across, z = horizontal ? across : along;
      const w = horizontal ? length : .38, d = horizontal ? .38 : length;
      walls.push({ x: b.x + x * c + z * s, z: b.z - x * s + z * c,
        w: Math.abs(w * c) + Math.abs(d * s), d: Math.abs(w * s) + Math.abs(d * c),
        angle:b.angle||0,localW:w,localD:d,
        height: piece.playerOnly ? .5 : b.height, playerOnly: !!piece.playerOnly, buildingId: b.id });
    }
  }
  return walls;
}

export function localOpenings(b) {
  return [...(b.doors || ['front']).map(side => ({ side, offset: 0, width: b.doorWidth, type: 'door' })),
    // s2-buildings: extra doorways anywhere on a side ({ side, offset, width }).
    ...(b.openings || []).map(o => ({ offset: 0, width: b.doorWidth, ...o, type: 'door' })),
    ...(b.windows || []).filter(w => !w.boarded).map(w => ({ ...w, type: 'window' }))];
}

export function buildingPoint(b, x, z) {
  const c = Math.cos(b.angle || 0), s = Math.sin(b.angle || 0);
  return { x: b.x + x * c + z * s, z: b.z - x * s + z * c };
}

export function buildingContains(b, point) {
  const c = Math.cos(b.angle || 0), s = Math.sin(b.angle || 0), x = point.x - b.x, z = point.z - b.z;
  return Math.abs(x * c - z * s) < b.w / 2 && Math.abs(x * s + z * c) < b.d / 2;
}

export function buildingOpenings(b) {
  return localOpenings(b).map(o => {
    const horizontal = o.side === 'front' || o.side === 'back', sign = o.side === 'back' || o.side === 'left' ? -1 : 1;
    const across = sign * (horizontal ? b.d : b.w) / 2;
    const edge = along => buildingPoint(b, horizontal ? along : across, horizontal ? across : along);
    return { ...o, a: edge(o.offset - o.width / 2 + .1), b: edge(o.offset + o.width / 2 - .1) };
  });
}

export function mapColliders(map) {
  const colliders = map.buildings.flatMap(buildingWalls);
  // Furniture (world/room-furniture.js, the list the renderer draws it from):
  // one box per piece at its drawn height. Styled rooms' cover keeps
  // `interiorCover`; low pieces (not `cover`) stop bodies and robots but not
  // rounds (playerOnly, as a window's sill). (dw-furniture)
  for(const b of map.buildings)for(const p of solidFurniture(b)) {
    const point=buildingPoint(b,p.x,p.z),c=Math.abs(Math.cos(b.angle||0)),s=Math.abs(Math.sin(b.angle||0));
    colliders.push({x:point.x,z:point.z,w:p.w*c+p.d*s,d:p.w*s+p.d*c,angle:b.angle||0,localW:p.w,localD:p.d,height:p.h,
      ...(p.styled?{interiorCover:true}:{furniture:p.kind}),...(p.cover?{}:{playerOnly:true}),buildingId:b.id});
  }
  for (const p of mapProps(map)) {
    // A box list scales with the prop that owns it, exactly as w/d already do;
    // otherwise a scaled prop is drawn at one size and collides at another.
    const size = p.scale || 1;
    const pieces = p.collisionBoxes ? p.collisionBoxes.map(([bx,bz,bw,bd,bh]) => [bx*size,bz*size,bw*size,bd*size,bh]) : [[0,0,p.w,p.d]];
    const c=Math.cos(p.angle||0),s=Math.sin(p.angle||0);
    // (s2-props: a box's fifth number is its height; `screen` props stop sight only.
    // s2-graveyard: per-type cover heights, `coverHeight`.)
    for (const [x,z,w,d,h] of pieces) colliders.push({ x: p.x+x*c+z*s, z:p.z-x*s+z*c, w:Math.abs(w*c)+Math.abs(d*s),d:Math.abs(w*s)+Math.abs(d*c),angle:p.angle||0,localW:w,localD:d,height: p.walkOver ? .5 : h ?? p.coverHeight ?? 1.2, blocksSight: !!p.blocksSight, walkOver: !!p.walkOver, propId: p.id, destructible: p.health !== null, ...(p.screen && { playerOnly: true }) });
  }
  // s2-trees: trunks, stumps and fallen logs (world/tree-kinds.js).
  colliders.push(...treeColliders(map.trees));
  for (const f of map.fences) colliders.push({ x: f.x, z: f.z, w: f.axis === 'x' ? f.length : .24, d: f.axis === 'z' ? f.length : .24, height: 1.1 });
  // Hills: what stands in the stream and is solid (Hollow Wick's mill wheel
  // and sluice): the one exception to wading anywhere.
  for (const box of map.crossings?.solid || []) colliders.push({ x: box.x, z: box.z, w: box.w, d: box.d, angle: 0, localW: box.w, localD: box.d, height: box.height, streamWorks: true });
  // Hills: every authored steep edge is a retaining wall bodies cannot cross
  // (playerOnly: shots, sight and blasts go by the ground, not by the box).
  if (map.terrain) for (const edge of groundFor(map).edges) colliders.push(edgeCollider(edge));
  return colliders;
}
