// Lumen's cut (world/city-cut.js): one rule, per pixel. K (open ground round
// you and the others on your screen; inside, your room's floor and the
// ground outside its doors); a storey whose camera line lands in K is cut;
// a first floor is see-through down to its knee where its line lands by you;
// your building opens; nothing is ever lowered. These run the CPU mirror
// (landing, inK, fadeKnee, hidden, hides), which CUT_GLSL follows line for
// line; tests/lumen-visaudit.test.js checks the whole map with it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CityCut, CUT, CUT_GLSL, SCOOP_GLSL, CUT_ROLE, CUT_ROLES, OPEN, cutBuilding, cutStamp, cutUniforms, footprintMask, maskAt, insideFootprint, besideYou, roomView, quadDepth, shape } from '../src/world/city-cut.js';

const square = (x0, x1, z0, z1) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
// A little city: a tall block south of a street (between the camera and you
// when you stand on the street), a tall block east of the street (beside
// you), a low shop further west, and you on the street.
function city() {
  const south = cutBuilding(1, [square(-10, 10, -.5, 3.5)], 40, 3.6);
  const east = cutBuilding(2, [square(6, 16, -30, -3)], 50, 3.6);
  const shop = cutBuilding(3, [square(-30, -20, -10, 0)], 5, 3.6);
  const kiosk = cutBuilding(4, [square(-22, -18, -32, -29)], 3, 3); // (no storey: its roof is its first floor's top)
  return new CityCut([south, east, shop, kiosk]);
}
// The outdoor camera over you (29 m up, 10.1 m south), as renderer.js.
const eyeOver = (x, z, fx = x) => ({ x: fx, y: 29, z: z + 10.1 });
const settle = (cut, eye, you, others = [], inside = -1, room = null) => { for (let i = 0; i < 10; i++) cut.update(.05, eye, you, others, inside, room); };
// The point where the camera's line through ground point (gx, gz) is at height y.
const onLine = (cut, gx, gz, y) => { const e = cut.eye, k = 1 - y / e.y; return [e.x + (gx - e.x) * k, y, e.z + (gz - e.z) * k]; };

test('city cut: stamps and roles (a section cap has its own), the GLSL carries the rule and its numbers', () => {
  assert.equal(CUT_ROLES, 8);
  assert.equal(cutStamp(5, CUT_ROLE.section), 46);
  assert.deepEqual(Object.values(CUT_ROLE), [0, 1, 2, 3, 4, 5, 6, 7]);
  assert.equal(SCOOP_GLSL, CUT_GLSL);
  for (const f of ['bool cityLanding(vec3 p, out vec2 g)', 'bool cityOpenGround(vec2 g)', 'float cityRoomDepth(vec2 g)', 'bool cityInK(vec2 g)', 'float cityFadeKnee(vec2 g)', 'bool cityHidden(vec3 p, float firstTop, float hide, float beside, float near)', 'bool cityPieceHidden(vec4 row, float near, vec3 p)', 'float cityHideHeight(vec4 row, float x)']) assert.ok(CUT_GLSL.includes(f), f);
  assert.ok(CUT_GLSL.includes(`return ${CUT.knee.toFixed(4)};`) && CUT_GLSL.includes(`return ${CUT.roomKnee.toFixed(4)};`));
  assert.ok(CUT_GLSL.includes(`p.y > firstTop + ${CUT.above.toFixed(4)}`));
  assert.ok(CUT_GLSL.includes('g = cutEye.xz + (p.xz - cutEye.xz) * (cutEye.y / h);'), 'the main camera, never cameraPosition (the mirror agrees)');
  assert.ok(!/cameraPosition/.test(CUT_GLSL));
  // The owner's numbers.
  assert.equal(CUT.you, 6); assert.equal(CUT.fade, 1.6); assert.equal(CUT.knee, .7); assert.ok(CUT.ease <= .15);
  const u = cutUniforms({});
  for (const k of ['cutEye', 'cutTargets', 'cityRoomQuad', 'cityRoomOn', 'cityDoors', 'cityDoorCount', 'cityFootMask', 'cityFootBox']) assert.ok(u[k], k);
  assert.equal(u.cityDoors.value.length, CUT.door.max * 4);
});

