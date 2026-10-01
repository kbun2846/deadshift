// Lumen's pigeons and rats (effects/lumen-life-rules.js, effects/lumen-life.js;
// lumen-design.md 14b). Counts per preset; never inside a building or a
// collider, in a puddle (or a rat on the roadway); a shot makes a flock take
// off and land elsewhere; a hidden player scares nothing and a drawn one does;
// rats bolt and hide; nothing is allocated once running.
import test from 'node:test';
import assert from 'node:assert/strict';
import v8 from 'node:v8';
import vm from 'node:vm';
import * as THREE from 'three';
import { maps, mapColliders } from '../src/maps.js';
import { buildingContains } from '../src/map-kit.js';
import { LIFE, BIRD, RAT, BODY_PILE, LifeWorld, LifeField, FLAGS, signPerches } from '../src/effects/lumen-life-rules.js';
import { LumenLife, LIFE_LOOK } from '../src/effects/lumen-life.js';
import { CITY_SYSTEMS } from '../src/render/city-registry.js';
import { waterPlaces } from '../src/effects/lumen-water-places.js';

const map = maps.lumen;
const PRESETS = ['potato', 'performance', 'balanced', 'quality', 'extreme'];
const colliders = mapColliders(map);

// Is (x, z) inside any building room or any collider's own footprint (no padding)?
function inside(x, z) {
  const point = { x, z };
  if (map.buildings.some(b => buildingContains(b, point))) return 'a building';
  for (const c of colliders) {
    const a = c.angle || 0, cos = Math.cos(a), sin = Math.sin(a), dx = x - c.x, dz = z - c.z;
    if (Math.abs(dx * cos - dz * sin) < (c.localW ?? c.w) / 2 && Math.abs(dx * sin + dz * cos) < (c.localD ?? c.d) / 2) return `a collider (${c.propId || c.buildingId || c.solid || 'wall'})`;
  }
  return null;
}
const inPuddle = (x, z) => map.city.puddles.some(p => {
  const c = Math.cos(p.angle), s = Math.sin(p.angle), dx = x - p.x, dz = z - p.z, u = (dx * c - dz * s) / p.rx, v = (dx * s + dz * c) / p.rz;
  return u * u + v * v < 1;
});

// A frame at a spot: the camera looks at (fx, fz), you stand there unless `me` says otherwise.
const CROSSROADS = [6, 0], COURTYARD = [-43, -28];
function step(world, seconds, { at = CROSSROADS, me, others = [], dt = 1 / 60 } = {}) {
  const you = me === undefined ? { x: at[0], z: at[1] } : me;
  for (let t = 0; t < seconds; t += dt) world.update(dt, at[0], at[1], 16 / 9, you, others);
}
const groundBirds = w => w.pigeons.filter(b => b.on && b.st === BIRD.GROUND);
// A world with the camera at `at`, everyone placed round it, and you well away from them.
function ready(quality = 'extreme', at = CROSSROADS) {
  const w = new LifeWorld(map, { quality });
  step(w, 1, { at, me: { x: at[0] + 200, z: at[1] } });
  return w;
}

test('counts per preset: pigeons 4/8/12/18/24, rats 0/3/6/10/14', () => {
  const pigeons = [4, 8, 12, 18, 24], rats = [0, 3, 6, 10, 14];
  PRESETS.forEach((name, i) => {
    assert.equal(LIFE.pigeons[name], pigeons[i]); assert.equal(LIFE.rats[name], rats[i]);
    const w = new LifeWorld(map, { quality: name }), c = w.counts();
    assert.equal(c.pigeons, pigeons[i], `${name} pigeons`); assert.equal(c.rats, rats[i], `${name} rats`); assert.equal(c.flyovers, 0);
  });
  // A preset change re-counts in place (no new animals made).
  const w = new LifeWorld(map, { quality: 'extreme' }), all = w.pigeons.length;
  w.setQuality('potato'); assert.equal(w.counts().pigeons, 4); assert.equal(w.counts().rats, 0);
  w.setQuality('quality'); assert.equal(w.counts().pigeons, 18); assert.equal(w.pigeons.length, all);
  // Fewer in every step of the ladder is never more (Extreme is Quality plus).
  for (let i = 1; i < PRESETS.length; i++) { assert.ok(LIFE.pigeons[PRESETS[i]] >= LIFE.pigeons[PRESETS[i - 1]]); assert.ok(LIFE.rats[PRESETS[i]] >= LIFE.rats[PRESETS[i - 1]]); assert.ok(LIFE.flyovers[PRESETS[i]] >= LIFE.flyovers[PRESETS[i - 1]]); }
});

