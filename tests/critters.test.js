// Hollow Wick's goat can be killed (owner, 2026-09-29: "give the goat that
// lives in hollow wick gore and make its head drop in the pile of gore when
// its killed. it can be shot or killed with blades that pass through the
// fence"): src/critters.js, Simulation.step, world/hollow-life.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/simulation.js';
import { maps, mapColliders } from '../src/maps.js';
import { Critters, CRITTER } from '../src/critters.js';
import { PEN_INSIDE, GOAT } from '../src/world/goat-mind.js';
import { Arena } from '../src/net/arena.js';
import { carcassPile } from '../src/effects/gore.js';

const wick = maps['hollow-wick'];
const penOf = critters => critters.goats[0].pen;
const inPen = g => g.mind.corners().every(([x, z]) => Math.abs(x) <= PEN_INSIDE.hx - GOAT.margin + 1e-6 && Math.abs(z) <= PEN_INSIDE.hz - GOAT.margin + 1e-6);

test('Hollow Wick has its goat; other maps have none; it lives in its pen and stares at who comes near', () => {
 const c = new Critters(wick);
 assert.equal(c.goats.length, 1); assert.ok(c.any);
 assert.equal(new Critters(maps.deadwater).any, false);
 const pen = penOf(c), near = { x: pen.x + 6, z: pen.z + 1 };
 for (let i = 0; i < 60 * 20; i++) { c.tick(1 / 60, [near]); assert.ok(inPen(c.goats[0])); }
 assert.equal(c.goats[0].mind.state, 'stare');
 // The same seed as the view has always used: the menus' goat and the game's start alike.
 assert.equal(c.goats[0].seed, 1 + Math.round(Math.abs(pen.x * 13 + pen.z * 7)));
});

test('its pen stops bodies, not shots or blades', () => {
 const hurdles = mapColliders(wick).filter(b => b.propId === 'life-goat-pen');
 assert.equal(hurdles.length, 4);
 assert.ok(hurdles.every(b => b.playerOnly), 'the hurdles are body-only');
});

// A sim on Hollow Wick standing `gap` m east of the pen, aiming at the goat.
function beside(weapon, gap) {
 const s = new Simulation(wick), c = new Critters(wick);
 s.critters = c; s.weapon = weapon; s.player.id = 'you'; s.player.stamina = s.maxStamina;
 const g = c.goats[0], pen = g.pen;
 // Keep it still in the middle of its pen, side on.
 g.mind.x = 0; g.mind.z = 0; g.mind.heading = Math.PI / 2; g.mind.state = 'graze'; g.mind.timer = 1e9; c.place(g);
 s.player.x = pen.x + 1.8 + gap; s.player.z = pen.z;
 return { s, c, g };
}
const aimAt = (s, g) => { const dx = g.proxy.x - s.player.x, dz = g.proxy.z - s.player.z, d = Math.hypot(dx, dz); return { aimX: dx / d, aimZ: dz / d, aimPointX: g.proxy.x, aimPointZ: g.proxy.z }; };

test('shot over the hurdles it bleeds and dies: a goat kill, never a counted one', () => {
 const old = Math.random; Math.random = () => .5;
 try {
  const { s, c, g } = beside('rifle', 4);
  const events = [];
  for (let i = 0; i < 60 * 6 && !g.dead; i++) { g.mind.timer = 1e9; s.step({ ...aimAt(s, g), fire: true }); events.push(...s.events.splice(0)); }
  assert.ok(g.dead, 'the goat died: ' + g.proxy.hp);
  assert.ok(events.some(e => e.type === 'hit' && e.targetKind === 'goat'));
  const kill = events.find(e => e.type === 'kill' && e.targetKind === 'goat');
  assert.ok(kill && kill.id === g.id);
  assert.equal(s.stats.kills, 0, 'no kill counted');
  assert.ok(!s.targets.some(t => t.critter), 'never left among the targets');
  assert.ok(g.fell && Math.hypot(g.fell.x - g.proxy.x, g.fell.z - g.proxy.z) < 1);
  // Dead it stays: no more targets, no more mind.
  const was = { x: g.mind.x, z: g.mind.z };
  s.step({ ...aimAt(s, g), fire: true });
  assert.equal(c.targets(), null); assert.deepEqual({ x: g.mind.x, z: g.mind.z }, was);
  // A fresh world: back again, whole.
  s.resetWorld();
  assert.ok(!g.dead && g.proxy.hp === CRITTER.goatHealth);
 } finally { Math.random = old; }
});

