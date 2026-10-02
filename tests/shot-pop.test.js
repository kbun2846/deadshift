// The pop pass (owner, 2026-10-01: "Make all weapon projectiles and actions
// from player and other players and bots more contrasting so they pop out a
// lot more."): src/render/shot-pop.js, tools/shot-contrast.mjs, AGENTS.md >
// The pop pass.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { POP, POP_GROUNDS, POP_VISUALS, hullGeometry } from '../src/render/shot-pop.js';
import { lab, hexRgb, READABLE, difference } from '../src/render/look-contrast.js';
import { popOn, worstOn, nearestTeam, BEFORE } from '../tools/shot-contrast.mjs';

const L = hex => lab(hexRgb(hex))[0];

test('every round and attack reads on every ground of every map, through its core or its rim', () => {
  for (const v of POP_VISUALS) for (const [map, grounds] of Object.entries(POP_GROUNDS)) for (const [name, hex] of Object.entries(grounds)) {
    const r = popOn(v, hex, map === 'lumen');
    assert.ok(r.reads >= READABLE.accent, `${v.label} on ${map}/${name}: ${r.reads.toFixed(1)}`);
  }
});

test('pale shots carry a dark rim that reads on the pale grounds, and the rim is far darker than the core', () => {
  for (const v of POP_VISUALS) {
    assert.ok(v.rim, `${v.label} has a rim`);
    assert.ok(L(v.core) - L(v.rim) >= 35, `${v.label}: core L* ${L(v.core).toFixed(0)} rim ${L(v.rim).toFixed(0)}`);
  }
  // Deadwater's sand and roads and the dusk's dry stalks are where a pale core
  // alone washes out: there the rim itself reads.
  for (const v of POP_VISUALS) for (const [map, ground] of [['deadwater', 'sand'], ['deadwater', 'street'], ['deadwater', 'road'], ['hollow-wick', 'stalks']]) {
    const r = popOn(v, POP_GROUNDS[map][ground]);
    assert.ok(r.rim >= READABLE.accent, `${v.label} rim on ${map}/${ground}: ${r.rim.toFixed(1)}`);
  }
});

test('no visual reads worse than before on any map, and the weak ones read much better', () => {
  // (Except an enemy's Static orb: it took your pale mint once launched, and
  // is now the deeper blue the owner asked for in v0.9b; it must still read
  // at 30 everywhere.)
  for (const map of Object.keys(POP_GROUNDS)) assert.ok(worstOn(POP_VISUALS.find(v => v.id === 'static-orb-enemy'), map).reads >= 30, map);
  for (const v of POP_VISUALS.filter(v => v.id !== 'static-orb-enemy')) for (const map of Object.keys(POP_GROUNDS)) {
    const before = worstOn({ ...BEFORE[v.id] }, map), after = worstOn(v, map);
    assert.ok(after.reads >= before.reads - .5, `${v.label} on ${map}: ${before.reads.toFixed(1)} -> ${after.reads.toFixed(1)}`);
  }
  // Omen's base round was an ember brown close to the sand; Sightline's
  // round was a .65 see-through grey-white.
  assert.ok(worstOn(POP_VISUALS.find(v => v.id === 'omen-round'), 'deadwater').reads > worstOn(BEFORE['omen-round'], 'deadwater').reads + 10);
  assert.ok(worstOn(POP_VISUALS.find(v => v.id === 'sightline-round'), 'deadwater').reads > worstOn(BEFORE['sightline-round'], 'deadwater').reads + 10);
});

test('shots never take a side colour, and an enemy\'s Static orb stays apart from yours', () => {
  for (const v of POP_VISUALS.filter(v => v.team)) {
    const n = nearestTeam(v.core);
    assert.ok(n.d >= 12, `${v.label} ${v.core} is ${n.d.toFixed(1)} from ${n.team}`);
  }
  assert.ok(difference(hexRgb(POP.static.core), hexRgb(POP.static.enemyCore)) >= 30);
  assert.ok(difference(hexRgb(POP.static.trail), hexRgb(POP.static.enemyTrail)) >= 25);
});

test('rounds got bigger and tracers longer', () => {
  assert.ok(POP.rifle.slug[0] / 1.3 >= 1.25 && POP.rifle.trailLength >= .6 && POP.rifle.trailRadius >= .03);
  assert.ok(POP.ballast.radius >= .07 && POP.sightline.length > 1.05 && POP.sightline.roundWidth > .048 && POP.sidekick.width > .035);
  assert.ok(POP.muzzle.rifle > .45 && POP.muzzle.ballast > 1 && POP.rifle.flash > 1 && POP.ballast.flash > 1);
});

test('hullGeometry: the core and an outward rim wound the other way, coloured per vertex, in one geometry', () => {
  const core = new THREE.IcosahedronGeometry(.1, 0), g = hullGeometry(core, { scale: 1.5, core: '#ffffff', rim: '#000000' });
  const n = core.index ? core.index.count : core.attributes.position.count, pos = g.attributes.position, col = g.attributes.color;
  assert.equal(g.index, null); assert.equal(pos.count, n * 2); assert.equal(col.count, n * 2);
  assert.equal(col.getX(0), 0); assert.equal(col.getX(n), 1);
  // The rim's first triangle faces in (its normal against the outward
  // direction), the core's out.
  const face = i => { const a = new THREE.Vector3().fromBufferAttribute(pos, i), b = new THREE.Vector3().fromBufferAttribute(pos, i + 1), c = new THREE.Vector3().fromBufferAttribute(pos, i + 2); const nrm = b.clone().sub(a).cross(c.clone().sub(a)); return nrm.dot(a.add(b).add(c)); };
  assert.ok(face(0) < 0 && face(n) > 0);
  const r = new THREE.Vector3().fromBufferAttribute(pos, 0).length(), c = new THREE.Vector3().fromBufferAttribute(pos, n).length();
  assert.ok(Math.abs(r / c - 1.5) < 1e-6);
});
