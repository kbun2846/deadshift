// Hollow Wick's static dressing (stage 5, task s5-props): period pieces, each
// where it makes sense. Types and models: src/world/hollow-dressing.js
// (DRESSING_TYPES, makeDressing). Spread last into hollow-wick.js's props,
// so no other prop's id or index moves.
//
// Every piece keeps the stage's placement rules (tests/hollow-dressing-rules.js:
// the breakables' rules and the detail pass's, and a few more), checked by
// tests/hollow-dressing.test.js. A piece that only makes sense touching
// something says so, and is checked for exactly that: `at` a building (it
// stands at its wall or in front of it), `bank` (at the water's edge), `on` a
// prop (the lantern on a tomb, the scythe on a fence), `by` a set piece.
//
// x east, z south, metres. `angle`: the piece's heading (its local x runs
// along (cos a, -sin a), its front (+z) faces (sin a, cos a)).
const q = Math.PI / 2;
const P = (type, id, x, z, angle, extra) => ({ type, id: `hw-d-${id}`, x, z, angle, ...extra });

export const HOLLOW_WICK_DRESSING = [
  // --- Puritan justice at the meetinghouse (Church Hill) ---
  // The stocks and the pillory at the summit's south-west corner, where the
  // west-flank path comes up (the portico's front is the approaches' and the
  // practice target's; its east side the graveyard aisles'), the whipping
  // post beside the west door, and a granite mounting block at the portico's
  // east end, where riders got up.
  P('stocks', 'stocks', -51.95, -19.2, 0, { at: 'meetinghouse' }),
  P('pillory', 'pillory', -52.9, -17.8, .25),
  P('whippingPost', 'whipping-post', -52.9, -25.3, .2),
  P('mountingBlock', 'mounting-block', -40.6, -16.9, q, { at: 'meetinghouse' }),
  // --- The town ---
  // A hitching rail on the street before the tavern (east of its door, clear
  // of the street's walking lane), and one outside the smithy's west door
  // with its grindstone beside it; the forge's slag raked out east of the
  // open forge.
  P('hitchingRail', 'rail-tavern', 27.9, -12.6, 0, { at: 'tavern' }),
  P('hitchingRail', 'rail-smithy', 18.8, 2.25, -q),
  P('grindstone', 'grindstone', 18.9, 4.6, .15), // (off the retaining wall: a robot's lane, stage 5 review)
  P('slagHeap', 'slag', 36.2, 5.4, .3, { at: 'forge' }),
  // The hay wagon drawn up against the barn's west wall, north of its big
  // doors' apron, its tongue run out south along the wall toward them,
  // waiting to be forked in.
  P('hayWagon', 'hay-wagon', 45.9, -3.5, -q, { at: 'barn' }), // (drawn up against the barn: the lane to the gully wall is a robot's, stage 5 review)
  // Rain barrels under the eaves at three house corners, tucked against the
  // gable walls (the cape's and the rear houses' front corners).
  P('rainBarrel', 'barrel-cape', 45.331, -15.624, -.04, { at: 'cape' }),
  P('rainBarrel', 'barrel-lit-cape', 34.289, -29.566, -.08, { at: 'lit-cape' }),
  P('rainBarrel', 'barrel-saltbox-2', 41.11, -29.671, .05, { at: 'saltbox-2' }),
  // The farm: a plough left where it stopped and a harrow in the grass north
  // of the house; a scythe leaning on the pasture fence by the yard.
  // (Moved at the stage 5 merge: the goat's pen and the washing line took the yard.)
  P('plough', 'plough', -46.3, 30, .5), // (hard by the terrace wall, not 0.9 m off it: no squeeze, stage 5 review)
  P('harrow', 'harrow', -40, 33.5, -.2),
  P('scythe', 'scythe', -50.35, 35.2, q, { on: [-50.8, 34.9] }),
  // --- The graveyard's edge and the hearse house ---
  // The bier outside the hearse house (by its east side, clear of both
  // doorways) with the empty coffin on it; the coffin's lid leaning on the
  // hearse house's west wall by the open grave; the digger's barrow of earth
  // a step from the grave; an unlit lantern left on a table tomb.
  P('bier', 'bier', -22.85, -4.2, q, { at: 'hearse-house' }),
  P('coffinLid', 'coffin-lid', -28.07, -7.3, -q, { at: 'hearse-house', by: 'open grave' }),
  P('diggersBarrow', 'diggers-barrow', -25.1, -2.4, .35),
  P('tombLantern', 'tomb-lantern', -31.55, -13.75, .4, { on: [-31.55, -13.75], lift: .8 }),
  // --- The stream and the mill ---
  // A skiff pulled half out on the mill pond's south bank (bow up the bank);
  // an eel pot below the dam, its mouth in the stream; the washtub on the bank
  // below the farm; two spare millstones on the mill's east wall, past the
  // door and its grain.
  P('rowboat', 'rowboat', 30.58, 27.69, -1.4, { bank: true }), // (half a metre further up the bank, so its box reaches past the middle and stays dry)
  P('eelPot', 'eel-pot', 10.2, 23.8, -1.5, { bank: true }),
  P('washTub', 'wash-tub', -44, 25.8, .3),
  P('spareMillstones', 'millstones', 27.03, 16.06, q, { at: 'mill' }),
  // --- The woods ---
  // A fire long dead on the knoll's open crest in the North Woods; two cairns
  // flanking the back trail where it enters the woods; in the West Woods by
  // the west-flank path, a collapsed lean-to and a deer carcass under the tree
  // beside it.
  P('fireRing', 'fire-ring', -13.6, -52.4, 0),
  P('cairn', 'cairn-1', -8.3, -42.2, 0),
  P('cairn', 'cairn-2', -6.7, -46.4, 1.3),
  P('leanTo', 'lean-to', -51.65, 8.15, .65),
  P('deerCarcass', 'deer', -54.3, 6.6, .9),
];
