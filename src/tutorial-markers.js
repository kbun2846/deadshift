import * as THREE from 'three';

// The training range's pink guides: a zone on the ground to walk into, and an
// arrow lying just in front of the player that always points at whatever the
// lesson wants them to reach. Pink is the interface accent, pushed a little
// brighter so it reads against sand.
const PINK = new THREE.Color('#ff8cb6');
const ZONE_Y = .035, ARROW_Y = .07, ARROW_DISTANCE = 1.55, ARROW_SIZE = 1.4;

function flat(geometry) { geometry.rotateX(-Math.PI / 2); return geometry; }
function material(opacity) {
 return new THREE.MeshBasicMaterial({ color: PINK, transparent: true, opacity, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
}
function arrowShape() {
 // Points along +x: a short tail and a broad head, like the map's markers.
 const s = new THREE.Shape();
 s.moveTo(.46, 0); s.lineTo(.02, .34); s.lineTo(.02, .13); s.lineTo(-.4, .13);
 s.lineTo(-.4, -.13); s.lineTo(.02, -.13); s.lineTo(.02, -.34); s.closePath();
 return s;
}

export class TutorialMarkers {
 constructor(scene) {
  this.zone = new THREE.Group();
  this.fill = new THREE.Mesh(flat(new THREE.CircleGeometry(1, 48)), material(.27));
  this.edge = new THREE.Mesh(flat(new THREE.RingGeometry(.9, 1, 48)), material(.85));
  this.wave = new THREE.Mesh(flat(new THREE.RingGeometry(.95, 1, 48)), material(.5));
  this.zone.add(this.fill, this.edge, this.wave);
  this.arrow = new THREE.Mesh(flat(new THREE.ShapeGeometry(arrowShape())), material(.92));
  for (const object of [this.zone, this.arrow]) { object.visible = false; object.renderOrder = 3; object.traverse(o => { o.renderOrder = 3; }); scene.add(object); }
  this.zone.position.y = ZONE_Y; this.arrow.position.y = ARROW_Y; this.arrow.scale.setScalar(ARROW_SIZE);
  this.time = 0;
 }

 // guide: { zone: {x,z,r} | null, target: {x,z} | null }
 update(dt, guide, player) {
  this.time += dt;
  const zone = guide?.zone;
  this.zone.visible = !!zone;
  if (zone) {
   this.zone.position.set(zone.x, ZONE_Y, zone.z);
   this.zone.scale.setScalar(zone.r);
   const wave = (this.time * .9) % 1;
   this.wave.scale.setScalar(1 + wave * .45); this.wave.material.opacity = .55 * (1 - wave);
   this.fill.material.opacity = .27 + .08 * Math.sin(this.time * 4);
  }
  const target = guide?.target;
  let show = !!target && !!player;
  if (show) {
   const dx = target.x - player.x, dz = target.z - player.z, distance = Math.hypot(dx, dz);
   // Right on top of it, the arrow has nothing left to say.
   show = distance > (zone ? zone.r * .8 : 1.5);
   if (show) {
    const x = dx / distance, z = dz / distance, reach = ARROW_DISTANCE + Math.sin(this.time * 5) * .1;
    this.arrow.position.set(player.x + x * reach, ARROW_Y, player.z + z * reach);
    this.arrow.rotation.y = Math.atan2(-z, x);
   }
  }
  this.arrow.visible = show;
 }

 dispose() {
  for (const object of [this.zone, this.arrow]) object.traverse(o => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
  this.zone.removeFromParent(); this.arrow.removeFromParent();
 }
}
