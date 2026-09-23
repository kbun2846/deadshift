// Multiplayer rounds: the modes the host can pick in the lobby, the host's
// settings, and the pick and results timings. Read by the match rules
// (net/arena.js) and by the lobby screens. Units: seconds, hit points, kills.

// Only `ready` modes can be started; the others are listed for what is coming.
export const MODES = Object.freeze([
 { id: 'ffa', name: 'FFA', ready: true },
 { id: 'practice', name: 'PRACTICE', ready: true },
 { id: '1v1', name: '1V1', ready: false },
 { id: '2v2', name: '2V2', ready: false },
 { id: '3v3', name: '3V3', ready: false },
]);

// The host's settings: each a short list of values. `modes`: the modes the
// setting changes anything in (the lobby dims it for the others).
export const SETTINGS = Object.freeze({
 spawnMode: { label: 'spawns', values: ['random', 'together'], names: ['random', 'together'], default: 'random', modes: ['ffa', 'practice'] },
 roundLength: { label: 'round length', values: [300, 600, 900], names: ['5 min', '10 min', '15 min'], default: 600, modes: ['ffa'] },
 killLimit: { label: 'kill limit', values: [0, 10, 20, 30], names: ['none', '10', '20', '30'], default: 0, modes: ['ffa'] },
 health: { label: 'health', values: [250, 500, 750], names: ['250', '500', '750'], default: 500, modes: ['ffa', 'practice'] },
 respawn: { label: 'respawn wait', values: [3, 5, 8], names: ['3 s', '5 s', '8 s'], default: 5, modes: ['ffa'] },
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
