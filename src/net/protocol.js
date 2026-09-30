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
// 12: Omen input, curses, diamonds and loadout.
// 16 (v0.990a fixes): 'cropCut' (Ichor cuts crops down); the guard turns
// only rounds that meet its blade (host-side rule); 'moveMap' (the host
// takes the room to another map; the welcome's `map` moves a joiner there).
// 17: Sheath: its inputs (`sheathE` Gold Rush, `sheathX` Draw-cut, both
// predicted by the joiner: they move the body), its player state and loadout.
// 18 (v0.999a, hotspot lag): inputs packed as arrays (packInput), ten to a
// message; snapshots and inputs on their own unreliable channel, dropped
// rather than queued when the link backs up; the loadout only the weapon in
// hand's blocks; names in player states only now and then.
// 19 (v0.999a): a 'cropCut' is the blade's shape (crops.js); cut tiles stay.
// 20 (competitive menus, 2026-09-29): 4V4 (eight seats), ROUNDS (match
// state `rounds`, `played`, `timed`, `forfeit` votes, results `ready`),
// 'forfeit' and 'ready' from joiners, a 'forfeit' event.
// 21 (2026-09-29): 1V1's duel circle in the match state (`circle` {x, z, r});
// joiners confine their own body to it too.
// 22: the storm (storm.js): `storm` (its plan) and `stormT` in the match state.
// 23: the world's animals (critters.js): `critters` in the snapshot, [x, z,
// heading, dead] each (Hollow Wick's goat, which can be killed).
// 24 (game server + map vote, 2026-09-30): 'vote' from joiners ({ map }),
// `vote` in every snapshot (the map vote: its mode, seconds left and each
// map's votes and voters, or null), `listed` / `startsIn` in the lobby.
export const PROTOCOL_VERSION = 24;

const n = v => (Number.isFinite(v) ? v : 0);
const point = v => (Number.isFinite(v) && Math.abs(v) < 1000 ? v : undefined);

// The movement part of an input: all a joiner's own sim predicts.
export function movementInput(input = {}, weapon = null) {
 let moveX = n(input.moveX), moveZ = n(input.moveZ);
 const length = Math.hypot(moveX, moveZ);
 if (length > 1) { moveX /= length; moveZ /= length; }
 let aimX = n(input.aimX), aimZ = n(input.aimZ);
 const aim = Math.hypot(aimX, aimZ);
 if (aim > 1e-6) { aimX /= aim; aimZ /= aim; } else { aimX = 0; aimZ = 0; }
 return { moveX, moveZ, aimX, aimZ, smoothAim: !!input.smoothAim, dodge: !!input.dodge, aiming: !!input.aiming, ...(weapon==='sidekick'&&input.sidekickX?{sidekickX:true}:{}),...(input.sightlineStance?{sightlineStance:true}:{}),...(weapon==='sightline'&&input.reload?{reload:true}:{}),...(weapon==='sightline'&&input.sightlineX?{sightlineX:true}:{}),...(weapon==='sheath'&&input.sheathE?{sheathE:true}:{}),...(weapon==='sheath'&&input.sheathX?{sheathX:true}:{}) };
}

// Every button a player can press, cleaned: booleans stay booleans, points
// stay finite and on the map. Nothing else gets through.
const PRESSES = ['sheathE','sheathX','ichorGuard','ichorE','ichorX','sidekickMine','sidekickX','sightlineStance','sightlineX','omenPrime','omenVolley','grenade', 'surge', 'fire', 'tapFire', 'scatter', 'doubleShot', 'reload', 'spray', 'hex', 'seed', 'launch', 'quickShot'];
export function playerInput(input = {}) {
 const clean = movementInput(input);
 for (const key of PRESSES) clean[key] = !!input[key];
 for (const key of ['aimPointX', 'aimPointZ', 'launchPointX', 'launchPointZ']) clean[key] = point(input[key]);
 clean.autoRange = input.autoRange === 'touch' || input.autoRange === 'keyboard' ? input.autoRange : false;
 return clean;
}

