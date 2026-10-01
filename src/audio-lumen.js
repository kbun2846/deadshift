// Lumen's voices (stage 3, s3-sound): the beds and the one-shot sounds of the
// night city, all synthesised like audio.js (no files, nothing loaded), on the
// ambient channel. Hollow Wick's audio-hollow.js is the pattern; what plays
// where and when is lumen-ambience.js (this file only makes the sounds).
//
// The feel (design section 14): an empty-ish city; big hard spaces that echo;
// machines still running; nobody. Long quiet stretches under a steady electric
// hum, broken by things that need no one. Everything placed goes through one
// synthetic "hall": a convolver whose impulse response is a decaying noise tail
// with a few early reflections, the towers answering back.
//
// The graph (built once at start, nodes reused):
//   ambient bus <- duck <- outdoor <- muffle (a lowpass that closes indoors)
//                       <- rooms   (the room tone: unmuffled, it is in the room)
//                       <- shotsIn (placed sounds from the room you are in)
//   outdoor <- the beds (wind, whistle, rain, drum, patter, gutter, hum group,
//              hvac, market, tv, club bass, train, steam, smoulder), the
//              placed one-shots from outside (shotsOut) and the hall's return.
// Gunfire ducks `duck` and both shot buses at once and they come back slowly.
//
// Voices: a one-shot makes a few nodes, frees them when it ends, and is
// refused when `voiceLimit` are already sounding (a fixed budget by preset).
// Nothing is made per frame; the beds only get new targets ten times a second.
import { HEARING } from './audio.js';
import { GUNFIRE } from './effects/crow-rules.js';
import { RAIN, rainPhase } from './effects/rain.js';

// Every number that sets how it sounds or when. Levels are gains on the
// ambient bus (Hollow Wick's beds run .05 to .1; a rifle shot is louder).
export const LUMEN_SOUND = Object.freeze({
  // Bed levels at full strength.
  level: Object.freeze({
    hum: .03, buzz: .09, wind: .09, whistle: .11, rain: .14, hiss: .018, drum: .15, patter: .05, gutter: .1,
    hvac: .017, market: .08, tv: .05, club: .06, vending: .007, train: .09, steam: .036, smoulder: .03, room: .03, alarm: .036,
  }),
  // Gunfire ducks the ambience (gain it falls to, s held, time constant back in s).
  duck: .24, hold: 1.1, recover: 2.8,
  // Voices at once, by preset (the hall's tail is shorter on the low ones).
  voiceLimit: Object.freeze({ potato: 10, performance: 14, balanced: 20, quality: 26, extreme: 32 }),
  hallSeconds: Object.freeze({ potato: 1, performance: 1.4, balanced: 1.9, quality: 2.3, extreme: 2.7 }),
  // Indoors: the city and the rain through the walls (lowpass Hz, gain), and
  // how much opens up beside an outer door.
  muffle: Object.freeze({ shut: 420, open: 2800, gain: .16, gainOpen: .5, doorNear: 1.5, doorFar: 7 }),
});

// --- Deterministic schedules (pure functions of the weather clock) --------
// Thunder, the train, the hum dropping away, the gusts: the host and a joiner
// who arrives late hear them at the same moment with nothing sent.

// A small integer hash to 0..1, the same everywhere.
export function hash01(a, b = 0, c = 0) {
  let h = (Math.imul(a | 0, 0x9E3779B1) ^ Math.imul(b | 0, 0x85EBCA77) ^ Math.imul(c | 0, 0xC2B2AE3D)) >>> 0;
  h ^= h >>> 15; h = Math.imul(h, 0x2C1B3C6D) >>> 0; h ^= h >>> 12; h = Math.imul(h, 0x297A2D39) >>> 0; h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}
const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
const smooth = x => { x = clamp01(x); return x * x * (3 - 2 * x); };

// The first event of a repeating, jittered kind inside (from, to]: event n of
// `site` happens `period * n + hash * spread` seconds in. NaN if none.
export function slotFire(site, from, to, period, spread) {
  const n0 = Math.floor((from - spread) / period), n1 = Math.floor(to / period);
  for (let n = n0; n <= n1; n++) { const t = n * period + hash01(site, n, 7) * spread; if (t > from && t <= to) return t; }
  return NaN;
}

// Thunder: three strikes in each rain, well inside the steady part of it (never
// in the ramps), each with its own delay to the sound (light before sound) and
// strength. `thunderAt(clock)` is the sky's lift for the view: 0..1, a flash
// over about 0.2 s with a second, weaker pulse (a real flash flickers).
export const THUNDER = Object.freeze({ perCycle: 3, from: 16, to: 106, delay: Object.freeze([.6, 3.4]), flash: .22 });
const strikeSlot = (THUNDER.to - THUNDER.from) / THUNDER.perCycle;
export const strikeTime = (cycle, k) => THUNDER.from + strikeSlot * k + hash01(cycle, k, 11) * (strikeSlot - 4);
export const strikeDelay = (cycle, k) => THUNDER.delay[0] + hash01(cycle, k, 12) * (THUNDER.delay[1] - THUNDER.delay[0]);
export const strikePower = (cycle, k) => .45 + .55 * hash01(cycle, k, 13);
export const rainCycle = clock => Math.floor((clock + (RAIN.offset || 0)) / RAIN.period);
export function thunderAt(clock) {
  const cycle = rainCycle(clock), p = rainPhase(clock);
  if (p > THUNDER.to + strikeSlot) return 0;
  let v = 0;
  for (let k = 0; k < THUNDER.perCycle; k++) {
    const dt = p - strikeTime(cycle, k);
    if (dt < 0 || dt >= THUNDER.flash) continue;
    let f = dt < .03 ? dt / .03 : Math.exp(-(dt - .03) / .06);
    if (dt > .11) f += .6 * Math.exp(-(dt - .11) / .05);
    v = Math.max(v, Math.min(1, f) * (.6 + .4 * strikePower(cycle, k)));
  }
  return v;
}

// The automated train under the metro: every so often, a rumble that swells as
// it comes and falls away faster as it goes. 0..1.
export const TRAIN = Object.freeze({ period: 113, at: 37, length: 17 });
export function trainAt(clock) {
  const P = TRAIN.period, p = (((clock - TRAIN.at) % P) + P) % P;
  if (p >= TRAIN.length) return 0;
  return Math.sin(Math.PI * Math.pow(p / TRAIN.length, .75)) ** 1.6;
}

// Now and then the whole hum drops away for a few seconds: 1 normally, near
// 0 through the gap (a ramp each side). One gap in each period, somewhere
// after the first few seconds.
export const HUM_DROP = Object.freeze({ period: 131, margin: 12, length: Object.freeze([3, 6.5]), ramp: .7, depth: .96 });
export function humAt(clock) {
  const H = HUM_DROP, n = Math.floor(clock / H.period), start = n * H.period + hash01(n, 3, 5) * (H.period - H.margin);
  const len = H.length[0] + (H.length[1] - H.length[0]) * hash01(n, 4, 6), p = clock - start;
  if (p < 0 || p > len + H.ramp) return 1;
  const f = p < H.ramp ? p / H.ramp : p < len ? 1 : (len + H.ramp - p) / H.ramp;
  return 1 - H.depth * smooth(f);
}

// Gusts between the towers: 0..1, smooth, irregular, the same for everyone.
export function gustAt(clock) {
  const a = Math.sin(clock * .23 + 1.1) * Math.sin(clock * .071 + .3) + Math.sin(clock * .41) * .3;
  return clamp01((a - .12) / .8) ** 1.5;
}

