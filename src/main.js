import {bindTouchAction} from './touch-action.js';
import {migrateGameStorage} from './storage-migration.js';
import {isPlayable} from './playable-area.js';
import {detectedControls,createInputPreference} from './input-preference.js';
import './mobile-controls.css';
import {installTouchLayout} from './touch-layout.js';
import {SHOTGUN,shotgunRange,shotgunSpread} from './shotgun.js';
import {createOutgoingFeedback} from './outgoing-feedback.js';
import { createMenuNavigation } from './menu-navigation.js';
import { installSelectMenus } from './select-menu.js';
import { readTutorialComplete, saveTutorialComplete } from './tutorial-progress.js';
import { rifleSpread, rifleAim, RIFLE_MUZZLE, RIFLE } from './rifle.js';
import { bindAbilityCooldown, addAbilityCooldown } from './ability-cooldown.js';
import { createWeaponHUD } from './weapon-hud.js';
import { createHealthHUD } from './health-hud.js';
import { createPerfReadout } from './perf-readout.js';
import { createDamageFeedback } from './damage-feedback.js';
import { createDeathScreen, DEATH_MENU_DELAY } from './death-screen.js';
import { bindRifleMouse, weaponAiming } from './rifle-input.js';
import { advanceAimCursor } from './aim-cursor.js';
import { createAimDamping, aimsByPoint } from './aim-damping.js';
import { GRENADE } from './grenade.js';
import { tutorialMapFor, Tutorial, rifleTouchLessons } from './tutorial.js';
import { installMenu } from './menu.js';
import { maps } from './maps.js';
import { Simulation, RULES } from './simulation.js';
import { WorldView } from './renderer.js';
import { Soundscape } from './audio.js';
import { GRAPHICS, validateSettings, RenderBudget, AdaptiveResolution, fpsToSlider, fpsFromSlider, fpsLabel, snapFps, FPS_STOPS, FPS_MIN, FPS_UNCAPPED_SLIDER, VOLUME_CHANNELS, isDemanding} from './settings.js';
import {keyboardAim} from './keyboard-aim.js';
import { overheadMapSVG } from './overhead-map.js';
import { installDevTools } from './dev-tools.js';
import { createDevWindow } from './dev-window.js';
import { createDevUnlockDialog } from './dev-unlock-dialog.js';

const $ = id => document.getElementById(id);
try{migrateGameStorage(localStorage);}catch{}
try{migrateGameStorage(sessionStorage);}catch{}
const params = new URLSearchParams(location.search);
const selectedMap = params.get('map')==='tutorial' ? tutorialMapFor(params.get('weapon')) : maps[params.get('map')] || maps.deadwater;
const landmarkStart = import.meta.env.DEV && selectedMap.props.find(p => p.type === params.get('start'));
const roomStart = import.meta.env.DEV && selectedMap.buildings.find(b => b.id === params.get('start'));
// Development-only bookmark for checking the distant field without crossing town.
const map = import.meta.env.DEV && params.get('start') === 'farm' && selectedMap.crops?.length
  ? { ...selectedMap, spawn: { x: selectedMap.crops[0].x - selectedMap.crops[0].w / 2 + 2, z: selectedMap.crops[0].z - selectedMap.crops[0].d / 2 - 3 } }
  : landmarkStart ? { ...selectedMap, spawn: { x: landmarkStart.x, z: landmarkStart.z + 6 } }
  : roomStart ? { ...selectedMap, spawn: { x: roomStart.x, z: roomStart.z } } : selectedMap;
document.title = 'DEADSHIFT ALPHA v0.4 — ' + map.name;
document.querySelector('.brand p').textContent = map.name.toUpperCase();
document.querySelector('.mode').textContent=map.training?'TUTORIAL':'PRACTICE';
let settings;
const detectedInput=detectedControls({coarsePointer:matchMedia('(pointer: coarse)').matches,hoverAvailable:matchMedia('(hover: hover)').matches});
const deviceDefaults={mobile:detectedInput==='touch'};
try { settings = validateSettings(JSON.parse(localStorage.getItem('deadshift-settings') || '{}'),deviceDefaults); }
catch { settings = validateSettings({},deviceDefaults); }
const sim = new Simulation(map), sound = new Soundscape(), budget = new RenderBudget(settings.fps);
const adaptiveResolution = new AdaptiveResolution();
sim.weapon=['rifle','shotgun'].includes(params.get('weapon'))?params.get('weapon'):'static';
let rifleFiring=false,rifleAiming=false;
const updateWeaponHUD=createWeaponHUD($('weapon'));
const updateHealthHUD=createHealthHUD($('game'));
const perfReadout=createPerfReadout(document.querySelector('.masthead'));
const damageFeedback=createDamageFeedback($('game'));
const outgoingFeedback=createOutgoingFeedback($('game'));
const cone=document.createElementNS('http://www.w3.org/2000/svg','svg');cone.classList.add('aim-cone');
// Two layers: the filled danger zone inside the spread, and the guide edges.
cone.innerHTML='<path class="cone-zone"/><path class="cone-edges"/>'; $('game').append(cone);
const updatePrimaryCooldown=bindAbilityCooldown($('hex-recharge'));
const extendedCooldownUI=addAbilityCooldown($('weapon'),'extended-recharge');
const extendedButton=document.createElement('button');extendedButton.id='touch-extended';extendedButton.textContent='X';extendedButton.setAttribute('aria-label','Load 36-round magazine');document.querySelector('.touch-right').append(extendedButton);
const grenadeButton=document.createElement('button');grenadeButton.id='touch-grenade';grenadeButton.textContent='E';grenadeButton.setAttribute('aria-label','Throw grenade');document.querySelector('.touch-right').append(grenadeButton);
const placeButton=document.createElement('button');placeButton.id='touch-place';document.querySelector('.touch-right').prepend(placeButton);
const spreadMarker=document.createElement('div');spreadMarker.id='rifle-spread';spreadMarker.innerHTML='<i></i><i></i>';$('game').append(spreadMarker);
spreadMarker.className='rifle-spread';
const secondarySpread=spreadMarker.cloneNode(true);secondarySpread.id='rifle-spread-secondary';secondarySpread.classList.add('secondary-spread');secondarySpread.hidden=true;$('game').append(secondarySpread);
let tutorial=map.training?new Tutorial(sim.weapon):null, tutorialSaved=false, settingsOpen=false, highlightedLesson=-1, tutorialRenderKey='';
let inputOverride=null;
try{inputOverride=sessionStorage.getItem('deadshift-controls-override');}catch{}
const inputPreference=createInputPreference(detectedInput,inputOverride);
let touchPrompts=inputPreference.mode==='touch';
let view;
try { view = new WorldView($('world'), map, settings.quality); view.motion = settings.motion; }
catch (error) {
  $('error-message').textContent = /WebGL|context/i.test(error.message) ? 'This prototype needs WebGL 2. Try an up-to-date browser with hardware acceleration enabled.' : 'The game could not finish loading. Reload the page to try again.';
  $('error').classList.remove('hidden'); console.error(error); throw error;
}

