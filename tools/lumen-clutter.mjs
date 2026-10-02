// Lumen's street clutter count (dev tool, no browser): every outdoor prop on
// the map (`lumen.props`: stage 2 cover and cars, the bases' screens, the
// breakables, the set pieces, the dead and their leavings, the street detail)
// counted by kind, type and area, the small street obstacles (and how many
// of them break), and the thin vertical colliders a player runs into without
// seeing them from the top-down camera
// (tests/lumen-clutter.test.js holds the line on those).
//   node tools/lumen-clutter.mjs            the summary
//   node tools/lumen-clutter.mjs --types    every type's count too (the small obstacles' and the street objects')
//   node tools/lumen-clutter.mjs --json     the whole count as JSON
import { lumenClutter } from '../tests/lumen-clutter-lib.js';

const r = lumenClutter();
if (process.argv.includes('--json')) { console.log(JSON.stringify(r, null, 1)); process.exit(0); }
const row = (k, v) => console.log(`  ${k.padEnd(22)} ${String(v).padStart(4)}`);
console.log(`Lumen outdoor props: ${r.total} (${r.street} street objects: solid, or standing clutter; ${r.flat} flat or on a wall)`);
console.log(`Small street obstacles (not a vehicle, not a big set piece: under 3 m long, 2.4 m² and 2.5 m tall): ${r.small}, ${r.smallBreakable} of them breakable (${Math.round(r.smallBreakable / r.small * 100)}%); street objects that break: ${r.streetBreakable}`);
console.log('By kind (street objects / all):');
for (const [k, v] of Object.entries(r.byKind)) row(k, `${r.streetByKind[k] || 0} / ${v}`);
console.log('Street objects by area:');
for (const [k, v] of Object.entries(r.streetByArea)) row(k, v);
console.log(`Thin vertical colliders (a box ${r.thinRule}; masts drawn without a collider: ${r.poles}): ${r.thin.length}`);
for (const [k, v] of Object.entries(r.thinByType)) row(k, v);
if (process.argv.includes('--types')) {
  console.log('Small street obstacles by type:');
  for (const [k, v] of Object.entries(r.smallByType)) row(k, v);
  console.log('Street objects by type:');
  for (const [k, v] of Object.entries(r.streetByType)) row(k, v);
}
