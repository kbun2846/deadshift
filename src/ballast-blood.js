import * as THREE from 'three';

export class BallastBlood{
 constructor(view,event,body,direction,yaw){
  this.event=event;this.direction=direction;this.geometries=[];this.materials=[];
  const material=color=>{const m=new THREE.MeshBasicMaterial({color});this.materials.push(m);return m;};
  const red=material('#ce3041'),dark=material('#872433'),clothes=material('#394a44');
  const geometry=g=>{this.geometries.push(g);return g;};
  this.neck=new THREE.Group();this.neck.rotation.y=yaw;body.add(this.neck);
  const cap=new THREE.Mesh(geometry(new THREE.CylinderGeometry(.11,.12,.04,8)),dark);cap.position.y=.85;this.neck.add(cap);
  this.streaks=[];
  for(let i=0;i<4;i++){const streak=new THREE.Mesh(geometry(new THREE.BoxGeometry(.022+i*.004,1,.025)),red);streak.position.set((i-1.5)*.047,.77,-.25+Math.abs(i-1.5)*.012);this.neck.add(streak);this.streaks.push(streak);}
  this.legs=new THREE.Group();this.legs.rotation.y=yaw;body.parent.add(this.legs);
  this.legParts=[];const legGeo=geometry(new THREE.BoxGeometry(1,1,1));
  for(const side of [-1,1]){const upper=new THREE.Mesh(legGeo,clothes),lower=new THREE.Mesh(legGeo,clothes);this.legs.add(upper,lower);this.legParts.push({side,upper,lower});}
  this.pool=new THREE.Group();this.pool.position.set(event.x,.026,event.z);this.pool.rotation.y=-Math.atan2(direction.z,direction.x);view.scene.add(this.pool);
  const poolGeo=geometry(new THREE.CircleGeometry(1,14));
  for(let i=0;i<12;i++){
   const puddle=new THREE.Mesh(poolGeo,i%4===0?dark:red);puddle.rotation.x=-Math.PI/2;
   const x=i===0?0:.15+Math.random()*1.65,z=i===0?0:(Math.random()-.5)*(.65+x*.25),size=i===0?.65:.15+Math.random()*.23;
   puddle.position.set(x,i*.0004,z);puddle.scale.set(size*(i===0?1:1.35),size*(i===0?.75:.6),1);this.pool.add(puddle);
  }
  this.count=({potato:12,performance:18,balanced:28,quality:40,extreme:40}[view.qualityName]||28);
  this.drops=new THREE.InstancedMesh(geometry(new THREE.IcosahedronGeometry(1,0)),red,this.count+8);this.drops.frustumCulled=false;view.scene.add(this.drops);
  this.fragments=Array.from({length:this.count},()=>{const forward=1.7+Math.random()*3,side=(Math.random()-.5)*1.2;return {vx:direction.x*forward-direction.z*side,vz:direction.z*forward+direction.x*side,vy:.5+Math.random()*1.6,size:.025+Math.random()*.035};});
  this.dummy=new THREE.Object3D();this.point=new THREE.Vector3();this.a=new THREE.Vector3();this.b=new THREE.Vector3();this.delta=new THREE.Vector3();this.up=new THREE.Vector3(0,1,0);
 }
 segment(mesh,a,b,width){this.delta.subVectors(b,a);mesh.position.copy(a).add(b).multiplyScalar(.5);mesh.quaternion.setFromUnitVectors(this.up,this.delta.clone().normalize());mesh.scale.set(width,this.delta.length(),width);}
 update(time,kneel){
  this.pool.scale.setScalar(.12+1.15*(1-Math.exp(-time*1.6)));
  for(const {side,upper,lower}of this.legParts){
   this.a.set(side*.15,.29-.12*kneel,0);this.b.set(side*.15,.13,-.18*kneel);this.segment(upper,this.a,this.b,.18);
   this.a.copy(this.b);this.b.set(side*.15,.065,.14*kneel);this.segment(lower,this.a,this.b,.15);
  }
  for(let i=0;i<this.streaks.length;i++){const length=Math.min(.43,Math.max(0,time-i*.07)*.32);this.streaks[i].scale.y=length;this.streaks[i].position.y=.81-length/2;}
  let index=0;
  for(const p of this.fragments){
   const landing=(p.vy+Math.sqrt(p.vy*p.vy+19.6*(.98-.033)))/9.8,age=Math.min(time,landing),landed=time>=landing;
   this.dummy.position.set(this.event.x+p.vx*age,Math.max(.033,.98+p.vy*age-4.9*age*age),this.event.z+p.vz*age);
   this.dummy.rotation.set(landed?0:age*7,index*2,0);this.dummy.scale.set(p.size*(landed?2:1),p.size*(landed?.15:1.5),p.size);this.dummy.updateMatrix();this.drops.setMatrixAt(index++,this.dummy.matrix);
  }
  if(time<2.3){
   this.point.set(0,.84,-.08);this.neck.localToWorld(this.point);
   for(let i=0;i<8;i++){const age=((time+i*.09)%.62),y=Math.max(.035,this.point.y-2.1*age);this.dummy.position.set(this.point.x+this.direction.x*age*.16+(i%3-1)*.025,y,this.point.z+this.direction.z*age*.16);this.dummy.scale.set(.018,.045,.018);this.dummy.updateMatrix();this.drops.setMatrixAt(index++,this.dummy.matrix);}
  }
  this.drops.count=index;this.drops.instanceMatrix.needsUpdate=true;
 }
 dispose(){this.pool.removeFromParent();this.drops.removeFromParent();this.neck.removeFromParent();this.legs.removeFromParent();this.drops.dispose();this.geometries.forEach(g=>g.dispose());this.materials.forEach(m=>m.dispose());}
}
