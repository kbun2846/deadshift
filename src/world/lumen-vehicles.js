// Lumen stage 4: real models for the city's vehicles (design 7). Each type
// registers with world/lumen-props.js registerLumenModel(type, make); the
// footprints and collision boxes there are the gameplay truth and every
// model fills its box and keeps inside it (tests/lumen-vehicles.test.js
// measures each placed car's bounds against its boxes + 0.1 m). The two
// exceptions are flat: an open door swung out on a side clear of every
// sidewalk (the collision box does not hold it: walk-over), and the glass
// and debris fanned across the sidewalk at the shopfront car.
//
// All futuristic: smooth-angular wedge bodies (lofted hulls, not boxes),
// light-strip head and tail bars (the lit panels are the signs system's,
// maps/lumen-vehicle-lights.js; the housings here), flush wheels, panel
// gaps, dark glass, mirrors, wipers, roof and hood detail for the camera
// above. Three or four colours a car from the muted vehicle palette; per
// seed (the car's position) a dent or two as offset panels, a cracked
// windscreen, a flat tyre, a missing or an open door, a different roof: no
// two the same. Everything is plain view.box / view.mesh parts in the
// prop's group, so the static batcher merges a street of them per cell.
//
// The bus is a building (maps/lumen-buildings-east.js): world/lumen-bus.js
// dresses its outside (makeLumenBus below).
import * as THREE from 'three';
import { registerLumenModel } from './lumen-props.js';
import { litBox } from './lumen-glow.js';
import { Parts, VEHICLE_COLOURS as V, shade, pick } from './lumen-vehicle-parts.js';
import { CAR_RIG, PILEUP, VEHICLE_LIGHTS, VEHICLE_SCENES, stateOf, stream, hash01 } from '../maps/lumen-vehicle-lights.js';
import { ROADS, FOOTPRINTS } from '../maps/lumen-layout.js';
import { roadGeometry, insideOutline } from './lumen-ground.js';
export { makeLumenBus, makeLumenCable, makeLumenStreetPieces } from './lumen-bus.js';

// Body, trim, [stripe] by type: three or four colours a car.
const LEAN = new Set(['potato', 'performance']);
const PALETTES = Object.freeze({
  cityCompact: [[V.pearl, V.graphite], [V.midnight, V.pearl], [V.petrol, V.graphite], [V.dust, V.graphite], [V.slate, V.pearl]],
  citySedan: [[V.graphite, V.steel], [V.pearl, V.graphite], [V.deepRed, V.graphite], [V.midnight, V.steel], [V.slate, V.graphite], [V.wine, V.graphite]],
  citySuv: [[V.graphite, V.slate], [V.olive, V.graphite], [V.slate, V.graphite], [V.wine, V.graphite], [V.midnight, V.graphite]],
  cityTaxi: [[V.taxi, V.black]],
  citySports: [[V.deepRed, V.black], [V.pearl, V.black], [V.midnight, V.steel], [V.steel, V.black], [V.graphite, V.deepRed]],
  cityVan: [[V.pearl, V.graphite, V.deepRed], [V.slate, V.pearl, V.petrol], [V.dust, V.graphite, V.midnight], [V.petrol, V.pearl, V.dust], [V.pearl, V.graphite, V.petrol]],
  cityTruck: [[V.pearl, V.graphite, V.midnight], [V.steel, V.graphite, V.deepRed], [V.dust, V.graphite, V.petrol], [V.olive, V.pearl, V.dust]],
  bike: [[V.deepRed, V.graphite], [V.pearl, V.graphite], [V.midnight, V.graphite], [V.dust, V.graphite]],
});
export const VEHICLE_PALETTES = PALETTES;

// --- Doors ----------------------------------------------------------------------
// Where an open door would swing (or null): the side is chosen so the door
// and its tip are on no sidewalk, in no building and inside the map.
const WALKS = ROADS.flatMap(r => roadGeometry(r).walks);
const inPoly = (poly, x, z) => { let inside = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) if ((poly[i][1] > z) !== (poly[j][1] > z) && x < (poly[j][0] - poly[i][0]) * (z - poly[i][1]) / (poly[j][1] - poly[i][1]) + poly[i][0]) inside = !inside; return inside; };
const inFootprint = (x, z, m) => FOOTPRINTS.some(f => (f.parts || []).some(([x0, x1, z0, z1]) => x > x0 - m && x < x1 + m && z > z0 - m && z < z1 + m) || (f.quads || []).some(q => {
  const xs = q.map(p => p[0]), zs = q.map(p => p[1]); return x > Math.min(...xs) - m && x < Math.max(...xs) + m && z > Math.min(...zs) - m && z < Math.max(...zs) + m;
}));
const DOOR = Object.freeze({
  cityCompact: { len: .95, sill: .24 }, citySedan: { len: 1.05, sill: .25 }, citySuv: { len: 1.05, sill: .35 }, cityTaxi: { len: 1.05, sill: .25 },
  citySports: { len: 1.15, sill: .2 }, cityVan: { len: .95, sill: .42 }, cityTruck: { len: 1.05, sill: .6 },
});
export function doorPlan(st) {
  const R = CAR_RIG[st.type], D = DOOR[st.type];
  if (!st.doors || !R || !D) return null;
  const hw = R.W / 2 - .1, hinge = (st.type === 'cityVan' ? 1.95 : st.type === 'cityTruck' ? 3.35 : R.cabin[1] - .12);
  const phi = .5 + .35 * hash01('phi', st.seed);
  const c = Math.cos(st.angle), s = Math.sin(st.angle);
  const free = (lx, lz) => { const wx = st.x + lx * c + lz * s, wz = st.z - lx * s + lz * c; return insideOutline(wx, wz, .4) && !WALKS.some(w => inPoly(w, wx, wz)) && !inFootprint(wx, wz, .3); };
  const order = hash01('side', st.seed) < .5 ? [1, -1] : [-1, 1];
  for (const side of order) {
    const at = t => [hinge - D.len * t * Math.cos(phi), side * (hw + D.len * t * Math.sin(phi))];
    if ([.4, .7, 1].every(t => free(...at(t)))) return { side, hinge, len: D.len, sill: D.sill, phi, hw };
  }
  return null;
}

