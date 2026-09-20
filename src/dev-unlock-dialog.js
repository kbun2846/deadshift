export function createDevUnlockDialog(parent, callbacks) {
 const root=document.createElement('section');
 root.id='dev-code-dialog';root.className='modal hidden';
 root.setAttribute('role','dialog');root.setAttribute('aria-modal','true');root.setAttribute('aria-labelledby','dev-code-title');
 root.innerHTML=`<form class="modal-card"><button type="button" class="dev-code-close" aria-label="Cancel developer unlock"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 5 14 14M19 5 5 19"/></svg></button><h2 id="dev-code-title">dev tools</h2><label for="dev-code-input">enter code</label><input id="dev-code-input" type="password" inputmode="numeric" autocomplete="off" aria-describedby="dev-code-error"/><p id="dev-code-error" role="status"></p><button type="submit" class="secondary">UNLOCK</button><p class="dev-code-hint">q / esc to cancel</p></form>`;
 parent.append(root);
 const input=root.querySelector('input'),error=root.querySelector('[role=status]');
 let isOpen=false;
 function close(){if(!isOpen)return;isOpen=false;root.classList.add('hidden');input.value='';callbacks.close();}
 root.querySelector('.dev-code-close').onclick=close;
 root.querySelector('form').onsubmit=e=>{
  e.preventDefault();
  if(!callbacks.unlock(input.value)){error.textContent='incorrect code';input.select();return;}
  close();callbacks.enabled();
 };
 return {
  get isOpen(){return isOpen;},
  show(){if(isOpen)return;callbacks.open();isOpen=true;error.textContent='';input.value='';root.classList.remove('hidden');input.focus();},
  keydown(e){
   if(e.code==='KeyQ'||e.code==='Escape'){e.preventDefault();close();return;}
   if(e.code==='Tab'){
    e.preventDefault();const items=[...root.querySelectorAll('button,input')];
    const index=items.indexOf(document.activeElement);
    items[(index+(e.shiftKey?-1:1)+items.length)%items.length].focus();
   }
  }
 };
}
