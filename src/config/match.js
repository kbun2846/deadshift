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
]);
export const modeById = id => MODES.find(m => m.id === id) || null;
// Every mode but practice keeps score (kills, clock, kill limit, respawn wait).
export const COUNTED = Object.freeze(MODES.filter(m => m.id !== 'practice').map(m => m.id));
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
export const SETTINGS = Object.freeze({
 // Spawns (owner, v0.9b): scattered, nobody within SPAWN_APART of anyone
 // else; or, in team modes, each side together in its own building (never
 // everyone together any more).
 spawnMode: { label: 'spawns', values: ['random', 'team'], names: ['scattered', 'with team'], default: 'random', modes: ['2v2', '2v2v2', '3v3'] },
 roundLength: { label: 'round length', values: [300, 600, 900], names: ['5 min', '10 min', '15 min'], default: 600, modes: COUNTED },
 // Team modes: the side's kills together.
 killLimit: { label: 'kill limit', values: [0, 10, 20, 30], names: ['none', '10', '20', '30'], default: 0, modes: COUNTED },
 health: { label: 'health', values: [250, 500, 750], names: ['250', '500', '750'], default: 500, modes: MODES.map(m => m.id) },
 respawn: { label: 'respawn wait', values: [8, 12, 16], names: ['8 s', '12 s', '16 s'], default: 12, modes: COUNTED },
 // Syphon: a kill gives the killer back half the health they had lost.
 syphon: { label: 'syphon', values: ['on', 'off'], names: ['on', 'off'], default: 'on', modes: COUNTED },
 // Friendly fire (owner): teammates can hurt each other, for half (arena FRIENDLY_SHARE).
 friendlyFire: { label: 'friendly fire', values: ['on', 'off'], names: ['on', 'off'], default: 'on', modes: ['2v2', '2v2v2', '3v3'] },
 // Robots (net/arena-robots.js): fill the empty seats a mode needs (FFA: up
 // to four), and how well they play. + ROBOT in the lobby adds one any time.
 robots: { label: 'robots', values: ['fill', 'off'], names: ['fill empty seats', 'none'], default: 'fill', modes: COUNTED },
 robotSkill: { label: 'robot skill', values: ['rookie', 'easy', 'normal', 'hard', 'expert', 'perfect'], names: ['rookie', 'easy', 'normal', 'hard', 'expert', 'perfect'], default: 'normal', modes: MODES.map(m => m.id) },
});
export const defaultSettings = () => Object.fromEntries(Object.entries(SETTINGS).map(([key, s]) => [key, s.default]));
// Untrusted input (a saved choice, a message): only listed values survive.
export function cleanSettings(input = {}) {
 const out = defaultSettings();
 for (const [key, s] of Object.entries(SETTINGS)) if (s.values.includes(input?.[key])) out[key] = input[key];
 return out;
}

// The weapon pick at the start of a round (and after CHANGE WEAPON): this long,
// then a random weapon if none was picked. The standings stay up this long
// after a round before everyone goes back to the lobby.
export const PICK = Object.freeze({ time: 10 });
export const RESULTS = 10;
