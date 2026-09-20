import * as THREE from 'three';

// Solid pieces only: shelter entrances, graveyard gates and road crossings stay open.
export const ROADSIDE_TYPES = {
  stoneBoundary: { w:7,d:3,health:null,blocksSight:true,collisionBoxes:[[0,0,6.4,.85],[-2.8,1.1,.8,2.2]] },
  timberStack: { w:5,d:3,health:null,blocksSight:true,collisionBoxes:[[0,0,4.8,1.8],[1.7,1.2,1.3,.8]] },
  rockRidge: { w:7,d:4,health:null,blocksSight:true,collisionBoxes:[[-1.7,0,2.8,2.4],[1.2,.8,2.7,2.2]] },
  freightScreen: { w:5,d:3,health:null,blocksSight:true,collisionBoxes:[[-1,0,2.5,1.7],[1.2,.5,1.6,1.6]] },
  freightWreck: { w:5,d:3,health:null, collisionBoxes:[[-.4,0,3.4,1.8],[2,1.3,1.1,1.1]] },
  coachStop: { w:5,d:4,health:null, collisionBoxes:[[0,-1.3,5,.3],[-2.3,0,.3,3],[2.3,0,.3,3],[0,-.7,3.5,.65]] },
  loadingPlatform: { w:5,d:3,health:null, collisionBoxes:[[0,0,4.8,2.6],[2.5,1.9,1.8,.9]] },
  wateringStation: { w:5,d:3,health:null, collisionBoxes:[[-1,0,2.6,1.3],[1.6,-.4,1.4,1.4]] },
  culvert: { w:12,d:4,health:null, collisionBoxes:[[-5,0,1.5,3.5],[5,0,1.5,3.5]] },
  fallenPole: { w:5,d:3,health:null, collisionBoxes:[[-1,0,1.7,1.6],[.7,.5,3.3,.35]] },
  oreSite: { w:5,d:4,health:null, collisionBoxes:[[-.7,0,2.1,1.5],[1.6,1,1.3,1.2]] },
  checkpoint: { w:14,d:2,health:null, collisionBoxes:[[-5.7,0,3.4,.75],[5.7,0,3.4,.75]] },
  repairStation: { w:5,d:3,health:null, collisionBoxes:[[-.5,0,2.5,1],[1.5,1,1.5,1.4]] },
  graveyard: { w:6,d:6,health:null, collisionBoxes:[[-2.8,0,.2,5.6],[2.8,0,.2,5.6],[0,-2.8,5.6,.2],[-1.8,2.8,2,.2],[1.8,2.8,2,.2],[1.3,-1.5,1,1],[-1.2,0,.7,.4],[1.2,.5,.7,.4],[-1.2,-1.7,.7,.4]] },
};