let running = false, started = false, paused = false, accumulator = 0, lastTime = null, elapsed = 0;
let deathActive=false,deathElapsed=0,deathMenuOpen=false;
const deathScreen=createDeathScreen($('game'),{
 restart:()=>{reset();paused=false;running=true;document.body.classList.remove('paused');sound.suspend(false);$('world').focus();},
 menu:()=>{$('main-menu').click();}
});
function beginDeath(){
 if(deathActive)return;
 deathActive=true;deathElapsed=0;running=false;paused=false;mapOpen=false;settingsOpen=false;
 releaseInput();accumulator=0;sound.clearFlights();
 document.body.classList.remove('paused');document.body.classList.add('dying');
 for(const id of ['pause-panel','map-panel','settings-panel','tutorial-guide'])$(id).classList.add('hidden');
}
let mapOpen = false, mapWasPaused = false;
function toggleMap() {
  if(!started||deathActive)return;
  if(!mapOpen){
    mapWasPaused=paused;setPaused(true);mapOpen=true;
    $('pause-panel').classList.add('hidden');
    if(tutorial){tutorial.event({type:'mapOpened'},sim);updateTutorial();}
    $('overhead-image').innerHTML=overheadMapSVG(map,view,sim.player);
    $('map-panel').classList.toggle('teleport-enabled',!!sim.dev.teleport);
    $('map-panel').querySelector('footer').lastChild.textContent=sim.dev.teleport?' CLICK MAP TO TELEPORT':' YOUR LOCATION';
    $('map-panel').classList.remove('hidden');$('map-close').focus();
  }else{
    mapOpen=false;$('map-panel').classList.add('hidden');
    if(mapWasPaused){$('pause-panel').classList.remove('hidden');$('resume').focus();}
    else setPaused(false);
  }
  $('map-toggle').setAttribute('aria-expanded',String(mapOpen));
}
let pendingLaunch = false, pendingSeed = false, pendingQuickShot=false;
let pendingAimPoint = null;
let inputMode = 'keyboard', dirty = true, hudTime = 0, fpsTime = 0, renderedFrames = 0, measuredFPS = 0;
let markerRemaining = 0, coneFlicker = 0;
const keys = new Set(), tappedKeys = new Set();
const touchActionResets=[];
const aimingNow=()=>weaponAiming(sim.weapon,rifleAiming,keys);
const aimDamping=createAimDamping();
let previousPlayer = { ...sim.player };
const mouse = { x: innerWidth * .7, y: innerHeight * .5 };
const cursorTarget={...mouse};
// Smoothed weapons steer the rendered cursor; the rest snap straight to it.
const smoothedCursor=()=>sim.weapon==='rifle'||sim.weapon==='static';
function setCursorTarget(x,y){cursorTarget.x=x;cursorTarget.y=y;if(!smoothedCursor()){mouse.x=x;mouse.y=y;}}
const touch = { moveX: 0, moveZ: 0, aimX: 0, aimZ: 0, seeding: false };
let touchAimPointer=null;
const sticks = new Map();

view.onClatter = type => sound.clatter(type);
view.birds.onFlap = flight => sound.wingbeat(flight.name);

async function start(weapon=sim.weapon) {
  if (started) return;
  sim.weapon=['rifle','shotgun'].includes(weapon)?weapon:'static';
  sim.player.stamina=sim.maxStamina;
  if(map.training){tutorial=new Tutorial(sim.weapon);tutorialSaved=false;tutorialRenderKey='';highlightedLesson=-1;sim.reset();}
  applyInputPreference();
  started = true; running = true; document.body.classList.add('playing');
  $('intro').classList.add('hidden'); ['weapon', 'reticle'].forEach(id => $(id).classList.remove('hidden'));
  $('world').focus();
  if(tutorial){$('tutorial-guide').classList.remove('hidden');updateTutorial();}
  try { await sound.start(); if (paused) sound.suspend(true); }
  catch (error) { console.warn('Audio unavailable:', error); }
}

function returnToMenu(){
  perfReadout.reset();devWindow.hide();
  running=false;started=false;paused=false;mapOpen=false;mapWasPaused=false;settingsOpen=false;
  releaseInput();reset();sound.suspend(true);
  document.body.classList.remove('playing','paused');
  for(const id of ['pause-panel','settings-panel','map-panel','tutorial-guide','weapon','reticle'])$(id).classList.add('hidden');
  $('hit-marker').classList.remove('show');markerRemaining=0;
  $('map-toggle').setAttribute('aria-expanded','false');
  $('intro').classList.remove('hidden');
  const complete=readTutorialComplete();$('tutorial-entry').hidden=complete;$('tutorial-mode').hidden=false;
  history.replaceState(null,'',location.pathname);accumulator=0;lastTime=null;
}

function releaseInput() {
  for(const reset of touchActionResets)reset();
  touchAimPointer=null;
  rifleFiring=false;rifleAiming=false;sim.shotgun.trigger=false;sim.shotgun.suppress=false;
  keys.clear(); tappedKeys.clear(); pendingQuickShot=false; pendingSeed = false; pendingLaunch = false; pendingAimPoint = null;
  touch.moveX = touch.moveZ = touch.aimX = touch.aimZ = 0; touch.seeding = false;
  for (const stick of sticks.values()) { stick.pointer = null; stick.knob.style.transform = ''; stick.element.classList.remove('engaged'); }
}

function setPaused(value) {
  if (!started || deathActive || value === paused) return;
  paused = value; running = !value; releaseInput();
  $('pause-panel').classList.toggle('hidden', !value); $('reticle').classList.toggle('hidden', value);
  document.body.classList.toggle('paused', value); sound.suspend(value); dirty = true;
  if (value) $('resume').focus(); else $('world').focus();
  updateHUD();
}

function reset() {
  deathActive=deathMenuOpen=false;deathElapsed=0;deathScreen.hide();document.body.classList.remove('dying','dead-menu');
  if(tutorial){tutorial=new Tutorial(sim.weapon);tutorialSaved=false;tutorialRenderKey='';updateTutorial();}
  releaseInput(); sound.clearFlights(); sim.reset(); view.reset(sim); accumulator = 0; sound.lastStep = 0;
  previousPlayer = { ...sim.player }; dirty = true; devTools.syncSpeed();updateHUD();
  if(tutorial&&started)$('tutorial-guide').classList.remove('hidden');
}

function toggleAudio() {
  sound.setEnabled(!sound.enabled); $('audio').classList.toggle('muted', !sound.enabled);
  $('mute-all')?.setAttribute('aria-pressed', String(!sound.enabled));
  if($('mute-all'))$('mute-all').textContent=sound.enabled?'MUTE ALL':'UNMUTE ALL';
  $('audio').setAttribute('aria-label', sound.enabled ? 'Mute sound' : 'Unmute sound');
  $('audio').title = (sound.enabled ? 'Mute' : 'Unmute') + ' sound · N';
}

function applyVolume(){
  for(const channel of VOLUME_CHANNELS){
    const slider=$('volume-'+channel);
    settings.volume[channel]=Number(slider.value)/100;
    $('volume-'+channel+'-value').textContent=Math.round(settings.volume[channel]*100)+'%';
    slider.style.setProperty('--fill',slider.value+'%');
    slider.setAttribute('aria-valuetext',Math.round(settings.volume[channel]*100)+' percent');
  }
  sound.setVolumes(settings.volume);
  try { localStorage.setItem('deadshift-settings', JSON.stringify(settings)); } catch { /* Incognito still plays normally. */ }
}

