import { WEAPONS, weapon as weaponById } from './items.js';
import { RIFLE, SURGE, OMEN, SHEATH, SIDEKICK, TUTORIAL_TARGET_HEALTH } from './config/gameplay.js';
import { displayKeys } from './config/keybinds.js';
// The training range and its courses.
//
// Two kinds of course share the one range. "basics" is what the home screen's
// tutorial button starts: walking, dashing, shooting and the map, the same for
// every weapon. The weapon courses (Gamemodes > Tutorial > a weapon) teach only
// that weapon. Lessons start on their own and move on on their own once done,
// so the only button left is the one that leaves.

// Breakable crates sit in the open ground either side of the spawn, away from
// the firing line, and come back a little after being smashed.
export const TUTORIAL_CRATES = [
 { x: -11, z: 8.5, angle: .22 }, { x: 11, z: 8.5, angle: -.3 }, { x: 0, z: 11.8, angle: .08 },
].map((c, i) => ({ type: 'crate', id: 'tutorial-crate-' + i, broken: false, ...c }));
const CRATE_RESPAWN = 2.4, CRATE_CLEARANCE = 1.9;

// Walk lesson checkpoints, clear of the crates, targets and fences.
export const TUTORIAL_ZONES = [{ x: -6, z: 1.5 }, { x: 6.5, z: 2 }, { x: -3.5, z: 10.5 }];
export const ZONE_RADIUS = 1.3;
// Time a finished lesson stays on screen, ticked off, before the next begins.
export const LESSON_PAUSE = 1.1;

export const tutorialMap = {
 id: 'tutorial', name: 'Training Range', width: 32, depth: 28, training: true, spawn: { x: 0, z: 6 },
 palette: { ground: '#756750', road: '#756750' }, look: { warmth: .15 }, scenerySeed: 12, buildings: [], props: TUTORIAL_CRATES, crops: [], zones: [],
 fences: [{ x: 0, z: -14, length: 32, axis: 'x' }, { x: 0, z: 14, length: 32, axis: 'x' }, { x: -16, z: 0, length: 28, axis: 'z' }, { x: 16, z: 0, length: 28, axis: 'z' }],
 // The course keeps its own, lighter targets (practice's are 50 / 60 hp).
 targets: [-9, -4.5, 0, 4.5, 9].map((x, i) => ({ id: 'training-' + i, x, z: -5, kind: i % 2 ? 'dummy' : 'target', maxHp: i % 2 ? TUTORIAL_TARGET_HEALTH.dummy : TUTORIAL_TARGET_HEALTH.target })),
};
export function tutorialMapFor(weapon) {
 const targetHp = weaponById(weapon)?.tutorial?.targetHp;
 return targetHp ? { ...tutorialMap, targets: tutorialMap.targets.map(target => ({ ...target, maxHp: targetHp })) } : tutorialMap;
}

