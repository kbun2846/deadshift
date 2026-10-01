#!/usr/bin/env node
// Balance sheet: every weapon's damage, time-to-kill, combos and movement,
// computed from the LIVE config (src/config/gameplay.js) and the weapons' own
// damage functions, then cross-checked by driving the real headless
// Simulation (src/simulation.js) against a stationary 100-health player.
//
//   node tools/balance-sheet.mjs            print tables, write tools/out/balance-sheet.json
//   node tools/balance-sheet.mjs --no-sim   skip the Simulation cross-check (faster)
//   node tools/balance-sheet.mjs --json     print the JSON instead of the tables
//
// Conventions
//  - Distance d is centre to centre (shooter to target), in metres. A round's
//    fall-off is measured by how far it has flown when it meets the body, as in
//    the game: travel = d - muzzle.forward - body radius (targetRadius, .42).
//  - "100%" = every shot lands (every Ballast pellet too), mean damage rolls.
//  - "Real." = realistic hit rates (hitscan/fast rounds 70% <= 8 m, 55% to
//    16 m, 40% beyond; slow dodgeable projectiles 55/40/25; melee 80% inside
//    reach; Ballast = the real pellet spread fired at the target's centre).
//    Monte Carlo, seeded, mean of the kill time.
//  - Reloads are pressed the moment the magazine empties (best case).
//  - TTK is from the first trigger press to the killing hit landing
//    (including wind-ups, commits and flight time).
//
// Where the game's logic is NOT exported, it is replicated below and marked
// "REPLICATED from <file>"; everything else calls the game's own functions.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as G from '../src/config/gameplay.js';
import { rifleDamage } from '../src/weapons/rifle.js';
import { shotgunDamage, shotgunFalloff, shotgunPelletContact, shotgunSpread, shotgunReach, SHOTGUN_EDGE } from '../src/weapons/shotgun.js';
import { grenadeDamage } from '../src/weapons/grenade.js';
import { omenDamage, omenBlastDamage } from '../src/weapons/omen.js';
import { mineDamage } from '../src/weapons/sidekick.js';
import { ichorDamage, ichorBloodGain } from '../src/weapons/ichor.js';
import { sheathDamage, sheathDrawCutDamage, sheathReach } from '../src/weapons/sheath.js';
import { damagePerOrb, explosionFor, splashFalloff, launchDuration, hexPower, hexPulseDamageAt, Simulation } from '../src/simulation.js';
import { targetRadius } from '../src/target-radius.js';
import { muzzleBearing, muzzleLateral } from '../src/aim-damping.js';
import { WEAPONS } from '../src/items.js';

const { RULES, RIFLE, RIFLE_MUZZLE, SHOTGUN, SCATTER, SURGE, GRENADE, OMEN, SIGHTLINE, SIDEKICK, ICHOR, SHEATH, hpRoll } = G;
const ARGS = new Set(process.argv.slice(2));
const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, 'out', 'balance-sheet.json');

const HP = RULES.playerHealth;
const D = [2, 5, 8, 12, 16, 22];
const BODY = targetRadius({ kind: 'player' });
const TRIALS = 4000;
const BAND = [1.5, 3.5];

