// Robot lab (developer tools, owner 2026-09-30: "place bots in areas and
// watch them fight repeatedly from full health to zero with different weapons
// and stuff repeatedly"). No DOM, no three.js: the panel and the markers are
// ui/robot-lab-panel.js; main.js steps it after the robots each tick.
//
// Robots are placed on spots (click the world in the panel's PLACE mode),
// each with a side (A, B, or free for all), a weapon (a fixed one, a random
// one each round, or "every matchup": the lab runs through every weapon
// against every weapon in turn), a skill, a style, a temper and a health.
// START puts one robot on every spot (any other robots leave), and a round is
// on: they fight (nobody comes back while it lasts) until one side is left
// standing, time runs out (the side with more health left wins; equal is a
// draw), or everyone is down (a draw). After a short pause every robot is
// back on its own spot at full health with a fresh loadout and a fresh head,
// with the next round's weapons, and the props broken last round are rebuilt.
// Until the round limit, or for ever.
//
// You watch: while a run is on you are out of it (BotMatch.youOut: not a
// target, not a body, nobody's leader), and main.js takes your attack inputs
// away and hides you; the camera flies free or follows a robot (`follow`).
//
// Stats, from the start of a run (RESET clears them): per robot, per weapon
// and per matchup, rounds, wins, losses, draws, kills, deaths, damage dealt
// and taken, attacks (trigger pulls, swings, volleys) and hits (a tick in
// which it damaged someone), abilities used, and the time to kill (from the
// victim's first hit in that life to its death). Everything is also kept per
// round in `log` (the last LAB.logLength rounds) and can be exported as CSV.
import { MAX_ROBOTS } from './bot-match.js';
import { NavGrid } from './nav-grid.js';
import { playableWeapons } from '../weapon-maintenance.js';

export const LAB = Object.freeze({
 maxRobots: MAX_ROBOTS,
 gap: 1.5,            // s between a round's end and the next start (settings.gap)
 timeLimit: 90,       // s a round may last (settings.timeLimit; 0: no limit)
 logLength: 60,       // rounds kept in the log
 snap: 6,             // squares (0.5 m) a placed spot may move to reach open ground
 near: 2.5,           // m: a click this close to a spot picks that spot
});
// The sides: A (amber, BotMatch team 'red'), B (cyan, 'blue') and free for
// all ('ffa': each robot its own side).
export const LAB_SIDES = Object.freeze([
 { id: 'red', name: 'A', label: 'SIDE A' },
 { id: 'blue', name: 'B', label: 'SIDE B' },
 { id: 'ffa', name: 'F', label: 'FREE FOR ALL' },
]);
export const WEAPON_MODES = Object.freeze(['fixed', 'random', 'matchup']);
// Attacks (a trigger pull, a swing, a volley) and abilities, by event type.
export const ATTACK_EVENTS = Object.freeze(new Set(['rifleShot', 'shotgunShot', 'launch', 'sprayStart', 'sidekickShot', 'sightlineShot', 'omenShot', 'ichorSwing', 'sheathSwing']));
export const ABILITY_EVENTS = Object.freeze({
 grenadeThrow: 'grenade', surgeStart: 'nova', scatterFire: 'blast', hexDeploy: 'hex', omenPrime: 'curse', omenVolley: 'covenant',
 ichorWave: 'slash', ichorFrenzyStart: 'frenzy', ichorGuardStart: 'deflect', sheathRush: 'rush', sheathDrawCut: 'draw-cut',
 sidekickMine: 'mine', sidekickRush: 'rush', sightlineStance: 'scope', dodge: 'dodge', shotgunDouble: 'both barrels',
});

