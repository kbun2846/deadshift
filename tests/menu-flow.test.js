import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SETTINGS, PLAIN_SETTINGS, ROUNDED, MODES, defaultSettings } from '../src/config/match.js';
import { settingsRowsHTML, rowsFor, orderedModes, withDevDefaults, DEV_SETTINGS, choiceLabel, INFINITY_MARK } from '../src/ui/lobby-settings.js';
import { DUEL_ROWS, DUEL_DEV_KEYS, duelOptionsHTML, lockedPicks, readDuelChoices } from '../src/ui/duel-menu.js';
import { DUEL_DEFAULTS, DUEL_MODES, DUEL_ROUNDS } from '../src/duel.js';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const page = (html, name) => { const at = html.indexOf(`data-page="${name}"`); assert.ok(at > 0, name); return html.slice(at, html.indexOf('<div data-page=', at + 10)); };
// The data-* keys in markup, in order.
const keys = (html, attr) => [...html.matchAll(new RegExp(`data-${attr}="([^"]+)"`, 'g'))].map(m => m[1]);

// Owner, 2026-09-29: "join at the top, then host, then below host there is
// bots, and then below bots there is tutorial and practice".
test('the gamemodes page: JOIN, HOST, BOTS, TUTORIAL, PRACTICE, in the page\'s own button style', () => {
 const html = read('../index.html'), modes = page(html, 'modes');
 const buttons = [...modes.matchAll(/<button id="([^"]+)" class="(primary|secondary)">([^<]+)<\/button>/g)].map(m => m[3]);
 assert.deepEqual(buttons, ['JOIN', 'HOST', 'BOTS', 'TUTORIAL', 'PRACTICE']);
 assert.match(modes, /<h2>Gamemodes<\/h2>/);
 assert.doesNotMatch(html, />SOLO<|>MULTIPLAYER<|HOST A GAME</);
 // JOIN and HOST are online: hidden when the network is off.
 const menu = read('../src/ui/menu.js');
 assert.match(menu, /\$\('join-mode'\)\.hidden=\$\('online-host'\)\.hidden=!NETWORK\.enabled;/);
 // Back arrows: join, host, bots and maps to gamemodes; gamemodes home.
 assert.match(menu, /\['maps','join','host-setup','duel'\]\.includes\(page\)\?'modes':'home'/);
});

test('JOIN has the username, room code and status but no HOST; HOST asks for the same username', () => {
 const html = read('../index.html'), join = page(html, 'join'), host = page(html, 'host-setup');
 assert.match(join, /<h2>join<\/h2>/);
 for (const id of ['online-name', 'online-join-form', 'online-code', 'online-join', 'online-status']) assert.ok(join.includes(`id="${id}"`), id);
 assert.doesNotMatch(join, /online-host|HOST/);
 assert.match(host, /<h2>host a game<\/h2><div class="online-identity host-identity"><label class="online-field">USERNAME<input id="host-name"/);
 const menu = read('../src/ui/menu.js');
 assert.match(menu, /mirror\('online-name','host-name'\);mirror\('host-name','online-name'\);/);
 assert.match(menu, /status\('Enter a username first\.'\);\$\('host-name'\)\.focus\(\);return;/);
 // An invite link still lands on the join page.
 assert.match(menu, /\$\('online-code'\)\.value=invite\.toUpperCase\(\);show\('join'\);/);
});

test('host a game: every mode in order, and one row that depends on the mode', () => {
 assert.deepEqual(orderedModes().map(m => m.name), ['1V1', '2V2', '3V3', '4V4', '2V2V2', 'FFA', 'PRACTICE']);
 assert.equal(orderedModes().length, MODES.length);
 for (const mode of ['1v1', '2v2', '3v3', '4v4', '2v2v2']) { assert.ok(ROUNDED.includes(mode)); assert.deepEqual(rowsFor(mode), ['rounds'], mode); }
 assert.deepEqual(rowsFor('ffa'), ['roundLength']);
 assert.deepEqual(rowsFor('practice'), []);
 assert.deepEqual(SETTINGS.rounds.names, ['3', '5', '10', '∞']);
 assert.deepEqual(SETTINGS.roundLength.names, ['5 MIN', '10 MIN']);
 // With the tools unlocked the mode's developer rows join them.
 assert.ok(rowsFor('2v2', { dev: true }).includes('spawnMode'));
 assert.ok(!rowsFor('ffa', { dev: true }).includes('spawnMode'));
 // (No friendly fire at all, owner 2026-09-29: no row for it anywhere.)
 assert.ok(!rowsFor('2v2', { dev: true }).includes('friendlyFire'));
});

