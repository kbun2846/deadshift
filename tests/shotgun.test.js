import test from 'node:test';
import assert from 'node:assert/strict';
import {Simulation} from '../src/simulation.js';
import {SHOTGUN,shotgunSpread,shotgunFalloff} from '../src/weapons/shotgun.js';
const make=()=>{const s=new Simulation({width:80,depth:80,spawn:{x:0,z:0},buildings:[],fences:[],props:[],targets:[]});s.weapon='shotgun';s.reset();return s;};
const ticks=(s,n,input={})=>{for(let i=0;i<n;i++)s.step({aimX:1,aimZ:0,...input});};
const shots=s=>s.events.filter(e=>e.type==='shotgunShot').length;

test('no charging: a press fires one shell, holding does not fire again, E fires both',()=>{
 const s=make();s.step({fire:true});assert.equal(s.shotgun.ammo,1);assert.equal(s.shotgunPellets.length,SHOTGUN.pellets);
 ticks(s,60,{fire:true});assert.equal(shots(s),1,'held: one shot');
 s.step({fire:false});ticks(s,20);s.step({fire:true});assert.equal(shots(s),2,'a new press fires');
 const d=make();d.step({doubleShot:true});ticks(d,5);assert.equal(shots(d),2);assert.equal(d.shotgun.ammo,0);
 assert.equal(d.events.find(e=>e.type==='shotgunShot').charge,SHOTGUN.look,'one look for every shot');
 assert.equal('charge' in d.shotgun,false);assert.equal('stored' in d.shotgun,false);
});
test('first inserted shell can fire and cancels the remaining reload for LMB, tap and E',()=>{
 for(const input of [{tapFire:true},{doubleShot:true},{fire:true}]){
  const s=make();s.shotgun.ammo=0;s.shotgun.spent=2;s.step({reload:true});
  ticks(s,60);s.step({tapFire:true});assert.equal(s.shotgun.ammo,0);assert.ok(s.shotgun.reload>0);
  ticks(s,49);assert.equal(s.shotgun.ammo,1);assert.ok(s.shotgun.reload>0);
  s.step(input);assert.equal(s.shotgun.reload,0);
  assert.equal(s.shotgun.ammo,0);assert.equal(s.shotgun.spent,1);
  ticks(s,180);assert.equal(s.shotgun.ammo,0);assert.equal(shots(s),1);
  assert.equal(s.events.filter(e=>e.type==='shotgunReloaded').length,0);
  s.step({reload:true});assert.equal(s.events.at(-1).spent,1);
  ticks(s,170);assert.equal(s.shotgun.ammo,2);
 }
});
test('recoil: every shot launches you the same, beyond a dash; aiming in narrows the cone',()=>{
 const s=make();s.step({fire:true});ticks(s,180);assert.ok(Math.abs(-s.player.x-SHOTGUN.recoil)<.01);assert.ok(shotgunSpread(true)<shotgunSpread(false));
});
test('damage: shellDamage + bonus point blank on the first shell, shellDamage on the second; mid-range still counts',t=>{
 t.mock.method(Math,'random',()=>.5);
 const dealt=(x,input={tapFire:true},ammo=2)=>{const s=make();s.shotgun.ammo=ammo;s.targets.push({id:'t',kind:'target',x,z:.2,baseX:x,hp:1000,maxHp:1000,flash:0,respawn:0});s.step(input);ticks(s,30,{aiming:!!input.aiming});return 1000-s.targets[0].hp;};
 assert.ok(Math.abs(dealt(1.4)-(SHOTGUN.shellDamage+SHOTGUN.firstShellBonus))<1e-6);assert.ok(Math.abs(dealt(1.4,{tapFire:true},1)-SHOTGUN.shellDamage)<1e-6);
 const mid=dealt(4.5,{tapFire:true,aiming:true});assert.ok(mid>=110&&mid<=290,'aimed mid-range '+mid);
 assert.ok(dealt(SHOTGUN.range+SHOTGUN.fade+1.5)===0,'out of reach');
 const edge=dealt(SHOTGUN.range+.3),faded=dealt(SHOTGUN.range+SHOTGUN.fade*.7);
 assert.ok(edge>0&&faded>0&&faded<edge,'the fade still hurts, less and less: '+edge+' > '+faded);
 assert.ok(shotgunFalloff(3.4)>.7,'decent through the red');assert.ok(Math.abs(shotgunFalloff(SHOTGUN.range)-.2)<1e-9,'a fifth at the end of the red');assert.ok(shotgunFalloff(SHOTGUN.range+SHOTGUN.fade-.01)<.15,'a scratch at max range');assert.equal(shotgunFalloff(SHOTGUN.range+SHOTGUN.fade),0,'nothing past it');assert.ok(shotgunFalloff(1)===1);
});
test('E aimed in, point blank, can still one-shot a full-health player',t=>{
 t.mock.method(Math,'random',()=>.5);
 const s=make();s.targets.push({id:'t',kind:'target',x:1.4,z:.2,baseX:1.4,hp:1000,maxHp:1000,flash:0,respawn:0});
 s.step({doubleShot:true,aiming:true});ticks(s,30,{aiming:true});assert.ok(1000-s.targets[0].hp>=500);
});
test('cover blocks pellets and stops recoil at walls',()=>{
 const s=make();s.colliders=[{x:-1,z:0,w:.2,d:8},{x:1.1,z:0,w:.2,d:8}];
 s.targets.push({id:'test',kind:'target',x:2,z:0,baseX:2,hp:1000,maxHp:1000,flash:0,respawn:0});
 s.step({tapFire:true});ticks(s,90);assert.equal(s.targets[0].hp,1000);assert.ok(s.player.x>-.9);
});
test('empty Ballast firing inputs reload once; holding fire after E empties both does not',()=>{
 for(const input of [{fire:true},{tapFire:true},{doubleShot:true}]){
  const s=make();s.shotgun.ammo=1;s.step({tapFire:true});ticks(s,20);
  assert.equal(s.shotgun.ammo,0);assert.equal(s.shotgun.reload,0);
  s.step(input);assert.equal(s.shotgun.reload,SHOTGUN.reload);
  ticks(s,60,input);assert.equal(s.events.filter(e=>e.type==='shotgunReload').length,1);
  ticks(s,110);assert.equal(s.shotgun.ammo,2);
 }
 const s=make();s.step({fire:true,doubleShot:true});ticks(s,180,{fire:true});assert.equal(s.shotgun.ammo,0);assert.equal(s.shotgun.reload,0);
 s.step({fire:false});s.step({fire:true});assert.equal(s.shotgun.reload,SHOTGUN.reload);
 const u=make();u.dev.ammo=true;u.shotgun.ammo=0;u.step({tapFire:true});assert.equal(u.shotgun.reload,0);assert.equal(u.stats.launched,1);
});
test('double recoil begins lightly and kicks together after 50 ms',()=>{
 const s=make();s.step({doubleShot:true});assert.ok(s.player.blastVX<0);const initial=-s.player.blastVX;
 ticks(s,2);assert.equal(shots(s),1);ticks(s,1);assert.equal(shots(s),2);assert.ok(-s.player.blastVX>initial*8);
 ticks(s,180);assert.ok(-s.player.x>SHOTGUN.recoil*1.3&&-s.player.x<SHOTGUN.recoil*1.4);
});
