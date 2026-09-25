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

// `hooks`: over() when the result card goes up (the game stops), rematch(),
// menu().
export function createDuel(parent, { sim, bots, hooks = {}, random = Math.random }) {
 const score = document.createElement('div');
 score.className = 'duel-score'; score.hidden = true; score.setAttribute('aria-live', 'polite');
 const card = document.createElement('section');
 card.className = 'match-results duel-results hidden'; card.setAttribute('role', 'dialog'); card.setAttribute('aria-label', 'Match result');
 card.innerHTML = '<div class="modal-card"><h2></h2><p class="match-winner"></p><p class="duel-detail"></p><div class="duel-results-actions"><button type="button" class="primary duel-rematch">REMATCH</button><button type="button" class="secondary duel-menu">MAIN MENU</button></div></div>';
 parent.append(score, card);
 let cfg = null, tally = new DuelScore(), robots = [], alive = new Map(), overIn = -1, shownKey = '';
 card.querySelector('.duel-rematch').onclick = () => hooks.rematch?.();
 card.querySelector('.duel-menu').onclick = () => hooks.menu?.();
 const team = () => DUEL_MODES[cfg?.mode]?.allies > 0;
 const names = () => (team() ? ['YOUR TEAM', 'ENEMIES'] : ['YOU', 'ROBOT']);

 const render = () => {
  const key = tally.you + ':' + tally.robot + ':' + tally.firstTo + ':' + cfg?.mode;
  if (key === shownKey) return; shownKey = key;
  const [mine, theirs] = names(), tint = i => (team() ? ` style="color:${TEAMS[i].colour}"` : '');
  score.innerHTML = `<span class="duel-side duel-you"${tint(1)}><em>${mine}</em><b>${tally.you}</b></span><span class="duel-dash">–</span><span class="duel-side duel-robot"${tint(0)}><b>${tally.robot}</b><em>${theirs}</em></span><small>${DUEL_MODES[cfg?.mode]?.name || ''} · ${tally.firstTo ? 'FIRST TO ' + tally.firstTo : 'ENDLESS'}</small>`;
 };
 const api = {
  get active() { return !!cfg; },
  get over() { return !!tally.winner; },
  get score() { return tally; },
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
   bots.friendlyFire = mode.allies && cfg.friendlyFire === 'on' ? FRIENDLY_SHARE : 0;
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
   tally = new DuelScore(cfg.firstTo); alive = new Map(robots.map(b => [b, true])); overIn = -1; shownKey = '';
   score.hidden = false; card.classList.add('hidden'); render();
   globalThis.document?.body?.classList.add('duel-on');
   return api.bot;
  },
  // Every frame (real seconds): a robot going down is a point for the other
  // side; the card goes up a moment after the winning kill.
  frame(dt) {
   if (!cfg) return;
   for (const b of robots) {
    if (alive.get(b) && !b.alive && api.point(b.team === 'blue' ? 'robot' : 'you')) overIn = DUEL_RESULT_DELAY;
    alive.set(b, b.alive);
   }
   if (overIn > 0) { overIn -= dt; if (overIn <= 0) api.showResult(); }
  },
  // You died: the other side's point. True when that ends it.
  playerDied() { if (!cfg) return false; const done = !!api.point('robot'); if (done) overIn = DUEL_RESULT_DELAY; return done; },
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
  reset() { if (!cfg) return; tally.reset(); alive = new Map(robots.map(b => [b, true])); overIn = -1; shownKey = ''; card.classList.add('hidden'); render(); },
  get resultOpen() { return !card.classList.contains('hidden'); },
  get root() { return card; },
  // Leaving: targets come back with the next reset.
  stop() {
   cfg = null; robots = []; sim.noTargets = false; score.hidden = true; card.classList.add('hidden');
   bots.enemyRange = [22, 60]; bots.friendlyFire = 0; bots.apart = 0; bots.teamSpawn = false; globalThis.document?.body?.classList.remove('duel-on');
  },
 };
 return api;
}
