import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {readFileSync} from 'node:fs';
import {DustTrail,DUST_RICHNESS,FOOTFALL_PARTICLES,kickedDust,debrisDust,DEBRIS_DUST,CLUTTER_BURST,throwsDust} from '../src/dust-trail.js';

const make=quality=>{
 const scene=new THREE.Scene(),trail=new DustTrail(scene);
 trail.setQuality(quality);
 return trail;
};
const walk=(trail,steps,dt=1/60)=>{
 for(let i=0;i<steps;i++){trail.step(i*.3,0,new THREE.Color('#776044'),1,0);trail.update(dt);}
 return trail;
};

test('kicked dust is lighter than the ground it came from',()=>{
 for(const ground of ['#776044','#94764f','#68543d']){
  const base=new THREE.Color(ground),lifted=kickedDust(base);
  const luminance=c=>c.r*.2126+c.g*.7152+c.b*.0722;
  assert.ok(luminance(lifted)>luminance(base)*1.25,`${ground} lifted only to ${luminance(lifted)/luminance(base)}`);
 }
});

test('Quality lays down more dust than Balanced, and Potato none',()=>{
 assert.ok(DUST_RICHNESS.quality>DUST_RICHNESS.balanced);
 assert.ok(DUST_RICHNESS.balanced>DUST_RICHNESS.performance);
 assert.equal(DUST_RICHNESS.potato,0);
 const counts={};
 for(const tier of ['potato','performance','balanced','quality']){
  const trail=make(tier);
  // Average several walks: emission counts are fractional and probabilistic.
  let total=0;
  for(let run=0;run<40;run++){const t=make(tier);walk(t,6);total+=t.mesh.count;}
  counts[tier]=total/40;
  trail.clear();
 }
 assert.equal(counts.potato,0);
 assert.ok(counts.quality>counts.balanced,`quality ${counts.quality} vs balanced ${counts.balanced}`);
 assert.ok(counts.balanced>counts.performance);
});

test('Quality and Balanced get extra footfall particles, lower tiers do not',()=>{
 assert.ok(FOOTFALL_PARTICLES.quality>FOOTFALL_PARTICLES.balanced);
 assert.ok(FOOTFALL_PARTICLES.balanced>1);
 assert.equal(FOOTFALL_PARTICLES.performance,1);
 assert.equal(FOOTFALL_PARTICLES.potato,1);
});

test('walking dust clears itself shortly after the player stops',()=>{
 const trail=make('quality');
 walk(trail,12);
 assert.ok(trail.mesh.count>0,'should be visible while walking');
 for(let i=0;i<40;i++)trail.update(1/60);
 assert.equal(trail.mesh.count,0,'should be gone well under a second after stopping');
});

test('a dash lays a streak along the path travelled, not a single puff',()=>{
 const trail=make('quality');
 trail.dashStart();
 const color=new THREE.Color('#776044');
 // 0.24s dodge covering 3.2m, sampled every frame as the renderer does.
 for(let i=0;i<14;i++){trail.dash(i/14*3.2,0,color,1/60,1,0);trail.update(1/60);}
 const spread=trail.puffs.reduce((box,p)=>[Math.min(box[0],p.x),Math.max(box[1],p.x)],[Infinity,-Infinity]);
 assert.ok(spread[1]-spread[0]>2,`dash streak only spanned ${(spread[1]-spread[0]).toFixed(2)}m`);
 assert.ok(trail.mesh.count>trail.puffs.length*.5);
});

test('the dash streak outlives a single step but still expires',()=>{
 const trail=make('balanced');
 trail.dashStart();
 for(let i=0;i<14;i++){trail.dash(i*.2,0,new THREE.Color('#776044'),1/60,1,0);trail.update(1/60);}
 assert.ok(trail.mesh.count>0);
 for(let i=0;i<60;i++)trail.update(1/60);
 assert.equal(trail.mesh.count,0);
});

test('the pool is bounded however long the player runs',()=>{
 const trail=make('quality');
 for(let i=0;i<4000;i++){trail.step(i*.1,0,new THREE.Color('#776044'),1,0);trail.dash(i*.1,0,new THREE.Color('#776044'),1/60,1,0);trail.update(1/600);}
 assert.ok(trail.puffs.length<=trail.capacity,`pool grew to ${trail.puffs.length}`);
 assert.ok(trail.mesh.count<=trail.capacity);
});

