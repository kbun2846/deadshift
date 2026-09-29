// The plain figure as a rigged body (v0.999a, owner: "make proportions realistic
// and simple, but ... cartoony ... the limbs when using each weapon and each
// animation should be ... normal and real and satisfying. the player should
// have a walking animation, dashing animation and animations for everything ...
// not too crazy, just in the direction player is facing").
//
// The cowboy (world-build.js makePlayer) is still the default skin; this body
// is the developer menu's White and Blue skins (player-skin.js). It is built
// for the figure: no hat over the limbs, so every limb is a real limb.
//
// Everything is placed each frame in the body group's space (body space:
// y up, facing -z; the player's yaw is the body's parent's): a pelvis, a
// torso that leans and twists, a neck and head, two legs (two-bone IK to feet
// that walk) and two arms (two-bone IK to hands that hold the weapon, or swing
// free). Limb segments have fixed lengths, so nothing ever stretches; a hand
// out of reach turns the chest and brings the shoulder forward first.
//
// Motion:
//  - walk: a stride in the facing direction whatever the direction of travel
//    (as asked), its length and rate from the speed; hips bob and turn with
//    the stride, the chest counters it, free arms swing against the legs.
//  - idle: slow breathing, a slight sway.
//  - dash: a crouched lunge toward the dash, leaning into it, then a short
//    settle on landing.
//  - crouch (the Sightline stance, Ichor's dip): the weapon views squash the
//    body's height; here that squash becomes bent knees instead.
//  - weapons: the hand goals come from RiflePose (weapons/rifle-pose.js: the
//    grips on each weapon model, reloads, throws, sword swings); Static and
//    Omen: the gun hand on the grip, the other free.
import * as THREE from 'three';

export const RIG = Object.freeze({
  // About four heads tall (1.24 m): a slightly big head, legs about 42% of
  // the height, arms reaching mid-thigh (review, v0.999a).
  pelvisY: .53,
  hip: { x: .09, y: -.035 },           // hip joints, pelvis space
  thigh: .245, shin: .235, ankle: .035,// leg bones; ankle height over the sole
  shoulder: { x: .185, y: .32 },       // shoulder joints, torso space (torso origin = pelvis)
  upperArm: .25, forearm: .23,
  neck: .4, head: { y: .56, r: .145 }, // head centre, torso space
  thickness: { thigh: .07, shin: .056, upper: .053, fore: .046, hand: .048, foot: .05 },
});
const STEP = { base: .45, perSpeed: .07, max: 1.15, lift: .16, width: .09, stance: .32 };
const UP = new THREE.Vector3(0, 1, 0);
const smooth = t => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));

// Two-bone IK: from joint `a` toward `target`, bones `l1`, `l2`, the bend
// toward `pole`. Writes `mid` and `end` (end = target when reachable).
const _ax = new THREE.Vector3(), _pl = new THREE.Vector3();
export function solveTwoBone(a, target, pole, l1, l2, mid, end) {
  _ax.subVectors(target, a); let d = _ax.length();
  const reach = l1 + l2 - 1e-4, near = Math.abs(l1 - l2) + 1e-4;
  if (d < 1e-6) { _ax.set(0, -1, 0); d = near; }
  _ax.divideScalar(d); d = Math.max(near, Math.min(reach, d));
  end.copy(a).addScaledVector(_ax, d);
  const along = (l1 * l1 - l2 * l2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, l1 * l1 - along * along));
  _pl.subVectors(pole, a); _pl.addScaledVector(_ax, -_pl.dot(_ax));
  if (_pl.lengthSq() < 1e-8) _pl.set(0, 0, 1).addScaledVector(_ax, -_ax.z);
  _pl.normalize();
  mid.copy(a).addScaledVector(_ax, along).addScaledVector(_pl, h);
  return end;
}

// A capsule from y 0 to y `length` (so a limb is placed at its joint and turned
// toward the next; its length never changes).
function limb(radius, length, radial) {
  const g = new THREE.CapsuleGeometry(radius, Math.max(.001, length - radius * 2), 4, radial);
  g.translate(0, length / 2, 0); return g;
}
function torsoGeometry(radial) {
  // Pelvis to the base of the neck, a soft wedge: narrow waist, broad
  // shoulders, flatter front to back. Torso space: y 0 = pelvis centre.
  const profile = [[0, -.07], [.13, -.065], [.155, -.02], [.15, .06], [.145, .13], [.165, .21], [.19, .28], [.2, .33], [.185, .375], [.13, .41], [.07, .43], [0, .435]]
    .map(([r, y]) => new THREE.Vector2(r, y));
  const g = new THREE.LatheGeometry(profile, radial); g.scale(1, .92, .7); g.computeVertexNormals(); return g;
}