// --- Room tones: what each kind of interior hums ---------------------------
// f (Hz, the hum), h (its octave's weight), lp (the tone's lowpass), hiss
// (noise band centre Hz), hissQ, hissMix (noise level against the tone).
export const ROOM_TONES = Object.freeze({
  fridge:    Object.freeze({ f: 60, h: .5, lp: 420, hiss: 900, hissQ: 1, hissMix: .3 }),
  servers:   Object.freeze({ f: 118, h: .3, lp: 1100, hiss: 2000, hissQ: .8, hissMix: .9 }),
  club:      Object.freeze({ f: 46, h: .2, lp: 220, hiss: 300, hissQ: .8, hissMix: .3 }),
  scrubber:  Object.freeze({ f: 96, h: .4, lp: 500, hiss: 700, hissQ: .7, hissMix: 1.1 }),
  fan:       Object.freeze({ f: 84, h: .3, lp: 700, hiss: 1300, hissQ: .6, hissMix: 1 }),
  machinery: Object.freeze({ f: 52, h: .9, lp: 380, hiss: 420, hissQ: .9, hissMix: .5 }),
  hvac:      Object.freeze({ f: 44, h: .3, lp: 300, hiss: 520, hissQ: .5, hissMix: .8 }),
  hum:       Object.freeze({ f: 120, h: .25, lp: 600, hiss: 1500, hissQ: .8, hissMix: .35 }),
});
// Which tone a building (or one room of it, "building/room") has.
export const ROOM_KINDS = Object.freeze({
  convenience: 'fridge', 'market-hall': 'fridge', 'market-hall/cold-room': 'machinery', pharmacy: 'scrubber', clinic: 'scrubber',
  arcade: 'servers', flatiron: 'servers', pachinko: 'servers', 'body-mod': 'servers', 'corporate-tower': 'servers', showroom: 'hvac',
  club: 'club', karaoke: 'club', bar: 'club', 'capsule-hotel': 'hvac', hotel: 'hvac', 'luxury-tower': 'hvac',
  'noodle-bar': 'fan', 'tenement-b': 'fan', laundromat: 'machinery', 'ev-garage': 'machinery', 'fab-workshop': 'machinery', parking: 'machinery',
  'charging-office': 'fridge', 'metro-entrance': 'hvac', bus: 'hvac',
});
export const roomKindOf = (group, room) => ROOM_KINDS[`${group}/${room}`] || ROOM_KINDS[group] || 'hum';

// The club's beat (muffled bass through the walls): steps a second.
export const CLUB = Object.freeze({ bpm: 122, bass: Object.freeze([1, 1, 0, 1, 1, 0, 1, 0]) });

// The state of the beds, one object reused; every field 0..1 unless noted.
export function newMix() {
  return {
    hum: 0, buzz: 0, wind: 0, whistle: 0, windHz: 330, whistleHz: 900, rain: 0, hiss: 0, drum: 0, patter: 0, gutter: 0,
    hvac: 0, hvacHz: 55, market: 0, tv: 0, club: 0, clubIn: 0, vending: 0, train: 0, steam: 0, smoulder: 0,
    room: 0, roomKind: 'hum', muffle: 0, door: 0, humDrop: 1, sag: 0, alarm: 0, alarmPattern: 0,
    stepMode: 0, // 0 the dry step, 1 wet ground, 2 through a puddle
  };
}

export class LumenSound {
  constructor(sound, { map = null, quality = 'balanced' } = {}) {
    this.sound = sound; this.map = map; this.quality = quality;
    this.started = false; this.ctx = null; this.active = 0; this.limit = LUMEN_SOUND.voiceLimit[quality] ?? 20;
    this.last = { x: 0, z: 0 }; this.lastKind = {}; this.mixState = newMix(); this.roomKind = '';
    this.clubNext = 0; this.stepMode = 0; this.wetness = 0;
  }

  get live() { const s = this.sound; return this.started && s.enabled && s.context?.state === 'running'; }

  setQuality(name) {
    this.quality = name; this.limit = LUMEN_SOUND.voiceLimit[name] ?? this.limit;
    if (this.started && this.hall) this.hall.buffer = this.impulse();
  }