export function makeRoadside(view, p, g) {
  const wood='#917655', faded='#ad9470', dark='#66543f', iron='#565a50', stone='#95866e';
  const box=(x,y,z,w,h,d,color=wood,parent=g)=>view.box(x,y,z,w,h,d,color,parent);
  const cyl=(x,y,z,r,h,color=iron,parent=g,segments=8)=>view.cylinder(x,y,z,r,h,color,parent,segments);
  const wheel=(x,y,z,r=.6,parent=g)=>{
    const ring=view.mesh(new THREE.TorusGeometry(r,.065,5,12),dark,x,y,z,parent);
    for(let i=0;i<6;i++){const spoke=box(0,0,0,r*1.85,.045,.05,faded,ring);spoke.rotation.z=i*Math.PI/6;}
    const hub=view.mesh(new THREE.CylinderGeometry(.1,.1,.22,7),iron,0,0,0,ring);hub.rotation.x=Math.PI/2;return ring;
  };
  const boards=(x,y,z,w,d,parent=g)=>{for(let i=0;i<Math.ceil(w/.42);i++)box(x-w/2+.21+i*.42,y,z,.38,.12,d,i%3?wood:faded,parent);};
  const crate=(x,z,size=1)=>{
    box(x,size*.5,z,size,size,size,faded);
    for(const side of [-1,1]){const brace=box(x,size*.5,z+side*(size*.5+.015),size*1.22,.085,.04,wood);brace.rotation.z=.67;}
  };
  const rubble=(x,z)=>{for(let i=0;i<5;i++){const r=view.mesh(new THREE.DodecahedronGeometry(.18+i%3*.06),stone,x+Math.sin(i*8)*.8,.12,z+Math.cos(i*5)*.5,g);r.scale.y=.6;}};
  const rail=(x,z,length,axis='x')=>{
    for(const offset of [-length/2,0,length/2])box(x+(axis==='x'?offset:0),.52,z+(axis==='z'?offset:0),.1,1.04,.1,dark);
    for(const y of [.38,.78])box(x,y,z,axis==='x'?length:.075,.065,axis==='z'?length:.075,faded);
  };
  if(p.type==='stoneBoundary'){
    for(let row=0;row<4;row++)for(let i=0;i<8;i++){
      if(row===3&&(i===0||i===6))continue;
      const b=box(-2.8+i*.8,.22+row*.4,Math.sin(i*9+row)*.06,.76,.37,.82,(i+row)%3?stone:'#82755f');b.rotation.y=Math.sin(i*5+row)*.055;
    }
    for(let i=0;i<3;i++)for(let row=0;row<3;row++)box(-2.8,.2+row*.4,.6+i*.65,.8,.37,.6,stone);
    rubble(3,1);rubble(-2,-1);
  }else if(p.type==='timberStack'){
    for(let row=0;row<3;row++)for(let i=0;i<3-row;i++){
      const z=-.6+i*.6+row*.3, log=cyl(0,.32+row*.51,z,.31,4.8-row*.25,wood);log.rotation.z=Math.PI/2;
      for(const side of [-1,1]){const end=cyl(side*(2.41-row*.125),.32+row*.51,z,.255,.025,faded);end.rotation.z=Math.PI/2;}
    }
    for(const x of [-1.6,1.6])box(x,.68,0,.075,1.25,1.9,iron);
    crate(1.7,1.2,.8);
  }else if(p.type==='rockRidge'){
    for(const [x,z,r,h] of [[-1.7,0,1.65,1.9],[1.2,.8,1.6,2.5],[-.1,.3,1.1,1.5]]){
      const rock=view.mesh(new THREE.DodecahedronGeometry(1,0),stone,x,h*.44,z,g);rock.scale.set(r,h*.68,r*.8);rock.rotation.y=x*.7;
    }
    rubble(-3,1.4);rubble(2.7,-.5);
  }else if(p.type==='freightScreen'){
    crate(-1,0,1.7);crate(1.2,.5,1.5);crate(-1.4,0,1);
    for(let i=0;i<5;i++)box(-1,1.77+i*.065,0,2.5,.055,1.5,i%2?dark:faded);
    for(const x of [-1.8,-.2])box(x,1.92,0,.08,.32,1.55,iron);
    const spare=wheel(2.2,.66,1.3,.65);spare.rotation.y=.3;rubble(-2,1.5);
  }else if(p.type==='freightWreck'){
    const bed=new THREE.Group();bed.position.x=-.4;bed.rotation.z=-.13;bed.rotation.x=.08;g.add(bed);boards(0,.8,0,3.3,1.8,bed);
    for(const z of [-.92,.92])for(let i=0;i<3;i++){if(z>0&&i===2)continue;box(0,1+i*.2,z,3.35,.14,.08,faded,bed);}
    for(const x of [-1.2,1.1])for(const z of [-1.05,1.05])if(!(x>0&&z>0))wheel(x,.62,z,.59);
    const loose=wheel(1.1,.13,1.8,.59);loose.rotation.x=Math.PI/2;
    for(const z of [-.55,.55])box(2.1,.42,z,1.6,.11,.1,wood);
    crate(2,1.3,.95);crate(-1.2,-.2,.8);
    for(let i=0;i<4;i++){const plank=box(-2+i*.5,.075,1.7,.8,.07,.18,faded);plank.rotation.y=i*.7;}
  }else if(p.type==='coachStop'){
    for(const x of [-2.3,2.3])for(const z of [-1.3,1.3])box(x,1.45,z,.15,2.9,.15,dark);
    for(let i=0;i<5;i++)box(0,.38+i*.38,-1.3,4.7,.3,.1,i%2?wood:faded);
    // Missing roof boards and a bench clearly read as a disused roadside shelter.
    for(let i=0;i<12;i++){if(i===3||i===9)continue;const plank=box(-2.3+i*.42,3,0,.39,.12,3.3, i%3? '#7c8070':'#8e8c76');plank.rotation.x=.1;}
    box(0,.58,-.7,3.5,.15,.65,faded);box(0,1.02,-1,3.5,.45,.08,wood);
    for(const x of [-1.4,1.4])box(x,.28,-.7,.15,.55,.5,dark);
    box(-2,2.4,1.3,.4,.52,.08,iron);box(-2,2.4,1.36,.22,.3,.015,'#c0a66d');
    const sign=box(0,2.35,-1.4,2,.35,.06,wood);sign.rotation.z=-.06;
  }else if(p.type==='loadingPlatform'){
    boards(0,.72,0,4.8,2.6);for(const x of [-2,0,2])for(const z of [-1,1])box(x,.32,z,.23,.64,.23,dark);
    for(let i=0;i<5;i++){const timber=box(2.5,.18+i*.16,1.9,1.8,.14,.75,i%2?dark:wood);timber.rotation.y=(i%2)*.08;}
    crate(-1,-.3,.85);box(1,.95,0,1.4,.3,.7,dark);
    for(let i=0;i<3;i++)box(-.7,.13+i*.17,1.7-i*.22,1.5,.16,.4,faded);
  }else if(p.type==='wateringStation'){
    box(-1,.12,0,2.6,.22,1.3,stone);for(const z of [-.58,.58])box(-1,.52,z,2.6,.75,.17,stone);
    for(const x of [-2.2,.2])box(x,.52,0,.17,.75,1.2,stone);box(-1,.25,0,2.2,.03,.92,'#514936');
    cyl(1.6,.3,-.4,.12,.6,iron);cyl(1.6,1.1,-.4,.67,1.3,wood);
    for(const y of [.64,1.5])cyl(1.6,y,-.4,.69,.065,iron);
    cyl(.55,.6,-.8,.075,1.2,iron);box(.55,1.12,-.58,.12,.14,.52,iron);
    const handle=box(.65,1.35,-.8,.65,.065,.075,iron);handle.rotation.z=-.5;rubble(-2,1);
  }else if(p.type==='culvert'){
    for(const side of [-1,1]){
      for(let i=0;i<4;i++)for(let j=0;j<3;j++)box(side*5,.2+j*.35,-1.35+i*.85,1.5,.32,.8,(i+j)%3?stone:'#82755f');
      for(let i=0;i<4;i++){const rock=view.mesh(new THREE.DodecahedronGeometry(.6),stone,side*(6.4+i*.7),.13,Math.sin(i*4)*.8,g);rock.scale.set(1,.45,.8);}
      rubble(side*6,1.5);
    }
    // The deck stays low and unobstructed between the stone parapets.
    for(let i=0;i<9;i++)box(0,.045,-1.4+i*.35,8.4,.07,.31,'#857257');
  }else if(p.type==='fallenPole'){
    const rock=view.mesh(new THREE.DodecahedronGeometry(.95),stone,-1,.55,0,g);rock.scale.set(1,.8,.85);
    const pole=box(.4,.65,.5,4.8,.23,.23,wood);pole.rotation.z=-.15;pole.rotation.y=.05;
    box(2.4,.35,.5,.16,.14,2,wood);for(const z of [-.3,.25,.8,1.3])cyl(2.4,.49,z,.07,.2,'#718276');
    const wire=[new THREE.Vector3(2.4,.4,-.4),new THREE.Vector3(3,.08,-1),new THREE.Vector3(2.8,.055,-1.7),new THREE.Vector3(1.9,.05,-1.8)];
    g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(wire),new THREE.LineBasicMaterial({color:'#514c3e'})));
  }else if(p.type==='oreSite'){
    for(const x of [-.65,.65])box(x,.055,0,.065,.09,4.8,iron);for(let i=0;i<7;i++)box(0,.035,-2.2+i*.7,1.8,.065,.18,dark);
    const cart=new THREE.Group();cart.position.set(-.7,.55,0);cart.rotation.z=.28;g.add(cart);
    box(0,0,0,1.6,.14,1.2,iron);for(const x of [-.8,.8])box(x,.4,0,.1,.85,1.3,'#74786a');for(const z of [-.6,.6])box(0,.4,z,1.7,.85,.08,'#686c60');
    for(const x of [-.55,.55])for(const z of [-.72,.72])wheel(x,.26,z,.25,cart);
    box(1.6,.5,1,1.3,.15,1.2,wood);for(const z of [.5,1.5])box(1.6,.75,z,.14,1.3,.13,wood);
    const drum=cyl(1.6,.95,1,.24,.8,iron);drum.rotation.x=Math.PI/2;box(2,.98,1.5,.4,.08,.08,iron);rubble(-1.5,1.6);
  }else if(p.type==='checkpoint'){
    for(const side of [-1,1])for(let row=0;row<3;row++)for(let i=0;i<4;i++)box(side*(4.5+i*.8),.21+row*.4,0,.75,.37,.75,i%3?stone:'#a29172');
    for(const side of [-1,1])box(side*4.1,1,0,.22,2,.22,dark);
    const gate=new THREE.Group();gate.position.set(5.5,.13,1.4);gate.rotation.set(Math.PI/2,0,-.25);g.add(gate);
    for(const y of [-.4,.4])box(0,y,0,2.8,.1,.1,wood,gate);for(const x of [-1.3,0,1.3])box(x,0,0,.1,1,.1,faded,gate);rubble(-6,1.3);
  }else if(p.type==='repairStation'){
    boards(-.5,1,0,2.5,1);for(const x of [-1.5,.5])for(const z of [-.35,.35])box(x,.45,z,.13,.9,.13,dark);
    wheel(-1.2,.72,-.65,.7);wheel(.3,.6,-.65,.57);
    for(let i=0;i<5;i++)box(1.5,.16+i*.16,1,1.5,.14,1.3,i%2?dark:wood);
    box(-.5,1.12,0,.45,.1,.12,iron);box(-.32,1.16,.05,.12,.13,.24,iron);
    for(const x of [-2,2])box(x,.65,-1.3,.12,1.3,.12,dark);box(0,1,-1.3,4,.12,.12,wood);
  }else if(p.type==='graveyard'){
    rail(-2.8,0,5.6,'z');rail(2.8,0,5.6,'z');rail(0,-2.8,5.6);rail(-1.8,2.8,2);rail(1.8,2.8,2);
    for(const [x,z] of [[-1.2,-1.7],[-1.2,0],[1.2,.5]]){
      const marker=box(x,.4,z,.65,.8,.19,stone);marker.rotation.z=Math.sin(z+2)*.1;
      const top=view.mesh(new THREE.CylinderGeometry(.32,.32,.19,10),stone,x,.8,z,g);top.rotation.x=Math.PI/2;
      box(x,.045,z+.7,.68,.05,1.1,'#807054');box(x,.52,z+.105,.24,.025,.015,'#766951');
    }
    box(1.3,.16,-1.5,1,.32,1,stone);box(1.3,.95,-1.5,.6,1.5,.5,'#a09177');box(1.3,1.78,-1.5,.78,.15,.66,stone);
  }
  // Sparse chips and fasteners on timber; no labels or ornamental clutter.
  g.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});
}