// ---------- helpers ----------
function mulberry(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const r2 = x => (x == null || !Number.isFinite(x)) ? x : Math.round(x * 100) / 100;
const r1 = x => (x == null || !Number.isFinite(x)) ? x : Math.round(x * 10) / 10;
const travelAt = (d, forward) => Math.max(0, d - forward - BODY);
const mean = a => a.reduce((s, v) => s + v, 0) / (a.length || 1);
const RATES = { fast: [.70, .55, .40], slow: [.55, .40, .25] };
const hitRate = (cls, d, inReach = true) => cls === 'melee' ? (inReach ? .80 : 0) : RATES[cls][d <= 8 ? 0 : d <= 16 ? 1 : 2];
const withRandom = (rng, fn) => { const keep = Math.random; Math.random = rng; try { return fn(); } finally { Math.random = keep; } };

// Kill time from a list of {t, dmg} events (first time the running total reaches HP).
// killTime.before: the total just before the killing event (a near-miss when
// it is within NEAR of HP: one more hit was needed for a sliver of health).
const NEAR = 3;
function killTime(events, hp = HP) {
  let sum = 0;
  for (const e of [...events].sort((a, b) => a.t - b.t)) { const was = sum; sum += e.dmg; if (sum >= hp - 1e-9) { killTime.before = was; return e.t; } }
  killTime.before = sum;
  return Infinity;
}
// { ttk, before } for a combo row.
const kt = events => { const t = killTime(events); return { ttk: r2(t), before: r1(killTime.before) }; };
// A stream of shots from a magazine weapon: [{t (landing), dmg}] up to `until`.
function gunEvents({ t0 = 0, interval, magazine, reload, reloadAfter = 0, ammo = magazine, delay = 0, dmg, until = 30, count = Infinity }) {
  const ev = []; let t = t0, n = 0;
  while (t <= until && n < count) {
    ev.push({ t: t + delay, dmg: typeof dmg === 'function' ? dmg(n, ammo) : dmg }); n++; ammo--;
    if (ammo <= 0) { t += reloadAfter + reload; ammo = magazine; } else t += interval;
  }
  return ev;
}

// ---------- generic gun Monte Carlo ----------
// shot(rng, fullMag) -> damage of one landed shot. p = hit chance per shot.
function gunTTK(g, d, p, rng, trials = TRIALS, maxT = 60) {
  if (!(g.mean(d) > 0) || p <= 0) return { mean: null, p90: null, fail: 1 };
  const flight = g.speed ? travelAt(d, g.forward) / g.speed : 0, res = [];
  let fail = 0;
  for (let k = 0; k < trials; k++) {
    let t = 0, hp = HP, ammo = g.magazine, done = Infinity;
    while (t < maxT) {
      if (rng() < p) { hp -= g.shot(d, rng, ammo === g.magazine); if (hp <= 1e-9) { done = t + (g.delay || 0) + flight; break; } }
      ammo--;
      if (ammo <= 0) { t += (g.reloadAfter || 0) + g.reload; ammo = g.magazine; } else t += g.interval;
    }
    if (done === Infinity) fail++; else res.push(done);
  }
  res.sort((a, b) => a - b);
  return { mean: res.length ? mean(res) : null, p90: res.length ? res[Math.floor(res.length * .9)] : null, fail: fail / trials };
}

// ---------- Ballast pellets: REPLICATED geometry of weapons/shotgun.js stepShotgun/fire ----------
// Pellet angles, muzzle offset and ray-vs-body contact are copied from the
// fire() closure (not exported); the damage per pellet uses the exported
// shotgunDamage / shotgunFalloff / shotgunPelletContact / shotgunSpread.
function ballastShell(d, rng, { aimed = false, firstShell = false, perfect = false } = {}) {
  const lateral = muzzleLateral('shotgun'), forward = .96; // shotgun.js: x=p.x+aimX*.96-aimZ*.20
  const face = muzzleBearing(0, 0, d, 0, lateral), ax = Math.cos(face), az = Math.sin(face);
  const mx = ax * forward - az * lateral, mz = az * forward + ax * lateral;
  const target = { x: d, z: 0, kind: 'player' }, R = targetRadius(target), reach = shotgunReach(), spread = shotgunSpread(aimed);
  const per = shotgunDamage(firstShell) / SHOTGUN.pellets;
  let total = 0, landed = 0;
  for (let i = 0; i < SHOTGUN.pellets; i++) {
    let dx, dz, s;
    if (perfect) { // every pellet straight at the centre, full contact
      const cx = target.x - mx, cz = target.z - mz, L = Math.hypot(cx, cz); dx = cx / L; dz = cz / L; s = Math.max(0, L - R);
    } else {
      const a = face + ((i + rng()) / SHOTGUN.pellets * 2 - 1) * spread; dx = Math.cos(a); dz = Math.sin(a);
      const ox = target.x - mx, oz = target.z - mz, proj = ox * dx + oz * dz, perp2 = ox * ox + oz * oz - proj * proj;
      if (perp2 > R * R) continue;
      s = proj - Math.sqrt(R * R - perp2); if (s < 0) s = 0;
    }
    if (s > reach) continue;
    const b = { x: mx + dx * s, z: mz + dz * s, dx, dz, travel: s, contactSample: perfect ? 0 : rng() };
    const dmg = per * shotgunFalloff(s) * (aimed && s <= SHOTGUN.range * .25 ? SHOTGUN.aimClose : 1) * (perfect ? 1 : shotgunPelletContact(b, target));
    if (dmg > 0) { total += dmg; landed++; }
  }
  return { total, landed };
}
const ballastMean = (d, opt, n = 3000, seed = 7) => { const rng = mulberry(seed + d * 101); let t = 0, l = 0; for (let k = 0; k < n; k++) { const s = ballastShell(d, rng, opt); t += s.total; l += s.landed; } return { dmg: t / n, pellets: l / n }; };

// ---------- weapon primaries ----------
const rollMean = (base) => base; // hpRoll is symmetric: mean = base
const GUNS = {
  rifle: {
    name: 'Nominal', cls: 'fast', interval: RIFLE.interval, magazine: RIFLE.magazine, reload: RIFLE.reload, speed: RIFLE.bulletSpeed, forward: RIFLE_MUZZLE.forward,
    range: RIFLE.maxRange, intended: [8, 12],
    mean: d => travelAt(d, RIFLE_MUZZLE.forward) <= RIFLE.maxRange ? rifleDamage(travelAt(d, RIFLE_MUZZLE.forward)) : 0,
    shot(d) { return this.mean(d); },
  },
  shotgun: {
    name: 'Ballast', cls: 'pellets', interval: SHOTGUN.interval, magazine: SHOTGUN.shells, reload: SHOTGUN.reload, speed: 85, forward: .96,
    range: shotgunReach(), intended: [2, 5],
    // "100%": every pellet lands, full contact (the most a shell can do at d).
    mean: d => (ballastShell(d, null, { perfect: true, firstShell: false }).total + ballastShell(d, null, { perfect: true, firstShell: true }).total) / 2,
    shot(d, rng, full) { return ballastShell(d, rng, { perfect: true, firstShell: full }).total; },
  },
  omen: {
    name: 'Omen', cls: 'slow', interval: OMEN.interval, magazine: OMEN.magazine, reload: OMEN.reload, speed: OMEN.speed, forward: OMEN.muzzle,
    range: OMEN.range, intended: [8, 12],
    mean: d => travelAt(d, OMEN.muzzle) <= OMEN.range ? omenDamage(travelAt(d, OMEN.muzzle)) : 0,
    shot(d) { return this.mean(d); },
  },
  sightline: {
    name: 'Sightline rifle', cls: 'fast', interval: SIGHTLINE.commit, magazine: 1, reload: SIGHTLINE.reload, reloadAfter: SIGHTLINE.commit, delay: SIGHTLINE.commit,
    speed: SIGHTLINE.speed, forward: SIGHTLINE.muzzleForward, range: Infinity, intended: [16, 22],
    note: `crouched & set up (setup ${r2(SIGHTLINE.setupDuration)} s not counted); one round, ${SIGHTLINE.reload} s reload after a ${SIGHTLINE.commit} s commit`,
    mean: () => rollMean((SIGHTLINE.damageMin + SIGHTLINE.damageMax) / 2),
    shot(d, rng) { return hpRoll((SIGHTLINE.damageMin + SIGHTLINE.damageMax) / 2, (SIGHTLINE.damageMax - SIGHTLINE.damageMin) / 2, rng); },
  },
  sightlinePistol: {
    name: 'Sightline sidekick', cls: 'fast', interval: SIGHTLINE.pistolInterval, magazine: SIGHTLINE.pistolMagazine, reload: SIGHTLINE.pistolReload,
    speed: SIGHTLINE.pistolSpeed, forward: .75, range: SIGHTLINE.pistolRange, intended: [5, 12],
    mean: d => travelAt(d, .75) <= SIGHTLINE.pistolRange ? SIGHTLINE.pistolDamage : 0,
    shot(d, rng) { return hpRoll(SIGHTLINE.pistolDamage, SIGHTLINE.pistolDamageRoll, rng); },
  },
  sidekick: {
    name: 'Sidekick', cls: 'fast', interval: SIDEKICK.interval, magazine: SIDEKICK.magazine, reload: SIDEKICK.reload, speed: SIDEKICK.speed, forward: .79, // sidekick.js shoot(): .79
    range: SIDEKICK.range, intended: [5, 12],
    mean: d => travelAt(d, .79) <= SIDEKICK.range ? SIDEKICK.damage : 0,
    shot(d, rng) { return hpRoll(SIDEKICK.damage, SIDEKICK.damageRoll, rng); },
  },
};

// ---------- Ichor: REPLICATED blood/chain loop of weapons/ichor.js (hit(), contact(), stepIchor) ----------
// Damage (ichorDamage) and blood gain (ichorBloodGain) are the exported ones.
const ichorReach = ICHOR.range + BODY;
function ichorRun(p, rng, { blood = 0, maxT = 60 } = {}) {
  let hp = HP, t = 0, chain = 0, chainAt = -10, lastGain = -10;
  while (t < maxT) {
    // blood decay after decayDelay with no gain (approximate, per swing)
    if (t - lastGain > ICHOR.decayDelay) blood = Math.max(0, blood - ICHOR.decay * ICHOR.interval);
    const power = blood / 100, hitAt = t + ICHOR.contact;
    if (rng() < p) {
      hp -= ichorDamage(power * 100);
      if (hp <= 1e-9) return hitAt;
      chain = hitAt - chainAt <= ICHOR.chainWindow ? Math.min(4, chain + 1) : 1; chainAt = hitAt;
      const bonus = Math.min(ICHOR.chainMax, Math.max(0, chain - 1) * ICHOR.chainStep);
      blood = Math.min(ICHOR.meterMax, blood + ichorBloodGain('ichorSlash', rng) * (1 + bonus)); lastGain = hitAt;
    }
    t += ICHOR.interval;
  }
  return Infinity;
}
// ---------- Sheath: REPLICATED swing timing of weapons/sheath.js (startSwing, stepSheath) ----------
// The first swing is the draw (windup drawWindup, duration interval + (drawWindup - windup));
// a body dead ahead is reached ~47% into the hit window (slashContact `reached`).
const sheathHitOffset = (arc = SHEATH.arcs[0]) => (arc / 2 - .12) / arc * SHEATH.hitWindow;
function sheathRun(p, rng, { startOut = false, maxT = 60, hp = HP, t0 = 0 } = {}) {
  let t = t0, first = !startOut;
  while (t < maxT) {
    const windup = first ? SHEATH.drawWindup : SHEATH.windup, dur = SHEATH.interval + (windup - SHEATH.windup);
    if (rng() < p) { hp -= sheathDamage(rng); if (hp <= 1e-9) return t + windup + sheathHitOffset(); }
    t += dur; first = false;
  }
  return Infinity;
}
const sheathRange = sheathReach(0) + BODY;

// ---------- Static: orbs (functions from simulation.js; recharge REPLICATED from Simulation.recharge) ----------
function staticVolley(n = RULES.maxSeeds) {
  const blast = explosionFor(n);
  const direct = damagePerOrb(n) * n;                       // n > 3: no range scaling (rangedOrbDamage multiplier 0)
  const centre = blast ? blast.damage * splashFalloff(0, blast.radius, n) : 0; // body edge inside the blast centre
  return { direct, blast: centre, total: direct + centre, radius: blast?.radius || 0, blastDamage: blast?.damage || 0 };
}
// Time to refill n orbs after a launch (rechargeDelay, first orb 1.4x quicker, then rechargeInterval / rate).
const staticRefill = (n, still = false) => { const rate = still ? RULES.stationaryRecharge : 1; return RULES.rechargeDelay + RULES.rechargeInterval / 1.4 / rate + (n - 1) * RULES.rechargeInterval / rate; };
const placeTime = n => (n - 1) * RULES.seedInterval;
const orbFlight = d => launchDuration(Math.max(.3, d - 1.6)); // orbs drift ~1.6 m out while placing (approx; sim cross-checks)
function staticRun(d, p, rng, { still = false, maxT = 400 } = {}) {
  const v = staticVolley(12).total; let hp = HP, t = placeTime(12);
  while (t < maxT) { if (rng() < p) { hp -= v; if (hp <= 1e-9) return t + orbFlight(d); } t += staticRefill(12, still) + .01; }
  return Infinity;
}
// Stream (C): REPLICATED from Simulation.stepSpray (warm-up, ammo credit, cone, distance fade, ramp).
function streamTTK(d, orbs = RULES.maxSeeds, dt = 1 / 240) {
  const origin = .65, dist = d - origin; if (dist > RULES.sprayRange) return { ttk: null, dmg: 0 };
  const base = RULES.sprayInnerDPS * (1 - (RULES.sprayFalloff ?? .25) * dist / RULES.sprayRange);
  const ramp = t => t <= RULES.sprayRampTime ? t * t / (2 * RULES.sprayRampTime) : t - RULES.sprayRampTime / 2;
  const firingMax = orbs * RULES.sprayAmmoTime;
  let hp = HP, firing = 0, t = RULES.sprayWarmup;
  while (firing < firingMax - 1e-9) {
    const step = Math.min(dt, firingMax - firing);
    hp -= base * (step + (RULES.sprayMaxMultiplier - 1) * (ramp(firing + step) - ramp(firing)));
    firing += step; t += step;
    if (hp <= 1e-9) return { ttk: t, dmg: HP };
  }
  return { ttk: null, dmg: HP - hp };
}

// ---------- Simulation cross-check (the real game loop, headless) ----------
const MAP = { width: 140, depth: 140, spawn: { x: 0, z: 0 }, buildings: [], fences: [], props: [], targets: [] };
function simRun(weapon, d, inputFn, { seed = 1, noSpread = false, maxT = 30, setup, crouched = false, pin = true, pinPlayer = false, onHit } = {}) {
  return withRandom(mulberry(seed), () => {
    const s = new Simulation(MAP); s.weapon = weapon; s.reset(); s.targets = [];
    Object.assign(s.dev, { noKnockback: true, noSpread });
    const face = muzzleBearing(0, 0, d, 0, muzzleLateral(weapon, crouched));
    const aim = { aimX: Math.cos(face), aimZ: Math.sin(face), aimPointX: d, aimPointZ: 0, launchPointX: d, launchPointZ: 0 };
    for (let i = 0; i < 4; i++) s.step({ ...aim });
    if (setup) setup(s, aim);
    Object.assign(s.player, { x: 0, z: 0, vx: 0, vz: 0 });
    const t = { id: 'enemy', kind: 'player', x: d, z: 0, hp: HP, maxHp: HP };
    s.targets = [t];
    if (onHit) { const hit = s.hit.bind(s); s.hit = (target, o) => { const before = target.hp; const r = hit(target, o); onHit(s, before - target.hp, o); return r; }; }
    const t0 = s.time; let i = 0, first = null;
    while (s.time - t0 < maxT) {
      const input = inputFn(s, i++);
      s.step({ ...aim, ...input });
      if (pin) { t.x = d; t.z = 0; }
      if (pinPlayer) Object.assign(s.player, { x: 0, z: 0, vx: 0, vz: 0 });
      if (first === null && t.hp < HP) first = s.time - t0;
      if (t.hp <= 0) return { ttk: s.time - t0, dealt: HP, selfHp: s.player.hp };
    }
    return { ttk: Infinity, dealt: HP - t.hp, selfHp: s.player.hp };
  });
}
const SIM_INPUT = {
  rifle: aiming => (s) => ({ fire: true, aiming, reload: s.rifle.ammo === 0 }),
  shotgun: aiming => (s, i) => ({ fire: i % 2 === 0, aiming, reload: s.shotgun.ammo === 0 }),
  omen: () => (s) => ({ fire: true, reload: s.omen.ammo === 0 }),
  sidekick: aiming => (s, i) => ({ fire: i % 2 === 0, aiming, reload: s.sidekick.ammo === 0 }),
  sightlinePistol: aiming => (s, i) => ({ fire: i % 2 === 0, aiming, reload: s.sightline.pistolAmmo === 0 }),
  ichor: () => () => ({ fire: true }),
  sheath: () => () => ({ fire: true }),
};
function simMean(weapon, d, input, n, opt = {}) {
  const runs = []; for (let k = 0; k < n; k++) runs.push(simRun(weapon, d, input, { ...opt, seed: 1000 + k * 7919 + d }));
  const ok = runs.filter(r => Number.isFinite(r.ttk));
  return { ttk: ok.length ? mean(ok.map(r => r.ttk)) : null, killedShare: ok.length / n, dealt: mean(runs.map(r => r.dealt)), selfHp: mean(runs.map(r => r.selfHp)) };
}

// ======================================================================
// Build the sheet
// ======================================================================
const sheet = { generated: new Date().toISOString(), playerHealth: HP, distances: D, band: BAND, assumptions: {}, primaries: {}, abilities: {}, combos: {}, window30: {}, movement: {}, simCheck: {}, outliers: [], staleText: [] };
sheet.assumptions = {
  distance: 'centre to centre; a round\'s fall-off uses its travel to the body surface (d - muzzle forward - body radius ' + BODY + ')',
  hundredPct: 'every shot lands (Ballast: all 12 pellets, full contact), mean damage rolls, reload pressed the instant the magazine empties',
  realistic: 'fast rounds 70%/55%/40% (<=8, <=16, >16 m); slow dodgeable projectiles 55/40/25; melee 80% inside reach; Ballast: real pellet spread (hip fire) aimed at the centre',
  ttk: 'first trigger press to the killing hit landing, including wind-up/commit and flight time; mean of ' + TRIALS + ' seeded trials',
};

const rng0 = mulberry(12345);
const pct = cls => cls;

// ---- primaries (guns) ----
for (const [id, g] of Object.entries(GUNS)) {
  const row = { name: g.name, class: g.cls, interval: g.interval, magazine: g.magazine, reload: g.reload, note: g.note, intended: g.intended, byDistance: {} };
  const cycle = (g.magazine - 1) * g.interval + (g.reloadAfter || 0) + g.reload;
  for (const d of D) {
    const dmg = g.mean(d);
    const cell = { dmg: r2(dmg) };
    if (dmg > 0) {
      const magDmg = id === 'shotgun' ? g.shot(d, null, true) + g.shot(d, null, false) : dmg * g.magazine;
      cell.burstDps = r1(g.magazine > 1 ? dmg / g.interval : dmg / cycle);
      cell.sustDps = r1(magDmg / cycle);
      cell.stk = id === 'sightline' ? `${Math.ceil(HP / SIGHTLINE.damageMax)}-${Math.ceil(HP / SIGHTLINE.damageMin)}` : Math.ceil(HP / dmg - 1e-9);
      cell.magKills = magDmg >= HP;
      if (id !== 'shotgun' && id !== 'sightline' && typeof cell.stk === 'number') cell.beforeKill = r1((cell.stk - 1) * dmg);
      cell.ttk100 = r2(gunTTK(g, d, 1, mulberry(d * 17 + 1)).mean);
      if (id === 'shotgun') {
        // Realistic Ballast: the real spread (hip), and aimed in for reference.
        const hip = { ...g, shot: (dd, rng, full) => ballastShell(dd, rng, { firstShell: full }).total };
        const ads = { ...g, shot: (dd, rng, full) => ballastShell(dd, rng, { firstShell: full, aimed: true }).total };
        const mh = ballastMean(d, {}), ma = ballastMean(d, { aimed: true });
        cell.spreadShellDmg = r1(mh.dmg); cell.pelletsLanding = r1(mh.pellets); cell.adsShellDmg = r1(ma.dmg);
        cell.ttkReal = r2(gunTTK(hip, d, 1, mulberry(d * 31 + 2), 2000).mean);
        cell.ttkRealAds = r2(gunTTK(ads, d, 1, mulberry(d * 37 + 3), 2000).mean);
        cell.hitRate = r2(mh.pellets / SHOTGUN.pellets);
      } else {
        const p = hitRate(g.cls, d);
        cell.hitRate = p;
        cell.ttkReal = r2(gunTTK(g, d, p, mulberry(d * 53 + 5)).mean);
      }
    } else { cell.ttk100 = null; cell.ttkReal = null; }
    row.byDistance[d] = cell;
  }
  sheet.primaries[id] = row;
}
// ---- Ichor ----
{
  const row = { name: 'Ichor (from 0 blood)', class: 'melee', interval: ICHOR.interval, magazine: '∞', reload: 0, intended: [2, 2], note: `reach ${r2(ichorReach)} m to centre; damage ${ICHOR.damage}->${ICHOR.maxDamage} with blood`, byDistance: {} };
  const full = { name: 'Ichor (full blood)', class: 'melee', interval: ICHOR.interval, magazine: '∞', reload: 0, intended: [2, 2], note: 'blood 100 at the start (needs ~12 hits to fill)', byDistance: {} };
  for (const d of D) {
    const inR = d <= ichorReach;
    const mk = (blood) => {
      if (!inR) return { dmg: 0, ttk100: null, ttkReal: null };
      const a = [], b = [], rA = mulberry(d * 3 + blood), rB = mulberry(d * 5 + blood + 1);
      for (let k = 0; k < TRIALS; k++) { a.push(ichorRun(1, rA, { blood })); b.push(ichorRun(.8, rB, { blood })); }
      const dm = ichorDamage(blood);
      return { dmg: r2(dm), burstDps: r1(dm / ICHOR.interval), sustDps: r1(dm / ICHOR.interval), stk: blood ? Math.ceil(HP / dm) : Math.round((mean(a) - ICHOR.contact) / ICHOR.interval) + 1, magKills: true, ttk100: r2(mean(a)), hitRate: .8, ttkReal: r2(mean(b)) };
    };
    row.byDistance[d] = mk(0); full.byDistance[d] = mk(100);
  }
  sheet.primaries.ichor = row; sheet.primaries.ichorFull = full;
}
// ---- Sheath ----
{
  const row = { name: 'Sheath', class: 'melee', interval: SHEATH.interval, magazine: '∞', reload: 0, intended: [2, 2], note: `reach ${r2(sheathRange)} m to centre (x${SHEATH.rushReach} in Gold Rush: ${r2(sheathReach(0, true) + BODY)} m); first swing is the draw`, byDistance: {} };
  for (const d of D) {
    const inR = d <= sheathRange;
    if (!inR) { row.byDistance[d] = { dmg: 0, ttk100: null, ttkReal: null }; continue; }
    const a = [], b = [], rA = mulberry(d * 7), rB = mulberry(d * 11);
    for (let k = 0; k < TRIALS; k++) { a.push(sheathRun(1, rA)); b.push(sheathRun(.8, rB)); }
    row.byDistance[d] = { dmg: SHEATH.damage, burstDps: r1(SHEATH.damage / SHEATH.interval), sustDps: r1(SHEATH.damage / SHEATH.interval), stk: `${Math.ceil(HP / (SHEATH.damage + SHEATH.damageRoll))}-${Math.ceil(HP / (SHEATH.damage - SHEATH.damageRoll))}`, magKills: true, ttk100: r2(mean(a)), hitRate: .8, ttkReal: r2(mean(b)) };
  }
  sheet.primaries.sheath = row;
}
// ---- Static (volley and stream) ----
{
  const v = staticVolley(12), still = staticRefill(12, true), moving = staticRefill(12, false);
  const row = { name: 'Static 12-orb volley', class: 'slow', interval: RULES.seedInterval, magazine: RULES.maxSeeds, reload: r2(moving), intended: [5, 12],
    note: `volley ${r1(v.direct)} direct + ${r1(v.blast)} blast = ${r1(v.total)}; place 12 in ${r2(placeTime(12))} s; refill 12 in ${r2(moving)} s moving / ${r2(still)} s still; blast radius ${r2(v.radius)} m hits yourself`, byDistance: {} };
  const stream = { name: 'Static stream (C)', class: 'fast', interval: RULES.sprayAmmoTime, magazine: RULES.maxSeeds, reload: r2(moving), intended: [2, 5], note: `inner cone ${r1(RULES.sprayInnerDPS)} dps x1->x${RULES.sprayMaxMultiplier} over ${RULES.sprayRampTime} s, ${RULES.sprayRange} m, ${r2(RULES.maxSeeds * RULES.sprayAmmoTime)} s per 12 orbs`, byDistance: {} };
  for (const d of D) {
    const a = [], b = [], rA = mulberry(d * 13), rB = mulberry(d * 19);
    for (let k = 0; k < TRIALS; k++) { a.push(staticRun(d, 1, rA)); b.push(staticRun(d, hitRate('slow', d), rB)); }
    const bf = b.filter(Number.isFinite);
    const selfDmg = Math.max(0, d - RULES.radius) <= v.radius ? r1(v.blastDamage * splashFalloff(Math.max(0, d - RULES.radius), v.radius, 12)) : 0;
    row.byDistance[d] = { dmg: r1(v.total), burstDps: r1(v.total / (placeTime(12) + orbFlight(d))), sustDps: r1(v.total / (moving + orbFlight(d))), stk: 1, magKills: true, ttk100: r2(mean(a)), hitRate: hitRate('slow', d), ttkReal: r2(mean(bf)), selfDmg };
    const st = streamTTK(d), base = d - .65 <= RULES.sprayRange ? RULES.sprayInnerDPS * (1 - (RULES.sprayFalloff ?? .25) * (d - .65) / RULES.sprayRange) : 0;
    stream.byDistance[d] = base ? { dmg: r1(base) + '/s', burstDps: r1(base * RULES.sprayMaxMultiplier), sustDps: r1(Math.min(streamTTK(d, 12).dmg, HP) / (RULES.maxSeeds * RULES.sprayAmmoTime + moving)), stk: '—', magKills: st.ttk !== null, ttk100: r2(st.ttk ?? Infinity), dmgPer12: r1(st.dmg), hitRate: null, ttkReal: null } : { dmg: 0, ttk100: null, ttkReal: null };
  }
  sheet.primaries.static = row; sheet.primaries.staticStream = stream;
}

// ---- abilities ----
const v12 = staticVolley(12);
const hexBest = hexPulseDamageAt(hexPower(6), 0);
const breach = (SIGHTLINE.damageMin + SIGHTLINE.damageMax) / 2 + SIGHTLINE.blastDamage;
const omenE = OMEN.primeDamage + 6 * OMEN.tickDamage + omenBlastDamage(0);
const omenX = OMEN.volleyCount * OMEN.volleyDamage + 7 * OMEN.tickDamage + omenBlastDamage(0);
const frenzy = b => ICHOR.frenzyDamage + (ICHOR.frenzyMax - ICHOR.frenzyDamage) * b;
const surgeBonus = Math.floor(SURGE.duration / RIFLE.interval + 1e-9 + 1) * rifleDamage(0) * (SURGE.damage - 1);
sheet.abilities = {
  rifle: [
    { key: 'E', name: 'Grenade', dmg: GRENADE.damage + GRENADE.bonus, cooldown: GRENADE.cooldown, note: `core ${GRENADE.coreRadius} m, ${GRENADE.edgeDamage + GRENADE.bonus} at ${GRENADE.radius} m; ${r2(GRENADE.windup + GRENADE.fuse)} s to explode; +${GRENADE.surgeBonus - GRENADE.bonus} in Surge` },
    { key: 'X', name: 'Surge/Nova', buff: true, dmg: r1(surgeBonus), cooldown: SURGE.cooldown + SURGE.charge + SURGE.duration, note: `${SURGE.charge} s charge, ${SURGE.duration} s of x${SURGE.damage} bullets, no ammo; dmg = extra over normal fire (100% hits)` },
  ],
  shotgun: [
    { key: 'E', name: 'Double', window: SHOTGUN.doubleDelay, dmg: r1(ballastShell(2, null, { perfect: true, firstShell: true }).total + ballastShell(2, null, { perfect: true }).total), cooldown: 0, note: `both shells ${SHOTGUN.doubleDelay} s apart at 2 m, all pellets (x${SHOTGUN.aimClose} aimed in point blank: ${r1((shotgunDamage(true) + shotgunDamage()) * SHOTGUN.aimClose)})` },
    { key: 'X', name: 'Scatter', dmg: SCATTER.max, cooldown: SCATTER.cooldown, note: `cap per target; primed ${SCATTER.prime} s before it can fire` },
  ],
  omen: [
    { key: 'E', name: 'Curse + rupture', dmg: r1(omenE), cooldown: OMEN.primeCooldown, note: `prime ${OMEN.primeDamage} + 6 ticks x ${OMEN.tickDamage} + late rupture ${omenBlastDamage(0)} (±${OMEN.curseBlastVariance}); uses a round` },
    { key: 'X', name: 'Covenant + rupture', dmg: r1(omenX), cooldown: OMEN.volleyCooldown, note: `3 x ${OMEN.volleyDamage} homing + ticks + rupture (one mark per target: E and X marks never stack)` },
  ],
  sightline: [
    { key: 'X', name: 'Breach round', window: 0, dmg: r1(breach), cooldown: SIGHTLINE.xCooldown + SIGHTLINE.reload, note: `${SIGHTLINE.reload} s load, direct ${r1(breach)} (+ muzzle blast ${SIGHTLINE.muzzleDamage} within ${SIGHTLINE.muzzleRadius} m)` },
    { key: 'E', name: 'Stance', dmg: 0, cooldown: 0, note: `${r2(SIGHTLINE.setupDuration)} s to set up; rooted` },
  ],
  sidekick: [
    { key: 'E', name: 'Mines x2', dmg: 2 * SIDEKICK.mineDamage, cooldown: SIDEKICK.mineCooldown, note: `${SIDEKICK.mineDamage}±${SIDEKICK.mineRoll} each, core ${SIDEKICK.mineCore} m, trigger ${SIDEKICK.mineTrigger} m, arm ${SIDEKICK.mineArm} s; both stacked on one spot` },
    { key: 'X', name: 'Rush', buff: true, dmg: r1(SIDEKICK.duration / (SIDEKICK.interval / SIDEKICK.fireRate) * SIDEKICK.damage - SIDEKICK.duration * (SIDEKICK.magazine * SIDEKICK.damage) / ((SIDEKICK.magazine - 1) * SIDEKICK.interval + SIDEKICK.reload)), cooldown: SIDEKICK.xCooldown, note: `${SIDEKICK.duration} s at ${SIDEKICK.fireRate}x rate, no reloads; dmg = extra over normal fire (100% hits)` },
  ],
  ichor: [
    { key: 'E', name: 'Blood slash', dmg: ICHOR.waveDamage, cooldown: ICHOR.eCooldown, note: `needs ${ICHOR.eBlood}% blood; ${ICHOR.waveRange} m at ${ICHOR.waveSpeed} m/s; costs you ${ICHOR.waveDamage * ICHOR.waveCost} hp` },
    { key: 'X', name: 'Frenzy', window: r2((ICHOR.hits - 1) * ICHOR.frenzyInterval + ICHOR.contact), dmg: frenzy(1), cooldown: ICHOR.xCooldown, note: `${frenzy(0)}-${frenzy(1)} by blood over ${r2(ICHOR.hits * ICHOR.frenzyInterval)} s; drains ${r1(ICHOR.healthDrain * ICHOR.hits * ICHOR.frenzyInterval)} hp; per-hit ${r1(frenzy(0) / ICHOR.hits)}-${r1(frenzy(1) / ICHOR.hits)} vs slash ${ICHOR.damage}-${ICHOR.maxDamage}` },
  ],
  sheath: [
    { key: 'E', name: 'Gold Rush', dmg: 0, cooldown: SHEATH.eCooldown, note: `${SHEATH.rushDuration} s, x${SHEATH.rushSpeed} speed, reach x${SHEATH.rushReach}` },
    { key: 'X', name: 'Draw-cut', dmg: SHEATH.xDamage, cooldown: SHEATH.xCooldown, note: `±${SHEATH.xRoll}, ${SHEATH.xRange} m line, contact ~.29-.43 s after press` },
  ],
  static: [
    { key: 'X', name: 'Hex', dmg: r1(hexBest + RULES.hexEdgeDamage), cooldown: RULES.hexCooldown, note: `pulse ${r1(hexBest)} at full size (after ${r2(6 / RULES.hexSpeed)} s of travel) + one zap ${r1(RULES.hexEdgeDamage)}; costs ${RULES.hexCost} orbs` },
  ],
};
// one-shot check on abilities
for (const [id, list] of Object.entries(sheet.abilities)) for (const a of list) a.oneShot = !a.buff && a.dmg >= HP;

// ---- combos (100% hits, mean rolls, target stationary) ----
const combos = sheet.combos;
{ // Nominal at 8 m
  const d = 8, dm = GUNS.rifle.mean(d), fl = travelAt(d, RIFLE_MUZZLE.forward) / RIFLE.bulletSpeed, gT = GRENADE.windup + GRENADE.fuse;
  const fire = (t0, until, mult = 1, ammo = RIFLE.magazine, noAmmo = false) => gunEvents({ t0, interval: RIFLE.interval, magazine: noAmmo ? 1e9 : RIFLE.magazine, reload: RIFLE.reload, ammo: noAmmo ? 1e9 : ammo, delay: fl, dmg: dm * mult, until });
  const surgeFire = t0 => [...fire(0, t0 - 1e-9), ...fire(t0, t0 + SURGE.duration, SURGE.damage, RIFLE.magazine, true)];
  combos.rifle = [
    { name: 'primary only', d, ...kt(fire(0, 30)) },
    { name: 'E grenade (core) + fire', d, ...kt([...fire(0, 30), { t: gT, dmg: GRENADE.damage + GRENADE.bonus }]) },
    { name: 'X Surge from press (2 s charge, firing through it)', d, ...kt(surgeFire(SURGE.charge)) },
    { name: 'Surge pre-charged + grenade (+20) + fire', d, ...kt([...fire(0, SURGE.duration, SURGE.damage, 0, true), { t: gT, dmg: GRENADE.damage + GRENADE.surgeBonus }]) },
    { name: 'Surge pre-charged, fire only', d, ...kt(fire(0, SURGE.duration, SURGE.damage, 0, true)) },
  ];
}
{ // Ballast at 2 m and 4 m
  const out = [];
  for (const d of [2, 3, 4]) {
    const full = ballastShell(d, null, { perfect: true, firstShell: true }).total + ballastShell(d, null, { perfect: true }).total;
    const hip = ballastMean(d, { firstShell: true }).dmg + ballastMean(d, {}).dmg, ads = ballastMean(d, { firstShell: true, aimed: true }).dmg + ballastMean(d, { aimed: true }).dmg;
    out.push({ name: `E double (both shells) at ${d} m`, d, dmgAllPellets: r1(full), dmgHipSpread: r1(hip), dmgAdsSpread: r1(ads), ttk: full >= HP ? SHOTGUN.doubleDelay : null, oneShot: full >= HP, spreadOneShot: hip >= HP || ads >= HP });
  }
  combos.shotgun = out;
}
{ // Omen at 8 m: search over rupture time
  const d = 8, fl = travelAt(d, OMEN.muzzle) / OMEN.speed, dm = GUNS.omen.mean(d);
  const base = (skipFirst) => gunEvents({ t0: skipFirst ? OMEN.interval : 0, interval: OMEN.interval, magazine: OMEN.magazine, reload: OMEN.reload, ammo: skipFirst ? OMEN.magazine - 1 : OMEN.magazine, delay: fl, dmg: dm, until: 30 });
  const curse = (hit, dur) => { const e = []; for (let k = 1; k * OMEN.tick < dur - 1e-9; k++) e.push({ t: hit + k * OMEN.tick, dmg: OMEN.tickDamage }); return e; };
  const best = (evs, hit, dur) => { let bestT = Infinity, bestR = null, bestBefore = null; for (let r = hit + .01; r < hit + dur; r += .01) { const pre = evs.filter(e => e.t <= r).concat(curse(hit, dur).filter(e => e.t <= r)); const t = killTime([...pre, { t: r, dmg: omenBlastDamage(dur - (r - hit)) }, ...evs.filter(e => e.t > r)]); if (t < bestT) { bestT = t; bestR = r; bestBefore = killTime.before; } } return { t: bestT, r: bestR, before: bestBefore }; };
  const eHit = fl;
  const e1 = best([...base(true), { t: eHit, dmg: OMEN.primeDamage }], eHit, OMEN.curseDuration);
  const xFl = travelAt(d, OMEN.muzzle) / OMEN.volleySpeed;
  const e2 = best([...base(true), { t: eHit, dmg: OMEN.primeDamage }, ...[0, 1, 2].map(() => ({ t: xFl, dmg: OMEN.volleyDamage }))], eHit, OMEN.curseDuration);
  // X alone marks: ticks for volleyLeft (4 s from cast), rupture by volleyLeft
  const x1 = best([...base(false), ...[0, 1, 2].map(() => ({ t: xFl, dmg: OMEN.volleyDamage }))], xFl, OMEN.volleyDuration - xFl);
  combos.omen = [
    { name: 'primary only', d, ...kt(base(false)) },
    { name: 'E curse + best-timed rupture + fire', d, ttk: r2(e1.t), before: r1(e1.before), ruptureAt: r2(e1.r) },
    { name: 'X covenant + fire + rupture', d, ttk: r2(x1.t), before: r1(x1.before), ruptureAt: r2(x1.r) },
    { name: 'E + X together (X diamonds cannot mark a cursed target) + fire + rupture', d, ttk: r2(e2.t), before: r1(e2.before), ruptureAt: r2(e2.r) },
  ];
}
{ // Sightline
  const out = [];
  for (const d of [8, 16, 22]) {
    const fl = travelAt(d, SIGHTLINE.muzzleForward) / SIGHTLINE.speed;
    out.push({ name: `X Breach, loaded & set up, at ${d} m`, d, ttk: r2(SIGHTLINE.commit + fl), dmg: r1(breach), oneShot: breach >= HP, note: `+${SIGHTLINE.reload} s load, +${r2(SIGHTLINE.setupDuration)} s stance` });
  }
  const nRoll = Math.round((SIGHTLINE.damageMax - SIGHTLINE.damageMin) / .2) + 1, p1 = Array.from({ length: nRoll }, (_, k) => SIGHTLINE.damageMin + k * .2).filter(x => x >= HP - 1e-9).length / nRoll;
  out.push({ name: `rifle one-shot chance (${SIGHTLINE.damageMin}-${SIGHTLINE.damageMax} roll vs ${HP} hp)`, d: null, chance: r2(p1) });
  combos.sightline = out;
}
{ // Sidekick at 8 m
  const d = 8, fl = travelAt(d, .79) / SIDEKICK.speed, dm = SIDEKICK.damage;
  const normal = (t0 = 0, ammo = SIDEKICK.magazine) => gunEvents({ t0, interval: SIDEKICK.interval, magazine: SIDEKICK.magazine, reload: SIDEKICK.reload, ammo, delay: fl, dmg: dm });
  const rush = t0 => gunEvents({ t0, interval: SIDEKICK.interval / SIDEKICK.fireRate, magazine: 1e9, reload: 0, delay: fl, dmg: dm, until: t0 + SIDEKICK.duration });
  combos.sidekick = [
    { name: 'primary only', d, ...kt(normal()) },
    { name: 'X Rush from press (summon .55 s)', d, ...kt(rush(SIDEKICK.summon)) },
    { name: 'target steps on 2 stacked mines, then fire (t from trigger)', d, ...kt([{ t: 0, dmg: 2 * SIDEKICK.mineDamage }, ...normal()]) },
    { name: '2 mines + Rush already running', d, ...kt([{ t: 0, dmg: 2 * SIDEKICK.mineDamage }, ...rush(0)]) },
  ];
}
{ // Ichor at 2 m
  const hitsTo = per => Math.ceil(HP / per - 1e-9);
  const fr = frenzy(1) / ICHOR.hits, sl = ichorDamage(100), waveT = travelAt(2, 0) / ICHOR.waveSpeed;
  combos.ichor = [
    { name: 'full blood, slashes only', d: 2, ttk: r2((hitsTo(sl) - 1) * ICHOR.interval + ICHOR.contact), before: r1((hitsTo(sl) - 1) * sl) },
    { name: 'full blood, X frenzy only', d: 2, ttk: hitsTo(fr) <= ICHOR.hits ? r2((hitsTo(fr) - 1) * ICHOR.frenzyInterval + ICHOR.contact) : null, before: r1((hitsTo(fr) - 1) * fr), note: `kills on strike ${hitsTo(fr)} of ${ICHOR.hits} (${r1(fr)} each, ${r1(fr * ICHOR.hits)} in all); drains ${r1(ICHOR.healthDrain * ICHOR.hits * ICHOR.frenzyInterval)} hp` },
    { name: 'full blood, E wave then X frenzy', d: 2, ...kt([{ t: waveT, dmg: ICHOR.waveDamage }, ...Array.from({ length: ICHOR.hits }, (_, k) => ({ t: 1 / 60 + k * ICHOR.frenzyInterval + ICHOR.contact, dmg: fr }))]) },
    { name: 'full blood, E wave then slashes', d: 2, ...kt([{ t: waveT, dmg: ICHOR.waveDamage }, ...Array.from({ length: 12 }, (_, k) => ({ t: ICHOR.interval * (k + 1) + ICHOR.contact, dmg: sl }))]) },
    { name: 'no blood, X frenzy', d: 2, ttk: frenzy(0) >= HP ? r2((hitsTo(frenzy(0) / ICHOR.hits) - 1) * ICHOR.frenzyInterval + ICHOR.contact) : null, dmg: frenzy(0), note: frenzy(0) >= HP ? 'kills alone' : 'cannot kill alone' },
    { name: 'half blood, X frenzy', d: 2, ttk: frenzy(.5) >= HP ? r2((hitsTo(frenzy(.5) / ICHOR.hits) - 1) * ICHOR.frenzyInterval + ICHOR.contact) : null, before: r1((hitsTo(frenzy(.5) / ICHOR.hits) - 1) * frenzy(.5) / ICHOR.hits), dmg: frenzy(.5), note: frenzy(.5) >= HP ? 'kills alone' : 'cannot kill alone' },
  ];
}
{ // Sheath: Draw-cut from 5 m then slashes (MC for the rolls)
  const d = 5, tell = SHEATH.xBack + SHEATH.xTell, dash = Math.max(0, SHEATH.xRange - SHEATH.xShort) / SHEATH.xDashSpeed;
  const contact = tell + Math.max(0, d + SHEATH.xBackDist - SHEATH.xLead - (SHEATH.xWidth + BODY)) / SHEATH.xDashSpeed; // REPLICATED drawCutSweep geometry
  const free = tell + dash + SHEATH.xStrike + SHEATH.xFlourish;
  const rng = mulberry(99), res = []; let three = 0;
  for (let k = 0; k < TRIALS; k++) { const hp = HP - sheathDrawCutDamage(rng); const t = sheathRun(1, rng, { hp, t0: free }); res.push(t); if (t < free + SHEATH.drawWindup + 3 * SHEATH.interval) three++; }
  combos.sheath = [
    { name: 'primary only (2 m)', d: 2, ttk: sheet.primaries.sheath.byDistance[2].ttk100 },
    { name: `X Draw-cut from ${d} m, then slashes`, d, ttk: r2(mean(res)), contactAt: r2(contact), freeAt: r2(free), before: r1(SHEATH.xDamage + 2 * SHEATH.damage), note: `${SHEATH.xDamage} + 3 slashes averages ${SHEATH.xDamage + 3 * SHEATH.damage}: kills in 3 slashes ${Math.round(three / TRIALS * 100)}% of the time` },
    { name: 'E Gold Rush: same TTK, but engages from ' + r2(sheathReach(0, true) + BODY) + ' m', d: 5, ttk: sheet.primaries.sheath.byDistance[2].ttk100 },
  ];
}
{ // Static
  const s2 = streamTTK(2), s5 = streamTTK(5), s8 = streamTTK(8);
  combos.static = [
    { name: 'full 12-orb volley at 8 m (placement + flight)', d: 8, ttk: r2(placeTime(12) + orbFlight(8)), dmg: r1(v12.total) },
    { name: 'stream from 12 orbs at 2 m', d: 2, ttk: r2(s2.ttk), dmg: r1(s2.dmg) },
    { name: 'stream from 12 orbs at 5 m', d: 5, ttk: r2(s5.ttk), dmg: r1(s5.dmg) },
    { name: 'stream from 12 orbs at 8 m', d: 8, ttk: r2(s8.ttk), dmg: r1(s8.dmg) },
    { name: 'smallest one-shot volley', d: null, orbs: [...Array(12).keys()].map(n => n + 1).find(n => staticVolley(n).total >= HP) },
  ];
}

// ---- damage per 30 s window (fresh cooldowns; primary at its intended range, 100% hits) ----
const uses = cd => cd > 0 ? 1 + Math.floor((30 - 1e-9) / cd) : 0;
for (const [id, list] of Object.entries(sheet.abilities)) {
  const prim = { rifle: 'rifle', shotgun: 'shotgun', omen: 'omen', sightline: 'sightline', sidekick: 'sidekick', ichor: 'ichor', sheath: 'sheath', static: 'static' }[id];
  const row = sheet.primaries[prim], d = row.intended[0];
  const cell = row.byDistance[d] || {}, cycle = (SHOTGUN.shells - 1) * SHOTGUN.interval + SHOTGUN.reload;
  const primary = (id === 'shotgun' ? (ballastMean(d, { firstShell: true }).dmg + ballastMean(d, {}).dmg) / cycle : (cell.sustDps || 0)) * 30;
  const abil = list.filter(a => a.cooldown > 0 && a.dmg > 0).map(a => ({ key: a.key, uses: uses(a.cooldown), dmg: r1(uses(a.cooldown) * a.dmg) }));
  sheet.window30[id] = { at: d, primary: r1(primary), abilities: abil, total: r1(primary + abil.reduce((s, a) => s + a.dmg, 0)) };
}

// ---- movement ----
const dodgeOf = id => ({ sheath: SHEATH.dodges, ichor: ICHOR.dodges, sightline: SIGHTLINE.dodges, shotgun: SHOTGUN.dodges })[id] ?? RULES.maxStamina; // REPLICATED Simulation.maxStamina getter
const rechargeOf = id => RULES.staminaRecharge * ({ sheath: SHEATH.dashRechargeScale, ichor: ICHOR.dashRechargeScale, sightline: SIGHTLINE.dashRechargeScale })[id] || RULES.staminaRecharge; // REPLICATED Simulation.staminaRate
sheet.movement = {
  base: { speed: RULES.speed, dodgeDistance: RULES.dodgeDistance, dodgeDuration: RULES.dodgeDuration, staminaDelay: RULES.staminaDelay },
  static: { dodges: dodgeOf('static'), rechargeS: rechargeOf('static'), mult: {}, note: `streaming pushes you back ${RULES.sprayRecoil} m/s (6% of that walking backwards)` },
  rifle: { dodges: dodgeOf('rifle'), rechargeS: r2(RULES.staminaRecharge / RIFLE.stationaryStamina) + ' still / ' + RULES.staminaRecharge + ' moving', mult: { aimIn: RIFLE.aimMoveMultiplier, surge: r2(SURGE.speed) }, note: RIFLE.maxStamina !== undefined ? `RIFLE.maxStamina = ${RIFLE.maxStamina} is never read (Nominal gets RULES.maxStamina ${RULES.maxStamina})` : undefined },
  shotgun: { dodges: dodgeOf('shotgun'), rechargeS: rechargeOf('shotgun'), mult: { aimIn: RIFLE.aimMoveMultiplier }, note: `each shell launches you ${r1(SHOTGUN.recoil * SHOTGUN.launchScale / 8)} m back (double: ${r1(SHOTGUN.recoil * SHOTGUN.doubleRecoilScale * SHOTGUN.launchScale / 8)} m); Scatter ${r1(SCATTER.recoil * 8 / 8)} m` },
  omen: { dodges: dodgeOf('omen'), rechargeS: rechargeOf('omen'), mult: {} },
  sightline: { dodges: dodgeOf('sightline'), rechargeS: r2(rechargeOf('sightline')), mult: { aimIn: RIFLE.aimMoveMultiplier, stance: 0 } },
  sidekick: { dodges: dodgeOf('sidekick'), rechargeS: rechargeOf('sidekick'), mult: { aimIn: RIFLE.aimMoveMultiplier, rush: SIDEKICK.moveSpeed } },
  ichor: { dodges: dodgeOf('ichor'), rechargeS: r2(rechargeOf('ichor')), mult: { trail: ICHOR.trailSpeed, fullBlood: ICHOR.fullMove, frenzy: `${ICHOR.frenzyMove}-${r2(ICHOR.frenzyMove + .3)}`, swinging: ICHOR.attackMove, guard: ICHOR.guardMove } },
  sheath: { dodges: dodgeOf('sheath'), rechargeS: r2(rechargeOf('sheath')), mult: { sheathed: SHEATH.sheathedMove, out: SHEATH.outMove, swinging: SHEATH.attackMove, rush: SHEATH.rushSpeed, rushSwinging: r2(SHEATH.rushSpeed * SHEATH.attackMove), flourish: SHEATH.xFlourishMove } },
};

// ---- Simulation cross-check ----
if (!ARGS.has('--no-sim')) {
  const N = 12, sc = sheet.simCheck;
  const run = (key, weapon, input, dists, opt = {}) => { sc[key] = {}; for (const d of dists) { const m = simMean(weapon, d, input, opt.noSpread ? 1 : N, opt); sc[key][d + 'm'] = { ttk: r2(m.ttk), killed: r2(m.killedShare), dealt: r1(m.dealt) }; } };
  run('rifle (no spread)', 'rifle', SIM_INPUT.rifle(false), D, { noSpread: true });
  run('rifle (aimed in, real spread)', 'rifle', SIM_INPUT.rifle(true), D);
  run('ballast (hip, real spread)', 'shotgun', SIM_INPUT.shotgun(false), [2, 3, 5, 8]);
  run('ballast (aimed in, real spread)', 'shotgun', SIM_INPUT.shotgun(true), [2, 3, 5, 8]);
  run('omen (no spread)', 'omen', SIM_INPUT.omen(), D, { noSpread: true, maxT: 40 });
  run('sidekick (no spread)', 'sidekick', SIM_INPUT.sidekick(false), D, { noSpread: true });
  run('sidekick (aimed in, real spread)', 'sidekick', SIM_INPUT.sidekick(true), D);
  run('ichor (0 blood)', 'ichor', SIM_INPUT.ichor(), [1.5, 2, 2.5, 3]);
  run('sheath', 'sheath', SIM_INPUT.sheath(), [1.5, 2, 2.8, 3]);
  // Ballast E double at 2-4 m: damage of one double shot (all runs), real spread
  sc['ballast E double dmg'] = {};
  for (const d of [2, 3, 4]) for (const aiming of [false, true]) {
    const res = []; for (let k = 0; k < 40; k++) res.push(simRun('shotgun', d, (s, i) => ({ doubleShot: i === 0, aiming }), { seed: 500 + k, maxT: .6 }).dealt);
    sc['ballast E double dmg'][`${d} m${aiming ? ' aimed' : ' hip'}`] = { mean: r1(mean(res)), killShare: r2(res.filter(x => x >= HP).length / res.length) };
  }
  // Scatter damage by distance (primed, fired at the target)
  sc['scatter dmg'] = {};
  for (const d of [2, 4, 6, 8, 11]) {
    const res = []; for (let k = 0; k < 20; k++) res.push(simRun('shotgun', d, (s, i) => ({ scatter: i === 0 || i === Math.ceil(SCATTER.prime * 60) + 2 }), { seed: 900 + k, maxT: SCATTER.prime + 2, setup: s => { s.dev.cooldowns = true; } }).dealt);
    sc['scatter dmg'][d] = r1(mean(res));
  }
  // Static full volley: hold E, then launch at the target
  sc['static 12-orb volley'] = {};
  for (const d of [2, 5, 8, 12, 16, 22]) {
    const place = Math.ceil(placeTime(12) * 60) + 3;
    const r = simRun('static', d, (s, i) => ({ seed: i < place, launch: i === place + 1 }), { seed: 77 + d, maxT: 4 });
    sc['static 12-orb volley'][d] = { ttk: r2(r.ttk), dealt: r1(r.dealt), selfHp: r1(r.selfHp) };
  }
  sc['static stream (recoil pushes you)'] = {}; sc['static stream (distance held)'] = {};
  for (const d of [2, 5, 8]) {
    let r = simRun('static', d, () => ({ spray: true }), { seed: 3, maxT: 4 }); sc['static stream (recoil pushes you)'][d] = { ttk: r2(r.ttk), dealt: r1(r.dealt) };
    r = simRun('static', d, () => ({ spray: true }), { seed: 3, maxT: 4, pinPlayer: true }); sc['static stream (distance held)'][d] = { ttk: r2(r.ttk), dealt: r1(r.dealt) };
  }
  // Sightline rifle (scoped, crouched): share of single shots that kill
  sc['sightline rifle 1st shot'] = {};
  for (const d of [8, 16]) {
    const res = []; for (let k = 0; k < 40; k++) { let set = false; res.push(simRun('sightline', d, (s, i) => { if (i === 0) return { sightlineStance: true, aiming: true }; if (s.sightline.crouched && s.sightline.setup <= 1e-8 && s.sightline.rifleAmmo > 0 && !set) { set = true; return { fire: true, aiming: true }; } return { aiming: true }; }, { seed: 300 + k, maxT: 2.2, crouched: true }).dealt); }
    sc['sightline rifle 1st shot'][d] = { mean: r1(mean(res)), killShare: r2(res.filter(x => x >= HP).length / res.length) };
  }
  // Sightline Breach: load with X standing, crouch, fire
  sc['sightline breach'] = {};
  for (const d of [8, 16]) {
    let loaded = null;
    const r = simRun('sightline', d, (s, i) => {
      if (i === 0) return { sightlineX: true };
      if (s.sightline.special && !s.sightline.crouched && loaded === null) { loaded = i; return { sightlineStance: true }; }
      if (loaded !== null && s.sightline.crouched && s.sightline.setup <= 1e-8) return { fire: i % 2 === 0, aiming: true };
      if (loaded !== null) return { aiming: true };
      return {};
    }, { seed: 5, maxT: 12, crouched: true });
    sc['sightline breach'][d] = { dealt: r1(r.dealt), killed: r2(Number(Number.isFinite(r.ttk))) };
  }
}

// ---- outliers ----
const O = sheet.outliers, P = sheet.primaries;
const inBand = t => t != null && t >= BAND[0] && t <= BAND[1];
for (const [id, row] of Object.entries(P)) {
  if (id === 'staticStream' || id === 'ichorFull') continue;
  const cells = [...new Set(row.intended)].map(d => [d, row.byDistance[d]]);
  const real = cells.map(([d, c]) => `${d} m ${c?.ttkReal ?? '—'} s`).join(', ');
  if (cells.some(([, c]) => !inBand(c?.ttkReal))) O.push({ weapon: row.name, kind: 'realistic TTK outside band', detail: `intended range: ${real} (band ${BAND[0]}-${BAND[1]} s)` });
  const nd = cells.find(([, c]) => c && c.magKills === false);
  if (nd) O.push({ weapon: row.name, kind: 'magazine cannot kill', detail: id === 'sightline' ? `one round rolls ${SIGHTLINE.damageMin}-${SIGHTLINE.damageMax}: kills only ${Math.round(combos.sightline.at(-1).chance * 100)}% of the time, else a ${r2(SIGHTLINE.commit + SIGHTLINE.reload)} s wait` : `full magazine at ${nd[0]} m = ${r1(id === 'shotgun' ? nd[1].dmg * 2 : nd[1].dmg * row.magazine)} of ${HP}` });
}
for (const [id, list] of Object.entries(sheet.abilities)) for (const a of list) {
  if (a.oneShot) O.push({ weapon: id, kind: a.window <= .5 ? 'ability one-shots' : 'ability alone kills from full', detail: `${a.key} ${a.name}: ${a.dmg} single-target${a.window != null ? ` in ${a.window} s` : ''}` });
  if (a.buff && a.dmg >= HP) O.push({ weapon: id, kind: 'buff worth a kill on its own', detail: `${a.key} ${a.name}: +${a.dmg} extra damage over its duration at 100% hits` });
}
{ const sc = sheet.simCheck['ballast E double dmg']; if (sc) O.push({ weapon: 'Ballast', kind: 'E double in practice (sim, real spread)', detail: Object.entries(sc).map(([k, v]) => `${k} kills ${Math.round(v.killShare * 100)}%`).join(', ') }); }
if (v12.total >= HP) O.push({ weapon: 'Static', kind: 'primary one-shots', detail: `a full ${RULES.maxSeeds}-orb volley is ${r1(v12.total)}; ${combos.static.at(-1).orbs}+ orbs one-shot` });
// primary useless without abilities: realistic TTK > 2x band top at every intended distance
for (const [id, row] of Object.entries(P)) {
  if (['staticStream', 'ichorFull'].includes(id)) continue;
  const t = row.intended.map(d => row.byDistance[d]?.ttkReal);
  if (t.every(x => x == null || x > 2 * BAND[1])) O.push({ weapon: row.name, kind: 'primary weak without abilities', detail: `realistic TTK ${t.join(' / ')} s at ${row.intended.join(' / ')} m (> ${2 * BAND[1]} s)` });
}
{ const f = frenzy(1) / ICHOR.hits / ICHOR.frenzyInterval, s = ichorDamage(100) / ICHOR.interval; if (f < s) O.push({ weapon: 'Ichor', kind: 'ability weaker than primary', detail: `Frenzy ${r1(f)} dps vs slashes ${r1(s)} dps at full blood (${r1(frenzy(0) / ICHOR.hits / ICHOR.frenzyInterval)} vs ${r1(ichorDamage(0) / ICHOR.interval)} at none); frenzy also drains ${r1(ICHOR.healthDrain * ICHOR.hits * ICHOR.frenzyInterval)} hp` }); }
for (const [id, row] of Object.entries(P)) for (const [d, c] of Object.entries(row.byDistance)) if (c.beforeKill != null && c.beforeKill >= HP - NEAR && c.beforeKill < HP) O.push({ weapon: row.name, kind: 'near-miss breakpoint', detail: `${d} m: ${c.stk - 1} hits = ${c.beforeKill} (mean rolls), one more needed` });
for (const [id, list] of Object.entries(combos)) for (const c of list) if (c.before != null && c.ttk != null && c.before >= HP - NEAR && c.before < HP) O.push({ weapon: id, kind: 'near-miss breakpoint', detail: `${c.name}: ${c.before} just before the killing hit (mean rolls)` });
{ const three = SHEATH.xDamage + 3 * SHEATH.damage; if (Math.abs(three - HP) < 2) O.push({ weapon: 'Sheath', kind: 'near-miss breakpoint', detail: `Draw-cut + 3 slashes = ${three} (vs ${HP}); rolls decide a whole extra swing (.46 s)` }); }
{ const n = ICHOR.hits - 1, fr = frenzy(1) / ICHOR.hits * n; if (fr < HP && fr > HP - 2) O.push({ weapon: 'Ichor', kind: 'near-miss breakpoint', detail: `${n} full-blood frenzy hits = ${r1(fr)}; E wave + 5 full slashes = ${ICHOR.waveDamage + 5 * ichorDamage(100)}` }); }

// ---- stale player-facing text (items.js controls) ----
const WORD = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };
const num = s => WORD[s.toLowerCase()] ?? Number(s);
const CHECKS = [
  ['ichor', 'Cut', /from (\d+(?:\.\d+)?) to (\d+(?:\.\d+)?)/, [ICHOR.damage, ICHOR.maxDamage], 'slash damage range'],
  ['ichor', 'Cut', /deals (\d+)% more/, [Math.round((ICHOR.dashDamage - 1) * 100)], 'dash-cut bonus'],
  ['ichor', 'Deflect', /absorbs (\d+)–(\d+)/, [ICHOR.guardCapacity - ICHOR.guardRoll, ICHOR.guardCapacity + ICHOR.guardRoll], 'guard capacity'],
  ['ichor', 'Deflect', /moving (\d+)% slower/, [Math.round((1 - ICHOR.guardMove) * 100)], 'guard slow'],
  ['ichor', 'Deflect', /(\d+)-second cooldown/, [ICHOR.guardCooldown], 'guard cooldown'],
  ['ichor', 'Blood trail', /give (\d+)% faster/, [Math.round((ICHOR.trailSpeed - 1) * 100)], 'trail speed'],
  ['ichor', 'Blood trail', /gives (\d+)% extra speed/, [Math.round((ICHOR.fullMove - 1) * 100)], 'full-blood speed'],
  ['ichor', 'Blood trail', /(\d+(?:\.\d+)?)x E\/X recharge/, [ICHOR.fullRecharge], 'full-blood recharge'],
  ['ichor', 'Blood trail', /Above (\d+)% blood restores (\d+(?:\.\d+)?) health/, [ICHOR.regenThreshold, ICHOR.regen], 'regen'],
  ['ichor', 'Blood trail', /for (\w+) seconds/, [ICHOR.bleedDuration], 'bleed duration'],
  ['ichor', 'Blood slash', /at least (\d+)% blood/, [ICHOR.eBlood], 'E blood'],
  ['ichor', 'Blood slash', /(\d+)-second cooldown/, [ICHOR.eCooldown], 'E cooldown'],
  ['ichor', 'Frenzy', /(\w+) fast strikes over (\d+(?:\.\d+)?) seconds/, [ICHOR.hits, r2(ICHOR.hits * ICHOR.frenzyInterval)], 'frenzy hits/duration'],
  ['ichor', 'Frenzy', /(\d+)-second cooldown/, [ICHOR.xCooldown], 'X cooldown'],
  ['ichor', 'Dodge', /(\w+) dodges/, [ICHOR.dodges], 'dodges'],
  ['sidekick', 'Fire', /(\w+) rounds/, [SIDEKICK.magazine], 'magazine'],
  ['sidekick', 'Reload', /(\w+) seconds/, [SIDEKICK.reload], 'reload'],
  ['sidekick', 'Mine', /Arms in (\w+) second/, [SIDEKICK.mineArm], 'mine arm'],
  ['sidekick', 'Mine', /(\w+) ready mines/, [SIDEKICK.mineLimit], 'mine count'],
  ['sidekick', 'Mine', /refill in (\d+) seconds/, [SIDEKICK.mineCooldown], 'mine cooldown'],
  ['sidekick', 'Rush', /(\w+) seconds of/, [SIDEKICK.duration], 'rush duration'],
  ['sidekick', 'Rush', /(\d+(?:\.\d+)?)× fire rate and (\d+)% faster/, [SIDEKICK.fireRate, Math.round((SIDEKICK.moveSpeed - 1) * 100)], 'rush rate/speed'],
  ['sidekick', 'Rush', /(\d+)-second cooldown/, [SIDEKICK.xCooldown], 'rush cooldown'],
  ['sightline', 'Sightline stance', /then (\d+(?:\.\d+)?) seconds total/, [r2(SIGHTLINE.setupDuration)], 'stance setup'],
  ['sightline', 'Reload', /sightline, (\d+(?:\.\d+)?) seconds/, [SIGHTLINE.reload], 'rifle reload'],
  ['sightline', 'Breach round', /for (\d+(?:\.\d+)?) seconds/, [SIGHTLINE.reload], 'breach load'],
  ['sightline', 'Breach round', /About (\d+) direct damage, up to (\d+) landing splash/, [Math.round(breach), SIGHTLINE.blastDamage], 'breach damage'],
  ['sightline', 'Breach round', /(\d+)-second cooldown/, [SIGHTLINE.xCooldown], 'breach cooldown'],
  ['sightline', 'Aim / scope', /(\d+)-degree/, [SIGHTLINE.cone], 'scope cone'],
  ['sightline', 'Dodge', /(\w+) dodges/, [SIGHTLINE.dodges], 'dodges'],
  ['omen', 'Covenant', /(\w+) dodgable homing diamonds/, [OMEN.volleyCount], 'covenant count'],
  ['omen', 'Covenant', /(\w+) seconds to press again/, [OMEN.volleyDuration], 'covenant window'],
  ['omen', 'Prime curse', /every (half) second/, [OMEN.tick], 'curse tick'],
  ['omen', 'Dodge', /(\w+) dodge;/, [RULES.maxStamina], 'dodges'],
  ['shotgun', 'Double shot', /(\d+(?:\.\d+)?) seconds apart/, [SHOTGUN.doubleDelay], 'double delay'],
  ['shotgun', 'Dodge', /(\w+) dodges/, [SHOTGUN.dodges], 'dodges'],
  ['rifle', 'Dodge', /(\w+) dodge;/, [RULES.maxStamina], 'dodges'],
  ['static', 'Dodge', /(\w+) dodge;/, [RULES.maxStamina], 'dodges'],
  ['sheath', 'Slash', /about (\w+) a second/, [Math.round(1 / SHEATH.interval)], 'swing rate'],
];
for (const [id, action, re, expect, what] of CHECKS) {
  const w = WEAPONS.find(x => x.id === id), row = w?.controls.find(c => c[0] === action), text = row?.[2] || '';
  const m = text.match(re);
  if (!m) { sheet.staleText.push({ weapon: w?.name || id, action, what, problem: 'pattern not found (text changed?)' }); continue; }
  const got = m.slice(1).map(s => s === 'half' ? .5 : num(s));
  if (got.some((g, i) => Math.abs(g - expect[i]) > 1e-6)) sheet.staleText.push({ weapon: w.name, action, what, says: m[0], config: expect.join(' / ') });
}
{ // soft checks the regex list can't express
  const b = WEAPONS.find(x => x.id === 'shotgun').controls.find(c => c[0] === 'Fire')[2];
  if (/about half that at mid range/.test(b)) { const mid = shotgunFalloff(SHOTGUN.range / 2); if (Math.abs(mid - .5) > .1) sheet.staleText.push({ weapon: 'Ballast', action: 'Fire', what: 'mid-range fall-off', says: 'about half that at mid range', config: `${Math.round(mid * 100)}% at ${SHOTGUN.range / 2} m of travel (half is reached at ~${r1(SHOTGUN.range * (.25 + .75 * .5 / (1 - SHOTGUN_EDGE)))} m of travel); with hip spread only ~${Math.round(ballastMean(SHOTGUN.range / 2 + .96 + BODY, {}).pellets / SHOTGUN.pellets * 100)}% of pellets land there` }); }
  const e = WEAPONS.find(x => x.id === 'ichor').controls.find(c => c[0] === 'Blood slash')[2];
  if (!/health|hp|cost/i.test(e)) sheet.staleText.push({ weapon: 'Ichor', action: 'Blood slash', what: 'missing cost', says: '(no mention)', config: `casting costs the wielder ${ICHOR.waveCost * 100}% of the wave's rolled damage (~${ICHOR.waveDamage * ICHOR.waveCost} hp)` });
  const hints = WEAPONS.find(x => x.id === 'rifle');
  if (hints.touchButtons.extended.label === 'NOVA') sheet.staleText.push({ weapon: 'Nominal', action: 'X', what: 'naming', says: 'Nova (controls/touch)', config: 'SURGE in config/gameplay.js and surge.js' });
}

