import test from 'node:test';
import assert from 'node:assert/strict';
import {detectedControls,createInputPreference} from '../src/input-preference.js';

test('phones and tablets default to touch; mouse and hybrid laptop pointers default to keyboard',()=>{
 assert.equal(detectedControls({coarsePointer:true,hoverAvailable:false}),'touch');
 assert.equal(detectedControls({coarsePointer:false,hoverAvailable:true}),'keyboard');
 assert.equal(detectedControls({coarsePointer:true,hoverAvailable:true}),'keyboard');
});

test('automatic controls follow actual input on hybrid devices',()=>{
 const preference=createInputPreference('keyboard');
 assert.equal(preference.observe('touch'),true);assert.equal(preference.mode,'touch');
 assert.equal(preference.observe('touch'),false);
 assert.equal(preference.observe('keyboard'),true);assert.equal(preference.mode,'keyboard');
});

test('manual selection survives navigation and is not overridden by selector clicks or keyboard events',()=>{
 const preference=createInputPreference('keyboard');preference.select('touch');
 assert.equal(preference.observe('keyboard'),false);assert.equal(preference.mode,'touch');
 const restored=createInputPreference('keyboard','touch');
 assert.equal(restored.mode,'touch');assert.equal(restored.observe('keyboard'),false);
 assert.equal(createInputPreference('keyboard','invalid').mode,'keyboard');
});
