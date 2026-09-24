import * as THREE from 'three';

// Every electric arc in the game, drawn in four draw calls in total.
//
// An arc used to be four separate objects -- a jagged line, a spray of forks, a
// camera-facing ribbon and a soft glow cylinder -- each with its own material
// so it could fade on its own. A hex pulse puts well over a hundred arcs in the
// air at once, so a single pulse roughly doubled the draw calls of the whole
// frame, on every tier and worst of all on the weakest devices. Here all arcs
// share four objects: three dynamic buffers and one instanced mesh. Each arc
// writes its vertices into the next free range every frame, and carries its own
// fade in per-vertex alpha rather than a material of its own, so the cost of a
// pulse is the vertices it writes, not a draw call per piece.

export const LINE_POINTS = 25;            // points along one jagged arc
const LINE_VERTS = (LINE_POINTS - 1) * 2; // drawn as segments so arcs do not join up
export const FORKS = 12;
const FORK_VERTS = FORKS * 2;
const RIBBON_VERTS = (LINE_POINTS - 1) * 6;

function dynamic(size, verts, itemSize) {
  const attribute = new THREE.BufferAttribute(new Float32Array(size * verts * itemSize), itemSize);
  attribute.setUsage(THREE.DynamicDrawUsage);
  return attribute;
}

function layer(Kind, capacity, verts, material) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', dynamic(capacity, verts, 3));
  geometry.setAttribute('color', dynamic(capacity, verts, 4));
  geometry.setDrawRange(0, 0);
  const object = new Kind(geometry, material);
  object.frustumCulled = false; object.renderOrder = 2;
  return object;
}

const additive = extra => ({ vertexColors: true, transparent: true, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending, ...extra });

export class ArcBatch {
  constructor(scene, capacity = 320) {
    this.capacity = capacity;
    this.lines = layer(THREE.LineSegments, capacity, LINE_VERTS,
      new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, toneMapped: false }));
    this.forks = layer(THREE.LineSegments, capacity, FORK_VERTS, new THREE.LineBasicMaterial(additive()));
    this.ribbons = layer(THREE.Mesh, capacity, RIBBON_VERTS, new THREE.MeshBasicMaterial(additive({ side: THREE.DoubleSide })));
    this.glows = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 6),
      new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending }), capacity);
    // Allocated now, not on first use: per-instance colour is part of the shader.
    this.glows.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
    this.glows.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.glows.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.glows.count = 0; this.glows.frustumCulled = false; this.glows.renderOrder = 2;
    this.objects = [this.lines, this.forks, this.ribbons, this.glows];
    for (const object of this.objects) scene.add(object);
    this.matrix = new THREE.Matrix4(); this.quaternion = new THREE.Quaternion();
    this.position = new THREE.Vector3(); this.scale = new THREE.Vector3(); this.color = new THREE.Color();
    this.begin();
  }

  begin() { this.lineCount = this.forkCount = this.ribbonCount = this.glowCount = 0; }
  get full() { return this.lineCount >= this.capacity; }

  // points: Float32Array of LINE_POINTS x,y,z. rgb 0..1, alpha 0..1.
  line(points, color, alpha) {
    if (this.lineCount >= this.capacity) return;
    const pos = this.lines.geometry.attributes.position.array, col = this.lines.geometry.attributes.color.array;
    let v = this.lineCount++ * LINE_VERTS;
    for (let i = 0; i < LINE_POINTS - 1; i++) for (const k of [i, i + 1]) {
      pos[v * 3] = points[k * 3]; pos[v * 3 + 1] = points[k * 3 + 1]; pos[v * 3 + 2] = points[k * 3 + 2];
      col[v * 4] = color.r; col[v * 4 + 1] = color.g; col[v * 4 + 2] = color.b; col[v * 4 + 3] = alpha;
      v++;
    }
  }

  // segments: Float32Array of FORKS pairs of x,y,z.
  fork(segments, color, alpha) {
    if (this.forkCount >= this.capacity) return;
    const pos = this.forks.geometry.attributes.position.array, col = this.forks.geometry.attributes.color.array;
    const base = this.forkCount++ * FORK_VERTS;
    pos.set(segments, base * 3);
    for (let v = base; v < base + FORK_VERTS; v++) { col[v * 4] = color.r; col[v * 4 + 1] = color.g; col[v * 4 + 2] = color.b; col[v * 4 + 3] = alpha; }
  }

  // A flat strip either side of the jagged line, offset by (ox, oz).
  ribbon(points, ox, oz, color, alpha) {
    if (this.ribbonCount >= this.capacity) return;
    const pos = this.ribbons.geometry.attributes.position.array, col = this.ribbons.geometry.attributes.color.array;
    let v = this.ribbonCount++ * RIBBON_VERTS;
    for (let i = 0; i < LINE_POINTS - 1; i++) {
      for (const [k, side] of [[i, -1], [i, 1], [i + 1, 1], [i, -1], [i + 1, 1], [i + 1, -1]]) {
        pos[v * 3] = points[k * 3] + ox * side; pos[v * 3 + 1] = points[k * 3 + 1]; pos[v * 3 + 2] = points[k * 3 + 2] + oz * side;
        col[v * 4] = color.r; col[v * 4 + 1] = color.g; col[v * 4 + 2] = color.b; col[v * 4 + 3] = alpha;
        v++;
      }
    }
  }

  // A glow cylinder from a to b. Additive, so fading is folded into the colour.
  glow(ax, ay, az, bx, by, bz, width, color, alpha, up, direction) {
    if (this.glowCount >= this.capacity) return;
    const dx = bx - ax, dy = by - ay, dz = bz - az, length = Math.hypot(dx, dy, dz);
    if (length < 1e-6) return;
    direction.set(dx / length, dy / length, dz / length);
    this.quaternion.setFromUnitVectors(up, direction);
    this.position.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
    this.scale.set(width, length, width);
    this.matrix.compose(this.position, this.quaternion, this.scale);
    const i = this.glowCount++;
    this.glows.setMatrixAt(i, this.matrix);
    this.glows.setColorAt(i, this.color.setRGB(color.r * alpha, color.g * alpha, color.b * alpha));
  }

  end() {
    const flush = (object, count, verts) => {
      const geometry = object.geometry;
      geometry.setDrawRange(0, count * verts);
      if (!count) return;
      for (const name of ['position', 'color']) {
        const attribute = geometry.attributes[name];
        attribute.clearUpdateRanges();
        attribute.addUpdateRange(0, count * verts * attribute.itemSize);
        attribute.needsUpdate = true;
      }
    };
    flush(this.lines, this.lineCount, LINE_VERTS);
    flush(this.forks, this.forkCount, FORK_VERTS);
    flush(this.ribbons, this.ribbonCount, RIBBON_VERTS);
    this.glows.count = this.glowCount;
    if (this.glowCount) { this.glows.instanceMatrix.needsUpdate = true; this.glows.instanceColor.needsUpdate = true; }
  }

  dispose() {
    for (const object of this.objects) { object.removeFromParent(); object.geometry.dispose(); object.material.dispose(); }
  }
}