// Copy is plain and short. Key names go in [brackets] and are drawn as keycaps,
// in capitals, whatever the rest of the interface does with case.
// { id, title, goal, keys, touch, note?, touchNote?, highlight? }
const lesson = (id, title, goal, keys, touch, extra = {}) => ({ id, title, goal, keys, touch, ...extra });
export const COURSES = {
 sheath:[
 lesson('hslash','slash',3,'get close and hold [LMB] / [SPACE] to slash','get close and hold [FIRE] to slash',{note:'the first cut draws the sword · it goes back in the sheath when you stop'}),
 lesson('hrush','gold rush',1,'press [E] for a gold rush','tap [RUSH] for a gold rush',{note:`${SHEATH.rushDuration} seconds of faster movement · keep attacking`,highlight:'hex-recharge'}),
 lesson('hdraw','draw-cut',1,'face a target a few steps away and press [X]','face a target a few steps away and tap [DRAW]',{note:'a hop back, a moment to aim, then a dash that cuts everything on the line · walls stop it',highlight:'extended-recharge'}),
 ],
 ichor:[
 lesson('icut','cut',3,'get close and hold [LMB] / [SPACE] to cut','get close and hold [FIRE] to cut',{note:'hits fill blood and make the blade stronger',highlight:'ichor-blood'}),
 lesson('iguard','deflect',1,'hold [RMB] / [SHIFT] to raise your blade','hold [GUARD] to raise your blade',{note:'raise or lower it freely · 20 seconds to recharge after it breaks',highlight:'ichor-deflect-recharge'}),
 lesson('iwave','blood slash',1,'fill blood halfway then press [E]','fill blood halfway then tap [SLASH]',{note:'keep cutting targets to reach the middle mark',highlight:'hex-recharge'}),
 lesson('ifrenzy','frenzy',1,'get close and press [X] then steer with [WASD]','get close and tap [FRENZY] then steer',{note:'keep steering through the combo · it costs health',highlight:'extended-recharge'}),
 lesson('iblood','blood',1,'land another hit to finish','land another hit to finish',{note:'at full blood people leave trails that speed you up',highlight:'ichor-blood'}),
 ],
 sidekick:[
  lesson('kfire','shoot',3,'tap [LMB] / [SPACE] to fire three shots','tap [FIRE] to fire three shots',{note:'one shot per tap',highlight:'seed-pips'}),
  lesson('kreload','reload',1,'press [R] to reload','tap [RELOAD] to reload',{note:'wait for the ammo bar to fill',highlight:'seed-pips'}),
  lesson('kmine','mine',1,'press [E] to place a mine','tap [MINE] to place a mine',{note:`enemies set it off · place two then wait ${SIDEKICK.mineCooldown} seconds for two more`,highlight:'hex-recharge'}),
  lesson('krush','rush',5,'press [X] then hold [LMB] / [SPACE] to fire','tap [RUSH] then hold [FIRE]',{note:`${SIDEKICK.duration} seconds of unlimited ammo and faster movement`,highlight:'extended-recharge'}),
 ],
 sightline:[
  lesson('spistol','sidekick',3,'tap [LMB] / [SPACE] to fire three shots','tap [FIRE] to fire three shots',{note:'one shot per tap',highlight:'sightline-ammo'}),
  lesson('spreload','sidekick reload',1,'press [R] to reload sidekick','tap [RELOAD] to reload sidekick',{note:'wait for the ammo bar to fill',highlight:'sightline-ammo'}),
  lesson('sstance','set up sightline',1,'press [E] and wait for sightline to be ready','tap [STANCE] and wait for sightline to be ready',{note:'press [E] again to stand and use sidekick',touchNote:'tap [STANCE] again to stand and use sidekick',highlight:'hex-recharge'}),
  lesson('sscope','scope',1,'hold [RMB] / [SHIFT] to zoom out then fire','tap [AIM] to zoom out then tap [FIRE]',{note:'aim a little ahead of moving targets',touchHighlight:'touch-stream'}),
  lesson('srreload','sightline reload',1,'stay crouched and press [R] to reload sightline','stay crouched and tap [RELOAD] to reload sightline',{note:'reloading takes you out of the scope',highlight:'sightline-ammo'}),
  lesson('sload','load breach',1,'stand with [E] then press [X] to load breach','stand with [STANCE] then tap [BREACH] to load it',{note:'the yellow glow means your explosive round is ready',highlight:'extended-recharge'}),
  lesson('sbreach','fire breach',1,'press [E] then aim and fire with [LMB] / [SPACE]','tap [STANCE] then aim and tap [FIRE]',{note:'aim at the spot you want to blow up',highlight:'extended-recharge'}),
 ],
 omen:[
  lesson('ofire','shoot',OMEN.magazine,'hold [LMB] / [SPACE] to fire all four shots','hold [FIRE] to fire all four shots',{note:'shots take time to reach the target',highlight:'seed-pips'}),
  lesson('oreload','reload',1,'press [R] to reload','tap [RELOAD] to reload',{note:'wait for all four rounds to fill',highlight:'seed-pips',touchHighlight:'touch-hex'}),
  lesson('ocurse','curse',1,'press [E] then shoot a target to curse it','tap [CURSE] then shoot a target to curse it',{note:'fire within five seconds or you lose the shot',highlight:'hex-recharge',touchHighlight:'touch-grenade'}),
  lesson('orupture','rupture',1,'curse a target then press [E] again to explode it','curse a target then tap [CURSE] again to explode it',{note:'wait for the shot to hit and explode it before the timer runs out',highlight:'hex-recharge',touchHighlight:'touch-grenade'}),
  lesson('olate','last second',1,'curse a target then press [E] again when the timer pulses','curse a target then tap [CURSE] again when the timer pulses',{note:'waiting until the last second makes the explosion stronger',highlight:'hex-recharge',touchHighlight:'touch-grenade'}),
  lesson('ocovenant','covenant',1,'press [X] then press [X] again after the shots hit','tap [COVENANT] then tap it again after the shots hit',{note:'curse several targets at once then explode them before the timer ends',highlight:'extended-recharge',touchHighlight:'touch-extended'}),
 ],
 basics: [
  lesson('walk', 'walk', TUTORIAL_ZONES.length, 'use [W] [A] [S] [D] to walk into the pink zone', 'drag on the left to walk into the pink zone',
   { note: 'follow the pink arrow' }),
  lesson('dash', 'dodge', 5, 'hold a direction and press [Q] to dodge through a crate', 'drag on the left to move and tap [DODGE] to dodge through a crate',
   { note: 'your dodges refill over time', highlight: 'dodge-stamina', touchHighlight: 'touch-dodge' }),
  // Touch only: the right thumb aims while the left walks. Skipped on keys.
  lesson('aimhold', 'aim while walking', 3, '', 'walk with your left thumb and swipe your right thumb toward a target',
   { touchNote: 'swipe again to aim at another target', touchOnly: true }),
  lesson('shoot', 'shoot', 3, 'aim with the mouse and press [LMB] / [SPACE] to hit a target', 'tap a target to fire at it',
   { note: 'hit a target three times', touchNote: 'tap to shoot and swipe to aim' }),
  // Keyboard only: the whole game plays without a mouse. Skipped on touch.
  lesson('nomouse', 'no mouse', 3, 'aim with [↑] [←] [↓] [→] and press [SPACE] to fire', '',
   { note: 'hold an arrow to aim ahead of a moving target', keyboard: true }),
  lesson('map', 'map', 1, 'press [M] to open the map', 'tap [MAP] up top', { note: 'press [M] again to close it', touchNote: 'tap close when you are done', highlight: 'map-toggle' }),
 ],
 static: [
  lesson('orbs', 'place orbs', 24, 'hold [E] and place two full loads of orbs', 'hold [PLACE] and place two full loads of orbs', { note: 'stand still and they refill faster', highlight: 'seed-pips' }),
  lesson('volley', 'volley', 3, 'place at least four orbs then press [LMB] / [SPACE] to hit a target', 'place at least four orbs then tap [LAUNCH] to hit a target',
   { note: 'more orbs deal more damage', highlight: 'seed-pips' }),
  lesson('stream', 'stream', 3, 'get close and hold [C] on a target', 'get close and hold [STREAM] on a target', { note: 'keep hitting the same target to deal more damage', highlight: 'seed-pips' }),
  lesson('pulse', 'hex', 3, 'press [X] to make a hex then [X] again to pulse it', 'tap [HEX] to make a hex then tap it again to pulse it',
   { note: 'needs ten orbs · keeps enemies out and blocks their shots', highlight: 'hex-recharge' }),
 ],
 rifle: [
  lesson('single', 'single shots', 5, 'tap [LMB] / [SPACE] once to fire a single shot', 'tap [FIRE] once for a single shot', { note: 'let go between shots', highlight: 'seed-pips' }),
  lesson('auto', 'auto fire', RIFLE.magazine * 2, 'hold [LMB] / [SPACE] and empty two full mags', 'hold [FIRE] and empty two full mags', { note: 'press [R] to reload in between', touchNote: 'tap [RELOAD] in between', highlight: 'seed-pips' }),
  lesson('aimin', 'aim in', 3, 'hold [RMB] / [SHIFT] and hit a target', 'hold [AIM] and hit a target',
   { note: 'standing still tightens it more', highlight: 'rifle-spread', touchHighlight: 'touch-stream' }),
  lesson('reload', 'reload', 2, 'fire a shot then press [R]', 'fire a shot then tap [RELOAD]', { note: `a mag holds ${RIFLE.magazine} rounds`, highlight: 'seed-pips', touchHighlight: 'touch-hex' }),
  lesson('grenade', 'grenade', 2, 'press [E] to throw a grenade', 'tap [NADE] to throw one', { note: 'stay clear of where it lands', highlight: 'hex-recharge' }),
  lesson('nova', 'nova', 1, 'press [X] and wait for nova to start', 'tap [NOVA] and wait for it to start', { note: `${SURGE.duration} seconds of double damage with no reloads`, highlight: 'extended-recharge' }),
 ],
 shotgun: [
  lesson('sfire', 'fire', 4, 'tap [LMB] / [SPACE] for each shot and fire four times', 'tap [FIRE] for each shot and fire four times', { note: 'press [R] to reload after two shots', touchNote: 'tap [RELOAD] after two shots', highlight: 'seed-pips' }),
  lesson('saim', 'aim in', 2, 'hold [RMB] / [SHIFT] and fire', 'hold [AIM] and fire', { note: 'aiming in keeps more pellets on target', touchHighlight: 'touch-stream' }),
  lesson('double', 'double', 2, 'press [E] to fire both shells', 'tap [DOUBLE] to fire both shells', { note: 'needs two shells loaded', highlight: 'seed-pips' }),
  lesson('sreload', 'reload', 2, 'press [R] to reload', 'tap [RELOAD] to reload', { note: 'you get two shells', highlight: 'seed-pips' }),
  lesson('blast', 'blast', 1, 'press [X] and wait three seconds then press [X] again to fire', 'tap [BLAST] and wait three seconds then tap it again to fire', { note: 'get close so more of the blast hits', highlight: 'hex-recharge' }),
 ],
};
// Course completion only points to tutorial/practice actions.
export const COURSE_DONE_NOTES = Object.freeze({
 basics: 'try a weapon tutorial next or start a solo match',
 weapon: 'you can keep practicing here',
});
export const COURSE_NAMES = Object.freeze({ basics: 'basics', ...Object.fromEntries(WEAPONS.map(w => [w.id, w.name.toLowerCase()])) });

