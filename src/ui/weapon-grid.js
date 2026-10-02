// A weapon choice as a grid of picture tiles (owner, v130): every menu that
// picks a weapon by name (robot weapon on the 1V1 page, the dev window's
// robot weapon) shows each weapon's shipped picture (map-cards.js) with its
// name under it, in a grid that scrolls once there are more weapons than
// fit. RANDOM, when offered, is a tile of all of them fanned behind a "?".
// The tiles come from the item registry, so a new weapon joins every grid.
import { WEAPONS } from '../items.js';
import { MAINTENANCE, stickerHTML } from '../weapon-maintenance.js';

// The pictures are handed in by map-cards.js (which holds the inlined
// images) as it loads, so this file stays importable without them (tests).
let WEAPON_IMAGES = {}, MAP_IMAGES = {};
export const registerWeaponImages = images => { WEAPON_IMAGES = images || {}; };
export const registerMapImages = images => { MAP_IMAGES = images || {}; };
// One weapon's shipped picture (or undefined), for markup built elsewhere (the death card's weapon row).
export const weaponImage = id => WEAPON_IMAGES[id];

const esc = text => String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// The choices, in order: [value, name, weapon id or null for random].
export const weaponChoices = ({ random = true } = {}) => [
 ...(random ? [['0', 'Random', null]] : []),
 ...WEAPONS.map((w, i) => [String(i + 1), w.name, w.id]),
];
// A weapon choice's value back to a weapon id (0 = random = null).
export const weaponFromChoice = n => WEAPONS[(Number(n) || 0) - 1]?.id ?? null;

const picture = id => {
 if (id) return WEAPON_IMAGES[id] ? `<img src="${WEAPON_IMAGES[id]}" data-weapon-art="${esc(id)}" alt="" decoding="async" draggable="false">` : '';
 // Random: every weapon, small and fanned, behind a question mark.
 const fan = WEAPONS.filter(w => WEAPON_IMAGES[w.id]).slice(0, 3)
  .map((w, i, all) => `<img src="${WEAPON_IMAGES[w.id]}" alt="" decoding="async" draggable="false" style="--fan:${i - (all.length - 1) / 2}">`).join('');
 return `<span class="weapon-tile-fan">${fan}</span><b class="weapon-tile-mystery" aria-hidden="true">?</b>`;
};

// The "coming soon" tile (owner, v132): every weapon and map menu ends with
// one, greyed and not pressable, so the list reads as growing.
export const SOON_LABEL = 'coming soon';
export const soonTileHTML = (kind = 'weapon') => `<button type="button" class="weapon-tile weapon-tile-soon plain-text" disabled aria-disabled="true" title="More ${kind}s coming soon"><span class="weapon-tile-picture"><b class="weapon-tile-mystery" aria-hidden="true">+</b></span><span class="weapon-tile-name">${SOON_LABEL}</span></button>`;

const tile = ({ value, name, picture: art, pressed, extra = '', attrs = '', title = name }) =>
 `<button type="button" class="weapon-tile plain-text${extra}" data-choice="${esc(value)}" aria-pressed="${String(value) === String(pressed)}" title="${esc(title)}" ${attrs}><span class="weapon-tile-picture">${art}</span><span class="weapon-tile-name">${esc(name)}</span></button>`;
const frame = (label, tiles, kind = 'weapon') => `<div class="weapon-grid-frame"><div class="weapon-grid${kind === 'map' ? ' map-grid' : ''}" role="group" aria-label="${esc(label)}">${tiles}</div></div>`;

// `attrs(value)`: extra attributes for each tile (the caller's own hooks).
// `soon`: end with the coming-soon tile.
// A weapon under maintenance keeps its tile, with the sticker over its picture
// (weapon-maintenance.js; main.js refuses the click while it is on).
export function weaponGridHTML({ label, pressed = '0', random = true, soon = false, attrs = () => '' }) {
 const fixing = id => id && MAINTENANCE.includes(id);
 const tiles = weaponChoices({ random }).map(([value, name, id]) => tile({ value, name, picture: picture(id) + (fixing(id) ? stickerHTML() : ''), pressed, extra: (id ? '' : ' weapon-tile-random') + (fixing(id) ? ' maintenance-tile' : ''), attrs: attrs(value) + (fixing(id) ? ` data-maintenance="${esc(id)}"` : '') })).join('');
 return frame(label, tiles + (soon ? soonTileHTML('weapon') : ''));
}
// Maps the same way: `maps` [{ id, name }], the shipped top-down picture
// (map-cards.js) as the tile's picture. Values are map ids.
export function mapGridHTML({ label, maps, pressed, soon = true }) {
 const tiles = maps.map(m => tile({ value: m.id, name: m.name, picture: MAP_IMAGES[m.id] ? `<img src="${MAP_IMAGES[m.id]}" alt="" decoding="async" draggable="false">` : '', pressed, extra: ' map-tile', title: m.card?.line ? `${m.name}: ${m.card.line}` : m.name /* s3-look: the card's line */ })).join('');
 return frame(label, tiles + (soon ? soonTileHTML('map') : ''), 'map');
}

