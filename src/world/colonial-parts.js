// Hollow Wick's building parts that stand outside a building's walls, or in
// the open forge shed (s2-buildings): prop types, spread into map-kit.js
// PROP_TYPES. Drawn by world/colonial-buildings.js makeColonialPart (the
// portico itself is drawn with the meetinghouse; its prop is only its two
// half walls). None breaks.
export const COLONIAL_TYPES = {
  // The meetinghouse's south portico: a half wall each side, 0.85 m, with a
  // column at its front end (the front between the columns is open).
  colonialPortico: { w: 5, d: 1.7, health: null, collisionBoxes: [[-2.45, 0, .32, 1.6], [2.45, 0, .32, 1.6]] },
  // The forge: a stone hearth with its glowing coal bed, the anvil on its
  // stump, the quench tub.
  forgeHearth: { w: 1.3, d: 1, health: null },
  anvil: { w: .75, d: .45, health: null },
  quenchTub: { w: .8, d: .8, health: null },
};
