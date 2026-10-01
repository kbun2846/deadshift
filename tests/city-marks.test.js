// Lumen stage 5: the ground marks (world/city-marks.js), painted into the
// city ground's one texture by world/lumen-ground.js groundShapes: skid marks
// behind every crash and stopped car (none behind a parked one), oil, cracks,
// repairs, tyre marks into the garage and the parking structure, worn paths,
// the lanes' drip lines, and the drag mark type for the dead's scenes. Pure
// data: checked for shape, place, colour and cost.
import test from 'node:test';
import assert from 'node:assert/strict';
import { cityMarkShapes, vehicleStops, skidShapes, oilPatches, dragMarkShapes, openGround, pointInPoly, FOOTPRINT_POLYS, CITY_MARKS, ribbon } from '../src/world/city-marks.js';
import { groundShapes } from '../src/world/lumen-ground.js';
import { LUMEN_PROPS, DENSITY_ZONES } from '../src/maps/lumen-cover.js';
import { OUTLINE } from '../src/maps/lumen-layout.js';
import { deltaE2000, lab, hexRgb } from '../src/render/look-contrast.js';

const TEAM = ['#ffb020', '#2ee6ff', '#b77bff'];
const shapes = cityMarkShapes();
const byMark = shapes.reduce((m, s) => { (m[s.mark] ||= []).push(s); return m; }, {});
const centroid = poly => poly.reduce((a, [x, z]) => [a[0] + x / poly.length, a[1] + z / poly.length], [0, 0]);

