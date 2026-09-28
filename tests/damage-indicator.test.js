import test from 'node:test';
import assert from 'node:assert/strict';
import {createFireIndicator} from '../src/ui/fire-indicator.js';
import {createDamageIndicator, damageScreenAngle} from '../src/ui/damage-indicator.js';
import {Simulation} from '../src/simulation.js';
import {BotMatch} from '../src/bots/bot-match.js';
import {maps} from '../src/maps.js';
import {packEvent, unpackEvent} from '../src/net/protocol.js';

function fixture(t) {
 const saved = {document: globalThis.document, devicePixelRatio: globalThis.devicePixelRatio};
 t.after(() => { for (const [k,v] of Object.entries(saved)) { if (v === undefined) delete globalThis[k]; else globalThis[k] = v; } });
 const children = [], parent = {append: c => children.push(c)};
 globalThis.devicePixelRatio = 1;
 globalThis.document = {createElement() {
  const ctx = {draws: [], clears: 0, setTransform() {}, clearRect() { this.clears++; this.draws = []; }, beginPath() {},
   arc(x,y,r,start,end) { this.path = {x,y,r,start,end}; }, stroke() { this.draws.push({...this.path, width: this.lineWidth, color: this.strokeStyle}); }};
  return {width: 0, height: 0, setAttribute() {}, getContext: () => ctx, ctx};
 }};
 return {children, parent};
}

test('damage arc is immediate, red, thinner and just inside the slower pink arc on desktop and phone', t => {
 const {parent, children} = fixture(t);
 const pink = createFireIndicator(parent), red = createDamageIndicator(parent);
 const draw = (indicator, dt, w, h) => indicator.update(dt,w/2,h/2,w,h);
 for (const [w,h] of [[1280,800],[844,390],[390,844]]) {
  pink.clear(); red.clear(); pink.add(0,1); red.add(0,1);
  draw(pink,0,w,h); draw(red,0,w,h);
  assert.equal(children[0].ctx.draws.length,0,'sound eases in');
  const hits = children[1].ctx.draws;
  assert.ok(hits.length > 0,'damage appears without waiting for a rise animation');
  assert.ok(hits.every(d => d.color.startsWith('rgba(255,48,64,')));
  draw(pink,.08,w,h);
  const sounds = children[0].ctx.draws;
  assert.ok(hits.length < sounds.length,'shorter angular span');
  assert.ok(Math.max(...hits.map(d=>d.width)) < Math.max(...sounds.map(d=>d.width))*.7);
  const gap = sounds[0].r-hits[0].r;
  assert.ok(gap > 21 && gap < 27,'about 24 CSS pixels inward at every viewport size');
  assert.ok(hits.every(d => d.r-d.width/2 > 70),'no paint near the player');
 }
});

test('damage bearings coexist, repeated hits flash again, and fading/clear leave an idle canvas', t => {
 const {parent,children} = fixture(t), red=createDamageIndicator(parent),ctx=children[0].ctx;
 red.add(0,1);red.add(Math.PI,1);red.update(0,400,300,800,600);
 assert.ok(ctx.draws.some(d=>Math.cos((d.start+d.end)/2)>.9));
 assert.ok(ctx.draws.some(d=>Math.cos((d.start+d.end)/2)<-.9));
 red.update(.42,400,300,800,600);
 assert.ok(ctx.draws.length>0,'a directional hit now remains beyond the old 0.4-second limit');
 const faded = ctx.draws[1].color;
 red.add(0,1);red.update(0,400,300,800,600);
 assert.ok(ctx.draws.some(d=>d.color==='rgba(255,48,64,1.000)'));
 assert.notEqual(faded,'rgba(255,48,64,1.000)');
 red.update(.7,400,300,800,600);assert.equal(ctx.draws.length,0);
 const cleared=ctx.clears;red.update(1,400,300,800,600);assert.equal(ctx.clears,cleared,'idle canvas does no drawing');
 red.add(0,1);red.update(0,400,300,800,600);red.clear();red.update(0,400,300,800,600);assert.equal(ctx.draws.length,0);
});

test('damage projection follows the rendered player, compensates hills and rejects absent bearings', () => {
 const view={player:{position:{x:5,z:8}},gy:(x,z)=>x*3-z*2,
  screenPoint(x,z,y=.72){return{x:x*10,y:z*10-(y+this.gy(x,z))*5};}};
 assert.ok(Math.abs(damageScreenAngle({sourceDX:1,sourceDZ:0},view))<1e-6);
 assert.ok(Math.abs(damageScreenAngle({sourceDX:0,sourceDZ:1},view)-Math.PI/2)<1e-6);
 assert.equal(damageScreenAngle({},view),null);
 assert.equal(damageScreenAngle({sourceDX:NaN,sourceDZ:1},view),null);
});

