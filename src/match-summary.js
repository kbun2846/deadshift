// The match summary that celebrates you (owner, 2026-10-02: "Do 4": after
// each match, your kills, best streak, damage, accuracy and favourite weapon,
// plus one highlight, "3 ONE SHOTS!", "LONGEST LIFE 2:14"). Pure, no DOM:
// ui/summary-card.js draws it on the end card (ui/match-end.js).
//
// Every number comes from what this screen already knows, online too:
//  - kills, deaths and damage dealt from the end card's own row for you (the
//    host's scoreboard online, BotMatch's stats against bots), so the card
//    and the table never disagree; counted here only when there is no row;
//  - accuracy: attacks are your own sim's attack events (each shot, shell,
//    orb volley, swing, grenade; Static's stream is a beam, not counted), and
//    an attack counts as a hit when a hit on a player or a bot follows it
//    within SUMMARY.window seconds (one per frame at most, oldest attack
//    first: a shell's pellets, or one swing through two bodies, is one hit),
//    so hits never outnumber attacks;
//  - streaks, one-shots and the weapon behind each kill from your own kill
//    events; shutdowns from the feel layer's streak news (yours);
//  - lives timed while you are up and playing; favourite weapon = most
//    kills, then most time in hand;
//  - a comeback from the score seen during the match (round points, or kills
//    behind the leader in FFA), sampled every SUMMARY.sampleEvery seconds.
// One highlight is picked by `pickHighlight`: the strongest of a short list.
import { SUMMARY } from './config/death-flow.js';

