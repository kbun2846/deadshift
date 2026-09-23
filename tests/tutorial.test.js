import test from 'node:test';
import assert from 'node:assert/strict';
import {Tutorial,tutorialMap,tutorialMapFor,COURSES,TUTORIAL_ZONES,TUTORIAL_CRATES,LESSON_PAUSE,lessonMarkup} from '../src/tutorial.js';
import {RIFLE} from '../src/config/gameplay.js';
import {Simulation} from '../src/simulation.js';

const STEP=1/60;
const idle=(tutorial,sim,seconds)=>{for(let t=0;t<seconds;t+=STEP){sim.step({});tutorial.update(sim,STEP);}};

test('Ballast tutorial targets and dummies have 400 health including respawns without changing other tutorials',()=>{
 const sim=new Simulation(tutorialMapFor('shotgun'));
 assert.ok(sim.targets.every(t=>t.hp===400&&t.maxHp===400));
 for(const target of sim.targets)sim.hit(target,{damage:500,volley:1});
 for(let i=0;i<280;i++)sim.step({});
 assert.ok(sim.targets.every(t=>t.hp===400));
 sim.reset();assert.ok(sim.targets.every(t=>t.hp===400));
 for(const weapon of ['static','rifle'])assert.deepEqual(new Simulation(tutorialMapFor(weapon)).targets.map(t=>t.hp),[100,75,100,75,100]);
});

test('the range is enclosed and clear: five targets in a row and a few breakable crates',()=>{
 assert.equal(tutorialMap.buildings.length,0);assert.equal(tutorialMap.fences.length,4);
 assert.equal(new Set(tutorialMap.targets.map(t=>t.z)).size,1);
 assert.ok(tutorialMap.props.length>=2&&tutorialMap.props.length<=4,'not too many crates');
 assert.ok(tutorialMap.props.every(p=>p.type==='crate'&&p.broken===false));
 const sim=new Simulation(tutorialMap);
 for(const crate of TUTORIAL_CRATES){
  assert.ok(Math.abs(crate.z-(-5))>6,'crates stay out of the firing line');
  for(const zone of TUTORIAL_ZONES)assert.ok(Math.hypot(crate.x-zone.x,crate.z-zone.z)>2.5,'zones clear of crates');
  assert.ok(sim.colliders.some(c=>c.propId===crate.id));
 }
});

test('lessons start on their own and move on on their own: no begin or continue',()=>{
 const sim=new Simulation(tutorialMap),t=new Tutorial('basics');
 assert.equal(t.lesson.id,'walk');
 for(const zone of TUTORIAL_ZONES){
  assert.deepEqual({x:t.zone.x,z:t.zone.z},zone,'one pink zone at a time, in order');
  sim.player.x=zone.x;sim.player.z=zone.z;t.update(sim,STEP);
 }
 assert.ok(t.ready&&t.celebrating,'finished lesson shows as done');
 assert.equal(t.zone,null);assert.equal(t.pointer(sim),null,'no arrow while it is ticked off');
 idle(t,sim,LESSON_PAUSE+.05);
 assert.equal(t.lesson.id,'dash');assert.equal(t.count,0);
});

test('the arrow points at the zone, then at the nearest standing crate',()=>{
 const sim=new Simulation(tutorialMap),t=new Tutorial('basics');
 assert.deepEqual(t.pointer(sim),t.zone);
 t.index=1;
 sim.player.x=9;sim.player.z=8.5;
 assert.equal(t.pointer(sim).id,'tutorial-crate-1');
 sim.hitProp(sim.props.find(p=>p.id==='tutorial-crate-1'),{damage:99,x:0,z:0});
 assert.notEqual(t.pointer(sim).id,'tutorial-crate-1','a smashed crate is skipped');
});

