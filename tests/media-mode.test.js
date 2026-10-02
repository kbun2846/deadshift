import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
 MEDIA_STORE, MEDIA_HOTKEY, MEDIA_ELEMENTS, MEDIA_PRESETS, DEFAULT_MEDIA, createMediaMode, mediaClasses, mediaCamera,
 bestLookPreset, isMediaHotkey, loadMediaSettings, validMediaSettings, mediaPresetOf,
} from '../src/ui/media-mode.js';
import { KEY_ACTIONS } from '../src/config/keybinds.js';
import { GAME_KEYS } from '../src/config/controls.js';

const src = file => readFileSync(new URL('../src/' + file, import.meta.url), 'utf8');
const fakeBody = () => { const set = new Set(); return { set, classList: { add: c => set.add(c), remove: c => set.delete(c), contains: c => set.has(c) } }; };
const fakeStorage = (init = {}) => { const data = { ...init }; return { data, getItem: k => k in data ? data[k] : null, setItem: (k, v) => { data[k] = String(v); } }; };
const fakeDoc = { createElement: () => ({ setAttribute() {}, className: '' }) };
const make = ({ storage = fakeStorage(), hooks = {} } = {}) => {
 const body = fakeBody(), root = { children: [], append(c) { this.children.push(c); } };
 const looks = [];
 const media = createMediaMode({ body, root, doc: fakeDoc, storage, hooks: { setLook: name => looks.push(name), tier: () => 'quality', quality: () => 'balanced', ...hooks } });
 return { media, body, root, looks, storage };
};

test('media mode starts off, and on hides the clutter and every element switched off (clean by default)', () => {
 const { media, body, root } = make();
 assert.equal(media.on, false);
 assert.equal(body.set.size, 0, 'nothing on the body until it is turned on');
 assert.equal(root.children.length, 1, 'the 9:16 guide is made once, hidden by CSS');
 media.toggle();
 assert.ok(body.set.has('media-mode'));
 for (const { id } of MEDIA_ELEMENTS) assert.equal(body.set.has('media-hide-' + id), !MEDIA_PRESETS.clean[id], id);
 assert.ok(body.set.has('media-hide-health') && body.set.has('media-hide-feed') && body.set.has('media-hide-crosshair'), 'clean: no health, kill feed or crosshair');
 assert.ok(!body.set.has('media-hide-damage'), 'clean keeps the damage numbers');
 media.toggle();
 assert.equal(body.set.size, 0, 'off: every class it added is gone');
});

test('a toggle hides or shows its one element; presets swap the set; frame guide adds its class', () => {
 const { media, body } = make();
 media.enable();
 media.set('show.health', true);
 assert.ok(!body.set.has('media-hide-health'));
 assert.equal(media.preset, 'custom');
 media.usePreset('minimal');
 assert.equal(media.preset, 'minimal');
 for (const id of ['health', 'dodge', 'crosshair', 'feed', 'storm']) assert.ok(!body.set.has('media-hide-' + id), id + ' shows in minimal');
 assert.ok(body.set.has('media-hide-weapon') && body.set.has('media-hide-notices'));
 media.set('frame', 'guide');
 assert.ok(body.set.has('media-frame-guide'));
 media.usePreset('clean');
 assert.equal(media.preset, 'clean');
 media.disable();
 assert.equal(body.set.size, 0);
});

test('best look draws with the best preset while on and gives the player their own back after', () => {
 const { media, looks } = make();
 media.enable();
 assert.deepEqual(looks, ['extreme'], 'a Quality machine records on Extreme');
 assert.equal(media.look, 'extreme');
 media.disable();
 assert.deepEqual(looks, ['extreme', null], 'off: back to the player\'s own preset');
 // Already on the best: nothing changes, nothing to restore.
 const own = make({ hooks: { quality: () => 'extreme' } });
 own.media.enable(); own.media.disable();
 assert.deepEqual(own.looks, []);
 // Changing the choice while on applies it straight away.
 const live = make();
 live.media.enable(); live.media.set('look', 'off'); live.media.set('look', 'quality');
 assert.deepEqual(live.looks, ['extreme', null, 'quality']);
 // Extreme too heavy (lost contexts): Quality from then on.
 live.media.set('look', 'auto'); live.media.lookFailed();
 assert.equal(live.media.look, 'quality');
 live.media.disable(); live.media.enable();
 assert.equal(live.media.look, 'quality', 'and it stays capped');
});

