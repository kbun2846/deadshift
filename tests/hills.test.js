// The hills system in play (Test Hill): walking on slopes, retaining walls,
// sight over crests, rounds that end in the ground, blasts in 3D, orbs
// against rises, grenades over the ground, robots and the network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/simulation.js';
import { maps, groundFor, mapHash } from '../src/maps.js';
import { shotClear, offScreen } from '../src/bots/robot-brain.js';
import { pack, ProjectileMirror } from '../src/net/projectiles.js';
import { castToWall } from '../src/effects/blood-surfaces.js';
import { blastReach } from '../src/weapons/scatter.js';
import { mapColliders } from '../src/map-kit.js';
import { createLoopback } from '../src/net/transport.js';
import { HostSession } from '../src/net/host-session.js';
import { ClientSession } from '../src/net/client-session.js';
import { RULES, RIFLE, TERRAIN } from '../src/config/gameplay.js';

const map = maps['hill-test'], ground = groundFor(map);
function seeded(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function sim(weapon = 'rifle', at = null) {
 const s = new Simulation(map); s.weapon = weapon; s.reset(); s.targets = [];
 if (at) Object.assign(s.player, { x: at[0], z: at[1] });
 return s;
}
const walk = (s, mx, mz, ticks) => { for (let i = 0; i < ticks; i++) s.step({ moveX: mx, moveZ: mz, aimX: 1, aimZ: 0 }); return s.player; };

test('walking up a slope is slower and down it a little quicker; across it, no change', () => {
 // Straight up and down the hill's south-east flank (no props on the line).
 const flat = walk(sim('rifle', [0, 26]), 1, 0, 60).x;                  // the flat south
 const up = 6 - walk(sim('rifle', [22, 6]), 0, -1, 60).z;               // north, up the flank
 const down = walk(sim('rifle', [22, -2]), 0, 1, 60).z + 2;             // south, down it
 assert.ok(up < flat * .985 && up > flat * (1 - TERRAIN.uphill) - .05, `up ${up} flat ${flat}`);
 assert.ok(down > flat * 1.003 && down < flat * (1 + TERRAIN.downhill) + .05, `down ${down} flat ${flat}`);
 // Across the hill's south slope (it falls to the south there): no change.
 const s = sim('rifle', [14, 2]), fall = ground.gradientAt(14, 2);
 assert.ok(Math.abs(fall.z) > .15 && Math.abs(fall.x) < .03, 'a slope running north-south');
 assert.ok(Math.abs(s.slopeFactor(1, 0) - 1) < .005 && Math.abs(s.slopeFactor(-1, 0) - 1) < .005, `across ${s.slopeFactor(1, 0)}`);
 // A dodge is not stretched downhill.
 const d1 = sim('rifle', [22, -2]); d1.step({ moveX: 0, moveZ: 1, dodge: true, aimX: 0, aimZ: 1 });
 for (let i = 0; i < 20; i++) d1.step({ moveX: 0, moveZ: 0, aimX: 0, aimZ: 1 });
 const d2 = new Simulation(maps['dry-creek']); d2.weapon = 'rifle'; d2.reset(); d2.targets = []; Object.assign(d2.player, { x: 0, z: -10 });
 d2.step({ moveX: 0, moveZ: 1, dodge: true, aimX: 0, aimZ: 1 }); for (let i = 0; i < 20; i++) d2.step({ moveX: 0, moveZ: 0, aimX: 0, aimZ: 1 });
 assert.ok(Math.abs((d1.player.z + 2) - (d2.player.z + 10)) < .02, 'dodge distance');
});

test('retaining walls stop bodies from above and below; the ramp goes up', () => {
 assert.ok(walk(sim('rifle', [-16, -17]), 1, 0, 120).x < -12.4, 'off the plateau edge');
 assert.ok(walk(sim('rifle', [-8, -17]), -1, 0, 120).x > -11.2, 'up the wall');
 const up = walk(sim('rifle', [-20, 2]), 0, -1, 150);
 assert.ok(up.z < -12 && ground.heightAt(up.x, up.z) > 2.4, 'up the ramp onto the plateau');
 // The ramp's own side walls hold you on it.
 const side = walk(sim('rifle', [-20, -6]), 1, 0, 90);
 assert.ok(side.x < -17.9 + .01 - RULES.radius + .4, `off the ramp's side at ${side.x}`);
});

test('sight: a crest hides you from target lock, aim assist and robots', () => {
 const s = sim('rifle', [-4, -10]);
 assert.equal(s.sees(32, -10), false);       // the far side of the hill
 assert.equal(s.canSeeTarget(32, -10), false);
 assert.equal(s.obstacleBetween(-4, -10, 32, -10), true);
 assert.equal(s.sees(4, -2), true);          // the near slope
 assert.equal(shotClear(s.colliders, -4, -10, 32, -10, .04, s.ground), false);
 assert.equal(shotClear(s.colliders, -4, -10, 32, -10, .04), true, 'without the ground: walls only');
 s.targets = [{ id: 'far', x: 32, z: -10, hp: 100, maxHp: 100 }, { id: 'near', x: 4, z: -2, hp: 100, maxHp: 100 }];
 assert.deepEqual(s.assistTargets().map(t => t.id), ['near']);
});

// Fire one aimed rifle round from a at b; did it hit?
function rifleHits(a, b) {
 const s = sim('rifle', a); Object.assign(s.dev, { noSpread: true, noRecoil: true });
 s.step({ aimX: 1, aimZ: 0 }); // settle against any wall first, then aim from there
 const target = { id: 'b', kind: 'player', x: b[0], z: b[1], hp: 5000, maxHp: 5000 };
 s.targets = [target];
 const dx = b[0] - s.player.x, dz = b[1] - s.player.z, d = Math.hypot(dx, dz);
 s.step({ aimX: dx / d, aimZ: dz / d, aimPointX: b[0], aimPointZ: b[1], fire: true });
 for (let i = 0; i < 60 && s.rifleBullets.length; i++) s.step({ aimX: dx / d, aimZ: dz / d, aimPointX: b[0], aimPointZ: b[1] });
 return target.hp < 5000;
}

test('a round hits exactly what its shooter can see, both ways round', () => {
 const random = seeded(77);
 let checked = 0, hidden = 0;
 for (let k = 0; k < 400 && checked < 120; k++) {
  const a = [-30 + random() * 60, -26 + random() * 52], b = [-30 + random() * 60, -26 + random() * 52], d = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (d < 3 || d > 40) continue;
  // Only lines no wall, prop or retaining wall crosses (those are tested elsewhere).
  const s = sim('rifle', a);
  if (s.colliders.some(c => Math.abs(c.x - a[0]) < 2 && Math.abs(c.z - a[1]) < 2)) continue;
  if (!shotClear(s.colliders, a[0], a[1], b[0], b[1], .5) || s.colliders.some(c => c.terrainEdge && Math.hypot(c.x - b[0], c.z - b[1]) < 2)) continue;
  if (map.buildings.some(bld => Math.abs(bld.x - a[0]) < 6 && Math.abs(bld.z - a[1]) < 6 || Math.abs(bld.x - b[0]) < 6 && Math.abs(bld.z - b[1]) < 6)) continue;
  // (Both settled away from any wall, as the shots are.)
  const settled = p => { const t = sim('rifle', p); t.step({ aimX: 1, aimZ: 0 }); return [t.player.x, t.player.z]; };
  const [sa, sb] = [settled(a), settled(b)];
  if (Math.hypot(sa[0] - a[0], sa[1] - a[1]) > 1e-6 || Math.hypot(sb[0] - b[0], sb[1] - b[1]) > 1e-6) continue;
  const seen = ground.sightClear(a[0], a[1], b[0], b[1]);
  assert.equal(rifleHits(a, b), seen, `a ${a} -> b ${b} (seen ${seen})`);
  assert.equal(rifleHits(b, a), seen, `b ${b} -> a ${a} (seen ${seen})`);
  checked++; if (!seen) hidden++;
 }
 assert.ok(checked >= 60 && hidden >= 5, `checked ${checked}, hidden ${hidden}`);
});

test('a round fired into a rise ends in the ground there', () => {
 const s = sim('rifle', [-8, -10]); Object.assign(s.dev, { noSpread: true, noRecoil: true });
 s.step({ aimX: 1, aimZ: 0, aimPointX: 30, aimPointZ: -10, fire: true });
 const bullet = s.rifleBullets[0];
 assert.ok(bullet.stop > 5 && bullet.stop < 40, `stop ${bullet.stop}`);
 const events = [];
 for (let i = 0; i < 60 && s.rifleBullets.length; i++) { s.step({ aimX: 1, aimZ: 0, aimPointX: 30, aimPointZ: -10 }); events.push(...s.drainEvents()); }
 const impact = events.find(e => e.type === 'rifleImpact');
 assert.ok(impact?.ground, 'a ground impact');
 assert.ok(Math.abs(impact.x - (bullet.x)) < 1e-9 && impact.x < 30);
 // Off the hilltop down its far side: no stop at all.
 const top = sim('rifle', [14, -10]); Object.assign(top.dev, { noSpread: true, noRecoil: true });
 top.step({ aimX: 1, aimZ: 0, aimPointX: 30, aimPointZ: -10, fire: true });
 assert.equal(top.rifleBullets[0].stop, undefined);
 // Ballast's pellets too: fired into the plateau's east wall from below.
 const b = sim('shotgun', [-11, -12.7]); Object.assign(b.dev, { noSpread: true });
 const aim = { aimX: -.91, aimZ: -.42, aimPointX: -11 - .91 * 6, aimPointZ: -12.7 - .42 * 6 };
 b.step({ ...aim, fire: true });
 const stopped = b.shotgunPellets.filter(p => p.stop !== undefined);
 assert.ok(stopped.length > 0 && stopped.every(p => p.stop > 1 && p.stop < 6), `pellet stops ${stopped.map(p => p.stop?.toFixed(2))}`);
 const pelletEvents = [];
 for (let i = 0; i < 30 && b.shotgunPellets.length; i++) { b.step(aim); pelletEvents.push(...b.drainEvents()); }
 assert.ok(pelletEvents.some(e => e.type === 'rifleImpact' && e.ground && e.x < -11.5), 'a pellet goes into the ground at the wall');
});

test('blasts are measured in 3D and stop at a crest', () => {
 const s = sim('static', [0, 26]);
 const low = { id: 'low', x: 4, z: 20, hp: 1000, maxHp: 1000 }, high = { id: 'high', x: 4, z: 13.5, hp: 1000, maxHp: 1000 };
 // 3D distance: the same flat distance with a height between is further.
 const blast = { x: 4, z: 16.75 };
 const flatD = Math.hypot(low.x - blast.x, low.z - blast.z);
 assert.ok(s.reach3(blast, low, flatD) > flatD);
 assert.equal(sim('static').reach3(blast, blast, 2), 2);
 // The crest rule itself (blastReach, used by every blast): nothing behind a
 // crest, whatever the distance; and out of reach on the flat is out at
 // once, without walking the ground (3D is never shorter).
 assert.equal(blastReach({ ground }, 2, -10, { x: 24, z: -10 }, 22), Infinity);
 assert.ok(blastReach({ ground }, 4, 20, { x: 4, z: 13.5 }, 6.5) > 6.5);
 let walked = 0; const spy = { ground: { flat: false, sightClear: () => (walked++, true), heightAt: () => 0 } };
 assert.equal(blastReach(spy, 0, 0, { x: 10, z: 0 }, 10, .5, 4), Infinity);
 assert.equal(walked, 0);
 assert.equal(blastReach(spy, 0, 0, { x: 4.2, z: 0 }, 4.2, .5, 4), 4.2);
 assert.equal(walked, 1);
 // A full orb blast (3 m) on the plateau near its east wall: a body under the
 // wall (in reach on the flat; further in 3D, and behind the lip) takes
 // nothing; one on the plateau at the same flat distance does.
 const under = { id: 'under', x: -11.2, z: -13, hp: 1000, maxHp: 1000 }, beside = { id: 'beside', x: -14.5, z: -16.3, hp: 1000, maxHp: 1000 };
 assert.equal(ground.sightClear(-14.5, -13, under.x, under.z), false);
 s.targets = [under, beside];
 s.explode({ x: -14.5, z: -13, arrived: 12 }, 1);
 assert.equal(under.hp, 1000);
 assert.ok(beside.hp < 1000);
 // Height counts: two bodies the same flat distance from a blast, one up the
 // hollow's bank, one down in it; the one further off in 3D takes less.
 const g2 = sim('static', [0, 26]); g2.targets = [low, high];
 const mid = { x: 4, z: (low.z + high.z) / 2 };
 assert.ok(Math.abs(Math.hypot(low.x - mid.x, low.z - mid.z) - Math.hypot(high.x - mid.x, high.z - mid.z)) < 1e-9);
 g2.explode({ ...mid, arrived: 12 }, 3);
 const dLow = Math.abs(ground.heightAt(low.x, low.z) - ground.heightAt(mid.x, mid.z)), dHigh = Math.abs(ground.heightAt(high.x, high.z) - ground.heightAt(mid.x, mid.z));
 assert.ok(dLow !== dHigh && (dLow > dHigh ? low.hp > high.hp : high.hp > low.hp), `low ${low.hp} (${dLow.toFixed(2)} m) high ${high.hp} (${dHigh.toFixed(2)} m)`);
 // The same with a grenade landing there (4 m reach, to the body's middle).
 const gr = sim('rifle', [-18, -13]);
 const hid = { id: 'hid', x: -11.2, z: -13, hp: 1000, maxHp: 1000 }, open = { id: 'open', x: -14.5, z: -16.3, hp: 1000, maxHp: 1000 }; gr.targets = [hid, open];
 gr.step({ aimX: 1, aimZ: 0, aimPointX: -14.5, aimPointZ: -13, grenade: true });
 for (let i = 0; i < 200 && gr.grenades.length; i++) gr.step({ aimX: 1, aimZ: 0 });
 assert.equal(hid.hp, 1000);
 assert.ok(open.hp < 1000);
});

test('Scatter: its shells never hit a body the Ballast player cannot see', () => {
 // From the plateau at bodies under its south wall (hidden by the lip).
 for (const [a, b] of [[[-15, -16], [-15, -8]], [[-16, -16.5], [-16, -8.5]], [[-13.5, -16], [-13.5, -8]]]) {
  for (let seed = 1; seed <= 3; seed++) {
   const random = seeded(seed * 31), keep = Math.random; Math.random = random;
   try {
    const s = sim('shotgun', a); Object.assign(s.dev, { cooldowns: true, noKnockback: true });
    s.step({ aimX: 0, aimZ: 1 });
    const t = { id: 'hid', kind: 'player', x: b[0], z: b[1], hp: 5000, maxHp: 5000 }; s.targets = [t];
    assert.equal(ground.sightClear(s.player.x, s.player.z, t.x, t.z), false, 'hidden');
    const shells = []; const hit = s.hit.bind(s); s.hit = (target, o) => { if (!o.blast) shells.push(o.damage); return hit(target, o); };
    const aim = { aimX: 0, aimZ: 1 };
    s.step({ ...aim, scatter: true });
    for (let i = 0; i < 190; i++) s.step(aim);
    s.step({ ...aim, scatter: true });
    for (let i = 0; i < 150; i++) s.step(aim);
    assert.deepEqual(shells, [], `a shell hit a hidden body from ${a} at ${b}`);
   } finally { Math.random = keep; }
  }
 }
});

test('an orb volley does not turn onto a body hidden over a crest', () => {
 const run = (target, cursor) => {
  const keep = Math.random; Math.random = seeded(3);
  try {
   const s = sim('static', [2, -10]);
   for (let i = 0; i < 40; i++) s.step({ aimX: 1, aimZ: 0, seed: true });
   const t = { id: 'b', kind: 'player', x: target[0], z: target[1], hp: 5000, maxHp: 5000 }; s.targets = [t];
   s.step({ aimX: 1, aimZ: 0, launch: true, launchPointX: cursor[0], launchPointZ: cursor[1] });
   for (let i = 0; i < 150; i++) s.step({ aimX: 1, aimZ: 0 });
   return 5000 - t.hp;
  } finally { Math.random = keep; }
 };
 assert.equal(ground.sightClear(2, -10, 24, -10), false);
 // Just short of the cursor, on the line: a body you could see would draw the
 // whole volley (tested on flat ground elsewhere); this one only takes the
 // blasts that land at the cursor, as if it were not there.
 const near = run([24, -10], [25.2, -10]), off = run([24, -10.1], [25.2, -10]);
 assert.ok(near < 120, `hidden body took ${near}`);
 assert.ok(Math.abs(near - off) < 60, `${near} vs ${off}`);
});

test('grenades: lobbed off the plateau at someone below, or up onto it, they get there', () => {
 const throwAt = (from, to) => {
  const s = sim('rifle', from); s.step({ aimX: 1, aimZ: 0 });
  const t = { id: 't', kind: 'player', x: to[0], z: to[1], hp: 5000, maxHp: 5000 }; s.targets = [t];
  const dx = to[0] - s.player.x, dz = to[1] - s.player.z, d = Math.hypot(dx, dz), aim = { aimX: dx / d, aimZ: dz / d, aimPointX: to[0], aimPointZ: to[1] };
  s.step({ ...aim, grenade: true });
  let rest = null;
  for (let i = 0; i < 200 && s.grenades.length; i++) {
   s.step(aim); const g = s.grenades[0];
   if (g) { assert.ok(g.y >= ground.heightAt(g.x, g.z) + .11, 'above the ground'); rest = [g.x, g.z]; }
  }
  return { damage: 5000 - t.hp, short: Math.hypot(rest[0] - to[0], rest[1] - to[1]) };
 };
 const down = throwAt([-17, -14], [-11.1, -14]);
 assert.ok(down.short < .6 && down.damage > 250, `down: ${JSON.stringify(down)}`);
 const south = throwAt([-15, -15], [-15, -8.6]);
 assert.ok(south.short < .6 && south.damage > 250, `over the south wall: ${JSON.stringify(south)}`);
 const up = throwAt([-9, -16], [-14.5, -16]);
 assert.ok(up.short < .6 && up.damage > 250, `up: ${JSON.stringify(up)}`);
});

test('blood thrown at a retaining wall stains it from below and flies over it from above', () => {
 const colliders = mapColliders(map);
 const below = castToWall(colliders, -11.1, -17, -1, 0, 2.3, 0, ground);
 assert.ok(below && below.x > -12.2 && below.nx > .9, `from the foot: ${JSON.stringify(below)}`);
 assert.equal(castToWall(colliders, -12.9, -17, 1, 0, 2.3, 0, ground), null, 'from the top it goes over');
 assert.equal(castToWall(colliders, -11.1, -17, -1, 0, 2.3), null, 'no ground given: as before');
});

test('orbs stop against a retaining wall and float over the rest', () => {
 const s = sim('static', [-8, -17]);
 for (let i = 0; i < 20; i++) s.step({ aimX: -1, aimZ: 0, seed: true });
 assert.ok(s.seeds.length > 0);
 const events = [];
 s.step({ aimX: -1, aimZ: 0, launch: true, launchPointX: -20, launchPointZ: -17 });
 for (let i = 0; i < 60; i++) { s.step({ aimX: -1, aimZ: 0 }); events.push(...s.drainEvents()); }
 const walls = events.filter(e => e.type === 'wall' && e.launched);
 assert.ok(walls.length > 0 && walls.every(e => e.x > -12.6 && e.x < -11), `orbs stopped at ${walls.map(e => e.x.toFixed(2))}`);
 // Up the ramp's gentle slope they carry on.
 const r = sim('static', [-20, 3]);
 for (let i = 0; i < 20; i++) r.step({ aimX: 0, aimZ: -1, seed: true });
 const ev = [];
 r.step({ aimX: 0, aimZ: -1, launch: true, launchPointX: -20, launchPointZ: -8 });
 for (let i = 0; i < 60; i++) { r.step({ aimX: 0, aimZ: -1 }); ev.push(...r.drainEvents()); }
 assert.ok(ev.some(e => e.type === 'pointImpact'), 'they reached the aim point');
});

test('Static: orbs placed at the foot of a retaining wall never go up its face', () => {
 // Aimed at the wall: nothing is placed and no orb is spent (as against a wall).
 const s = sim('static', [-11.05, -17]); s.step({ aimX: -1, aimZ: 0 });
 const ammo = s.ammo, events = [];
 for (let i = 0; i < 40; i++) { s.step({ aimX: -1, aimZ: 0, seed: true }); events.push(...s.drainEvents()); }
 assert.equal(s.seeds.length, 0);
 assert.equal(s.ammo, ammo);
 assert.ok(events.some(e => e.type === 'wall') && !events.some(e => e.type === 'seed'));
 // Along the foot of each wall, every way: no parked orb ever ends up on the level above.
 const face = (ax, az, bx, bz) => { const n = Math.ceil(Math.hypot(bx - ax, bz - az) / .1); let prev = ground.heightAt(ax, az), up = false; for (let k = 1; k <= n; k++) { const h = ground.heightAt(ax + (bx - ax) * k / n, az + (bz - az) * k / n); if (h - prev > .25) up = true; prev = h; } return up && ground.heightAt(bx, bz) > ground.heightAt(ax, az) + .5; };
 for (const [x, z] of [[-11.05, -20], [-11.05, -14], [-27, -9.4], [-15, -9.4], [-17.4, -6], [-22.6, -6]]) for (let a = 0; a < 8; a++) {
  const ax = Math.cos(a * Math.PI / 4), az = Math.sin(a * Math.PI / 4), t = sim('static', [x, z]); t.dev.ammo = true; t.step({ aimX: ax, aimZ: az });
  for (let i = 0; i < 120; i++) {
   t.step({ aimX: ax, aimZ: az, seed: i < 80 });
   for (const o of t.seeds) assert.ok(!face(t.player.x, t.player.z, o.x, o.z), `an orb went up a wall from ${x}, ${z} aiming ${a * 45}: ${o.x.toFixed(2)}, ${o.z.toFixed(2)}`);
  }
 }
});

test('grenades fly over the ground, fall onto it and land at its height', () => {
 const s = sim('rifle', [-2, -10]);
 s.step({ aimX: 1, aimZ: 0, aimPointX: 8, aimPointZ: -10, grenade: true });
 const g = s.grenades[0];
 assert.ok(Math.abs(g.y - (ground.heightAt(g.x, g.z) + .85)) < 1e-9);
 let lowest = Infinity;
 for (let i = 0; i < 70 && s.grenades.length; i++) { s.step({ aimX: 1, aimZ: 0 }); const h = s.grenades[0]; if (h) lowest = Math.min(lowest, h.y - ground.heightAt(h.x, h.z)); }
 assert.ok(lowest > .1, `never in the ground (${lowest})`);
 // Lobbed up over the plateau's wall it lands on top, never in the ground.
 const w = sim('rifle', [-7, -17]);
 w.step({ aimX: -1, aimZ: 0, aimPointX: -19, aimPointZ: -17, grenade: true });
 let last = null;
 for (let i = 0; i < 70 && w.grenades.length; i++) {
  w.step({ aimX: -1, aimZ: 0 });
  const h = w.grenades[0]; if (h) { assert.ok(h.y >= ground.heightAt(h.x, h.z) + .11, 'above the ground'); last = h; }
 }
 assert.ok(last && ground.heightAt(last.x, last.z) > 2.4, 'on the plateau');
});

test('robots: the off-screen box leans with the height between you', () => {
 assert.equal(offScreen(0, -11, 0, 0), false);
 assert.equal(offScreen(0, -11, 0, 0, 0, 0), false);
 assert.equal(offScreen(0, -11, 0, 0, 0, 2), true);    // 2 m higher: off the top
 assert.equal(offScreen(0, -12, 0, 0, 0, -2), false);  // 2 m lower: still on screen
 assert.equal(offScreen(17, 0, 0, 0, 0, 5), true);
 assert.equal(offScreen(17, 0, 0, 0), false);
});

test('network: rounds carry their stop, the mirror keeps them short of it, and a joiner on another map is turned away', () => {
 const s = sim('rifle', [-8, -10]); Object.assign(s.dev, { noSpread: true, noRecoil: true });
 s.step({ aimX: 1, aimZ: 0, aimPointX: 30, aimPointZ: -10, fire: true });
 const packed = pack(s);
 assert.ok(Number.isFinite(packed.bullets[0].stop));
 const mirror = new ProjectileMirror();
 mirror.update({ 1: packed }, 0);
 const drawn = mirror.lists(.1).rifleBullets[0];
 assert.ok(drawn.travel <= packed.bullets[0].stop + 1e-9);
 // Flat maps pack no stop at all.
 const flat = new Simulation(maps.deadwater); flat.weapon = 'rifle'; flat.reset();
 flat.step({ aimX: 1, aimZ: 0, fire: true });
 assert.equal(pack(flat).bullets[0].stop, undefined);
 // The fingerprint.
 assert.match(mapHash(map), /^[0-9a-f]{8}$/);
 assert.notEqual(mapHash(map), mapHash(maps.deadwater));
 const net = createLoopback(), createSim = m => new Simulation(m);
 new HostSession({ transport: net.host('ABCDE'), map, local: createSim(map), createSim, now: () => 0 });
 const wrong = new ClientSession({ transport: net.join('ABCDE'), map: maps.deadwater, local: createSim(maps.deadwater), createSim, now: () => 0 });
 const right = new ClientSession({ transport: net.join('ABCDE'), map, local: createSim(map), createSim, now: () => 0 });
 net.flush();
 assert.match(wrong.ended || '', /different map/);
 assert.equal(right.welcomed, true);
 // A mirrored round's object taken over by a round with no stop drops the old one's.
 const reuse = new ProjectileMirror();
 reuse.update({ 1: { bullets: [{ x: 0, z: 0, dx: 1, dz: 0, travel: 2, stop: 6 }] } }, 0);
 reuse.update({ 1: { bullets: [{ x: 5, z: 1, dx: 1, dz: 0, travel: 1 }] } }, .05);
 assert.equal(reuse.lists(.05).rifleBullets[0].stop, undefined);
 // ...and its Surge glow (on every map).
 reuse.update({ 1: { bullets: [{ x: 0, z: 0, dx: 1, dz: 0, travel: 2, surge: 1 }] } }, .1);
 reuse.update({ 1: { bullets: [{ x: 5, z: 1, dx: 1, dz: 0, travel: 1 }] } }, .15);
 assert.equal(reuse.lists(.15).rifleBullets[0].surge, undefined);
 assert.ok(RIFLE.maxRange > 40, 'the rifle outranges Test Hill');
});

test('the ground never walks forever: runaway positions return at once', () => {
 const t0 = performance.now();
 assert.equal(ground.sightClear(-20, -15, Infinity, 5), true);
 assert.equal(ground.sightClear(-20, -15, 1e7, 5), true);
 assert.equal(ground.roundStop(0, 0, 1, 0, 1, 0, 1e7), Infinity);
 assert.equal(ground.roundStop(0, 0, 1, 0, 1, 0, Infinity), Infinity);
 assert.ok(performance.now() - t0 < 50);
});