test('dashing through crates counts, shooting them does not, and they come back',()=>{
 const sim=new Simulation(tutorialMap),t=new Tutorial('basics');t.index=1;
 const crate=sim.props.find(p=>p.id==='tutorial-crate-0');
 sim.player.x=crate.x+2;sim.player.z=crate.z;sim.player.stamina=2;
 sim.step({moveX:-1,moveZ:0,dodge:true});
 for(let i=0;i<30;i++)sim.step({moveX:-1,moveZ:0});
 const events=sim.drainEvents();
 const broke=events.find(e=>e.type==='propBreak');
 assert.ok(broke&&broke.dashed,'the dash smashed the crate');
 for(const e of events)t.event(e,sim);
 assert.equal(t.count,1);
 const other=sim.props.find(p=>p.id==='tutorial-crate-1');
 sim.hitProp(other,{damage:99,x:0,z:0});
 for(const e of sim.drainEvents())t.event(e,sim);
 assert.equal(t.count,1,'a shot crate is not a dash');
 sim.player.x=0;sim.player.z=6;
 idle(t,sim,3);
 assert.ok(crate.hp>0&&other.hp>0,'both crates respawned');
 assert.ok(sim.colliders.some(c=>c.propId===crate.id),'and are solid again');
});

test('a crate never respawns on top of the player',()=>{
 const sim=new Simulation(tutorialMap),t=new Tutorial('basics');
 const crate=sim.props[0];sim.hitProp(crate,{damage:99,x:0,z:0});
 sim.player.x=crate.x;sim.player.z=crate.z;
 for(let i=0;i<300;i++)t.update(sim,STEP);
 assert.equal(crate.hp,0);
 sim.player.x=0;sim.player.z=6;t.update(sim,STEP);
 assert.ok(crate.hp>0);
});

test('basics then map finishes the course; weapon courses teach only their weapon',()=>{
 const sim=new Simulation(tutorialMap),t=new Tutorial('basics');t.index=COURSES.basics.findIndex(l=>l.id==='shoot');
 for(let i=0;i<5;i++)t.event({type:'hit',volley:1},sim);
 assert.equal(t.count,1,'one shot counts once');
 t.event({type:'hit',volley:2},sim);t.event({type:'kill',volley:3},sim);
 idle(t,sim,LESSON_PAUSE+.05);
 assert.equal(t.lesson.id,'nomouse');
 t.event({type:'hit',volley:9},sim);assert.equal(t.count,0,'a mouse shot is not a keyboard shot');
 for(let i=0;i<3;i++)t.event({type:'keyboardShot'},sim);idle(t,sim,LESSON_PAUSE+.05);
 t.event({type:'mapOpened'},sim);idle(t,sim,LESSON_PAUSE+.05);
 assert.ok(t.complete);
 for(const course of ['static','rifle','shotgun']){
  const ids=COURSES[course].map(l=>l.id);
  assert.ok(!ids.some(id=>['walk','dash','map'].includes(id)),`${course} leaves the basics to basics`);
  assert.equal(new Tutorial(course).weapon,course);
 }
 assert.equal(new Tutorial('basics').weapon,'static');
 assert.equal(new Tutorial('nonsense').course,'basics');
});

test('Nominal course: taps, held fire, aimed hits, reloads, grenades and the big mag',()=>{
 const sim={spray:{active:false}},t=new Tutorial('rifle');
 const events=[{type:'rifleShot',burstIndex:1},{type:'rifleShot',burstIndex:2},{type:'rifleHit',aimed:true},{type:'rifleReloaded'},{type:'grenadeExplosion'},{type:'rifleReloaded',extended:true}];
 const wrong=[{type:'rifleShot',burstIndex:2},{type:'rifleHit',aimed:true},{type:'rifleHit',aimed:false},{type:'rifleReloaded',extended:true},{type:'dodge'},{type:'rifleReloaded'}];
 for(const [i,event] of events.entries()){
  t.event(wrong[i],sim);assert.equal(t.count,0,`${t.lesson.id} ignores the wrong action`);
  for(let n=0;n<t.goal;n++)t.event({...event,id:n},sim);
  assert.ok(t.ready);t.advance();
 }
 assert.ok(t.complete);
});

