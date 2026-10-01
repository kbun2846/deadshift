// The outside of Lumen's bus, and the downed cable (stage 4; design 6).
//
// The bus is a building (`bus` in maps/lumen-buildings-east.js, a 12 x 2.6 m
// quad room, two doors on its south flank): the shells draw it as plain walls
// 3.2 m high. makeLumenBus(view) dresses those walls as one big futuristic
// articulated bus: a pearl skin with a midnight belt and a lemon pin-stripe, a
// dark window band with pearl mullions, three axles of flush wheels, a wedge
// nose and tail with light bars, mirrors, roof pods, a ribbed rubber bellows
// where the two halves join, and the door frames round the two openings.
// Geometry only: no colliders (the shell's walls are the bus's solids), and
// nothing inside a door opening (its 1.6 m by 2.5 m stays empty; the frame
// stands at its edges, a header over it and the wheels well clear). Nothing
// stands more than 0.3 m off the wall: it is skin, not mass. Its lit parts
// (the head and tail bars, the destination strip) are litBox; the windows'
// stuttering interior light is the signs system's (maps/lumen-vehicle-lights.js
// busLightEntries).
//
// Built into view.static before the static batch, so all of it merges into the
// cell batches with the rest of the world (a few hundred triangles a side).
import * as THREE from 'three';
import { litBox } from './lumen-glow.js';
import { Parts, VEHICLE_COLOURS as V, shade } from './lumen-vehicle-parts.js';
import { BUS, cableRoute } from '../maps/lumen-vehicle-lights.js';

export const BUS_LOOK = Object.freeze({
  body: V.pearl, belt: V.midnight, trim: V.graphite, pin: V.lemon, glass: V.glass, sheen: V.glassSheen,
  skin: .045,          // m the skin stands off the shell's outer face
  axles: Object.freeze([-4.6, 1.9, 5.6]), // along the bus: clear of both door openings (x -2.8..-1.1 and 3.2..4.9)
  wheelR: .5, wheelW: .3,
  bellows: .6,         // m: half the joint's width
});

// The bus's own frame in a group: x along it (nose +x), z across (+z the kerb side).
export function busGroup() {
  const g = new THREE.Group();
  g.position.set(BUS.cx, 0, BUS.cz);
  g.rotation.y = -Math.atan2(BUS.uz, BUS.ux);
  g.name = 'lumen-bus';
  return g;
}

