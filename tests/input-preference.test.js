import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {detectedControls,createInputPreference} from '../src/ui/input-preference.js';

test('a device is only called touch-first when it has no hover',()=>{
 assert.equal(detectedControls({coarsePointer:true,hoverAvailable:false}),'touch');
 assert.equal(detectedControls({coarsePointer:true,hoverAvailable:true}),'keyboard');
 assert.equal(detectedControls({coarsePointer:false,hoverAvailable:true}),'keyboard');
 assert.equal(detectedControls(),'keyboard');
});

test('the on-screen controls stay put once a device has been touched',()=>{
 // A tablet with a keyboard reports hover, so it starts out looking like a
 // desktop. The first tap is what reveals it, and from then on the buttons have
 // to stay: hiding them on every keypress and restoring them on every tap is
 // what made the controls feel like they were fighting the player.
 const p=createInputPreference('keyboard',null);
 assert.equal(p.surface,'keyboard');
 p.observe('touch');
 assert.equal(p.surface,'touch');
 for(let i=0;i<5;i++){p.observe('keyboard');p.observe('touch');}
 assert.equal(p.surface,'touch','the surface never flips back');
});

test('prompts still follow whichever input was used last',()=>{
 const p=createInputPreference('touch',null);
 assert.equal(p.mode,'touch');
 assert.ok(p.observe('keyboard'),'a first keypress is a change worth redrawing for');
 assert.equal(p.mode,'keyboard');
 assert.ok(!p.observe('keyboard'),'and a second one is not');
 assert.equal(p.surface,'touch','without disturbing the buttons on screen');
});

test('an explicit choice in the menu outranks anything detected',()=>{
 const p=createInputPreference('touch','keyboard');
 assert.equal(p.surface,'keyboard');
 p.observe('touch');
 assert.equal(p.surface,'keyboard','a stray tap cannot override the player');
 assert.ok(p.touched,'though it is still remembered');
 const q=createInputPreference('keyboard',null);
 q.select('touch');
 assert.equal(q.surface,'touch');
});

test('noticing the input in use never discards what is being held',()=>{
 // releaseInput() drops every held key, the aim, the trigger and every stick.
 // That is right for the menu selector and for pausing, and wrong for an
 // automatic switch, which on a tablet fires between two presses of one burst.
 const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
 const body=main.slice(main.indexOf('function detectActiveInput'),
   main.indexOf('window.addEventListener(\'pointerdown\'',main.indexOf('function detectActiveInput')));
 assert.ok(!/releaseInput\(\)/.test(body),'detectActiveInput must not release held input');
 assert.ok(/inputPreference\.surface/.test(body),'it decides what to redraw from the surface');
 // Aiming is a held modifier and has to count as keyboard use on its own.
 assert.ok(/'ShiftLeft','ShiftRight'/.test(main),'Shift registers as keyboard input');
});
