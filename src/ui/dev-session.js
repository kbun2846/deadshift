// How long an unlock of the developer tools lasts: this tab's own page loads
// (a map change, going online and back, the main menu: all location.href or
// launch.js launchTo) keep it; a reload or a new tab drops it. sessionStorage
// is per tab, and the navigation entry says whether this load was a reload.
// What is stored is a random token, nothing to do with the code.
export const DEV_SESSION_KEY = 'deadstab.devSession';
const TOKEN = /^[0-9a-f]{32}$/;

export const sessionStore = () => { try { return globalThis.sessionStorage || null; } catch { return null; } };

// 'navigate', 'reload', 'back_forward' or 'prerender' ('navigate' when unknown).
export function navigationType(perf = globalThis.performance) {
 try { return perf?.getEntriesByType?.('navigation')?.[0]?.type || 'navigate'; } catch { return 'navigate'; }
}

// At startup: true to come back unlocked. A reload forgets it.
export function restoreDevSession(storage = sessionStore(), type = navigationType()) {
 try {
  if (type === 'reload') { storage?.removeItem(DEV_SESSION_KEY); return false; }
  return TOKEN.test(storage?.getItem(DEV_SESSION_KEY) || '');
 } catch { return false; }
}

const randomHex = () => {
 const bytes = new Uint8Array(16);
 globalThis.crypto.getRandomValues(bytes);
 return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
};
export function saveDevSession(storage = sessionStore(), random = randomHex) {
 try { storage?.setItem(DEV_SESSION_KEY, random()); } catch { /* private mode: this page only */ }
}
export function clearDevSession(storage = sessionStore()) {
 try { storage?.removeItem(DEV_SESSION_KEY); } catch { /* nothing kept */ }
}
