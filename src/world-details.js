import * as THREE from 'three';

export function makeQualityDetails(view) {
  const all = new THREE.Group(); view.scene.add(all);
  if(view.map.training)return all;
  for (const b of view.map.buildings) {
    const g = new THREE.Group(); g.position.set(b.x, 0, b.z); g.rotation.y = b.angle || 0; all.add(g);
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
  }
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
  view.batch(all); return all;
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
  view.batch(g); return g;
}

export function makeCrops(view) {
  for (const field of view.map.crops || []) {
    const group = new THREE.Group(); view.scene.add(group);
    // Discrete stalks and irregular row ends leave soil visible between rows.
    for (let row = 0, x = field.x - field.w / 2 + .45; x < field.x + field.w / 2; row++, x += .9) {
      for (let n = 0, z = field.z - field.d / 2 + .4; z < field.z + field.d / 2; n++, z += .72) {
        const noise = Math.sin(row * 43.7 + n * 17.3) * .5 + .5;
        if (noise < .08) continue;
        const xx = x + (noise - .5) * .22, zz = z + Math.sin(n * 5 + row) * .14;
        const h = 1.3 + noise * .5;
        view.box(xx, h / 2, zz, .035, h, .035, '#a99b63', group);
        for (const side of [-1, 1]) {
          const leaf = view.mesh(new THREE.ConeGeometry(.14, .65, 3), row % 3 ? '#929263' : '#a7a16a', xx + side * .16, h * .57, zz, group);
          leaf.rotation.z = side * .85; leaf.rotation.y = noise * 2;
        }
        const ear = view.mesh(new THREE.ConeGeometry(.065, .32, 4), '#c0b17c', xx, h, zz, group);
        ear.rotation.z = (noise - .5) * .25;
      }
    }
    view.batch(group);
  }
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
