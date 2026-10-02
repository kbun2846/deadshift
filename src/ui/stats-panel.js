// The stats panel: Tab's scoreboard and the end-of-match list (owner: "a newly
// designed stat menu that is vertical ... essentially same data as when you
// press tab in game", "on the team games in the leaderboards there should be
// color coded by team, but should be organized top to down by most kills to
// least. It should be easy to read", "in ffa the players at end are ordered
// most to least kills, with a first and second place prize shown with just a
// background color of their position").
//
// One narrow, tall card, one player a row, everyone in ONE list ranked by
// kills (never grouped by side). A team game's row carries its side's colour
// as a stripe on the left edge and a faint tint; an FFA match's first and
// second place get pale gold and silver backgrounds (only when `final`).
// Under the name: deaths, damage dealt and taken, time, most used weapon,
// ping (what is known). At the top the title, the round, and (elimination)
// the round score in the side colours, one number able to roll up.
//
// Bigger and easier to read (owner, 2026-09-29: "make scoreboard bigger and
// easier to read ... include the top down fitted text where it makes
// sense"): the title, the round score, each rank, name and kill count are in
// the menus' stretched display lettering (`.stats-fit`: the text drawn
// narrow and tall like a fitted button's, in a box sized for it, names
// cut off with an ellipsis); the small line of stats under a name stays
// plain text so its numbers read at a glance.
//
// Pure helpers (`sortStatsRows`, `statsTableHTML`) have no DOM; `document` is
// only touched inside createStatsPanel. Styled at the end of menu-theme.css.
import { weapon as weaponById } from '../items.js';
import { teamById } from '../config/match.js';
import { playerColour } from '../remote-players.js';
import { gunStandings, ladderText } from '../gungame.js';

