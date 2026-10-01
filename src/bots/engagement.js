// A robot's engagement loop (owner, 2026-09-30: "make bots a bit more dynamic.
// i was playing one who just kept chasing me without backing off or
// initiating"). RobotBrain.think asks `judge` about ten times a second what
// stage of a fight it is in, and plays that stage through its usual modes:
//
//   seek ──► approach ──► engage ◄──► press
//              ▲   │        │   ▲       │
//              │   └──┬─────┘   │       │
//              │      ▼         │       ▼
//              └── reset ◄── disengage ◄┘
//
//  seek       nobody to fight: patrol, hunt, investigate (as before).
//  approach   it knows where they are and is out of its band: closes on an
//             angle (not straight at them), flanks round cover.
//  engage     in its weapon's band: holds it, strafes with varied weaves and
//             jukes, peeks in and out. Holding too long it takes the
//             initiative (press) or goes round (reset), so no fight is a
//             standing chase.
//  press      it has the edge (their health low, they are reloading or just
//             spent their big ability, its own ability ready, more of its
//             side here, they are alone): commits, band pulled in, abilities
//             at once, melee dashes in.
//  disengage  low health and just hit, reloading or empty (Static: its orbs
//             spent on a volley, when it steps back out in sight while they
//             come back), losing the trades
//             (taking damage without dealing it), outnumbered, a chase that
//             is not closing, a cautious gun inside a shorter weapon's
//             threat: backs off to cover, still shooting.
//  reset      out of sight: a breather (reload), then comes back from a
//             different angle (a flank spot away from the old line).
//
// Every switch has hysteresis: a least stay in each state, randomized timers,
// press thresholds in and out apart, and a calm spell after a reset during
// which it does not back off again for anything but reloading or being hurt
// badly. How keen it is on each switch comes from its profile (robot-profile.js
// style, temper mood, skill `tech`), so two robots never fight alike:
// `persona()` names the leaning (aggressive, cautious, flanker, sniper,
// balanced). Easy robots press later, over-chase and back off late (the
// mistakes a person makes); hard ones read every switch.
//
// Plain numbers, no allocation per call: `judge` reads a situation the brain
// fills in place (RobotBrain.situation) and writes the state into `eng`.
import { RULES, SHOTGUN, ICHOR, SHEATH } from '../config/gameplay.js';

export const ENGAGE_STATES = Object.freeze(['seek', 'approach', 'engage', 'press', 'disengage', 'reset']);

// How close someone with each weapon has to be to hurt you badly with its main
// fire (not its occasional long ability): a gun robot kites a shorter weapon to
// just outside this (RobotBrain.tactic), and a cautious one backs off inside
// it. Ichor: its slash plus one dash; Sheath: its draw-cut's reach.
export const THREAT = Object.freeze({
 shotgun: SHOTGUN.range, ichor: ICHOR.range + RULES.dodgeDistance, sheath: SHEATH.xRange - SHEATH.xBackDist,
 static: RULES.sprayRange, omen: 13, sidekick: 16, rifle: 18, sightline: 22,
});
export const MELEE = new Set(['ichor', 'sheath']);

// The loop's timing (seconds) and weights. `trade`: the window (s) over which
// damage taken and dealt is remembered.
export const ENGAGE = Object.freeze({
 minStay: .5, trade: 3, chaseRate: .6, pressFor: [2.2, 4.2], disengageFor: [1.2, 2.8], hideFor: [.6, 1.6], resetFor: [3.5, 6],
 calmFor: [2.5, 5], initFor: [2.5, 6.5], farFor: .8, whimEvery: [2, 4], whim: .18,
});

// The leaning of a profile, from its continuous numbers (a blend or a mood
// lands between them).
export function persona(pf) {
 const a = pf.aggr ?? .5, fl = pf.flank ?? .3, r = pf.range ?? 1;
 return a > .72 ? 'aggressive' : fl > .65 ? 'flanker' : r > 1.18 ? 'sniper' : a < .3 ? 'cautious' : 'balanced';
}

// The thresholds its profile gives (read each judge: moods move them).
// pressAt: the edge it needs to press (higher = more patient; easy robots
// much higher); pressOut: below this it stops pressing (the gap is the
// hysteresis); trade: damage taken beyond damage dealt, over ENGAGE.trade s,
// before it backs off; chase: seconds of a chase that is not closing before it
// gives it up and goes round; init: how much longer it holds a band before
// taking the initiative.
export function thresholds(pf, out = {}) {
 const a = pf.aggr ?? .5, tech = pf.tech ?? .5;
 out.pressAt = .95 - a * .6 + (1 - tech) * .35; out.pressOut = out.pressAt - .45;
 out.trade = 16 + a * 26 + (1 - tech) * 18;
 out.chase = 2.2 + a * 2.2 + (1 - tech) * 2.5;
 out.init = (1.35 - a * .7) * (1.5 - tech * .5);
 out.flank = Math.max(pf.flank ?? .3, .55);
 return out;
}

