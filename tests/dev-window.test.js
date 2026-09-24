import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DEV_TOGGLES,DEV_WINDOW_KEY,clampWindowPosition,readWindowPosition,refill,safeStorage} from '../src/ui/dev-window.js';
import {Simulation} from '../src/simulation.js';
import {maps} from '../src/maps.js';
import {GRAPHICS} from '../src/settings.js';

test('the window is kept wholly on screen, whatever was saved',()=>{
 const viewport={width:1280,height:800},size={width:208,height:320};
 assert.deepEqual(clampWindowPosition({x:400,y:200},viewport,size),{x:400,y:200});
 // Saved on a wide monitor, opened on a phone.
 const cramped=clampWindowPosition({x:1100,y:700},{width:380,height:700},size);
 assert.ok(cramped.x>=0&&cramped.x<=380-208);
 assert.ok(cramped.y>=0&&cramped.y<=700-320);
 assert.deepEqual(clampWindowPosition({x:-90,y:-40},viewport,size),{x:0,y:0});
 // A viewport smaller than the window still pins it to the corner, never off it.
 assert.deepEqual(clampWindowPosition({x:50,y:50},{width:150,height:150},size),{x:0,y:0});
});

test('a first open lands somewhere sensible without a saved position',()=>{
 const placed=clampWindowPosition(null,{width:1280,height:800},{width:208,height:320});
 assert.ok(placed.x>0&&placed.x<=1280-208,'towards the right, still fully visible');
 assert.ok(placed.y>0&&placed.y<=800-320,'and clear of the masthead');
});

test('corrupt or missing storage never breaks the window',()=>{
 assert.equal(readWindowPosition(null),null);
 assert.equal(readWindowPosition({getItem:()=>'not json'}),null);
 assert.equal(readWindowPosition({getItem:()=>'{"x":"left"}'}),null);
 assert.equal(readWindowPosition({getItem:()=>{throw new Error('blocked');}}),null);
 assert.deepEqual(readWindowPosition({getItem:()=>'{"x":12,"y":34}'}),{x:12,y:34});
 assert.equal(DEV_WINDOW_KEY.startsWith('deadshift-'),true,'stored under the game namespace');
});

test('every toggle names a real override the simulation reads',()=>{
 const known=new Set(['ammo','orbs','cooldowns','stamina','invulnerable','teleport','speed',
  'rifleInstantReload','shotgunInstantReload','grenadeCooldown','extendedCooldown',
  'oneHit','ghost','freezeTargets','hideHud']);
 for(const [key,label] of DEV_TOGGLES){
  assert.ok(known.has(key),`${key} is not an override the game honours`);
  assert.ok(label&&label===label.trim()&&label.length<32,`${key} needs a short plain label`);
 }
 assert.equal(new Set(DEV_TOGGLES.map(([key])=>key)).size,DEV_TOGGLES.length,'no duplicates');
});

test('restore fills health, ammo and every cooldown',()=>{
 const sim=new Simulation(maps.deadwater);
 sim.player.hp=12;sim.player.stamina=0;sim.ammo=0;
 sim.hexCooldown=30;sim.grenadeCooldown=25;sim.rifle.extendedCooldown=60;
 sim.rifle.ammo=0;sim.shotgun.ammo=0;
 refill(sim);
 assert.equal(sim.player.hp,sim.player.maxHp);
 assert.equal(sim.player.stamina,sim.maxStamina);
 assert.ok(sim.ammo>0);
 assert.equal(sim.rifle.ammo,sim.rifle.capacity);
 assert.equal(sim.shotgun.ammo,2);
 for(const cooldown of [sim.hexCooldown,sim.grenadeCooldown,sim.rifle.extendedCooldown])assert.equal(cooldown,0);
});

