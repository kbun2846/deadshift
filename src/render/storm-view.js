// The storm, drawn (storm.js; owner, 2026-09-29: "the storm should be all
// red, and leave a harsh red over everything. the part that expands into the
// map should be crackling like electricity onto the map as it creeps in. the
// rest should have this electricity too ... detailed and have lots of effects
// but should not take up a lot of performance"; then: "do not just give it
// all one lame texture. give it actual detail like electricity bolts").
//
// Three things, three draws, all built at load (added hidden, so the warm-up
// compiles their programs: nothing is compiled in play):
//  - The wash: one full-screen pass that finds, for every pixel, where its
//    view ray meets the ground (a body's height over it) and washes the pixel
//    red when that is out in the storm: ground, walls, roofs and bodies out
//    there all go harshly red (it multiplies what is drawn, so they still
//    read), at any camera height, inside the storm or out. Storm clouds roll
//    through it and a burning seam runs along the edge. Only uniforms change.
//  - The bolts: real jagged, branching lightning, a pool of them made on the
//    CPU only when one strikes (midpoint displacement) and faded in the
//    shader: bolts crawling in over the edge onto the map, bolts cracking
//    across the storm around you, and now and then a strike from the sky
//    with a star of arcs where it lands. `zaps` (the ones near the camera)
//    are for the crackle you hear (main.js).
//  - The wall: a thin curtain at the edge, arcs climbing it, sparking at its foot.
// `tension` (0-1) winds everything up (FFA's last stretch, sudden death).
// No team colours: blood red to white-hot.
import * as THREE from 'three';

export const STORM_LOOK = Object.freeze({
 bodyHeight: 1,        // the wash tests the storm at this height over the ground
 wallBase: -3, wallTop: 7,
 bolts: 48, segments: 22, // the pool: bolts, and quads each (trunk and branches)
 rate: [16, 34],       // bolts a second (low presets, the rest), before tension
 reach: 34,            // bolts strike within this of the camera's focus
 body: '#b3121f', hot: '#ff4a3d', core: '#fff1ea',
});

const hashNoise = `
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
 return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
`;

// --- The wash ------------------------------------------------------------
const washVertex = `
varying vec2 vNdc;
void main(){ vNdc=position.xy; gl_Position=vec4(position.xy,0.,1.); }`;
// 2 x source x screen: 0.5 leaves a pixel be, a deep red lifts its red and
// takes out green and blue, above 0.5 burns it bright.
const washFragment = hashNoise + `
uniform mat4 uInvViewProj; uniform vec3 uCam; uniform vec3 uCircle; uniform float uPlane;
uniform float uTime; uniform float uShow; uniform float uTension; uniform float uDetail;
varying vec2 vNdc;
void main(){
 vec4 far=uInvViewProj*vec4(vNdc,1.,1.); far/=far.w;
 vec3 dir=normalize(far.xyz-uCam);
 // Where the ray meets the plane (or, looking up, far away that way).
 float t=dir.y<-1e-4?(uPlane-uCam.y)/dir.y:260.;
 vec2 hit=uCam.xz+dir.xz*min(t,260.);
 float d=length(hit-uCircle.xy)-uCircle.z;
 float out1=smoothstep(-.35,.35,d);
 if(out1<.002){ gl_FragColor=vec4(.5,.5,.5,1.); return; }
 float tt=uTime;
 // Storm clouds rolling over (dark), a faint web of static, the burning seam.
 float cloud=noise(hit*.05+vec2(tt*.09,-tt*.06));
 if(uDetail>.5) cloud=cloud*.7+noise(hit*.13-vec2(tt*.14,tt*.05))*.3;
 float web=0.;
 if(uDetail>.5){ vec2 q=hit*.32+(noise(hit*.9+tt*.7)-.5)*.6; web=1.-smoothstep(0.,.06,abs(noise(q+tt*.35)-.5)); }
 float seam=exp(-max(d,0.)/1.3);
 float flick=.8+.2*hash(vec2(floor(tt*20.),2.));
 vec3 tint=mix(vec3(.62,.10,.10),vec3(.8,.2,.18),cloud);
 tint=mix(tint,vec3(1.,.62,.52),web*.8*flick);
 tint=mix(tint,vec3(1.,.8,.7),seam*(.55+.35*flick)+uTension*.08*step(.93,hash(vec2(floor(tt*8.),9.))));
 gl_FragColor=vec4(mix(vec3(.5),tint,out1*uShow),1.);
}`;

