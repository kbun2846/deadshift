// The storm and 1V1's duel circle on the M map (overhead-map.js), from the
// one state the world draws them from (main.js stepStormScreen: the storm's
// plan and clock, `stormNow()`: duel.js in SOLO, the arena on a host, the
// match state on a joiner or the game server; the duel circle: duel.js or the
// match state). Owner, 2026-10-01: "map isnt showing the storm in some
// gamemodes/servers": Lumen's map never drew it, and the open map was a
// picture taken when it opened, so online (the match runs on while it is
// open) the storm closed in the world and not on the map, and a storm or
// circle that came after it opened (a new round) never showed.
import { stormAt } from '../storm.js';

export const NO_ZONES = Object.freeze({ storm: null, final: null, duel: null });

const circle = c => (c && Number.isFinite(c.x) && Number.isFinite(c.z) && Number.isFinite(c.r) ? { x: c.x, z: c.z, r: Math.max(0, c.r) } : null);

// `stormNow`: { plan, t } or null; `duelCircle`: { x, z, r } or null.
// { storm: the safe circle now, final: where it ends, duel: the duel circle }.
export function overheadZones(stormNow, duelCircle) {
 const plan = stormNow?.plan || null;
 const storm = plan ? circle(stormAt(plan, stormNow.t || 0)) : null;
 const final = plan ? circle({ x: plan.x1, z: plan.z1, r: plan.r1 }) : null;
 const duel = circle(duelCircle);
 return storm || duel ? { storm, final: storm ? final : null, duel } : NO_ZONES;
}

const fmt = v => Math.round(v * 100) / 100;
// A ring's hole cut out of a sheet over everything (evenodd).
const outside = c => `M-9999 -9999H9999V9999H-9999Z M${fmt(c.x - c.r)} ${fmt(c.z)}a${fmt(c.r)} ${fmt(c.r)} 0 1 0 ${fmt(c.r * 2)} 0a${fmt(c.r)} ${fmt(c.r)} 0 1 0 ${fmt(-c.r * 2)} 0Z`;

// The look (unchanged from storm-view.js's first map layer): the storm, the
// map outside the safe circle washed red, its edge, the final zone dashed;
// 1V1's duel circle, a red ring with the ground outside it dimmed.
export function zonesSVG(zones = NO_ZONES) {
 const c = zones?.storm, f = zones?.final, d = zones?.duel;
 let out = '';
 if (c) out += `<path fill="#b3121f" opacity=".32" fill-rule="evenodd" d="${outside(c)}"/><circle cx="${fmt(c.x)}" cy="${fmt(c.z)}" r="${fmt(c.r)}" fill="none" stroke="#ff4a3d" stroke-width="1.1"/>${f ? `<circle cx="${fmt(f.x)}" cy="${fmt(f.z)}" r="${fmt(f.r)}" fill="none" stroke="#ffe2d6" stroke-width=".7" stroke-dasharray="2.4 1.6" opacity=".85"/>` : ''}`;
 if (d) out += `<path fill="#000" opacity=".28" fill-rule="evenodd" d="${outside(d)}"/><circle cx="${fmt(d.x)}" cy="${fmt(d.z)}" r="${fmt(d.r)}" fill="none" stroke="#d0243a" stroke-width="1.1"/>`;
 return out;
}

// What the live layer shows, to the decimetre: redrawn only when it changes.
export function overheadLiveKey(zones, player) {
 const k = c => (c ? `${Math.round(c.x * 10)},${Math.round(c.z * 10)},${Math.round(c.r * 10)}` : '-');
 return `${k(zones?.storm)}|${k(zones?.final)}|${k(zones?.duel)}|${player ? Math.round(player.x * 10) + ',' + Math.round(player.z * 10) : '-'}`;
}

// You on the map: the blue dot (`look`: a map's own colours for it).
export const PLAYER_MARK = Object.freeze({ player: '#c7efff', playerEdge: '#203844', playerHalo: '#a8e2ff' });
export const playerMarkSVG = (player, look = PLAYER_MARK) => (player ? `<circle cx="${fmt(player.x)}" cy="${fmt(player.z)}" r="3.8" fill="${look.playerHalo}" opacity=".18"/><circle cx="${fmt(player.x)}" cy="${fmt(player.z)}" r="1.65" fill="${look.player}" stroke="${look.playerEdge}" stroke-width=".65"/>` : '');

// The top of every map's drawing (Deadwater's, overhead-hills.js,
// overhead-city.js): the storm or the duel circle, then you. main.js
// rewrites only this group while the map is open (overheadMapLive).
export const LIVE_LAYER_ID = 'overhead-live';
export const overheadLiveSVG = (zones, player, look) => zonesSVG(zones) + playerMarkSVG(player, look);
export const overheadLiveLayer = (zones, player, look) => `<g id="${LIVE_LAYER_ID}">${overheadLiveSVG(zones, player, look)}</g>`;
