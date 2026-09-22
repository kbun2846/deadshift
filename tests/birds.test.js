import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {Birds,FlightSchedule,SPECIES,FLOCK,CYCLE,BIRD_INTERVAL,BIRD_CLEARANCE,PLAYER_CLEARANCE,VULTURE_CHANCE,CROSS_SECONDS,APPROACH,BIRD_TILT,EXIT_MARGIN,LANE_ATTEMPTS,crossingReach,tailOutline,fingerOutline,closestApproach,pathIsClear,viewSpan,bodyOutline,wingOutline} from '../src/birds.js';
const VIEW={height:29,fov:40,aspect:1.78};

const sequence=values=>{let i=0;return()=>values[i++%values.length];};
const fly=(sim,seconds,dt=1/30)=>{for(let i=0;i<seconds/dt;i++)sim.update(dt,{x:0,z:0},VIEW);return sim;};

test('three regular birds plus a vulture, all sharing one silhouette language',()=>{
 assert.deepEqual(FLOCK,['swift','finch','crow']);
 assert.ok(SPECIES.vulture&&!FLOCK.includes('vulture'));
 for(const name of Object.keys(SPECIES)){
  const spec=SPECIES[name];
  for(const key of ['body','wing','stream','span','chord','length','flap','beat','pace','altitude'])
   assert.ok(spec[key]!==undefined,`${name} is missing ${key}`);
 }
 // Distinct shapes, not one bird at three scales.
 const spans=FLOCK.map(n=>SPECIES[n].span);
 assert.equal(new Set(spans).size,3,'each regular bird needs its own wing plan');
 assert.ok(SPECIES.vulture.span>Math.max(...spans)*1.5,'the vulture should still read as the largest');
});

test('the vulture soars where the small birds beat',()=>{
 for(const name of FLOCK){
  assert.ok(SPECIES[name].flap[0]>SPECIES.vulture.flap[1],`${name} should beat faster than a vulture`);
  assert.ok(SPECIES[name].pace>SPECIES.vulture.pace,`${name} should fly faster`);
 }
 assert.ok(SPECIES.vulture.beat<Math.min(...FLOCK.map(n=>SPECIES[n].beat)),'and hold a flatter wing');
 assert.ok(SPECIES.vulture.fingers>=3,'and splays its tip feathers');
 assert.ok(SPECIES.vulture.span>SPECIES.crow.span*1.5,'on a longer wing');
});

test('one crossing per minute, at a different moment each minute',()=>{
 const offsets=[.1,.9,.5,.25];
 const schedule=new FlightSchedule(BIRD_INTERVAL,sequence(offsets));
 const releases=[];
 for(let t=0,step=.25;t<BIRD_INTERVAL*4;t+=step) if(schedule.update(step)) releases.push(+schedule.time.toFixed(2));
 assert.equal(releases.length,4,'one per minute over four minutes');
 for(const [i,at] of releases.entries()){
  assert.ok(at>=i*BIRD_INTERVAL&&at<(i+1)*BIRD_INTERVAL,`release ${i} fell outside its minute`);
 }
 // The moment moves around inside the minute rather than sitting on it.
 const within=releases.map((at,i)=>at-i*BIRD_INTERVAL);
 assert.ok(new Set(within.map(v=>Math.round(v))).size>1,'timing should not be a metronome');
});

test('closest approach is measured over the window both are still flying',()=>{
 const head={x:-10,y:12,z:0,vx:5,vy:0,vz:0,life:4};
 const on={x:10,y:12,z:0,vx:-5,vy:0,vz:0,life:4};
 assert.ok(closestApproach(head,on)<1e-6,'a head-on pair must register as colliding');
 const above={...on,y:12+BIRD_CLEARANCE+1};
 assert.ok(closestApproach(head,above)>BIRD_CLEARANCE,'separated by height is clear');
 const late={...on,life:0};
 assert.equal(closestApproach(head,late),Infinity,'a bird already gone cannot conflict');
 const parallel={x:-10,y:12,z:30,vx:5,vy:0,vz:0,life:4};
 assert.ok(closestApproach(head,parallel)>=30-1e-9,'parallel tracks keep their separation');
});