export function newEngagement(random = Math.random) {
 return { state: 'seek', reason: null, since: 0, at: 0, until: 0, phase: null, best: Infinity, bestAt: 0, farSince: 0, calmUntil: 0, initAt: 0,
  th: {}, init: 1, hideUntil: 0, taken: 0, dealt: 0, whim: 0, whimAt: 0, side: random() < .5 ? -1 : 1, fromAngle: null, lastSeen: -99, coverEnded: -9, hurtCoverAt: -99,
  counts: { disengage: 0, press: 0, reset: 0, chase: 0 } };
}

// A situation (RobotBrain.situation fills one in place each think).
export function newSituation() {
 return { has: false, seen: false, fresh: false, d: 0, near: 0, far: 0, reach: 0, threat: 0, my: 1, their: 1, empty: false, openReload: false, ability: false,
  theirReload: false, theirSpent: false, reloadFrom: 0, recharging: false, foes: 0, mates: 0, isolated: false, hurt: 99, fall: false, inThreat: false, melee: false, leader: false };
}

const span = (r, [a, b]) => a + r() * (b - a);

function go(e, state, now, reason, random) {
 if (e.state === state) return state;
 const was = e.state, wasWhy = e.reason;
 // (Hurt cover again only `coverRest` after the last one ended: nobody heals,
 // so hiding only buys a moment.)
 if ((was === 'disengage' || was === 'reset') && wasWhy === 'hurt' && state !== 'disengage' && state !== 'reset') e.hurtCoverAt = now;
 e.state = state; e.since = now; e.reason = reason || null; e.farSince = 0;
 if (state === 'press') { e.until = now + span(random, ENGAGE.pressFor); e.counts.press++; }
 else if (state === 'disengage') { e.until = now + span(random, ENGAGE.disengageFor); e.counts.disengage++; if (reason === 'chase') e.counts.chase++; }
 // (Going round from a held band needs no breather: straight to the flank.)
 else if (state === 'reset') { e.until = now + span(random, ENGAGE.resetFor); e.phase = reason === 'reposition' ? 'flank' : 'hide'; e.hideUntil = now + span(random, ENGAGE.hideFor); e.counts.reset++; }
 // (A chase is measured from the moment it starts: press keeps its own
 // "not closing" clock, which must not carry an old approach's over. Review
 // 2026-09-30: a press out of a disengage or reset turned straight back into a
 // disengage (chase) on its first judge, 60% of the quick flips seen in FFA.)
 if (state === 'approach' || state === 'press') { e.best = Infinity; e.bestAt = now; }
 if (state === 'engage') e.initAt = now + span(random, ENGAGE.initFor) * e.init;
 // Out of a reset or a backing-off, a calm spell (no backing off again for
 // anything but reloading or bad hurt), so it does not flicker.
 if ((was === 'reset' || was === 'disengage') && state !== 'reset' && state !== 'disengage') e.calmUntil = now + span(random, ENGAGE.calmFor);
 if (state !== 'reset') e.phase = null;
 return state;
}

// Why it would back off now, or null. `severe` only: reloading, hurt badly.
function danger(e, s, pf, now, severe) {
 // (A blade within a dash of them is committed: turning away there only
 // gives them its back. It fights it out.)
 if (s.melee && s.seen && s.d < 4.5 && s.foes < 2) return null;
 // (Reloading out of their reach, it reloads where it is, still weaving.)
 if (s.empty && s.fresh && !s.openReload && s.d < (s.reloadFrom || Math.max(s.threat, 6) + 4) && now - e.coverEnded > 1.5) return 'reload';
 // (Static after a volley: steps back out while its orbs come back, in sight.)
 if (s.recharging && s.seen && s.d < s.far + 1) return 'recharge';
 if (s.hurt < 2.5 && (s.my < (pf.hurtAt ?? .3) || (s.foes >= 2 && s.my < (pf.hurtAt ?? .3) + .25)) && now - e.hurtCoverAt > (pf.coverRest ?? 5)) return 'hurt';
 if (severe || now < e.calmUntil || s.leader) return null;
 const a = pf.aggr ?? .5, tech = pf.tech ?? .5;
 if (s.fall && s.fresh && s.my < .75) return 'losing';
 // (A blade closing in takes hits before it deals any: only a trade lost
 // from out of its dashes' reach counts.)
 if (tech > .25 && e.taken - e.dealt > e.th.trade && s.my < .85 && !(s.melee && s.d < 9)) return 'trade';
 if (s.foes >= 2 && s.mates === 0 && s.my < .45 + (1 - a) * .25) return 'outnumbered';
 if (s.inThreat && s.seen && a < .45 && tech > .4) return 'threat';
 return null;
}

// How much it has the edge (0 even; +1 a clear edge).
export function advantage(e, s) {
 return (s.my - s.their) * 1.2 + (s.their < .35 ? .45 : 0) + (s.theirReload && s.seen ? .7 : 0) + (s.theirSpent && s.seen ? .3 : 0)
  + (s.ability ? .2 : 0) + (s.empty ? -.8 : 0) + Math.min(2, s.mates) * .2 - Math.max(0, s.foes - 1) * .4 + (s.isolated ? .15 : 0) + e.whim;
}

