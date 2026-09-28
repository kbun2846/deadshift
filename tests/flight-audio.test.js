import test from 'node:test';
import assert from 'node:assert/strict';
import {Soundscape} from '../src/audio.js';
const param=()=>({value:0,setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){},cancelAndHoldAtTime(){}});
function fixture(){
 const sources=[];const node=()=>({gain:param(),frequency:param(),Q:param(),connect(){},disconnect(){},start(t){this.startAt=t;},stop(t){this.stopAt=t;}});
 const sound=new Soundscape();sound.context={currentTime:2,state:'running',createGain:node,createBiquadFilter:node,createOscillator(){const n=node();sources.push(n);return n;},createBufferSource(){const n=node();sources.push(n);return n;}};sound.master=node();sound.impactBuffer={};return {sound,sources};
}
test('one flight voice persists until the final orb lands and reset stops outstanding flights',()=>{
 const {sound,sources}=fixture();sound.startFlight({duration:1,paths:[{id:1},{id:2}]});assert.equal(sound.flights.size,1);
 sound.event({type:'trailEnd',id:1});assert.equal([...sound.flights][0].stopped,false);
 sound.event({type:'trailEnd',id:2});assert.ok(sources.every(s=>s.stopAt===2.03));
 sources[0].onended();assert.equal(sound.flights.size,0);
 sound.startFlight({duration:2,paths:[{id:3}]});sound.clearFlights();assert.equal([...sound.flights][0].stopped,true);
});
test('flight audio is not created before audio is ready or while muted',()=>{
 const {sound}=fixture();sound.enabled=false;sound.startFlight({paths:[{id:1}]});assert.equal(sound.flights.size,0);
 sound.enabled=true;sound.context.state='suspended';sound.startFlight({paths:[{id:2}]});assert.equal(sound.flights.size,0);
});

test('a curse click has a short strike and a low hollow tail, without a half-second damage click',()=>{
 const {sound,sources}=fixture();sound.event({type:'omenCurseBeat'});
 assert.equal(sources.length,5);assert.ok(sources.every(s=>s.startAt===2&&s.stopAt<2.4));
 assert.equal(sources.filter(s=>s.buffer===sound.impactBuffer).length,1);
 assert.equal(sources.filter(s=>s.type==='sine').length,3);
 sound.event({type:'hit',damageType:'omenCurse'});assert.equal(sources.length,5);
 sound.event({type:'omenMark'});assert.equal(sources.length,10,'the curse landing has the same hollow click');
 assert.ok(Soundscape.WEAPON_EVENTS.has('omenCurseBeat'),'uses the weapon volume channel');
});

test('curse clicks respect mute, pause and hearing distance',()=>{
 const {sound,sources}=fixture();sound.event({type:'omenCurseBeat'},0);assert.equal(sources.length,0);
 sound.enabled=false;sound.event({type:'omenCurseBeat'});assert.equal(sources.length,0);
 sound.enabled=true;sound.context.state='suspended';sound.event({type:'omenCurseBeat'});assert.equal(sources.length,0);
 sound.context=null;sound.event({type:'omenCurseBeat'});assert.equal(sources.length,0);
});
test('Nominal report is short, unpitched, and respects mute and pause',()=>{
 const {sound,sources}=fixture();sound.rifleShot();assert.equal(sources.length,2);
 assert.ok(sources.every(source=>source.buffer===sound.impactBuffer&&source.stopAt<=2.12));
 sound.enabled=false;sound.rifleShot();assert.equal(sources.length,2);
 sound.enabled=true;sound.context.state='suspended';sound.rifleShot();assert.equal(sources.length,2);
});

test('each health-loss event starts its short cue immediately with the damage popup',()=>{
 const {sound,sources}=fixture();sound.event({type:'playerDamage',damage:100});
 assert.equal(sources.length,2);assert.ok(sources.every(source=>source.startAt===2&&source.stopAt<=2.09));
 sound.context.currentTime=2.01;sound.event({type:'playerDamage',damage:20});
 assert.equal(sources.length,4);assert.ok(sources.slice(2).every(source=>source.startAt===2.01));
 sound.event({type:'playerDamage',damage:0});assert.equal(sources.length,4);
});
test('death cue starts on death itself and finishes before the delayed menu',()=>{
 const {sound,sources}=fixture();sound.event({type:'playerDeath'});
 assert.equal(sources.length,5);assert.equal(Math.min(...sources.map(source=>source.startAt)),2);
 assert.ok(Math.max(...sources.map(source=>source.stopAt))>2.2);
 assert.ok(sources.every(source=>source.stopAt<2.25));
});
test('health and death cues respect mute, pause, and audio not being started',()=>{
 const {sound,sources}=fixture();
 for(const state of ['muted','paused','not-started']){
  if(state==='muted')sound.enabled=false;
  if(state==='paused'){sound.enabled=true;sound.context.state='suspended';}
  if(state==='not-started')sound.context=null;
  sound.event({type:'playerDamage',damage:100});sound.event({type:'playerDeath'});
 }
 assert.equal(sources.length,0);
});

test('Ichor uses a steel scrape with a longer higher tail as blood rises, and wet kills stay human-only',t=>{
 const {sound}=fixture(),calls=[];for(const name of ['tone','noise','impact'])t.mock.method(sound,name,(...args)=>calls.push({name,args}));
 sound.event({type:'ichorSwing',power:0});const dry=calls.splice(0);sound.event({type:'ichorSwing',power:1});const wet=calls.splice(0);const tones=wet.filter(c=>c.name==='tone');assert.ok(tones.every(c=>c.args[1]/c.args[0]>.9));assert.ok(wet[0].args[0]>dry[0].args[0]);assert.ok(tones[0].args[0]>dry.find(c=>c.name==='tone').args[0]);
 const count=e=>{calls.length=0;sound.event(e);return calls.length;};const e={type:'kill',targetKind:'player',damageType:'ichorFrenzy',bloodLevel:1};assert.ok(count(e)>count({...e,bloodLevel:0}));assert.equal(count({...e,targetKind:'robot'}),count({...e,targetKind:'robot',bloodLevel:0}));
});
test('Ichor deflections have a contact strike and metal ring, obey mute and never run before audio starts',()=>{
 const {sound,sources}=fixture();sound.noiseBuffer={duration:1};sound.event({type:'ichorDeflect'});assert.equal(sources.length,5);assert.ok(sources.some(s=>s.buffer===sound.impactBuffer));assert.ok(sources.some(s=>s.stopAt>=2.2));sound.enabled=false;sound.event({type:'ichorDeflect'});assert.equal(sources.length,5);sound.enabled=true;sound.context=null;sound.event({type:'ichorDeflect'});assert.equal(sources.length,5);
});