test('a path that would bring two birds close is refused outright',()=>{
 const flying=[{x:0,y:12,z:0,vx:6,vy:0,vz:0,life:8}];
 const crossing={x:24,y:12,z:0,vx:-6,vy:0,vz:0,life:8};
 assert.equal(pathIsClear(crossing,flying),false);
 assert.equal(pathIsClear({...crossing,y:12+BIRD_CLEARANCE+2},flying),true);
 assert.equal(pathIsClear(crossing,[]),true,'an empty sky is always clear');
});

test('birds never share the sky within the clearance, over a long run',()=>{
 const scene=new THREE.Scene();
 // A tight interval forces overlap the scheduler would not normally produce.
 const birds=new Birds(scene);
 birds.schedule=new FlightSchedule(1.5,Math.random);
 fly(birds,600);
 // The interval here is forced far tighter than the game's, so the point is
 // the separation invariant, not the population.
 assert.ok(birds.flights.length<=14,'the sky should stay bounded');
 for(const a of birds.flights)for(const b of birds.flights){
  if(a===b)continue;
  const gap=Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
  assert.ok(gap>=BIRD_CLEARANCE-1e-6,`two birds were ${gap.toFixed(2)}m apart`);
 }
});

test('a crossing actually passes the camera and then leaves',()=>{
 const scene=new THREE.Scene(),birds=new Birds(scene);
 const flight=birds.spawnNext({x:0,z:0},VIEW);
 const start=Math.hypot(flight.x,flight.z);
 assert.ok(start>=viewSpan(VIEW,flight.y)*APPROACH-1e-6,'it should enter from outside the view');
 assert.ok(flight.y>=7&&flight.y<=14,`altitude ${flight.y} should clear the rooftops`);
 const group=flight.group;
 assert.ok(scene.children.includes(group),'it should be in the scene while flying');
 fly(birds,flight.life+2);
 assert.ok(birds.flights.every(f=>f!==flight),'and leave when it is done');
 assert.equal(group.parent,null,'its group must be removed from the scene, not just forgotten');
});

test('wings beat and the bird faces its heading',()=>{
 const scene=new THREE.Scene(),birds=new Birds(scene);
 birds.schedule=new FlightSchedule(1,Math.random);
 birds.update(1.1,{x:0,z:0},VIEW);
 const flight=birds.flights[0];
 assert.equal(flight.wings.length,2,'one pivot per wing');
 const angles=new Set();
 for(let i=0;i<40;i++){birds.update(1/30,{x:0,z:0},VIEW);angles.add(+flight.wings[0].scale.x.toFixed(4));}
 assert.ok(angles.size>4,'the wing should be moving, not held');
 // Seen from above a beat is the span foreshortening, mirrored either side.
 assert.ok(Math.abs(flight.wings[0].scale.x+flight.wings[1].scale.x)<1e-9,
  `wings at ${flight.wings[0].scale.x} and ${flight.wings[1].scale.x} are not mirrored`);
 assert.ok(Math.abs(flight.wings[1].scale.x)<=1+1e-9,'a beat shortens the span, never lengthens it');
 const heading=Math.atan2(flight.vx,flight.vz)+Math.PI;
 assert.ok(Math.abs(flight.group.rotation.y-heading)<1e-9,'and it should face where it is going');
});

test('birds are decoration: no shadows, and none at all on Potato',()=>{
 const scene=new THREE.Scene(),birds=new Birds(scene);
 birds.schedule=new FlightSchedule(1,Math.random);
 birds.update(1.1,{x:0,z:0},VIEW);
 birds.flights[0].group.traverse(o=>{if(o.isMesh)assert.equal(o.castShadow,false);});
 birds.setQuality('potato');
 assert.equal(birds.flights.length,0,'Potato empties the sky');
 fly(birds,300);
 assert.equal(birds.flights.length,0,'and never refills it');
 birds.setQuality('balanced');
 fly(birds,BIRD_INTERVAL*1.2);
 assert.ok(birds.flights.length>0,'other presets fly again');
});

