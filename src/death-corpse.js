import * as THREE from 'three';
import { makeBoneBank } from './death-bones.js';
import { BallastBlood } from './ballast-blood.js';

export class DeathCorpse{
 constructor(view,event,reaction){
  this.event=event;this.reaction=reaction;this.materials=[];this.geometries=[];
  this.root=new THREE.Group();this.root.position.set(event.x,0,event.z);view.scene.add(this.root);
  this.body=new THREE.Group();this.root.add(this.body);
  const player=view.player,gun=player.userData.gun,inverse=new THREE.Matrix4().makeTranslation(-event.x,0,-event.z);
  const char=reaction.charred?new THREE.MeshLambertMaterial({color:'#272522',flatShading:true,transparent:reaction.mode==='skeleton'}):null;
  if(char)this.materials.push(char);this.charMaterial=char;
  // Preserve the visible avatar and pose, but never duplicate the dropped weapon.
  const walk=node=>{
   if(node===gun||node===view.grenadeView?.held||!node.visible)return;
   if(reaction.headless&&node.userData.deathPart==='head'||reaction.kneeling&&node.userData.deathPart==='leg')return;
   if(node.isMesh&&!node.material.transparent){
    const mesh=new THREE.Mesh(node.geometry,char||node.material);mesh.matrix.copy(inverse).multiply(node.matrixWorld);mesh.matrixAutoUpdate=false;this.body.add(mesh);
   }
   for(const child of node.children)walk(child);
  };
  // DeathView has hidden the live root; its children still contain the visible pose.
  for(const child of player.children)walk(child);
  if(reaction.headWound){
   const wound=new THREE.Group();wound.position.set(0,.99,-.195);
   const yaw=new THREE.Group();yaw.rotation.y=player.rotation.y;yaw.add(wound);this.body.add(yaw);
   const red=new THREE.MeshBasicMaterial({color:'#9b2538'}),dark=new THREE.MeshBasicMaterial({color:'#240e15'});this.materials.push(red,dark);
   const rimGeo=new THREE.TorusGeometry(.059,.024,4,7),holeGeo=new THREE.CircleGeometry(.052,9);this.geometries.push(rimGeo,holeGeo);
   const rim=new THREE.Mesh(rimGeo,red);rim.rotation.y=Math.PI;wound.add(rim);
   const hole=new THREE.Mesh(holeGeo,dark);hole.rotation.y=Math.PI;hole.position.z=-.01;wound.add(hole);
   for(let i=0;i<5;i++){
    const geo=new THREE.IcosahedronGeometry(.018,0);this.geometries.push(geo);
    const fleck=new THREE.Mesh(geo,red),angle=i*2.4;fleck.position.set(Math.cos(angle)*.075,Math.sin(angle)*.066,-.012);wound.add(fleck);
   }
  }
  if(reaction.mode==='skeleton'){
   this.bank=makeBoneBank();this.skeleton=new THREE.Group();this.skeleton.rotation.y=player.rotation.y;this.root.add(this.skeleton);
   const bone=(kind,x,y,z,scale=1,rotation=0)=>{const model=this.bank.models[kind].clone();model.position.set(x,y,z);model.scale.setScalar(scale);model.rotation.z=rotation;this.skeleton.add(model);};
   bone(5,0,1.03,0,1.35);bone(3,0,.43,0,1.1);bone(4,0,.65,.025,1.15);
   for(let i=0;i<4;i++)bone(2,0,.59+i*.07,-.015,1-i*.045,Math.PI/2);
   for(const side of [-1,1]){bone(0,side*.13,.23,0,.85);bone(1,side*.30,.70,0,.8,side*.30);bone(1,side*.34,.46,-.06,.7,side*-.12);}
   this.skeletonMaterials=new Set();this.skeleton.traverse(node=>{if(node.material){this.skeletonMaterials.add(node.material);node.material.transparent=true;node.material.opacity=0;}});
  }
  let dx=event.directionX||0,dz=event.directionZ||0;
  if(Math.hypot(dx,dz)<.001){dx=-event.aimX||0;dz=-event.aimZ||0;}
  if(Math.hypot(dx,dz)<.001)dz=1;
  this.direction=new THREE.Vector3(dx,0,dz).normalize();this.axis=new THREE.Vector3(this.direction.z,0,-this.direction.x);
  if(reaction.kneeling)this.blood=new BallastBlood(view,event,this.body,this.direction,player.rotation.y);
 }
 update(time){
  if(this.blood){
   const t=Math.max(0,Math.min(1,(time-.08)/.95)),kneel=t*t*(3-2*t);
   this.body.position.y=-.12*kneel;
   this.body.quaternion.setFromAxisAngle(this.axis,.16*kneel);
   this.root.position.set(this.event.x+this.direction.x*.12*kneel,0,this.event.z+this.direction.z*.12*kneel);
   this.root.updateMatrixWorld(true);this.blood.update(time,kneel);return;
  }
  const delay=this.reaction.charred?.12:0,t=Math.max(0,Math.min(1,(time-delay)/.85)),fall=t*t*(3-2*t);
  this.root.quaternion.setFromAxisAngle(this.axis,fall*Math.PI/2);
  this.root.position.set(this.event.x+this.direction.x*.16*fall,.26*fall,this.event.z+this.direction.z*.16*fall);
  if(this.reaction.charred&&time<.18)this.root.rotation.z+=Math.sin(time*100)*.025*(1-time/.18);
  if(this.skeleton){
   const burn=Math.max(0,Math.min(1,(time-.10)/.65));this.charMaterial.opacity=1-burn;this.body.visible=burn<1;
   for(const material of this.skeletonMaterials)material.opacity=burn;
  }
 }
 dispose(){this.blood?.dispose();this.root.removeFromParent();this.bank?.dispose();this.materials.forEach(material=>material.dispose());this.geometries.forEach(geometry=>geometry.dispose());}
}
