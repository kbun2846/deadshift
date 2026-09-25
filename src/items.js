// The item registry: every weapon and every skin, each with a unique id and
// its data defined here and nowhere else. Menus, the HUD and the tutorial read
// names and descriptions from here.
//
// Two kinds of item, kept apart on purpose:
//  - weapons are gameplay: they have stats. The numbers themselves live in
//    config/gameplay.js; `stats` says which block tunes this weapon.
//  - skins are cosmetic only: how something looks. A skin can never change a
//    stat, so selling one can never sell an advantage.
//
// Ownership is decided by the authority (the host now, a server or account
// backend later) and sent to the game as a list of ids. The game never trusts
// its own copy for anything paid: see `ownedItems` below and AGENTS.md.

import { RIFLE, SHOTGUN, SURGE, GRENADE, SCATTER, RULES } from './config/gameplay.js';
import { GAME_KEYS } from './config/controls.js';
export const ITEM_KIND = Object.freeze({ WEAPON: 'weapon', SKIN: 'skin' });

// Weapon traits the shared code asks about instead of naming weapons:
//   input   'orbs'    Static's scheme: E places, LMB/Space launches, C streams, X hex.
//           'trigger' a gun: LMB/Space (or FIRE) fires, RMB/Shift aims in,
//                     R reloads, E and X are the weapon's two extras.
//   smoothCursor  the mouse aim point glides (precision weapons); off = raw.
//   tutorial      per-weapon course tweaks (targetHp: sturdier range targets).
//   touchButtons  trigger weapons: what the two extra touch buttons say and
//                 which key they press ({ label, binding, key }).
//   adsFire       touch: the bottom slice of FIRE aims and fires at once
//                 (Nominal, where aiming in matters most).
// A new weapon adds its entry here, its numbers in config/gameplay.js and its
// step function in simulation.js (WEAPON_STEPS); see AGENTS.md > Adding a weapon.
export const WEAPONS = Object.freeze([
 { id: 'static', kind: ITEM_KIND.WEAPON, name: 'Static', stats: 'RULES', input: 'orbs', smoothCursor: true,
   description: 'place drifting electric orbs and launch them in volleys, pour on a lightning stream, or throw out the hex',
   previewAlt: 'Static — light-blue electric gun with a yellow muzzle', accent: '#b8e6ef', capacity: 12,
   // Settings > Controls > Weapons: [action, keybind, note?] rows.
   controls: [['Place orbs','Hold E / hold PLACE'],
  ['Launch placed orbs','Left click / Space / tap the world / LAUNCH','Four or more at once hit much harder than three.'],
  ['Quick shot','Left click / Space / tap the world / LAUNCH','With no orbs placed, fires one orb for 1 ammo.'],
  ['Hex','X / HEX, then X again',`X throws out the hex (needs ${RULES.hexCost} orbs in hand: the X mark on the orb bar); X again pulses it once it has formed. Its spinning sides zap whoever they cross. ${RULES.hexCooldown}-second cooldown.`],
  ['Lightning stream','Hold C / hold STREAM','Up close; stay on one target to ramp it up. Release to stop.'],
  ['Dodge','Left Ctrl / DODGE','One dodge; it refills after a moment.']],
   hints: { keyboard: [['E', 'PLACE'], ['LMB / SPACE', 'LAUNCH'], ['C', 'STREAM'], ['X', 'HEX']], touch: [['PLACE', 'HOLD'], ['LAUNCH', 'TAP'], ['STREAM', 'HOLD'], ['HEX', 'TAP TWICE']] } },
 { id: 'rifle', kind: ITEM_KIND.WEAPON, name: 'Nominal', stats: 'RIFLE', input: 'trigger', smoothCursor: true, adsFire: true,
   touchButtons: { extended: { label: 'NOVA', binding: 'X', key: 'KeyX', aria: 'Nova' }, grenade: { label: 'NADE', binding: 'E', key: GAME_KEYS.secondary, aria: 'Throw grenade' }, aim: { binding: 'RMB / SHIFT' } },
   description: 'steady, accurate fire from a classic automatic rifle, with grenades and the nova for when it counts',
   previewAlt: 'Nominal — matte steel rifle, wooden stock and olive-green grenade', accent: '#e1cca2', capacity: RIFLE.magazine,
   // Settings > Controls > Weapons: [action, keybind, note?] rows.
   controls: [['Fire','Left click or Space / hold either / hold FIRE','One bullet per press; hold for automatic fire. On touch the bottom slice of FIRE aims in and fires together.'],['Aim in','Hold right click or Shift / hold AIM','Reduces spread at any distance and slows the walk. Standing still also tightens it; moving widens it.'],['Reload','R / RELOAD',`${RIFLE.magazine} rounds; ${RIFLE.reload}-second reload. Dropped magazines remain for ${RIFLE.magazineLife} seconds.`],['Nova','X / NOVA',`${SURGE.charge} seconds of power-up, then ${SURGE.duration} seconds glowing white: bullets do ${SURGE.damage}x damage and use no ammo, you take ${Math.round((1-SURGE.taken)*100)}% less damage and move ${Math.round((SURGE.speed-1)*100)}% faster. Ends with a full magazine; ${SURGE.cooldown}-second cooldown.`],['Throw grenade','E / NADE',`${GRENADE.fuse}-second fuse, ${GRENADE.cooldown}-second cooldown. Aim within ${GRENADE.range} metres. Deals ${GRENADE.damage+GRENADE.bonus} damage within ${GRENADE.coreRadius} metres, falling to ${GRENADE.edgeDamage+GRENADE.bonus} at the ${GRENADE.radius}-metre blast edge (${GRENADE.surgeBonus-GRENADE.bonus} more during nova); cover blocks it.`],['Dodge','Left Ctrl / DODGE','One dodge; it refills after a moment.']],
   hints: { keyboard: [['LMB / SPACE', 'FIRE / HOLD'], ['RMB / SHIFT', 'AIM'], ['R', 'RELOAD'], ['E', 'GRENADE'], ['X', 'NOVA']],
     touch: [['FIRE', 'HOLD'], ['AIM', 'HOLD'], ['RELOAD', 'TAP'], ['NADE', 'TAP'], ['NOVA', 'TAP']] } },
 { id: 'shotgun', kind: ITEM_KIND.WEAPON, name: 'Ballast', stats: 'SHOTGUN', input: 'trigger', smoothCursor: false, tutorial: { targetHp: 400 },
   touchButtons: { extended: { label: 'BLAST', binding: 'X', key: 'KeyX', aria: 'Blast' }, grenade: { label: 'DOUBLE', binding: 'E', key: GAME_KEYS.secondary, aria: 'Fire both shells' }, aim: { binding: 'RMB / SHIFT' } },
   description: 'a heavy double barrel whose recoil throws you, and the blast, a volley of red shells that burst across the ground',
   previewAlt: 'Ballast — matte double-barrel shotgun with walnut stock', accent: '#e6bd8e', capacity: 2,
   // Settings > Controls > Weapons: [action, keybind, note?] rows.
   controls: [['Fire','LMB or Space / FIRE',`One shell per press, up to ${SHOTGUN.shellDamage+SHOTGUN.firstShellBonus} damage point blank and about half that at mid range. Reaches ${SHOTGUN.range} metres, and every shot throws you back. Two shells.`],['Aim in','Hold right click or Shift / hold AIM','Narrows the cone, so more pellets land further out.'],['Double shot','E / DOUBLE','Fires both remaining shells 0.05 seconds apart, or the last shell.'],['Blast','X / BLAST, then X again',`X readies it (the cone turns red); X again fires ${SCATTER.shells} big red shells that each split into ${SCATTER.split} and end in small explosions. Up to ${SCATTER.max} damage on one target. ${SCATTER.cooldown}-second cooldown.`],['Reload','R / RELOAD',`Break open, eject spent shells, insert shells and close. ${SHOTGUN.reload} seconds; firing after the first shell loads cancels the rest.`],['Dodge','Left Ctrl / DODGE','Two dodges; they refill after a moment.']],
   hints: { keyboard: [['LMB / SPACE', 'FIRE'], ['RMB / SHIFT', 'AIM'], ['E', 'DOUBLE'], ['R', 'RELOAD'], ['X', 'BLAST']],
     touch: [['FIRE', 'TAP'], ['AIM', 'HOLD'], ['DOUBLE', 'TAP'], ['RELOAD', 'TAP'], ['BLAST', 'TAP TWICE']] } },
]);

