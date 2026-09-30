import { readLaunch, launchParams } from './launch.js';
import './styles/omen.css';
import './styles/sightline.css';
// deadstab, by killerbunny2846.
import {bindTouchAction} from './ui/touch-action.js';
import { installMobileBrowser, enterFullscreen } from './ui/mobile-browser.js';
import { playFullscreen, leaveFullscreen } from './ui/key-lock.js';
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
import { showBusy, hideBusy } from './ui/busy-screen.js';
import { createDamageFeedback } from './ui/damage-feedback.js';
import { createDeathScreen, DEATH_MENU_DELAY, RESPAWN_TIME } from './ui/death-screen.js';
import { createSpectate, spectateView, SPECTATE_AFTER } from './ui/spectate.js';
import { createScoreFlash, rollHTML } from './ui/score-flash.js';
import { createStatsPanel } from './ui/stats-panel.js';
import { createMatchEnd, onlineOutcome, soloOutcome, readyLabel } from './ui/match-end.js';
import { refreshTypography } from './ui/button-typography.js';
import { createLobbyPanel } from './ui/lobby-panel.js';
import { createLobbyScreen } from './ui/lobby-screen.js';
import { createWeaponPick } from './ui/weapon-pick.js';
import { pickView, lobbyView } from './render/pick-view.js';
import { PICK, MODES, SETTINGS as MATCH_SETTINGS, SIDE_COLOURS, TEAMS, teamById, roundsDecided } from './config/match.js';
const modeLabel=document.querySelector('.brand .mode');
import { GAME_KEYS } from './config/controls.js';
import { gameCode, displayKeys } from './config/keybinds.js';
import { NETWORK } from './config/network.js';
import { bindRifleMouse, weaponAiming,weaponGuarding,ballastInput } from './weapons/rifle-input.js';
import { advanceAimCursor } from './ui/aim-cursor.js';
import { createAimDamping, aimsByPoint, muzzleLateral, muzzleBearing } from './aim-damping.js';
import { createStanceAim, resetStanceAim, stepStanceAim, glideTo, STANCE_AIM } from './weapons/stance-aim.js';
import { inSightCone } from './weapons/sightline.js';
import { SIGHTLINE } from './config/gameplay.js';
import { tutorialMapFor, Tutorial } from './tutorial.js';
import { createTutorialCard } from './ui/tutorial-card.js';
import { installMenu } from './ui/menu.js';
import { createDuel, readDuel, DUEL_MODES, AFTERMATH, FFA_RESPAWN } from './duel.js';
import { createOnlinePlay } from './online-play.js';
import { drawSim } from './net/projectiles.js';
import { createMultiplayerHud } from './ui/multiplayer-hud.js';
import { TAB_TITLE, VERSION, VERSION_FULL } from './version.js';
import { installUiSounds } from './ui/ui-sounds.js';
import { mapById, menuMaps } from './maps.js';
import { targetRadius } from './target-radius.js';
import { createTargetLock, TARGET_LOCK } from './target-lock.js';
import { weapon as weaponInfo, weaponOrDefault, usesTrigger, DEFAULT_WEAPON } from './items.js';
import { playableOr, underMaintenance } from './weapon-maintenance.js';
import { STORM, stormAt, stormPhase, inStorm } from './storm.js';
import { createStormHud } from './ui/storm-hud.js';
import { Simulation, RULES } from './simulation.js';
import { WorldView } from './render/renderer.js';
import { Soundscape, hearingLevel, HEARING } from './audio.js';
import { hollowAmbience } from './hollow-ambience.js'; // s3-sound: Hollow Wick's crows and soundscape
import { createFireIndicator } from './ui/fire-indicator.js';
import { createDamageIndicator } from './ui/damage-indicator.js';
import { validateSettings, RenderBudget, AdaptiveResolution } from './settings.js';
import { gpuInfo, detectTier, autoQuality, AutoQualityWatch } from './device-tier.js';
import { installSettingsPanel } from './ui/settings-panel.js';
import {keyboardAim} from './keyboard-aim.js';
import { createFpsLook, seedFpsLook, fpsMove, fpsAim, installFpsInput } from './fps-mode.js'; // dev-only first person
import { overheadMapSVG } from './ui/overhead-map.js';
import { installDevWiring } from './ui/dev-wiring.js';
import { openSpot } from './net/spawn-points.js';
import { hasAuthoredSpawns } from './net/map-spawns.js'; // s2-spawns
import { createToast } from './ui/toast.js';
import { createRobotMinds } from './ui/robot-minds.js';
import { addWatermark } from './ui/watermark.js';
import { viewWidth, viewHeight } from './viewport.js';
import { installTitle } from './ui/title-screen.js';
import { createSheathScreen } from './ui/sheath-screen.js';
import { Critters } from './critters.js';

const $ = id => document.getElementById(id);
try{migrateGameStorage(localStorage);}catch{}
const toast = createToast(document.getElementById('game'));
// Weapons under maintenance (weapon-maintenance.js): every menu shows them with
// the sticker; a click or tap on one (or Enter on it) only shakes the sticker.
for(const type of ['click','dblclick'])document.addEventListener(type,e=>{
 const hit=e.target?.closest?.('[data-maintenance]');if(!hit||!underMaintenance(hit.dataset.maintenance))return;
 e.preventDefault();e.stopImmediatePropagation();
 if(type==='click'){const tile=hit.closest('.maintenance-tile')||hit;tile.classList.remove('maintenance-nope');void tile.offsetWidth;tile.classList.add('maintenance-nope');setTimeout(()=>tile.classList.remove('maintenance-nope'),500);}
},true);
const robotMinds = createRobotMinds(document.getElementById('game'));
try{migrateGameStorage(sessionStorage);}catch{}
// (v0.996a: the launch's settings ride sessionStorage, not the address bar: launch.js.)
const boot = readLaunch(), params = boot.params;
const selectedMap = params.get('map')==='tutorial' ? tutorialMapFor(params.get('weapon')) : mapById(params.get('map'));
const landmarkStart = import.meta.env.DEV && selectedMap.props.find(p => p.type === params.get('start'));
const roomStart = import.meta.env.DEV && selectedMap.buildings.find(b => b.id === params.get('start'));
// Development-only bookmark for checking the distant field without crossing town.
const map = import.meta.env.DEV && params.get('start') === 'farm' && selectedMap.crops?.length
  ? { ...selectedMap, spawn: { x: selectedMap.crops[0].x - selectedMap.crops[0].w / 2 + 2, z: selectedMap.crops[0].z - selectedMap.crops[0].d / 2 - 3 } }
  : landmarkStart ? { ...selectedMap, spawn: { x: landmarkStart.x, z: landmarkStart.z + 6 } }
  : roomStart ? { ...selectedMap, spawn: { x: roomStart.x, z: roomStart.z } } : selectedMap;
