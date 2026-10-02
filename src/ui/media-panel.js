// The Media section of the developer tools (media mode: ui/media-mode.js),
// built into the floating window and the Settings panel's tools like the
// other sections: a dropdown with the on/off switch, the HUD presets, the
// look, the camera and the 9:16 guide, and a dropdown of what shows on screen.
// Every copy follows the one controller, so they never disagree.
import { MEDIA_ELEMENTS, MEDIA_PRESET_LABELS, MEDIA_LOOKS, MEDIA_ZOOMS, MEDIA_FOLLOWS, MEDIA_FRAMES, MEDIA_HOTKEY_LABEL } from './media-mode.js';

const SELECTS = [
 ['look', 'Best look', MEDIA_LOOKS],
 ['zoom', 'Camera', MEDIA_ZOOMS],
 ['follow', 'Camera follow', MEDIA_FOLLOWS],
 ['frame', 'Vertical (TikTok)', MEDIA_FRAMES],
];

export function buildMediaPanel(container, media, { doc = globalThis.document, open = false } = {}) {
 const el = (tag, className, text) => { const node = doc.createElement(tag); if (className) node.className = className; if (text != null) node.textContent = text; return node; };
 const section = el('details', 'dev-section dev-media'); section.dataset.devSection = 'media'; section.open = open;
 section.append(el('summary', null, 'Media'));
 const toggle = el('button', 'media-switch plain-text'); toggle.type = 'button'; toggle.dataset.mediaToggle = '';
 section.append(toggle, el('p', 'media-hint', MEDIA_HOTKEY_LABEL + ' turns it on and off · only your screen changes'));

 const presets = el('div', 'dev-row'); presets.append('HUD');
 const presetButtons = el('span', 'media-presets');
 for (const [name, label] of MEDIA_PRESET_LABELS) {
  const b = el('button', 'dev-row-button plain-text', label); b.type = 'button'; b.dataset.mediaPreset = name; presetButtons.append(b);
 }
 presets.append(presetButtons); section.append(presets);

 for (const [key, label, options] of SELECTS) {
  const row = el('label', 'dev-row'); row.append(label);
  const select = el('select'); select.dataset.mediaSelect = key;
  for (const [value, text] of options) { const o = el('option', null, text); o.value = value; select.append(o); }
  row.append(select); section.append(row);
 }

 const shown = el('details', 'dev-section'); shown.dataset.devSection = 'media-show';
 shown.append(el('summary', null, 'Show on screen'));
 for (const { id, label } of MEDIA_ELEMENTS) {
  const row = el('label', 'dev-row'); row.append(label);
  const box = el('input'); box.type = 'checkbox'; box.dataset.mediaShow = id; row.append(box); shown.append(row);
 }
 section.append(shown);
 container.prepend(section);

 const sync = () => {
  const s = media.settings;
  toggle.textContent = media.on ? 'MEDIA MODE ON' : 'MEDIA MODE OFF';
  toggle.setAttribute('aria-pressed', String(media.on));
  for (const b of presetButtons.querySelectorAll('[data-media-preset]')) b.setAttribute('aria-pressed', String(media.preset === b.dataset.mediaPreset));
  for (const select of section.querySelectorAll('[data-media-select]')) select.value = String(s[select.dataset.mediaSelect]);
  for (const box of section.querySelectorAll('[data-media-show]')) box.checked = !!s.show[box.dataset.mediaShow];
 };
 section.addEventListener('click', event => {
  const button = event.target.closest?.('button'); if (!button) return;
  if (button.dataset.mediaToggle !== undefined) media.toggle();
  else if (button.dataset.mediaPreset) media.usePreset(button.dataset.mediaPreset);
  else return;
  event.preventDefault(); button.blur(); // (Space fires: a focused button would press again)
 });
 section.addEventListener('change', event => {
  const t = event.target;
  if (t.dataset?.mediaShow) media.set('show.' + t.dataset.mediaShow, t.checked);
  else if (t.dataset?.mediaSelect) media.set(t.dataset.mediaSelect, t.dataset.mediaSelect === 'zoom' ? Number(t.value) : t.value);
 });
 media.onChange(sync);
 sync();
 return { section, sync };
}
