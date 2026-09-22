import * as THREE from 'three';
import {shotgunPressurized} from './shotgun.js';

// A bounded pool of pale puffs vented from the two receiver ports.
export class ShotgunPressure{
 constructor(scene,gun){
  this.gun=gun;this.time=0;this.next=0;this.shake=0;this.puffs=[];
  const geometry=new THREE.IcosahedronGeometry(.06,0);
  geometry.setAttribute('instanceFade',new THREE.InstancedBufferAttribute(new Float32Array(32),1));
  const material=new THREE.MeshBasicMaterial({color:'#e7eeee',transparent:true,opacity:.5,depthWrite:false});
  material.onBeforeCompile=shader=>{
   shader.vertexShader='attribute float instanceFade; varying float vFade;\n'+shader.vertexShader;
   shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvFade=instanceFade;');
   shader.fragmentShader='varying float vFade;\n'+shader.fragmentShader;
   shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\ndiffuseColor.a*=vFade;');
  };
  this.mesh=new THREE.InstancedMesh(geometry,material,32);this.mesh.count=0;this.mesh.frustumCulled=false;scene.add(this.mesh);
  this.dummy=new THREE.Object3D();this.origin=new THREE.Vector3();this.velocity=new THREE.Vector3();this.rotation=new THREE.Quaternion();
 }
 update(sim,dt,quality){
  this.time+=Math.max(0,dt);const full=shotgunPressurized(sim);
  this.shake+=(Number(full)*.085-this.shake)*(1-Math.exp(-14*dt));
  if(full&&this.time>=this.next){
   this.next=this.time+({potato:.18,performance:.13,balanced:.08,quality:.055,extreme:.055}[quality]||.08);
   this.gun.updateWorldMatrix(true,false);this.gun.getWorldQuaternion(this.rotation);
   for(const side of [-1,1]){
    this.origin.set(side*.15,.025,.035);this.gun.localToWorld(this.origin);
    this.velocity.set(side*(1.1+Math.random()*.35),.35,-.08).applyQuaternion(this.rotation);
    this.puffs.push({x:this.origin.x,y:this.origin.y,z:this.origin.z,vx:this.velocity.x,vy:this.velocity.y,vz:this.velocity.z,born:this.time,side});
   }
  }
  this.puffs=this.puffs.filter(p=>this.time-p.born<.55).slice(-32);
  let i=0;for(const p of this.puffs){
   const age=this.time-p.born,progress=age/.55;
   this.dummy.position.set(p.x+p.vx*age,p.y+p.vy*age+age*age*.7,p.z+p.vz*age);
   this.dummy.rotation.set(age*2,p.born*7,p.side*age);this.dummy.scale.set(.7+age*3,1+age*3,.7+age*3);this.dummy.updateMatrix();
   this.mesh.setMatrixAt(i,this.dummy.matrix);this.mesh.geometry.attributes.instanceFade.setX(i++,(1-progress)**2);
  }
  this.mesh.count=i;this.mesh.instanceMatrix.needsUpdate=true;this.mesh.geometry.attributes.instanceFade.needsUpdate=true;
 }
 clear(){this.puffs=[];this.mesh.count=0;this.shake=0;this.time=this.next=0;}
}
