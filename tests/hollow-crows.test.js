// Hollow Wick's crows and soundscape (stage 3, s3-sound): the crows perch on
// real roofs, stones, posts and branches; scatter from shots, blasts and
// people within reach and not from further off; fewer on the lighter presets;
// come down to the dead after a while and leave when someone comes; go quiet
// after gunfire. The sound hooks: Hollow Wick gets its soundscape and its
// water sounds, Deadwater does not (and its audio.js path is unchanged).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { hollowWick } from '../src/maps/hollow-wick.js';
import { deadwater } from '../src/maps/deadwater.js';
import { groundFor, mapProps } from '../src/map-kit.js';
import { CROWS, CrowFlock, crowPerches, seededRandom, HANGING_TREE_BUILT_IN, SHOT_REACH } from '../src/effects/crow-rules.js';
import { hasCrows } from '../src/effects/crows.js';
import { HollowSound, hasHollowSound, bedLevels, HOLLOW_SOUND } from '../src/audio-hollow.js';
import { hollowAmbience } from '../src/hollow-ambience.js';

const ground = groundFor(hollowWick), heightAt = (x, z) => ground.heightAt(x, z);
const props = mapProps(hollowWick);
const perches = crowPerches(hollowWick, props, heightAt);
const turn = (x, z, a, lx, lz) => [x + lx * Math.cos(a) + lz * Math.sin(a), z - lx * Math.sin(a) + lz * Math.cos(a)];
const flockOf = (quality = 'balanced', seed = 7) => new CrowFlock(perches, { heightAt, random: seededRandom(seed), quality });
const run = (f, seconds, players = [{ x: -10, z: -2 }], interior = null) => { for (let t = 0; t < seconds; t += 1 / 30) f.update(1 / 30, { players, interior }); };

test('crows perch on real roofs, chimneys, the belfry, stones, posts, walls and branches', () => {
  const kinds = new Set(perches.map(p => p.kind));
  for (const k of ['ridge', 'chimney', 'belfry', 'headstone', 'tomb', 'post', 'wall', 'branch']) assert.ok(kinds.has(k), `no ${k} perches`);
  const byId = new Map(props.map(p => [p.id, p])), buildings = new Map(hollowWick.buildings.map(b => [b.id, b]));
  for (const p of perches) {
    assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z));
    assert.ok(ground.bankDistance(p.x, p.z) >= 0, `${p.kind} perch in the stream at ${p.x},${p.z}`);
    if (p.building) {
      const b = buildings.get(p.building), a = b.angle || 0;
      // In the building's frame, over its footprint (the belfry cap overhangs a little), at its roof's top.
      const dx = p.x - b.x, dz = p.z - b.z, lx = dx * Math.cos(a) - dz * Math.sin(a), lz = dx * Math.sin(a) + dz * Math.cos(a);
      assert.ok(Math.abs(lx) <= b.w / 2 + .4 && Math.abs(lz) <= b.d / 2 + .4, `${p.kind} perch off ${b.id}'s roof`);
      const top = b.baseY + b.height + b.roof.rise;
      if (p.kind === 'ridge') assert.ok(Math.abs(p.y - (top + .26)) < .01, `${b.id} ridge perch at ${p.y}, ridge ${top}`);
      else assert.ok(p.y > top && p.y < top + 3.5, `${p.kind} on ${b.id} at ${p.y}`);
    } else {
      const prop = byId.get(p.propId);
      assert.ok(prop, `perch on a missing prop ${p.propId}`);
      // (The hanging tree's low branch, where the hanged man's rope is tied, reaches 4.1 m.)
      assert.ok(Math.hypot(prop.x - p.x, prop.z - p.z) < (p.kind === 'branch' ? 4.5 : 3.5), `${p.kind} perch ${p.propId} too far from it`);
      const above = p.y - heightAt(p.x, p.z);
      if (p.kind === 'headstone') { assert.equal(prop.type, 'headstone'); assert.ok(above > .5 && above < 1.4, `headstone perch ${above} m up`); }
      if (p.kind === 'post' || p.kind === 'wall' || p.kind === 'tomb') assert.ok(above > .6 && above < 1.5, `${p.kind} perch ${above} m up`);
      if (p.kind === 'branch') { assert.equal(prop.type, 'hangingTree'); assert.ok(above > 3 && above < 7.5); }
    }
  }
  // The hanging tree's own three crows (world/hollow-props.js) are not doubled.
  const tree = props.find(p => p.type === 'hangingTree');
  for (const [lx, , lz] of HANGING_TREE_BUILT_IN) {
    const [x, z] = turn(tree.x, tree.z, tree.angle, lx, lz);
    assert.ok(perches.every(p => p.kind !== 'branch' || Math.hypot(p.x - x, p.z - z) > .6), 'a perch on a built-in crow');
  }
  // The meetinghouse's ridge and belfry carry crows.
  assert.ok(perches.filter(p => p.building === 'meetinghouse').length >= 4);
});

