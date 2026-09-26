// Hollow Wick's soundscape (stage 3, s3-sound): synthesized like audio.js,
// hooked from it by three lines (start, event, update: `this.hollow?.`), so
// Deadwater's sound is exactly as it was. Owner's brief: stale, dry, crows
// only; too quiet, as if something happened here.
//
// Beds (loops on the ambient channel, through one `duck` gain):
//  - wind: colder and thinner than Deadwater's desert wind (which is cut off
//    on this map), with gusts: a swell, a thin whistle over it, then a fall;
//  - leaves: a dry rustle near the woods and the village trees, louder in a gust;
//  - the stream: a babble near the water (two bands, the upper one jittering);
//  - the weir: a rush near the mill dam (x 14).
// One-shots, placed (each by its distance from you, audio.js HEARING):
//  - crows: idle caws from the perched crows (fewer and duller far off),
//    alarm calls and wing claps when they scatter (effects/crow-rules.js);
//  - the rope creaking on the hanging tree (about -4, -24), in time with its sway;
//  - the mill wheel's slow creak (a quarter turn apart) and its paddles slapping;
//  - now and then a single bell toll from the meetinghouse belfry (rare).
// The water (effects channel, from WaterEffects.onSound): wading steps and
// dodges, splashes, a grenade's spout and plop; and a wetter footstep of your
// own in the water (in place of the dry one).
// Silences: gunfire (anyone's, if heard) ducks the beds and the one-shots at
// once; they come back slowly. The crows keep quiet a while (CROWS.hush).
import { HEARING, hearingLevel } from './audio.js';
import { GUNFIRE } from './effects/crow-rules.js';
import { WOODS } from './maps/hollow-wick.js';

export const HOLLOW_SOUND = Object.freeze({
  wind: .05, gust: Object.freeze([6, 15]), whistle: .012,
  leaves: .05, stream: .075, weir: .1,
  // Where things are (hollow-wick.js, hollow-wick-props.js, hollow-wick-crossings.js).
  weirAt: Object.freeze([13.8, 19.9]), wheelAt: Object.freeze([22, 19.5]), wheelTurn: .45,
  ropeAt: Object.freeze([-1.6, -24.9]), belfryAt: Object.freeze([-39.1, -22.5]),
  bell: Object.freeze([95, 210]), bellFirst: Object.freeze([35, 80]),
  // The duck: how far down, how long held, how slowly back (time constant, s).
  duck: .16, hold: 1.6, recover: 3.2,
});

export const hasHollowSound = map => map?.id === 'hollow-wick';

const segDist = (x, z, ax, az, bx, bz) => { const dx = bx - ax, dz = bz - az, l = dx * dx + dz * dz, t = l ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l)) : 0; return Math.hypot(ax + dx * t - x, az + dz * t - z); };
function insidePoly(x, z, poly) { let a = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, zi] = poly[i], [xj, zj] = poly[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) a = !a; } return a; }
const polyDist = (x, z, poly) => insidePoly(x, z, poly) ? 0 : Math.min(...poly.map((p, i) => { const q = poly[(i + 1) % poly.length]; return segDist(x, z, p[0], p[1], q[0], q[1]); }));
const fade = (d, near, reach) => d <= near ? 1 : Math.exp(-(d - near) / reach);

// How loud each bed is at (x, z): pure, for the tests and the mixer.
export function bedLevels(map, x, z) {
  const water = map.terrain?.water?.[0], pts = water?.points || [];
  let stream = Infinity;
  for (let i = 1; i < pts.length; i++) stream = Math.min(stream, segDist(x, z, pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]) - (pts[i][2] + pts[i - 1][2]) / 2);
  const woods = Math.min(Infinity, ...WOODS.map(w => polyDist(x, z, w.poly)));
  let trees = 0; for (const t of map.trees?.trees || []) if ((t.x - x) ** 2 + (t.z - z) ** 2 < 64) trees++;
  const [wx, wz] = HOLLOW_SOUND.weirAt;
  return {
    stream: pts.length ? fade(stream, 2.5, 6.5) : 0,
    weir: fade(Math.hypot(x - wx, z - wz), 4, 6),
    leaves: Math.max(fade(woods, 0, 6), Math.min(1, trees / 5)),
  };
}
export class HollowSound {
  constructor(sound, { map, view = null } = {}) {
    this.sound = sound; this.map = map; this.view = view;
    this.started = false; this.indoors = false; this.last = { x: 0, z: 0 };
    this.clock = 0; this.nextMix = 0; this.nextGust = 3; this.nextRope = 2; this.nextBell = rangeOf(HOLLOW_SOUND.bellFirst);
    this.wheelAngle = 0; this.nextPaddle = 0; this.lastKind = {}; this.quietUntil = 0;
  }

