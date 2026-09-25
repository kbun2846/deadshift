import {recordBallastDamage} from './weapons/ballast-damage.js';
import {isPlayable,confinePlayableMovement} from './playable-area.js';
import {resetShotgun,stepShotgun,SHOTGUN} from './weapons/shotgun.js';
import { mapColliders, mapProps, buildingContains, buildingWalls } from './maps.js';
import { cropSegments, cropPoint, affectCrop, cropCircle, stepCrops } from './crops.js';
import { RIFLE, resetRifle, stepRifle } from './weapons/rifle.js';
import { targetRadius } from './target-radius.js';
export { targetRadius };
import { resetGrenades, stepGrenades } from './weapons/grenade.js';
import { resetSurge, stepSurge, endSurge, SURGE } from './weapons/surge.js';
import { resetScatter, stepScatter } from './weapons/scatter.js';
import { autoRangeDistance, AUTO_RANGE } from './auto-range.js';
import { assistAim, clearAssist } from './aim-assist.js';
import { AIM_ASSIST } from './config/gameplay.js';
const AIM_ASSIST_RANGE = Math.max(...Object.values(AIM_ASSIST).map(l => l.maxRange));
// Tunable numbers live in config/gameplay.js; re-exported so existing imports keep working.
import { ORB_LAUNCH, RULES, ORB_DAMAGE_MULTIPLIER, ORB_VOLLEY_TOTALS, SPLASH, VOLLEY_BOOST, MOUSE_VOLLEY_ASSIST, HEX_BASE_PULSE, HEX_BASE_ZAP, HEX_ZAP_BONUS, HEX_DAMAGE_MULTIPLIER, boostedHexDamage } from './config/gameplay.js';
import { usesTrigger } from './items.js';

// Each trigger weapon's own tick (fire, reload, its extras). Static's orbs,
// hex and stream run inline in step() below. A new weapon adds its line here.
const WEAPON_STEPS = { rifle: stepRifle, shotgun: stepShotgun };
export { RULES, ORB_DAMAGE_MULTIPLIER, ORB_VOLLEY_TOTALS, SPLASH };



export const damagePerOrb = count => {
 const n=Math.max(1,Math.min(12,count));
 // Above three orbs, budget direct impact + the central blast together.
 return n<=3?Math.round(8+16*((n-1)/11)**1.5)*ORB_DAMAGE_MULTIPLIER:(ORB_VOLLEY_TOTALS[n]-explosionFor(n).damage)/n;
};
export const launchDistance = time => ORB_LAUNCH.top*time-(ORB_LAUNCH.top-ORB_LAUNCH.start)*ORB_LAUNCH.ramp*(1-Math.exp(-time/ORB_LAUNCH.ramp));
export function launchDuration(distance) {
  let low=0,high=distance/ORB_LAUNCH.start+.18;
  for(let i=0;i<28;i++){const mid=(low+high)/2;if(launchDistance(mid)<distance)low=mid;else high=mid;}
  return Math.max(.08,high);
}
// Preserve the original range rounding, then apply the volley buff exactly.
export const rangedOrbDamage = (base,distance,multiplier=ORB_DAMAGE_MULTIPLIER) => multiplier===0?base:Math.round(base/multiplier*(1+.2*Math.max(0,Math.min(1,(distance-6)/18))))*multiplier;
export function hexPower(distance) {
  const maturity = Math.max(0, Math.min(1, distance / 6));
  return { radius: .28 + (RULES.hexPulseRadius - .28) * maturity,
    damage: boostedHexDamage(Math.round(10 + (HEX_BASE_PULSE - 10) * maturity * maturity)),
    reach: .55 + (RULES.hexReach - .55) * maturity,
    zapDamage: boostedHexDamage(Math.round(6 + (HEX_BASE_ZAP - 6) * maturity)) + HEX_ZAP_BONUS };
}
export function hexPulseDamageAt(power, distance) {
  if (distance > power.radius + 1e-8) return 0;
  const accuracy = Math.max(0, 1 - Math.max(0, distance) / power.radius);
  const baseDamage=Math.round(power.damage / HEX_DAMAGE_MULTIPLIER);
  return boostedHexDamage(Math.round(baseDamage * (.25 + .75 * accuracy * accuracy)));
}
export function splashFalloff(distance, radius, count = 0) {
  if (!(radius > 0) || distance > radius) return 0;
  const heavy = Math.max(0, Math.min(1, (count - SPLASH.heavyFrom) / (SPLASH.heavyFull - SPLASH.heavyFrom)));
  return (1 - (1 - SPLASH.edge) * distance / radius) * (1 + SPLASH.heavyCore * heavy);
}

export function explosionFor(count) {
  if (count < 2) return null;
  const power = (Math.min(12, count) - 2) / 10;
  const n=Math.min(12,count);
  const extraScale=Math.sqrt(Math.max(1,count/12));
  return { radius: (.55 + power * 2.15) * (count >= 12 ? 1.12 : 1)*extraScale, damage: (n<=3?(6+power*54)*1.15:30+170*((n-4)/8)**1.15)*(145/200)*extraScale*VOLLEY_BOOST };
}

export function inside(point, box, padding = 0) {
  if(box.angle && box.localW!==undefined){const c=Math.cos(box.angle),s=Math.sin(box.angle),x=point.x-box.x,z=point.z-box.z;return Math.abs(x*c-z*s)<box.localW/2+padding&&Math.abs(x*s+z*c)<box.localD/2+padding;}
  return Math.abs(point.x - box.x) < box.w / 2 + padding && Math.abs(point.z - box.z) < box.d / 2 + padding;
}

// First intersection along a segment; prevents fast volleys passing through thin walls.
export function segmentBox(ax, az, bx, bz, box, radius = 0) {
  if (box.angle && box.localW !== undefined) return segmentLocalBox(ax, az, bx, bz, box, radius);
  return segmentSlab(ax, az, bx, bz, box.x, box.z, box.w, box.d, radius);
}
// Rotated boxes: the segment into the box's own frame (no object made).
function segmentLocalBox(ax, az, bx, bz, box, radius) {
  const c = Math.cos(box.angle), s = Math.sin(box.angle), x = ax - box.x, z = az - box.z, u = bx - box.x, v = bz - box.z;
  return segmentSlab(x * c - z * s, x * s + z * c, u * c - v * s, u * s + v * c, 0, 0, box.localW, box.localD, radius);
}
// The two slabs written out: this runs for every bullet, orb and hex side
// against every nearby box each step, so it allocates nothing.
function segmentSlab(ax, az, bx, bz, x, z, w, d, radius) {
  let near = 0, far = 1;
  const dx = bx - ax, dz = bz - az;
  const minX = x - w / 2 - radius, maxX = x + w / 2 + radius, minZ = z - d / 2 - radius, maxZ = z + d / 2 + radius;
  if (Math.abs(dx) < 1e-8) { if (ax < minX || ax > maxX) return null; }
  else {
    const p = (minX - ax) / dx, q = (maxX - ax) / dx;
    near = Math.max(near, Math.min(p, q)); far = Math.min(far, Math.max(p, q));
    if (near > far) return null;
  }
  if (Math.abs(dz) < 1e-8) { if (az < minZ || az > maxZ) return null; }
  else {
    const p = (minZ - az) / dz, q = (maxZ - az) / dz;
    near = Math.max(near, Math.min(p, q)); far = Math.min(far, Math.max(p, q));
    if (near > far) return null;
  }
  return near;
}

export function segmentCircle(ax, az, bx, bz, cx, cz, radius) {
  const dx = bx - ax, dz = bz - az, ox = ax - cx, oz = az - cz;
  const a = dx * dx + dz * dz, c = ox * ox + oz * oz - radius * radius;
  if (c <= 0) return 0;
  if (a < 1e-10) return null;
  const b = 2 * (ox * dx + oz * dz), disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  return t >= 0 && t <= 1 ? t : null;
}

// Is (x, z) inside a hex shield (Simulation.hexShield)? Six sides, or round
// while it spins after the pulse.
export function insideShield(sh, x, z) {
  const dx = x - sh.x, dz = z - sh.z;
  if (sh.round) return Math.hypot(dx, dz) <= sh.limit / Math.cos(Math.PI / 6);
  for (let i = 0; i < 6; i++) { const a = (i + .5) * Math.PI / 3 + sh.rotation; if (dx * Math.cos(a) + dz * Math.sin(a) > sh.limit + 1e-7) return false; }
  return true;
}

export class Simulation {
  constructor(map) {
    this.dev = {}; this.map = map; this.colliders = mapColliders(map);
    // Online only: where the other players stand ({x, z}, optional hp), as
    // this simulation should see them this tick. The host fills it from its
    // own sims, a joiner from the latest snapshot. Offline it stays empty.
    // Players are solid to each other: you stop against them like a target.
    this.otherPlayers = [];
    // Offline (and on the multiplayer host's world sim) this simulation owns
    // the shared world: crops burn and prop flashes fade here. Online every
    // player's sim shares one world, so only the arena steps it (arena.js).
    this.worldAuthority = true;
    this.reset();
  }
  // The map's practice targets, fresh (none when `noTargets`: a 1V1).
  practiceTargets() {
    if (this.noTargets) return [];
    return this.map.targets.map(t => {
      const maxHp = t.maxHp ?? (t.kind === 'dummy' ? RULES.dummyHealth : RULES.targetHealth);
      return { ...t, baseX: t.x, spawnX: t.x, spawnZ: t.z, hp: maxHp, maxHp, respawn: 0, flash: 0 };
    });
  }
  // How close another player's centre can come to ours: two body radii.
  touchingPlayer() { const p = this.player, limit = RULES.radius * 2; return this.otherPlayers.some(o => !(o.hp <= 0) && Math.hypot(o.x - p.x, o.z - p.z) < limit); }

  reset() {
    this.dev.speed=1;
    resetRifle(this);resetShotgun(this);
    resetGrenades(this); resetSurge(this); resetScatter(this);
    this.time = 0; this.serial = 0; this.volley = 0; this.shots = []; this.hexOrbs = []; this.hexSpin = null; this.hexCooldown = 0; this.events = [];
    this.player = this.freshPlayer('local', this.map.spawn);
    this.targets = this.practiceTargets();
    this.stats = { kills: 0, bestVolley: 0, hits: 0, launched: 0 };
    this.props = mapProps(this.map).map(p => ({ ...p, hp: p.health, flash: 0 }));
    this.colliders = mapColliders(this.map); this.stats.propsDestroyed = 0;
    this.volleyKills = new Map(); this.volleys = new Map(); this.seedCooldown = 0;
    this.ammo = RULES.maxSeeds; this.rechargeProgress = 0; this.rechargeWait = 0; this.firstRefill = false;
    this.spray = { active: false, warmup: 0, credit: 0, exhausted: false, effectClock: 0, volley: 0 };
    this.crops = cropSegments(this.map);
  }

