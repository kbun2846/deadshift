// The killcam (owner, 2026-10-02: "Do the killcam. Make it show a health bar
// on the player's avatar and the killer. It should be brief after zooming
// into the dead player. It should not add much time to respawn time if
// applicable. It should make the death screen pop up after the kill cam is
// done."). Pure: no DOM, no three.js; ui/killcam-hud.js draws it and main.js
// hands it the death, the killer and the clock.
//
// How a death goes with it (every mode with deaths: solo practice, BOTS and
// online; numbers in config/death-flow.js KILLCAM):
//  1. The death shot as ever: the camera zooms onto your body, but quicker
//     (`zoom`, 1.2 s instead of DEATH_ZOOM's 2.2) when a killcam follows. A
//     bar over your body runs from the health you had just before the
//     killing hit down to nothing.
//  2. The killcam: the camera glides to the killer and follows them LIVE
//     where they are now (framing your body too when they stand within
//     `both` metres of it), their bar showing their health, and a plaque:
//     KILLED BY <name> · <weapon>. Live, not a replay: the world's shots and
//     effects are not recorded, and a replay of bodies alone (no rounds in
//     the air, your own avatar standing up again over its corpse) would show
//     a fight that did not look like that. Following the killer shows what
//     the player needs: who, with what, where they are and how hurt.
//  3. The death card comes in when it ends (`cardAt`), the camera gliding
//     back to the body as before (death-view.js cameraFrame, slid aside).
// It runs inside the respawn wait and never lengthens it: with a timed
// respawn (`wait`), the card keeps at least `minCard` seconds, so the
// killcam is shortened to fit (or left out under `least`). Any attack key or
// a tap skips straight to the card (`skip`). No killer (the storm, fire, your
// own blast, a fall), or none known `decide` seconds in: no killcam, the
// plain death shot and the card at DEATH_MENU_DELAY as before.
import { KILLCAM } from './config/death-flow.js';
import { DEATH_MENU_DELAY } from './ui/death-screen.js';

const smooth = t => { const k = Math.min(1, Math.max(0, t)); return k * k * (3 - 2 * k); };
const mix = (a, b, k) => a + (b - a) * k;

// How long the killcam can run before a respawn `wait` seconds after the
// death (Infinity: no timed respawn), and when the card comes.
export function killcamTiming(wait = Infinity, cfg = KILLCAM) {
 const room = Number.isFinite(wait) ? wait - cfg.minCard - cfg.zoom : Infinity;
 const follow = Math.min(cfg.follow, room);
 if (!(follow >= cfg.least)) return { on: false, zoomEnd: 0, camEnd: 0, cardAt: DEATH_MENU_DELAY };
 return { on: true, zoomEnd: cfg.zoom, camEnd: cfg.zoom + follow, cardAt: cfg.zoom + follow };
}

// Which deaths have a killer worth showing: someone else's hit, not the
// storm, fire or your own blast.
export const killerWorthShowing = (killer, myId = null) => !!killer && killer.id != null && killer.id !== myId && !killer.storm;

export function createKillcamState() {
 return { active: false, age: 0, decided: false, on: false, zoomEnd: 0, camEnd: 0, cardAt: DEATH_MENU_DELAY, wait: Infinity,
  killer: null, killerAt: null, body: { x: 0, z: 0, aimX: 0, aimZ: 0 }, hp0: 0, skipped: false };
}

// A death: where the body fell (`body` x, z and the killing hit's direction),
// your health share just before (`hp0`, 0-1), the respawn wait (`wait`) and,
// if already known, the killer ({ id, name, weapon, oneShot }).
export function startKillcam(s, { body, hp0 = 1, wait = Infinity, killer = null } = {}) {
 Object.assign(s, createKillcamState(), { active: true, wait, hp0: Math.min(1, Math.max(0, hp0)) });
 s.body = { x: body?.x || 0, z: body?.z || 0, dx: body?.directionX || 0, dz: body?.directionZ || 0 };
 if (killer) s.killer = { ...killer };
 return s;
}
// The killer learned late (online: the kill feed line), until the decision.
export function setKiller(s, killer) { if (s.active && !s.decided && killer) s.killer = { ...killer }; return s; }
// Where the killer is now ({ x, z, hp, maxHp }), each frame; `null`: not
// seen (dead, or gone): their last place stays, their bar empties.
export function seeKiller(s, at) {
 if (!s.active) return;
 if (at) s.killerAt = { x: at.x, z: at.z, hp: at.hp, maxHp: at.maxHp || 100, alive: !(at.hp <= 0) };
 else if (s.killerAt) s.killerAt.alive = false;
}
// The clock (seconds since the death). Returns the state.
export function stepKillcam(s, age, cfg = KILLCAM) {
 if (!s.active) return s;
 s.age = age;
 if (!s.decided && age >= cfg.decide) {
  s.decided = true;
  const t = s.killer ? killcamTiming(s.wait, cfg) : { on: false, zoomEnd: 0, camEnd: 0, cardAt: DEATH_MENU_DELAY };
  Object.assign(s, { on: t.on, zoomEnd: t.zoomEnd, camEnd: t.camEnd, cardAt: t.cardAt });
 }
 return s;
}
// The respawn as it stands now (`left` seconds away, live: online the
// host's countdown, which may have started before this screen heard of the
// death): the card keeps its `minCard` seconds whatever happens, so a late
// or slow screen cuts the killcam short rather than eat into the card.
export function fitKillcam(s, left, cfg = KILLCAM) {
 if (!s.active || !s.on || !Number.isFinite(left) || s.age >= s.cardAt) return s;
 const latest = s.age + left - cfg.minCard;
 if (s.cardAt > latest) s.cardAt = s.camEnd = Math.max(s.age, latest);
 return s;
}
// Straight to the card (an attack key or a tap). False when it is too soon
// after dying or there is no killcam to skip (the plain death shot is as it was).
export function skipKillcam(s, cfg = KILLCAM) {
 if (!s.active || !s.on || s.age < cfg.skipAfter || s.age >= s.cardAt) return false;
 s.cardAt = s.camEnd = s.age; s.skipped = true;
 return true;
}
export const killcamShowing = s => s.active && s.on && s.age < s.cardAt;

