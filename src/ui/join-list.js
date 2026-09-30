// The JOIN page's list of open games (owner, 2026-09-30): the game server's
// listed rooms (server/rooms.js), one or more for every map and mode, open to
// anyone. A row is a button: the map's picture on the left, the mode and the
// players (humans out of the room's seats) in the middle, the MAP NAME in
// capitals on the right. Clicking one joins it by its code. Above the list:
// a preferred map, a preferred mode and the order (fewest players first, or
// most first), remembered on this device. The list refreshes every few
// seconds while the JOIN page is open. Rooms made with HOST never show here;
// they are joined by their code.
import { cardImage } from './map-cards.js';
import { orderedModes } from './lobby-settings.js';
import { pickRooms, SORTS } from './join-rooms.js';

const esc = text => String(text ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const FILTER_KEY = 'deadstab-join-filters';
export const JOIN_LIST_REFRESH = 4000;
export function createJoinList(parent, { maps, fetchRooms, join, version }) {
 const modes = orderedModes().filter(m => m.id !== 'practice');
 const order = { mapOrder: maps.map(m => m.id), modeOrder: modes.map(m => m.id) };
 let picks = { map: 'any', mode: 'any', sort: 'fewest' };
 try { const saved = JSON.parse(localStorage.getItem(FILTER_KEY) || '{}') || {}; picks = { map: [ 'any', ...order.mapOrder ].includes(saved.map) ? saved.map : 'any', mode: [ 'any', ...order.modeOrder ].includes(saved.mode) ? saved.mode : 'any', sort: SORTS.some(s => s.id === saved.sort) ? saved.sort : 'fewest' }; } catch {}

 const root = document.createElement('section');
 root.className = 'join-list'; root.setAttribute('aria-label', 'Open games');
 const row = (key, label, choices) => '<div class="round-setting join-filter" data-filter="' + key + '"><span class="round-setting-label">' + label + '</span><div class="round-choices" role="group" aria-label="' + label + '">' + choices.map(c => '<button type="button" class="choice-button" data-choice="' + esc(c.id) + '" aria-pressed="false">' + esc(c.name) + '</button>').join('') + '</div></div>';
 root.innerHTML = '<h3 class="join-list-title">open games</h3><div class="round-settings join-filters">'
  + row('map', 'map', [{ id: 'any', name: 'ANY' }, ...maps.map(m => ({ id: m.id, name: m.name }))])
  + row('mode', 'mode', [{ id: 'any', name: 'ANY' }, ...modes.map(m => ({ id: m.id, name: m.name }))])
  + row('sort', 'players', SORTS)
  + '</div><div class="join-rooms" role="list"></div><p class="join-list-note" role="status" aria-live="polite"></p>';
 parent.append(root);
 const list = root.querySelector('.join-rooms'), note = root.querySelector('.join-list-note');

 const mark = () => { for (const group of root.querySelectorAll('[data-filter]')) for (const b of group.querySelectorAll('[data-choice]')) b.setAttribute('aria-pressed', String(b.dataset.choice === picks[group.dataset.filter])); };
 root.querySelector('.join-filters').addEventListener('click', e => {
  const b = e.target.closest('[data-choice]'); if (!b) return;
  picks = { ...picks, [b.closest('[data-filter]').dataset.filter]: b.dataset.choice };
  try { localStorage.setItem(FILTER_KEY, JSON.stringify(picks)); } catch {}
  mark(); draw();
 });
 list.addEventListener('click', e => { const b = e.target.closest('[data-code]'); if (b && !b.disabled) join(b.dataset.code); });

 let rooms = null, problem = '', shownKey = '', timer = null, asking = false;
 const art = new Map();
 const picture = id => { if (!art.has(id)) art.set(id, cardImage(id, '')); const image = art.get(id); return image ? image.cloneNode() : null; };
 function draw() {
  const shown = rooms ? pickRooms(rooms, picks, order) : [];
  note.textContent = problem || (rooms === null ? 'Looking for games…' : !shown.length ? (rooms.length ? 'No games match. Try ANY.' : 'No open games right now.') : '');
  const key = JSON.stringify(shown.map(r => [r.code, r.players, r.max, r.phase, r.mode, r.map]));
  if (key === shownKey) return;
  shownKey = key;
  list.replaceChildren(...shown.map(r => {
   const full = (r.players || 0) >= (r.max || 8);
   const b = document.createElement('button');
   b.type = 'button'; b.className = 'join-room plain-text'; b.dataset.code = r.code; b.disabled = full; b.setAttribute('role', 'listitem');
   const mode = modes.find(m => m.id === r.mode)?.name || r.modeName || r.mode;
   const mapName = maps.find(m => m.id === r.map)?.name || r.mapName || r.map;
   const state = full ? 'full' : r.phase === 'lobby' ? 'starting soon' : 'in a match';
   b.setAttribute('aria-label', 'Join ' + mode + ' on ' + mapName + ', ' + (r.players || 0) + ' of ' + (r.max || 8) + ' players, ' + state);
   b.innerHTML = '<span class="join-room-art"></span><span class="join-room-mid"><b>' + esc(mode) + '</b><small><em>' + (r.players || 0) + '/' + (r.max || 8) + '</em> players<br>' + state + '</small></span><span class="join-room-map">' + esc(String(mapName).toUpperCase()) + '</span>';
   const image = picture(r.map); if (image) b.querySelector('.join-room-art').append(image);
   return b;
  }));
 }
 async function refresh() {
  if (asking) return; asking = true;
  try {
   const reply = await fetchRooms();
   if (!reply) { problem = 'The game server can\'t be reached right now.'; rooms = rooms || []; }
   else if (version != null && reply.version != null && reply.version !== version) { problem = 'The game server has a newer version. Reload the page.'; rooms = []; }
   else { problem = ''; rooms = reply.rooms; }
  } finally { asking = false; }
  draw();
 }
 mark(); draw();
 return {
  root,
  get picks() { return { ...picks }; },
  // While the JOIN page is open (and the tab is visible): ask now, then every few seconds.
  // (Only while the list is on screen: a game joined from here, or by code, leaves the menu on this page underneath.)
  start() { if (timer) return; refresh(); timer = setInterval(() => { if (!document.hidden && root.getClientRects().length) refresh(); }, JOIN_LIST_REFRESH); },
  stop() { clearInterval(timer); timer = null; },
  refresh,
 };
}