test('Static and Ballast courses credit their own actions',()=>{
 const sim={spray:{active:false}},s=new Tutorial('static');
 assert.equal(s.goal,24,'two full loads of orbs');
 for(let i=0;i<24;i++)s.event({type:'seed'},sim);s.advance();
 for(let i=0;i<3;i++)s.event({type:'hit',volley:i},sim);s.advance();
 sim.spray.active=true;for(let i=0;i<3;i++)s.event({type:'hit',volley:10+i},sim);s.advance();
 for(let i=0;i<3;i++)s.event({type:'hexPulse'},sim);s.advance();
 assert.ok(s.complete);
 const b=new Tutorial('shotgun');
 for(const e of [{type:'shotgunShot',charge:.2},{type:'shotgunShot',charge:1},{type:'shotgunStored'},{type:'shotgunDouble'},{type:'shotgunReloaded'}]){
  for(let n=0;n<b.goal;n++)b.event({...e,id:n},sim);assert.ok(b.ready,b.lesson.id);b.advance();
 }
 assert.ok(b.complete);
});

test('copy is lowercase and plain, with key names as capital keycaps',()=>{
 for(const [course,lessons] of Object.entries(COURSES))for(const l of lessons)for(const text of [l.title,l.keys,l.touch,l.note,l.touchNote].filter(Boolean)){
  const words=text.replace(/\[[^\]]+\]/g,'');
  assert.equal(words,words.toLowerCase(),`${course}/${l.id}: "${text}"`);
  assert.ok(!/[!;:.]/.test(words),`${course}/${l.id} keeps punctuation minimal: "${text}"`);
 }
 assert.equal(lessonMarkup('hold [W] [A] and <go>'),'hold <kbd>W</kbd> <kbd>A</kbd> and &lt;go&gt;');
 assert.ok(COURSES.basics[0].keys.includes('[W] [A] [S] [D]'));
});

test('two full loads: two Nominal magazines and 4 Ballast shells',()=>{
 const sim={spray:{active:false}},r=new Tutorial("rifle"),M=RIFLE.magazine;
 r.index=COURSES.rifle.findIndex(l=>l.id==='auto');
 for(let i=0;i<M*2-1;i++)r.event({type:'rifleShot',burstIndex:i%M+1,id:i},sim);
 assert.ok(!r.ready);r.event({type:'rifleShot',burstIndex:M,id:M*2-1},sim);assert.ok(r.ready);
 assert.equal(COURSES.shotgun[0].goal,4);
});

test('the no-mouse lesson is skipped on a touchscreen',()=>{
 const sim=new Simulation(tutorialMap),t=new Tutorial('basics');
 t.index=COURSES.basics.findIndex(l=>l.id==='nomouse');t.touch=true;t.update(sim,STEP);
 assert.equal(t.lesson.id,'map');
});

test('left-click prompts name Q too wherever Q does the same',()=>{
 for(const course of ['basics','static','rifle','shotgun'])for(const l of COURSES[course])
  if(/lmb/i.test(l.keys))assert.ok(l.keys.includes('[LMB] / [Q]'),`${course}/${l.id}`);
 assert.ok(!JSON.stringify(COURSES).includes('left click'),'no spelled-out clicks left');
});

test('touch players learn to aim with the right thumb while walking; keyboard players skip it',()=>{
 const sim=new Simulation(tutorialMap),t=new Tutorial('basics');
 t.index=COURSES.basics.findIndex(l=>l.id==='aimhold');t.touch=true;
 t.touchAiming=true;t.walking=false;for(let i=0;i<120;i++)t.update(sim,STEP);
 assert.equal(t.count,0,'aiming alone is not the lesson');
 t.walking=true;for(let i=0;i<125;i++)t.update(sim,STEP);
 assert.equal(t.count,2,'two seconds of walking while aiming');
 const k=new Tutorial('basics');k.index=COURSES.basics.findIndex(l=>l.id==='aimhold');k.touch=false;k.update(sim,STEP);
 assert.equal(k.lesson.id,'shoot','keyboard play skips the touch-only lesson');
});