// While a run is on, your hands do nothing (main.js): no shots, swings,
// abilities or reloads; walking still moves the free camera (you are a ghost).
const ATTACK_INPUTS = ['fire', 'tapFire', 'quickShot', 'launch', 'seed', 'spray', 'hex', 'grenade', 'surge', 'scatter', 'doubleShot', 'reload', 'dodge', 'omenPrime', 'omenVolley', 'ichorE', 'ichorX', 'ichorGuard', 'sheathE', 'sheathX', 'sidekickMine', 'sidekickX', 'sightlineStance', 'sightlineX'];
export function watchInput(input) { for (const key of ATTACK_INPUTS) if (key in input) input[key] = false; return input; }
// What a run sets in your dev settings (put back when it ends).
const WATCHING = ['ghost', 'invulnerable', 'robotSeeAll'];

const blank = () => ({ rounds: 0, wins: 0, losses: 0, draws: 0, kills: 0, deaths: 0, dealt: 0, taken: 0, attacks: 0, hits: 0, ttkSum: 0, ttkCount: 0, lifeSum: 0, abilities: {} });
const sideKey = entry => entry.side === 'ffa' ? 'ffa:' + entry.key : entry.side;
const sideName = key => key.startsWith('ffa:') ? key.slice(4) : LAB_SIDES.find(s => s.id === key)?.name || key;

// Averages for a stats record (per round played).
export function averages(s) {
 const per = n => s.rounds ? n / s.rounds : 0;
 return {
  winRate: s.rounds ? s.wins / s.rounds : 0,
  kd: s.deaths ? s.kills / s.deaths : s.kills,
  dealtPerRound: per(s.dealt), takenPerRound: per(s.taken),
  hitsPerAttack: s.attacks ? s.hits / s.attacks : 0,
  ttk: s.ttkCount ? s.ttkSum / s.ttkCount : null,
  life: s.rounds ? s.lifeSum / s.rounds : 0,
 };
}

export class RobotLab {
 constructor({ bots, random = Math.random, weapons = () => playableWeapons().map(w => w.id) }) {
  Object.assign(this, { bots, random, weapons });
  this.entries = []; this.serial = 0;
  this.settings = { rounds: 0, timeLimit: LAB.timeLimit, gap: LAB.gap, repeat: 1, rebuild: true, seeAll: true };
  this.running = false; this.phase = 'idle'; this.round = 0; this.clock = 0; this.betweenLeft = 0; this.matchups = null;
  this.pending = { robots: new Map(), weapons: new Map() }; this.stoppedWhy = null;
  this.follow = null;   // the entry key the camera follows (null: free)
  this.resetStats();
 }

 get active() { return this.running; }
 get count() { return this.entries.length; }
 byKey(key) { return this.entries.find(e => e.key === key) || null; }
 entryOf(bot) { return this.entries.find(e => e.bot === bot) || null; }
 // A robot's name in the lab: its side and number (A1, B2, F3).
 nameOf(id) { const e = this.entries.find(x => x.bot?.id === id); return e ? e.label : id; }

 resetStats() {
  this.stats = { robots: new Map(), weapons: new Map(), matchups: new Map() };
  this.log = []; this.round = 0; this.totalTime = 0;
 }
 robotStats(key) { let s = this.stats.robots.get(key); if (!s) this.stats.robots.set(key, s = blank()); return s; }
 weaponStats(id) { let s = this.stats.weapons.get(id); if (!s) this.stats.weapons.set(id, s = blank()); return s; }
 // This round's numbers, kept apart until it ends (a round cut short by
 // NEXT ROUND, a restart or a change of line-up counts for nothing).
 pend(kind, id) { const m = this.pending[kind]; let s = m.get(id); if (!s) m.set(id, s = blank()); return s; }
 mergePending() {
  for (const [kind, total] of [['robots', id => this.robotStats(id)], ['weapons', id => this.weaponStats(id)]]) for (const [id, p] of this.pending[kind]) {
   const s = total(id);
   for (const k of ['kills', 'deaths', 'dealt', 'taken', 'attacks', 'hits', 'ttkSum', 'ttkCount']) s[k] += p[k];
   for (const [a, n] of Object.entries(p.abilities)) s.abilities[a] = (s.abilities[a] || 0) + n;
  }
 }

