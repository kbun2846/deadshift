// Settings redesign (2026-09-30): one card like the other menus (back arrow,
// lowercase heading, the sections as a choice-button bar), rows of a label and
// its control, on/off and few-option settings as choice bars over a hidden
// checkbox or select, destructive resets on two presses, and phones covered.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GRAPHICS } from '../src/settings.js';
import { choicePicked } from '../src/ui/settings-panel.js';
import { twoPress } from '../src/ui/two-press.js';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const html = read('../index.html');
const panel = html.slice(html.indexOf('<section id="settings-panel"'), html.indexOf('</section>', html.indexOf('<section id="settings-panel"')));

test('the settings card has the menus\' back arrow, a lowercase heading and four tabs in a choice bar', () => {
  assert.match(panel, /<button type="button" id="settings-back" class="menu-back[^"]*"[^>]*><svg class="back-arrow"/);
  assert.match(panel, /<h2>settings<\/h2>/);
  const tabs = [...panel.matchAll(/<button type="button" class="choice-button" data-tab="(\w+)" role="tab"/g)].map(m => m[1]);
  assert.deepEqual(tabs, ['graphics', 'audio', 'controls', 'mobile']);
  for (const tab of tabs) assert.ok(panel.includes(`id="settings-${tab}" role="tabpanel"`), tab);
  assert.match(panel, /<nav class="settings-tabs" role="tablist"/);
});

test('every id the game and the tests rely on is still there', () => {
  for (const id of ['graphics-preset', 'graphics-description', 'graphics-warning', 'fps-counter', 'fps-limit', 'fps-limit-ticks', 'fps-limit-value', 'touch-edit-layout', 'touch-swap-sides', 'touch-reset-layout', 'touch-edit-note', 'mobile-opacity', 'aim-assist', 'vibration', 'dev-open', 'dev-panel'])
    assert.ok(panel.includes(`id="${id}"`), id);
  assert.match(panel, /<p class="settings-version" aria-label="Version">/);
  const preset = panel.match(/<select id="graphics-preset"[^>]*>([\s\S]*?)<\/select>/)[1];
  assert.deepEqual([...preset.matchAll(/value="(\w+)"/g)].map(m => m[1]), ['auto', ...Object.keys(GRAPHICS)], 'Auto first, then every preset in order');
  // The custom dropdown names itself from the select's label.
  assert.match(panel, /<select id="graphics-preset" aria-label="Quality">/);
});

test('choice bars point at a real input and offer every option', () => {
  const menu = read('../src/ui/menu.js');
  const all = panel + menu;
  const bars = [...all.matchAll(/data-for="([\w-]+)"/g)].map(m => m[1]);
  assert.deepEqual(new Set(bars), new Set(['control-hints', 'mobile-opacity', 'aim-assist', 'vibration']));
  for (const id of bars) assert.ok(all.includes(`id="${id}"`), id);
  for (const id of ['control-hints', 'aim-assist', 'vibration']) assert.match(all, new RegExp(`<input id="${id}" type="checkbox" checked hidden>`), id + ' stays a (hidden) checkbox');
  const opacity = panel.match(/<select id="mobile-opacity"[^>]*data-choices[^>]*>([\s\S]*?)<\/select>/)[1];
  const values = [...opacity.matchAll(/value="([\d.]+)"/g)].map(m => m[1]);
  const buttons = [...panel.slice(panel.indexOf('data-for="mobile-opacity"')).matchAll(/data-value="([\d.]+)"/g)].slice(0, values.length).map(m => m[1]);
  assert.deepEqual(buttons, values, 'one button per opacity');
  // A select shown as a bar is left alone by the custom dropdowns.
  assert.match(read('../src/ui/select-menu.js'), /querySelectorAll\('select:not\(\[data-choices\]\)'\)/);
});

test('a choice bar shows the picked button from its input', () => {
  const box = checked => ({ type: 'checkbox', checked });
  assert.equal(choicePicked(box(true), 'on'), true);
  assert.equal(choicePicked(box(true), 'off'), false);
  assert.equal(choicePicked(box(false), 'off'), true);
  const select = value => ({ type: 'select-one', value });
  assert.equal(choicePicked(select('0.7'), '0.7'), true);
  assert.equal(choicePicked(select('1'), '0.7'), false);
});

test('resets take two presses, and quietly disarm', () => {
  let clock = 0, ran = 0, handler = null;
  const classes = new Set();
  const button = { textContent: 'RESET KEYS', classList: { add: c => classes.add(c), remove: c => classes.delete(c) }, addEventListener: (type, fn) => { handler = fn; } };
  const control = twoPress(button, () => ran++, { confirm: 'PRESS AGAIN TO RESET', seconds: 3, now: () => clock });
  handler();
  assert.equal(ran, 0); assert.equal(button.textContent, 'PRESS AGAIN TO RESET'); assert.ok(control.armed); assert.ok(classes.has('armed'));
  clock = 1000; handler();
  assert.equal(ran, 1); assert.equal(button.textContent, 'RESET KEYS'); assert.ok(!control.armed);
  handler(); clock = 5000; handler();
  assert.equal(ran, 1, 'a second press after the window only arms again');
  control.disarm();
  assert.equal(button.textContent, 'RESET KEYS');
  const keys = read('../src/ui/keybind-menu.js'), mobile = read('../src/ui/mobile-settings.js');
  assert.match(keys, /twoPress\(box\.querySelector\('\.keybind-reset'\)/);
  assert.match(mobile, /twoPress\(byId\('touch-reset-layout'\)/);
});

test('keyboard-only rows hide on a touch-only device; audio has the sound switch and four mixes', () => {
  const keys = read('../src/ui/keybind-menu.js'), menu = read('../src/ui/menu.js'), wiring = read('../src/ui/settings-panel.js');
  assert.match(keys, /box\.className = 'keybinds pc-only'/);
  assert.match(menu, /<div class="settings-row pc-only"><span class="settings-label">hud key hints/);
  assert.match(wiring, /#settings-panel \.pc-only'\)\) el\.hidden = touchOnly/);
  assert.match(menu, /id="sound-on" class="choice-button"[^']*id="mute-all" class="choice-button"/);
  for (const channel of ['master', 'ambient', 'weapons', 'effects']) assert.ok(menu.includes(`['${channel}','${channel}']`), channel);
  // The reference names the player's keys (rebinding redraws it).
  assert.match(menu, /onChange:\(\)=>\{\$\('settings-controls'\)\.querySelector\('\.control-reference'\)\.innerHTML=reference\(\);\}/);
});

test('phones: rows stack, touch targets stay 40 px, the header stays put while the body scrolls', () => {
  const css = read('../src/styles/menu-theme.css');
  const block = css.slice(css.indexOf('/* ---- Settings (2026-09-30 redesign'));
  assert.ok(block.length > 1000, 'the settings block is there');
  assert.match(block, /#game #settings-panel :is\(\.settings-tabs,\.settings-choices\) button\.choice-button\{height:40px!important;min-height:40px!important/);
  assert.match(block, /#game #settings-panel \.settings-body\{flex:1;min-height:0;overflow-y:auto/);
  assert.match(block, /@media\(max-width:560px\)\{[\s\S]*#game #settings-panel \.settings-row\{grid-template-columns:minmax\(0,1fr\)/);
  assert.match(block, /#game \.slider-field input\[type=range\]\{[^}]*height:40px/);
  assert.match(block, /#game \.keybinds \.keybind-key\{[^}]*height:40px/);
});
