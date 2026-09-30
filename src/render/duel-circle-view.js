// The 1V1 duel circle, drawn (owner, 2026-09-29): "the edges should turn red
// when you get close to them, and it should be like a see through foggy
// vertical reddish at bottom fog wall. The parts closer to players, like the
// south side of the circle should work on the ground but fog shouldn't
// interfere with view and camera"; "the near side ... should still have the
// fog effect and reddish mist at the bottom and a bit up as well".
//
// One mesh, one draw, one program (built at load, so it is warmed with the
// rest: render/warm-up.js; nothing is compiled in play): a ring wall of mist
// round the circle (duel-circle.js) and a band on the ground just inside it.
// Everything moves in the shader from uniforms (time, centre, radius, your
// place); the vertices are only rewritten when a new circle is set (a new
// round), following the ground on a hills map (view.gy).
//  - The wall: soft drifting mist, red at the foot fading to a pale haze up
//    its height, see-through all the way. The side toward the camera (the
//    south, +z: the camera sits south of what it looks at) is thinner and
//    lower, so it never hides a player or the ground in front of you.
//  - Near you (the part of the edge within a few metres) it turns a deeper,
//    brighter red and a little thicker: the warning.
//  - The ground band: a red glow along the inside of the edge, so the line is
//    clear where the wall is thin (the near side).
// No team colours (Amber, Cyan, Violet, the future green): a blood red.
import * as THREE from 'three';

export const CIRCLE_LOOK = Object.freeze({
 height: 6,          // the wall, metres
 band: 1.4,          // the ground band's width inside the edge, metres
 segments: 160,
 warnFrom: 7,        // metres from the edge where it starts to turn red
 // (Owner, 2026-09-29: "slightly less reddish ... a little bit less opaque ...
 // when a player goes up near them ... more solid where they go, and a little
 // bit more red": a softer foot, thinner mist, and the part near you firms up.)
 foot: '#9c3a42', mist: '#cdbfbb', warn: '#e8263a',
});

const vertex = `
attribute float aKind; // 0 wall, 1 ground band
attribute vec2 aUV;    // x: round the circle (0-1); y: up the wall / across the band (0-1)
varying float vKind; varying vec2 vUV; varying vec3 vWorld;
void main(){
 vKind=aKind; vUV=aUV;
 vec4 world=modelMatrix*vec4(position,1.0); vWorld=world.xyz;
 gl_Position=projectionMatrix*viewMatrix*world;
}`;

const fragment = `
uniform float uTime; uniform vec3 uCentre; uniform vec2 uPlayer; uniform float uWarnFrom; uniform float uShow;
uniform vec3 uFoot; uniform vec3 uMist; uniform vec3 uWarn;
varying float vKind; varying vec2 vUV; varying vec3 vWorld;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
 return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
float mist(vec2 p){return noise(p)*.55+noise(p*2.1+3.7)*.3+noise(p*4.3-1.3)*.15;}
void main(){
 vec2 fromCentre=vWorld.xz-uCentre.xy; float r=max(uCentre.z,.001);
 // The side toward the camera (south, +z): thinner and lower.
 float near=smoothstep(-.15,.75,fromCentre.y/r);
 // Your nearness to this part of the edge.
 float close=1.-smoothstep(1.2,uWarnFrom,distance(vWorld.xz,uPlayer));
 float alpha; vec3 colour;
 if(vKind<.5){
  float h=vUV.y, around=vUV.x*r*6.2832;
  float m=mist(vec2(around*.18+uTime*.16,h*1.8-uTime*.32));
  float puffs=smoothstep(.3,.8,mist(vec2(around*.07-uTime*.05,h*.9+uTime*.08)));
  float top=mix(1.,.5,near);                        // how far up the mist reaches
  float body=(1.-smoothstep(.0,top,h))*(.45+.75*m)*(.6+.55*puffs);
  float foot=1.-smoothstep(0.,mix(.34,.24,near),h);  // the red at the bottom and a bit up
  colour=mix(uMist,uFoot,foot*.8);
  // Near you: more solid where you are, and redder (most at the foot).
  colour=mix(colour,uWarn,close*(.45+.35*(1.-h)));
  alpha=body*mix(.42,.14,near)+foot*mix(.3,.2,near);
  alpha+=close*(1.-h*.7)*mix(.55,.4,near)*(.75+.25*m);
 }else{
  // The band: strongest at the edge, gone a band's width in.
  float edge=vUV.y, m=mist(vec2(vUV.x*r*1.4+uTime*.1,uTime*.2));
  colour=mix(uFoot,uWarn,close*.9);
  alpha=pow(edge,1.6)*(.2+.14*m)+close*edge*.5;
 }
 gl_FragColor=vec4(colour,clamp(alpha,0.,.85)*uShow);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
}`;

