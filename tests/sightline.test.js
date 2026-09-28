import test,{beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {sightlineFlight,sightlineGuideEnd,sightlineY,sightlineAimPlane} from '../src/weapons/sightline-flight.js';
import {FLAT} from '../src/world/heightfield.js';
import {InteriorVisibility} from '../src/render/interior-visibility.js';
import {RULES} from '../src/config/gameplay.js';
import {Simulation,segmentBox} from '../src/simulation.js';
import {SIGHTLINE as S,sightlineRange,inSightCone,sightlineSplash,scopeActive,sightlineCamera,sightlineElevation} from '../src/weapons/sightline.js';
import {RiflePose} from '../src/weapons/rifle-pose.js';
import {makeSightline,poseSightline} from '../src/weapons/sightline-model.js';
import {SightlineView} from '../src/weapons/sightline-view.js';
import {playerInput,movementInput,loadout,applyLoadout,playerState} from '../src/net/protocol.js';
import {pack,ProjectileMirror,drawSim} from '../src/net/projectiles.js';
import {deathReaction} from '../src/effects/death-reactions.js';
import {maps} from '../src/maps.js';
import * as THREE from 'three';
import {DeathView} from '../src/effects/death-view.js';
import {Arena} from '../src/net/arena.js';
import {Tutorial,COURSES,tutorialMapFor} from '../src/tutorial.js';
import {RobotBrain} from '../src/bots/robot-brain.js';
import {ScopeShading} from '../src/render/scope-shading.js';
import {sightlineAmmoPresentation} from '../src/ui/sightline-ammo.js';
import {fairFov,onScreenOf,CAMERA_TILT,OUTDOOR_CAMERA_HEIGHT} from '../src/render/camera-framing.js';
import {WorldView} from '../src/render/renderer.js';
import {muzzleBearing,muzzleLateral} from '../src/aim-damping.js';
beforeEach(t=>t.mock.method(Math,'random',()=>.5));
const map={id:'sightline-test',width:150,depth:150,spawn:{x:0,z:0},buildings:[],fences:[],props:[],targets:[]};
const target=(id,x=10,z=.22,hp=2000)=>({id,x,z,kind:'robot',maxHp:hp});
const make=(targets=[])=>{const s=new Simulation({...map,targets});s.weapon='sightline';s.dev.noSpread=true;return s;};
const tick=(s,input={},n=1)=>{for(let i=0;i<n;i++)s.step({aimX:1,aimZ:0,aimPointX:25,aimPointZ:0,...input});};
const crouch=s=>{tick(s,{sightlineStance:true});tick(s,{},120);};
const fire=s=>tick(s,{fire:true,aiming:true});
test('manual Sidekick fires 25 damage at the middle roll once per press, ten rounds, with a 0.28 second cap',()=>{
 const s=make([target('a')]);tick(s,{fire:true},90);assert.equal(s.stats.launched,1);assert.equal(s.sightline.pistolAmmo,9);assert.equal(s.targets[0].hp,1975);
 tick(s);tick(s,{fire:true});assert.equal(s.stats.launched,2);tick(s);tick(s,{fire:true});assert.equal(s.stats.launched,2);
 for(let i=0;i<8;i++){tick(s,{},18);tick(s,{fire:true});}assert.equal(s.sightline.pistolAmmo,0);tick(s,{},18);tick(s,{fire:true});assert.equal(s.sightline.pistolReload,2);
 tick(s,{},119);assert.equal(s.sightline.pistolAmmo,0);tick(s);assert.equal(s.sightline.pistolAmmo,10);
});
test('only E crouches, halts movement, keeps regular camera until ADS, and permits rifle reload',()=>{
 const s=make();tick(s,{moveX:1},12);crouch(s);const x=s.player.x;tick(s,{moveX:1,dodge:true},20);assert.equal(s.player.x,x);assert.equal(s.player.dodgeRemaining,0);assert.equal(scopeActive(s),false);
 tick(s,{aiming:true});assert.equal(scopeActive(s),true);fire(s);tick(s,{},12);assert.ok(s.sightline.rifleReload>4,'the rifle reloads itself once its round is away (v0.992a)');tick(s,{},252);assert.equal(s.sightline.rifleAmmo,1);
 crouch(s);assert.equal(s.sightline.crouched,false);tick(s,{moveX:1},12);assert.ok(s.player.x>x);
});
test('standing X loads while moving, then automatically returns to Sidekick with rifle armed',()=>{
 const s=make();tick(s,{sightlineX:true,moveX:1});assert.ok(s.sightline.xLoading);assert.equal(s.sightline.crouched,false);const x=s.player.x;
 tick(s,{moveX:1,fire:true},251);assert.ok(s.sightline.rifleReload>0);assert.equal(s.stats.launched,0);tick(s,{moveX:1});assert.ok(s.player.x>x);assert.equal(s.sightline.xLoading,false);assert.equal(s.sightline.special,true);assert.equal(s.sightline.crouched,false);
 tick(s,{sightlineX:true});assert.equal(s.stats.launched,0);tick(s);fire(s);assert.equal(s.stats.launched,1);assert.equal(s.sightline.special,true,'Sidekick cannot spend the rifle round');
});
test('crouched X stays crouched, fires with second X or LMB and starts exactly 50 seconds cooldown',()=>{
 for(const fireKey of ['sightlineX','fire']){const s=make();crouch(s);tick(s,{sightlineX:true});tick(s,{},252);assert.equal(s.sightline.crouched,true);assert.ok(s.sightline.special);tick(s,{[fireKey]:true,aiming:true});assert.equal(s.sightline.xCooldown,50);assert.equal(s.sightline.commit,.16);assert.equal(s.sightline.special,false);tick(s,{},10);assert.equal(s.stats.launched,1);assert.ok(s.sightlineRounds[0].special);}
});
test('a committed path stays locked when aim changes and takes time to hit',()=>{
 const s=make([target('a',20)]);crouch(s);fire(s);assert.equal(s.sightlineRounds.length,0);tick(s,{aimX:0,aimZ:1},8);assert.equal(s.sightlineRounds.length,0);tick(s,{aimX:0,aimZ:1},2);assert.equal(s.targets[0].hp,2000);assert.ok(s.sightlineRounds[0].dx>.99);tick(s,{},22);assert.equal(s.targets[0].hp,1501);
});
test('rifle damage rolls include 493 and 505, with explicit lethal reactions',t=>{
 for(const [random,expected] of [[0,493],[.9999,505]]){t.mock.method(Math,'random',()=>random);const s=make([target('a',10,.22,500)]);crouch(s);fire(s);tick(s,{},30);assert.equal(s.targets[0].hp,Math.max(0,500-expected));const e=s.events.find(e=>e.type==='kill'||e.type==='hit');assert.equal(e.damageType,'sightlineShot');}
 assert.equal(deathReaction('sightlineShot').headWound,true);assert.equal(deathReaction('sightlinePistol').headWound,true);assert.equal(deathReaction('sightlineBlast').mode,'scatter');
});
test('sniper penetrates multiple props but stops at unbreakable cover',()=>{
 const s=make([target('a',15)]);s.props=[{id:'p1',x:4,z:0,hp:200,maxHp:200,kind:'crate'},{id:'p2',x:7,z:0,hp:200,maxHp:200,kind:'crate'}];s.colliders=[{x:4,z:0,w:1,d:1,propId:'p1'},{x:7,z:0,w:1,d:1,propId:'p2'}];crouch(s);fire(s);tick(s,{},35);assert.equal(s.props[0].hp,0);assert.equal(s.props[1].hp,0);assert.equal(s.targets[0].hp,1501);
 const wall=make([target('a',15)]);wall.colliders=[{x:5,z:0,w:.5,d:5}];crouch(wall);fire(wall);tick(wall,{},35);assert.equal(wall.targets[0].hp,2000);assert.equal(wall.sightlineRounds.length,0);
});
test('a target can cross the committed path and evade all rifle damage',()=>{
 const s=make([target('a',20)]);crouch(s);fire(s);tick(s,{},8);s.targets[0].z=4;tick(s,{},50);assert.equal(s.targets[0].hp,2000);
});

test('fast Sightline still lets a player dodge across its committed path',()=>{
 assert.equal(S.speed,114);assert.equal(S.commit,.16);
 for(const dodge of [false,true]){
  const arena=new Arena({map,createSim:m=>new Simulation(m),settings:{robots:'off'}}),a=arena.addSeat('a','A'),b=arena.addSeat('b','B');
  for(const seat of [a,b]){seat.present=true;seat.sim.respawn({x:seat===a?0:20,z:seat===a?0:S.muzzleLateral});seat.sim.weapon='sightline';seat.sim.dev.noSpread=true;}
  a.sim.sightline.crouched=true;
  for(let frame=0;frame<40;frame++){
   arena.before(a);tick(a.sim,frame===0?{fire:true,aiming:true}:{});arena.after(a);
   if(frame===10){const rounds=pack(a.sim).sightline;assert.equal(rounds[0].speed,114);assert.ok(rounds[0].x<20,'bullet still has travel time');}
   arena.before(b);tick(b.sim,dodge&&frame>=12?{moveZ:1,dodge:frame===12}:{});arena.after(b);
  }
  assert.equal(a.sim.stats.launched,1);
  if(dodge){assert.equal(b.sim.player.hp,500);assert.ok(b.sim.player.z>S.muzzleLateral+3,'actual dodge moves clear');}
  else assert.ok(b.sim.player.hp<500,'same shot hits a stationary player');
 }
});

test('aimed Breach detonates at the cursor on flat ground, slopes and the Hollow Wick bridge approach',()=>{
 for(const variant of ['flat','uphill','downhill','hollow']){
  const sim=variant==='hollow'?new Simulation(maps['hollow-wick']):make();sim.weapon='sightline';sim.targets=[];sim.colliders=[];sim.props=[];sim.dev.noSpread=true;
  if(variant==='uphill'||variant==='downhill'){const slope=variant==='uphill'?.1:-.1,base=variant==='downhill'?3:0;sim.ground={...FLAT,flat:false,minY:-10,maxY:10,heightAt:(x)=>base+x*slope,drawnHeightAt:(x)=>base+x*slope,gradientAt:(x,z,out)=>Object.assign(out,{x:slope,z:0}),sightClear:()=>true,waterDepthAt:()=>0,wetAt:()=>false,waterAt:()=>null};}
  const from=variant==='hollow'?{x:-24,z:32}:{x:0,z:0},point=variant==='hollow'?{x:0,z:10}:{x:15,z:2};Object.assign(sim.player,from);
  sim.sightline.crouched=true;sim.sightline.special=true;
  const a=muzzleBearing(from.x,from.z,point.x,point.z,S.muzzleLateral),input={aimX:Math.cos(a),aimZ:Math.sin(a),aimPointX:point.x,aimPointZ:point.z,aiming:true};
  sim.step({...input,fire:true});for(let i=0;i<50;i++)sim.step(input);
  const blast=sim.events.find(e=>e.type==='grenadeExplosion');assert.ok(blast,variant+' detonates');assert.ok(Math.hypot(blast.x-point.x,blast.z-point.z)<.06,variant+' stops at cursor');
 }
});

test('solid cover can stop cursor-placed Breach early',()=>{
 const sim=make();crouch(sim);sim.sightline.special=true;sim.colliders=[{x:6,z:0,w:1,d:5,height:3}];fire(sim);tick(sim,{},30);
 const blast=sim.events.find(e=>e.type==='grenadeExplosion');assert.ok(blast.x<6&&blast.x>5);
});
test('X combines direct damage and blast once, nearby splash falls off and respects cover',()=>{
 const s=make([target('a'),target('b',10,1.2),target('c',10,3.4),target('hidden',10,-2.5)]);s.colliders=[{x:10,z:-1.2,w:4,d:.2}];crouch(s);s.sightline.special=true;fire(s);tick(s,{},30);
 assert.equal(s.targets[0].hp,1201);assert.ok(s.targets[1].hp<1750&&s.targets[1].hp>=1700);assert.ok(s.targets[2].hp>s.targets[1].hp);assert.equal(s.targets[3].hp,2000);assert.equal(s.events.filter(e=>e.type==='hit'&&e.id==='a').length,1);assert.ok(s.events.some(e=>e.type==='grenadeExplosion'));assert.equal(sightlineSplash(5),0);
});
test('death cancels chambering and pending shot but launched rounds keep flying',()=>{
 const s=make([target('a',25)]);crouch(s);fire(s);tick(s,{},10);s.damagePlayer(9999,'enemy');tick(s,{},40);assert.equal(s.targets[0].hp,1501);assert.equal(s.sightline.special,false);assert.equal(s.sightline.crouched,false);
 const pending=make();crouch(pending);fire(pending);pending.damagePlayer(9999,'enemy');tick(pending,{},30);assert.equal(pending.stats.launched,0);
});
test('45 degree view turns slowly while mouse and keyboard shots aim independently',()=>{
 for(const smoothAim of [false,true]){const s=make();crouch(s);tick(s,{aiming:true});tick(s,{aiming:true,aimX:0,aimZ:1,smoothAim},60);const facing=Math.atan2(s.sightline.scopeZ,s.sightline.scopeX);assert.ok(facing<=S.turnRate+1e-8);assert.ok(Math.atan2(s.player.aimZ,s.player.aimX)>1.4);tick(s,{aiming:true,aimX:0,aimZ:1,smoothAim,fire:true});assert.ok(s.sightlinePending.dz>.99);assert.ok(s.sightline.scopeX>.9);}
 const p={x:0,z:0,aimX:1,aimZ:0};for(const [angle,inside] of [[0,true],[22,true],[23,false],[90,false]])assert.equal(inSightCone(p,10*Math.cos(angle*Math.PI/180),10*Math.sin(angle*Math.PI/180)),inside);
 p.sightline={scopeX:0,scopeZ:1};assert.equal(inSightCone(p,0,10),true);assert.equal(inSightCone(p,10,0),false);
});
test('blind aimed fire has the same range; hip fire lands near cursor distance',()=>{
 const s=make();crouch(s);fire(s);const max=s.sightlinePending.range;assert.equal(max,sightlineRange(16/9,1,0));tick(s,{},160);assert.equal(s.sightlineRounds.length,0);
 const hip=make();crouch(hip);tick(hip,{fire:true,aimPointX:8});assert.ok(Math.abs(hip.sightlinePending.range+S.muzzleForward-Math.sqrt(64-S.muzzleLateral**2))<1e-8);
});
test('loadout/input/player and projectile wire data preserve state without client damage authority',()=>{
 const s=make();crouch(s);s.sightline.special=true;tick(s,{aiming:true});const other=make();applyLoadout(other,loadout(s));assert.equal(other.sightline.special,true);assert.equal(playerState('a',s.player).sightline.special,true);assert.equal(playerInput({sightlineX:1,sightlineStance:1}).sightlineX,true);assert.equal(movementInput({reload:true},'sightline').reload,true);assert.equal(movementInput({reload:true},'rifle').reload,undefined);
 fire(s);tick(s,{},10);const packed=pack(s);assert.equal(packed.sightline.length,1);assert.ok(packed.sightline[0].special);assert.equal('damage' in packed.sightline[0],false);
 const mirror=new ProjectileMirror();mirror.update({2:packed},0);const drawn=drawSim(other,mirror.lists(.05));assert.equal(drawn.sightlineRounds.length,1);assert.ok(Number.isFinite(drawn.sightlineRounds[0].id));
});
test('held and slung rifle are long, diagonal and visibly amber; Sidekick fits the holster',()=>{
 const model=makeSightline();poseSightline(model,{special:true},1);const rifle=model.getObjectByName('sightline-rifle'),pistol=model.getObjectByName('sightline-pistol');const axis=new THREE.Vector3(0,0,-1).applyQuaternion(rifle.quaternion);assert.ok(Math.abs(axis.x)>.6);assert.ok(axis.y>.4&&axis.y<.7);assert.ok(rifle.getObjectByName('sightline-vents').visible);assert.equal(pistol.position.z,0);
 const light=rifle.getObjectByName('sightline-breach-light'),sparks=rifle.getObjectByName('sightline-breach-sparks'),before=sparks.instanceMatrix.array.slice();assert.ok(light.visible);
 poseSightline(model,{special:true},1.2);assert.notDeepEqual(sparks.instanceMatrix.array,before,'loaded muzzle sparks move between frames');
 poseSightline(model,{crouched:true,special:true},1);assert.ok(Math.abs(rifle.rotation.x)<1e-8);assert.equal(pistol.position.z,.5);assert.ok(model.getObjectByName('sightline-holster'));poseSightline(model,{crouched:true},2);assert.equal(rifle.getObjectByName('sightline-vents').visible,false);
 assert.equal(light.visible,false,'loaded-round light stops when the special round is gone');
});
test('hill shots carry flight and under-deck starting height',()=>{
 const s=new Simulation(maps['hollow-wick']);s.weapon='sightline';s.targets=[];s.dev.noSpread=true;Object.assign(s.player,{x:-14,z:22.1,below:true});crouch(s);fire(s);tick(s,{},10);assert.ok(s.sightlineRounds.length);for(const b of s.sightlineRounds){assert.ok(b.flight);assert.ok(Number.isFinite(b.y));assert.equal(b.below,true);}
});
test('all three death reactions keep both weapons in the dropped loadout and clean up',()=>{
 for(const damageType of ['sightlineShot','sightlinePistol','sightlineBlast']){
  const player=new THREE.Group(),gun=makeSightline();player.add(gun);player.userData.gun=gun;player.add(new THREE.Mesh(new THREE.BoxGeometry(.3,1,.3),new THREE.MeshLambertMaterial()));
  const scene=new THREE.Scene();scene.add(player);const death=new DeathView({player,scene,qualityName:'performance'});death.start({damageType,x:0,z:0,aimX:1,aimZ:0,directionX:1,directionZ:0});assert.ok(death.gun.children.length>=3);assert.equal(death.reaction.mode,damageType==='sightlineBlast'?'scatter':'corpse');death.update(2);death.clear();assert.equal(scene.children.length,1);assert.ok(player.visible);
 }
});
test('Sidekick rolls 23–27 per shot and carries the same roll into targets, props and host players',t=>{
 for(const [random,damage] of [[.01,23],[.21,24],[.41,25],[.61,26],[.81,27]]){
  t.mock.method(Math,'random',()=>random);const rolled=make([target('roll')]);fire(rolled);assert.equal(rolled.sightlineRounds[0].damage,damage);
  t.mock.method(Math,'random',()=>.5);tick(rolled,{},30);assert.equal(rolled.targets[0].hp,2000-damage,'impact keeps the original shot roll');
 }
 for(const distance of [3,20]){
  const s=make([target('a',distance)]);fire(s);tick(s,{},30);assert.equal(s.targets[0].hp,1975);
 }
 const propSim=make();propSim.props=[{id:'crate',x:4,z:0,hp:200,maxHp:200,kind:'crate'}];propSim.colliders=[{x:4,z:0,w:1,d:1,propId:'crate'}];fire(propSim);tick(propSim,{},15);assert.equal(propSim.props[0].hp,175);
 const arena=new Arena({map,createSim:m=>new Simulation(m),settings:{robots:'off'}}),a=arena.addSeat('a','A'),b=arena.addSeat('b','B');
 for(const seat of [a,b]){seat.present=true;seat.sim.respawn({x:seat===a?0:10,z:seat===a?0:.22});seat.sim.weapon='sightline';seat.sim.dev.noSpread=true;}
 const hp=b.sim.player.hp;
 for(let i=0;i<30;i++){arena.before(a);tick(a.sim,i===0?{fire:true,aiming:true}:{});arena.after(a);}
 assert.equal(b.sim.player.hp,hp-25);
});
test('host resolves a direct special round once and preserves its typed lethal hit',()=>{
 const arena=new Arena({map,createSim:m=>new Simulation(m),settings:{robots:'off'}}),a=arena.addSeat('a','A'),b=arena.addSeat('b','B');
 for(const seat of [a,b]){seat.present=true;seat.sim.respawn({x:seat===a?0:10,z:seat===a?0:.22});seat.sim.weapon='sightline';seat.sim.dev.noSpread=true;}
 a.sim.sightline.crouched=true;a.sim.sightline.special=true;
 for(let i=0;i<35;i++){arena.before(a);tick(a.sim,i===0?{fire:true,aiming:true}:{});arena.after(a);}
 assert.equal(b.sim.player.dead,true);assert.equal(b.sim.events.find(e=>e.type==='playerDeath').damageType,'sightlineBlast');
});
test('each tutorial lesson responds to its matching weapon action',()=>{
 const sim=new Simulation(tutorialMapFor('sightline'));sim.weapon='sightline';assert.ok(sim.targets.every(t=>t.maxHp===1100));
 const events=[{type:'sightlineShot',pistol:true},{type:'sightlineReloaded'},{type:'sightlineStance',crouched:true},{type:'sightlineShot'},{type:'sightlineReloaded',rifle:true},{type:'sightlineReloaded',rifle:true,special:true},{type:'sightlineShot',special:true}];
 for(let i=0;i<COURSES.sightline.length;i++){const tutorial=new Tutorial('sightline');tutorial.index=i;sim.sightline.aiming=true;for(let n=0;n<tutorial.goal;n++)tutorial.event(events[i],sim);assert.ok(tutorial.ready,COURSES.sightline[i].id);}
});
test('robots notice a visible aimed rifle but do not infer its laser through a wall',()=>{
 const sim=make(),brain={sim,time:1,laserResponse:{id:'sniper',kind:'cover',readyAt:.3}};const enemy={id:'sniper',x:10,z:0,aimX:-1,aimZ:0,weapon:'sightline',visible:true,sightline:{crouched:true,aiming:true,rifleAmmo:1}};
 assert.equal(RobotBrain.prototype.threatened.call(brain,enemy,{}),true);assert.equal(RobotBrain.prototype.threatened.call(brain,{...enemy,visible:false},{}),false);
 assert.equal(RobotBrain.prototype.threatened.call(brain,{...enemy,sightline:{crouched:false,aiming:true}},{}),false);
});
test('a sniper bot completes its rifle reload even if it wants cover',()=>{
 const sim=make();sim.sightline.crouched=true;sim.sightline.rifleAmmo=0;const brain={sim,mode:'cover',xAllowed:()=>false};
 for(let i=0;i<255;i++){const input={};RobotBrain.prototype.sightline.call(brain,input,{},15,false,true);tick(sim,input);}
 assert.equal(sim.sightline.rifleAmmo,1);assert.equal(sim.sightline.rifleReload,0);
});
test('setup is 1.5 times faster, still blocks fire, and E cancels immediately',()=>{
 assert.equal(S.setupDuration,2/1.5);
 const s=make();tick(s,{sightlineStance:true,fire:true});assert.ok(s.sightline.setup>1.3);assert.equal(s.stats.launched,0);
 tick(s,{},60);fire(s);assert.equal(s.stats.launched,0);tick(s,{sightlineStance:true});assert.equal(s.sightline.setup,0);assert.equal(s.sightline.crouched,false);
 tick(s,{sightlineStance:true});tick(s,{},79);fire(s);tick(s,{},12);assert.equal(s.stats.launched,1);
});
// v0.992a (owner: the laser was sometimes missing): a reload takes the scope
// down while it runs and gives it back by itself; a held aim no longer has to
// be let go and pressed again, and the Sidekick's reload leaves the rifle alone.
test('a reload takes the scope down while it runs and gives it back by itself',()=>{
 const s=make();crouch(s);tick(s,{aiming:true});assert.ok(scopeActive(s));
 tick(s,{reload:true,aiming:true});assert.ok(scopeActive(s),'R with a round in: nothing to reload, the scope stays');
 fire(s);tick(s,{aiming:true},12);assert.equal(s.sightline.rifleAmmo,0);assert.ok(s.sightline.rifleReload>4);assert.equal(scopeActive(s),false);
 tick(s,{aiming:true},260);assert.equal(s.sightline.rifleAmmo,1);assert.ok(scopeActive(s),'back by itself, aim still held');
 s.sightline.pistolReload=1.5;tick(s,{aiming:true});assert.ok(scopeActive(s),"the Sidekick's reload does not take the rifle's scope");
 tick(s,{aiming:true},100);tick(s,{aiming:true,sightlineX:true});assert.equal(scopeActive(s),false);assert.ok(s.sightline.xLoading);
});
test('Breach muzzle and landing blasts spare their shooter but hurt nearby opponents with blast reactions',()=>{
 const s=make([target('near',1.81,1.1,30)]);crouch(s);s.sightline.special=true;const hp=s.player.hp;fire(s);tick(s,{},12);
 assert.equal(s.targets[0].hp,0);assert.equal(s.player.hp,hp);assert.ok(s.events.some(e=>e.type==='kill'&&e.damageType==='sightlineBlast'));
 const close=make([target('a',3)]);crouch(close);close.sightline.special=true;fire(close);tick(close,{},30);assert.equal(close.player.hp,500);assert.ok(close.targets[0].hp<1250);
});
test('muzzle blast respects cover',()=>{
 const s=make([target('near',1.81,1.1,500)]);s.colliders=[{x:1.81,z:.7,w:2,d:.1}];crouch(s);s.sightline.special=true;fire(s);tick(s,{},12);assert.equal(s.targets[0].hp,500);
});
test('scope places the player at the rear edge in every direction and adds at most six percent for height',()=>{
 for(const aspect of [.5625,16/9,2.2])for(const [dx,dz] of [[0,1],[0,-1],[1,0],[-1,0]]){
  const f=sightlineCamera(aspect,dx,dz),h=f.scale*OUTDOOR_CAMERA_HEIGHT;
  const camera=new THREE.PerspectiveCamera(fairFov(aspect),aspect,.1,300);camera.position.set(dx*f.lead,h,dz*f.lead+h*CAMERA_TILT);camera.lookAt(dx*f.lead,0,dz*f.lead);camera.updateMatrixWorld();
  const p=new THREE.Vector3().project(camera);assert.ok(Math.abs(p.x)<.96&&Math.abs(p.y)<.96);
  if(dx)assert.ok(p.x*dx<-.6);else assert.ok(p.y*dz>.6);
  const base=sightlineRange(aspect,dx,dz),high=sightlineRange(aspect,dx,dz,8);assert.ok(base>12);assert.equal(f.scale,1.46);assert.ok(f.scale/1.325>1.09&&f.scale/1.325<1.11);assert.ok(high>base&&high<=base*1.061);
 }
 assert.equal(sightlineElevation(-8),1);assert.equal(sightlineElevation(100),1.06);
});
test('scope shading is uniform driven, prewarmable and updates without touching materials',()=>{
 const shading=new ScopeShading(),mesh=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshLambertMaterial()),root=new THREE.Group();root.add(mesh);shading.apply(root);
 const compile=mesh.material.onBeforeCompile,shader={uniforms:{},vertexShader:THREE.ShaderLib.lambert.vertexShader,fragmentShader:THREE.ShaderLib.lambert.fragmentShader};compile(shader);
 assert.ok(shader.vertexShader.includes('instanceMatrix*scopeGrayPosition'));assert.ok(shader.fragmentShader.includes('scopeGrayLimit>0.'));
 const version=mesh.material.version,s=make();crouch(s);tick(s,{aiming:true});shading.update(s);assert.ok(shading.limit.value>0);tick(s);shading.update(s);assert.equal(shading.limit.value,-2);shading.apply(root);assert.equal(mesh.material.version,version);const rebuilt=new ScopeShading();rebuilt.apply(root);const again={uniforms:{},vertexShader:THREE.ShaderLib.lambert.vertexShader,fragmentShader:THREE.ShaderLib.lambert.fragmentShader};mesh.material.onBeforeCompile(again);assert.equal(again.vertexShader.match(/varying vec2 scopeGrayWorld/g).length,1);assert.equal(again.uniforms.scopeGrayLimit,rebuilt.limit);
});
test('rifle draws swiftly while crouch and bipod settle over the setup; clones remain poseable',()=>{
 const model=makeSightline(),s={crouched:true};poseSightline(model,s,S.setupDuration/2,S.setupDuration/2);assert.equal(model.userData.sightlinePose.held,1);assert.equal(model.userData.sightlinePose.bodyCrouch,.5);
 poseSightline(model,s,S.setupDuration,S.setupDuration/2);assert.equal(model.userData.sightlinePose.held,1);poseSightline(model,{},S.setupDuration+.42,.42);assert.equal(model.userData.sightlinePose.held,0);
 const clone=model.clone();assert.doesNotThrow(()=>poseSightline(clone,s,3,.1));
 const rifle=model.getObjectByName('sightline-rifle');model.position.set(.27,.74,-.46);model.updateMatrixWorld(true);
 for(let z=-1.35;z<.61;z+=.025){const p=rifle.localToWorld(new THREE.Vector3(0,.045,z));if(p.y>1.015&&p.y<1.34)assert.ok(Math.hypot(p.x,p.z)>.44,'barrel clears hat');}
});
test('both ammo rows preserve their counts across stance, X loading and reload',()=>{
 const s={pistolAmmo:7,rifleAmmo:1,pistolReload:0,rifleReload:0};let rows=sightlineAmmoPresentation(s);assert.equal(rows[0].active,true);assert.equal(rows[1].ammo,1);
 rows=sightlineAmmoPresentation({...s,crouched:true});assert.equal(rows[1].active,true);assert.equal(rows[0].ammo,7);
 rows=sightlineAmmoPresentation({...s,xLoading:true,rifleAmmo:0,rifleReload:3});assert.equal(rows[1].active,true);assert.equal(rows[1].reload,3);assert.equal(rows[0].ammo,7);
});

