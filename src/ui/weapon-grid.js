// A weapon choice as a grid of picture tiles (owner, v130): every menu that
// picks a weapon by name (robot weapon on the 1V1 page, the dev window's
// robot weapon) shows each weapon's shipped picture (map-cards.js) with its
// name under it, in a grid that scrolls once there are more weapons than
// fit. RANDOM, when offered, is a tile of all of them fanned behind a "?".
// The tiles come from the item registry, so a new weapon joins every grid.
import { WEAPONS } from '../items.js';

// The pictures are handed in by map-cards.js (which holds the inlined
// images) as it loads, so this file stays importable without them (tests).
let WEAPON_IMAGES = {}, MAP_IMAGES = {};
export const registerWeaponImages = images => { WEAPON_IMAGES = images || {}; };
export const registerMapImages = images => { MAP_IMAGES = images || {}; };

const esc = text => String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// The choices, in order: [value, name, weapon id or null for random].
export const weaponChoices = ({ random = true } = {}) => [
 ...(random ? [['0', 'Random', null]] : []),
 ...WEAPONS.map((w, i) => [String(i + 1), w.name, w.id]),
];
// A weapon choice's value back to a weapon id (0 = random = null).
export const weaponFromChoice = n => WEAPONS[(Number(n) || 0) - 1]?.id ?? null;

const picture = id => {
 if (id) return WEAPON_IMAGES[id] ? `<img src="${WEAPON_IMAGES[id]}" alt="" decoding="async" draggable="false">` : '';
 // Random: every weapon, small and fanned, behind a question mark.
 const fan = WEAPONS.filter(w => WEAPON_IMAGES[w.id]).slice(0, 3)
  .map((w, i, all) => `<img src="${WEAPON_IMAGES[w.id]}" alt="" decoding="async" draggable="false" style="--fan:${i - (all.length - 1) / 2}">`).join('');
 return `<span class="weapon-tile-fan">${fan}</span><b class="weapon-tile-mystery" aria-hidden="true">?</b>`;
};

// The "coming soon" tile (owner, v132): every weapon and map menu ends with
// one, greyed and not pressable, so the list reads as growing.
export const SOON_LABEL = 'coming soon';
export const soonTileHTML = (kind = 'weapon') => `<button type="button" class="weapon-tile weapon-tile-soon plain-text" disabled aria-disabled="true" title="More ${kind}s coming soon"><span class="weapon-tile-picture"><b class="weapon-tile-mystery" aria-hidden="true">+</b></span><span class="weapon-tile-name">${SOON_LABEL}</span></button>`;

const tile = ({ value, name, picture: art, pressed, extra = '', attrs = '' }) =>
 `<button type="button" class="weapon-tile plain-text${extra}" data-choice="${esc(value)}" aria-pressed="${String(value) === String(pressed)}" title="${esc(name)}" ${attrs}><span class="weapon-tile-picture">${art}</span><span class="weapon-tile-name">${esc(name)}</span></button>`;
const frame = (label, tiles, kind = 'weapon') => `<div class="weapon-grid-frame"><div class="weapon-grid${kind === 'map' ? ' map-grid' : ''}" role="group" aria-label="${esc(label)}">${tiles}</div></div>`;

// `attrs(value)`: extra attributes for each tile (the caller's own hooks).
// `soon`: end with the coming-soon tile.
export function weaponGridHTML({ label, pressed = '0', random = true, soon = false, attrs = () => '' }) {
 const tiles = weaponChoices({ random }).map(([value, name, id]) => tile({ value, name, picture: picture(id), pressed, extra: id ? '' : ' weapon-tile-random', attrs: attrs(value) })).join('');
 return frame(label, tiles + (soon ? soonTileHTML('weapon') : ''));
}
// Maps the same way: `maps` [{ id, name }], the shipped top-down picture
// (map-cards.js) as the tile's picture. Values are map ids.
export function mapGridHTML({ label, maps, pressed, soon = true }) {
 const tiles = maps.map(m => tile({ value: m.id, name: m.name, picture: MAP_IMAGES[m.id] ? `<img src="${MAP_IMAGES[m.id]}" alt="" decoding="async" draggable="false">` : '', pressed, extra: ' map-tile' })).join('');
 return frame(label, tiles + (soon ? soonTileHTML('map') : ''), 'map');
}

// Scroll cue: the frame fades its bottom edge while more tiles lie below.
export function watchWeaponGrid(frame) {
 const grid = frame?.querySelector('.weapon-grid'); if (!grid) return;
 const update = () => frame.classList.toggle('has-more', grid.clientHeight > 0 && grid.scrollHeight - grid.clientHeight - grid.scrollTop > 3);
 grid.addEventListener('scroll', update, { passive: true });
 if (typeof ResizeObserver === 'function') new ResizeObserver(update).observe(grid);
 update();
}
