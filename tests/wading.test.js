// Hollow Wick's stream and its decks (owner, 2026-09-26): wade in anywhere
// (no barriers), at depths that vary along it; slower against the current
// (it runs right to left, west), quicker with it, a little slower across;
// dodges go shorter and stamina refills slower in it. Decks: you walk onto
// them from their ends, wade in under them from the water, and step off
// their sides into it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/simulation.js';
import { maps, groundFor, mapColliders } from '../src/maps.js';
import { WADE } from '../src/config/gameplay.js';
import { playerState, applyPlayerState } from '../src/net/protocol.js';
import { Arena } from '../src/net/arena.js';
import { blend } from '../src/net/host-session.js';

const map = maps['hollow-wick'], ground = groundFor(map);
const MID = [-40, 19.3], DRY = [20, 40];   // mid-stream; the scarecrow field
function sim(at) { const s = new Simulation(map); s.weapon = 'rifle'; s.reset(); s.targets = []; Object.assign(s.player, { x: at[0], z: at[1], vx: 0, vz: 0 }); return s; }
const walk = (s, mx, mz, ticks) => { for (let i = 0; i < ticks; i++) s.step({ moveX: mx, moveZ: mz, aimX: mx || 1, aimZ: mz }); return s.player; };
const moved = (at, p) => Math.hypot(p.x - at[0], p.z - at[1]);

test('the stream: no barriers, and its depth varies along it', () => {
 // Nothing stands in the water or along its banks but authored stone walls
 // (the mill dam's two faces, you walk along its top; the mill's foundation
 // at the pond's edge).
 // (Reeds on the banks are screens, walked and shot through: not barriers.)
 // (But the mill wheel and its sluice: solid, off the mill's south wall.)
 assert.equal(mapColliders(map).filter(c => ground.bankDistance(c.x, c.z) < 0 && !c.terrainEdge && !c.walkOver && !c.playerOnly && !c.streamWorks).length, 0, 'a collider in the stream');
 assert.ok(mapColliders(map).filter(c => c.streamWorks).every(c => c.x > 19 && c.x < 27 && c.z < 21), 'solid works only at the mill wheel');
 assert.ok(mapColliders(map).filter(c => ground.bankDistance(c.x, c.z) < 0 && c.terrainEdge).length <= 3, 'no barrier edges along the water');
 // Straight across it, bank to bank, in several places.
 for (const x of [-40, -30, -20, 30]) {
  const s = sim([x, 12]); let wet = 0;
  for (let i = 0; i < 200; i++) { s.step({ moveX: 0, moveZ: 1, aimX: 0, aimZ: 1 }); if (s.wadeShare() > 0) wet++; }
  assert.ok(s.player.z > 26 && wet > 20, `across at x ${x}: reached z ${s.player.z.toFixed(2)}, ${wet} ticks wet`);
 }
 // Deeper in places, shallower in others (the ford is barely wet).
 const depths = [];
 for (const [x, z] of [[-60, 16.8], [-40, 19.3], [-20, 22.1], [-2, 21.6], [30, 22.7]]) depths.push(ground.waterDepthAt(x, z));
 assert.ok(depths.every(d => d > 0), `dry mid-stream: ${depths}`);
 assert.ok(Math.max(...depths) - Math.min(...depths) > .3, `depths ${depths.map(d => d.toFixed(2))}`);
});

test('wading: slower against the current (east), quicker with it (west), a little slower across', () => {
 const s = sim(MID), share = s.wadeShare(), flow = ground.flowAt(MID[0], MID[1]);
 assert.ok(share > .8, `share ${share}`);
 assert.ok(flow.x < -.95, `the stream runs west here: ${flow.x}`);
 const withIt = s.wadeFactor(flow.x, flow.z), against = s.wadeFactor(-flow.x, -flow.z), across = s.wadeFactor(-flow.z, flow.x);
 assert.ok(Math.abs(across - (1 - WADE.slow * share)) < 1e-9, `across ${across}`);
 assert.ok(across < .9 && against < across * .8 && withIt > across * 1.2, `with ${withIt} across ${across} against ${against}`);
 // Walked: half a second each way from the same spot.
 const west = moved(MID, walk(sim(MID), -1, 0, 30)), east = moved(MID, walk(sim(MID), 1, 0, 30)), dry = moved(DRY, walk(sim(DRY), -1, 0, 30));
 assert.ok(east < west * .7 && east < dry * .7, `east ${east} west ${west} dry ${dry}`);
 assert.ok(west > dry * .98, `with the current ${west} vs dry ${dry}`);
});

