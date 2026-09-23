import * as THREE from 'three';
import { makeBoneBank } from './death-bones.js';
import { DeathCorpse } from './death-corpse.js';
import { deathReaction } from './death-reactions.js';

export function bloodPoolPattern(index){
 const profiles=[[.85,.68,11,.11],[.7,.9,13,.23],[.96,.6,10,.37],[.76,.79,14,.52],[.88,.74,12,.71]];
 const [width,depth,count,phase]=profiles[index%profiles.length];
 const lobes=Array.from({length:count},(_,i)=>{
  const a=i*Math.PI*2/count+phase,r=.44+.14*Math.sin(i*2.3+phase*9),size=.2+.12*(.5+.5*Math.sin(i*4.1+phase));
  return {x:Math.cos(a)*r*width/.7,z:Math.sin(a)*r*depth/.7,size,stretch:.65+.5*(.5+.5*Math.cos(i*1.7+phase))};
 });
 return {width,depth,lobes};
}

export class DeathView{
 constructor(view){this.view=view;this.active=false;}
 start(event){
  this.clear();this.active=true;this.age=0;this.event=event;
  const view=this.view;view.player.updateMatrixWorld(true);
  this.cameraStart={x:view.focus?.x??event.x,z:view.focus?.z??event.z,height:view.cameraHeight||29};
  const source=view.player.userData.gun,inverse=new THREE.Matrix4().copy(source.matrixWorld).invert();
  this.gun=new THREE.Group();
  // Snapshot only the visible solid weapon, reusing its existing geometry/materials.
  source.traverseVisible(part=>{if(!part.isMesh||part.material.transparent)return;const mesh=new THREE.Mesh(part.geometry,part.material);mesh.matrix.copy(inverse).multiply(part.matrixWorld);mesh.matrixAutoUpdate=false;this.gun.add(mesh);});
  source.matrixWorld.decompose(this.gun.position,this.gun.quaternion,this.gun.scale);
  this.origin=this.gun.position.clone();this.rotation=this.gun.rotation.clone();view.scene.add(this.gun);
  view.player.visible=false;
  this.reaction=deathReaction(event.damageType);
  if(this.reaction.mode!=='scatter'){this.corpse=new DeathCorpse(view,event,this.reaction);this.update(0);return;}
  this.pool=new THREE.Group();this.pool.position.set(event.x,.028,event.z);view.scene.add(this.pool);
  this.material=new THREE.MeshBasicMaterial({color:'#ce3041',depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1});
  this.poolGeometry=new THREE.CircleGeometry(1,24);this.lobeGeometry=new THREE.CircleGeometry(1,10);
  const direction=new THREE.Vector2(event.directionX||0,event.directionZ||0).normalize(),directed=direction.lengthSq()>0;
  const pattern=bloodPoolPattern(Math.floor(Math.random()*5));this.pool.rotation.y=directed?-Math.atan2(direction.y,direction.x):Math.random()*Math.PI*2;
  const core=new THREE.Mesh(this.poolGeometry,this.material);core.rotation.x=-Math.PI/2;core.position.x=directed?.38:0;core.scale.set(pattern.width*(directed?1.3:1),pattern.depth*(directed?.8:1),1);this.pool.add(core);
  for(const part of pattern.lobes){
   const lobe=new THREE.Mesh(this.lobeGeometry,this.material);lobe.rotation.x=-Math.PI/2;lobe.position.set(directed?part.x*1.3+.45:part.x,.001,part.z*(directed?.8:1));lobe.scale.set(part.size*(directed?1.25:1),part.size*part.stretch,1);this.pool.add(lobe);
  }
  if(directed)for(let i=0;i<4;i++){
   const streak=new THREE.Mesh(this.lobeGeometry,this.material);streak.rotation.x=-Math.PI/2;
   streak.position.set(.9+i*.25,.002,Math.sin(i*2.4+pattern.width)*(.12+i*.07));
   streak.scale.set(.36-i*.05,.11-i*.017,1);this.pool.add(streak);
  }
  const count={potato:16,performance:28,balanced:52,quality:80,extreme:110}[view.qualityName]||52;
  this.dropGeometry=new THREE.IcosahedronGeometry(1,0);this.drops=new THREE.InstancedMesh(this.dropGeometry,this.material,count);this.drops.frustumCulled=false;view.scene.add(this.drops);
  this.dummy=new THREE.Object3D();this.particles=[];
  for(let i=0;i<count;i++){
   const a=i*2.39996,speed=.55+(i%11)*.085;
   const push=directed?2.3+(i%9)*.19:0;
   this.particles.push({vx:Math.cos(a)*speed+direction.x*push,vz:Math.sin(a)*speed+direction.y*push,vy:1.4+(i%7)*.22,y:.35+(i%5)*.15,size:.035+(i%4)*.011});
  }
  this.boneBank=makeBoneBank();this.bones=new THREE.Group();view.scene.add(this.bones);this.boneParticles=[];
  for(let i=0;i<11;i++){
   const kind=i===0?5:i===1?3:Math.floor(Math.random()*5),organ=i>=8,model=(organ?this.boneBank.organs[i-8]:this.boneBank.models[kind]).clone();this.bones.add(model);
   const a=Math.random()*Math.PI*2,speed=.45+Math.random()*.8,push=directed?1.7+Math.random()*1.5:0;
   const scale=.85+Math.random()*.3;model.scale.setScalar(scale);
   this.boneParticles.push({model,vx:Math.cos(a)*speed+direction.x*push,vz:Math.sin(a)*speed+direction.y*push,vy:1.1+Math.random()*1.4,y:.45+Math.random()*.45,
    angle:Math.random()*Math.PI*2,spin:(Math.random()-.5)*14,floor:(organ?(i===8?.1:.055):kind===5?.13:.055)*scale,flatAngle:organ?0:-Math.PI/2});
  }
  this.update(0);
 }
 cameraFrame(){
  const t=Math.min(1,this.age/4),blend=t*t*(3-2*t),e=this.event,start=this.cameraStart;
  return {x:start.x+(e.x+(e.directionX||0)*.65-start.x)*blend,z:start.z+(e.z+(e.directionZ||0)*.65-start.z)*blend,height:start.height*(1-.44*blend)};
 }
 update(dt){
  if(!this.active)return;this.age+=dt;const t=this.age,e=this.event;
  const travel=Math.min(t,.7),settle=Math.min(1,t/.62);
  this.gun.position.set(this.origin.x+(-e.aimZ*.75+e.aimX*.35)*travel,Math.max(.12,this.origin.y+1.2*t-4.9*t*t),this.origin.z+(e.aimX*.75+e.aimZ*.35)*travel);
  this.gun.rotation.set(this.rotation.x,this.rotation.y+.8*settle,this.rotation.z+Math.PI*.47*settle);
  if(this.corpse){this.corpse.update(t);return;}
  this.pool.scale.setScalar(.1+1.5*(1-Math.exp(-t*1.7)));
  this.particles.forEach((p,i)=>{
   const flight=(p.vy+Math.sqrt(p.vy*p.vy+19.6*(p.y-.035)))/9.8,age=Math.min(t,flight),landed=t>=flight;
   this.dummy.position.set(e.x+p.vx*age,Math.max(.035,p.y+p.vy*age-4.9*age*age),e.z+p.vz*age);
   this.dummy.rotation.set(landed?0:age*4,i*1.7,landed?0:age*3);
   this.dummy.scale.set(p.size*(landed?1.8:1),p.size*(landed?.2:1.4),p.size*(landed?1.5:1));this.dummy.updateMatrix();this.drops.setMatrixAt(i,this.dummy.matrix);
  });this.drops.instanceMatrix.needsUpdate=true;
  for(const b of this.boneParticles){
   const flight=(b.vy+Math.sqrt(b.vy*b.vy+19.6*(b.y-b.floor)))/9.8,age=Math.min(t,flight),landed=t>=flight;
   b.model.position.set(e.x+b.vx*age,Math.max(b.floor,b.y+b.vy*age-4.9*age*age),e.z+b.vz*age);
   // Settle broad faces on the ground, retaining a random in-plane orientation.
   const fall=Math.min(1,age/flight),flat=fall*fall*(3-2*fall);
   b.model.rotation.set((b.angle+age*b.spin)*(1-flat)+b.flatAngle*flat,b.angle,landed?0:(1-flat)*age*b.spin*.45);
  }
 }
 // Respawned: the body stays where it fell (it goes at the next death, a map
 // reset or leaving), settled, and the camera and the player are handed back.
 release(){
  if(!this.active)return;
  this.update(Math.max(0,6-this.age));
  this.active=false;this.view.player.visible=true;
 }
 clear(){
  this.active=false;this.view.player.visible=true;
  this.corpse?.dispose();this.corpse=null;
  for(const object of [this.gun,this.pool,this.drops,this.bones])object?.removeFromParent();
  this.boneBank?.dispose();this.boneBank=null;this.bones=null;this.boneParticles=[];
  for(const resource of [this.material,this.poolGeometry,this.lobeGeometry,this.dropGeometry])resource?.dispose();
  this.material=this.poolGeometry=this.lobeGeometry=this.dropGeometry=null;
  this.gun=this.pool=this.drops=null;
 }
}
