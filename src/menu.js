import {shotgunPreview} from './shotgun-model.js';
import { staticPreview } from './weapon-preview.js';
import { riflePreview } from './rifle-model.js';

export function installMenu({ $, map, thumbnail, start, openSettings, closeSettings, returnToMenu, tutorialComplete }) {
 let page=document.querySelector('[data-page]:not([hidden])')?.dataset.page||'home';
 let selectedMap='deadwater';
 let weaponBack='maps';
 const back=()=>{if(page!=='home')show(page==='weapons'?weaponBack:page==='maps'?'modes':'home');};
 const show=name=>{if(name==='maps')loadThumbnail();page=name;document.querySelectorAll('[data-page]').forEach(p=>p.hidden=p.dataset.page!==name);document.querySelector(`[data-page="${name}"] button:not(.menu-back):not([hidden])`)?.focus();};
 $('tutorial-entry').hidden=tutorialComplete;$('tutorial-mode').hidden=false;
 $('gamemodes').onclick=()=>show('modes');$('practice-mode').onclick=()=>show('maps');
 document.querySelectorAll('.menu-back').forEach(b=>b.onclick=back);
 const chooseWeapons=()=>{show('weapons');for(const card of $('weapon-options').children)card.loadPreview();};
 const goTutorial=()=>{weaponBack=page==='modes'?'modes':'home';selectedMap='tutorial';chooseWeapons();};
 $('tutorial-entry').onclick=goTutorial;$('tutorial-mode').onclick=goTutorial;
 const launch=weapon=>{
  const query=new URLSearchParams({map:selectedMap,weapon,play:'1',mode:selectedMap==='tutorial'?'tutorial':'practice'});
  if(map.id===selectedMap){history.replaceState(null,'','?'+query);start(weapon);}
  else location.href='?'+query;
 };
 const weapons=[{id:'static',name:'Static',description:'place drifting electric orbs, launch focused volleys, or unleash a hex pulse and lightning stream',preview:staticPreview},{id:'rifle',name:'Nominal',description:'deliver steady, accurate fire with a classic automatic rifle built for dependable mid range combat',preview:riflePreview}];
 weapons.push({id:'shotgun',name:'Ballast',description:'charge a heavy double barrel and ride its recoil into devastating close range blasts',preview:shotgunPreview});
 for(const weapon of weapons){
  const card=document.createElement('article');card.className='weapon-card';card.dataset.name=weapon.name;
  const select=document.createElement('button');select.className='weapon-choice';select.setAttribute('aria-label','Select '+weapon.name);
  const picture=document.createElement('img');picture.alt=weapon.id==='static'?'Static — light-blue electric gun with a yellow muzzle':'Nominal — matte steel rifle, wooden stock and olive-green grenade';if(weapon.id==='shotgun')picture.alt='Ballast — matte double-barrel shotgun with walnut stock';picture.className='weapon-preview';
  const title=document.createElement('span');title.className='weapon-name';
  const label=document.createElement('span');label.className='button-label';label.textContent=weapon.name;title.append(label);
  const description=document.createElement('span');description.className='weapon-description';description.textContent=weapon.description;
  select.append(picture,title,description);select.onclick=()=>launch(weapon.id);
  card.append(select);$('weapon-options').append(card);
  card.loadPreview=()=>{if(!picture.src)picture.src=weapon.preview();};
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
 $('start').onclick=()=>{selectedMap=$('start').dataset.map||'deadwater';weaponBack='maps';chooseWeapons();};
 let thumbnailScheduled=false;
 function loadThumbnail(){
  if(!thumbnail||thumbnailScheduled)return;thumbnailScheduled=true;
  // Let navigation paint before the one-time GPU readback.
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
   try{
    const source=typeof thumbnail==='function'?thumbnail():thumbnail;
    if(!source)return;
    const image=document.createElement('img');image.src=source;image.alt='Top-down view of Deadwater Outpost spawn';$('map-thumbnail').replaceChildren(image);
   }catch(error){thumbnailScheduled=false;console.warn('Map preview unavailable:',error);}
  }));
 }
 $('menu-settings').onclick=openSettings;$('pause-settings').onclick=openSettings;$('settings-back').onclick=closeSettings;
 $('main-menu').onclick=()=>{returnToMenu();show('home');$('gamemodes').focus();};$('tutorial-finish').onclick=$('main-menu').onclick;
 document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{
  document.querySelectorAll('[data-tab]').forEach(t=>t.setAttribute('aria-selected',String(t===b)));
  for(const id of ['graphics','controls','developer'])$('settings-'+id).hidden=id!==b.dataset.tab;
 });
 document.querySelector('[data-tab="graphics"]').click();
 const generalControls=[
  ['Move','WASD / left stick'],
  ['Aim','Mouse / arrow keys / aim stick / drag on the world','Movement sets facing when not aiming independently.'],
  ['Dodge','Space while moving / DODGE button'],
  ['Map','M / map button; M or Escape closes'],
  ['Pause / resume','Esc / pause button'],
  ['Restart current session','RESTART in pause menu'],
  ['Toggle sound','N / sound button'],
  ['Menu selection','Arrow keys / Tab / pointer'],
  ['Change setting','Left / right arrows','Up/down moves between settings. E enters editing; arrows change the value and E or Q finishes.'],
  ['Confirm / open controls','E / Enter / click / tap','On a weapon dropdown, right opens and left closes.'],
  ['Back','Q / Escape'],
  ['Developer teleport','Click / tap destination on map','Requires developer teleport to be enabled.'],
  ['Toggle all developer overrides','P','Enter code 1919 when prompted. Q, Esc, or × cancels. Toggles shared and weapon-specific overrides together; invincibility is controlled separately.'],
 ];
 const weaponControls=[{name:'Static',controls:[
  ['Place orbs','Hold E / hold PLACE'],
  ['Launch placed orbs','Left click / Q / tap world / Q button'],
  ['Quick shot','Q / left click / tap world / Q button','With no drifting orbs, fires one orb for 1 ammo.'],
  ['Hex deploy / pulse','X / X button','Press again after formation to pulse. Costs 10 ammo.'],
  ['Lightning stream','Hold C / hold C button','Release to stop.'],
 ]},{name:'Nominal',controls:[['Fire','Left click or Q / hold either / hold FIRE','One bullet per press; hold for automatic fire.'],['Aim precisely','Hold right click or Shift / hold AIM','Reduces spread at any distance. Standing still also improves accuracy.'],['Reload','R / RELOAD','18 rounds; 1.8-second reload. Dropped magazines remain for 30 seconds.'],['Extended magazine','X / X touch button','Loads 36 rounds in 1.8 seconds. Available every 60 seconds; R loads a standard 18-round magazine.'],['Throw grenade','E / E touch button','1.4-second fuse, 25-second cooldown. Aim within 12 metres. Deals 240 damage within 0.7 metres, falling to 35 at the 4-metre blast edge; cover blocks it.']]}];
 weaponControls.push({name:'Ballast',controls:[['Charge / fire','Hold / release LMB or FIRE','115–315 damage on the first shell; 100–300 on the second if every pellet lands. Two shells; one native dodge.'],['Store charge','Q or click RMB while charging / LOCK','Keeps the same charge for both shells for 15 seconds.'],['Double shot','E / DOUBLE','Fires both remaining shells 0.05 seconds apart, or the last shell.'],['Focus cone','Hold RMB / AIM','Narrows the short cone; clicking also stores a live charge. Charge increases range from 7.5 to 9 metres.'],['Reload','R / RELOAD','Break open, eject spent shells, insert shells and close. 2.8 seconds; firing after the first shell loads cancels the rest.']]});
 const list=rows=>'<table class="controls-grid"><thead><tr><th scope="col">Action</th><th scope="col">Keybind</th></tr></thead><tbody>'+rows.map(([action,binding,note])=>'<tr><th scope="row">'+action+'</th><td>'+binding+(note?'<small>'+note+'</small>':'')+'</td></tr>').join('')+'</tbody></table>';
  $('settings-controls').innerHTML='<h3 class="controls-heading">General</h3>'+list(generalControls)+'<h3 class="controls-heading">Weapons</h3><div class="weapon-control-list">'+weaponControls.map(weapon=>'<details class="weapon-control-entry"><summary>'+weapon.name+'</summary>'+list(weapon.controls)+'</details>').join('')+'</div>';
 $('settings-controls').insertAdjacentHTML('afterbegin','<label class="setting">SHOW HUD CONTROL HINTS<input id="control-hints" type="checkbox" checked/></label>');
 $('settings-controls').insertAdjacentHTML('afterbegin','<label class="setting select-setting">MOBILE BUTTON OPACITY<select id="mobile-opacity"><option value="1">Solid · 100%</option><option value="0.7">Medium · 70%</option><option value="0.4">Faint · 40%</option></select></label>');
 return {back};
}
