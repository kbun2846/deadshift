import * as THREE from 'three';
import { isColonial, colonialCover, makeColonialInterior } from './colonial-interiors.js'; // s2-interiors: Hollow Wick's rooms

// Local coordinates shared by visible furniture and collision, including rotated buildings.
export function interiorCover(b) {
  if (!b.interiorStyle) return [];
  if (isColonial(b)) return colonialCover(b); // s2-interiors
  if (b.interiorStyle==='cargo') return [{kind:['open-car-a','open-car-c'].includes(b.id)?'coal':'lumber',x:-.6,z:b.doors?.includes('back')?b.d/2-1.5:-b.d/2+1.5,w:1.8,d:1.7,h:1}];
  if (b.interiorStyle==='station') return [
    // Broken ticket counter, staggered waiting benches and a rear baggage office.
    {kind:'counter',x:-7,z:-3,w:7,d:1.1,h:1.2},
    {kind:'partition',x:-8,z:-6,w:8,d:.25,h:2.2},
    {kind:'partition',x:7,z:-6,w:10,d:.25,h:2.2},
    {kind:'shelf',x:-11.5,z:-9,w:.8,d:3,h:1.8},
    {kind:'cargo',x:3.5,z:-9,w:2.4,d:1.4,h:1.3},
    ...[-6,5].flatMap(x=>[2,6].map(z=>({kind:'seat',x,z,w:3.6,d:.8,h:.65}))),
    {kind:'cargo',x:10,z:7,w:1.5,d:1.4,h:1.1},
    {kind:'debris',x:10.7,z:-9.5,w:2.3,d:2,h:.8},
  ];
  if (b.interiorStyle==='railWarehouse') return [
    {kind:'partition',x:-8,z:-3,w:7,d:.25,h:2.1},
    {kind:'partition',x:8,z:-3,w:7,d:.25,h:2.1},
    {kind:'shelf',x:-11,z:-6,w:.8,d:3,h:1.8},
    ...[[-6,1,3.3,1.6],[5,3,3,2],[-7,5,2,2],[2,-6,2.4,1.6]].map(([x,z,w,d])=>({kind:'cargo',x,z,w,d,h:1.6})),
    {kind:'bench',x:10,z:-6,w:1,d:2.5,h:1.05},
    {kind:'debris',x:-9.5,z:6.9,w:2.8,d:2,h:.9},
  ];
  const rear=-b.d/2+3.5;
  return [
    {kind:'partition',x:-(b.w/2+1.5)/2,z:rear,w:b.w/2-1.5,d:.25,h:2.15},
    {kind:'partition',x:(b.w/2+1.5)/2,z:rear,w:b.w/2-1.5,d:.25,h:2.15},
    {kind:'shelf',x:-b.w/2+.8,z:-b.d/2+1.7,w:.8,d:2.4,h:1.8},
    {kind:'cargo',x:2.9,z:-b.d/2+1.5,w:2.3,d:1.4,h:1.3},
    {kind:'counter',x:-2.7,z:.4,w:3,d:1,h:1.1},
    {kind:'cargo',x:2.6,z:2.5,w:1.8,d:1.5,h:1.5},
    {kind:'bench',x:b.w/2-.8,z:3.7,w:.85,d:2.4,h:1.05},
  ];
}

