import { SHOTGUN } from './shotgun.js';
import * as THREE from 'three';
import { GRENADE } from './grenade.js';

const UP=new THREE.Vector3(0,1,0);
const ease=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
export class RiflePose{
 constructor(player,{sleeveColor='#49716b',skinColor='#d6b58a'}={}){
  this.player=player;this.body=player.userData.body;this.gun=player.userData.gun;
  this.root=new THREE.Group();this.body.add(this.root);
  const sleeve=new THREE.MeshLambertMaterial({color:sleeveColor}),skin=new THREE.MeshLambertMaterial({color:skinColor});
  const bone=new THREE.BoxGeometry(1,1,1),palm=new THREE.BoxGeometry(.115,.10,.14);
  this.arms=[1,-1].map(side=>{
   const upper=new THREE.Mesh(bone,sleeve),lower=new THREE.Mesh(bone,sleeve),hand=new THREE.Group();
   const palmMesh=new THREE.Mesh(palm,skin);hand.add(palmMesh);this.root.add(upper,lower,hand);
   // (A blade death can take this arm off: death-corpse.js reads `limb`.)
   for(const part of [upper,lower,palmMesh])part.userData.limb='arm'+side;
   return {side,upper,lower,hand,shoulder:new THREE.Vector3(),elbow:new THREE.Vector3(),target:new THREE.Vector3()};
  });
  this.offHand=this.arms[1].hand;this.delta=new THREE.Vector3();this.grip=new THREE.Vector3();this.sidekickGrip=new THREE.Vector3();this.armAxis=new THREE.Vector3();this.armBend=new THREE.Vector3();
  this.throwBack=new THREE.Vector3(-.37,1.02,.12);this.throwRelease=new THREE.Vector3(-.28,1.04,-.53);this.throwReleaseRig=new THREE.Vector3(-.22,.96,-.38);this.throwFollow=new THREE.Vector3(-.28,.60,-.62);
 }
 segment(mesh,a,b,width){
  this.delta.subVectors(b,a);mesh.position.copy(a).add(b).multiplyScalar(.5);
  mesh.scale.set(width,this.delta.length(),width*.9);mesh.quaternion.setFromUnitVectors(UP,this.delta.normalize());
 }
 solveSightlineArm(arm,katana=false){
  // Fixed limb lengths: a distant draw/reload target must never stretch a sleeve.
  const upper=.33,lower=.35,axis=this.armAxis.subVectors(arm.target,arm.shoulder),distance=Math.max(.025,Math.min(upper+lower-.005,axis.length()));
  axis.normalize();arm.target.copy(arm.shoulder).addScaledVector(axis,distance);
  const along=(upper*upper-lower*lower+distance*distance)/(2*distance),height=Math.sqrt(Math.max(0,upper*upper-along*along));
  const pole=this.armBend.set(katana?arm.side*.47:arm.side<0?-.15:.65,.48,katana?-.12:arm.side<0?-.70:-.25).sub(arm.shoulder);
  pole.addScaledVector(axis,-pole.dot(axis)).normalize();
  arm.elbow.copy(arm.shoulder).addScaledVector(axis,along).addScaledVector(pole,height);
 }
 update(sim,focus,settle,recoil){
  const sightline=sim.weapon==='sightline',sidekick=sim.weapon==='sidekick';
  // (v0.999a: the skin can change in play, player-skin.js, so its Static arm
  // is looked up each time; a rigged figure, figure-rig.js, draws its own
  // arms from the hand goals worked out here.)
  const rig=this.player.userData.rig,staticArm=this.player.userData.staticArm;
  const active=sim.weapon==='sheath'||sim.weapon==='ichor'||sim.weapon==='rifle'||sim.weapon==='shotgun'||sightline||sidekick;this.root.visible=active&&!rig;if(staticArm)staticArm.visible=!active;
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
   if(sightline){
    const s=sim.sightline,pack=this.gun.getObjectByName('sightline-loadout'),pose=pack?.userData.sightlinePose,h=pose?.drawBlend||0,rifle=pack?.getObjectByName('sightline-rifle'),pistol=pack?.getObjectByName('sightline-pistol');
    if(rifle&&pistol){
     const weapon=rifle;rifle.updateMatrix();pistol.updateMatrix();
     {
      this.grip.set(off?-.01:0,off?-.065:-.12,off?.04:.10);
      if(s.rifleReload>0&&weapon===rifle){const phase=1-s.rifleReload/4.2;
       if(off&&phase>.20&&phase<.75)this.grip.copy(rifle.getObjectByName('sightline-loading-round').position);
       else if(!off&&(phase<.20||phase>.75))this.grip.set(.18,.01,.06+rifle.getObjectByName('sightline-bolt').position.z);
      }
      arm.target.copy(this.grip.applyMatrix4(weapon.matrix).applyMatrix4(this.gun.matrix));
      this.sidekickGrip.set(0,-.12,.10);
      if(s.pistolReload>0&&off)this.sidekickGrip.set(0,-.24-.23*Math.sin((1-s.pistolReload/2)*Math.PI),.08);
      this.sidekickGrip.applyMatrix4(pistol.matrix).applyMatrix4(this.gun.matrix);
      if(off&&!s.pistolReload)this.sidekickGrip.set(-.34,.55,-.20);
      arm.target.lerpVectors(this.sidekickGrip,arm.target,ease((h-(off?.78:.17))/(off?.18:.22)));
     }
     if(off)arm.shoulder.set(-.22,.78,-.09);
     this.solveSightlineArm(arm);
    }
   }
   if(sidekick){
    const pack=this.gun.getObjectByName('sidekick-loadout'),held=pack?.getObjectByName(off?'sidekick-off':'sidekick-main');
    if(held){held.updateMatrix();arm.target.set(0,-.12,.10).applyMatrix4(held.matrix).applyMatrix4(this.gun.matrix);
     if(off){const reach=pack.userData.sidekickPose?.reach||0;this.sidekickGrip.set(-.30,.52,-.06);arm.target.lerpVectors(this.sidekickGrip,arm.target,reach);}
     this.solveSightlineArm(arm);
    }
   }
   if(sim.weapon==='ichor'){
    const pack=this.gun.getObjectByName('ichor-loadout'),blade=pack?.getObjectByName('ichor-blade');
    if(blade){blade.updateMatrix();arm.target.set(0,0,off?.19:.025).applyMatrix4(blade.matrix).applyMatrix4(this.gun.matrix);this.solveSightlineArm(arm,true);}
   }
   // Sheath (sheath-model.js poseSheath): both hands on the grip while the
   // sword is out; sheathed, the right hangs and the left rests on the throat.
   if(sim.weapon==='sheath'){
    const hands=this.gun.getObjectByName('sheath-loadout')?.userData.sheathPose?.hands;
    if(hands){arm.target.copy(off?hands.left:hands.right).applyMatrix4(this.gun.matrix);this.solveSightlineArm(arm,true);}
   }
   const age=sim.time-sim.grenadeThrowTime;
   if(off&&sim.weapon==='shotgun'&&sim.shotgun.reload>0){const phase=1-sim.shotgun.reload/SHOTGUN.reload;arm.target.set(-.1,.52+Math.sin(phase*Math.PI*4)*.07,-.10);}
   if(off&&sim.weapon==='rifle'&&age>=0&&age<.64){
    // Wind back, extend through release, follow through, then re-grip the fore-end.
    const back=this.throwBack,release=rig?this.throwReleaseRig:this.throwRelease,follow=this.throwFollow;
    if(age<.10)arm.target.lerp(back,ease(age/.10));
    else if(age<GRENADE.windup)arm.target.copy(back).lerp(release,ease((age-.10)/(GRENADE.windup-.10)));
    else if(age<.34)arm.target.copy(release).lerp(follow,ease((age-GRENADE.windup)/(.34-GRENADE.windup)));
    else arm.target.copy(follow).lerp(this.grip,ease((age-.34)/.30));
    arm.elbow.set(-.43,.65+Math.max(0,arm.target.y-.65)*.65,arm.target.z*.35);
   }
   if(rig)continue;
   this.segment(arm.upper,arm.shoulder,arm.elbow,.15);
   this.segment(arm.lower,arm.elbow,arm.target,.13);
   arm.hand.position.copy(arm.target);arm.hand.quaternion.copy(this.gun.quaternion);
   arm.hand.rotation.z=off?-.3-focus*.12:.12;
   if(sim.weapon==='sheath'){const pack=this.gun.getObjectByName('sheath-loadout'),hands=pack?.userData.sheathPose?.hands,blade=pack?.getObjectByName('sheath-blade');if(blade&&(off?hands?.leftGrip:hands?.rightGrip)){arm.hand.quaternion.copy(this.gun.quaternion).multiply(blade.quaternion);arm.hand.rotateZ(off?-.35:.35);}}
   if(sim.weapon==='ichor'){const blade=this.gun.getObjectByName('ichor-blade');if(blade){arm.hand.quaternion.copy(this.gun.quaternion).multiply(blade.quaternion);arm.hand.rotateZ(off?-.35:.35);}}
  }
  if(rig){
   // (The sheathed Sheath's right hand only hangs: the figure swings it. The
   // blades keep their elbow hints, which trace the swings.)
   // A Sightline or Sidekick off hand resting (no draw, no pistol reload)
   // holds nothing: free too. A throw turns the body into it.
   const hands=sim.weapon==='sheath'?this.gun.getObjectByName('sheath-loadout')?.userData.sheathPose?.hands:null;
   const sl=sightline?this.gun.getObjectByName('sightline-loadout')?.userData.sightlinePose:null,sk=sidekick?this.gun.getObjectByName('sidekick-loadout')?.userData.sidekickPose:null;
   const offFree=sightline?!sim.sightline.pistolReload&&(sl?.drawBlend||0)<.8:sidekick?!sim.sidekick.reload&&(sk?.reach||0)<.05:false;
   const blade=sim.weapon==='ichor'||sim.weapon==='sheath',age=sim.time-sim.grenadeThrowTime,throwing=sim.weapon==='rifle'&&age>=0&&age<.64?Math.sin(Math.PI*Math.min(1,age/.5)):0;
   rig.setGoals(this.arms[0].target,this.arms[0].elbow,this.arms[1].target,this.arms[1].elbow,[!!hands&&!hands.rightGrip,offFree],[blade&&!(hands&&!hands.rightGrip),blade&&!(hands&&!hands.leftGrip)],throwing);
  }
 }
}
