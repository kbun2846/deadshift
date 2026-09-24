import {ShotgunView} from '../weapons/shotgun-view.js';
import * as THREE from 'three';
import { buildingOpenings } from '../map-kit.js';
import './shader-savings.js';
import { bakeColors } from './bake-colors.js'; // patches three's shaders; before any shader compiles
import { RifleView } from '../weapons/rifle-view.js';
import { RIFLE_QUALITY } from '../weapons/rifle-quality.js';
import { GrenadeView } from '../weapons/grenade-view.js';
import { DeathView } from '../effects/death-view.js';
import { makeRailways, makeRailProp, RAIL_TYPES } from '../world/rail-depot.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildingWalls, mapProps, mapColliders } from '../maps.js';
import { inside, RULES } from '../simulation.js';
import { GRAPHICS, renderPixelRatio, isDemanding } from '../settings.js';
import { ElectricEffects } from '../effects/electric-effects.js';
import { makeLandmark, makeCobweb, makeQualityDetails, makePropDetails } from '../world/world-details.js';
import { SurfaceMarks } from '../effects/surface-marks.js';
import { DustTrail, FOOTFALL_PARTICLES, IMPACT_PARTICLES, kickedDust, debrisDust, CLUTTER_BURST, throwsDust } from '../effects/dust-trail.js';
import { Birds } from '../effects/birds.js';
import { CropView } from '../world/crop-view.js';
import { cropEntityVisible, cropImmersion } from '../crops.js';
import { InteriorVisibility } from './interior-visibility.js';
import { lightBasis, snapShadowFocus } from './shadow-snap.js';
import { boxIndex } from '../box-index.js';
import { mergeTransformed } from './merge-transformed.js';

// How coarse the interior shroud is painted, as a divisor of the viewport. The
// upscale back to full size is what softens the doorway cones, so a bigger
// divisor is both cheaper AND a wider feather -- the low tiers want both.
export const CAMERA_NEAR = 2;

const VISION_STEP = Object.freeze({ potato: 16, performance: 10, balanced: 9, quality: 7, extreme: 5 });
// Seconds between repaints. A phone never needs the shroud to chase the camera
// at frame rate; the cones are soft and move slowly.
const VISION_REPAINT = Object.freeze({ potato: .1, performance: .07, balanced: .05, quality: .033, extreme: .02 });
// The wash itself: a cool, desaturated grey that both dims the world outside
// and drains the warmth out of it, which together read as the old
// grayscale-plus-blur pass without any backdrop work. The higher tiers sit
// lighter because they still have the fog and the scene's own detail to lean
// on; Potato has almost nothing else separating inside from out.
const VISION_SHROUD = Object.freeze({ potato: 'rgba(74,79,76,.62)', performance: 'rgba(74,79,76,.58)',
  balanced: 'rgba(76,81,78,.52)', quality: 'rgba(78,83,80,.46)', extreme: 'rgba(78,83,80,.46)' });
import { makeDetailedInterior } from '../world/detailed-interiors.js';
import { makeInteriorDetails } from '../world/interior-details.js';
import { BUILDING_FINISHES } from '../world/building-finishes.js';
import { makeApproaches, onApproach } from '../world/approach-paths.js';
import { interiorPolygons, projectVisionPolygon } from './vision-polygons.js';
import { ROADSIDE_TYPES, makeRoadside } from '../world/roadside.js';
import { OUTDOOR_CAMERA_HEIGHT, CAMERA_TILT, interiorCameraHeight, snapCameraFocus } from './camera-framing.js';
import { TutorialMarkers } from '../tutorial-markers.js';
import { RemotePlayers } from '../remote-players.js';
import { freezeTransforms } from './frozen-transforms.js';
import { BlobShadows } from './blob-shadows.js';
import { DetailFX, ELECTRIC as FX_ELECTRIC, orbBlastScale } from '../effects/effects-detail.js';
import { mapLook } from './map-look.js';
import { BloodSplatters } from '../effects/blood-splatter.js';
import { RemoteCorpses } from '../effects/remote-corpses.js';
import { CrispOutput, CRISP } from './crisp-output.js';
import { makeTargetDamage, targetYaw } from '../effects/target-damage.js';
import { BloodDrops, BLEED } from '../effects/blood-drops.js';
import { Wading, makeBloodStains, makeGunStains } from '../effects/blood-wading.js';
import { RIFLE_MUZZLE } from '../config/gameplay.js';
// Longest the renderer will hold a frame back waiting for the GPU (gpuBusy).
// Drawn after every other see-through thing: a faded roof's depth, then its colour.
const ROOF_PREPASS_ORDER = 50;
const FENCE_PATIENCE = 120;
import { setExtremeSurfaces, tickExtremeSurfaces } from './extreme-surfaces.js';
import { DustDevils } from '../effects/dust-devils.js';
import { viewWidth, viewHeight } from '../viewport.js';

const UP = new THREE.Vector3(0, 1, 0);
// Reused every frame by the beam pass rather than allocated per beam.
const BEAM_DELTA = new THREE.Vector3(), BEAM_DIR = new THREE.Vector3();
// walkingDustColor's return value is immediately cloned or lerped by its
// callers, so one scratch colour serves the crop-bed branch.
const DUST_SAMPLE = new THREE.Color();
// Fired clay, for the shard particles a broken pot throws.
const CLAY_SHARD = new THREE.Color('#b3735a');
// Prebuilt so the break path allocates nothing.
// Pieces knocked off practice targets as they break (target-damage.js).
const TARGET_DEBRIS = { wood: new THREE.Color('#c9a676'), paint: new THREE.Color('#eee0bd'), straw: new THREE.Color('#d8c07a'), burlap: new THREE.Color('#a79973') };
const CLUTTER_SHARDS = new Map(Object.entries(CLUTTER_BURST).map(([type, hex]) => [type, new THREE.Color(hex)]));
// The whole floor-clutter family shares these, so the pieces batch together.
const CLUTTER_CLAY = '#9c6346', CLUTTER_DARK = '#6d5a41', CLUTTER_SEAT = '#8d7454';
const WHITE = new THREE.Color('#ffffff');
const lerp = (a, b, t) => a + (b - a) * t;
const randomGenerator = seed => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

const PROP_POP = .28;
const STREAM_GLOW = new THREE.Color('#9edcff');
// Instances per particle colour. Sized for Extreme; lower presets never fill it.
const PARTICLE_POOL = 400;
const BOX_TEMPLATES = new Map();

