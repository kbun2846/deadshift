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

import { RIFLE } from './config/gameplay.js';
import { GAME_KEYS } from './config/controls.js';
export const ITEM_KIND = Object.freeze({ WEAPON: 'weapon', SKIN: 'skin' });

// Weapon traits the shared code asks about instead of naming weapons:
//   input   'orbs'    Static's scheme: E places, LMB/Space launches, C streams, X hex.
//           'trigger' a gun: LMB/Space (or FIRE) fires or charges, RMB/Shift aims,
//                     R reloads, E and X are the weapon's two extras.
//   smoothCursor  the mouse aim point glides (precision weapons); off = raw.
//   tutorial      per-weapon course tweaks (targetHp: sturdier range targets).
//   touchButtons  trigger weapons: what the two extra touch buttons say and
//                 which key they press ({ label, binding, key }).
//   storesCharge  a right click / AIM tap while charging stores the charge.
//   adsFire       touch: the bottom slice of FIRE aims and fires at once (a
//                 weapon whose AIM does something else, like Ballast storing
//                 its charge, leaves it off).
// A new weapon adds its entry here, its numbers in config/gameplay.js and its
// step function in simulation.js (WEAPON_STEPS); see AGENTS.md > Adding a weapon.
export const WEAPONS = Object.freeze([
 { id: 'static', kind: ITEM_KIND.WEAPON, name: 'Static', stats: 'RULES', input: 'orbs', smoothCursor: true,
   description: 'place drifting electric orbs, launch focused volleys, or unleash a hex pulse and lightning stream',
   previewAlt: 'Static — light-blue electric gun with a yellow muzzle', accent: '#b8e6ef', capacity: 12,
   // Settings > Controls > Weapons: [action, keybind, note?] rows.
   controls: [['Place orbs','Hold E / hold PLACE'],
  ['Launch placed orbs','Left click / Space / tap world / FIRE button'],
  ['Quick shot','Space / left click / tap world / FIRE button','With no drifting orbs, fires one orb for 1 ammo.'],
  ['Hex deploy / pulse','X / X button','Press again after formation to pulse. Costs 10 ammo.'],
  ['Lightning stream','Hold C / hold C button','Release to stop.']],
   hints: { keyboard: [['E', 'PLACE'], ['LMB / SPACE', 'LAUNCH'], ['C', 'STREAM']], touch: [['PLACE', 'HOLD'], ['LAUNCH', 'TAP'], ['STREAM', 'HOLD']] } },
 { id: 'rifle', kind: ITEM_KIND.WEAPON, name: 'Nominal', stats: 'RIFLE', input: 'trigger', smoothCursor: true, adsFire: true,
   touchButtons: { extended: { label: 'EXTEND', binding: 'X', key: 'KeyX', aria: `Load ${RIFLE.extendedMagazine}-round magazine` }, grenade: { label: 'NADE', binding: 'E', key: GAME_KEYS.secondary, aria: 'Throw grenade' }, aim: { binding: 'RMB / SHIFT' } },
   description: 'deliver steady, accurate fire with a classic automatic rifle built for dependable mid range combat',
   previewAlt: 'Nominal — matte steel rifle, wooden stock and olive-green grenade', accent: '#e1cca2', capacity: RIFLE.magazine,
   // Settings > Controls > Weapons: [action, keybind, note?] rows.
   controls: [['Fire','Left click or Space / hold either / hold FIRE','One bullet per press; hold for automatic fire.'],['Aim precisely','Hold right click or Shift / hold AIM','Reduces spread at any distance. Standing still also improves accuracy.'],['Reload','R / RELOAD',`${RIFLE.magazine} rounds; ${RIFLE.reload}-second reload. Dropped magazines remain for ${RIFLE.magazineLife} seconds.`],['Extended magazine','X / X touch button',`Loads ${RIFLE.extendedMagazine} rounds in ${RIFLE.reload} seconds. Available every ${RIFLE.extendedCooldown} seconds; R loads a standard ${RIFLE.magazine}-round magazine.`],['Throw grenade','E / NADE touch button','1.4-second fuse, 25-second cooldown. Aim within 12 metres. Deals 240 damage within 0.7 metres, falling to 35 at the 4-metre blast edge; cover blocks it.']],
   hints: { keyboard: [['LMB / SPACE', 'FIRE / HOLD'], ['RMB / SHIFT', 'AIM'], ['R', 'RELOAD'], ['E', 'GRENADE'], ['X', RIFLE.extendedMagazine + ' ROUNDS']],
     touch: [['FIRE', 'HOLD'], ['AIM', 'HOLD'], ['RELOAD', 'TAP'], ['NADE', 'TAP'], ['EXTEND', RIFLE.extendedMagazine + ' ROUNDS']] } },
 { id: 'shotgun', kind: ITEM_KIND.WEAPON, name: 'Ballast', stats: 'SHOTGUN', input: 'trigger', smoothCursor: false, tutorial: { targetHp: 400 }, storesCharge: true,
   touchButtons: { extended: { label: 'LOCK', binding: 'SHIFT / RMB', key: 'MouseRight', aria: 'Store charge' }, grenade: { label: 'DOUBLE', binding: 'E', key: GAME_KEYS.secondary, aria: 'Fire both shells' }, aim: { binding: 'RMB' } },
   description: 'charge a heavy double barrel and ride its recoil into devastating close range blasts',
   previewAlt: 'Ballast — matte double-barrel shotgun with walnut stock', accent: '#e6bd8e', capacity: 2,
   // Settings > Controls > Weapons: [action, keybind, note?] rows.
   controls: [['Charge / fire','Hold / release LMB or Space / FIRE','115–315 damage on the first shell; 100–300 on the second if every pellet lands. Two shells; one native dodge.'],['Store charge','Shift or click RMB while charging / LOCK','Keeps the same charge for both shells for 15 seconds.'],['Double shot','E / DOUBLE','Fires both remaining shells 0.05 seconds apart, or the last shell.'],['Focus cone','Hold Shift or RMB / AIM','Narrows the short cone; pressing either also stores a live charge. Charge increases range from 7.5 to 9 metres.'],['Reload','R / RELOAD','Break open, eject spent shells, insert shells and close. 2.8 seconds; firing after the first shell loads cancels the rest.']],
   hints: { keyboard: [['LMB / SPACE', 'CHARGE / RELEASE'], ['SHIFT / RMB', 'STORE / FOCUS'], ['E', 'DOUBLE'], ['R', 'RELOAD']],
     touch: [['FIRE', 'HOLD / RELEASE'], ['LOCK', 'STORE'], ['AIM', 'FOCUS'], ['DOUBLE', 'TAP'], ['RELOAD', 'TAP']] } },
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
