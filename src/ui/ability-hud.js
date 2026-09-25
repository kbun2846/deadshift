// The ability readouts beside the ammo: dodge stamina pips, the main ability
// dial (Static's hex, Nominal's grenade, Ballast's blast), Nominal's
// nova dial (the X abilities: hex, nova, blast; a ready one shows its name), and the (visually retired, still announced) charge meter.
import { RULES, GRENADE, SURGE, SCATTER } from '../config/gameplay.js';
import { bindAbilityCooldown, addAbilityCooldown } from './ability-cooldown.js';
import { setStyle, setAttr } from './dom-writes.js';
import { xAbilityState } from './x-ability-state.js';
const byId = id => document.getElementById(id);

export function createAbilityHUD() {
 const updatePrimaryCooldown = bindAbilityCooldown(byId('hex-recharge'));
 const extendedCooldownUI = addAbilityCooldown(byId('weapon'), 'extended-recharge');
 return { update(sim) {
  const rifle = sim.weapon === 'rifle';
  const stamina = sim.player.stamina;
  if(byId('dodge-stamina').children.length!==sim.maxStamina){byId('dodge-stamina').replaceChildren(...Array.from({length:sim.maxStamina},()=>document.createElement('i')));}
  setAttr(byId('dodge-stamina'), 'aria-label', Math.floor(stamina + 1e-8) + ' dodges available');
  const pips = byId('dodge-stamina').children;
  for (let i = 0; i < pips.length; i++) setStyle(pips[i], '--stamina-fill', (Math.max(0, Math.min(1, stamina - i)) * 100) + '%');
  const remaining = Math.max(0, rifle?sim.grenadeCooldown:sim.hexCooldown), ready = remaining < 1e-8, cooldown=rifle?GRENADE.cooldown:RULES.hexCooldown;
  const hexHint = rifle?(ready?'Grenade ready':'Grenade recharging'):sim.hexOrbs.length ? (sim.hexOrbs[0].age<RULES.hexFormationTime?'Hex forming':'Press X to pulse') : sim.hexSpin ? 'Hex spinning' : ready ? 'Hex ability ready' : 'Hex recharging';
  updatePrimaryCooldown(sim.weapon==='shotgun'?{remaining:sim.scatter?.cooldown||0,duration:SCATTER.cooldown,binding:'X',label:sim.scatter?.armed?'Blast ready to fire: press X':sim.scatterShells?.length?'Blast in the air':(sim.scatter?.cooldown||0)>1e-8?'Blast recharging':'Blast ready',text:sim.scatter?.armed?'FIRE':sim.scatterShells?.length?'LIVE':(sim.scatter?.cooldown||0)>1e-8?undefined:'BLAST'}:{remaining,duration:cooldown,binding:rifle?'E':'X',label:hexHint,text:!rifle&&sim.hexOrbs.length?(sim.hexOrbs[0].age<RULES.hexFormationTime?'FORM':'PULSE'):!rifle&&sim.hexSpin?'LIVE':!rifle&&ready?(sim.ammo>=RULES.hexCost?'HEX':Math.floor(sim.ammo)+'/'+RULES.hexCost):undefined});
  extendedCooldownUI.root.classList.toggle('hidden',!rifle);
  if(rifle){const s=sim.surge||{phase:'idle',cooldown:0,t:0};const live=s.phase!=='idle';
   extendedCooldownUI.update({remaining:live?(s.phase==='active'?SURGE.duration-s.t:SURGE.charge-s.t):s.cooldown,duration:live?(s.phase==='active'?SURGE.duration:SURGE.charge):SURGE.cooldown,binding:'X',text:s.phase==='charging'?'CHARGE':s.phase==='idle'&&s.cooldown<1e-8?'NOVA':undefined,label:s.phase==='active'?'Nova':s.phase==='charging'?'Nova charging':s.cooldown<1e-8?'Nova ready':'Nova recharging'});}
  // The X ability's state colours its dial and its touch button (x-ability-state.js).
  const x=xAbilityState(sim)||'';
  setAttr(byId('hex-recharge'),'data-x-state',rifle?'':x);
  setAttr(extendedCooldownUI.root,'data-x-state',rifle?x:'');
  const touchX=byId('touch-hex'),touchSurge=byId('touch-extended');
  // Seconds left, shown under the touch label while recharging or running.
  const su=sim.surge,left=x==='cooldown'?(rifle?su.cooldown:sim.weapon==='shotgun'?sim.scatter.cooldown:sim.hexCooldown):x==='active'&&rifle?SURGE.duration-su.t:0,leftText=left>0?String(Math.ceil(left)):'';
  const hexButton=sim.weapon==='static';
  if(touchX){setAttr(touchX,'data-x-state',hexButton?x:'');setAttr(touchX,'data-x-left',hexButton?leftText:'');}
  const extendedX=rifle||sim.weapon==='shotgun';
  if(touchSurge){setAttr(touchSurge,'data-x-state',extendedX?x:'');setAttr(touchSurge,'data-x-left',extendedX?leftText:'');}
  const expanding=sim.weapon==='static'?sim.hexOrbs[0]:null,range=expanding?Math.min(1,Math.hypot(expanding.x-expanding.originX,expanding.z-expanding.originZ)/RULES.hexRange):0;
  byId('hex-range').classList.toggle('hidden',!expanding);
  setStyle(byId('hex-range-fill'),'transform',`scaleY(${range})`);
  byId('hex-range').classList.toggle('near-limit',range>=.75);
  byId('hex-range').classList.toggle('at-limit',range>=.9);
  setAttr(byId('hex-range'),'aria-valuenow',Math.round(range*100));
  const rangeHint=`${Math.round(range*100)}% to boundary · ${Math.max(0,(RULES.hexRange-(expanding?.age||0)*RULES.hexSpeed)/RULES.hexSpeed).toFixed(1)}s until expiry`;
  setAttr(byId('hex-range'),'aria-valuetext',rangeHint);setAttr(byId('hex-range'),'title',rangeHint);
 } };
}