test('a roof hides the sky without emptying it',()=>{
 const scene=new THREE.Scene(),birds=new Birds(scene);
 birds.schedule=new FlightSchedule(1,Math.random);
 birds.update(1.1,{x:0,z:0},VIEW);
 const flight=birds.flights[0];
 birds.update(1/30,{x:0,z:0},VIEW,true);
 assert.equal(flight.group.visible,false,'a roof hides it');
 // Hidden, not despawned: it is still airborne and still advancing.
 assert.ok(birds.flights.includes(flight),'the bird keeps flying while out of sight');
 const before=flight.x;
 birds.update(1/30,{x:0,z:0},VIEW,true);
 assert.notEqual(flight.x,before,'and keeps covering ground');
 birds.update(1/30,{x:0,z:0},VIEW,false);
 assert.equal(flight.group.visible,true);
});

test('vultures are the occasional one, not the usual one',()=>{
 const scene=new THREE.Scene(),birds=new Birds(scene);
 birds.schedule=new FlightSchedule(1.2,Math.random);
 const seen={};
 for(let i=0;i<4000;i++){birds.update(1/30,{x:0,z:i*40},VIEW);for(const f of birds.flights)seen[f.name]=(seen[f.name]||0)+0;}
 // Count species over many spawns by sampling the spawn function directly.
 const counts={};
 for(let i=0;i<3000;i++){
  const fresh=new Birds(new THREE.Scene());
  fresh.schedule=new FlightSchedule(1,Math.random);
  fresh.update(1.1,{x:0,z:0},VIEW);
  const name=fresh.flights[0]?.name;
  if(name)counts[name]=(counts[name]||0)+1;
 }
 const total=Object.values(counts).reduce((a,b)=>a+b,0);
 assert.ok(counts.vulture/total<VULTURE_CHANCE*1.4&&counts.vulture/total>VULTURE_CHANCE*.6,
  `vultures were ${(counts.vulture/total*100).toFixed(1)}% of crossings`);
 for(const name of FLOCK)assert.ok(counts[name]>0,`${name} should appear`);
});

test('a crossing is unhurried, and takes the same time at any height',()=>{
 for(const name of CYCLE){
  const birds=new Birds(new THREE.Scene());
  for(let i=0;i<40;i++){
   const flight=birds.spawnNext({x:0,z:0},VIEW);
   // Clear between attempts: a crowded sky nudges altitude, which would break
   // the very relationship being measured.
   birds.clear();
   if(flight.name!==name)continue;
   const speed=Math.hypot(flight.vx,flight.vz);
   const visible=viewSpan(VIEW,flight.y)/speed;
   assert.ok(visible>CROSS_SECONDS*.8&&visible<CROSS_SECONDS*1.4,`${name} crossed in ${visible.toFixed(2)}s`);
   // Slow enough to follow: nothing streaks past.
   assert.ok(speed<20,`${name} flew at ${speed.toFixed(1)}m/s`);
   break;
  }
 }
});

test('crossings run level and rake shallowly, never climbing and never steep',()=>{
 const birds=new Birds(new THREE.Scene());
 const headings=new Set();let raked=0;
 for(let i=0;i<200;i++){
  const flight=birds.spawnNext({x:0,z:0},VIEW);
  headings.add(flight.vx>0?'E':'W');
  assert.equal(flight.vy,0,'no climb or dive: altitude is held for the whole crossing');
  const rake=Math.abs(Math.atan2(flight.vz,Math.abs(flight.vx)));
  assert.ok(rake<=BIRD_TILT+1e-9,`a crossing raked ${rake.toFixed(2)}rad across the screen`);
  if(rake>.04)raked++;
  birds.clear();
 }
 assert.deepEqual([...headings].sort(),['E','W'],'both directions should occur');
 assert.ok(raked>150,`only ${raked} of 200 crossings were angled at all`);
});

