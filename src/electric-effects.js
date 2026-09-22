import * as THREE from 'three';
import { RULES, segmentBox } from './simulation.js';
import { isDemanding } from './settings.js';

// Reused across every arc of every frame rather than allocated per arc.
const SCRATCH = new THREE.Vector3();
const ARC_UP = new THREE.Vector3(0, 1, 0);

// Short-lived geometry only: no fire, smoke, or scorch for electrical pulses.
export class ElectricEffects {
  constructor(scene) {
    this.scene = scene; this.effects = []; this.spinEffects = new Map();
    const points = Array.from({ length: 6 }, (_, i) => new THREE.Vector3(Math.cos(i * Math.PI / 3) * RULES.hexRange, .08, Math.sin(i * Math.PI / 3) * RULES.hexRange));
    this.limit = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color: '#d45c50', transparent: true, opacity: .8, depthWrite: false, toneMapped: false }));
    this.limit.visible = false; scene.add(this.limit);
  }
  boundary(orbs) {
    this.limit.visible = orbs.length > 0;
    if (orbs.length) {this.limit.position.set(orbs[0].originX, 0, orbs[0].originZ);this.limit.rotation.y=orbs[0].age*Math.PI*2;}
  }
  setQuality(name) { this.quality = isDemanding(name); this.performance = name === 'performance' || name === 'potato'; }
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
    this.linkClock=.35+Math.random()*.65;
    const a=orbs[Math.floor(Math.random()*orbs.length)];let b=null,nearest=2.6;
    for(const candidate of orbs){
      const distance=Math.hypot(candidate.x-a.x,candidate.z-a.z);
      if(candidate===a||distance<.25||distance>=nearest)continue;
      if(colliders.some(c=>!c.playerOnly&&segmentBox(a.x,a.z,candidate.x,candidate.z,c,.03)!==null))continue;
      b=candidate;nearest=distance;
    }
    if(b){const arc=this.bolt(a,b,.13+Math.random()*.1);arc.energy=.25;arc.intensity=.45;arc.driftIds=[a.id,b.id];}
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
  // Every arc is four meshes with fixed-size buffers, and a hex pulse puts well
  // over a hundred arcs in the air in a single frame. Built fresh that was
  // ~400 geometry uploads plus ~400 materials and the matching dispose churn,
  // all inside one frame — the largest spike in the game. The sets are pooled
  // instead: identical shapes, and the only per-arc state is opacity, which is
  // written every frame anyway.
  #buildBolt() {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(25 * 3), 3));
    const mesh = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: '#d7f3ff', transparent: true, depthWrite: false, toneMapped: false }));
    mesh.frustumCulled = false;
    const forkGeometry = new THREE.BufferGeometry();
    forkGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12 * 2 * 3), 3));
    const forks = new THREE.LineSegments(forkGeometry, new THREE.LineBasicMaterial({ color: '#75caff', transparent: true, opacity: .6, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending }));
    forks.frustumCulled = false;
    const glow = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 6), new THREE.MeshBasicMaterial({ color: '#68caff', transparent: true, opacity: .28, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    // A camera-visible white ribbon follows the actual jagged arc, inside its blue glow.
    const ribbonGeometry = new THREE.BufferGeometry();
    ribbonGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(24 * 6 * 3), 3));
    const ribbon = new THREE.Mesh(ribbonGeometry, new THREE.MeshBasicMaterial({ color: '#effcff', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }));
    ribbon.frustumCulled = false;
    return { mesh, forks, glow, ribbon };
  }

  bolt(a, b, life = .48) {
    this.boltPool ||= [];
    const parts = this.boltPool.pop() || this.#buildBolt();
    // Draw ranges are rewritten every frame, but a reused set must not show a
    // previous arc's tail for the frame before its first update.
    parts.mesh.geometry.setDrawRange(0, 0);
    parts.forks.geometry.setDrawRange(0, 0);
    parts.ribbon.geometry.setDrawRange(0, 0);
    for (const part of [parts.mesh, parts.forks, parts.glow, parts.ribbon]) { part.visible = true; this.scene.add(part); }
    const effect = { ...parts, a, b, age: 0, life, seed: Math.random() * 100, pooled: true };
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
  pulse(n, radius, life = .55, scatter = false) {
    const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshBasicMaterial({ color: '#d4f4ff', wireframe: true, transparent: true, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending }));
    mesh.position.set(n.x, .72, n.z); this.scene.add(mesh);
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshBasicMaterial({ color: '#e9fbff', transparent: true, opacity: .8, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    core.position.copy(mesh.position); core.scale.setScalar(.06); this.scene.add(core);
    const rings = [0, 1].map(i => {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1, .025, 4, this.quality ? 64 : 40), new THREE.MeshBasicMaterial({ color: i ? '#72ceff' : '#eaffff', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
      ring.position.copy(mesh.position); ring.rotation.x = Math.PI / 2 + i * .5; this.scene.add(ring); return ring;
    });
    this.effects.push({ mesh, core, rings, radius, age: 0, life });
    const count = this.quality ? 22 : this.performance ? 10 : 16;
    for (let i = 0; i < count; i++) {
      const angle = i / count * Math.PI * 2 + (Math.random()-.5) * .7;
      const reach=radius*(scatter?(i%3===0?1.7+Math.random()*1.1:.7+Math.random()*.65):1);
      const origin={x:n.x,z:n.z},dx=Math.cos(angle)*reach,dz=Math.sin(angle)*reach;
      const arc = this.bolt(origin, { x:n.x+dx,z:n.z+dz }, life * (.55 + Math.random() * .45));
      arc.intensity = scatter?1.2+Math.random()*1.1:1.5;
      if(scatter){
        arc.outward={x:n.x,z:n.z,dx,dz};arc.energy=i%3===0?.65:.25;
        arc.glow.material.color.set('#6ebfff');arc.mesh.material.color.set('#edfbff');
      }
    }
  }
  event(e, colliders = []) {
    if (e.type === 'convergence') this.pulse(e, e.radius, .24);
    if (e.type === 'sprayArc') for (const [i, path] of e.paths.entries()) {
      if (!this.quality && i % 2) continue;
      const arc = this.bolt(path.a, path.b, e.firing ? .085 : .055);
      arc.energy = path.energy;
      if (path.energy === 1) { arc.glow.material.color.set('#d8f5ff'); arc.mesh.material.color.set('#ffffff'); }
    }
    // Render-only strays: never enter the simulation, deal damage, or ignite crops.
    if (e.type === 'sprayArc' && e.firing && Math.random() < .38) {
      const center = e.paths[Math.floor(e.paths.length / 2)];
      if (center && Math.hypot(center.b.x - center.a.x, center.b.z - center.a.z) > .1) {
        const angle = Math.atan2(center.b.z - center.a.z, center.b.x - center.a.x);
        const count = this.quality && Math.random() < .4 ? 2 : 1;
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
          stray.energy = .25; stray.intensity = 1.25; stray.mesh.material.color.set('#b8eaff');
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
    for (const effect of this.effects) {
      effect.age += dt;
      effect.motion = (effect.motion || 0) + dt;
      const t = Math.min(1, effect.age / effect.life);

      effect.mesh.material.opacity = (1 - t) ** .7;
      if (effect.a) {
        if(effect.outward){
          const o=effect.outward,tip=1-(1-Math.min(1,effect.age/.1))**3,tail=Math.max(0,t-.2)*.55;
          effect.a={x:o.x+o.dx*tail,z:o.z+o.dz*tail};effect.b={x:o.x+o.dx*tip,z:o.z+o.dz*tip};
        }
        const { a, b, mesh } = effect, dx = b.x - a.x, dz = b.z - a.z, length = Math.hypot(dx, dz) || 1;
        const points = mesh.geometry.attributes.position;
        for (let i = 0; i < 25; i++) {
          const f = i / 24, jitter = Math.sin(i * 41 + effect.seed + Math.floor(effect.motion * 42) * 5) * Math.sin(Math.PI * f) * .23 * (effect.intensity || 1);
          points.setXYZ(i, a.x + dx * f - dz / length * jitter, (a.y ?? .76) + ((b.y ?? .76)-(a.y ?? .76))*f + jitter * .4, a.z + dz * f + dx / length * jitter);
        }
        points.needsUpdate = true;
        const ribbon = effect.ribbon.geometry.attributes.position;
        const thickness = (effect.energy === .25 ? .009 : effect.energy === 1 ? .045 : .023) * (effect.intensity || 1);
        const ox = -dz / length * thickness, oz = dx / length * thickness;
        for (let i = 0; i < 24; i++) {
          for (const [v, k, side] of [[0,i,-1],[1,i,1],[2,i+1,1],[3,i,-1],[4,i+1,1],[5,i+1,-1]])
            ribbon.setXYZ(i * 6 + v, points.getX(k) + ox * side, points.getY(k), points.getZ(k) + oz * side);
        }
        ribbon.needsUpdate = true;
        effect.ribbon.material.opacity = (1 - t) ** .6 * (.8 + .2 * Math.sin(effect.motion * 110 + effect.seed));
        const dy=(b.y ?? .76)-(a.y ?? .76);
        // Scratch, not fresh: this runs for every live arc every frame, and a
        // hex pulse puts well over a hundred arcs in the air at once.
        SCRATCH.set(dx, dy, dz).normalize();
        effect.glow.position.set((a.x + b.x) / 2, ((a.y ?? .76)+(b.y ?? .76))/2, (a.z + b.z) / 2);
        effect.glow.quaternion.setFromUnitVectors(ARC_UP, SCRATCH);
        const width = (this.quality ? .1 : .075) * (effect.intensity || 1) * (effect.energy === undefined ? 1 : effect.energy === 1 ? 2.8 : .7) * (.8 + .2 * Math.sin(effect.motion * 93 + effect.seed));
        effect.glow.scale.set(width, Math.hypot(dx, dy, dz), width);
        effect.glow.material.opacity = (1 - t) * (effect.energy === 1 ? .8 : effect.energy === .25 ? .18 : .5);
        if (effect.forks) {
          const forks = effect.forks.geometry.attributes.position;
          for (let j = 0; j < 12; j++) {
            const i = 1 + j * 2, sign = j % 2 ? 1 : -1, spread = (.15 + Math.abs(Math.sin(effect.seed + j * 7 + effect.motion * 28)) * (this.quality ? .95 : .7)) * (effect.intensity || 1);
            forks.setXYZ(j * 2, points.getX(i), points.getY(i), points.getZ(i));
            forks.setXYZ(j * 2 + 1, points.getX(i) - dz / length * spread * sign, points.getY(i) + spread * .4, points.getZ(i) + dx / length * spread * sign);
          }
          forks.needsUpdate = true; effect.forks.material.opacity = (1 - t) * .95;
        }
      } else {
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
      if (t >= 1) this.dispose(effect);
    }
    this.effects = this.effects.filter(e => e.age < e.life);
  }
  dispose(e) {
    // A pooled arc is detached and handed back; anything else (convergence
    // cores, rings) is genuinely one-off and is destroyed.
    if (e.pooled && !e.core && !e.rings) {
      for (const part of [e.mesh, e.forks, e.glow, e.ribbon]) part.removeFromParent();
      this.boltPool ||= [];
      // Bounded so a stress test cannot leave a thousand sets resident.
      if (this.boltPool.length < 192) { this.boltPool.push({ mesh: e.mesh, forks: e.forks, glow: e.glow, ribbon: e.ribbon }); return; }
    }
    for (const mesh of [e.mesh, e.forks, e.glow, e.ribbon, e.core, ...(e.rings || [])].filter(Boolean)) { mesh.removeFromParent(); mesh.geometry.dispose(); mesh.material.dispose(); }
  }
  // Only on teardown: the pool itself holds GPU buffers.
  disposePool() {
    for (const parts of this.boltPool || []) for (const part of [parts.mesh, parts.forks, parts.glow, parts.ribbon]) { part.geometry.dispose(); part.material.dispose(); }
    this.boltPool = [];
  }
  clear() { this.effects.forEach(e => this.dispose(e)); this.effects = []; this.spinEffects.clear();this.aftershocks?.clear(); this.lastSpinNodes=null;this.returnHex=null;this.births?.clear();this.linkClock=.45;this.chargeClock=0;this.limit.visible = false; }
}

