import * as THREE from 'three';
import { buildingPoint, buildingOpenings } from '../maps.js';

export function interiorPolygons(room, player) {
  const polygons = [[buildingPoint(room,-room.w/2,-room.d/2),buildingPoint(room,room.w/2,-room.d/2),buildingPoint(room,room.w/2,room.d/2),buildingPoint(room,-room.w/2,room.d/2)]];
  for (const opening of buildingOpenings(room)) {
    const {a,b} = opening;
    const distance = Math.abs((b.x-a.x)*(player.z-a.z)-(b.z-a.z)*(player.x-a.x))/Math.hypot(b.x-a.x,b.z-a.z);
    // A portal seen exactly edge-on has no area, not an unrestricted sight region.
    if (distance < .001) continue;
    const factor = 1 + 65 / Math.max(.01,Math.min(Math.hypot(a.x-player.x,a.z-player.z),Math.hypot(b.x-player.x,b.z-player.z)));
    const extend = p => ({x:player.x+(p.x-player.x)*factor,z:player.z+(p.z-player.z)*factor});
    polygons.push([a,b,extend(b),extend(a)]);
  }
  return polygons;
}

// The room you are in as the camera sees it: its box from the floor to the
// eaves and out past the walls' faces and trim, as six faces whose union is
// its outline on screen. The shroud (vision.js) clears it as well as the
// polygons above (stage 5 review, owner: laid at .7 m, the room's clear patch
// left the upper walls, the window heads and the pulpit grey between the
// openings' cones, grey patches where no window was). The polygons above stay
// the flat sight test (interior-visibility.js reads their XZ, four points each).
export const ROOM_MARGIN = .3;
export function roomBox(room) {
  const base = room.baseY || 0, top = base + (room.height || 3), m = ROOM_MARGIN;
  const at = (sx, sz) => { const p = buildingPoint(room, sx * (room.w / 2 + m), sz * (room.d / 2 + m)); return { x: p.x, z: p.z, y: base }; };
  const low = [at(-1, -1), at(1, -1), at(1, 1), at(-1, 1)], high = low.map(p => ({ x: p.x, z: p.z, y: top }));
  return [low, high, ...low.map((p, i) => [p, low[(i + 1) % 4], high[(i + 1) % 4], high[i]])];
}

// Clip BEFORE perspective division: points behind the camera otherwise mirror
// across the screen and turn a doorway cone into a large false clear region.
export function projectVisionPolygon(points,camera,width,height,y=.7) {
  const matrix = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
  // (A point's own `y` if it has one: roomBox's faces.)
  let vertices = points.map(p=>new THREE.Vector4(p.x,p.y ?? y,p.z,1).applyMatrix4(matrix));
  for (const axis of ['x','y','z']) for (const sign of [-1,1]) {
    const output=[];
    for(let i=0;i<vertices.length;i++) {
      const a=vertices[i],b=vertices[(i+1)%vertices.length],da=a.w+sign*a[axis],db=b.w+sign*b[axis];
      if(da>=0) output.push(a);
      if((da>=0)!==(db>=0)) output.push(a.clone().lerp(b,da/(da-db)));
    }
    vertices=output;
  }
  return vertices.map(p=>({x:(p.x/p.w*.5+.5)*width,y:(.5-p.y/p.w*.5)*height}));
}
