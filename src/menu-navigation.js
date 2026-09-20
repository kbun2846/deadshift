import { selectMenuFor } from './select-menu.js';
// Menu-only navigation. Gameplay retains its own E/Q/arrow bindings.
export function createMenuNavigation(){
 let editing=null;
 const visible=el=>!el.disabled&&el.getClientRects().length>0&&!el.closest('[hidden],.hidden')&&(!el.closest('details:not([open])')||el.tagName==='SUMMARY');
 return function navigate(event,root,back){
  if(!root){editing=null;return false;}
  if(editing&&(!root.contains(editing)||document.activeElement!==editing||!visible(editing))){editing.removeAttribute('data-editing');editing=null;}
  const key=event.code,active=document.activeElement;
  if(root.contains(active)&&selectMenuFor(active)?.handleKey(event))return true;
  if(active?.matches('input:not([type=checkbox]):not([type=radio]),textarea')&&key!=='Escape')return false;
  if(!['KeyE','Enter','KeyQ','Escape','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(key))return false;
  event.preventDefault();
  if(event.repeat&&!key.startsWith('Arrow'))return true;
  const items=[...root.querySelectorAll('button,summary,select,input,a[href],[role=combobox]')].filter(visible);
  if(editing){
   if(['KeyE','Enter','KeyQ','Escape'].includes(key)){editing.removeAttribute('data-editing');editing=null;return true;}
   const delta=['ArrowLeft','ArrowUp'].includes(key)?-1:1;
   editing.selectedIndex=Math.max(0,Math.min(editing.options.length-1,editing.selectedIndex+delta));
   editing.dispatchEvent(new Event('change',{bubbles:true}));return true;
  }
  if(key==='KeyQ'||key==='Escape'){
   const detail=active?.closest('details[open]');
   if(detail&&root.contains(detail)){detail.open=false;detail.querySelector('summary').focus();}
   else back();
   return true;
  }
  if(!items.length)return true;
  const index=items.indexOf(active);
  if(key.startsWith('Arrow')){
   const weaponCard=active?.closest('.weapon-card');
   if(weaponCard&&root.contains(weaponCard)){
    const cards=[...root.querySelectorAll('.weapon-card')].filter(card=>card.getClientRects().length);
    const delta=key==='ArrowLeft'?-1:key==='ArrowRight'?1:key==='ArrowUp'?-2:2;
    const nextCard=cards[Math.max(0,Math.min(cards.length-1,cards.indexOf(weaponCard)+delta))];
    const target=nextCard.querySelector('.weapon-choice');
    target?.focus();target?.scrollIntoView({block:'nearest'});return true;
   }
   const delta=key==='ArrowUp'||key==='ArrowLeft'?-1:1;
   if(root.contains(active)&&(key==='ArrowLeft'||key==='ArrowRight')){
    if(active.tagName==='SELECT'){
     active.selectedIndex=Math.max(0,Math.min(active.options.length-1,active.selectedIndex+delta));
     active.dispatchEvent(new Event('change',{bubbles:true}));return true;
    }
    if(active.tagName==='SUMMARY'){
     active.closest('details').open=key==='ArrowRight';return true;
    }
   }
   const modes=items.filter(item=>item.closest('.input-choice'));
   const preferred=modes.find(item=>item.getAttribute('aria-pressed')==='true')||modes[0];
   let next;
   if(key==='ArrowUp'||key==='ArrowDown'){
    // The split control preference occupies one vertical menu row.
    const rows=items.filter(item=>!modes.includes(item)||item===preferred);
    const rowIndex=rows.indexOf(modes.includes(active)?preferred:active);
    next=rows[rowIndex<0?0:(rowIndex+delta+rows.length)%rows.length];
   }else if(modes.includes(active)){
    // Horizontal arrows stay within the split row; E confirms the choice.
    next=modes[Math.max(0,Math.min(modes.length-1,modes.indexOf(active)+delta))];
   }else{
    next=items[index<0?0:(index+delta+items.length)%items.length];
   }
   next.focus();next.scrollIntoView({block:'nearest'});return true;
  }
  const selected=items[index<0?0:index];selected.focus();
  if(selected.tagName==='SELECT'){editing=selected;editing.setAttribute('data-editing','true');}
  else selected.click();
  return true;
 };
}