const isCrate = id => typeof id === 'string' && id.startsWith('tutorial-crate');

export class Tutorial {
 constructor(course = 'basics') {
  this.course = COURSES[course] ? course : 'basics';
  // Basics is taught with Static: its quick shot is a plain click, like every gun.
  this.weapon = this.course === 'basics' ? 'static' : this.course;
  this.lessons = COURSES[this.course];
  this.index = 0; this.count = 0; this.seen = new Set(); this.pause = 0; this.brokenFor = new Map();
 }
 get lesson() { return this.lessons[this.index]; }
 get goal() { return this.lesson?.goal || 1; }
 get ready() { return this.count >= this.goal; }
 get complete() { return this.index >= this.lessons.length; }
 // The lesson just finished and is showing as done for a moment.
 get celebrating() { return this.pause > 0; }
 get zone() { return this.lesson?.id === 'walk' && !this.ready ? { ...TUTORIAL_ZONES[this.count], r: ZONE_RADIUS } : null; }

 credit(id) {
  if (this.complete || this.ready) return false;
  if (id !== undefined) { if (this.seen.has(id)) return false; this.seen.add(id); }
  this.count++;
  if (this.ready) this.pause = LESSON_PAUSE;
  return true;
 }
 advance() {
  if (!this.ready) return false;
  this.index++; this.count = 0; this.pause = 0; this.seen.clear();
  return true;
 }

