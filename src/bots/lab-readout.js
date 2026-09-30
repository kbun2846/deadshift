// Robot lab (robot-lab.js): what a robot is doing right now, as plain words
// and numbers for the lab's live panel (ui/robot-lab-panel.js). No DOM.
//   ammo      "7/20", orbs for Static, the blood meter for Ichor
//   reload    seconds left, or 0
//   abilities [{ name, state, left }]: state 'ready' | 'cooldown' | 'charging'
//             | 'active' | 'locked' (the HUD's own colours, x-ability-state.js),
//             `left` seconds (cooldown left, or time left while running)
//   dodges    "2/3" (dodge charges, fractions dropped)
//   mind      the brain: mode (engage, hunt, cover...), its plan for the fight,
//             why it is in cover, its target and its mood
import { RULES, GRENADE, SURGE, SCATTER, ICHOR, SHEATH, SIDEKICK, SIGHTLINE, OMEN, SHOTGUN } from '../config/gameplay.js';
import { omenReadouts } from '../ui/omen-state.js';
import { reloading } from './bot-match.js';
import { moodName } from './robot-profile.js';

const left = n => Math.max(0, Number(n) || 0);
const dial = (name, state, seconds = 0) => ({ name, state, left: left(seconds) });
const cool = (name, seconds) => dial(name, left(seconds) > 1e-8 ? 'cooldown' : 'ready', seconds);

// The weapon's ammo, reload and abilities.
export function weaponReadout(sim) {
 const w = sim.weapon;
 if (w === 'rifle') {
  const r = sim.rifle, s = sim.surge || { phase: 'idle', cooldown: 0, t: 0 };
  const nova = s.phase === 'charging' ? dial('nova', 'charging', SURGE.charge - s.t) : s.phase === 'active' ? dial('nova', 'active', SURGE.duration - s.t) : cool('nova', s.cooldown);
  return { ammo: r.ammo + '/' + (r.capacity ?? r.ammo), reload: left(r.reload), abilities: [cool('grenade', sim.grenadeCooldown), nova] };
 }
 if (w === 'shotgun') {
  const s = sim.shotgun, sc = sim.scatter || { cooldown: 0 };
  const blast = sc.armed ? dial('blast', 'charging') : sim.scatterShells?.length ? dial('blast', 'active') : cool('blast', sc.cooldown);
  return { ammo: s.ammo + '/' + SHOTGUN.shells, reload: left(s.reload), abilities: [cool('grenade', sim.grenadeCooldown), blast] };
 }
 if (w === 'omen') {
  const o = sim.omen, { primary, secondary } = omenReadouts(o);
  return { ammo: o.ammo + '/' + OMEN.magazine, reload: left(o.reload), abilities: [dial('curse', primary.state, primary.remaining), dial('covenant', secondary.state, secondary.remaining)] };
 }
 if (w === 'ichor') {
  const s = sim.ichor, locked = s.blood < ICHOR.eBlood;
  return { ammo: 'blood ' + Math.round(s.blood) + '/' + ICHOR.meterMax, reload: 0, abilities: [
   locked ? dial('slash', 'locked') : cool('slash', s.eCooldown),
   s.frenzy > 0 ? dial('frenzy', 'active', s.frenzy) : cool('frenzy', s.xCooldown),
   s.guarding ? dial('deflect', 'active') : cool('deflect', s.guardCooldown)] };
 }
 if (w === 'sheath') {
  const s = sim.sheath;
  return { ammo: '', reload: 0, abilities: [s.rush > 0 ? dial('rush', 'active', s.rush) : cool('rush', s.eCooldown), s.x ? dial('draw-cut', 'active') : cool('draw-cut', s.xCooldown)] };
 }
 if (w === 'sidekick') {
  const s = sim.sidekick;
  return { ammo: s.ammo + '/' + SIDEKICK.magazine, reload: left(s.reload), abilities: [
   dial('mines ' + (s.mineCharges ?? 0), s.mineCooldown > 1e-8 ? 'cooldown' : 'ready', s.mineCooldown),
   s.summon > 0 ? dial('rush', 'charging', s.summon) : s.active > 0 ? dial('rush', 'active', s.active) : cool('rush', s.xCooldown)] };
 }
 if (w === 'sightline') {
  const s = sim.sightline;
  return { ammo: s.crouched ? 'rifle ' + s.rifleAmmo + '/1' : s.pistolAmmo + '/' + SIGHTLINE.pistolMagazine, reload: left(s.crouched ? s.rifleReload : s.pistolReload), abilities: [
   dial(s.crouched ? 'scoped' : 'standing', s.setup > 0 ? 'charging' : s.crouched ? 'active' : 'ready', s.setup),
   s.xLoading ? dial('breach', 'charging', s.rifleReload) : s.special ? dial('breach', 'active') : cool('breach', s.xCooldown)] };
 }
 // Static: orbs in hand, the stream, the hex.
 const hex = sim.hexSpin ? dial('hex', 'active') : sim.hexOrbs?.length ? dial('hex', 'charging') : (sim.ammo ?? RULES.hexCost) < RULES.hexCost && !(sim.hexCooldown > 1e-8) ? dial('hex', 'locked') : cool('hex', sim.hexCooldown);
 return { ammo: 'orbs ' + (sim.ammo ?? 0) + '/' + RULES.maxSeeds + (sim.seeds?.length ? ' +' + sim.seeds.length + ' out' : ''), reload: 0, abilities: [dial('stream', sim.spray?.active ? 'active' : 'ready'), hex] };
}

// What its head is doing. `name(id)`: a readable name for a target id.
export function mindReadout(bot, name = id => id) {
 const b = bot.brain, pf = bot.profile || {};
 const target = b.targetId != null ? b.memory.get(b.targetId) : null;
 return {
  mode: b.mode || '-',
  plan: b.fight?.kind || '',
  why: b.mode === 'cover' ? b.coverWhy || '' : '',
  target: target ? name(b.targetId) + (target.visible ? '' : ' (last seen)') : '',
  mood: pf.temper ? moodName(pf.mood) + ' ' + (pf.mood >= 0 ? '+' : '') + pf.mood.toFixed(2) : '',
  profile: pf.label || '',
 };
}

// Everything the panel shows for one robot.
export function labReadout(bot, name) {
 const sim = bot.sim, p = sim.player, weapon = weaponReadout(sim);
 return {
  hp: Math.max(0, p.hp), maxHp: p.maxHp, alive: !!bot.alive && p.hp > 0 && !p.dead,
  weapon: sim.weapon, ...weapon, reloading: reloading(sim),
  dodges: Math.floor((p.stamina ?? 0) + 1e-8) + '/' + sim.maxStamina,
  dodging: p.dodgeRemaining > 0,
  speed: Math.hypot(p.vx || 0, p.vz || 0),
  mind: mindReadout(bot, name),
 };
}

// (For the tests: the constants each readout is measured against.)
export const READOUT_LIMITS = Object.freeze({ grenade: GRENADE.cooldown, nova: SURGE.cooldown, blast: SCATTER.cooldown, rush: SHEATH.eCooldown });