// --- The bolts -----------------------------------------------------------
// Each quad: a segment of a bolt laid flat (or standing, for a strike), `aSide`
// across it (-1..1: the white core in the middle, a red glow out to the
// edges), `aBolt` (born at, lives for, brightness) so the shader fades and
// flickers it; nothing is rewritten until its pool slot strikes again.
const boltVertex = `
attribute vec3 aBolt; attribute float aSide;
uniform float uTime;
varying float vSide; varying float vAlpha;
float hash1(float n){return fract(sin(n)*43758.5453);}
void main(){
 vSide=aSide;
 float age=uTime-aBolt.x, life=aBolt.y;
 float a=age<0.||age>life?0.:1.-age/life;
 // A bolt flickers hard while it lives (on, dim, on).
 a*=.55+.45*step(.35,hash1(floor(uTime*40.)+aBolt.x*13.));
 vAlpha=a*aBolt.z;
 gl_Position=projectionMatrix*viewMatrix*modelMatrix*vec4(position,1.);
}`;
const boltFragment = `
uniform vec3 uHot; uniform vec3 uCore;
varying float vSide; varying float vAlpha;
void main(){
 float x=abs(vSide);
 float core=1.-smoothstep(.0,.28,x), glow=1.-smoothstep(.2,1.,x);
 vec3 c=mix(uHot,uCore,core);
 gl_FragColor=vec4(c*(core*1.4+glow*.8)*vAlpha,1.);
}`;

// --- The wall ------------------------------------------------------------
const wallVertex = `
attribute vec2 aUV; uniform vec3 uCircle; uniform float uBase; uniform float uTop;
varying vec2 vUV;
void main(){
 vUV=aUV; float a=aUV.x*6.28318530718, r=max(uCircle.z,.01);
 vec3 p=vec3(uCircle.x+cos(a)*r, mix(uBase,uTop,aUV.y), uCircle.y+sin(a)*r);
 gl_Position=projectionMatrix*viewMatrix*modelMatrix*vec4(p,1.);
}`;
const wallFragment = hashNoise + `
uniform float uTime; uniform float uShow; uniform float uTension; uniform vec3 uCircle;
uniform vec3 uBody; uniform vec3 uHot; uniform vec3 uCore;
varying vec2 vUV;
void main(){
 float t=uTime, h=vUV.y, around=vUV.x*uCircle.z*6.2832;
 float flick=.7+.3*hash(vec2(floor(t*24.),5.1));
 float foot=1.-smoothstep(.2,.75,h);
 vec2 q=vec2(around*.55,h*6.-t*1.9); q+=(noise(q*2.7+t)-.5)*.5;
 float climb=1.-smoothstep(0.,.04+.02*uTension,abs(noise(q)-.5));
 float sparks=step(.978-uTension*.012,hash(vec2(floor(around*4.),floor(t*22.))))*foot;
 vec3 colour=mix(uBody,uHot,climb*flick);
 colour=mix(colour,uCore,clamp(sparks+foot*climb*.5,0.,1.));
 float alpha=(.08+.2*foot)*(1.-h*.7)+climb*.4*flick*(1.-h*.5)+sparks*.6+uTension*.05;
 gl_FragColor=vec4(colour,clamp(alpha,0.,.85)*uShow);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
}`;

// A jagged line from a to b (midpoint displacement) of about `n` points.
// `vertical`: a strike from the sky (jagged sideways, not along the ground).
function jag(ax, ay, az, bx, by, bz, n, rough, random, vertical = false) {
 const pts = [[ax, ay, az], [bx, by, bz]];
 for (let rounds = 0; pts.length < n && rounds < 6; rounds++) {
  for (let i = pts.length - 1; i > 0 && pts.length < n; i--) {
   const p = pts[i - 1], q = pts[i], len = Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]), off = (random() - .5) * len * rough;
   const dx = q[0] - p[0], dz = q[2] - p[2], l = Math.hypot(dx, dz) || 1;
   const mid = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2];
   if (vertical) { mid[0] += off; mid[2] += (random() - .5) * len * rough; }
   else { mid[0] += -dz / l * off; mid[2] += dx / l * off; }
   pts.splice(i, 0, mid);
  }
 }
 return pts;
}

