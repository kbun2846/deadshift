import { buildingPoint } from './maps.js';
export const OUTDOOR_CAMERA_HEIGHT = 29;
export const CAMERA_TILT = 11.5 / 33;
export function interiorCameraHeight(room, aspect) {
  if (room.followCamera) return 25;
  const tilt = Math.atan(CAMERA_TILT), sin = Math.sin(tilt), cos = Math.cos(tilt);
  const tangent = Math.tan(20 * Math.PI / 180), margin = .88;
  let height = 14;
  for (const x of [-room.w / 2 - 1.6, room.w / 2 + 1.6]) for (const z of [-room.d / 2 - 1.6, room.d / 2 + 1.6]) for (const y of [0, room.height]) {
    const point = buildingPoint(room, x, z), dx = point.x - room.x, dz = point.z - room.z;
    const depthOffset = sin * dz + cos * y;
    height = Math.max(height, cos * (Math.abs(dx) / (tangent * Math.max(.2, aspect) * margin) + depthOffset),
      cos * (Math.abs(sin * y - cos * dz) / (tangent * margin) + depthOffset));
  }
  return height;
}