test('wading: a dodge goes shorter, and stamina refills slower', () => {
 const dodge = at => { const s = sim(at); s.step({ moveX: -1, moveZ: 0, dodge: true, aimX: -1, aimZ: 0 }); for (let i = 0; i < 25; i++) s.step({ moveX: 0, moveZ: 0, aimX: -1, aimZ: 0 }); return moved(at, s.player); };
 const wet = dodge(MID), dry = dodge(DRY), share = sim(MID).wadeShare();
 assert.ok(wet < dry * (1 - WADE.dodge * share * .8) && wet > dry * (1 - WADE.dodge) - .05, `dodge wet ${wet} dry ${dry}`);
 const refill = at => { const s = sim(at); s.player.stamina = 0; s.player.staminaWait = 0; for (let i = 0; i < 60; i++) s.step({ moveX: 0, moveZ: 0, aimX: 1, aimZ: 0 }); return s.player.stamina; };
 const w = refill(MID), d = refill(DRY);
 assert.ok(w < d * (1 - WADE.recharge * share * .8) && w > d * (1 - WADE.recharge) - .01, `stamina wet ${w} dry ${d}`);
});

test('decks: onto them from their ends, under them from the water, off their sides into it', () => {
 // Every deck's ends lie on the banks (within a step of its top), its middle
 // over the water.
 for (const [k, deck] of ground.decks.entries()) {
  const xs = deck.poly.map(p => p[0]), zs = deck.poly.map(p => p[1]), cx = xs.reduce((a, b) => a + b) / 4, cz = zs.reduce((a, b) => a + b) / 4;
  assert.equal(ground.deckAt(cx, cz), k);
  assert.ok(ground.drawnHeightAt(cx, cz) < deck.h - 1, `${k}: over the water`);
 }
 // Along the bridge from the north bank to the south: on top all the way.
 const s = sim([-14, 14]);
 for (let i = 0; i < 240 && s.player.z < 30; i++) {
  s.step({ moveX: 0, moveZ: 1, aimX: 0, aimZ: 1 });
  if (ground.deckAt(s.player.x, s.player.z) >= 0) { assert.ok(!s.player.below, `under the bridge at z ${s.player.z}`); assert.equal(s.standY(), ground.heightAt(s.player.x, s.player.z)); }
 }
 assert.ok(s.player.z >= 29.5, `stopped at z ${s.player.z}`);
 // Wading in under it from the west: under it, standing in the water.
 const u = sim([-20, 22.1]); walk(u, 1, 0, 95);
 assert.ok(ground.deckAt(u.player.x, u.player.z) === 0 && u.player.below, `at x ${u.player.x}: below ${u.player.below}`);
 assert.ok(u.standY() < 0 && u.wadeShare() > .8, `stands at ${u.standY()}`);
 assert.equal(u.ownGround(), u.standY());
 // On under it and out the east side: back in the open stream.
 walk(u, 1, 0, 60);
 assert.ok(u.player.x > -12.5 && !u.player.below && u.wadeShare() > .5, `out at x ${u.player.x}`);
 // Walking south under it, the bank rises toward its far end: its abutment
 // stops you under the deck (owner, stage 5 review: you walked straight up
 // out through its end)...
 const v = sim([-14, 21]); v.player.below = true; walk(v, 0, 1, 150);
 assert.ok(v.player.below && v.player.z < 27 && ground.drawnHeightAt(v.player.x, v.player.z) <= 1.25 - WADE.under + .02, `stopped at z ${v.player.z}: below ${v.player.below}`);
 // ...so you go out from under a side, sliding along it, and up the bank round the end.
 walk(v, 1, 1, 200);
 assert.ok(!v.player.below && v.player.x > -12.5 && v.player.z > 27, `round the end at ${v.player.x}, ${v.player.z}`);
 // Stepping off its side from the top: down into the water.
 const o = sim([-14, 22]); walk(o, 1, 0, 30);
 assert.ok(o.player.x > -12.5 && !o.player.below && o.standY() < 0 && o.wadeShare() > .5, `off the side at x ${o.player.x}: ${o.standY()}`);
});

