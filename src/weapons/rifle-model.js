import * as THREE from 'three';
import { bakeColors } from '../render/bake-colors.js';
import { makeGrenade } from './grenade-model.js';
export function makeRifle(detail=3){
 const gun=new THREE.Group();
 let tier=0;
 const mats=new Map();
 const box=(x,y,z,w,h,d,color)=>{
  if(tier>detail)return new THREE.Object3D();
  if(!mats.has(color))mats.set(color,new THREE.MeshLambertMaterial({color}));
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mats.get(color));mesh.position.set(x,y,z);gun.add(mesh);return mesh;
 };
 box(0,0,.015,.15,.15,.32,'#59605a');
 box(0,0,.25,.13,.13,.2,'#785c40');
 box(0,-.012,.345,.14,.15,.025,'#343b38');
 box(0,.075,.22,.1,.024,.18,'#97744e');
 box(0,-.09,.09,.08,.18,.09,'#493e32').rotation.x=-.2;
 box(0,-.13,-.055,.075,.22,.1,'#343b38').rotation.x=.12;
 for(const side of [-1,1]){
  tier=1;
  box(side*.078,-.008,.018,.009,.085,.19,'#71776c');
  box(side*.043,-.148,-.045,.008,.13,.058,'#50584e');
  tier=2;
  for(let i=0;i<3;i++)box(side*.049,-.105-i*.038,-.046,.004,.008,.062,'#2a3330');
  if(detail>=3)for(const z of [-.061,.088]){
   const pin=new THREE.Mesh(new THREE.CylinderGeometry(.009,.009,.011,8),mats.get('#343b38'));
   pin.rotation.z=Math.PI/2;pin.position.set(side*.085,.013,z);gun.add(pin);
  }
  box(side*.066,-.004,-.25,.008,.065,.12,'#a07c50');
 }
 tier=0;
 box(0,-.105,.019,.026,.012,.09,'#343b38');
 box(0,-.078,-.021,.026,.064,.014,'#343b38');
 box(0,-.073,.019,.014,.047,.015,'#71776c').rotation.x=-.2;
 box(0,0,-.24,.12,.12,.22,'#785c40');
 box(0,0,-.4,.045,.045,.16,'#333c3b');
 box(0,0,-.495,.065,.065,.04,'#454d48');
 box(0,0,-.517,.035,.035,.003,'#162522');
 tier=1;
 box(0,.082,.011,.075,.015,.19,'#343b38');
 tier=2;
 for(let i=0;i<4;i++)box(0,.094,-.055+i*.04,.082,.009,.012,'#71776c');
 tier=0;
 box(0,.105,-.015,.035,.05,.055,'#242e2d');
 box(0,.075,-.41,.024,.09,.035,'#242e2d');
 tier=1;
 box(.079,.02,.03,.008,.047,.095,'#222d2c');
 box(.09,.015,.07,.035,.02,.025,'#979d91');
 tier=2;
 for(let i=0;i<4;i++)box(0,.066,-.17-i*.043,.125,.008,.012,'#493e32');
 // One draw for the whole rifle (it was one per colour, about fifteen), same
 // picture: see bake-colors.js.
 bakeColors(gun);mats.forEach(m=>m.dispose());
 return gun;
}
let preview;
export function riflePreview(){
 if(preview)return preview;
 const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});renderer.setSize(600,720);renderer.setPixelRatio(1);renderer.outputColorSpace=THREE.SRGBColorSpace;
 renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.25;
 const scene=new THREE.Scene();renderer.setClearColor(0x000000,0);scene.add(new THREE.HemisphereLight('#e1f5ff','#30332f',2.5));
 const light=new THREE.DirectionalLight('#fff1df',2.2);light.position.set(2,4,3);scene.add(light);
 const rim=new THREE.DirectionalLight('#9bdfff',.8);rim.position.set(-3,1,-2);scene.add(rim);
 const gun=makeRifle();gun.rotation.z=-.16;scene.add(gun);
 const grenade=makeGrenade(2);grenade.position.set(.27,-.25,-.13);grenade.rotation.set(.1,0,.25);scene.add(grenade);
 const camera=new THREE.PerspectiveCamera(33,600/720,.01,10);camera.position.set(1.03,.71,-1.2);camera.lookAt(0,-.03,-.075);
 camera.zoom=1.28;camera.updateProjectionMatrix();
 renderer.render(scene,camera);preview=renderer.domElement.toDataURL();
 const materials=new Set();scene.traverse(o=>{o.geometry?.dispose();if(o.material)materials.add(o.material);});materials.forEach(m=>m.dispose());renderer.dispose();renderer.forceContextLoss();return preview;
}
