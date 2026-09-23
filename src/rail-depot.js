import * as THREE from 'three';

export const RAIL_TYPES = {
  locomotive: {w:4.2,d:10,health:null,blocksSight:true},
  boxcar: {w:4.4,d:9,health:null,blocksSight:true},
  railBuffer: {w:3.1,d:.7,health:null},
};

export function addRailDepot(map) {
  // The through line exits both world edges; sidings diverge before the platforms.
  // Rehome old wilderness cover now occupied by the freight hall.
  for(const p of map.props) {
    if(p.x===48 && p.z===-57){p.x=32;p.z=-68;}
    if(p.x===58 && p.z===-52){p.x=34;p.z=-43;}
    if(p.x===61 && p.z===-49){p.x=35;p.z=-40;}
  }
  map.railways = [
    [[72,-128],[72,-108],[72,-78],[72,-60],[84,-42],[100,-31],[116,-23]],
    Array.from({length:56},(_,i)=>{const z=-116+i;const t=Math.max(0,Math.min(1,(z+116)/17));return [72+14*t*t*(3-2*t),z];}),
    Array.from({length:34},(_,i)=>{const z=-94+i;const t=Math.max(0,Math.min(1,(z+94)/14));return [86+14*t*t*(3-2*t),z];}),
  ];
  map.sideRoads.push({points:[[1,-55],[20,-57],[37,-64],[60,-64],[62,-68],[63.2,-73],[64,-79],[64.5,-85],[64.8,-91],[64.9,-94],[65.2,-94.7],[66,-95],[66.8,-94.7],[67.1,-94],[67.2,-91],[67.5,-85],[68,-79],[68,-73],[67,-67],[64,-59],[38,-59],[21,-52],[1,-50]]});
  const room=(id,x,z,w,d,color,roofColor,extra={})=>({id,x,z,w,d,color,roofColor,height:3.3,doorWidth:2.8,label:'',...extra});
  map.buildings.push(
    room('rail-station',48,-97,25,23,'#a7967b','#66766d',{doors:['front','right','back'],windows:[{side:'left',offset:3,width:1.7},{side:'right',offset:-6,width:1.5}],interiorStyle:'station',followCamera:true,finish:'boards'}),
    room('rail-freight-hall',49,-47,24,18,'#99806a','#88715e',{doors:['front','back','right'],windows:[{side:'left',offset:-4,width:1.6,boarded:true}],interiorStyle:'railWarehouse',followCamera:true,metalRoof:true,angle:-.035,finish:'vertical'}),
    room('open-car-a',86,-87,4.4,10,'#826e59','#727872',{angle:-.12,height:2.4,doorWidth:2,doors:['front'],windows:[],cargo:true,interiorStyle:'cargo',metalRoof:true,finish:'vertical'}),
    room('open-car-b',100,-79,4.4,10,'#798076','#827563',{angle:.1,height:2.4,doorWidth:2,doors:['front'],windows:[],cargo:true,interiorStyle:'cargo',metalRoof:true,finish:'vertical'}),
    room('open-car-c',94,-111,4.4,9,'#8a7963','#726b59',{angle:.7,height:2.4,doorWidth:2,doors:['back'],windows:[],cargo:true,interiorStyle:'cargo',metalRoof:true,finish:'vertical'}),
    room('open-car-d',100,-39,4.4,9,'#857064','#6b7972',{angle:-.65,height:2.4,doorWidth:2,doors:['left','right'],windows:[],cargo:true,interiorStyle:'cargo',metalRoof:true,finish:'vertical'}),
  );
  map.props.push(
    {type:'locomotive',x:79,z:-51,angle:-.56},
    {type:'boxcar',x:87,z:-41,angle:-.87},
    {type:'boxcar',x:86,z:-68,angle:.18},
    {type:'boxcar',x:100,z:-65.8,angle:-.15},
    {type:'boxcar',x:94.5,z:-89.5,angle:.99},
    {type:'boxcar',x:72,z:-87,angle:0},
    {type:'railBuffer',x:86,z:-61,angle:0}, {type:'railBuffer',x:100,z:-61,angle:0},
    {type:'tower',x:66,z:-107}, {type:'wateringStation',x:65,z:-101,angle:Math.PI/2},
    {type:'loadingPlatform',x:80,z:-75,angle:Math.PI/2},
    {type:'timberStack',x:93,z:-57,angle:.2},
    {type:'repairStation',x:91,z:-47,angle:-.2},
    {type:'freightScreen',x:60,z:-71,angle:.3},
    {type:'stoneBoundary',x:39,z:-77,angle:-.2},
    {type:'brokenWagon',x:28,z:-57,angle:1.1},
    ...[[66,-119],[77,-94],[77,-68],[106,-33]].map(([x,z])=>({type:'telegraph',x,z})),
    ...[[42,-82],[54,-81],[62,-91],[79,-98],[92,-101],[95,-74],[65,-45],[40,-35]].flatMap(([x,z],i)=>[
      {type:'crate',x,z,angle:(i%3-1)*.24}, {type:'barrel',x:x+1.7,z:z-.7,angle:i*.6}]),
    ...[[33,-112],[37,-88],[105,-115],[108,-86],[103,-48],[68,-33]].flatMap(([x,z],i)=>[
      {type:'cactus',x,z,scale:.9+i%2*.3}, {type:'cactus',x:x-1.8,z:z+1.5,scale:.55},
      {type:'deadwood',x:x+2,z:z+2,angle:i*.7}]),
    {type:'deadTree',x:32,z:-98}, {type:'stump',x:34,z:-95},
    {type:'boulder',x:107,z:-54,angle:.7},
  );
  map.targets.push(
    {id:'station-target',x:48,z:-93}, {id:'station-office',kind:'dummy',x:55,z:-105},
    {id:'freight-hall-target',x:49,z:-46}, {id:'freight-hall-dummy',kind:'dummy',x:56,z:-52},
    {id:'rail-platform',kind:'dummy',x:65,z:-91}, {id:'rail-yard',x:92,z:-81},
    {id:'rail-switch',kind:'dummy',x:80,z:-106}, {id:'rail-wreck',x:76,z:-39},
    {id:'cargo-dummy',kind:'dummy',x:100,z:-80},
  );
}