test('city cut: the footprint mask is the footprints grown CUT.mask.grow m, read as the GPU filters it, exact at the edge', () => {
  const cut = city(), m = cut.mask;
  assert.ok(m.w * m.cell > 46 && m.h * m.cell > 44);
  const g = CUT.mask.grow;
  for (const b of cut.buildings) for (const poly of b.polygons) for (let i = 0; i < 4; i++) {
    // Along each edge, just outside the grown outline and just inside it.
    const [ax, az] = poly[i], [bx, bz] = poly[(i + 1) % 4], mx = (ax + bx) / 2, mz = (az + bz) / 2;
    const cx = poly.reduce((s, p) => s + p[0], 0) / 4, cz = poly.reduce((s, p) => s + p[1], 0) / 4;
    const nx = Math.sign(mx - cx) * (Math.abs(mx - cx) > 1e-6), nz = Math.sign(mz - cz) * (Math.abs(mz - cz) > 1e-6);
    assert.ok(maskAt(m, mx + nx * (g + .05), mz + nz * (g + .05)) < .5, `slot ${b.slot} edge ${i}: open just past the grown outline`);
    assert.ok(maskAt(m, mx + nx * (g - .05), mz + nz * (g - .05)) > .5, `slot ${b.slot} edge ${i}: inside within it`);
    assert.ok(maskAt(m, cx, cz) > .99);
  }
  assert.equal(maskAt(m, 500, 500), 0, 'off the mask: open');
  assert.ok(cut.openGround(0, -3) && !cut.openGround(0, 1));
  // Rooms side by side are one footprint (no crack on their shared wall).
  const two = footprintMask([cutBuilding(1, [square(0, 5, 0, 5), square(5, 10, 0, 5)], 20, 3.6)]);
  for (let z = .1; z < 5; z += .25) assert.ok(maskAt(two, 5, z) > .55);
});

test('city cut: a building between the camera and you is cut where its line lands by you, and nowhere else; its first floor and section cap stay; nothing moves', () => {
  const cut = city(), south = cut.bySlot.get(1), you = { x: 0, z: -2 };
  settle(cut, eyeOver(0, -2), you);
  assert.equal(south.hide, 0, 'nothing is lowered or hidden whole');
  // Your waist and head: on the line to either, the south block's storeys are cut.
  for (const h of [.9, 1.7]) {
    const e = cut.eye;
    for (const s of [.2, .5, .8]) {
      const k = (e.z - (-.5 + 4 * s)) / (e.z - you.z), p = [e.x + (you.x - e.x) * k, e.y + (h - e.y) * k, e.z + (you.z - e.z) * k];
      if (p[1] > south.floor + CUT.above && p[1] < south.top) assert.ok(cut.hidden(south, ...p), `the storey on the line to your ${h} m at ${p.map(n => n.toFixed(1))}`);
    }
  }
  // Open ground 5 m from you (in K): the storeys on its line are cut; 8 m off (outside K) they stand.
  const [x1, y1, z1] = onLine(cut, 4, -2, 10);
  assert.ok(insideFootprint(south, x1, z1) && cut.hidden(south, x1, y1, z1));
  const [x2, y2, z2] = onLine(cut, 8, -2, 10);
  assert.ok(insideFootprint(south, x2, z2) && !cut.hidden(south, x2, y2, z2), 'outside K the block stands');
  // Its first floor and its section cap on a K line (not by you): kept.
  const [x3, y3, z3] = onLine(cut, 3, -1, 3.2);
  assert.ok(insideFootprint(south, x3, z3) && !cut.hidden(south, x3, y3, z3));
  const [x4, y4, z4] = onLine(cut, 3, -1, south.floor + .02);
  assert.ok(insideFootprint(south, x4, z4) && !cut.hidden(south, x4, y4, z4, true), 'the section cap: a solid top');
  // Lines that land on the block's own footprint (behind its north face from you): never K.
  const [x5, y5, z5] = onLine(cut, 1, 1, 10);
  assert.ok(insideFootprint(south, x5, z5) && !cut.hidden(south, x5, y5, z5));
});

