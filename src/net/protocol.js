// What travels between players, and the rules for trusting it.
//
// Clients send inputs (what they pressed), never results (where they are,
// what they hit). The host runs the simulation for everyone and sends back
// snapshots of the world. So a modified client can only lie about which keys
// it pressed, which it could do anyway by pressing them.
//
// Messages are plain JSON objects with a `t` (type) field:
//   hello     client -> host   { t, version, name }
//   welcome   host -> client   { t, id, tick, map, players }
//   full      host -> client   { t, reason }            (room full / wrong version)
//   input     client -> host   { t, inputs: [ {seq, moveX, moveZ, aimX, aimZ, smoothAim, dodge}, ... ] }
//   snapshot  host -> all      { t, tick, players: [ playerState, ... ] }
//   leave     host -> all      { t, id }
//   removed   host -> client   { t, reason }            (the host took this player out)
export const PROTOCOL_VERSION = 1;

// The inputs online play accepts for now: moving, turning and dodging.
// Weapons join once hits and damage are run by the host (see AGENTS.md).
export function movementInput(input = {}) {
 const n = v => (Number.isFinite(v) ? v : 0);
 let moveX = n(input.moveX), moveZ = n(input.moveZ);
 const length = Math.hypot(moveX, moveZ);
 if (length > 1) { moveX /= length; moveZ /= length; }
 let aimX = n(input.aimX), aimZ = n(input.aimZ);
 const aim = Math.hypot(aimX, aimZ);
 if (aim > 1e-6) { aimX /= aim; aimZ /= aim; } else { aimX = 0; aimZ = 0; }
 return { moveX, moveZ, aimX, aimZ, smoothAim: !!input.smoothAim, dodge: !!input.dodge };
}

// Everything the others need to draw a player, and everything the owning
// client needs to re-run its own prediction from the host's answer.
const round = (v, places = 3) => Math.round(v * 10 ** places) / 10 ** places;
export function playerState(id, p, lastSeq = 0) {
 return {
  id, lastSeq,
  x: round(p.x), z: round(p.z), vx: round(p.vx), vz: round(p.vz),
  aimX: round(p.aimX, 4), aimZ: round(p.aimZ, 4), aimSpin: round(p.aimSpin || 0, 4),
  dodgeRemaining: round(p.dodgeRemaining, 4), dodgeX: round(p.dodgeX, 4), dodgeZ: round(p.dodgeZ, 4),
  stamina: round(p.stamina, 4), staminaWait: round(p.staminaWait, 4),
  blastVX: round(p.blastVX), blastVZ: round(p.blastVZ),
 };
}

// Copies a snapshot entry back onto a simulation's player.
export function applyPlayerState(p, s) {
 for (const key of ['x', 'z', 'vx', 'vz', 'aimX', 'aimZ', 'aimSpin', 'dodgeRemaining', 'dodgeX', 'dodgeZ', 'stamina', 'staminaWait', 'blastVX', 'blastVZ'])
  if (Number.isFinite(s[key])) p[key] = s[key];
}

// Messages from the other side are untrusted: anything malformed is dropped.
export function readMessage(data) {
 if (!data || typeof data !== 'object' || typeof data.t !== 'string') return null;
 if (data.t === 'input') {
  if (!Array.isArray(data.inputs)) return null;
  const inputs = data.inputs.slice(0, 16).filter(i => i && Number.isInteger(i.seq) && i.seq > 0)
   .map(i => ({ seq: i.seq, ...movementInput(i) }));
  return { t: 'input', inputs };
 }
 if (data.t === 'snapshot') {
  if (!Number.isInteger(data.tick) || !Array.isArray(data.players)) return null;
  return { t: 'snapshot', tick: data.tick, players: data.players.filter(p => p && typeof p.id === 'string' && Number.isFinite(p.x) && Number.isFinite(p.z)) };
 }
 return data;
}
