export function toggleDevOverrides(dev,keys){
 keys=keys.filter(key=>key!=='invulnerable');
 const active=keys.some(key=>key==='speed'?(dev.speed||1)!==1:!!dev[key]);
 for(const key of keys)dev[key]=key==='speed'?1:!active;
 return !active;
}
export function installDevTools(sim, panel, changed) {
  const root=document.createElement('section');root.className='dev-tools';
  root.innerHTML=`<h3>Developer tools</h3><form id="dev-unlock"><label>Practice password<input type="password" inputmode="numeric" autocomplete="off" aria-label="Developer password"/></label><button type="submit" class="secondary">UNLOCK</button><p role="status"></p></form><div id="dev-options" hidden><p class="small">Local practice tools · M opens teleport map</p><label class="setting">RUN SPEED<select data-dev="speed"><option value="1">1×</option><option value="2">2×</option><option value="4">4×</option></select></label>${[['teleport','Click map to teleport'],['ammo','Unlimited ammo'],['orbs','Unlimited floating orbs + no expiry'],['cooldowns','No X cooldown'],['stamina','Unlimited dodge stamina'],['invulnerable','Invulnerable (including fire)']].map(([id,label])=>`<label class="setting">${label}<input type="checkbox" data-dev="${id}"/></label>`).join('')}<button type="button" id="dev-refill" class="secondary">RESTORE HEALTH / AMMO / STAMINA</button><button type="button" id="dev-lock" class="secondary">DISABLE & LOCK TOOLS</button></div>`;
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
  const rifle=section('Nominal',[]);
  rifle.insertAdjacentHTML('beforeend','<label class="setting">Instant reload<input type="checkbox" data-dev="rifleInstantReload"/></label>');
  rifle.insertAdjacentHTML('beforeend','<label class="setting">No grenade cooldown<input type="checkbox" data-dev="grenadeCooldown"/></label>');
  rifle.insertAdjacentHTML('beforeend','<label class="setting">No extended magazine cooldown<input type="checkbox" data-dev="extendedCooldown"/></label>');
  const form=root.querySelector('form'),options=root.querySelector('#dev-options');
  options.querySelector('.small').textContent='Local practice tools · P toggles tools except invincibility · M opens teleport map';
  function unlock(code){
    if(code!=='1919')return false;
    unlocked=true;form.hidden=true;options.hidden=false;
    form.querySelector('input').value='';form.querySelector('[role=status]').textContent='';
    return true;
  }
  form.addEventListener('submit',e=>{
    e.preventDefault();const input=form.querySelector('input');
    if(!unlock(input.value)){form.querySelector('[role=status]').textContent='Incorrect password.';return;}
    sim.dev.teleport=true;root.querySelector('[data-dev=teleport]').checked=true;changed();
  });
  options.addEventListener('change',e=>{
    const key=e.target.dataset.dev;if(!unlocked||!key)return;
    sim.dev[key]=key==='speed'?Number(e.target.value):e.target.checked;changed();
  });
  root.querySelector('#dev-refill').onclick=()=>{sim.player.hp=sim.player.maxHp;sim.player.stamina=sim.maxStamina;sim.ammo=Math.max(0,12-sim.seeds.length-Math.ceil(sim.hexOrbs.length*10/6));sim.rifle.ammo=sim.rifle.capacity;sim.rifle.reload=0;sim.shotgun.ammo=2;sim.shotgun.reload=0;sim.shotgun.spent=0;sim.rifle.extendedCooldown=0;sim.hexCooldown=0;sim.grenadeCooldown=0;changed();};
  root.querySelector('#dev-lock').onclick=()=>{sim.dev={};unlocked=false;form.hidden=false;options.hidden=true;form.querySelector('[role=status]').textContent='';for(const input of options.querySelectorAll('input'))input.checked=false;options.querySelector('select').value='1';changed();};
  return {syncSpeed(){options.querySelector('[data-dev="speed"]').value=String(sim.dev.speed||1);},unlock,toggleAll(){
    if(!unlocked)return null;
    const inputs=[...options.querySelectorAll('[data-dev]')];
    const enabled=toggleDevOverrides(sim.dev,inputs.map(input=>input.dataset.dev));
    for(const input of inputs){if(input.tagName==='SELECT')input.value=String(sim.dev[input.dataset.dev]);else input.checked=!!sim.dev[input.dataset.dev];}
    changed();return enabled;
  }};
}