test('city cut: the cut follows you continuously (a hole, not a building going away); a building beside you is never cut beside you', () => {
  const cut = city(), east = cut.bySlot.get(2);
  // Walking north along the east block's west face (1.5 m off it); the city
  // camera keeps 6.5 m off the wall (world/city-camera.js).
  for (let z = -25; z <= -4; z += .5) {
    const you = { x: 4.5, z };
    settle(cut, eyeOver(4.5, z, 6 - 6.5), you);
    // Every storey point of its west face within 1.5 m of your row: standing.
    for (let dz = -1.5; dz <= 1.5; dz += .5) for (let y = 4; y < 29; y += 1) assert.ok(!cut.hidden(east, 6, y, z + dz), `beside you at ${z + dz}, ${y} m`);
    assert.ok(besideYou(east, you.x, you.z));
  }
  // A hole in the south block that moves with you: the cut region's centre shifts by what you walked.
  const south = cut.bySlot.get(1), cutAt = x => { settle(cut, eyeOver(x, -2), { x, z: -2 }); let n = 0, sx = 0; for (let px = -10; px <= 10; px += .25) { const y = 12; for (let pz = -.5; pz <= 3.5; pz += .25) if (cut.hidden(south, px, y, pz)) { n++; sx += px; } } return sx / n; };
  const a = cutAt(-3), b = cutAt(-2);
  assert.ok(Math.abs(b - a - 1) < .15, `the hole moved ${(b - a).toFixed(2)} m for 1 m walked`);
});

test('city cut: a first floor between the camera and you goes see-through above the knee by you, on open ground only; the low border stays', () => {
  const cut = city(), south = cut.bySlot.get(1);
  // Pressed against the block's north face (its wall line at z = -.5).
  const you = { x: 0, z: -1 };
  settle(cut, eyeOver(0, -1), you);
  // The line to your chest crosses the first floor's north wall: see-through over the knee.
  const e = cut.eye, k = (e.z + .5) / (e.z - you.z), y = e.y + (1.2 - e.y) * k;
  assert.ok(y > CUT.knee && y < south.floor && cut.hidden(south, 0, y, -.5), `the wall between you and the camera at ${y.toFixed(2)} m`);
  assert.ok(!cut.hidden(south, 0, CUT.knee - .05, -.5), 'the border under the knee stays');
  // The same wall far from you: whole.
  const [fx, fy, fz] = onLine(cut, 5, -1, 2);
  assert.ok(!cut.hidden(south, fx, fy, fz));
  // A line landing inside the footprint (the ground under the block): never see-through.
  const [ix, iy, iz] = onLine(cut, .5, -.3, 2);
  assert.ok(!cut.hidden(south, ix, iy, iz), 'never into the first floor\'s inside');
  assert.equal(cut.fadeKnee(0, -.4), 1e5);
  assert.equal(cut.fadeKnee(0, -1.3), CUT.knee);
  assert.equal(cut.fadeKnee(0, -1 - CUT.fade - .1), 1e5);
  // A building with no storey: its roof is its first floor's top (see-through by you, never cut by K).
  const kiosk = cut.bySlot.get(4);
  settle(cut, eyeOver(-20, -33.5), { x: -20, z: -33.5 });
  const [kx, ky, kz] = onLine(cut, -20, -32.6, 2.9);
  assert.ok(insideFootprint(kiosk, kx, kz) && cut.hidden(kiosk, kx, ky, kz), 'its roof by you: see-through');
  const [qx, qy, qz] = onLine(cut, -18.2, -32.6, 2.9); // (K, 2 m from you: kept, it has no storey)
  assert.ok(insideFootprint(kiosk, qx, qz) && !cut.hidden(kiosk, qx, qy, qz));
});