// Skins. Each weapon has a default one, which is simply how it looks today.
// A future skin adds an entry here with `appliesTo` and whatever visual data
// its model needs; nothing in gameplay reads this list.
export const SKINS = Object.freeze(WEAPONS.map(weapon => ({
 id: weapon.id + '.default', kind: ITEM_KIND.SKIN, appliesTo: weapon.id, name: 'Standard', visual: null,
})));

export const ITEMS = Object.freeze([...WEAPONS, ...SKINS]);
const byId = new Map(ITEMS.map(item => [item.id, item]));
export const item = id => byId.get(id) || null;
export const weapon = id => (item(id)?.kind === ITEM_KIND.WEAPON ? item(id) : null);

// The weapon everyone starts with, and what anything unknown falls back to
// (an old link, a message from an older version, a typo in ?weapon=).
export const DEFAULT_WEAPON = WEAPONS[0].id;
export const WEAPON_IDS = Object.freeze(WEAPONS.map(w => w.id));
export const isWeapon = id => WEAPON_IDS.includes(id);
export const weaponOrDefault = id => (isWeapon(id) ? id : DEFAULT_WEAPON);
// Gun-style controls (fire / aim / reload) rather than Static's orbs.
export const usesTrigger = id => weapon(id)?.input === 'trigger';

// What every player has without buying anything.
export const STARTER_ITEMS = Object.freeze(ITEMS.map(i => i.id));

// The owned list comes from the authority. Anything it names that is not a
// real item is dropped, and with no list at all a player has the starter set,
// which is everything today. A client never adds to this list itself.
export function ownedItems(granted = STARTER_ITEMS) {
 return new Set((Array.isArray(granted) ? granted : STARTER_ITEMS).filter(id => byId.has(id)));
}
