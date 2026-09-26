// Every developer option, in one list. Both places that show the tools read
// it: the Developer tools panel beside Settings (dev-tools.js) and the
// floating window on O (dev-window.js). A new option is one entry here, plus
// the code that honours it; neither surface needs editing.
//
// Weapon options carry `weapon: '<id>'` instead of a section. They all sit
// in one Weapons dropdown, with a dropdown per weapon inside it, built from
// the item registry (items.js WEAPONS) — so a new weapon gets its own dropdown
// automatically, and its options are just entries here with its id.
//
// Kinds:
//   toggle  a switch written to sim.dev[key] (true/false)
//   select  a dropdown written to sim.dev[key] (numbers)
//   action  a button that runs hooks[key]() once
// `bulk: true` puts a toggle/select in the set P flips all at once. Anything
// that changes what you see or can kill you (invulnerable, hide player, hide
// HUD, one-hit kills) stays off that list and is only ever set by hand.
// `where: 'window'` / `'settings'` limits an entry to one surface.
//
// How to get in (nothing about the tools shows before this): pause, press
// Shift+P, enter the access code (checked by dev-code.js, which holds only a
// hash of it; the code is never written in the repository). That adds Developer tools to Settings and makes O
// open the window. Online the tools are the host's alone (joiners' sims are
// reset every tick); freeze and game speed are solo only (main.js).

import { WEAPONS } from '../items.js';
import { workMaps } from '../maps.js';
import { weaponChoices, weaponGridHTML, watchWeaponGrid } from './weapon-grid.js';


export const DEV_SECTIONS = Object.freeze([
  { id: 'general', title: 'General' },
  { id: 'player', title: 'Player' },
  { id: 'weapons', title: 'Weapons', weapons: true },
  { id: 'world', title: 'World' },
  { id: 'robots', title: 'Robots (test)' },
  { id: 'display', title: 'Display' },
]);

const speeds = [['1', '1×'], ['2', '2×'], ['4', '4×']];
const timeScales = [['0.25', '¼×'], ['0.5', '½×'], ['1', '1×'], ['2', '2×']];
const multipliers = [['0.5', '½×'], ['1', '1×'], ['2', '2×'], ['4', '4×']];
const takenScales = [['0', 'None'], ['0.5', '½×'], ['1', '1×'], ['2', '2×']];
const healths = [['500', '500'], ['1000', '1000'], ['2000', '2000'], ['100', '100']];
const robotHealths = [['500', '500 (normal)'], ['100', '100'], ['250', '250'], ['1000', '1000']];
const orbCounts = Array.from({ length: 11 }, (_, i) => [String(i + 2), (i + 2) + ' orbs']);