test('city cut: your building opens (eased, CUT.ease s), its section cap goes; leaving, the cap is back at once and the storeys rise within CUT.ease s', () => {
  const cut = city(), shop = cut.bySlot.get(3), you = { x: -25, z: -5 };
  const eye = { x: -25, y: 16, z: 0 };
  cut.update(1 / 60, eye, you, [], 3, null);
  assert.equal(shop.mode, OPEN); assert.equal(shop.section, 1);
  assert.ok(shop.hide > 0 && shop.hide < 1);
  for (let i = 0; i < 20; i++) cut.update(1 / 60, eye, you, [], 3, null);
  assert.equal(shop.hide, 1);
  assert.ok(cut.hidden(shop, -25, 4.2, -5) && !cut.hidden(shop, -25, 3.2, -5), 'above the first floor gone, the first floor kept');
  assert.ok(cut.hides(3, -29.9, 4.5, -5), 'a sign on its storey goes too');
  // Leaving.
  cut.update(1 / 60, eye, { x: -25, z: 2 }, [], -1, null);
  assert.equal(shop.section, 0, 'the section cap is back the frame you leave');
  let t = 1 / 60;
  while (shop.hide > 0) { cut.update(1 / 60, eye, { x: -25, z: 2 }, [], -1, null); t += 1 / 60; }
  assert.ok(t <= CUT.ease + 1 / 60 + 1e-9, `back in ${t.toFixed(3)} s`);
  assert.equal(shape(0), 0); assert.equal(shape(1), 1);
});

test('city cut: a building holding the camera is drawn to its first floor (its section cap on top); coming up to it, it comes down with the camera\'s distance', () => {
  const cut = city(), south = cut.bySlot.get(1);
  settle(cut, { x: 0, y: 29, z: 2 }, { x: 0, z: -8 });
  assert.equal(south.near, 1); assert.equal(south.hide, 0, 'only round the camera, never the whole building');
  assert.ok(cut.hidden(south, 0, 20, 2) && !cut.hidden(south, 0, 3, 2));
  assert.ok(cut.hidden(south, CUT.near.radius - .1, 20, 2) && !cut.hidden(south, CUT.near.radius + .1, 20, 2), `within CUT.near.radius m of the camera`);
  settle(cut, { x: 0, y: 29, z: 15 }, { x: 0, z: 5 });
  assert.equal(south.near, 0);
  // Coming up to it (the camera south of it, its south face at 3.5): within
  // CUT.near.reach m its storeys stop at a height that comes down from the
  // camera's to the first floor's as the camera comes, continuously.
  let last = Infinity;
  for (let z = 3.5 + CUT.near.margin + CUT.near.reach + 1; z >= 3.5; z -= .05) {
    settle(cut, { x: 0, y: 29, z }, { x: 0, z: z - 10 });
    const h = cut.hideAt(south, south.near);
    assert.ok(h <= last + 1e-9, 'it only comes down as the camera comes');
    if (Number.isFinite(last) && last < 1e4) assert.ok(last - h < 1.5, `no jump: ${last.toFixed(2)} to ${h.toFixed(2)} for 5 cm`);
    last = h;
  }
  assert.ok(Math.abs(last - (south.floor + CUT.above)) < 1e-6);
  settle(cut, { x: 0, y: 29, z: 3.5 + CUT.near.margin + CUT.near.reach / 2 }, { x: 0, z: -5 });
  assert.ok(Math.abs(cut.hideAt(south, south.near) - (south.floor + CUT.above + (29 - south.floor - CUT.above) / 2)) < 1e-6, 'half way: half way down from the camera');
  // A building lower than the camera never holds it.
  settle(cut, { x: -25, y: 29, z: -5 }, { x: -25, z: -15 });
  assert.equal(cut.bySlot.get(3).hide, 0);
});

