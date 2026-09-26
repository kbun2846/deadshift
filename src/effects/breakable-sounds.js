// The break sounds of Hollow Wick's breakables (task s2-breakables), played by
// audio.js (Soundscape) from its propBreak branch. Every sound is built from
// the Soundscape's own synth voices (tone, noise, impact: no sound files),
// and goes through its bus and distance gain like every other event.
//   tone(start Hz, end Hz, seconds, volume, wave, delay)
//   noise(seconds, volume, highpass Hz)            (starts now)
//   impact(seconds, volume, bandpass Hz, bus, delay)
import { HOLLOW_BREAKABLES } from '../world/hollow-breakables.js';

export const hasBreakSound = type => !!HOLLOW_BREAKABLES[type];

// Planks letting go: the shared crack under the wooden ones.
function crack(s, weight = 1) {
  s.impact(.07, .2 * weight, 1300); s.impact(.14, .06 * weight, 3000);
  s.tone(180, 90, .09, .07 * weight, 'triangle'); s.tone(420, 190, .05, .025 * weight, 'triangle', .03);
}
// Things landing a beat after the break: `n` knocks from `delay`, `spacing`
// apart, around `freq` Hz.
function knocks(s, n, { delay = .12, spacing = .08, freq = 700, volume = .05, body = 0 } = {}) {
  for (let i = 0; i < n; i++) {
    const at = delay + i * spacing + Math.random() * spacing * .5;
    s.impact(.03, volume * (1 - i / (n + 2)), freq * (.8 + Math.random() * .5), 'effects', at);
    if (body) s.tone(body * (.9 + Math.random() * .3), body * .5, .05, .02, 'triangle', at);
  }
}

const SOUNDS = {
  // A wet, hollow thunk, a squelch and the seeds pattering down.
  pumpkin(s) {
    s.impact(.12, .22, 520); s.tone(170, 62, .16, .11, 'sine'); s.tone(95, 50, .2, .06, 'triangle', .01);
    s.noise(.14, .06, 1600);
    knocks(s, 5, { delay: .1, spacing: .05, freq: 1900, volume: .025 });
  },
  // Staves bursting, then the cider: a splash and a few glugs.
  ciderKeg(s) {
    crack(s, 1.1); s.tone(120, 60, .15, .08, 'triangle');
    s.noise(.5, .07, 1400);
    for (let i = 0; i < 4; i++) s.tone(430 - i * 40, 250 - i * 25, .07, .045, 'sine', .12 + i * .1);
    knocks(s, 2, { delay: .3, spacing: .2, freq: 2600, volume: .03 });
  },
  // Slats cracking, then apples thudding and rolling away.
  appleCrate(s) {
    crack(s); knocks(s, 6, { delay: .1, spacing: .06, freq: 420, volume: .07, body: 140 });
  },
  // Sacking tearing (a fast run of dry snaps), then the grain hissing out.
  grainSacks(s) {
    s.impact(.06, .1, 900);
    for (let i = 0; i < 7; i++) s.impact(.02, .06, 2600 + Math.random() * 1400, 'effects', i * .014);
    s.noise(1.1, .045, 3200); s.noise(.35, .03, 900);
  },
  // Timber giving, shingles clattering and the soft rush of feathers.
  chickenCoop(s) {
    crack(s, 1.2); s.impact(.1, .12, 700, 'effects', .02);
    knocks(s, 4, { delay: .08, spacing: .06, freq: 1500, volume: .04, body: 220 });
    s.noise(.6, .04, 2200);
  },
  // A crunch of straw, and the swarm: a low buzz that swells and fades.
  beeSkep(s) {
    s.impact(.09, .1, 1600); s.noise(.2, .06, 2400); s.tone(140, 55, .08, .035, 'triangle');
    for (let i = 0; i < 9; i++) {
      const at = .05 + i * .16, pitch = 205 + Math.random() * 40;
      s.tone(pitch, pitch * (.94 + Math.random() * .1), .22, .018 * (i < 3 ? 1 + i * .4 : Math.max(.2, 2.2 - i * .22)), 'sawtooth', at);
    }
  },
  // Salt-glazed stoneware: lower and heavier than a clay pot, then the lid
  // spinning down like a coin.
  stoneware(s) {
    s.tone(1650, 1300, .06, .05, 'sine'); s.tone(2380, 1900, .045, .03, 'sine', .004);
    s.impact(.04, .2, 2800); s.impact(.07, .12, 1500); s.tone(150, 100, .1, .05, 'sine', .01);
    knocks(s, 4, { delay: .06, spacing: .04, freq: 3000, volume: .035 });
    // The lid: knocks coming closer and closer together as it settles.
    let at = .35;
    for (let i = 0, gap = .13; i < 7; i++, gap *= .72) { s.impact(.02, .04 * (1 - i / 9), 1100, 'effects', at); at += gap; }
  },
  // Tin clanking (inharmonic, ringing), the post knocking down, and the
  // candle's flame catching on the ground.
  tinLantern(s) {
    s.tone(1840, 1760, .35, .035, 'sine'); s.tone(2630, 2500, .28, .022, 'sine', .005); s.tone(3710, 3500, .18, .012, 'sine', .01);
    s.impact(.05, .14, 2600);
    s.impact(.08, .1, 600, 'effects', .16); s.tone(150, 80, .08, .04, 'triangle', .16);
    knocks(s, 3, { delay: .1, spacing: .07, freq: 2800, volume: .03 });
    s.tone(80, 55, .3, .025, 'sine', .25);
  },
  // Logs letting go and tumbling: heavy wooden knocks in a slowing cascade.
  cordwood(s) {
    s.impact(.1, .22, 900); s.tone(110, 55, .18, .1, 'triangle');
    for (let i = 0, at = .05; i < 8; i++, at += .06 + i * .015) {
      s.impact(.06, .09 * (1 - i / 10), 500 + Math.random() * 500, 'effects', at);
      s.tone(130 + Math.random() * 90, 70, .07, .035, 'triangle', at);
    }
  },
  // The barrow splitting, squash thumping down, the wheel rattling off.
  squashBarrow(s) {
    crack(s, 1.1);
    knocks(s, 4, { delay: .1, spacing: .07, freq: 380, volume: .08, body: 120 });
    for (let i = 0; i < 6; i++) s.impact(.02, .025, 1300, 'effects', .3 + i * .07);
  },
};

// `s`: the Soundscape. A dash through it lands the body first.
export function playBreakSound(s, e) {
  const sound = SOUNDS[e.propType]; if (!sound) return false;
  if (e.dashed) { s.impact(.09, .28, 420); s.tone(104, 44, .2, .11, 'triangle'); }
  sound(s);
  return true;
}
