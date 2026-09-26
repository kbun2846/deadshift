// Hollow Wick's breakables (stage 2, task s2-breakables): where the village
// left its pumpkins, cider, apples, grain, coops, skeps, crocks, lanterns,
// cordwood and barrows. Grouped the way people leave things: by a door's
// corner, along a wall, in a yard, on the field among the shocks. Placed
// round the building pads (hollow-wick.js BUILDING_PADS): 1 m off the walls,
// 2.5 m clear in front of the long sides (the doors), off every path, out of
// the stream, off the decks and the retaining walls, 3 m or more from a
// base's centre (a few near each base as light cover), on ground no steeper
// than 0.35 (tests/hollow-breakables.test.js checks all of it).
// Types and models: world/hollow-breakables.js; how they break:
// effects/breakable-effects.js.
const q = Math.PI / 2;
const P = (type, x, z, angle = 0, extra) => ({ type, x, z, angle, ...extra });

export const HOLLOW_WICK_BREAKABLES = [
  // The tavern's east yard (between it and the saltbox): the cider it served,
  // a crate of apples for it, crocks by the back.
  P('ciderKeg', 32, -18.2, q), P('ciderKeg', 32.1, -20.4, q + .05), P('appleCrate', 31.9, -16.1, .1), P('stoneware', 32.2, -23, q),
  // Lanterns at the tavern's front corners, lighting the street.
  P('tinLantern', 17.3, -12.4, Math.PI), P('tinLantern', 31.3, -13.1, 0),
  // Between the saltbox and the cape: a crate stood in the gap.
  P('appleCrate', 44.5, -19.5, q),
  // A lantern at the east end of the street.
  P('tinLantern', 45.3, -12.3, 0),
  // The lit cape: cordwood along its west wall, pumpkins by its corner.
  P('cordwood', 24.4, -33.2, q), P('pumpkin', 24.2, -30.2, 0, { scale: 1.1 }), P('pumpkin', 23.3, -30.7, 0, { scale: .85 }),
  // The yard between the lit cape and the second saltbox: a coop, three skeps,
  // a barrow of squash brought in from the field.
  P('chickenCoop', 37.8, -34.8, .1), P('beeSkep', 37, -37.8), P('beeSkep', 37.9, -38.4), P('beeSkep', 40.6, -38.1), P('squashBarrow', 38, -31, -.2),
  // The smithy: cordwood for the forge by its west end, a lantern by the forge.
  P('cordwood', 20.4, 4.3, q), P('tinLantern', 36.4, -1.5, 0),
  // Base A (the town yard): light cover.
  P('grainSacks', 25.6, -5.2, .3), P('ciderKeg', 34.6, -4.3, -.2),
  // The barn's south end: squash, pumpkins, sacks waiting to go up.
  P('squashBarrow', 50.5, 8.3, .1), P('pumpkin', 53, 8.2), P('pumpkin', 53.8, 7.9, 0, { scale: .8 }), P('grainSacks', 47.5, 7.7, -.2),
  // The mill's east end: grain waiting to be ground, sacks of meal.
  P('grainSacks', 28.2, 15.4, q), P('grainSacks', 31.6, 16, q + .2),
  // The fork: a crate of apples and pumpkins left at the roadside, cider.
  P('appleCrate', -14.1, 2.3, .4), P('pumpkin', -6.2, 2.1), P('pumpkin', -5.4, 2.8, 0, { scale: .8 }), P('ciderKeg', -15.8, -.6, .5),
  // A lantern where the north lane leaves the fork.
  P('tinLantern', -7.3, -6.5, 0),
  // North of base B (the horse sheds' yard): cordwood and grain as light
  // cover toward the woods.
  P('cordwood', -32.7, -48.8, .15), P('grainSacks', -26.4, -48, -.3),
  // The farm: a coop and crates in the east yard, skeps along the west wall,
  // crocks by the kitchen end, a barrow and pumpkins by the south door's
  // corner, cider for the harvest.
  P('chickenCoop', -35.4, 43.1, q), P('appleCrate', -36, 38.8, q), P('appleCrate', -34.1, 41.6, q + .15),
  // (The skeps and crocks stand in the middle of the way between the west
  // wall and the pasture fence, 1.7 m clear of each: a gap a body fits but a
  // robot's nav does not left a pocket robots could not reach, stage 4 audit.)
  P('beeSkep', -48.35, 40.35), P('beeSkep', -48.35, 41.45), P('beeSkep', -48.35, 42.55),
  P('stoneware', -48.05, 43.6, q), P('cordwood', -48.8, 35.1, q),
  P('squashBarrow', -43, 48.2, .15), P('pumpkin', -39.6, 48.3), P('pumpkin', -38.8, 48.9, 0, { scale: .85 }), P('pumpkin', -38.3, 48, 0, { scale: 1.15 }),
  P('ciderKeg', -49.5, 41.6, q),
  // The woodshed: cordwood stacked at both ends.
  P('cordwood', -23, 39, q), P('cordwood', -15, 38.3, q),
  // Behind it: the crocks and a sack of seed grain someone set down.
  P('stoneware', -15.2, 42.4, .2), P('grainSacks', -16.8, 43.8, .2),
  // Base C (the south bank): light cover.
  P('grainSacks', -26.6, 36.4, .4), P('appleCrate', -34.1, 36.9, -.3),
  // The field's west half, among the shocks: uncarved pumpkins in patches,
  // and a barrow of squash half loaded.
  P('pumpkin', -2.4, 33.2), P('pumpkin', -3.7, 34, 0, { scale: .8 }), P('pumpkin', -5, 34.6, 0, { scale: 1.2 }),
  P('pumpkin', 2, 37), P('pumpkin', 3.4, 37.9, 0, { scale: .9 }), P('pumpkin', 2.2, 38.2, 0, { scale: 1.25 }), P('pumpkin', 1.2, 37.7, 0, { scale: .75 }),
  P('pumpkin', 8, 42), P('pumpkin', 8.9, 42.5, 0, { scale: 1.1 }),
  P('pumpkin', -3, 45.2), P('pumpkin', -2.2, 45.7, 0, { scale: .85 }), P('pumpkin', -3.6, 46.1, 0, { scale: 1.15 }),
  P('pumpkin', 16, 44), P('pumpkin', 16.8, 44.6, 0, { scale: .9 }),
  P('pumpkin', 4.9, 32.8, 0, { scale: 1.1 }), P('pumpkin', 6.5, 32.4, 0, { scale: .8 }),
  P('pumpkin', 11.5, 46.5, 0, { scale: 1.2 }), P('pumpkin', 12.5, 47.1, 0, { scale: .8 }),
  P('pumpkin', -9.2, 39.8, 0, { scale: .9 }), P('pumpkin', -8.5, 41.1, 0, { scale: 1.1 }),
  P('squashBarrow', 5.8, 39.7, .6),
  // (Stage 4 audit: the hollow and the old orchard had stretches with none.)
  // The crossings: a lantern and a crate at the bridge's north approach,
  // grain at the log's north end and a lantern at its south, crocks left by
  // the ford, a lantern and a keg at the footbridge's ends.
  P('tinLantern', -16, 13.2), P('appleCrate', -16.8, 12.88, .3),
  P('grainSacks', -30.84, 13.18, .2), P('tinLantern', -35.03, 27.47),
  P('stoneware', -4.5, 28.6, .4),
  P('tinLantern', 43, 17.6), P('ciderKeg', 38.56, 30.17, .3),
  // The old orchard: two crates of windfalls nobody carried in.
  P('appleCrate', 3, -34, .2), P('appleCrate', 3.5, -35.6, -.3),
  // Cordwood cut at the woods' edges (the North Woods by the back trail, the West Woods).
  P('cordwood', -3.18, -39.38, .1), P('cordwood', -44, -31, 1.3),
].map((p, i) => ({ id: `hw-b${i}`, ...p }));