  // Built with the audio graph (audio.js start). Deadwater's desert wind is
  // cut off here; these beds take its place.
  start(sound = this.sound) {
    const ctx = sound.context; if (!ctx || this.started) return;
    this.started = true; this.ctx = ctx;
    try { sound.wind?.disconnect(); } catch { /* not connected */ }
    const gain = v => { const g = ctx.createGain(); g.gain.value = v; return g; };
    const filter = (type, frequency, Q = .7) => { const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = frequency; f.Q.value = Q; return f; };
    const osc = (type, frequency) => { const o = ctx.createOscillator(); o.type = type; o.frequency.value = frequency; o.start(); return o; };
    const loop = (buffer, offset = 0) => { const s = ctx.createBufferSource(); s.buffer = buffer; s.loop = true; s.start(ctx.currentTime, offset); return s; };
    this.pink = noiseBuffer(ctx, 6, 'pink'); this.white = noiseBuffer(ctx, 4, 'white');

    // The chain: ambient <- duck <- (outdoor <- muffle), rooms, shotsIn.
    this.duck = gain(1); this.duck.connect(sound.buses.ambient);
    this.outdoor = gain(1); this.openHz = Math.min(18000, ctx.sampleRate * .45); this.muffle = filter('lowpass', this.openHz, .5); this.outdoor.connect(this.muffle); this.muffle.connect(this.duck);
    this.rooms = gain(1); this.rooms.connect(this.duck);
    this.shotsOut = gain(1); this.shotsOut.connect(this.outdoor);
    this.shotsIn = gain(1); this.shotsIn.connect(this.duck);
    this.ducked = [this.duck, this.shotsOut, this.shotsIn];
    // The hall: sends in, the towers' answer out (through the muffle indoors).
    this.hallIn = gain(1); this.hallTone = filter('lowpass', 3400, .5); this.hall = ctx.createConvolver(); this.hall.buffer = this.impulse();
    this.hallOut = gain(.5); this.hallIn.connect(this.hallTone); this.hallTone.connect(this.hall); this.hall.connect(this.hallOut); this.hallOut.connect(this.outdoor);

    // A bed: source -> ... -> its gain -> destination; keeps the gain for mix().
    const bed = (name, node, to = this.outdoor) => { this[name] = node; node.connect(to); return node; };
    const brown = loop(sound.noiseBuffer, .7), pink = loop(this.pink, 1.9), white = loop(this.white, .4);

    // Wind between the towers: a low band that rises in a gust, a thin whistle over it.
    this.windBand = filter('bandpass', 330, .55); brown.connect(this.windBand); this.windBand.connect(bed('windGain', gain(0)));
    this.whistleBand = filter('bandpass', 900, 9); white.connect(this.whistleBand); this.whistleBand.connect(bed('whistleGain', gain(0)));

    // Rain: soft and ambient. Pink noise, its bottom and its glare taken off,
    // and a faint high hiss that stays on the wet ground after the rain.
    const rainLow = filter('highpass', 300, .5), rainHigh = filter('lowpass', 5200, .5);
    pink.connect(rainLow); rainLow.connect(rainHigh); rainHigh.connect(bed('rainGain', gain(0)));
    const hiss = filter('bandpass', 4600, .6); white.connect(hiss); hiss.connect(bed('hissGain', gain(0)));
    // Drumming on car roofs and the bus: a mid band shaken by two irregular rattles.
    const drum = filter('bandpass', 640, 2); white.connect(drum); const drumAm = gain(.55); drum.connect(drumAm); drumAm.connect(bed('drumGain', gain(0)));
    this.rattle(drumAm.gain, osc('triangle', 11.3), osc('triangle', 17.9), .3, .22, gain);
    // Patter on awnings, shelters and tarps: brighter, finer, quicker.
    const patter = filter('bandpass', 3300, 1.1), patterHp = filter('highpass', 2200, .5); white.connect(patterHp); patterHp.connect(patter);
    const patterAm = gain(.55); patter.connect(patterAm); patterAm.connect(bed('patterGain', gain(0)));
    this.rattle(patterAm.gain, osc('triangle', 23.1), osc('triangle', 31.7), .3, .22, gain);
    // The gutters: a bubbling band whose pitch wanders.
    this.gutterBand = filter('bandpass', 430, 1.6); pink.connect(this.gutterBand); this.gutterBand.connect(bed('gutterGain', gain(0)));
    const wander = osc('sine', .9), wanderDepth = gain(150); wander.connect(wanderDepth); wanderDepth.connect(this.gutterBand.frequency);

    // The hum group (drops away now and then, sags with the power): the city's
    // mains hum with a slow beat, the electrical buzz near signs, HVAC by low
    // roofs, the market's bulbs, the vending machines.
    this.humGroup = gain(1); this.humGroup.connect(this.outdoor);
    const humLow = gain(1); bed('humGain', gain(0), this.humGroup);
    // (Low partials for the mains' weight, upper ones so a laptop's speakers carry it too.)
    for (const [type, f, g] of [['sine', 57.5, .5], ['sine', 58.9, .4], ['triangle', 116.4, .3], ['triangle', 232.9, .14], ['sine', 349.6, .05]]) { const o = osc(type, f), og = gain(g); o.connect(og); og.connect(humLow); }
    humLow.connect(this.humGain);
    this.buzzBand = filter('bandpass', 1900, 3.5); const buzzOsc = osc('sawtooth', 120); buzzOsc.connect(this.buzzBand); this.buzzBand.connect(bed('buzzGain', gain(0), this.humGroup));
    this.hvacA = osc('sawtooth', 55); this.hvacB = osc('sawtooth', 55.4); const hvacLp = filter('lowpass', 230, .6); this.hvacA.connect(hvacLp); this.hvacB.connect(hvacLp);
    hvacLp.connect(bed('hvacGain', gain(0), this.humGroup));
    const hvacFan = filter('bandpass', 620, .8); pink.connect(hvacFan); const hvacFanGain = gain(.9); hvacFan.connect(hvacFanGain); hvacFanGain.connect(this.hvacGain);
    this.marketBand = filter('bandpass', 2800, 2.5); const bulbs = osc('sawtooth', 100); bulbs.connect(this.marketBand); this.marketBand.connect(bed('marketGain', gain(0), this.humGroup));
    const vend = osc('sine', 100), vend2 = osc('sawtooth', 50), vendLp = filter('lowpass', 210, .7); vend.connect(vendLp); vend2.connect(vendLp); vendLp.connect(bed('vendingGain', gain(0), this.humGroup));

    // A far-off TV in the Stacks: a murmur of two formant bands, gated slowly.
    const tvA = filter('bandpass', 650, 2), tvB = filter('bandpass', 2400, 2.5), tvMix = gain(1); white.connect(tvA); white.connect(tvB); tvA.connect(tvMix); tvB.connect(tvMix);
    const tvAm = gain(.6); tvMix.connect(tvAm); tvAm.connect(bed('tvGain', gain(0)));
    this.rattle(tvAm.gain, osc('sine', 3.1), osc('sine', 5.3), .4, .3, gain);

    // Velvet Row's club through the walls: a kick and a bass, scheduled from the clock.
    this.kickOsc = osc('sine', 54); this.kickEnv = gain(0); const kickLp = filter('lowpass', 150, .7); this.kickOsc.connect(kickLp); kickLp.connect(this.kickEnv);
    this.bassOsc = osc('sawtooth', 41); this.bassEnv = gain(0); const bassLp = filter('lowpass', 120, .8); this.bassOsc.connect(bassLp); bassLp.connect(this.bassEnv);
    const clubMix = gain(1); this.kickEnv.connect(clubMix); this.bassEnv.connect(clubMix); clubMix.connect(bed('clubGain', gain(0)));
    // (Inside the club the thump is in the room, not through the walls.)
    clubMix.connect(bed('clubRoomGain', gain(0), this.rooms));

    // The train under the metro: a rumble that swells, a sub, and the rails' hiss.
    this.trainBand = filter('lowpass', 140, .6); brown.connect(this.trainBand); const trainMix = gain(1); this.trainBand.connect(trainMix);
    this.trainSub = osc('sine', 38); const trainSubGain = gain(.7); this.trainSub.connect(trainSubGain); trainSubGain.connect(trainMix);
    const rails = filter('bandpass', 1100, 1.5); white.connect(rails); const railsGain = gain(.05); rails.connect(railsGain); railsGain.connect(trainMix);
    trainMix.connect(bed('trainGain', gain(0)));

    // Steam vents' hiss and the smouldering car (hot metal in rain).
    const steamHp = filter('highpass', 1600, .5), steamBand = filter('bandpass', 4200, .7); white.connect(steamHp); steamHp.connect(steamBand); steamBand.connect(bed('steamGain', gain(0)));
    const hot = filter('bandpass', 2600, .5); white.connect(hot); const hotAm = gain(.6); hot.connect(hotAm); hotAm.connect(bed('smoulderGain', gain(0)));
    this.rattle(hotAm.gain, osc('triangle', 8.3), osc('triangle', 13.1), .4, .3, gain);

    // The car alarm: a square tone wailed by an LFO, in the world (not muffled
    // more than any placed sound), sent to the hall.
    this.alarmOsc = osc('square', 950); this.alarmLfo = osc('triangle', 1.8); this.alarmDepth = gain(380); this.alarmLfo.connect(this.alarmDepth); this.alarmDepth.connect(this.alarmOsc.frequency);
    const alarmBand = filter('bandpass', 1500, .9); this.alarmOsc.connect(alarmBand); alarmBand.connect(bed('alarmGain', gain(0), this.shotsOut));
    const alarmSend = gain(.5); this.alarmGain.connect(alarmSend); alarmSend.connect(this.hallIn);

    // The room tone: two oscillators, a noise band, per kind of interior.
    this.toneA = osc('sine', 60); this.toneB = osc('triangle', 120); this.toneMix = gain(1); this.toneLp = filter('lowpass', 420, .6);
    this.toneBGain = gain(.5); this.toneA.connect(this.toneMix); this.toneB.connect(this.toneBGain); this.toneBGain.connect(this.toneMix); this.toneMix.connect(this.toneLp);
    this.toneLp.connect(bed('roomGain', gain(0), this.rooms));
    this.roomHissBand = filter('bandpass', 900, 1); pink.connect(this.roomHissBand); this.roomHissGain = gain(.3); this.roomHissBand.connect(this.roomHissGain); this.roomHissGain.connect(this.roomGain);
    // Stage 5: the holograms' hum, the insects at the lamps, the interiors' machines (startLife, below).
    this.startLife({ gain, filter, osc, bed, brown, pink, white });
  }

  // Two slow, unrelated oscillators shaking a gain: the irregular rattle of
  // drops on metal, patter on canvas, a TV's murmur.
  rattle(param, a, b, depthA, depthB, gain) {
    const da = gain(depthA), db = gain(depthB); a.connect(da); da.connect(param); b.connect(db); db.connect(param);
  }

  // The hall's impulse response: a decaying noise tail, a pre-delay, and a few
  // early reflections (the towers answering). Stereo, made once (and again if
  // the preset changes).
  impulse() {
    const ctx = this.ctx, seconds = LUMEN_SOUND.hallSeconds[this.quality] ?? 1.9, rate = ctx.sampleRate, n = Math.floor(rate * seconds);
    const buffer = ctx.createBuffer(2, n, rate), pre = Math.floor(rate * .035);
    for (let c = 0; c < 2; c++) {
      const d = buffer.getChannelData(c); let lp = 0;
      for (let i = pre; i < n; i++) { const t = (i - pre) / (n - pre); lp += (Math.random() * 2 - 1 - lp) * (.55 - .4 * t); d[i] = lp * Math.exp(-4.6 * t) * .9; }
      for (const [at, amp] of [[.09, .9], [.17, .6], [.29, .45], [.43, .3]]) { const j = pre + Math.floor(rate * (at + c * .013)); if (j < n) d[j] += amp * (c ? -1 : 1); }
    }
    return buffer;
  }

  reset() {
    this.mixState = newMix();
    if (this.started) for (const g of this.ducked) { g.gain.cancelScheduledValues(this.ctx.currentTime); g.gain.setTargetAtTime(1, this.ctx.currentTime, .3); }
  }