test('network: a player under a deck says so', () => {
 const s = sim([-20, 22.1]); walk(s, 1, 0, 95);
 const state = playerState('a', s.player);
 assert.equal(state.below, 1);
 const copy = { x: 0, z: 0 }; applyPlayerState(copy, state); assert.equal(copy.below, true);
 applyPlayerState(copy, playerState('a', { ...s.player, below: false })); assert.equal(copy.below, false);
 assert.equal('below' in playerState('b', sim(DRY).player), false);
});

test('online: a body wading under a deck is hit along the stream, not from the deck top, and is listed under it', () => {
 const run = (ax, az, aimX, aimZ) => {
  const arena = new Arena({ map, createSim: m => new Simulation(m), random: () => .5, settings: { robots: 'off' } });
  const A = arena.addSeat('a', 'A'), B = arena.addSeat('b', 'B');
  arena.startRound('ffa'); arena.choose('a', 'rifle'); arena.choose('b', 'static');
  const pa = A.sim.player, pb = B.sim.player;
  Object.assign(pa, { x: ax, z: az, vx: 0, vz: 0, aimX, aimZ });
  Object.assign(pb, { x: -14, z: 22.1, vx: 0, vz: 0, aimX: -1, aimZ: 0, below: true });
  const hp0 = pb.hp;
  for (let i = 0; i < 120; i++) {
   arena.stepSeat(A, { aimX, aimZ, fire: i % 30 < 2, moveX: 0, moveZ: 0 });
   arena.stepSeat(B, { aimX: -1, aimZ: 0, moveX: 0, moveZ: 0 });
   arena.endTick();
  }
  assert.equal(pb.below, true);
  return hp0 - pb.hp;
 };
 assert.ok(run(-19, 22.1, 1, 0) > 0, 'along the stream, under the deck: hit');
 assert.equal(run(-14, 17.5, 0, 1), 0, 'along the deck top: the round flies over');
 const listed = blend('b', 'B', { x: 0, z: 0, aimX: 1, aimZ: 0 }, { x: 1, z: 0, aimX: 1, aimZ: 0, below: 1 }, .5);
 assert.equal(listed.below, true);
 assert.equal('below' in blend('b', 'B', { x: 0, z: 0, aimX: 1, aimZ: 0 }, { x: 1, z: 0, aimX: 1, aimZ: 0 }, .5), false);
});

test('a body pushed into a deck\'s outline from the water stays under it; orbs are not stopped by decks', () => {
 const s = sim([-12.3, 22]); s.otherPlayers = [{ x: -11.75, z: 22, hp: 500 }];
 for (let i = 0; i < 10; i++) s.step({ moveX: 0, moveZ: 0, aimX: 1, aimZ: 0 });
 if (ground.deckAt(s.player.x, s.player.z) >= 0) assert.equal(s.player.below, true, `pushed to ${s.player.x}`);
 assert.ok(s.standY() < 0, `stands at ${s.standY()}`);
 // Static placing an orb east from the water beside the bridge: no wall.
 const o = new Simulation(map); o.weapon = 'static'; o.reset(); o.targets = []; Object.assign(o.player, { x: -16.6, z: 22.1, vx: 0, vz: 0, aimX: 1, aimZ: 0 });
 o.step({ aimX: 1, aimZ: 0, seed: true });
 for (let i = 0; i < 20; i++) o.step({ aimX: 1, aimZ: 0 });
 assert.equal(o.drainEvents().some(e => e.type === 'wall'), false, 'an orb stopped at the deck');
});

