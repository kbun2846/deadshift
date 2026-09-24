import { setText, setStyle } from './dom-writes.js';
import { viewWidth, viewHeight } from '../viewport.js';
const FEEDBACK_LIFE=3;
export const DAMAGE_FEEDBACK_COLORS=Object.freeze(['#ff5365','#ef4056','#ff7180']);
export const damageFeedbackSize=damage=>21+9*Math.min(1,Math.sqrt(Math.max(0,damage)/500));
export const damageFeedbackScale=age=>1+.26*Math.exp(-Math.max(0,age)/.075)*Math.cos(Math.max(0,age)*26);
// A tilt of 4-10 degrees either way; given the previous tilt, the new one
// leans the other way so a re-pop reads as a change.
export const damageFeedbackTilt=(previous)=>(previous===undefined?(Math.random()<.5?-1:1):-Math.sign(previous)||1)*(4+Math.random()*6);
// Damage taken adds up into one number: hit, hit, hit reads -50, -100, -150,
// not three -50s. Each time the figure grows it pops back in where it is,
// with a fresh tilt (bumped/tilt below; the pop is damageFeedbackScale).
// A new number starts once STACK_WINDOW passes with no damage at all.
//
// Damage over time arrives one simulation step at a time (standing in fire is
// 25 a second delivered as sixtieths), so those raw values are fractions.
// The fraction is carried forward instead of printed: the number only grows by
// whole points, rounded down, so the figure shown is never more than what
// landed. And a burn only moves the figure every BURN_BEAT, so it can be read
// instead of spinning sixty times a second. A real hit always shows at once.
//
// The birth time is set once and never moved (it drives the fade-in; moving it
// made fire flicker). The pop runs from `bumped`, and the number lives until
// FEEDBACK_LIFE after the last damage (`touched`).
export const STACK_WINDOW=1.5;
export const BURN_BEAT=.3;
export class DamageFeedbackState{
 constructor(){this.items=[];this.serial=0;this.time=0;this.pending=0;}
 update(time){if(time<this.time){this.items=[];this.pending=0;}this.time=time;this.items=this.items.filter(item=>time-item.touched<FEEDBACK_LIFE);}
 add(damage,time){
  this.update(time);if(!(damage>0))return;
  let running=this.items.at(-1)||null;
  if(running&&time-running.touched>STACK_WINDOW)running=null;
  const bump=(item,amount)=>{item.damage+=amount;item.touched=time;item.bumped=time;item.tilt=damageFeedbackTilt(item.tilt);};
  const start=amount=>{this.items.push({id:++this.serial,damage:amount,born:time,touched:time,bumped:time,position:this.serial,color:DAMAGE_FEEDBACK_COLORS[Math.floor(Math.random()*DAMAGE_FEEDBACK_COLORS.length)],tilt:damageFeedbackTilt()});};
  if(damage>=1){
   // A real hit shows at once (with any carried fraction), rounded down.
   const whole=Math.floor(damage+this.pending);this.pending=damage+this.pending-whole;
   if(running)bump(running,whole);else start(whole);
   return;
  }
  // Below a point: damage over time. Carry it, and grow the figure on a beat.
  this.pending+=damage;
  if(running){running.touched=time;if(time-running.bumped<BURN_BEAT)return;}
  const whole=Math.floor(this.pending);
  if(whole<1)return;
  this.pending-=whole;
  if(running)bump(running,whole);else start(whole);
 }
}
const OFFSETS=[[84,-42],[106,-4],[88,34],[110,72],[96,-80],[116,-118]];
export function createDamageFeedback(parent){
 const root=document.createElement('div');root.className='damage-feedback';root.setAttribute('aria-hidden','true');parent.append(root);
 const state=new DamageFeedbackState(),nodes=new Map();
 return {
  add:(damage,time)=>state.add(damage,time),
  update(sim,view){
   state.update(sim.time);
   const ids=new Set(state.items.map(item=>item.id));
   for(const [id,node]of nodes)if(!ids.has(id)){node.remove();nodes.delete(id);}
   if(!state.items.length)return;
   // Match the interpolated avatar and camera, rather than jumping between physics ticks.
   const p=sim.player,render=view.player.position,point=view.screenPoint(render.x,render.z,.85),aim=view.screenPoint(render.x+p.aimX,render.z+p.aimZ,.85);
   // Opposite the aim direction, outside the player's silhouette and crosshair.
   // Read once, above the loop. These used to be read again inside it, between
   // style writes on sibling nodes, which is a read-after-write layout thrash:
   // forty-odd forced layouts a frame with a few numbers on screen.
   const width=viewWidth(),height=viewHeight();
   let side=aim.x>=point.x?-1:1;
   if(point.x<105)side=1;else if(point.x>width-105)side=-1;
   state.items.forEach(item=>{
    // Pick a side once: turning or crossing screen center must not flip a live number.
    item.side??=side;
    let node=nodes.get(item.id);if(!node){node=document.createElement('span');root.append(node);nodes.set(item.id,node);}
    const age=sim.time-item.born,fadeIn=Math.min(1,age/.065),fadeOut=Math.max(0,Math.min(1,(FEEDBACK_LIFE-(sim.time-item.touched))/.5));
    setText(node,'−'+Math.floor(item.damage));setStyle(node,'opacity',fadeIn*fadeOut);
    const offset=OFFSETS[item.position%OFFSETS.length];
    setStyle(node,'fontSize',damageFeedbackSize(item.damage)+'px');
    setStyle(node,'color',item.color);
    // Placed by transform alone (left/top stay 0): no layout per number per frame.
    const x=Math.max(48,Math.min(width-48,point.x+item.side*offset[0])),y=Math.max(100,Math.min(height-35,point.y+offset[1]-Math.min(sim.time-item.bumped,2)*12));
    setStyle(node,'left','0px');setStyle(node,'top','0px');
    setStyle(node,'transform',`translate(${x}px,${y}px) translate(-50%,-50%) rotate(${item.tilt}deg) scale(${damageFeedbackScale(sim.time-item.bumped)})`);
   });
  }
 };
}
