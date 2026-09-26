import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeRifle } from './rifle-model.js';
import { RiflePose } from './rifle-pose.js';
import { RIFLE_QUALITY, CASING_CAPACITY, casingPose } from './rifle-quality.js';
import { NO_FX } from '../effects/effects-detail.js';
import { RIFLE, RIFLE_MUZZLE, TERRAIN } from '../config/gameplay.js';
import { groundY, floorY, hilly, roundFlight, flightRise } from '../render/ground-lift.js';
const UP=new THREE.Vector3(0,1,0);
const BULLET_GLOW=new THREE.Color('#ffd98a'),SURGE_GLOW=new THREE.Color('#f2f8ff'),PORT_SMOKE=new THREE.Color('#bdb5a2');
function disposeObject(root){const materials=new Set();root.traverse(o=>{o.geometry?.dispose();if(o.material)materials.add(o.material);});materials.forEach(m=>m.dispose());}

export class RifleView{
 constructor(view){
  this.view=view;this.gun=view.player.userData.gun;this.staticParts=[...this.gun.children];
  this.pose=new RiflePose(view.player);
  this.effects=[];this.magUnder=new WeakMap();this.lastTime=0;this.flashTime=0;this.particles=[];this.aimBlend=0;this.wasAiming=false;this.aimStarted=-10;
  this.dummy=new THREE.Object3D();this.direction=new THREE.Vector3();this.origin=new THREE.Vector3();this.glides=new WeakMap();
  this.brass=new THREE.MeshLambertMaterial({color:'#b49a58',flatShading:true});this.steel=new THREE.MeshLambertMaterial({color:'#39403c'});
  this.bulletMat=new THREE.MeshBasicMaterial({color:'#ffffff',toneMapped:false});
  this.outlineMat=new THREE.MeshBasicMaterial({color:'#10201d',side:THREE.BackSide});
  this.trailMat=new THREE.MeshBasicMaterial({color:'#fff3b0',transparent:true,opacity:.9,depthWrite:false,toneMapped:false});
  // Surge rounds: a long white beam of light behind each (additive, so it glows).
  this.beamMat=new THREE.MeshBasicMaterial({color:'#f4fbff',transparent:true,opacity:.9,depthWrite:false,toneMapped:false,blending:THREE.AdditiveBlending});
  this.sparkMat=new THREE.MeshBasicMaterial({color:'#ffe276',toneMapped:false});
  this.smokeMat=new THREE.MeshBasicMaterial({color:'#b4ad98',transparent:true,opacity:.18,depthWrite:false});
  this.smokeMat.onBeforeCompile=shader=>{
   shader.vertexShader='attribute float instanceFade; varying float vFade;\n'+shader.vertexShader;
   shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvFade=instanceFade;');
   shader.fragmentShader='varying float vFade;\n'+shader.fragmentShader;
   shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\ndiffuseColor.a*=vFade;');
  };
  this.setQuality(view.qualityName||'balanced');
 }
 batch(geometry,material,capacity){
  const mesh=new THREE.InstancedMesh(geometry,material,capacity);mesh.count=0;mesh.frustumCulled=false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.view.scene.add(mesh);return mesh;
 }
 setQuality(name){
  if(this.qualityName===name)return;
  this.qualityName=name;this.quality=RIFLE_QUALITY[name]||RIFLE_QUALITY.balanced;
  if(this.model){this.gun.remove(this.model);disposeObject(this.model);}
  this.model=makeRifle(this.quality.detail);this.model.visible=!!this.active;this.gun.add(this.model);
  this.flash=new THREE.Group();this.flash.position.z=-.515;this.model.add(this.flash);
  const flame=new THREE.Mesh(new THREE.ConeGeometry(.115,.36,5),new THREE.MeshBasicMaterial({color:'#ffcd37',toneMapped:false}));
  flame.rotation.x=-Math.PI/2;flame.position.z=-.15;this.flash.add(flame);
  if(this.quality.flashCore){
   const shapes=[];
   for(let i=0;i<(this.quality.detail===3?6:4);i++){
    const angle=i*Math.PI*2/(this.quality.detail===3?6:4),geo=new THREE.ConeGeometry(.035,.22,4);
    this.direction.set(Math.cos(angle)*.8,Math.sin(angle)*.8,-.7).normalize();
    this.dummy.position.copy(this.direction).multiplyScalar(.14);this.dummy.quaternion.setFromUnitVectors(UP,this.direction);this.dummy.scale.setScalar(1);this.dummy.updateMatrix();geo.applyMatrix4(this.dummy.matrix);shapes.push(geo);
   }
   const mesh=new THREE.Mesh(mergeGeometries(shapes),flame.material);shapes.forEach(g=>g.dispose());this.flash.add(mesh);
  }
  if(this.quality.flashCore){const core=new THREE.Mesh(new THREE.ConeGeometry(.065,.27,5),new THREE.MeshBasicMaterial({color:'#fff6d2',toneMapped:false}));core.rotation.x=-Math.PI/2;core.position.z=-.2;this.flash.add(core);}
  this.flash.visible=false;
  for(const mesh of this.batches||[]){this.view.scene.remove(mesh);mesh.geometry.dispose();mesh.dispose();}
  const segments=this.quality.radialSegments;
  // Cylindrical jacket, rounded nose, flat base: no arrow-shaped cone.
  const profile=[[0,-.10],[.034,-.10],[.034,.043],[.032,.063],[.025,.084],[.013,.098],[0,.104]].map(([r,y])=>new THREE.Vector2(r,y));
  const slug=new THREE.LatheGeometry(profile,segments);slug.scale(1.3,1,1.3);
  this.bullets=this.batch(slug,this.bulletMat,8);this.outlines=this.batch(slug.clone().scale(1.45,1.12,1.45),this.outlineMat,8);
  this.bands=this.batch(new THREE.CylinderGeometry(.046,.046,.025,segments).translate(0,-.068,0),this.brass,8);
  this.trails=this.batch(this.quality.trailTaper?new THREE.CylinderGeometry(.022,.002,.3,6):new THREE.CylinderGeometry(.013,.013,.3,4),this.trailMat,8);
  this.beams=this.batch(new THREE.CylinderGeometry(.05,.012,1,6),this.beamMat,8);
  this.casings=this.batch(new THREE.CylinderGeometry(.018,.018,.075,segments),this.brass,CASING_CAPACITY);
  this.magazines=this.batch(new THREE.BoxGeometry(.075,.045,.22),this.steel,24);
  this.sparks=this.batch(new THREE.BoxGeometry(.016,.016,.065),this.sparkMat,32);
  this.smoke=this.batch(new THREE.IcosahedronGeometry(.07,0),this.smokeMat,24);
  this.smoke.geometry.setAttribute('instanceFade',new THREE.InstancedBufferAttribute(new Float32Array(24),1));
  this.batches=[this.bullets,this.outlines,this.bands,this.trails,this.beams,this.casings,this.magazines,this.sparks,this.smoke];this.particles=[];
 }
 shot(){
  // Made at load now (see WorldView), so a shot can arrive before the view's
  // first update has seen the game.
  const sim=this.view.lastSim;if(!sim)return;const p=sim.player;
  this.flashTime=sim.time+.075;this.flash.rotation.z=Math.random()*Math.PI*2;this.flash.scale.setScalar(.85+Math.random()*.3);
  this.origin.set(.1,.01,.02);this.gun.localToWorld(this.origin);
  const backward=1+Math.random()*.8,sideways=.9+Math.random()*.9;
  // (Hills: a casing's y is kept above the ground, like every other effect;
  // wading under a deck, the ground under it, where it falls: `under`.)
  const under=!!p.below,ground=floorY(this.view, this.origin.x,this.origin.z,under);
  this.effects.push({born:sim.time,under,x:this.origin.x,y:this.origin.y-ground,z:this.origin.z,
   rx:Math.random()*Math.PI,ry:Math.random()*Math.PI*2,rz:Math.random()*Math.PI,
   vx:-p.aimX*backward-p.aimZ*sideways,vz:-p.aimZ*backward+p.aimX*sideways,vy:1.2+Math.random()*.9,
   spinX:(Math.random()-.5)*28,spinZ:(Math.random()-.5)*28,landingAngle:Math.random()*Math.PI*2});
  if(this.effects.length>CASING_CAPACITY)this.effects.shift();
  // The ejection port breathes a curl of smoke after the brass.
  const fx=this.view.fx||NO_FX;
  if(fx.on)for(let i=0,n=fx.n(2);i<n;i++)fx.puff({x:this.origin.x,y:this.origin.y-ground,z:this.origin.z,vx:(-p.aimZ+Math.random()*.4-.2)*.6,vz:(p.aimX+Math.random()*.4-.2)*.6,vy:.35,size:.03,grow:3,life:.6+Math.random()*.4,alpha:.26,color:PORT_SMOKE});
  const x=p.x+p.aimX*.975-p.aimZ*.27,z=p.z+p.aimZ*.975+p.aimX*.27;
  for(let i=0;i<this.quality.sparks+this.quality.smoke;i++){
   const smoke=i>=this.quality.sparks,speed=smoke?.4:2+Math.random()*2,side=(Math.random()-.5)*2;
   this.particles.push({smoke,born:sim.time,x,y:.74,z,vx:p.aimX*speed-p.aimZ*side,vz:p.aimZ*speed+p.aimX*side,vy:smoke?.55:Math.random()*1.5,life:smoke?.48+Math.random()*.16:.10+Math.random()*.09,phase:Math.random()*Math.PI*2});
  }
 }
 clear(){this.effects=[];this.particles=[];this.flashTime=0;this.aimBlend=0;this.wasAiming=false;this.aimStarted=-10;this.glides=new WeakMap();for(const b of this.batches)b.count=0;}
 visible(sim,x,z){
  const radius=Math.max(20,(this.view.cameraHeight||29)*Math.max(1,this.view.camera?.aspect||1));
  return Math.abs(x-sim.player.x)<radius&&Math.abs(z-sim.player.z)<radius&&sim.canSeeEntity(x,z,.05);
 }
 place(batch,index,x,y,z,rx=0,ry=0,rz=0,scale=1){
  this.dummy.position.set(x,y,z);this.dummy.rotation.set(rx,ry,rz,'YXZ');this.dummy.scale.setScalar(scale);this.dummy.updateMatrix();batch.setMatrixAt(index,this.dummy.matrix);
 }
 update(sim){
  const poseDt=Math.max(0,Math.min(.1,sim.time-this.lastTime));
  if(sim.time<this.lastTime)this.clear();this.lastTime=sim.time;this.setQuality(this.view.qualityName||'balanced');
  const active=sim.weapon==='rifle';this.model.visible=active;
  const aiming=active&&sim.rifle.aiming;
  if(aiming&&!this.wasAiming)this.aimStarted=sim.time;
  this.wasAiming=aiming;this.aimBlend+=(Number(aiming)-this.aimBlend)*(1-Math.exp(-18*poseDt));
  const focusAge=sim.time-this.aimStarted,settle=aiming&&focusAge<.30?Math.sin(focusAge/.30*Math.PI):0;
  const recoil=active?Math.max(0,(this.flashTime-sim.time)/.075):0;
  this.gun.position.set(.27-this.aimBlend*.025,.74+this.aimBlend*.085+settle*.025,-.46+this.aimBlend*.035+recoil*.025);
  if(active)this.gun.rotation.x=-this.aimBlend*.06-settle*.035-recoil*.035;
  this.pose.update(sim,this.aimBlend,settle,recoil);
  this.active=active;this.staticParts.forEach(p=>p.visible=sim.weapon==='static');
  this.flash.visible=active&&sim.time<this.flashTime;
  let count=0,beams=0;const fx=this.view.fx||NO_FX;
  const view=this.view,hills=hilly(view);
  for(const b of sim.rifleBullets){
   if(count>=8||!this.visible(sim,b.x,b.z))continue;
   // Hills: a round is drawn on its flight over the ground (heightfield.js
   // flight, the very line the simulation hits things by), the muzzle's
   // height over a line that follows the ground from where its shooter
   // stood; where the ground stops it, it meets the rise.
   let y=.74,rise=0;
   if(hills){
    const sx=b.x-b.dx*b.travel,sz=b.z-b.dz*b.travel,from=b.oy??(b.ox!==undefined?groundY(view,b.ox,b.oz):groundY(view,sx-b.dx*RIFLE_MUZZLE.forward,sz-b.dz*RIFLE_MUZZLE.forward));
    const f=roundFlight(view,this.glides,b,sx,sz,from,RIFLE.maxRange,b.ox!==undefined?Math.hypot(sx-b.ox,sz-b.oz):RIFLE_MUZZLE.forward);y=TERRAIN.roundHeight+view.ground.flightAt(f,b.travel);rise=flightRise(view.ground,f,b.travel);
   }
   this.dummy.position.set(b.x,y,b.z);this.direction.set(b.dx,rise,b.dz);if(hills)this.direction.normalize();this.dummy.quaternion.setFromUnitVectors(UP,this.direction);this.dummy.scale.setScalar(1);this.dummy.updateMatrix();
   this.bullets.setMatrixAt(count,this.dummy.matrix);this.outlines.setMatrixAt(count,this.dummy.matrix);this.bands.setMatrixAt(count,this.dummy.matrix);
   // A soft hot glow riding each round, drawn by the detail layer.
   if(fx.on)fx.glow({x:b.x,y:y-groundY(view, b.x,b.z),z:b.z,size:b.surge?.55:.32,life:.03,color:b.surge?SURGE_GLOW:BULLET_GLOW,glow:b.surge?1.4:.9});
   if(b.surge){
    // A white beam trailing the round, up to 2.4 m long.
    const beam=Math.min(2.4,b.travel+.2);this.dummy.position.set(b.x-b.dx*beam/2,y-rise*beam/2,b.z-b.dz*beam/2);this.dummy.scale.set(1,beam,1);this.dummy.updateMatrix();this.beams.setMatrixAt(beams++,this.dummy.matrix);this.dummy.position.set(b.x,y,b.z);this.dummy.scale.setScalar(1);this.dummy.updateMatrix();
   }
   const length=Math.min(this.quality.trailLength??.3,b.travel);this.dummy.position.addScaledVector(this.direction,-length/2-.08);this.dummy.scale.set(1,length/.3,1);this.dummy.updateMatrix();this.trails.setMatrixAt(count,this.dummy.matrix);count++;
  }
  this.bullets.count=this.outlines.count=count;this.beams.count=beams;if(beams)this.beams.instanceMatrix.needsUpdate=true;this.trails.count=this.quality.trail?count:0;
  this.bands.count=this.quality.detail>=2?count:0;
  count=0;let kept=0;
  for(const e of this.effects){
   const pose=casingPose(e,sim.time);if(pose.expired)continue;this.effects[kept++]=e;
   if(e.seenX!==sim.player.x||e.seenZ!==sim.player.z||sim.time>=(e.checkAt||0)){
    e.visible=this.visible(sim,pose.x,pose.z);e.seenX=sim.player.x;e.seenZ=sim.player.z;e.checkAt=sim.time+.15;
   }
   if(e.visible)this.place(this.casings,count++,pose.x,pose.y+floorY(view, pose.x,pose.z,e.under),pose.z,pose.rx,pose.ry,pose.rz);
  }
  this.effects.length=kept;this.casings.count=count;count=0;
  for(const m of sim.magazines){if(count>=24||!this.visible(sim,m.x,m.z))continue;const under=this.magUnder.get(m)??(this.magUnder.set(m,!!sim.player.below),!!sim.player.below);this.place(this.magazines,count++,m.x,.025+Math.max(0,.6-4.9*m.age*m.age)+floorY(view, m.x,m.z,under),m.z,0,m.angle,0,1);}
  this.magazines.count=count;
  let sparks=0,smoke=0;kept=0;
  for(const p of this.particles){
   const age=sim.time-p.born;if(age>=p.life)continue;this.particles[kept++]=p;
   const x=p.x+p.vx*age,z=p.z+p.vz*age;if(!this.visible(sim,x,z))continue;
   if(p.smoke&&smoke<24){
    this.smoke.geometry.attributes.instanceFade.setX(smoke,(1-age/p.life)**2);
    this.place(this.smoke,smoke++,x+Math.sin(p.phase+age*5)*age*.1,p.y+p.vy*age+groundY(view, x,z),z,age,p.phase,age*3,1+age*6);
   }
   else if(!p.smoke&&sparks<32)this.place(this.sparks,sparks++,x,p.y+p.vy*age-3*age*age+groundY(view, x,z),z,age*3,age*5,0,1-age/p.life);
  }
  this.particles.length=kept;this.sparks.count=sparks;this.smoke.count=smoke;
  if(smoke)this.smoke.geometry.attributes.instanceFade.needsUpdate=true;
  for(const batch of this.batches)if(batch.count)batch.instanceMatrix.needsUpdate=true;
 }
}
