import * as THREE from 'three';
import { RULES, segmentBox } from '../simulation.js';
import { isDemanding } from '../settings.js';
import { ArcBatch, LINE_POINTS, FORKS } from '../render/arc-batch.js';

// Reused across every arc of every frame rather than allocated per arc.
const SCRATCH = new THREE.Vector3();
const ARC_UP = new THREE.Vector3(0, 1, 0);
const POINTS = new Float32Array(LINE_POINTS * 3), FORK_SEGMENTS = new Float32Array(FORKS * 6);
// Hills: an arc keeps at least this far over the ground between its ends.
const ARC_CLEAR = .32;

// How much of each arc is built, per preset. Every arc now shares four draw
// calls whatever this says, so the knobs here are about vertex work and fill
// rate: Potato keeps the core line and its glow, Performance adds some forks,
// Balanced is the full arc, and Quality and Extreme put more arcs in the air,
// more stray zaps off the stream, and wider forks.
export const ARC_DETAIL = Object.freeze({
  // links: arcs struck between neighbouring floating orbs per strike, and
  // linkGap the seconds between strikes (a random span from that up to twice it).
  potato:      { scatter: 6,  forks: 0,  ribbon: false, rings: 0, strays: 0, sprayStride: 2, forkSpread: .6, links: 1, linkGap: .5 },
  performance: { scatter: 9,  forks: 6,  ribbon: false, rings: 1, strays: 1, sprayStride: 2, forkSpread: .7, links: 1, linkGap: .45 },
  balanced:    { scatter: 16, forks: 12, ribbon: true,  rings: 2, strays: 1, sprayStride: 2, forkSpread: .7, links: 1, linkGap: .35 },
  quality:     { scatter: 28, forks: 12, ribbon: true,  rings: 2, strays: 3, sprayStride: 1, forkSpread: 1.05, links: 2, linkGap: .2 },
  extreme:     { scatter: 36, forks: 16, ribbon: true,  rings: 3, strays: 5, sprayStride: 1, forkSpread: 1.15, links: 3, linkGap: .1 },
});

// One geometry each for every pulse ever fired. They used to be built fresh
// per node per pulse -- two icosahedra and two tori, six nodes a pulse -- and
// thrown away half a second later.
const PULSE_SHAPE = new THREE.IcosahedronGeometry(1, 1);
const PULSE_RINGS = { 64: new THREE.TorusGeometry(1, .025, 4, 64), 40: new THREE.TorusGeometry(1, .025, 4, 40) };

const TINTS = new Map();
const tint = hex => { let c = TINTS.get(hex); if (!c) TINTS.set(hex, c = new THREE.Color(hex)); return c; };
const BOLT_COLORS = Object.freeze({ mesh: '#d7f3ff', forks: '#75caff', glow: '#68caff', ribbon: '#effcff' });

