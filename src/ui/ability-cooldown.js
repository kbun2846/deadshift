import { displayKeys } from '../config/keybinds.js';
// One presentation for Static and every conventional weapon ability.
import { setText, setStyle, setAttr } from './dom-writes.js';
export function bindAbilityCooldown(root){
 const status=root.querySelector('.hex-recharge-center span'),fill=root.querySelector('.hex-fill'),key=root.querySelector('kbd');
 return ({remaining,duration,binding,label,text})=>{
  remaining=Math.max(0,Math.min(duration,remaining));const ready=remaining<1e-8;
  setText(status,text??(ready?'READY':Math.ceil(remaining)));const word=text!=null;if(root.classList.contains('word')!==word)root.classList.toggle('word',word);setText(key,displayKeys(binding));
  setStyle(fill,'strokeDashoffset',remaining/duration*100);if(root.classList.contains('ready')!==ready)root.classList.toggle('ready',ready);
  setAttr(root,'aria-valuemin','0');setAttr(root,'aria-valuemax',duration);
  setAttr(root,'aria-valuenow',Number((duration-remaining).toFixed(1)));
  setAttr(root,'aria-label',label);setAttr(root,'aria-valuetext',ready?'Ready':Math.ceil(remaining)+' seconds remaining. '+label);setAttr(root,'title',label);
 };
}
export function addAbilityCooldown(parent,id){
 const root=document.createElement('div');root.id=id;root.className='hex-recharge secondary-cooldown hidden';root.setAttribute('role','progressbar');
 root.innerHTML='<svg viewBox="0 0 72 72" aria-hidden="true"><circle class="hex-track" cx="36" cy="36" r="31"/><circle class="hex-fill" cx="36" cy="36" r="31" pathLength="100"/></svg><div class="hex-recharge-center"><span>READY</span><kbd>X</kbd></div>';
 parent.append(root);return {root,update:bindAbilityCooldown(root)};
}