 // Where the pink arrow points, or null for no arrow.
 pointer(sim) {
  if (this.celebrating) return null;
  if (this.zone) return this.zone;
  if (this.lesson?.id === 'dash') {
   let best = null, distance = Infinity;
   for (const prop of sim.props) if (isCrate(prop.id) && prop.hp > 0) {
    const d = Math.hypot(prop.x - sim.player.x, prop.z - sim.player.z);
    if (d < distance) { distance = d; best = prop; }
   }
   return best;
  }
  return null;
 }

 // Called once per simulation step. Returns true when what the card shows changed.
 update(sim, dt) {
  const before = this.index * 100 + this.count;
  // A keyboard-only lesson means nothing on a touchscreen.
  // Keyboard-only and touch-only lessons are skipped on the other kind of play.
  if (this.lesson && (this.touch ? this.lesson.keyboard : this.lesson.touchOnly)) { this.index++; this.count = 0; this.pause = 0; this.seen.clear(); }
  // Aim-while-walking counts seconds spent doing both at once.
  if (this.lesson?.id === 'aimhold' && this.touchAiming && this.walking) {
   this.heldFor = (this.heldFor || 0) + dt;
   if (this.heldFor >= 1) { this.heldFor -= 1; this.credit(); }
  }
  const p = sim.player, zone = this.zone;
  if (zone && Math.hypot(p.x - zone.x, p.z - zone.z) < zone.r) this.credit();
  if (this.pause > 0) { this.pause -= dt; if (this.pause <= 0) this.advance(); }
  // Smashed crates come back, but never on top of the player.
  for (const prop of sim.props) if (isCrate(prop.id)) {
   if (prop.hp > 0) { this.brokenFor.delete(prop.id); continue; }
   const time = (this.brokenFor.get(prop.id) || 0) + dt; this.brokenFor.set(prop.id, time);
   if (time >= CRATE_RESPAWN && Math.hypot(p.x - prop.x, p.z - prop.z) > CRATE_CLEARANCE) { sim.restoreProp(prop.id); this.brokenFor.delete(prop.id); }
  }
  // Training hands back what a lesson spends, so nobody waits on a cooldown.
  const id = this.lesson?.id;
  if (id === 'pulse' && !sim.hexOrbs.length && !sim.hexSpin) { sim.hexCooldown = 0; sim.ammo = Math.max(sim.ammo, 10); }
  if (id === 'grenade' && !sim.grenades.length) sim.grenadeCooldown = 0;
  if (id === 'nova' && sim.surge?.phase === 'idle') sim.surge.cooldown = 0;
  if (id === 'blast' && sim.scatter) sim.scatter.cooldown = 0;
  if(this.course==='ichor'&&!this.complete){sim.ichor.eCooldown=sim.ichor.xCooldown=0;}
  if(this.course==='sheath'&&!this.complete&&sim.sheath&&!sim.sheath.rush&&!sim.sheath.x){sim.sheath.eCooldown=sim.sheath.xCooldown=0;}
  if(this.course==='sidekick'&&!this.complete){sim.sidekick.mineCooldown=0;if(!sim.sidekick.active&&!sim.sidekick.summon)sim.sidekick.xCooldown=0;}
  if(this.course==='sightline'&&!this.complete&&sim.sightline&&!sim.sightline.special)sim.sightline.xCooldown=0;
  if (this.course === 'omen' && !this.complete && sim.omen) {
   // Only the range lends back cooldowns. Keep live curses and their flight
   // clocks intact so misses and late presses teach the real timing.
   if (!sim.omen.primed && !sim.omen.marks.some(m => m.kind === 'e') && !sim.omenBolts.some(b => b.kind === 'e')) sim.omen.primeCooldown = 0;
   if (sim.omen.volleyLeft <= 0) sim.omen.volleyCooldown = 0;
  }
  return before !== this.index * 100 + this.count;
 }