  // --- Ducking under gunfire; the towers echo it ---------------------------
  event(e, level = 1) {
    if (this.started && e.type === 'mapReset') { this.reset(); return; }
    if (!this.started || !GUNFIRE.has(e.type) || !(level > HEARING.silent)) return;
    const now = this.ctx.currentTime, down = LUMEN_SOUND.duck + (1 - Math.min(1, level)) * .45;
    for (const g of this.ducked) {
      g.gain.cancelScheduledValues(now); g.gain.setValueAtTime(Math.min(g.gain.value, 1), now);
      g.gain.linearRampToValueAtTime(Math.min(g.gain.value, down), now + .06);
      g.gain.setTargetAtTime(1, now + .06 + LUMEN_SOUND.hold, LUMEN_SOUND.recover);
    }
    this.gunTail(level);
  }

  // The report coming back off the towers: a few dulling, fading bursts.
  gunTail(level) {
    if (!this.allow('tail', .12)) return;
    for (const [at, vol, hz] of [[.14, .075, 1900], [.31, .05, 1300], [.53, .032, 900]])
      this.noiseHit(at, .26, vol * level, 'lowpass', hz, .7, this.shotsOut, 'white', .4);
  }

  // --- Applying the beds -----------------------------------------------------
  // Ease a param toward a value (a NaN in the state must not throw inside Web Audio). A method, not a
  // closure made per mix, which runs ten times a second.
  to(param, value, tc = .25) { if (Number.isFinite(value)) param.setTargetAtTime(value, this.now, tc); }
  // Each tick (ten a second) the ambience hands over the state of everything.
  mix(m, clock) {
    if (!this.live) return;
    this.clockNow = clock; this.mixState = m;
    const now = this.ctx.currentTime, L = LUMEN_SOUND.level, M = LUMEN_SOUND.muffle;
    this.now = now;
    this.to(this.windGain.gain, L.wind * m.wind, .6); this.to(this.windBand.frequency, m.windHz, .5);
    this.to(this.whistleGain.gain, L.whistle * m.whistle, .4); this.to(this.whistleBand.frequency, m.whistleHz, .3);
    this.to(this.rainGain.gain, L.rain * m.rain, .5); this.to(this.hissGain.gain, L.hiss * m.hiss, .6);
    this.to(this.drumGain.gain, L.drum * m.drum, .3); this.to(this.patterGain.gain, L.patter * m.patter, .3);
    this.to(this.gutterGain.gain, L.gutter * m.gutter, .5);
    this.to(this.humGroup.gain, m.humDrop * (1 - .55 * m.sag), .12);
    this.to(this.humGain.gain, L.hum * m.hum, .4);
    this.to(this.buzzGain.gain, L.buzz * m.buzz * (1 - .9 * m.sag), .15);
    this.to(this.hvacGain.gain, L.hvac * m.hvac, .4); this.to(this.hvacA.frequency, m.hvacHz, 1.2); this.to(this.hvacB.frequency, m.hvacHz * 1.007, 1.2);
    this.to(this.marketGain.gain, L.market * m.market, .5); this.to(this.vendingGain.gain, L.vending * m.vending, .5);
    this.to(this.tvGain.gain, L.tv * m.tv, .6); this.to(this.clubGain.gain, L.club * m.club, .5); this.to(this.clubRoomGain.gain, L.club * 1.3 * m.clubIn, .4);
    this.to(this.trainGain.gain, L.train * m.train, .35); this.to(this.trainBand.frequency, 70 + 260 * m.train, .4); this.to(this.trainSub.frequency, 36 + 12 * m.train, .5);
    this.to(this.steamGain.gain, L.steam * m.steam, .15); this.to(this.smoulderGain.gain, L.smoulder * m.smoulder, .5);
    // The alarm: a pattern (wail, warble, whoop) and its level.
    const p = ALARM_PATTERNS[m.alarmPattern] || ALARM_PATTERNS[0];
    this.to(this.alarmGain.gain, L.alarm * m.alarm, .05); this.to(this.alarmLfo.frequency, p[0], .1); this.to(this.alarmDepth.gain, p[1], .1); this.to(this.alarmOsc.frequency, p[2], .1);
    // Indoors: the city and the rain through the walls; the room's own tone.
    const open = m.door, hz = Math.exp(Math.log(this.openHz) * (1 - m.muffle) + Math.log(M.shut + (M.open - M.shut) * open) * m.muffle);
    this.to(this.muffle.frequency, hz, .15); this.to(this.outdoor.gain, 1 + m.muffle * (M.gain + (M.gainOpen - M.gain) * open - 1), .15);
    if (m.roomKind !== this.roomKind) {
      this.roomKind = m.roomKind; const t = ROOM_TONES[m.roomKind] || ROOM_TONES.hum;
      this.to(this.toneA.frequency, t.f, .3); this.to(this.toneB.frequency, t.f * 2.01, .3); this.to(this.toneBGain.gain, t.h, .3); this.to(this.toneLp.frequency, t.lp, .3);
      this.to(this.roomHissBand.frequency, t.hiss, .3); this.roomHissBand.Q.setTargetAtTime(t.hissQ, now, .3); this.to(this.roomHissGain.gain, t.hissMix, .3);
    }
    this.to(this.roomGain.gain, L.room * m.room * (.1 + .9 * m.humDrop), .35);   // (the room's hum drops away with the city's)
    this.stepMode = m.stepMode;   // (for the wet footsteps: wetStep)
    if (m.club > .004 || m.clubIn > .004) this.clubBeats(clock, now);
  }

  // The club's beat, scheduled a little ahead from the weather clock (so it is
  // in time for everyone): a kick on every step, the bass on its pattern.
  clubBeats(clock, now) {
    const step = 60 / CLUB.bpm / 2, ahead = clock + .6;
    let i = this.clubNext; if (i * step < clock) i = Math.ceil(clock / step); // (beats already past are not played late)
    for (; i * step < ahead; i++) {
      const at = now + Math.max(0, i * step - clock), beat = i % 2 === 0, k = this.kickEnv.gain, b = this.bassEnv.gain;
      if (beat) { k.setValueAtTime(.0001, at); k.exponentialRampToValueAtTime(1, at + .01); k.exponentialRampToValueAtTime(.0001, at + .28); this.kickOsc.frequency.setValueAtTime(96, at); this.kickOsc.frequency.exponentialRampToValueAtTime(44, at + .12); }
      if (CLUB.bass[i % CLUB.bass.length]) { const f = [41, 41, 49, 36][Math.floor(i / 8) % 4]; this.bassOsc.frequency.setValueAtTime(f, at); b.setValueAtTime(.0001, at); b.exponentialRampToValueAtTime(.7, at + .02); b.exponentialRampToValueAtTime(.0001, at + step * .9); }
    }
    this.clubNext = i;
  }