test('every spot is clear: pigeons on ground off the roadway, rats off the roadway, none in a building, collider or puddle', () => {
  const w = new LifeWorld(map, { quality: 'extreme' }), { ground, ratHomes, hides, pileBirds, pileRats } = w.spots;
  assert.ok(ground.length / 2 > 500, 'plenty of places to peck');
  assert.ok(ratHomes.length / 2 > 100, 'plenty of wall bases');
  for (let i = 0; i < ground.length; i += 2) {
    const x = ground[i], z = ground[i + 1], hit = inside(x, z);
    assert.equal(hit, null, `pigeon spot ${x},${z} is inside ${hit}`);
    assert.ok(!inPuddle(x, z), `pigeon spot ${x},${z} is in a puddle`);
    assert.equal(w.field.flag(x, z) & FLAGS.ROAD, 0, `pigeon spot ${x},${z} is on the roadway`);
  }
  for (const [list, size, name] of [[ratHomes, 2, 'rat home'], [pileBirds, 2, 'pile pigeon spot'], [pileRats, 2, 'pile rat spot'], [hides, 3, 'hide']]) {
    for (let i = 0; i < list.length; i += size) {
      const x = list[i], z = list[i + 1];
      // (A hide at a dumpster's side is against the collider on purpose: it is the way in.)
      if (name !== 'hide') { const hit = inside(x, z); assert.equal(hit, null, `${name} ${x},${z} is inside ${hit}`); assert.ok(!inPuddle(x, z), `${name} ${x},${z} is in a puddle`); }
      if (name === 'hide') {
        // (A drain lies in the gutter, just inside the kerb: a rat reaches it from the sidewalk, within a metre. A dumpster's side is off the road.)
        let reach = false; for (let a = 0; a < 16 && !reach; a++) for (const r of [.4, .8, 1.2]) if (w.field.ratFree(x + Math.cos(a * Math.PI / 8) * r, z + Math.sin(a * Math.PI / 8) * r)) { reach = true; break; }
        assert.ok(reach, `hide ${x},${z} cannot be reached from open ground`);
        if (list[i + 2] === 1) assert.equal(w.field.flag(x, z) & FLAGS.ROAD, 0, `dumpster hide ${x},${z} is on the roadway`);
      } else if (name !== 'pile pigeon spot') assert.equal(w.field.flag(x, z) & FLAGS.ROAD, 0, `${name} ${x},${z} is on the roadway`);
    }
  }
  // The body pile's own place is kept clear (stage 5 builds it there).
  const P = BODY_PILE;
  for (let i = 0; i < ratHomes.length; i += 2) assert.ok(!(ratHomes[i] > P.x0 && ratHomes[i] < P.x1 && ratHomes[i + 1] > P.z0 && ratHomes[i + 1] < P.z1), 'a rat home on the pile');
  for (let i = 0; i < ground.length; i += 2) assert.ok(!(ground[i] > P.x0 && ground[i] < P.x1 && ground[i + 1] > P.z0 && ground[i + 1] < P.z1), 'a pigeon spot on the pile');
  // Rats work the courtyard, the market and the alley (and beside dumpsters).
  const zoneHomes = box => { let n = 0; for (let i = 0; i < ratHomes.length; i += 2) if (ratHomes[i] > box[0] && ratHomes[i] < box[1] && ratHomes[i + 1] > box[2] && ratHomes[i + 1] < box[3]) n++; return n; };
  assert.ok(zoneHomes([-52, -34, -36, -20]) > 10, 'the Stacks courtyard');
  assert.ok(zoneHomes([-26, 0, -56, -38]) > 10, 'the market');
  assert.ok(zoneHomes([-26, -1, -26, -21.5]) > 10, 'Back Alley');
  assert.ok(pileBirds.length >= 4 && pileRats.length >= 4, 'spots round the body pile');
  // Perches: up off the ground, on ledges, eaves and the bus roof.
  const perches = w.spots.perches; assert.ok(perches.length / 4 > 60, 'perches');
  for (let i = 0; i < perches.length; i += 4) assert.ok(perches[i + 1] > .3 && perches[i + 1] < 10, `perch height ${perches[i + 1]}`);
  const busRoof = []; for (let i = 0; i < perches.length; i += 4) if (perches[i] > 44 && perches[i] < 60 && perches[i + 2] > 0 && perches[i + 2] < 8 && Math.abs(perches[i + 1] - 3.32) < .05) busRoof.push(i);
  assert.ok(busRoof.length >= 2, 'the bus roof');
});