test('auto best look follows the machine and never goes below the player\'s preset', () => {
 assert.equal(bestLookPreset('auto', { tier: 'quality', current: 'quality' }), 'extreme');
 assert.equal(bestLookPreset('auto', { tier: 'balanced', current: 'balanced' }), 'quality');
 assert.equal(bestLookPreset('auto', { tier: 'balanced', current: 'performance', mobile: true }), 'balanced', 'a phone stays at Balanced');
 assert.equal(bestLookPreset('auto', { tier: 'performance', current: 'performance' }), 'balanced');
 assert.equal(bestLookPreset('auto', { tier: 'performance', current: 'quality' }), null, 'never lower');
 assert.equal(bestLookPreset('quality', { current: 'extreme' }), null);
 assert.equal(bestLookPreset('extreme', { current: 'potato' }), 'extreme');
 assert.equal(bestLookPreset('off', { current: 'potato' }), null);
});

test('settings are kept under a deadstab key; being on is not', () => {
 const storage = fakeStorage();
 const { media } = make({ storage });
 media.enable(); media.set('show.feed', true); media.set('zoom', 0.9); media.set('follow', 'cinematic');
 assert.ok(MEDIA_STORE.startsWith('deadstab-'));
 const saved = JSON.parse(storage.data[MEDIA_STORE]);
 assert.equal(saved.show.feed, true); assert.equal(saved.zoom, 0.9); assert.equal(saved.follow, 'cinematic');
 assert.ok(!('on' in saved), 'on/off is not saved');
 const next = make({ storage: fakeStorage({ [MEDIA_STORE]: JSON.stringify({ ...saved, on: true }) }) });
 assert.equal(next.media.on, false, 'a new page starts with media mode off');
 assert.equal(next.media.settings.show.feed, true, 'with the settings kept');
 assert.equal(next.media.settings.follow, 'cinematic');
});

test('stored garbage or blocked storage falls back to the defaults', () => {
 assert.deepEqual(loadMediaSettings(null), validMediaSettings(null));
 assert.deepEqual(loadMediaSettings({ getItem: () => 'not json' }), validMediaSettings(null));
 assert.deepEqual(loadMediaSettings({ getItem: () => { throw new Error('blocked'); } }), validMediaSettings(null));
 const odd = validMediaSettings({ zoom: 9, look: 'ultra', follow: 3, frame: 'square', show: { health: 'yes', feed: true } });
 assert.equal(odd.zoom, DEFAULT_MEDIA.zoom); assert.equal(odd.look, DEFAULT_MEDIA.look);
 assert.equal(odd.follow, DEFAULT_MEDIA.follow); assert.equal(odd.frame, DEFAULT_MEDIA.frame);
 assert.equal(odd.show.health, DEFAULT_MEDIA.show.health); assert.equal(odd.show.feed, true);
 assert.equal(mediaPresetOf(DEFAULT_MEDIA.show), 'clean');
 // A throwing setItem does not stop it working.
 const { media } = make({ storage: { getItem: () => null, setItem: () => { throw new Error('full'); } } });
 media.enable(); media.set('show.health', true); assert.equal(media.settings.show.health, true);
});

test('the camera: closer or wider and softer to follow, only while on, and never wider online', () => {
 const { media } = make({ hooks: { online: () => online } });
 let online = false;
 assert.equal(media.camera(), null, 'off: the normal camera');
 media.enable(); media.set('zoom', 1.25); media.set('follow', 'cinematic');
 assert.deepEqual(media.camera(), { zoom: 1.25, follow: .32 });
 online = true;
 assert.equal(media.camera().zoom, 1, 'online: no wider than everyone else');
 media.set('zoom', 0.8);
 assert.equal(media.camera().zoom, 0.8, 'closer is fine online');
 assert.equal(mediaCamera({ follow: 'normal' }).follow, 1);
 // The renderer reads it every frame, on this screen's camera only.
 const renderer = src('render/renderer.js');
 assert.match(renderer, /this\.mediaCamera\?\.\(\)/);
 assert.match(renderer, /\* mediaZoom/);
 assert.match(src('ui/dev-wiring.js'), /view\.mediaCamera = \(\) => media\.camera\(\)/);
 assert.ok(!/mediaCamera|media-mode/.test(src('simulation.js')), 'nothing in the rules');
});

