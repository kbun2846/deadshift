// deadshift, by killerbunny2846.
import {bindTouchAction} from './ui/touch-action.js';
import { installMobileBrowser, enterFullscreen } from './ui/mobile-browser.js';
import { playFullscreen, leaveFullscreen, unlockGameKeys } from './ui/key-lock.js';
import {migrateGameStorage} from './storage-migration.js';
import {isPlayable} from './playable-area.js';
import {detectedControls,createInputPreference} from './ui/input-preference.js';
import './styles/mobile-controls.css';
import './styles/tutorial.css';
import './styles/x-ability.css';
import {installTouchLayout} from './ui/touch-layout.js';
import { bindFloatingStick, arrangeTouchCluster, isTap, TOUCH_TAP, MOVE_STICK } from './ui/touch-controls.js';
import { installMobileSettings } from './ui/mobile-settings.js';
import {createOutgoingFeedback} from './ui/outgoing-feedback.js';
import { createMenuNavigation } from './ui/menu-navigation.js';
import { installSelectMenus } from './ui/select-menu.js';
import { readTutorialComplete, saveTutorialComplete } from './tutorial-progress.js';
import { createAbilityHUD } from './ui/ability-hud.js';
import { writeDebugState } from './render/debug-state.js';
import { setText } from './ui/dom-writes.js';
import { keepAwake } from './ui/wake-lock.js';
import { BotMatch } from './bots/bot-match.js';
import { buzz, HAPTICS } from './ui/haptics.js';
import { createWeaponHUD } from './ui/weapon-hud.js';
import { createAimOverlay } from './ui/aim-overlay.js';
import { createHealthHUD } from './ui/health-hud.js';
import { createPerfReadout } from './ui/perf-readout.js';
import { createDamageFeedback } from './ui/damage-feedback.js';
import { createDeathScreen, DEATH_MENU_DELAY, RESPAWN_TIME } from './ui/death-screen.js';
import { createLobbyPanel } from './ui/lobby-panel.js';
import { createLobbyScreen } from './ui/lobby-screen.js';
import { createWeaponPick } from './ui/weapon-pick.js';
import { pickView } from './render/pick-view.js';
import { PICK, MODES, SETTINGS as MATCH_SETTINGS, SIDE_COLOURS } from './config/match.js';
const modeLabel=document.querySelector('.brand .mode');
import { GAME_KEYS } from './config/controls.js';
import { gameCode, displayKeys } from './config/keybinds.js';
import { NETWORK } from './config/network.js';
import { bindRifleMouse, weaponAiming,ballastInput } from './weapons/rifle-input.js';
import { advanceAimCursor } from './ui/aim-cursor.js';
import { createAimDamping, aimsByPoint, muzzleLateral, muzzleBearing } from './aim-damping.js';
import { tutorialMapFor, Tutorial } from './tutorial.js';
import { createTutorialCard } from './ui/tutorial-card.js';
import { installMenu } from './ui/menu.js';
import { createDuel, readDuel, DUEL_MODES } from './duel.js';
import { createOnlinePlay } from './online-play.js';
import { drawSim } from './net/projectiles.js';
import { createMultiplayerHud } from './ui/multiplayer-hud.js';
import { TAB_TITLE } from './version.js';
import { installUiSounds } from './ui/ui-sounds.js';
import { mapById, menuMaps } from './maps.js';
import { targetRadius } from './target-radius.js';
import { createTargetLock, TARGET_LOCK } from './target-lock.js';
import { weapon as weaponInfo, weaponOrDefault, usesTrigger, DEFAULT_WEAPON } from './items.js';
import { Simulation, RULES } from './simulation.js';
import { WorldView } from './render/renderer.js';
import { Soundscape, hearingLevel, HEARING } from './audio.js';
import { hollowAmbience } from './hollow-ambience.js'; // s3-sound: Hollow Wick's crows and soundscape
import { createFireIndicator } from './ui/fire-indicator.js';
import { validateSettings, RenderBudget, AdaptiveResolution } from './settings.js';
import { installSettingsPanel } from './ui/settings-panel.js';
import {keyboardAim} from './keyboard-aim.js';
import { overheadMapSVG } from './ui/overhead-map.js';
import { installDevWiring } from './ui/dev-wiring.js';
import { openSpot } from './net/spawn-points.js';
import { hasAuthoredSpawns } from './net/map-spawns.js'; // s2-spawns
import { createToast } from './ui/toast.js';
import { createRobotMinds } from './ui/robot-minds.js';
import { addWatermark } from './ui/watermark.js';
import { viewWidth, viewHeight } from './viewport.js';
import { installTitle } from './ui/title-screen.js';

const $ = id => document.getElementById(id);
try{migrateGameStorage(localStorage);}catch{}
const toast = createToast(document.getElementById('game'));
const robotMinds = createRobotMinds(document.getElementById('game'));
try{migrateGameStorage(sessionStorage);}catch{}
const params = new URLSearchParams(location.search);
const selectedMap = params.get('map')==='tutorial' ? tutorialMapFor(params.get('weapon')) : mapById(params.get('map'));
const landmarkStart = import.meta.env.DEV && selectedMap.props.find(p => p.type === params.get('start'));
const roomStart = import.meta.env.DEV && selectedMap.buildings.find(b => b.id === params.get('start'));
// Development-only bookmark for checking the distant field without crossing town.
const map = import.meta.env.DEV && params.get('start') === 'farm' && selectedMap.crops?.length
  ? { ...selectedMap, spawn: { x: selectedMap.crops[0].x - selectedMap.crops[0].w / 2 + 2, z: selectedMap.crops[0].z - selectedMap.crops[0].d / 2 - 3 } }
  : landmarkStart ? { ...selectedMap, spawn: { x: landmarkStart.x, z: landmarkStart.z + 6 } }
  : roomStart ? { ...selectedMap, spawn: { x: roomStart.x, z: roomStart.z } } : selectedMap;
document.title = TAB_TITLE;
document.querySelector('.brand .map-name').textContent = map.name.toUpperCase();
document.querySelector('.mode').textContent=map.training?'TUTORIAL':'PRACTICE';
let settings;
const detectedInput=detectedControls({coarsePointer:matchMedia('(pointer: coarse)').matches,hoverAvailable:matchMedia('(hover: hover)').matches});
const deviceDefaults={mobile:detectedInput==='touch'};
try { settings = validateSettings(JSON.parse(localStorage.getItem('deadshift-settings') || '{}'),deviceDefaults); }
catch { settings = validateSettings({},deviceDefaults); }
const sim = new Simulation(map), sound = new Soundscape(), budget = new RenderBudget(settings.fps);
// Robots (bots/): spawned from the developer tools in a solo game.
const bots = new BotMatch(map, { createSim: m => new Simulation(m) });
// 1V1 against a robot (duel.js): set up by start() from the URL.
const duel=createDuel($('game'),{sim,bots,hooks:{
 // (Dead when it ended, a team match: the death screen and its weapon grid go.)
 over:()=>{if(deathPick){deathPick=false;weaponPick.hide();}clearDeath();running=false;releaseInput();sound.suspend(true);updateHUD();},
 rematch:()=>{clearDeath();reset();running=true;paused=false;sound.suspend(false);$('world').focus();updateHUD();},
 menu:()=>returnToMenu(),
}});
// Menu clacks (ui-sounds.js): muted with the game, at the master and effects levels.
installUiSounds({muted:()=>!sound.enabled,level:()=>sound.volume.master*sound.volume.effects});
const adaptiveResolution = new AdaptiveResolution();
sim.weapon=weaponOrDefault(params.get('weapon'));
let rifleFiring=false,rifleAiming=false,worldPress=false,pointerOnUI=false,firePointer=null,aimPointer=null;
const updateWeaponHUD=createWeaponHUD($('weapon'));
const updateHealthHUD=createHealthHUD($('game'));
const perfReadout=createPerfReadout(document.querySelector('.masthead'));
const damageFeedback=createDamageFeedback($('game'));
const outgoingFeedback=createOutgoingFeedback($('game'));
addWatermark($('game'));
const fireIndicator=createFireIndicator($('game'));
// Sound carries only so far (audio.js HEARING): how loud an event is from
// where you stand, from its own position or, failing that, its shooter's.
function heard(e,shooter){
 const x=e.x??shooter?.x,z=e.z??shooter?.z;
 if(!Number.isFinite(x)||!Number.isFinite(z))return {level:1,x:null,z:null};
 return {level:hearingLevel(Math.hypot(x-sim.player.x,z-sim.player.z)),x,z};
}
// Someone else firing within earshot: a pink arc on the side it came from.
const FIRING=new Set(['rifleShot','shotgunShot','launch','sprayArc','hexPulse','scatterFire']);
function otherEvent(e,shooter,slot){
 const {level,x,z}=heard(e,shooter);
 hollow?.event(e,shooter,slot); // s3-sound
 if(NET_SOUNDS.has(e.type))sound.event(e,level);
 if(FIRING.has(e.type)&&x!==null&&level>HEARING.silent&&running&&!deathActive){
  const me=view.screenPoint(sim.player.x,sim.player.z),at=view.screenPoint(shooter?.x??x,shooter?.z??z);
  fireIndicator.add(Math.atan2(at.y-me.y,at.x-me.x),Math.min(1,.25+level*.9));
 }
}
const abilityHUD=createAbilityHUD();
const extendedButton=document.createElement('button');extendedButton.id='touch-extended';extendedButton.textContent='X';extendedButton.setAttribute('aria-label','Nova');document.querySelector('.touch-right').append(extendedButton);
const grenadeButton=document.createElement('button');grenadeButton.id='touch-grenade';grenadeButton.textContent='E';grenadeButton.setAttribute('aria-label','Throw grenade');document.querySelector('.touch-right').append(grenadeButton);
const placeButton=document.createElement('button');placeButton.id='touch-place';document.querySelector('.touch-right').prepend(placeButton);
// Aim-down-sights weapons: the bottom slice of FIRE aims and fires together
// (touch-controls.js cuts it out of FIRE; items.js adsFire).
const aimFireButton=document.createElement('button');aimFireButton.id='touch-aimfire';aimFireButton.setAttribute('aria-label','Aim and fire');$('touch-launch').after(aimFireButton);
// The home screen's tutorial runs the basics; Gamemodes > Tutorial runs a weapon's own course.
let tutorialCourse=params.get('course')==='basics'?'basics':null;
const courseFor=weapon=>tutorialCourse==='basics'?'basics':weapon;
if(map.training&&tutorialCourse==='basics')sim.weapon=DEFAULT_WEAPON;
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