test('marks: well formed polygons in a colour and a strength, no blur (a blurred shape repaints the whole canvas), the same every load', () => {
  assert.ok(shapes.length > 800 && shapes.length < 3500, `${shapes.length} shapes (the paint's cost)`);
  for (const s of shapes) {
    assert.ok(Array.isArray(s.poly) && s.poly.length >= 3 && s.poly.every(p => Number.isFinite(p[0]) && Number.isFinite(p[1])), 'poly');
    assert.match(s.colour, /^#[0-9a-f]{6}$/i);
    assert.ok(s.alpha > 0 && s.alpha <= 1, `alpha ${s.alpha}`);
    assert.equal(s.blur, undefined);
  }
  assert.deepEqual(cityMarkShapes(), shapes);
  for (const kind of ['skid', 'oil', 'crack', 'patch', 'tyre', 'worn', 'drip']) assert.ok(byMark[kind]?.length, `${kind} marks`);
});

test('marks: painted into the ground (groundShapes carries them, before the light pools)', () => {
  const g = groundShapes([{ x: 0, z: 0, rx: 3, rz: 3, tone: 'white', strength: .5 }]);
  const marks = g.filter(s => s.mark);
  assert.equal(marks.length, shapes.length);
  assert.ok(g.findIndex(s => s.glow) > g.findLastIndex(s => s.mark), 'the light pools lie over the marks');
});

test('skids: every crash, taxi and stopped car has tracks behind it, darkest at the car; parked cars none', () => {
  const stops = vehicleStops();
  const parked = DENSITY_ZONES.filter(z => z.id === 'garage-frontage' || z.id === 'charging-lot').map(z => z.poly);
  const vehicles = LUMEN_PROPS.filter(p => /^city(Compact|Sedan|Suv|Taxi|Sports|Van|Truck|Wreck)$/.test(p.type));
  assert.equal(stops.filter(s => !s.id.startsWith('pileup')).length, vehicles.filter(p => !parked.some(poly => pointInPoly(poly, p.x, p.z))).length);
  assert.equal(stops.filter(s => s.id.startsWith('pileup')).length, 3, 'the pileup\'s three cars');
  assert.ok(stops.some(s => s.kind === 'crash' && s.x === -22.9 && s.z === 8.15), 'the car in the shopfront crashed');
  assert.ok(stops.filter(s => s.kind === 'taxi').length >= 2);
  const skids = skidShapes(stops);
  for (const s of stops) {
    const mine = skids.filter(k => k.of === s.id);
    assert.ok(mine.length >= (s.kind === 'crash' ? 8 : 4), `${s.id}: ${mine.length} skid pieces`);
    // the first piece of each track (at the car) is the darkest
    assert.ok(mine[0].alpha >= mine.at(-1).alpha, `${s.id} fades out`);
  }
  // a crash's tracks are long, a stopped car's short
  const length = id => { const pts = skids.filter(k => k.of === id).flatMap(k => k.poly); let far = 0; const s = stops.find(v => v.id === id); for (const [x, z] of pts) far = Math.max(far, Math.hypot(x - s.x, z - s.z)); return far; };
  const crash = stops.find(s => s.kind === 'crash' && s.id.startsWith('cityWreck')), stopped = stops.find(s => s.kind === 'stopped');
  assert.ok(length(crash.id) > length(stopped.id) + 3, `crash ${length(crash.id).toFixed(1)} m, stopped ${length(stopped.id).toFixed(1)} m`);
});

test('marks lie on open ground: inside the outline and off every building', () => {
  const bad = [];
  for (const s of shapes) {
    const [x, z] = centroid(s.poly);
    if (!pointInPoly(OUTLINE, x, z)) bad.push(`${s.mark} at ${x.toFixed(1)},${z.toFixed(1)} outside`);
    else if (FOOTPRINT_POLYS.some(f => pointInPoly(f, x, z)) && !openGround(x, z, 0, -.25)) bad.push(`${s.mark} at ${x.toFixed(1)},${z.toFixed(1)} in a building`);
  }
  assert.deepEqual(bad.slice(0, 8), [], `${bad.length} misplaced`);
});

test('oil, tyres and wear where the story puts them: under the wrecks and the pileup, the garage and the charging lot', () => {
  const oil = oilPatches();
  assert.ok(oil.length >= 15, `${oil.length} oil patches`);
  assert.ok(oil.some(o => Math.hypot(o.x - 27.2, o.z + 4) < 5), 'oil at the pileup');
  assert.ok(oil.filter(o => o.x < -34 && o.z > 5 && o.z < 30).length >= 4, 'oil round the garage');
  assert.ok(oil.filter(o => o.x > -24 && o.x < -2 && o.z > 36).length >= 3, 'oil on the charging lot');
  assert.ok(byMark.tyre.length >= 12, `${byMark.tyre.length} tyre tracks`);
  assert.ok(byMark.tyre.some(s => { const [x, z] = centroid(s.poly); return x < -50 && z > 5 && z < 11; }), 'tyre marks into the EV garage\'s bay');
  assert.ok(byMark.crack.length >= 300 && byMark.patch.length >= 100, `${byMark.crack.length} crack pieces, ${byMark.patch.length} repair pieces`);
});

test('colours: dark, low-chroma, 15+ CIEDE2000 from Amber, Cyan and Violet; the drag mark is old dried blood (dark, never a fresh red)', () => {
  const colours = new Set([...shapes.map(s => s.colour), ...dragMarkShapes([[0, 0], [1, 0], [2, .3]]).map(s => s.colour)]);
  for (const c of colours) for (const t of TEAM) assert.ok(deltaE2000(lab(hexRgb(c)), lab(hexRgb(t))) >= 15, `${c} near ${t}`);
  for (const c of colours) { const [L] = lab(hexRgb(c)); assert.ok(L < 40, `${c} is a mark, not paint (L ${L.toFixed(0)})`); }
  const [L, a] = lab(hexRgb(CITY_MARKS.drag.colour));
  assert.ok(L < 20 && a > 5 && a < 25, `drag ${CITY_MARKS.drag.colour}: L ${L.toFixed(1)} a ${a.toFixed(1)}`);
});

test('the drag mark type: a band along its points that thins out, with finger smears; nothing for too few points; drags passed in are painted', () => {
  const d = dragMarkShapes([[0, 0], [.8, .1], [1.6, .3], [2.4, .2]], 3);
  assert.ok(d.length >= 4 && d.every(s => s.mark === 'drag' && s.poly.length >= 3));
  assert.deepEqual(dragMarkShapes([[0, 0]]), []);
  const withDrag = cityMarkShapes({ drags: [{ points: [[-13, -23.5], [-12, -23.4], [-11, -23.6]] }] });
  assert.equal(withDrag.length, shapes.length + dragMarkShapes([[-13, -23.5], [-12, -23.4], [-11, -23.6]], 1).length);
  assert.equal(ribbon([[0, 0]], .2), null);
});
