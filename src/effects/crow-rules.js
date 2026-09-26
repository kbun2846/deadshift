// Hollow Wick's crows (stage 3, s3-sound): where they perch and how they
// behave. No three.js here (effects/crows.js draws them), so the rules run in
// node tests. Crows are cosmetic: nothing collides with them, they deal and
// take nothing, and they carry no simulation state.
//
// The rules (owner's brief, design notes: "Stale, dry, crows only"):
//  - They perch on the ridges of roofs, chimney caps, the meetinghouse's
//    ridge and belfry, headstones and table tombs, fence posts and wall tops,
//    and the hanging tree's branches (not the three crows world/hollow-props.js
//    already builds into it: those spots are left out).
//  - A shot, a blast, an impact or a falling body within CROWS.scatter (6 m)
//    sends them up: they take off away from it, circle, and land on another
//    perch well away from everyone. A living player walking close does too
//    (closer for a crow up on a roof than one on a post or on the ground).
//  - After gunfire they are silent for CROWS.hush seconds (no idle caws).
//  - After a death, 1-3 come down to the body after a while, hop and peck,
//    and scatter when anyone comes near.
//  - Now and then one to three fly over, high, without landing.
//  - Fewer on Potato and Performance (CROWS.counts).

export const CROWS = Object.freeze({
  // Perched (and visiting) crows per preset, and how many may fly over at once.
  counts: Object.freeze({ potato: 5, performance: 8, balanced: 12, quality: 16, extreme: 20 }),
  flyovers: Object.freeze({ potato: 1, performance: 1, balanced: 2, quality: 3, extreme: 3 }),
  // A shot's line, an impact, a blast or a body falling this close (m, level) scatters them.
  scatter: 6,
  // A living player this close (level) to a crow on the ground or a low perch
  // (under `lowPerch` m above the ground), or to one on a roof or a branch.
  approachLow: 5, approachHigh: 3.5, lowPerch: 2.5,
  // How far a scattered crow goes to land again, and how far that perch is
  // from every player and from what scared it.
  settle: Object.freeze([12, 34]), keepAway: 9,
  circle: Object.freeze([2.2, 4.5]), circleRadius: Object.freeze([3.5, 6.5]),
  speed: 7, cruise: Object.freeze([7.5, 10.5]),
  // Quiet after gunfire (s).
  hush: 24,
  // Idle caws from a perched crow, every so often (s) when not hushed.
  caw: Object.freeze([4, 11]),
  // The dead: how long before they come, how many, how long they stay, how close.
  visit: Object.freeze({ delay: Object.freeze([7, 14]), count: Object.freeze([1, 3]), stay: Object.freeze([28, 50]), radius: Object.freeze([.55, 1.1]), near: 6 }),
  // Overhead crossings.
  flyoverEvery: Object.freeze([16, 38]), flyoverHeight: Object.freeze([11, 14]),
  // Crows this far from every player are moved (unseen) to a perch nearer the
  // action every `gatherEvery` s, so a few crows still fill the screen.
  gather: 30, gatherEvery: Object.freeze([5, 11]), gatherRing: Object.freeze([9, 22]),
});

// Events that mean gunfire (the crows go quiet; the soundscape ducks too).
export const GUNFIRE = new Set(['rifleShot', 'shotgunShot', 'launch', 'sprayArc', 'hexPulse', 'scatterFire', 'surgeStart', 'grenadeExplosion', 'explosion']);
// Events whose own point is something landing or going off.
const IMPACTS = new Set(['rifleImpact', 'impactMark', 'wall', 'hit', 'propHit', 'propBreak', 'scatterBurst', 'scatterHit', 'hexZap', 'grenadeExplosion', 'explosion', 'kill']);
// Shots that travel along the shooter's aim (their line scares crows beside it).
const SHOTS = new Set(['rifleShot', 'shotgunShot', 'launch', 'sprayArc', 'scatterFire']);
export const SHOT_REACH = 28;

const mm = v => Math.round(v * 1000) / 1000;
// A point in a turned frame (three's rotation.y): local (lx, lz) about (x, z).
const turn = (x, z, a, lx, lz) => { const c = Math.cos(a), s = Math.sin(a); return [x + lx * c + lz * s, z - lx * s + lz * c]; };

