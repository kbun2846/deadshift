// Preserve saves made before the game was renamed: dustshift -> deadshift
// (the first rename), then deadshift -> deadstab (owner, 2026-09-30). A save
// under the new name always wins; an old one is only copied across when the
// new name has none. The old keys are left where they are (a build still on
// the old names would find its saves), and nothing here may stop the game
// starting (blocked or full storage).
const DUSTSHIFT = ['settings', 'input', 'tutorial-complete-v2', 'tutorial-complete-v2-rifle', 'tutorial-complete-v2-shotgun', 'native-thumbnail'];

// Every key under the old name: `deadshift-...` and `deadshift....` (settings,
// keybinds, the BOTS page, touch layouts, tutorials, the username, the host's
// picks, the dev window, thumbnails, the launch notes, ...).
export const OLD_PREFIX = /^deadshift(?=[-.])/;
export const renamedKey = key => key.replace(OLD_PREFIX, 'deadstab');

export function migrateGameStorage(storage) {
 for (const suffix of DUSTSHIFT) {
  try {
   const key = 'deadshift-' + suffix;
   if (storage.getItem(key) !== null) continue;
   const previous = storage.getItem('dustshift-' + suffix);
   if (previous !== null) storage.setItem(key, previous);
  } catch { /* Storage restrictions must not prevent the game from starting. */ }
 }
 let keys = [];
 try { for (let i = 0; i < (storage.length ?? 0); i++) { const k = storage.key(i); if (k && OLD_PREFIX.test(k)) keys.push(k); } } catch { keys = []; }
 for (const old of keys) {
  try {
   const key = renamedKey(old);
   if (storage.getItem(key) !== null) continue;
   const previous = storage.getItem(old);
   if (previous !== null) storage.setItem(key, previous);
  } catch { /* as above */ }
 }
}