  // Built with the audio graph (audio.js start): Deadwater's desert wind is
  // cut off here and these beds take its place.
  start(sound = this.sound) {
    const ctx = sound.context; if (!ctx || this.started) return;
    this.started = true; this.ctx = ctx;
    try { sound.wind?.disconnect(); } catch { /* not connected */ }
    this.duck = ctx.createGain(); this.duck.gain.value = 1; this.duck.connect(sound.buses.ambient);
    // A second duck for the placed one-shots (crows, rope, wheel, bell).
    this.shots = ctx.createGain(); this.shots.gain.value = 1; this.shots.connect(this.duck);
    const loop = (buffer, offset = 0) => { const s = ctx.createBufferSource(); s.buffer = buffer; s.loop = true; s.start(ctx.currentTime, offset); return s; };
    const filter = (type, frequency, Q = .7) => { const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = frequency; f.Q.value = Q; return f; };
    const gain = v => { const g = ctx.createGain(); g.gain.value = v; return g; };
    // Wind: the brown noise through a band, cold (higher, thinner than the desert's 550 Hz lowpass).
    this.windBand = filter('bandpass', 380, .55); this.windGain = gain(HOLLOW_SOUND.wind);
    loop(sound.noiseBuffer, .7).connect(this.windBand); this.windBand.connect(this.windGain); this.windGain.connect(this.duck);
    this.whistleBand = filter('bandpass', 950, 9); this.whistleGain = gain(0);
    loop(sound.impactBuffer, .2).connect(this.whistleBand); this.whistleBand.connect(this.whistleGain); this.whistleGain.connect(this.duck);
    // Leaves: dry, high, flickering.
    this.leafBand = filter('highpass', 2600, .5); this.leafGain = gain(0);
    loop(sound.impactBuffer, .5).connect(this.leafBand); this.leafBand.connect(this.leafGain); this.leafGain.connect(this.duck);
    // The stream: a low wash and a jittering upper babble.
    this.streamLow = filter('bandpass', 700, .9); this.streamHigh = filter('bandpass', 2100, 3.2); this.streamGain = gain(0); this.babbleGain = gain(.45);
    const s1 = loop(sound.noiseBuffer, 1.3), s2 = loop(sound.impactBuffer, .8);
    s1.connect(this.streamLow); this.streamLow.connect(this.streamGain);
    s2.connect(this.streamHigh); this.streamHigh.connect(this.babbleGain); this.babbleGain.connect(this.streamGain); this.streamGain.connect(this.duck);
    // The weir: a broad rush.
    this.weirBand = filter('lowpass', 1500, .5); this.weirGain = gain(0);
    loop(sound.impactBuffer, .35).connect(this.weirBand); this.weirBand.connect(this.weirGain); this.weirGain.connect(this.duck);
  }

  reset() { this.quietUntil = 0; if (this.duck) this.duck.gain.setTargetAtTime(1, this.ctx.currentTime, .3); }

  get live() { const s = this.sound; return this.started && s.enabled && s.context?.state === 'running'; }