// The roof's top line (as world/colonial-buildings.js roofProfile): [[z, y]].
function ridgeOf(r, H, e) {
  const R = r.rise;
  if (r.kind === 'saltbox') return { z: H * .32, y: e + R };
  if (r.kind === 'shed') return { z: r.high === 'front' ? H : -H, y: e + R };
  return { z: 0, y: e + R };
}
function profileHeight(r, H, e, z) {
  const R = r.rise, P = r.kind === 'saltbox' ? [[H, e], [H * .32, e + R], [-H, e]]
    : r.kind === 'gambrel' ? [[H, e], [H * .58, e + R * .7], [0, e + R], [-H * .58, e + R * .7], [-H, e]]
    : r.kind === 'shed' ? (r.high === 'front' ? [[H, e + R], [-H, e]] : [[H, e], [-H, e + R]]) : [[H, e], [0, e + R], [-H, e]];
  for (let i = 1; i < P.length; i++) { const [za, ya] = P[i - 1], [zb, yb] = P[i]; if ((z <= za && z >= zb) || (z >= za && z <= zb)) return za === zb ? Math.max(ya, yb) : ya + (yb - ya) * (z - za) / (zb - za); }
  return P[0][1];
}

// The hanging tree's branch tops in its own frame (world/hollow-props.js
// hangingTree), minus the three spots its built-in crows sit on.
export const HANGING_TREE_PERCHES = Object.freeze([
  [1.2, 3.47, .16, 1.4], [-1.49, 4.36, -.91, -.6], [-1.8, 6.18, .6, 2.4], [1.2, 5.68, -1.4, .3], [-.4, 6.68, -1.2, -1.9],
  // (Where the tree's model once carried three crows of its own that never
  // flew: the low branch's end and two up in the crown.)
  [4.1, 3.6, -.2, .6], [.9, 6.25, .8, -2.2], [-2.7, 4.95, -1.75, 1.4],
]);
// (None left: the hanging tree's crows are all perches of the flock.)
export const HANGING_TREE_BUILT_IN = Object.freeze([]);