// Union rail and sleeper footprints before extruding: intersections never contain
// duplicate coplanar faces. Small grid cells are below a pixel at normal play zoom.
export function railUnion(rects,cell=.06) {
  const rows=new Map();
  for(const r of rects){
    const c=Math.cos(r.angle),s=Math.sin(r.angle),rx=Math.abs(c*r.w/2)+Math.abs(s*r.d/2),rz=Math.abs(s*r.w/2)+Math.abs(c*r.d/2);
    for(let z=Math.floor((r.z-rz)/cell);z<=Math.ceil((r.z+rz)/cell);z++)for(let x=Math.floor((r.x-rx)/cell);x<=Math.ceil((r.x+rx)/cell);x++){
      const dx=(x+.5)*cell-r.x,dz=(z+.5)*cell-r.z;
      if(Math.abs(dx*c-dz*s)>r.w/2||Math.abs(dx*s+dz*c)>r.d/2)continue;
      if(!rows.has(z))rows.set(z,new Set());rows.get(z).add(x);
    }
  }
  const result=[],active=new Map();
  for(const z of [...rows.keys()].sort((a,b)=>a-b)){
    const xs=[...rows.get(z)].sort((a,b)=>a-b);
    for(let i=0;i<xs.length;){let first=xs[i],last=first;while(++i<xs.length&&xs[i]===last+1)last=xs[i];
      const key=first+':'+last,prev=active.get(key);
      if(prev&&prev.end===z){prev.end=z+1;prev.d+=cell;prev.z+=cell/2;}
      else {const r={x:(first+last+1)*cell/2,z:(z+.5)*cell,w:(last-first+1)*cell,d:cell,end:z+1};result.push(r);active.set(key,r);}
    }
  }
  return result;
}
export function makeRailways(view) {
  const rails=[],ties=[],routes=[];
  for(const line of view.map.railways||[]){
    const curve=new THREE.CatmullRomCurve3(line.map(([x,z])=>new THREE.Vector3(x,0,z)),false,'centripetal');
    const points=curve.getSpacedPoints(Math.ceil(curve.getLength()/.4));
    routes.push(points);
    for(let i=1;i<points.length;i++){
      const a=points[i-1],b=points[i],dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz),nx=dz/len,nz=-dx/len,angle=Math.atan2(dx,dz);
      for(const side of [-1,1])rails.push({x:(a.x+b.x)/2+nx*side*.88,z:(a.z+b.z)/2+nz*side*.88,w:.13,d:len+.025,angle});
    }
  }
  // Common sleeper rows through turnouts: one timber spans nearby branches.
  for(let z=-128;z<0;z+=.8){
    const crossings=[];
    for(const points of routes)for(let i=1;i<points.length;i++){
      const a=points[i-1],b=points[i];if(z<a.z||z>=b.z)continue;
      const t=(z-a.z)/(b.z-a.z);crossings.push({x:a.x+(b.x-a.x)*t,angle:Math.atan2(b.x-a.x,b.z-a.z)});break;
    }
    crossings.sort((a,b)=>a.x-b.x);
    for(let i=0;i<crossings.length;i++){
      const first=crossings[i];let last=first;
      while(i+1<crossings.length&&crossings[i+1].x-last.x<3.3)last=crossings[++i];
      // Ease out of the shared switch timbers instead of snapping the
      // first separate sleeper diagonally across the preceding timber.
      const gap=Math.min(...crossings.filter(v=>v!==first).map(v=>Math.abs(v.x-first.x)));
      const turn=Math.max(0,Math.min(1,(gap-3.3)/2));
      ties.push({x:(first.x+last.x)/2,z,w:last===first?2.55:last.x-first.x+2.7,d:.24,angle:last===first?first.angle*turn:0});
    }
  }
  for(const [rects,cell,y,h,color] of [[ties,.025,.065,.1,'#75624b'],[rails,.02,.15,.13,'#62615a']])
    for(const r of railUnion(rects,cell))view.box(r.x,y,r.z,r.w,h,r.d,color);
}

