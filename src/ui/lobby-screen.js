// The lobby screen: where everyone waits between rounds (the round's phase is
// 'lobby'). It updates live: players arriving and leaving, their colour, host
// tag and ping. The host picks the mode (FFA, PRACTICE, 1V1, 2V2, 2V2V2,
// 3V3; a line under the modes says what it is and who fills it), the map and
// the settings (robots: fill the empty seats, and their skill), adds robots
// with + ROBOT on an empty seat (REMOVE takes one out), then STARTS the round.
// In a team round each player shows their side's colour. Everyone else sees the mode and the map, read-only, but not
// the settings (those are the host's). LEAVE leaves the room.
import { MODES, TEAMS, modeById, teamById } from '../config/match.js';
import { multiplayerMaps } from '../maps.js';
import { createSettingsRows } from './lobby-settings.js';
import { pingText, swatch } from './multiplayer-hud.js';
import { emptySlotRows } from './robot-options.js';
import { pickerHTML, mapGridHTML, wirePicker, weaponGridHTML, weaponFromChoice } from './weapon-grid.js';
import { WEAPONS } from '../items.js';
import { SKILL_LEVELS } from '../bots/robot-profile.js';

// TUNE on a robot's row (host, owner v138): its weapon (or random), skill,
// aim and temper, applied at once; APPLY TO ALL gives every robot (and the
// ones added after, + ROBOT and fill) the same.
export const TUNE_ROWS = Object.freeze([
 { key: 'skill', label: 'skill', choices: SKILL_LEVELS.map(id => [id, id]) },
 { key: 'aim', label: 'aim', choices: [['sloppier', 'sloppier'], ['even', 'as its skill'], ['sharper', 'sharper']] },
 { key: 'temper', label: 'temper', choices: [['calm', 'calm'], ['shifting', 'shifting'], ['aggressive', 'aggressive']] },
]);
const weaponValue = id => (id ? String(WEAPONS.findIndex(w => w.id === id) + 1) : '0');
function tunePanelHTML(p) {
 const setup = p.setup || {};
 const rows = TUNE_ROWS.map(r => `<div class="round-setting lobby-tune-row" data-tune="${r.key}"><span class="round-setting-label">${r.label}</span><div class="round-choices" role="group" aria-label="${r.label}">${r.choices.map(([v, t]) => `<button type="button" class="plain-text" data-choice="${v}" aria-pressed="${setup[r.key] === v}">${t}</button>`).join('')}</div></div>`).join('');
 return `<li class="lobby-tune-panel" data-for="${esc(p.id)}"><div class="round-setting lobby-tune-row" data-tune="weapon"><span class="round-setting-label">weapon</span>${pickerHTML('robot weapon', weaponGridHTML({ label: 'robot weapon', pressed: weaponValue(setup.weapon) }))}</div>${rows}<div class="lobby-tune-foot"><button type="button" class="secondary plain-text lobby-tune-all" title="Give every robot these settings">APPLY TO ALL</button><button type="button" class="secondary plain-text lobby-tune-done">DONE</button></div></li>`;
}