// A dropdown picker (owner, v0.9b: lists will outgrow one screen): a button
// showing what is picked (its picture and name, a caret), and under it, when
// opened, the grid in a scrolling panel. `grid`: weaponGridHTML / mapGridHTML
// output. Wire it with wirePicker (opens and closes; a pick closes it).
export const pickerHTML = (label, grid) => `<div class="picker"><button type="button" class="picker-toggle plain-text" aria-expanded="false" aria-label="${esc(label)}"><span class="picker-thumb"></span><span class="picker-name"></span><i class="picker-caret" aria-hidden="true"></i></button><div class="picker-panel" hidden>${grid}</div></div>`;
// Shows the pressed tile on the toggle.
export function syncPicker(picker) {
 const on = picker.querySelector('.weapon-tile[aria-pressed="true"]'); if (!on) return;
 const thumb = picker.querySelector('.picker-thumb'), name = on.querySelector('.weapon-tile-name')?.textContent || '';
 if (thumb.dataset.for !== on.dataset.choice) { thumb.dataset.for = on.dataset.choice; thumb.innerHTML = on.querySelector('.weapon-tile-picture')?.innerHTML || ''; thumb.classList.toggle('picker-thumb-random', on.classList.contains('weapon-tile-random')); thumb.classList.toggle('picker-thumb-map', on.classList.contains('map-tile')); }
 picker.querySelector('.picker-name').textContent = name;
}
const OPEN = new Set();
// How tall an open panel's grid may be, in the page's own px (`scale`: the
// page's fit, menu-fit.js), with `below` / `above` px of screen either side of
// the bar and `chrome` px of the panel that is not the grid (padding, edges):
// under the bar when the grid fits there or there is more room there than
// above, else over it (`up`). `max` null: the stylesheet's own cap stands.
export function panelPlacement({ natural, below, above, chrome = 0, scale = 1, least = 120 }) {
 const room = px => Math.floor(px / (scale || 1) - chrome);
 const down = room(below), over = room(above);
 if (natural <= down) return { up: false, max: null };
 if (down >= Math.min(natural, least) || down >= over) return { up: false, max: Math.max(60, down) };
 return { up: true, max: natural <= over ? null : Math.max(60, over) };
}
// Menus never scroll now (menu-fit.js), so an open panel must fit on the
// screen: its grid is capped to the room under the bar, or it opens upward
// when there is more room above. (Measured on screen, then turned back into
// the page's own px when the page is scaled to fit.)
function placePanel(picker) {
 const panel = picker.querySelector('.picker-panel'), grid = panel?.querySelector('.weapon-grid');
 if (!grid || panel.hidden || typeof getComputedStyle !== 'function') return;
 grid.style.maxHeight = ''; picker.classList.remove('picker-up');
 const toggle = picker.querySelector('.picker-toggle'), bar = toggle.getBoundingClientRect();
 const box = picker.closest('.lobby-columns,.lobby-players,.menu-shell,.lobby-screen,.modal')?.getBoundingClientRect();
 const top = Math.max(0, box?.top ?? 0) + 6, bottom = Math.min(innerHeight, box?.bottom ?? innerHeight) - 6;
 const scale = toggle.offsetHeight ? bar.height / toggle.offsetHeight : 1;
 const { up, max } = panelPlacement({ natural: grid.offsetHeight, below: bottom - bar.bottom, above: bar.top - top, chrome: panel.offsetHeight - grid.offsetHeight, scale });
 picker.classList.toggle('picker-up', up);
 if (max != null) grid.style.maxHeight = `${max}px`;
}
// Scrolls only the grid to show the picked tile (scrollIntoView could also
// move a page that is meant to stay in place).
function revealTile(grid, tile) {
 if (!grid || !tile) return;
 const g = grid.getBoundingClientRect(), t = tile.getBoundingClientRect(), k = grid.offsetHeight ? g.height / grid.offsetHeight : 1;
 if (t.top < g.top) grid.scrollTop -= (g.top - t.top) / k + 4;
 else if (t.bottom > g.bottom) grid.scrollTop += (t.bottom - g.bottom) / k + 4;
}
export function wirePicker(picker) {
 const toggle = picker.querySelector('.picker-toggle'), panel = picker.querySelector('.picker-panel');
 const open = on => {
  panel.hidden = !on; toggle.setAttribute('aria-expanded', String(on)); picker.classList.toggle('open', on);
  if (on) { for (const other of OPEN) if (other !== close) other(); OPEN.add(close); placePanel(picker); revealTile(panel.querySelector('.weapon-grid'), panel.querySelector('.weapon-tile[aria-pressed="true"]')); }
  else OPEN.delete(close);
 };
 const close = () => open(false);
 toggle.onclick = () => open(panel.hidden);
 // (The panel floats over the page, v0.999a: a tap or click outside it, or
 // Escape, closes it; opening one closes any other.)
 picker.ownerDocument?.addEventListener?.('pointerdown', e => { if (!panel.hidden && !picker.contains(e.target)) close(); }, true);
 picker.addEventListener?.('keydown', e => { if (e.key === 'Escape' && !panel.hidden) { e.stopPropagation(); e.preventDefault(); close(); toggle.focus(); } });
 panel.addEventListener('click', e => { if (e.target.closest('.weapon-tile:not(:disabled)')) setTimeout(() => { open(false); toggle.focus(); }); });
 watchWeaponGrid(panel.querySelector('.weapon-grid-frame'));
 picker.ownerDocument?.defaultView?.addEventListener?.('resize', () => { if (!panel.hidden) placePanel(picker); });
 syncPicker(picker);
 return { open, sync: () => syncPicker(picker) };
}

// Scroll cue: the frame fades its bottom edge while more tiles lie below.
export function watchWeaponGrid(frame) {
 const grid = frame?.querySelector('.weapon-grid'); if (!grid) return;
 const update = () => frame.classList.toggle('has-more', grid.clientHeight > 0 && grid.scrollHeight - grid.clientHeight - grid.scrollTop > 3);
 grid.addEventListener('scroll', update, { passive: true });
 if (typeof ResizeObserver === 'function') new ResizeObserver(update).observe(grid);
 update();
}
