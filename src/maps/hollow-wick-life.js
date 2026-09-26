// Hollow Wick's life (stage 5, s5-life): where the few things that move are.
// Plain data, spread into hollow-wick.js (props, and the buildings' flags
// through withLife); the models and the motion are src/world/hollow-life.js.
// Checked by tests/hollow-life.test.js against the placement rules
// (tests/hollow-life-rules.js: doorways, paths, spawns, bases, targets, the
// drag trail, set pieces, trunks, slopes).
//
// x east, z south, metres; `angle` as every prop's (local x along
// (cos a, -sin a)).

// The farm's back yard (north of the farm, between it and the terrace's
// edge): the goat's pen, and the washing line nearer the house.
const FARM = [
 { type: 'goatPen', id: 'life-goat-pen', x: -42.6, z: 31.65, angle: .04 },
 { type: 'laundryLine', id: 'life-washing', x: -45.7, z: 34.45, angle: .03 },
];

// Stick effigies along the North Woods' track, from where it leaves the back
// trail to where it comes out by the old apple trees: each hangs from a dead
// limb reaching 1.4-2.2 m out from its tree (`tree`: the trunk), 1.8-2.2 m off
// the track's middle (clear of its walking lane), where nothing (no limb, no
// canopy) is between it and the camera, so it shows from above even before the
// canopies thin round you. `hang`: the limb's end over the ground; `string`:
// how far below it the figure hangs; `scale`: its size.
const EFFIGIES = [
 { tree: [-5.09, -49.19], x: -5, z: -47, hang: 3.3, string: .35, scale: .95 },
 { tree: [-3.65, -52.77], x: -2.5, z: -52, hang: 3.4, string: .3, scale: 1.05 },
 { tree: [5.25, -51.31], x: 5, z: -53, hang: 3.2, string: .45, scale: .8 },
 { tree: [11.45, -57.83], x: 11, z: -56.5, hang: 3.3, string: .3, scale: .95 },
 { tree: [18.76, -47.97], x: 17, z: -48.5, hang: 3.15, string: .4, scale: .75 },
 { tree: [19.51, -43], x: 18, z: -44, hang: 3.4, string: .35, scale: 1 },
].map((e, i) => ({ type: 'effigy', id: `life-effigy-${i}`, angle: 0, ...e }));

export const HW_LIFE = [...FARM, ...EFFIGIES];

// Loose shutters: [building, side, window offset, hinge side (-1: the
// window's left as seen from outside, 1: its right)], each on the side away
// from the door. The windows face the street, the back lane and the farm yard.
export const LOOSE_SHUTTERS = [['cape', 'front', -3, -1], ['saltbox-2', 'front', 3, 1], ['farm', 'front', -2.6, -1]];
// Chimneys that smoke: [building, chimney index]. The lit house: someone is home.
export const SMOKING_CHIMNEYS = [['lit-cape', 0]];

// The buildings with those flags set (a window's `loose`: its hinge side; a
// chimney's `smoke`). world/colonial-buildings.js reads them.
export function withLife(buildings) {
 return buildings.map(b => {
  const loose = LOOSE_SHUTTERS.filter(([id]) => id === b.id), smoke = SMOKING_CHIMNEYS.filter(([id]) => id === b.id);
  if (!loose.length && !smoke.length) return b;
  return {
   ...b,
   windows: (b.windows || []).map(w => { const hit = loose.find(([, side, offset]) => side === w.side && offset === w.offset); return hit ? { ...w, loose: hit[3] } : w; }),
   ...(b.chimneys && { chimneys: b.chimneys.map((c, i) => smoke.some(([, k]) => k === i) ? { ...c, smoke: true } : c) }),
  };
 });
}
