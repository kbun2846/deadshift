// Building the world once at load: terrain, roads, sand, buildings and their
// walls, fences, props, ground detail, the player and target models, and the
// ambient life (fog sheets, in fog-sheets.js; tumbleweeds). Methods of
// WorldView (renderer.js), kept here to keep that file readable; `this` is the view.
import * as THREE from 'three';
import { buildingOpenings } from '../map-kit.js';
import { bakeColors } from './bake-colors.js';
import { makeRailProp, RAIL_TYPES } from '../world/rail-depot.js';
import { buildingWalls, mapColliders } from '../maps.js';
import { inside } from '../simulation.js';
import { GRAPHICS, isDemanding } from '../settings.js';
import { makeLandmark, makeCobweb, makePropDetails } from '../world/world-details.js';
import { boxIndex } from '../box-index.js';
import { makeDetailedInterior } from '../world/detailed-interiors.js';
import { makeInteriorDetails } from '../world/interior-details.js';
import { BUILDING_FINISHES } from '../world/building-finishes.js';
import { makeColonialBuilding, makeColonialPart, isColonialPart } from '../world/colonial-buildings.js'; // s2-buildings
import { makeApproaches, onApproach } from '../world/approach-paths.js';
import { HOLLOW_BREAKABLES, makeHollowBreakable } from '../world/hollow-breakables.js'; // s2-breakables
import { ROADSIDE_TYPES, makeRoadside } from '../world/roadside.js';
import { HOLLOW_TYPES, makeHollowProp } from '../world/hollow-props.js'; // (s2-props)
import { GRAVE_TYPES, makeGrave } from '../world/graveyard.js'; // s2-graveyard
import { LIFE_TYPES, makeLifeProp } from '../world/hollow-life.js'; // s5-life: the goat's pen, the washing line, the stick effigies
import { DRESSING_TYPES, makeDressing } from '../world/hollow-dressing.js'; // s5-props
import { freezeTransforms } from './frozen-transforms.js';
import { DustDevils } from '../effects/dust-devils.js';
import { ROOF_PREPASS_ORDER, CLUTTER_CLAY, CLUTTER_DARK, CLUTTER_SEAT, lerp, randomGenerator } from './renderer.js';
import { buildTerrainMesh, buildRetainingWalls } from './terrain-mesh.js';
import { buildTrees } from '../world/trees.js'; // s2-trees
import { buildWaterMesh } from './water-mesh.js';
import { buildCrossingDecks } from './crossing-decks.js';
import { buildTerrainDetails } from '../world/terrain-details.js';
import { buildLeaves } from '../effects/leaf-fx.js'; // s3-leaves
import { buildGroundMarks } from './ground-marks-view.js'; // s5-ground: ruts, puddles, prints, scatter, leaf drifts
import { FogSheets } from './fog-sheets.js';
import { groundHeights } from './extreme-surfaces.js';

// The drawn ground's allowed error from the height grid, per preset (m):
// RTIN keeps it within this everywhere (terrain-mesh.js).
const TERRAIN_ERROR = { potato: .04, performance: .035, balanced: .02, quality: .01, extreme: .01 };

