import * as THREE from 'three';
import { isPlayable } from '../playable-area.js';

export function makeQualityDetails(view) {
  const all = new THREE.Group(); view.scene.add(all);
  // (Deadwater's street and desert dressing; a hills map brings its own.)
  if(view.map.training||view.map.terrain)return all;
  // s2-buildings: Hollow Wick's colonial buildings draw their own wear (none of Deadwater's sand drifts or door paths).
  const buildings = view.map.buildings.filter(b => b.style !== 'colonial');
  for (const b of buildings) {
    const g = new THREE.Group(); g.position.set(b.x, b.baseY || 0, b.z); g.rotation.y = b.angle || 0; all.add(g);
    // Thin chips, nail heads and broken grain; sparse enough to preserve clean silhouettes.
    for (let side = 0; side < 4; side++) {
      const wall = new THREE.Group(); wall.rotation.y = side * Math.PI / 2; g.add(wall);
      const width = side % 2 ? b.d : b.w, depth = side % 2 ? b.w : b.d;
      for (let i = 0; i < 18; i++) {
        const x = Math.sin(i * 17 + side * 31) * (width / 2 - .4), y = .25 + (i % 6) * .38;
        // Keep the central doorway and all possible window bands clean.
        if (Math.abs(x) < 1.7 || (y > .5 && y < 1.8)) continue;
        const chip = view.box(x, y, depth / 2 + .205, .15 + (i % 3) * .07, .025, .012, i % 2 ? '#7d6952' : '#b29c79', wall);
        chip.rotation.z = Math.sin(i) * .1;
        view.box(x + .08, y + .09, depth / 2 + .22, .028, .028, .02, '#615b49', wall);
      }
      const grain = [];
      for (let i = 0; i < 65; i++) {
        const x = Math.sin(i * 71 + side) * (width / 2 - .6), y = .12 + (i % 11) * .23;
        if (Math.abs(x) < 1.7 || (y > .48 && y < 1.85)) continue;
        grain.push(new THREE.Vector3(x, y, depth / 2 + .212), new THREE.Vector3(x + .12 + i % 4 * .08, y + .009, depth / 2 + .212));
      }
      wall.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(grain), new THREE.LineBasicMaterial({ color: '#6f5d49', transparent: true, opacity: .3 })));
    }
    // Low interior details hug corners and do not obstruct entrance lanes.
    const x = -b.w / 2 + 1.2, z = -b.d / 2 + 1.25;
    view.box(x, .72, z, 1.25, .1, .7, '#857052', g);
    for (const dx of [-.48, .48]) for (const dz of [-.23, .23]) view.box(x + dx, .38, z + dz, .07, .7, .07, '#756247', g);
    view.cylinder(x + .15, .86, z, .12, .18, '#96927a', g, 6);
    view.box(x - .3, .81, z, .24, .07, .27, '#aea082', g);
    for (let i = 0; i < 14; i++) {
      const scratch = view.box(Math.sin(i * 5) * (b.w / 2 - .5), .073, Math.cos(i * 7) * (b.d / 2 - .4), .18 + i % 3 * .11, .007, .013, '#7f6a4f', g);
      scratch.rotation.y = Math.sin(i * 11) * .3;
    }
    for (let x = -b.w / 2 + .6; x < b.w / 2; x += .6) view.box(x, .074, 0, .012, .005, b.d - .4, '#887152', g);
    // Sand drifts against the windward wall, the side the sun rig comes from.
    // Height wanders along the run so the pile reads as weather, not as trim.
    for (let z = -b.d / 2 + .5, i = 0; z < b.d / 2 - .3; z += .82, i++) {
      const depth = .1 + (Math.sin(i * 2.7) * .5 + .5) * .09;
      const drift = view.box(-b.w / 2 - .19, depth / 2, z, .46, depth, .78, i % 3 ? '#9d8a68' : '#a89572', g);
      drift.rotation.z = .1 + Math.sin(i * 5) * .05;
    }
    // Shingles that have come off the pitch and landed at the foot of the wall.
    for (let i = 0; i < 5; i++) {
      const side = i % 2 ? 1 : -1;
      const tile = view.box(side * (b.w / 2 + .5 + (i % 3) * .3), .025, Math.sin(i * 11) * (b.d / 2 - .8), .5, .035, .32, i % 2 ? '#8c7a5e' : '#7d6c53', g);
      tile.rotation.set(Math.sin(i * 3) * .09, i * 1.7, Math.cos(i * 4) * .07);
    }
  }
  // Wheel ruts worn down the length of the street. Two lanes at a cart's track
  // width, following the same profile the road surface is built from, so they
  // bend with it instead of cutting across the verge.
  const ruts = [];
  for (let i = 1; i < view.roadProfile.length; i++) {
    const a = view.roadProfile[i - 1], b = view.roadProfile[i];
    for (const lane of [-1, 1]) {
      const wobble = Math.sin(i * .9) * .12;
      ruts.push(new THREE.Vector3((a.left + a.right) / 2 + lane * 1.18 + wobble, .046, a.z),
        new THREE.Vector3((b.left + b.right) / 2 + lane * 1.18 + wobble, .046, b.z));
    }
  }
  all.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(ruts),
    new THREE.LineBasicMaterial({ color: '#6b5843', transparent: true, opacity: .32 })));
  // Slack wire strung between fence posts, sagging in a shallow catenary. The
  // posts already read as a boundary; the wire is what makes it look maintained.
  const wire = [];
  for (const f of view.map.fences || []) {
    const isX = f.axis === 'x', panels = Math.ceil(f.length / 2.5), span = f.length / panels;
    for (let panel = 0; panel < panels; panel++) {
      const start = -f.length / 2 + panel * span;
      const height = u => { const k = (u - start) / span - .5; return .99 - (.25 - k * k) * .42; };
      for (let seg = 0; seg < 5; seg++) {
        const u0 = start + span * seg / 5, u1 = start + span * (seg + 1) / 5;
        wire.push(new THREE.Vector3(f.x + (isX ? u0 : 0), height(u0), f.z + (isX ? 0 : u0)),
          new THREE.Vector3(f.x + (isX ? u1 : 0), height(u1), f.z + (isX ? 0 : u1)));
      }
    }
  }
  if (wire.length) all.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(wire),
    new THREE.LineBasicMaterial({ color: '#7c7161', transparent: true, opacity: .42 })));
  // Individual pebbles and dried flowers at the road shoulder, never another road surface.
  for (let i = 0; i < 250; i++) {
    const z = (i / 249 - .5) * view.map.depth, edge = view.roadEdges(z), side = i % 2 ? 1 : -1;
    const x = (side > 0 ? edge.right : edge.left) + side * (.4 + (Math.sin(i * 17) * .5 + .5) * 1.8);
    if (view.map.buildings.some(b => Math.abs(x - b.x) < b.w / 2 + 3 && Math.abs(z - b.z) < b.d / 2 + 3)) continue;
    const pebble = view.mesh(new THREE.DodecahedronGeometry(.035 + i % 4 * .012), '#a18d69', x, .025, z, all); pebble.scale.y = .4;
    if (i % 5 === 0) { const stem = view.box(x + .15, .14, z, .018, .28, .018, '#a69868', all); stem.rotation.z = .25; }
  }
  // Shoulder weeds, fallen leaves and rubble collect around roadside structures.
  for (const p of view.map.props.filter(p => ['coachStop','loadingPlatform','freightWreck','checkpoint','repairStation','graveyard','oreSite','wateringStation'].includes(p.type))) {
    for(let i=0;i<28;i++) {
      const angle=i*2.399, radius=2.5+(Math.sin(i*17)*.5+.5)*1.5;
      const x=p.x+Math.cos(angle)*radius,z=p.z+Math.sin(angle)*radius, edge=view.roadEdges(z);
      if((x>edge.left-.4 && x<edge.right+.4)||view.onSideRoad(x,z,.4))continue;
      const leaf=view.mesh(new THREE.ConeGeometry(.06,.22,3),i%3?'#a58d58':'#7f8060',x,.06,z,all);leaf.rotation.set(.9,angle,.35);
      if(i%3===0){const stone=view.mesh(new THREE.DodecahedronGeometry(.075), '#a08d6a',x+.15,.035,z,all);stone.scale.y=.45;}
    }
  }
  // Sand ripples across the open ground, laid as short arcs perpendicular to
  // the prevailing wind. Drawn well clear of the street and of every building,
  // so the eye reads weather rather than a pattern laid over the town.
  const ripples = [];
  for (let i = 0; i < 620; i++) {
    const a = i * 2.399, radius = 18 + (i / 620) * (Math.min(view.map.width, view.map.depth) * .45);
    const x = Math.cos(a) * radius, z = Math.sin(a) * radius * .9;
    if (!isPlayable(view.map, x, z, 4)) continue;
    const edge = view.roadEdges(z);
    if ((x > edge.left - 5 && x < edge.right + 5) || view.onSideRoad(x, z, 5)) continue;
    if (view.map.buildings.some(b => Math.abs(x - b.x) < b.w / 2 + 5 && Math.abs(z - b.z) < b.d / 2 + 5)) continue;
    const lean = .35 + Math.sin(i * 13) * .22, length = .5 + (Math.sin(i * 7) * .5 + .5) * 1.1;
    for (let seg = 0; seg < 3; seg++) {
      const t0 = seg / 3 - .5, t1 = (seg + 1) / 3 - .5;
      const bow = .16 * (1 - 4 * t0 * t0), bow1 = .16 * (1 - 4 * t1 * t1);
      ripples.push(new THREE.Vector3(x + Math.cos(lean) * length * t0 - Math.sin(lean) * bow, .035, z + Math.sin(lean) * length * t0 + Math.cos(lean) * bow),
        new THREE.Vector3(x + Math.cos(lean) * length * t1 - Math.sin(lean) * bow1, .035, z + Math.sin(lean) * length * t1 + Math.cos(lean) * bow1));
    }
  }
  if (ripples.length) all.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(ripples),
    new THREE.LineBasicMaterial({ color: '#8d7857', transparent: true, opacity: .26 })));
  // Worn paths from each doorway out to the street: a strip of pale, scuffed
  // ground where the boots have gone, fading as it leaves the threshold.
  for (const b of buildings) {
    for (const side of b.doors || []) {
      const local = side === 'front' ? [0, b.d / 2] : side === 'back' ? [0, -b.d / 2] : [side === 'left' ? -b.w / 2 : b.w / 2, 0];
      const out = side === 'front' ? [0, 1] : side === 'back' ? [0, -1] : [side === 'left' ? -1 : 1, 0];
      const c = Math.cos(b.angle || 0), sn = Math.sin(b.angle || 0);
      const px = b.x + local[0] * c + local[1] * sn, pz = b.z - local[0] * sn + local[1] * c;
      const dx = out[0] * c + out[1] * sn, dz = -out[0] * sn + out[1] * c;
      // One continuous ribbon, not a row of patches. Laid as separate quads
      // this read as a stack of offset slabs with visible corners and seams —
      // the eye picks out the rectangles, not the path. A single tapering
      // strip built from the centreline has no internal edges at all, and it
      // is one draw call instead of eight.
      //
      // Where it reaches the street it merges rather than butting into it. A
      // desire line does not meet a road at a right angle and stop: it bends
      // to run with the traffic for the last couple of metres, narrows to
      // nothing, and loses its colour into the road surface as the two wear
      // together. So the centreline is steered toward the road heading, the
      // width tapers to a point at the kerb, and a short blended tongue
      // overlaps the tip where the ruts take over.
      const MERGE = 3.4, STEPS = 14;
      const spine = [];
      let cx = px, cz = pz, heading = Math.atan2(dx, dz), merged = 0;
      for (let step = 0; step <= STEPS; step++) {
        const t = step / STEPS;
        const edge = view.roadEdges(cz);
        const mid = (edge.left + edge.right) / 2;
        const toRoad = cx < mid ? edge.left - cx : cx - edge.right;
        if (toRoad < -.2) break;
        // 0 out in the open, 1 at the kerb.
        const merge = Math.max(0, Math.min(1, 1 - toRoad / MERGE));
        merged = Math.max(merged, merge);
        // Swing from "out of the doorway" toward "along the street", and
        // wander a little so it is a footpath rather than a ruler line.
        const along = cx < mid ? Math.PI : 0;
        const want = heading + Math.atan2(Math.sin(along - heading), Math.cos(along - heading)) * merge * .5;
        heading = want + Math.sin(step * 1.7 + b.w) * .05 * (1 - merge);
        // Widest a stride out from the door, tapering to a point at the kerb.
        const width = (1.45 - t * .5) * (1 - merge) * Math.min(1, .35 + t * 4);
        spine.push({ x: cx, z: cz, heading, width, merge });
        const advance = .52;
        cx += Math.sin(heading) * advance; cz += Math.cos(heading) * advance;
      }
      if (spine.length > 2) {
        const ribbon = (points, lift, color) => {
          const shape = new THREE.Shape();
          const side = (point, s) => [point.x + Math.cos(point.heading) * point.width * .5 * s,
            point.z - Math.sin(point.heading) * point.width * .5 * s];
          const [sx, sz] = side(points[0], -1);
          shape.moveTo(sx, sz);
          for (let i = 1; i < points.length; i++) { const [x, z] = side(points[i], -1); shape.lineTo(x, z); }
          for (let i = points.length - 1; i >= 0; i--) { const [x, z] = side(points[i], 1); shape.lineTo(x, z); }
          shape.closePath();
          const geometry = new THREE.ShapeGeometry(shape);
          geometry.rotateX(Math.PI / 2);
          const mesh = new THREE.Mesh(geometry, view.material(color));
          mesh.position.y = lift; mesh.castShadow = false; mesh.receiveShadow = true;
          all.add(mesh);
        };
        ribbon(spine, .038, '#98835f');
        // The last stretch again in a road-blended colour, so the tip dissolves
        // into the carriageway instead of ending on a line.
        const tongue = spine.filter(pt => pt.merge > .12);
        if (tongue.length > 2) {
          const road = new THREE.Color(view.map.palette.road);
          const blend = new THREE.Color('#98835f').lerp(road, .6);
          ribbon(tongue.map(pt => ({ ...pt, width: pt.width * .92 })), .0395, '#' + blend.getHexString());
        }
      }
    }
  }
  // Handbills nailed to the street-facing walls, curling at one corner.
  for (const b of buildings) {
    const g = new THREE.Group(); g.position.set(b.x, 0, b.z); g.rotation.y = b.angle || 0; all.add(g);
    for (let i = 0; i < 3; i++) {
      const x = Math.sin(i * 23 + b.w) * (b.w / 2 - 1.4);
      if (Math.abs(x) < 1.9) continue;
      const y = 1.95 + (i % 2) * .34;
      const bill = view.box(x, y, b.d / 2 + .215, .34, .46, .012, i % 2 ? '#c9bd9b' : '#bdb08c', g);
      bill.rotation.z = Math.sin(i * 5) * .07;
      view.box(x + .13, y + .2, b.d / 2 + .225, .1, .12, .012, '#b0a381', g).rotation.z = .5;
      for (const corner of [-1, 1]) view.box(x + corner * .13, y + .21, b.d / 2 + .225, .022, .022, .016, '#5f5949', g);
    }
  }
  // Broken glass under the boarded windows, and the nails that boarded them.
  for (const b of buildings) {
    const g = new THREE.Group(); g.position.set(b.x, 0, b.z); g.rotation.y = b.angle || 0; all.add(g);
    for (const w of (b.windows || []).filter(w => w.boarded)) {
      const along = w.side === 'front' || w.side === 'back' ? [w.offset, (w.side === 'front' ? 1 : -1) * (b.d / 2 + .3)] : [(w.side === 'left' ? -1 : 1) * (b.w / 2 + .3), w.offset];
      for (let i = 0; i < 9; i++) {
        const shard = view.mesh(new THREE.TetrahedronGeometry(.045 + i % 3 * .016), i % 2 ? '#cfe0dc' : '#b6c9c6',
          along[0] + Math.sin(i * 17) * .7, .028, along[1] + Math.cos(i * 11) * .34, g);
        shard.rotation.set(i * .7, i * 1.3, i * .4); shard.scale.y = .45;
      }
    }
  }
  // Tumbleweed and torn sacking snagged against the windward side of fences.
  for (const f of view.map.fences || []) {
    const isX = f.axis === 'x';
    for (let i = 0; i < 2; i++) {
      const along = (Math.sin(i * 31 + f.length) * .35) * f.length;
      const x = f.x + (isX ? along : -.34), z = f.z + (isX ? -.34 : along);
      const snag = view.mesh(new THREE.IcosahedronGeometry(.3 + i * .07, 0), '#a2905f', x, .26, z, all);
      snag.scale.set(1, .72, 1); snag.rotation.set(.2, i * 2.1, .15);
      const cloth = view.box(x + (isX ? .3 : 0), .2, z + (isX ? 0 : .3), isX ? .5 : .1, .34, isX ? .1 : .5, '#9d9276', all);
      cloth.rotation.set(.12, 0, Math.sin(i) * .2);
    }
  }
  // Hoofprints tracking the wheel ruts. Laid as fore-and-hind pairs along a
  // lane rather than sprinkled: scattered singles read as litter on the road,
  // and only a repeating pair reads as an animal having walked up it. Kept
  // close to the road's own colour so they are a texture, not a set of marks.
  for (let stride = 0; stride < 90; stride++) {
    const row = view.roadProfile[stride % view.roadProfile.length];
    const lane = stride % 2 ? 1 : -1;
    const z = row.z + (stride * 2.3) % 4.6;
    const x = (row.left + row.right) / 2 + lane * (1.18 + Math.sin(stride * 1.7) * .22);
    for (const [ahead, side] of [[0, -.09], [.34, .07]]) {
      const print = view.box(x + side, .048, z + ahead, .12, .004, .16,
        stride % 3 ? '#87714f' : '#7d6a4b', all);
      print.rotation.y = Math.sin(stride * 7 + ahead) * .14;
    }
  }
  view.noShadows(all); view.batch(all); return all;
}

