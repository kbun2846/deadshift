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
import { GRAPHICS } from './settings.js';
import { ElectricEffects } from './electric-effects.js';
import { makeCrops, makeLandmark, makeCobweb, makeQualityDetails, makePropDetails } from './world-details.js';
import { SurfaceMarks } from './surface-marks.js';
import { CropView } from './crop-view.js';
import { cropAt, cropEntityVisible, cropImmersion } from './crops.js';
import { InteriorVisibility } from './interior-visibility.js';
import { makeDetailedInterior } from './detailed-interiors.js';
import { makeInteriorDetails } from './interior-details.js';
import { BUILDING_FINISHES } from './building-finishes.js';
import { makeApproaches, onApproach } from './approach-paths.js';
import { interiorPolygons, projectVisionPolygon } from './vision-polygons.js';
import { ROADSIDE_TYPES, makeRoadside } from './roadside.js';
import { OUTDOOR_CAMERA_HEIGHT, CAMERA_TILT, interiorCameraHeight } from './camera-framing.js';

const UP = new THREE.Vector3(0, 1, 0);
const lerp = (a, b, t) => a + (b - a) * t;
const randomGenerator = seed => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

export class WorldView {
  constructor(canvas, map) {
    this.map = map; this.canvas = canvas; this.materials = new Map();
    this.interiorVisibility = new InteriorVisibility();
    this.groundMaterials = new Set(); this.textureCache = new Map(); this.quality = GRAPHICS.balanced;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
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
    Object.assign(sun.shadow.camera, { left: -48, right: 48, top: 44, bottom: -44, near: 1, far: 120 });
    sun.shadow.normalBias = .035; sun.shadow.bias = -.00015; sun.shadow.radius = 3;
    this.scene.add(sun, sun.target); this.sun = sun;
    this.static = new THREE.Group(); this.scene.add(this.static);
    this.propDetails = []; this.roofs = []; this.tumbleweeds = []; this.props = new Map();
    this.makeTerrain();
    makeRailways(this);
    for (const b of map.buildings) this.makeBuilding(b);
    for (const p of mapProps(map)) this.makeProp(p);
    for (const f of map.fences) this.makeFence(f);
    this.cropView = new CropView(this); this.qualityDetails = makeQualityDetails(this);
    this.batch(this.static);
    // These transforms never animate. Keep quality geometry, skip rebuilding its matrices.
    for (const root of [this.static,this.groundDetails,this.extraGroundDetails,this.qualityDetails,this.performanceDetails]) root.traverse(o=>{o.updateMatrix();o.matrixAutoUpdate=false;});
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
    this.particleMaterials = ['#c99b65', '#edcf8c', '#fff4d0', '#a75436', '#788568', '#a68a60', '#696c58', '#ffffff'].map(color => new THREE.MeshBasicMaterial({ color, transparent: true }));
    this.particlePool = this.particleMaterials.map(m => {
      const mesh = new THREE.InstancedMesh(this.particleGeo, m, 240); mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.frustumCulled = false; this.scene.add(mesh); return mesh;
    });
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
    this.visionOverlay = document.createElement('div'); this.visionOverlay.className = 'interior-vision';
    this.visionOverlay.setAttribute('aria-hidden', 'true'); canvas.insertAdjacentElement('afterend', this.visionOverlay);
    this.cropOverlay = document.createElement('div'); this.cropOverlay.className = 'crop-vision'; this.cropOverlay.setAttribute('aria-hidden', 'true'); canvas.insertAdjacentElement('afterend', this.cropOverlay);
    this.setQuality('balanced');
    this.resize();
    this.camera.position.set(this.focus.x, this.cameraHeight, this.focus.z + this.cameraHeight * CAMERA_TILT); this.camera.lookAt(this.focus); this.camera.updateMatrixWorld();
  }

