// Shared presentation contract: name, accent, capacity, ammo, status, and controls.
import { RIFLE } from '../weapons/rifle.js';
import { scatterPrimeLeft } from '../weapons/scatter.js';
import { WEAPONS } from '../items.js';
import { SHOTGUN, shotgunReloadRounds } from '../weapons/shotgun.js';
import { setText, setStyle, setAttr } from './dom-writes.js';
import { RULES } from '../config/gameplay.js';
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
 let current='',inputMode=null,lastCapacity=0;
 const countEl=heading.querySelector('.weapon-count');
 return function update(sim,touch){
  const id=sim.weapon||'static',config=WEAPON_UI[id]||WEAPON_UI.static;
  if(current!==id){
   current=id;root.dataset.weapon=id;root.style.setProperty('--weapon-accent',config.accent);
   heading.querySelector('.weapon-title').textContent=config.name;
   inputMode=null;
  }
  if(inputMode!==touch){inputMode=touch;controls.style.gridTemplateColumns=`repeat(${config.keyboard.length},minmax(0,1fr))`;controls.replaceChildren(...config[touch?'touch':'keyboard'].map(([key,label])=>{
   const item=document.createElement('span'),binding=document.createElement('kbd');binding.textContent=key;item.append(binding,document.createTextNode(label));return item;
  }));}
  const shotgun=id==='shotgun',rifle=id==='rifle',presentation=shotgun?shotgunAmmoPresentation(sim.shotgun):rifle?rifleAmmoPresentation(sim.rifle):null;
  const reloading=shotgun?sim.shotgun.reload>0:rifle&&sim.rifle.reload>0;
  if(ammo.dataset.reloading!==String(reloading))ammo.dataset.reloading=String(reloading);
  const deployed=rifle||shotgun?0:sim.seeds.length,rounds=shotgun||rifle?presentation.rounds:sim.ammo,available=Math.floor(rounds+1e-8);
  const capacity=rifle?presentation.capacity:config.capacity;
  if(capacity!==lastCapacity){lastCapacity=capacity;ammo.dataset.capacity=String(capacity);ammo.replaceChildren(...Array.from({length:capacity},()=>document.createElement('i')));}
  // Static: a thin bar after the tenth orb in hand (RULES.hexCost: what the
  // hex needs; placed orbs come first on the bar), lit once you hold that many.
  const mark=!rifle&&!shotgun?deployed+RULES.hexCost:0;
  setAttr(ammo,'data-hex',mark?(available>=RULES.hexCost?'ready':'short'):'');
  setText(countEl,`${available} / ${capacity}`);
  setText(status,shotgun?(sim.shotgun.reload?`RELOADING · ${sim.shotgun.reload.toFixed(1)}s`:sim.scatter?.armed?(scatterPrimeLeft(sim)>0?`BLAST CHARGING · ${scatterPrimeLeft(sim).toFixed(1)}s`:touch?'BLAST READY · TAP IT AGAIN':'BLAST READY · X TO FIRE'):sim.shotgun.ammo<=0?'EMPTY / RELOAD':sim.shotgun.aiming?'FOCUSED':'READY'):rifle?(sim.rifle.reload>0?`RELOADING · ${sim.rifle.reload.toFixed(1)}s`:available===0?'EMPTY · RELOAD':sim.rifle.aiming?'FOCUSED':'READY'):(deployed?`${deployed} DEPLOYED`:available<config.capacity?'RECHARGING':'READY'));
  for(let i=0;i<ammo.children.length;i++){const pip=ammo.children[i];
   const kind=i<deployed?'filled':i<deployed+available?'available':'spent';
   const fill=shotgun||rifle?(reloading?Math.max(0,Math.min(1,rounds-i))*100:0):(i===deployed+available?sim.rechargeProgress/sim.rechargeInterval*100:0);
   const cls=i===mark-1?kind+' hex-mark':kind;
   if(pip.className!==cls)pip.className=cls;
   setStyle(pip,'--refill',fill+'%');
  }
  setAttr(ammo,'aria-label',shotgun?(reloading?`Reloading: ${available} of ${capacity} shells shown`:`${available} shells available`):rifle?(sim.rifle.reload>0?`Reloading: ${available} of ${capacity} rounds shown`:`${available} rounds available, magazine capacity ${capacity}`):`${available} orbs available, ${deployed} deployed`);
 };
}
