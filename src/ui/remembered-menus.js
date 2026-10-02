// The remembered choices on the menu pages (remembered-choices.js holds the
// what and why). menu.js installs this once and calls `focus(page)` each time
// a page shows. It only marks and focuses: nothing is picked or started for
// the player.
//  - gamemodes: the last mode used is the page's main action (the `primary`
//    button, with a pink edge: data-remembered) and has the focus;
//  - BOTS: START has the focus (its picks are kept by duel-menu.js);
//  - maps: the last Practice map's card is marked and has the focus;
//  - weapons (Practice, a tutorial course, the online pick page): the weapon
//    of the last game played is marked and has the focus;
//  - JOIN / HOST: a username typed is kept even without joining.
import { MODE_BUTTONS, readLastMode, saveLastMode, readLastMap, saveLastMap, readLastWeapon, mainMode } from './remembered-choices.js';
import { saveName } from '../online-play.js';

export function installRememberedMenus($) {
 const modeOf = new Map(Object.entries(MODE_BUTTONS).map(([mode, id]) => [id, mode]));
 for (const [id, mode] of modeOf) $(id)?.addEventListener('click', () => saveLastMode(mode));
 $('map-options')?.addEventListener('click', e => { const card = e.target.closest?.('.map-choice[data-map]'); if (card && !card.disabled) saveLastMap(card.dataset.map); });
 for (const id of ['online-name', 'host-name']) $(id)?.addEventListener('change', e => { const name = e.target.value.trim().slice(0, 16); if (name) saveName(name); });
 const mark = (list, pick) => { let found = null; for (const el of list) { const on = pick(el); el.toggleAttribute('data-remembered', on); if (on) found = el; } return found; };
 const focus = el => { try { el?.focus({ preventScroll: true }); } catch { el?.focus(); } };
 return {
  // After menu.js's own show(): the remembered choice of this page.
  focus(page) {
   if (page === 'modes') {
    const shown = mode => { const b = $(MODE_BUTTONS[mode]); return !!b && !b.hidden; };
    const main = mainMode(readLastMode(), shown);
    for (const [mode, id] of Object.entries(MODE_BUTTONS)) { const b = $(id); if (!b) continue; b.classList.toggle('primary', mode === main); b.classList.toggle('secondary', mode !== main); b.toggleAttribute('data-remembered', mode === main && readLastMode() === main); }
    focus($(MODE_BUTTONS[main]));
   } else if (page === 'duel') focus($('duel-start'));
   else if (page === 'maps') {
    const cards = [...($('map-options')?.querySelectorAll('.map-choice[data-map]') || [])];
    const last = readLastMap(cards.map(c => c.dataset.map));
    focus(mark(cards, c => c.dataset.map === last));
   } else if (page === 'weapons') {
    const last = readLastWeapon();
    const cards = [...($('weapon-options')?.querySelectorAll('.weapon-card') || [])];
    const card = mark(cards, c => !!last && c.dataset.weapon === last);
    if (card) focus(card.querySelector('.weapon-choice'));
   }
  },
 };
}
