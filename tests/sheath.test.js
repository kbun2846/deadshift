// Sheath's rules (weapons/sheath.js): heavy slashes, dash buffering, Gold
// Rush, the Draw-cut, blade blood, the network fields.
import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/simulation.js';
import { SHEATH as S, ICHOR, RULES } from '../src/config/gameplay.js';
import { nextSheathSwing, SHEATH_SWINGS, SHEATH_DRAW, sheathDamage, sheathCutForce } from '../src/weapons/sheath.js';
import { playerInput, movementInput, loadout, applyLoadout, playerState, PROTOCOL_VERSION } from '../src/net/protocol.js';

const map = { id: 'sheath-test', width: 90, depth: 90, spawn: { x: 0, z: 0 }, buildings: [], fences: [], props: [], targets: [] };
const make = () => { const s = new Simulation(map); s.weapon = 'sheath'; s.player.id = 'you'; s.player.stamina = s.maxStamina; return s; };
const target = (id = 'victim', x = 1.8, z = 0, kind = 'player') => ({ id, kind, x, z, baseX: x, spawnX: x, spawnZ: z, hp: 400, maxHp: 400, flash: 0, respawn: 0 });
const run = (s, n, input = {}) => { for (let i = 0; i < n; i++) s.step({ aimX: 1, aimZ: 0, ...input }); };
const ticks = seconds => Math.round(seconds / RULES.step);

test('a slash lands after its wind-up for 15 to 17, once per swing per body', () => {
 const s = make(), t = target();
 s.targets = [t];
 run(s, 1, { fire: true });
 assert.equal(t.hp, 400, 'nothing lands on the press');
 run(s, ticks(S.drawWindup) - 3);
 assert.equal(t.hp, 400, 'the draw-slash wind-up');
 run(s, ticks(S.hitWindow) + 4);
 const dealt = 400 - t.hp;
 assert.ok(dealt >= S.damage - S.damageRoll - 1e-9 && dealt <= S.damage + S.damageRoll + 1e-9, 'one hit, rolled: ' + dealt);
 run(s, 10);
 assert.equal(400 - t.hp, dealt, 'the hit window never hits the same body twice');
 for (let i = 0; i < 200; i++) { const d = sheathDamage(); assert.ok(d >= S.damage - S.damageRoll - 1e-9 && d <= S.damage + S.damageRoll + 1e-9 && Math.abs(d * 5 - Math.round(d * 5)) < 1e-9, 'whole fifths of a point: ' + d); }
});

test('the swing cycle is clearly slower than Ichor and kills 100 health in about 3 to 3.5 s', () => {
 assert.ok(S.interval >= ICHOR.interval * 1.25);
 assert.ok(S.windup > .08 && S.windup < .12 && S.hitWindow >= .07 && S.hitWindow <= .09);
 const s = make(), t = { ...target(), hp: 100, maxHp: 100 };
 s.targets = [t];
 let n = 0;
 while (t.hp > 0 && n < 600) { run(s, 1, { fire: true }); n++; }
 const seconds = n * RULES.step;
 assert.ok(seconds > 2.9 && seconds < 3.8, 'time to kill ' + seconds.toFixed(2) + ' s');
});

test('the arc is wide, reaches past Ichor, and every body in it is cut', () => {
 const s = make(), a = target('a', 2.2, 0), b = target('b', 1.2, 1.4), c = target('c', 1.2, -1.4), back = target('back', -1.8, 0), far = target('far', 3.4, 0);
 s.targets = [a, b, c, back, far];
 run(s, 1, { fire: true }); run(s, 30);
 for (const t of [a, b, c]) assert.ok(t.hp < 400, t.id + ' is cut');
 assert.equal(back.hp, 400, 'not behind');
 assert.equal(far.hp, 400, 'not out of reach');
 assert.ok(S.range > ICHOR.range);
 assert.ok(S.arcs.every(a => a > 1.2 && a < 2.5));
});

test('a solid wall between stops a cut; a body at another height is missed', () => {
 const s = make(), t = target();
 s.targets = [t];
 s.colliders = [{ x: .9, z: 0, w: .2, d: 3 }];
 run(s, 1, { fire: true }); run(s, 30);
 assert.equal(t.hp, 400);
});