export function makeRailProp(view,p,g) {
  const box=(x,y,z,w,h,d,c='#756650')=>view.box(x,y,z,w,h,d,c,g);
  const wheel=(x,z,r=.55)=>{
    const m=view.cylinder(x,r,z,r,.18,'#454d49',g,12);m.rotation.z=Math.PI/2;
    const hub=view.cylinder(x*1.01,r,z,.14,.22,'#938879',g,8);hub.rotation.z=Math.PI/2;
  };
  if(p.type==='railBuffer'){
    for(const x of [-1.1,1.1])box(x,.48,0,.23,.96,.65,'#5c6257');
    box(0,.9,0,3.1,.35,.35,'#8a7051');return;
  }
  box(0,.57,0,p.w,.28,p.d,'#4e544e');
  for(const z of [-p.d*.3,p.d*.3])for(const x of [-p.w*.47,p.w*.47])wheel(x,z,p.type==='locomotive'?.72:.48);
  if(p.type==='locomotive'){
    const boiler=view.cylinder(0,1.5,-1.5,1.22,5.8,'#50584f',g,12);boiler.rotation.x=Math.PI/2;
    for(const z of [-3.8,-2,0]){const band=view.cylinder(0,1.5,z,1.25,.12,'#887c64',g,12);band.rotation.x=Math.PI/2;}
    view.cylinder(0,2.85,-3.3,.32,1.5,'#4b5048',g,8);
    view.cylinder(0,3.58,-3.3,.53,.28,'#605e50',g,8);
    box(0,1.35,3,3.5,1.2,3,'#716451');
    for(const x of [-1.65,1.65])for(const z of [1.7,4.2])box(x,2.5,z,.18,1.7,.18,'#6b715f');
    box(0,3.36,3,3.9,.17,3.2,'#667064');
    box(0,2.45,4.2,3.5,1,.15,'#5f6558');
    for(const side of [-1,1]){box(side*2, .78,-.8,.1,.12,5.6,'#ac9973');wheel(side*1.97,-1,.72);}
    for(let i=0;i<7;i++){const slat=box(-1.5+i*.5,.35,-5.15,.15,.15,1.25,'#6b6453');slat.rotation.x=-.3;}
  }else{
    box(0,1.8,0,4.3,2.25,8.9,'#89745c');
    for(const side of [-1,1]){
      for(let z=-4.2;z<=4.2;z+=.55)box(side*2.17,1.85,z,.055,2.2,.035,'#685b49');
      for(const z of [-4.2,-1.4,1.4,4.2])box(side*2.21,1.85,z,.1,2.35,.1,'#575f56');
      box(side*2.24,1.8,0,.1,2.1,2.5,'#7d806c');
      box(side*2.31,1.75,.8,.08,.4,.07,'#3f4944');
    }
    box(0,2.98,0,4.55,.18,9.2,'#6f766c');
    for(let z=-4.3;z<4.5;z+=.65)box(0,3.09,z,4.55,.04,.045,'#8b8b76');
  }
  // Weathered panels and loose boards give the wreck readable age, without text.
  for(let i=0;i<12;i++)box((i%2?1:-1)*p.w*.501,.8+(i%4)*.3,-p.d*.4+(i*.71)% (p.d*.8),.015,.07,.35,'#9a8465');
  const web=[];for(let i=0;i<6;i++)web.push(new THREE.Vector3(-p.w/2,2.5,p.d/2),new THREE.Vector3(-p.w/2+i*.16,1.8+i*.12,p.d/2+.03));
  g.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(web),new THREE.LineBasicMaterial({color:'#c8c0a8',transparent:true,opacity:.38})));
}