  // A new player body at full health. Stamina is filled after the player
  // exists, because maxStamina reads this.weapon and the constructor calls
  // reset() before any weapon has been chosen — which is why a fresh Nominal
  // sim used to start on two charges instead of three.
  freshPlayer(id, at) {
    const player = { id, team: 0, x: at.x, z: at.z, vx: 0, vz: 0, aimX: 1, aimZ: 0, hp: RULES.playerHealth, maxHp: RULES.playerHealth,
      dodgeRemaining: 0, stamina: 0, staminaWait: 0, dodgeX: 0, dodgeZ: 0, dead:false, blastVX:0, blastVZ:0, ballastLaunch:false };
    this.player = player; player.stamina = this.maxStamina;
    return player;
  }

  // Online: back into the world after dying or picking a weapon. A fresh body
  // and a full loadout, but the world (props, crops, the clock) is untouched.
  respawn(at, id = this.player.id) {
    resetRifle(this); resetShotgun(this); resetGrenades(this); resetSurge(this, true); resetScatter(this, true);
    this.shots = []; this.hexOrbs = []; this.hexSpin = null; this.hexCooldown = 0;
    this.volleyKills = new Map(); this.volleys = new Map(); this.seedCooldown = 0;
    this.ammo = RULES.maxSeeds; this.rechargeProgress = 0; this.rechargeWait = 0; this.firstRefill = false;
    this.spray = { active: false, warmup: 0, credit: 0, exhausted: false, effectClock: 0, volley: 0 };
    return this.freshPlayer(id, at);
  }

  get seeds() { return this.shots.filter(s => !s.launched); }
  // One dodge per weapon; Ballast gets two (owner's call, v0.83).
  get maxStamina(){return this.weapon==='shotgun'?SHOTGUN.dodges:RULES.maxStamina;}
  // Nominal has no self-movement of its own, so holding a position is the one
  // thing it trades for. Standing still pays it back in dodges, matching the
  // stationary bonus Static already gets on its ammo pool.
  get staminaRate(){return this.weapon==='rifle'&&Math.hypot(this.player.vx,this.player.vz)<.15?RIFLE.stationaryStamina:1;}
  get rechargeRate() { return Math.hypot(this.player.vx, this.player.vz) < .15 ? RULES.stationaryRecharge : 1; }
  get rechargeInterval() { return RULES.rechargeInterval / (this.firstRefill ? 1.4 : 1); }
  get interior() { return this.map.buildings.find(b => buildingContains(b, this.player)) || null; }
  // The building (x, z) is inside, or null (target lock: a target going indoors).
  buildingAt(x, z) { return this.map.buildings.find(b => buildingContains(b, { x, z })) || null; }
  // Is anything solid that is not breakable (walls, buildings, fences, rocks;
  // not crates, barrels or other props) between (ax, az) and (bx, bz)?
  obstacleBetween(ax, az, bx, bz) {
    for (const c of this.colliders) {
      if (c.playerOnly || c.propId !== undefined || c.walkOver) continue;
      if (segmentBox(ax, az, bx, bz, c, .05) !== null) return true;
    }
    return false;
  }
  get roofId() { return this.interior?.id ?? null; }
  get playerHitRadius() { return this.player.dodgeRemaining > 0 ? RULES.dodgeHitRadius : RULES.radius; }

  canAimAt(x, z) {
    const room = this.interior;
    if (!room || buildingContains(room, { x, z })) return true;
    return !buildingWalls(room).some(b => !b.playerOnly && segmentBox(this.player.x, this.player.z, x, z, b, .09) !== null);
  }

  // Targets aim assist may use: near enough to matter, then only those the
  // player can see (the cheap range check first; sight rays are the cost).
  assistTargets() {
    const p = this.player, reach = AIM_ASSIST_RANGE;
    return this.targets.filter(t => !t.friendly && !(t.hp !== undefined && t.hp <= 0) && Math.hypot(t.x - p.x, t.z - p.z) <= reach && this.canSeeTarget(t.x, t.z));
  }

  // Can the player actually see something standing at (x, z)? Not if it is
  // under a roof (inside a building the player is not in: its roof is down),
  // not through a wall from indoors (only out through doors and windows, the
  // same sight lines the dark interior shading shows), and not behind cover
  // that blocks sight outdoors. Aim assist and target lock only use what
  // passes this.
  canSeeTarget(x, z, radius = .2) {
    const room = this.map.buildings.find(b => buildingContains(b, { x, z }));
    if (room && room !== this.interior) return false;
    return this.canSeeEntity(x, z, radius);
  }

  canSeeEntity(x, z, radius=.5, includeInterior=true) {
    if(includeInterior&&!this.canAimAt(x,z))return false;
    const dx=x-this.player.x,dz=z-this.player.z,length=Math.hypot(dx,dz)||1;
    // An exposed shoulder is visible even when the center ray clips a cover edge.
    // Use body samples only for outdoor cover; interior cone rules remain strict.
    return [0,-radius,radius].some(offset=>{
      const px=x-dz/length*offset,pz=z+dx/length*offset;
      return (!includeInterior||this.canAimAt(px,pz))&&!this.sightBlocked(this.player.x,this.player.z,px,pz);
    });
  }

  // Does cover that blocks sight cross the segment? Only the sight blockers
  // (a handful of the hundreds of colliders), each rejected by its world
  // bounds (w, d are the axis-aligned extents, rotated or not) before the slab
  // test. Target lock and aim assist ask this three rays per target per step.
  sightBlocked(ax, az, bx, bz) {
    let cache = this.sightBlockers;
    if (!cache || cache.colliders !== this.colliders || cache.length !== this.colliders.length)
      cache = this.sightBlockers = { colliders: this.colliders, length: this.colliders.length, list: this.colliders.filter(c => c.blocksSight) };
    const x0 = Math.min(ax, bx), x1 = Math.max(ax, bx), z0 = Math.min(az, bz), z1 = Math.max(az, bz);
    for (const b of cache.list) {
      if (b.x + b.w / 2 < x0 || b.x - b.w / 2 > x1 || b.z + b.d / 2 < z0 || b.z - b.d / 2 > z1) continue;
      if (segmentBox(ax, az, bx, bz, b, 0) !== null) return true;
    }
    return false;
  }

