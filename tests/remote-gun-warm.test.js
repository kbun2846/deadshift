// v0.990a (owner: frames lost playing a robot): a robot's or another player's
// gun was drawn with materials no loaded shader had been built for, so each
// first draw (the gun, then a hidden part like the Sidekick's magazine on a
// reload) stalled the game while it compiled. The warm-up now draws one of
// every weapon's shared model (remote-players.js gunStandIns); every later
// avatar's gun is a clone sharing those very materials.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { gunStandIns } from '../src/remote-players.js';
import { WEAPONS } from '../src/items.js';

const fakeView = () => {
  const materials = new Map(), mat = c => { if (!materials.has(c)) materials.set(c, new THREE.MeshLambertMaterial({ color: c })); return materials.get(c); };
  const add = (geometry, x, y, z, c, parent) => { const m = new THREE.Mesh(geometry, mat(c)); m.position.set(x, y, z); parent.add(m); return m; };
  return {
    box: (x, y, z, w, h, d, c, parent) => add(new THREE.BoxGeometry(w, h, d), x, y, z, c, parent),
    cylinder: (x, y, z, r, h, c, parent, seg = 8) => add(new THREE.CylinderGeometry(r, r, h, seg), x, y, z, c, parent),
    batch: () => {},
  };
};
const materialsOf = root => { const out = new Set(); root.traverse(o => { for (const m of [].concat(o.material || [])) out.add(m); }); return out; };

test('the warm-up holds one of every weapon, hidden parts and all, sharing materials with every later gun', () => {
  const view = fakeView(), ids = WEAPONS.map(w => w.id);
  const standIns = gunStandIns(view, ids);
  assert.equal(standIns.length, ids.length);
  for (const [i, model] of standIns.entries()) {
    const own = materialsOf(model);
    assert.ok(own.size > 0, ids[i] + ' has materials');
    // A robot's gun, built afterwards, draws with the warmed materials only.
    const later = materialsOf(gunStandIns(view, [ids[i]])[0]);
    for (const m of later) assert.ok(own.has(m), ids[i] + ': a later gun uses a material the warm-up drew');
  }
  // The Sidekick's magazine (shown only on a reload) is in the stand-in.
  const sidekick = standIns[ids.indexOf('sidekick')];
  assert.ok(sidekick.getObjectByName('side-kick-magazine'), 'the hidden magazine is there to be drawn');
});
