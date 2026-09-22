// A second finger does not reliably generate click/mouse events. Each control
// owns its pointer and activates on pointerdown, independently of the sticks.
export function bindTouchAction(element,{enabled=()=>true,press,release=()=>{}}){
 let pointer=null;
 const reset=()=>{if(pointer===null)return;pointer=null;release();};
 element.addEventListener('pointerdown',event=>{
  if(!enabled()||pointer!==null||(event.pointerType==='mouse'&&event.button!==0))return;
  event.preventDefault();pointer=event.pointerId;
  element.setPointerCapture(event.pointerId);
  // A touched button keeps focus afterwards, and the browser then activates it
  // again on the next Space or Enter. On a tablet with a keyboard that means
  // tapping FIRE and then pressing Space to dodge fires the weapon a second
  // time. Capture is not affected by focus, so drop it as soon as we have it.
  if(element.ownerDocument?.activeElement===element)element.blur();
  press();
 });
 for(const type of ['pointerup','pointercancel','lostpointercapture'])element.addEventListener(type,event=>{
  if(event.pointerId===pointer)reset();
 });
 element.addEventListener('click',event=>{
  // Keep keyboard/accessibility activation; pointer activation already ran.
  if(event.detail>0||event.pointerType)return;
  if(enabled()){press();release();}
 });
 return reset;
}
