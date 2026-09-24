import * as THREE from 'three';

// One native 3D product render, cached as an image; no animation/context kept alive.
let cached;
export function staticPreview(){
 if(cached)return cached;
 const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});
 renderer.setSize(600,720);renderer.setPixelRatio(1);
 renderer.outputColorSpace=THREE.SRGBColorSpace;
 renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.25;
 const scene=new THREE.Scene();renderer.setClearColor(0x000000,0);
 scene.add(new THREE.HemisphereLight('#e1f5ff','#30332f',2.5));
 const key=new THREE.DirectionalLight('#fff1df',2.2);key.position.set(2,4,3);scene.add(key);
 const rim=new THREE.DirectionalLight('#9bdfff',.8);rim.position.set(-3,1,-2);scene.add(rim);
 const gun=new THREE.Group();scene.add(gun);
 const materials=new Map();
 // Diffuse-only surfaces keep the yellow collar matte, without metallic highlights.
 const material=color=>{if(!materials.has(color))materials.set(color,new THREE.MeshLambertMaterial({color}));return materials.get(color);};
 function box(x,y,z,w,h,d,color){const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d,2,2,2),material(color));mesh.position.set(x,y,z);gun.add(mesh);return mesh;}
 function barrel(z,radius,length,color){const m=new THREE.Mesh(new THREE.CylinderGeometry(radius,radius,length,32),material(color));m.rotation.x=Math.PI/2;m.position.z=z;gun.add(m);return m;}
 box(0,0,.025,.22,.19,.35,'#9bd9ee');
 box(0,.11,.04,.15,.045,.25,'#c1edfa');
 box(0,.139,.04,.065,.012,.18,'#568697');
 for(let i=0;i<5;i++)box(0,.148,-.027+i*.032,.075,.008,.01,'#91c6d6');
 box(0,.018,.211,.17,.13,.022,'#6b9bac');
 box(0,.02,.226,.12,.072,.012,'#354e59');
 const grip=box(0,-.14,.13,.11,.24,.14,'#354e59');grip.rotation.x=-.15;
 for(let i=0;i<5;i++)box(0,-.07-i*.037,.208,.115,.009,.012,'#597280');
 box(0,-.105,-.01,.1,.025,.13,'#354e59');
 box(0,-.18,-.018,.028,.018,.14,'#568697');
 box(0,-.145,-.08,.028,.08,.018,'#568697');
 const trigger=box(0,-.133,-.016,.018,.048,.021,'#8dbdcb');trigger.rotation.x=-.35;
 barrel(-.19,.068,.2,'#568697');
 barrel(-.267,.112,.115,'#f1ce54');
 barrel(-.327,.056,.009,'#182f39');
 barrel(-.333,.041,.005,'#0e2029');
 for(let i=0;i<8;i++){
  const angle=i*Math.PI/4;
  const notch=box(Math.cos(angle)*.094,Math.sin(angle)*.094,-.328,.017,.009,.004,'#bc9e40');
  notch.rotation.z=angle;
 }
 for(const z of [-.22,-.29]){
  const ring=new THREE.Mesh(new THREE.TorusGeometry(.113,.009,8,40),material('#d2a53d'));ring.position.z=z;gun.add(ring);
 }
 for(const side of [-1,1]){
  box(side*.119,.012,.03,.025,.08,.22,'#4d8499');
  const rail=box(side*.137,.015,.03,.016,.027,.18,'#bff6ff');
  rail.material=new THREE.MeshBasicMaterial({color:'#bff6ff'});
  for(let i=0;i<4;i++)box(side*.149,.015,-.044+i*.047,.009,.06,.008,'#486878');
  for(const z of [-.1,.14]){
   const screw=new THREE.Mesh(new THREE.CylinderGeometry(.012,.012,.012,16),material('#d8e5e6'));
   screw.rotation.z=Math.PI/2;screw.position.set(side*.116,.053,z);gun.add(screw);
  }
 }
 // Fixed angular filaments wrap the silhouette; no bloom, particles, or animation.
 const arcMaterial=new THREE.MeshBasicMaterial({color:'#a7eaff'});
 function arc(points,radius=.0015){
  for(let i=1;i<points.length;i++){
   const a=new THREE.Vector3(...points[i-1]),b=new THREE.Vector3(...points[i]);
   const delta=b.clone().sub(a);
   const segment=new THREE.Mesh(new THREE.CylinderGeometry(radius,radius,delta.length(),5),arcMaterial);
   segment.position.copy(a).add(b).multiplyScalar(.5);
   segment.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());gun.add(segment);
  }
 }
 arc([[.151,.015,.13],[.169,.048,.095],[.155,.065,.078],[.17,.1,.042],[.137,.13,.016],[.116,.151,-.019],[.067,.161,-.05],[.041,.143,-.081],[-.012,.144,-.105]]);
 arc([[.15,.015,-.05],[.169,-.007,-.09],[.143,-.028,-.118],[.158,-.015,-.155],[.107,.028,-.186],[.09,.063,-.222],[.059,.095,-.246]]);
 arc([[.17,.1,.042],[.193,.118,.025],[.185,.14,.004]],.001);
 arc([[-.115,.048,.11],[-.135,.08,.077],[-.117,.106,.058],[-.087,.144,.039],[-.052,.153,.052]],.0012);
 arc([[.145,.025,.16],[.187,.057,.18],[.177,.089,.143],[.198,.122,.107],[.157,.15,.071],[.119,.174,.095],[.074,.165,.063],[.032,.182,.025],[-.012,.16,.004]],.0018);
 arc([[.154,-.015,.08],[.19,-.05,.052],[.173,-.074,.023],[.188,-.091,-.018],[.145,-.107,-.057],[.123,-.083,-.098],[.14,-.063,-.137]],.0017);
 arc([[.064,.105,-.224],[.105,.124,-.249],[.126,.082,-.271],[.144,.055,-.302],[.122,.013,-.34],[.135,-.024,-.353],[.104,-.068,-.345],[.062,-.108,-.331],[.025,-.125,-.338],[-.02,-.117,-.324]],.0018);
 arc([[.126,.082,-.271],[.157,.097,-.289],[.173,.076,-.319]],.0011);
 arc([[.119,.174,.095],[.139,.202,.075],[.122,.218,.053]],.0011);
 arc([[.188,-.091,-.018],[.215,-.114,-.04],[.205,-.133,-.07]],.0011);
 arc([[-.02,-.117,-.324],[-.068,-.11,-.306],[-.098,-.08,-.32],[-.129,-.044,-.291],[-.119,.008,-.272]],.0014);
 const camera=new THREE.PerspectiveCamera(33,600/720,.01,10);
 camera.position.set(.95,.65,-1.05);camera.lookAt(0,-.03,-.055);
 camera.zoom=1.55;camera.updateProjectionMatrix();
 gun.rotation.z=-.16;
 renderer.render(scene,camera);cached=renderer.domElement.toDataURL('image/png');
 const used=new Set();scene.traverse(o=>{o.geometry?.dispose();if(o.material)used.add(o.material);});used.forEach(m=>m.dispose());renderer.dispose();renderer.forceContextLoss();
 return cached;
}
