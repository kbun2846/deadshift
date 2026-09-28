import { createSightlineAmmo } from './sightline-ammo.js';
import { createIchorBloodHUD } from './ichor-blood-hud.js';
// Shared presentation contract: name, accent, capacity, ammo, status, and controls.
import { RIFLE } from '../weapons/rifle.js';
import { displayKeys, bindsVersion } from '../config/keybinds.js';
import { scatterPrimeLeft } from '../weapons/scatter.js';
import { WEAPONS } from '../items.js';
import { SHOTGUN, shotgunReloadRounds } from '../weapons/shotgun.js';
import { setText, setStyle, setAttr } from './dom-writes.js';
import { SIDEKICK, SIGHTLINE, RULES, OMEN } from '../config/gameplay.js';
export function shotgunAmmoPresentation(shotgun){
 return {capacity:SHOTGUN.shells,rounds:shotgun.reload>0?Math.max(shotgun.ammo,shotgunReloadRounds(shotgun.reload)):shotgun.ammo};
}
export function rifleAmmoPresentation(rifle){
 if(rifle.reload<=0)return {capacity:rifle.capacity,rounds:rifle.ammo};
 const progress=Math.max(0,Math.min(1,1-rifle.reload/RIFLE.reload));
 // Discard the old magazine, reveal the incoming empty slots, then fill them.
 if(progress<.2)return {capacity:rifle.capacity,rounds:rifle.ammo*(1-progress/.2)};
 return {capacity:rifle.reloadCapacity,rounds:rifle.reloadCapacity*Math.max(0,(progress-.3)/.7)};
}
// Names, colours, capacities and control hints come from the item registry.
export const WEAPON_UI=Object.fromEntries(WEAPONS.map(w=>[w.id,{name:w.name,accent:w.accent,capacity:w.capacity,keyboard:w.hints.keyboard,touch:w.hints.touch}]));
export function createWeaponHUD(root){
 const ammo=root.querySelector('#seed-pips'),controls=root.querySelector('.weapon-controls');
 const heading=document.createElement('div');heading.className='weapon-readout';
 heading.innerHTML='<span class="weapon-title"></span><span class="weapon-count"></span>';
 const status=document.createElement('div');status.className='weapon-status';
 root.insertBefore(heading,ammo);root.insertBefore(status,controls);
 const mines=document.createElement('div');mines.className='sidekick-mines';mines.hidden=true;
 mines.innerHTML='<span>mines</span><i aria-hidden="true"></i><i aria-hidden="true"></i>';root.insertBefore(mines,status);
 const mineSlots=[...mines.querySelectorAll('i')];
 const updateSightlineAmmo=createSightlineAmmo(root,heading),updateBlood=createIchorBloodHUD(root,heading);
 let current='',inputMode=null,lastCapacity=0,shownBinds=-1;
 const countEl=heading.querySelector('.weapon-count');
 return function update(sim,touch){
  updateSightlineAmmo(sim);updateBlood(sim);
  const id=sim.weapon||'static',config=WEAPON_UI[id]||WEAPON_UI.static;
  if(current!==id){
   current=id;root.dataset.weapon=id;root.style.setProperty('--weapon-accent',config.accent);
   heading.querySelector('.weapon-title').textContent=config.name;
   inputMode=null;
  }
  if(inputMode!==touch||shownBinds!==bindsVersion()){inputMode=touch;shownBinds=bindsVersion();controls.style.gridTemplateColumns=`repeat(${config.keyboard.length},minmax(0,1fr))`;controls.replaceChildren(...config[touch?'touch':'keyboard'].map(([key,label])=>{
   const item=document.createElement('span'),binding=document.createElement('kbd');binding.textContent=touch?key:displayKeys(key);item.append(binding,document.createTextNode(label));return item;
  }));}
  if(id==='ichor'){
   mines.hidden=true;const s=sim.ichor;setAttr(root,'data-breach','false');
   setText(status,s.frenzy>0?'FRENZY · '+s.frenzy.toFixed(1)+'s':s.trail?'BLOOD TRAIL · FASTER':'');return;
  }
  const sidekick=id==='sidekick',sk=sim.sidekick,skCap=SIDEKICK.magazine*(sk?.active?2:1);
  if(mines.hidden===sidekick)mines.hidden=!sidekick;
  if(sidekick){
   const charges=sk.mineCharges??SIDEKICK.mineLimit,refill=sk.mineCooldown>0?1-sk.mineCooldown/SIDEKICK.mineCooldown:0;
   setAttr(mines,'aria-label',sk.mineCooldown>0?`both mines recharging · ${Math.ceil(sk.mineCooldown)} seconds`:`${charges} ${charges===1?'mine':'mines'} ready`);
   for(let i=0;i<mineSlots.length;i++){setAttr(mineSlots[i],'data-ready',String(i<charges));setStyle(mineSlots[i],'--mine-fill',(i<charges?100:Math.max(0,Math.min(1,refill))*100)+'%');}
  }
  const sightline=id==='sightline',ss=sim.sightline,sniper=sightline&&(ss.crouched||ss.xLoading),sr=sightline?(sniper?ss.rifleReload:ss.pistolReload):0,sc=sniper?1:SIGHTLINE.pistolMagazine;
  const omen=id==='omen',shotgun=id==='shotgun',rifle=id==='rifle',presentation=sidekick?{capacity:skCap,rounds:sk.active>0?skCap:sk.reload>0?skCap*(1-sk.reload/SIDEKICK.reload):sk.ammo}:sightline?{capacity:sc,rounds:sr>0?sc*(1-sr/(sniper?SIGHTLINE.reload:SIGHTLINE.pistolReload)):sniper?ss.rifleAmmo:ss.pistolAmmo}:omen?{rounds:sim.omen.reload>0?OMEN.magazine*(1-sim.omen.reload/OMEN.reload):sim.omen.ammo,capacity:OMEN.magazine}:shotgun?shotgunAmmoPresentation(sim.shotgun):rifle?rifleAmmoPresentation(sim.rifle):null;
  const reloading=sidekick?sk.reload>0:sightline?sr>0:omen?sim.omen.reload>0:shotgun?sim.shotgun.reload>0:rifle&&sim.rifle.reload>0;
  if(ammo.dataset.reloading!==String(reloading))ammo.dataset.reloading=String(reloading);
  const deployed=sidekick||sightline||omen||rifle||shotgun?0:sim.seeds.length,rounds=sidekick||sightline||omen||shotgun||rifle?presentation.rounds:sim.ammo,available=Math.floor(rounds+1e-8);
  const capacity=sidekick||sightline||rifle?presentation.capacity:config.capacity;
  if(capacity!==lastCapacity){lastCapacity=capacity;ammo.dataset.capacity=String(capacity);ammo.replaceChildren(...Array.from({length:capacity},()=>document.createElement('i')));}
  // Static: a thin bar after the tenth orb in hand (RULES.hexCost: what the
  // hex needs; placed orbs come first on the bar), lit once you hold that many.
  const mark=!sidekick&&!sightline&&!omen&&!rifle&&!shotgun?deployed+RULES.hexCost:0;
  setAttr(ammo,'data-hex',mark?(available>=RULES.hexCost?'ready':'short'):'');
  const unlimited=!!((sidekick&&sk.active>0)||(rifle&&sim.surge?.active));
  setAttr(countEl,'data-unlimited',String(unlimited));
  setText(countEl,unlimited?'∞':`${available} / ${capacity}`);
  setAttr(root,'data-breach',String(sightline&&ss.special));
  setText(status,sidekick?(sk.summon>0?'DRAWING SECOND SIDEKICK':sk.reload>0?`RELOADING · ${sk.reload.toFixed(1)}s`:sk.active>0?`RUSH · ${sk.active.toFixed(1)}s · HOLD TO FIRE`:'READY'):sightline?(sr>0?`${sniper?'SIGHTLINE':'SIDEKICK'} RELOAD · ${sr.toFixed(1)}s`:sniper?ss.setup>0?`SETTING UP · ${ss.setup.toFixed(1)}s`:ss.commit>0?'SHOT COMMITTED':ss.special?'BREACH ROUND · READY':ss.rifleAmmo?'SIGHTLINE · READY':'SIGHTLINE · EMPTY':ss.special?'SIDEKICK · AMBER ROUND STOWED':'SIDEKICK · READY'):omen?(sim.omen.reload>0?`RELOADING · ${sim.omen.reload.toFixed(1)}s`:sim.omen.primed?`CURSE PRIMED · ${sim.omen.primeLeft.toFixed(1)}s`:available===0?'EMPTY · RELOAD':'READY'):shotgun?(sim.shotgun.reload?`RELOADING · ${sim.shotgun.reload.toFixed(1)}s`:sim.scatter?.armed?(scatterPrimeLeft(sim)>0?`BLAST CHARGING · ${scatterPrimeLeft(sim).toFixed(1)}s`:touch?'BLAST READY · TAP IT AGAIN':'BLAST READY · X TO FIRE'):sim.shotgun.ammo<=0?'EMPTY / RELOAD':sim.shotgun.aiming?'FOCUSED':'READY'):rifle?(sim.rifle.reload>0?`RELOADING · ${sim.rifle.reload.toFixed(1)}s`:available===0?'EMPTY · RELOAD':sim.rifle.aiming?'FOCUSED':'READY'):(deployed?`${deployed} DEPLOYED`:available<config.capacity?'RECHARGING':'READY'));
  for(let i=0;i<ammo.children.length;i++){const pip=ammo.children[i];
   const kind=i<deployed?'filled':i<deployed+available?'available':'spent';
   const fill=sidekick||sightline||omen||shotgun||rifle?(reloading?Math.max(0,Math.min(1,rounds-i))*100:0):(i===deployed+available?sim.rechargeProgress/sim.rechargeInterval*100:0);
   const cls=i===mark-1?kind+' hex-mark':kind;
   if(pip.className!==cls)pip.className=cls;
   setStyle(pip,'--refill',fill+'%');
  }
  setAttr(ammo,'aria-label',sidekick?(sk.active>0?'unlimited sidekick rounds during rush':`${available} sidekick rounds available`):sightline?`${available} ${sniper?'sightline':'sidekick'} rounds available`:omen?`${available} diamonds available`:shotgun?(reloading?`Reloading: ${available} of ${capacity} shells shown`:`${available} shells available`):rifle?(sim.surge?.active?'unlimited nominal rounds during nova':sim.rifle.reload>0?`Reloading: ${available} of ${capacity} rounds shown`:`${available} rounds available, magazine capacity ${capacity}`):`${available} orbs available, ${deployed} deployed`);
 };
}
