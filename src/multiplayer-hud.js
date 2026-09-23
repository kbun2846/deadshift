// What a multiplayer game adds to the screen: the kill feed, the scoreboard
// (hold Tab, or the SCORES button on touch) and the death card with its
// respawn countdown. Styled like the rest of the menus (menu-theme.css):
// dark panels, the pink accent. Names are pink for everyone else and blue for
// you, in the feed and on the board.
import { weapon as weaponById } from './items.js';

const FEED_LIFE = 6;       // seconds a kill-feed line stays up
const FEED_MAX = 5;

const esc = text => String(text ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const formatTime = seconds => { const s = Math.max(0, Math.round(seconds)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
const weaponName = id => weaponById(id)?.name || '—';

// One kill-feed line as HTML: "Killer killed A, B" or "Name died".
export function feedLine(line, myId) {
 const who = (id, name) => `<span class="${id === myId ? 'feed-you' : 'feed-enemy'}">${esc(name)}</span>`;
 const victims = line.victims.map((id, i) => who(id, line.victimNames[i])).join(', ');
 if (!line.killer) return `${victims} <span class="feed-verb">died</span>`;
 return `${who(line.killer, line.killerName)} <span class="feed-verb">killed</span> ${victims}`;
}

export function scoreboardRows(rows, myId) {
 return rows.map((r, i) => `<tr class="${r.id === myId ? 'board-you' : ''}${r.present ? '' : ' board-away'}"><td>${i + 1}</td><th scope="row">${esc(r.name)}</th><td>${r.kills}</td><td>${r.deaths}</td><td>${r.dealt}</td><td>${r.taken}</td><td>${formatTime(r.time)}</td><td>${esc(weaponName(r.weapon))}</td></tr>`).join('');
}

export function createMultiplayerHud(root, { changeWeapon, leave }) {
 const feed = document.createElement('div');
 feed.id = 'kill-feed'; feed.className = 'kill-feed'; feed.setAttribute('aria-live', 'polite'); feed.hidden = true;
 const board = document.createElement('section');
 board.id = 'scoreboard'; board.className = 'scoreboard hidden'; board.setAttribute('aria-label', 'Scoreboard');
 board.innerHTML = '<div class="scoreboard-card"><h2>scoreboard</h2><table><thead><tr><th>#</th><th>player</th><th>kills</th><th>deaths</th><th>dmg dealt</th><th>dmg taken</th><th>time</th><th>weapon</th></tr></thead><tbody></tbody></table><p class="scoreboard-hint">ranked by kills · most used weapon</p></div>';
 const death = document.createElement('section');
 death.id = 'mp-death'; death.className = 'mp-death hidden'; death.setAttribute('role', 'dialog'); death.setAttribute('aria-label', 'You died');
 death.innerHTML = '<div class="modal-card"><h2>you died</h2><p class="mp-death-by"></p><p class="mp-death-timer"></p><button type="button" id="mp-change-weapon" class="secondary">CHANGE WEAPON</button><button type="button" id="mp-leave" class="secondary">LEAVE MULTIPLAYER</button></div>';
 const scores = document.createElement('button');
 scores.type = 'button'; scores.id = 'scores-toggle'; scores.className = 'icon-button plain-text'; scores.textContent = 'SCORES'; scores.hidden = true;
 root.append(feed, board, death);
 document.querySelector('.top-actions')?.prepend(scores);
 death.querySelector('#mp-change-weapon').onclick = () => changeWeapon();
 death.querySelector('#mp-leave').onclick = () => leave();
 let lines = [], boardOpen = false, rows = [], myId = null;

 const api = {
  death,
  set active(on) { feed.hidden = !on; scores.hidden = !on; if (!on) { api.hideBoard(); api.hideDeath(); lines = []; feed.replaceChildren(); } },
  addFeed(entries, me, now) {
   myId = me;
   for (const line of entries) lines.push({ html: feedLine(line, me), at: now });
   lines = lines.slice(-FEED_MAX); api.renderFeed(now, true);
  },
  renderFeed(now, force = false) {
   const before = lines.length;
   lines = lines.filter(l => now - l.at < FEED_LIFE);
   if (!force && before === lines.length) return;
   feed.innerHTML = lines.map(l => `<div class="kill-feed-line">${l.html}</div>`).join('');
  },
  setBoard(list, me) { rows = list || []; myId = me; if (boardOpen) board.querySelector('tbody').innerHTML = scoreboardRows(rows, myId); },
  showBoard() { boardOpen = true; board.classList.remove('hidden'); board.querySelector('tbody').innerHTML = scoreboardRows(rows, myId); },
  hideBoard() { boardOpen = false; board.classList.add('hidden'); },
  get boardOpen() { return boardOpen; },
  // Who killed you: set when the kill-feed line arrives, whether or not the
  // card is up yet (the card and the line can arrive in either order).
  setKiller(killer) { death.querySelector('.mp-death-by').innerHTML = killer ? `killed by <span class="feed-enemy">${esc(killer)}</span>` : 'you took yourself out'; },
  showDeath() { death.classList.remove('hidden'); },
  setTimer(seconds) { death.querySelector('.mp-death-timer').textContent = seconds > 0 ? 'respawning in ' + Math.ceil(seconds) : 'respawning…'; },
  hideDeath() { death.classList.add('hidden'); death.querySelector('.mp-death-by').textContent = ''; },
  get deathOpen() { return !death.classList.contains('hidden'); },
 };
 scores.onclick = () => (boardOpen ? api.hideBoard() : api.showBoard());
 return api;
}
