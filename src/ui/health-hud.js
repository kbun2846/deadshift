// How long the shake keeps its energy after a hit, and the shortest gap on the
// bar that still deserves one: a sliver a pixel wide jittering reads as a
// rendering fault rather than a wound.
export const TREMBLE_DECAY=.42;
export const TREMBLE_FLOOR=.02;
export class HealthBarMotion{
 constructor(){this.hp=null;this.time=0;this.trail=1;this.pulse=0;this.holdUntil=0;this.pulseUntil=0;this.tremble=0;}
 update(hp,max,time){
  const fraction=Math.max(0,Math.min(1,hp/max));
  const dt=Math.max(0,time-this.time);
  if(this.hp===null||time<this.time||hp>this.hp){this.trail=fraction;this.pulse=0;this.holdUntil=this.pulseUntil=0;this.tremble=0;}
  else if(hp<this.hp){this.holdUntil=time+.18;this.pulseUntil=time+.1;}
  const sliding=Math.max(0,time-Math.max(this.time,this.holdUntil));
  this.trail=fraction+(this.trail-fraction)*Math.exp(-sliding/ .17);
  if(this.trail-fraction<.0005)this.trail=fraction;
  const target=time<this.pulseUntil?1:0;
  this.pulse+=(target-this.pulse)*(1-Math.exp(-dt*(target?28:12)));
  // The shake is charged by the hit and bleeds off on its own, so a burn that
  // lands a fraction every frame keeps the segment alive rather than
  // re-triggering a fresh jolt sixty times a second.
  this.tremble*=Math.exp(-dt/TREMBLE_DECAY);
  if(hp<this.hp)this.tremble=1;
  this.hp=hp;this.time=time;
  const loss=Math.max(0,this.trail-fraction);
  return {fraction,loss,scale:1+this.pulse*.62,tremble:loss>0?this.tremble*Math.min(1,loss/TREMBLE_FLOOR):0};
 }
}
// Two detuned waves rather than a random offset: the motion is deterministic
// and frame-rate independent, and never lands twice on the same spot the way a
// single sine does.
export const trembleOffset=(time,intensity)=>({
 x:intensity*5*Math.sin(time*91.7)*Math.cos(time*37.3),
 y:intensity*3.6*Math.sin(time*79.1+1.1),
});
export function createHealthHUD(parent){
 const root=document.createElement('section');root.className='health-hud';root.setAttribute('aria-label','Player health');
 root.innerHTML='<div class="health-track" role="progressbar" aria-label="Health" aria-valuemin="0"><i class="health-fill"></i><i class="health-loss"></i></div><div class="health-readout"><strong class="health-number"></strong></div>';
 parent.append(root);
 const number=root.querySelector('.health-number'),track=root.querySelector('.health-track'),fill=root.querySelector('.health-fill'),loss=root.querySelector('.health-loss');
 const motion=new HealthBarMotion();
 let shownHealth=null,shownMax=null,shaking=false;
 // Every style property here was written unconditionally each call, almost
 // always with the value it already held, and the HUD calls this twice per
 // tick. Writing the same string still invalidates style, so each one is
 // cached and skipped when unchanged.
 const last={};
 const write=(node,property,value)=>{
  const key=property+node.className;
  if(last[key]===value)return;
  last[key]=value;node.style[property]=value;
 };
 return sim=>{
  const hp=Math.max(0,sim.player.hp),max=sim.player.maxHp;
  const {fraction,loss:lost,scale,tremble}=motion.update(hp,max,sim.time);
  write(fill,'transform',`scaleX(${fraction})`);
  const shake=trembleOffset(sim.time,tremble);
  write(loss,'left',`${fraction*100}%`);write(loss,'width',`${lost*100}%`);
  write(loss,'transform',`translate(${shake.x.toFixed(2)}px,${shake.y.toFixed(2)}px) scaleY(${scale})`);
  // The whole bar flinches with it, at a third of the throw. A lone segment
  // shaking inside a rock-steady frame reads as a glitch; the bar moving with
  // it reads as a hit, and it is the bar the player is watching.
  write(track,'transform',tremble>0?`translate(${(shake.x*.34).toFixed(2)}px,${(shake.y*.3).toFixed(2)}px)`:'');
  // The hot state is a class, not a per-frame style write, so the browser is
  // not re-parsing a box-shadow every frame of a burn.
  const wants=tremble>.02;
  if(wants!==shaking){shaking=wants;loss.classList.toggle('bleeding',wants);root.classList.toggle('bleeding',wants);}
  const displayHealth=Math.ceil(hp);
  if(displayHealth!==shownHealth){shownHealth=displayHealth;number.textContent=String(displayHealth);track.setAttribute('aria-valuenow',String(displayHealth));}
  if(max!==shownMax){shownMax=max;track.setAttribute('aria-valuemax',String(max));}
 };
}
