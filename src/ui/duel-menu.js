// The SOLO page (Gamemodes > SOLO, was VS ROBOTS; 1V1 in v132, 2V2 and 3V3 in
// v0.9b): the mode, the map, your weapon (or random); then ENEMY ROBOTS and
// YOUR ROBOTS (team modes only), each with weapon (or random) and difficulty
// (the skill level); then MATCH: first to, and friendly fire in the team modes. Picture
// grids (weapon-grid.js) for maps and weapons, each ending in a coming-soon
// tile; the other choices are the lobby's round-settings rows (label, then
// pink-when-picked choices) with a one-line note under the pick. The last
// picks are remembered on this device. START hands them to `start` (menu.js
// launches the game; duel.js runs it).
//
// BOTS (owner, 2026-09-29: SOLO renamed, the start options cut down): MODE,
// MAP, YOUR WEAPON, ROUNDS (3 5 10 ∞) and DIFFICULTY (the enemy robots'
// skill), then START. The enemy weapon, your robots' weapon and difficulty,
// spawns are the developer tools' (a "developer" group; no friendly fire any more,
// `.dev-only`, shown only while they are unlocked); locked, they play at
// their defaults (DUEL_DEFAULTS), whatever an unlocked visit picked.
import { WEAPONS, DEFAULT_WEAPON } from '../items.js';
import { playableOr, randomPlayableWeapon } from '../weapon-maintenance.js';
import { MENU_SKILLS } from '../bots/robot-profile.js';
import { DUEL_DEFAULTS, DUEL_ROUNDS, DUEL_MODES, DUEL_LENGTHS } from '../duel.js';
import { weaponGridHTML, mapGridHTML, weaponFromChoice, pickerHTML, wirePicker } from './weapon-grid.js';
import { choiceLabel, choiceName } from './lobby-settings.js';
import { readLastWeapon } from './remembered-choices.js';

const KEY = 'deadstab.duel';
const esc = text => String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Short notes (owner, v0.9b: two words a skill, temper shorter).
const SKILL_NOTES = { easy: 'often misses', normal: 'fair fighter', hard: 'sharp, tricky' };
const robotRows = (prefix, label) => [
 { key: prefix ? prefix + 'Skill' : 'skill', label, choices: MENU_SKILLS.map(id => [id, id]), notes: SKILL_NOTES },
];
// (v0.999a, owner: "Remove the enemy aim and enemy aggression parts from solo
// menu ... just do difficulty". Aim and temper stay at their defaults, even and
// shifting (DUEL_DEFAULTS); the lobby's round settings still offer them.)
// Rows: key, label, [value, text] choices, and a note for the picked choice.
export const DUEL_ROWS = Object.freeze([
 { key: 'mode', label: 'mode', choices: Object.entries(DUEL_MODES).map(([id, m]) => [id, m.name]),
  notes: { '1v1': 'you against a bot', '2v2': 'you and a bot vs two', '3v3': 'you and two bots vs three', '4v4': 'you and three bots vs four', ffa: 'everyone for themselves', gungame: 'every kill, the next weapon · first through all of them wins' } },
 ...robotRows('', 'difficulty'),
 ...robotRows('ally', 'your bots\' difficulty'),
 // Rounds (the picks' `firstTo` holds the number; 0: endless, the ∞ sign).
 { key: 'firstTo', label: 'rounds', choices: DUEL_ROUNDS.map(n => [String(n), n ? String(n) : '∞']), notes: {} },
 // FFA: the match's length instead of rounds (most kills when it runs out).
 { key: 'length', label: 'match length', choices: DUEL_LENGTHS.map(n => [String(n), n / 60 + ' MIN']), notes: {} },
 { key: 'spawn', label: 'spawns', choices: [['scattered', 'scattered'], ['team', 'with team']], notes: {} },
]);
const row = key => DUEL_ROWS.find(r => r.key === key);

export function readDuelChoices(storage = globalThis.localStorage) {
 let saved = {};
 try { saved = JSON.parse(storage?.getItem(KEY) || '{}') || {}; } catch { saved = {}; }
 const ids = WEAPONS.map(w => w.id);
 const out = {
  map: typeof saved.map === 'string' ? saved.map : null,
  // null: random (rolled at START). Never picked here: the weapon of the last
  // game played (remembered-choices.js), else the default.
  weapon: saved.weapon === null ? null : ids.includes(saved.weapon) ? saved.weapon : readLastWeapon(storage) || DEFAULT_WEAPON,
  botWeapon: ids.includes(saved.botWeapon) ? saved.botWeapon : null,
  allyWeapon: ids.includes(saved.allyWeapon) ? saved.allyWeapon : null,
  firstTo: DUEL_ROUNDS.includes(saved.firstTo) ? saved.firstTo : DUEL_DEFAULTS.firstTo,
  length: DUEL_LENGTHS.includes(saved.length) ? saved.length : DUEL_DEFAULTS.length,
 };
 for (const key of ['mode', 'spawn']) {
  const r = row(key); out[key] = r.choices.some(([v]) => v === saved[key]) ? saved[key] : DUEL_DEFAULTS[key];
 }
 // How well the robots play always opens at normal (skill normal, aim even,
 // temper shifting), whatever was picked on an earlier visit (owner, v0.990a:
 // "make it so all bot settings default to normal"). A pick holds until the page closes.
 for (const key of ['skill', 'aim', 'temper', 'allySkill', 'allyAim', 'allyTemper']) out[key] = DUEL_DEFAULTS[key];
 return out;
}

