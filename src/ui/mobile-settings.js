import { fullscreenSupported, isStandalone } from './mobile-browser.js';
// Settings > Mobile: the touch layout lives here rather than on the game screen.
// Editing needs the controls on screen: in a match it closes the menus and
// edits over the running game; from the main menu it edits over a still frame
// of the map (preview(), see main.js) and comes back here when done.
const byId = id => document.getElementById(id);

// state() -> { started, paused, deathActive, touchPrompts }
export function installMobileSettings({ touchLayout, closeSettings, setPaused, state, arrange, preview }) {
 function sync() {
  const { started, deathActive, touchPrompts } = state();
  arrange();
  byId('touch-swap-sides').setAttribute('aria-pressed', String(touchLayout.swapped));
  byId('touch-edit-layout').disabled = !(!deathActive && touchPrompts);
  byId('touch-edit-note').textContent = !touchPrompts ? 'Switch to mobile controls to edit the layout.' : '';
 }
 byId('touch-edit-layout').onclick = () => {
  const { started, paused, touchPrompts } = state();
  if (!touchPrompts) return;
  if (!started) { preview?.(); return; }
  closeSettings(); if (paused) setPaused(false);
  touchLayout.start();
 };
 byId('touch-swap-sides').onclick = () => { touchLayout.swapSides(); sync(); };
 byId('touch-reset-layout').onclick = () => { touchLayout.reset(); sync(); };
 // The layout tools come first (on a phone in landscape anything lower starts
 // below the fold); the other touch options follow under their own heading.
 const heading = document.createElement('div'); heading.className = 'settings-heading'; heading.textContent = 'TOUCH PLAY';
 byId('touch-edit-note').after(heading);
 heading.after(byId('mobile-opacity').closest('label'));
 // Aim assist on touch: sticks the aim to what it roughly points at (aim-assist.js).
 byId('mobile-opacity').closest('label').after(byId('aim-assist').closest('label'));
 // Full screen on touch (mobile-browser.js). Where the browser cannot (an
 // iPhone), the note says how: add the game to the home screen.
 byId('aim-assist').closest('label').after(byId('vibration').closest('label'));
 // Vibration on touch (haptics.js): a short buzz when hit, a double one on a kill.
 byId('vibration').closest('label').after(byId('fullscreen-play').closest('label'));
 const note = document.createElement('p'); note.className = 'settings-note'; note.id = 'fullscreen-note';
 note.textContent = fullscreenSupported() ? 'Hides the browser\'s address bar and toolbars when a game starts.' : isStandalone() ? 'Already full screen from your home screen.' : 'This browser cannot go full screen. Use Share > Add to Home Screen to play full screen.';
 byId('fullscreen-play').closest('label').after(note);
 return { sync };
}
