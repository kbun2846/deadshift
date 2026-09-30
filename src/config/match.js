// Multiplayer rounds: the modes the host can pick in the lobby, the host's
// settings, and the pick and results timings. Read by the match rules
// (net/arena.js) and by the lobby screens. Units: seconds, hit points, kills.

// The modes the host can start (all `ready` since v0.9b). `teams`: how many
// sides (0: everyone for themselves), `per`: players a side, `size`: seats a
// round needs (null: any number). `fillTo`: with robots on "fill", robots
// take the empty seats up to this many (null: none). FFA fills to four;
// practice never fills (the host adds robots with + ROBOT).
export const MODES = Object.freeze([
 { id: 'ffa', name: 'FFA', ready: true, teams: 0, size: null, fillTo: 4 },
 { id: 'practice', name: 'PRACTICE', ready: true, teams: 0, size: null, fillTo: null },
 { id: '1v1', name: '1V1', ready: true, teams: 0, size: 2, fillTo: 2 },
 { id: '2v2', name: '2V2', ready: true, teams: 2, per: 2, size: 4, fillTo: 4 },
 { id: '2v2v2', name: '2V2V2', ready: true, teams: 3, per: 2, size: 6, fillTo: 6 },
 { id: '3v3', name: '3V3', ready: true, teams: 2, per: 3, size: 6, fillTo: 6 },
 // 4V4 (owner, 2026-09-29): two teams of four, the same rules as the other team modes.
 { id: '4v4', name: '4V4', ready: true, teams: 2, per: 4, size: 8, fillTo: 8 },
]);
// The most seats a room holds (4V4's eight; NETWORK.maxPlayers matches).
export const MAX_SEATS = 8;
export const modeById = id => MODES.find(m => m.id === id) || null;
// Every mode but practice keeps score (kills, clock, kill limit, respawn wait).
export const COUNTED = Object.freeze(MODES.filter(m => m.id !== 'practice').map(m => m.id));
// Played in rounds (elimination: a side out, the other scores, everyone back):
// every counted mode but FFA.
export const ROUNDED = Object.freeze(COUNTED.filter(id => id !== 'ffa'));
// The sides, in order (2V2 and 3V3 use the first two). Owner, v138: not plain
// red and blue but three short, loud, contrasting colours. The ids stay
// red/blue/gold (protocol, URLs); only the names and looks changed. Each
// side's colour is on its players' hats, scarves and base rings in the world
// (`hat`/`band`/`ring`), and on the lobby, scoreboard and results.
export const TEAMS = Object.freeze([
 { id: 'red', name: 'AMBER', colour: '#ffb020', hat: '#f29a12', band: '#7a4806', ring: '#ffc043' },
 { id: 'blue', name: 'CYAN', colour: '#2ee6ff', hat: '#14c4e0', band: '#075a68', ring: '#5cf0ff' },
 { id: 'gold', name: 'VIOLET', colour: '#b77bff', hat: '#9150ea', band: '#40207a', ring: '#c9a0ff' },
]);
export const teamById = id => TEAMS.find(t => t.id === id) || null;
// A side's look in the world, by team id. `friend`/`foe` stay as the solo
// sides (your team is blue: cyan; the enemies red: amber).
export const SIDE_COLOURS = Object.freeze(Object.fromEntries([
 ...TEAMS.map(t => [t.id, Object.freeze({ hat: t.hat, band: t.band, ring: t.ring })]),
 ['friend', Object.freeze({ hat: TEAMS[1].hat, band: TEAMS[1].band, ring: TEAMS[1].ring })],
 ['foe', Object.freeze({ hat: TEAMS[0].hat, band: TEAMS[0].band, ring: TEAMS[0].ring })],
]));
// Scattered spawns: nobody within about one screen's width of anyone else (m).
export const SPAWN_APART = 26;