function applySettings() {
  settings.quality = $('graphics-preset').value;
  // Weighted stops: near one of the common rates the handle is pulled onto it,
  // and outside that pull it settles wherever it was let go.
  const settled = snapFps($('fps-limit').value);
  if (String(settled) !== $('fps-limit').value) $('fps-limit').value = String(settled);
  settings.fps = fpsFromSlider(settled);
  $('fps-limit-value').textContent = fpsLabel(settings.fps);
  $('fps-limit').setAttribute('aria-valuetext', fpsLabel(settings.fps));
  // Paint the travelled part of the track; the thumb pseudo-element cannot.
  $('fps-limit').style.setProperty('--fill', sliderFraction(settled) * 100 + '%');
  settings.controlHints=$('control-hints').checked;
  settings.mobileOpacity=Number($('mobile-opacity').value);
  document.body.style.setProperty('--mobile-opacity',settings.mobileOpacity);
  $('weapon').classList.toggle('hide-control-hints',!settings.controlHints);
  if (view.qualityName !== settings.quality) view.setQuality(settings.quality);
  view.motion = settings.motion; budget.fps = settings.fps;
  $('graphics-description').textContent = GRAPHICS[settings.quality].description;
  $('graphics-warning').classList.toggle('hidden', !isDemanding(settings.quality));
  try { localStorage.setItem('deadshift-settings', JSON.stringify(settings)); } catch { /* Incognito still plays normally. */ }
  dirty = true; updateHUD();
}

function updateReticle() {
  const coneWeapon=sim.weapon==='shotgun'||sim.weapon==='rifle';
  cone.style.display=running&&coneWeapon&&!sim.player.dead?'block':'none';
  cone.classList.toggle('firing',coneFlicker>0);
  // The zone is a statement about what this shot would cover, so an empty or
  // mid-reload breech has nothing to say. The guide edges stay up regardless.
  // Same rule for the rifle: no round chambered, or a magazine on the way in,
  // and the zone goes out.
  cone.classList.toggle('unloaded',sim.weapon==='shotgun'
   ? !(sim.shotgun.ammo>0)
   : !(sim.rifle.ammo>0&&sim.rifle.reload<=0));
  if(sim.weapon==='shotgun'){
   const p=sim.player,range=shotgunRange(sim.shotgun.charge),angle=Math.atan2(p.aimZ,p.aimX),spread=shotgunSpread(aimingNow());
   const muzzleX=view.player.position.x+p.aimX*.96-p.aimZ*.20,muzzleZ=view.player.position.z+p.aimZ*.96+p.aimX*.20;
   // Cosmetic cutout only; projectile origins and point-blank collisions are unchanged.
   const guideStart=.7;
   const origin=view.screenPoint(muzzleX+Math.cos(angle-spread)*guideStart,muzzleZ+Math.sin(angle-spread)*guideStart,.77);
   const nearEnd=view.screenPoint(muzzleX+Math.cos(angle+spread)*guideStart,muzzleZ+Math.sin(angle+spread)*guideStart,.77);
   const farLeft=view.screenPoint(muzzleX+Math.cos(angle-spread)*range,muzzleZ+Math.sin(angle-spread)*range,.77);
   const farRight=view.screenPoint(muzzleX+Math.cos(angle+spread)*range,muzzleZ+Math.sin(angle+spread)*range,.77);
   cone.setAttribute('viewBox',`0 0 ${innerWidth} ${innerHeight}`);
   cone.querySelector('.cone-edges').setAttribute('d',`M${origin.x},${origin.y} L${farLeft.x},${farLeft.y} M${nearEnd.x},${nearEnd.y} L${farRight.x},${farRight.y}`);
   // The same quad the edges bound, closed so it can carry a fill.
   cone.querySelector('.cone-zone').setAttribute('d',`M${origin.x},${origin.y} L${farLeft.x},${farLeft.y} L${farRight.x},${farRight.y} L${nearEnd.x},${nearEnd.y} Z`);
  }

  const p = sim.player;
  const point = inputMode === 'mouse' ? mouse : view.screenPoint(p.x + p.aimX * RULES.focusDistance, p.z + p.aimZ * RULES.focusDistance);
  $('reticle').style.left = point.x + 'px'; $('reticle').style.top = point.y + 'px';
  spreadMarker.hidden=secondarySpread.hidden=sim.weapon!=='rifle'||!running;
  if(!spreadMarker.hidden){
   const ax=p.aimPointX??p.x+p.aimX*7,az=p.aimPointZ??p.z+p.aimZ*7;
   const distance=Math.hypot(ax-p.x,az-p.z),speed=Math.hypot(p.vx,p.vz);
   // One ray, fixed by where the cursor is: from the muzzle, laid on the
   // convergence point. Both brackets are read off that same ray at their own
   // distances, so each shows the band bullets actually fall in there.
   // The convergence floor belongs to the barrel alone — applying it to the
   // bracket too is what dragged the near one out to arm's length.
   const aim=rifleAim(p,distance),spread=rifleSpread(distance,speed,aimingNow());
   const dirX=Math.cos(aim.angle),dirZ=Math.sin(aim.angle),perpX=-dirZ,perpZ=dirX;
   // One helper for both the brackets and the zone: the centre of the band at
   // a given range, and the two world points its edges sit on.
   const band=range=>{
    const travel=Math.max(.35,range-RIFLE_MUZZLE.forward);
    const cx=aim.x+dirX*travel,cz=aim.z+dirZ*travel,error=Math.tan(spread)*travel;
    return {cx,cz,error};
   };
   const guide=range=>{
    const {cx,cz,error}=band(range);
    const center=view.screenPoint(cx,cz);
    const edge=view.screenPoint(cx+perpX*error,cz+perpZ*error);
    return {center,width:Math.max(8,Math.hypot(edge.x-center.x,edge.y-center.y)*2),
     angle:Math.atan2(edge.y-center.y,edge.x-center.x)};
   };
   const near=guide(distance);
   spreadMarker.style.left=near.center.x+'px';spreadMarker.style.top=near.center.y+'px';
   spreadMarker.style.width=near.width+'px';
   spreadMarker.style.transform=`translate(-50%,-50%) rotate(${near.angle}rad)`;
   let otherDistance=distance<9?Math.max(13,distance+7):Math.max(2.5,Math.min(6,distance*.4));
   let far=guide(otherDistance);
   // Keep the far guide inside the viewport, including narrow portrait screens.
   for(let i=0;i<12&&(far.center.x<20||far.center.x>innerWidth-20||far.center.y<20||far.center.y>innerHeight-20);i++){
    otherDistance*=.88;far=guide(otherDistance);
   }
   secondarySpread.style.left=far.center.x+'px';secondarySpread.style.top=far.center.y+'px';
   secondarySpread.style.width=far.width+'px';
   secondarySpread.style.transform=`translate(-50%,-50%) rotate(${far.angle}rad)`;
   // The ground this shot can land on, the same statement the Ballast cone
   // makes and drawn off the same ray the brackets are. It spans the two
   // brackets and nothing beyond them: each one caps an end of the band, so
   // the red says "between these", not "everything in front of you".
   const flank=range=>{
    const {cx,cz,error}=band(range);
    return [view.screenPoint(cx-perpX*error,cz-perpZ*error,.77),
            view.screenPoint(cx+perpX*error,cz+perpZ*error,.77)];
   };
   const [nl,nr]=flank(Math.min(distance,otherDistance));
   const [fl,fr]=flank(Math.max(distance,otherDistance));
   cone.setAttribute('viewBox',`0 0 ${innerWidth} ${innerHeight}`);
   cone.querySelector('.cone-zone').setAttribute('d',
    `M${nl.x},${nl.y} L${fl.x},${fl.y} L${fr.x},${fr.y} L${nr.x},${nr.y} Z`);
   // The brackets are the rifle's guide; it needs no drawn cone edges.
   cone.querySelector('.cone-edges').setAttribute('d','');
  }
}