// Every perch on a map: { x, y, z, yaw, kind, high, building?, propId? }.
// `props`: mapProps(map) (the angles props actually stand at); `heightAt`:
// the ground's height. Only Hollow Wick has crows, but it reads map data only.
export function crowPerches(map, props, heightAt) {
  const out = [], add = (x, z, y, yaw, kind, extra = {}) => out.push({ x: mm(x), y: mm(y), z: mm(z), yaw: mm(yaw), kind, ...extra });
  for (const b of map.buildings || []) {
    const r = b.roof; if (!r || r.kind === 'mound' || b.style !== 'colonial') continue;
    const e = b.height, base = b.baseY ?? heightAt(b.x, b.z), a = b.angle || 0, alongZ = r.axis === 'z';
    const L = alongZ ? b.d : b.w, H = (alongZ ? b.w : b.d) / 2, yaw = alongZ ? Math.PI / 2 : 0;
    // Roof frame (X along the ridge, Z across) to the building's frame.
    const toB = (x, z) => [x * Math.cos(yaw) + z * Math.sin(yaw), -x * Math.sin(yaw) + z * Math.cos(yaw)];
    const ridge = ridgeOf(r, H, e), belfry = b.features?.includes('belfry');
    const chimneys = b.chimneys || [];
    // Ridge boards: every 1.6 m or so, clear of chimneys and the belfry.
    const n = Math.max(2, Math.floor((L - 1) / 1.6));
    for (let i = 0; i < n; i++) {
      const x = -L / 2 + .6 + (L - 1.2) * (n === 1 ? .5 : i / (n - 1));
      if (chimneys.some(c => Math.abs(x - c.at) < c.w / 2 + .35)) continue;
      if (belfry && x > b.w / 2 - 3.2 - .4) continue;
      const [lx, lz] = toB(x, ridge.z), [wx, wz] = turn(b.x, b.z, a, lx, lz);
      add(wx, wz, base + ridge.y + .26, a + yaw + (i % 2 ? 0 : Math.PI), 'ridge', { high: true, building: b.id });
    }
    // Chimney caps: on the cap's edge beside the flues.
    for (const c of chimneys) {
      const across = c.across || 0, top = Math.max(profileHeight(r, H, e, across) + .75, profileHeight(r, H, e, across + c.d / 2) + .6);
      const [lx, lz] = toB(c.at + c.w / 2 - .02, across), [wx, wz] = turn(b.x, b.z, a, lx, lz);
      add(wx, wz, base + top + .02, a + yaw + Math.PI / 2, 'chimney', { high: true, building: b.id });
    }
    // The meetinghouse belfry's cap eave (colonial-buildings.js belfry).
    if (belfry) {
      const s = 3.2, bx = b.w / 2 - s / 2, stage = e + r.rise + .5, capTop = stage + 1.9 + .2;
      for (const [dx, dz] of [[1, 1], [-1, -1]]) {
        const [wx, wz] = turn(b.x, b.z, a, bx + dx * (s / 2 + .05), dz * (s / 2 + .05));
        add(wx, wz, base + capTop, a + (dx > 0 ? -Math.PI / 4 : Math.PI * .75), 'belfry', { high: true, building: b.id });
      }
    }
  }
  for (const p of props) {
    const a = p.angle || 0, g = (lx, lz) => { const [x, z] = turn(p.x, p.z, a, lx, lz); return [x, z, heightAt(x, z)]; };
    if (p.type === 'headstone') {
      if (p.lean && (Math.abs(p.lean[0]) > .12 || Math.abs(p.lean[1]) > .12)) continue;
      add(p.x, p.z, heightAt(p.x, p.z) + (p.h ?? .78) * (p.size ?? 1) + .02, a, 'headstone', { propId: p.id });
    } else if (p.type === 'tableTomb') {
      const [x, z] = turn(p.x, p.z, a, .5, 0);
      add(x, z, heightAt(p.x, p.z) + .8, a + 1.2, 'tomb', { propId: p.id });
    } else if (p.type === 'railFence') {
      const L = p.span || 3, [x, z, y] = g(-L / 2, 0);
      add(x, z, y + 1.16, a + Math.PI / 2, 'post', { propId: p.id });
    } else if (p.type === 'splitRail') {
      const L = p.span || 3, flip = p.flip ? -1 : 1, [x, z, y] = g(-L / 2, -.35 * flip);
      add(x, z, y + 1.12, a + .4, 'post', { propId: p.id });
    } else if (p.type === 'fieldWall') {
      for (const lx of [-1.2, .9]) { const [x, z] = turn(p.x, p.z, a, lx, 0); add(x, z, heightAt(p.x, p.z) + (heightAt(x, z) - heightAt(p.x, p.z)) + 1.02, a + (lx > 0 ? 0 : Math.PI), 'wall', { propId: p.id }); }
    } else if (/^fieldWall\d$/.test(p.type)) {
      const len = Number(p.type.slice(9)), spots = len >= 4 ? [-len / 2 + .5, len / 2 - .5] : [0];
      for (const lx of spots) { const [x, z] = turn(p.x, p.z, a, lx, 0); add(x, z, heightAt(p.x, p.z) + 1.0, a + (lx > 0 ? 0 : Math.PI), 'wall', { propId: p.id }); }
    } else if (p.type === 'hangingTree') {
      const base = heightAt(p.x, p.z);
      for (const [lx, ly, lz, yaw] of HANGING_TREE_PERCHES) { const [x, z] = turn(p.x, p.z, a, lx, lz); add(x, z, base + ly, a + yaw, 'branch', { high: true, propId: p.id }); }
    }
  }
  return out;
}

// A small seeded random (the same crows on every load; tests pass their own).
export function seededRandom(seed = 1790) { let s = seed >>> 0 || 1; return () => (s = (s * 16807) % 2147483647) / 2147483647; }

const range = (random, [a, b]) => a + random() * (b - a);
const dist2 = (ax, az, bx, bz) => (ax - bx) ** 2 + (az - bz) ** 2;
function segmentDistance(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, l = dx * dx + dz * dz;
  const t = l ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l)) : 0;
  return Math.hypot(ax + dx * t - px, az + dz * t - pz);
}

// The flock. `perches`: crowPerches(...); options: heightAt, random,
// quality (a preset name). update(dt, { players, interior }) moves them;
// event(e, shooter) reacts to the game's events. `onCall(kind, x, y, z, n)`
// hears caws ('caw' idle, 'alarm' when they scatter, 'flap' on take-off).
export class CrowFlock {
  constructor(perches, { heightAt = () => 0, wetAt = () => false, random = seededRandom(), quality = 'balanced' } = {}) {
    this.perches = perches; this.heightAt = heightAt; this.wetAt = wetAt; this.random = random;
    this.time = 0; this.hushUntil = -1; this.broken = new Set(); this.visits = [];
    this.nextCaw = range(random, CROWS.caw); this.nextFlyover = range(random, CROWS.flyoverEvery); this.nextGather = range(random, CROWS.gatherEvery);
    this.onCall = null;
    const max = Math.max(...Object.values(CROWS.counts)) + Math.max(...Object.values(CROWS.flyovers));
    this.crows = Array.from({ length: max }, (_, id) => ({ id, state: 'off', x: 0, y: 0, z: 0, yaw: 0, pitch: 0, flap: 0, beat: 0, perch: -1 }));
    this.setQuality(quality);
  }

