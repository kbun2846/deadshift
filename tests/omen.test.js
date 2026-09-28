import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Simulation } from '../src/simulation.js';
import { OMEN, omenDamage, omenBlastDamage } from '../src/weapons/omen.js';
import { playerInput, loadout, applyLoadout } from '../src/net/protocol.js';
import { pack, ProjectileMirror, drawSim } from '../src/net/projectiles.js';
import { Arena } from '../src/net/arena.js';
import { HostSession } from '../src/net/host-session.js';
import { maps } from '../src/maps.js';
import { makeOmen } from '../src/weapons/omen-model.js';
import { OmenView, sigilTendrilPoint } from '../src/weapons/omen-view.js';
import { DeathView } from '../src/effects/death-view.js';
import { omenReadouts } from '../src/ui/omen-state.js';
import { WorldView } from '../src/render/renderer.js';
// Mechanics tests use the middle damage roll; the bounds test exercises both
// extremes explicitly, independent of random visual particle choices.
beforeEach(t=>t.mock.method(Math,'random',()=>.5));
const map={id:'omen-test',width:120,depth:120,spawn:{x:0,z:0},buildings:[],fences:[],props:[],targets:[]};
const make=(targets=[])=>{const s=new Simulation({...map,targets});s.weapon='omen';s.dev.noSpread=true;return s;};
const target=(id,x=5,z=.27,hp=1000)=>({id,x,z,kind:'robot',maxHp:hp});
const tick=(s,input={},n=1)=>{for(let i=0;i<n;i++)s.step({aimX:1,aimZ:0,...input});};
const close=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-8,`${actual} should equal ${expected}`);
const curse=(s,kind='e',left=3.5,id=s.targets[0].id)=>{
 const t=s.targets.find(t=>t.id===id);s.omen.marks.push({id,kind,group:1,x:t.x,z:t.z,left,duration:kind==='x'?4:3.5,tick:0});
 if(kind==='x'){s.omen.group=1;s.omen.volleyLeft=left;}
};

test('Omen ignores aim-in inputs without changing walking speed or shot spread',t=>{
 t.mock.method(Math,'random',()=>.8);
 const normal=make(),aimInput=make();normal.dev.noSpread=aimInput.dev.noSpread=false;
 tick(normal,{moveZ:1,fire:true});tick(aimInput,{moveZ:1,fire:true,aiming:true});
 assert.deepEqual(aimInput.omenBolts,normal.omenBolts,'the same ordinary spread is used');
 tick(normal,{moveZ:1},30);tick(aimInput,{moveZ:1,aiming:true},30);
 assert.equal(aimInput.player.z,normal.player.z,'aim input cannot slow Omen movement');
 assert.equal(aimInput.player.vz,normal.player.vz);assert.equal(aimInput.omen.aiming,false);
});

test('E and X curse clicks recur once a second at the target, stop at expiry and reach other screens',()=>{
 for(const kind of ['e','x']){
  const s=make([target('a')]);curse(s,kind,kind==='e'?3.5:4);
  const beats=()=>s.events.filter(e=>e.type==='omenCurseBeat');
  tick(s,{},59);assert.equal(beats().length,0);
  Object.assign(s.targets[0],{x:7,z:3});tick(s);
  assert.equal(beats().length,1);assert.deepEqual([beats()[0].x,beats()[0].z],[7,3]);
  tick(s,{},60);assert.equal(beats().length,2);
  tick(s,{},60);assert.equal(beats().length,3);
  tick(s,{},120);assert.equal(beats().length,3,'no click at or after the expiry endpoint');
  const host={eventSeq:0,tick:180,sentTick:0,folds:new Map(),localEvents:[],log:[]};
  HostSession.prototype.record.call(host,'caster',beats());
  assert.equal(host.log.length,3);assert.equal(host.localEvents.length,3);
  assert.ok(host.log.every(entry=>entry.e.type==='omenCurseBeat'&&entry.e.x===7&&entry.e.z===3));
 }
});