function updateHUD() {
  // The health bar has its own per-frame update in the frame loop, because the
  // tremble needs every frame; calling it again on the 80ms HUD tick was pure
  // duplication.
  const rifle=sim.weapon==='rifle';
  updateWeaponHUD(sim,touchPrompts);$('hex-recharge').classList.remove('hidden');
  spreadMarker.hidden=secondarySpread.hidden=!rifle||!running;
  const stamina = sim.player.stamina;
  if($('dodge-stamina').children.length!==sim.maxStamina){$('dodge-stamina').replaceChildren(...Array.from({length:sim.maxStamina},()=>document.createElement('i')));}
  $('dodge-stamina').setAttribute('aria-label', Math.floor(stamina + 1e-8) + ' dodges available');
  [...$('dodge-stamina').children].forEach((pip, i) => pip.style.setProperty('--stamina-fill', (Math.max(0, Math.min(1, stamina - i)) * 100) + '%'));
  const remaining = Math.max(0, rifle?sim.grenadeCooldown:sim.hexCooldown), ready = remaining < 1e-8, cooldown=rifle?GRENADE.cooldown:RULES.hexCooldown;
  const hexHint = rifle?(ready?'Grenade ready':'Grenade recharging'):sim.hexOrbs.length ? (sim.hexOrbs[0].age<RULES.hexFormationTime?'Hex forming':'Press X to pulse') : sim.hexSpin ? 'Hex spinning' : ready ? 'Hex ability ready' : 'Hex recharging';
  updatePrimaryCooldown(sim.weapon==='shotgun'?{remaining:sim.shotgun.stored?sim.shotgun.hold:0,duration:15,binding:'Q / RMB',label:sim.shotgun.stored?'Stored charge expires':'Hold LMB to charge'}:{remaining,duration:cooldown,binding:rifle?'E':'X',label:hexHint});
  extendedCooldownUI.root.classList.toggle('hidden',!rifle);
  if(rifle)extendedCooldownUI.update({remaining:sim.rifle.extendedCooldown,duration:RIFLE.extendedCooldown,binding:'X',label:sim.rifle.extendedCooldown<1e-8?'36-round magazine ready':'36-round magazine recharging'});
  const expanding=sim.hexOrbs[0],range=sim.weapon==='shotgun'?sim.shotgun.charge:expanding?Math.min(1,Math.hypot(expanding.x-expanding.originX,expanding.z-expanding.originZ)/RULES.hexRange):0;
  $('hex-range').classList.toggle('hidden',!expanding&&sim.weapon!=='shotgun');
  $('hex-range-fill').style.transform=`scaleY(${range})`;
  $('hex-range').classList.toggle('near-limit',range>=.75);
  $('hex-range').classList.toggle('at-limit',range>=.9);
  $('hex-range').setAttribute('aria-valuenow',String(Math.round(range*100)));
  const rangeHint=sim.weapon==='shotgun'?`${Math.round(range*100)}% charge · ${sim.shotgun.stored?sim.shotgun.hold.toFixed(1)+'s stored':'hold LMB; Q / RMB to store'}`:`${Math.round(range*100)}% to boundary · ${Math.max(0,(RULES.hexRange-(expanding?.age||0)*RULES.hexSpeed)/RULES.hexSpeed).toFixed(1)}s until expiry`;
  $('hex-range').setAttribute('aria-valuetext',rangeHint);$('hex-range').title=rangeHint;
  const count = sim.seeds.length;
  $('reticle').classList.toggle('loaded', count > 0);
  $('fps-counter').textContent = paused ? 'PAUSED' : (measuredFPS || '—') + ' FPS';
  if (import.meta.env.DEV) $('world').dataset.debug = JSON.stringify({
    running, paused, time: sim.time, effectTime: view.effectTime, player: sim.player,
    camera: { x: view.focus.x, z: view.focus.z, height: view.cameraHeight }, roof: sim.roofId,
    targets: sim.targets.map(t => ({id:t.id,kind:t.kind,hp:t.hp,maxHp:t.maxHp})), roofs: view.roofs.map(r => ({ id: r.id, opacity: r.opacity })), spray: sim.spray, hexCooldown: sim.hexCooldown, hexSpin: sim.hexSpin ? {age:sim.hexSpin.age,edges:sim.hexSpin.edges} : null, hexOrbs: sim.hexOrbs, seeds: count, ammo: sim.ammo,
    rechargeProgress: sim.rechargeProgress, rechargeWait: sim.rechargeWait,
    crops: sim.crops.map(c => ({ id: c.id, state: c.state, burnAge: c.burnAge })),
    bentStalks: [...view.cropView.parts.values()].reduce((n, p) => n + p.stalks.filter(s => s.bend > .01).length, 0),
    shots: sim.shots.map(s => ({ id: s.id, phase: s.phase, x: s.x, z: s.z, damage: s.damage })), stats: sim.stats,
    props: sim.props.filter(p => p.health !== null).map(p => ({ id: p.id, type: p.type, x: p.x, z: p.z, hp: p.hp })),
    beams: [...view.beams.values()].map(b => ({ age: b.age, finished: b.finished, startX: b.startX, startZ: b.startZ, endX: b.endX, endZ: b.endZ })),
    particles: view.particles.length, particleLife: view.particles[0]?.life,
    footprints: view.footprints.map(p => ({ x: p.x, z: p.z, age: p.age })), surfaceMarks: view.surfaceMarks.count,
    blasts: view.blasts.map(b => ({ x: b.x, z: b.z, radius: b.radius, age: b.age })),
    debris: view.particles.filter(p => p.debris).map(p => ({ x: p.x, z: p.z, y: p.y, vx: p.vx, vz: p.vz, bounces: p.bounces })),
    tumbleweeds: view.tumbleweeds.map(t => ({ x: t.position.x, z: t.position.z, age: t.userData.age })),
    moteX: view.motes.geometry.attributes.position.array[0],
    graphics: { preset: settings.quality, fpsCap: settings.fps, measuredFPS, pixelRatio: view.renderer.getPixelRatio(), shadowSize: view.quality.shadows, textureSize: view.quality.texture, motes: view.quality.motes, effects: view.quality.effects },
    inputMode, drawCalls: view.renderer.info.render.calls, triangles: view.renderer.info.render.triangles, audio: sound.context?.state ?? 'not-started',
  });
}

function event(e) {
  // The danger zone blinks out on the shot itself: the cone is a warning, and
  // once the shell is away there is nothing left to warn about for a moment.
  // Both cones blink off on the shot, so the zone reads as a statement about
  // the next round rather than a light left on. The rifle's is shorter: it
  // fires six times a second and a long blink would just look like flicker.
  if(e.type==='shotgunShot')coneFlicker=.12;
  if(e.type==='rifleShot')coneFlicker=.055;
  if(e.type==='playerDamage')damageFeedback.add(e.damage,sim.time);
  if(e.type==='outgoingDamage')outgoingFeedback.add(e,sim.time);
  if(tutorial){tutorial.event(e,sim);updateTutorial();}
  view.event(e); sound.event(e);
  if(e.type==='playerDeath')beginDeath();
  if (e.type === 'hit' || e.type === 'kill') {
    const marker = $('hit-marker'), position = view.screenPoint(e.x, e.z);
    marker.style.left = position.x + 'px'; marker.style.top = position.y + 'px';
    marker.className = 'hit-marker' + (e.type === 'kill' ? ' kill' : '') + ' show'; markerRemaining = .18;
  }
}

