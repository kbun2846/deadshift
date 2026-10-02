// Lumen stage 4: how the city's breakables sound (design 9), played by audio.js
// (Soundscape) from its propBreak branch, ahead of Hollow Wick's. Every voice
// is the Soundscape's own synth (no sound files), through its bus and the
// distance gain like every other event:
//   tone(start Hz, end Hz, seconds, volume, wave, delay)
//   noise(seconds, volume, highpass Hz)              (starts now)
//   impact(seconds, volume, bandpass Hz, bus, delay)
//   whoosh(seconds, volume, from Hz, to Hz, delay, peak, q, bus)
//   ring(base Hz, seconds, volume, delay, partials)
// The city's materials: plastic (hollow, clacking), sheet steel (a boom and a
// long ring), glass (a bright crash and a tinkling run), cardboard (soft, dry),
// mains and battery electrics (a zap, a whine winding down). Each type keeps
// its own; a dash lands the body first, as Hollow Wick's.

export const hasLumenBreakSound = type => Object.hasOwn(SOUNDS, type);

const rnd = (a, b) => a + Math.random() * (b - a);

// Shards and pieces landing a beat later: `n` ticks from `delay`, `spacing` apart.
function ticks(s, n, { delay = .1, spacing = .06, freq = 2400, volume = .04, body = 0, wave = 'triangle' } = {}) {
  for (let i = 0; i < n; i++) {
    const at = delay + i * spacing + Math.random() * spacing * .5;
    s.impact(.03, volume * (1 - i / (n + 2)), freq * (.75 + Math.random() * .6), 'effects', at);
    if (body) s.tone(body * (.9 + Math.random() * .3), body * .5, .05, volume * .5, wave, at);
  }
}
// A hollow plastic clack (a crate, a chair, a cone).
function clack(s, weight = 1, pitch = 1) {
  s.impact(.05, .17 * weight, 1900 * pitch); s.tone(340 * pitch, 190 * pitch, .07, .07 * weight, 'triangle'); s.tone(760 * pitch, 400 * pitch, .04, .03 * weight, 'square', .012);
}
// Glass letting go: a bright crash, a hiss of fragments and the run of tinkles.
function glass(s, weight = 1, run = 8) {
  s.impact(.07, .2 * weight, 4200); s.noise(.3, .07 * weight, 4800);
  s.tone(3300, 2500, .06, .035 * weight, 'sine'); s.tone(4700, 3900, .05, .022 * weight, 'sine', .006);
  for (let i = 0; i < run; i++) s.tone(rnd(3400, 6200), rnd(2600, 4000), .05, .02 * weight * (1 - i / (run + 3)), 'sine', .06 + i * .045 + Math.random() * .03);
}
// Sheet steel struck: a boom, then the ringing.
function boom(s, weight = 1, base = 150) {
  s.impact(.09, .22 * weight, 600); s.tone(base, base * .5, .2, .11 * weight, 'triangle');
  s.ring(base * 3.1, .55, .045 * weight, .005, [1, 1.47, 2.09, 2.9]);
}
// A zap and the arc crackling out: mains electrics giving up.
function zap(s, weight = 1, crackle = 6) {
  s.tone(2600, 180, .16, .06 * weight, 'sawtooth'); s.tone(90, 60, .28, .05 * weight, 'square', .02);
  s.noise(.14, .06 * weight, 3600);
  for (let i = 0; i < crackle; i++) s.impact(.014, .05 * weight * (1 - i / (crackle + 2)), rnd(2800, 5200), 'effects', .08 + i * .06 + Math.random() * .05);
}
// A motor winding down.
function whine(s, from, to, dur, vol, delay = 0) { s.tone(from, to, dur, vol, 'sawtooth', delay); s.tone(from * 2, to * 2, dur * .8, vol * .4, 'square', delay + .01); }
// A wooden thing cracking: a dry knock, its body, boards clattering down.
function woodCrack(s, weight = 1, pitch = 1) {
  s.impact(.07, .2 * weight, 900 * pitch); s.tone(210 * pitch, 110 * pitch, .12, .09 * weight, 'triangle');
  ticks(s, 5, { delay: .1, spacing: .06, freq: 1300 * pitch, volume: .045 * weight, body: 190 * pitch });
}
// Things rolling: knocks that come further apart as they slow.
function roll(s, n, { delay = .2, gap = .05, freq = 1500, volume = .03 } = {}) {
  let at = delay;
  for (let i = 0; i < n; i++, gap *= 1.22) { s.impact(.02, volume * (1 - i / (n + 3)), freq * rnd(.8, 1.3), 'effects', at); at += gap; }
}
// A can, a bottle, a pan: thin metal or glass tinging and rolling.
function tin(s, base, vol = .04, delay = 0) {
  s.ring(base, .28, vol, delay, [1, 1.58, 2.42]); s.impact(.03, vol, base * 1.6, 'effects', delay);
}