export class WorldView {
  constructor(canvas, map, qualityName='balanced') {
    this.bufferSize = new THREE.Vector2(); this.map = map; this.canvas = canvas; this.materials = new Map(); this.materialColors = new WeakMap(); this.initialQuality = qualityName;
    this.interiorVisibility = new InteriorVisibility();
    this.groundMaterials = new Set(); this.textureCache = new Map(); this.quality = GRAPHICS[qualityName] || GRAPHICS.balanced;
    // Multisampling on the screen itself only for tiers that draw straight to
    // it; Performance and Balanced draw off-screen (crisp-output.js), where
    // Balanced has its own 4x multisampling.
    this.contextAA = this.quality.antialias === true && !CRISP[qualityName];
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: this.contextAA, powerPreference: 'high-performance' });
    // Reading back each shader's error log on its first draw makes the driver
    // finish that shader there and then, mid-frame. Only a development build
    // needs the logs.
    this.renderer.debug.checkShaderErrors = !!import.meta.env?.DEV;
    // Empty draws are skipped. The effect pools (bullets, casings, magazines,
    // sparks, smoke, pellets, flashes...) are instanced meshes that sit in the
    // scene with no instances most of the time, and the arc and trail batches
    // with an empty draw range; three.js still bound each one's shader and
    // uploaded its uniforms to draw nothing -- about a quarter of all draw calls
    // on an ordinary frame. The warm-up turns this off (`drawEmpty`), since
    // drawing the empty pools once is how their shaders get built at load.
    const drawDirect = this.renderer.renderBufferDirect;
    this.renderer.renderBufferDirect = (camera, scene, geometry, material, object, group) => {
      if (!this.drawEmpty && ((object.isInstancedMesh && object.count === 0) || geometry.drawRange.count === 0 || geometry.instanceCount === 0)) return;
      return drawDirect.call(this.renderer, camera, scene, geometry, material, object, group);
    };
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
    this.lowLatency = true;
    // A phone that runs out of GPU memory drops the WebGL context: the canvas
    // goes blank (the page colour shows through) until it comes back. Drawing
    // stops while it is gone; when it returns, three rebuilds its own state and
    // the shadow map and Extreme's buffers are made again. main.js hears about
    // it (onContextLost) and steps down from Extreme if it keeps happening.
    canvas.addEventListener('webglcontextlost', event => {
      event.preventDefault(); this.contextLost = true; this.frameFence = null; this.onContextLost?.();
    });
    canvas.addEventListener('webglcontextrestored', () => {
      this.contextLost = false;
      this.sun.shadow.map = null; this.sun.shadow.needsUpdate = true;
      if (this.post) { this.post = null; this.postLoading = null; if (this.qualityName === 'extreme') this.enableExtremePost(); }
    });
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = .98;
    // Light and haze come from the map (map-look.js), so each map sets its own mood.
    this.look = mapLook(map);
    this.renderer.setClearColor(this.look.haze);
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(this.look.haze, 70, 130);
    // Near plane at 2, not 0.1. The camera never comes within about seventeen
    // units of anything -- even zoomed into the smallest room, even the death
    // camera's push-in -- and depth precision is spent in proportion to 1/near,
    // so a 0.1 near plane squandered almost all of it on empty space in front
    // of the lens. Far off, surfaces a few millimetres apart could not be told
    // apart and flickered through each other; on the 16-bit depth buffers some
    // phones hand out, 0.1 left roughly 24cm of separation at forty units.
    // Raising it to 2 buys twenty times the precision for nothing.
    this.camera = new THREE.PerspectiveCamera(40, 1, CAMERA_NEAR, 180);
    this.focus = new THREE.Vector3(map.spawn.x, 0, map.spawn.z);
    this.cameraHeight = OUTDOOR_CAMERA_HEIGHT;
    this.scene.add(new THREE.HemisphereLight(this.look.sky, this.look.bounce, this.look.skyIntensity));
    const sun = new THREE.DirectionalLight(this.look.sun, this.look.sunIntensity);
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
    // The sun sits at a fixed offset from its target, so its direction never
    // changes and the basis across its shadow map is computed once.
    this.sunOffset = { x: -24, y: 40, z: -18 };
    this.sunBasis = lightBasis({ x: -this.sunOffset.x, y: -this.sunOffset.y, z: -this.sunOffset.z });
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
    // These transforms never animate. Keep quality geometry, skip rebuilding its matrices.
    // The scene itself never moves; left on, it recomposes every frame and
    // forces all 3600 objects under it to recompute their world matrices.
    this.scene.matrixAutoUpdate = false; this.scene.updateMatrix();
    for (const root of [this.static,this.groundDetails,this.extraGroundDetails,this.qualityDetails,this.performanceDetails]) freezeTransforms(root);
    // Breakable props (about 350 groups, 1600 objects) stand still too, except
    // when hit (a wobble) or restored (a grow-in). The prop loop in update()
    // calls updateMatrix() on those frames only.
    for (const g of this.props.values()) freezeTransforms(g, { movable: true });
    this.player = this.makePlayer(); this.scene.add(this.player);
    // Blood picked up walking through pools (blood-wading.js).
    this.player.userData.bloodStains = makeBloodStains(this.player.userData.body); this.wading = new Wading();
    this.targets = new Map();
    for (const target of map.targets) {
      const group = this.makeTarget(target.moving, target.kind); group.rotation.y = targetYaw(target.id); this.interiorVisibility.applyEntity(group); this.targets.set(target.id, group); this.scene.add(group);
    }
    this.electric = new ElectricEffects(this.scene); this.shots = new Map(); this.particles = []; this.rings = []; this.beams = new Map(); this.blasts = [];
    this.smokeGeo = new THREE.IcosahedronGeometry(1, 0);
    this.beamGeo = new THREE.CylinderGeometry(1, 1, 1, 6);
    this.fxLight = new THREE.PointLight('#9bffe1', 0, 7, 2); this.scene.add(this.fxLight); this.fxLightLevel = 0;
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
      const mesh = new THREE.InstancedMesh(this.particleGeo, m, PARTICLE_POOL); mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.frustumCulled = false;
      // Allocated up front rather than on the first setColorAt. Whether an
      // instanced mesh has per-instance colour is part of its shader, so a pool
      // that grew the buffer mid-game compiled a second program on its first
      // tinted burst -- after the loading screen, in the middle of play.
      mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(PARTICLE_POOL * 3).fill(1), 3);
      mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
      this.scene.add(mesh); return mesh;
    });
    this.dustTrail = new DustTrail(this.scene);
    // Sparks, embers, smoke, flashes, shock rings and grit over every weapon,
    // blast, fire and footstep (effects-detail.js). Counts scale per preset.
    this.fx = new DetailFX(this.scene);
    // Where two floating orbs arc to each other, both ends flash and spit.
    this.electric.onContact = (a, b) => { for (const end of [a, b]) this.fx.electric(end.x, .72, end.z, .45, { ring: false }); };
    this.birds = new Birds(this.scene);
    this.dummy = new THREE.Object3D(); this.dustClock = 0; this.stepClock = 0; this.windClock = 0;
    this.footprints = []; this.footDistance = 0; this.footSide = 1;
    this.lastFootPosition = { ...map.spawn };
    const footGeometry = new THREE.CircleGeometry(1, 10); footGeometry.rotateX(-Math.PI / 2);
    footGeometry.setAttribute('fade', new THREE.InstancedBufferAttribute(new Float32Array(160), 1));
    this.footMesh = new THREE.InstancedMesh(footGeometry, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { relief: { value: 0 }, pressed: { value: 0 } },
      vertexShader: 'attribute float fade; uniform float pressed; varying float vFade; varying vec2 vFoot; varying vec2 vSun; void main(){ vFade=fade; vFoot=uv*2.0-1.0;'
        // The sun, turned into this print's own frame (x across the foot, y along it).
        + ' vec3 across=normalize(vec3(instanceMatrix[0].x,0.0,instanceMatrix[0].z)); vec3 along=normalize(vec3(instanceMatrix[2].x,0.0,instanceMatrix[2].z)); vec3 sun=normalize(vec3(-24.0,0.0,-18.0));'
        + ' vSun=vec2(dot(sun,across),dot(sun,along)); gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.0); }',
      // Extreme ('pressed') shapes a real boot print: a sole and a heel sunk
      // into the sand with tread bars across the sole and a lip of pushed-up
      // sand round the edge, lit by the sun from the same side as everything
      // else (the wall facing the sun falls into shade, the far wall catches
      // the light). Other presets keep the flat stamped print.
      fragmentShader: `uniform float relief; uniform float pressed; varying float vFade; varying vec2 vFoot; varying vec2 vSun;
        float print(vec2 p){
          float sole=length(vec2(p.x/.92,(p.y-.28)/.72))-1.0;
          float heel=length(vec2(p.x/.78,(p.y+.62)/.36))-1.0;
          float d=min(sole,heel);
          float tread=(p.y>-.1)?.18*step(.55,fract(p.y*5.0)):0.0;
          return -(1.0-smoothstep(-.12,.04,d))*(1.0-tread)+.35*exp(-pow((d-.14)/.09,2.0));
        }
        void main(){
          // Colours are display colours, decoded here and encoded for whatever
          // is drawn to: the screen, or Extreme's linear buffers (which used to
          // brighten these, because raw shader output skipped the conversion).
          if(pressed<.5){ float edge=smoothstep(0.68,0.97,length(vFoot)); float lip=edge*smoothstep(-0.1,0.8,vFoot.y)*relief; vec3 color=mix(vec3(0.22,0.17,0.11),vec3(0.72,0.60,0.40),lip); float shade=0.22+relief*(0.10*(1.0-edge)+0.15*edge); gl_FragColor=linearToOutputTexel(sRGBTransferEOTF(vec4(color,shade*vFade))); return; }
          vec2 p=vFoot*vec2(1.0,-1.18); float e=.03; // +y: toward the toe
          float h=print(p), hx=(print(p+vec2(e,0.0))-h)/e, hy=(print(p+vec2(0.0,e))-h)/e;
          // Metres: the print is 19 cm across and 36 cm long, about 1.5 cm deep.
          vec3 n=normalize(vec3(-hx*.015/.095,1.0,-hy*.015/.18));
          float lit=dot(n,normalize(vec3(vSun.x*.55,.75,vSun.y*.55)))/.75-1.0;
          // Two layers: packed, darker sand in the hollow plus the shaded wall,
          // and the sunlit wall and lip of loose sand over it.
          float depth=clamp(-h,0.0,1.0), rim=clamp(h,0.0,1.0);
          float darkA=depth*.3+max(0.0,-lit)*1.5, lightA=max(0.0,lit)*1.3+rim*.18;
          float alpha=clamp(darkA+lightA,0.0,.75);
          vec3 color=(vec3(.3,.21,.12)*darkA+vec3(.93,.83,.64)*lightA)/max(darkA+lightA,1e-3);
          gl_FragColor=linearToOutputTexel(sRGBTransferEOTF(vec4(color,alpha*vFade*smoothstep(1.0,.9,length(vFoot)))));
        }`,
    }), 160);
    this.footMesh.count = 0; this.footMesh.frustumCulled = false;
    this.footMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.scene.add(this.footMesh);
    this.shake = 0; this.shakeDecay = 20; this.kick = new THREE.Vector3(); this.motion = true;
    this.raycaster = new THREE.Raycaster(); this.aimPlane = new THREE.Plane(UP, -.7); this.aimHit = new THREE.Vector3();
    this.cursorWorld = new THREE.Vector3();
    this.makeAmbient();
    this.surfaceMarks = new SurfaceMarks(this);
    // Blood on the floor wherever a player dies (blood-splatter.js).
    this.blood = new BloodSplatters(this);
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
    // Warm every program the scene will need, behind the loading screen. This
    // has to come after setQuality, not before it: the shadow-map type and the
    // bump maps are both part of three's program cache key, and setQuality
    // changes them. Warming first compiled everything for PCFSoft shadows and
    // then threw it all away the moment Balanced switched to PCF, so every
    // program was compiled live instead -- a building, where a room's worth of
    // never-seen materials come into view at once, was where that stalled.
    // `material.transparent` is in the key too, so the roof fade needs two
    // variants of every roof material, and both are compiled here.
    // The weapon views build their meshes (the rifle's smoke, the shotgun's
    // pellets, the grenade's range marker) when made, so they are made here,
    // before the warm-up, rather than on the first frame of play after it.
    this.rifleView = new RifleView(this); this.shotgunView = new ShotgunView(this); this.grenadeView = new GrenadeView(this);
    this.orderGround();
    this.warmPrograms();
    this.programsWarmed = true;
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
    if (!this.materials.has(color)) { const m = new THREE.MeshStandardMaterial({ color, roughness: 1, metalness: 0 }); this.materials.set(color, m); (this.materialColors ||= new WeakMap()).set(m, color); }
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

  // The world asks for ~31,000 boxes in only ~1,900 distinct sizes. Building
  // a BoxGeometry runs its face generator every time; copying the arrays of
  // one already built for that size is several times cheaper. Every box still
  // gets its own geometry, since some are edited afterwards (terrain UVs).
  box(x, y, z, w, h, d, color, parent) {
    const key = w + ',' + h + ',' + d;
    let template = BOX_TEMPLATES.get(key);
    if (!template) { template = new THREE.BoxGeometry(w, h, d); BOX_TEMPLATES.set(key, template); }
    return this.mesh(new THREE.BufferGeometry().copy(template), color, x, y, z, parent);
  }
  // Built on Extreme, round things get twice the sides: barrels, hat brims,
  // wheels, posts. The world is built once per load, so this follows the
  // preset the map loaded with (switching up mid-game keeps the models).
  cylinder(x, y, z, radius, height, color, parent, segments = 10, top = radius) {
    if (this.initialQuality === 'extreme' && segments >= 6) segments = Math.min(40, segments * 2);
    return this.mesh(new THREE.CylinderGeometry(top, radius, height, segments), color, x, y, z, parent);
  }
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
    this.fx?.setQuality(name);
    // Performance and Balanced draw off-screen and are written to the screen
    // by one crisp upscale pass (crisp-output.js). So does a smoothed tier
    // (Quality) on a page that started without screen multisampling.
    const crisp = CRISP[name] || (!this.contextAA && q.antialias && name !== 'extreme' ? { output: q.pixelRatio, maxOutput: q.maxPixels, fxaa: false, sharpen: 0, samples: 4 } : null);
    if (crisp) { this.crisp ||= new CrispOutput(this.renderer); this.crispSpec = crisp; }
    else { this.crisp?.dispose(); this.crisp = null; this.crispSpec = null; }
    // Extreme's finishing passes (ambient occlusion, bloom, grade) load on
    // first use; every other preset draws straight to the screen.
    if (name === 'extreme') this.enableExtremePost();
    // Its buffers are several hundred MB at 4K; they go when Extreme does.
    else if (this.post) { this.post.dispose(); this.post = null; this.postLoading = null; }
    // No shadow map on Potato: soft patches under things stand in for it.
    if (q.shadows === 0) (this.blobShadows ||= new BlobShadows(this.scene, this.map)).enabled = true;
    else if (this.blobShadows) this.blobShadows.enabled = false;
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
    const timberColors = this.timberColors();
    for (const [color,m] of this.materials) if (timberColors.has(color) && !this.groundMaterials.has(m)) { m.bumpMap=woodRelief; m.bumpScale=.035; m.needsUpdate=true; }
    const bakedTimber = this.bakedMaterials?.get('timber');
    if (bakedTimber) { bakedTimber.bumpMap = woodRelief; bakedTimber.bumpScale = .035; bakedTimber.needsUpdate = true; }
    // Extreme: varied, pebbled ground and dust-weathered surfaces (shader only).
    const surfaces = [...(this.bakedMaterials?.values() || []), ...[...this.materials.values()].filter(m => !m.transparent && !this.groundMaterials.has(m)),
      ...this.roofs.flatMap(roof => roof.materials)];
    setExtremeSurfaces({ ground: this.groundMaterials, surfaces }, name === 'extreme');
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
    if (this.groundDetailsWanted(name) && this.groundDetailsFull === false) {
      for (const root of [this.groundDetails, this.extraGroundDetails, this.performanceDetails]) {
        root.removeFromParent(); root.traverse(o => { if (o.isMesh) o.geometry.dispose(); });
      }
      this.makeGroundDetails(true);
    }
    this.groundDetails.visible = name === 'balanced' || isDemanding(name);
    this.performanceDetails.visible = name !== 'potato';
    this.propDetails.forEach(g => { g.visible = isDemanding(name); });
    this.extraGroundDetails.visible = isDemanding(name); this.qualityDetails.visible = isDemanding(name);
    this.footMesh.material.uniforms.relief.value = q.shadows > 0 ? 1 : 0;
    this.footMesh.material.uniforms.pressed.value = name === 'extreme' ? 1 : 0;
    for (const [i, marks] of this.sandMarks.entries()) {
      marks.visible = name !== 'potato';
      // Line segments are among the cheapest things to draw, so Performance
      // gets most of the ground's cracks rather than a faint third of them.
      marks.material.opacity = isDemanding(name) ? (i ? .25 : .3) : name === 'balanced' ? (i ? .25 : .3) : .17;
      const fraction = isDemanding(name) ? 1 : name === 'balanced' ? 1 : .65;
      marks.geometry.setDrawRange(0, Math.floor(marks.geometry.attributes.position.count * fraction / 2) * 2);
    }
    for (const beam of this.beams.values()) beam.halo.visible = q.glow;
    this.particles.length = Math.min(this.particles.length, q.particleCap);
    this.electric.setQuality(name);
    this.dustTrail?.setQuality(name);
    this.birds?.setQuality(name);
    if (this.visionOverlay) this.visionOverlay.dataset.quality = name;
    this.resize();
    if (this.programsWarmed) this.warmPrograms();
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

  // Plain flat-coloured materials (everything made by material(color) that no
  // texture, bump pass or fade depends on) are baked into vertex colours so
  // that meshes of different colours can share one draw. Before this the world
  // was split into a draw per colour per cell, and breakable props into a draw
  // per part: a barrel was four, a crate up to nine. Timber keeps its own baked
  // material because the higher presets give wood grain a bump map.
  bakeKind(o) {
    const m = o.material, color = this.materialColors?.get(m);
    if (color === undefined || this.groundMaterials?.has(m) || m.transparent || m.vertexColors || o.geometry.attributes.color) return null;
    return this.timberColors().has(color) ? 'timber' : 'plain';
  }
  bakedMaterial(kind) {
    this.bakedMaterials ||= new Map();
    if (!this.bakedMaterials.has(kind)) this.bakedMaterials.set(kind, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, metalness: 0, vertexColors: true }));
    return this.bakedMaterials.get(kind);
  }
  timberColors() {
    return this.timberColorSet ||= new Set(['#917655','#ad9470','#66543f','#9b8161','#b59971','#967b58','#ab8e65',...this.map.buildings.map(b=>b.color)]);
  }

  batch(group, bake = true) {
    group.updateMatrixWorld(true);
    const buckets = new Map();
    group.traverse(o => {
      if (!o.isMesh || Array.isArray(o.material) || o.material.map || o.material.alphaMap) return;
      const baked = bake ? this.bakeKind(o) : null;
      // Spatial batches let both the camera and shadow frusta reject distant detail.
      // Material-only batches span the entire map, drawing every blade of grass.
      o.geometry.computeBoundingSphere();
      const center=o.geometry.boundingSphere.center.clone().applyMatrix4(o.matrixWorld);
      const cell=`${Math.floor(center.x/24)},${Math.floor(center.z/24)}`;
      // Body parts that death reactions remove on their own (a head, the legs)
      // merge only with parts of the same kind, and the merged mesh keeps the tag.
      const part = o.userData.deathPart || '';
      const key = `${cell}-${part}-${baked ? 'baked-' + baked : o.material.uuid}-${o.castShadow}-${!!o.geometry.index}-${Object.keys(o.geometry.attributes).sort().join(',')}`;
      if (!buckets.has(key)) buckets.set(key, { material: baked ? this.bakedMaterial(baked) : o.material, baked: !!baked, castShadow: o.castShadow, part, meshes: [] });
      buckets.get(key).meshes.push(o);
    });
    const inverse = group.matrixWorld.clone().invert(), local = new THREE.Matrix4();
    // Merged originals are collected and dropped from their parents in one pass
    // at the end. removeFromParent() per mesh is an indexOf and a splice on the
    // parent's child list each time, and ground detail puts thousands of blades
    // under a single group -- quadratic, and a measurable slice of the load.
    const merged = new Set(), parents = new Set();
    for (const { material, baked, castShadow, part, meshes } of buckets.values()) {
      if (meshes.length < 2) continue;
      // Written straight into the merged buffers; the clone-per-mesh path is
      // kept only for anything the direct merge declines.
      let combined = mergeTransformed(meshes.map(m => ({ geometry: m.geometry, matrix: new THREE.Matrix4().multiplyMatrices(inverse, m.matrixWorld), color: baked ? m.material.color : undefined })));
      if (!combined) {
        const geometries = meshes.map(m => {
          const g = m.geometry.clone().applyMatrix4(local.multiplyMatrices(inverse, m.matrixWorld));
          if (baked) { const c = m.material.color, n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3); g.setAttribute('color', new THREE.BufferAttribute(a, 3)); }
          return g;
        });
        combined = mergeGeometries(geometries);
        geometries.forEach(g => g.dispose());
      }
      if (!combined) continue;
      combined.computeBoundingSphere();
      const m = new THREE.Mesh(combined, material); m.castShadow = castShadow; m.receiveShadow = true;
      if (part) m.userData.deathPart = part;
      for (const original of meshes) { merged.add(original); if (original.parent) parents.add(original.parent); original.geometry.dispose(); }
      group.add(m);
    }
    for (const parent of parents) {
      parent.children = parent.children.filter(child => {
        if (!merged.has(child)) return true;
        child.parent = null; return false;
      });
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
    // Built once, each with its bounds: this is asked tens of thousands of
    // times while the ground is dressed, and most points are nowhere near.
    const branches=this.sideBranches ||= (this.map.farmBend ? [...(this.map.sideRoads||[]),{points:[[48,80],[75,81.2],[77,84],[49,83.2]]}] : this.map.sideRoads||[])
      .map(({points})=>({points,minX:Math.min(...points.map(p=>p[0])),maxX:Math.max(...points.map(p=>p[0])),minZ:Math.min(...points.map(p=>p[1])),maxZ:Math.max(...points.map(p=>p[1]))}));
    return branches.some(({points,minX,maxX,minZ,maxZ}) => {
      if(x<minX-padding||x>maxX+padding||z<minZ-padding||z>maxZ+padding)return false;
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
    const obstacles = boxIndex(mapColliders(this.map));
    for (let i = 0; i < 130; i++) {
      const x = (random() - .5) * this.map.width, z = (random() - .5) * this.map.depth, radius = 1.1 + random() * 1.7;
      const edge = this.roadEdges(z);
      if ((x > edge.left - radius - .5 && x < edge.right + radius + .5) || this.onSideRoad(x,z,radius) || this.map.buildings.some(b => inside({ x, z }, b, radius + 2.5))) continue;
      if (obstacles.some(x, z, radius + .5, b => inside({ x, z }, b, radius + .5)) || this.map.targets.some(t => Math.hypot(t.x - x, t.z - z) < radius + 1)) continue;
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
    const obstacles = boxIndex(mapColliders(this.map));
    for (let i = 0; i < 1900 * this.map.width * this.map.depth / (76 * 64); i++) {
      const x = (random() - .5) * this.map.width, z = (random() - .5) * this.map.depth;
      if (this.map.buildings.some(b => inside({ x, z }, b, 2.7)) || obstacles.some(x, z, .3, b => inside({ x, z }, b, .3))) continue;
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
        if(obstacles.some(x,z,.15,o=>inside({x,z},o,.15))||obstacles.some(x+dx,z+dz,.15,o=>inside({x:x+dx,z:z+dz},o,.15)))continue;
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

  // Only Balanced and up show the dense ground cover; Performance and Potato
  // show just the sparse seventh of it. Building the dense part anyway was over
  // a second of every low-end load (1.5 s of an 8 s load here) for geometry
  // those presets never draw. The random sequence is walked in full either way,
  // so the sparse patches land exactly where they always did, and a later
  // switch to a higher preset rebuilds the whole set identically.
  groundDetailsWanted(name) { return name === 'balanced' || isDemanding(name); }
  makeGroundDetails(full = this.groundDetailsWanted(this.initialQuality)) {
    const base = new THREE.Group(), extra = new THREE.Group(), sparse = new THREE.Group(); this.scene.add(base, extra, sparse);
    this.groundDetailsFull = full;
    const skipped = new THREE.Object3D(), place = (geometry, color, x, y, z, group) => group === sparse || full ? this.mesh(geometry, color, x, y, z, group) : skipped;
    this.performanceDetails=sparse;
    this.groundDetails = base; this.extraGroundDetails = extra;
    const random = randomGenerator(this.map.scenerySeed + 73), obstacles = boxIndex(mapColliders(this.map));
    // Shared, unit-sized templates scaled per piece, instead of a freshly built
    // geometry for every blade, seed head and pebble. Around ten thousand of
    // them used to be constructed here only to be merged and discarded at once.
    // The merge applies each piece's full transform, scale included, so the
    // result is the same geometry: a cone's vertices scale linearly with its
    // height and a polyhedron's with its radius, and normals go through the
    // normal matrix.
    const thinStem = new THREE.ConeGeometry(.035, 1, 3), wideStem = new THREE.ConeGeometry(.075, 1, 3);
    const seedHead = new THREE.SphereGeometry(.045, 5, 3), pebble = new THREE.DodecahedronGeometry(1);
    let patches = 0;
    for (let attempt = 0; attempt < 9000 && patches < Math.round(950 * this.map.width * this.map.depth / (76 * 64)); attempt++) {
      const x = (random() - .5) * this.map.width, z = (random() - .5) * this.map.depth;
      const road = this.roadEdges(z);
      if ((x > road.left - 1 && x < road.right + 1) || this.onSideRoad(x,z,1) || (this.map.crops || []).some(f => inside({ x, z }, f, .3)) || this.map.buildings.some(b => inside({ x, z }, b, 2.7)) ||
          obstacles.some(x, z, 1, b => inside({ x, z }, b, 1)) || this.map.targets.some(t => Math.hypot(t.x - x, t.z - z) < 2)) continue;
      patches++;
      const group = patches%7===0 ? sparse : patches <= Math.round(330 * this.map.width * this.map.depth / (76 * 64)) ? base : extra;
      const dry = patches % 5 !== 0, stems = dry ? 5 + Math.floor(random() * 5) : 6;
      for (let i = 0; i < stems; i++) {
        const angle = i / stems * Math.PI * 2 + random() * .4;
        const height = dry ? .22 + random() * .42 : .16 + random() * .18;
        const stem = place(dry ? thinStem : wideStem,
          dry ? i % 3 ? '#b8a167' : '#c9b577' : '#83856a',
          x + Math.cos(angle) * .12, height * .42, z + Math.sin(angle) * .12, group);
        stem.scale.y = height;
        stem.rotation.set(Math.sin(angle) * .45, angle, Math.cos(angle) * .45);
        if (dry && i % 3 === 0) {
          const head = place(seedHead, '#c9b577',
            x + Math.cos(angle) * .2, height * .9, z + Math.sin(angle) * .2, group);
          head.scale.set(.7, 1.8, .7);
        }
      }
      if (patches % 2 === 0) for (let i = 0; i < 3; i++) {
        const size = .07 + random() * .1;
        const stone = place(pebble, '#8c7a5c',
          x + (random() - .5) * 1.5, .05, z + (random() - .5) * 1.5, group);
        stone.scale.set(size, size * .45, size); stone.rotation.y = random() * 6;
      }
    }
    this.noShadows(base); this.noShadows(extra); this.noShadows(sparse);
    this.batch(base); this.batch(extra); this.batch(sparse);
    for (const root of [base, extra, sparse]) freezeTransforms(root);
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
    // Topped just under the eave: taller, they poked up through the roof as a
    // small block at each corner.
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) this.box(b.x + sx * b.w / 2, (b.height - .1) / 2, b.z + sz * b.d / 2, .26, b.height - .1, .26, '#967858');
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
      // Side walls are eave walls: the roof comes down to the wall top there, so
      // a lintel reaching it showed through the roof as a small plank.
      this.box(x, b.height - (horizontal ? .21 : .3), z, horizontal ? b.doorWidth : .4, .42, horizontal ? .4 : b.doorWidth, '#866c4f');
      if(!b.cargo)this.box(x + (horizontal ? 0 : sign * .65), .06, z + (horizontal ? -.65 : 0), horizontal ? 3.1 : 1.5, .12, horizontal ? 1.5 : 3.1, '#b39a76');
    }
    const roof = new THREE.Group(); this.scene.add(roof);
    const mainMat = new THREE.MeshStandardMaterial({ color: b.roofColor, roughness: 1, transparent: true });
    const trimMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(b.roofColor).multiplyScalar(.8), roughness: 1, transparent: true });
    const roofMaterials = [mainMat, trimMat, ...[.96, 1.025, 1.055].map(v => new THREE.MeshStandardMaterial({ color: new THREE.Color(b.roofColor).multiplyScalar(v), roughness: .95, transparent: true }))];
    const slope = Math.atan2(b.cargo ? .12 : .7, b.w / 2);
    // Wear, the same every game for a given building (seeded by its id): a few
    // missing shingles showing the dark underlayer, a few lifted ones, a nailed
    // board patch; on metal, rust patches and a lifted sheet. Drawn only with
    // the roof's own materials, so it costs no draw calls.
    let seed = 2166136261; for (const c of String(b.id)) seed = Math.imul(seed ^ c.charCodeAt(0), 16777619);
    const wear = () => { seed = Math.imul(seed ^ seed >>> 15, 2246822507) + 0x6d2b79f5 | 0; return ((seed ^ seed >>> 13) >>> 0) / 4294967296; };
    const worn = .5 + wear(); // some roofs are kept up better than others
    for (const side of [-1, 1]) {
      const panel = this.box(b.x + side * b.w / 4, b.height + .36, b.z, b.w / 2 + .65, .15, b.d + 1, mainMat, roof); panel.rotation.z = -side * slope;
      const width = b.w / 2 + .65, depth = b.d + 1;
      if (b.id === 'supplies' || b.metalRoof) {
        // Raised corrugations run down the pitch of the weathered metal roof.
        for (let z = -depth / 2 + .18; z < depth / 2; z += .45)
          this.box(0, .105, z, width, .045, .045, roofMaterials[3], panel);
        for (let i = 0, n = Math.round(worn * 2); i < n; i++) {
          const rust = this.box((wear() - .5) * (width - 1.2), .082, (wear() - .5) * (depth - 1.4), .5 + wear() * .7, .012, .4 + wear() * .6, trimMat, panel);
          rust.rotation.y = (wear() - .5) * .5;
        }
        if (wear() < .6 * worn) { // one sheet's end lifted by the wind
          const sheet = this.box((wear() > .5 ? 1 : -1) * (width / 2 - .45), .12, (wear() - .5) * (depth - 1.5), .9, .025, .95, roofMaterials[4], panel);
          sheet.rotation.z = side * .1;
        }
      } else {
        // Staggered wooden shingles have a shallow physical lip and muted tones.
        for (let row = 0, x = -width / 2; x < width / 2; row++, x += .57) {
          for (let z = -depth / 2 - (row % 2 ? .55 : 0), col = 0; z < depth / 2; z += 1.1, col++) {
            const low = Math.max(z, -depth / 2), high = Math.min(z + 1.1, depth / 2);
            const cx = x + Math.min(.57, width / 2 - x) / 2, cz = (low + high) / 2, w = Math.min(.57, width / 2 - x) - .012, d = high - low - .012;
            const roll = wear(), inside = w > .4 && d > .6; // never the cut ones along the edges
            if (inside && roll < .03 * worn) { this.box(cx, .082, cz, w - .04, .012, d - .06, trimMat, panel); continue; } // missing: the dark underlayer
            const tile = this.box(cx, .1, cz, w, .035, d, roofMaterials[2 + (row * 7 + col * 3 + col % 2) % 3], panel);
            if (inside && roll > 1 - .035 * worn) { tile.position.y = .12; tile.rotation.x = (wear() > .5 ? 1 : -1) * .09; } // lifted
          }
        }
        if (wear() < .7 * worn) { // a newer board nailed over a leak
          const patch = this.box((wear() - .5) * (width - 1.4), .128, (wear() - .5) * (depth - 1.6), .95 + wear() * .5, .03, .3, roofMaterials[4], panel);
          patch.rotation.y = (wear() - .5) * .35;
        }
      }
    }
    this.box(b.x, b.height + .8, b.z, .18, .12, b.d + 1.15, trimMat, roof);
    // Front fascia, tucked under the eave: it runs past the side walls, where the
    // pitched roof is lowest, and with its top above the wall its two ends
    // showed through the roof as a small block at each front corner.
    this.box(b.x, b.height - .36, b.z + b.d / 2 + .22, b.w + .4, .5, .22, '#9f805c');
    // Shingles and corrugations stand 3-4cm proud of the panel carrying them, and
    // that panel already casts the whole roof. Re-drawing every tile into the
    // shadow map is the single largest source of wasted casters per building.
    for (const layer of roof.children) for (const tile of layer.children) this.noShadows(tile);
    this.batch(roof, false);
    // One material per roof, with each shade (panel, trim, three shingle tones)
    // carried per vertex: the roof drew once per shade (about five draws a
    // building) and now draws twice (what casts shadows, and the shingles that
    // don't), with the same picture. The shades only ever differed in colour:
    // setQuality gives every roof material the same roughness and bump map.
    const roofMaterial = new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: 1, transparent: true });
    for (const casts of [true, false]) bakeColors(roof, { material: roofMaterial, pick: m => m.castShadow === casts });
    roofMaterials.forEach(m => m.dispose()); roofMaterials.length = 0; roofMaterials.push(roofMaterial);
    // Thin raised roof layers should not produce shadow-map striping on each other.
    roof.traverse(m => { if (m.isMesh) m.receiveShadow = false; });
    // Captured after the batch: these are the merged meshes that actually came
    // out as casters. The roof fade toggles exactly these, because traversing
    // the whole group undid the noShadows() above on the first frame and put
    // every shingle batch back into the shadow pass.
    const casters = [];
    roof.traverse(m => { if (m.isMesh && m.castShadow) casters.push(m); });
    // A lifted roof is drawn faint (see update). Blended, every place two roof
    // surfaces overlap (shingles on their panel, the two slopes meeting under
    // the ridge cap) was painted twice and showed as a brighter strip across
    // the room. So a faded roof first lays down only its depth (these copies,
    // drawn after every other see-through thing so effects under the roof are
    // not hidden), and its colour then lands on the nearest surface alone.
    const depthOnly = this.roofDepthMaterial ||= new THREE.MeshBasicMaterial({ colorWrite: false, transparent: true, depthWrite: true });
    const colour = [], prepass = [];
    roof.traverse(m => { if (m.isMesh) colour.push(m); });
    for (const m of colour) {
      const copy = m.clone(false); copy.material = depthOnly; copy.castShadow = copy.receiveShadow = false;
      copy.renderOrder = ROOF_PREPASS_ORDER; copy.visible = false; copy.userData.roofPrepass = true;
      m.parent.add(copy); prepass.push(copy);
    }
    // Where the roof reaches (eaves and porch roofs past the walls) and the
    // doorways: walking up to a door under a deep overhang (the big freight
    // hall and depot) used to vanish under the roof for a moment before the
    // player crossed the wall line and it faded.
    roof.updateMatrixWorld(true); const reach = new THREE.Box3().setFromObject(roof);
    const doors = buildingOpenings(b).filter(o => o.type !== 'window').map(o => ({ x: (o.a.x + o.b.x) / 2, z: (o.a.z + o.b.z) / 2, r: Math.max(1.6, Math.hypot(o.b.x - o.a.x, o.b.z - o.a.z) / 2 + 1.1) }));
    this.roofs.push({ ...b, group: roof, casters, materials: roofMaterials, colour, prepass, opacity: 1, reach, doors });
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
    // Merge the body into a few draws: legs, head and the rest each become one
    // mesh (death reactions still find them by deathPart). The gun and the
    // Static arm move and hide on their own, so they sit out the body merge;
    // the gun's solid parts merge among themselves.
    body.remove(gun, g.userData.staticArm); this.batch(body); body.add(g.userData.staticArm, gun);
    this.batch(gun);
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
      // Everything on the board moves together (the hit wobble moves the
      // board), so it is one draw instead of eight.
      this.batch(board);
      return g;
    }
    this.box(0, .47, 0, .13, .9, .13, '#907552', board);
    this.box(0, .1, 0, 1.1, .18, .65, '#a88d62', board);
    const face = new THREE.Group(); face.position.set(0, 1, 0); face.rotation.x = .6; board.add(face);
    this.cylinder(0, 0, 0, .6, .14, '#eee0bd', face, 20);
    this.cylinder(0, .08, 0, .41, .016, moving ? '#6e8880' : '#b87552', face, 20);
    this.cylinder(0, .096, 0, .27, .018, '#ede0bc', face, 20);
    this.cylinder(0, .109, 0, .13, .02, '#ab5438', face, 16);
    this.batch(board);
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
    // Built from many soft lobes of two tones, then combed with fine
    // wind-blown streaks, so a cloud has body and grain instead of one blur.
    const dustCanvas=document.createElement('canvas');dustCanvas.width=512;dustCanvas.height=256;
    const ctx=dustCanvas.getContext('2d');
    for(let i=0;i<46;i++){
      const x=70+rand()*372,y=70+rand()*116,r=14+rand()*58,light=i%3===0;
      const gradient=ctx.createRadialGradient(x,y,0,x,y,r);
      const tone=light?'232,214,172':'208,186,142';
      gradient.addColorStop(0,`rgba(${tone},${light?.32:.4})`);gradient.addColorStop(.5,`rgba(${tone},.14)`);gradient.addColorStop(1,`rgba(${tone},0)`);
      ctx.fillStyle=gradient;ctx.fillRect(x-r,y-r,r*2,r*2);
    }
    ctx.globalCompositeOperation='destination-out';
    for(let i=0;i<70;i++){const y=40+rand()*176,x=rand()*512;ctx.strokeStyle=`rgba(0,0,0,${.05+rand()*.08})`;ctx.lineWidth=1+rand()*3;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+40+rand()*120,y+(rand()-.5)*6);ctx.stroke();}
    ctx.globalCompositeOperation='source-over';
    const dustTexture=new THREE.CanvasTexture(dustCanvas);dustTexture.colorSpace=THREE.SRGBColorSpace;
    // Clear space around the player and where they aim: a cloud drifting over
    // either thins to nothing there, so weather never hides the fight.
    this.wispClear={player:{value:new THREE.Vector2()},aim:{value:new THREE.Vector2()}};
    // Each of these covers a fifth to a quarter of the screen, and they
    // overlap: three of them is roughly two thirds of a full-screen blended
    // pass, which is what the comment above was trying to avoid. On a tiler
    // every blended layer is a read-modify-write of the tile with no early
    // depth rejection, so the phone tiers get fewer of them and the scene fog
    // carries the haze instead.
    const wispGeometry=new THREE.PlaneGeometry(1,1);wispGeometry.rotateX(-Math.PI/2);
    this.dustWisps=Array.from({length:5},(_,i)=>{
      const material=new THREE.MeshBasicMaterial({map:dustTexture,transparent:true,opacity:0,depthWrite:false,depthTest:true});
      material.onBeforeCompile=shader=>{
        shader.uniforms.clearPlayer=this.wispClear.player;shader.uniforms.clearAim=this.wispClear.aim;
        shader.vertexShader='varying vec2 vWispWorld;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvWispWorld=(modelMatrix*vec4(transformed,1.0)).xz;');
        shader.fragmentShader='uniform vec2 clearPlayer; uniform vec2 clearAim; varying vec2 vWispWorld;\n'+shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
          diffuseColor.a*=smoothstep(2.2,5.5,distance(vWispWorld,clearPlayer))*smoothstep(1.2,3.6,distance(vWispWorld,clearAim));`);
      };
      material.customProgramCacheKey=()=>'dust-wisp';
      const wisp=new THREE.Mesh(wispGeometry,material);wisp.renderOrder=5;
      wisp.scale.set(15+(i%3)*3,1,7+(i%3));this.resetDustWisp(wisp,i%3);this.scene.add(wisp);return wisp;
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
      phase:Math.random()*Math.PI*2,height:1.2+Math.random()*1.4};
    wisp.rotation.y=(Math.random()-.5)*.25;
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
    const wisps = this.qualityName === 'performance' ? 1 : this.qualityName === 'balanced' ? 2 : this.qualityName === 'extreme' ? 5 : 3;
    this.wispClear.player.value.set(sim.player.x, sim.player.z);
    this.wispClear.aim.value.set(sim.player.aimPointX ?? sim.player.x, sim.player.aimPointZ ?? sim.player.z);
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
    // Extreme: a dust devil now and then, crossing the open ground downwind.
    this.dustDevils ||= new DustDevils(this.fx);
    this.dustDevils.update(dt, this.qualityName === 'extreme' && !sim.interior,
      { x: this.focus.x, z: this.focus.z, halfWidth, halfDepth: halfHeight },
      (x, z) => sim.colliders.some(b => inside({ x, z }, b, .8)), (x, z) => this.kickedDustColor(x, z));
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
  // One tiny stand-in per material the view holds that no visible object is
  // using yet, plus the kinds of material a blast and a thrown grenade create
  // on the spot, each also in its indoor-clipped variant (see warmPrograms).
  warmRack() {
    const rack = new THREE.Group(), used = new Set(), found = new Set(), seen = new Set();
    this.scene.traverse(o => { for (const m of [].concat(o.material || [])) used.add(m); }); // hidden ones too: the warm draw shows them
    const skip = new Set(['scene', 'renderer', 'camera', 'lastSim', 'map', 'view', 'parent', 'sim']);
    const visit = (value, depth) => {
      if (!value || typeof value !== 'object' || seen.has(value) || depth > 3) return;
      seen.add(value);
      // Shadow-pass materials (depth, distance) are not drawn as surfaces.
      if (value.isMaterial) { if (!used.has(value) && !value.isMeshDistanceMaterial && !value.isMeshDepthMaterial) found.add(value); return; }
      if (value.isObject3D || value.isTexture || value.isBufferGeometry || ArrayBuffer.isView(value) || value instanceof Node) return;
      if (value instanceof Map || value instanceof Set) { for (const v of value.values()) visit(v, depth + 1); return; }
      if (Array.isArray(value)) { if (value.length <= 64) for (const v of value) visit(v, depth + 1); return; }
      for (const key of Object.keys(value)) if (!skip.has(key)) visit(value[key], depth + 1);
    };
    visit(this, 0);
    const Smoke = isDemanding(this.qualityName) ? THREE.MeshStandardMaterial : THREE.MeshBasicMaterial;
    const adHoc = [
      new THREE.MeshBasicMaterial({ transparent: true, side: THREE.DoubleSide, depthWrite: false }),
      new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false }),
      new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
      new Smoke({ transparent: true, depthWrite: false }),
      new THREE.MeshLambertMaterial({ flatShading: true }),
      new THREE.MeshLambertMaterial(),
    ];
    const geometry = this.warmGeometry ||= new THREE.BoxGeometry(.01, .01, .01);
    const add = (material, clone) => {
      const object = material.isLineBasicMaterial ? new THREE.LineSegments(geometry, material)
        : material.isPointsMaterial ? new THREE.Points(geometry, material)
        : material.isSpriteMaterial ? new THREE.Sprite(material) : new THREE.Mesh(geometry, material);
      object.frustumCulled = false; object.userData.warmClone = clone; rack.add(object);
      return object;
    };
    // A shader that samples a render target can't be cloned (three drops the
    // texture and warns); those are full-screen passes, never indoors, so
    // they skip the indoor copy.
    const samplesTarget = m => m.isShaderMaterial && Object.values(m.uniforms || {}).some(u => u?.value?.isRenderTargetTexture);
    for (const material of [...found, ...adHoc]) {
      add(material, adHoc.includes(material));
      if (samplesTarget(material)) continue;
      const indoor = add(material.clone(), true);
      this.interiorVisibility.apply(indoor);
    }
    return rack;
  }

  // The ground is drawn after the buildings, props and characters that stand on
  // it, and its layers from the top down (the map's own ground before the wide
  // slab under it, roads before the ground they lie on). A GPU then skips every
  // ground pixel something already covers, instead of shading the full ground
  // shader there and throwing it away: under the map ground the whole slab was
  // shaded twice. Surface marks (-1) and crops (-2) still draw before it and
  // sand marks (1) after, as they always did; the picture is unchanged.
  orderGround() {
    const box = new THREE.Box3();
    const layers = [];
    this.scene.traverse(o => { if (o.isMesh && [].concat(o.material).some(m => this.groundMaterials.has(m))) layers.push({ o, top: box.setFromObject(o).max.y }); });
    layers.sort((a, b) => b.top - a.top).forEach((layer, i) => { layer.o.renderOrder = .5 + i * .45 / Math.max(1, layers.length); });
  }

  warmPrograms() {
    // Everything drawFrame gives the indoor-clipped shader, given it now.
    for (const group of this.particlePool || []) this.interiorVisibility.apply(group);
    for (const object of this.electric?.arcs.objects || []) this.interiorVisibility.apply(object);
    for (const object of this.electric?.pulseParts?.() || []) this.interiorVisibility.apply(object);
    // The detail-effect pools sit hidden until something happens, and compile
    // only compiles what is visible: shown for the warm-up, so the first
    // grenade or gunshot does not stop the game for a second to build shaders.
    const fxMeshes = this.fx?.meshes || [];
    for (const mesh of fxMeshes) { this.interiorVisibility.apply(mesh); mesh.visible = true; }
    // On Extreme the scene is drawn into the composer's (linear) render target,
    // not the (sRGB) canvas, and the output colour space is part of every
    // shader: warming for the canvas left each effect to rebuild on first use.
    const target = this.post && this.qualityName === 'extreme' ? this.post.composer.readBuffer : null;
    // Drawn once, not only compiled: a shader's first draw is where the driver
    // is made to finish it (and where the shadow pass builds its depth
    // variants), so that happens here, while loading, instead of on the first
    // shot. The next frame draws over it.
    const compile = () => {
      const previous = this.renderer.getRenderTarget();
      // For that one draw everything in the scene is shown, hidden things too
      // (a pooled effect waiting for its first use, the grenade in the hand),
      // and nothing is culled, but the draw is clipped to a single pixel.
      const restore = [];
      // Lights keep their state: how many there are is part of every shader.
      this.scene.traverse(o => { if (o.isLight) return; restore.push(o, o.visible, o.frustumCulled); o.visible = true; o.frustumCulled = false; });
      try {
        this.renderer.setRenderTarget(target); this.renderer.compile(this.scene, this.camera);
        this.renderer.setScissorTest(true); this.renderer.setScissor(0, 0, 1, 1);
        this.drawEmpty = true; this.renderer.render(this.scene, this.camera);
        // Extreme's AO draws the scene again with its normals material, whose
        // variants (instanced or not, and so on) follow each object: an effect
        // pool first drawn mid-fight built one there (the first Static X).
        const ao = this.post?.ao;
        if (ao?.normalMaterial && ao.normalRenderTarget) {
          this.renderer.setRenderTarget(ao.normalRenderTarget); this.scene.overrideMaterial = ao.normalMaterial;
          // With the pass's own exclusions (it hides the lights, lines and
          // points for its draw, and the light count is in every program key).
          ao._overrideVisibility();
          try { this.renderer.render(this.scene, this.camera); }
          finally { this.scene.overrideMaterial = null; ao._restoreVisibility(); }
        }
      }
      catch (error) { if (import.meta.env?.DEV) console.warn("warm-up", error); /* A warm-up failure is not a reason to refuse to start. */ }
      finally {
        this.drawEmpty = false; this.renderer.setScissorTest(false); this.renderer.setRenderTarget(previous);
        for (let i = 0; i < restore.length; i += 3) { restore[i].visible = restore[i + 1]; restore[i].frustumCulled = restore[i + 2]; }
      }
    };
    // Materials that only reach the screen once something happens (an orb's
    // trail and arcs, a grenade in flight, a blast's ring, fire and smoke, a
    // scorch mark) each needed a shader built mid-fight: a visible hitch on
    // the first orb, the first grenade, the first blast. A rack of tiny
    // stand-ins carrying each of them is compiled with the scene and removed.
    const rack = this.warmRack();
    // The pooled Static X pulse parts, built and drawn now, not on the first pulse.
    const pulses = [...(this.electric?.prewarm?.() || []), ...this.prewarmBlasts()];
    for (const mesh of pulses) { this.interiorVisibility.apply(mesh); rack.add(mesh); }
    this.scene.add(rack);
    compile();
    this.scene.remove(rack);
    for (const mesh of pulses) rack.remove(mesh);
    // The stand-ins' materials are kept (not disposed): disposing the last
    // user of a program destroys it, and the real effect would build it again.
    for (const old of this.warmKept || []) old.dispose();
    this.warmKept = rack.children.filter(c => c.userData.warmClone).map(c => c.material);
    for (const mesh of fxMeshes) mesh.visible = mesh.count > 0;
    const roofMaterials = this.roofs.flatMap(r => r.materials);
    if (!roofMaterials.length) return;
    for (const m of roofMaterials) m.transparent = true;
    compile();
    // Put them back and have three re-pick the opaque shader, rather than leave
    // them holding the transparent one the second compile just attached.
    for (const m of roofMaterials) { m.transparent = false; m.needsUpdate = true; }
    for (const roof of this.roofs) roof.blended = false;
  }

  resize() {
    this.cachedRect = null;
    const w = viewWidth(), h = viewHeight();
    // One drawing-buffer allocation, not two: setPixelRatio followed by
    // setSize reallocates the canvas twice, a visible hitch on a phone each
    // time the adaptive resolution steps.
    const base = renderPixelRatio(this.quality,devicePixelRatio,w,h), ratio = base*(this.resolutionScale||1);
    // Setting a canvas's size clears and reallocates it even when nothing
    // changed, so an unchanged buffer is left alone.
    const buffer = (bw, bh, r) => { const key = bw + 'x' + bh + '@' + r; if (key !== this.bufferKey) { this.bufferKey = key; this.renderer.setDrawingBufferSize(bw, bh, r); } };
    if (this.crisp) {
      // The world at the tier's internal size, the screen at the crisp
      // output size; adaptive resolution moves only the internal one, and
      // only by drawing into less of the buffer (CrispOutput.setScale).
      const output = this.crisp.outputRatio(this.crispSpec, devicePixelRatio, w, h);
      buffer(w, h, output);
      this.crisp.scale = this.resolutionScale || 1;
      this.crisp.setSize(this.crispSpec, w, h, base, output);
    } else buffer(w, h, ratio);
    this.canvas.style.width = w + 'px'; this.canvas.style.height = h + 'px';
    this.camera.aspect = w / h;
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

  // Adaptive resolution. Resizing the drawing buffer clears the canvas, so it
  // is never done between a draw and the screen showing it (that showed a
  // blank, page-coloured frame every time the resolution stepped): the new
  // size is applied at the start of the next render(), right before drawing.
  setResolutionScale(scale){
    if(Math.abs((this.pendingScale??this.resolutionScale??1)-scale)<.001)return;
    this.pendingScale=scale;
  }

  // Still short of the frame-rate target at the lowest render scale: ease the
  // costliest extras (shadow redraw rate; Extreme's AO and bloom sizes).
  setStrain(on){
    this.strained=!!on;
    this.post?.setLight(!!on);
  }

  // Frame pacing for low input lag. When the GPU falls behind, browsers queue
  // frames, and each queued frame is input you see late (at 20 fps, two queued
  // frames are 100 ms). A fence after each frame says when the GPU has finished
  // it; while the previous frame is still being drawn, main.js skips drawing
  // this one (the game keeps running and reading input), so the next frame is
  // drawn from fresher input instead of waiting in a queue. Never waits more
  // than FENCE_PATIENCE, and does nothing without WebGL 2 fences.
  gpuBusy(){
    const fence=this.frameFence;if(!fence)return false;
    const gl=this.renderer.getContext();
    if(gl.isContextLost()){this.frameFence=null;return false;}
    const status=gl.clientWaitSync(fence,0,0);
    if(status===gl.TIMEOUT_EXPIRED&&performance.now()-this.fenceAt<FENCE_PATIENCE)return true;
    gl.deleteSync(fence);this.frameFence=null;return false;
  }
  fenceFrame(){
    const gl=this.renderer.getContext();
    if(!this.lowLatency||typeof gl.fenceSync!=='function'||gl.isContextLost())return;
    if(this.frameFence)gl.deleteSync(this.frameFence);
    this.frameFence=gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE,0);this.fenceAt=performance.now();
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
    return { x: (p.x * .5 + .5) * viewWidth(), y: (-p.y * .5 + .5) * viewHeight() };
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

  // A gunshot lights its surroundings for a few hundredths of a second, using
  // the effects light every tier with lights already has (so no new shader
  // variants and no cost when idle). Warm, like the powder flash.
  muzzleLight(reach, level, shooter = this.lastSim?.player) {
    const p = shooter; if (!p) return;
    this.fxLight.color.set('#ffb766'); this.fxLight.position.set(p.x + p.aimX * reach, 1.05, p.z + p.aimZ * reach);
    this.fxLightLevel = Math.max(this.fxLightLevel, level);
  }

  // An event from another player's gun or body (multiplayer). The handlers
  // below assume the shooter is you (muzzle flashes at your gun, trails from
  // your muzzle), so for the length of the call the shooter stands in for you.
  // Orb ids are made unique per player (projectiles.js), and so are the beam
  // ids of their launches and trails.
  netEvent(e, shooter, slot = 0) {
    if (!shooter) shooter = { x: e.x ?? 0, z: e.z ?? 0, aimX: 1, aimZ: 0 };
    const base = (slot + 1) * 1e6;
    // Their stain, one per player (the slot), like yours below.
    if (e.type === 'playerDeath') {
      this.blood.add(e.x, e.z, e.directionX, e.directionZ, 'slot' + slot); this.burst(e.x, e.z, 34, 'kill'); this.fx.impact?.(e.x, e.z, this.kickedDustColor(e.x, e.z));
      // Their body, like yours: one per player (remote-corpses.js).
      this.remote ||= new RemotePlayers(this); (this.remoteCorpses ||= new RemoteCorpses(this)).add(e, slot, e.weapon);
      return;
    }
    if (['grenadeThrow', 'shotgunReload', 'rifleReloaded', 'playerDamage', 'outgoingDamage', 'sprayStart'].includes(e.type)) return;
    if (e.type === 'rifleShot') {
      this.muzzleLight(1.15, 5, shooter); // at their gun, not yours
      this.fx.muzzle('rifle', shooter.x + shooter.aimX * (RIFLE_MUZZLE.forward + .12) - shooter.aimZ * RIFLE_MUZZLE.lateral, .76, shooter.z + shooter.aimZ * (RIFLE_MUZZLE.forward + .12) + shooter.aimX * RIFLE_MUZZLE.lateral, shooter.aimX, shooter.aimZ);
      return;
    }
    if (e.type === 'shotgunShot') { this.muzzleLight(1.1, 10 + (e.charge || 0) * 10, shooter); this.fx.muzzle('ballast', e.x, .77, e.z, shooter.aimX, shooter.aimZ, e.charge || 0); return; }
    if (e.type === 'launch') e = { ...e, paths: (e.paths || []).map(p => ({ ...p, id: base + p.id })) };
    if (e.type === 'trailEnd') e = { ...e, id: base + e.id };
    // Another player's gun gets its own muzzle point, one per slot. It used to
    // borrow this player's (staticMuzzle) for the event and put it back after,
    // but a stream's arcs keep a reference to their muzzle and are drawn for a
    // few frames: once it was put back they all hung off this player's gun, a
    // white bolt from your own muzzle to wherever the other player's stream
    // (or hex, or shot) was. Their own point is refreshed by each event, and
    // the stream reports every tick, so their arcs follow their gun.
    const muzzle = (this.netMuzzles ||= new Map()).get(slot) || new THREE.Vector3();
    this.netMuzzles.set(slot, muzzle.set(shooter.x + shooter.aimX * .95 + shooter.aimZ * .25, .76, shooter.z + shooter.aimZ * .95 - shooter.aimX * .25));
    const savedSim = this.lastSim;
    this.lastSim = Object.assign(Object.create(savedSim || {}), { player: { ...shooter, dodgeX: shooter.vx || 0, dodgeZ: shooter.vz || 0 } });
    this.eventMuzzle = muzzle;
    try { this.event(e); } finally { this.lastSim = savedSim; this.eventMuzzle = null; }
  }

  event(e) {
    // Your body and your stain from the last death stay; the ones before go
    // (DeathView.start clears the old body, the blood keeps one per player).
    if(e.type==='playerDeath'){this.blood.add(e.x,e.z,e.directionX,e.directionZ,'you');this.deathView??=new DeathView(this);this.deathView.start(e);return;}
    if(e.type==='grenadeExplosion'){this.explosion(e);return;}
    if(e.type==='grenadeThrow'){this.grenadeView?.thrown(e);}
    if(e.type==='shotgunShot'){this.muzzleLight(1.1,14+(e.charge||0)*14);const p=this.lastSim?.player;if(p)this.fx.muzzle('ballast',e.x,.77,e.z,p.aimX,p.aimZ,e.charge||0);}
    if(e.type==='shotgunShot'||e.type==='shotgunReload'){this.shotgunView?.event(e);return;}
    if(e.type==='rifleImpact'){this.burst(e.x,e.z,(RIFLE_QUALITY[this.qualityName]||RIFLE_QUALITY.balanced).impact,'hit');this.fx.impact(e.x,e.z,this.kickedDustColor(e.x,e.z));return;}
    if(e.type==='rifleShot'){
      this.muzzleLight(1.15,7);
      const p=this.lastSim?.player;
      if(p)this.fx.muzzle('rifle',p.x+p.aimX*(RIFLE_MUZZLE.forward+.12)-p.aimZ*RIFLE_MUZZLE.lateral,.76,p.z+p.aimZ*(RIFLE_MUZZLE.forward+.12)+p.aimX*RIFLE_MUZZLE.lateral,p.aimX,p.aimZ);
      this.rifleView?.shot(e);return;
    }
    if(e.electric&&['hit','kill','playerHit'].includes(e.type))this.electric.aftershock(e);
    if (e.type === 'cropDust' || e.type === 'cropAsh') {
      for (let i = 0; i < 12; i++) {
        const x = e.x + (Math.random() - .5) * e.w, z = e.z + (Math.random() - .5) * e.d;
        this.burst(x, z, e.type === 'cropDust' ? 6 : 2, 'dust');
        if (e.type === 'cropDust') this.burst(x, z, 3, 'kill');
      }
    }
    const muzzle = this.eventMuzzle || this.staticMuzzle;
    if (e.type === 'sprayArc') {
      // Where the stream's arcs land, it spits sparks and flashes; the muzzle
      // flickers with it. Throttled, since the stream reports every tick.
      this.streamClock = (this.streamClock ?? 0) - RULES.step;
      if (e.firing && this.streamClock <= 0 && e.paths.length) {
        this.streamClock = .045;
        for (let i = 0; i < 2; i++) {
          const path = e.paths[Math.floor(Math.random() * e.paths.length)];
          this.fx.electric(path.b.x, path.b.y ?? .76, path.b.z, .55 + Math.random() * .4, { ring: Math.random() < .3 });
        }
        this.fx.glow({ x: muzzle.x, y: muzzle.y, z: muzzle.z, size: .7, life: .06, color: STREAM_GLOW, glow: 1.3, flicker: 1 });
      }
      // The arcs keep this point and follow it while they are drawn: this
      // player's live gun, or the other player's own point (netEvent).
      const paths=e.paths.map(path=>({...path,a:muzzle}));
      this.electric.event({...e,paths}, this.lastSim?.colliders || []);
      this.fxLight.color.set('#9cdfff'); this.fxLight.position.copy(muzzle); this.fxLightLevel = e.firing ? 12 : 3;
    }
    if (e.type === 'hexPulse') this.fx.hexPulse(e.nodes);
    if (e.type === 'hexZap') this.fx.electric(e.b.x, .75, e.b.z, 1);
    if (e.type === 'hexFizzle') this.fx.electric(e.x, .75, e.z, .7);
    if (e.type.startsWith('hex')) { this.electric.event(e); if (e.type === 'hexPulse') { this.shake = Math.max(this.shake, .2); this.fxLight.color.set('#b8ecff'); this.fxLight.position.set(e.nodes[0].originX, 1.3, e.nodes[0].originZ); this.fxLightLevel = 35; } }
    if (e.type === 'dodge') {
      this.burst(e.x, e.z, 12 * (FOOTFALL_PARTICLES[this.qualityName] ?? 1), 'dust', this.kickedDustColor(e.x, e.z));
      const p = this.lastSim?.player;
      this.fx.grit(e.x, e.z, this.kickedDustColor(e.x, e.z), p?.dodgeX ?? 0, p?.dodgeZ ?? 0, 3);
      this.dustTrail.dashStart();
    }
    if (e.type === 'impactMark') this.surfaceMarks.enqueue('bullet',e);
    if (e.type === 'seed') this.burst(e.x, e.z, 2, 'hit');
    if (e.type === 'launch') {
      this.burst(e.x, e.z, 9, 'dust');
      // An orb still sitting at the gun leaves from the muzzle. The gun is
      // carried off to one side, so a trail drawn from the launch point comes
      // out of the player's chest; orbs parked out in the world keep theirs.
      const atGun = path => Math.hypot(path.x - e.x, path.z - e.z) <= 1.15 && muzzle.lengthSq() > 0;
      for (const path of e.paths) this.addBeam(atGun(path) ? { ...path, x: muzzle.x, z: muzzle.z } : path, .016 + e.count * .0007);
      if (muzzle.lengthSq() > 0) this.fx.electric(muzzle.x, muzzle.y, muzzle.z, .6 + Math.min(1, e.count / 12), { ring: false });
      this.fxLight.color.set('#9bffe1'); this.fxLight.position.set(e.x, 1.2, e.z); this.fxLightLevel = 8 + e.count * 1.5;
    }
    if (e.type === 'pointImpact') { this.burst(e.x, e.z, 6 * this.impactDetail, 'hit'); this.fx.electric(e.x, .72, e.z, .8); }
    if (e.type === 'explosion') this.electric.event({ type: 'convergence', x: e.x, z: e.z, radius: e.radius * .6 });
    if (e.type === 'propHit') this.burst(e.x, e.z, 6 * this.impactDetail, 'dust');
    // The host reset the map: blood, scorch and bullet marks, bodies and
    // lingering effects go (props come back through their own propRestore).
    if (e.type === 'mapReset') this.clearDebris();
    if (e.type === 'propRestore') {
      const g = this.props.get(e.id);
      if (g) { g.userData.baseScale ??= g.scale.clone(); g.userData.popIn = PROP_POP; g.visible = true; }
      if (!e.quiet) this.burst(e.x, e.z, 5 * this.impactDetail, 'dust', this.kickedDustColor(e.x, e.z));
    }
    if (e.type === 'propBreak') {
      const prop = this.props.get(e.id); if (prop) prop.visible = false;
      this.drops?.dropProp(e.id); // its blood goes with it
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
      // A player shot bleeds (not Static's stream or single orbs: electric):
      // the blood takes the place of the pale hit burst.
      } else if (e.targetKind === 'player' && !e.electric) { this.bleed(e); if (e.type === 'kill') this.burst(e.x, e.z, 34, 'kill'); }
      else this.burst(e.x, e.z, e.type === 'kill' ? 34 : 9, e.type);
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

  // Off with the blood: a respawn, a restart.
  cleanPlayer() { this.wading?.reset(); this.player.userData.bloodStains?.set(0); this.gunStains?.set(0); }

  // Blood on the ground that can be walked through: death stains (not wall
  // splats or fading ones), bodies and an explosion's pool.
  poolsOnGround() {
    const out = this.poolList ||= []; out.length = 0;
    for (const splat of this.blood?.splats || []) if (!splat.leaving && !splat.wall) out.push({ x: splat.mesh.position.x, z: splat.mesh.position.z, r: splat.mesh.userData.size * .28 });
    const d = this.deathView; if (d?.event && (d.corpse || d.pool)) out.push({ x: d.event.x, z: d.event.z, r: d.pool ? 1 : .6 });
    for (const entry of this.remoteCorpses?.bodies.values() || []) out.push({ x: entry.x, z: entry.z, r: .6 });
    return out;
  }

  // Blood from a shot player: a spray in the air along the shot and drops
  // that stain the floor, walls and crates (blood-drops.js). Bullets build up:
  // each hit on the same player within BLEED.window bleeds more than the last;
  // a blast bleeds a lot at once. Several pellets in one tick share one burst.
  bleed(e) {
    const now = this.effectTime ?? 0, key = e.id ?? '?', record = (this.bleeds ||= new Map()).get(key);
    const same = record && now - record.at < 1e-3, streak = record && now - record.at < BLEED.window ? record.streak + (same ? .1 : 1) : 0;
    this.bleeds.set(key, { streak, at: now });
    let amount = Math.min(BLEED.max, 1 + streak * BLEED.step) * Math.max(.5, Math.min(1.6, (e.damage || 25) / 35));
    if (e.blast) amount *= BLEED.blast;
    if (same) amount *= .3;
    const dx = e.directionX || 0, dz = e.directionZ || 0, length = Math.hypot(dx, dz) || 1;
    const count = Math.round((2 + 4 * amount) * this.quality.effects), colour = this.bloodColour ||= new THREE.Color('#8a1019');
    for (let i = 0; i < count && this.particles.length < this.quality.particleCap; i++) {
      const push = 1.2 + Math.random() * 3, life = .25 + Math.random() * .35, side = (Math.random() - .5) * 1.6;
      this.particles.push({ x: e.x, y: .75 + Math.random() * .2, z: e.z, vx: dx / length * push - dz / length * side, vz: dz / length * push + dx / length * side, vy: .4 + Math.random() * 1.6,
        life, maxLife: life, size: .025 + Math.random() * .045, material: 7, tint: colour.clone().multiplyScalar(.8 + Math.random() * .5), angle: Math.random() * Math.PI * 2 });
    }
    (this.drops ||= new BloodDrops(this)).splash(e.x, e.z, dx, dz, amount, this.lastSim?.colliders, this.map);
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
    const count = Math.round((plant ? 9 : little ? 7 : 14) * (dashed ? 1.7 : 1) * (this.qualityName === 'extreme' ? 3.2 : isDemanding(this.qualityName) ? 2.5 : .5 + this.quality.effects * .5));
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
    // Orb blasts grow one step per landed orb (orbBlastScale); grenades stay full size.
    const look = e.type === 'explosion' ? orbBlastScale(e.count) : 1;
    this.fx.explosion(e.x, e.z, e.radius, e.count || 6, this.kickedDustColor(e.x, e.z), look);
    // A blast's ring, core, puffs and four materials come from a pool
    // (takeBlastKit): an orb volley used to build a hundred meshes and six
    // materials on the frame it landed, each material a fresh program lookup
    // and interior patch, and throw them all away 1.8 s later.
    const kit = this.takeBlastKit(), { ring, core } = kit;
    ring.material.opacity = .9; ring.rotation.x = -Math.PI / 2; ring.position.set(e.x, .09, e.z); ring.scale.setScalar(.1); this.scene.add(ring);
    core.material.opacity = 1; core.visible = true;
    core.position.set(e.x, .7, e.z); core.scale.setScalar(e.radius * .4); core.renderOrder = 1; this.scene.add(core);
    // Keep the readable fireball on every preset; quality adds extra rolling lobes.
    const count = Math.min(this.qualityName==='extreme'?48:isDemanding(this.qualityName)?36:20,Math.max(4, Math.round(4 + e.count * .55 * this.quality.effects)));
    // Every puff in a blast fades on the same curve (only position and scale
    // differ), so the blast has four materials, not two per puff.
    const smoke = [];
    for (let i = 0; i < count; i++) {
      const lane = i % 2;
      const puff = kit.puffs[i] ||= { mesh: new THREE.Mesh(this.smokeGeo, kit.materials[lane]), flame: new THREE.Mesh(this.smokeGeo, kit.materials[lane + 2]) };
      const angle = i / count * Math.PI * 2 + Math.random() * .4;
      for (const part of [puff.mesh, puff.flame]) {
        part.position.set(e.x, .3, e.z); part.scale.setScalar(.08); part.visible = true;
        part.rotation.set(Math.random() * 3, Math.random() * 6, Math.random() * 3); this.scene.add(part);
      }
      puff.dx = Math.cos(angle); puff.dz = Math.sin(angle); puff.size = .3 + Math.random() * .16;
      smoke.push(puff);
    }
    this.blasts.push({ x: e.x, z: e.z, radius: e.radius, ring, core, smoke, kit, materials: kit.materials, age: 0 });
    this.burst(e.x, e.z, Math.max(3, Math.round((isDemanding(this.qualityName) ? 25 + e.count * 7 : 5 + e.count * 2) * Math.min(1, look))), 'hit');
    this.shake = Math.max(this.shake, Math.min(1.1,.15 + e.count * .045)); this.shakeDecay = 8;
    this.fxLight.color.set('#ff9e42'); this.fxLight.position.set(e.x, 1.5, e.z); this.fxLightLevel = Math.min(120,(15 + e.count * 4) * Math.min(1, .5 + .5 * look));
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

  // A pooled blast: ring, core, four puff materials and the puffs made so
  // far. The smoke material's kind follows the preset, so a preset change
  // empties the pool.
  takeBlastKit() {
    const Smoke = isDemanding(this.qualityName) ? THREE.MeshStandardMaterial : THREE.MeshBasicMaterial;
    if (this.blastKitKind !== Smoke) { for (const kit of this.blastKits || []) this.freeBlastKit(kit); this.blastKits = []; this.blastKitKind = Smoke; }
    const kit = this.blastKits.pop();
    if (kit) return kit;
    // One ring geometry for the lifetime of the view.
    this.blastRingGeo ||= new THREE.RingGeometry(.88, 1, 40);
    return {
      kind: Smoke,
      ring: new THREE.Mesh(this.blastRingGeo, new THREE.MeshBasicMaterial({ color: '#ffe2a0', transparent: true, opacity: .9, side: THREE.DoubleSide, depthWrite: false })),
      core: new THREE.Mesh(this.smokeGeo, new THREE.MeshBasicMaterial({ color: '#fff3c3', transparent: true, opacity: 1, depthWrite: false, toneMapped: false })),
      materials: [...['#484640', '#81786b'].map(color => new Smoke({ color, transparent: true, opacity: .65, depthWrite: false })),
        ...['#ffbd42', '#ff731b'].map(color => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1, depthWrite: false, toneMapped: false }))],
      puffs: [],
    };
  }
  freeBlastKit(kit) { kit.ring.material.dispose(); kit.core.material.dispose(); for (const m of kit.materials) m.dispose(); }
  // Two kits built (and drawn by the warm-up) before play; their meshes.
  prewarmBlasts() {
    const kits = [this.takeBlastKit(), this.takeBlastKit()];
    for (const kit of kits) for (let i = 0; i < 2; i++) kit.puffs[i] ||= { mesh: new THREE.Mesh(this.smokeGeo, kit.materials[i]), flame: new THREE.Mesh(this.smokeGeo, kit.materials[i + 2]) };
    this.blastKits.push(...kits);
    return kits.flatMap(kit => [kit.ring, kit.core, ...kit.puffs.flatMap(p => [p.mesh, p.flame])]);
  }

  disposeBlast(b) {
    // Everything goes back to the pool (a handful of kits kept); the ring
    // geometry is shared and outlives every blast.
    b.ring.removeFromParent(); b.core.removeFromParent();
    for (const p of b.kit.puffs) { p.mesh.removeFromParent(); p.flame.removeFromParent(); }
    if (b.kit.kind === this.blastKitKind && this.blastKits.length < 8) this.blastKits.push(b.kit); else this.freeBlastKit(b.kit);
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
      for (const [mesh, scale] of [[b.core, 1], [b.halo, this.qualityName === 'extreme' ? 11 : isDemanding(this.qualityName) ? 9 : 5]]) {
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
    if (this.qualityName === 'extreme') tickExtremeSurfaces(elapsed);
    const p = sim.player, speed = Math.hypot(p.vx, p.vz);
    const renderX = lerp(previousPlayer.x, p.x, alpha), renderZ = lerp(previousPlayer.z, p.z, alpha);
    this.player.position.set(renderX, 0, renderZ);
    // Dev "remove my player" hides the body (the death view hides it too, so
    // only give it back when no death is playing).
    // Online, a player on the weapon menu (or down after their death has
    // played out) has no body in the world either.
    const ghost = !!sim.dev?.ghost || (sim.player.dead && !this.deathView?.active);
    if (ghost) this.player.visible = false; else if (!this.deathView?.active) this.player.visible = true;
    this.updateFootprints(sim, dt, active && !ghost, renderX, renderZ);
    // Walking through blood: stains on you, then red prints for a few steps.
    // You respawn clean (your body keeps the blood it died with: the corpse
    // copied the stains when you fell).
    this.bloodSources = this.poolsOnGround();
    if (sim.player.dead) this.wasDead = true;
    else {
      if (this.wasDead) { this.wasDead = false; this.cleanPlayer(); }
      if (active && !ghost) {
        const level = this.wading.update(renderX, renderZ, p.vx, p.vz, dt, this.bloodSources, this.drops ||= new BloodDrops(this), this.map);
        this.player.userData.bloodStains.set(level);
        // The gun in the hand gets it too (rebuilt for each weapon held).
        const gun = this.player.userData.gun;
        if (level > 0 && this.gunStains?.key !== sim.weapon) { this.gunStains?.dispose(); this.gunStains = makeGunStains(gun, sim.weapon); }
        this.gunStains?.set(level);
      }
    }
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
    this.deathView?.update(dt); this.remoteCorpses?.update(dt);
    if(sim.weapon==='static')this.updateStaticCrackle(elapsed);
    // Shared live endpoint keeps short-lived stream arcs attached during recoil and aiming.
    this.staticMuzzle.set(0,0,-.333);
    this.player.userData.gun.localToWorld(this.staticMuzzle);
    const cameraRate = this.motion ? 5.7 : 16;
    const cut = this.cameraCut; this.cameraCut = false;
    const cameraRoom = sim.interior, blend = cut ? 1 : 1 - Math.exp(-cameraRate * dt);
    const deathCamera=this.deathView?.active?this.deathView.cameraFrame(this.camera.aspect):null;
    // Online weapon pick: straight down on the pick spot from high above
    // (setPickView), before the death or room camera.
    const pick = this.pickCamera;
    if (pick) { this.focus.x = pick.x; this.focus.z = pick.z; this.cameraHeight = pick.height; }
    else {
    this.focus.x = deathCamera?deathCamera.x:lerp(this.focus.x, cameraRoom && !cameraRoom.followCamera ? cameraRoom.x : renderX, blend);
    this.focus.z = deathCamera?deathCamera.z:lerp(this.focus.z, cameraRoom && !cameraRoom.followCamera ? cameraRoom.z : renderZ, blend);
    this.cameraHeight = deathCamera?deathCamera.height:lerp(this.cameraHeight, cameraRoom ? this.roomHeight(cameraRoom) : OUTDOOR_CAMERA_HEIGHT, cut ? 1 : 1 - Math.exp(-5.7 * dt));
    }
    this.kick.multiplyScalar(Math.exp(-15 * dt)); this.shake *= Math.exp(-this.shakeDecay * dt);
    const pressureShake=this.shotgunView?.pressure.shake||0;
    const shakeX = this.motion ? Math.sin(elapsed * 91) * (this.shake+pressureShake) * .65 : 0;
    const shakeZ = this.motion ? Math.cos(elapsed * 77) * (this.shake+pressureShake) * .5 : 0;
    const fx = this.focus.x + shakeX + (this.motion && !cameraRoom ? this.kick.x : 0), fz = this.focus.z + shakeZ + (this.motion && !cameraRoom ? this.kick.z : 0);
    this.shadowClock=(this.shadowClock||0)+dt;
    // Strained (see setStrain): shadows redraw at two thirds of their rate.
    const shadowRate=this.quality.shadowFPS?this.quality.shadowFPS*(this.strained?2/3:1):0;
    if(!shadowRate||this.sun.shadow.needsUpdate||this.shadowClock>=1/shadowRate){
      // Snapped to whole shadow texels so the map's grid stays fixed to the
      // world; otherwise every update lands edges on a slightly different grid
      // and they crawl. See shadow-snap.js.
      const cam = this.sun.shadow.camera, size = this.sun.shadow.mapSize;
      const at = snapShadowFocus({ x: fx, y: 0, z: fz }, this.sunBasis,
        (cam.right - cam.left) / size.x, (cam.top - cam.bottom) / size.y);
      this.sun.position.set(at.x + this.sunOffset.x, at.y + this.sunOffset.y, at.z + this.sunOffset.z);
      this.sun.target.position.set(at.x, at.y, at.z);
      this.sun.shadow.needsUpdate=true;
      this.shadowClock=shadowRate?this.shadowClock%(1/shadowRate):0;
    }
    const snapped = snapCameraFocus(fx, fz, this.cameraHeight, this.camera.fov, this.crisp ? this.crisp.height : this.renderer.getDrawingBufferSize(this.bufferSize).y);
    this.camera.position.set(snapped.x, this.cameraHeight, snapped.z + this.cameraHeight * CAMERA_TILT); this.camera.lookAt(snapped.x, 0, snapped.z); this.camera.updateMatrixWorld();
    for (const roof of this.roofs) {
      // Inside, the roof fades right out and is then not drawn at all. It used
      // to stay at 9.5% (a faint roof overhead), but on some GPUs that faint
      // roof rendered far heavier than intended, shingle rows and all (the
      // depth prepass below relies on two different shaders producing the
      // same depth, which not every driver guarantees). Gone is gone anywhere.
      // Also gone while stepping through one of its doors under the eaves.
      const p = sim.player, r = roof.reach, doorGap = roof.doors ? Math.min(...roof.doors.map(d => Math.hypot(p.x - d.x, p.z - d.z) - d.r)) : Infinity;
      const atDoor = !!r && doorGap < 0 && p.x > r.min.x && p.x < r.max.x && p.z > r.min.z && p.z < r.max.z;
      const desired = sim.roofId === roof.id || atDoor ? 0 : 1;
      // Rate 20: about a tenth of a second to 90%. At 8 the roof was still
      // visibly lifting a third of a second after the player was through the door.
      roof.opacity = lerp(roof.opacity, desired, 1 - Math.exp(-20 * dt));
      // Leaving these permanently transparent meant the largest, topmost
      // surface in a top-down frame was blended at alpha 1 and drawn after all
      // opaque geometry — so every floor, wall and counter under a visible roof
      // was fully shaded and then painted over, with no chance of being
      // occluded. Opaque whenever it is actually opaque.
      // Switched to its see-through shader a few steps before a door, not on
      // the threshold: that switch (and the driver's first draw of it) could
      // cost a big roof a visible stall right as the player walked in.
      const blended = roof.opacity < .995 || doorGap < 3;
      // `transparent` decides the shader three uses (the opaque one forces alpha
      // to 1), and three only re-picks a material's shader when told it changed.
      // Flipping the flag without needsUpdate left the roof on its opaque shader,
      // so it never faded. It only ever worked because the effects light used to
      // switch off indoors, which refreshed every shader in the scene by
      // accident; once that stopped, the roof stopped fading. Both variants are
      // warmed at load, so this swap costs nothing.
      if (roof.blended !== blended) {
        roof.blended = blended;
        for (const m of roof.materials) { m.transparent = blended; m.needsUpdate = true; }
        for (const m of roof.prepass || []) m.visible = blended;
        for (const m of roof.colour || []) m.renderOrder = blended ? ROOF_PREPASS_ORDER + 1 : 0;
      }
      for (const m of roof.materials) { m.opacity = roof.opacity; m.depthWrite = roof.opacity > .98; }
      const shown = roof.opacity > .015;
      if (roof.group.visible !== shown) roof.group.visible = shown;
      const castsShadow=roof.opacity>.5;
      if(roof.castsShadow!==castsShadow){
        for(const m of roof.casters)m.castShadow=castsShadow;
        roof.castsShadow=castsShadow;
      }
    }
    // Practice targets not in the sim's list (multiplayer has none) stay hidden.
    if (sim.targets.length !== this.targets.size) for (const g of this.targets.values()) g.visible = false;
    for (const t of sim.targets) {
      const g = this.targets.get(t.id); if (!g) continue; g.position.set(t.x, 0, t.z);
      // Portal shaders clip body, health bar and shadows indoors. Outdoors,
      // normal camera depth handles cover; ground-level sight rays must not hide
      // an entity that is exposed in the overhead view.
      // Never toggle the entire entity because its center crosses one sightline.
      g.visible = cropEntityVisible(sim.crops, sim.player, t);
      g.userData.board.visible = t.hp > 0;
      // Damage shows as it breaks, Balanced and up (target-damage.js); built
      // the first time a target is hurt, again if the preset changes.
      const fraction = t.maxHp ? t.hp / t.maxHp : 1, damage = g.userData.damage;
      if (fraction < 1 && damage?.quality !== this.qualityName) {
        damage?.dispose?.();
        g.userData.damage = makeTargetDamage(g.userData.board, t.kind, t.id, this.qualityName) || { quality: this.qualityName };
      }
      // Bullet holes only from bullets; breaking from any lost health. On
      // Quality and Extreme a new breaking stage knocks pieces off.
      const broke = g.userData.damage?.set?.(fraction, t.bulletHits || 0) || 0, debris = g.userData.damage?.debris || 0;
      if (broke && debris && g.visible) for (let i = 0, n = debris * broke; i < n; i++) {
        const a = Math.random() * Math.PI * 2, speed = 1 + Math.random() * 2.2, dummy = t.kind === 'dummy';
        this.fx.chunk({ x: t.x + Math.cos(a) * .3, y: dummy ? .9 + Math.random() * .6 : 1 + Math.random() * .2, z: t.z + Math.sin(a) * .3, vx: Math.cos(a) * speed, vz: Math.sin(a) * speed, vy: 1 + Math.random() * 2,
          size: .025 + Math.random() * .035, life: 2.2, color: TARGET_DEBRIS[dummy ? (i % 3 ? 'straw' : 'burlap') : (i % 3 ? 'wood' : 'paint')] });
      }
      if (t.hp <= 0 && g.userData.marks) this.surfaceMarks.clearFor(g.userData.marks);
      g.userData.board.rotation.z = t.flash > 0 ? Math.sin(t.flash * 65) * .13 : 0;
      g.userData.board.scale.setScalar(t.flash > 0 ? 1 + t.flash * .3 : 1);
    }
    for (const prop of sim.props) {
      const g = this.props.get(prop.id); if (!g) continue;
      g.visible = prop.hp > 0;
      const wobble = prop.flash > 0 ? Math.sin(prop.flash * 65) * .025 : 0;
      let moved = wobble !== g.rotation.z; g.rotation.z = wobble;
      // A restored prop grows back into place rather than blinking in.
      const pop = g.userData.popIn;
      if (pop !== undefined) {
        moved = true;
        g.userData.popIn = Math.max(0, pop - dt);
        const t = 1 - g.userData.popIn / PROP_POP, grow = 1 - (1 - t) ** 3;
        g.scale.copy(g.userData.baseScale).multiplyScalar(.35 + .65 * grow);
        if (!g.userData.popIn) { g.scale.copy(g.userData.baseScale); delete g.userData.popIn; }
      }
      if (moved) g.updateMatrix();
    }
    const present = new Set();
    for (const s of [...sim.shots, ...sim.hexOrbs]) {
      present.add(s.id); let g = this.shots.get(s.id);
      if (!g) {
        g = new THREE.Group();
        const orb = new THREE.Mesh(this.shotGeo, this.seedMaterial); g.add(orb);
        const aura = new THREE.Mesh(this.shotGeo, new THREE.MeshBasicMaterial({color:'#91d9ff',transparent:true,opacity:.12,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false})); aura.scale.setScalar(1.7); g.add(aura);
        const trail = new THREE.Mesh(this.trailGeo, this.trailMaterial); g.add(trail);
        const electricGeometry = new THREE.BufferGeometry(); electricGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(7 * 6 * 2 * 3), 3));
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
      const arcs = this.qualityName === 'performance' || this.qualityName === 'potato' ? 1 : this.qualityName === 'extreme' ? 7 : isDemanding(this.qualityName) ? 5 : 3;
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
    this.updateBeams(sim, dt); this.fxLightLevel *= Math.exp(-12 * dt);
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
    if (active) { this.fx.clearZone.value.set(renderX, renderZ); this.updateDetailFX(sim, dt); this.fx.update(dt); }
    // Training range only: the pink zone and the arrow in front of the player.
    if (this.tutorialGuide && !this.tutorialMarkers) this.tutorialMarkers = new TutorialMarkers(this.scene);
    this.tutorialMarkers?.update(dt, this.tutorialGuide, { x: renderX, z: renderZ });
    // Online: other players, already placed by the network session (main.js sets the list).
    if (this.remotePlayers?.length || this.remote) (this.remote ||= new RemotePlayers(this)).update(this.remotePlayers || [], elapsed, dt, this.bloodSources || []);
    if (this.blobShadows?.enabled) {
      const movers = [];
      if (this.player.visible) movers.push({ x: renderX, z: renderZ, size: .95 });
      for (const t of sim.targets) if (t.hp > 0) movers.push({ x: t.x, z: t.z, size: t.kind === 'dummy' ? .8 : 1.1, height: t.kind === 'dummy' ? 1.7 : 1.2 });
      for (const p of this.remotePlayers || []) movers.push({ x: p.x, z: p.z, size: .95 });
      this.blobShadows.update(i => sim.props[i]?.hp > 0, movers);
    }
    this.cropView.update(sim, dt);
    this.updateParticles(dt); this.updateBlasts(dt); this.blood.update(dt);this.electric.updateAftershocks(dt,sim); this.electric.drift(sim.seeds,sim.player,sim.colliders,dt); this.electric.charge(sim.hexOrbs,dt,sim.player); this.electric.syncSpin(sim.hexSpin,sim.player,dt); this.electric.update(dt); this.electric.boundary(sim.hexOrbs);
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

  // The map card's picture. Each map picks its best-looking spot in its data
  // (`thumbnail: { x, z, height }`); without one it shows the spawn. Rendered
  // at twice the size and scaled down, so edges come out smooth.
  captureMapThumbnail(shot=this.map.thumbnail) {
    const outW=460,outH=570,scale=2,width=outW*scale,height=outH*scale,target=new THREE.WebGLRenderTarget(width,height,{samples:4});
    target.texture.colorSpace=THREE.SRGBColorSpace;
    const camera=new THREE.PerspectiveCamera(40,width/height,CAMERA_NEAR,220);
    const at=shot||this.map.spawn,lift=shot?.height||OUTDOOR_CAMERA_HEIGHT;
    camera.position.set(at.x,lift,at.z+lift*(shot?.tilt??CAMERA_TILT));
    camera.lookAt(at.x,0,at.z);
    const previous=this.renderer.getRenderTarget();
    // Nothing that moves or flashes: the player, targets, drifting dust and any
    // idle effect pool (which would sit at the origin as a stray shape).
    const hidden=[this.player,this.motes,...this.targets.values(),...this.tumbleweeds,...(this.fx?.meshes||[]),...(this.particlePool||[])].filter(Boolean).map(o=>[o,o.visible]);
    try {
      hidden.forEach(([o])=>o.visible=false);
      this.sun.shadow.needsUpdate=true;
      this.renderer.setRenderTarget(target);this.renderer.render(this.scene,camera);
      const pixels=new Uint8Array(width*height*4);this.renderer.readRenderTargetPixels(target,0,0,width,height,pixels);
      const full=document.createElement('canvas');full.width=width;full.height=height;
      const fullCtx=full.getContext('2d'),image=fullCtx.createImageData(width,height);
      for(let y=0;y<height;y++)image.data.set(pixels.subarray((height-1-y)*width*4,(height-y)*width*4),y*width*4);
      fullCtx.putImageData(image,0,0);
      const canvas=document.createElement('canvas');canvas.width=outW;canvas.height=outH;
      const ctx=canvas.getContext('2d');ctx.imageSmoothingQuality='high';ctx.drawImage(full,0,0,outW,outH);
      return canvas.toDataURL('image/jpeg',.9);
    } finally {
      hidden.forEach(([o,visible])=>o.visible=visible);this.sun.shadow.needsUpdate=true;
      this.renderer.setRenderTarget(previous);target.dispose();
    }
  }

  render() {
    if (this.contextLost) return;
    if (this.pendingScale !== undefined) {
      this.resolutionScale = this.pendingScale; this.pendingScale = undefined;
      // Crisp tiers step without touching any buffer; the rest resize.
      if (this.crisp?.size) this.crisp.setScale(this.resolutionScale); else this.resize();
    }
    this.drawFrame();
    this.fenceFrame();
  }

  drawFrame() {
    if (this.lastSim) {
      this.updateVision(this.lastSim); this.interiorVisibility.update(this.lastSim);
      const apply = root => this.interiorVisibility.apply(root);
      // Static buildings/terrain are intentionally excluded and remain visible through gray fog.
      for (const g of this.shots.values()) apply(g);
      for (const b of this.beams.values()) { apply(b.core); apply(b.halo); apply(b.arc); }
      for (const g of this.electric.arcs.objects) apply(g);
      for (const g of this.electric.pulseParts()) apply(g);
      this.particlePool.forEach(apply); this.rings.forEach(r => apply(r.mesh));
      for (const mesh of this.fx.meshes) if (mesh.visible) apply(mesh);
      for (const b of this.blasts) { apply(b.core); apply(b.ring); for (const p of b.smoke) { apply(p.mesh); apply(p.flame); } }
      // Gated through intensity, never through visibility. The number of lights
      // in the scene is compiled into every shader, so hiding this light when it
      // fell out of sight -- which is exactly what stepping indoors does -- asked
      // for a new variant of every material on screen at once. That was the
      // stall on first entering a building, on every tier that has the light.
      const seen = this.fxLightLevel > .01 && this.lastSim.canAimAt(this.fxLight.position.x, this.fxLight.position.z);
      this.fxLight.intensity = seen ? this.fxLightLevel : 0;
    }
    if (this.post && this.qualityName === 'extreme') {
      let roof = 1; for (const r of this.roofs) roof = Math.min(roof, r.opacity);
      this.post.setIndoor(1 - roof); this.post.render();
    }
    else if (this.crisp) this.crisp.render(this.scene, this.camera);
    else this.renderer.render(this.scene, this.camera);
  }

  enableExtremePost() {
    this.postLoading ||= import('./extreme-post.js')
      .then(({ ExtremePost }) => {
        if (this.qualityName !== 'extreme') { this.postLoading = null; return; } // switched away while it loaded
        this.post = new ExtremePost(this.renderer, this.scene, this.camera, { excluded: () => this.aoExcluded() });
        if (this.programsWarmed) this.warmPrograms(); // again, for the composer's target (see warmPrograms)
      })
      .catch(error => { console.warn('Extreme post-processing unavailable:', error); });
  }

  // What the ambient-occlusion pass leaves out: anything with no solid,
  // depth-writing surface (glows, particles, decals, lines), faded roofs,
  // birds (they are far above the ground they would otherwise shade) and
  // ground cover. Only
  // the scene's top level is checked, and each object's answer is kept.
  aoExcluded() {
    const list = this.aoList ||= []; list.length = 0;
    const known = this.aoSolid ||= new WeakMap(), roofs = this.aoRoofs ||= new Set(this.roofs.map(r => r.group));
    const solid = root => {
      let found = false;
      root.traverse(o => {
        if (found || !o.isMesh || Array.isArray(o.material)) return;
        const m = o.material; found = !m.transparent && m.depthWrite !== false && m.toneMapped !== false;
      });
      return found;
    };
    for (const o of this.scene.children) {
      if (!o.visible || roofs.has(o)) continue;
      let answer = known.get(o);
      if (answer === undefined) { answer = solid(o); known.set(o, answer); }
      if (!answer) list.push(o);
    }
    // A roof counts as solid until it is mostly see-through. Left out for its
    // whole fade, the furniture under it cast occlusion straight through the
    // nearly opaque roof, so leaving a house showed the room's outline on the
    // roof until it had finished closing.
    for (const roof of this.roofs) if (roof.opacity < .5) list.push(roof.group);
    for (const flight of this.birds?.flights || []) { list.push(flight.group); if (flight.shadow) list.push(flight.shadow); }
    // Ground cover (tufts, pebbles, twigs) is thousands of tiny triangles that
    // cast no occlusion worth the cost of drawing them a second time.
    list.push(this.groundDetails, this.extraGroundDetails, this.performanceDetails);
    // Lines and points tucked inside solid groups (crate slats, rope, cracks)
    // would be drawn into the depth and normals as if they were surfaces.
    // Those groups never change, so they are found once.
    if (!this.aoNestedLines) {
      this.aoNestedLines = [];
      for (const o of this.scene.children) if (known.get(o)) o.traverse(c => { if (c !== o && (c.isLine || c.isPoints || c.isSprite)) this.aoNestedLines.push(c); });
    }
    for (const o of this.aoNestedLines) list.push(o);
    return list;
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
      immersion.sections.length, viewWidth(), viewHeight()].join(',');
    if (this.cropMaskKey === maskKey) return;
    if (this.cropMaskClock > this.effectTime && this.cropMaskKey) return;
    this.cropMaskClock = this.effectTime + (VISION_REPAINT[this.qualityName] || VISION_REPAINT.balanced);
    this.cropMaskKey = maskKey;
    const sections = immersion.outerOpacity >= 1 ? [] : immersion.sections.map(section => projectVisionPolygon(
      [{x:section.x-section.w/2,z:section.z-section.d/2},{x:section.x+section.w/2,z:section.z-section.d/2},
       {x:section.x+section.w/2,z:section.z+section.d/2},{x:section.x-section.w/2,z:section.z+section.d/2}],
      this.camera, viewWidth(), viewHeight()));
    this.paintCrop(sections, c, radius, immersion.outerOpacity, Math.max(28, radius * .32));
  }

  // Standing in a crop, the world is visible close by and swallowed further out,
  // and only inside the field at all. Both of those are alpha, so they are one
  // paint: lay the mask down, then keep it only where the falloff says to.
  paintCrop(polygons, center, radius, outerOpacity, feather) {
    const context = this.cropContext;
    if (!context) return;
    const { width, height } = this.cropOverlay;
    const scaleX = width / viewWidth(), scaleY = height / viewHeight();
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
    const cameraKey = [room.id, viewWidth(), viewHeight(),
      ...this.camera.matrixWorld.elements.map(e => quantise(e, .01)),
      ...this.camera.projectionMatrix.elements.map(e => quantise(e, .01))].join(',');
    const maskKey = cameraKey + ',' + quantise(sim.player.x, .05) + ',' + quantise(sim.player.z, .05);
    if (this.visionMaskKey === maskKey) return;
    // The shroud is painted in screen space, so a camera that moved since the
    // last paint (the push-in on entering a room, the follow camera) must be
    // repainted this frame: held back by the rate cap, the shadow cones lagged
    // the walls they are cut from and jittered against them.
    const cameraMoved = this.visionCameraKey !== cameraKey;
    this.visionCameraKey = cameraKey;
    if (!cameraMoved && this.visionMaskClock > this.effectTime && this.visionMaskKey) return;
    this.visionMaskClock = this.effectTime + (VISION_REPAINT[this.qualityName] || VISION_REPAINT.balanced);
    this.visionMaskKey = maskKey;
    this.paintVision(interiorPolygons(room, sim.player)
      .map(points => projectVisionPolygon(points, this.camera, viewWidth(), viewHeight())));
  }

  // Paints the shroud: a flat wash over the viewport with the clear regions
  // punched out of it. Everything is in the low-resolution buffer's own pixels,
  // so the cost is fixed by the tier rather than by the device's screen.
  paintVision(polygons) {
    const context = this.visionContext;
    if (!context) return;
    const { width, height } = this.visionOverlay;
    const scaleX = width / viewWidth(), scaleY = height / viewHeight();
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
    // Extreme keeps a longer trail of pressed prints.
    const footLife = this.qualityName === 'extreme' ? 7 : 3;
    this.footprints = this.footprints.filter(foot => foot.age < footLife);
    if (active && distance < 1 && Math.hypot(sim.player.vx, sim.player.vz) > .6) {
      this.footDistance += distance;
      if (this.footDistance >= .55) {
        this.footDistance %= .55; this.footSide *= -1;
        const angle = Math.atan2(sim.player.vx, sim.player.vz), offset = .15 * this.footSide, fx = x + Math.cos(angle) * offset, fz = z - Math.sin(angle) * offset;
        // Prints in the dirt outdoors; a bloody boot prints anywhere, on the
        // very same step, the same size and shape (blood-wading.js).
        if (!sim.roofId) { this.footprints.push({ x: fx, z: fz, angle, age: 0 }); if (this.footprints.length > 160) this.footprints.shift(); }
        const wet = this.wading?.takePrint() || 0;
        if (wet) (this.drops ||= new BloodDrops(this)).print(fx, fz, angle, wet, this.map);
      }
    }
    const fade = this.footMesh.geometry.attributes.fade;
    for (const [i, foot] of this.footprints.entries()) {
      this.dummy.position.set(foot.x, .041, foot.z); this.dummy.rotation.set(0, foot.angle, 0);
      this.dummy.scale.set(.095, 1, .18); this.dummy.updateMatrix();
      this.footMesh.setMatrixAt(i, this.dummy.matrix); fade.setX(i, Math.max(0, 1 - foot.age / footLife) * Math.min(1, foot.age / .08 + .4));
    }
    this.footMesh.count = this.footprints.length; this.footMesh.instanceMatrix.needsUpdate = true; fade.needsUpdate = true;
  }

  // Detail that comes from what is going on rather than from one event: grit
  // off the feet, sparks shed by floating orbs and a spinning hex, embers
  // over burning crops.
  updateDetailFX(sim, dt) {
    const fx = this.fx; if (!fx.on) return;
    const p = sim.player, speed = Math.hypot(p.vx, p.vz);
    this.gritClock = (this.gritClock ?? 0) - dt;
    if (speed > 1 && this.gritClock <= 0) {
      this.gritClock = p.dodgeRemaining > 0 ? .03 : .17;
      fx.grit(p.x, p.z, this.kickedDustColor(p.x, p.z), p.vx / speed, p.vz / speed, p.dodgeRemaining > 0 ? 1.4 : .5);
    }
    // Orbs parked in the air crackle: tiny blue sparks spat off their skin.
    this.orbClock = (this.orbClock ?? 0) - dt;
    if (this.orbClock <= 0) {
      this.orbClock = .07;
      for (const s of sim.shots) if (!s.launched && Math.random() < .5 * fx.level) {
        const a = Math.random() * 6.3, speed = 1 + Math.random() * 2;
        fx.spark({ x: s.x + Math.cos(a) * .14, y: .72, z: s.z + Math.sin(a) * .14, vx: Math.cos(a) * speed, vy: (Math.random() - .3) * 2, vz: Math.sin(a) * speed,
          life: .08 + Math.random() * .12, stops: FX_ELECTRIC, gravity: .1, drag: 5, length: .06, width: .01, glow: 1.5 });
      }
      // A spinning hex (X) sheds light and sparks off every node as it turns.
      for (const n of sim.hexSpin?.nodes || []) {
        fx.glow({ x: n.x, y: .75, z: n.z, size: 1.3, life: .09, color: STREAM_GLOW, glow: 1.2, flicker: 1 });
        for (let i = 0, count = fx.n(3); i < count; i++) {
          const a = Math.random() * 6.3, speed = 2 + Math.random() * 4;
          fx.spark({ x: n.x, y: .75, z: n.z, vx: Math.cos(a) * speed, vy: Math.random() * 3, vz: Math.sin(a) * speed, life: .15 + Math.random() * .2, stops: FX_ELECTRIC, gravity: .4, drag: 3, length: .1, width: .012, glow: 1.6 });
        }
      }
    }
    // Burning crops loft embers and throw off the odd spark.
    this.fireClock = (this.fireClock ?? 0) - dt;
    if (this.fireClock <= 0) {
      this.fireClock = .08;
      for (const c of sim.crops) if (c.state === 'burning' && Math.hypot(c.x - p.x, c.z - p.z) < 40) {
        for (let i = 0, count = fx.n(1.2); i < count; i++) fx.ember({ x: c.x + (Math.random() - .5) * c.w, y: .5 + Math.random() * .8, z: c.z + (Math.random() - .5) * c.d,
          vx: .4 + (Math.random() - .5) * .6, vz: (Math.random() - .5) * .6, vy: 1.2 + Math.random() * 1.5, life: 1.6 + Math.random() * 1.6, size: .02 + Math.random() * .025, rise: 1.4 });
      }
    }
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
      const index = counts[p.material]++; if (index >= PARTICLE_POOL) continue;
      this.dummy.position.set(p.x, p.y, p.z); this.dummy.rotation.set(p.angle + p.life * 2, p.angle, p.life);
      const scale = p.size * Math.max(0, p.debris ? Math.min(1, p.life / .6) : p.life / p.maxLife);
      this.dummy.scale.set(scale * (p.stretch || 1), scale * (p.debris ? .55 : 1), scale); this.dummy.updateMatrix();
      this.particlePool[p.material].setMatrixAt(index, this.dummy.matrix);
      this.particlePool[p.material].setColorAt(index, p.tint || WHITE);
    }
    this.particlePool.forEach((mesh, i) => { mesh.count = Math.min(counts[i], PARTICLE_POOL); if(mesh.count){mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;} });
  }

  // Debris only (online map reset): the world's marks and leftovers, not the
  // camera, the players or anything in flight.
  clearDebris() {
    this.deathView?.clear(); this.remoteCorpses?.clear(); this.drops?.clear(); this.bleeds?.clear();
    this.blood?.clear?.();
    this.surfaceMarks.clear(); this.cropView.reset();
    this.particles.length = 0; this.fx.clear();
    for (const r of this.rings) { r.mesh.removeFromParent(); r.mesh.geometry.dispose(); r.mesh.material.dispose(); } this.rings.length = 0;
  }

  // The next frame puts the camera straight on the player instead of gliding
  // there (a respawn across the map).
  cutCamera() { this.cameraCut = true; }

  // The online weapon pick's view (pick-view.js), or null to go back to the
  // player (a cut, not a glide across the map).
  setPickView(view) {
    if (!view === !this.pickCamera && (!view || (view.x === this.pickCamera.x && view.z === this.pickCamera.z))) return;
    this.pickCamera = view ? { x: view.x, z: view.z, height: view.height } : null;
    this.cutCamera();
  }

  reset(sim) {
    this.deathView?.clear(); this.blood?.clear(); this.remoteCorpses?.clear(); this.drops?.clear(); this.bleeds?.clear(); this.cleanPlayer();
    this.fx.clear();
    this.remote?.clear();
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
    this.fxLightLevel = 0;
    for (const g of this.props.values()) {
      if (g.userData.popIn !== undefined) { g.scale.copy(g.userData.baseScale); delete g.userData.popIn; }
      g.rotation.z = 0; g.updateMatrix();
    }
    for (const b of this.blasts) this.disposeBlast(b); this.blasts.length = 0;
  }
}