  step(input, dt = RULES.step) {
    if(this.player.hp<=0)this.killPlayer();
    // Dev "freeze game": the world stops (shots, orbs, grenades, pellets and
    // shells hang in the air, timers and targets hold, crops stop burning)
    // and only you move: walking, dodging, aiming. Your weapon is held too.
    const frozen=!!this.dev.freeze;
    if(frozen)input={moveX:input.moveX,moveZ:input.moveZ,aimX:input.aimX,aimZ:input.aimZ,aimPointX:input.aimPointX,aimPointZ:input.aimPointZ,autoRange:input.autoRange,smoothAim:input.smoothAim,dodge:input.dodge};
    if(usesTrigger(this.weapon))input={...input,spray:false,hex:false,seed:false,launch:false};
    if (this.worldAuthority && !frozen) stepCrops(this, dt, (a, b) => !this.colliders.some(c => !c.playerOnly && segmentBox(a.x, a.z, b.x, b.z, c) !== null));
    // Dead: what you already fired keeps flying and landing (blast shells,
    // grenades, bullets, pellets); you do nothing new.
    if(this.player.dead){const idle={aimX:this.player.aimX,aimZ:this.player.aimZ};if(!this.dev.freeze){stepScatter(this,idle,dt,{segmentBox,segmentCircle});stepGrenades(this,idle,dt,segmentBox);if(this.weapon!=='static')WEAPON_STEPS[this.weapon]?.(this,idle,dt,{segmentBox,segmentCircle});}return;}
    if(this.dev.ammo||this.dev.orbs)this.ammo=RULES.maxSeeds; if(this.dev.cooldowns)this.hexCooldown=0; if(this.dev.stamina)this.player.stamina=this.maxStamina;
    // Dev max health: the bar keeps its share when the maximum changes.
    { const want=this.dev.maxHealth||RULES.playerHealth,p=this.player; if(this.dev.maxHealth!=null&&p.maxHp!==want&&p.hp>0){p.hp=Math.max(1,Math.round(p.hp/p.maxHp*want));p.maxHp=want;} }
    // Dev regenerate: back to full over a couple of seconds.
    if(this.dev.regen&&this.player.hp>0)this.player.hp=Math.min(this.player.maxHp,this.player.hp+this.player.maxHp*.5*dt);
    if(!frozen){this.time += dt; this.hexCooldown = Math.max(0, this.hexCooldown - dt);}
    if (this.hexCooldown < 1e-8) this.hexCooldown = 0;
    const p = this.player;
    if (!input.spray || input.dodge || p.hp <= 0 || p.dodgeRemaining > 0) {
      this.spray.active = false; this.spray.credit = 0; this.spray.exhausted = !!input.spray;
      this.spray.contacts?.clear();
    } else if (!this.spray.active && !this.spray.exhausted && this.ammo > 0) {
      this.spray = { active: true, warmup: RULES.sprayWarmup, credit: 0, exhausted: false, effectClock: 0, volley: ++this.volley };
      this.events.push({ type: 'sprayStart', x: p.x, z: p.z });
    }
    const wasDodging = p.dodgeRemaining > 0;
    p.dodgeRemaining = Math.max(0, p.dodgeRemaining - dt);
    const staminaWaiting = Math.min(dt, p.staminaWait); p.staminaWait -= staminaWaiting;
    p.stamina = Math.min(this.maxStamina, p.stamina + (dt - staminaWaiting) * this.staminaRate / RULES.staminaRecharge);
    const length = Math.hypot(input.moveX || 0, input.moveZ || 0);
    const ix = length ? (input.moveX || 0) / Math.max(1, length) : 0;
    const iz = length ? (input.moveZ || 0) / Math.max(1, length) : 0;
    const moveSpeed=RULES.speed*(input.aiming?RIFLE.aimMoveMultiplier:1)*(this.surge?.active?SURGE.speed:1);
    if (wasDodging && !p.dodgeRemaining) { p.vx = ix * moveSpeed; p.vz = iz * moveSpeed; }
    // A dodge pressed a moment too early (still mid-dodge, or a charge just
    // short) is held for RULES.dodgeBuffer and happens the instant it can,
    // instead of being dropped.
    p.dodgeQueued = input.dodge ? RULES.dodgeBuffer : Math.max(0, (p.dodgeQueued || 0) - dt);
    if (p.dodgeQueued > 0 && !p.dodgeRemaining && p.stamina + 1e-8 >= RULES.dodgeStaminaCost && p.hp > 0) {
      p.dodgeQueued = 0;
      // Movement input first, then whatever momentum is left, and failing both
      // the way the player is facing: standing still and hitting dodge used to
      // do nothing at all, which reads as the input being dropped.
      const speed = Math.hypot(p.vx, p.vz);
      const dx = length ? ix : speed > .5 ? p.vx / speed : p.aimX, dz = length ? iz : speed > .5 ? p.vz / speed : p.aimZ;
      const magnitude = Math.hypot(dx, dz);
      if (magnitude > .01) {
        p.dodgeX = dx / magnitude; p.dodgeZ = dz / magnitude;
        p.dodgeRemaining = RULES.dodgeDuration; p.stamina = Math.max(0, p.stamina - RULES.dodgeStaminaCost); p.staminaWait = RULES.staminaDelay;
        this.events.push({ type: 'dodge', x: p.x, z: p.z });
      }
    }
    const smooth = 1 - Math.exp(-(length ? RULES.acceleration : RULES.braking) * dt);
    // Absorb most recoil while deliberately retreating; idle/forward fire still kicks.
    const retreat = Math.max(0, -(ix * p.aimX + iz * p.aimZ));
    const recoil = this.spray.active && this.spray.warmup <= 0 ? RULES.sprayRecoil * (1 - .94 * retreat) : 0;
    p.vx += (ix * moveSpeed * (this.dev.speed||1) - p.aimX * recoil - p.vx) * smooth;
    p.vz += (iz * moveSpeed * (this.dev.speed||1) - p.aimZ * recoil - p.vz) * smooth;
    if (p.dodgeRemaining > 0) {
      const age = RULES.dodgeDuration - p.dodgeRemaining, end = Math.min(RULES.dodgeDuration, age + dt);
      const distance = RULES.dodgeDistance / RULES.dodgeDuration * ((end - age) + .4 * RULES.dodgeDuration / Math.PI * (Math.sin(Math.PI * end / RULES.dodgeDuration) - Math.sin(Math.PI * age / RULES.dodgeDuration)));
      p.vx = p.dodgeX * distance / dt; p.vz = p.dodgeZ * distance / dt;
    }
    // Aim assist (aim-assist.js) bends the asked-for direction toward a locked
    // target; mouse aim (autoRange false) goes through untouched.
    const hasAim = Math.hypot(input.aimX, input.aimZ) > .001;
    if (!input.autoRange || !hasAim) clearAssist(p);
    if (hasAim) {
      const desired = input.autoRange ? assistAim(p, this.assistTargets(), Math.atan2(input.aimZ, input.aimX), input.autoRange) : Math.atan2(input.aimZ, input.aimX), current = Math.atan2(p.aimZ, p.aimX);
      const delta = Math.atan2(Math.sin(desired - current), Math.cos(desired - current));
      const limit = this.spray.active ? RULES.sprayTurnRate * dt : Math.PI;
      // Ease digital aim along the shortest arc, keeping shots and the model aligned.
      let turn = delta;
      if (input.smoothAim) {
        // Direction-only aim turns with a little weight: its turn speed eases up
        // rather than jumping, and never overshoots the direction asked for.
        const wanted = Math.max(-RULES.keyboardAimMaxTurn, Math.min(RULES.keyboardAimMaxTurn, delta * RULES.keyboardAimResponse));
        p.aimSpin = (p.aimSpin || 0) + (wanted - (p.aimSpin || 0)) * (1 - Math.exp(-RULES.keyboardAimSpinUp * dt));
        turn = p.aimSpin * dt;
        if (turn * delta < 0) { turn = 0; p.aimSpin = 0; }
        else if (Math.abs(turn) > Math.abs(delta)) { turn = delta; p.aimSpin = 0; }
      } else p.aimSpin = 0;
      const angle = current + Math.max(-limit, Math.min(limit, turn)); p.aimX = Math.cos(angle); p.aimZ = Math.sin(angle);
    }
    const blastDecay=Math.exp(-8*dt),blastTravel=(1-blastDecay)/8;
    this.movePlayer(p.vx*dt+p.blastVX*blastTravel,p.vz*dt+p.blastVZ*blastTravel);
    p.blastVX*=blastDecay;p.blastVZ*=blastDecay;
    if(Math.hypot(p.blastVX,p.blastVZ)<1)p.ballastLaunch=false;
    if(Math.hypot(p.blastVX,p.blastVZ)<.01)p.blastVX=p.blastVZ=0;
    // Direction-only aim (arrow keys, walking on touch) reaches whatever it
    // points at instead of a fixed distance; see auto-range.js.
    // Aim assist for direction-only aim helps with distance and nothing else:
    // the aim point stays on the line the player chose and slides, unhurried,
    // out or in to whatever that line points at. Mouse aim never gets it.
    // With a lock, the reach slides to the target (a finger's own point is
    // overridden: the assist has decided what it is aiming at). Without one, a
    // finger or cursor point is used as given, and direction-only aim reaches
    // the default distance.
    const lock = input.autoRange && p.assistTargetId != null ? this.targets.find(t => t.id === p.assistTargetId) : null;
    p.autoTargetId = lock ? lock.id : null;
    const pointed = Number.isFinite(input.aimPointX) && Number.isFinite(input.aimPointZ);
    const assistedReach = input.autoRange && (lock || !pointed);
    const wantedReach = lock ? autoRangeDistance(p, lock) : RULES.focusDistance;
    if (!assistedReach) p.aimReach = pointed ? Math.hypot(input.aimPointX - p.x, input.aimPointZ - p.z) : RULES.focusDistance;
    else p.aimReach = (p.aimReach ?? RULES.focusDistance) + (wantedReach - (p.aimReach ?? RULES.focusDistance)) * (1 - Math.exp(-dt / AUTO_RANGE.settle));
    const usePoint = pointed && !lock;
    p.aimPointX = usePoint ? input.aimPointX : p.x + p.aimX * p.aimReach;
    p.aimPointZ = usePoint ? input.aimPointZ : p.z + p.aimZ * p.aimReach;
    if(frozen)return;
    stepSurge(this,input,dt,{breakAround:(x,z,r)=>this.breakAround(x,z,r)});
    stepScatter(this,input,dt,{segmentBox,segmentCircle});
    stepGrenades(this,input,dt,segmentBox);
    WEAPON_STEPS[this.weapon]?.(this,input,dt,{segmentBox,segmentCircle});
    this.recharge(dt);
    this.seedCooldown -= dt;
    if (this.worldAuthority) for (const prop of this.props) prop.flash = Math.max(0, prop.flash - dt);
    // (No auto-range means a mouse: the volley's light pull, MOUSE_VOLLEY_ASSIST.)
    if (input.launch && !this.spray.active) this.launch(input.launchPointX, input.launchPointZ, input.quickShot, !input.autoRange);
    if (input.hex && !this.spray.active) this.hex();
    this.stepHex(dt);
    if (input.seed && !this.spray.active && this.seedCooldown <= 0 && this.ammo > 0 && (this.dev.orbs || this.seeds.length < RULES.maxSeeds)) this.seed();
    for (const t of this.targets) {
      t.flash = Math.max(0, t.flash - dt);
      if (t.respawn > 0) {
        t.respawn -= dt;
        if (t.respawn <= 0) { t.hp = t.maxHp; t.bulletHits = 0; t.x = t.baseX = t.spawnX; t.z = t.spawnZ; this.events.push({ type: 'respawn', x: t.x, z: t.z }); }
      }
      if (t.moving && t.hp > 0 && !this.dev.freezeTargets) t.x = t.baseX + Math.sin(this.time * .72) * t.travel;
    }
    // Moving and freshly respawned targets also separate from an idle player.
    if(this.targets.some(t=>t.hp>0&&Math.hypot(t.x-p.x,t.z-p.z)<RULES.radius+targetRadius(t))||this.touchingPlayer())this.movePlayer(0,0);
    this.stepSpray(dt);
    for (const s of this.shots) {
      const travel = s.launched ? Math.max(0, Math.min(dt, s.travelDuration - s.age)) : dt;
      s.age += dt;
      let nx = s.x + s.vx * travel, nz = s.z + s.vz * travel;
      if(s.launched && s.launchX!==undefined){
        const t=Math.min(s.age,s.travelDuration),progress=Math.min(1,launchDistance(t)/launchDistance(s.travelDuration));
        nx=s.launchX+(s.targetX-s.launchX)*progress;nz=s.launchZ+(s.targetZ-s.launchZ)*progress;
        const speed=(ORB_LAUNCH.top-(ORB_LAUNCH.top-ORB_LAUNCH.start)*Math.exp(-t/ORB_LAUNCH.ramp))/launchDistance(s.travelDuration);
        s.vx=(s.targetX-s.launchX)*speed;s.vz=(s.targetZ-s.launchZ)*speed;
      }
      let first = 2, target = null, prop = null, aimedTarget = false;
      // Breakable scenery does not stop a launched orb outright: the orb pays
      // for it out of a pierce budget worth one orb. Clearing something costs
      // its remaining health, so a barrel is punched through and the orb carries
      // on lighter. What it can no longer pay for in full takes whatever is left
      // and stops it there. Nearest first, so the order is the order it meets them.
      const pierced = s.launched ? [] : null;
      const seen = s.launched ? new Set() : null;
      for (const box of this.colliders) {
        if (box.playerOnly) continue;
        if (s.launched && box.destructible) {
          const t = segmentBox(s.x, s.z, nx, nz, box, .09);
          // A prop can carry several collision boxes; the nearest one is its contact.
          if (t !== null && !seen.has(box.propId)) { seen.add(box.propId); pierced.push({ t, id: box.propId }); }
          continue;
        }
        const t = segmentBox(s.x, s.z, nx, nz, box, .09);
        if (t !== null && t < first) { first = t; target = null; prop = this.props.find(p => p.id === box.propId) || null; }
      }
      for (const candidate of this.targets) {
        if (candidate.hp <= 0 || candidate.friendly) continue;
        // Intent is measured against the aim point, not the overshot one.
        const aimedInside = s.launched && Math.hypot(s.focusX - candidate.x, s.focusZ - candidate.z) <= .66;
        if (aimedInside && s.age + 1e-8 < s.travelDuration) continue;
        const t = aimedInside ? 1 : segmentCircle(s.x, s.z, nx, nz, candidate.x, candidate.z, .66);
        if (t !== null && t < first) { first = t; target = candidate; prop = null; aimedTarget = aimedInside; }
      }
      let spent = null;
      if (pierced) {
        pierced.sort((a, b) => a.t - b.t);
        for (const { t, id } of pierced) {
          if (t >= first) break;
          const broken = this.props.find(item => item.id === id);
          if (!broken || broken.hp <= 0) continue;
          const paid = Math.min(s.pierceBudget, broken.hp);
          const stops = broken.hp > s.pierceBudget;
          this.hitProp(broken, { electric: true, damage: paid, x: broken.x, z: broken.z, vx: s.vx, vz: s.vz });
          s.pierceBudget -= paid;
          if (stops || s.pierceBudget <= 1e-8) { spent = t; break; }
        }
      }
      // Out of budget: the orb ends at the thing it could not get through.
      if (spent !== null) {
        s.x += (nx - s.x) * spent; s.z += (nz - s.z) * spent;
        s.dead = true;
        this.events.push({ type: 'impactMark', x: s.x, z: s.z, vx: s.vx, vz: s.vz, fromX: s.launchX, fromZ: s.launchZ });
      } else if (first <= 1) {
        s.x += (nx - s.x) * first; s.z += (nz - s.z) * first;
        if (s.launched) s.damage = aimedTarget ? this.orbVolleyDamage(s) : s.strayDamage;
        s.dead = true;
        if (s.launched) this.events.push({ type: 'impactMark', x: s.x, z: s.z, vx: s.vx, vz: s.vz, fromX: s.launchX, fromZ: s.launchZ });
        if (target && s.launched) this.hit(target, s);
        else if (prop && prop.health !== null && s.launched) this.hitProp(prop, s);
        else this.events.push({ type: 'wall', x: s.x, z: s.z, launched: s.launched });
      } else { s.x = nx; s.z = nz; }
      if (s.launched && !s.dead && s.age + 1e-8 >= s.travelDuration) {
        s.x = s.targetX; s.z = s.targetZ; s.dead = true;
        if(s.wallFocus){
          this.events.push({type:'impactMark',x:s.x,z:s.z,vx:s.vx,vz:s.vz});
          this.events.push({type:'wall',x:s.x,z:s.z,launched:true});
        }
        this.events.push({ type: 'pointImpact', x: s.x, z: s.z, fromX: s.launchX, fromZ: s.launchZ });
      }
      if (!s.launched && s.age > RULES.seedLife && !this.dev.orbs) s.dead = true;
      if (Math.abs(s.x) > this.map.width / 2 || Math.abs(s.z) > this.map.depth / 2) s.dead = true;
      if (s.dead && s.launched) {
        this.events.push({ type: 'trailEnd', id: s.id, x: s.x, z: s.z });
        const volley = this.volleys.get(s.volley);
        volley.remaining--;
        if (Math.hypot(s.x - s.targetX, s.z - s.targetZ) < 1e-5) volley.arrived++;
      }
    }
    this.separateSeeds();
    this.shots = this.shots.filter(s => !s.dead);
    for (const [id, volley] of this.volleys) if (volley.remaining === 0) {
      this.explode(volley, id); this.volleys.delete(id);
    }
    for (const id of this.volleyKills.keys()) if (!this.shots.some(s => s.volley === id)) this.volleyKills.delete(id);
  }

