// The ability readouts beside the ammo: dodge stamina pips, the main ability
// dial (Static's hex, Nominal's grenade, Ballast's stored charge), Nominal's
// big-magazine dial, and the (visually retired, still announced) charge meter.
import { RULES, RIFLE, GRENADE, SHOTGUN } from './config/gameplay.js';
import { bindAbilityCooldown, addAbilityCooldown } from './ability-cooldown.js';
const byId = id => document.getElementById(id);

export function createAbilityHUD() {
 const updatePrimaryCooldown = bindAbilityCooldown(byId('hex-recharge'));
 const extendedCooldownUI = addAbilityCooldown(byId('weapon'), 'extended-recharge');
 return { update(sim) {
  const rifle = sim.weapon === 'rifle';
  const stamina = sim.player.stamina;
  if(byId('dodge-stamina').children.length!==sim.maxStamina){byId('dodge-stamina').replaceChildren(...Array.from({length:sim.maxStamina},()=>document.createElement('i')));}
  byId('dodge-stamina').setAttribute('aria-label', Math.floor(stamina + 1e-8) + ' dodges available');
  [...byId('dodge-stamina').children].forEach((pip, i) => pip.style.setProperty('--stamina-fill', (Math.max(0, Math.min(1, stamina - i)) * 100) + '%'));
  const remaining = Math.max(0, rifle?sim.grenadeCooldown:sim.hexCooldown), ready = remaining < 1e-8, cooldown=rifle?GRENADE.cooldown:RULES.hexCooldown;
  const hexHint = rifle?(ready?'Grenade ready':'Grenade recharging'):sim.hexOrbs.length ? (sim.hexOrbs[0].age<RULES.hexFormationTime?'Hex forming':'Press X to pulse') : sim.hexSpin ? 'Hex spinning' : ready ? 'Hex ability ready' : 'Hex recharging';
  updatePrimaryCooldown(sim.weapon==='shotgun'?{remaining:sim.shotgun.stored?sim.shotgun.hold:0,duration:SHOTGUN.holdTime,binding:'SHIFT / RMB',label:sim.shotgun.stored?'Stored charge expires':'Hold LMB / Q to charge'}:{remaining,duration:cooldown,binding:rifle?'E':'X',label:hexHint});
  extendedCooldownUI.root.classList.toggle('hidden',!rifle);
  if(rifle)extendedCooldownUI.update({remaining:sim.rifle.extendedCooldown,duration:RIFLE.extendedCooldown,binding:'X',label:sim.rifle.extendedCooldown<1e-8?'36-round magazine ready':'36-round magazine recharging'});
  const expanding=sim.hexOrbs[0],range=sim.weapon==='shotgun'?sim.shotgun.charge:expanding?Math.min(1,Math.hypot(expanding.x-expanding.originX,expanding.z-expanding.originZ)/RULES.hexRange):0;
  byId('hex-range').classList.toggle('hidden',!expanding&&sim.weapon!=='shotgun');
  byId('hex-range-fill').style.transform=`scaleY(${range})`;
  byId('hex-range').classList.toggle('near-limit',range>=.75);
  byId('hex-range').classList.toggle('at-limit',range>=.9);
  byId('hex-range').setAttribute('aria-valuenow',String(Math.round(range*100)));
  const rangeHint=sim.weapon==='shotgun'?`${Math.round(range*100)}% charge · ${sim.shotgun.stored?sim.shotgun.hold.toFixed(1)+'s stored':'hold LMB / Q; SHIFT / RMB to store'}`:`${Math.round(range*100)}% to boundary · ${Math.max(0,(RULES.hexRange-(expanding?.age||0)*RULES.hexSpeed)/RULES.hexSpeed).toFixed(1)}s until expiry`;
  byId('hex-range').setAttribute('aria-valuetext',rangeHint);byId('hex-range').title=rangeHint;
 } };
}