export function makePropDetails(view, p, parent) {
  const g = new THREE.Group(); parent.add(g);
  const points = [];
  if (p.type === 'crate') {
    for (const side of [-1, 1]) for (let i = 0; i < 5; i++) {
      const x = -.46 + i * .23;
      points.push(new THREE.Vector3(x, .08, side * .582), new THREE.Vector3(x, 1.1, side * .582));
      points.push(new THREE.Vector3(x, 1.185, -.48), new THREE.Vector3(x, 1.185, .48));
      for (const y of [.15, 1.03]) view.box(x, y, side * .595, .026, .026, .015, '#665d48', g);
    }
  } else if (p.type === 'barrel') {
    for (let i = 0; i < 12; i++) {
      const a = i * Math.PI / 6, x = Math.cos(a) * .464, z = Math.sin(a) * .464;
      points.push(new THREE.Vector3(x * .92, .04, z * .92), new THREE.Vector3(x, .5, z), new THREE.Vector3(x, .5, z), new THREE.Vector3(x * .92, .96, z * .92));
      view.mesh(new THREE.SphereGeometry(.022, 4, 3), '#494f45', x, .77, z, g);
    }
  } else if (p.type === 'cactus') {
    const scale = p.scale || 1;
    for (let i = 0; i < 18; i++) {
      const a = i * 2.4, y = (.25 + i % 6 * .2) * scale;
      const x = Math.cos(a) * .22 * scale, z = Math.sin(a) * .22 * scale;
      points.push(new THREE.Vector3(x, y, z), new THREE.Vector3(x * 1.2, y + .035, z * 1.2));
    }
  }
  if (points.length) g.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color: p.type === 'cactus' ? '#acb18b' : '#66563e', transparent: true, opacity: .48 })));
  view.noShadows(g); view.batch(g); return g;
}

