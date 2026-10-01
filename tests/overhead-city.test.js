// Lumen stage 4: the overhead map of a night city (src/ui/overhead-city.js).
// overhead-map.js hands any map with a `city` block to it; the other maps'
// drawings are untouched (Deadwater's is hash-tested in overhead-hills.test.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { maps, buildingOpenings, mapProps } from '../src/maps.js';
import { overheadMapSVG } from '../src/ui/overhead-map.js';
import { OVERHEAD_CITY } from '../src/ui/overhead-city.js';
import { overheadFrame } from '../src/ui/overhead-hills.js';
import { playableOutline } from '../src/playable-area.js';

const lumen = maps.lumen, svg = overheadMapSVG(lumen, {}, { x: 6, z: 12 });
const count = (text, needle) => text.split(needle).length - 1;
const r2 = v => Math.round(v * 100) / 100;

test('Lumen draws every room, with its building', () => {
  assert.equal(count(svg, 'data-room="'), lumen.buildings.length);
  for (const room of lumen.buildings) assert.ok(svg.includes(`data-room="${room.id}"`), room.id);
  const groups = new Set(lumen.buildings.map(b => b.group));
  for (const g of groups) assert.ok(svg.includes(`data-building="${g}"`), g);
});

test('Lumen draws every sealed tower, stairwell and barricade', () => {
  const ring = lumen.solids.filter(s => s.ring), sealed = lumen.solids.filter(s => s.blockedIn), bars = lumen.solids.filter(s => s.barricade);
  assert.ok(ring.length > 30 && sealed.length && bars.length === 7);
  assert.equal(count(svg, 'data-tower="'), ring.length);
  for (const s of ring) assert.ok(svg.includes(`data-tower="${s.id}"`), s.id);
  assert.equal(count(svg, 'data-sealed="'), sealed.length);
  assert.equal(count(svg, 'data-barricade="'), bars.length);
  // Every solid the map has is one of the three kinds.
  assert.equal(ring.length + sealed.length + bars.length, lumen.solids.length);
});

test('the outline frames the map, and the outline itself is drawn', () => {
  const f = overheadFrame(lumen), outline = playableOutline(lumen);
  assert.ok(svg.startsWith(`<svg viewBox="${r2(f.x)} ${r2(f.z)} ${r2(f.w)} ${r2(f.d)}"`));
  for (const [x, z] of outline) assert.ok(x >= f.x && x <= f.x + f.w && z >= f.z && z <= f.z + f.d);
  assert.ok(f.w < lumen.width && f.d < lumen.depth, 'framed on the outline, not the whole map');
  assert.ok(count(svg, `points="${outline.map(p => `${r2(p[0])},${r2(p[1])}`).join(' ')}"`) >= 2, 'the clip and the drawn outline');
});

test('doorways: every outer one is a lit gap, inner ones are plain gaps', () => {
  const doors = lumen.buildings.flatMap(b => buildingOpenings(b).filter(o => o.type === 'door'));
  const outer = doors.filter(o => o.outer).length, inner = doors.length - outer;
  assert.ok(outer > 40 && inner > 40);
  const lit = svg.match(/data-layer="doorways"[^>]*d="([^"]*)"/)[1];
  assert.equal(count(lit, 'M'), outer);
  // (The inner gaps are two paths, by the floor tone of low and tall rooms.)
  const floorPaths = [...svg.matchAll(new RegExp(`stroke="(${OVERHEAD_CITY.floorLow}|${OVERHEAD_CITY.floorTall})" stroke-width="[\\d.]+" d="([^"]*)"`, 'g'))];
  assert.equal(floorPaths.reduce((n, m) => n + count(m[2], 'M'), 0), inner);
});

test('cars, cover, the three trees, the ground and you are drawn', () => {
  const props = mapProps(lumen), vehicles = props.filter(p => ['car', 'van', 'bike', 'wreck'].includes(p.look));
  const cars = svg.match(/data-layer="cars">(.*?)<\/g>/s)[1];
  assert.equal(count(cars, '<rect'), vehicles.reduce((n, p) => n + (p.collisionBoxes?.length || 1), 0));
  assert.ok(count(svg.match(/data-layer="cover">(.*?)<\/g>/s)[1], '<rect') > 100);
  assert.equal(count(svg, 'data-tree="'), 3);
  // The ground's own shapes (sidewalks, the plaza, roadways, Back Alley), the zebras and lane lines.
  assert.ok(count(svg, '<polygon fill="') > 25);
  for (const c of [OVERHEAD_CITY.zebra, OVERHEAD_CITY.lemon, OVERHEAD_CITY.kerb]) assert.ok(svg.includes(`<path fill="${c}"`), c);
  assert.ok(svg.includes(`cx="6" cy="12" r="1.65" fill="${OVERHEAD_CITY.player}"`), 'the player dot');
  assert.ok(!overheadMapSVG(lumen, {}, null).includes('r="1.65"'), 'no dot without a player');
});

test('no lettering, no team colours, and no transform on the map (teleport clicks go through the SVG matrix)', () => {
  assert.ok(!/<text|<tspan|<foreignObject/i.test(svg), 'shapes only');
  assert.ok(!/#ffb020|#2ee6ff|#b77bff/i.test(svg), 'no team colour');
  for (const colour of Object.values(OVERHEAD_CITY)) assert.ok(!/^#(ffb020|2ee6ff|b77bff)$/i.test(colour));
  assert.ok(!/^<svg [^>]*transform=/.test(svg) && !svg.includes('<g transform'), 'world metres straight into the viewBox');
  assert.ok(svg.includes('id="overhead-playable"'), 'the same clip id the other maps use');
});

test("the city drawing is the city maps' only: the other maps keep theirs", () => {
  for (const id of ['deadwater', 'dry-creek', 'hollow-wick']) assert.equal(maps[id].city, undefined, id);
  const view = { roadProfile: [{ z: -124, left: -4, right: 4 }, { z: 124, left: 51, right: 59 }] };
  assert.ok(!overheadMapSVG(maps.deadwater, view, { x: 1, z: 2 }).includes('overhead-frame'));
  assert.ok(!overheadMapSVG(maps['hollow-wick'], {}, { x: 1, z: 2 }).includes('overhead-frame'));
  // The proving-ground map has no painted ground: it still draws (a flat ground, its rooms and cover).
  const test = overheadMapSVG(maps['city-test'], {}, { x: 0, z: 0 });
  assert.equal(count(test, 'data-room="'), maps['city-test'].buildings.length);
});

test('the same map draws the same map (cached body, only you move)', () => {
  const a = overheadMapSVG(lumen, {}, { x: 1, z: 2 }), b = overheadMapSVG(lumen, {}, { x: 30, z: -8 });
  assert.equal(a.replace(/<circle cx="1"[^>]*\/><circle cx="1"[^>]*\/>/, ''), b.replace(/<circle cx="30"[^>]*\/><circle cx="30"[^>]*\/>/, ''));
});
