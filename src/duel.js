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
// top centre (the health bar under it); at the winning point the results
// card offers REMATCH or MAIN MENU.
import { WEAPONS } from './items.js';
import { SKILL_LEVELS, TEMPERS } from './bots/robot-profile.js';
import { refreshTypography } from './ui/button-typography.js';
import { SPAWN_APART, TEAMS } from './config/match.js';

export const DUEL_MODES = Object.freeze({
 '1v1': { name: '1V1', allies: 0, enemies: 1 },
 '2v2': { name: '2V2', allies: 1, enemies: 2 },
 '3v3': { name: '3V3', allies: 2, enemies: 3 },
});
export const DUEL_AIMS = Object.freeze({ sharper: .7, even: 1, sloppier: 1.5 });
export const DUEL_FIRST_TO = Object.freeze([3, 5, 10, 0]);   // 0: endless
export const FRIENDLY_SHARE = .5;
export const DUEL_DEFAULTS = Object.freeze({ mode: '1v1', firstTo: 5, friendlyFire: 'on',
 spawn: 'scattered', botWeapon: null, skill: 'normal', aim: 'even', temper: 'shifting',
 allyWeapon: null, allySkill: 'normal', allyAim: 'even', allyTemper: 'shifting' });
export const DUEL_ENEMY_RANGE = Object.freeze([16, 34]);
export const DUEL_RESULT_DELAY = 1.4;   // seconds of the last kill before the card
// Seconds between a side going out and everyone coming back (v0.999a).
export const DUEL_ROUND_BREAK = 5; // (owner: "a short bit more time in between respawns")

const weaponIds = () => WEAPONS.map(w => w.id);
const ORDER = ['mode', 'firstTo', 'friendlyFire', 'botWeapon', 'skill', 'aim', 'temper', 'allyWeapon', 'allySkill', 'allyAim', 'allyTemper', 'spawn'];
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
 };
}

// The score and who has won (plain, tested). `you`: your side's points.
export class DuelScore {
 constructor(firstTo = 5) { this.firstTo = firstTo; this.reset(); }
 reset() { this.you = 0; this.robot = 0; this.winner = null; }
 point(side) {
  if (this.winner) return this.winner;
  this[side]++;
  if (this.firstTo && this[side] >= this.firstTo) this.winner = side;
  return this.winner;
 }
}

const weaponName = id => WEAPONS.find(w => w.id === id)?.name || '';
const randomWeapon = random => WEAPONS[Math.floor(random() * WEAPONS.length)].id;