test('cut through the hurdles with a blade it dies too', () => {
 const { s, g } = beside('sheath', .5);
 for (let i = 0; i < 60 * 6 && !g.dead; i++) { g.mind.timer = 1e9; s.player.stamina = s.maxStamina; s.step({ ...aimAt(s, g), fire: true }); s.events.length = 0; }
 assert.ok(g.dead, 'the goat died: ' + g.proxy.hp);
});

test('never a lock or aim-help target', () => {
 const { s, g } = beside('rifle', 3);
 s.targets = s.targets.concat(g.proxy);
 assert.ok(!s.assistTargets().includes(g.proxy));
});

test("online: the host's arena holds it, every seat's sim can hurt the one goat, joiners get where it is", () => {
 const arena = new Arena({ map: wick, createSim: m => new Simulation(m) });
 assert.ok(arena.critters?.any);
 const a = arena.addSeat('a', 'A'), b = arena.addSeat('b', 'B');
 assert.equal(a.sim.critters, arena.critters); assert.equal(b.sim.critters, arena.critters);
 const state = arena.critters.state();
 assert.equal(state.length, 1); assert.equal(state[0].length, 4); assert.equal(state[0][3], 0);
 const proxy = arena.critters.targets()[0];
 a.sim.hit(proxy, { damage: 10, owner: 'a' }); b.sim.hit(proxy, { damage: 25, owner: 'b' });
 arena.critters.after();
 assert.equal(arena.critters.state()[0][3], 1, 'dead for everyone');
 arena.resetWorld(); assert.equal(arena.critters.state()[0][3], 0);
});

test("its heap is one draw in the gore's own material", () => {
 const pile = carcassPile({ random: () => .4 });
 const meshes = []; pile.traverse(o => { if (o.isMesh) meshes.push(o); });
 assert.equal(meshes.length, 1);
 assert.ok(meshes[0].material.vertexColors && !meshes[0].material.transparent);
});

test("a joiner sees the host's goat where it stands, and sees it die", async () => {
 const { createLoopback } = await import('../src/net/transport.js');
 const { HostSession } = await import('../src/net/host-session.js');
 const { ClientSession } = await import('../src/net/client-session.js');
 const net = createLoopback(); let time = 0; const now = () => time;
 const createSim = m => new Simulation(m);
 const hostSim = createSim(wick), host = new HostSession({ transport: net.host('ABCDE'), map: wick, local: hostSim, createSim, now, name: 'Hosty', settings: { robots: 'off' } });
 const sim = createSim(wick), client = new ClientSession({ transport: net.join('ABCDE'), map: wick, local: sim, createSim, now, name: 'P0' });
 net.flush();
 const heard = [];
 const tick = () => { time += 1 / 60; hostSim.step(host.beforeLocal({})); sim.step(client.input({})); sim.drainEvents(); net.flush(); host.step(); hostSim.drainEvents(); net.flush(); heard.push(...(client.drainEvents?.() || [])); };
 host.startRound('ffa'); host.choose('static'); client.choose('static'); net.flush();
 for (let i = 0; i < 30; i++) tick();
 assert.equal(sim.critters, null, 'a joiner never hits it itself');
 const goat = host.arena.critters.goats[0], seen = client.critterState();
 assert.ok(seen && seen.length === 1 && seen[0][3] === 0);
 const w = host.arena.critters.where(goat);
 assert.ok(Math.hypot(seen[0][0] - w.x, seen[0][1] - w.z) < .2);
 // The host kills it.
 hostSim.hit(goat.proxy, { damage: 50, owner: hostSim.player.id });
 for (let i = 0; i < 30; i++) tick();
 assert.equal(client.critterState()[0][3], 1);
});