test('underfoot fire has eight pulsing segments with clear gaps, even during continuous damage', t => {
 const {parent,children}=fixture(t),red=createDamageIndicator(parent),ctx=children[0].ctx;
 red.hit({damage:0},{});red.update(0,400,300,800,600);assert.equal(ctx.draws.length,0);
 red.hit({damage:5},{});red.update(0,400,300,800,600);
 assert.equal(ctx.draws.length,16,'eight arcs, each with a core and soft stroke');
 const opacity = d => Number(d.color.slice(d.color.lastIndexOf(',')+1,-1));
 const peak = opacity(ctx.draws[1]);
 assert.ok(peak>.5&&peak<.6,'visible but quieter than a direct hit');
 const step = Math.PI*2/8;
 for(const d of ctx.draws)assert.ok(d.end-d.start<step*.65,'substantial empty space between arcs');
 // 60 Hz burn ticks must refresh life without restarting the pulse phase.
 for(let i=0;i<18;i++){red.hit({damage:.5},{});red.update(.02,400,300,800,600);}
 const trough = opacity(ctx.draws[1]);assert.ok(trough<peak*.3);
 for(let i=0;i<18;i++){red.hit({damage:.5},{});red.update(.02,400,300,800,600);}
 assert.ok(opacity(ctx.draws[1])>peak*.95,'second peak still arrives under repeated damage');
 assert.equal(ctx.draws.length,16,'repeated fire never fills the gaps');
 red.update(.5,400,300,800,600);assert.equal(ctx.draws.length,0,'leaving fire fades the ring away');
 const clears=ctx.clears;red.update(1,400,300,800,600);assert.equal(ctx.clears,clears);
});

test('fire pulse leaves directional hits prominent and does not extend their lifetime', t => {
 const {parent,children}=fixture(t),red=createDamageIndicator(parent),ctx=children[0].ctx;
 red.add(0,1);red.hit({damage:1},{});red.update(0,400,300,800,600);
 assert.ok(ctx.draws.length>16);assert.equal(ctx.draws[17].color,'rgba(255,48,64,1.000)');
 for(let i=0;i<40;i++){red.hit({damage:.5},{});red.update(.02,400,300,800,600);}
 assert.equal(ctx.draws.length,16,'only the burn segments remain after the directional hit fades');
 red.clear();red.update(0,400,300,800,600);assert.equal(ctx.draws.length,0,'pause/death clears both layers');
});

test('hit events point toward incoming fire, retain lethal force, and survive network packing', () => {
 const sim=new Simulation(maps.deadwater);sim.player.hp=30;sim.drainEvents();
 sim.damagePlayer(45,'enemy',false,false,{x:3,z:4},'gunshot',{x:sim.player.x+10,z:sim.player.z});
 const events=sim.drainEvents(),hit=events.find(e=>e.type==='playerDamage'),death=events.find(e=>e.type==='playerDeath');
 assert.equal(hit.damage,30);assert.equal(hit.sourceDX,-.6);assert.equal(hit.sourceDZ,-.8);
 assert.equal(death.directionX,.6);assert.equal(death.directionZ,.8,'death still falls away from the hit');
 assert.deepEqual(unpackEvent(packEvent(hit)),hit);
});

test('force-free curse/stream damage uses the caster; rejected damage has no indicator event', () => {
 const sim=new Simulation(maps.deadwater);sim.drainEvents();
 sim.damagePlayer(10,'caster',false,false,null,'omenCurse',{x:sim.player.x-3,z:sim.player.z+4});
 let hit=sim.drainEvents().find(e=>e.type==='playerDamage');assert.equal(hit.sourceDX,-.6);assert.equal(hit.sourceDZ,.8);
 sim.damagePlayer(3,'crop-fire',true);hit=sim.drainEvents().find(e=>e.type==='playerDamage');
 assert.deepEqual(hit,{type:'playerDamage',damage:3});
 sim.dev.invulnerable=true;sim.damagePlayer(30,'caster');assert.equal(sim.drainEvents().length,0);
 sim.dev.invulnerable=false;sim.damagePlayer(0,'caster');assert.equal(sim.drainEvents().length,0);
});

test('a solo robot curse passes its real caster bearing through damage transfer', t => {
 const you=new Simulation(maps.deadwater);you.player.id='you';you.drainEvents();
 const bots=new BotMatch(maps.deadwater,{createSim:m=>new Simulation(m),random:()=>.5});
 const bot=bots.spawn(you,'omen');Object.assign(bot.sim.player,{x:you.player.x-3,z:you.player.z+4});
 t.mock.method(bot.brain,'step',()=>({}));
 t.mock.method(bot.sim,'step',()=>{const target=bot.sim.targets.find(p=>p.id==='you');bot.sim.hit(target,{owner:bot.id,damage:10,damageType:'omenCurse'});});
 bots.step(you);
 const hit=you.drainEvents().find(e=>e.type==='playerDamage');assert.ok(hit);assert.equal(hit.sourceDX,-.6);assert.equal(hit.sourceDZ,.8);
});