test('scope edge calculation matches the visible ground across screen shapes and aim angles',()=>{
 for(const aspect of [.3,.5625,1,16/9,2.2,3.5])for(let angle=0;angle<Math.PI*2;angle+=.11){
  const dx=Math.cos(angle),dz=Math.sin(angle),f=sightlineCamera(aspect,dx,dz),edge=f.lead/(f.scale*S.scopeLeadShare);
  assert.equal(onScreenOf(aspect,-dx*(edge-.0001),-dz*(edge-.0001)),true);
  assert.equal(onScreenOf(aspect,-dx*(edge+.0001),-dz*(edge+.0001)),false);
 }
});

test('aim revives a warmup-hidden laser, reuses its path, and follows changing cover before cleaning up',()=>{
 const player=new THREE.Group();player.userData.gun=new THREE.Group();player.userData.body=new THREE.Group();
 const view={player,scene:new THREE.Scene(),rifleView:{pose:{update(){}}},cameraHeight:77,qualityName:'potato'},fx=new SightlineView(view),s=make();
 tick(s,{aiming:true});fx.update(s,0);assert.equal(fx.lines.count,0,'aiming Sidekick has no laser');assert.equal(fx.lines.visible,false);
 view.remotePlayers=[{id:'other',x:4,z:4,aimX:1,aimZ:0,hp:500,sightline:{crouched:false,aiming:true}}];fx.update(s,0);assert.equal(fx.lines.count,0,'remote Sidekick has no laser');view.remotePlayers=[];
 crouch(s);tick(s,{aiming:true});
 fx.guideLines.visible=false;fx.update(s,0);assert.ok(fx.guideLines.count>0);assert.equal(fx.guideLines.visible,true);
 const path=fx.laserPaths.values().next().value;fx.update(s,0);assert.equal(fx.laserPaths.values().next().value,path);
 s.colliders=[{x:5,z:0,w:1,d:3}];fx.update(s,0);const blocked=fx.laserPaths.values().next().value;assert.notEqual(blocked,path);assert.ok(Math.abs(blocked.points.at(-3)-4.465)<1e-8);
 s.colliders=[];fx.update(s,0);const cleared=fx.laserPaths.values().next().value;assert.ok(Math.abs(cleared.points.at(-3)-25)<.01);
 s.colliders.push({x:6,z:0,w:1,d:3});fx.update(s,0);assert.ok(Math.abs(fx.laserPaths.values().next().value.points.at(-3)-5.465)<1e-8);
 s.player.x+=1;fx.update(s,0);assert.equal(fx.laserPaths.values().next().value.x,s.player.x);
 tick(s,{sightlineStance:true,aiming:true});fx.update(s,0);assert.equal(fx.guideLines.visible,false,'switching to aimed Sidekick removes the laser');assert.equal(fx.laserPaths.size,0);fx.clear();assert.equal(fx.lines.count,0);
});