 // --- placing ---------------------------------------------------------------------------
 // The nav grid (built once for the map) for putting spots on open ground.
 grid(main) { this.bots.nav ||= new NavGrid(this.bots.map, main.colliders); this.bots.nav.refresh(main.colliders); return this.bots.nav; }
 // Open ground at or near (x, z): the spot a robot stands on, or null when
 // there is none within LAB.snap squares (inside a wall, off the map).
 snap(main, x, z) {
  const nav = this.grid(main), i = nav.nearestOpen(x, z, LAB.snap);
  if (i < 0) return null;
  return nav.open[nav.cellOf(x, z)] ? { x, z } : nav.centre(i);
 }
 // A new spot (the panel's choices for it). Returns the entry, or an error.
 add(main, x, z, { side = 'red', weaponMode = 'fixed', weapon = null, skill = 'normal', style = 'blend', temper = 'shifting', health = 100, aim = 1 } = {}) {
  if (this.entries.length >= LAB.maxRobots) return { error: 'The lab holds ' + LAB.maxRobots + ' robots.' };
  const at = this.snap(main, x, z); if (!at) return { error: 'No open ground there.' };
  const key = 'lab-' + (++this.serial);
  const entry = { key, x: at.x, z: at.z, side: LAB_SIDES.some(s => s.id === side) ? side : 'red', weaponMode: WEAPON_MODES.includes(weaponMode) ? weaponMode : 'fixed', weapon: weapon || this.weapons()[0], skill, style, temper, health, aim, bot: null, label: '' };
  this.entries.push(entry); this.relabel();
  if (this.running) this.lineupChanged(main);
  return { entry };
 }
 // Numbers within each side, in the order placed: A1, A2, B1, F1...
 relabel() { const n = {}; for (const e of this.entries) { const s = LAB_SIDES.find(x => x.id === e.side)?.name || 'F'; n[s] = (n[s] || 0) + 1; e.label = s + n[s]; } }
 // The spot nearest (x, z) within LAB.near m.
 nearest(x, z, within = LAB.near) {
  let best = null, bestD = within;
  for (const e of this.entries) { const d = Math.hypot(e.x - x, e.z - z); if (d <= bestD) { best = e; bestD = d; } }
  return best;
 }
 remove(main, key) {
  const entry = this.byKey(key); if (!entry) return false;
  if (entry.bot) this.bots.remove(entry.bot);
  this.entries = this.entries.filter(e => e !== entry); this.relabel();
  if (this.follow === key) this.follow = null;
  if (this.running) this.lineupChanged(main);
  return true;
 }
 // The line-up changed during a run: with two sides still there, the round
 // starts again (not counted) with everyone on their spots; else the run stops.
 lineupChanged(main) {
  if (new Set(this.entries.map(sideKey)).size < 2) { this.stop(main); this.stoppedWhy = 'Stopped: only one side left.'; return; }
  this.matchups = this.schedule();
  this.begin(main);
 }
 // A change to a spot's robot (side, weapon, skill...): its body now if the
 // side changed, everything else from the next round.
 change(main, key, changes) {
  const entry = this.byKey(key); if (!entry) return false;
  const sideBefore = entry.side;
  for (const k of ['side', 'weaponMode', 'weapon', 'skill', 'style', 'temper', 'health', 'aim']) if (k in changes) entry[k] = changes[k];
  if (entry.side !== sideBefore) { this.relabel(); if (entry.bot) { this.bots.remove(entry.bot); entry.bot = null; } if (this.running) this.lineupChanged(main); }
  else if (this.running && 'weaponMode' in changes) this.matchups = this.schedule();
  return true;
 }
 move(main, key, x, z) { const entry = this.byKey(key), at = entry && this.snap(main, x, z); if (!at) return false; entry.x = at.x; entry.z = at.z; return true; }
 clear(main) { this.stop(main); this.entries = []; this.follow = null; }

