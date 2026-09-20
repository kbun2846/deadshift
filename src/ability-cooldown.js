// One presentation for Static and every conventional weapon ability.
export function bindAbilityCooldown(root){
 const status=root.querySelector('.hex-recharge-center span'),fill=root.querySelector('.hex-fill'),key=root.querySelector('kbd');
 return ({remaining,duration,binding,label})=>{
  remaining=Math.max(0,Math.min(duration,remaining));const ready=remaining<1e-8;
  status.textContent=ready?'READY':Math.ceil(remaining);key.textContent=binding;
  fill.style.strokeDashoffset=String(remaining/duration*100);root.classList.toggle('ready',ready);
  root.setAttribute('aria-valuemin','0');root.setAttribute('aria-valuemax',String(duration));
  root.setAttribute('aria-valuenow',String(Number((duration-remaining).toFixed(1))));
  root.setAttribute('aria-label',label);root.setAttribute('aria-valuetext',ready?'Ready':Math.ceil(remaining)+' seconds remaining. '+label);root.title=label;
 };
}
export function addAbilityCooldown(parent,id){
 const root=document.createElement('div');root.id=id;root.className='hex-recharge secondary-cooldown hidden';root.setAttribute('role','progressbar');
 root.innerHTML='<svg viewBox="0 0 72 72" aria-hidden="true"><circle class="hex-track" cx="36" cy="36" r="31"/><circle class="hex-fill" cx="36" cy="36" r="31" pathLength="100"/></svg><div class="hex-recharge-center"><span>READY</span><kbd>X</kbd></div>';
 parent.append(root);return {root,update:bindAbilityCooldown(root)};
}
