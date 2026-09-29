// The loading wheel over everything while something loads (v0.999a, owner:
// "sometimes when I load into games or change graphic settings ... it loads a
// brief white screen ... any loading necessary should be the ... loading
// screen without the text and just the circle spinning"). The first load's
// wheel (index.html #loading-screen) is copied before that screen goes, and
// shown again as #busy-screen: it comes on at once (it hides a world that is
// being rebuilt or a buffer being reallocated) and fades out. Calls nest: it
// stays up until every showBusy has its hideBusy.
let wheel = null, screen = null, holds = 0;

export function rememberWheel(loadingScreen) {
  const w = loadingScreen?.querySelector('.loading-wheel');
  if (w) wheel = w.cloneNode(true);
}

function element() {
  if (screen) return screen;
  screen = document.createElement('div');
  screen.id = 'busy-screen'; screen.className = 'hidden';
  screen.setAttribute('role', 'status'); screen.setAttribute('aria-label', 'Loading');
  if (wheel) screen.append(wheel.cloneNode(true));
  document.body.append(screen);
  return screen;
}

export function showBusy() {
  holds++;
  element().classList.remove('hidden');
}

export function hideBusy() {
  holds = Math.max(0, holds - 1);
  if (!holds && screen) screen.classList.add('hidden');
}

export const busyShowing = () => holds > 0;