 // --- weapons each round -----------------------------------------------------------------
 // "Every matchup": every weapon for each such spot, in turn (an odometer
 // over those spots), each combination `repeat` rounds.
 // (Worked out per round, never listed: 7 weapons on 8 spots is 5.7 million matchups.)
 schedule() {
  const list = this.weapons(), keys = this.entries.filter(e => e.weaponMode === 'matchup').map(e => e.key);
  return keys.length && list.length ? { keys, list, count: list.length ** keys.length } : null;
 }
 get matchupCount() { return this.matchups?.count || 0; }
 // Rounds for one pass through every matchup (settings.rounds 'cycle').
 get cycleRounds() { return Math.max(1, this.matchupCount) * Math.max(1, this.settings.repeat); }
 get roundLimit() { return this.settings.rounds === 'cycle' ? this.cycleRounds : Number(this.settings.rounds) || 0; }
 matchupIndex(n) { return Math.floor(n / Math.max(1, this.settings.repeat)) % Math.max(1, this.matchupCount); }
 // Round `n` (from 0): each spot's weapon. Matchup spots are the digits of
 // the matchup's number, the first spot the fastest.
 weaponsFor(n) {
  const m = this.matchups, list = this.weapons(), c = m ? this.matchupIndex(n) : 0, out = {};
  for (const e of this.entries) {
   const i = m ? m.keys.indexOf(e.key) : -1;
   out[e.key] = e.weaponMode === 'random' ? list[Math.floor(this.random() * list.length)] : i >= 0 ? m.list[Math.floor(c / m.list.length ** i) % m.list.length] : e.weapon;
  }
  return out;
 }
 // Which matchup round `n` is (1-based) and how many there are, or null.
 matchupAt(n = this.round) { return this.matchupCount ? { index: this.matchupIndex(n) + 1, total: this.matchupCount } : null; }

 // --- a run -------------------------------------------------------------------------------
 // START: a robot on every spot; any other robots leave. Returns an error or null.
 start(main) {
  this.stoppedWhy = null;
  if (!this.entries.length) return 'Place some robots first.';
  const sides = new Set(this.entries.map(sideKey));
  if (sides.size < 2) return 'Place robots on two sides (or two free for all).';
  this.stop(main);
  for (const bot of [...this.bots.bots]) this.bots.remove(bot);
  this.resetStats(); this.roundFirst = true;
  this.matchups = this.schedule();
  this.hooks(true);
  this.running = true; this.bots.holdRespawns = true; this.bots.youOut = true;
  if (main.dev) { this.savedDev = Object.fromEntries(WATCHING.map(k => [k, main.dev[k]])); this.watching(main); }
  for (const e of this.entries) this.spawn(main, e);
  this.begin(main);
  return null;
 }
 // You as a ghost the robots can't hurt; their knowing where each other are, as set.
 watching(main) { const d = main.dev; if (!d) return; d.ghost = true; d.invulnerable = true; d.robotSeeAll = !!this.settings.seeAll; }
 restoreDev(main) {
  const d = main?.dev, saved = this.savedDev; this.savedDev = null;
  if (!d || !saved) return;
  for (const k of WATCHING) { if (saved[k] === undefined) delete d[k]; else d[k] = saved[k]; }
 }
 stop(main) {
  if (!this.running) return;
  this.restoreDev(main);
  this.running = false; this.phase = 'idle';
  for (const e of this.entries) { if (e.bot) this.bots.remove(e.bot); e.bot = null; }
  this.bots.holdRespawns = false; this.bots.youOut = false;
  this.hooks(false);
 }
 // The main menu (BotMatch.clear) took the robots: the run is over.
 lost(main) { if (!this.running) return; this.restoreDev(main); this.running = false; this.phase = 'idle'; for (const e of this.entries) { if (e.bot && this.bots.bots.includes(e.bot)) this.bots.remove(e.bot); e.bot = null; } this.bots.holdRespawns = false; this.bots.youOut = false; this.hooks(false); }

