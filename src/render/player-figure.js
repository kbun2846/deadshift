// The plain figure's colour (v0.999a, owner: "just a white player skin ... pure
// white. Also make one of these in a slight blueish color"). The figure itself
// is rigged (figure-rig.js) and picked in the developer menu (player-skin.js).
import * as THREE from 'three';

export const FIGURE_SKINS = Object.freeze({ white: '#ffffff', blue: '#d3e3ff' });

// Pure white on screen, not the warm cream a white surface turns under a
// map's sun and sky (owner: "not white ... skin color, just pure white"). The
// map's light (render/map-look.js: sky, bounce, sun) is summed roughly as it
// falls on an upright body, and the figure's colour is its inverse, scaled so
// the brightest channel is a little over 1 (`FIGURE_LIFT`: back up to
// white after the balance dims it): lit, it comes out neutral. A little white glow
// (`emissive`) keeps the shaded side from going grey-brown.
export const FIGURE_GLOW = .3, FIGURE_LIFT = 1.12;
export function figureBalance(look) {
  if (!look) return new THREE.Color(1, 1, 1);
  const sky = new THREE.Color(look.sky), bounce = new THREE.Color(look.bounce), sun = new THREE.Color(look.sun);
  const si = look.skyIntensity ?? 2, su = look.sunIntensity ?? 2.5;
  const light = sky.multiplyScalar(si * .7).add(bounce.multiplyScalar(si * .3)).add(sun.multiplyScalar(su * .5));
  const low = Math.min(light.r, light.g, light.b);
  return light.r > 0 && light.g > 0 && light.b > 0 ? new THREE.Color(low / light.r, low / light.g, low / light.b).multiplyScalar(FIGURE_LIFT) : new THREE.Color(1, 1, 1);
}
export function figureMaterial(skin = 'white', balance = null) {
  const material = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, metalness: 0, emissive: '#ffffff', emissiveIntensity: FIGURE_GLOW });
  material.userData.figure = true; material.userData.balance = balance || new THREE.Color(1, 1, 1);
  setFigureSkin(material, skin);
  return material;
}
export function setFigureSkin(material, skin) {
  if (!material) return;
  const balance = material.userData.balance || new THREE.Color(1, 1, 1), base = new THREE.Color(FIGURE_SKINS[skin] || FIGURE_SKINS.white);
  material.color.copy(base).multiply(balance);
  // (The glow is neutral for white; for the blue skin it carries the blue.)
  material.emissive.copy(base);
}