// --- The intact cars --------------------------------------------------------------
function defaultState(p, type) {
  return { type, x: p.x, z: p.z, angle: p.angle || 0, seed: hash01('lumen-car', Math.round(p.x * 100) + ',' + Math.round(p.z * 100)), head: false, hazard: false, alarm: false, tail: 0, doors: false, scene: null };
}

function buildCar(view, g, p, type) {
  const st = stateOf(p) || defaultState(p, type), rnd = stream(st.seed), R = CAR_RIG[type];
  const P = new Parts(view, g);
  const { L, W, clear, belt, noseH, tailH } = R, x0 = -L / 2, x1 = L / 2, hw = W / 2 - .1, H = type === 'cityTaxi' ? R.H - .13 : R.H; // (the taxi's roof light stands on top)
  const [cr, cf] = R.cabin, [rr, rf] = R.roof, inset = R.inset;
  const pal = pick(PALETTES[type], rnd()), body = pal[0], trim = pal[1];
  g.userData.bodyColour = body;
  const lean = LEAN.has(view.initialQuality); // (Potato and Performance keep to the big shapes: no door lines, wipers, mirror trim, sills)
  const sports = type === 'citySports', suv = type === 'citySuv', taxi = type === 'cityTaxi', compact = type === 'cityCompact';
  const roofColour = taxi ? V.black : rnd() < .32 ? trim : body;
  const pillar = rnd() < .5 ? V.black : body;
  const panelTone = rnd() < .5 ? 1.13 : .86;
  const wrecked = st.scene === 'shopfront';
  // The seeded damage. (Drawn in a fixed order so one car's dents never move another's.)
  const dents = [];
  const dentRolls = [rnd(), rnd(), rnd(), rnd()];
  if (dentRolls[0] < .38) dents.push(pick(['hood', 'trunk', 'door', 'fender'], dentRolls[1]));
  if (dentRolls[2] < .18) dents.push('door');
  const cracked = wrecked || rnd() < .3, flat = rnd() < .18 ? Math.floor(rnd() * 4) : -1, missing = rnd() < .1 ? (rnd() < .5 ? 1 : -1) : 0;
  const door = doorPlan(st), missingSide = door ? 0 : missing;
  const hoodY = x => belt + (noseH - belt) * (x - cf) / ((x1 - .1) - cf);
  const deckY = x => tailH + (belt - tailH) * (x - x0) / (cf - x0);

  // Under-tray and the sills.
  P.slab(x0 + .3, x1 - .3, .07, clear + .1, -(hw - .1), hw - .1, V.trim);
  if (!lean) {
    P.slab(x0 + .5, x1 - .5, clear - .02, clear + .14, hw - .02, hw + .02, trim);
    P.slab(x0 + .5, x1 - .5, clear - .02, clear + .14, -hw - .02, -hw + .02, trim);
  }

  // Lower body, hood, cabin, roof: the wedge.
  P.loft({ x0, z: hw - .1, x1: cf, zf: hw, y: clear }, { x0: x0 + .12, z: hw - .17, x1: cf, zf: hw - .05, y: [tailH, belt] }, body);
  P.loft({ x0: cf, z: hw, x1, zf: hw - .14, y: clear }, { x0: cf, z: hw - .07, x1: x1 - .1, zf: hw - .27, y: [belt, noseH] }, body);
  P.loft({ x0: cr, x1: cf, z: hw - .03, y: belt }, { x0: rr, x1: rf, z: hw - inset, y: H - .06 }, V.glass);
  P.loft({ x0: rr - .03, x1: rf + .03, z: hw - inset + .02, y: H - .075 }, { x0: rr, x1: rf, z: hw - inset - .04, y: H }, roofColour);
  // Pillars.
  for (const s of [-1, 1]) {
    const edge = (x, roofX) => [[x, belt, s * (hw - .03)], [roofX, H - .07, s * (hw - inset)]];
    P.strut(...edge(cf - .02, rf), .075, pillar);
    P.strut(...edge(cr + .03, rr), .085, pillar);
    if (!sports && !lean) {
      const t = .46, xb = cr + (cf - cr) * t, xr = rr + (rf - rr) * t;
      P.strut(...edge(xb, xr), .06, pillar);
    }
  }
  // Panel tones from above: the hood, the deck and the roof each their own.
  const hood = (xa, xb, half, thick, col) => P.loft({ x0: xa, x1: xb, z: half, y: [hoodY(xa) - .01, hoodY(xb) - .01] }, { x0: xa + .04, x1: xb - .04, z: half - .05, y: [hoodY(xa) + thick, hoodY(xb) + thick] }, col);
  if (!dents.includes('hood')) hood(cf + .18, x1 - .3, hw * .62, .03, shade(body, panelTone));
  P.loft({ x0: x0 + .22, x1: cr - .12, z: hw * .68, y: [deckY(x0 + .22) - .01, deckY(cr - .12) - .01] }, { x0: x0 + .26, x1: cr - .16, z: hw * .68 - .05, y: [deckY(x0 + .26) + .03, deckY(cr - .16) + .03] }, shade(body, panelTone));
  if (compact) P.slab(rr + .1, rf - .1, H - .02, H + .005, -.28, .28, shade(roofColour, 1.18)); // (a lighter roof panel)
  // The door lines and handles, a gap between the panels: thin dark boxes flush on the sides.
  const doorFront = cf - .12, doorRear = cr + (cf - cr) * .48, doorEnd = cr + .06;
  for (const s of lean ? [] : [-1, 1]) {
    const z = s * (hw + .003);
    for (const x of [doorFront, doorRear, doorEnd]) P.slab(x - .011, x + .011, clear + .16, belt - .01, z - .008, z + .008, V.trim);
    P.slab(doorEnd, doorFront, clear + .15, clear + .17, z - .008, z + .008, V.trim);
    P.slab(doorEnd, doorFront, belt - .03, belt - .012, z - .008, z + .008, V.trim);
    for (const x of [doorFront - .25, doorRear - .25]) P.slab(x - .08, x + .08, belt - .13, belt - .1, z - .012, z + .012, shade(trim, 1.7));
  }
  // The wheels, their arches, one maybe flat.
  const ww = suv ? .32 : sports ? .34 : .28, wz = W / 2 - .02 - ww / 2;
  R.axles.forEach((ax, ai) => [-1, 1].forEach((s, si) => {
    const r = R.wheelR, idx = ai * 2 + si, flatWheel = idx === flat, rr2 = flatWheel ? r * .8 : r;
    P.slab(ax - r - .06, ax + r + .06, clear - .02, Math.min(belt - .05, r * 2 + .06), s > 0 ? hw - .01 : -hw - .012, s > 0 ? hw + .012 : -hw + .01, V.trim);
    P.wheel(ax, rr2, s * wz, rr2, flatWheel ? ww + .04 : ww, s, { hub: flatWheel ? shade(V.hub, .7) : V.hub });
  }));
  // The nose and tail: bumpers, and the lamp housings (the lit strips are the signs system's).
  const noseX = y => x1 - .1 * (y - clear) / (noseH - clear), tailX = y => x0 + .12 * (y - clear) / (tailH - clear);
  P.slab(x1 - .13, x1, clear + .02, clear + .17, -(hw - .04), hw - .04, trim);
  P.slab(x0, x0 + .13, clear + .02, clear + .17, -(hw - .04), hw - .04, trim);
  const hb = R.head, tb = R.tail;
  P.box(noseX(hb.y) - .02, hb.y, 0, .07, .14, hb.half * 2 + .08, V.trim);
  P.box(tailX(tb.y) + .02, tb.y, 0, .07, .12, tb.half * 2 + .08, V.trim);
  if (!st.head && !wrecked && !lean) P.box(noseX(hb.y) + .012, hb.y, 0, .03, .07, hb.half * 2, V.glassSheen); // (a dead lamp: a paler glass strip)
  if (!st.tail && !lean) P.box(tailX(tb.y) - .012, tb.y, 0, .03, .06, tb.half * 2, shade('#7a1f27', .6));
  // Mirrors and wipers.
  for (const s of [-1, 1]) {
    P.box(cf - .1, belt + .1, s * (hw + .05), .16, .09, .1, body);
    if (!lean) P.box(cf - .1, belt + .06, s * (hw - .03), .06, .05, .1, V.trim);
  }
  for (const s of lean ? [] : [-1, 1]) P.strut([cf - .02, belt + .015, s * .48], [cf - .06 - (compact ? .3 : .38), belt + .04, s * .12 - s * .08], .018, V.trim);
  // The windscreen's dash glow when the engine runs (a lit strip on the glass's lower edge).
  if (st.head) litBox(view, g, cf - .12, belt + .05, 0, .04, .03, (hw - inset) * 1.6, '#8aa2e8', .55);

  // --- Per type ---------------------------------------------------------------
  if (taxi) {
    // The roof light: a lit lemon box with a dark chevron pictogram; a black band and a checker of squares on the doors.
    const rx = (rr + rf) / 2 - .05;
    P.box(rx, H - .01 + .0, 0, .36, .06, .62, V.trim);
    litBox(view, g, rx, H + .045, 0, .3, .07, .56, '#fff1d6', 1.5);
    P.strut([rx - .09, H + .086, -.2], [rx + .09, H + .086, 0], .06, V.black);
    P.strut([rx + .09, H + .086, 0], [rx - .09, H + .086, .2], .06, V.black);
    for (const s of lean ? [] : [-1, 1]) for (let i = 0; i < 4; i++) P.slab(cr + .2 + i * .25, cr + .2 + i * .25 + .125, clear + .24 + (i % 2) * .09, clear + .33 + (i % 2) * .09, s * (hw + .004) - .006, s * (hw + .004) + .006, V.black);
    P.slab(cr, cf, clear + .34, clear + .37, hw - .005, hw + .014, V.black); P.slab(cr, cf, clear + .34, clear + .37, -hw - .014, -hw + .005, V.black);
  }
  if (suv) {
    // Armour: thick plates on the flanks and doors, slit glass, a bull bar, a roof lightbar and rails.
    for (const s of [-1, 1]) {
      const z0 = s > 0 ? hw - .01 : -hw - .04, z1 = s > 0 ? hw + .04 : -hw + .01;
      P.slab(cr + .1, cf - .1, clear + .16, belt - .1, z0, z1, shade(body, .8));
      P.slab(x0 + .1, cr + .05, clear + .2, belt + .04, z0, z1, shade(body, .74));
      for (const x of [cr + .3, (cr + cf) / 2, cf - .3]) P.slab(x - .02, x + .02, belt - .2, belt - .16, s * (hw + .045) - .012, s * (hw + .045) + .012, shade(V.steel, .8));
      P.strut([rr + .1, H + .015, s * (hw - inset - .08)], [rf - .1, H + .015, s * (hw - inset - .08)], .035, V.trim);
    }
    P.slab(x1 - .05, x1 + 0, noseH - .35, noseH - .04, -(hw - .1), hw - .1, V.trim);
    P.slab(rf - .5, rf - .15, H - .01, H + .05, -.7, .7, V.trim);
    P.slab(x0, x0 + .05, clear + .3, belt - .1, -.45, .45, shade(body, .65));
  }
  if (sports) {
    // Racing wing, hood scoop and a stripe pair.
    P.slab(x0 + .2, x0 + .62, tailH + .02, tailH + .5, -hw + .1, -hw + .16, V.trim); P.slab(x0 + .2, x0 + .62, tailH + .02, tailH + .5, hw - .16, hw - .1, V.trim);
    P.slab(x0 + .1, x0 + .68, tailH + .5, tailH + .56, -hw + .04, hw - .04, roofColour);
    P.loft({ x0: cf + .55, x1: cf + 1.0, z: .22, y: [hoodY(cf + .55), hoodY(cf + 1.0)] }, { x0: cf + .6, x1: cf + .95, z: .15, y: [hoodY(cf + .6) + .07, hoodY(cf + .95) + .05] }, V.trim);
    for (const s of [-1, 1]) P.strut([x0 + .3, deckY(x0 + .3) + .035, s * .26], [cr - .2, deckY(cr - .2) + .035, s * .26], .07, trim);
  }
  if (!suv && !taxi && !sports && rnd() < .5) P.loft({ x0: rr + .2, x1: rf - .25, z: .36, y: H - .002 }, { x0: rr + .22, x1: rf - .27, z: .32, y: H + .012 }, V.glassSheen); // (a sunroof)
  if (rnd() < .5 && !lean) P.box(rr + .18, H + .05, 0, .16, .09, .03, V.trim); // (the antenna fin)
  if (compact) P.slab(x0, x0 + .05, tailH + .15, belt + .35, -.5, .5, V.trim); // (the hatch's spoiler lip)

  // --- Damage -------------------------------------------------------------------
  for (const site of dents) {
    if (site === 'hood') {
      P.hull([[cf + .3, hoodY(cf + .3) - .02, -hw * .7], [x1 - .35, hoodY(x1 - .35) - .02, -hw * .55], [x1 - .35, hoodY(x1 - .35) - .02, hw * .7], [cf + .3, hoodY(cf + .3) - .02, hw * .6],
        [cf + .34, hoodY(cf + .34) + .05, -hw * .62], [x1 - .4, hoodY(x1 - .4) + .01, -hw * .48], [x1 - .4, hoodY(x1 - .4) + .07, hw * .58], [cf + .34, hoodY(cf + .34) + .03, hw * .52]], shade(body, .78));
    } else if (site === 'trunk') {
      P.hull([[x0 + .25, deckY(x0 + .25), -hw * .7], [cr - .2, deckY(cr - .2), -hw * .7], [cr - .2, deckY(cr - .2), hw * .5], [x0 + .25, deckY(x0 + .25), hw * .6],
        [x0 + .3, deckY(x0 + .3) + .04, -hw * .6], [cr - .28, deckY(cr - .28) + .01, -hw * .6], [cr - .28, deckY(cr - .28) + .06, hw * .42], [x0 + .3, deckY(x0 + .3) + .02, hw * .5]], shade(body, .8));
    } else {
      const s = hash01('dent', st.seed) < .5 ? 1 : -1, x = site === 'fender' ? cf + .5 : (doorFront + doorEnd) / 2;
      const m = P.slab(x - .38, x + .38, clear + .24, belt - .08, 0, .05, shade(body, .8));
      m.position.z = s * (hw + .012); m.rotation.x = s * .07; m.rotation.y = .04;
      P.slab(x - .3, x + .3, clear + .34, clear + .38, 0, .03, shade(body, .6)).position.z = s * (hw + .038);
    }
  }
  if (cracked) {
    // A star of pale lines on the windscreen from a point of impact.
    const u0 = .25 + rnd() * .5, v0 = .3 + rnd() * .4, zc = (hw - inset * v0 - .03), y = v => belt + (H - .06 - belt) * v, xw = v => cf + (rf - cf) * v;
    const at = (u, v) => [xw(v) + .012, y(v) + .006, (u * 2 - 1) * (hw - .03 - (inset - .03) * v)];
    void zc;
    const centre = at(u0, v0);
    for (let k = 0; k < 5; k++) {
      const a = k * 1.25 + rnd() * .7, len = .22 + rnd() * .3, u1 = Math.min(.96, Math.max(.04, u0 + Math.cos(a) * len * .8)), v1 = Math.min(.96, Math.max(.06, v0 + Math.sin(a) * len * .8));
      P.strut(centre, at(u1, v1), .014, V.crack);
    }
  }
  // An open door: swung out; the recess and the seat behind it. A missing door: the recess and the seat, no panel.
  const openSide = door ? door.side : missingSide;
  if (openSide) {
    const s = openSide, hinge = door ? door.hinge : doorFront, len = door ? door.len : DOOR[type].len, sill = door ? door.sill : DOOR[type].sill;
    P.slab(hinge - len, hinge, sill, belt, 0, .014, V.interior).position.z = s * (hw + .006);
    P.slab(hinge - len + .1, hinge - .1, sill + .1, sill + .3, 0, .09, V.seat).position.z = s * (hw + .045);
    P.slab(hinge - len + .1, hinge - len + .3, sill + .1, belt - .05, 0, .09, V.seat).position.z = s * (hw + .045);
    if (door) {
      const pivot = new THREE.Group(); pivot.position.set(hinge, 0, s * hw); pivot.rotation.y = s * door.phi; pivot.userData.door = true; g.add(pivot);
      P.slab(-len, -.02, sill, belt, -.02, .045, body, pivot).position.z = s * .012;
      P.slab(-len + .06, -.08, belt, H - .12, 0, .035, V.glass, pivot).position.z = s * .012;
      P.slab(-len, -.02, H - .13, H - .1, 0, .04, pillar, pivot).position.z = s * .012;
      P.slab(-len + .1, -len + .3, belt - .16, belt - .12, 0, .03, shade(trim, 1.7), pivot).position.z = s * .036;
    }
  }
  // Per-scene work on top of the ordinary car.
  if (st.scene === 'shopfront') { smashNose(P, R, rnd, body, hoodY); fanDebris(P, R, g, body); }
  if (st.scene === 'ev') splitBattery(view, g, P, R, rnd);
  return st;
}

