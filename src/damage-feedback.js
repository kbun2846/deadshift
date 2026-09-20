const FEEDBACK_LIFE=3;
export const DAMAGE_FEEDBACK_COLORS=Object.freeze(['#ff5365','#ef4056','#ff7180']);
export const damageFeedbackSize=damage=>18+8*Math.min(1,Math.sqrt(Math.max(0,damage)/500));
export const damageFeedbackScale=age=>1+.26*Math.exp(-Math.max(0,age)/.075)*Math.cos(Math.max(0,age)*26);
export const damageFeedbackTilt=()=> (Math.random()<.5?-1:1)*(4+Math.random()*6);
export class DamageFeedbackState{
 constructor(){this.items=[];this.serial=0;this.time=0;}
 update(time){if(time<this.time)this.items=[];this.time=time;this.items=this.items.filter(item=>time-item.born<FEEDBACK_LIFE);}
 add(damage,time){
  this.update(time);if(!(damage>0))return;
  const color=DAMAGE_FEEDBACK_COLORS[Math.floor(Math.random()*DAMAGE_FEEDBACK_COLORS.length)];
  this.items.push({id:++this.serial,damage,born:time,position:this.serial,color,tilt:damageFeedbackTilt()});
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
   let side=aim.x>=point.x?-1:1;
   if(point.x<105)side=1;else if(point.x>parent.clientWidth-105)side=-1;
   state.items.forEach(item=>{
    // Pick a side once: turning or crossing screen center must not flip a live number.
    item.side??=side;
    let node=nodes.get(item.id);if(!node){node=document.createElement('span');root.append(node);nodes.set(item.id,node);}
    const age=sim.time-item.born,fadeIn=Math.min(1,age/.065),fadeOut=Math.max(0,Math.min(1,(FEEDBACK_LIFE-age)/.5));
    node.textContent='−'+Number(item.damage.toFixed(1));node.style.opacity=String(fadeIn*fadeOut);
    const offsets=[[84,-42],[106,-4],[88,34],[110,72],[96,-80],[116,-118]],offset=offsets[item.position%offsets.length];
    node.style.fontSize=damageFeedbackSize(item.damage)+'px';
    node.style.color=item.color;
    node.style.transform=`translate(-50%,-50%) rotate(${item.tilt}deg) scale(${damageFeedbackScale(age)})`;
    node.style.left=Math.max(48,Math.min(parent.clientWidth-48,point.x+item.side*offset[0]))+'px';
    node.style.top=Math.max(100,Math.min(parent.clientHeight-35,point.y+offset[1]-Math.min(age,2)*12))+'px';
   });
  }
 };
}
