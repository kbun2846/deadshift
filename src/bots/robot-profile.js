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
export const SKILLS = Object.freeze({
 easy:   { label: 'easy',   reaction: [.38, .56], aim: 2,   settle: .7,  turn: 7,  lead: .6,  dodge: .15, trigger: 2.2, burst: 1.7, shake: 1.1 },
 normal: { label: 'normal', reaction: [.2, .34],  aim: 1,   settle: .38, turn: 11, lead: .9,  dodge: .45, trigger: 1,   burst: 1,   shake: .45 },
 hard:   { label: 'hard',   reaction: [.12, .2],  aim: .5,  settle: .24, turn: 15, lead: 1,   dodge: .7,  trigger: .75, burst: .75, shake: .12 },
});

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

// A robot's profile. `skill` / `style`: an id, or null / 'random' for any
// (random skill leans normal: easy and hard a quarter each).
export function makeProfile({ skill = null, style = null, random = Math.random } = {}) {
 const pickSkill = SKILLS[skill] ? skill : (r => r < .25 ? 'easy' : r < .75 ? 'normal' : 'hard')(random());
 const pickStyle = STYLES[style] ? style : STYLE_IDS[Math.floor(random() * STYLE_IDS.length)];
 const k = SKILLS[pickSkill], s = STYLES[pickStyle];
 const own = (v, spread = .1) => v * (1 + (random() * 2 - 1) * spread);
 const clamp01 = v => Math.max(0, Math.min(1, v));
 const aggr = clamp01(s.aggr + (random() * 2 - 1) * .08);
 return {
  skill: pickSkill, style: pickStyle, label: k.label + ' ' + s.label,
  // hands
  reaction: [own(k.reaction[0], .12), own(k.reaction[1], .12)], aim: own(k.aim, .15), settle: own(k.settle, .12),
  turn: own(k.turn, .1), lead: Math.min(1, own(k.lead, .06)), dodge: clamp01(own(k.dodge, .15)),
  trigger: own(k.trigger, .1), burst: own(k.burst, .1), shake: own(k.shake, .15),
  // head
  range: own(s.range, .08), aggr, strafe: own(s.strafe, .1), strafeTime: own(s.strafeTime, .15),
  flank: clamp01(own(s.flank, .15) + (s.flank ? 0 : .05)), steady: clamp01(own(s.steady, .1)), grenade: own(s.grenade, .15),
  // from boldness: hides when under this share of health (bold: rarely)...
  hurtAt: .12 + (1 - aggr) * .33,
  // ...rests this long before hiding hurt again...
  coverRest: 3 + aggr * 6,
  // ...keeps hunting a lost target this long...
  hunt: 5 + aggr * 7,
  // ...and reloads in the open (no cover) when the enemy is further than this.
  openReload: aggr > .7 ? 5 : aggr > .45 ? 12 : Infinity,
 };
}
