// What travels between players, and the rules for trusting it.
//
// Clients send inputs (what they pressed), never results (where they are,
// what they hit). The host runs the simulation for everyone and sends back
// snapshots of the world. So a modified client can only lie about which keys
// it pressed, which it could do anyway by pressing them.
//
// Messages are plain JSON objects with a `t` (type) field:
//   hello     client -> host   { t, version, name }
//   welcome   host -> client   { t, id, slot, name, tick, map, mapHash, players }
//   full      host -> client   { t, reason }            (full / wrong version)
//   removed   host -> client   { t, reason }            (the host took this player out)
//   input     client -> host   { t, inputs: [ {seq, ...playerInput}, ... ], ack, aspect? }
//             (aspect: the joiner's screen, width / height, for the robots' off-screen rule)
//   choose    client -> host   { t, weapon, go }        (weapon picked; go: into the world now)
//   pick      client -> host   { t }                    (dead: pick a weapon again)
//   respawn   client -> host   { t }                    (practice: back in now)
//   snapshot  host -> client   { t, tick, players, you, proj, ev, feed, board? }
//   leave     host -> all      { t, id }
//   ping      host -> client   { t, s }                 (the host's clock; answered at once)
//   pong      client -> host   { t, s }                 (the same s back: the round trip)
// Snapshots also carry `match` (clock / results) and, now and then, `lobby`
// (players with their round trip, the host's spawn setting).
// The channel may drop or reorder packets. Inputs repeat the last few, and
// events are numbered and resent until the client acknowledges them, so
// shots, deaths and kill-feed lines are never lost.
import { weaponOrDefault } from '../items.js';
// 10: hills (terrain maps: slopes, retaining walls, rounds ending in the
// ground with `stop` in snapshots, grenade heights above the ground, the map
// fingerprint in welcome).
// 11: streams are waded (slower in water, with and against the current) and
// a body can wade in under a deck (`below` in player states).
export const PROTOCOL_VERSION = 11;

const n = v => (Number.isFinite(v) ? v : 0);
const point = v => (Number.isFinite(v) && Math.abs(v) < 1000 ? v : undefined);

// The movement part of an input: all a joiner's own sim predicts.
export function movementInput(input = {}) {
 let moveX = n(input.moveX), moveZ = n(input.moveZ);
 const length = Math.hypot(moveX, moveZ);
 if (length > 1) { moveX /= length; moveZ /= length; }
 let aimX = n(input.aimX), aimZ = n(input.aimZ);
 const aim = Math.hypot(aimX, aimZ);
 if (aim > 1e-6) { aimX /= aim; aimZ /= aim; } else { aimX = 0; aimZ = 0; }
 return { moveX, moveZ, aimX, aimZ, smoothAim: !!input.smoothAim, dodge: !!input.dodge, aiming: !!input.aiming };
}

// Every button a player can press, cleaned: booleans stay booleans, points
// stay finite and on the map. Nothing else gets through.
const PRESSES = ['grenade', 'surge', 'fire', 'tapFire', 'scatter', 'doubleShot', 'reload', 'spray', 'hex', 'seed', 'launch', 'quickShot'];
export function playerInput(input = {}) {
 const clean = movementInput(input);
 for (const key of PRESSES) clean[key] = !!input[key];
 for (const key of ['aimPointX', 'aimPointZ', 'launchPointX', 'launchPointZ']) clean[key] = point(input[key]);
 clean.autoRange = input.autoRange === 'touch' || input.autoRange === 'keyboard' ? input.autoRange : false;
 return clean;
}

// Usernames: short, printable, trimmed.
export function cleanName(text) {
 const name = String(text ?? '').replace(/[^\p{L}\p{N} _.\-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 16);
 return name || null;
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
  hp: round(p.hp, 1), maxHp: p.maxHp,
  // (Hills: wading under a deck. Only sent when so.)
  ...(p.below ? { below: 1 } : {}),
 };
}

// Copies a snapshot entry back onto a simulation's player.
export function applyPlayerState(p, s) {
 for (const key of ['x', 'z', 'vx', 'vz', 'aimX', 'aimZ', 'aimSpin', 'dodgeRemaining', 'dodgeX', 'dodgeZ', 'stamina', 'staminaWait', 'blastVX', 'blastVZ'])
  if (Number.isFinite(s[key])) p[key] = s[key];
 if (s.below) p.below = true; else if (p.below) p.below = false;
}

