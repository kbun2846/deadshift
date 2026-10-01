// Settings > Mobile: the touch layout lives here rather than on the game screen.
// Editing needs the controls on screen: in a match it closes the menus and
// edits over the running game; from the main menu it edits over a still frame
// of the map (preview(), see main.js) and comes back here when done.
// The tab's rows (layout tools first, then button opacity, aim assist and
// vibration as choice bars) are index.html markup since the 2026-09-30 redesign.
import { twoPress } from './two-press.js';
const byId = id => document.getElementById(id);

// state() -> { started, paused, deathActive, touchPrompts }
export function installMobileSettings({ touchLayout, closeSettings, setPaused, state, arrange, preview }) {
 function sync() {
  const { deathActive, touchPrompts } = state();
  arrange();
  byId('touch-swap-sides').setAttribute('aria-pressed', String(touchLayout.swapped));
  byId('touch-edit-layout').disabled = !(!deathActive && touchPrompts);
  // One short line: how to get the editor when it is off, else what SWAP does.
  byId('touch-edit-note').textContent = !touchPrompts ? 'Pick mobile on the title screen to edit the layout.' : 'Swap sides mirrors the stick and the buttons.';
 }
 byId('touch-edit-layout').onclick = () => {
  const { started, paused, touchPrompts } = state();
  if (!touchPrompts) return;
  if (!started) { preview?.(); return; }
  closeSettings(); if (paused) setPaused(false);
  touchLayout.start();
 };
 byId('touch-swap-sides').onclick = () => { touchLayout.swapSides(); sync(); };
 // Resetting throws away a hand-made layout: two presses.
 twoPress(byId('touch-reset-layout'), () => { touchLayout.reset(); sync(); }, { confirm: 'PRESS AGAIN' });
 return { sync };
}