test('Sightline and Sidekick share two dashes with a five percent shorter recharge',()=>{
 const s=make();s.respawn({x:0,z:0});assert.equal(s.maxStamina,2);assert.equal(s.player.stamina,2);
 tick(s,{dodge:true,moveX:1});assert.equal(s.player.stamina,1);tick(s,{},16);tick(s,{dodge:true,moveX:1});assert.equal(s.player.stamina,0);tick(s,{moveX:1},16);tick(s,{dodge:true,moveX:1});assert.equal(s.player.dodgeRemaining,0);
 s.player.stamina=0;s.player.staminaWait=0;tick(s,{},90);assert.ok(Math.abs(s.player.stamina-1.5/(RULES.staminaRecharge*.95))<1e-8);
 crouch(s);assert.equal(s.maxStamina,2);assert.equal(s.player.stamina,2);tick(s,{dodge:true});assert.equal(s.player.dodgeRemaining,0);assert.equal(s.player.stamina,2);
 s.weapon='omen';assert.equal(s.maxStamina,1);assert.equal(s.staminaRate,1);
});

test('X replaces an unfinished ordinary Sightline reload with a full Breach reload when ready',()=>{
 const s=make();crouch(s);s.sightline.rifleAmmo=0;tick(s,{reload:true});tick(s,{},100);assert.ok(s.sightline.rifleReload<3);
 tick(s,{sightlineX:true,aiming:true});assert.equal(s.sightline.rifleReload,4.2);assert.equal(s.sightline.xLoading,true);assert.equal(scopeActive(s),false);assert.equal(s.sightline.crouched,true);
 tick(s,{},60);const remaining=s.sightline.rifleReload;tick(s,{sightlineX:true});assert.ok(s.sightline.rifleReload<remaining,'X cannot restart Breach loading');tick(s,{},191);assert.equal(s.sightline.special,true);assert.equal(s.sightline.rifleAmmo,1);
 const cooling=make();crouch(cooling);cooling.sightline.rifleAmmo=0;cooling.sightline.xCooldown=20;tick(cooling,{reload:true});tick(cooling,{},50);const before=cooling.sightline.rifleReload;tick(cooling,{sightlineX:true});assert.equal(cooling.sightline.xLoading,false);assert.ok(cooling.sightline.rifleReload<before);
});