  // --- Small synth pieces (one-shots), each to a bus ---------------------------
  // `wet`: how much goes to the hall as well. Refused when the budget is full.
  voice({ type = 'sine', from, to, length, volume, delay = 0, band = 0, Q = 1, wobble = 0, out = this.shotsOut, wet = 0, attack = 0 }) {
    if (this.active >= this.limit || !(volume > 0) || !(from > 0) || !(length > 0)) return false;
    const ctx = this.ctx, now = ctx.currentTime + delay, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(from, now); if (to !== from) o.frequency.exponentialRampToValueAtTime(Math.max(20, to), now + length);
    g.gain.setValueAtTime(.0001, now); g.gain.exponentialRampToValueAtTime(Math.max(.0002, volume), now + (attack || Math.min(.05, length * .2))); g.gain.exponentialRampToValueAtTime(.0001, now + length);
    const nodes = [o, g];
    if (band) { const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = band; f.Q.value = Q; o.connect(f); f.connect(g); nodes.push(f); } else o.connect(g);
    if (wobble) { const l = ctx.createOscillator(), d = ctx.createGain(); l.frequency.value = wobble; d.gain.value = from * .06; l.connect(d); d.connect(o.frequency); l.start(now); l.stop(now + length + .02); nodes.push(l, d); }
    g.connect(out); if (wet > 0) { const s = ctx.createGain(); s.gain.value = wet; g.connect(s); s.connect(this.hallIn); nodes.push(s); }
    o.start(now); o.stop(now + length + .02); this.active++;
    o.onended = () => { this.active--; for (const n of nodes) n.disconnect(); };
    return true;
  }
  // A burst of noise through one filter, its centre optionally sweeping to `to`.
  noiseHit(delay, length, volume, type, frequency, Q, out = this.shotsOut, colour = 'white', wet = 0, to = 0) {
    if (this.active >= this.limit || !(volume > 0) || !(length > 0)) return false;
    const ctx = this.ctx, now = ctx.currentTime + delay, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = colour === 'brown' ? this.sound.noiseBuffer : colour === 'pink' ? this.pink : this.white; f.type = type; f.frequency.setValueAtTime(frequency, now); f.Q.value = Q;
    if (to) f.frequency.exponentialRampToValueAtTime(Math.max(20, to), now + length);
    g.gain.setValueAtTime(.0001, now); g.gain.exponentialRampToValueAtTime(Math.max(.0002, volume), now + Math.min(.02, length * .2)); g.gain.exponentialRampToValueAtTime(.0001, now + length);
    const nodes = [s, f, g]; s.connect(f); f.connect(g); g.connect(out);
    if (wet > 0) { const w = ctx.createGain(); w.gain.value = wet; g.connect(w); w.connect(this.hallIn); nodes.push(w); }
    s.start(now, Math.random() * 1.5); s.stop(now + length + .02); this.active++;
    s.onended = () => { this.active--; for (const n of nodes) n.disconnect(); };
    return true;
  }
  click(delay, length, volume, frequency, out = this.shotsOut, wet = 0) { return this.noiseHit(delay, length, volume, 'bandpass', frequency, 2.5, out, 'white', wet); }
  // The bus to use for a sound that is in a room (`inside`: the listener is in it) or outside.
  bus(inside) { return inside ? this.shotsIn : this.shotsOut; }
  // A placed sound's level: the listener's distance, then a rate limit per kind.
  allow(kind, gap = .05) {
    if (!this.live) return false;
    const now = this.ctx.currentTime; if (now - (this.lastKind[kind] ?? -9) < gap) return false; this.lastKind[kind] = now; return true;
  }