// ======================================================================
// Output
// ======================================================================
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(sheet, (k, v) => v === Infinity ? 'Infinity' : v, 1));
if (ARGS.has('--json')) { process.stdout.write(JSON.stringify(sheet, null, 1) + '\n'); process.exit(0); }

const pad = (s, n) => { s = s == null ? '—' : String(s); return s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length); };
const lpad = (s, n) => { s = s == null ? '—' : String(s); return s.length >= n ? s : ' '.repeat(n - s.length) + s; };
const fmt = x => x == null || x === Infinity || x === 'Infinity' ? '—' : x;
const line = (cols, w) => cols.map((c, i) => i === 0 ? pad(c, w[0]) : lpad(fmt(c), w[i])).join(' ');
const hr = t => console.log('\n' + t + '\n' + '-'.repeat(t.length));

hr(`PRIMARY — damage per hit by distance (0/— = out of range), ${HP} hp`);
let w = [22, 7, 7, 7, 7, 7, 7, 6, 5, 6, 8, 8];
console.log(line(['weapon', ...D.map(d => d + 'm'), 'intvl', 'mag', 'reload', 'burst', 'sust'], w));
for (const row of Object.values(P)) {
  const ref = row.byDistance[row.intended[0]] || {};
  console.log(line([row.name, ...D.map(d => row.byDistance[d]?.dmg || 0), r2(row.interval), row.magazine, row.reload, ref.burstDps, ref.sustDps], w));
}
console.log('(burst/sust DPS at the first intended distance; Ballast = every pellet landing; Static = 12-orb volley, reload = refill 12 moving)');

