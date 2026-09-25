// Keyboard players (Left Ctrl dodged until v147): Ctrl with W walking up, so a dodge while
// walking up is Ctrl+W, which browsers keep for "close tab" and never give
// to a page (the leave-site prompt in main.js was the only guard). The
// Keyboard Lock API (Chrome, Edge) lets a page that is full screen take
// those keys: the game goes full screen when it starts and locks the keys it
// uses, Escape included (Esc still pauses; holding Esc leaves full screen,
// and the browser says so). Other browsers keep the prompt. Setting:
// Settings > Controls > LOCK BROWSER SHORTCUTS (settings.keyLock).
export const LOCKED_KEYS = Object.freeze(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'KeyR', 'KeyT', 'KeyN', 'KeyC', 'KeyX', 'KeyF', 'KeyM', 'KeyP', 'KeyO', 'KeyL', 'KeyH', 'KeyJ', 'KeyK', 'Tab', 'Escape', 'Space']);

export const keyLockSupported = () => typeof navigator !== 'undefined' && typeof navigator.keyboard?.lock === 'function' && typeof document !== 'undefined' && typeof document.documentElement.requestFullscreen === 'function';

// From a click or key press (browsers only allow full screen from one).
// Resolves true when the keys are held.
export async function lockGameKeys() {
 if (!keyLockSupported()) return false;
 try {
  if (!document.fullscreenElement) await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
  if (!document.fullscreenElement) return false;
  await navigator.keyboard.lock([...LOCKED_KEYS]);
  return true;
 } catch { return false; }
}
export function unlockGameKeys() {
 try { navigator.keyboard?.unlock?.(); } catch { /* nothing held */ }
}