test('the placement is seeded: the same every load', () => {
  const a = new LifeWorld(map, { quality: 'balanced' }), b = new LifeWorld(map, { quality: 'balanced' });
  assert.deepEqual(a.pigeons.map(p => [p.x, p.y, p.z]), b.pigeons.map(p => [p.x, p.y, p.z]));
  assert.deepEqual(a.rats.map(p => [p.x, p.z]), b.rats.map(p => [p.x, p.z]));
  step(a, 5); step(b, 5);
  assert.deepEqual(a.pigeons.map(p => [p.x, p.z, p.st]), b.pigeons.map(p => [p.x, p.z, p.st]));
  // A different seed places them elsewhere.
  const c = new LifeWorld(map, { quality: 'balanced', seed: 99 });
  assert.notDeepEqual(a.pigeons.map(p => p.x), c.pigeons.map(p => p.x));
});

test('the animals gather round the camera: a good few of them on the screen', () => {
  for (const at of [CROSSROADS, COURTYARD, [-13, -24]]) {
    const w = ready('extreme', at);
    const onScreen = [...w.pigeons.filter(b => b.on), ...w.rats.filter(r => r.on)].filter(a => w.inWindow(a.x, a.z, 0)).length;
    assert.ok(onScreen >= 3, `${onScreen} animals in view at ${at}`);
  }
  // The camera moves off and they follow it (moved unseen, just outside the screen).
  const w = ready('extreme', CROSSROADS);
  step(w, 30, { at: [-43, 40], me: { x: 300, z: 300 } });
  const near = w.pigeons.filter(b => b.on && w.inWindow(b.x, b.z, LIFE.keep)).length;
  assert.ok(near >= 8, `${near} of 24 pigeons kept near the camera`);
});

test('a shot near a flock sends it up (and the sound hook hears it); it circles once and lands somewhere else', () => {
  const w = ready('extreme', CROSSROADS); let heard = null; w.onFlock = (x, z, n) => { heard = { x, z, n }; };
  const flock = groundBirds(w).filter(b => w.inWindow(b.x, b.z, 0));
  assert.ok(flock.length >= 2, 'a flock on screen');
  const target = flock[0], from = { x: target.x, z: target.z };
  // A round passes a metre from it.
  w.onShot(from.x - 6, from.z + 1, from.x + 6, from.z + 1);
  assert.equal(target.st, BIRD.STARTLE, 'startled at once');
  step(w, 1.2, { me: { x: 500, z: 500 } });
  assert.equal(target.st, BIRD.FLY, 'up in the air');
  assert.ok(heard && heard.n >= 1, 'the flock sound');
  assert.ok(Math.hypot(heard.x - from.x, heard.z - from.z) < 25, 'at the flock');
  const up = w.pigeons.filter(b => b.st === BIRD.FLY).length;
  assert.ok(up >= Math.min(flock.length, 2), `${up} birds in the air`);
  // Airborne it is above the street.
  let peak = 0; for (let t = 0; t < 12; t += 1 / 60) { w.update(1 / 60, CROSSROADS[0], CROSSROADS[1], 16 / 9, { x: 500, z: 500 }, []); peak = Math.max(peak, target.y); if (target.st !== BIRD.FLY) break; }
  assert.ok(peak > 6, `flew up to ${peak.toFixed(1)} m`);
  step(w, 20, { me: { x: 500, z: 500 } });
  assert.ok(target.st === BIRD.GROUND || target.st === BIRD.PERCH, 'landed again');
  assert.ok(Math.hypot(target.x - from.x, target.z - from.z) >= LIFE.settle[0] - 1, `landed ${Math.hypot(target.x - from.x, target.z - from.z).toFixed(1)} m away`);
  assert.equal(inside(target.x, target.z) === null || target.st === BIRD.PERCH, true, 'landed clear of buildings');
});

