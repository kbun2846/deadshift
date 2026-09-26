// Hollow Wick's buildings (stage 2, s2-buildings): one building on each of
// the map's BUILDING_PADS, the same id, place, size and turn, standing at the
// pad's height (baseY). A building with baseY makes its own pad in the terrain
// bake (world/terrain-bake.js terrainPads: padMargin and padBlend carry the
// pad's margin and blend), so the terrain spec lists no pads of its own.
//
// Drawn by world/colonial-buildings.js (style 'colonial'): steep shingled
// roofs (gable, saltbox, gambrel, a lean-to), big chimneys, clapboard,
// small-pane windows, plank doors, plank stoops under shed hoods.
//
// Sides: 'front' is the building's +z side (south when not turned), 'back'
// -z, 'left' -x, 'right' +x. `doors`: a doorway in the middle of each listed
// side, `doorWidth` wide. `openings`: extra doorways anywhere on a side
// ({ side, offset, width }; map-kit.js localOpenings). `windows`: openings
// you can see and shoot through but not walk through (a low sill);
// `boarded` ones are shuttered shut (solid wall).
//
// `roof`: { kind: 'gable' | 'saltbox' | 'gambrel' | 'shed' | 'mound', axis:
// 'x' (ridge along the building's width) | 'z', rise: ridge above the eave,
// high: which way a shed roof rises ('back' | 'front') }. `height` is the
// eave (the walls' collider height). `chimneys`: [{ at: along the ridge,
// across: off it, kind: 'brick' | 'stone', w, d }].
//
// interiorStyle names are shared with the interiors builder: 'colonial-house',
// 'colonial-lit-house', 'colonial-tavern', 'meetinghouse', 'smithy', 'barn',
// 'gristmill', 'shed', 'horse-sheds', 'tomb'. The forge is an open shed with
// no interior: its hearth, anvil and tub are props (COLONIAL_TYPES).

// The palette (design notes: Houses, Meetinghouse).
export const COLONIAL = {
  clapboard: '#7d7a72', oxblood: '#5e2b24', barnRed: '#7a3a2e', grey: '#6f6a62',
  shingle: '#3a3632', shingle2: '#4a4540', brick: '#6e4436', stone: '#7f7b72',
  bone: '#cfc8b6', boneRoof: '#9a968c', granite: '#8b8a80', turf: '#5a5840',
};

const w = (side, offset, width = 1, extra = {}) => ({ side, offset, width, ...extra });