// Inputs on the wire (v0.999a, owner: joiners on a phone hotspot lagged and
// rubber-banded). An input was a JSON object of ~35 named fields, ~560 bytes
// four to a message, 60 messages a second: ~65 KB/s up from every joiner,
// enough to choke a hotspot's radio. Packed it is a short array:
//   [seq, moveX, moveZ, aimX, aimZ, flags, aimPointX, aimPointZ,
//    launchPointX, launchPointZ, autoRange]
// moves to 1/1000, aims to 1/10000, points to centimetres, every yes/no one
// bit of `flags` (INPUT_FLAGS order), autoRange 0 / 1 touch / 2 keyboard;
// trailing empty entries dropped. About 30 bytes. playerInput cleans it on
// the host as it cleaned the object.
export const INPUT_FLAGS = Object.freeze(['smoothAim', 'dodge', 'aiming', ...PRESSES]);
const q = (v, k) => Math.round((Number.isFinite(v) ? v : 0) * k) / k;
export function packInput(input) {
 let flags = 0;
 for (let i = 0; i < INPUT_FLAGS.length; i++) if (input[INPUT_FLAGS[i]]) flags += 2 ** i;
 const pt = v => (Number.isFinite(v) ? Math.round(v * 100) / 100 : null);
 const out = [input.seq, q(input.moveX, 1000), q(input.moveZ, 1000), q(input.aimX, 10000), q(input.aimZ, 10000), flags,
  pt(input.aimPointX), pt(input.aimPointZ), pt(input.launchPointX), pt(input.launchPointZ), input.autoRange === 'touch' ? 1 : input.autoRange === 'keyboard' ? 2 : 0];
 while (out.length > 6 && (out[out.length - 1] === null || out[out.length - 1] === 0)) out.pop();
 return out;
}
export function unpackInput(a) {
 if (!Array.isArray(a)) return a;
 const flags = Number.isFinite(a[5]) ? a[5] : 0, input = { seq: a[0], moveX: a[1], moveZ: a[2], aimX: a[3], aimZ: a[4] };
 for (let i = 0; i < INPUT_FLAGS.length; i++) if (Math.floor(flags / 2 ** i) % 2) input[INPUT_FLAGS[i]] = true;
 if (a[6] != null) input.aimPointX = a[6];
 if (a[7] != null) input.aimPointZ = a[7];
 if (a[8] != null) input.launchPointX = a[8];
 if (a[9] != null) input.launchPointZ = a[9];
 if (a[10] === 1) input.autoRange = 'touch'; else if (a[10] === 2) input.autoRange = 'keyboard';
 return input;
}

