// Kill streaks and shutdowns (owner, 2026-10-01, approved from the feel list:
// "kill streak callouts at 3, 5 and 8 kills and a 'shutdown' when you end
// someone's streak"). A streak is the kills since your last death; any death
// ends it (to someone, the storm, your own blast). Pure, shared by the online
// arena (net/arena.js: the host counts, every kill-feed line carries the
// killer's streak and the streak its victims lost) and the feel layer
// offline (feel/feel-layer.js, from BotMatch's death log).

// The callouts: the streak reached, the word on the banner.
export const STREAK_CALLOUTS = Object.freeze({ 3: 'spree', 5: 'rampage', 8: 'unstoppable' });
// Ending a streak this long or longer is a shutdown.
export const SHUTDOWN_FROM = 3;

export const streakCallout = n => STREAK_CALLOUTS[n] || null;
export const isShutdown = ended => ended >= SHUTDOWN_FROM;

export function createStreaks() {
 const counts = new Map();
 return {
  // A kill by `id`: its streak now.
  kill(id) { const n = (counts.get(id) || 0) + 1; counts.set(id, n); return n; },
  // `id` died: the streak it had (now over).
  died(id) { const n = counts.get(id) || 0; counts.delete(id); return n; },
  count(id) { return counts.get(id) || 0; },
  reset() { counts.clear(); },
 };
}

// One death into the tracker -> what it means: { streak (the killer's, 0
// with no killer), ended (what the victim lost) }.
export function recordDeath(streaks, victim, killer) {
 const ended = streaks.died(victim);
 const streak = killer != null && killer !== victim ? streaks.kill(killer) : 0;
 return { streak, ended };
}

// What a kill-feed line (or an offline death) announces, as a list of
// { kind: 'streak' | 'shutdown', killer, killerName, victim, victimName, n, word, mine }.
// `line`: { killer, killerName, victims, victimNames, streak, ended, endedBy }
// where `ended` is the longest streak among the victims and `endedBy` (its
// victim's id). `myId`: whose screen this is (`mine`: the killer is you).
export function streakNews(line, myId) {
 const out = [];
 if (!line || line.killer == null) return out;
 const mine = line.killer === myId;
 if (isShutdown(line.ended || 0)) {
  const i = Math.max(0, (line.victims || []).indexOf(line.endedBy));
  out.push({ kind: 'shutdown', killer: line.killer, killerName: line.killerName, victim: line.endedBy ?? line.victims?.[0], victimName: line.victimNames?.[i] ?? '?', n: line.ended, word: 'shutdown', mine });
 }
 // (A line of several kills can step over a callout: 2 -> 4 passes 3.)
 const before = (line.streak || 0) - (line.victims?.length || 1);
 for (let n = line.streak || 0; n > before && n > 0; n--) {
  const word = streakCallout(n);
  if (word) { out.push({ kind: 'streak', killer: line.killer, killerName: line.killerName, n, word, mine }); break; }
 }
 return out;
}