function bindStick(id, type) {
  const element = $(id), knob = element.querySelector('.stick-knob');
  const stick = { element, knob, pointer: null }; sticks.set(type, stick);
  function move(e) {
    if (e.pointerId !== stick.pointer) return;
    const rect = element.getBoundingClientRect(), radius = rect.width * .36;
    let x = (e.clientX - rect.left - rect.width / 2) / radius, z = (e.clientY - rect.top - rect.height / 2) / radius;
    const length = Math.hypot(x, z); if (length < .14) x = z = 0; else if (length > 1) { x /= length; z /= length; }
    knob.style.transform = 'translate(' + (x * radius) + 'px, ' + (z * radius) + 'px)';
    if (type === 'move') { touch.moveX = x; touch.moveZ = z; }
    else { touch.aimX = x; touch.aimZ = z; }
  }
  element.addEventListener('pointerdown', e => {
    if (!running || stick.pointer !== null) return;
    e.preventDefault(); if(type==='aim'||!touchPrompts||inputMode!=='mouse')inputMode='keyboard'; stick.pointer = e.pointerId; element.setPointerCapture(e.pointerId); element.classList.add('engaged');
    move(e);
  });
  element.addEventListener('pointermove', move);
  const release = e => {
    if (e.pointerId !== stick.pointer) return;
    stick.pointer = null; knob.style.transform = ''; element.classList.remove('engaged');
    if (type === 'move') touch.moveX = touch.moveZ = 0;
    else { touch.aimX = touch.aimZ = 0; }
  };
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) element.addEventListener(name, release);
}

$('world').tabIndex = 0;
const spawnBird=()=>view.birds.spawnNext(view.focus,view.birdView())?.name;
function showDevEntry(unlocked){
 $('dev-open').hidden=!unlocked;
 if(!unlocked)closeDevPanel();
}
function closeDevPanel(){
 $('dev-panel').classList.add('hidden');
 $('settings-panel').classList.remove('with-dev');
 $('dev-open').setAttribute('aria-expanded','false');
}
const devTools=installDevTools(sim,$('dev-panel'),()=>{dirty=true;updateHUD();},{
 spawnBird,
 onUnlock:()=>showDevEntry(true),
 onLock:()=>showDevEntry(false),
});
$('dev-open').onclick=()=>{
 const opening=$('dev-panel').classList.contains('hidden');
 $('dev-panel').classList.toggle('hidden',!opening);
 $('settings-panel').classList.toggle('with-dev',opening);
 $('dev-open').setAttribute('aria-expanded',String(opening));
 if(opening)$('dev-panel').querySelector('select,input,button')?.focus();
};
const devWindow=createDevWindow($('game'),{sim,spawnBird,
 quality:()=>settings.quality,
 setQuality:name=>{$('graphics-preset').value=name;applySettings();},
 changed:()=>{dirty=true;updateHUD();devTools.syncSpeed();}});
const devDialog=createDevUnlockDialog($('game'),{
 unlock:code=>devTools.unlock(code),
 open:()=>{setPaused(true);$('pause-panel').classList.add('hidden');},
 close:()=>{setPaused(false);},
 enabled:()=>showDevNotice(devTools.toggleAll())
});
function showDevNotice(enabled){
 devNotice.textContent=enabled?'DEV TOOLS ON':'DEV TOOLS OFF';
 devNotice.classList.add('visible');clearTimeout(devNoticeTimer);
 devNoticeTimer=setTimeout(()=>devNotice.classList.remove('visible'),1800);
}
const devNotice=document.createElement('div');devNotice.className='toast';devNotice.setAttribute('role','status');$('game').append(devNotice);let devNoticeTimer;
function thumbnail(){
 try{const cached=sessionStorage.getItem('deadshift-native-thumbnail');if(cached)return cached;}catch{}
 if(map.id!=='deadwater')return '';
 const image=view.captureMapThumbnail();
 try{sessionStorage.setItem('deadshift-native-thumbnail',image);}catch{}
 return image;
}
const menuFlow=installMenu({$,map,thumbnail,start,openSettings,closeSettings,returnToMenu,tutorialComplete:readTutorialComplete()});
$('overhead-image').addEventListener('click',e=>{
  if(!mapOpen||!sim.dev.teleport)return;
  const svg=$('overhead-image').querySelector('svg'),matrix=svg?.getScreenCTM();if(!matrix)return;
  const point=new DOMPoint(e.clientX,e.clientY).matrixTransform(matrix.inverse());
  if(!isPlayable(map,point.x,point.y,RULES.radius))return;
  releaseInput();sim.hexOrbs=[];sim.hexSpin=null;sim.spray.active=false;
  sim.player.x=Math.max(-map.width/2+RULES.radius,Math.min(map.width/2-RULES.radius,point.x));
  sim.player.z=Math.max(-map.depth/2+RULES.radius,Math.min(map.depth/2-RULES.radius,point.y));
  sim.player.vx=sim.player.vz=sim.player.dodgeRemaining=0;
  sim.movePlayer(0,0);previousPlayer={...sim.player};accumulator=0;
  view.focus.set(sim.player.x,0,sim.player.z);dirty=true;
  $('overhead-image').innerHTML=overheadMapSVG(map,view,sim.player);
});