test('no path is ever laid across the player',()=>{
 const birds=new Birds(new THREE.Scene());
 for(let i=0;i<400;i++){
  const flight=birds.spawnNext({x:0,z:0},VIEW);
  // Angled crossings no longer hold their z, so the clearance is measured
  // where it matters: the perpendicular distance from the path to the player.
  const speed=Math.hypot(flight.vx,flight.vz);
  const miss=Math.abs(flight.x*flight.vz-flight.z*flight.vx)/speed;
  assert.ok(miss>=PLAYER_CLEARANCE-1e-9,
   `a bird passed ${miss.toFixed(2)}m from the player`);
  birds.clear();
 }
});

test('the solid build is low poly and carries a beak and eyes',()=>{
 const birds=new Birds(new THREE.Scene());birds.setQuality('balanced');
 for(const name of CYCLE){
  const flight=birds.spawnNext({x:0,z:0},VIEW);
  let meshes=0,triangles=0,thickness=0;
  flight.group.traverse(object=>{
   if(!object.isMesh)return;
   meshes++;
   const geometry=object.geometry;
   triangles+=geometry.index?geometry.index.count/3:geometry.attributes.position.count/3;
   geometry.computeBoundingBox();
   thickness=Math.max(thickness,geometry.boundingBox.max.y-geometry.boundingBox.min.y);
  });
  assert.ok(thickness>0,`${name} should have depth on the solid build`);
  assert.ok(triangles<400,`${name} is ${triangles} triangles, too heavy for decoration`);
  assert.ok(meshes<=18,`${name} uses ${meshes} meshes`);
  assert.ok(SPECIES[name].eye,`${name} needs an eye colour`);
  birds.clear();
 }
});

test('the flat build is what Performance flies',()=>{
 const birds=new Birds(new THREE.Scene());
 birds.setQuality('performance');
 const flat=birds.spawnNext({x:0,z:0},VIEW);
 let flatDepth=0;
 flat.group.traverse(o=>{if(o.isMesh){o.geometry.computeBoundingBox();flatDepth=Math.max(flatDepth,o.geometry.boundingBox.max.y-o.geometry.boundingBox.min.y);}});
 assert.ok(flatDepth<1e-9,'Performance should keep the flat silhouettes');
 birds.setQuality('quality');
 assert.equal(birds.flights.length,0,'switching build clears anything mid-flight');
});

test('the vulture was brought down in size',()=>{
 assert.ok(SPECIES.vulture.span<1.2,`vulture span ${SPECIES.vulture.span} is still large`);
 assert.ok(SPECIES.vulture.scale[1]<=1.3,'and its scale range should be modest');
 assert.ok(SPECIES.vulture.span>SPECIES.crow.span,'but still the biggest of them');
});

test('birds fly at a spread of heights, not one ceiling',()=>{
 const birds=new Birds(new THREE.Scene());
 const heights=new Set();
 for(let i=0;i<120;i++){heights.add(Math.round(birds.spawnNext({x:0,z:0},VIEW).y));birds.clear();}
 assert.ok(heights.size>=4,`only saw ${heights.size} distinct altitudes`);
});

test('the Performance build is flat: no part stands off the plane it is drawn on',()=>{
 const birds=new Birds(new THREE.Scene());birds.setQuality('performance');
 for(const name of CYCLE){
  const flight=birds.spawn(name,{x:0,z:0},VIEW)||birds.spawnNext({x:0,z:0},VIEW);
  flight.group.traverse(object=>{
   if(!object.isMesh)return;
   object.geometry.computeBoundingBox();
   const box=object.geometry.boundingBox;
   assert.ok(box.max.y-box.min.y<1e-9,`${name} has a part with thickness`);
  });
  birds.clear();
 }
});

test('each flat bird trails one soft slipstream behind it',()=>{
 const birds=new Birds(new THREE.Scene());birds.setQuality('performance');
 const flight=birds.spawnNext({x:0,z:0},VIEW);
 const faint=[];
 flight.group.traverse(o=>{if(o.isMesh&&o.material.opacity<.5)faint.push(o);});
 assert.equal(faint.length,1,'exactly one, and it should be subtle');
 assert.ok(faint[0].material.opacity<.2,`stream at ${faint[0].material.opacity} is too strong`);
});

