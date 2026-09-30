// Who a robot is: how good it is (skill) and how it likes to play (style),
// with a little of its own on top, so no two robots fight quite alike.
//
// Skill is the hands: reaction before the first shot, aim error and how fast
// it settles, turn speed, how well it leads a moving target, how often it
// dodges when hit. Style is the head: how close it likes to fight, how bold
// it is (when it hides, how long it hunts, whether it reloads in the open),
// how much it strafes, whether it goes round the side, how keen it is on
// grenades. Every number gets a small personal jitter (±8-15%), so even two
// "normal balanced" robots differ subtly.
//
// A profile is plain numbers (no DOM, no three.js); RobotBrain reads it as
// `this.pf`. Chosen once per robot (BotMatch.spawn) and kept for the whole
// session, like its make.

// trigger: how far off target it will still fire (easy: sprays early).
// burst: how long its Nominal bursts run at range (longer = more recoil).
// shake: an unsteady hand, a wobble that never settles.
// tech: how much of the game it knows and uses: reading a fight (push,
// kite, close, fall back), the timing of abilities, riding Ballast's recoil,
// big Static volleys, dodging a shot it sees coming. Easy robots know a
// little; hard ones use all of it.
// bold (v146): how much bolder or meeker than its style (easier robots are
// calmer by default; hard and up are not held back).
// patience (v146): 0-1, how much an easier robot holds fire until it has
// been noticed (your aim swings its way, you hurt it, you come close) or it
// decides to start the fight itself after a moment (robot-brain openFire).
// xRate (v146): how often it uses its X ability, against the old rate.
// miss: the chance, about every half-second of shooting, that the hand pulls
// wide for a moment (a shot or two that miss). Nobody is a dead shot.
// rest: an easier robot stops firing about this long (s) after every second
// and a half or so of it, re-aiming and hesitating as a person does.
// feel: how much a hard-to-aim weapon (robot-brain.js WEAPON_AIM) throws its
// hand off: fully for easy and normal, less for hard, little for expert.
// whiff: melee (Ichor, Sheath): the chance a swing is misjudged, started out
// of reach or cut off line (robot-brain.js meleeSwing), as a person does.
// (Owner, 2026-09-29: "robots aim is too good, especially in normal it should
// be more balanced. dont make it easy but make it miss a bit more, especially
// with melee and ranged weapons ... make easy extra easy and make hard
// actually hard, make normal balanced and fun": easy's hands much looser,
// normal looser than v146 and whiffing a third of its melee swings, hard a
// little sharper and quicker than before. The hard-to-aim weapons miss more
// on top, robot-brain.js WEAPON_AIM.)
export const SKILLS = Object.freeze({
 rookie: { label: 'rookie', reaction: [.65, .9],  aim: 5.4,  settle: 1.3,  turn: 5,  lead: .4,  dodge: .03, trigger: 3.3, burst: 2.3, shake: 3.1,  miss: .7,  whiff: .62, rest: .8,  feel: 1.2, tech: .05, bold: -.3,  patience: .9, xRate: .3 },
 easy:   { label: 'easy',   reaction: [.55, .8],  aim: 4.6,  settle: 1.15, turn: 5.5, lead: .45, dodge: .05, trigger: 2.4, burst: 1.8, shake: 2.7,  miss: .62, whiff: .6,  rest: .6,  feel: 1.15, tech: .1, bold: -.28, patience: .85, xRate: .3 },
 // Normal (owner, v146: it was too hard): slower to react, looser aim, a
 // shakier hand and less game sense than before.
 normal: { label: 'normal', reaction: [.3, .46],  aim: 2.3,  settle: .62,  turn: 9,   lead: .72, dodge: .28, trigger: 1.15, burst: 1.1, shake: 1.15, miss: .36, whiff: .45, rest: .2,  feel: 1, tech: .5, bold: -.14, patience: .6, xRate: .45 },
 hard:   { label: 'hard',   reaction: [.1, .17],  aim: .5,   settle: .22,  turn: 17, lead: .99, dodge: .8,  trigger: .8,  burst: .75, shake: .14, miss: .04, whiff: .05, feel: .45, tech: 1, bold: .02,  patience: 0, xRate: .65 },
 expert: { label: 'expert', reaction: [.09, .14], aim: .4,   settle: .18,  turn: 19, lead: 1,   dodge: .85, trigger: .7,  burst: .65, shake: .1,  miss: .03, whiff: .04, feel: .35, tech: 1, bold: .05,   patience: 0, xRate: .65 },
 // Perfect (owner, v0.9b): the hands maxed, nearly unbeatable. Same guns,
 // same health: only reaction, aim, tracking, dodging and knowing the game.
 perfect: { label: 'perfect', reaction: [.05, .07], aim: .1,   settle: .08, turn: 34, lead: 1,   dodge: 1,   trigger: .45, burst: .5,  shake: .02, miss: 0,   whiff: 0,   feel: 0,   tech: 1, bold: .08,  patience: 0, xRate: .7 },
});
// The menus' order, weakest first (1V1, dev tools). Random picks only from
// easy / normal / hard.
export const SKILL_LEVELS = Object.freeze(['rookie', 'easy', 'normal', 'hard', 'expert', 'perfect']);
// The difficulties the menus offer (v0.999a, owner: "remove the perfect mode and just have three modes ... easy, normal, and hard"); the others stay for the developer tools.
export const MENU_SKILLS = Object.freeze(['easy', 'normal', 'hard']);

