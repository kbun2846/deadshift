// Keeps the sun's shadow map from crawling as the camera moves.
//
// The sun follows the camera focus, which is a smoothed float, so every shadow
// update used to move the shadow map by some fraction of a texel. Each edge was
// then rasterised onto a slightly different texel grid than the frame before,
// and shadow edges shimmered and crept -- worst on Balanced, whose 1024 map
// spreads each texel over roughly four centimetres and refreshes at 30Hz, and
// most visible indoors, where walls and furniture throw hard straight shadows
// right under the camera.
//
// The fix is the standard one: only ever move the light by whole texels in
// its own view plane. The grid then stays put relative to the world and an
// edge falls on the same texels every update. Movement along the light's own
// direction does not change where anything lands on the map, so only the two
// axes across the map are snapped.

// The light looks along `direction` (from the sun toward its target) with
// three.js's default up vector, which is how its shadow camera is oriented.
export function lightBasis(direction) {
  const len = Math.hypot(direction.x, direction.y, direction.z) || 1;
  // Camera-space z points from the target back toward the eye.
  const z = { x: -direction.x / len, y: -direction.y / len, z: -direction.z / len };
  // x = up × z, with up = (0, 1, 0).
  let x = { x: z.z, y: 0, z: -z.x };
  const xl = Math.hypot(x.x, x.z) || 1;
  x = { x: x.x / xl, y: 0, z: x.z / xl };
  // y = z × x.
  const y = { x: z.y * x.z - z.z * x.y, y: z.z * x.x - z.x * x.z, z: z.x * x.y - z.y * x.x };
  return { x, y };
}

const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;

// Returns the focus moved by less than one texel so that its position across
// the shadow map is an exact multiple of the texel size.
export function snapShadowFocus(focus, basis, texelX, texelY) {
  const a = dot(focus, basis.x), b = dot(focus, basis.y);
  const da = Math.round(a / texelX) * texelX - a;
  const db = Math.round(b / texelY) * texelY - b;
  return {
    x: focus.x + basis.x.x * da + basis.y.x * db,
    y: focus.y + basis.x.y * da + basis.y.y * db,
    z: focus.z + basis.x.z * da + basis.y.z * db,
  };
}
