import * as THREE from 'three';
import { makeSightline,poseSightline } from './sightline-model.js';
import { SIGHTLINE as S,sightlineRange,sightlineCanScope } from './sightline.js';
import { segmentBox } from '../simulation.js';
import { sightlineFlight,sightlineY,sightlineGuideEnd } from './sightline-flight.js';
import { POP } from '../render/shot-pop.js';
const WHITE=new THREE.Color('#d9e1ce'),AMBER=new THREE.Color('#ffb854'),HOT=new THREE.Color('#ff263c'),HOT_CORE=new THREE.Color('#ffc5a9'),VAPOR=new THREE.Color('#c6c6b9');
const YELLOW=new THREE.Color('#ffe449'),YELLOW_CORE=new THREE.Color('#fff8bf');
// The pop pass (render/shot-pop.js): a round is a white core over a dark
// line with a brighter, wider head; the laser a bright red core over a dark
// band (its halo was a mid red at .65, muddy on sand and lost at night).
const ROUND=new THREE.Color(POP.sightline.round),ROUND_RIM=new THREE.Color(POP.sightline.roundRim),LASER_HALO=new THREE.Color(POP.sightline.laserHalo),LASER_CORE=new THREE.Color(POP.sightline.laserCore);
const YELLOW_SPARKS=[YELLOW_CORE,YELLOW,new THREE.Color('#d5a51d'),new THREE.Color('#6c4712')];
const noise=n=>{const v=Math.sin(n*127.1+311.7)*43758.5453;return v-Math.floor(v);};
export class SightlineView{
 constructor(view){
  this.view=view;this.time=0;this.recoil=0;this.wakes=[];this.crackles=[];this.vapor=0;this.laserPaths=new Map();this.frame=0;this.model=makeSightline();this.model.visible=false;view.player.userData.gun.add(this.model);
  this.dummy=new THREE.Object3D();this.a=new THREE.Vector3();this.b=new THREE.Vector3();this.muzzle=new THREE.Vector3();this.up=new THREE.Vector3(0,1,0);
  this.lines=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshBasicMaterial({color:'#ffffff',transparent:true,opacity:POP.sightline.opacity,depthWrite:false,toneMapped:false}),2048);
  const guideMaterial=this.lines.material.clone();guideMaterial.userData.ownSightlineGuide=true;guideMaterial.depthTest=false;
  this.guideLines=new THREE.InstancedMesh(this.lines.geometry,guideMaterial,320);
  this.meshes=[this.lines,this.guideLines];
  // Fading decks are transparent meshes. Draw beams after their depth so an
  // above-deck shot stays visible, while depth testing still hides one below.
  for(const mesh of this.meshes){mesh.renderOrder=2;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.setColorAt(0,WHITE);mesh.count=0;mesh.frustumCulled=false;view.scene.add(mesh);}
  // The owner's guide is a placement aid, ending at the first physical stop.
  // Its animated muzzle sits below the firing plane: depth-testing that visual
  // connector against hills made gaps and let it reappear beyond them. Draw it
  // after fog/decks; the shared flight/cover query still cuts it at blockers.
  // Other players' guides and all bullets retain ordinary depth concealment.
  this.guideLines.renderOrder=6;

 }
 clear(){this.wakes.length=this.crackles.length=0;for(const mesh of this.meshes){mesh.count=0;mesh.visible=false;}this.laserPaths.clear();this.aimEnd=null;this.recoil=0;}
 laserPath(sim,p,s){
  const key=p.id??sim.player,old=this.laserPaths.get(key),aspect=sim.viewAspect||16/9,ground=sim.ground,colliders=sim.colliders;
  const cursor=Number.isFinite(p.aimReach)?p.aimReach:s.aimReach??Math.hypot((p.aimPointX??p.x+25)-p.x,(p.aimPointZ??p.z)-p.z);
  if(old&&old.x===p.x&&old.z===p.z&&old.dx===p.aimX&&old.dz===p.aimZ&&old.below===p.below&&old.cursor===cursor&&old.aspect===aspect&&old.ground===ground&&old.colliders===colliders&&old.n===colliders.length){old.frame=this.frame;return old;}
  const height=p.below?ground.drawnHeightAt(p.x,p.z):ground.heightAt(p.x,p.z),max=sightlineRange(aspect,p.aimX,p.aimZ,height);
  const reach=Math.min(max,Math.max(.05,Math.sqrt(Math.max(0,cursor*cursor-S.muzzleLateral*S.muzzleLateral))-S.muzzleForward));
  const ray=sightlineFlight(sim,p,p.aimX,p.aimZ,reach,segmentBox,cursor),length=sightlineGuideEnd(sim,ray,segmentBox);
  const pieces=Math.min(96,Math.max(1,Math.ceil(length/.8))),points=new Float64Array((pieces+1)*3);
  for(let i=0;i<=pieces;i++){const distance=length*i/pieces;points[i*3]=ray.x+ray.dx*distance;points[i*3+1]=sightlineY(sim,ray,distance);points[i*3+2]=ray.z+ray.dz*distance;}
  // Cover arrays change when props break/return. Stationary aim can reuse both
  // the cover query and terrain samples; all animated light still draws afresh.
  const path={x:p.x,z:p.z,dx:p.aimX,dz:p.aimZ,below:p.below,cursor,aspect,ground,colliders,n:colliders.length,points,length,pieces,frame:this.frame};this.laserPaths.set(key,path);return path;
 }
 line(ax,ay,az,bx,by,bz,width,color,mesh=this.lines){
  const i=mesh.count;if(i>=mesh.instanceMatrix.count)return;this.a.set(ax,ay,az);this.b.set(bx,by,bz);
  const d=this.dummy;d.position.copy(this.a).add(this.b).multiplyScalar(.5);d.quaternion.setFromUnitVectors(this.up,this.b.sub(this.a).normalize());d.scale.set(width,Math.hypot(bx-ax,by-ay,bz-az),width);d.updateMatrix();mesh.setMatrixAt(i,d.matrix);mesh.setColorAt(i,color);mesh.count++;
 }
 // Four jagged segments reuse the existing beam batch. The straight red
 // guide remains intact underneath; only these yellow filaments flicker.
 crackle(ax,ay,az,bx,by,bz,seed,spread,width,mesh=this.lines){
  const length=Math.hypot(bx-ax,bz-az)||1,px=-(bz-az)/length,pz=(bx-ax)/length;
  let x=ax,y=ay,z=az;
  for(let i=1;i<=4;i++){
   const t=i/4,edge=i===4?0:1,jitter=(noise(seed+i)-.5)*spread*edge;
   const nx=ax+(bx-ax)*t+px*jitter,ny=ay+(by-ay)*t+(noise(seed+i+7)-.5)*spread*.45*edge,nz=az+(bz-az)*t+pz*jitter;
   this.line(x,y,z,nx,ny,nz,width,i%3?YELLOW:YELLOW_CORE,mesh);x=nx;y=ny;z=nz;
  }
 }
 breachBurst(e,muzzle=false){
  if(this.crackles.length>=12)this.crackles.shift();
  const floor=e.below&&this.view.ground?this.view.ground.drawnHeightAt(e.x,e.z):this.view.gy?.(e.x,e.z)||0;
  this.crackles.push({x:e.x,z:e.z,y:muzzle?(e.y??floor+.77):floor+.22,radius:muzzle?.8:e.radius,age:0,life:muzzle?.25:.65,below:!!e.below,muzzle,seed:e.x*19+e.z*31});
  const fx=this.view.fx;if(!fx?.on)return;
  fx.glow({x:e.x,y:muzzle?(e.y??floor+.77)-floor:.4,z:e.z,size:muzzle?1.1:e.radius*1.6,life:.14,color:YELLOW,glow:1.3});
  for(let i=0,n=fx.n(muzzle?6:22);i<n;i++){
   const a=Math.random()*Math.PI*2,speed=(muzzle?2:4)+Math.random()*(muzzle?2:7);
   fx.spark({x:e.x,y:muzzle?(e.y??floor+.77)-floor:.4,z:e.z,vx:Math.cos(a)*speed,vz:Math.sin(a)*speed,vy:1+Math.random()*2,life:.18+Math.random()*.35,length:.16,width:.023,stops:YELLOW_SPARKS});
  }
 }
 event(e){
  const v=this.view;
  if(e.type==='sightlineShot'){
   if(e.special)this.breachBurst(e,true);
   if(!e.remote)this.recoil=e.pistol?.09:.22;
   v.fx.muzzle(e.pistol?'rifle':'shotgun',e.x,.76,e.z,e.dx,e.dz,e.special?1:0);
   if(!e.pistol){v.shake=Math.max(v.shake||0,e.special?.14:.07);v.shakeDecay=12;}
   if(e.special){v.fx.glow({x:e.x,y:.77,z:e.z,size:.85,life:.13,color:HOT_CORE,glow:1.4});for(let j=0;j<(v.qualityName==='extreme'?18:v.qualityName==='quality'?12:6);j++)v.fx.spark({x:e.x,y:.77,z:e.z,vx:e.dx*3+(Math.random()-.5)*3,vz:e.dz*3+(Math.random()-.5)*3,vy:(Math.random()-.3)*2,life:.14+Math.random()*.12,length:.14,width:.025});for(let i=0;i<7;i++)v.fx.puff({x:e.x,y:.8,z:e.z,vx:e.dx*(1+i*.18),vz:e.dz*(1+i*.18),size:.15,life:.5,alpha:.3,color:VAPOR,vy:.25});}
  }
  if(e.type==='sightlineImpact'){v.burst(e.x,e.z,e.pistol?3:9,'dust');for(let i=0;i<(e.pistol?2:5);i++)v.fx.spark({x:e.x,y:.12,z:e.z,vx:(Math.random()-.5)*4,vz:(Math.random()-.5)*4,vy:1+Math.random()*2,life:.3});}
 }
 update(sim,dt){
  this.time+=dt;this.frame++;this.aimEnd=null;this.recoil=Math.max(0,this.recoil-dt);this.model.visible=sim.weapon==='sightline'&&!sim.player.dead;this.lines.count=this.guideLines.count=0;
  if(this.model.visible){const pose=poseSightline(this.model,sim.sightline,this.time,dt);const rifle=this.model.getObjectByName('sightline-rifle');if(sim.sightline.crouched){rifle.position.z+=this.recoil*.6;rifle.getObjectByName('sightline-bolt').position.z+=this.recoil*.4;}else if(!sim.sightline.xLoading){const sidekick=this.model.getObjectByName('sightline-pistol');sidekick.position.z+=this.recoil*.7;sidekick.rotation.x-=this.recoil*.9;}
   this.view.rifleView.pose.update(sim,0,0,this.recoil);
   this.view.player.userData.body.scale.y*=1-.27*pose.bodyCrouch;this.view.player.userData.body.rotation.x-=.07*pose.bodyCrouch;
  }
  const bodies=[...(this.view.remotePlayers||[])];if(this.model.visible)bodies.push({...sim.player,sightline:sim.sightline});
  this.vapor+=dt;
  for(const p of bodies){const s=p.sightline;if(!s||p.dead||p.hp<=0)continue;
   if(this.vapor>.16&&(s.special||s.xLoading&&s.rifleReload<1.5)){
    const own=p===sim.player||p.id===sim.player.id,pack=own?this.model:this.view.remote?.avatars.get(p.id)?.hand;
    const vent=pack?.getObjectByName('sightline-vents');if(vent){vent.getWorldPosition(this.a);this.view.fx.puff({x:this.a.x,y:this.a.y-this.view.gy(this.a.x,this.a.z),z:this.a.z,color:VAPOR,size:.08,life:.75,grow:2,alpha:.16,vy:.35,vx:.07,vz:.04});}
   }
   if(!s.rifleAmmo||!s.crouched||!s.aiming||!sightlineCanScope(sim,p)||s.commit>0||s.xLoading||s.rifleReload)continue;
   // The guide and shot share a straight flight; ground ends it, never bends it.
   const {points,length,pieces}=this.laserPath(sim,p,s),hot=s.special&&s.crouched,scale=Math.min(2.6,Math.max(1,this.view.cameraHeight/29));
   const own=p.id===sim.player.id,mesh=own?this.guideLines:this.lines;
   if(own)this.aimEnd={x:points.at(-3),y:points.at(-2),z:points.at(-1)};
   const pack=own?this.model:this.view.remote?.avatars.get(p.id)?.hand,barrel=pack?.getObjectByName('sightline-rifle');
   this.muzzle.set(points[0],points[1],points[2]);
   if(barrel)barrel.localToWorld(this.muzzle.set(0,.045,-1.359));
   const sx=this.muzzle.x,sy=this.muzzle.y,sz=this.muzzle.z,ex=points.at(-3),ey=points.at(-2),ez=points.at(-1);
   // Continuous core/halo avoids seams and spends only two instances on the
   // normal beam. Breach's traveling highlights stay on that same straight line.
   this.line(sx,sy,sz,ex,ey,ez,(hot?.26:.15)*scale,hot?HOT:LASER_HALO,mesh);
   this.line(sx,sy+.005,sz,ex,ey+.005,ez,(hot?.11:.07)*scale,hot?HOT_CORE:LASER_CORE,mesh);
   if(hot)for(let i=0;i<pieces;i++){
    const a=i/pieces,b=(i+1)/pieces,ax=sx+(ex-sx)*a,ay=sy+(ey-sy)*a,az=sz+(ez-sz)*a,bx=sx+(ex-sx)*b,by=sy+(ey-sy)*b,bz=sz+(ez-sz)*b;
    if(((a*length-this.time*9)%4+4)%4<.8)this.line(ax,ay+.045,az,bx,by+.045,bz,.045*scale,AMBER,mesh);
   }
   if(hot){
    const count=Math.min(this.view.qualityName==='extreme'?18:this.view.qualityName==='quality'?15:10,Math.max(2,Math.ceil(length/2.6))),beat=Math.floor(this.time*22);
    for(let i=0;i<count;i++){
     if(noise(beat+i*13)<.25)continue;
     const a=(i+.15+noise(beat+i)*.35)/count,b=Math.min(1,a+Math.min(.8/Math.max(.1,length),.6/count));
     this.crackle(sx+(ex-sx)*a,sy+(ey-sy)*a+.055,sz+(ez-sz)*a,sx+(ex-sx)*b,sy+(ey-sy)*b+.055,sz+(ez-sz)*b,beat+i*17,.32*scale,.036*scale,mesh);
    }
   }
  }
  for(const [key,path] of this.laserPaths)if(path.frame!==this.frame)this.laserPaths.delete(key);
  if(this.vapor>.16)this.vapor=0;
  for(const b of sim.sightlineRounds||[]){
   const P=POP.sightline,length=b.pistol?P.pistolLength:P.length,y=b.y??.76,rise=b.flight?.slope||b.rise||0,k=b.pistol?.8:1,head=Math.min(length,.22);
   this.line(b.x-b.dx*length,y-rise*length,b.z-b.dz*length,b.x+b.dx*.04,y,b.z+b.dz*.04,P.rimWidth*k,ROUND_RIM);
   this.line(b.x-b.dx*length,y-rise*length+.004,b.z-b.dz*length,b.x,y+.004,b.z,P.roundWidth*k,b.special?AMBER:ROUND);
   this.line(b.x-b.dx*head,y-rise*head+.008,b.z-b.dz*head,b.x,y+.008,b.z,P.roundWidth*k*1.5,b.special?YELLOW_CORE:ROUND);
   if(!b.pistol&&dt>0&&this.wakes.length<480)this.wakes.push({x:b.x,z:b.z,y,dx:b.dx,dz:b.dz,t:0,life:.48,special:b.special});
  }
  for(const w of this.wakes){w.t+=dt;const f=1-w.t/w.life;if(f<=0)continue;
   const sway=Math.sin(w.t*12+w.x*.8)*.05;
   this.line(w.x-w.dx*.95-w.dz*sway,w.y+w.t*.17,w.z-w.dz*.95+w.dx*sway,w.x,w.y,w.z,.027*f,w.special?AMBER:WHITE);
   if(this.view.qualityName==='extreme'||this.view.qualityName==='quality')this.line(w.x-w.dx*.6+w.dz*.10,w.y+.04,w.z-w.dz*.6-w.dx*.10,w.x+w.dz*.05,w.y+.04,w.z-w.dx*.05,.012*f,WHITE);
  }
  this.wakes=this.wakes.filter(w=>w.t<w.life);
  let alive=0;
  for(const burst of this.crackles){
   burst.age+=dt;if(burst.age>=burst.life)continue;this.crackles[alive++]=burst;
   const t=burst.age/burst.life,beat=Math.floor(burst.age*26),count=burst.muzzle?5:this.view.qualityName==='extreme'?18:this.view.qualityName==='quality'?14:9;
   for(let i=0;i<count;i++){
    if(noise(burst.seed+i*11+beat)<.22)continue;
    const angle=i/count*Math.PI*2+(noise(burst.seed+i)-.5)*.35,r=burst.radius*(.28+.72*Math.min(1,t*2.4)),dx=Math.cos(angle),dz=Math.sin(angle);
    const x=burst.x+dx*r*.32,z=burst.z+dz*r*.32,ex=burst.x+dx*r,ez=burst.z+dz*r;
    const ground=burst.below?this.view.ground:null;
    const y=burst.muzzle?burst.y:Math.max(burst.y,(ground?.drawnHeightAt(x,z)??this.view.gy?.(x,z)??0)+.18),ey=burst.muzzle?burst.y:Math.max(burst.y,(ground?.drawnHeightAt(ex,ez)??this.view.gy?.(ex,ez)??0)+.18);
    this.crackle(x,y,z,ex,ey+Math.sin(t*Math.PI)*.25,ez,burst.seed+beat*13+i,burst.muzzle?.18:.6,(burst.muzzle?.038:.065)*(1-t*.85));
   }
  }
  this.crackles.length=alive;
  for(const mesh of this.meshes){mesh.visible=mesh.count>0;mesh.instanceMatrix.needsUpdate=true;mesh.instanceColor.needsUpdate=true;}
 }
}
