// Robot options in the menus (a preview: nothing here changes a game yet).
//
// Where robots will fit in: the host picks the mode and whether robots fill
// the empty slots (and how well they play) before opening a room and again in
// the lobby, where each empty slot also offers ADD ROBOT; solo, Gamemodes >
// 1V1 is you against a robot. Robots never join a room on their own: a room
// has them only when its host asks for them.
//
// The rows look and behave like the round settings (lobby-settings.js): a
// choice lights up when picked. They are marked SOON and are not read by
// anything; the only working robots are the developer tools' (bots/).
import { MODES } from '../config/match.js';

export const ROBOT_OPTIONS = Object.freeze({
 fill: { label: 'empty slots', names: ['stay empty', 'robots'], default: 0 },
 skill: { label: 'robot skill', names: ['easy', 'normal', 'hard'], default: 1 },
 weapon: { label: 'robot weapon', names: ['random', 'static', 'nominal', 'ballast'], default: 0 },
 mode: { label: 'mode', names: MODES.map(m => m.name), default: 0 },
});

const esc = text => String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// `keys`: which of ROBOT_OPTIONS to show, in order. Appends to `container`.
export function robotOptionRows(container, keys, { soon = true } = {}) {
 container.classList.add('round-settings', 'robot-options');
 const rows = keys.map(key => {
  const o = ROBOT_OPTIONS[key];
  return `<div class="round-setting robot-option" data-robot-option="${key}"><span class="round-setting-label">${esc(o.label)}${soon ? ' <span class="soon-tag">soon</span>' : ''}</span><div class="round-choices" role="group" aria-label="${esc(o.label)}">${o.names.map((name, i) => `<button type="button" class="plain-text" data-choice="${i}" aria-pressed="${i === o.default}">${esc(name)}</button>`).join('')}</div></div>`;
 }).join('');
 container.insertAdjacentHTML('beforeend', rows);
 // A pick lights up, and that is all.
 for (const group of container.querySelectorAll('.robot-option .round-choices')) {
  group.onclick = event => {
   const button = event.target.closest('button'); if (!button) return;
   for (const b of group.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b === button));
  };
 }
 return container;
}

// The lobby's empty slots: "empty · ADD ROBOT" rows under the players (the
// button does nothing yet).
export function emptySlotRows(count, canAdd) {
 return Array.from({ length: Math.max(0, count) }, () => `<li class="lobby-player lobby-empty"><span class="lobby-empty-dot" aria-hidden="true"></span><span class="lobby-name">empty slot</span>${canAdd ? '<button type="button" class="secondary plain-text lobby-add-robot" title="Robots in rooms are coming soon">+ ROBOT <span class="soon-tag">soon</span></button>' : ''}</li>`).join('');
}
