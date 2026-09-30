// VS ROBOTS (owner: 1V1 in v132, 2V2 and 3V3 in v0.9b): you (and in the
// team modes your robot teammates) against robots, from Gamemodes > VS ROBOTS.
//
// The page (ui/duel-menu.js) picks the mode, the map, your weapon (or
// random), then the enemy robots and your robots separately: weapon (or
// random, rolled per robot), skill (rookie to expert), aim (sharper / as its
// skill / sloppier), temper (calm / shifting / aggressive); and the match:
// first to 3, 5, 10 or endless, and in the team modes friendly fire (on:
// teammates can hurt each other for half). Every robot is a blend of styles
// with a mood that moves (bots/robot-profile.js). The choices ride in the
// URL (`mode=duel&duel=...`) like the practice map and weapon.
//
// In the game: no practice targets; enemies come in 16-34 m away and back
// after a death, your robots beside you. A point for your side whenever an
// enemy goes down, for theirs whenever you or one of your robots does (so a
// robot that blows itself up gives the other side the point). The score sits
// top centre (the health bar under it); at the winning point the end-of-match
// card (ui/match-end.js, main.js) offers START, CHANGE SETTINGS or QUIT.
import { WEAPONS } from './items.js';
import { randomPlayableWeapon, playableOr } from './weapon-maintenance.js';
import { SKILL_LEVELS, TEMPERS } from './bots/robot-profile.js';
import { rollHTML } from './ui/score-flash.js';
import { pickDuelCircle } from './duel-circle.js';
import { stormMode, stormPlan as stormPlan_, stormAt, stormSafe, stormSafeSpot } from './storm.js';
import { SPAWN_APART, TEAMS, roundsDecided, syphonAmount } from './config/match.js';

export const DUEL_MODES = Object.freeze({
 '1v1': { name: '1V1', allies: 0, enemies: 1 },
 '2v2': { name: '2V2', allies: 1, enemies: 2 },
 '3v3': { name: '3V3', allies: 2, enemies: 3 },
 // (Owner, 2026-09-29: 4V4 too.)
 '4v4': { name: '4V4', allies: 3, enemies: 4 },
 // FFA (owner, 2026-09-29: "ffa should be a mode in bots menu too"): you and
 // five robots, everyone for themselves, for 5 or 10 minutes; most kills
 // wins. Everyone comes back FFA_RESPAWN s after a death, inside the storm's
 // safe circle; every kill gives its killer 50 health (syphon).
 ffa: { name: 'FFA', allies: 0, enemies: 5, ffa: true },
});
export const DUEL_LENGTHS = Object.freeze([300, 600]);
export const FFA_RESPAWN = 6;
export const DUEL_AIMS = Object.freeze({ sharper: .7, even: 1, sloppier: 1.5 });
// ROUNDS (owner, 2026-09-29: "3 rounds whoever has most wins"): that many
// rounds are played, most wins, over as soon as nobody can catch up; a tie
// plays on a round at a time (config/match.js roundsDecided). 0: endless.
// (The URL keeps the old `firstTo` place for it.)
export const DUEL_ROUNDS = Object.freeze([3, 5, 10, 0]);
export const DUEL_FIRST_TO = DUEL_ROUNDS;
export const FRIENDLY_SHARE = .5;
// (friendlyFire: kept in the address's order for old links; always off now.)
export const DUEL_DEFAULTS = Object.freeze({ mode: '1v1', firstTo: 5, length: 300, friendlyFire: 'off',
 spawn: 'scattered', botWeapon: null, skill: 'normal', aim: 'even', temper: 'shifting',
 allyWeapon: null, allySkill: 'normal', allyAim: 'even', allyTemper: 'shifting' });
export const DUEL_ENEMY_RANGE = Object.freeze([16, 34]);
export const DUEL_RESULT_DELAY = 1.4;   // seconds of the last kill before the card
// 1V1's aftermath (owner, 2026-09-29: "after any kill in 1v1, it should show
// the aftermath for a solid 3 seconds"): the camera on the body for both; the
// last kill of the match too, before the card.
export const AFTERMATH = 3;
// Seconds between a side going out and everyone coming back (v0.999a).
export const DUEL_ROUND_BREAK = 5; // (owner: "a short bit more time in between respawns")
// 1V1 (owner, 2026-09-29): 3 s of aftermath, then 2-3 s of the death card
// (the winner of the round: the stats panel with the score turning over).
export const DUEL_BREAK_1V1 = 5.6;