test('city cut: others on your screen near you get their own discs (sticky, held, eased); someone far off or off the screen none', () => {
  const cut = city(), you = { x: 0, z: -2 }, a = { x: 3, z: -8 }, b = { x: -4, z: -6 }, far = { x: 0, z: -40 }, side = { x: 30, z: -2 };
  settle(cut, eyeOver(0, -2), you, [a, b, far, side]);
  const who = cut.discs.slice(1).map(d => d.who);
  assert.ok(who.includes(a) && who.includes(b) && !who.includes(far) && !who.includes(side));
  const da = cut.discs.find(d => d.who === a);
  assert.equal(da.radius, CUT.others.radius); assert.equal(da.fade, 0, 'the see-through first floor is yours alone');
  assert.equal(cut.discs[0].radius, CUT.you); assert.equal(cut.discs[0].fade, CUT.fade);
  // a steps away: its disc holds where it was, then eases out; b keeps its disc (never swapped).
  const slotB = cut.discs.indexOf(cut.discs.find(d => d.who === b));
  cut.update(.1, cut.eye, you, [b], -1, null);
  assert.equal(da.who, a); assert.equal(da.radius, CUT.others.radius);
  for (let i = 0; i < 20; i++) cut.update(.05, cut.eye, you, [b], -1, null);
  assert.equal(da.radius, 0); assert.equal(da.who, null);
  assert.equal(cut.discs[slotB].who, b);
  // No player drawn (dead, spectating): your disc eases out.
  settle(cut, eyeOver(0, -2), null);
  assert.equal(cut.discs[0].radius, 0);
});

test('city cut: inside, K is your room\'s floor (grown) and the ground just outside its outer doors; the see-through first floor is over its floor', () => {
  const cut = city();
  const room = { x: -25, z: -5, w: 10, d: 10 };
  const openings = [{ outer: true, a: { x: -26, z: -.1 }, b: { x: -24, z: -.1 } }, { outer: false, a: { x: -30, z: -6 }, b: { x: -30, z: -4 } }];
  const rv = roomView(room, openings);
  assert.equal(rv.doors.length, 1);
  assert.ok(Math.abs(rv.doors[0].angle - Math.PI / 2) < 1e-9, 'the doorway\'s normal points out of the room');
  settle(cut, { x: -25, y: 16, z: 0.6 }, { x: -25, z: -5 }, [], 3, rv);
  assert.ok(cut.inK(-25, -5) && cut.inK(-29.9, -9.9) && cut.inK(-30.1, -5), 'the floor, to its outline grown');
  assert.ok(!cut.inK(-30.3, -5));
  assert.ok(cut.inK(-25, 2) && cut.inK(-26.2, 1) && !cut.inK(-25, 3) && !cut.inK(-27.5, 1), 'CUT.door.depth m outside the doorway');
  assert.equal(cut.fadeKnee(-25, -5), CUT.roomKnee);
  assert.equal(cut.fadeKnee(-29.95, -5), 1e5, 'not over a wall\'s thickness');
  assert.ok(Math.abs(quadDepth(rv.quad, -25, -5) - (5 + CUT.roomGrow)) < 1e-6);
  // The uniforms and the table as the shader reads them.
  const u = cutUniforms({}), data = new Float32Array(128 * 3 * 4);
  cut.bySlot.get(1).interior = true;
  assert.equal(cut.pack(u, data, 128), true);
  assert.equal(u.cityRoomOn.value, 1); assert.equal(u.cityDoorCount.value, 1);
  assert.deepEqual([...u.cutEye.value], [-25, 16, Math.fround(.6), 1]);
  assert.equal(data[3 * 4], 1, 'yours: hidden above its first floor'); assert.equal(data[3 * 4 + 1], 1, 'its section cap gone');
  assert.equal(data[128 * 8 + 3 * 4], 0, 'row 2: hidden near the camera (none here)');
  assert.equal(data[128 * 4 + 4], 0, 'an interior shown: its plugs gone'); assert.equal(data[128 * 4 + 8], 1);
  assert.equal(cut.pack(u, data, 128), false, 'nothing changed: no upload');
});

test('city cut: a piece (a sign, a projector) goes by the rule at its centre; one on no building never', () => {
  const cut = city(), you = { x: 0, z: -2 };
  settle(cut, eyeOver(0, -2), you);
  const [x, y, z] = onLine(cut, 2, -2, 15);
  assert.ok(cut.hides(1, x, y, z));
  const [x2, y2, z2] = onLine(cut, 9, -2, 15);
  assert.ok(!cut.hides(1, x2, y2, z2));
  assert.equal(cut.hides(0, x, y, z), false);
  assert.equal(cut.hides(99, x, y, z), false);
});