// A chase judged by how fast it closes (review 2026-09-30): over each window
// of `th.chase` s (the profile's patience; easy robots longer) the gap must
// shrink at `ENGAGE.chaseRate` m/s or more, or the chase is given up. (It was
// .75 m of progress per window: a chase gaining a few centimetres a second on
// someone backing off went on for ever.) `best`/`bestAt`: the gap at the
// window's start and when it started (Infinity: none yet, or not in sight).
function chaseStalled(e, s, th, now) {
 if (!s.fresh || e.best === Infinity) { e.best = s.fresh ? s.d : Infinity; e.bestAt = now; return false; }
 const took = now - e.bestAt; if (took < th.chase) return false;
 const rate = (e.best - s.d) / took; e.best = s.d; e.bestAt = now;
 return rate < ENGAGE.chaseRate;
}

// One decision: the state for now (also in e.state), from the situation `s`
// and the profile `pf`. `now`: the brain's clock.
export function judge(e, s, pf, now, random = Math.random) {
 const dt = Math.min(.5, Math.max(0, now - e.at)); e.at = now;
 const k = Math.exp(-dt / ENGAGE.trade); e.taken *= k; e.dealt *= k;
 const th = thresholds(pf, e.th); e.init = th.init;
 if (now >= e.whimAt) { e.whim = (random() * 2 - 1) * ENGAGE.whim; e.whimAt = now + span(random, ENGAGE.whimEvery); }
 if (s.seen) e.lastSeen = now;
 if (!s.has) return go(e, 'seek', now, null, random);
 const stay = now - e.since, adv = advantage(e, s);
 let why;
 switch (e.state) {
  case 'seek':
   return go(e, s.seen && s.d <= s.far ? 'engage' : 'approach', now, null, random);
  case 'approach':
   if ((why = danger(e, s, pf, now, false))) return go(e, 'disengage', now, why, random);
   if (s.seen && adv >= th.pressAt && stay > ENGAGE.minStay) return go(e, 'press', now, 'edge', random);
   if (s.seen && s.d <= s.far) return go(e, 'engage', now, null, random);
   // A chase that is not closing (while it can see them: out of sight the
   // hunt has its own give-up, RobotBrain.watchGoal): give it up, go round.
   if (chaseStalled(e, s, th, now) && !s.leader) return go(e, 'disengage', now, 'chase', random);
   return e.state;
  case 'engage':
   if ((why = danger(e, s, pf, now, false))) return go(e, 'disengage', now, why, random);
   if (stay > ENGAGE.minStay && s.seen && adv >= th.pressAt) return go(e, 'press', now, 'edge', random);
   if (s.d > s.far * 1.3 + 1) { e.farSince ||= now; if (now - e.farSince > ENGAGE.farFor) return go(e, 'approach', now, null, random); } else e.farSince = 0;
   // Held its band long enough: take the initiative, or go round. (An easy
   // robot now and then presses at a bad moment.)
   if (now >= e.initAt && !s.leader) {
    if (adv >= th.pressAt - .55 || random() < (1 - (pf.tech ?? .5)) * .4) return go(e, 'press', now, 'initiative', random);
    return go(e, 'reset', now, 'reposition', random);
   }
   return e.state;
  case 'press':
   if ((why = danger(e, s, pf, now, true))) return go(e, 'disengage', now, why, random);
   if (s.d <= s.far) { e.best = s.d; e.bestAt = now; }
   else if (chaseStalled(e, s, th, now) && !s.leader) return go(e, 'disengage', now, 'chase', random);
   if (now > e.until || (stay > 1.2 && adv < th.pressOut)) return go(e, s.d > s.far * 1.3 + 1 ? 'approach' : 'engage', now, null, random);
   return e.state;
  case 'disengage':
   // (Not while still empty or waiting for its orbs: it would only back off again.)
   if (s.seen && stay > .8 && adv >= th.pressAt + .3 && e.reason !== 'hurt' && e.reason !== 'reload' && !s.empty && !s.recharging) return go(e, 'press', now, 'counter', random);
   // Backed off to reload, loaded again and still in sight: straight back in.
   if ((e.reason === 'reload' || e.reason === 'recharge') && !s.empty && !s.recharging && s.seen && stay > .5) return go(e, s.d > s.far * 1.15 ? 'approach' : 'engage', now, null, random);
   if ((!s.seen && now - e.lastSeen > .4 && stay > .6) || (s.d > Math.max(s.threat * 1.5, s.far * 1.4) && stay > 1) || now > e.until) return go(e, 'reset', now, e.reason, random);
   return e.state;
  case 'reset':
   if (e.phase === 'hide' && now >= e.hideUntil && !(s.empty && stay < 6)) e.phase = 'flank';
   if (s.seen && stay > .8 && !s.empty && !s.recharging) {
    if (adv >= th.pressAt) return go(e, 'press', now, 'edge', random);
    if (s.d <= s.far * 1.15) return go(e, 'engage', now, null, random);
    // Round the side and they are in sight: in from here.
    if (e.phase === 'flank' && stay > 1.5) return go(e, 'approach', now, null, random);
   }
   if (now > e.until) return go(e, 'approach', now, null, random);
   return e.state;
 }
 return e.state;
}