export class FigureRig {
  constructor(view, body, material) {
    const fine = view.initialQuality === 'extreme', radial = fine ? 16 : 10, R = RIG, T = R.thickness;
    this.view = view; this.body = body; this.material = material;
    const root = this.root = new THREE.Group(); root.name = 'figure-rig'; root.userData.skin = true; body.add(root);
    const mesh = (geometry, tag, limbTag) => { const m = new THREE.Mesh(geometry, material); m.castShadow = m.receiveShadow = true; if (tag) m.userData.deathPart = tag; if (limbTag) m.userData.limb = limbTag; root.add(m); return m; };
    this.torso = mesh(torsoGeometry(fine ? 20 : 12));
    this.neck = mesh(limb(.05, .1, radial), 'head');
    this.head = mesh(new THREE.SphereGeometry(R.head.r, fine ? 22 : 14, fine ? 16 : 10), 'head'); this.head.scale.set(1, 1.05, 1);
    this.legs = [1, -1].map(side => ({
      side, thigh: mesh(limb(T.thigh, R.thigh, radial), 'leg'), shin: mesh(limb(T.shin, R.shin, radial), 'leg'),
      foot: mesh(new THREE.SphereGeometry(T.foot, radial, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, .75, 1.75), 'leg'),
      hip: new THREE.Vector3(), knee: new THREE.Vector3(), ankle: new THREE.Vector3(), goal: new THREE.Vector3(), pole: new THREE.Vector3(), lift: 0,
    }));
    this.arms = [1, -1].map(side => ({
      side, upper: mesh(limb(T.upper, R.upperArm, radial), null, 'arm' + side), fore: mesh(limb(T.fore, R.forearm, radial), null, 'arm' + side),
      hand: mesh(new THREE.SphereGeometry(T.hand, radial, 8).scale(.9, .7, 1.2), null, 'arm' + side),
      shoulder: new THREE.Vector3(), elbow: new THREE.Vector3(), wrist: new THREE.Vector3(), goal: new THREE.Vector3(), pole: new THREE.Vector3(),
      swing: 0, held: false,
    }));
    // Motion state.
    this.phase = 0; this.walk = 0; this.twist = 0; this.lean = 0; this.crouch = 0; this.dash = 0; this.settle = 0; this.time = 0;
    this.dashDir = new THREE.Vector2(); this.wasDashing = false; this.goals = null; this.goalFresh = false;
    this.pelvisQ = new THREE.Quaternion(); this.torsoQ = new THREE.Quaternion(); this.pelvis = new THREE.Vector3();
    this.m = new THREE.Matrix4(); this.e = new THREE.Euler(0, 0, 0, 'YXZ'); this.v = new THREE.Vector3(); this.w = new THREE.Vector3();
  }

  // RiflePose hands its hand goals and elbow hints here each frame it runs.
  // `free`: [right, left] true where that hand is not holding anything (the
  // sheathed Sheath's right hand): the rig's own arm swing takes it. `keepPoles`:
  // use the given elbow hints (sword swings) instead of the rig's own.
  setGoals(right, rightPole, left, leftPole, free = null, keepPoles = null, throwing = 0) {
    const g = this.goals ||= { r: new THREE.Vector3(), rp: new THREE.Vector3(), l: new THREE.Vector3(), lp: new THREE.Vector3(), free: [false, false], keepPoles: [false, false] };
    g.r.copy(right); g.rp.copy(rightPole); g.l.copy(left); g.lp.copy(leftPole); g.free[0] = !!free?.[0]; g.free[1] = !!free?.[1];
    g.keepPoles[0] = !!keepPoles?.[0]; g.keepPoles[1] = !!keepPoles?.[1]; this.throwing = throwing; this.goalFresh = true;
  }

  place(m, from, to) { m.position.copy(from); this.v.subVectors(to, from); const l = this.v.length(); if (l > 1e-6) m.quaternion.setFromUnitVectors(UP, this.v.divideScalar(l)); }