export function makeDetailedInterior(view,b) {
  if (isColonial(b)) return makeColonialInterior(view,b); // s2-interiors
  const g=new THREE.Group();g.position.set(b.x,0,b.z);view.static.add(g);
  const wood='#897052',faded='#a28b69',dark='#65533f',iron='#565b51';
  const box=(x,y,z,w,h,d,c=wood,parent=g)=>view.box(x,y,z,w,h,d,c,parent);
  for(const p of interiorCover(b)) {
    if(p.kind==='coal') {
      box(p.x,.36,p.z,p.w,.16,p.d,dark);
      for(const x of [-p.w/2,p.w/2])box(p.x+x,.65,p.z,.09,.6,p.d,wood);
      for(const z of [-p.d/2,p.d/2])box(p.x,.65,p.z+z,p.w,.6,.09,wood);
      for(let i=0;i<22;i++) {
        const x=p.x+Math.sin(i*13)*.66,z=p.z+Math.cos(i*7)*.6;
        const coal=view.mesh(new THREE.DodecahedronGeometry(.22+i%3*.04),i%3?'#373b37':'#50514a',x,.68+(i%3)*.12,z,g);coal.rotation.set(i*.4,i*.7,0);
      }
    }else if(p.kind==='lumber') {
      for(let row=0;row<4;row++)for(let i=0;i<4;i++)box(p.x-.66+i*.44,.35+row*.17,p.z+Math.sin(i*4+row)*.05,.4,.15,1.7,row%2?faded:wood);
      for(const z of [-.5,.5])box(p.x,.73,p.z+z,1.79,.8,.055,iron);
    }else if(p.kind==='debris') {
      // Fallen masonry beneath the damaged wall, with splintered roof timbers.
      for(let i=0;i<15;i++) {
        const x=p.x+Math.sin(i*13)*p.w*.35,z=p.z+Math.cos(i*7)*p.d*.34;
        const chunk=view.mesh(new THREE.DodecahedronGeometry(.23+i%3*.09),'#93846c',x,.16+(i%3)*.17,z,g);
        chunk.scale.set(1,.6,1);chunk.rotation.set(i*.2,i*.8,i*.1);
      }
      for(let i=0;i<5;i++){const timber=box(p.x+Math.sin(i)*.4,.24+i*.09,p.z+Math.cos(i*3)*.4,p.w*.8,.14,.18,i%2?dark:wood);timber.rotation.y=i*.64;timber.rotation.z=(i%2-.5)*.14;}
    }else if(p.kind==='partition') {
      for(let x=-p.w/2+.16;x<p.w/2;x+=.32)box(p.x+x,p.h/2,p.z,.3,p.h-(Math.sin(x*8)>.6?.15:0),p.d,faded);
      for(const y of [.25,1.7])box(p.x,y,p.z+.14,p.w,.1,.08,dark);
    }else if(p.kind==='shelf') {
      box(p.x,p.h/2,p.z,p.w,p.h,p.d,dark);
      for(const y of [.18,.7,1.25,1.75]){
        box(p.x+.43,y,p.z,.1,.09,p.d,faded);
        for(let i=0;i<4;i++)box(p.x+.46,y+.16,p.z-.85+i*.52,.13,.23,.34,i%2?wood:iron);
      }
    }else if(p.kind==='cargo') {
      box(p.x,p.h/2,p.z,p.w,p.h,p.d,faded);
      for(const side of [-1,1]){
        for(const y of [.18,p.h-.18])box(p.x,y,p.z+side*(p.d/2+.02),p.w,.12,.045,dark);
        const brace=box(p.x,p.h/2,p.z+side*(p.d/2+.045),p.w*.94,.12,.05,wood);brace.rotation.z=.35;
      }
      for(const x of [-p.w*.3,p.w*.3])box(p.x+x,p.h+.02,p.z,.08,.045,p.d,iron);
    }else if(p.kind==='seat') {
      const broken=p.x<0&&p.z>3;
      // Missing slats and a sagging back; the intact frame remains physical cover.
      for(let i=0;i<7;i++)if(!broken||i!==4){const slat=box(p.x-p.w/2+(i+.5)*p.w/7,p.h,p.z,p.w/7-.025,.13,p.d,faded);if(broken&&i===3)slat.rotation.z=-.18;}
      for(let i=0;i<3;i++)if(!broken||i!==1){const back=box(p.x,p.h+.23+i*.18,p.z-.35,p.w,.14,.1,wood);if(broken)back.rotation.z=.035;}
      if(broken){const fallen=box(p.x+.6,.13,p.z+.7,1.1,.09,.16,dark);fallen.rotation.y=.7;}
      for(const x of [-p.w*.4,p.w*.4])box(p.x+x,p.h/2,p.z,.14,p.h,p.d-.12,dark);
    }else{
      // Solid front panels stop fire; battered top and legs still read as furniture.
      box(p.x,p.h*.45,p.z,p.w-.08,p.h*.9,p.d-.08,dark);
      box(p.x,p.h,p.z,p.w+.1,.13,p.d+.1,faded);
      for(let i=0;i<4;i++)box(p.x-p.w*.36+i*p.w*.24,p.h+.075,p.z,.018,.008,p.d,wood);
      if(p.kind==='bench') {
        box(p.x,1.2,p.z-.6,.34,.2,.42,iron);box(p.x-.1,1.18,p.z+.55,.4,.1,.08,dark);
      }
    }
  }
  if(b.cargo) return;
  if(b.interiorStyle==='station') {
    // Ticket grille and a clock face without lettering.
    for(let i=0;i<12;i++)box(-10+i*.5,1.75,-3,.035,1,.035,iron);
    box(-7,2.25,-3,7,.1,.13,dark);
    const clock=view.mesh(new THREE.CylinderGeometry(.6,.6,.08,16), '#c1b292',0,2.5,-b.d/2+.24,g);clock.rotation.x=Math.PI/2;
    box(0,2.62,-b.d/2+.3,.04,.32,.025,iron);
    const hand=box(.12,2.5,-b.d/2+.31,.3,.035,.025,iron);hand.rotation.z=-.35;
    for(let i=0;i<5;i++)box(-10+i*1.3,.07,-4.2,.5,.01,.32,'#bcaa85');
  }
  // Aged floor repairs, loose boards, collapsed chair and dust beneath furniture.
  for(let i=0;i<24;i++){
    const x=Math.sin(i*13.3)*(b.w/2-1),z=Math.cos(i*5.7)*(b.d/2-1);
    const plank=box(x,.083,z,.07,.018,.35+(i%4)*.22,i%3?dark:faded);plank.rotation.y=i*.7;
  }
  for(let i=0;i<5;i++)box(-b.w/2+1.2+i*.3,.09,b.d/2-1.7,.27,.025,1.1,i%2?wood:faded);
  const chair=new THREE.Group();chair.position.set(-b.w/2+1.4,.22,1.5);chair.rotation.z=1.15;g.add(chair);
  box(0,.3,0,.55,.1,.55,wood,chair);box(0,.65,-.23,.55,.65,.07,wood,chair);
  for(const x of [-.22,.22])for(const z of [-.22,.22])box(x,.1,z,.07,.45,.07,dark,chair);
  // Empty picture frame and cracked plaster expose the old plank structure.
  for(const x of [-.6,.6])box(x,1.9,-b.d/2+.22,.07,.85,.06,dark);
  for(const y of [1.5,2.3])box(0,y,-b.d/2+.22,1.25,.07,.06,dark);
  for(let i=0;i<7;i++)box(-b.w/2+.21,.5+i*.28,2.5,.025,.2,.7+(i%3)*.2,'#b19a76');
  // Dusty web strands tucked into the rear storage-room corners.
  const points=[];
  for(let i=0;i<6;i++)points.push(new THREE.Vector3(-b.w/2+.2,2.5,-b.d/2+.2),new THREE.Vector3(-b.w/2+.25+i*.16,1.8+i*.1,-b.d/2+.25));
  g.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color:'#c6bda5',transparent:true,opacity:.35})));
}
