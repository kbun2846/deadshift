import { buildingPoint } from '../maps.js';
export const OUTDOOR_CAMERA_HEIGHT = 29;
export const CAMERA_TILT = 11.5 / 33;

// A fair view on every screen. The reference is a 16:9 screen with a 40 degree
// vertical field of view. Nobody sees further than that screen does sideways
// (its half-width is the longest reach anyone gets, in any direction), and
// within that cap every screen sees as much ground as it does (the same area).
// So an ultrawide monitor no longer sees further to the sides (it trades some
// height for it), and a phone held upright gets extra height, up to the cap,
// for the width it lacks. Returns the vertical field of view in degrees.
const REF_ASPECT = 16 / 9, REF_TAN = Math.tan(20 * Math.PI / 180), REACH = REF_TAN * REF_ASPECT;
export function fairFov(aspect) {
  const a = Math.max(.2, aspect || REF_ASPECT);
  const tan = Math.min(REF_TAN * Math.sqrt(REF_ASPECT / a), REACH / a, REACH);
  return 2 * Math.atan(tan) * 180 / Math.PI;
}

// Can a player whose screen has this shape (width / height) see the ground
// `dx, dz` metres from them (east, south) and `dy` metres above their own
// ground? The outdoor camera as drawn: OUTDOOR_CAMERA_HEIGHT above them,
// CAMERA_TILT back to the south, fairFov(aspect). `side` and `end`: how far
// inside the sides and the top or bottom edge it must be (metres at that
// spot). Robots use it so none fires from off a phone's or tablet's screen.
const TILT_LENGTH = Math.hypot(1, CAMERA_TILT), LOOK = OUTDOOR_CAMERA_HEIGHT * TILT_LENGTH * TILT_LENGTH;
export function onScreenOf(aspect, dx, dz, dy = 0, side = 0, end = 0) {
  const a = Math.max(.2, aspect || REF_ASPECT), tan = Math.tan(fairFov(a) * Math.PI / 360);
  // Sideways, at the spot's own depth in front of the camera.
  if (Math.abs(dx) + side > (LOOK - dy - CAMERA_TILT * dz) / TILT_LENGTH * tan * a) return false;
  // Up or down the screen, moved `end` further toward the edge it is nearer.
  const z = dz + (CAMERA_TILT * dy - dz > 0 ? -end : end), depth = (LOOK - dy - CAMERA_TILT * z) / TILT_LENGTH;
  return depth > 0 && Math.abs(CAMERA_TILT * dy - z) / TILT_LENGTH <= depth * tan;
}

export function interiorCameraHeight(room, aspect, fovDegrees = 40) {
  if (room.followCamera) return 25;
  const tilt = Math.atan(CAMERA_TILT), sin = Math.sin(tilt), cos = Math.cos(tilt);
  const tangent = Math.tan(fovDegrees * Math.PI / 360), margin = .88;
  let height = 14;
  for (const x of [-room.w / 2 - 1.6, room.w / 2 + 1.6]) for (const z of [-room.d / 2 - 1.6, room.d / 2 + 1.6]) for (const y of [0, room.height]) {
    const point = buildingPoint(room, x, z), dx = point.x - room.x, dz = point.z - room.z;
    const depthOffset = sin * dz + cos * y;
    height = Math.max(height, cos * (Math.abs(dx) / (tangent * Math.max(.2, aspect) * margin) + depthOffset),
      cos * (Math.abs(sin * y - cos * dz) / (tangent * margin) + depthOffset));
  }
  return height;
}

// The camera glides after the player, so from frame to frame the world slides
// by fractions of a pixel. Thin detail -- shingle gaps, plank seams, trim --
// then lands on a different mix of pixels every frame and shimmers along its
// edges. Moving the camera only in whole screen pixels keeps each line on the
// same pixels while it travels. Exact at ground level; roofs and wall tops,
// being a little nearer the camera, keep only a small remainder of it.
//
// Hills: the focus also rides the ground's height (y), so the snap is done
// in the view plane: sideways (x), and up the screen, v = y*sin - z*cos of
// the camera's pitch off vertical. The snapped v goes back into z, the height
// is kept. With y exactly 0 the old ground-level snap runs unchanged.
export function snapCameraFocus(x, z, height, fovDegrees, bufferHeight, y = 0) {
  if (!(bufferHeight > 0)) return { x, z };
  const distance = height * Math.hypot(1, CAMERA_TILT);
  const pixel = 2 * distance * Math.tan(fovDegrees * Math.PI / 360) / bufferHeight;
  // Ground depth is foreshortened on screen by the camera's pitch.
  const pitch = Math.atan2(1, CAMERA_TILT), depthPixel = pixel / Math.sin(pitch);
  if (y === 0) return { x: Math.round(x / pixel) * pixel, z: Math.round(z / depthPixel) * depthPixel };
  const up = Math.cos(pitch), back = Math.sin(pitch), v = Math.round((y * up - z * back) / pixel) * pixel;
  return { x: Math.round(x / pixel) * pixel, z: (y * up - v) / back };
}
