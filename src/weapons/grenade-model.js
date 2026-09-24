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
 if(detail>=3){
  // Extreme: the fragmentation grid (vertical grooves between the rings), a
  // threaded fuse collar, the striker spring under the lever and a proper
  // pull ring hanging off the pin.
  for(let i=0;i<8;i++){const a=i*Math.PI/4,groove=new THREE.Mesh(new THREE.BoxGeometry(.012,.3,.012),dark);groove.position.set(Math.cos(a)*.138,0,Math.sin(a)*.138);groove.rotation.y=-a;groove.scale.y=1;group.add(groove);}
  const collar=new THREE.Mesh(new THREE.CylinderGeometry(.068,.068,.022,14),steel);collar.position.y=.158;group.add(collar);
  const thread=new THREE.Mesh(new THREE.TorusGeometry(.066,.005,4,16),dark);thread.rotation.x=Math.PI/2;thread.position.y=.168;group.add(thread);
  const spring=new THREE.Mesh(new THREE.TorusGeometry(.02,.004,3,10),steel);spring.position.set(0,.235,-.03);spring.rotation.y=Math.PI/2;group.add(spring);
  const pull=new THREE.Mesh(new THREE.TorusGeometry(.05,.006,4,16),steel);pull.position.set(.1,.17,.0);pull.rotation.set(0,Math.PI/2,.5);group.add(pull);
  body.geometry.dispose();body.geometry=new THREE.IcosahedronGeometry(.14,2);
 }
 return group;
}
