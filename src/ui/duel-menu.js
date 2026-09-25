// The SOLO page (Gamemodes > SOLO, was VS ROBOTS; 1V1 in v132, 2V2 and 3V3 in
// v0.9b): the mode, the map, your weapon (or random); then ENEMY ROBOTS and
// YOUR ROBOTS (team modes only), each with weapon (or random), skill, aim and
// temper; then MATCH: first to, and friendly fire in the team modes. Picture
// grids (weapon-grid.js) for maps and weapons, each ending in a coming-soon
// tile; the other choices are the lobby's round-settings rows (label, then
// pink-when-picked choices) with a one-line note under the pick. The last
// picks are remembered on this device. START hands them to `start` (menu.js
// launches the game; duel.js runs it).
import { WEAPONS, DEFAULT_WEAPON } from '../items.js';
import { SKILL_LEVELS } from '../bots/robot-profile.js';
import { DUEL_DEFAULTS, DUEL_FIRST_TO, DUEL_MODES } from '../duel.js';
import { weaponGridHTML, mapGridHTML, weaponFromChoice, pickerHTML, wirePicker } from './weapon-grid.js';

const KEY = 'deadshift.duel';
const esc = text => String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Short notes (owner, v0.9b: two words a skill, temper shorter).
const SKILL_NOTES = { rookie: 'slow, wild', easy: 'often misses', normal: 'fair fighter', hard: 'sharp, tricky', expert: 'rarely misses', perfect: 'nearly unbeatable' };
const AIM_NOTES = { sloppier: 'shakier hand', even: 'its own aim', sharper: 'steadier hand' };
const TEMPER_NOTES = { calm: 'keeps its distance', shifting: 'calm, then pushy', aggressive: 'always pushing' };
const robotRows = (prefix, who) => [
 { key: prefix ? prefix + 'Skill' : 'skill', label: who + ' skill', choices: SKILL_LEVELS.map(id => [id, id]), notes: SKILL_NOTES },
 { key: prefix ? prefix + 'Aim' : 'aim', label: who + ' aim', choices: [['sloppier', 'sloppier'], ['even', 'as its skill'], ['sharper', 'sharper']], notes: AIM_NOTES },
 { key: prefix ? prefix + 'Temper' : 'temper', label: who + ' temper', choices: [['calm', 'calm'], ['shifting', 'shifting'], ['aggressive', 'aggressive']], notes: TEMPER_NOTES },
];
// Rows: key, label, [value, text] choices, and a note for the picked choice.
export const DUEL_ROWS = Object.freeze([
 { key: 'mode', label: 'mode', choices: Object.entries(DUEL_MODES).map(([id, m]) => [id, m.name]),
  notes: { '1v1': 'you against a robot', '2v2': 'you and a robot vs two', '3v3': 'you and two robots vs three' } },
 ...robotRows('', 'enemy'),
 ...robotRows('ally', 'your robots\''),
 { key: 'firstTo', label: 'first to', choices: DUEL_FIRST_TO.map(n => [String(n), n ? String(n) : 'endless']), notes: {} },
 { key: 'spawn', label: 'spawns', choices: [['scattered', 'scattered'], ['team', 'with team']], notes: {} },
 { key: 'friendlyFire', label: 'friendly fire', choices: [['on', 'on'], ['off', 'off']], notes: {} },
]);
const row = key => DUEL_ROWS.find(r => r.key === key);