test('fewer crows on Potato and Performance; a preset change adds or removes them', () => {
  const counts = Object.fromEntries(Object.keys(CROWS.counts).map(q => [q, flockOf(q).perchedCount]));
  assert.deepEqual(counts, { ...CROWS.counts });
  assert.ok(counts.potato < counts.performance && counts.performance < counts.balanced && counts.balanced <= counts.quality && counts.quality <= counts.extreme);
  const f = flockOf('extreme'); f.setQuality('potato'); assert.equal(f.active.length, CROWS.counts.potato);
  f.setQuality('quality'); assert.equal(f.perchedCount, CROWS.counts.quality);
  // Never two crows on one perch.
  const used = f.crows.filter(c => c.state === 'perched').map(c => c.perch);
  assert.equal(new Set(used).size, used.length);
  // At most the preset's overhead crossings, and never more crows than the pool.
  run(f, 200);
  assert.ok(f.crows.filter(c => c.flyover && c.state !== 'off').length <= CROWS.flyovers.quality);
});

test('a shot, blast or impact within 6 m scatters them; further off does not', () => {
  const f = flockOf(), c = f.crows.find(o => o.state === 'perched'), other = () => f.crows.filter(o => o !== c && o.state === 'perched');
  // An impact just outside the radius: stays.
  f.event({ type: 'rifleImpact', x: c.x + CROWS.scatter + .3, z: c.z });
  assert.equal(c.state, 'perched');
  f.event({ type: 'rifleImpact', x: c.x + CROWS.scatter - .5, z: c.z });
  assert.equal(c.state, 'flying');
  // It circles, then lands on another perch well away from the scare.
  const from = { x: c.x, z: c.z };
  run(f, 30, [{ x: from.x + 40, z: from.z + 40 }]);
  assert.equal(c.state, 'perched');
  assert.ok(Math.hypot(c.x - from.x, c.z - from.z) >= CROWS.keepAway - .5);
  // A blast reaches its radius further.
  const d = f.crows.find(o => o.state === 'perched');
  f.event({ type: 'grenadeExplosion', x: d.x + CROWS.scatter + 2, z: d.z, radius: 3 });
  assert.equal(d.state, 'flying');
  // A shot's line: beside it within 6 m scatters, the shooter far away.
  run(f, 30, [{ x: 500, z: 500 }]);
  const e = f.crows.find(o => o.state === 'perched');
  f.event({ type: 'rifleShot', x: e.x - 20, z: e.z + 4 }, { x: e.x - 20, z: e.z + 4, aimX: 1, aimZ: 0 });
  assert.equal(e.state, 'flying');
  const g = f.crows.find(o => o.state === 'perched');
  f.event({ type: 'rifleShot', x: g.x - SHOT_REACH - 8, z: g.z }, { aimX: 1, aimZ: 0 });
  assert.equal(g.state, 'perched', 'a shot that falls short of it');
});

test('someone walking up sends them off; a crow on a roof lets you come closer', () => {
  const f = flockOf('extreme');
  const low = f.crows.find(c => c.state === 'perched' && !f.perches[c.perch].high);
  run(f, .1, [{ x: low.x + CROWS.approachLow - .6, z: low.z }]);
  assert.equal(low.state, 'flying');
  const high = f.crows.find(c => c.state === 'perched' && f.perches[c.perch].kind === 'ridge');
  if (high) {
    const at = { x: high.x + (CROWS.approachLow + CROWS.approachHigh) / 2, z: high.z };
    run(f, .1, [at]);
    assert.equal(high.state, 'perched', 'a roof crow ignores someone 4 m off');
  }
  // Going into a building: its roof's crows leave (the roof fades out).
  const g = flockOf('extreme'), roofed = g.crows.find(c => c.state === 'perched' && g.perches[c.perch].building);
  run(g, .1, [{ x: 500, z: 500 }], g.perches[roofed.perch].building);
  assert.equal(roofed.state, 'flying');
  // A broken headstone's crow goes, and nobody lands there again.
  const h = flockOf('extreme'), stone = h.crows.find(c => c.state === 'perched' && h.perches[c.perch].kind === 'headstone');
  if (stone) {
    const id = h.perches[stone.perch].propId;
    h.event({ type: 'propBreak', id, x: 500, z: 500 }); run(h, .1, [{ x: 600, z: 600 }]);
    assert.equal(stone.state, 'flying');
    run(h, 120, [{ x: 600, z: 600 }]);
    assert.ok(h.crows.every(c => c.state !== 'perched' || h.perches[c.perch].propId !== id));
  }
});