export const DEV_OPTIONS = Object.freeze([
  { section: 'general', kind: 'toggle', key: 'freeze', label: 'Freeze game (walk only)', quick: true },
  { section: 'general', kind: 'select', key: 'speed', label: 'Run speed', options: speeds, fallback: 1, bulk: true },
  { section: 'general', kind: 'select', key: 'timeScale', label: 'Game speed', options: timeScales, fallback: 1 },
  { section: 'general', kind: 'toggle', key: 'teleport', label: 'Map teleport (M)', bulk: true },
  { section: 'general', kind: 'toggle', key: 'ammo', label: 'Unlimited ammo', bulk: true },
  { section: 'general', kind: 'toggle', key: 'stamina', label: 'Unlimited dodge', bulk: true },
  { section: 'general', kind: 'toggle', key: 'cooldowns', label: 'No ability cooldowns', bulk: true, quick: true },
  { section: 'general', kind: 'toggle', key: 'noKnockback', label: 'No knockback or launch' },
  { section: 'general', kind: 'action', key: 'everything', label: 'Unlimited everything', button: 'On', quick: true },
  { section: 'general', kind: 'action', key: 'resetDev', label: 'All settings back to normal', button: 'Reset' },
  { section: 'general', kind: 'select', key: 'damageOut', label: 'Damage dealt', options: multipliers, fallback: 1 },
  { section: 'general', kind: 'toggle', key: 'oneHit', label: 'One-hit kills' },

  { section: 'player', kind: 'toggle', key: 'invulnerable', label: 'Invulnerable' },
  { section: 'player', kind: 'toggle', key: 'ghost', label: 'Remove my player' },
  { section: 'player', kind: 'select', key: 'damageIn', label: 'Damage taken', options: takenScales, fallback: 1 },
  { section: 'player', kind: 'select', key: 'maxHealth', label: 'Max health', options: healths, fallback: 500 },
  { section: 'player', kind: 'action', key: 'randomSpot', label: 'Move to a random spot', button: 'Move' },
  { section: 'player', kind: 'toggle', key: 'regen', label: 'Regenerate health' },
  { section: 'player', kind: 'action', key: 'refill', label: 'Restore health / ammo', button: 'Restore', quick: true },
  { section: 'player', kind: 'action', key: 'hurt', label: 'Take 50 damage', button: 'Hurt' },
  { section: 'player', kind: 'action', key: 'kill', label: 'Die now', button: 'Die' },

  { weapon: 'static', kind: 'toggle', key: 'orbs', label: 'Unlimited floating orbs', bulk: true },
  { weapon: 'static', kind: 'toggle', key: 'fastSeeds', label: 'Place orbs instantly' },
  { weapon: 'static', kind: 'toggle', key: 'instantHex', label: 'Hex ready to pulse at once' },
  { weapon: 'static', kind: 'action', key: 'fillOrbs', label: 'Place a full ring of orbs', button: 'Place' },

  { weapon: 'rifle', kind: 'toggle', key: 'rifleInstantReload', label: 'Instant reload', bulk: true },
  { weapon: 'rifle', kind: 'toggle', key: 'grenadeCooldown', label: 'No grenade cooldown', bulk: true },
  { weapon: 'rifle', kind: 'toggle', key: 'noRecoil', label: 'No recoil' },
  { weapon: 'rifle', kind: 'toggle', key: 'endlessSurge', label: 'Endless nova' },
  { weapon: 'rifle', kind: 'toggle', key: 'rapidFire', label: 'Double fire rate' },
  { weapon: 'rifle', kind: 'toggle', key: 'noSpread', label: 'No spread (laser)' },
  { weapon: 'rifle', kind: 'action', key: 'surgeNow', label: 'Nova now (skip power-up)', button: 'Nova' },

  { weapon: 'shotgun', kind: 'toggle', key: 'shotgunInstantReload', label: 'Instant reload', bulk: true },
  { weapon: 'shotgun', kind: 'toggle', key: 'shotgunRapid', label: 'No delay between shots' },
  { weapon: 'shotgun', kind: 'action', key: 'scatterNow', label: 'Ready the blast now', button: 'Ready' },

  { section: 'world', kind: 'action', key: 'spawnBird', label: 'Spawn bird', button: 'Spawn' },
  { section: 'world', kind: 'toggle', key: 'freezeTargets', label: 'Freeze moving targets' },
  { section: 'world', kind: 'action', key: 'respawnTargets', label: 'Bring targets back', button: 'Respawn' },
  { section: 'world', kind: 'action', key: 'restoreProps', label: 'Rebuild broken props', button: 'Rebuild' },
  { section: 'world', kind: 'action', key: 'breakNearby', label: 'Break props around me', button: 'Break' },
  { section: 'world', kind: 'action', key: 'killTargets', label: 'Knock down every target', button: 'Knock' },
  { section: 'world', kind: 'select', key: 'blastOrbs', label: 'Blast preview size', options: orbCounts, fallback: 6 },
  { section: 'world', kind: 'action', key: 'previewBlast', label: 'Show blast at aim', button: 'Blast' },
  // Maps still being built (maps.js workMaps): pick one, then Load.
  { section: 'world', kind: 'select', key: 'workMap', label: 'Map in progress', options: workMaps().map((m, i) => [String(i), m.name]), fallback: 0 },
  { section: 'world', kind: 'action', key: 'loadWorkMap', label: 'Load that map', button: 'Load' },

  { section: 'robots', kind: 'select', key: 'robotWeapon', label: 'Robot weapon', options: weaponChoices().map(([value, name]) => [value, name]), grid: 'weapons', fallback: 0 },
  { section: 'robots', kind: 'select', key: 'robotSide', label: 'Robot side', options: [['0', 'Enemy (free for all)'], ['1', 'Enemy team'], ['2', 'Ally (your team)']], fallback: 0 },
  { section: 'robots', kind: 'select', key: 'robotSkill', label: 'Robot skill', options: [['0', 'Random'], ['4', 'Rookie'], ['1', 'Easy'], ['2', 'Normal'], ['3', 'Hard'], ['5', 'Expert'], ['6', 'Perfect']], fallback: 0 },
  { section: 'robots', kind: 'select', key: 'robotStyle', label: 'Robot style', options: [['0', 'Random'], ['1', 'Balanced'], ['2', 'Rusher'], ['3', 'Marksman'], ['4', 'Flanker'], ['5', 'Cautious'], ['6', 'Blend']], fallback: 0 },
  { section: 'robots', kind: 'select', key: 'robotTemper', label: 'Robot temper', options: [['0', 'None (steady)'], ['1', 'Calm'], ['2', 'Shifting'], ['3', 'Aggressive']], fallback: 0 },
  { section: 'robots', kind: 'select', key: 'robotCount', label: 'Robots per spawn', options: [['1', '1'], ['2', '2'], ['3', '3'], ['6', '6']], fallback: 1 },
  { section: 'robots', kind: 'select', key: 'robotHealth', label: 'Robot health', options: robotHealths, fallback: 500 },
  { section: 'robots', kind: 'select', key: 'robotAim', label: 'Robot aim', options: [['1', 'As its skill'], ['0.6', 'Sharper'], ['1.6', 'Sloppier']], fallback: 1 },
  { section: 'robots', kind: 'toggle', key: 'robotPassive', label: 'Robots ignore me' },
  { section: 'robots', kind: 'toggle', key: 'robotHoldFire', label: 'Robots hold fire' },
  { section: 'robots', kind: 'toggle', key: 'robotFreeze', label: 'Robots stand still' },
  { section: 'robots', kind: 'toggle', key: 'robotStayDead', label: 'Robots stay dead' },
  { section: 'robots', kind: 'toggle', key: 'robotSeeAll', label: 'Robots know where everyone is' },
  { section: 'robots', kind: 'toggle', key: 'robotMinds', label: 'Show what robots are thinking' },
  { section: 'robots', kind: 'action', key: 'spawnRobot', label: 'Spawn robot (solo)', button: 'Spawn' },
  { section: 'robots', kind: 'action', key: 'spawnBrawl', label: 'Spawn a brawl (4, free for all)', button: 'Spawn' },
  { section: 'robots', kind: 'action', key: 'hurtRobots', label: 'Damage every robot 100', button: 'Hurt' },
  { section: 'robots', kind: 'action', key: 'destroyRobots', label: 'Destroy every robot', button: 'Destroy' },
  { section: 'robots', kind: 'action', key: 'removeRobots', label: 'Remove all robots', button: 'Remove' },

  { section: 'display', kind: 'select', key: 'quality', label: 'Graphics preset', where: 'window' },
  { section: 'display', kind: 'toggle', key: 'hideHud', label: 'Hide HUD' },
]);

