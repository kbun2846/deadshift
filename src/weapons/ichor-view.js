import * as THREE from 'three';
import {IchorDrench} from '../effects/ichor-drench.js';
import { makeIchor,poseIchor,applyIchorBody } from './ichor-model.js';
import { BloodDrops } from '../effects/blood-drops.js';
import {castToWall} from '../effects/blood-surfaces.js';
import { floorY } from '../render/ground-lift.js';
// The pop pass (render/shot-pop.js): a white slash's edge band, under it and
// along its inside, is dark (it was a pale grey, which left the arc washed
// out on sand); the blood-red slash keeps its own dark red edge.
import { POP } from '../render/shot-pop.js';
export const ICHOR_FX_ORDER=3;
import { ichorCutSign,ichorCutArc,ichorSpin,ichorCoverMeets } from './ichor-cut.js';
import { segmentBox } from '../simulation.js';
import { nearColliders } from '../world/collider-grid.js';
import { ichorMotion,ichorCutProgress } from './ichor-motion.js';
// Keep the slash ribbon above the terrain, still depth-tested against scenery.
export const ichorTrailHeight=(view,x,z,y,below=false)=>Math.max(y,floorY(view,x,z,below)+.24);
// One small polar cover mask per cut, shared by every wake/filament. Retain
// its starting cover even if that cut breaks a prop; the next cut can pass.
const COVER_SAMPLES=128,COVER_REACH=3.4;
export function ichorCutCover(sim,x,z,y){
 const nearby=nearColliders(sim.colliders||[],x-COVER_REACH,z-COVER_REACH,x+COVER_REACH,z+COVER_REACH).filter(c=>!c.playerOnly);
 if(!nearby.length)return null;
 const mask=new Float32Array(COVER_SAMPLES);mask.fill(COVER_REACH);
 for(let i=0;i<COVER_SAMPLES;i++){const a=i*Math.PI*2/COVER_SAMPLES,dx=Math.cos(a)*COVER_REACH,dz=Math.sin(a)*COVER_REACH;
  for(const c of nearby){const k=segmentBox(x,z,x+dx,z+dz,c,.025);if(k!==null&&ichorCoverMeets(sim,c,x+dx*k,z+dz*k,y))mask[i]=Math.min(mask[i],k*COVER_REACH);}
 }return mask;
}
const coverReach=(mask,a)=>{if(!mask)return Infinity;const at=((a/(Math.PI*2)%1)+1)%1*COVER_SAMPLES,i=Math.floor(at);return Math.min(mask[i],mask[(i+1)%COVER_SAMPLES]);};
const SOFT=new THREE.Color('#b87275'),DULL=new THREE.Color('#813b40'),BLUSH=new THREE.Color('#ecd7c8'),MUTED=new THREE.Color('#78111e'),HOT=new THREE.Color('#bd2534');
const WHITE=new THREE.Color('#fffdf3'),RED=new THREE.Color('#991827'),DARK=new THREE.Color('#541018'),EDGE=new THREE.Color(POP.ichor.edge),YELLOW=new THREE.Color('#ffe466'),BLUE=new THREE.Color('#55bfff');
export class IchorView{
 constructor(view){this.view=view;this.model=makeIchor();this.model.visible=false;view.player.userData.gun.add(this.model);this.clock=0;this.cuts=[];this.sparks=[];this.pools=[];this.footTime=new Map();this.waveTrail=new Map();this.bloodMotes=[];this.ricochets=[];this.frenzyBursts=[];this.ribbonRing=new Float32Array(97*6);this.ribbonOpen=new Uint8Array(97);this.palette=[new THREE.Color(),new THREE.Color(),new THREE.Color()];this.dummy=new THREE.Object3D();this.a=new THREE.Vector3();this.b=new THREE.Vector3();this.up=new THREE.Vector3(0,1,0);
 const batch=(geo,cap,opacity)=>{const mesh=new THREE.InstancedMesh(geo,new THREE.MeshBasicMaterial({color:'#ffffff',transparent:true,opacity,depthWrite:false,toneMapped:false}),cap);mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.count=0;mesh.frustumCulled=false;mesh.setColorAt(0,WHITE);view.scene.add(mesh);return mesh;};
 const star=[];for(let i=0;i<16;i++){const point=j=>{const a=j*Math.PI/8,r=j%2?.16:j%4===0?1:.48;return [Math.cos(a)*r,Math.sin(a)*r,0];};star.push(0,0,0,...point(i),...point((i+1)%16));}
 const sparkGeo=new THREE.BufferGeometry();sparkGeo.setAttribute('position',new THREE.Float32BufferAttribute(star,3));this.guardSparks=batch(sparkGeo,8,1);this.guardSparks.material.side=THREE.DoubleSide;this.guardSparks.material.color.set('#ffffff');
 this.lines=batch(new THREE.BoxGeometry(1,1,1),1800,.86);this.glows=batch(new THREE.CircleGeometry(1,12).rotateX(-Math.PI/2),24,.15);const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(new Float32Array(18000*3),3).setUsage(THREE.DynamicDrawUsage));geo.setAttribute('color',new THREE.BufferAttribute(new Float32Array(18000*3),3).setUsage(THREE.DynamicDrawUsage));geo.setDrawRange(0,0);
 this.ribbons=new THREE.Mesh(geo,new THREE.MeshBasicMaterial({vertexColors:true,transparent:true,opacity:.92,side:THREE.DoubleSide,depthWrite:false,toneMapped:false}));this.ribbons.frustumCulled=false;this.ribbons.count=0;view.scene.add(this.ribbons);this.meshes=[this.lines,this.glows,this.ribbons,this.guardSparks];
 // Drawn after the ground's marks (v0.990a, owner: footprints and blood
 // splatters show under the slashes): the stains, splatters and prints are
 // order 2 (blood-drops.js, blood-splatter.js), so a slash's white arc and its
 // flying blood go over them, not under.
 for(const m of this.meshes)m.renderOrder=ICHOR_FX_ORDER;}
 clear(){this.drench?.clear();this.cuts=[];this.sparks=[];this.pools=[];this.footTime.clear();this.waveTrail.clear();this.bloodMotes=[];this.ricochets=[];this.frenzyBursts=[];for(const m of this.meshes)m.count=0;this.ribbons.geometry.setDrawRange(0,0);}
 line(ax,ay,az,bx,by,bz,width,color){const m=this.lines,i=m.count;if(i>=1800)return;const d=this.dummy;this.a.set(ax,ay,az);this.b.set(bx,by,bz).sub(this.a);d.position.copy(this.a).addScaledVector(this.b,.5);d.quaternion.setFromUnitVectors(this.up,this.a.copy(this.b).normalize());d.scale.set(width,this.b.length(),width*.55);d.updateMatrix();m.setMatrixAt(i,d.matrix);m.setColorAt(i,color);m.count++;}
 event(e){const v=this.view;
 if(e.type==='ichorDeflect'){
  // Put the catch on the actual held blade, including other players' poses.
  const own=e.id===v.lastSim?.player.id,pack=own?this.model:v.remote?.avatars.get(e.id)?.hand,blade=e.guard&&pack?.getObjectByName('ichor-blade');
  let catchPoint=e;if(blade){blade.updateWorldMatrix(true,false);this.a.set(0,.03,-.26).applyMatrix4(blade.matrixWorld);this.b.set(0,.03,-1.65).applyMatrix4(blade.matrixWorld).sub(this.a);const t=Math.max(.04,Math.min(.96,((e.x-this.a.x)*this.b.x+(e.z-this.a.z)*this.b.z)/(this.b.x*this.b.x+this.b.z*this.b.z||1)));this.a.addScaledVector(this.b,t);catchPoint={...e,x:this.a.x,y:this.a.y+.02,z:this.a.z};}
  if(this.ricochets.length>=24)this.ricochets.shift();this.ricochets.push({...catchPoint,born:this.clock});
 }
 if(e.type==='ichorFrenzyStart'){if(this.frenzyBursts.length>=6)this.frenzyBursts.shift();this.frenzyBursts.push({...e,born:this.clock});}
 if(e.type==='ichorSwing'){if(this.cuts.length>=24)this.cuts.shift();this.cuts.push({...e,born:this.clock});}
 // The wave's price (v0.990a): the wielder splashes blood as it leaves the blade.
 if(e.type==='ichorWave'&&e.cost>0&&(e.id===v.lastSim?.player.id||v.lastSim?.canSeeEntity(e.x,e.z,.1))){
  const y=floorY(v,e.x,e.z,e.below),n=v.qualityName==='potato'?10:v.qualityName==='performance'?16:24;
  this.bloodSpray(e.x,e.z,y+.95,-(e.dx??1),-(e.dz??0),n,e.below,{stain:true});
  this.bloodSpray(e.x,e.z,y+.8,e.dx??1,e.dz??0,Math.round(n/2),e.below);
  (v.drops ||= new BloodDrops(v)).stain(e.x,y+.012,e.z,.26+Math.random()*.14);
  v.onBloodSound?.('pool',e.x,e.z);
 }
 if(e.type==='ichorDrip'){
  if(!v.lastSim?.canSeeEntity(e.x,e.z,.1))return;
  (v.drops ||= new BloodDrops(v)).stain(e.x,floorY(v,e.x,e.z,e.below)+.012,e.z,.21+Math.random()*.19);
  this.pools.push({x:e.x,z:e.z,r:.72,born:this.clock});if(this.pools.length>160)this.pools.shift();
  if(Math.random()<.24)v.onBloodSound?.('pool',e.x,e.z);
 }
 }
 hit(e){const v=this.view,robot=e.targetKind==='robot',avatar=v.remote?.avatars.get(e.id);if(robot){const tint=new THREE.Color(avatar?.colours.coat||'#9aa4a8'),dx=e.directionX??1,dz=e.directionZ??0;
  const count=['quality','extreme'].includes(v.qualityName)?24:v.qualityName==='potato'?6:12;
  for(let i=0;i<count;i++){const side=(Math.random()-.5)*3;if(this.sparks.length>=160)this.sparks.shift();this.sparks.push({x:e.x,z:e.z,y:floorY(v,e.x,e.z,e.below)+.75,vx:dx*(2+Math.random()*3)-dz*side,vz:dz*(2+Math.random()*3)+dx*side,vy:1+Math.random()*2,born:this.clock,life:.22+Math.random()*.2,color:i%2?YELLOW:BLUE});}
  v.burst(e.x,e.z,8+Math.round((e.bloodLevel||0)*12),'hit',tint);return;
 }
 if(e.targetKind==='player'){this.bloodSpray(e.x,e.z,floorY(v,e.x,e.z,e.below)+.85,e.directionX??1,e.directionZ??0,Math.round((v.qualityName==='potato'?24:40)*(1+(e.bloodLevel||0)*1.5)),e.below,{heavy:true,stain:true});v.bleed({...e,damage:Math.max(7,e.damage),bloodLevel:e.bloodLevel||0});const w=e.id===v.lastSim?.player.id?v.wading:avatar?.wading;if(w)w.level=Math.min(1,w.level+.24+(e.bloodLevel||0)*.3);this.pools.push({x:e.x,z:e.z,r:.65,born:this.clock});if(this.pools.length>160)this.pools.shift();}
 }
 ribbon(x,z,y,dir,start,sweep,radius,width,color,n,style={}){
  const m=this.ribbons,pos=m.geometry.attributes.position,col=m.geometry.attributes.color,ring=this.ribbonRing;n=Math.min(96,n);
  // Two unique edge samples per segment; reuse them for both triangles.
  // The old six trig/ground evaluations per segment were wasteful on hills.
  for(let i=0;i<=n;i++){const u=i/n,a=dir+start+sweep*u,cs=Math.cos(a),sn=Math.sin(a),w=width*Math.sin(u*Math.PI)**.7*.5*(1+.045*Math.sin(u*36+(style.phase||0)));
   this.ribbonOpen[i]=radius+w<=coverReach(style.cover,a)?1:0;
   for(let j=0;j<2;j++){const r=radius+(j?w:-w),px=x+cs*r,pz=z+sn*r,k=i*6+j*3;ring[k]=px;ring[k+1]=ichorTrailHeight(this.view,px,pz,y+(style.tilt||0)*Math.sin(a-dir),style.below);ring[k+2]=pz;}
  }
  const put=(i,j)=>{const k=i*6+j*3,v=m.count++,u=i/n,alt=style.alt||color,f=style.alt?(j?.10:.32)+.23*(.5+.5*Math.sin(u*21+(style.phase||0))):0;pos.setXYZ(v,ring[k],ring[k+1],ring[k+2]);col.setXYZ(v,color.r+(alt.r-color.r)*f,color.g+(alt.g-color.g)*f,color.b+(alt.b-color.b)*f);};
  for(let i=0;i<n&&m.count+6<=pos.count;i++){if(!this.ribbonOpen[i]||!this.ribbonOpen[i+1])continue;put(i,0);put(i,1);put(i+1,1);put(i,0);put(i+1,1);put(i+1,0);}
 }
 arc(x,z,y,dir,start,sweep,radius,width,power,spin=false,color=RED,style={}){
  const detail=['quality','extreme'].includes(this.view.qualityName)?28:16,n=spin?detail+16:detail,edge=style.edge|| (color===RED?DARK:EDGE);
  this.ribbon(x,z,y-.02,dir,start,sweep,radius-.055,width*1.18,edge,n,{...style,alt:null});
  this.ribbon(x,z,y+.012,dir,start,sweep,radius,width,color,n,style);
  this.ribbon(x,z,y-.05,dir,start,sweep*.92,radius-.22,width*(.13+power*.13),edge,n,{...style,alt:null});
 }
 colours(power,serial=0){const [fill,edge,vein]=this.palette,variation=(serial*.381966)%1;
  if(power>=.6){fill.copy(RED).lerp(MUTED,variation*.48);edge.copy(DARK);vein.copy(HOT).lerp(MUTED,variation*.32);}
  else{const q=Math.max(0,power/.6);fill.copy(WHITE).lerp(SOFT,q*(.65+variation*.25));edge.copy(EDGE).lerp(DULL,q);vein.copy(WHITE).lerp(BLUSH,q*.38);}
  return this.palette;
 }
 cut(c,age){
  const v=this.view,dir=Math.atan2(c.dz,c.dx),sign=ichorCutSign(c.variant),spin=ichorSpin(c.variant),t=Math.min(1,age/(c.duration||.24)),q=ichorCutProgress(c.variant,t),motion=ichorMotion(c.variant,t);
  const fade=Math.min(1,age/.035)*Math.max(0,1-Math.max(0,age-.10)/.22),y=floorY(v,c.x,c.z,c.below)+.76;
  const head=-(motion[3]+motion[6]),span=q*ichorCutArc(c.variant),[fill,edge,vein]=this.colours(c.power,c.serial||c.variant);
  const radius=1.75+q*.20+(c.variant===6?.18:0)+(spin?.12:0),width=(c.variant===6?.54:spin?.38:c.variant>=7?.32:.44)*fade;
  const style={cover:c.cover,below:c.below,tilt:spin?.045:motion[4]*.7,phase:(c.serial||0)*1.7,edge,alt:vein};
  this.arc(c.x,c.z,y,dir,head-sign*span,sign*span,radius,width,c.power,spin,fill,style);
  this.ribbon(c.x,c.z,y+.025,dir,head-sign*span*.93,sign*span*.89,radius-.055,.047*fade,vein,spin?32:16,{...style,alt:fill});
  this.ribbon(c.x,c.z,y-.07,dir,head-sign*(span+.13),sign*span*.84,1.33+q*.16,.07*fade,edge,20,style);
  // Fine broken filaments and a sharp tip wake add texture within the same batch.
  for(let i=0;i<(c.frenzy?4:2);i++){const from=.12+i*.18;this.ribbon(c.x,c.z,y-.025*i,dir,head-sign*span*from,sign*span*.13,radius+.10+i*.04,.021*fade,i%2?vein:fill,5,style);}
  if(c.frenzy){
   // The twelve beats change silhouette: crossing crescents, rising fans,
   // broken spirals, then a wide finishing wheel. All share this draw batch.
   const phase=(c.beat||0)%4,echoes=c.finisher?5:3;
   for(let i=0;i<echoes;i++){const offset=(i-1)*.19,turn=phase===0?offset:phase===1?sign*(.2+i*.16):phase===2?i*.55:offset*.5;
    const r=radius+.08+i*.11,sw=c.finisher?Math.min(Math.PI*2,span*(.85+i*.07)):span*(.56+i*.12);
    this.ribbon(c.x,c.z,y+.10*i,dir+turn,head-sign*sw-offset,sign*sw,r,(i===0?.11:.045)*fade,i%2?RED:WHITE,spin?28:20,{...style,tilt:phase===1?.42-i*.2:style.tilt,alt:i%2?DARK:BLUSH});
   }
  }
  if(c.frenzy||c.variant===6)for(let i=0;i<2;i++)this.ribbon(c.x,c.z,y-.06*i,dir,head-sign*(span+.2+i*.16),sign*span*.68,radius+.17+i*.13,.04*fade,edge,20,style);
 }
 guardGlint(pack,s){
  if(!s?.guarding)return;const blade=pack?.getObjectByName('ichor-blade');if(!blade)return;
  blade.updateWorldMatrix(true,false);this.a.set(0,.045,-.72).applyMatrix4(blade.matrixWorld);
  const mesh=this.guardSparks,i=mesh.count;if(i>=8)return;
  const pulse=.66+.34*Math.sin(this.clock*8)**6,flash=(s.guardFlash||0)/.16,d=this.dummy;
  d.position.copy(this.a);d.position.y+=.035;
  if(this.view.camera)d.quaternion.copy(this.view.camera.quaternion);else d.rotation.set(-Math.PI/2,0,0);
  d.scale.set((.19+flash*.08)*pulse,(.31+flash*.12)*pulse,1);d.updateMatrix();mesh.setMatrixAt(i,d.matrix);mesh.setColorAt(i,mesh.material.color);mesh.count++;

 }
 get bloodCap(){return {potato:128,performance:256,balanced:384,quality:512,extreme:768}[this.view.qualityName]||256;}
 addBloodMote(m){if(this.bloodMotes.length>=this.bloodCap)this.bloodMotes.shift();this.bloodMotes.push(m);}
 bloodSpray(x,z,y,dx,dz,count,below=false,{heavy=false,stain=false}={}){
  const n=Math.hypot(dx,dz)||1;dx/=n;dz/=n;
  for(let i=0;i<count;i++){const side=(Math.random()-.5)*(heavy?6.5:5),push=1.5+Math.random()*(heavy?4.5:3),vx=dx*push-dz*side,vz=dz*push+dx*side,life=.48+Math.random()*.42;
   this.addBloodMote({x,z,y,below,vx,vz,vy:.6+Math.random()*2.4,born:this.clock,life,r:(.03+Math.random()*.055)*(heavy?1.2:1),color:i%4===0?HOT:i%3===0?DARK:RED,stain:stain&&i%5===0});
  }
 }
 shed(c,age){
  if(!(c.power>.04))return;const v=this.view,spin=ichorSpin(c.variant),q=ichorCutProgress(c.variant,Math.min(1,age/(c.duration||.24))),total=Math.round((v.qualityName==='potato'?10:18)*c.power*(c.frenzy?1.5:1)),wanted=Math.floor(q*total);
  // Emission follows blade travel, not render frames: paused cuts never keep
  // producing blood, and a lower frame rate does not lose the spray.
  for(let i=c.shed||0;i<wanted;i++){const f=(i+.5)/total,t=spin?.12+f*.74:.17+f*.26,m=ichorMotion(c.variant,t),a=Math.atan2(c.dz,c.dx)-m[3]-m[6],sign=ichorCutSign(c.variant),r=.95+Math.random()*.94,x=c.x+Math.cos(a)*r,z=c.z+Math.sin(a)*r;
   if(r>coverReach(c.cover,a))continue;
   const dx=-Math.sin(a)*sign+Math.cos(a)*.24,dz=Math.cos(a)*sign+Math.sin(a)*.24,n=Math.hypot(dx,dz),push=2.3+Math.random()*3.7;
   this.addBloodMote({x,z,y:ichorTrailHeight(v,x,z,floorY(v,c.x,c.z,c.below)+.8+m[4]*.35,c.below),below:c.below,vx:dx/n*push,vz:dz/n*push,vy:.3+Math.random()*1.4,born:this.clock,life:.5+Math.random()*.35,r:.024+Math.random()*.033,color:i%3?RED:DARK,stain:i%4===0,shed:true});
  }c.shed=wanted;
 }
 updateBlood(sim){const v=this.view;if(this.bloodMotes.length>this.bloodCap)this.bloodMotes.splice(0,this.bloodMotes.length-this.bloodCap);
  this.bloodMotes=this.bloodMotes.filter(m=>this.clock-m.born<m.life&&!m.dead);
  for(const m of this.bloodMotes){const t=this.clock-m.born,x=m.x+m.vx*t,z=m.z+m.vz*t,rawY=m.y+m.vy*t-4*t*t,floor=floorY(v,x,z,m.below)+.035,y=Math.max(floor,rawY),r=m.r*(1-t/m.life);
   if(m.stain&&m.wall===undefined){const speed=Math.hypot(m.vx,m.vz);m.wall=castToWall(sim.colliders,m.x,m.z,m.vx,m.vz,speed*m.life,.1,v.ground.flat?null:v.ground)||null;}
   if(m.wall&&Math.hypot(x-m.x,z-m.z)>=m.wall.distance){const w=m.wall;if(sim.canSeeEntity(w.x,w.z,.1))(v.drops ||=new BloodDrops(v)).stain(w.x,Math.max(floorY(v,w.x,w.z,m.below)+.06,Math.min(y,floorY(v,w.x,w.z,m.below)+w.height-.03)),w.z,m.r*3,w.nx,w.nz,w.propId);m.dead=true;continue;}
   if(rawY<=floor&&t>.06){if(m.stain&&sim.canSeeEntity(x,z,.1))(v.drops ||=new BloodDrops(v)).stain(x,floor-.022,z,m.r*(3.2+Math.random()*1.3));m.dead=true;continue;}
   if(sim.canSeeEntity(x,z,.1)){const color=m.color||RED,tail=.026+.022*(1-t/m.life);this.line(x,y,z,x-m.vx*tail,y-(m.vy-8*t)*tail,z-m.vz*tail,r*(m.shed?.65:1.1),color);this.line(x,y,z,x-m.vx*tail*.32,y-(m.vy-8*t)*tail*.32,z-m.vz*tail*.32,r*(m.shed?1.1:2.2),color);}
  }
 }
 update(sim,dt){const v=this.view,p=sim.player;this.clock+=dt;for(const m of this.meshes)m.count=0;this.model.visible=sim.weapon==='ichor'&&!p.dead;
 if(this.model.visible){poseIchor(this.model,sim.ichor,this.clock);v.rifleView.pose.update(sim,0,0,0);const pose=this.model.userData.ichorPose;applyIchorBody(v.player.userData.body,pose);}
 if((v.wading?.drench>0||this.drench)&&!p.dead){this.drench??=new IchorDrench(v.player.userData.body,v.rifleView.pose.root);this.drench.set(v.wading.drench);}
 if(this.wasActive&&!this.model.visible)v.player.userData.body.rotation.y=0;this.wasActive=this.model.visible;
 this.cuts=this.cuts.filter(c=>this.clock-c.born<.32);
 for(const c of this.cuts){const age=this.clock-c.born;if(age>=.018&&sim.canSeeEntity(c.x,c.z,.1)){if(c.cover===undefined)c.cover=ichorCutCover(sim,c.x,c.z,floorY(v,c.x,c.z,c.below)+.72);this.shed(c,age);this.cut(c,age);}}
 for(const w of sim.ichorWaves||[]){if(!sim.canSeeEntity(w.x,w.z,.1))continue;const r=.5+w.travel/17*1.7,dir=Math.atan2(w.dz,w.dx);this.arc(w.x-w.dx*r*.25,w.z-w.dz*r*.25,w.y,dir,-1.25,2.5,r,.28,w.power,false,RED,{below:w.below});let old=this.waveTrail.get(w.id);if(!old){old={x:w.x,z:w.z,travel:w.travel};this.waveTrail.set(w.id,old);}
 const moved=Math.hypot(w.x-old.x,w.z-old.z);if(moved>.5){const drops=v.drops ||=new BloodDrops(v),count=Math.min(4,Math.ceil(moved/.5));for(let k=1;k<=count;k++){const f=k/count,x=old.x+(w.x-old.x)*f,z=old.z+(w.z-old.z)*f;drops.stain(x,floorY(v,x,z,w.below)+.013,z,.17+Math.random()*.19);this.bloodSpray(x,z,w.y,-w.dx,-w.dz,v.qualityName==='potato'?6:11,w.below,{stain:true});}old.x=w.x;old.z=w.z;}
 for(let j=0;j<11;j++){const phase=this.clock*15+j*2.4,side=Math.sin(phase)*r,back=.3+(j%3)*.17,px=w.x-w.dz*side-w.dx*back,pz=w.z+w.dx*side-w.dz*back;this.line(px,w.y+.12*Math.sin(phase),pz,px-w.dx*.26,w.y-.08,pz-w.dz*.26,.07,j%3?RED:DARK);}
 for(let i=0;i<5;i++)this.arc(w.x-w.dx*(.22+i*.15),w.z-w.dz*(.22+i*.15),w.y-.04,dir,-1.0,2,r*.95,.018,w.power,false,RED,{below:w.below});}
 const liveWaves=new Set((sim.ichorWaves||[]).map(w=>w.id));for(const id of this.waveTrail.keys())if(!liveWaves.has(id))this.waveTrail.delete(id);
 this.updateBlood(sim);
 this.ricochets=this.ricochets.filter(e=>this.clock-e.born<Math.max(.24,(e.range||4)/22+.07));
 for(const e of this.ricochets){const age=this.clock-e.born,d=Math.min(e.range||4,age*22),x=e.x+e.dx*d,z=e.z+e.dz*d,y=ichorTrailHeight(v,x,z,e.y??floorY(v,e.x,e.z,e.below)+.7,e.below);
  if(d<(e.range||4)&&sim.canSeeEntity(x,z,.1)){this.line(x,y,z,x-e.dx*.38,y,z-e.dz*.38,.042,WHITE);this.line(x-e.dx*.18,y,z-e.dz*.18,x-e.dx*.62,y,z-e.dz*.62,.019,YELLOW);}
  if(age<.24&&sim.canSeeEntity(e.x,e.z,.1)){const fade=1-age/.24,cy=e.y??y,count=v.qualityName==='potato'?8:['quality','extreme'].includes(v.qualityName)?18:12;
   // A tight white contact star followed by yellow-white flying steel sparks.
   if(age<.10)for(let i=0;i<4;i++){const a=i*Math.PI/4,r=(.13+(1-age/.1)*.17)*(i%2?.7:1);this.line(e.x-Math.cos(a)*r,cy+.025,e.z-Math.sin(a)*r,e.x+Math.cos(a)*r,cy+.025,e.z+Math.sin(a)*r,.036*(1-age/.12),WHITE);}
   for(let i=0;i<count;i++){const a=i*2.399+Math.atan2(e.dz,e.dx),r=.045+age*(2.6+(i%4)*1.2),tail=(.11+(i%3)*.055)*fade,cyi=cy+age*(.35+(i%3)*.55)-age*age*3;this.line(e.x+Math.cos(a)*r,cyi,e.z+Math.sin(a)*r,e.x+Math.cos(a)*(r+tail),cyi+.035*fade,e.z+Math.sin(a)*(r+tail),(.025+(i%2)*.018)*fade,i%3?YELLOW:WHITE);}
  }
 }
 this.frenzyBursts=this.frenzyBursts.filter(e=>this.clock-e.born<.33);for(const e of this.frenzyBursts){if(!sim.canSeeEntity(e.x,e.z,.1))continue;const age=this.clock-e.born,q=age/.33,[fill,edge,vein]=this.colours(e.power,1),y=floorY(v,e.x,e.z,e.below)+.4;for(let i=0;i<9;i++){const a=i*2.399;this.ribbon(e.x,e.z,y,0,a+q*.5,.12+q*.2,.65+q*1.7,.07*(1-q),i%3?edge:vein,5,{below:e.below,tilt:.13,alt:fill});}}
 this.sparks=this.sparks.filter(s=>this.clock-s.born<s.life);for(const s of this.sparks){const t=this.clock-s.born,x=s.x+s.vx*t,z=s.z+s.vz*t,y=s.y+s.vy*t-3*t*t;if(sim.canSeeEntity(x,z,.1))this.line(x,y,z,x-s.vx*.025,y-.05,z-s.vz*.025,.025,s.color);}
 this.pools=this.pools.filter(t=>this.clock-t.born<18);
 const people=[...v.remotePlayers||[],{...p,weapon:sim.weapon,ichor:sim.ichor}];for(const b of people){if(b.hp<=0)continue;const own=b.id===p.id,avatar=own?v.player:v.remote?.avatars.get(b.id)?.root;if(!avatar?.visible)continue;if(b.weapon==='ichor')this.guardGlint(own?this.model:v.remote?.avatars.get(b.id)?.hand,b.ichor);const moving=Math.hypot(b.vx,b.vz)>.6,wet=this.pools.some(t=>Math.hypot(t.x-b.x,t.z-b.z)<t.r)||(own?v.wading?.inside:v.remote?.avatars.get(b.id)?.wading?.inside);if(wet&&moving&&this.clock-(this.footTime.get(b.id)||0)>.28){this.footTime.set(b.id,this.clock);v.onBloodSound?.('step',b.x,b.z);}
  if(b.weapon==='ichor'&&b.ichor?.trail){const i=this.glows.count,d=this.dummy;d.position.set(b.x,floorY(v,b.x,b.z,b.below)+.07,b.z);d.rotation.set(0,0,0);d.scale.setScalar(.58+Math.sin(this.clock*15)*.06);d.updateMatrix();this.glows.setMatrixAt(i,d.matrix);this.glows.setColorAt(i,RED);this.glows.count++;}
 }
 for(const [id,t]of this.footTime)if(this.clock-t>3)this.footTime.delete(id);for(const m of this.meshes){m.visible=m.count>0;if(m===this.ribbons){m.geometry.setDrawRange(0,m.count);if(m.count){m.geometry.attributes.position.needsUpdate=m.geometry.attributes.color.needsUpdate=true;}}else if(m.count){m.instanceMatrix.needsUpdate=m.instanceColor.needsUpdate=true;}}
 }
}
