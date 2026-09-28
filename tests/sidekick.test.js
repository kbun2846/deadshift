import test,{beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {Simulation,segmentBox} from '../src/simulation.js';
import {SIDEKICK as S,mineDamage,stepSidekickMines} from '../src/weapons/sidekick.js';
import {SIGHTLINE} from '../src/config/gameplay.js';
import {makeSidekick,poseSidekick} from '../src/weapons/sidekick-model.js';
import {SidekickView} from '../src/weapons/sidekick-view.js';
import {playerInput,movementInput,playerState,loadout,applyLoadout} from '../src/net/protocol.js';
import {pack,ProjectileMirror,drawSim} from '../src/net/projectiles.js';
import {deathReaction} from '../src/effects/death-reactions.js';
import {Tutorial,COURSES} from '../src/tutorial.js';
import {RiflePose} from '../src/weapons/rifle-pose.js';
import {DeathView} from '../src/effects/death-view.js';
import {Arena} from '../src/net/arena.js';
import {RobotBrain} from '../src/bots/robot-brain.js';
beforeEach(t=>t.mock.method(Math,'random',()=>.5));
const map={id:'sidekick-test',width:150,depth:150,spawn:{x:0,z:0},buildings:[],fences:[],props:[],targets:[]};
function sim(){const s=new Simulation(map);s.weapon='sidekick';s.dev.noSpread=true;return s;}
const input={aimX:1,aimZ:0,aimPointX:10,aimPointZ:.27};
const run=(s,n,extra={})=>{for(let i=0;i<n;i++)s.step({...input,...extra});};
const target=(id,x,z,hp=1000)=>({id,x,z,hp,maxHp:hp,kind:'robot',flash:0});
const rush=s=>{s.step({...input,sidekickX:true});run(s,34);assert.ok(s.sidekick.active>7.9);};
test('normal trigger is manual; standalone rolls 28–32 without changing Sightline backup',t=>{
 assert.equal(SIGHTLINE.pistolDamage,25);const s=sim();run(s,80,{fire:true});assert.equal(s.sidekick.ammo,9);
 run(s,1);run(s,1,{fire:true});assert.equal(s.sidekick.ammo,8);
 for(const [random,expected] of [[0,28],[.5,30],[.999,32]]){t.mock.method(Math,'random',()=>random);const s=sim();run(s,1,{fire:true});assert.equal(s.sidekickRounds[0].damage,expected);}
});
test('travelled bullets damage targets and retain their bullet death type',()=>{const s=sim();s.targets=[target('t',5,.27,30)];run(s,1,{fire:true});run(s,20);assert.equal(s.targets[0].hp,0);assert.ok(s.events.some(e=>e.type==='kill'&&e.damageType==='sidekickShot'));assert.equal(deathReaction('sidekickShot').headWound,true);});
test('solid cover stops bullets',()=>{const s=sim();s.targets=[target('t',5,.27)];s.colliders=[{x:3,z:0,w:1,d:3,height:2}];run(s,1,{fire:true});run(s,30);assert.equal(s.targets[0].hp,1000);});
test('two mines can be placed back-to-back; only the second starts the 30 second refill',()=>{
 const a=sim(),b=sim();for(const s of [a,b]){
  assert.equal(s.sidekick.mineCharges,2);run(s,1,{sidekickMine:true});assert.equal(s.sidekick.mineCharges,1);assert.equal(s.sidekick.mineCooldown,0);
  run(s,90);assert.equal(s.sidekick.mineCooldown,0);run(s,1,{sidekickMine:true});assert.equal(s.sidekickMines.length,2);assert.equal(s.sidekick.mineCharges,0);assert.equal(s.sidekick.mineCooldown,30);
  run(s,1799,{sidekickMine:true});assert.equal(s.sidekickMines.length,2);assert.equal(s.sidekick.mineCharges,0);run(s,1);assert.equal(s.sidekick.mineCharges,2);assert.equal(s.sidekick.mineCooldown,0);
 }assert.equal(a.sidekickMines.length+b.sidekickMines.length,4);
});
test('refill keeps old mines alive; the first new placement removes either one or both survivors',()=>{
 for(const remaining of [0,1,2]){const s=sim();run(s,2,{sidekickMine:true});
  s.sidekickMines=s.sidekickMines.slice(0,remaining);const ids=s.sidekickMines.map(m=>m.id);
  run(s,1800);assert.equal(s.sidekickMines.length,remaining);assert.equal(s.sidekick.mineCharges,2);
  run(s,1,{sidekickMine:true});assert.equal(s.sidekickMines.length,1);assert.ok(!ids.includes(s.sidekickMines[0].id));assert.equal(s.sidekick.mineCharges,1);assert.equal(s.sidekick.mineCooldown,0);
  run(s,1,{sidekickMine:true});assert.equal(s.sidekickMines.length,2);assert.equal(s.sidekick.mineCooldown,30);
 }
});
test('mine triggers never bypass refill; respawn keeps remaining charges or cooldown',()=>{
 const s=sim();run(s,1,{sidekickMine:true});s.sidekickMines[0].age=1;s.targets=[target('trigger',.2,0)];stepSidekickMines(s,1/60,segmentBox);assert.equal(s.sidekickMines.length,0);assert.equal(s.sidekick.mineCharges,1);
 s.respawn({x:0,z:0});assert.equal(s.sidekick.mineCharges,1);s.targets=[];run(s,1,{sidekickMine:true});assert.equal(s.sidekick.mineCharges,0);const cd=s.sidekick.mineCooldown;
 s.respawn({x:0,z:0});assert.equal(s.sidekick.mineCharges,0);assert.equal(s.sidekick.mineCooldown,cd);run(s,1,{sidekickMine:true});assert.equal(s.sidekickMines.length,0);
 s.reset();assert.equal(s.sidekick.mineCharges,2);assert.equal(s.sidekick.mineCooldown,0);
});
test('arming delay, green allies do not trigger and triggering damage is 200 at midpoint',()=>{const s=sim();run(s,1,{sidekickMine:true});s.targets=[target('enemy',.2,0)];run(s,40);assert.equal(s.targets[0].hp,1000);s.targets[0].friendly=true;run(s,40);assert.equal(s.sidekickMines.length,1);s.targets[0].friendly=false;run(s,1);assert.equal(s.targets[0].hp,800);assert.equal(s.sidekickMines.length,0);assert.equal(s.events.find(e=>e.type==='grenadeExplosion').damageType,'sidekickMine');assert.equal(deathReaction('sidekickMine').mode,'scatter');assert.equal(s.player.hp,500);});
test('mine damage rolls endpoints once for the blast and falls off to its edge',t=>{for(const [r,damage] of [[0,170],[.999,230]]){t.mock.method(Math,'random',()=>r);const s=sim();run(s,1,{sidekickMine:true});s.sidekickMines[0].age=1;s.targets=[target('trigger',.2,0),target('splash',2,0),target('outside',5,0),{...target('ally',.3,.1),friendly:true}];stepSidekickMines(s,1/60,segmentBox);assert.equal(s.targets[0].hp,1000-damage);assert.equal(s.targets[1].hp,1000-mineDamage(2,damage));assert.equal(s.targets[2].hp,1000);assert.equal(s.targets[3].hp,1000);}});
test('a wall prevents a mine trigger through it',()=>{const s=sim();run(s,1,{sidekickMine:true});s.sidekickMines[0].age=1;s.targets=[target('enemy',.6,0)];s.colliders=[{x:.3,z:0,w:.1,d:2,height:2}];stepSidekickMines(s,1/60,segmentBox);assert.equal(s.sidekickMines.length,1);});
test('mine cannot hit a body standing on another deck level',()=>{const s=sim();run(s,1,{sidekickMine:true});s.sidekickMines[0].age=1;s.targets=[target('enemy',.2,0)];s.standY=t=>t?2:0;stepSidekickMines(s,1/60,segmentBox);assert.equal(s.sidekickMines.length,1);});
test('Rush summons before firing, alternates hands and fires at 1.75 times the base rate',()=>{const s=sim();s.step({...input,sidekickX:true,fire:true});run(s,25,{fire:true});assert.equal(s.events.filter(e=>e.type==='sidekickShot').length,0);run(s,10);s.events=[];for(let i=0;i<61;i++)s.step({...input,fire:true});const shots=s.events.filter(e=>e.type==='sidekickShot');assert.equal(shots.length,7);assert.deepEqual(shots.map(e=>e.hand),[0,1,0,1,0,1,0]);assert.equal(S.interval/S.fireRate,.16);assert.equal(s.sidekick.ammo,10);assert.equal(s.sidekick.offAmmo,10);});
test('Rush lasts eight seconds, blocks repeat activation and expires to manual fire',()=>{const s=sim();rush(s);const cd=s.sidekick.xCooldown;run(s,1,{sidekickX:true});assert.ok(s.sidekick.xCooldown<cd);run(s,480);assert.equal(s.sidekick.active,0);assert.equal(s.sidekick.offAmmo,0);const ammo=s.sidekick.ammo;run(s,80,{fire:true});assert.equal(s.sidekick.ammo,ammo-1);});
test('Rush moves 20 percent faster and ends on death or loadout reset',()=>{const a=sim(),b=sim();rush(b);run(a,60,{moveX:1});run(b,60,{moveX:1});assert.ok(b.player.x/a.player.x>1.19&&b.player.x/a.player.x<1.21);run(b,1,{sidekickMine:true});b.killPlayer();assert.equal(b.sidekick.active,0);assert.equal(b.sidekickMines.length,0);b.respawn({x:0,z:0});assert.equal(b.sidekick.ammo,10);assert.ok(b.sidekick.xCooldown>0);});
test('Rush fires throughout eight seconds even with an empty magazine and ignores reload',()=>{
 const s=sim();s.sidekick.ammo=0;run(s,1,{reload:true});assert.ok(s.sidekick.reload>0);rush(s);s.events=[];
 run(s,479,{fire:true,reload:true});
 const shots=s.events.filter(e=>e.type==='sidekickShot');assert.equal(shots.length,48);assert.ok(shots.every((e,i)=>e.hand===i%2));
 assert.equal(s.sidekick.ammo,0);assert.equal(s.sidekick.reload,0);assert.ok(!s.events.some(e=>e.type==='sidekickReload'));
 run(s,2,{fire:true});assert.equal(s.sidekick.active,0);const count=s.stats.launched;run(s,30,{fire:true});assert.equal(s.stats.launched,count);
 run(s,1);run(s,1,{fire:true});assert.ok(s.sidekick.reload>0);run(s,121);assert.equal(s.sidekick.ammo,10);
});
test('Rush preserves partially spent ammo, then returns to manual magazine use',()=>{
 const s=sim();s.sidekick.ammo=3;rush(s);run(s,450,{fire:true});assert.equal(s.sidekick.ammo,3);
 run(s,60);assert.equal(s.sidekick.active,0);assert.equal(s.sidekick.offAmmo,0);run(s,1,{fire:true});assert.equal(s.sidekick.ammo,2);
 run(s,1,{reload:true});run(s,118);assert.equal(s.sidekick.ammo,2);run(s,3);assert.equal(s.sidekick.ammo,10);
});
test('network input and loadout preserve Rush, magazine state, mine allegiance and projectile origin',()=>{const s=sim();rush(s);run(s,1,{sidekickMine:true,fire:true});assert.equal(playerInput({sidekickMine:1,sidekickX:1}).sidekickMine,true);assert.equal(movementInput({sidekickX:true},'sidekick').sidekickX,true);assert.ok(playerState('a',s.player).sidekick.active>0);const b=sim();applyLoadout(b,loadout(s));assert.equal(b.sidekick.ammo,s.sidekick.ammo);assert.equal(b.sidekick.mineCharges,s.sidekick.mineCharges);assert.equal(b.sidekick.mineCooldown,s.sidekick.mineCooldown);const mirror=new ProjectileMirror();mirror.update({0:pack(s),1:pack(s)},0);const foreign=mirror.lists(.01,slot=>slot===1);assert.deepEqual(foreign.sidekickMines.map(m=>m.enemy),[false,true]);assert.equal(new Set(foreign.sidekickMines.map(m=>m.id)).size,2);assert.equal(drawSim(s,foreign).sidekickRounds.length,3);});
test('second gun reaches forward before white silhouette appears, then becomes coloured',()=>{const model=makeSidekick(),off=model.getObjectByName('sidekick-off');poseSidekick(model,{summon:S.summon},1);assert.equal(off.visible,false);const early=poseSidekick(model,{summon:S.summon*.7},1.1);assert.ok(early.reach>0);assert.equal(off.visible,false);poseSidekick(model,{summon:S.summon*.45},1.3);assert.equal(off.visible,true);const mat=off.children.find(m=>m.isMesh).material;assert.equal(mat.userData.sidekickWhite.value,1);poseSidekick(model,{active:8},1.6);assert.equal(mat.userData.sidekickWhite.value,0);poseSidekick(model,{},10);assert.equal(off.visible,false);});
test('dual arms remain normal length while reaching, firing and reloading',()=>{const player=new THREE.Group(),body=new THREE.Group(),gun=new THREE.Group(),model=makeSidekick();gun.position.set(.27,.74,-.46);gun.add(model);body.add(gun);player.add(body);player.userData={body,gun};const arms=new RiflePose(player),s=sim();for(const state of [{summon:.5},{summon:.25},{active:8},{active:4,reload:1},{}]){Object.assign(s.sidekick,{summon:0,active:0,reload:0},state);poseSidekick(model,s.sidekick,2);arms.update(s,0,0,0);for(const a of arms.arms){assert.ok(a.upper.scale.y<.331);assert.ok(a.lower.scale.y<.351);}}});
test('mine/echo/shot batches clear on reset and no echo leaks from a concealed body',()=>{const player=new THREE.Group();player.userData={gun:new THREE.Group()};player.add(player.userData.gun);const s=sim(),scene=new THREE.Scene();const v={player,scene,qualityName:'performance',gy:()=>0,ground:s.ground,rifleView:{pose:{update(){}}},remotePlayers:[],fx:{muzzle(){}}};const view=new SidekickView(v);rush(s);s.player.vx=2;view.update(s,.1);assert.ok(view.ghosts.count>0);v.remotePlayers=[{id:'hidden',x:5,z:0,vx:3,vz:0,hp:500,sidekick:{active:5}}];view.model.visible=false;s.player.vx=0;view.update(s,.5);assert.equal(view.ghosts.count,0);view.clear();assert.ok(view.meshes.every(m=>m.count===0));});
test('Sidekick tutorial has short actionable steps and credits its own weapon events',()=>{assert.equal(COURSES.sidekick.length,4);const t=new Tutorial('sidekick'),s=sim();assert.ok(t);assert.ok(COURSES.sidekick.every(v=>v.note.length<90));});
test('both Sidekick deaths drop the held weapon and clean up the corpse/blast',()=>{
 for(const damageType of ['sidekickShot','sidekickMine']){
  const player=new THREE.Group(),gun=makeSidekick();poseSidekick(gun,{active:4},2);player.add(gun);player.userData.gun=gun;player.add(new THREE.Mesh(new THREE.BoxGeometry(.3,1,.3),new THREE.MeshLambertMaterial()));
  const scene=new THREE.Scene();scene.add(player);const death=new DeathView({player,scene,qualityName:'performance'});death.start({damageType,x:0,z:0,aimX:1,aimZ:0,directionX:1,directionZ:0});assert.ok(death.gun.children.length>=4);assert.equal(death.reaction.mode,damageType==='sidekickMine'?'scatter':'corpse');death.update(2);death.clear();assert.equal(scene.children.length,1);assert.ok(player.visible);
 }
});
test('host resolves a lethal mine with its owner and damage type, including allied immunity',()=>{
 const arena=new Arena({map,createSim:m=>new Simulation(m),settings:{robots:'off',friendlyFire:true}}),a=arena.addSeat('a','A'),b=arena.addSeat('b','B'),ally=arena.addSeat('c','C');
 for(const seat of [a,b,ally]){seat.present=true;seat.sim.respawn({x:seat===a?0:.2,z:seat===ally?.2:0},seat.id);seat.sim.weapon='sidekick';}a.team=ally.team='red';b.team='blue';
 a.sim.step({...input,sidekickMine:true});a.sim.sidekickMines[0].age=1;b.sim.player.hp=100;const allyHp=ally.sim.player.hp;
 arena.before(a);a.sim.step(input);arena.after(a);
 assert.equal(b.sim.player.dead,true);assert.equal(ally.sim.player.hp,allyHp);assert.equal(b.sim.events.find(e=>e.type==='playerDeath').damageType,'sidekickMine');
});
test('bots tap normally, hold during Rush and request only normal mine/X inputs',()=>{const s=sim(),brain={sim:s,xAllowed:()=>true,usedX(){this.used=true;}},pressed={};RobotBrain.prototype.sidekick.call(brain,pressed,{},7,true,true);assert.equal(pressed.tapFire,true);assert.equal(pressed.fire,false);assert.equal(pressed.sidekickMine,true);assert.equal(pressed.sidekickX,true);rush(s);const active={};RobotBrain.prototype.sidekick.call(brain,active,{},7,true,true);assert.equal(active.fire,true);assert.equal(active.tapFire,false);s.sidekick.ammo=0;const empty={};RobotBrain.prototype.sidekick.call(brain,empty,{},7,true,false);assert.equal(empty.reload,false);assert.equal(empty.fire,true);});
test('map reset, respawn and a death discard planted mines and Rush state',()=>{for(const action of [s=>s.resetWorld(),s=>s.respawn({x:0,z:0}),s=>s.killPlayer()]){const s=sim();rush(s);run(s,1,{sidekickMine:true});assert.equal(s.sidekickMines.length,1);action(s);assert.equal(s.sidekickMines.length,0);assert.equal(s.sidekick.active,0);}});