test('after a death 1-3 come to the body after a while, hop and peck, and scatter when someone comes', () => {
  const f = flockOf('balanced'), body = { x: -2, z: -12 }, away = [{ x: 30, z: -4 }];
  run(f, 5, away);
  f.event({ type: 'playerDeath', x: body.x, z: body.z });
  // Not at once.
  run(f, CROWS.visit.delay[0] - 1, away);
  assert.equal(f.crows.filter(c => c.state === 'ground').length, 0);
  run(f, 30, away);
  const at = f.crows.filter(c => c.state === 'ground');
  assert.ok(at.length >= 1 && at.length <= 3, `${at.length} at the body`);
  for (const c of at) {
    assert.ok(Math.hypot(c.x - body.x, c.z - body.z) <= CROWS.visit.radius[1] + .05);
    assert.ok(Math.abs(c.y - heightAt(c.x, c.z)) < .2, 'on the ground');
  }
  // They move about (hops) and peck (tip forward).
  const before = at.map(c => [c.x, c.z]); let pecked = false;
  for (let t = 0; t < 10; t += 1 / 30) { f.update(1 / 30, { players: away }); if (at.some(c => c.pitch > .2)) pecked = true; }
  assert.ok(pecked, 'no peck');
  assert.ok(at.some((c, i) => Math.hypot(c.x - before[i][0], c.z - before[i][1]) > .05), 'no hop');
  // Someone comes near: they go.
  run(f, .1, [{ x: body.x + CROWS.visit.near - CROWS.visit.radius[1] - .3, z: body.z }]);
  assert.ok(at.every(c => c.state === 'flying'));
  // Not while the guns keep going: a visit waits out the shooting.
  const g = flockOf('balanced');
  g.event({ type: 'playerDeath', x: body.x, z: body.z });
  for (let t = 0; t < 20; t += 1 / 30) { if (Math.round(t * 30) % 60 === 0) g.event({ type: 'rifleShot', x: 40, z: -30 }); g.update(1 / 30, { players: away }); }
  assert.equal(g.crows.filter(c => c.state === 'ground').length, 0);
});

test('they fall silent after gunfire, and caw now and then otherwise', () => {
  const f = flockOf(), calls = []; f.onCall = (kind, x, y, z) => calls.push({ kind, t: f.time });
  run(f, 60);
  assert.ok(calls.filter(c => c.kind === 'caw').length >= 4, 'idle caws');
  calls.length = 0; f.event({ type: 'shotgunShot', x: 300, z: 300 });
  const shot = f.time; run(f, CROWS.hush - .5);
  assert.equal(calls.filter(c => c.kind === 'caw').length, 0, 'a caw in the hush');
  run(f, 30); assert.ok(calls.some(c => c.kind === 'caw' && c.t > shot + CROWS.hush));
  // Scattering is loud: an alarm and wings.
  calls.length = 0; const c = f.crows.find(o => o.state === 'perched'); f.event({ type: 'hit', x: c.x, z: c.z });
  assert.ok(calls.some(k => k.kind === 'alarm') && calls.some(k => k.kind === 'flap'));
});

test('Hollow Wick gets its crows and soundscape; Deadwater gets neither', () => {
  assert.equal(hasCrows(hollowWick), true); assert.equal(hasHollowSound(hollowWick), true);
  assert.equal(hasCrows(deadwater), false); assert.equal(hasHollowSound(deadwater), false);
  const sound = {};
  assert.equal(hollowAmbience(deadwater, null, sound), null);
  assert.equal(sound.hollow, undefined);
  // Hollow Wick: the crows go into the scene, the Soundscape carries its
  // HollowSound, and the water's sounds and the crows' calls are wired to it.
  const heard = [], view = { scene: new THREE.Scene(), gy: heightAt, qualityName: 'performance', remotePlayers: [], waterFX: { onSound: null, field: { depthAt: () => -1 } } };
  const h = hollowAmbience(hollowWick, view, sound);
  assert.ok(sound.hollow instanceof HollowSound && h.voice === sound.hollow);
  assert.equal(h.crows.flock.perchedCount, CROWS.counts.performance);
  assert.equal(view.scene.children.filter(o => o.isInstancedMesh && o.name === 'crows').length, 2, 'two draws');
  assert.equal(typeof view.waterFX.onSound, 'function');
  sound.hollow.water = (...a) => heard.push(a); sound.hollow.crow = (...a) => heard.push(a);
  view.waterFX.onSound('wadeStep', 1, 2, .5);
  assert.deepEqual(heard[0], ['wadeStep', 1, 2, .5]);
  const c = h.crows.flock.crows.find(o => o.state === 'perched');
  h.event({ type: 'hit', x: c.x, z: c.z }); assert.ok(heard.some(a => a[0] === 'alarm'));
  h.update(1 / 30, { player: { x: 0, z: 0 }, interior: null });
  view.qualityName = 'extreme'; h.update(1 / 30, { player: { x: 0, z: 0 }, interior: null });
  assert.ok(h.crows.flock.perchedCount > CROWS.counts.performance);
  h.reset(); assert.equal(h.crows.flock.perchedCount, CROWS.counts.extreme);
  // The beds: the stream near the water, the weir by the dam, leaves by the woods.
  const [wx, wz] = HOLLOW_SOUND.weirAt;
  assert.ok(bedLevels(hollowWick, -16, 22.4).stream > .9 && bedLevels(hollowWick, 30, -20).stream < .05);
  assert.ok(bedLevels(hollowWick, wx, wz).weir > .9 && bedLevels(hollowWick, -30, 30).weir < .01);
  assert.ok(bedLevels(hollowWick, -10, -55).leaves > .9 && bedLevels(hollowWick, 12, 45).leaves < .3);
});

