// The first-time weapon tips (owner, 2026-10-02: "A first-time hint card for
// each weapon: three lines on how it works, shown the first time you pick it.
// (The controls page has it, but nobody reads it.)"). Data only: three short
// lines per weapon, the core attack, its E and its X (abilities), boiled down
// from its `controls` rows in items.js. One set for a keyboard, one for touch
// (touch names the buttons as they appear: items.js `touchButtons`).
//
// Copy rules (AGENTS.md > Interface > Copy): lowercase, plain, minimal
// punctuation, keys as keycaps in brackets ([E], [SPACE]: shown with the
// player's own bindings, config/keybinds.js displayKeys). No numbers that go
// stale when a weapon is tuned. A new weapon adds its entry here
// (tests/weapon-tips.test.js fails until it does; AGENTS.md > Adding a weapon).
// ui/weapon-hint-card.js shows them.
export const WEAPON_TIPS = Object.freeze({
 static: {
  keyboard: ['hold [E] to place orbs around you', '[SPACE] or [LMB] launches them · four or more hit hardest', '[C] streams lightning up close · [X] throws the hex'],
  touch: ['hold PLACE to set orbs around you', 'LAUNCH or a tap on the world throws them · four or more hit hardest', 'hold STREAM up close · HEX, then HEX again to pulse'],
 },
 rifle: {
  keyboard: ['[SPACE] or [LMB] fires · hold for auto, [SHIFT] aims in', '[E] throws a grenade', '[X] nova: harder hits and no ammo used for a few seconds'],
  touch: ['hold FIRE · its bottom slice aims in and fires', 'NADE throws a grenade', 'NOVA: harder hits and no ammo used for a few seconds'],
 },
 shotgun: {
  keyboard: ['[SPACE] or [LMB] fires one shell · the kick throws you back', '[E] fires both shells at once', '[X] readies the blast · [X] again fires it'],
  touch: ['FIRE shoots one shell · the kick throws you back', 'DOUBLE fires both shells at once', 'BLAST readies it · BLAST again fires it'],
 },
 omen: {
  keyboard: ['[SPACE] or [LMB] fires orange diamonds', '[E] primes a curse shot · once it hits, [E] ruptures it', '[X] covenant: homing diamonds · [X] again ruptures them'],
  touch: ['hold FIRE for orange diamonds', 'CURSE primes a shot · once it hits, CURSE ruptures it', 'COVENANT: homing diamonds · tap again to rupture them'],
 },
 sightline: {
  keyboard: ['[SPACE] or [LMB] fires the sidekick', '[E] crouches behind the rifle · [SHIFT] scopes in', '[X] loads an explosive breach round · [X] fires it'],
  touch: ['tap FIRE for the sidekick', 'STANCE crouches behind the rifle · AIM scopes in', 'BREACH loads an explosive round · BREACH fires it'],
 },
 sidekick: {
  keyboard: ['[SPACE] or [LMB] fires one shot a press', '[E] drops a mine at your feet', '[X] rush: a second sidekick · hold fire, no reload'],
  touch: ['tap FIRE · its bottom slice aims in and fires', 'MINE drops a mine at your feet', 'RUSH: a second sidekick · hold FIRE, no reload'],
 },
 ichor: {
  keyboard: ['hold [SPACE] or [LMB] to cut · hold [SHIFT] to guard', '[E] throws a blood slash · needs half your blood', '[X] frenzy: twelve fast strikes'],
  touch: ['hold FIRE to cut · hold GUARD to block shots', 'SLASH throws a blood slash · needs half your blood', 'FRENZY: twelve fast strikes'],
 },
 sheath: {
  keyboard: ['hold [SPACE] or [LMB] for heavy, wide cuts', '[E] gold rush: faster, and twice the reach', '[X] draw-cut: dash ahead and slash through'],
  touch: ['hold FIRE for heavy, wide cuts', 'RUSH: faster, and twice the reach', 'DRAW: dash ahead and slash through'],
 },
});

// The three lines for a weapon on this input ('keyboard' or 'touch'), or null.
export function weaponTips(id, surface) {
 const tips = Object.hasOwn(WEAPON_TIPS, id) ? WEAPON_TIPS[id] : null;
 return tips ? tips[surface === 'touch' ? 'touch' : 'keyboard'] : null;
}