export const optionsFor = where => DEV_OPTIONS.filter(o => !o.where || o.where === where);
export const BULK_KEYS = Object.freeze(DEV_OPTIONS.filter(o => o.bulk).map(o => o.key));

// P: if any bulk override is on, turn them all off; otherwise turn them all on.
// Selects go back to their resting value either way (P never speeds you up).
export function toggleDevOverrides(dev, keys = BULK_KEYS) {
  keys = keys.filter(key => BULK_KEYS.includes(key) || key === 'speed');
  const active = keys.some(key => key === 'speed' ? (dev.speed || 1) !== 1 : !!dev[key]);
  for (const key of keys) dev[key] = key === 'speed' ? 1 : !active;
  return !active;
}

// Shared by every surface's Restore button.
export function refill(sim) {
  sim.player.hp = sim.player.maxHp;
  sim.player.stamina = sim.maxStamina;
  sim.ammo = Math.max(0, 12 - sim.seeds.length - Math.ceil(sim.hexOrbs.length * 10 / 6));
  sim.rifle.ammo = sim.rifle.capacity; sim.rifle.reload = 0;
  sim.shotgun.ammo = 2; sim.shotgun.reload = 0; sim.shotgun.spent = 0;
  if (sim.surge) sim.surge.cooldown = 0; if (sim.scatter) sim.scatter.cooldown = 0; sim.hexCooldown = 0; sim.grenadeCooldown = 0;
}

