import test from 'node:test';
import assert from 'node:assert/strict';
import {HealthBarMotion} from '../src/health-hud.js';
test('damage segment swells, holds, then smoothly contracts to current health',()=>{
 const bar=new HealthBarMotion();bar.update(500,500,0);
 const hit=bar.update(300,500,.1);assert.equal(hit.fraction,.6);assert.equal(hit.loss,.4);assert.ok(hit.scale>1);
 const held=bar.update(300,500,.2);assert.equal(held.loss,.4);
 const sliding=bar.update(300,500,.4);assert.ok(sliding.loss>0&&sliding.loss<held.loss);assert.ok(sliding.scale<hit.scale);
 const done=bar.update(300,500,2);assert.equal(done.loss,0);assert.ok(done.scale<1.001);
});
test('repeated hits preserve the trail, pause freezes it, healing and reset clear it',()=>{
 const bar=new HealthBarMotion();bar.update(500,500,0);bar.update(400,500,.1);
 const next=bar.update(300,500,.15);assert.equal(next.loss,.4);
 assert.deepEqual(bar.update(300,500,.15),next);
 assert.equal(bar.update(500,500,.2).loss,0);
 bar.update(100,500,.3);assert.equal(bar.update(100,500,0).loss,0);
});