const esc = text => String(text ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// What each mode is, under the mode buttons (robots: SETTINGS.robots).
export const MODE_NOTES = Object.freeze({
 ffa: 'everyone for themselves · robots fill up to 4',
 practice: 'targets out, nothing counted · + robot to add sparring robots',
 '1v1': 'two players, one on one · a robot fills an empty seat',
 '2v2': 'two sides of two · robots fill empty seats',
 '2v2v2': 'three sides of two · robots fill empty seats',
 '3v3': 'two sides of three · robots fill empty seats',
});

export function createLobbyScreen(parent, { kick, setMode, setSetting, start, leave, copyInvite, addRobot, chooseTeam, tuneRobot, tuneAllRobots }) {
  const root = document.createElement('section');
  root.id = 'lobby-screen'; root.className = 'lobby-screen hidden'; root.setAttribute('role', 'dialog'); root.setAttribute('aria-label', 'Lobby');
  const maps = multiplayerMaps();
  root.innerHTML = `<div class="lobby-screen-card">
    <header class="lobby-screen-head"><h2>lobby</h2><button type="button" class="lobby-code plain-text" title="Copy an invite link"></button></header>
    <div class="lobby-columns">
      <div class="lobby-column"><div class="lobby-heading">players <span class="lobby-count"></span></div><ul class="lobby-players"></ul></div>
      <div class="lobby-column">
        <div class="lobby-heading">mode</div><div class="lobby-modes" role="group" aria-label="Mode">${MODES.map(m => `<button type="button" class="plain-text" data-mode="${m.id}" aria-pressed="false"${m.ready ? '' : ' data-later="1"'}>${m.name}</button>`).join('')}</div><p class="lobby-mode-note"></p>
        <div class="lobby-sides" hidden><div class="lobby-heading">your side</div><div class="lobby-side-choices" role="group" aria-label="Your side"></div></div>
        <div class="lobby-heading">map</div><div class="lobby-maps">${pickerHTML('map', mapGridHTML({ label: 'map', maps, pressed: maps[0]?.id }))}</div>
        <div class="lobby-heading lobby-settings-heading">settings</div><div class="lobby-settings"></div>
      </div>
    </div>
    <footer class="lobby-screen-foot"><button type="button" id="lobby-start" class="primary">START ROUND</button><p class="lobby-wait">waiting for the host to start the round</p><button type="button" id="lobby-leave" class="secondary">LEAVE</button></footer>
  </div>`;
  parent.append(root);
  const $ = selector => root.querySelector(selector);
  let lastArgs = null, isHost = false, mode = 'ffa', rowsKey = '', sideKey = '', tuning = null, tunePicker = null;
  const settings = createSettingsRows($('.lobby-settings'), { onChange: (key, value) => isHost && setSetting(key, value) });
  for (const button of root.querySelectorAll('[data-mode]')) button.onclick = () => { if (isHost && !button.dataset.later) setMode(button.dataset.mode); };
  // One map for now; picking it is already the only choice.
  // The map: a dropdown of map pictures (weapon-grid.js), like the SOLO page;
  // one map for now, so picking it is already the only choice.
  const mapPicker = wirePicker(root.querySelector('.lobby-maps .picker'));
  $('#lobby-start').onclick = () => isHost && start();
  $('#lobby-leave').onclick = () => leave();
  $('.lobby-code').onclick = () => copyInvite?.();

  const api = {
    root,
    get open() { return !root.classList.contains('hidden'); },
    show() { if (!api.open) { root.classList.remove('hidden'); (isHost ? $('#lobby-start') : $('#lobby-leave')).focus(); } },
    hide() { root.classList.add('hidden'); },
    // lobby: { players, settings, mode, map }; chosen: the host's pending mode.
    render(args) {
      lastArgs = args;
      const { lobby, code, isHost: host, myId, max, chosenMode } = args;
      isHost = !!host; mode = chosenMode || lobby.mode || 'ffa';
      const players = lobby.players || [];
      $('.lobby-code').textContent = 'room ' + (code || '');
      $('.lobby-count').textContent = players.length + '/' + max;

      if (tuning && (!isHost || !players.some(p => p.id === tuning && p.robot))) tuning = null;
      const key = isHost + '|' + max + '|' + tuning + '|' + players.map(p => p.id + ':' + p.slot + ':' + p.name + ':' + (p.team || '') + (p.robot ? ':' + JSON.stringify(p.setup || {}) : '')).join(',');
      if (key !== rowsKey) {
        rowsKey = key;
        const team = p => { const t = teamById(p.team); return t ? `<span class="lobby-tag lobby-team" style="--team:${t.colour}">${t.name.toLowerCase()}</span>` : ''; };
        $('.lobby-players').innerHTML = players.map(p => `<li class="lobby-player${p.robot ? ' lobby-robot' : ''}" data-id="${esc(p.id)}">${swatch(p.slot)}<span class="lobby-name">${esc(p.name)}</span>${p.host ? '<span class="lobby-tag">host</span>' : ''}${p.robot ? '<span class="lobby-tag">robot</span>' : ''}${team(p)}${p.id === myId ? '<span class="lobby-tag lobby-you">you</span>' : ''}<span class="lobby-ping"></span>${isHost && p.robot ? `<button type="button" class="secondary plain-text lobby-tune" aria-expanded="${tuning === p.id}" aria-label="Tune ${esc(p.name)}">TUNE</button>` : ''}${isHost && !p.host ? `<button type="button" class="secondary plain-text lobby-remove" aria-label="Remove ${esc(p.name)} from the game">REMOVE</button>` : ''}</li>${tuning === p.id ? tunePanelHTML(p) : ''}`).join('')
         + emptySlotRows((max || 0) - players.length, isHost);
        for (const button of root.querySelectorAll('.lobby-remove')) button.onclick = () => kick(button.closest('li').dataset.id);
        for (const button of root.querySelectorAll('.lobby-add-robot')) button.onclick = () => addRobot?.();
        for (const button of root.querySelectorAll('.lobby-tune')) button.onclick = () => { const id = button.closest('li').dataset.id; tuning = tuning === id ? null : id; rowsKey = ''; api.render(lastArgs); };
        const panel = $('.lobby-tune-panel');
        tunePicker = panel ? wirePicker(panel.querySelector('.picker')) : null; tunePicker?.sync();
        if (panel) {
          const robot = players.find(p => p.id === tuning), setup = { ...(robot?.setup || {}) };
          panel.onclick = event => {
            if (event.target.closest('.lobby-tune-all')) { tuneAllRobots?.(setup); return; }
            if (event.target.closest('.lobby-tune-done')) { tuning = null; rowsKey = ''; api.render(lastArgs); return; }
            const b = event.target.closest('[data-choice]'), row = b?.closest('[data-tune]'); if (!b || !row || b.disabled) return;
            setup[row.dataset.tune] = row.dataset.tune === 'weapon' ? weaponFromChoice(b.dataset.choice) : b.dataset.choice;
            tuneRobot?.(tuning, { ...setup });
          };
        }
      }
      for (const p of players) {
        const cell = root.querySelector(`.lobby-player[data-id="${CSS.escape(p.id)}"] .lobby-ping`);
        if (cell) cell.textContent = p.host || p.robot ? '—' : pingText(p.ping);
      }
      for (const button of root.querySelectorAll('[data-mode]')) {
        button.setAttribute('aria-pressed', String(button.dataset.mode === mode));
        button.disabled = !isHost || !!button.dataset.later;
      }
      $('.lobby-mode-note').textContent = MODE_NOTES[mode] || '';
      // Team modes: everyone picks a side (owner, v0.9b); a full side is greyed.
      const entry = modeById(mode), me = players.find(p => p.id === myId);
      $('.lobby-sides').hidden = !entry?.teams;
      if (entry?.teams) {
        const sides = TEAMS.slice(0, entry.teams), html = sides.map(t => { const n = players.filter(p => !p.robot && p.team === t.id).length; return `<button type="button" class="plain-text lobby-side" data-side="${t.id}" style="--team:${t.colour}" aria-pressed="${me?.team === t.id}"${n >= entry.per && me?.team !== t.id ? ' disabled' : ''}>${t.name.toLowerCase()} <small>${n}/${entry.per}</small></button>`; }).join('');
        // Compared with what was last written (innerHTML reads `disabled=""`
        // back, so comparing with it rebuilt the buttons every frame).
        if (sideKey !== html) {
          sideKey = html; $('.lobby-side-choices').innerHTML = html;
          for (const b of root.querySelectorAll('.lobby-side')) b.onclick = () => chooseTeam?.(b.getAttribute('aria-pressed') === 'true' ? null : b.dataset.side);
        }
      }
      const mapId = lobby.map || maps[0]?.id;
      for (const tile of root.querySelectorAll('.lobby-maps [data-choice]')) tile.setAttribute('aria-pressed', String(tile.dataset.choice === mapId));
      root.querySelector('.lobby-maps .picker-toggle').disabled = !isHost; if (!isHost) mapPicker.open(false);
      mapPicker.sync();
      settings.render({ settings: lobby.settings || {}, mode, editable: isHost });
      $('.lobby-settings').hidden = $('.lobby-settings-heading').hidden = !isHost;
      $('#lobby-start').hidden = !isHost; $('.lobby-wait').hidden = isHost;
    },
  };
  return api;
}
