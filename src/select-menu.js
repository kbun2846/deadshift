// Custom option lists keep every platform's pointer and keyboard highlight on-theme.
// Original selects remain the source of truth for settings and developer controls.
const controls=new WeakMap();
export const selectMenuFor=element=>controls.get(element);

export function installSelectMenus(root){
 const entries=[];let opened=null;
 for(const [index,select]of [...root.querySelectorAll('select')].entries()){
  const name=select.getAttribute('aria-label')||[...select.closest('label').childNodes]
   .filter(node=>node.nodeType===Node.TEXT_NODE).map(node=>node.textContent.trim()).join(' ');
  const id=(select.id||`menu-select-${index}`)+'-choices';
  const field=document.createElement('div');field.className='menu-select';field.tabIndex=0;
  field.setAttribute('role','combobox');field.setAttribute('aria-label',name);
  field.setAttribute('aria-haspopup','listbox');field.setAttribute('aria-controls',id);field.setAttribute('aria-expanded','false');
  const value=document.createElement('span');value.className='menu-select-value';field.append(value);
  const list=document.createElement('div');list.className='menu-select-list';list.id=id;list.hidden=true;
  list.setAttribute('role','listbox');list.setAttribute('aria-label',name);
  const choices=[...select.options].map((option,i)=>{
   const choice=document.createElement('div');choice.id=`${id}-${i}`;choice.className='menu-select-option';
   choice.setAttribute('role','option');choice.textContent=option.textContent;
   choice.setAttribute('aria-disabled',String(option.disabled));list.append(choice);return choice;
  });
  select.before(field);select.hidden=true;root.append(list);
  let draft=select.selectedIndex;
  const sync=()=>{value.textContent=select.selectedOptions[0]?.textContent||'';field.tabIndex=select.disabled?-1:0;field.setAttribute('aria-disabled',String(select.disabled));};
  const render=()=>{
   choices.forEach((choice,i)=>{choice.setAttribute('aria-selected',String(i===select.selectedIndex));choice.dataset.highlight=String(i===draft);});
   field.setAttribute('aria-activedescendant',choices[draft]?.id||'');
   choices[draft]?.scrollIntoView({block:'nearest'});
  };
  const close=()=>{list.hidden=true;field.setAttribute('aria-expanded','false');field.removeAttribute('aria-activedescendant');if(opened===entry)opened=null;};
  const position=()=>{
   const rect=field.getBoundingClientRect(),below=innerHeight-rect.bottom-12,above=rect.top-12;
   const height=Math.min(choices.length*34+8,Math.max(0,Math.max(below,above)),260);
   list.style.width=rect.width+'px';list.style.maxHeight=height+'px';
   list.style.left=Math.max(8,Math.min(innerWidth-rect.width-8,rect.left))+'px';
   list.style.top=(below>=height?rect.bottom+4:Math.max(8,rect.top-height-4))+'px';
  };
  const open=()=>{
   if(select.disabled)return;
   opened?.close();sync();draft=select.selectedIndex;opened=entry;list.hidden=false;
   field.setAttribute('aria-expanded','true');position();render();
  };
  const commit=()=>{
   if(select.options[draft]&&!select.options[draft].disabled&&select.selectedIndex!==draft){
    select.selectedIndex=draft;select.dispatchEvent(new Event('change',{bubbles:true}));
   }
   sync();close();
  };
  const move=delta=>{
   let next=draft+delta;
   while(next>=0&&next<choices.length&&select.options[next].disabled)next+=delta;
   if(next>=0&&next<choices.length)draft=next;
  };
  const entry={field,list,close,sync,handleKey(event){
   const key=event.code,isOpen=opened===entry;
   if(key==='Tab'){close();return false;}
   if(!isOpen&&!['ArrowLeft','ArrowRight','KeyE','Enter','Space'].includes(key))return false;
   if(isOpen&&!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Home','End','KeyE','Enter','Space','KeyQ','Escape'].includes(key))return false;
   event.preventDefault();
   if(event.repeat&&!key.startsWith('Arrow'))return true;
   if(key==='KeyQ'||key==='Escape'){close();return true;}
   if(['KeyE','Enter','Space'].includes(key)){if(isOpen)commit();else open();return true;}
   if(!isOpen)draft=select.selectedIndex;
   if(key==='Home')draft=0;else if(key==='End')draft=choices.length-1;
   else move(['ArrowUp','ArrowLeft'].includes(key)?-1:1);
   if(isOpen)render();else commit();return true;
  }};
  controls.set(field,entry);entries.push(entry);sync();
  field.addEventListener('focus',sync);
  field.addEventListener('click',event=>{event.preventDefault();field.focus();if(opened===entry)close();else open();});
  select.addEventListener('change',sync);
  list.addEventListener('pointerdown',event=>event.preventDefault());
  choices.forEach((choice,i)=>{
   choice.addEventListener('pointermove',()=>{if(!select.options[i].disabled&&draft!==i){draft=i;render();}});
   choice.addEventListener('click',event=>{event.preventDefault();if(!select.options[i].disabled){draft=i;commit();field.focus();}});
  });
 }
 document.addEventListener('pointerdown',event=>{if(opened&&!opened.field.contains(event.target)&&!opened.list.contains(event.target))opened.close();});
 document.addEventListener('focusin',event=>{if(opened&&!opened.field.contains(event.target))opened.close();});
 window.addEventListener('resize',()=>opened?.close());
 root.addEventListener('scroll',event=>{if(opened&&!opened.list.contains(event.target))opened.close();},true);
 return {reset(){opened?.close();entries.forEach(entry=>entry.sync());}};
}
