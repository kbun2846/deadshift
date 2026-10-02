// Gun Game's rules, shared by the online match (net/arena.js) and BOTS
// (duel.js). Pure: no DOM, no network. The order and the switches are
// config/match.js GUNGAME (with the owner's words).
//
// A player's place on the ladder is a level, 0 for the first weapon. A kill
// moves the killer up one level (their weapon is swapped in place at once,
// Simulation.swapWeapon); a kill made with the last weapon wins the match. A
// kill with a blade (GUNGAME.melee) also knocks the victim down one level.
//
// "Made with the last weapon": the weapon in hand when the killer's tick
// began (`held`). A swap clears everything the old weapon had in the air, so
// whatever hurts anyone after it came from the new one; but two kills landing
// on the same tick were both made with the weapon that tick started with,
// so the second one can't count as a kill with the weapon the first one just
// handed over.
import { GUNGAME } from './config/match.js';
import { WEAPONS } from './items.js';
import { underMaintenance } from './weapon-maintenance.js';

export const isMelee = id => GUNGAME.melee.includes(id);

// Every weapon in the game in ladder order: GUNGAME.ladder, any weapon it
// does not name slotted in just before the blades at the end (so a new
// weapon is never left out), and nothing under maintenance (nobody may hold
// it). Fixed for a match when it starts (the arena keeps its copy and sends
// it to every screen).
export function gunLadder({ order = GUNGAME.ladder, weapons = WEAPONS.map(w => w.id), playable = id => !underMaintenance(id) } = {}) {
 const known = order.filter(id => weapons.includes(id));
 const extra = weapons.filter(id => !known.includes(id));
 let at = known.length; while (at > 0 && isMelee(known[at - 1])) at--;
 const all = [...known.slice(0, at), ...extra.filter(id => !isMelee(id)), ...known.slice(at), ...extra.filter(isMelee)];
 const list = all.filter(playable);
 return list.length ? list : all.slice(0, 1);
}

// The weapon for a level (clamped to the ladder).
export const ladderWeapon = (ladder, level) => ladder[Math.max(0, Math.min(ladder.length - 1, level | 0))];

// A kill by someone on `level` whose tick began with `held` in hand:
// { level (their new one), won (the match is theirs), moved (a new weapon) }.
export function afterKill(ladder, level, held) {
 const last = ladder.length - 1;
 if (level >= last) return { level: last, won: held === ladder[last], moved: false };
 return { level: level + 1, won: false, moved: true };
}

// The victim's level after a death: one down for a blade kill (`killerHeld`
// a melee weapon, GUNGAME.meleeDemotes), else unchanged. A death with nobody
// to credit (the storm, your own blast) costs nothing.
export function afterDeath(level, killerHeld, { demotes = GUNGAME.meleeDemotes } = {}) {
 return demotes && killerHeld && isMelee(killerHeld) ? Math.max(0, level - 1) : level;
}

// Standings: whoever finished the ladder (a row's `finished`, or the id
// `finished`), then the furthest along, then most kills, fewest deaths, name.
// Rows carry `gun` (their level), `kills`, `deaths`, `name`.
export function gunStandings(rows, finished = null) {
 const done = r => (r.finished || (finished != null && r.id === finished) ? 1 : 0);
 return [...rows].sort((a, b) => done(b) - done(a) || (b.gun || 0) - (a.gun || 0) || (b.kills || 0) - (a.kills || 0)
  || (a.deaths || 0) - (b.deaths || 0) || String(a.name ?? '').toLowerCase().localeCompare(String(b.name ?? '').toLowerCase()));
}

// "4/8": a level as the HUD and the scoreboard show it (one-based).
export const ladderText = (level, size) => `${Math.min(size, (level | 0) + 1)}/${size}`;
