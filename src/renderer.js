import {ShotgunView} from './shotgun-view.js';
import * as THREE from 'three';
import { RifleView } from './rifle-view.js';
import { RIFLE_QUALITY } from './rifle-quality.js';
import { GrenadeView } from './grenade-view.js';
import { DeathView } from './death-view.js';
import { makeRailways, makeRailProp, RAIL_TYPES } from './rail-depot.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildingWalls, mapProps, mapColliders, localOpenings, buildingOpenings, buildingPoint } from './maps.js';
import { inside, RULES } from './simulation.js';
import { GRAPHICS, renderPixelRatio, isDemanding } from './settings.js';
import { ElectricEffects } from './electric-effects.js';
import { makeLandmark, makeCobweb, makeQualityDetails, makePropDetails } from './world-details.js';
import { SurfaceMarks } from './surface-marks.js';
import { DustTrail, FOOTFALL_PARTICLES, IMPACT_PARTICLES, kickedDust, debrisDust, CLUTTER_BURST, throwsDust } from './dust-trail.js';
import { Birds } from './birds.js';
import { CropView } from './crop-view.js';
import { cropAt, cropEntityVisible, cropImmersion } from './crops.js';
import { InteriorVisibility } from './interior-visibility.js';

// How coarse the interior shroud is painted, as a divisor of the viewport. The
// upscale back to full size is what softens the doorway cones, so a bigger
// divisor is both cheaper AND a wider feather -- the low tiers want both.
const VISION_STEP = Object.freeze({ potato: 16, performance: 12, balanced: 9, quality: 7, extreme: 7 });
// Seconds between repaints. A phone never needs the shroud to chase the camera
// at frame rate; the cones are soft and move slowly.
const VISION_REPAINT = Object.freeze({ potato: .1, performance: .07, balanced: .05, quality: .033, extreme: .033 });
// The wash itself: a cool, desaturated grey that both dims the world outside
// and drains the warmth out of it, which together read as the old
// grayscale-plus-blur pass without any backdrop work. The higher tiers sit
// lighter because they still have the fog and the scene's own detail to lean
// on; Potato has almost nothing else separating inside from out.
const VISION_SHROUD = Object.freeze({ potato: 'rgba(74,79,76,.62)', performance: 'rgba(74,79,76,.58)',
  balanced: 'rgba(76,81,78,.52)', quality: 'rgba(78,83,80,.46)', extreme: 'rgba(78,83,80,.46)' });
import { makeDetailedInterior } from './detailed-interiors.js';
import { makeInteriorDetails } from './interior-details.js';
import { BUILDING_FINISHES } from './building-finishes.js';
import { makeApproaches, onApproach } from './approach-paths.js';
import { interiorPolygons, projectVisionPolygon } from './vision-polygons.js';
import { ROADSIDE_TYPES, makeRoadside } from './roadside.js';
import { OUTDOOR_CAMERA_HEIGHT, CAMERA_TILT, interiorCameraHeight } from './camera-framing.js';

const UP = new THREE.Vector3(0, 1, 0);
// Reused every frame by the beam pass rather than allocated per beam.
const BEAM_DELTA = new THREE.Vector3(), BEAM_DIR = new THREE.Vector3();
// walkingDustColor's return value is immediately cloned or lerped by its
// callers, so one scratch colour serves the crop-bed branch.
const DUST_SAMPLE = new THREE.Color();
// Fired clay, for the shard particles a broken pot throws.
const CLAY_SHARD = new THREE.Color('#b3735a');
// Prebuilt so the break path allocates nothing.
const CLUTTER_SHARDS = new Map(Object.entries(CLUTTER_BURST).map(([type, hex]) => [type, new THREE.Color(hex)]));
// The whole floor-clutter family shares these, so the pieces batch together.
const CLUTTER_CLAY = '#9c6346', CLUTTER_DARK = '#6d5a41', CLUTTER_SEAT = '#8d7454';
const WHITE = new THREE.Color('#ffffff');
const lerp = (a, b, t) => a + (b - a) * t;
const randomGenerator = seed => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

