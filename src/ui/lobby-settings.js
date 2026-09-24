// The host's round settings as rows of choices (config/match.js SETTINGS),
// the same on the host setup page, the lobby screen and the lobby page of the
// pause menu. Only the host can change them; everyone else sees them. A
// setting that does nothing in the chosen mode is dimmed.
import { SETTINGS } from '../config/match.js';

export function createSettingsRows(container, { onChange } = {}) {
  container.classList.add('round-settings');
  container.innerHTML = Object.entries(SETTINGS).map(([key, s]) => `<div class="round-setting" data-key="${key}"><span class="round-setting-label">${s.label}</span><div class="round-choices" role="group" aria-label="${s.label}">${s.values.map((value, i) => `<button type="button" class="plain-text" data-value="${i}" aria-pressed="false">${s.names[i]}</button>`).join('')}</div></div>`).join('');
  let editable = true;
  for (const button of container.querySelectorAll('.round-choices button')) {
    button.onclick = () => {
      if (!editable) return;
      const key = button.closest('.round-setting').dataset.key, value = SETTINGS[key].values[Number(button.dataset.value)];
      onChange?.(key, value);
    };
  }
  return {
    render({ settings, mode, editable: canEdit }) {
      editable = !!canEdit;
      container.classList.toggle('round-settings-readonly', !editable);
      for (const row of container.querySelectorAll('.round-setting')) {
        const key = row.dataset.key, s = SETTINGS[key];
        row.classList.toggle('round-setting-off', !!mode && !s.modes.includes(mode));
        for (const button of row.querySelectorAll('button')) {
          const on = s.values[Number(button.dataset.value)] === settings[key];
          button.setAttribute('aria-pressed', String(on));
          button.disabled = !editable;
        }
      }
    },
  };
}
