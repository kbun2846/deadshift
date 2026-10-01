// Destructive buttons take two presses (owner's interface rule: "PRESS AGAIN
// TO RESET"). The first press arms the button and swaps its label; a second
// press within `seconds` runs the action; otherwise it quietly disarms.
// Used by Settings (RESET KEYS, RESET LAYOUT); lobby-panel.js has its own.
export function twoPress(button, run, { confirm = 'PRESS AGAIN TO RESET', seconds = 3, now = () => performance.now() } = {}) {
 const label = button.textContent;
 let until = 0, timer = null;
 const disarm = () => { until = 0; clearTimeout(timer); button.classList.remove('armed'); if (button.textContent !== label) button.textContent = label; };
 button.addEventListener('click', () => {
  if (until > now()) { disarm(); run(); return; }
  until = now() + seconds * 1000; button.textContent = confirm; button.classList.add('armed');
  clearTimeout(timer); timer = setTimeout(disarm, seconds * 1000 + 50);
 });
 return { disarm, get armed() { return until > now(); } };
}