const SOUNDS = {
  // --- The set pieces that break (world/lumen-setpieces.js SETPIECE_BREAKS) ---
  // A wooden stand: a hollow wooden crack, boards clattering.
  cityValetPodium(s) { woodCrack(s); },
  cityDoormanPodium(s) { woodCrack(s, .9, 1.1); },
  // Rails clanging down, the washing a soft rustle.
  cityDryingRack(s) {
    s.impact(.06, .14, 1600); s.ring(520, .45, .04, .002, [1, 1.8, 2.9]); s.whoosh(.4, .05, 1800, 900, .02, .3);
    ticks(s, 4, { delay: .15, spacing: .08, freq: 1700, volume: .035, body: 280 });
  },
  // Crates cracking apart and the board landing flat.
  cityCrateTable(s) { SOUNDS.cityCrate(s); s.impact(.08, .1, 420, 'effects', .14); s.tone(170, 90, .1, .05, 'triangle', .14); },
  // A plastic drum: a hollow boom, then water.
  cityWaterDrum(s) { SOUNDS.cityWaterBarrier(s); },
  // Crates and fruit: the crack, soft thuds as it lands and rolls.
  cityProduceStack(s) {
    SOUNDS.cityCrate(s);
    for (let i = 0; i < 5; i++) s.impact(.04, .05, rnd(300, 600), 'effects', .15 + i * .07 + Math.random() * .03);
  },
  // A tank of water: the glass crash and a rush.
  cityFishTank(s) {
    glass(s, 1.2, 12); s.whoosh(1.2, .1, 800, 3200, .03, .2, .8); s.noise(.8, .045, 3000);
  },
  // A board snapping, card fluttering.
  cityPriceBoard(s) { woodCrack(s, .8, 1.25); s.whoosh(.3, .035, 3000, 1600, .08, .3); },
  // Neon tubes: a bright pop of glass, the transformer buzzing out.
  cityHeartStand(s) { glass(s, .9, 9); zap(s, .8, 5); s.tone(120, 118, .45, .03, 'sawtooth', .05); },
  // A cooler and a ticket machine sound as a vending machine; a fast charger as a charging post.
  cityDrinksCooler(s) { SOUNDS.cityVending(s); },
  cityTicketMachine(s) { SOUNDS.cityVending(s); },
  cityFastCharger(s) { SOUNDS.cityChargePost(s); },
  // A lit glass panel: the sheet crashes, the lamp behind it zaps.
  cityMetroMap(s) { glass(s, 1.2, 12); zap(s, .7, 4); },
  // A steel shell struck, the glass window crashing, cans dropping out and clattering, the screen zapping.
  cityVending(s) {
    boom(s, .9, 130); glass(s, .8, 6); zap(s, .7, 4);
    for (let i = 0; i < 4; i++) tin(s, rnd(1200, 2100), .03, .12 + i * .09);
    roll(s, 5, { delay: .35, freq: 1300 });
  },
  // A soft thud, the crackle of plastic, a bottle or two clinking.
  cityTrashBags(s) {
    s.impact(.1, .13, 300); s.tone(95, 55, .14, .07, 'sine'); s.noise(.45, .05, 2600); s.whoosh(.4, .04, 2400, 1200, 0, .3);
    for (let i = 0; i < 5; i++) s.impact(.02, .035, rnd(2600, 4600), 'effects', .04 + i * .07 + Math.random() * .04);
    tin(s, 2600, .025, .2); tin(s, 2100, .02, .34);
  },
  // Cast iron clanging (the cap off), then the water: a punch of it and a hiss that lasts the whole jet.
  cityHydrant(s) {
    s.impact(.08, .22, 700); s.ring(190, .8, .1, .004, [1, 1.52, 2.4, 3.4]); s.tone(110, 55, .22, .1, 'triangle');
    s.whoosh(.35, .12, 500, 3000, .03, .25, .9);
    s.whoosh(6.2, .05, 4200, 2600, .1, .05, .6); // the jet
    s.noise(.6, .05, 2600);
    roll(s, 4, { delay: .35, freq: 900, volume: .04 });
  },
  // A plastic crack, a relay snapping, the cable whipping and the arc.
  cityChargePost(s) {
    clack(s, 1.1, .8); zap(s, 1.1, 8); s.impact(.03, .1, 1400, 'effects', .05);
    s.whoosh(.2, .05, 900, 3400, .05, .3);
    s.tone(1500, 1450, .5, .012, 'square', .18);
  },
  // Hollow, quick: a bonk and a skitter.
  cityCone(s) {
    s.impact(.06, .15, 1100); s.tone(520, 300, .11, .09, 'triangle'); s.tone(1040, 610, .06, .03, 'sine', .01);
    roll(s, 5, { delay: .12, gap: .045, freq: 1100, volume: .04 });
  },
  // Plastic cracking apart, crates tumbling.
  cityCrate(s) {
    clack(s, 1.2, .85);
    ticks(s, 6, { delay: .08, spacing: .05, freq: 2100, volume: .05, body: 260 });
    roll(s, 3, { delay: .3, freq: 900 });
  },
  // A dull crump, tape ripping, packing rustling.
  cityDeliveryBox(s) {
    s.impact(.09, .12, 400); s.tone(120, 70, .12, .06, 'sine');
    s.noise(.25, .055, 3000); s.whoosh(.18, .07, 2600, 5200, .04, .2);
    for (let i = 0; i < 6; i++) s.impact(.018, .02, rnd(3400, 6000), 'effects', .1 + i * .045 + Math.random() * .03);
  },
  // Light tubing and a thin seat.
  cityStool(s) {
    s.impact(.06, .13, 1700); s.tone(430, 230, .08, .06, 'triangle');
    tin(s, 2300, .03, .05); ticks(s, 4, { delay: .12, spacing: .06, freq: 1900, volume: .035, body: 320 });
  },
  // A brittle shell cracking, the legs skittering.
  cityPlasticChair(s) {
    clack(s, .9, 1.15); ticks(s, 5, { delay: .1, spacing: .05, freq: 2600, volume: .04, body: 300 });
  },
  // Wire mesh ringing, the bin toppling, tins.
  cityMeshBin(s) {
    s.impact(.07, .16, 1500); s.ring(1100, .5, .05, .002, [1, 1.9, 3.1, 4.4]); s.noise(.12, .05, 4200);
    s.impact(.1, .1, 500, 'effects', .12); tin(s, 1900, .035, .22); roll(s, 4, { delay: .28, freq: 1200 });
  },
  // Three wheelie bins: a big hollow boom, lids slapping, bottles.
  cityRecycleBin(s) {
    s.impact(.1, .2, 480); s.tone(140, 70, .22, .1, 'triangle'); s.tone(200, 100, .18, .06, 'triangle', .05);
    for (let i = 0; i < 3; i++) s.impact(.05, .1, 1400 + i * 250, 'effects', .1 + i * .07);
    tin(s, 2500, .03, .3); tin(s, 3100, .025, .38); glass(s, .25, 3);
  },
  // Big timber flange cracking, the cable whipping off the drum.
  cityCableReel(s) {
    s.impact(.09, .22, 850); s.tone(150, 70, .16, .1, 'triangle'); s.tone(310, 150, .07, .05, 'triangle', .02);
    s.whoosh(.5, .07, 700, 3800, .06, .3); s.noise(.12, .05, 3000);
    roll(s, 6, { delay: .3, freq: 700, volume: .05 });
  },
  // A plastic boom, then water pouring out.
  cityWaterBarrier(s) {
    s.impact(.09, .2, 420); s.tone(95, 48, .3, .13, 'sine'); clack(s, .8, .6);
    s.whoosh(1.5, .09, 900, 3600, .05, .18, .8); s.noise(.9, .04, 3200);
    for (let i = 0; i < 5; i++) s.tone(rnd(300, 560), rnd(160, 300), .07, .035, 'sine', .2 + i * .13);
  },
  // A tube clang, the bell dinging, spokes rattling down.
  cityBicycle(s) {
    s.impact(.06, .15, 2400); s.ring(310, .5, .05, .002, [1, 2.4, 3.9]);
    s.tone(2700, 2650, .5, .05, 'sine', .04); s.tone(4050, 3980, .3, .03, 'sine', .045); // the bell
    for (let i = 0; i < 9; i++) s.impact(.012, .02, rnd(3000, 5500), 'effects', .15 + i * .035 + Math.random() * .02);
    roll(s, 3, { delay: .5, freq: 1400 });
  },
  // Plastic cracking, the motor whining down, the battery popping.
  cityScooter(s) {
    clack(s, 1, .9); whine(s, 1100, 110, .7, .045, .03);
    s.impact(.03, .16, 1200, 'effects', .3); s.tone(1800, 200, .12, .05, 'sawtooth', .3); s.noise(.1, .05, 3800);
  },
  // Several of them going: layered whines, three pops, a hiss where the cells fizz.
  cityScooterHeap(s) {
    clack(s, 1.3, .8); boom(s, .5, 190);
    whine(s, 1000, 90, .9, .04, .02); whine(s, 1300, 130, .8, .035, .08); whine(s, 760, 70, 1, .035, .14);
    for (let i = 0; i < 3; i++) { s.impact(.03, .14, rnd(900, 1600), 'effects', .28 + i * .16); s.tone(rnd(1500, 2200), 200, .1, .04, 'sawtooth', .28 + i * .16); }
    s.whoosh(1.4, .04, 3800, 2400, .5, .3); ticks(s, 6, { delay: .12, spacing: .07, freq: 2000, volume: .04, body: 240 });
  },
  // Steel hoops ringing, bikes crashing over, a chain rattling.
  cityBikeRack(s) {
    s.impact(.07, .2, 1800); s.ring(420, .9, .07, .002, [1, 1.5, 2.3, 3.3]); s.ring(660, .6, .04, .03, [1, 1.7, 2.6]);
    boom(s, .5, 170); s.tone(2650, 2600, .45, .04, 'sine', .12);
    for (let i = 0; i < 12; i++) s.impact(.012, .022, rnd(2800, 5200), 'effects', .2 + i * .03 + Math.random() * .02);
  },
  // Pans and lids clattering, jars smashing, a gas hiss and a pop.
  cityFoodCart(s) {
    boom(s, .8, 200); glass(s, .5, 4);
    for (let i = 0; i < 4; i++) tin(s, rnd(700, 1500), .045, .08 + i * .09);
    s.whoosh(.9, .07, 3200, 5200, .15, .15); s.impact(.05, .12, 500, 'effects', .5); s.tone(220, 90, .15, .06, 'triangle', .5);
    s.noise(.7, .035, 3800);
  },
  // A huge steel door slamming, the boom of the cabinet, parcels thudding out.
  cityParcelLocker(s) {
    s.impact(.12, .27, 500); s.tone(88, 44, .34, .15, 'sine'); boom(s, 1.2, 120);
    s.impact(.06, .16, 2200, 'effects', .06); s.ring(720, .8, .05, .04, [1, 1.35, 2.2, 3.2]);
    for (let i = 0; i < 4; i++) { s.impact(.07, .1, 380 + i * 60, 'effects', .3 + i * .1); s.tone(120, 70, .09, .05, 'triangle', .3 + i * .1); }
    zap(s, .3, 3);
  },
  // A sheet of glass: the crash, the fragments hissing, a long tinkling run, the frame ringing.
  cityShopGlass(s) {
    glass(s, 1.35, 16); s.impact(.05, .12, 900); s.ring(880, .7, .035, .02, [1, 2.2, 3.4]);
    ticks(s, 6, { delay: .5, spacing: .09, freq: 5200, volume: .025 });
  },
  // Glass and electronics: the screen implodes, the board arcs and squeals.
  cityInfoTerminal(s) {
    glass(s, .9, 7); zap(s, 1, 7); s.tone(3400, 700, .5, .03, 'square', .1);
    s.impact(.06, .12, 900, 'effects', .1);
  },
  // Coins spilling: a clank of the head, then a shower of small bright rings.
  cityParkingMeter(s) {
    s.impact(.06, .17, 1100); s.tone(230, 120, .1, .07, 'triangle'); s.ring(1500, .3, .04, .003, [1, 1.6, 2.5]);
    for (let i = 0; i < 12; i++) s.ring(rnd(3000, 4800), .16, .012 * (1 - i / 16), .07 + i * .035 + Math.random() * .03, [1, 1.5]);
    roll(s, 5, { delay: .5, freq: 3600, volume: .02 });
  },
};

export const LUMEN_BREAK_SOUND_TYPES = Object.freeze(Object.keys(SOUNDS));

// `s`: the Soundscape. A dash through it lands the body first.
export function playLumenBreakSound(s, e) {
  const sound = SOUNDS[e.propType]; if (!sound) return false;
  if (e.dashed) { s.impact(.09, .28, 420); s.tone(104, 44, .2, .11, 'triangle'); }
  sound(s);
  return true;
}
