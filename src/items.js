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

export const ITEM_KIND = Object.freeze({ WEAPON: 'weapon', SKIN: 'skin' });

export const WEAPONS = Object.freeze([
 { id: 'static', kind: ITEM_KIND.WEAPON, name: 'Static', stats: 'RULES',
   description: 'place drifting electric orbs, launch focused volleys, or unleash a hex pulse and lightning stream',
   previewAlt: 'Static — light-blue electric gun with a yellow muzzle', accent: '#b8e6ef', capacity: 12,
   // Settings > Controls > Weapons: [action, keybind, note?] rows.
   controls: [['Place orbs','Hold E / hold PLACE'],
  ['Launch placed orbs','Left click / Q / tap world / Q button'],
  ['Quick shot','Q / left click / tap world / Q button','With no drifting orbs, fires one orb for 1 ammo.'],
  ['Hex deploy / pulse','X / X button','Press again after formation to pulse. Costs 10 ammo.'],
  ['Lightning stream','Hold C / hold C button','Release to stop.']],
   hints: { keyboard: [['E', 'PLACE'], ['LMB / Q', 'LAUNCH'], ['C', 'STREAM']], touch: [['PLACE', 'HOLD'], ['LAUNCH', 'TAP'], ['STREAM', 'HOLD']] } },
 { id: 'rifle', kind: ITEM_KIND.WEAPON, name: 'Nominal', stats: 'RIFLE',
   description: 'deliver steady, accurate fire with a classic automatic rifle built for dependable mid range combat',
   previewAlt: 'Nominal — matte steel rifle, wooden stock and olive-green grenade', accent: '#e1cca2', capacity: 18,
   // Settings > Controls > Weapons: [action, keybind, note?] rows.
   controls: [['Fire','Left click or Q / hold either / hold FIRE','One bullet per press; hold for automatic fire.'],['Aim precisely','Hold right click or Shift / hold AIM','Reduces spread at any distance. Standing still also improves accuracy.'],['Reload','R / RELOAD','18 rounds; 1.8-second reload. Dropped magazines remain for 30 seconds.'],['Extended magazine','X / X touch button','Loads 36 rounds in 1.8 seconds. Available every 60 seconds; R loads a standard 18-round magazine.'],['Throw grenade','E / E touch button','1.4-second fuse, 25-second cooldown. Aim within 12 metres. Deals 240 damage within 0.7 metres, falling to 35 at the 4-metre blast edge; cover blocks it.']],
   hints: { keyboard: [['LMB / Q', 'FIRE / HOLD'], ['RMB / SHIFT', 'AIM'], ['R', 'RELOAD'], ['E', 'GRENADE'], ['X', '36 ROUNDS']],
     touch: [['FIRE', 'HOLD'], ['AIM', 'HOLD'], ['RELOAD', 'TAP'], ['GRENADE', 'TAP'], ['EXTEND', '36 ROUNDS']] } },
 { id: 'shotgun', kind: ITEM_KIND.WEAPON, name: 'Ballast', stats: 'SHOTGUN',
   description: 'charge a heavy double barrel and ride its recoil into devastating close range blasts',
   previewAlt: 'Ballast — matte double-barrel shotgun with walnut stock', accent: '#e6bd8e', capacity: 2,
   // Settings > Controls > Weapons: [action, keybind, note?] rows.
   controls: [['Charge / fire','Hold / release LMB or Q / FIRE','115–315 damage on the first shell; 100–300 on the second if every pellet lands. Two shells; one native dodge.'],['Store charge','Shift or click RMB while charging / LOCK','Keeps the same charge for both shells for 15 seconds.'],['Double shot','E / DOUBLE','Fires both remaining shells 0.05 seconds apart, or the last shell.'],['Focus cone','Hold Shift or RMB / AIM','Narrows the short cone; pressing either also stores a live charge. Charge increases range from 7.5 to 9 metres.'],['Reload','R / RELOAD','Break open, eject spent shells, insert shells and close. 2.8 seconds; firing after the first shell loads cancels the rest.']],
   hints: { keyboard: [['LMB / Q', 'CHARGE / RELEASE'], ['SHIFT / RMB', 'STORE / FOCUS'], ['E', 'DOUBLE'], ['R', 'RELOAD']],
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

// What every player has without buying anything.
export const STARTER_ITEMS = Object.freeze(ITEMS.map(i => i.id));

// The owned list comes from the authority. Anything it names that is not a
// real item is dropped, and with no list at all a player has the starter set,
// which is everything today. A client never adds to this list itself.
export function ownedItems(granted = STARTER_ITEMS) {
 return new Set((Array.isArray(granted) ? granted : STARTER_ITEMS).filter(id => byId.has(id)));
}