test('a blast sends up birds far off; a hush follows gunfire (no idle coos)', () => {
  const w = ready('extreme', CROSSROADS);
  const far = groundBirds(w).filter(b => Math.hypot(b.x - 6, b.z) > 9 && Math.hypot(b.x - 6, b.z) < 16);
  const list = far.length ? far : groundBirds(w);
  const b = list[0];
  w.onImpact(b.x + 10, b.z, 'blast');
  const near = w.pigeons.filter(p => p.on && (p.st === BIRD.STARTLE));
  assert.ok(near.length >= 1, 'startled by the blast');
  // A round meeting the ground far away (30 m) leaves them alone.
  const calm = ready('extreme', CROSSROADS), count = groundBirds(calm).length;
  calm.onImpact(calm.fx + 60, calm.fz, 'round'); calm.onShot(calm.fx + 60, calm.fz, calm.fx + 80, calm.fz);
  assert.equal(groundBirds(calm).length, count);
  // Coos are held back after gunfire.
  const coos = []; calm.onCoo = (x, z) => coos.push(calm.time);
  step(calm, 15, { me: { x: 500, z: 500 } });
  assert.equal(coos.length, 0, 'silent while hushed');
  step(calm, 30, { me: { x: 500, z: 500 } });
  assert.ok(coos.length > 0, 'coos again');
});

test('a player the view draws within 5 m scares them; one it hides (not in the frame) does not', () => {
  const w = ready('extreme', CROSSROADS);
  const b = groundBirds(w).find(p => w.inWindow(p.x, p.z, 0));
  assert.ok(b);
  // Somebody stands 2 m from it, but the view hides them: they are not in `others`, and you are far.
  step(w, 3, { me: { x: 400, z: 400 }, others: [] });
  assert.ok(b.st === BIRD.GROUND || b.st === BIRD.PERCH, 'a hidden player scares nothing');
  // The same player, drawn (in `others`): up they go.
  const drawn = { x: b.x + 2, y: 0, z: b.z };
  step(w, .5, { me: { x: 400, z: 400 }, others: [drawn] });
  assert.ok(b.st === BIRD.STARTLE || b.st === BIRD.FLY, 'a drawn player 2 m off scares it');
  // And you yourself, 4 m off, do too; at 8 m they do not.
  const w2 = ready('extreme', CROSSROADS), c = groundBirds(w2).find(p => w2.inWindow(p.x, p.z, 0));
  // (A flock takes off together, so come from a side where no other bird is within 7.5 m of you at 8 m.)
  const [ux, uz] = [[1, 0], [-1, 0], [0, 1], [0, -1]].find(([dx, dz]) => !w2.pigeons.some(o => o !== c && o.on && Math.hypot(o.x - (c.x + 8 * dx), o.z - (c.z + 8 * dz)) < 7.5)) || [1, 0];
  step(w2, .4, { me: { x: c.x + 8 * ux, z: c.z + 8 * uz } }); assert.equal(c.st, BIRD.GROUND);
  step(w2, .4, { me: { x: c.x + 4 * ux, z: c.z + 4 * uz } }); assert.ok(c.st === BIRD.STARTLE || c.st === BIRD.FLY);
});

