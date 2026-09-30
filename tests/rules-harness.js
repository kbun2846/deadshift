// Shared by tests/rounds.test.js and tests/forfeit-ready.test.js: an Arena
// with scripted seats (no sockets, no sim steps), so the match rules are
// driven exactly: who falls, when, and how long the clock runs.
import assert from 'node:assert/strict';
import { maps } from '../src/maps.js';
import { Simulation } from '../src/simulation.js';
import { Arena, DUEL_BREAK, ROUND_BREAK } from '../src/net/arena.js';

export const map = maps.deadwater;
export const createSim = m => new Simulation(m);
export const seeded = seed => { let s = seed; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; };

// An arena with `humans` people (ids 'host', 'p1', 'p2'...), in the lobby, or
// already playing `mode` (robots fill the rest unless settings say otherwise).
export function arena({ humans = 1, mode = null, settings = {} } = {}) {
 const a = new Arena({ map, createSim, random: seeded(3), settings });
 for (let i = 0; i < humans; i++) a.addSeat(i ? 'p' + i : 'host', i ? 'Player ' + i : 'Hosty');
 if (mode) start(a, mode);
 return a;
}
export function start(a, mode) {
 assert.ok(a.startRound(mode), a.startError || 'the round starts');
 for (const s of people(a)) a.choose(s.id, 'rifle');
 tick(a, .5);
 return a;
}
export const people = a => [...a.seats.values()].filter(s => !s.robot);
export const bots = a => [...a.seats.values()].filter(s => s.robot);
export const sideOf = (a, seat) => a.sideOf(seat);
// Run the arena `seconds` of game time.
export function tick(a, seconds, dt = 1 / 20) { for (let t = 0; t < seconds - 1e-9; t += dt) a.endTick(dt); }
// The break after a point (1V1's is longer), plus a little.
export const breakOf = a => (a.mode === '1v1' ? DUEL_BREAK : ROUND_BREAK) + .2;

// Every seat not on `side` falls (a kill by someone on `side`), so `side`
// takes the point; side null: everyone falls at once, a draw. One tick after,
// the point is counted.
export function takePoint(a, side) {
 const seats = [...a.seats.values()].filter(s => !s.bench), killer = seats.find(s => a.sideOf(s) === side) || null;
 for (const s of seats) if (a.sideOf(s) !== side && !s.dead) { s.sim.player.hp = 0; a.died(s, killer); }
 a.endTick(1 / 60);
}
// A point and its whole break (the next round starts, or the match ends).
export function playPoint(a, side) { takePoint(a, side); tick(a, breakOf(a)); }
