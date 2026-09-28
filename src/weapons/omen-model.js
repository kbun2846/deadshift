import * as THREE from 'three';
import { bakeColors } from '../render/bake-colors.js';

// The same matte, coloured primitives as the other held weapons. The open
// jaws and hanging heart give this one a silhouette instead of a pistol barrel.
export function makeOmen(detail=3, arm=true){
 const gun=new THREE.Group(),mats=new Map();
 const material=color=>{if(!mats.has(color))mats.set(color,new THREE.MeshLambertMaterial({color,flatShading:true}));return mats.get(color);};
 const box=(x,y,z,w,h,d,color)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material(color));m.position.set(x,y,z);gun.add(m);return m;};
 const tooth=(x,y,z,r,h,color)=>{const m=new THREE.Mesh(new THREE.ConeGeometry(r,h,4),material(color));m.rotation.x=-Math.PI/2;m.position.set(x,y,z);gun.add(m);return m;};
 box(0,-.085,.105,.10,.24,.115,'#44282c').rotation.x=-.28;
 box(0,-.18,.14,.145,.065,.13,'#873c43').rotation.z=.08;
 box(0,0,.045,.23,.18,.28,'#713039');
 box(0,.1,.055,.18,.055,.25,'#9b4b51');
 box(0,0,.19,.19,.145,.065,'#342830');
 // A broad, split crown around the floating core; pale worn edges, no gold.
 for(const side of [-1,1]){
  box(side*.133,.018,-.12,.075,.14,.32,'#592a35').rotation.y=side*-.16;
  box(side*.149,.054,-.29,.07,.10,.21,'#8c3f49').rotation.y=side*.18;
  tooth(side*.13,.025,-.425,.066,.20,'#78313e').rotation.z=side*-.12;
  box(side*.121,.096,-.12,.028,.02,.27,'#bd7470').rotation.y=side*-.16;
  if(detail>0){
   box(side*.12,.008,.02,.013,.075,.12,'#a4555a');
   for(let i=0;i<3;i++)box(side*.059,-.105-i*.036,.11+i*.011,.009,.014,.105,'#945158').rotation.x=-.28;
   box(side*.17,.04,-.25,.027,.14,.035,'#382630').rotation.z=side*.4;
  }
 }
 box(0,-.058,-.15,.065,.05,.28,'#392a34');
 tooth(0,-.01,-.31,.047,.15,'#a3545b');
 // Small inset grooves on the upward face, readable from the game camera.
 if(detail>1)for(const side of [-1,1])for(let i=0;i<3;i++)box(side*(.038+i*.018),.131,.13-i*.053,.014,.006,.05,'#4a2934').rotation.y=side*-.6;
 // Raised ribs, rivets and inset cuts are solid facets, merged with the body.
 // Put the fine work on top so it survives the overhead gameplay camera.
 const stud=(x,y,z,r,color)=>{const m=new THREE.Mesh(new THREE.OctahedronGeometry(r),material(color));m.position.set(x,y,z);m.scale.set(1,.55,1);gun.add(m);return m;};
 for(const side of [-1,1]){
  box(side*.082,.137,.055,.021,.014,.19,'#c4817c').rotation.y=side*.17;
  for(let i=0;i<4;i++){
   const z=-.055-i*.076,x=side*(.141+i*.003);
   box(x,.097,z,.076,.025,.024,'#3b2731').rotation.y=side*.22;
   box(x,.113,z,.053,.012,.010,'#b96b70').rotation.y=side*.22;
   if(detail>0)stud(x,.124,z,.014,'#d39a89');
  }
  // Hooks curl back around the heart, leaving the open muzzle recognizable.
  box(side*.18,-.005,-.16,.045,.038,.23,'#35242d').rotation.y=side*.32;
  tooth(side*.207,.055,-.115,.037,.12,'#a15a61').rotation.x=.9;
  tooth(side*.105,.09,.18,.036,.13,'#66303d').rotation.x=.5;
  if(detail>1){
   for(let i=0;i<3;i++){
    box(side*.123,.053,.095-i*.047,.012,.025,.024,'#30232c').rotation.x=-.45;
    box(side*.152,.063,-.34-i*.035,.026,.018,.010,'#d1847c').rotation.y=side*-.5;
   }
  }
 }
 // A small seal set into the back plate: geometric carving, no lettering.
 stud(0,.142,.047,.048,'#3b2530').rotation.y=Math.PI/4;
 stud(0,.154,.047,.026,'#cb5c63');
 box(0,.141,.126,.016,.013,.038,'#d18b81');
 box(0,.141,-.025,.016,.013,.038,'#d18b81');
 if(detail>1){
  for(let i=0;i<3;i++)box(0,-.114-i*.032,.17+i*.008,.071,.014,.008,i===1?'#c1837c':'#6b3946').rotation.x=-.28;
  // A jagged pommel and its inset ember, both part of the static batch.
  tooth(0,-.245,.155,.048,.10,'#442732').rotation.x=Math.PI;
  stud(0,-.211,.22,.027,'#b95760');
 }
 bakeColors(gun);mats.forEach(m=>m.dispose());
 const heart=new THREE.Mesh(new THREE.OctahedronGeometry(.10),new THREE.MeshBasicMaterial({color:'#ef5960',toneMapped:false}));
 heart.position.set(0,.025,-.24);heart.scale.set(.65,1,1.45);gun.add(heart);gun.userData.heart=heart;
 const auraMat=new THREE.MeshBasicMaterial({color:'#c72748',transparent:true,opacity:.07,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false});
 const aura=new THREE.Mesh(new THREE.OctahedronGeometry(.18),auraMat);aura.position.copy(heart.position);aura.scale.set(1,.75,1.35);gun.add(aura);gun.userData.aura=aura;
 if(arm){
  const sleeve=new THREE.Group();
  for(let i=0;i<4;i++){
   const m=new THREE.Mesh(new THREE.OctahedronGeometry(.12),new THREE.MeshBasicMaterial({color:'#bd2443',transparent:true,opacity:.055*(1-i/4),depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false}));
   m.position.set(0,-.045,.20+i*.075);m.scale.set(.85,.9,1.1);sleeve.add(m);
  }
  gun.add(sleeve);gun.userData.armAura=sleeve;
 }
 return gun;
}