  // Anything breakable the player actually reaches comes apart. The same
  // overlap test the collision passes use, so it breaks exactly what it would
  // otherwise have bounced off — never something it merely passed near.
  //
  // `underfoot` is the walking case: floor clutter is stepped through and
  // crushed, because a pot that a running body passes straight through and
  // leaves standing reads as scenery painted on the floor. Solid scenery is
  // only broken by a dash, which is the deliberate act.
  crushDodged(underfoot = false) {
    const p = this.player, r = RULES.radius;
    let hit = null;
    for (const b of this.colliders) {
      if (!b.destructible) continue;
      if (underfoot && !b.walkOver) continue;
      if (Math.abs(p.x - b.x) > b.w / 2 + r || Math.abs(p.z - b.z) > b.d / 2 + r) continue;
      const angle = b.localW !== undefined ? (b.angle || 0) : 0, c = Math.cos(angle), s = Math.sin(angle);
      const px = (p.x - b.x) * c - (p.z - b.z) * s, pz = (p.x - b.x) * s + (p.z - b.z) * c;
      const left = -(b.localW ?? b.w) / 2, top = -(b.localD ?? b.d) / 2;
      const cx = Math.max(left, Math.min(-left, px)), cz = Math.max(top, Math.min(-top, pz));
      if (Math.hypot(px - cx, pz - cz) >= r - 1e-8) continue;
      const prop = this.props.find(v => v.id === b.propId);
      if (prop && prop.hp !== null && prop.hp > 0) { hit = prop; break; }
    }
    if (!hit) return;
    // Thrown the way the player was going, not away from the impact point: the
    // player is the thing doing the breaking, and the debris follows them
    // through. Walking uses velocity; a dash uses the committed roll heading,
    // which is steadier than the velocity it produces.
    const [ax, az] = underfoot ? [p.vx, p.vz] : [p.dodgeX, p.dodgeZ];
    const length = Math.hypot(ax, az) || 1;
    this.hitProp(hit, { damage: hit.hp, x: hit.x, z: hit.z,
      vx: ax / length, vz: az / length, dashed: !underfoot });
  }

