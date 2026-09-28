import * as THREE from 'three';
import { makeOmen } from './omen-model.js';
import { floorY } from '../render/ground-lift.js';
import { OMEN } from '../config/gameplay.js';
import { puffMaterial } from '../effects/effects-detail.js';
const UP=new THREE.Vector3(0,1,0),TAU=Math.PI*2,CURSE_SCALE=1.25;
const RED=new THREE.Color('#f02e4e'),HOT=new THREE.Color('#ffc0a4'),ORANGE=new THREE.Color('#ffa33e');
const EMBER=new THREE.Color('#a93c26'),PALE=new THREE.Color('#ffdc9a'),CRIMSON=new THREE.Color('#931d3a');
const INK=new THREE.Color('#380e24'),SMOKE=new THREE.Color('#352331'),ASH=new THREE.Color('#75505c');
const PURPLE=new THREE.Color('#a949f5'),LILAC=new THREE.Color('#dfa2ff');
// Every preset keeps the muzzle burst, faceted rounds, red wake and prime seal.
// Higher presets spend instances on finer facets, chips and split wake strands.
const LOOK=Object.freeze({
 potato:{facets:2,chips:2,sparks:10,trailSteps:7,trailLife:.14,filaments:0,smoke:6},
 performance:{facets:2,chips:3,sparks:13,trailSteps:9,trailLife:.16,filaments:0,smoke:8},
 balanced:{facets:4,chips:4,sparks:17,trailSteps:11,trailLife:.17,filaments:0,smoke:12},
 quality:{facets:4,chips:6,sparks:25,trailSteps:14,trailLife:.19,filaments:1,smoke:20},
 extreme:{facets:4,chips:9,sparks:36,trailSteps:18,trailLife:.21,filaments:2,smoke:30},
});
const TRAIL_POINTS=24,TRAIL_LIMIT=96,DIAMOND_LIMIT=2048,LINE_LIMIT=12288,SMOKE_LIMIT=192;

// Reused points: independent lengths and crossing waves, with roots anchored
// to the seal. Progress runs inward so the energy can travel down a waving arm.
export function sigilTendrilPoint(out,angle,progress,time,arm,radius=1,inner=.66){
 const phase=arm*2.399,free=1-progress;
 const reach=radius*(2.55+.48*Math.sin(phase*1.7)+.24*Math.sin(time*(.63+arm%3*.13)+phase));
 const wave=Math.sin(time*(.91+arm%3*.16)+progress*5.8+phase)*.34
  +Math.sin(time*1.43-progress*10.2+phase*1.8)*.12;
 const bearing=angle+Math.sin(phase)*.15+free*wave+free*free*Math.sin(phase+.6)*.45;
 const r=inner+(reach-inner)*free;
 out.x=Math.cos(bearing)*r;out.z=Math.sin(bearing)*r;return out;
}

