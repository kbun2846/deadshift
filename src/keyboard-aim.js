// Arrow aiming is independent of fire/ability keys and wins over the mouse
// while held, including when a mouse button is clicked to fire or focus.
export function keyboardAim(keys,tapped=new Set()){
 const held=key=>keys.has(key)||tapped.has(key);
 const x=Number(held('ArrowRight'))-Number(held('ArrowLeft'));
 const z=Number(held('ArrowDown'))-Number(held('ArrowUp'));
 return {x,z,active:!!(x||z)};
}