test('scope and precise laser aim are disabled inside buildings and standing crops',()=>{
 const s=make();crouch(s);tick(s,{aiming:true});assert.ok(scopeActive(s));
 s.map={...s.map,buildings:[{id:'test-room',x:0,z:0,w:8,d:8}]};tick(s,{aiming:true});assert.equal(scopeActive(s),false);assert.equal(s.sightline.aiming,false);s.map={...s.map,buildings:[]};
 s.crops=[{x:0,z:0,w:8,d:8,state:'standing'}];assert.equal(scopeActive(s),false);s.crops[0].state='burning';assert.equal(scopeActive(s),false);s.crops[0].state='gone';tick(s,{aiming:true});assert.equal(scopeActive(s),true);
});

test('Sightline clears low rocks and debris while Sidekick and tall cover retain their stops',()=>{
 for(const height of [.5,.8,1.1,1.2]){const s=make([target('a')]);s.colliders=[{x:5,z:0,w:1,d:3,height}];crouch(s);fire(s);tick(s,{},30);assert.equal(s.targets[0].hp,1501);const side=make([target('a')]);side.colliders=s.colliders;fire(side);tick(side,{},30);assert.equal(side.targets[0].hp,2000);}
 const s=make([target('a')]);s.colliders=[{x:5,z:0,w:1,d:3,height:1.5}];crouch(s);fire(s);tick(s,{},30);assert.equal(s.targets[0].hp,2000);
});

