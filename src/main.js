import {bindTouchAction} from './touch-action.js';
import {migrateGameStorage} from './storage-migration.js';
import {isPlayable} from './playable-area.js';
import {detectedControls,createInputPreference} from './input-preference.js';
import './mobile-controls.css';
import './tutorial.css';
import {installTouchLayout} from './touch-layout.js';
import { bindFloatingStick, arrangeTouchCluster, isTap, TOUCH_TAP, MOVE_STICK } from './touch-controls.js';
import { installMobileSettings } from './mobile-settings.js';
import {createOutgoingFeedback} from './outgoing-feedback.js';
import { createMenuNavigation } from './menu-navigation.js';
import { installSelectMenus } from './select-menu.js';
import { readTutorialComplete, saveTutorialComplete } from './tutorial-progress.js';
import { createAbilityHUD } from './ability-hud.js';
import { writeDebugState } from './debug-state.js';
import { createWeaponHUD } from './weapon-hud.js';
import { createAimOverlay } from './aim-overlay.js';
import { createHealthHUD } from './health-hud.js';
import { createPerfReadout } from './perf-readout.js';
import { createDamageFeedback } from './damage-feedback.js';
import { createDeathScreen, DEATH_MENU_DELAY } from './death-screen.js';
import { bindRifleMouse, weaponAiming,ballastInput } from './rifle-input.js';
import { advanceAimCursor } from './aim-cursor.js';
import { createAimDamping, aimsByPoint } from './aim-damping.js';
import { tutorialMapFor, Tutorial } from './tutorial.js';
import { createTutorialCard } from './tutorial-card.js';
import { installMenu } from './menu.js';
import { createOnlinePlay } from './online-play.js';
import { TAB_TITLE } from './version.js';
import { installUiSounds } from './ui-sounds.js';
import { maps } from './maps.js';
import { Simulation, RULES, explosionFor } from './simulation.js';
import { WorldView } from './renderer.js';
import { Soundscape } from './audio.js';
import { validateSettings, RenderBudget, AdaptiveResolution } from './settings.js';
import { installSettingsPanel } from './settings-panel.js';
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
document.title = TAB_TITLE;
document.querySelector('.brand p').textContent = map.name.toUpperCase();
document.querySelector('.mode').textContent=map.training?'TUTORIAL':'PRACTICE';
let settings;
const detectedInput=detectedControls({coarsePointer:matchMedia('(pointer: coarse)').matches,hoverAvailable:matchMedia('(hover: hover)').matches});
const deviceDefaults={mobile:detectedInput==='touch'};
try { settings = validateSettings(JSON.parse(localStorage.getItem('deadshift-settings') || '{}'),deviceDefaults); }
catch { settings = validateSettings({},deviceDefaults); }
const sim = new Simulation(map), sound = new Soundscape(), budget = new RenderBudget(settings.fps);
// Menu clacks (ui-sounds.js): muted with the game, at the master and effects levels.
installUiSounds({muted:()=>!sound.enabled,level:()=>sound.volume.master*sound.volume.effects});
const adaptiveResolution = new AdaptiveResolution();
sim.weapon=['rifle','shotgun'].includes(params.get('weapon'))?params.get('weapon'):'static';
let rifleFiring=false,rifleAiming=false,worldPress=false,pointerOnUI=false;
const updateWeaponHUD=createWeaponHUD($('weapon'));
const updateHealthHUD=createHealthHUD($('game'));
const perfReadout=createPerfReadout(document.querySelector('.masthead'));
const damageFeedback=createDamageFeedback($('game'));
const outgoingFeedback=createOutgoingFeedback($('game'));
const abilityHUD=createAbilityHUD();
const extendedButton=document.createElement('button');extendedButton.id='touch-extended';extendedButton.textContent='X';extendedButton.setAttribute('aria-label','Load 36-round magazine');document.querySelector('.touch-right').append(extendedButton);
const grenadeButton=document.createElement('button');grenadeButton.id='touch-grenade';grenadeButton.textContent='E';grenadeButton.setAttribute('aria-label','Throw grenade');document.querySelector('.touch-right').append(grenadeButton);
const placeButton=document.createElement('button');placeButton.id='touch-place';document.querySelector('.touch-right').prepend(placeButton);
// The home screen's tutorial runs the basics; Gamemodes > Tutorial runs a weapon's own course.
let tutorialCourse=params.get('course')==='basics'?'basics':null;
const courseFor=weapon=>tutorialCourse==='basics'?'basics':weapon;
if(map.training&&tutorialCourse==='basics')sim.weapon='static';
let tutorial=map.training?new Tutorial(courseFor(sim.weapon)):null, tutorialSaved=false, settingsOpen=false;
const tutorialCard=createTutorialCard();
let inputOverride=null;
try{inputOverride=sessionStorage.getItem('deadshift-controls-override');}catch{}
const inputPreference=createInputPreference(detectedInput,inputOverride);
let touchPrompts=inputPreference.surface==='touch';
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
const touchMove={x:0,z:0};
const sticks = new Map();

