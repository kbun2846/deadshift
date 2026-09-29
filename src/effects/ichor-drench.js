import * as THREE from 'three';
// Paint the existing avatar vertices: no shells, lights or extra draw calls.
// Geometry/material copies belong to this avatar, never the shared gun/skin.
export class IchorDrench {
 constructor(body,arms=null){this.body=body;this.arms=arms;this.parts=[];this.stage=0;}
 set(level){const stage=Math.ceil(Math.max(0,Math.min(1,level))*8);if(stage===this.stage)return;
  if(!stage){this.clear();return;}
  if(!this.parts.length){const meshes=this.body.children.filter(o=>o.isMesh);for(const c of this.body.children)if(!c.isMesh&&c.userData.skin)c.traverse(o=>{if(o.isMesh&&!o.userData.fleck)meshes.push(o);});this.arms?.traverse(o=>{if(o.isMesh)meshes.push(o);});
   for(const mesh of meshes){if(Array.isArray(mesh.material)||mesh.material.transparent)continue;const original=mesh.geometry,material=mesh.material,geometry=original.clone(),own=material.clone(),source=original.getAttribute('color'),position=original.getAttribute('position');
    const colors=new Float32Array(position.count*3),base=new Float32Array(colors.length);for(let i=0;i<position.count;i++)for(let j=0;j<3;j++)base[i*3+j]=(source?source.array[i*source.itemSize+j]:1)*[material.color.r,material.color.g,material.color.b][j];
    geometry.userData.ichorDrench=true;geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));own.vertexColors=true;own.color.set('#ffffff');mesh.geometry=geometry;mesh.material=own;this.parts.push({mesh,original,material,geometry,own,base});
   }
  }
  const red=new THREE.Color('#9c202d'),deep=new THREE.Color('#641521'),color=new THREE.Color();
  for(const p of this.parts){const a=p.geometry.getAttribute('color'),pos=p.geometry.getAttribute('position');for(let i=0;i<a.count;i++){
   const patch=.5+.5*Math.sin(pos.getX(i)*29+pos.getY(i)*17+pos.getZ(i)*23),mix=Math.min(.96,(stage/8)*(.77+patch*.22));color.copy(deep).lerp(red,patch);
   a.setXYZ(i,p.base[i*3]*(1-mix)+color.r*mix,p.base[i*3+1]*(1-mix)+color.g*mix,p.base[i*3+2]*(1-mix)+color.b*mix);
  }a.needsUpdate=true;
   // (A figure's white glow, render/player-figure.js, fades as the blood covers it.)
   if(p.material.emissiveIntensity)p.own.emissiveIntensity=p.material.emissiveIntensity*(1-.9*stage/8);}this.stage=stage;
 }
 clear(){for(const p of this.parts){p.mesh.geometry=p.original;p.mesh.material=p.material;p.geometry.dispose();p.own.dispose();}this.parts=[];this.stage=0;}
}