const esc = text => String(text ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clock = seconds => { const s = Math.max(0, Math.round(seconds)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
const num = n => (Number.isFinite(n) ? Math.round(n) : null);

// Most kills first, then fewer deaths, then more damage dealt, then name.
// `first`: the id of an FFA match's last one standing when it ended early
// (respawns closed, config/match.js NO_RESPAWN_LEFT): a tie on kills goes to
// them (net/arena.js results.survivor, duel.js outcome.survivor), so they
// head the list among those tied for the most kills.
export function sortStatsRows(rows, first = null) {
 // Gun Game's rows (a `gun` level each): by the ladder (gungame.js).
 if ((rows || []).some(r => Number.isFinite(r.gun))) return gunStandings(rows);
 const list = [...(rows || [])].sort((a, b) => (b.kills || 0) - (a.kills || 0) || (a.deaths || 0) - (b.deaths || 0) || (b.dealt || 0) - (a.dealt || 0)
  || String(a.name ?? '').toLowerCase().localeCompare(String(b.name ?? '').toLowerCase()));
 const i = first == null ? -1 : list.findIndex(r => r.id === first);
 if (i > 0 && (list[i].kills || 0) > 0 && (list[i].kills || 0) === (list[0].kills || 0)) list.unshift(...list.splice(i, 1));
 return list;
}

// A stat under the name: the number bright, its word dim.
const stat = (n, word) => `<span class="stats-stat"><i>${n}</i>${word ? ' ' + word : ''}</span>`;

// The list alone (also embedded in the end-of-match card). `mode` 'ffa' with
// `final` marks first and second place; a list with no sides and no mode
// counts as FFA too. Rows are ranked here, so callers may pass any order.
export function statsTableHTML(rows, { myId = null, mode = null, final = false, first = null } = {}) {
 const list = sortStatsRows(rows, first);
 const medals = !!final && mode !== 'practice' && (mode === 'ffa' || mode === 'gungame' || (!mode && !list.some(r => r.team)));
 return '<ol class="stats-list">' + list.map((r, i) => {
  const side = teamById(r.team), classes = ['stats-row'];
  if (r.id === myId) classes.push('stats-you');
  if (r.present === false) classes.push('stats-away');
  if (side) classes.push('stats-team');
  if (medals && i < 2) classes.push(i ? 'stats-silver' : 'stats-gold');
  const style = side ? ` style="--team:${side.colour};--tint:${side.colour}26"` : '';
  const bits = [];
  const deaths = num(r.deaths), dealt = num(r.dealt), taken = num(r.taken);
  // Gun Game: the big number is the place on the ladder ("4/8", the weapon
  // under the name is the one reached); kills join the line.
  const ladder = Number.isFinite(r.gun) && r.of > 0;
  if (ladder) bits.push(stat(num(r.kills) ?? 0, r.kills === 1 ? 'kill' : 'kills'));
  if (deaths !== null) bits.push(stat(deaths, deaths === 1 ? 'death' : 'deaths'));
  if (dealt !== null) bits.push(stat(dealt, 'dealt'));
  if (taken !== null) bits.push(stat(taken, 'taken'));
  if (Number.isFinite(r.time)) bits.push(stat(clock(r.time)));
  const gun = weaponById(r.weapon)?.name; if (gun) bits.push(stat(esc(gun)));
  if (!r.robot && r.present !== false && Number.isFinite(r.ping)) bits.push(stat(Math.round(r.ping), 'ms'));
  return `<li class="${classes.join(' ')}"${style}${side ? ` data-team="${esc(r.team)}"` : ''}><span class="stats-rank"><span class="stats-fit"><i>${i + 1}</i></span></span>`
   + `<span class="stats-who"><span class="stats-name"><i class="player-swatch" style="--swatch:${playerColour(r.slot).swatch}" aria-hidden="true"></i><span class="stats-fit stats-name-fit"><span class="stats-name-text${r.id === myId ? ' feed-you' : ''}">${esc(r.name)}</span></span>${r.robot ? '<span class="stats-robot">bot</span>' : ''}</span>`
   + (bits.length ? `<span class="stats-line">${bits.join('')}</span>` : '') + '</span>'
   + (ladder ? `<span class="stats-kills stats-ladder"><span class="stats-fit stats-fit-end"><b>${esc(ladderText(r.gun, r.of))}</b></span><small>${r.finished ? 'finished' : 'weapon'}</small></span></li>`
    : `<span class="stats-kills"><span class="stats-fit stats-fit-end"><b>${num(r.kills) ?? 0}</b></span><small>kills</small></span></li>`);
 }).join('') + '</ol>';
}

// The round score under the title: each side in its colour, name then points.
// `flip` ({ side, from, to }): that side's number rolls from -> to.
function sidesHTML(sides, flip) {
 if (!sides?.length) return '';
 return '<div class="stats-sides">' + sides.map(s => {
  const rolling = flip && flip.side === s.id;
  const value = rolling ? `<span class="stats-roll"><i class="stats-old">${esc(flip.from)}</i><i class="stats-new">${esc(flip.to)}</i></span>` : esc(s.points ?? 0);
  return `<span class="stats-side" data-side="${esc(s.id)}"${s.colour ? ` style="--team:${esc(s.colour)}"` : ''}><em class="stats-fit"><i>${esc(String(s.name ?? '').toUpperCase())}</i></em><b${rolling ? ' class="stats-changed"' : ''}>${value}</b></span>`;
 }).join('<span class="stats-dash"></span>') + '</div>';
}

export function createStatsPanel(parent) {
 const root = document.createElement('section');
 root.id = 'stats-panel'; root.className = 'stats-panel hidden'; root.setAttribute('aria-label', 'Scoreboard');
 root.innerHTML = '<header class="stats-head"><h2 class="stats-title"><span class="stats-fit"><span class="stats-title-text">SCOREBOARD</span></span><span class="stats-round" hidden></span></h2><div class="stats-score"></div></header><div class="stats-scroll"></div>';
 parent.append(root);
 const title = root.querySelector('.stats-title-text'), round = root.querySelector('.stats-round'), score = root.querySelector('.stats-score'), scroll = root.querySelector('.stats-scroll');
 let shown = { title: '', round: '', score: '', list: '' }, flip = null;

 // Redraws only what changed (Tab's board is refreshed every tick: the list
 // keeps its scroll and a rolling number is not restarted). `again` replays a roll.
 function draw(opts, again) {
  const { rows, myId = null, mode = null, sides = null, final = false, place = 'center' } = opts;
  if (opts.flip) flip = opts.flip;
  else if (flip && !(sides || []).some(s => s.id === flip.side && s.points === flip.to)) flip = null;
  root.dataset.place = place === 'left' ? 'left' : 'center';
  const want = { title: final ? 'MATCH OVER' : 'SCOREBOARD', round: opts.round ? 'ROUND ' + opts.round : '', score: sidesHTML(sides, flip), list: statsTableHTML(rows, { myId, mode, final }) };
  if (again || want.title !== shown.title) title.textContent = want.title;
  if (again || want.round !== shown.round) { round.textContent = want.round; round.hidden = !want.round; }
  if (again || want.score !== shown.score) { score.innerHTML = want.score; score.hidden = !want.score; }
  if (again || want.list !== shown.list) { const top = scroll.scrollTop; scroll.innerHTML = want.list; scroll.scrollTop = top; }
  root.classList.toggle('stats-final', !!final);
  shown = want;
 }
 return {
  root,
  get open() { return !root.classList.contains('hidden'); },
  show(opts = {}) { flip = null; draw(opts, true); root.classList.remove('hidden'); },
  update(opts = {}) { if (!root.classList.contains('hidden')) draw(opts, false); },
  hide() { root.classList.add('hidden'); flip = null; },
 };
}
