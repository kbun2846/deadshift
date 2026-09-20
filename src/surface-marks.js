import * as THREE from 'three';
import { DecalGeometry } from 'three/addons/geometries/DecalGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Persistent, surface-clipped soot. Batches grow instead of evicting old marks.
export class SurfaceMarks {
  constructor(view) {
    this.jobs=[]; this.currentJob=null; this.receiverCache=null;
    this.view = view; this.batches = new Map(); this.count = 0;
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
    const ctx = canvas.getContext('2d'), pixels = ctx.createImageData(128, 128);
    for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
      const dx = (x - 64) / 62, dy = (y - 64) / 62, angle = Math.atan2(dy, dx);
      const r = Math.hypot(dx, dy) * (1 + .08 * Math.sin(angle * 7) + .06 * Math.sin(angle * 13));
      const i = (y * 128 + x) * 4;
      pixels.data[i] = 19; pixels.data[i + 1] = 17; pixels.data[i + 2] = 14;
      pixels.data[i + 3] = Math.max(0, 1 - r) ** .7 * (125 + Math.random() * 65);
    }
    ctx.putImageData(pixels, 0, 0);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    this.material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    this.ray = new THREE.Raycaster();
    // One receiver above all outdoor road layers gives each blast one continuous
    // burn, including across a road edge. It is projection geometry, not rendered.
    this.groundReceiver=new THREE.Mesh(new THREE.PlaneGeometry(view.map.width+60,view.map.depth+60));
    this.groundReceiver.rotation.x=-Math.PI/2;this.groundReceiver.position.y=.048;this.groundReceiver.updateMatrixWorld(true);
  }

  enqueue(kind,e) {
    // Bound cosmetic backlog during unlimited-ammo stress tests.
    if(this.jobs.length<192)this.jobs.push({kind,event:{...e}});
  }
  flush(budgetMs=2) {
    if(!this.currentJob&&!this.jobs.length)return;
    const end=performance.now()+budgetMs;
    this.view.scene.updateMatrixWorld();this.receiverCache=null;
    let steps=0;
    do {
      if(!this.currentJob){const job=this.jobs.shift();if(!job)break;this.currentJob=job.kind==='explosion'?this.explosion(job.event):this.bulletJob(job.event);}
      if(this.currentJob.next().done)this.currentJob=null;
    }while(++steps<3&&performance.now()<end);
    this.receiverCache=null;
  }
  *bulletJob(e){this.bullet(e);yield;}
  surfaces() {
    if(this.receiverCache)return this.receiverCache;
    const v = this.view;
    const targets = [...v.targets.entries()].filter(([id]) => !v.lastSim || v.lastSim.targets.find(t => t.id === id)?.hp > 0).map(([, g]) => g);
    return this.receiverCache=[v.static, ...v.props.values(), ...targets, ...v.roofs.map(r => r.group)];
  }

  hit(origin, direction, distance) {
    this.ray.set(origin, direction); this.ray.far = distance;
    return this.ray.intersectObjects(this.surfaces(), true).find(h => {
      if (h.object.userData.surfaceMark || h.object.userData.maskedGround || !h.face) return false;
      for (let p = h.object; p; p = p.parent) if (!p.visible) return false;
      return true;
    });
  }

  stamp(hit, size, projectionPoint = hit?.point, projectionNormal = null) {
    if (!hit) return;
    const v = this.view, normal = projectionNormal || hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
    const rotation = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal));
    let parent = v.scene;
    for (const group of [...v.props.values(), ...v.targets.values()]) {
      for (let p = hit.object; p; p = p.parent) if (p === group) parent = group;
    }
    if ([...v.targets.values()].includes(parent)) {
      if (!parent.userData.marks) { parent.userData.marks = new THREE.Group(); parent.add(parent.userData.marks); parent.updateMatrixWorld(true); }
      parent = parent.userData.marks;
    }
    let geometry = new DecalGeometry(hit.object, projectionPoint, rotation, new THREE.Vector3(size, size, Math.max(.12, size * .18)));
    if (!geometry.attributes.position.count) { geometry.dispose(); return; }
    geometry.applyMatrix4(parent.matrixWorld.clone().invert());
    let batches = this.batches.get(parent);
    if (!batches) { batches = []; this.batches.set(parent, batches); }
    let batch = batches.at(-1);
    if (batch && batch.geometry.attributes.position.count < 12000) {
      const merged = mergeGeometries([batch.geometry, geometry]);
      batch.geometry.dispose(); geometry.dispose(); batch.geometry = merged;
    } else {
      batch = new THREE.Mesh(geometry, this.material); batch.userData.surfaceMark = true;
      // Decals sit above opaque terrain but below transparent lightning and particles.
      batch.renderOrder = -1; parent.add(batch); batches.push(batch);
    }
    this.count++;
  }

  bullet(e) {
    if (!Number.isFinite(e.vx) || Math.hypot(e.vx, e.vz) < .001) return;

    const direction = new THREE.Vector3(e.vx, 0, e.vz).normalize();
    const origin = new THREE.Vector3(e.x, .72, e.z).addScaledVector(direction, -.7);
    this.stamp(this.hit(origin, direction, 1.5), .22 + Math.random() * .08);
  }

  *explosion(e) {

    const center = new THREE.Vector3(e.x, .72, e.z);
    // The ground/floor gets a broad burn; surrounding surfaces get radial soot.
    this.ray.set(center, new THREE.Vector3(0, -1, 0)); this.ray.far = 1;
    const floors = this.ray.intersectObjects(this.surfaces(), true).filter(h => !h.object.userData.surfaceMark && !h.object.userData.maskedGround && h.face && h.face.normal.clone().transformDirection(h.object.matrixWorld).y > .7);
    if(floors.length && floors[0].point.y<.05) {
      const ground=this.ray.intersectObject(this.groundReceiver)[0];
      this.stamp(ground,e.radius*2);
    }
    const floorObjects = new Set();
    for (const floor of floors) {
      if(floor.point.y<.05)continue;
      if (floorObjects.has(floor.object)) continue; floorObjects.add(floor.object);
      this.stamp(floor, e.radius * 2, new THREE.Vector3(e.x, floors[0].point.y, e.z), new THREE.Vector3(0, 1, 0));
    }
    yield;
    const seen = new Set();
    for (let i = 0; i < 24; i++) {
      yield;
      const angle = i / 24 * Math.PI * 2;
      const hit = this.hit(center, new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle)), e.radius);
      if (!hit) continue;
      const key = hit.object.uuid + ':' + Math.round(hit.point.x) + ':' + Math.round(hit.point.z);
      if (seen.has(key)) continue; seen.add(key);
      this.stamp(hit, Math.max(.3, e.radius * .85 * (1 - hit.distance / (e.radius * 1.4))));
    }
  }

  clear() {
    this.jobs.length=0;this.currentJob=null;this.receiverCache=null;
    for (const batches of this.batches.values()) for (const mesh of batches) { mesh.removeFromParent(); mesh.geometry.dispose(); }
    this.batches.clear(); this.count = 0;
  }

  clearFor(parent) {
    for (const mesh of this.batches.get(parent) || []) { mesh.removeFromParent(); mesh.geometry.dispose(); }
    this.batches.delete(parent);
  }
}