  // `p`: the player (sim), `yaw` the body's facing (radians, as the player group), `gun` the gun group.
  update(sim, dt, yaw, gun) {
    this.time += dt;
    const p = sim.player, R = RIG, body = this.body, reach = R.upperArm + R.forearm, legReach = R.thigh + R.shin;
    // The weapon views squash the body for a crouch (Sightline's stance,
    // Ichor's dip); here that is bent knees, the body kept its height. The
    // views may also lean, lower or turn the body (and the weapon with it):
    // the feet stay on the ground under all that (they are placed in the
    // player's space and brought into the body's).
    // (The body keeps its squash, so the weapon lowers with it as ever; the
    // rig's own root takes it back out, and the figure bends its knees
    // instead. `sy` turns the body's squashed heights into the rig's.)
    const sy = Math.max(.3, body.scale.y), squash = Math.max(0, Math.min(1, (1 - sy) / .27));
    this.root.scale.set(1 / body.scale.x, 1 / sy, 1 / body.scale.z);
    this.crouch = damp(this.crouch, squash, 20, dt);
    // (Less what the view already lowered the body by: Sheath and Ichor lower it and squash it.)
    const lowered = Math.max(0, -body.position.y);
    this.squashDrop = damp(this.squashDrop || 0, Math.max(0, (1 - sy) * .8 - lowered), 20, dt);
    const kneel = this.crouch * Math.max(0, 1 - lowered / ((1 - sy) * .8 + 1e-3));
    body.updateMatrix(); this.root.updateMatrix();
    const toBody = this.toBody ||= new THREE.Matrix4(); toBody.multiplyMatrices(body.matrix, this.root.matrix).invert();
    const toBodyQ = this.toBodyQ ||= new THREE.Quaternion(); toBodyQ.copy(body.quaternion).invert();
    // Speed along the ground, and the stride (a run at full speed).
    const speed = Math.hypot(p.vx, p.vz), dashing = p.dodgeRemaining > 0;
    this.walk = damp(this.walk, dashing ? this.walk : smooth(speed / 3.2), 10, dt);
    const stepLen = Math.min(STEP.max, STEP.base + STEP.perSpeed * speed);
    if (!dashing) this.phase += dt * speed / stepLen * Math.PI;
    if (dashing) {
      const c = Math.cos(-yaw), s = Math.sin(-yaw), dx = p.dodgeX || 0, dz = p.dodgeZ || 0;
      this.dashDir.set(dx * c + dz * s, -dx * s + dz * c);
    }
    this.dash = damp(this.dash, dashing ? 1 : 0, dashing ? 40 : 10, dt);
    if (this.wasDashing && !dashing) this.settle = 1;
    this.wasDashing = dashing; this.settle = Math.max(0, this.settle - dt / .22);
    const land = Math.sin(Math.PI * this.settle) * .5, dash = this.dash;
    const w = this.walk * (1 - dash), ph = this.phase, sp = Math.sin(ph), cp = Math.cos(ph);
    // Pelvis: bob with the stride (a little flight), lower when running, crouching, dashing, landing.
    const bob = (Math.abs(cp) * .05 - .025) * w + Math.sin(this.time * 2.1) * .004 * (1 - w);
    const drop = .06 * w + this.squashDrop + dash * .13 + land * .07;
    const ddx = this.dashDir.x * dash, ddz = this.dashDir.y * dash;
    // Idle: the weight shifts slowly from foot to foot.
    const shift = Math.sin(this.time * .8) * .012 * (1 - w) * (1 - dash);
    // (Never lower than about 0.2 m at the hips, whatever lowers it.)
    this.pelvis.set(ddx * .14 + shift, Math.max(R.pelvisY - .3 + lowered, R.pelvisY + bob - drop), ddz * .14);
    // Lean: forward when running and crouching, into a dash, a small rock back on landing.
    const throwing = this.throwing || 0;
    // (In a dash the rig owns the lean: whatever the weapon's pose leans the body is taken back out.)
    const leanX = -.16 * w - .12 * kneel + ddz * .5 + land * .1 - throwing * .12 - body.rotation.x * dash, leanZ = -ddx * .45 - body.rotation.z * dash;
    // The chest turns for a bladed stance or a throw; the hips take a third of it.
    const turn = this.twist + throwing * .5;
    const hipYaw = .14 * w * sp + turn * .3, chestYaw = turn * .7 - .1 * w * sp;
    this.e.set(leanX * .35, hipYaw, leanZ * .35); this.pelvisQ.setFromEuler(this.e);
    // (A dash pitches the chest on past the hips.)
    // (A dash pitches the chest on past the hips, along the dash; the whole
    // forward pitch, the body's own lean included, stays under 0.55 rad.)
    const pitch = Math.max(-.55 - body.rotation.x, leanX + .25 * dash * this.dashDir.y), roll = leanZ - .15 * dash * this.dashDir.x;
    this.e.set(pitch, hipYaw + chestYaw, roll + Math.sin(this.time * 1.3) * .012 * (1 - w)); this.torsoQ.setFromEuler(this.e);
    this.torso.position.copy(this.pelvis); this.torso.quaternion.copy(this.torsoQ);
    const breathe = 1 + Math.sin(this.time * 2.1) * .012 * (1 - w); this.torso.scale.set(breathe, 1, breathe);
    const at = (x, y, z, out) => out.set(x, y, z).applyQuaternion(this.torsoQ).add(this.pelvis);
    const neckBase = at(0, R.neck - .03, 0, this.neckBase ||= new THREE.Vector3()), headC = at(0, R.head.y, 0, this.headC ||= new THREE.Vector3());
    this.place(this.neck, neckBase, headC); this.head.position.copy(headC);
    // The head stays on the aim (a little lag behind the body's turns).
    this.headYaw = damp(this.headYaw || 0, .14 * w * sp * .3, 12, dt);
    this.e.set(-leanX * .45 - .15 * dash + Math.sin(this.time * 1.7) * .02 * (1 - w), this.headYaw, -leanZ * .3); this.head.quaternion.setFromEuler(this.e);
    this.head.position.add(this.v.set(0, 0, -.015).applyQuaternion(this.head.quaternion));
    // Legs: feet on the ground (player space), running in the facing direction.
    const hipH = R.pelvisY - drop + R.hip.y - R.ankle;
    const A = Math.min(.4 * stepLen * w, Math.sqrt(Math.max(0, legReach * legReach - hipH * hipH)) * .95);
    const leadSide = Math.abs(this.dashDir.x) > .3 ? Math.sign(this.dashDir.x) : 1;
    for (const leg of this.legs) {
      const s = leg.side, lp = ph + (s > 0 ? 0 : Math.PI), u = ((lp / (Math.PI * 2)) % 1 + 1) % 1;
      leg.hip.set(s * R.hip.x, R.hip.y, 0).applyQuaternion(this.pelvisQ).add(this.pelvis);
      let fx = s * (STEP.width - .01 * (1 - w)), fy = R.ankle, fz, lift = 0;
      if (u < STEP.stance) fz = -A + 2 * A * (u / STEP.stance);           // planted: moves back at the ground's speed
      else {                                                                // swing: up (a kick back first) and forward
        const k = (u - STEP.stance) / (1 - STEP.stance);
        fz = A - 2 * A * smooth(k);
        lift = (Math.sin(Math.PI * k) * STEP.lift + Math.sin(Math.PI * Math.min(1, k * 2)) * (1 - k) * .1) * w * Math.min(1, .4 + speed / 6);
        fy += lift;
      }
      // Crouch: a staggered stance, the right foot back, the left forward;
      // likewise a bladed stance; standing, a slight natural stagger.
      fz += Math.max(-.08, Math.min(.08, Math.max(0, -this.twist - .3) * (s > 0 ? .1 : -.05) + (1 - w) * (s > 0 ? .03 : -.03)));
      // Sightline's stance: a sniper's kneel, the right knee down, the left foot forward.
      if (kneel > .01) { if (s > 0) { fz += .28 * kneel; fy += .02 * kneel; } else fz -= .12 * kneel; }
      // Dash: a lunge, the foot nearer the dash leading, the other trailing straight, heel up.
      if (dash > .01) {
        const lead = s === leadSide, dir = this.w.set(this.dashDir.x, 0, this.dashDir.y);
        fx = fx * (1 - dash) + (s * R.hip.x + dir.x * (lead ? .14 : -.26)) * dash;
        fz = fz * (1 - dash) + dir.z * (lead ? .14 : -.34) * dash;
        fy = fy * (1 - dash) + (R.ankle + (lead ? 0 : .04)) * dash;
      }
      leg.goal.set(fx, fy, fz).applyMatrix4(toBody);
      // Knees forward; a trailing dash leg's knee back a little, so it stays long.
      const trail = dash > .01 && s !== leadSide;
      // (Mostly the hips' facing, so a turned body keeps its knees over its feet.)
      const kneePole = this.v.set(s * .08, -.1 - (s > 0 ? .9 * kneel : 0), -.6).applyQuaternion(this.pelvisQ);
      leg.pole.set(s * .06 - (trail ? this.dashDir.x * .3 * dash : 0), -.1, -.6 - (trail ? this.dashDir.y * .9 * dash : 0)).applyQuaternion(toBodyQ).lerp(kneePole, .7).add(leg.hip);
      solveTwoBone(leg.hip, leg.goal, leg.pole, R.thigh, R.shin, leg.knee, leg.ankle);
      this.place(leg.thigh, leg.hip, leg.knee); this.place(leg.shin, leg.knee, leg.ankle);
      leg.foot.position.copy(leg.ankle); leg.foot.position.y -= R.ankle - .004;
      leg.foot.quaternion.copy(toBodyQ); leg.foot.rotateY(hipYaw * .5 - s * .15 * (1 - w)); leg.foot.rotateX(-Math.min(.9, lift * 5) + (s > 0 ? .9 * kneel : 0)); leg.foot.translateZ(-.025);
    }
    // Arms: goals from the weapon (RiflePose), or the gun hand on the gun, or swinging free.
    const posed = this.goalFresh, g = this.goals; this.goalFresh = false;
    if (!posed) this.throwing = 0;
    // Omen is held in both hands: the left under its fore-end.
    this.support = sim.weapon === 'omen' ? (this.supportAt ||= new THREE.Vector3(-.02, -.1, -.25)) : null;
    // The weapon rides the body's run: the bob and the lean move it and the
    // hands on it together (the views set its place afresh every frame).
    const carry = this.w.set(0, bob - .6 * (.07 * w + dash * .13), leanX * .3 - dash * .05);
    // (Ichor is held a little further out, clear of the chest; idle, a slight sway.)
    // Idle hands (v0.999a, owner: "add the idle hands motion ... smooth and
    // tactile"): the weapon rises and settles with each breath (the chest's
    // own breathing, same beat), drifts a little on two slower beats that
    // never line up (no visible loop), and every few seconds the hands take a
    // fresh grip: a small dip, a nudge in, and a settle with a little give.
    const sway = 1 - w, t = this.time;
    if (sway > .8 && !dash) {
      this.fidgetIn = (this.fidgetIn ?? 3.5) - dt;
      if (this.fidgetIn <= 0 && !(this.fidget > 0)) { this.fidget = 1e-6; this.fidgetIn = 4 + ((Math.sin(t * 12.9898) * 43758.5453) % 1 + 1) % 1 * 4; }
    } else this.fidgetIn = Math.max(this.fidgetIn ?? 3.5, 1.5);
    let regrip = 0;
    if (this.fidget > 0) { this.fidget = Math.min(1, this.fidget + dt / .6); const k = this.fidget; regrip = Math.sin(Math.PI * k) * (1 - .5 * k) - (k > .7 ? Math.sin((k - .7) / .3 * Math.PI) * .18 : 0); if (k >= 1) this.fidget = 0; }
    const idleY = (Math.sin(t * 2.1) * .007 + Math.sin(t * .77) * .003) * sway - regrip * .026 * sway;
    const idleX = (Math.sin(t * 1.3) * .006 + Math.sin(t * .53 + 1) * .004) * sway + regrip * .006 * sway;
    const idleZ = (Math.sin(t * 2.1 + .8) * .004) * sway + regrip * .012 * sway;
    const carryY = (carry.y + idleY) / sy, carryZ = carry.z + idleZ + (sim.weapon === 'ichor' ? -.07 : 0), carryX = idleX;
    gun.position.x += carryX; gun.position.y += carryY; gun.position.z += carryZ;
    gun.updateMatrix();
    for (const arm of this.arms) {
      const s = arm.side, right = s > 0, i = right ? 0 : 1;
      if (posed && !g.free[i]) { arm.goal.copy(right ? g.r : g.l); arm.goal.x += carryX; arm.goal.y += carryY; arm.goal.z += carryZ; arm.held = true; arm.hint = g.keepPoles[i] ? (right ? g.rp : g.lp) : null; }
      else if (!posed && right && gun.visible !== false) { arm.goal.set(0, -.085, .12).applyMatrix4(gun.matrix); arm.held = true; arm.hint = null; }
      else if (!posed && !right && this.support) { arm.goal.copy(this.support).applyMatrix4(gun.matrix); arm.held = true; arm.hint = null; }
      else arm.held = false;
      // Body-space goals into the rig's (unsquashed) space.
      if (arm.held) arm.goal.y *= sy;
      if (arm.hint) arm.hint = (arm.hintScaled ||= new THREE.Vector3()).copy(arm.hint).setY(arm.hint.y * sy);
    }
    // Hands far forward: turn the chest (a bladed stance), then let the
    // shoulders reach; a hand still short of its grip slides back along the
    // weapon toward the other hand, so it stays on it and nothing stretches.
    let wantTwist = 0;
    const held = this.arms.filter(a => a.held);
    if (held.length) {
      let best = Infinity; const q = this.v, qq = this.qq ||= new THREE.Quaternion();
      for (let t = -.9; t <= .5001; t += .1) {
        let cost = t * t * .12;
        this.e.set(leanX, hipYaw + t, leanZ); qq.setFromEuler(this.e);
        for (const arm of held) { q.set(arm.side * R.shoulder.x, R.shoulder.y, 0).applyQuaternion(qq).add(this.pelvis); const over = q.distanceTo(arm.goal) - reach * .95; if (over > 0) cost += over * over * 40; }
        if (cost < best) { best = cost; wantTwist = t; }
      }
    }
    this.twist = damp(this.twist, wantTwist, 12, dt);
    for (const arm of this.arms) {
      const s = arm.side;
      at(s * R.shoulder.x, R.shoulder.y, 0, arm.shoulder);
      if (!arm.held) {
        // Free: hanging, a touch out from the body; running, a bent-elbow arm
        // swinging against the same side's leg; tucked in a dash; forward in a crouch.
        const sw = Math.sin(ph + (s > 0 ? 0 : Math.PI)), swing = sw * (sw > 0 ? .15 : .3) * w;
        // (Idle, a free hand drifts a little with the breath, never quite still.)
        const drift = (1 - w) * (1 - dash);
        arm.goal.set(s * (.06 + .03 * w + Math.sin(this.time * .9 + s) * .012 * drift), -.46 + .1 * w + Math.max(0, -swing) * .25 - Math.max(0, swing) * .27 + this.crouch * .1 + dash * .12 + Math.sin(this.time * 2.1) * .008 * drift, swing + dash * .1 - this.crouch * .16 + Math.sin(this.time * .7 + s * 2) * .018 * drift).applyQuaternion(this.torsoQ).add(arm.shoulder);
        arm.pole.set(s * .1, 0, .4).applyQuaternion(this.torsoQ).add(arm.shoulder);
      } else {
        const over = arm.shoulder.distanceTo(arm.goal) - reach * .98;
        if (over > 0) arm.shoulder.add(this.w.subVectors(arm.goal, arm.shoulder).setLength(Math.min(.06, over)));
        const still = arm.shoulder.distanceTo(arm.goal) - reach * .98, other = this.arms.find(a => a !== arm && a.held);
        if (still > 0 && other) { const along = this.w.subVectors(other.goal, arm.goal), len = along.length(); if (len > 1e-4) arm.goal.addScaledVector(along, Math.min(.85, still / len * 1.3)); }
        if (arm.hint) arm.pole.copy(arm.hint); else arm.pole.set(s * .45, -.8, .25).add(arm.shoulder);
        // A dash tucks the weapon in toward the chest.
        if (dash > .01) arm.goal.z += .05 * dash;
      }
      solveTwoBone(arm.shoulder, arm.goal, arm.pole, RIG.upperArm, RIG.forearm, arm.elbow, arm.wrist);
      this.place(arm.upper, arm.shoulder, arm.elbow); this.place(arm.fore, arm.elbow, arm.wrist);
      arm.hand.position.copy(arm.wrist); arm.hand.quaternion.copy(arm.fore.quaternion); if (arm.held) arm.hand.rotateY(-s * .35);
    }
  }

