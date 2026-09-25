// Ballast's X: Scatter (v0.83, owner's design).
//
// X readies it: the aim cone turns red and widens to show where it will go
// (aim-overlay.js), the gun glows (shotgun-pressure.js). X again fires five
// big red shells across a wide cone. Each flies SCATTER.splitAt metres, or
// until it hits something, and there splits into four smaller shells that
// fan out and fly on to SCATTER.reach in all. Every small shell ends in a
// little explosion: where it hits someone, a wall or a prop, or at the end of
// its flight. Explosions stack and splash (measured to a body's edge, walls
// shelter, like the orb blasts). Damage: a big shell hit, a small shell hit,
// and each explosion, all counted per target per Scatter and capped at
// SCATTER.max (owner: 420-480 at most). A big shell that hits someone splits
// right there, into them: its small shells hit and burst on that body, so a
// clean hit with a big shell is the heavy part (~170), and point blank all
// five reach the cap.
// It uses no shells from the magazine; the cooldown starts when it fires.
//
// It must be readied SCATTER.prime (3) seconds before the second X fires it
// (v143, owner); `armedFor` counts up, `scatterPrimed` event at 3 s.
// Plain state on the sim: `sim.scatter` { armed, armedFor, cooldown } and the flying
// shells in `sim.scatterShells`. Events for the screen and sound:
// scatterArm, scatterPrimed, scatterFire, scatterSplit, scatterHit, scatterBurst.
import { SCATTER } from '../config/gameplay.js';
import { targetRadius } from '../target-radius.js';
import { cropCircle } from '../crops.js';
export { SCATTER };

export function resetScatter(sim, keepCooldown = false) {
 const cooldown = keepCooldown ? sim.scatter?.cooldown || 0 : 0;
 sim.scatter = { armed: false, armedFor: 0, cooldown, tally: new Map() };
 sim.scatterShells = [];
}
// Readied long enough to fire (owner, v143: SCATTER.prime seconds after the
// first X; a second X sooner does nothing).
export const scatterPrimed = sim => !!sim.scatter?.armed && (sim.scatter.armedFor || 0) >= SCATTER.prime - 1e-6;
export const scatterPrimeLeft = sim => (sim.scatter?.armed ? Math.max(0, SCATTER.prime - (sim.scatter.armedFor || 0)) : 0);
export const scatterReady = sim => sim.weapon === 'shotgun' && !sim.scatter.armed && sim.scatter.cooldown <= 1e-8;

// Damage to `target` from Scatter `volley`, within the cap.
function deal(sim, target, volley, damage, extra) {
 // (Counted as dealt, after the dev damage multiplier, so it cannot beat the cap.)
 const key = volley + ':' + target.id, done = sim.scatter.tally.get(key) || 0, room = SCATTER.max - done, scale = sim.dev.damageOut || 1;
 const amount = Math.min(room / scale, damage);
 if (amount <= 0) return 0;
 sim.scatter.tally.set(key, done + amount * scale);
 sim.hit(target, { damage: amount, owner: sim.player.id, volley: 'scatter' + volley, damageType: 'ballast', ...extra });
 return amount;
}

function launch(sim) {
 const p = sim.player, s = sim.scatter, volley = ++sim.volley, heading = Math.atan2(p.aimZ, p.aimX);
 const x = p.x + p.aimX * .96 - p.aimZ * .2, z = p.z + p.aimZ * .96 + p.aimX * .2;
 for (let i = 0; i < SCATTER.shells; i++) {
  const a = heading + ((i + .5) / SCATTER.shells * 2 - 1) * SCATTER.spread + (Math.random() - .5) * .06;
  sim.scatterShells.push({ id: ++sim.serial, big: true, volley, x: p.x, z: p.z, fromX: x, fromZ: z, dx: Math.cos(a), dz: Math.sin(a), travel: 0, limit: SCATTER.splitAt, speed: SCATTER.speed, skip: null });
 }
 s.armed = false; s.cooldown = sim.dev.cooldowns ? 0 : SCATTER.cooldown;
 // Old tallies go (a Scatter's shells are all gone within a couple of seconds).
 for (const key of s.tally.keys()) if (+key.split(':')[0] < volley - 50) s.tally.delete(key);
 if (!sim.dev.noKnockback) { p.blastVX = -p.aimX * SCATTER.recoil * 8; p.blastVZ = -p.aimZ * SCATTER.recoil * 8; p.ballastLaunch = true; }
 sim.events.push({ type: 'scatterFire', x, z, aimX: p.aimX, aimZ: p.aimZ, id: volley });
}

// A big shell breaks into its small ones at (x, z).
function split(sim, shell, x, z, into = false) {
 const heading = Math.atan2(shell.dz, shell.dx);
 for (let i = 0; i < SCATTER.split; i++) {
  // Scattered, not a neat arc (owner, v143): each small shell turns a little
  // more at random and flies anywhere from about half to 1.4x as far, so the
  // bursts land short, long and off to the sides.
  const a = heading + ((i + .5) / SCATTER.split * 2 - 1) * SCATTER.childSpread + (Math.random() - .5) * .34;
  const far = SCATTER.childNear + Math.random() * (SCATTER.childFar - SCATTER.childNear);
  // Into a body: a short way, so each meets it at once.
  sim.scatterShells.push({ id: ++sim.serial, big: false, volley: shell.volley, x, z, dx: Math.cos(a), dz: Math.sin(a), travel: 0, limit: into ? .9 : Math.max(.3, (SCATTER.reach - SCATTER.splitAt) * far), speed: SCATTER.childSpeed, skip: null });
 }
 sim.events.push({ type: 'scatterSplit', x, z, dx: shell.dx, dz: shell.dz });
}

