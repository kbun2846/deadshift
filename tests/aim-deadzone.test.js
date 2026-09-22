import test from 'node:test';
import assert from 'node:assert/strict';
import * as deprecated from '../src/aim-deadzone.js';
import * as current from '../src/aim-damping.js';

test('the superseded aim module is an alias, never a second implementation',()=>{
 assert.equal(deprecated.createAimDamping,current.createAimDamping);
 assert.equal(deprecated.aimsByPoint,current.aimsByPoint);
 assert.equal(deprecated.AIM_FEEL,current.AIM_FEEL);
});