test('straight laser and shot clear a bridge above its deck and stay below it from underneath',()=>{
 const s=make(),floor=(x)=>x<-3?2:0;
 s.ground={...FLAT,flat:false,decks:[{h:2}],deckAt:x=>Math.abs(x)<=1?0:-1,drawnHeightAt:floor,heightAt:x=>Math.abs(x)<=1?2:floor(x)};
 const p={x:-5,z:0,aimReach:10},ray=sightlineFlight(s,p,1,0,20,segmentBox);
 assert.ok(sightlineY(s,ray,-ray.x)>2,'beam clears bridge top');assert.ok((ray.stop??Infinity)>-ray.x);
 const dy=(sightlineY(s,ray,10)-sightlineY(s,ray,0))/10;for(let d=0;d<10;d+=.25)assert.ok(Math.abs(sightlineY(s,ray,d)-(ray.y+dy*d))<1e-9,'no terrain bend');
 const under=sightlineFlight(s,{x:0,z:0,below:true,aimReach:8},1,0,12,segmentBox);assert.equal(under.baseY,0);assert.equal(under.y,S.roundHeight);assert.ok(under.y<2);assert.equal(under.below,true);
 s.ground={...s.ground,drawnHeightAt:x=>x>4?5:0,heightAt:x=>x>4&&x<5?5:0,deckAt:()=>-1};const cliff=sightlineFlight(s,{x:0,z:0,aimReach:10},1,0,15,segmentBox);assert.ok(cliff.stop<4);assert.equal(sightlineGuideEnd(s,cliff,segmentBox),cliff.stop);
});

