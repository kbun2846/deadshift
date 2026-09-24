import * as THREE from 'three';
import { isDemanding } from '../settings.js';

// Cosmetic overflights. Birds cross the camera every so often, slow enough to
// follow with the eye and small enough to read as movement at the edge of
// attention. They carry no simulation state: nothing collides with them, they
// deal and take nothing, and deleting this module changes no outcome.
//
// They are flat, not modelled. Every part is a zero-thickness outline lying in
// the ground plane, so from the overhead camera a bird is a 2D silhouette
// sliding over the world — the same drawn language as the rest of the game,
// rather than a little sculpture seen from above. A wing beat is therefore not
// a rotation you could see edge-on: it is the span foreshortening, which is
// exactly what a beating wing does when you are looking down on it.

export const BIRD_INTERVAL = 60;
// Metres between the birds themselves at closest approach, not between paths.
export const BIRD_CLEARANCE = 9;
// A crossing does not end where the camera stops caring. A player who decides
// to walk after a bird and watch it should see it reach the edge of the world
// and keep going, so the path is laid past the map rather than past the view.
export const EXIT_MARGIN = 26;
// How many lanes to try before giving up on a crossing. Flights are long now,
// so two birds are often in the air together and the first lane drawn is not
// always clear; re-rolling the height and the side finds one nearly always.
export const LANE_ATTEMPTS = 6;
// Crossings are level but not axis-locked: a shallow rake across the screen,
// bottom-right to upper-left and so on. Steeper than this and it stops reading
// as a bird passing over and starts reading as one cutting the frame in half.
export const BIRD_TILT = .34;
export const VULTURE_CHANCE = .22;
// How long a bird should take to cross the view, edge to edge.
export const CROSS_SECONDS = 3.6;
// Spawned this far outside the visible span on each side, so it enters and
// leaves cleanly instead of appearing.
export const APPROACH = .78;
// A bird must never cross the spot the player is standing on: the silhouette
// passing over the character reads as something in the fight. Paths are laid
// at least this far to one side.
export const PLAYER_CLEARANCE = 7;
// Where the view is too short across the path for the full clearance -- a
// left-to-right crossing -- it gives way, but never below this.
export const MIN_PLAYER_CLEARANCE = 3;

export const SPECIES = Object.freeze({
  // Long swept wings, deeply forked tail, fast shallow beat.
  swift: { eye: '#33302a', body: '#b9b39a', wing: '#a49d84', stream: '#e6e2d4',
    length: .55, chord: .12, span: .5, sweep: .5, taper: .35, fork: .55,
    flap: [2.2, 3], beat: .5, pace: 1.08, altitude: [7, 10], scale: [1.3, 1.55] },
  // Compact, rounded wings, short square tail, quick flurry of a beat.
  finch: { eye: '#3a3026', body: '#cdb88c', wing: '#b7a075', stream: '#efe4c9', belly: '#e6d7ae',
    length: .42, chord: .13, span: .34, sweep: .2, taper: .6, fork: 0,
    flap: [2.8, 3.6], beat: .54, pace: 1, altitude: [8, 11.5], scale: [1.25, 1.45] },
  // Broad squared wings, fanned tail, slow heavy beat.
  crow: { eye: '#2f3331', body: '#9aa09b', wing: '#868d88', stream: '#dbe0dc',
    length: .7, chord: .19, span: .62, sweep: .14, taper: .76, fork: 0, fan: 1.45,
    flap: [1.6, 2.2], beat: .46, pace: .92, altitude: [9, 13], scale: [1.35, 1.6] },
  // Plank wings with splayed tip feathers, barely beating. Mostly holding shape.
  vulture: { body: '#a3907a', wing: '#8d7a64', stream: '#e3d6c2', skin: '#c98d86', ruff: '#efe7d6', beak: '#e8d9a8', eye: '#2b2520',
    length: 1.05, chord: .34, span: 1.05, sweep: .06, taper: .9, fork: 0, fan: 1.2,
    fingers: 3, flap: [.3, .5], beat: .15, pace: .78, altitude: [10, 14], scale: [1.05, 1.25] },
});
export const FLOCK = ['swift', 'finch', 'crow'];
export const CYCLE = [...FLOCK, 'vulture'];