test('audio.js hooks: Hollow Wick replaces the desert wind, ducks on gunfire, wets your steps; nothing else changes', () => {
  const src = readFileSync(new URL('../src/audio.js', import.meta.url), 'utf8');
  // Three hooks, each through `this.hollow?.` (undefined on Deadwater: its path is untouched).
  assert.equal((src.match(/this\.hollow\?\./g) || []).length, 4);
  assert.match(src, /this\.hollow\?\.start\(this\)/);
  assert.match(src, /this\.hollow\?\.event\(e, level\)/);
  assert.match(src, /this\.hollow\?\.update\(player, time\)/);
  assert.match(src, /if \(!this\.hollow\?\.step\(player\)\) \{ this\.noise\(\.06, \.16, 900\); this\.tone\(95, 45, \.05, \.025, 'triangle'\); \}/);
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(main, /const hollow = hollowAmbience\(map, view, sound\);[\s\S]*warmProgramsParallel/, 'made before the warm-up');
  assert.match(main, /hollow\?\.event\(e,shooter\)/); assert.match(main, /hollow\?\.event\(e,sim\.player\)/);
  assert.match(main, /hollow\?\.update\(renderDelta,sim\)/); assert.match(main, /hollow\?\.reset\(\)/);
  // A HollowSound with a fake audio graph: gunfire ducks, the rest does not; the desert wind is cut off.
  const ctx = fakeContext(), sound = { context: ctx, enabled: true, buses: { ambient: node(), effects: node() }, noiseBuffer: {}, impactBuffer: {}, wind: node() };
  const hs = new HollowSound(sound, { map: hollowWick, view: { waterFX: { field: { depthAt: (x) => x > 0 ? .2 : -1 } } } });
  hs.start(sound);
  assert.equal(sound.wind.disconnected, true);
  const before = hs.duck.gain.events.length;
  hs.event({ type: 'propBreak' }, 1); assert.equal(hs.duck.gain.events.length, before);
  hs.event({ type: 'rifleShot' }, 1); assert.ok(hs.duck.gain.events.length > before);
  hs.event({ type: 'rifleShot' }, 0); // not heard: no duck
  // Wet steps only in the water.
  assert.equal(hs.step({ x: 5, z: 0 }), true); assert.equal(hs.step({ x: -5, z: 0 }), false);
  // Every water kind plays without throwing.
  for (const k of ['wadeStep', 'wadeDodge', 'splash', 'spout', 'plop']) hs.water(k, 0, 0, 1);
  for (const k of ['caw', 'alarm', 'flap', 'land']) hs.crow(k, 3, 5, 3, 2);
  hs.toll(.5);
  for (let t = 0; t < 30; t += 1 / 60) hs.update({ x: -4, z: -22 }, t);
});

// A tiny stand-in for the Web Audio graph (enough to build and schedule).
function param(v = 0) { return { value: v, events: [], setValueAtTime(x) { this.events.push(x); }, linearRampToValueAtTime(x) { this.events.push(x); }, exponentialRampToValueAtTime(x) { this.events.push(x); }, setTargetAtTime(x) { this.events.push(x); }, cancelScheduledValues() {} }; }
function node() { return { gain: param(1), frequency: param(), Q: param(), type: '', buffer: null, loop: false, connect() {}, disconnect() { this.disconnected = true; }, start() {}, stop() {}, set onended(f) {} }; }
function fakeContext() { return { currentTime: 1, state: 'running', createGain: node, createBiquadFilter: node, createOscillator: node, createBufferSource: node }; }