export const WorldBuild = {
  makePlayableEdge(){
    const outline=this.map.playableArea;if(!outline)return;
    if(this.map.terrain)return this.makeHillFence(outline);
    // A low continuous ranch fence makes the collision edge readable. Scenery
    // outside it stays rendered; it is not deleted or clipped by the perimeter.
    let nextPost=0;
    for(let i=0;i<outline.length;i++){
      const [ax,az]=outline[i],[bx,bz]=outline[(i+1)%outline.length];
      const length=Math.hypot(bx-ax,bz-az);
      while(nextPost<length){
        const t=nextPost/length;
        this.box(ax+(bx-ax)*t,.48,az+(bz-az)*t,.14,.96,.14,'#71624f');nextPost+=5;
      }
      nextPost-=length;
      for(const y of [.34,.73]){
        const rail=this.box((ax+bx)/2,y,(az+bz)/2,.075,.075,length+.015,'#91816a');
        rail.rotation.y=Math.atan2(bx-ax,bz-az);
      }
    }
  },

  // Hills: the same fence, standing on the ground. A post every 5 m, the
  // rails running post to post up and down the slopes; it stops at each bank
  // where a stream leaves (the water flows on past it; the playable edge
  // still holds there).
  makeHillFence(outline) {
    const ground = this.ground, posts = [];
    let nextPost = 0;
    for (let i = 0; i < outline.length; i++) {
      const [ax, az] = outline[i], [bx, bz] = outline[(i + 1) % outline.length], length = Math.hypot(bx - ax, bz - az);
      while (nextPost < length) { const t = nextPost / length; posts.push([ax + (bx - ax) * t, az + (bz - az) * t]); nextPost += 5; }
      nextPost -= length;
    }
    const dry = (x, z) => ground.bankDistance(x, z) > .3;
    const standing = posts.map(([x, z]) => dry(x, z) ? { x, z, y: ground.drawnHeightAt(x, z) } : null);
    for (const p of standing) if (p) this.box(p.x, p.y + .48, p.z, .14, .96, .14, '#71624f');
    // Rails run post to post; where the ground between strays more than
    // 0.3 m off that line (a bank's brow, a retaining wall) the span gets
    // posts every metre and a quarter, and a piece still that far off (a
    // wall's face) is left open rather than buried or hung in the air.
    const straysFrom = (a, b) => { let worst = 0; for (let t = .1; t < .95; t += .1) worst = Math.max(worst, Math.abs(ground.drawnHeightAt(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t) - (a.y + (b.y - a.y) * t))); return worst; };
    const rails = (a, b) => {
      const run = Math.hypot(b.x - a.x, b.z - a.z), rise = b.y - a.y, yaw = Math.atan2(b.x - a.x, b.z - a.z), pitch = -Math.atan2(rise, run);
      for (const y of [.34, .73]) {
        const rail = this.box((a.x + b.x) / 2, (a.y + b.y) / 2 + y, (a.z + b.z) / 2, .075, .075, Math.hypot(run, rise) + .015, '#91816a');
        rail.rotation.order = 'YXZ'; rail.rotation.set(pitch, yaw, 0);
      }
    };
    // A span that runs into a stream stops at its bank with a post there,
    // so the fence reaches the water instead of leaving a gap on dry grass.
    const at = (ax, az, bx, bz, t) => { const x = ax + (bx - ax) * t, z = az + (bz - az) * t; return { x, z, y: ground.drawnHeightAt(x, z) }; };
    const fence = (a, b) => {
      if (straysFrom(a, b) <= .3) { rails(a, b); return; }
      const n = Math.max(2, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 1.25));
      let last = a;
      for (let k = 1; k <= n; k++) {
        const next = k === n ? b : at(a.x, a.z, b.x, b.z, k / n);
        if (k < n) this.box(next.x, next.y + .48, next.z, .14, .96, .14, '#71624f');
        if (straysFrom(last, next) <= .3) rails(last, next);
        last = next;
      }
    };
    for (let i = 0; i < posts.length; i++) {
      const [ax, az] = posts[i], [bx, bz] = posts[(i + 1) % posts.length], length = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(length / .25));
      let from = null;
      for (let k = 0; k <= n; k++) {
        const t = k / n, wet = !dry(ax + (bx - ax) * t, az + (bz - az) * t);
        if (!wet && from === null) from = t;
        if ((wet || k === n) && from !== null) {
          const to = wet ? (k - 1) / n : 1;
          if ((to - from) * length > .5) {
            const a = at(ax, az, bx, bz, from), b = at(ax, az, bx, bz, to);
            if (from > 0) this.box(a.x, a.y + .48, a.z, .14, .96, .14, '#71624f');
            if (to < 1) this.box(b.x, b.y + .48, b.z, .14, .96, .14, '#71624f');
            fence(a, b);
          }
          from = null;
        }
      }
    }
  },

  makeTerrain() {
    const { map } = this;
    if (map.terrain) return this.makeHillTerrain();
    // The ground casts onto nothing, and its bounding sphere covers the map, so
    // it can never be culled out of a shadow update.
    this.terrainUV(this.noShadows(this.box(0, -.28, 0, map.width + 60, .5, map.depth + 60, map.palette.ground)));
    if(map.training){
      this.roadProfile=[{z:-30,left:0,right:0},{z:30,left:0,right:0}];this.sandMarks=[];
      for(const key of ['groundDetails','extraGroundDetails','performanceDetails']){this[key]=new THREE.Group();this.scene.add(this[key]);}
      for(const [x,z,w,d] of [[0,-14,32,.4],[0,14,32,.4],[-16,0,.4,28],[16,0,.4,28]])this.box(x,.5,z,w,1,d,'#95846b');
      return;
    }
    // One worn street with locally uneven edges and gentle, irregular bends.
    const road = new THREE.Shape(), edgeRandom = randomGenerator(map.scenerySeed + 1), end = map.depth / 2 + 12;
    const steps = 76; this.roadProfile = [];
    let center = 0;
    for (let i = 0; i <= steps; i++) {
      center = center * .65 + (edgeRandom() - .5) * .65;
      const z = -end + i / steps * end * 2;
      const bend = map.roadBend, t = bend ? Math.max(0, Math.min(1, (z - bend.start) / (bend.end - bend.start))) : 0;
      const farm = map.farmBend, u = farm ? Math.max(0, Math.min(1, (z - farm.start) / (farm.end - farm.start))) : 0;
      const offset = (bend ? bend.offset * t * t * (3 - 2 * t) : 0) + (farm ? farm.offset * u * u * (3 - 2 * u) : 0);
      const left = center + offset - 3.5 - edgeRandom() * .5, right = center + offset + 3.4 + edgeRandom() * .5;
      this.roadProfile.push({ z, left, right });
      const x = left;
      if (!i) road.moveTo(x, -z); else road.lineTo(x, -z);
    }
    for (let i = steps; i >= 0; i--) road.lineTo(this.roadProfile[i].right, -this.roadProfile[i].z);
    road.closePath();
    // Road and footpath coverage is rendered once by makeApproaches.
    if(map.farmBend)this.farmRoadPoints=[[48,80],[75,81.2],[77,84],[49,83.2]];
    const rand = randomGenerator(map.scenerySeed);
    for (let i = 0; i < 12; i++) {
      const x = (rand() - .5) * (map.width + 30), z = (rand() - .5) * (map.depth + 25);
      if (Math.abs(x) < 6 || map.buildings.some(b => inside({ x, z }, b, 2))) continue;
      this.makeGrass(x, z, rand);
    }
    for (let i = 0; i < 30; i++) {
      const edge = i % 4, a = rand();
      const x = edge < 2 ? (edge ? -1 : 1) * (map.width / 2 + 1 + rand() * 6) : (a - .5) * map.width;
      const z = edge >= 2 ? (edge === 2 ? -1 : 1) * (map.depth / 2 + 1 + rand() * 5) : (a - .5) * map.depth;
      const size = 1.2 + rand() * 2.8;
      const rock = this.mesh(new THREE.DodecahedronGeometry(size, 0), i % 2 ? '#b9a17d' : '#c6ab82', x, size * .32, z);
      rock.scale.set(1, .7, .75); rock.rotation.y = rand() * 6;
    }
    makeApproaches(this);
    this.makeGroundDetails();
    this.makeSandMarks();
    this.makeWornTerrain();
  },

  // A map with hills (world/heightfield.js): the ground is its own mesh
  // (terrain-mesh.js) with the retaining walls on its edges. Deadwater's
  // street, sand and scrub are not built; empty stand-ins take their place
  // for what the rest of the view reads (a road nowhere, no ground detail).
  makeHillTerrain() {
    const { map } = this;
    this.terrainError = TERRAIN_ERROR[this.initialQuality] ?? .02;
    this.terrainMesh = buildTerrainMesh(this, this.ground, map, this.terrainError);
    this.scene.add(this.terrainMesh);
    // The stream's water, if the map has one, and what stands over and in it:
    // each crossing's deck (map.crossings looks), the stones and the mill
    // wheel (render/crossing-decks.js).
    this.waterMesh = buildWaterMesh(this, this.ground, map);
    if (this.waterMesh) this.scene.add(this.waterMesh);
    buildCrossingDecks(this, this.ground, map);
    buildRetainingWalls(this, this.ground, map.terrainLook);
    buildTrees(this, map); // s2-trees: trunks merged per cell, canopies instanced
    this.roadProfile = [{ z: -1e4, left: 1e5, right: 1e5 }, { z: 1e4, left: 1e5, right: 1e5 }];
    this.sandMarks = [];
    for (const key of ['groundDetails', 'extraGroundDetails', 'performanceDetails']) { this[key] = new THREE.Group(); this.scene.add(this[key]); }
    // Grass tufts, stones, twigs, stalks and leaf litter, per preset (it reads
    // the terrain mesh, so after it).
    buildTerrainDetails(this, this.ground, map);
    this.leafFX = buildLeaves(this, map); // s3-leaves: the woods' leaf carpet, falling and kicked-up leaves
    this.groundMarks = buildGroundMarks(this, map); // s5-ground: marks on the ground (one draped mesh) and raised bits (one instanced mesh)
  },

  // A switch to a finer preset than the map loaded with rebuilds the ground's
  // tiles at its finer error, into the same group (same material, so no new
  // shader programs; marks already made keep their own copies).
  refineTerrain(name) {
    const error = TERRAIN_ERROR[name] ?? .02;
    if (!this.terrainMesh || !(error < this.terrainError)) return;
    const fresh = buildTerrainMesh(this, this.ground, this.map, error);
    for (const tile of [...this.terrainMesh.children]) { tile.geometry.dispose(); this.terrainMesh.remove(tile); }
    for (const tile of [...fresh.children]) this.terrainMesh.add(tile);
    this.terrainMesh.userData.triangles = fresh.userData.triangles; this.terrainError = error;
  },

  roadEdges(z) {
    const rows = this.roadProfile;
    for (let i = 1; i < rows.length; i++) if (z <= rows[i].z) {
      const t = Math.max(0, (z - rows[i - 1].z) / (rows[i].z - rows[i - 1].z));
      return { left: lerp(rows[i - 1].left, rows[i].left, t), right: lerp(rows[i - 1].right, rows[i].right, t) };
    }
    return rows.at(-1);
  },

  onSideRoad(x,z,padding=0) {
    if(this.approachPaths && onApproach(this.approachPaths,x,z,padding))return true;
    // Built once, each with its bounds: this is asked tens of thousands of
    // times while the ground is dressed, and most points are nowhere near.
    const branches=this.sideBranches ||= (this.map.farmBend ? [...(this.map.sideRoads||[]),{points:[[48,80],[75,81.2],[77,84],[49,83.2]]}] : this.map.sideRoads||[])
      .map(({points})=>({points,minX:Math.min(...points.map(p=>p[0])),maxX:Math.max(...points.map(p=>p[0])),minZ:Math.min(...points.map(p=>p[1])),maxZ:Math.max(...points.map(p=>p[1]))}));
    return branches.some(({points,minX,maxX,minZ,maxZ}) => {
      if(x<minX-padding||x>maxX+padding||z<minZ-padding||z>maxZ+padding)return false;
      let within=false;
      for(let i=0,j=points.length-1;i<points.length;j=i++) {
        const [ax,az]=points[i],[bx,bz]=points[j];
        if((az>z)!==(bz>z) && x<(bx-ax)*(z-az)/(bz-az)+ax) within=!within;
        if(padding){const dx=bx-ax,dz=bz-az,t=Math.max(0,Math.min(1,((x-ax)*dx+(z-az)*dz)/(dx*dx+dz*dz)));if(Math.hypot(x-ax-dx*t,z-az-dz*t)<padding)return true;}
      }
      return within;
    });
  },

  makeWornTerrain() {
    const random = randomGenerator(this.map.scenerySeed + 604), group = new THREE.Group(); this.static.add(group);
    const obstacles = boxIndex(mapColliders(this.map));
    for (let i = 0; i < 130; i++) {
      const x = (random() - .5) * this.map.width, z = (random() - .5) * this.map.depth, radius = 1.1 + random() * 1.7;
      const edge = this.roadEdges(z);
      if ((x > edge.left - radius - .5 && x < edge.right + radius + .5) || this.onSideRoad(x,z,radius) || this.map.buildings.some(b => inside({ x, z }, b, radius + 2.5))) continue;
      if (obstacles.some(x, z, radius + .5, b => inside({ x, z }, b, radius + .5)) || this.map.targets.some(t => Math.hypot(t.x - x, t.z - z) < radius + 1)) continue;
      const geometry = new THREE.CircleGeometry(radius, 9); geometry.rotateX(-Math.PI / 2);
      const positions = geometry.attributes.position;
      for (let k = 0; k < positions.count; k++) {
        positions.setY(k, k === 0 ? .012 + random() * .02 : -.025);
        if (k > 0) { const scale = .8 + random() * .3; positions.setX(k, positions.getX(k) * scale); positions.setZ(k, positions.getZ(k) * scale); }
      }
      geometry.computeVertexNormals();
      const color = '#' + new THREE.Color(this.map.palette.ground).multiplyScalar(.965 + random() * .065).getHexString();
      const patch = this.mesh(geometry, color, x, 0, z, group); patch.castShadow = false;
    }
  },

  makeSandMarks() {
    const random = randomGenerator(this.map.scenerySeed + 411), points = [[], []]; this.sandMarks = [];
    const obstacles = boxIndex(mapColliders(this.map));
    for (let i = 0; i < 1900 * this.map.width * this.map.depth / (76 * 64); i++) {
      const x = (random() - .5) * this.map.width, z = (random() - .5) * this.map.depth;
      if (this.map.buildings.some(b => inside({ x, z }, b, 2.7)) || obstacles.some(x, z, .3, b => inside({ x, z }, b, .3))) continue;
      const edge = this.roadEdges(z), road = (x > edge.left && x < edge.right) || this.onSideRoad(x,z);
      const angle = random() * Math.PI, length = .2 + random() ** 1.5 * 1.05;
      const dx = Math.cos(angle) * length, dz = Math.sin(angle) * length;
      const sameSurface = t => {
        const px=x+dx*t,pz=z+dz*t,edge=this.roadEdges(pz);
        return road===((px>edge.left&&px<edge.right)||this.onSideRoad(px,pz));
      };
      if(!sameSurface(.5)||!sameSurface(1))continue;
      // Individual short, straight, irregular marks: no repeating UV pattern.
      const y = road ? .041 : -.018;
      points[road ? 1 : 0].push(x, y, z, x + dx, y, z + dz);
    }
    // Narrow approaches need deliberate coverage; map-wide sampling leaves short
    // walks nearly blank, especially around the large building exclusion margins.
    for(const path of this.approachPaths || [])for(let i=1;i<path.points.length;i++) {
      const a=path.points[i-1],b=path.points[i],distance=Math.hypot(b.x-a.x,b.z-a.z);
      if(distance<.05)continue;
      const tx=(b.x-a.x)/distance,tz=(b.z-a.z)/distance;
      const strandCount=Math.floor(distance*1.5+random());
      for(let j=0;j<strandCount;j++) {
        const along=random(),offset=(random()-.5)*.8;
        const x=a.x+(b.x-a.x)*along-tz*offset,z=a.z+(b.z-a.z)*along+tx*offset;
        const angle=random()*Math.PI,length=.25+random()*.65,dx=Math.cos(angle)*length,dz=Math.sin(angle)*length;
        if(!this.onSideRoad(x,z)||!this.onSideRoad(x+dx*.5,z+dz*.5)||!this.onSideRoad(x+dx,z+dz))continue;
        if(obstacles.some(x,z,.15,o=>inside({x,z},o,.15))||obstacles.some(x+dx,z+dz,.15,o=>inside({x:x+dx,z:z+dz},o,.15)))continue;
        points[1].push(x,.043,z,x+dx,.043,z+dz);
      }
    }
    for (let i = 0; i < 2; i++) {
      const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(points[i], 3));
      const marks = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: i ? '#5f4a30' : '#bca077', transparent: true, opacity: i ? .1 : .13, depthWrite: false }));
      // Approach masks are transparent too: draw strands afterwards so their
      // opaque road-colored pixels cannot paint over the line segments.
      marks.renderOrder=1;
      this.scene.add(marks); this.sandMarks.push(marks);
    }
  },

  makeWallFinish(b, wall) {
    const wear = randomGenerator(Math.round((wall.x + 60) * 817 + (wall.z + 60) * 311));
    const horizontal = wall.w > wall.d, length = horizontal ? wall.w : wall.d;
    const sign = horizontal ? Math.sign(wall.z - b.z) : Math.sign(wall.x - b.x);
    const brick = b.finish === 'brick', rowHeight = brick ? .36 : .29;
    const colors = [.93, 1.005, 1.03].map(v => '#' + new THREE.Color(b.color).multiplyScalar(v).getHexString());
    const face=(horizontal ? wall.d : wall.w)/2+.018;
    if(b.finish==='vertical') {
      for(let start=-length/2;start<length/2;start+=.38){
        const width=Math.min(.38,length/2-start)-.015,along=start+width/2;
        this.box(wall.x+(horizontal?along:sign*face),wall.height/2,wall.z+(horizontal?sign*face:along),horizontal?width:.035,wall.height-.03,horizontal?.035:width,colors[Math.floor(wear()*3)]);
      }
      return;
    }
    if(b.finish==='plaster') {
      // Broad muted patches, chipped to reveal a few courses near the base.
      for(let i=0;i<Math.ceil(length/2.5);i++){
        const along=-length/2+(i+.5)*length/Math.ceil(length/2.5),w=length/Math.ceil(length/2.5)*.8,h=.2+wear()*.5;
        this.box(wall.x+(horizontal?along:sign*face),h/2+.12,wall.z+(horizontal?sign*face:along),horizontal?w:.027,h,horizontal?.027:w,colors[i%3]);
      }
      return;
    }
    for (let row = 0; row * rowHeight < b.height; row++) {
      const h = Math.min(rowHeight, b.height - row * rowHeight) - .014;
      if (h <= 0) continue;
      const step = brick ? .85 : length;
      for (let start = -length / 2 - (brick && row % 2 ? step / 2 : 0); start < length / 2; start += step) {
        const left = Math.max(start, -length / 2), right = Math.min(start + step, length / 2), width = right - left - .014 - (wear() < .18 ? .04 : 0);
        if (width < .02) continue;
        const along = (left + right) / 2, face = (horizontal ? wall.d : wall.w) / 2 + .015;
        this.box(wall.x + (horizontal ? along : sign * face), row * rowHeight + h / 2 + .008,
          wall.z + (horizontal ? sign * face : along), horizontal ? width : .04, h, horizontal ? .04 : width,
          colors[(row + Math.floor((start + length) / step)) % colors.length]);
      }
    }
  },

  // Only Balanced and up show the dense ground cover; Performance and Potato
  // show just the sparse seventh of it. Building the dense part anyway was over
  // a second of every low-end load (1.5 s of an 8 s load here) for geometry
  // those presets never draw. The random sequence is walked in full either way,
  // so the sparse patches land exactly where they always did, and a later
  // switch to a higher preset rebuilds the whole set identically.
  groundDetailsWanted(name) { return name === 'balanced' || isDemanding(name); },

  makeGroundDetails(full = this.groundDetailsWanted(this.initialQuality)) {
    const base = new THREE.Group(), extra = new THREE.Group(), sparse = new THREE.Group(); this.scene.add(base, extra, sparse);
    this.groundDetailsFull = full;
    const skipped = new THREE.Object3D(), place = (geometry, color, x, y, z, group) => group === sparse || full ? this.mesh(geometry, color, x, y, z, group) : skipped;
    this.performanceDetails=sparse;
    this.groundDetails = base; this.extraGroundDetails = extra;
    const random = randomGenerator(this.map.scenerySeed + 73), obstacles = boxIndex(mapColliders(this.map));
    // Shared, unit-sized templates scaled per piece, instead of a freshly built
    // geometry for every blade, seed head and pebble. Around ten thousand of
    // them used to be constructed here only to be merged and discarded at once.
    // The merge applies each piece's full transform, scale included, so the
    // result is the same geometry: a cone's vertices scale linearly with its
    // height and a polyhedron's with its radius, and normals go through the
    // normal matrix.
    const thinStem = new THREE.ConeGeometry(.035, 1, 3), wideStem = new THREE.ConeGeometry(.075, 1, 3);
    const seedHead = new THREE.SphereGeometry(.045, 5, 3), pebble = new THREE.DodecahedronGeometry(1);
    let patches = 0;
    for (let attempt = 0; attempt < 9000 && patches < Math.round(950 * this.map.width * this.map.depth / (76 * 64)); attempt++) {
      const x = (random() - .5) * this.map.width, z = (random() - .5) * this.map.depth;
      const road = this.roadEdges(z);
      if ((x > road.left - 1 && x < road.right + 1) || this.onSideRoad(x,z,1) || (this.map.crops || []).some(f => inside({ x, z }, f, .3)) || this.map.buildings.some(b => inside({ x, z }, b, 2.7)) ||
          obstacles.some(x, z, 1, b => inside({ x, z }, b, 1)) || this.map.targets.some(t => Math.hypot(t.x - x, t.z - z) < 2)) continue;
      patches++;
      const group = patches%7===0 ? sparse : patches <= Math.round(330 * this.map.width * this.map.depth / (76 * 64)) ? base : extra;
      const dry = patches % 5 !== 0, stems = dry ? 5 + Math.floor(random() * 5) : 6;
      for (let i = 0; i < stems; i++) {
        const angle = i / stems * Math.PI * 2 + random() * .4;
        const height = dry ? .22 + random() * .42 : .16 + random() * .18;
        const stem = place(dry ? thinStem : wideStem,
          dry ? i % 3 ? '#b8a167' : '#c9b577' : '#83856a',
          x + Math.cos(angle) * .12, height * .42, z + Math.sin(angle) * .12, group);
        stem.scale.y = height;
        stem.rotation.set(Math.sin(angle) * .45, angle, Math.cos(angle) * .45);
        if (dry && i % 3 === 0) {
          const head = place(seedHead, '#c9b577',
            x + Math.cos(angle) * .2, height * .9, z + Math.sin(angle) * .2, group);
          head.scale.set(.7, 1.8, .7);
        }
      }
      if (patches % 2 === 0) for (let i = 0; i < 3; i++) {
        const size = .07 + random() * .1;
        const stone = place(pebble, '#8c7a5c',
          x + (random() - .5) * 1.5, .05, z + (random() - .5) * 1.5, group);
        stone.scale.set(size, size * .45, size); stone.rotation.y = random() * 6;
      }
    }
    this.noShadows(base); this.noShadows(extra); this.noShadows(sparse);
    this.batch(base); this.batch(extra); this.batch(sparse);
    for (const root of [base, extra, sparse]) freezeTransforms(root);
    base.userData.patches = Math.min(330, patches); extra.userData.patches = Math.max(0, patches - 330);
  },

  makeGrass(x, z, rand) {
    for (let k = 0; k < 4; k++) {
      const m = this.box(x + (rand() - .5) * .35, .13, z + (rand() - .5) * .25, .035, .25 + rand() * .2, .035, '#a69665');
      m.rotation.z = (rand() - .5) * 1.4; m.castShadow = false;
    }
  },

  makeCactus(x, z, scale = 1, parent = this.static) {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.scale.setScalar(scale); parent.add(g);
    this.cylinder(0, 1.15, 0, .25, 2.3, '#788568', g, 7, .21);
    this.mesh(new THREE.SphereGeometry(.215, 7, 5), '#788568', 0, 2.3, 0, g);
    this.box(.4, .95, 0, .8, .27, .28, '#788568', g);
    this.cylinder(.72, 1.24, 0, .15, .7, '#788568', g, 7);
    this.box(-.33, 1.4, 0, .66, .24, .24, '#83916e', g);
    this.cylinder(-.6, 1.66, 0, .13, .65, '#83916e', g, 7);
  },

  makeBuilding(b) {
    if (b.style === 'colonial') return makeColonialBuilding(this, b); // s2-buildings: Hollow Wick's buildings
    // Hills: a building stands on its pad at baseY (heightfield.js pads);
    // everything below is built at 0 and lifted with it at the end.
    const angle = b.angle || 0, baseY = b.baseY || 0, oldStatic = new Set(this.static.children);
    b = { ...b, ...BUILDING_FINISHES[b.id], angle: 0 };
    this.flat(b.x, b.z, b.w, b.d, '#9b8161', b.cargo ? .245 : .065);
    if(b.cargo) {
      // The freight floor sits above the rail heads, with continuous solid coverage.
      this.box(b.x,.17,b.z,b.w,.15,b.d,'#655946');
      for(let z=-b.d/2+.22;z<b.d/2;z+=.44)
        this.box(b.x,.26,b.z+z,b.w-.12,.035,Math.min(.42,b.d/2-z+.2),'#8b785b');
    }
    for (const w of buildingWalls(b)) {
      this.box(w.x, w.height / 2, w.z, w.w, w.height, w.d, b.color);
      this.makeWallFinish({ ...b, height: w.height }, w);
    }
    for (const opening of b.windows || []) {
      const g = new THREE.Group(); this.static.add(g);
      const horizontal = ['front', 'back'].includes(opening.side), sign = ['back', 'left'].includes(opening.side) ? -1 : 1;
      g.position.set(b.x + (horizontal ? opening.offset : sign * b.w / 2), 0, b.z + (horizontal ? sign * b.d / 2 : opening.offset));
      g.rotation.y = { front: 0, back: Math.PI, left: -Math.PI / 2, right: Math.PI / 2 }[opening.side];
      this.box(0, (b.height + 1.75) / 2, 0, opening.width, b.height - 1.75, .38, b.color, g);
      for (const x of [-opening.width / 2, opening.width / 2]) this.box(x, 1.12, .22, .1, 1.36, .12, '#79634b', g);
      for (const y of [.52, 1.77]) this.box(0, y, .25, opening.width + .2, .1, .22, '#987e5d', g);
      if (opening.boarded) {
        this.box(0, 1.12, .25, opening.width, 1.15, .05, '#504a3c', g);
        for (const tilt of [-.22, .18]) { const plank = this.box(0, 1.12 + tilt, .34, opening.width + .25, .19, .08, '#8c785b', g); plank.rotation.z = tilt; }
      }
      if (b.abandoned || opening.boarded) makeCobweb(this, g, opening.width);
      for (const side of [-1, 1]) {
        const shutter = this.box(side * (opening.width / 2 + .23), 1.13, .19, .36, 1.17, .07, '#7e806b', g);
        shutter.rotation.y = side * .28; shutter.rotation.z = side * .025;
      }
    }
    // Doorway lintel and structural corner posts.
    this.box(b.x, b.height - .21, b.z + b.d / 2, b.doorWidth, .42, .4, '#866c4f');
    // Topped just under the eave: taller, they poked up through the roof as a
    // small block at each corner.
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) this.box(b.x + sx * b.w / 2, (b.height - .1) / 2, b.z + sz * b.d / 2, .26, b.height - .1, .26, '#967858');
    // Only actual front entrances get a front porch.
    if(!b.cargo && (b.doors||['front']).includes('front')) {
    // A plank porch with small steps, hitching rail and interior counter.
    this.box(b.x, .12, b.z + b.d / 2 + 1.2, b.cargo ? 2.4 : b.w + 1, .24, 2.2, '#b59971');
    for (let i = -(b.cargo ? 1 : b.w / 2); i <= (b.cargo ? 1 : b.w / 2); i += 1.5) this.flat(b.x + i, b.z + b.d / 2 + 1.2, .018, 2.15, '#a78e6a', .248);
    this.box(b.x, .06, b.z + b.d / 2 + 2.4, 3, .12, .65, '#b39a76');
    }
    for (const side of (b.doors || ['front']).filter(side => side !== 'front')) {
      const horizontal = side === 'back', sign = side === 'left' || side === 'back' ? -1 : 1;
      const x = b.x + (horizontal ? 0 : sign * b.w / 2), z = b.z + (horizontal ? -b.d / 2 : 0);
      // Side walls are eave walls: the roof comes down to the wall top there, so
      // a lintel reaching it showed through the roof as a small plank.
      this.box(x, b.height - (horizontal ? .21 : .3), z, horizontal ? b.doorWidth : .4, .42, horizontal ? .4 : b.doorWidth, '#866c4f');
      if(!b.cargo)this.box(x + (horizontal ? 0 : sign * .65), .06, z + (horizontal ? -.65 : 0), horizontal ? 3.1 : 1.5, .12, horizontal ? 1.5 : 3.1, '#b39a76');
    }
    const roof = new THREE.Group(); this.scene.add(roof);
    const mainMat = new THREE.MeshStandardMaterial({ color: b.roofColor, roughness: 1, transparent: true });
    const trimMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(b.roofColor).multiplyScalar(.8), roughness: 1, transparent: true });
    const roofMaterials = [mainMat, trimMat, ...[.96, 1.025, 1.055].map(v => new THREE.MeshStandardMaterial({ color: new THREE.Color(b.roofColor).multiplyScalar(v), roughness: .95, transparent: true }))];
    const slope = Math.atan2(b.cargo ? .12 : .7, b.w / 2);
    // Wear, the same every game for a given building (seeded by its id): a few
    // missing shingles showing the dark underlayer, a few lifted ones, a nailed
    // board patch; on metal, rust patches and a lifted sheet. Drawn only with
    // the roof's own materials, so it costs no draw calls.
    let seed = 2166136261; for (const c of String(b.id)) seed = Math.imul(seed ^ c.charCodeAt(0), 16777619);
    const wear = () => { seed = Math.imul(seed ^ seed >>> 15, 2246822507) + 0x6d2b79f5 | 0; return ((seed ^ seed >>> 13) >>> 0) / 4294967296; };
    const worn = .5 + wear(); // some roofs are kept up better than others
    for (const side of [-1, 1]) {
      const panel = this.box(b.x + side * b.w / 4, b.height + .36, b.z, b.w / 2 + .65, .15, b.d + 1, mainMat, roof); panel.rotation.z = -side * slope;
      const width = b.w / 2 + .65, depth = b.d + 1;
      if (b.id === 'supplies' || b.metalRoof) {
        // Raised corrugations run down the pitch of the weathered metal roof.
        for (let z = -depth / 2 + .18; z < depth / 2; z += .45)
          this.box(0, .105, z, width, .045, .045, roofMaterials[3], panel);
        for (let i = 0, n = Math.round(worn * 2); i < n; i++) {
          const rust = this.box((wear() - .5) * (width - 1.2), .082, (wear() - .5) * (depth - 1.4), .5 + wear() * .7, .012, .4 + wear() * .6, trimMat, panel);
          rust.rotation.y = (wear() - .5) * .5;
        }
        if (wear() < .6 * worn) { // one sheet's end lifted by the wind
          const sheet = this.box((wear() > .5 ? 1 : -1) * (width / 2 - .45), .12, (wear() - .5) * (depth - 1.5), .9, .025, .95, roofMaterials[4], panel);
          sheet.rotation.z = side * .1;
        }
      } else {
        // Staggered wooden shingles have a shallow physical lip and muted tones.
        for (let row = 0, x = -width / 2; x < width / 2; row++, x += .57) {
          for (let z = -depth / 2 - (row % 2 ? .55 : 0), col = 0; z < depth / 2; z += 1.1, col++) {
            const low = Math.max(z, -depth / 2), high = Math.min(z + 1.1, depth / 2);
            const cx = x + Math.min(.57, width / 2 - x) / 2, cz = (low + high) / 2, w = Math.min(.57, width / 2 - x) - .012, d = high - low - .012;
            const roll = wear(), inside = w > .4 && d > .6; // never the cut ones along the edges
            if (inside && roll < .03 * worn) { this.box(cx, .082, cz, w - .04, .012, d - .06, trimMat, panel); continue; } // missing: the dark underlayer
            const tile = this.box(cx, .1, cz, w, .035, d, roofMaterials[2 + (row * 7 + col * 3 + col % 2) % 3], panel);
            if (inside && roll > 1 - .035 * worn) { tile.position.y = .12; tile.rotation.x = (wear() > .5 ? 1 : -1) * .09; } // lifted
          }
        }
        if (wear() < .7 * worn) { // a newer board nailed over a leak
          const patch = this.box((wear() - .5) * (width - 1.4), .128, (wear() - .5) * (depth - 1.6), .95 + wear() * .5, .03, .3, roofMaterials[4], panel);
          patch.rotation.y = (wear() - .5) * .35;
        }
      }
    }
    this.box(b.x, b.height + .8, b.z, .18, .12, b.d + 1.15, trimMat, roof);
    // Front fascia, tucked under the eave: it runs past the side walls, where the
    // pitched roof is lowest, and with its top above the wall its two ends
    // showed through the roof as a small block at each front corner.
    this.box(b.x, b.height - .36, b.z + b.d / 2 + .22, b.w + .4, .5, .22, '#9f805c');
    // Shingles and corrugations stand 3-4cm proud of the panel carrying them, and
    // that panel already casts the whole roof. Re-drawing every tile into the
    // shadow map is the single largest source of wasted casters per building.
    for (const layer of roof.children) for (const tile of layer.children) this.noShadows(tile);
    this.batch(roof, false);
    // One material per roof, with each shade (panel, trim, three shingle tones)
    // carried per vertex: the roof drew once per shade (about five draws a
    // building), then twice (what casts shadows, and the shingles that don't),
    // and now once, with the same picture. The shades only ever differed in colour:
    // setQuality gives every roof material the same roughness and bump map.
    const roofMaterial = new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: 1, transparent: true });
    // (One mesh since v0.980a: the shingles, which never cast, after the parts
    // that do, and the shadow pass draws only those: bake-colors.js castersFirst.)
    bakeColors(roof, { material: roofMaterial, castersFirst: true });
    roofMaterials.forEach(m => m.dispose()); roofMaterials.length = 0; roofMaterials.push(roofMaterial);
    // Thin raised roof layers should not produce shadow-map striping on each other.
    roof.traverse(m => { if (m.isMesh) m.receiveShadow = false; });
    // Captured after the batch: these are the merged meshes that actually came
    // out as casters. The roof fade toggles exactly these, because traversing
    // the whole group undid the noShadows() above on the first frame and put
    // every shingle batch back into the shadow pass.
    const casters = [];
    roof.traverse(m => { if (m.isMesh && m.castShadow) casters.push(m); });
    // A lifted roof is drawn faint (see update). Blended, every place two roof
    // surfaces overlap (shingles on their panel, the two slopes meeting under
    // the ridge cap) was painted twice and showed as a brighter strip across
    // the room. So a faded roof first lays down only its depth (these copies,
    // drawn after every other see-through thing so effects under the roof are
    // not hidden), and its colour then lands on the nearest surface alone.
    const depthOnly = this.roofDepthMaterial ||= new THREE.MeshBasicMaterial({ colorWrite: false, transparent: true, depthWrite: true });
    const colour = [], prepass = [];
    roof.traverse(m => { if (m.isMesh) colour.push(m); });
    for (const m of colour) {
      const copy = m.clone(false); copy.material = depthOnly; copy.castShadow = copy.receiveShadow = false;
      copy.renderOrder = ROOF_PREPASS_ORDER; copy.visible = false; copy.userData.roofPrepass = true;
      m.parent.add(copy); prepass.push(copy);
    }
    // Where the roof reaches (eaves and porch roofs past the walls) and the
    // doorways: walking up to a door under a deep overhang (the big freight
    // hall and depot) used to vanish under the roof for a moment before the
    // player crossed the wall line and it faded.
    roof.updateMatrixWorld(true); const reach = new THREE.Box3().setFromObject(roof);
    // A doorway: its middle, the way along the wall (ux, uz), its half
    // width. (v146, owner: this was a 1.6 m+ circle, so walking along the
    // wall past a door under the eaves lifted the roof and showed the room
    // from outside. Now only standing in the doorway itself does.)
    const doors = buildingOpenings(b).filter(o => o.type !== 'window').map(o => { const len = Math.hypot(o.b.x - o.a.x, o.b.z - o.a.z) || 1; return { x: (o.a.x + o.b.x) / 2, z: (o.a.z + o.b.z) / 2, ux: (o.b.x - o.a.x) / len, uz: (o.b.z - o.a.z) / len, half: len / 2 + .15 }; });
    this.roofs.push({ ...b, group: roof, casters, materials: roofMaterials, colour, prepass, opacity: 1, reach, doors });
    const beforeInterior = new Set(this.static.children);
    if(b.interiorStyle) makeDetailedInterior(this,b);
    // (dw-furniture: the plain rooms' counter and stools are drawn by
    // makeInteriorDetails from room-furniture.js, the list their colliders come from.)
    if (!b.cargo) makeInteriorDetails(this,b);
    // Furniture and interior trim sit under a closed roof, so the sun driving the
    // shadow map never reaches them. Their casters are draw cost with no pixels.
    for (const child of this.static.children) if (!beforeInterior.has(child)) this.noShadows(child);
    if (b.cargo) {
      for(const side of [-1,1]) {
        for(const z of [-b.d*.3,b.d*.3]) {
          const wheel=this.cylinder(b.x+side*(b.w/2+.08),.4,b.z+z,.43,.18,'#484e48',this.static,10);wheel.rotation.z=Math.PI/2;
        }
        for(const z of [-b.d/2+.2,b.d/2-.2])this.box(b.x+side*(b.w/2+.21),1.2,b.z+z,.08,2.4,.1,'#596157');
      }
    }
    if (angle || baseY) {
      const pivot = new THREE.Group(); pivot.position.set(b.x, baseY, b.z); pivot.rotation.y = angle;
      for (const mesh of [...this.static.children].filter(m => !oldStatic.has(m))) {
        mesh.position.x -= b.x; mesh.position.z -= b.z; pivot.add(mesh);
      }
      this.static.add(pivot);
      // Roof geometry uses the same pivot, while its fade footprint stays in map space.
      for (const mesh of roof.children) { mesh.position.x -= b.x; mesh.position.z -= b.z; }
      roof.position.set(b.x, baseY, b.z); roof.rotation.y = angle;
    }
  },

  makeFence(f) {
    const isX = f.axis === 'x';
    const panels = Math.ceil(f.length / 2.5), span = f.length / panels;
    for (let i = 0; i <= panels; i++) {
      const t = -f.length / 2 + i * span, x = f.x + (isX ? t : 0), z = f.z + (isX ? 0 : t);
      this.box(x, .56 + this.gy(x, z), z, .22, 1.12, .22, '#897357');
    }
    for (let i = 0; i < panels; i++) {
      const t = -f.length / 2 + (i + .5) * span, x = f.x + (isX ? t : 0), z = f.z + (isX ? 0 : t);
      // (Hills: each rail runs post to post over the ground.)
      const rise = !this.map.terrain ? 0 : this.gy(isX ? x + span / 2 : x, isX ? z : z + span / 2) - this.gy(isX ? x - span / 2 : x, isX ? z : z - span / 2);
      for (const h of [.4, .84]) {
        const rail = this.box(x, h + this.gy(x, z), z, isX ? span - .15 : .12, .13, isX ? .12 : span - .15, '#a08a66');
        if (rise) { if (isX) rail.rotation.z = Math.atan2(rise, span); else rail.rotation.x = -Math.atan2(rise, span); }
      }
    }
  },

  makeProp(p) {
    const g = new THREE.Group(); g.position.set(p.x, this.gy(p.x, p.z), p.z); g.rotation.y = p.angle || 0;
    if (p.health !== null) { this.scene.add(g); this.props.set(p.id, g); } else this.static.add(g);
    if (['brokenWagon', 'windmill', 'trough', 'cistern', 'ruinedArch', 'telegraph', 'deadTree', 'stump', 'boulder'].includes(p.type)) makeLandmark(this, p, g);
    if (RAIL_TYPES[p.type]) makeRailProp(this,p,g);
    else if (ROADSIDE_TYPES[p.type]) makeRoadside(this, p, g);
    else if (isColonialPart(p.type)) makeColonialPart(this, p, g); // s2-buildings
    else if (GRAVE_TYPES[p.type]) makeGrave(this, p, g); // s2-graveyard
    else if (HOLLOW_TYPES[p.type]) makeHollowProp(this, p, g); // (s2-props)
    else if (LIFE_TYPES[p.type]) makeLifeProp(this, p, g); // s5-life (their moving parts join world/hollow-life.js's meshes)
    else if (HOLLOW_BREAKABLES[p.type]) makeHollowBreakable(this, p, g); // s2-breakables
    else if (DRESSING_TYPES[p.type]) makeDressing(this, p, g); // s5-props: Hollow Wick's static dressing
    else if (p.type === 'barrel') {
      this.cylinder(0, .5, 0, .46, 1, '#9c7d58', g, 10, .41);
      for (const y of [.2, .77]) this.cylinder(0, y, 0, .465, .09, '#696c58', g, 10);
      this.cylinder(0, 1.006, 0, .34, .015, '#b6996f', g, 10);
    } else if (p.type === 'crate' && p.broken) {
      // Half a crate: the lid and one wall gone, the inside open to the sky,
      // and the planks that came off lying beside it. Same palette and the
      // same flat boxes as a whole crate, so it reads as the same object with
      // less of it left rather than as a different prop.
      const wall = .54;
      this.box(0, .05, 0, 1.15, .1, 1.15, '#8a6f4b', g);
      for (const [x, z, w, d] of [[0, -.53, 1.15, .1], [-.53, 0, .1, 1.15], [.53, .09, .1, .98]])
        this.box(x, wall / 2 + .1, z, w, wall, d, '#b39468', g);
      // What is left of the fourth wall, snapped off part way up.
      this.box(.14, .27, .53, .48, .34, .1, '#a8895f', g);
      for (const [x, z, w, d] of [[0, -.53, 1.2, .13], [-.53, 0, .13, 1.2]])
        this.box(x, wall + .13, z, w, .06, d, '#98784f', g);
      // Debris keeps to the footprint so it never reads as cover that is not there.
      for (const [x, z, angle, length] of [[.36, .46, .42, .62], [-.1, .44, -1.15, .5], [.3, -.26, .18, .44]]) {
        const plank = this.box(x, .04, z, length, .07, .15, '#957954', g); plank.rotation.y = angle;
      }
    } else if (p.type === 'crate') {
      this.box(0, .58, 0, 1.15, 1.16, 1.15, '#b39468', g);
      for (const side of [-1, 1]) { this.box(side * .5, 1.19, 0, .1, .06, 1.16, '#98784f', g); this.box(0, .58, side * .59, 1.15, .1, .035, '#957954', g); }
      const brace = this.box(0, 1.21, 0, 1.35, .04, .1, '#98784f', g); brace.rotation.y = Math.PI / 4;
    } else if (p.type === 'hay') {
      this.box(0, .38, 0, 1.5, .76, 1.15, '#c6aa65', g);
      for (const x of [-.43, .43]) this.box(x, .78, 0, .05, .03, 1.18, '#94764e', g);
    } else if (p.type === 'well') {
      this.cylinder(0, .4, 0, 1.05, .8, '#a79877', g, 10);
      this.cylinder(0, .81, 0, .8, .02, '#645e47', g, 10);
      for (const x of [-1, 1]) this.box(x, 1.2, 0, .15, 2.4, .15, '#846e51', g);
      this.box(0, 2.4, 0, 2.45, .16, 1.5, '#9e7d53', g); this.box(0, 1.7, 0, .05, 1.1, .05, '#6c5d47', g);
    } else if (p.type === 'tower') {
      for (const x of [-1.25, 1.25]) for (const z of [-1.25, 1.25]) this.box(x, 1.8, z, .22, 3.6, .22, '#8c7659', g);
      this.box(0, 3.6, 0, 3.4, .24, 3.4, '#8c7659', g);
      this.cylinder(0, 4.8, 0, 1.5, 2.25, '#8d9a89', g, 12);
      for (const y of [3.9, 5.6]) this.cylinder(0, y, 0, 1.53, .1, '#626f61', g, 12);
      this.mesh(new THREE.ConeGeometry(1.6, .45, 12), '#64766b', 0, 6.15, 0, g);
    } else if (p.type === 'cart') {
      this.box(0, .6, 0, 2.4, .2, 1.4, '#9d8059', g);
      for (const z of [-.72, .72]) {
        this.box(0, 1, z, 2.4, .6, .12, '#b1956c', g);
        for (const x of [-.7, .7]) { const wheel = this.cylinder(x, .44, z * 1.2, .44, .13, '#6e654f', g, 10); wheel.rotation.x = Math.PI / 2; }
      }
      for (const z of [-.45, .45]) this.box(1.8, .55, z, 1.7, .12, .12, '#9d8059', g);
    } else if (p.type === 'sign') {
      this.box(0, .7, 0, .2, 1.4, .2, '#756247', g);
      const board = new THREE.Group(); board.position.set(0, 1.33, .03); board.rotation.x = -.32; g.add(board);
      const arrow = new THREE.Shape(); const direction = p.direction || 1;
      arrow.moveTo(-1.18 * direction, -.27); arrow.lineTo(.82 * direction, -.27);
      arrow.lineTo(1.2 * direction, 0); arrow.lineTo(.82 * direction, .27); arrow.lineTo(-1.18 * direction, .27); arrow.closePath();
      const geometry = new THREE.ExtrudeGeometry(arrow, { depth: .12, bevelEnabled: false });
      this.mesh(geometry, '#a68a60', 0, 0, 0, board);
      this.box(-.08, -.18, .135, .045, .045, .02, '#5a5948', board);
      this.box(.08, .18, .135, .045, .045, .02, '#5a5948', board);
    } else if (p.type === 'deadwood') {
      const trunk = this.cylinder(0, .18, 0, .16, 1.1, '#84735a', g, 6, .12); trunk.rotation.z = Math.PI / 2;
      for (const side of [-1, 1]) {
        const branch = this.cylinder(side * .24, .3, side * .11, .065, .46, '#9e8867', g, 5, .03);
        branch.rotation.z = side * .8; branch.rotation.x = side * .6;
      }
    } else if (p.type === 'pot' || p.type === 'pottedPlant') {
      // Read from directly overhead, a pot is a ring with a dark hole in it.
      // The first version was a solid clay lump, which from this camera is
      // indistinguishable from a stone. The opening is what names the object,
      // so the silhouette is built outward from it: narrow foot, wide belly,
      // flared rim, and a recessed dark void in the middle. Still only the two
      // family colours, so it batches with the rest of the clutter.
      const clay = CLUTTER_CLAY, dark = CLUTTER_DARK;
      this.cylinder(0, .04, 0, .15, .08, clay, g, 8, .19);
      this.cylinder(0, .22, 0, .26, .3, clay, g, 8, .22);
      // Painted band round the belly: pottery, not a boulder.
      this.cylinder(0, .26, 0, .265, .05, dark, g, 8);
      // Flared rim, then the mouth sunk into it.
      this.cylinder(0, .42, 0, .23, .08, clay, g, 8, .28);
      this.cylinder(0, .45, 0, .2, .03, dark, g, 8);
      // Two lugs at the rim, which is what tells you it was made to be carried.
      for (const side of [-1, 1]) {
        const lug = this.box(side * .26, .4, 0, .09, .08, .14, clay, g);
        lug.rotation.z = side * .25;
      }
      if (p.type === 'pottedPlant') {
        // Dry soil heaped just under the rim, then a dead stem: the plant is
        // what fills the hole, so the pot still reads as a pot.
        this.cylinder(0, .44, 0, .19, .05, dark, g, 8, .17);
        const stem = this.box(0, .72, 0, .05, .56, .05, dark, g); stem.rotation.z = .12;
        for (let i = 0; i < 3; i++) {
          const a = i * 2.4;
          const twig = this.box(Math.cos(a) * .1, .82 + i * .14, Math.sin(a) * .1, .28, .032, .032, dark, g);
          twig.rotation.set(Math.sin(a) * .4, a, .55 + i * .16);
        }
      }
    } else if (p.type === 'brokenChair') {
      // Three legs and a cracked back, tipped onto whichever side lost its leg.
      const seat = CLUTTER_SEAT, dark = CLUTTER_DARK;
      const tipped = new THREE.Group(); tipped.rotation.z = .34; tipped.position.y = .04; g.add(tipped);
      this.box(0, .42, 0, .5, .06, .48, seat, tipped);
      for (const [x, z] of [[-.2, -.19], [.2, -.19], [.2, .19]])
        this.box(x, .21, z, .06, .42, .06, dark, tipped);
      // The stump of the fourth, snapped off short.
      this.box(-.2, .38, .19, .06, .14, .06, dark, tipped);
      for (const x of [-.2, .2]) this.box(x, .72, .21, .06, .54, .06, dark, tipped);
      for (const y of [.62, .86]) this.box(0, y, .21, .46, .07, .045, seat, tipped);
      // The broken leg, on the floor beside it.
      const leg = this.box(.34, .035, -.3, .42, .06, .06, dark, g);
      leg.rotation.set(0, .7, 0);
    } else if (p.type === 'cactus') this.makeCactus(0, 0, p.scale || 1, g);
    if (p.health !== null) { this.batch(g); this.propDetails.push(makePropDetails(this, p, g)); }
  },

  makePlayer() {
    const g = new THREE.Group();
    const body = new THREE.Group(); g.add(body); g.userData.body = body;
    for (const x of [-.15, .15]) this.box(x, .14, 0, .18, .27, .27, '#394a44', body).userData.deathPart='leg';
    this.cylinder(0, .57, 0, .29, .63, '#496e6b', body, 8, .24);
    this.cylinder(0, .96, 0, .2, .25, '#d6b58a', body, 8).userData.deathPart='head';
    this.cylinder(0, 1.06, 0, .39, .085, '#f0dbb2', body, 10).userData.deathPart='head';
    this.cylinder(0, 1.19, 0, .235, .23, '#dfc494', body, 8, .19).userData.deathPart='head';
    this.cylinder(0, 1.09, 0, .239, .075, '#6b5d48', body, 8).userData.deathPart='head';
    this.box(0, .84, .04, .44, .1, .4, '#b85d3e', body);
    const scarf = this.box(-.1, .7, .32, .16, .3, .06, '#b85d3e', body); scarf.rotation.x = -.3;
    g.userData.staticArm=this.box(.27, .69, -.2, .16, .16, .38, '#49716b', body);
    const gun = new THREE.Group(); gun.position.set(.27, .74, -.46); body.add(gun); g.userData.gun = gun;
    // Static: pale-blue receiver, exposed charge rails and a yellow muzzle collar.
    this.box(0, -.08, .12, .11, .2, .14, '#354e59', gun);
    this.box(0, 0, .025, .22, .19, .35, '#9bd9ee', gun);
    this.box(0, .11, .04, .15, .045, .25, '#c1edfa', gun);
    this.box(0, 0, -.19, .13, .13, .2, '#568697', gun);
    // (The two glowing rails share one material, so they merge into one draw,
    // and throw no shadow: two slivers 16 mm wide were two more shadow draws.)
    const railMaterial = new THREE.MeshBasicMaterial({color:'#bff6ff',toneMapped:false});
    for (const side of [-1, 1]) {
      this.box(side*.119, .012, .03, .025, .08, .22, '#4d8499', gun);
      const rail = this.box(side*.137, .015, .03, .016, .027, .18, '#bff6ff', gun);
      rail.material = railMaterial; rail.castShadow = false;
    }
    const muzzle = this.cylinder(0, 0, -.267, .112, .115, '#f1ce54', gun, 8);
    muzzle.rotation.x = Math.PI/2;
    const bore = this.cylinder(0, 0, -.327, .056, .008, '#304d5a', gun, 8);
    bore.rotation.x = Math.PI/2;
    this.staticMuzzle = new THREE.Vector3();
    const arcGeometry = new THREE.BufferGeometry();
    arcGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3*7*2*3),3));
    const crackle = new THREE.LineSegments(arcGeometry,new THREE.LineBasicMaterial({color:'#c9f7ff',transparent:true,opacity:.9,depthWrite:false,toneMapped:false,blending:THREE.AdditiveBlending}));
    crackle.frustumCulled=false;gun.add(crackle);
    gun.userData.crackle=crackle;gun.userData.crackleTick=-1;
    const ring = new THREE.Mesh(new THREE.RingGeometry(.49, .515, 40), new THREE.MeshBasicMaterial({ color: '#4b7065', transparent: true, opacity: .35, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = .065; g.add(ring); g.userData.ring = ring;
    const chevron = new THREE.Shape(); chevron.moveTo(0, 0); chevron.lineTo(-.11, .2); chevron.lineTo(.11, .2); chevron.closePath();
    const pointer = new THREE.Mesh(new THREE.ShapeGeometry(chevron), new THREE.MeshBasicMaterial({ color: '#f3e7c5', side: THREE.DoubleSide }));
    pointer.rotation.x = -Math.PI / 2; pointer.position.set(0, .08, -.95); g.add(pointer); g.userData.pointer = pointer;
    // Merge the body into a few draws: legs, head and the rest each become one
    // mesh (death reactions still find them by deathPart). The gun and the
    // Static arm move and hide on their own, so they sit out the body merge;
    // the gun's solid parts merge among themselves.
    body.remove(gun, g.userData.staticArm); this.batch(body); body.add(g.userData.staticArm, gun);
    this.batch(gun);
    return g;
  },

  makeTarget(moving, kind) {
    const g = new THREE.Group(); const board = new THREE.Group(); g.add(board); g.userData.board = board;
    if (kind === 'dummy') {
      this.box(0, .65, 0, .12, 1.3, .12, '#78634a', board);
      const torso = this.mesh(new THREE.CylinderGeometry(.24, .32, .64, 6), '#a79973', 0, 1.04, 0, board);
      torso.scale.z = .65;
      this.mesh(new THREE.IcosahedronGeometry(.23, 1), '#c4b18b', 0, 1.58, 0, board);
      for (const side of [-1, 1]) {
        const arm = this.box(side * .38, 1.2, 0, .4, .17, .19, '#a79973', board); arm.rotation.z = side * -.17;
      }
      for (const y of [.85, 1.17]) this.box(0, y, .175, .45, .035, .025, '#77694e', board);
      const disk = this.mesh(new THREE.SphereGeometry(.095, 7, 5), '#9a6350', 0, 1.1, .2, board); disk.scale.z = .2;
      // Everything on the board moves together (the hit wobble moves the
      // board), so it is one draw instead of eight.
      this.batch(board);
      return g;
    }
    this.box(0, .47, 0, .13, .9, .13, '#907552', board);
    this.box(0, .1, 0, 1.1, .18, .65, '#a88d62', board);
    const face = new THREE.Group(); face.position.set(0, 1, 0); face.rotation.x = .6; board.add(face);
    this.cylinder(0, 0, 0, .6, .14, '#eee0bd', face, 20);
    this.cylinder(0, .08, 0, .41, .016, moving ? '#6e8880' : '#b87552', face, 20);
    this.cylinder(0, .096, 0, .27, .018, '#ede0bc', face, 20);
    this.cylinder(0, .109, 0, .13, .02, '#ab5438', face, 16);
    this.batch(board);
    return g;
  },

  // Floating health bars over targets were replaced by the outgoing damage
  // numbers. The builder is gone rather than left hidden: it was four meshes
  // and two materials per target that nothing could ever show.

  makeAmbient() {
    // Sized to the greediest preset rather than a hard-coded 140: Quality asks
    // for 190 and was silently drawing 140 of them while the update loop wrote
    // fifty elements past the end of the buffer.
    const rand = randomGenerator(132);
    const moteCap = Math.max(...Object.values(GRAPHICS).map(q => q.motes));
    const points = new Float32Array(moteCap * 3);
    for (let i = 0; i < moteCap; i++) { points[i * 3] = (rand() - .5) * 65; points[i * 3 + 1] = .3 + rand() * 4; points[i * 3 + 2] = (rand() - .5) * 60; }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(points, 3));
    this.motes = new THREE.Points(geo, new THREE.PointsMaterial({ color: '#fff1c6', size: .045, transparent: true, opacity: .6, depthWrite: false })); this.scene.add(this.motes);
    this.ambientClock = 3;
    // The drifting fog sheets (fog-sheets.js: their picture, their uneven
    // clearing round the player and the aim, and on terrain maps their world
    // heights over the ground's height texture, made now on every preset).
    this.fogSheets = new FogSheets({ scene: this.scene, fog: this.look.fog, ground: this.ground, rand, heights: groundHeights() });
    this.dustWisps = this.fogSheets.meshes; this.wispClear = this.fogSheets.clear;
    // (Tumbleweeds and dust devils are Deadwater's desert; a map with hills
    // brings its own ambient life.)
    if (!this.map.terrain) for (const [x, z] of [[-4, -9], [20, 18], [-22, 12]]) this.spawnTumbleweed(x, z);
  },

  spawnTumbleweed(x, z) {
    const radius = .27 + Math.random() * .22;
    const geo = new THREE.IcosahedronGeometry(radius, 0), edges = new THREE.EdgesGeometry(geo); geo.dispose();
    const g = new THREE.Group();
    // Pale straw stays legible on both dark soil and the ochre street.
    g.add(new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: '#ead7a7', transparent: true, opacity: .78 })));
    g.position.set(x, radius, z); g.rotation.set(Math.random() * 3, Math.random() * 3, 0);
    g.userData = { radius, age: 0, life: 52 + Math.random() * 24, speed: .7 + Math.random() * .6, drift: -.2 + Math.random() * .4 };
    this.scene.add(g); this.tumbleweeds.push(g);
  },

  updateAmbient(sim, dt, elapsed) {
    const bare = this.qualityName === 'potato';
    for (const t of this.tumbleweeds) t.visible = !bare;
    if (bare) { this.fogSheets.hide(); return; }
    // How many of the big blended haze sprites this preset can afford. One is
    // enough to read as moving air; three is most of a full-screen blend.
    const wisps = this.qualityName === 'performance' ? 1 : this.qualityName === 'balanced' ? 2 : this.qualityName === 'extreme' ? 5 : 3;
    const halfHeight=Math.tan(this.camera.fov*Math.PI/360)*this.camera.position.distanceTo(this.focus);
    const halfWidth=halfHeight*this.camera.aspect;
    // (One frame object, reused: nothing allocated per frame.)
    const p = sim.player, frame = this.fogFrame ||= { focus: this.focus, player: { x: 0, z: 0, y: 0 }, aim: { x: 0, z: 0, y: 0 } };
    frame.count = wisps; frame.interior = !!sim.interior; frame.halfWidth = halfWidth; frame.halfHeight = halfHeight; frame.dt = dt; frame.elapsed = elapsed;
    frame.player.x = p.x; frame.player.z = p.z; frame.player.y = this.gy(p.x, p.z);
    frame.aim.x = p.aimPointX ?? p.x; frame.aim.z = p.aimPointZ ?? p.z; frame.aim.y = this.gy(frame.aim.x, frame.aim.z);
    this.fogSheets.update(frame);
    // Weather on its own clock: an occasional sheet of sand driven across the
    // open ground downwind, skipped indoors where there is no wind to carry it.
    this.gustClock = (this.gustClock ?? 5) - dt;
    if (this.gustClock <= 0) {
      this.gustClock = 6 + Math.random() * 7;
      if (!sim.interior) {
        const heading = .9 + (Math.random() - .5) * .7;
        const across = Math.random() * Math.PI * 2, reach = 9 + Math.random() * 11;
        this.dustTrail.gust(this.focus.x + Math.cos(across) * reach, this.focus.z + Math.sin(across) * reach,
          Math.cos(heading), Math.sin(heading), this.kickedDustColor(this.focus.x, this.focus.z));
      }
    }
    // Extreme: a dust devil now and then, crossing the open ground downwind.
    this.dustDevils ||= new DustDevils(this.fx);
    this.dustDevils.update(dt, this.qualityName === 'extreme' && !sim.interior && !this.map.terrain,
      { x: this.focus.x, z: this.focus.z, halfWidth, halfDepth: halfHeight },
      (x, z) => sim.colliders.some(b => inside({ x, z }, b, .8)), (x, z) => this.kickedDustColor(x, z));
    // Purely cosmetic overflights, hidden while a roof is between them and the
    // player. They take no part in the simulation.
    this.birds.update(dt, this.focus, this.birdView(), !!sim.interior);
    this.ambientClock -= dt;
    const cap = this.qualityName === 'performance' ? 4 : 7;
    if (this.ambientClock <= 0) {
      this.ambientClock = 4 + Math.random() * 5;
      if (this.tumbleweeds.length < cap && !this.map.terrain) {
        const width = Math.tan(this.camera.fov * Math.PI / 360) * 35 * this.camera.aspect;
        const x = this.focus.x - width - 2, z = this.focus.z + (Math.random() - .5) * 25;
        if (!sim.colliders.some(b => inside({ x, z }, b, .6))) this.spawnTumbleweed(x, z);
      }
    }
    this.tumbleweeds = this.tumbleweeds.filter(t => {
      const a = t.userData; a.age += dt;
      const x = t.position.x + dt * a.speed, z = t.position.z + dt * a.drift;
      if (sim.colliders.some(b => inside({ x, z }, b, a.radius))) a.life = Math.min(a.life, a.age + 1);
      else { t.position.x = x; t.position.z = z; }
      t.position.y = a.radius + Math.abs(Math.sin(elapsed * 2.6 + t.position.z)) * .055;
      t.rotation.z -= dt * a.speed / a.radius; t.rotation.x += dt * a.drift;
      t.children[0].material.opacity = .78 * Math.min(1, a.age, Math.max(0, a.life - a.age));
      if (a.age < a.life) return true;
      t.removeFromParent(); t.children[0].geometry.dispose(); t.children[0].material.dispose(); return false;
    });
  },
};