document.title = TAB_TITLE;
// The version as 'v' + VERSION on the title and in the corner (v0.1.0; owner,
// 2026-09-30), from version.js, not the page's text.
for (const el of document.querySelectorAll('.game-version')) el.textContent = 'v' + VERSION;
// The full form (stage included) in Settings (owner, 2026-09-30: "v0.1.0-alpha ... in settings").
for (const el of document.querySelectorAll('.settings-version')) el.textContent = 'deadstab v' + VERSION_FULL;
document.querySelector('.brand .map-name').textContent = map.name.toUpperCase();
document.querySelector('.mode').textContent=map.training?'TUTORIAL':'PRACTICE';
let settings;
const detectedInput=detectedControls({coarsePointer:matchMedia('(pointer: coarse)').matches,hoverAvailable:matchMedia('(hover: hover)').matches});
const deviceDefaults={mobile:detectedInput==='touch'};
try { settings = validateSettings(JSON.parse(localStorage.getItem('deadstab-settings') || '{}'),deviceDefaults); }
catch { settings = validateSettings({},deviceDefaults); }
// The graphics preset for this device (device-tier.js), unless one was chosen
// by hand in Settings > Graphics: Performance, Balanced or Quality.
const deviceTier=detectTier({gpu:gpuInfo(),mobile:deviceDefaults.mobile,cores:navigator.hardwareConcurrency||0,memory:navigator.deviceMemory||0});
if(settings.qualityAuto)settings.quality=autoQuality(deviceTier.tier,settings.qualityAutoStep);
const autoWatch=new AutoQualityWatch();
const sim = new Simulation(map), sound = new Soundscape(), budget = new RenderBudget(settings.fps);
// The world's animals (critters.js: Hollow Wick's goat): this sim holds them
// (SOLO); online the host's arena does and a joiner draws the host's.
{const critters=map.training?null:new Critters(map);if(critters?.any)sim.critters=critters;}
// Robots (bots/): spawned from the developer tools in a solo game.
const bots = new BotMatch(map, { createSim: m => new Simulation(m) });
// 1V1 against a robot (duel.js): set up by start() from the URL.
const duel=createDuel($('game'),{sim,bots,hooks:{
 // The match is over: the death screen and the aftermath go, the game stops
 // and the end card comes up (ui/match-end.js: START, CHANGE SETTINGS, QUIT).
 over:outcome=>{if(deathPick){deathPick=false;weaponPick.hide();}clearDeath();endAftermath();running=false;releaseInput();sound.suspend(true);updateHUD();showSoloEnd(outcome);},
 // (1V1) You took the round: the camera goes to the body (the aftermath).
 pointWon:side=>{const foe=duel.bot;if(duel.config?.mode==='1v1'&&side==='you'&&!deathActive&&foe)startAftermath('d'+duel.score.played,foe.sim.player);},
 // (v0.999a) A side went out: everyone back at full health at fresh spots.
 newRound:()=>newDuelRound(),
}});
// Menu clacks (ui-sounds.js): muted with the game, at the master and effects levels.
installUiSounds({muted:()=>!sound.enabled,level:()=>sound.volume.master*sound.volume.effects});
const adaptiveResolution = new AdaptiveResolution();
sim.weapon=playableOr(weaponOrDefault(params.get('weapon')));
let rifleFiring=false,rifleAiming=false,worldPress=false,pointerOnUI=false,firePointer=null,aimPointer=null;
const updateWeaponHUD=createWeaponHUD($('weapon'));
const updateHealthHUD=createHealthHUD($('game'));
const perfReadout=createPerfReadout(document.querySelector('.masthead'));
const damageFeedback=createDamageFeedback($('game'));
const outgoingFeedback=createOutgoingFeedback($('game'));
addWatermark($('game'));
const fireIndicator=createFireIndicator($('game'));
const damageIndicator=createDamageIndicator($('game'));
// Sound carries only so far (audio.js HEARING): how loud an event is from
// where you stand, from its own position or, failing that, its shooter's.
function heard(e,shooter){
 const x=e.x??shooter?.x,z=e.z??shooter?.z;
 if(!Number.isFinite(x)||!Number.isFinite(z))return {level:1,x:null,z:null};
 return {level:hearingLevel(Math.hypot(x-sim.player.x,z-sim.player.z)/(e.hearingScale||1)),x,z};
}
// Someone else firing within earshot: a pink arc on the side it came from.
const FIRING=new Set(['sheathSwing','sheathDrawCut','ichorSwing','ichorWave','ichorFrenzyStart','sidekickShot','sightlineShot','omenShot','omenVolley','rifleShot','shotgunShot','launch','sprayArc','hexPulse','scatterFire']);
function otherEvent(e,shooter,slot){
 const {level,x,z}=heard(e,shooter);
 hollow?.event(e,shooter,slot); // s3-sound
 if(NET_SOUNDS.has(e.type)||(e.damageType?.startsWith('ichor')||e.damageType?.startsWith('blade'))&&['hit','kill'].includes(e.type))sound.event(e,level);
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
// AIM + FIRE (items.js adsFire): the Nominal, the Sidekick and Sightline's
// Sidekick (owner, v0.992a: "incorporated to sidekick everywhere same way as
// nominal"). In Sightline's stance FIRE is whole again (the scope is its AIM
// switch), with AIM keeping its place at the ring's bottom end; the cluster
// is laid out again when the stance changes (syncAimFire, on the HUD tick).
const aimFireWanted=()=>!!weaponInfo(sim.weapon)?.adsFire&&!(sim.weapon==='sightline'&&sim.sightline?.crouched);
let aimFireShown=null;
function syncAimFire(){const on=aimFireWanted();if(on===aimFireShown)return;aimFireShown=on;aimFireButton.hidden=!on;arrangeTouchCluster();}
// The home screen's tutorial runs the basics; Gamemodes > Tutorial runs a weapon's own course.
let tutorialCourse=params.get('course')==='basics'?'basics':null;
const courseFor=weapon=>tutorialCourse==='basics'?'basics':weapon;
if(map.training&&tutorialCourse==='basics')sim.weapon=DEFAULT_WEAPON;
let tutorial=map.training?new Tutorial(courseFor(sim.weapon)):null, tutorialSaved=false, settingsOpen=false;
const tutorialCard=createTutorialCard();
let inputOverride=null;
try{inputOverride=sessionStorage.getItem('deadstab-controls-override');}catch{}
const inputPreference=createInputPreference(detectedInput,inputOverride);
let touchPrompts=inputPreference.surface==='touch';
let view;
try { view = new WorldView($('world'), map, settings.quality); view.motion = settings.motion; view.critters = sim.critters || null; }
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
 // Team modes: the vertical stats panel beside the card (again: it goes).
 viewStats:()=>{if(statsPanel.open&&statsFrom==='death')closeStats();else openStats('death');},
 // FORFEIT (owner, 2026-09-29): SOLO the robots take the match at once;
 // online your vote (again: taken back); a team goes when everyone on it
 // (robots do not vote) has voted, 1V1 at once.
 forfeit:()=>{if(online.active){online.forfeit(!myForfeitVote());syncDeathCard(true);}else duel.forfeit();},
});
// Which death card: practice, online-practice, ffa, duel (1V1: online and
// SOLO) or team (2V2, 3V3, 4V4, 2V2V2), death-screen.js.
function deathMode(){
 if(online.active){const m=online.match();return m?.mode==='practice'?'online-practice':!m?.elimination?'ffa':m.mode==='1v1'?'duel':'team';}
 if(duel.active)return duel.ffa?'ffa':duel.config?.mode==='1v1'?'duel':'team';
 return 'practice';
}
function beginDeath(){
 if(deathActive)return;
 // (Your own fall takes the camera from a kill you were watching.)
 endAftermath();
 // 1V1: the zoom onto your body is not slid aside for the card (owner: "a
 // quick pop up on the screen ... without wasting time moving the whole death
 // menu to the right").
 view.deathAside=deathMode()!=='duel';
 damageIndicator.clear();
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
// The touch AIM button is a switch for Sightline's rifle, in the stance
// (owner, v0.990a: "the aim button should toggle the zoom out, not tap to
// hold"; v0.992a: "that's just for sightline sniper"): tap on, tap off; it
// lets go by itself on standing up, a weapon change, death or pause. Every
// other AIM is held: the Sidekick, Sightline's Sidekick (standing), the
// Nominal and Ballast (and AIM + FIRE); Ichor's GUARD, a reaction, too.
const aimSwitch=()=>sim.weapon==='sightline'&&!!sim.sightline?.crouched;
let aimToggled=false,aimPressSwitched=false;
const aimingNow=()=>weaponAiming(sim.weapon,rifleAiming||aimToggled,keys);
function setAimToggle(on){
 aimToggled=!!on;
 const button=$('touch-stream');if(button)button.dataset.toggled=on?'on':'';
}
const aimDamping=createAimDamping();
// Sightline's stance without a mouse (weapons/stance-aim.js): crouched behind
// the rifle you cannot walk, so the walking controls (the move stick; WASD and
// the arrows) steer the laser's end instead. A mouse aims as ever; moving it
// takes the aim back from the keys.
const stanceAim=createStanceAim();
function stanceSteering(){return sim.weapon==='sightline'&&!!sim.sightline?.crouched&&!sim.player.dead&&(touchPrompts||inputMode!=='mouse');}
function stanceOnScreen(x,z){const s=view.screenPoint(x,z,SIGHTLINE.roundHeight),w=viewWidth(),h=viewHeight(),m=STANCE_AIM.margin;return s.x>=m&&s.y>=m&&s.x<=w-m&&s.y<=h-m;}
// The point stays on screen: a move that would take it off keeps whichever
// half of it stays on (so it slides along the edge), and a point that starts
// off screen (the stance taken aiming far out) comes in toward you.
function keepStanceOnScreen(fromX,fromZ){
 const st=stanceAim;if(stanceOnScreen(st.x,st.z))return;
 if(stanceOnScreen(st.x,fromZ)){st.z=fromZ;return;}
 if(stanceOnScreen(fromX,st.z)){st.x=fromX;return;}
 if(stanceOnScreen(fromX,fromZ)){st.x=fromX;st.z=fromZ;return;}
 const p=sim.player;
 for(let i=0;i<24&&!stanceOnScreen(st.x,st.z);i++){st.x=p.x+(st.x-p.x)*.88;st.z=p.z+(st.z-p.z)*.88;}
}
// The enemies the stance's aim can know about: alive, seen (sight rays), and
// scoped, inside the scope's view (others are hidden then).
function stanceBodies(){
 const p=sim.player,scoped=!!sim.sightline?.aiming,out=[];
 for(const t of lockPool()){
  if(t.hp!==undefined&&t.hp<=0)continue;
  if(Math.hypot(t.x-p.x,t.z-p.z)>90||(scoped&&!inSightCone(p,t.x,t.z))||!sim.canSeeTarget(t.x,t.z))continue;
  out.push({id:t.id,x:t.x,z:t.z,vx:t.vx||0,vz:t.vz||0});
 }
 return out;
}
// A swipe on the world in the stance, with aim assist (owner, v0.992a: "like
// swiping on right side of screen swaps aim to whatever's in that direction,
// like regular mobile aim"): the enemy that way on screen from the laser's
// end (within 50 degrees of the swipe; the nearest, straighter ahead
// preferred), glided onto (stance-aim.js glideTo). None that way: false.
function pickStanceTarget(dx,dy){
 if(!stanceAim.on)stepStanceAim(stanceAim,{player:sim.player,dt:0});
 const from=view.screenPoint(stanceAim.x,stanceAim.z,SIGHTLINE.roundHeight),len=Math.hypot(dx,dy)||1,w=viewWidth(),h=viewHeight();
 let best=null,score=Infinity;
 for(const b of stanceBodies()){
  if(b.id===stanceAim.focus&&Math.hypot(b.x-stanceAim.x,b.z-stanceAim.z)<1.2)continue;
  const at=view.screenPoint(b.x,b.z,.6);if(at.x<0||at.y<0||at.x>w||at.y>h)continue;
  const vx=at.x-from.x,vy=at.y-from.y,d=Math.hypot(vx,vy);if(d<12)continue;
  const cos=(vx*dx+vy*dy)/(d*len);if(cos<Math.cos(50*Math.PI/180))continue;
  const sc=d*(2-cos);if(sc<score){score=sc;best=b;}
 }
 if(!best)return false;
 glideTo(stanceAim,best.id);return true;
}
// A finger dragged on the world in the stance moves the point like a
// trackpad (by as far as the finger moves on screen), from where it is.
function dragStanceAim(dx,dy){
 if(!stanceAim.on)stepStanceAim(stanceAim,{player:sim.player,dt:0});
 const at=view.screenPoint(stanceAim.x,stanceAim.z,SIGHTLINE.roundHeight),a=view.aim(at.x,at.y,sim.player),b=view.aim(at.x+dx,at.y+dy,sim.player);
 if(!Number.isFinite(a.aimPointX)||!Number.isFinite(b.aimPointX))return;
 const fx=stanceAim.x,fz=stanceAim.z;
 stanceAim.x+=b.aimPointX-a.aimPointX;stanceAim.z+=b.aimPointZ-a.aimPointZ;
 stepStanceAim(stanceAim,{player:sim.player,dt:0});keepStanceOnScreen(fx,fz);
}
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
if(import.meta.env.DEV&&params.get('capture')==='thumbnail')window.__capture={view,sim,map,get bots(){return bots;},get duel(){return duel;}};
// Development only: the robots, for tools and the console.
if(import.meta.env.DEV){window.__bots=bots;window.__duel=duel;window.__sim=sim;window.__stanceAim=stanceAim;window.__stanceBodies=()=>stanceBodies();window.__pickStance=(dx,dy)=>pickStanceTarget(dx,dy);window.__weaponPick=()=>weaponPick;}
view.onClatter = type => sound.clatter(type);
view.onBloodSound=(kind,x,z)=>sound.event({type:kind==='step'?'bloodStep':'bloodPool',x,z},hearingLevel(Math.hypot(x-sim.player.x,z-sim.player.z)));
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
 let at=bots.youSpot(sim)||(mate&&bots.spot(mate.sim.player,2.5,6))||openSpot(map,sim.colliders,{others:bots.living().map(b=>b.sim.player),space:bots.apart||14})||openSpot(map,sim.colliders,{others:bots.living().map(b=>b.sim.player),space:14});
 // SOLO FFA with the storm closing: inside its safe circle (duel.js safeSpawn).
 if(at&&duel.active)at=duel.safeSpawn(at)||at;
 if(!at)return false;
 const aim={aimX:sim.player.aimX,aimZ:sim.player.aimZ};sim.respawn(at);Object.assign(sim.player,aim);previousPlayer={...sim.player};
 return true;
}
async function start(weapon=sim.weapon,course) {
  if (started) return;
  if(course!==undefined)tutorialCourse=course;
  sim.weapon=map.training&&tutorialCourse==='basics'?DEFAULT_WEAPON:playableOr(weaponOrDefault(weapon));
  sim.player.stamina=sim.maxStamina;
  if(map.training){tutorial=new Tutorial(courseFor(sim.weapon));tutorialSaved=false;tutorialCard.invalidate();sim.reset();}
  else if(randomPracticeSpawn())view.cutCamera?.();
  applyInputPreference();
  // On a touchscreen a game goes full screen (hides the address bar and
  // toolbars) when the browser allows it and the setting is on.
  if(touchPlay()){if(settings.fullscreen)enterFullscreen();}
  // (PC: V goes full screen and back, v0.999a; nothing goes full screen by itself.)
  started = true; running = true; document.body.classList.add('playing');
  $('intro').classList.add('hidden'); ['weapon', 'reticle'].forEach(id => $(id).classList.remove('hidden'));
  $('world').focus();
  // 1V1: the URL carries the choices (menu.js); one robot, no targets.
  {const q=launchParams();if(!map.training&&q.get('mode')==='duel'){duel.begin(readDuel(q.get('duel'))||{});if(duel.placeDuel()||(hasAuthoredSpawns(map)&&randomPracticeSpawn())){view.cutCamera?.();previousPlayer={...sim.player};}/* s2-spawns: you to your base / an FFA point */modeLabel.textContent=(DUEL_MODES[duel.config?.mode]?.name||'1V1');}}
  if(tutorial){$('tutorial-guide').classList.remove('hidden');updateTutorial();}
  try { await sound.start(); if (paused) sound.suspend(true); }
  catch (error) { console.warn('Audio unavailable:', error); }
}

