// Touch controls: telling taps from drags, the floating move stick on the
// walking side, and the shape of the right-thumb button cluster. Tunables are
// in config/controls.js. main.js decides what a tap or a drag does.
import { TOUCH_TAP, MOVE_STICK, TOUCH_CLUSTER, CLUSTER_ORDER } from '../config/controls.js';
import { viewWidth, viewHeight } from '../viewport.js';
export { TOUCH_TAP, MOVE_STICK };
const byId = id => document.getElementById(id);

// Same rule on both sides of the screen, so there is never a guess about
// which one you did: a short, still touch is a tap; anything else a drag.
export function isTap(start, x, y, now = performance.now()) {
  return !!start && !start.dragged && Math.hypot(x - start.x, y - start.y) < TOUCH_TAP.slop && now - start.time < TOUCH_TAP.time * 1000;
}

// Movement works like a phone game: no fixed stick. Touch the walking side and
// drag: the spot where the drag began becomes the stick's fixed centre, and
// the knob pulls out from it. Lift and drag again somewhere else and that
// becomes the new centre. A quick touch that barely moves is a tap (onTap).
// The walking vector is written to `output.moveX/moveZ` (-1..1, curved).
export function bindFloatingStick(zone, element, { isRunning, onWalkStart, onTap, output }) {
  const knob = element.querySelector('.stick-knob');
  const stick = { element, knob, pointer: null, x: 0, y: 0, dragging: false, down: 0, shown: null };
  const radius = () => element.offsetWidth * MOVE_STICK.travel || 46;
  const show = () => {
    clearTimeout(stick.shown); stick.shown = null;
    element.style.left = stick.x + 'px'; element.style.top = stick.y + 'px'; element.classList.add('engaged');
  };
  function move(e) {
    if (e.pointerId !== stick.pointer) return;
    const dx = e.clientX - stick.x, dy = e.clientY - stick.y, length = Math.hypot(dx, dy);
    if (!stick.dragging) {
      if (length < TOUCH_TAP.slop) return;
      stick.dragging = true; show();
      // Walking steers the aim too: you face the way you move (main.js lets a
      // finger held on the world win, so you can walk one way and aim another).
      onWalkStart();
    }
    const r = radius(), scale = length > r ? r / length : 1, x = dx * scale / r, z = dy * scale / r;
    knob.style.transform = 'translate(' + (x * r) + 'px, ' + (z * r) + 'px)';
    // A dead zone, then a gentle curve: small pulls creep, full pulls run.
    const tilt = Math.min(1, length / r), speed = tilt < MOVE_STICK.dead ? 0 : ((tilt - MOVE_STICK.dead) / (1 - MOVE_STICK.dead)) ** MOVE_STICK.curve;
    output.moveX = length ? dx / length * speed : 0; output.moveZ = length ? dy / length * speed : 0;
  }
  zone.addEventListener('pointerdown', e => {
    if (!isRunning() || stick.pointer !== null) return;
    e.preventDefault(); stick.pointer = e.pointerId; zone.setPointerCapture(e.pointerId);
    stick.x = e.clientX; stick.y = e.clientY; stick.dragging = false; stick.down = performance.now();
    // Held still past a tap, the stick shows where it will pull from.
    stick.shown = setTimeout(() => { if (stick.pointer === e.pointerId) show(); }, TOUCH_TAP.time * 1000);
  });
  zone.addEventListener('pointermove', move);
  const release = e => {
    if (e.pointerId !== stick.pointer) return;
    const tap = !stick.dragging && performance.now() - stick.down < TOUCH_TAP.time * 1000 && e.type === 'pointerup';
    clearTimeout(stick.shown); stick.shown = null;
    stick.pointer = null; stick.dragging = false; knob.style.transform = ''; element.classList.remove('engaged');
    output.moveX = output.moveZ = 0;
    if (tap && isRunning()) onTap(stick.x, stick.y);
  };
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) zone.addEventListener(name, release);
  // A lift the zone never hears about must not leave the stick held (walking
  // stuck in one direction): mobile browsers can drop the capture or send the
  // end of a touch elsewhere when another finger taps FIRE or a button, or
  // when the page is interrupted. So the stick also lets go when that pointer
  // ends anywhere on the page, when no finger is on the screen at all, and
  // when the page loses focus.
  const letGo = () => {
   if (stick.pointer === null) return;
   clearTimeout(stick.shown); stick.shown = null;
   stick.pointer = null; stick.dragging = false; knob.style.transform = ''; element.classList.remove('engaged');
   output.moveX = output.moveZ = 0;
  };
  for (const name of ['pointerup', 'pointercancel']) window.addEventListener(name, e => { if (e.pointerId === stick.pointer) release(e); }, true);
  for (const name of ['touchend', 'touchcancel']) window.addEventListener(name, e => { if (!e.touches.length) letGo(); }, true);
  window.addEventListener('blur', letGo);
  document.addEventListener('visibilitychange', () => { if (document.hidden) letGo(); });
  stick.release = letGo;
  return stick;
}

