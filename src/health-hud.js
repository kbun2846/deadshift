export class HealthBarMotion{
 constructor(){this.hp=null;this.time=0;this.trail=1;this.pulse=0;this.holdUntil=0;this.pulseUntil=0;}
 update(hp,max,time){
  const fraction=Math.max(0,Math.min(1,hp/max));
  const dt=Math.max(0,time-this.time);
  if(this.hp===null||time<this.time||hp>this.hp){this.trail=fraction;this.pulse=0;this.holdUntil=this.pulseUntil=0;}
  else if(hp<this.hp){this.holdUntil=time+.18;this.pulseUntil=time+.1;}
  const sliding=Math.max(0,time-Math.max(this.time,this.holdUntil));
  this.trail=fraction+(this.trail-fraction)*Math.exp(-sliding/ .17);
  if(this.trail-fraction<.0005)this.trail=fraction;
  const target=time<this.pulseUntil?1:0;
  this.pulse+=(target-this.pulse)*(1-Math.exp(-dt*(target?28:12)));
  this.hp=hp;this.time=time;
  return {fraction,loss:Math.max(0,this.trail-fraction),scale:1+this.pulse*.32};
 }
}
export function createHealthHUD(parent){
 const root=document.createElement('section');root.className='health-hud';root.setAttribute('aria-label','Player health');
 root.innerHTML='<div class="health-track" role="progressbar" aria-label="Health" aria-valuemin="0"><i class="health-fill"></i><i class="health-loss"></i></div><div class="health-readout"><strong class="health-number"></strong></div>';
 parent.append(root);
 const number=root.querySelector('.health-number'),track=root.querySelector('.health-track'),fill=root.querySelector('.health-fill'),loss=root.querySelector('.health-loss');
 const motion=new HealthBarMotion();
 let shownHealth=null,shownMax=null;
 return sim=>{
  const hp=Math.max(0,sim.player.hp),max=sim.player.maxHp;
  const {fraction,loss:lost,scale}=motion.update(hp,max,sim.time);
  fill.style.transform=`scaleX(${fraction})`;
  loss.style.left=`${fraction*100}%`;loss.style.width=`${lost*100}%`;loss.style.transform=`scaleY(${scale})`;
  const displayHealth=Math.ceil(hp);
  if(displayHealth!==shownHealth){shownHealth=displayHealth;number.textContent=String(displayHealth);track.setAttribute('aria-valuenow',String(displayHealth));}
  if(max!==shownMax){shownMax=max;track.setAttribute('aria-valuemax',String(max));}
 };
}
