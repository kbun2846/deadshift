// Weapons under maintenance (owner, 2026-09-29: "disable the sniper weapon by
// putting a maintenance sticker over it in all spots, make a disable
// maintenance option in dev tools"). A weapon listed here keeps its place in
// every menu that shows weapons, with a sticker over it, and cannot be picked:
// not by you, not at random, not by a robot. The developer tools' "Lift weapon
// maintenance" switch lifts it for this page (dev-options.js;
// main.js hands the switch here). Online the host's switch decides what the
// host accepts and gives robots (net/arena.js).
import { WEAPONS, DEFAULT_WEAPON } from './items.js';

export const MAINTENANCE = Object.freeze(['sightline']);
let lifted = false;

export const maintenanceLifted = () => lifted;
export function setMaintenanceLifted(on) {
 lifted = !!on;
 if (typeof document !== 'undefined') document.body?.classList.toggle('maintenance-lifted', lifted);
}
export const underMaintenance = id => !lifted && MAINTENANCE.includes(id);
export const playableWeapons = () => WEAPONS.filter(w => !underMaintenance(w.id));
// A weapon anyone may use, at random (`random`: the caller's own).
export const randomPlayableWeapon = (random = Math.random) => { const list = playableWeapons(); return list[Math.floor(random() * list.length)].id; };
// `id` if it may be used, else `fallback` (DEFAULT_WEAPON, or null for "pick one at random").
export const playableOr = (id, fallback = DEFAULT_WEAPON) => (id && !underMaintenance(id) ? id : fallback);

// The sticker over a weapon's picture (menu-theme.css .maintenance-sticker):
// hidden once maintenance is lifted (body.maintenance-lifted).
export const STICKER_LABEL = 'under maintenance';
export const stickerHTML = () => `<span class="maintenance-sticker" aria-hidden="true"><span class="maintenance-label"><b>UNDER</b><b>MAINTENANCE</b></span></span>`;
