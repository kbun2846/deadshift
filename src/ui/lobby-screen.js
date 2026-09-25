// The lobby screen: where everyone waits between rounds (the round's phase is
// 'lobby'). It updates live: players arriving and leaving, their colour, host
// tag and ping. The host picks the mode (FFA or PRACTICE; 1V1, 2V2, 2V2V2 and
// 3V3 are listed but cannot be started yet), the map and the settings, then
// STARTS the round. Everyone else sees the mode and the map, read-only, but not
// the settings (those are the host's). LEAVE leaves the room.
import { MODES } from '../config/match.js';
import { multiplayerMaps } from '../maps.js';
import { createSettingsRows } from './lobby-settings.js';
import { pingText, swatch } from './multiplayer-hud.js';
import { robotOptionRows, emptySlotRows } from './robot-options.js';

const esc = text => String(text ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function createLobbyScreen(parent, { kick, setMode, setSetting, start, leave, copyInvite }) {
  const root = document.createElement('section');
  root.id = 'lobby-screen'; root.className = 'lobby-screen hidden'; root.setAttribute('role', 'dialog'); root.setAttribute('aria-label', 'Lobby');
  const maps = multiplayerMaps();
  root.innerHTML = `<div class="lobby-screen-card">
    <header class="lobby-screen-head"><h2>lobby</h2><button type="button" class="lobby-code plain-text" title="Copy an invite link"></button></header>
    <div class="lobby-columns">
      <div class="lobby-column"><div class="lobby-heading">players <span class="lobby-count"></span></div><ul class="lobby-players"></ul></div>
      <div class="lobby-column">
        <div class="lobby-heading">mode</div><div class="lobby-modes" role="group" aria-label="Mode">${MODES.map(m => `<button type="button" class="plain-text" data-mode="${m.id}" aria-pressed="false"${m.ready ? '' : ' data-later="1"'}>${m.name}</button>`).join('')}</div>
        <div class="lobby-heading">map</div><div class="lobby-maps" role="group" aria-label="Map">${maps.map(m => `<button type="button" class="plain-text" data-map="${m.id}" aria-pressed="false">${esc(m.name)}</button>`).join('')}<button type="button" class="plain-text lobby-map-soon" disabled aria-disabled="true">coming soon</button></div>
        <div class="lobby-heading lobby-settings-heading">settings</div><div class="lobby-settings"></div>
        <div class="lobby-heading lobby-robots-heading">robots</div><div class="lobby-robots"></div>
      </div>
    </div>
    <footer class="lobby-screen-foot"><button type="button" id="lobby-start" class="primary">START ROUND</button><p class="lobby-wait">waiting for the host to start the round</p><button type="button" id="lobby-leave" class="secondary">LEAVE</button></footer>
  </div>`;
  parent.append(root);
  const $ = selector => root.querySelector(selector);
  let isHost = false, mode = 'ffa', rowsKey = '';
  const settings = createSettingsRows($('.lobby-settings'), { onChange: (key, value) => isHost && setSetting(key, value) });
  // Robots (a preview: robot-options.js): fill the empty slots, and how well they play.
  robotOptionRows($('.lobby-robots'), ['fill', 'skill']);
  for (const button of root.querySelectorAll('[data-mode]')) button.onclick = () => { if (isHost && !button.dataset.later) setMode(button.dataset.mode); };
  // One map for now; picking it is already the only choice.
  for (const button of root.querySelectorAll('[data-map]')) button.onclick = () => {};
  $('#lobby-start').onclick = () => isHost && start();
  $('#lobby-leave').onclick = () => leave();
  $('.lobby-code').onclick = () => copyInvite?.();

  const api = {
    root,
    get open() { return !root.classList.contains('hidden'); },
    show() { if (!api.open) { root.classList.remove('hidden'); (isHost ? $('#lobby-start') : $('#lobby-leave')).focus(); } },
    hide() { root.classList.add('hidden'); },
    // lobby: { players, settings, mode, map }; chosen: the host's pending mode.
    render({ lobby, code, isHost: host, myId, max, chosenMode }) {
      isHost = !!host; mode = chosenMode || lobby.mode || 'ffa';
      const players = lobby.players || [];
      $('.lobby-code').textContent = 'room ' + (code || '');
      $('.lobby-count').textContent = players.length + '/' + max;
      const key = isHost + '|' + max + '|' + players.map(p => p.id + ':' + p.slot + ':' + p.name).join(',');
      if (key !== rowsKey) {
        rowsKey = key;
        $('.lobby-players').innerHTML = players.map(p => `<li class="lobby-player" data-id="${esc(p.id)}">${swatch(p.slot)}<span class="lobby-name">${esc(p.name)}</span>${p.host ? '<span class="lobby-tag">host</span>' : ''}${p.id === myId ? '<span class="lobby-tag lobby-you">you</span>' : ''}<span class="lobby-ping"></span>${isHost && !p.host ? `<button type="button" class="secondary plain-text lobby-remove" aria-label="Remove ${esc(p.name)} from the game">REMOVE</button>` : ''}</li>`).join('')
         + emptySlotRows((max || 0) - players.length, isHost);
        for (const button of root.querySelectorAll('.lobby-remove')) button.onclick = () => kick(button.closest('li').dataset.id);
      }
      for (const p of players) {
        const cell = root.querySelector(`.lobby-player[data-id="${CSS.escape(p.id)}"] .lobby-ping`);
        if (cell) cell.textContent = p.host ? '—' : pingText(p.ping);
      }
      for (const button of root.querySelectorAll('[data-mode]')) {
        button.setAttribute('aria-pressed', String(button.dataset.mode === mode));
        button.disabled = !isHost || !!button.dataset.later;
      }
      for (const button of root.querySelectorAll('[data-map]')) { button.setAttribute('aria-pressed', String(button.dataset.map === (lobby.map || maps[0]?.id))); button.disabled = !isHost; }
      settings.render({ settings: lobby.settings || {}, mode, editable: isHost });
      $('.lobby-settings').hidden = $('.lobby-settings-heading').hidden = $('.lobby-robots').hidden = $('.lobby-robots-heading').hidden = !isHost;
      $('#lobby-start').hidden = !isHost; $('.lobby-wait').hidden = isHost;
    },
  };
  return api;
}