const weaponIds = () => WEAPONS.map(w => w.id);
const ORDER = ['mode', 'firstTo', 'friendlyFire', 'botWeapon', 'skill', 'aim', 'temper', 'allyWeapon', 'allySkill', 'allyAim', 'allyTemper', 'spawn', 'length'];
// The URL value: every choice in ORDER, joined by '~' (weapons 'random' for any).
export const duelParam = cfg => ORDER.map(k => (k.endsWith('eapon') ? cfg[k] || 'random' : cfg[k] ?? DUEL_DEFAULTS[k])).join('~');
export function readDuel(value) {
 if (value == null) return null;
 const text = String(value), raw = {};
 // The v132 form: weapon.skill.aim.temper.firstTo (a 1V1).
 if (!text.includes('~')) { const [botWeapon, skill, aim, temper, firstTo] = text.split('.'); Object.assign(raw, { botWeapon, skill, aim, temper, firstTo }); }
 else text.split('~').forEach((v, i) => { raw[ORDER[i]] = v; });
 const weapon = w => (weaponIds().includes(w) ? w : null), n = Number(raw.firstTo);
 const pick = (v, ok, key) => (ok(v) ? v : DUEL_DEFAULTS[key]);
 return {
  mode: pick(raw.mode, v => v in DUEL_MODES, 'mode'),
  firstTo: DUEL_FIRST_TO.includes(n) ? n : DUEL_DEFAULTS.firstTo,
  friendlyFire: pick(raw.friendlyFire, v => v === 'on' || v === 'off', 'friendlyFire'),
  botWeapon: weapon(raw.botWeapon), skill: pick(raw.skill, v => SKILL_LEVELS.includes(v), 'skill'),
  aim: pick(raw.aim, v => v in DUEL_AIMS, 'aim'), temper: pick(raw.temper, v => v in TEMPERS, 'temper'),
  allyWeapon: weapon(raw.allyWeapon), allySkill: pick(raw.allySkill, v => SKILL_LEVELS.includes(v), 'allySkill'),
  allyAim: pick(raw.allyAim, v => v in DUEL_AIMS, 'allyAim'), allyTemper: pick(raw.allyTemper, v => v in TEMPERS, 'allyTemper'),
  spawn: pick(raw.spawn, v => v === 'scattered' || v === 'team', 'spawn'),
  length: DUEL_LENGTHS.includes(Number(raw.length)) ? Number(raw.length) : DUEL_DEFAULTS.length,
 };
}

// The score and who has won (plain, tested). `you`: your side's round wins.
// `rounds`: how many are played (0 endless); `played` counts draws too.
export class DuelScore {
 constructor(rounds = 5) { this.rounds = rounds; this.reset(); }
 get firstTo() { return this.rounds; }
 reset() { this.you = 0; this.robot = 0; this.played = 0; this.winner = null; }
 // A round over: `side` took it ('you' / 'robot'), or null for a draw.
 point(side) {
  if (this.winner) return this.winner;
  if (side) this[side]++;
  this.played++;
  if (roundsDecided([this.you, this.robot], this.played, this.rounds)) this.winner = this.you > this.robot ? 'you' : 'robot';
  return this.winner;
 }
 // FORFEIT: the other side takes the match.
 forfeit(side = 'you') { if (!this.winner) this.winner = side === 'you' ? 'robot' : 'you'; return this.winner; }
}

// (Never a weapon under maintenance: weapon-maintenance.js.)
const randomWeapon = random => randomPlayableWeapon(random);

