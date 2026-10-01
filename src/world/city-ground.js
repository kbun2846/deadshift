// A city map's ground (Lumen; stage 0 made the test street's, stage 1 lays
// Lumen's roads, sidewalks, kerbs and markings). Three parts:
//   - the paint: the map's `city.ground.shapes` (world/lumen-ground.js)
//     painted once at load into one colour texture over the map (roads,
//     sidewalks, lots, the districts' area shifts, wear), at 1024 on Potato
//     and Performance and 2048 above (about 5.5 and 11 px a metre);
//   - the ground itself: one flat mesh sampling that texture, on the wet-ground material (render/wet-ground.js: wetness,
//     puddles, the mirror);
//   - the markings: worn paint and kerbs (`city.ground.markings`), crisp
//     flat strips just over the ground, one mesh, the same wet material.
// All on the ground layer (render/ground-mirror.js: the mirror never draws
// what it reflects in). A city map without a `ground` spec (City Test) gets
// a grid coloured by `city.paving` rects instead.
import * as THREE from 'three';
import { wetGroundMaterial } from '../render/wet-ground.js';
import { GROUND_LAYER } from '../render/city-registry.js';

export const CITY_GROUND = Object.freeze({ margin: 24, texture: { potato: 1024, performance: 1024, balanced: 2048, quality: 2048, extreme: 2048 }, asphalt: '#2c2f36', grain: .045 });

// The colour at (x, z) for a map with only paving rects (City Test).
export function pavingColour(map, x, z, out = new THREE.Color()) {
  out.set(map.city?.asphalt ?? CITY_GROUND.asphalt);
  for (const p of map.city?.paving || []) if (x >= p.x0 && x <= p.x1 && z >= p.z0 && z <= p.z1) out.set(p.colour);
  return out;
}

// The steam vents' covers (maps/lumen-vents.js), as marking quads (drawn
// with the markings: no draw of their own): a manhole is an iron disc with a
// paler rim, a grate a dark plate with pale bars across it. A triangle is a
// quad with its last corner on its first.
export const VENT_COVER = Object.freeze({ iron: '#1b1d22', rim: '#474a52', bar: '#3c3f47', radius: .42, sides: 12, grate: Object.freeze([1.1, .62]), y: .014 });
export function ventCovers(vents = []) {
  const C = VENT_COVER, out = [];
  for (const v of vents) {
    if (v.kind === 'grate') {
      const [w, d] = C.grate, rect = (x0, z0, x1, z1) => [[v.x + x0, v.z + z0], [v.x + x1, v.z + z0], [v.x + x1, v.z + z1], [v.x + x0, v.z + z1]];
      out.push({ quad: rect(-w / 2, -d / 2, w / 2, d / 2), colour: C.iron, y: C.y });
      for (let k = 0; k < 6; k++) { const x = -w / 2 + .1 + k * (w - .2) / 5; out.push({ quad: rect(x - .025, -d / 2 + .06, x + .025, d / 2 - .06), colour: C.bar, y: C.y + .001 }); }
      continue;
    }
    const at = (k, r) => [v.x + Math.cos(k / C.sides * Math.PI * 2) * r, v.z + Math.sin(k / C.sides * Math.PI * 2) * r];
    for (let k = 0; k < C.sides; k++) {
      const a = at(k, C.radius), b = at(k + 1, C.radius), c = at(k + 1, C.radius + .07), d = at(k, C.radius + .07);
      out.push({ quad: [[v.x, v.z], a, b, [v.x, v.z]], colour: C.iron, y: C.y });
      out.push({ quad: [a, b, c, d], colour: C.rim, y: C.y });
    }
  }
  return out;
}

export function groundBounds(map) {
  const xs = map.playableArea.map(p => p[0]), zs = map.playableArea.map(p => p[1]), m = CITY_GROUND.margin;
  return [Math.floor(Math.min(...xs) - m), Math.floor(Math.min(...zs) - m), Math.ceil(Math.max(...xs) + m), Math.ceil(Math.max(...zs) + m)];
}

// A light pool's falloff across its radius (d = 0 the centre, 1 the edge):
// the cos^3 fall of a lamp over a floor (a broad bright core, then down), then a soft
// shoulder that reaches exactly zero at the edge with no slope (no visible
// rim). Normalised to 1 at the centre; the canvas gradient lerps between
// these stops (dense near the centre where the curve bends).
export const GLOW_PROFILE = Object.freeze(Array.from({ length: 15 }, (_, i) => {
  const d = Math.pow(i / 14, 1.35), f = (1 - d * d) ** 2 / (1 + 1.8 * d * d) ** 1.5;
  return Object.freeze([+d.toFixed(4), +f.toFixed(4)]);
}));