  get perchedCount() { return this.crows.filter(c => c.state === 'perched').length; }
  get active() { return this.crows.filter(c => c.state !== 'off'); }
  // The crows that live on perches (the rest are the overhead pool).
  resident(c) { return c.id < this.limit; }

  setQuality(name) {
    const limit = CROWS.counts[name] ?? CROWS.counts.balanced;
    this.flyLimit = CROWS.flyovers[name] ?? CROWS.flyovers.balanced;
    const max = Math.max(...Object.values(CROWS.counts));
    if (limit === this.limit) return;
    this.limit = limit;
    // Residents beyond the new count leave; new ones take a perch at once.
    for (const c of this.crows) {
      if (c.id < max && c.id >= limit && c.state !== 'off' && !c.flyover) this.retire(c);
      else if (c.id < limit && c.state === 'off') this.seat(c);
    }
  }

  retire(c) { c.state = 'off'; c.perch = -1; c.visit = null; c.flight = null; }
  taken() { const s = new Set(); for (const c of this.crows) { if (c.state === 'perched' && c.perch >= 0) s.add(c.perch); if (c.flight?.perch >= 0) s.add(c.flight.perch); } return s; }
  usable(i) { const p = this.perches[i]; return !!p && !(p.propId && this.broken.has(p.propId)); }

  // A crow sat straight on a free perch (at load, or when a preset adds crows).
  // Spread over the map: a perch not within 5 m of another crow if possible.
  seat(c) {
    const taken = this.taken(), free = [];
    for (let i = 0; i < this.perches.length; i++) if (!taken.has(i) && this.usable(i)) free.push(i);
    if (!free.length) return;
    let pick = free[Math.floor(this.random() * free.length)];
    for (let k = 0; k < 6; k++) {
      const i = free[Math.floor(this.random() * free.length)], p = this.perches[i];
      if (!this.crows.some(o => o.state === 'perched' && dist2(o.x, o.z, p.x, p.z) < 25)) { pick = i; break; }
    }
    this.land(c, pick);
  }
  land(c, i) {
    const p = this.perches[i]; c.state = 'perched'; c.perch = i; c.flight = null; c.visit = null;
    c.x = p.x; c.y = p.y; c.z = p.z; c.yaw = p.yaw; c.pitch = 0; c.flap = 0; c.idle = range(this.random, [2, 8]);
  }

  // A free perch for a crow leaving (x, z): settle metres away, keepAway from
  // every player and from the scare. Nearest acceptable to a wanted distance.
  pickPerch(x, z, players, scare, [near, far] = CROWS.settle) {
    const taken = this.taken(), want = range(this.random, [near, far]), options = [];
    for (let i = 0; i < this.perches.length; i++) {
      if (taken.has(i) || !this.usable(i)) continue;
      const p = this.perches[i], d = Math.sqrt(dist2(p.x, p.z, x, z));
      if (d < near || d > far + 10) continue;
      if (players.some(q => dist2(p.x, p.z, q.x, q.z) < CROWS.keepAway ** 2)) continue;
      if (scare && dist2(p.x, p.z, scare.x, scare.z) < CROWS.keepAway ** 2) continue;
      options.push([Math.abs(d - want) + this.random() * 4, i]);
    }
    options.sort((a, b) => a[0] - b[0]);
    return options.length ? options[0][1] : -1;
  }

  // Up and away from (sx, sz): a short climb, a few turns round, then off to
  // land elsewhere (or on nothing: it flies off the map and is gone a while).
  scare(c, sx, sz, players = []) {
    if (c.state !== 'perched' && c.state !== 'ground') return false;
    let ax = c.x - sx, az = c.z - sz; const l = Math.hypot(ax, az);
    if (l < .01) { const a = this.random() * Math.PI * 2; ax = Math.cos(a); az = Math.sin(a); } else { ax /= l; az /= l; }
    const target = this.pickPerch(c.x, c.z, players, { x: sx, z: sz });
    const r = range(this.random, CROWS.circleRadius), cruise = range(this.random, CROWS.cruise);
    c.state = 'flying'; c.visit = null; c.perch = -1;
    c.flight = {
      phase: 'rise', t: 0, perch: target, vx: ax * 3.5, vz: az * 3.5,
      cx: c.x + ax * (r + 2), cz: c.z + az * (r + 2), r, dir: this.random() < .5 ? 1 : -1,
      angle: Math.atan2(-az, -ax), circle: range(this.random, CROWS.circle), alt: this.heightAt(c.x, c.z) + cruise,
    };
    c.beat = 1;
    return true;
  }

