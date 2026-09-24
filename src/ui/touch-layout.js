import { viewWidth, viewHeight } from '../viewport.js';
export const TOUCH_LAYOUT_KEY='deadshift-touch-layout-v2';
export const touchOrientation=({width,height})=>width>height?'landscape':'portrait';
// swapped: movement on the right and the buttons on the left, for left-handed play.
export function validateTouchLayouts(value){return {portrait:validateTouchLayout(value?.portrait),landscape:validateTouchLayout(value?.landscape),swapped:value?.swapped===true};}
// Movement is not a placed control: it appears wherever the left thumb lands.
export const TOUCH_CONTROL_IDS=['touch-place','touch-launch','touch-hex','touch-stream','touch-dodge','touch-extended','touch-grenade'];
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
// A short tick under the thumb when a control is picked up or put down, where
// the phone can (Android; iPhones ignore it).
const tick=()=>{try{navigator.vibrate?.(8);}catch{}};
// Within this of an edge (normalised), a dragged control settles on it.
export const EDGE_SNAP=.03;
export const snapToEdges=p=>({...p,x:p.x<EDGE_SNAP?0:p.x>1-EDGE_SNAP?1:p.x,y:p.y<EDGE_SNAP?0:p.y>1-EDGE_SNAP?1:p.y});
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
// A saved layout with one control put back: that control is simply forgotten,
// so it rejoins the default corner cluster, which already sits on whichever
// side the player chose (Swap sides). Nothing else in the layout moves.
export function withoutControl(positions,id){const next={...positions};delete next[id];return next;}
// restoreCluster re-lays the default corner cluster (arrangeTouchCluster) once a
// control has rejoined it.
export function installTouchLayout({root,controls,canEdit,onEditing,onChange=()=>{},restoreCluster=()=>{}}){
 let orientation=touchOrientation({width:viewWidth(),height:viewHeight()}),layouts=validateTouchLayouts(null);
 try{
  const saved=localStorage.getItem(TOUCH_LAYOUT_KEY);
  if(saved)layouts=validateTouchLayouts(JSON.parse(saved));
  else layouts[orientation]=validateTouchLayout(JSON.parse(localStorage.getItem('deadshift-touch-layout-v1')));
 }catch{}
 let positions=layouts[orientation];
 const elements=TOUCH_CONTROL_IDS.map(id=>document.getElementById(id));
 // Editing is started from Settings > Mobile, not from a button on the game screen.
 document.body.classList.toggle('touch-swapped',layouts.swapped);
 const overlay=document.createElement('div');overlay.id='touch-layout-overlay';overlay.hidden=true;
 overlay.innerHTML='<div class="touch-layout-reserved"><span>top of the screen stays clear</span></div>'
  +'<div class="touch-layout-help"><div class="touch-layout-copy"><strong>edit controls</strong>'
  +'<ul class="touch-layout-legend" aria-label="How to edit"><li><b>✥</b>drag to move</li><li><b>↘</b>size</li><li><b>↺</b>back to corner</li><li><b>×</b>hide</li></ul>'
  +'<small>saves as you go</small></div>'
  +'<div class="touch-layout-actions"><button type="button" id="touch-layout-swap">swap sides</button><button type="button" id="touch-layout-reset">reset</button><button type="button" id="touch-layout-done" class="touch-layout-done">done</button></div></div>';
 root.append(overlay);
 let editing=false,drag=null,scheduled=false;
 const viewport=()=>({width:viewWidth(),height:viewHeight()});
 const visible=element=>!element.hidden&&element.getClientRects().length>0;
 const save=()=>{layouts[orientation]=positions;try{localStorage.setItem(TOUCH_LAYOUT_KEY,JSON.stringify(layouts));}catch{}onChange();};
 function clearPlacement(){for(const element of elements){element.classList.remove('touch-positioned','touch-removed');for(const name of ['left','top','width','height','min-height'])element.style.removeProperty(name);}}
 function place(element){
  const p=positions[element.id];if(!p)return;
  element.classList.toggle('touch-removed',!!p.hidden);if(p.hidden)return;
  // Positioned first, so the size measured is the plain round button's.
  element.classList.add('touch-positioned');
  for(const name of ['width','height','min-height'])element.style.removeProperty(name);
  const base=element.getBoundingClientRect(),scale=p.scale||1;
  element.style.setProperty('width',Math.min(base.width*scale,viewWidth()-16)+'px','important');
  element.style.setProperty('height',Math.min(base.height*scale,viewHeight()*.75-16)+'px','important');
  element.style.setProperty('min-height','0','important');
  const rect=element.getBoundingClientRect(),position=controlPosition(p,rect,viewport());
  element.classList.add('touch-positioned');element.style.left=position.x+'px';element.style.top=position.y+'px';
 }
 function refresh(){
  const next=touchOrientation(viewport());
  if(next!==orientation){if(editing)finish();orientation=next;positions=layouts[orientation];clearPlacement();}
  if(document.body.dataset.controls!=='touch'){if(editing)finish();return;}
  for(const element of elements){element.classList.toggle('touch-removed',!!positions[element.id]?.hidden);if(visible(element))place(element);}
 }
 function schedule(){if(!scheduled){scheduled=true;requestAnimationFrame(()=>{scheduled=false;refresh();});}}
 // A button still in the default ring has no position of its own. The first
 // time it is dragged it leaves the ring as a round button centred where its
 // label was, and from then on it goes wherever it is put.
 function detach(element){
  const anchor=(element.querySelector('.button-label')||element).getBoundingClientRect();
  const cx=anchor.left+anchor.width/2,cy=anchor.top+anchor.height/2;
  element.classList.add('touch-positioned');
  for(const name of ['width','height','min-height','left','top'])element.style.removeProperty(name);
  const size=element.getBoundingClientRect();
  positions[element.id]={...positions[element.id],hidden:false,...normalizedPosition({x:cx-size.width/2,y:cy-size.height/2},size,viewport())};
  place(element);
 }
 // Puts one dragged-out button back in its spot in the default cluster, in the
 // corner on the player's side (right normally, left with Swap sides).
 function restoreControl(element){
  positions=withoutControl(positions,element.id);
  element.classList.remove('touch-positioned','touch-removed');
  for(const name of ['left','top','width','height','min-height'])element.style.removeProperty(name);
  save();restoreCluster();schedule();
 }
 function finish(){
  if(!editing)return;
  drag=null;editing=false;save();overlay.hidden=true;document.body.classList.remove('editing-touch-layout');onEditing(false);
 }
 function start(){
  if(editing)return true;
  if(document.body.dataset.controls!=='touch'||!canEdit())return false;
  editing=true;document.body.classList.add('editing-touch-layout');overlay.hidden=false;onEditing(true);
  for(const element of elements){
   if(element.querySelector('.touch-edit-handle'))continue;
   for(const [action,label] of [['remove','×'],['resize','↘'],['restore','↺']]){const handle=document.createElement('span');handle.className='touch-edit-handle touch-edit-'+action;handle.dataset.layoutAction=action;handle.textContent=label;handle.setAttribute('aria-label',action+' control');element.append(handle);}
  }
  return true;
 }
 // Mirrors every control across the screen, in both orientations, and moves
 // the walking side with them.
 function swapSides(){
  layouts.swapped=!layouts.swapped;
  for(const name of ['portrait','landscape'])for(const p of Object.values(layouts[name]))p.x=1-p.x;
  positions=layouts[orientation];document.body.classList.toggle('touch-swapped',layouts.swapped);
  clearPlacement();save();schedule();return layouts.swapped;
 }
 overlay.querySelector('#touch-layout-swap').onclick=swapSides;
 overlay.querySelector('#touch-layout-done').onclick=finish;
 overlay.querySelector('#touch-layout-reset').onclick=()=>{
  positions={};clearPlacement();save();restoreCluster();
 };
 controls.addEventListener('pointerdown',event=>{
  if(!editing)return;event.preventDefault();event.stopImmediatePropagation();
  const element=event.target.closest('.touch-stick,button');if(!elements.includes(element)||drag)return;
  const action=event.target.dataset.layoutAction;
  if(action==='restore'){restoreControl(element);return;}
  if(!positions[element.id]||positions[element.id].hidden)detach(element);
  if(action==='remove'){positions[element.id]={...positions[element.id],hidden:true};element.classList.add('touch-removed');tick();save();return;}
  const rect=element.getBoundingClientRect();tick();element.classList.add('touch-dragging');drag={element,id:event.pointerId,dx:event.clientX-rect.left,dy:event.clientY-rect.top,action,rect,scale:positions[element.id]?.scale||1,startX:event.clientX,startY:event.clientY};element.setPointerCapture(event.pointerId);
 },true);
 controls.addEventListener('pointermove',event=>{
  if(!editing)return;event.preventDefault();event.stopImmediatePropagation();
  if(!drag||event.pointerId!==drag.id)return;
  const p=positions[drag.element.id];
  if(drag.action==='resize')p.scale=clamp(drag.scale*Math.max((drag.rect.width+event.clientX-drag.startX)/drag.rect.width,(drag.rect.height+event.clientY-drag.startY)/drag.rect.height),.75,2);
  else Object.assign(p,snapToEdges(normalizedPosition({x:event.clientX-drag.dx,y:event.clientY-drag.dy},drag.element.getBoundingClientRect(),viewport())));
  place(drag.element);
  if(drag.action==='resize'){
   Object.assign(p,normalizedPosition({x:drag.rect.left,y:drag.rect.top},drag.element.getBoundingClientRect(),viewport()));place(drag.element);
  }
 },true);
 for(const type of ['pointerup','pointercancel','lostpointercapture'])controls.addEventListener(type,event=>{
  if(!editing)return;event.stopImmediatePropagation();if(drag?.id===event.pointerId){drag.element.classList.remove('touch-dragging');if(type!=='lostpointercapture')tick();drag=null;save();}
 },true);
 controls.addEventListener('click',event=>{if(editing){event.preventDefault();event.stopImmediatePropagation();}},true);
 window.addEventListener('keydown',event=>{if(editing){event.preventDefault();event.stopImmediatePropagation();if(event.code==='Escape')finish();}},true);
 window.addEventListener('resize',schedule);
 new MutationObserver(schedule).observe(document.body,{attributes:true,attributeFilter:['data-controls','class']});
 new MutationObserver(schedule).observe(controls,{attributes:true,subtree:true,attributeFilter:['hidden']});
 schedule();return {refresh:schedule,get editing(){return editing;},get swapped(){return layouts.swapped;},start,finish,swapSides,reset:()=>{layouts.portrait={};layouts.landscape={};positions=layouts[orientation];clearPlacement();save();restoreCluster();schedule();},restore:id=>{const element=document.getElementById(id);if(element)restoreControl(element);}};
}
