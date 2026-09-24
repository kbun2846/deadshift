import { RULES } from './config/gameplay.js';
// How big a target's body is for hits and bumping. Online, other players
// stand in the target list as kind 'player' (see net/arena.js).
export function targetRadius(t) { return t.kind === 'player' || t.kind === 'robot' ? RULES.radius + .04 : t.kind === 'dummy' ? .42 : .55; }
