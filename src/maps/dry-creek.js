// Dry Creek: a small layout that proves the loader handles more than one map.
// Development only (?map=dry-creek); not listed in the menus.
import { building } from '../map-kit.js';

export const dryCreek = {
  id: 'dry-creek', name: 'Dry Creek', width: 40, depth: 36,
  spawn: { x: 0, z: 5 }, palette: { ground: '#776044', road: '#94764f' }, look: { warmth: .15 },
  buildings: [building('depot', -8, -6, 8, 8, 2.6, 'DEPOT', '#c5a079', '#6b776b')],
  props: [{ type: 'barrel', x: 5, z: 0 }, { type: 'crate', x: 9, z: -5 },
    { type: 'cactus', x: -15, z: 5 }, { type: 'cactus', x: 15, z: -10, scale: .8 },
    { type: 'sign', x: 4.6, z: 5, label: 'DEPOT', direction: -1 }],
  fences: [{ x: 14, z: 2, length: 12, axis: 'z' }],
  targets: [{ id: 'a', x: 5, z: -6 }, { id: 'b', x: 9, z: 2 }, { id: 'c', x: 5, z: 8, moving: true, travel: 3 }],
  zones: [], scenerySeed: 364,
};
