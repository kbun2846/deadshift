import {refill} from './dev-window.js';
export function toggleDevOverrides(dev,keys){
 keys=keys.filter(key=>key!=='invulnerable');
 const active=keys.some(key=>key==='speed'?(dev.speed||1)!==1:!!dev[key]);
 for(const key of keys)dev[key]=key==='speed'?1:!active;
 return !active;
}
// Stands in for the panel when the markup it needs is not there. Every caller
// keeps working; the tools are simply absent and permanently locked.
const devToolsStub = () => ({ isUnlocked: () => false, syncSpeed() {}, unlock: () => false, toggleAll: () => null });

export function installDevTools(sim, panel, changed, hooks = {}) {
  // The developer panel is optional scaffolding, so it must never be able to
  // take the game down with it: an index.html that has gone out of step with
  // the script -- a stale deploy, say -- used to throw here and abort startup
  // entirely, leaving the menu on screen with nothing wired up behind it.
  if (!panel) return devToolsStub();
  const root=document.createElement('section');root.className='dev-tools';
  root.innerHTML=`<div id="dev-options" hidden><p class="small">Local practice tools · M opens teleport map</p><label class="setting select-setting">RUN SPEED<select data-dev="speed"><option value="1">1×</option><option value="2">2×</option><option value="4">4×</option></select></label>${[['teleport','Click map to teleport'],['ammo','Unlimited ammo'],['orbs','Unlimited floating orbs + no expiry'],['cooldowns','No X cooldown'],['stamina','Unlimited dodge stamina'],['invulnerable','Invulnerable (including fire)']].map(([id,label])=>`<label class="setting">${label}<input type="checkbox" data-dev="${id}"/></label>`).join('')}<button type="button" id="dev-refill" class="secondary plain-text">RESTORE HEALTH / AMMO / STAMINA</button><button type="button" id="dev-lock" class="secondary plain-text">DISABLE & LOCK TOOLS</button></div>`;
  panel.append(root);let unlocked=false;
  const optionsPanel=root.querySelector('#dev-options');
  const section=(title,keys)=>{
    const group=document.createElement('details');group.className='weapon-control-entry dev-section';
    const heading=document.createElement('summary');heading.textContent=title;group.append(heading);
    for(const key of keys){const control=root.querySelector(`[data-dev="${key}"]`);if(control)group.append(control.closest('.setting'));}
    optionsPanel.insertBefore(group,root.querySelector('#dev-refill'));return group;
  };
  section('General',['speed','teleport','ammo','stamina','invulnerable']);
  section('Static',['orbs','cooldowns']);
  const ballast=section('Ballast',[]);ballast.insertAdjacentHTML('beforeend','<label class="setting">Instant reload<input type="checkbox" data-dev="shotgunInstantReload"/></label>');
  if(hooks.spawnBird){
    const world=section('World',[]);
    world.insertAdjacentHTML('beforeend','<button type="button" id="dev-bird" class="secondary plain-text">SPAWN BIRD</button>');
    world.querySelector('#dev-bird').onclick=()=>{
      const name=hooks.spawnBird();
      if(name)world.querySelector('#dev-bird').textContent='SPAWN BIRD · '+String(name).toUpperCase();
    };
  }
  const rifle=section('Nominal',[]);
  const options=root.querySelector('#dev-options');
  options.querySelector('.small').textContent='Local practice tools · P toggles tools except invincibility · M opens teleport map';
  function unlock(code){
    if(code!=='1919')return false;
    unlocked=true;options.hidden=false;hooks.onUnlock?.();
    return true;
  }
  options.addEventListener('change',e=>{
    const key=e.target.dataset.dev;if(!unlocked||!key)return;
    sim.dev[key]=key==='speed'?Number(e.target.value):e.target.checked;changed();
  });
  root.querySelector('#dev-refill').onclick=()=>{refill(sim);changed();};
  root.querySelector('#dev-lock').onclick=()=>{sim.dev={};unlocked=false;options.hidden=true;for(const input of options.querySelectorAll('input'))input.checked=false;options.querySelector('select').value='1';hooks.onLock?.();changed();};
  return {isUnlocked(){return unlocked;},syncSpeed(){options.querySelector('[data-dev="speed"]').value=String(sim.dev.speed||1);},unlock,toggleAll(){
    if(!unlocked)return null;
    const inputs=[...options.querySelectorAll('[data-dev]')];
    const enabled=toggleDevOverrides(sim.dev,inputs.map(input=>input.dataset.dev));
    for(const input of inputs){if(input.tagName==='SELECT')input.value=String(sim.dev[input.dataset.dev]);else input.checked=!!sim.dev[input.dataset.dev];}
    changed();return enabled;
  }};
}