// Builds the options into `container` as one collapsible dropdown per section,
// and keeps them in step with sim.dev. `hooks` supplies the actions and the
// few selects that are not sim.dev values (quality).
export function buildDevOptions(container, { sim, where, hooks = {}, changed = () => {}, doc = globalThis.document }) {
  const available = optionsFor(where).filter(o => o.kind !== 'action' || hooks[o.key])
    .filter(o => o.key !== 'quality' || (hooks.qualityOptions && hooks.setQuality));
  const dropdown = (title, attribute, id) => {
    const group = doc.createElement('details');
    group.className = 'dev-section'; group.dataset[attribute] = id;
    const summary = doc.createElement('summary'); summary.textContent = title; group.append(summary);
    return group;
  };
  for (const section of DEV_SECTIONS) {
    if (section.weapons) {
      // Weapons: one dropdown holding a dropdown per weapon in the registry.
      const group = dropdown(section.title, 'devSection', section.id);
      for (const weapon of WEAPONS) {
        const inner = dropdown(weapon.name, 'devWeapon', weapon.id);
        const items = available.filter(o => o.weapon === weapon.id);
        if (items.length) for (const option of items) inner.append(row(option));
        else { const none = doc.createElement('p'); none.className = 'dev-empty'; none.textContent = 'No tools for this weapon yet'; inner.append(none); }
        group.append(inner);
      }
      container.append(group);
      continue;
    }
    const items = available.filter(o => o.section === section.id);
    if (!items.length) continue;
    const group = dropdown(section.title, 'devSection', section.id);
    for (const option of items) group.append(row(option));
    container.append(group);
  }
  function row(option) {
    // Weapon choices: a picture grid (weapon-grid.js), the name above it.
    if (option.grid === 'weapons') {
      const box = doc.createElement('div'); box.className = 'dev-row dev-row-grid'; box.dataset.devGrid = option.key;
      const name = doc.createElement('span'); name.textContent = option.label; box.append(name);
      box.insertAdjacentHTML('beforeend', weaponGridHTML({ label: option.label, pressed: String(option.fallback) }));
      watchWeaponGrid(box.querySelector('.weapon-grid-frame'));
      return box;
    }
    const label = doc.createElement('label');
    label.className = 'dev-row'; label.append(option.label);
    if (option.kind === 'toggle') {
      const input = doc.createElement('input'); input.type = 'checkbox'; input.dataset.dev = option.key; label.append(input);
    } else if (option.kind === 'select') {
      const select = doc.createElement('select'); select.dataset.devSelect = option.key;
      for (const [value, text] of option.key === 'quality' ? hooks.qualityOptions() : option.options) {
        const choice = doc.createElement('option'); choice.value = value; choice.textContent = text; select.append(choice);
      }
      label.append(select);
    } else {
      // An action looks like every other row: its name, and a small button.
      const button = doc.createElement('button'); button.type = 'button';
      button.className = 'dev-row-button plain-text'; button.dataset.devAction = option.key;
      button.textContent = option.button || 'Go'; label.append(button);
    }
    return label;
  }
  const sync = () => {
    for (const input of container.querySelectorAll('[data-dev]')) input.checked = !!sim.dev[input.dataset.dev];
    for (const select of container.querySelectorAll('[data-dev-select]')) {
      const key = select.dataset.devSelect, option = DEV_OPTIONS.find(o => o.key === key);
      select.value = key === 'quality' ? hooks.quality() : String(sim.dev[key] ?? option.fallback);
    }
    for (const grid of container.querySelectorAll('[data-dev-grid]')) {
      const key = grid.dataset.devGrid, value = String(sim.dev[key] ?? DEV_OPTIONS.find(o => o.key === key).fallback);
      for (const tile of grid.querySelectorAll('[data-choice]')) tile.setAttribute('aria-pressed', String(tile.dataset.choice === value));
    }
  };
  container.addEventListener('change', event => {
    const toggle = event.target.dataset?.dev, choice = event.target.dataset?.devSelect;
    if (toggle) sim.dev[toggle] = event.target.checked;
    else if (choice === 'quality') hooks.setQuality(event.target.value);
    else if (choice) sim.dev[choice] = Number(event.target.value);
    else return;
    changed();
  });
  container.addEventListener('click', event => {
    const tile = event.target.closest?.('[data-dev-grid] [data-choice]');
    if (tile) { sim.dev[tile.closest('[data-dev-grid]').dataset.devGrid] = Number(tile.dataset.choice); tile.blur?.(); sync(); changed(); return; }
    const action = event.target.closest?.('[data-dev-action]')?.dataset.devAction;
    if (!action) return;
    event.preventDefault();
    hooks[action]?.(); sync(); changed();
  });
  sync();
  return { sync };
}