// Paint the shapes into a canvas (browser only). A shape is a polygon
// (`poly`) or a soft light pool (`glow`: { x, z, rx, rz, angle }, an ellipse
// filled with a radial falloff of `colour`, `alpha` at its centre).
// Both canvases are CPU canvases (willReadFrequently): painted once and
// uploaded once, never drawn to again. On a GPU canvas every shape was
// recorded and replayed by the GPU process at the first read of any canvas
// (SwiftShader: 20 s of Lumen's load on Performance, 80 s at 2048 on
// Quality, all of it in the fog sheets' read of their own picture); on the
// CPU the whole paint takes a few hundred ms.
export const PAINT_CONTEXT = Object.freeze({ willReadFrequently: true });
// Source pixels kept round a soft shape's box when only that box of the
// scratch is drawn back: past the upscale's reach (a cubic filter reads two
// either side) and the fill's antialiased edge, so every pixel it changes is
// the same as drawing the whole scratch.
const BLUR_PAD = 4;
export function paintGround(spec, bounds, size) {
  const [x0, z0, x1, z1] = bounds, canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = Math.round(size * (z1 - z0) / (x1 - x0));
  const ctx = canvas.getContext('2d', PAINT_CONTEXT), sx = canvas.width / (x1 - x0), sz = canvas.height / (z1 - z0);
  const X = x => (x - x0) * sx, Z = z => (z - z0) * sz;
  // A soft-edged shape is painted small (about one pixel per `blur` metres)
  // into a scratch canvas and drawn back stretched: the smooth upscale is the
  // soft edge. (Not ctx.filter: Safari's canvas has no blur filter.) Only
  // the shape's own box of it is drawn back (most are a metre or two across
  // on a map-sized scratch).
  const scratch = document.createElement('canvas'), sctx = scratch.getContext('2d', PAINT_CONTEXT);
  // A pool's gradient lives in unit space (the transform sets its size), so
  // one per colour and strength serves every pool of them.
  const gradients = new Map();
  const gradientOf = shape => {
    const key = shape.colour + '|' + (shape.alpha ?? 1);
    let grad = gradients.get(key);
    if (!grad) {
      const rgb = [1, 3, 5].map(i => parseInt(shape.colour.slice(i, i + 2), 16)), a = shape.alpha ?? 1;
      grad = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
      for (const [d, f] of GLOW_PROFILE) grad.addColorStop(d, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${(f * a).toFixed(4)})`);
      gradients.set(key, grad);
    }
    return grad;
  };
  for (const shape of spec.shapes) {
    ctx.save();
    if (shape.glow) {
      const g = shape.glow;
      ctx.translate(X(g.x), Z(g.z)); ctx.rotate(g.angle || 0); ctx.scale(g.rx * sx, g.rz * sz);
      ctx.fillStyle = gradientOf(shape); ctx.beginPath(); ctx.arc(0, 0, 1, 0, Math.PI * 2); ctx.fill();
      ctx.restore(); continue;
    }
    // `within`: kept to those polygons (a district's shift on its roads or sidewalks only)
    if (shape.within) { ctx.beginPath(); for (const poly of shape.within) poly.forEach(([x, z], i) => (i ? ctx.lineTo(X(x), Z(z)) : ctx.moveTo(X(x), Z(z)))); ctx.clip(); }
    ctx.globalAlpha = shape.alpha ?? 1;
    ctx.globalCompositeOperation = shape.blend === 'multiply' ? 'multiply' : shape.blend === 'screen' ? 'screen' : 'source-over';
    if (shape.blur) {
      const k = 1 / shape.blur, w = Math.max(4, Math.round((x1 - x0) * k)), h = Math.max(4, Math.round((z1 - z0) * k));
      scratch.width = w; scratch.height = h; sctx.clearRect(0, 0, w, h);
      sctx.fillStyle = shape.colour; sctx.beginPath();
      let bx0 = Infinity, bz0 = Infinity, bx1 = -Infinity, bz1 = -Infinity;
      shape.poly.forEach(([x, z], i) => {
        const px = (x - x0) * k, pz = (z - z0) * k;
        if (px < bx0) bx0 = px; if (px > bx1) bx1 = px; if (pz < bz0) bz0 = pz; if (pz > bz1) bz1 = pz;
        return i ? sctx.lineTo(px, pz) : sctx.moveTo(px, pz);
      });
      sctx.closePath(); sctx.fill();
      bx0 = Math.max(0, Math.floor(bx0) - BLUR_PAD); bz0 = Math.max(0, Math.floor(bz0) - BLUR_PAD);
      bx1 = Math.min(w, Math.ceil(bx1) + BLUR_PAD); bz1 = Math.min(h, Math.ceil(bz1) + BLUR_PAD);
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      const fx = canvas.width / w, fz = canvas.height / h;
      if (bx1 > bx0 && bz1 > bz0) ctx.drawImage(scratch, bx0, bz0, bx1 - bx0, bz1 - bz0, bx0 * fx, bz0 * fz, (bx1 - bx0) * fx, (bz1 - bz0) * fz);
    } else {
      ctx.fillStyle = shape.colour;
      ctx.beginPath();
      shape.poly.forEach(([x, z], i) => (i ? ctx.lineTo(X(x), Z(z)) : ctx.moveTo(X(x), Z(z))));
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }
  // A fine grain over everything (seeded: the same every load), so large flat
  // areas read as asphalt and concrete, not plastic.
  let seed = 2654435761 >>> 0; const rand = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
  const dots = Math.round(canvas.width * canvas.height * CITY_GROUND.grain);
  ctx.fillStyle = 'rgba(0,0,0,.12)'; ctx.beginPath();
  for (let i = 0; i < dots / 2; i++) ctx.rect(Math.floor(rand() * canvas.width), Math.floor(rand() * canvas.height), 1, 1);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.045)'; ctx.beginPath();
  for (let i = 0; i < dots / 2; i++) ctx.rect(Math.floor(rand() * canvas.width), Math.floor(rand() * canvas.height), 1, 1);
  ctx.fill();
  return canvas;
}

export function buildCityGround(view, map, city) {
  const bounds = groundBounds(map), [x0, z0, x1, z1] = bounds, spec = map.city?.ground;
  const group = new THREE.Group(); group.name = 'city-ground';
  const preset = view.qualityName || view.initialQuality || 'balanced';
  const material = wetGroundMaterial(city, { quality: preset });
  (city.wetGroundMaterials ||= []).push(material);
  // The paint, at the preset's size; painted again (behind the preset
  // change's pill) if a later preset wants another size. Swapping one texture
  // for another keeps the program.
  let painted = 0;
  const paint = name => {
    if (!spec?.shapes || typeof document === 'undefined') return;
    const size = CITY_GROUND.texture[name] ?? 2048; if (size === painted) return;
    const texture = new THREE.CanvasTexture(paintGround(spec, bounds, size));
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = name === 'potato' ? 1 : Math.min(name === 'performance' ? 4 : 8, view.renderer?.capabilities?.getMaxAnisotropy?.() || 1);
    material.map?.dispose(); material.map = texture; painted = size;
  };
  paint(preset);
  // One flat mesh over the whole map (a few hundred triangles: one draw;
  // cells would only add draws), white vertex colours (the texture carries
  // the paint), or the paving colours (City Test, on a 1 m grid).
  const c = new THREE.Color(), w = x1 - x0, d = z1 - z0;
  const g = new THREE.PlaneGeometry(w, d, spec ? Math.ceil(w / 8) : Math.round(w), spec ? Math.ceil(d / 8) : Math.round(d)); g.rotateX(-Math.PI / 2); g.translate(x0 + w / 2, 0, z0 + d / 2);
  const pos = g.attributes.position, uv = g.attributes.uv, colours = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    uv.setXY(i, (x - x0) / w, 1 - (z - z0) / d);
    if (spec) colours.set([1, 1, 1], i * 3); else { pavingColour(map, x, z, c); colours.set([c.r, c.g, c.b], i * 3); }
  }
  g.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  const mesh = new THREE.Mesh(g, material);
  mesh.receiveShadow = true; mesh.castShadow = false; mesh.layers.set(GROUND_LAYER);
  // Drawn after what stands on it, as the other maps' ground is (renderer.js
  // orderGround), but not one of view.groundMaterials: those get the
  // desert's sand texture and Extreme's ground detail.
  mesh.renderOrder = .5; mesh.matrixAutoUpdate = false; mesh.updateMatrix();
  group.add(mesh);
  // The markings: one mesh of flat strips.
  let markings = null;
  if (spec?.markings?.length) {
    const pos = [], col = [], nor = [], colour = new THREE.Color();
    for (const m of [...spec.markings, ...ventCovers(map.city?.vents)]) {
      colour.set(m.colour); const y = m.y ?? .012, q = m.quad;
      // wound to face up (+y)
      const cross = (q[1][0] - q[0][0]) * (q[2][1] - q[0][1]) - (q[1][1] - q[0][1]) * (q[2][0] - q[0][0]);
      const order = cross < 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2];
      for (const k of order) { pos.push(q[k][0], y, q[k][1]); col.push(colour.r, colour.g, colour.b); nor.push(0, 1, 0); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeBoundingSphere();
    const markMaterial = wetGroundMaterial(city, { quality: preset }); city.wetGroundMaterials.push(markMaterial);
    markings = new THREE.Mesh(g, markMaterial);
    markings.receiveShadow = true; markings.layers.set(GROUND_LAYER); markings.renderOrder = .4; markings.matrixAutoUpdate = false; markings.updateMatrix();
    group.add(markings);
  }
  view.scene.add(group);
  return { group, material, markings, setQuality: name => { paint(name); for (const m of city.wetGroundMaterials) m.userData.setQuality?.(name); } };
}