// The picks the developer tools own, and what they play as while locked.
export const DUEL_DEV_KEYS = Object.freeze(['botWeapon', 'allyWeapon', 'allySkill', 'spawn']);
export const lockedPicks = (picks, unlocked) => (unlocked ? { ...picks } : { ...picks, ...Object.fromEntries(DUEL_DEV_KEYS.map(k => [k, DUEL_DEFAULTS[k]])) });

const weaponValue = id => (id ? String(WEAPONS.findIndex(w => w.id === id) + 1) : '0');
// The page's rows (MODE, MAP, YOUR WEAPON, ROUNDS, DIFFICULTY), then the
// developer group; pressed states are set by the menu (sync).
export function duelOptionsHTML(picks, maps) {
 // Maps and weapons: a dropdown picker each (the list scrolls inside it).
 const pictures = (key, label, body) => `<div class="round-setting duel-setting duel-pictures" data-duel="${key}"><span class="round-setting-label">${esc(label)}</span>${pickerHTML(label, body)}</div>`;
 const rowHTML = key => { const r = row(key); return `<div class="round-setting duel-setting" data-duel="${r.key}"><span class="round-setting-label">${esc(r.label)}</span><div class="round-choices" role="group" aria-label="${esc(r.label)}">${r.choices.map(([v, t]) => `<button type="button" class="choice-button" data-choice="${esc(v)}" aria-pressed="false"${choiceName(t)}>${choiceLabel(esc(t))}</button>`).join('')}</div><p class="duel-row-note"></p></div>`; };
 return rowHTML('mode')
  + pictures('map', 'map', mapGridHTML({ label: 'map', maps, pressed: picks.map }))
  + pictures('weapon', 'your weapon', weaponGridHTML({ label: 'your weapon', pressed: weaponValue(picks.weapon), soon: true }))
  + rowHTML('firstTo') + rowHTML('length') + rowHTML('skill')
  + '<details class="dev-only round-dev"><summary>developer</summary><div class="round-settings round-dev-rows">'
  + pictures('botWeapon', 'enemy weapon', weaponGridHTML({ label: 'enemy weapon', pressed: weaponValue(picks.botWeapon), soon: true }))
  + '<div class="duel-allies">'
  + pictures('allyWeapon', 'your bots\' weapon', weaponGridHTML({ label: 'your bots\' weapon', pressed: weaponValue(picks.allyWeapon), soon: true }))
  + rowHTML('allySkill') + rowHTML('spawn') + '</div></div></details>';
}

// `maps`: [{ id, name }] (menuMaps). `start(choices)`. `unlocked()`: whether
// the developer tools are (body.dev-unlocked).
export function buildDuelMenu(container, { maps, start, storage = globalThis.localStorage, unlocked = () => !!globalThis.document?.body?.classList.contains('dev-unlocked') }) {
 const picks = readDuelChoices(storage);
 if (!maps.some(m => m.id === picks.map)) picks.map = maps[0]?.id ?? null;
 const save = () => { try { storage?.setItem(KEY, JSON.stringify(picks)); } catch { /* private window */ } };
 container.classList.add('round-settings', 'duel-options');
 container.innerHTML = duelOptionsHTML(picks, maps);
 const pickers = [...container.querySelectorAll('.picker')].map(wirePicker);

 // Pressed states and notes from `picks`; your robots only in the team modes.
 const sync = () => {
  const value = key => (key.endsWith('eapon') ? weaponValue(picks[key]) : String(picks[key] ?? ''));
  for (const box of container.querySelectorAll('[data-duel]')) {
   const key = box.dataset.duel, v = value(key);
   for (const b of box.querySelectorAll('[data-choice]')) b.setAttribute('aria-pressed', String(b.dataset.choice === v));
   const note = box.querySelector('.duel-row-note'), r = row(key);
   if (note) { note.textContent = r?.notes[v] || ''; note.hidden = !note.textContent; }
  }
  for (const picker of pickers) picker.sync();
  const teams = (DUEL_MODES[picks.mode]?.allies || 0) > 0;
  for (const part of container.querySelectorAll('.duel-allies')) part.hidden = !teams;
  // FFA plays to a clock, the rest in rounds.
  const ffa = !!DUEL_MODES[picks.mode]?.ffa;
  for (const box of container.querySelectorAll('[data-duel="firstTo"]')) box.hidden = ffa;
  for (const box of container.querySelectorAll('[data-duel="length"]')) box.hidden = !ffa;
  // Gun Game: the ladder gives every weapon (yours and the bots').
  const gun = !!DUEL_MODES[picks.mode]?.gungame;
  for (const box of container.querySelectorAll('[data-duel="weapon"],[data-duel="botWeapon"]')) box.hidden = gun;
 };
 container.onclick = event => {
  const button = event.target.closest('[data-choice]'); if (!button || button.disabled) return;
  const key = button.closest('[data-duel]')?.dataset.duel; if (!key) return;
  const v = button.dataset.choice;
  if (key.endsWith('eapon')) picks[key] = weaponFromChoice(v);
  else if (key === 'firstTo' || key === 'length') picks[key] = Number(v);
  else picks[key] = v;
  save(); sync();
 };
 sync();
 // Your random weapon is rolled here; the robots' in the game.
 return { get picks() { return { ...picks }; }, start: () => start({ ...lockedPicks(picks, unlocked()), weapon: playableOr(picks.weapon, null) || randomPlayableWeapon() }), sync };
}
