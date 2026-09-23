import { WEAPONS } from './items.js';
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
 targets: [-9, -4.5, 0, 4.5, 9].map((x, i) => ({ id: 'training-' + i, x, z: -5, kind: i % 2 ? 'dummy' : 'target' })),
};
export function tutorialMapFor(weapon) {
 return weapon === 'shotgun' ? { ...tutorialMap, targets: tutorialMap.targets.map(target => ({ ...target, maxHp: 400 })) } : tutorialMap;
}

// Copy is plain and short. Key names go in [brackets] and are drawn as keycaps,
// in capitals, whatever the rest of the interface does with case.
// { id, title, goal, keys, touch, note?, touchNote?, highlight? }
const lesson = (id, title, goal, keys, touch, extra = {}) => ({ id, title, goal, keys, touch, ...extra });
export const COURSES = {
 basics: [
  lesson('walk', 'walk', TUTORIAL_ZONES.length, 'hold [W] [A] [S] [D] and walk into the pink zone', 'drag anywhere on the left side to walk into the pink zone',
   { note: 'follow the pink arrow' }),
  lesson('dash', 'dash', 5, 'hold a direction and press [SPACE] to dash through a crate', 'drag on the left to move and tap [DODGE] to dash through a crate',
   { note: 'each dash uses a stamina bar', highlight: 'dodge-stamina', touchHighlight: 'touch-dodge' }),
  // Touch only: the right thumb aims while the left walks. Skipped on keys.
  lesson('aimhold', 'aim while walking', 3, '', 'walk with your left thumb and hold your right thumb on a target',
   { touchNote: 'your aim stays under your right thumb until you lift it', touchOnly: true }),
  lesson('shoot', 'shoot', 3, 'aim with the mouse and press [LMB] / [Q] to hit a target', 'tap a target to fire at it',
   { note: '[Q] does the same as [LMB]', touchNote: 'a quick tap fires and a drag never does' }),
  // Keyboard only: the whole game plays without a mouse. Skipped on touch.
  lesson('nomouse', 'no mouse', 3, 'aim with [↑] [←] [↓] [→] and press [Q] to fire', '',
   { note: 'you can play the whole game on the keyboard', keyboard: true }),
  lesson('map', 'map', 1, 'press [M] to open the map', 'tap [MAP] up top', { note: 'press [M] again to close it', touchNote: 'tap close when you are done', highlight: 'map-toggle' }),
 ],
 static: [
  lesson('orbs', 'place orbs', 24, 'hold [E] and place two full loads of orbs', 'hold [PLACE] and place two full loads of orbs', { note: 'stand still and they refill faster', highlight: 'seed-pips' }),
  lesson('volley', 'volley', 3, 'place a few orbs then press [LMB] / [Q] to fire them at a target', 'place a few orbs then tap [LAUNCH] at a target',
   { note: 'more orbs hit harder', highlight: 'seed-pips' }),
  lesson('stream', 'stream', 3, 'get close and hold [C] on a target', 'get close and hold [STREAM] on a target', { note: 'stay on one target to ramp it up', highlight: 'seed-pips' }),
  lesson('pulse', 'hex pulse', 3, 'press [X] to deploy then [X] again to pulse', 'tap [PULSE] to deploy then tap it again to pulse',
   { note: 'pulse before the ring at your cursor turns red', highlight: 'hex-recharge' }),
 ],
 rifle: [
  lesson('single', 'single shots', 5, 'tap [LMB] / [Q] once to fire a single shot', 'tap [FIRE] once for a single shot', { note: 'let go between shots', highlight: 'seed-pips' }),
  lesson('auto', 'auto fire', 36, 'hold [LMB] / [Q] and empty two full mags', 'hold [FIRE] and empty two full mags', { note: 'press [R] to reload in between', touchNote: 'tap [RELOAD] in between', highlight: 'seed-pips' }),
  lesson('aimin', 'aim in', 3, 'hold [RMB] / [SHIFT] and hit a target', 'hold [AIM] and hit a target',
   { note: 'standing still tightens it more', highlight: 'rifle-spread', touchHighlight: 'touch-stream' }),
  lesson('reload', 'reload', 2, 'fire a shot then press [R]', 'fire a shot then tap [RELOAD]', { note: 'a mag holds 18 rounds', highlight: 'seed-pips', touchHighlight: 'touch-hex' }),
  lesson('grenade', 'grenade', 2, 'press [E] to throw a grenade', 'tap [GRENADE] to throw one', { note: 'stay out of the blast', highlight: 'hex-recharge' }),
  lesson('bigmag', 'big mag', 1, 'press [X] to load a 36 round mag', 'tap [EXTEND] to load a 36 round mag', { note: '[R] goes back to 18', touchNote: '[RELOAD] goes back to 18', highlight: 'extended-recharge' }),
 ],
 shotgun: [
  lesson('sfire', 'fire', 4, 'press [LMB] / [Q] and fire two full loads', 'tap [FIRE] and fire two full loads', { note: 'press [R] to reload and watch the kick', touchNote: 'tap [RELOAD] in between and watch the kick', highlight: 'seed-pips' }),
  lesson('charged', 'charged blast', 3, 'hold [LMB] / [Q] until it is full then let go', 'hold [FIRE] until it is full then let go',
   { note: 'the ring at your cursor shows the charge' }),
  lesson('store', 'store charge', 2, 'hold [LMB] / [Q] then press [SHIFT] / [RMB] to store it', 'hold [FIRE] then tap [LOCK] to store it', { note: 'the ring turns white while it is stored' }),
  lesson('double', 'double', 2, 'press [E] to fire both shells', 'tap [DOUBLE] to fire both shells', { note: 'needs two shells loaded', highlight: 'seed-pips' }),
  lesson('sreload', 'reload', 2, 'press [R] to reload', 'tap [RELOAD] to reload', { note: 'you get two shells', highlight: 'seed-pips' }),
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
  if (id === 'bigmag' && !sim.rifle.reload) sim.rifle.extendedCooldown = 0;
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
   // Every round counts: two full magazines is 36 shots, reload and all.
   case 'auto': return e.type === 'rifleShot' && this.credit();
   case 'nomouse': return e.type === 'keyboardShot' && this.credit();
   case 'aimin': return e.type === 'rifleHit' && e.aimed && this.credit(e.id);
   case 'reload': return e.type === 'rifleReloaded' && !e.extended && this.credit(e.id);
   case 'grenade': return e.type === 'grenadeExplosion' && this.credit(e.id);
   case 'bigmag': return e.type === 'rifleReloaded' && e.extended && this.credit(e.id);
   case 'sfire': return e.type === 'shotgunShot' && this.credit(e.id);
   case 'charged': return e.type === 'shotgunShot' && e.charge > .99 && this.credit(e.id);
   case 'store': return e.type === 'shotgunStored' && this.credit(e.id);
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