// Closest approach of two birds moving at constant velocity, over the window
// both are still airborne. Used to refuse a path rather than resolve one:
// nothing ever steers, so a flight that could come close is simply not taken.
export function closestApproach(a, b) {
  // Remaining airtime on each side; a bird without an age has not flown yet.
  const window = Math.min((a.life ?? Infinity) - (a.age ?? 0), (b.life ?? Infinity) - (b.age ?? 0));
  if (!(window > 0)) return Infinity;
  const px = a.x - b.x, py = a.y - b.y, pz = a.z - b.z;
  const vx = a.vx - b.vx, vy = a.vy - b.vy, vz = a.vz - b.vz;
  const speed = vx * vx + vy * vy + vz * vz;
  const at = speed < 1e-9 ? 0 : Math.max(0, Math.min(window, -(px * vx + py * vy + pz * vz) / speed));
  return Math.hypot(px + vx * at, py + vy * at, pz + vz * at);
}

export const pathIsClear = (candidate, flights, clearance = BIRD_CLEARANCE) =>
  flights.every(other => closestApproach(candidate, other) >= clearance);

// The world distance the view spans at a given altitude. A bird nearer the
// camera crosses less ground to cross the same screen, so speed is derived
// from this rather than set per species: every crossing takes the same time
// however high it is flying.
export function viewSpan({ height = 29, fov = 40, aspect = 1.6 } = {}, altitude = 0) {
  const drop = Math.max(2, height - altitude);
  return 2 * Math.tan(fov * Math.PI / 360) * drop * Math.max(1, aspect);
}

// How far a crossing runs each side of the player. Far enough to clear the
// whole map plus a margin when the map's size is known, and a generous
// multiple of the view otherwise, so a bird is never seen to stop existing.
export const crossingReach = (view, span) =>
  Math.max(span * APPROACH, (view?.extent ?? span * 1.7) + EXIT_MARGIN);

// One crossing per minute, at a moment chosen inside that minute rather than on
// the minute, so the rhythm never becomes a metronome.
export class FlightSchedule {
  constructor(interval = BIRD_INTERVAL, random = Math.random) {
    this.interval = interval; this.random = random; this.reset();
  }
  // Roughly one crossing per interval, give or take a sixth of it, and the
  // first a third to a half of the way in. It used to fall anywhere inside
  // each window, so two could come back to back or two minutes could pass
  // with nothing -- which, alongside crossings that started too far away to
  // reach the player, is why nobody was seeing birds.
  reset() { this.time = 0; this.due = this.interval * (.33 + this.random() * .25); }
  update(dt) {
    this.time += dt;
    if (this.time < this.due) return false;
    this.due += this.interval * (5 / 6 + this.random() / 3);
    return true;
  }
}

const range = ([low, high], random) => low + random() * (high - low);
// A closed outline from half a profile, mirrored. Bird shapes are symmetric,
// so only one side is ever authored.
const mirrored = half => {
  const shape = new THREE.Shape();
  shape.moveTo(half[0][0], half[0][1]);
  for (const [x, z] of half.slice(1)) shape.lineTo(x, z);
  for (const [x, z] of [...half].reverse().slice(1)) shape.lineTo(-x, z);
  shape.closePath();
  return shape;
};
// Shape space is (x, y); the bird plane is (x, z) with the nose forward at -z.
// rotateX(+90) maps y onto +z, so an outline authored nose-at--y keeps its nose
// forward. Rotating the other way lands the tail in front, which is subtle on a
// still frame and unmistakable the moment it moves.
const flat = shape => { const geometry = new THREE.ShapeGeometry(shape); geometry.rotateX(Math.PI / 2); return geometry; };
// The same outline given thickness. The extrusion runs along the shape's own
// z, so centring it there before the rotation turns depth into thickness in y
// — a wing with an edge to it, rather than a plank or a sheet of paper.
const solid = (shape, depth) => {
  const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 1 });
  geometry.translate(0, 0, -depth / 2);
  geometry.rotateX(Math.PI / 2);
  return geometry;
};

// A fanned tail rooted inside the body. Authored in the same shape space as
// the wings: +y is aft, so the fan opens towards +z once rotated.
export function tailOutline(spec) {
  const L = spec.length, C = spec.chord, fan = spec.fan ?? .85;
  const root = L * .2, tip = L * .64, half = C * .58 * fan;
  const shape = new THREE.Shape();
  shape.moveTo(-C * .24, root);
  shape.lineTo(C * .24, root);
  shape.lineTo(half, tip);
  // A forked tail notches in at the centre; a fanned one squares off.
  if (spec.fork) { shape.lineTo(half * .34, tip - (tip - root) * .52 * spec.fork); shape.lineTo(-half * .34, tip - (tip - root) * .52 * spec.fork); }
  else shape.lineTo(0, tip - (tip - root) * .12);
  shape.lineTo(-half, tip);
  shape.closePath();
  return shape;
}

