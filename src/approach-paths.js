import * as THREE from 'three';
import {buildingPoint,buildingContains,mapColliders,localOpenings} from './maps.js';

export function approachPaths(map,onRoad) {
 const step=1,cols=Math.floor(map.width)+1,rows=Math.floor(map.depth)+1,total=cols*rows;
 const distance=new Int32Array(total).fill(-1),next=new Int32Array(total).fill(-1),blocked=new Uint8Array(total),queue=[];
 const point=i=>({x:i%cols-map.width/2,z:Math.floor(i/cols)-map.depth/2});
 const index=p=>Math.round(p.z+map.depth/2)*cols+Math.round(p.x+map.width/2);
 const obstacles=mapColliders(map).filter(c=>!c.buildingId);
 for(let i=0;i<total;i++){
  const p=point(i);
  blocked[i]=map.buildings.some(b=>buildingContains({...b,w:b.w+2.2,d:b.d+2.2},p))||obstacles.some(c=>Math.abs(p.x-c.x)<c.w/2+1.05&&Math.abs(p.z-c.z)<c.d/2+1.05);
  if(!blocked[i]&&onRoad(p.x,p.z)){distance[i]=0;queue.push(i);}
 }
 for(let head=0;head<queue.length;head++){
  const i=queue[head];
  for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]]){
   const x=i%cols+dx,z=Math.floor(i/cols)+dz;if(x<0||z<0||x>=cols||z>=rows)continue;
   const j=z*cols+x;if(blocked[j]||distance[j]>=0)continue;
   if(dx&&dz&&(blocked[i+dx]||blocked[i+dz*cols]))continue;
   distance[j]=distance[i]+1;next[j]=i;queue.push(j);
  }
 }
 return map.buildings.filter(b=>!b.cargo).flatMap(b=>localOpenings(b).filter(o=>o.type==='door').map(o=>{
  const horizontal=o.side==='front'||o.side==='back',sign=o.side==='back'||o.side==='left'?-1:1;
  const edge=horizontal?b.d/2:b.w/2;
  const at=t=>buildingPoint(b,horizontal?o.offset:sign*(edge+t),horizontal?sign*(edge+t):o.offset);
  const door=at(o.side==='front'?2.45:.55),anchor=at(o.side==='front'?3:1.8);
  let cursor=-1,best=Infinity;
  // A reachable anchor must have a clear connection to the actual doorstep.
  for(let dz=-3;dz<=3;dz++)for(let dx=-3;dx<=3;dx++){
    const j=index({x:anchor.x+dx,z:anchor.z+dz});
    if(j<0||j>=total||distance[j]<0)continue;
    const q=point(j),len=Math.hypot(q.x-door.x,q.z-door.z);
    let clear=true;
    for(let t=0;t<=1;t+=.1){const p={x:door.x+(q.x-door.x)*t,z:door.z+(q.z-door.z)*t};
      if(map.buildings.some(other=>buildingContains({...other,w:other.w+.3,d:other.d+.3},p))||obstacles.some(c=>Math.abs(p.x-c.x)<c.w/2+.55&&Math.abs(p.z-c.z)<c.d/2+.55)){clear=false;break;}
    }
    const cost=len+distance[j]*.08;if(clear&&cost<best){best=cost;cursor=j;}
  }
  const id=o.side==='front'?b.id:b.id+'-'+o.side;
  if(cursor<0)return {id,buildingId:b.id,side:o.side,points:[]};
  const points=[door];
  while(cursor>=0){points.push(point(cursor));cursor=next[cursor];}
  // Remove grid stair-steps only when the full-width route stays clear.
  const clearSegment=(a,b)=>{
    const length=Math.hypot(b.x-a.x,b.z-a.z),steps=Math.ceil(length/.25);
    for(let i=1;i<steps;i++){
      const p={x:a.x+(b.x-a.x)*i/steps,z:a.z+(b.z-a.z)*i/steps},j=index(p);
      if(j<0||j>=total||blocked[j])return false;
    }
    return true;
  };
  const corners=[points[0]];
  for(let i=1;i<points.length;){
    corners.push(points[i]);let end=i+1;
    while(end+1<points.length&&clearSegment(points[i],points[end+1]))end++;
    i=end;
  }
  if(corners.at(-1)!==points.at(-1))corners.push(points.at(-1));
  const rounded=[corners[0]];
  for(let i=1;i<corners.length-1;i++){
    const a=corners[i-1],b=corners[i],c=corners[i+1],ab=Math.hypot(b.x-a.x,b.z-a.z),bc=Math.hypot(c.x-b.x,c.z-b.z);
    const trim=Math.min(1.3,ab*.3,bc*.3);
    if(trim<.05){rounded.push(b);continue;}
    const entry={x:b.x+(a.x-b.x)*trim/ab,z:b.z+(a.z-b.z)*trim/ab},exit={x:b.x+(c.x-b.x)*trim/bc,z:b.z+(c.z-b.z)*trim/bc};
    if(!clearSegment(entry,exit)){rounded.push(b);continue;}
    rounded.push(entry);
    for(let n=1;n<=5;n++){const t=n/5,u=1-t;rounded.push({x:u*u*entry.x+2*u*t*b.x+t*t*exit.x,z:u*u*entry.z+2*u*t*b.z+t*t*exit.z});}
  }
  rounded.push(corners.at(-1));
  // Even spacing keeps texture strands, footprint color and tapered width continuous.
  const smooth=[rounded[0]];
  for(let i=1;i<rounded.length;i++){
    const a=rounded[i-1],b=rounded[i],steps=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/.4));
    for(let n=1;n<=steps;n++)smooth.push({x:a.x+(b.x-a.x)*n/steps,z:a.z+(b.z-a.z)*n/steps});
  }
  return {id,buildingId:b.id,side:o.side,points:smooth};
 }));
}
export function pathRadius(i,n){const t=i/Math.max(1,n-1);return .6+.42*Math.exp(-t*14)+.85*Math.pow(t,9)+.04*Math.sin(i*.71);}
export function onApproach(paths,x,z,padding=0){return paths.some(({points})=>points.some((p,i)=>Math.hypot(x-p.x,z-p.z)<pathRadius(i,points.length)+padding));}
export function makeApproaches(view){
 const map=view.map;
 view.approachPaths=approachPaths(map,(x,z)=>{const r=view.roadEdges(z);return x>r.left&&x<r.right||view.onSideRoad(x,z);});
 const canvas=document.createElement('canvas');canvas.width=canvas.height=2048;
 const ctx=canvas.getContext('2d'),sx=2048/map.width,sz=2048/map.depth;
 ctx.fillStyle='#000';ctx.fillRect(0,0,2048,2048);
 ctx.scale(sx,sz);ctx.translate(map.width/2,map.depth/2);
 // Main roads, spurs and footpaths share one union mask and one depth surface.
 const polygon=points=>{ctx.beginPath();points.forEach(([x,z],i)=>i?ctx.lineTo(x,z):ctx.moveTo(x,z));ctx.closePath();ctx.fillStyle='#fff';ctx.fill();};
 polygon([...view.roadProfile.map(p=>[p.left,p.z]),...view.roadProfile.slice().reverse().map(p=>[p.right,p.z])]);
 for(const branch of map.sideRoads||[])polygon(branch.points);
 if(view.farmRoadPoints)polygon(view.farmRoadPoints);
 // All branches share a single mask; overlapping joins are a union, never stacked meshes.
 for(const {points} of view.approachPaths)for(let i=0;i<points.length;i++){
  const p=points[i],q=points[Math.min(i+1,points.length-1)],r=pathRadius(i,points.length);
  ctx.beginPath();ctx.moveTo(p.x,p.z);ctx.lineTo(q.x,q.z);ctx.lineWidth=r*2;ctx.lineCap='round';ctx.strokeStyle='#fff';ctx.stroke();
 }
 // Separate the route mask from the surface texture: dirt grain and relief now
 // use the same world-space scale and graphics settings as the original roads.
 const texture=new THREE.CanvasTexture(canvas);texture.channel=1;
 texture.anisotropy=Math.min(8,view.renderer.capabilities.getMaxAnisotropy());
 // Cutout coverage writes real depth, so the main road cleanly wins at joins
 // instead of competing with a sorted transparent map-sized plane.
 const material=new THREE.MeshStandardMaterial({color:new THREE.Color(map.palette.road),alphaMap:texture,depthWrite:true,roughness:1,alphaTest:.5,alphaToCoverage:true});
 const geometry=new THREE.PlaneGeometry(map.width,map.depth);geometry.setAttribute('uv1',geometry.attributes.uv.clone());geometry.rotateX(-Math.PI/2);
 const mesh=new THREE.Mesh(geometry,material);mesh.position.y=.025;mesh.receiveShadow=true;mesh.userData.maskedGround=true;view.terrainUV(mesh);view.static.add(mesh);
}