export function makeLumenBus(view, parent = view.static) {
  const g = busGroup(), P = new Parts(view, g), B = BUS_LOOK;
  const H = BUS.height, hl = BUS.hl + BUS.wall, out = BUS.hw + BUS.wall, sk = B.skin;
  parent.add(g);
  const doors = BUS.doors.map(d => [d.x - d.width / 2, d.x + d.width / 2]);
  // The runs of wall between the door openings (and the frames' posts).
  const frame = .12;
  const runs = [];
  let at = -hl;
  for (const [a, b] of doors.slice().sort((p, q) => p[0] - q[0])) { runs.push([at, a - frame]); at = b + frame; }
  runs.push([at, hl]);
  const bellows = B.bellows;
  for (const side of [1, -1]) {
    const z0 = side * out, z1 = side * (out + sk);
    const zs = (a, b) => side > 0 ? [a, b] : [-b, -a];
    const face = (xa, xb, ya, yb, colour, d0 = 0, d1 = sk) => { const [za, zb] = zs(out + d0, out + d1); return P.slab(xa, xb, ya, yb, za, zb, colour); };
    for (const [ra, rb] of runs) {
      // (the skin stops at the bellows: they have their own)
      const parts = ra < -bellows && rb > bellows ? [[ra, -bellows], [bellows, rb]] : [[ra, rb]];
      for (const [xa, xb] of parts) {
        face(xa, xb, 0, .35, B.trim);                       // skirt
        face(xa, xb, .35, 1.02, B.belt);                    // the belt: midnight, under the windows
        face(xa, xb, 1.02, 1.06, B.pin, .0, sk + .01);      // a lemon pin-stripe
        face(xa, xb, 1.06, 2.38, B.body);                   // behind the windows
        face(xa, xb, 2.38, H, B.body);                      // above them
        face(xa, xb, H - .12, H, shade(B.body, .82), .0, sk + .012); // the roof line
        // The window band: dark panes, pearl mullions every 1.4 m.
        const n = Math.max(1, Math.round((xb - xa) / 1.4)), w = (xb - xa) / n;
        for (let i = 0; i < n; i++) {
          face(xa + i * w + .05, xa + (i + 1) * w - .05, 1.16, 2.3, B.glass, sk, sk + .022);
          face(xa + i * w + .05, xa + (i + 1) * w - .05, 2.05, 2.3, B.sheen, sk + .022, sk + .028); // (a paler upper pane: the tint)
        }
      }
    }
    // Door frames: jambs, a header, a low sill plate; inside the opening nothing.
    for (const [a, b] of doors) {
      face(a - frame, a, 0, 2.62, B.trim, 0, sk + .07);
      face(b, b + frame, 0, 2.62, B.trim, 0, sk + .07);
      face(a - frame, b + frame, 2.5, 2.62, B.trim, 0, sk + .07);
      face(a - frame, b + frame, 2.62, H, B.body);
      face(a - frame - .02, a - frame + .015, 2.0, 2.4, B.pin, sk + .07, sk + .085); // (a lemon door-edge light strip on each post)
      face(b + frame - .015, b + frame + .02, 2.0, 2.4, B.pin, sk + .07, sk + .085);
    }
    // The bellows: ribs of dark rubber, a wide fold every third.
    for (let i = 0; i < 9; i++) {
      const x = -bellows + (2 * bellows) * (i + .5) / 9, wide = i % 3 === 1;
      P.slab(x - .045, x + .045, .3, H + .04, ...zs(out, out + (wide ? .13 : .09)), wide ? V.rubber : shade(V.rubber, 1.8));
    }
    // Wheels and their arches.
    for (const ax of B.axles) {
      const zc = side * (out - .04 + B.wheelW / 2);
      P.slab(ax - B.wheelR - .12, ax + B.wheelR + .12, 0, B.wheelR * 2 + .14, ...zs(out - .005, out + sk + .02), V.rubber);
      P.wheel(ax, B.wheelR, zc, B.wheelR, B.wheelW, side, { hub: shade(V.hub, 1.1) });
    }
    // Mirrors on stalks, a pair of side cameras.
    P.strut([hl - .55, 1.7, side * (out + .02)], [hl - .35, 1.85, side * (out + .26)], .04, V.trim);
    P.box(hl - .35, 1.86, side * (out + .27), .14, .3, .07, V.trim);
  }
  // The roof: the bellows' arch, two pods, a sensor mast.
  P.slab(-bellows, bellows, H, H + .1, -out + .08, out - .08, V.rubber);
  for (const [x0, x1] of [[-5.1, -3.6], [2.3, 4.1]]) {
    P.loft({ x0, x1, z: .55, y: H }, { x0: x0 + .12, x1: x1 - .12, z: .45, y: H + .3 }, shade(B.body, .9));
    P.slab(x0 + .3, x1 - .3, H + .29, H + .32, -.3, .3, V.trim);
  }
  P.slab(3.8, 4.3, H, H + .06, -.85, .85, V.trim);          // a cable tray across the roof
  P.strut([-3.2, H, .8], [-3.4, H + .55, .82], .03, V.trim);  // the antenna
  // Nose and tail: wedges with dark screens, a bumper, the light bars.
  for (const end of [1, -1]) {
    const x = end * hl, nose = end > 0;
    const sign = end;
    // (a chamfered bumper block and a raked screen, both hugging the end wall)
    P.loft({ x0: sign > 0 ? x : x, x1: sign > 0 ? x + .3 : x, z: out - .1, y: .16 }, { x0: x, x1: x + sign * (nose ? .12 : .1), z: out - .2, y: .95 }, B.trim);
    P.hull([[x, .95, -(out - .1)], [x + sign * .06, .95, -(out - .1)], [x + sign * .06, .95, out - .1], [x, .95, out - .1],
      [x, 2.85, -(out - .28)], [x + sign * .05, 2.85, -(out - .28)], [x + sign * .05, 2.85, out - .28], [x, 2.85, out - .28]], B.body);
    P.hull([[x + sign * .06, 1.1, -(out - .25)], [x + sign * .1, 1.1, -(out - .25)], [x + sign * .1, 1.1, out - .25], [x + sign * .06, 1.1, out - .25],
      [x + sign * .03, 2.7, -(out - .38)], [x + sign * .06, 2.7, -(out - .38)], [x + sign * .06, 2.7, out - .38], [x + sign * .03, 2.7, out - .38]], nose ? B.glass : shade(B.glass, 1.2));
    P.box(x + sign * .1, .55, 0, .14, .36, out * 2 - .3, shade(V.trim, .8));
  }
  // The lit parts: head bar and tail bar, a destination strip over the windscreen.
  litBox(view, g, hl + .1, .62, 0, .05, .1, 2.0, '#e6f0ff', 1.4);
  litBox(view, g, -hl - .09, .7, 0, .05, .1, 2.0, '#ff3040', 1.2);
  litBox(view, g, hl + .06, 2.86, 0, .04, .16, 1.1, V.lemon, 1.1);
  for (const side of [1, -1]) litBox(view, g, hl + .11, .62, side * 1.3, .04, .13, .18, '#e6f0ff', 1.6);
  return g;
}

// The downed cable across West Street: a dark rubber cord from the top of the
// fallen pole's stump, down and across the road to a frayed, glowing end (its
// sparks are effects/lumen-wrecks.js). Flat on the road: walk-over, no collider.
export function makeLumenCable(view, parent = view.static) {
  const g = new THREE.Group(); g.name = 'lumen-cable'; parent.add(g);
  const P = new Parts(view, g), { points } = cableRoute();
  for (let i = 1; i < points.length; i++) P.strut(points[i - 1], points[i], i < 3 ? .07 : .06, i % 5 === 0 ? shade(V.rubber, 1.6) : V.rubber);
  const end = points[points.length - 1];
  litBox(view, g, end[0], .08, end[2], .1, .06, .1, '#fff2b0', 2.2);
  return g;
}

// Both, for the one line the lead adds.
export function makeLumenStreetPieces(view, parent = view.static) { return [makeLumenBus(view, parent), makeLumenCable(view, parent)]; }