view.onClatter = type => sound.clatter(type);
view.birds.onFlap = flight => sound.wingbeat(flight.name);

async function start(weapon=sim.weapon,course) {
  if (started) return;
  if(course!==undefined)tutorialCourse=course;
  sim.weapon=map.training&&tutorialCourse==='basics'?'static':['rifle','shotgun'].includes(weapon)?weapon:'static';
  sim.player.stamina=sim.maxStamina;
  if(map.training){tutorial=new Tutorial(courseFor(sim.weapon));tutorialSaved=false;tutorialCard.invalidate();sim.reset();}
  applyInputPreference();
  started = true; running = true; document.body.classList.add('playing');
  $('intro').classList.add('hidden'); ['weapon', 'reticle'].forEach(id => $(id).classList.remove('hidden'));
  $('world').focus();
  if(tutorial){$('tutorial-guide').classList.remove('hidden');updateTutorial();}
  try { await sound.start(); if (paused) sound.suspend(true); }
  catch (error) { console.warn('Audio unavailable:', error); }
}

function returnToMenu(){
  online.close();perfReadout.reset();devWindow.hide();
  running=false;started=false;paused=false;mapOpen=false;mapWasPaused=false;settingsOpen=false;
  releaseInput();reset();sound.suspend(true);
  document.body.classList.remove('playing','paused');
  for(const id of ['pause-panel','settings-panel','map-panel','tutorial-guide','weapon','reticle'])$(id).classList.add('hidden');
  $('hit-marker').classList.remove('show');markerRemaining=0;
  $('map-toggle').setAttribute('aria-expanded','false');
  $('intro').classList.remove('hidden');
  $('tutorial-entry').hidden=readTutorialComplete();$('tutorial-mode').hidden=false;
  history.replaceState(null,'',location.pathname);accumulator=0;lastTime=null;
}