test('the dev spawn cycles through every shape in turn',()=>{
 const birds=new Birds(new THREE.Scene());
 const order=[];
 for(let i=0;i<CYCLE.length*2;i++){order.push(birds.spawnNext({x:0,z:0},VIEW).name);birds.clear();}
 assert.deepEqual(order,[...CYCLE,...CYCLE],'it should walk the list and wrap');
});

test('a deliberate spawn is never refused, only moved clear',()=>{
 const birds=new Birds(new THREE.Scene());
 for(let i=0;i<6;i++)assert.ok(birds.spawnNext({x:0,z:0},VIEW),'dev spawns must always appear');
 for(const a of birds.flights)for(const b of birds.flights){
  if(a===b)continue;
  assert.ok(Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z)>=BIRD_CLEARANCE-1e-6,'and still keep their distance');
 }
});

test('a wing beat reports itself once per beat, and not while hidden',()=>{
 const birds=new Birds(new THREE.Scene());
 const beats=[];
 birds.onFlap=flight=>beats.push(flight.name);
 const flight=birds.spawnNext({x:0,z:0},VIEW);
 const seconds=1;
 // Heard from underneath it: a crossing now starts far off the map, and only
 // the part of it that passes overhead is audible.
 const under=()=>({x:flight.x,z:flight.z});
 for(let i=0;i<seconds*120;i++)birds.update(1/120,under(),VIEW);
 assert.ok(Math.abs(beats.length-flight.flap*seconds)<=1.5,
  `${beats.length} beats reported against a rate of ${flight.flap.toFixed(2)}/s`);
 const quiet=beats.length;
 for(let i=0;i<seconds*120;i++)birds.update(1/120,under(),VIEW,true);
 assert.equal(beats.length,quiet,'a bird behind a roof makes no sound');
});

test('a bird out past the edge of the map is not heard from the middle of it',()=>{
 const birds=new Birds(new THREE.Scene());
 let beats=0;birds.onFlap=()=>beats++;
 const view={...VIEW,extent:124};
 const flight=birds.spawn('crow',{x:0,z:0},view);
 assert.ok(Math.hypot(flight.x,flight.z)>124,'a scheduled crossing should start off the map');
 for(let i=0;i<120;i++)birds.update(1/120,{x:0,z:0},view);
 assert.equal(beats,0,'wingbeats carried across the whole map');
});

test('every bird flies nose first, with its wake behind it',()=>{
 // The outlines are authored in shape space and laid flat, which is exactly
 // where a sign error turns the whole flock around.
 const birds=new Birds(new THREE.Scene());birds.setQuality('performance');
 for(const name of CYCLE){
  const flight=birds.spawnNext({x:0,z:0},VIEW);
  birds.update(1/60,{x:0,z:0},VIEW);
  const group=flight.group;group.updateMatrixWorld(true);
  const body=group.children[0],position=body.geometry.attributes.position;
  let front=null,back=null;
  for(let i=0;i<position.count;i++){
   const vertex=new THREE.Vector3().fromBufferAttribute(position,i);
   if(!front||vertex.z<front.z)front=vertex.clone();
   if(!back||vertex.z>back.z)back=vertex.clone();
  }
  const heading=new THREE.Vector3(flight.vx,0,flight.vz).normalize();
  const nose=new THREE.Vector3()
   .subVectors(front.clone().applyMatrix4(group.matrixWorld),back.clone().applyMatrix4(group.matrixWorld))
   .setY(0).normalize();
  assert.ok(heading.dot(nose)>.9,`${name} is flying tail first (dot ${heading.dot(nose).toFixed(3)})`);
  // And the slipstream trails rather than leading.
  const stream=group.children.at(-1);
  stream.geometry.computeBoundingBox();
  assert.ok(stream.geometry.boundingBox.min.z>=-1e-6,`${name}'s wake is in front of it`);
  birds.clear();
 }
});

