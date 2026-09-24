import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Small stylized anatomy bank, shared by all eight pieces in a death burst.
export function makeBoneBank(){
 const ivory=new THREE.MeshLambertMaterial({color:'#ddd0b1',flatShading:true}),dark=new THREE.MeshBasicMaterial({color:'#342921'});
 const geometries=[],models=[],organs=[];
 const mesh=(parts)=>{
  const flat=parts.map(part=>part.index?part.toNonIndexed():part);
  const geometry=mergeGeometries(flat);new Set([...parts,...flat]).forEach(part=>part.dispose());geometries.push(geometry);
  const group=new THREE.Group();group.add(new THREE.Mesh(geometry,ivory));models.push(group);return group;
 };
 const ball=(x,y,z,r)=>new THREE.IcosahedronGeometry(r,0).translate(x,y,z);
 for(const length of [.43,.31]){
  const parts=[new THREE.CylinderGeometry(.026,.032,length,5)];
  for(const y of [-length/2,length/2])for(const x of [-.027,.027])parts.push(ball(x,y,0,.045));
  mesh(parts).userData.bone=length>.4?'femur':'humerus';
 }
 mesh([new THREE.TorusGeometry(.14,.024,4,10,Math.PI*1.6)]).userData.bone='rib';
 mesh([new THREE.TorusGeometry(.085,.032,4,8).scale(.85,1.2,1).translate(-.075,0,0),new THREE.TorusGeometry(.085,.032,4,8).scale(.85,1.2,1).translate(.075,0,0),new THREE.BoxGeometry(.07,.12,.05).translate(0,.06,0)]).userData.bone='pelvis';
 const vertebrae=[new THREE.CylinderGeometry(.022,.022,.30,5)];
 for(let i=0;i<5;i++)vertebrae.push(new THREE.BoxGeometry(.075,.038,.06).translate(0,i*.055-.11,0));
 mesh(vertebrae).userData.bone='spine';
 const skull=mesh([new THREE.IcosahedronGeometry(.12,1).scale(1,1.12,.9),new THREE.BoxGeometry(.13,.055,.09).translate(0,-.11,.035)]);skull.userData.bone='skull';
 const socketGeometry=new THREE.CircleGeometry(.031,6);geometries.push(socketGeometry);
 for(const x of [-.046,.046]){const socket=new THREE.Mesh(socketGeometry,dark);socket.position.set(x,.015,.102);skull.add(socket);}
 const noseGeometry=new THREE.CircleGeometry(.018,3);geometries.push(noseGeometry);const nose=new THREE.Mesh(noseGeometry,dark);nose.position.set(0,-.043,.109);skull.add(nose);
 const flesh=new THREE.MeshLambertMaterial({color:'#b65e6c',flatShading:true}),red=new THREE.MeshLambertMaterial({color:'#843447',flatShading:true}),skin=new THREE.MeshLambertMaterial({color:'#d6b58a',flatShading:true});
 const part=(group,geometry,material,x=0,y=0,z=0)=>{geometries.push(geometry);const piece=new THREE.Mesh(geometry,material);piece.position.set(x,y,z);group.add(piece);return piece;};
 const brain=new THREE.Group();brain.userData.remain='brain';organs.push(brain);
 for(const side of [-1,1]){
  part(brain,new THREE.IcosahedronGeometry(.115,1).scale(.7,.75,1.05),flesh,side*.055,0,0);
  for(let i=0;i<3;i++)part(brain,new THREE.IcosahedronGeometry(.037,0).scale(1,.65,1.15),flesh,side*.065,.071,(i-1)*.062);
 }
 const intestine=new THREE.Group();intestine.userData.remain='intestines';organs.push(intestine);
 const points=[];for(let i=0;i<=30;i++){const t=i/30;points.push(new THREE.Vector3(Math.sin(t*Math.PI*6)*.105,.018*Math.sin(t*Math.PI*3),t*.30-.15));}
 part(intestine,new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),36,.029,5,false),red);
 const hand=new THREE.Group();hand.userData.remain='hand';organs.push(hand);
 part(hand,new THREE.BoxGeometry(.11,.055,.13),skin);
 for(let i=0;i<4;i++)part(hand,new THREE.BoxGeometry(.023,.041,.085-Math.abs(i-1.5)*.012),skin,(i-1.5)*.026,0,-.09);
 part(hand,new THREE.BoxGeometry(.029,.042,.068),skin,.065,0,-.022).rotation.y=-.55;
 part(hand,new THREE.BoxGeometry(.072,.054,.022),red,0,0,.073);
 return {models,organs,dispose(){geometries.forEach(geometry=>geometry.dispose());for(const material of [ivory,dark,flesh,red,skin])material.dispose();}};
}