// The camera, written into `out` ({ x, z, height }), or null when the plain
// death shot's (`base`, death-view.js cameraFrame) is all there is.
// `start`: where the camera was at the death ({ x, z, height }).
export function killcamCamera(s, start, base, aspect = 16 / 9, out = { x: 0, z: 0, height: 0 }, cfg = KILLCAM) {
 if (!s.active || !s.on || !start) return null;
 const a = s.age;
 const after = a - s.camEnd, back = smooth(after / cfg.back);
 if (after > 0 && back >= 1) return null;
 // The zoom onto the body, quicker than the plain one.
 const bx = s.body.x + s.body.dx * .65, bz = s.body.z + s.body.dz * .65;
 const z = smooth(Math.min(a, s.zoomEnd) / (s.zoomEnd || 1));
 let x = mix(start.x, bx, z), zz = mix(start.z, bz, z), h = start.height * (1 - .44 * z);
 // Eased in from the plain zoom it took over from.
 const into = smooth((a - cfg.decide) / cfg.blendIn);
 if (base && into < 1) { x = mix(base.x, x, into); zz = mix(base.z, zz, into); h = mix(base.height, h, into); }
 // Over to the killer (live), the body in frame too when they are close.
 const k = s.killerAt;
 if (k && a > s.zoomEnd) {
  const to = smooth((Math.min(a, s.camEnd) - s.zoomEnd) / cfg.toKiller);
  const zoomed = start.height * .56, dx = k.x - bx, dz = k.z - bz, d = Math.hypot(dx, dz);
  let kx = k.x, kz = k.z, kh = zoomed * 1.08;
  if (d <= cfg.both) {
   // (About .8 of the camera's height is seen top to bottom on the ground, a
   // little less across times the aspect: fov 40, the usual tilt.)
   kx = (k.x + bx) / 2; kz = (k.z + bz) / 2;
   kh = Math.max(zoomed, Math.abs(dz) / (.8 * cfg.span), Math.abs(dx) / (.78 * Math.max(.5, aspect) * cfg.span));
  }
  kh = Math.min(kh, start.height * 1.05);
  x = mix(x, kx, to); zz = mix(zz, kz, to); h = mix(h, kh, to);
 }
 // The card is up: back to the body as the plain shot frames it.
 if (after > 0 && base) { x = mix(x, base.x, back); zz = mix(zz, base.z, back); h = mix(h, base.height, back); }
 out.x = x; out.z = zz; out.height = h;
 return out;
}

// The two bars and the plaque this moment: { you: { x, z, fill, show },
// killer: { x, z, fill, show }, plaque }.
export function killcamBars(s, out = { you: { x: 0, z: 0, fill: 0, show: false }, killer: { x: 0, z: 0, fill: 0, show: false }, plaque: false }, cfg = KILLCAM) {
 const live = s.active && s.age < s.cardAt;
 out.you.x = s.body.x; out.you.z = s.body.z;
 out.you.fill = s.hp0 * (1 - smooth((s.age - cfg.drainDelay) / cfg.drain));
 // (Only with a killcam: a death with nobody to show keeps the plain shot.)
 out.you.show = live && s.on;
 const k = s.killerAt;
 out.killer.show = live && s.on && !!k && s.age >= s.zoomEnd - .25;
 if (k) { out.killer.x = k.x; out.killer.z = k.z; out.killer.fill = k.alive ? Math.min(1, Math.max(0, k.hp / (k.maxHp || 100))) : 0; }
 out.plaque = live && s.on && s.age >= s.zoomEnd - .35;
 return out;
}

// The plaque's words: "killed by" / "one shot by", the name, the weapon.
export function plaqueText(killer, weaponName = id => id) {
 if (!killer) return null;
 return { by: killer.oneShot ? 'one shot by' : 'killed by', name: String(killer.name || '?'), weapon: killer.weapon ? String(weaponName(killer.weapon) || '') : '' };
}
