// The stream's water (a map's terrain `water` channels, world/heightfield.js):
// one ribbon per channel, lying in its bed at the height the water stands
// (`surface`: `up` upstream of the dam at x `damX`, `down` below it, with a
// short drop at the dam: the weir). It runs out under the banks (the ground
// hides what is above the waterline) and on past the fence to the edge of the
// ground. Built once at load from the same sections the effects ask about
// (effects/water-field.js); one draw.
//
// The look, in the game's style (flat-shaded, no reflections or refraction):
//  - dark (#232a2c) and a little glossy, lighter toward the banks, with a pale
//    wet line where the water thins out against them;
//  - where it is shallow (the ford) the pebble bed shows through (#5a605a):
//    the tint on every preset, the pebbles themselves Balanced and up;
//  - a dull sheen from the grey dusk sky, strongest at a grazing view, broken
//    into slow drifting patches (Performance and up);
//  - the current: faint lighter and darker bands sliding downstream, faster
//    down the middle and over the weir (Performance and up);
//  - Extreme: a gentle swell rolling downstream (faceted, so each facet takes
//    the light its own way) and a slow shimmer in the sheen.
// All of it is one material whose program is the same on every preset: the
// ladder is uniforms (setWaterLook), so a preset change links nothing.
//
// uv: x metres along the channel, y -1..1 across it. `water` (per vertex):
// depth of the water over the drawn bed there, and the flow's speed.
//
// Also here: rocks in the bed, breaking the surface (one merged draw), which
// the effects use as places for foam and rings. The effects themselves
// (streaks, rings, leaves, splashes, blood) are made here too, so they are in
// the scene before the shader warm-up: view.waterFX.
import * as THREE from 'three';
import { WaterField, SHALLOW } from '../effects/water-field.js';
import { WaterEffects } from '../effects/water-effects.js';

const DARK = new THREE.Color('#232a2c'), LIGHT = new THREE.Color('#3f4a4a'), PEBBLE = new THREE.Color('#5a605a');
// How much of what is under it the water hides (1: none shows through).
export const WATER_OPACITY = .8;
// Across the ribbon (-1..1 of its reach): finer toward the banks, where the
// waterline is.
const ACROSS = [-1, -.9, -.8, -.7, -.58, -.44, -.28, -.12, 0, .12, .28, .44, .58, .7, .8, .9, 1];

// The ladder, per preset (uniforms of the one program).
export const WATER_LOOK = Object.freeze({
 potato: { flow: 0, pebbles: 0, wave: 0, shimmer: 0, mesh: 'quarter' },
 performance: { flow: .6, pebbles: 0, wave: 0, shimmer: 0, mesh: 'quarter' },
 balanced: { flow: 1, pebbles: 1, wave: 0, shimmer: 0, mesh: 'half' },
 quality: { flow: 1, pebbles: 1, wave: 0, shimmer: 0, mesh: 'half' },
 extreme: { flow: 1, pebbles: 1, wave: 1, shimmer: 1, mesh: 'full' },
});

