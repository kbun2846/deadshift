import * as THREE from 'three';
export function makeShotgun(detail=2){
 const root=new THREE.Group(),barrels=new THREE.Group();root.add(barrels);root.userData.barrels=barrels;
 const materials=new Map();const mat=c=>{if(!materials.has(c))materials.set(c,new THREE.MeshLambertMaterial({color:c,flatShading:true}));return materials.get(c);};
 const box=(parent,x,y,z,w,h,d,c)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat(c));m.position.set(x,y,z);parent.add(m);return m;};
 box(root,0,0,.08,.24,.15,.24,'#474e4b');box(root,0,-.04,.30,.18,.21,.28,'#795341');box(root,0,-.06,.45,.19,.23,.035,'#262b29');
 const grip=box(root,0,-.14,.12,.11,.23,.13,'#795341');grip.rotation.x=-.3;
 box(root,0,.09,.03,.055,.045,.13,'#b6a079');box(root,0,-.17,-.03,.12,.025,.16,'#292f2e');
 for(const side of [-1,1]){
  const tube=new THREE.Mesh(new THREE.CylinderGeometry(.066,.073,.56,detail>1?12:6),mat('#353e3d'));tube.rotation.x=Math.PI/2;tube.position.set(side*.072,.02,-.25);barrels.add(tube);
  const hole=new THREE.Mesh(new THREE.CircleGeometry(.052,detail>1?12:6),mat('#090f10'));hole.position.set(side*.072,.02,-.532);hole.rotation.y=Math.PI;barrels.add(hole);
  box(root,side*.126,0,.07,.012,.1,.15,'#af9770');
  box(root,side*.143,.025,.035,.023,.025,.055,'#1c2729');
 }
 box(barrels,0,-.067,-.19,.21,.085,.25,'#795341');box(barrels,0,.09,-.24,.036,.035,.53,'#69716c');box(barrels,0,.125,-.48,.023,.04,.025,'#e6c78b');
 if(detail>1)for(let i=0;i<5;i++)box(barrels,0,-.11,-.10-i*.037,.22,.008,.013,'#493b32');
 const shells=[];
 for(const side of [-1,1]){
  const shell=new THREE.Group();shell.position.set(side*.072,.02,.012);barrels.add(shell);shells.push(shell);
  const caseBody=new THREE.Mesh(new THREE.CylinderGeometry(.046,.046,.10,10),mat('#a04b3d'));caseBody.rotation.x=Math.PI/2;caseBody.position.z=-.04;shell.add(caseBody);
  const brass=new THREE.Mesh(new THREE.CylinderGeometry(.053,.053,.018,12),mat('#c4a368'));brass.rotation.x=Math.PI/2;brass.position.z=.018;shell.add(brass);
  const primer=new THREE.Mesh(new THREE.CircleGeometry(.016,8),mat('#ded0a6'));primer.position.z=.028;shell.add(primer);
  const hinge=new THREE.Mesh(new THREE.CylinderGeometry(.040,.040,.018,10),mat('#c4a368'));hinge.rotation.z=Math.PI/2;hinge.position.set(side*.132,-.045,-.025);root.add(hinge);
  if(detail>1){box(root,side*.134,.023,.09,.006,.009,.105,'#ded0a6');box(root,side*.134,-.026,.09,.006,.009,.105,'#69716c');}
 }
 box(barrels,0,.012,.01,.024,.09,.06,'#a6aaa0');
 root.userData.shells=shells;
 const hinge=new THREE.Vector3(0,-.065,-.10);for(const child of barrels.children)child.position.sub(hinge);barrels.position.copy(hinge);
 return root;
}
let cached;
export function shotgunPreview(){
 if(cached)return cached;
 const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});renderer.setSize(600,720);renderer.setPixelRatio(1);renderer.outputColorSpace=THREE.SRGBColorSpace;
 renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.25;
 const scene=new THREE.Scene();renderer.setClearColor(0x000000,0);scene.add(new THREE.HemisphereLight('#e1f5ff','#30332f',2.5));const light=new THREE.DirectionalLight('#fff1df',2.2);light.position.set(2,4,3);scene.add(light);
 const rim=new THREE.DirectionalLight('#9bdfff',.8);rim.position.set(-3,1,-2);scene.add(rim);
 const gun=makeShotgun(3);gun.userData.barrels.rotation.x=-.98;gun.rotation.set(.12,0,-.16);scene.add(gun);
 for(const shell of gun.userData.shells)shell.position.z+=.085;
 // Front three-quarter view: open action, twin muzzles and the stock all in frame.
 const camera=new THREE.OrthographicCamera(-.48,.48,.576,-.576,.01,10);camera.position.set(1.4,.65,-1.2);camera.lookAt(0,-.13,-.005);camera.zoom=1.4;camera.updateProjectionMatrix();renderer.render(scene,camera);cached=renderer.domElement.toDataURL();
 const materials=new Set();scene.traverse(n=>{n.geometry?.dispose();if(n.material)materials.add(n.material);});materials.forEach(m=>m.dispose());renderer.dispose();renderer.forceContextLoss();return cached;
}
