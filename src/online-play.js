// The multiplayer game as main.js sees it: going online from the menu, what
// the local simulation runs each tick, everyone else's shots and effects,
// the room badge, the lobby and the host's controls, and leaving. The networking and the
// match rules live in net/; this file is the page glue.
//
// Two ways online (net/online.js `via`):
//  - 'server' (JOIN, HOST and the always-open rooms since 2026-09-30): the
//    match runs on the game server (server/); this page is a joiner even when
//    it made the room. The room's leader (its maker, else whoever has been
//    in longest: server/room.js) has the host's lobby controls, sent to the
//    server as `lead` messages (`leads`, below).
//  - 'p2p' (developer tools only): this page hosts, or joins a page that does.
import { NETWORK } from './config/network.js';
import { showBusy } from './ui/busy-screen.js';
import { makeRoomCode, cleanRoomCode } from './net/transport.js';
import { movementInput, cleanName } from './net/protocol.js';
import { ProjectileMirror } from './net/projectiles.js';
import { supportsMode, multiplayerMaps, DEFAULT_MAP } from './maps.js';
import { DEFAULT_WEAPON } from './items.js';
import { pickState } from './net/host-session.js';
import { SIDE_COLOURS } from './config/match.js';

const NAME_KEY = 'deadstab-username';
// What a room carries across a move to another map (v0.990a): the mode, the
// settings, the robots the host added, and its code. The page reloads onto
// the new map; this is read back once when the room opens again.
const CARRY_KEY = 'deadstab-room-carry';
export const saveCarry = carry => { try { sessionStorage.setItem(CARRY_KEY, JSON.stringify({ ...carry, at: Date.now() })); } catch {} };
export const takeCarry = () => { try { const raw = sessionStorage.getItem(CARRY_KEY); sessionStorage.removeItem(CARRY_KEY); const c = raw && JSON.parse(raw); return c && Date.now() - c.at < 120000 ? c : null; } catch { return null; } };
// A room reopened on the same code: the old one may hold it a few seconds
// after its page has gone; joiners wait for it the same way.
const RETRY = Object.freeze({ host: 15000, join: 25000, every: 1500 });
export const savedName = () => { try { return localStorage.getItem(NAME_KEY) || ''; } catch { return ''; } };
const saveName = name => { try { localStorage.setItem(NAME_KEY, name); } catch {} };

