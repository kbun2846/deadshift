import * as THREE from 'three';
export function makeGrenade(detail=2){
 const group=new THREE.Group(),olive=new THREE.MeshLambertMaterial({color:'#829c48',flatShading:true}),dark=new THREE.MeshLambertMaterial({color:'#202d21'}),steel=new THREE.MeshLambertMaterial({color:'#c0cbb2'});
 group.scale.setScalar(1.3);
 const body=new THREE.Mesh(new THREE.IcosahedronGeometry(.14,detail>=2?1:0),olive);body.scale.set(1,1.35,1);group.add(body);
 const cap=new THREE.Mesh(new THREE.CylinderGeometry(.052,.062,.075,6),dark);cap.position.y=.19;group.add(cap);
 const lever=new THREE.Mesh(new THREE.BoxGeometry(.045,.055,.22),steel);lever.position.set(0,.23,.05);lever.rotation.x=.16;group.add(lever);
 const indicator=new THREE.Mesh(new THREE.IcosahedronGeometry(.034,0),new THREE.MeshBasicMaterial({color:'#611c16',toneMapped:false}));indicator.position.set(.055,.2,-.035);group.add(indicator);group.userData.indicator=indicator;
 if(detail>=1){
  for(const y of [-.08,.035,.12]){const ring=new THREE.Mesh(new THREE.TorusGeometry(y===.12?.105:.135,.008,3,8),dark);ring.rotation.x=Math.PI/2;ring.position.y=y;group.add(ring);}
  const pin=new THREE.Mesh(new THREE.TorusGeometry(.034,.006,3,8),steel);pin.position.set(.065,.19,0);pin.rotation.y=Math.PI/2;group.add(pin);
 }
 return group;
}
