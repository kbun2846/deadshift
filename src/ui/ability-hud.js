import {createIchorAbilityBlood} from './ichor-blood-hud.js';
import { createDodgeHUD } from './dodge-hud.js';
// The ability readouts beside the ammo: dodge charges (dodge-hud.js, also
// inside the touch DODGE button), the main ability
// dial (Static's hex, Nominal's grenade, Ballast's blast), Nominal's
// nova dial (the X abilities: hex, nova, blast; a ready one shows its name), and the (visually retired, still announced) charge meter.
import { SHEATH, ICHOR, SIDEKICK, SIGHTLINE, RULES, GRENADE, SURGE, SCATTER } from '../config/gameplay.js';
import { scatterPrimeLeft } from '../weapons/scatter.js';
import { bindAbilityCooldown, addAbilityCooldown } from './ability-cooldown.js';
import { setStyle, setAttr } from './dom-writes.js';
import { xAbilityState } from './x-ability-state.js';
import { omenReadouts } from './omen-state.js';
const byId = id => document.getElementById(id);

export function createAbilityHUD() {
 const updatePrimaryCooldown = bindAbilityCooldown(byId('hex-recharge'));
 const extendedCooldownUI = addAbilityCooldown(byId('weapon'), 'extended-recharge');
 const deflectCooldownUI=addAbilityCooldown(byId('weapon'),'ichor-deflect-recharge');
 const dodgeHUD=createDodgeHUD(byId('dodge-stamina'),byId('touch-dodge'));
 const updateBloodEffects=createIchorAbilityBlood(['hex-recharge','extended-recharge','touch-grenade','touch-extended'].map(byId));
 return { update(sim) {
  updateBloodEffects(sim);
  const isIchor=sim.weapon==='ichor';deflectCooldownUI.root.classList.toggle('hidden',!isIchor);
  if(isIchor){const s=sim.ichor;deflectCooldownUI.update({remaining:s.guardCooldown||0,duration:ICHOR.guardCooldown,binding:'RMB /\nLEFT SHIFT',text:s.guardCooldown>0?undefined:'',label:'deflect'});setAttr(deflectCooldownUI.root,'data-state',s.guardCooldown>0?'cooldown':s.guarding?'active':'ready');}
  const rifle = sim.weapon === 'rifle';
  dodgeHUD.update(sim);
  for(const id of ['hex-recharge','extended-recharge','touch-grenade','touch-extended'])if(byId(id))setAttr(byId(id),'data-ichor-full',String(sim.weapon==='ichor'&&sim.ichor.blood>=ICHOR.meterMax));
  for(const id of ['hex-recharge','touch-grenade'])if(byId(id)){const locked=String(sim.weapon==='ichor'&&sim.ichor.blood<ICHOR.eBlood);setAttr(byId(id),'data-ichor-locked',locked);if(id==='touch-grenade')setAttr(byId(id),'aria-disabled',locked);}
  if(sim.weapon==='ichor'){
   const s=sim.ichor,locked=s.blood<ICHOR.eBlood;updatePrimaryCooldown({remaining:s.eCooldown,duration:ICHOR.eCooldown,binding:'E',text:locked?'50%':s.eCooldown>0?undefined:'SLASH',label:locked?'blood slash · requires 50% blood':'blood slash',disabled:locked});extendedCooldownUI.root.classList.remove('hidden');
   extendedCooldownUI.update({remaining:s.frenzy||s.xCooldown,duration:s.frenzy?ICHOR.hits*ICHOR.frenzyInterval:ICHOR.xCooldown,binding:'X',text:s.frenzy>0?undefined:s.xCooldown>0?undefined:'FRENZY',label:'frenzy · drains health'});
   for(const id of ['hex-recharge','extended-recharge','touch-grenade','touch-extended'])setAttr(byId(id),'data-omen-optimal','false');
   for(const id of ['hex-recharge','touch-grenade'])setAttr(byId(id),'data-x-state',locked?'locked':s.eCooldown>0?'cooldown':'ready');
   for(const id of ['extended-recharge','touch-extended'])setAttr(byId(id),'data-x-state',xAbilityState(sim));
   for(const [id,left]of [['touch-grenade',s.eCooldown],['touch-extended',s.frenzy||s.xCooldown]])setAttr(byId(id),'data-x-left',id==='touch-grenade'&&locked?'50%':left>0?String(Math.ceil(left)):'');
   byId('hex-range').classList.add('hidden');return;
  }
  if(sim.weapon==='sheath'){
   // Gold Rush on E (blue while it runs), the Draw-cut on X.
   const s=sim.sheath,x=xAbilityState(sim),e=s.rush>0?'active':s.eCooldown>0?'cooldown':'ready';
   for(const id of ['hex-recharge','extended-recharge','touch-grenade','touch-extended'])if(byId(id))setAttr(byId(id),'data-omen-optimal','false');
   updatePrimaryCooldown({remaining:s.rush||s.eCooldown,duration:s.rush?SHEATH.rushDuration:SHEATH.eCooldown,binding:'E',text:s.rush>0?undefined:s.eCooldown>0?undefined:'RUSH',label:s.rush>0?'gold rush · running':'gold rush'});
   extendedCooldownUI.root.classList.remove('hidden');
   extendedCooldownUI.update({remaining:s.xCooldown,duration:SHEATH.xCooldown,binding:'X',text:s.xCooldown>0?undefined:'DRAW',label:'draw-cut'});
   setAttr(byId('hex-recharge'),'data-x-state',e);setAttr(extendedCooldownUI.root,'data-x-state',x);
   for(const [id,state,left] of [['touch-grenade',e,s.rush||s.eCooldown],['touch-extended',x,s.xCooldown]]){setAttr(byId(id),'data-x-state',state);setAttr(byId(id),'data-x-left',left>0?String(Math.ceil(left)):'');}
   byId('hex-range').classList.add('hidden');return;
  }
  if(sim.weapon==='sidekick'){

   const s=sim.sidekick,x=xAbilityState(sim);
   for(const id of ['hex-recharge','extended-recharge','touch-grenade','touch-extended'])if(byId(id))setAttr(byId(id),'data-omen-optimal','false');
   updatePrimaryCooldown({remaining:s.mineCooldown,duration:SIDEKICK.mineCooldown,binding:'E',text:s.mineCooldown>0?undefined:'MINE',label:s.mineCooldown>0?'both mines recharging':`${s.mineCharges} ${s.mineCharges===1?'mine':'mines'} ready`});
   extendedCooldownUI.root.classList.remove('hidden');
   extendedCooldownUI.update({remaining:s.summon||s.active||s.xCooldown,duration:s.summon?SIDEKICK.summon:s.active?SIDEKICK.duration:SIDEKICK.xCooldown,binding:'X',text:s.summon?'DRAW':s.active?undefined:s.xCooldown>0?undefined:'RUSH',label:s.active?'rush · hold to fire':'summon a second sidekick'});
   setAttr(byId('hex-recharge'),'data-x-state',s.mineCooldown>0?'cooldown':'ready');setAttr(extendedCooldownUI.root,'data-x-state',x);
   for(const [id,state,left] of [['touch-grenade',s.mineCooldown>0?'cooldown':'ready',s.mineCooldown],['touch-extended',x,s.active||s.xCooldown]]){setAttr(byId(id),'data-x-state',state);setAttr(byId(id),'data-x-left',left>0?String(Math.ceil(left)):'');}
   byId('hex-range').classList.add('hidden');return;
  }
  if(sim.weapon==='sightline'){

   const s=sim.sightline,x=xAbilityState(sim);
   for(const id of ['hex-recharge','extended-recharge','touch-grenade','touch-extended'])if(byId(id))setAttr(byId(id),'data-omen-optimal','false');
   updatePrimaryCooldown({remaining:s.setup||0,duration:SIGHTLINE.setupDuration,binding:'E',text:s.setup>0?'SETUP':s.crouched?'STAND':'CROUCH',label:s.setup>0?'setting up sightline — E cancels':s.crouched?'stand and draw sidekick':'crouch and draw sightline'});
   extendedCooldownUI.root.classList.remove('hidden');
   extendedCooldownUI.update({remaining:s.xLoading?s.rifleReload:s.xCooldown,duration:s.xLoading?SIGHTLINE.reload:SIGHTLINE.xCooldown,binding:'X',text:s.xLoading?'LOAD':s.special?(s.crouched?'FIRE':'ARMED'):s.xCooldown>0?undefined:'BREACH',label:s.special?'amber round loaded':s.xLoading?'loading explosive round':'breach round'});
   setAttr(byId('hex-recharge'),'data-x-state',s.crouched?'active':'ready');setAttr(extendedCooldownUI.root,'data-x-state',x);
   for(const id of ['touch-extended']){setAttr(byId(id),'data-x-state',x);setAttr(byId(id),'data-x-left',s.xCooldown>0?String(Math.ceil(s.xCooldown)):'');}
   byId('hex-range').classList.add('hidden');return;
  }
  if(sim.weapon==='omen'){
   const {primary,secondary}=omenReadouts(sim.omen);
   updatePrimaryCooldown(primary);
   extendedCooldownUI.root.classList.remove('hidden');
   extendedCooldownUI.update(secondary);
   setAttr(byId('hex-recharge'),'data-x-state',primary.state);setAttr(extendedCooldownUI.root,'data-x-state',secondary.state);
   setAttr(byId('hex-recharge'),'data-omen-optimal',String(primary.optimal));setAttr(extendedCooldownUI.root,'data-omen-optimal',String(secondary.optimal));
   for(const [root,state] of [[byId('touch-grenade'),primary],[byId('touch-extended'),secondary],[byId('touch-stream'),{state:'',remaining:0}],[byId('touch-hex'),{state:'',remaining:0}]]){
    if(root){setAttr(root,'data-x-state',state.state);setAttr(root,'data-x-left',String(Math.ceil(state.remaining)||''));setAttr(root,'data-omen-optimal',String(!!state.optimal));}
   }
   byId('hex-range').classList.add('hidden');return;
  }
  for(const id of ['touch-grenade','touch-stream'])if(byId(id)){setAttr(byId(id),'data-x-state','');setAttr(byId(id),'data-x-left','');}
  for(const id of ['hex-recharge','extended-recharge','touch-grenade','touch-extended'])if(byId(id))setAttr(byId(id),'data-omen-optimal','false');
  const remaining = Math.max(0, rifle?sim.grenadeCooldown:sim.hexCooldown), ready = remaining < 1e-8, cooldown=rifle?GRENADE.cooldown:RULES.hexCooldown;
  const hexHint = rifle?(ready?'Grenade ready':'Grenade recharging'):sim.hexOrbs.length ? (sim.hexOrbs[0].age<RULES.hexFormationTime?'Hex forming':'Press X to pulse') : sim.hexSpin ? 'Hex spinning' : ready ? 'Hex ability ready' : 'Hex recharging';
  updatePrimaryCooldown(sim.weapon==='shotgun'?{remaining:sim.scatter?.cooldown||0,duration:SCATTER.cooldown,binding:'X',label:sim.scatter?.armed?(scatterPrimeLeft(sim)>0?'Blast charging':'Blast ready to fire: press X'):sim.scatterShells?.length?'Blast in the air':(sim.scatter?.cooldown||0)>1e-8?'Blast recharging':'Blast ready',text:sim.scatter?.armed?(scatterPrimeLeft(sim)>0?String(Math.ceil(scatterPrimeLeft(sim))):'FIRE'):sim.scatterShells?.length?'LIVE':(sim.scatter?.cooldown||0)>1e-8?undefined:'BLAST'}:{remaining,duration:cooldown,binding:rifle?'E':'X',label:hexHint,text:!rifle&&sim.hexOrbs.length?(sim.hexOrbs[0].age<RULES.hexFormationTime?'FORM':'PULSE'):!rifle&&sim.hexSpin?'LIVE':!rifle&&ready?(sim.ammo>=RULES.hexCost?'HEX':Math.floor(sim.ammo)+'/'+RULES.hexCost):undefined});
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