export class StormView {
 constructor(view) {
  this.view = view; this.circle = null; this.final = null; this.tension = 0; this.time = 0; this.spawn = 0; this.zaps = []; this.slot = 0;
  const L = STORM_LOOK, colour = c => new THREE.Color(c);
  // The wash: a quad over the whole screen.
  const quad = new THREE.BufferGeometry();
  quad.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3));
  quad.setIndex([0, 1, 2, 0, 2, 3]);
  this.washMaterial = new THREE.ShaderMaterial({
   uniforms: { uInvViewProj: { value: new THREE.Matrix4() }, uCam: { value: new THREE.Vector3() }, uCircle: { value: new THREE.Vector3(0, 0, 1) }, uPlane: { value: 1 },
    uTime: { value: 0 }, uShow: { value: 0 }, uTension: { value: 0 }, uDetail: { value: 1 } },
   vertexShader: washVertex, fragmentShader: washFragment, toneMapped: false,
   transparent: true, depthWrite: false, depthTest: false,
   blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.DstColorFactor, blendDst: THREE.SrcColorFactor,
  });
  this.wash = new THREE.Mesh(quad, this.washMaterial);
  // The wall.
  const n = 128, wallUV = new Float32Array((n + 1) * 2 * 2), wallIndex = [];
  for (let i = 0; i <= n; i++) { wallUV.set([i / n, 0, i / n, 1], i * 4); if (i < n) { const w = i * 2; wallIndex.push(w, w + 1, w + 2, w + 1, w + 3, w + 2); } }
  const wall = new THREE.BufferGeometry();
  wall.setAttribute('position', new THREE.BufferAttribute(new Float32Array((n + 1) * 2 * 3), 3));
  wall.setAttribute('aUV', new THREE.BufferAttribute(wallUV, 2)); wall.setIndex(wallIndex);
  const shared = this.washMaterial.uniforms;
  this.wallMaterial = new THREE.ShaderMaterial({
   uniforms: { uCircle: shared.uCircle, uTime: shared.uTime, uShow: shared.uShow, uTension: shared.uTension,
    uBase: { value: L.wallBase }, uTop: { value: L.wallTop }, uBody: { value: colour(L.body) }, uHot: { value: colour(L.hot) }, uCore: { value: colour(L.core) } },
   vertexShader: wallVertex, fragmentShader: wallFragment, transparent: true, depthWrite: false, depthTest: true, side: THREE.DoubleSide,
  });
  this.wall = new THREE.Mesh(wall, this.wallMaterial);
  // The bolts: the whole pool in one buffer.
  const quads = L.bolts * L.segments;
  this.boltPos = new Float32Array(quads * 4 * 3); this.boltInfo = new Float32Array(quads * 4 * 3).fill(-99);
  const side = new Float32Array(quads * 4), index = new Uint32Array(quads * 6);
  for (let q = 0; q < quads; q++) { side.set([-1, 1, 1, -1], q * 4); const v = q * 4; index.set([v, v + 1, v + 2, v, v + 2, v + 3], q * 6); }
  const bolts = new THREE.BufferGeometry();
  bolts.setAttribute('position', this.boltPosAttr = new THREE.BufferAttribute(this.boltPos, 3).setUsage(THREE.DynamicDrawUsage));
  bolts.setAttribute('aBolt', this.boltInfoAttr = new THREE.BufferAttribute(this.boltInfo, 3).setUsage(THREE.DynamicDrawUsage));
  bolts.setAttribute('aSide', new THREE.BufferAttribute(side, 1)); bolts.setIndex(new THREE.BufferAttribute(index, 1));
  this.boltMaterial = new THREE.ShaderMaterial({
   uniforms: { uTime: shared.uTime, uHot: this.wallMaterial.uniforms.uHot, uCore: this.wallMaterial.uniforms.uCore },
   vertexShader: boltVertex, fragmentShader: boltFragment, transparent: true, depthWrite: false, depthTest: true,
   blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  this.bolts = new THREE.Mesh(bolts, this.boltMaterial);
  for (const [m, name, order] of [[this.wash, 'storm-wash', 40], [this.wall, 'storm-wall', 30], [this.bolts, 'storm-bolts', 41]]) {
   m.name = name; m.frustumCulled = false; m.renderOrder = order; m.castShadow = m.receiveShadow = false;
   // In the scene from the start (hidden): the warm-up compiles their programs with the rest.
   m.visible = false; view.scene.add(m);
  }
 }

 // The safe circle ({ x, z, r }) or null; `tension` 0-1; `final`: where it
 // ends ({ x, z, r }; the M map shows it).
 set(circle, tension = 0, final = null) {
  this.circle = circle ? { x: circle.x, z: circle.z, r: circle.r } : null; this.tension = tension; this.final = final;
  const on = !!circle;
  this.wash.visible = this.wall.visible = this.bolts.visible = on;
  if (!on) { this.washMaterial.uniforms.uShow.value = 0; return; }
  this.washMaterial.uniforms.uCircle.value.set(circle.x, circle.z, Math.max(.01, circle.r));
 }

 // One bolt into the next slot of the pool: `pts` the trunk, `branches`
 // forking off it, `life` s, `glow` its brightness, `width` m.
 strike(pts, life, glow, width, random, branches = 2) {
  const L = STORM_LOOK, slot = this.slot; this.slot = (this.slot + 1) % L.bolts;
  const base = slot * L.segments, born = this.time;
  let q = 0;
  const lay = (line, w) => {
   for (let i = 0; i + 1 < line.length && q < L.segments; i++, q++) {
    const a = line[i], b = line[i + 1], dx = b[0] - a[0], dz = b[2] - a[2], l = Math.hypot(dx, dz);
    // Flat on the ground across the segment; a standing strike, across x.
    const sx = l > 1e-3 ? -dz / l * w : w, sz = l > 1e-3 ? dx / l * w : 0;
    const v = (base + q) * 12;
    this.boltPos.set([a[0] - sx, a[1], a[2] - sz, a[0] + sx, a[1], a[2] + sz, b[0] + sx, b[1], b[2] + sz, b[0] - sx, b[1], b[2] - sz], v);
    for (let k = 0; k < 4; k++) this.boltInfo.set([born, life, glow], v + k * 3);
   }
  };
  lay(pts, width);
  for (let k = 0; k < branches && q < L.segments - 3 && pts.length > 2; k++) {
   const from = pts[1 + Math.floor(random() * (pts.length - 2))], len = 1 + random() * 2.5, a = random() * Math.PI * 2;
   lay(jag(from[0], from[1], from[2], from[0] + Math.cos(a) * len, from[1], from[2] + Math.sin(a) * len, 5, .7, random), width * .6);
  }
  // Unused quads of the slot: gone.
  for (; q < L.segments; q++) { const v = (base + q) * 12; for (let k = 0; k < 4; k++) this.boltInfo[v + k * 3] = -99; }
  const from = base * 12, count = L.segments * 12;
  this.boltPosAttr.addUpdateRange(from, count); this.boltPosAttr.needsUpdate = true;
  this.boltInfoAttr.addUpdateRange(from, count); this.boltInfoAttr.needsUpdate = true;
 }

 // A bolt somewhere near `focus`: crawling in over the edge (most), across
 // the storm, or a strike from the sky with a star of arcs where it lands.
 spawnBolt(focus, random) {
  const c = this.circle, v = this.view, L = STORM_LOOK; if (!c) return;
  const fx = focus.x, fz = focus.z, toward = Math.atan2(fz - c.z, fx - c.x), spread = Math.min(Math.PI, L.reach / Math.max(1, c.r));
  const y = (x, z) => v.gy(x, z) + .12, kind = random();
  if (kind < .55) {
   // Over the edge: from a little out in the storm, reaching in onto the map.
   const a = toward + (random() - .5) * 2 * spread, out = c.r + .5 + random() * 3.5, into = c.r - .3 - random() * (2.2 + this.tension * 2);
   const ax = c.x + Math.cos(a) * out, az = c.z + Math.sin(a) * out, b = a + (random() - .5) * .08;
   const bx = c.x + Math.cos(b) * into, bz = c.z + Math.sin(b) * into;
   if (Math.hypot(ax - fx, az - fz) > L.reach * 1.3) return;
   this.strike(jag(ax, y(ax, az), az, bx, y(bx, bz), bz, 12, .55, random), .2 + random() * .25, 1, .16 + random() * .1, random, 2);
   this.zaps.push({ x: bx, z: bz, size: .7 });
  } else if (kind < .88) {
   // Across the storm near you.
   for (let k = 0; k < 6; k++) {
    const a = random() * Math.PI * 2, d = 4 + random() * L.reach, x = fx + Math.cos(a) * d, z = fz + Math.sin(a) * d;
    if (Math.hypot(x - c.x, z - c.z) < c.r + 1) continue;
    const h = random() * Math.PI * 2, len = 3 + random() * 6, bx = x + Math.cos(h) * len, bz = z + Math.sin(h) * len;
    this.strike(jag(x, y(x, z), z, bx, y(bx, bz), bz, 12, .6, random), .16 + random() * .22, .8, .13 + random() * .08, random, 3);
    this.zaps.push({ x, z, size: .45 });
    return;
   }
  } else {
   // From the sky, at the edge, and a star of short arcs where it lands.
   const a = toward + (random() - .5) * 2 * spread, d = c.r + .5 + random() * 4, x = c.x + Math.cos(a) * d, z = c.z + Math.sin(a) * d, g = v.gy(x, z);
   if (Math.hypot(x - fx, z - fz) > L.reach * 1.3) return;
   this.strike(jag(x + (random() - .5) * 3, g + 16, z + (random() - .5) * 3, x, g + .1, z, 12, .35, random, true), .16 + random() * .1, 1.2, .24, random, 0);
   for (let k = 0; k < 3; k++) { const h = random() * Math.PI * 2, l = 1 + random() * 1.8; this.strike(jag(x, g + .12, z, x + Math.cos(h) * l, g + .12, z + Math.sin(h) * l, 5, .8, random), .14, 1, .14, random, 0); }
   this.zaps.push({ x, z, size: 1 });
  }
 }

 // What struck near the camera since last asked (main.js plays the crackle).
 takeZaps() { const z = this.zaps; this.zaps = []; return z; }

 // Every frame: the clock, the wash's view of the world, the fade in, the
 // tension, the detail the preset allows, and new bolts.
 update(dt, focus, quality, random = Math.random) {
  if (!this.wash.visible) { this.zaps.length = 0; return; }
  const u = this.washMaterial.uniforms, v = this.view, cam = v.camera, L = STORM_LOOK;
  this.time += dt; if (this.time > 900) { this.time = 0; this.boltInfo.fill(-99); this.boltInfoAttr.needsUpdate = true; }
  u.uTime.value = this.time;
  u.uShow.value = Math.min(1, u.uShow.value + dt * 1.5);
  u.uTension.value += (this.tension - u.uTension.value) * Math.min(1, dt * 2);
  const low = quality === 'potato' || quality === 'performance';
  u.uDetail.value = low ? 0 : 1;
  cam.updateMatrixWorld();
  u.uInvViewProj.value.multiplyMatrices(cam.matrixWorld, cam.projectionMatrixInverse);
  u.uCam.value.setFromMatrixPosition(cam.matrixWorld);
  const ground = focus ? v.gy(focus.x, focus.z) : 0;
  u.uPlane.value = ground + L.bodyHeight;
  this.wallMaterial.uniforms.uBase.value = ground + L.wallBase; this.wallMaterial.uniforms.uTop.value = ground + L.wallTop;
  // New bolts, `rate` a second (more as it winds up), once it has faded in.
  if (dt > 0 && focus && u.uShow.value > .3) {
   this.spawn = Math.min(this.spawn + dt * L.rate[low ? 0 : 1] * (1 + this.tension * 1.2), 3);
   while (this.spawn >= 1) { this.spawn -= 1; this.spawnBolt(focus, random); }
  }
 }
}
