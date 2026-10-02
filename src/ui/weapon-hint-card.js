// The first-time weapon tip card (owner, 2026-10-02: "A first-time hint card
// for each weapon: three lines on how it works, shown the first time you pick
// it."). The lines are weapon-tips.js's; this file decides when the card shows
// and draws it.
//
// When: the first time a weapon is in your hands in a live game (playing,
// alive, not paused; not in the tutorial, which teaches it anyway), a moment
// after it arrives (`TIP_CARD.delay`), for `TIP_CARD.show` seconds or until
// its X is pressed. Remembered per weapon and per input (a keyboard player
// who later plays the same browser by touch gets the touch lines once too):
// `deadstab-weapon-tips` in localStorage. A card counts as seen once it has
// run its time, been dismissed, or been up for `TIP_CARD.settle` seconds when
// something cut it short (a weapon change, leaving the game); cut shorter, it
// comes back the next time that weapon is played. Paused or dead, it is hidden
// and waits. Gun Game hands out a weapon a kill: there a tip counts as seen
// the moment it shows, so no weapon's tip comes up twice. Never more than one
// card at a time, and never the same tip twice in one page.
//
// Where: the left side, low on a computer (clear of the weapon panel at the
// bottom centre and the fight in the middle), top left under the health bar
// on a phone (styles/weapon-hints.css). It never takes the pointer except its
// X, so it covers nothing you can press. Media mode hides it with the other
// notices (data-media="notices"). Settings > Controls > WEAPON TIPS: SHOW
// AGAIN forgets every tip seen.
import { weaponTips } from '../weapon-tips.js';
import { weapon as weaponInfo } from '../items.js';
import { displayKeys } from '../config/keybinds.js';

export const TIP_CARD = Object.freeze({ delay: .9, show: 7, settle: 2.5 });
export const TIPS_KEY = 'deadstab-weapon-tips';
const SURFACES = ['keyboard', 'touch'];

// Which tips this browser has seen. Bad or missing data: none seen.
export function createTipMemory(storage = (() => { try { return globalThis.localStorage || null; } catch { return null; } })()) {
 let seen = { keyboard: new Set(), touch: new Set() };
 try {
  const saved = JSON.parse(storage?.getItem(TIPS_KEY) || '{}');
  for (const s of SURFACES) if (Array.isArray(saved?.[s])) seen[s] = new Set(saved[s].filter(id => typeof id === 'string' && weaponTips(id, s)));
 } catch { /* unreadable: nothing seen */ }
 const save = () => { try { storage?.setItem(TIPS_KEY, JSON.stringify(Object.fromEntries(SURFACES.map(s => [s, [...seen[s]]])))); } catch { /* private window */ } };
 const surface = s => (s === 'touch' ? 'touch' : 'keyboard');
 return {
  seen: (id, s) => seen[surface(s)].has(id),
  mark(id, s) { if (!weaponTips(id, s) || seen[surface(s)].has(id)) return; seen[surface(s)].add(id); save(); },
  reset() { seen = { keyboard: new Set(), touch: new Set() }; try { storage?.removeItem(TIPS_KEY); } catch { /* private window */ } },
  get count() { return seen.keyboard.size + seen.touch.size; },
 };
}

// The decisions, no DOM. frame(dt, { started, live, weapon, surface,
// tutorial, gunGame }) returns what to show ({ weapon, surface, lines, left
// 0..1 }) or null. `dismiss()` is the card's X.
export function createTipTracker({ memory, timing = TIP_CARD } = {}) {
 let card = null, waiting = null;
 const shownThisPage = new Set();
 const finish = (counted) => { if (card && (counted || card.age >= timing.settle || card.gunGame)) memory.mark(card.weapon, card.surface); card = null; };
 return {
  get card() { return card; },
  dismiss() { finish(true); },
  // Forget what this page has shown (Settings: SHOW AGAIN).
  reset() { card = null; waiting = null; shownThisPage.clear(); },
  frame(dt, { started = false, live = false, weapon = null, surface = 'keyboard', tutorial = false, gunGame = false } = {}) {
   if (!started) { finish(false); waiting = null; return null; }
   // A new weapon in hand: the old tip is done with.
   if (card && card.weapon !== weapon) finish(false);
   if (!live) return null;
   if (card) {
    card.age += dt;
    if (card.age >= timing.show) { finish(true); return null; }
    return { weapon: card.weapon, surface, lines: weaponTips(card.weapon, surface), left: 1 - card.age / timing.show };
   }
   const lines = weaponTips(weapon, surface);
   if (!lines || tutorial || memory.seen(weapon, surface) || shownThisPage.has(weapon + ':' + surface)) { waiting = null; return null; }
   if (!waiting || waiting.weapon !== weapon || waiting.surface !== surface) waiting = { weapon, surface, time: 0 };
   waiting.time += dt;
   if (waiting.time < timing.delay) return null;
   waiting = null; shownThisPage.add(weapon + ':' + surface);
   card = { weapon, surface, age: 0, gunGame };
   if (gunGame) memory.mark(weapon, surface);
   return { weapon, surface, lines, left: 1 };
  },
 };
}

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
// '[E] throws' -> '<kbd>E</kbd> throws', with the player's own key names; a
// touch button's name (a word in capitals: NADE, BLAST) is set as it appears
// on the button (the page lowercases all other text, style.css).
const buttonNames = text => esc(text).replace(/\b[A-Z][A-Z-]+\b/g, word => `<b class="weapon-hint-button">${word}</b>`);
export const tipMarkup = line => String(line).split(/(\[[^\]]+\])/).map(part => (/^\[.+\]$/.test(part) ? `<kbd>${esc(displayKeys(part.slice(1, -1)))}</kbd>` : buttonNames(part))).join('');