hr('PRIMARY — shots to kill / TTK at 100% hits (s)');
w = [22, 11, 11, 11, 11, 11, 11];
console.log(line(['weapon', ...D.map(d => d + 'm')], w));
for (const row of Object.values(P)) console.log(line([row.name, ...D.map(d => { const c = row.byDistance[d]; return c?.ttk100 == null ? '—' : `${c.stk ?? ''}${c.magKills === false ? '*' : ''} ${c.ttk100}`; })], w));
console.log('(* = a full magazine cannot kill from full health)');

hr('PRIMARY — realistic TTK (s) [hit rate]');
console.log(line(['weapon', ...D.map(d => d + 'm')], w));
for (const row of Object.values(P)) console.log(line([row.name, ...D.map(d => { const c = row.byDistance[d]; return c?.ttkReal == null ? '—' : `${c.ttkReal} [${Math.round((c.hitRate ?? 0) * 100)}%]`; })], w));
const bb = P.shotgun.byDistance;
console.log(`Ballast spread (hip): pellets landing ${D.map(d => `${d}m ${bb[d].pelletsLanding ?? '—'}`).join(', ')} of ${SHOTGUN.pellets}; aimed-in TTK ${D.map(d => `${d}m ${bb[d].ttkRealAds ?? '—'}`).join(', ')}`);
console.log(`Intended ranges: ${Object.values(P).map(r => `${r.name} ${r.intended[0]}${r.intended[1] !== r.intended[0] ? '-' + r.intended[1] : ''}m`).join('; ')}`);

