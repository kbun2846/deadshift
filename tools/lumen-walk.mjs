#!/usr/bin/env node
// Lumen's layout as bodies walk it (stage 2, dev tool, no server):
//   node tools/lumen-walk.mjs [out.png]
// A 0.25 m grid of where a body (radius .38) can stand, from the map's own
// colliders (walls, doors, props, solids, barricades), walked with 8-way
// steps (Dijkstra). Prints the walking distance from the Crossroads' middle
// to each base, each base to the flatiron's prow door and the bus's door,
// and base to base; draws the colliders, doors, bases, spawns and targets
// with the walk distances as a shaded field (a PNG via headless Chromium).
import { writeFileSync } from 'node:fs';
import { maps, mapColliders } from '../src/maps.js';
import { walkGrid } from './lumen-walk-lib.mjs';
import { CROSSROADS, BASES as PLAN_BASES } from '../src/maps/lumen-layout.js';

const map = maps.lumen, BASES = map.bases?.length ? map.bases : PLAN_BASES;
const { free, walk, at, G, X0, Z0, NX, NZ } = walkGrid(map);

// Named places: the Crossroads' middle, the bases, the flatiron's prow door,
// the bus's doors (just outside them).
const doorOut = id => { for (const r of map.buildings.filter(b => b.group === id)) for (const o of r.openings) if (o.outer) return r.quad ? outsideQuad(r, o) : outsideRect(r, o); return null; };
function outsideQuad(r, o) { const a = r.quad[o.edge], b = r.quad[(o.edge + 1) % 4], l = Math.hypot(b[0] - a[0], b[1] - a[1]), ux = (b[0] - a[0]) / l, uz = (b[1] - a[1]) / l, mx = (a[0] + b[0]) / 2 + ux * o.offset, mz = (a[1] + b[1]) / 2 + uz * o.offset; let nx = -uz, nz = ux; if ((mx + nx - r.x) ** 2 + (mz + nz - r.z) ** 2 < (mx - r.x) ** 2 + (mz - r.z) ** 2) { nx = -nx; nz = -nz; } return { x: mx + nx * 1.2, z: mz + nz * 1.2 }; }
function outsideRect(r, o) { const s = { back: [0, -1], front: [0, 1], left: [-1, 0], right: [1, 0] }[o.side]; return s[0] ? { x: r.x + s[0] * (r.w / 2 + 1.2), z: r.z + o.offset } : { x: r.x + o.offset, z: r.z + s[1] * (r.d / 2 + 1.2) }; }
const places = { crossroads: { x: CROSSROADS.centre[0], z: CROSSROADS.centre[1] }, flatiron: doorOut('flatiron'), bus: doorOut('bus') };
for (const b of BASES) places['base ' + b.id] = { x: b.x, z: b.z };
const fields = {};
for (const [name, p] of Object.entries(places)) fields[name] = walk(p.x, p.z);
const rows = [];
for (const b of BASES) {
  const f = fields['base ' + b.id];
  rows.push(`base ${b.id} (${b.name}): Crossroads ${at(f, places.crossroads.x, places.crossroads.z).toFixed(1)} m, flatiron ${at(f, places.flatiron.x, places.flatiron.z).toFixed(1)} m, bus ${at(f, places.bus.x, places.bus.z).toFixed(1)} m` +
    BASES.filter(o => o !== b).map(o => `, ${o.id} ${at(f, o.x, o.z).toFixed(1)} m`).join(''));
}
console.log(rows.join('\n'));
// LUMEN_WALK_PROBE="x,z x,z ...": the walk from the Crossroads to each point.
for (const q of (process.env.LUMEN_WALK_PROBE || '').split(' ').filter(Boolean)) { const [x, z] = q.split(',').map(Number); console.log(`probe ${x},${z}: ${at(fields.crossroads, x, z).toFixed(1)} m`); }
// Unreachable free ground (pockets a body can stand in but never walk to).
{ const f = fields.crossroads; let pockets = 0; for (let k = 0; k < free.length; k++) if (free[k] && f[k] === Infinity) pockets++; console.log(`unreachable free cells: ${pockets} (${(pockets * G * G).toFixed(1)} m²)`); }

// The drawing.
const out = process.argv[2];
if (out) {
  const S = 6, PX = x => (x + 72) * S, PZ = z => (z + 64) * S, W = 144 * S, H = 128 * S, parts = [`<rect width="${W}" height="${H}" fill="#101218"/>`];
  const f = fields.crossroads, max = 90;
  for (let j = 0; j < NZ; j += 2) for (let i = 0; i < NX; i += 2) { const k = j * NX + i; if (!free[k]) continue; const d = f[k]; const v = d === Infinity ? '#5a1010' : `hsl(${220 - Math.min(1, d / max) * 200},40%,${22 + 10 * (Math.floor(d / 10) % 2)}%)`; parts.push(`<rect x="${PX(X0 + i * G)}" y="${PZ(Z0 + j * G)}" width="${2 * G * S + .5}" height="${2 * G * S + .5}" fill="${v}"/>`); }
  const box = (c, fill) => { const a = c.angle || 0, w = c.localW ?? c.w, d = c.localD ?? c.d, cs = Math.cos(a), sn = Math.sin(a); const pts = [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]].map(([x, z]) => [c.x + x * cs + z * sn, c.z - x * sn + z * cs]); parts.push(`<polygon points="${pts.map(([x, z]) => `${PX(x)},${PZ(z)}`).join(' ')}" fill="${fill}"/>`); };
  for (const c of mapColliders(map)) box(c, c.wall ? '#c8ccd4' : c.walkOver ? '#555a' : c.blocksSight ? '#e0a040' : c.lowTop ? '#6a8a6a' : '#8a92a6');
  for (const [name, p] of Object.entries(places)) parts.push(`<circle cx="${PX(p.x)}" cy="${PZ(p.z)}" r="6" fill="#ff4f9a"/><text x="${PX(p.x) + 8}" y="${PZ(p.z) - 6}" font-size="12" fill="#fff" font-family="sans-serif">${name}</text>`);
  for (const b of BASES) for (const p of b.points || []) parts.push(`<circle cx="${PX(p.x)}" cy="${PZ(p.z)}" r="3" fill="#fff"/>`);
  for (const p of map.ffaSpawns || []) parts.push(`<circle cx="${PX(p.x)}" cy="${PZ(p.z)}" r="4" fill="none" stroke="#7fff7f" stroke-width="2"/>`);
  for (const t of map.targets || []) parts.push(`<rect x="${PX(t.x) - 4}" y="${PZ(t.z) - 4}" width="8" height="8" fill="${t.kind === 'dummy' ? '#ff9a3a' : '#ffe44a'}"/>`);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${parts.join('')}</svg>`;
  writeFileSync(out.replace(/\.png$/, '.svg'), svg);
  const { chromium } = await import('playwright');
  const browser = await chromium.launch(); const page = await browser.newPage({ viewport: { width: W, height: H } });
  await page.setContent(`<html><body style="margin:0">${svg}</body></html>`); await page.screenshot({ path: out }); await browser.close();
  console.log(out);
}