// Your sim's events that are one attack each.
export const ATTACK_EVENTS = Object.freeze(new Set(['rifleShot', 'shotgunShot', 'launch', 'sidekickShot', 'sightlineShot', 'omenShot', 'omenVolley', 'ichorSwing', 'ichorWave', 'sheathSwing', 'sheathDrawCut', 'grenadeThrow', 'scatterFire', 'hexPulse']));
const onBody = e => e.targetKind === 'player' || e.targetKind === 'robot';
export const clockText = s => { const t = Math.max(0, Math.round(s)); return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'); };

export function createMatchTracker(cfg = SUMMARY) {
 let s;
 const fresh = () => ({ key: null, time: 0, attacks: 0, hits: 0, pending: [], hitThisFrame: false, kills: 0, deaths: 0, oneShots: 0, streak: 0, bestStreak: 0, shutdowns: 0,
  life: 0, longest: 0, alive: false, weaponTime: {}, weaponKills: {}, lastAttack: null, deficit: 0, dealt: 0 });
 s = fresh();
 return {
  get state() { return s; },
  get key() { return s.key; },
  // A new match (its key: whatever names it, e.g. online 'o3', BOTS 'd7').
  reset(key = null) { s = fresh(); s.key = key; },
  // One of your own sim's events; `weapon` the one in your hand now.
  event(e, weapon) {
   const t = e.type;
   if (ATTACK_EVENTS.has(t)) { s.attacks++; s.pending.push(s.time); s.lastAttack = weapon || s.lastAttack; return; }
   if ((t === 'hit' || t === 'kill') && onBody(e)) {
    if (e.damage > 0) s.dealt += e.damage;
    if (!s.hitThisFrame) {
     while (s.pending.length && s.time - s.pending[0] > cfg.window) s.pending.shift();
     if (s.pending.length) { s.pending.shift(); s.hits++; s.hitThisFrame = true; }
    }
    if (t === 'kill') {
     s.kills++; s.streak++; s.bestStreak = Math.max(s.bestStreak, s.streak);
     if (e.oneShot) s.oneShots++;
     const w = s.lastAttack || weapon; if (w) s.weaponKills[w] = (s.weaponKills[w] || 0) + 1;
    }
    return;
   }
   if (t === 'playerDeath') { s.deaths++; s.streak = 0; s.longest = Math.max(s.longest, s.life); s.life = 0; s.alive = false; }
  },
  // Streak news for you (streaks.js streakNews, `mine`): shutdowns.
  news(n) { if (n?.mine && n.kind === 'shutdown') s.shutdowns++; },
  // Each frame: `alive` (up and playing), the weapon in hand.
  frame(dt, alive, weapon) {
   s.time += dt; s.hitThisFrame = false;
   if (alive) { if (!s.alive) s.life = 0; s.alive = true; s.life += dt; s.longest = Math.max(s.longest, s.life); if (weapon) s.weaponTime[weapon] = (s.weaponTime[weapon] || 0) + dt; }
   else if (s.alive) s.alive = false;
  },
  // How far behind you were (round points, or kills behind the leader).
  score(mine, best) { if (Number.isFinite(mine) && Number.isFinite(best)) s.deficit = Math.max(s.deficit, best - mine); },
  // The summary: `row` your end-card row (kills, deaths, dealt), `rows` all
  // of them, `won`, `rounds` (a round mode: the comeback counts points).
  summary({ row = null, rows = [], won = false, rounds = false, weapon = null } = {}) {
   const fav = favouriteWeapon(s.weaponKills, s.weaponTime) || weapon || null;
   const out = {
    kills: row ? row.kills ?? s.kills : s.kills, deaths: row ? row.deaths ?? s.deaths : s.deaths,
    damage: Math.round(row ? row.dealt ?? s.dealt : s.dealt), bestStreak: s.bestStreak,
    attacks: s.attacks, hits: s.hits, accuracy: s.attacks ? s.hits / s.attacks : null,
    favourite: fav, favouriteKills: fav ? s.weaponKills[fav] || 0 : 0,
    oneShots: s.oneShots, shutdowns: s.shutdowns, longestLife: s.longest, deficit: s.deficit, won: !!won, rounds: !!rounds,
   };
   const mine = row ? row.dealt ?? s.dealt : s.dealt;
   out.topDamage = mine > 0 && rows.length > 1 && rows.every(r => r === row || (row && r.id === row.id) || (r.dealt || 0) < mine);
   out.highlight = pickHighlight(out, cfg);
   return out;
  },
 };
}

// Most kills, then most time in hand.
export function favouriteWeapon(kills = {}, time = {}) {
 const ids = new Set([...Object.keys(kills), ...Object.keys(time)]);
 let best = null;
 for (const id of ids) {
  if (!best || (kills[id] || 0) > (kills[best] || 0) || ((kills[id] || 0) === (kills[best] || 0) && (time[id] || 0) > (time[best] || 0))) best = id;
 }
 return best;
}

// The one highlight: every one that qualifies scores, the strongest wins
// (ties: the earlier in this list). { id, text } or null.
export function pickHighlight(st, cfg = SUMMARY) {
 const h = cfg.highlight, list = [];
 const add = (id, score, text) => list.push({ id, score, text });
 if (st.won && st.deficit >= (st.rounds ? h.comeback : h.ffaComeback)) add('comeback', 75 + 5 * st.deficit, st.rounds ? `COMEBACK FROM ${st.deficit} DOWN` : `COMEBACK FROM ${st.deficit} KILLS DOWN`);
 if (st.oneShots >= 2) add('oneShots', 60 + 10 * st.oneShots, `${st.oneShots} ONE SHOTS!`);
 if (st.shutdowns >= 1) add('shutdown', 55 + 8 * (st.shutdowns - 1), st.shutdowns > 1 ? `${st.shutdowns} SHUTDOWNS!` : 'SHUTDOWN!');
 if (st.bestStreak >= h.streak) add('streak', 30 + 7 * st.bestStreak, `${st.bestStreak} KILL STREAK`);
 if (st.topDamage) add('topDamage', 36, `TOP DAMAGE · ${st.damage}`);
 if (st.oneShots === h.oneShots) add('oneShot', 32, 'ONE SHOT!');
 if (st.accuracy != null && st.attacks >= h.accuracyAttacks && st.accuracy >= h.accuracy) add('accuracy', 28 + (st.accuracy - h.accuracy) * 80, `${Math.round(st.accuracy * 100)}% ACCURACY`);
 if (st.longestLife >= h.longLife) add('longestLife', 20 + st.longestLife / 10, `LONGEST LIFE ${clockText(st.longestLife)}`);
 if (st.kills > 0) add('kills', 10 + st.kills, st.kills === 1 ? 'FIRST BLOOD' : `${st.kills} KILLS`);
 // (Nothing else: what you dealt, or a life worth naming; else no highlight.)
 if (st.damage > 0) add('damage', 5, `${st.damage} DAMAGE DEALT`);
 else if (st.longestLife >= 5) add('life', 1, `LONGEST LIFE ${clockText(st.longestLife)}`);
 let best = null;
 for (const c of list) if (!best || c.score > best.score) best = c;
 return best ? { id: best.id, text: best.text } : null;
}

// The tracker kept in step with the game (main.js hands it what it has):
// online the host's match number, BOTS its match id; nothing in plain
// practice or the tutorial (no match, no end card).
export function createSummaryWatch({ online, duel, bots, sim, cfg = SUMMARY }) {
 const tracker = createMatchTracker(cfg);
 let sampled = 0, frozen = null;
 const keyNow = () => {
  if (online.active) { const m = online.match(); return m && (m.phase === 'playing' || m.phase === 'results') ? 'o' + m.number : null; }
  return duel.active ? 'd' + duel.matchId : null;
 };
 const sample = () => {
  if (online.active) {
   const m = online.match(); if (m?.phase !== 'playing') return;
   const me = online.myTeam || online.myId;
   if (m.elimination) { const sides = m.sides || []; const mine = sides.find(x => x.id === me)?.points ?? 0; tracker.score(mine, Math.max(0, ...sides.filter(x => x.id !== me).map(x => x.points))); return; }
   const board = online.scoreboard() || []; const mine = board.find(r => r.id === online.myId)?.kills ?? 0;
   tracker.score(mine, Math.max(0, ...board.filter(r => r.id !== online.myId).map(r => r.kills || 0)));
   return;
  }
  if (!duel.active) return;
  if (duel.ffa) { tracker.score(bots.youStats?.kills ?? 0, Math.max(0, ...bots.bots.map(b => b.stats?.kills || 0))); return; }
  if (duel.score) tracker.score(duel.score.you, duel.score.robot);
 };
 return {
  tracker,
  event(e) { if (keyNow() !== null) tracker.event(e, sim.weapon); },
  news(n) { if (keyNow() !== null) tracker.news(n); },
  frame(dt, alive) {
   const key = keyNow();
   if (key === null) return;
   if (key !== tracker.key) { tracker.reset(key); frozen = null; sampled = 0; }
   const playing = online.active ? online.match()?.phase === 'playing' : !duel.over;
   if (!playing) return;
   tracker.frame(dt, alive, sim.weapon);
   if ((sampled += dt) >= cfg.sampleEvery) { sampled = 0; sample(); }
  },
  // The summary for the end card, worked out once per match.
  card({ rows = [], myId, won = false, rounds = false } = {}) {
   if (frozen?.key === tracker.key && frozen.summary) return frozen.summary;
   const row = rows.find(r => r.id === myId) || null;
   const summary = tracker.summary({ row, rows, won, rounds, weapon: sim.weapon });
   frozen = { key: tracker.key, summary };
   return summary;
  },
 };
}
