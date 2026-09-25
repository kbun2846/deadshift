// The menus' pictures (map cards, weapon cards and the weapon pick): still
// images shipped with the game (not a render
// taken when the page opens), made by tools/capture-thumbnail.mjs (maps, in Extreme,
// from each map's `thumbnail` spot) and tools/capture-weapons.mjs (weapons). Inlined into the bundle (`?inline`), so
// they are there the moment the code is, with no request that can fail or
// arrive late, and decoded as soon as the game starts, well before anyone
// opens a menu page: each picture is complete the first time it shows. The
// weapon pictures also spare the menus three WebGL contexts made on the spot.
import deadwater from '../assets/thumbnails/deadwater.webp?inline';
import staticImage from '../assets/weapons/static.webp?inline';
import rifleImage from '../assets/weapons/rifle.webp?inline';
import shotgunImage from '../assets/weapons/shotgun.webp?inline';
import { registerWeaponImages, registerMapImages } from './weapon-grid.js';

export const CARD_IMAGES = Object.freeze({ deadwater });
registerMapImages(CARD_IMAGES);
export const WEAPON_IMAGES = Object.freeze({ static: staticImage, rifle: rifleImage, shotgun: shotgunImage });
registerWeaponImages(WEAPON_IMAGES); // the picture grids (weapon-grid.js)
// Decode them now, off to one side, so the first weapon page is instant.
for (const src of Object.values(WEAPON_IMAGES)) { const image = new Image(); image.src = src; image.decode?.().catch(() => {}); }
export const CARD_SIZE = Object.freeze({ width: 690, height: 855 });

// id -> <img>, already decoding. A map without a picture gets null.
export function cardImage(id, alt) {
 const src = CARD_IMAGES[id]; if (!src) return null;
 const image = new Image(CARD_SIZE.width, CARD_SIZE.height);
 image.decoding = 'async'; image.draggable = false; image.alt = alt; image.src = src;
 image.decode?.().catch(() => {});
 return image;
}
