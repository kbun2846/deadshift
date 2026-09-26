import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {deadwater,buildingPoint,maps} from '../src/maps.js';
import {interiorPolygons,projectVisionPolygon,roomBox} from '../src/render/vision-polygons.js';
import {interiorCameraHeight,CAMERA_TILT} from '../src/render/camera-framing.js';
const contains=(polygon,p)=>{
  let yes=false;
  for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
    const a=polygon[i],b=polygon[j];
    if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)yes=!yes;
  }
  return yes;
};
test('moving near every room corner never mirrors vision across the camera',()=>{
  for(const room of deadwater.buildings) for(const aspect of [.7,1.8]) {
    const camera=new THREE.PerspectiveCamera(40,aspect,.1,180),h=interiorCameraHeight(room,aspect);
    camera.position.set(room.x,h,room.z+h*CAMERA_TILT);camera.lookAt(room.x,0,room.z);camera.updateMatrixWorld();
    for(const x of [-room.w/2+.21,0,room.w/2-.21])for(const z of [-room.d/2+.21,0,room.d/2-.21]){
      const polygons=interiorPolygons(room,buildingPoint(room,x,z));
      const projected=polygons.map(p=>projectVisionPolygon(p,camera,1000,1000));
      assert.ok(projected.flat().every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=-.001&&p.x<=1000.001&&p.y>=-.001&&p.y<=1000.001));
      for(let sx=25;sx<1000;sx+=95)for(let sy=25;sy<1000;sy+=95){
        const ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2(sx/500-1,1-sy/500),camera);
        const world=ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0),-.7),new THREE.Vector3());
        if(!world)continue;
        const expected=polygons.some(poly=>contains(poly.map(p=>({x:p.x,y:p.z})),{x:world.x,y:world.z}));
        assert.equal(projected.some(poly=>contains(poly,{x:sx,y:sy})),expected,room.id+' '+x+','+z);
      }
    }
  }
});
test('edge-on doorways produce no degenerate visibility polygon',()=>{
  const room={x:0,z:0,w:8,d:8,doorWidth:2.6,doors:['front']};
  assert.equal(interiorPolygons(room,{x:0,z:4}).length,1);
});
test('the shroud never greys the room you are in: its box, floor to eaves, walls and trim, is clear on screen',()=>{
  // (Stage 5 review, owner: the room's clear patch was laid at .7 m, so its upper
  // walls, window heads and pulpit showed grey patches between the openings' cones.)
  const rooms=[...deadwater.buildings,...Object.values(maps).filter(m=>m.id!=='deadwater').flatMap(m=>m.buildings||[])].filter(b=>!b.open);
  assert.ok(rooms.length>20);
  for(const room of rooms)for(const aspect of [.7,1.8]){
    const camera=new THREE.PerspectiveCamera(40,aspect,.1,180),h=interiorCameraHeight(room,aspect),base=room.baseY||0,top=room.height||3;
    camera.position.set(room.x,base+h,room.z+h*CAMERA_TILT);camera.lookAt(room.x,base,room.z);camera.updateMatrixWorld();
    const faces=roomBox(room).map(p=>projectVisionPolygon(p,camera,1000,1000));
    const onScreen=(x,y,z)=>{const v=new THREE.Vector3(x,y,z).project(camera);return {x:(v.x*.5+.5)*1000,y:(.5-v.y*.5)*1000,in:Math.abs(v.x)<1&&Math.abs(v.y)<1&&v.z<1};};
    const out=.19+.08; // a wall's outer face and its trim
    for(const y of [0,.7,top/2,top-.05])for(let k=-.5;k<=.5;k+=.125){
      for(const [lx,lz] of [[k*room.w,room.d/2+out],[k*room.w,-room.d/2-out],[room.w/2+out,k*room.d],[-room.w/2-out,k*room.d]]){
        const w=buildingPoint(room,lx,lz),p=onScreen(w.x,base+y,w.z);
        if(p.in)assert.ok(faces.some(f=>contains(f,p)),`${room.id} ${lx.toFixed(2)},${lz.toFixed(2)} at ${y}`);
      }
    }
  }
});
