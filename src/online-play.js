// The multiplayer game as main.js sees it: going online from the menu, what
// the local simulation runs each tick, everyone else's shots and effects,
// the room badge, the host's player list, and leaving. The networking and the
// match rules live in net/; this file is the page glue.
import { NETWORK } from './config/network.js';
import { makeRoomCode, cleanRoomCode } from './net/transport.js';
import { movementInput, cleanName } from './net/protocol.js';
import { ProjectileMirror } from './net/projectiles.js';

const NAME_KEY = 'deadshift-username';
export const savedName = () => { try { return localStorage.getItem(NAME_KEY) || ''; } catch { return ''; } };
const saveName = name => { try { localStorage.setItem(NAME_KEY, name); } catch {} };

export function createOnlinePlay({ $, map, sim, createSim, start, toast, leave, server, pickWeapon }) {
 let session = null, code = null, lastLife = 0;
 const mirror = new ProjectileMirror();
 const badge = document.createElement('button');
 badge.id = 'online-badge'; badge.className = 'online-badge plain-text'; badge.hidden = true;
 badge.title = 'Copy an invite link';
 $('game').append(badge);
 badge.onclick = async () => {
  const link = location.origin + location.pathname + '?join=' + code;
  try { await navigator.clipboard.writeText(link); toast('INVITE LINK COPIED'); }
  catch { toast('ROOM CODE ' + code); }
 };
 // The host's player list, in the pause menu: everyone else in the room, each
 // with a REMOVE button that takes them out of the game (HostSession.kick).
 const roster = document.createElement('div');
 roster.id = 'online-players'; roster.className = 'online-players'; roster.hidden = true;
 $('pause-panel').querySelector('.modal-card').insertBefore(roster, $('main-menu'));
 let rosterKey = '';
 const syncRoster = () => {
  const list = session?.role === 'host' ? session.players() : [];
  const key = list.map(p => p.id).join(',');
  if (key === rosterKey) return;
  rosterKey = key; roster.hidden = !list.length; roster.replaceChildren();
  if (!list.length) return;
  const heading = document.createElement('div'); heading.className = 'online-players-heading'; heading.textContent = 'PLAYERS'; roster.append(heading);
  for (const player of list) {
   const row = document.createElement('div'); row.className = 'online-player';
   const name = document.createElement('span'); name.textContent = player.name;
   const kick = document.createElement('button'); kick.type = 'button'; kick.className = 'secondary plain-text online-player-remove';
   kick.textContent = 'REMOVE'; kick.setAttribute('aria-label', 'Remove ' + player.name + ' from the game');
   kick.onclick = () => { if (session?.kick(player.id)) syncRoster(); };
   row.append(name, kick); roster.append(row);
  }
 };
 let shownCount = 0;
 const syncBadge = () => {
  if (!session) { badge.hidden = true; return; }
  const count = session.playerCount;
  if (count === shownCount && !badge.hidden) return;
  shownCount = count; badge.hidden = false;
  badge.textContent = (session.role === 'host' ? 'ROOM ' : 'MULTIPLAYER · ROOM ') + code + ' · ' + count + '/' + NETWORK.maxPlayers;
 };

 async function request({ role, code: typed, name: typedName, password = '' }, status) {
  const name = cleanName(typedName);
  if (!name) throw new Error('Enter a username first.');
  saveName(name);
  // Multiplayer runs on Deadwater. From anywhere else (the tutorial map)
  // reload onto it and carry on there; the password is typed again there.
  if (map.training || map.id !== 'deadwater') {
   location.href = '?' + (role === 'host' ? 'host=1' : 'join=' + encodeURIComponent(typed || ''));
   return;
  }
  code = role === 'host' ? makeRoomCode() : cleanRoomCode(typed);
  if (!code) throw new Error('Room codes are ' + NETWORK.codeLength + ' letters and numbers.');
  status(role === 'host' ? 'Opening room…' : 'Finding room ' + code + '…');
  const { goOnline } = await import('./net/online.js');
  const joined = await goOnline({ role: role === 'host' ? 'host' : 'client', code, map, local: sim, createSim, server, name, password });
  if (role !== 'host') {
   // Wait for the host to let us in (or turn us away) before leaving the menu.
   const deadline = performance.now() + 8000;
   while (!joined.welcomed && !joined.ended && performance.now() < deadline) await new Promise(r => setTimeout(r, 50));
   if (!joined.welcomed) { joined.close(); throw new Error(joined.ended || 'The host did not let us in.'); }
  }
  session = joined; shownCount = 0; lastLife = 0;
  sim.dev = { speed: 1 }; sim.targets = [];
  status('');
  try { history.replaceState(null, '', '?map=deadwater&online=' + (role === 'host' ? 'host' : 'join')); } catch {}
  await start('static');
  document.querySelector('.mode').textContent = 'MULTIPLAYER';
  toast(role === 'host' ? 'ROOM ' + code + ' IS OPEN' : 'JOINED ROOM ' + code);
  syncBadge();
  pickWeapon();
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
   if (session.role === 'host') { const s = session.hostSeat; return { present: s.present, dead: s.dead, life: s.life, respawnIn: s.respawnIn, name: s.name }; }
   return session.me;
  },
  // The input the local simulation runs this tick.
  input(raw) {
   if (!session) return raw;
   return session.role === 'client' ? session.input(raw) : session.beforeLocal(raw);
  },
  // After the local simulation has stepped: the host runs everyone else.
  afterStep() { if (session?.role === 'host') session.step(); },
  choose(weapon) { session?.choose(weapon); },
  toMenu() { session?.toMenu(); },
  others(alpha) { return session ? session.others(alpha) : null; },
  // Everyone else's projectiles, for drawing (net/projectiles.js).
  foreign() {
   if (!session) return null;
   if (session.role === 'client') return session.foreignProjectiles();
   mirror.update(session.remoteProjectiles(), performance.now() / 1000);
   return mirror.lists(performance.now() / 1000);
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
   syncBadge(); syncRoster();
  },
  close() {
   if (!session) return;
   try { session.close(); } catch {}
   session = null; code = null; badge.hidden = true; sim.otherPlayers = []; sim.worldAuthority = true; syncRoster();
   document.querySelector('.mode').textContent = 'PRACTICE';
  },
 };
 return api;
}
export { movementInput };