// The card itself, in #game. frame(dt, ctx) as the tracker's, once a frame.
export function createWeaponHintCard(parent, { memory = createTipMemory(), timing = TIP_CARD } = {}) {
 const tracker = createTipTracker({ memory, timing });
 const root = document.createElement('aside');
 root.className = 'weapon-hint'; root.hidden = true; root.dataset.media = 'notices';
 root.setAttribute('role', 'status'); root.setAttribute('aria-live', 'polite');
 root.innerHTML = '<header><small>new weapon</small><strong></strong><button type="button" class="weapon-hint-close plain-text" aria-label="Got it" title="Got it"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button></header><ol></ol><i class="weapon-hint-time" aria-hidden="true"></i>';
 parent.append(root);
 const title = root.querySelector('strong'), list = root.querySelector('ol'), time = root.querySelector('.weapon-hint-time');
 root.querySelector('button').addEventListener('click', e => { e.stopPropagation(); tracker.dismiss(); draw(null); });
 // (A press on the card never reaches the world: no shot fired by dismissing it.)
 for (const type of ['pointerdown', 'mousedown', 'touchstart']) root.addEventListener(type, e => e.stopPropagation(), { passive: true });
 let drawnKey = '';
 function draw(view) {
  if (!view) { if (!root.hidden) { root.hidden = true; drawnKey = ''; } return; }
  const key = view.weapon + ':' + view.surface;
  if (key !== drawnKey) {
   drawnKey = key;
   const info = weaponInfo(view.weapon);
   title.textContent = (info?.name || view.weapon).toLowerCase();
   root.style.setProperty('--weapon-hint-accent', info?.accent || 'var(--ui-accent)');
   list.innerHTML = view.lines.map(line => `<li>${tipMarkup(line)}</li>`).join('');
   root.dataset.surface = view.surface;
  }
  time.style.transform = `scaleX(${Math.max(0, Math.min(1, view.left)).toFixed(3)})`;
  if (root.hidden) root.hidden = false;
 }
 return {
  root, tracker, memory,
  frame(dt, ctx) { draw(tracker.frame(dt, ctx)); },
  dismiss() { tracker.dismiss(); draw(null); },
  // Settings > Controls > WEAPON TIPS: SHOW AGAIN.
  resetSeen() { memory.reset(); tracker.reset(); draw(null); },
 };
}

// Settings > Controls: WEAPON TIPS, SHOW AGAIN (before the reference). One
// press (it only brings tips back, nothing is lost); the note says so.
export function installTipReset(controls, reset) {
 if (!controls || controls.querySelector('#tips-reset')) return null;
 const row = document.createElement('div');
 row.className = 'settings-row';
 row.innerHTML = '<span class="settings-label">weapon tips</span><div class="settings-control"><div class="settings-choices" role="group" aria-label="weapon tips"><button type="button" id="tips-reset" class="choice-button">SHOW AGAIN</button></div><p class="settings-note" id="tips-reset-note">each weapon\'s three tips show the first time you play it</p></div>';
 const before = controls.querySelector('.settings-heading');
 if (before) before.before(row); else controls.append(row);
 row.querySelector('#tips-reset').addEventListener('click', () => { reset(); row.querySelector('#tips-reset-note').textContent = 'tips will show again'; });
 return row;
}