test('H toggles it: not held, not with modifiers, not while typing, not when H is a bound game key', () => {
 assert.equal(MEDIA_HOTKEY, 'KeyH');
 assert.ok(!Object.values(GAME_KEYS).includes(MEDIA_HOTKEY) && !KEY_ACTIONS.some(a => a.key === MEDIA_HOTKEY), 'H is not a game key');
 const key = (extra = {}) => ({ code: 'KeyH', target: { matches: () => false }, ...extra });
 assert.equal(isMediaHotkey(key()), true);
 assert.equal(isMediaHotkey(key({ repeat: true })), false);
 assert.equal(isMediaHotkey(key({ ctrlKey: true })), false);
 assert.equal(isMediaHotkey(key({ target: { matches: () => true } })), false, 'typing');
 assert.equal(isMediaHotkey(key(), () => 'KeyQ'), false, 'H bound to dodge');
 assert.equal(isMediaHotkey(key({ code: 'KeyO' })), false);
 // main.js: gated on the unlock, before the per-screen key handling (works paused and in menus).
 const main = src('main.js');
 const line = main.split('\n').find(l => l.includes('isMediaHotkey(e,gameCode)'));
 assert.ok(line && /devTools\.isUnlocked\(\)/.test(line) && /toggleMedia\(\)/.test(line));
 assert.ok(main.indexOf('isMediaHotkey(e,gameCode)') < main.indexOf('if(matchEnd.open){navigateMenu'));
 // Esc is untouched: the pause menu still opens with media mode on.
 assert.ok(main.includes("if (e.code === 'Escape') { e.preventDefault(); if(!e.repeat&&started)setPaused(!paused); return; }"));
});

test('every element has its CSS, and the pause menu and dialogs stay usable', () => {
 const css = src('styles/media-mode.css');
 for (const { id } of MEDIA_ELEMENTS) {
  assert.ok(new RegExp('body[.\\w-]*\\.media-hide-' + id + '[:. ]').test(css), id + ' has a rule');
  assert.ok(css.includes(`[data-media~=${id}]`), id + ' can be joined with data-media');
 }
 // Nothing ever hides the pause menu, settings, death card, match end or dev windows.
 for (const kept of ['#pause-panel', '#settings-panel', '#death-screen', '#match-end', '.dev-window{', '#map-panel']) assert.ok(!css.includes(kept + ',') && !css.includes(kept + ')'), kept);
 assert.match(css, /#pause\{opacity:0/, 'the pause button is invisible, not gone');
 assert.match(css, /media-hide-touch[^{]*\{opacity:0/, 'touch controls keep working');
 assert.match(css, /:not\(\.dev-window-open\):not\(\.menu-pointer\)[^{]*#reticle/, 'the pointer comes back over the dev window and menus');
 assert.match(css, /\.media-frame\{[^}]*aspect-ratio:9\/16[^}]*z-index:9/, 'the 9:16 guide sits under the pause menu (z-index 10)');
 assert.ok(!/watermark/.test(css), 'the watermark stays (owner)');
 assert.match(src('main.js'), /import '\.\/styles\/media-mode\.css'/);
});

test('the Media section is in both tool surfaces, and online it opens alone', () => {
 const window = src('ui/dev-window.js'), tools = src('ui/dev-tools.js'), wiring = src('ui/dev-wiring.js');
 assert.match(window, /buildMediaPanel\(body, media/);
 assert.match(tools, /buildMediaPanel\(/);
 assert.match(wiring, /mediaOnly: true/);
 assert.match(wiring, /onLock: \(\) => \{[^}]*media\.disable\(\)/, 'locking the tools ends media mode');
 const panel = src('ui/media-panel.js');
 assert.match(panel, /'Media'/);
 // Its state is its own, not sim.dev (reset every tick online for anyone but the host).
 assert.ok(!/sim\.dev/.test(src('ui/media-mode.js') + panel));
 // Best look is never saved over the player's preset.
 const main = src('main.js');
 const setLook = main.split('\n').find(l => l.startsWith('function setMediaLook'));
 assert.ok(setLook && !/localStorage|applySettings|settings\.quality=/.test(setLook));
});