hr('ABILITIES (best-case single target, 100% hits)');
w = [10, 3, 20, 7, 6, 60];
console.log(line(['weapon', 'key', 'ability', 'dmg', 'cd s', 'note'], w).replace(/ +$/, ''));
for (const [id, list] of Object.entries(sheet.abilities)) for (const a of list) console.log(pad(id, 10) + ' ' + pad(a.key, 3) + ' ' + pad(a.name, 20) + ' ' + lpad(a.dmg + (a.oneShot ? '!' : ''), 7) + ' ' + lpad(a.cooldown, 6) + '  ' + a.note);
console.log('(! = one-shots a full-health player)');

hr('COMBOS — time to kill from first press (s), 100% hits, mean rolls');
for (const [id, list] of Object.entries(combos)) for (const c of list) {
  const extra = Object.entries(c).filter(([k]) => !['name', 'ttk', 'd'].includes(k)).map(([k, v]) => `${k} ${v}`).join(', ');
  console.log(pad(id, 10) + ' ' + pad(c.name, 62) + ' ' + lpad(fmt(c.ttk), 6) + (extra ? '  ' + extra : ''));
}

hr('DAMAGE PER 30 s WINDOW (primary sustained at intended range + ability uses, fresh cooldowns, 100% hits)');
for (const [id, r] of Object.entries(sheet.window30)) console.log(pad(id, 10) + ` @${r.at}m  primary ${lpad(r.primary, 6)}  + ${r.abilities.map(a => `${a.key} x${a.uses} ${a.dmg}`).join(' + ') || '—'}  = ${r.total}`);