test('curse sound stops on detonation, target death and caster death',()=>{
 for(const end of ['rupture','victim','caster']){
  const s=make([target('a')]);curse(s);tick(s,{},60);assert.ok(s.events.some(e=>e.type==='omenCurseBeat'));
  if(end==='rupture')tick(s,{omenPrime:true});
  if(end==='victim')s.targets[0].hp=0;
  if(end==='caster')s.damagePlayer(9999,'enemy');
  s.drainEvents();tick(s,{},180);assert.equal(s.events.filter(e=>e.type==='omenCurseBeat').length,0,end);
 }
 const lethal=make([target('a')]);curse(lethal);lethal.targets[0].hp=20;tick(lethal,{},60);
 assert.equal(lethal.targets[0].hp,0);assert.ok(!lethal.events.some(e=>e.type==='omenCurseBeat'),'a lethal tick does not start another click');
});
test('Omen fires straight travelling diamonds at its cadence, reloads and never invokes other weapons',()=>{
 const s=make([target('a')]);assert.equal(s.omen.ammo,4);tick(s,{fire:true,omenPrime:true});assert.equal(s.omen.ammo,3);assert.equal(s.grenades.length,0);assert.equal(s.hexOrbs.length,0);
 assert.equal(s.omenBolts[0].kind,'e');assert.equal(s.targets[0].hp,1000);tick(s,{},12);assert.equal(s.targets[0].hp,950.5);assert.equal(s.omen.marks.length,1);
 const cadence=make();tick(cadence,{fire:true});tick(cadence,{fire:true},25);assert.equal(cadence.stats.launched,1,'no second shot before 0.42 seconds');
 tick(cadence,{fire:true});assert.equal(cadence.stats.launched,2,'fires on the first fixed step after 0.42 seconds');
 const a=make();tick(a,{fire:true},60);assert.equal(a.stats.launched,3);assert.equal(a.omen.ammo,1);
 tick(a,{reload:true});tick(a,{},107);assert.ok(a.omen.reload>0);tick(a);assert.equal(a.omen.ammo,4);assert.equal(a.omen.reload,0);
 assert.equal(omenDamage(0),36);assert.equal(omenDamage(22),22.5);assert.equal(omenDamage(90),22.5);
 const magazine=make([target('a')]);tick(magazine,{fire:true},120);
 assert.equal(magazine.stats.launched,4);assert.equal(magazine.omen.ammo,0);assert.equal(magazine.targets[0].hp,856);
 assert.ok(magazine.omen.reload>0,'an empty four-round magazine starts the normal reload');
});
test('E cooldown starts when the primed shot fires, including a miss',()=>{
 const s=make();tick(s,{omenPrime:true});tick(s,{},60);assert.ok(s.omen.primed);assert.equal(s.omen.primeCooldown,0);
 tick(s,{fire:true});assert.equal(s.omen.primeCooldown,10);assert.equal(s.omen.primed,false);tick(s,{omenPrime:true});assert.equal(s.omen.primed,false);
});
test('E primes then ruptures only after impact; early presses and C cannot detonate',()=>{
 const s=make([target('a',10)]);tick(s,{omenPrime:true});tick(s,{},30);
 const left=s.omen.primeLeft;tick(s,{omenPrime:true});assert.ok(s.omen.primeLeft<left);assert.equal(s.omen.ammo,4);
 tick(s,{fire:true});tick(s,{omenPrime:true});assert.equal(s.omen.marks.length,0);
 tick(s,{},24);assert.equal(s.omen.marks.length,1);assert.equal(s.events.filter(e=>e.type==='omenBurst').length,0,'early E is not buffered');
 tick(s,{spray:true,omenDetonate:true});assert.equal(s.omen.marks.length,1,'the former C action does nothing');
 s.omen.reload=1;const ammo=s.omen.ammo;tick(s,{omenPrime:true});
 assert.equal(s.omen.marks.length,0);assert.equal(s.omen.primed,false);assert.equal(s.omen.ammo,ammo);
 assert.equal(s.events.filter(e=>e.type==='omenBurst').length,1,'E ruptures even during reload and prime cooldown');
 tick(s,{omenPrime:true});assert.equal(s.events.filter(e=>e.type==='omenBurst').length,1);
 assert.equal(playerInput({omenDetonate:true}).omenDetonate,undefined,'the removed action is not sent online');
});
test('E rolls 9–12.6 per tick and ±13.5 per direct blast, with all damage reduced by ten percent',t=>{
 for(const [roll,delta] of [[0,-1],[.5,0],[1-Number.EPSILON,1]]){
  t.mock.method(Math,'random',()=>roll);
  const s=make([target('a')]);curse(s);tick(s,{},30);
  close(1000-s.targets[0].hp,(12+2*delta)*.9);
  for(const left of [3,.5]){
   const blast=make([target('a'),target('near',6.5,.27)]);curse(blast,'e',left);tick(blast,{omenPrime:true});
   close(1000-blast.targets[0].hp,omenBlastDamage(left-1/60)+13.5*delta);
   const splash=blast.events.find(e=>e.id==='near'&&e.type==='hit').damage;
   assert.ok(splash<67.5&&splash>18);
   const x=make([target('a'),target('near',6.5,.27)]);curse(x,'x',left);tick(x,{omenVolley:true});
   assert.ok(Math.abs((1000-x.targets[0].hp)-omenBlastDamage(left-1/60))<1e-8);
   assert.equal(x.events.find(e=>e.id==='near'&&e.type==='hit').damage,splash);
  }
  const x=make([target('a')]);curse(x,'x');tick(x,{},30);close(x.targets[0].hp,989.2);
 }
});
test('the curse ticks seven times, expires at 3.5 s and cannot detonate at the endpoint',()=>{
 const s=make([target('a')]);curse(s);tick(s,{},209);close(s.targets[0].hp,935.2);assert.ok(s.omen.marks.length);
 tick(s,{omenPrime:true});close(s.targets[0].hp,924.4);assert.equal(s.omen.marks.length,0);assert.equal(s.events.filter(e=>e.type==='omenBurst').length,0);
 tick(s,{omenPrime:true},30);close(s.targets[0].hp,924.4);assert.ok(s.events.some(e=>e.type==='omenFade'));
});
test('rupture increases only in the last second, direct damage has no own splash',()=>{
 assert.equal(omenBlastDamage(3),135);assert.equal(omenBlastDamage(1),135);assert.equal(omenBlastDamage(.5),153);assert.equal(omenBlastDamage(0),171);
 const s=make([target('a'),target('near',6.5,.27),target('far',12,.27)]);curse(s);tick(s,{omenPrime:true});
 assert.equal(s.targets[0].hp,865);assert.ok(s.targets[1].hp<1000&&s.targets[1].hp>932.5);assert.equal(s.targets[2].hp,1000);assert.equal(s.omen.marks.length,0);
 tick(s,{omenPrime:true});assert.equal(s.targets[0].hp,865);
 const late=make([target('a')]);curse(late,'e',.1);tick(late,{omenPrime:true});close(late.targets[0].hp,832);
});
test('a wall blocks diamonds and shelters bystanders from rupture',()=>{
 const s=make([target('a',5),target('b',7)]);s.colliders=[{x:6,z:0,w:.3,d:6}];curse(s);tick(s,{omenPrime:true});assert.equal(s.targets[1].hp,1000);
 const a=make([target('a',2)]);a.colliders=[{x:.5,z:0,w:.2,d:6}];tick(a,{fire:true,omenPrime:true});tick(a,{},30);assert.equal(a.targets[0].hp,1000);assert.equal(a.omen.marks.length,0);
});
test('X sends exactly three, distributes 2 + 1 and excludes allies and off-screen targets',()=>{
 const s=make([target('a',7,-2),target('b',7,2),target('ally',5,0),target('far',0,22)]);s.targets[2].friendly=true;
 tick(s,{omenVolley:true});assert.equal(s.omenBolts.length,3);assert.deepEqual(s.omenBolts.map(b=>b.target),['a','b','a']);
 assert.equal(s.omen.volleyLeft,4);assert.equal(s.omen.volleyCooldown,40);assert.equal(s.omen.ammo,4);
 tick(s,{},40);assert.equal(s.omen.marks.length,2);assert.ok(s.omen.marks.every(m=>m.left<4&&m.kind==='x'));assert.equal(s.targets[2].hp,1000);assert.equal(s.targets[3].hp,1000);
 tick(s,{omenPrime:true});assert.equal(s.omen.marks.length,2);tick(s,{omenVolley:true});assert.equal(s.omen.marks.length,0);
});
test('three X impacts on one enemy do not stack or refresh tick damage',()=>{
 const s=make([target('a',7,0)]);tick(s,{omenVolley:true});tick(s,{},50);assert.equal(s.omen.marks.length,1);
 const m=s.omen.marks[0];assert.ok(m.left<3.3);assert.ok(s.targets[0].hp>=854.2-1e-8&&s.targets[0].hp<=865);
 tick(s,{},190);assert.equal(s.omen.marks.length,0);assert.equal(s.omen.volleyLeft,0);close(s.targets[0].hp,1000-135-7*10.8);
});
test('moving across a homing diamond can evade every impact; it cannot loop back',()=>{
 const s=make([target('a',8,0)]);tick(s,{omenVolley:true});tick(s,{},14);
 // A fast lateral dodge takes the body beyond the limited turning radius.
 s.targets[0].z=4;tick(s,{},100);assert.equal(s.targets[0].hp,1000);assert.equal(s.omen.marks.length,0);assert.equal(s.omenBolts.length,0);
});
test('X overlap is capped and all X effects end at four seconds or caster death',()=>{
 const s=make([target('a',5,0),target('b',5.7,0)]);curse(s,'x',.2,'a');curse(s,'x',.2,'b');tick(s,{omenVolley:true});assert.equal(s.targets[0].hp,802);assert.equal(s.targets[1].hp,802);
 const a=make([target('a')]);curse(a,'x',1/60);tick(a,{omenVolley:true});assert.equal(a.events.filter(e=>e.type==='omenBurst').length,0);
 const b=make([target('a')]);curse(b);tick(b,{omenVolley:true});b.damagePlayer(9999,'enemy');assert.equal(b.omen.marks.length,0);assert.equal(b.omenBolts.length,0);assert.equal(b.omen.volleyLeft,0);assert.ok(b.events.some(e=>e.type==='omenFade'));
 b.respawn({x:0,z:0});assert.equal(b.omen.ammo,4);assert.equal(b.omen.marks.length,0);
});
test('shielded hits cannot curse and dead targets cannot keep or pass on marks',()=>{
 const s=make([target('a')]);s.shields=[{x:5,z:0,limit:2,round:true,owner:'other'}];tick(s,{omenPrime:true,fire:true});tick(s,{},25);assert.equal(s.targets[0].hp,1000);assert.equal(s.omen.marks.length,0);
 const a=make([target('a')]);curse(a);a.targets[0].hp=0;tick(a);assert.equal(a.omen.marks.length,0);
});
test('new damage types survive hits, ticks and lethal ruptures',()=>{
 for(const [type,action] of [['omenShot',s=>{tick(s,{fire:true});tick(s,{},20);}],['omenCurse',s=>{curse(s);tick(s,{},30);}],['omenBlast',s=>{curse(s);tick(s,{omenPrime:true});}]]){
  const s=make([target('a',5,.27,10)]);action(s);assert.equal(s.events.find(e=>e.type==='kill').damageType,type);
 }
});
test('network inputs, loadout and projectile mirrors preserve Omen and expire stale marks',()=>{
 const a=make([target('a')]);curse(a);tick(a,{omenVolley:true});const b=make();
 const input=playerInput({omenPrime:1,omenVolley:1});assert.ok(input.omenPrime&&input.omenVolley);
 applyLoadout(b,loadout(a));assert.deepEqual(b.omen,a.omen);assert.notEqual(b.omen.marks,a.omen.marks);
 const mirror=new ProjectileMirror();mirror.update({2:pack(a)},10);const foreign=mirror.lists(10),draw=drawSim(b,foreign);
 assert.equal(draw.omenBolts.length,3);assert.ok(draw.omenMarks.length>=1);assert.ok(foreign.omenBolts[0].id>3000000);assert.equal(mirror.lists(20).omenMarks.length,0);
 mirror.update({},11);assert.equal(mirror.lists(11).omenBolts.length,0);
});
test('arena proxy replacement retains the curse and delivers typed lethal damage',()=>{
 const arena=new Arena({map,createSim:m=>new Simulation(m),settings:{robots:'off'}});
 const a=arena.addSeat('a','A'),b=arena.addSeat('b','B');
 for(const seat of [a,b]){seat.present=true;seat.sim.respawn({x:seat===a?0:5,z:seat===a?0:.27});seat.sim.weapon='omen';seat.sim.dev.noSpread=true;}
 for(let i=0;i<14;i++){arena.before(a);tick(a.sim,i===0?{omenPrime:true,fire:true}:{});arena.after(a);}
 assert.ok(a.sim.omen.marks.length);assert.equal(b.sim.player.hp,450.5);
 b.sim.player.hp=100;arena.before(a);tick(a.sim,{omenPrime:true});arena.after(a);assert.ok(b.sim.player.dead);assert.equal(b.sim.events.find(e=>e.type==='playerDeath').damageType,'omenBlast');
});
test('on hills diamonds carry finite flight heights and a curse keeps the below-deck stance',()=>{
 const s=new Simulation(maps['hollow-wick']);s.weapon='omen';s.targets=[];Object.assign(s.player,{x:-14,z:22.1,below:true});tick(s,{fire:true});
 assert.ok(s.omenBolts.length);assert.ok(s.omenBolts.every(b=>Number.isFinite(b.y)&&b.flight&&b.below));
});
test('the pooled visual batches dissolve fully; the one-hand model keeps a heart and arm aura',()=>{
 const player=new THREE.Group(),gun=new THREE.Group();player.userData.gun=gun;player.add(gun);
 const view={scene:new THREE.Scene(),player,qualityName:'performance'},fx=new OmenView(view),s=make([target('a')]);
 curse(s);fx.update(s,1/60);assert.ok(fx.lines.count>35);assert.equal(fx.meshes.length,4);assert.ok(fx.model.userData.armAura);assert.equal(fx.model.visible,true);
 s.omen.marks=[];fx.event({type:'omenFade',x:5,z:0});fx.update(s,.1);assert.ok(fx.lines.count>0);fx.update(s,1);assert.equal(fx.lines.count,0);
 fx.event({type:'omenBurst',x:5,z:0});fx.update(s,.1);assert.ok(fx.lines.count>0);fx.clear();assert.ok(fx.meshes.every(m=>m.count===0));
 s.targets.push({...s.targets[0],id:'b',x:8});curse(s,'x',2,'a');curse(s,'x',2,'b');fx.update(s,.1);assert.equal(fx.links.size,1);
 s.omen.marks=[];fx.update(s,.1);assert.equal(fx.links.size,1,'threads unravel after active marks end');fx.update(s,1);assert.equal(fx.links.size,0);assert.equal(fx.lines.count,0);
});
test('each Omen death reaction preserves its dropped relic and cleans up the corpse or scatter',()=>{
 for(const damageType of ['omenShot','omenCurse','omenBlast']){
  const player=new THREE.Group(),gun=makeOmen();player.add(gun);player.userData.gun=gun;
  player.add(new THREE.Mesh(new THREE.BoxGeometry(.3,1,.3),new THREE.MeshLambertMaterial()));
  const scene=new THREE.Scene();scene.add(player);const death=new DeathView({player,scene,qualityName:'performance'});
  death.start({damageType,x:0,z:0,aimX:1,aimZ:0,directionX:1,directionZ:0});assert.ok(death.gun.children.length>=2);
  assert.equal(death.reaction.mode,damageType==='omenBlast'?'scatter':'corpse');if(damageType==='omenCurse')assert.ok(death.corpse.charMaterial);
  death.update(2);death.clear();assert.equal(scene.children.length,1);assert.ok(player.visible);
 }
});

