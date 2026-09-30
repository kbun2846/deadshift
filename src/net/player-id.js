// This browser's player id: random, made once and kept (localStorage). There
// are no accounts yet; the game server uses it to tell players apart (who
// made a room, a removal that sticks, a ban). It is never shown to other
// players. Private windows and cleared storage get a new one.
const KEY = 'deadstab-player-id';

export function playerId(storage = globalThis.localStorage) {
 try {
  const saved = storage?.getItem(KEY);
  if (saved && /^[A-Za-z0-9_-]{8,64}$/.test(saved)) return saved;
  const id = newId();
  storage?.setItem(KEY, id);
  return id;
 } catch { return (playerId.fallback ||= newId()); }
}

function newId() {
 const bytes = new Uint8Array(16);
 globalThis.crypto?.getRandomValues ? globalThis.crypto.getRandomValues(bytes) : bytes.forEach((_, i) => { bytes[i] = Math.floor(Math.random() * 256); });
 return [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
}