// The sedan nosed through the shop's glass: hood buckled up, a bumper hanging,
// a headlight gone, the windscreen starred. (The glass and debris fan lies on
// the sidewalk, built with the sidewalk pieces: fanDebris.)
function smashNose(P, R, rnd, body, hoodY) {
  const { x1, belt, noseH, cabin } = { x1: R.L / 2, ...R }, hw = R.W / 2 - .1, cf = cabin[1];
  P.hull([[cf + .4, hoodY(cf + .4), -hw * .8], [x1 - .3, hoodY(x1 - .3), -hw * .7], [x1 - .3, hoodY(x1 - .3), hw * .7], [cf + .4, hoodY(cf + .4), hw * .8],
    [cf + .55, belt + .22, -hw * .6], [x1 - .3, noseH + .3, -hw * .5], [x1 - .3, noseH + .38, hw * .55], [cf + .55, belt + .3, hw * .6]], shade(body, .7));
  const flap = P.slab(-.35, .35, 0, .04, 0, .55, shade(body, .55)); flap.position.set(x1 - .55, noseH + .32, -hw * .4); flap.rotation.x = -.5; flap.rotation.z = .15;
  const bumper = P.slab(-.5, .5, 0, .14, -.05, .05, V.trim); bumper.position.set(x1 - .5, .18, 0); bumper.rotation.y = .32; bumper.rotation.z = -.12;
  void rnd;
}

