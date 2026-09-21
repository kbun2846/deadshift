// A second finger does not reliably generate click/mouse events. Each control
// owns its pointer and activates on pointerdown, independently of the sticks.
export function bindTouchAction(element,{enabled=()=>true,press,release=()=>{}}){
 let pointer=null;
 const reset=()=>{if(pointer===null)return;pointer=null;release();};
 element.addEventListener('pointerdown',event=>{
  if(!enabled()||pointer!==null||(event.pointerType==='mouse'&&event.button!==0))return;
  event.preventDefault();pointer=event.pointerId;
  element.setPointerCapture(event.pointerId);press();
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