 event(e, sim) {
  if (this.complete || this.ready) return false;
  const id = this.lesson.id, hit = e.type === 'hit' || e.type === 'kill';
  switch (id) {
   case 'hslash': return hit&&e.damageType==='blade'&&this.credit();
   case 'hrush': return e.type==='sheathRush'&&this.credit();
   case 'hdraw': return e.type==='sheathDrawCut'&&e.hits>0&&this.credit();
   case 'icut':case 'iblood': return (e.type==='hit'||e.type==='kill')&&e.damageType?.startsWith('ichor')&&this.credit();
   case 'iguard':return e.type==='ichorGuardStart'&&this.credit();
   case 'iwave':return e.type==='ichorWave'&&this.credit();
   case 'ifrenzy':return e.type==='ichorFrenzyStart'&&this.credit();
   case 'kfire': return e.type==='sidekickShot'&&this.credit();
   case 'kreload': return e.type==='sidekickReloaded'&&this.credit();
   case 'kmine': return e.type==='sidekickMine'&&this.credit();
   case 'krush': return e.type==='sidekickShot'&&e.dual&&this.credit();
   case 'spistol': return e.type==='sightlineShot'&&e.pistol&&this.credit();
   case 'spreload': return e.type==='sightlineReloaded'&&!e.rifle&&this.credit();
   case 'sstance': return e.type==='sightlineStance'&&e.crouched&&this.credit();
   case 'sscope': return e.type==='sightlineShot'&&!e.pistol&&sim.sightline.aiming&&this.credit();
   case 'srreload': return e.type==='sightlineReloaded'&&e.rifle&&this.credit();
   case 'sload': return e.type==='sightlineReloaded'&&e.special&&this.credit();
   case 'sbreach': return e.type==='sightlineShot'&&e.special&&this.credit();
   case 'ofire': return e.type==='omenShot'&&this.credit();
   case 'oreload': return e.type==='omenReloaded'&&this.credit();
   case 'ocurse': return e.type==='omenMark'&&e.kind==='e'&&this.credit();
   case 'orupture': return e.type==='omenBurst'&&e.kind==='e'&&this.credit();
   case 'olate': return e.type==='omenBurst'&&e.kind==='e'&&e.power>OMEN.blastDamage/OMEN.lateDamage&&this.credit();
   case 'ocovenant': return e.type==='omenBurst'&&e.kind==='x'&&this.credit();
   case 'dash': return e.type === 'propBreak' && e.dashed && isCrate(e.id) && this.credit();
   case 'shoot': return hit && e.volley !== undefined && this.credit(e.volley);
   case 'map': return e.type === 'mapOpened' && this.credit();
   case 'orbs': return e.type === 'seed' && this.credit();
   case 'volley': return hit && e.volley !== undefined && !sim.spray.active && this.credit(e.volley);
   case 'stream': return hit && sim.spray.active && this.credit(e.volley);
   case 'pulse': return e.type === 'hexPulse' && this.credit();
   case 'single': return e.type === 'rifleShot' && e.burstIndex === 1 && this.credit(e.id);
   // Every round counts: two full magazines (RIFLE.magazine * 2 shots), reload and all.
   case 'auto': return e.type === 'rifleShot' && this.credit();
   case 'nomouse': return e.type === 'keyboardShot' && this.credit();
   case 'aimin': return e.type === 'rifleHit' && e.aimed && this.credit(e.id);
   case 'reload': return e.type === 'rifleReloaded' && this.credit(e.id);
   case 'grenade': return e.type === 'grenadeExplosion' && this.credit(e.id);
   case 'nova': return e.type === 'surgeStart' && this.credit(e.id);
   case 'sfire': return e.type === 'shotgunShot' && this.credit(e.id);
   case 'blast': return e.type === 'scatterFire' && this.credit(e.id);
   case 'saim': return e.type === 'shotgunShot' && sim.shotgun?.aiming && this.credit(e.id);
   case 'double': return e.type === 'shotgunDouble' && this.credit(e.id);
   case 'sreload': return e.type === 'shotgunReloaded' && this.credit(e.id);
  }
  return false;
 }
}

// "[W] [A]" -> keycaps. Everything else is escaped text.
export function lessonMarkup(text) {
 const escape = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
 return text.split(/(\[[^\]]+\])/).map(part => /^\[.+\]$/.test(part) ? `<kbd>${escape(displayKeys(part.slice(1, -1)))}</kbd>` : escape(part)).join('');
}