test('laser ignores pierceable cover, shares the elevated shot height, and refreshes cursor distance',()=>{
 const s=make();s.colliders=[{x:5,z:0,w:1,d:3,height:1.1},{x:8,z:0,w:1,d:3,height:2,propId:'crate',destructible:true},{x:13,z:0,w:1,d:3,height:2}];
 const ray=sightlineFlight(s,s.player,1,0,20,segmentBox);assert.ok(Math.abs(sightlineGuideEnd(s,ray,segmentBox)-(12.465-ray.x))<1e-8);
 const player=new THREE.Group();player.userData.gun=new THREE.Group();player.userData.body=new THREE.Group();const fx=new SightlineView({player,scene:new THREE.Scene(),rifleView:{pose:{update(){}}},cameraHeight:38});crouch(s);tick(s,{aiming:true});fx.update(s,0);assert.ok(fx.aimEnd.x<13);
 tick(s,{aiming:true,aimPointX:4});fx.update(s,0);assert.ok(Math.abs(fx.aimEnd.x-Math.sqrt(16-S.muzzleLateral**2))<1e-8);assert.equal(fx.aimEnd.y,S.roundHeight);fx.clear();assert.equal(fx.guideLines.count,0);
});

test('Breach yellow crackles animate in the existing batches and clear after the blast',()=>{
 const s=make(),player=new THREE.Group();player.userData={gun:new THREE.Group(),body:new THREE.Group()};
 const view={player,scene:new THREE.Scene(),gy:()=>0,qualityName:'performance',cameraHeight:38,fx:{on:false,puff(){}},rifleView:{pose:{update(){}}}};
 const fx=new SightlineView(view);crouch(s);tick(s,{aiming:true});fx.update(s,.01);const normal=fx.guideLines.count;
 s.sightline.special=true;fx.update(s,.07);assert.ok(fx.guideLines.count>normal,'yellow filaments join the red guide');
 const frame=fx.guideLines.instanceMatrix.array.slice();fx.update(s,.08);assert.notDeepEqual(fx.guideLines.instanceMatrix.array,frame);
 s.sightline.aiming=false;fx.breachBurst({x:3,z:2,radius:4.5});fx.update(s,.05);assert.ok(fx.lines.count>0);assert.equal(fx.guideLines.count,0,'blast uses depth-tested world batch');
 for(let i=0;i<20;i++)fx.breachBurst({x:i,z:2,radius:4.5});assert.equal(fx.crackles.length,12,'overlapping effects stay bounded');
 fx.update(s,.8);assert.equal(fx.crackles.length,0);assert.equal(fx.lines.count,0);
 fx.breachBurst({x:0,z:0,radius:4.5});fx.clear();assert.equal(fx.crackles.length,0);assert.ok(fx.meshes.every(m=>!m.visible&&m.count===0));
});

test('own guide remains visible outside the lagging view without revealing other beams',()=>{
 const mask=new InteriorVisibility(),gray=new ScopeShading();for(const own of [false,true]){const m=new THREE.MeshBasicMaterial();m.userData.ownSightlineGuide=own;const mesh=new THREE.Mesh(new THREE.BoxGeometry(),m);mask.apply(mesh);gray.apply(mesh);const shader={uniforms:{},vertexShader:THREE.ShaderLib.basic.vertexShader,fragmentShader:THREE.ShaderLib.basic.fragmentShader};m.onBeforeCompile(shader);assert.equal(shader.fragmentShader.includes('scopeGrayLimit>0.'),!own);assert.equal(shader.fragmentShader.includes('if(distanceToPoint>.6'),!own);}
});

test('draw, return and both reload animations keep the long Sightline clear of body and hat',()=>{
 const model=makeSightline(),point=new THREE.Vector3();model.position.set(.27,.74,-.46);const rifle=model.getObjectByName('sightline-rifle');
 for(const mode of ['draw','return','reload','breach'])for(let frame=0;frame<=80;frame++){
  const t=frame/80,s=mode==='draw'?{crouched:true}:mode==='reload'?{crouched:true,rifleReload:4.2*(1-t)}:mode==='breach'?{xLoading:true,rifleReload:4.2*(1-t)}:{};
  model.userData.sightlinePose.held=mode==='draw'?t:mode==='return'?1-t:1;poseSightline(model,s,t,0);model.updateMatrixWorld(true);
  // Light halos and drifting sparks are not solid parts of the weapon.
  rifle.traverse(o=>{if(!o.isMesh||!o.visible||o.material.blending===THREE.AdditiveBlending)return;const positions=o.geometry.attributes.position;for(let i=0;i<positions.count;i++){point.fromBufferAttribute(positions,i).applyMatrix4(o.matrixWorld);const r=Math.hypot(point.x,point.z);if(point.y>.31&&point.y<.88)assert.ok(r>=.29,mode+' torso frame '+frame);if(point.y>1.0175&&point.y<1.1025)assert.ok(r>=.39,mode+' brim frame '+frame);if(point.y>1.1&&point.y<1.3)assert.ok(r>=.235,mode+' hat frame '+frame);}});
 }
});

