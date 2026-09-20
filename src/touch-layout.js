export const TOUCH_LAYOUT_KEY='deadshift-touch-layout-v1';
export const TOUCH_CONTROL_IDS=['move-stick','touch-place','touch-launch','touch-hex','touch-stream','touch-dodge','touch-extended','touch-grenade'];
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
export function validateTouchLayout(value){
 const result={};
 for(const id of TOUCH_CONTROL_IDS){const p=value?.[id];if(p&&Number.isFinite(p.x)&&Number.isFinite(p.y))result[id]={x:clamp(p.x,0,1),y:clamp(p.y,0,1),scale:Number.isFinite(p.scale)?clamp(p.scale,.75,2):1,hidden:p.hidden===true};}
 return result;
}
export function controlPosition(point,size,viewport){
 const left=8,top=viewport.height*.25+8;
 const width=Math.max(0,viewport.width-size.width-16),height=Math.max(0,viewport.height-top-size.height-8);
 return {x:left+clamp(point.x,0,1)*width,y:top+clamp(point.y,0,1)*height};
}
export function normalizedPosition(point,size,viewport){
 const start=controlPosition({x:0,y:0},size,viewport),end=controlPosition({x:1,y:1},size,viewport);
 return {x:clamp((point.x-start.x)/Math.max(1,end.x-start.x),0,1),y:clamp((point.y-start.y)/Math.max(1,end.y-start.y),0,1)};
}
export function installTouchLayout({root,controls,actions,canEdit,onEditing}){
 let positions={};try{positions=validateTouchLayout(JSON.parse(localStorage.getItem(TOUCH_LAYOUT_KEY)));}catch{}
 const elements=TOUCH_CONTROL_IDS.map(id=>document.getElementById(id));
 const button=document.createElement('button');button.id='touch-layout-edit';button.className='icon-button';button.textContent='EDIT';button.setAttribute('aria-label','Edit mobile controls');button.setAttribute('aria-pressed','false');actions.prepend(button);
 const overlay=document.createElement('div');overlay.id='touch-layout-overlay';overlay.hidden=true;
 overlay.innerHTML='<div class="touch-layout-reserved">TOP QUARTER RESERVED</div><div class="touch-layout-help"><strong>EDIT YOUR CONTROLS</strong><span>Drag to move · drag ↘ to resize · × removes. Reset restores removed controls. Changes save automatically.</span><button type="button" id="touch-layout-reset">RESET LAYOUT</button><button type="button" id="touch-layout-done">DONE</button></div>';
 root.append(overlay);
 let editing=false,drag=null,scheduled=false;
 const viewport=()=>({width:innerWidth,height:innerHeight});
 const visible=element=>!element.hidden&&element.getClientRects().length>0;
 const save=()=>{try{localStorage.setItem(TOUCH_LAYOUT_KEY,JSON.stringify(positions));}catch{}};
 function place(element){
  const p=positions[element.id];if(!p)return;
  element.classList.toggle('touch-removed',!!p.hidden);if(p.hidden)return;
  for(const name of ['width','height','min-height'])element.style.removeProperty(name);
  const base=element.getBoundingClientRect(),scale=p.scale||1;
  element.style.setProperty('width',Math.min(base.width*scale,innerWidth-16)+'px','important');
  element.style.setProperty('height',Math.min(base.height*scale,innerHeight*.75-16)+'px','important');
  element.style.setProperty('min-height','0','important');
  const rect=element.getBoundingClientRect(),position=controlPosition(p,rect,viewport());
  element.classList.add('touch-positioned');element.style.left=position.x+'px';element.style.top=position.y+'px';
 }
 function refresh(){
  if(document.body.dataset.controls!=='touch'){if(editing)finish();return;}
  for(const element of elements){element.classList.toggle('touch-removed',!!positions[element.id]?.hidden);if(visible(element))place(element);}
 }
 function schedule(){if(!scheduled){scheduled=true;requestAnimationFrame(()=>{scheduled=false;refresh();});}}
 function freeze(){
  // Measure together before removing any control from the default grid.
  const measured=elements.filter(visible).map(element=>({element,rect:element.getBoundingClientRect()}));
  for(const {element,rect} of measured)positions[element.id]={...positions[element.id],...normalizedPosition({x:rect.left,y:rect.top},rect,viewport())};
  for(const {element} of measured)place(element);
 }
 function finish(){
  if(!editing)return;
  drag=null;editing=false;save();overlay.hidden=true;document.body.classList.remove('editing-touch-layout');button.setAttribute('aria-pressed','false');onEditing(false);
 }
 button.addEventListener('click',()=>{
  if(editing){finish();return;}
  if(document.body.dataset.controls!=='touch'||!canEdit())return;
  freeze();editing=true;document.body.classList.add('editing-touch-layout');overlay.hidden=false;button.setAttribute('aria-pressed','true');onEditing(true);
  for(const element of elements){
   if(element.querySelector('.touch-edit-handle'))continue;
   for(const [action,label] of [['remove','×'],['resize','↘']]){const handle=document.createElement('span');handle.className='touch-edit-handle touch-edit-'+action;handle.dataset.layoutAction=action;handle.textContent=label;handle.setAttribute('aria-label',action+' control');element.append(handle);}
  }
 });
 overlay.querySelector('#touch-layout-done').onclick=finish;
 overlay.querySelector('#touch-layout-reset').onclick=()=>{
  positions={};for(const element of elements){element.classList.remove('touch-positioned','touch-removed');for(const name of ['left','top','width','height','min-height'])element.style.removeProperty(name);}
  freeze();save();
 };
 controls.addEventListener('pointerdown',event=>{
  if(!editing)return;event.preventDefault();event.stopImmediatePropagation();
  const element=event.target.closest('.touch-stick,button');if(!elements.includes(element)||drag)return;
  const action=event.target.dataset.layoutAction;
  if(action==='remove'){positions[element.id]={...positions[element.id],hidden:true};element.classList.add('touch-removed');save();return;}
  const rect=element.getBoundingClientRect();drag={element,id:event.pointerId,dx:event.clientX-rect.left,dy:event.clientY-rect.top,action,rect,scale:positions[element.id]?.scale||1,startX:event.clientX,startY:event.clientY};element.setPointerCapture(event.pointerId);
 },true);
 controls.addEventListener('pointermove',event=>{
  if(!editing)return;event.preventDefault();event.stopImmediatePropagation();
  if(!drag||event.pointerId!==drag.id)return;
  const p=positions[drag.element.id];
  if(drag.action==='resize')p.scale=clamp(drag.scale*Math.max((drag.rect.width+event.clientX-drag.startX)/drag.rect.width,(drag.rect.height+event.clientY-drag.startY)/drag.rect.height),.75,2);
  else Object.assign(p,normalizedPosition({x:event.clientX-drag.dx,y:event.clientY-drag.dy},drag.element.getBoundingClientRect(),viewport()));
  place(drag.element);
  if(drag.action==='resize'){
   Object.assign(p,normalizedPosition({x:drag.rect.left,y:drag.rect.top},drag.element.getBoundingClientRect(),viewport()));place(drag.element);
  }
 },true);
 for(const type of ['pointerup','pointercancel','lostpointercapture'])controls.addEventListener(type,event=>{
  if(!editing)return;event.stopImmediatePropagation();if(drag?.id===event.pointerId){drag=null;save();}
 },true);
 controls.addEventListener('click',event=>{if(editing){event.preventDefault();event.stopImmediatePropagation();}},true);
 window.addEventListener('keydown',event=>{if(editing){event.preventDefault();event.stopImmediatePropagation();if(event.code==='Escape')finish();}},true);
 window.addEventListener('resize',schedule);
 new MutationObserver(schedule).observe(document.body,{attributes:true,attributeFilter:['data-controls','class']});
 new MutationObserver(schedule).observe(controls,{attributes:true,subtree:true,attributeFilter:['hidden']});
 schedule();return {refresh:schedule,get editing(){return editing;},finish};
}
