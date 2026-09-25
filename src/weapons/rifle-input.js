import { GAME_KEYS } from '../config/controls.js';
// Mouse events report each button transition; pointerdown only reports the
// first pressed button, so it cannot handle aim + fire by itself.
// Shift is aim-in for every weapon. The pointer's own aim button still works;
// the weapon argument is kept because callers pass it and a future weapon may
// want to opt out.
// Ballast: a press fires (Space or the left button); Shift / right button aim in.
export const ballastInput=(pointerFiring,keys,tapped)=>({
 fire:pointerFiring||keys.has(GAME_KEYS.shoot)||tapped.has(GAME_KEYS.shoot),
});
// (Right Shift arrives as ShiftLeft while aim-in keeps Shift: keybinds.js gameCode.)
export const weaponAiming=(weapon,pointerAiming,keys)=>pointerAiming||keys.has('ShiftLeft');
export function bindRifleMouse(surface,windowTarget,{enabled,state,fire,aim,store}){
 surface.addEventListener('mousedown',e=>{
  if(!enabled())return;e.preventDefault();state(!!(e.buttons&1),!!(e.buttons&2));
  if(e.button===0)fire();if(e.button===2)store?.();aim(e.clientX,e.clientY);
 });
 windowTarget.addEventListener('mouseup',e=>{state(enabled()&&!!(e.buttons&1),enabled()&&!!(e.buttons&2));});
}
