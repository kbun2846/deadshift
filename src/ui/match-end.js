// The end of a match (competitive overhaul, owner 2026-09-29: "after a match
// ends there should be a play again option, where it shows each player's name
// in an end game score menu and it allows players to ready up. Players can
// either ready up or press (leave). For bots, it should show this menu except
// should just have a button saying start ... there should be a way to quickly
// enter a change settings menu before resuming ... most menus should be the
// same kind of menu with 1 or 2 different buttons").
//
// One card for online and SOLO: a title line (who won), the score under it,
// the stats table (stats-panel.js statsTableHTML, final) and a row of
// buttons, which is all that differs:
//  online  READY n/m (a switch: online.setReady; robots never hold it up),
//          LEAVE, and for the host LOBBY (back to the lobby to change the
//          mode or map). The card goes when the host's round leaves 'results'.
//  SOLO    START (a new match, same settings), CHANGE SETTINGS (the bots
//          page with the same picks), QUIT.
// This replaces duel.js's old result card and multiplayer-hud.js's results
// card (hidden in CSS until its code goes).
import { statsTableHTML } from './stats-panel.js';
import { teamById } from '../config/match.js';

const esc = text => String(text ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const tinted = (text, colour) => (colour ? `<span style="color:${colour}">${esc(text)}</span>` : esc(text));

// The title and score line for the host's results (arena.js `results`), seen
// by `myId` (on `myTeam` in a team mode). Returns { title, detail } as HTML.
export function onlineOutcome(results, { myId = null, myTeam = null } = {}) {
 if (!results) return { title: 'match over', detail: '' };
 const { winner, sides } = results;
 let title;
 if (winner?.team) { const t = teamById(winner.team); title = winner.team === myTeam ? 'your team wins' : `${tinted(String(t?.name || winner.name).toLowerCase(), t?.colour)} team wins`; }
 else if (winner) title = winner.id === myId ? 'you win' : `${esc(winner.name)} wins`;
 else title = results.draw ? 'draw' : 'no winner';
 const score = (sides || []).map(s => `${tinted(s.team ? String(s.name).toLowerCase() : s.name, s.team ? teamById(s.id)?.colour : null)} <b>${s.points}</b>`).join(' <i>·</i> ');
 let forfeit = '';
 if (results.forfeit != null) {
  const side = (sides || []).find(s => s.id === results.forfeit);
  forfeit = results.forfeit === myTeam || results.forfeit === myId ? (side?.team ? 'your team forfeited' : 'you forfeited')
   : side ? `${side.team ? String(side.name).toLowerCase() + ' team' : esc(side.name)} forfeited` : 'forfeit';
 }
 return { title, detail: [score, forfeit].filter(Boolean).join(' <i>·</i> ') };
}

// SOLO: `winner` 'you' / 'robot', the score, whether you forfeited, a team mode.
export function soloOutcome({ winner, you = 0, robot = 0, forfeited = false, team = false, ffa = false }) {
 // FFA: most kills when the clock runs out (a tie at the top is a draw).
 if (ffa) return { title: winner === 'you' ? 'you win' : winner === 'draw' ? 'draw' : 'robots win', detail: `you <b>${you}</b> <i>·</i> <b>${robot}</b> top robot` };
 const title = winner === 'you' ? (team ? 'your team wins' : 'you win') : (team ? 'enemies win' : 'robot wins');
 const [mine, theirs] = team ? ['your team', 'enemies'] : ['you', 'robot'];
 return { title, detail: `${mine} <b>${you}</b> <i>·</i> <b>${robot}</b> ${theirs}${forfeited ? ` <i>·</i> ${team ? 'your team forfeited' : 'you forfeited'}` : ''}` };
}

// READY's label: how many of the people in the room are ready.
export const readyLabel = (ready, people) => (people > 1 ? `READY ${ready}/${people}` : 'READY');

// `act(id)`: a button was pressed (its id: 'ready', 'leave', 'lobby',
// 'start', 'settings', 'quit').
export function createMatchEnd(parent, { act } = {}) {
 const root = document.createElement('section');
 root.id = 'match-end'; root.className = 'match-end hidden'; root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-labelledby', 'match-end-title');
 root.innerHTML = '<div class="match-end-card"><h2 id="match-end-title"></h2><p class="match-end-detail"></p><div class="match-end-table"></div><div class="match-end-actions"></div></div>';
 parent.append(root);
 const $ = s => root.querySelector(s);
 let shown = { title: null, detail: null, table: null, buttons: null };
 root.addEventListener('click', e => { const b = e.target.closest?.('button[data-act]'); if (b) act?.(b.dataset.act); });
 const put = (key, sel, html, prop = 'innerHTML') => { if (shown[key] === html) return false; shown[key] = html; $(sel)[prop] = html; return true; };
 const api = {
  root,
  get open() { return !root.classList.contains('hidden'); },
  // { title, detail (HTML), rows, myId, mode, buttons: [{ id, label, pressed }] }.
  // Called again while open, only what changed is redrawn.
  show({ title, detail = '', rows = [], myId = null, mode = null, buttons = [] }) {
   const opening = !api.open;
   put('title', '#match-end-title', title);
   put('detail', '.match-end-detail', detail);
   put('table', '.match-end-table', statsTableHTML(rows, { myId, mode, final: true }));
   const html = buttons.map(b => `<button type="button" data-act="${esc(b.id)}"${b.pressed !== undefined ? ` aria-pressed="${!!b.pressed}"` : ''} class="${b.primary ? 'primary' : 'secondary'}">${esc(b.label)}</button>`).join('');
   const redrawn = put('buttons', '.match-end-actions', html);
   root.classList.remove('hidden'); document.body.classList.add('match-end-open');
   if (opening || redrawn) {
    const focused = document.activeElement?.dataset?.act;
    (root.querySelector(`button[data-act="${focused}"]`) || (opening ? root.querySelector('button') : null))?.focus();
   }
  },
  hide() { if (!api.open) return; root.classList.add('hidden'); document.body.classList.remove('match-end-open'); shown = { title: null, detail: null, table: null, buttons: null }; },
 };
 return api;
}
