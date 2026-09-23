import * as THREE from 'three';
import {buildingPoint,buildingContains,mapColliders,localOpenings} from './maps.js';
import {boxIndex} from './box-index.js';

export function approachPaths(map,onRoad) {
 const step=1,cols=Math.floor(map.width)+1,rows=Math.floor(map.depth)+1,total=cols*rows;
 const distance=new Int32Array(total).fill(-1),next=new Int32Array(total).fill(-1),blocked=new Uint8Array(total),queue=[];
 const point=i=>({x:i%cols-map.width/2,z:Math.floor(i/cols)-map.depth/2});
 const index=p=>Math.round(p.z+map.depth/2)*cols+Math.round(p.x+map.width/2);
 const obstacles=boxIndex(mapColliders(map).filter(c=>!c.buildingId));
 // Padded footprints built once: spreading a fresh copy of every building for
 // every grid cell was hundreds of thousands of throwaway objects per load.
 const pad=(b,e)=>({...b,w:b.w+e,d:b.d+e,r:Math.hypot(b.w+e,b.d+e)/2}),near=(b,p)=>Math.abs(p.x-b.x)<b.r&&Math.abs(p.z-b.z)<b.r&&buildingContains(b,p);
 const wide=map.buildings.map(b=>pad(b,2.2)),snug=map.buildings.map(b=>pad(b,.3));
 for(let i=0;i<total;i++){
  const p=point(i);
  blocked[i]=wide.some(b=>near(b,p))||obstacles.some(p.x,p.z,1.05,c=>Math.abs(p.x-c.x)<c.w/2+1.05&&Math.abs(p.z-c.z)<c.d/2+1.05);
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
      if(snug.some(other=>near(other,p))||obstacles.some(p.x,p.z,.55,c=>Math.abs(p.x-c.x)<c.w/2+.55&&Math.abs(p.z-c.z)<c.d/2+.55)){clear=false;break;}
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
// Answering "is this point on a footpath?" used to test every resampled point
// of every path on the map, recomputing each one's radius with exp, pow and sin
// as it went. Terrain generation asks it tens of thousands of times while it
// scatters grass, stones and sand marks, which made it well over a third of the
// whole load. The points are bucketed into a coarse grid once per set of paths,
// radius precomputed, so each query only visits the handful of points near it.
// The answer is identical: any point that could pass the distance test lies
// within maxRadius + padding, and every bucket overlapping that box is checked.
const APPROACH_CELL=2;
const approachIndexes=new WeakMap();
const cellKey=(cx,cz)=>(cx+32768)*65536+(cz+32768);
function approachIndex(paths){
 let index=approachIndexes.get(paths);
 if(index)return index;
 const cells=new Map();let maxRadius=0;
 for(const {points} of paths)for(let i=0;i<points.length;i++){
  const p=points[i],r=pathRadius(i,points.length);if(r>maxRadius)maxRadius=r;
  const key=cellKey(Math.floor(p.x/APPROACH_CELL),Math.floor(p.z/APPROACH_CELL));
  let bucket=cells.get(key);if(!bucket)cells.set(key,bucket=[]);
  bucket.push(p.x,p.z,r);
 }
 index={cells,maxRadius};approachIndexes.set(paths,index);
 return index;
}
export function onApproach(paths,x,z,padding=0){
 const {cells,maxRadius}=approachIndex(paths),reach=maxRadius+padding;
 const x0=Math.floor((x-reach)/APPROACH_CELL),x1=Math.floor((x+reach)/APPROACH_CELL);
 const z0=Math.floor((z-reach)/APPROACH_CELL),z1=Math.floor((z+reach)/APPROACH_CELL);
 for(let cx=x0;cx<=x1;cx++)for(let cz=z0;cz<=z1;cz++){
  const bucket=cells.get(cellKey(cx,cz));if(!bucket)continue;
  for(let k=0;k<bucket.length;k+=3)if(Math.hypot(x-bucket[k],z-bucket[k+1])<bucket[k+2]+padding)return true;
 }
 return false;
}
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
