import test from 'node:test';
import assert from 'node:assert/strict';
import {createOutgoingFeedback} from '../src/outgoing-feedback.js';
import {Simulation} from '../src/simulation.js';
import {Soundscape} from '../src/audio.js';
const make=()=>new Simulation({width:40,depth:40,spawn:{x:0,z:0},buildings:[],fences:[],props:[],targets:[]});
test('one-shot kill distinguishes a fresh lethal attack from follow-up or sustained damage',()=>{
 const s=make(),target=()=>({id:'enemy',x:2,z:0,hp:500,maxHp:500});
 const a=target();s.hit(a,{damage:500,volley:1});assert.equal(s.events.find(e=>e.type==='kill').oneShot,true);
 s.events=[];const b=target();s.hit(b,{damage:200,volley:2});s.hit(b,{damage:300,volley:3});assert.equal(s.events.find(e=>e.type==='kill').oneShot,false);
 s.events=[];const c=target();s.hit(c,{damage:200,volley:4});s.time+=.05;s.hit(c,{damage:300,volley:4});assert.equal(s.events.find(e=>e.type==='kill').oneShot,true);
 s.events=[];const d=target();s.hit(d,{damage:200,volley:5});s.time+=.2;s.hit(d,{damage:300,volley:5});assert.equal(s.events.find(e=>e.type==='kill').oneShot,false);
});
test('outgoing totals accumulate per entity, roll prior damage into a subtotal before the latest addition, refresh and stay anchored',()=>{
 const previous=globalThis.document;const element=()=>({children:[],style:{},append(n){this.children.push(n);},remove(){this.removed=true;}});globalThis.document={createElement:element};
 try{const parent=element(),f=createOutgoingFeedback(parent),sim={time:1,canSeeEntity:()=>true},view={screenPoint:(x,z)=>({x:x*10,y:z*10})};
 f.add({id:'a',maxHp:500,volley:1,x:10,z:20,damage:100,hp:400},1);f.update(sim,view);const n=parent.children[0].children[0],total=n.children[0],addition=n.children[1];assert.equal(total.textContent,100);assert.equal(addition.style.display,'none');assert.equal(n.style.color,'#80caff');const left=n.style.left;
 sim.time=1.05;f.add({id:'a',maxHp:500,volley:1,x:99,z:99,damage:270,hp:130},1.05);f.update(sim,view);assert.equal(total.textContent,370);assert.equal(addition.style.display,'none');assert.equal(n.style.color,'#80caff');assert.equal(n.style.left,left);
 sim.time=1.2;f.add({id:'a',maxHp:500,volley:2,x:12,z:20,damage:20,hp:110},1.2);f.update(sim,view);assert.equal(parent.children[0].children.length,1);assert.equal(total.textContent,390);assert.equal(n.style.color,'#84edb0');assert.equal(addition.children[0].textContent,370);assert.equal(addition.children[1].textContent,'+20');assert.equal(n.style.left,left);
 sim.time=1.25;f.add({id:'a',maxHp:500,volley:2,x:12,z:20,damage:10,hp:100},1.25);f.update(sim,view);assert.equal(total.textContent,400);assert.equal(addition.children[1].textContent,'+30');
 sim.time=1.8;f.add({id:'a',maxHp:500,volley:3,x:15,z:20,damage:40,hp:60},1.8);f.update(sim,view);
 assert.equal(total.textContent,440);assert.equal(addition.children[0].textContent,400);assert.equal(addition.children[1].textContent,'+40');assert.equal(addition.children.length,2);
 sim.time=2.8;f.update(sim,view);assert.ok(addition.style.opacity>0&&addition.style.opacity<1);assert.equal(n.style.opacity,1);
 sim.time=3.1;f.update(sim,view);assert.equal(addition.style.display,'none');assert.equal(total.textContent,440);assert.equal(n.style.opacity,1);
 sim.time=3.6;f.add({id:'a',maxHp:500,volley:3,x:15,z:20,damage:50,hp:50},3.6);f.update(sim,view);assert.equal(total.textContent,490);assert.equal(addition.children[0].textContent,440);assert.equal(addition.children[1].textContent,'+50');assert.equal(n.style.opacity,1);assert.equal(n.style.left,left);
 f.add({id:'b',volley:3,x:15,z:20,damage:70,hp:300},3.6);f.update(sim,view);assert.equal(parent.children[0].children.length,2);assert.equal(parent.children[0].children[1].children[0].textContent,70);
 sim.time=6.11;f.add({id:'a',maxHp:500,volley:4,x:20,z:20,damage:80,hp:420},6.11);f.update(sim,view);assert.equal(n.removed,true);assert.equal(parent.children[0].children[2].children[0].textContent,80);
 sim.time=0;f.update(sim,view);assert.equal(parent.children[0].children[2].removed,true);
 }finally{globalThis.document=previous;}
});
test('green feedback uses strictly below 25 percent of each entity maximum health',()=>{
 const previous=globalThis.document,element=()=>({children:[],style:{},append(n){this.children.push(n);},remove(){}});
 globalThis.document={createElement:element};
 try{
  for(const maxHp of [75,100,400,500,1000]){
   const sim=make(),parent=element(),feedback=createOutgoingFeedback(parent),target={id:'enemy',x:2,z:0,hp:maxHp,maxHp};
   const view={screenPoint:()=>({x:20,y:20})};
   sim.hit(target,{damage:maxHp*.75,volley:1});const e=sim.events.find(e=>e.type==='outgoingDamage');assert.equal(e.maxHp,maxHp);
   feedback.add(e,sim.time);feedback.update(sim,view);const node=parent.children[0].children[0];assert.equal(node.style.color,'#80caff');
   sim.time+=.2;sim.events=[];sim.hit(target,{damage:.1,volley:2});feedback.add(sim.events.find(e=>e.type==='outgoingDamage'),sim.time);feedback.update(sim,view);assert.equal(node.style.color,'#84edb0');
  }
 }finally{globalThis.document=previous;}
});