// One splayed tip feather, rooted at the origin and reaching out along +x.
export function fingerOutline(spec) {
  const C = spec.chord, reach = spec.span * .24;
  const shape = new THREE.Shape();
  shape.moveTo(0, -C * .07);
  shape.lineTo(reach * .55, -C * .05);
  shape.lineTo(reach, 0);
  shape.lineTo(reach * .5, C * .05);
  shape.lineTo(0, C * .08);
  shape.closePath();
  return shape;
}

// Nose forward at -z, span along x. Head bump, shoulders, waist, tail fan.
export function bodyOutline(spec) {
  const L = spec.length, w = spec.chord * .66, tail = spec.chord * .56 * (spec.fan ?? .85);
  // Four points a side: nose, shoulder, waist, tail corner. At the size these
  // read on screen, anything finer is noise.
  const half = [
    [0, -L * .56],
    [w * .72, -L * .26],
    [w, L * .02],
    [tail, L * .42],
  ];
  half.push(spec.fork ? [tail * .4, L * (.42 - .18 * spec.fork)] : [tail * .72, L * .47]);
  half.push([0, spec.fork ? L * (.42 - .26 * spec.fork) : L * .49]);
  return mirrored(half);
}

// Right wing, root at the origin, reaching out along +x.
export function wingOutline(spec) {
  const { span, chord, sweep, taper } = spec;
  const shape = new THREE.Shape();
  // One clean swept panel: leading edge out to the tip, trailing edge home.
  shape.moveTo(0, -chord * .46);
  shape.lineTo(span * .72, -chord * .34 + span * sweep * .68);
  shape.lineTo(span, -chord * .06 + span * sweep);
  shape.lineTo(span * .88, chord * taper * .44 + span * sweep);
  shape.lineTo(span * .34, chord * .48);
  shape.lineTo(0, chord * .5);
  shape.closePath();
  return shape;
}

export class Birds {
  constructor(scene, { random = Math.random } = {}) {
    this.scene = scene; this.random = random; this.flights = []; this.enabled = true;
    this.schedule = new FlightSchedule(BIRD_INTERVAL, random);
    this.templates = new Map(); this.materials = new Map(); this.solid = true; this.rich = false;
    this.shadowGeometry = null; this.shadowMaterial = null;
    this.cycle = 0; this.onFlap = null; this.heading = random() < .5;
  }

  setQuality(name) {
    // A crossing is a couple of small draws for a few seconds a minute, which
    // even Potato can afford, and the sky is part of the world on every tier.
    this.enabled = true;
    const solid = name === 'balanced' || isDemanding(name);
    // The cache is already keyed by build, so both sets can simply stay
    // resident — eight small groups in total. Clearing it stranded every
    // template's BufferGeometry on the GPU, and the preset is a setting the
    // player can flip as often as they like.
    if (solid !== this.solid) { this.solid = solid; this.clear(); }
    // Extreme: lit, rounder birds with layered feathers and a soft shadow
    // sliding over the ground beneath them.
    const rich = name === 'extreme';
    if (rich !== this.rich) { this.rich = rich; this.clear(); }
    if (!this.enabled) this.clear();
  }

  // Only on teardown, where the GPU buffers genuinely have to go.
  dispose() {
    this.clear();
    for (const template of this.templates.values())
      template.group.traverse(object => object.geometry?.dispose());
    this.templates.clear();
    for (const material of this.materials.values()) material.dispose();
    this.materials.clear();
  }

