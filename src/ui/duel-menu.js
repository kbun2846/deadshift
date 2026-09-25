// The 1V1 page (Gamemodes > 1V1, owner v132): map, your weapon, the robot's
// weapon (or random), then the robot's skill and a little tweaking, and
// first to. Picture grids (weapon-grid.js) for maps and weapons, each ending
// in a coming-soon tile; the other choices are the round-settings rows the
// lobby uses (label, then pink-when-picked choices). The last picks are
// remembered on this device. START hands the choices to `start` (menu.js
// launches the game; duel.js runs it).
import { WEAPONS, DEFAULT_WEAPON } from '../items.js';
import { SKILL_LEVELS } from '../bots/robot-profile.js';
import { DUEL_DEFAULTS, DUEL_FIRST_TO } from '../duel.js';
import { weaponGridHTML, mapGridHTML, weaponFromChoice, watchWeaponGrid } from './weapon-grid.js';

const KEY = 'deadshift.duel';
const esc = text => String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Rows: key, label, [value, text] choices, and a one-line note under the row
// for the picked choice (what it does).
export const DUEL_ROWS = Object.freeze([
 { key: 'skill', label: 'robot skill', choices: SKILL_LEVELS.map(id => [id, id]),
  notes: { rookie: 'slow to react, wild aim, barely dodges', easy: 'slow hands, misses often, knows a few tricks', normal: 'quick, fair aim, reads the fight', hard: 'sharp, dodges, uses every weapon trick', expert: 'fastest hands, rarely misses, plays every angle' } },
 { key: 'aim', label: 'robot aim', choices: [['sloppier', 'sloppier'], ['even', 'as its skill'], ['sharper', 'sharper']],
  notes: { sloppier: 'a shakier hand than its skill', even: 'the aim its skill gives it', sharper: 'a steadier hand than its skill' } },
 { key: 'temper', label: 'robot temper', choices: [['calm', 'calm'], ['shifting', 'shifting'], ['aggressive', 'aggressive']],
  notes: { calm: 'mostly patient: keeps its range, takes cover sooner', shifting: 'swings between patient and aggressive as the fight goes', aggressive: 'mostly pushing: closes in, hunts longer, hides late' } },
 { key: 'firstTo', label: 'first to', choices: DUEL_FIRST_TO.map(n => [String(n), n ? String(n) : 'endless']), notes: {} },
]);

export function readDuelChoices(storage = globalThis.localStorage) {
 let saved = {};
 try { saved = JSON.parse(storage?.getItem(KEY) || '{}') || {}; } catch { saved = {}; }
 const ids = WEAPONS.map(w => w.id);
 return {
  map: typeof saved.map === 'string' ? saved.map : null,
  weapon: ids.includes(saved.weapon) ? saved.weapon : DEFAULT_WEAPON,
  botWeapon: ids.includes(saved.botWeapon) ? saved.botWeapon : null,
  skill: SKILL_LEVELS.includes(saved.skill) ? saved.skill : DUEL_DEFAULTS.skill,
  aim: ['sloppier', 'even', 'sharper'].includes(saved.aim) ? saved.aim : DUEL_DEFAULTS.aim,
  temper: ['calm', 'shifting', 'aggressive'].includes(saved.temper) ? saved.temper : DUEL_DEFAULTS.temper,
  firstTo: DUEL_FIRST_TO.includes(saved.firstTo) ? saved.firstTo : DUEL_DEFAULTS.firstTo,
 };
}

// `maps`: [{ id, name }] (menuMaps). `start(choices)`.
export function buildDuelMenu(container, { maps, start, storage = globalThis.localStorage }) {
 const picks = readDuelChoices(storage);
 if (!maps.some(m => m.id === picks.map)) picks.map = maps[0]?.id ?? null;
 const save = () => { try { storage?.setItem(KEY, JSON.stringify(picks)); } catch { /* private window */ } };
 const weaponValue = id => String(WEAPONS.findIndex(w => w.id === id) + 1);
 const section = (key, label, body) => `<div class="round-setting duel-setting duel-pictures" data-duel="${key}"><span class="round-setting-label">${esc(label)}</span>${body}</div>`;
 const row = r => `<div class="round-setting duel-setting" data-duel="${r.key}"><span class="round-setting-label">${esc(r.label)}</span><div class="round-choices" role="group" aria-label="${esc(r.label)}">${r.choices.map(([v, t]) => `<button type="button" class="plain-text" data-choice="${esc(v)}" aria-pressed="false">${esc(t)}</button>`).join('')}</div><p class="duel-row-note"></p></div>`;
 container.classList.add('round-settings', 'duel-options');
 container.innerHTML = section('map', 'map', mapGridHTML({ label: 'map', maps, pressed: picks.map }))
  + section('weapon', 'your weapon', weaponGridHTML({ label: 'your weapon', pressed: weaponValue(picks.weapon), random: false, soon: true }))
  + section('botWeapon', 'robot weapon', weaponGridHTML({ label: 'robot weapon', pressed: picks.botWeapon ? weaponValue(picks.botWeapon) : '0', soon: true }))
  + DUEL_ROWS.map(row).join('');
 for (const frame of container.querySelectorAll('.weapon-grid-frame')) watchWeaponGrid(frame);

 // Pressed states and notes from `picks`.
 const sync = () => {
  const value = key => key === 'weapon' ? weaponValue(picks.weapon) : key === 'botWeapon' ? (picks.botWeapon ? weaponValue(picks.botWeapon) : '0') : String(picks[key] ?? '');
  for (const box of container.querySelectorAll('[data-duel]')) {
   const key = box.dataset.duel, v = value(key);
   for (const b of box.querySelectorAll('[data-choice]')) b.setAttribute('aria-pressed', String(b.dataset.choice === v));
   const note = box.querySelector('.duel-row-note'), r = DUEL_ROWS.find(x => x.key === key);
   if (note) { note.textContent = r?.notes[v] || ''; note.hidden = !note.textContent; }
  }
 };
 container.onclick = event => {
  const button = event.target.closest('[data-choice]'); if (!button || button.disabled) return;
  const key = button.closest('[data-duel]')?.dataset.duel; if (!key) return;
  const v = button.dataset.choice;
  if (key === 'weapon') picks.weapon = weaponFromChoice(v) || DEFAULT_WEAPON;
  else if (key === 'botWeapon') picks.botWeapon = weaponFromChoice(v);
  else if (key === 'firstTo') picks.firstTo = Number(v);
  else picks[key] = v;
  save(); sync();
 };
 sync();
 return { get picks() { return { ...picks }; }, start: () => start({ ...picks }), sync };
}
