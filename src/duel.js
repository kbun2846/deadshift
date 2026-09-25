// 1V1 (owner, v132): you against one robot, from Gamemodes > 1V1.
//
// The page (ui/duel-menu.js) picks the map, your weapon, the robot's weapon
// (or random), its skill (rookie to expert), a little tweaking (aim sharper /
// as its skill / sloppier; temper calm / shifting / aggressive) and first to
// 3, 5, 10 or endless. The robot is always a blend of styles with a mood that
// moves over the fight (bots/robot-profile.js). The choices ride in the URL
// (`mode=duel&duel=...`) like the practice map and weapon, so a map that is
// not loaded yet loads with the duel waiting.
//
// In the game: no practice targets, one enemy robot that comes in 16-34 m
// away and back after a death, both sides respawning as in practice. A kill
// either way is a point (a robot that blows itself up gives you one; so does
// your own blast to it). The score sits top centre; at the winning point the
// results card (the multiplayer one's look) offers REMATCH or MAIN MENU.
import { WEAPONS } from './items.js';
import { SKILL_LEVELS, TEMPERS } from './bots/robot-profile.js';
import { refreshTypography } from './ui/button-typography.js';

export const DUEL_AIMS = Object.freeze({ sharper: .7, even: 1, sloppier: 1.5 });
export const DUEL_FIRST_TO = Object.freeze([3, 5, 10, 0]);   // 0: endless
export const DUEL_DEFAULTS = Object.freeze({ botWeapon: null, skill: 'normal', aim: 'even', temper: 'shifting', firstTo: 5 });
export const DUEL_ENEMY_RANGE = Object.freeze([16, 34]);
export const DUEL_RESULT_DELAY = 1.4;   // seconds of the last kill before the card

const weaponIds = () => WEAPONS.map(w => w.id);
// The URL value: weapon.skill.aim.temper.firstTo (weapon 'random' for any).
export const duelParam = cfg => [cfg.botWeapon || 'random', cfg.skill, cfg.aim, cfg.temper, cfg.firstTo].join('.');
export function readDuel(value) {
 if (value == null) return null;
 const [w, skill, aim, temper, to] = String(value).split('.');
 const n = Number(to);
 return {
  botWeapon: weaponIds().includes(w) ? w : null,
  skill: SKILL_LEVELS.includes(skill) ? skill : DUEL_DEFAULTS.skill,
  aim: aim in DUEL_AIMS ? aim : DUEL_DEFAULTS.aim,
  temper: temper in TEMPERS ? temper : DUEL_DEFAULTS.temper,
  firstTo: DUEL_FIRST_TO.includes(n) ? n : DUEL_DEFAULTS.firstTo,
 };
}

// The score and who has won (plain, tested).
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

// `hooks`: over() when the result card goes up (the game stops), rematch(),
// menu().
export function createDuel(parent, { sim, bots, hooks = {}, random = Math.random }) {
 const score = document.createElement('div');
 score.className = 'duel-score'; score.hidden = true; score.setAttribute('aria-live', 'polite');
 const card = document.createElement('section');
 card.className = 'match-results duel-results hidden'; card.setAttribute('role', 'dialog'); card.setAttribute('aria-label', '1v1 result');
 card.innerHTML = '<div class="modal-card"><h2></h2><p class="match-winner"></p><p class="duel-detail"></p><div class="duel-results-actions"><button type="button" class="primary duel-rematch">REMATCH</button><button type="button" class="secondary duel-menu">MAIN MENU</button></div></div>';
 parent.append(score, card);
 let cfg = null, tally = new DuelScore(), bot = null, wasAlive = true, overIn = -1, shownKey = '';
 card.querySelector('.duel-rematch').onclick = () => hooks.rematch?.();
 card.querySelector('.duel-menu').onclick = () => hooks.menu?.();

 const render = () => {
  const key = tally.you + ':' + tally.robot + ':' + tally.firstTo;
  if (key === shownKey) return; shownKey = key;
  score.innerHTML = `<span class="duel-you">YOU <b>${tally.you}</b></span><i>·</i><span class="duel-robot"><b>${tally.robot}</b> ROBOT</span><small>${tally.firstTo ? 'FIRST TO ' + tally.firstTo : 'ENDLESS'}</small>`;
 };
 const api = {
  get active() { return !!cfg; },
  get over() { return !!tally.winner; },
  get score() { return tally; },
  get bot() { return bot; },
  // Sets the game up for a duel (after the practice start).
  begin(settings) {
   cfg = { ...DUEL_DEFAULTS, ...settings };
   cfg.weapon = cfg.botWeapon || WEAPONS[Math.floor(random() * WEAPONS.length)].id;
   sim.noTargets = true; sim.targets = [];
   bots.clear(); bots.enemyRange = [...DUEL_ENEMY_RANGE];
   bot = bots.spawn(sim, cfg.weapon, { team: 'ffa', skill: cfg.skill, style: 'blend', temper: cfg.temper, aim: DUEL_AIMS[cfg.aim] });
   if (bot) bot.brain.hunch = .6;
   tally = new DuelScore(cfg.firstTo); wasAlive = true; overIn = -1; shownKey = '';
   score.hidden = false; card.classList.add('hidden'); render();
   return bot;
  },
  // Every frame (real seconds): the robot going down is your point; the
  // card goes up a moment after the winning kill.
  frame(dt) {
   if (!cfg || !bot) return;
   if (wasAlive && !bot.alive && api.point('you')) overIn = DUEL_RESULT_DELAY;
   wasAlive = bot.alive;
   if (overIn > 0) { overIn -= dt; if (overIn <= 0) api.showResult(); }
  },
  // You died: the robot's point. True when that ends it.
  playerDied() { if (!cfg) return false; const done = !!api.point('robot'); if (done) overIn = DUEL_RESULT_DELAY; return done; },
  point(side) { const was = tally.winner; const won = tally.point(side); render(); return !was && won; },
  showResult() {
   overIn = -1;
   const you = tally.winner === 'you';
   card.querySelector('h2').textContent = you ? 'you win' : 'robot wins';
   card.querySelector('.match-winner').innerHTML = `<span class="feed-you">YOU ${tally.you}</span> · <span class="feed-enemy">${tally.robot} ROBOT</span>`;
   card.querySelector('.duel-detail').textContent = [weaponName(sim.weapon) + ' vs ' + weaponName(bot?.sim.weapon), bot?.profile.label].filter(Boolean).join(' · ').toUpperCase();
   card.classList.remove('hidden'); refreshTypography();
   hooks.over?.();
   card.querySelector('.duel-rematch').focus();
  },
  // A restart (pause menu or rematch): the score back to nothing.
  reset() { if (!cfg) return; tally.reset(); wasAlive = true; overIn = -1; shownKey = ''; card.classList.add('hidden'); render(); },
  get resultOpen() { return !card.classList.contains('hidden'); },
  // Leaving: targets come back with the next reset.
  stop() { cfg = null; bot = null; sim.noTargets = false; score.hidden = true; card.classList.add('hidden'); bots.enemyRange = [22, 60]; },
 };
 return api;
}
