// v0.995a (owner: "make the game auto select between performance, balanced and
// quality for users device at start of game"): device-tier.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import { detectTier, autoQuality, AutoQualityWatch, AUTO_WATCH } from '../src/device-tier.js';
import { validateSettings } from '../src/settings.js';

const gpu = renderer => ({ renderer, vendor: '' });
const tier = (renderer, extra = {}) => detectTier({ gpu: gpu(renderer), cores: 8, memory: 8, ...extra }).tier;

test('graphics chips map to Performance, Balanced or Quality', () => {
  assert.equal(tier('ANGLE (NVIDIA, NVIDIA GeForce RTX 5090 Direct3D11 vs_5_0 ps_5_0, D3D11)', { cores: 32 }), 'quality');
  assert.equal(tier('ANGLE (NVIDIA, NVIDIA GeForce GTX 970 Direct3D11 vs_5_0 ps_5_0)'), 'balanced');
  assert.equal(tier('ANGLE (NVIDIA, NVIDIA GeForce MX350 Direct3D11)'), 'balanced');
  assert.equal(tier('ANGLE (AMD, AMD Radeon RX 6800 XT Direct3D11 vs_5_0 ps_5_0)'), 'quality');
  assert.equal(tier('ANGLE (AMD, AMD Radeon(TM) Graphics Direct3D11 vs_5_0 ps_5_0)'), 'balanced');
  assert.equal(tier('ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0)'), 'performance');
  assert.equal(tier('ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11 vs_5_0 ps_5_0)'), 'balanced');
  assert.equal(tier('Intel Iris Plus Graphics 655'), 'performance', 'an Intel MacBook');
  assert.equal(tier('ANGLE (Intel, Intel(R) Arc(TM) A770 Graphics Direct3D11)'), 'quality');
  assert.equal(tier('ANGLE (Apple, ANGLE Metal Renderer: Apple M1, Unspecified Version)'), 'balanced');
  assert.equal(tier('ANGLE (Apple, ANGLE Metal Renderer: Apple M3 Max, Unspecified Version)'), 'quality');
  assert.equal(tier('Apple GPU'), 'balanced', 'Safari on a Mac');
  assert.equal(tier('ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)'), 'performance');
  assert.equal(detectTier({ gpu: null }).tier, 'balanced', 'nothing known: the middle');
});

test('phones and tablets start on Performance, flagships on Balanced; never Quality', () => {
  assert.equal(tier('Adreno (TM) 619', { mobile: true }), 'performance');
  assert.equal(tier('Adreno (TM) 740', { mobile: true }), 'balanced');
  assert.equal(tier('Mali-G78 MP20', { mobile: true }), 'balanced');
  assert.equal(tier('Mali-G57 MC2', { mobile: true }), 'performance');
  assert.equal(tier('Apple GPU', { mobile: true, cores: 6 }), 'performance', 'an iPhone');
  assert.equal(tier('Apple GPU', { mobile: true, cores: 8 }), 'balanced', 'an M-chip iPad');
  for (const r of ['Adreno (TM) 830', 'Immortalis-G720', 'Apple GPU']) assert.notEqual(tier(r, { mobile: true, cores: 12 }), 'quality');
});

test('few cores or little memory hold the pick back', () => {
  assert.equal(tier('NVIDIA GeForce RTX 4070', { cores: 4 }), 'balanced');
  assert.equal(tier('NVIDIA GeForce RTX 4070', { memory: 2 }), 'performance');
});

test('the learned step goes down from the detected preset, never below Performance', () => {
  assert.equal(autoQuality('quality', 0), 'quality');
  assert.equal(autoQuality('quality', -1), 'balanced');
  assert.equal(autoQuality('balanced', -2), 'performance');
  assert.equal(autoQuality('balanced', 1), 'balanced', 'never above what was detected');
});

test('the watch: well short of the target steps down once; smooth for long enough a step back up', () => {
  const slow = new AutoQualityWatch(); let move = 0;
  for (let t = 0; t < AUTO_WATCH.window + 1 && !move; t += 1 / 60) move = slow.sample(1 / 60, Math.random() < .5 ? 1 : 0, 60);
  assert.equal(move, -1, 'about 30 fps against 60');
  assert.equal(slow.sample(1 / 60, 0, 60), 0, 'once a session');
  const fine = new AutoQualityWatch(); move = 0;
  for (let t = 0; t < 200 && !move; t += 1 / 60) move = fine.sample(1 / 60, 1, 60, 0);
  assert.equal(move, 0, 'smooth at the detected preset: nothing to do');
  const lower = new AutoQualityWatch(); move = 0; let t = 0;
  for (; t < 200 && !move; t += 1 / 60) move = lower.sample(1 / 60, 1, 60, -1);
  assert.equal(move, 1); assert.ok(t >= AUTO_WATCH.smoothFor);
});

test('settings: AUTO by default; old saves count as automatic only on their device default', () => {
  assert.equal(validateSettings({}).qualityAuto, true);
  assert.equal(validateSettings({ quality: 'balanced' }).qualityAuto, true);
  assert.equal(validateSettings({ quality: 'extreme' }).qualityAuto, false, 'a preset picked by hand stays');
  assert.equal(validateSettings({ quality: 'performance' }, { mobile: true }).qualityAuto, true);
  assert.equal(validateSettings({ quality: 'quality', qualityAuto: true }).qualityAuto, true);
  assert.equal(validateSettings({ qualityAutoStep: -5 }).qualityAutoStep, -2);
  assert.equal(validateSettings({ qualityAutoStep: 3 }).qualityAutoStep, 0);
});
