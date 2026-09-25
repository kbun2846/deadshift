import { WEAPONS, weapon as weaponById } from './items.js';
import { RIFLE, SURGE, TUTORIAL_TARGET_HEALTH } from './config/gameplay.js';
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
 // The course keeps its own, lighter targets (practice's are 250 / 300 hp).
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
 basics: [
  lesson('walk', 'walk', TUTORIAL_ZONES.length, 'hold [W] [A] [S] [D] and walk into the pink zone', 'drag anywhere on the left side to walk into the pink zone',
   { note: 'follow the pink arrow' }),
  lesson('dash', 'dodge', 5, 'hold a direction and press [CTRL] to dodge through a crate', 'drag on the left to move and tap [DODGE] to dodge through a crate',
   { note: 'each weapon carries its own number of dodges and they refill after a moment', highlight: 'dodge-stamina', touchHighlight: 'touch-dodge' }),
  // Touch only: the right thumb aims while the left walks. Skipped on keys.
  lesson('aimhold', 'aim while walking', 3, '', 'walk with your left thumb and swipe your right thumb toward a target',
   { touchNote: 'a swipe locks on like an arrow key and the next swipe moves on', touchOnly: true }),
  lesson('shoot', 'shoot', 3, 'aim with the mouse and press [LMB] / [SPACE] to hit a target', 'tap a target to fire at it',
   { note: '[SPACE] does the same as [LMB]', touchNote: 'a quick tap fires and a drag never does' }),
  // Keyboard only: the whole game plays without a mouse. Skipped on touch.
  lesson('nomouse', 'no mouse', 3, 'aim with [↑] [←] [↓] [→] and press [SPACE] to fire', '',
   { note: 'an arrow locks onto the target that way and holding it leads a running player', keyboard: true }),
  lesson('map', 'map', 1, 'press [M] to open the map', 'tap [MAP] up top', { note: 'press [M] again to close it', touchNote: 'tap close when you are done', highlight: 'map-toggle' }),
 ],
 static: [
  lesson('orbs', 'place orbs', 24, 'hold [E] and place two full loads of orbs', 'hold [PLACE] and place two full loads of orbs', { note: 'stand still and they refill faster', highlight: 'seed-pips' }),
  lesson('volley', 'volley', 3, 'place four or more orbs then press [LMB] / [SPACE] to fire them at a target', 'place four or more orbs then tap [LAUNCH] at a target',
   { note: 'more orbs hit much harder so never fire fewer than four', highlight: 'seed-pips' }),
  lesson('stream', 'stream', 3, 'get close and hold [C] on a target', 'get close and hold [STREAM] on a target', { note: 'stay on one target to ramp it up', highlight: 'seed-pips' }),
  lesson('pulse', 'hex', 3, 'press [X] to throw out the hex then [X] again to pulse it', 'tap [HEX] to throw out the hex then tap it again to pulse it',
   { note: 'the hex needs ten orbs in hand (the x mark on the orb bar) and its spinning sides zap whoever they cross', highlight: 'hex-recharge' }),
 ],
 rifle: [
  lesson('single', 'single shots', 5, 'tap [LMB] / [SPACE] once to fire a single shot', 'tap [FIRE] once for a single shot', { note: 'let go between shots', highlight: 'seed-pips' }),
  lesson('auto', 'auto fire', RIFLE.magazine * 2, 'hold [LMB] / [SPACE] and empty two full mags', 'hold [FIRE] and empty two full mags', { note: 'press [R] to reload in between', touchNote: 'tap [RELOAD] in between', highlight: 'seed-pips' }),
  lesson('aimin', 'aim in', 3, 'hold [RMB] / [SHIFT] and hit a target', 'hold [AIM] and hit a target',
   { note: 'standing still tightens it more', highlight: 'rifle-spread', touchHighlight: 'touch-stream' }),
  lesson('reload', 'reload', 2, 'fire a shot then press [R]', 'fire a shot then tap [RELOAD]', { note: `a mag holds ${RIFLE.magazine} rounds`, highlight: 'seed-pips', touchHighlight: 'touch-hex' }),
  lesson('grenade', 'grenade', 2, 'press [E] to throw a grenade', 'tap [NADE] to throw one', { note: 'stay clear of where it lands', highlight: 'hex-recharge' }),
  lesson('nova', 'nova', 1, 'press [X] for nova', 'tap [NOVA]', { note: `${SURGE.charge} seconds to power up then ${SURGE.duration} seconds of double damage with no reloading and it ends on a full mag`, highlight: 'extended-recharge' }),
 ],
 shotgun: [
  lesson('sfire', 'fire', 4, 'press [LMB] / [SPACE] for each shell and fire two full loads', 'tap [FIRE] for each shell and fire two full loads', { note: 'every shot throws you back so press [R] to reload', touchNote: 'every shot throws you back so tap [RELOAD] to reload', highlight: 'seed-pips' }),
  lesson('saim', 'aim in', 2, 'hold [RMB] / [SHIFT] and fire', 'hold [AIM] and fire', { note: 'a tighter cone lands more pellets further out', touchHighlight: 'touch-stream' }),
  lesson('double', 'double', 2, 'press [E] to fire both shells', 'tap [DOUBLE] to fire both shells', { note: 'needs two shells loaded', highlight: 'seed-pips' }),
  lesson('sreload', 'reload', 2, 'press [R] to reload', 'tap [RELOAD] to reload', { note: 'you get two shells', highlight: 'seed-pips' }),
  lesson('blast', 'blast', 1, 'press [X] to ready the blast, then [X] again to fire it', 'tap [BLAST] to ready it, then tap it again to fire', { note: 'the red cone shows where the shells spread and split', highlight: 'hex-recharge' }),
 ],
};
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
  return before !== this.index * 100 + this.count;
 }

 event(e, sim) {
  if (this.complete || this.ready) return false;
  const id = this.lesson.id, hit = e.type === 'hit' || e.type === 'kill';
  switch (id) {
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
 return text.split(/(\[[^\]]+\])/).map(part => /^\[.+\]$/.test(part) ? `<kbd>${escape(part.slice(1, -1))}</kbd>` : escape(part)).join('');
}
