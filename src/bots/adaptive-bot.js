// QUICK PLAY's bot (owner, 2026-10-01: "a bot fight against a normal bot that
// slightly/subtly adapts to the player's gameplay"): a Normal, blend-style
// robot (robot-profile.js) whose hands and head are nudged a little, round by
// round, toward keeping the rounds close.
//
// What it watches (the whole quick play session: one page, reset when the
// page is): every finished round, who took it and the damage each side dealt
// in it. Older rounds fade (ADAPT.memory per round), so it follows how you
// are playing now, not an hour ago. From those it works out an `edge`, -1
// (you are losing badly) to +1 (you are winning easily):
//   rounds: (your wins - its wins) / (rounds counted + ADAPT.roundsFull),
//   damage: log2(dealt / taken) / ADAPT.ratioFull, clamped to ±1,
//   target = rounds * ADAPT.roundWeight + damage * ADAPT.damageWeight,
// and the edge walks a share (ADAPT.step) of the way to that target each
// round, so one lucky round barely moves it.
//
// What it changes: only the robot's own skill numbers, each by at most
// ADAPT.max (15%) either way from what that robot was made with:
//   aim error, settle time, reaction time   down when you are winning (sharper)
//   dodge chance                            up when you are winning
//   hold (waits for you rather than going)  down when you are winning (presses more)
//   boldness (aggr)                         up when you are winning, by ADAPT.boldness at most
// and the reverse when you are losing. Health, damage, speed, weapons and what
// it can see are never touched (nothing a player could catch it cheating at),
// and the numbers only change between rounds (`apply` at a round's start),
// never in the middle of a fight. There is no randomness in here: the same
// rounds give the same numbers (the robot's own jitter comes from its
// profile's seeded random, robot-profile.js).
export const ADAPT = Object.freeze({
 max: .15,          // the most any skill number moves from the robot's own (±15%)
 boldness: .08,     // the most its boldness (0-1) moves, added
 roundWeight: .6,   // the share of the target from round wins and losses
 damageWeight: .4,  // the share from damage dealt against taken
 roundsFull: 2,     // rounds of "evidence" a lead is weighed against (fewer rounds: a smaller lean)
 ratioFull: 1.5,    // dealt / taken = 2^1.5 (about 2.8 to 1) counts as fully one-sided
 memory: .75,       // each finished round, older rounds count this much less
 step: .5,          // the edge moves this share of the way to its target per round
});

import { applyMood } from './robot-profile.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class BotAdapter {
 constructor(settings = ADAPT) { this.settings = settings; this.reset(); }

 // A new session: nothing known, the robot as it was made.
 reset() { this.edge = 0; this.wins = 0; this.losses = 0; this.dealt = 0; this.taken = 0; this.rounds = 0; }

 // Where the evidence points now (-1 to 1), before the edge walks there.
 target() {
  const s = this.settings, counted = this.wins + this.losses;
  const rounds = counted ? (this.wins - this.losses) / (counted + s.roundsFull) : 0;
  const damage = this.dealt + this.taken > 0 ? clamp(Math.log2((this.dealt + 1) / (this.taken + 1)) / s.ratioFull, -1, 1) : 0;
  return clamp(rounds * s.roundWeight + damage * s.damageWeight, -1, 1);
 }

 // A round is over: `winner` 'you' / 'robot' / null (a draw), and the damage
 // you dealt and took in it. Returns the new edge.
 round(winner, dealt = 0, taken = 0) {
  const s = this.settings, keep = s.memory;
  this.wins *= keep; this.losses *= keep; this.dealt *= keep; this.taken *= keep;
  if (winner === 'you') this.wins++; else if (winner === 'robot') this.losses++;
  this.dealt += Math.max(0, dealt || 0); this.taken += Math.max(0, taken || 0);
  this.rounds++;
  this.edge = clamp(this.edge + (this.target() - this.edge) * s.step, -1, 1);
  return this.edge;
 }

 // The multipliers for the robot's numbers now (all within 1 ± ADAPT.max).
 factors(edge = this.edge) {
  const k = clamp(edge, -1, 1) * this.settings.max;
  return { aim: 1 - k, settle: 1 - k, reaction: 1 - k, dodge: 1 + k, hold: 1 - k, aggr: clamp(edge, -1, 1) * this.settings.boldness };
 }

 // Sets a robot's profile from `base` (its numbers as it was made: `snapshot`)
 // and the edge. Call it as a round starts.
 apply(pf, base) {
  if (!pf || !base) return pf;
  const f = this.factors();
  pf.aim = base.aim * f.aim;
  pf.settle = base.settle * f.settle;
  pf.reaction = [base.reaction[0] * f.reaction, base.reaction[1] * f.reaction];
  pf.dodge = clamp(base.dodge * f.dodge, 0, 1);
  if (base.hold != null) pf.hold = base.hold * f.hold;
  // Boldness: a tempered robot's mood leans it from `pf.base.aggr`
  // (robot-profile.js applyMood, which also redoes what boldness sets).
  if (pf.base && base.moodAggr != null) { pf.base.aggr = clamp(base.moodAggr + f.aggr, 0, 1); applyMood(pf); }
  else pf.aggr = clamp(base.aggr + f.aggr, 0, 1);
  return pf;
 }
}

// A robot's numbers as it was made, for `apply` (taken once per robot).
export function snapshot(pf) {
 return { aim: pf.aim, settle: pf.settle, reaction: [...pf.reaction], dodge: pf.dodge, hold: pf.hold ?? null, aggr: pf.aggr, moodAggr: pf.base?.aggr ?? null };
}

// Quick play's bot fight, watched once a frame (main.js): each finished
// round goes to the adapter (who took it, the damage each way in it, from
// BotMatch.youStats), and as each round (and each match) starts the robot's
// numbers are set from its own and the edge. `duel`: duel.js's game;
// `bots`: the BotMatch. The adapter is kept for the whole session.
export function createAdaptiveWatch({ adapter = new BotAdapter() } = {}) {
 const bases = new WeakMap();
 let seen = null;
 const stats = bots => ({ dealt: bots.youStats?.dealt || 0, taken: bots.youStats?.taken || 0 });
 const look = (duel, bots) => ({ match: duel.matchId, round: duel.round, played: duel.score.played, you: duel.score.you, robot: duel.score.robot, ...stats(bots) });
 const tune = bot => { if (!bases.has(bot)) bases.set(bot, snapshot(bot.profile)); adapter.apply(bot.profile, bases.get(bot)); };
 return {
  adapter,
  get edge() { return adapter.edge; },
  frame(duel, bots) {
   const bot = duel?.active && duel.config?.mode === '1v1' ? duel.bot : null;
   if (!bot) { seen = null; return; }
   const now = look(duel, bots);
   // A new match (or a restart): the robot as the session has it so far.
   if (!seen || seen.match !== now.match || seen.bot !== bot || now.played < seen.played) { seen = { ...now, bot }; tune(bot); return; }
   if (now.played > seen.played) {
    const winner = now.you > seen.you ? 'you' : now.robot > seen.robot ? 'robot' : null;
    adapter.round(winner, Math.max(0, now.dealt - seen.dealt), Math.max(0, now.taken - seen.taken));
    Object.assign(seen, now);
   }
   // A new round: everyone is back; the new numbers take hold now.
   if (now.round !== seen.round) { seen.round = now.round; Object.assign(seen, stats(bots)); tune(bot); }
  },
 };
}