test('one-shot sound extends the normal kill chime and hit ding remains restrained',()=>{
 const sound=new Soundscape(),tones=[];sound.tone=(...args)=>tones.push(args);sound.impact=()=>{};sound.noise=()=>{};
 sound.event({type:'kill'});const ordinary=tones.length;tones.length=0;sound.event({type:'kill',oneShot:true});assert.ok(tones.length>ordinary);tones.length=0;sound.event({type:'outgoingDamage'});assert.equal(tones.length,2);assert.ok(tones.every(t=>t[3]<.05));
});
test('outgoing numbers report the health actually lost, and never show for destructible props',()=>{
 const s=make(),t={id:'target',hp:100,maxHp:100,x:2,z:0};s.hit(t,{damage:300,volley:9});assert.equal(t.hp,0);
 // Overkill is clamped: the number on screen is never larger than the health
 // the target had to give, which is the promise the HUD makes.
 assert.equal(s.events.find(e=>e.type==='outgoingDamage').damage,100);
 s.events=[];const u={id:'u',hp:100,maxHp:100,x:2,z:0};s.hit(u,{damage:40,volley:10});
 assert.equal(s.events.find(e=>e.type==='outgoingDamage').damage,40,'a non-fatal hit still reports in full');
 for(const type of ['crate','barrel','cactus']){
  s.events=[];const prop={id:type,hp:20,x:3,z:0,type};
  s.hitProp(prop,{damage:5,x:3,z:0});assert.equal(prop.hp,15);
  s.hitProp(prop,{damage:100,x:3,z:0});assert.equal(prop.hp,0);
  assert.equal(s.events.some(e=>e.type==='outgoingDamage'),false);
  assert.ok(s.events.some(e=>e.type==='propHit'));assert.ok(s.events.some(e=>e.type==='propBreak'));
 }
});