// range: scales the weapon's range band (below 1 = closer). aggr: 0 timid to
// 1 reckless. strafe: how wide it weaves; strafeTime: how long between side
// switches. flank: how much it prefers shooting spots off to the side.
// steady: how much it slows to aim at range. grenade: how keen.
export const STYLES = Object.freeze({
 balanced: { label: 'balanced', range: 1,    aggr: .5,  strafe: .9,  strafeTime: 1,   flank: .3, steady: .55, grenade: 1 },
 rusher:   { label: 'rusher',   range: .72,  aggr: .88, strafe: 1,   strafeTime: .7,  flank: .1, steady: .8,  grenade: .6 },
 marksman: { label: 'marksman', range: 1.3,  aggr: .35, strafe: .55, strafeTime: 1.5, flank: .2, steady: .35, grenade: .8 },
 flanker:  { label: 'flanker',  range: .95,  aggr: .6,  strafe: .95, strafeTime: .9,  flank: 1,  steady: .6,  grenade: 1.2 },
 cautious: { label: 'cautious', range: 1.15, aggr: .18, strafe: .8,  strafeTime: 1.2, flank: .4, steady: .5,  grenade: 1.5 },
});
export const SKILL_IDS = Object.keys(SKILLS), STYLE_IDS = Object.keys(STYLES);
const HEAD = ['range', 'aggr', 'strafe', 'strafeTime', 'flank', 'steady', 'grenade'];

// Temper (owner, v132): a robot with one has a mood, -1 calm to +1
// aggressive, that drifts over a fight and leans its style that way: bolder,
// closer, hunting longer and hiding later when fired up; further back,
// quicker to cover and steadier when calm. `centre` is where it rests,
// `swing` how far it wanders. 'shifting' swings widest.
export const TEMPERS = Object.freeze({
 calm:       { label: 'calm',       centre: -.45, swing: .35 },
 shifting:   { label: 'shifting',   centre: 0,    swing: .85 },
 aggressive: { label: 'aggressive', centre: .45,  swing: .35 },
});

// What boldness sets (hides when hurt, rests, hunts, reloads in the open).
function fromBoldness(aggr) {
 return { hurtAt: .12 + (1 - aggr) * .33, coverRest: 3 + aggr * 6, hunt: 5 + aggr * 7, openReload: aggr > .7 ? 5 : aggr > .45 ? 12 : Infinity };
}
// A blend (owner): two or three styles mixed by random weights, so the robot
// is part rusher, part marksman... The biggest share names it.
function blendStyles(random) {
 const ids = [...STYLE_IDS].sort(() => random() - .5).slice(0, 2 + (random() < .4 ? 1 : 0));
 const weights = ids.map(() => .25 + random()), total = weights.reduce((a, b) => a + b, 0);
 const mix = { label: '' };
 for (const key of HEAD) mix[key] = ids.reduce((sum, id, i) => sum + STYLES[id][key] * weights[i] / total, 0);
 const order = ids.map((id, i) => [id, weights[i]]).sort((a, b) => b[1] - a[1]);
 mix.label = order.slice(0, 2).map(([id]) => id).join('-');
 mix.parts = Object.fromEntries(order.map(([id, w]) => [id, Math.round(w / total * 100) / 100]));
 return mix;
}

