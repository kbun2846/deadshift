import test from 'node:test';
import assert from 'node:assert/strict';
import {Simulation} from '../src/simulation.js';
const make=props=>{const sim=new Simulation({width:40,depth:40,spawn:{x:0,z:0},buildings:[],fences:[],props,targets:[]});sim.weapon='shotgun';sim.reset();return sim;};
const step=(s,n,input={})=>{for(let i=0;i<n;i++)s.step(input);};
test('Ballast launch smashes crates, barrels and rotated cacti without losing travel',()=>{
 const s=make([{id:'a',type:'crate',x:-1.7,z:0,angle:.35},{id:'b',type:'barrel',x:-3.5,z:0},{id:'c',type:'cactus',x:-5.4,z:0,angle:Math.PI/2}]);
 s.shotgun.charge=1;s.shotgun.stored=true;s.shotgun.hold=15;s.step({tapFire:true});step(s,120);
 assert.ok(s.props.every(p=>p.hp===0));assert.equal(s.events.filter(e=>e.type==='propBreak').length,3);assert.ok(s.player.x<-7.5);assert.equal(s.player.hp,500);assert.equal(s.player.ballastLaunch,false);
 assert.ok(s.colliders.every(c=>!c.propId));s.reset();assert.ok(s.props.every(p=>p.hp>0));assert.equal(s.player.ballastLaunch,false);
});
test('walking into a prop and being blasted into one do not smash it',()=>{
 for(const mode of ['walk','blast']){const s=make([{type:'crate',x:-1.7,z:0}]);
 if(mode==='blast')s.applyBlastKnockback(1,0,4,2.8);else s.step({moveX:-1});
 step(s,80,mode==='blast'?{}:{moveX:-1});
 assert.ok(s.props[0].hp>0,`${mode} smashed the crate`);}
});
test('dodging through a breakable takes it with you, thrown along the dash',()=>{
 const s=make([{type:'crate',x:-1.7,z:0}]);
 s.step({moveX:-1,dodge:true});
 step(s,40,{moveX:-1});
 assert.equal(s.props[0].hp,0,'the crate survived the roll');
 assert.ok(s.stats.propsDestroyed>0,'the break was not recorded');
 // And the roll carries on rather than stopping on it.
 assert.ok(s.player.x<-1.7,`the dodge stalled at ${s.player.x.toFixed(2)}`);
});
test('a dodge break is flagged as a dash and thrown along the dash direction',()=>{
 const s=make([{type:'crate',x:-1.7,z:0}]);
 s.step({moveX:-1,dodge:true});
 let event=null;
 for(let i=0;i<40&&!event;i++){s.step({moveX:-1});event=s.drainEvents().find(e=>e.type==='propBreak');}
 assert.ok(event,'no propBreak event was emitted');
 assert.equal(event.dashed,true,'the break was not marked as a dash');
 assert.ok(event.directionX<-.9&&Math.abs(event.directionZ)<.1,
  `debris was thrown ${event.directionX.toFixed(2)},${event.directionZ.toFixed(2)} rather than along the dash`);
 assert.equal(event.electric,false,'a dash break is not an electric break');
});
test('a solid wall still stops a dodge dead',()=>{
 const s=make([]);s.colliders.unshift({x:-1.4,z:0,w:.3,d:8});
 s.step({moveX:-1,dodge:true});step(s,40,{moveX:-1});
 assert.ok(s.player.x>-1.4,`the dodge went through a wall to ${s.player.x.toFixed(2)}`);
});
test('solid barriers stop launch and protect props behind them',()=>{
 const s=make([{type:'crate',x:-2.5,z:0}]);s.colliders.unshift({x:-1.1,z:0,w:.2,d:8});
 s.shotgun.charge=1;s.shotgun.stored=true;s.shotgun.hold=15;s.step({tapFire:true});step(s,120);
 assert.ok(s.props[0].hp>0);assert.ok(s.player.x>-.8);
});

