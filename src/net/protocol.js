// What travels between players, and the rules for trusting it.
//
// Clients send inputs (what they pressed), never results (where they are,
// what they hit). The host runs the simulation for everyone and sends back
// snapshots of the world. So a modified client can only lie about which keys
// it pressed, which it could do anyway by pressing them.
//
// Messages are plain JSON objects with a `t` (type) field:
//   hello     client -> host   { t, version, name }
//   welcome   host -> client   { t, id, slot, name, tick, map, players }
//   full      host -> client   { t, reason }            (full / wrong version)
//   removed   host -> client   { t, reason }            (the host took this player out)
//   input     client -> host   { t, inputs: [ {seq, ...playerInput}, ... ], ack }
//   choose    client -> host   { t, weapon }            (weapon picked: into the world)
//   menu      client -> host   { t }                    (back to the weapon menu)
//   snapshot  host -> client   { t, tick, players, you, proj, ev, feed, board? }
//   leave     host -> all      { t, id }
// The channel may drop or reorder packets. Inputs repeat the last few, and
// events are numbered and resent until the client acknowledges them, so
// shots, deaths and kill-feed lines are never lost.
export const PROTOCOL_VERSION = 3;

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
const PRESSES = ['grenade', 'extendedReload', 'fire', 'tapFire', 'storeCharge', 'doubleShot', 'reload', 'spray', 'hex', 'seed', 'launch', 'quickShot'];
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
 };
}

// Copies a snapshot entry back onto a simulation's player.
export function applyPlayerState(p, s) {
 for (const key of ['x', 'z', 'vx', 'vz', 'aimX', 'aimZ', 'aimSpin', 'dodgeRemaining', 'dodgeX', 'dodgeZ', 'stamina', 'staminaWait', 'blastVX', 'blastVZ'])
  if (Number.isFinite(s[key])) p[key] = s[key];
}

// Your own weapon state, from the host: what the HUD shows (ammo, reloads,
// charges, cooldowns). A joiner's sim never fires, so it learns these here.
export function loadout(sim) {
 const flat = o => Object.fromEntries(Object.entries(o).filter(([, v]) => typeof v !== 'object'));
 return { ammo: sim.ammo, rechargeProgress: round(sim.rechargeProgress, 3), rechargeWait: round(sim.rechargeWait, 3), hexCooldown: round(sim.hexCooldown, 2),
  grenadeCooldown: round(sim.grenadeCooldown, 2), rifle: flat(sim.rifle), shotgun: flat(sim.shotgun), spraying: !!sim.spray.active };
}
export function applyLoadout(sim, l) {
 if (!l) return;
 for (const key of ['ammo', 'rechargeProgress', 'rechargeWait', 'hexCooldown', 'grenadeCooldown']) if (Number.isFinite(l[key])) sim[key] = l[key];
 if (l.rifle) Object.assign(sim.rifle, l.rifle);
 if (l.shotgun) Object.assign(sim.shotgun, l.shotgun);
 sim.spray.active = !!l.spraying;
}

// Messages from the other side are untrusted: anything malformed is dropped.
export function readMessage(data) {
 if (!data || typeof data !== 'object' || typeof data.t !== 'string') return null;
 if (data.t === 'input') {
  if (!Array.isArray(data.inputs)) return null;
  const inputs = data.inputs.slice(0, 16).filter(i => i && Number.isInteger(i.seq) && i.seq > 0)
   .map(i => ({ seq: i.seq, ...playerInput(i) }));
  return { t: 'input', inputs, ack: Number.isInteger(data.ack) ? data.ack : 0 };
 }
 if (data.t === 'choose') return { t: 'choose', weapon: ['static', 'rifle', 'shotgun'].includes(data.weapon) ? data.weapon : 'static' };
 if (data.t === 'menu') return { t: 'menu' };
 if (data.t === 'hello') return { t: 'hello', version: data.version, name: cleanName(data.name) };
 if (data.t === 'snapshot') {
  if (!Number.isInteger(data.tick) || !Array.isArray(data.players)) return null;
  return { ...data, players: data.players.filter(p => p && typeof p.id === 'string' && Number.isFinite(p.x) && Number.isFinite(p.z)) };
 }
 return data;
}