test('swings chain from where the last one ended, never repeat and never loop', () => {
 const s = { out: false, history: [] };
 assert.equal(nextSheathSwing(s), SHEATH_DRAW, 'out of the sheath: the draw-slash');
 s.out = true;
 let seq = [];
 for (let i = 0; i < 400; i++) {
  const v = nextSheathSwing(s);
  const last = s.history.at(-1);
  if (last != null) {
   assert.notEqual(v, last, 'never the same twice');
   assert.equal(SHEATH_SWINGS[v].from, SHEATH_SWINGS[last].to, 'starts where the last ended');
  }
  s.history.push(v); if (s.history.length > 4) s.history.shift(); seq.push(v);
 }
 assert.deepEqual([...new Set(seq)].sort(), [0, 1, 2, 3, 4, 5], 'all six swings come up');
 // No fixed loop: the same 4-swing run does not keep repeating.
 const runs = new Set(); for (let i = 0; i + 4 <= seq.length; i += 4) runs.add(seq.slice(i, i + 4).join());
 assert.ok(runs.size > 8);
});

test('an attack pressed during a dash waits and fires as the dash ends; never mid-dash', () => {
 const s = make(), t = target('t', 5, 0);
 s.targets = [t];
 run(s, 1, { dodge: true, moveX: 1 });
 assert.ok(s.player.dodgeRemaining > 0);
 run(s, 1, { tapFire: true, moveX: 1 });
 let swungMidDash = false;
 while (s.player.dodgeRemaining > 0) { run(s, 1, { moveX: 1 }); if (s.sheath.swing > 0 && s.player.dodgeRemaining > 0) swungMidDash = true; }
 assert.equal(swungMidDash, false);
 run(s, 1);
 assert.ok(s.sheath.swing > 0, 'the buffered attack goes as the dash ends');
});

test('two dashes, refilling at Ichor\'s rate', () => {
 const s = make();
 assert.equal(s.maxStamina, 2);
 assert.equal(s.staminaRate, 1 / ICHOR.dashRechargeScale);
});

test('walking while slashing is a little slower; Gold Rush is 35% faster for 3 s and cools 12 s', () => {
 const speed = (setup, input = {}) => { const s = make(); setup(s); run(s, 60, { moveX: 1, ...input }); return Math.hypot(s.player.vx, s.player.vz); };
 const plain = speed(() => {}), slashing = speed(() => {}, { fire: true });
 assert.ok(slashing < plain * .97 && slashing > plain * .75, 'slashing ' + slashing.toFixed(2) + ' vs ' + plain.toFixed(2));
 const s = make();
 run(s, 1, { sheathE: true });
 assert.equal(s.sheath.rush > 0, true);
 assert.equal(s.sheath.eCooldown, S.eCooldown);
 run(s, 60, { moveX: 1 });
 assert.ok(Math.abs(Math.hypot(s.player.vx, s.player.vz) / plain - S.rushSpeed) < .03);
 run(s, ticks(S.rushDuration));
 assert.equal(s.sheath.rush, 0);
 const events = s.drainEvents().map(e => e.type);
 assert.ok(events.includes('sheathRush') && events.includes('sheathRushEnd'));
 run(s, 1, { sheathE: true });
 assert.equal(s.sheath.rush, 0, 'still cooling down');
 run(s, 1, { fire: true }); assert.ok(s.sheath.swing > 0, 'attacks during it');
});

// Ticks from the press to the end of the dash (the line from where the hop ends).
const dashTicks = (length = S.xRange) => ticks(S.xBack + S.xTell) + Math.ceil((length - S.xShort) / (S.xDashSpeed * RULES.step)) + 3;