test('O opens the window, and only once the tools are unlocked',()=>{
 const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
 assert.ok(main.includes("e.code==='KeyO'"),'O should be bound');
 assert.ok(/KeyO'[^\n]*devTools\.isUnlocked\(\)/.test(main),'and gated on the unlock');
 assert.ok(/KeyO'[^\n]*devWindow\.toggle\(\)/.test(main),'to toggle the window');
 assert.ok(main.includes('devWindow.hide()'),'and it should close on leaving a run');
});

test('developer controls opt out of the stretched display lettering',()=>{
 const typography=readFileSync(new URL('../src/ui/button-typography.js',import.meta.url),'utf8');
 assert.ok(typography.includes(':not(.dev-tools button)'),'settings dev buttons stay plain');
 assert.ok(typography.includes(':not(.dev-window button)'),'and so do the floating ones');
 assert.ok(typography.includes(':not(.plain-text)'),'with an opt-out for anything else');
});

test('the aim cone carries a faint but unmistakably red interior',()=>{
 const css=readFileSync(new URL('../src/styles/menu-theme.css',import.meta.url),'utf8');
 const zone=css.slice(css.indexOf('.aim-cone .cone-zone{'));
 const fill=zone.match(/fill:(#[0-9a-f]{6})/i)[1];
 const opacity=Number(zone.match(/fill-opacity:([\d.]+)/)[1]);
 const [r,g,b]=[1,3,5].map(i=>parseInt(fill.slice(i,i+2),16));
 assert.ok(r>g*1.8&&r>b*1.8,`${fill} does not read as red`);
 assert.ok(opacity>0&&opacity<=.2,`fill-opacity ${opacity} should be near transparent`);
 // And it blinks out on the shot rather than lingering through it.
 assert.ok(css.includes('.aim-cone.firing .cone-zone{fill-opacity:0'),'firing should clear the zone');
 assert.ok(css.includes('.aim-cone.unloaded .cone-zone{fill-opacity:0'),'an empty weapon shows no zone');
 const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
 assert.ok(main.includes("e.type==='shotgunShot'")&&main.includes('coneFlicker'),'driven by the shot itself');
});

test('both Ballast and Nominal draw the zone, and only while loaded and ready',()=>{
 const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
 const overlay=readFileSync(new URL('../src/ui/aim-overlay.js',import.meta.url),'utf8');
 const gate=overlay.slice(overlay.indexOf("cone.classList.toggle('unloaded'"),overlay.indexOf("cone.classList.toggle('unloaded'")+260);
 assert.ok(gate.includes('sim.shotgun.ammo>0'),'Ballast still needs a shell');
 assert.ok(gate.includes('sim.rifle.ammo>0'),'Nominal needs a round chambered');
 assert.ok(gate.includes('sim.rifle.reload<=0'),'and no magazine on the way in');
 assert.ok(overlay.includes("sim.weapon==='shotgun'||sim.weapon==='rifle'"),'the cone shows for both weapons');
 assert.ok(main.includes("e.type==='rifleShot')coneFlicker"),"Nominal's zone blinks on its own shot");
});

// The dev window used to carry its own hand-written list of presets, which
// silently went stale the moment a tier was added to GRAPHICS (Extreme was
// missing from the draggable window while the settings tab offered it). Both
// surfaces now have to enumerate the real table.
test('every graphics tier is offered by the dev window and the settings tab',()=>{
 const dev=readFileSync(new URL('../src/ui/dev-window.js',import.meta.url),'utf8');
 assert.ok(/Object\.entries\(GRAPHICS\)/.test(dev),'the dev window derives its presets from GRAPHICS');
 assert.ok(!/'potato',\s*'performance'/.test(dev),'no hand-written preset list left to drift');
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const select=html.match(/<select id="graphics-preset">([\s\S]*?)<\/select>/);
 assert.ok(select,'the settings tab has a preset select');
 for(const name of Object.keys(GRAPHICS)){
  assert.ok(select[1].includes(`value="${name}"`),`${name} is selectable in settings`);
 }
});

// A sandboxed host can make reading `window.localStorage` itself throw. That
// used to happen inside createDevWindow's default parameter, on the startup
// path, so the whole game died after the splash: the menu appeared with no
// handlers and no fitted button text.
test('a host that denies storage access still yields a usable dev window',()=>{
 const original=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
 Object.defineProperty(globalThis,'localStorage',{configurable:true,
  get(){throw new Error('Access is denied for this document.');}});
 try{
  assert.equal(safeStorage(),null,'a denying host reads as no storage at all');
  assert.equal(readWindowPosition(safeStorage()),null,'and the saved position simply does not load');
 }finally{
  if(original)Object.defineProperty(globalThis,'localStorage',original);
  else delete globalThis.localStorage;
 }
 const source=readFileSync(new URL('../src/ui/dev-window.js',import.meta.url),'utf8');
 assert.ok(!/storage\s*=\s*globalThis\.localStorage/.test(source),
  'the default parameter must not read the property unguarded');
});
