// What a multiplayer game adds to the screen: the kill feed, the scoreboard
// (hold Tab, or the SCORES button on touch, with everyone's ping; the stats
// panel, stats-panel.js), the match
// clock (the end-of-match card is ui/match-end.js). Dying uses the same death screen as
// practice (death-screen.js). Styled like the rest of the menus
// (menu-theme.css): dark panels, the pink accent. Names are pink for everyone
// else and blue for you, in the feed and on the board, next to the player's
// colour (remote-players.js).
import { weapon as weaponById } from '../items.js';
import { teamById, respawnsClosed } from '../config/match.js';
import { playerColour } from '../remote-players.js';
import { createStatsPanel } from './stats-panel.js';

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
 if (!line.killer) return `${victims} <span class="feed-verb">${line.storm ? 'fell to the storm' : 'died'}</span>`;
 return `${who(line.killer, line.killerName)} <span class="feed-verb${line.oneShot ? ' feed-oneshot' : ''}">${line.oneShot ? 'one shot' : 'killed'}</span> ${victims}`;
}

export const pingText = ping => (ping === null || ping === undefined ? '…' : Math.round(ping) + ' ms');
export const swatch = slot => `<i class="player-swatch" style="--swatch:${playerColour(slot).swatch}" aria-hidden="true"></i>`;

// A side's chip (team modes): its colour and name.
export const teamChip = id => { const t = teamById(id); return t ? `<span class="board-team" style="--team:${t.colour}">${t.name.toLowerCase()}</span>` : ''; };
export function scoreboardRows(rows, myId) {
 return rows.map((r, i) => `<tr class="${r.id === myId ? 'board-you' : ''}${r.present ? '' : ' board-away'}"><td>${i + 1}</td><th scope="row">${swatch(r.slot)}${esc(r.name)}${teamChip(r.team)}${r.robot ? '<span class="board-robot">bot</span>' : ''}</th><td>${r.kills}</td><td>${r.deaths}</td><td>${r.dealt}</td><td>${r.taken}</td><td>${formatTime(r.time)}</td><td>${esc(weaponName(r.weapon))}</td><td class="board-ping">${r.robot ? '—' : pingText(r.ping)}</td></tr>`).join('');
}

// What the match clock shows for the host's match state (pure: tested).
// The clock only means something in a timed match (FFA): hidden in the lobby
// and in practice; "results" between the match and the lobby. The round
// modes have no clock (their `left` is 0: it used to read a red "0:00"):
// the round being played instead, as the BOTS score line has it, then each
// side's points. Respawns closed (config/match.js NO_RESPAWN_LEFT): a NO
// RESPAWNS mark beside the clock for the rest of the match, worked out from
// the clock and the mode the host already sends (nothing new on the wire).
// -> { html, shown, low (the last 30 s, red), closed }
export function clockView(match) {
 const timed = match.timed ?? (match.mode !== 'practice' && !match.elimination);
 const playing = match.phase === 'playing';
 const text = playing && timed ? formatTime(Math.ceil(match.left)) : playing && match.elimination ? 'round ' + (match.round || 1) : match.phase === 'results' ? 'results' : '';
 const closed = playing && timed && respawnsClosed(match.mode, match.left);
 // Team modes: each side's kills beside the clock ("RED 5 · 3 BLUE").
 // Elimination modes (v0.999a): each side's points, 1v1 each player's.
 const teams = playing && match.elimination && match.sides ? match.sides.map(t => `<span class="clock-team" data-side="${esc(t.id)}"${t.colour ? ` style="--team:${t.colour}"` : ''}>${esc(String(t.name).toLowerCase())} <b>${t.points}</b></span>`).join('<i>·</i>')
  : playing && match.teams ? match.teams.map(t => `<span class="clock-team" style="--team:${t.colour}">${esc(t.name.toLowerCase())} <b>${t.kills}</b></span>`).join('<i>·</i>') : '';
 const head = playing && match.elimination ? `<span class="clock-round">${esc(text)}</span>` : esc(text);
 const html = head + (closed ? '<span class="clock-note">no respawns</span>' : '') + (teams ? `<span class="clock-teams">${teams}</span>` : '');
 return { html, shown: !!text, low: playing && timed && match.left <= 30, closed };
}

export function createMultiplayerHud(root) {
 const feed = document.createElement('div');
 feed.id = 'kill-feed'; feed.className = 'kill-feed'; feed.setAttribute('aria-live', 'polite'); feed.hidden = true;
 // Tab's scoreboard: the stats panel, given the last match's mode, round and sides.
 const panel = createStatsPanel(root);
 panel.root.id = 'scoreboard';
 // The match clock, top centre under the health bar.
 const clock = document.createElement('div');
 clock.id = 'match-clock'; clock.className = 'match-clock'; clock.hidden = true; clock.setAttribute('aria-label', 'Time left in the match');
 const scores = document.createElement('button');
 scores.type = 'button'; scores.id = 'scores-toggle'; scores.className = 'icon-button plain-text'; scores.textContent = 'SCORES'; scores.hidden = true;
 root.append(feed, clock);
 document.querySelector('.top-actions')?.prepend(scores);
 let lines = [], boardOpen = false, rows = [], myId = null, clockText = '';
 // What the panel shows besides the rows: from the last setMatch (elimination: the sides' points).
 let boardMode = null, boardRound = 0, boardSides = null, boardFinal = false, boardFlip = null;
 const boardOpts = () => ({ rows, myId, mode: boardMode, sides: boardSides, round: boardRound, final: boardFinal, flip: boardFlip });
 const paint = () => { if (!boardOpen) return; panel.update(boardOpts()); };

 const api = {
  set active(on) { feed.hidden = !on; scores.hidden = !on; clock.hidden = !on; if (!on) { api.hideBoard(); lines = []; feed.replaceChildren(); } },
  // match: { phase, left, number, results } from the host.
  setMatch(match, me) {
   if (!match) return;
   // (Elimination, v0.999a: the round being played, in the scoreboard's title.)
   {
    const sides = match.elimination && match.sides ? match.sides.map(t => ({ id: t.id, name: t.name, colour: t.colour, points: t.points })) : null;
    // A side that scored while the board is up rolls its number.
    boardFlip = null;
    if (boardOpen && sides && boardSides) for (const t of sides) { const old = boardSides.find(o => o.id === t.id); if (old && t.points > old.points) boardFlip = { side: t.id, from: old.points, to: t.points }; }
    boardMode = match.mode; boardSides = sides; boardFinal = match.phase === 'results';
    boardRound = match.phase === 'playing' && match.elimination ? match.round || 1 : 0;
    paint();
   }
   const view = clockView(match);
   if (view.html !== clockText) { clockText = view.html; clock.innerHTML = view.html; clock.classList.toggle('match-clock-low', view.low); clock.classList.toggle('match-clock-closed', view.closed); }
   clock.style.visibility = view.shown ? '' : 'hidden';
   // (The end-of-match card is ui/match-end.js since 2026-09-29.)
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
  setBoard(list, me) { rows = list || []; myId = me; paint(); },
  showBoard() { boardOpen = true; boardFlip = null; panel.show(boardOpts()); },
  hideBoard() { boardOpen = false; boardFlip = null; panel.hide(); },
  get boardOpen() { return boardOpen; },
 };
 scores.onclick = () => (boardOpen ? api.hideBoard() : api.showBoard());
 return api;
}
