// Keeps the screen on while a game is actually being played (a phone would
// otherwise dim and lock mid-fight, since touch play has long stretches with
// the thumbs resting). Released in menus, on pause and on death, so the phone
// sleeps normally there. Browsers drop the lock whenever the page is hidden;
// the next call after it is shown again takes it back.
let wanted = false, lock = null, asking = false, retryAt = 0;
export function keepAwake(on) {
 wanted = !!on;
 const api = typeof navigator !== 'undefined' ? navigator.wakeLock : null;
 if (!api) return;
 if (!wanted) { if (lock) { const l = lock; lock = null; l.release().catch(() => {}); } return; }
 if (lock || asking || document.hidden || Date.now() < retryAt) return;
 asking = true;
 api.request('screen').then(l => {
  asking = false;
  if (!wanted) { l.release().catch(() => {}); return; }
  lock = l; l.addEventListener?.('release', () => { if (lock === l) lock = null; });
 }).catch(() => { asking = false; retryAt = Date.now() + 5000; }); // refused: not again for a while
}