// Per building: everything but the place, which comes from its pad.
const SPECS = {
  tavern: { height: 3.3, color: COLONIAL.clapboard, roofColor: COLONIAL.shingle, interiorStyle: 'colonial-tavern',
    roof: { kind: 'gable', axis: 'x', rise: 3.1 }, doors: ['front', 'back', 'left'],
    chimneys: [{ at: -2.4, kind: 'brick', w: 1.2, d: 1 }, { at: 2.6, kind: 'brick', w: 1.2, d: 1 }],
    windows: [w('front', -3.2), w('front', 3.2), w('front', -5, 1, { boarded: true }), w('front', 5), w('back', -3.4), w('back', 3.4, 1, { boarded: true }),
      w('left', 3), w('right', -2), w('right', 2)],
    features: ['tavern-sign'], trim: '#6e5446' },
  saltbox: { height: 2.9, color: COLONIAL.oxblood, roofColor: COLONIAL.shingle2, interiorStyle: 'colonial-house',
    roof: { kind: 'saltbox', axis: 'x', rise: 2.9 }, doors: ['front', 'back'], chimneys: [{ at: 0, kind: 'brick', w: 1.4, d: 1.1 }],
    windows: [w('front', -3), w('front', 3), w('back', 2.8), w('left', 1.6), w('right', -1.6, 1, { boarded: true })] },
  cape: { height: 2.9, color: COLONIAL.clapboard, roofColor: COLONIAL.shingle, interiorStyle: 'colonial-house',
    roof: { kind: 'gable', axis: 'x', rise: 2.8 }, doors: ['front', 'back'], chimneys: [{ at: 0, kind: 'stone', w: 1.5, d: 1.2 }],
    windows: [w('front', -3), w('front', 3, 1, { boarded: true }), w('back', -2.8), w('left', -1.5), w('right', 1.5)] },
  gambrel: { height: 2.6, color: '#76736b', roofColor: COLONIAL.shingle2, interiorStyle: 'colonial-house',
    roof: { kind: 'gambrel', axis: 'x', rise: 3 }, doors: ['front', 'back'], chimneys: [{ at: .2, kind: 'brick', w: 1.4, d: 1.1 }],
    windows: [w('front', -3), w('front', 3), w('back', 3, 1, { boarded: true }), w('left', 1.6), w('right', -1.6)] },
  // The lit house: its front window at offset -2.6 glows (a lantern still
  // lit inside; the interiors builder's lantern stands on that sill).
  'lit-cape': { height: 2.8, color: COLONIAL.clapboard, roofColor: COLONIAL.shingle, interiorStyle: 'colonial-lit-house',
    roof: { kind: 'gable', axis: 'x', rise: 2.7 }, doors: ['front', 'back'], chimneys: [{ at: 0, kind: 'brick', w: 1.3, d: 1.1 }],
    windows: [w('front', -2.6, 1, { lit: true }), w('front', 2.6), w('back', 2.4, 1, { boarded: true }), w('left', 1.4), w('right', -1.4)] },
  'saltbox-2': { height: 2.9, color: COLONIAL.clapboard, roofColor: COLONIAL.shingle2, interiorStyle: 'colonial-house',
    roof: { kind: 'saltbox', axis: 'x', rise: 2.9 }, doors: ['front', 'back'], chimneys: [{ at: -.3, kind: 'stone', w: 1.5, d: 1.2 }],
    windows: [w('front', -3), w('front', 3), w('back', -2.8, 1, { boarded: true }), w('left', -1.5), w('right', 1.5)] },
  smithy: { height: 2.7, color: COLONIAL.grey, roofColor: COLONIAL.shingle, interiorStyle: 'smithy',
    roof: { kind: 'gable', axis: 'x', rise: 2.3 }, doors: ['back', 'left'], chimneys: [{ at: -3.2, kind: 'stone', w: 1.1, d: 1.3 }],
    windows: [w('front', -1.8, 1, { boarded: true }), w('front', 1.8), w('back', 2.4)] },
  // The open forge shed beside the smithy: three wide open sides, solid only
  // against the smithy. Its hearth, anvil and tub are props (COLONIAL_TYPES).
  forge: { height: 2.5, color: '#5d554c', roofColor: COLONIAL.shingle2, doorWidth: 3.3,
    roof: { kind: 'gable', axis: 'x', rise: 1.5 }, doors: ['back', 'front', 'right'], windows: [], features: ['forge-stack'], open: true },
  // The English barn: end-on to the street, big doors on its long west side.
  barn: { height: 3.6, color: COLONIAL.barnRed, roofColor: COLONIAL.shingle2, interiorStyle: 'barn', finish: 'boards', doorWidth: 3.2,
    roof: { kind: 'gable', axis: 'z', rise: 3.4 }, doors: ['left', 'back'],
    windows: [w('right', -3, .8), w('right', 3, .8), w('front', 0, .9)], features: ['hay-door'] },
  // The gristmill: stone below, clapboard above. Its south wall (z 16.75)
  // stays plain: the wheel and race are another builder's.
  mill: { height: 4, color: COLONIAL.clapboard, roofColor: COLONIAL.shingle, interiorStyle: 'gristmill', doorWidth: 2.2, stone: 1.8,
    roof: { kind: 'gable', axis: 'x', rise: 2.5 }, doors: ['back', 'left', 'right'], windows: [w('back', -3, .9), w('back', 3, .9)], features: ['loft-door'] },
  // The white meetinghouse: the landmark. Open belfry on the east gable, the
  // pedimented south portico, doors south, east (through the tower) and west.
  meetinghouse: { height: 4.2, color: COLONIAL.bone, roofColor: COLONIAL.boneRoof, trim: '#b9b2a0', interiorStyle: 'meetinghouse',
    roof: { kind: 'gable', axis: 'x', rise: 3.4 }, doors: ['front', 'left', 'right'],
    windows: [w('front', -3.3, 1.1), w('front', 3.3, 1.1), w('front', -5.4, 1.1), w('front', 5.4, 1.1),
      w('back', 0, 1.1), w('back', -3.4, 1.1), w('back', 3.4, 1.1, { boarded: true }), w('back', -5.4, 1.1), w('back', 5.4, 1.1),
      w('left', -3, .9), w('left', 3, .9)],
    features: ['belfry', 'portico'] },
  // Four open bays facing base B (their back, north-east); the closed side
  // faces the summit.
  'horse-sheds': { height: 2.5, color: COLONIAL.grey, roofColor: COLONIAL.shingle2, interiorStyle: 'horse-sheds',
    roof: { kind: 'shed', axis: 'x', rise: .9, high: 'back' }, doors: [], windows: [],
    openings: [-4.5, -1.5, 1.5, 4.5].map(offset => ({ side: 'back', offset, width: 2.4 })), open: true },
  // The hillside tomb vault: earth-banked, a granite face with an open plank
  // door (east), its north wall fallen in (a low heap: shoot over, not walk).
  tomb: { height: 2.2, color: '#6a665c', roofColor: COLONIAL.turf, interiorStyle: 'tomb', doorWidth: 1.4,
    roof: { kind: 'mound', axis: 'x', rise: .8 }, doors: ['right'], windows: [w('back', .2, 1.7, { collapsed: true })], features: ['granite-face'] },
  'hearse-house': { height: 2.4, color: COLONIAL.oxblood, roofColor: COLONIAL.shingle, interiorStyle: 'shed', doorWidth: 2.4,
    roof: { kind: 'gable', axis: 'z', rise: 1.6 }, doors: ['front'], openings: [{ side: 'right', offset: 0, width: 1.1 }], windows: [] },
  farm: { height: 2.8, color: COLONIAL.clapboard, roofColor: COLONIAL.shingle2, interiorStyle: 'colonial-house',
    roof: { kind: 'gable', axis: 'x', rise: 2.7 }, doors: ['front', 'right'], chimneys: [{ at: -.4, kind: 'stone', w: 1.4, d: 1.1 }],
    windows: [w('front', -2.6), w('front', 2.6), w('back', -2), w('back', 2, 1, { boarded: true }), w('left', 1.4)] },
  woodshed: { height: 2.2, color: COLONIAL.grey, roofColor: COLONIAL.shingle, interiorStyle: 'shed', doorWidth: 3,
    roof: { kind: 'gable', axis: 'x', rise: 1.3 }, doors: ['front'], openings: [{ side: 'back', offset: 1.2, width: 1.1 }], windows: [], open: true },
};