  // --- The placed sounds -----------------------------------------------------
  // The convenience store's door chime: two bell notes, ding then dong.
  chime(level, inside = false) {
    if (!this.allow('chime', .5) || !(level >= .004)) return;
    const out = this.bus(inside), wet = inside ? .15 : .55;
    for (const [at, f] of [[0, 988], [.34, 740]]) {
      this.voice({ type: 'sine', from: f, to: f * .995, length: 1.1, volume: .05 * level, delay: at, out, wet, attack: .006 });
      this.voice({ type: 'sine', from: f * 2.76, to: f * 2.75, length: .5, volume: .014 * level, delay: at, out, wet, attack: .004 });
    }
  }
  // A relay ticking (hazard lights): a high tick then a low tock.
  tick(level, high = true, inside = false) {
    if (!this.allow('tick', .12) || !(level >= .004)) return;
    const out = this.bus(inside);
    this.noiseHit(0, .018, .13 * level, 'bandpass', high ? 3100 : 2300, 3, out, 'white', .15);
    this.voice({ type: 'triangle', from: high ? 1250 : 940, to: high ? 900 : 700, length: .022, volume: .03 * level, out });
  }
  // A pedestrian signal: the walk chirp (two short notes) or the flashing hand's tick.
  chirp(level, walk = true) {
    if (!this.allow('chirp', .09) || !(level >= .004)) return;
    if (walk) { this.voice({ type: 'sine', from: 1480, to: 1480, length: .07, volume: .028 * level, wet: .3, attack: .004 }); this.voice({ type: 'sine', from: 1110, to: 1110, length: .09, volume: .026 * level, delay: .085, wet: .3, attack: .004 }); }
    else this.voice({ type: 'sine', from: 2000, to: 1950, length: .04, volume: .02 * level, wet: .2, attack: .003 });
  }
  // The bus's doors: a pneumatic hiss, a thunk, and the chirp of the door light.
  busDoor(level, opening = true) {
    if (!this.allow('busDoor', .6) || !(level >= .004)) return;
    const len = opening ? .95 : .6;
    this.noiseHit(0, len, .07 * level, 'bandpass', 3600, .6, this.shotsOut, 'white', .35, opening ? 5200 : 2400);
    this.noiseHit(0, len * .8, .03 * level, 'highpass', 2200, .5, this.shotsOut, 'white', .2);
    this.voice({ type: 'sine', from: 96, to: 52, length: .14, volume: .045 * level, delay: opening ? .02 : len - .1, wet: .25 });
    this.voice({ type: 'sine', from: 1320, to: 1320, length: .12, volume: .02 * level, delay: opening ? 0 : len + .05, wet: .2 });
  }
  // A burst of sparks (the crackling EV, the downed cable, a broken sign): a
  // few sharp ticks and an arc's buzz. Meeting water they sizzle too.
  sparks(level, wet = 0, inside = false) {
    if (!this.allow('sparks', .1) || !(level >= .004)) return;
    const out = this.bus(inside), n = 2 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) this.noiseHit(i * (.025 + Math.random() * .03), .022 + Math.random() * .02, (.06 + Math.random() * .04) * level, 'highpass', 2600 + Math.random() * 1800, .7, out, 'white', .25);
    this.voice({ type: 'sawtooth', from: 112 + Math.random() * 20, to: 96, length: .1 + Math.random() * .1, volume: .012 * level, band: 1300, Q: 3, out, wet: .2 });
    this.voice({ type: 'sine', from: 3300 + Math.random() * 900, to: 2400, length: .03, volume: .018 * level, out });
    if (wet > .2) this.noiseHit(.03, .32, .032 * level * wet, 'bandpass', 6200, 1.2, out, 'white', .15);
  }
  // A tarp flapping loose in a gust: one to three cracks of canvas.
  flap(level, power = .5) {
    if (!this.allow('flap', .18) || !(level >= .004)) return;
    const n = 1 + Math.floor(power * 2.6);
    for (let i = 0; i < n; i++) {
      const at = i * (.09 + Math.random() * .06), v = (.05 + .04 * power) * level * (1 - i * .18);
      this.noiseHit(at, .12, v, 'bandpass', 480 + Math.random() * 260, .8, this.shotsOut, 'white', .25);
      this.voice({ type: 'triangle', from: 130, to: 70, length: .08, volume: v * .35, delay: at });
    }
  }
  // A drip in a pipe or off an awning: a small round drop; `metal`: it rings.
  drip(level, metal = false, inside = false) {
    if (!this.allow('drip', .08) || !(level >= .004)) return;
    const out = this.bus(inside), f = 1500 + Math.random() * 900;
    this.voice({ type: 'sine', from: f, to: f * .55, length: .05, volume: .026 * level, out, wet: metal ? .7 : .3, attack: .003 });
    if (metal) { const r = 1250 + Math.random() * 500; this.voice({ type: 'sine', from: r, to: r, length: .4, volume: .011 * level, delay: .01, out, wet: .8, attack: .004 }); this.voice({ type: 'sine', from: r * 1.52, to: r * 1.52, length: .25, volume: .006 * level, delay: .01, out, wet: .8, attack: .004 }); }
  }
  // A puddle taking a drop or a round: a plink, and for a heavier one a splash.
  plink(level, strength = .3) {
    if (!this.allow('plink', .05) || !(level >= .004)) return;
    const f = 1500 + Math.random() * 1500 - strength * 600;
    this.voice({ type: 'sine', from: f * .7, to: f * 1.4, length: .045 + strength * .05, volume: .02 * level, wet: .25, attack: .003 });
    if (strength > .5) this.noiseHit(0, .14, .05 * level * strength, 'bandpass', 1500, .9, this.shotsOut, 'white', .2);
  }
  // A garbled ad jingle off a big screen: a stepped little arpeggio in a square
  // wave, notes dropped, stuttered and bent (the frame is torn), the towers
  // sending it back. One oscillator, its pitch and gate scheduled.
  jingle(level, seed, inside = false) {
    if (!this.allow('jingle', 1) || !(level >= .004) || this.active >= this.limit) return;
    const ctx = this.ctx, now = ctx.currentTime + .02, out = this.bus(inside), o = ctx.createOscillator(), lp = ctx.createBiquadFilter(), g = ctx.createGain(), send = ctx.createGain();
    o.type = 'square'; lp.type = 'lowpass'; lp.frequency.value = 1700; lp.Q.value = 1.2; send.gain.value = inside ? .2 : .9;
    const scale = [0, 3, 5, 7, 10, 12, 15], root = 330 * Math.pow(2, Math.floor(hash01(seed, 1) * 5) / 12), count = 6 + Math.floor(hash01(seed, 2) * 4), step = .11 + hash01(seed, 3) * .05;
    let t = now, last = root;
    g.gain.setValueAtTime(.0001, now);
    for (let i = 0; i < count; i++) {
      const r = hash01(seed, 10 + i), f = root * Math.pow(2, scale[Math.floor(hash01(seed, 30 + i) * scale.length)] / 12);
      if (r < .14) { t += step; continue; }                                    // a dropped note
      const reps = r > .84 ? 3 : 1, len = reps > 1 ? step / 4 : step * .85;    // a stutter
      for (let k = 0; k < reps; k++) {
        o.frequency.setValueAtTime(f, t); if (r > .5 && r < .66) o.frequency.exponentialRampToValueAtTime(f * .7, t + len); // a bend down
        g.gain.setValueAtTime(.0001, t); g.gain.linearRampToValueAtTime(.022 * level, t + .006); g.gain.setValueAtTime(.022 * level, t + len * .7); g.gain.linearRampToValueAtTime(.0001, t + len);
        t += reps > 1 ? step / 3 : step; last = f;
      }
    }
    void last;
    const end = t + .05; o.connect(lp); lp.connect(g); g.connect(out); g.connect(send); send.connect(this.hallIn);
    o.start(now); o.stop(end); this.active++;
    o.onended = () => { this.active--; for (const n of [o, lp, g, send]) n.disconnect(); };
  }
  // A phone ringing, unanswered: two trilled rings.
  phone(level, inside = false) {
    if (!this.allow('phone', 2) || !(level >= .004) || this.active + 2 > this.limit) return;
    const ctx = this.ctx, now = ctx.currentTime + .02, out = this.bus(inside), a = ctx.createOscillator(), b = ctx.createOscillator(), lfo = ctx.createOscillator();
    const trem = ctx.createGain(), lfoDepth = ctx.createGain(), env = ctx.createGain(), band = ctx.createBiquadFilter(), send = ctx.createGain();
    a.type = 'sine'; a.frequency.value = 1180; b.type = 'sine'; b.frequency.value = 1420; lfo.type = 'square'; lfo.frequency.value = 20;
    trem.gain.value = .5; lfoDepth.gain.value = .5; band.type = 'bandpass'; band.frequency.value = 1300; band.Q.value = .7; send.gain.value = inside ? .15 : .6;
    lfo.connect(lfoDepth); lfoDepth.connect(trem.gain); a.connect(band); b.connect(band); band.connect(trem); trem.connect(env); env.connect(out); env.connect(send); send.connect(this.hallIn);
    env.gain.setValueAtTime(.0001, now);
    for (const at of [0, 1.2]) { env.gain.linearRampToValueAtTime(.04 * level, now + at + .02); env.gain.setValueAtTime(.04 * level, now + at + .9); env.gain.linearRampToValueAtTime(.0001, now + at + .95); }
    const end = now + 2.3; for (const s of [a, b, lfo]) { s.start(now); s.stop(end); } this.active += 2;
    a.onended = () => { this.active -= 2; for (const n of [a, b, lfo, trem, lfoDepth, env, band, send]) n.disconnect(); };
  }
  // A far siren that never comes closer: a slow wail, dull, swelling and fading.
  siren(level) {
    if (!this.allow('siren', 5) || !(level >= .002) || this.active >= this.limit) return;
    const ctx = this.ctx, now = ctx.currentTime + .05, o = ctx.createOscillator(), lp = ctx.createBiquadFilter(), g = ctx.createGain(), send = ctx.createGain(), len = 15;
    o.type = 'sawtooth'; lp.type = 'lowpass'; lp.frequency.value = 950; lp.Q.value = .6; send.gain.value = 1;
    for (let t = 0; t < len; t += 2.6) { o.frequency.setValueAtTime(600, now + t); o.frequency.linearRampToValueAtTime(880, now + t + 1.3); o.frequency.linearRampToValueAtTime(600, now + t + 2.6); }
    g.gain.setValueAtTime(.0001, now); g.gain.linearRampToValueAtTime(.03 * level, now + 5); g.gain.setValueAtTime(.03 * level, now + 8); g.gain.linearRampToValueAtTime(.0001, now + len);
    o.connect(lp); lp.connect(g); g.connect(this.shotsOut); g.connect(send); send.connect(this.hallIn);
    o.start(now); o.stop(now + len + .05); this.active++;
    o.onended = () => { this.active--; for (const n of [o, lp, g, send]) n.disconnect(); };
  }
  // Wheels on rail under the street: a soft double clack.
  clack(level) {
    if (!this.allow('clack', .12) || !(level >= .004)) return;
    this.noiseHit(0, .05, .15 * level, 'bandpass', 900, 2, this.shotsOut, 'white', .3);
    this.noiseHit(.075, .05, .1 * level, 'bandpass', 760, 2, this.shotsOut, 'white', .3);
  }
  // Thunder between the towers. `level`: how loud from here (the strike's
  // strength, heard from wherever you are); the roll is repeated, softer and
  // duller, as it bounces down the streets.
  thunder(level, power = .7) {
    if (!this.live || !(level >= .004)) return;
    const out = this.shotsOut, saved = this.limit; this.limit += 6;
    this.noiseHit(0, .22, .16 * level * power, 'bandpass', 1500, .6, out, 'white', .3);
    for (const [at, v, from, len] of [[.02, 1, 900, 3.6], [.9, .5, 620, 3.2], [1.9, .3, 470, 2.8], [3.1, .18, 360, 2.4]])
      this.noiseHit(at, len, .5 * level * power * v, 'lowpass', from, .5, out, 'brown', .5, 70);
    this.voice({ type: 'sine', from: 50, to: 28, length: 2.8, volume: .2 * level * power, delay: .05, out, attack: .15 });
    this.limit = saved;
  }
  // The power sagging: a hum sliding down, and the neon faltering with it.
  sagDown() {
    if (!this.live) return;
    this.voice({ type: 'sawtooth', from: 150, to: 46, length: 1.15, volume: .05, band: 320, Q: 1.2, wet: .3, attack: .05 });
    this.voice({ type: 'sine', from: 62, to: 30, length: 1.3, volume: .08, wet: .2, attack: .05 });
    this.noiseHit(0, .1, .04, 'bandpass', 2400, 1.5, this.shotsOut);
  }
  // ...and coming back: the hum rises, a couple of stray zaps as the tubes catch.
  sagBack() {
    if (!this.live) return;
    this.voice({ type: 'sawtooth', from: 55, to: 130, length: .55, volume: .04, band: 320, Q: 1.2, wet: .25, attack: .05 });
    for (const at of [.04, .13, .22, .31]) this.noiseHit(at, .03, .05 * (1 - at), 'highpass', 3200, .7, this.shotsOut, 'white', .2);
  }
  // A sign or screen breaking (within ~15 m): a pop, tinkling glass, sparks.
  signBreak(level, screen = false) {
    if (!this.live || !(level >= .004)) return;
    this.voice({ type: 'sine', from: 340, to: 80, length: .07, volume: .1 * level, wet: .3, attack: .003 });
    this.noiseHit(0, .09, .09 * level, 'bandpass', 2300, 1.1, this.shotsOut, 'white', .3);
    for (let i = 0; i < 4; i++) this.voice({ type: 'sine', from: 3200 + Math.random() * 2400, to: 2600, length: .12, volume: .012 * level, delay: .05 + i * (.03 + Math.random() * .04), wet: .5, attack: .002 });
    this.lastKind.sparks = -9; this.sparks(level * .9, this.wetness);
    if (screen) this.voice({ type: 'sawtooth', from: 200, to: 90, length: .3, volume: .015 * level, delay: .04, band: 900, Q: 2 });
  }

  // --- Life (pigeons and rats; the life system calls these) -------------------
  // Pigeons: a coo (three throaty notes), a clatter of wings on take-off (n
  // birds), a single clap, a soft landing.
  pigeon(kind, level, n = 1) {
    if (!this.live || !(level > HEARING.silent)) return;
    if (kind === 'coo') {
      if (!this.allow('coo', .25)) return;
      const f = 430 + Math.random() * 90;
      for (const [at, a, b, len] of [[0, f, f * 1.18, .14], [.17, f * 1.12, f * .9, .18], [.38, f * 1.05, f * .82, .3]])
        this.voice({ type: 'triangle', from: a, to: b, length: len, volume: .075 * level, delay: at, band: 780, Q: 2, wobble: 26, wet: .25, attack: .03 });
    } else if (kind === 'flap' || kind === 'clatter') {
      if (!this.allow('clap', .1)) return;
      const k = Math.min(9, 3 + Math.round(n * 2));
      for (let i = 0; i < k; i++) this.noiseHit(i * (.045 + Math.random() * .045), .06, .09 * level, 'bandpass', 520 + Math.random() * 380, 1.2, this.shotsOut, 'white', .4);
    } else if (kind === 'clap') { if (this.allow('clap', .1)) this.noiseHit(0, .07, .04 * level, 'bandpass', 560, 1.2, this.shotsOut, 'white', .3); }
    else if (kind === 'land') { if (this.allow('land', .2)) { this.noiseHit(0, .06, .026 * level, 'bandpass', 520, 1.2); this.noiseHit(.07, .05, .018 * level, 'bandpass', 480, 1.2); } }
  }
  // Rats: a squeak (a quick glide up, two of them), a scrabble of claws, a bolt (both).
  rat(kind, level) {
    if (!this.live || !(level > HEARING.silent)) return;
    if (kind === 'squeak' || kind === 'bolt') {
      if (this.allow('squeak', .3)) for (const [at, f] of [[0, 3100 + Math.random() * 600], [.075, 2800 + Math.random() * 500]])
        this.voice({ type: 'sine', from: f, to: f * 1.5, length: .05, volume: .016 * level, delay: at, attack: .004 });
    }
    if (kind === 'scrabble' || kind === 'bolt') {
      if (!this.allow('scrabble', .25)) return;
      const k = 5 + Math.floor(Math.random() * 4);
      for (let i = 0; i < k; i++) this.noiseHit(.02 + i * (.028 + Math.random() * .02), .012, .028 * level, 'highpass', 4200, .7);
    }
  }

  // --- Water (the water effects' onSound; the same kinds as Hollow Wick's) ------
  water(kind, level, strength = 1) {
    if (!this.live || !(level > HEARING.silent)) return;
    if (!this.allow(`water-${kind}`, kind === 'splash' ? .03 : .06)) return;
    const out = this.shotsOut, s = Math.max(.2, Math.min(2, strength));
    if (kind === 'wadeStep') { this.noiseHit(0, .2, .06 * level * (.6 + s * .4), 'lowpass', 850, .7, out, 'brown'); this.noiseHit(.02, .12, .03 * level, 'bandpass', 1600, 1.5, out); return; }
    if (kind === 'wadeDodge') { this.noiseHit(0, .45, .12 * level * (.6 + s * .4), 'lowpass', 1000, .7, out, 'brown'); this.noiseHit(.03, .3, .06 * level, 'bandpass', 2200, 1, out); this.drops(.08, 5, level * .8); return; }
    if (kind === 'splash') { this.noiseHit(0, .12 + s * .05, .05 * level * s, 'bandpass', 1300, .9, out, 'white', .15); this.drops(.04, 2 + Math.round(s * 2), level * .6); return; }
    if (kind === 'spout') { this.voice({ type: 'sine', from: 80, to: 36, length: .35, volume: .16 * level, out }); this.noiseHit(0, .7, .14 * level, 'lowpass', 900, .6, out, 'brown'); this.noiseHit(.15, .6, .06 * level, 'bandpass', 2400, .8, out); this.drops(.35, 8, level); return; }
    if (kind === 'plop') { this.voice({ type: 'sine', from: 260, to: 820, length: .07, volume: .07 * level, out }); this.noiseHit(0, .05, .03 * level, 'bandpass', 1400, 2, out); return; }
    if (kind === 'sizzle') { this.noiseHit(0, .5, .05 * level, 'bandpass', 6400, 1.1, out, 'white', .2); return; }
    if (kind === 'ripple' || kind === 'plink') this.plink(level, s * .3);
  }
  drops(start, n, level) { for (let i = 0; i < n; i++) this.voice({ type: 'sine', from: 1400 + Math.random() * 1400, to: 700, length: .04, volume: .02 * level, delay: start + Math.random() * .35 }); }

  // Your own footstep on wet ground (mode 1) or through a puddle (mode 2), on
  // top of the dry thud audio.js plays: a splash, and in a puddle drops flying.
  wetStep(mode, strong = false) {
    if (!this.live || !mode) return;
    const out = this.sound.buses.effects, k = strong ? 1.5 : 1;
    if (mode === 2) {
      this.noiseHit(0, .16, .13 * k, 'bandpass', 1500, 1.1, out, 'white', .1);
      this.noiseHit(.008, .14, .1 * k, 'lowpass', 850, .7, out, 'brown');
      this.drops(.04, strong ? 5 : 3, .5);
    } else this.noiseHit(0, .09, .07 * k, 'bandpass', 2400, 1.1, out);
  }
}