// The host's settings: each a short list of values. `modes`: the modes the
// setting changes anything in (the lobby dims it for the others).
//
// Competitive menus (owner, 2026-09-29: "get rid of all the options involved
// in making games start and move most to dev tools"): only the rows without
// `dev` show on the host page and in the lobby: ROUNDS (3, 5, 10, ∞) in the
// round modes and the MATCH LENGTH (5 or 10 min) in FFA. Every `dev` row is
// fixed at its default and shows only once the developer tools are unlocked
// (body.dev-unlocked, lobby-settings.js), in a group of its own.
export const SETTINGS = Object.freeze({
 // Rounds (owner, 2026-09-29: "3 rounds, whoever has most wins"): that many
 // rounds are played and the most round wins takes the match; it ends as
 // soon as nobody can catch up, and a tie after the last one plays on, a
 // round at a time, until someone leads (roundsDecided). 0: endless (∞).
 rounds: { label: 'rounds', values: [3, 5, 10, 0], names: ['3', '5', '10', '∞'], default: 5, modes: ROUNDED },
 // FFA only (owner: "when the game timer ends the match should end. The host
 // can select this as either 5 mins or 10 mins"); most kills wins.
 roundLength: { label: 'match length', values: [300, 600], names: ['5 MIN', '10 MIN'], default: 600, modes: ['ffa'] },
 // Spawns (owner, v0.9b): scattered, nobody within SPAWN_APART of anyone
 // else; or, in team modes, each side together in its own building (never
 // everyone together any more).
 spawnMode: { label: 'spawns', values: ['random', 'team'], names: ['scattered', 'with team'], default: 'random', modes: ['2v2', '2v2v2', '3v3', '4v4'], dev: true },
 // FFA: a kill limit on top of the clock (none by default: the clock ends it).
 killLimit: { label: 'kill limit', values: [0, 10, 20, 30], names: ['none', '10', '20', '30'], default: 0, modes: ['ffa'], dev: true },
 health: { label: 'health', values: [50, 100, 150], names: ['50', '100', '150'], default: 100, modes: MODES.map(m => m.id), dev: true },
 // (FFA only: in the other modes everyone comes back together, arena.js.)
 // FFA respawns as quickly as a 1V1 round turns over (owner, 2026-09-29:
 // "ffa should have same respawn system"): 6 s by default.
 respawn: { label: 'respawn wait', values: [6, 8, 12, 16], names: ['6 S', '8 S', '12 S', '16 S'], default: 6, modes: ['ffa'], dev: true },
 // The storm (storm.js; owner, 2026-09-29: on in every mode but practice and
 // 1V1, "no option to turn it off besides dev menu").
 storm: { label: 'storm', values: ['on', 'off'], names: ['on', 'off'], default: 'on', modes: ['ffa', '2v2', '2v2v2', '3v3', '4v4'], dev: true },
 // Syphon: a kill gives the killer health back (syphonAmount).
 syphon: { label: 'syphon', values: ['on', 'off'], names: ['on', 'off'], default: 'on', modes: COUNTED, dev: true },
 // (No friendly fire, owner 2026-09-29: "make friendly fire not count anymore
 // at all": teammates never hurt each other; the setting is gone.)
 // Robots (net/arena-robots.js): fill the empty seats a mode needs (FFA: up
 // to four), and how well they play. + ROBOT in the lobby adds one any time.
 // Shown as one ROBOTS box (v147); unticked, no robots and no robot settings.
 // (Owner, 2026-09-30: "robots have a on and off switch for filling up
 // server": a plain row for the host, ROBOTS FILL SEATS  ON | OFF. The
 // listed rooms on the game server always fill: server/room.js.)
 robots: { label: 'robots fill seats', values: ['fill', 'off'], names: ['ON', 'OFF'], default: 'fill', modes: COUNTED },
 robotSkill: { label: 'robot difficulty', values: ['easy', 'normal', 'hard'], names: ['easy', 'normal', 'hard'], default: 'normal', modes: MODES.map(m => m.id), dev: true },
});
// The rows everyone sees (the rest are the developer tools').
export const PLAIN_SETTINGS = Object.freeze(Object.keys(SETTINGS).filter(key => !SETTINGS[key].dev));

// Whether a match of `total` rounds (0: endless) is over, with each side's
// round wins in `wins` after `played` rounds (a draw round counts as played).
// Over once the leader is ahead by more than the rounds left, or, every round
// played, as soon as one side leads (a tie plays on: sudden death).
export function roundsDecided(wins, played, total) {
 if (!total) return false;
 const sorted = [...wins].sort((a, b) => b - a), lead = sorted[0] || 0, next = sorted[1] || 0;
 if (lead <= next) return false;
 return lead - next > total - played || played >= total;
}
export const defaultSettings = () => Object.fromEntries(Object.entries(SETTINGS).map(([key, s]) => [key, s.default]));
// Untrusted input (a saved choice, a message): only listed values survive.
export function cleanSettings(input = {}) {
 const out = defaultSettings();
 for (const [key, s] of Object.entries(SETTINGS)) if (s.values.includes(input?.[key])) out[key] = input[key];
 return out;
}

// The weapon pick at the start of a round (and after CHANGE WEAPON): this long,
// then a random weapon if none was picked. (RESULTS, the old fixed time the
// standings stayed up, is kept for older callers: the end-of-match card now
// waits for everyone READY, or arena.js READY_WAIT.)
export const PICK = Object.freeze({ time: 10 });
export const RESULTS = 10;

// Syphon (owner, 2026-09-29: FFA "should have siphon, it should have 50
// siphon off each kill ... other gamemodes with siphon should do 25"): the
// health a kill gives its killer, up to their full health. FFA online and
// SOLO; the other modes online (the host's `syphon` setting).
export const SYPHON = Object.freeze({ ffa: 50, other: 25 });
export function syphonAmount(mode, hp, maxHp, step = .2) {
 const room = Math.max(0, maxHp - hp), give = Math.min(mode === 'ffa' ? SYPHON.ffa : SYPHON.other, room);
 return Math.floor(give / step + 1e-9) * step;
}