// Played by elimination (v0.999a, owner: "after whoever dies, both players
// respawn at full health random again. for 2v2, after two players on a team
// die, everyone respawns ... and whoever the last man's team is gets the
// point"): nobody comes back on their own (the robots hold, bots.holdRespawns;
// you watch a teammate, main.js); when one side has nobody standing, the other
// scores, and DUEL_ROUND_BREAK later everyone comes back (hooks.newRound).
//
// `hooks`: over(outcome) when the match is over (the game stops; main.js puts
// up the end card: outcome { winner, you, robot, forfeited, team, mode }),
// pointWon(side) as a round is won, newRound() when everyone comes back.
// In 1V1 the top score keeps the old number through the break and turns
// over as both come back (owner: the one who died sees it after the card).
export function createDuel(parent, { sim, bots, hooks = {}, random = Math.random }) {
 const score = document.createElement('div');
 score.className = 'duel-score'; score.hidden = true; score.setAttribute('aria-live', 'polite');
 parent.append(score);
 // `held`: the score the top shows during a 1V1 break (the old one); `roll`:
 // the number turning over as the round starts ({ side, from, to }).
 let ffaLeft = 0; // (FFA: seconds of the match left)
 let circle = null, cfg = null, tally = new DuelScore(), robots = [], alive = new Map(), overIn = -1, shownKey = '', breakIn = -1, lastPoint = null, round = 1, forfeited = false, ended = false, held = null, roll = null;
 const team = () => DUEL_MODES[cfg?.mode]?.allies > 0;
 const ffa = () => !!DUEL_MODES[cfg?.mode]?.ffa;
 const names = () => (team() ? ['YOUR TEAM', 'ENEMIES'] : ffa() ? ['YOU', 'TOP BOT'] : ['YOU', 'BOT']);
 const clockText = t => { const n = Math.max(0, Math.ceil(t)); return Math.floor(n / 60) + ':' + String(n % 60).padStart(2, '0'); };
 // FFA's syphon (owner: "50 siphon off each kill"): the killer (a robot, or
 // null for you), if still standing, gets 50 health back, up to full; yours
 // shows its +N (the `syphon` event, main.js).
 const syphon = killer => {
  const p = (killer ? killer.sim : sim).player;
  if (!p || p.dead || !(p.hp > 0)) return;
  const amount = syphonAmount('ffa', p.hp, p.maxHp);
  if (!(amount > 0)) return;
  p.hp = Math.min(p.maxHp, p.hp + amount);
  if (!killer) sim.events.push({ type: 'syphon', amount, x: p.x, z: p.z });
 };
 // FFA with the storm closing: a spot inside the safe circle as it will be
 // in a few seconds, away from everyone (storm.js stormSafeSpot). Null while
 // the storm still covers the whole map (the usual spots then).
 const closing = () => !!stormPlan && !!stormCircle && stormCircle.r < stormPlan.r0 - 1;
 const safeSpot = body => {
  if (!ffa() || !closing()) return null;
  const others = [...(body !== sim.player && !sim.player.dead && sim.player.hp > 0 ? [sim.player] : []), ...robots.filter(b => b.alive && b.sim.player !== body).map(b => b.sim.player)];
  return stormSafeSpot(stormPlan, stormClock, { map: sim.map, colliders: sim.colliders, others, random, apart: SPAWN_APART });
 };
 // The storm (storm.js): the team modes only (not 1V1: its duel circle), a
 // new one each round; the developer tools' "Storm off" (sim.dev.noStorm)
 // leaves it out. Every sim (you and the robots) gets the safe circle.
 let stormPlan = null, stormClock = 0, stormCircle = null;
 const setStormClock = t => {
  stormClock = t; stormCircle = stormPlan ? stormAt(stormPlan, t) : null;
  sim.storm = stormCircle; for (const b of robots) b.sim.storm = stormCircle;
 };
 const newStorm = (first = false) => {
  const on = cfg && stormMode(cfg.mode) && !sim.dev?.noStorm;
  stormPlan = on ? stormPlan_(sim.map, sim.colliders, { kind: ffa() ? 'ffa' : 'round', length: cfg.length, random, avoid: !first && stormPlan ? { x: stormPlan.x1, z: stormPlan.z1 } : null }) : null;
  setStormClock(0);
 };

 const render = () => {
  const you = held ? held.you : tally.you, robot = held ? held.robot : tally.robot;
  const key = you + ':' + robot + ':' + tally.firstTo + ':' + cfg?.mode + ':' + round + ':' + (roll ? roll.side + roll.to : '') + (ffa() ? ':' + clockText(ffaLeft) : '');
  if (key === shownKey) return; shownKey = key;
  const num = side => (roll?.side === side ? rollHTML(roll.from, roll.to) : side === 'you' ? you : robot);
  const [mine, theirs] = names(), tint = i => (team() ? ` style="color:${TEAMS[i].colour}"` : '');
  // (v0.999a, owner: "make it match rest of game ui": no pill; drawn like the
  // health bar under it: the numbers in its face, and first-to games a row of
  // its track's segments per side, filled from the middle out.)
  // (ROUNDS: a segment per round win that clinches it, the most of N.)
  const need = tally.rounds ? Math.floor(tally.rounds / 2) + 1 : 0;
  const pips = (n, i, side) => need ? `<span class="duel-track duel-${side}"${tint(i)}>${Array.from({ length: Math.min(need, 10) }, (_, k) => `<i${k < Math.min(n, 10) ? ' class="won"' : ''}></i>`).join('')}</span>` : '';
  score.classList.toggle('endless', !tally.firstTo);
  score.innerHTML = `<span class="duel-side duel-you"${tint(1)}><em>${mine}</em><b>${num('you')}</b></span><span class="duel-dash" aria-hidden="true"></span><span class="duel-side duel-robot"${tint(0)}><b>${num('robot')}</b><em>${theirs}</em></span>${pips(you, 1, 'you')}${tally.firstTo ? '<span></span>' : ''}${pips(robot, 0, 'robot')}<small>${DUEL_MODES[cfg?.mode]?.name || ''} · ${ffa() ? clockText(ffaLeft) + ' LEFT' : (tally.rounds ? tally.rounds + ' ROUNDS' : 'ENDLESS') + ' · ROUND ' + round}</small>`;
 };
 const api = {
  get active() { return !!cfg; },
  // (Only while a match is on: a finished match left behind must not hold
  // practice's death screen and respawn, main.js.)
  get over() { return !!cfg && !!tally.winner; },
  get score() { return tally; },
  // The round being played (v0.999a): 1 at the start, one more each time everyone comes back.
  get round() { return round; },
  // The top score's element (the score flash copies it, main.js).
  get scoreElement() { return score; },
  get config() { return cfg; },
  // FFA (every one for themselves, a clock, respawns): not elimination.
  get ffa() { return ffa(); },
  // FFA: seconds of the match left.
  get left() { return ffa() ? ffaLeft : null; },
  // FFA: where you come back instead of `at` when `at` is out in the storm
  // (or soon will be); null when `at` is fine.
  safeSpawn(at) { return ffa() && closing() && !stormSafe(stormPlan, stormClock, at) ? safeSpot(sim.player) : null; },
  // 1V1's duel circle (duel-circle.js; owner, 2026-09-29): a new place every
  // round, you and the robot on its two spots facing each other, and nobody
  // walks out of it (sim.boundary). Other modes: none. Returns whether it placed.
  get circle() { return circle; },
  // The storm (storm.js), in the team modes: its plan and clock ({ plan, t }), or null.
  stormNow() { return stormPlan ? { plan: stormPlan, t: stormClock } : null; },
  get storm() { return stormCircle; },
  placeDuel() {
   if (cfg?.mode !== '1v1') { circle = null; sim.boundary = null; return false; }
   circle = pickDuelCircle(sim.map, sim.colliders, { random, avoid: circle });
   const [mine, theirs] = circle.spawns, bot = api.bot;
   const dx = theirs.x - mine.x, dz = theirs.z - mine.z, d = Math.hypot(dx, dz) || 1;
   sim.respawn(mine); sim.player.aimX = dx / d; sim.player.aimZ = dz / d; sim.boundary = circle;
   if (bot) { bots.putAt(bot, sim, theirs); bot.sim.boundary = circle; }
   for (const b of robots) b.sim.boundary = circle;
   return true;
  },
  // The first enemy (1V1's robot).
  get bot() { return robots.find(b => b.team === 'red') || null; },
  get robots() { return robots; },
  // Sets the game up (after the practice start).
  begin(settings) {
   cfg = { ...DUEL_DEFAULTS, ...settings };
   const mode = DUEL_MODES[cfg.mode] || DUEL_MODES['1v1'];
   sim.noTargets = true; sim.targets = [];
   bots.clear(); bots.enemyRange = [...DUEL_ENEMY_RANGE]; bots.apart = SPAWN_APART;
   bots.teamSpawn = !!mode.allies && cfg.spawn === 'team';
   bots.baseSpawn = !!mode.allies; // s2-spawns: sides at their bases on a map with bases
   // (No friendly fire, owner 2026-09-29: your robots and you never hurt each other.)
   bots.friendlyFire = 0;
   const isFfa = !!mode.ffa;
   bots.holdRespawns = !isFfa;
   // FFA: robots come back on their own, inside the storm, and kills syphon.
   if (isFfa) { bots.respawnWait = FFA_RESPAWN; bots.onKill = syphon; bots.respawnSpot = bot => safeSpot(bot.sim.player); bots.baseSpawn = false; }
   robots = [];
   for (let i = 0; i < mode.allies; i++) {
    const b = bots.spawn(sim, playableOr(cfg.allyWeapon, null) || randomWeapon(random), { team: 'blue', skill: cfg.allySkill, style: 'blend', temper: cfg.allyTemper, aim: DUEL_AIMS[cfg.allyAim] });
    if (b) robots.push(b);
   }
   for (let i = 0; i < mode.enemies; i++) {
    const b = bots.spawn(sim, playableOr(cfg.botWeapon, null) || randomWeapon(random), { team: isFfa ? 'ffa' : 'red', skill: cfg.skill, style: 'blend', temper: cfg.temper, aim: DUEL_AIMS[cfg.aim] });
    if (b) { b.brain.hunch = .6; robots.push(b); }
   }
   cfg.weapon = api.bot?.sim.weapon;
   newStorm(true);
   ffaLeft = cfg.length;
   tally = new DuelScore(isFfa ? 0 : cfg.firstTo); alive = new Map(robots.map(b => [b, true])); overIn = -1; shownKey = ''; breakIn = -1; lastPoint = null; round = 1; forfeited = false; ended = false; held = null; roll = null;
   score.hidden = false; render();
   globalThis.document?.body?.classList.add('duel-on');
   return api.bot;
  },
  // Every frame (real seconds; `youStanding`: your body is up): a side with
  // nobody standing gives the other the point; DUEL_ROUND_BREAK later everyone
  // comes back, or the card goes up when that point won it.
  frame(dt, youStanding = true) {
   if (!cfg) return;
   for (const b of robots) alive.set(b, b.alive);
   // The storm's clock runs while a round is on (not in a break, not once decided).
   if (stormPlan && !tally.winner && !(breakIn > 0) && !(overIn > 0)) setStormClock(stormClock + dt);
   if (overIn > 0) { overIn -= dt; if (overIn <= 0) api.showResult(); return; }
   // (Decided: nothing more is counted; before, a finished match went on
   // scoring its last point and brought everyone back under the card.)
   if (tally.winner) return;
   // FFA: the clock runs down; most kills when it is out wins (a tie at the
   // top is a draw).
   if (ffa()) {
    ffaLeft = Math.max(0, ffaLeft - dt);
    const mine = bots.youStats?.kills || 0, top = robots.reduce((m, b) => Math.max(m, b.stats?.kills || 0), 0);
    tally.you = mine; tally.robot = top;
    if (ffaLeft <= 0) { tally.winner = mine > top ? 'you' : mine < top ? 'robot' : 'draw'; overIn = DUEL_RESULT_DELAY; }
    render(); return;
   }
   if (breakIn > 0) {
    breakIn -= dt;
    if (breakIn <= 0) {
     // (1V1: the held score turns over now.)
     if (held) { const side = lastPoint; roll = side ? { side, from: held[side], to: tally[side] } : null; held = null; }
     breakIn = -1; lastPoint = null; round++; newStorm(); render(); hooks.newRound?.();
    }
    return;
   }
   const ours = youStanding || robots.some(b => b.team === 'blue' && b.alive);
   const theirs = robots.some(b => b.team === 'red' && b.alive);
   if (ours && theirs) return;
   lastPoint = ours ? 'you' : theirs ? 'robot' : null;
   const duel1 = cfg.mode === '1v1';
   roll = null; held = duel1 ? { you: tally.you, robot: tally.robot } : null;
   // (A draw, both sides out at once, is a round played with no point.)
   const won = api.point(lastPoint);
   // (The deciding point turns over at once for either side: there is no
   // coming back for it to wait for. Owner, 2026-09-29: "the game stops at 9
   // ... because it doesn't count the last point won".)
   if (won) { held = null; roll = lastPoint ? { side: lastPoint, from: tally[lastPoint] - 1, to: tally[lastPoint] } : null; render(); overIn = duel1 ? AFTERMATH : DUEL_RESULT_DELAY; } else breakIn = duel1 ? DUEL_BREAK_1V1 : DUEL_ROUND_BREAK;
   // (1V1, you took the round: your number turns over on the top score now,
   // owner: "the player who does the killing gets the point update first";
   // the one who fell sees theirs turn over as both come back.)
   if (held && lastPoint === 'you') { roll = { side: 'you', from: held.you, to: tally.you }; held = null; render(); }
   hooks.pointWon?.(lastPoint);
  },
  // Between a point and everyone coming back: who took it ('you', 'robot',
  // null for nobody) and the seconds left; null otherwise.
  get pointBreak() { return breakIn > 0 ? { side: lastPoint, left: breakIn } : null; },
  // The last kill of the match, before the card: who took it and seconds left.
  get finalBreak() { return overIn > 0 ? { side: lastPoint, left: overIn } : null; },
  // The score before this round's point (1V1's break), for the stats panel's flip.
  get before() { return held; },
  // You died: counted by frame() with the rest (kept for callers).
  playerDied() { return false; },
  point(side) { const was = tally.winner; const won = tally.point(side); render(); return !was && won; },
  // FORFEIT (death card): the robots take the match; the card goes up at once.
  forfeit() { if (!cfg || tally.winner) return; tally.forfeit('you'); forfeited = true; breakIn = -1; held = roll = null; render(); api.showResult(); },
  // The match is over: the game stops and main.js shows the end card.
  showResult() {
   overIn = -1; held = null; ended = true; render();
   hooks.over?.(api.outcome);
  },
  // How it ended, for the end card (ui/match-end.js soloOutcome).
  get outcome() { return { winner: tally.winner, you: tally.you, robot: tally.robot, forfeited, team: team(), ffa: ffa(), mode: cfg?.mode || null }; },
  // A restart (pause menu or START on the end card): the score back to nothing.
  reset() { if (!cfg) return; tally.reset(); ffaLeft = cfg.length; alive = new Map(robots.map(b => [b, true])); overIn = -1; breakIn = -1; lastPoint = null; round = 1; shownKey = ''; forfeited = false; ended = false; held = roll = null; newStorm(); render(); },
  // The match is over and its end card is up (until a restart or leaving).
  get resultOpen() { return ended; },
  // Leaving: targets come back with the next reset. (The score goes too: a
  // finished match left behind held practice's death screen, main.js.)
  stop() {
   stormPlan = null; setStormClock(0);
   cfg = null; robots = []; sim.noTargets = false; circle = null; sim.boundary = null; score.hidden = true; tally = new DuelScore(); overIn = breakIn = -1; ended = false; held = roll = null; forfeited = false;
   bots.enemyRange = [22, 60]; bots.friendlyFire = 0; bots.apart = 0; bots.teamSpawn = false; bots.holdRespawns = false; bots.onKill = bots.respawnSpot = bots.respawnWait = null; breakIn = -1; lastPoint = null; globalThis.document?.body?.classList.remove('duel-on');
  },
 };
 return api;
}