// A small explosion at (x, z): every target and breakable prop in reach.
function burst(sim, volley, x, z, segmentBox) {
 const r = SCATTER.burstRadius;
 const walls = sim.colliders.filter(c => !c.playerOnly && c.propId === undefined && Math.abs(c.x - x) < c.w / 2 + r + 1 && Math.abs(c.z - z) < c.d / 2 + r + 1);
 const shut = (bx, bz) => walls.some(c => segmentBox(x, z, bx, bz, c) !== null);
 const power = d => SCATTER.burstDamage * (1 - (1 - SCATTER.burstEdge) * Math.min(1, d / r));
 for (const t of sim.targets) {
  if (t.hp <= 0 || t.id === sim.player.id) continue;
  const centre = Math.hypot(t.x - x, t.z - z), d = Math.max(0, centre - targetRadius(t));
  if (d > r || (centre > .3 && shut(t.x, t.z))) continue;
  deal(sim, t, volley, Math.max(1, Math.round(power(d))), { blast: true, vx: t.x - x, vz: t.z - z });
 }
 for (const prop of sim.props) {
  if (prop.hp === null || !(prop.hp > 0)) continue;
  const d = Math.max(0, Math.hypot(prop.x - x, prop.z - z) - Math.min(prop.w || 0, prop.d || 0) / 2);
  if (d <= r) sim.hitProp(prop, { damage: Math.round(power(d)), x: prop.x, z: prop.z, vx: prop.x - x, vz: prop.z - z });
 }
 // Crops in reach catch fire (owner, v144), behind no wall, like a grenade's.
 cropCircle(sim, { x, z }, r, false, (a, b) => !shut(b.x, b.z));
 sim.events.push({ type: 'scatterBurst', x, z, radius: r });
}

// Every tick, whatever the weapon (shells in flight keep flying).
export function stepScatter(sim, input, dt, { segmentBox, segmentCircle }) {
 const s = sim.scatter, p = sim.player;
 if (sim.predictOnly) return; // a joiner's copy: the host fires it
 if (sim.dev.cooldowns) s.cooldown = 0;
 s.cooldown = Math.max(0, s.cooldown - dt);
 const alive = p.hp > 0 && !p.dead;
 if (s.armed && (!alive || sim.weapon !== 'shotgun')) s.armed = false;
 if (s.armed) {
  const was = s.armedFor || 0; s.armedFor = was + dt;
  if (was < SCATTER.prime && s.armedFor >= SCATTER.prime) sim.events.push({ type: 'scatterPrimed', x: p.x, z: p.z });
 } else s.armedFor = 0;
 if (input.scatter && alive && sim.weapon === 'shotgun') {
  if (s.armed) { if (scatterPrimed(sim)) launch(sim); }
  else if (scatterReady(sim)) { s.armed = true; s.armedFor = 0; sim.events.push({ type: 'scatterArm', x: p.x, z: p.z }); }
 }
 if (!sim.scatterShells.length) return;
 const born = [];
 const list = sim.scatterShells; sim.scatterShells = born;
 for (const b of list) {
  // The first stretch runs from the body to the muzzle point (so a shell
  // fired into a wall at point blank still meets it).
  const step = Math.min(b.speed * dt, b.limit - b.travel), ex = b.x + b.dx * step, ez = b.z + b.dz * step;
  let first = 1, target = null, prop = null, blocked = false;
  for (const c of sim.colliders) { if (c.playerOnly) continue; const t = segmentBox(b.x, b.z, ex, ez, c, .04); if (t !== null && t <= first) { first = t; target = null; prop = sim.props.find(v => v.id === c.propId); blocked = true; } }
  for (const t of sim.targets) {
   if (t.hp <= 0 || t.id === b.skip || t.id === p.id) continue;
   const f = segmentCircle(b.x, b.z, ex, ez, t.x, t.z, targetRadius(t) + (b.big ? .12 : .05));
   if (f !== null && f < first) { first = f; target = t; prop = null; blocked = true; }
  }
  // Stop a hair short of what it hit.
  const back = blocked ? Math.max(0, first - .04 / Math.max(step, 1e-6)) : 1;
  b.x += (ex - b.x) * back; b.z += (ez - b.z) * back; b.travel += step * back;
  if (target) {
   deal(sim, target, b.volley, b.big ? SCATTER.bigDamage : SCATTER.childDamage, { bullet: true, vx: b.dx, vz: b.dz });
   sim.events.push({ type: 'scatterHit', x: b.x, z: b.z, big: b.big });
  } else if (prop) sim.hitProp(prop, { damage: b.big ? SCATTER.bigDamage : SCATTER.childDamage, owner: p.id, x: b.x, z: b.z, vx: b.dx, vz: b.dz });
  const done = blocked || b.travel >= b.limit - 1e-6;
  if (!done) { born.push(b); continue; }
  if (b.big) split(sim, b, b.x, b.z, !!target);
  else burst(sim, b.volley, b.x, b.z, segmentBox);
 }
 // (split() pushed the new small shells onto `born` via sim.scatterShells.)
}