test('developer rows sit in a group shown only with the developer tools unlocked', () => {
 const html = settingsRowsHTML(), group = html.indexOf('<details class="dev-only round-dev"><summary>developer</summary>');
 assert.ok(group > 0);
 for (const key of PLAIN_SETTINGS) assert.ok(html.indexOf(`data-key="${key}"`) < group, key + ' is plain');
 assert.deepEqual(DEV_SETTINGS, Object.keys(SETTINGS).filter(k => SETTINGS[k].dev));
 for (const key of DEV_SETTINGS) assert.ok(html.indexOf(`data-key="${key}"`) > group, key + ' is in the developer group');
 const css = read('../src/styles/menu-theme.css');
 assert.match(css, /#game \.dev-only\{display:none!important\}/);
 assert.match(css, /body\.dev-unlocked #game \.dev-only\{display:block!important\}/);
 assert.match(read('../src/ui/dev-wiring.js'), /document\.body\.classList\.toggle\('dev-unlocked', !!unlocked\);/);
 // Locked, a room keeps every developer setting at its default.
 const tuned = { ...defaultSettings(), rounds: 3, health: 750, syphon: 'off' };
 assert.deepEqual(withDevDefaults(tuned, false), { ...defaultSettings(), rounds: 3 });
 assert.deepEqual(withDevDefaults(tuned, true), tuned);
 // The lobby and the pause menu's lobby page use the same rows.
 for (const file of ['../src/ui/lobby-screen.js', '../src/ui/lobby-panel.js']) assert.match(read(file), /const plain = settings\.render\(/);
});

test('BOTS: mode, map, your weapon, rounds (FFA: match length), difficulty; the rest in the developer group', () => {
 const html = duelOptionsHTML(readDuelChoices({ getItem: () => null }), [{ id: 'deadwater', name: 'Deadwater Outpost' }]);
 const group = html.indexOf('<details class="dev-only round-dev">');
 assert.ok(group > 0);
 const plain = keys(html.slice(0, group), 'duel'), dev = keys(html.slice(group), 'duel');
 assert.deepEqual(plain, ['mode', 'map', 'weapon', 'firstTo', 'length', 'skill']);
 assert.deepEqual([...dev].sort(), [...DUEL_DEV_KEYS].sort());
 const row = key => DUEL_ROWS.find(r => r.key === key);
 // (FFA, owner 2026-09-29: in the BOTS menu too, 5 or 10 minutes.)
 assert.ok(row('mode').choices.some(([id]) => id === 'ffa')); assert.deepEqual(row('length').choices, [['300', '5 MIN'], ['600', '10 MIN']]);
 assert.deepEqual(row('mode').choices.map(c => c[1]), Object.values(DUEL_MODES).map(m => m.name));
 assert.ok(row('mode').choices.some(([id]) => id === '4v4'));
 for (const [id] of row('mode').choices) assert.ok(row('mode').notes[id], id + ' has its one-line note');
 assert.equal(row('firstTo').label, 'rounds');
 assert.deepEqual(row('firstTo').choices, DUEL_ROUNDS.map(n => [String(n), n ? String(n) : '∞']));
 assert.equal(row('skill').label, 'difficulty');
 assert.deepEqual(row('skill').choices.map(c => c[0]), ['easy', 'normal', 'hard']);
 assert.match(read('../index.html'), /<h2>bots<\/h2>/);
 // Locked, the developer picks play at their defaults; the picks keep their shape.
 const picks = { ...DUEL_DEFAULTS, map: 'deadwater', weapon: 'static', firstTo: 3, skill: 'hard', botWeapon: 'shotgun', allySkill: 'easy', spawn: 'team' };
 const locked = lockedPicks(picks, false);
 assert.deepEqual(Object.keys(locked).sort(), Object.keys(picks).sort());
 assert.equal(locked.firstTo, 3); assert.equal(locked.skill, 'hard');
 for (const key of DUEL_DEV_KEYS) assert.equal(locked[key], DUEL_DEFAULTS[key], key);
 assert.deepEqual(lockedPicks(picks, true), picks);
});

test('endless is a drawn ∞ as tall as the numbers, named for screen readers', () => {
 assert.equal(choiceLabel('∞'), INFINITY_MARK);
 assert.equal(choiceLabel('5'), '5');
 assert.match(INFINITY_MARK, /^<svg class="infinity-mark"/);
 assert.match(settingsRowsHTML(), /aria-label="endless"><svg class="infinity-mark"/);
 assert.match(read('../src/styles/menu-theme.css'), /#game button\.choice-button \.infinity-mark\{position:absolute;left:50%;top:50%;height:calc\(100% - 8px\)/);
});
