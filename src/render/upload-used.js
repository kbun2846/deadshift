// Upload only the part of a dynamic buffer that is drawn (v0.999a, owner:
// "make fps increase across platforms"). Effects keep big pools (the Sheath's
// ribbons: 24000 vertices; line batches: 700 instances) and flag the whole
// buffer for upload every frame they change, though only `count` instances or
// `drawRange` vertices are drawn. Before each render of the scene, this adds an
// update range covering just what is drawn to every changed attribute that has
// no ranges of its own, so three.js sends that slice (bufferSubData) instead
// of the whole array. A slice uploaded while the pool was small leaves the rest
// of the GPU copy stale, so when the drawn part later grows without a new
// write, the grown part is sent too.
//
// Candidates are found by walking the scene every CHECK_EVERY frames (a new
// effect uploads in full until then, as before).
import * as THREE from 'three';

const CHECK_EVERY = 30;
const DYNAMIC = THREE.DynamicDrawUsage;

function need(attribute, elements) {
  const size = attribute.itemSize * (attribute.meshPerAttribute || 1);
  return Math.min(attribute.array.length, Math.max(size, elements * size));
}

export function installUploadUsed(scene) {
  let found = [], frame = 0;
  const wants = new Map();
  const want = (a, n) => { if (a && !a.isInterleavedBufferAttribute && a.array && (wants.get(a) ?? -1) < n) wants.set(a, n); };
  const scan = () => {
    found = [];
    scene.traverse(o => {
      if (o.isInstancedMesh) { found.push(o); return; }
      if (!(o.isMesh || o.isLine || o.isPoints) || !o.geometry || o.geometry.index) return;
      for (const k in o.geometry.attributes) if (o.geometry.attributes[k].usage === DYNAMIC) { found.push(o); return; }
    });
  };
  const before = scene.onBeforeRender;
  scene.onBeforeRender = function (...args) {
    if (frame++ % CHECK_EVERY === 0) scan();
    wants.clear();
    for (const o of found) {
      const g = o.geometry; if (!g) continue;
      if (o.isInstancedMesh) {
        const n = o.count;
        want(o.instanceMatrix, n); want(o.instanceColor, n);
        for (const k in g.attributes) if (g.attributes[k].isInstancedBufferAttribute) want(g.attributes[k], n);
      } else {
        const total = g.attributes.position?.count ?? 0, n = Math.min(total, g.drawRange.start + g.drawRange.count);
        for (const k in g.attributes) if (g.attributes[k].usage === DYNAMIC) want(g.attributes[k], n);
      }
    }
    for (const [a, n] of wants) {
      const upTo = need(a, n), last = a.userData_uploaded ?? a.array.length;
      if (a.version !== a.userData_version) {
        // Changed: send the drawn part only, unless the attribute set its own
        // ranges. (A range of ours still waiting, when the object was not
        // drawn, is replaced: the new write may reach further.)
        const r = a.updateRanges, ours = r.length === 1 && r[0] === a.userData_range;
        if (ours) a.clearUpdateRanges();
        if ((ours || r.length === 0) && upTo < a.array.length) {
          a.addUpdateRange(0, Math.max(upTo, ours ? a.userData_uploaded : 0)); a.userData_range = r[0]; a.userData_uploaded = r[0].count;
        } else { a.userData_uploaded = a.array.length; a.userData_range = null; }
        a.userData_version = a.version;
      } else if (upTo > last) {
        // Grown past what was last sent, with no new write: send the rest.
        a.addUpdateRange(last, upTo - last); a.needsUpdate = true; a.userData_version = a.version; a.userData_uploaded = upTo; a.userData_range = null;
      }
    }
    if (before) before.apply(this, args);
  };
  return { rescan: scan };
}
