export const tutorialMap={id:'tutorial',name:'Training Range',width:32,depth:28,training:true,spawn:{x:0,z:6},palette:{ground:'#756750',road:'#756750'},scenerySeed:12,buildings:[],props:[],crops:[],zones:[],fences:[{x:0,z:-14,length:32,axis:'x'},{x:0,z:14,length:32,axis:'x'},{x:-16,z:0,length:28,axis:'z'},{x:16,z:0,length:28,axis:'z'}],targets:[-9,-4.5,0,4.5,9].map((x,i)=>({id:'training-'+i,x,z:-5,kind:i%2?'dummy':'target'}))};
export function tutorialMapFor(weapon){
 return weapon==='shotgun'?{...tutorialMap,targets:tutorialMap.targets.map(target=>({...target,maxHp:400}))}:tutorialMap;
}
export const lessons=[
 ['Move around','Hold W, A, S or D to walk.\n\nKeep moving until the counter fills.',5],
 ['Dodge','Move in any direction, then press Space to dodge. Do this five times.\n\nThe two highlighted bars show stamina. Each dodge uses one charge; wait for it to refill.',5],
 ['Place your orbs','Aim toward the targets with your mouse or arrow keys. Hold E to place five orbs.\n\nOrbs reload faster when standing still, except while using the lightning stream.',5],
 ['Land a volley','Aim at a target. With no orbs placed, left-click or press Q for a quick shot.\n\nPlacing an orb before launching deals slightly more damage.\n\nFor a volley, hold E to place more orbs first, then click or press Q to launch them together.\n\nLand five shots or volleys. ',5],
 ['Lightning stream','Move close to a target and aim at it. Hold C to hit it with lightning, then release. Repeat five times.\n\nKeep the stream on the same target to increase damage. Watch the ammo bar and wait for a refill if it runs out.',5],
 ['Deploy and pulse','Press X to deploy. Wait for the hexagon to form, then press X again to pulse. Repeat five times.\n\nPulse before the expansion bar reaches the red boundary.\n\nTraining restores ammo and cooldown between attempts.',5],
 ['Open your map','Press M or use the highlighted map button at the top right.\n\nClose it with M, Escape or the Close button. Then select Continue to finish.',1],
];
export const rifleLessons=[
 lessons[0],[lessons[1][0],lessons[1][1].replace('two highlighted','three highlighted'),lessons[1][2]],
 ['Fire single shots','Aim into the range and click the left mouse button or tap Q once. Release it between shots.\n\nFire five separate shots. Each press fires one bullet.',5],
 ['Automatic fire','Hold the left mouse button or Q to keep firing.\n\nFire five automatic follow-up shots while holding the control. Watch the ammo segments empty; R reloads if needed.',5],
 ['Aim with control','Hold the right mouse button or Shift and aim at a target. Fire while still holding aim.\n\nLand five aimed hits. The two spread lines tighten when aiming; walking slows, and standing still improves accuracy further.',5],
 ['Reload your rifle','Fire at least one bullet, then press R. Wait for the reload to finish. Repeat three times.\n\nEach magazine holds 18 rounds.',3],
 ['Throw a grenade','Aim toward the targets and press E. \n\nLet three grenades explode. Keep clear of your own blast.\n\nThe normal cooldown is 25 seconds; training restores the grenade after each explosion.',3],
 ['Load an extended magazine','Press X and wait for the reload to finish. Repeat three times.\n\nLoads 36 rounds. Training resets the cooldown.\n\nR returns to a standard 18-round magazine.',3],
 lessons[6],
];
export const rifleTouchLessons=[
 'Drag and hold the left stick to walk.\n\nKeep moving until the counter fills.',
 'Move with the left stick and tap DODGE. Repeat five times.\n\nEach dodge uses one stamina charge; wait for it to refill.',
 'Aim by dragging on the world, then tap FIRE once and release.\n\nFire five separate shots.',
 'Aim by dragging on the world and hold FIRE.\n\nFire five automatic follow-up shots without releasing. Tap RELOAD if the magazine empties.',
 'Aim at a target by dragging on the world. Hold AIM and fire while keeping AIM held.\n\nLand five aimed hits. Aiming tightens the spread lines and slows walking; standing still also improves accuracy.',
 'Fire at least one bullet, then tap RELOAD and wait until it finishes. Repeat three times.\n\nEach magazine holds 18 rounds.',
 'Aim by dragging on the world and tap GRENADE to throw a grenade.\n\nLet three grenades explode. Move clear: the fuse lasts 1.4 seconds.\n\nTraining restores your grenade after each explosion; the normal cooldown is 25 seconds.',
 'Tap EXTEND and wait for the 36-round magazine to load. Repeat three times.\n\nLoading takes 1.8 seconds. Training restores the ability after each reload; the normal cooldown is 60 seconds. RELOAD returns to 18 rounds.',
 'Tap the map button at the top right.\n\nClose the map, then select Continue to finish.',
];
export const shotgunLessons=[
 lessons[0],['Dodge once','Move and press Space / DODGE. Ballast has one native dodge. Repeat three times, waiting for stamina between dodges.',3],
 ['Fire and launch','Tap and release LMB / FIRE. Each shot launches you backward. Fire five shots; R / RELOAD loads two shells.',5],
 ['Store charge','Hold LMB / FIRE to charge, then press Q, click RMB, or tap LOCK before releasing. Store charge three times. It lasts 15 seconds and powers both shells.',3],
 ['Charged blast','Fully charge and release LMB / FIRE. Fire three fully charged shots. Aim away from your destination to propel yourself toward it.',3],
 ['Double discharge','Press E / DOUBLE with two shells loaded. Both fire in quick succession with the same charge. Repeat three times.\n\nTIP: Store full charge with both shells loaded, dash close, aim and double fire. A well-placed burst can defeat a 500-HP player.',3],
 ['Reload','Fire, then press R / RELOAD. Wait for the barrels to open, eject spent shells and close. Complete three reloads.',3],
 lessons[6],
];
export class Tutorial {
 constructor(weapon='static'){this.weapon=['rifle','shotgun'].includes(weapon)?weapon:'static';this.lessons=this.weapon==='shotgun'?shotgunLessons:this.weapon==='rifle'?rifleLessons:lessons;this.index=0;this.count=0;this.distance=0;this.last=null;this.active=false;this.seen=new Set();}
 get goal(){return this.lessons[this.index]?.[2]||1;}
 get ready(){return this.count>=this.goal;}
 begin(){this.active=true;this.last=null;}
 advance(){if(!this.ready)return false;this.index++;this.count=0;this.distance=0;this.last=null;this.active=false;this.seen.clear();return true;}
 credit(id){if(!this.active||this.ready)return;if(id!==undefined){if(this.seen.has(id))return;this.seen.add(id);}this.count++;}
 update(player){if(this.active&&this.index===0&&this.last){this.distance+=Math.hypot(player.x-this.last.x,player.z-this.last.z);while(this.distance>=2){this.distance-=2;this.credit();}}this.last={x:player.x,z:player.z};}
 event(e,sim){
  if(!this.active||this.ready)return;
  if(this.weapon==='shotgun'){
   if(this.index===1&&e.type==='dodge'||this.index===2&&e.type==='shotgunShot'||this.index===3&&e.type==='shotgunStored'||this.index===4&&e.type==='shotgunShot'&&e.charge>.99||this.index===5&&e.type==='shotgunDouble'||this.index===6&&e.type==='shotgunReloaded'||this.index===7&&e.type==='mapOpened')this.credit(e.id);return;
  }
  if(this.weapon==='rifle'){
   if(this.index===1&&e.type==='dodge'||this.index===2&&e.type==='rifleShot'&&e.burstIndex===1||this.index===3&&e.type==='rifleShot'&&e.burstIndex>1||this.index===4&&e.type==='rifleHit'&&e.aimed||this.index===5&&e.type==='rifleReloaded'&&!e.extended||this.index===6&&e.type==='grenadeExplosion'||this.index===7&&e.type==='rifleReloaded'&&e.extended||this.index===8&&e.type==='mapOpened')this.credit(e.id);
   return;
  }
  const hit=e.type==='hit'||e.type==='kill';
  if(this.index===1&&e.type==='dodge'||this.index===2&&e.type==='seed'||this.index===5&&e.type==='hexPulse'||this.index===6&&e.type==='mapOpened')this.credit();
  if(this.index===3&&hit&&e.volley&&!sim.spray.active)this.credit(e.volley);
  if(this.index===4&&hit&&sim.spray.active)this.credit(e.volley);
 }
 get complete(){return this.index>=this.lessons.length;}
}
