// The online game as main.js sees it: going online from the menu, what the
// local simulation runs each tick while online, the room badge, and leaving.
// The networking itself lives in net/; this file is the page glue.
import { NETWORK } from './config/network.js';
import { makeRoomCode, cleanRoomCode } from './net/transport.js';
import { movementInput } from './net/protocol.js';

export function createOnlinePlay({ $, map, sim, createSim, start, toast, leave, server }) {
 let session = null, code = null;
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
  badge.textContent = (session.role === 'host' ? 'ROOM ' : 'ONLINE · ROOM ') + code + ' · ' + count + '/' + NETWORK.maxPlayers;
 };

 async function request({ role, code: typed }, status) {
  // Online play runs on the practice town. From anywhere else (the tutorial
  // map) reload onto it and carry on there.
  if (map.training || map.id !== 'deadwater') {
   location.href = '?' + (role === 'host' ? 'host=1' : 'join=' + encodeURIComponent(typed || ''));
   return;
  }
  code = role === 'host' ? makeRoomCode() : cleanRoomCode(typed);
  if (!code) throw new Error('Room codes are ' + NETWORK.codeLength + ' letters and numbers.');
  status(role === 'host' ? 'Opening room…' : 'Finding room ' + code + '…');
  const { goOnline } = await import('./net/online.js');
  const joined = await goOnline({ role: role === 'host' ? 'host' : 'client', code, map, local: sim, createSim, server });
  if (role !== 'host') {
   // Wait for the host to let us in (or turn us away) before leaving the menu.
   const deadline = performance.now() + 8000;
   while (!joined.welcomed && !joined.ended && performance.now() < deadline) await new Promise(r => setTimeout(r, 50));
   if (!joined.welcomed) { joined.close(); throw new Error(joined.ended || 'The host did not let us in.'); }
  }
  session = joined; shownCount = 0;
  sim.dev = { speed: 1 };
  status('');
  try { history.replaceState(null, '', '?map=deadwater&online=' + (role === 'host' ? 'host' : 'join')); } catch {}
  await start('static');
  document.querySelector('.mode').textContent = 'ONLINE';
  toast(role === 'host' ? 'ROOM ' + code + ' IS OPEN' : 'JOINED ROOM ' + code);
  syncBadge();
 }

 return {
  request,
  get active() { return !!session; },
  get session() { return session; },
  // The input the local simulation runs this tick.
  input(raw) {
   if (!session) return raw;
   return session.role === 'client' ? session.input(raw) : movementInput(raw);
  },
  // After the local simulation has stepped: the host runs everyone else.
  afterStep() { if (session?.role === 'host') session.step(); },
  others(alpha) { return session ? session.others(alpha) : null; },
  // Once per frame: messages for the player, and ending if the link is gone.
  frame() {
   if (!session) return;
   for (const notice of session.drainNotices()) toast(notice.toUpperCase());
   if (session.ended) { const why = session.ended; this.close(); toast(why.toUpperCase()); leave(); return; }
   syncBadge(); syncRoster();
  },
  close() {
   if (!session) return;
   try { session.close(); } catch {}
   session = null; code = null; badge.hidden = true; sim.otherPlayers = []; syncRoster();
   document.querySelector('.mode').textContent = 'PRACTICE';
  },
 };
}
