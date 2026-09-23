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
 // The mobile button opacity option belongs with the rest of the touch setup.
 byId('settings-mobile').prepend(byId('mobile-opacity').closest('label'));
 return { sync };
}
