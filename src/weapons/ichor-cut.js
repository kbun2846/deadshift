import {ICHOR} from '../config/gameplay.js';
export const ichorSpin=variant=>variant===4||variant===5;
export const ichorCutArc=variant=>ichorSpin(variant)?Math.PI*2:variant===7?ICHOR.shortArc:variant===8||variant===9?ICHOR.midArc:ICHOR.arc;
// World-plane travel follows the blade's yaw (positive model yaw is negative
// x/z angle). Both the white wake and hit spray use this handedness.
export const ichorCutSign=variant=>variant%2?1:-1;
export function ichorCutForce(variant,aimX,aimZ,offsetX,offsetZ){
 const aimLength=Math.hypot(aimX,aimZ)||1,ax=aimX/aimLength,az=aimZ/aimLength;
 const d=Math.hypot(offsetX,offsetZ),rx=d>.01?offsetX/d:ax,rz=d>.01?offsetZ/d:az,sign=ichorCutSign(variant),push=variant===4||variant===5?0:variant===6?.45:.28;
 const x=-rz*sign+ax*push,z=rx*sign+az*push,n=Math.hypot(x,z)||1;
 return {x:x/n,z:z/n};
}
// Knee-high bases do not shield the breakable stone above them.
export function ichorCoverMeets(sim,c,x,z,y){return !c.lowTop||y<=sim.ground.heightAt(x,z)+(c.height??2)+.04;}