export function makeLandmark(view, p, group) {
  const box = (...args) => view.box(...args, group);
  const cylinder = (x, y, z, radius, height, color, segments = 10, top = radius) => view.cylinder(x, y, z, radius, height, color, group, segments, top);
  if (p.type === 'boulder') {
    const rock = view.mesh(new THREE.DodecahedronGeometry(1, 0), '#887b65', 0, 1.05, 0, group); rock.scale.set(1.65, 1.45, 1.35); rock.rotation.set(.1, .6, .15);
    const chip = view.mesh(new THREE.DodecahedronGeometry(.5, 0), '#9d8b6e', 1.2, .2, .7, group); chip.scale.y = .5;
  } else if (p.type === 'deadTree' || p.type === 'stump') {
    const h = p.type === 'stump' ? .9 : 3.7;
    cylinder(0, h / 2, 0, .46, h, '#70614c', 7, .23);
    for (let i = 0; i < 5; i++) {
      const root = box(Math.cos(i * 1.26) * .35, .17, Math.sin(i * 1.26) * .35, .7, .2, .15, '#77674f'); root.rotation.y = -i * 1.26;
    }
    if (p.type === 'deadTree') for (let i = 0; i < 4; i++) {
      const a = i * 2.1, branch = new THREE.Group(); branch.position.set(0, 1.45 + i * .48, 0); branch.rotation.set(Math.cos(a) * .9, 0, Math.sin(a) * .9); group.add(branch);
      view.cylinder(0, .55, 0, .115, 1.3, '#7a6951', branch, 5, .035);
      const twig = view.box(.15, 1, 0, .06, .75, .06, '#847159', branch); twig.rotation.z = .7;
    }
  } else if (p.type === 'cistern') {
    for (let layer = 0; layer < 3; layer++) for (let i = 0; i < 12; i++) {
      if (layer === 2 && i > 6 && i < 10) continue;
      const a = (i + layer * .5) * Math.PI / 6, stone = box(Math.cos(a) * 1.6, .2 + layer * .36, Math.sin(a) * 1.6, .77, .33, .46, i % 3 ? '#9b8a6e' : '#887960'); stone.rotation.y = -a + Math.PI / 2;
    }
    cylinder(0, .03, 0, 1.4, .05, '#514b3b', 12);
    for (let i = 0; i < 4; i++) { const rubble = box(1.8 + i * .22, .12, .8 + Math.sin(i) * .8, .42, .23, .36, '#928068'); rubble.rotation.y = i; }
  } else if (p.type === 'ruinedArch') {
    for (const side of [-1, 1]) for (let i = 0; i < (side < 0 ? 7 : 5); i++) {
      const stone = box(side * 1.4 + Math.sin(i * 8) * .04, .22 + i * .42, 0, .8, .39, 1.15, i % 2 ? '#9b896c' : '#89785e'); stone.rotation.y = Math.sin(i) * .05;
    }
    const lintel = box(-.8, 3, 0, 1.9, .4, 1.1, '#938168'); lintel.rotation.z = -.14;
    for (let i = 0; i < 6; i++) { const stone = box((i - 2.5) * .57, .15, .8 + Math.sin(i * 5) * .3, .48, .3, .5, '#968268'); stone.rotation.y = i; }
  } else if (p.type === 'telegraph') {
    const mast = box(0, 2.6, 0, .23, 5.2, .23, '#77664e'); mast.rotation.z = .045;
    box(-.1, 4.7, 0, 2.5, .15, .15, '#867152');
    for (const x of [-1, -.5, .5, 1]) cylinder(x - .1, 4.9, 0, .08, .22, '#687b71', 6);
    const pts = [new THREE.Vector3(-1.1, 4.85, 0), new THREE.Vector3(-1.4, 3.5, .4), new THREE.Vector3(-.8, 2.8, .5)];
    group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: '#504b3f' })));
  } else if (p.type === 'brokenWagon') {
    const bed = new THREE.Group(); bed.rotation.z = -.11; bed.rotation.x = .08; group.add(bed);
    for (let i = 0; i < 7; i++) view.box((i - 3) * .43, .64, 0, .39, .14, 1.65, '#967b58', bed);
    for (const z of [-.84, .84]) for (let i = 0; i < 3; i++) {
      if (z > 0 && i === 1) continue;
      const board = view.box(0, .85 + i * .2, z, i === 2 ? 2.2 : 3.1, .15, .08, '#ab8e65', bed);
      if (i === 2) board.rotation.z = z * .07;
    }
    for (const x of [-1, 1]) for (const z of [-1, 1]) {
      if (x === 1 && z === 1) continue;
      const wheel = view.mesh(new THREE.TorusGeometry(.48, .055, 4, 10), '#655f4d', x, .48, z, group);
      for (let i = 0; i < 5; i++) {
        const spoke = view.box(0, 0, 0, .87, .045, .045, '#9a805e', wheel); spoke.rotation.z = i * Math.PI / 5;
      }
    }
    const wheel = view.mesh(new THREE.TorusGeometry(.48, .055, 4, 10), '#74674f', 1.1, .09, 1.55, group); wheel.rotation.x = Math.PI / 2;
    for (const z of [-.55, .55]) { const shaft = box(2, .33, z, 1.7, .1, .1, '#8f7453'); shaft.rotation.y = z * .13; }
    for (let i = 0; i < 3; i++) { const plank = box(-.8 + i * .7, .055, 1.2, .65, .05, .12, '#967b58'); plank.rotation.y = i * .8; }
  } else if (p.type === 'windmill') {
    for (const x of [-1, 1]) for (const z of [-1, 1]) {
      const leg = box(x * .7, 2.2, z * .7, .14, 4.4, .14, '#88775c'); leg.rotation.z = x * .1;
    }
    for (const h of [1.4, 3]) box(0, h, 0, 1.65, .13, 1.65, '#8b795c');
    const rotor = new THREE.Group(); rotor.position.set(0, 5, .2); group.add(rotor);
    for (let i = 0; i < 8; i++) {
      const spoke = new THREE.Group(); spoke.rotation.z = i * Math.PI / 4; rotor.add(spoke);
      view.box(0, .8, 0, .055, 1.6, .05, '#777e71', spoke);
      const blade = view.box(0, 1.3, 0, .45, .65, .07, i % 2 ? '#9a9e85' : '#89917f', spoke); blade.rotation.y = .3;
    }
    view.mesh(new THREE.SphereGeometry(.16, 7, 5), '#6e766a', 0, 0, 0, rotor);
  } else if (p.type === 'trough') {
    box(0, .18, 0, 2.7, .22, .85, '#84775d');
    for (const z of [-.48, .48]) box(0, .48, z, 2.8, .55, .1, '#a0906d');
    for (const x of [-1.35, 1.35]) box(x, .48, 0, .1, .55, 1, '#a0906d');
    box(0, .4, 0, 2.58, .025, .79, '#596c60');
  }
}

export function makeCobweb(view, group, width) {
  const points = [], origin = new THREE.Vector3(-width / 2, 1.76, .33);
  const point = (angle, radius) => new THREE.Vector3(origin.x + Math.cos(angle) * radius, origin.y - Math.sin(angle) * radius, origin.z);
  for (let i = 0; i <= 5; i++) {
    const end = point(i * Math.PI / 10, .65); points.push(origin.clone(), end);
  }
  for (const r of [.23, .43, .64]) for (let i = 0; i < 5; i++) points.push(point(i * Math.PI / 10, r), point((i + 1) * Math.PI / 10, r));
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  group.add(new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: '#c9c3a6', transparent: true, opacity: .38 })));
}