// Played by elimination (v0.999a, owner: "after whoever dies, both players
// respawn at full health random again. for 2v2, after two players on a team
// die, everyone respawns ... and whoever the last man's team is gets the
// point"): nobody comes back on their own (the robots hold, bots.holdRespawns;
// you watch a teammate, main.js); when one side has nobody standing, the other
// scores, and DUEL_ROUND_BREAK later everyone comes back (hooks.newRound).
//
// `hooks`: over() when the result card goes up (the game stops), rematch(),
// menu(), newRound() when everyone comes back.
export function createDuel(parent, { sim, bots, hooks = {}, random = Math.random }) {
 const score = document.createElement('div');
 score.className = 'duel-score'; score.hidden = true; score.setAttribute('aria-live', 'polite');
 const card = document.createElement('section');
 card.className = 'match-results duel-results hidden'; card.setAttribute('role', 'dialog'); card.setAttribute('aria-label', 'Match result');
 card.innerHTML = '<div class="modal-card"><h2></h2><p class="match-winner"></p><p class="duel-detail"></p><div class="duel-results-actions"><button type="button" class="primary duel-rematch">REMATCH</button><button type="button" class="secondary duel-menu">MAIN MENU</button></div></div>';
 parent.append(score, card);
 let cfg = null, tally = new DuelScore(), robots = [], alive = new Map(), overIn = -1, shownKey = '', breakIn = -1, lastPoint = null, round = 1;
 card.querySelector('.duel-rematch').onclick = () => hooks.rematch?.();
 card.querySelector('.duel-menu').onclick = () => hooks.menu?.();
 const team = () => DUEL_MODES[cfg?.mode]?.allies > 0;
 const names = () => (team() ? ['YOUR TEAM', 'ENEMIES'] : ['YOU', 'ROBOT']);

 const render = () => {
  const key = tally.you + ':' + tally.robot + ':' + tally.firstTo + ':' + cfg?.mode + ':' + round;
  if (key === shownKey) return; shownKey = key;
  const [mine, theirs] = names(), tint = i => (team() ? ` style="color:${TEAMS[i].colour}"` : '');
  // (v0.999a, owner: "make it match rest of game ui": no pill; drawn like the
  // health bar under it: the numbers in its face, and first-to games a row of
  // its track's segments per side, filled from the middle out.)
  const pips = (n, i, side) => tally.firstTo ? `<span class="duel-track duel-${side}"${tint(i)}>${Array.from({ length: Math.min(tally.firstTo, 10) }, (_, k) => `<i${k < Math.min(n, 10) ? ' class="won"' : ''}></i>`).join('')}</span>` : '';
  score.classList.toggle('endless', !tally.firstTo);
  score.innerHTML = `<span class="duel-side duel-you"${tint(1)}><em>${mine}</em><b>${tally.you}</b></span><span class="duel-dash" aria-hidden="true"></span><span class="duel-side duel-robot"${tint(0)}><b>${tally.robot}</b><em>${theirs}</em></span>${pips(tally.you, 1, 'you')}${tally.firstTo ? '<span></span>' : ''}${pips(tally.robot, 0, 'robot')}<small>${DUEL_MODES[cfg?.mode]?.name || ''} · ${tally.firstTo ? 'FIRST TO ' + tally.firstTo : 'ENDLESS'} · ROUND ${round}</small>`;
 };
 const api = {
  get active() { return !!cfg; },
  get over() { return !!tally.winner; },
  get score() { return tally; },
  // The round being played (v0.999a): 1 at the start, one more each time everyone comes back.
  get round() { return round; },
  // The top score's element (the score flash copies it, main.js).
  get scoreElement() { return score; },
  get config() { return cfg; },
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
   bots.friendlyFire = mode.allies && cfg.friendlyFire === 'on' ? FRIENDLY_SHARE : 0;
   bots.holdRespawns = true;
   robots = [];
   for (let i = 0; i < mode.allies; i++) {
    const b = bots.spawn(sim, cfg.allyWeapon || randomWeapon(random), { team: 'blue', skill: cfg.allySkill, style: 'blend', temper: cfg.allyTemper, aim: DUEL_AIMS[cfg.allyAim] });
    if (b) robots.push(b);
   }
   for (let i = 0; i < mode.enemies; i++) {
    const b = bots.spawn(sim, cfg.botWeapon || randomWeapon(random), { team: 'red', skill: cfg.skill, style: 'blend', temper: cfg.temper, aim: DUEL_AIMS[cfg.aim] });
    if (b) { b.brain.hunch = .6; robots.push(b); }
   }
   cfg.weapon = api.bot?.sim.weapon;
   tally = new DuelScore(cfg.firstTo); alive = new Map(robots.map(b => [b, true])); overIn = -1; shownKey = ''; breakIn = -1; lastPoint = null; round = 1;
   score.hidden = false; card.classList.add('hidden'); render();
   globalThis.document?.body?.classList.add('duel-on');
   return api.bot;
  },
  // Every frame (real seconds; `youStanding`: your body is up): a side with
  // nobody standing gives the other the point; DUEL_ROUND_BREAK later everyone
  // comes back, or the card goes up when that point won it.
  frame(dt, youStanding = true) {
   if (!cfg) return;
   for (const b of robots) alive.set(b, b.alive);
   if (overIn > 0) { overIn -= dt; if (overIn <= 0) api.showResult(); return; }
   if (breakIn > 0) {
    breakIn -= dt;
    if (breakIn <= 0) { breakIn = -1; lastPoint = null; round++; render(); hooks.newRound?.(); }
    return;
   }
   const ours = youStanding || robots.some(b => b.team === 'blue' && b.alive);
   const theirs = robots.some(b => b.team === 'red' && b.alive);
   if (ours && theirs) return;
   lastPoint = ours ? 'you' : theirs ? 'robot' : null;
   const won = lastPoint ? api.point(lastPoint) : false;
   if (won) overIn = DUEL_RESULT_DELAY; else breakIn = DUEL_ROUND_BREAK;
  },
  // Between a point and everyone coming back: who took it ('you', 'robot',
  // null for nobody) and the seconds left; null otherwise.
  get pointBreak() { return breakIn > 0 ? { side: lastPoint, left: breakIn } : null; },
  // You died: counted by frame() with the rest (kept for callers).
  playerDied() { return false; },
  point(side) { const was = tally.winner; const won = tally.point(side); render(); return !was && won; },
  showResult() {
   overIn = -1;
   const you = tally.winner === 'you', [mine, theirs] = names();
   card.querySelector('h2').textContent = you ? (team() ? 'your team wins' : 'you win') : (team() ? 'enemies win' : 'robot wins');
   card.querySelector('.match-winner').innerHTML = `<span class="feed-you">${mine} ${tally.you}</span> · <span class="feed-enemy">${tally.robot} ${theirs}</span>`;
   const enemy = api.bot;
   card.querySelector('.duel-detail').textContent = (team()
    ? [DUEL_MODES[cfg.mode].name, 'enemies ' + cfg.skill, 'yours ' + cfg.allySkill, 'friendly fire ' + cfg.friendlyFire]
    : [weaponName(sim.weapon) + ' vs ' + weaponName(enemy?.sim.weapon), enemy?.profile.label]).filter(Boolean).join(' · ').toUpperCase();
   card.classList.remove('hidden'); refreshTypography();
   hooks.over?.();
   card.querySelector('.duel-rematch').focus();
  },
  // A restart (pause menu or rematch): the score back to nothing.
  reset() { if (!cfg) return; tally.reset(); alive = new Map(robots.map(b => [b, true])); overIn = -1; breakIn = -1; lastPoint = null; round = 1; shownKey = ''; card.classList.add('hidden'); render(); },
  get resultOpen() { return !card.classList.contains('hidden'); },
  get root() { return card; },
  // Leaving: targets come back with the next reset.
  stop() {
   cfg = null; robots = []; sim.noTargets = false; score.hidden = true; card.classList.add('hidden');
   bots.enemyRange = [22, 60]; bots.friendlyFire = 0; bots.apart = 0; bots.teamSpawn = false; bots.holdRespawns = false; breakIn = -1; lastPoint = null; globalThis.document?.body?.classList.remove('duel-on');
  },
 };
 return api;
}