const visualFixture=qualityName=>{
 const player=new THREE.Group();player.userData.gun=new THREE.Group();player.add(player.userData.gun);
 const fx=new OmenView({scene:new THREE.Scene(),player,qualityName});return {fx,s:make()};
};

test('sigil tendrils reach different lengths and wave independently while their roots stay on the circle',()=>{
 const point={x:0,z:0},lengths=[],turns=[];
 for(let arm=0;arm<6;arm++){
  const angle=arm*Math.PI/3;
  sigilTendrilPoint(point,angle,0,0,arm);lengths.push(Math.hypot(point.x,point.z));
  const before=Math.atan2(point.z,point.x);sigilTendrilPoint(point,angle,0,.8,arm);
  const turn=Math.atan2(point.z,point.x)-before;turns.push(Math.atan2(Math.sin(turn),Math.cos(turn)));
  sigilTendrilPoint(point,angle,1,0,arm);const root={...point};
  sigilTendrilPoint(point,angle,1,3,arm);assert.deepEqual(point,root,'the circle attachment stays anchored');
  close(Math.hypot(point.x,point.z),.66);
 }
 assert.ok(Math.max(...lengths)-Math.min(...lengths)>.6,'not identical spokes');
 assert.ok(Math.max(...turns)>.05&&Math.min(...turns)<-.05,'tips sway in opposing directions');
});

