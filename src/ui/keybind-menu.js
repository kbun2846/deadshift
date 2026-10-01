// Settings > Controls > KEYBOARD (owner, v147): every game key, grouped, each
// a button showing its key. Click it (or E on it), press the new key: done.
// Esc cancels; a key another action uses swaps the two (and says so); Esc,
// Tab and the mouse buttons are fixed and shown greyed. RESET KEYS (two
// presses) puts every key back. The bindings themselves: config/keybinds.js.
import { twoPress } from './two-press.js';
import { KEY_ACTIONS, KEY_GROUPS, FIXED_KEYS, RESERVED, setBind, resetBinds, bindOf, keyName } from '../config/keybinds.js';

const esc = t => String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const label = id => KEY_ACTIONS.find(a => a.id === id)?.label || id;

export function buildKeybindMenu(container, { onChange, before = null } = {}) {
 const box = document.createElement('div');
 // Keyboard players only (pc-only: hidden on a phone or tablet without a
 // mouse, settings-panel.js). A long label keeps its main words and drops
 // the bracketed part ("weapon action (orbs, grenade, ...)") into a smaller line.
 box.className = 'keybinds pc-only';
 const name = text => { const at = text.indexOf(' ('); return at < 0 ? esc(text) : esc(text.slice(0, at)) + '<small>' + esc(text.slice(at + 2, text.endsWith(')') ? -1 : undefined)) + '</small>'; };
 box.innerHTML = `<div class="settings-heading">keyboard</div>
  <p class="settings-note">Click a key, then press the new one. <kbd>Esc</kbd> cancels.</p>
  ${KEY_GROUPS.map(([g, title]) => `<div class="keybind-group"><div class="keybind-group-title">${esc(title)}</div>${KEY_ACTIONS.filter(a => a.group === g).map(a => `<div class="keybind-row"><span class="keybind-label">${name(a.label)}</span><button type="button" class="keybind-key plain-text" data-action="${a.id}" aria-label="${esc(a.label)}: change key"></button></div>`).join('')}</div>`).join('')}
  <div class="keybind-group keybind-fixed"><div class="keybind-group-title">fixed</div>${FIXED_KEYS.map(([what, key]) => `<div class="keybind-row"><span class="keybind-label">${name(what)}</span><span class="keybind-key keybind-locked">${esc(key)}</span></div>`).join('')}</div>
  <p class="keybind-status settings-note" role="status" aria-live="polite"></p>
  <button type="button" class="secondary keybind-reset">RESET KEYS</button>`;
 if (before) container.insertBefore(box, before); else container.prepend(box);
 const status = box.querySelector('.keybind-status');
 let listening = null;
 const render = () => {
  for (const b of box.querySelectorAll('button.keybind-key')) {
   const on = b === listening;
   b.classList.toggle('listening', on);
   b.textContent = on ? 'PRESS A KEY' : keyName(bindOf(b.dataset.action));
   b.setAttribute('aria-pressed', String(on));
  }
 };
 const stop = () => { listening = null; render(); };
 box.addEventListener('click', e => {
  const b = e.target.closest('button.keybind-key');
  if (b) { e.preventDefault(); listening = listening === b ? null : b; status.textContent = listening ? 'Press a key for ' + label(b.dataset.action) + ' (Esc cancels).' : ''; render(); return; }
 });
 // While listening, the next key is the answer, before menus or the game see it.
 const take = e => {
  if (!listening) return;
  e.preventDefault(); e.stopImmediatePropagation();
  if (e.type !== 'keydown' || e.repeat) return;
  const id = listening.dataset.action;
  if (e.code === 'Escape') { status.textContent = ''; stop(); listening = null; box.querySelector(`[data-action="${id}"]`)?.focus(); return; }
  if (RESERVED.has(e.code)) { status.textContent = keyName(e.code) + ' is kept for ' + (e.code === 'Tab' ? 'the scoreboard' : 'the browser or pause') + '. Pick another key.'; return; }
  const swapped = setBind(id, e.code);
  if (swapped === false) return;
  status.textContent = label(id) + ': ' + keyName(e.code) + (swapped ? ' · ' + label(swapped) + ' is now ' + keyName(bindOf(swapped)) : '');
  const button = listening; stop(); button.focus(); onChange?.();
 };
 window.addEventListener('keydown', take, true);
 window.addEventListener('keyup', take, true);
 // Clicking anywhere else, or leaving the panel, stops listening.
 document.addEventListener('pointerdown', e => { if (listening && !box.contains(e.target)) stop(); }, true);
 // RESET KEYS takes two presses (it undoes every change at once).
 twoPress(box.querySelector('.keybind-reset'), () => { resetBinds(); stop(); status.textContent = 'Every key is back to its default.'; onChange?.(); });
 render();
 return { render, stop, get listening() { return !!listening; } };
}