// Usernames: short, printable, trimmed.
export function cleanName(text) {
 const name = String(text ?? '').replace(/[^\p{L}\p{N} _.\-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 16);
 return name || null;
}

// Everything the others need to draw a player, and everything the owning
// client needs to re-run its own prediction from the host's answer.
const round = (v, places = 3) => Math.round(v * 10 ** places) / 10 ** places;
// Motion fields left out of a player state while zero (most of the time:
// standing, not dashing, not blown back), v0.999a.
const ZERO_OMITTED = ['vx', 'vz', 'aimSpin', 'dodgeRemaining', 'dodgeX', 'dodgeZ', 'staminaWait', 'blastVX', 'blastVZ'];
const nonZero = (key, v) => (v ? { [key]: v } : {});
// A weapon's state for the wire: its numbers to 1/1000 (v0.999a: a swing
// timer went as 0.06000000000000011).
const rounded = o => { const out = {}; for (const k in o) { const v = o[k]; out[k] = typeof v === 'number' ? round(v) : v; } return out; };
export function playerState(id, p, lastSeq = 0) {
 return {
  id, lastSeq,
  ...(p.ichor?{ichor:rounded(p.ichor)}:{}),...(p.sidekick?{sidekick:rounded(p.sidekick)}:{}),
  ...(p.sightline?{sightline:rounded(p.sightline)}:{}),...(p.sheath?{sheath:rounded(p.sheath)}:{}),
  x: round(p.x), z: round(p.z), ...nonZero('vx', round(p.vx)), ...nonZero('vz', round(p.vz)),
  aimX: round(p.aimX, 4), aimZ: round(p.aimZ, 4), ...nonZero('aimSpin', round(p.aimSpin || 0, 4)),
  ...nonZero('dodgeRemaining', round(p.dodgeRemaining, 4)), ...nonZero('dodgeX', round(p.dodgeX, 4)), ...nonZero('dodgeZ', round(p.dodgeZ, 4)),
  stamina: round(p.stamina, 4), ...nonZero('staminaWait', round(p.staminaWait, 4)),
  ...nonZero('blastVX', round(p.blastVX)), ...nonZero('blastVZ', round(p.blastVZ)),
  hp: Math.round(p.hp * 50) / 50, maxHp: p.maxHp, // (a tenth of a point at 500 health: a fiftieth now)
  // (Hills: wading under a deck. Only sent when so.)
  ...(p.below ? { below: 1 } : {}),
 };
}

// Copies a snapshot entry back onto a simulation's player. (The fields
// playerState leaves out at zero read as zero.)
export function applyPlayerState(p, s) {
 for (const key of ['x', 'z', 'aimX', 'aimZ', 'stamina']) if (Number.isFinite(s[key])) p[key] = s[key];
 for (const key of ZERO_OMITTED) p[key] = Number.isFinite(s[key]) ? s[key] : 0;
 if (s.below) p.below = true; else if (p.below) p.below = false;
}

// Your own weapon state, from the host: what the HUD shows (ammo, reloads,
// charges, cooldowns). A joiner's sim never fires, so it learns these here.
// (v0.999a: only the weapon in hand's blocks; the others were ~500 bytes of
// every snapshot.)
export function loadout(sim) {
 const flat = o => Object.fromEntries(Object.entries(o).filter(([, v]) => typeof v !== 'object'));
 return { ...(sim.weapon==='sheath'&&sim.sheath?{sheath:flat(sim.sheath)}:{}),...(sim.weapon==='ichor'?{ichor:flat(sim.ichor),ichorTrails:sim.ichorTrails.map(t=>({...t}))}:{}),...(sim.weapon==='sidekick'?{sidekick:{...flat(sim.sidekick)}}:{}), ...(sim.weapon==='sightline'?{sightline:{...flat(sim.sightline)}}:{}), omen:sim.omen&&sim.weapon==='omen'?{...flat(sim.omen),marks:sim.omen.marks.map(m=>({...m}))}:undefined, ammo: sim.ammo, rechargeProgress: round(sim.rechargeProgress, 3), rechargeWait: round(sim.rechargeWait, 3), hexCooldown: round(sim.hexCooldown, 2),
  grenadeCooldown: round(sim.grenadeCooldown, 2), rifle: sim.weapon==='rifle'?flat(sim.rifle):undefined, shotgun: sim.weapon==='shotgun'?flat(sim.shotgun):undefined, spraying: !!sim.spray.active,
  surge: sim.surge ? { phase: sim.surge.phase, t: round(sim.surge.t, 3), cooldown: round(sim.surge.cooldown, 2), active: !!sim.surge.active } : undefined,
  scatter: sim.scatter ? { armed: !!sim.scatter.armed, armedFor: round(sim.scatter.armedFor || 0, 2), cooldown: round(sim.scatter.cooldown, 2) } : undefined };
}
export function applyLoadout(sim, l) {
 if (!l) return;
 for (const key of ['ammo', 'rechargeProgress', 'rechargeWait', 'hexCooldown', 'grenadeCooldown']) if (Number.isFinite(l[key])) sim[key] = l[key];
 if(l.ichor&&sim.ichor){Object.assign(sim.ichor,l.ichor);sim.ichorTrails=(l.ichorTrails||[]).map(t=>({...t}));}
 if(l.sidekick&&sim.sidekick)Object.assign(sim.sidekick,l.sidekick);
 if(l.sheath&&sim.sheath)Object.assign(sim.sheath,l.sheath);
 if(l.sightline&&sim.sightline)Object.assign(sim.sightline,l.sightline);
 if(l.omen&&sim.omen)Object.assign(sim.omen,l.omen,{marks:(l.omen.marks||[]).map(m=>({...m}))});
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
  const inputs = data.inputs.slice(0, 16).map(unpackInput).filter(i => i && Number.isInteger(i.seq) && i.seq > 0)
   .map(i => ({ seq: i.seq, ...playerInput(i) }));
  // (Real screens only, 9:21 upright to 32:9: a claimed shape cannot push the robots' fire in closer than that.)
  const aspect = Number.isFinite(data.aspect) && data.aspect > 0 ? Math.min(3.6, Math.max(.42, data.aspect)) : 0;
  return { t: 'input', inputs, ack: Number.isInteger(data.ack) ? data.ack : 0, ...(aspect ? { aspect } : {}) };
 }
 if (data.t === 'choose') return { t: 'choose', weapon: weaponOrDefault(data.weapon), go: data.go !== false };
 // A side picked in the lobby (team modes): a known team id, or null.
 if (data.t === 'team') return { t: 'team', team: ['red', 'blue', 'gold'].includes(data.team) ? data.team : null };
 if (data.t === 'pick' || data.t === 'respawn') return { t: data.t };
 // FORFEIT (a vote in team modes; again takes it back) and READY on the end-of-match card.
 if (data.t === 'forfeit' || data.t === 'ready') return { t: data.t, on: data.on !== false };
 if (data.t === 'ping' || data.t === 'pong') return Number.isFinite(data.s) ? { t: data.t, s: data.s } : null;
 if (data.t === 'hello') return { t: 'hello', version: data.version, name: cleanName(data.name) };
 // A map vote (host-session.js startVoting): a map id, checked by the host.
 if (data.t === 'vote') return typeof data.map === 'string' && data.map.length <= 40 ? { t: 'vote', map: data.map } : null;
 // The host moving the room to another map (v0.990a): its id (the client
 // checks it against its own maps before it goes).
 if (data.t === 'moveMap') return typeof data.map === 'string' && data.map.length <= 40 ? { t: 'moveMap', map: data.map } : null;
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
