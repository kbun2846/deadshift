import test from 'node:test';
import assert from 'node:assert/strict';
import {DamageFeedbackState,damageFeedbackSize,damageFeedbackScale,createDamageFeedback,STACK_WINDOW,BURN_BEAT,DAMAGE_FEEDBACK_COLORS} from '../src/damage-feedback.js';
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
test('hits in a row add up into one number that pops back in with a new tilt',()=>{
 const state=new DamageFeedbackState();state.add(50,1);
 const first=state.items[0],tilt=first.tilt;
 state.add(50,1.3);
 assert.equal(state.items.length,1,'one number, not two');
 assert.equal(first.damage,100,'-50 then -100');
 assert.equal(first.bumped,1.3,'the pop restarts');
 assert.equal(first.born,1,'but it is the same number, born once');
 assert.ok(Math.sign(first.tilt)===-Math.sign(tilt),'and it leans the other way');
 state.add(50,1.6);assert.equal(first.damage,150);
 state.update(1.6+2.99);assert.equal(state.items.length,1,'it lives three seconds from the last hit');
 state.update(1.6+3.01);assert.equal(state.items.length,0);
 state.add(20,10);state.add(20,10+STACK_WINDOW+.01);
 assert.deepEqual(state.items.map(i=>i.damage),[20,20],'after a quiet gap a new number starts');
 state.update(0);assert.equal(state.items.length,0);
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
 const burn=state.items[0];
 assert.ok(burn,'half a second of burning should show a number');
 const born=burn.born,damage=burn.damage;
 for(let i=0;i<60;i++){time+=1/60;state.add(25/60,time);}
 assert.equal(state.items.find(item=>item.id===burn.id).born,born,'the birth time moved, which replays the fade-in');
 assert.ok(burn.damage>damage,'the same number should have climbed');
});

test('a running burn figure changes on a readable beat, not every frame',()=>{
 const state=new DamageFeedbackState();
 let time=0,changes=0,previous=null;
 for(let i=0;i<120;i++){
  time+=1/60;state.add(25/60,time);
  const reading=state.items.map(item=>item.damage).join('/');
  if(reading!==previous){changes++;previous=reading;}
 }
 // Two seconds of fire: a handful of updates, not a hundred and twenty.
 assert.ok(changes<=9,`the burn figure changed ${changes} times in two seconds`);
 assert.ok(changes>=4,`the burn figure only changed ${changes} times in two seconds`);
});

test('a gunshot landing mid burn adds onto the same running number',()=>{
 const state=new DamageFeedbackState();
 let time=0;
 for(let i=0;i<60;i++){
  time+=1/60;state.add(25/60,time);
  if(i===30)state.add(40,time);
 }
 assert.equal(state.items.length,1,'all damage taken is one figure');
 assert.ok(state.items[0].damage>=40+20,'and it includes both');
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
 // The gap that still counts as the same run of damage must outlast the beat, or a
 // running burn is never recognised as running and starts a new number on
 // every update.
 assert.ok(STACK_WINDOW>BURN_BEAT,`gap ${STACK_WINDOW} must exceed beat ${BURN_BEAT}`);
 assert.ok(DAMAGE_FEEDBACK_COLORS.length>=2&&DAMAGE_FEEDBACK_COLORS.every(c=>/^#[0-9a-f]{6}$/i.test(c)));
});