 spawn(main, entry) {
  const bot = this.bots.spawn(main, entry.weapon, { team: entry.side, skill: entry.skill, style: entry.style, temper: entry.temper, aim: entry.aim });
  if (!bot) return null;
  bot.name = 'LAB ' + entry.label; bot.lab = entry.key; entry.bot = bot;
  this.put(main, entry);
  return bot;
 }
 // On its spot, full health, a fresh loadout and a fresh head.
 put(main, entry, weapon = null) {
  const bot = entry.bot; if (!bot) return;
  if (weapon) bot.sim.weapon = weapon;
  this.bots.putAt(bot, main, { x: entry.x, z: entry.z });
  const p = bot.sim.player; p.hp = p.maxHp = entry.health || 100;
  // Facing the middle of the other side, so the fight starts the same way each round.
  const foes = this.entries.filter(e => sideKey(e) !== sideKey(entry));
  if (foes.length) { const fx = foes.reduce((s, e) => s + e.x, 0) / foes.length - entry.x, fz = foes.reduce((s, e) => s + e.z, 0) / foes.length - entry.z, l = Math.hypot(fx, fz) || 1; p.aimX = fx / l; p.aimZ = fz / l; }
  bot.firstHurtAt = null; bot.labDownAt = null; bot.lastHitBy = null; bot.lastHitAt = -Infinity;
  bot.roundDealt = bot.roundTaken = bot.roundKills = 0;
 }
 // A round begins: the round's weapons, everyone on their spots.
 begin(main) {
  const weapons = this.weaponsFor(this.round);
  if (this.settings.rebuild && !this.roundFirst) main.restoreAllProps?.();
  this.bots.nav?.refresh(main.colliders);
  this.roundFirst = false;
  this.pending = { robots: new Map(), weapons: new Map() };
  for (const e of this.entries) { if (!e.bot) this.spawn(main, e); this.put(main, e, weapons[e.key]); }
  this.phase = 'fighting'; this.clock = 0; this.roundStartAt = this.bots.clock;
  this.current = { round: this.round + 1, weapons: Object.fromEntries(this.entries.map(e => [e.key, e.bot?.sim.weapon || weapons[e.key]])), matchup: this.matchupAt(this.round), kills: [] };
 }
 // NEXT ROUND: this one ends now (not counted) and the next begins.
 skip(main) { if (!this.running) return; this.begin(main); }

 // The sides with a robot standing.
 standing() {
  const alive = new Map();
  for (const e of this.entries) { const b = e.bot; if (b && b.alive && b.sim.player.hp > 0 && !b.sim.player.dead) alive.set(sideKey(e), (alive.get(sideKey(e)) || 0) + 1); }
  return alive;
 }

 // Each tick, after the robots have stepped (main.js).
 step(main, dt) {
  if (!this.running) return;
  // (The main menu, or anything else, took the lab's robots away: the run is over.)
  if (this.entries.some(e => e.bot && !this.bots.bots.includes(e.bot))) { this.lost(main); return; }
  this.watching(main);
  // (Dev freeze: the robots hold still, and so does the lab's clock.)
  if (main.dev?.freeze) return;
  if (this.phase === 'between') {
   this.betweenLeft -= dt;
   if (this.betweenLeft <= 0) { const limit = this.roundLimit; if (limit && this.round >= limit) { this.phase = 'done'; return; } this.begin(main); }
   return;
  }
  if (this.phase !== 'fighting') return;
  this.clock += dt; this.totalTime += dt;
  const alive = this.standing();
  const timeUp = this.settings.timeLimit > 0 && this.clock >= this.settings.timeLimit;
  if (alive.size <= 1 || timeUp) this.finish(main, alive, timeUp);
 }