test('a shot break and a dash break are distinguishable, and only the dash is flagged',()=>{
 const shot=make([{type:'crate',x:-1.7,z:0}]);
 shot.hitProp(shot.props[0],{damage:5,x:-1.7,z:0,vx:-1,vz:0});
 const fromShot=shot.drainEvents().find(e=>e.type==='propBreak');
 assert.equal(fromShot.dashed,false,'a shot break must not claim to be a dash');

 const dash=make([{type:'crate',x:-1.7,z:0}]);
 dash.step({moveX:-1,dodge:true});
 let fromDash=null;
 for(let i=0;i<40&&!fromDash;i++){dash.step({moveX:-1});fromDash=dash.drainEvents().find(e=>e.type==='propBreak');}
 assert.equal(fromDash.dashed,true);
 // Both carry the same payload otherwise, so the renderer and the mixer can
 // branch on one field rather than guessing from the direction.
 assert.deepEqual(Object.keys(fromShot).sort(),Object.keys(fromDash).sort());
});

test('a dodge only breaks what it actually reaches',()=>{
 // Well off the dash line: a roll past something must not shatter it.
 const s=make([{type:'crate',x:-1.7,z:2.6}]);
 s.step({moveX:-1,dodge:true});step(s,40,{moveX:-1});
 assert.ok(s.props[0].hp>0,'a crate beside the dash was destroyed');
});

test('a dodge clears a line of breakables rather than only the first',()=>{
 const s=make([{type:'crate',x:-1.2,z:0},{type:'crate',x:-2.6,z:0}]);
 s.step({moveX:-1,dodge:true});step(s,40,{moveX:-1});
 assert.deepEqual(s.props.map(p=>p.hp),[0,0]);
});

test('a grenade takes a volley id of its own, never a bullet\'s',()=>{
 // The grenade used to group its damage under its serial id, which runs on a
 // separate counter from volleys. Once the two counters were out of step a
 // grenade and an unrelated rifle bullet could share a volley id, and the
 // one-shot bookkeeping read the pair as a single shot.
 const s=make([]);s.weapon='rifle';
 s.serial+=5;
 const aim={aimX:1,aimZ:0,aimPointX:20,aimPointZ:0};
 s.step({...aim,grenade:true});
 const g=s.grenades[0];
 assert.ok(g.volley!==g.id,`the grenade reused its serial (${g.id}) as a volley id`);
 const bullets=new Set();
 for(let i=0;i<120;i++){s.step({...aim,fire:true});for(const b of s.rifleBullets)bullets.add(b.id);}
 assert.ok(bullets.size>3,'the rifle should have fired several volleys');
 assert.ok(!bullets.has(g.volley),`a bullet was issued the grenade's volley id ${g.volley}`);
});

test('floor clutter breaks underfoot, and solid scenery still needs a dash',()=>{
 // A pot the player walks straight through and leaves standing reads as
 // scenery painted on the floor.
 const clutter=make([{type:'pot',x:-1.4,z:0}]);
 clutter.step({moveX:-1});step(clutter,40,{moveX:-1});
 assert.equal(clutter.props[0].hp,0,'the pot survived being walked over');
 // A crate is not floor clutter: walking into it stops you, it does not break.
 const solid=make([{type:'crate',x:-1.7,z:0,angle:0}]);
 solid.step({moveX:-1});step(solid,40,{moveX:-1});
 assert.ok(solid.props[0].hp>0,'walking broke a crate');
});

test('a walked break is not reported as a dash, and is thrown the way you were going',()=>{
 const s=make([{type:'pottedPlant',x:-1.4,z:0}]);
 let event=null;
 for(let i=0;i<40&&!event;i++){s.step({moveX:-1});event=s.drainEvents().find(e=>e.type==='propBreak');}
 assert.ok(event,'no propBreak was emitted');
 assert.equal(event.dashed,false,'a stride is not a dash');
 assert.ok(event.directionX<-.9&&Math.abs(event.directionZ)<.15,
  `debris went ${event.directionX.toFixed(2)},${event.directionZ.toFixed(2)} rather than along the walk`);
});

test('standing still on clutter does not break it, and a corpse breaks nothing',()=>{
 // Reached only by moving into it: the overlap test is the same one the
 // collision passes use, so merely being near it is not contact.
 const near=make([{type:'brokenChair',x:-2.6,z:0}]);
 step(near,60,{});
 assert.ok(near.props[0].hp>0,'clutter broke without being touched');
 const dead=make([{type:'pot',x:-1.4,z:0}]);
 dead.player.hp=0;dead.player.dead=true;
 step(dead,40,{moveX:-1});
 assert.ok(dead.props[0].hp>0,'a dead player crushed a pot');
});