test('what a wader makes under a deck is drawn under it with them, and nobody else is', async () => {
 const { groundY, floorY, UNDER_REACH } = await import('../src/render/ground-lift.js');
 const { WorldView } = await import('../src/render/renderer.js');
 const { OrbBeams } = await import('../src/effects/orb-beams.js');
 const THREE = await import('three');
 const at = [-14, 22], k = ground.deckAt(...at), top = ground.heightAt(...at), bed = ground.drawnHeightAt(...at);
 assert.ok(k >= 0 && top > bed + .5, 'a deck well over the water');
 // A stand-in view with the renderer's own rule: you, and another player.
 const other = { root: { position: new THREE.Vector3(100, 0, 100) }, under: false };
 const view = { ground, playerUnder: false, player: { position: new THREE.Vector3(...[at[0], bed, at[1]]) }, remote: { anyUnder: false, avatars: new Map([['p', other]]) } };
 view.underNear = WorldView.prototype.underNear;
 // Nobody under: the deck's top, as before.
 assert.equal(groundY(view, at[0] + 1, at[1]), top);
 // You wading under it: what is made by you (a casing, smoke, an orb) is down with you...
 view.playerUnder = true;
 assert.equal(groundY(view, at[0] + 1, at[1]), ground.drawnHeightAt(at[0] + 1, at[1]));
 // ...not what is further off, nor anything outside the deck (the same ground there anyway).
 const far = [at[0], at[1] + UNDER_REACH + .5];
 if (ground.deckAt(...far) >= 0) assert.equal(groundY(view, ...far), ground.heightAt(...far));
 // Someone up on the deck by you: what they make stays on the deck.
 other.root.position.set(at[0] + 1.2, top, at[1]); other.under = false;
 assert.equal(groundY(view, at[0] + 1.3, at[1]), top, 'up on the planks with them');
 // Another player wading under it (you elsewhere).
 view.playerUnder = false; view.player.position.set(200, 0, 200); other.under = true; view.remote.anyUnder = true;
 assert.equal(groundY(view, at[0] + 1.3, at[1]), ground.drawnHeightAt(at[0] + 1.3, at[1]));
 // An orb's streak keeps the side it was fired from all along.
 view.scene = new THREE.Scene();
 const beams = new OrbBeams(view); beams.add(at[0], at[1], at[0] + 1.4, at[1], true); beams.update(1 / 60);
 const m = new THREE.Matrix4(), p = new THREE.Vector3(); beams.mesh.getMatrixAt(0, m); p.setFromMatrixPosition(m);
 assert.ok(p.y < top, `the streak under the deck (${p.y.toFixed(2)} vs the top ${top})`);
 assert.ok(Math.abs(p.y - (.72 + floorY(view, p.x, p.z, true))) < .15);
 // Every other map: nothing changes.
 assert.equal(groundY({ ground: { flat: true } }, 1, 2), 0);
});

test('a body that falls wading under a deck lies in the water there, not on the planks', async () => {
 const { floorY } = await import('../src/render/ground-lift.js');
 const s = sim([-14, 22]); s.player.below = true;
 s.events.length = 0; s.damagePlayer(9999, 'test');
 const death = s.events.find(e => e.type === 'playerDeath');
 assert.ok(death && death.below === true, 'the death says it was under the deck');
 const view = { ground };
 assert.equal(floorY(view, death.x, death.z, death.below), ground.drawnHeightAt(death.x, death.z));
 assert.ok(floorY(view, death.x, death.z, false) > floorY(view, death.x, death.z, true) + .5, 'the deck is well over the water');
 // (On the deck, or anywhere on a flat map, nothing changes.)
 const top = sim([-14, 22]); top.events.length = 0; top.damagePlayer(9999, 'test');
 assert.equal(top.events.find(e => e.type === 'playerDeath').below, undefined);
});

test('under any deck, both ends are shut: you go no further than its abutments and leave from a side', () => {
 for (const [k, deck] of ground.decks.entries()) {
  const xs = deck.poly.map(p => p[0]), zs = deck.poly.map(p => p[1]), cx = xs.reduce((a, b) => a + b) / 4, cz = zs.reduce((a, b) => a + b) / 4;
  const [a, b, c] = deck.poly, ab = Math.hypot(b[0] - a[0], b[1] - a[1]), bc = Math.hypot(c[0] - b[0], c[1] - b[1]);
  const [p, q] = ab > bc ? [a, b] : [b, c], l = Math.hypot(q[0] - p[0], q[1] - p[1]), ux = (q[0] - p[0]) / l, uz = (q[1] - p[1]) / l;
  for (const way of [1, -1]) {
   const s = sim([cx, cz]); s.player.below = true; walk(s, ux * way, uz * way, 200);
   const pl = s.player, floor = ground.drawnHeightAt(pl.x, pl.z);
   assert.ok(pl.below && ground.deckAt(pl.x, pl.z) === k, `${k} ${way}: out at ${pl.x.toFixed(2)}, ${pl.z.toFixed(2)} (below ${pl.below})`);
   assert.ok(floor <= deck.h - WADE.under + .02, `${k} ${way}: up to ${floor.toFixed(2)} under a top at ${deck.h}`);
   // Across: out from under its side, back in the open.
   walk(s, uz, -ux, 80);
   assert.ok(ground.deckAt(s.player.x, s.player.z) !== k && !s.player.below, `${k} ${way}: still under at ${s.player.x.toFixed(2)}, ${s.player.z.toFixed(2)}`);
  }
 }
});
