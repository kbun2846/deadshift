import * as THREE from 'three';
import { makeBoneBank } from './death-bones.js';
import { BallastBlood } from './ballast-blood.js';
import { addGore, skeletonRemains, spilledBrains, charMaterial, compact, disposeMerged, GORE_DETAIL } from './gore.js';
import { groundY, hilly } from '../render/ground-lift.js';

// A body left where it fell, copied from a live avatar's pose: yours
// (view.player, the default) or another player's (`source`: { root, skip, yaw },
// root posed at the death spot; remote-corpses.js). Gore from gore.js.
export class DeathCorpse{
 constructor(view,event,reaction,source=null){
  this.view=view;this.event=event;this.reaction=reaction;this.materials=[];this.geometries=[];
  // (Hills: at the ground where they fell; `base` is that height.)
  const base=groundY(view, event.x,event.z);
  this.root=new THREE.Group();this.root.position.set(event.x,base,event.z);view.scene.add(this.root);
  this.body=new THREE.Group();this.root.add(this.body);
  const player=source?.root||view.player,gun=source?source.skip:player.userData.gun,inverse=new THREE.Matrix4().makeTranslation(-event.x,-base,-event.z);
  const detail=GORE_DETAIL[view.qualityName]??2;
  const char=reaction.charred?charMaterial(reaction.mode==='skeleton'):null;
  if(char)this.materials.push(char);this.charMaterial=char;
  // Preserve the visible avatar and pose, but never duplicate the dropped weapon.
  const walk=node=>{
   if((gun&&node===gun)||node===view.grenadeView?.held||!node.visible)return;
   if(reaction.headless&&node.userData.deathPart==='head'||reaction.kneeling&&node.userData.deathPart==='leg')return;
   if(node.isMesh&&!node.material.transparent){
    const mesh=new THREE.Mesh(node.geometry,char||node.material);mesh.matrix.copy(inverse).multiply(node.matrixWorld);mesh.matrixAutoUpdate=false;this.body.add(mesh);
   }
   for(const child of node.children)walk(child);
  };
  // DeathView has hidden the live root; its children still contain the visible pose.
  for(const child of player.children)walk(child);
  const yaw=source?source.yaw:player.rotation.y;
  // Wounds, burns and bone, on the side that will face up once fallen.
  if(reaction.mode!=='skeleton')this.gore=addGore(this.body,event,reaction,detail);
  if(reaction.headWound){
   const wound=new THREE.Group();wound.position.set(0,.99,-.195);
   const turn=new THREE.Group();turn.rotation.y=yaw;turn.add(wound);this.body.add(turn);
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
   this.bank=makeBoneBank();this.skeleton=new THREE.Group();this.skeleton.rotation.y=yaw;this.root.add(this.skeleton);
   const bone=(kind,x,y,z,scale=1,rotation=0)=>{const model=this.bank.models[kind].clone();model.position.set(x,y,z);model.scale.setScalar(scale);model.rotation.z=rotation;this.skeleton.add(model);};
   // Not every burnt body is a whole, tidy skeleton. Sometimes limbs have
   // snapped (two pieces, askew, splinters between) or one is gone; sometimes
   // the skull cracked open and the brains lie on the floor beside it.
   const random=Math.random,broken=random()<.55,brains=random()<.45;
   const ivory=this.bank.models[0].children[0].material,chip=new THREE.IcosahedronGeometry(1,0);this.geometries.push(chip);
   const splinter=(x,y,z,r)=>{const c=new THREE.Mesh(chip,ivory);c.scale.set(r,r*.5,r*1.6);c.position.set(x,y,z);c.rotation.set(random()*3,random()*3,0);this.skeleton.add(c);};
   const limb=(kind,x,y,z,scale,rotation,snap)=>{
    if(!snap){bone(kind,x,y,z,scale,rotation);return;}
    if(snap==='gone'){splinter(x,y+.1,z,.03);return;}
    const length=kind===0?.43:.31,ax=-Math.sin(rotation),ay=Math.cos(rotation);
    for(const end of [-1,1]){
     const piece=this.bank.models[kind].clone(),off=end*length*scale*.3;
     piece.scale.set(scale,scale*.5,scale);piece.position.set(x+ax*off+end*.025,y+ay*off,z+(end>0?.03:0));piece.rotation.z=rotation+end*(.3+random()*.4);this.skeleton.add(piece);
    }
    for(let i=0;i<3;i++)splinter(x+(random()-.5)*.08,y+(random()-.5)*.06,z+.02,.012+random()*.01);
   };
   const snaps=new Map();
   if(broken){const limbs=['femur-1','femur1','upper-1','upper1','lower-1','lower1'];for(let i=0,n=1+Math.floor(random()*3);i<n;i++)snaps.set(limbs[Math.floor(random()*limbs.length)],random()<.25?'gone':'snap');}
   if(brains){
    // Cracked open: the skull knocked askew, pieces of it around.
    const skull=this.bank.models[5].clone();skull.position.set(.03,1.02,0);skull.scale.setScalar(1.3);skull.rotation.set(.5,.3,.6);this.skeleton.add(skull);
    for(let i=0;i<4;i++)splinter((random()-.5)*.3,1.05+random()*.2,(random()-.5)*.1,.03+random()*.02);
   }else bone(5,0,1.03,0,1.35);
   bone(3,0,.43,0,1.1);bone(4,0,.65,.025,1.15);
   for(let i=0;i<4;i++)if(!(broken&&i===3&&random()<.5))bone(2,0,.59+i*.07,-.015,1-i*.045,Math.PI/2);
   for(const side of [-1,1]){limb(0,side*.13,.23,0,.85,0,snaps.get('femur'+side));limb(1,side*.30,.70,0,.8,side*.30,snaps.get('upper'+side));limb(1,side*.34,.46,-.06,.7,side*-.12,snaps.get('lower'+side));}
   if(brains){
    // On the floor past the head, clearly outside the skull (world placement,
    // since the body is still falling as they spill).
    let bx=event.directionX||0,bz=event.directionZ||0;if(Math.hypot(bx,bz)<.001){bx=-event.aimX||0;bz=-event.aimZ||0;}if(Math.hypot(bx,bz)<.001)bz=1;const bl=Math.hypot(bx,bz);bx/=bl;bz/=bl;
    const spill=spilledBrains(detail);this.brains=spill.group;this.materials.push(...spill.materials);this.geometries.push(...spill.geometries);
    const side=random()<.5?-1:1;{const sx=event.x+bx*1.55-bz*side*.22,sz=event.z+bz*1.55+bx*side*.22;spill.group.position.set(sx,.02+groundY(view, sx,sz),sz);}spill.group.rotation.y=random()*Math.PI*2;spill.group.scale.setScalar(1.5);view.scene.add(spill.group);
    this.brainMaterials=spill.materials;for(const m of spill.materials){m.transparent=true;m.opacity=0;}
   }
   this.materials.push(...skeletonRemains(this.skeleton,detail));
   this.skeletonMaterials=new Set();this.skeleton.traverse(node=>{if(node.material){this.skeletonMaterials.add(node.material);node.material.transparent=true;node.material.opacity=0;}});
  }
  let dx=event.directionX||0,dz=event.directionZ||0;
  if(Math.hypot(dx,dz)<.001){dx=-event.aimX||0;dz=-event.aimZ||0;}
  if(Math.hypot(dx,dz)<.001)dz=1;
  this.direction=new THREE.Vector3(dx,0,dz).normalize();this.axis=new THREE.Vector3(this.direction.z,0,-this.direction.x);
  if(reaction.kneeling)this.blood=new BallastBlood(view,event,this.body,this.direction,yaw);
 }
 update(time){
  // Burn seams glow orange just after death and cool to a dull red.
  if(this.charMaterial)this.charMaterial.emissiveIntensity=.12+1.1*Math.exp(-time*.9);
  if(this.blood){
   const t=Math.max(0,Math.min(1,(time-.08)/.95)),kneel=t*t*(3-2*t);
   this.body.position.y=-.12*kneel;
   this.body.quaternion.setFromAxisAngle(this.axis,.16*kneel);
   {const x=this.event.x+this.direction.x*.12*kneel,z=this.event.z+this.direction.z*.12*kneel;this.root.position.set(x,groundY(this.view, x,z),z);}
   this.root.updateMatrixWorld(true);this.blood.update(time,kneel);return;
  }
  const delay=this.reaction.charred?.12:0,t=Math.max(0,Math.min(1,(time-delay)/.85)),fall=t*t*(3-2*t);
  this.root.quaternion.setFromAxisAngle(this.axis,fall*Math.PI/2);
  this.root.position.set(this.event.x+this.direction.x*.16*fall,.26*fall,this.event.z+this.direction.z*.16*fall);
  if(this.reaction.charred&&time<.18)this.root.rotation.z+=Math.sin(time*100)*.025*(1-time/.18);
  if(this.skeleton){
   const burn=Math.max(0,Math.min(1,(time-.10)/.65));this.charMaterial.opacity=1-burn;this.body.visible=burn<1;
   for(const material of this.skeletonMaterials)material.opacity=burn;
   if(this.brainMaterials)for(const material of this.brainMaterials)material.opacity=burn;
   // Burnt through and fallen: the bones (and what is left on them) become one
   // opaque draw instead of one per bone.
   if(time>1.1&&!this.settled){this.settled=true;for(const material of [...this.skeletonMaterials,...(this.brainMaterials||[])]){material.transparent=false;material.opacity=1;}compact(this.skeleton);}
  }
 }
 dispose(){disposeMerged(this.root);disposeMerged(this.brains);this.blood?.dispose();this.root.removeFromParent();this.brains?.removeFromParent();this.bank?.dispose();this.materials.forEach(material=>material.dispose());this.geometries.forEach(geometry=>geometry.dispose());}
}