// A robot's profile. `skill` / `style`: an id, or null / 'random' for any
// (random skill leans normal: easy and hard a quarter each).
// `style` 'blend': a mix of styles (blendStyles). `temper`: calm /
// shifting / aggressive (TEMPERS) gives it a mood that moves (stepMood).
export function makeProfile({ skill = null, style = null, temper = null, random = Math.random } = {}) {
 const pickSkill = SKILLS[skill] ? skill : (r => r < .25 ? 'easy' : r < .75 ? 'normal' : 'hard')(random());
 const pickStyle = style === 'blend' || STYLES[style] ? style : STYLE_IDS[Math.floor(random() * STYLE_IDS.length)];
 const k = SKILLS[pickSkill], s = pickStyle === 'blend' ? blendStyles(random) : STYLES[pickStyle];
 const own = (v, spread = .1) => v * (1 + (random() * 2 - 1) * spread);
 const clamp01 = v => Math.max(0, Math.min(1, v));
 const aggr = clamp01(s.aggr + (k.bold || 0) + (random() * 2 - 1) * .08);
 const pf = {
  skill: pickSkill, style: pickStyle, label: k.label + ' ' + (pickStyle === 'blend' ? s.label + ' blend' : s.label), blend: s.parts || null,
  // hands
  reaction: [own(k.reaction[0], .12), own(k.reaction[1], .12)], aim: own(k.aim, .15), settle: own(k.settle, .12),
  turn: own(k.turn, .1), lead: Math.min(1, own(k.lead, .06)), dodge: clamp01(own(k.dodge, .15)),
  trigger: own(k.trigger, .1), burst: own(k.burst, .1), shake: own(k.shake, .15), miss: own(k.miss, .15), tech: Math.max(0, Math.min(1, own(k.tech, .1))),
  patience: k.patience || 0, xRate: k.xRate ?? 1, rest: k.rest || 0, feel: k.feel ?? 1,
  // head
  range: own(s.range, .08), aggr, strafe: own(s.strafe, .1), strafeTime: own(s.strafeTime, .15),
  flank: clamp01(own(s.flank, .15) + (s.flank ? 0 : .05)), steady: clamp01(own(s.steady, .1)), grenade: own(s.grenade, .15),
  // From boldness (fromBoldness): hides when under hurtAt of its health
  // (bold: rarely), rests coverRest before hiding hurt again, hunts a lost
  // target for `hunt` seconds, and reloads in the open when the enemy is
  // further than openReload.
  ...fromBoldness(aggr),
 };
 if (TEMPERS[temper]) {
  const t = TEMPERS[temper];
  pf.temper = temper; pf.label += ' · ' + t.label;
  pf.base = Object.fromEntries(HEAD.map(key => [key, pf[key]]));
  pf.mood = Math.max(-1, Math.min(1, t.centre + (random() * 2 - 1) * t.swing * .5));
  pf.moodGoal = pf.mood; pf.moodClock = 4 + random() * 8;
  applyMood(pf);
 }
 // (Drawn last, so every other number is what the same seed gave before.)
 pf.whiff = Math.min(.9, own(k.whiff ?? .2, .15));
 return pf;
}

// The mood's lean on the style (from the numbers it was made with).
export function applyMood(pf) {
 const m = pf.mood, b = pf.base, clamp01 = v => Math.max(0, Math.min(1, v));
 pf.aggr = clamp01(b.aggr + m * .38);
 pf.range = b.range * (1 - m * .16);
 pf.strafeTime = b.strafeTime * (1 - m * .2);
 pf.steady = clamp01(b.steady - m * .12);
 pf.grenade = b.grenade * (1 + m * .25);
 Object.assign(pf, fromBoldness(pf.aggr));
}
export const moodName = mood => mood > .3 ? 'aggressive' : mood < -.3 ? 'calm' : 'even';

// Moves a tempered robot's mood (RobotBrain.step, every tick). Now and then
// (every 8-22 s) it settles on a new mood near its temper's centre; being
// hurt cools it, a hurt enemy fires it up; it drifts there, never snaps.
// `own` / `their`: health shares (their: null when it has no target).
export function stepMood(pf, dt, { own = 1, their = null, random = Math.random } = {}) {
 const t = TEMPERS[pf.temper]; if (!t) return;
 pf.moodClock -= dt;
 if (pf.moodClock <= 0) { pf.moodClock = 8 + random() * 14; pf.moodGoal = t.centre + (random() * 2 - 1) * t.swing; }
 let goal = pf.moodGoal;
 if (own < .35) goal -= .5 * (1 - own / .35);
 if (their !== null && their < .35) goal += .4 * (1 - their / .35);
 goal = Math.max(-1, Math.min(1, goal));
 const was = pf.mood;
 pf.mood += (goal - pf.mood) * Math.min(1, dt * .35);
 if (Math.abs(pf.mood - was) > 1e-4) applyMood(pf);
}