  // Everything within `radius` of (x, z) goes up; one alarm call for the lot.
  scatter(x, z, radius = CROWS.scatter, players = this.players || []) {
    let n = 0, cx = 0, cy = 0, cz = 0;
    for (const c of this.crows) if ((c.state === 'perched' || c.state === 'ground') && dist2(c.x, c.z, x, z) < radius * radius && this.scare(c, x, z, players)) { n++; cx += c.x; cy += c.y; cz += c.z; }
    if (n) { this.onCall?.('flap', cx / n, cy / n, cz / n, n); this.onCall?.('alarm', cx / n, cy / n, cz / n, n); }
    return n;
  }
  scatterLine(ax, az, bx, bz, radius = CROWS.scatter, players = this.players || []) {
    let n = 0, cx = 0, cy = 0, cz = 0;
    for (const c of this.crows) {
      if ((c.state !== 'perched' && c.state !== 'ground') || segmentDistance(c.x, c.z, ax, az, bx, bz) >= radius) continue;
      // Off the line, away from its nearest point.
      const dx = bx - ax, dz = bz - az, l = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((c.x - ax) * dx + (c.z - az) * dz) / l));
      if (this.scare(c, ax + dx * t, az + dz * t, players)) { n++; cx += c.x; cy += c.y; cz += c.z; }
    }
    if (n) { this.onCall?.('flap', cx / n, cy / n, cz / n, n); this.onCall?.('alarm', cx / n, cy / n, cz / n, n); }
    return n;
  }

  // The game's events. `shooter`: who fired (x, z, aimX, aimZ), for a shot's line.
  event(e, shooter) {
    if (!e) return;
    if (GUNFIRE.has(e.type)) this.hushUntil = this.time + CROWS.hush;
    if (e.type === 'propBreak' && e.id) this.broken.add(e.id);
    const x = e.x ?? shooter?.x, z = e.z ?? shooter?.z;
    if (!Number.isFinite(x) || !Number.isFinite(z)) return;
    if (SHOTS.has(e.type)) {
      const ax = e.aimX ?? shooter?.aimX, az = e.aimZ ?? shooter?.aimZ;
      if (Number.isFinite(ax) && Number.isFinite(az) && (ax || az)) { const l = Math.hypot(ax, az); this.scatterLine(x, z, x + ax / l * SHOT_REACH, z + az / l * SHOT_REACH); }
      else this.scatter(x, z);
      return;
    }
    if (e.type === 'grenadeExplosion' || e.type === 'explosion') { this.scatter(x, z, CROWS.scatter + (e.radius || 0)); return; }
    if (e.type === 'playerDeath') {
      this.scatter(x, z);
      if (!e.preview) this.visits.push({ x, z, at: this.time + range(this.random, CROWS.visit.delay), n: 1 + Math.floor(this.random() * (CROWS.visit.count[1] - CROWS.visit.count[0] + 1)), wet: !!this.wetAt(x, z) });
      return;
    }
    if (IMPACTS.has(e.type)) this.scatter(x, z);
  }

  reset() {
    this.broken.clear(); this.visits.length = 0; this.hushUntil = -1;
    for (const c of this.crows) this.retire(c);
    for (const c of this.crows) if (c.id < this.limit) this.seat(c);
  }

  // `players`: the living players' { x, z } (you first); `interior`: the id
  // of the building you are in (its roof fades: its crows leave).
  update(dt, { players = [], interior = null } = {}) {
    if (!(dt > 0)) return;
    dt = Math.min(dt, .1); this.time += dt; this.players = players;
    const t = this.time;
    // Anyone walking up to them.
    for (const c of this.crows) {
      if (c.state !== 'perched' && c.state !== 'ground') continue;
      const p = c.perch >= 0 ? this.perches[c.perch] : null;
      if (p?.propId && this.broken.has(p.propId)) { this.scare(c, c.x, c.z, players); continue; }
      if (interior && p?.building === interior) { this.scare(c, c.x, c.z, players); continue; }
      const low = c.state === 'ground' || !p?.high || c.y - this.heightAt(c.x, c.z) < CROWS.lowPerch;
      const reach = c.state === 'ground' ? CROWS.visit.near : low ? CROWS.approachLow : CROWS.approachHigh;
      const who = players.find(q => dist2(q.x, q.z, c.x, c.z) < reach * reach);
      if (who && this.scare(c, who.x, who.z, players)) { this.onCall?.('flap', c.x, c.y, c.z, 1); this.onCall?.('alarm', c.x, c.y, c.z, 1); }
    }
    this.runVisits(players);
    this.returns();
    this.gatherIn(dt, players);
    this.flyovers(dt, players);
    // Idle caws, never in the hush after gunfire.
    this.nextCaw -= dt;
    if (this.nextCaw <= 0) {
      this.nextCaw = range(this.random, CROWS.caw);
      if (t >= this.hushUntil) {
        const sat = this.crows.filter(c => c.state === 'perched' || c.state === 'ground');
        if (sat.length) { const c = sat[Math.floor(this.random() * sat.length)]; this.onCall?.('caw', c.x, c.y, c.z, 1 + Math.floor(this.random() * 3)); }
      }
    }
    for (const c of this.crows) this.move(c, dt, players);
  }

  // The dead: when the wait is up, the nearest crows come down to it, unless
  // someone is standing over it or the guns have not stopped (then later).
  runVisits(players) {
    for (let i = this.visits.length - 1; i >= 0; i--) {
      const v = this.visits[i];
      if (this.time < v.at) continue;
      if (v.wet) { this.visits.splice(i, 1); continue; }
      // Not while the guns are still going, nor with someone standing over it: later.
      if (this.time < this.hushUntil - CROWS.hush * .5 || players.some(q => dist2(q.x, q.z, v.x, v.z) < (CROWS.visit.near + 2) ** 2)) {
        v.at = this.time + 3; v.tries = (v.tries || 0) + 1; if (v.tries > 20) this.visits.splice(i, 1); continue;
      }
      this.visits.splice(i, 1);
      const idle = this.crows.filter(c => c.state === 'perched' && this.resident(c)).sort((a, b) => dist2(a.x, a.z, v.x, v.z) - dist2(b.x, b.z, v.x, v.z));
      for (let k = 0; k < Math.min(v.n, idle.length); k++) this.sendTo(idle[k], v, k, players);
    }
  }
  sendTo(c, v, k, players) {
    v.turn ??= this.random() * Math.PI * 2;
    const a = v.turn + k * 2.1, r = range(this.random, CROWS.visit.radius), gx = v.x + Math.cos(a) * r, gz = v.z + Math.sin(a) * r;
    // From far off (off screen) it simply arrives from the edge.
    if (!players.some(q => dist2(q.x, q.z, c.x, c.z) < 26 * 26) && players.length) { const b = Math.atan2(c.z - gz, c.x - gx); c.x = gx + Math.cos(b) * 24; c.z = gz + Math.sin(b) * 24; c.y = this.heightAt(gx, gz) + 9; }
    c.state = 'flying'; c.perch = -1;
    c.flight = { phase: 'glide', t: -k * .8, perch: -1, ground: { x: gx, z: gz, y: this.heightAt(gx, gz), body: v }, sx: c.x, sy: c.y, sz: c.z };
    c.beat = 1;
  }

  // Crows far from everyone reappear nearer the action, one at a time, flying
  // in from off screen to a perch the player can see.
  gatherIn(dt, players) {
    if (!players.length) return;
    this.nextGather -= dt; if (this.nextGather > 0) return;
    this.nextGather = range(this.random, CROWS.gatherEvery);
    const far = this.crows.filter(c => c.state === 'perched' && this.resident(c) && players.every(q => dist2(q.x, q.z, c.x, c.z) > CROWS.gather ** 2));
    if (!far.length) return;
    const c = far[Math.floor(this.random() * far.length)], me = players[0];
    const target = this.pickPerch(me.x, me.z, players, null, CROWS.gatherRing);
    if (target < 0) return;
    const p = this.perches[target], b = Math.atan2(p.z - me.z, p.x - me.x);
    c.x = p.x + Math.cos(b) * 20; c.z = p.z + Math.sin(b) * 20; c.y = Math.max(p.y, this.heightAt(c.x, c.z)) + 7;
    c.state = 'flying'; c.perch = -1; c.flight = { phase: 'glide', t: 0, perch: target, sx: c.x, sy: c.y, sz: c.z }; c.beat = 1;
  }

  // One to three high over the view, now and then, never landing.
  flyovers(dt, players) {
    this.nextFlyover -= dt; if (this.nextFlyover > 0 || !players.length) return;
    this.nextFlyover = range(this.random, CROWS.flyoverEvery);
    const pool = this.crows.filter(c => !this.resident(c) && c.state === 'off' && c.id >= Math.max(...Object.values(CROWS.counts)));
    const n = Math.min(this.flyLimit, pool.length, 1 + Math.floor(this.random() * 3));
    const me = players[0], a = this.random() * Math.PI * 2, dx = Math.cos(a), dz = Math.sin(a), side = (this.random() - .5) * 16;
    const alt = this.heightAt(me.x, me.z) + range(this.random, CROWS.flyoverHeight);
    for (let i = 0; i < n; i++) {
      const c = pool[i], lag = i * 2.2 + this.random(), off = (i - (n - 1) / 2) * 2.4;
      const sx = me.x - dx * (30 + lag) - dz * (side + off), sz = me.z - dz * (30 + lag) + dx * (side + off);
      Object.assign(c, { state: 'flying', flyover: true, x: sx, y: alt + (this.random() - .5), z: sz, perch: -1, beat: 1 });
      c.flight = { phase: 'over', vx: dx * CROWS.speed * .9, vz: dz * CROWS.speed * .9, life: (60 + lag * 2) / (CROWS.speed * .9) };
    }
  }

  move(c, dt, players) {
    if (c.state === 'off') return;
    c.flap = (c.flap + dt * (c.beat > .5 ? 9 : 2)) % (Math.PI * 2);
    if (c.state === 'perched') {
      // Now and then a head turn or a shuffle about.
      c.idle -= dt; if (c.idle <= 0) { c.idle = range(this.random, [2, 9]); c.yaw += (this.random() - .5) * 1.6; }
      c.beat = Math.max(0, c.beat - dt * 2); c.pitch *= .9; return;
    }
    if (c.state === 'ground') return this.peck(c, dt, players);
    const f = c.flight; f.t = (f.t || 0) + dt; c.beat = 1;
    if (f.phase === 'over') {
      c.x += f.vx * dt; c.z += f.vz * dt; c.yaw = Math.atan2(f.vx, f.vz); c.beat = (f.t % 2.4) < 1 ? 1 : .2;
      if (f.t > f.life) { c.state = 'off'; c.flyover = false; c.flight = null; }
      return;
    }
    if (f.phase === 'rise') {
      c.x += f.vx * dt; c.z += f.vz * dt; c.y += 3.2 * dt; c.yaw = Math.atan2(f.vx, f.vz); c.pitch = -.35;
      if (f.t > .55) { f.phase = 'circle'; f.t = 0; f.angle = Math.atan2(c.z - f.cz, c.x - f.cx); }
      return;
    }
    if (f.phase === 'circle') {
      f.angle += f.dir * CROWS.speed / f.r * dt;
      const nx = f.cx + Math.cos(f.angle) * f.r, nz = f.cz + Math.sin(f.angle) * f.r;
      const k = Math.min(1, dt * 3); c.x += (nx - c.x) * k; c.z += (nz - c.z) * k; c.y += (f.alt - c.y) * Math.min(1, dt * 1.5);
      c.yaw = Math.atan2(-Math.sin(f.angle) * f.dir, Math.cos(f.angle) * f.dir); c.pitch = 0;
      if (f.t > f.circle) {
        // Leave the circle when heading roughly toward the new perch (or anywhere, if none).
        const p = this.perches[f.perch], hx = Math.sin(c.yaw), hz = Math.cos(c.yaw);
        const tx = p ? p.x - c.x : hx, tz = p ? p.z - c.z : hz, tl = Math.hypot(tx, tz) || 1;
        if ((hx * tx + hz * tz) / tl > .8 || f.t > f.circle + 6) {
          if (f.perch < 0) { const a = Math.atan2(hz, hx); f.perch = -1; f.gone = { x: c.x + Math.cos(a) * 40, z: c.z + Math.sin(a) * 40 }; }
          f.phase = 'glide'; f.t = 0; f.sx = c.x; f.sy = c.y; f.sz = c.z;
        }
      }
      return;
    }
    // Glide in to the perch (or the ground by a body, or away off the map).
    const p = f.perch >= 0 ? this.perches[f.perch] : null, gnd = f.ground;
    const tx = p ? p.x : gnd ? gnd.x : f.gone?.x ?? c.x + 1, tz = p ? p.z : gnd ? gnd.z : f.gone?.z ?? c.z, ty = p ? p.y : gnd ? gnd.y : c.y + 2;
    if (p && !this.usable(f.perch)) { f.perch = this.pickPerch(c.x, c.z, players, null); if (f.perch < 0) f.gone = { x: c.x + 30, z: c.z }; return; }
    if (f.t < 0) return;
    const dx = tx - c.x, dz = tz - c.z, d = Math.hypot(dx, dz), step = CROWS.speed * dt;
    c.yaw = Math.atan2(dx, dz);
    const total = Math.max(1, Math.hypot(tx - f.sx, tz - f.sz)), left = Math.min(1, d / total);
    // Height: from the start to the perch, with a little hump; flared at the end.
    const want = ty + (f.sy - ty) * Math.min(1, left * 1.4) + Math.sin(Math.PI * left) * 1.2;
    c.y += (want - c.y) * Math.min(1, dt * 4);
    c.pitch = d < 1.2 ? -.5 : 0; c.beat = d < 2.5 || f.t < .8 ? 1 : .3;
    if (d <= step + .05) {
      if (p) { this.land(c, f.perch); this.onCall?.('land', c.x, c.y, c.z, 1); return; }
      if (gnd) {
        c.x = tx; c.z = tz; c.y = ty; c.state = 'ground'; c.flight = null; c.perch = -1; c.pitch = 0;
        c.visit = { body: gnd.body, leave: this.time + range(this.random, CROWS.visit.stay), hop: range(this.random, [.6, 2]), peck: 0 };
        c.yaw = Math.atan2(gnd.body.x - c.x, gnd.body.z - c.z); return;
      }
      if (c.flyover || !this.resident(c)) { c.state = 'off'; c.flight = null; return; }
      // Flew off the map: back a while later on a perch somewhere quiet.
      c.state = 'off'; c.flight = null; c.returnAt = this.time + range(this.random, [10, 25]);
      return;
    }
    c.x += dx / d * step; c.z += dz / d * step;
  }

  // At a body: short hops round it, a peck now and then (the whole bird tips
  // forward), until it is time to go.
  peck(c, dt, players) {
    const v = c.visit; if (!v) return;
    c.beat = Math.max(0, c.beat - dt * 3);
    if (v.hopping) {
      v.hopping.t += dt; const k = Math.min(1, v.hopping.t / .22);
      c.x = v.hopping.x0 + (v.hopping.x1 - v.hopping.x0) * k; c.z = v.hopping.z0 + (v.hopping.z1 - v.hopping.z0) * k;
      c.y = this.heightAt(c.x, c.z) + Math.sin(Math.PI * k) * .16;
      if (k >= 1) v.hopping = null;
      return;
    }
    if (v.peck > 0) { v.peck -= dt; c.pitch = .7 * Math.abs(Math.sin(v.peck * 18)); if (v.peck <= 0) c.pitch = 0; return; }
    v.hop -= dt;
    if (this.time > v.leave) { this.scare(c, v.body.x, v.body.z, players); return; }
    if (v.hop <= 0) {
      v.hop = range(this.random, [.8, 2.6]);
      if (this.random() < .55) { v.peck = range(this.random, [.4, 1.1]); c.yaw = Math.atan2(v.body.x - c.x, v.body.z - c.z); return; }
      // A hop: round the body, never onto it or far from it.
      const a = Math.atan2(c.z - v.body.z, c.x - v.body.x) + (this.random() - .5) * 1.4, r = range(this.random, CROWS.visit.radius);
      const x1 = v.body.x + Math.cos(a) * r, z1 = v.body.z + Math.sin(a) * r;
      v.hopping = { t: 0, x0: c.x, z0: c.z, x1, z1 }; c.yaw = Math.atan2(x1 - c.x, z1 - c.z);
    }
  }

  // Crows that flew off the map come back (to a perch away from everyone).
  returns() {
    for (const c of this.crows) if (c.state === 'off' && c.returnAt && this.time > c.returnAt && this.resident(c)) {
      const i = this.pickPerch(c.x, c.z, this.players || [], null, [0, 400]); c.returnAt = 0;
      if (i >= 0) this.land(c, i); else this.seat(c);
    }
  }
}
