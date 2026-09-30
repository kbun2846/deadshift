// The map vote (owner, 2026-09-30): when the host presses START (every mode
// but practice), everyone picks a map here, like the weapon pick: the same
// see-through card, a timer at the top, one card per map with its picture.
// Each card shows its vote count on the picture (the number flips over when
// it changes) and, under it, the names of whoever voted for it. Clicking a
// card votes for it; clicking another moves the vote. The host's side
// (host-session.js) closes it when time runs out or everyone has voted; the
// most votes wins and a tie is a coin toss.
import { multiplayerMaps } from '../maps.js';
import { cardImage } from './map-cards.js';
import { modeById } from '../config/match.js';

const esc = text => String(text ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function createMapVote(parent, { vote, map = null }) {
  const root = document.createElement('section');
  root.id = 'map-vote'; root.className = 'map-vote hidden'; root.setAttribute('role', 'dialog'); root.setAttribute('aria-label', 'Vote for the map');
  const maps = multiplayerMaps(map);
  root.innerHTML = `<div class="map-vote-card">
    <header class="map-vote-head"><span class="map-vote-title">vote map <small class="map-vote-mode"></small></span><span class="map-vote-timer" role="timer"><b>12</b><i aria-hidden="true"><s></s></i></span></header>
    <div class="map-vote-grid">${maps.map(m => `<div class="map-vote-slot" data-map="${esc(m.id)}"><button type="button" class="map-vote-choice plain-text" data-map="${esc(m.id)}" aria-pressed="false" aria-label="Vote for ${esc(m.name)}"><span class="map-vote-art"></span><span class="map-vote-count" aria-live="polite"><b>0</b></span><span class="map-vote-name">${esc(m.name)}</span></button><ul class="map-vote-names"></ul></div>`).join('')}</div>
    <p class="map-vote-note">most votes wins · a tie is a coin toss</p>
  </div>`;
  parent.append(root);
  const $ = selector => root.querySelector(selector);
  for (const slot of root.querySelectorAll('.map-vote-slot')) {
    const picture = cardImage(slot.dataset.map, '');
    if (picture) slot.querySelector('.map-vote-art').append(picture);
  }
  let mine = null, shownKey = '';
  const counts = new Map();
  for (const button of root.querySelectorAll('.map-vote-choice')) button.onclick = () => { mine = button.dataset.map; mark(); vote(mine); };
  const mark = () => { for (const button of root.querySelectorAll('.map-vote-choice')) button.setAttribute('aria-pressed', String(button.dataset.map === mine)); };

  const api = {
    root,
    get open() { return !root.classList.contains('hidden'); },
    get mine() { return mine; },
    // A new vote: nobody's pick carried over from the last one.
    show() { if (api.open) return; mine = null; mark(); counts.clear(); shownKey = ''; root.classList.remove('hidden'); root.querySelector('.map-vote-choice')?.focus(); },
    hide() { root.classList.add('hidden'); },
    // `state`: host-session.js voteNow() ({ mode, left, total, maps: [{ id, votes, names }] }).
    render(state) {
      if (!state) return;
      $('.map-vote-mode').textContent = modeById(state.mode)?.name || '';
      const left = Math.max(0, state.left);
      $('.map-vote-timer b').textContent = String(Math.ceil(left));
      $('.map-vote-timer s').style.transform = `scaleX(${Math.min(1, left / (state.total || 12))})`;
      root.classList.toggle('map-vote-hurry', left <= 3);
      const key = JSON.stringify(state.maps);
      if (key === shownKey) return;
      shownKey = key;
      for (const entry of state.maps) {
        const slot = root.querySelector(`.map-vote-slot[data-map="${CSS.escape(entry.id)}"]`); if (!slot) continue;
        const count = slot.querySelector('.map-vote-count'), number = count.querySelector('b');
        // The number flips over to its new value (a vote added or taken back).
        if (counts.has(entry.id) && counts.get(entry.id) !== entry.votes) { count.classList.remove('map-vote-flip'); void count.offsetWidth; count.classList.add('map-vote-flip'); }
        counts.set(entry.id, entry.votes);
        number.textContent = String(entry.votes);
        count.classList.toggle('map-vote-none', !entry.votes);
        slot.querySelector('.map-vote-names').innerHTML = entry.names.map(name => `<li>${esc(name)}</li>`).join('');
      }
    },
  };
  return api;
}
