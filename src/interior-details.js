import * as THREE from 'three';

// Set dressing only: portal geometry and gameplay colliders remain owned by maps.js.
const THEMES = {
  saloon:['#82705a','#665544','#795447','bar'],
  supplies:['#99866c','#796750','#78816c','provisions'],
  sheriff:['#8f8270','#746957','#6c7a76','office'],
  freight:['#847764','#685e50','#8b8067','freight'],
  'boarding-house':['#97816b','#7d6958','#797c68','lodging'],
  'abandoned-store':['#817a66','#676250','#7f7560','abandoned'],
  'old-house':['#95836e','#796854','#8c725d','hearth'],
  workshop:['#837360','#665c50','#778077','workshop'],
  'south-store':['#a08a6d','#7a6854','#81714e','drygoods'],
  farmhouse:['#a18e70','#807259','#899078','farm'],
  barn:['#86765b','#6d5d47','#a3915b','barn'],
  'west-mercantile':['#928774','#726955','#697d75','mercantile'],
  'west-homestead':['#927f68','#74614e','#83736b','homestead'],
  'west-depot':['#8a7f6d','#706451','#71817b','depot'],
};

export function makeInteriorDetails(view,b) {
  const [floor,dark,accent,theme]=THEMES[b.id]||THEMES.freight;
  const g=new THREE.Group();g.position.set(b.x,0,b.z);view.static.add(g);
  const box=(x,y,z,w,h,d,c=dark,parent=g)=>view.box(x,y,z,w,h,d,c,parent);
  const cyl=(x,y,z,r,h,c=accent,parent=g)=>view.cylinder(x,y,z,r,h,c,parent,8);
  const left=-b.w/2+.7,right=b.w/2-.7,rear=-b.d/2+1.1;
  const seed=[...b.id].reduce((n,c)=>n+c.charCodeAt(0),0);
  const rand=i=>{const v=Math.sin(i*127.1+seed*31.7)*43758.5;return v-Math.floor(v);};
  // Small non-blocking litter collects against a rear wall, clear of the central door.
  const cornerX=-b.w/2+.85,cornerZ=-b.d/2+.85;
  for(let i=0;i<9;i++){
    const scrap=box(cornerX+rand(i+400)*.8,.085+(i%3)*.025,cornerZ+rand(i+500)*.65,.18+rand(i+600)*.4,.025,.09,i%3?dark:floor);
    scrap.rotation.y=rand(i+700)*Math.PI;
  }
  // An abandoned chair, folded onto its broken leg beside the wall rather than in a lane.
  const broken=new THREE.Group();broken.position.set(b.w/2-1.15,.18,-b.d/2+1.3);broken.rotation.set(.18,-.4,.95);g.add(broken);
  box(0,.3,0,.54,.08,.5,floor,broken);
  for(const x of [-.22,.22])box(x,.63,-.2,.065,.65,.065,dark,broken);
  box(0,.85,-.2,.52,.12,.07,dark,broken);
  for(const [x,z] of [[-.2,-.18],[.2,-.18],[-.2,.18]])box(x,.13,z,.06,.3,.06,dark,broken);
  const leg=box(b.w/2-1.5,.095,-b.d/2+2,.08,.07,.38,dark);leg.rotation.y=.75;
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
  const bottle=(x,z,y=.83,c='#637b6d')=>{cyl(x,y+.12,z,.075,.24,c);cyl(x,y+.27,z,.033,.09,c);};
  const papers=(x,z,y=.83)=>{for(let i=0;i<3;i++){const p=box(x+i*.06,y+i*.012,z,.42,.012,.32,'#c4b697');p.rotation.y=i*.13;}};
  const cloth=(x,z,y=.84,c=accent)=>{box(x,y,z,.85,.045,.48,c);for(let i=0;i<3;i++)box(x,y+.026+i*.023,z+i*.025,.76,.023,.4,c);};
  const shelfGoods=(kind)=>{
    for(let i=0;i<7;i++){
      const x=-b.w*.3+i*b.w*.1;
      if(kind==='bottles')bottle(x,rear,.82,i%2?'#77794d':'#566f65');
      else if(kind==='cloth')cloth(x,rear,.84,i%2?accent:'#ab9876');
      else{box(x,.98,rear,.32,.34,.38,i%2?'#b4a184':accent);box(x,.99,rear+.196,.19,.12,.008,'#c8ba9b');}
    }
  };
  const basin=(x,z)=>{cyl(x,.96,z,.25,.12,'#8c9183');cyl(x,1.025,z,.2,.012,'#4f625d');};
  // Keep large accents in rear corners, away from the central door lanes.
  const corner=(kind,side=-1)=>{
    const x=side<0?left+.22:right-.22,z=rear+.2;
    if(kind==='stove'){
      box(x,.45,z,.58,.76,.58,'#555951');cyl(x,1.32,z,.095,1.2,'#62665b');
      box(x,.5,z+.3,.34,.3,.03,'#383e39');cyl(x,.88,z,.32,.08,'#767769');
    }else if(kind==='sacks'){
      for(let i=0;i<3;i++)cyl(x+(i%2)*.36,.24+Math.floor(i/2)*.38,z+(i%2)*.3,.25,.43,'#b1a07a');
    }else if(kind==='wheel'){
      const wheel=new THREE.Mesh(new THREE.TorusGeometry(.47,.065,5,12),view.material(dark));wheel.position.set(x,.53,z);wheel.rotation.y=.25;g.add(wheel);
      for(let i=0;i<4;i++){const spoke=box(x,.53,z,.035,.9,.045);spoke.rotation.z=i*Math.PI/4;}
    }
  };
  if(theme==='bar'){
    rug(0,-.3,2.2,3.7);shelfGoods('bottles');
    box(-1,.87,rear+.02,.65,.08,.46,'#9a805b');
    for(let i=0;i<3;i++)cyl(-1.2+i*.2,.94,rear,.065,.1,'#c4b59a');
  }else if(theme==='provisions'){
    shelfGoods('tins');corner('sacks');papers(.4,rear);rug(.8,.1,1.8,2.5);
  }else if(theme==='office'){
    papers(-1,rear);bottle(1,rear);box(.2,.93,rear,.55,.21,.38,'#555f58');
    rug(0,0,2.3,2);corner('stove');
  }else if(theme==='freight'){
    shelfGoods('tins');corner('wheel');
    for(let i=0;i<6;i++)box(left+.3,.1,rear+2+i*.24,1.15,.035,.09,'#a49372');
    papers(1,rear);
  }else if(theme==='lodging'){
    rug(-1,0,2,3.4);cloth(-1,rear);basin(1,rear);bottle(1.5,rear,.83,'#96856a');
  }else if(theme==='abandoned'){
    for(let i=0;i<9;i++){const p=box(left+rand(i)*1.6,.1,rear+1+rand(i+20)*2,.12,.045,.65+rand(i+40),floor);p.rotation.y=rand(i+60)*3;}
    box(1,.85,rear,.5,.055,.4,accent);bottle(-1,rear,.83,'#756e55');
  }else if(theme==='hearth'){
    corner('stove');rug(.5,.4,2.3,2.4);basin(.7,rear);cloth(-.5,rear,.84,'#8b7967');
  }else if(theme==='workshop'){
    for(let i=0;i<6;i++)box(-3.7+i*.35,1.19,.4,.18,.07,.45,i%2?'#65706a':'#b29a75');
    corner('wheel',1);rug(-2.7,.4,3.6,1.7,'#786e55');
  }else if(theme==='drygoods'){
    shelfGoods('cloth');rug(1,.3,1.65,2.6,'#9a885e');corner('sacks',1);
  }else if(theme==='farm'){
    basin(-1,rear);bottle(-1.6,rear);papers(.1,rear);corner('sacks',1);rug(-.3,.2,2.1,2.4);
    for(let i=0;i<4;i++)cyl(.8+i*.15,.88,rear,.065,.12,'#ad945b');
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
}