  material(color) {
    if (!this.materials.has(color)) this.materials.set(color, new THREE.MeshStandardMaterial({ color, roughness: 1, metalness: 0 }));
    return this.materials.get(color);
  }
  mesh(geometry, color, x, y, z, parent = this.static) {
    const m = new THREE.Mesh(geometry, typeof color === 'string' ? this.material(color) : color);
    m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
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
    const q = this.quality;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, q.pixelRatio) * q.scale);
    this.renderer.shadowMap.enabled = q.shadows > 0;
    this.renderer.shadowMap.type = name !== 'performance' ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    this.sun.castShadow = q.shadows > 0;
    if (this.sun.shadow.mapSize.x !== Math.max(1, q.shadows)) {
      this.sun.shadow.map?.dispose(); this.sun.shadow.map = null;
      this.sun.shadow.mapSize.set(Math.max(1, q.shadows), Math.max(1, q.shadows));
    }
    this.sun.shadow.needsUpdate = true;
    const texture = this.terrainTexture(q.texture);
    texture.anisotropy = Math.min(name === 'quality' ? 8 : name === 'balanced' ? 8 : 1, this.renderer.capabilities.getMaxAnisotropy());
    texture.needsUpdate = true;
    const groundRelief = name === 'quality' ? this.reliefTexture('sand') : null;
    const woodRelief = name === 'quality' ? this.reliefTexture('wood') : null;
    this.groundMaterials.forEach(m => { m.map = name === 'potato' ? null : texture; m.bumpMap = groundRelief; m.bumpScale = .075; m.needsUpdate = true; });
    for (const roof of this.roofs) for (const m of roof.materials) { m.bumpMap = woodRelief; m.bumpScale = .035; m.roughness = .88; m.needsUpdate = true; }
    const timberColors = new Set(['#917655','#ad9470','#66543f','#9b8161','#b59971','#967b58','#ab8e65',...this.map.buildings.map(b=>b.color)]);
    for (const [color,m] of this.materials) if (timberColors.has(color) && !this.groundMaterials.has(m)) { m.bumpMap=woodRelief; m.bumpScale=.035; m.needsUpdate=true; }
    this.scene.traverse(o => { if (o.isMesh && o.material) o.material.needsUpdate = true; });
    this.motes.geometry.setDrawRange(0, q.motes);
    this.fxLight.visible = q.light;
    this.groundDetails.visible = name === 'balanced' || name === 'quality';
    this.performanceDetails.visible = name !== 'potato';
    this.propDetails.forEach(g => { g.visible = name === 'quality'; });
    this.extraGroundDetails.visible = name === 'quality'; this.qualityDetails.visible = name === 'quality';
    this.footMesh.material.uniforms.relief.value = q.shadows > 0 ? 1 : 0;
    for (const [i, marks] of this.sandMarks.entries()) {
      marks.visible = name !== 'potato';
      marks.material.opacity = name === 'quality' ? (i ? .25 : .3) : name === 'balanced' ? (i ? .25 : .3) : .09;
      const fraction = name === 'quality' ? 1 : name === 'balanced' ? 1 : .3;
      marks.geometry.setDrawRange(0, Math.floor(marks.geometry.attributes.position.count * fraction / 2) * 2);
    }
    for (const beam of this.beams.values()) beam.halo.visible = q.glow;
    this.particles.length = Math.min(this.particles.length, q.particleCap);
    this.electric.setQuality(name);
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
    this.terrainUV(this.box(0, -.28, 0, map.width + 60, .5, map.depth + 60, map.palette.ground));
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
    this.batch(base); this.batch(extra); this.batch(sparse);
    base.userData.patches = Math.min(330, patches); extra.userData.patches = Math.max(0, patches - 330);
  }

  makeGrass(x, z, rand) {
    for (let k = 0; k < 4; k++) {
      const m = this.box(x + (rand() - .5) * .35, .13, z + (rand() - .5) * .25, .035, .25 + rand() * .2, .035, '#a69665');
      m.rotation.z = (rand() - .5) * 1.4;
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
    this.batch(roof);
    // Thin raised roof layers should not produce shadow-map striping on each other.
    roof.traverse(m => { if (m.isMesh) m.receiveShadow = false; });
    this.roofs.push({ ...b, group: roof, materials: roofMaterials, opacity: 1 });
    if(b.interiorStyle) makeDetailedInterior(this,b);
    else {
      this.box(b.x, .4, b.z - b.d / 2 + 1.1, b.w - (b.finish==='plaster'?3.5:2), .8, .65, b.trim || '#987853');
      for (const sx of [-1, 1]) this.cylinder(b.x + sx * (b.finish==='vertical'?1.5:2), .28, b.z - b.d / 2 + 2.2, .32, .56, b.trim || '#7d6a50');
    }
    if (!b.cargo) makeInteriorDetails(this,b);
    else {
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
    const count=this.qualityName==='potato'?1:this.qualityName==='quality'?3:2;
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
      this.makeHealthBar(g);
      return g;
    }
    this.box(0, .47, 0, .13, .9, .13, '#907552', board);
    this.box(0, .1, 0, 1.1, .18, .65, '#a88d62', board);
    const face = new THREE.Group(); face.position.set(0, 1, 0); face.rotation.x = .6; board.add(face);
    const disk = this.cylinder(0, 0, 0, .6, .14, '#eee0bd', face, 20); g.userData.disk = disk;
    this.cylinder(0, .08, 0, .41, .016, moving ? '#6e8880' : '#b87552', face, 20);
    this.cylinder(0, .096, 0, .27, .018, '#ede0bc', face, 20);
    this.cylinder(0, .109, 0, .13, .02, '#ab5438', face, 16);
    this.makeHealthBar(g); return g;
  }

  makeHealthBar(parent) {
    const bar = new THREE.Group(); bar.position.set(0, .15, .95); parent.add(bar);
    const back = new THREE.Mesh(new THREE.PlaneGeometry(.86, .085), new THREE.MeshBasicMaterial({ color: '#252c28', transparent: true, opacity: .85, depthWrite: false, toneMapped: false }));
    const fill = new THREE.Mesh(new THREE.PlaneGeometry(.78, .045), new THREE.MeshBasicMaterial({ color: '#c1e1ce', transparent: true, depthWrite: false, toneMapped: false }));
    back.renderOrder = 10; fill.renderOrder = 11;
    fill.position.z = .005; bar.add(back, fill); parent.userData.health = { bar, fill };
  }

  makeAmbient() {
    const rand = randomGenerator(132); const points = new Float32Array(140 * 3);
    for (let i = 0; i < 140; i++) { points[i * 3] = (rand() - .5) * 65; points[i * 3 + 1] = .3 + rand() * 4; points[i * 3 + 2] = (rand() - .5) * 60; }
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
    const halfHeight=Math.tan(this.camera.fov*Math.PI/360)*this.camera.position.distanceTo(this.focus);
    const halfWidth=halfHeight*this.camera.aspect;
    for(const wisp of this.dustWisps){
      let drift=wisp.userData.drift;drift.age+=dt;
      if(drift.age>=drift.life){this.resetDustWisp(wisp);drift=wisp.userData.drift;}
      const phase=drift.age/drift.life;
      wisp.position.set(this.focus.x+(drift.x+drift.dx*phase)*halfWidth,drift.height,
        this.focus.z+(drift.z+drift.dz*phase)*halfHeight*1.25+Math.sin(elapsed*.07+drift.phase)*.7);
      wisp.material.opacity=.27*Math.sin(phase*Math.PI)**2;
      wisp.visible=!sim.interior;
    }
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

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h); this.camera.aspect = w / h;
    this.camera.fov = w / h < 1.2 ? 49 : 40; this.camera.updateProjectionMatrix();
  }

  aim(clientX, clientY, player) {
    const rect = this.canvas.getBoundingClientRect();
    this.raycaster.setFromCamera(new THREE.Vector2((clientX - rect.left) / rect.width * 2 - 1, -(clientY - rect.top) / rect.height * 2 + 1), this.camera);
    if (this.raycaster.ray.intersectPlane(this.aimPlane, this.aimHit)) {
      this.cursorWorld.copy(this.aimHit);
      return { aimX: this.aimHit.x - player.x, aimZ: this.aimHit.z - player.z, aimPointX: this.aimHit.x, aimPointZ: this.aimHit.z };
    }
    return { aimX: player.aimX, aimZ: player.aimZ };
  }

  screenPoint(x, z, y = .72) {
    const p = new THREE.Vector3(x, y, z).project(this.camera);
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
      const data = bed.canvas.getContext('2d').getImageData(px, py, 1, 1).data;
      return new THREE.Color(`rgb(${data[0]},${data[1]},${data[2]})`);
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
    if (e.type === 'dodge') this.burst(e.x, e.z, 12, 'dust', this.walkingDustColor(e.x, e.z));
    if (e.type === 'impactMark') this.surfaceMarks.enqueue('bullet',e);
    if (e.type === 'seed') this.burst(e.x, e.z, 2, 'hit');
    if (e.type === 'launch') {
      this.burst(e.x, e.z, 9, 'dust');
      for (const path of e.paths) this.addBeam(path, .016 + e.count * .0007);
      this.fxLight.color.set('#9bffe1'); this.fxLight.position.set(e.x, 1.2, e.z); this.fxLight.intensity = 8 + e.count * 1.5;
    }
    if (e.type === 'pointImpact') { this.burst(e.x, e.z, 6, 'hit'); }
    if (e.type === 'explosion') this.electric.event({ type: 'convergence', x: e.x, z: e.z, radius: e.radius * .6 });
    if (e.type === 'propHit') this.burst(e.x, e.z, 6, 'dust');
    if (e.type === 'propBreak') {
      const prop = this.props.get(e.id); if (prop) prop.visible = false;
      this.breakProp(e); this.burst(e.x, e.z, 7, 'dust');
      this.shake = Math.max(this.shake, .035);
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
        const m = new THREE.Mesh(new THREE.RingGeometry(.45, .49, 32), new THREE.MeshBasicMaterial({ color: '#fae8be', transparent: true, opacity: .9, side: THREE.DoubleSide, depthWrite: false }));
        m.rotation.x = -Math.PI / 2; m.position.set(e.x, .12, e.z); this.scene.add(m); this.rings.push({ mesh: m, age: 0 });
      }
    }
    if (e.type === 'wall') this.burst(e.x, e.z, e.launched ? 5 : 2, 'dust');
    if (e.type === 'respawn') this.burst(e.x, e.z, 8, 'dust');
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
    const angle = Math.atan2(e.directionZ, e.directionX), count = Math.round((plant ? 9 : 14) * (this.qualityName === 'quality' ? 2.5 : .5 + this.quality.effects * .5));
    for (let i = 0; i < count && this.particles.length < this.quality.particleCap; i++) {
      const direction = angle + (Math.random() - .5) * 1.7, speed = 1.7 + Math.random() * 3.2;
      const size = (.12 + Math.random() * .11) * e.scale, life = 1.8 + Math.random() * 1.1;
      this.particles.push({ x: e.x + (Math.random() - .5) * .65, z: e.z + (Math.random() - .5) * .5,
        y: (.25 + Math.random() * (plant ? 1.8 : .9)) * e.scale,
        vx: Math.cos(direction) * speed, vz: Math.sin(direction) * speed, vy: 1.4 + Math.random() * 3,
        life, maxLife: life, size, material: plant ? 4 : barrel && i % 4 === 0 ? 6 : e.propType === 'hay' ? 1 : 5,
        angle: Math.random() * 6.28, spin: (Math.random() - .5) * 12, stretch: plant ? 1.8 : 2.8,
        debris: true, bounces: 0, sound: plant ? 'plant' : 'wood' });
    }
  }

  explosion(e) {
    this.surfaceMarks.enqueue('explosion',e);
    const ring = new THREE.Mesh(new THREE.RingGeometry(.88, 1, 40), new THREE.MeshBasicMaterial({ color: '#ffe2a0', transparent: true, opacity: .9, side: THREE.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(e.x, .09, e.z); ring.scale.setScalar(.1); this.scene.add(ring);
    const core = new THREE.Mesh(this.smokeGeo, new THREE.MeshBasicMaterial({ color: '#fff3c3', transparent: true, opacity: 1, depthWrite: false, toneMapped: false }));
    core.position.set(e.x, .7, e.z); core.scale.setScalar(e.radius * .4); core.renderOrder = 1; this.scene.add(core);
    // Keep the readable fireball on every preset; quality adds extra rolling lobes.
    const smoke = [], count = Math.min(this.qualityName==='quality'?36:20,Math.max(4, Math.round(4 + e.count * .55 * this.quality.effects)));
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(this.smokeGeo, new (this.qualityName === 'quality' ? THREE.MeshStandardMaterial : THREE.MeshBasicMaterial)({ color: i % 2 ? '#81786b' : '#484640', transparent: true, opacity: .65, depthWrite: false }));
      const flame = new THREE.Mesh(this.smokeGeo, new THREE.MeshBasicMaterial({ color: i % 2 ? '#ff731b' : '#ffbd42', transparent: true, opacity: 1, depthWrite: false, toneMapped: false }));
      const angle = i / count * Math.PI * 2 + Math.random() * .4;
      for (const puff of [mesh, flame]) {
        puff.position.set(e.x, .3, e.z); puff.scale.setScalar(.08);
        puff.rotation.set(Math.random() * 3, Math.random() * 6, Math.random() * 3); this.scene.add(puff);
      }
      smoke.push({ mesh, flame, dx: Math.cos(angle), dz: Math.sin(angle), size: .3 + Math.random() * .16 });
    }
    this.blasts.push({ x: e.x, z: e.z, radius: e.radius, ring, core, smoke, age: 0 });
    this.burst(e.x, e.z, this.qualityName === 'quality' ? 25 + e.count * 7 : 5 + e.count * 2, 'hit');
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
      for (const puff of b.smoke) {
        const spread = b.radius * (.16 + Math.min(b.age, 1) * .38);
        puff.mesh.position.set(b.x + puff.dx * spread + b.age * .23, .45 + b.age * .8, b.z + puff.dz * spread);
        puff.mesh.scale.setScalar(b.radius * puff.size * (.8 + b.age * .55));
        puff.mesh.material.opacity = .65 * Math.min(1, b.age / .12) * Math.max(0, 1 - b.age / 1.8);
        const fire = Math.min(1, b.age / .09), fade = Math.max(0, 1 - Math.max(0, b.age - .14) / .32);
        puff.flame.position.set(b.x + puff.dx * b.radius * fire * .4, .5 + b.age * 1.8, b.z + puff.dz * b.radius * fire * .4);
        puff.flame.scale.setScalar(b.radius * puff.size * (1 + fire * .65) * Math.sqrt(fade));
        puff.flame.material.opacity = fade; puff.flame.visible = fade > 0;
      }
      if (b.age < 1.8) return true;
      this.disposeBlast(b); return false;
    });
  }

  disposeBlast(b) {
    b.ring.removeFromParent(); b.ring.geometry.dispose(); b.ring.material.dispose();
    b.core.removeFromParent(); b.core.material.dispose();
    for (const p of b.smoke) for (const mesh of [p.mesh, p.flame]) { mesh.removeFromParent(); mesh.material.dispose(); }
  }

  updateBeams(sim, dt) {
    for (const [id, b] of this.beams) {
      const shot = sim.shots.find(s => s.id === id);
      if (shot && !b.finished) { b.endX = shot.x; b.endZ = shot.z; }
      if (b.finished) b.age += dt;
      if (b.age > .62) {
        b.core.removeFromParent(); b.halo.removeFromParent(); b.core.material.dispose(); b.halo.material.dispose();
        b.arc.removeFromParent(); b.arc.geometry.dispose(); b.arc.material.dispose(); this.beams.delete(id); continue;
      }
      const delta = new THREE.Vector3(b.endX - b.startX, 0, b.endZ - b.startZ), length = delta.length();
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
      for (const [mesh, scale] of [[b.core, 1], [b.halo, this.qualityName === 'quality' ? 9 : 5]]) {
        mesh.position.set((b.startX + b.endX) / 2, .72, (b.startZ + b.endZ) / 2);
        if (length > .0001) mesh.quaternion.setFromUnitVectors(UP, delta.clone().normalize());
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
    this.cameraHeight = deathCamera?deathCamera.height:lerp(this.cameraHeight, cameraRoom ? interiorCameraHeight(cameraRoom, this.camera.aspect) : OUTDOOR_CAMERA_HEIGHT, 1 - Math.exp(-5.7 * dt));
    this.kick.multiplyScalar(Math.exp(-15 * dt)); this.shake *= Math.exp(-this.shakeDecay * dt);
    const pressureShake=this.shotgunView?.pressure.shake||0;
    const shakeX = this.motion ? Math.sin(elapsed * 91) * (this.shake+pressureShake) * .65 : 0;
    const shakeZ = this.motion ? Math.cos(elapsed * 77) * (this.shake+pressureShake) * .5 : 0;
    const fx = this.focus.x + shakeX + (this.motion && !cameraRoom ? this.kick.x : 0), fz = this.focus.z + shakeZ + (this.motion && !cameraRoom ? this.kick.z : 0);
    this.sun.position.set(fx - 24, 40, fz - 18); this.sun.target.position.set(fx, 0, fz);
    this.camera.position.set(fx, this.cameraHeight, fz + this.cameraHeight * CAMERA_TILT); this.camera.lookAt(fx, 0, fz); this.camera.updateMatrixWorld();
    for (const roof of this.roofs) {
      const desired = sim.roofId === roof.id ? .095 : 1;
      roof.opacity = lerp(roof.opacity, desired, 1 - Math.exp(-8 * dt));
      for (const m of roof.materials) { m.opacity = roof.opacity; m.depthWrite = roof.opacity > .98; }
      const castsShadow=roof.opacity>.5;
      if(roof.castsShadow!==castsShadow){
        roof.group.traverse(o => { if(o.isMesh)o.castShadow=castsShadow; });
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
      const { bar, fill } = g.userData.health, fraction = Math.max(0, t.hp / t.maxHp);
      bar.visible = false; bar.quaternion.copy(this.camera.quaternion);
      fill.scale.x = fraction; fill.position.x = -.39 * (1 - fraction);
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
      g.userData.aura.visible = s.hex || (!s.launched&&s.age<.23) || this.qualityName === 'quality';
      g.userData.aura.material.opacity = s.hex ? .3+Math.sin(elapsed*45+s.id)*.12 : .09 + Math.sin(elapsed * 16 + s.id) * .035+(!s.launched?Math.max(0,1-s.age/.23)*.4:0);
      if(s.hex)g.userData.aura.scale.setScalar(2.2+Math.sin(elapsed*34+s.id)*.35);
      g.userData.orb.material = s.launched ? this.shotMaterial : this.seedMaterial;
      const lifeScale = !sim.dev.orbs && !s.launched && s.age > 7.5 ? Math.max(.2, (9 - s.age) / 1.5) : 1;
      g.userData.orb.scale.setScalar((1 + Math.sin(elapsed * 5 + s.id) * .06) * lifeScale);
      g.userData.trail.visible = !!s.launched;
      g.userData.trail.scale.set(1, 1, Math.min(1.4, s.age * 31));
      g.userData.trail.position.z = -Math.min(.7, s.age * 15.5);
      const electricity = g.userData.electricity, points = electricity.geometry.attributes.position;
      const arcs = this.qualityName === 'performance' || this.qualityName === 'potato' ? 1 : this.qualityName === 'quality' ? 5 : 3;
      let vertex = 0;
      for (let arc = 0; arc < arcs; arc++) for (let j = 0; j < 6; j++) for (const k of [j, j + 1]) {
        const tick = Math.floor(elapsed * 18), phase = s.id * 2.7 + arc * 2.1 + tick * .7;
        const angle = phase + k * .27, radius = .18 + Math.sin(k * 19 + tick + s.id) * .024;
        points.setXYZ(vertex++, Math.cos(angle) * radius, Math.sin(angle) * radius * Math.cos(arc + .5), Math.sin(angle) * radius * Math.sin(arc + .5));
      }
      electricity.geometry.setDrawRange(0, vertex); points.needsUpdate = true;
      electricity.scale.setScalar(s.launched ? 1.3 : lifeScale);
    }
    for (const [id, g] of this.shots) if (!present.has(id)) { this.scene.remove(g); g.userData.electricity.geometry.dispose(); g.userData.aura.material.dispose(); this.shots.delete(id); }
    this.updateBeams(sim, dt); this.fxLight.intensity *= Math.exp(-12 * dt);
    if (active && speed > 1) { this.stepClock += dt; if (this.stepClock > .085) { this.burst(p.x, p.z, 2, 'dust', this.walkingDustColor(p.x, p.z)); this.stepClock = 0; } }
    this.cropView.update(sim, dt);
    this.updateParticles(dt); this.updateBlasts(dt);this.electric.updateAftershocks(dt,sim); this.electric.drift(sim.seeds,sim.player,sim.colliders,dt); this.electric.charge(sim.hexOrbs,dt,sim.player); this.electric.syncSpin(sim.hexSpin,sim.player,dt); this.electric.update(dt); this.electric.boundary(sim.hexOrbs);
    for (const ring of this.rings) {
      ring.age += dt; ring.mesh.scale.setScalar(1 + ring.age * 8); ring.mesh.material.opacity = Math.max(0, 1 - ring.age * 2.5);
    }
    this.rings = this.rings.filter(r => { if (r.age < .4) return true; r.mesh.removeFromParent(); r.mesh.geometry.dispose(); r.mesh.material.dispose(); return false; });
    const positions = this.motes.geometry.attributes.position.array;
    for (let i = 0; i < positions.length; i += 3) { positions[i] += dt * .42; positions[i + 2] += dt * .12; if (positions[i] > 38) positions[i] = -38; }
    this.motes.geometry.attributes.position.needsUpdate = true;
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

  updateVision(sim) {
    const immersion=cropImmersion(sim.crops,sim.player,RULES.radius),crop=immersion?.crop;
    this.cropOverlay.style.display = crop ? 'block' : 'none';
    if (crop) {
      this.cropOverlay.style.opacity=immersion.entryOpacity;
      const c = this.screenPoint(sim.player.x, sim.player.z, .7), edge = this.screenPoint(sim.player.x + crop.visibility, sim.player.z, .7);
      const radius = Math.abs(edge.x - c.x);
      this.cropOverlay.style.background = `radial-gradient(ellipse ${radius*1.25}px ${radius*1.14}px at ${c.x}px ${c.y}px, transparent 18%, rgba(0,0,0,.12) 32%, rgba(0,0,0,.42) 50%, rgba(0,0,0,.76) 70%, rgba(0,0,0,.95) 88%, #000 100%)`;
      if(immersion.outerOpacity>=1)this.cropOverlay.style.maskImage='none';
      else {
        const polygons=immersion.sections.map(s=>projectVisionPolygon([{x:s.x-s.w/2,z:s.z-s.d/2},{x:s.x+s.w/2,z:s.z-s.d/2},{x:s.x+s.w/2,z:s.z+s.d/2},{x:s.x-s.w/2,z:s.z+s.d/2}],this.camera,innerWidth,innerHeight));
        const shapes=polygons.filter(p=>p.length>=3).map(p=>`<polygon fill="white" stroke="white" stroke-width="1.5" points="${p.map(v=>`${v.x.toFixed(1)},${v.y.toFixed(1)}`).join(' ')}"/>`).join('');
        const feather=Math.max(28,radius*.32);
        const mask=`<svg xmlns="http://www.w3.org/2000/svg" width="${innerWidth}" height="${innerHeight}"><defs><filter id="soft" x="-50%" y="-50%" width="200%" height="200%"><feMorphology operator="erode" radius="${feather*1.6}"/><feGaussianBlur stdDeviation="${feather}"/></filter><clipPath id="field">${shapes}</clipPath></defs><rect width="100%" height="100%" fill="white" opacity="${immersion.outerOpacity}"/><g filter="url(#soft)">${shapes}</g></svg>`;
        this.cropOverlay.style.maskImage='url("data:image/svg+xml,'+encodeURIComponent(mask)+'")';
      }
    }
    const room = sim.interior;
    this.visionOverlay.style.display = room ? 'block' : 'none';
    if (!room) { this.visionMaskKey=null; return; }
    const maskKey=[room.id,sim.player.x,sim.player.z,innerWidth,innerHeight,...this.camera.matrixWorld.elements,...this.camera.projectionMatrix.elements].join(',');
    if(this.visionMaskKey===maskKey)return;
    this.visionMaskKey=maskKey;
    const polygons = interiorPolygons(room,sim.player).map(points=>projectVisionPolygon(points,this.camera,innerWidth,innerHeight));
    const holes = polygons.filter(points=>points.length>=3).map(points => '<polygon fill="black" points="' + points.map(p =>
      p.x.toFixed(1) + ',' + p.y.toFixed(1)).join(' ') + '"/>').join('');
    // Blur the union of clear regions, avoiding seams where doorway cones overlap.
    const feather = Math.max(5, Math.min(9, innerHeight * .007));
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${innerWidth}" height="${innerHeight}"><defs><filter id="feather" filterUnits="userSpaceOnUse" x="-40" y="-40" width="${innerWidth + 80}" height="${innerHeight + 80}" color-interpolation-filters="sRGB"><feMorphology operator="erode" radius="${feather*1.6}"/><feGaussianBlur stdDeviation="${feather}"/></filter><mask id="v" maskUnits="userSpaceOnUse" x="0" y="0" width="${innerWidth}" height="${innerHeight}"><rect width="100%" height="100%" fill="white"/><g filter="url(#feather)">${holes}</g></mask></defs><rect width="100%" height="100%" fill="white" mask="url(#v)"/></svg>`;
    this.visionOverlay.style.maskImage = 'url("data:image/svg+xml,' + encodeURIComponent(svg) + '")';
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
      if (p.tint) this.particlePool[p.material].setColorAt(index, p.tint);
    }
    this.particlePool.forEach((mesh, i) => { mesh.count = Math.min(counts[i], 240); mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true; });
  }

  reset(sim) {
    this.deathView?.clear();
    this.rifleView?.clear();this.shotgunView?.clear();
    this.grenadeView?.clear();
    for(const g of this.targets.values()){g.userData.coverHiddenTime=0;g.visible=true;}
    this.cameraHeight = OUTDOOR_CAMERA_HEIGHT;
    this.cropView.reset();
    this.electric.clear(); this.surfaceMarks.clear();
    this.footprints.length = 0; this.footMesh.count = 0; this.footDistance = 0; this.lastFootPosition = { ...sim.player };
    this.focus.set(sim.player.x, 0, sim.player.z); this.kick.set(0, 0, 0); this.shake = 0; this.particles.length = 0;
    for (const g of this.shots.values()) { this.scene.remove(g); g.userData.electricity.geometry.dispose(); g.userData.aura.material.dispose(); } this.shots.clear();
    for (const r of this.rings) { r.mesh.removeFromParent(); r.mesh.geometry.dispose(); r.mesh.material.dispose(); } this.rings.length = 0;
    for (const b of this.beams.values()) { b.core.removeFromParent(); b.halo.removeFromParent(); b.core.material.dispose(); b.halo.material.dispose(); b.arc.removeFromParent(); b.arc.geometry.dispose(); b.arc.material.dispose(); } this.beams.clear();
    this.fxLight.intensity = 0;
    for (const b of this.blasts) this.disposeBlast(b); this.blasts.length = 0;
  }
}




