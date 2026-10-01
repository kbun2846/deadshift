// Lumen's map card (maps.js MAP_LIST `card`): where its picture is taken from
// (ui/map-cards.js; the shipped picture src/assets/thumbnails/lumen.webp, made
// by `PORT=<port> node tools/capture-thumbnail.mjs lumen` from `thumbnail`).
// The Crossroads from above (owner, 2026-10-01: "something distinct with good
// detail"): the scramble crossing's stripes, the island with its gantry and the
// koi hologram circling over it, the taxi, the stopped and crashed cars, the
// lit shopfronts at the corners. `lift`: the night is dark at card size.
export const LUMEN_CARD = Object.freeze({
 thumbnail: Object.freeze({ x: 10, z: 4, height: 40, lift: 1.35 }),
});
