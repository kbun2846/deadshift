// What a multiplayer game adds to the screen: the kill feed, the scoreboard
// (hold Tab, or the SCORES button on touch, with everyone's ping), the match
// clock and the results between matches. Dying uses the same death screen as
// practice (death-screen.js). Styled like the rest of the menus
// (menu-theme.css): dark panels, the pink accent. Names are pink for everyone
// else and blue for you, in the feed and on the board, next to the player's
// colour (remote-players.js).
import { weapon as weaponById } from '../items.js';
import { teamById } from '../config/match.js';
import { playerColour } from '../remote-players.js';

const FEED_LIFE = 6;       // seconds a kill-feed line stays up
const FEED_MAX = 5;

const esc = text => String(text ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const formatTime = seconds => { const s = Math.max(0, Math.round(seconds)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
const weaponName = id => weaponById(id)?.name || '—';

// One kill-feed line as HTML: "Killer killed A, B", "Killer one shot A" (from
// full health to dead in one hit) or "Name died".
export function feedLine(line, myId) {
 const who = (id, name) => `<span class="${id === myId ? 'feed-you' : 'feed-enemy'}">${esc(name)}</span>`;
 const victims = line.victims.map((id, i) => who(id, line.victimNames[i])).join(', ');
 if (!line.killer) return `${victims} <span class="feed-verb">died</span>`;
 return `${who(line.killer, line.killerName)} <span class="feed-verb${line.oneShot ? ' feed-oneshot' : ''}">${line.oneShot ? 'one shot' : 'killed'}</span> ${victims}`;
}

export const pingText = ping => (ping === null || ping === undefined ? '…' : Math.round(ping) + ' ms');
export const swatch = slot => `<i class="player-swatch" style="--swatch:${playerColour(slot).swatch}" aria-hidden="true"></i>`;

// A side's chip (team modes): its colour and name.
export const teamChip = id => { const t = teamById(id); return t ? `<span class="board-team" style="--team:${t.colour}">${t.name.toLowerCase()}</span>` : ''; };
export function scoreboardRows(rows, myId) {
 return rows.map((r, i) => `<tr class="${r.id === myId ? 'board-you' : ''}${r.present ? '' : ' board-away'}"><td>${i + 1}</td><th scope="row">${swatch(r.slot)}${esc(r.name)}${teamChip(r.team)}${r.robot ? '<span class="board-robot">robot</span>' : ''}</th><td>${r.kills}</td><td>${r.deaths}</td><td>${r.dealt}</td><td>${r.taken}</td><td>${formatTime(r.time)}</td><td>${esc(weaponName(r.weapon))}</td><td class="board-ping">${r.robot ? '—' : pingText(r.ping)}</td></tr>`).join('');
}

export function createMultiplayerHud(root) {
 const feed = document.createElement('div');
 feed.id = 'kill-feed'; feed.className = 'kill-feed'; feed.setAttribute('aria-live', 'polite'); feed.hidden = true;
 const board = document.createElement('section');
 board.id = 'scoreboard'; board.className = 'scoreboard hidden'; board.setAttribute('aria-label', 'Scoreboard');
 board.innerHTML = '<div class="scoreboard-card"><h2>scoreboard</h2><table><thead><tr><th>#</th><th>player</th><th>kills</th><th>deaths</th><th>dmg dealt</th><th>dmg taken</th><th>time</th><th>weapon</th><th>ping</th></tr></thead><tbody></tbody></table><p class="scoreboard-hint">ranked by kills · most used weapon</p></div>';
 // The match clock, top centre under the health bar, and the results card
 // shown for a few seconds when the clock runs out.
 const clock = document.createElement('div');
 clock.id = 'match-clock'; clock.className = 'match-clock'; clock.hidden = true; clock.setAttribute('aria-label', 'Time left in the match');
 const results = document.createElement('section');
 results.id = 'match-results'; results.className = 'match-results hidden'; results.setAttribute('role', 'dialog'); results.setAttribute('aria-label', 'Match results');
 results.innerHTML = '<div class="modal-card"><h2>match over</h2><p class="match-winner"></p><table><thead><tr><th>#</th><th>player</th><th>kills</th><th>deaths</th></tr></thead><tbody></tbody></table><p class="match-next"></p></div>';
 const scores = document.createElement('button');
 scores.type = 'button'; scores.id = 'scores-toggle'; scores.className = 'icon-button plain-text'; scores.textContent = 'SCORES'; scores.hidden = true;
 root.append(feed, board, clock, results);
 document.querySelector('.top-actions')?.prepend(scores);
 let lines = [], boardOpen = false, rows = [], myId = null, clockText = '', resultsKey = '';

 const api = {
  set active(on) { feed.hidden = !on; scores.hidden = !on; clock.hidden = !on; if (!on) { api.hideBoard(); results.classList.add('hidden'); resultsKey = ''; lines = []; feed.replaceChildren(); } },
  // match: { phase, left, number, results } from the host.
  setMatch(match, me) {
   if (!match) return;
   // The clock only means something in a timed round (ffa): hidden in the
   // lobby and in practice; "results" between the round and the lobby.
   const timed = match.mode !== 'practice';
   const text = match.phase === 'playing' && timed ? formatTime(Math.ceil(match.left)) : match.phase === 'results' ? 'results' : '';
   // Team modes: each side's kills beside the clock ("RED 5 · 3 BLUE").
   const teams = match.phase === 'playing' && match.teams ? match.teams.map(t => `<span class="clock-team" style="--team:${t.colour}">${esc(t.name.toLowerCase())} <b>${t.kills}</b></span>`).join('<i>·</i>') : '';
   const html = esc(text) + (teams ? `<span class="clock-teams">${teams}</span>` : '');
   if (html !== clockText) { clockText = html; clock.innerHTML = html; clock.classList.toggle('match-clock-low', match.phase === 'playing' && match.left <= 30); }
   clock.style.visibility = text ? '' : 'hidden';
   const showing = match.phase === 'results' && match.results;
   results.classList.toggle('hidden', !showing);
   if (!showing) { resultsKey = ''; return; }
   const key = match.number + ':' + Math.ceil(match.left);
   if (key === resultsKey) return; resultsKey = key;
   const { winner, board: rows } = match.results;
   const mine = rows.find(r => r.id === me)?.team;
   results.querySelector('.match-winner').innerHTML = winner?.team
    ? `<span style="color:${teamById(winner.team)?.colour}">${esc(winner.name.toLowerCase())}</span> wins with ${winner.kills} kill${winner.kills === 1 ? '' : 's'}${mine ? (mine === winner.team ? ' · your side' : ' · not your side') : ''}`
    : winner ? `${swatch(rows.find(r => r.id === winner.id)?.slot)}<span class="${winner.id === me ? 'feed-you' : 'feed-enemy'}">${esc(winner.name)}</span> wins with ${winner.kills} kill${winner.kills === 1 ? '' : 's'}` : match.results.draw ? 'a draw' : 'no kills: nobody wins';
   results.querySelector('tbody').innerHTML = rows.map((r, i) => `<tr class="${r.id === me ? 'board-you' : ''}"><td>${i + 1}</td><th scope="row">${swatch(r.slot)}${esc(r.name)}${teamChip(r.team)}</th><td>${r.kills}</td><td>${r.deaths}</td></tr>`).join('');
   results.querySelector('.match-next').textContent = 'next match in ' + Math.max(0, Math.ceil(match.left));
  },
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
 };
 scores.onclick = () => (boardOpen ? api.hideBoard() : api.showBoard());
 return api;
}
