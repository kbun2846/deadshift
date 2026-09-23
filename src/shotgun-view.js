import {ShotgunPressure} from './shotgun-pressure.js';
import * as THREE from 'three';
import {makeShotgun} from './shotgun-model.js';
import {SHOTGUN} from './shotgun.js';
import {segmentBox} from './simulation.js';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { NO_FX } from './effects-detail.js';
const SHELL_SMOKE=new THREE.Color('#c9c0ae'),PELLET_TRAIL=new THREE.Color('#ffe6b0');
const SHELL_REST=.058;
export class ShotgunView{
 constructor(view){this.view=view;this.gun=view.player.userData.gun;this.pressure=new ShotgunPressure(view.scene,this.gun);this.model=makeShotgun();this.gun.add(this.model);this.model.visible=false;this.shells=[];this.particles=[];this.lastShot=-10;this.lastReload=-10;
  this.pellets=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(.045,0),new THREE.MeshBasicMaterial({color:'#fff3cb',toneMapped:false}),72);this.pellets.count=0;this.pellets.frustumCulled=false;view.scene.add(this.pellets);this.dummy=new THREE.Object3D();this.up=new THREE.Vector3(0,1,0);this.direction=new THREE.Vector3();
  this.casings=new THREE.InstancedMesh(new THREE.CylinderGeometry(.052,.052,.19,6),new THREE.MeshLambertMaterial({color:'#d74643',emissive:'#39100c'}),60);this.casings.count=0;this.casings.frustumCulled=false;view.scene.add(this.casings);
  this.shellCaps=new THREE.InstancedMesh(new THREE.CylinderGeometry(.058,.058,.038,6).translate(0,-.076,0),new THREE.MeshBasicMaterial({color:'#ffe3a2',toneMapped:false}),60);this.shellCaps.count=0;this.shellCaps.frustumCulled=false;view.scene.add(this.shellCaps);
  this.shellTrails=new THREE.InstancedMesh(new THREE.CylinderGeometry(.013,.006,1,4),new THREE.MeshBasicMaterial({color:'#ffe4b7',transparent:true,opacity:.45,depthWrite:false,toneMapped:false}),60);this.shellTrails.count=0;this.shellTrails.frustumCulled=false;view.scene.add(this.shellTrails);
  this.flash=new THREE.Mesh(new THREE.ConeGeometry(.27,.66,7),new THREE.MeshBasicMaterial({color:'#ffc34d',toneMapped:false}));this.flash.rotation.x=-Math.PI/2;this.flash.position.set(0,.02,-.79);this.model.add(this.flash);this.flash.visible=false;
  this.smoke=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(.10,0),new THREE.MeshBasicMaterial({color:'#c5b99f',transparent:true,opacity:.28,depthWrite:false}),48);this.smoke.count=0;this.smoke.frustumCulled=false;view.scene.add(this.smoke);
  this.sparks=new THREE.InstancedMesh(new THREE.BoxGeometry(.025,.025,.10),new THREE.MeshBasicMaterial({color:'#ffd061',toneMapped:false}),48);this.sparks.count=0;this.sparks.frustumCulled=false;view.scene.add(this.sparks);
  this.flames=new THREE.InstancedMesh(new THREE.ConeGeometry(.085,.32,5),new THREE.MeshBasicMaterial({color:'#ff9f30',toneMapped:false}),48);this.flames.count=0;this.flames.frustumCulled=false;view.scene.add(this.flames);
  const core=new THREE.Mesh(new THREE.ConeGeometry(.15,.72,6),new THREE.MeshBasicMaterial({color:'#fff5d6',toneMapped:false}));core.position.y=.04;this.flash.add(core);
  this.shellDetail=null;this.lastPellets=new WeakMap();this.livePellets=new Set();this.ghosts=[];
 }
 // Spent shells. Every preset gets the red hull and brass head; Extreme builds
 // them rounder with a raised brass rim and a crimped, folded mouth.
 shellGeometry(rich){
  if(this.shellDetail===rich)return;this.shellDetail=rich;
  const sides=rich?14:6;
  this.casings.geometry.dispose();this.shellCaps.geometry.dispose();
  const hull=new THREE.CylinderGeometry(.052,.052,.19,sides);
  if(rich){const crimp=new THREE.ConeGeometry(.052,.03,sides).translate(0,.11,0);this.casings.geometry=mergeGeometries([hull,crimp]);hull.dispose();crimp.dispose();}
  else this.casings.geometry=hull;
  const head=new THREE.CylinderGeometry(.058,.058,.038,sides).translate(0,-.076,0);
  if(rich){const rim=new THREE.CylinderGeometry(.064,.064,.012,sides).translate(0,-.092,0);this.shellCaps.geometry=mergeGeometries([head,rim]);head.dispose();rim.dispose();}
  else this.shellCaps.geometry=head;
 }
 event(e){const sim=this.view.lastSim;if(!sim)return;/* made at load: an event can come before the first update */if(e.type==='shotgunShot'){this.lastShot=sim.time;this.charge=e.charge;
  const p=sim.player,c=e.charge||0,budget=({potato:6,performance:9,balanced:16,quality:22,extreme:30}[this.view.qualityName]||9),count=Math.ceil(budget*(1+c*.9));
  for(let i=0;i<count;i++){const side=(Math.random()-.5)*(1+c),speed=1+Math.random()*(2+c*2);this.particles.push({born:sim.time,x:e.x,z:e.z,dx:p.aimX*speed-p.aimZ*side,dz:p.aimZ*speed+p.aimX*side,vy:.3+Math.random(),life:i%3===1?.14+c*.10:.40+Math.random()*.35+c*.3,flame:i%3===1,smoke:i%3===0,scale:1.3+c*1.1,angle:Math.random()*6.28});}
  }
 if(e.type==='shotgunReload'){this.lastReload=sim.time;this.toEject=e.spent;this.ejected=false;}}
 update(sim,dt=0){
  const active=sim.weapon==='shotgun',s=sim.shotgun;this.model.visible=active;
  if(active){
   this.view.rifleView.staticParts.forEach(p=>p.visible=false);this.view.rifleView.model.visible=false;
   const kick=Math.max(0,1-(sim.time-this.lastShot)/.22),reload=s.reload>0?1-s.reload/SHOTGUN.reload:0,open=s.reload?Math.min(1,reload/.17,(1-reload)/.18):0;
   this.gun.position.set(.20,.77+(s.aiming?.06:0)-open*.10,-.43+kick*.14);this.gun.rotation.x=-kick*.22+open*.32;
   this.model.userData.barrels.rotation.x=-open*.65;
   this.model.userData.shells.forEach((shell,i)=>{shell.visible=!s.reload||reload<.20||reload>.40+i*.18;shell.position.z=.112+(s.reload&&reload>.40&&reload<.8?Math.max(0,.16-(reload-.40-i*.18)*.7):0);});
   this.view.rifleView.pose.update(sim,s.aiming?1:0,0,kick);
   this.flash.visible=sim.time-this.lastShot<.10+(this.charge||0)*.055;this.flash.scale.setScalar(1.2+(this.charge||0)*1.25);
   if(reload>.18&&!this.ejected){this.ejected=true;for(let i=0;i<this.toEject;i++)this.shells.push({born:sim.time,x:sim.player.x,y:.8,z:sim.player.z,vy:1.6+Math.random()*.5,vx:-sim.player.aimX*(1+Math.random())+sim.player.aimZ*(i?1:-1),vz:-sim.player.aimZ*(1+Math.random())-sim.player.aimX*(i?1:-1),angle:Math.random()*6.28,tumble:0,tumbleRate:9+Math.random()*8,roll:0,resting:false,bounced:0,smokeClock:0});}
  }
  this.pressure.update(sim,dt,this.view.qualityName);
  this.shells=this.shells.filter(s=>sim.time>=s.born&&sim.time-s.born<30).slice(-60);let i=0;
  let trailCount=0;
  this.shellGeometry(this.view.qualityName==='extreme');
  const fx=this.view.fx||NO_FX,step=Math.max(0,Math.min(.05,dt));
  for(const s of this.shells){
   const age=sim.time-s.born;
   // Thrown out spinning end over end, then it bounces: each landing loses
   // most of the height and some of the skid, until it lies on its side and
   // rolls to a stop.
   if(!s.resting&&age>0){
    s.vy-=9.8*step;s.x+=s.vx*step;s.y+=s.vy*step;s.z+=s.vz*step;s.tumble+=s.tumbleRate*step;
    if(s.y<=SHELL_REST&&s.vy<0){
     s.y=SHELL_REST;
     if(!s.bounced&&fx.on){const dust=this.view.kickedDustColor(s.x,s.z);fx.puff({x:s.x,y:.06,z:s.z,vx:s.vx*.2,vz:s.vz*.2,vy:.3,size:.05,grow:2.4,life:.6,alpha:.4,color:dust});fx.grit(s.x,s.z,dust,-s.vx,-s.vz,.4);}
     s.bounced++;s.vy=-s.vy*.32;s.vx*=.55;s.vz*=.55;s.tumbleRate*=.45;
     if(s.vy<.45){s.vy=0;s.resting=true;}
    }
   }else if(s.resting){
    const slide=Math.hypot(s.vx,s.vz);
    if(slide>.02){const f=Math.exp(-3.2*step);s.vx*=f;s.vz*=f;s.x+=s.vx*step;s.z+=s.vz*step;s.roll+=slide*step/.052;}
   }
   // A thread of smoke out of the open mouth while it is still hot.
   if(fx.on&&age<.5&&!s.resting){s.smokeClock-=step;if(s.smokeClock<=0){s.smokeClock=.045;fx.puff({x:s.x,y:s.y,z:s.z,vx:0,vz:0,vy:.25,size:.025,grow:2.6,life:.55,alpha:.28,color:SHELL_SMOKE,drag:1});}}
   const settle=s.resting?1:0;
   // Airborne it tumbles; at rest it lies along the ground, rolled about its own axis.
   this.dummy.rotation.set(Math.PI/2+(1-settle)*s.tumble,s.angle,settle*s.roll+(1-settle)*s.tumble*.4);
   this.dummy.position.set(s.x,s.y,s.z);this.dummy.scale.setScalar(1);this.dummy.updateMatrix();this.casings.setMatrixAt(i,this.dummy.matrix);this.shellCaps.setMatrixAt(i++,this.dummy.matrix);
   if(age>0&&!s.bounced){
    // A short swept segment follows the arc until the first landing.
    this.direction.set(s.vx*.065,s.vy*.065,s.vz*.065);const length=this.direction.length();
    if(length>.001){this.dummy.position.addScaledVector(this.direction,-.5);this.dummy.quaternion.setFromUnitVectors(this.up,this.direction.normalize());this.dummy.scale.set(1,length,1);this.dummy.updateMatrix();this.shellTrails.setMatrixAt(trailCount++,this.dummy.matrix);}
   }
  }
  this.casings.count=this.shellCaps.count=i;this.shellTrails.count=trailCount;
  this.casings.instanceMatrix.needsUpdate=this.shellCaps.instanceMatrix.needsUpdate=this.shellTrails.instanceMatrix.needsUpdate=true;
  // Past the red zone the pellets are spent: they do no damage and break
  // nothing, but they do not just vanish either. A cosmetic copy flies on at
  // the same speed until it meets a wall (or anything solid) or leaves the
  // screen, so the shot reads as going somewhere.
  const now=new Set(sim.shotgunPellets);
  for(const b of this.livePellets)if(!now.has(b)&&b.travel>=b.range-1e-6&&this.ghosts.length<96)this.ghosts.push({x:b.x,z:b.z,dx:b.dx,dz:b.dz,left:34});
  this.livePellets=now;
  let ghostCount=0;
  this.ghosts=this.ghosts.filter(g=>{
   const travel=Math.min(85*step,g.left),ex=g.x+g.dx*travel,ez=g.z+g.dz*travel;let first=1;
   for(const c of sim.colliders){if(c.playerOnly)continue;const t=segmentBox(g.x,g.z,ex,ez,c,.025);if(t!==null&&t<first)first=t;}
   const fromX=g.x,fromZ=g.z;g.x+=(ex-g.x)*first;g.z+=(ez-g.z)*first;g.left-=travel*first;
   if(fx.on)fx.streak({x:g.x,z:g.z,fromX,fromZ,y:.77,life:.07,width:.018,color:PELLET_TRAIL,glow:.6});
   if(first<1){if(fx.on)fx.impact(g.x,g.z,this.view.kickedDustColor(g.x,g.z),{dx:g.dx,dz:g.dz});return false;}
   if(ghostCount<24&&sim.canSeeEntity(g.x,g.z,.05)){this.dummy.position.set(g.x,.77,g.z);this.dummy.rotation.set(0,0,0);this.dummy.scale.setScalar(.8);this.dummy.updateMatrix();this.pellets.setMatrixAt(48+ghostCount++,this.dummy.matrix);}
   return g.left>.01;
  });
  i=0;for(const b of sim.shotgunPellets){
   // Each pellet leaves a hot streak back along the way it came.
   const last=this.lastPellets.get(b);this.lastPellets.set(b,{x:b.x,z:b.z});
   if(last&&fx.on&&(last.x!==b.x||last.z!==b.z))fx.streak({x:b.x,z:b.z,fromX:last.x,fromZ:last.z,y:.77,life:.07,width:.02,color:PELLET_TRAIL,glow:.8});
   if(i>=48||!sim.canSeeEntity(b.x,b.z,.05))continue;this.dummy.position.set(b.x,.77,b.z);this.dummy.rotation.set(0,0,0);this.dummy.scale.setScalar(1);this.dummy.updateMatrix();this.pellets.setMatrixAt(i++,this.dummy.matrix);}if(ghostCount&&i<48)for(let k=0;k<ghostCount;k++){const m=new THREE.Matrix4();this.pellets.getMatrixAt(48+k,m);this.pellets.setMatrixAt(i+k,m);}this.pellets.count=i+ghostCount;this.pellets.instanceMatrix.needsUpdate=true;
  let smokeCount=0,sparkCount=0,flameCount=0;this.particles=this.particles.filter(p=>sim.time>=p.born&&sim.time-p.born<p.life);
  for(const p of this.particles){const age=sim.time-p.born,progress=age/p.life;if(!sim.canSeeEntity(p.x,p.z,.1))continue;
   const batch=p.flame?this.flames:p.smoke?this.smoke:this.sparks,index=p.flame?flameCount:p.smoke?smokeCount:sparkCount;if(index>=48)continue;
   this.dummy.position.set(p.x+p.dx*age,.77+p.vy*age,p.z+p.dz*age);this.dummy.rotation.set(age*4,p.angle,age*7);
   if(p.flame){this.direction.set(p.dx,p.vy,p.dz).normalize();this.dummy.quaternion.setFromUnitVectors(this.up,this.direction);}
   this.dummy.scale.setScalar(p.scale*(p.smoke?(1+age*7)*(1-progress*.8):1-progress));this.dummy.updateMatrix();batch.setMatrixAt(index,this.dummy.matrix);if(p.flame)flameCount++;else if(p.smoke)smokeCount++;else sparkCount++;
  }this.flames.count=flameCount;this.flames.instanceMatrix.needsUpdate=true;this.smoke.count=smokeCount;this.sparks.count=sparkCount;this.smoke.instanceMatrix.needsUpdate=this.sparks.instanceMatrix.needsUpdate=true;
 }
 clear(){this.pressure.clear();this.shells=[];this.ghosts=[];this.livePellets=new Set();this.particles=[];this.pellets.count=this.casings.count=this.shellCaps.count=this.shellTrails.count=this.smoke.count=this.sparks.count=this.flames.count=0;this.lastShot=this.lastReload=-10;}
}