test('rats bolt from a drawn player within 4 m or at gunfire into cover, stay out of sight, then creep back', () => {
  const w = ready('extreme', COURTYARD);
  const squeaks = []; w.onSqueak = (x, z) => squeaks.push([x, z]);
  // (a foraging rat with room to run: one sat beside its dumpster is under it before the next step)
  const roomy = (w, r) => { const h = w.spots.hides; let d = Infinity; for (let i = 0; i < h.length; i += 3) d = Math.min(d, Math.hypot(h[i] - r.x, h[i + 1] - r.z)); return d > 2; };
  const rat = w.rats.find(r => r.on && r.st === RAT.FORAGE && w.inWindow(r.x, r.z, 0) && roomy(w, r)) || w.rats[0];
  assert.ok(rat.on);
  const home = { x: rat.hx, z: rat.hz };
  // A hidden player next to it: nothing.
  step(w, 1, { at: COURTYARD, me: { x: 900, z: 900 } });
  assert.notEqual(rat.st, RAT.BOLT);
  // Drawn, 2.5 m off: it bolts, squeaks, and (given cover within 11 m) hides.
  const at = { x: rat.x + 2.5, y: 0, z: rat.z };
  step(w, .1, { at: COURTYARD, me: { x: 900, z: 900 }, others: [at] });
  assert.equal(rat.st, RAT.BOLT, 'bolts');
  assert.ok(squeaks.length >= 1);
  let hidden = false, everInsideSolid = false;
  for (let t = 0; t < 6; t += 1 / 60) {
    w.update(1 / 60, COURTYARD[0], COURTYARD[1], 16 / 9, { x: 900, z: 900 }, [at]);
    if (rat.st === RAT.HIDDEN) { hidden = true; break; }
    if (rat.st === RAT.BOLT && !w.field.ratFree(rat.x, rat.z) && (rat.x - rat.tx) ** 2 + (rat.z - rat.tz) ** 2 > 1) everInsideSolid = true;
  }
  assert.ok(hidden || rat.hide < 0, 'went to ground');
  assert.equal(everInsideSolid, false, 'never ran through a wall');
  // Out of sight while hidden; back out once nobody is near.
  if (hidden) {
    assert.equal(rat.st, RAT.HIDDEN);
    step(w, 25, { at: COURTYARD, me: { x: 900, z: 900 }, others: [] });
    assert.ok(rat.st === RAT.FORAGE || rat.st === RAT.RETURN, 'creeps back');
  }
  // Gunfire near a working rat sends it running.
  const w2 = ready('extreme', COURTYARD), r2 = w2.rats.find(r => r.on && r.st === RAT.FORAGE && w2.inWindow(r.x, r.z, 0) && roomy(w2, r));
  w2.onShot(r2.x - 3, r2.z, r2.x - 3, r2.z + 10);
  assert.equal(r2.st, RAT.BOLT, 'a round beside it');
  void home;
});

test('rats keep off the water and the roadway; nothing walks into a wall (a long run with shots and passers-by)', () => {
  const w = new LifeWorld(map, { quality: 'extreme' }); let bad = 0, seen = 0;
  const walker = { x: 0, y: 0, z: 0 };
  for (let t = 0; t < 120; t += 1 / 30) {
    // Somebody strolls along West Street and through the courtyard; now and then a round.
    walker.x = -30 + Math.sin(t * .13) * 14; walker.z = -30 + Math.cos(t * .07) * 12;
    w.update(1 / 30, walker.x, walker.z, 16 / 9, walker, []);
    if (Math.floor(t * 30) % 173 === 0) w.onShot(walker.x, walker.z, walker.x + 10, walker.z + 4);
    for (const r of w.rats) if (r.on && r.st !== RAT.HIDDEN && r.act) {
      seen++;
      const flag = w.field.flag(r.x, r.z);
      // (Bolting into a drain or dumpster ends on ground the grid pads shut: within a metre of its hide.)
      const hx = r.hide >= 0 ? w.spots.hides[r.hide * 3] : 1e9, hz = r.hide >= 0 ? w.spots.hides[r.hide * 3 + 1] : 1e9;
      const enteringHide = (r.st === RAT.BOLT || r.st === RAT.RETURN) && r.hide >= 0 && (r.x - hx) ** 2 + (r.z - hz) ** 2 < 1.2;
      if ((flag & (FLAGS.WATER | FLAGS.ROAD)) && !enteringHide) bad++;
      else if ((flag & FLAGS.HARD) && !enteringHide && inside(r.x, r.z)) bad++;
    }
    for (const b of w.pigeons) if (b.on && b.st === BIRD.GROUND && b.act) { seen++; if (w.field.flag(b.x, b.z) & (FLAGS.HARD | FLAGS.WATER)) bad++; }
  }
  assert.ok(seen > 200, `${seen} samples`);
  assert.equal(bad, 0, `${bad} samples in water, on the road or in a wall`);
});

