import { SHOTGUN } from './shotgun.js';
import * as THREE from 'three';
import { GRENADE } from './grenade.js';

const UP=new THREE.Vector3(0,1,0);
const ease=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
export class RiflePose{
 constructor(player){
  this.body=player.userData.body;this.gun=player.userData.gun;this.staticArm=player.userData.staticArm;
  this.root=new THREE.Group();this.body.add(this.root);
  const sleeve=new THREE.MeshLambertMaterial({color:'#49716b'}),skin=new THREE.MeshLambertMaterial({color:'#d6b58a'});
  const bone=new THREE.BoxGeometry(1,1,1),palm=new THREE.BoxGeometry(.115,.10,.14);
  this.arms=[1,-1].map(side=>{
   const upper=new THREE.Mesh(bone,sleeve),lower=new THREE.Mesh(bone,sleeve),hand=new THREE.Group();
   hand.add(new THREE.Mesh(palm,skin));this.root.add(upper,lower,hand);
   return {side,upper,lower,hand,shoulder:new THREE.Vector3(),elbow:new THREE.Vector3(),target:new THREE.Vector3()};
  });
  this.offHand=this.arms[1].hand;this.delta=new THREE.Vector3();this.grip=new THREE.Vector3();
  this.throwBack=new THREE.Vector3(-.37,1.02,.12);this.throwRelease=new THREE.Vector3(-.28,1.04,-.53);this.throwFollow=new THREE.Vector3(-.28,.60,-.62);
 }
 segment(mesh,a,b,width){
  this.delta.subVectors(b,a);mesh.position.copy(a).add(b).multiplyScalar(.5);
  mesh.scale.set(width,this.delta.length(),width*.9);mesh.quaternion.setFromUnitVectors(UP,this.delta.normalize());
 }
 update(sim,focus,settle,recoil){
  const active=sim.weapon==='rifle'||sim.weapon==='shotgun';this.root.visible=active;if(this.staticArm)this.staticArm.visible=!active;
  if(!active)return;
  // Plant the torso, dip the head toward the sights, and damp the running sway.
  this.body.position.y-=focus*.035+settle*.012;
  this.body.rotation.x-=focus*.065+settle*.025;
  this.body.rotation.z*=1-focus*.65;
  this.gun.updateMatrix();
  for(const arm of this.arms){
   const off=arm.side<0;
   arm.shoulder.set(arm.side*.255,.78-focus*.015,.005);
   arm.elbow.set(off?-.27+focus*.075:.39-focus*.07,.53+focus*.085,off?-.28-focus*.065:-.14-focus*.045+recoil*.015);
   this.grip.set(0,off?-.065:-.12,off?-.20:.10).applyMatrix4(this.gun.matrix);
   arm.target.copy(this.grip);
   if(sim.weapon==='shotgun'){
    if(off){arm.elbow.set(-.19,.51,.02);arm.target.set(.28,.64,-.18+recoil*.08);}
    else{arm.elbow.set(.30,.65,-.21+recoil*.06);}
   }
   const age=sim.time-sim.grenadeThrowTime;
   if(off&&sim.weapon==='shotgun'&&sim.shotgun.reload>0){const phase=1-sim.shotgun.reload/SHOTGUN.reload;arm.target.set(-.1,.52+Math.sin(phase*Math.PI*4)*.07,-.10);}
   if(off&&sim.weapon==='rifle'&&age>=0&&age<.64){
    // Wind back, extend through release, follow through, then re-grip the fore-end.
    const back=this.throwBack,release=this.throwRelease,follow=this.throwFollow;
    if(age<.10)arm.target.lerp(back,ease(age/.10));
    else if(age<GRENADE.windup)arm.target.copy(back).lerp(release,ease((age-.10)/(GRENADE.windup-.10)));
    else if(age<.34)arm.target.copy(release).lerp(follow,ease((age-GRENADE.windup)/(.34-GRENADE.windup)));
    else arm.target.copy(follow).lerp(this.grip,ease((age-.34)/.30));
    arm.elbow.set(-.43,.65+Math.max(0,arm.target.y-.65)*.65,arm.target.z*.35);
   }
   this.segment(arm.upper,arm.shoulder,arm.elbow,.15);
   this.segment(arm.lower,arm.elbow,arm.target,.13);
   arm.hand.position.copy(arm.target);arm.hand.quaternion.copy(this.gun.quaternion);
   arm.hand.rotation.z=off?-.3-focus*.12:.12;
  }
 }
}