  dispose() { this.root.removeFromParent(); this.root.traverse(o => { if (o.isMesh) o.geometry.dispose(); }); }
}

// Blood on the figure (as blood-wading.js makeBloodStains for the cowboy):
// flecks lie on the limbs themselves, so they walk with them. Stages as
// WADING.stages: feet, then legs and hips, then the torso, arms and head.
export function makeRigStains(rig) {
  const box = new THREE.BoxGeometry(1, 1, 1), red = new THREE.MeshLambertMaterial({ color: '#9a1622' }), dark = new THREE.MeshLambertMaterial({ color: '#6a0d16' });
  let seed = 11; const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const stages = [[], [], [], [], []], all = []; // feet, legs, torso and arms, head (early), head (late)
  const fleck = (stage, parent, x, y, z, nx, ny, nz, w, l) => {
    const m = new THREE.Mesh(box, random() > .4 ? red : dark); m.userData.fleck = true;
    m.position.set(x, y, z); m.quaternion.setFromUnitVectors(UP, new THREE.Vector3(nx, ny, nz).normalize()); m.rotateY(random() * Math.PI); m.scale.set(w, .006, l);
    m.visible = false; parent.add(m); stages[stage].push(m); all.push(m);
  };
  // Round a limb (its own y runs along it): radius r, from y0 to y1.
  const onLimb = (stage, mesh, r, y0, y1, n) => { for (let i = 0; i < n; i++) { const a = random() * Math.PI * 2, y = y0 + random() * (y1 - y0), s = .03 + random() * .04; fleck(stage, mesh, Math.sin(a) * (r + .003), y, Math.cos(a) * (r + .003), Math.sin(a), 0, Math.cos(a), s, s * 1.4); } };
  const T = RIG.thickness;
  for (const leg of rig.legs) {
    onLimb(0, leg.shin, T.shin, 0, .06, 7);                     // (the shin's y 0 is the knee: its low end is at RIG.shin)
    for (const m of stages[0].slice(-7)) m.position.y = RIG.shin - m.position.y;
    onLimb(1, leg.shin, T.shin, .03, RIG.shin - .02, 8); onLimb(1, leg.thigh, T.thigh, .02, RIG.thigh - .02, 6);
  }
  // Torso: round its middle and over the shoulders (torso space).
  for (let i = 0; i < 26; i++) {
    const high = i >= 10, a = random() * Math.PI * 2, y = high ? .12 + random() * .2 : -.03 + random() * .12, r = y < .2 ? .152 : .18, s = .04 + random() * .05;
    fleck(high ? 2 : 1, rig.torso, Math.sin(a) * (r + .004), y, Math.cos(a) * (r + .004) * .7, Math.sin(a), 0, Math.cos(a) / .7, s, s * 1.4);
  }
  for (let i = 0; i < 8; i++) { const x = (random() - .5) * .3, z = (random() - .5) * .16, s = .04 + random() * .04; fleck(2, rig.torso, x, .36, z, x * .6, 1, z * .6, s, s * 1.3); }
  for (const arm of rig.arms) onLimb(2, arm.upper, T.upper, .04, RIG.upperArm - .03, 4);
  // Head: a few at the second stage, more at the third (a headless death takes them: they are the head's children).
  const head = (stage, n) => { for (let i = 0; i < n; i++) { const a = random() * Math.PI * 2, t = random() * 1.1, r = RIG.head.r + .003, s = .025 + random() * .035; const x = Math.sin(t) * Math.cos(a), y = Math.cos(t), z = Math.sin(t) * Math.sin(a); fleck(stage, rig.head, x * r, y * r, z * r, x, y, z, s, s * 1.25); } };
  head(3, 4); head(4, 10);
  let shown = -1;
  return {
    root: rig.root,
    set(level) {
      const n = [.12, .42, .72].filter(t => level >= t).length; if (n === shown) return; shown = n;
      const need = [1, 2, 3, 2, 3];
      stages.forEach((list, i) => { for (const m of list) m.visible = n >= need[i]; });
    },
    dispose() { for (const m of all) m.removeFromParent(); box.dispose(); red.dispose(); dark.dispose(); },
  };
}
