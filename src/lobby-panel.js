// The lobby during a round: a page of the pause menu (LOBBY, above LEAVE
// MULTIPLAYER), also reachable from the death screen. The game goes on behind
// it (you can be hit). Every player sees the room: its code, the mode and
// clock, and each player with their colour, a host tag and their ping, and the
// round settings. Only the host's page lets them be changed, and has the host
// controls: REMOVE a player, RESET MAP (every prop, crop, bloodstain and body
// back to the start) and END ROUND (everyone back to the lobby screen). The two
// resets ask for a second press.
import { formatTime, pingText, swatch } from './multiplayer-hud.js';
import { createSettingsRows } from './lobby-settings.js';
import { MODES } from './config/match.js';

const esc = text => String(text ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const CONFIRM_FOR = 3; // seconds a "press again" stays armed

export function createLobbyPanel(parent, { back, kick, setSetting, resetMap, endRound }) {
  const root = document.createElement('section');
  root.id = 'lobby-panel'; root.className = 'modal hidden'; root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-label', 'Lobby');
  root.innerHTML = `<div class="modal-card lobby-card"><h2>lobby</h2><p class="lobby-room"></p>
    <div class="lobby-heading">players</div><ul class="lobby-players"></ul>
    <div class="lobby-heading">settings</div><div class="lobby-settings"></div>
    <div class="lobby-host" hidden>
      <button type="button" id="lobby-reset-map" class="secondary">RESET MAP</button>
      <button type="button" id="lobby-end-round" class="secondary">END ROUND</button></div>
    <button type="button" id="lobby-back" class="secondary">BACK</button></div>`;
  parent.append(root);
  const $ = selector => root.querySelector(selector);
  let isHost = false;
  const settings = createSettingsRows($('.lobby-settings'), { onChange: (key, value) => isHost && setSetting(key, value) });
  $('#lobby-back').onclick = () => back();
  // Two-press buttons: the first press arms (label changes), the second acts.
  const armed = new Map();
  const twoStep = (button, label, confirm, action) => {
    button.onclick = () => {
      if (armed.get(button) > performance.now()) { armed.delete(button); button.textContent = label; action(); return; }
      armed.set(button, performance.now() + CONFIRM_FOR * 1000); button.textContent = confirm;
      setTimeout(() => { if (!(armed.get(button) > performance.now())) button.textContent = label; }, CONFIRM_FOR * 1000 + 50);
    };
  };
  twoStep($('#lobby-reset-map'), 'RESET MAP', 'PRESS AGAIN TO RESET', () => resetMap());
  twoStep($('#lobby-end-round'), 'END ROUND', 'PRESS AGAIN TO END', () => endRound());

  let rowsKey = '';
  const api = {
    root,
    get open() { return !root.classList.contains('hidden'); },
    show() { root.classList.remove('hidden'); $('#lobby-back').focus(); },
    hide() { root.classList.add('hidden'); },
    // lobby: { players: [{ id, name, slot, ping, host, present }], settings, mode }
    render({ lobby, match, code, isHost: host, myId, max }) {
      isHost = !!host;
      const players = lobby.players || [];
      const modeName = MODES.find(m => m.id === (match?.mode || lobby.mode))?.name || '';
      const left = match?.phase === 'playing' ? (match.mode === 'ffa' ? formatTime(Math.ceil(match.left)) + ' left' : '') : match?.phase || '';
      $('.lobby-room').textContent = ['room ' + (code || ''), modeName, players.length + '/' + max + ' players', left].filter(Boolean).join(' · ');
      // The rows are rebuilt only when who is here changes, so focus survives;
      // pings are updated in place.
      const key = isHost + '|' + players.map(p => p.id + ':' + p.slot + ':' + p.name).join(',');
      if (key !== rowsKey) {
        rowsKey = key;
        $('.lobby-players').innerHTML = players.map(p => `<li class="lobby-player" data-id="${esc(p.id)}">${swatch(p.slot)}<span class="lobby-name">${esc(p.name)}</span>${p.host ? '<span class="lobby-tag">host</span>' : ''}${p.id === myId ? '<span class="lobby-tag lobby-you">you</span>' : ''}<span class="lobby-ping"></span>${isHost && !p.host ? `<button type="button" class="secondary plain-text lobby-remove" aria-label="Remove ${esc(p.name)} from the game">REMOVE</button>` : ''}</li>`).join('');
        for (const button of root.querySelectorAll('.lobby-remove')) button.onclick = () => kick(button.closest('li').dataset.id);
      }
      for (const p of players) {
        const cell = root.querySelector(`.lobby-player[data-id="${CSS.escape(p.id)}"] .lobby-ping`);
        if (cell) cell.textContent = p.host ? '—' : pingText(p.ping);
      }
      settings.render({ settings: lobby.settings || {}, mode: match?.mode || lobby.mode, editable: isHost });
      $('.lobby-host').hidden = !isHost;
    },
  };
  return api;
}