// The buildings, one per pad (hollow-wick.js BUILDING_PADS).
export function hollowWickBuildings(pads) {
  return pads.map(p => {
    const spec = SPECS[p.id];
    if (!spec) throw new Error(`Hollow Wick: no building for pad ${p.id}`);
    return {
      id: p.id, x: p.x, z: p.z, w: p.w, d: p.d, angle: p.angle || 0, baseY: p.h,
      ...(p.margin !== undefined && { padMargin: p.margin }), ...(p.blend !== undefined && { padBlend: p.blend }),
      label: '', doorWidth: 2.4, style: 'colonial', ...spec,
    };
  });
}

// Solid parts that stand outside a building's walls or in the open forge
// (props: world/colonial-parts.js COLONIAL_TYPES). Local boxes turn with the
// building. The portico: its two half walls (0.85 m, columns at their ends).
export function hollowWickBuildingProps(pads) {
  const pad = Object.fromEntries(pads.map(p => [p.id, p]));
  const at = (id, lx, lz) => { const p = pad[id], a = p.angle || 0, c = Math.cos(a), s = Math.sin(a); return { x: Math.round((p.x + lx * c + lz * s) * 1000) / 1000, z: Math.round((p.z - lx * s + lz * c) * 1000) / 1000, angle: a }; };
  const m = pad.meetinghouse, f = pad.forge;
  return [
    { id: 'meetinghouse-portico', type: 'colonialPortico', ...at('meetinghouse', 0, m.d / 2 + .85) },
    { id: 'forge-hearth', type: 'forgeHearth', ...at('forge', -f.w / 2 + .95, -.35) },
    { id: 'forge-anvil', type: 'anvil', ...at('forge', .55, .35), angle: .5 },
    { id: 'forge-tub', type: 'quenchTub', ...at('forge', -1.5, 1.45) },
  ];
}
