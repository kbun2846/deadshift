import * as THREE from 'three';
import { bakeColors } from '../render/bake-colors.js';
import { SIGHTLINE } from '../config/gameplay.js';
const box=(g,x,y,z,w,h,d,c)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),new THREE.MeshLambertMaterial({color:c,flatShading:true}));m.position.set(x,y,z);g.add(m);return m;};
const tube=(g,x,y,z,r,len,c)=>{const m=new THREE.Mesh(new THREE.CylinderGeometry(r,r,len,8),new THREE.MeshLambertMaterial({color:c,flatShading:true}));m.rotation.x=Math.PI/2;m.position.set(x,y,z);g.add(m);return m;};
function bake(g){const materials=new Set();g.traverse(m=>{if(m.material)materials.add(m.material);});bakeColors(g);materials.forEach(m=>m.dispose());}
// Soft yellow light from crossed, vertex-faded discs. Local pivots let the
// glow breathe without slipping off the muzzle. No dynamic light or pass.
function breachGlow(){
 const positions=[],colors=[];
 const disc=(x,y,z,rx,ry,plane)=>{
  const point=(r,a)=>plane==='xz'?[x+Math.cos(a)*rx*r,y,z+Math.sin(a)*ry*r]:[x+Math.cos(a)*rx*r,y+Math.sin(a)*ry*r,z];
  const rings=[0,.24,.58,1],light=[1,.8,.24,0];
  const vertex=(r,a,c)=>{positions.push(...point(r,a));colors.push(c,c,c);};
  for(let ring=0;ring<3;ring++)for(let i=0;i<16;i++){
   const a=i*Math.PI/8,b=(i+1)*Math.PI/8,lo=rings[ring],hi=rings[ring+1],lc=light[ring],hc=light[ring+1];
   vertex(lo,a,lc);vertex(hi,a,hc);vertex(hi,b,hc);
   vertex(lo,a,lc);vertex(hi,b,hc);vertex(lo,b,lc);
  }
 };
 const material=new THREE.MeshBasicMaterial({color:'#ffe655',vertexColors:true,transparent:true,opacity:.72,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,toneMapped:false});
 const finish=name=>{
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  positions.length=colors.length=0;const mesh=new THREE.Mesh(geometry,material);mesh.name=name;return mesh;
 };
 const group=new THREE.Group();group.name='sightline-breach-glow';
 disc(0,0,0,.32,.50,'xz');const chamber=finish('sightline-chamber-halo');chamber.position.set(0,.18,-.33);
 disc(0,0,0,.38,.42,'xy');disc(0,0,-.07,.38,.48,'xz');const muzzle=finish('sightline-muzzle-halo');muzzle.position.set(0,.045,-1.40);
 group.add(chamber,muzzle);return group;
}
export function makeSightlineRifle(){
 const g=new THREE.Group();g.name='sightline-rifle';
 box(g,0,-.025,.36,.16,.23,.57,'#594737');box(g,0,.11,.35,.155,.045,.32,'#937357');
 box(g,0,-.10,.60,.18,.32,.08,'#272c2a');box(g,0,-.15,.12,.10,.28,.12,'#4d3d30').rotation.x=-.25;
 box(g,0,.025,-.06,.21,.20,.42,'#414846');box(g,0,.145,-.04,.19,.035,.34,'#9c9c84');
 box(g,0,-.04,-.38,.15,.16,.36,'#635340');
 tube(g,0,.045,-.81,.045,.88,'#303937');tube(g,0,.045,-1.26,.069,.17,'#636b64');tube(g,0,.045,-1.353,.039,.012,'#111c1b');
 // Fluted barrel, front sight and exposed scope rings read from overhead.
 for(const side of [-1,1]){
  box(g,side*.036,.080,-.83,.015,.015,.67,'#949786');
  for(let i=0;i<5;i++){box(g,side*.105,.055,-.19+i*.065,.013,.06,.018,'#222d2a');box(g,side*.081,-.014,-.48+i*.068,.012,.095,.024,'#302e27');}
  for(const z of [-.22,.11,.43])box(g,side*(z>.4?.083:.11),.10,z,.018,.018,.024,'#c2b890');
 }
 box(g,0,.127,-1.16,.034,.15,.055,'#424d46');
 tube(g,0,.28,-.06,.069,.46,'#202d2a');tube(g,0,.28,-.31,.089,.11,'#636e62');tube(g,0,.28,-.371,.061,.012,'#536f72');
 for(const z of [-.19,.10])box(g,0,.19,z,.15,.15,.042,'#7d8069');
 box(g,.087,.30,-.07,.075,.065,.065,'#918f78');box(g,0,.365,-.065,.07,.045,.068,'#b3ab89');

 bake(g);
 const bolt=new THREE.Group();bolt.name='sightline-bolt';box(bolt,.148,.005,.06,.11,.027,.027,'#b5a17d');tube(bolt,.198,.005,.06,.043,.04,'#44483e');bake(bolt);g.add(bolt);
 const vents=new THREE.Group();vents.name='sightline-vents';
 const glow=new THREE.MeshBasicMaterial({color:'#ffe65c',toneMapped:false});
 for(let i=0;i<5;i++){const m=new THREE.Mesh(new THREE.BoxGeometry(.19,.028,.035),glow);m.position.set(0,.145,-.46+i*.052);vents.add(m);}
 const chamber=new THREE.Mesh(new THREE.CylinderGeometry(.08,.08,.17,8),glow);chamber.rotation.x=Math.PI/2;chamber.position.set(0,.07,-.23);vents.add(chamber);g.add(vents);
 const light=new THREE.Group();light.name='sightline-breach-light';light.visible=false;
 const muzzle=new THREE.Mesh(new THREE.TorusGeometry(.062,.018,4,8),new THREE.MeshBasicMaterial({color:'#fff6b0',toneMapped:false}));muzzle.position.set(0,.045,-1.366);light.add(muzzle,breachGlow());g.add(light);
 const sparks=new THREE.InstancedMesh(new THREE.OctahedronGeometry(1),new THREE.MeshBasicMaterial({color:'#fff18a',transparent:true,opacity:.85,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false}),5);
 sparks.name='sightline-breach-sparks';sparks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);sparks.frustumCulled=false;light.add(sparks);
 const plates=new THREE.Group();plates.name='sightline-plates';
 for(const side of [-1,1]){const m=box(plates,side*.086,.14,-.35,.045,.035,.30,'#9c9378');m.rotation.z=side*.25;}bake(plates);g.add(plates);
 const round=new THREE.Group();round.name='sightline-loading-round';tube(round,0,0,0,.045,.26,'#b39b61');tube(round,0,0,-.075,.049,.045,'#ffb940');g.add(round);
 const bipod=new THREE.Group();bipod.name='sightline-bipod';
 box(bipod,0,-.035,-.67,.25,.075,.11,'#505c52');
 for(const side of [-1,1]){
  const leg=new THREE.Group();leg.name=side<0?'sightline-leg-left':'sightline-leg-right';leg.position.set(side*.09,-.035,-.67);
  box(leg,0,-.20,0,.055,.39,.065,'#536158');box(leg,0,-.46,0,.04,.23,.045,'#a6a487');
  box(leg,0,-.595,0,.14,.055,.14,'#3c4840');box(leg,0,-.365,0,.074,.065,.08,'#827f68');bake(leg);bipod.add(leg);
 }
 g.add(bipod);
 return g;
}
export function makeSightlinePistol(){
 const g=new THREE.Group();g.name='sightline-pistol';
 box(g,0,0,-.065,.11,.12,.36,'#515b52');box(g,0,.075,-.095,.10,.025,.28,'#a4a28a');
 box(g,0,-.125,.06,.085,.23,.10,'#785539').rotation.x=-.25;
 tube(g,0,.01,-.255,.035,.08,'#242e29');tube(g,0,.01,-.299,.021,.012,'#131d19');
 box(g,0,.109,-.24,.025,.043,.04,'#d6bf79');
 for(const side of [-1,1])for(let i=0;i<3;i++)box(g,side*.057,.015,.025+i*.027,.01,.065,.01,'#b2ac8b');
 box(g,0,-.13,-.045,.072,.018,.13,'#262e26');bake(g);
 const magazine=new THREE.Group();magazine.name='side-kick-magazine';box(magazine,0,-.24,.08,.082,.055,.105,'#a3916a');bake(magazine);g.add(magazine);return g;
}
export function makeSightline(){
 const pack=new THREE.Group();pack.name='sightline-loadout';pack.add(makeSightlineRifle(),makeSightlinePistol());
 const rig=new THREE.Group();rig.name='sightline-holster';
 box(rig,.08,-.31,.50,.20,.27,.17,'#443426');box(rig,.09,-.23,.59,.21,.038,.055,'#a78350');
 // Leather diagonal shoulder strap across the back, separate from the gun.
 box(rig,-.32,-.10,.79,.055,.92,.038,'#493d2c').rotation.z=-.98;bake(rig);pack.add(rig);
 poseSightline(pack,{},0);return pack;
}
const ease=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
const move=(a,b,step)=>a+Math.max(-step,Math.min(step,b-a));
export function poseSightline(pack,s,time,dt=Infinity){
 const rifle=pack.getObjectByName('sightline-rifle'),pistol=pack.getObjectByName('sightline-pistol');if(!rifle||!pistol)return;
 const held=!!s.crouched||!!s.xLoading,loading=s.rifleReload>0&&held,progress=loading?1-s.rifleReload/SIGHTLINE.reload:0;
 let pose=pack.userData.sightlinePose;if(!pose?.slung?.isQuaternion)pose=pack.userData.sightlinePose={held:0,crouch:0,slung:new THREE.Quaternion(),ready:new THREE.Quaternion(),euler:new THREE.Euler(),spark:new THREE.Object3D()};
 pose.held=move(pose.held,Number(held),dt/(held?SIGHTLINE.drawDuration:SIGHTLINE.standDuration));
 pose.crouch=move(pose.crouch,Number(!!s.crouched),dt/(s.crouched?SIGHTLINE.setupDuration:SIGHTLINE.standDuration));
 const h=ease(pose.held),c=ease(pose.crouch),swap=Math.sin(Math.PI*h),reloadTilt=loading?Math.sin(progress*Math.PI):0;
 // First pull clear of the back, then turn beside the shoulder, then shoulder
 // the stock. A direct quaternion blend swept the barrel through the hat.
 const pull=ease(h/.30),turn=ease((h-.30)/.45),shoulder=ease((h-.75)/.25);
 rifle.position.set(-.33+.88*pull-.42*shoulder,-.13+.105*turn,1.16+.04*pull-1.16*turn);
 pose.slung.setFromEuler(pose.euler.set(1.03,0,-.92,'ZYX'));
 pose.ready.setFromEuler(pose.euler.set(reloadTilt*.20,0,loading?-.12*reloadTilt:0,'XYZ'));
 rifle.quaternion.copy(pose.slung).slerp(pose.ready,turn);
 const support=ease((c-.18)/.82)*h;
 for(const side of [-1,1]){
  const leg=rifle.getObjectByName(side<0?'sightline-leg-left':'sightline-leg-right');
  leg.rotation.set(-(1-support)*Math.PI/2+support*.06,0,side*support*.25);
 }
 const pr=s.pistolReload>0?1-s.pistolReload/SIGHTLINE.pistolReload:0;
 const holster=ease(h/.24);
 pistol.position.set(.08*holster,-.22*holster-(s.pistolReload>0?.08*Math.sin(pr*Math.PI):0),.5*holster);
 pistol.rotation.set(-Math.PI/2*holster+(s.pistolReload>0?.38*Math.sin(pr*Math.PI):0),0,.08*holster);
 const magazine=pistol.getObjectByName('side-kick-magazine');if(magazine){magazine.position.y=s.pistolReload>0?-.23*Math.sin(pr*Math.PI):0;magazine.rotation.z=s.pistolReload>0?Math.sin(pr*Math.PI)*.2:0;}
 const vents=rifle.getObjectByName('sightline-vents');vents.visible=!!s.special||!!s.xLoading&&progress>.58;
 rifle.getObjectByName('sightline-breach-light').visible=vents.visible;
 if(vents.visible){
  rifle.getObjectByName('sightline-chamber-halo').scale.setScalar(1+.18*Math.sin(time*4));
  rifle.getObjectByName('sightline-muzzle-halo').scale.setScalar(1+.20*Math.sin(time*4-1)+.035*Math.sin(time*17));
  const sparks=rifle.getObjectByName('sightline-breach-sparks'),d=pose.spark;
  for(let i=0;i<5;i++){
   const age=(time*1.25+i/5)%1,angle=time*4.2+i*2.4,radius=.04+age*.065,size=.032*Math.sin(Math.PI*age);
   d.position.set(Math.cos(angle)*radius,.045+Math.sin(angle)*radius+age*.06,-1.37-age*.46);
   d.rotation.set(0,0,angle);d.scale.set(size,size,size*2.2);d.updateMatrix();sparks.setMatrixAt(i,d.matrix);
  }
  sparks.instanceMatrix.needsUpdate=true;
 }
 vents.scale.setScalar(1+.07*Math.sin(time*4));
 const plates=rifle.getObjectByName('sightline-plates');plates.position.y=vents.visible?.045+.012*Math.sin(time*4):0;
 const shell=rifle.getObjectByName('sightline-loading-round');shell.visible=loading&&progress>.23&&progress<.73;
 const insert=ease((progress-.27)/.40);shell.position.set(-.16*(1-insert),.16+.08*Math.sin(insert*Math.PI),-.12+.04*insert);shell.rotation.z=(1-insert)*.8;
 shell.scale.setScalar(s.xLoading?1.25:1);
 shell.children[1].visible=!!s.xLoading;
 const bolt=rifle.getObjectByName('sightline-bolt');
 if(bolt){const open=ease(progress/.16)*(1-ease((progress-.77)/.13));bolt.position.z=loading?open*.17:0;bolt.rotation.z=loading?-open*.65:0;}
 pose.bodyCrouch=c;pose.swap=swap;pose.drawBlend=h;pose.support=support;return pose;
}