function releaseInput() {
  for(const reset of touchActionResets)reset();
  touchAimPointer=null;
  rifleFiring=false;rifleAiming=false;sim.shotgun.trigger=false;sim.shotgun.suppress=false;
  keys.clear(); tappedKeys.clear(); pendingQuickShot=false; pendingSeed = false; pendingLaunch = false; pendingAimPoint = null;
  touch.moveX = touch.moveZ = touch.aimX = touch.aimZ = 0; touchMove.x = touchMove.z = 0; touch.seeding = false;
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
  if(tutorial){tutorial=new Tutorial(courseFor(sim.weapon));tutorialSaved=false;tutorialCard.invalidate();updateTutorial();}
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

const aimOverlay=createAimOverlay($('game'));
const placeReticle=(x,y)=>aimOverlay.place(x,y);
// Where the aim dot sits: on the pointer for mouse aim (exactly on it over
// the interface), otherwise where the simulation says the shot is aimed.
function aimDotPoint(){
  const p=sim.player;
  return inputMode==='mouse'?(pointerOnUI?cursorTarget:mouse):view.screenPoint(p.aimPointX??p.x+p.aimX*RULES.focusDistance,p.aimPointZ??p.z+p.aimZ*RULES.focusDistance);
}
function updateReticle(){aimOverlay.update({sim,view,running,coneFlicker,aiming:aimingNow(),point:aimDotPoint()});}

function updateHUD() {
  // The health bar has its own per-frame update in the frame loop, because the
  // tremble needs every frame; calling it again on the 80ms HUD tick was pure
  // duplication.
  const rifle=sim.weapon==='rifle';
  updateWeaponHUD(sim,touchPrompts);$('hex-recharge').classList.remove('hidden');
  aimOverlay.showSpread(rifle&&running);
  abilityHUD.update(sim);
  const count = sim.seeds.length;
  $('reticle').classList.toggle('loaded', count > 0);
  $('fps-counter').textContent = paused ? 'PAUSED' : (measuredFPS || '—') + ' FPS';
  if (import.meta.env.DEV) writeDebugState($('world'), { sim, view, sound, settings, running, paused, measuredFPS, inputMode });

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

// On touch, a tap anywhere on the world fires at that spot, on either side of
// the screen; a drag never fires (see touch-controls.js).
function touchTapFire(x, y) {
  inputMode = 'mouse'; setCursorTarget(x, y);
  pendingLaunch = true; pendingQuickShot = true; pendingAimPoint = view.aim(x, y, sim.player);
}
let touchAimStart = null;



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
// Developer tools (see dev-options.js). Nothing about them shows until the
// player pauses, presses Shift+P and enters the code.
function devChanged(){
 dirty=true;updateHUD();
 document.body.classList.toggle('dev-hide-hud',!!sim.dev.hideHud);
 devTools.sync();devWindow.sync();
}
const devHooks={
 spawnBird:()=>{const name=spawnBird();if(name)toast('BIRD · '+String(name).toUpperCase());},
 hurt:()=>sim.damagePlayer(50,'dev',false,false,null,'gunshot'),
 kill:()=>sim.damagePlayer(sim.player.hp,'dev',false,false,null,'gunshot'),
 respawnTargets:()=>toast(sim.respawnTargets()+' TARGETS BACK'),
 restoreProps:()=>toast(sim.restoreAllProps()+' PROPS REBUILT'),
 // Looks only: the same event a real volley sends, with no damage behind it.
 previewBlast:()=>{
  const p=sim.player,count=sim.dev.blastOrbs||6,blast=explosionFor(count);
  sim.events.push({type:'explosion',x:p.x+p.aimX*6,z:p.z+p.aimZ*6,count,radius:blast.radius,damage:0,preview:true});
 },
};
const devTools=installDevTools(sim,$('dev-panel'),()=>devChanged(),{
 ...devHooks,
 onUnlock:()=>showDevEntry(true),
 onLock:()=>{showDevEntry(false);devWindow.hide();},
});
if($('dev-open')&&$('dev-panel'))$('dev-open').onclick=()=>{
 const opening=$('dev-panel').classList.contains('hidden');
 $('dev-panel').classList.toggle('hidden',!opening);
 $('settings-panel').classList.toggle('with-dev',opening);
 $('dev-open').setAttribute('aria-expanded',String(opening));
 if(opening)$('dev-panel').querySelector('summary,select,input,button')?.focus();
};
const devWindow=createDevWindow($('game'),{sim,hooks:devHooks,
 quality:()=>settings.quality,
 setQuality:name=>{$('graphics-preset').value=name;settingsPanel.applySettings();},
 changed:()=>devChanged()});
// Opened from the pause menu, and returns to it.
const devDialog=createDevUnlockDialog($('game'),{
 unlock:code=>devTools.unlock(code),
 open:()=>{$('pause-panel').classList.add('hidden');},
 close:()=>{if(paused){$('pause-panel').classList.remove('hidden');$('resume').focus();}},
 enabled:()=>toast('DEV TOOLS UNLOCKED · O OPENS THE WINDOW',2600)
});
function showDevNotice(enabled){toast(enabled?'DEV TOOLS ON':'DEV TOOLS OFF');}
function toast(text,time=1800){
 devNotice.textContent=text;
 devNotice.classList.add('visible');clearTimeout(devNoticeTimer);
 devNoticeTimer=setTimeout(()=>devNotice.classList.remove('visible'),time);
}
const devNotice=document.createElement('div');devNotice.className='toast';devNotice.setAttribute('role','status');$('game').append(devNotice);let devNoticeTimer;
function thumbnail(){
 try{const cached=sessionStorage.getItem('deadshift-native-thumbnail');if(cached)return cached;}catch{}
 if(map.id!=='deadwater')return '';
 const image=view.captureMapThumbnail();
 try{sessionStorage.setItem('deadshift-native-thumbnail',image);}catch{}
 return image;
}
// Online play (see AGENTS.md > Networking). Practice overrides never go online:
// the sessions reset sim.dev every tick and P / O / map teleport are refused.
const online=createOnlinePlay({$,map,sim,createSim:m=>new Simulation(m),start,toast:text=>toast(text,2600),leave:()=>$('main-menu').click(),
 server:import.meta.env.DEV?params.get('peerhost'):null});
const menuFlow=installMenu({$,map,thumbnail,start,openSettings,closeSettings,returnToMenu,tutorialComplete:readTutorialComplete(),online:(request,status)=>online.request(request,status)});
$('overhead-image').addEventListener('click',e=>{
  if(!mapOpen||!sim.dev.teleport||online.active)return;
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
const settingsPanel=installSettingsPanel(settings,{
 setQuality:name=>{if(view.qualityName!==name)view.setQuality(name);},
 setMotion:on=>{view.motion=on;},setFps:fps=>{budget.fps=fps;},
 setVolumes:volume=>sound.setVolumes(volume),
 changed:()=>{dirty=true;updateHUD();},
});
const selectMenus=installSelectMenus($('settings-panel'));
$('mute-all').onclick=toggleAudio;
sticks.set('move',bindFloatingStick($('move-zone'),$('move-stick'),{isRunning:()=>running,onTap:touchTapFire,output:touch,
 onWalkStart:()=>{if(touchAimPointer===null)inputMode='keyboard';}}));
window.addEventListener('resize', () => { view.resize(); dirty = true; });
// The cached canvas rect is in page coordinates, so a scroll moves it even
// though nothing resized.
window.addEventListener('scroll', () => { view.cachedRect = null; }, { passive: true });
$('world').addEventListener('pointermove', e => {
  if(e.pointerType!=='mouse'&&e.pointerId===touchAimPointer&&running){
   e.preventDefault();setCursorTarget(e.clientX,e.clientY);inputMode='mouse';
   if(touchAimStart&&Math.hypot(e.clientX-touchAimStart.x,e.clientY-touchAimStart.y)>=TOUCH_TAP.slop)touchAimStart.dragged=true;
   return;
  }
  if (e.pointerType !== 'mouse') return;
  setCursorTarget(e.clientX,e.clientY); inputMode = 'mouse';
  // Only a press that began on the world counts: dragging off a button onto
  // the world with the mouse still down must not open fire.
  if(running&&worldPress&&(sim.weapon==='rifle'||sim.weapon==='shotgun')){rifleFiring=!!(e.buttons&1);rifleAiming=!!(e.buttons&2);}
});
$('world').addEventListener('pointerdown', e => {
  if(e.pointerType==='mouse')worldPress=true;
  if(e.pointerType!=='mouse'&&touchPrompts){
   if(!running||touchAimPointer!==null)return;
   e.preventDefault();touchAimPointer=e.pointerId;inputMode='mouse';setCursorTarget(e.clientX,e.clientY);$('world').setPointerCapture(e.pointerId);
   touchAimStart={x:e.clientX,y:e.clientY,time:performance.now(),dragged:false};return;
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
// The game's own cursor is the pointer everywhere while playing with a mouse,
// over buttons and panels too, so it never swaps for the system arrow. Over the
// interface it sits exactly on the pointer instead of trailing it like aim can.
window.addEventListener('pointermove',e=>{
 if(e.pointerType!=='mouse'||!started)return;
 pointerOnUI=e.target!==$('world');
 if(pointerOnUI||!running){
  setCursorTarget(e.clientX,e.clientY);
  if(running)inputMode='mouse';
  placeReticle(e.clientX,e.clientY);
 }
},true);
// Clicking the interface is only ever a click on the interface. The press
// never reaches the world (buttons sit above it), focus stays on the world so
// Space and Enter keep meaning dodge and fire rather than pressing the button
// again, and a right click brings up no browser menu.
window.addEventListener('mousedown',e=>{
 if(running&&e.target!==$('world')&&e.target.closest?.('#game button'))e.preventDefault();
},true);
$('game').addEventListener('contextmenu',e=>{if(started)e.preventDefault();});
function syncGameCursor(){
 const on=started&&!touchPrompts&&(!deathActive||deathMenuOpen)&&!document.body.classList.contains('editing-touch-layout');
 if(document.body.classList.contains('game-cursor')!==on)document.body.classList.toggle('game-cursor',on);
}
bindRifleMouse($('world'),window,{
 enabled:()=>running&&(sim.weapon==='rifle'||sim.weapon==='shotgun'),state:(fire,aim)=>{rifleFiring=fire;rifleAiming=aim;},
 fire:()=>{pendingLaunch=true;},store:()=>{if(sim.weapon==='shotgun')tappedKeys.add('MouseRight');},aim:(x,y)=>{setCursorTarget(x,y);inputMode='mouse';}
});
window.addEventListener('pointerup',e=>{if(e.pointerType==='mouse'){worldPress=false;if(e.button===0)rifleFiring=false;if(e.button===2)rifleAiming=false;}if(e.pointerId===touchAimPointer){
  const tap=isTap(touchAimStart,e.clientX,e.clientY);
  touchAimPointer=null;touchAimStart=null;
  if(tap&&running)touchTapFire(e.clientX,e.clientY);
 }});
for(const type of ['pointercancel','lostpointercapture'])$('world').addEventListener(type,e=>{if(e.pointerId===touchAimPointer&&(type==='pointercancel'||!touchAimStart)){touchAimPointer=null;touchAimStart=null;}});
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
  // The only way in: Shift+P while paused. Before the code, P and O do nothing.
  if(paused&&!settingsOpen&&!mapOpen&&e.code==='KeyP'&&e.shiftKey&&!e.repeat&&!online.active){
   e.preventDefault();
   if(devTools.isUnlocked()){setPaused(false);devWindow.show();}else devDialog.show();
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
  if((e.code==='KeyO'||e.code==='KeyP')&&!e.repeat&&devTools.isUnlocked()){
   e.preventDefault();
   if(online.active){toast('DEV TOOLS ARE OFF ONLINE');return;}
   if(e.code==='KeyO'){devWindow.toggle();return;}
   if(running){showDevNotice(devTools.toggleAll());devWindow.sync();}
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
  // Online the world does not stop for your pause menu: everyone else is
  // still playing, so the simulation keeps running with your hands off.
  const stepping = running || (online.active && started && !deathActive);
  if (stepping) {
    // Dev game speed stretches or squeezes time; online sim.dev is reset so it is always 1 there.
    accumulator += dt * (sim.dev.timeScale || 1);
    while (accumulator >= RULES.step && (running || (online.active && started && !deathActive))) {
      previousPlayer = { ...sim.player };
      if(smoothedCursor()&&inputMode==='mouse')advanceAimCursor(mouse,cursorTarget,RULES.step,aimingNow(),sim.weapon);
      const held = key => keys.has(key) || tappedKeys.has(key);
      // The thumb's direction eases in over ~0.1 s, so a flick across the stick
      // turns the walk rather than snapping it.
      const follow = 1 - Math.exp(-RULES.step / MOVE_STICK.smoothing);
      touchMove.x += (touch.moveX - touchMove.x) * follow; touchMove.z += (touch.moveZ - touchMove.z) * follow;
      if (!touch.moveX && !touch.moveZ && Math.hypot(touchMove.x, touchMove.z) < .05) touchMove.x = touchMove.z = 0;
      const moveX = touchMove.x || Number(held('KeyD')) - Number(held('KeyA'));
      const moveZ = touchMove.z || Number(held('KeyS')) - Number(held('KeyW'));
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
      // The no-mouse lesson: Q fired while aiming with the arrow keys.
      if(tutorial){tutorial.touch=touchPrompts;tutorial.touchAiming=touchAimPointer!==null;tutorial.walking=Math.hypot(touchMove.x,touchMove.z)>.2;if(arrows.active)tutorial.arrowAim=true;if(tappedKeys.has('KeyQ')&&tutorial.arrowAim&&inputMode==='keyboard')tutorial.event({type:'keyboardShot'},sim);}
      const ballast=ballastInput(rifleFiring,keys,tappedKeys);
      sim.step(online.input({ moveX, moveZ, aimX, aimZ, aimPointX, aimPointZ, autoRange:inputMode==='mouse'?false:touchPrompts?'touch':'keyboard', smoothAim:digitalAim, grenade:tappedKeys.has('KeyE'), extendedReload:tappedKeys.has('KeyX'), fire:sim.weapon==='shotgun'?ballast.fire:rifleFiring||pendingLaunch||(sim.weapon==='rifle'&&held('KeyQ')),tapFire:pendingLaunch&&!tappedKeys.has('KeyQ'),storeCharge:sim.weapon==='shotgun'&&ballast.storeCharge,doubleShot:tappedKeys.has('KeyE'),aiming:aimingNow(),reload:tappedKeys.has('KeyR'), spray: held('KeyC'), dodge: tappedKeys.has('Space'), hex: tappedKeys.has('KeyX'), seed: held('KeyE') || touch.seeding || pendingSeed, launch: pendingLaunch, quickShot:pendingQuickShot,
        launchPointX: arrows.active?undefined:pendingAimPoint?.aimPointX, launchPointZ: arrows.active?undefined:pendingAimPoint?.aimPointZ }));
      online.afterStep();
      if(tutorial){tutorial.update(sim,RULES.step);updateTutorial();}
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
      view.tutorialGuide=tutorial&&!tutorial.complete?{zone:tutorial.zone,target:tutorial.pointer(sim)}:null;
      view.remotePlayers = online.others(running ? accumulator / RULES.step : 1);
      view.update(sim, renderDelta, running, elapsed, previousPlayer, running ? accumulator / RULES.step : 1);
      updateReticle(); dirty = false; renderedFrames++;
    }
    if(running&&!document.hidden) view.setResolutionScale(adaptiveResolution.sample(dt,renderDelta>0,settings.quality,settings.fps));
    else adaptiveResolution.reset();
    fpsTime += dt;
    if (fpsTime >= 1) { measuredFPS = Math.round(renderedFrames / fpsTime); fpsTime = 0; renderedFrames = 0; }
  }
  if(paused)adaptiveResolution.reset();
  online.frame();
  perfReadout.update(started && !paused ? dt : 0, measuredFPS);
  syncGameCursor();
  updateHealthHUD(sim);
  hudTime += dt; if (hudTime >= .08) { updateHUD(); hudTime = 0; }
  damageFeedback.update(sim,view);outgoingFeedback.update(sim,view);
  if(deathActive&&!deathMenuOpen){
   deathElapsed+=dt;
   if(deathElapsed>=DEATH_MENU_DELAY){deathMenuOpen=true;paused=true;document.body.classList.add('dead-menu');deathScreen.show();sound.suspend(true);}
  }
  requestAnimationFrame(frame);
}
function openSettings(){syncMobileSettings();settingsOpen=true;selectMenus.reset();$('settings-panel').querySelectorAll('details').forEach(detail=>detail.open=false);$('pause-panel').classList.add('hidden');$('settings-panel').classList.remove('hidden');$('settings-back').focus();}
function closeSettings(){settingsOpen=false;selectMenus.reset();$('settings-panel').classList.add('hidden');if(started){$('pause-panel').classList.remove('hidden');$('resume').focus();}else $('menu-settings').focus();}
function updateTutorial(){
 if(!tutorial)return;
 tutorialCard.render(tutorial,touchPrompts);
 if(tutorial.complete&&!tutorialSaved)tutorialSaved=saveTutorialComplete(tutorial);
}
window.addEventListener('resize',()=>arrangeTouchCluster());
function applyInputPreference(){
 tutorialCard.invalidate();
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
  touchLabel('touch-extended',shotgun?'LOCK':'EXTEND',shotgun?'SHIFT / RMB':'X');
  touchLabel('touch-grenade',shotgun?'DOUBLE':'GRENADE','E');
  extendedButton.setAttribute('aria-label',shotgun?'Store charge':'Load extended magazine');
  grenadeButton.setAttribute('aria-label',shotgun?'Fire both shells':'Throw grenade');
  updateWeaponHUD(sim,touchPrompts);
  touchLabel('touch-launch',rifle||shotgun?'FIRE':'LAUNCH','LMB / Q');
  touchLabel('touch-hex',rifle||shotgun?'RELOAD':'PULSE',rifle||shotgun?'R':'X');
  touchLabel('touch-stream',rifle||shotgun?'AIM':'STREAM',rifle?'RMB / SHIFT':shotgun?'RMB':'C');
  touchLabel('touch-dodge','DODGE','SPACE');
  touchLabel('touch-place','PLACE','E');
 arrangeTouchCluster();
 $('pause').textContent=touchPrompts?'PAUSE':'ESC';$('pause').title='Pause / resume · Esc';
 $('map-toggle').textContent=touchPrompts?'MAP':'M';$('audio').textContent=touchPrompts?'SOUND':'N';
 updateTutorial();
}
for(const [id,value] of [['input-keyboard','keyboard'],['input-mobile','touch']])$(id).onclick=()=>{
 // The selector in the menu IS deliberate, and it is used out of play, so a
 // full reset is right here even though an automatic switch must not do one.
 inputPreference.select(value);touchPrompts=value==='touch';releaseInput();
 try{sessionStorage.setItem('deadshift-controls-override',value);}catch{}
 applyInputPreference();
};
// Noticing which input was last used is not a deliberate act by the player, so
// it must not disturb anything they are holding. It used to call releaseInput(),
// which drops every held key, the aim, the trigger and every stick at once --
// and on a tablet with a keyboard it fires between two presses of the same
// burst. Aiming down sights while walking and then pulling the trigger was
// three switches in a row, and the shot never came out.
function detectActiveInput(mode){
 if(document.body.classList.contains('loading')||document.body.classList.contains('editing-touch-layout'))return;
 const surface=inputPreference.surface;
 const changed=inputPreference.observe(mode);
 if(!changed&&inputPreference.surface===surface)return;
 touchPrompts=inputPreference.surface==='touch';
 applyInputPreference();
}
window.addEventListener('pointerdown',e=>{
 if(e.pointerType==='touch'||e.pointerType==='pen')detectActiveInput('touch');
 else if(e.pointerType==='mouse')detectActiveInput('keyboard');
},true);
window.addEventListener('keydown',e=>{
 if(e.target.matches('input,select,textarea,[contenteditable=true]')||e.ctrlKey||e.metaKey||e.altKey)return;
 if(['KeyW','KeyA','KeyS','KeyD','KeyQ','KeyE','KeyR','KeyX','KeyC','Space','Escape','Tab','ShiftLeft','ShiftRight','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))detectActiveInput('keyboard');
},true);
applyInputPreference();
const bindAction=(element,press,release)=>touchActionResets.push(bindTouchAction(element,{enabled:()=>running,press,release}));
bindAction($('touch-hex'),()=>tappedKeys.add(sim.weapon==='static'?'KeyX':'KeyR'));
bindAction($('touch-dodge'),()=>tappedKeys.add('Space'));
bindAction(placeButton,()=>{touch.seeding=true;pendingSeed=true;},()=>{touch.seeding=false;});
bindAction(grenadeButton,()=>{if(sim.weapon!=='static')tappedKeys.add('KeyE');});
bindAction(extendedButton,()=>tappedKeys.add(sim.weapon==='shotgun'?'MouseRight':'KeyX'));
bindAction($('touch-stream'),()=>{if(sim.weapon==='static')keys.add('KeyC');else rifleAiming=true;},()=>{keys.delete('KeyC');rifleAiming=false;});
bindAction($('touch-launch'),()=>{
 pendingLaunch=true;pendingQuickShot=true;
 pendingAimPoint=inputMode==='mouse'&&!keyboardAim(keys,tappedKeys).active?view.aim(mouse.x,mouse.y,sim.player):null;
 if(sim.weapon!=='static')rifleFiring=true;
},()=>{rifleFiring=false;});
const touchLayout=installTouchLayout({root:$('game'),controls:$('touch-controls'),
 canEdit:()=>started&&!deathActive,onChange:()=>syncMobileSettings(),restoreCluster:()=>arrangeTouchCluster(),
 onEditing:editing=>{releaseInput();running=!editing&&started&&!paused&&!deathActive;accumulator=0;sound.suspend(editing||paused);dirty=true;}
});
const mobileSettings=installMobileSettings({touchLayout,closeSettings,setPaused,
 state:()=>({started,paused,deathActive,touchPrompts}),arrange:arrangeTouchCluster});
function syncMobileSettings(){mobileSettings.sync();}
syncMobileSettings();
updateHUD(); requestAnimationFrame(frame);
export function finishLoading(){
 if(params.get('play')==='1')void start();
 else $('gamemodes').focus();
}



