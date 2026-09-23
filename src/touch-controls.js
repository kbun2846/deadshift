// Touch controls: telling taps from drags, the floating move stick on the
// walking side, and the shape of the right-thumb button cluster. Tunables are
// in config/controls.js. main.js decides what a tap or a drag does.
import { TOUCH_TAP, MOVE_STICK, TOUCH_CLUSTER, CLUSTER_ORDER } from './config/controls.js';
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
function ringPoint(radius,degrees,size,mirrored){
 const a=degrees*Math.PI/180;
 return {x:mirrored?radius*Math.cos(a):size-radius*Math.cos(a),y:size-radius*Math.sin(a)};
}
export function arrangeTouchCluster(){
 const mirrored=document.body.classList.contains('touch-swapped');
 // Aim-down-sights weapons (main.js sets .ads-fire): AIM at the bottom of the
 // ring, a little wider, and the bottom slice of FIRE fires while aiming.
 const ads=document.body.classList.contains('ads-fire');
 const base=innerWidth>innerHeight?TOUCH_CLUSTER.landscapeBase:TOUCH_CLUSTER.portraitBase;
 const fire=byId('touch-launch'),aimFire=byId('touch-aimfire'),inner=TOUCH_CLUSTER.fire+TOUCH_CLUSTER.gap,outer=inner+TOUCH_CLUSTER.ring;
 const style=(el,size,shape,label)=>{
  el.classList.add('touch-shaped');
  el.style.setProperty('--size',size+'px');el.style.setProperty('--base',base+'px');el.style.setProperty('--edge','0px');
  el.style.setProperty('--shape',shape);el.style.setProperty('--lx',label.x+'px');el.style.setProperty('--ly',label.y+'px');
 };
 const f=TOUCH_CLUSTER.fire;
 // A slice of FIRE's quarter circle, from a0 to a1 degrees (0 = along the
 // bottom edge, 90 = up the side), drawn the right way round on either side.
 const slice=(a0,a1)=>{
  const p=a=>ringPoint(f,a,f,mirrored),c=mirrored?{x:0,y:f}:{x:f,y:f};
  const [s,e]=mirrored?[p(a1),p(a0)]:[p(a0),p(a1)];
  return `path('M${c.x} ${c.y} L${s.x.toFixed(2)} ${s.y.toFixed(2)} A${f} ${f} 0 0 1 ${e.x.toFixed(2)} ${e.y.toFixed(2)} Z')`;
 };
 const split=ads&&aimFire&&!aimFire.hidden&&!fire.classList.contains('touch-positioned')&&!fire.classList.contains('touch-removed');
 const cut=split?TOUCH_CLUSTER.adsFireDegrees:0;
 style(fire,f,cut?slice(cut,90):slice(0,90),ringPoint(f*.52,cut?(cut+90)/2+4:45,f,mirrored));
 if(aimFire){aimFire.classList.toggle('touch-split-off',!split);if(split)style(aimFire,f,slice(0,cut-1.6),ringPoint(f*.7,cut/2,f,mirrored));}
 // Buttons pulled out in the editor leave the ring, and it closes up without them.
 const order=ads?['touch-stream',...CLUSTER_ORDER.filter(id=>id!=='touch-stream')]:CLUSTER_ORDER;
 const shown=order.map(byId).filter(button=>button&&!button.hidden&&!button.classList.contains('touch-positioned')&&!button.classList.contains('touch-removed'));
 const weight=button=>ads&&button.id==='touch-stream'?TOUCH_CLUSTER.aimWeight:1;
 const n=shown.length,gap=TOUCH_CLUSTER.segmentGap/((inner+outer)/2)*180/Math.PI,total=shown.reduce((sum,b)=>sum+weight(b),0),unit=(90-gap*(n-1))/Math.max(1,total);
 let from=0;
 shown.forEach(button=>{
  const to=from+unit*weight(button),p=(r,a)=>ringPoint(r,a,outer,mirrored);
  const [o1,o2,i2,i1]=[p(outer,from),p(outer,to),p(inner,to),p(inner,from)];
  const out=mirrored?0:1,back=mirrored?1:0;
  const shape=`path('M${o1.x.toFixed(2)} ${o1.y.toFixed(2)} A${outer} ${outer} 0 0 ${out} ${o2.x.toFixed(2)} ${o2.y.toFixed(2)} L${i2.x.toFixed(2)} ${i2.y.toFixed(2)} A${inner} ${inner} 0 0 ${back} ${i1.x.toFixed(2)} ${i1.y.toFixed(2)} Z')`;
  style(button,outer,shape,p((inner+outer)/2,(from+to)/2));
  from=to+gap;
 });
}
