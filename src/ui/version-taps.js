// Presses on the version number (.game-version). They change nothing on
// screen; a qualifying run of them calls `open`.
export const TAP_RUN = 5, TAP_WINDOW = 4000;

// `held`: whether this press qualifies. A press that does not clears the run.
export function createTapCounter({ need = TAP_RUN, windowMs = TAP_WINDOW } = {}) {
 let times = [];
 return {
  press(held, now) {
   if (!held) { times = []; return false; }
   times = times.filter(t => now - t <= windowMs);
   times.push(now);
   if (times.length < need) return false;
   times = [];
   return true;
  },
  reset() { times = []; },
  get count() { return times.length; },
 };
}

export function installVersionTaps(elements, { open, enabled = () => true, win = globalThis, now = () => performance.now() } = {}) {
 const counter = createTapCounter(), touches = new Set();
 win.addEventListener('pointerdown', e => { if (e.pointerType === 'touch') touches.add(e.pointerId); }, true);
 for (const type of ['pointerup', 'pointercancel']) win.addEventListener(type, e => { touches.delete(e.pointerId); }, true);
 for (const type of ['touchend', 'touchcancel']) win.addEventListener(type, e => { if (!e.touches?.length) touches.clear(); }, true);
 for (const el of elements) el.addEventListener('pointerdown', e => {
  // (No focus change, text selection or press reaching anything behind.)
  e.preventDefault(); e.stopPropagation();
  const held = e.pointerType === 'touch' ? [...touches].some(id => id !== e.pointerId) : e.button === 0 && e.shiftKey;
  if (counter.press(held && enabled(), now())) open();
 });
 return counter;
}