export class WorldView {
  constructor(canvas, map, qualityName='balanced') {
    this.map = map; this.canvas = canvas; this.materials = new Map();
    this.interiorVisibility = new InteriorVisibility();
    this.groundMaterials = new Set(); this.textureCache = new Map(); this.quality = GRAPHICS[qualityName] || GRAPHICS.balanced;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: this.quality.antialias === true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = .98;
    this.renderer.setClearColor('#8e7859');
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog('#8e7859', 70, 130);
    this.camera = new THREE.PerspectiveCamera(40, 1, .1, 180);
    this.focus = new THREE.Vector3(map.spawn.x, 0, map.spawn.z);
    this.cameraHeight = OUTDOOR_CAMERA_HEIGHT;
    this.scene.add(new THREE.HemisphereLight('#fff4df', '#b0a38c', 2));
    const sun = new THREE.DirectionalLight('#fff0cc', 2.5);
    sun.position.set(-24, 40, -18); sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    // Fitted to the ground the overhead camera can actually frame. At height 29
    // with a 40-degree fov and the standard tilt that is roughly 38m by 26m;
    // the previous 52x48 box covered 2.2x that, so well over half the shadow
    // pass was drawing casters for ground nobody could see. The sun sits a
    // fixed 50m from its target, so near/far can bracket that tightly instead
    // of spanning 89m, which spreads the depth range over 60m and lets the
    // biases come down. Tightening the box also multiplies texel density by
    // 2.2x, which is what pays for the cheaper filters below.
    Object.assign(sun.shadow.camera, { left: -21, right: 21, top: 15, bottom: -15, near: 20, far: 82 });
    sun.shadow.normalBias = .02; sun.shadow.bias = -.00008; sun.shadow.radius = 1;
    this.scene.add(sun, sun.target); this.sun = sun;
    this.static = new THREE.Group(); this.scene.add(this.static);
    this.propDetails = []; this.roofs = []; this.tumbleweeds = []; this.props = new Map();
    this.makeTerrain();
    makeRailways(this);
    for (const b of map.buildings) this.makeBuilding(b);
    for (const p of mapProps(map)) this.makeProp(p);
    for (const f of map.fences) this.makeFence(f);
    this.makePlayableEdge();
    this.cropView = new CropView(this); this.qualityDetails = makeQualityDetails(this);
    // Anything whose silhouette is smaller than a shadow texel from this camera
    // contributes nothing to the map but is still binned, transformed and drawn
    // every shadow update. This has to run before the merge, because castShadow
    // is part of the batch key. Individual builders already opt their own
    // clutter out; this is the safety net for everything that did not.
    this.shadowBySize(this.static, .34);
    this.batch(this.static);
    // `material.transparent` is part of three's program cache key, so the roof
    // fade now needs two variants of every roof material. Compiling the second
    // one lazily would stall the frame the player first walks into a building,
    // which is exactly the wrong moment. Warm both here, behind the loading
    // screen, which also warms every other program in the scene and removes
    // the usual first-frame hitches.
    this.warmPrograms();
    // These transforms never animate. Keep quality geometry, skip rebuilding its matrices.
    for (const root of [this.static,this.groundDetails,this.extraGroundDetails,this.qualityDetails,this.performanceDetails]) {
      root.updateMatrixWorld(true);
      root.traverse(o=>{o.matrixAutoUpdate=false;o.matrixWorldAutoUpdate=false;});
    }
    this.player = this.makePlayer(); this.scene.add(this.player);
    this.targets = new Map();
    for (const target of map.targets) {
      const group = this.makeTarget(target.moving, target.kind); this.interiorVisibility.applyEntity(group); this.targets.set(target.id, group); this.scene.add(group);
    }
    this.electric = new ElectricEffects(this.scene); this.shots = new Map(); this.particles = []; this.rings = []; this.beams = new Map(); this.blasts = [];
    this.smokeGeo = new THREE.IcosahedronGeometry(1, 0);
    this.beamGeo = new THREE.CylinderGeometry(1, 1, 1, 6);
    this.fxLight = new THREE.PointLight('#9bffe1', 0, 7, 2); this.scene.add(this.fxLight);
    this.shotGeo = new THREE.SphereGeometry(.125, 7, 5);
    this.shotMaterial = new THREE.MeshBasicMaterial({ color: '#d6fff0' });
    this.seedMaterial = new THREE.MeshStandardMaterial({ color: '#b8e4ff', emissive: '#548eb7', emissiveIntensity: .7, roughness: .38 });
    this.trailGeo = new THREE.CylinderGeometry(.032, .07, 1, 5); this.trailGeo.rotateX(Math.PI / 2);
    this.trailMaterial = new THREE.MeshBasicMaterial({ color: '#a1ffe0', transparent: true, opacity: .75 });
    this.orbElectricMaterial = new THREE.LineBasicMaterial({ color: '#e0fff5', transparent: true, opacity: .8, depthWrite: false, toneMapped: false });
    this.particleGeo = new THREE.BoxGeometry(1, 1, 1);
    // Not transparent: particles fade by scaling to zero, never by writing
    // opacity, so `transparent: true` only bought them a place in the blended
    // queue — sorted every frame, drawn after all opaque geometry, and unable
    // to depth-reject anything. Eight pools of 240 boxes is up to 1920 blended
    // quads during a break, on the exact frame you would notice a hitch.
    this.particleMaterials = ['#c99b65', '#edcf8c', '#fff4d0', '#a75436', '#788568', '#a68a60', '#696c58', '#ffffff'].map(color => new THREE.MeshBasicMaterial({ color }));
    this.particlePool = this.particleMaterials.map(m => {
      const mesh = new THREE.InstancedMesh(this.particleGeo, m, 240); mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.frustumCulled = false; this.scene.add(mesh); return mesh;
    });
    this.dustTrail = new DustTrail(this.scene);
    this.birds = new Birds(this.scene);
    this.dummy = new THREE.Object3D(); this.dustClock = 0; this.stepClock = 0; this.windClock = 0;
    this.footprints = []; this.footDistance = 0; this.footSide = 1;
    this.lastFootPosition = { ...map.spawn };
    const footGeometry = new THREE.CircleGeometry(1, 10); footGeometry.rotateX(-Math.PI / 2);
    footGeometry.setAttribute('fade', new THREE.InstancedBufferAttribute(new Float32Array(160), 1));
    this.footMesh = new THREE.InstancedMesh(footGeometry, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { relief: { value: 0 } },
      vertexShader: 'attribute float fade; varying float vFade; varying vec2 vFoot; void main(){ vFade=fade; vFoot=uv*2.0-1.0; gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.0); }',
      fragmentShader: 'uniform float relief; varying float vFade; varying vec2 vFoot; void main(){ float edge=smoothstep(0.68,0.97,length(vFoot)); float lip=edge*smoothstep(-0.1,0.8,vFoot.y)*relief; vec3 color=mix(vec3(0.22,0.17,0.11),vec3(0.72,0.60,0.40),lip); float shade=0.22+relief*(0.10*(1.0-edge)+0.15*edge); gl_FragColor=vec4(color,shade*vFade); }',
    }), 160);
    this.footMesh.count = 0; this.footMesh.frustumCulled = false;
    this.footMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.scene.add(this.footMesh);
    this.shake = 0; this.shakeDecay = 20; this.kick = new THREE.Vector3(); this.motion = true;
    this.raycaster = new THREE.Raycaster(); this.aimPlane = new THREE.Plane(UP, -.7); this.aimHit = new THREE.Vector3();
    this.cursorWorld = new THREE.Vector3();
    this.makeAmbient();
    this.surfaceMarks = new SurfaceMarks(this);
    // A canvas, not a masked div. The shroud used to be a full-viewport SVG
    // data URI carrying an erode and a gaussian blur, rebuilt twenty times a
    // second and handed to `mask-image`. Three separate problems came out of
    // that: a mask image decodes asynchronously, so the shroud painted itself
    // unmasked for a frame every time one swapped, which is the flicker; the
    // two filters ran over the whole viewport on the compositor; and building,
    // encoding and reparsing several kilobytes of SVG was main-thread work on
    // the frame a player walked through a doorway. Painting it here instead is
    // synchronous, so it can never be a frame out of step, and drawing at a
    // fraction of the viewport then letting CSS scale it back up gives the soft
    // edge for free -- the bilinear upscale IS the feather.
    this.visionOverlay = document.createElement('canvas'); this.visionOverlay.className = 'interior-vision';
    this.visionOverlay.dataset.quality = qualityName;
    this.visionContext = this.visionOverlay.getContext('2d');
    this.visionOverlay.setAttribute('aria-hidden', 'true'); canvas.insertAdjacentElement('afterend', this.visionOverlay);
    // Same story as the shroud above: this was a CSS radial gradient masked by a
    // rebuilt SVG data URI carrying an erode and a blur. Both halves fit in one
    // small canvas, where the mask and the gradient combine in a single
    // destination-in pass and nothing has to be decoded.
    this.cropOverlay = document.createElement('canvas'); this.cropOverlay.className = 'crop-vision';
    this.cropContext = this.cropOverlay.getContext('2d');
    this.cropOverlay.setAttribute('aria-hidden', 'true'); canvas.insertAdjacentElement('afterend', this.cropOverlay);
    this.setQuality(GRAPHICS[qualityName]?qualityName:'balanced');
    this.resize();
    this.camera.position.set(this.focus.x, this.cameraHeight, this.focus.z + this.cameraHeight * CAMERA_TILT); this.camera.lookAt(this.focus); this.camera.updateMatrixWorld();
  }

  makePlayableEdge(){
    const outline=this.map.playableArea;if(!outline)return;
    // A low continuous ranch fence makes the collision edge readable. Scenery
    // outside it stays rendered; it is not deleted or clipped by the perimeter.
    let nextPost=0;
    for(let i=0;i<outline.length;i++){
      const [ax,az]=outline[i],[bx,bz]=outline[(i+1)%outline.length];
      const length=Math.hypot(bx-ax,bz-az);
      while(nextPost<length){
        const t=nextPost/length;
        this.box(ax+(bx-ax)*t,.48,az+(bz-az)*t,.14,.96,.14,'#71624f');nextPost+=5;
      }
      nextPost-=length;
      for(const y of [.34,.73]){
        const rail=this.box((ax+bx)/2,y,(az+bz)/2,.075,.075,length+.015,'#91816a');
        rail.rotation.y=Math.atan2(bx-ax,bz-az);
      }
    }
  }

  material(color) {
    if (!this.materials.has(color)) this.materials.set(color, new THREE.MeshStandardMaterial({ color, roughness: 1, metalness: 0 }));
    return this.materials.get(color);
  }
  mesh(geometry, color, x, y, z, parent = this.static) {
    const m = new THREE.Mesh(geometry, typeof color === 'string' ? this.material(color) : color);
    m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
  }
  // Ground clutter is smaller than one shadow texel from the overhead camera, so
  // its contribution is invisible while its draw cost is not. Call before batch():
  // the merge key includes castShadow, so flipping it afterwards has no effect.
  noShadows(root) { root?.traverse(o => { if (o.isMesh) o.castShadow = false; }); return root; }

  // Keeps readable silhouettes (posts, markers, crates) casting while dropping
  // the chips and fasteners scattered over them. It only ever takes casting
  // away: assigning the test outright would silently re-enable everything an
  // earlier noShadows() had switched off, which is exactly what happened when
  // this was applied to the whole static group — interior furniture under a
  // closed roof went back into the shadow pass.
  shadowBySize(root, minRadius = .2) {
    root?.traverse(o => {
      if (!o.isMesh || !o.castShadow) return;
      o.geometry.computeBoundingSphere();
      if ((o.geometry.boundingSphere?.radius ?? 0) < minRadius) o.castShadow = false;
    });
    return root;
  }

  box(x, y, z, w, h, d, color, parent) { return this.mesh(new THREE.BoxGeometry(w, h, d), color, x, y, z, parent); }
  cylinder(x, y, z, radius, height, color, parent, segments = 10, top = radius) { return this.mesh(new THREE.CylinderGeometry(top, radius, height, segments), color, x, y, z, parent); }
  flat(x, z, w, d, color, y = .012) {
    const geometry = new THREE.PlaneGeometry(w, d); geometry.rotateX(-Math.PI / 2);
    const mesh = this.mesh(geometry, color, x, y, z); mesh.castShadow = false;
    if (y < .06 && w > 1 && d > 1) this.terrainUV(mesh);
    return mesh;
  }

  terrainUV(mesh) {
    const pos = mesh.geometry.attributes.position, uv = mesh.geometry.attributes.uv;
    for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + mesh.position.x) / 4, (pos.getZ(i) + mesh.position.z) / 4);
    this.groundMaterials.add(mesh.material);
  }

  terrainTexture(size) {
    if (this.textureCache.has(size)) return this.textureCache.get(size);
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d'), data = ctx.createImageData(size, size), random = randomGenerator(903);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const shade = 241 + Math.floor(random() * 10);
      data.data[i] = data.data[i + 1] = data.data[i + 2] = shade; data.data[i + 3] = 255;
    }
    ctx.putImageData(data, 0, 0);
    const texture = new THREE.CanvasTexture(canvas); texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.colorSpace = THREE.SRGBColorSpace; this.textureCache.set(size, texture); return texture;
  }

  setQuality(name) {
    this.rifleView?.setQuality(name);
    this.qualityName = name; this.quality = GRAPHICS[name] || GRAPHICS.balanced;
    this.resolutionScale=1;this.shadowClock=0;
    this.cropView?.setQuality(name);
    const q = this.quality;
    this.renderer.shadowMap.enabled = q.shadows > 0;
    // PCF_SOFT costs 20 depth-compare fetches per shaded fragment and PCF costs
    // 17, against 1 for the basic path — and every opaque object in the scene
    // sets receiveShadow, so that lands on the whole screen, ground included.
    // The tighter shadow box above more than doubled texel density, so the
    // phone tiers can drop a filter level and still look sharper than before.
    this.renderer.shadowMap.type = isDemanding(name) ? THREE.PCFSoftShadowMap
      : name === 'balanced' ? THREE.PCFShadowMap : THREE.BasicShadowMap;
    this.sun.castShadow = q.shadows > 0;
    this.sun.shadow.autoUpdate = !q.shadowFPS;
    if (this.sun.shadow.mapSize.x !== Math.max(1, q.shadows)) {
      this.sun.shadow.map?.dispose(); this.sun.shadow.map = null;
      this.sun.shadow.mapSize.set(Math.max(1, q.shadows), Math.max(1, q.shadows));
    }
    this.sun.shadow.needsUpdate = true;
    const texture = this.terrainTexture(q.texture);
    texture.anisotropy = Math.min(q.anisotropy ?? 2, this.renderer.capabilities.getMaxAnisotropy());
    texture.needsUpdate = true;
    // A bump map is one extra texture fetch on surfaces that are already being
    // shaded, so the sand grain is affordable a tier lower than the wood grain,
    // which would touch every building face as well as the ground.
    const groundRelief = q.relief ? this.reliefTexture('sand') : null;
    const woodRelief = q.relief === 'full' ? this.reliefTexture('wood') : null;
    this.groundMaterials.forEach(m => { m.map = name === 'potato' ? null : texture; m.bumpMap = groundRelief; m.bumpScale = .075; m.needsUpdate = true; });
    for (const roof of this.roofs) for (const m of roof.materials) { m.bumpMap = woodRelief; m.bumpScale = .035; m.roughness = .88; m.needsUpdate = true; }
    const timberColors = new Set(['#917655','#ad9470','#66543f','#9b8161','#b59971','#967b58','#ab8e65',...this.map.buildings.map(b=>b.color)]);
    for (const [color,m] of this.materials) if (timberColors.has(color) && !this.groundMaterials.has(m)) { m.bumpMap=woodRelief; m.bumpScale=.035; m.needsUpdate=true; }
    // Materials are shared across thousands of meshes; flag each one once so a
    // preset change queues one recompile per program instead of per mesh.
    const recompiled = new Set();
    this.scene.traverse(o => {
      if (!o.isMesh || !o.material) return;
      for (const m of Array.isArray(o.material) ? o.material : [o.material])
        if (m && !recompiled.has(m)) { recompiled.add(m); m.needsUpdate = true; }
    });
    this.motes.geometry.setDrawRange(0, q.motes);
    this.fxLight.visible = q.light;
    this.groundDetails.visible = name === 'balanced' || isDemanding(name);
    this.performanceDetails.visible = name !== 'potato';
    this.propDetails.forEach(g => { g.visible = isDemanding(name); });
    this.extraGroundDetails.visible = isDemanding(name); this.qualityDetails.visible = isDemanding(name);
    this.footMesh.material.uniforms.relief.value = q.shadows > 0 ? 1 : 0;
    for (const [i, marks] of this.sandMarks.entries()) {
      marks.visible = name !== 'potato';
      marks.material.opacity = isDemanding(name) ? (i ? .25 : .3) : name === 'balanced' ? (i ? .25 : .3) : .09;
      const fraction = isDemanding(name) ? 1 : name === 'balanced' ? 1 : .3;
      marks.geometry.setDrawRange(0, Math.floor(marks.geometry.attributes.position.count * fraction / 2) * 2);
    }
    for (const beam of this.beams.values()) beam.halo.visible = q.glow;
    this.particles.length = Math.min(this.particles.length, q.particleCap);
    this.electric.setQuality(name);
    this.dustTrail?.setQuality(name);
    this.birds?.setQuality(name);
    if (this.visionOverlay) this.visionOverlay.dataset.quality = name;
    this.resize();
  }

  reliefTexture(kind) {
    const key='relief-'+kind;if(this.textureCache.has(key))return this.textureCache.get(key);
    const canvas=document.createElement('canvas');canvas.width=canvas.height=512;
    const ctx=canvas.getContext('2d'),random=randomGenerator(kind==='wood'?713:914);
    ctx.fillStyle='#808080';ctx.fillRect(0,0,512,512);
    for(let i=0;i<(kind==='wood'?1600:7500);i++) {
      const x=random()*512,y=random()*512,shade=90+Math.floor(random()*75);
      ctx.strokeStyle=`rgb(${shade},${shade},${shade})`;ctx.lineWidth=kind==='wood'?.6:.8;
      ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+(kind==='wood'?5+random()*45:1+random()*3),y+(random()-.5)*(kind==='wood'?1:3));ctx.stroke();
    }
    const texture=new THREE.CanvasTexture(canvas);texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
    texture.anisotropy=Math.min(8,this.renderer.capabilities.getMaxAnisotropy());this.textureCache.set(key,texture);return texture;
  }

  batch(group) {
    group.updateMatrixWorld(true);
    const buckets = new Map();
    group.traverse(o => {
      if (!o.isMesh || Array.isArray(o.material) || o.material.map || o.material.alphaMap) return;
      // Spatial batches let both the camera and shadow frusta reject distant detail.
      // Material-only batches span the entire map, drawing every blade of grass.
      o.geometry.computeBoundingSphere();
      const center=o.geometry.boundingSphere.center.clone().applyMatrix4(o.matrixWorld);
      const cell=`${Math.floor(center.x/24)},${Math.floor(center.z/24)}`;
      const key = `${cell}-${o.material.uuid}-${o.castShadow}-${!!o.geometry.index}-${Object.keys(o.geometry.attributes).sort().join(',')}`;
      if (!buckets.has(key)) buckets.set(key, { material: o.material, castShadow: o.castShadow, meshes: [] });
      buckets.get(key).meshes.push(o);
    });
    const inverse = group.matrixWorld.clone().invert();
    for (const { material, castShadow, meshes } of buckets.values()) {
      if (meshes.length < 2) continue;
      const geometries = meshes.map(m => m.geometry.clone().applyMatrix4(inverse.clone().multiply(m.matrixWorld)));
      const merged = mergeGeometries(geometries);
      if (!merged) { geometries.forEach(g => g.dispose()); continue; }
      merged.computeBoundingSphere();
      const m = new THREE.Mesh(merged, material); m.castShadow = castShadow; m.receiveShadow = true;
      for (const original of meshes) { original.removeFromParent(); original.geometry.dispose(); }
      geometries.forEach(g => g.dispose()); group.add(m);
    }
  }

  text(text, x, y, z, width, height, color = '#665b43', rotation = -Math.PI / 2, parent = this.static) {
    const c = document.createElement('canvas'); c.width = 1024; c.height = 128;
    const ctx = c.getContext('2d'); ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '700 68px Georgia'; ctx.fillText(text, 512, 68);
    const texture = new THREE.CanvasTexture(c); texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, side: THREE.DoubleSide, opacity: .85 });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
    mesh.position.set(x, y, z); mesh.rotation.x = rotation; parent.add(mesh); return mesh;
  }

  makeTerrain() {
    const { map } = this;
    // The ground casts onto nothing, and its bounding sphere covers the map, so
    // it can never be culled out of a shadow update.
    this.terrainUV(this.noShadows(this.box(0, -.28, 0, map.width + 60, .5, map.depth + 60, map.palette.ground)));
    if(map.training){
      this.roadProfile=[{z:-30,left:0,right:0},{z:30,left:0,right:0}];this.sandMarks=[];
      for(const key of ['groundDetails','extraGroundDetails','performanceDetails']){this[key]=new THREE.Group();this.scene.add(this[key]);}
      for(const [x,z,w,d] of [[0,-14,32,.4],[0,14,32,.4],[-16,0,.4,28],[16,0,.4,28]])this.box(x,.5,z,w,1,d,'#95846b');
      return;
    }
    // One worn street with locally uneven edges and gentle, irregular bends.
    const road = new THREE.Shape(), edgeRandom = randomGenerator(map.scenerySeed + 1), end = map.depth / 2 + 12;
    const steps = 76; this.roadProfile = [];
    let center = 0;
    for (let i = 0; i <= steps; i++) {
      center = center * .65 + (edgeRandom() - .5) * .65;
      const z = -end + i / steps * end * 2;
      const bend = map.roadBend, t = bend ? Math.max(0, Math.min(1, (z - bend.start) / (bend.end - bend.start))) : 0;
      const farm = map.farmBend, u = farm ? Math.max(0, Math.min(1, (z - farm.start) / (farm.end - farm.start))) : 0;
      const offset = (bend ? bend.offset * t * t * (3 - 2 * t) : 0) + (farm ? farm.offset * u * u * (3 - 2 * u) : 0);
      const left = center + offset - 3.5 - edgeRandom() * .5, right = center + offset + 3.4 + edgeRandom() * .5;
      this.roadProfile.push({ z, left, right });
      const x = left;
      if (!i) road.moveTo(x, -z); else road.lineTo(x, -z);
    }
    for (let i = steps; i >= 0; i--) road.lineTo(this.roadProfile[i].right, -this.roadProfile[i].z);
    road.closePath();
    // Road and footpath coverage is rendered once by makeApproaches.
    if(map.farmBend)this.farmRoadPoints=[[48,80],[75,81.2],[77,84],[49,83.2]];
    const rand = randomGenerator(map.scenerySeed);
    for (let i = 0; i < 12; i++) {
      const x = (rand() - .5) * (map.width + 30), z = (rand() - .5) * (map.depth + 25);
      if (Math.abs(x) < 6 || map.buildings.some(b => inside({ x, z }, b, 2))) continue;
      this.makeGrass(x, z, rand);
    }
    for (let i = 0; i < 30; i++) {
      const edge = i % 4, a = rand();
      const x = edge < 2 ? (edge ? -1 : 1) * (map.width / 2 + 1 + rand() * 6) : (a - .5) * map.width;
      const z = edge >= 2 ? (edge === 2 ? -1 : 1) * (map.depth / 2 + 1 + rand() * 5) : (a - .5) * map.depth;
      const size = 1.2 + rand() * 2.8;
      const rock = this.mesh(new THREE.DodecahedronGeometry(size, 0), i % 2 ? '#b9a17d' : '#c6ab82', x, size * .32, z);
      rock.scale.set(1, .7, .75); rock.rotation.y = rand() * 6;
    }
    makeApproaches(this);
    this.makeGroundDetails();
    this.makeSandMarks();
    this.makeWornTerrain();
  }

  roadEdges(z) {
    const rows = this.roadProfile;
    for (let i = 1; i < rows.length; i++) if (z <= rows[i].z) {
      const t = Math.max(0, (z - rows[i - 1].z) / (rows[i].z - rows[i - 1].z));
      return { left: lerp(rows[i - 1].left, rows[i].left, t), right: lerp(rows[i - 1].right, rows[i].right, t) };
    }
    return rows.at(-1);
  }

  onSideRoad(x,z,padding=0) {
    if(this.approachPaths && onApproach(this.approachPaths,x,z,padding))return true;
    const branches=this.map.farmBend ? [...(this.map.sideRoads||[]),{points:[[48,80],[75,81.2],[77,84],[49,83.2]]}] : this.map.sideRoads||[];
    return branches.some(({points}) => {
      let within=false;
      for(let i=0,j=points.length-1;i<points.length;j=i++) {
        const [ax,az]=points[i],[bx,bz]=points[j];
        if((az>z)!==(bz>z) && x<(bx-ax)*(z-az)/(bz-az)+ax) within=!within;
        if(padding){const dx=bx-ax,dz=bz-az,t=Math.max(0,Math.min(1,((x-ax)*dx+(z-az)*dz)/(dx*dx+dz*dz)));if(Math.hypot(x-ax-dx*t,z-az-dz*t)<padding)return true;}
      }
      return within;
    });
  }

  makeWornTerrain() {
    const random = randomGenerator(this.map.scenerySeed + 604), group = new THREE.Group(); this.static.add(group);
    const obstacles = mapColliders(this.map);
    for (let i = 0; i < 130; i++) {
      const x = (random() - .5) * this.map.width, z = (random() - .5) * this.map.depth, radius = 1.1 + random() * 1.7;
      const edge = this.roadEdges(z);
      if ((x > edge.left - radius - .5 && x < edge.right + radius + .5) || this.onSideRoad(x,z,radius) || this.map.buildings.some(b => inside({ x, z }, b, radius + 2.5))) continue;
      if (obstacles.some(b => inside({ x, z }, b, radius + .5)) || this.map.targets.some(t => Math.hypot(t.x - x, t.z - z) < radius + 1)) continue;
      const geometry = new THREE.CircleGeometry(radius, 9); geometry.rotateX(-Math.PI / 2);
      const positions = geometry.attributes.position;
      for (let k = 0; k < positions.count; k++) {
        positions.setY(k, k === 0 ? .012 + random() * .02 : -.025);
        if (k > 0) { const scale = .8 + random() * .3; positions.setX(k, positions.getX(k) * scale); positions.setZ(k, positions.getZ(k) * scale); }
      }
      geometry.computeVertexNormals();
      const color = '#' + new THREE.Color(this.map.palette.ground).multiplyScalar(.965 + random() * .065).getHexString();
      const patch = this.mesh(geometry, color, x, 0, z, group); patch.castShadow = false;
    }
  }

  makeSandMarks() {
    const random = randomGenerator(this.map.scenerySeed + 411), points = [[], []]; this.sandMarks = [];
    const obstacles = mapColliders(this.map);
    for (let i = 0; i < 1900 * this.map.width * this.map.depth / (76 * 64); i++) {
      const x = (random() - .5) * this.map.width, z = (random() - .5) * this.map.depth;
      if (this.map.buildings.some(b => inside({ x, z }, b, 2.7)) || obstacles.some(b => inside({ x, z }, b, .3))) continue;
      const edge = this.roadEdges(z), road = (x > edge.left && x < edge.right) || this.onSideRoad(x,z);
      const angle = random() * Math.PI, length = .2 + random() ** 1.5 * 1.05;
      const dx = Math.cos(angle) * length, dz = Math.sin(angle) * length;
      const sameSurface = t => {
        const px=x+dx*t,pz=z+dz*t,edge=this.roadEdges(pz);
        return road===((px>edge.left&&px<edge.right)||this.onSideRoad(px,pz));
      };
      if(!sameSurface(.5)||!sameSurface(1))continue;
      // Individual short, straight, irregular marks: no repeating UV pattern.
      const y = road ? .041 : -.018;
      points[road ? 1 : 0].push(x, y, z, x + dx, y, z + dz);
    }
    // Narrow approaches need deliberate coverage; map-wide sampling leaves short
    // walks nearly blank, especially around the large building exclusion margins.
    for(const path of this.approachPaths || [])for(let i=1;i<path.points.length;i++) {
      const a=path.points[i-1],b=path.points[i],distance=Math.hypot(b.x-a.x,b.z-a.z);
      if(distance<.05)continue;
      const tx=(b.x-a.x)/distance,tz=(b.z-a.z)/distance;
      const strandCount=Math.floor(distance*1.5+random());
      for(let j=0;j<strandCount;j++) {
        const along=random(),offset=(random()-.5)*.8;
        const x=a.x+(b.x-a.x)*along-tz*offset,z=a.z+(b.z-a.z)*along+tx*offset;
        const angle=random()*Math.PI,length=.25+random()*.65,dx=Math.cos(angle)*length,dz=Math.sin(angle)*length;
        if(!this.onSideRoad(x,z)||!this.onSideRoad(x+dx*.5,z+dz*.5)||!this.onSideRoad(x+dx,z+dz))continue;
        if(obstacles.some(o=>inside({x,z},o,.15)||inside({x:x+dx,z:z+dz},o,.15)))continue;
        points[1].push(x,.043,z,x+dx,.043,z+dz);
      }
    }
    for (let i = 0; i < 2; i++) {
      const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(points[i], 3));
      const marks = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: i ? '#5f4a30' : '#bca077', transparent: true, opacity: i ? .1 : .13, depthWrite: false }));
      // Approach masks are transparent too: draw strands afterwards so their
      // opaque road-colored pixels cannot paint over the line segments.
      marks.renderOrder=1;
      this.scene.add(marks); this.sandMarks.push(marks);
    }
  }

  makeWallFinish(b, wall) {
    const wear = randomGenerator(Math.round((wall.x + 60) * 817 + (wall.z + 60) * 311));
    const horizontal = wall.w > wall.d, length = horizontal ? wall.w : wall.d;
    const sign = horizontal ? Math.sign(wall.z - b.z) : Math.sign(wall.x - b.x);
    const brick = b.finish === 'brick', rowHeight = brick ? .36 : .29;
    const colors = [.93, 1.005, 1.03].map(v => '#' + new THREE.Color(b.color).multiplyScalar(v).getHexString());
    const face=(horizontal ? wall.d : wall.w)/2+.018;
    if(b.finish==='vertical') {
      for(let start=-length/2;start<length/2;start+=.38){
        const width=Math.min(.38,length/2-start)-.015,along=start+width/2;
        this.box(wall.x+(horizontal?along:sign*face),wall.height/2,wall.z+(horizontal?sign*face:along),horizontal?width:.035,wall.height-.03,horizontal?.035:width,colors[Math.floor(wear()*3)]);
      }
      return;
    }
    if(b.finish==='plaster') {
      // Broad muted patches, chipped to reveal a few courses near the base.
      for(let i=0;i<Math.ceil(length/2.5);i++){
        const along=-length/2+(i+.5)*length/Math.ceil(length/2.5),w=length/Math.ceil(length/2.5)*.8,h=.2+wear()*.5;
        this.box(wall.x+(horizontal?along:sign*face),h/2+.12,wall.z+(horizontal?sign*face:along),horizontal?w:.027,h,horizontal?.027:w,colors[i%3]);
      }
      return;
    }
    for (let row = 0; row * rowHeight < b.height; row++) {
      const h = Math.min(rowHeight, b.height - row * rowHeight) - .014;
      if (h <= 0) continue;
      const step = brick ? .85 : length;
      for (let start = -length / 2 - (brick && row % 2 ? step / 2 : 0); start < length / 2; start += step) {
        const left = Math.max(start, -length / 2), right = Math.min(start + step, length / 2), width = right - left - .014 - (wear() < .18 ? .04 : 0);
        if (width < .02) continue;
        const along = (left + right) / 2, face = (horizontal ? wall.d : wall.w) / 2 + .015;
        this.box(wall.x + (horizontal ? along : sign * face), row * rowHeight + h / 2 + .008,
          wall.z + (horizontal ? sign * face : along), horizontal ? width : .04, h, horizontal ? .04 : width,
          colors[(row + Math.floor((start + length) / step)) % colors.length]);
      }
    }
  }

  makeGroundDetails() {
    const base = new THREE.Group(), extra = new THREE.Group(), sparse = new THREE.Group(); this.scene.add(base, extra, sparse);
    this.performanceDetails=sparse;
    this.groundDetails = base; this.extraGroundDetails = extra;
    const random = randomGenerator(this.map.scenerySeed + 73), obstacles = mapColliders(this.map);
    let patches = 0;
    for (let attempt = 0; attempt < 9000 && patches < Math.round(950 * this.map.width * this.map.depth / (76 * 64)); attempt++) {
      const x = (random() - .5) * this.map.width, z = (random() - .5) * this.map.depth;
      const road = this.roadEdges(z);
      if ((x > road.left - 1 && x < road.right + 1) || this.onSideRoad(x,z,1) || (this.map.crops || []).some(f => inside({ x, z }, f, .3)) || this.map.buildings.some(b => inside({ x, z }, b, 2.7)) ||
          obstacles.some(b => inside({ x, z }, b, 1)) || this.map.targets.some(t => Math.hypot(t.x - x, t.z - z) < 2)) continue;
      patches++;
      const group = patches%7===0 ? sparse : patches <= Math.round(330 * this.map.width * this.map.depth / (76 * 64)) ? base : extra;
      const dry = patches % 5 !== 0, stems = dry ? 5 + Math.floor(random() * 5) : 6;
      for (let i = 0; i < stems; i++) {
        const angle = i / stems * Math.PI * 2 + random() * .4;
        const height = dry ? .22 + random() * .42 : .16 + random() * .18;
        const stem = this.mesh(new THREE.ConeGeometry(dry ? .035 : .075, height, 3),
          dry ? i % 3 ? '#b8a167' : '#c9b577' : '#83856a',
          x + Math.cos(angle) * .12, height * .42, z + Math.sin(angle) * .12, group);
        stem.rotation.set(Math.sin(angle) * .45, angle, Math.cos(angle) * .45);
        if (dry && i % 3 === 0) {
          const head = this.mesh(new THREE.SphereGeometry(.045, 5, 3), '#c9b577',
            x + Math.cos(angle) * .2, height * .9, z + Math.sin(angle) * .2, group);
          head.scale.set(.7, 1.8, .7);
        }
      }
      if (patches % 2 === 0) for (let i = 0; i < 3; i++) {
        const stone = this.mesh(new THREE.DodecahedronGeometry(.07 + random() * .1), '#8c7a5c',
          x + (random() - .5) * 1.5, .05, z + (random() - .5) * 1.5, group);
        stone.scale.y = .45; stone.rotation.y = random() * 6;
      }
    }
    this.noShadows(base); this.noShadows(extra); this.noShadows(sparse);
    this.batch(base); this.batch(extra); this.batch(sparse);
    base.userData.patches = Math.min(330, patches); extra.userData.patches = Math.max(0, patches - 330);
  }

  makeGrass(x, z, rand) {
    for (let k = 0; k < 4; k++) {
      const m = this.box(x + (rand() - .5) * .35, .13, z + (rand() - .5) * .25, .035, .25 + rand() * .2, .035, '#a69665');
      m.rotation.z = (rand() - .5) * 1.4; m.castShadow = false;
    }
  }
  makeCactus(x, z, scale = 1, parent = this.static) {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.scale.setScalar(scale); parent.add(g);
    this.cylinder(0, 1.15, 0, .25, 2.3, '#788568', g, 7, .21);
    this.mesh(new THREE.SphereGeometry(.215, 7, 5), '#788568', 0, 2.3, 0, g);
    this.box(.4, .95, 0, .8, .27, .28, '#788568', g);
    this.cylinder(.72, 1.24, 0, .15, .7, '#788568', g, 7);
    this.box(-.33, 1.4, 0, .66, .24, .24, '#83916e', g);
    this.cylinder(-.6, 1.66, 0, .13, .65, '#83916e', g, 7);
  }

  makeBuilding(b) {
    const angle = b.angle || 0, oldStatic = new Set(this.static.children);
    b = { ...b, ...BUILDING_FINISHES[b.id], angle: 0 };
    this.flat(b.x, b.z, b.w, b.d, '#9b8161', b.cargo ? .245 : .065);
    if(b.cargo) {
      // The freight floor sits above the rail heads, with continuous solid coverage.
      this.box(b.x,.17,b.z,b.w,.15,b.d,'#655946');
      for(let z=-b.d/2+.22;z<b.d/2;z+=.44)
        this.box(b.x,.26,b.z+z,b.w-.12,.035,Math.min(.42,b.d/2-z+.2),'#8b785b');
    }
    for (const w of buildingWalls(b)) {
      this.box(w.x, w.height / 2, w.z, w.w, w.height, w.d, b.color);
      this.makeWallFinish({ ...b, height: w.height }, w);
    }
    for (const opening of b.windows || []) {
      const g = new THREE.Group(); this.static.add(g);
      const horizontal = ['front', 'back'].includes(opening.side), sign = ['back', 'left'].includes(opening.side) ? -1 : 1;
      g.position.set(b.x + (horizontal ? opening.offset : sign * b.w / 2), 0, b.z + (horizontal ? sign * b.d / 2 : opening.offset));
      g.rotation.y = { front: 0, back: Math.PI, left: -Math.PI / 2, right: Math.PI / 2 }[opening.side];
      this.box(0, (b.height + 1.75) / 2, 0, opening.width, b.height - 1.75, .38, b.color, g);
      for (const x of [-opening.width / 2, opening.width / 2]) this.box(x, 1.12, .22, .1, 1.36, .12, '#79634b', g);
      for (const y of [.52, 1.77]) this.box(0, y, .25, opening.width + .2, .1, .22, '#987e5d', g);
      if (opening.boarded) {
        this.box(0, 1.12, .25, opening.width, 1.15, .05, '#504a3c', g);
        for (const tilt of [-.22, .18]) { const plank = this.box(0, 1.12 + tilt, .34, opening.width + .25, .19, .08, '#8c785b', g); plank.rotation.z = tilt; }
      }
      if (b.abandoned || opening.boarded) makeCobweb(this, g, opening.width);
      for (const side of [-1, 1]) {
        const shutter = this.box(side * (opening.width / 2 + .23), 1.13, .19, .36, 1.17, .07, '#7e806b', g);
        shutter.rotation.y = side * .28; shutter.rotation.z = side * .025;
      }
    }
    // Doorway lintel and structural corner posts.
    this.box(b.x, b.height - .21, b.z + b.d / 2, b.doorWidth, .42, .4, '#866c4f');
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) this.box(b.x + sx * b.w / 2, b.height / 2, b.z + sz * b.d / 2, .26, b.height + .12, .26, '#967858');
    // Only actual front entrances get a front porch.
    if(!b.cargo && (b.doors||['front']).includes('front')) {
    // A plank porch with small steps, hitching rail and interior counter.
    this.box(b.x, .12, b.z + b.d / 2 + 1.2, b.cargo ? 2.4 : b.w + 1, .24, 2.2, '#b59971');
    for (let i = -(b.cargo ? 1 : b.w / 2); i <= (b.cargo ? 1 : b.w / 2); i += 1.5) this.flat(b.x + i, b.z + b.d / 2 + 1.2, .018, 2.15, '#a78e6a', .248);
    this.box(b.x, .06, b.z + b.d / 2 + 2.4, 3, .12, .65, '#b39a76');
    }
    for (const side of (b.doors || ['front']).filter(side => side !== 'front')) {
      const horizontal = side === 'back', sign = side === 'left' || side === 'back' ? -1 : 1;
      const x = b.x + (horizontal ? 0 : sign * b.w / 2), z = b.z + (horizontal ? -b.d / 2 : 0);
      this.box(x, b.height - .21, z, horizontal ? b.doorWidth : .4, .42, horizontal ? .4 : b.doorWidth, '#866c4f');
      if(!b.cargo)this.box(x + (horizontal ? 0 : sign * .65), .06, z + (horizontal ? -.65 : 0), horizontal ? 3.1 : 1.5, .12, horizontal ? 1.5 : 3.1, '#b39a76');
    }
    const roof = new THREE.Group(); this.scene.add(roof);
    const mainMat = new THREE.MeshStandardMaterial({ color: b.roofColor, roughness: 1, transparent: true });
    const trimMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(b.roofColor).multiplyScalar(.8), roughness: 1, transparent: true });
    const roofMaterials = [mainMat, trimMat, ...[.96, 1.025, 1.055].map(v => new THREE.MeshStandardMaterial({ color: new THREE.Color(b.roofColor).multiplyScalar(v), roughness: .95, transparent: true }))];
    const slope = Math.atan2(b.cargo ? .12 : .7, b.w / 2);
    for (const side of [-1, 1]) {
      const panel = this.box(b.x + side * b.w / 4, b.height + .36, b.z, b.w / 2 + .65, .15, b.d + 1, mainMat, roof); panel.rotation.z = -side * slope;
      const width = b.w / 2 + .65, depth = b.d + 1;
      if (b.id === 'supplies' || b.metalRoof) {
        // Raised corrugations run down the pitch of the weathered metal roof.
        for (let z = -depth / 2 + .18; z < depth / 2; z += .45)
          this.box(0, .105, z, width, .045, .045, roofMaterials[3], panel);
      } else {
        // Staggered wooden shingles have a shallow physical lip and muted tones.
        for (let row = 0, x = -width / 2; x < width / 2; row++, x += .57) {
          for (let z = -depth / 2 - (row % 2 ? .55 : 0), col = 0; z < depth / 2; z += 1.1, col++) {
            const low = Math.max(z, -depth / 2), high = Math.min(z + 1.1, depth / 2);
            this.box(x + Math.min(.57, width / 2 - x) / 2, .1, (low + high) / 2,
              Math.min(.57, width / 2 - x) - .012, .035, high - low - .012, roofMaterials[2 + (row * 7 + col * 3 + col % 2) % 3], panel);
          }
        }
      }
    }
    this.box(b.x, b.height + .8, b.z, .18, .12, b.d + 1.15, trimMat, roof);
    this.box(b.x, b.height - .08, b.z + b.d / 2 + .22, b.w + .4, .55, .22, '#9f805c');
    // Shingles and corrugations stand 3-4cm proud of the panel carrying them, and
    // that panel already casts the whole roof. Re-drawing every tile into the
    // shadow map is the single largest source of wasted casters per building.
    for (const layer of roof.children) for (const tile of layer.children) this.noShadows(tile);
    this.batch(roof);
    // Thin raised roof layers should not produce shadow-map striping on each other.
    roof.traverse(m => { if (m.isMesh) m.receiveShadow = false; });
    // Captured after the batch: these are the merged meshes that actually came
    // out as casters. The roof fade toggles exactly these, because traversing
    // the whole group undid the noShadows() above on the first frame and put
    // every shingle batch back into the shadow pass.
    const casters = [];
    roof.traverse(m => { if (m.isMesh && m.castShadow) casters.push(m); });
    this.roofs.push({ ...b, group: roof, casters, materials: roofMaterials, opacity: 1 });
    const beforeInterior = new Set(this.static.children);
    if(b.interiorStyle) makeDetailedInterior(this,b);
    else {
      this.box(b.x, .4, b.z - b.d / 2 + 1.1, b.w - (b.finish==='plaster'?3.5:2), .8, .65, b.trim || '#987853');
      for (const sx of [-1, 1]) this.cylinder(b.x + sx * (b.finish==='vertical'?1.5:2), .28, b.z - b.d / 2 + 2.2, .32, .56, b.trim || '#7d6a50');
    }
    if (!b.cargo) makeInteriorDetails(this,b);
    // Furniture and interior trim sit under a closed roof, so the sun driving the
    // shadow map never reaches them. Their casters are draw cost with no pixels.
    for (const child of this.static.children) if (!beforeInterior.has(child)) this.noShadows(child);
    if (b.cargo) {
      for(const side of [-1,1]) {
        for(const z of [-b.d*.3,b.d*.3]) {
          const wheel=this.cylinder(b.x+side*(b.w/2+.08),.4,b.z+z,.43,.18,'#484e48',this.static,10);wheel.rotation.z=Math.PI/2;
        }
        for(const z of [-b.d/2+.2,b.d/2-.2])this.box(b.x+side*(b.w/2+.21),1.2,b.z+z,.08,2.4,.1,'#596157');
      }
    }
    if (angle) {
      const pivot = new THREE.Group(); pivot.position.set(b.x, 0, b.z); pivot.rotation.y = angle;
      for (const mesh of [...this.static.children].filter(m => !oldStatic.has(m))) {
        mesh.position.x -= b.x; mesh.position.z -= b.z; pivot.add(mesh);
      }
      this.static.add(pivot);
      // Roof geometry uses the same pivot, while its fade footprint stays in map space.
      for (const mesh of roof.children) { mesh.position.x -= b.x; mesh.position.z -= b.z; }
      roof.position.set(b.x, 0, b.z); roof.rotation.y = angle;
    }
  }

  makeFence(f) {
    const isX = f.axis === 'x';
    const panels = Math.ceil(f.length / 2.5), span = f.length / panels;
    for (let i = 0; i <= panels; i++) {
      const t = -f.length / 2 + i * span;
      this.box(f.x + (isX ? t : 0), .56, f.z + (isX ? 0 : t), .22, 1.12, .22, '#897357');
    }
    for (let i = 0; i < panels; i++) {
      const t = -f.length / 2 + (i + .5) * span;
      for (const h of [.4, .84]) this.box(f.x + (isX ? t : 0), h, f.z + (isX ? 0 : t), isX ? span - .15 : .12, .13, isX ? .12 : span - .15, '#a08a66');
    }
  }

  makeProp(p) {
    const g = new THREE.Group(); g.position.set(p.x, 0, p.z); g.rotation.y = p.angle || 0;
    if (p.health !== null) { this.scene.add(g); this.props.set(p.id, g); } else this.static.add(g);
    if (['brokenWagon', 'windmill', 'trough', 'cistern', 'ruinedArch', 'telegraph', 'deadTree', 'stump', 'boulder'].includes(p.type)) makeLandmark(this, p, g);
    if (RAIL_TYPES[p.type]) makeRailProp(this,p,g);
    else if (ROADSIDE_TYPES[p.type]) makeRoadside(this, p, g);
    else if (p.type === 'barrel') {
      this.cylinder(0, .5, 0, .46, 1, '#9c7d58', g, 10, .41);
      for (const y of [.2, .77]) this.cylinder(0, y, 0, .465, .09, '#696c58', g, 10);
      this.cylinder(0, 1.006, 0, .34, .015, '#b6996f', g, 10);
    } else if (p.type === 'crate' && p.broken) {
      // Half a crate: the lid and one wall gone, the inside open to the sky,
      // and the planks that came off lying beside it. Same palette and the
      // same flat boxes as a whole crate, so it reads as the same object with
      // less of it left rather than as a different prop.
      const wall = .54;
      this.box(0, .05, 0, 1.15, .1, 1.15, '#8a6f4b', g);
      for (const [x, z, w, d] of [[0, -.53, 1.15, .1], [-.53, 0, .1, 1.15], [.53, .09, .1, .98]])
        this.box(x, wall / 2 + .1, z, w, wall, d, '#b39468', g);
      // What is left of the fourth wall, snapped off part way up.
      this.box(.14, .27, .53, .48, .34, .1, '#a8895f', g);
      for (const [x, z, w, d] of [[0, -.53, 1.2, .13], [-.53, 0, .13, 1.2]])
        this.box(x, wall + .13, z, w, .06, d, '#98784f', g);
      // Debris keeps to the footprint so it never reads as cover that is not there.
      for (const [x, z, angle, length] of [[.36, .46, .42, .62], [-.1, .44, -1.15, .5], [.3, -.26, .18, .44]]) {
        const plank = this.box(x, .04, z, length, .07, .15, '#957954', g); plank.rotation.y = angle;
      }
    } else if (p.type === 'crate') {
      this.box(0, .58, 0, 1.15, 1.16, 1.15, '#b39468', g);
      for (const side of [-1, 1]) { this.box(side * .5, 1.19, 0, .1, .06, 1.16, '#98784f', g); this.box(0, .58, side * .59, 1.15, .1, .035, '#957954', g); }
      const brace = this.box(0, 1.21, 0, 1.35, .04, .1, '#98784f', g); brace.rotation.y = Math.PI / 4;
    } else if (p.type === 'hay') {
      this.box(0, .38, 0, 1.5, .76, 1.15, '#c6aa65', g);
      for (const x of [-.43, .43]) this.box(x, .78, 0, .05, .03, 1.18, '#94764e', g);
    } else if (p.type === 'well') {
      this.cylinder(0, .4, 0, 1.05, .8, '#a79877', g, 10);
      this.cylinder(0, .81, 0, .8, .02, '#645e47', g, 10);
      for (const x of [-1, 1]) this.box(x, 1.2, 0, .15, 2.4, .15, '#846e51', g);
      this.box(0, 2.4, 0, 2.45, .16, 1.5, '#9e7d53', g); this.box(0, 1.7, 0, .05, 1.1, .05, '#6c5d47', g);
    } else if (p.type === 'tower') {
      for (const x of [-1.25, 1.25]) for (const z of [-1.25, 1.25]) this.box(x, 1.8, z, .22, 3.6, .22, '#8c7659', g);
      this.box(0, 3.6, 0, 3.4, .24, 3.4, '#8c7659', g);
      this.cylinder(0, 4.8, 0, 1.5, 2.25, '#8d9a89', g, 12);
      for (const y of [3.9, 5.6]) this.cylinder(0, y, 0, 1.53, .1, '#626f61', g, 12);
      this.mesh(new THREE.ConeGeometry(1.6, .45, 12), '#64766b', 0, 6.15, 0, g);
    } else if (p.type === 'cart') {
      this.box(0, .6, 0, 2.4, .2, 1.4, '#9d8059', g);
      for (const z of [-.72, .72]) {
        this.box(0, 1, z, 2.4, .6, .12, '#b1956c', g);
        for (const x of [-.7, .7]) { const wheel = this.cylinder(x, .44, z * 1.2, .44, .13, '#6e654f', g, 10); wheel.rotation.x = Math.PI / 2; }
      }
      for (const z of [-.45, .45]) this.box(1.8, .55, z, 1.7, .12, .12, '#9d8059', g);
    } else if (p.type === 'sign') {
      this.box(0, .7, 0, .2, 1.4, .2, '#756247', g);
      const board = new THREE.Group(); board.position.set(0, 1.33, .03); board.rotation.x = -.32; g.add(board);
      const arrow = new THREE.Shape(); const direction = p.direction || 1;
      arrow.moveTo(-1.18 * direction, -.27); arrow.lineTo(.82 * direction, -.27);
      arrow.lineTo(1.2 * direction, 0); arrow.lineTo(.82 * direction, .27); arrow.lineTo(-1.18 * direction, .27); arrow.closePath();
      const geometry = new THREE.ExtrudeGeometry(arrow, { depth: .12, bevelEnabled: false });
      this.mesh(geometry, '#a68a60', 0, 0, 0, board);
      this.box(-.08, -.18, .135, .045, .045, .02, '#5a5948', board);
      this.box(.08, .18, .135, .045, .045, .02, '#5a5948', board);
    } else if (p.type === 'deadwood') {
      const trunk = this.cylinder(0, .18, 0, .16, 1.1, '#84735a', g, 6, .12); trunk.rotation.z = Math.PI / 2;
      for (const side of [-1, 1]) {
        const branch = this.cylinder(side * .24, .3, side * .11, .065, .46, '#9e8867', g, 5, .03);
        branch.rotation.z = side * .8; branch.rotation.x = side * .6;
      }
    } else if (p.type === 'pot' || p.type === 'pottedPlant') {
      // Read from directly overhead, a pot is a ring with a dark hole in it.
      // The first version was a solid clay lump, which from this camera is
      // indistinguishable from a stone. The opening is what names the object,
      // so the silhouette is built outward from it: narrow foot, wide belly,
      // flared rim, and a recessed dark void in the middle. Still only the two
      // family colours, so it batches with the rest of the clutter.
      const clay = CLUTTER_CLAY, dark = CLUTTER_DARK;
      this.cylinder(0, .04, 0, .15, .08, clay, g, 8, .19);
      this.cylinder(0, .22, 0, .26, .3, clay, g, 8, .22);
      // Painted band round the belly: pottery, not a boulder.
      this.cylinder(0, .26, 0, .265, .05, dark, g, 8);
      // Flared rim, then the mouth sunk into it.
      this.cylinder(0, .42, 0, .23, .08, clay, g, 8, .28);
      this.cylinder(0, .45, 0, .2, .03, dark, g, 8);
      // Two lugs at the rim, which is what tells you it was made to be carried.
      for (const side of [-1, 1]) {
        const lug = this.box(side * .26, .4, 0, .09, .08, .14, clay, g);
        lug.rotation.z = side * .25;
      }
      if (p.type === 'pottedPlant') {
        // Dry soil heaped just under the rim, then a dead stem: the plant is
        // what fills the hole, so the pot still reads as a pot.
        this.cylinder(0, .44, 0, .19, .05, dark, g, 8, .17);
        const stem = this.box(0, .72, 0, .05, .56, .05, dark, g); stem.rotation.z = .12;
        for (let i = 0; i < 3; i++) {
          const a = i * 2.4;
          const twig = this.box(Math.cos(a) * .1, .82 + i * .14, Math.sin(a) * .1, .28, .032, .032, dark, g);
          twig.rotation.set(Math.sin(a) * .4, a, .55 + i * .16);
        }
      }
    } else if (p.type === 'brokenChair') {
      // Three legs and a cracked back, tipped onto whichever side lost its leg.
      const seat = CLUTTER_SEAT, dark = CLUTTER_DARK;
      const tipped = new THREE.Group(); tipped.rotation.z = .34; tipped.position.y = .04; g.add(tipped);
      this.box(0, .42, 0, .5, .06, .48, seat, tipped);
      for (const [x, z] of [[-.2, -.19], [.2, -.19], [.2, .19]])
        this.box(x, .21, z, .06, .42, .06, dark, tipped);
      // The stump of the fourth, snapped off short.
      this.box(-.2, .38, .19, .06, .14, .06, dark, tipped);
      for (const x of [-.2, .2]) this.box(x, .72, .21, .06, .54, .06, dark, tipped);
      for (const y of [.62, .86]) this.box(0, y, .21, .46, .07, .045, seat, tipped);
      // The broken leg, on the floor beside it.
      const leg = this.box(.34, .035, -.3, .42, .06, .06, dark, g);
      leg.rotation.set(0, .7, 0);
    } else if (p.type === 'cactus') this.makeCactus(0, 0, p.scale || 1, g);
    if (p.health !== null) { this.batch(g); this.propDetails.push(makePropDetails(this, p, g)); }
  }

  makePlayer() {
    const g = new THREE.Group();
    const body = new THREE.Group(); g.add(body); g.userData.body = body;
    for (const x of [-.15, .15]) this.box(x, .14, 0, .18, .27, .27, '#394a44', body).userData.deathPart='leg';
    this.cylinder(0, .57, 0, .29, .63, '#496e6b', body, 8, .24);
    this.cylinder(0, .96, 0, .2, .25, '#d6b58a', body, 8).userData.deathPart='head';
    this.cylinder(0, 1.06, 0, .39, .085, '#f0dbb2', body, 10).userData.deathPart='head';
    this.cylinder(0, 1.19, 0, .235, .23, '#dfc494', body, 8, .19).userData.deathPart='head';
    this.cylinder(0, 1.09, 0, .239, .075, '#6b5d48', body, 8).userData.deathPart='head';
    this.box(0, .84, .04, .44, .1, .4, '#b85d3e', body);
    const scarf = this.box(-.1, .7, .32, .16, .3, .06, '#b85d3e', body); scarf.rotation.x = -.3;
    g.userData.staticArm=this.box(.27, .69, -.2, .16, .16, .38, '#49716b', body);
    const gun = new THREE.Group(); gun.position.set(.27, .74, -.46); body.add(gun); g.userData.gun = gun;
    // Static: pale-blue receiver, exposed charge rails and a yellow muzzle collar.
    this.box(0, -.08, .12, .11, .2, .14, '#354e59', gun);
    this.box(0, 0, .025, .22, .19, .35, '#9bd9ee', gun);
    this.box(0, .11, .04, .15, .045, .25, '#c1edfa', gun);
    this.box(0, 0, -.19, .13, .13, .2, '#568697', gun);
    for (const side of [-1, 1]) {
      this.box(side*.119, .012, .03, .025, .08, .22, '#4d8499', gun);
      const rail = this.box(side*.137, .015, .03, .016, .027, .18, '#bff6ff', gun);
      rail.material = new THREE.MeshBasicMaterial({color:'#bff6ff',toneMapped:false});
    }
    const muzzle = this.cylinder(0, 0, -.267, .112, .115, '#f1ce54', gun, 8);
    muzzle.rotation.x = Math.PI/2;
    const bore = this.cylinder(0, 0, -.327, .056, .008, '#304d5a', gun, 8);
    bore.rotation.x = Math.PI/2;
    this.staticMuzzle = new THREE.Vector3();
    const arcGeometry = new THREE.BufferGeometry();
    arcGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3*7*2*3),3));
    const crackle = new THREE.LineSegments(arcGeometry,new THREE.LineBasicMaterial({color:'#c9f7ff',transparent:true,opacity:.9,depthWrite:false,toneMapped:false,blending:THREE.AdditiveBlending}));
    crackle.frustumCulled=false;gun.add(crackle);
    gun.userData.crackle=crackle;gun.userData.crackleTick=-1;
    const ring = new THREE.Mesh(new THREE.RingGeometry(.49, .515, 40), new THREE.MeshBasicMaterial({ color: '#4b7065', transparent: true, opacity: .35, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = .065; g.add(ring);
    const chevron = new THREE.Shape(); chevron.moveTo(0, 0); chevron.lineTo(-.11, .2); chevron.lineTo(.11, .2); chevron.closePath();
    const pointer = new THREE.Mesh(new THREE.ShapeGeometry(chevron), new THREE.MeshBasicMaterial({ color: '#f3e7c5', side: THREE.DoubleSide }));
    pointer.rotation.x = -Math.PI / 2; pointer.position.set(0, .08, -.95); g.add(pointer);
    return g;
  }

  updateStaticCrackle(time) {
    const gun=this.player.userData.gun,arc=gun.userData.crackle;
    const tick=Math.floor(time*14);
    if(tick===gun.userData.crackleTick)return;
    gun.userData.crackleTick=tick;
    const count=this.qualityName==='potato'?1:isDemanding(this.qualityName)?3:2;
    const positions=arc.geometry.attributes.position;
    let offset=0;
    for(let strand=0;strand<count;strand++){
      let x=0,y=0,z=0;
      for(let j=0;j<8;j++){
        const t=j/7,angle=strand*Math.PI*2/3+tick*.67+t*2.8;
        const radius=.13+Math.sin(t*Math.PI)*(.045+Math.random()*.045);
        const nx=Math.cos(angle)*radius,ny=Math.sin(angle)*radius,nz=.17-t*.48;
        if(j){positions.setXYZ(offset++,x,y,z);positions.setXYZ(offset++,nx,ny,nz);}
        x=nx;y=ny;z=nz;
      }
    }
    arc.geometry.setDrawRange(0,offset);positions.needsUpdate=true;
    arc.material.opacity=.65+Math.random()*.35;
  }

  makeTarget(moving, kind) {
    const g = new THREE.Group(); const board = new THREE.Group(); g.add(board); g.userData.board = board;
    if (kind === 'dummy') {
      this.box(0, .65, 0, .12, 1.3, .12, '#78634a', board);
      const torso = this.mesh(new THREE.CylinderGeometry(.24, .32, .64, 6), '#a79973', 0, 1.04, 0, board);
      torso.scale.z = .65;
      this.mesh(new THREE.IcosahedronGeometry(.23, 1), '#c4b18b', 0, 1.58, 0, board);
      for (const side of [-1, 1]) {
        const arm = this.box(side * .38, 1.2, 0, .4, .17, .19, '#a79973', board); arm.rotation.z = side * -.17;
      }
      for (const y of [.85, 1.17]) this.box(0, y, .175, .45, .035, .025, '#77694e', board);
      const disk = this.mesh(new THREE.SphereGeometry(.095, 7, 5), '#9a6350', 0, 1.1, .2, board); disk.scale.z = .2;
      g.userData.disk = disk;
      return g;
    }
    this.box(0, .47, 0, .13, .9, .13, '#907552', board);
    this.box(0, .1, 0, 1.1, .18, .65, '#a88d62', board);
    const face = new THREE.Group(); face.position.set(0, 1, 0); face.rotation.x = .6; board.add(face);
    const disk = this.cylinder(0, 0, 0, .6, .14, '#eee0bd', face, 20); g.userData.disk = disk;
    this.cylinder(0, .08, 0, .41, .016, moving ? '#6e8880' : '#b87552', face, 20);
    this.cylinder(0, .096, 0, .27, .018, '#ede0bc', face, 20);
    this.cylinder(0, .109, 0, .13, .02, '#ab5438', face, 16);
    return g;
  }

  // Floating health bars over targets were replaced by the outgoing damage
  // numbers. The builder is gone rather than left hidden: it was four meshes
  // and two materials per target that nothing could ever show.

  makeAmbient() {
    // Sized to the greediest preset rather than a hard-coded 140: Quality asks
    // for 190 and was silently drawing 140 of them while the update loop wrote
    // fifty elements past the end of the buffer.
    const rand = randomGenerator(132);
    const moteCap = Math.max(...Object.values(GRAPHICS).map(q => q.motes));
    const points = new Float32Array(moteCap * 3);
    for (let i = 0; i < moteCap; i++) { points[i * 3] = (rand() - .5) * 65; points[i * 3 + 1] = .3 + rand() * 4; points[i * 3 + 2] = (rand() - .5) * 60; }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(points, 3));
    this.motes = new THREE.Points(geo, new THREE.PointsMaterial({ color: '#fff1c6', size: .045, transparent: true, opacity: .6, depthWrite: false })); this.scene.add(this.motes);
    this.ambientClock = 3;
    // Broad overlapping wisps, baked once rather than a full-screen fog pass.
    const dustCanvas=document.createElement('canvas');dustCanvas.width=256;dustCanvas.height=128;
    const ctx=dustCanvas.getContext('2d');
    for(let i=0;i<18;i++){
      const x=35+rand()*186,y=35+rand()*58,r=18+rand()*30;
      const gradient=ctx.createRadialGradient(x,y,0,x,y,r);
      gradient.addColorStop(0,'rgba(216,194,149,.45)');gradient.addColorStop(.45,'rgba(216,194,149,.18)');gradient.addColorStop(1,'rgba(216,194,149,0)');
      ctx.fillStyle=gradient;ctx.fillRect(x-r,y-r,r*2,r*2);
    }
    const dustTexture=new THREE.CanvasTexture(dustCanvas);dustTexture.colorSpace=THREE.SRGBColorSpace;
    // Each of these covers a fifth to a quarter of the screen, and they
    // overlap: three of them is roughly two thirds of a full-screen blended
    // pass, which is what the comment above was trying to avoid. On a tiler
    // every blended layer is a read-modify-write of the tile with no early
    // depth rejection, so the phone tiers get fewer of them and the scene fog
    // carries the haze instead.
    this.dustWisps=Array.from({length:3},(_,i)=>{
      const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:dustTexture,transparent:true,opacity:0,depthWrite:false,depthTest:true}));
      sprite.scale.set(15+i*3,6+i,1);this.resetDustWisp(sprite,i);this.scene.add(sprite);return sprite;
    });
    for (const [x, z] of [[-4, -9], [20, 18], [-22, 12]]) this.spawnTumbleweed(x, z);
  }

  resetDustWisp(wisp, initial = -1) {
    const route=initial>=0?initial:Math.floor(Math.random()*4);
    const horizontal=route<2,direction=route===1?-1:1;
    const life=30+Math.random()*24;
    wisp.userData.drift={age:initial>=0?life*(.12+initial*.18):0,life,
      x:horizontal?-direction*1.1:(Math.random()-.5)*1.8,
      z:route===2?-1.05:(Math.random()-.5)*1.8,
      dx:horizontal?direction*(1.8+Math.random()*.6):(Math.random()-.5)*1.1,
      dz:route===2?1.8+Math.random()*.5:(Math.random()-.5)*.9,
      phase:Math.random()*Math.PI*2,height:1.8+Math.random()*1.6};
    wisp.material.rotation=(Math.random()-.5)*.25;
  }

  spawnTumbleweed(x, z) {
    const radius = .27 + Math.random() * .22;
    const geo = new THREE.IcosahedronGeometry(radius, 0), edges = new THREE.EdgesGeometry(geo); geo.dispose();
    const g = new THREE.Group();
    // Pale straw stays legible on both dark soil and the ochre street.
    g.add(new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: '#ead7a7', transparent: true, opacity: .78 })));
    g.position.set(x, radius, z); g.rotation.set(Math.random() * 3, Math.random() * 3, 0);
    g.userData = { radius, age: 0, life: 52 + Math.random() * 24, speed: .7 + Math.random() * .6, drift: -.2 + Math.random() * .4 };
    this.scene.add(g); this.tumbleweeds.push(g);
  }

  updateAmbient(sim, dt, elapsed) {
    const bare = this.qualityName === 'potato';
    for (const t of this.tumbleweeds) t.visible = !bare;
    if (bare) { for (const wisp of this.dustWisps) wisp.visible = false; return; }
    // How many of the big blended haze sprites this preset can afford. One is
    // enough to read as moving air; three is most of a full-screen blend.
    const wisps = this.qualityName === 'performance' ? 1 : this.qualityName === 'balanced' ? 2 : 3;
    for (let i = wisps; i < this.dustWisps.length; i++) this.dustWisps[i].visible = false;
    const halfHeight=Math.tan(this.camera.fov*Math.PI/360)*this.camera.position.distanceTo(this.focus);
    const halfWidth=halfHeight*this.camera.aspect;
    for(const [index,wisp] of this.dustWisps.entries()){
      if(index>=wisps)continue;
      let drift=wisp.userData.drift;drift.age+=dt;
      if(drift.age>=drift.life){this.resetDustWisp(wisp);drift=wisp.userData.drift;}
      const phase=drift.age/drift.life;
      wisp.position.set(this.focus.x+(drift.x+drift.dx*phase)*halfWidth,drift.height,
        this.focus.z+(drift.z+drift.dz*phase)*halfHeight*1.25+Math.sin(elapsed*.07+drift.phase)*.7);
      wisp.material.opacity=.27*Math.sin(phase*Math.PI)**2;
      wisp.visible=!sim.interior;
    }
    // Weather on its own clock: an occasional sheet of sand driven across the
    // open ground downwind, skipped indoors where there is no wind to carry it.
    this.gustClock = (this.gustClock ?? 5) - dt;
    if (this.gustClock <= 0) {
      this.gustClock = 6 + Math.random() * 7;
      if (!sim.interior) {
        const heading = .9 + (Math.random() - .5) * .7;
        const across = Math.random() * Math.PI * 2, reach = 9 + Math.random() * 11;
        this.dustTrail.gust(this.focus.x + Math.cos(across) * reach, this.focus.z + Math.sin(across) * reach,
          Math.cos(heading), Math.sin(heading), this.kickedDustColor(this.focus.x, this.focus.z));
      }
    }
    // Purely cosmetic overflights, hidden while a roof is between them and the
    // player. They take no part in the simulation.
    this.birds.update(dt, this.focus, this.birdView(), !!sim.interior);
    this.ambientClock -= dt;
    const cap = this.qualityName === 'performance' ? 4 : 7;
    if (this.ambientClock <= 0) {
      this.ambientClock = 4 + Math.random() * 5;
      if (this.tumbleweeds.length < cap) {
        const width = Math.tan(this.camera.fov * Math.PI / 360) * 35 * this.camera.aspect;
        const x = this.focus.x - width - 2, z = this.focus.z + (Math.random() - .5) * 25;
        if (!sim.colliders.some(b => inside({ x, z }, b, .6))) this.spawnTumbleweed(x, z);
      }
    }
    this.tumbleweeds = this.tumbleweeds.filter(t => {
      const a = t.userData; a.age += dt;
      const x = t.position.x + dt * a.speed, z = t.position.z + dt * a.drift;
      if (sim.colliders.some(b => inside({ x, z }, b, a.radius))) a.life = Math.min(a.life, a.age + 1);
      else { t.position.x = x; t.position.z = z; }
      t.position.y = a.radius + Math.abs(Math.sin(elapsed * 2.6 + t.position.z)) * .055;
      t.rotation.z -= dt * a.speed / a.radius; t.rotation.x += dt * a.drift;
      t.children[0].material.opacity = .78 * Math.min(1, a.age, Math.max(0, a.life - a.age));
      if (a.age < a.life) return true;
      t.removeFromParent(); t.children[0].geometry.dispose(); t.children[0].material.dispose(); return false;
    });
  }

  // Memoised per room and aspect: the fit is pure and both inputs change rarely.
  roomHeight(room) {
    if (this.roomFit?.room !== room || this.roomFit.aspect !== this.camera.aspect)
      this.roomFit = { room, aspect: this.camera.aspect, height: interiorCameraHeight(room, this.camera.aspect) };
    return this.roomFit.height;
  }

  // Compile every program the scene will need, including the blended variant
  // of each roof material, before gameplay starts.
  warmPrograms() {
    const compile = () => { try { this.renderer.compile(this.scene, this.camera); } catch { /* A warm-up failure is not a reason to refuse to start. */ } };
    compile();
    const roofMaterials = this.roofs.flatMap(r => r.materials);
    if (!roofMaterials.length) return;
    for (const m of roofMaterials) m.transparent = true;
    compile();
    for (const m of roofMaterials) m.transparent = false;
  }

  resize() {
    this.cachedRect = null;
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setPixelRatio(renderPixelRatio(this.quality,devicePixelRatio,w,h)*(this.resolutionScale||1));
    this.renderer.setSize(w, h); this.camera.aspect = w / h;
    this.camera.fov = w / h < 1.2 ? 49 : 40; this.camera.updateProjectionMatrix();
    const step = VISION_STEP[this.qualityName] || VISION_STEP.balanced;
    for (const overlay of [this.visionOverlay, this.cropOverlay]) {
      if (!overlay) continue;
      overlay.width = Math.max(2, Math.ceil(w / step));
      overlay.height = Math.max(2, Math.ceil(h / step));
    }
    // Resizing a canvas clears it, so whatever was painted is gone.
    this.visionMaskKey = null; this.cropMaskKey = null;
  }

  // What the birds need to size and pace a crossing: how far the view reaches
  // at their altitude, which depends on the live camera rather than a constant.
  // The map extent travels with the view so a crossing can be laid past the
  // world rather than past the screen: a player who walks after a bird sees it
  // leave, instead of watching it stop existing over open ground.
  birdView() { return { height: this.cameraHeight, fov: this.camera.fov, aspect: this.camera.aspect,
    extent: Math.hypot(this.map.width, this.map.depth) / 2 }; }

  setResolutionScale(scale){
    if(Math.abs((this.resolutionScale||1)-scale)<.001)return;
    this.resolutionScale=scale;this.resize();
  }

  // Cached because aim() runs once per simulation step, and the HUD writes
  // styles in the same frame: reading the rect there forced a synchronous
  // layout every step. Invalidated on resize and on scroll.
  canvasRect() {
    return this.cachedRect ||= this.canvas.getBoundingClientRect();
  }

  aim(clientX, clientY, player) {
    const rect = this.canvasRect();
    this.aimNDC ||= new THREE.Vector2();
    this.raycaster.setFromCamera(this.aimNDC.set((clientX - rect.left) / rect.width * 2 - 1, -(clientY - rect.top) / rect.height * 2 + 1), this.camera);
    if (this.raycaster.ray.intersectPlane(this.aimPlane, this.aimHit)) {
      this.cursorWorld.copy(this.aimHit);
      return { aimX: this.aimHit.x - player.x, aimZ: this.aimHit.z - player.z, aimPointX: this.aimHit.x, aimPointZ: this.aimHit.z };
    }
    return { aimX: player.aimX, aimZ: player.aimZ };
  }

  screenPoint(x, z, y = .72) {
    this.screenVector ||= new THREE.Vector3();
    const p = this.screenVector.set(x, y, z).project(this.camera);
    return { x: (p.x * .5 + .5) * innerWidth, y: (-p.y * .5 + .5) * innerHeight };
  }

  walkingDustColor(x, z) {
    for (const b of this.map.buildings) {
      const c = Math.cos(b.angle || 0), s = Math.sin(b.angle || 0);
      const lx = (x - b.x) * c - (z - b.z) * s, lz = (x - b.x) * s + (z - b.z) * c;
      if (Math.abs(lx) < b.w / 2 && Math.abs(lz) < b.d / 2) return new THREE.Color('#9b8161');
      if (Math.abs(lx) < (b.w + 1) / 2 && lz > b.d / 2 && lz < b.d / 2 + 2.75) return new THREE.Color('#b59971');
      for (const side of b.doors || []) {
        if ((side === 'back' && Math.abs(lx) < 1.55 && Math.abs(lz + b.d / 2 + .65) < .75) ||
          (side === 'left' && Math.abs(lx + b.w / 2 + .65) < .75 && Math.abs(lz) < 1.55) ||
          (side === 'right' && Math.abs(lx - b.w / 2 - .65) < .75 && Math.abs(lz) < 1.55)) return new THREE.Color('#b39a76');
      }
    }
    for (const bed of this.cropView.beds.values()) if (inside({ x, z }, bed.field)) {
      const f = bed.field, size = bed.canvas.width;
      const px = Math.min(size - 1, Math.max(0, Math.floor((x - f.x + f.w / 2) / f.w * size)));
      const py = Math.min(size - 1, Math.max(0, Math.floor((z - f.z + f.d / 2) / f.d * size)));
      // getImageData flushes the 2D canvas, and this is reached every frame of
      // a dash across the field. Cached per pixel, which is as fine-grained as
      // the bed's own canvas gets; cleared when the bed is redrawn.
      bed.sampled ||= new Map();
      const key = px * size + py;
      let hex = bed.sampled.get(key);
      if (hex === undefined) {
        const data = bed.canvas.getContext('2d').getImageData(px, py, 1, 1).data;
        hex = (data[0] << 16) | (data[1] << 8) | data[2];
        bed.sampled.set(key, hex);
      }
      return DUST_SAMPLE.setHex(hex);
    }
    const road = this.roadEdges(z);
    let onRoad = (x >= road.left && x <= road.right) || this.onSideRoad(x,z);
    if (this.map.farmBend) {
      const polygon = [[48,80],[75,81.2],[77,84],[49,83.2]]; let inLane = false;
      for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const [ax,az] = polygon[i], [bx,bz] = polygon[j];
        if ((az > z) !== (bz > z) && x < (bx - ax) * (z - az) / (bz - az) + ax) inLane = !inLane;
      }
      onRoad ||= inLane;
    }
    return new THREE.Color(onRoad ? this.map.palette.road : this.map.palette.ground);
  }

  kickedDustColor(x, z) { return kickedDust(this.walkingDustColor(x, z)); }

  // Tier multipliers for one-off effects, so the top two presets read richer
  // without changing what the low tiers were tuned to afford.
  get impactDetail() { return IMPACT_PARTICLES[this.qualityName] ?? 1; }

  // Smoke, as opposed to dust: slower, larger, lifting rather than settling,
  // and drifting the way the dash was going. Shares the particle pool and the
  // preset's cap, so Potato and Performance simply get fewer of them.
  smoke(x, z, dirX = 0, dirZ = 0, tint = null) {
    const count = Math.max(1, Math.round(9 * this.quality.effects));
    for (let i = 0; i < count && this.particles.length < this.quality.particleCap; i++) {
      const drift = .5 + Math.random() * 1.5, spread = (Math.random() - .5) * 1.6;
      const life = 1.1 + Math.random() * .8;
      this.particles.push({
        x: x + dirX * (Math.random() * 1.2) - dirZ * spread * .4,
        z: z + dirZ * (Math.random() * 1.2) + dirX * spread * .4,
        y: .2 + Math.random() * .4,
        vx: dirX * drift - dirZ * spread, vz: dirZ * drift + dirX * spread,
        vy: .55 + Math.random() * .7,
        life, maxLife: life, size: .2 + Math.random() * .26,
        // The white pool when tinted, so the instance colour is the colour.
        material: tint ? 7 : 0,
        tint: tint?.clone().multiplyScalar(.78 + Math.random() * .3),
        angle: Math.random() * 6.28, spin: (Math.random() - .5) * 1.4, stretch: 1,
      });
    }
  }

  burst(x, z, count, type = 'dust', tint = null) {
    count = Math.max(1, Math.round(count * this.quality.effects));
    for (let i = 0; i < count && this.particles.length < this.quality.particleCap; i++) {
      const angle = Math.random() * Math.PI * 2, speed = type === 'kill' ? 2 + Math.random() * 6 : type === 'hit' ? 1 + Math.random() * 4 : .4 + Math.random();
      const life = type === 'dust' ? .45 + Math.random() * .35 : .35 + Math.random() * .45;
      this.particles.push({ x, y: type === 'dust' ? .1 : .8, z, vx: Math.cos(angle) * speed, vz: Math.sin(angle) * speed, vy: type === 'dust' ? .5 : 1.4 + Math.random() * 3,
        life, maxLife: life, size: type === 'kill' ? .07 + Math.random() * .15 : .04 + Math.random() * .09, material: tint ? 7 : type === 'dust' ? 0 : type === 'kill' ? (i % 4) + 1 : i % 3,
        tint: tint?.clone().multiplyScalar(1.05 + Math.random() * .25), angle });
    }
  }

  event(e) {
    if(e.type==='playerDeath'){this.deathView??=new DeathView(this);this.deathView.start(e);return;}
    if(e.type==='grenadeExplosion'){this.explosion(e);return;}
    if(e.type==='shotgunShot'||e.type==='shotgunReload'){this.shotgunView?.event(e);return;}
    if(e.type==='rifleImpact'){this.burst(e.x,e.z,(RIFLE_QUALITY[this.qualityName]||RIFLE_QUALITY.balanced).impact,'hit');return;}
    if(e.type==='rifleShot'){this.rifleView?.shot(e);return;}
    if(e.electric&&['hit','kill','playerHit'].includes(e.type))this.electric.aftershock(e);
    if (e.type === 'cropDust' || e.type === 'cropAsh') {
      for (let i = 0; i < 12; i++) {
        const x = e.x + (Math.random() - .5) * e.w, z = e.z + (Math.random() - .5) * e.d;
        this.burst(x, z, e.type === 'cropDust' ? 6 : 2, 'dust');
        if (e.type === 'cropDust') this.burst(x, z, 3, 'kill');
      }
    }
    if (e.type === 'sprayArc') {
      const paths=e.paths.map(path=>({...path,a:this.staticMuzzle}));
      this.electric.event({...e,paths}, this.lastSim?.colliders || []);
      this.fxLight.color.set('#9cdfff'); this.fxLight.position.copy(this.staticMuzzle); this.fxLight.intensity = e.firing ? 12 : 3;
    }
    if (e.type.startsWith('hex')) { this.electric.event(e); if (e.type === 'hexPulse') { this.shake = Math.max(this.shake, .2); this.fxLight.color.set('#b8ecff'); this.fxLight.position.set(e.nodes[0].originX, 1.3, e.nodes[0].originZ); this.fxLight.intensity = 35; } }
    if (e.type === 'dodge') {
      this.burst(e.x, e.z, 12 * (FOOTFALL_PARTICLES[this.qualityName] ?? 1), 'dust', this.kickedDustColor(e.x, e.z));
      this.dustTrail.dashStart();
    }
    if (e.type === 'impactMark') this.surfaceMarks.enqueue('bullet',e);
    if (e.type === 'seed') this.burst(e.x, e.z, 2, 'hit');
    if (e.type === 'launch') {
      this.burst(e.x, e.z, 9, 'dust');
      // An orb still sitting at the gun leaves from the muzzle. The gun is
      // carried off to one side, so a trail drawn from the launch point comes
      // out of the player's chest; orbs parked out in the world keep theirs.
      const muzzle = this.staticMuzzle, atGun = path => Math.hypot(path.x - e.x, path.z - e.z) <= 1.15 && muzzle.lengthSq() > 0;
      for (const path of e.paths) this.addBeam(atGun(path) ? { ...path, x: muzzle.x, z: muzzle.z } : path, .016 + e.count * .0007);
      this.fxLight.color.set('#9bffe1'); this.fxLight.position.set(e.x, 1.2, e.z); this.fxLight.intensity = 8 + e.count * 1.5;
    }
    if (e.type === 'pointImpact') { this.burst(e.x, e.z, 6 * this.impactDetail, 'hit'); }
    if (e.type === 'explosion') this.electric.event({ type: 'convergence', x: e.x, z: e.z, radius: e.radius * .6 });
    if (e.type === 'propHit') this.burst(e.x, e.z, 6 * this.impactDetail, 'dust');
    if (e.type === 'propBreak') {
      const prop = this.props.get(e.id); if (prop) prop.visible = false;
      this.breakProp(e);
      // Small clutter is not heavy enough to raise dust and was never bedded in
      // the ground: a pot bursts into clay, not into a cloud. It gets a spray
      // in its own colour and nothing from the dust or smoke systems.
      if (!throwsDust(e.propType)) {
        const shard = CLUTTER_SHARDS.get(e.propType);
        this.burst(e.x, e.z, (e.dashed ? 14 : 9) * this.impactDetail, 'hit', shard);
        this.shake = Math.max(this.shake, e.dashed ? .03 : .012);
        return;
      }
      // Debris throws its own haze, so the break settles instead of vanishing —
      // and the haze is coloured by what broke, not only by the ground it stood
      // on: green pulp off a cactus, a dirty grey off a barrel.
      const dust = debrisDust(this.kickedDustColor(e.x, e.z), e.propType);
      this.burst(e.x, e.z, (e.dashed ? 16 : 7) * this.impactDetail, 'dust', dust);
      this.dustTrail.land(e.x, e.z, dust, e.directionX, e.directionZ);
      if (e.dashed) {
        // A body's worth of momentum drags the cloud through the wreck rather
        // than leaving it where the object stood: a short gust down the dash,
        // a second skid beyond it, and a heavier kick at the point of contact.
        this.dustTrail.gust(e.x, e.z, e.directionX, e.directionZ, dust, 3.4);
        this.dustTrail.land(e.x + e.directionX * 1.5, e.z + e.directionZ * 1.5, dust, e.directionX, e.directionZ);
        this.smoke(e.x, e.z, e.directionX, e.directionZ, dust);
        this.shake = Math.max(this.shake, .075);
      } else this.shake = Math.max(this.shake, .035);
    }
    if (e.type === 'explosion') this.explosion(e);
    if (e.type === 'trailEnd') {
      const beam = this.beams.get(e.id);
      if (beam) { beam.endX = e.x; beam.endZ = e.z; beam.finished = true; }
    }
    if (e.type === 'hit' || e.type === 'kill') {
      if (e.targetKind === 'dummy') {
        this.burst(e.x, e.z, e.type === 'kill' ? 30 : 5, 'dust');
        if (e.type === 'kill') this.breakProp({ ...e, propType: 'hay', scale: .65 });
        else this.burst(e.x, e.z, 4, 'hit');
      } else this.burst(e.x, e.z, e.type === 'kill' ? 34 : 9, e.type);
      if (e.type === 'kill') {
        this.shake = Math.max(this.shake, .1);
        // Shared geometry; each ring still needs its own material because they
        // fade on independent clocks.
        this.killRingGeo ||= new THREE.RingGeometry(.45, .49, 32);
        const m = new THREE.Mesh(this.killRingGeo, new THREE.MeshBasicMaterial({ color: '#fae8be', transparent: true, opacity: .9, side: THREE.DoubleSide, depthWrite: false }));
        m.rotation.x = -Math.PI / 2; m.position.set(e.x, .12, e.z); this.scene.add(m); this.rings.push({ mesh: m, age: 0 });
      }
    }
    if (e.type === 'wall') this.burst(e.x, e.z, (e.launched ? 5 : 2) * this.impactDetail, 'dust');
    if (e.type === 'respawn') this.burst(e.x, e.z, 8 * this.impactDetail, 'dust');
  }

  addBeam(path, width) {
    const core = new THREE.Mesh(this.beamGeo, new THREE.MeshBasicMaterial({ color: '#e4fff5', transparent: true, opacity: 1, depthWrite: false }));
    const halo = new THREE.Mesh(this.beamGeo, new THREE.MeshBasicMaterial({ color: '#8bd7ff', transparent: true, opacity: .25, depthWrite: false, blending: THREE.AdditiveBlending }));
    halo.visible = this.quality.glow;
    for (const m of [core, halo]) { m.position.set(path.x, .72, path.z); m.scale.set(width, .001, width); }
    this.scene.add(core, halo);
    const arcGeometry = new THREE.BufferGeometry(); arcGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(17 * 3), 3));
    const arc = new THREE.Line(arcGeometry, new THREE.LineBasicMaterial({ color: '#d1fff6', transparent: true, opacity: .8, depthWrite: false, toneMapped: false }));
    arc.frustumCulled = false; this.scene.add(arc);
    this.beams.set(path.id, { core, halo, arc, seed: path.id, startX: path.x, startZ: path.z, endX: path.x, endZ: path.z, width, age: 0, finished: false });
  }

  breakProp(e) {
    const plant = e.propType === 'cactus', barrel = e.propType === 'barrel';
    // Small floor clutter throws a handful of pieces, not a barrel's worth, and
    // they are shards rather than staves: shorter, squarer and lower.
    const clay = e.propType === 'pot' || e.propType === 'pottedPlant';
    const little = clay || e.propType === 'brokenChair';
    // Walked through rather than shot: more of it, thrown harder and kept in a
    // tighter fan along the dash, because the player's own body did it.
    const dashed = !!e.dashed, force = dashed ? 1.55 : 1, fan = dashed ? 1.1 : 1.7;
    const angle = Math.atan2(e.directionZ, e.directionX);
    const count = Math.round((plant ? 9 : little ? 7 : 14) * (dashed ? 1.7 : 1) * (isDemanding(this.qualityName) ? 2.5 : .5 + this.quality.effects * .5));
    for (let i = 0; i < count && this.particles.length < this.quality.particleCap; i++) {
      const direction = angle + (Math.random() - .5) * fan, speed = (1.7 + Math.random() * 3.2) * force * (little ? .8 : 1);
      const size = (little ? .06 + Math.random() * .06 : .12 + Math.random() * .11) * e.scale;
      const life = 1.8 + Math.random() * 1.1;
      this.particles.push({ x: e.x + (Math.random() - .5) * (little ? .3 : .65), z: e.z + (Math.random() - .5) * (little ? .3 : .5),
        y: (little ? .18 + Math.random() * .3 : .25 + Math.random() * (plant ? 1.8 : .9)) * e.scale,
        vx: Math.cos(direction) * speed, vz: Math.sin(direction) * speed, vy: (1.4 + Math.random() * 3) * (little ? .8 : 1),
        life, maxLife: life, size,
        // Clay is tinted off the white pool so the shards read as fired clay
        // rather than as pale timber.
        material: plant ? 4 : barrel && i % 4 === 0 ? 6 : e.propType === 'hay' ? 1 : clay ? 7 : 5,
        tint: clay ? CLAY_SHARD.clone().multiplyScalar(.82 + Math.random() * .34) : undefined,
        angle: Math.random() * 6.28, spin: (Math.random() - .5) * (little ? 18 : 12),
        stretch: plant ? 1.8 : little ? 1.3 : 2.8,
        debris: true, bounces: 0, sound: plant ? 'plant' : clay ? 'clay' : 'wood' });
    }
  }

  explosion(e) {
    this.surfaceMarks.enqueue('explosion',e);
    // One ring geometry for the lifetime of the view: it was rebuilt, uploaded
    // and thrown away on every explosion.
    this.blastRingGeo ||= new THREE.RingGeometry(.88, 1, 40);
    const ring = new THREE.Mesh(this.blastRingGeo, new THREE.MeshBasicMaterial({ color: '#ffe2a0', transparent: true, opacity: .9, side: THREE.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(e.x, .09, e.z); ring.scale.setScalar(.1); this.scene.add(ring);
    const core = new THREE.Mesh(this.smokeGeo, new THREE.MeshBasicMaterial({ color: '#fff3c3', transparent: true, opacity: 1, depthWrite: false, toneMapped: false }));
    core.position.set(e.x, .7, e.z); core.scale.setScalar(e.radius * .4); core.renderOrder = 1; this.scene.add(core);
    // Keep the readable fireball on every preset; quality adds extra rolling lobes.
    const smoke = [], count = Math.min(isDemanding(this.qualityName)?36:20,Math.max(4, Math.round(4 + e.count * .55 * this.quality.effects)));
    // Every puff in a blast fades on the same curve — only position and scale
    // differ — so the blast needs four materials, not two per puff. At 36 puffs
    // on Quality that was 72 fresh materials per explosion, each one a uniform
    // clone and a new program-cache key.
    const Smoke = isDemanding(this.qualityName) ? THREE.MeshStandardMaterial : THREE.MeshBasicMaterial;
    const smokeMaterials = ['#484640', '#81786b'].map(color => new Smoke({ color, transparent: true, opacity: .65, depthWrite: false }));
    const flameMaterials = ['#ffbd42', '#ff731b'].map(color => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1, depthWrite: false, toneMapped: false }));
    for (let i = 0; i < count; i++) {
      const lane = i % 2;
      const mesh = new THREE.Mesh(this.smokeGeo, smokeMaterials[lane]);
      const flame = new THREE.Mesh(this.smokeGeo, flameMaterials[lane]);
      const angle = i / count * Math.PI * 2 + Math.random() * .4;
      for (const puff of [mesh, flame]) {
        puff.position.set(e.x, .3, e.z); puff.scale.setScalar(.08);
        puff.rotation.set(Math.random() * 3, Math.random() * 6, Math.random() * 3); this.scene.add(puff);
      }
      smoke.push({ mesh, flame, dx: Math.cos(angle), dz: Math.sin(angle), size: .3 + Math.random() * .16 });
    }
    this.blasts.push({ x: e.x, z: e.z, radius: e.radius, ring, core, smoke, materials: [...smokeMaterials, ...flameMaterials], age: 0 });
    this.burst(e.x, e.z, isDemanding(this.qualityName) ? 25 + e.count * 7 : 5 + e.count * 2, 'hit');
    this.shake = Math.max(this.shake, Math.min(1.1,.15 + e.count * .045)); this.shakeDecay = 8;
    this.fxLight.color.set('#ff9e42'); this.fxLight.position.set(e.x, 1.5, e.z); this.fxLight.intensity = Math.min(120,15 + e.count * 4);
  }

  updateBlasts(dt) {
    this.blasts = this.blasts.filter(b => {
      b.age += dt;
      const progress = Math.min(1, b.age / .32);
      b.ring.scale.setScalar(b.radius * (1 - (1 - progress) ** 3));
      b.ring.material.opacity = .9 * (1 - progress);
      b.core.scale.setScalar(b.radius * (.4 + Math.min(1, b.age / .1) * .35));
      b.core.material.opacity = Math.max(0, 1 - b.age / .18); b.core.visible = b.age < .18;
      // Opacity is a property of the blast, not of each puff, so it is written
      // to the four shared materials once instead of once per puff per frame.
      const fire = Math.min(1, b.age / .09), fade = Math.max(0, 1 - Math.max(0, b.age - .14) / .32);
      const haze = .65 * Math.min(1, b.age / .12) * Math.max(0, 1 - b.age / 1.8);
      for (let i = 0; i < 2; i++) { b.materials[i].opacity = haze; b.materials[i + 2].opacity = fade; }
      for (const puff of b.smoke) {
        const spread = b.radius * (.16 + Math.min(b.age, 1) * .38);
        puff.mesh.position.set(b.x + puff.dx * spread + b.age * .23, .45 + b.age * .8, b.z + puff.dz * spread);
        puff.mesh.scale.setScalar(b.radius * puff.size * (.8 + b.age * .55));
        puff.flame.position.set(b.x + puff.dx * b.radius * fire * .4, .5 + b.age * 1.8, b.z + puff.dz * b.radius * fire * .4);
        puff.flame.scale.setScalar(b.radius * puff.size * (1 + fire * .65) * Math.sqrt(fade));
        puff.flame.visible = fade > 0;
      }
      if (b.age < 1.8) return true;
      this.disposeBlast(b); return false;
    });
  }

  disposeBlast(b) {
    // The ring geometry is shared and outlives the blast; the four puff
    // materials are the blast's own and are disposed once, not per puff.
    b.ring.removeFromParent(); b.ring.material.dispose();
    b.core.removeFromParent(); b.core.material.dispose();
    for (const p of b.smoke) for (const mesh of [p.mesh, p.flame]) mesh.removeFromParent();
    for (const m of b.materials) m.dispose();
  }

  updateBeams(sim, dt) {
    // Indexed once instead of a linear scan per beam: a twelve-orb volley made
    // this O(beams x shots), a hundred-odd comparisons a frame for nothing.
    const live = this.beams.size ? new Map(sim.shots.map(s => [s.id, s])) : null;
    for (const [id, b] of this.beams) {
      const shot = live.get(id);
      if (shot && !b.finished) { b.endX = shot.x; b.endZ = shot.z; }
      if (b.finished) b.age += dt;
      if (b.age > .62) {
        b.core.removeFromParent(); b.halo.removeFromParent(); b.core.material.dispose(); b.halo.material.dispose();
        b.arc.removeFromParent(); b.arc.geometry.dispose(); b.arc.material.dispose(); this.beams.delete(id); continue;
      }
      // Scratch vectors: one per beam per frame otherwise.
      const delta = BEAM_DELTA.set(b.endX - b.startX, 0, b.endZ - b.startZ), length = delta.length();
      const opacity = 1 - Math.max(0, b.age - .1) / .52;
      const arcPoints = b.arc.geometry.attributes.position;
      const px = length ? -delta.z / length : 0, pz = length ? delta.x / length : 0;
      for (let i = 0; i <= 16; i++) {
        const t = i / 16, envelope = Math.sin(t * Math.PI);
        const jitter = Math.sin(i * 37.1 + b.seed * 11 + Math.floor(this.effectTime * 24) * 7.3);
        const offset = jitter * envelope * Math.min(.12, length * .04);
        arcPoints.setXYZ(i, lerp(b.startX, b.endX, t) + px * offset, .74 + offset * .45, lerp(b.startZ, b.endZ, t) + pz * offset);
      }
      arcPoints.needsUpdate = true; b.arc.material.opacity = Math.max(0, opacity * .8); b.arc.visible = length > .05;
      for (const [mesh, scale] of [[b.core, 1], [b.halo, isDemanding(this.qualityName) ? 9 : 5]]) {
        mesh.position.set((b.startX + b.endX) / 2, .72, (b.startZ + b.endZ) / 2);
        if (length > .0001) mesh.quaternion.setFromUnitVectors(UP, BEAM_DIR.copy(delta).normalize());
        mesh.scale.set(b.width * scale, Math.max(.001, length), b.width * scale);
        mesh.material.opacity = Math.max(0, opacity * (scale === 1 ? .98 : .12));
      }
    }
  }

  update(sim, dt, active, elapsed, previousPlayer = sim.player, alpha = 1) {
    this.lastSim = sim;
    this.effectTime = elapsed;
    const p = sim.player, speed = Math.hypot(p.vx, p.vz);
    const renderX = lerp(previousPlayer.x, p.x, alpha), renderZ = lerp(previousPlayer.z, p.z, alpha);
    this.player.position.set(renderX, 0, renderZ);
    this.updateFootprints(sim, dt, active, renderX, renderZ);
    this.player.rotation.y = Math.atan2(-p.aimX, -p.aimZ);
    const body = this.player.userData.body;
    const dodge = p.dodgeRemaining > 0 ? Math.sin(Math.PI * (1 - p.dodgeRemaining / RULES.dodgeDuration)) : 0;
    body.rotation.x = sim.spray.active ? -.12 : 0;
    body.scale.set(1 + dodge * .12, 1 - dodge * .3, 1 + dodge * .12);
    body.position.y = Math.sin(sim.time * 17) * .022 * speed / 7;
    body.rotation.z = Math.sin(sim.time * 8.5) * .018 * speed / 7;
    this.player.userData.gun.rotation.x = lerp(this.player.userData.gun.rotation.x, sim.spray.active ? .5 : 0, 1 - Math.exp(-18 * dt));
    if(!this.rifleView)this.rifleView=new RifleView(this);
    this.rifleView.update(sim,dt);
    if(!this.shotgunView)this.shotgunView=new ShotgunView(this);
    this.shotgunView.update(sim,dt);
    if(!this.grenadeView)this.grenadeView=new GrenadeView(this);
    this.grenadeView.update(sim);
    this.deathView?.update(dt);
    if(sim.weapon==='static')this.updateStaticCrackle(elapsed);
    // Shared live endpoint keeps short-lived stream arcs attached during recoil and aiming.
    this.staticMuzzle.set(0,0,-.333);
    this.player.userData.gun.localToWorld(this.staticMuzzle);
    const cameraRate = this.motion ? 5.7 : 16;
    const cameraRoom = sim.interior, blend = 1 - Math.exp(-cameraRate * dt);
    const deathCamera=this.deathView?.active?this.deathView.cameraFrame():null;
    this.focus.x = deathCamera?deathCamera.x:lerp(this.focus.x, cameraRoom && !cameraRoom.followCamera ? cameraRoom.x : renderX, blend);
    this.focus.z = deathCamera?deathCamera.z:lerp(this.focus.z, cameraRoom && !cameraRoom.followCamera ? cameraRoom.z : renderZ, blend);
    this.cameraHeight = deathCamera?deathCamera.height:lerp(this.cameraHeight, cameraRoom ? this.roomHeight(cameraRoom) : OUTDOOR_CAMERA_HEIGHT, 1 - Math.exp(-5.7 * dt));
    this.kick.multiplyScalar(Math.exp(-15 * dt)); this.shake *= Math.exp(-this.shakeDecay * dt);
    const pressureShake=this.shotgunView?.pressure.shake||0;
    const shakeX = this.motion ? Math.sin(elapsed * 91) * (this.shake+pressureShake) * .65 : 0;
    const shakeZ = this.motion ? Math.cos(elapsed * 77) * (this.shake+pressureShake) * .5 : 0;
    const fx = this.focus.x + shakeX + (this.motion && !cameraRoom ? this.kick.x : 0), fz = this.focus.z + shakeZ + (this.motion && !cameraRoom ? this.kick.z : 0);
    this.shadowClock=(this.shadowClock||0)+dt;
    if(!this.quality.shadowFPS||this.sun.shadow.needsUpdate||this.shadowClock>=1/this.quality.shadowFPS){
      this.sun.position.set(fx - 24, 40, fz - 18); this.sun.target.position.set(fx, 0, fz);
      this.sun.shadow.needsUpdate=true;
      this.shadowClock=this.quality.shadowFPS?this.shadowClock%(1/this.quality.shadowFPS):0;
    }
    this.camera.position.set(fx, this.cameraHeight, fz + this.cameraHeight * CAMERA_TILT); this.camera.lookAt(fx, 0, fz); this.camera.updateMatrixWorld();
    for (const roof of this.roofs) {
      const desired = sim.roofId === roof.id ? .095 : 1;
      roof.opacity = lerp(roof.opacity, desired, 1 - Math.exp(-8 * dt));
      // Leaving these permanently transparent meant the largest, topmost
      // surface in a top-down frame was blended at alpha 1 and drawn after all
      // opaque geometry — so every floor, wall and counter under a visible roof
      // was fully shaded and then painted over, with no chance of being
      // occluded. Opaque whenever it is actually opaque.
      const blended = roof.opacity < .995;
      for (const m of roof.materials) { m.opacity = roof.opacity; m.depthWrite = roof.opacity > .98; m.transparent = blended; }
      const castsShadow=roof.opacity>.5;
      if(roof.castsShadow!==castsShadow){
        for(const m of roof.casters)m.castShadow=castsShadow;
        roof.castsShadow=castsShadow;
      }
    }
    for (const t of sim.targets) {
      const g = this.targets.get(t.id); g.position.set(t.x, 0, t.z);
      // Portal shaders clip body, health bar and shadows indoors. Outdoors,
      // normal camera depth handles cover; ground-level sight rays must not hide
      // an entity that is exposed in the overhead view.
      // Never toggle the entire entity because its center crosses one sightline.
      g.visible = cropEntityVisible(sim.crops, sim.player, t);
      g.userData.board.visible = t.hp > 0;
      if (t.hp <= 0 && g.userData.marks) this.surfaceMarks.clearFor(g.userData.marks);
      g.userData.board.rotation.z = t.flash > 0 ? Math.sin(t.flash * 65) * .13 : 0;
      g.userData.board.scale.setScalar(t.flash > 0 ? 1 + t.flash * .3 : 1);
    }
    for (const prop of sim.props) {
      const g = this.props.get(prop.id); if (!g) continue;
      g.visible = prop.hp > 0; g.rotation.z = prop.flash > 0 ? Math.sin(prop.flash * 65) * .025 : 0;
    }
    const present = new Set();
    for (const s of [...sim.shots, ...sim.hexOrbs]) {
      present.add(s.id); let g = this.shots.get(s.id);
      if (!g) {
        g = new THREE.Group();
        const orb = new THREE.Mesh(this.shotGeo, this.seedMaterial); g.add(orb);
        const aura = new THREE.Mesh(this.shotGeo, new THREE.MeshBasicMaterial({color:'#91d9ff',transparent:true,opacity:.12,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false})); aura.scale.setScalar(1.7); g.add(aura);
        const trail = new THREE.Mesh(this.trailGeo, this.trailMaterial); g.add(trail);
        const electricGeometry = new THREE.BufferGeometry(); electricGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(5 * 6 * 2 * 3), 3));
        const electricity = new THREE.LineSegments(electricGeometry, this.orbElectricMaterial); g.add(electricity);
        g.userData = { orb, trail, electricity, aura }; this.shots.set(s.id, g); this.scene.add(g);
      }
      // Match player interpolation without changing collision simulation authority.
      const behind = Math.min(s.age, (1 - alpha) / 60);
      g.position.set(s.x - s.vx * behind, .72 + (s.launched ? 0 : Math.sin(elapsed * 4 + s.id) * .055), s.z - s.vz * behind);
      g.rotation.y = Math.atan2(s.vx, s.vz); g.scale.setScalar(s.hex ? 2 : 1);
      if(s.hex){
        const t=Math.min(1,s.age/.18),arrival=1-(1-t)**3;
        g.position.x=lerp(s.muzzleX??s.originX,g.position.x,arrival);
        g.position.z=lerp(s.muzzleZ??s.originZ,g.position.z,arrival);
        g.position.y+=Math.sin(t*Math.PI)*.18;
        g.scale.setScalar(.3+1.7*arrival);
      }
      else if(!s.launched){
        const forming=Math.min(1,s.age/.2);
        const growth=1-(1-forming)**3;
        g.scale.setScalar(.08+.92*growth+Math.sin(forming*Math.PI)*.13);
      }
      g.visible = true; // The existing fragment mask clips even partially visible orbs.
      g.userData.aura.visible = s.hex || (!s.launched&&s.age<.23) || isDemanding(this.qualityName);
      g.userData.aura.material.opacity = s.hex ? .3+Math.sin(elapsed*45+s.id)*.12 : .09 + Math.sin(elapsed * 16 + s.id) * .035+(!s.launched?Math.max(0,1-s.age/.23)*.4:0);
      if(s.hex)g.userData.aura.scale.setScalar(2.2+Math.sin(elapsed*34+s.id)*.35);
      g.userData.orb.material = s.launched ? this.shotMaterial : this.seedMaterial;
      const lifeScale = !sim.dev.orbs && !s.launched && s.age > 7.5 ? Math.max(.2, (9 - s.age) / 1.5) : 1;
      g.userData.orb.scale.setScalar((1 + Math.sin(elapsed * 5 + s.id) * .06) * lifeScale);
      g.userData.trail.visible = !!s.launched;
      g.userData.trail.scale.set(1, 1, Math.min(1.4, s.age * 31));
      g.userData.trail.position.z = -Math.min(.7, s.age * 15.5);
      const electricity = g.userData.electricity, points = electricity.geometry.attributes.position;
      const arcs = this.qualityName === 'performance' || this.qualityName === 'potato' ? 1 : isDemanding(this.qualityName) ? 5 : 3;
      const electricTick=Math.floor(elapsed*18);
      if(g.userData.electricTick!==electricTick||g.userData.arcCount!==arcs){
      g.userData.electricTick=electricTick;g.userData.arcCount=arcs;
      let vertex = 0;
      for (let arc = 0; arc < arcs; arc++) for (let j = 0; j < 6; j++) for (const k of [j, j + 1]) {
        const tick = Math.floor(elapsed * 18), phase = s.id * 2.7 + arc * 2.1 + tick * .7;
        const angle = phase + k * .27, radius = .18 + Math.sin(k * 19 + tick + s.id) * .024;
        points.setXYZ(vertex++, Math.cos(angle) * radius, Math.sin(angle) * radius * Math.cos(arc + .5), Math.sin(angle) * radius * Math.sin(arc + .5));
      }
      electricity.geometry.setDrawRange(0, vertex); points.needsUpdate = true;
      }
      electricity.scale.setScalar(s.launched ? 1.3 : lifeScale);
    }
    for (const [id, g] of this.shots) if (!present.has(id)) { this.scene.remove(g); g.userData.electricity.geometry.dispose(); g.userData.aura.material.dispose(); this.shots.delete(id); }
    this.updateBeams(sim, dt); this.fxLight.intensity *= Math.exp(-12 * dt);
    const dashing = p.dodgeRemaining > 0;
    if (active && speed > 1) {
      this.stepClock += dt;
      if (this.stepClock > .085) {
        const heading = speed > 1e-6 ? [p.vx / speed, p.vz / speed] : [0, 0];
        this.burst(p.x, p.z, 2 * (FOOTFALL_PARTICLES[this.qualityName] ?? 1), 'dust', this.kickedDustColor(p.x, p.z));
        // The haze marks the ground just left behind, not the foot in the air.
        if (!dashing) this.dustTrail.step(renderX, renderZ, this.kickedDustColor(p.x, p.z), heading[0], heading[1]);
        this.stepClock = 0;
      }
    }
    // Sampled every frame of the dodge, so the streak follows the path actually
    // taken and ends where the player ended, wall slide included.
    if (active && dashing) this.dustTrail.dash(renderX, renderZ, this.kickedDustColor(p.x, p.z), dt, p.dodgeX, p.dodgeZ);
    if (active && this.wasDashing && !dashing) this.dustTrail.land(renderX, renderZ, this.kickedDustColor(p.x, p.z), p.dodgeX, p.dodgeZ);
    this.wasDashing = dashing;
    this.dustTrail.update(dt);
    this.cropView.update(sim, dt);
    this.updateParticles(dt); this.updateBlasts(dt);this.electric.updateAftershocks(dt,sim); this.electric.drift(sim.seeds,sim.player,sim.colliders,dt); this.electric.charge(sim.hexOrbs,dt,sim.player); this.electric.syncSpin(sim.hexSpin,sim.player,dt); this.electric.update(dt); this.electric.boundary(sim.hexOrbs);
    for (const ring of this.rings) {
      ring.age += dt; ring.mesh.scale.setScalar(1 + ring.age * 8); ring.mesh.material.opacity = Math.max(0, 1 - ring.age * 2.5);
    }
    // The geometry is shared across rings now, so only the material goes.
    this.rings = this.rings.filter(r => { if (r.age < .4) return true; r.mesh.removeFromParent(); r.mesh.material.dispose(); return false; });
    const positions = this.motes.geometry.attributes.position.array;
    const drawn = Math.min(this.quality.motes * 3, positions.length);
    for (let i = 0; i < drawn; i += 3) { positions[i] += dt * .42; positions[i + 2] += dt * .12; if (positions[i] > 38) positions[i] = -38; }
    if(this.quality.motes)this.motes.geometry.attributes.position.needsUpdate = true;
    this.updateAmbient(sim, dt, elapsed);
    if(active)this.surfaceMarks.flush(2);
    this.render();
  }

  captureMapThumbnail() {
    const width=460,height=570,target=new THREE.WebGLRenderTarget(width,height);
    target.texture.colorSpace=THREE.SRGBColorSpace;
    const camera=new THREE.PerspectiveCamera(40,width/height,.1,180);
    const spawn=this.map.spawn;
    camera.position.set(spawn.x,OUTDOOR_CAMERA_HEIGHT,spawn.z+OUTDOOR_CAMERA_HEIGHT*CAMERA_TILT);
    camera.lookAt(spawn.x,0,spawn.z);
    const previous=this.renderer.getRenderTarget();
    const hidden=[this.player,this.motes,...this.targets.values(),...this.tumbleweeds].map(o=>[o,o.visible]);
    try {
      hidden.forEach(([o])=>o.visible=false);
      this.sun.shadow.needsUpdate=true;
      this.renderer.setRenderTarget(target);this.renderer.render(this.scene,camera);
      const pixels=new Uint8Array(width*height*4);this.renderer.readRenderTargetPixels(target,0,0,width,height,pixels);
      const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
      const ctx=canvas.getContext('2d'),image=ctx.createImageData(width,height);
      for(let y=0;y<height;y++)image.data.set(pixels.subarray((height-1-y)*width*4,(height-y)*width*4),y*width*4);
      ctx.putImageData(image,0,0);return canvas.toDataURL('image/jpeg',.9);
    } finally {
      hidden.forEach(([o,visible])=>o.visible=visible);this.sun.shadow.needsUpdate=true;
      this.renderer.setRenderTarget(previous);target.dispose();
    }
  }

  render() {
    if (this.lastSim) {
      this.updateVision(this.lastSim); this.interiorVisibility.update(this.lastSim);
      const apply = root => this.interiorVisibility.apply(root);
      // Static buildings/terrain are intentionally excluded and remain visible through gray fog.
      for (const g of this.shots.values()) apply(g);
      for (const b of this.beams.values()) { apply(b.core); apply(b.halo); apply(b.arc); }
      for (const e of this.electric.effects) for (const g of [e.mesh,e.forks,e.glow,e.ribbon,e.core,...(e.rings || [])]) apply(g);
      this.particlePool.forEach(apply); this.rings.forEach(r => apply(r.mesh));
      for (const b of this.blasts) { apply(b.core); apply(b.ring); for (const p of b.smoke) { apply(p.mesh); apply(p.flame); } }
      this.fxLight.visible = this.quality.light && this.lastSim.canAimAt(this.fxLight.position.x, this.fxLight.position.z);
    }
    this.renderer.render(this.scene, this.camera);
  }

  updateVision(sim) { this.updateCropVision(sim); this.updateInteriorVision(sim); }

  updateCropVision(sim) {
    const immersion=cropImmersion(sim.crops,sim.player,RULES.radius),crop=immersion?.crop;
    const cropDisplay = crop ? 'block' : 'none';
    // Writing an unchanged display value still invalidates style on every frame.
    if (this.cropDisplay !== cropDisplay) { this.cropDisplay = cropDisplay; this.cropOverlay.style.display = cropDisplay; }
    if (!crop) { this.cropMaskKey = null; return; }
    const c = this.screenPoint(sim.player.x, sim.player.z, .7);
    const edge = this.screenPoint(sim.player.x + crop.visibility, sim.player.z, .7);
    const radius = Math.abs(edge.x - c.x);
    this.cropOverlay.style.opacity = immersion.entryOpacity;
    // The gradient tracks the player every frame, which is cheap; the field
    // silhouette behind it is soft and slow, so it is rate-capped per tier.
    const quantise = (value, step) => Math.round(value / step);
    const maskKey = [quantise(c.x, 2), quantise(c.y, 2), quantise(radius, 2), quantise(immersion.outerOpacity, .02),
      immersion.sections.length, innerWidth, innerHeight].join(',');
    if (this.cropMaskKey === maskKey) return;
    if (this.cropMaskClock > this.effectTime && this.cropMaskKey) return;
    this.cropMaskClock = this.effectTime + (VISION_REPAINT[this.qualityName] || VISION_REPAINT.balanced);
    this.cropMaskKey = maskKey;
    const sections = immersion.outerOpacity >= 1 ? [] : immersion.sections.map(section => projectVisionPolygon(
      [{x:section.x-section.w/2,z:section.z-section.d/2},{x:section.x+section.w/2,z:section.z-section.d/2},
       {x:section.x+section.w/2,z:section.z+section.d/2},{x:section.x-section.w/2,z:section.z+section.d/2}],
      this.camera, innerWidth, innerHeight));
    this.paintCrop(sections, c, radius, immersion.outerOpacity, Math.max(28, radius * .32));
  }

  // Standing in a crop, the world is visible close by and swallowed further out,
  // and only inside the field at all. Both of those are alpha, so they are one
  // paint: lay the mask down, then keep it only where the falloff says to.
  paintCrop(polygons, center, radius, outerOpacity, feather) {
    const context = this.cropContext;
    if (!context) return;
    const { width, height } = this.cropOverlay;
    const scaleX = width / innerWidth, scaleY = height / innerHeight;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.globalCompositeOperation = 'source-over';
    context.filter = 'none';
    context.clearRect(0, 0, width, height);
    context.fillStyle = `rgba(0,0,0,${Math.min(1, Math.max(0, outerOpacity))})`;
    context.fillRect(0, 0, width, height);
    if (polygons.length) {
      // The old pass eroded before blurring so the soft edge did not spill past
      // the field. At this resolution the blur is a couple of pixels wide and
      // the upscale carries the rest, so the erode is not worth a second pass.
      context.filter = `blur(${Math.max(1, feather * scaleX * .5).toFixed(1)}px)`;
      context.fillStyle = '#000';
      for (const points of polygons) {
        if (points.length < 3) continue;
        context.beginPath();
        context.moveTo(points[0].x * scaleX, points[0].y * scaleY);
        for (let i = 1; i < points.length; i++) context.lineTo(points[i].x * scaleX, points[i].y * scaleY);
        context.closePath();
        context.fill();
      }
      context.filter = 'none';
    }
    // Everything painted so far is the mask. The falloff now decides how much of
    // it survives, centred on the player and slightly wider than it is tall.
    context.globalCompositeOperation = 'destination-in';
    const x = center.x * scaleX, y = center.y * scaleY, r = Math.max(1, radius * scaleX);
    context.save();
    context.translate(x, y); context.scale(1.25, 1.14);
    const falloff = context.createRadialGradient(0, 0, 0, 0, 0, r);
    falloff.addColorStop(.18, 'rgba(0,0,0,0)'); falloff.addColorStop(.32, 'rgba(0,0,0,.12)');
    falloff.addColorStop(.5, 'rgba(0,0,0,.42)'); falloff.addColorStop(.7, 'rgba(0,0,0,.76)');
    falloff.addColorStop(.88, 'rgba(0,0,0,.95)'); falloff.addColorStop(1, '#000');
    context.fillStyle = falloff;
    context.fillRect(-width * 2, -height * 2, width * 4, height * 4);
    context.restore();
    context.globalCompositeOperation = 'source-over';
  }

  updateInteriorVision(sim) {
    const room = sim.interior;
    const visionDisplay = room ? 'block' : 'none';
    // Gated the same way the crop overlay beside it is: writing an unchanged
    // display value still invalidates style on every frame.
    if (this.visionDisplay !== visionDisplay) {
      this.visionDisplay = visionDisplay;
      this.visionOverlay.style.display = visionDisplay;
    }
    if (!room) { this.visionMaskClock = 0; this.visionMaskKey = null; return; }
    // Quantised so sub-pixel camera drift is not movement, and rate-capped --
    // far more loosely than the SVG version needed, because a repaint at a
    // twelfth of the viewport costs a fraction of what two filter passes did.
    const quantise = (value, step) => Math.round(value / step);
    const maskKey = [room.id, quantise(sim.player.x, .05), quantise(sim.player.z, .05), innerWidth, innerHeight,
      ...this.camera.matrixWorld.elements.map(e => quantise(e, .01)),
      ...this.camera.projectionMatrix.elements.map(e => quantise(e, .01))].join(',');
    if (this.visionMaskKey === maskKey) return;
    if (this.visionMaskClock > this.effectTime && this.visionMaskKey) return;
    this.visionMaskClock = this.effectTime + (VISION_REPAINT[this.qualityName] || VISION_REPAINT.balanced);
    this.visionMaskKey = maskKey;
    this.paintVision(interiorPolygons(room, sim.player)
      .map(points => projectVisionPolygon(points, this.camera, innerWidth, innerHeight)));
  }

  // Paints the shroud: a flat wash over the viewport with the clear regions
  // punched out of it. Everything is in the low-resolution buffer's own pixels,
  // so the cost is fixed by the tier rather than by the device's screen.
  paintVision(polygons) {
    const context = this.visionContext;
    if (!context) return;
    const { width, height } = this.visionOverlay;
    const scaleX = width / innerWidth, scaleY = height / innerHeight;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.globalCompositeOperation = 'source-over';
    context.clearRect(0, 0, width, height);
    context.fillStyle = VISION_SHROUD[this.qualityName] || VISION_SHROUD.balanced;
    context.fillRect(0, 0, width, height);
    context.globalCompositeOperation = 'destination-out';
    context.fillStyle = '#000';
    for (const points of polygons) {
      if (points.length < 3) continue;
      context.beginPath();
      context.moveTo(points[0].x * scaleX, points[0].y * scaleY);
      for (let i = 1; i < points.length; i++) context.lineTo(points[i].x * scaleX, points[i].y * scaleY);
      context.closePath();
      context.fill();
    }
    context.globalCompositeOperation = 'source-over';
  }

  updateFootprints(sim, dt, active, x, z) {
    const distance = Math.hypot(x - this.lastFootPosition.x, z - this.lastFootPosition.z);
    this.lastFootPosition = { x, z };
    for (const foot of this.footprints) foot.age += dt;
    this.footprints = this.footprints.filter(foot => foot.age < 3);
    if (active && !sim.roofId && distance < 1 && Math.hypot(sim.player.vx, sim.player.vz) > .6) {
      this.footDistance += distance;
      if (this.footDistance >= .55) {
        this.footDistance %= .55; this.footSide *= -1;
        const angle = Math.atan2(sim.player.vx, sim.player.vz), offset = .15 * this.footSide;
        this.footprints.push({ x: x + Math.cos(angle) * offset, z: z - Math.sin(angle) * offset, angle, age: 0 });
        if (this.footprints.length > 160) this.footprints.shift();
      }
    }
    const fade = this.footMesh.geometry.attributes.fade;
    for (const [i, foot] of this.footprints.entries()) {
      this.dummy.position.set(foot.x, .041, foot.z); this.dummy.rotation.set(0, foot.angle, 0);
      this.dummy.scale.set(.095, 1, .18); this.dummy.updateMatrix();
      this.footMesh.setMatrixAt(i, this.dummy.matrix); fade.setX(i, Math.max(0, 1 - foot.age / 3));
    }
    this.footMesh.count = this.footprints.length; this.footMesh.instanceMatrix.needsUpdate = true; fade.needsUpdate = true;
  }

  updateParticles(dt) {
    this.particles = this.particles.filter(p => p.life > 0);
    const counts = this.particleMaterials.map(() => 0);
    for (const p of this.particles) {
      p.life -= dt; p.x += p.vx * dt; p.z += p.vz * dt; p.y += p.vy * dt; p.vy -= dt * (p.debris ? 9 : 5);
      const floor = p.debris ? p.size * .45 : .025;
      if (p.y <= floor) {
        p.y = floor;
        if (p.debris && p.vy < -1 && p.bounces < 3) {
          p.vy *= -.32; p.vx *= .7; p.vz *= .7; p.spin *= .6; p.bounces++;
          this.onClatter?.(p.sound);
        } else { p.vy = 0; if (p.debris) p.spin *= Math.exp(-dt * 18); }
      }
      const drag = p.debris ? p.y <= floor ? 6 : .35 : 2;
      p.vx *= Math.exp(-dt * drag); p.vz *= Math.exp(-dt * drag);
      if (p.debris) p.angle += p.spin * dt;
      const index = counts[p.material]++; if (index >= 240) continue;
      this.dummy.position.set(p.x, p.y, p.z); this.dummy.rotation.set(p.angle + p.life * 2, p.angle, p.life);
      const scale = p.size * Math.max(0, p.debris ? Math.min(1, p.life / .6) : p.life / p.maxLife);
      this.dummy.scale.set(scale * (p.stretch || 1), scale * (p.debris ? .55 : 1), scale); this.dummy.updateMatrix();
      this.particlePool[p.material].setMatrixAt(index, this.dummy.matrix);
      this.particlePool[p.material].setColorAt(index, p.tint || WHITE);
    }
    this.particlePool.forEach((mesh, i) => { mesh.count = Math.min(counts[i], 240); if(mesh.count){mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;} });
  }

  reset(sim) {
    this.deathView?.clear();
    this.rifleView?.clear();this.shotgunView?.clear();
    this.grenadeView?.clear();
    for(const g of this.targets.values()){g.userData.coverHiddenTime=0;g.visible=true;}
    this.cameraHeight = OUTDOOR_CAMERA_HEIGHT;
    this.cropView.reset();
    this.electric.clear(); this.surfaceMarks.clear(); this.dustTrail.clear(); this.birds.clear();
    this.footprints.length = 0; this.footMesh.count = 0; this.footDistance = 0; this.lastFootPosition = { ...sim.player };
    this.focus.set(sim.player.x, 0, sim.player.z); this.kick.set(0, 0, 0); this.shake = 0; this.particles.length = 0;
    for (const g of this.shots.values()) { this.scene.remove(g); g.userData.electricity.geometry.dispose(); g.userData.aura.material.dispose(); } this.shots.clear();
    for (const r of this.rings) { r.mesh.removeFromParent(); r.mesh.geometry.dispose(); r.mesh.material.dispose(); } this.rings.length = 0;
    for (const b of this.beams.values()) { b.core.removeFromParent(); b.halo.removeFromParent(); b.core.material.dispose(); b.halo.material.dispose(); b.arc.removeFromParent(); b.arc.geometry.dispose(); b.arc.material.dispose(); } this.beams.clear();
    this.fxLight.intensity = 0;
    for (const b of this.blasts) this.disposeBlast(b); this.blasts.length = 0;
  }
}