test('birds in the air keep out of the buildings (a long run of shots at flocks from six places)', () => {
  let airborne = 0, inWall = 0, longest = 0;
  for (const at of [CROSSROADS, COURTYARD, [-13, -24], [-14, -45], [40, -30], [48, 30]]) {
    const w = new LifeWorld(map, { quality: 'extreme' }), far = { x: at[0] + 300, z: at[1] };
    step(w, 3, { at, me: far });
    for (let round = 0; round < 8; round++) {
      const sitting = w.pigeons.filter(b => b.on && b.st <= BIRD.PERCH && w.inWindow(b.x, b.z, 0));
      if (sitting.length) { const b = sitting[round % sitting.length]; w.onShot(b.x - 4, b.z + .5, b.x + 4, b.z + .5); }
      for (let t = 0; t < 25; t += 1 / 60) {
        w.update(1 / 60, at[0], at[1], 16 / 9, far, []);
        for (const b of w.pigeons) if (b.st === BIRD.FLY) {
          airborne++;
          // (Coming down to a roof edge is over the roof: a bird well under the roofline inside a room is the fault.)
          if (map.buildings.some(r => buildingContains(r, b) && (r.wallHeight ?? 4) - .8 >= b.y)) inWall++;
          longest = Math.max(longest, b.age);
        }
      }
    }
    // Everything has come down by the end (a bird never circles for ever).
    assert.equal(w.pigeons.filter(b => b.on && b.st === BIRD.FLY).length <= 2, true, 'flights end');
  }
  assert.ok(airborne > 20000, `${airborne} airborne frames`);
  assert.ok(inWall / airborne < .001, `${inWall} of ${airborne} airborne frames inside a building`);
  assert.ok(longest <= 31, `longest flight ${longest.toFixed(1)} s`);
});

test('flyovers cross the sky along a street now and then (Performance up); none on Potato', () => {
  const potato = ready('potato'); step(potato, 90, { me: { x: 500, z: 500 } });
  assert.equal(potato.counts().flyovers, 0);
  const w = ready('extreme'); let peak = 0, flew = 0, lowest = 99;
  for (let t = 0; t < 120; t += 1 / 30) {
    w.update(1 / 30, 6, 0, 16 / 9, { x: 500, z: 500 }, []);
    const c = w.counts(); peak = Math.max(peak, c.flyovers);
    for (const b of w.pigeons) if (b.flyover && b.st === BIRD.FLY) { flew++; lowest = Math.min(lowest, b.y); assert.ok(w.field.tallAt(b.x, b.z) < b.y, `a flyover through a building at ${b.x},${b.z}`); }
  }
  assert.ok(peak >= 1 && peak <= LIFE.flyovers.extreme, `${peak} at once`);
  assert.ok(flew > 60 && lowest > 8, `flew ${flew} frames, lowest ${lowest.toFixed(1)} m`);
});

