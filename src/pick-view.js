// Where the camera looks while a player picks their weapon online: straight
// down on one part of the map from high above (above the birds, so they cross
// under it), the same spot for everyone. Nobody spawns inside the ground that
// view shows (net/arena.js), so a player picking never watches someone appear.
//
// A map can set `pickView: { x, z, height }`; otherwise its menu thumbnail spot
// is used.
export const PICK_HEIGHT = 44;
export function pickView(map) {
  const spot = map.pickView || map.thumbnail || map.spawn;
  return { x: spot.x, z: spot.z, height: spot.height || PICK_HEIGHT };
}

// The ground the pick view shows, generously: the camera's vertical field of
// view is at most 49 degrees (portrait), the widest screens about 2.4:1, and
// the camera sits slightly behind its focus (CAMERA_TILT), so the rectangle is
// padded on every side.
export function pickArea(map) {
  const view = pickView(map);
  const halfDepth = view.height * Math.tan(24.5 * Math.PI / 180) * 1.2 + 2;
  const halfWidth = halfDepth * 2.4;
  return { x: view.x, z: view.z, halfWidth, halfDepth };
}

export const inPickArea = (area, x, z) => !!area && Math.abs(x - area.x) <= area.halfWidth && Math.abs(z - area.z) <= area.halfDepth;