test('the larger victim curse keeps a red outer circle and its existing damage radius',()=>{
 const {fx,s}=visualFixture('performance');s.targets=[target('a')];curse(s);fx.update(s,.2);
 const color=new THREE.Color(),matrix=new THREE.Matrix4();let rim=0;
 for(let i=0;i<fx.lines.count;i++){
  fx.lines.getMatrixAt(i,matrix);fx.lines.getColorAt(i,color);
  const radius=Math.hypot(matrix.elements[12]-5,matrix.elements[14]-.27);
  if(radius>1.21&&radius<1.26&&color.r>color.b*3&&color.r>.5)rim++;
 }
 assert.ok(rim>=20,'the principal red circle is 1.25 metres in radius');assert.equal(OMEN.blastRadius,2.5);
});
test('a red wake keeps the curved flight and height, outlives impact briefly, then returns its pool',()=>{
 const {fx,s}=visualFixture('extreme');
 s.omenBolts=[{id:17,kind:'x',x:0,z:0,y:2,dx:1,dz:0}];
 const b=s.omenBolts[0];
 for(let i=0;i<8;i++){b.x=i*.25;b.z=i*i*.025;b.y=2+i*.04;fx.update(s,1/60);}
 assert.ok(fx.trails.size===1&&fx.lines.count>10);
 const trail=fx.trails.get(17);assert.ok(trail.points[5]>2&&trail.points[6]>0,'stored wake follows the actual elevated, curving shot');
 s.omenBolts=[];fx.update(s,.05);assert.ok(fx.lines.count>0,'wake fades after its diamond hits or expires');
 fx.update(s,.3);assert.equal(fx.lines.count,0);assert.equal(fx.trails.size,0);assert.equal(fx.freeTrails.length,96);
 // A busy fight cannot grow the pool; reset must return every sampled path.
 s.omenBolts=Array.from({length:140},(_,id)=>({id,kind:'e',x:id,z:0,y:1,dx:1,dz:0}));fx.update(s,.02);
 assert.ok(fx.trails.size<=96);fx.clear();assert.equal(fx.freeTrails.length,96);assert.equal(fx.trails.size,0);
});
test('priming puts a purple seal with a red inner circle under the moving caster and clears it after firing or death',()=>{
 const {fx,s}=visualFixture('performance');tick(s,{omenPrime:true});fx.update(s,.1);
 assert.ok(fx.primers.has('self'));assert.ok(fx.lines.count>40);
 const color=new THREE.Color(),matrix=new THREE.Matrix4();let purple=false,redCircle=false;
 for(let i=0;i<fx.lines.count;i++){
  fx.lines.getColorAt(i,color);fx.lines.getMatrixAt(i,matrix);
  const radius=Math.hypot(matrix.elements[12]-s.player.x,matrix.elements[14]-s.player.z);
  if(radius>1&&color.b>color.r*1.2&&color.r>color.g*2)purple=true;
  if(radius>.60&&radius<.70&&color.r>color.b*3&&color.r>.5)redCircle=true;
 }
 assert.ok(purple,'purple etching surrounds the caster');assert.ok(redCircle,'a red circle sits inside it');
 Object.assign(s.player,{x:7,z:9,below:true});fx.update(s,.1);
 assert.equal(fx.primers.get('self').x,7);assert.equal(fx.primers.get('self').z,9);assert.ok(fx.primers.get('self').below);
 tick(s,{fire:true});s.omenBolts=[];fx.update(s,.3);assert.equal(fx.primers.size,0);assert.equal(fx.lines.count,0);
 s.omen.primed=true;fx.update(s,.1);s.damagePlayer(9999,'other');fx.update(s,.3);assert.equal(fx.primers.size,0);
});

