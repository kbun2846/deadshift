// What a hit or a kill you made should look like (pure; feel/hit-markers.js
// draws it, feel/feel-layer.js feeds it from your own sim's events, which
// online are the host's: every weapon's hits arrive as `hit` / `kill` events
// with the damage that landed).
import { FEEL } from '../config/feel.js';

// A hit's tier from the damage that landed on one target this frame:
// 'tick' (a graze), 'hit', 'big'. Shares of a player's full health (100).
export function hitTier(damage, maxHp = 100, cfg = FEEL.marker) {
 const share = (damage > 0 ? damage : 0) / (maxHp > 0 ? maxHp : 100);
 return share < cfg.tick ? 'tick' : share >= cfg.big ? 'big' : 'hit';
}
// How big inside its tier (0-1), so two big hits are not quite the same.
export function hitWeight(damage, maxHp = 100, cfg = FEEL.marker) {
 const share = (damage > 0 ? damage : 0) / (maxHp > 0 ? maxHp : 100);
 if (share < cfg.tick) return share / cfg.tick;
 if (share < cfg.big) return (share - cfg.tick) / (cfg.big - cfg.tick);
 return Math.min(1, (share - cfg.big) / (1 - cfg.big));
}
// A `kill` event's kind: 'oneShot' / 'kill' for a player or a robot (the
// kills that get the full kill feel), 'target' for a practice board, a
// dummy or an animal (just the X), null for anything else.
export function killKind(e) {
 if (!e || e.type !== 'kill') return null;
 if (e.targetKind === 'player' || e.targetKind === 'robot') return e.oneShot ? 'oneShot' : 'kill';
 return 'target';
}
// The marker for a target this frame: a kill outranks the hits.
export function markerKind(hitDamage, kill, maxHp = 100) {
 if (kill === 'oneShot') return 'oneshot';
 if (kill) return 'kill';
 return hitTier(hitDamage, maxHp);
}

// This frame's hits and kills, one entry per target (the sums of its hits),
// in reused slots: add() every hit / kill event, then take() the list.
export function createHitBatch(size = 16) {
 const slots = Array.from({ length: size }, () => ({ id: null, x: 0, z: 0, damage: 0, kill: null }));
 let count = 0;
 const list = [];
 return {
  add(e) {
   if (e.type !== 'hit' && e.type !== 'kill') return;
   const id = e.id ?? null;
   let s = null;
   for (let i = 0; i < count; i++) if (slots[i].id === id && id !== null) { s = slots[i]; break; }
   if (!s) { if (count >= size) return; s = slots[count++]; s.id = id; s.damage = 0; s.kill = null; }
   s.x = e.x; s.z = e.z; s.damage += e.damage > 0 ? e.damage : 0;
   const kind = killKind(e);
   if (kind && s.kill !== 'oneShot') s.kill = kind;
  },
  take() { list.length = 0; for (let i = 0; i < count; i++) list.push(slots[i]); count = 0; return list; },
  get size() { return count; },
 };
}
