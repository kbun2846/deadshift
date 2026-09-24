import { refreshTypography } from './button-typography.js';
import { cardImage, CARD_IMAGES, WEAPON_IMAGES } from './map-cards.js';
import {shotgunPreview} from '../weapons/shotgun-model.js';
import { staticPreview } from './weapon-preview.js';
import { riflePreview } from '../weapons/rifle-model.js';
import { WEAPONS, DEFAULT_WEAPON } from '../items.js';
import { DEFAULT_MAP, menuMaps } from '../maps.js';
import { NETWORK } from '../config/network.js';
import { savedName } from '../online-play.js';
import { createSettingsRows } from './lobby-settings.js';
import { cleanSettings } from '../config/match.js';

export function installMenu({ $, map, thumbnail, start, openSettings, closeSettings, returnToMenu, tutorialComplete, online }) {
 let page=document.querySelector('[data-page]:not([hidden])')?.dataset.page||'home';
 let selectedMap=DEFAULT_MAP;
 let weaponBack='maps';
 // In a multiplayer game the weapon page is the in-game picker; its back
 // arrow leaves multiplayer (see pickOnline below).
 let onlinePick=null,onlineBack=null;
 const back=()=>{if(onlinePick&&page==='weapons'){onlineBack?.();return;}if(page!=='home')show(page==='weapons'?weaponBack:page==='host-setup'?'online':page==='maps'||page==='online'?'modes':'home');};
 const show=name=>{if(name==='maps')loadThumbnail();page=name;document.querySelectorAll('[data-page]').forEach(p=>p.hidden=p.dataset.page!==name);refreshTypography();document.querySelector(`[data-page="${name}"] button:not(.menu-back):not([hidden])`)?.focus();};
 $('tutorial-entry').hidden=tutorialComplete;$('tutorial-mode').hidden=false;
 $('gamemodes').onclick=()=>show('modes');$('practice-mode').onclick=()=>show('maps');
 // Online: host a room (you get a code to share) or type a friend's code.
 // main.js does the connecting; this page only shows how it is going.
 const status=text=>{$('online-status').textContent=text||'';$('host-status').textContent=text||'';};
 let connecting=false;
 const go=async request=>{
  if(connecting)return;connecting=true;
  $('online-host').disabled=$('online-join').disabled=$('host-create').disabled=true;
  try{await online(request,status);}
  catch(error){status(error.message||'Could not connect.');}
  finally{connecting=false;$('online-host').disabled=$('online-join').disabled=$('host-create').disabled=false;}
 };
 $('online-mode').hidden=!NETWORK.enabled;
 $('online-mode').onclick=()=>{status('');show('online');};
 const who=()=>({name:$('online-name').value});
 // Room codes are always shown in capitals, whatever was typed.
 $('online-code').addEventListener('input',e=>{const el=e.target,at=el.selectionStart;el.value=el.value.toUpperCase();try{el.setSelectionRange(at,at);}catch{}});
 $('online-name').value=savedName();
 // HOST A GAME: first the host sets up the game (the round settings, which
 // they can change later in the lobby), then CREATE GAME opens the room and the
 // lobby screen. The last setup is remembered.
 const SETUP_KEY='deadshift-host-settings';
 let hostSettings=(()=>{try{return cleanSettings(JSON.parse(localStorage.getItem(SETUP_KEY)||'{}'));}catch{return cleanSettings();}})();
 const setupRows=createSettingsRows($('host-settings'),{onChange:(key,value)=>{hostSettings={...hostSettings,[key]:value};try{localStorage.setItem(SETUP_KEY,JSON.stringify(hostSettings));}catch{}setupRows.render({settings:hostSettings,editable:true});}});
 setupRows.render({settings:hostSettings,editable:true});
 $('online-host').onclick=()=>{if(!who().name.trim()){status('Enter a username first.');$('online-name').focus();return;}status('');show('host-setup');};
 $('host-create').onclick=()=>go({role:'host',...who(),settings:hostSettings});
 $('online-join-form').onsubmit=e=>{e.preventDefault();go({role:'join',code:$('online-code').value,...who()});};
 // A shared link (?join=CODE) lands straight on this page and joins.
 const invite=NETWORK.enabled&&new URLSearchParams(location.search).get('join');
 // The link fills in the room code; the username is typed here.
 if(invite&&online){$('online-code').value=invite.toUpperCase();show('online');status('Enter your username, then JOIN.');}
 else if(NETWORK.enabled&&new URLSearchParams(location.search).get('host')==='1'&&online){show('online');status('Enter your username, then HOST A GAME.');}
 document.querySelectorAll('.menu-back').forEach(b=>b.onclick=back);
 // The page title says which weapon list this is: a tutorial course or a match.
 const chooseWeapons=()=>{$('tutorial-basics').hidden=selectedMap!=='tutorial';document.querySelector('[data-page="weapons"] h2').textContent=selectedMap==='tutorial'?'tutorial weapons':'weapons';show('weapons');for(const card of $('weapon-options').children)card.loadPreview();};
 // Home's tutorial goes straight into the basics: no weapon to pick for
 // walking and dashing. Gamemodes > Tutorial picks a weapon's own course.
 const goTutorial=()=>{weaponBack='modes';selectedMap='tutorial';chooseWeapons();};
 $('tutorial-entry').onclick=()=>{selectedMap='tutorial';launch(DEFAULT_WEAPON,'basics');};$('tutorial-mode').onclick=goTutorial;
 const launch=(weapon,course)=>{
  if(onlinePick){const pick=onlinePick;onlinePick=onlineBack=null;$('intro').classList.add('hidden');document.querySelector('[data-page="weapons"] h2').textContent='weapons';pick(weapon);return;}
  const query=new URLSearchParams({map:selectedMap,weapon,play:'1',mode:selectedMap==='tutorial'?'tutorial':'practice'});
  if(course)query.set('course',course);
  if(map.id===selectedMap){try{history.replaceState(null,'','?'+query);}catch{}start(weapon,selectedMap==='tutorial'?course||null:undefined);}
  else location.href='?'+query;
 };
 // Names and descriptions come from the item registry; only the 3D preview
 // renderers are wired up here (a new weapon adds its preview function).
 const previews={static:staticPreview,rifle:riflePreview,shotgun:shotgunPreview};
 const weapons=WEAPONS.map(w=>({...w,preview:previews[w.id]}));
 for(const weapon of weapons){
  const card=document.createElement('article');card.className='weapon-card';card.dataset.name=weapon.name;
  const select=document.createElement('button');select.className='weapon-choice';select.setAttribute('aria-label','Select '+weapon.name);
  const picture=document.createElement('img');picture.alt=weapon.previewAlt;picture.className='weapon-preview';
  const title=document.createElement('span');title.className='weapon-name';
  const label=document.createElement('span');label.className='button-label';label.textContent=weapon.name;title.append(label);
  const description=document.createElement('span');description.className='weapon-description';description.textContent=weapon.description;
  select.append(picture,title,description);select.onclick=()=>launch(weapon.id);
  card.append(select);$('weapon-options').append(card);
  // A weapon without a 3D preview yet simply shows its name and description.
  // The shipped picture from the start (map-cards.js); a weapon without one
  // is rendered on first view, and one with neither shows its name.
  if(WEAPON_IMAGES[weapon.id]){picture.decoding='async';picture.src=WEAPON_IMAGES[weapon.id];}
  card.loadPreview=()=>{if(!picture.src&&weapon.preview)picture.src=weapon.preview();};
 }
 const weaponList=$('weapon-options');
 const scrollFrame=document.createElement('div');scrollFrame.className='weapon-scroll-frame';
 weaponList.before(scrollFrame);scrollFrame.append(weaponList);
 const scrollCue=document.createElement('span');scrollCue.className='weapon-scroll-cue';scrollCue.setAttribute('aria-hidden','true');
 scrollCue.innerHTML='<svg viewBox="0 0 32 22"><path d="M3 3H29L16 19Z"/></svg>';scrollFrame.append(scrollCue);
 const updateScrollCue=()=>scrollFrame.classList.toggle('has-more',weaponList.clientHeight>0&&weaponList.scrollHeight-weaponList.clientHeight-weaponList.scrollTop>3);
 weaponList.addEventListener('scroll',updateScrollCue,{passive:true});
 const scrollResize=new ResizeObserver(updateScrollCue);scrollResize.observe(weaponList);
 for(const card of weaponList.children)scrollResize.observe(card);
 $('tutorial-basics').onclick=()=>launch(DEFAULT_WEAPON,'basics');
 // One card per map the Practice menu offers (maps.js menuMaps): the stretched
 // name, and a top-down preview for the map already loaded on this page.
 const stretched=text=>`<svg viewBox="0 0 166 19" preserveAspectRatio="none" aria-hidden="true"><text x="0" y="19" textLength="166" lengthAdjust="spacingAndGlyphs">${text}</text></svg>`;
 const nameLines=name=>{const words=name.toUpperCase().split(/\s+/);const half=Math.ceil(words.length/2);return [words.slice(0,half).join(' '),words.slice(half).join(' ')||'\u00a0'];};
 const mapCards=new Map();
 for(const option of menuMaps()){
  const card=document.createElement('button');card.className='map-choice';card.dataset.map=option.id;
  const [first,second]=nameLines(option.name);
  card.innerHTML=`<span class="map-thumbnail"></span><small class="map-mode">Practice</small><span class="map-caption"><strong>${stretched(first)}${stretched(second)}</strong></span>`;
  card.querySelector('strong').setAttribute('aria-label',option.name);
  // The shipped picture (map-cards.js), in place and decoding from the start.
  const picture=cardImage(option.id,'Top-down view of '+option.name);
  if(picture)card.querySelector('.map-thumbnail').append(picture);
  card.onclick=()=>{selectedMap=option.id;weaponBack='maps';chooseWeapons();};
  $('map-options').append(card);mapCards.set(option.id,card);
 }
 let thumbnailScheduled=false;
 function loadThumbnail(){
  // Maps with a shipped picture have it already; a render of the loaded map
  // is only the fallback for one without (a new map before its capture).
  if(CARD_IMAGES[map.id])return;
  if(!thumbnail||thumbnailScheduled)return;thumbnailScheduled=true;
  // Let navigation paint before the one-time GPU readback.
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
   try{
    const source=typeof thumbnail==='function'?thumbnail():thumbnail;
    if(!source)return;
    const slot=mapCards.get(map.id)?.querySelector('.map-thumbnail');if(!slot)return;
    const image=document.createElement('img');image.src=source;image.alt='Top-down view of '+map.name;slot.replaceChildren(image);
   }catch(error){thumbnailScheduled=false;console.warn('Map preview unavailable:',error);}
  }));
 }
 $('menu-settings').onclick=openSettings;$('pause-settings').onclick=openSettings;$('settings-back').onclick=closeSettings;
 $('main-menu').onclick=()=>{returnToMenu();show('home');$('gamemodes').focus();};$('tutorial-finish').onclick=$('main-menu').onclick;
 const tabs=[...document.querySelectorAll('.settings-tabs [data-tab]')];
 const openTab=name=>{
  for(const tab of tabs)tab.setAttribute('aria-selected',String(tab.dataset.tab===name));
  for(const tab of tabs)$('settings-'+tab.dataset.tab).hidden=tab.dataset.tab!==name;
  $('settings-panel').dataset.tab=name;
 };
 for(const tab of tabs)tab.onclick=()=>openTab(tab.dataset.tab);
 openTab('graphics');
 const generalControls=[
  ['Move','WASD / drag anywhere on the left half','On touch the stick appears wherever your thumb lands.'],
  ['Aim','Mouse / arrow keys / swipe on the right half','Movement sets facing when not aiming independently. Arrows and swipes lock onto the target that way; a running player pulls ahead of the lock, and holding an arrow leads them. Tap a spot on the world to fire at it.'],
  ['Aim in','Shift / right mouse button','Works on every weapon: tightens the shot and slows the walk. On Ballast, pressing it while charging also stores the charge.'],
  ['Dodge','Left Ctrl / DODGE button','Rolls the way you are moving, or the way you are facing when standing still. Goes through breakable scenery.'],
  ['Map','M / map button; M or Escape closes'],
  ['Pause / resume','Esc / pause button'],
  ['Restart current session','RESTART in pause menu'],
  ['Reset map','RESET MAP in pause menu (practice)','Props, crops and targets back, blood, marks and bodies cleared; you stay where you are. Press twice.'],
  ['Change weapon','CHANGE WEAPON in pause menu (practice)'],
  ['Toggle sound','N / sound button'],
  ['Menu selection','Arrow keys / Tab / pointer'],
  ['Change setting','Left / right arrows','Up/down moves between settings. E enters editing; arrows change the value and E or Q finishes.'],
  ['Confirm / open controls','E / Enter / click / tap','On a weapon dropdown, right opens and left closes.'],
  ['Back','Q / Escape'],
 ];
 const list=rows=>'<table class="controls-grid"><thead><tr><th scope="col">Action</th><th scope="col">Keybind</th></tr></thead><tbody>'+rows.map(([action,binding,note])=>'<tr><th scope="row">'+action+'</th><td>'+binding+(note?'<small>'+note+'</small>':'')+'</td></tr>').join('')+'</tbody></table>';
  $('settings-controls').innerHTML='<details class="weapon-control-entry general-group"><summary>General</summary>'+list(generalControls)+'</details>'+'<details class="weapon-control-entry weapons-group"><summary>Weapons</summary><div class="weapon-control-list">'+WEAPONS.map(weapon=>'<details class="weapon-control-entry"><summary>'+weapon.name+'</summary>'+list(weapon.controls||[])+'</details>').join('')+'</div></details>';
 $('settings-controls').insertAdjacentHTML('afterbegin','<label class="setting">SHOW HUD CONTROL HINTS<input id="control-hints" type="checkbox" checked/></label>');
 // Moved into Settings > Mobile by mobile-settings.js, with the opacity.
 $('settings-controls').insertAdjacentHTML('afterbegin','<label class="setting">AIM ASSIST<input id="aim-assist" type="checkbox" checked/></label>');
 $('settings-controls').insertAdjacentHTML('afterbegin','<label class="setting">VIBRATION<input id="vibration" type="checkbox" checked/></label>');
 $('settings-controls').insertAdjacentHTML('afterbegin','<label class="setting">FULL SCREEN WHILE PLAYING<input id="fullscreen-play" type="checkbox" checked/></label>');
 $('settings-controls').insertAdjacentHTML('afterbegin','<label class="setting select-setting">MOBILE BUTTON OPACITY<select id="mobile-opacity"><option value="1">Solid · 100%</option><option value="0.7">Medium · 70%</option><option value="0.4">Faint · 40%</option></select></label>');
 const channels=[
  ['master','MASTER','Everything, including the mute bound to N.'],
  ['ambient','AMBIENT','Wind, dust and the birds overhead.'],
  ['weapons','WEAPONS','Fire, reloads, charges and abilities.'],
  ['effects','EFFECTS','Impacts, breakage, footsteps and blasts.'],
 ];
 $('settings-audio').innerHTML='<div class="settings-heading">MIX</div>'+channels.map(([key,label,note])=>
  '<label class="setting slider-setting">'+label+'<span class="slider-field"><span class="slider-track">'+
  '<input id="volume-'+key+'" class="volume-slider" type="range" min="0" max="100" step="1" aria-label="'+label.toLowerCase()+' volume"></span>'+
  '<output class="slider-value" id="volume-'+key+'-value" for="volume-'+key+'"></output></span></label>'+
  '<p class="settings-note">'+note+'</p>').join('')+
  '<button type="button" id="mute-all" class="secondary" aria-pressed="false">MUTE ALL</button>';
 // Multiplayer: pick a weapon over the running game (after joining, after
 // dying, or from the pause menu). Picking hands the weapon to `onPick`; the
 // back arrow is `onBack` (leave multiplayer).
 const pickOnline=(onPick,onBack)=>{
  onlinePick=onPick;onlineBack=onBack;
  $('tutorial-basics').hidden=true;
  document.querySelector('[data-page="weapons"] h2').textContent='choose your weapon';
  $('intro').classList.remove('hidden');show('weapons');
  for(const card of $('weapon-options').children)card.loadPreview();
 };
 const cancelOnlinePick=()=>{if(!onlinePick)return;onlinePick=onlineBack=null;document.querySelector('[data-page="weapons"] h2').textContent='weapons';};
 // The weapon page for a map (practice death screen: CHANGE WEAPON).
 const pickWeapons=id=>{selectedMap=id;weaponBack=id==='tutorial'?'modes':'maps';chooseWeapons();};
 return {back,openTab,pickOnline,cancelOnlinePick,pickWeapons,get pickingOnline(){return !!onlinePick;}};
}