// Your own weapon state, from the host: what the HUD shows (ammo, reloads,
// charges, cooldowns). A joiner's sim never fires, so it learns these here.
export function loadout(sim) {
 const flat = o => Object.fromEntries(Object.entries(o).filter(([, v]) => typeof v !== 'object'));
 return { ammo: sim.ammo, rechargeProgress: round(sim.rechargeProgress, 3), rechargeWait: round(sim.rechargeWait, 3), hexCooldown: round(sim.hexCooldown, 2),
  grenadeCooldown: round(sim.grenadeCooldown, 2), rifle: flat(sim.rifle), shotgun: flat(sim.shotgun), spraying: !!sim.spray.active,
  surge: sim.surge ? { phase: sim.surge.phase, t: round(sim.surge.t, 3), cooldown: round(sim.surge.cooldown, 2), active: !!sim.surge.active } : undefined,
  scatter: sim.scatter ? { armed: !!sim.scatter.armed, armedFor: round(sim.scatter.armedFor || 0, 2), cooldown: round(sim.scatter.cooldown, 2) } : undefined };
}
export function applyLoadout(sim, l) {
 if (!l) return;
 for (const key of ['ammo', 'rechargeProgress', 'rechargeWait', 'hexCooldown', 'grenadeCooldown']) if (Number.isFinite(l[key])) sim[key] = l[key];
 if (l.rifle) Object.assign(sim.rifle, l.rifle);
 if (l.shotgun) Object.assign(sim.shotgun, l.shotgun);
 sim.spray.active = !!l.spraying;
 if (l.surge && sim.surge && ['idle', 'charging', 'active'].includes(l.surge.phase)) Object.assign(sim.surge, { phase: l.surge.phase, t: +l.surge.t || 0, cooldown: +l.surge.cooldown || 0, active: !!l.surge.active });
 if (l.scatter && sim.scatter) { sim.scatter.armed = !!l.scatter.armed; sim.scatter.armedFor = +l.scatter.armedFor || 0; sim.scatter.cooldown = +l.scatter.cooldown || 0; }
}

// Messages from the other side are untrusted: anything malformed is dropped.
export function readMessage(data) {
 if (!data || typeof data !== 'object' || typeof data.t !== 'string') return null;
 if (data.t === 'input') {
  if (!Array.isArray(data.inputs)) return null;
  const inputs = data.inputs.slice(0, 16).filter(i => i && Number.isInteger(i.seq) && i.seq > 0)
   .map(i => ({ seq: i.seq, ...playerInput(i) }));
  // (Real screens only, 9:21 upright to 32:9: a claimed shape cannot push the robots' fire in closer than that.)
  const aspect = Number.isFinite(data.aspect) && data.aspect > 0 ? Math.min(3.6, Math.max(.42, data.aspect)) : 0;
  return { t: 'input', inputs, ack: Number.isInteger(data.ack) ? data.ack : 0, ...(aspect ? { aspect } : {}) };
 }
 if (data.t === 'choose') return { t: 'choose', weapon: weaponOrDefault(data.weapon), go: data.go !== false };
 // A side picked in the lobby (team modes): a known team id, or null.
 if (data.t === 'team') return { t: 'team', team: ['red', 'blue', 'gold'].includes(data.team) ? data.team : null };
 if (data.t === 'pick' || data.t === 'respawn') return { t: data.t };
 if (data.t === 'ping' || data.t === 'pong') return Number.isFinite(data.s) ? { t: data.t, s: data.s } : null;
 if (data.t === 'hello') return { t: 'hello', version: data.version, name: cleanName(data.name) };
 if (data.t === 'snapshot') {
  if (!Number.isInteger(data.tick) || !Array.isArray(data.players)) return null;
  return { ...data, players: data.players.filter(p => p && typeof p.id === 'string' && Number.isFinite(p.x) && Number.isFinite(p.z)) };
 }
 return data;
}

// Events on the wire. A snapshot must fit one data-channel message (PeerJS
// refuses anything over ~16 KB, and the snapshot is then lost), so events
// travel small: numbers rounded to millimetres, and a Static stream's arcs
// (nine paths from one muzzle, ~20 a second) as a flat list of end points.
const r3 = v => Math.round(v * 1000) / 1000;
const shrink = (value, depth = 0) => {
 if (typeof value === 'number') return Number.isFinite(value) ? r3(value) : 0;
 if (!value || typeof value !== 'object' || depth > 3) return value;
 if (Array.isArray(value)) return value.map(v => shrink(v, depth + 1));
 const out = {};
 for (const key in value) out[key] = shrink(value[key], depth + 1);
 return out;
};
export function packEvent(e) {
 if (e.type === 'sprayArc') {
  const paths = e.paths || [], a = paths[0]?.a || { x: e.x, z: e.z };
  return { type: 'sprayArc', firing: !!e.firing, x: r3(e.x ?? a.x), z: r3(e.z ?? a.z), ax: r3(a.x), az: r3(a.z),
   b: paths.flatMap(p => [r3(p.b.x), r3(p.b.z)]), en: paths.map(p => (p.energy === 1 ? 1 : 0)) };
 }
 return shrink(e);
}
export function unpackEvent(e) {
 if (e?.type === 'sprayArc' && Array.isArray(e.b)) {
  const a = { x: e.ax, z: e.az }, paths = [];
  for (let i = 0; i < e.en.length; i++) paths.push({ energy: e.en[i] ? 1 : .25, a, b: { x: e.b[i * 2], z: e.b[i * 2 + 1] } });
  return { type: 'sprayArc', firing: e.firing, x: e.x, z: e.z, paths };
 }
 return e;
}