test('nothing is allocated once running: no new objects, no heap growth over thousands of frames', () => {
  v8.setFlagsFromString('--expose-gc'); const gc = vm.runInNewContext('gc');
  const w = new LifeWorld(map, { quality: 'extreme' }), birds = w.pigeons.slice(), rats = w.rats.slice(), spots = w.spots, ground = w.spots.ground;
  const player = { x: 0, y: 0, z: 0 }, other = { x: 0, y: 0, z: 0 }, others = [other];
  const run = (frames) => {
    for (let i = 0; i < frames; i++) {
      const t = i / 60; player.x = 6 + Math.sin(t * .4) * 18; player.z = Math.cos(t * .3) * 12; other.x = player.x + 3; other.z = player.z - 2;
      w.update(1 / 60, player.x, player.z, 16 / 9, player, others);
      if (i % 240 === 0) { w.onShot(player.x, player.z, player.x + 12, player.z + 3); w.onImpact(player.x + 5, player.z, i % 480 ? 'round' : 'blast'); w.onFall(player.x + 2, player.z); }
    }
  };
  run(1500); gc(); const before = process.memoryUsage().heapUsed;
  run(6000); gc(); const after = process.memoryUsage().heapUsed;
  assert.ok(after - before < 250 * 1024, `heap grew ${((after - before) / 1024).toFixed(0)} KB over 6000 frames`);
  assert.deepEqual(w.pigeons, birds); assert.ok(w.pigeons.every((b, i) => b === birds[i]) && w.rats.every((r, i) => r === rats[i]));
  assert.equal(w.spots, spots); assert.equal(w.spots.ground, ground);
});

test('the drawn system: three instanced meshes, counts follow the preset, shadows only from Quality, hooks for sound', () => {
  const scene = new THREE.Scene(), view = { scene, qualityName: 'balanced' }, life = new LumenLife(view, map, {});
  assert.deepEqual(scene.children.map(o => o.name).sort(), ['lumen-pigeon-wings', 'lumen-pigeons', 'lumen-rats']);
  assert.ok(life.meshes.every(m => m.isInstancedMesh && !m.frustumCulled));
  // Per preset: the meshes, their instances and shadows.
  const frame = { dt: 1 / 60, elapsed: 0, clock: 0, camera: { aspect: 16 / 9, position: { x: 6, z: 12 } }, focus: { x: 6, z: 0 }, player: { x: 200, z: 0 }, others: [] };
  for (const name of PRESETS) {
    life.setQuality(name); for (let i = 0; i < 90; i++) life.update(frame);
    const shadows = name === 'quality' || name === 'extreme';
    assert.ok(life.meshes.every(m => m.castShadow === shadows && !m.receiveShadow), `${name}: shadows ${shadows}`);
    assert.ok(life.bodies.count <= LIFE.pigeons[name] + LIFE.flyovers[name], `${name}: ${life.bodies.count} bodies`);
    assert.equal(life.wings.count, life.bodies.count * 2);
    assert.ok(life.ratMesh.count <= LIFE.rats[name], `${name}: ${life.ratMesh.count} rats`);
    if (name === 'potato') assert.equal(life.ratMesh.count, 0);
  }
  // Plenty on screen at the Crossroads on Extreme.
  life.setQuality('extreme'); for (let i = 0; i < 90; i++) life.update(frame);
  assert.ok(life.bodies.count + life.ratMesh.count >= 4, `${life.bodies.count} pigeons and ${life.ratMesh.count} rats drawn`);
  // Sound hooks pass through to the rules.
  const f = () => {}, s = () => {}, c = () => {}; life.onFlock = f; life.onSqueak = s; life.onCoo = c;
  assert.equal(life.world.onFlock, f); assert.equal(life.world.onSqueak, s); assert.equal(life.world.onCoo, c);
  // The warm-up gets something to draw even from an empty mesh.
  life.ratMesh.count = 0; life.warm(); assert.ok(life.ratMesh.count >= 1);
  // Colours are muted and none is a team colour (amber, cyan, violet).
  const team = ['#ffb020', '#2ee6ff', '#b77bff'].map(c => new THREE.Color(c));
  for (const key of ['body', 'head', 'sheen', 'beak', 'tail', 'leg', 'wing', 'rat', 'ratHead', 'ratEar', 'ratTail']) {
    const c = new THREE.Color(LIFE_LOOK[key]); for (const t of team) assert.ok(Math.hypot(c.r - t.r, c.g - t.g, c.b - t.b) > .35, `${key} is far from the team colours`);
  }
  life.dispose(); assert.equal(scene.children.length, 0);
});