  // Every event audio.js hears (`level`: how loud from here). Gunfire ducks.
  event(e, level = 1) {
    if (!GUNFIRE.has(e.type) || !(level > HEARING.silent) || !this.duck) return;
    const now = this.ctx.currentTime, down = HOLLOW_SOUND.duck + (1 - Math.min(1, level)) * .5;
    for (const g of [this.duck.gain, this.shots.gain]) {
      g.cancelScheduledValues(now); g.setValueAtTime(Math.min(g.value, 1), now);
      g.linearRampToValueAtTime(Math.min(g.value, down), now + .08);
      g.setTargetAtTime(1, now + .08 + HOLLOW_SOUND.hold, HOLLOW_SOUND.recover * (g === this.shots.gain ? 1.8 : 1));
    }
    this.quietUntil = this.clock + HOLLOW_SOUND.hold + HOLLOW_SOUND.recover * 2;
  }

  // Each simulation step (audio.js update): the beds follow you; timers run.
  update(player, time) {
    if (!this.started && this.sound.context) this.start();
    const dt = Math.max(0, Math.min(.25, time - (this.lastTime ?? time))); this.lastTime = time; this.clock += dt;
    this.last = { x: player.x, z: player.z };
    if (!this.live) return;
    const now = this.ctx.currentTime;
    if (this.clock >= this.nextMix) {
      this.nextMix = this.clock + .12;
      const b = bedLevels(this.map, player.x, player.z), inside = this.indoors ? .45 : 1, gust = this.gustLevel || 0;
      this.leafGain.gain.setTargetAtTime(HOLLOW_SOUND.leaves * b.leaves * inside * (.35 + gust * .9) * (.6 + Math.random() * .6), now, .06);
      this.streamGain.gain.setTargetAtTime(HOLLOW_SOUND.stream * b.stream * inside, now, .25);
      this.streamHigh.frequency.setTargetAtTime(1700 + Math.random() * 900, now, .05);
      this.babbleGain.gain.setTargetAtTime(.25 + Math.random() * .45, now, .04);
      this.weirGain.gain.setTargetAtTime(HOLLOW_SOUND.weir * b.weir * inside, now, .3);
      this.windGain.gain.setTargetAtTime(HOLLOW_SOUND.wind * inside * (1 + gust * 1.6), now, .8);
    }
    this.gusts(dt, now);
    this.rope(dt, player);
    this.wheel(dt, player);
    this.bell(dt, player);
  }

  // A gust: a slow swell (1.5-3 s), the whistle rising over it, a fall.
  gusts(dt, now) {
    this.nextGust -= dt;
    if (this.gustLeft > 0) { this.gustLeft -= dt; this.gustLevel = Math.max(0, Math.sin(Math.PI * (1 - this.gustLeft / this.gustLength))) * this.gustPower; }
    else this.gustLevel = 0;
    if (this.nextGust > 0) return;
    this.nextGust = rangeOf(HOLLOW_SOUND.gust); this.gustLength = this.gustLeft = 3.5 + Math.random() * 3; this.gustPower = .5 + Math.random() * .5;
    const L = this.gustLength, p = this.gustPower;
    this.windBand.frequency.cancelScheduledValues(now); this.windBand.frequency.setTargetAtTime(380 + 320 * p, now, L * .25); this.windBand.frequency.setTargetAtTime(380, now + L * .55, L * .25);
    const w = this.whistleGain.gain, f = this.whistleBand.frequency;
    w.cancelScheduledValues(now); w.setTargetAtTime(HOLLOW_SOUND.whistle * p * (this.indoors ? .5 : 1), now + L * .15, L * .2); w.setTargetAtTime(0, now + L * .6, L * .2);
    f.cancelScheduledValues(now); f.setValueAtTime(820 + Math.random() * 200, now); f.linearRampToValueAtTime(1150 + Math.random() * 350, now + L * .5); f.linearRampToValueAtTime(880, now + L);
  }

  // Placed level: HEARING's falloff, times an extra fade for quiet things.
  levelAt(x, z, carry = 1) { return hearingLevel(Math.hypot(x - this.last.x, z - this.last.z) / carry); }