// s3-sound: Hollow Wick's crows and soundscape (null on other maps); made
// before the warm-up so the crows' meshes are compiled with the rest.
const hollow = hollowAmbience(map, view, sound);
// Shaders compile while the loading screen shows (renderer.js warmSteps);
// bootstrap.js waits for this before revealing the game.
export const ready = view.warmProgramsParallel().then(() => { view.programsWarmed = true; });
let running = false, started = false, paused = false, accumulator = 0, lastTime = null, elapsed = 0;
let deathActive=false,deathElapsed=0,deathMenuOpen=false,deathPick=false,nextWeapon=null;
// One death screen for practice and online (death-screen.js): the respawn
// comes RESPAWN_TIME after the death (online the host's clock decides).
const deathScreen=createDeathScreen($('game'),{
 restart:()=>{reset();paused=false;running=true;document.body.classList.remove('paused');sound.suspend(false);$('world').focus();},
 menu:()=>{$('main-menu').click();},
 respawn:()=>{if(online.active)online.respawnNow();else respawnPractice();},
 // Online: pick again (the weapon pick opens; the respawn waits for it).
 // Solo (owner): the weapon grid over the death screen; picking goes back to
 // the countdown, and the new weapon comes with the respawn (or when the
 // count runs out with the grid still open: whatever is picked there).
 changeWeapon:()=>{if(online.active){online.pickAgain();return;}deathPick=true;deathScreen.root.classList.add('hidden');weaponPick.show(nextWeapon||sim.weapon,{timed:false});},
 lobby:()=>openLobby(),
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
const mouse = { x: viewWidth() * .7, y: viewHeight() * .5 };
const cursorTarget={...mouse},prevCursor={...mouse},drawnCursor={...mouse};
// Smoothed weapons steer the rendered cursor; the rest snap straight to it.
const smoothedCursor=()=>!!weaponInfo(sim.weapon)?.smoothCursor;
function setCursorTarget(x,y){cursorTarget.x=x;cursorTarget.y=y;if(!smoothedCursor()){mouse.x=x;mouse.y=y;prevCursor.x=x;prevCursor.y=y;}}
const touch = { moveX: 0, moveZ: 0, aimX: 0, aimZ: 0, seeding: false };
let touchAimPointer=null;
const touchMove={x:0,z:0};
const sticks = new Map();

// Development only: `?capture=thumbnail` hands the view and simulation to
// tools/capture-thumbnail.mjs, which photographs the map card's picture.
if(import.meta.env.DEV&&params.get('capture')==='thumbnail')window.__capture={view,sim,map};
// Development only: the robots, for tools and the console.
if(import.meta.env.DEV){window.__bots=bots;window.__duel=duel;window.__sim=sim;}
view.onClatter = type => sound.clatter(type);
// Lost the GPU (usually out of memory on a phone). Twice within a minute on
// Extreme means it is too heavy for this device: step down to Quality.
const contextLosses=[];
view.onContextLost=()=>{
 const now=performance.now();contextLosses.push(now);while(contextLosses.length&&now-contextLosses[0]>60000)contextLosses.shift();
 if(settings.quality==='extreme'&&contextLosses.length>=2){$('graphics-preset').value='quality';settingsPanel.applySettings();toast('EXTREME IS TOO HEAVY FOR THIS DEVICE · SWITCHED TO QUALITY',4000);}
};
view.birds.onFlap = flight => sound.wingbeat(flight.name);

// Solo practice (not the tutorial, not online): you come in, come back and
// restart at a random open spot on the map, clear of any robots (openSpot).
function randomPracticeSpawn(){
 if(map.training||online?.active)return false;
 // VS ROBOTS: a screen away from every robot (bots.apart, owner v0.9b);
 // "with my team": beside one of your robots.
 const mate=bots.teamSpawn&&bots.living().find(b=>b.team==='blue');
 // s2-spawns: a map with bases and FFA points (net/map-spawns.js) first.
 const at=bots.youSpot(sim)||(mate&&bots.spot(mate.sim.player,2.5,6))||openSpot(map,sim.colliders,{others:bots.living().map(b=>b.sim.player),space:bots.apart||14})||openSpot(map,sim.colliders,{others:bots.living().map(b=>b.sim.player),space:14});
 if(!at)return false;
 const aim={aimX:sim.player.aimX,aimZ:sim.player.aimZ};sim.respawn(at);Object.assign(sim.player,aim);previousPlayer={...sim.player};
 return true;
}
async function start(weapon=sim.weapon,course) {
  if (started) return;
  if(course!==undefined)tutorialCourse=course;
  sim.weapon=map.training&&tutorialCourse==='basics'?DEFAULT_WEAPON:weaponOrDefault(weapon);
  sim.player.stamina=sim.maxStamina;
  if(map.training){tutorial=new Tutorial(courseFor(sim.weapon));tutorialSaved=false;tutorialCard.invalidate();sim.reset();}
  else if(randomPracticeSpawn())view.cutCamera?.();
  applyInputPreference();
  // On a touchscreen a game goes full screen (hides the address bar and
  // toolbars) when the browser allows it and the setting is on.
  if(touchPlay()){if(settings.fullscreen)enterFullscreen();}
  // PC: Settings > Graphics > SCREEN (owner, 2026-09-25). Fullscreen: full
  // screen, with Ctrl+W and co. held where the browser can (ui/key-lock.js);
  // a start with no click behind it (a page load) tries again on the first
  // press. Windowed: the browser window.
  else if(settings.screen==='fullscreen'){screenWanted=true;tryScreen();}
  started = true; running = true; document.body.classList.add('playing');
  $('intro').classList.add('hidden'); ['weapon', 'reticle'].forEach(id => $(id).classList.remove('hidden'));
  $('world').focus();
  // 1V1: the URL carries the choices (menu.js); one robot, no targets.
  {const q=new URLSearchParams(location.search);if(!map.training&&q.get('mode')==='duel'){duel.begin(readDuel(q.get('duel'))||{});if(hasAuthoredSpawns(map)&&randomPracticeSpawn())view.cutCamera?.();/* s2-spawns: you to your base / an FFA point */modeLabel.textContent=(DUEL_MODES[duel.config?.mode]?.name||'1V1');}}
  if(tutorial){$('tutorial-guide').classList.remove('hidden');updateTutorial();}
  try { await sound.start(); if (paused) sound.suspend(true); }
  catch (error) { console.warn('Audio unavailable:', error); }
}

// PC full screen (settings.screen 'fullscreen'): tried from a user gesture
// (a game starting, the first click or key on the menus, the setting chosen),
// then kept through the menus. Someone who leaves it (holding Esc, F11) is
// left out until the next game starts.
// (A phone or tablet with no mouse or trackpad: its own full-screen toggle,
// Settings > Mobile; everything else is a PC here, as the settings panel sees it.)
const touchPlay=()=>matchMedia('(pointer: coarse)').matches&&!matchMedia('(any-pointer: fine)').matches;
let screenWanted=false,screenHeld=false,screenAsked=false,appliedScreen,appliedLock;
function tryScreen(){if(screenHeld){screenWanted=false;return;}if(!screenWanted||navigator.userActivation&&!navigator.userActivation.isActive)return;playFullscreen(settings.keyLock).then(ok=>{if(!ok)return;
 // Windowed chosen (or a touch game) in the meantime: back out.
 if(settings.screen!=='fullscreen'||touchPlay()){leaveFullscreen();return;}
 screenHeld=true;screenWanted=false;});}
// Fullscreen chosen: the first click or key on the menus goes full screen too, once a visit.
function askScreen(){if(!screenAsked&&!started&&settings.screen==='fullscreen'&&!touchPlay()){screenAsked=true;screenWanted=true;}tryScreen();}
window.addEventListener('pointerdown',askScreen,true);
window.addEventListener('keydown',e=>{if(!e.repeat)askScreen();},true);
// Left full screen themselves: out until the next game starts (or the setting is chosen again).
document.addEventListener('fullscreenchange',()=>{if(document.fullscreenElement)screenHeld=true;else{screenHeld=false;screenWanted=false;}});
// The setting changed (Settings > Graphics > SCREEN, or the shortcut lock).
function applyScreen(mode,lockKeys){
 const first=appliedScreen===undefined,changed=mode!==appliedScreen||lockKeys!==appliedLock;appliedScreen=mode;appliedLock=lockKeys;
 if(first||!changed||touchPlay())return;
 if(mode==='windowed'){screenWanted=false;screenHeld=false;leaveFullscreen();return;}
 if(!lockKeys)unlockGameKeys();
 screenHeld=false;screenWanted=true;tryScreen();
}
function returnToMenu(){
  // (Fullscreen stays through the menus; Windowed never went in.)
  screenWanted=false;
  online.close();perfReadout.reset();devWindow.hide();bots.clear();if(deathPick){deathPick=false;weaponPick.hide();}nextWeapon=null;if(duel.active){duel.stop();modeLabel.textContent='PRACTICE';}
  if(choosing)menuFlow.cancelOnlinePick();choosing=false;lastKiller=null;lastOneShot=false;onlineMenus(false);view.deathView?.clear();
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
  rifleFiring=false;rifleAiming=false;firePointer=aimPointer=null;sim.shotgun.trigger=false;sim.shotgun.suppress=false;
  keys.clear(); tappedKeys.clear(); pendingQuickShot=false; pendingSeed = false; pendingLaunch = false; pendingAimPoint = null;
  touch.moveX = touch.moveZ = touch.aimX = touch.aimZ = 0; touchMove.x = touchMove.z = 0; touch.seeding = false;
  for (const stick of sticks.values()) { stick.pointer = null; stick.knob.style.transform = ''; stick.element.classList.remove('engaged'); }
}

function setPaused(value) {
  if (!started || deathActive || value === paused || duel.resultOpen) return;
  if (value) layoutPauseMenu();
  paused = value; running = !value && !choosing; releaseInput();
  $('pause-panel').classList.toggle('hidden', !value); $('reticle').classList.toggle('hidden', value);
  document.body.classList.toggle('paused', value); sound.suspend(value); dirty = true;
  if (value) $('resume').focus(); else $('world').focus();
  updateHUD();
}

function reset() {
  if(deathPick){deathPick=false;weaponPick.hide();}
  if(nextWeapon){sim.weapon=weaponOrDefault(nextWeapon);nextWeapon=null;applyInputPreference();}
  deathActive=deathMenuOpen=false;deathElapsed=0;deathScreen.hide();document.body.classList.remove('dying','dead-menu');
  if(tutorial){tutorial=new Tutorial(courseFor(sim.weapon));tutorialSaved=false;tutorialCard.invalidate();updateTutorial();}
  releaseInput(); sound.clearFlights(); sim.reset(); if(started)randomPracticeSpawn(); view.reset(sim); hollow?.reset(); /* s3-sound */ accumulator = 0; sound.lastStep = 0;
  // Restart keeps the robots (enemies sent back out away from you, allies by
  // you); the menu clears them.
  // All out first, so each side's first robot is placed afresh (VS ROBOTS "with my team").
  for(const bot of bots.bots)bot.alive=false;
  for(const bot of bots.bots)bots.respawnAt(bot,sim);
  duel.reset();
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
  // A finger aims like a mouse, but while aim assist holds a target the dot
  // shows where the assisted shot is actually going.
  // (v148, owner: the dot jittered while moving.) Mouse: the smoothed cursor
  // moves in fixed 60 Hz steps, so on a faster screen, or a frame with two
  // steps, it stuttered; it is drawn between its last two steps like the
  // body is. Aim from the simulation: measured from the drawn body, not the
  // last step's (the camera follows the drawn one), as the cone already is.
  if(inputMode==='mouse'&&p.assistTargetId==null&&!(targetLock.id!==null&&lockMode())){
   if(pointerOnUI)return cursorTarget;
   if(!smoothedCursor()||!running)return mouse;
   const k=Math.max(0,Math.min(1,accumulator/RULES.step));
   drawnCursor.x=prevCursor.x+(mouse.x-prevCursor.x)*k;drawnCursor.y=prevCursor.y+(mouse.y-prevCursor.y)*k;
   return drawnCursor;
  }
  const rp=view.player?.position,ox=rp?rp.x-p.x:0,oz=rp?rp.z-p.z:0;
  return view.screenPoint((p.aimPointX??p.x+p.aimX*RULES.focusDistance)+ox,(p.aimPointZ??p.z+p.aimZ*RULES.focusDistance)+oz);
}
// Aim assist level for this tick (aim-assist.js): the full version on touch
// (a finger, walking, or the stick) unless turned off in Settings > Mobile, a
// lighter one for keyboard aim, and none for a mouse.
function assistMode(){
 if(touchPrompts)return settings.aimAssist?'touch':false;
 return inputMode==='mouse'?false:'keyboard';
}
// Red dot: only when the dot itself is visibly over a target on screen (a
// target you can see, and the dot inside its drawn outline, from its feet to
// its top). Aim assist holding a lock does not count on its own.
const TARGET_TOP=1.2;
function aimOnTarget(){
 const p=sim.player;if(!running||p.dead)return false;
 const dot=aimDotPoint();if(!dot||!Number.isFinite(dot.x))return false;
 // Online, the other players (the local sim holds no targets there).
 const pool=online.active?(online.foes(1)||[]).map(o=>({...o,kind:o.robot?'robot':'player'})):[...sim.targets,...bots.lockPool()];
 return pool.some(t=>{
  if(t.hp!==undefined&&t.hp<=0)return false;
  const foot=view.screenPoint(t.x,t.z,.05);
  // Cheap screen test first; the sight check (rays) only for a hit.
  if(Math.abs(dot.x-foot.x)>160||Math.abs(dot.y-foot.y)>160)return false;
  const top=view.screenPoint(t.x,t.z,TARGET_TOP),edge=view.screenPoint(t.x+targetRadius(t),t.z,.05);
  const radius=Math.hypot(edge.x-foot.x,edge.y-foot.y);
  // Distance from the dot to the target's upright centre line on screen.
  const vx=top.x-foot.x,vy=top.y-foot.y,len=vx*vx+vy*vy||1;
  const k=Math.max(0,Math.min(1,((dot.x-foot.x)*vx+(dot.y-foot.y)*vy)/len));
  return Math.hypot(dot.x-(foot.x+vx*k),dot.y-(foot.y+vy*k))<=radius&&sim.canSeeTarget(t.x,t.z);
 });
}
function updateReticle(){$('reticle').classList.toggle('on-target',aimOnTarget());aimOverlay.update({sim,view,running,coneFlicker,aiming:aimingNow(),point:aimDotPoint()});}

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
  setText($('fps-counter'), paused ? 'PAUSED' : (measuredFPS || '—') + ' FPS');
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
  if(e.type==='playerDamage'){damageFeedback.add(e.damage,sim.time);buzz(e.damage>=40?HAPTICS.heavy:HAPTICS.hurt,{enabled:settings.vibration,touch:touchPrompts});}
  if(e.type==='kill'&&e.targetKind!=='player')buzz(HAPTICS.kill,{enabled:settings.vibration,touch:touchPrompts});
  if(e.type==='outgoingDamage')outgoingFeedback.add(e,sim.time);
  // You killed a player (or a robot): KILL where they fell.
  if(e.type==='kill'&&(e.targetKind==='player'||e.targetKind==='robot'))outgoingFeedback.kill(e,sim.time);
  if(e.type==='syphon')outgoingFeedback.heal(e,sim.time);
  if(tutorial){tutorial.event(e,sim);updateTutorial();}
  view.event(e); sound.event(e,heard(e).level); hollow?.event(e,sim.player); // (s3-sound: the crows)
  if(e.type==='playerDeath'){duel.playerDied();beginDeath();}
  if (e.type === 'hit' || e.type === 'kill') {
    const marker = $('hit-marker'), position = view.screenPoint(e.x, e.z);
    marker.style.left = position.x + 'px'; marker.style.top = position.y + 'px';
    marker.className = 'hit-marker' + (e.type === 'kill' ? ' kill' : '') + ' show'; markerRemaining = .18;
  }
}

// On touch, a tap anywhere on the world fires at that spot, on either side of
// the screen; a drag never fires (see touch-controls.js).
function touchTapFire(x, y) {
  pendingLaunch = true; pendingQuickShot = true;
  // Locked on: a tap fires at the locked target, not at the tapped spot.
  if (targetLock.id !== null && lockMode()) { pendingAimPoint = null; return; }
  inputMode = 'mouse'; setCursorTarget(x, y);
  pendingAimPoint = view.aim(x, y, sim.player);
}
// Target lock (target-lock.js) for players without a mouse: on touch (unless
// aim assist is off in Settings > Mobile) and for keyboard-only aim.
const targetLock=createTargetLock();
let pendingSwap=null,swipeFrom=null;
function lockMode(){ return touchPrompts ? !!settings.aimAssist : inputMode!=='mouse'; }
// What can be locked: alive, in sight, on screen and in range. Online, only
// other players; offline, the practice targets and dummies and the robots.
// Players and robots are `mover`s (target-lock.js follows them differently),
// each described with what the lock needs: its velocity, whether it is
// dodging, inside a building you are not in, or behind a solid obstacle.
function lockPool(){
 if(online.active)return (online.foes(1)||[]).map(t=>({...t,mover:true}));
 return [...sim.targets.map(t=>({...t,mover:false})),...bots.lockPool().map(t=>({...t,mover:true}))];
}
function describeLockTarget(t){
 const p=sim.player,w=viewWidth(),h=viewHeight(),m=TARGET_LOCK.margin,at=view.screenPoint(t.x,t.z,.6);
 const offscreen=at.x<m||at.y<m||at.x>w-m||at.y>h-m;
 const out={id:t.id,x:t.x,z:t.z,sx:at.x,sy:at.y,mover:!!t.mover,vx:t.vx||0,vz:t.vz||0,dodging:(t.dodgeRemaining||0)>0,offscreen};
 if(t.mover){
  const inside=sim.buildingAt(t.x,t.z);out.inside=!!inside&&inside!==sim.interior;
  out.blocked=sim.obstacleBetween(p.x,p.z,t.x,t.z);
 }
 return out;
}
function lockCandidates(){
 const p=sim.player,out=[];
 for(const t of lockPool()){
  if(t.hp!==undefined&&t.hp<=0)continue;
  if(Math.hypot(t.x-p.x,t.z-p.z)>TARGET_LOCK.range)continue;
  const c=describeLockTarget(t);
  if(c.offscreen)continue;
  // Only what the player can see: not under another building's roof, and
  // from indoors only out through doors and windows (sim.canSeeTarget).
  // Last, as the costliest test (rays through the walls), run every step.
  if(!sim.canSeeTarget(t.x,t.z))continue;
  out.push(c);
 }
 return out;
}
// Facing onto a target locks it (no one is ever picked for you): with
// nothing locked, turning your character (walking, the arrows, the stick) so
// it faces a player, robot or practice target on screen within a narrow
// cone locks onto it. Letting go by hand holds that one off until you turn
// away from it (and a moment passes).
let releasedId=null,releaseHold=0;
function facingLock(candidates){
 const p=sim.player;let best=null,score=Infinity;
 for(const c of candidates){
  if(c.blocked||c.inside)continue;
  const dx=c.x-p.x,dz=c.z-p.z,along=dx*p.aimX+dz*p.aimZ;if(along<1)continue;
  const across=Math.abs(dx*p.aimZ-dz*p.aimX),allowed=Math.max(.7,along*Math.tan(7*Math.PI/180));
  if(across>allowed)continue;
  if(c.id===releasedId){if(releaseHold>0)continue;}
  const s=across/allowed+along*.02;if(s<score){score=s;best=c;}
 }
 // The one let go of is free again once you have turned well off it.
 if(releasedId!==null&&!candidates.some(c=>c.id===releasedId&&Math.abs(Math.atan2((c.z-p.z)*p.aimX-(c.x-p.x)*p.aimZ,(c.x-p.x)*p.aimX+(c.z-p.z)*p.aimZ))<.35))releasedId=null;
 if(best)targetLock.acquire(best,{x:p.aimPointX??p.x+p.aimX*4,z:p.aimPointZ??p.z+p.aimZ*4});
}
function lockTarget(dt){
 if(!lockMode()||sim.player.dead){targetLock.clear();pendingSwap=null;return null;}
 const candidates=lockCandidates();
 const onMover=()=>targetLock.id!==null&&!!candidates.find(c=>c.id===targetLock.id)?.mover;
 if(pendingSwap){
  // Directions are from where the cursor is now. Idle: the target that way
  // from the aim dot. Locked (the dot is on the target): the next target that
  // way, and with none that way the lock lets go (an arrow then turns the aim
  // that way as usual); on a player or robot with the keys, it holds (the
  // held arrow leads them instead).
  if(targetLock.id===null){
   const p=sim.player,dot=aimDotPoint();
   targetLock.select(candidates,{x:dot.x,y:dot.y},pendingSwap.x,pendingSwap.y,{x:p.aimPointX??p.x+p.aimX*4,z:p.aimPointZ??p.z+p.aimZ*4});
  }else{const was=targetLock.id;targetLock.swap(candidates,pendingSwap.x,pendingSwap.y,onMover()&&!touchPrompts);if(targetLock.id===null){releasedId=was;releaseHold=1.2;}}
  pendingSwap=null;
 }
 releaseHold=Math.max(0,releaseHold-dt);
 if(targetLock.id===null)facingLock(candidates);
 // Held arrows lead a player or robot by hand (keyboard only).
 const chase=!touchPrompts?{nudgeX:(keys.has('ArrowRight')?1:0)-(keys.has('ArrowLeft')?1:0),nudgeZ:(keys.has('ArrowDown')?1:0)-(keys.has('ArrowUp')?1:0)}:null;
 return targetLock.update(candidates,sim.player,dt,lockedStill,chase);
}
// The locked target, if it still exists and is alive and near, seen or not
// (target-lock.js keeps a practice target through a brief loss of sight, and
// decides for a player or robot from what describeLockTarget says).
function lockedStill(id){
 const t=lockPool().find(t=>t.id===id);
 if(!t||(t.hp!==undefined&&t.hp<=0))return null;
 return Math.hypot(t.x-sim.player.x,t.z-sim.player.z)<=TARGET_LOCK.range*1.2?describeLockTarget(t):null;
}
// Arrow presses, from the cursor: idle, lock onto the target that way; locked,
// the next target that way, or let go if there is none. Held arrows turn the
// aim only while idle.
window.addEventListener('keydown',e=>{
 const code=gameCode(e.code);
 if(!running||e.repeat||touchPrompts||!code?.startsWith('Arrow'))return;
 inputMode='keyboard';
 pendingSwap={x:code==='ArrowRight'?1:code==='ArrowLeft'?-1:0,y:code==='ArrowDown'?1:code==='ArrowUp'?-1:0};
});
let touchAimStart = null;



$('world').tabIndex = 0;
// Developer tools (ui/dev-wiring.js).
const {devTools,devWindow,devDialog,showDevNotice}=installDevWiring({$,sim,view,bots,toast,
 online:()=>online,settings:()=>settings,settingsPanel:()=>settingsPanel,started:()=>started,paused:()=>paused,
 randomSpot:()=>{const ok=randomPracticeSpawn();if(ok)view.cutCamera?.();return ok;},
 changed:()=>{dirty=true;updateHUD();}});
installTitle({page:document.querySelector('[data-page="home"]'),shell:$('intro'),overlay:document.querySelector('#intro .title-blood')});
// The map page's preview of the map this page has loaded (only a loaded map
// can be photographed; the others show their name until picked once).
// Cached per map, so each map is captured once per session.
function thumbnail(){
 if(!menuMaps().includes(selectedMap))return '';
 const cacheKey='deadshift-thumbnail-'+map.id;
 try{const cached=sessionStorage.getItem(cacheKey);if(cached)return cached;}catch{}
 const image=view.captureMapThumbnail();
 try{sessionStorage.setItem(cacheKey,image);}catch{}
 return image;
}
// Online play (see AGENTS.md > Networking). Practice overrides never go online:
// the sessions reset sim.dev every tick and P / O / map teleport are refused.
const online=createOnlinePlay({$,map,sim,createSim:m=>new Simulation(m),start,toast:text=>toast(text,2600),leave:()=>$('main-menu').click(),
 server:import.meta.env.DEV?params.get('peerhost'):null,pickWeapon:()=>enterOnline()});
const menuFlow=installMenu({$,map,thumbnail,start,openSettings,closeSettings,returnToMenu,tutorialComplete:readTutorialComplete(),online:(request,status)=>online.request(request,status)});
// Multiplayer flow (see AGENTS.md > Multiplayer): pick a weapon over the
// running game, fight, die, respawn after 5 s or change weapon, leave.
let choosing=false,lastKiller=null,lastOneShot=false;
const mpHud=createMultiplayerHud($('game'));
// The lobby (lobby-panel.js): a page of the pause menu, and of the online
// death screen. Everyone sees it; its controls work for the host only.
const lobbyPanel=createLobbyPanel($('game'),{
 back:()=>closeLobby(),
 kick:id=>{online.kick(id);renderLobby();},
 setSetting:(key,value)=>{online.setSetting(key,value);renderLobby();},
 resetMap:()=>{online.resetMap();toast('MAP RESET',2000);},
 endRound:()=>{online.endRound();closeLobby();},
});
// Between rounds everyone is on the lobby screen (lobby-screen.js); a round
// opens with the weapon pick (weapon-pick.js), which comes back after a death
// only through CHANGE WEAPON. Which one shows follows the round's state from
// the host, every frame (syncOnlineScreens).
if(import.meta.env.DEV)window.__online=online;
const lobbyScreen=createLobbyScreen($('game'),{
 kick:id=>online.kick(id),
 setMode:mode=>online.setMode(mode),
 setSetting:(key,value)=>online.setSetting(key,value),
 start:()=>{if(!online.startRound(online.lobby().mode||'ffa'))toast((online.startError()||'CANNOT START').toUpperCase(),3200);},
 addRobot:()=>{if(!online.addRobot())toast('THE ROOM IS FULL',2000);},
 tuneRobot:(id,setup)=>online.tuneRobot(id,setup),
 tuneAllRobots:setup=>{if(online.tuneAllRobots(setup))toast('EVERY ROBOT SET',1600);},
 chooseTeam:team=>online.chooseTeam(team),
 leave:()=>$('main-menu').click(),
 copyInvite:()=>online.copyInvite(),
 map,// s2-spawns: the lobby's map list
});
const weaponPick=createWeaponPick($('game'),{
 pick:weapon=>{if(online.active)online.choose(weapon,false);},
 go:weapon=>{if(online.active){online.choose(weapon,true);weaponPick.hide();}else if(deathPick){nextWeapon=weaponOrDefault(weapon);closeDeathPick();toast('NEXT LIFE · '+(weaponInfo(nextWeapon)?.name||'').toUpperCase(),1800);}else changeWeaponSolo(weapon);},
 back:()=>closeSoloPick(),
});
// CHANGE WEAPON in the pause menu: solo practice (the same weapon grid, no
// timer, BACK to the pause menu) and multiplayer practice (the round's pick;
// you leave the world while picking). Not in the tutorial or in an FFA round.
const pauseWeaponBtn=document.createElement('button');pauseWeaponBtn.id='pause-weapon';pauseWeaponBtn.className='secondary';pauseWeaponBtn.textContent='CHANGE WEAPON';pauseWeaponBtn.hidden=true;
$('resume').after(pauseWeaponBtn);
pauseWeaponBtn.onclick=()=>{
 if(online.active){online.pickAgain();setPaused(false);return;}
 $('pause-panel').classList.add('hidden');weaponPick.show(sim.weapon,{timed:false});
};
// Back from the death screen's weapon grid to the countdown.
function closeDeathPick(){
 deathPick=false;weaponPick.hide();
 if(deathActive){deathScreen.root.classList.remove('hidden');deathScreen.root.querySelector('.death-actions button:not([hidden])')?.focus();}
}
function closeSoloPick(){
 if(deathPick){closeDeathPick();return;}
 if(!weaponPick.open||online.active)return;
 weaponPick.hide();$('pause-panel').classList.remove('hidden');pauseWeaponBtn.focus();
}
// Solo: the new weapon where you stand, with a full load, and back to the game.
function changeWeaponSolo(weapon){
 weaponPick.hide();
 const p=sim.player,aim={aimX:p.aimX,aimZ:p.aimZ};
 sim.weapon=weaponOrDefault(weapon);sim.respawn({x:p.x,z:p.z});Object.assign(sim.player,aim);
 previousPlayer={...sim.player};applyInputPreference();updateHUD();
 $('pause-panel').classList.remove('hidden');setPaused(false);
}
// The pause menu's buttons alternate sides (left, right, left...) over the
// ones showing; set before it opens so the lettering is fitted to it.
// Solo practice (not the tutorial): RESET MAP puts the world back (props,
// crops, targets; blood, marks and bodies cleared) and carries on where you
// stand. Two presses, like the host's reset online.
const pauseResetMapBtn=document.createElement('button');pauseResetMapBtn.id='pause-reset-map';pauseResetMapBtn.className='secondary';pauseResetMapBtn.textContent='RESET MAP';pauseResetMapBtn.hidden=true;
$('reset').after(pauseResetMapBtn);
let resetArmedUntil=0;
pauseResetMapBtn.onclick=()=>{
 if(performance.now()<resetArmedUntil){resetArmedUntil=0;pauseResetMapBtn.textContent='RESET MAP';sim.resetWorld();setPaused(false);toast('MAP RESET');return;}
 resetArmedUntil=performance.now()+3000;pauseResetMapBtn.textContent='PRESS AGAIN TO RESET';
 setTimeout(()=>{if(performance.now()>=resetArmedUntil)pauseResetMapBtn.textContent='RESET MAP';},3050);
};
function layoutPauseMenu(){
 const practice=online.active?online.match()?.mode==='practice'&&online.match()?.phase==='playing':!map.training;
 pauseWeaponBtn.hidden=!started||!practice;
 pauseResetMapBtn.hidden=!started||online.active||!!map.training;
 const visible=[...$('pause-panel').querySelectorAll('.modal-card > button')].filter(b=>!b.hidden);
 visible.forEach((b,i)=>{b.style.textAlign=i%2?'right':'left';});
}
const lobbyBtn=document.createElement('button');lobbyBtn.id='pause-lobby';lobbyBtn.className='secondary';lobbyBtn.textContent='LOBBY';lobbyBtn.hidden=true;
$('main-menu').before(lobbyBtn);lobbyBtn.onclick=()=>openLobby();
let lobbyFrom=null;
function renderLobby(){if(lobbyPanel.open)lobbyPanel.render({lobby:online.lobby(),match:online.match(),code:online.code,isHost:online.isHost,myId:online.myId,max:NETWORK.maxPlayers});}
function openLobby(){
 if(!online.active)return;
 lobbyFrom=deathActive&&deathScreen.open?'death':'pause';
 if(lobbyFrom==='death')deathScreen.root.classList.add('hidden');else $('pause-panel').classList.add('hidden');
 lobbyPanel.show();renderLobby();
}
function closeLobby(){
 if(!lobbyPanel.open)return;
 lobbyPanel.hide();
 if(lobbyFrom==='death'&&deathActive){deathScreen.root.classList.remove('hidden');deathScreen.root.querySelector('.death-actions button:not([hidden])')?.focus();}
 else if(paused){$('pause-panel').classList.remove('hidden');$('resume').focus();}
 else $('world').focus();
 lobbyFrom=null;
}
// Online the pause menu never takes you out of the round (the world goes on
// and you can be hit): RESUME, LOBBY, SETTINGS, LEAVE MULTIPLAYER.
function onlineMenus(on){
 lobbyBtn.hidden=!on;$('reset').hidden=on;
 if(!on){lobbyPanel.hide();lobbyScreen.hide();weaponPick.hide();view.setPickView(null);document.body.classList.remove('mp-between');}
 $('main-menu').textContent=on?'LEAVE MULTIPLAYER':'MAIN MENU';
 mpHud.active=on;
}
// The death screen goes; the body from the last life stays where it fell,
// settled (it goes at the next death, a map reset or leaving).
function clearDeath(){
 if(deathActive){deathActive=deathMenuOpen=false;deathElapsed=0;deathScreen.hide();document.body.classList.remove('dying','dead-menu');}
 // Nothing from the last life pops up in the new one.
 damageFeedback.clear();outgoingFeedback.clear();
 if(lobbyFrom==='death')closeLobby();
 view.deathView?.release();
}
// Practice: back on your feet at the start, the world as you left it.
function respawnPractice(){
 if(online.active||!deathActive)return;
 // The grid still open when the count runs out: what is picked there comes along.
 if(deathPick){nextWeapon=weaponPick.selected||nextWeapon;deathPick=false;weaponPick.hide();}
 clearDeath();
 if(nextWeapon){sim.weapon=weaponOrDefault(nextWeapon);nextWeapon=null;applyInputPreference();}
 sim.respawn({x:map.spawn.x,z:map.spawn.z});randomPracticeSpawn();
 view.cutCamera();previousPlayer={...sim.player};
 running=true;paused=false;sound.suspend(false);$('world').focus();updateHUD();
}
// Which online screen shows, from the round's state (the host's): the lobby
// screen between rounds, the weapon pick while picking (not once GO was
// pressed: then the death screen's countdown, if any, finishes), else the game.
function syncOnlineScreens(){
 const match=online.match(),me=online.me;if(!match||!me)return;
 const inLobby=match.phase==='lobby';
 const picking=match.phase==='playing'&&!!me.picking&&!me.picking.go;
 if(inLobby){
  if(!lobbyScreen.open){
   clearDeath();closeLobby();mpHud.hideBoard();
   if(paused){paused=false;$('pause-panel').classList.add('hidden');document.body.classList.remove('paused');}
   for(const id of ['settings-panel','map-panel'])$(id).classList.add('hidden');settingsOpen=mapOpen=false;
   releaseInput();lobbyScreen.show();
  }
  lobbyScreen.render({lobby:online.lobby(),code:online.code,isHost:online.isHost,myId:online.myId,max:NETWORK.maxPlayers});
 }else if(lobbyScreen.open)lobbyScreen.hide();
 if(picking){
  if(!weaponPick.open){closeLobby();releaseInput();weaponPick.show(me.picking.weapon||me.weapon||null);}
  weaponPick.setTimer(me.picking.left,PICK.time);
 }else if(weaponPick.open)weaponPick.hide();
 // The pick's view from high above; the lobby shows the same spot behind it.
 view.setPickView(inLobby||picking?pickView(map):null);
 // The death screen steps aside while picking or while its lobby is open.
 if(deathActive&&deathMenuOpen)deathScreen.root.classList.toggle('hidden',picking||inLobby||(lobbyPanel.open&&lobbyFrom==='death'));
 choosing=inLobby||picking;
 document.body.classList.toggle('mp-between',choosing||(!me.present&&!deathActive));
}
function enterOnline(){onlineMenus(true);syncOnlineScreens();}
// Loud enough to hear from anyone's gun; the rest stay with their owner.
const NET_SOUNDS=new Set(['rifleShot','shotgunShot','launch','explosion','grenadeExplosion','propBreak','hexPulse','sprayStart','surgeCharge','surgeStart','scatterFire','scatterBurst']);
function netEvents(){
 const myId=online.myId,isClient=!online.isHost;
 for(const {by,e,shooter,slot} of online.events()){
  if(by===myId){
   // A joiner's own gun, as the host fired it: your walking already made its
   // own dust, and your orbs are drawn under ids unique to your slot.
   if(e.type==='dodge')continue;
   const base=(slot+1)*1e6;
   const own=e.type==='launch'?{...e,paths:(e.paths||[]).map(p=>({...p,id:base+p.id}))}:e.type==='trailEnd'?{...e,id:base+e.id}:e;
   if(isClient)event(own);
   continue;
  }
  view.netEvent(e,shooter,slot);
  otherEvent(e,shooter,slot);
 }
}
function multiplayerFrame(){
 const myId=online.myId,lines=online.feed();
 for(const line of lines)if(line.victims.includes(myId)){lastKiller=line.killer&&line.killer!==myId?line.killerName:null;lastOneShot=!!line.oneShot&&!!lastKiller;if(deathActive)deathScreen.setKiller(lastKiller,lastOneShot);}
 if(lines.length)mpHud.addFeed(lines,myId,elapsed);else mpHud.renderFeed(elapsed);
 if(mpHud.boardOpen)mpHud.setBoard(online.scoreboard(),myId);
 const me=online.me;
 if(deathActive&&me)deathScreen.setTimer(me.respawnIn,online.lobby().settings?.respawn||MATCH_SETTINGS.respawn.default);
 mpHud.setMatch(online.match(),myId);
 renderLobby();syncOnlineScreens();
 // Top left: where you are, map · mode (the round's mode, or the lobby).
 const phase=online.match()?.phase,modeText='MULTIPLAYER · '+(phase==='playing'||phase==='results'?(MODES.find(m=>m.id===online.match().mode)?.name||''):'LOBBY');
 if(modeLabel.textContent!==modeText)modeLabel.textContent=modeText;
}
function reviveOnline(){
 clearDeath();lastKiller=null;lastOneShot=false;view.cutCamera();previousPlayer={...sim.player};
 applyInputPreference();syncOnlineScreens();
 if(!paused&&!choosing){running=true;$('world').focus();}
 updateHUD();
}
$('overhead-image').addEventListener('click',e=>{
  if(!mapOpen||!sim.dev.teleport||(online.active&&!online.isHost))return;
  const svg=$('overhead-image').querySelector('svg'),matrix=svg?.getScreenCTM();if(!matrix)return;
  const point=new DOMPoint(e.clientX,e.clientY).matrixTransform(matrix.inverse());
  if(!isPlayable(map,point.x,point.y,RULES.radius))return;
  releaseInput();sim.hexOrbs=[];sim.hexSpin=null;sim.spray.active=false;
  sim.player.x=Math.max(-map.width/2+RULES.radius,Math.min(map.width/2-RULES.radius,point.x));
  sim.player.z=Math.max(-map.depth/2+RULES.radius,Math.min(map.depth/2-RULES.radius,point.y));
  sim.player.vx=sim.player.vz=sim.player.dodgeRemaining=0;
  sim.movePlayer(0,0);previousPlayer={...sim.player};accumulator=0;
  view.focus.set(sim.player.x,view.gy(sim.player.x,sim.player.z),sim.player.z);dirty=true;
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
 setScreen:applyScreen,
 changed:()=>{dirty=true;updateHUD();},
});
const selectMenus=installSelectMenus($('settings-panel'));
$('mute-all').onclick=toggleAudio;
sticks.set('move',bindFloatingStick($('move-zone'),$('move-stick'),{isRunning:()=>running,onTap:touchTapFire,output:touch,
 onWalkStart:()=>{if(touchAimPointer===null)inputMode='keyboard';}}));
// Resizing the canvas clears it, so draw straight away rather than show a
// blank frame until the next scheduled one.
function onResize(){ view.resize(); dirty = true; if(layoutPreview){view.update(sim,RULES.step,false,elapsed,sim.player,1);view.render();} else if(started) view.render(); arrangeTouchCluster(); }
window.addEventListener('resize', onResize);
// The phone browser's gestures, toolbars and sizes (mobile-browser.js).
installMobileBrowser({ onResize });
// The cached canvas rect is in page coordinates, so a scroll moves it even
// though nothing resized.
window.addEventListener('scroll', () => { view.cachedRect = null; }, { passive: true });
$('world').addEventListener('pointermove', e => {
  if(e.pointerType!=='mouse'&&e.pointerId===touchAimPointer&&running){
   e.preventDefault();
   // Aim assist on: a swipe is an arrow key. Idle, it picks the target that
   // way from the aim dot; locked, the next target that way. The cursor never
   // jumps to the finger. With no target that way the drag moves the cursor
   // by how far the finger moves (like a trackpad), from where it already is.
   if(lockMode()&&targetLock.id===null&&swipeFrom?.tried){
    const last=swipeFrom.last||{x:e.clientX,y:e.clientY};
    setCursorTarget(cursorTarget.x+e.clientX-last.x,cursorTarget.y+e.clientY-last.y);inputMode='mouse';
    swipeFrom.last={x:e.clientX,y:e.clientY};
    if(touchAimStart)touchAimStart.dragged=true;
    return;
   }
   if(lockMode()){
    swipeFrom||={x:touchAimStart?.x??e.clientX,y:touchAimStart?.y??e.clientY};
    const dx=e.clientX-swipeFrom.x,dy=e.clientY-swipeFrom.y;
    // One switch per swipe; a long continued drag can step one more each
    // TARGET_LOCK.swipeAgain pixels.
    const need=swipeFrom.count?TARGET_LOCK.swipeAgain:TARGET_LOCK.swipe;
    if(Math.hypot(dx,dy)>=need){pendingSwap={x:dx,y:dy};swipeFrom={x:e.clientX,y:e.clientY,count:(swipeFrom.count||0)+1,tried:targetLock.id===null,last:{x:e.clientX,y:e.clientY}};}
    if(touchAimStart&&Math.hypot(e.clientX-touchAimStart.x,e.clientY-touchAimStart.y)>=TOUCH_TAP.slop)touchAimStart.dragged=true;
    return;
   }
   setCursorTarget(e.clientX,e.clientY);inputMode='mouse';
   if(touchAimStart&&Math.hypot(e.clientX-touchAimStart.x,e.clientY-touchAimStart.y)>=TOUCH_TAP.slop)touchAimStart.dragged=true;
   return;
  }
  if (e.pointerType !== 'mouse') return;
  setCursorTarget(e.clientX,e.clientY); inputMode = 'mouse';
  // Only a press that began on the world counts: dragging off a button onto
  // the world with the mouse still down must not open fire.
  if(running&&worldPress&&usesTrigger(sim.weapon)){rifleFiring=!!(e.buttons&1);rifleAiming=!!(e.buttons&2);}
});
$('world').addEventListener('pointerdown', e => {
  if(e.pointerType==='mouse')worldPress=true;
  if(e.pointerType!=='mouse'&&touchPrompts){
   if(!running||touchAimPointer!==null)return;
   e.preventDefault();touchAimPointer=e.pointerId;inputMode='mouse';if(!lockMode())setCursorTarget(e.clientX,e.clientY);$('world').setPointerCapture(e.pointerId);
   touchAimStart={x:e.clientX,y:e.clientY,time:performance.now(),dragged:false};swipeFrom=null;return;
  }
  if(running&&usesTrigger(sim.weapon)&&(e.button===0||e.button===2)){
   if(e.pointerType!=='mouse')e.preventDefault();inputMode='mouse';setCursorTarget(e.clientX,e.clientY);
   if(e.button===0){rifleFiring=true;pendingLaunch=true;firePointer=e.pointerId;}else{rifleAiming=true;aimPointer=e.pointerId;}
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
// Space and Enter keep meaning fire rather than pressing the button
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
 enabled:()=>running&&usesTrigger(sim.weapon),state:(fire,aim)=>{rifleFiring=fire;rifleAiming=aim;},
 fire:()=>{pendingLaunch=true;},aim:(x,y)=>{setCursorTarget(x,y);inputMode='mouse';}
});
// A finger or pen on the world with keyboard prompts (an iPad with a
// keyboard) holds the trigger like a mouse button: its lift lets go (v148,
// owner: the rifle kept firing, even after a reload, because only a mouse
// release was listened for and the press had blocked the browser's mouse copy).
window.addEventListener('pointerup',e=>{if(e.pointerId===firePointer){firePointer=null;rifleFiring=false;}if(e.pointerId===aimPointer){aimPointer=null;rifleAiming=false;}if(e.pointerType==='mouse'){worldPress=false;if(e.button===0)rifleFiring=false;if(e.button===2)rifleAiming=false;}if(e.pointerId===touchAimPointer){
  const tap=isTap(touchAimStart,e.clientX,e.clientY);
  touchAimPointer=null;touchAimStart=null;
  if(tap&&running)touchTapFire(e.clientX,e.clientY);
 }});
// No finger left on the screen: nothing can still be aiming (a lost lift).
for(const type of ['touchend','touchcancel'])window.addEventListener(type,e=>{if(e.touches.length)return;if(touchAimPointer!==null){touchAimPointer=null;touchAimStart=null;}if(firePointer!==null){firePointer=null;rifleFiring=false;}if(aimPointer!==null){aimPointer=null;rifleAiming=false;}for(const reset of touchActionResets)reset();},true);
for(const type of ['pointercancel','lostpointercapture'])$('world').addEventListener(type,e=>{if(e.pointerId===touchAimPointer&&(type==='pointercancel'||!touchAimStart)){touchAimPointer=null;touchAimStart=null;}});
$('world').addEventListener('pointercancel',()=>{rifleFiring=false;rifleAiming=false;firePointer=aimPointer=null;});
window.addEventListener('pointercancel',e=>{if(e.pointerId===firePointer){firePointer=null;rifleFiring=false;}if(e.pointerId===aimPointer){aimPointer=null;rifleAiming=false;}},true);
const navigateMenu=createMenuNavigation();
window.addEventListener('keydown', e => {
  if(document.body.classList.contains('loading'))return;
  // Multiplayer: hold Tab for the scoreboard (Tab has no game action).
  if(e.code==='Tab'&&online.active&&started&&!settingsOpen&&!mapOpen&&!paused&&!choosing&&!devDialog.isOpen){
   e.preventDefault();if(!e.repeat){mpHud.setBoard(online.scoreboard(),online.myId);mpHud.showBoard();}return;
  }
  if(lobbyPanel.open){navigateMenu(e,lobbyPanel.root,()=>closeLobby());if(['Space','Tab','KeyQ','KeyE','Escape','ArrowUp','ArrowDown'].includes(e.code))e.preventDefault();return;}
  if(devDialog.isOpen){devDialog.keydown(e);return;}
  // The match result card (VS ROBOTS): the keys work its buttons.
  if(duel.resultOpen){navigateMenu(e,duel.root,()=>{});if(['Space','Tab','Escape','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();return;}
  if(deathActive){
   if(deathPick)navigateMenu(e,weaponPick.root,()=>closeDeathPick());
   else if(deathMenuOpen)navigateMenu(e,deathScreen.root,()=>{});
   if(['Escape','Space','Tab','KeyQ','KeyE','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();
   return;
  }
  // The only way in: Shift+P while paused. Before the code, P and O do nothing.
  // Online only the host has them (the host's sim is the authority).
  if(paused&&!settingsOpen&&!mapOpen&&e.code==='KeyP'&&e.shiftKey&&!e.repeat&&(!online.active||online.isHost)){
   e.preventDefault();
   if(devTools.isUnlocked()){setPaused(false);devWindow.show();}else devDialog.show();
   return;
  }
  const menuRoot=settingsOpen?$('settings-panel'):mapOpen?$('map-panel'):paused?$('pause-panel'):!started?$('intro'):lobbyScreen.open?lobbyScreen.root:weaponPick.open?weaponPick.root:choosing?$('intro'):null;
  if(navigateMenu(e,menuRoot,()=>{if(settingsOpen)closeSettings();else if(mapOpen)toggleMap();else if(paused)setPaused(false);else if(lobbyScreen.open||weaponPick.open){if(deathPick)closeDeathPick();return;}else menuFlow.back();}))return;
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
  // The player's key bindings (config/keybinds.js): the action's own code.
  const code=gameCode(e.code);
  if(code==='KeyM'&&!e.repeat){e.preventDefault();toggleMap();return;}
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
  if (code === 'KeyN' && !e.repeat) toggleAudio();
  if((e.code==='KeyO'||e.code==='KeyP')&&!e.repeat&&devTools.isUnlocked()){
   e.preventDefault();
   if(online.active&&!online.isHost){toast('DEV TOOLS ARE THE HOST\'S ONLINE');return;}
   if(e.code==='KeyO'){devWindow.toggle();return;}
   if(running){showDevNotice(devTools.toggleAll());devWindow.sync();}
   return;
  }
  if (!running) return;
  // (Ctrl dodged before v147.) While playing no Ctrl shortcut may fire by accident
  // (Ctrl+S save, Ctrl+D bookmark, Ctrl+E the address bar, Ctrl+R reload…).
  // The browser keeps a few it will not give up (Ctrl+W, Ctrl+T, Ctrl+N);
  // leaving the page mid-game then asks first (beforeunload below).
  if (e.ctrlKey) e.preventDefault();
  if (['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  if (code && code !== e.code) e.preventDefault();
  if (e.repeat || !code) return;
  keys.add(code); tappedKeys.add(code);
  if (code.startsWith('Arrow')) inputMode = 'keyboard';
  if (code === GAME_KEYS.shoot) { pendingLaunch = true; pendingQuickShot=true; pendingAimPoint = inputMode === 'mouse'&&!keyboardAim(keys,tappedKeys).active ? view.aim(mouse.x, mouse.y, sim.player) : null; }
  if (code === 'KeyR') e.preventDefault();
});
// A key's release by the key it was pressed as too (some iPad keyboards send
// a keyup with no code, which left Space held and the rifle firing).
const downAs=new Map();
window.addEventListener('keydown',e=>{if(e.key)downAs.set(e.key.toLowerCase(),e.code);},true);
window.addEventListener('keyup', e => {const was=e.key&&downAs.get(e.key.toLowerCase());if(was){downAs.delete(e.key.toLowerCase());const c=gameCode(was);if(c)keys.delete(c);keys.delete(was);}const code=gameCode(e.code);if(code)keys.delete(code);keys.delete(e.code);if(e.code==='Tab'&&mpHud.boardOpen)mpHud.hideBoard();});
window.addEventListener('blur', releaseInput);
// Switching apps (an iPad's app switcher) can swallow key and pointer releases.
document.addEventListener('visibilitychange',()=>{if(document.hidden)releaseInput();});
window.addEventListener('pagehide',releaseInput);
// The movement keys are W A S D: Ctrl+D (bookmark this
// page), Ctrl+S, Ctrl+A... would fire mid-fight. From the moment a game starts,
// in every state (menus over it included, where a dodge key may still be
// held), no Ctrl combination reaches the browser, except in text fields. This
// runs first (capture), before any handler can return early.
window.addEventListener('keydown',e=>{if(started&&e.ctrlKey&&!e.target.matches?.('input,select,textarea,[contenteditable=true]'))e.preventDefault();},true);
// Ctrl + mouse wheel would zoom the page mid-dodge.
window.addEventListener('wheel',e=>{if(e.ctrlKey&&started)e.preventDefault();},{passive:false});
// A Ctrl+W meant as dodge + forward, or any other way out mid-game, asks first.
window.addEventListener('beforeunload',e=>{if(started&&(online.active||running)){e.preventDefault();e.returnValue='';}});
// Switching away mid-game (another tab, the home screen) pauses a solo game,
// so coming back opens on the pause menu instead of straight into a fight.
// Online the world keeps going, so it is only input that is let go.
document.addEventListener('visibilitychange', () => { if(document.hidden){releaseInput();lastTime=null;accumulator=0;if(started&&!paused&&!online.active&&!deathActive&&!choosing)setPaused(true);} });
// Browsers only let sound start after the player touches or presses
// something. A game opened straight from a link or a reload starts silent;
// the first press anywhere wakes the sound up.
const wakeSound=()=>{const ctx=sound.context;if(ctx&&ctx.state==='suspended'&&started&&!paused)void ctx.resume();};
for(const type of ['pointerdown','keydown','touchend'])window.addEventListener(type,wakeSound,{capture:true,passive:true});

function frame(time) {
  const dt = lastTime === null ? 0 : Math.min((time - lastTime) / 1000, .1); lastTime = time;
  if (!paused) {
    elapsed += dt;
    if (markerRemaining > 0) { markerRemaining -= dt; if (markerRemaining <= 0) $('hit-marker').classList.remove('show'); }
    if (coneFlicker > 0) coneFlicker -= dt;
  }
  // Online the world does not stop for your pause menu: everyone else is
  // still playing, so the simulation keeps running with your hands off.
  const stepping = running || (online.active && started);
  // The shape of this screen, for the robots' off-screen rule (a phone turns).
  const aspect = view.camera.aspect; bots.viewAspect = aspect; online.session?.setAspect?.(aspect);
  if (stepping) {
    // Dev game speed stretches or squeezes time; online sim.dev is reset so it is always 1 there.
    // (Game speed is a solo tool: online it would change everyone's clock.)
    accumulator += dt * (online.active ? 1 : sim.dev.timeScale || 1);
    while (accumulator >= RULES.step && (running || (online.active && started))) {
      previousPlayer = { ...sim.player };
      prevCursor.x=mouse.x;prevCursor.y=mouse.y;
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
      // No-mouse players: with a target on screen the aim sits on it (arrows
      // and swipes switch targets); otherwise the ordinary aiming below.
      const locked = lockTarget(RULES.step);
      if (locked) {
        const pt = targetLock.point, dx = pt.x - sim.player.x, dz = pt.z - sim.player.z, l = Math.hypot(dx, dz) || 1;
        // The body faces the gliding aim point directly (no extra turn easing on
        // top of the glide), so the character, cone and dot sweep together.
        // Trigger guns turn so the barrel's line (not the body's) meets it.
        const lateral = aimsByPoint(sim.weapon) ? muzzleLateral(sim.weapon) : 0, bearing = lateral && l > lateral + .3 ? muzzleBearing(sim.player.x, sim.player.z, pt.x, pt.z, lateral) : Math.atan2(dz, dx);
        aimX = Math.cos(bearing); aimZ = Math.sin(bearing); aimPointX = pt.x; aimPointZ = pt.z; digitalAim = false;
        if (arrows.active && !touchPrompts) inputMode = 'keyboard';
      }
      else if (digitalAim) { aimX = manualX; aimZ = manualZ; inputMode = 'keyboard'; }
      else if (inputMode === 'mouse') {
        const cursorAim = view.aim(mouse.x, mouse.y, sim.player);
        ({ aimX, aimZ, aimPointX, aimPointZ } = aimsByPoint(sim.weapon) ? aimDamping.apply(cursorAim, sim.player, 1 / 60, muzzleLateral(sim.weapon)) : cursorAim);
      }
      else if (moveX || moveZ) { aimX = moveX; aimZ = moveZ; digitalAim = true; }
      // The no-mouse lesson: Q fired while aiming with the arrow keys.
      if(tutorial){tutorial.touch=touchPrompts;tutorial.touchAiming=touchAimPointer!==null;tutorial.walking=Math.hypot(touchMove.x,touchMove.z)>.2;if(arrows.active)tutorial.arrowAim=true;if(tappedKeys.has(GAME_KEYS.shoot)&&tutorial.arrowAim&&inputMode==='keyboard')tutorial.event({type:'keyboardShot'},sim);}
      const ballast=ballastInput(rifleFiring,keys,tappedKeys);
      if(!online.active)bots.before(sim);
      // Freezing is a solo tool: online it would stop only the host.
      if(online.active&&sim.dev.freeze)sim.dev.freeze=false;
      sim.step(online.input({ moveX, moveZ, aimX, aimZ, aimPointX, aimPointZ, autoRange:locked?false:assistMode(), smoothAim:digitalAim, grenade:tappedKeys.has(GAME_KEYS.secondary), surge:sim.weapon==='rifle'&&tappedKeys.has('KeyX'), fire:sim.weapon==='shotgun'?ballast.fire:rifleFiring||pendingLaunch||(sim.weapon==='rifle'&&held(GAME_KEYS.shoot)),tapFire:pendingLaunch&&!tappedKeys.has(GAME_KEYS.shoot),scatter:sim.weapon==='shotgun'&&tappedKeys.has('KeyX'),doubleShot:tappedKeys.has(GAME_KEYS.secondary),aiming:aimingNow(),reload:tappedKeys.has('KeyR'), spray: held('KeyC'), dodge: tappedKeys.has(GAME_KEYS.dodge), hex: tappedKeys.has('KeyX'), seed: held(GAME_KEYS.secondary) || touch.seeding || pendingSeed, launch: pendingLaunch, quickShot:pendingQuickShot,
        launchPointX: arrows.active?undefined:pendingAimPoint?.aimPointX, launchPointZ: arrows.active?undefined:pendingAimPoint?.aimPointZ }));
      online.afterStep();
      if(!online.active){bots.after(sim);bots.step(sim);}
      if(tutorial){tutorial.update(sim,RULES.step);updateTutorial();}
      tappedKeys.clear(); pendingQuickShot=false; pendingLaunch = pendingSeed = false; pendingAimPoint = null; accumulator -= RULES.step;
      for (const e of sim.drainEvents()) event(e);
    }
    if(online.active)netEvents();
    else if(bots.active)for(const {e,shooter,slot} of bots.drain()){view.netEvent(e,shooter,slot);otherEvent(e,shooter,slot);}
    sound.update(sim.player, sim.time);
    sound.updateHex(sim);
  }
  // No view.update during pause: the rendered scene and all effect clocks freeze.
  if (paused) {
    if (dirty) { view.render(); dirty = false; }
  } else if(started) {
    // While the GPU is still drawing the last frame, skip this one rather than
    // queue it (queued frames are input lag; see WorldView.gpuBusy).
    const renderDelta = view.gpuBusy() ? budget.hold(dt) : budget.tick(dt);
    if (renderDelta > 0) {
      view.tutorialGuide=tutorial&&!tutorial.complete?{zone:tutorial.zone,target:tutorial.pointer(sim)}:null;
      // Team games: your ring your side's colour, like your teammates' (SIDE_COLOURS).
      view.setTeamRing(online.active?(SIDE_COLOURS[online.myTeam]?.ring||null):bots.bots.some(b=>b.team==='blue')?SIDE_COLOURS.blue.ring:null);
      view.remotePlayers = online.active ? online.others(running ? accumulator / RULES.step : 1) : bots.others(running ? accumulator / RULES.step : 1);
      view.update(online.active?drawSim(sim,online.foreign()):bots.active?drawSim(sim,bots.foreign(elapsed)):sim, renderDelta, running||online.active, elapsed, previousPlayer, running ? accumulator / RULES.step : 1);
      robotMinds.update(bots,view,!!sim.dev.robotMinds&&!online.active);
      if(running||online.active||deathActive)hollow?.update(renderDelta,sim); // s3-sound: the crows (on the death screen too: they fly on while you wait)
      dirty = false; renderedFrames++;
    }
    // The aim dot is page markup, not the 3D frame: it follows every display
    // frame, drawn or skipped, so it never lags the pointer.
    updateReticle();
    if(running&&!document.hidden){view.setResolutionScale(adaptiveResolution.sample(dt,renderDelta>0,settings.quality,settings.fps));view.setStrain(adaptiveResolution.strained);}
    else adaptiveResolution.reset();
    fpsTime += dt;
    if (fpsTime >= 1) { measuredFPS = Math.round(renderedFrames / fpsTime); fpsTime = 0; renderedFrames = 0; }
  }
  if(paused)adaptiveResolution.reset();
  online.frame({onRespawn:reviveOnline});
  if(online.active)multiplayerFrame();
  perfReadout.update(started && !paused ? dt : 0, measuredFPS);
  syncGameCursor();
  updateHealthHUD(sim);
  hudTime += dt; if (hudTime >= .08) { updateHUD(); hudTime = 0; keepAwake(running && !deathActive); }
  damageFeedback.update(sim,view);outgoingFeedback.update(sim,view);
  if(started&&!paused)duel.frame(dt);
  {const rp=view.player.position,me=view.screenPoint(rp.x,rp.z);fireIndicator.update(running&&!deathActive?dt:10,me.x,me.y,viewWidth(),viewHeight());}
  if(deathActive){
   deathElapsed+=dt;
   if(!deathMenuOpen&&!duel.over&&deathElapsed>=DEATH_MENU_DELAY){
    deathMenuOpen=true;document.body.classList.add('dead-menu');damageFeedback.clear();outgoingFeedback.clear();
    deathScreen.show(online.active?(online.match()?.mode==='practice'?'online-practice':'online'):'practice');
    // The tutorial keeps its course's weapon (the pause menu hides it too).
    $('death-change-weapon').hidden=!online.active&&!!map.training;
    deathScreen.setKiller(online.active?lastKiller:undefined,lastOneShot);
    if(!online.active)sound.suspend(true);
   }
   // Practice counts its own respawn; online the host's countdown is shown
   // (multiplayerFrame) and the host brings you back.
   if(!online.active&&!duel.over){deathScreen.setTimer(RESPAWN_TIME-deathElapsed);if(deathElapsed>=RESPAWN_TIME)respawnPractice();}
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
  // Trigger weapons show their two extra buttons (items.js touchButtons);
  // Static shows PLACE instead.
  const extras=usesTrigger(sim.weapon)?weaponInfo(sim.weapon).touchButtons:null;
  grenadeButton.hidden=extendedButton.hidden=!extras;
  placeButton.hidden=!!extras;
  const adsFire=!!weaponInfo(sim.weapon)?.adsFire;
  document.body.classList.toggle('ads-fire',adsFire);aimFireButton.hidden=!adsFire;
  const touchLabel=(id,label,binding)=>{
   const word=document.createElement('span');word.className='button-label';word.textContent=label;
   const key=document.createElement('small');key.className='touch-binding';key.textContent=displayKeys(binding);
   $(id).replaceChildren(word,key);
  };
  if(extras){
   touchLabel('touch-extended',extras.extended.label,extras.extended.binding);touchLabel('touch-grenade',extras.grenade.label,extras.grenade.binding);
   extendedButton.setAttribute('aria-label',extras.extended.aria);grenadeButton.setAttribute('aria-label',extras.grenade.aria);
  }
  updateWeaponHUD(sim,touchPrompts);
  touchLabel('touch-launch',extras?'FIRE':'LAUNCH','LMB / SPACE');
  touchLabel('touch-hex',extras?'RELOAD':'HEX',extras?'R':'X');
  touchLabel('touch-stream',extras?'AIM':'STREAM',extras?extras.aim.binding:'C');
  touchLabel('touch-dodge','DODGE','Q');
  touchLabel('touch-place','PLACE','E');
  touchLabel('touch-aimfire','AIM','+ FIRE');
 arrangeTouchCluster();
 // Icons, the same on every input (menu bars, speaker, map); the key is in the title.
 $('pause').title=touchPrompts?'Pause':'Pause / resume · Esc';$('map-toggle').title=touchPrompts?'Map':'Map · M';
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
 const code=gameCode(e.code)||e.code;
 if([GAME_KEYS.dodge,'KeyW','KeyA','KeyS','KeyD','KeyQ','KeyE','KeyR','KeyX','KeyC','Space','Escape','Tab','ShiftLeft','ShiftRight','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(code))detectActiveInput('keyboard');
},true);
applyInputPreference();
const bindAction=(element,press,release)=>touchActionResets.push(bindTouchAction(element,{enabled:()=>running,press,release}));
bindAction($('touch-hex'),()=>tappedKeys.add(usesTrigger(sim.weapon)?'KeyR':'KeyX'));
bindAction($('touch-dodge'),()=>tappedKeys.add(GAME_KEYS.dodge));
bindAction(placeButton,()=>{touch.seeding=true;pendingSeed=true;},()=>{touch.seeding=false;});
bindAction(grenadeButton,()=>{const key=weaponInfo(sim.weapon)?.touchButtons?.grenade.key;if(key)tappedKeys.add(key);});
bindAction(extendedButton,()=>{const key=weaponInfo(sim.weapon)?.touchButtons?.extended.key;if(key)tappedKeys.add(key);});
bindAction($('touch-stream'),()=>{if(!usesTrigger(sim.weapon))keys.add('KeyC');else rifleAiming=true;},()=>{keys.delete('KeyC');rifleAiming=false;});
bindAction($('touch-launch'),()=>{
 pendingLaunch=true;pendingQuickShot=true;
 pendingAimPoint=inputMode==='mouse'&&!keyboardAim(keys,tappedKeys).active&&!(targetLock.id!==null&&lockMode())?view.aim(mouse.x,mouse.y,sim.player):null;
 if(usesTrigger(sim.weapon))rifleFiring=true;
},()=>{rifleFiring=false;});
bindAction(aimFireButton,()=>{
 pendingLaunch=true;pendingQuickShot=true;rifleAiming=true;rifleFiring=true;
},()=>{rifleFiring=false;rifleAiming=false;});
// Editing the touch layout from the menus, outside a match: the controls go
// over a still frame of the map exactly as a match opens on it (no HUD), and
// DONE comes back to Settings > Mobile.
let layoutPreview=false;
function openLayoutPreview(){
 layoutPreview=true;settingsOpen=false;selectMenus.reset();
 $('settings-panel').classList.add('hidden');$('intro').classList.add('hidden');
 document.body.classList.add('playing','layout-preview');
 applyInputPreference();arrangeTouchCluster();
 view.update(sim,RULES.step,false,elapsed,sim.player,1);view.render();
 if(!touchLayout.start())closeLayoutPreview();
}
function closeLayoutPreview(){
 if(!layoutPreview)return;layoutPreview=false;
 document.body.classList.remove('playing','layout-preview');
 $('intro').classList.remove('hidden');openSettings();menuFlow.openTab('mobile');$('touch-edit-layout').focus();
}
const touchLayout=installTouchLayout({root:$('game'),controls:$('touch-controls'),
 canEdit:()=>(started||layoutPreview)&&!deathActive,onChange:()=>syncMobileSettings(),restoreCluster:()=>arrangeTouchCluster(),
 onEditing:editing=>{releaseInput();running=!editing&&started&&!paused&&!deathActive&&!choosing;accumulator=0;sound.suspend(editing||paused||!started);dirty=true;if(!editing)closeLayoutPreview();}
});
const mobileSettings=installMobileSettings({touchLayout,closeSettings,setPaused,preview:()=>openLayoutPreview(),
 state:()=>({started,paused,deathActive,touchPrompts}),arrange:arrangeTouchCluster});
function syncMobileSettings(){mobileSettings.sync();}
syncMobileSettings();
updateHUD(); requestAnimationFrame(frame);
// A page load goes to the title (owner, v147: on phones a reload, e.g. the
// browser bringing the tab back after full screen, dropped you straight into
// the last game). Only a load the menu asked for (it leaves a one-time note
// before switching map, menu.js markLaunch) starts the game; so does a dev
// capture link (tools).
export function finishLoading(){
 let launch=null;try{launch=sessionStorage.getItem('deadshift.launch');sessionStorage.removeItem('deadshift.launch');}catch{}
 const asked=params.get('play')==='1'&&(launch===location.search||params.has('capture')||params.has('autostart'));
 if(asked)void start();
 else{
  if(params.get('play')==='1'){const q=new URLSearchParams(location.search);for(const k of ['play','mode','duel','course','weapon'])q.delete(k);try{history.replaceState(null,'',location.pathname+(q.size?'?'+q:''));}catch{}}
  $('gamemodes').focus();
 }
}