export function readDuelChoices(storage = globalThis.localStorage) {
 let saved = {};
 try { saved = JSON.parse(storage?.getItem(KEY) || '{}') || {}; } catch { saved = {}; }
 const ids = WEAPONS.map(w => w.id);
 const out = {
  map: typeof saved.map === 'string' ? saved.map : null,
  // null: random (rolled at START).
  weapon: saved.weapon === null ? null : ids.includes(saved.weapon) ? saved.weapon : DEFAULT_WEAPON,
  botWeapon: ids.includes(saved.botWeapon) ? saved.botWeapon : null,
  allyWeapon: ids.includes(saved.allyWeapon) ? saved.allyWeapon : null,
  firstTo: DUEL_FIRST_TO.includes(saved.firstTo) ? saved.firstTo : DUEL_DEFAULTS.firstTo,
 };
 for (const key of ['mode', 'skill', 'aim', 'temper', 'allySkill', 'allyAim', 'allyTemper', 'friendlyFire', 'spawn']) {
  const r = row(key); out[key] = r.choices.some(([v]) => v === saved[key]) ? saved[key] : DUEL_DEFAULTS[key];
 }
 return out;
}

// `maps`: [{ id, name }] (menuMaps). `start(choices)`.
export function buildDuelMenu(container, { maps, start, storage = globalThis.localStorage }) {
 const picks = readDuelChoices(storage);
 if (!maps.some(m => m.id === picks.map)) picks.map = maps[0]?.id ?? null;
 const save = () => { try { storage?.setItem(KEY, JSON.stringify(picks)); } catch { /* private window */ } };
 const weaponValue = id => (id ? String(WEAPONS.findIndex(w => w.id === id) + 1) : '0');
 // Maps and weapons: a dropdown picker each (the list scrolls inside it).
 const pictures = (key, label, body) => `<div class="round-setting duel-setting duel-pictures" data-duel="${key}"><span class="round-setting-label">${esc(label)}</span>${pickerHTML(label, body)}</div>`;
 const rowHTML = key => { const r = row(key); return `<div class="round-setting duel-setting" data-duel="${r.key}"><span class="round-setting-label">${esc(r.label)}</span><div class="round-choices" role="group" aria-label="${esc(r.label)}">${r.choices.map(([v, t]) => `<button type="button" class="plain-text" data-choice="${esc(v)}" aria-pressed="false">${esc(t)}</button>`).join('')}</div><p class="duel-row-note"></p></div>`; };
 const heading = (text, cls = '') => `<div class="duel-heading ${cls}">${esc(text)}</div>`;
 container.classList.add('round-settings', 'duel-options');
 container.innerHTML = rowHTML('mode')
  + pictures('map', 'map', mapGridHTML({ label: 'map', maps, pressed: picks.map }))
  + pictures('weapon', 'your weapon', weaponGridHTML({ label: 'your weapon', pressed: weaponValue(picks.weapon), soon: true }))
  + heading('enemy robots')
  + pictures('botWeapon', 'enemy weapon', weaponGridHTML({ label: 'enemy weapon', pressed: weaponValue(picks.botWeapon), soon: true }))
  + rowHTML('skill') + rowHTML('aim') + rowHTML('temper')
  + `<div class="duel-allies">${heading('your robots')}`
  + pictures('allyWeapon', 'their weapon', weaponGridHTML({ label: 'your robots\' weapon', pressed: weaponValue(picks.allyWeapon), soon: true }))
  + rowHTML('allySkill') + rowHTML('allyAim') + rowHTML('allyTemper') + '</div>'
  + heading('match') + rowHTML('firstTo') + `<div class="duel-allies">${rowHTML('spawn')}${rowHTML('friendlyFire')}</div>`;
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
 };
 container.onclick = event => {
  const button = event.target.closest('[data-choice]'); if (!button || button.disabled) return;
  const key = button.closest('[data-duel]')?.dataset.duel; if (!key) return;
  const v = button.dataset.choice;
  if (key.endsWith('eapon')) picks[key] = weaponFromChoice(v);
  else if (key === 'firstTo') picks.firstTo = Number(v);
  else picks[key] = v;
  save(); sync();
 };
 sync();
 // Your random weapon is rolled here; the robots' in the game.
 return { get picks() { return { ...picks }; }, start: () => start({ ...picks, weapon: picks.weapon || WEAPONS[Math.floor(Math.random() * WEAPONS.length)].id }), sync };
}
