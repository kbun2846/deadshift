import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeSidekick,poseSidekick } from './sidekick-model.js';
import { SIDEKICK as S } from '../config/gameplay.js';
const WHITE=new THREE.Color('#ecf2d9'),STEEL=new THREE.Color('#504e40'),RED=new THREE.Color('#ff3042'),GREEN=new THREE.Color('#65ed91'),RIM=new THREE.Color('#74705a'),FRIEND_RIM=new THREE.Color('#a7b69a'),GREEN_IDLE=new THREE.Color('#6bc185');
// One merged silhouette per echo, instanced and faded. Never clone a body each frame.
function silhouette(){
 const parts=[],part=(g,x,y,z)=>{g.translate(x,y,z);parts.push(g);};
 part(new THREE.CylinderGeometry(.23,.28,.60,7),0,.58,0);part(new THREE.CylinderGeometry(.38,.38,.07,9),0,1.06,0);part(new THREE.CylinderGeometry(.19,.23,.22,7),0,1.20,0);
 for(const side of [-1,1]){part(new THREE.BoxGeometry(.17,.28,.26),side*.15,.14,0);part(new THREE.BoxGeometry(.13,.13,.52),side*.27,.71,-.24);part(new THREE.BoxGeometry(.11,.12,.34),side*.27,.74,-.52);}
 const result=mergeGeometries(parts);parts.forEach(g=>g.dispose());return result;
}
export class SidekickView{
 constructor(view){
  this.view=view;this.model=makeSidekick();this.model.userData.local=true;this.model.visible=false;view.player.userData.gun.add(this.model);
  this.clock=0;this.echoes=[];this.lastEcho=new Map();this.dummy=new THREE.Object3D();this.axis=new THREE.Vector3();this.up=new THREE.Vector3(0,1,0);
  const batch=(geo,cap,opacity=1)=>{const mesh=new THREE.InstancedMesh(geo,new THREE.MeshBasicMaterial({color:'#ffffff',transparent:opacity<1,opacity,depthWrite:opacity===1,toneMapped:false}),cap);mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.setColorAt(0,WHITE);mesh.frustumCulled=false;mesh.count=0;view.scene.add(mesh);return mesh;};
  this.rounds=batch(new THREE.BoxGeometry(.035,1,.035),48,.85);
  this.discs=batch(new THREE.CylinderGeometry(.24,.27,.055,12),24);this.rims=batch(new THREE.TorusGeometry(.19,.012,3,12).rotateX(Math.PI/2),24);
  this.dots=batch(new THREE.OctahedronGeometry(.037),24);this.ghosts=batch(silhouette(),48,.20);
  this.fade=new THREE.InstancedBufferAttribute(new Float32Array(48),1);this.fade.setUsage(THREE.DynamicDrawUsage);this.ghosts.geometry.setAttribute('echoFade',this.fade);
  this.ghosts.material.onBeforeCompile=s=>{s.vertexShader='attribute float echoFade;varying float vEchoFade;\n'+s.vertexShader;s.vertexShader=s.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvEchoFade=echoFade;');s.fragmentShader='varying float vEchoFade;\n'+s.fragmentShader;s.fragmentShader=s.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\ndiffuseColor.a*=vEchoFade;');};
  this.ghosts.material.customProgramCacheKey=()=> 'sidekick-echo';this.ghosts.renderOrder=2;
  this.meshes=[this.rounds,this.discs,this.rims,this.dots,this.ghosts];
 }
 clear(){this.echoes.length=0;this.lastEcho.clear();for(const m of this.meshes)m.count=0;}
 put(mesh,x,y,z,yaw=0,sx=1,sy=sx,sz=sx,color=WHITE){if(mesh.count>=mesh.instanceMatrix.count)return;const d=this.dummy;d.position.set(x,y,z);d.rotation.set(0,yaw,0);d.scale.set(sx,sy,sz);d.updateMatrix();mesh.setMatrixAt(mesh.count,d.matrix);mesh.setColorAt(mesh.count,color);mesh.count++;}
 event(e){
  if(e.type==='sidekickShot')this.view.fx.muzzle('rifle',e.x,.74,e.z,e.dx,e.dz,0);
  if(e.type==='sidekickImpact')this.view.burst(e.x,e.z,3,'dust');
  if(e.type==='sidekickRush'){const fx=this.view.fx;fx.glow({x:e.x,y:.75,z:e.z,size:1.3,life:.45,color:WHITE});for(let i=0;i<fx.n(12);i++)fx.spark({x:e.x,y:.75,z:e.z,vx:(Math.random()-.5)*2,vz:(Math.random()-.5)*2,vy:.8,life:.35,length:.09,width:.025});}
 }
 update(sim,dt){
  this.clock+=dt;for(const m of this.meshes)m.count=0;
  const v=this.view,p=sim.player;this.model.visible=sim.weapon==='sidekick'&&!p.dead;
  if(this.model.visible){poseSidekick(this.model,sim.sidekick,this.clock);v.rifleView.pose.update(sim,sim.sidekick.aiming?.6:0,0,0);}
  const visible=(x,z)=>sim.canSeeEntity(x,z,.05);
  for(const m of sim.sidekickMines||[]){if(!visible(m.x,m.z))continue;const y=m.y+.045;
   const friendly=!m.enemy,armed=m.age>=S.mineArm,flash=armed&&(m.age%1.05)<.16;
   this.put(this.discs,m.x,y,m.z,0,1,1,1,STEEL);
   // Friendly markers keep a readable floor between blinks. These existing
   // unlit batches stay legible in shade without lights or revealing enemies.
   const rimScale=friendly?1.23:1;
   this.put(this.rims,m.x,y+.03,m.z,0,rimScale,1,rimScale,friendly?FRIEND_RIM:RIM);
   const pulse=friendly?(armed?(flash?2:1.35):1.1):(armed?(flash?1:.12):.18);
   this.put(this.dots,m.x,y+.055,m.z,0,pulse,pulse,pulse,friendly?(flash?GREEN:GREEN_IDLE):RED);
  }
  for(const b of sim.sidekickRounds||[]){if(!visible(b.x,b.z))continue;const length=Math.min(.9,b.travel+.1),d=this.dummy;d.position.set(b.x-b.dx*length/2,b.y,b.z-b.dz*length/2);d.quaternion.setFromUnitVectors(this.up,this.axis.set(b.dx,0,b.dz));d.scale.set(1,length,1);d.updateMatrix();const i=this.rounds.count;if(i<48){this.rounds.setMatrixAt(i,d.matrix);this.rounds.setColorAt(i,WHITE);this.rounds.count++;}}
  const people=[...v.remotePlayers||[]];if(this.model.visible)people.push({...p,sidekick:sim.sidekick});
  const spacing=['quality','extreme'].includes(v.qualityName)?.06:.10;
  for(const body of people){const own=body.id===p.id,avatar=own?v.player:v.remote?.avatars.get(body.id)?.root;
   if(!body.sidekick?.active||body.hp<=0||!avatar?.visible||Math.hypot(body.vx,body.vz)<1)continue;
   const last=this.lastEcho.get(body.id);if(last&&this.clock-last.time<spacing)continue;
   const y=body.below?v.ground.drawnHeightAt(body.x,body.z):v.gy(body.x,body.z);
   this.lastEcho.set(body.id,{time:this.clock});if(this.echoes.length>=48)this.echoes.shift();
   this.echoes.push({x:body.x,z:body.z,y,yaw:Math.atan2(-body.aimX,-body.aimZ),born:this.clock});
  }
  for(const [id,last] of this.lastEcho)if(this.clock-last.time>2)this.lastEcho.delete(id);
  this.echoes=this.echoes.filter(e=>this.clock-e.born<.40);
  for(const e of this.echoes){if(!visible(e.x,e.z))continue;const i=this.ghosts.count;this.put(this.ghosts,e.x,e.y,e.z,e.yaw,1,1,1,WHITE);this.fade.setX(i,(1-(this.clock-e.born)/.4)**2);}
  this.fade.needsUpdate=true;for(const m of this.meshes){m.visible=m.count>0;if(m.count){m.instanceMatrix.needsUpdate=true;m.instanceColor.needsUpdate=true;}}
 }
}