// Full screen: a touch game goes in by itself where the browser can
// (mobile-browser.js); a PC only with V (the key can be changed in Settings >
// Controls), which goes in with Ctrl+W and co. held where the browser can
// (ui/key-lock.js) and back out (v0.999a, owner: the Fullscreen / Windowed
// setting and the shortcut lock option are gone). Not while typing in a field.
const touchPlay=()=>matchMedia('(pointer: coarse)').matches&&!matchMedia('(any-pointer: fine)').matches;
window.addEventListener('keydown',e=>{
 if(e.repeat||gameCode(e.code)!=='KeyV'||e.ctrlKey||e.metaKey||e.altKey||e.target.matches?.('input,select,textarea,[contenteditable=true]'))return;
 e.preventDefault();
 if(document.fullscreenElement||document.webkitFullscreenElement)leaveFullscreen();
 else void playFullscreen(true);
},true);
function returnToMenu(){
  online.close();perfReadout.reset();devWindow.hide();bots.clear();if(deathPick){deathPick=false;weaponPick.hide();}nextWeapon=null;if(duel.active){duel.stop();modeLabel.textContent='PRACTICE';}
  if(choosing)menuFlow.cancelOnlinePick();choosing=false;lastKiller=null;lastOneShot=false;onlineMenus(false);view.deathView?.clear();
  endAftermath();matchEnd.hide();closeStats();clockRoll=null;view.deathAside=true;
  // (Owner, 2026-09-29: leaving right after a game starts, ROUND 1 and other
  // game pop-ups showed over the menu for a moment.) Every in-game pop-up goes now.
  roundPopup.classList.remove('show');roundShown='';scoreFlash.hide();stopSpectate();damageFeedback.clear();outgoingFeedback.clear();damageIndicator.clear();
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
  if(aimToggled)setAimToggle(false);resetStanceAim(stanceAim);
  touchAimPointer=null;
  rifleFiring=false;rifleAiming=false;firePointer=aimPointer=null;sim.shotgun.trigger=false;sim.shotgun.suppress=false;
  keys.clear(); tappedKeys.clear(); pendingQuickShot=false; pendingSeed = false; pendingLaunch = false; pendingAimPoint = null;
  touch.moveX = touch.moveZ = touch.aimX = touch.aimZ = 0; touchMove.x = touchMove.z = 0; touch.seeding = false;
  for (const stick of sticks.values()) { stick.pointer = null; stick.knob.style.transform = ''; stick.element.classList.remove('engaged'); }
}

function setPaused(value) {
  // (Not over the end card, nor while you watch your kill: 1V1's aftermath.)
  if (!started || deathActive || value === paused || duel.resultOpen || matchEnd.open || aftermath) return;
  if (value) layoutPauseMenu();
  paused = value; running = !value && !choosing; releaseInput();
  $('pause-panel').classList.toggle('hidden', !value); $('reticle').classList.toggle('hidden', value);
  document.body.classList.toggle('paused', value); sound.suspend(value); dirty = true;
  if (value) $('resume').focus(); else $('world').focus();
  updateHUD();
}

function reset() {
  damageIndicator.clear();
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
  duel.reset();bots.resetStats?.();if(duel.active)duel.placeDuel();
  previousPlayer = { ...sim.player }; dirty = true; devTools.syncSpeed();updateHUD();
  if(tutorial&&started)$('tutorial-guide').classList.remove('hidden');
}

// A graphics preset change (renderer.js changeQuality): a small note while
// the new shaders build, the last frame held on screen meanwhile. It waits two
// frame first (and a task) so the note is on screen before the preset work.
// (v0.999a: the loading wheel over the screen, busy-screen.js, where there was
// an APPLYING GRAPHICS note over a world that went blank while it was rebuilt.)
let graphicsChanges=0;
function changeGraphics(name){
 // (Held from now: no frame is queued for the GPU while the note paints.)
 view.wantedQuality=name;view.holdRender=true;graphicsChanges++;showBusy();
 // (A last guard, v0.999a: whatever happens, the world is drawn again and the
 // note goes within 20 s; the preset is already applied by then.)
 clearTimeout(changeGraphics.guard);changeGraphics.guard=setTimeout(()=>{if(!graphicsChanges)return;while(graphicsChanges>0){graphicsChanges--;hideBusy();}view.holdRender=false;dirty=true;},20000);
 requestAnimationFrame(()=>setTimeout(()=>{
  view.changeQuality(view.wantedQuality).catch(error=>console.error(error)).finally(()=>{
   if(graphicsChanges>0){graphicsChanges--;hideBusy();}
   adaptiveResolution.reset();dirty=true;
  });
 },0));
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
  if(inputMode==='mouse'&&!stanceSteering()&&p.assistTargetId==null&&!(targetLock.id!==null&&lockMode())){
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
 if(stanceSteering())return false; // (the stance: see stance-aim.js)
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
 {const scores=$('scores-toggle'),want=!(online.active||(duel.active&&started));if(scores&&scores.hidden!==want)scores.hidden=want;}
  // The health bar has its own per-frame update in the frame loop, because the
  // tremble needs every frame; calling it again on the 80ms HUD tick was pure
  // duplication.
  updateWeaponHUD(sim,touchPrompts);$('hex-recharge').classList.remove('hidden');
  // (The brackets' own frame update decides who shows them: the Nominal, the
  // Sidekick and Sightline's pistol. This 80 ms tick used to hide them for
  // every weapon but the Nominal, so on a phone the Sidekick's brackets
  // blinked about twelve times a second: owner, v0.990a. It only puts them
  // away when the game is not running.)
  if(!running)aimOverlay.showSpread(false);
  syncAimFire();
  abilityHUD.update(sim);
  const count = sim.seeds.length;
  $('reticle').classList.toggle('loaded', count > 0);
  setText($('fps-counter'), paused ? 'PAUSED' : (measuredFPS || '—') + ' FPS');
  if (import.meta.env.DEV) writeDebugState($('world'), { sim, view, sound, settings, running, paused, measuredFPS, inputMode });

}

const sheathScreen=createSheathScreen();
function event(e) {
  // The danger zone blinks out on the shot itself: the cone is a warning, and
  // once the shell is away there is nothing left to warn about for a moment.
  // Both cones blink off on the shot, so the zone reads as a statement about
  // the next round rather than a light left on. The rifle's is shorter: it
  // fires six times a second and a long blink would just look like flicker.
  if(e.type==='shotgunShot')coneFlicker=.12;
  if(e.type==='rifleShot')coneFlicker=.055;
  // The storm's bites: none of the damage readouts (owner, 2026-09-29), only
  // its own sound (stepStormScreen) and the health bar.
  if(e.type==='playerDamage'&&e.storm){stormDose+=e.damage;return;}
  if(e.type==='playerDamage'){damageFeedback.add(e.damage,sim.time);if(e.damageType!=='ichorCost')damageIndicator.hit(e,view);buzz(e.damage>=8?HAPTICS.heavy:HAPTICS.hurt,{enabled:settings.vibration,touch:touchPrompts});}
  if(e.type==='kill'&&e.targetKind!=='player')buzz(HAPTICS.kill,{enabled:settings.vibration,touch:touchPrompts});
  if(e.type==='outgoingDamage')outgoingFeedback.add(e,sim.time);
  // You killed a player (or a robot): KILL where they fell.
  if(e.type==='kill'&&(e.targetKind==='player'||e.targetKind==='robot'))outgoingFeedback.kill(e,sim.time);
  if(e.type==='syphon')outgoingFeedback.heal(e,sim.time);
  // Sheath's Draw-cut: a white streak across the screen, yours or cutting you.
  if((e.type==='sheathDrawCut'&&e.id===sim.player.id)||(e.type==='playerDamage'&&e.damageType==='bladeDraw')){
   const a=view.screenPoint(sim.player.x,sim.player.z),b=view.screenPoint(sim.player.x+(e.dx??e.directionX??1),sim.player.z+(e.dz??e.directionZ??0));
   sheathScreen.streak(Math.atan2(b.y-a.y,b.x-a.x));
  }
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
  // In Sightline's stance a tap fires along the laser, wherever it lands.
  if (stanceSteering()) { pendingAimPoint = null; return; }
  // Locked on: a tap fires at the locked target, not at the tapped spot.
  if (targetLock.id !== null && lockMode()) { pendingAimPoint = null; return; }
  inputMode = 'mouse'; setCursorTarget(x, y);
  pendingAimPoint = view.aim(x, y, sim.player);
}
// Target lock (target-lock.js) for players without a mouse: on touch (unless
// aim assist is off in Settings > Mobile) and for keyboard-only aim.
const targetLock=createTargetLock();
let pendingSwap=null,swipeFrom=null;
function lockMode(){ if(stanceSteering())return false; return touchPrompts ? !!settings.aimAssist : inputMode!=='mouse'; }
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
 if(sim.weapon==='sightline'&&sim.sightline?.crouched)return; // (the arrows steer the laser)
 pendingSwap={x:code==='ArrowRight'?1:code==='ArrowLeft'?-1:0,y:code==='ArrowDown'?1:code==='ArrowUp'?-1:0};
});
let touchAimStart = null;