// Steps of the car alarm's patterns: [wail rate Hz, depth Hz, centre Hz].
export const ALARM_PATTERNS = Object.freeze([[1.8, 380, 950], [7, 240, 1200], [3.4, 420, 1050]]);

// A buffer of noise: white, or pink (Paul Kellet's filter), a few seconds.
export function noiseBuffer(ctx, seconds, colour = 'white') {
  const n = Math.floor(ctx.sampleRate * seconds), buffer = ctx.createBuffer(1, n, ctx.sampleRate), d = buffer.getChannelData(0);
  if (colour === 'white') { for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; return buffer; }
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < n; i++) {
    const w = Math.random() * 2 - 1;
    b0 = .99886 * b0 + w * .0555179; b1 = .99332 * b1 + w * .0750759; b2 = .969 * b2 + w * .153852; b3 = .8665 * b3 + w * .3104856; b4 = .55 * b4 + w * .5329522; b5 = -.7616 * b5 - w * .016898;
    d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * .5362) * .11; b6 = w * .115926;
  }
  return buffer;
}


// --- Stage 5: the life in the lights and the interiors (s3) ----------------------
// Beds: the holograms' hum near a projection (two detuned tones and a thin
// buzz, trembling; on the hum group, so it drops away and sags with the
// city's power), the insects' whine at the lamps (very soft), and the
// interiors' machines, heard in their rooms (on the room bus: unmuffled, they
// are in the room with you; faint through the walls): a pot's simmer, a TV's
// static hiss, the washer's rumble and its drum's thump, the cold room's
// compressor (on and off: compressorAt), the pachinko rows' rattle, the
// servers' fans. One-shots (through `voice`/`noiseHit`, so under the preset's
// voice budget): a hologram's glitch crackle, a pot's bubble, a run of
// pachinko balls, a cabinet's attract tune. The club's bass is the stage 3 bed.
export const LUMEN_LIFE_SOUND = Object.freeze({
  level: Object.freeze({ holo: .022, insects: .007, simmer: .03, tv: .018, washer: .04, compressor: .022, pachinko: .024, servers: .02 }),
  // The cold room's compressor: on `on` s of every `period`, easing over `ramp`.
  compressor: Object.freeze({ period: 57, on: 38, ramp: 1.2, offset: 11 }),
});
// The compressor's state at `clock`: 0 off .. 1 running.
export function compressorAt(clock) {
  const C = LUMEN_LIFE_SOUND.compressor, p = ((((clock + C.offset) % C.period) + C.period) % C.period);
  if (p < C.ramp) return p / C.ramp;
  if (p < C.on) return 1;
  if (p < C.on + C.ramp) return 1 - (p - C.on) / C.ramp;
  return 0;
}
// The life beds' levels, one object reused (0..1 each).
export function newLifeMix() { return { holo: 0, holoHz: 172, insects: 0, simmer: 0, tv: 0, washer: 0, compressor: 0, pachinko: 0, servers: 0 }; }