// The right thumb's cluster. FIRE is a big quarter circle tucked into the
// corner; every other action is its own segment of one ring around it, the
// most used (dodge) at the thumb's easiest reach on the left end. Which
// buttons show depends on the weapon, so the ring is cut again whenever that
// changes. Shapes are clip paths, which also limit where a touch lands.
// Swap sides mirrors it. A button moved in the layout editor stops being a
// segment and is drawn as a plain circle wherever it was put.
// A closed outline through `points`, each corner listed in `round` (index ->
// radius) softened with a curve, the rest joined straight (arcs are passed in
// already sampled finely, so they stay smooth). Used for every cluster button:
// slightly rounded outer corners, and FIRE's corner rounded to sit inside a
// phone's curved screen corner.
export function roundedOutline(points,round){
 const n=points.length,out=[];
 const toward=(a,b,d)=>{const dx=b.x-a.x,dy=b.y-a.y,l=Math.hypot(dx,dy)||1,k=Math.min(d,l/2)/l;return {x:a.x+dx*k,y:a.y+dy*k};};
 for(let i=0;i<n;i++){
  const p=points[i],r=round[i]||0;
  if(!r){out.push(`${out.length?'L':'M'}${p.x.toFixed(2)} ${p.y.toFixed(2)}`);continue;}
  const a=toward(p,points[(i-1+n)%n],r),b=toward(p,points[(i+1)%n],r);
  out.push(`${out.length?'L':'M'}${a.x.toFixed(2)} ${a.y.toFixed(2)} Q${p.x.toFixed(2)} ${p.y.toFixed(2)} ${b.x.toFixed(2)} ${b.y.toFixed(2)}`);
 }
 return `path('${out.join(' ')} Z')`;
}
// Points along an arc (degrees), ends included.
function arcPoints(radius,from,to,size,mirrored,steps){
 const pts=[];for(let k=0;k<=steps;k++)pts.push(ringPoint(radius,from+(to-from)*k/steps,size,mirrored));return pts;
}
function ringPoint(radius,degrees,size,mirrored){
 const a=degrees*Math.PI/180;
 return {x:mirrored?radius*Math.cos(a):size-radius*Math.cos(a),y:size-radius*Math.sin(a)};
}
export function arrangeTouchCluster(){
 const mirrored=document.body.classList.contains('touch-swapped');
 // Aim-down-sights weapons (main.js sets .ads-fire): AIM at the bottom of the
 // ring, a little wider, and the bottom slice of FIRE fires while aiming.
 const ads=document.body.classList.contains('ads-fire');
 const base=viewWidth()>viewHeight()?TOUCH_CLUSTER.landscapeBase:TOUCH_CLUSTER.portraitBase;
 const fire=byId('touch-launch'),aimFire=byId('touch-aimfire'),inner=TOUCH_CLUSTER.fire+TOUCH_CLUSTER.gap,outer=inner+TOUCH_CLUSTER.ring;
 const style=(el,size,shape,label)=>{
  el.classList.add('touch-shaped');
  el.style.setProperty('--size',size+'px');el.style.setProperty('--base',base+'px');el.style.setProperty('--edge','0px');
  el.style.setProperty('--inset',TOUCH_CLUSTER.inset+'px');el.style.setProperty('--inset-safe',TOUCH_CLUSTER.insetSafeMax+'px');
  el.style.setProperty('--shape',shape);el.style.setProperty('--lx',label.x+'px');el.style.setProperty('--ly',label.y+'px');
 };
 const f=TOUCH_CLUSTER.fire;
 // A slice of FIRE's quarter circle, from a0 to a1 degrees (0 = along the
 // bottom edge, 90 = up the side), drawn the right way round on either side.
 // FIRE's quarter circle has its screen corner rounded along one smooth
 // curve (a quadratic from `cornerRound` up the side to `cornerRound` along
 // the bottom), and a slice keeps only the stretch of that curve inside its
 // own angles, so FIRE and AIM + FIRE split it without a notch. Worked out
 // unmirrored, then flipped for the swapped side.
 const R=TOUCH_CLUSTER.cornerRound,soft=TOUCH_CLUSTER.softRound;
 const curve=[];for(let k=0;k<=24;k++){const t=k/24,u=1-t;
  // From the bottom edge (angle 0) to the side (angle 90), control at the corner.
  const x=u*u*(f-R)+2*u*t*f+t*t*f,y=u*u*f+2*u*t*f+t*t*(f-R);
  curve.push({x,y,a:Math.atan2(f-y,f-x)*180/Math.PI});}
 const at=a=>{for(let k=1;k<curve.length;k++){const p=curve[k-1],q=curve[k];if(a<=q.a+1e-9){const t=(a-p.a)/((q.a-p.a)||1);return {x:p.x+(q.x-p.x)*t,y:p.y+(q.y-p.y)*t};}}return curve.at(-1);};
 const flip=pt=>mirrored?{x:f-pt.x,y:pt.y}:pt;
 const slice=(a0,a1)=>{
  const corner=[at(a0),...curve.filter(c=>c.a>a0+1e-6&&c.a<a1-1e-6),at(a1)].map(flip);
  const arc=arcPoints(f,a1,a0,f,mirrored,28);
  const points=[...corner,...arc],round={[corner.length]:soft,[points.length-1]:soft};
  return roundedOutline(points,round);
 };
 const split=ads&&aimFire&&!aimFire.hidden&&!fire.classList.contains('touch-positioned')&&!fire.classList.contains('touch-removed');
 const cut=split?TOUCH_CLUSTER.adsFireDegrees:0;
 style(fire,f,cut?slice(cut,90):slice(0,90),ringPoint(f*.52,cut?(cut+90)/2+4:45,f,mirrored));
 if(aimFire){aimFire.classList.toggle('touch-split-off',!split);if(split)style(aimFire,f,slice(0,cut-1.6),ringPoint(f*.7,cut/2,f,mirrored));}
 // Buttons pulled out in the editor leave the ring, and it closes up without them.
 const order=ads?['touch-stream',...CLUSTER_ORDER.filter(id=>id!=='touch-stream')]:CLUSTER_ORDER;
 // Out of the ring (pulled out in the editor, or removed): no ring shape left on it.
 for(const id of [...CLUSTER_ORDER,'touch-launch','touch-aimfire']){const b=byId(id);if(b&&(b.classList.contains('touch-positioned')||b.classList.contains('touch-removed')))b.classList.remove('touch-shaped');}
 const shown=order.map(byId).filter(button=>button&&!button.hidden&&!button.classList.contains('touch-positioned')&&!button.classList.contains('touch-removed'));
 const weight=button=>ads&&button.id==='touch-stream'?TOUCH_CLUSTER.aimWeight:1;
 const n=shown.length,gap=TOUCH_CLUSTER.segmentGap/((inner+outer)/2)*180/Math.PI,total=shown.reduce((sum,b)=>sum+weight(b),0),unit=(90-gap*(n-1))/Math.max(1,total);
 let from=0;
 shown.forEach(button=>{
  const to=from+unit*weight(button),p=(r,a)=>ringPoint(r,a,outer,mirrored);
  const [o1,o2,i2,i1]=[p(outer,from),p(outer,to),p(inner,to),p(inner,from)];
  // An annular segment with softly rounded corners: more on the outside
  // (the edge you see against the game), less on the inside against FIRE.
  const steps=Math.max(6,Math.round((to-from)/2)),outerArc=arcPoints(outer,from,to,outer,mirrored,steps),innerArc=arcPoints(inner,to,from,outer,mirrored,steps);
  const pts=[...outerArc,...innerArc],last=outerArc.length-1,soft=TOUCH_CLUSTER.softRound;
  const shape=roundedOutline(pts,{0:soft,[last]:soft,[last+1]:soft*.6,[pts.length-1]:soft*.6});
  // Label at the segment's middle, weighted between its corners and its
  // centre line: on the end segments, cut straight by the screen edge, the
  // middle of the angle sits too near that edge and the word was cut off.
  const mid=p((inner+outer)/2,(from+to)/2),corners=[o1,o2,i2,i1];
  const label={x:(corners.reduce((sum,c)=>sum+c.x,0)+mid.x*2)/6,y:(corners.reduce((sum,c)=>sum+c.y,0)+mid.y*2)/6};
  style(button,outer,shape,label);
  from=to+gap;
 });
}