// `view`: the WorldView; returns a group or null (no water: nothing is made,
// so a map without a stream draws exactly as before).
export function buildWaterMesh(view, ground, map) {
 const channels = map.terrain?.water || [];
 if (!channels.length) return null;
 const field = new WaterField(ground, map.terrain);
 const group = new THREE.Group(); group.name = 'water';
 const material = view.waterMaterial ||= waterMaterial(view.look?.sky);
 // (The swell rolls downstream: the first channel's way.)
 material.userData.water.waterDir.value = field.channels[0]?.dir ?? 1;
 for (const channel of field.channels) {
  // The dam: the same place twice, once at each level (the weir's face).
  const rows = [];
  for (const s of channel.sections) {
   const last = rows[rows.length - 1];
   if (last && last.level !== s.level) rows.push({ ...s, level: last.level, along: s.along - .01 });
   rows.push(s);
  }
  const cols = ACROSS.length, count = rows.length * cols;
  const position = new Float32Array(count * 3), colour = new Float32Array(count * 3), uv = new Float32Array(count * 2), normal = new Float32Array(count * 3), water = new Float32Array(count * 2);
  const c = new THREE.Color(), probe = {};
  rows.forEach((s, i) => ACROSS.forEach((v, j) => {
   const k = i * cols + j, x = s.x + s.mx * s.reach * v, z = s.z + s.mz * s.reach * v;
   position[k * 3] = x; position[k * 3 + 1] = s.level; position[k * 3 + 2] = z;
   normal[k * 3 + 1] = 1;
   // How deep over the drawn bed (not the decks: a bridge is its own mesh).
   const depth = s.level - ground.drawnHeightAt(x, z), across = Math.abs(v) * s.reach / s.water;
   // Dark in the middle, lighter toward the banks; the bed's tone where shallow.
   c.copy(DARK).lerp(LIGHT, Math.min(1, across) ** 2 * .8);
   c.lerp(PEBBLE, Math.max(0, 1 - depth / SHALLOW) * .9);
   colour[k * 3] = c.r; colour[k * 3 + 1] = c.g; colour[k * 3 + 2] = c.b;
   uv[k * 2] = s.along; uv[k * 2 + 1] = v;
   // The flow's speed here (down the middle faster than at the banks).
   const flow = field.pointAt(channel, s.along, v * s.reach, probe);
   // (Signed: the bands slide the way the channel flows, west on Hollow Wick.)
   water[k * 2] = depth; water[k * 2 + 1] = flow ? flow.speed * channel.dir : 0;
  }));
  // Three sets of triangles over the same vertices (setWaterLook picks one):
  // every half metre and every column for Extreme's swell, every metre for
  // Balanced and Quality, every metre and every other column for the phones.
  // The weir's two rows are in all of them.
  const lods = {};
  for (const [name, rowStep, colStep] of [['full', 1, 1], ['half', 2, 1], ['quarter', 2, 2]]) {
   const keep = rows.map((s, i) => i % rowStep === 0 || i === rows.length - 1 || rows[i - 1]?.level !== s.level || rows[i + 1]?.level !== s.level).map((k, i) => k ? i : -1).filter(i => i >= 0);
   const across = ACROSS.map((v, j) => j).filter(j => j % colStep === 0 || j === cols - 1), index = [];
   for (let r = 1; r < keep.length; r++) for (let q = 1; q < across.length; q++) {
    const i0 = keep[r - 1], i1 = keep[r], j0 = across[q - 1], j1 = across[q];
    const a = i0 * cols + j0, b = i0 * cols + j1, d = i1 * cols + j0, e = i1 * cols + j1;
    // Counter-clockwise seen from above (j runs toward the right bank).
    index.push(a, b, d, b, e, d);
   }
   lods[name] = new THREE.BufferAttribute(count > 65535 ? new Uint32Array(index) : new Uint16Array(index), 1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colour, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geometry.setAttribute('water', new THREE.BufferAttribute(water, 2));
  geometry.setIndex(lods.full);
  geometry.computeBoundingSphere(); geometry.computeBoundingBox();
  // (The swell lifts it a few centimetres on Extreme.)
  geometry.boundingBox.max.y += .05; geometry.boundingSphere.radius += .05;
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'water:' + channel.id;
  mesh.castShadow = false; mesh.receiveShadow = true; mesh.matrixAutoUpdate = false; mesh.updateMatrix();
  // See-through (every preset; owner, 2026-09-26): drawn first of the
  // see-through things, so the fog sheets and a fading deck lie over it.
  mesh.renderOrder = -1;
  mesh.userData.lods = lods;
  group.add(mesh);
 }
 if (!group.children.length) return null;
 // (A map whose crossings place stones in the stream, render/crossing-decks.js,
 // uses those: the rings and foam form round them. Otherwise seeded rocks.)
 const rocks = map.crossings?.stones ? { list: stoneSpots(field, map.crossings.stones), mesh: null } : buildRocks(field, map);
 if (rocks.mesh) group.add(rocks.mesh);
 // The moving parts (effects/water-effects.js): in the scene from now on.
 view.waterFX = new WaterEffects(view, field, { rocks: rocks.list, surfaces: group.children.filter(m => m.userData.lods) });
 group.userData.field = field;
 return group;
}

// The one water material: MeshStandardMaterial (so it takes the sun, the sky
// light, shadows and fog like everything else), flat-shaded, patched.
export function waterMaterial(sky = '#eceae2') {
 // See-through on every preset (owner, 2026-09-26: "water should be
 // transparent"): the bed, the stones and a wader's legs show through it,
 // darker the deeper.
 const material = new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: .42, metalness: 0, flatShading: true,
  transparent: true, opacity: WATER_OPACITY, depthWrite: false,
  polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 2 });
 const uniforms = material.userData.water = {
  waterTime: { value: 0 }, waterDir: { value: 1 }, waterWave: { value: 0 }, waterShimmer: { value: 0 }, waterFlow: { value: 1 }, waterPebbles: { value: 1 },
  waterSky: { value: new THREE.Color(sky).multiplyScalar(.2) }, waterPebble: { value: PEBBLE.clone() }, waterLine: { value: LIGHT.clone().lerp(new THREE.Color('#8a938e'), .5) },
 };
 material.onBeforeCompile = shader => {
  Object.assign(shader.uniforms, uniforms);
  shader.vertexShader = 'attribute vec2 water; uniform float waterTime; uniform float waterDir; uniform float waterWave; varying vec2 vWater; varying vec2 vWaterUv; varying vec3 vWaterPos;\n'
   + shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
   vWater = water; vWaterUv = uv;
   // Extreme's swell (water-field.js swellAt): none at the banks.
   float waterAlong = uv.x * waterDir;
   transformed.y += waterWave * .022 * (1.0 - uv.y * uv.y) * (.5 * sin(waterAlong * 1.7 - waterTime * 2.1 + uv.y * 1.3) + .3 * sin(waterAlong * 2.9 + uv.y * 4.1 - waterTime * 2.9) + .2 * sin(waterAlong * 4.3 - uv.y * 6.7 - waterTime * 3.4 + 1.9));
   vWaterPos = transformed;`);
  shader.fragmentShader = `uniform float waterTime; uniform float waterShimmer; uniform float waterFlow; uniform float waterPebbles; uniform vec3 waterSky; uniform vec3 waterPebble; uniform vec3 waterLine;
   varying vec2 vWater; varying vec2 vWaterUv; varying vec3 vWaterPos;
   float waterHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
   float waterNoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(waterHash(i), waterHash(i + vec2(1.0, 0.0)), f.x), mix(waterHash(i + vec2(0.0, 1.0)), waterHash(i + vec2(1.0, 1.0)), f.x), f.y); }
   // One layer of pebbles: a rounded stone per cell, jittered, of its own tone.
   vec4 waterStones(vec2 p) { vec2 cell = floor(p), f = fract(p) - .5; float h = waterHash(cell);
    vec2 jitter = (vec2(waterHash(cell + 17.1), waterHash(cell + 3.7)) - .5) * .36;
    float d = length((f - jitter) * vec2(1.0, .8 + .4 * h)) / (.3 + .13 * h);
    return vec4(vec3(.72 + .5 * h, .74 + .46 * h, .7 + .44 * waterHash(cell + 9.3)), 1.0 - smoothstep(.78, 1.0, d)); }
  ` + shader.fragmentShader
   .replace('#include <color_fragment>', `#include <color_fragment>
   float waterDepth = vWater.x, waterShallow = 1.0 - smoothstep(.04, ${SHALLOW.toFixed(2)}, waterDepth);
   // The ford's pebbles through the shallow water (Balanced and up).
   if (waterPebbles > .5 && waterShallow > .001) {
    vec4 a = waterStones(vWaterPos.xz * 4.2), b = waterStones(vWaterPos.xz * 4.2 + vec2(.5, .37));
    vec3 bed = waterPebble * mix(.45, 1.1, max(a.a, b.a)) * mix(a.rgb, b.rgb, step(a.a, b.a));
    // Seen through the water: darker and more of the water's own colour the deeper.
    bed = mix(bed, diffuseColor.rgb, smoothstep(0.0, ${SHALLOW.toFixed(2)}, waterDepth) * .7);
    diffuseColor.rgb = mix(diffuseColor.rgb, bed, waterShallow);
   }
   // The current: faint bands sliding downstream (Performance and up).
   if (waterFlow > 0.0) {
    float s = vWaterUv.x - waterTime * vWater.y;
    float band = waterNoise(vec2(s * .6, vWaterUv.y * 3.4)) * .65 + waterNoise(vec2(s * 1.7 + 3.1, vWaterUv.y * 7.0)) * .35;
    diffuseColor.rgb *= 1.0 + waterFlow * (band - .5) * .3 * (1.0 - waterShallow * .6);
   }
   // The wet line where the water thins out against a bank.
   diffuseColor.rgb = mix(diffuseColor.rgb, waterLine, (1.0 - smoothstep(0.0, .07, waterDepth)) * .5);`)
   .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
   // Extreme: the sheen shimmers, slowly.
   roughnessFactor = clamp(roughnessFactor + waterShimmer * (waterNoise(vWaterPos.xz * .8 + vec2(-waterTime * .45, waterTime * .12)) - .5) * .16, .3, 1.0);`)
   .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
   {
    // The dull sheen of the grey sky: strongest at a grazing look (a facet
    // tilted away from the camera), broken into slow drifting patches.
    float facing = clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), grazing = pow(1.0 - facing, 3.0);
    float patches = waterNoise(vWaterPos.xz * .13 + vec2(waterTime * .05, waterTime * .018) * (1.0 + waterShimmer * 1.5));
    // Extreme: each facet of the swell leans its own way and takes more or
    // less of the sky as it rolls past (the shimmer).
    vec3 level = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz), toEye = normalize(vViewPosition);
    float lean = waterShimmer * clamp((dot(level, toEye) - dot(normal, toEye)) * 5.0, -.35, .5);
    totalEmissiveRadiance += waterSky * (grazing * 2.0 + .05 + waterFlow * .16 * patches + lean * .55) * (1.0 - waterShallow * .55);
   }`);
 };
 material.customProgramCacheKey = () => 'water-surface';
 return material;
}

// The preset's rung of the ladder: uniform values, and which set of the
// surfaces' triangles is drawn (neither links a program).
export function setWaterLook(material, name, surfaces = []) {
 const look = WATER_LOOK[name] || WATER_LOOK.balanced, u = material?.userData.water;
 if (u) { u.waterFlow.value = look.flow; u.waterPebbles.value = look.pebbles; u.waterWave.value = look.wave; u.waterShimmer.value = look.shimmer; }
 for (const mesh of surfaces) if (mesh.geometry.index !== mesh.userData.lods[look.mesh]) mesh.geometry.setIndex(mesh.userData.lods[look.mesh]);
}

// The crossings' stones ([x, z, size]) as the effects' rocks.
function stoneSpots(field, stones) {
 const out = [], probe = {};
 for (const [x, z, size] of stones) {
  const s = field.sample(x, z, probe); if (!s) continue;
  out.push({ x, z, r: size * .8, top: .05, level: s.level, yaw: 0, tone: 0, dx: s.dx, dz: s.dz });
 }
 return out;
}

// ---- Rocks in the bed ----
// A few stones breaking the surface between the crossings (seeded: the same
// every game), clear of the decks and the ford, in the middle of the stream
// and here and there by a bank. Flat-shaded, wet and dark at the waterline.
const ROCK_TONES = ['#4d4d48', '#55544d', '#474843', '#5c5a52'].map(c => new THREE.Color(c)), WET = new THREE.Color('#2b2d2a');
export function rockSpots(field, map) {
 let seed = ((map.scenerySeed ?? 1) * 7919 + 31) >>> 0;
 const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
 const crossings = [...(map.terrain?.decks || []).map(d => d.poly), ...(map.terrain?.fords || []).map(f => f.points)];
 const bounds = map.playableArea ? map.playableArea.reduce((b, [x]) => [Math.min(b[0], x), Math.max(b[1], x)], [Infinity, -Infinity]) : [-60, 60];
 // (And clear of the buildings' pads by the water: the mill's wheel goes there.)
 const pads = map.terrain?.pads || [];
 const clear = (x, z) => crossings.every(poly => poly.every(([px, pz]) => Math.hypot(px - x, pz - z) > 5) && !nearPoly(poly, x, z, 3.2))
  && pads.every(p => Math.abs(x - p.x) > p.w / 2 + 4.5 || Math.abs(z - p.z) > p.d / 2 + 4.5);
 const list = [], probe = {};
 for (const channel of field.channels) {
  const first = channel.sections.find(s => s.x > bounds[0] + 2), last = [...channel.sections].reverse().find(s => s.x < bounds[1] + 6);
  if (!first || !last) continue;
  for (let along = first.along + 3; along < last.along; along += 5 + random() * 7) {
   // Mostly mid-stream, some by a bank; now and then a pair.
   const side = random() < .3 ? (random() < .5 ? -1 : 1) * (.62 + random() * .2) : (random() - .5) * .9;
   const p = field.pointAt(channel, along, 0); if (!p) continue;
   const at = field.pointAt(channel, along, side * (p.water - .75)); if (!at || !clear(at.x, at.z)) continue;
   const s = field.sample(at.x, at.z, probe); if (!s || s.depth < .3) continue;
   const r = .24 + random() * .34;
   list.push({ x: at.x, z: at.z, r, top: .07 + random() * .2, level: s.level, yaw: random() * 6.3, tone: Math.floor(random() * ROCK_TONES.length), dx: at.dx, dz: at.dz });
   if (random() < .3) {
    const q = field.pointAt(channel, along + .5 + random() * .6, side * (p.water - .75) + (random() - .5) * 1.2);
    if (q && clear(q.x, q.z) && field.sample(q.x, q.z, probe)?.depth > .3) list.push({ x: q.x, z: q.z, r: .16 + random() * .14, top: .04 + random() * .08, level: s.level, yaw: random() * 6.3, tone: Math.floor(random() * ROCK_TONES.length), dx: q.dx, dz: q.dz });
   }
  }
 }
 return list;
}
function nearPoly(poly, x, z, reach) {
 for (let i = 0; i < poly.length; i++) {
  const a = poly[i], b = poly[(i + 1) % poly.length], ex = b[0] - a[0], ez = b[1] - a[1], l2 = ex * ex + ez * ez;
  const t = l2 ? Math.max(0, Math.min(1, ((x - a[0]) * ex + (z - a[1]) * ez) / l2)) : 0;
  if (Math.hypot(a[0] + ex * t - x, a[1] + ez * t - z) < reach) return true;
 }
 return false;
}
function buildRocks(field, map) {
 const list = rockSpots(field, map);
 if (!list.length) return { list, mesh: null };
 const parts = [], c = new THREE.Color();
 for (const rock of list) {
  const g = new THREE.IcosahedronGeometry(1, 0), height = rock.r * .8, pos0 = g.attributes.position;
  // Knocked out of true (each corner of the stone pushed in or out, the same
  // corner the same way on every face that shares it), long with the flow,
  // low, the top `top` above the water.
  for (let i = 0; i < pos0.count; i++) { const x = pos0.getX(i), y = pos0.getY(i), z = pos0.getZ(i), k = 1 + .22 * Math.sin(x * 12.9 + y * 7.1 + z * 5.3 + rock.yaw * 3); pos0.setXYZ(i, x * k, y * k, z * k); }
  g.scale(rock.r * 1.3, height, rock.r * .9); g.rotateY(Math.atan2(rock.dx, rock.dz) + (rock.yaw - 3) * .25);
  g.translate(rock.x, rock.level + rock.top - height, rock.z);
  const pos = g.attributes.position, colour = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
   c.copy(ROCK_TONES[rock.tone]).lerp(WET, 1 - Math.min(1, Math.max(0, (pos.getY(i) - rock.level) / .09)));
   colour[i * 3] = c.r; colour[i * 3 + 1] = c.g; colour[i * 3 + 2] = c.b;
  }
  g.computeVertexNormals(); g.setAttribute('color', new THREE.BufferAttribute(colour, 3)); g.deleteAttribute('uv');
  parts.push(g);
 }
 const geometry = mergeParts(parts);
 const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: .62, metalness: 0, flatShading: true }));
 mesh.name = 'water:rocks'; mesh.castShadow = true; mesh.receiveShadow = true; mesh.matrixAutoUpdate = false; mesh.updateMatrix();
 return { list, mesh };
}
// Non-indexed parts with the same attributes, as one geometry.
function mergeParts(parts) {
 const names = ['position', 'normal', 'color'], total = parts.reduce((n, g) => n + g.attributes.position.count, 0), out = new THREE.BufferGeometry();
 for (const name of names) {
  const size = parts[0].attributes[name].itemSize, array = new Float32Array(total * size);
  let at = 0; for (const g of parts) { array.set(g.attributes[name].array, at); at += g.attributes[name].array.length; }
  out.setAttribute(name, new THREE.BufferAttribute(array, size));
 }
 for (const g of parts) g.dispose();
 out.computeBoundingSphere();
 return out;
}