test('prime energy flows inward from purple to red on every preset without growing its render pools',()=>{
 for(const quality of ['potato','performance','balanced','quality','extreme']){
  const {fx,s}=visualFixture(quality),meshes=fx.meshes.slice(),materials=meshes.map(m=>m.material);
  const color=new THREE.Color(),matrix=new THREE.Matrix4();
  s.omen.primed=true;fx.update(s,.4);
  let outerPurple=0,innerRed=0,transition=0;
  for(let i=0;i<fx.lines.count;i++){
   fx.lines.getMatrixAt(i,matrix);if(Math.abs(matrix.elements[13]-.072)>.001)continue;
   fx.lines.getColorAt(i,color);
   const radius=Math.hypot(matrix.elements[12]-s.player.x,matrix.elements[14]-s.player.z);
   if(radius>2&&color.b>color.r)outerPurple++;
   if(radius<.9&&color.r>color.b*3)innerRed++;
   if(radius>1&&radius<1.6&&color.r>color.g*3&&color.b>color.g*3)transition++;
  }
  assert.ok(outerPurple&&innerRed&&transition,quality+' keeps the purple-to-red intake');
  const before=fx.lines.instanceMatrix.array.slice(0,fx.lines.count*16);
  fx.update(s,.1);assert.notDeepEqual(fx.lines.instanceMatrix.array.slice(0,fx.lines.count*16),before);
  assert.ok(fx.lines.count<500,'one seal stays within the existing line budget');
  assert.deepEqual(fx.meshes,meshes);assert.deepEqual(fx.meshes.map(m=>m.material),materials);
  s.omen.primed=false;fx.event({type:'omenPrimeExpired',x:s.player.x,z:s.player.z});fx.update(s,.1);
  assert.ok(fx.lines.count>0);fx.update(s,.6);assert.ok(fx.meshes.every(m=>m.count===0));
 }
 // A packet's head approaches the circle instead of radiating outward.
 const {fx}=visualFixture('performance'),radii=[];
 fx.groundLine=(_m,ax,az,bx,bz)=>radii.push([Math.hypot(ax,az),Math.hypot(bx,bz)]);
 for(const progress of [.1,.4,.8])fx.primeStream({x:0,z:0},0,progress,progress+.05,1,.04);
 assert.ok(radii.every(([tail,head])=>head<tail));assert.ok(radii[2][1]<radii[0][1]);
});
test('all presets keep shot detail and higher presets enrich it without adding batches or materials',()=>{
 const counts=[];
 for(const quality of ['potato','performance','balanced','quality','extreme']){
  const {fx,s}=visualFixture(quality),meshes=fx.meshes.slice(),materials=meshes.map(m=>m.material);
  s.omenBolts=[{id:1,kind:'e',x:1,z:0,y:.75,dx:1,dz:0}];
  fx.event({type:'omenShot',kind:'e',x:0,z:0,y:.75,dx:1,dz:0});
  for(let i=0;i<6;i++){s.omenBolts[0].x+=.3;fx.update(s,1/60);}
  counts.push(fx.lines.count+fx.diamonds.count);
  assert.deepEqual(fx.meshes,meshes);assert.deepEqual(fx.meshes.map(m=>m.material),materials);
  assert.equal(meshes.length,4);assert.ok(fx.effects.length&&fx.diamonds.count>=5);
  s.omenBolts=[];fx.update(s,1);assert.ok(fx.meshes.every(m=>m.count===0));
 }
 assert.ok(counts.every((n,i)=>i===0||n>counts[i-1]),String(counts));
});
test('the remote prime seal follows snapshots and disappears on fire, death, or a stale connection',()=>{
 const s=make();tick(s,{omenPrime:true});s.player.x=7;s.player.z=3;s.player.below=true;
 const mirror=new ProjectileMirror();mirror.update({2:pack(s)},10);
 let drawn=drawSim(make(),mirror.lists(10.1));assert.equal(drawn.omenPrimers.length,1);assert.equal(drawn.omenPrimers[0].x,7);assert.ok(drawn.omenPrimers[0].below);
 assert.equal(mirror.lists(11).omenPrimers.length,0);
 tick(s,{fire:true});mirror.update({2:pack(s)},12);assert.equal(mirror.lists(12).omenPrimers.length,0);
 s.omen.primed=true;s.player.dead=true;assert.equal(pack(s).omenPrime,null);
 mirror.update({},13);assert.equal(mirror.lists(13).omenPrimers.length,0);
});

