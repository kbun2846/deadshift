import test from 'node:test';
import assert from 'node:assert/strict';
import {DamageFeedbackState,damageFeedbackSize,damageFeedbackScale,createDamageFeedback,MERGE_WINDOW,BURN_BEAT,BURN_RUN,DAMAGE_FEEDBACK_COLORS} from '../src/damage-feedback.js';
import {Simulation} from '../src/simulation.js';
test('damage popup follows rendered position and does not switch sides when turning',()=>{
 const previous=globalThis.document;
 const element=()=>({children:[],style:{},setAttribute(){},append(child){this.children.push(child);},remove(){}});
 globalThis.document={createElement:element};
 try{
  const parent=element();parent.clientWidth=1000;parent.clientHeight=700;
  const feedback=createDamageFeedback(parent),sim={time:1,player:{x:900,z:500,aimX:1,aimZ:0}};
  const view={player:{position:{x:400,z:300}},screenPoint:(x,z)=>({x,y:z})};
  feedback.add(20,1);feedback.update(sim,view);
  const popup=parent.children[0].children[0],left=parseFloat(popup.style.left);assert.ok(left<400);
  sim.player.x=950;sim.player.aimX=-1;feedback.update(sim,view);assert.equal(parseFloat(popup.style.left),left);
  view.player.position.x+=.5;feedback.update(sim,view);assert.equal(parseFloat(popup.style.left),left+.5);
 }finally{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;}
});
test('each hit gets its own damage popup and independent three-second lifetime',()=>{
 const state=new DamageFeedbackState();state.add(100,1);
 const first={...state.items[0]};
 for(const time of [1.3,1.6,2.5])state.add(20,time);
 assert.deepEqual(state.items.map(item=>item.damage),[100,20,20,20]);
 assert.deepEqual(state.items[0],first);
 assert.equal(new Set(state.items.map(item=>item.id)).size,4);
 assert.equal(new Set(state.items.map(item=>item.position)).size,4);
 const snapshot=JSON.stringify(state.items);state.update(2.5);assert.equal(JSON.stringify(state.items),snapshot);
 state.update(3.99);assert.equal(state.items.length,4);state.update(4);assert.equal(state.items.length,3);
 state.update(5.49);assert.equal(state.items.length,1);state.update(5.5);assert.equal(state.items.length,0);
 state.add(20,6);assert.equal(state.items[0].damage,20);state.update(0);assert.equal(state.items.length,0);
});
test('damage text scales to each individual hit and has a restrained entry slam',()=>{
 assert.ok(damageFeedbackSize(200)>damageFeedbackSize(100));
 assert.ok(damageFeedbackSize(200)-damageFeedbackSize(100)<3);
 assert.equal(damageFeedbackSize(5000),30);
 assert.equal(damageFeedbackSize(0),21);
 assert.equal(damageFeedbackScale(0),1.26);assert.ok(damageFeedbackScale(.1)<1);assert.ok(Math.abs(damageFeedbackScale(.6)-1)<.001);
});
test('player damage feedback reports actual lost HP and ignores invulnerability',()=>{
 const sim=new Simulation({width:30,depth:30,spawn:{x:0,z:0},buildings:[],fences:[],props:[],targets:[]});
 sim.player.hp=35;sim.damagePlayer(240,sim.player.id,false,true);
 assert.deepEqual(sim.events.filter(e=>e.type==='playerDamage'),[{type:'playerDamage',damage:35}]);
 sim.reset();sim.dev.invulnerable=true;sim.damagePlayer(240,sim.player.id,false,true);
 assert.equal(sim.events.filter(e=>e.type==='playerDamage').length,0);
});