  // The rope, in time with the hanged man's sway (hollow-props.js swing: a
  // yaw of sin(t * .21) and a pendulum of sin(t * .55)): a creak at each end.
  rope(dt, player) {
    this.nextRope -= dt; if (this.nextRope > 0) return;
    this.nextRope = Math.PI / .55 * (.9 + Math.random() * .25);
    const [x, z] = HOLLOW_SOUND.ropeAt, d = Math.hypot(player.x - x, player.z - z); if (d > 26) return;
    const level = fade(d, 3, 4.5) * .9; if (level < .02) return;
    // Stick-slip: a run of tiny clicks, speeding up, over a strained tone.
    const n = 10 + Math.floor(Math.random() * 10), len = .35 + Math.random() * .25;
    for (let i = 0; i < n; i++) { const t = len * Math.sqrt(i / n); this.click(t, .015, .05 * level, 1500 + Math.random() * 900); }
    this.voice({ type: 'sawtooth', from: 190 + Math.random() * 40, to: 150, length: len, volume: .012 * level, band: 900, Q: 5 });
  }

  // The wheel: a quarter turn per creak (HOLLOW_SOUND.wheelTurn rad/s), its
  // twelve paddles slapping the race between.
  wheel(dt, player) {
    const [x, z] = HOLLOW_SOUND.wheelAt, d = Math.hypot(player.x - x, player.z - z);
    const before = this.wheelAngle; this.wheelAngle += HOLLOW_SOUND.wheelTurn * dt;
    if (d > 30) return;
    const level = fade(d, 3, 5.5);
    if (Math.floor(this.wheelAngle / (Math.PI / 2)) !== Math.floor(before / (Math.PI / 2))) {
      // A long, low wooden groan: the axle in its bearing.
      this.voice({ type: 'sawtooth', from: 72 + Math.random() * 10, to: 58, length: .9, volume: .03 * level, band: 420, Q: 6, wobble: 5 });
      for (let i = 0; i < 8; i++) this.click(.1 + i * .09 + Math.random() * .03, .02, .03 * level, 700 + Math.random() * 500);
    }
    if (Math.floor(this.wheelAngle / (Math.PI / 6)) !== Math.floor(before / (Math.PI / 6))) this.slap(.035 * level);
  }

  // A paddle meeting the race: a short wet slap.
  slap(level) { if (level < .003) return; this.noiseHit(0, .12, level, 'lowpass', 700, .8, this.shots, 'brown'); this.noiseHit(.01, .08, level * .5, 'bandpass', 1500, 1.2); }

  // The bell: one toll, rare; heard over most of the map. Never in the
  // silence after gunfire (it waits).
  bell(dt, player) {
    this.nextBell -= dt; if (this.nextBell > 0) return;
    if (this.clock < this.quietUntil) { this.nextBell = 8; return; }
    this.nextBell = rangeOf(HOLLOW_SOUND.bell);
    const [x, z] = HOLLOW_SOUND.belfryAt, d = Math.hypot(player.x - x, player.z - z);
    this.toll(Math.max(.18, hearingLevel(d * .45)));
  }
  toll(level) {
    const ctx = this.ctx, now = ctx.currentTime, f = 138 + Math.random() * 6, out = ctx.createGain(); out.gain.value = level * .5; out.connect(this.shots);
    // Inharmonic partials of a bronze bell: hum, prime, minor third, fifth, octave, and up.
    for (const [ratio, amp, decay] of [[.5, .5, 9], [1, .7, 7], [1.19, .35, 5], [1.5, .22, 4.5], [2, .32, 4], [2.52, .14, 2.8], [3.01, .1, 2], [4.1, .06, 1.2]]) {
      const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine'; o.frequency.value = f * ratio * (1 + (Math.random() - .5) * .004);
      g.gain.setValueAtTime(.0001, now); g.gain.exponentialRampToValueAtTime(amp * .12, now + .012); g.gain.exponentialRampToValueAtTime(.0001, now + decay);
      o.connect(g); g.connect(out); o.start(now); o.stop(now + decay + .05); o.onended = () => { o.disconnect(); g.disconnect(); };
    }
    this.click(0, .05, .08 * level, 1800, out);
    setTimeout(() => out.disconnect(), 11000);
  }