  pushOutOfCircle(cx,cz,limit,previousX,previousZ){
    const p=this.player;
    let nx=p.x-cx,nz=p.z-cz,distance=Math.hypot(nx,nz);
    if(distance>=limit)return;
    if(distance<1e-8){nx=previousX-cx;nz=previousZ-cz;const length=Math.hypot(nx,nz);if(length>1e-8){nx/=length;nz/=length;}else {nx=-p.aimX;nz=-p.aimZ;}}
    else {nx/=distance;nz/=distance;}
    p.x+=nx*(limit-distance+1e-7);p.z+=nz*(limit-distance+1e-7);
    const inward=p.vx*nx+p.vz*nz;
    if(inward<0){p.vx-=inward*nx;p.vz-=inward*nz;}
  }
  movePlayer(dx, dz) {
    const p = this.player, r = RULES.radius;
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / (r * .5)));
    for (let i = 0; i < steps; i++) {
      const previousX = p.x, previousZ = p.z;
      p.x += dx / steps; p.z += dz / steps;
      confinePlayableMovement(this.map,p,previousX,previousZ,r);
      this.confineToHex(previousX, previousZ);
      // Resolved before the collision passes: a dodge takes the scenery with
      // it instead of stopping on it, so the roll keeps the line the player
      // committed to. Solid cover is untouched and still stops them dead.
      // Floor clutter breaks under an ordinary stride as well.
      // Dev "remove my player": no body in the world, so nothing to bump or break.
      if (this.dev.ghost) continue;
      if (p.dodgeRemaining > 0) this.crushDodged();
      else if (p.hp > 0) this.crushDodged(true);
      // Resolve only the local circle/rectangle penetration. In particular,
      // touching a long horizontal fence must never snap x to its far end.
      for (let pass = 0; pass < 3; pass++) {
        // Round bodies: targets, then other players online. Pushed straight
        // out along the line between centres, and any speed into them removed.
        for(const target of this.targets) if(target.hp>0)this.pushOutOfCircle(target.x,target.z,r+targetRadius(target),previousX,previousZ);
        for(const other of this.otherPlayers) if(!(other.hp<=0))this.pushOutOfCircle(other.x,other.z,r*2,previousX,previousZ);
        for (const b of this.colliders) {
        // Floor clutter is stepped over, not walked into.
        if(b.walkOver)continue;
        if(Math.abs(p.x-b.x)>b.w/2+r || Math.abs(p.z-b.z)>b.d/2+r)continue;
        const angle=b.localW!==undefined?(b.angle||0):0,c=Math.cos(angle),s=Math.sin(angle);
        const px=(p.x-b.x)*c-(p.z-b.z)*s,pz=(p.x-b.x)*s+(p.z-b.z)*c;
        const left=-(b.localW??b.w)/2,right=-left,top=-(b.localD??b.d)/2,bottom=-top;
        const cx = Math.max(left, Math.min(right, px)), cz = Math.max(top, Math.min(bottom, pz));
        let nx = px - cx, nz = pz - cz;
        const distance = Math.hypot(nx, nz);
        if (distance >= r - 1e-8) continue;
        if(b.destructible){
          const prop=this.props.find(prop=>prop.id===b.propId);
          if(prop?.hp===0)continue;
          const launching=p.ballastLaunch&&Math.hypot(p.blastVX,p.blastVZ)>=1&&dx*p.blastVX+dz*p.blastVZ>0;
          // Only actual body contact breaks props; solid cover in front still wins.
          const blocked=launching&&this.colliders.some(c=>!c.destructible&&segmentBox(previousX,previousZ,p.x,p.z,c,r)!==null);
          if(launching&&!blocked&&prop?.hp>0){
            this.hitProp(prop,{damage:prop.hp,owner:p.id,damageType:'impact',x:prop.x,z:prop.z,vx:p.blastVX,vz:p.blastVZ});
            continue;
          }
        }
        let depth;
        if (distance > 1e-8) { nx /= distance; nz /= distance; depth = r - distance; }
        else {
          const faces = [{ depth: px - left, nx: -1, nz: 0 }, { depth: right - px, nx: 1, nz: 0 },
            { depth: pz - top, nx: 0, nz: -1 }, { depth: bottom - pz, nx: 0, nz: 1 }];
          const face = faces.reduce((a, b) => a.depth < b.depth ? a : b);
          nx = face.nx; nz = face.nz; depth = face.depth + r;
        }
        const worldX=nx*c+nz*s; nz=-nx*s+nz*c; nx=worldX;
        p.x += nx * (depth + 1e-7); p.z += nz * (depth + 1e-7);
        const inward = p.vx * nx + p.vz * nz;
        if (inward < 0) { p.vx -= inward * nx; p.vz -= inward * nz; }
        }
      }
      // A wall correction must not push the caster through the electric boundary.
      if (!this.withinHex(p.x, p.z)||!isPlayable(this.map,p.x,p.z,r)) { p.x = previousX; p.z = previousZ; p.vx = p.vz = 0; }
    }
    p.x = Math.max(-this.map.width / 2 + r, Math.min(this.map.width / 2 - r, p.x));
    p.z = Math.max(-this.map.depth / 2 + r, Math.min(this.map.depth / 2 - r, p.z));
  }

  hexBoundary() {
    const orb = this.hexOrbs[0];
    if (!orb) return null;
    // Keep the original six-sided footprint even when individual vertices fizzle.
    return { x: orb.originX, z: orb.originZ, rotation: -orb.age*Math.PI*2, limit: Math.max(0, Math.min(orb.age * RULES.hexSpeed, RULES.hexRange) * Math.cos(Math.PI / 6) - RULES.radius) };
  }

  // The hex as a shield (owner, v0.9b): anyone inside a deployed hex (still
  // spreading, holding at its edge, or spinning after the pulse) takes no
  // damage from anything that comes from outside it. `shields` is every
  // hex in the game (the arena / BotMatch / main.js hand it to each sim);
  // hexShield() is this sim's own, for that list.
  hexShield() {
    const b = this.hexBoundary();
    if (b) return { ...b, limit: b.limit + RULES.radius, owner: this.player.id };
    const spin = this.hexSpin; if (!spin) return null;
    const r = Math.max(...spin.nodes.map(n => Math.hypot(n.x - spin.originX, n.z - spin.originZ)));
    return { x: spin.originX, z: spin.originZ, rotation: 0, limit: r * Math.cos(Math.PI / 6), owner: this.player.id, round: true };
  }
  shieldedFrom(x, z) {
    for (const sh of this.shields || []) {
      if (!insideShield(sh, x, z)) continue;
      if (!insideShield(sh, this.player.x, this.player.z)) return sh;
    }
    return null;
  }

  withinHex(x, z) {
    const boundary = this.hexBoundary(); if (!boundary) return true;
    for (let i = 0; i < 6; i++) {
      const angle = (i + .5) * Math.PI / 3 + boundary.rotation;
      if ((x - boundary.x) * Math.cos(angle) + (z - boundary.z) * Math.sin(angle) > boundary.limit + 1e-7) return false;
    }
    return true;
  }

  confineToHex(previousX, previousZ) {
    const boundary = this.hexBoundary(); if (!boundary) return;
    const p = this.player, dx = p.x - previousX, dz = p.z - previousZ;
    let fraction = 1;
    for (let i = 0; i < 6; i++) {
      const angle = (i + .5) * Math.PI / 3 + boundary.rotation, nx = Math.cos(angle), nz = Math.sin(angle);
      const outward = dx * nx + dz * nz;
      if (outward <= 0) continue;
      const remaining = boundary.limit - (previousX - boundary.x) * nx - (previousZ - boundary.z) * nz;
      fraction = Math.min(fraction, Math.max(0, remaining / outward));
      if (outward > remaining) {
        const velocity = p.vx * nx + p.vz * nz;
        if (velocity > 0) { p.vx -= velocity * nx; p.vz -= velocity * nz; }
      }
    }
    p.x = previousX + dx * fraction; p.z = previousZ + dz * fraction;
  }

  separateSeeds() {
    const seeds = this.shots.filter(s => !s.launched && !s.dead), diameter = RULES.orbRadius * 2;
    const push = (orb, dx, dz) => {
      const x = orb.x + dx, z = orb.z + dz;
      const blocked = this.colliders.some(b => !b.playerOnly && segmentBox(orb.x, orb.z, x, z, b, .09) !== null) ||
        this.targets.some(t => t.hp > 0 && segmentCircle(orb.x, orb.z, x, z, t.x, t.z, .66) !== null);
      if (blocked || Math.abs(x) > this.map.width / 2 || Math.abs(z) > this.map.depth / 2) {
        orb.dead = true; this.events.push({ type: 'wall', x: orb.x, z: orb.z, launched: false });
      } else { orb.x = x; orb.z = z; }
    };
    for (let pass = 0; pass < 8; pass++) for (let i = 0; i < seeds.length; i++) for (let j = i + 1; j < seeds.length; j++) {
      const a = seeds[i], b = seeds[j]; if (a.dead || b.dead) continue;
      let dx = b.x - a.x, dz = b.z - a.z, length = Math.hypot(dx, dz);
      if (length >= diameter - 1e-5) continue;
      if (length < 1e-6) { const angle = (a.id * 2.4 + b.id) % (Math.PI * 2); dx = Math.cos(angle); dz = Math.sin(angle); length = 0; }
      else { dx /= length; dz /= length; }
      const correction = (diameter - length) * .5 + .00001;
      push(a, -dx * correction, -dz * correction); push(b, dx * correction, dz * correction);
    }
  }

  seed() {
    if (this.ammo <= 0 || (!this.dev.orbs && this.seeds.length >= RULES.maxSeeds)) return;
    const p = this.player;
    let x = p.x + p.aimX * .8, z = p.z + p.aimZ * .8;
    // Alternate muzzle lanes when rapid placement would overlap a drifting orb.
    const seeds = this.seeds;
    for (const side of [0, .32, -.32, .64, -.64, .96, -.96]) {
      const sx = p.x + p.aimX * .8 - p.aimZ * side, sz = p.z + p.aimZ * .8 + p.aimX * side;
      if (seeds.some(s => Math.hypot(s.x - sx, s.z - sz) < RULES.orbRadius * 2)) continue;
      if (this.colliders.some(b => !b.playerOnly && segmentBox(p.x, p.z, sx, sz, b, .1) !== null)) continue;
      x = sx; z = sz; break;
    }
    this.seedCooldown = this.dev.fastSeeds ? 0 : RULES.seedInterval;
    if (this.colliders.some(b => !b.playerOnly && segmentBox(p.x, p.z, x, z, b, .1) !== null)) {
      this.events.push({ type: 'wall', x, z, launched: false }); return;
    }
    this.shots.push({ id: ++this.serial, owner: p.id, team: p.team, x, z,
      vx: p.aimX * RULES.driftSpeed, vz: p.aimZ * RULES.driftSpeed, age: 0, launched: false, electric: true, volley: 0 });
    if(!this.dev.ammo&&!this.dev.orbs)this.ammo--; this.firstRefill = true;
    this.events.push({ type: 'seed', x, z, count: this.seeds.length });
  }

  launch(pointX, pointZ, quickShot=false, mouseAssist=false) {
    const isQuickShot=quickShot&&!this.seeds.length;
    if(quickShot&&!this.seeds.length&&this.ammo>0){
      if(this.seedCooldown>0)return;
      this.seed();
    }
    const seeds = this.seeds;
    if (!seeds.length) { this.events.push({ type: 'cock' }); return; }
    const p = this.player;
    // Freeze the cursor/tap point at trigger time. Orbs may approach from any
    // side, each on its own straight path. They stop here and never fuse.
    let x = Number.isFinite(pointX) ? pointX : p.aimPointX ?? p.x + p.aimX * RULES.focusDistance;
    let z = Number.isFinite(pointZ) ? pointZ : p.aimPointZ ?? p.z + p.aimZ * RULES.focusDistance;
    if (mouseAssist) {
      // The nearest target (a player, robot or practice target) you can see
      // within reach of the cursor pulls it.
      let best = null, bestD = MOUSE_VOLLEY_ASSIST.radius;
      for (const t of this.targets) {
        if (t.hp <= 0 || t.friendly) continue;
        const d = Math.hypot(t.x - x, t.z - z);
        if (d < bestD && this.canSeeTarget(t.x, t.z)) { bestD = d; best = t; }
      }
      if (best) { x += (best.x - x) * MOUSE_VOLLEY_ASSIST.pull; z += (best.z - z) * MOUSE_VOLLEY_ASSIST.pull; }
    }
    let wallFocus=false;
    if((this.interior && !this.canAimAt(x,z)) || this.colliders.some(b=>!b.playerOnly && !b.destructible && inside({x,z},b))) {
      let first=1;
      for(const wall of this.colliders) {
        if(wall.playerOnly || wall.destructible)continue;
        const t=segmentBox(p.x,p.z,x,z,wall,.1);
        if(t!==null)first=Math.min(first,t);
      }
      if(first<1){
        // Keep the common convergence point just clear of the near wall face;
        // the projectile radius must not produce separate early contact points.
        const t=Math.max(0,first-.00001);x=p.x+(x-p.x)*t;z=p.z+(z-p.z)*t;wallFocus=true;
      }
    }
    const volley = ++this.volley;
    // Orbs are thrown slightly past the aim point, so they travel through what
    // was pointed at instead of stopping against its near face. Only the
    // convergence point moves; the blast still centres on the cursor, and a
    // shot already clamped to a wall face is left exactly where it was.
    const overshootFrom = (fx, fz) => {
      const reach = Math.hypot(fx - p.x, fz - p.z);
      if (wallFocus || reach <= 1e-6) return { x: fx, z: fz };
      let tx = fx + (fx - p.x) / reach * RULES.launchOvershoot;
      let tz = fz + (fz - p.z) / reach * RULES.launchOvershoot;
      // Never overshoot through solid cover standing just behind the target.
      let clear = 1;
      for (const box of this.colliders) {
        if (box.playerOnly || box.destructible) continue;
        const t = segmentBox(fx, fz, tx, tz, box, .1);
        if (t !== null) clear = Math.min(clear, Math.max(0, t - .00001));
      }
      return { x: fx + (tx - fx) * clear, z: fz + (tz - fz) * clear };
    };
    let travel = overshootFrom(x, z);
    // A volley thrown past a target still meets it: every orb's path crosses it
    // on the way in, so that crossing is where the volley belongs. Re-focus on
    // the earliest one so the orbs converge there and it takes the combined
    // impact and blast, instead of each orb clipping it for a stray apiece.
    // Only when nothing was aimed at in the first place, and only for a target
    // the caster can actually see.
    const aimedAt = this.targets.some(t => t.hp > 0 && Math.hypot(x - t.x, z - t.z) <= .66);
    const aimDistance = Math.hypot(x - p.x, z - p.z);
    if (!aimedAt && aimDistance > 1e-6) {
      // "Thrown past" means on the line of fire, between the caster and the aim
      // point. Orbs parked beside a target cross it whichever way they are then
      // thrown, so a crossing alone is not evidence the volley was aimed
      // through anything: the target has to stand in the way from here.
      const dirX = (x - p.x) / aimDistance, dirZ = (z - p.z) / aimDistance;
      let intercept = null;
      for (const candidate of this.targets) {
        if (candidate.hp <= 0) continue;
        const toX = candidate.x - p.x, toZ = candidate.z - p.z;
        const along = toX * dirX + toZ * dirZ;
        // Only a target just short of the cursor (owner: the volley lands where
        // the cursor is, the refocus only catches one standing right there).
        if (along <= 0 || along >= aimDistance || along < aimDistance - RULES.interceptReach) continue;
        if (Math.abs(toX * dirZ - toZ * dirX) > RULES.interceptCorridor) continue;
        if (this.colliders.some(b => !b.playerOnly && !b.destructible && segmentBox(p.x, p.z, candidate.x, candidate.z, b) !== null)) continue;
        let earliest = Infinity, crossing = 0;
        for (const seed of seeds) {
          const t = segmentCircle(seed.x, seed.z, travel.x, travel.z, candidate.x, candidate.z, .66);
          if (t !== null) { crossing++; earliest = Math.min(earliest, t); }
        }
        if (crossing && along < (intercept?.along ?? Infinity)) intercept = { candidate, earliest, along };
      }
      if (intercept) {
        x = intercept.candidate.x; z = intercept.candidate.z;
        travel = overshootFrom(x, z);
      }
    }
    const travelX = travel.x, travelZ = travel.z;
    const duration = launchDuration(Math.max(...seeds.map(s => Math.hypot(travelX - s.x, travelZ - s.z))));
    for (const s of seeds) {
      s.vx = (travelX - s.x) / duration; s.vz = (travelZ - s.z) / duration;
      s.launched = true; s.age = 0; s.volley = volley;
      s.launchX=s.x;s.launchZ=s.z;
      // A stray is worth one orb, whatever the volley behind it was worth.
      s.strayDamage = isQuickShot ? 6 * VOLLEY_BOOST : damagePerOrb(1);
      s.damage = s.strayDamage; s.quickShot = isQuickShot;
      // Spent on breakable scenery, never on the target it was aimed at
      // (what it breaks is as before the volley boost).
      s.pierceBudget = s.strayDamage / VOLLEY_BOOST;
      s.wallFocus=wallFocus;
      // The aim point decides intent; the travel point decides where it flies.
      s.focusX = x; s.focusZ = z;
      s.phase = 'converging'; s.travelDuration = duration; s.targetX = travelX; s.targetZ = travelZ;
    }
    this.stats.launched += seeds.length; this.seedCooldown = .15;
    this.rechargeWait = RULES.rechargeDelay; this.rechargeProgress = 0;
    this.volleyKills.set(volley, 0);
    this.volleys.set(volley, { x, z, remaining: seeds.length, arrived: 0 });
    this.events.push({ type: 'launch', x: p.x, z: p.z, count: seeds.length, aimX: p.aimX, aimZ: p.aimZ,
      duration, focusX: x, focusZ: z, travelX, travelZ, paths: seeds.map(s => ({ id: s.id, x: s.x, z: s.z })),
      // Best case for this volley: what it is worth if every orb lands.
      damage: (isQuickShot ? 6 : damagePerOrb(seeds.length)) * seeds.length });
  }

  // A volley is worth what lands, not what was fired. The count is taken once,
  // on the first arrival: orbs stopped short are already dead and excluded, and
  // every orb of the volley then shares that same figure.
  orbVolleyDamage(shot) {
    const volley = this.volleys.get(shot.volley);
    if (!volley) return shot.strayDamage;
    if (shot.quickShot) return 6;
    if (volley.landed === undefined) {
      volley.landed = Math.max(1, volley.remaining);
      volley.roll = volley.landed === 12 ? (Math.random() * 20 - 10) / 12 : 0;
    }
    const base = damagePerOrb(volley.landed) + volley.roll;
    const scale = volley.landed <= 3 ? ORB_DAMAGE_MULTIPLIER : 0;
    return rangedOrbDamage(base, Math.hypot(shot.x - shot.launchX, shot.z - shot.launchZ), scale);
  }

  recharge(dt) {
    if(this.dev.ammo||this.dev.orbs){this.ammo=RULES.maxSeeds;this.rechargeWait=0;this.rechargeProgress=0;return;}
    if (this.spray.active) { this.rechargeWait = RULES.rechargeDelay; this.rechargeProgress = 0; return; }
    if (this.rechargeWait > 0) {
      const waiting = Math.min(dt, this.rechargeWait); this.rechargeWait -= waiting; dt -= waiting;
    }
    const capacity = RULES.maxSeeds - this.seeds.length - Math.ceil(this.hexOrbs.length * RULES.hexCost / 6);
    if (this.ammo >= capacity) { this.rechargeProgress = 0; return; }
    this.rechargeProgress += dt * this.rechargeRate;
    while (this.rechargeProgress + 1e-8 >= this.rechargeInterval && this.ammo < capacity) {
      this.rechargeProgress -= this.rechargeInterval; this.ammo++; this.firstRefill = false;
    }
    this.rechargeProgress = Math.max(0, this.rechargeProgress);
  }

  stepSpray(dt) {
    const spray = this.spray; if (!spray.active) return;
    const contacts=spray.contacts ||= new Map();
    const p = this.player;
    const warming = Math.min(dt, spray.warmup); spray.warmup = Math.max(0, spray.warmup - warming);
    let available = dt - warming, firing = 0;
    while (available > 1e-9) {
      if (spray.credit <= 1e-9) {
        if (this.ammo <= 0) { spray.active = false; spray.exhausted = true; break; }
        if(!this.dev.ammo&&!this.dev.orbs)this.ammo--; this.firstRefill = true; spray.credit = RULES.sprayAmmoTime;
      }
      const slice = Math.min(available, spray.credit);
      firing += slice; available -= slice; spray.credit -= slice;
    }
    const origin = { x: p.x + p.aimX * .65, z: p.z + p.aimZ * .65 };
    const cover = [...this.colliders];
    const blocked = (a, b, propId) => cover.some(c => !c.playerOnly && (propId === undefined || c.propId !== propId) && segmentBox(a.x, a.z, b.x, b.z, c) !== null);
    const damageAt = (victim, propId) => {
      const dx = victim.x - origin.x, dz = victim.z - origin.z, distance = Math.hypot(dx, dz);
      if (distance > RULES.sprayRange || blocked(p, origin) || blocked(origin, victim, propId)) return 0;
      const dot = distance > 1e-6 ? (dx * p.aimX + dz * p.aimZ) / distance : 1;
      if (dot < Math.cos(RULES.sprayOuterAngle)) return 0;
      const dps = dot >= Math.cos(RULES.sprayInnerAngle) ? RULES.sprayInnerDPS : RULES.sprayOuterDPS;
      return dps * (1 - .25 * distance / RULES.sprayRange) * firing;
    };
    const sustainedDamage=(victim,base)=>{
      if(!base){contacts.delete(victim);return 0;}
      const before=contacts.get(victim)||0,after=before+firing;
      contacts.set(victim,Math.min(after,RULES.sprayRampTime));
      // Integrate the linear ramp across this tick, including the cap crossing.
      const integral=t=>t<=RULES.sprayRampTime?t*t/(2*RULES.sprayRampTime):t-RULES.sprayRampTime/2;
      return base*(1+(RULES.sprayMaxMultiplier-1)*(integral(after)-integral(before))/firing);
    };
    if (firing > 0) {
      for (const crop of this.crops) if (crop.state === 'standing') {
        const points = [cropPoint(crop, origin)];
        for (const x of [-.49, 0, .49]) for (const z of [-.49, 0, .49]) points.push({ x: crop.x + x * crop.w, z: crop.z + z * crop.d });
        if (points.some(point => damageAt(point) > 0)) affectCrop(this, crop);
      }
      for (const target of this.targets) if (target.hp > 0) {
        const damage = sustainedDamage(target,damageAt(target));
        if (damage) this.hit(target, { electric:true, damage, owner: p.id, volley: spray.volley, vx: p.aimX, vz: p.aimZ });
      }
      for (const prop of this.props) if (prop.hp !== null && prop.hp > 0) {
        const damage = sustainedDamage(prop,damageAt(prop, prop.id));
        if (damage) this.hitProp(prop, { electric:true, damage, x: prop.x, z: prop.z, vx: p.aimX, vz: p.aimZ });
      }
    }
    for(const victim of contacts.keys())if(victim.hp<=0)contacts.delete(victim);
    spray.effectClock -= dt;
    if (spray.effectClock <= 0) {
      spray.effectClock += .045;
      const power = firing > 0 ? 1 : .15 + .2 * Math.sin(this.time * 95) ** 2, paths = [];
      const base = Math.atan2(p.aimZ, p.aimX);
      const lanes = [-1, -.65, -.22, -.1, 0, .1, .22, .65, 1];
      for (let i = 0; i < lanes.length; i++) {
        const offset = lanes[i] * RULES.sprayOuterAngle * .94;
        const range = RULES.sprayRange * power * (.72 + .28 * Math.sin(this.time * 71 + i * 11) ** 2);
        const end = { x: origin.x + Math.cos(base + offset) * range, z: origin.z + Math.sin(base + offset) * range };
        let t = blocked(p, origin) ? 0 : 1;
        for (const box of cover) if (!box.playerOnly) {
          const hit = segmentBox(origin.x, origin.z, end.x, end.z, box);
          if (hit !== null) t = Math.min(t, hit);
        }
        paths.push({ energy: Math.abs(lanes[i]) < .25 ? 1 : .25, a: origin, b: { x: origin.x + (end.x - origin.x) * t, z: origin.z + (end.z - origin.z) * t } });
      }
      this.events.push({ type: 'sprayArc', paths, firing: firing > 0, x: origin.x, z: origin.z });
    }
    if (spray.credit <= 1e-9 && this.ammo === 0 && spray.warmup <= 0) { spray.active = false; spray.exhausted = true; }
  }

  hex() {
    if (this.hexSpin) return;
    if (!this.hexOrbs.length) {
      if (this.hexCooldown > 0) return;
      if (this.ammo < RULES.hexCost) { this.events.push({ type: 'cock' }); return; }
      this.hexCooldown = this.dev.cooldowns ? 0 : RULES.hexCooldown;
      if(!this.dev.ammo&&!this.dev.orbs)this.ammo -= RULES.hexCost; this.firstRefill = true; this.rechargeProgress = 0; this.rechargeWait = RULES.rechargeDelay;
      const { x, z } = this.player;
      this.hexOrbs = Array.from({ length: 6 }, (_, index) => {
        const angle = index * Math.PI / 3;
        return { id: ++this.serial, index, x, z, originX: x, originZ: z, muzzleX:x+this.player.aimX*.8,muzzleZ:z+this.player.aimZ*.8, age: this.dev.instantHex ? RULES.hexFormationTime : 0,
          vx: Math.cos(angle) * RULES.hexSpeed, vz: Math.sin(angle) * RULES.hexSpeed, hex: true };
      });
      this.events.push({ type: 'hexDeploy', x, z }); return;
    }
    if(this.hexOrbs[0].age+1e-8<RULES.hexFormationTime)return;
    const nodes = this.hexOrbs.map(o => ({ ...o, power: hexPower(Math.hypot(o.x - o.originX, o.z - o.originZ)) })), edges = [], strands = [];
    // Hex energy passes through scenery; entity damage still uses pulse/edge ranges.
    const clear = () => true;
    for (const a of nodes) {
      const b = nodes.find(n => n.index === (a.index + 1) % 6);
      if (b && clear(a, b)) edges.push({ a, b });
    }
    const volley = ++this.volley;
    for (const n of nodes) cropCircle(this, n, n.power.radius, true, clear);
    const damageAt = (victim, propId) => {
      let damage = 0, source = null;
      for (const n of nodes) {
        const d = Math.hypot(n.x - victim.x, n.z - victim.z);
        if (d <= n.power.radius + 1e-8 && clear(n, victim, propId)) {
          const value = hexPulseDamageAt(n.power, d);
          if (value > damage) { damage = value; source = n; }
        }
      }
      return { damage, source };
    };
    for (const t of this.targets) if (t.hp > 0) {
      const { damage } = damageAt(t);
      if (damage) this.hit(t, { electric:true, damage, volley });
    }
    for (const p of this.props) if (p.hp > 0 && p.hp !== null) {
      const { damage, source } = damageAt(p, p.id);
      if (damage) this.hitProp(p, { electric:true, damage: p.hp, x: p.x, z: p.z, vx: p.x - source.x, vz: p.z - source.z });
    }
    this.hexSpin = { age: 0, volley, nodes, edges: [], hits: new Map(), originX: nodes[0].originX, originZ: nodes[0].originZ };
    this.events.push({ type: 'hexPulse', nodes, edges, strands, radius: Math.max(...nodes.map(n => n.power.radius)) });
    this.hexOrbs = []; this.rechargeWait = RULES.rechargeDelay; this.rechargeProgress = 0;
  }

  // Standing breakable props a segment passes through (the hex's spinning
  // sides and its flying orbs break them). This used to test every prop
  // against every collider (props x colliders, six times a step): the whole
  // frame on a laptop when the second X was pressed. Now one pass over the
  // colliders that belong to props, indexed once per collider list, with a
  // cheap bounding-box reject first.
  breakablePropsAlong(ax, az, bx, bz, pad) {
    let index = this.propColliderIndex;
    if (!index || index.colliders !== this.colliders || index.length !== this.colliders.length || index.props !== this.props) {
      const byId = new Map(this.props.map(p => [p.id, p]));
      index = this.propColliderIndex = { colliders: this.colliders, length: this.colliders.length, props: this.props,
        list: this.colliders.filter(c => c.propId !== undefined && byId.has(c.propId)).map(c => ({ c, prop: byId.get(c.propId) })) };
    }
    const x0 = Math.min(ax, bx) - pad, x1 = Math.max(ax, bx) + pad, z0 = Math.min(az, bz) - pad, z1 = Math.max(az, bz) + pad, found = [];
    for (const { c, prop } of index.list) {
      if (prop.hp === null || !(prop.hp > 0) || found.includes(prop)) continue;
      if (!c.angle && (c.x + c.w / 2 < x0 || c.x - c.w / 2 > x1 || c.z + c.d / 2 < z0 || c.z - c.d / 2 > z1)) continue;
      if (segmentBox(ax, az, bx, bz, c, pad) !== null) found.push(prop);
    }
    return found;
  }

  stepHexSpin(dt) {
    const spin = this.hexSpin; if (!spin) return;
    spin.age = Math.min(RULES.hexSpinDuration, spin.age + dt);
    // Positive XZ angle is clockwise in the top-down view (south is screen down).
    const angle = spin.age / RULES.hexSpinDuration * Math.PI * 2, c = Math.cos(angle), s = Math.sin(angle);
    const nodes = spin.nodes.map(n => {
      const dx = n.x - spin.originX, dz = n.z - spin.originZ;
      return { ...n, x: spin.originX + dx * c - dz * s, z: spin.originZ + dx * s + dz * c };
    });
    const blocked = () => false;
    spin.edges = [];
    for (const a of nodes) {
      const b = nodes.find(n => n.index === (a.index + 1) % 6);
      if (!b || blocked(a, b)) continue;
      spin.edges.push({ a, b, index: a.index });
      for(const prop of this.breakablePropsAlong(a.x,a.z,b.x,b.z,.12))
        this.hitProp(prop,{electric:true,damage:prop.hp,x:prop.x,z:prop.z,vx:prop.x-spin.originX,vz:prop.z-spin.originZ});
      for (const crop of this.crops) if (crop.state !== 'gone' && segmentBox(a.x, a.z, b.x, b.z, crop, .2) !== null) affectCrop(this, crop, true);
      if (!spin.hits.has(a.index)) spin.hits.set(a.index, new Set());
      const hits = spin.hits.get(a.index), reach = Math.min(a.power.reach, b.power.reach);
      for (const victim of this.targets) {
        if (victim.hp <= 0 || hits.has(victim.id)) continue;
        const dx = b.x - a.x, dz = b.z - a.z;
        const t = Math.max(0, Math.min(1, ((victim.x - a.x) * dx + (victim.z - a.z) * dz) / (dx * dx + dz * dz || 1)));
        const point = { x: a.x + dx * t, z: a.z + dz * t };
        if (Math.hypot(victim.x - point.x, victim.z - point.z) > reach || blocked(point, victim)) continue;
        hits.add(victim.id);
        this.hit(victim, { electric:true, damage: RULES.hexEdgeDamage, volley: spin.volley, owner: this.player.id });
        this.events.push({ type: 'hexZap', a: point, b: { x: victim.x, z: victim.z }, side: a.index, targetId: victim.id });
      }
    }
    if (spin.age >= RULES.hexSpinDuration - 1e-8) this.hexSpin = null;
  }

  stepHex(dt) {
    this.stepHexSpin(dt);
    for (const orb of this.hexOrbs) {
      orb.age += dt;
      const angle=orb.index*Math.PI/3-orb.age*Math.PI*2,radius=Math.min(orb.age*RULES.hexSpeed,RULES.hexRange);
      const x = orb.originX+Math.cos(angle)*radius, z = orb.originZ+Math.sin(angle)*radius;
      orb.vx=(x-orb.x)/dt;orb.vz=(z-orb.z)/dt;
      for(const prop of this.breakablePropsAlong(orb.x,orb.z,x,z,.3))
        this.hitProp(prop,{electric:true,damage:prop.hp,x:prop.x,z:prop.z,vx:orb.vx,vz:orb.vz});
      orb.x = x; orb.z = z;
      // At full size it holds, still turning, for hexLinger, then fades.
      if (orb.age >= RULES.hexRange / RULES.hexSpeed + RULES.hexLinger || Math.abs(x) > this.map.width / 2 || Math.abs(z) > this.map.depth / 2) {
        orb.dead = true; this.events.push({ type: 'hexFizzle', x, z });
      }
    }
    this.hexOrbs = this.hexOrbs.filter(o => !o.dead);
    // Rotation can bring a side inward even while the caster stands still.
    const boundary=this.hexBoundary();
    if(boundary){
      const p=this.player,dx=p.x-boundary.x,dz=p.z-boundary.z;let factor=1;
      for(let i=0;i<6;i++){
        const a=(i+.5)*Math.PI/3+boundary.rotation,dot=dx*Math.cos(a)+dz*Math.sin(a);
        if(dot>boundary.limit)factor=Math.min(factor,boundary.limit/dot);
      }
      if(factor<1){p.x=boundary.x+dx*factor;p.z=boundary.z+dz*factor;}
    }
    this.pushHexVictims(this.targets, dt);
  }

  // Shared entity operation: practice targets now, opposing player bodies later.
  pushHexVictims(victims, dt) {
    const orb = this.hexOrbs[0]; if (!orb) return;
    const radius = Math.hypot(orb.x - orb.originX, orb.z - orb.originZ);
    for (const victim of victims) {
      if (victim.hp <= 0 || victim.id === this.player.id || (victim.team && victim.team !== 'ffa' && victim.team === this.player.team)) continue;
      let dx = victim.x - orb.originX, dz = victim.z - orb.originZ;
      const distance = Math.hypot(dx, dz);
      if (distance > 1e-6) { dx /= distance; dz /= distance; } else { dx = 1; dz = 0; }
      let normalDot = 0;
      for (let i = 0; i < 6; i++) {const angle=(i+.5)*Math.PI/3-orb.age*Math.PI*2;normalDot = Math.max(normalDot, dx * Math.cos(angle) + dz * Math.sin(angle));}
      const bodyRadius = victim.radius ?? .66;
      const edgeDistance = radius * Math.cos(Math.PI / 6) / normalDot;
      const push = Math.min(edgeDistance + bodyRadius - distance, RULES.hexSpeed * 1.8 * dt);
      if (push <= 0) continue;
      if (this.colliders.some(c => !c.playerOnly && segmentBox(orb.originX, orb.originZ, victim.x, victim.z, c) !== null)) continue;
      let fraction = 1;
      for (const c of this.colliders) {
        const contact = segmentBox(victim.x, victim.z, victim.x + dx * push, victim.z + dz * push, c, bodyRadius);
        if (contact !== null) fraction = Math.min(fraction, Math.max(0, contact - .001));
      }
      const x = Math.max(-this.map.width / 2 + bodyRadius, Math.min(this.map.width / 2 - bodyRadius, victim.x + dx * push * fraction));
      const z = Math.max(-this.map.depth / 2 + bodyRadius, Math.min(this.map.depth / 2 - bodyRadius, victim.z + dz * push * fraction));
      if (Number.isFinite(victim.baseX)) victim.baseX += x - victim.x;
      victim.x = x; victim.z = z;
      const inward = (victim.vx || 0) * dx + (victim.vz || 0) * dz;
      if (inward < 0) { victim.vx -= inward * dx; victim.vz -= inward * dz; }
    }
  }

  hit(target, shot) {
    if (target.hp <= 0 || shot.owner === target.id) return;
    // Inside someone's hex, and this came from outside it: nothing lands.
    if (!shot.environmental && this.shields?.length && this.shieldedFrom(target.x, target.z)) { this.events.push({ type: 'hexBlock', x: target.x, z: target.z }); return; }
    // A teammate (friendly fire on) takes only their share, here, so the
    // numbers, the hit marker and any KILL match what really landed.
    if (target.friendly && target.share !== undefined && target.share !== 1) shot = { ...shot, damage: shot.damage * target.share };
    // Dev one-hit kills: any hit that isn't the world's own (fire) finishes it.
    // Dev damage dealt (a multiplier) and one-hit kills: never the world's own (fire).
    if (this.dev.damageOut && this.dev.damageOut !== 1 && !shot.environmental) shot = { ...shot, damage: shot.damage * this.dev.damageOut };
    if (this.dev.oneHit && !shot.environmental) shot = { ...shot, damage: Math.max(shot.damage, target.hp) };
    // Any kill by Ballast is the headless death (owner's rule; it used to
    // need a massive fast burst, see ballast-damage.js, kept for the record).
    const ballast=shot.damageType==='ballast';if(ballast)recordBallastDamage(target,shot.damage,this.time,shot.owner);
    const fullHealth=target.hp>=target.maxHp-1e-8;
    if(fullHealth||target.oneShotVolley!==shot.volley||this.time-(target.oneShotAt??-1)>.15){target.oneShotEligible=fullHealth;target.oneShotVolley=shot.volley;target.oneShotAt=this.time;}
    const oneShot=fullHealth&&shot.damage>=target.hp||shot.volley!=null&&target.oneShotEligible&&target.oneShotVolley===shot.volley&&this.time-target.oneShotAt<=.15;
    // What landed, not what was fired: overkill must not reach the HUD, which
    // promises a figure no larger than the health actually lost. The player
    // side already clamped; the target side did not.
    const dealt = Math.min(target.hp, shot.damage);
    // Real bullets leave holes (target-damage.js); everything else only breaks it.
    if (shot.bullet && dealt > 0) target.bulletHits = (target.bulletHits || 0) + 1;
    target.hp = Math.max(0, target.hp - shot.damage);
    if(!shot.environmental)this.events.push({type:'outgoingDamage',damage:dealt,hp:target.hp,maxHp:target.maxHp,x:target.x,z:target.z,id:target.id,volley:shot.volley});
    if (!shot.environmental) { target.flash = .16; this.stats.hits++; }
    const killed = target.hp <= 0;
    if (killed) {
      target.respawn = RULES.targetRespawn; this.stats.kills++;
      if (!shot.environmental) {
        const kills = (this.volleyKills.get(shot.volley) || 0) + 1;
        this.volleyKills.set(shot.volley, kills); this.stats.bestVolley = Math.max(this.stats.bestVolley, kills);
      }
    }
    if (killed || !shot.environmental) this.events.push({ type: killed ? 'kill' : 'hit', x: target.x, z: target.z, volley: shot.volley,
      id:target.id, damageType:ballast&&killed?'ballastFatal':shot.damageType, oneShot:killed&&oneShot&&!shot.environmental, electric:!!shot.electric, blast:!!shot.blast, damage:dealt, targetKind: target.kind, directionX: shot.vx || 0, directionZ: shot.vz || 0 });
  }

  damageEnvironment(entity, damage) {
    if (entity === this.player) return this.damagePlayer(damage, 'crop-fire', true);
    this.hit(entity, { damage, owner: 'crop-fire', environmental: true });
  }

  damagePlayer(damage, owner, environmental = false, selfBlast = false, impact = null, damageType = environmental?'fire':selfBlast?'explosion':'gunshot') {
    if (this.dev.invulnerable || this.dev.ghost || !owner || owner === this.player.id && !selfBlast || this.player.hp <= 0 || !Number.isFinite(damage) || damage <= 0) return 0;
    // Surge takes the edge off everything (not your own blasts' push, just damage).
    if (this.surge?.active) damage *= SURGE.taken;
    // Dev damage taken (a multiplier; 0 is off).
    if (this.dev.damageIn != null && this.dev.damageIn !== 1) { damage *= this.dev.damageIn; if (damage <= 0) return 0; }
    const dealt = Math.min(this.player.hp, !environmental && this.player.dodgeRemaining > 0 ? Math.max(1, Math.round(damage * RULES.dodgeDamageMultiplier)) : damage);
    if(damageType==='ballast'){recordBallastDamage(this.player,dealt,this.time,owner);if(dealt>=this.player.hp)damageType='ballastFatal';}
    this.player.hp -= dealt;
    this.events.push({type:'playerDamage',damage:dealt});
    if(this.player.hp<=0)this.killPlayer(impact,damageType);
    return dealt;
  }

  killPlayer(impact=null,damageType='impact'){
    const p=this.player;if(p.dead)return;
    // A nova ends (its cooldown runs) and a readied blast is dropped.
    if(this.surge&&this.surge.phase!=='idle'&&!this.predictOnly)endSurge(this,false);
    if(this.scatter)this.scatter.armed=false;
    p.hp=0;p.dead=true;p.ballastLaunch=false;p.vx=p.vz=p.dodgeRemaining=p.blastVX=p.blastVZ=0;
    this.spray.active=false;this.rifle.triggerHeld=false;this.rifle.aiming=false;
    const length=impact?Math.hypot(impact.x,impact.z):0;
    const directionX=length>1e-6?impact.x/length:impact?-p.aimX:0;
    const directionZ=length>1e-6?impact.z/length:impact?-p.aimZ:0;
    this.events.push({type:'playerDeath',x:p.x,z:p.z,aimX:p.aimX,aimZ:p.aimZ,directionX,directionZ,damageType,weapon:this.weapon||'static'});
  }

  applyBlastKnockback(x,z,radius,strength,coreRadius=0){
    const p=this.player;if(p.dead||p.hp<=0||strength<=0||this.dev.noKnockback)return;
    const dx=p.x-x,dz=p.z-z,distance=Math.hypot(dx,dz);if(distance>radius)return;
    // A core as wide as the blast leaves no falloff band to interpolate over;
    // dividing by it would make the impulse NaN and throw the player nowhere.
    const band=radius-coreRadius;
    const falloff=1-.85*(band>1e-9?Math.max(0,(distance-coreRadius)/band):0);
    const impulse=strength*falloff*8;
    p.blastVX+=(distance>1e-6?dx/distance:-p.aimX)*impulse;
    p.blastVZ+=(distance>1e-6?dz/distance:-p.aimZ)*impulse;
    const total=Math.hypot(p.blastVX,p.blastVZ),cap=2.8*8;
    if(total>cap){p.blastVX*=cap/total;p.blastVZ*=cap/total;}
  }

  hitPlayerProjectile(ax, az, bx, bz, shot) {
    if (shot.owner === this.player.id) return 0;
    if (segmentCircle(ax, az, bx, bz, this.player.x, this.player.z, this.playerHitRadius + (shot.radius || 0)) === null) return 0;
    const damage=this.damagePlayer(shot.damage, shot.owner,false,false,{x:bx-ax,z:bz-az},shot.damageType||(shot.electric?'electric':'gunshot'));
    if(damage&&shot.electric)this.events.push({type:'playerHit',id:this.player.id,x:this.player.x,z:this.player.z,electric:true});
    return damage;
  }

  hitProp(prop, shot) {
    if (prop.hp === null || prop.hp <= 0) return;
    prop.hp = Math.max(0, prop.hp - shot.damage); prop.flash = .16;
    if (prop.hp === 0) {
      this.colliders = this.colliders.filter(c => c.propId !== prop.id);
      this.stats.propsDestroyed++;
    }
    this.events.push({ type: prop.hp === 0 ? 'propBreak' : 'propHit', id: prop.id,
      electric:!!shot.electric, dashed:!!shot.dashed, propType: prop.type, x: prop.hp === 0 ? prop.x : shot.x, z: prop.hp === 0 ? prop.z : shot.z,
      directionX: shot.vx || 0, directionZ: shot.vz || 0, scale: prop.scale || 1 });
  }

  // Dev: every downed target stands up again on the next tick.
  respawnTargets() { let count = 0; for (const t of this.targets) if (t.hp <= 0) { t.respawn = 1e-6; count++; } return count; }
  // Dev: every broken prop is rebuilt where it was placed.
  // Solo practice's RESET MAP: the world as it was when the map loaded (every
  // prop standing, crops grown and unburnt, targets back), the player and the
  // weapon untouched. `propRestore` (quiet) for each broken prop and then
  // `mapReset` tell the renderer, which clears blood, marks and bodies.
  resetWorld() {
    for (const prop of this.props) {
      if (prop.hp === null) continue;
      if (prop.hp <= 0) this.events.push({ type: 'propRestore', id: prop.id, x: prop.x, z: prop.z, propType: prop.type, quiet: true });
      prop.hp = prop.health; prop.flash = 0;
    }
    this.colliders = mapColliders(this.map);
    this.crops = cropSegments(this.map);
    this.targets = this.practiceTargets();
    this.events.push({ type: 'mapReset' });
  }

  restoreAllProps() { let count = 0; for (const prop of this.props) if (this.restoreProp(prop.id)) count++; return count; }

  // Puts a broken prop back as it was placed: full health, and solid again.
  restoreProp(id) {
    const prop = this.props.find(p => p.id === id);
    if (!prop || prop.hp === null || prop.hp > 0) return false;
    prop.hp = prop.health; prop.flash = 0;
    this.colliders.push(...mapColliders(this.map).filter(c => c.propId === id));
    this.events.push({ type: 'propRestore', id, x: prop.x, z: prop.z, propType: prop.type });
    return true;
  }

  explode(volley, id) {
    const blast = explosionFor(volley.arrived); if (!blast) return;
    const { x, z } = volley;
    // Snapshot cover so removing one prop cannot change damage order within a blast.
    // Splash, measured the way it looks (owner's report: it was inconsistent):
    //  - to the edge of a body, not its centre: a player half inside the
    //    blast is hit (it used to take nothing until its centre was in);
    //  - only walls and buildings shelter (not crates or barrels);
    //  - sheltered only when the centre and both sides of the body are all
    //    behind something (a corner no longer eats the whole blast).
    const walls = this.colliders.filter(box => !box.playerOnly && box.propId === undefined);
    const shut = (bx, bz) => walls.some(box => segmentBox(x, z, bx, bz, box) !== null);
    const damageAt = (victim, propId, reach = 0) => {
      const centre = Math.hypot(victim.x - x, victim.z - z), distance = Math.max(0, centre - reach);
      if (distance > blast.radius) return 0;
      if (shut(victim.x, victim.z)) {
        const ux = centre > 1e-6 ? (victim.x - x) / centre : 1, uz = centre > 1e-6 ? (victim.z - z) / centre : 0, side = reach * .8;
        if (!side || (shut(victim.x - uz * side, victim.z + ux * side) && shut(victim.x + uz * side, victim.z - ux * side))) return 0;
      }
      return Math.max(1, Math.round(blast.damage * splashFalloff(distance, blast.radius, volley.arrived)));
    };
    const selfDamage=damageAt(this.player,null,RULES.radius);
    if(selfDamage){
      this.damagePlayer(selfDamage,this.player.id,false,true,{x:this.player.x-x,z:this.player.z-z},'electric');
      this.applyBlastKnockback(x,z,blast.radius,Math.max(0,Math.min(1,(volley.arrived-5)/7))*2.2);
    }
    cropCircle(this, { x, z }, blast.radius, false, (a, b) => !walls.some(c => segmentBox(a.x, a.z, b.x, b.z, c) !== null));
    for (const target of this.targets) if (target.hp > 0) {
      const damage = damageAt(target, null, targetRadius(target));
      if (damage) this.hit(target, { damage, volley: id, blast: true, vx: target.x - x, vz: target.z - z });
    }
    for (const prop of this.props) if (prop.hp !== null && prop.hp > 0) {
      const damage = damageAt(prop, prop.id, Math.min(prop.w || 0, prop.d || 0) / 2);
      if (damage) this.hitProp(prop, { damage, x: prop.x, z: prop.z, vx: prop.x - x, vz: prop.z - z });
    }
    this.events.push({ type: 'explosion', x, z, count: volley.arrived, radius: blast.radius, damage:blast.damage });
  }

  // Surge's beams: breakable props within `radius` of (x, z) break, thrown
  // outward (only on the sim that owns the world, or offline).
  breakAround(x, z, radius) {
    for (const prop of this.props) {
      if (prop.hp === null || !(prop.hp > 0)) continue;
      const dx = prop.x - x, dz = prop.z - z, d = Math.hypot(dx, dz);
      if (d > radius) continue;
      this.hitProp(prop, { damage: prop.hp, owner: this.player.id, damageType: 'impact', x: prop.x, z: prop.z, vx: dx / (d || 1), vz: dz / (d || 1) });
    }
  }

  drainEvents() { return this.events.splice(0); }
}