// The glass and rubble the car threw out of the shopfront: flat pieces (under
// 7 cm) fanned across the sidewalk either side of the nose, walk-over and
// outside the collision box (tagged debris: the bounds test leaves them out).
// A fixed hash, not the car's stream: they stand the same at any seed.
function fanDebris(P, R, g, body) {
  const d = new THREE.Group(); d.name = 'shopfront-debris'; d.userData.debris = true; g.add(d);
  const x1 = R.L / 2, hw = R.W / 2;
  const colours = [V.crack, shade(V.crack, .75), V.glassSheen, V.crack, V.glass, shade(V.crack, .6)];
  let n = 0;
  for (let i = 0; i < 26; i++) {
    const side = i % 2 ? 1 : -1, r = i / 26;
    const z = side * (hw * .55 + .25 + hash01('deb-z', i) * (1.5 + r * 1.5));
    const x = x1 + .05 - hash01('deb-x', i) * (.9 + r * 1.2);
    if (Math.abs(z) < hw * .8 && x < x1 - .1) continue;
    const w = .08 + hash01('deb-w', i) * .34, dep = .06 + hash01('deb-d', i) * .22, y = .008 + (n++ % 3) * .006;
    const shard = P.slab(-w / 2, w / 2, 0, .012 + hash01('deb-h', i) * .02, -dep / 2, dep / 2, colours[(i >> 1) % colours.length], d);
    shard.position.set(x, y, z); shard.rotation.y = hash01('deb-r', i) * Math.PI;
  }
  // Larger pieces: a sheared window-frame bar, a slab of the sill, the car's own trim.
  for (const [x, z, w, dep, a, c] of [[x1 - .45, hw + .9, .9, .05, .35, V.trim], [x1 - .3, -hw - 1.1, .7, .05, -.5, V.trim], [x1 - .95, hw + 1.6, .32, .24, .7, V.slate], [x1 - .6, -hw - .55, .28, .2, .2, V.rust], [x1 - .1, .1, .5, .08, .2, shade(body, .55)]]) {
    const piece = P.slab(-w / 2, w / 2, 0, .05, -dep / 2, dep / 2, c, d); piece.position.set(x, .012, z); piece.rotation.y = a;
  }
}