test('the hub registers it as the `life` system; the map turns it on', () => {
  assert.ok(CITY_SYSTEMS.some(([flag]) => flag === 'life'));
  assert.equal(map.city.life, true);
});

test('pigeons perch on traffic-light mast arms and lamp arms when the map lists them', () => {
  const out = [];
  signPerches([{ kind: 'signal', at: [1, 4.5, 2], facing: 0 }, { kind: 'pole', at: [0, 0, 0], height: 6, arm: 3, facing: Math.PI / 2 }, { kind: 'lamp', at: [4, 0, 4], height: 7, arm: 1.6, facing: 0 }, { kind: 'neon' }], out);
  assert.equal(out.length, 12, 'two on the arm, one on the lamp, none on a signal head');
  assert.ok(Math.abs(out[0] - 1.26) < .01 && Math.abs(out[1] - 5.84) < .01, 'along the mast arm, on top');
  // The real map: perches on its poles.
  const w = new LifeWorld(map, { quality: 'extreme' }), poles = map.citySigns.filter(s => s.kind === 'pole' && s.arm > 1).length;
  assert.ok(poles >= 10);
  let high = 0; for (let i = 0; i < w.spots.perches.length; i += 4) if (w.spots.perches[i + 1] > 5.5 && w.spots.perches[i + 1] < 7.5) high++;
  assert.ok(high >= poles, `${high} perches at arm height for ${poles} poles`);
});

test('the field: the roadway, the pile and the outside are shut; sidewalks are open', () => {
  const f = new LifeField(map);
  assert.ok(f.flag(6, 40) & FLAGS.ROAD, 'the Avenue is road'); assert.equal(f.flag(6, 0) & FLAGS.ROAD, 0, 'the Crossroads plaza is not');
  assert.ok(f.flag(-100, 0) & FLAGS.HARD, 'outside the map'); assert.ok(f.flag(-12, -24.5) & FLAGS.HARD, 'the pile');
  assert.equal(f.flag(-19, -23.6) & FLAGS.HARD, 0, 'the alley is open');
  assert.ok(f.tallAt(-55, -30) >= 50, 'the Stacks are tall'); assert.equal(f.tallAt(6, 40), 0);
});

test('rats bolt into the drains the water effects draw, and keep out of the downspouts\' wet feet', () => {
  const places = waterPlaces(map), w = new LifeWorld(map, { quality: 'extreme' });
  assert.ok(places.drains.length > 10 && places.spouts.length > 5);
  // Every drain of the water effects is a hiding place.
  const hides = w.spots.hides;
  for (const d of places.drains) { let hit = false; for (let i = 0; i < hides.length; i += 3) if (Math.abs(hides[i] - d.x) < .02 && Math.abs(hides[i + 1] - d.z) < .02 && hides[i + 2] === 0) hit = true; assert.ok(hit, `drain ${d.x},${d.z}`); }
  // No rat home or pigeon spot lies in a spout's wet foot.
  for (const s of places.spouts) {
    assert.ok(w.field.flag(s.x, s.z) & FLAGS.WATER, `spout ${s.id} foot is wet ground`);
    for (let i = 0; i < w.spots.ratHomes.length; i += 2) assert.ok(Math.hypot(w.spots.ratHomes[i] - s.x, w.spots.ratHomes[i + 1] - s.z) > 1, 'a rat home in a spout foot');
    for (let i = 0; i < w.spots.ground.length; i += 2) assert.ok(Math.hypot(w.spots.ground[i] - s.x, w.spots.ground[i + 1] - s.z) > 1, 'a pigeon spot in a spout foot');
  }
});
