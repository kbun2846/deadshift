// Everything drawn at the aim point: the aim dot itself, the charge ring
// around it, Ballast's shot cone and Nominal's spread brackets and zone.
// Owns its own elements; main.js hands it the game state once a frame.
import { RULES } from '../config/gameplay.js';
import { SHOTGUN, shotgunSpread, shotgunReach } from '../weapons/shotgun.js';
import { SCATTER } from '../config/gameplay.js';
import { rifleSpread, rifleAim, RIFLE_MUZZLE } from '../weapons/rifle.js';
import { viewWidth, viewHeight } from '../viewport.js';
import { setStyle, setAttr } from './dom-writes.js';

// Static's expanding hex fills a ring round the aim dot
// that starts pink and runs to red. For the hex, red means the boundary is
// close, so pulse now.
export function chargeRingColor(t){
 const k=t**1.4,hue=340+15*k,saturation=100-8*k,lightness=80-30*k;
 return `hsl(${hue%360} ${saturation}% ${lightness}%)`;
}

export function createAimOverlay(game){
 const cone=document.createElementNS('http://www.w3.org/2000/svg','svg');cone.classList.add('aim-cone');
 // Two layers: the filled danger zone inside the spread, and the guide edges.
 // Ballast (v140): the red runs to SHOTGUN.range, then fades to nothing over
 // `fade` (the pellets' weakening reach): the zone and a second pair of
 // edges wear gradients laid along the aim each frame.
 cone.innerHTML='<defs><linearGradient id="ballast-fade" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#d8393c" stop-opacity="1"/><stop class="fade-at" offset=".6" stop-color="#d8393c" stop-opacity="1"/><stop offset="1" stop-color="#d8393c" stop-opacity="0"/></linearGradient><linearGradient id="ballast-fade-edge" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#f8e1bc" stop-opacity="1"/><stop offset="1" stop-color="#f8e1bc" stop-opacity="0"/></linearGradient></defs><path class="cone-zone"/><path class="cone-edges"/><path class="cone-fade-edges"/>';game.append(cone);
 const coneZone=cone.querySelector('.cone-zone'),coneEdges=cone.querySelector('.cone-edges'),fadeEdges=cone.querySelector('.cone-fade-edges');
 const fadeGrad=cone.querySelector('#ballast-fade'),fadeAt=cone.querySelector('.fade-at'),edgeGrad=cone.querySelector('#ballast-fade-edge');
 const spreadMarker=document.createElement('div');spreadMarker.id='rifle-spread';spreadMarker.className='rifle-spread';spreadMarker.innerHTML='<i></i><i></i>';game.append(spreadMarker);
 const secondarySpread=spreadMarker.cloneNode(true);secondarySpread.id='rifle-spread-secondary';secondarySpread.classList.add('secondary-spread');secondarySpread.hidden=true;game.append(secondarySpread);
 const reticleEl=game.querySelector('#reticle'),chargeRing=game.querySelector('#charge-ring'),chargeFill=chargeRing.querySelector('.charge-ring-fill');
 let chargeShown=-1,coneBox='',spreadShown=null,lastSpreadAt=0;

 function updateChargeRing(sim,running){
  const expanding=sim.weapon==='static'?sim.hexOrbs[0]:null;
  const value=!running||sim.player.dead?0:expanding?Math.min(1,Math.hypot(expanding.x-expanding.originX,expanding.z-expanding.originZ)/RULES.hexRange):0;
  const show=value>0.001;
  // SVG elements have no .hidden property; the attribute is what hides them.
  chargeRing.toggleAttribute('hidden',!show);
  if(!show){chargeShown=-1;return;}
  const stored=false,t=Math.round(value*200)/200,key=t+(stored?2:0);
  if(key===chargeShown)return;chargeShown=key;
  chargeFill.style.strokeDasharray=`${t*100} 100`;
  chargeRing.style.setProperty('--charge-color',chargeRingColor(t));
  chargeRing.classList.toggle('full',t>=.995);
  chargeRing.classList.toggle('stored',stored);
 }
 // The aim dot moves every frame. Moving it by transform keeps that on the
 // compositor instead of re-laying-out the page each frame, which phones feel.
 function place(x,y){setStyle(reticleEl,'transform',`translate3d(${x}px,${y}px,0) translate(-50%,-50%)`);}
 // A bracket moves by transform alone (its left/top stay 0), on the
 // compositor, instead of re-laying it out through left/top every frame.
 function placeBracket(el,{center,width,angle}){
  setStyle(el,'left','0px');setStyle(el,'top','0px');setStyle(el,'width',width.toFixed(1)+'px');
  setStyle(el,'transform',`translate(${center.x}px,${center.y}px) translate(-50%,-50%) rotate(${angle}rad)`);
 }
 function sizeCone(){const box=`0 0 ${viewWidth()} ${viewHeight()}`;if(box!==coneBox){coneBox=box;cone.setAttribute('viewBox',box);}}

 // state: { sim, view, running, coneFlicker, aiming, point } where point is
 // the screen position of the aim dot.
 function update({sim,view,running,coneFlicker,aiming,point}){
  const coneWeapon=sim.weapon==='shotgun'||sim.weapon==='rifle';
  setStyle(cone,'display',running&&coneWeapon&&!sim.player.dead?'block':'none');
  cone.classList.toggle('firing',coneFlicker>0);
  // The zone is a statement about what this shot would cover, so an empty or
  // mid-reload breech has nothing to say. The guide edges stay up regardless.
  // Same rule for the rifle: no round chambered, or a magazine on the way in,
  // and the zone goes out.
  // Scatter readied (Ballast X): the cone is its wide red one instead.
  const scatter=sim.weapon==='shotgun'&&!!sim.scatter?.armed;
  cone.classList.toggle('scatter',scatter);
  // Still charging (the first 3 s): fainter and pulsing faster.
  cone.classList.toggle('priming',scatter&&(sim.scatter.armedFor||0)<SCATTER.prime);
  cone.classList.toggle('unloaded',sim.weapon==='shotgun'
   ? !(sim.shotgun.ammo>0)&&!scatter
   : !(sim.rifle.ammo>0&&sim.rifle.reload<=0));
  if(sim.weapon==='shotgun'){
   cone.classList.toggle('fading',!scatter);
   const p=sim.player,red=scatter?SCATTER.reach:SHOTGUN.range,range=scatter?SCATTER.reach:shotgunReach(),angle=Math.atan2(p.aimZ,p.aimX),spread=scatter?SCATTER.spread:shotgunSpread(aiming);
   const muzzleX=view.player.position.x+p.aimX*.96-p.aimZ*.20,muzzleZ=view.player.position.z+p.aimZ*.96+p.aimX*.20;
   // Cosmetic cutout only; projectile origins and point-blank collisions are unchanged.
   const guideStart=.7;
   const origin=view.screenPoint(muzzleX+Math.cos(angle-spread)*guideStart,muzzleZ+Math.sin(angle-spread)*guideStart,.77);
   const nearEnd=view.screenPoint(muzzleX+Math.cos(angle+spread)*guideStart,muzzleZ+Math.sin(angle+spread)*guideStart,.77);
   const farLeft=view.screenPoint(muzzleX+Math.cos(angle-spread)*range,muzzleZ+Math.sin(angle-spread)*range,.77);
   const farRight=view.screenPoint(muzzleX+Math.cos(angle+spread)*range,muzzleZ+Math.sin(angle+spread)*range,.77);
   sizeCone();
   // Readied Scatter also marks where the big shells split: an arc across the cone.
   let splitArc='';
   if(scatter){for(let i=0;i<=8;i++){const a=angle-spread+spread*2*i/8,q=view.screenPoint(muzzleX+Math.cos(a)*SCATTER.splitAt,muzzleZ+Math.sin(a)*SCATTER.splitAt,.77);splitArc+=`${i?'L':'M'}${q.x.toFixed(1)},${q.y.toFixed(1)} `;}}
   // Solid edges to the end of the red; faint ones on through the fade.
   const redLeft=view.screenPoint(muzzleX+Math.cos(angle-spread)*red,muzzleZ+Math.sin(angle-spread)*red,.77);
   const redRight=view.screenPoint(muzzleX+Math.cos(angle+spread)*red,muzzleZ+Math.sin(angle+spread)*red,.77);
   setAttr(coneEdges,'d',`M${origin.x},${origin.y} L${redLeft.x},${redLeft.y} M${nearEnd.x},${nearEnd.y} L${redRight.x},${redRight.y} ${splitArc}`);
   if(!scatter){
    const a=view.screenPoint(muzzleX+Math.cos(angle)*guideStart,muzzleZ+Math.sin(angle)*guideStart,.77),b=view.screenPoint(muzzleX+Math.cos(angle)*range,muzzleZ+Math.sin(angle)*range,.77);
    const r=view.screenPoint(muzzleX+Math.cos(angle)*red,muzzleZ+Math.sin(angle)*red,.77);
    for(const g of [fadeGrad]){setAttr(g,'x1',a.x.toFixed(1));setAttr(g,'y1',a.y.toFixed(1));setAttr(g,'x2',b.x.toFixed(1));setAttr(g,'y2',b.y.toFixed(1));}
    setAttr(edgeGrad,'x1',r.x.toFixed(1));setAttr(edgeGrad,'y1',r.y.toFixed(1));setAttr(edgeGrad,'x2',b.x.toFixed(1));setAttr(edgeGrad,'y2',b.y.toFixed(1));
    setAttr(fadeAt,'offset',((red-guideStart)/(range-guideStart)).toFixed(3));
    setAttr(fadeEdges,'d',`M${redLeft.x},${redLeft.y} L${farLeft.x},${farLeft.y} M${redRight.x},${redRight.y} L${farRight.x},${farRight.y}`);
   }else setAttr(fadeEdges,'d','');
   // The same quad the edges bound, closed so it can carry a fill.
   setAttr(coneZone,'d',`M${origin.x},${origin.y} L${farLeft.x},${farLeft.y} L${farRight.x},${farRight.y} L${nearEnd.x},${nearEnd.y} Z`);
  }

  updateChargeRing(sim,running);
  // The guides are drawn from where the body is drawn (between ticks), not
  // from the last fixed step: read off the step position, the brackets and
  // the red band stepped against the smoothly moving player and camera and
  // jittered while walking.
  const s=sim.player,rp=view.player?.position,dx=rp?rp.x-s.x:0,dz=rp?rp.z-s.z:0;
  const p=dx||dz?{...s,x:s.x+dx,z:s.z+dz,aimPointX:s.aimPointX!=null?s.aimPointX+dx:undefined,aimPointZ:s.aimPointZ!=null?s.aimPointZ+dz:undefined}:s;
  place(point.x, point.y);
  spreadMarker.hidden=secondarySpread.hidden=sim.weapon!=='rifle'||!running;
  // Hidden (another weapon, a respawn): the band starts fresh next time.
  if(spreadMarker.hidden){spreadShown=null;lastSpreadAt=0;}
  if(!spreadMarker.hidden){
   const ax=p.aimPointX??p.x+p.aimX*7,az=p.aimPointZ??p.z+p.aimZ*7;
   const distance=Math.hypot(ax-p.x,az-p.z),speed=Math.hypot(p.vx,p.vz);
   // One ray, fixed by where the cursor is: from the muzzle, laid on the
   // convergence point. Both brackets are read off that same ray at their own
   // distances, so each shows the band bullets actually fall in there.
   // The convergence floor belongs to the barrel alone — applying it to the
   // bracket too is what dragged the near one out to arm's length.
   const aim=rifleAim(p,distance),target=rifleSpread(distance,speed,aiming,!!sim.surge?.active);
   // Eased, so the band widens and narrows as you speed up and stop instead of stepping.
   const now=performance.now(),step=Math.min(.1,(now-(lastSpreadAt||now))/1000);lastSpreadAt=now;
   spreadShown=spreadShown==null?target:spreadShown+(target-spreadShown)*(1-Math.exp(-step*14));
   const spread=spreadShown;
   // Hip-fire recoil knocks the whole cone off line (rifle.js kickRifle).
   const heading=aim.angle+(sim.rifle?.sway||0);
   const dirX=Math.cos(heading),dirZ=Math.sin(heading),perpX=-dirZ,perpZ=dirX;
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
   placeBracket(spreadMarker,near);
   let otherDistance=distance<9?Math.max(13,distance+7):Math.max(2.5,Math.min(6,distance*.4));
   let far=guide(otherDistance);
   // Keep the far guide inside the viewport, including narrow portrait screens.
   for(let i=0;i<12&&(far.center.x<20||far.center.x>viewWidth()-20||far.center.y<20||far.center.y>viewHeight()-20);i++){
    otherDistance*=.88;far=guide(otherDistance);
   }
   placeBracket(secondarySpread,far);
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
   setAttr(coneZone,'d',
    `M${nl.x},${nl.y} L${fl.x},${fl.y} L${fr.x},${fr.y} L${nr.x},${nr.y} Z`);
   // The brackets are the rifle's guide; it needs no drawn cone edges.
   setAttr(coneEdges,'d','');setAttr(fadeEdges,'d','');cone.classList.remove('fading');
  }
 }
 return {update,place,
  // The rifle brackets belong to a live rifle only.
  showSpread(visible){spreadMarker.hidden=secondarySpread.hidden=!visible;}};
}