hr('MOVEMENT');
const mv = sheet.movement;
console.log(`base walk ${mv.base.speed} m/s; dodge ${mv.base.dodgeDistance} m in ${mv.base.dodgeDuration} s; stamina refill after ${mv.base.staminaDelay} s`);
for (const [id, m] of Object.entries(mv)) if (id !== 'base') console.log(pad(id, 10) + ` dodges ${m.dodges}, refill ${m.rechargeS} s each; ` + Object.entries(m.mult).map(([k, v]) => `${k} x${v}`).join(', ') + (m.note ? ` — ${m.note}` : ''));

if (Object.keys(sheet.simCheck).length) {
  hr('SIMULATION CROSS-CHECK (real game loop, stationary target, perfect aim; TTK s / killed share / mean dealt)');
  for (const [k, v] of Object.entries(sheet.simCheck)) console.log(pad(k, 34) + ' ' + Object.entries(v).map(([d, c]) => typeof c === 'object' ? `${/^\d+(\.\d+)?$/.test(d) ? d + 'm' : d}: ${c.ttk !== undefined ? fmt(c.ttk) + ' ' : ''}${c.killed !== undefined ? '(' + c.killed + ') ' : ''}${c.dealt !== undefined ? 'dealt ' + c.dealt : ''}${c.mean !== undefined ? c.mean + ' kill ' + c.killShare : ''}${c.selfHp !== undefined ? ' selfHp ' + c.selfHp : ''}` : `${d}m: ${c}`).join(' | '));
}

hr('OUTLIERS');
for (const o of O) console.log(`- ${o.weapon}: ${o.kind} — ${o.detail}`);
hr('STALE / MISMATCHED PLAYER-FACING TEXT (src/items.js controls)');
if (!sheet.staleText.length) console.log('none');
for (const s of sheet.staleText) console.log(`- ${s.weapon} > ${s.action} (${s.what}): says "${s.says ?? s.problem}"${s.config ? ` — config: ${s.config}` : ''}`);
console.log(`\nJSON: ${path.relative(process.cwd(), OUT)}`);