  #material(color, opacity = 1) {
    if (this.rich && opacity >= 1) {
      const key = 'lit' + color;
      // Flat-shaded and lit by the same sun as the world, so the wings catch
      // the light on the down stroke and the body has a shaded side.
      // Toned down further than the unlit birds' colours: Extreme's warm sun
      // and grade pull a lit light-brown feather toward the colour of the
      // ground below it, and at .72 (then .52) the birds read washed out, like haze over
      // the dirt. Darker (with a touch of their own colour in the shade so the
      // underside is not mud) they stand off the ground as they do on the
      // other presets.
      if (!this.materials.has(key)) this.materials.set(key, new THREE.MeshStandardMaterial({ color: new THREE.Color(color).multiplyScalar(.38), emissive: new THREE.Color(color).multiplyScalar(.05), roughness: .9, metalness: 0, flatShading: true, side: THREE.DoubleSide }));
      return this.materials.get(key);
    }
    const key = color + opacity;
    if (!this.materials.has(key)) this.materials.set(key, new THREE.MeshBasicMaterial({
      color, transparent: opacity < 1, opacity, side: THREE.DoubleSide, depthWrite: opacity >= 1, toneMapped: false,
    }));
    return this.materials.get(key);
  }

  #template(name) {
    const key = (this.rich ? 'rich:' : this.solid ? 'solid:' : 'flat:') + name;
    if (this.templates.has(key)) return this.templates.get(key);
    if (this.solid) return this.#solidTemplate(key, name);
    const spec = SPECIES[name];
    const bird = new THREE.Group();
    bird.add(new THREE.Mesh(flat(bodyOutline(spec)), this.#material(spec.body)));
    if (spec.belly) {
      const belly = new THREE.Mesh(flat(mirrored([[0, -spec.length * .22], [spec.chord * .3, 0], [0, spec.length * .2]])), this.#material(spec.belly));
      belly.position.y = .002; bird.add(belly);
    }
    if (spec.skin) {
      // Bare skin on the head and neck, a ruff at the shoulders, hooked beak.
      // Read from above these are three small shapes, not anatomy.
      const neck = new THREE.Mesh(flat(mirrored([
        [0, -spec.length * .46], [spec.chord * .13, -spec.length * .4], [spec.chord * .1, -spec.length * .26], [0, -spec.length * .22],
      ])), this.#material(spec.skin));
      neck.position.y = .0015;
      const head = new THREE.Mesh(flat(mirrored([
        [0, -spec.length * .58], [spec.chord * .14, -spec.length * .5], [0, -spec.length * .42],
      ])), this.#material(spec.skin));
      head.position.y = .002;
      const beak = new THREE.Mesh(flat(mirrored([
        [0, -spec.length * .64], [spec.chord * .055, -spec.length * .56], [0, -spec.length * .52],
      ])), this.#material(spec.beak));
      beak.position.y = .0025;
      const ruff = new THREE.Mesh(flat(mirrored([
        [0, -spec.length * .3], [spec.chord * .34, -spec.length * .2], [spec.chord * .26, -spec.length * .08], [0, -spec.length * .06],
      ])), this.#material(spec.ruff));
      ruff.position.y = .0012;
      bird.add(ruff, neck, head, beak);
    }
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(side * spec.chord * .26, .001, 0);
      pivot.scale.x = side;
      pivot.userData.side = side;
      const wing = new THREE.Mesh(flat(wingOutline(spec)), this.#material(spec.wing));
      pivot.add(wing);
      if (spec.fingers) {
        // Splayed tip feathers: the one detail that says vulture at a glance.
        for (let i = 0; i < spec.fingers; i++) {
          const finger = new THREE.Mesh(flat(mirrored([
            [0, -spec.chord * .04], [spec.span * .16, -spec.chord * .02], [spec.span * .3, 0],
          ])), this.#material(spec.wing));
          finger.position.set(spec.span * .93, .001, (i - (spec.fingers - 1) / 2) * spec.chord * .2 + spec.span * spec.sweep);
          finger.rotation.y = -(i - (spec.fingers - 1) / 2) * .22;
          pivot.add(finger);
        }
      }
      bird.add(pivot);
    }
    // The slipstream: one soft tapered streak trailing the tail.
    const stream = new THREE.Mesh(flat(mirrored([
      [0, spec.length * .42], [spec.chord * .13, spec.length * 1.1], [0, spec.length * 2.1],
    ])), this.#material(spec.stream, .07));
    stream.position.y = -.002;
    bird.add(stream);
    bird.traverse(object => { if (object.isMesh) { object.castShadow = false; object.receiveShadow = false; } });
    const template = { group: bird, spec };
    this.templates.set(key, template);
    return template;
  }

  // Low poly on purpose: a handful of parts each, sharing one material per
  // colour. Every part overlaps the one it grows out of — a bird assembled
  // from pieces that merely sit near each other reads as broken from above,
  // which is exactly how a floating head and a detached tail looked.
  #solidTemplate(key, name) {
    const spec = SPECIES[name];
    const L = spec.length, C = spec.chord;
    const bird = new THREE.Group();
    // A torso with some mass to it. Seen from directly above, a body sized to
    // the wing chord disappears between the wings and the bird reads as a pair
    // of blades with a head; it needs to be visibly the thing the wings are
    // attached to.
    const round = this.rich ? 1 : 0;
    const shell = new THREE.Mesh(new THREE.IcosahedronGeometry(C * .62, round), this.#material(spec.body));
    shell.scale.set(1, .645, L * .58 / C);
    bird.add(shell);
    // A neck, on every species. Without one the head floats clear of the
    // shoulders and the bird looks like two separate objects flying in
    // formation. It starts inside the shell so there is no seam.
    const neckFrom = -L * .26, neckTo = -L * .44, neckLength = neckFrom - neckTo;
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(C * .3, C * .15, neckLength, this.rich ? 10 : 6), this.#material(spec.skin ?? spec.body));
    neck.rotation.x = Math.PI / 2;
    neck.position.set(0, C * .11, (neckFrom + neckTo) / 2);
    bird.add(neck);
    // The head has to out-measure the neck it sits on, or the two merge into
    // one long snout and the bird looks like it is flying muzzle first.
    const head = new THREE.Mesh(new THREE.IcosahedronGeometry(C * .32, round), this.#material(spec.skin ?? spec.body));
    head.position.set(0, C * .17, -L * .48);
    bird.add(head);
    if (spec.ruff) {
      // The vulture's shoulder ruff, where the bare neck meets the plumage.
      const ruff = new THREE.Mesh(new THREE.ConeGeometry(C * .52, C * .34, 7), this.#material(spec.ruff));
      ruff.rotation.x = -Math.PI / 2; ruff.position.set(0, C * .07, -L * .24);
      bird.add(ruff);
    }
    const beak = new THREE.Mesh(new THREE.ConeGeometry(C * .11, L * .17, 4), this.#material(spec.beak ?? spec.body));
    beak.rotation.x = -Math.PI / 2; beak.position.set(0, C * .17, -L * .58);
    bird.add(beak);
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.IcosahedronGeometry(C * .08, 0), this.#material(spec.eye ?? '#2f2a24'));
      eye.position.set(side * C * .21, C * .25, -L * .51);
      bird.add(eye);
    }
    // A fan rooted inside the body, not a chip floating behind it.
    const tail = new THREE.Mesh(solid(tailOutline(spec), C * .05), this.#material(spec.wing));
    tail.position.y = -C * .02;
    bird.add(tail);
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(side * C * .34, C * .12, 0);
      // Both wings are authored reaching out along +x and mirrored by the
      // pivot, never by the part positions. The beat drives pivot.scale.x, so
      // a wing built out along -x is thrown to the far side of the body on the
      // first frame and the bird flies with one wing missing.
      pivot.scale.x = side;
      pivot.userData.side = side;
      // The swept, tapered outline the flat build already used, given an edge.
      // A box of span by chord is a plank; a bird's wing narrows and rakes
      // back, and at this size that silhouette is the whole read.
      const panel = new THREE.Mesh(solid(wingOutline(spec), C * .07), this.#material(spec.wing));
      pivot.add(panel);
      if (this.rich) {
        // Coverts: a shorter, paler layer over the inner wing, the way a real
        // wing is shingled rather than one sheet.
        const coverts = new THREE.Mesh(solid(wingOutline(spec), C * .05), this.#material(spec.body));
        coverts.scale.set(.58, 1, .72); coverts.position.set(0, C * .05, -C * .06);
        pivot.add(coverts);
        // Primaries at the tip for the species that do not already splay.
        if (!spec.fingers) for (let i = 0; i < 4; i++) {
          const lane = i - 1.5;
          const primary = new THREE.Mesh(solid(fingerOutline(spec), C * .03), this.#material(spec.wing));
          primary.scale.set(.7, 1, .8);
          primary.position.set(spec.span * .8, -C * .01, lane * C * .14 + spec.span * spec.sweep * .92);
          primary.rotation.y = -lane * .14;
          pivot.add(primary);
        }
      }
      if (spec.fingers) for (let i = 0; i < spec.fingers; i++) {
        const finger = new THREE.Mesh(solid(fingerOutline(spec), C * .04), this.#material(spec.wing));
        const lane = i - (spec.fingers - 1) / 2;
        finger.position.set(spec.span * .88, 0, lane * C * .26 + spec.span * spec.sweep);
        finger.rotation.y = -lane * .22;
        pivot.add(finger);
      }
      bird.add(pivot);
    }
    bird.traverse(object => { if (object.isMesh) { object.castShadow = false; object.receiveShadow = false; } });
    const template = { group: bird, spec, solid: true };
    this.templates.set(key, template);
    return template;
  }

  // Straight across the screen, left to right or right to left. No climbs, no
  // dives, no diagonals: a level crossing is calmer to look at. Alternated
  // rather than drawn each time: at one crossing a minute an independent coin
  // lands the same way several times running often enough that the sky looks
  // like it only flows one way.
  #nextBearing() {
    this.heading = !this.heading;
    // A shallow rake either way off the level, so no two crossings trace the
    // same line and the sky does not look ruled.
    return (this.heading ? 0 : Math.PI) + (this.random() * 2 - 1) * BIRD_TILT;
  }

  // `lead` is how far ahead of the focus the bird starts. A scheduled crossing
  // begins out past the map so it is already flying when it reaches the view; a
  // bird summoned from the dev tools starts just off screen, because the point
  // of pressing the button is to look at one now rather than in half a minute.
  #build(name, focus, view, bearing, lead) {
    const random = this.random, spec = SPECIES[name];
    const altitude = range(spec.altitude, random);
    const span = viewSpan(view, altitude);
    // Speed still comes from the view, so a crossing reads at the same pace it
    // always did; only how far it runs before and after has changed.
    const speed = span / CROSS_SECONDS * spec.pace;
    const exit = crossingReach(view, span);
    // Enter just outside the current view, so the bird is on screen within a
    // second or so. Starting past the map edge meant twenty-odd seconds of
    // flight aimed at where the player had been, and in a shooter they have
    // always moved on by then -- crossings happened, but out of sight. The
    // exit still runs off the map so a bird never vanishes in view.
    const entry = Math.max(span * APPROACH, lead ?? 0);
    const dirX = Math.cos(bearing), dirZ = Math.sin(bearing);
    // Offset to one side or the other, far enough that the path can never run
    // over the player standing at the focus.
    // Measured against how much of the view lies across the path, not its
    // width: the view is shorter than it is wide, and a bird ~10m up sees only
    // about seven metres either side of centre top to bottom. The fixed 7m
    // clearance pushed every left-to-right crossing clean out of frame, so
    // half of all birds flew by unseen. The clearance now scales to fit and
    // the path always passes well inside the view.
    const halfWidth = span / 2, halfHeight = halfWidth / Math.max(1, view?.aspect ?? 1.6);
    const across = Math.abs(dirZ) * halfWidth + Math.abs(dirX) * halfHeight;
    const clearance = Math.max(MIN_PLAYER_CLEARANCE, Math.min(PLAYER_CLEARANCE, across * .45));
    const room = Math.max(clearance + .5, across * .72);
    const lateral = (random() < .5 ? -1 : 1) * (clearance + random() * (room - clearance));
    return {
      name, spec, scale: range(spec.scale, random) * Math.max(.6, (view?.height ?? 29) - altitude) / 18,
      x: focus.x - dirX * entry - dirZ * lateral, y: altitude, z: focus.z - dirZ * entry + dirX * lateral,
      vx: dirX * speed, vy: 0, vz: dirZ * speed,
      life: (entry + exit) / speed, age: 0,
      flap: range(spec.flap, random), phase: random() * Math.PI * 2, beats: 0,
    };
  }

  #release(flight) {
    const group = this.#template(flight.name).group.clone(true);
    group.scale.setScalar(flight.scale);
    flight.wings = group.children.filter(child => child.isGroup);
    flight.group = group;
    this.scene.add(group);
    if (this.rich) flight.shadow = this.#shadow(flight);
    this.flights.push(flight);
    return flight;
  }

  // Cosmetic, but still never released onto a path that could bring two birds
  // close: they are refused rather than steered.
  spawn(name, focus, view) {
    if (!this.enabled) return null;
    const bearing = this.#nextBearing();
    for (let attempt = 0; attempt < LANE_ATTEMPTS; attempt++) {
      const flight = this.#build(name, focus, view, bearing);
      if (pathIsClear(flight, this.flights)) return this.#release(flight);
    }
    // Every lane was busy. Hand the direction back so the crossings that do
    // happen still alternate, and leave the sky as it is.
    this.heading = !this.heading;
    return null;
  }

  // Dev tools: one of each in turn, so every shape can be looked at on demand.
  spawnNext(focus, view) {
    const name = CYCLE[this.cycle % CYCLE.length];
    this.cycle++;
    // Just off the edge of the view: on screen within a second, and still
    // flying clear off the map afterwards.
    const flight = this.#build(name, focus, view, this.#nextBearing(), 0);
    // A deliberate spawn is never refused; nudge it clear instead.
    for (let attempt = 0; attempt < 8 && !pathIsClear(flight, this.flights); attempt++) flight.y += BIRD_CLEARANCE;
    return this.#release(flight);
  }

  update(dt, focus, view, hidden = false) {
    if (!this.enabled) return;
    if (this.schedule.update(dt)) {
      this.spawn(this.random() < VULTURE_CHANCE ? 'vulture' : FLOCK[Math.floor(this.random() * FLOCK.length)], focus, view);
    }
    for (const flight of this.flights) {
      flight.age += dt;
      flight.x += flight.vx * dt; flight.y += flight.vy * dt; flight.z += flight.vz * dt;
      const group = flight.group;
      group.position.set(flight.x, flight.y, flight.z);
      // Thrown the way the sun throws every other shadow: 0.6 m across and
      // 0.45 m down the screen per metre of height.
      if (flight.shadow) { flight.shadow.position.set(flight.x + flight.y * .6, .06, flight.z + flight.y * .45); flight.shadow.rotation.y = group.rotation.y; flight.shadow.visible = !hidden; }
      group.rotation.y = Math.atan2(flight.vx, flight.vz) + Math.PI;
      // Seen from above, a beat is the span shortening and lengthening. The
      // down stroke is sharper than the recovery, so it never reads as a hinge.
      // Smoothstep the sine so the wing lingers at the top and bottom of the
      // stroke and sweeps through the middle, instead of moving sinusoidally
      // fast at the extremes. The recovery stays shallower than the down beat.
      const wave = Math.sin(flight.age * flight.flap * Math.PI * 2 + flight.phase);
      const eased = Math.sign(wave) * (1 - (1 - Math.abs(wave)) ** 2);
      const stroke = (eased > 0 ? eased : eased * .68) * flight.spec.beat;
      const reach = Math.cos(stroke);
      for (const [i, pivot] of flight.wings.entries()) {
        pivot.scale.x = (pivot.userData.side ?? (i ? 1 : -1)) * reach;
        pivot.scale.z = 1 + (1 - reach) * .35;
      }
      const beats = Math.floor(flight.age * flight.flap + flight.phase / (Math.PI * 2));
      // Crossings now run right off the map, so a bird can still be beating
      // its wings a hundred metres away. Only the ones overhead are heard.
      const near = Math.hypot(flight.x - focus.x, flight.z - focus.z) < viewSpan(view, flight.y) * .75;
      if (beats > flight.beats) { flight.beats = beats; if (!hidden && near) this.onFlap?.(flight); }
      group.visible = !hidden;
    }
    this.flights = this.flights.filter(flight => {
      if (flight.age < flight.life) return true;
      flight.group.removeFromParent(); flight.shadow?.removeFromParent();
      return false;
    });
  }

  // A soft patch the shape of the bird's span, faint because it is high up.
  #shadow(flight) {
    if (!this.shadowGeometry) {
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64;
      const ctx = canvas.getContext('2d'), g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
      const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
      this.shadowGeometry = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
      this.shadowMaterial = new THREE.MeshBasicMaterial({ color: '#3a2a18', map: texture, transparent: true, opacity: .28, depthWrite: false });
    }
    const spec = flight.spec, mesh = new THREE.Mesh(this.shadowGeometry, this.shadowMaterial);
    mesh.scale.set(spec.span * 2.3 * flight.scale, 1, spec.length * 1.3 * flight.scale); mesh.renderOrder = 2;
    this.scene.add(mesh);
    return mesh;
  }

  clear() {
    for (const flight of this.flights) { flight.group.removeFromParent(); flight.shadow?.removeFromParent(); }
    this.flights.length = 0; this.schedule.reset();
  }
}