test('birds read large and calm rather than small and busy',()=>{
 for(const name of CYCLE){
  const spec=SPECIES[name];
  assert.ok(spec.span>=.3,`${name} should be big enough to see`);
  assert.ok(spec.flap[1]<=4,`${name} beats too fast to be restful`);
  assert.ok(spec.beat<=.6,`${name}'s stroke is too deep`);
 }
 // Outlines stay simple: a handful of points, not a traced feather.
 assert.ok(bodyOutline(SPECIES.crow).getPoints(1).length<=14,'body outline should stay simple');
 assert.ok(wingOutline(SPECIES.crow).getPoints(1).length<=10,'wing outline should stay simple');
});

test('plumage is light enough to read against dark ground',()=>{
 const luminance=hex=>{const [r,g,b]=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));return (r*.2126+g*.7152+b*.0722)/255;};
 for(const name of CYCLE){
  assert.ok(luminance(SPECIES[name].body)>.5,`${name} body ${SPECIES[name].body} is too dark`);
  assert.ok(luminance(SPECIES[name].wing)>.4,`${name} wing ${SPECIES[name].wing} is too dark`);
  // Not so bright it pulls the eye off the game either.
  assert.ok(luminance(SPECIES[name].body)<.85,`${name} body is too bright`);
 }
});

test('only the vulture carries extra anatomy',()=>{
 const birds=new Birds(new THREE.Scene());birds.setQuality('performance');
 const parts={};
 for(const name of CYCLE){
  const flight=birds.spawnNext({x:0,z:0},VIEW);
  let count=0;flight.group.traverse(object=>{if(object.isMesh)count++;});
  parts[flight.name]=count;
  birds.clear();
 }
 for(const name of FLOCK)assert.ok(parts[name]<=5,`${name} should stay a plain silhouette, had ${parts[name]} parts`);
 assert.ok(parts.vulture>=parts.crow*2,'the vulture should be the detailed one');
 // Bare head, neck and beak: the things that say vulture rather than big bird.
 for(const key of ['skin','ruff','beak'])assert.ok(SPECIES.vulture[key],`the vulture needs a ${key} tone`);
 for(const name of FLOCK)assert.ok(!SPECIES[name].skin,`${name} should have no bare skin`);
});

test('a beating wing stays on its own side of the bird, in both builds',()=>{
 const view={height:29,fov:40,aspect:1.6},focus={x:0,z:0};
 for(const quality of ['balanced','performance']){
  for(const name of CYCLE){
   const scene=new THREE.Scene(),birds=new Birds(scene);
   birds.setQuality(quality);
   const flight=birds.spawnNext(focus,view);
   // Part way through a beat, where the stroke is actually driving scale.
   for(let i=0;i<12;i++)birds.update(1/60,focus,view);
   flight.group.updateMatrixWorld(true);
   const sides=flight.wings.map(pivot=>{
    const point=new THREE.Vector3();
    pivot.children[0].getWorldPosition(point);
    return flight.group.worldToLocal(point).x;
   });
   assert.equal(sides.length,2,`${quality} ${name} should have two wings`);
   assert.ok(sides[0]<0,`${quality} ${name} left wing sits at ${sides[0]}, not to the left`);
   assert.ok(sides[1]>0,`${quality} ${name} right wing sits at ${sides[1]}, not to the right`);
   // Mirrored, so the span reads the same either side.
   assert.ok(Math.abs(sides[0]+sides[1])<1e-6,`${quality} ${name} wings are not mirrored`);
  }
 }
});

test('the sky flows both ways: crossings alternate rather than repeat',()=>{
 const view={height:29,fov:40,aspect:1.6},focus={x:0,z:0};
 const birds=new Birds(new THREE.Scene());
 birds.setQuality('balanced');
 const headings=[];
 for(let i=0;i<12;i++){headings.push(Math.sign(birds.spawnNext(focus,view).vx));birds.clear();}
 assert.ok(headings.every(h=>h!==0),'every crossing travels sideways');
 for(let i=1;i<headings.length;i++)assert.notEqual(headings[i],headings[i-1],'two crossings in a row went the same way');
});

