// A terrain map's decks over its streams (map.terrain.decks: the bridge, the
// log, the footbridge), drawn as plain plank decks until their own builds
// (stage 2). Each runs between the midpoints of its short sides (its ends lie
// on the banks, a hand below its top), and stops short wherever a bank rises
// over its top instead of running on into it.
//
// Anyone can wade in under a deck (simulation.js `below`): while the player
// is under one, that deck turns see-through for them, as a roof lifts when
// you walk in under it (owner, 2026-09-26).
import * as THREE from 'three';

const PLANK = '#6f6a62', SEE_THROUGH = .22;

// Builds the decks into the view (view.deckMeshes, one mesh each: each
// fades on its own).
export function buildCrossingDecks(view, ground, map) {
 view.deckMeshes = [];
 (map.terrain?.decks || []).forEach((deck, index) => {
  const [a, b, c, d] = deck.poly, mid = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
  const ab = Math.hypot(b[0] - a[0], b[1] - a[1]), bc = Math.hypot(c[0] - b[0], c[1] - b[1]);
  const [e0, e1] = ab < bc ? [mid(a, b), mid(c, d)] : [mid(b, c), mid(d, a)], length = Math.hypot(e1[0] - e0[0], e1[1] - e0[1]), width = Math.min(ab, bc);
  const ux = (e1[0] - e0[0]) / length, uz = (e1[1] - e0[1]) / length, cx = (e0[0] + e1[0]) / 2, cz = (e0[1] + e1[1]) / 2;
  // Out from the middle each way while the ground (across the deck's width)
  // stays under its top.
  const clear = s => [-.45, 0, .45].every(k => ground.drawnHeightAt(cx + ux * s - uz * width * k, cz + uz * s + ux * width * k) < deck.h - .02);
  const reach = sign => { let s = 0; while (s < length / 2 - .05 && clear(sign * (s + .05))) s += .05; return s; };
  const back = reach(-1), ahead = reach(1), span = back + ahead, along = (ahead - back) / 2;
  if (span < .5) return;
  const material = new THREE.MeshStandardMaterial({ color: PLANK, roughness: .95, metalness: 0, transparent: true, opacity: 1 });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, .18, span), material);
  mesh.position.set(cx + ux * along, deck.h - .09, cz + uz * along); mesh.rotation.y = Math.atan2(ux, uz);
  mesh.castShadow = true; mesh.receiveShadow = true; mesh.name = 'deck:' + (deck.id || index);
  view.scene.add(mesh);
  view.deckMeshes.push({ mesh, index, fade: 1 });
 });
}

// Each frame: the deck the player is under fades to see-through; the rest
// come back (a quarter of a second either way).
export function updateCrossingDecks(view, sim, dt) {
 if (!view.deckMeshes?.length) return;
 const p = sim.player, under = p.below ? view.ground.deckAt(p.x, p.z) : -1;
 for (const d of view.deckMeshes) {
  const want = d.index === under ? SEE_THROUGH : 1;
  if (d.fade === want) continue;
  d.fade = want > d.fade ? Math.min(want, d.fade + dt * 4) : Math.max(want, d.fade - dt * 4);
  d.mesh.material.opacity = d.fade;
  // (Opaque again, it sorts and writes depth as before.)
  d.mesh.material.depthWrite = d.fade > .99;
 }
}
