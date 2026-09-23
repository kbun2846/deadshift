// Everything drawn at the aim point: the aim dot itself, the charge ring
// around it, Ballast's shot cone and Nominal's spread brackets and zone.
// Owns its own elements; main.js hands it the game state once a frame.
import { RULES } from './config/gameplay.js';
import { shotgunRange, shotgunSpread } from './shotgun.js';
import { rifleSpread, rifleAim, RIFLE_MUZZLE } from './rifle.js';

// Ballast's charge and Static's expanding hex fill a ring round the aim dot
// that starts pink and runs to red. For the hex, red means the boundary is
// close, so pulse now.
export function chargeRingColor(t){
 const k=t**1.4,hue=340+15*k,saturation=100-8*k,lightness=80-30*k;
 return `hsl(${hue%360} ${saturation}% ${lightness}%)`;
}

export function createAimOverlay(game){
 const cone=document.createElementNS('http://www.w3.org/2000/svg','svg');cone.classList.add('aim-cone');
 // Two layers: the filled danger zone inside the spread, and the guide edges.
 cone.innerHTML='<path class="cone-zone"/><path class="cone-edges"/>';game.append(cone);
 const spreadMarker=document.createElement('div');spreadMarker.id='rifle-spread';spreadMarker.className='rifle-spread';spreadMarker.innerHTML='<i></i><i></i>';game.append(spreadMarker);
 const secondarySpread=spreadMarker.cloneNode(true);secondarySpread.id='rifle-spread-secondary';secondarySpread.classList.add('secondary-spread');secondarySpread.hidden=true;game.append(secondarySpread);
 const reticleEl=game.querySelector('#reticle'),chargeRing=game.querySelector('#charge-ring'),chargeFill=chargeRing.querySelector('.charge-ring-fill');
 let chargeShown=-1,coneBox='';

 function updateChargeRing(sim,running){
  const expanding=sim.weapon==='static'?sim.hexOrbs[0]:null;
  const value=!running||sim.player.dead?0:sim.weapon==='shotgun'?sim.shotgun.charge:expanding?Math.min(1,Math.hypot(expanding.x-expanding.originX,expanding.z-expanding.originZ)/RULES.hexRange):0;
  const show=value>0.001||(sim.weapon==='shotgun'&&sim.shotgun.stored);
  // SVG elements have no .hidden property; the attribute is what hides them.
  chargeRing.toggleAttribute('hidden',!show);
  if(!show){chargeShown=-1;return;}
  const stored=sim.weapon==='shotgun'&&sim.shotgun.stored,t=Math.round(value*200)/200,key=t+(stored?2:0);
  if(key===chargeShown)return;chargeShown=key;
  chargeFill.style.strokeDasharray=`${t*100} 100`;
  chargeRing.style.setProperty('--charge-color',chargeRingColor(t));
  chargeRing.classList.toggle('full',t>=.995);
  chargeRing.classList.toggle('stored',stored);
 }
 // The aim dot moves every frame. Moving it by transform keeps that on the
 // compositor instead of re-laying-out the page each frame, which phones feel.
 function place(x,y){reticleEl.style.transform=`translate3d(${x}px,${y}px,0) translate(-50%,-50%)`;}
 function sizeCone(){const box=`0 0 ${innerWidth} ${innerHeight}`;if(box!==coneBox){coneBox=box;cone.setAttribute('viewBox',box);}}

 // state: { sim, view, running, coneFlicker, aiming, point } where point is
 // the screen position of the aim dot.
 function update({sim,view,running,coneFlicker,aiming,point}){
  const coneWeapon=sim.weapon==='shotgun'||sim.weapon==='rifle';
  cone.style.display=running&&coneWeapon&&!sim.player.dead?'block':'none';
  cone.classList.toggle('firing',coneFlicker>0);
  // The zone is a statement about what this shot would cover, so an empty or
  // mid-reload breech has nothing to say. The guide edges stay up regardless.
  // Same rule for the rifle: no round chambered, or a magazine on the way in,
  // and the zone goes out.
  cone.classList.toggle('unloaded',sim.weapon==='shotgun'
   ? !(sim.shotgun.ammo>0)
   : !(sim.rifle.ammo>0&&sim.rifle.reload<=0));
  if(sim.weapon==='shotgun'){
   const p=sim.player,range=shotgunRange(sim.shotgun.charge),angle=Math.atan2(p.aimZ,p.aimX),spread=shotgunSpread(aiming);
   const muzzleX=view.player.position.x+p.aimX*.96-p.aimZ*.20,muzzleZ=view.player.position.z+p.aimZ*.96+p.aimX*.20;
   // Cosmetic cutout only; projectile origins and point-blank collisions are unchanged.
   const guideStart=.7;
   const origin=view.screenPoint(muzzleX+Math.cos(angle-spread)*guideStart,muzzleZ+Math.sin(angle-spread)*guideStart,.77);
   const nearEnd=view.screenPoint(muzzleX+Math.cos(angle+spread)*guideStart,muzzleZ+Math.sin(angle+spread)*guideStart,.77);
   const farLeft=view.screenPoint(muzzleX+Math.cos(angle-spread)*range,muzzleZ+Math.sin(angle-spread)*range,.77);
   const farRight=view.screenPoint(muzzleX+Math.cos(angle+spread)*range,muzzleZ+Math.sin(angle+spread)*range,.77);
   sizeCone();
   cone.querySelector('.cone-edges').setAttribute('d',`M${origin.x},${origin.y} L${farLeft.x},${farLeft.y} M${nearEnd.x},${nearEnd.y} L${farRight.x},${farRight.y}`);
   // The same quad the edges bound, closed so it can carry a fill.
   cone.querySelector('.cone-zone').setAttribute('d',`M${origin.x},${origin.y} L${farLeft.x},${farLeft.y} L${farRight.x},${farRight.y} L${nearEnd.x},${nearEnd.y} Z`);
  }

  updateChargeRing(sim,running);
  const p = sim.player;
  place(point.x, point.y);
  spreadMarker.hidden=secondarySpread.hidden=sim.weapon!=='rifle'||!running;
  if(!spreadMarker.hidden){
   const ax=p.aimPointX??p.x+p.aimX*7,az=p.aimPointZ??p.z+p.aimZ*7;
   const distance=Math.hypot(ax-p.x,az-p.z),speed=Math.hypot(p.vx,p.vz);
   // One ray, fixed by where the cursor is: from the muzzle, laid on the
   // convergence point. Both brackets are read off that same ray at their own
   // distances, so each shows the band bullets actually fall in there.
   // The convergence floor belongs to the barrel alone — applying it to the
   // bracket too is what dragged the near one out to arm's length.
   const aim=rifleAim(p,distance),spread=rifleSpread(distance,speed,aiming);
   const dirX=Math.cos(aim.angle),dirZ=Math.sin(aim.angle),perpX=-dirZ,perpZ=dirX;
   // One helper for both the brackets and the zone: the centre of the band at
   // a given range, and the two world points its edges sit on.
   const band=range=>{
    const travel=Math.max(.35,range-RIFLE_MUZZLE.forward);
    const cx=aim.x+dirX*travel,cz=aim.z+dirZ*travel,error=Math.tan(spread)*travel;
    return {cx,cz,error};
   };
   const guide=range=>{
    const {cx,cz,error}=band(range);
    const center=view.screenPoint(cx,cz);
    const edge=view.screenPoint(cx+perpX*error,cz+perpZ*error);
    return {center,width:Math.max(8,Math.hypot(edge.x-center.x,edge.y-center.y)*2),
     angle:Math.atan2(edge.y-center.y,edge.x-center.x)};
   };
   const near=guide(distance);
   spreadMarker.style.left=near.center.x+'px';spreadMarker.style.top=near.center.y+'px';
   spreadMarker.style.width=near.width+'px';
   spreadMarker.style.transform=`translate(-50%,-50%) rotate(${near.angle}rad)`;
   let otherDistance=distance<9?Math.max(13,distance+7):Math.max(2.5,Math.min(6,distance*.4));
   let far=guide(otherDistance);
   // Keep the far guide inside the viewport, including narrow portrait screens.
   for(let i=0;i<12&&(far.center.x<20||far.center.x>innerWidth-20||far.center.y<20||far.center.y>innerHeight-20);i++){
    otherDistance*=.88;far=guide(otherDistance);
   }
   secondarySpread.style.left=far.center.x+'px';secondarySpread.style.top=far.center.y+'px';
   secondarySpread.style.width=far.width+'px';
   secondarySpread.style.transform=`translate(-50%,-50%) rotate(${far.angle}rad)`;
   // The ground this shot can land on, the same statement the Ballast cone
   // makes and drawn off the same ray the brackets are. It spans the two
   // brackets and nothing beyond them: each one caps an end of the band, so
   // the red says "between these", not "everything in front of you".
   const flank=range=>{
    const {cx,cz,error}=band(range);
    return [view.screenPoint(cx-perpX*error,cz-perpZ*error,.77),
            view.screenPoint(cx+perpX*error,cz+perpZ*error,.77)];
   };
   const [nl,nr]=flank(Math.min(distance,otherDistance));
   const [fl,fr]=flank(Math.max(distance,otherDistance));
   sizeCone();
   cone.querySelector('.cone-zone').setAttribute('d',
    `M${nl.x},${nl.y} L${fl.x},${fl.y} L${fr.x},${fr.y} L${nr.x},${nr.y} Z`);
   // The brackets are the rifle's guide; it needs no drawn cone edges.
   cone.querySelector('.cone-edges').setAttribute('d','');
  }
 }
 return {update,place,
  // The rifle brackets belong to a live rifle only.
  showSpread(visible){spreadMarker.hidden=secondarySpread.hidden=!visible;}};
}