// The crackling EV: the pack under it split along both sills (a dark broken
// slab and a bright seam; the arcs themselves are effects/lumen-wrecks.js).
function splitBattery(view, g, P, R, rnd) {
  const hw = R.W / 2 - .1;
  for (const s of [-1, 1]) {
    const slab = P.slab(-1.25, 1.2, .1, .3, 0, .09, V.soot); slab.position.z = s * (hw - .03); slab.rotation.z = s * .05;
    litBox(view, g, -.05, .22, s * (hw + .02), 2.1, .035, .02, '#fff2b0', 2);
    for (const x of [-.9, .2, .95]) { const piece = P.slab(x - .12, x + .12, 0, .1, 0, .12, shade(V.slate, .7)); piece.position.set(x, .06, s * (hw + .06)); piece.rotation.y = (x + s) * .5; }
  }
  void rnd;
}

// --- Vans and trucks -----------------------------------------------------------
function buildVan(view, g, p, type) {
  const st = stateOf(p) || defaultState(p, type), rnd = stream(st.seed), R = CAR_RIG[type], P = new Parts(view, g);
  const truck = type === 'cityTruck';
  const lean = LEAN.has(view.initialQuality);
  const { L, W, H, clear, belt, noseH } = R, x0 = -L / 2, x1 = L / 2;
  const pal = pick(PALETTES[type], rnd()), body = pal[0], trim = pal[1], stripe = pal[2];
  const hw = W / 2 - .1, bx1 = truck ? 1.0 : .85, cabX = truck ? 1.1 : bx1;
  const wz = W / 2 - .02 - (truck ? .2 : .16), ww = truck ? .4 : .32;
  const cracked = rnd() < .35, flat = rnd() < .16 ? Math.floor(rnd() * 4) : -1;
  const door = doorPlan(st);
  // Chassis, the box, the cab.
  P.slab(x0 + .2, x1 - .1, clear - .1, clear + .25, -(hw - .25), hw - .25, V.trim);
  const boxBottom = truck ? .95 : .38, boxWidth = hw - (truck ? .05 : .03);
  P.loft({ x0: x0 + .0, x1: bx1, z: boxWidth, y: boxBottom }, { x0: x0 + .03, x1: bx1 - .02, z: boxWidth - .03, y: H }, body);
  // Ribs on the roof and the flanks, a dark skirt, the roll-up or hinged door at the back.
  const ribs = truck ? 6 : 4;
  for (let i = 0; i < ribs; i++) { const x = x0 + .4 + (bx1 - x0 - .8) * i / (ribs - 1); P.slab(x - .04, x + .04, H - .005, H + .02, -boxWidth + .12, boxWidth - .12, shade(body, .88)); }
  for (const s of [-1, 1]) {
    const z = s * (boxWidth + .004);
    for (let i = 0; i < ribs + 2; i++) { const x = x0 + .35 + (bx1 - x0 - .7) * i / (ribs + 1); P.slab(x - .025, x + .025, boxBottom + .3, H - .12, z - .01, z + .01, shade(body, .84)); }
    P.slab(x0 + .05, bx1 - .05, boxBottom, boxBottom + .22, z - .014, z + .014, trim);
    P.slab(x0 + .05, bx1 - .05, H - .1, H - .06, z - .01, z + .01, stripe);
    P.slab(x0 + .05, bx1 - .05, boxBottom + .5, boxBottom + .58, z - .01, z + .01, stripe);
  }
  if (truck) {
    // Roll-up door: horizontal slats at the rear; a latch bar.
    for (let i = 0; i < 6; i++) P.slab(x0 - .005, x0 + .04, boxBottom + .3 + i * .33, boxBottom + .3 + i * .33 + .24, -boxWidth + .18, boxWidth - .18, i % 2 ? shade(body, .74) : shade(body, .66));
    P.slab(x0 - .005, x0 + .05, boxBottom + .12, boxBottom + .2, -boxWidth + .08, boxWidth - .08, trim);
    P.slab(x0 - .005, x0 + .06, boxBottom + .95, boxBottom + 1.15, -.5, .5, V.trim);
  } else {
    P.slab(x0 - .005, x0 + .04, boxBottom + .3, H - .18, -.012 - .01, .012 - .01 + .02, V.trim); // (the seam between the rear doors)
    for (const s of [-1, 1]) P.slab(x0 - .005, x0 + .05, boxBottom + .75, boxBottom + .95, s * .5 - .08, s * .5 + .08, shade(trim, 1.6));
    // The sliding door's rectangle on the kerb-side flank and a parcel pictogram: a box with an arrow.
    for (const s of [-1, 1]) {
      const z = s * (boxWidth + .006);
      for (const [xa, xb, ya, yb] of [[-.4, -.37, boxBottom + .3, H - .3], [.6, .63, boxBottom + .3, H - .3], [-.4, .63, boxBottom + .3, boxBottom + .33], [-.4, .63, H - .33, H - .3]]) P.slab(xa, xb, ya, yb, z - .008, z + .008, V.trim);
      P.slab(-1.9, -1.2, boxBottom + 1.0, boxBottom + 1.5, z - .01, z + .01, stripe);
      P.slab(-1.78, -1.32, boxBottom + 1.08, boxBottom + 1.42, z - .014, z + .014, shade(V.pearl, .9));
      P.slab(-1.78, -1.32, boxBottom + 1.24, boxBottom + 1.27, z - .018, z + .018, stripe);
    }
    P.slab(-1.5, -.9, H - .01, H + .004, -.6, .6, V.trim); // (a roof vent; its top 4 mm over the roof's, not in its plane: they flickered)
  }
  // The cab.
  if (truck) {
    P.loft({ x0: cabX, x1, z: hw, y: clear + .05 }, { x0: cabX, x1: x1 - .05, z: hw - .03, y: belt }, body);
    P.loft({ x0: cabX, x1: x1 - .25, z: hw - .03, y: belt }, { x0: cabX, x1: x1 - .7, z: hw - .17, y: 2.55 }, V.glass);
    P.loft({ x0: cabX - .02, x1: x1 - .66, z: hw - .1, y: 2.5 }, { x0: cabX, x1: x1 - .72, z: hw - .17, y: 2.6 }, body);
    // Air deflector on the cab's roof: a wedge (it stands under the box's height).
    P.loft({ x0: cabX + .05, x1: cabX + 1.2, z: hw - .25, y: 2.58 }, { x0: cabX + .06, x1: cabX + .3, z: hw - .3, y: [3.0, 2.72] }, shade(body, .86));
  } else {
    P.loft({ x0: bx1, x1, z: hw + .0, y: clear + .05 }, { x0: bx1, x1: x1 - .1, z: hw - .06, y: [belt, noseH] }, body);
    P.loft({ x0: bx1, x1: 2.05, z: hw - .03, y: belt }, { x0: bx1, x1: 1.45, z: hw - .16, y: 1.98 }, V.glass);
    P.loft({ x0: bx1 - .02, x1: 1.47, z: hw - .1, y: 1.93 }, { x0: bx1, x1: 1.43, z: hw - .17, y: 1.99 }, body);
  }
  // Cab pillars, mirrors, wipers, door lines.
  const cabTopX = truck ? x1 - .7 : 1.45, cabBaseX = truck ? x1 - .25 : 2.05, cabTop = truck ? 2.55 : 1.98, cabBelt = belt;
  for (const s of [-1, 1]) {
    P.strut([cabBaseX - .03, cabBelt, s * (hw - .04)], [cabTopX, cabTop - .05, s * (hw - (truck ? .17 : .16))], .09, V.black);
    P.strut([cabX + .3, cabBelt, s * (hw - .04)], [cabX + .28, cabTop - .05, s * (hw - .17)], .08, V.black);
    P.box(cabBaseX - .25, cabBelt + .28, s * (hw + .09), .1, .34, .1, V.trim);
    const z = s * (hw + .003), dx = truck ? 3.35 : 1.95;
    if (!lean) for (const x of [dx, dx - (truck ? 1.05 : .95)]) P.slab(x - .011, x + .011, clear + .35, cabBelt - .02, z - .008, z + .008, V.trim);
    if (!lean) P.slab(dx - (truck ? 1.05 : .95), dx, clear + .34, clear + .36, z - .008, z + .008, V.trim);
    if (!lean) P.slab(dx - .3, dx - .12, cabBelt - .14, cabBelt - .11, z - .012, z + .012, shade(V.trim, 1.7));
    if (!lean) P.strut([cabBaseX - .02, cabBelt + .02, s * .55], [cabBaseX - .5, cabBelt + .05, s * .25], .02, V.trim);
  }
  // Wheels: two axles on a van; a front and a rear tandem on the truck.
  const axles = truck ? [R.axles[0], R.axles[1], R.axles[1] - 1.05] : R.axles;
  axles.forEach((ax, ai) => [-1, 1].forEach((s, si) => {
    const r = R.wheelR, idx = ai * 2 + si, f = idx === flat, r2 = f ? r * .82 : r;
    P.slab(ax - r - .06, ax + r + .06, clear - .12, Math.min(boxBottom + .3, r * 2 + .1), s > 0 ? hw - .12 : -hw - .008, s > 0 ? hw + .012 : -hw + .12, V.trim);
    P.wheel(ax, r2, s * wz, r2, f ? ww + .04 : ww, s, { hub: f ? shade(V.hub, .7) : V.hub });
  }));
  // Lamp housings.
  const hb = R.head, tb = R.tail;
  P.slab(x1 - .12, x1, clear + .05, clear + .3, -(hw - .05), hw - .05, trim);
  P.slab(x0, x0 + .1, clear + .15, clear + .35, -(hw - .1), hw - .1, trim);
  P.box(x1 - (truck ? .04 : .07), hb.y, 0, .08, .14, hb.half * 2 + .08, V.trim);
  P.box(x0 + .03, tb.y, 0, .07, .16, tb.half * 2 + .1, V.trim);
  if (!st.head) P.box(x1 - (truck ? .0 : .03), hb.y, 0, .03, .07, hb.half * 2, V.glassSheen);
  if (!st.tail) P.box(x0 - .003, tb.y, 0, .03, .07, tb.half * 2, shade('#7a1f27', .6));
  if (truck) for (let i = -2; i <= 2; i++) litBox(view, g, x1 - .78, 2.63, i * .3, .08, .05, .1, V.lemon, .55);
  if (cracked) {
    const at = (u, v) => [cabBaseX + (cabTopX - cabBaseX) * v + .012, cabBelt + (cabTop - cabBelt) * v, (u * 2 - 1) * (hw - .17)];
    const u0 = .3 + rnd() * .4, v0 = .3 + rnd() * .3, c = at(u0, v0);
    for (let k = 0; k < 4; k++) { const a = k * 1.5 + rnd(), len = .2 + rnd() * .3; P.strut(c, at(Math.min(.95, Math.max(.05, u0 + Math.cos(a) * len)), Math.min(.95, Math.max(.05, v0 + Math.sin(a) * len * .8))), .014, V.crack); }
  }
  if (st.head) litBox(view, g, cabBaseX - .1, cabBelt + .05, 0, .04, .03, (hw - .2) * 1.6, '#8aa2e8', .55);
  // Damage: a dented flank, an open door.
  if (rnd() < .5) { const s = rnd() < .5 ? 1 : -1, m = P.slab(-1.6, -.9, boxBottom + .35, boxBottom + 1.1, 0, .05, shade(body, .8)); m.position.z = s * (boxWidth + .012); m.rotation.x = s * .06; }
  if (door) {
    const s = door.side, hinge = door.hinge, len = door.len, sill = door.sill;
    P.slab(hinge - len, hinge, sill, belt, 0, .014, V.interior).position.z = s * (hw + .006);
    P.slab(hinge - len + .12, hinge - .1, sill + .12, sill + .35, 0, .1, V.seat).position.z = s * (hw + .05);
    const pivot = new THREE.Group(); pivot.position.set(hinge, 0, s * hw); pivot.rotation.y = s * door.phi; pivot.userData.door = true; g.add(pivot);
    P.slab(-len, -.02, sill, belt, -.02, .045, body, pivot).position.z = s * .012;
    P.slab(-len + .06, -.08, belt, truck ? 2.4 : 1.86, 0, .035, V.glass, pivot).position.z = s * .012;
  }
  return st;
}

