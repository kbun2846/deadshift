import * as THREE from 'three';
import { themeOf, roomLayout, roomRandom, onCounter } from './room-furniture.js';
import { isColonial } from './colonial-interiors.js'; // s2-interiors

// Set dressing, and the furniture of room-furniture.js drawn where its list
// puts it (that list is also the furniture's colliders, map-kit.js). Portal
// geometry stays owned by maps.js.
export function makeInteriorDetails(view,b) {
  if (isColonial(b)) return; // s2-interiors: Hollow Wick's rooms dress themselves (no cookstove, no hanging lamp)
  const [floor,dark,accent,theme]=themeOf(b);
  const g=new THREE.Group();g.position.set(b.x,0,b.z);view.static.add(g);
  const box=(x,y,z,w,h,d,c=dark,parent=g)=>view.box(x,y,z,w,h,d,c,parent);
  const cyl=(x,y,z,r,h,c=accent,parent=g)=>view.cylinder(x,y,z,r,h,c,parent,8);
  const left=-b.w/2+.7,right=b.w/2-.7,rear=-b.d/2+1.1;
  const rand=roomRandom(b);
  const { pieces } = roomLayout(b);
  const piece=kind=>pieces.find(p=>p.kind===kind);
  // The plain rooms' counter along the back wall (its segments either side of
  // a back door) and the two stools in front of it.
  for(const p of pieces){
    if(p.kind==='counter')box(p.x,.4,p.z,p.w,.8,p.d,b.trim||'#987853');
    else if(p.kind==='stool')view.cylinder(p.x,.28,p.z,.32,.56,b.trim||'#7d6a50',g);
  }
  // Small non-blocking litter collects against a wall, clear of the door lanes.
  const litter=piece('litter');
  if(litter)for(let i=0;i<9;i++){
    const scrap=box(litter.x-.35+rand(i+400)*.8,.085+(i%3)*.025,litter.z-.3+rand(i+500)*.65,.18+rand(i+600)*.4,.025,.09,i%3?dark:floor);
    scrap.rotation.y=rand(i+700)*Math.PI;
  }
  // An abandoned chair, folded onto its broken leg beside the wall rather than in a lane.
  const fallen=piece('brokenChair');
  if(fallen){
    const broken=new THREE.Group();broken.position.set(fallen.x,.18,fallen.z);broken.rotation.set(.18,-.4,.95);g.add(broken);
    box(0,.3,0,.54,.08,.5,floor,broken);
    for(const x of [-.22,.22])box(x,.63,-.2,.065,.65,.065,dark,broken);
    box(0,.85,-.2,.52,.12,.07,dark,broken);
    for(const [x,z] of [[-.2,-.18],[.2,-.18],[-.2,.18]])box(x,.13,z,.06,.3,.06,dark,broken);
    const leg=box(fallen.x-.35,.095,fallen.z+.7,.08,.07,.38,dark);leg.rotation.y=.75;
  }
  // Individually staggered boards with repairs, scratches and subdued colour changes.
  for(let col=0,x=-b.w/2+.24;x<b.w/2-.2;x+=.46,col++){
    for(let row=0,z=-b.d/2+.22;z<b.d/2-.2;row++,z+=1.8){
      const depth=Math.min(1.78,b.d/2-.2-z),w=Math.min(.442,b.w/2-.2-x);
      if(depth<=0||w<=0)continue;
      const color='#'+new THREE.Color(floor).multiplyScalar(.94+Math.floor(rand(col*91+row)*4)*.04).getHexString();
      box(x+w/2,.073,z+depth/2,w,.012,depth,color);
      if((col+row*3)%5===0){
        const scratch=box(x+w*.4,.081,z+depth*.5,.012,.003,depth*.45,dark);scratch.rotation.y=.04;
      }
    }
  }
  const rug=(x,z,w,d,c=accent)=>{
    box(x,.09,z,w,.014,d,c);
    for(const side of [-1,1])box(x+side*(w/2-.09),.1,z,.045,.005,d-.1,'#b1a184');
    for(let i=0;i<7;i++)for(const side of [-1,1])box(x-w*.42+i*w*.14,.09,z+side*(d/2+.06),.025,.01,.12,'#998e76');
  };
  // Things set on the counter (z === rear) move along it onto a segment
  // (a back door splits it), and are left out where the room has none.
  const onTop=(x,z)=>z===rear?onCounter(b,x):x;
  const bottle=(x,z,y=.83,c='#637b6d')=>{if((x=onTop(x,z))===null)return;cyl(x,y+.12,z,.075,.24,c);cyl(x,y+.27,z,.033,.09,c);};
  const papers=(x,z,y=.83)=>{if((x=onTop(x,z))===null)return;for(let i=0;i<3;i++){const p=box(x+i*.06,y+i*.012,z,.42,.012,.32,'#c4b697');p.rotation.y=i*.13;}};
  const cloth=(x,z,y=.84,c=accent)=>{if((x=onTop(x,z))===null)return;box(x,y,z,.85,.045,.48,c);for(let i=0;i<3;i++)box(x,y+.026+i*.023,z+i*.025,.76,.023,.4,c);};
  // A row along the counter keeps only what lands on it (no pile at a segment's end).
  const onRow=x=>{const c=onCounter(b,x);return c!==null&&Math.abs(c-x)<1e-9;};
  const shelfGoods=(kind)=>{
    for(let i=0;i<7;i++){
      const x=-b.w*.3+i*b.w*.1;
      if(!onRow(x))continue;
      if(kind==='bottles')bottle(x,rear,.82,i%2?'#77794d':'#566f65');
      else if(kind==='cloth')cloth(x,rear,.84,i%2?accent:'#ab9876');
      else{box(x,.98,rear,.32,.34,.38,i%2?'#b4a184':accent);box(x,.99,rear+.196,.19,.12,.008,'#c8ba9b');}
    }
  };
  const basin=(x,z)=>{if((x=onTop(x,z))===null)return;cyl(x,.96,z,.25,.12,'#8c9183');cyl(x,1.025,z,.2,.012,'#4f625d');};
  // The theme's large accent, where room-furniture.js placed it (a back
  // corner, off the door lanes).
  const corner=(kind,side=-1)=>{
    const p=pieces.find(p=>p.kind===kind&&p.side===side);if(!p)return;
    const {x,z}=p;
    if(kind==='stove'){
      box(x,.45,z,.58,.76,.58,'#555951');cyl(x,1.32,z,.095,1.2,'#62665b');
      box(x,.5,z+.3,.34,.3,.03,'#383e39');cyl(x,.88,z,.32,.08,'#767769');
    }else if(kind==='sacks'){
      for(let i=0;i<3;i++)cyl(x-.18+(i%2)*.36,.24+Math.floor(i/2)*.38,z-.15+(i%2)*.3,.25,.43,'#b1a07a');
    }else if(kind==='wheel'){
      const wheel=new THREE.Mesh(new THREE.TorusGeometry(.47,.065,5,12),view.material(dark));wheel.position.set(x,.53,z);wheel.rotation.y=.25;g.add(wheel);
      for(let i=0;i<4;i++){const spoke=box(x,.53,z,.035,.9,.045);spoke.rotation.z=i*Math.PI/4;}
    }
  };
  if(theme==='bar'){
    rug(0,-.3,2.2,3.7);shelfGoods('bottles');
    const tray=onTop(-1,rear);
    if(tray!==null){box(tray,.87,rear+.02,.65,.08,.46,'#9a805b');for(let i=0;i<3;i++)cyl(tray-.2+i*.2,.94,rear,.065,.1,'#c4b59a');}
  }else if(theme==='provisions'){
    shelfGoods('tins');corner('sacks');papers(.4,rear);rug(.8,.1,1.8,2.5);
  }else if(theme==='office'){
    papers(-1,rear);bottle(1,rear);const ledger=onTop(.2,rear);if(ledger!==null)box(ledger,.93,rear,.55,.21,.38,'#555f58');
    rug(0,0,2.3,2);corner('stove');
  }else if(theme==='freight'){
    shelfGoods('tins');corner('wheel');
    for(let i=0;i<6;i++)box(left+.3,.1,rear+2+i*.24,1.15,.035,.09,'#a49372');
    papers(1,rear);
  }else if(theme==='lodging'){
    rug(-1,0,2,3.4);cloth(-1,rear);basin(1,rear);bottle(1.5,rear,.83,'#96856a');
  }else if(theme==='abandoned'){
    for(let i=0;i<9;i++){const p=box(left+rand(i)*1.6,.1,rear+1+rand(i+20)*2,.12,.045,.65+rand(i+40),floor);p.rotation.y=rand(i+60)*3;}
    const board=onTop(1,rear);if(board!==null)box(board,.85,rear,.5,.055,.4,accent);bottle(-1,rear,.83,'#756e55');
  }else if(theme==='hearth'){
    corner('stove');rug(.5,.4,2.3,2.4);basin(.7,rear);cloth(-.5,rear,.84,'#8b7967');
  }else if(theme==='workshop'){
    for(let i=0;i<6;i++)box(-3.7+i*.35,1.19,.4,.18,.07,.45,i%2?'#65706a':'#b29a75');
    corner('wheel',1);rug(-2.7,.4,3.6,1.7,'#786e55');
  }else if(theme==='drygoods'){
    shelfGoods('cloth');rug(1,.3,1.65,2.6,'#9a885e');corner('sacks',1);
  }else if(theme==='farm'){
    basin(-1,rear);bottle(-1.6,rear);papers(.1,rear);corner('sacks',1);rug(-.3,.2,2.1,2.4);
    for(let i=0;i<4;i++)if(onRow(.8+i*.15))cyl(.8+i*.15,.88,rear,.065,.12,'#ad945b');
  }else if(theme==='barn'){
    corner('wheel');corner('sacks',1);
    for(let i=0;i<65;i++){const straw=box((rand(i)-.5)*(b.w-1),.09,(rand(i+90)-.5)*(b.d-1),.018,.009,.18+rand(i+130)*.3,'#b3a06c');straw.rotation.y=rand(i+160)*6;}
  }else if(theme==='mercantile'){
    shelfGoods('tins');papers(-1,rear);rug(.5,0,2.3,2.8);basin(1.5,rear);
  }else if(theme==='homestead'){
    corner('stove',1);cloth(-1,rear,.84,'#82716b');rug(-.8,.5,2.3,2.6);papers(.5,rear);
  }else if(theme==='depot'){
    papers(-2.4,.4,1.18);box(-3.3,1.3,.4,.5,.2,.33,'#5f6b62');
    for(let i=0;i<3;i++)cloth(2.5+i*.42,-b.d/2+1.5,1.36,'#928668');
    rug(-2.7,.4,3.5,1.8,'#7a8170');
  }
  // Low wall trim follows real solid wall spans, never stretches across an opening.
  // Room-specific wear is concentrated near corners instead of filling the walking lane.
  for(let i=0;i<14;i++){
    const x=(i%2?left:right)+(rand(i+300)-.5)*.6,z=(rand(i+320)-.5)*(b.d-1.4);
    const chip=box(x,.089,z,.04+rand(i+340)*.12,.009,.12+rand(i+360)*.3,dark);chip.rotation.y=rand(i+380)*5;
  }

  // Four things every room of this period would have, chosen because each one
  // reads from directly overhead — which is the only view the player gets.
  //
  // None of it is placed blind: the shelf and the stove below stand where
  // room-furniture.js put them (clear of the room's cover, the doorways, the
  // lanes to them and each other), and that same list makes them solid.
  // A lamp hung from a ceiling joist: a dark cord and a pale shade, the one
  // detail that is unmistakably a fixture rather than something on the floor.
  // It hangs over open floor, so it only avoids the doorway lane.
  const lampZ = -b.d / 2 + Math.min(2.6, b.d * .35);
  if (Math.abs(lampZ) + .3 < b.d / 2 - .4) {
    cyl(0, b.height - .34, lampZ, .02, .62, dark);
    cyl(0, b.height - .72, lampZ, .19, .14, '#c8b488');
    cyl(0, b.height - .79, lampZ, .1, .03, '#e8d9a8');
  }

  // A shelf board along a solid side wall with a row of tins and jars on it,
  // at different heights so the row does not read as a printed pattern.
  const shelf = piece('shelf');
  if (shelf) {
    const sx = shelf.x, sz = shelf.z, shelfRun = shelf.d;
    box(sx, 1.34, sz, .3, .05, shelfRun, floor);
    for (const support of [-1, 1]) box(sx, 1.18, sz + support * (shelfRun / 2 - .25), .26, .28, .06, dark);
    for (let i = 0; i * .44 < shelfRun - .3; i++) {
      const tall = rand(i + 900) < .35;
      cyl(sx, 1.42 + (tall ? .07 : 0), sz - shelfRun / 2 + .3 + i * .44, .055 + rand(i + 920) * .03, tall ? .26 : .12, i % 3 ? accent : '#ad945b');
    }
  }

  // A boot scraper and a mat just inside the doorway, where the dirt comes in.
  // This one belongs in the door lane, so it is placed rather than claimed.
  const matZ = b.d / 2 - 1.15;
  const mat = box(0, .079, matZ, 1.3, .014, .7, '#7b6f57'); mat.rotation.y = rand(31) * .14 - .07;
  for (let i = 0; i < 5; i++) box(-.5 + i * .25, .088, matZ, .06, .02, .62, dark);
  // The dirt it has not caught, tracked a little further in.
  for (let i = 0; i < 8; i++) {
    const smudge = box((rand(i + 960) - .5) * 1.8, .077, matZ - .6 - rand(i + 980) * 1.4, .1 + rand(i + 1000) * .22, .008, .09 + rand(i + 1020) * .16, dark);
    smudge.rotation.y = rand(i + 1040) * Math.PI;
  }

  // A stove against the back wall with its flue running up to the roof, and the
  // scorch ring on the boards around its feet. Rooms whose theme already puts a
  // stove in a corner do not get a second one.
  const range = piece('range');
  if (range) {
    const { stoveX, stoveZ, facing } = range;
    box(stoveX, .35, stoveZ, .74, .7, .62, '#4f544c');
    box(stoveX, .72, stoveZ, .82, .06, .7, '#5d635a');
    cyl(stoveX, .5, stoveZ + facing * .34, .11, .1, '#3d423c');
    cyl(stoveX, 1.5, stoveZ, .085, 1.6, '#4a4f48');
    for (const y of [.95, 1.9]) cyl(stoveX, y, stoveZ, .1, .07, '#3d423c');
    // Its top used to land at exactly the floor's top, y 0.079, so the two faces
    // shared a plane and flickered through each other. Lifted a few millimetres.
    const scorch = box(stoveX, .082, stoveZ + facing * .15, 1.35, .008, 1.15, '#6a5b48'); scorch.rotation.y = .08;
    // Split wood stacked beside it, ready for the stove.
    const logSide = stoveX < 0 ? 1 : -1;
    for (let i = 0; i < 5; i++) {
      const log = cyl(stoveX + logSide * (.68 + (i % 2) * .06), .11 + Math.floor(i / 2) * .18, stoveZ + facing * (.5 + (i % 2) * .2), .075, .52, i % 2 ? '#7d6a4e' : '#6d5c44');
      log.rotation.set(Math.PI / 2, 0, rand(i + 1100) * .2);
    }
  }
}