 finish(main, alive, timeUp) {
  // A robot killed in another's step this tick falls only on its own next
  // tick (Simulation.step), after the round is over: it is counted now.
  for (const e of this.entries) { const b = e.bot; if (b && b.labDownAt == null && (b.sim.player.hp <= 0 || b.sim.player.dead)) this.fell(b, b.lastHitBy && b.lastHitAt >= (this.roundStartAt ?? 0) ? b.lastHitBy : null); }
  let winner = alive.size === 1 ? [...alive.keys()][0] : null, reason = alive.size === 1 ? 'last standing' : alive.size ? 'time' : 'all down';
  // Time: the side with the most health left (equal: a draw).
  if (!winner && timeUp && alive.size > 1) {
   const health = new Map();
   for (const e of this.entries) { const b = e.bot; if (b?.alive && b.sim.player.hp > 0) health.set(sideKey(e), (health.get(sideKey(e)) || 0) + b.sim.player.hp / (b.sim.player.maxHp || 100)); }
   const ranked = [...health.entries()].sort((a, b) => b[1] - a[1]);
   if (ranked.length && (ranked.length < 2 || ranked[0][1] - ranked[1][1] > 1e-6)) winner = ranked[0][0];
  }
  this.mergePending();
  this.round++;
  const row = { ...this.current, time: this.clock, winner: winner ? sideName(winner) : null, reason, robots: [] };
  for (const e of this.entries) {
   const b = e.bot, rs = this.robotStats(e.key), ws = this.weaponStats(this.current.weapons[e.key] || b?.sim.weapon);
   const result = !winner ? 'draw' : sideKey(e) === winner ? 'win' : 'loss';
   for (const s of [rs, ws]) { s.rounds++; s[result === 'win' ? 'wins' : result === 'loss' ? 'losses' : 'draws']++; s.lifeSum += b?.labDownAt ?? this.clock; }
   row.robots.push({ key: e.key, label: e.label, side: e.side, weapon: this.current.weapons[e.key], result, hp: b ? Math.max(0, Math.round(b.sim.player.hp)) : 0, dealt: Math.round(b?.roundDealt || 0), taken: Math.round(b?.roundTaken || 0), kills: b?.roundKills || 0 });
   if (b) b.roundDealt = b.roundTaken = b.roundKills = 0;
  }
  this.matchupResult(row, winner);
  this.log.push(row); if (this.log.length > LAB.logLength) this.log.shift();
  this.lastRound = row;
  this.phase = 'between'; this.betweenLeft = this.settings.gap;
 }
 // Wins by weapon line-up: "rifle vs shotgun" (each side's weapons, sorted).
 matchupResult(row, winner) {
  const bySide = new Map();
  for (const r of row.robots) { const k = r.side === 'ffa' ? 'ffa:' + r.key : r.side; if (!bySide.has(k)) bySide.set(k, []); bySide.get(k).push(r.weapon); }
  const lineups = [...bySide.entries()].map(([k, list]) => ({ k, name: list.sort().join('+') })).sort((a, b) => a.name.localeCompare(b.name));
  const key = lineups.map(l => l.name).join(' vs ');
  let m = this.stats.matchups.get(key);
  if (!m) this.stats.matchups.set(key, m = { key, lineups: lineups.map(l => l.name), wins: lineups.map(() => 0), draws: 0, rounds: 0, time: 0 });
  m.rounds++; m.time += row.time;
  const i = lineups.findIndex(l => l.k === winner);
  if (i >= 0) m.wins[i]++; else m.draws++;
 }

