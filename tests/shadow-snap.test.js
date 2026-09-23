import test from 'node:test';
import assert from 'node:assert/strict';
import {lightBasis,snapShadowFocus} from '../src/shadow-snap.js';

const SUN={x:24,y:-40,z:18};           // from the sun toward its target
const dot=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z;
const texel=(span,size)=>span/size;

test('the light basis is orthonormal and square to the light',()=>{
 const {x,y}=lightBasis(SUN);
 const len=Math.hypot(SUN.x,SUN.y,SUN.z),d={x:SUN.x/len,y:SUN.y/len,z:SUN.z/len};
 assert.ok(Math.abs(dot(x,x)-1)<1e-12&&Math.abs(dot(y,y)-1)<1e-12,'unit axes');
 assert.ok(Math.abs(dot(x,y))<1e-12,'perpendicular to each other');
 assert.ok(Math.abs(dot(x,d))<1e-12&&Math.abs(dot(y,d))<1e-12,'both across the light, not along it');
});

test('a snapped focus lands exactly on the texel grid, never more than a texel away',()=>{
 const basis=lightBasis(SUN);
 for(const [span,size] of [[42,512],[42,1024],[42,2048]]){
  const tx=texel(42,size),ty=texel(30,size);
  for(let i=0;i<500;i++){
   const f={x:(Math.random()-.5)*300,y:0,z:(Math.random()-.5)*300};
   const s=snapShadowFocus(f,basis,tx,ty);
   const a=dot(s,basis.x)/tx,b=dot(s,basis.y)/ty;
   assert.ok(Math.abs(a-Math.round(a))<1e-6&&Math.abs(b-Math.round(b))<1e-6,'on the grid');
   assert.ok(Math.hypot(s.x-f.x,s.y-f.y,s.z-f.z)<=Math.hypot(tx,ty)/2+1e-9,'within half a texel diagonal');
  }
 }
});

test('small camera drift no longer moves the shadow map at all',()=>{
 // This is the shimmer: a smoothed focus creeping a few millimetres per frame.
 const basis=lightBasis(SUN),tx=42/1024,ty=30/1024;
 const start=snapShadowFocus({x:10.013,y:0,z:-4.2},basis,tx,ty);
 let moved=0;
 for(let i=1;i<=20;i++){
  const s=snapShadowFocus({x:10.013+i*.0004,y:0,z:-4.2+i*.0003},basis,tx,ty);
  // What decides where edges land is the position across the map; sliding
  // along the light's own direction changes nothing on it.
  const across=p=>[dot(p,basis.x),dot(p,basis.y)];
  const [a0,b0]=across(start),[a1,b1]=across(s);
  if(Math.abs(a1-a0)>1e-9||Math.abs(b1-b0)>1e-9)moved++;
 }
 assert.ok(moved<=1,`the map should hold still under sub-texel drift, moved ${moved} of 20 times`);
});
