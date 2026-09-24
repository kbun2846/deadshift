// The multiplayer game as main.js sees it: going online from the menu, what
// the local simulation runs each tick, everyone else's shots and effects,
// the room badge, the lobby and the host's controls, and leaving. The networking and the
// match rules live in net/; this file is the page glue.
import { NETWORK } from './config/network.js';
import { makeRoomCode, cleanRoomCode } from './net/transport.js';
import { movementInput, cleanName } from './net/protocol.js';
import { ProjectileMirror } from './net/projectiles.js';
import { supportsMode, multiplayerMaps } from './maps.js';
import { DEFAULT_WEAPON } from './items.js';
import { pickState } from './net/host-session.js';

const NAME_KEY = 'deadshift-username';
export const savedName = () => { try { return localStorage.getItem(NAME_KEY) || ''; } catch { return ''; } };
const saveName = name => { try { localStorage.setItem(NAME_KEY, name); } catch {} };

export function createOnlinePlay({ $, map, sim, createSim, start, toast, leave, server, pickWeapon }) {
 let session = null, code = null, lastLife = 0;
 const mirror = new ProjectileMirror();
 const badge = document.createElement('button');
 badge.id = 'online-badge'; badge.className = 'online-badge plain-text'; badge.hidden = true;
 badge.title = 'Copy an invite link';
 // Under the map name and mode, in the same block, so the three can never
 // overlap whatever the title's size (menu-theme.css).
 (document.querySelector('.masthead .brand > div') || $('game')).append(badge);
 const copyInvite = async () => {
  const link = location.origin + location.pathname + '?join=' + code;
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

 async function request({ role, code: typed, name: typedName, settings }, status) {
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
  const joined = await goOnline({ role: role === 'host' ? 'host' : 'client', code, map, local: sim, createSim, server, name, settings });
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
  others(alpha) { return session ? session.others(alpha) : null; },
  // Everyone else's projectiles, for drawing (net/projectiles.js).
  foreign() {
   if (!session) return null;
   if (session.role === 'client') return session.foreignProjectiles();
   mirror.update(session.remoteProjectiles(), performance.now() / 1000);
   // Practice targets live in the host's match, not in its own sim.
   return { ...mirror.lists(performance.now() / 1000), targets: session.arena.targets };
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
