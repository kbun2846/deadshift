import * as THREE from 'three';
import { makeSightlinePistol } from './sightline-model.js';
import { SIDEKICK as S } from '../config/gameplay.js';
export function makeSidekick(){
 const pack=new THREE.Group();pack.name='sidekick-loadout';
 for(const name of ['sidekick-main','sidekick-off']){const gun=makeSightlinePistol();gun.name=name;pack.add(gun);}
 const sleeve=new THREE.Mesh(new THREE.BoxGeometry(.13,.13,.45),new THREE.MeshLambertMaterial({color:'#49716b'}));sleeve.name='sidekick-remote-arm';sleeve.position.set(-.54,-.04,.24);pack.add(sleeve);
 poseSidekick(pack,{},0);return pack;
}
const ease=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
export function poseSidekick(root,s,time){
 const pack=root.getObjectByName('sidekick-loadout');if(!pack)return;
 const right=pack.getObjectByName('sidekick-main'),left=pack.getObjectByName('sidekick-off');
 let pose=pack.userData.sidekickPose;
 if(!pose||pose.marker!==left.uuid){
  const materials=[];left.traverse(m=>{if(!m.isMesh)return;m.material=m.material.clone();m.material.userData.sidekickOwner=left.uuid;
   const blend=m.material.userData.sidekickWhite={value:0};
   m.material.onBeforeCompile=shader=>{shader.uniforms.sidekickWhite=blend;shader.fragmentShader='uniform float sidekickWhite;\n'+shader.fragmentShader;shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\ndiffuseColor.rgb=mix(diffuseColor.rgb,vec3(1.0),sidekickWhite);');};
   m.material.customProgramCacheKey=()=> 'sidekick-white';materials.push({material:m.material,color:m.material.color.clone()});});
  pose=pack.userData.sidekickPose={marker:left.uuid,materials,lastShot:s.shotClock||0,kick:[0,0],born:time};
 }
 if(pose.lastShot!==s.shotClock){pose.lastShot=s.shotClock;pose.kick[s.active?1-(s.hand||0):0]=time;}
 const progress=s.summon>0?1-s.summon/S.summon:s.active>0?1:0;
 pose.reach=ease(progress/.48);
 left.visible=progress>.40;const sleeve=pack.getObjectByName('sidekick-remote-arm');if(sleeve){sleeve.visible=progress>0&&!pack.userData.local;sleeve.scale.z=.3+.7*pose.reach;}
 // Reach first, then a white faceted silhouette grows and acquires its colour.
 const morph=ease((progress-.42)/.58),white=1-ease((progress-.65)/.35);
 left.scale.set(.35+.65*morph,.55+.45*morph,.25+.75*morph);
 for(const {material,color} of pose.materials){material.color.copy(color);material.userData.sidekickWhite.value=white;material.emissive?.setRGB(white*.8,white*.8,white*.8);}
 for(const [i,gun] of [right,left].entries()){
  const recoil=Math.max(0,1-(time-pose.kick[i])/.13)*.055,load=s.reload>0?Math.sin((1-s.reload/S.reload)*Math.PI):0;
  gun.position.set(i?-.54:0,-load*.10,(i?.12*(1-pose.reach):0)+recoil+load*.12);
  gun.rotation.set(-recoil*2+load*.5,0,(i?-1:1)*load*.22);
  const mag=gun.getObjectByName('side-kick-magazine');if(mag)mag.position.y=-.21*load;
 }
 return pose;
}

export function disposeSidekick(root){const pack=root.getObjectByName('sidekick-loadout'),left=pack?.getObjectByName('sidekick-off');if(left)left.traverse(m=>{if(m.material?.userData.sidekickOwner===left.uuid)m.material.dispose();});}
