// The code prompt. `callbacks.unlock(code)` answers (a promise) with
// { ok, message }; the message is shown under the box when it is not ok.
export function createDevUnlockDialog(parent, callbacks) {
 const root=document.createElement('section');
 root.id='dev-code-dialog';root.className='modal hidden';
 root.setAttribute('role','dialog');root.setAttribute('aria-modal','true');root.setAttribute('aria-labelledby','dev-code-title');
 root.innerHTML=`<form class="modal-card"><button type="button" class="dev-code-close" aria-label="Cancel developer unlock"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 5 14 14M19 5 5 19"/></svg></button><h2 id="dev-code-title">dev tools</h2><label for="dev-code-input">enter code</label><input id="dev-code-input" type="password" inputmode="numeric" autocomplete="off" aria-describedby="dev-code-error"/><p id="dev-code-error" role="status"></p><button type="submit" class="secondary">UNLOCK</button><p class="dev-code-hint">q / esc to cancel</p></form>`;
 parent.append(root);
 const input=root.querySelector('input'),error=root.querySelector('[role=status]'),submit=root.querySelector('[type=submit]');
 // `asking` numbers the requests: closing, or a newer one, makes an answer moot.
 let isOpen=false,asking=0;
 const waiting=on=>{submit.disabled=on;root.classList.toggle('waiting',on);};
 function close(){if(!isOpen)return;isOpen=false;asking++;waiting(false);root.classList.add('hidden');input.value='';callbacks.close();}
 root.querySelector('.dev-code-close').onclick=close;
 root.querySelector('form').onsubmit=async e=>{
  e.preventDefault();
  if(submit.disabled)return;
  const ask=++asking;waiting(true);error.textContent='';
  let result;
  try{result=await callbacks.unlock(input.value);}catch{result={ok:false,message:"can't reach the server"};}
  if(ask!==asking||!isOpen)return;
  waiting(false);
  if(!result?.ok){error.textContent=result?.message||'incorrect code';input.focus();input.select();return;}
  close();callbacks.enabled();
 };
 return {
  get isOpen(){return isOpen;},
  show(){if(isOpen)return;callbacks.open();isOpen=true;waiting(false);error.textContent='';input.value='';root.classList.remove('hidden');input.focus();},
  keydown(e){
   if(e.code==='KeyQ'||e.code==='Escape'){e.preventDefault();close();return;}
   if(e.code==='Tab'){
    e.preventDefault();const items=[...root.querySelectorAll('button,input')].filter(el=>!el.disabled);
    const index=items.indexOf(document.activeElement);
    items[(index+(e.shiftKey?-1:1)+items.length)%items.length].focus();
   }
  }
 };
}