test('damage numbers are whole and rounded down, never fractions',()=>{
 const state=new DamageFeedbackState();
 // A burn delivers 10 a second one simulation step at a time.
 let time=0;
 for(let i=0;i<60;i++){time+=1/60;state.add(10/60,time);}
 assert.ok(state.items.length>0,'a full second of burning should show something');
 for(const item of state.items){
  assert.equal(item.damage,Math.floor(item.damage),`${item.damage} is not whole`);
  assert.ok(item.damage>=1,'nothing below one should ever appear');
 }
 const shown=state.items.reduce((sum,item)=>sum+item.damage,0);
 assert.ok(shown<=10+1e-9,`showed ${shown} for 10 damage taken`);
 // Whatever has not been shown yet is carried, never dropped: the figure
 // updates on a beat, so the last fraction of a second is still in hand.
 assert.ok(Math.abs(shown+state.pending-10)<1e-9,`${shown} shown plus ${state.pending} carried is not 10`);
});

test('a burn number is born once and climbs, rather than restarting every merge',()=>{
 const state=new DamageFeedbackState();
 let time=0;
 for(let i=0;i<30;i++){time+=1/60;state.add(25/60,time);}
 const burn=state.items.find(item=>item.trickle);
 assert.ok(burn,'half a second of burning should show a number');
 const born=burn.born,damage=burn.damage;
 for(let i=0;i<60;i++){time+=1/60;state.add(25/60,time);}
 assert.equal(state.items.find(item=>item.trickle&&item.id===burn.id).born,born,'the birth time moved, which replays the fade-in');
 assert.ok(burn.damage>damage,'the same number should have climbed');
});

test('a running burn figure changes on a readable beat, not every frame',()=>{
 const state=new DamageFeedbackState();
 let time=0,changes=0,previous=null;
 for(let i=0;i<120;i++){
  time+=1/60;state.add(25/60,time);
  const reading=state.items.filter(item=>item.trickle).map(item=>item.damage).join('/');
  if(reading!==previous){changes++;previous=reading;}
 }
 // Two seconds of fire: a handful of updates, not a hundred and twenty.
 assert.ok(changes<=9,`the burn figure changed ${changes} times in two seconds`);
 assert.ok(changes>=4,`the burn figure only changed ${changes} times in two seconds`);
});

test('a gunshot landing mid burn does not split the burn into a second figure',()=>{
 const state=new DamageFeedbackState();
 let time=0;
 for(let i=0;i<60;i++){
  time+=1/60;state.add(25/60,time);
  if(i===30)state.add(40,time);
 }
 assert.equal(state.items.filter(item=>item.trickle).length,1,'the burn should still be one number');
 assert.equal(state.items.filter(item=>!item.trickle).length,1,'the gunshot keeps its own number');
});

test('a burn feeds one number instead of stacking dozens',()=>{
 const state=new DamageFeedbackState();
 let time=0;
 for(let i=0;i<120;i++){time+=1/60;state.add(10/60,time);}
 assert.ok(state.items.length<=2,`two seconds of burning made ${state.items.length} numbers`);
});

test('a fraction too small to show is carried, not discarded',()=>{
 const state=new DamageFeedbackState();
 state.add(.4,1);
 assert.equal(state.items.length,0,'four tenths is not a number worth showing yet');
 state.add(.7,1.1);
 assert.equal(state.items.length,1,'but the remainder carries into the next tick');
 assert.equal(state.items[0].damage,1);
});

test('a single large hit is unaffected by the carry',()=>{
 const state=new DamageFeedbackState();
 state.add(154.6,1);
 assert.equal(state.items.length,1);
 assert.equal(state.items[0].damage,154,'rounded down, never up');
});

test('the burn timings hold their intended relationship',()=>{
 // The gap that still counts as the same burn must outlast the beat, or a
 // running burn is never recognised as running and starts a new number on
 // every update.
 assert.ok(MERGE_WINDOW>BURN_BEAT,`gap ${MERGE_WINDOW} must exceed beat ${BURN_BEAT}`);
 // And one number must retire well inside its own lifetime, so a long burn
 // hands off instead of leaving a figure parked on screen.
 assert.ok(BURN_RUN>MERGE_WINDOW&&BURN_RUN<3,`run ${BURN_RUN}`);
 assert.ok(DAMAGE_FEEDBACK_COLORS.length>=2&&DAMAGE_FEEDBACK_COLORS.every(c=>/^#[0-9a-f]{6}$/i.test(c)));
});
