// s3-look: Hollow Wick's map card (maps.js MAP_LIST `card`): its one line and
// where its picture is taken from (ui/map-cards.js, the shipped picture
// src/assets/thumbnails/hollow-wick.webp, made by tools/capture-thumbnail.mjs
// from `thumbnail`). The map stays dev-only (Developer tools > World > Map
// in progress) until the owner says otherwise: the card shows wherever the
// map is offered (the SOLO page's map picker once it is loaded).
export const HOLLOW_WICK_CARD = Object.freeze({
 // Short, quiet, wrong: something happened here.
 line: 'Supper is still on the table. Nobody came home.',
 // Over the terraced slope: the town's edge, the fork, the stream and the mill.
 thumbnail: Object.freeze({ x: 10, z: 4, height: 44 }),
});