 // --- what the robots do (BotMatch hooks, while a run is on) --------------------------
 hooks(on) {
  const bots = this.bots;
  bots.onDamage = on ? (ownerId, victim, took) => this.damaged(ownerId, victim, took) : null;
  bots.onEvent = on ? (bot, e) => this.event(bot, e) : null;
  bots.onFell = on ? (victim, killerId) => this.fell(victim, killerId) : null;
 }
 labBot(id) { const e = this.entries.find(x => x.bot?.id === id); return e ? e.bot : null; }
 damaged(ownerId, victim, took) {
  if (this.phase !== 'fighting' || !victim.lab || took <= 0) return;
  const vs = this.pend('robots', victim.lab), vw = this.pend('weapons', victim.sim.weapon);
  vs.taken += took; vw.taken += took; victim.roundTaken = (victim.roundTaken || 0) + took;
  victim.firstHurtAt ??= this.clock;
  const owner = this.labBot(ownerId);
  if (!owner || owner === victim) return;
  const os = this.pend('robots', owner.lab), ow = this.pend('weapons', owner.sim.weapon);
  os.dealt += took; ow.dealt += took; os.hits++; ow.hits++; owner.roundDealt = (owner.roundDealt || 0) + took;
 }
 event(bot, e) {
  if (this.phase !== 'fighting' || !bot.lab) return;
  const rs = this.pend('robots', bot.lab), ws = this.pend('weapons', bot.sim.weapon);
  if (ATTACK_EVENTS.has(e.type)) { rs.attacks++; ws.attacks++; }
  const ability = ABILITY_EVENTS[e.type];
  if (ability) for (const s of [rs, ws]) s.abilities[ability] = (s.abilities[ability] || 0) + 1;
 }
 fell(victim, killerId) {
  // (Once per round: finish() may have counted it already.)
  if (this.phase !== 'fighting' || !victim.lab || victim.labDownAt != null) return;
  victim.labDownAt = this.clock;
  for (const s of [this.pend('robots', victim.lab), this.pend('weapons', victim.sim.weapon)]) s.deaths++;
  const killer = victim.lastHitAt >= (this.roundStartAt ?? 0) ? this.labBot(killerId) : null;
  if (!killer || killer === victim) return;
  const ttk = this.clock - (victim.firstHurtAt ?? this.clock);
  for (const s of [this.pend('robots', killer.lab), this.pend('weapons', killer.sim.weapon)]) { s.kills++; s.ttkSum += ttk; s.ttkCount++; }
  killer.roundKills = (killer.roundKills || 0) + 1;
  this.current?.kills.push({ killer: this.entryOf(killer)?.label, victim: this.entryOf(victim)?.label, weapon: killer.sim.weapon, at: this.clock, ttk });
 }

 // --- the camera ------------------------------------------------------------------------
 // Where the camera follows: the followed robot while it stands (its body
 // where it fell until the next round), else null (the free camera).
 watched() {
  const e = this.follow && this.byKey(this.follow), b = e?.bot;
  if (!this.running || !b) return null;
  const p = b.sim.player;
  return { id: b.id, x: p.x, z: p.z, name: e.label };
 }

 // --- export ------------------------------------------------------------------------------
 // Every round in the log, one row per robot per round, as CSV.
 csv() {
  const head = 'round,matchup,time_s,winner,reason,robot,side,weapon,result,hp_left,dealt,taken,kills';
  const rows = this.log.flatMap(r => r.robots.map(b => [r.round, r.matchup ? r.matchup.index + '/' + r.matchup.total : '', r.time.toFixed(1), r.winner || 'draw', r.reason, b.label, b.side, b.weapon, b.result, b.hp, b.dealt, b.taken, b.kills].join(',')));
  const weapons = [...this.stats.weapons.entries()].map(([id, s]) => { const a = averages(s); return [id, s.rounds, s.wins, s.losses, s.draws, s.kills, s.deaths, Math.round(s.dealt), Math.round(s.taken), s.attacks, s.hits, a.ttk == null ? '' : a.ttk.toFixed(2), a.dealtPerRound.toFixed(1), (a.winRate * 100).toFixed(1)].join(','); });
  return [head, ...rows, '', 'weapon,rounds,wins,losses,draws,kills,deaths,dealt,taken,attacks,hits,avg_ttk_s,dealt_per_round,win_pct', ...weapons].join('\n');
 }
}