// --- Wrecks -------------------------------------------------------------------------
// One crumpled car in a box (length Lc along +x = its nose, width Wc, top at
// most Hmax): the hood buckled up and torn, the roof caved and off-square,
// a wheel splayed, another gone, the trunk sprung, soot, a bumper on the
// ground; the smouldering one blacker, with glowing seams.
function buildWreckCar(view, parent, Lc, Wc, Hmax, rnd, { smoulder = false } = {}) {
  const P = new Parts(view, parent);
  const pal = pick(PALETTES.citySedan.concat(PALETTES.cityCompact), rnd()), body = shade(pal[0], smoulder ? .42 : .62), dark = shade(pal[0], .3), soot = V.soot;
  const hw = Wc / 2 - .05, x0 = -Lc / 2, x1 = Lc / 2, cf = Lc * .1, cr = -Lc * .22;
  const m = rnd() < .5 ? 1 : -1, splayFront = rnd() < .5; // (which side the flap, bumper and lost wheel are on)
  P.slab(x0 + .2, x1 - .2, .06, .28, -(hw - .1), hw - .1, soot);
  // The body, low and lopsided.
  P.hull([[x0, .2, -hw], [cf, .2, -hw], [cf, .2, hw], [x0, .2, hw], [x0 + .12, .6, -hw + .07], [cf, .56, -hw + .05], [cf, .5, hw - .05], [x0 + .12, .64, hw - .08]], body);
  // The hood, buckled up and folded toward the windscreen.
  P.hull([[cf, .2, -hw], [x1, .2, -hw + .04], [x1, .2, hw - .05], [cf, .2, hw],
    [cf + .05, .56, -hw + .06], [x1 - .3, .82, -hw + .2], [x1 - .3, .9, hw - .25], [cf + .05, .5, hw - .06]], smoulder ? shade(body, .7) : shade(body, .88));
  // The cabin, crushed and leaning.
  const top = Math.min(Hmax - .3, 1.02);
  P.hull([[cr - .5, .58, -hw + .04], [cf + .1, .52, -hw + .04], [cf + .1, .5, hw - .04], [cr - .5, .62, hw - .04],
    [cr - .25, top - .12, -hw + .3], [cf - .3, top - .28, -hw + .2], [cf - .35, top - .34, hw - .32], [cr - .3, top, hw - .22]], V.glass);
  const roof = P.slab(-.6, .5, 0, .06, -hw + .3, hw - .3, body); roof.position.set(cr + .2 - .2, top - .08, .02); roof.rotation.z = .1; roof.rotation.x = -.08;
  // A shattered pillar or two.
  for (const s of [-1, 1]) P.strut([cf + .05, .55, s * (hw - .05)], [cf - .35, top - .3, s * (hw - .3)], .09, dark);
  P.strut([cr - .48, .6, hw - .06], [cr - .3, top - .02, hw - .25], .09, dark);
  // The trunk sprung open at the back, the hood's torn flap up at the front.
  const trunk = P.slab(0, .75, 0, .04, -hw + .25, hw - .25, shade(body, .8)); trunk.position.set(x0 + .28, .66, 0); trunk.rotation.z = Math.PI / 2 - .6 + (rnd() - .5) * .3;
  const flap = P.slab(-.4, .4, 0, .04, 0, .6, shade(body, .95)); flap.position.set(x1 - .55, .8, -m * hw * .5); flap.rotation.x = -.7 + rnd() * .2; flap.rotation.z = .2;
  // The wheels: three, one splayed; the fourth's stub and its hub on the ground.
  const wr = .31, ww = .26, wz = Wc / 2 - ww / 2 - .01, front = Lc * .3, rear = -Lc * .3;
  P.wheel(front, wr, wz, wr, ww, 1);
  P.wheel(rear, wr, wz, wr, ww, 1);
  P.wheel(splayFront ? rear : front, wr, -wz, wr, ww, -1);
  const splayX = splayFront ? front : rear;
  const splay = P.wheel(splayX, wr + .07, -wz + .04, wr, ww, -1); splay.rotation.y = .28 * m; splay.rotation.z = .1;
  for (const s of [-1, 1]) { P.slab(front - .05, front + .05, .1, .2, s * (hw - .2) - .05, s * (hw - .2) + .05, soot); }
  const hubCap = P.slab(-.11, .11, 0, .05, -.11, .11, V.hub); hubCap.position.set(front + .5, .03, -m * (hw - .05)); hubCap.rotation.y = .6;
  // The bumper on the ground, torn plastic, soot on the hood and roof.
  const bumper = P.slab(-.5, .5, 0, .12, -.06, .06, dark); bumper.position.set(x1 - .6, .07, m * hw * .3); bumper.rotation.y = .5 * m;
  const sootPatch = P.slab(-.55, .55, 0, .012, -.45, .45, soot); sootPatch.position.set(cf + .8, smoulder ? .82 : .78, 0); sootPatch.rotation.z = -.35; sootPatch.rotation.y = .3;
  const roofSoot = P.slab(-.4, .4, 0, .012, -.3, .35, soot); roofSoot.position.set(cr - .05, top + .0, .05); roofSoot.rotation.z = .1; roofSoot.rotation.x = -.08;
  // Glass: a few pale shards along the cabin and star lines.
  for (let k = 0; k < 3; k++) P.strut([cf - .1 - k * .15, top - .3 - k * .05, -hw + .3], [cf - .3 - k * .2, top - .18, hw - .4], .012, V.crack);
  if (smoulder) {
    // Glowing seams through the crushed hood and cabin.
    litBox(view, parent, x1 - .9, .84, 0, .5, .03, .06, VEHICLE_LIGHTS.smoulder, 1.4);
    litBox(view, parent, x1 - .7, .8, -.28, .04, .03, .34, VEHICLE_LIGHTS.smoulder, 1.1);
    litBox(view, parent, cf + .1, .72, .2, .08, .03, .44, VEHICLE_LIGHTS.smoulder, 1.0);
  }
}

