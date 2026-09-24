import test from 'node:test';
import assert from 'node:assert/strict';
import {rifleAmmoPresentation,shotgunAmmoPresentation} from '../src/ui/weapon-hud.js';
import {RIFLE} from '../src/weapons/rifle.js';
import {SHOTGUN} from '../src/weapons/shotgun.js';

test('Ballast reload fills both shell slots gradually after opening the breech',()=>{
 const s={ammo:0,reload:SHOTGUN.reload};
 assert.deepEqual(shotgunAmmoPresentation(s),{capacity:2,rounds:0});
 s.reload=SHOTGUN.reload*.8;assert.equal(shotgunAmmoPresentation(s).rounds,0);
 s.reload=SHOTGUN.reload*.525;assert.ok(Math.abs(shotgunAmmoPresentation(s).rounds-.5)<1e-8);
 s.reload=SHOTGUN.reload*.175;assert.ok(Math.abs(shotgunAmmoPresentation(s).rounds-1.5)<1e-8);
 s.reload=0;s.ammo=2;assert.deepEqual(shotgunAmmoPresentation(s),{capacity:2,rounds:2});
});
test('reload display drains old rounds, changes empty capacity, then fills the incoming magazine',()=>{
 for(const [capacity,reloadCapacity,ammo] of [[18,36,18],[36,18,32],[18,18,7]]){
  const r={capacity,reloadCapacity,ammo,reload:RIFLE.reload};
  assert.deepEqual(rifleAmmoPresentation(r),{capacity,rounds:ammo});
  r.reload=RIFLE.reload*.9;let shown=rifleAmmoPresentation(r);assert.equal(shown.capacity,capacity);assert.ok(Math.abs(shown.rounds-ammo/2)<1e-8);
  r.reload=RIFLE.reload*.75;assert.deepEqual(rifleAmmoPresentation(r),{capacity:reloadCapacity,rounds:0});
  r.reload=RIFLE.reload*.35;shown=rifleAmmoPresentation(r);assert.equal(shown.capacity,reloadCapacity);assert.ok(Math.abs(shown.rounds-reloadCapacity/2)<1e-8);
  r.reload=0;r.capacity=reloadCapacity;r.ammo=reloadCapacity;
  assert.deepEqual(rifleAmmoPresentation(r),{capacity:reloadCapacity,rounds:reloadCapacity});
 }
});
