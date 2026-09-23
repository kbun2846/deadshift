import * as THREE from 'three';
import {makeGrenade} from './grenade-model.js';
import {GRENADE} from './grenade.js';
import { isDemanding } from './settings.js';
import { NO_FX } from './effects-detail.js';
const SMOKE=new THREE.Color('#bdb4a3'),BLINK=new THREE.Color('#ff3020');
export class GrenadeView{
 constructor(view){
  this.view=view;this.items=new Map();this.detail=-1;
  this.rangeMarker=new THREE.Group();
  // A thin solid red line, not a translucent band: the throw either reaches or
  // it does not, so the marker states a hard limit. The dark backing is what
  // keeps it legible against pale sand, and is opaque for the same reason.
  for(const [width,depth,color,opacity,order]of [[1.5,.075,'#2a0c10',1,90],[1.36,.028,'#ff1f33',1,91]]){
   const line=new THREE.Mesh(new THREE.PlaneGeometry(width,depth),new THREE.MeshBasicMaterial({color,transparent:opacity<1,opacity,depthTest:false,depthWrite:false,toneMapped:false}));
   line.rotation.x=-Math.PI/2;line.renderOrder=order;this.rangeMarker.add(line);
  }
  view.scene.add(this.rangeMarker);
  this.arm=view.rifleView.pose.offHand;
 }
 dispose(model){model.traverse(o=>o.geometry?.dispose());const mats=new Set();model.traverse(o=>{if(o.material)mats.add(o.material);});mats.forEach(m=>m.dispose());}
 // The lever flies off as it leaves the hand: a snap of sparks off the fuse.
 thrown(e){const fx=this.view.fx||NO_FX;if(!fx.on)return;
  for(let i=0,n=fx.n(6);i<n;i++){const a=Math.random()*6.3,s=1+Math.random()*2.5;fx.spark({x:e.x,y:1.1,z:e.z,vx:Math.cos(a)*s,vy:1+Math.random()*2,vz:Math.sin(a)*s,life:.2+Math.random()*.2,length:.06,width:.01});}
 }
 clear(){for(const model of this.items.values()){this.view.scene.remove(model);this.dispose(model);}this.items.clear();}
 update(sim){
  const p=sim.player;
  this.rangeMarker.visible=sim.weapon==='rifle'&&!sim.player.dead;
  this.rangeMarker.position.set(this.view.player.position.x+p.aimX*GRENADE.range,.08,this.view.player.position.z+p.aimZ*GRENADE.range);
  this.rangeMarker.rotation.y=Math.atan2(p.aimX,p.aimZ);
  const detail=this.view.qualityName==='extreme'?3:isDemanding(this.view.qualityName)?2:this.view.qualityName==='balanced'?1:0;
  if(detail!==this.detail){this.clear();if(this.held){this.arm.remove(this.held);this.dispose(this.held);}this.held=makeGrenade(detail);this.held.position.set(0,-.035,-.04);this.arm.add(this.held);this.detail=detail;}
  const age=sim.time-sim.grenadeThrowTime,throwing=age>=0&&age<.48;
  this.arm.visible=sim.weapon==='rifle'||sim.weapon==='shotgun';this.held.visible=sim.weapon==='rifle'&&throwing&&age<GRENADE.windup;
  const alive=new Set();
  for(const g of sim.grenades){
   if(!g.released)continue;alive.add(g.id);let model=this.items.get(g.id);
   if(!model){model=makeGrenade(detail);this.view.scene.add(model);this.items.set(g.id,model);}
   const landed=g.y<=.241;
   model.position.set(g.x,g.y,g.z);const spin=Math.min(g.age-GRENADE.windup,g.flight)*7;model.rotation.set(landed?.15:spin,spin*.4,.3);
   const blink=landed&&Math.floor((g.age-GRENADE.windup)*10)%2===0;
   model.userData.indicator.material.color.set(blink?'#ff3020':'#611c16');model.userData.indicator.scale.setScalar(blink?1.5:1);
   model.visible=sim.canSeeEntity(g.x,g.z,.14);
   // A lit fuse: sparks spitting off the cap and a thin smoke trail in the
   // air; once it lands, the blink throws a small red glow on the ground.
   const fx=this.view.fx||NO_FX;
   if(fx.on&&model.visible){
    g.fxClock=(g.fxClock??0)-(sim.time-(g.fxTime??sim.time));g.fxTime=sim.time;
    if(g.fxClock<=0){
     g.fxClock=landed?.05:.025;
     const top=g.y+.28;
     for(let i=0,n=fx.n(landed?1:2);i<n;i++){const a=Math.random()*6.3,s=.6+Math.random()*1.4;fx.spark({x:g.x,y:top,z:g.z,vx:Math.cos(a)*s,vy:1+Math.random()*1.5,vz:Math.sin(a)*s,life:.12+Math.random()*.15,length:.05,width:.009});}
     if(!landed)fx.puff({x:g.x,y:top,z:g.z,vx:0,vz:0,vy:.2,size:.03,grow:3,life:.7,alpha:.3,color:SMOKE});
     if(blink)fx.glow({x:g.x,y:.06,z:g.z,size:.9,life:.08,color:BLINK,glow:.9});
    }
   }
  }
  for(const [id,model]of this.items)if(!alive.has(id)){this.view.scene.remove(model);this.dispose(model);this.items.delete(id);}
 }
}