test('the actual Hollow Wick bridge is cleared by a high bank shot and its public guide',()=>{
 const s=new Simulation(maps['hollow-wick']),p={x:-24,z:32,aimReach:Math.hypot(24,22)},a=Math.atan2(-22,24),ray=sightlineFlight(s,p,Math.cos(a),Math.sin(a),60,segmentBox);let crossings=0;
 for(let d=0;d<30;d+=.25){const x=ray.x+ray.dx*d,z=ray.z+ray.dz*d;if(s.ground.deckAt(x,z)<0)continue;crossings++;assert.ok(sightlineY(s,ray,d)>s.ground.heightAt(x,z)+.2);assert.ok(d<(ray.stop??Infinity));}assert.ok(crossings>4);
 const mirror=new ProjectileMirror();s.weapon='sightline';s.sightlineRounds=[{...ray,id:1,travel:0,pistol:false}];mirror.update({1:pack(s)},0);const b=mirror.lists(.05).sightlineRounds[0];assert.ok(Math.abs(b.y-(Math.round(ray.y*100)/100+ray.flight.slope*S.speed*.05))<1e-8);
 const player=new THREE.Group();player.userData.gun=new THREE.Group();const fx=new SightlineView({player,scene:new THREE.Scene()});for(const mesh of fx.meshes){assert.ok(mesh.renderOrder>0);assert.equal(mesh.material.depthTest,mesh!==fx.guideLines);}
});

test('bloom corners share a firing plane across bridge edges instead of twisting with terrain',()=>{
 const s=new Simulation(maps['hollow-wick']);
 for(const sniper of [false,true])for(let angle=-Math.PI;angle<Math.PI;angle+=.13){
  const p={x:-24,z:32,aimX:Math.cos(angle),aimZ:Math.sin(angle),aimReach:26},plane=sightlineAimPlane(s,p,sniper);
  for(const reach of [5,16,26]){const cx=plane.x+p.aimX*reach,cz=plane.z+p.aimZ*reach,width=Math.tan(.26)*reach;
   const left=plane.height(cx-p.aimZ*width,cz+p.aimX*width),right=plane.height(cx+p.aimZ*width,cz-p.aimX*width);
   assert.ok(Math.abs(left-right)<1e-8,'both edges share a height across bridge and stream');assert.ok(Number.isFinite(left));
  }
  assert.equal(plane.forward,sniper?S.muzzleForward:.75);
 }
});

test('Sightline arms keep natural fixed lengths in stance, setup, return and both reloads',()=>{
 const player=new THREE.Group(),body=new THREE.Group(),gun=new THREE.Group();player.add(body);body.add(gun);gun.position.set(.27,.74,-.46);player.userData={body,gun};const model=makeSightline();gun.add(model);const rig=new RiflePose(player);
 for(const mode of ['draw','return','reload','breach'])for(let frame=0;frame<=60;frame++){
  const t=frame/60,s=mode==='draw'?{crouched:true}:mode==='return'?{}:mode==='reload'?{crouched:true,rifleReload:4.2*(1-t)}:{xLoading:true,rifleReload:4.2*(1-t)};
  model.userData.sightlinePose.held=mode==='draw'?t:mode==='return'?1-t:1;poseSightline(model,s,t,0);rig.update({weapon:'sightline',sightline:s,time:t},0,0,0);
  for(const arm of rig.arms){assert.ok(Math.abs(arm.upper.scale.y-.33)<1e-8,mode+' upper arm');assert.ok(Math.abs(arm.lower.scale.y-.35)<1e-8,mode+' forearm');assert.ok(arm.target.distanceTo(arm.shoulder)<=.67500001);}
 }
 poseSightline(model,{crouched:true},1);rig.update({weapon:'sightline',sightline:{crouched:true},time:1},0,0,0);const grip=new THREE.Vector3(-.01,-.065,.04);player.updateMatrixWorld(true);model.getObjectByName('sightline-rifle').localToWorld(grip);assert.ok(rig.offHand.position.distanceTo(grip)<.02,'support hand still meets receiver');
});

test('swift draw deploys the bipod during the remaining setup and folds it for Sidekick',()=>{
 const model=makeSightline();poseSightline(model,{crouched:true},.28,.28);assert.equal(model.userData.sightlinePose.held,1);assert.ok(model.userData.sightlinePose.support<.1);assert.ok(model.userData.sightlinePose.bodyCrouch<.15);
 poseSightline(model,{crouched:true},S.setupDuration,S.setupDuration-.28);assert.equal(model.userData.sightlinePose.support,1);assert.equal(model.userData.sightlinePose.bodyCrouch,1);
 const left=model.getObjectByName('sightline-leg-left'),right=model.getObjectByName('sightline-leg-right');assert.ok(left.rotation.z<0&&right.rotation.z>0);assert.ok(Math.abs(left.rotation.x)<.1);
 poseSightline(model,{},2.42,.42);assert.equal(model.userData.sightlinePose.support,0);assert.equal(model.userData.sightlinePose.held,0);assert.ok(Math.abs(left.rotation.x+Math.PI/2)<1e-8);
});

test('holding aim indoors uses sniper bloom and cursor range, with no local or remote laser',()=>{
 const s=make();s.map={...s.map,buildings:[{id:'room',x:0,z:0,w:12,d:12}]};crouch(s);tick(s,{aiming:true,fire:true,aimPointX:7});assert.equal(s.sightline.aiming,false);assert.ok(s.sightlinePending.range<6);
 const player=new THREE.Group();player.userData.gun=new THREE.Group();player.userData.body=new THREE.Group();const view={player,scene:new THREE.Scene(),rifleView:{pose:{update(){}}},cameraHeight:29,remotePlayers:[{id:'other',x:2,z:0,aimX:1,aimZ:0,hp:500,sightline:{crouched:true,aiming:true}}]},fx=new SightlineView(view);fx.update(s,0);assert.equal(fx.guideLines.count,0);assert.equal(fx.lines.count,0);
});