export function createOnlinePlay({ $, map, sim, createSim, start, toast, leave, server, gameServer = null, pickWeapon, adminCard = null }) {
 // The game server's address (a development build may point at another: ?server=).
 const serverUrl = gameServer || NETWORK.gameServer;
 // A development build's server overrides ride along on every reload (a map
 // move, a room on another map), or the page would lose them on the way.
 const devFlags = (gameServer ? '&server=' + encodeURIComponent(gameServer) : '') + (server ? '&peerhost=' + encodeURIComponent(server) : '');
 // (This page's own animals, critters.js: back when the room closes.)
 const ownCritters = sim.critters || null;
 let teamCache = { tick: null, map: new Map() };
 let session = null, code = null, lastLife = 0;
 // After a map vote moved a peer-to-peer room: start the round once everyone
 // is back ({ mode, expect, until }).
 let pendingStart = null;
 const mirror = new ProjectileMirror();
 const badge = document.createElement('button');
 badge.id = 'online-badge'; badge.className = 'online-badge plain-text'; badge.hidden = true;
 badge.title = 'Copy an invite link';
 // Under the map name and mode, in the same block, so the three can never
 // overlap whatever the title's size (menu-theme.css).
 (document.querySelector('.masthead .brand > div') || $('game')).append(badge);
 const copyInvite = async () => {
  // (A map other than the default rides along, so the friend loads the same one: s2-spawns.)
  const link = location.origin + location.pathname + '?' + (map.id !== DEFAULT_MAP ? 'map=' + encodeURIComponent(map.id) + '&' : '') + 'join=' + code + p2pFlag();
  try { await navigator.clipboard.writeText(link); toast('INVITE LINK COPIED'); }
  catch { toast('ROOM CODE ' + code); }
 };
 badge.onclick = copyInvite;
 let shownCount = 0;
 // A peer-to-peer room's links say so (a code alone means the game server).
 const p2pFlag = () => (session && !session.transport?.server ? '&p2p=1' : '');
 // The game server's room leader has the host's lobby controls.
 const leads = () => !!session && (session.role === 'host' || !!session.transport?.room?.lead);
 const lead = (op, fields) => { if (session?.role !== 'client' || !leads()) return false; session.transport.lead?.(op, fields); return true; };
 const syncBadge = () => {
  if (!session) { badge.hidden = true; return; }
  const count = session.playerCount;
  if (count === shownCount && !badge.hidden) return;
  shownCount = count; badge.hidden = false;
  // The mode line above already says MULTIPLAYER. Offline: no matchmaking
  // server was reachable, so only this browser's other windows can join.
  badge.textContent = 'ROOM ' + code + ' · ' + count + '/' + NETWORK.maxPlayers + (session.transport?.offline ? ' · OFFLINE' : '');
 };

 // `map` (host): the map to open the room on; another than this page's
 // reloads onto it and opens there (v0.990a: the host setup's map). `room`
 // (host): a code to open again (a room moved to another map). `retry`
 // (join): keep trying while the host is (re)opening. `carry`: what a moved
 // room brings along (robots).
 async function request({ role, via = 'server', code: typed, name: typedName, settings, mode, map: wanted = null, room = null, retry = false, carry = null }, status) {
  const name = cleanName(typedName);
  if (!name) throw new Error('Enter a username first.');
  saveName(name);
  const p2p = via === 'p2p';
  if (role === 'host' && wanted && wanted !== map.id && multiplayerMaps(wanted).some(m => m.id === wanted)) {
   saveCarry({ mode, settings, code: room || null, robots: carry?.robots || [], via });
   status('Opening ' + (multiplayerMaps(wanted).find(m => m.id === wanted)?.name || 'the map') + '…');
   showBusy(); location.href = '?map=' + encodeURIComponent(wanted) + '&host=1&autohost=1' + devFlags;
   return;
  }
  // Multiplayer runs on a multiplayer map (maps.js). From anywhere else (the
  // tutorial, a practice-only map) reload onto one and carry on there.
  if (map.training || !supportsMode(map, 'multiplayer')) {
   showBusy(); location.href = '?map=' + multiplayerMaps()[0].id + '&' + (role === 'host' ? 'host=1' : 'join=' + encodeURIComponent(typed || '')) + (p2p ? '&p2p=1' : '') + devFlags;
   return;
  }
  if (!p2p) return viaServer({ role, typed, name, settings, mode }, status);
  code = role === 'host' ? cleanRoomCode(room) || makeRoomCode() : cleanRoomCode(typed);
  if (!code) throw new Error('Room codes are ' + NETWORK.codeLength + ' numbers.');
  status(role === 'host' ? 'Opening room…' : 'Finding room ' + code + '…');
  const { goOnline } = await import('./net/online.js');
  // (A reopened room's code may still be held by its old page for a moment;
  // a joiner following a moved room waits for the host to be back.)
  const waitFor = role === 'host' ? (room ? 'unavailable-id' : null) : retry ? 'peer-unavailable' : null, until = performance.now() + (role === 'host' ? RETRY.host : RETRY.join);
  let joined;
  for (;;) {
   try { joined = await goOnline({ via: 'p2p', role: role === 'host' ? 'host' : 'client', code, map, local: sim, createSim, server, name, settings, mode }); break; }
   catch (error) { if (!waitFor || error?.type !== waitFor || performance.now() > until) throw error; status(role === 'host' ? 'Reopening room ' + code + '…' : 'Waiting for room ' + code + '…'); await new Promise(r => setTimeout(r, RETRY.every)); }
  }
  if (role !== 'host') {
   // Wait for the host to let us in (or turn us away) before leaving the menu.
   const deadline = performance.now() + 8000;
   while (!joined.welcomed && !joined.ended && !joined.moveTo && performance.now() < deadline) await new Promise(r => setTimeout(r, 50));
   // The room is on another of our maps (v0.990a): go there and join it again.
   if (joined.moveTo) { const to = joined.moveTo; joined.close(); status('The room is on ' + (multiplayerMaps(to).find(m => m.id === to)?.name || 'another map') + '…'); showBusy(); location.href = '?map=' + encodeURIComponent(to) + '&join=' + code + '&autojoin=1&p2p=1' + devFlags; return; }
   if (!joined.welcomed) { joined.close(); throw new Error(joined.ended || 'The host did not let us in.'); }
  }
  await enter(joined, role, carry, status);
 }

 // The game server (net/socket-transport.js): HOST makes a room there, JOIN
 // finds one by its code (an always-open room's too). Either way this page
 // joins it like any player, then waits to be let in.
 async function viaServer({ role, typed, name, settings, mode }, status) {
  let wanted = null;
  if (role !== 'host') { wanted = cleanRoomCode(typed); if (!wanted) throw new Error('Room codes are ' + NETWORK.codeLength + ' numbers.'); }
  status(role === 'host' ? 'Opening room…' : 'Finding room ' + wanted + '…');
  const { goOnline } = await import('./net/online.js');
  const request = role === 'host' ? { t: 'create', map: map.id, mode, settings } : { t: 'join', code: wanted };
  const joined = await goOnline({ via: 'server', request, map, local: sim, createSim, server: serverUrl, name });
  code = joined.transport.code;
  const deadline = performance.now() + 8000;
  while (!joined.welcomed && !joined.ended && !joined.moveTo && performance.now() < deadline) await new Promise(r => setTimeout(r, 50));
  // The room is on another of our maps: go there and join it again.
  if (joined.moveTo) { const to = joined.moveTo; joined.close(); status('The room is on ' + (multiplayerMaps(to).find(m => m.id === to)?.name || 'another map') + '…'); showBusy(); location.href = '?map=' + encodeURIComponent(to) + '&join=' + code + '&autojoin=1' + devFlags; return; }
  if (!joined.welcomed) { joined.close(); throw new Error(joined.ended || 'The game server did not let us in.'); }
  await enter(joined, role, null, status);
 }

 // In: the session is live; into the lobby screen. (`role`: 'host' when this
 // page made the room, on the game server too; `carry`: a moved
 // peer-to-peer room's robots.)
 async function enter(joined, role, carry, status) {
  const hosting = joined.role === 'host';
  session = joined; shownCount = 0; lastLife = 0;
  // A moved room's robots come back (the ones the host added; fill seats refill themselves).
  if (hosting) for (const setup of carry?.robots || []) { const seat = joined.addRobot?.(); if (seat?.id && setup) joined.tuneRobot?.(seat.id, setup); }
  // The map vote brought the room here: the round starts once everyone is back.
  pendingStart = hosting && carry?.autoStart ? { mode: carry.autoStart, expect: carry.expect || 1, until: performance.now() + 20000 } : null;
  sim.dev = { speed: 1 }; sim.targets = [];
  // (The world's animals: the host's arena holds them; a joiner only draws them.)
  if (!hosting) sim.critters = null;
  status('');
  try { history.replaceState(null, '', '?map=' + map.id + '&online=' + (role === 'host' ? 'host' : 'join') + devFlags); } catch {}
  await start(DEFAULT_WEAPON);
  document.querySelector('.mode').textContent = 'MULTIPLAYER';
  const roomName = joined.transport?.room?.name;
  toast(role === 'host' ? (joined.transport?.offline ? 'NO MATCHMAKING SERVER: PLAYING OFFLINE' : 'ROOM ' + code + ' IS OPEN') : roomName ? 'JOINED ' + roomName.toUpperCase() : 'JOINED ROOM ' + code);
  syncBadge();
  // Into the lobby screen (main.js shows it while the round's phase is 'lobby').
  pickWeapon?.();
 }

 // The host takes the room to another map (v0.990a: the lobby's map picker):
 // everyone is told (they reload onto it and join the same code again), then
 // this page reloads onto it and opens the room again with its mode,
 // settings and added robots.
 // (`autoStart`: the map vote's mode, started there once everyone is back.)
 function moveRoom(id, { autoStart = null } = {}) {
  if (id === map.id || !multiplayerMaps(id).some(m => m.id === id)) return false;
  // A game server room moves itself; everyone (this page too) follows its moveMap.
  if (session?.role === 'client') return lead('map', { map: id });
  if (session?.role !== 'host') return false;
  const lobby = session.lobby(), robots = (lobby.players || []).filter(p => p.robot && !p.auto).map(p => p.setup || {});
  saveCarry({ mode: autoStart || lobby.mode, settings: lobby.settings, code, robots, via: 'p2p', autoStart, expect: session.playerCount });
  session.moveMap(id);
  const to = '?map=' + encodeURIComponent(id) + '&host=1&autohost=1';
  // (A moment for the message to leave before the page and its connections go.)
  setTimeout(() => { api.close(); showBusy(); location.href = to + devFlags; }, 350);
  return true;
 }

 const api = {
  request,
  moveRoom,
  // The JOIN page's list: the game server's open rooms ({ version, rooms } or null).
  async rooms() { const { fetchRooms } = await import('./net/socket-transport.js'); return fetchRooms(serverUrl); },
  get active() { return !!session; },
  get session() { return session; },
  get isHost() { return session?.role === 'host'; },
  // The host's lobby controls: this page hosts, or leads a game server room.
  get leads() { return leads(); },
  // On the game server (not peer-to-peer).
  get onServer() { return !!session?.transport?.server; },
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
  // FORFEIT (round modes; a team vote) and READY on the end-of-match card.
  forfeit(on = true) { session?.forfeit(on); },
  setReady(on = true) { session?.setReady(on); },
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
  // (`publicRoom`: an always-open room on the game server, where players cannot be removed.)
  lobby() { return session ? { ...session.lobby(), publicRoom: !!session.transport?.room?.public } : { players: [], spawnMode: 'random' }; },
  match() { return session ? session.match() : null; },
  // The storm now ({ plan, t }; storm.js), or null.
  stormNow() { return session?.stormNow?.() || null; },
  // The world's animals as the host has them (critters.js state), or null.
  critterState() { return session?.critterState?.() || null; },
  // (A game server room's leader sends each as a `lead` message; a refusal
  // comes back as a note, shown in frame().)
  kick(id) { return session?.role === 'host' ? session.kick(id) : lead('kick', { id }); },
  setSpawnMode(mode) { return session?.role === 'host' ? session.setSpawnMode(mode) : lead('setting', { key: 'spawnMode', value: mode }); },
  resetMap() { if (session?.role === 'host') session.resetMap(); else lead('reset'); },
  restartMatch() { if (session?.role === 'host') session.restartMatch(); else lead('restart'); },
  setSetting(key, value) { return session?.role === 'host' ? session.setSetting(key, value) : lead('setting', { key, value }); },
  setMode(mode) { pendingStart = null; return session?.role === 'host' ? session.setMode(mode) : lead('mode', { mode }); },
  startRound(mode) { return session?.role === 'host' ? session.startRound(mode) : lead('start', { mode }); },
  // START in the lobby: the map vote first (practice: straight in; the host
  // picked its map). On the game server the leader asks the server.
  startMatch(mode) { pendingStart = null; return session?.role === 'host' ? session.startVoting(mode) : lead('start', { mode }); },
  // The map vote under way ({ mode, left, total, maps }), or null; and a vote.
  voteNow() { return session?.voteNow?.() || null; },
  vote(mapId) { session?.vote?.(mapId); },
  // Why the host's last START was refused (a mode short of players, or too many).
  startError() { return session?.role === 'host' ? session.startError : null; },
  addRobot() { return session?.role === 'host' ? session.addRobot() : lead('robot'); },
  tuneRobot(id, setup) { return session?.role === 'host' ? session.tuneRobot(id, setup) : lead('tune', { id, setup }); },
  tuneAllRobots(setup) { return session?.role === 'host' ? session.tuneAllRobots(setup) : lead('tuneAll', { setup }); },
  // Team modes: the side you want (everyone, in the lobby).
  chooseTeam(team) { session?.chooseTeam(team); },
  endRound() { if (session?.role === 'host') session.endRound(); else lead('end'); },
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
   // The map vote chose another map (peer-to-peer host): everyone moves there.
   if (session.role === 'host' && session.pendingMove) { const move = session.pendingMove; session.pendingMove = null; toast('MOVING TO ' + (multiplayerMaps(move.map).find(m => m.id === move.map)?.name || 'THE NEW MAP').toUpperCase(), 3000); moveRoom(move.map, { autoStart: move.mode }); return; }
   if (pendingStart && session.role === 'host' && !session.ballot && (session.playerCount >= pendingStart.expect || performance.now() > pendingStart.until)) {
    const { mode } = pendingStart; pendingStart = null;
    if (!session.startRound(mode)) toast((session.startError || 'CANNOT START').toUpperCase());
   }
   // The game server's word to this page (a refused START, say).
   // (A long one, an admin's announcement, stays up long enough to read.)
   for (const note of session.transport?.notes?.splice(0) || []) if (note) toast(note.toUpperCase(), Math.min(9000, Math.max(1800, note.length * 65)));
   // The admins' messages (announcement, room, private): a card (ui/admin-message.js).
   for (const message of session.transport?.adminMessages?.splice(0) || []) adminCard ? adminCard(message) : message.text && toast(message.text.toUpperCase(), 6000);
   // The host moved the room to another map: follow it (reload onto it and join again).
   if (session.moveTo) { const to = '?map=' + encodeURIComponent(session.moveTo) + '&join=' + code + '&autojoin=1' + p2pFlag(); toast('MOVING TO ' + (multiplayerMaps(session.moveTo).find(m => m.id === session.moveTo)?.name || 'THE NEW MAP').toUpperCase(), 3000); api.close(); showBusy(); location.href = to + devFlags; return; }
   if (session.ended) { const why = session.ended; api.close(); toast(why.toUpperCase()); leave(); return; }
   const me = api.me;
   if (me && me.life !== lastLife) { lastLife = me.life; if (me.present) onRespawn?.(); }
   syncBadge();
  },
  close() {
   if (!session) return;
   try { session.close(); } catch {}
   session = null; code = null; badge.hidden = true; sim.otherPlayers = []; sim.shields = []; sim.worldAuthority = true; sim.critters = ownCritters;
   document.querySelector('.mode').textContent = 'PRACTICE';
  },
 };
 return api;
}
export { movementInput };
