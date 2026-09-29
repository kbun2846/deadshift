import { SIGHTLINE as S } from '../config/gameplay.js';
import { setText, setAttr, setStyle } from './dom-writes.js';

export function sightlineAmmoPresentation(s){
 const rifle=!!s.crouched||s.rifleReload>0;
 return [
  {id:'sidekick',name:'sidekick',active:!rifle,capacity:S.pistolMagazine,ammo:s.pistolAmmo,reload:s.pistolReload,duration:S.pistolReload},
  {id:'rifle',name:'sightline',active:rifle,capacity:1,ammo:s.rifleAmmo,reload:s.rifleReload,duration:S.reload,armed:!!s.special}
 ];
}
export function createSightlineAmmo(root,before){
 const panel=document.createElement('div');panel.id='sightline-ammo';panel.className='sightline-ammo';panel.hidden=true;
 const rows=['sidekick','rifle'].map((id,index)=>{
  const row=document.createElement('div');row.className='sightline-ammo-row';row.dataset.gun=id;
  row.innerHTML='<div class="sightline-ammo-label"><span></span><b></b></div><div class="sightline-pips"></div>';
  const pips=row.querySelector('.sightline-pips');for(let i=0;i<(index?1:S.pistolMagazine);i++)pips.append(document.createElement('i'));
  panel.append(row);return {row,label:row.querySelector('span'),count:row.querySelector('b'),pips};
 });root.insertBefore(panel,before);
 return sim=>{
  const shown=sim.weapon==='sightline';panel.hidden=!shown;if(!shown)return;
  for(const [i,state] of sightlineAmmoPresentation(sim.sightline).entries()){
   const {row,label,count,pips}=rows[i],rounds=state.reload>0?state.capacity*(1-state.reload/state.duration):state.ammo;
   setAttr(row,'data-active',String(state.active));setAttr(row,'data-armed',String(!!state.armed));
   setText(label,state.name);setText(count,`${state.ammo} / ${state.capacity}`);
   setAttr(row,'aria-label',`${state.name}: ${state.ammo} of ${state.capacity} rounds${state.reload>0?', reloading':''}${state.armed?', breach loaded':''}`);
   for(let j=0;j<pips.children.length;j++){
    const pip=pips.children[j],fill=Math.max(0,Math.min(1,rounds-j));
    setAttr(pip,'data-full',String(fill>=1));setStyle(pip,'--fill',`${fill*100}%`);
   }
  }
 };
}