export class DuelCircleView {
 constructor(view) {
  this.view = view; this.circle = null; this.key = '';
  const n = CIRCLE_LOOK.segments, verts = (n + 1) * 4;
  const geometry = new THREE.BufferGeometry();
  this.positions = new Float32Array(verts * 3);
  const kind = new Float32Array(verts), uv = new Float32Array(verts * 2), index = [];
  for (let i = 0; i <= n; i++) {
   const u = i / n, w = i * 2, b = (n + 1) * 2 + i * 2;
   kind[w] = kind[w + 1] = 0; uv.set([u, 0, u, 1], w * 2);
   kind[b] = kind[b + 1] = 1; uv.set([u, 1, u, 0], b * 2);   // the band: 1 at the edge, 0 inside
   if (i < n) { index.push(w, w + 1, w + 2, w + 1, w + 3, w + 2, b, b + 2, b + 1, b + 1, b + 2, b + 3); }
  }
  geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
  geometry.setAttribute('aKind', new THREE.BufferAttribute(kind, 1));
  geometry.setAttribute('aUV', new THREE.BufferAttribute(uv, 2));
  geometry.setIndex(index);
  const colour = c => new THREE.Color(c);
  this.material = new THREE.ShaderMaterial({
   uniforms: {
    uTime: { value: 0 }, uCentre: { value: new THREE.Vector3() }, uPlayer: { value: new THREE.Vector2(1e5, 1e5) },
    uWarnFrom: { value: CIRCLE_LOOK.warnFrom }, uShow: { value: 0 },
    uFoot: { value: colour(CIRCLE_LOOK.foot) }, uMist: { value: colour(CIRCLE_LOOK.mist) }, uWarn: { value: colour(CIRCLE_LOOK.warn) },
   },
   vertexShader: vertex, fragmentShader: fragment,
   transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
  this.mesh = new THREE.Mesh(geometry, this.material);
  this.mesh.name = 'duel-circle'; this.mesh.frustumCulled = false; this.mesh.renderOrder = 4;
  this.mesh.castShadow = this.mesh.receiveShadow = false;
  // In the scene from the start (hidden): the warm-up compiles its program with the rest.
  this.mesh.visible = false; view.scene.add(this.mesh);
 }

 // The circle to show ({ x, z, r }), or null. Rewrites the vertices only
 // when it changed (a new round).
 set(circle) {
  const key = circle ? circle.x.toFixed(2) + ',' + circle.z.toFixed(2) + ',' + circle.r.toFixed(2) : '';
  if (key === this.key) return;
  this.key = key; this.circle = circle ? { x: circle.x, z: circle.z, r: circle.r } : null;
  if (!circle) { this.mesh.visible = false; this.material.uniforms.uShow.value = 0; return; }
  const n = CIRCLE_LOOK.segments, p = this.positions, view = this.view, inner = Math.max(.5, circle.r - CIRCLE_LOOK.band);
  for (let i = 0; i <= n; i++) {
   const a = i / n * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
   const x = circle.x + c * circle.r, z = circle.z + s * circle.r, y = view.gy(x, z);
   const w = i * 6, b = ((n + 1) * 2 + i * 2) * 3;
   p.set([x, y - .05, z, x, y + CIRCLE_LOOK.height, z], w);
   const ix = circle.x + c * inner, iz = circle.z + s * inner;
   p.set([x, y + .04, z, ix, view.gy(ix, iz) + .04, iz], b);
  }
  const attribute = this.mesh.geometry.attributes.position; attribute.needsUpdate = true;
  this.material.uniforms.uCentre.value.set(circle.x, circle.z, circle.r);
  this.mesh.visible = true; this.material.uniforms.uShow.value = 0;
 }

 // Every frame: the mist's clock, your place (the warning), and a quick fade in.
 update(dt, player) {
  if (!this.mesh.visible) return;
  const u = this.material.uniforms;
  u.uTime.value += dt;
  if (player) u.uPlayer.value.set(player.x, player.z);
  u.uShow.value = Math.min(1, u.uShow.value + dt * 2.5);
 }
}
