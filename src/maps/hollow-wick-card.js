// s3-look: Hollow Wick's map card (maps.js MAP_LIST `card`): its one line and
// where its picture is taken from (ui/map-cards.js, the shipped picture
// src/assets/thumbnails/hollow-wick.webp, made by tools/capture-thumbnail.mjs
// from `thumbnail`). In the menus since v0.990a (owner): the Practice map
// page's second card, the SOLO page and the lobby.
export const HOLLOW_WICK_CARD = Object.freeze({
 // Short, quiet, wrong: something happened here.
 line: 'Supper is still on the table. Nobody came home.',
 // The meetinghouse whole, its belfry and the crow on its ridge, the burying
 // ground below it with the hearse house and the tomb's turf roof, the woods'
 // autumn line down its west side (v0.990a, owner: as striking as Deadwater's
 // farmhouse and corn; the old spot at -30, -14 cut the meetinghouse in half).
 // `lift`: the capture's brightness for the card only (the stronger dusk reads
 // too dark at card size; tools/capture-thumbnail.mjs).
 thumbnail: Object.freeze({ x: -40, z: -18, height: 44, lift: 1.3 }),
});
