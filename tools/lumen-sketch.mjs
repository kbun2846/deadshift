// Lumen's to-scale layout sketch (dev tool, no server): draws
// src/maps/lumen-layout.js as an SVG and a PNG.
//   node tools/lumen-sketch.mjs [out.png]
import { writeFileSync } from 'node:fs';
import { ROADS, CROSSROADS, BACK_ALLEY, VELVET_LANE, OUTLINE, BARRICADES, DISTRICTS, BASES, BUILDING_PLAN } from '../src/maps/lumen-layout.js';

const S = 6, X = x => (x + 72) * S, Z = z => (z + 64) * S, W = 144 * S, H = 128 * S;
const rect = (x0, x1, z0, z1, fill, extra = '') => `<rect x="${X(x0)}" y="${Z(z0)}" width="${(x1 - x0) * S}" height="${(z1 - z0) * S}" fill="${fill}" ${extra}/>`;
const poly = (pts, fill, extra = '') => `<polygon points="${pts.map(([x, z]) => `${X(x)},${Z(z)}`).join(' ')}" fill="${fill}" ${extra}/>`;
const text = (x, z, t, size = 11, fill = '#e8e8e8') => `<text x="${X(x)}" y="${Z(z)}" font-size="${size}" fill="${fill}" font-family="sans-serif" text-anchor="middle">${t}</text>`;
const parts = [];
parts.push(rect(-72, 72, -64, 64, '#101218'));
parts.push(poly(OUTLINE, '#1e2129', 'stroke="#5a5e67" stroke-width="2"'));
for (const d of DISTRICTS) { const [x0, x1, z0, z1] = d.box; parts.push(rect(x0, x1, z0, z1, d.lead[0], 'opacity=".07"')); }
// sidewalks then roadways
for (const r of ROADS) {
  if (r.axis === 'x') { parts.push(rect(r.from, r.to, r.centre - r.width / 2 - r.sidewalk, r.centre + r.width / 2 + r.sidewalk, '#474a52')); }
  else if (r.axis === 'z') { parts.push(rect(r.centre - r.width / 2 - r.sidewalk, r.centre + r.width / 2 + r.sidewalk, r.from, r.to, '#474a52')); }
}
parts.push(rect(CROSSROADS.x0, CROSSROADS.x1, CROSSROADS.z0, CROSSROADS.z1, '#4b4e56'));
for (const r of ROADS) {
  if (r.axis === 'x') { parts.push(rect(r.from, r.to, r.centre - r.width / 2, r.centre + r.width / 2, '#2c2f36')); if (r.median) parts.push(rect(r.from, r.to, r.centre - r.median / 2, r.centre + r.median / 2, '#3a3d44')); }
  else if (r.axis === 'z') parts.push(rect(r.centre - r.width / 2, r.centre + r.width / 2, r.from, r.to, '#2c2f36'));
  else {
    const [ax, az] = r.a, [bx, bz] = r.b, len = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / len, uz = (bz - az) / len, nx = -uz, nz = ux;
    const q = h => [[ax + nx * h, az + nz * h], [bx + nx * h, bz + nz * h], [bx - nx * h, bz - nz * h], [ax - nx * h, az - nz * h]];
    parts.push(poly(q(r.width / 2 + r.sidewalk), '#474a52'), poly(q(r.width / 2), '#2c2f36'));
  }
}
// scramble stripes in the Crossroads
parts.push(`<g stroke="#c3c6cc" stroke-width="3" opacity=".6"><line x1="${X(-8)}" y1="${Z(-12)}" x2="${X(20)}" y2="${Z(12)}"/><line x1="${X(20)}" y1="${Z(-12)}" x2="${X(-8)}" y2="${Z(12)}"/></g>`);
parts.push(rect(BACK_ALLEY.x0, BACK_ALLEY.x1, BACK_ALLEY.z0, BACK_ALLEY.z1, '#2b2926', 'stroke="#ff2d8a" stroke-width="1" stroke-dasharray="4 3"'));
for (const l of VELVET_LANE) parts.push(rect(l.x0, l.x1, l.z0, l.z1, '#262831', 'stroke="#ff5fa8" stroke-width="1" stroke-dasharray="4 3"'));
for (const b of BUILDING_PLAN) {
  const fill = b.tall ? '#6a6e78' : '#8a8f99';
  for (const q of b.quads) parts.push(poly(q, fill, 'stroke="#101218" stroke-width="1.5"'));
  for (const [x0, x1, z0, z1] of b.parts) parts.push(rect(x0, x1, z0, z1, fill, 'stroke="#101218" stroke-width="1.5"'));
  const pts = [...b.quads.flat(), ...b.parts.flatMap(([x0, x1, z0, z1]) => [[x0, z0], [x1, z1]])];
  const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length, cz = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  parts.push(text(cx, cz + 1, b.id, 9, '#101218'));
}
for (const bar of BARRICADES) {
  const h = bar.length / 2;
  const pts = bar.axis === 'x' ? [[bar.x - h, bar.z], [bar.x + h, bar.z]] : bar.axis === 'z' ? [[bar.x, bar.z - h], [bar.x, bar.z + h]] : [[bar.x - h * .7, bar.z + h * .7], [bar.x + h * .7, bar.z - h * .7]];
  parts.push(`<line x1="${X(pts[0][0])}" y1="${Z(pts[0][1])}" x2="${X(pts[1][0])}" y2="${Z(pts[1][1])}" stroke="#fcee0a" stroke-width="5" stroke-dasharray="6 4"/>`);
}
const [cx, cz] = CROSSROADS.centre;
for (const base of BASES) {
  parts.push(`<circle cx="${X(base.x)}" cy="${Z(base.z)}" r="${4 * S}" fill="none" stroke="#e8afb9" stroke-width="3"/>`);
  parts.push(`<line x1="${X(cx)}" y1="${Z(cz)}" x2="${X(base.x)}" y2="${Z(base.z)}" stroke="#e8afb9" stroke-width="1" stroke-dasharray="3 3"/>`);
  parts.push(text(base.x, base.z - 5, `${base.id} ${Math.hypot(base.x - cx, base.z - cz).toFixed(0)} m`, 13, '#e8afb9'));
}
for (const [label, x, z] of [['THE STACKS', -52, -57], ['NIGHT MARKET', -13, -57], ['UPTOWN', 40, -58], ['BOULEVARD', -46, 1.2], ['AVENUE', 6, -46], ['WEST ST', -30, -46], ['NORTH LANE', -12, -35], ['SOUTH ST', -12, 31], ['THE CUT', 38, 33], ['CROSSROADS', 6, -13], ['GARAGE', -50, 27], ['VELVET ROW', -52, 58], ['CHARGING LOT', -13, 39], ['METRO PLAZA', 27, 54], ['FLATIRON', 46, 9], ['BACK ALLEY', -13, -22]])
  parts.push(text(x, z, label, 12, '#fcee0a'));
// scale bar
parts.push(`<line x1="${X(-66)}" y1="${Z(61)}" x2="${X(-46)}" y2="${Z(61)}" stroke="#fff" stroke-width="2"/>`, text(-56, 60, '20 m', 11));
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${parts.join('')}</svg>`;
const out = process.argv[2] || '/tmp/lumen-sketch.png';
writeFileSync(out.replace(/\.png$/, '.svg'), svg);
const { chromium } = await import('playwright');
const browser = await chromium.launch(); const page = await browser.newPage({ viewport: { width: W, height: H } });
await page.setContent(`<html><body style="margin:0">${svg}</body></html>`); await page.screenshot({ path: out }); await browser.close();
console.log(out);
