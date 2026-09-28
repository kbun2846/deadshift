import { setText, setAttr, setStyle } from './dom-writes.js';
import { ICHOR } from '../config/gameplay.js';
const clamp=n=>Math.max(0,Math.min(1,n));
// Presentation follows the authoritative amount without changing damage or passives.
export class BloodBarMotion {
 constructor(){this.value=null;this.time=null;}
 update(target,time){
  target=clamp(target);
  if(this.value===null||time<this.time||target===0)this.value=target;
  else {const dt=Math.max(0,time-this.time);this.value+=(target-this.value)*(1-Math.exp(-8*dt));if(Math.abs(target-this.value)<.0008)this.value=target;}
  this.time=time;return this.value;
 }
}
// Small SVG paths, sampled at 30 Hz in simulation time. No turbulence filters,
// canvases, or continually changing shadows: the liquid costs no world draws.
function liquidPath(f,t,heat){
 const end=2+396*f,top=[],bottom=[];
 for(let i=0;i<=40;i++){
  const u=i/40,x=2+(end-2)*u,edge=Math.sin(u*Math.PI);
  const y=5+edge*(1+heat*3.3)*(Math.sin(x*.065-t*5)+.45*Math.sin(x*.12+t*3));
  let drip=0;
  for(const [at,phase] of [[.13,.7],[.31,0],[.57,2.1],[.85,4.6]]){
   const d=(u-at)/.031;
   drip+=Math.exp(-d*d)*(4+12*(.5+.5*Math.sin(t*3.2+phase)));
  }
  top.push(x.toFixed(1)+','+y.toFixed(1));
  bottom.push(x.toFixed(1)+','+(28+edge*(.7*Math.sin(x*.08+t*4)+heat*drip)).toFixed(1));
 }
 return {fill:'M'+top.join(' L')+' L'+bottom.reverse().join(' L')+' Z',
  shade:'M2,23 Q'+(end*.5).toFixed(1)+','+(19+Math.sin(t*4)*2).toFixed(1)+' '+end.toFixed(1)+',23 L'+bottom.join(' L')+' Z'};
}
export function createIchorBloodHUD(parent,before=null){
 const root=document.createElement('div');root.className='ichor-blood';root.id='ichor-blood';root.hidden=true;
 root.setAttribute('role','progressbar');root.setAttribute('aria-label','Blood');root.setAttribute('aria-valuemin','0');root.setAttribute('aria-valuemax','100');
 root.innerHTML='<svg viewBox="0 0 400 48" preserveAspectRatio="none" aria-hidden="true"><path class="ichor-blood-track" d="M2,9 L7,4 48,5 64,2 119,5 168,3 214,6 266,3 313,5 359,2 396,5 399,17 396,28 365,27 343,31 286,28 245,30 202,27 164,31 126,28 73,30 48,27 3,29 Z"/><path class="ichor-blood-liquid"/><path class="ichor-blood-shade"/><path class="ichor-blood-veins"/><path class="ichor-blood-rim"/><path class="ichor-blood-drops"/><path class="ichor-blood-threshold" d="M196,0 L200,5 204,0 M200,6 L200,28 M196,34 L200,29 204,34"/></svg><div class="ichor-blood-readout"><span>blood</span><strong>0%</strong></div>';
 parent.insertBefore(root,before);
 const svg=root.querySelector('svg'),fill=root.querySelector('.ichor-blood-liquid'),shade=root.querySelector('.ichor-blood-shade'),number=root.querySelector('strong'),drops=root.querySelector('.ichor-blood-drops');
 const veins=root.querySelector('.ichor-blood-veins'),rim=root.querySelector('.ichor-blood-rim');
 let oozeAt=0,lastFrame=-1,lastActual=0,lastGain=null,burstAt=-10,particles=[],motion=new BloodBarMotion();
 return sim=>{
  const active=sim.weapon==='ichor'&&!!sim.ichor;
  if(root.hidden===active)root.hidden=!active;
  if(!active||sim.time<motion.time){lastFrame=-1;lastActual=0;lastGain=null;particles=[];burstAt=-10;if(motion.value!==null)motion=new BloodBarMotion();if(!active)return;}
  if(sim.ichor.blood===0&&lastActual>0){particles=[];burstAt=-10;}
  const actual=clamp(sim.ichor.blood/ICHOR.meterMax),blood=motion.update(actual,sim.time),shown=Math.floor(blood*100+1e-8),frame=Math.floor(sim.time*30);
  setText(number,shown+'%');setAttr(root,'aria-valuenow',String(shown));setAttr(root,'data-full',String(actual>=.999));setAttr(root,'data-wave-ready',String(sim.ichor.blood>=ICHOR.eBlood));setAttr(root,'aria-valuetext',shown+'% blood · blood slash requires 50%');
  const gained=sim.ichor.lastGain;
  if(lastGain!==null&&gained>lastGain&&lastActual>=.999&&actual>=.999){
   burstAt=sim.time;for(let i=0;i<12;i++)particles.push({x:18+Math.random()*364,y:9+Math.random()*12,vx:(Math.random()-.5)*180,vy:-35-Math.random()*65,r:3+Math.random()*3,life:.32+Math.random()*.28,born:sim.time});
   if(particles.length>36)particles.splice(0,particles.length-36);
  }
  lastGain=gained;lastActual=actual;
  if(frame===lastFrame&&sim.time!==burstAt)return;lastFrame=frame;
  const t=frame/30,heat=clamp((blood-.25)/.75)**1.6,pop=Math.max(0,1-(sim.time-burstAt)/.28)**2,shape=liquidPath(blood,t,heat+pop*.6);
  setAttr(fill,'d',blood?shape.fill:'');setAttr(shade,'d',blood?shape.shade:'');
  const end=2+396*blood,vessels=[],edges=[];
  for(let i=0;i<8&&blood>.03;i++){const x=12+i*49+Math.sin(t*2+i)*3;if(x+15>end)break;const y=13+Math.sin(t*3+i*2.3)*4;vessels.push('M'+x.toFixed(1)+','+y.toFixed(1)+'q8,-5 17,1t15,0');edges.push('M'+x.toFixed(1)+',7q5,-2 11,0');}
  setAttr(veins,'d',vessels.join(' '));setAttr(rim,'d',edges.join(' '));setStyle(veins,'opacity',(.12+heat*.5).toFixed(2));setStyle(root,'--blood-heat',heat.toFixed(2));
  if(actual>.65&&sim.time>=oozeAt){oozeAt=sim.time+.6-.32*heat;particles.push({x:8+Math.random()*(end-16),y:27,vx:(Math.random()-.5)*40,vy:9+heat*13,r:1.8+heat*2,life:.45,born:sim.time});if(particles.length>36)particles.shift();}
  particles=particles.filter(p=>sim.time-p.born<p.life&&sim.time>=p.born);
  setAttr(drops,'d',particles.map(p=>{const age=sim.time-p.born,x=p.x+p.vx*age,y=p.y+p.vy*age+130*age*age,r=p.r*(1-age/p.life);return 'M'+(x-r).toFixed(1)+','+y.toFixed(1)+'a'+r.toFixed(2)+','+(r*1.25).toFixed(2)+' 0 1 0 '+(r*2).toFixed(2)+',0a'+r.toFixed(2)+','+(r*1.25).toFixed(2)+' 0 1 0 '+(-r*2).toFixed(2)+',0';}).join(' '));
  svg.style.transform='translate('+((Math.sin(t*43)+Math.sin(t*67)*.45)*heat*1.8).toFixed(2)+'px,'+(Math.sin(t*53)*heat*1.5).toFixed(2)+'px) rotate('+(Math.sin(t*31)*heat*.35).toFixed(2)+'deg) scale('+(1+pop*.025).toFixed(3)+','+(1+pop*.13).toFixed(3)+')';
 };
}