bindTouchAction($('pause'),{press:()=>{if(mapOpen)toggleMap();else setPaused(!paused);}});
bindTouchAction($('map-toggle'),{press:toggleMap});
$('map-close').addEventListener('click',toggleMap);
$('resume').addEventListener('click', () => setPaused(false));
$('reset').addEventListener('click', () => { reset(); setPaused(false); });
bindTouchAction($('audio'),{press:toggleAudio});
const sliderFraction = at => (Number(at) - FPS_MIN) / (FPS_UNCAPPED_SLIDER - FPS_MIN);
// One prong per weighted stop, positioned on the same scale as the handle.
$('fps-limit-ticks').replaceChildren(...FPS_STOPS.map(stop => {
  const prong = document.createElement('i');
  prong.style.left = sliderFraction(stop) * 100 + '%';
  prong.title = fpsLabel(stop);
  return prong;
}));
$('graphics-preset').value = settings.quality; $('fps-limit').value = String(fpsToSlider(settings.fps));
$('control-hints').checked=settings.controlHints;
$('mobile-opacity').value=String(settings.mobileOpacity);
for (const id of ['graphics-preset', 'fps-limit','control-hints','mobile-opacity']) $(id).addEventListener('change', applySettings);
// The slider needs to read live while dragged, not only on release.
$('fps-limit').addEventListener('input', applySettings);
applySettings();
const selectMenus=installSelectMenus($('settings-panel'));
for(const channel of VOLUME_CHANNELS){
 const slider=$('volume-'+channel);
 slider.value=String(Math.round(settings.volume[channel]*100));
 slider.addEventListener('input',applyVolume);
 slider.addEventListener('change',applyVolume);
}
$('mute-all').onclick=toggleAudio;
applyVolume();
bindStick('move-stick', 'move'); bindStick('seed-stick', 'aim');
window.addEventListener('resize', () => { view.resize(); dirty = true; });
// The cached canvas rect is in page coordinates, so a scroll moves it even
// though nothing resized.
window.addEventListener('scroll', () => { view.cachedRect = null; }, { passive: true });
$('world').addEventListener('pointermove', e => {
  if(e.pointerType!=='mouse'&&e.pointerId===touchAimPointer&&running){e.preventDefault();setCursorTarget(e.clientX,e.clientY);inputMode='mouse';return;}
  if (e.pointerType !== 'mouse') return;
  setCursorTarget(e.clientX,e.clientY); inputMode = 'mouse';
  if(running&&(sim.weapon==='rifle'||sim.weapon==='shotgun')){rifleFiring=!!(e.buttons&1);rifleAiming=!!(e.buttons&2);}
});
$('world').addEventListener('pointerdown', e => {
  if(e.pointerType!=='mouse'&&touchPrompts){
   if(!running||touchAimPointer!==null)return;
   e.preventDefault();touchAimPointer=e.pointerId;inputMode='mouse';setCursorTarget(e.clientX,e.clientY);$('world').setPointerCapture(e.pointerId);return;
  }
  if(running&&(sim.weapon==='rifle'||sim.weapon==='shotgun')&&(e.button===0||e.button===2)){
   if(e.pointerType!=='mouse')e.preventDefault();inputMode='mouse';setCursorTarget(e.clientX,e.clientY);
   if(e.button===0){rifleFiring=true;pendingLaunch=true;}else rifleAiming=true;
   $('world').setPointerCapture(e.pointerId);$('world').focus();return;
  }
  if (!running || e.button !== 0) return;
  e.preventDefault(); inputMode = 'mouse'; mouse.x = e.clientX; mouse.y = e.clientY;
  if(e.pointerType==='mouse'){
    const cross=$('reticle').querySelector('span');
    cross.getAnimations().forEach(animation=>animation.cancel());
    cross.animate([
      {opacity:1,transform:'translate(-50%,-50%) scale(.65)'},
      {opacity:1,transform:'translate(-50%,-50%) scale(1)',offset:.25},
      {opacity:0,transform:'translate(-50%,-50%) scale(1.15)'}
    ],{duration:260,easing:'ease-out'});
    updateReticle();
  }
  pendingLaunch = true; pendingQuickShot=true; pendingAimPoint = keyboardAim(keys,tappedKeys).active?null:view.aim(mouse.x, mouse.y, sim.player); $('world').focus();
});
$('world').addEventListener('contextmenu',e=>e.preventDefault());
bindRifleMouse($('world'),window,{
 enabled:()=>running&&(sim.weapon==='rifle'||sim.weapon==='shotgun'),state:(fire,aim)=>{rifleFiring=fire;rifleAiming=aim;},
 fire:()=>{pendingLaunch=true;},store:()=>{if(sim.weapon==='shotgun')tappedKeys.add('MouseRight');},aim:(x,y)=>{setCursorTarget(x,y);inputMode='mouse';}
});
window.addEventListener('pointerup',e=>{if(e.pointerType==='mouse'){if(e.button===0)rifleFiring=false;if(e.button===2)rifleAiming=false;}if(e.pointerId===touchAimPointer)touchAimPointer=null;});
for(const type of ['pointercancel','lostpointercapture'])$('world').addEventListener(type,e=>{if(e.pointerId===touchAimPointer)touchAimPointer=null;});
$('world').addEventListener('pointercancel',()=>{rifleFiring=false;rifleAiming=false;});
const navigateMenu=createMenuNavigation();
window.addEventListener('keydown', e => {
  if(document.body.classList.contains('loading'))return;
  if(devDialog.isOpen){devDialog.keydown(e);return;}
  if(deathActive){
   if(deathMenuOpen)navigateMenu(e,deathScreen.root,()=>{});
   if(['Escape','Space','Tab','KeyQ','KeyE','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();
   return;
  }
  const menuRoot=settingsOpen?$('settings-panel'):mapOpen?$('map-panel'):paused?$('pause-panel'):!started?$('intro'):null;
  if(navigateMenu(e,menuRoot,()=>{if(settingsOpen)closeSettings();else if(mapOpen)toggleMap();else if(paused)setPaused(false);else menuFlow.back();}))return;
  if(settingsOpen){
    if(e.code==='Escape'){e.preventDefault();closeSettings();}
    if(e.code==='Tab'){
      const items=[...$('settings-panel').querySelectorAll('button,input,select,summary,[role=combobox]')].filter(el=>el.getClientRects().length);
      if(e.shiftKey&&document.activeElement===items[0]){e.preventDefault();items.at(-1).focus();}
      else if(!e.shiftKey&&document.activeElement===items.at(-1)){e.preventDefault();items[0].focus();}
    }
    return;
  }
  if(e.target.matches('input,select,textarea')&&e.code!=='Escape')return;
  if(e.code==='KeyM'&&!e.repeat){e.preventDefault();toggleMap();return;}
  if(mapOpen){
    if(e.code==='Escape'&&!e.repeat){e.preventDefault();toggleMap();}
    if(e.code==='Tab'){e.preventDefault();$('map-close').focus();}
    return;
  }
  if (e.code === 'Escape') { e.preventDefault(); if(!e.repeat&&started)setPaused(!paused); return; }
  if(!started)return;
  if (paused) {
    if (e.code === 'Tab') {
      const focusable = [...$('pause-panel').querySelectorAll('button,select,input')];
      const first = focusable[0], last = focusable.at(-1);
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    return;
  }
  if (e.code === 'KeyN' && !e.repeat) toggleAudio();
  if(e.code==='KeyO'&&!e.repeat&&devTools.isUnlocked()){e.preventDefault();devWindow.toggle();return;}
  if(e.code==='KeyP'&&!e.repeat){
   e.preventDefault();
   if(!running)return;
   const enabled=devTools.toggleAll();
   if(enabled===null)devDialog.show();else {showDevNotice(enabled);devWindow.sync();}
   return;
  }
  if (!running) return;
  if (['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  if (e.repeat) return;
  keys.add(e.code); tappedKeys.add(e.code);
  if (e.code.startsWith('Arrow')) inputMode = 'keyboard';
  if (e.code === 'KeyQ') { pendingLaunch = true; pendingQuickShot=true; pendingAimPoint = inputMode === 'mouse'&&!keyboardAim(keys,tappedKeys).active ? view.aim(mouse.x, mouse.y, sim.player) : null; }
  if (e.code === 'KeyR') e.preventDefault();
});
window.addEventListener('keyup', e => keys.delete(e.code));
window.addEventListener('blur', releaseInput);
document.addEventListener('visibilitychange', () => { if(document.hidden){releaseInput();lastTime=null;accumulator=0;} });

function frame(time) {
  const dt = lastTime === null ? 0 : Math.min((time - lastTime) / 1000, .1); lastTime = time;
  if (!paused) {
    elapsed += dt;
    if (markerRemaining > 0) { markerRemaining -= dt; if (markerRemaining <= 0) $('hit-marker').classList.remove('show'); }
    if (coneFlicker > 0) coneFlicker -= dt;
  }
  if (running) {
    accumulator += dt;
    while (running && accumulator >= RULES.step) {
      previousPlayer = { ...sim.player };
      if(smoothedCursor()&&inputMode==='mouse')advanceAimCursor(mouse,cursorTarget,RULES.step,aimingNow(),sim.weapon);
      const held = key => keys.has(key) || tappedKeys.has(key);
      const moveX = touch.moveX || Number(held('KeyD')) - Number(held('KeyA'));
      const moveZ = touch.moveZ || Number(held('KeyS')) - Number(held('KeyW'));
      const arrows=keyboardAim(keys,tappedKeys);
      const manualX = touch.aimX || arrows.x;
      const manualZ = touch.aimZ || arrows.z;
      let aimX = sim.player.aimX, aimZ = sim.player.aimZ;
      let aimPointX, aimPointZ;
      // Arrow aiming latches inputMode to 'keyboard' until the mouse moves again,
      // so releasing the arrows hands aim to this movement fallback. It is just as
      // digital as the arrows: without easing it snaps between the eight WASD
      // compass points and the walk loses its turn.
      let digitalAim = !!(manualX || manualZ);
      if (digitalAim) { aimX = manualX; aimZ = manualZ; inputMode = 'keyboard'; }
      else if (inputMode === 'mouse') {
        const cursorAim = view.aim(mouse.x, mouse.y, sim.player);
        ({ aimX, aimZ, aimPointX, aimPointZ } = aimsByPoint(sim.weapon) ? aimDamping.apply(cursorAim, sim.player) : cursorAim);
      }
      else if (moveX || moveZ) { aimX = moveX; aimZ = moveZ; digitalAim = true; }
      sim.step({ moveX, moveZ, aimX, aimZ, aimPointX, aimPointZ, smoothAim:digitalAim, grenade:tappedKeys.has('KeyE'), extendedReload:tappedKeys.has('KeyX'), fire:sim.weapon==='shotgun'?rifleFiring:rifleFiring||pendingLaunch||(sim.weapon==='rifle'&&held('KeyQ')),tapFire:pendingLaunch&&!tappedKeys.has('KeyQ'),storeCharge:tappedKeys.has('MouseRight')||tappedKeys.has('KeyQ'),doubleShot:tappedKeys.has('KeyE'),aiming:aimingNow(),reload:tappedKeys.has('KeyR'), spray: held('KeyC'), dodge: tappedKeys.has('Space'), hex: tappedKeys.has('KeyX'), seed: held('KeyE') || touch.seeding || pendingSeed, launch: pendingLaunch, quickShot:pendingQuickShot,
        launchPointX: arrows.active?undefined:pendingAimPoint?.aimPointX, launchPointZ: arrows.active?undefined:pendingAimPoint?.aimPointZ });
      if(tutorial){tutorial.update(sim.player);if(tutorial.weapon==='static'&&tutorial.index===5&&!sim.hexOrbs.length&&!sim.hexSpin){sim.hexCooldown=0;sim.ammo=Math.max(sim.ammo,10);}if(tutorial.weapon==='rifle'&&tutorial.index===6&&!sim.grenades.length)sim.grenadeCooldown=0;if(tutorial.weapon==='rifle'&&tutorial.index===7&&!sim.rifle.reload)sim.rifle.extendedCooldown=0;updateTutorial();}
      tappedKeys.clear(); pendingQuickShot=false; pendingLaunch = pendingSeed = false; pendingAimPoint = null; accumulator -= RULES.step;
      for (const e of sim.drainEvents()) event(e);
    }
    sound.update(sim.player, sim.time);
    sound.updateHex(sim);
  }
  // No view.update during pause: the rendered scene and all effect clocks freeze.
  if (paused) {
    if (dirty) { view.render(); dirty = false; }
  } else if(started) {
    const renderDelta = budget.tick(dt);
    if (renderDelta > 0) {
      view.update(sim, renderDelta, running, elapsed, previousPlayer, running ? accumulator / RULES.step : 1);
      updateReticle(); dirty = false; renderedFrames++;
    }
    if(running&&!document.hidden) view.setResolutionScale(adaptiveResolution.sample(dt,renderDelta>0,settings.quality,settings.fps));
    else adaptiveResolution.reset();
    fpsTime += dt;
    if (fpsTime >= 1) { measuredFPS = Math.round(renderedFrames / fpsTime); fpsTime = 0; renderedFrames = 0; }
  }
  if(paused)adaptiveResolution.reset();
  perfReadout.update(started && !paused ? dt : 0, measuredFPS);
  updateHealthHUD(sim);
  hudTime += dt; if (hudTime >= .08) { updateHUD(); hudTime = 0; }
  damageFeedback.update(sim,view);outgoingFeedback.update(sim,view);
  if(deathActive&&!deathMenuOpen){
   deathElapsed+=dt;
   if(deathElapsed>=DEATH_MENU_DELAY){deathMenuOpen=true;paused=true;document.body.classList.add('dead-menu');deathScreen.show();sound.suspend(true);}
  }
  requestAnimationFrame(frame);
}
function openSettings(){settingsOpen=true;selectMenus.reset();$('settings-panel').querySelectorAll('details').forEach(detail=>detail.open=false);$('pause-panel').classList.add('hidden');$('settings-panel').classList.remove('hidden');$('settings-back').focus();}
function closeSettings(){settingsOpen=false;selectMenus.reset();$('settings-panel').classList.add('hidden');if(started){$('pause-panel').classList.remove('hidden');$('resume').focus();}else $('menu-settings').focus();}
function updateTutorial(){
 if(!tutorial)return;
 const renderKey=`${tutorial.weapon}:${tutorial.index}:${tutorial.count}:${tutorial.active}:${touchPrompts}`;
 if(renderKey===tutorialRenderKey)return; tutorialRenderKey=renderKey;
 const highlightIndex=tutorial.complete?-1:tutorial.index;
 if(highlightedLesson!==highlightIndex){
   document.querySelectorAll('.tutorial-highlight').forEach(el=>el.classList.remove('tutorial-highlight'));
   const ids=tutorial.weapon==='shotgun'?[null,'dodge-stamina','seed-pips','hex-range','hex-range','seed-pips','seed-pips','map-toggle']:tutorial.weapon==='rifle'?[touchPrompts?'move-stick':null,'dodge-stamina','seed-pips','seed-pips',touchPrompts?'touch-stream':'rifle-spread',touchPrompts?'touch-hex':'seed-pips','hex-recharge','extended-recharge','map-toggle']:[touchPrompts?'move-stick':null,'dodge-stamina','seed-pips','seed-pips','seed-pips','hex-recharge','map-toggle'];
   const id=ids[highlightIndex];if(id)$(id).classList.add('tutorial-highlight');
   highlightedLesson=highlightIndex;
 }
 const weaponName=tutorial.weapon==='shotgun'?'BALLAST':tutorial.weapon==='rifle'?'NOMINAL':'STATIC';
 $('tutorial-progress').textContent=tutorial.complete?`${weaponName} · COMPLETE`:`${weaponName} · LESSON ${tutorial.index+1} / ${tutorial.lessons.length}`;
 const lesson=tutorial.lessons[tutorial.index]||['Ready for the outpost','Tutorial complete. You can replay it from Gamemodes.'];
 const practicing=!tutorial.complete&&tutorial.active&&!tutorial.ready;
 $('tutorial-count').hidden=!practicing;
 $('tutorial-count').textContent=`${tutorial.count} / ${tutorial.goal}`;
 $('tutorial-count').setAttribute('aria-label',`${tutorial.count} completed, ${Math.max(0,tutorial.goal-tutorial.count)} remaining`);
 $('tutorial-next').hidden=tutorial.complete||practicing;
 $('tutorial-next').disabled=false;
 $('tutorial-next').textContent=!tutorial.active?'BEGIN':'CONTINUE';
 $('tutorial-title').textContent=lesson[0];
 let hint=touchPrompts&&tutorial.weapon!=='shotgun'?((tutorial.weapon==='rifle'?rifleTouchLessons:touchLessons)[tutorial.index]||lesson[1]):lesson[1];
 if(touchPrompts&&tutorial.index===0)hint='Drag the left stick to move, use the AIM stick or drag on the world to aim.\n\nTap EDIT to move, resize or remove controls. Layouts save automatically; RESET restores them.';
 $('tutorial-guide').dataset.practicing=String(practicing);
 $('tutorial-hint').textContent=practicing?hint.split('\n\n')[0]:hint;$('tutorial-finish').hidden=!tutorial.complete;
 if(tutorial.complete&&!tutorialSaved)tutorialSaved=saveTutorialComplete(tutorial);
}
const touchLessons=[
 'Drag and hold the highlighted left stick to walk.\n\nKeep moving until the counter fills.',
 'Move with the left stick and tap Dodge. Repeat five times.\n\nThe two highlighted bars show stamina. Each dodge uses one charge; wait for it to refill.',
 'Touch and drag toward the targets to aim. Hold PLACE to place five orbs, then release.\n\nOrbs reload faster when standing still, except while using the lightning stream.',
 'Drag on the world to aim, then tap LAUNCH for a single shot.\n\nPlacing an orb before launching deals slightly more damage.\n\nFor a volley, hold PLACE to place orbs, release it, then tap LAUNCH.\n\nLand five shots or volleys. ',
 'Move close to a target and aim by dragging on the world. Hold STREAM to hit it with lightning, then release. Repeat five times.\n\nKeep the stream on the same target to increase damage. Watch the ammo bar and wait for a refill if it runs out.',
 'Tap PULSE to deploy. Wait for the hexagon to form, then tap PULSE again to pulse. Repeat five times.\n\nPulse before the hexagon reaches the red boundary. Training restores ammo and cooldown between attempts.',
 'Tap the highlighted map button at the top right.\n\nClose the map, then tap Continue to finish.'
];
function applyInputPreference(){
 highlightedLesson=-2;
 document.body.dataset.controls=touchPrompts?'touch':'keyboard';
 $('input-keyboard').setAttribute('aria-pressed',String(!touchPrompts));
 $('input-mobile').setAttribute('aria-pressed',String(touchPrompts));
  const rifle=sim.weapon==='rifle',shotgun=sim.weapon==='shotgun';
  grenadeButton.hidden=extendedButton.hidden=!rifle&&!shotgun;
  placeButton.hidden=rifle||shotgun;
  const touchLabel=(id,label,binding)=>{
   const word=document.createElement('span');word.className='button-label';word.textContent=label;
   const key=document.createElement('small');key.className='touch-binding';key.textContent=binding;
   $(id).replaceChildren(word,key);
  };
  touchLabel('touch-extended',shotgun?'LOCK':'EXTEND',shotgun?'Q / RMB':'X');
  touchLabel('touch-grenade',shotgun?'DOUBLE':'GRENADE','E');
  extendedButton.setAttribute('aria-label',shotgun?'Store charge':'Load extended magazine');
  grenadeButton.setAttribute('aria-label',shotgun?'Fire both shells':'Throw grenade');
  updateWeaponHUD(sim,touchPrompts);
  touchLabel('touch-launch',rifle||shotgun?'FIRE':'LAUNCH',shotgun?'LMB':'LMB / Q');
  touchLabel('touch-hex',rifle||shotgun?'RELOAD':'PULSE',rifle||shotgun?'R':'X');
  touchLabel('touch-stream',rifle||shotgun?'AIM':'STREAM',rifle?'RMB / SHIFT':shotgun?'RMB':'C');
  touchLabel('touch-dodge','DODGE','SPACE');
  touchLabel('touch-place','PLACE','E');
 $('pause').textContent=touchPrompts?'PAUSE':'ESC';$('pause').title='Pause / resume · Esc';
 $('map-toggle').textContent=touchPrompts?'MAP':'M';$('audio').textContent=touchPrompts?'SOUND':'N';
 updateTutorial();
}
for(const [id,value] of [['input-keyboard','keyboard'],['input-mobile','touch']])$(id).onclick=()=>{
 inputPreference.select(value);touchPrompts=value==='touch';releaseInput();
 try{sessionStorage.setItem('deadshift-controls-override',value);}catch{}
 applyInputPreference();
};
function detectActiveInput(mode){
 if(document.body.classList.contains('loading')||document.body.classList.contains('editing-touch-layout'))return;
 if(inputPreference.observe(mode)){releaseInput();touchPrompts=mode==='touch';applyInputPreference();}
}
window.addEventListener('pointerdown',e=>{
 if(e.pointerType==='touch'||e.pointerType==='pen')detectActiveInput('touch');
 else if(e.pointerType==='mouse')detectActiveInput('keyboard');
},true);
window.addEventListener('keydown',e=>{
 if(e.target.matches('input,select,textarea,[contenteditable=true]')||e.ctrlKey||e.metaKey||e.altKey)return;
 if(['KeyW','KeyA','KeyS','KeyD','KeyQ','KeyE','KeyR','KeyX','KeyC','Space','Escape','Tab','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))detectActiveInput('keyboard');
},true);
applyInputPreference();
$('tutorial-next').onclick=()=>{if(!tutorial.active)tutorial.begin();else tutorial.advance();releaseInput();updateTutorial();};
const bindAction=(element,press,release)=>touchActionResets.push(bindTouchAction(element,{enabled:()=>running,press,release}));
bindAction($('touch-hex'),()=>tappedKeys.add(sim.weapon==='static'?'KeyX':'KeyR'));
bindAction($('touch-dodge'),()=>tappedKeys.add('Space'));
bindAction(placeButton,()=>{touch.seeding=true;pendingSeed=true;},()=>{touch.seeding=false;});
bindAction(grenadeButton,()=>{if(sim.weapon!=='static')tappedKeys.add('KeyE');});
bindAction(extendedButton,()=>tappedKeys.add(sim.weapon==='shotgun'?'KeyQ':'KeyX'));
bindAction($('touch-stream'),()=>{if(sim.weapon==='static')keys.add('KeyC');else rifleAiming=true;},()=>{keys.delete('KeyC');rifleAiming=false;});
bindAction($('touch-launch'),()=>{
 pendingLaunch=true;pendingQuickShot=true;
 const stickAim=!!(touch.aimX||touch.aimZ)||sticks.get('aim')?.pointer!==null;
 pendingAimPoint=inputMode==='mouse'&&!stickAim&&!keyboardAim(keys,tappedKeys).active?view.aim(mouse.x,mouse.y,sim.player):null;
 if(sim.weapon!=='static')rifleFiring=true;
},()=>{rifleFiring=false;});
const touchLayout=installTouchLayout({root:$('game'),controls:$('touch-controls'),actions:document.querySelector('.top-actions'),
 canEdit:()=>started&&running&&!deathActive,
 onEditing:editing=>{releaseInput();running=!editing&&started&&!paused&&!deathActive;accumulator=0;sound.suspend(editing||paused);dirty=true;}
});
updateHUD(); requestAnimationFrame(frame);
export function finishLoading(){
 if(params.get('play')==='1')void start();
 else $('gamemodes').focus();
}