test('cursor unprojection, muzzle bearing and laser endpoint align on flat ground and bridge banks',()=>{
 for(const terrain of [false,true]){
  const sim=terrain?new Simulation(maps['hollow-wick']):make();sim.weapon='sightline';sim.sightline.crouched=true;
  Object.assign(sim.player,terrain?{x:-24,z:32}:{x:0,z:0});
  const x=terrain?0:12,z=terrain?10:8,ground=sim.ground;
  const camera=new THREE.PerspectiveCamera(48,16/9,.1,300);camera.position.set(0,38,40);camera.lookAt(0,0,10);camera.updateMatrixWorld();
  const target=new THREE.Vector3(x,ground.heightAt(x,z)+S.roundHeight,z),screen=target.clone().project(camera);
  const view={camera,ground,lastSim:sim,raycaster:new THREE.Raycaster(),aimHit:new THREE.Vector3(),cursorWorld:new THREE.Vector3(),aimPlane:new THREE.Plane(new THREE.Vector3(0,1,0),-.7),canvasRect:()=>({left:0,top:0,width:1600,height:900}),aimOnGround:WorldView.prototype.aimOnGround};
  const hit=WorldView.prototype.aim.call(view,(screen.x+1)*800,(1-screen.y)*450,sim.player);
  assert.ok(Math.hypot(hit.aimPointX-x,hit.aimPointZ-z)<.002,'cursor ray meets the elevated firing surface');
  const lateral=muzzleLateral('sightline',true);assert.equal(lateral,S.muzzleLateral);assert.equal(muzzleLateral('sightline',false),.22);
  const a=muzzleBearing(sim.player.x,sim.player.z,hit.aimPointX,hit.aimPointZ,lateral);
  Object.assign(sim.player,{aimX:Math.cos(a),aimZ:Math.sin(a),aimReach:Math.hypot(x-sim.player.x,z-sim.player.z)});
  sim.colliders=[];const player=new THREE.Group();player.userData.gun=new THREE.Group();const fx=new SightlineView({player,scene:new THREE.Scene()});
  const path=fx.laserPath(sim,sim.player,sim.sightline),end=new THREE.Vector3(...path.points.slice(-3));
  assert.ok(end.distanceTo(target)<.003,'guide ends at the cursor on either surface');
  const projected=end.project(camera);assert.ok(Math.hypot((projected.x-screen.x)*800,(projected.y-screen.y)*450)<.1,'guide endpoint is within a tenth of a pixel');
 }
});

test('normal and Breach guide cores stay attached to the visible muzzle throughout setup',()=>{
 const sim=make();crouch(sim);tick(sim,{aiming:true});
 const player=new THREE.Group(),body=new THREE.Group(),gun=new THREE.Group();player.add(body);body.add(gun);gun.position.set(.27,.74,-.46);player.userData={body,gun};
 const view={player,scene:new THREE.Scene(),cameraHeight:29,rifleView:{pose:new RiflePose(player)}};view.scene.add(player);const fx=new SightlineView(view),matrix=new THREE.Matrix4();
 for(const special of [false,true])for(const progress of [.3,.7,1]){
  sim.sightline.special=special;fx.model.userData.sightlinePose.held=progress;fx.update(sim,0);
  fx.guideLines.getMatrixAt(0,matrix);const start=new THREE.Vector3(0,-.5,0).applyMatrix4(matrix),muzzle=fx.model.getObjectByName('sightline-rifle').localToWorld(new THREE.Vector3(0,.045,-1.359));
  assert.ok(start.distanceTo(muzzle)<1e-5,'beam starts at animated barrel');
  const end=new THREE.Vector3(0,.5,0).applyMatrix4(matrix);assert.ok(end.distanceTo(new THREE.Vector3(fx.aimEnd.x,fx.aimEnd.y,fx.aimEnd.z))<1e-5,'one straight core reaches its guide endpoint');
 }
});


test('local and remote empty Sightlines hide their laser, and ammo survives player snapshots',()=>{
 const sim=make();crouch(sim);tick(sim,{aiming:true});
 const player=new THREE.Group();player.userData.gun=new THREE.Group();player.userData.body=new THREE.Group();const view={player,scene:new THREE.Scene(),rifleView:{pose:{update(){}}},cameraHeight:29},fx=new SightlineView(view);
 fx.update(sim,0);assert.ok(fx.guideLines.count>0);
 sim.sightline.rifleAmmo=0;tick(sim,{aiming:true});fx.update(sim,0);assert.equal(fx.guideLines.count,0);assert.equal(playerState('a',sim.player).sightline.rifleAmmo,0);
 view.remotePlayers=[{...sim.player,id:'other',sightline:{...sim.player.sightline}}];fx.update(sim,0);assert.equal(fx.lines.count,0);
 // (v0.992a: the empty rifle has started reloading itself: no laser through the reload either.)
 assert.ok(sim.sightline.rifleReload>4);fx.update(sim,0);assert.equal(fx.guideLines.count,0,'no laser while it reloads');
 sim.sightline.rifleAmmo=1;sim.sightline.rifleReload=0;tick(sim,{aiming:true});assert.equal(playerState('a',sim.player).sightline.rifleAmmo,1);fx.update(sim,0);assert.ok(fx.guideLines.count>0);
});

// v0.992a (owner: "make sure the sniper auto reload is cancellable by player
// uncrouching or moving"): standing up or pushing to move ends it; crouching
// again with the rifle empty starts it again.
test('the rifle reloads itself in the stance; standing up or moving ends it',()=>{
 const s=make();crouch(s);fire(s);tick(s,{},12);assert.ok(s.sightline.rifleReload>4,'reloading itself');
 tick(s,{sightlineStance:true});assert.equal(s.sightline.crouched,false);assert.equal(s.sightline.rifleReload,0);assert.equal(s.sightline.rifleAmmo,0,'standing ended it');
 crouch(s);assert.ok(s.sightline.rifleReload>0,'crouching again with it empty starts it again');
 const x=s.player.x;tick(s,{moveX:1},2);assert.equal(s.sightline.crouched,false,'moving stands you up');assert.equal(s.sightline.rifleReload,0);assert.equal(s.sightline.rifleAmmo,0);assert.ok(s.player.x>x,'and you walk');
 // A small push (under the threshold) does nothing; nor does moving with a round loaded.
 crouch(s);tick(s,{moveX:.3},5);assert.equal(s.sightline.crouched,true);assert.ok(s.sightline.rifleReload>0);
 tick(s,{},260);assert.equal(s.sightline.rifleAmmo,1);tick(s,{moveX:1},5);assert.equal(s.sightline.crouched,true,'loaded, the stance holds');
});

test('the placement guide draws past fog without depth holes and still stops at solid cover',()=>{
 const sim=make();crouch(sim);tick(sim,{aiming:true});sim.colliders=[{x:7,z:0,w:1,d:3,height:3}];
 const player=new THREE.Group();player.userData.gun=new THREE.Group();player.userData.body=new THREE.Group();const fx=new SightlineView({player,scene:new THREE.Scene(),rifleView:{pose:{update(){}}},cameraHeight:29});fx.update(sim,0);
 assert.equal(fx.guideLines.material.depthTest,false);assert.ok(fx.guideLines.renderOrder>5);assert.equal(fx.lines.material.depthTest,true);assert.ok(fx.aimEnd.x<6.5);
 const local=fx.laserPath(sim,sim.player,sim.sightline),remote={...sim.player,id:'remote'};delete remote.aimReach;delete remote.aimPointX;delete remote.aimPointZ;
 const other=fx.laserPath(sim,remote,{...sim.sightline,aimReach:sim.player.aimReach});assert.deepEqual(other.points,local.points);
});
