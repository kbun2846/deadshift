import {damageFeedbackSize,damageFeedbackScale,damageFeedbackTilt} from './damage-feedback.js';
const ADDITION_LIFE=1.2;
// Damage numbers are whole and always rounded down, so a figure on screen is
// never more than what actually landed.
const format=damage=>Math.floor(Number(damage)||0);
export function createOutgoingFeedback(parent){
 const root=document.createElement('div');root.className='damage-feedback outgoing-feedback';parent.append(root);let items=[],lastTime=0;
 const expire=time=>{if(time<lastTime){items.forEach(i=>i.node.remove());items=[];}lastTime=time;items=items.filter(i=>{if(time-i.updated<2.5)return true;i.node.remove();return false;});};
 return {add(e,time){
  expire(time);if(!(e.damage>0))return;
  const item=items.find(i=>i.id===e.id);
  if(item){
   const sameShell=e.volley!==undefined&&e.volley===item.volley&&time-item.updated<.12;
   if(sameShell){
    if(item.added>0)item.added+=e.damage;
    else item.subtotal+=e.damage;
   }else{
    item.subtotal=item.damage;item.added=e.damage;
    item.tilt=damageFeedbackTilt();item.additionTilt=damageFeedbackTilt();
   }
   item.damage+=e.damage;item.hp=e.hp;item.maxHp=e.maxHp;item.volley=e.volley;item.updated=time;
   return;
  }
  const node=document.createElement('span'),total=document.createElement('b'),addition=document.createElement('small');
  const subtotalNode=document.createElement('em'),addedNode=document.createElement('em');addition.append(subtotalNode);addition.append(addedNode);
  node.className='outgoing-number';node.append(total);node.append(addition);root.append(node);
  items.push({...e,born:time,updated:time,subtotal:e.damage,subtotalNode,added:0,addedNode,node,total,addition,tilt:damageFeedbackTilt(),additionTilt:damageFeedbackTilt(),offset:(Math.random()-.5)*32});
 },update(sim,view){
  expire(sim.time);
  items.forEach(i=>{const age=sim.time-i.born,sinceHit=sim.time-i.updated;
   i.subtotalNode.textContent=format(i.subtotal);i.addedNode.textContent='+'+format(i.added);
   i.total.style.transform=`rotate(${i.tilt}deg)`;
   i.addedNode.style.transform=`rotate(${i.additionTilt}deg)`;
   i.addition.style.opacity=Math.max(0,Math.min(1,(ADDITION_LIFE-sinceHit)/.3));
   i.addition.style.display=i.added>0&&sinceHit<ADDITION_LIFE?'flex':'none';
   const point=view.screenPoint(i.x,i.z,1.3);i.node.style.display=sim.canSeeEntity(i.x,i.z,.2)?'':'none';i.total.textContent=format(i.damage);i.node.style.color=i.maxHp>0&&i.hp<i.maxHp*.25?'#84edb0':'#80caff';i.node.style.fontSize=damageFeedbackSize(i.damage)+'px';i.node.style.left=point.x+i.offset+'px';i.node.style.top=point.y-18-Math.min(age,2)*10+'px';i.node.style.opacity=Math.min(1,age/.04,(2.5-sinceHit)/.5);i.node.style.transform=`translate(-50%,-50%) scale(${damageFeedbackScale(sinceHit)})`;});
 }};
}
