// Touch haptics: a short buzz when you are hit and a quick double on a kill,
// so a phone player feels a hit their eyes were not on. Only on touch, only
// with Settings > Mobile > Vibration on, and never more than one buzz per
// 120 ms however fast the hits come. Browsers without vibration (iPhone
// Safari) ignore it.
let last = -Infinity;
export function buzz(pattern, { enabled = true, touch = true } = {}) {
 if (!enabled || !touch || typeof navigator === 'undefined' || !navigator.vibrate) return false;
 const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
 if (now - last < 120) return false;
 last = now;
 try { return navigator.vibrate(pattern); } catch { return false; }
}
export const HAPTICS = Object.freeze({ hurt: 14, heavy: 28, kill: [10, 40, 16] });