test('the Draw-cut hops back, sets, then dashes along the way you faced, cutting everyone it passes once for 58 to 62', () => {
 const s = make(), a = target('a', 2.5, .3), b = target('b', 4.5, -.4), off = target('off', 3, 2.2), past = target('past', 9, 0);
 s.targets = [a, b, off, past];
 const stamina = s.player.stamina;
 run(s, 1, { sheathX: true });
 assert.equal(s.sheath.x.phase, 'back');
 run(s, ticks(S.xBack) + 1, { aimX: 0, aimZ: 1 });
 assert.equal(s.sheath.x.phase, 'tell');
 assert.ok(Math.abs(s.player.x + S.xBackDist) < .05, 'hopped back: ' + s.player.x.toFixed(2));
 const tell = s.drainEvents().find(e => e.type === 'sheathDrawTell');
 assert.ok(tell && tell.dx === 1 && Math.abs(tell.length - S.xRange) < .1, 'the line shown, along the facing at the press');
 assert.equal(a.hp, 400, 'nothing cut during the set');
 run(s, dashTicks() - ticks(S.xBack) - 1, { aimX: 0, aimZ: 1 });
 assert.ok(Math.abs(s.player.x - (-S.xBackDist + S.xRange - S.xShort)) < .3, 'lands just short of the end: ' + s.player.x.toFixed(2));
 assert.equal(s.player.z, 0, 'straight, whatever the aim did after');
 for (const t of [a, b]) { const dealt = 400 - t.hp; assert.ok(dealt >= 58 - 1e-9 && dealt <= 62 + 1e-9, t.id + ' ' + dealt); }
 assert.equal(off.hp, 400); assert.equal(past.hp, 400);
 assert.equal(s.player.stamina, stamina, 'no dash charge is used');
 assert.ok(!s.drainEvents().some(e => e.type === 'dodge'), 'not a dash');
 const hp = a.hp; run(s, 60); assert.equal(a.hp, hp, 'once each');
 assert.equal(s.sheath.xCooldown > S.xCooldown - 3, true);
 run(s, ticks(S.xStrike + S.xFlourish) + 2);
 assert.equal(s.sheath.x, null); assert.equal(s.sheath.out, false, 'back in the sheath');
});

test('the Draw-cut can be dodged: step off the line during the set and it misses', () => {
 const s = make(), t = target('t', 5, 0);
 s.targets = [t];
 run(s, 1, { sheathX: true });
 run(s, ticks(S.xBack + S.xTell) - 2);
 t.z = 2; t.x = 5;
 run(s, dashTicks());
 assert.equal(t.hp, 400, 'nothing cut');
 const far = make(), u = target('u', 5, 0);
 far.targets = [u];
 run(far, 1, { sheathX: true }); run(far, dashTicks());
 assert.ok(u.hp < 400, 'but cut when it stays');
});

test('the Draw-cut stops at the first solid wall and cuts the breakables on its line', () => {
 const s = make();
 s.colliders = [{ x: 4, z: 0, w: .4, d: 4 }];
 run(s, 1, { sheathX: true }); run(s, dashTicks());
 assert.ok(s.player.x < 4 - .2 - RULES.radius + .01, 'stopped short of the wall: ' + s.player.x.toFixed(2));
 const withProp = new Simulation({ ...map, props: [{ id: 'crate', type: 'crate', x: 3, z: 0, angle: 0 }] });
 withProp.weapon = 'sheath';
 const prop = withProp.props[0];
 assert.ok(prop.hp > 0, 'a breakable crate');
 {
  run(withProp, 1, { sheathX: true }); run(withProp, dashTicks());
  assert.equal(prop.hp, 0, 'cut apart');
  assert.ok(withProp.player.x > 3.5, 'and passed');
 }
});

test('the Draw-cut roots you until its flourish; you cannot dash out of it', () => {
 const s = make();
 run(s, 1, { sheathX: true });
 run(s, 3, { moveX: 1, dodge: true });
 assert.equal(s.player.dodgeRemaining, 0, 'not during the hop');
 run(s, dashTicks());
 const x = s.player.x;
 run(s, 5, { moveX: -1, dodge: true });
 assert.equal(s.player.x, x);
 assert.equal(s.player.dodgeRemaining, 0);
});

test('blade blood builds on people (not robots), in stages, and resets on respawn', () => {
 const s = make(), person = target('p', 1.8, .3), robot = target('r', 1.8, -.3, 'robot');
 s.targets = [person, robot];
 run(s, 1, { fire: true }); run(s, 40);
 assert.equal(s.sheath.blood, S.bloodPerHit, 'one person hit: one stage step (robots add none)');
 for (let i = 0; i < 20; i++) { run(s, 1, { fire: true }); run(s, 30); }
 assert.equal(s.sheath.blood, 1, 'full');
 s.respawn({ x: 0, z: 0 }, 'you');
 assert.equal(s.sheath.blood, 0);
});

test('back into the sheath after 1.5 s without attacking; the first swing is the draw', () => {
 const s = make();
 run(s, 1, { fire: true });
 const first = s.drainEvents().find(e => e.type === 'sheathSwing');
 assert.equal(first.draw, true); assert.equal(first.variant, SHEATH_DRAW);
 assert.equal(s.sheath.out, true);
 run(s, ticks(S.interval + S.sheatheDelay) + 2);
 assert.equal(s.sheath.out, false);
 assert.ok(s.drainEvents().some(e => e.type === 'sheathSheathe'));
});

