import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {snapCameraFocus,CAMERA_TILT,OUTDOOR_CAMERA_HEIGHT} from '../src/render/camera-framing.js';

test('the camera moves the ground by whole screen pixels, so thin lines stop shimmering',()=>{
 const height=OUTDOOR_CAMERA_HEIGHT,fov=40,w=1280,h=720;
 const camera=new THREE.PerspectiveCamera(fov,w/h,2,200);
 const screen=(focus,point)=>{
  camera.position.set(focus.x,height,focus.z+height*CAMERA_TILT);camera.lookAt(focus.x,0,focus.z);camera.updateMatrixWorld();
  const v=new THREE.Vector3(point.x,0,point.z).project(camera);return {x:(v.x+1)/2*w,y:(1-v.y)/2*h};
 };
 // Exact at the ground under the view centre; perspective leaves a small
 // remainder for points nearer or further than that.
 const start=snapCameraFocus(10,5,height,fov,h),point={x:start.x,z:start.z};
 for(const [x,z] of [[10.013,5.007],[10.05,4.96],[9.93,5.08]]){
  const moved=snapCameraFocus(x,z,height,fov,h),a=screen(start,point),b=screen(moved,{x:point.x,z:point.z});
  for(const d of [b.x-a.x,b.y-a.y])assert.ok(Math.abs(d-Math.round(d))<.06,`moved ${d} px, not a whole number`);
 }
 const loose=snapCameraFocus(10.013,5.007,height,fov,h);
 assert.ok(Math.hypot(loose.x-10.013,loose.z-5.007)<.08,'never more than a pixel or so from where it would have been');
});
