// The multiplayer game as main.js sees it: going online from the menu, what
// the local simulation runs each tick, everyone else's shots and effects,
// the room badge, the lobby and the host's controls, and leaving. The networking and the
// match rules live in net/; this file is the page glue.
import { NETWORK } from './config/network.js';
import { makeRoomCode, cleanRoomCode } from './net/transport.js';
import { movementInput, cleanName } from './net/protocol.js';
import { ProjectileMirror } from './net/projectiles.js';
import { supportsMode, multiplayerMaps, DEFAULT_MAP } from './maps.js';
import { DEFAULT_WEAPON } from './items.js';
import { pickState } from './net/host-session.js';
import { SIDE_COLOURS } from './config/match.js';

const NAME_KEY = 'deadshift-username';
export const savedName = () => { try { return localStorage.getItem(NAME_KEY) || ''; } catch { return ''; } };
const saveName = name => { try { localStorage.setItem(NAME_KEY, name); } catch {} };

export function createOnlinePlay({ $, map, sim, createSim, start, toast, leave, server, pickWeapon }) {
 let teamCache = { tick: null, map: new Map() };
 let session = null, code = null, lastLife = 0;
 const mirror = new ProjectileMirror();
 const badge = document.createElement('button');
 badge.id = 'online-badge'; badge.className = 'online-badge plain-text'; badge.hidden = true;
 badge.title = 'Copy an invite link';
 // Under the map name and mode, in the same block, so the three can never
 // overlap whatever the title's size (menu-theme.css).
 (document.querySelector('.masthead .brand > div') || $('game')).append(badge);
 const copyInvite = async () => {
  // (A map other than the default rides along, so the friend loads the same one: s2-spawns.)
  const link = location.origin + location.pathname + '?' + (map.id !== DEFAULT_MAP ? 'map=' + encodeURIComponent(map.id) + '&' : '') + 'join=' + code;
  try { await navigator.clipboard.writeText(link); toast('INVITE LINK COPIED'); }
  catch { toast('ROOM CODE ' + code); }
 };
 badge.onclick = copyInvite;
 let shownCount = 0;
 const syncBadge = () => {
  if (!session) { badge.hidden = true; return; }
  const count = session.playerCount;
  if (count === shownCount && !badge.hidden) return;
  shownCount = count; badge.hidden = false;
  // The mode line above already says MULTIPLAYER. Offline: no matchmaking
  // server was reachable, so only this browser's other windows can join.
  badge.textContent = 'ROOM ' + code + ' · ' + count + '/' + NETWORK.maxPlayers + (session.transport?.offline ? ' · OFFLINE' : '');
 };

 async function request({ role, code: typed, name: typedName, settings, mode }, status) {
  const name = cleanName(typedName);
  if (!name) throw new Error('Enter a username first.');
  saveName(name);
  // Multiplayer runs on a multiplayer map (maps.js). From anywhere else (the
  // tutorial, a practice-only map) reload onto one and carry on there.
  if (map.training || !supportsMode(map, 'multiplayer')) {
   location.href = '?map=' + multiplayerMaps()[0].id + '&' + (role === 'host' ? 'host=1' : 'join=' + encodeURIComponent(typed || ''));
   return;
  }
  code = role === 'host' ? makeRoomCode() : cleanRoomCode(typed);
  if (!code) throw new Error('Room codes are ' + NETWORK.codeLength + ' letters and numbers.');
  status(role === 'host' ? 'Opening room…' : 'Finding room ' + code + '…');
  const { goOnline } = await import('./net/online.js');
  const joined = await goOnline({ role: role === 'host' ? 'host' : 'client', code, map, local: sim, createSim, server, name, settings, mode });
  if (role !== 'host') {
   // Wait for the host to let us in (or turn us away) before leaving the menu.
   const deadline = performance.now() + 8000;
   while (!joined.welcomed && !joined.ended && performance.now() < deadline) await new Promise(r => setTimeout(r, 50));
   if (!joined.welcomed) { joined.close(); throw new Error(joined.ended || 'The host did not let us in.'); }
  }
  session = joined; shownCount = 0; lastLife = 0;
  sim.dev = { speed: 1 }; sim.targets = [];
  status('');
  try { history.replaceState(null, '', '?map=' + map.id + '&online=' + (role === 'host' ? 'host' : 'join')); } catch {}
  await start(DEFAULT_WEAPON);
  document.querySelector('.mode').textContent = 'MULTIPLAYER';
  toast(role === 'host' ? (joined.transport?.offline ? 'NO MATCHMAKING SERVER: PLAYING OFFLINE' : 'ROOM ' + code + ' IS OPEN') : 'JOINED ROOM ' + code);
  syncBadge();
  // Into the lobby screen (main.js shows it while the round's phase is 'lobby').
  pickWeapon?.();
 }

 const api = {
  request,
  get active() { return !!session; },
  get session() { return session; },
  get isHost() { return session?.role === 'host'; },
  get myId() { return session ? session.id : null; },
  // In the world and alive: the same question for host and joiner.
  get me() {
   if (!session) return null;
   if (session.role === 'host') { const s = session.hostSeat; return { present: s.present, dead: s.dead, life: s.life, respawnIn: s.respawnIn, name: s.name, weapon: s.weapon, picking: pickState(s.picking) }; }
   return session.me;
  },
  // The input the local simulation runs this tick.
  input(raw) {
   if (!session) return raw;
   return session.role === 'client' ? session.input(raw) : session.beforeLocal(raw);
  },
  // After the local simulation has stepped: the host runs everyone else.
  afterStep() { if (session?.role === 'host') session.step(); },
  // The weapon pick (go: into the world now), picking again after dying, and
  // practice's instant respawn.
  choose(weapon, go = true) { session?.choose(weapon, go); },
  pickAgain() { session?.pickAgain(); },
  respawnNow() { session?.respawnNow(); },
  // Everyone else to draw; in a team round each wears their side's ring.
  // Team games: a teammate is a friend (green hat and ring), the rest foes (red).
  others(alpha) { const mine = api.myTeam; return session ? session.others(alpha).map(o => { if (!mine || !o.team) return o; const side = SIDE_COLOURS[o.team] ? o.team : null; return side ? { ...o, side, ring: SIDE_COLOURS[side].ring } : o; }) : null; },
  // Your side in a team round (null otherwise).
  get myTeam() { if (!session) return null; return session.role === 'host' ? session.hostSeat.team || null : session.latest(session.id)?.team || null; },
  // Who you can hurt: everyone but your side.
  foes(alpha) { const mine = api.myTeam, list = api.others(alpha) || []; return mine ? list.filter(o => o.team !== mine) : list; },
  // Everyone else's projectiles, for drawing (net/projectiles.js).
  foreign() {
   if (!session) return null;
   // Teammates' orbs look like your own; everyone else's a deeper blue.
   // Slot → side, worked out once per tick (not per frame).
   const tick = session.role === 'host' ? session.tick : session.snapshots?.at(-1)?.tick;
   if (teamCache.tick !== tick) teamCache = { tick, map: new Map((session.role === 'host' ? [...session.arena.seats.values()] : session.snapshots?.at(-1)?.players || []).map(p => [p.slot, p.team])) };
   const mine = api.myTeam, teamOf = teamCache.map;
   const isEnemy = slot => !mine || teamOf.get(slot) !== mine;
   if (session.role === 'client') return session.foreignProjectiles(isEnemy);
   mirror.update(session.remoteProjectiles(), performance.now() / 1000);
   // Practice targets live in the host's match, not in its own sim.
   return { ...mirror.lists(performance.now() / 1000, isEnemy), targets: session.arena.targets };
  },
  // Events from the others since last frame: [{ by, e, shooter, slot }].
  events() {
   if (!session) return [];
   const list = session.role === 'host' ? session.drainRemoteEvents() : session.drainEvents();
   const others = session.others(1);
   return list.map(entry => {
    let shooter = null, slot = 0;
    if (session.role === 'host') { const seat = session.arena.seats.get(entry.by); if (seat) { shooter = seat.sim.player; slot = seat.slot; } }
    else { const p = others.find(o => o.id === entry.by) || session.latest(entry.by); if (p) { shooter = p; slot = p.slot ?? 0; } if (entry.by === session.id) slot = session.slot; }
    return { ...entry, shooter, slot };
   });
  },
  feed() { return session ? session.drainFeed() : []; },
  get code() { return code; },
  copyInvite,
  // The room (players, their ping and colour slot, the spawn setting) and the
  // match clock, for everyone; the controls below work on the host only.
  lobby() { return session ? session.lobby() : { players: [], spawnMode: 'random' }; },
  match() { return session ? session.match() : null; },
  kick(id) { return session?.role === 'host' ? session.kick(id) : false; },
  setSpawnMode(mode) { return session?.role === 'host' ? session.setSpawnMode(mode) : false; },
  resetMap() { if (session?.role === 'host') session.resetMap(); },
  restartMatch() { if (session?.role === 'host') session.restartMatch(); },
  setSetting(key, value) { return session?.role === 'host' ? session.setSetting(key, value) : false; },
  setMode(mode) { return session?.role === 'host' ? session.setMode(mode) : false; },
  startRound(mode) { return session?.role === 'host' ? session.startRound(mode) : false; },
  // Why the host's last START was refused (a mode short of players, or too many).
  startError() { return session?.role === 'host' ? session.startError : null; },
  addRobot() { return session?.role === 'host' ? session.addRobot() : null; },
  tuneRobot(id, setup) { return session?.role === 'host' ? session.tuneRobot(id, setup) : false; },
  tuneAllRobots(setup) { return session?.role === 'host' ? session.tuneAllRobots(setup) : false; },
  // Team modes: the side you want (everyone, in the lobby).
  chooseTeam(team) { session?.chooseTeam(team); },
  endRound() { if (session?.role === 'host') session.endRound(); },
  scoreboard() { return session ? session.scoreboard() : []; },
  killerOf(myId) {
   const feed = session?.role === 'host' ? session.feed() : null;
   return feed ? [...feed].reverse().find(l => l.victims.includes(myId))?.killerName || null : null;
  },
  // Once per frame: messages for the player, ending if the link is gone, and
  // whether we just came back to life.
  frame({ onRespawn } = {}) {
   if (!session) return;
   for (const notice of session.drainNotices()) toast(notice.toUpperCase());
   if (session.ended) { const why = session.ended; api.close(); toast(why.toUpperCase()); leave(); return; }
   const me = api.me;
   if (me && me.life !== lastLife) { lastLife = me.life; if (me.present) onRespawn?.(); }
   syncBadge();
  },
  close() {
   if (!session) return;
   try { session.close(); } catch {}
   session = null; code = null; badge.hidden = true; sim.otherPlayers = []; sim.worldAuthority = true;
   document.querySelector('.mode').textContent = 'PRACTICE';
  },
 };
 return api;
}
export { movementInput };
