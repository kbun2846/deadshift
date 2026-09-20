// Shared presentation contract: name, accent, capacity, ammo, status, and controls.
import { RIFLE } from './rifle.js';
import { SHOTGUN, shotgunReloadRounds } from './shotgun.js';
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
export const WEAPON_UI={
 shotgun:{name:'Ballast',accent:'#e6bd8e',capacity:2,keyboard:[['LMB','CHARGE / RELEASE'],['Q','STORE'],['RMB','FOCUS / STORE'],['E','DOUBLE'],['R','RELOAD']],touch:[['FIRE','HOLD / RELEASE'],['LOCK','STORE'],['AIM','FOCUS'],['DOUBLE','TAP'],['RELOAD','TAP']]},
 static:{name:'Static',accent:'#b8e6ef',capacity:12,keyboard:[['E','PLACE'],['LMB / Q','LAUNCH'],['C','STREAM']],touch:[['PLACE','HOLD'],['LAUNCH','TAP'],['STREAM','HOLD']]},
 rifle:{name:'Nominal',accent:'#e1cca2',capacity:18,keyboard:[['LMB / Q','FIRE / HOLD'],['RMB / SHIFT','AIM'],['R','RELOAD'],['E','GRENADE'],['X','36 ROUNDS']],touch:[['FIRE','HOLD'],['AIM','HOLD'],['RELOAD','TAP'],['GRENADE','TAP'],['EXTEND','36 ROUNDS']]},
};
export function createWeaponHUD(root){
 const ammo=root.querySelector('#seed-pips'),controls=root.querySelector('.weapon-controls');
 const heading=document.createElement('div');heading.className='weapon-readout';
 heading.innerHTML='<span class="weapon-title"></span><span class="weapon-count"></span>';
 const status=document.createElement('div');status.className='weapon-status';
 root.insertBefore(heading,ammo);root.insertBefore(status,controls);
 let current='',inputMode=null,lastCapacity=0;
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
  ammo.dataset.reloading=String(reloading);
  const deployed=rifle||shotgun?0:sim.seeds.length,rounds=shotgun||rifle?presentation.rounds:sim.ammo,available=Math.floor(rounds+1e-8);
  const capacity=rifle?presentation.capacity:config.capacity;
  if(capacity!==lastCapacity){lastCapacity=capacity;ammo.dataset.capacity=String(capacity);ammo.replaceChildren(...Array.from({length:capacity},()=>document.createElement('i')));}
  heading.querySelector('.weapon-count').textContent=`${available} / ${capacity}`;
  status.textContent=shotgun?(sim.shotgun.reload?`RELOADING · ${sim.shotgun.reload.toFixed(1)}s`:sim.shotgun.ammo<=0?'EMPTY / RELOAD':sim.shotgun.stored?`${Math.round(sim.shotgun.charge*100)}% · ${sim.shotgun.hold.toFixed(1)}s`:`${Math.round(sim.shotgun.charge*100)}% CHARGE`):rifle?(sim.rifle.reload>0?`RELOADING · ${sim.rifle.reload.toFixed(1)}s`:available===0?'EMPTY · RELOAD':sim.rifle.aiming?'FOCUSED':'READY'):(deployed?`${deployed} DEPLOYED`:available<config.capacity?'RECHARGING':'READY');
  [...ammo.children].forEach((pip,i)=>{
   pip.className=i<deployed?'filled':i<deployed+available?'available':'spent';
   const fill=shotgun||rifle?(reloading?Math.max(0,Math.min(1,rounds-i))*100:0):(i===deployed+available?sim.rechargeProgress/sim.rechargeInterval*100:0);
   pip.style.setProperty('--refill',fill+'%');
  });
  ammo.setAttribute('aria-label',shotgun?(reloading?`Reloading: ${available} of ${capacity} shells shown`:`${available} shells available`):rifle?(sim.rifle.reload>0?`Reloading: ${available} of ${capacity} rounds shown`:`${available} rounds available, magazine capacity ${capacity}`):`${available} orbs available, ${deployed} deployed`);
 };
}