test('death clears a swing, a rush and a Draw-cut; the killing hit carries its damage type', () => {
 const s = make(), t = { ...target(), hp: 6, maxHp: 100 };
 s.targets = [t];
 run(s, 1, { fire: true }); run(s, 20);
 const kill = s.drainEvents().find(e => e.type === 'kill');
 assert.equal(kill.damageType, 'blade');
 run(s, 1, { sheathE: true, sheathX: true });
 s.killPlayer(null, 'blade');
 assert.equal(s.sheath.rush, 0); assert.equal(s.sheath.x, null);
});

test('cut force follows the blade across the body', () => {
 const f = sheathCutForce(0, 1, 0, 1, 0), g = sheathCutForce(1, 1, 0, 1, 0);
 assert.ok(f.z * g.z < 0, 'right-to-left and left-to-right throw opposite ways');
});

test('network: protocol bumped, presses cleaned, E/X predicted, state and loadout carried', () => {
 assert.ok(PROTOCOL_VERSION >= 17);
 assert.ok(PROTOCOL_VERSION >= 24, 'joiners predict Gold Rush from SHEATH.rushSpeed: the 2026-09-30 balance pass changed it, so 24 keeps older builds out');
 const clean = playerInput({ sheathE: 1, sheathX: 'yes', fire: 1 });
 assert.equal(clean.sheathE, true); assert.equal(clean.sheathX, true);
 assert.equal(movementInput({ sheathX: true }, 'sheath').sheathX, true);
 assert.equal(movementInput({ sheathX: true }, 'rifle').sheathX, undefined);
 const s = make();
 run(s, 1, { sheathE: true, fire: true });
 const state = playerState('you', s.player);
 assert.ok(state.sheath && state.sheath.rush > 0 && state.sheath.out);
 const l = JSON.parse(JSON.stringify(loadout(s))), other = make();
 applyLoadout(other, l);
 assert.equal(other.sheath.eCooldown, s.sheath.eCooldown);
});

import * as THREE from 'three';
import { makeSheath, poseSheath, applySheathBody } from '../src/weapons/sheath-model.js';
import { sheathSwingPose, SHEATH_SWING_COUNT, GUARD_L, GUARD_R, SHEATHED, sheathStrike } from '../src/weapons/sheath-motion.js';
import { SheathView } from '../src/weapons/sheath-view.js';
import { RiflePose } from '../src/weapons/rifle-pose.js';
import { DeathView } from '../src/effects/death-view.js';
import { deathReaction } from '../src/effects/death-reactions.js';
import { BotMatch } from '../src/bots/bot-match.js';
import { maps } from '../src/maps.js';

test('a body on the far side of the swing is cut after one on the near side', () => {
 const s = make(), right = target('right', 1.3, 1.2), left = target('left', 1.3, -1.2);
 s.targets = [right, left];
 // Force a right-to-left swing (the first is the draw, left to right).
 s.sheath.out = true; s.sheath.history = [1];
 run(s, 1, { fire: true });
 assert.equal(s.sheath.variant % 2 === 0 || s.sheath.variant === 4, true);
 const order = [];
 for (let i = 0; i < 20; i++) { run(s, 1); for (const t of [right, left]) if (t.hp < 400 && !order.includes(t.id)) order.push(t.id); }
 // (+z is the player's right, facing +x.)
 assert.deepEqual(order, ['right', 'left']);
});

