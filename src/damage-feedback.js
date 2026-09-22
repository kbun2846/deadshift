const FEEDBACK_LIFE=3;
export const DAMAGE_FEEDBACK_COLORS=Object.freeze(['#ff5365','#ef4056','#ff7180']);
export const damageFeedbackSize=damage=>21+9*Math.min(1,Math.sqrt(Math.max(0,damage)/500));
export const damageFeedbackScale=age=>1+.26*Math.exp(-Math.max(0,age)/.075)*Math.cos(Math.max(0,age)*26);
export const damageFeedbackTilt=()=> (Math.random()<.5?-1:1)*(4+Math.random()*6);
// Damage over time arrives one simulation step at a time — standing in fire is
// 25 a second delivered as sixtieths — so the raw values are fractions. Carry
// the fraction forward instead of printing it: a number appears only once a
// whole point has been taken, and the remainder waits for the next tick.
// Rounding is always down, so the figure shown is never more than what landed.
//
// A burn is one number that climbs, not a queue of numbers. Three timings keep
// it readable rather than strobing:
//   MERGE_WINDOW  how long a quiet gap can be before the burn counts as over
//                 and the next one starts its own number;
//   BURN_BEAT     how often the figure is allowed to change, so it can be read
//                 instead of spinning sixty times a second;
//   BURN_RUN      how long one number may run before handing off to a fresh
//                 one, so a long burn never leaves a figure parked on screen.
// The birth time is set once and never moved. Pushing it forward on every
// merge is what made fire flicker: age drives both the fade-in and the entry
// slam, so restarting it re-played both, twice a second, for as long as the
// player stood in the fire.
export const MERGE_WINDOW=.45;
export const BURN_BEAT=.3;
export const BURN_RUN=2.2;
export class DamageFeedbackState{
 constructor(){this.items=[];this.serial=0;this.time=0;this.pending=0;}
 update(time){if(time<this.time){this.items=[];this.pending=0;}this.time=time;this.items=this.items.filter(item=>time-item.born<FEEDBACK_LIFE);}
 add(damage,time){
  this.update(time);if(!(damage>0))return;
  const color=()=>DAMAGE_FEEDBACK_COLORS[Math.floor(Math.random()*DAMAGE_FEEDBACK_COLORS.length)];
  // A real hit always gets its own number, floored.
  if(damage>=1){
   this.items.push({id:++this.serial,damage:Math.floor(damage),born:time,position:this.serial,color:color(),tilt:damageFeedbackTilt()});
   return;
  }
  // Below a point it is damage over time arriving a simulation step at a time.
  // Carry the fraction instead of printing it, and feed the running burn number
  // rather than stacking a new one beside it sixty times a second.
  this.pending+=damage;
  // The burn's own number, not merely the newest one: a gunshot landing mid
  // burn must not split the burn into two figures.
  let running=null;
  for(let i=this.items.length-1;i>=0;i--)if(this.items[i].trickle){running=this.items[i];break;}
  if(running&&!(time-running.touched<=MERGE_WINDOW&&time-running.born<BURN_RUN))running=null;
  if(running){
   running.touched=time;
   if(time-running.bumped<BURN_BEAT)return;
  }
  const whole=Math.floor(this.pending);
  if(whole<1)return;
  this.pending-=whole;
  if(running){running.damage+=whole;running.bumped=time;return;}
  this.items.push({id:++this.serial,damage:whole,born:time,touched:time,bumped:time,position:this.serial,color:color(),tilt:damageFeedbackTilt(),trickle:true});
 }
}
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
   const width=parent.clientWidth,height=parent.clientHeight;
   let side=aim.x>=point.x?-1:1;
   if(point.x<105)side=1;else if(point.x>width-105)side=-1;
   state.items.forEach(item=>{
    // Pick a side once: turning or crossing screen center must not flip a live number.
    item.side??=side;
    let node=nodes.get(item.id);if(!node){node=document.createElement('span');root.append(node);nodes.set(item.id,node);}
    const age=sim.time-item.born,fadeIn=Math.min(1,age/.065),fadeOut=Math.max(0,Math.min(1,(FEEDBACK_LIFE-age)/.5));
    node.textContent='−'+Math.floor(item.damage);node.style.opacity=String(fadeIn*fadeOut);
    const offsets=[[84,-42],[106,-4],[88,34],[110,72],[96,-80],[116,-118]],offset=offsets[item.position%offsets.length];
    node.style.fontSize=damageFeedbackSize(item.damage)+'px';
    node.style.color=item.color;
    node.style.transform=`translate(-50%,-50%) rotate(${item.tilt}deg) scale(${damageFeedbackScale(age)})`;
    node.style.left=Math.max(48,Math.min(width-48,point.x+item.side*offset[0]))+'px';
    node.style.top=Math.max(100,Math.min(height-35,point.y+offset[1]-Math.min(age,2)*12))+'px';
   });
  }
 };
}
