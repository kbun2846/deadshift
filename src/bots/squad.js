// How a side's robots play together (owner, v0.9b): not a pack glued to one
// body. Each robot has a role that changes every so often, and each side has
// a plan that changes too.
//
// Roles (re-rolled every 18-40 s, per robot):
//  - escort: keeps near the side's player (only on a side with a player).
//  - support: goes to help a teammate who is in a fight (the `rally` point).
//  - roam: its own thing: patrols, hunts, investigates; still comes to a
//    fight close by.
// Plan (per side with two or more robots, every 15-40 s): usually 'split'
// (everyone free), sometimes 'group' (a tactic: the robots move as one, round
// a captain, until the plan changes).
//
// BotMatch (solo) and ArenaRobots (online) ask `leaderFor` who a robot should
// keep near (null: nobody) and `rally` where a teammate needs a hand. Plain
// data, no DOM or three.js.
export const ROLES = Object.freeze({ withPlayer: { escort: .3, support: .4, roam: .3 }, robotsOnly: { support: .5, roam: .5 } });
export const GROUP_CHANCE = .3;

const pick = (weights, r) => { let t = 0; for (const [k, w] of Object.entries(weights)) { t += w; if (r < t) return k; } return Object.keys(weights).at(-1); };

export class Squads {
 constructor(random = Math.random) { this.random = random; this.sides = new Map(); }

 // Once a tick. `bots`: [{ id, team, brain, alive }]; `humanTeams`: sides with a player.
 update(bots, time, humanTeams = new Set()) {
  for (const b of bots) {
   if (b.team === 'ffa') { b.brain.role = 'roam'; continue; }
   if (!b.brain.role || time >= (b.brain.roleUntil || 0)) {
    b.brain.role = pick(humanTeams.has(b.team) ? ROLES.withPlayer : ROLES.robotsOnly, this.random());
    b.brain.roleUntil = time + 18 + this.random() * 22;
   }
  }
  const teams = new Set(bots.filter(b => b.team !== 'ffa').map(b => b.team));
  for (const team of teams) {
   const living = bots.filter(b => b.team === team && b.alive);
   let side = this.sides.get(team);
   if (!side || time >= side.until || (side.captain && !living.some(b => b.id === side.captain))) {
    const group = living.length >= 2 && this.random() < GROUP_CHANCE;
    side = { plan: group ? 'group' : 'split', until: time + (group ? 15 : 20) + this.random() * (group ? 15 : 20), captain: group ? living[Math.floor(this.random() * living.length)].id : null };
    this.sides.set(team, side);
   }
  }
 }

 plan(team) { return this.sides.get(team)?.plan || 'split'; }

 // Who `bot` keeps near: 'human' (the side's player), a teammate's id (the
 // group's captain), or null.
 leaderFor(bot, humanHere = false) {
  const side = this.sides.get(bot.team);
  if (side?.plan === 'group' && side.captain && side.captain !== bot.id) return side.captain;
  if (bot.brain.role === 'escort' && humanHere) return 'human';
  return null;
 }

 // A teammate who needs a hand: the nearest one in a fight (hurt just now,
 // or firing), within `reach`. `friends`: [{ x, z, busy }].
 rally(bot, friends, reach = 45) {
  if (bot.brain.role === 'escort') return null;
  const p = bot.sim.player; let best = null, bestD = bot.brain.role === 'support' ? reach : 18;
  for (const f of friends) { if (!f.busy) continue; const d = Math.hypot(f.x - p.x, f.z - p.z); if (d < bestD) { bestD = d; best = f; } }
  return best ? { x: best.x, z: best.z } : null;
 }

 clear() { this.sides.clear(); }
}