test('every swing flows: it starts on the guard the previous one ended on, the grip stays in reach', () => {
 const p = new THREE.Group(), body = new THREE.Group(), gun = new THREE.Group(), model = makeSheath();
 gun.position.set(.27, .74, -.46); gun.add(model); body.add(gun); p.add(body); p.userData = { body, gun };
 const arms = new RiflePose(p), out = new Array(11);
 for (let v = 0; v < SHEATH_SWING_COUNT; v++) {
  const start = sheathSwingPose(v, 0, out).slice(), end = sheathSwingPose(v, 1, out).slice();
  const near = (a, b) => a.every((x, i) => Math.abs(x - b[i]) < 1e-9);
  assert.ok(near(start, v === 6 ? SHEATHED : SHEATH_SWINGS[v].from > 0 ? GUARD_R : GUARD_L), 'swing ' + v + ' starts on its guard');
  assert.ok(near(end, SHEATH_SWINGS[v].to > 0 ? GUARD_R : GUARD_L), 'swing ' + v + ' ends on its guard');
  const [A, B] = sheathStrike(v); assert.ok(A < B);
  for (let i = 0; i <= 10; i++) {
   const state = { out: true, variant: v, serial: v + 1, duration: .46, swing: .46 * (1 - i / 10) };
   poseSheath(model, state, 10 + v + i * .1); poseSheath(model, state, 10 + v + i * .1 + .06);
   arms.update({ weapon: 'sheath', sheath: state, time: 0, grenadeThrowTime: -10 }, 0, 0, 0);
   for (const a of arms.arms) { assert.ok(a.upper.scale.y <= .33001); assert.ok(a.lower.scale.y <= .35001); }
  }
 }
 // Sheathed: the blade lies in the scabbard, the hands are off the grip.
 assert.equal(poseSheath(model, { out: false, swing: 0 }, 99).mode, 'resheathe', 'it goes back in first');
 const pose = poseSheath(model, { out: false, swing: 0 }, 100);
 assert.equal(pose.mode, 'sheathed'); assert.equal(pose.hands.rightGrip, false);
 applySheathBody(body, pose); assert.equal(body.position.x, 0);
});

test('blood stages show on the blade, one clone per avatar without sharing a stage', () => {
 const a = makeSheath(), b = a.clone();
 poseSheath(a, { out: true, swing: 0, blood: 1 }, 1); poseSheath(b, { out: true, swing: 0, blood: 0 }, 1);
 const shown = m => [0, 1, 2, 3].filter(i => m.getObjectByName('sheath-blood-' + i).visible).length;
 assert.equal(shown(a), 4); assert.equal(shown(b), 0);
 poseSheath(a, { out: true, swing: 0, blood: .3 }, 2); assert.equal(shown(a), 2);
});

test('the view draws trails, gold ribbons and the draw-cut line, and clears them', () => {
 const s = make(), player = new THREE.Group(), body = new THREE.Group(), gun = new THREE.Group();
 player.add(body); body.add(gun); player.userData = { body, gun };
 const scene = new THREE.Scene(); scene.add(player);
 const view = { player, scene, qualityName: 'performance', ground: s.ground, lastSim: s, rifleView: { pose: { update() {} } }, burst() {}, remotePlayers: [], kick: new THREE.Vector3(), shake: 0 };
 const fx = new SheathView(view);
 run(s, 1, { fire: true, sheathE: true });
 for (const e of s.drainEvents()) if (e.type.startsWith('sheath')) fx.event(e);
 for (let i = 0; i < 20; i++) { run(s, 1, { moveX: 1 }); fx.update(s, 1 / 60); }
 assert.ok(fx.ribbons.count > 0, 'trail and gold ribbon');
 run(s, 1, { sheathX: true });
 const seen = new Set();
 for (let i = 0; i < dashTicks(); i++) { run(s, 1); for (const e of s.drainEvents()) if (e.type.startsWith('sheath')) fx.event(e); for (const c of fx.cuts) seen.add(c.kind); fx.update(s, 1 / 60); }
 assert.ok(seen.has('tell') && seen.has('glint'), 'the tell and the glint');
 assert.ok(fx.cuts.some(c => c.kind === 'line'));
 assert.ok(fx.ghostList.length > 0, 'gold afterimages along the dash');
 assert.equal(fx.slashList.length, 1, 'the gold slash');
 assert.ok(fx.slashes.some(m => m.count > 0));
 fx.hit({ type: 'sheathHit', id: 'x', by: s.player.id, x: 1, z: 0, dx: 1, dz: 0, targetKind: 'robot' });
 assert.ok(fx.stop > 0, 'the attacker gets a hit-stop');
 assert.ok(fx.lines.length > 0, 'sparks off a robot');
 fx.clear();
 assert.ok(fx.meshes.every(m => m.count === 0));
});