Object.assign(LumenSound.prototype, {
  startLife({ gain, filter, osc, bed, brown, pink, white }) {
    // The holograms' hum: 172 and 175.3 Hz beating, an octave, a buzz band, a tremble.
    const holoMix = gain(1), holoLp = filter('lowpass', 900, .6);
    this.holoA = osc('sine', 172); this.holoB = osc('sine', 175.3); const holoC = osc('triangle', 344), holoCg = gain(.3);
    this.holoA.connect(holoLp); this.holoB.connect(holoLp); holoC.connect(holoCg); holoCg.connect(holoLp); holoLp.connect(holoMix);
    const holoBuzz = filter('bandpass', 2400, 4), holoSaw = osc('sawtooth', 86), holoBuzzG = gain(.25); holoSaw.connect(holoBuzz); holoBuzz.connect(holoBuzzG); holoBuzzG.connect(holoMix);
    const holoAm = gain(.8); holoMix.connect(holoAm); holoAm.connect(bed('holoGain', gain(0), this.humGroup));
    this.rattle(holoAm.gain, osc('sine', 5.3), osc('sine', 7.9), .15, .1, gain);
    // Insects at the lamps: a thin whine wavering on a wing beat.
    const whine = osc('sine', 560), fm = osc('sine', 190), fmDepth = gain(38); fm.connect(fmDepth); fmDepth.connect(whine.frequency);
    const wings = gain(.5); whine.connect(wings); this.rattle(wings.gain, osc('triangle', 23), osc('sine', 3.1), .4, .2, gain);
    wings.connect(bed('insectGain', gain(0)));
    // The interiors' machines (on the room bus).
    const simmer = filter('bandpass', 900, .8); brown.connect(simmer); const simmerAm = gain(.5); simmer.connect(simmerAm); simmerAm.connect(bed('simmerGain', gain(0), this.rooms));
    this.rattle(simmerAm.gain, osc('triangle', 7.1), osc('triangle', 11.3), .35, .3, gain);
    const tv = filter('bandpass', 5200, .7); white.connect(tv); tv.connect(bed('tvHissGain', gain(0), this.rooms));
    const washerLp = filter('lowpass', 170, .7); brown.connect(washerLp); const washerHum = osc('sine', 48), washerHumG = gain(.5); washerHum.connect(washerHumG);
    const washerAm = gain(.55); washerLp.connect(washerAm); washerHumG.connect(washerAm); washerAm.connect(bed('washerGain', gain(0), this.rooms));
    this.rattle(washerAm.gain, osc('sine', .9), osc('sine', 1.8), .45, .15, gain); // (the drum's thump as it turns)
    const compA = osc('sawtooth', 49), compB = osc('sawtooth', 98.6), compLp = filter('lowpass', 190, .7), compBg = gain(.4); compA.connect(compLp); compB.connect(compBg); compBg.connect(compLp);
    compLp.connect(bed('compressorGain', gain(0), this.rooms));
    const balls = filter('bandpass', 6000, 2), ballsHp = filter('highpass', 3500, .6); white.connect(ballsHp); ballsHp.connect(balls); const ballsAm = gain(.5); balls.connect(ballsAm);
    ballsAm.connect(bed('pachinkoGain', gain(0), this.rooms)); this.rattle(ballsAm.gain, osc('triangle', 31), osc('triangle', 47), .4, .3, gain);
    const fan = filter('bandpass', 1100, .6); pink.connect(fan); const fanWhine = osc('sine', 176), fanWhineG = gain(.08); fanWhine.connect(fanWhineG);
    const fanMix = gain(1); fan.connect(fanMix); fanWhineG.connect(fanMix); fanMix.connect(bed('serverFanGain', gain(0), this.rooms));
  },
  // The life beds, at the ambience's tick (ten a second).
  lifeMix(l) {
    if (!this.live || !this.holoGain) return;
    const L = LUMEN_LIFE_SOUND.level; this.now = this.ctx.currentTime;
    this.to(this.holoGain.gain, L.holo * l.holo, .3); this.to(this.holoA.frequency, l.holoHz, .8); this.to(this.holoB.frequency, l.holoHz * 1.019, .8);
    this.to(this.insectGain.gain, L.insects * l.insects, .4);
    this.to(this.simmerGain.gain, L.simmer * l.simmer, .4); this.to(this.tvHissGain.gain, L.tv * l.tv, .3);
    this.to(this.washerGain.gain, L.washer * l.washer, .5); this.to(this.compressorGain.gain, L.compressor * l.compressor, .6);
    this.to(this.pachinkoGain.gain, L.pachinko * l.pachinko, .4); this.to(this.serverFanGain.gain, L.servers * l.servers, .5);
  },
  // A hologram glitching: a crackle of ticks, a falling zap, a blip.
  holoGlitch(level) {
    if (!this.allow('holoGlitch', .25) || !(level >= .004)) return;
    const n = 3 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) this.noiseHit(i * (.02 + Math.random() * .035), .018 + Math.random() * .02, (.035 + Math.random() * .03) * level, 'highpass', 3000 + Math.random() * 2500, .7, this.shotsOut, 'white', .3);
    this.voice({ type: 'sawtooth', from: 190, to: 60, length: .22, volume: .016 * level, band: 700, Q: 2.5, wet: .35 });
    this.voice({ type: 'square', from: 1400 + Math.random() * 500, to: 700, length: .06, volume: .008 * level, delay: .05, wet: .3 });
  },
  // A bubble breaking in a simmering pot.
  blup(level, inside = true) {
    if (!this.allow('blup', .12) || !(level >= .004)) return;
    const f = 260 + Math.random() * 220;
    this.voice({ type: 'sine', from: f, to: f * 2.4, length: .05 + Math.random() * .04, volume: .03 * level, out: this.bus(inside), attack: .004 });
  },
  // A run of pachinko balls down the pins: bright pings, close together.
  pachinkoBalls(level, inside = true) {
    if (!this.allow('pachinko', .3) || !(level >= .004)) return;
    const n = 5 + Math.floor(Math.random() * 7), out = this.bus(inside);
    let at = 0;
    for (let i = 0; i < n; i++) { const f = 2800 + Math.random() * 1800; this.voice({ type: 'sine', from: f, to: f * .96, length: .05, volume: .012 * level, delay: at, out, attack: .002, wet: .2 }); at += .025 + Math.random() * .045; }
  },
  // A cabinet's attract tune: a quick bright arpeggio in a square wave.
  arcadeTune(level, seed, inside = true) {
    if (!this.allow('arcadeTune', 2.5) || !(level >= .004)) return;
    const out = this.bus(inside), scale = [0, 4, 7, 12, 16, 19, 24], root = 523 * Math.pow(2, Math.floor(hash01(seed, 1) * 4) / 12), step = .075;
    for (let i = 0; i < 8; i++) {
      const f = root * Math.pow(2, scale[Math.floor(hash01(seed, 20 + i) * scale.length)] / 12);
      this.voice({ type: 'square', from: f, to: f, length: step * .9, volume: .008 * level, delay: i * step, band: 2000, Q: .8, out, attack: .004 });
    }
  },
});