$('world').tabIndex = 0;
// Developer tools (ui/dev-wiring.js).
// Dev-only first person (Developer tools > Display > First-person view;
// keyboard and mouse only). See fps-mode.js.
const fpsLook=createFpsLook();
const fpsOn=()=>!!sim.dev.fps&&!touchPrompts;
const fpsInput=installFpsInput({world:$('world'),look:fpsLook,active:()=>fpsOn()&&running&&!deathActive,
 onUnlock:()=>setTimeout(()=>{if(fpsOn()&&running&&!deathActive)setPaused(true);},60)});
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
 const cacheKey='deadstab-thumbnail-'+map.id;
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
// SCORES (touch; keyboard players hold Tab): the same stats panel as Tab,
// online and against robots (owner, 2026-09-29: the scoreboard only when asked for).
$('scores-toggle').onclick=()=>{if(statsFrom==='tab')closeStats();else if(!statsFrom)openStats('tab');};
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
 chooseMap:id=>{if(online.moveRoom(id))toast('MOVING THE ROOM TO '+(mapById(id).name||id).toUpperCase(),3000);},
 leave:()=>$('main-menu').click(),
 copyInvite:()=>online.copyInvite(),
 map,// s2-spawns: the lobby's map list
});
const weaponPick=createWeaponPick($('game'),{
 pick:weapon=>{if(online.active)online.choose(weapon,false);},
 go:weapon=>{if(online.active){online.choose(weapon,true);weaponPick.hide();}else if(deathPick){nextWeapon=playableOr(weaponOrDefault(weapon));closeDeathPick();toast('NEXT LIFE · '+(weaponInfo(nextWeapon)?.name||'').toUpperCase(),1800);}else changeWeaponSolo(weapon);},
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
 sim.weapon=playableOr(weaponOrDefault(weapon));sim.respawn({x:p.x,z:p.z});Object.assign(sim.player,aim);
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
 if(statsFrom==='death')closeStats();
 stopSpectate();
 // Nothing from the last life pops up in the new one.
 damageFeedback.clear();outgoingFeedback.clear();damageIndicator.clear();
 if(lobbyFrom==='death')closeLobby();
 view.deathView?.release();
}
// Elimination (v0.999a): SOLO 1V1/2V2/3V3 and every multiplayer mode but FFA
// and practice. Nobody respawns alone; the fallen watch a teammate.
function eliminationNow(){return online.active?!!online.match()?.elimination:duel.active&&!duel.ffa;}
// The stats panel (ui/stats-panel.js, Task C's): VIEW STATS on a team death
// card ('death': to the left, the card on the right stays usable), and by
// itself for the one who took a 1V1 round ('aftermath': in the middle, their
// number turning over in it).
const statsPanel=createStatsPanel($('game'));
let statsFrom=null,statsAt=0;
// The round score over the table: each side and its points (null in FFA and practice).
function statsSides(){
 if(online.active){const m=online.match();return m?.elimination&&m.sides?m.sides.map(t=>({id:t.id,name:t.team?String(t.name).toLowerCase():t.name,colour:t.colour||null,points:t.points})):null;}
 if(!duel.active||duel.ffa)return null;
 const team=DUEL_MODES[duel.config?.mode]?.allies>0,sc=duel.score;
 return [{id:'you',name:team?'your team':'you',colour:team?TEAMS[1].colour:null,points:sc.you},{id:'robot',name:team?'enemies':'robot',colour:team?TEAMS[0].colour:null,points:sc.robot}];
}
// Everyone's line: online the host's scoreboard; SOLO the robots' match
// (BotMatch statsRows), or until it has one, the names and sides alone.
function statsRows(){
 if(online.active)return online.scoreboard();
 const rows=bots.statsRows?.(sim,'YOU');if(rows)return rows;
 const team=DUEL_MODES[duel.config?.mode]?.allies>0,line=(id,name,side,robot,weapon,present)=>({id,name,team:team?side:null,robot,kills:0,deaths:0,dealt:0,taken:0,time:0,weapon,present});
 return [line('you','YOU','blue',false,sim.weapon,true),...bots.bots.map(b=>line(b.id,b.name,b.team,true,b.sim.weapon,b.alive))];
}
function statsOpts(extra){return {rows:statsRows(),myId:online.active?online.myId:'you',mode:online.active?online.match()?.mode:duel.config?.mode||null,sides:statsSides(),final:false,place:statsFrom==='death'||(deathActive&&deathMenuOpen)?'left':'center',...extra};}
function openStats(from,extra={}){statsFrom=from;statsAt=0;statsPanel.show(statsOpts(extra));deathScreen.setStats(from==='death');}
function closeStats(){if(!statsFrom&&!statsPanel.open)return;statsPanel.hide();statsFrom=null;deathScreen.setStats(false);}
// VIEW STATS' panel follows the match a few times a second.
function refreshStats(dt){if((statsFrom!=='death'&&statsFrom!=='tab')||!statsPanel.open||(statsAt+=dt)<.25)return;statsAt=0;statsPanel.update(statsOpts());}
// 1V1's aftermath for the one who took the round (owner, 2026-09-29: "after
// any kill in 1v1, it should show the aftermath for a solid 3 seconds ... and
// same for the winning player"): hands off, the camera eases onto the body
// and zooms in (renderer.js `aftermath`, death-view.js killCamFrame); at 3 s
// the stats panel opens by itself with your number turning over in it ("the
// player who does the killing gets the point update first ... within the menu
// that shows stats"), until both are back. (SOLO's last kill: the end card.)
let aftermath=null;
function startAftermath(key,at){
 if(aftermath?.key===key||!at)return;
 aftermath={key,x:at.x,z:at.z,start:elapsed,panel:false};view.aftermath=aftermath;
 running=false;releaseInput();document.body.classList.add('aftermath');
}
// The storm (storm.js) on screen and in your ears: the safe circle and its
// tension for the view, the readout, the in-storm voice (rising with what it
// has taken from you this time, `stormDose`) and, near the end, a heartbeat.
let stormDose=0,stormPulseAt=0;
const stormHud=createStormHud($('game'),document.querySelector('#game .health-hud')||$('game'));
function stepStormScreen(dt){
 const now=started?(online.active?online.stormNow():duel.stormNow()):null;
 const circle=now?stormAt(now.plan,now.t):null,phase=now?stormPhase(now.plan,now.t):null;
 const m=online.active?online.match():null,ffa=!!now&&now.plan.kind==='ffa';
 const end=ffa?(m?.timed?m.left:online.active?null:duel.left):null;
 // FFA: winds up over its final stretch; team rounds: the final zone a little, sudden death fully.
 const tension=!phase?0:ffa?(phase.phase==='closing'?0:Math.max(.25,Math.min(1,1-(end??STORM.ffaHold)/STORM.ffaHold))):phase.phase==='final'?.3:phase.phase==='sudden'?1:0;
 view.setStorm(circle,tension,now?{x:now.plan.x1,z:now.plan.z1,r:now.plan.r1}:null);
 const total=!phase?0:phase.phase==='closing'?now.plan.close:phase.phase==='final'?(ffa?STORM.ffaHold:now.plan.hold):now.plan.sudden;
 stormHud.update(running||deathActive?phase:null,{end,tension,total});
 const me=sim.player,inside=!!circle&&started&&!paused&&!me.dead&&me.hp>0&&inStorm(circle,me.x,me.z);
 if(!inside)stormDose*=Math.exp(-dt*1.2);
 sound.stormVoice(inside,Math.min(1,stormDose/45));
 if(tension>.2&&started&&!paused&&(stormPulseAt-=dt)<=0){stormPulseAt=1.35-tension*.8;sound.pulse(.4+tension*.6);}
 // Bolts that struck near you crack (quieter further off; a few at most a frame).
 let zapped=0;for(const z of view.stormView?.takeZaps?.()||[]){const d=Math.hypot(z.x-me.x,z.z-me.z);if(d<16&&zapped++<2&&started&&!paused)sound.zap(z.size*(1-d/16));}
}
function endAftermath(){
 if(!aftermath)return;
 aftermath=null;view.aftermath=null;document.body.classList.remove('aftermath');
 if(statsFrom==='aftermath')closeStats();
}
// (Owner, 2026-09-29: "dont show [the scoreboard] for a player after winning,
// only show it if a player hits tab": the winner's number turns over on the
// top score as the round is won (duel.js, syncClockRoll) instead of in a
// panel that opened by itself.)
function stepAftermath(){}
// Online 1V1: the match clock keeps the old number through the break and
// turns it over as both come back (as duel.js does SOLO's).
let clockRoll=null;
const clockNumber=side=>side==null?null:document.querySelector(`#match-clock [data-side="${CSS.escape(String(side))}"] b`);
function syncClockRoll(m){
 if(m?.phase==='playing'&&m.elimination&&m.mode==='1v1'&&m.roundBreak>0&&m.roundWinner!=null){
  const key=m.number+':'+m.played;
  if(clockRoll?.key!==key){const to=(m.sides||[]).find(t=>t.id===m.roundWinner)?.points;clockRoll=Number.isFinite(to)?{key,side:m.roundWinner,from:Math.max(0,to-1),to,now:m.roundWinner===online.myId||roundsDecided((m.sides||[]).map(t=>t.points),m.played,m.rounds)}:null;}
  // (The one who took it: turned over at once; the one who fell: held till both
  // are back; the deciding point: at once for both, nobody comes back.)
  const b=clockNumber(clockRoll?.side);
  if(b&&clockRoll.now){if(!clockRoll.done){b.innerHTML=rollHTML(clockRoll.from,clockRoll.to);clockRoll.done=true;}}
  else if(b&&b.textContent!==String(clockRoll.from))b.textContent=clockRoll.from;
 }else if(clockRoll){const b=clockNumber(clockRoll.side);if(b&&!clockRoll.now)b.innerHTML=rollHTML(clockRoll.from,clockRoll.to);clockRoll=null;}
}
// Where everyone else was last drawn (the one who fell: the kill's place).
const lastSeen=new Map();
// FORFEIT online: your vote is in; the card shows your side's count.
function myForfeitVote(){const m=online.match(),side=online.myTeam||online.myId;return !!m?.forfeit?.[side]?.includes(online.myId);}
let forfeitShown='',forfeitAt=0;
function syncDeathCard(force=false,dt=0){
 if(!deathActive||!deathMenuOpen||!online.active||!['duel','team'].includes(deathScreen.mode))return;
 if(!force&&(forfeitAt+=dt)<.2)return;forfeitAt=0;
 const m=online.match(),mine=online.myTeam,votes=(m?.forfeit?.[mine||online.myId]||[]).length;
 const needed=mine?online.lobby().players.filter(p=>!p.robot&&p.team===mine).length:1,voted=myForfeitVote(),key=votes+'/'+needed+':'+voted;
 if(key!==forfeitShown||force){forfeitShown=key;deathScreen.setForfeit(votes,Math.max(1,needed),voted);}
}
// The end of a match (ui/match-end.js): one card online and SOLO.
const matchEnd=createMatchEnd($('game'),{act:id=>{
 if(id==='ready'){const m=online.match();online.setReady(!(m?.ready||[]).includes(online.myId));}
 else if(id==='leave'||id==='quit')$('main-menu').click();
 else if(id==='lobby')online.endRound();
 // START: a new match, same settings, at once (the old REMATCH).
 else if(id==='start'){matchEnd.hide();clearDeath();reset();running=true;paused=false;sound.suspend(false);$('world').focus();updateHUD();}
 // CHANGE SETTINGS: the bots page, its picks as they were; its START resumes.
 else if(id==='settings'){matchEnd.hide();returnToMenu();if(menuFlow.showPage)menuFlow.showPage('duel');else $('duel-mode')?.click();}
}});
function showSoloEnd(outcome){
 closeStats();
 const {title,detail}=soloOutcome(outcome);
 matchEnd.show({title,detail,rows:statsRows(),myId:'you',mode:outcome.mode,buttons:[{id:'start',label:'PLAY',primary:true},{id:'settings',label:'CHANGE SETTINGS'},{id:'quit',label:'QUIT'}]});
}
// Online: the card while the host's round is on 'results' (READY n/m, the
// host's LOBBY, LEAVE); it goes by itself when the round moves on.
function syncMatchEnd(m){
 if(m?.phase!=='results'||!m.results){if(matchEnd.open)matchEnd.hide();return;}
 if(!matchEnd.open){
  clearDeath();endAftermath();closeStats();scoreFlash.hide();mpHud.hideBoard();closeLobby();
  if(paused){paused=false;$('pause-panel').classList.add('hidden');document.body.classList.remove('paused');}
  for(const id of ['settings-panel','map-panel'])$(id).classList.add('hidden');settingsOpen=mapOpen=false;
  running=false;releaseInput();
 }
 const myId=online.myId,ready=m.ready||[],people=online.lobby().players.filter(p=>!p.robot).length||1;
 const {title,detail}=onlineOutcome(m.results,{myId,myTeam:online.myTeam});
 matchEnd.show({title,detail,rows:m.results.board||[],myId,mode:m.mode,buttons:[{id:'ready',label:readyLabel(Math.min(ready.length,people),people),pressed:ready.includes(myId),primary:true},...(online.isHost?[{id:'lobby',label:'LOBBY'}]:[]),{id:'leave',label:'LEAVE'}]});
}
const spectate=createSpectate($('game'));
let spectatePrev=null;
// Your living teammates, in a steady order: SOLO your robots; online your side.
function spectateMates(){
 if(online.active){const mine=online.myTeam;if(!mine)return [];return (online.others(1)||[]).filter(o=>o.team===mine&&!(o.hp<=0)).map(o=>({id:o.id,name:o.name||'teammate',x:o.x,z:o.z,colour:teamById(o.team)?.colour}));}
 return bots.bots.filter(b=>b.team==='blue'&&b.alive&&!b.sim.player.dead).map(b=>({id:b.id,name:b.name,x:b.sim.player.x,z:b.sim.player.z,colour:TEAMS[1].colour}));
}
const scoreFlash=createScoreFlash($('game'));
// A click or tap on the world while spectating (it shows behind the death
// screen, which is over it: anywhere but its card): the next teammate.
$('world').addEventListener('pointerdown',()=>{if(spectate.open&&deathActive)spectate.step(1);});
deathScreen.root.addEventListener('pointerdown',e=>{if(spectate.open&&deathActive&&!e.target.closest('.death-card'))spectate.step(1);});
function stopSpectate(){if(spectate.open)spectate.hide();spectatePrev=null;view.spectating=false;document.body.classList.remove('watching');}
// Each frame: a moment after the death screen comes up (while a teammate
// stands) the world behind it follows that teammate (owner: "the spectate
// should happen behind the death screen, not replace it"); between points
// the score flashes up, big, with the number that changed rolling over.
// The round, in the middle for about 2.4 s each time everyone comes back
// (owner: "after each respawn ... a popup in center screen ... round 1 or
// round 12"), round 1 as a match starts.
const roundPopup=document.createElement('div');roundPopup.className='round-popup';roundPopup.setAttribute('role','status');roundPopup.setAttribute('aria-live','polite');$('game').append(roundPopup);
let roundShown='';
function showRound(key,n){
 if(key===roundShown)return;roundShown=key;
 roundPopup.innerHTML=`<small>${online.active?(MODES.find(m=>m.id===online.match()?.mode)?.name||''):(DUEL_MODES[duel.config?.mode]?.name||'')}</small>round ${n}`;
 roundPopup.classList.remove('show');void roundPopup.offsetWidth;roundPopup.classList.add('show');
}
function updateSpectate(dt=0){
 const elim=started&&eliminationNow();
 stepAftermath();refreshStats(dt);syncDeathCard(false,dt);
 // Up and playing: the round's popup once per round.
 if(elim&&!deathActive&&!sim.player.dead&&sim.player.hp>0&&!choosing){
  if(online.active){const m=online.match();if(m?.phase==='playing'&&online.me?.present)showRound('o'+m.number+':'+(m.round||1),m.round||1);}
  else if(!duel.pointBreak&&!duel.over&&!aftermath)showRound('d'+duel.config?.mode+':'+duel.score.you+':'+duel.score.robot+':'+duel.round,duel.round);
 }
 if(!elim)roundShown='';
 // (Team modes only: in 1V1 there is nobody on your side to watch.)
 const watching=elim&&deathActive&&deathMenuOpen&&deathScreen.mode==='team'&&deathElapsed>=DEATH_MENU_DELAY+SPECTATE_AFTER&&!duel.resultOpen&&!choosing;
 const mates=watching?spectateMates():[];
 if(mates.length)spectate.update(mates);
 else if(spectate.open)stopSpectate();
 // Down in an elimination round: the world and the game's HUD go dull until you are back.
 document.body.classList.toggle('watching',elim&&deathActive&&deathElapsed>=DEATH_MENU_DELAY);
 // (The big score between points: team modes. 1V1 has the aftermath, the
 // stats panel's flip and the top score turning over instead: owner.)
 if(elim&&online.active){
  const m=online.match(),teams=document.querySelector('#match-clock .clock-teams');
  if(m?.phase==='playing'&&m.mode!=='1v1'&&m.roundBreak>0&&m.roundWinner!=null&&teams){
   const to=(m.sides||[]).find(t=>t.id===m.roundWinner)?.points;
   scoreFlash.show(m.number+':'+(m.sides||[]).map(t=>t.id+'='+t.points).join(','),{look:'match-clock',html:teams.outerHTML,changed:`[data-side="${CSS.escape(String(m.roundWinner))}"] b`,to});
   scoreFlash.countdown(m.roundBreak);
  }else scoreFlash.hide();
 }else if(elim){
  const b=duel.pointBreak;
  if(b?.side&&duel.config?.mode!=='1v1'){
   scoreFlash.show('duel:'+duel.score.you+':'+duel.score.robot,{look:'duel-score',html:duel.scoreElement.innerHTML,changed:b.side==='you'?'.duel-side.duel-you b':'.duel-side.duel-robot b',to:duel.score[b.side]});
   scoreFlash.countdown(b.left);
  }else scoreFlash.hide();
 }else scoreFlash.hide();
}
// SOLO: everyone back at full health at fresh spots (you first, a screen from
// nobody yet; then the robots, each away from the rest), your pick applied.
function newDuelRound(){
 if(deathPick){nextWeapon=weaponPick.selected||nextWeapon;deathPick=false;weaponPick.hide();}
 clearDeath();endAftermath();
 if(nextWeapon){sim.weapon=weaponOrDefault(nextWeapon);nextWeapon=null;applyInputPreference();}
 for(const bot of bots.bots)bot.alive=false;
 // (1V1: a new duel circle, you and the robot on its two spots.)
 if(!duel.placeDuel()){sim.respawn({x:map.spawn.x,z:map.spawn.z});randomPracticeSpawn();for(const bot of bots.bots)bots.respawnAt(bot,sim);}
 view.cutCamera();previousPlayer={...sim.player};accumulator=0;
 if(!paused&&!duel.resultOpen){running=true;sound.suspend(false);$('world').focus();}
 updateHUD();
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
 // The pick's view from high above; the lobby shows its own place (lobbyView).
 view.setPickView(picking?pickView(map):inLobby?lobbyView(map):null);
 // The death screen steps aside while picking or while its lobby is open.
 if(deathActive&&deathMenuOpen)deathScreen.root.classList.toggle('hidden',picking||inLobby||(lobbyPanel.open&&lobbyFrom==='death'));
 choosing=inLobby||picking;
 document.body.classList.toggle('mp-between',choosing||(!me.present&&!deathActive));
}
function enterOnline(){onlineMenus(true);syncOnlineScreens();}
// Loud enough to hear from anyone's gun; the rest stay with their owner.
const NET_SOUNDS=new Set(['sheathSwing','sheathClang','sheathSheathe','sheathRush','sheathRushEnd','sheathDrawBack','sheathDrawTell','sheathDrawDash','sheathDrawCut','ichorDeflect','ichorGuardStart','ichorSwing','ichorWave','ichorFrenzyStart','sidekickShot','sidekickRush','sidekickMine','sidekickReload','sidekickReloaded','sightlineShot','omenShot','omenVolley','omenBurst','omenPrime','omenMark','omenCurseBeat','omenFade','rifleShot','shotgunShot','launch','explosion','grenadeExplosion','propBreak','hexPulse','sprayStart','surgeCharge','surgeStart','scatterFire','scatterBurst']);
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
 if(deathActive&&me&&!online.match()?.elimination)deathScreen.setTimer(me.respawnIn,online.lobby().settings?.respawn||MATCH_SETTINGS.respawn.default);
 const m=online.match();
 mpHud.setMatch(m,myId);syncClockRoll(m);
 // 1V1: you took the round (the other one down): the aftermath.
 if(m?.phase==='playing'&&m.elimination&&m.mode==='1v1'&&m.roundBreak>0&&m.roundWinner===myId){
  const foe=(m.sides||[]).find(t=>t.id!==myId);
  if(!deathActive&&me?.present&&!me.dead)startAftermath('o'+m.number+':'+m.played,(foe&&lastSeen.get(foe.id))||sim.player);
 }else if(aftermath)endAftermath();
 // (The death screen that never came: you are down as the host has it, but
 // its playerDeath event was not seen here. The card still comes.)
 if(!deathActive&&started&&m?.phase==='playing'&&me?.present&&me.dead)beginDeath();
 syncMatchEnd(m);
 renderLobby();syncOnlineScreens();
 // Top left: where you are, map · mode (the round's mode, or the lobby).
 const phase=online.match()?.phase,modeText='MULTIPLAYER · '+(phase==='playing'||phase==='results'?(MODES.find(m=>m.id===online.match().mode)?.name||''):'LOBBY');
 if(modeLabel.textContent!==modeText)modeLabel.textContent=modeText;
}
function reviveOnline(){
 clearDeath();endAftermath();lastKiller=null;lastOneShot=false;view.cutCamera();previousPlayer={...sim.player};
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
 setQuality:name=>{if((view.wantedQuality??view.qualityName)!==name)changeGraphics(name);},
 setMotion:on=>{view.motion=on;},setFps:fps=>{budget.fps=fps;},
 setVolumes:volume=>sound.setVolumes(volume),
 changed:()=>{dirty=true;updateHUD();},
 // Settings > Graphics > AUTO: the preset device-tier.js picks for this device.
 autoQuality:()=>autoQuality(deviceTier.tier,settings.qualityAutoStep),
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
   if(stanceSteering()){
    const last=touchAimStart?.last||touchAimStart||{x:e.clientX,y:e.clientY};
    if(touchAimStart&&Math.hypot(e.clientX-touchAimStart.x,e.clientY-touchAimStart.y)>=TOUCH_TAP.slop)touchAimStart.dragged=true;
    // With aim assist a swipe picks the enemy that way (one per swipe, another
    // every TARGET_LOCK.swipeAgain px of a long drag); with none that way, or
    // assist off, the drag moves the laser's end like a trackpad.
    if(settings.aimAssist&&!touchAimStart?.trackpad){
     swipeFrom||={x:touchAimStart?.x??e.clientX,y:touchAimStart?.y??e.clientY};
     const sx=e.clientX-swipeFrom.x,sy=e.clientY-swipeFrom.y,need=swipeFrom.count?TARGET_LOCK.swipeAgain:TARGET_LOCK.swipe;
     if(Math.hypot(sx,sy)>=need){if(pickStanceTarget(sx,sy))swipeFrom={x:e.clientX,y:e.clientY,count:(swipeFrom.count||0)+1};else if(touchAimStart)touchAimStart.trackpad=true;}
     if(touchAimStart)touchAimStart.last={x:e.clientX,y:e.clientY};
     return;
    }
    dragStanceAim(e.clientX-last.x,e.clientY-last.y);
    if(touchAimStart)touchAimStart.last={x:e.clientX,y:e.clientY};
    return;
   }
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
   e.preventDefault();touchAimPointer=e.pointerId;inputMode='mouse';if(!lockMode()&&!stanceSteering())setCursorTarget(e.clientX,e.clientY);$('world').setPointerCapture(e.pointerId);
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
// Over the interface while playing, the pointer still only moves the
// weighted aim (no jump of the aim mark to the bare pointer); in a menu the
// ordinary pointer is shown and the aim waits where it was.
window.addEventListener('pointermove',e=>{
 if(e.pointerType!=='mouse'||!started)return;
 pointerOnUI=e.target!==$('world');
 if(pointerOnUI&&running){setCursorTarget(e.clientX,e.clientY);inputMode='mouse';}
},true);
// Clicking the interface is only ever a click on the interface. The press
// never reaches the world (buttons sit above it), focus stays on the world so
// Space and Enter keep meaning fire rather than pressing the button
// again, and a right click brings up no browser menu.
window.addEventListener('mousedown',e=>{
 if(running&&e.target!==$('world')&&e.target.closest?.('#game button'))e.preventDefault();
},true);
$('game').addEventListener('contextmenu',e=>{if(started)e.preventDefault();});
// (v0.999a, owner: "the weighted cursor should always become a regular
// cursor in game menu".) The game's cursor only while actually playing; any
// menu over the game (pause, settings, the map, a weapon pick, the death
// menu) gets the ordinary pointer, and the game's aim marks are hidden there.
function syncGameCursor(){
 const menu=!running||deathActive||choosing||!document.getElementById('settings-panel')?.classList.contains('hidden');
 const on=started&&!touchPrompts&&!menu&&!document.body.classList.contains('editing-touch-layout');
 if(document.body.classList.contains('game-cursor')!==on)document.body.classList.toggle('game-cursor',on);
 const pointer=started&&!touchPrompts&&menu;
 if(document.body.classList.contains('menu-pointer')!==pointer)document.body.classList.toggle('menu-pointer',pointer);
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
   // (The same stats panel as SOLO's; beside the death card while you are down.)
   e.preventDefault();if(!e.repeat&&(!statsFrom||statsFrom==='tab'))openStats('tab');return;
  }
  // SOLO vs robots: the same stats panel while Tab is held (BotMatch statsRows).
  if(e.code==='Tab'&&!online.active&&duel.active&&started&&!settingsOpen&&!mapOpen&&!paused&&!devDialog.isOpen&&!matchEnd.open&&(!statsFrom||statsFrom==='tab')){
   e.preventDefault();if(!e.repeat)openStats('tab');return;
  }
  if(lobbyPanel.open){navigateMenu(e,lobbyPanel.root,()=>closeLobby());if(['Space','Tab','KeyQ','KeyE','Escape','ArrowUp','ArrowDown'].includes(e.code))e.preventDefault();return;}
  if(devDialog.isOpen){devDialog.keydown(e);return;}
  // The end-of-match card (online and SOLO): the keys work its buttons.
  if(matchEnd.open){navigateMenu(e,matchEnd.root,()=>{});if(['Space','Tab','Escape','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();return;}
  if(deathActive){
   // Spectating: ← / → (A / D) switch teammate.
   if(spectate.open&&!deathPick&&['ArrowLeft','ArrowRight','KeyA','KeyD'].includes(e.code)){e.preventDefault();if(!e.repeat)spectate.step(e.code==='ArrowLeft'||e.code==='KeyA'?-1:1);return;}
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
window.addEventListener('keyup', e => {const was=e.key&&downAs.get(e.key.toLowerCase());if(was){downAs.delete(e.key.toLowerCase());const c=gameCode(was);if(c)keys.delete(c);keys.delete(was);}const code=gameCode(e.code);if(code)keys.delete(code);keys.delete(e.code);if(e.code==='Tab'&&mpHud.boardOpen)mpHud.hideBoard();if(e.code==='Tab'&&statsFrom==='tab')closeStats();});
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
  // (v0.999a) SOLO 1V1/2V2/3V3: while you are down the fight goes on (you
  // watch a teammate) until a side is out; your hands are off.
  // (1V1's aftermath too: the one who took the round watches it, hands off.)
  const soloWatch = !online.active && duel.active && (deathActive || !!aftermath) && started && !paused && !duel.resultOpen;
  const stepping = running || (online.active && started) || soloWatch;
  // Dev first person: body class, pointer let go outside play, the renderer told.
  { const on = fpsOn(); fpsInput.sync(on, running && !deathActive); if (on) seedFpsLook(fpsLook, sim.player); view.fpsLook = on ? fpsLook : null; }
  // The shape of this screen, for the robots' off-screen rule (a phone turns).
  const aspect = view.camera.aspect; bots.viewAspect = aspect; sim.viewAspect = aspect; online.session?.setAspect?.(aspect);
  if (stepping) {
    // Dev game speed stretches or squeezes time; online sim.dev is reset so it is always 1 there.
    // (Game speed is a solo tool: online it would change everyone's clock.)
    accumulator += dt * (online.active ? 1 : sim.dev.timeScale || 1);
    while (accumulator >= RULES.step && (running || (online.active && started) || soloWatch)) {
      if (soloWatch) {
        previousPlayer = { ...sim.player };
        bots.before(sim); sim.step({ moveX: 0, moveZ: 0, aimX: sim.player.aimX, aimZ: sim.player.aimZ }); bots.after(sim); bots.step(sim);
        tappedKeys.clear(); accumulator -= RULES.step;
        for (const e of sim.drainEvents()) event(e);
        continue;
      }
      previousPlayer = { ...sim.player };
      prevCursor.x=mouse.x;prevCursor.y=mouse.y;
      if(smoothedCursor()&&inputMode==='mouse')advanceAimCursor(mouse,cursorTarget,RULES.step,aimingNow(),sim.weapon,sim.sightline?.crouched);
      const held = key => keys.has(key) || tappedKeys.has(key);
      // The thumb's direction eases in over ~0.1 s, so a flick across the stick
      // turns the walk rather than snapping it.
      const follow = 1 - Math.exp(-RULES.step / MOVE_STICK.smoothing);
      touchMove.x += (touch.moveX - touchMove.x) * follow; touchMove.z += (touch.moveZ - touchMove.z) * follow;
      if (!touch.moveX && !touch.moveZ && Math.hypot(touchMove.x, touchMove.z) < .05) touchMove.x = touchMove.z = 0;
      let moveX = touchMove.x || Number(held('KeyD')) - Number(held('KeyA'));
      let moveZ = touchMove.z || Number(held('KeyS')) - Number(held('KeyW'));
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
      // The AIM switch lets go on standing up (or another weapon), or death.
      if (aimToggled && (!aimSwitch() || sim.player.dead)) setAimToggle(false);
      // Sightline's stance: a keyboard player's keys take the aim from the
      // mouse (moving the mouse takes it back).
      const stanceKeys = { x: Number(held('KeyD') || held('ArrowRight')) - Number(held('KeyA') || held('ArrowLeft')), z: Number(held('KeyS') || held('ArrowDown')) - Number(held('KeyW') || held('ArrowUp')) };
      if (!touchPrompts && sim.weapon === 'sightline' && sim.sightline?.crouched && (stanceKeys.x || stanceKeys.z)) inputMode = 'keyboard';
      const steer = stanceSteering();
      if (!steer && stanceAim.on) resetStanceAim(stanceAim);
      const locked = lockTarget(RULES.step);
      if (steer) {
        // The stick (as pushed) or the keys (a diagonal no faster than straight).
        const stick = Math.hypot(touch.moveX, touch.moveZ) > .02, kl = Math.hypot(stanceKeys.x, stanceKeys.z) || 1;
        const pushX = stick ? touch.moveX : stanceKeys.x / kl, pushZ = stick ? touch.moveZ : stanceKeys.z / kl;
        const p = sim.player, fx = stanceAim.on ? stanceAim.x : NaN, fz = stanceAim.on ? stanceAim.z : NaN;
        // Aim assist (side to side only, stance-aim.js): on a phone as Settings >
        // Mobile has it; always for keys.
        stepStanceAim(stanceAim, { player: p, pushX, pushZ, digital: !stick, scoped: !!sim.sightline.aiming, bodies: stanceBodies(), assist: touchPrompts ? !!settings.aimAssist : true, dt: RULES.step });
        keepStanceOnScreen(Number.isFinite(fx) ? fx : stanceAim.x, Number.isFinite(fz) ? fz : stanceAim.z);
        const lateral = muzzleLateral('sightline', true), bearing = muzzleBearing(p.x, p.z, stanceAim.x, stanceAim.z, lateral);
        aimX = Math.cos(bearing); aimZ = Math.sin(bearing); aimPointX = stanceAim.x; aimPointZ = stanceAim.z; digitalAim = false;
      }
      else if (locked) {
        const pt = targetLock.point, dx = pt.x - sim.player.x, dz = pt.z - sim.player.z, l = Math.hypot(dx, dz) || 1;
        // The body faces the gliding aim point directly (no extra turn easing on
        // top of the glide), so the character, cone and dot sweep together.
        // Trigger guns turn so the barrel's line (not the body's) meets it.
        const lateral = aimsByPoint(sim.weapon) ? muzzleLateral(sim.weapon,sim.sightline?.crouched) : 0, bearing = lateral && l > lateral + .3 ? muzzleBearing(sim.player.x, sim.player.z, pt.x, pt.z, lateral) : Math.atan2(dz, dx);
        aimX = Math.cos(bearing); aimZ = Math.sin(bearing); aimPointX = pt.x; aimPointZ = pt.z; digitalAim = false;
        if (arrows.active && !touchPrompts) inputMode = 'keyboard';
      }
      else if (digitalAim) { aimX = manualX; aimZ = manualZ; inputMode = 'keyboard'; }
      else if (inputMode === 'mouse') {
        const cursorAim = view.aim(mouse.x, mouse.y, sim.player);
        ({ aimX, aimZ, aimPointX, aimPointZ } = aimsByPoint(sim.weapon) ? aimDamping.apply(cursorAim, sim.player, 1 / 60, muzzleLateral(sim.weapon,sim.sightline?.crouched)) : cursorAim);
      }
      else if (moveX || moveZ) { aimX = moveX; aimZ = moveZ; digitalAim = true; }
      // The no-mouse lesson: Q fired while aiming with the arrow keys.
      if(tutorial){tutorial.touch=touchPrompts;tutorial.touchAiming=touchAimPointer!==null;tutorial.walking=Math.hypot(touchMove.x,touchMove.z)>.2;if(arrows.active)tutorial.arrowAim=true;if(tappedKeys.has(GAME_KEYS.shoot)&&tutorial.arrowAim&&inputMode==='keyboard')tutorial.event({type:'keyboardShot'},sim);}
      const ballast=ballastInput(rifleFiring,keys,tappedKeys);
      const aiming = aimingNow();
      // Dev first person (fps-mode.js): WASD turned to the look, aim along it.
      if (fpsOn()) {
        ({ moveX, moveZ } = fpsMove(fpsLook, moveX, moveZ));
        ({ aimX, aimZ, aimPointX, aimPointZ } = fpsAim(fpsLook, sim.player)); digitalAim = false;
        if (pendingAimPoint) pendingAimPoint = { aimX, aimZ, aimPointX, aimPointZ };
      }
      if(!online.active)bots.before(sim);
      // Freezing is a solo tool: online it would stop only the host.
      if(online.active&&sim.dev.freeze)sim.dev.freeze=false;
      sim.step(online.input({ moveX, moveZ, aimX, aimZ, aimPointX, aimPointZ, autoRange:locked?false:assistMode(), smoothAim:digitalAim, grenade:tappedKeys.has(GAME_KEYS.secondary), surge:sim.weapon==='rifle'&&tappedKeys.has('KeyX'), fire:sim.weapon==='shotgun'?ballast.fire:rifleFiring||pendingLaunch||(usesTrigger(sim.weapon)&&held(GAME_KEYS.shoot)),tapFire:pendingLaunch&&!tappedKeys.has(GAME_KEYS.shoot),scatter:sim.weapon==='shotgun'&&tappedKeys.has('KeyX'),doubleShot:tappedKeys.has(GAME_KEYS.secondary),aiming,reload:tappedKeys.has('KeyR'), ichorGuard:weaponGuarding(sim.weapon,rifleAiming,keys),ichorE:sim.weapon==='ichor'&&tappedKeys.has(GAME_KEYS.secondary),ichorX:sim.weapon==='ichor'&&tappedKeys.has('KeyX'),sheathE:sim.weapon==='sheath'&&tappedKeys.has(GAME_KEYS.secondary),sheathX:sim.weapon==='sheath'&&tappedKeys.has('KeyX'),sidekickMine:sim.weapon==='sidekick'&&tappedKeys.has(GAME_KEYS.secondary),sidekickX:sim.weapon==='sidekick'&&tappedKeys.has('KeyX'),sightlineStance:sim.weapon==='sightline'&&tappedKeys.has(GAME_KEYS.secondary),sightlineX:sim.weapon==='sightline'&&tappedKeys.has('KeyX'),omenPrime:sim.weapon==='omen'&&tappedKeys.has(GAME_KEYS.secondary), omenVolley:sim.weapon==='omen'&&tappedKeys.has('KeyX'), spray: held('KeyC'), dodge: tappedKeys.has(GAME_KEYS.dodge), hex: tappedKeys.has('KeyX'), seed: held(GAME_KEYS.secondary) || touch.seeding || pendingSeed, launch: pendingLaunch, quickShot:pendingQuickShot,
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
  // (Before this frame is drawn, competitive overhaul: a respawn the host just
  // made, yours or the new round's, is taken now, so the frame shows you at
  // the new spot with the camera cut there, not one frame at the old place or
  // gliding between the two.)
  online.frame({onRespawn:reviveOnline});
  // No view.update during pause: the rendered scene and all effect clocks freeze.
  if (paused) {
    if (dirty) { view.render(); dirty = false; }
  } else if(started) {
    // While the GPU is still drawing the last frame, skip this one rather than
    // queue it (queued frames are input lag; see WorldView.gpuBusy).
    if(dt>0)view.frameInterval=(view.frameInterval||dt*1000)*.9+Math.min(100,dt*1000)*.1; // (the display's frame time, for gpuBusy)
    const renderDelta = view.gpuBusy() ? budget.hold(dt) : budget.tick(dt);
    if (renderDelta > 0) {
      view.tutorialGuide=tutorial&&!tutorial.complete?{zone:tutorial.zone,target:tutorial.pointer(sim)}:null;
      // Team games: your ring your side's colour, like your teammates' (SIDE_COLOURS).
      view.setTeamRing(online.active?(SIDE_COLOURS[online.myTeam]?.ring||null):bots.bots.some(b=>b.team==='blue')?SIDE_COLOURS.blue.ring:null);
      view.remotePlayers = online.active ? online.others(running ? accumulator / RULES.step : 1) : bots.others(running ? accumulator / RULES.step : 1);
      for (const o of view.remotePlayers || []) lastSeen.set(o.id, o);
      const drawn=online.active?drawSim(sim,online.foreign()):bots.active?drawSim(sim,bots.foreign(elapsed)):sim;
      // Spectating: the camera, rooms and roofs follow the teammate you watch.
      const watched=spectate.watched;view.spectating=!!watched;
      if(watched){spectatePrev||={x:watched.x,z:watched.z};view.update(spectateView(drawn,watched),renderDelta,true,elapsed,{...sim.player,x:spectatePrev.x,z:spectatePrev.z},1);spectatePrev={x:watched.x,z:watched.z};}
      else{spectatePrev=null;view.update(drawn, renderDelta, running||online.active||soloWatch, elapsed, previousPlayer, running ? accumulator / RULES.step : 1);}
      robotMinds.update(bots,view,!!sim.dev.robotMinds&&!online.active);
      if(running||online.active||deathActive)hollow?.update(renderDelta,sim); // s3-sound: the crows (on the death screen too: they fly on while you wait)
      dirty = false; renderedFrames++;
    }
    // The aim dot is page markup, not the 3D frame: it follows every display
    // frame, drawn or skipped, so it never lags the pointer.
    updateReticle();
    if(running&&!document.hidden){view.setResolutionScale(adaptiveResolution.sample(dt,renderDelta>0,settings.quality,settings.fps));view.setStrain(adaptiveResolution.strained);}
    // An automatic preset well short of its frame target steps down at the
    // next start (one smooth for long enough a step lower climbs back).
    if(running&&!document.hidden&&settings.qualityAuto&&!view.holdRender){
     const move=autoWatch.sample(dt,renderDelta>0?1:0,Math.min(settings.fps||60,60),settings.qualityAutoStep);
     if(move){settings.qualityAutoStep=Math.max(-2,Math.min(0,settings.qualityAutoStep+move));try{localStorage.setItem('deadstab-settings',JSON.stringify(settings));}catch{}}
    }
    else adaptiveResolution.reset();
    fpsTime += dt;
    if (fpsTime >= 1) { measuredFPS = Math.round(renderedFrames / fpsTime); fpsTime = 0; renderedFrames = 0; }
  }
  if(paused)adaptiveResolution.reset();
  if(online.active)multiplayerFrame();
  perfReadout.update(started && !paused ? dt : 0, measuredFPS);
  syncGameCursor();
  updateHealthHUD(sim);
  // Your own Gold Rush tints your view (sheath-screen.js); nobody else's does.
  sheathScreen.rush(started&&!paused&&sim.weapon==='sheath'&&sim.sheath.rush>0&&!sim.player.dead);
  hudTime += dt; if (hudTime >= .08) { updateHUD(); hudTime = 0; keepAwake(running && !deathActive); }
  damageFeedback.update(sim,view);outgoingFeedback.update(sim,view);
  if(started&&!paused)duel.frame(dt,!sim.player.dead&&sim.player.hp>0);
  updateSpectate(dt);
  // 1V1's duel circle (online: the host's, in the match state; SOLO: duel.js's).
  view.setDuelCircle(started?(online.active?online.match()?.circle:duel.circle):null);
  // The world's animals (critters.js): this page's own (SOLO, the host's arena), or a joiner's copy of the host's.
  view.critters=sim.critters||null;view.critterState=view.critters?null:online.active?online.critterState():null;
  stepStormScreen(dt);
  {const rp=view.player.position,me=view.screenPoint(rp.x,rp.z);fireIndicator.update(running&&!deathActive?dt:10,me.x,me.y,viewWidth(),viewHeight());
   if(running&&!deathActive)damageIndicator.update(dt,me.x,me.y,viewWidth(),viewHeight());else damageIndicator.clear();}
  if(deathActive){
   deathElapsed+=dt;
   // (SOLO's last point: the end card comes instead, duel.js.)
   if(!deathMenuOpen&&!duel.over&&!matchEnd.open&&deathElapsed>=DEATH_MENU_DELAY){
    deathMenuOpen=true;document.body.classList.add('dead-menu');damageFeedback.clear();outgoingFeedback.clear();
    deathScreen.show(deathMode());
    // The tutorial keeps its course's weapon (the pause menu hides it too).
    // (It used to un-hide the button in every other mode, online FFA's too.)
    if(map.training)$('death-change-weapon').hidden=true;
    deathScreen.setKiller(online.active?lastKiller:undefined,lastOneShot);
    syncDeathCard(true);
    if(!online.active)sound.suspend(true);
   }
   // Practice counts its own respawn; online the host's countdown is shown
   // (multiplayerFrame) and the host brings you back.
   // (SOLO FFA: everyone comes back after FFA_RESPAWN, as online, duel.js.)
   if(!online.active&&(!duel.active||duel.ffa)&&!duel.over){const wait=duel.ffa?FFA_RESPAWN:RESPAWN_TIME;deathScreen.setTimer(wait-deathElapsed);if(deathElapsed>=wait)respawnPractice();}
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
  document.body.classList.toggle('ads-fire',adsFire);aimFireButton.hidden=!aimFireWanted();aimFireShown=!aimFireButton.hidden;
  const touchLabel=(id,label,binding)=>{
   const word=document.createElement('span');word.className='button-label';word.textContent=label;
   const key=document.createElement('small');key.className='touch-binding';key.textContent=displayKeys(binding);
   $(id).replaceChildren(word,key);
  };
  if(extras){
   extendedButton.dataset.weapon=sim.weapon;
   touchLabel('touch-extended',extras.extended.label,extras.extended.binding);touchLabel('touch-grenade',extras.grenade.label,extras.grenade.binding);
   extendedButton.setAttribute('aria-label',extras.extended.aria);grenadeButton.setAttribute('aria-label',extras.grenade.aria);
  }
  updateWeaponHUD(sim,touchPrompts);
  touchLabel('touch-launch',extras?'FIRE':'LAUNCH','LMB / SPACE');
  touchLabel('touch-hex',extras?'RELOAD':'HEX',extras?'R':'X');
  $('touch-hex').hidden=sim.weapon==='ichor'||sim.weapon==='sheath';
  $('touch-stream').hidden=!!extras&&!extras.aim;
  if(!extras||extras.aim)touchLabel('touch-stream',extras?(extras.aim.label||'AIM'):'STREAM',extras?extras.aim.binding:'C');
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
 try{sessionStorage.setItem('deadstab-controls-override',value);}catch{}
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
 // (Not a tap on the controls choice itself: that tap is the choice.)
 if(e.pointerType==='touch'||e.pointerType==='pen'){if(e.target.closest?.('#input-preference'))return;if(inputPreference.surface!=='touch'){try{sessionStorage.removeItem('deadstab-controls-override');}catch{}}detectActiveInput('touch');}
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
// (A press is a switch or a hold by what it was when pressed: standing up
// with AIM held down still lets go of it on the lift.)
bindAction($('touch-stream'),()=>{aimPressSwitched=aimSwitch();if(aimPressSwitched)setAimToggle(!aimToggled);else if(!usesTrigger(sim.weapon))keys.add('KeyC');else rifleAiming=true;},()=>{keys.delete('KeyC');if(!aimPressSwitched)rifleAiming=false;});
bindAction($('touch-launch'),()=>{
 pendingLaunch=true;pendingQuickShot=true;
 pendingAimPoint=inputMode==='mouse'&&!stanceSteering()&&!keyboardAim(keys,tappedKeys).active&&!(targetLock.id!==null&&lockMode())?view.aim(mouse.x,mouse.y,sim.player):null;
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
// before switching map, launch.js launchTo) starts the game; so does a dev
// capture link (tools).
export function finishLoading(){
 const asked=params.get('play')==='1'&&(boot.launched||params.has('capture')||params.has('autostart'));
 if(asked)void start();
 else if(params.get('autojoin')==='1'||params.get('autohost')==='1')menuFlow.autoRoom();/* (v0.990a: a room moved to this map, or opened on it from the host setup) */
 else{
  if(params.get('play')==='1')for(const k of ['play','mode','duel','course','weapon'])params.delete(k);
  $('gamemodes').focus();
 }
}
