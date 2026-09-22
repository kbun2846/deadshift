// Mouse events report each button transition; pointerdown only reports the
// first pressed button, so it cannot handle aim + fire by itself.
// Shift is aim-in for every weapon. The pointer's own aim button still works;
// the weapon argument is kept because callers pass it and a future weapon may
// want to opt out.
export const weaponAiming=(weapon,pointerAiming,keys)=>pointerAiming||keys.has('ShiftLeft')||keys.has('ShiftRight');
export function bindRifleMouse(surface,windowTarget,{enabled,state,fire,aim,store}){
 surface.addEventListener('mousedown',e=>{
  if(!enabled())return;e.preventDefault();state(!!(e.buttons&1),!!(e.buttons&2));
  if(e.button===0)fire();if(e.button===2)store?.();aim(e.clientX,e.clientY);
 });
 windowTarget.addEventListener('mouseup',e=>{state(enabled()&&!!(e.buttons&1),enabled()&&!!(e.buttons&2));});
}
