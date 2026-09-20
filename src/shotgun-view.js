import {ShotgunPressure} from './shotgun-pressure.js';
import * as THREE from 'three';
import {makeShotgun} from './shotgun-model.js';
import {SHOTGUN} from './shotgun.js';
export class ShotgunView{
 constructor(view){this.view=view;this.gun=view.player.userData.gun;this.pressure=new ShotgunPressure(view.scene,this.gun);this.model=makeShotgun();this.gun.add(this.model);this.model.visible=false;this.shells=[];this.particles=[];this.lastShot=-10;this.lastReload=-10;
  this.pellets=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(.045,0),new THREE.MeshBasicMaterial({color:'#fff3cb',toneMapped:false}),48);this.pellets.count=0;this.pellets.frustumCulled=false;view.scene.add(this.pellets);this.dummy=new THREE.Object3D();this.up=new THREE.Vector3(0,1,0);this.direction=new THREE.Vector3();
  this.casings=new THREE.InstancedMesh(new THREE.CylinderGeometry(.052,.052,.19,6),new THREE.MeshLambertMaterial({color:'#d74643',emissive:'#39100c'}),60);this.casings.count=0;this.casings.frustumCulled=false;view.scene.add(this.casings);
  this.shellCaps=new THREE.InstancedMesh(new THREE.CylinderGeometry(.058,.058,.038,6).translate(0,-.076,0),new THREE.MeshBasicMaterial({color:'#ffe3a2',toneMapped:false}),60);this.shellCaps.count=0;this.shellCaps.frustumCulled=false;view.scene.add(this.shellCaps);
  this.shellTrails=new THREE.InstancedMesh(new THREE.CylinderGeometry(.013,.006,1,4),new THREE.MeshBasicMaterial({color:'#ffe4b7',transparent:true,opacity:.45,depthWrite:false,toneMapped:false}),60);this.shellTrails.count=0;this.shellTrails.frustumCulled=false;view.scene.add(this.shellTrails);
  this.flash=new THREE.Mesh(new THREE.ConeGeometry(.27,.66,7),new THREE.MeshBasicMaterial({color:'#ffc34d',toneMapped:false}));this.flash.rotation.x=-Math.PI/2;this.flash.position.set(0,.02,-.79);this.model.add(this.flash);this.flash.visible=false;
  this.smoke=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(.10,0),new THREE.MeshBasicMaterial({color:'#c5b99f',transparent:true,opacity:.28,depthWrite:false}),48);this.smoke.count=0;this.smoke.frustumCulled=false;view.scene.add(this.smoke);
  this.sparks=new THREE.InstancedMesh(new THREE.BoxGeometry(.025,.025,.10),new THREE.MeshBasicMaterial({color:'#ffd061',toneMapped:false}),48);this.sparks.count=0;this.sparks.frustumCulled=false;view.scene.add(this.sparks);
  this.flames=new THREE.InstancedMesh(new THREE.ConeGeometry(.085,.32,5),new THREE.MeshBasicMaterial({color:'#ff9f30',toneMapped:false}),48);this.flames.count=0;this.flames.frustumCulled=false;view.scene.add(this.flames);
  const core=new THREE.Mesh(new THREE.ConeGeometry(.15,.72,6),new THREE.MeshBasicMaterial({color:'#fff5d6',toneMapped:false}));core.position.y=.04;this.flash.add(core);
 }
 event(e){const sim=this.view.lastSim;if(e.type==='shotgunShot'){this.lastShot=sim.time;this.charge=e.charge;
  const p=sim.player,c=e.charge||0,budget=({potato:6,performance:9,balanced:16,quality:22}[this.view.qualityName]||9),count=Math.ceil(budget*(1+c*.9));
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
   if(reload>.18&&!this.ejected){this.ejected=true;for(let i=0;i<this.toEject;i++)this.shells.push({born:sim.time,x:sim.player.x,z:sim.player.z,vx:-sim.player.aimX*(1+Math.random())+sim.player.aimZ*(i?1:-1),vz:-sim.player.aimZ*(1+Math.random())-sim.player.aimX*(i?1:-1),angle:Math.random()*6.28});}
  }
  this.pressure.update(sim,dt,this.view.qualityName);
  this.shells=this.shells.filter(s=>sim.time>=s.born&&sim.time-s.born<30).slice(-60);let i=0;
  let trailCount=0;
  for(const s of this.shells){
   const age=sim.time-s.born,t=Math.min(age,.6),y=Math.max(.058,.8+1.6*t-4.9*t*t);
   this.dummy.position.set(s.x+s.vx*t,y,s.z+s.vz*t);this.dummy.rotation.set(Math.PI/2,s.angle,t*13+s.angle);this.dummy.scale.setScalar(1);this.dummy.updateMatrix();this.casings.setMatrixAt(i,this.dummy.matrix);this.shellCaps.setMatrixAt(i++,this.dummy.matrix);
   if(age>0&&y>.058){
    // A short swept segment follows the ballistic arc and disappears on landing.
    const before=Math.max(0,t-.065),oldY=.8+1.6*before-4.9*before*before;
    this.direction.set(s.vx*(t-before),y-oldY,s.vz*(t-before));const length=this.direction.length();
    if(length>.001){this.dummy.position.addScaledVector(this.direction,-.5);this.dummy.quaternion.setFromUnitVectors(this.up,this.direction.normalize());this.dummy.scale.set(1,length,1);this.dummy.updateMatrix();this.shellTrails.setMatrixAt(trailCount++,this.dummy.matrix);}
   }
  }
  this.casings.count=this.shellCaps.count=i;this.shellTrails.count=trailCount;
  this.casings.instanceMatrix.needsUpdate=this.shellCaps.instanceMatrix.needsUpdate=this.shellTrails.instanceMatrix.needsUpdate=true;
  i=0;for(const b of sim.shotgunPellets){if(i>=48||!sim.canSeeEntity(b.x,b.z,.05))continue;this.dummy.position.set(b.x,.77,b.z);this.dummy.rotation.set(0,0,0);this.dummy.scale.setScalar(1);this.dummy.updateMatrix();this.pellets.setMatrixAt(i++,this.dummy.matrix);}this.pellets.count=i;this.pellets.instanceMatrix.needsUpdate=true;
  let smokeCount=0,sparkCount=0,flameCount=0;this.particles=this.particles.filter(p=>sim.time>=p.born&&sim.time-p.born<p.life);
  for(const p of this.particles){const age=sim.time-p.born,progress=age/p.life;if(!sim.canSeeEntity(p.x,p.z,.1))continue;
   const batch=p.flame?this.flames:p.smoke?this.smoke:this.sparks,index=p.flame?flameCount:p.smoke?smokeCount:sparkCount;if(index>=48)continue;
   this.dummy.position.set(p.x+p.dx*age,.77+p.vy*age,p.z+p.dz*age);this.dummy.rotation.set(age*4,p.angle,age*7);
   if(p.flame){this.direction.set(p.dx,p.vy,p.dz).normalize();this.dummy.quaternion.setFromUnitVectors(this.up,this.direction);}
   this.dummy.scale.setScalar(p.scale*(p.smoke?(1+age*7)*(1-progress*.8):1-progress));this.dummy.updateMatrix();batch.setMatrixAt(index,this.dummy.matrix);if(p.flame)flameCount++;else if(p.smoke)smokeCount++;else sparkCount++;
  }this.flames.count=flameCount;this.flames.instanceMatrix.needsUpdate=true;this.smoke.count=smokeCount;this.sparks.count=sparkCount;this.smoke.instanceMatrix.needsUpdate=this.sparks.instanceMatrix.needsUpdate=true;
 }
 clear(){this.pressure.clear();this.shells=[];this.particles=[];this.pellets.count=this.casings.count=this.shellCaps.count=this.shellTrails.count=this.smoke.count=this.sparks.count=this.flames.count=0;this.lastShot=this.lastReload=-10;}
}