  // The crows (crow-rules.js onCall): idle caws, alarms, wings.
  crow(kind, x, y, z, n = 1) {
    if (!this.live) return;
    const d = Math.hypot(x - this.last.x, z - this.last.z), level = hearingLevel(d);
    if (!(level > HEARING.silent)) return;
    if (kind === 'caw') { for (let i = 0; i < n; i++) this.caw(i * (.38 + Math.random() * .12), level * .75, d, false); return; }
    if (kind === 'alarm') { const k = Math.min(5, 2 + n); for (let i = 0; i < k; i++) this.caw(.05 + i * (.17 + Math.random() * .1), level, d, true); return; }
    if (kind === 'flap') { for (let i = 0; i < Math.min(6, 2 + n * 2); i++) this.clap(i * (.07 + Math.random() * .05), level); return; }
    if (kind === 'land') this.clap(0, level * .5);
  }
  // A caw: a harsh, nasal, falling note. Far off, duller (a lowpass closes).
  caw(delay, level, distance, alarm) {
    const ctx = this.ctx, now = ctx.currentTime + delay, len = alarm ? .16 + Math.random() * .05 : .22 + Math.random() * .08;
    const f = (alarm ? 560 : 470) + Math.random() * 90;
    const o = ctx.createOscillator(), n = ctx.createBufferSource(), f1 = ctx.createBiquadFilter(), f2 = ctx.createBiquadFilter(), dull = ctx.createBiquadFilter(), g = ctx.createGain(), rasp = ctx.createGain();
    o.type = 'sawtooth'; o.frequency.setValueAtTime(f, now); o.frequency.linearRampToValueAtTime(f * 1.06, now + len * .2); o.frequency.exponentialRampToValueAtTime(f * .78, now + len);
    n.buffer = this.sound.impactBuffer; rasp.gain.value = .5;
    f1.type = 'bandpass'; f1.frequency.value = 1350; f1.Q.value = 2.5; f2.type = 'bandpass'; f2.frequency.value = 2500; f2.Q.value = 3;
    dull.type = 'lowpass'; dull.frequency.value = Math.max(900, 5200 - distance * 110);
    g.gain.setValueAtTime(.0001, now); g.gain.exponentialRampToValueAtTime(.09 * level, now + .015); g.gain.setValueAtTime(.08 * level, now + len * .6); g.gain.exponentialRampToValueAtTime(.0001, now + len);
    o.connect(f1); o.connect(f2); n.connect(rasp); rasp.connect(f1); f1.connect(dull); f2.connect(dull); dull.connect(g); g.connect(this.shots);
    o.start(now); n.start(now, Math.random() * .5); o.stop(now + len + .02); n.stop(now + len + .02);
    o.onended = () => { for (const x of [o, n, f1, f2, dull, g, rasp]) x.disconnect(); };
  }
  // A wing clap: a soft low thump of air.
  clap(delay, level) { this.noiseHit(delay, .07, .03 * level, 'bandpass', 480, 1.2, this.shots); }

  // The water (WaterEffects.onSound), on the effects channel, placed.
  water(kind, x, z, strength = 1) {
    if (!this.live) return;
    const now = this.ctx.currentTime;
    if (now - (this.lastKind[kind] ?? -1) < (kind === 'splash' ? .03 : .06)) return;
    this.lastKind[kind] = now;
    const level = this.levelAt(x, z); if (!(level > HEARING.silent)) return;
    const out = this.sound.buses.effects, s = Math.max(.2, Math.min(2, strength));
    if (kind === 'wadeStep') { this.noiseHit(0, .2, .06 * level * (.6 + s * .4), 'lowpass', 850, .7, out, 'brown'); this.noiseHit(.02, .12, .03 * level, 'bandpass', 1600, 1.5, out); return; }
    if (kind === 'wadeDodge') { this.noiseHit(0, .45, .12 * level * (.6 + s * .4), 'lowpass', 1000, .7, out, 'brown'); this.noiseHit(.03, .3, .06 * level, 'bandpass', 2200, 1, out); this.drops(.08, 5, level * .8, out); return; }
    if (kind === 'splash') { this.noiseHit(0, .12 + s * .05, .05 * level * s, 'bandpass', 1300, .9, out); this.drops(.04, 2 + Math.round(s * 2), level * .6, out); return; }
    if (kind === 'spout') {
      this.voice({ type: 'sine', from: 80, to: 36, length: .35, volume: .16 * level, out });
      this.noiseHit(0, .7, .14 * level, 'lowpass', 900, .6, out, 'brown'); this.noiseHit(.15, .6, .06 * level, 'bandpass', 2400, .8, out);
      this.drops(.35, 8, level, out); return;
    }
    if (kind === 'plop') { this.voice({ type: 'sine', from: 260, to: 820, length: .07, volume: .07 * level, out }); this.noiseHit(0, .05, .03 * level, 'bandpass', 1400, 2, out); }
  }
  drops(start, n, level, out) { for (let i = 0; i < n; i++) this.voice({ type: 'sine', from: 1400 + Math.random() * 1400, to: 700, length: .04, volume: .02 * level, delay: start + Math.random() * .35, out }); }