test('a bird summoned from the dev tools is on screen within a second',()=>{
 const view={height:29,fov:40,aspect:1.6,extent:124};
 const birds=new Birds(new THREE.Scene());
 birds.setQuality('balanced');
 for(const name of CYCLE){
  const flight=birds.spawnNext({x:0,z:0},view);
  const span=viewSpan(view,flight.y);
  const start=Math.hypot(flight.x,flight.z);
  assert.ok(start<span,`${name} was summoned ${start.toFixed(0)}m away, past a ${span.toFixed(0)}m view`);
  // And it still leaves the world rather than stopping in mid-air.
  const endX=flight.x+flight.vx*flight.life,endZ=flight.z+flight.vz*flight.life;
  assert.ok(Math.hypot(endX,endZ)>view.extent,`${name} gave up inside the map`);
  birds.clear();
 }
});

test('switching graphics preset does not strand bird geometry on the GPU',()=>{
 const view={height:29,fov:40,aspect:1.6,extent:124};
 const scene=new THREE.Scene(),birds=new Birds(scene);
 const disposed=new Set();
 const track=template=>template.group.traverse(o=>{
  if(o.geometry&&!o.geometry.__tracked){o.geometry.__tracked=true;o.geometry.addEventListener('dispose',()=>disposed.add(o.geometry));}
 });
 // Build both sets, then flip between them repeatedly.
 for(const quality of ['balanced','performance','balanced','performance','balanced']){
  birds.setQuality(quality);
  for(const name of CYCLE){birds.spawnNext({x:0,z:0},view);}
  for(const template of birds.templates.values())track(template);
  birds.clear();
 }
 // Both builds are cached, and nothing was thrown away undisposed.
 const keys=[...birds.templates.keys()];
 assert.equal(keys.filter(k=>k.startsWith('solid:')).length,CYCLE.length,'the solid set should stay resident');
 assert.equal(keys.filter(k=>k.startsWith('flat:')).length,CYCLE.length,'the flat set should stay resident');
 let live=0;
 for(const template of birds.templates.values())template.group.traverse(o=>{if(o.geometry)live++;});
 assert.ok(live>0);
 assert.equal(disposed.size,0,'no geometry should be disposed while the cache still holds it');
 // And teardown actually frees them.
 birds.dispose();
 assert.equal(birds.templates.size,0);
 assert.equal(disposed.size,live,`disposed ${disposed.size} of ${live} geometries on teardown`);
});

test('the tail and finger outlines are closed, sized and forked per species',()=>{
 for(const name of CYCLE){
  const spec=SPECIES[name];
  const tail=tailOutline(spec).getPoints(1);
  assert.ok(tail.length>=4,`${name} tail has too few points`);
  assert.ok(tail.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)),`${name} tail is not finite`);
  // Rooted inside the body and opening aft, so there is never a gap behind it.
  const root=Math.min(...tail.map(p=>p.y)),tip=Math.max(...tail.map(p=>p.y));
  assert.ok(root<spec.length*.31,`${name} tail starts outside the shell`);
  assert.ok(tip>root,`${name} tail does not extend aft`);
  const half=Math.max(...tail.map(p=>Math.abs(p.x)));
  assert.ok(half>spec.chord*.2&&half<spec.chord,`${name} tail spans ${half}`);
  // A forked tail notches back toward the root; a fanned one does not.
  const notch=tail.filter(p=>Math.abs(p.x)<half*.5&&p.y<tip-1e-6).length;
  if(spec.fork)assert.ok(notch>=2,`${name} should have a forked tail`);
  const finger=fingerOutline(spec).getPoints(1);
  assert.ok(finger.every(p=>p.x>=-1e-9),`${name} fingers must reach along +x only`);
  assert.ok(Math.max(...finger.map(p=>p.x))<spec.span*.4,`${name} fingers reach too far`);
 }
});

test('a crossing reaches past the map when one is known, and far past the view otherwise',()=>{
 const span=22;
 assert.ok(crossingReach({height:29,fov:40,aspect:1.6,extent:124},span)>=124+EXIT_MARGIN);
 assert.ok(crossingReach({height:29,fov:40,aspect:1.6},span)>span*1.6);
 assert.ok(crossingReach(undefined,span)>span*APPROACH);
 assert.ok(LANE_ATTEMPTS>=3,'a blocked lane must get real retries, or crossings go missing');
});
