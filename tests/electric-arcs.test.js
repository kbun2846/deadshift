import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {ElectricEffects,ARC_DETAIL} from '../src/electric-effects.js';

const drawn=fx=>({lines:fx.arcs.lines.geometry.drawRange.count/48,forks:fx.arcs.forks.geometry.drawRange.count/24,
 ribbons:fx.arcs.ribbons.geometry.drawRange.count/144,glows:fx.arcs.glows.count});

test('every live arc is drawn, through four shared objects',()=>{
 // Arcs used to be four objects each, and recycled ones drew only their glow.
 const scene=new THREE.Scene(),fx=new ElectricEffects(scene);fx.setQuality('balanced');
 const before=scene.children.length;
 for(let i=0;i<150;i++)fx.bolt({x:0,z:0},{x:Math.cos(i),z:Math.sin(i)},.5);
 assert.equal(scene.children.length,before,'no objects added per arc');
 fx.update(1/60);
 assert.deepEqual(drawn(fx),{lines:150,forks:150,ribbons:150,glows:150});
 for(let i=0;i<60;i++)fx.update(1/60);
 assert.deepEqual(drawn(fx),{lines:0,forks:0,ribbons:0,glows:0},'finished arcs stop drawing');
 for(let i=0;i<5;i++)fx.bolt({x:0,z:0},{x:1,z:0},.5);
 fx.update(1/60);
 assert.equal(drawn(fx).lines,5,'later arcs draw in full, not just their glow');
 assert.equal(drawn(fx).ribbons,5);
});

test('the low presets shed detail and the high ones add it',()=>{
 const counts={};
 for(const preset of ['potato','performance','balanced','quality']){
  const fx=new ElectricEffects(new THREE.Scene());fx.setQuality(preset);
  fx.bolt({x:0,z:0},{x:2,z:0},.5);fx.update(1/60);
  const d=drawn(fx);counts[preset]=d;
  assert.equal(d.lines,1,`${preset} always draws the core line`);
  assert.equal(d.glows,1,`${preset} always draws the glow`);
 }
 assert.equal(counts.potato.forks,0);assert.equal(counts.potato.ribbons,0);
 assert.equal(counts.performance.ribbons,0);assert.equal(counts.performance.forks,1);
 assert.equal(counts.balanced.ribbons,1);assert.equal(counts.quality.ribbons,1);
 assert.ok(ARC_DETAIL.potato.scatter<ARC_DETAIL.performance.scatter&&ARC_DETAIL.performance.scatter<ARC_DETAIL.balanced.scatter
  &&ARC_DETAIL.balanced.scatter<ARC_DETAIL.quality.scatter,'more arcs per pulse the higher the preset');
 assert.ok(ARC_DETAIL.quality.strays>ARC_DETAIL.balanced.strays&&ARC_DETAIL.potato.strays===0);
});

test('a recoloured arc keeps its colour to itself',()=>{
 const fx=new ElectricEffects(new THREE.Scene());fx.setQuality('balanced');
 const plain=fx.bolt({x:0,z:0},{x:1,z:0},.5);
 fx.event({type:'sprayArc',firing:false,paths:[{a:{x:0,z:0},b:{x:2,z:0},energy:1}]});
 fx.update(1/60);
 const col=fx.arcs.lines.geometry.attributes.color.array;
 const first=[col[0],col[1],col[2]].map(v=>+v.toFixed(3)),second=[col[48*4],col[48*4+1],col[48*4+2]].map(v=>+v.toFixed(3));
 const expect=hex=>{const c=new THREE.Color(hex);return [c.r,c.g,c.b].map(v=>+v.toFixed(3));};
 assert.deepEqual(first,expect('#d7f3ff'),'the plain arc keeps the default core colour');
 assert.deepEqual(second,expect('#ffffff'),'the full-energy spray arc is white');
});

test('a pulse leaves the shared shapes intact when it finishes',()=>{
 const fx=new ElectricEffects(new THREE.Scene());fx.setQuality('quality');
 fx.event({type:'hexPulse',strands:[],nodes:[{x:0,z:0,power:{radius:1.5}},{x:3,z:0,power:{radius:1.5}}],radius:1.5});
 const parts=fx.pulseParts();
 assert.ok(parts.length>=4);
 const geometry=parts[0].geometry;let disposed=false;geometry.addEventListener('dispose',()=>{disposed=true;});
 for(let i=0;i<90;i++)fx.update(1/60);
 assert.equal(fx.pulseParts().length,0,'the pulse has finished');
 assert.equal(disposed,false,'its geometry is shared and must survive');
});

test('a short arc is seen at full strength even on a slow frame',()=>{
 // Spray arcs live 85 ms. At 10 fps the old age-then-draw order drew them
 // already fully faded, so the whole stream was invisible on weak devices.
 const fx=new ElectricEffects(new THREE.Scene());fx.setQuality('potato');
 fx.bolt({x:0,z:0},{x:3,z:0},.085);fx.update(.1);
 assert.equal(fx.arcs.lines.geometry.drawRange.count,48);
 assert.equal(fx.arcs.lines.geometry.attributes.color.array[3],1,'first frame at full alpha');
 fx.update(.1);
 assert.equal(fx.arcs.lines.geometry.drawRange.count,0,'and gone the frame after');
});