  // Your own footstep in the water (audio.js update, in place of the dry
  // one): a soft wet thud and a squelch. True when it played.
  step(player) {
    if (!this.started) return false;
    const field = this.view?.waterFX?.field, depth = field?.depthAt?.(player.x, player.z) ?? -1;
    if (!(depth > .03)) return false;
    if (!this.live) return true;
    const out = this.sound.buses.effects, deep = Math.min(1, depth / .3);
    this.noiseHit(0, .09, .1, 'lowpass', 1100 - deep * 400, .7, out, 'brown');
    this.noiseHit(.01, .07, .05 * (1 - deep * .5), 'bandpass', 750, 3, out);
    this.voice({ type: 'triangle', from: 85, to: 42, length: .06, volume: .02, out });
    return true;
  }

  // --- small synth pieces, each to a destination node -------------------
  voice({ type = 'sine', from, to, length, volume, delay = 0, band = 0, Q = 1, wobble = 0, out = this.shots }) {
    const ctx = this.ctx, now = ctx.currentTime + delay, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(from, now); o.frequency.exponentialRampToValueAtTime(Math.max(20, to), now + length);
    g.gain.setValueAtTime(.0001, now); g.gain.exponentialRampToValueAtTime(Math.max(.0002, volume), now + Math.min(.05, length * .2)); g.gain.exponentialRampToValueAtTime(.0001, now + length);
    const nodes = [o, g];
    if (band) { const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = band; f.Q.value = Q; o.connect(f); f.connect(g); nodes.push(f); } else o.connect(g);
    if (wobble) { const l = ctx.createOscillator(), d = ctx.createGain(); l.frequency.value = wobble; d.gain.value = from * .06; l.connect(d); d.connect(o.frequency); l.start(now); l.stop(now + length + .02); nodes.push(l, d); }
    g.connect(out); o.start(now); o.stop(now + length + .02);
    o.onended = () => nodes.forEach(n => n.disconnect());
  }
  noiseHit(delay, length, volume, type, frequency, Q, out = this.shots, colour = 'white') {
    const ctx = this.ctx, now = ctx.currentTime + delay, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = colour === 'brown' ? this.sound.noiseBuffer : this.sound.impactBuffer; f.type = type; f.frequency.value = frequency; f.Q.value = Q;
    g.gain.setValueAtTime(.0001, now); g.gain.exponentialRampToValueAtTime(Math.max(.0002, volume), now + Math.min(.02, length * .2)); g.gain.exponentialRampToValueAtTime(.0001, now + length);
    s.connect(f); f.connect(g); g.connect(out); s.start(now, Math.random() * .5); s.stop(now + length + .02);
    s.onended = () => { s.disconnect(); f.disconnect(); g.disconnect(); };
  }
  click(delay, length, volume, frequency, out = this.shots) { this.noiseHit(delay, length, volume, 'bandpass', frequency, 2.5, out); }
}

function rangeOf([a, b]) { return a + Math.random() * (b - a); }
