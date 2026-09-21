import * as THREE from 'three';
import {makeGrenade} from './grenade-model.js';
import {GRENADE} from './grenade.js';
export class GrenadeView{
 constructor(view){
  this.view=view;this.items=new Map();this.detail=-1;
  this.rangeMarker=new THREE.Group();
  for(const [width,depth,color,opacity,order]of [[1.5,.13,'#172319',.65,90],[1.36,.055,'#c6d797',.85,91]]){
   const line=new THREE.Mesh(new THREE.PlaneGeometry(width,depth),new THREE.MeshBasicMaterial({color,transparent:true,opacity,depthTest:false,depthWrite:false,toneMapped:false}));
   line.rotation.x=-Math.PI/2;line.renderOrder=order;this.rangeMarker.add(line);
  }
  view.scene.add(this.rangeMarker);
  this.arm=view.rifleView.pose.offHand;
 }
 dispose(model){model.traverse(o=>o.geometry?.dispose());const mats=new Set();model.traverse(o=>{if(o.material)mats.add(o.material);});mats.forEach(m=>m.dispose());}
 clear(){for(const model of this.items.values()){this.view.scene.remove(model);this.dispose(model);}this.items.clear();}
 update(sim){
  const p=sim.player;
  this.rangeMarker.visible=sim.weapon==='rifle'&&!sim.player.dead;
  this.rangeMarker.position.set(this.view.player.position.x+p.aimX*GRENADE.range,.08,this.view.player.position.z+p.aimZ*GRENADE.range);
  this.rangeMarker.rotation.y=Math.atan2(p.aimX,p.aimZ);
  const detail=this.view.qualityName==='quality'?2:this.view.qualityName==='balanced'?1:0;
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
  }
  for(const [id,model]of this.items)if(!alive.has(id)){this.view.scene.remove(model);this.dispose(model);this.items.delete(id);}
 }
}