// All diamonds, sigils, connecting threads, sparks and dissolving fragments
// share three prebuilt batches, plus one smoke batch using the game's puff
// shader. More detail changes instance counts, never
// creates a light, geometry or shader during a fight.
export class OmenView{
 constructor(view){
  this.view=view;this.time=0;this.recoil=0;this.effects=[];this.links=new Map();this.groups=new Map();this.primers=new Map();
  this.trails=new Map();this.freeTrails=Array.from({length:TRAIL_LIMIT},()=>({points:new Float32Array(TRAIL_POINTS*4),head:0,count:0}));
  this.model=makeOmen(3);this.model.visible=false;view.player.userData.gun.add(this.model);
  this.dummy=new THREE.Object3D();this.vector=new THREE.Vector3();this.color=new THREE.Color();this.flowColor=new THREE.Color();
  this.tendrilA={x:0,z:0};this.tendrilB={x:0,z:0};
  const batch=(geometry,capacity,opacity=1)=>{
   const mat=new THREE.MeshBasicMaterial({color:'#ffffff',transparent:true,opacity,depthWrite:false,toneMapped:false,blending:THREE.AdditiveBlending});
   const mesh=new THREE.InstancedMesh(geometry,mat,capacity);mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
   mesh.setColorAt(0,RED);mesh.count=0;mesh.frustumCulled=false;view.scene.add(mesh);return mesh;
  };
  this.lines=batch(new THREE.BoxGeometry(1,1,1),LINE_LIMIT,1);
  // A red core stays red over pale sand; only the soft edge adds light.
  // Per-instance alpha lets a dissolving stroke fade rather than turn black.
  this.lines.material.blending=THREE.NormalBlending;
  this.fades=new THREE.InstancedBufferAttribute(new Float32Array(LINE_LIMIT),1);this.fades.setUsage(THREE.DynamicDrawUsage);
  this.lines.geometry.setAttribute('omenFade',this.fades);
  this.lines.material.onBeforeCompile=shader=>{
   shader.vertexShader='attribute float omenFade; varying float vOmenFade;\n'+shader.vertexShader;
   shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvOmenFade=omenFade;');
   shader.fragmentShader='varying float vOmenFade;\n'+shader.fragmentShader;
   shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\ndiffuseColor.a*=vOmenFade;');
  };
  this.lines.material.customProgramCacheKey=()=> 'omen-fade-v1';
  this.halos=batch(new THREE.BoxGeometry(1,1,1),LINE_LIMIT,.17);
  this.diamonds=batch(new THREE.OctahedronGeometry(1),DIAMOND_LIMIT,1);
  this.diamonds.material.blending=THREE.NormalBlending;
  this.smoke=batch(new THREE.IcosahedronGeometry(1,1),SMOKE_LIMIT,1);this.smoke.material.dispose();
  this.clearZone=view.fx?.clearZone||{value:new THREE.Vector2(1e5,1e5)};
  this.smoke.material=puffMaterial(this.clearZone);this.smoke.renderOrder=1;
  this.smokeAlpha=new THREE.InstancedBufferAttribute(new Float32Array(SMOKE_LIMIT),1);this.smokeAlpha.setUsage(THREE.DynamicDrawUsage);
  this.smoke.geometry.setAttribute('instanceAlpha',this.smokeAlpha);
  this.meshes=[this.lines,this.halos,this.diamonds,this.smoke];
 }
 clear(){
  this.effects.length=0;this.links.clear();this.groups.clear();this.primers.clear();this.recoil=0;
  for(const trail of this.trails.values())this.freeTrails.push(trail);this.trails.clear();
  for(const m of this.meshes)m.count=0;
 }
 event(e){
  if(e.type==='omenShot'&&!e.remote)this.recoil=.10;
  if(!['omenShot','omenBurst','omenFade','omenImpact','omenMark','omenPrime','omenPrimeExpired','omenTick','omenVolley'].includes(e.type))return;
  if(this.effects.length>=72)this.effects.shift();
  this.effects.push({kind:e.type,id:e.id,local:!e.remote,x:e.x||0,z:e.z||0,y:e.y,dx:e.dx??0,dz:e.dz??-1,below:e.below,t:0,
   life:e.type==='omenFade'?.85:e.type==='omenBurst'?1.65:e.type==='omenShot'?.34:e.type==='omenImpact'?.44:e.type==='omenVolley'?.65:e.type==='omenPrimeExpired'?.5:.32,
   power:e.power||1,orange:e.kind==='base'});
  if(e.type==='omenBurst'){
   const p=this.view.lastSim?.player,d=p?Math.hypot(e.x-p.x,e.z-p.z):0;
   this.view.shake=Math.max(this.view.shake||0,.19*Math.max(0,1-d/20));this.view.shakeDecay=8;
  }
 }
 diamond(x,y,z,dx,dz,width,length,color,spin=0){
  const i=this.diamonds.count;if(i>=DIAMOND_LIMIT||width<=0)return;
  const d=this.dummy;d.position.set(x,y,z);d.quaternion.setFromUnitVectors(UP,this.vector.set(dx,0,dz).normalize());d.rotateY(spin);
  d.scale.set(width,length,width);d.updateMatrix();this.diamonds.setMatrixAt(i,d.matrix);this.diamonds.setColorAt(i,color);this.diamonds.count++;
 }
 line(ax,ay,az,bx,by,bz,width,color=RED,fade=1){
  const i=this.lines.count;if(i>=LINE_LIMIT||fade<=0)return;
  const d=this.dummy,v=this.vector;v.set(bx-ax,by-ay,bz-az);const len=v.length();if(len<.001)return;
  d.position.set((ax+bx)/2,(ay+by)/2,(az+bz)/2);d.quaternion.setFromUnitVectors(UP,v.multiplyScalar(1/len));d.scale.set(width,len,width);d.updateMatrix();
  this.lines.setMatrixAt(i,d.matrix);this.lines.setColorAt(i,color);this.fades.setX(i,Math.min(1,fade));this.lines.count++;
  d.scale.set(width*3.5,len,width*3.5);d.updateMatrix();this.halos.setMatrixAt(i,d.matrix);this.halos.setColorAt(i,this.color.copy(color).multiplyScalar(fade));this.halos.count++;
 }
 groundLine(m,ax,az,bx,bz,width,color=RED,fade=1,lift=.04){
  const x=m.x+ax,z=m.z+az,xx=m.x+bx,zz=m.z+bz;
  this.line(x,floorY(this.view,x,z,m.below)+lift,z,xx,floorY(this.view,xx,zz,m.below)+lift,zz,width,color,fade);
 }
 ring(m,r,angle,segments,width,fade=1,broken=false,color=RED){
  for(let i=0;i<segments;i++){
   if(broken&&i%6===0)continue;
   const a=angle+i/segments*TAU,b=angle+(i+.90)/segments*TAU;
   this.groundLine(m,Math.cos(a)*r,Math.sin(a)*r,Math.cos(b)*r,Math.sin(b)*r,width,color,fade);
  }
 }
 primeSigil(m,look){
  const fade=Math.min(1,m.age*5)*m.left/.25,turn=this.time*.32;
  const fine=look.facets===4,segments=fine?40:28,pulse=.82+.18*Math.sin(this.time*5);
  // A six-point intake seal belongs to the caster. The victim's five-point
  // red ritual is deliberately a different silhouette, not a recolour.
  this.ring(m,1.12,turn,segments,.10,fade*.85,true,INK);
  this.ring(m,1.12,turn,segments,.042,fade,true,PURPLE);
  this.ring(m,1.25,-turn*.6,segments,.019,fade*.7,true,LILAC);
  this.ring(m,.66,-turn,segments,.105,fade*.9,false,INK);
  this.ring(m,.66,-turn,segments,.051,fade,false,RED);
  this.ring(m,.51,turn,segments-8,.025,fade*pulse,false,CRIMSON);
  for(let i=0;i<6;i++){
   const a=turn+i*TAU/6;
   // Pointed petals with split inward roots, no lettering or central star.
   this.etch(m,Math.cos(a-.13)*.87,Math.sin(a-.13)*.87,Math.cos(a-.20)*1.14,Math.sin(a-.20)*1.14,.027,PURPLE,fade);
   this.etch(m,Math.cos(a-.20)*1.14,Math.sin(a-.20)*1.14,Math.cos(a)*1.44,Math.sin(a)*1.44,.032,LILAC,fade);
   this.etch(m,Math.cos(a)*1.44,Math.sin(a)*1.44,Math.cos(a+.20)*1.14,Math.sin(a+.20)*1.14,.032,LILAC,fade);
   this.etch(m,Math.cos(a+.20)*1.14,Math.sin(a+.20)*1.14,Math.cos(a+.13)*.87,Math.sin(a+.13)*.87,.027,PURPLE,fade);
   this.etch(m,Math.cos(a)*.90,Math.sin(a)*.90,Math.cos(a)*.71,Math.sin(a)*.71,.038,RED,fade*pulse);
   if(fine)for(let j=0;j<3;j++){
    const u=a+.33+j*.08;
    this.groundLine(m,Math.cos(u)*.94,Math.sin(u)*.94,Math.cos(u+.03)*1.04,Math.sin(u+.03)*1.04,.019,LILAC,fade*.75);
   }
   // Dim continuous paths establish the pull; brighter packets travel from
   // the surroundings into the red circle, gaining red as they approach it.
   const steps=fine?14:9;
   const direction=i*TAU/6;
   for(let j=0;j<steps;j++)this.primeStream(m,direction,j/steps,(j+1)/steps,fade*.20,.019,i);
   for(let j=0;j<3;j++){
    const head=(this.time*(.49+i%3*.09)+i*.137+j/3)%1,alpha=fade*Math.min(1,head*10,(1-head)*10);
    for(let k=0;k<3;k++){
     const end=head-k*.027,start=Math.max(0,end-.027);if(end<=0)continue;
     this.primeStream(m,direction,start,end,alpha*(1-k*.22),.043-k*.007,i);
    }
   }
  }
 }
 primeStream(m,angle,from,to,fade,width,arm=0){
  const mix=Math.max(0,Math.min(1,((from+to)*.5-.45)/.45));
  this.flowColor.copy(PURPLE).lerp(RED,mix*mix*(3-2*mix));
  this.tendrilStroke(m,angle,from,to,fade,width,arm,1,.66,this.flowColor);
 }
 tendrilStroke(m,angle,from,to,fade,width,arm,radius,inner,color){
  const a=sigilTendrilPoint(this.tendrilA,angle,from,this.time,arm,radius,inner);
  const b=sigilTendrilPoint(this.tendrilB,angle,to,this.time,arm,radius,inner);
  this.groundLine(m,a.x,a.z,b.x,b.z,width,color,fade,.072);
 }
 etch(m,ax,az,bx,bz,width,color,fade=1){
  this.groundLine(m,ax,az,bx,bz,width*2.8,INK,fade*.9,.035);
  this.groundLine(m,ax,az,bx,bz,width,color,fade,.058);
 }
 ritual(m,look,r,turn,fade,color,hot){
  const segments=look.facets===4?40:28;
  this.ring(m,r,turn,segments,.10,fade*.85,true,INK);
  this.ring(m,r,turn,segments,.042,fade,true,color);
  this.ring(m,r*.74,-turn*.7,segments-8,.065,fade*.8,false,INK);
  this.ring(m,r*.74,-turn*.7,segments-8,.024,fade*.85,false,hot);
  this.ring(m,r*1.18,-turn*.4,look.facets===4?30:20,.021,fade*.7,true,color);
  for(let i=0;i<5;i++){
   const a=turn+i*TAU/5,b=a+TAU*2/5;
   this.etch(m,Math.cos(a)*r*.92,Math.sin(a)*r*.92,Math.cos(b)*r*.92,Math.sin(b)*r*.92,.030,color,fade);
   // Forked points and tiny angular seals cut into the annulus, no lettering.
   const cx=Math.cos(a)*r*1.12,cz=Math.sin(a)*r*1.12;
   this.etch(m,Math.cos(a-.09)*r,Math.sin(a-.09)*r,cx,cz,.026,hot,fade*.9);
   this.etch(m,Math.cos(a+.09)*r,Math.sin(a+.09)*r,cx,cz,.026,hot,fade*.9);
   if(look.facets===4)for(let k=0;k<3;k++){
    const u=a+.25+k*.10;
    this.groundLine(m,Math.cos(u)*r*.85,Math.sin(u)*r*.85,Math.cos(u+.035)*r*.94,Math.sin(u+.035)*r*.94,.024,hot,fade*.8);
   }
   const direction=i*TAU/5,steps=look.facets===4?14:9;
   for(let j=0;j<steps;j++)this.tendrilStroke(m,direction,j/steps,(j+1)/steps,fade*.24,.020,i+2,r,r*.75,color);
   for(let j=0;j<(look.filaments?3:2);j++){
    const head=(this.time*(.46+i%3*.11)+i*.217+j*.38)%1,alpha=fade*Math.min(1,head*9,(1-head)*7);
    for(let k=0;k<3;k++){
     const end=head-k*.03,start=Math.max(0,end-.03);if(end<=0)continue;
     this.tendrilStroke(m,direction,start,end,alpha*(1-k*.2),.046-k*.008,i+2,r,r*.75,color);
    }
    if(look.filaments){
     const at=sigilTendrilPoint(this.tendrilA,direction,head,this.time,i+2,r,r*.75),x=m.x+at.x,z=m.z+at.z;
     this.diamond(x,floorY(this.view,x,z,m.below)+.10+head*.4,z,Math.cos(direction),Math.sin(direction),.026*alpha,.065*alpha,hot,head*4);
    }
   }
  }
 }
 rememberTrail(b,y){
  let trail=this.trails.get(b.id);
  if(!trail){
   trail=this.freeTrails.pop();if(!trail)return;
   trail.head=0;trail.count=0;this.trails.set(b.id,trail);
  }
  const points=trail.points,last=((trail.head+TRAIL_POINTS-1)%TRAIL_POINTS)*4;
  if(trail.count&&this.time-points[last+3]<1/90)return;
  const i=trail.head*4;points[i]=b.x;points[i+1]=y;points[i+2]=b.z;points[i+3]=this.time;
  trail.head=(trail.head+1)%TRAIL_POINTS;trail.count=Math.min(TRAIL_POINTS,trail.count+1);
 }
 drawTrails(look){
  for(const [id,trail] of this.trails){
   const p=trail.points,newest=((trail.head+TRAIL_POINTS-1)%TRAIL_POINTS)*4;
   if(this.time-p[newest+3]>look.trailLife){this.trails.delete(id);this.freeTrails.push(trail);continue;}
   let drawn=0;
   for(let n=1;n<trail.count&&drawn<look.trailSteps;n++){
    const a=((trail.head+TRAIL_POINTS-n)%TRAIL_POINTS)*4,b=((trail.head+TRAIL_POINTS-n-1)%TRAIL_POINTS)*4;
    const age=this.time-p[b+3];if(age>look.trailLife)break;
    const fade=(1-age/look.trailLife),dx=p[a]-p[b],dz=p[a+2]-p[b+2],length=Math.hypot(dx,dz);
    if(length<.015)continue;
    // Leave a small clear gap behind the diamond; preserve sampled flight height.
    const gap=n===1?Math.min(1,.20/length):0;
    const ax=p[a]-dx*gap,ay=p[a+1]+(p[b+1]-p[a+1])*gap,az=p[a+2]-dz*gap;
    this.line(ax,ay,az,p[b],p[b+1],p[b+2],.075*(.35+fade*.65),RED,fade);
    if(look.filaments){
     this.line(ax,ay+.006,az,p[b],p[b+1]+.006,p[b+2],.010,HOT,fade*.65);
     for(let j=0;j<look.filaments;j++){
      const side=j===0?1:-1,wave=Math.sin(p[a+3]*33+id)*.028,off=side*(.09+wave)*(1-fade);
      const ox=-dz/length*off,oz=dx/length*off;
      this.line(ax+ox,ay-.018,az+oz,p[b]+ox,p[b+1]-.018,p[b+2]+oz,.012,RED,fade*.42);
     }
    }
    drawn++;
   }
  }
 }
 projectile(b,look){
  const red=b.kind!=='base',size=red?.19:.135,y=b.y??floorY(this.view,b.x,b.z,b.below)+.75;
  const norm=Math.hypot(b.dx,b.dz)||1,dx=b.dx/norm,dz=b.dz/norm,spin=this.time*(red?9:13)+b.id*2.4;
  const rim=red?HOT:ORANGE,tip=red?HOT:PALE,body=red?CRIMSON:EMBER,length=size*2.35;
  this.diamond(b.x,y,b.z,dx,dz,size,length,body,spin);
  this.diamond(b.x+dx*length*.60,y,b.z+dz*length*.60,dx,dz,size*.42,length*.46,tip,spin);
  // The bright cage defines individual facets over both pale ground and shadow.
  for(let i=0;i<look.facets;i++){
   const a=spin+i*TAU/look.facets,ox=-dz*Math.cos(a)*size,oz=dx*Math.cos(a)*size,oy=Math.sin(a)*size;
   this.line(b.x+dx*length,y,b.z+dz*length,b.x+ox,y+oy,b.z+oz,.025,rim,1);
   this.line(b.x+ox,y+oy,b.z+oz,b.x-dx*length,y,b.z-dz*length,.018,rim,.9);
   if(look.filaments){
    const aa=a+TAU/look.facets;
    this.line(b.x+ox,y+oy,b.z+oz,b.x-dz*Math.cos(aa)*size,y+Math.sin(aa)*size,b.z+dx*Math.cos(aa)*size,.010,tip,.55);
   }
  }
  for(let i=0;i<look.chips;i++){
   const a=-spin+i*TAU/look.chips,r=size*(1.55+(i%2)*.3),back=.15+i*.09;
   const x=b.x-dx*back-dz*Math.cos(a)*r,z=b.z-dz*back+dx*Math.cos(a)*r,yy=y+Math.sin(a)*r;
   this.diamond(x,yy,z,dx,dz,.035,.085,tip,a);
   if(look.filaments)this.line(x,yy,z,x-dx*.12,yy,z-dz*.12,.009,rim,.5);
  }
  if(red)this.rememberTrail(b,y);
  else this.line(b.x-dx*.25,y,b.z-dz*.25,b.x-dx*.95,y,b.z-dz*.95,.038,ORANGE,.85);
 }
 shotParticles(e,p,look){
  const impact=e.kind==='omenImpact',color=e.orange?ORANGE:RED,hot=e.orange?PALE:HOT;
  const y=e.y??floorY(this.view,e.x,e.z,e.below)+.75,dx=e.dx,dz=e.dz,fade=(1-p)*(1-p);
  for(let i=0;i<look.sparks;i++){
   const angle=i*2.399,spread=impact?.8:.48,speed=.55+(i%5)*.18,forward=(impact?-.12:.08)+p*speed;
   const side=Math.cos(angle)*spread*p,height=Math.sin(angle)*spread*p+.08*p-.35*p*p;
   const x=e.x+dx*forward-dz*side,z=e.z+dz*forward+dx*side,yy=y+height;
   const vx=dx*speed-dz*Math.cos(angle)*spread,vz=dz*speed+dx*Math.cos(angle)*spread;
   this.line(x,yy,z,x-vx*.12*(1-p),yy-Math.sin(angle)*.07*(1-p),z-vz*.12*(1-p),.020*(1-p)+.007,i%3?color:hot,fade);
   if(i<look.chips*2)this.diamond(x,yy,z,dx,dz,.035*(1-p),.067*(1-p),i%2?color:hot,angle+p*6);
  }
  // A briefly opening diamond-shaped muzzle seal, facing along the shot.
  if(p<.45){
   const r=.11+p*.45,alpha=(1-p/.45)*.85;
   for(let i=0;i<4;i++){
    const a=i*TAU/4+Math.PI/4,b=a+TAU/4;
    this.line(e.x-dz*Math.cos(a)*r,y+Math.sin(a)*r,e.z+dx*Math.cos(a)*r,
     e.x-dz*Math.cos(b)*r,y+Math.sin(b)*r,e.z+dx*Math.cos(b)*r,.021,hot,alpha);
   }
  }
 }
 muzzleEnergy(e,p,look){
  let {x,z,y,dx,dz}=e;
  // The local vortex stays attached to the moving hand for the shot's beat.
  const player=e.local?this.view.lastSim?.player:null,at=this.view.player?.position;
  if(player&&at){dx=player.aimX;dz=player.aimZ;x=at.x+dx*OMEN.muzzle-dz*OMEN.lateral;z=at.z+dz*OMEN.muzzle+dx*OMEN.lateral;y=at.y+.76;}
  y??=floorY(this.view,x,z,e.below)+.76;
  const life=Math.sin(Math.PI*Math.min(1,p))**.5,arms=look.filaments?7:5;
  this.diamond(x,y,z,dx,dz,.16*life,.24*life,CRIMSON,p*9);
  this.diamond(x+dx*.04,y+.01,z+dz*.04,dx,dz,.075*life,.17*life,HOT,-p*12);
  for(let i=0;i<arms;i++)for(let j=0;j<4;j++){
   const a=i*TAU/arms+p*6+j*.27,b=a+.22,r=(.53-j*.095)*(1-p*.55),rr=r-.075;
   this.line(x+Math.cos(a)*r,y+Math.sin(a*2)*.07,z+Math.sin(a)*r,
    x+Math.cos(b)*rr,y+Math.sin(b*2)*.07,z+Math.sin(b)*rr,.032,RED,life*(.45+j*.17));
  }
  this.line(x-dx*.20,y,z-dz*.20,x+dx*.26,y,z+dz*.26,.08,RED,life*.8);
 }
 tickPulse(e,p,look){
  const fade=1-p,y=floorY(this.view,e.x,e.z,e.below),n=look.filaments?8:5;
  this.ring(e,.45+p*.85,this.time,28,.055,fade,false,RED);
  for(let i=0;i<n;i++){
   let ax=e.x+Math.cos(i*TAU/n)*.25,az=e.z+Math.sin(i*TAU/n)*.25,ay=y+.12;
   for(let j=1;j<=4;j++){
    const a=i*TAU/n+p*2+j*.38,r=.30+Math.sin(j/4*Math.PI)*.25;
    const x=e.x+Math.cos(a)*r,z=e.z+Math.sin(a)*r,yy=y+.12+j*.31+p*.28;
    this.line(ax,ay,az,x,yy,z,.062*(1-j*.10),CRIMSON,fade);
    this.line(ax,ay+.006,az,x,yy+.006,z,.025,RED,fade);ax=x;ay=yy;az=z;
   }
   this.diamond(ax,ay,az,1,0,.038*fade,.1*fade,HOT,i);
  }
 }
 smokePuff(x,y,z,size,yaw,alpha,color){
  const i=this.smoke.count;if(i>=SMOKE_LIMIT||alpha<=0)return;
  const d=this.dummy;d.position.set(x,y,z);d.rotation.set(.1,yaw,.1);d.scale.set(size,size*.78,size);d.updateMatrix();
  this.smoke.setMatrixAt(i,d.matrix);this.smoke.setColorAt(i,color);this.smokeAlpha.setX(i,alpha);this.smoke.count++;
 }
 rupture(e,look){
  if(e.t<.11){
   const p=e.t/.11;this.ritual(e,look,CURSE_SCALE*(1-p*.25),p*2,.8,RED,HOT);
   for(let i=0;i<8;i++){const a=i*TAU/8,r=1.8*(1-p);this.etch(e,Math.cos(a)*r,Math.sin(a)*r,Math.cos(a+.15)*.25,Math.sin(a+.15)*.25,.07,HOT,p);}
   return;
  }
  const p=Math.min(1,(e.t-.11)/.75),fade=1-p,base=floorY(this.view,e.x,e.z,e.below);
  if(!e.lit){
   e.lit=true;const v=this.view;
   if(v.fxLight){v.fxLight.color.copy(RED);v.fxLight.position.set(e.x,base+1.3,e.z);v.fxLightLevel=Math.max(v.fxLightLevel||0,22*e.power);}
   v.fx?.glow?.({x:e.x,y:.16,z:e.z,size:5.6,grow:.5,life:.32,color:RED,glow:1.3});
  }
  if(fade>0){
   const reach=3.6+e.power*.65,r=.35+Math.sqrt(p)*reach;
   this.ring(e,r,-p,look.facets===4?48:32,.10*fade+.025,fade,true,RED);
   this.ring(e,r*.87,p,look.facets===4?40:28,.045,fade*.8,true,HOT);
   for(let i=0;i<look.sparks;i++){
    const a=i*2.399,rr=(.45+Math.sqrt(p)*reach)*(.65+(i%4)*.13),x=e.x+Math.cos(a)*rr,z=e.z+Math.sin(a)*rr;
    const yy=base+.12+Math.sin(p*Math.PI)*(.55+i%5*.25);
    this.line(x,yy,z,x-Math.cos(a)*.45*fade,yy+.14*fade,z-Math.sin(a)*.45*fade,.06*fade+.01,i%3?RED:HOT,fade);
    if(i<12){
     const mid=rr*.6;
     this.etch(e,Math.cos(a)*.25,Math.sin(a)*.25,Math.cos(a+.11)*mid,Math.sin(a+.11)*mid,.05,RED,fade);
     this.etch(e,Math.cos(a+.11)*mid,Math.sin(a+.11)*mid,Math.cos(a)*rr,Math.sin(a)*rr,.033,HOT,fade*.8);
    }
    if(i<look.chips*2)this.diamond(x,yy,z,Math.cos(a),Math.sin(a),.075*fade,.18*fade,i%2?CRIMSON:HOT,p*8+i);
   }
   // Tall torn petals give the rupture volume instead of a flat ring alone.
   for(let i=0;i<(look.filaments?10:6);i++){
    const a=i*TAU/(look.filaments?10:6)+p,rr=.2+p*1.3,h=Math.sin(p*Math.PI)*2.5;
    this.line(e.x+Math.cos(a)*rr,base+.1,e.z+Math.sin(a)*rr,e.x+Math.cos(a+.4)*rr,base+h+.1,e.z+Math.sin(a+.4)*rr,.14*fade,RED,fade*.8);
   }
  }
  const smokeAge=(e.t-.11)/1.54,alpha=Math.min(1,smokeAge*9)*(1-smokeAge)*.60;
  for(let i=0;i<look.smoke;i++){
   const a=i*2.399,drift=.25+smokeAge*(1.3+(i%4)*.28),size=(.28+(i%3)*.085)*(1+smokeAge*2.7);
   this.smokePuff(e.x+Math.cos(a)*drift,base+.25+smokeAge*(1.2+i%4*.25),e.z+Math.sin(a)*drift,size,a+smokeAge,alpha,i%3?SMOKE:ASH);
  }
 }
 sigil(m,look){
  const elapsed=m.duration-m.left,late=Math.max(0,1-m.left),turn=elapsed*.75+late*late*2.3;
  const fade=Math.min(1,elapsed*8+.15),r=CURSE_SCALE*(1+late*.06);
  this.ritual(m,look,r,turn,fade,RED,HOT);
  if(late>0){
   this.ring(m,1.29*CURSE_SCALE,turn,24,.048,late*(.8+.2*Math.sin(this.time*24)),true,HOT);
   for(let i=0;i<5;i++){const a=i*TAU/5-turn;
    this.etch(m,Math.cos(a)*.2*CURSE_SCALE,Math.sin(a)*.2*CURSE_SCALE,Math.cos(a+.18)*.85*CURSE_SCALE,Math.sin(a+.18)*.85*CURSE_SCALE,.025,HOT,late);}
  }
 }
 link(a,b,fade=1){
  const dx=b.x-a.x,dz=b.z-a.z,n=Math.min(30,Math.max(3,Math.ceil(Math.hypot(dx,dz)*2)));
  let ax=a.x,az=a.z,ay=floorY(this.view,ax,az,a.below)+.27*fade;
  for(let i=1;i<=n;i++){
   const f=i/n,wave=Math.sin(f*Math.PI)*Math.sin(f*13-this.time*4)*(.10+(1-fade)*.5);
   const x=a.x+dx*f-dz*wave/n,z=a.z+dz*f+dx*wave/n;
   const y=floorY(this.view,x,z,f<.5?a.below:b.below)+(.27+Math.sin(f*Math.PI)*.14)*fade;
   const pulse=.7+.3*Math.sin(f*20-this.time*9);
   this.line(ax,ay,az,x,y,z,.085,INK,fade*.7);
   this.line(ax,ay+.015,az,x,y+.015,z,.033,RED,fade*pulse);
   if(i%3===Math.floor(this.time*8)%3)this.line(ax,ay+.025,az,x,y+.025,z,.014,HOT,fade*.8);
   ax=x;ay=y;az=z;
  }
 }
 update(sim,dt){
  this.time+=dt;this.recoil=Math.max(0,this.recoil-dt);
  const active=sim.weapon==='omen'&&!sim.player.dead;
  this.model.visible=active;
  if(active){
   const reload=sim.omen.reload,progress=reload>0?1-reload/OMEN.reload:0;
   this.model.rotation.x=-this.recoil*1.6-(reload>0?Math.sin(progress*Math.PI)*.45:0);
   this.model.position.z=this.recoil*.32;
   const core=this.model.userData.heart;
   core.rotation.z=this.time*.5;core.rotation.y=this.time*.9;
   core.scale.set(.65,1+(sim.omen.primed?.3:0)+this.recoil*1.8,1.45+this.recoil*2);
   this.model.userData.aura.material.opacity=(sim.omen.primed?.16:.065)+Math.sin(this.time*3)*.015+this.recoil*1.2;
  }
  for(const mesh of this.meshes)mesh.count=0;
  const look=LOOK[this.view.qualityName]||LOOK.balanced,marks=sim.omenMarks||sim.omen?.marks||[];
  for(const m of this.primers.values())m.seen=false;
  const primer=(id,p)=>{
   let m=this.primers.get(id);if(!m){m={age:0};this.primers.set(id,m);}
   m.x=p.x;m.z=p.z;m.below=p.below;m.left=.25;m.seen=true;
  };
  if(active&&sim.omen.primed)primer('self',sim.player);
  for(const p of sim.omenPrimers||[])primer(p.caster,p);
  for(const [id,m] of this.primers){
   m.age+=dt;if(!m.seen)m.left-=dt;
   if(m.left<=0)this.primers.delete(id);else this.primeSigil(m,look);
  }
  let drawn=0;const groups=this.groups;groups.clear();for(const l of this.links.values())l.seen=false;
  for(const m of marks){
   if(m.left<=0||drawn++>=24)continue;
   this.sigil(m,look);
   if(m.kind==='x'){
    const key=(m.caster??'self')+':'+m.group,last=groups.get(key);groups.set(key,m);
    if(last){
     const id=key+':'+last.id+':'+m.id,l=this.links.get(id)||{a:{},b:{}};
     Object.assign(l.a,{x:last.x,z:last.z,below:last.below});Object.assign(l.b,{x:m.x,z:m.z,below:m.below});
     l.left=.6;l.seen=true;this.links.set(id,l);
    }
   }
  }
  for(const [key,l] of this.links){if(!l.seen)l.left-=dt;if(l.left<=0)this.links.delete(key);else this.link(l.a,l.b,l.left/.6);}
  let bolts=0;for(const b of sim.omenBolts||[]){if(bolts++>=TRAIL_LIMIT)break;this.projectile(b,look);}
  this.drawTrails(look);
  for(let k=this.effects.length-1;k>=0;k--){
   const e=this.effects[k];e.t+=dt;const p=e.t/e.life;if(p>=1){this.effects.splice(k,1);continue;}
   if(e.kind==='omenShot'||e.kind==='omenImpact'){
    this.shotParticles(e,p,look);if(e.kind==='omenShot')this.muzzleEnergy(e,p,look);
   }
   else if(e.kind==='omenTick'){
    const target=e.id===sim.player.id?sim.player:sim.targets?.find(t=>t.id===e.id);
    if(target){e.x=target.x;e.z=target.z;e.below=target.below;}this.tickPulse(e,p,look);
   }
   else if(e.kind==='omenFade'){
    for(let i=0;i<(look.facets===4?36:24);i++){const a=i*2.399+p*.45,r=CURSE_SCALE+p*(.5+(i%3)*.15);
     this.etch(e,Math.cos(a)*r,Math.sin(a)*r,Math.cos(a+.22*(1-p))*(r+.20),Math.sin(a+.22*(1-p))*(r+.20),.03,RED,(1-p)*.8);}
   }else if(e.kind==='omenBurst'){
    this.rupture(e,look);
   }else if(e.kind==='omenVolley'){
    this.ring(e,.4+p*2.9,-p*2,36,.065,(1-p)*.8,true,RED);
    for(let i=0;i<3;i++){const a=i*TAU/3+p*2,r=.4+p*1.8;this.etch(e,0,0,Math.cos(a)*r,Math.sin(a)*r,.07,RED,1-p);}
   }else if(e.kind==='omenPrimeExpired'){
    for(let i=0;i<12;i++){const a=i*2.399,r=.8+p*.85;this.etch(e,Math.cos(a)*r,Math.sin(a)*r,Math.cos(a+.2)*(r+.25),Math.sin(a+.2)*(r+.25),.04,PURPLE,1-p);}
    this.ring(e,.66+p*.35,p,24,.032,(1-p)*.7,true,RED);
   }else if(e.kind==='omenPrime'){
    this.flowColor.copy(PURPLE).lerp(RED,p*p);
    this.ring(e,2.5-p*1.84,-p,30,.035,(1-p)*.6,true,this.flowColor);
   }else{
    for(let i=0;i<5;i++){const a=i*TAU/5+p,r=.08+p*.4;this.groundLine(e,Math.cos(a)*r,Math.sin(a)*r,Math.cos(a)*(r+.1),Math.sin(a)*(r+.1),.022,e.orange?ORANGE:RED,(1-p)*.75,.35);}
   }
  }
  // Send just the occupied part of each bounded pool to the GPU. A large
  // multiplayer ceiling must not mean uploading thousands of empty slots.
  const upload=(attribute,count)=>{attribute.clearUpdateRanges();attribute.addUpdateRange(0,count);attribute.needsUpdate=true;};
  if(this.lines.count)upload(this.fades,this.lines.count);
  if(this.smoke.count)upload(this.smokeAlpha,this.smoke.count);
  for(const mesh of this.meshes){mesh.visible=mesh.count>0;if(mesh.count){upload(mesh.instanceMatrix,mesh.count*16);upload(mesh.instanceColor,mesh.count*3);}}
 }
}