function buildWreck(view, g, p) {
  const st = stateOf(p) || defaultState(p, 'cityWreck'), rnd = stream(st.seed);
  buildWreckCar(view, g, 4.1, 1.8, 1.3, rnd);
}

function buildPileup(view, g, p) {
  const st = stateOf(p) || defaultState(p, 'cityPileup'), rnd = stream(st.seed);
  for (const car of PILEUP.cars) {
    const Lc = Math.max(car.w, car.d), Wc = Math.min(car.w, car.d), sub = new THREE.Group();
    sub.position.set(car.x, 0, car.z);
    // (local +x becomes the direction of the nose)
    sub.rotation.y = car.w >= car.d ? (car.nose > 0 ? 0 : Math.PI) : (car.nose > 0 ? -Math.PI / 2 : Math.PI / 2);
    g.add(sub);
    buildWreckCar(view, sub, Lc - .1, Wc - .06, 1.3, rnd, { smoulder: !!car.smoulders });
  }
}

// --- The motorbike, on its side --------------------------------------------------------
// A breakable prop (health 5): three colours only (body, dark, tyre), because
// the prop batcher merges a breakable's parts per colour.
function buildBike(view, g, p) {
  const st = stateOf(p) || defaultState(p, 'cityMotorbike'), rnd = stream(st.seed), P = new Parts(view, g);
  const pal = pick(PALETTES.bike, rnd()), body = pal[0], dark = V.graphite, tyre = V.tyre, s = rnd() < .5 ? 1 : -1;
  // Lying on its right side: the wheels are flat discs low on the ground; the bars and the peg stand up.
  P.disc(-.68, .09, s * .05, .3, .16, tyre); P.disc(.68, .09, s * .05, .3, .16, tyre);
  P.disc(-.68, .18, s * .05, .13, .05, dark); P.disc(.68, .18, s * .05, .13, .05, dark);
  P.slab(-.55, .5, .1, .3, -.16, .16, dark);   // the engine
  P.hull([[-.5, .12, -.2], [.25, .12, -.2], [.25, .12, .2], [-.5, .12, .2], [-.42, .5, -.14], [.2, .46, -.14], [.2, .46, .14], [-.42, .52, .14]], body); // the tank and fairing
  P.slab(-.72, -.3, .28, .38, -.13, .13, dark);  // the seat
  P.strut([.7, .1, s * .05], [.32, .46, s * .05], .05, dark);   // the fork
  P.strut([.34, .62, -.34], [.34, .68, .34], .045, dark);       // the bars, one end up
  P.slab(.28, .42, .34, .68, -.2 * s - .06, -.2 * s + .06, body); // the screen
  P.strut([-.2, .3, -.1 * s], [-.55, .66, -.1 * s], .04, dark);   // the peg / rear frame up
  P.slab(-.95, -.5, .2, .3, s * .1, s * .3, dark);               // the exhaust
  void st;
}

// --- Registration -----------------------------------------------------------------------
for (const type of ['cityCompact', 'citySedan', 'citySuv', 'cityTaxi', 'citySports']) registerLumenModel(type, (view, p, g) => buildCar(view, g, p, type));
for (const type of ['cityVan', 'cityTruck']) registerLumenModel(type, (view, p, g) => buildVan(view, g, p, type));
registerLumenModel('cityWreck', (view, p, g) => buildWreck(view, g, p));
registerLumenModel('cityPileup', (view, p, g) => buildPileup(view, g, p));
registerLumenModel('cityMotorbike', (view, p, g) => buildBike(view, g, p));
void VEHICLE_SCENES;