test('Potato emits nothing at all',()=>{
 const trail=make('potato');
 walk(trail,30);
 trail.dashStart();
 for(let i=0;i<14;i++){trail.dash(i*.2,0,new THREE.Color('#776044'),1/60,1,0);trail.update(1/60);}
 assert.equal(trail.mesh.count,0);
 assert.equal(trail.mesh.visible,false);
});

test('break dust is coloured by what broke, over the ground it stood on',()=>{
 const road=new THREE.Color('#94764f'), sand=new THREE.Color('#776044');
 const hsl={};
 // A cactus throws wet pulp: the cloud must swing green, not just pale.
 const cactus=debrisDust(road,'cactus');cactus.getHSL(hsl);
 assert.ok(hsl.h>.17&&hsl.h<.35,`cactus dust hue ${hsl.h.toFixed(3)} is not green`);
 assert.ok(cactus.g>cactus.r,'cactus dust should be greener than it is red');
 // A barrel is iron and dark contents: it dirties the cloud.
 const barrel=debrisDust(road,'barrel');
 const lum=c=>c.r*.299+c.g*.587+c.b*.114;
 assert.ok(lum(barrel)<lum(road)*.85,`barrel dust ${lum(barrel).toFixed(3)} is not darker than the road`);
 assert.ok(Math.abs(barrel.r-barrel.g)<.09&&Math.abs(barrel.g-barrel.b)<.09,'barrel dust should read grey');
 // Dry pine is sawdust, so it lifts rather than darkens, and only slightly:
 // the cloud must still sit nearer the ground colour than the bare material.
 const crate=debrisDust(road,'crate');
 assert.ok(lum(crate)>lum(road),'crate dust should be paler than the road');
 const gap=(a,b)=>Math.hypot(a.r-b.r,a.g-b.g,a.b-b.b);
 const sawdust=new THREE.Color(DEBRIS_DUST.crate.color);
 assert.ok(gap(crate,road)<gap(crate,sawdust),'crate dust reads as sawdust rather than dusty ground');
 // The ground still shows through: the same prop on sand is not the same cloud.
 assert.notEqual(debrisDust(sand,'cactus').getHex(),cactus.getHex());
 // An untinted prop is left exactly as the ground gave it.
 assert.equal(debrisDust(road,'boulder'),road);
 // Every tint is a real colour with a sane weight.
 for(const [type,t] of Object.entries(DEBRIS_DUST)){
  assert.ok(/^#[0-9a-f]{6}$/i.test(t.color),type);
  assert.ok(t.weight>0&&t.weight<.7,`${type} weight ${t.weight} would bury the ground`);
 }
});

test('small clutter throws its own colour and no dust at all',()=>{
 // A pot weighs nothing and was never bedded in the ground: it bursts into
 // clay, not into a cloud.
 for(const type of ['pot','pottedPlant','brokenChair']){
  assert.equal(throwsDust(type),false,`${type} should not raise dust`);
  assert.ok(/^#[0-9a-f]{6}$/i.test(CLUTTER_BURST[type]),type);
 }
 for(const type of ['barrel','crate','cactus','hay','deadwood']) assert.equal(throwsDust(type),true,`${type} should raise dust`);
 // The clay reads as fired clay, not as pale timber.
 const clay=new THREE.Color(CLUTTER_BURST.pot),wood=new THREE.Color(CLUTTER_BURST.brokenChair);
 assert.ok(clay.r>clay.b*1.5,'pot shards should read warm and red');
 assert.ok(wood.r>wood.b&&wood.g>wood.b,'chair splinters should read as timber');
 // And the renderer actually branches on it rather than only owning the table.
 const source=readFileSync(new URL('../src/renderer.js',import.meta.url),'utf8');
 const branch=source.slice(source.indexOf("if (!throwsDust(e.propType))"),source.indexOf("if (!throwsDust(e.propType))")+420);
 assert.ok(branch.includes("'hit', shard"),'clutter gets a coloured spray');
 assert.ok(branch.includes('return;'),'and skips the dust and smoke systems entirely');
});