test('blade deaths: a fallen body with one or two arms off, thrown, the weapon dropped, all freed', () => {
 assert.equal(deathReaction('blade').severed, true);
 assert.equal(deathReaction('bladeDraw').mode, 'corpse');
 for (const type of ['blade', 'bladeDraw']) for (let k = 0; k < 6; k++) {
  const p = new THREE.Group(), body = new THREE.Group(), gun = makeSheath();
  p.add(body); body.add(gun); p.userData = { body, gun };
  body.add(new THREE.Mesh(new THREE.BoxGeometry(.3, 1, .3), new THREE.MeshLambertMaterial()));
  const arms = new RiflePose(p); arms.update({ weapon: 'rifle', time: 0, grenadeThrowTime: -10, rifle: {} }, 0, 0, 0);
  const scene = new THREE.Scene(); scene.add(p);
  const death = new DeathView({ player: p, scene, qualityName: 'performance' });
  death.start({ type: 'playerDeath', damageType: type, x: 0, z: 0, aimX: 1, aimZ: 0, directionX: 1, directionZ: 0 });
  const corpse = death.corpse;
  assert.ok(corpse && corpse.severed.size >= 1 && corpse.limbs.pieces.length === corpse.severed.size);
  let armParts = 0; corpse.body.traverse(o => { if (o.isMesh && o.geometry === arms.arms[0].upper.geometry) armParts++; });
  assert.ok(armParts <= 4 - corpse.severed.size * 2, 'severed arms are not on the body');
  assert.ok(death.gun.children.length, 'the weapon is dropped');
  death.update(3); death.clear();
  assert.equal(scene.children.length, 1);
 }
});

test('a Sheath robot closes, slashes and uses its abilities', () => {
 const s = new Simulation(maps.deadwater); s.player.id = 'you'; s.dev.invulnerable = true;
 const bots = new BotMatch(maps.deadwater, { createSim: m => new Simulation(m), random: () => .4 });
 const bot = bots.spawn(s, 'sheath');
 bot.sim.player.x = s.player.x + 9; bot.sim.player.z = s.player.z;
 const seen = new Set();
 for (let i = 0; i < 60 * 25; i++) {
  bots.before(s); s.step({ aimX: 1, aimZ: 0 }); bots.after(s); bots.step(s);
  for (const { e } of bots.drain()) seen.add(e.type);
  s.drainEvents();
 }
 assert.ok(seen.has('sheathSwing'), 'it swings: ' + [...seen].join());
 assert.ok(seen.has('sheathRush') || seen.has('sheathVanish'), 'and uses E or X');
});

test('walks 2% faster sheathed, 12% slower with the sword out; a draw on the move is slower', () => {
 const walk = out => { const s = make(); s.sheath.out = out; run(s, 120, { moveX: 1 }); const x = s.player.x; run(s, 60, { moveX: 1 }); return s.player.x - x; };
 const rifle = new Simulation(map); rifle.weapon = 'rifle'; run(rifle, 120, { moveX: 1 }); const rx = rifle.player.x; run(rifle, 60, { moveX: 1 });
 const base = rifle.player.x - rx;
 assert.ok(Math.abs(walk(false) / base - S.sheathedMove) < .01, 'sheathed');
 const s = make(); s.sheath.out = true; s.sheath.idle = -99;
 run(s, 120, { moveX: 1 }); const x = s.player.x; run(s, 60, { moveX: 1 });
 assert.ok(Math.abs((s.player.x - x) / base - S.outMove) < .01, 'out: ' + ((s.player.x - x) / base).toFixed(3));
 const still = make(); run(still, 1, { fire: true }); const d0 = still.sheath.duration;
 const moving = make(); run(moving, 30, { moveX: 1 }); run(moving, 1, { fire: true, moveX: 1 });
 assert.ok(Math.abs(moving.sheath.duration / d0 - S.drawMoveSlow) < 1e-9 && moving.sheath.windup > S.drawWindup);
});

test('Gold Rush draws the sword, keeps it out, doubles the slash reach and lifts the walking penalty', () => {
 const s = make(), near = target('near', S.range * 1.7, 0);
 s.targets = [near];
 run(s, 1, { sheathE: true });
 assert.equal(s.sheath.out, true, 'drawn');
 assert.equal(s.drainEvents().find(e => e.type === 'sheathRush').draw, true);
 run(s, 1, { fire: true }); run(s, 40);
 assert.ok(near.hp < 400, 'cut at 1.7x the normal reach');
 assert.ok(s.drainEvents().find(e => e.type === 'sheathSwing').rush);
 run(s, ticks(1.2));
 assert.equal(s.sheath.out, true, 'not sheathed while it runs');
 const plain = make(), far = target('far', S.range * 1.7, 0);
 plain.targets = [far]; run(plain, 1, { fire: true }); run(plain, 40);
 assert.equal(far.hp, 400, 'out of reach without it');
 assert.equal(S.xCooldown, 35);
});
