import * as THREE from 'three';
import { scopeActive, scopeFacing, SIGHTLINE } from '../weapons/sightline.js';
const originals=new WeakMap();

// Color the actual world fragments, not a projected CSS cutout. Hills and
// camera motion cannot fold this cone, and there is no extra full-screen pass.
export class ScopeShading {
 constructor(){
  this.materials=new WeakSet();
  this.limit={value:-2};this.origin={value:new THREE.Vector2()};this.facing={value:new THREE.Vector2(1,0)};
 }
 update(sim){
  this.limit.value=scopeActive(sim)?Math.cos(SIGHTLINE.cone*Math.PI/360):-2;
  const f=scopeFacing(sim.player);this.origin.value.set(sim.player.x,sim.player.z);this.facing.value.set(f.x,f.z);
 }
 // `only` (v0.990a merge): the root's children to shade (the warm-up passes
 // the world as it stood before its staging). Stand-ins for materials that
 // play makes fresh or clips indoors later (the warm rack, the staged deaths)
 // must keep their plain keys: hooked here, they warmed a program nothing in
 // play asks for, and the real one was then built mid-game (a Static orb's
 // seed, aura and arcs: tools/program-check.mjs, 3-4 programs on Deadwater).
 apply(root,only=null){
  const shade=o=>{for(const m of Array.isArray(o.material)?o.material:[o.material])this.material(m);};
  if(!only){root.traverse(shade);return;}
  for(const child of root.children)if(only.has(child))child.traverse(shade);
 }
 material(m){
  if(!m||m.userData.ownSightlineGuide||m.isShaderMaterial||m.isMeshDepthMaterial||m.isMeshDistanceMaterial||this.materials.has(m))return;
  this.materials.add(m);
  // A few cached world materials survive a map/view rebuild. Replace our
  // previous hook rather than adding the same GLSL declarations a second time.
  if(!originals.has(m))originals.set(m,{before:m.onBeforeCompile,key:m.customProgramCacheKey()});
  const {before,key}=originals.get(m);
  m.onBeforeCompile=shader=>{
   before.call(m,shader);
   shader.uniforms.scopeGrayLimit=this.limit;shader.uniforms.scopeGrayOrigin=this.origin;shader.uniforms.scopeGrayFacing=this.facing;
   shader.vertexShader='varying vec2 scopeGrayWorld;\n'+shader.vertexShader;
   shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>',`vec4 scopeGrayPosition=vec4(transformed,1.0);
    #ifdef USE_INSTANCING
    scopeGrayPosition=instanceMatrix*scopeGrayPosition;
    #endif
    scopeGrayWorld=(modelMatrix*scopeGrayPosition).xz;
    #include <project_vertex>`);
   shader.fragmentShader='varying vec2 scopeGrayWorld; uniform float scopeGrayLimit; uniform vec2 scopeGrayOrigin; uniform vec2 scopeGrayFacing;\n'+shader.fragmentShader;
   shader.fragmentShader=shader.fragmentShader.replace('#include <tonemapping_fragment>',`
    if(scopeGrayLimit>0.){
     vec2 scopeDelta=scopeGrayWorld-scopeGrayOrigin;float scopeDistance=length(scopeDelta);
     float scopeDot=dot(scopeDelta,scopeGrayFacing)/max(.001,scopeDistance);
     float outside=(1.-smoothstep(scopeGrayLimit-.004,scopeGrayLimit+.004,scopeDot))*smoothstep(.6,.85,scopeDistance);
     float gray=dot(gl_FragColor.rgb,vec3(.299,.587,.114));
     gl_FragColor.rgb=mix(gl_FragColor.rgb,vec3(gray)*.48,outside);
    }
    #include <tonemapping_fragment>`);
  };
  m.customProgramCacheKey=()=>key+'|scope-world-gray-v1';m.needsUpdate=true;
 }
}