// Lazy SVG layers outside the existing cooldown rings. Geometry is shared by
// mouse/touch readouts and updated at 30 Hz, with no filters or DOM churn.
export function createIchorAbilityBlood(roots){
 const layers=new Map();let frame=-1,wasActive=false;
 const circle=(x,y,r)=>'M'+(x-r).toFixed(2)+','+y.toFixed(2)+'a'+r.toFixed(2)+','+r.toFixed(2)+' 0 1 0 '+(r*2).toFixed(2)+',0a'+r.toFixed(2)+','+r.toFixed(2)+' 0 1 0 '+(-r*2).toFixed(2)+',0';
 return sim=>{const active=sim.weapon==='ichor';if(!active){if(wasActive)for(const layer of layers.values())layer.svg.style.display='none';wasActive=false;frame=-1;return;}
  const now=Math.floor(sim.time*30);if(now===frame&&wasActive)return;frame=now;wasActive=true;
  const blood=clamp((sim.ichor.blood/100-.12)/.88),heat=blood*blood,t=now/30;
  roots.forEach((root,index)=>{if(!root)return;let layer=layers.get(root);if(!layer){const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','-8 -8 88 88');svg.setAttribute('aria-hidden','true');svg.classList.add('ichor-ability-blood');svg.innerHTML='<path class="blood-edge" fill-rule="evenodd"/><path class="blood-beads"/><path class="blood-runs"/>';root.append(svg);layer={svg,paths:[...svg.querySelectorAll('path')]};layers.set(root,layer);}
   layer.svg.style.display=blood>0?'':'none';if(!blood)return;setStyle(layer.svg,'opacity',(.22+blood*.68).toFixed(2));
   const outside=[],inside=[],beads=[],runs=[],phase=t*(1.6+heat*2)+index*.8;
   for(let i=0;i<=64;i++){const a=i*Math.PI*2/64,wave=Math.sin(a*7+phase)+.45*Math.sin(a*13-phase*1.3),r=33.6+(1+heat*2.4)*(.6+.4*wave),inner=32.5+.4*Math.sin(a*9-phase);outside.push((36+Math.cos(a)*r).toFixed(2)+','+(36+Math.sin(a)*r).toFixed(2));inside.unshift((36+Math.cos(a)*inner).toFixed(2)+','+(36+Math.sin(a)*inner).toFixed(2));}
   for(let i=0;i<3+Math.floor(heat*8);i++){const a=i*2.399+index,cycle=(t*(.3+heat*.6)+i*.37)%1,r=34+cycle*heat*8,x=36+Math.cos(a)*r,y=36+Math.sin(a)*r+cycle*cycle*heat*4;beads.push(circle(x,y,(.6+heat*1.5)*(1-cycle*.65)));if(i<5){const a=.25+i*.63,x=36+Math.cos(a)*34,y=36+Math.sin(a)*34;runs.push('M'+x.toFixed(2)+','+y.toFixed(2)+'q'+(Math.sin(phase+i)*2).toFixed(2)+',3 0,'+(2+heat*6*(.5+.5*Math.sin(phase+i))).toFixed(2));}}
   setAttr(layer.paths[0],'d','M'+outside.join(' L')+' Z M'+inside.join(' L')+' Z');setAttr(layer.paths[1],'d',beads.join(' '));setAttr(layer.paths[2],'d',runs.join(' '));
  });
 };
}