test('E expires at five seconds, spends exactly one round and cannot fire a late curse',()=>{
 const s=make();tick(s,{omenPrime:true});assert.equal(s.omen.primeLeft,5);tick(s,{},299);
 assert.ok(s.omen.primed);assert.equal(s.omen.ammo,4);tick(s);
 assert.equal(s.omen.primed,false);assert.equal(s.omen.primeLeft,0);assert.equal(s.omen.ammo,3);assert.equal(s.omen.primeCooldown,10);
 tick(s,{},60);assert.equal(s.omen.ammo,3);assert.equal(s.events.filter(e=>e.type==='omenPrimeExpired').length,1);
 const edge=make();tick(edge,{omenPrime:true});tick(edge,{},299);tick(edge,{fire:true});
 assert.equal(edge.omenBolts[0].kind,'base');assert.equal(edge.omen.ammo,2);
 const last=make();last.omen.ammo=1;tick(last,{omenPrime:true});tick(last,{},300);assert.equal(last.omen.ammo,0);
 last.omen.primeCooldown=0;tick(last,{omenPrime:true});assert.equal(last.omen.primed,false,'an empty chamber cannot prime');
});
test('firing just before prime expiry spends one round and HUD/cursor read the same phase clocks',()=>{
 const s=make([target('a')]);tick(s,{omenPrime:true});tick(s,{},240);
 let ui=omenReadouts(s.omen);assert.equal(ui.primary.state,'charging');assert.ok(Math.abs(ui.primary.remaining-1)<1e-8);assert.equal(ui.primary.duration,5);
 const b=make();applyLoadout(b,loadout(s));assert.equal(b.omen.primeLeft,s.omen.primeLeft);
 tick(s,{fire:true});assert.equal(s.omen.ammo,3);assert.equal(s.omen.primeLeft,0);tick(s,{},12);
 ui=omenReadouts(s.omen);assert.equal(ui.primary.binding,'E');assert.equal(ui.primary.state,'active');assert.equal(ui.primary.remaining,s.omen.marks[0].left);
 tick(s,{omenVolley:true});assert.equal(omenReadouts(s.omen).secondary.remaining,s.omen.volleyLeft);
});
test('the detonation cue marks only the final second of a landed, still-active E or X curse',()=>{
 const s=make([target('a')]);s.omen.primed=true;s.omen.primeLeft=.5;
 assert.equal(omenReadouts(s.omen).primary.optimal,false,'a prime about to expire is not a detonation opportunity');
 s.omen.primed=false;curse(s,'e',1.01);
 assert.equal(omenReadouts(s.omen).primary.optimal,false);
 s.omen.marks[0].left=1;assert.equal(omenReadouts(s.omen).primary.optimal,true);
 s.omen.marks[0].left=.02;assert.equal(omenReadouts(s.omen).primary.optimal,true);
 s.omen.marks[0].left=0;assert.equal(omenReadouts(s.omen).primary.optimal,false,'no cue at expiry');
 s.omen.marks=[];s.omen.volleyLeft=.5;
 assert.equal(omenReadouts(s.omen).secondary.optimal,false,'a missed volley has nothing to rupture');
 curse(s,'x',1.01);assert.equal(omenReadouts(s.omen).secondary.optimal,false);
 s.omen.marks[0].left=s.omen.volleyLeft=1;assert.equal(omenReadouts(s.omen).secondary.optimal,true);
 s.omen.marks[0].left=s.omen.volleyLeft=.02;assert.equal(omenReadouts(s.omen).secondary.optimal,true);
 s.omen.volleyLeft=0;assert.equal(omenReadouts(s.omen).secondary.optimal,false,'X must still be live');
 s.omen.volleyLeft=.5;s.omen.marks[0].left=0;assert.equal(omenReadouts(s.omen).secondary.optimal,false);
 s.omen.marks=[];assert.equal(omenReadouts(s.omen).secondary.optimal,false,'removed marks clear the cue');
});
test('curse ticks are explicitly cursed damage and never request an electric aftershock',()=>{
 const s=make([target('a')]);curse(s);tick(s,{},30);const hit=s.events.find(e=>e.type==='hit');
 assert.equal(hit.damageType,'omenCurse');assert.equal(hit.electric,false);assert.equal(hit.damage,10.8);
 const {fx,s:draw}=visualFixture('performance');fx.event({...hit,type:'omenTick'});fx.update(draw,.05);assert.ok(fx.lines.count>30);
 fx.update(draw,1);assert.ok(fx.meshes.every(m=>m.count===0));
 const calls=[],view={omenView:{event:e=>calls.push(e)},electric:{aftershock:()=>assert.fail('curse must never enter Static aftershock')},fx:{electric:()=>assert.fail('curse must never enter robot electricity')}};
 for(const type of ['hit','kill'])WorldView.prototype.event.call(view,{...hit,type});
 WorldView.prototype.robotHit.call(view,{...hit,type:'kill'});
 assert.equal(calls.length,3);assert.ok(calls.every(e=>e.type==='omenTick'));
});
test('rupture has a brief contraction, then smoke on every preset, with complete expiry and reset',()=>{
 for(const quality of ['potato','performance','quality','extreme']){
  const {fx,s}=visualFixture(quality);fx.event({type:'omenBurst',x:2,z:3,below:true});fx.update(s,.05);
  assert.ok(fx.lines.count>40);assert.equal(fx.smoke.count,0);
  fx.update(s,.2);assert.ok(fx.smoke.count>=6);assert.ok(fx.diamonds.count>0);
  fx.update(s,2);assert.ok(fx.meshes.every(m=>m.count===0));assert.equal(fx.effects.length,0);
  fx.event({type:'omenBurst',x:2,z:3});fx.update(s,.2);fx.clear();assert.ok(fx.meshes.every(m=>m.count===0));
 }
});
