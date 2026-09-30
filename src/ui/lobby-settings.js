// The host's round settings as rows of choices (config/match.js SETTINGS),
// the same on the host setup page, the lobby screen and the lobby page of the
// pause menu. Only the host can change them; everyone else sees them.
//
// Competitive menus (owner, 2026-09-29: "get rid of all the options involved
// in making games start and move most to dev tools"): the plain rows
// (PLAIN_SETTINGS: ROUNDS in the round modes, MATCH LENGTH in FFA) come
// first, each its lowercase label over a full-width bar of fitted buttons; a
// row that does nothing in the chosen mode is hidden, not dimmed. Every `dev`
// row sits in a "developer" group of its own (`.dev-only`: shown only while
// the developer tools are unlocked, body.dev-unlocked, menu-theme.css).
//
// Robots (owner, v147: simpler): one ROBOTS box (robots 'fill' when ticked,
// 'off' when not); the robot settings (skill here, + ROBOT and TUNE in the
// lobby, lobby-screen.js) show only while it is ticked.
import { SETTINGS, PLAIN_SETTINGS, MODES, defaultSettings } from '../config/match.js';

export const ROBOT_ONLY = Object.freeze(['robotSkill']);
export const DEV_SETTINGS = Object.freeze(Object.keys(SETTINGS).filter(key => SETTINGS[key].dev));
// The order the modes are offered in (owner, 2026-09-29): the round modes
// smallest first, then FFA and PRACTICE (host page and lobby).
export const MODE_ORDER = Object.freeze(['1v1', '2v2', '3v3', '4v4', '2v2v2', 'ffa', 'practice']);
export const orderedModes = () => [...MODES].sort((a, b) => MODE_ORDER.indexOf(a.id) - MODE_ORDER.indexOf(b.id));
// The rows a mode shows: its plain rows, and (unlocked) its developer rows.
export const rowsFor = (mode, { dev = false } = {}) => Object.keys(SETTINGS).filter(key => (dev || !SETTINGS[key].dev) && (!mode || SETTINGS[key].modes.includes(mode)));
// Endless is the ∞ sign (owner: "endless should be the infinity sign"), drawn:
// the fitted lettering (button-typography.js) stretched the glyph to the
// numbers' height and it read as "00". A heavy faceted mark instead (the ammo
// readout's), as tall as the numbers beside it; the button is named "endless".
export const INFINITY_MARK = '<svg class="infinity-mark" viewBox="0 0 44 22" aria-hidden="true" focusable="false"><path d="M22 11 14 4H8L4 8v6l4 4h6L30 4h6l4 4v6l-4 4h-6Z"/></svg>';
export const choiceLabel = name => (name === '∞' ? INFINITY_MARK : name);
export const choiceName = name => (name === '∞' ? ' aria-label="endless"' : '');
export const devUnlocked = () => !!globalThis.document?.body?.classList.contains('dev-unlocked');
// A room made while the tools are locked keeps every developer setting at
// its default (a value remembered from an earlier unlocked visit stays out).
export const withDevDefaults = (settings, unlocked = devUnlocked()) => {
  if (unlocked) return { ...settings };
  const base = defaultSettings(), out = { ...settings };
  for (const key of DEV_SETTINGS) out[key] = base[key];
  return out;
};

// The rows' markup: the plain rows, then the developer group.
export function settingsRowsHTML() {
  const choices = (key, s) => `<div class="round-setting" data-key="${key}"><span class="round-setting-label">${s.label}</span><div class="round-choices" role="group" aria-label="${s.label}">${s.values.map((value, i) => `<button type="button" class="choice-button" data-value="${i}" aria-pressed="false"${choiceName(s.names[i])}>${choiceLabel(s.names[i])}</button>`).join('')}</div></div>`;
  // (ROBOTS FILL SEATS is an ON | OFF row like the rest since 2026-09-30.)
  const row = key => choices(key, SETTINGS[key]);
  return PLAIN_SETTINGS.map(row).join('')
    + `<details class="dev-only round-dev"><summary>developer</summary><div class="round-settings round-dev-rows">${DEV_SETTINGS.map(row).join('')}</div></details>`;
}

export function createSettingsRows(container, { onChange } = {}) {
  container.classList.add('round-settings');
  container.innerHTML = settingsRowsHTML();
  let editable = true;
  for (const button of container.querySelectorAll('.round-choices button')) {
    button.onclick = () => {
      if (!editable) return;
      const key = button.closest('.round-setting').dataset.key, value = SETTINGS[key].values[Number(button.dataset.value)];
      onChange?.(key, value);
    };
  }
  return {
    // Returns how many plain rows show (0 in practice: the caller can hide its heading).
    render({ settings, mode, editable: canEdit }) {
      editable = !!canEdit;
      container.classList.toggle('round-settings-readonly', !editable);
      const robots = settings.robots !== 'off';
      let plain = 0;
      for (const row of container.querySelectorAll('.round-setting')) {
        const key = row.dataset.key, s = SETTINGS[key];
        row.hidden = (!!mode && !s.modes.includes(mode)) || (ROBOT_ONLY.includes(key) && !robots);
        if (!row.hidden && !s.dev) plain++;
        for (const button of row.querySelectorAll('button')) {
          const on = s.values[Number(button.dataset.value)] === settings[key];
          button.setAttribute('aria-pressed', String(on));
          button.disabled = !editable;
        }
      }
      container.classList.toggle('no-plain-settings', !plain);
      return plain;
    },
  };
}
