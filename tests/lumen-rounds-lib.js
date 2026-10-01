// A real round fired across a map piece in the Simulation (the stage 5 review's check): does it pass the
// piece? The shooter stands 4 m short of the piece's near edge on one of four headings, with nothing solid
// between it and the piece; the round is fired with no spread and its first impact measured along its line.
import { Simulation, segmentBox } from '../src/simulation.js';
import { mapColliders } from '../src/maps.js';
import { isPlayable } from '../src/playable-area.js';
import { RIFLE_MUZZLE } from '../src/config/gameplay.js';

// One Simulation per map (building one takes a while on Lumen).
const sims = new WeakMap();
function simFor(map) {
  if (!sims.has(map)) { const sim = new Simulation(map); sim.weapon = 'rifle'; sim.reset(); sims.set(map, sim); }
  return sims.get(map);
}
// Fires one round whose line runs from (x, z) along (dx, dz) (the shooter stands off it by the muzzle's
// lateral offset); returns the distance along it to the first impact, or Infinity.
export function fireRound(map, lineX, lineZ, dx, dz) {
  const sim = simFor(map), x = lineX + dz * RIFLE_MUZZLE.lateral, z = lineZ - dx * RIFLE_MUZZLE.lateral;
  sim.reset(); sim.targets = [];
  Object.assign(sim.dev ||= {}, { noSpread: true, noRecoil: true, ammo: true });
  for (let i = 0; i < 40; i++) {
    Object.assign(sim.player, { x, z, vx: 0, vz: 0, aimX: dx, aimZ: dz });
    sim.step({ aimX: dx, aimZ: dz, aimPointX: x + dx * 12, aimPointZ: z + dz * 12, fire: i === 3 });
    const hit = sim.drainEvents().find(e => e.type === 'rifleImpact');
    if (hit) return (hit.x - lineX) * dx + (hit.z - lineZ) * dz;
  }
  return Infinity;
}
// Across piece `p` (a prop of `map`): on each of sixteen headings, the first clear approach (the round's
// line starting 4, 2.5, 1.5 or 1 m short of the piece's edge, the shooter on playable ground, nothing
// between the shooter, its muzzle and the piece's centre), a round fired across it in the map as it is and
// (only when the round stopped short of the piece's far edge) in the map without the piece. A piece rounds
// pass leaves the impact past its far edge (`far`) or where it was without it (`withIt` equals `without`),
// and past `centre` (the round reached the piece). Up to `most` approaches; [] when none is clear.
export function acrossPiece(map, p, most = 2) {
  const solid = mapColliders(map).filter(c => !c.playerOnly && c.propId !== p.id);
  const bare = () => ({ ...map, props: map.props.filter(q => q.id !== p.id) });
  const a = p.angle || 0, s = p.scale || 1, out = [], L = RIFLE_MUZZLE.lateral;
  const clear = (ax, az, bx, bz) => !solid.some(c => segmentBox(ax, az, bx, bz, c, .1) !== null);
  for (let k = 0; k < 16 && out.length < most; k++) {
    const lx = Math.cos(k * Math.PI / 8), lz = Math.sin(k * Math.PI / 8);
    // (the piece's local axes in the world: local x runs along (cos a, -sin a))
    const dx = lx * Math.cos(a) + lz * Math.sin(a), dz = -lx * Math.sin(a) + lz * Math.cos(a);
    const half = Math.min(Math.abs(lx) > 1e-9 ? p.w / 2 / Math.abs(lx) : Infinity, Math.abs(lz) > 1e-9 ? p.d / 2 / Math.abs(lz) : Infinity) * s;
    for (const gap of [4, 2.5, 1.5, 1]) {
      const x = p.x - dx * (half + gap), z = p.z - dz * (half + gap), px = x + dz * L, pz = z - dx * L;
      if (!isPlayable(map, px, pz, .35) || !clear(px, pz, x + dx * RIFLE_MUZZLE.forward, z + dz * RIFLE_MUZZLE.forward) || !clear(x, z, p.x, p.z)) continue;
      const withIt = fireRound(map, x, z, dx, dz), far = 2 * half + gap;
      out.push({ dx, dz, centre: half + gap, far, withIt, without: withIt > far ? withIt : fireRound(bare(), x, z, dx, dz) });
      break;
    }
  }
  return out;
}