// Short-lived geometry only: no fire, smoke, or scorch for electrical pulses.
export class ElectricEffects {
  constructor(scene) {
    this.scene = scene; this.effects = []; this.spinEffects = new Map();
    // Hills: an arc end with no height of its own sits .76 over the ground
    // there (set by the view; null: flat).
    this.ground = null;
    this.arcs = new ArcBatch(scene); this.detail = ARC_DETAIL.balanced;
    const points = Array.from({ length: 6 }, (_, i) => new THREE.Vector3(Math.cos(i * Math.PI / 3) * RULES.hexRange, .08, Math.sin(i * Math.PI / 3) * RULES.hexRange));
    this.limit = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color: '#d45c50', transparent: true, opacity: .8, depthWrite: false, toneMapped: false }));
    this.limit.visible = false; scene.add(this.limit);
  }
  boundary(orbs) {
    this.limit.visible = orbs.length > 0;
    if (!orbs.length) return;
    const g = this.ground;
    if (!g || g.flat) {this.limit.position.set(orbs[0].originX, 0, orbs[0].originZ);this.limit.rotation.y=orbs[0].age*Math.PI*2;return;}
    // Hills: the hexagon laid over the ground, a dozen points a side.
    if (!this.draped) { this.draped = new THREE.BufferGeometry(); this.draped.setAttribute('position', new THREE.BufferAttribute(new Float32Array(72 * 3), 3)); this.limit.geometry.dispose(); this.limit.geometry = this.draped; }
    const turn = -orbs[0].age * Math.PI * 2, ox = orbs[0].originX, oz = orbs[0].originZ, r = RULES.hexRange, pos = this.draped.attributes.position;
    for (let i = 0; i < 72; i++) {
      const side = Math.floor(i / 12), t = (i % 12) / 12, a0 = side * Math.PI / 3 + turn, a1 = (side + 1) * Math.PI / 3 + turn;
      const x = ox + (Math.cos(a0) + (Math.cos(a1) - Math.cos(a0)) * t) * r, z = oz + (Math.sin(a0) + (Math.sin(a1) - Math.sin(a0)) * t) * r;
      pos.setXYZ(i, x, g.heightAt(x, z) + .08, z);
    }
    pos.needsUpdate = true; this.draped.computeBoundingSphere(); this.limit.position.set(0, 0, 0); this.limit.rotation.y = 0;
  }
  setQuality(name) { this.quality = isDemanding(name); this.performance = name === 'performance' || name === 'potato'; this.detail = ARC_DETAIL[name] || ARC_DETAIL.balanced; }
  aftershock(e){
    this.aftershocks ||= new Map();
    const key=e.id;
    if(!this.aftershocks.has(key)&&this.aftershocks.size>=48)return;
    const broken=e.type==='kill';
    const old=this.aftershocks.get(key);
    this.aftershocks.set(key,{...e,age:0,clock:old?.clock||0,life:broken?.75:.5,broken});
  }
  updateAftershocks(dt,sim){
    if(!this.aftershocks)return;
    for(const [key,e] of this.aftershocks){
      e.age+=dt;e.clock-=dt;
      if(e.age>=e.life){this.aftershocks.delete(key);continue;}
      const target=!e.broken?(sim.player.id===e.id?sim.player:sim.targets.find(t=>t.id===e.id)):null;
      const x=target?.x??e.x,z=target?.z??e.z;
      if(e.clock>0)continue;e.clock=this.performance?.16:.09;
      const radius=.4;
      const fade=1-e.age/e.life;
      for(let i=0;i<(this.performance?1:2);i++){
        const angle=Math.random()*Math.PI*2,other=angle+1+Math.random()*2;
        const arc=this.bolt({x:x+Math.cos(angle)*radius,z:z+Math.sin(angle)*radius},{x:x+Math.cos(other)*radius,z:z+Math.sin(other)*radius},.07+fade*.08);
        arc.energy=.25;arc.intensity=.4+fade*.4;
      }
    }
  }
  drift(orbs,player,colliders,dt){
    this.births ||= new Map();
    const live=new Map(orbs.map(o=>[o.id,o]));
    for(const [id,arc] of this.births){
      if(!live.has(id)||arc.age>=arc.life){arc.age=arc.life;this.births.delete(id);}
    }
    for(const orb of orbs){
      if(orb.age>.22)continue;
      let arc=this.births.get(orb.id);
      if(!arc){
        arc=this.bolt({x:player.x+player.aimX*.38,z:player.z+player.aimZ*.38},orb,.23);
        arc.energy=.65;arc.intensity=.55;arc.driftIds=[orb.id];this.births.set(orb.id,arc);
      }
      arc.a={x:player.x+player.aimX*.38,z:player.z+player.aimZ*.38};arc.b=orb;
    }
    // A sparse visual connection follows the actual drifting endpoints; it exerts no force.
    for(const arc of this.effects)if(arc.driftIds&&arc.driftIds.some(id=>!live.has(id)))arc.age=arc.life;
    this.linkClock=(this.linkClock??.45)-dt;
    if(this.linkClock>0||orbs.length<2)return;
    const gap=this.detail.linkGap??.35;
    this.linkClock=gap+Math.random()*gap;
    // Neighbouring orbs arc to each other; on the richer presets a strike can
    // run on from the orb it reached to the next, a short chain of lightning.
    let a=orbs[Math.floor(Math.random()*orbs.length)];
    const used=new Set([a]);
    for(let link=0;link<(this.detail.links??1);link++){
      let b=null,nearest=2.6;
      for(const candidate of orbs){
        const distance=Math.hypot(candidate.x-a.x,candidate.z-a.z);
        if(used.has(candidate)||distance<.25||distance>=nearest)continue;
        if(colliders.some(c=>!c.playerOnly&&segmentBox(a.x,a.z,candidate.x,candidate.z,c,.03)!==null))continue;
        b=candidate;nearest=distance;
      }
      if(!b)break;
      const arc=this.bolt(a,b,.13+Math.random()*.1);arc.energy=link?.25:.65;arc.intensity=.45+Math.random()*.35;arc.driftIds=[a.id,b.id];
      this.onContact?.(a,b);
      used.add(b);a=b;
    }
  }
  charge(orbs,dt,player){
    this.barrelClock=(this.barrelClock||0)-dt;
    if(orbs.length&&player&&this.barrelClock<=0){
      this.barrelClock=.22+Math.random()*.22;
      const orb=orbs[Math.floor(Math.random()*orbs.length)];
      const arc=this.bolt({x:player.x+player.aimX*.65,z:player.z+player.aimZ*.65},orb,.12);
      arc.energy=.65;arc.intensity=1.2;
    }
    this.chargeClock=(this.chargeClock||0)+dt;
    if(!orbs.length){this.chargeClock=0;return;}
    if(this.chargeClock<(this.performance?.16:.095))return;
    this.chargeClock=0;
    for(const n of orbs){
      const count=this.performance?1:this.quality?3:2;
      for(let i=0;i<count;i++){
        const angle=n.age*13+n.index*2.3+i*2.4,reach=.35+Math.random()*.65;
        const spark=this.bolt(n,{x:n.x+Math.cos(angle)*reach,z:n.z+Math.sin(angle)*reach},.13);
        spark.intensity=1.8;spark.energy=.65;
      }
    }
  }
  // An arc is data now; ArcBatch draws every live one in four calls between
  // them. What used to be four objects and four materials per arc -- pooled,
  // and before that built fresh -- is just its endpoints, its clock and two
  // colours.
  bolt(a, b, life = .48) {
    const effect = { a, b, age: 0, life, seed: Math.random() * 100, arc: true,
      lineColor: tint(BOLT_COLORS.mesh), glowColor: tint(BOLT_COLORS.glow) };
    this.effects.push(effect); return effect;
  }
  syncSpin(spin,player,dt=0) {
    if(spin)this.lastSpinNodes=spin.nodes.map(n=>({...n}));
    if(!spin&&this.lastSpinNodes){
      this.returnHex={nodes:this.lastSpinNodes,age:0,clock:0};this.lastSpinNodes=null;
    }
    const present = new Set();
    for (const edge of spin?.edges || []) {
      present.add(edge.index);
      let effect = this.spinEffects.get(edge.index);
      if (!effect) { effect = this.bolt(edge.a, edge.b, 2); this.spinEffects.set(edge.index, effect); }
      effect.a = edge.a; effect.b = edge.b; effect.age = 0; effect.intensity = 2.8;effect.energy=1;
    }
    for (const [index, effect] of this.spinEffects) if (!present.has(index)) {
      effect.age = 0; effect.life = .12; this.spinEffects.delete(index);
    }
    // The damaging spin has finished. This collapsing afterimage is entirely cosmetic.
    const returning=this.returnHex;
    if(returning&&player){
      returning.age+=dt;returning.clock-=dt;
      const t=Math.min(1,returning.age/.6),pull=t*t*(3-2*t),angle=t*Math.PI*1.5;
      const c=Math.cos(angle),s=Math.sin(angle);
      const nodes=returning.nodes.map(n=>{
        const dx=n.x-n.originX,dz=n.z-n.originZ;
        return {index:n.index,x:(n.originX+(dx*c-dz*s))*(1-pull)+player.x*pull,z:(n.originZ+(dx*s+dz*c))*(1-pull)+player.z*pull};
      });
      if(returning.clock<=0&&t<1){
        returning.clock=this.performance?.09:.045;
        for(const n of nodes){
          const next=nodes.find(b=>b.index===(n.index+1)%6);
          if(next&&t<.82){const arc=this.bolt(n,next,.1);arc.intensity=1.5;arc.energy=.65;}
          if(n.index===Math.floor(t*12)%6){
            const returningArc=this.bolt(n,{x:player.x+player.aimX*.65,z:player.z+player.aimZ*.65},.14);
            returningArc.energy=.65;returningArc.intensity=1.15;
          }
          const direction=Math.random()*Math.PI*2,length=(.4+Math.random()*1.7)*(1-t*.5);
          const stray=this.bolt(n,{x:n.x+Math.cos(direction)*length,z:n.z+Math.sin(direction)*length},.16+Math.random()*.16);
          stray.intensity=.7+Math.random()*.6;stray.energy=.25;
        }
      }
      if(t>=1)this.returnHex=null;
    }
  }
  // Pulses are pooled: a fresh material per part per pulse made every hex
  // pulse build (and, once the last one died, free and recompile) its
  // programs, the hitch on the second X. A pooled part keeps its material,
  // already patched for interior concealment, so a pulse costs nothing new.
  takePulse() {
    return this.pulsePool?.pop() || this.makePulse();
  }
  makePulse() {
    const basic = o => new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending, ...o });
    return {
      mesh: new THREE.Mesh(PULSE_SHAPE, basic({ color: '#d4f4ff', wireframe: true })),
      core: new THREE.Mesh(PULSE_SHAPE, basic({ color: '#e9fbff', opacity: .8 })),
      rings: [0, 1].map(i => new THREE.Mesh(PULSE_RINGS[40], basic({ color: i ? '#72ceff' : '#eaffff' }))),
    };
  }
  // Fill the pool before play (a hex pulse takes one part per node, six, and
  // a zap one more) and hand back the meshes, for the renderer's warm-up draw.
  prewarm(count = 8) {
    const pool = this.pulsePool ||= [];
    while (pool.length < count) pool.push(this.makePulse());
    return pool.flatMap(p => [p.mesh, p.core, ...p.rings]);
  }
  pulse(n, radius, life = .55, scatter = false) {
    const part = this.takePulse(), { mesh, core } = part;
    mesh.position.set(n.x, .72 + (this.ground && !this.ground.flat ? (this.floorAt || this.ground.heightAt.bind(this.ground))(n.x, n.z) : 0), n.z); mesh.scale.setScalar(.12); this.scene.add(mesh);
    core.position.copy(mesh.position); core.scale.setScalar(.06); this.scene.add(core);
    const rings = part.rings.slice(0, this.detail.rings).map((ring, i) => {
      ring.geometry = PULSE_RINGS[this.quality ? 64 : 40]; ring.scale.setScalar(radius * .15);
      ring.position.copy(mesh.position); ring.rotation.set(Math.PI / 2 + i * .5, 0, 0); this.scene.add(ring); return ring;
    });
    this.effects.push({ mesh, core, rings, part, radius, age: 0, life });
    const count = this.detail.scatter;
    for (let i = 0; i < count; i++) {
      const angle = i / count * Math.PI * 2 + (Math.random()-.5) * .7;
      const reach=radius*(scatter?(i%3===0?1.7+Math.random()*1.1:.7+Math.random()*.65):1);
      const origin={x:n.x,z:n.z},dx=Math.cos(angle)*reach,dz=Math.sin(angle)*reach;
      const arc = this.bolt(origin, { x:n.x+dx,z:n.z+dz }, life * (.55 + Math.random() * .45));
      arc.intensity = scatter?1.2+Math.random()*1.1:1.5;
      if(scatter){
        arc.outward={x:n.x,z:n.z,dx,dz};arc.energy=i%3===0?.65:.25;
        arc.glowColor=tint('#6ebfff');arc.lineColor=tint('#edfbff');
      }
    }
  }
  event(e, colliders = []) {
    if (e.type === 'convergence') this.pulse(e, e.radius, .24);
    if (e.type === 'sprayArc') for (const [i, path] of e.paths.entries()) {
      if (i % this.detail.sprayStride) continue;
      const arc = this.bolt(path.a, path.b, e.firing ? .085 : .055);
      arc.energy = path.energy;
      if (path.energy === 1) { arc.glowColor = tint('#d8f5ff'); arc.lineColor = tint('#ffffff'); }
    }
    // Render-only strays: never enter the simulation, deal damage, or ignite crops.
    if (e.type === 'sprayArc' && e.firing && this.detail.strays && Math.random() < (this.quality ? .55 : .38)) {
      const center = e.paths[Math.floor(e.paths.length / 2)];
      if (center && Math.hypot(center.b.x - center.a.x, center.b.z - center.a.z) > .1) {
        const angle = Math.atan2(center.b.z - center.a.z, center.b.x - center.a.x);
        const count = 1 + Math.floor(Math.random() * this.detail.strays);
        for (let i = 0; i < count; i++) {
          const direction = angle + (Math.random() < .5 ? -1 : 1) * (RULES.sprayOuterAngle + .03 + Math.random() * .13);
          const distance = RULES.sprayRange * (1.15 + Math.random() * .25), a = center.a;
          const b = { x: a.x + Math.cos(direction) * distance, z: a.z + Math.sin(direction) * distance };
          let reach = 1;
          for (const box of colliders) if (!box.playerOnly) {
            const hit = segmentBox(a.x, a.z, b.x, b.z, box);
            if (hit !== null) reach = Math.min(reach, hit);
          }
          if (reach * distance < .1) continue;
          const stray = this.bolt(a, { x: a.x + (b.x - a.x) * reach, z: a.z + (b.z - a.z) * reach }, .055 + Math.random() * .055);
          stray.energy = .25; stray.intensity = 1.25; stray.lineColor = tint('#b8eaff');
        }
      }
    }
    if (e.type === 'hexZap') { const arc = this.bolt(e.a, e.b, .3); arc.intensity = 2.3; this.pulse(e.b, .28, .18); }
    if (e.type === 'hexFizzle') this.pulse(e, .55, .3);
    if (e.type === 'hexPulse') {
      for (const strand of e.strands) this.bolt(strand.a, strand.b, .48);
      for (const node of e.nodes) this.pulse(node, node.power?.radius ?? e.radius,.55,true);
    }
  }
  update(dt) {
    const arcs = this.arcs, detail = this.detail, forkColor = tint(BOLT_COLORS.forks), ribbonColor = tint(BOLT_COLORS.ribbon);
    arcs.begin();
    for (const effect of this.effects) {
      // Draw first, age after: a spray arc lives 85 ms, so on a slow frame the
      // old age-then-draw order faded it to nothing before it was ever seen.
      const t = Math.min(1, effect.age / effect.life);
      effect.age += dt;
      effect.motion = (effect.motion || 0) + dt;
      if (effect.a) {
        if(effect.outward){
          const o=effect.outward,tip=1-(1-Math.min(1,effect.age/.1))**3,tail=Math.max(0,t-.2)*.55;
          effect.a={x:o.x+o.dx*tail,z:o.z+o.dz*tail};effect.b={x:o.x+o.dx*tip,z:o.z+o.dz*tip};
        }
        const { a, b } = effect, dx = b.x - a.x, dz = b.z - a.z, length = Math.hypot(dx, dz) || 1;
        const lift = this.ground && !this.ground.flat ? this.ground : null;
        const floor = lift && (this.floorAt || ((x, z) => lift.heightAt(x, z)));
        const ay = a.y ?? (lift ? .76 + floor(a.x, a.z) : .76), by = b.y ?? (lift ? .76 + floor(b.x, b.z) : .76), intensity = effect.intensity || 1;
        // (Hills: over a rise between its ends the arc bends up over the
        // ground instead of cutting through it, owner 2026-09-26.)
        let bent = false;
        for (let i = 0; i < LINE_POINTS; i++) {
          const f = i / (LINE_POINTS - 1), jitter = Math.sin(i * 41 + effect.seed + Math.floor(effect.motion * 42) * 5) * Math.sin(Math.PI * f) * .23 * intensity;
          const x = a.x + dx * f - dz / length * jitter, z = a.z + dz * f + dx / length * jitter;
          let y = ay + (by - ay) * f + jitter * .4;
          if (lift && i && i < LINE_POINTS - 1) { const floor = lift.drawnHeightAt(x, z) + ARC_CLEAR + jitter * .4; if (y < floor) { y = floor; bent = true; } }
          POINTS[i * 3] = x; POINTS[i * 3 + 1] = y; POINTS[i * 3 + 2] = z;
        }
        arcs.line(POINTS, effect.lineColor, (1 - t) ** .7);
        if (detail.ribbon) {
          const thickness = (effect.energy === .25 ? .009 : effect.energy === 1 ? .045 : .023) * intensity;
          arcs.ribbon(POINTS, -dz / length * thickness, dx / length * thickness, ribbonColor,
            (1 - t) ** .6 * (.8 + .2 * Math.sin(effect.motion * 110 + effect.seed)));
        }
        const width = (this.quality ? .1 : .075) * intensity * (effect.energy === undefined ? 1 : effect.energy === 1 ? 2.8 : .7) * (.8 + .2 * Math.sin(effect.motion * 93 + effect.seed));
        const glowAlpha = (1 - t) * (effect.energy === 1 ? .8 : effect.energy === .25 ? .18 : .5);
        if (!bent) arcs.glow(a.x, ay, a.z, b.x, by, b.z, width, effect.glowColor, glowAlpha, ARC_UP, SCRATCH);
        // Bent over the ground: its glow follows it, in four pieces.
        else for (let j = 0; j < 4; j++) {
          const p = j * 6 * 3, q = Math.min(LINE_POINTS - 1, (j + 1) * 6) * 3;
          arcs.glow(POINTS[p], POINTS[p + 1], POINTS[p + 2], POINTS[q], POINTS[q + 1], POINTS[q + 2], width, effect.glowColor, glowAlpha, ARC_UP, SCRATCH);
        }
        if (detail.forks) {
          for (let j = 0; j < FORKS; j++) {
            const o = j * 6;
            if (j >= detail.forks) { FORK_SEGMENTS.fill(0, o, o + 6); continue; }
            const i = 1 + j * 2, sign = j % 2 ? 1 : -1, spread = (.15 + Math.abs(Math.sin(effect.seed + j * 7 + effect.motion * 28)) * detail.forkSpread) * intensity;
            const x = POINTS[i * 3], y = POINTS[i * 3 + 1], z = POINTS[i * 3 + 2];
            FORK_SEGMENTS[o] = x; FORK_SEGMENTS[o + 1] = y; FORK_SEGMENTS[o + 2] = z;
            FORK_SEGMENTS[o + 3] = x - dz / length * spread * sign; FORK_SEGMENTS[o + 4] = y + spread * .4; FORK_SEGMENTS[o + 5] = z + dx / length * spread * sign;
          }
          arcs.fork(FORK_SEGMENTS, forkColor, (1 - t) * .95);
        }
      } else {
        effect.mesh.material.opacity = (1 - t) ** .7;
        const pulseBeat=1+Math.sin(effect.motion*55)*.09;
        effect.mesh.scale.setScalar((.12 + effect.radius * Math.sin(t * Math.PI / 2))*pulseBeat);
        effect.mesh.rotation.set(t * 3, t * 5, t * 2);
        for (const [i, ring] of (effect.rings || []).entries()) {
          ring.scale.setScalar(effect.radius * (.15 + t * (1.15 + i * .15)));
          ring.rotation.z = t * 5 * (i ? -1 : 1);
          ring.material.opacity = (1 - t) ** .8*(.7+.3*Math.sin(effect.motion*70+i*2)**2);
        }
        effect.core?.scale.setScalar(effect.radius * (.15 + Math.sin(Math.min(1, t * 3) * Math.PI) * .3));
        if (effect.core) effect.core.material.opacity = Math.max(0, 1 - t * 1.6) * (.6+.4*Math.sin(effect.motion*65)**2);
      }
      if (effect.age >= effect.life) this.dispose(effect);
    }
    // Drop the finished in place: no new array every frame.
    let kept = 0; for (const e of this.effects) if (e.age < e.life) this.effects[kept++] = e; this.effects.length = kept;
    arcs.end();
  }
  dispose(e) {
    // Arcs own nothing to free. A pulse goes back to the pool whole; its
    // geometry is shared and its materials are kept for the next one.
    if (e.arc || !e.part) return;
    for (const mesh of [e.mesh, e.core, ...e.part.rings]) mesh.removeFromParent();
    (this.pulsePool ||= []).push(e.part);
  }
  // Every live pulse part, for the renderer's interior concealment pass.
  pulseParts() { const parts = this.partList ||= []; parts.length = 0; for (const e of this.effects) if (!e.arc) parts.push(e.mesh, e.core, ...e.rings); return parts; }
  clear() { this.effects.forEach(e => this.dispose(e)); this.effects = []; this.spinEffects.clear();this.aftershocks?.clear(); this.lastSpinNodes=null;this.returnHex=null;this.births?.clear();this.linkClock=.45;this.chargeClock=0;this.limit.visible = false; }
}

