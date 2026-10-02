// Gun Game on the screen (config/match.js GUNGAME, gungame.js): where you
// are on the ladder and what comes next, and a cue in the middle of the
// screen whenever a kill hands you the next weapon (or a blade knocks you
// back one).
//
// The ladder line sits under the health bar (the storm's line under it), in
// the HUD's lettering:  WEAPON 4/8  OMEN  ·  next STATIC  and a row of one
// segment per weapon, the ones behind you filled, yours lit. On the last
// weapon "next" reads "a kill wins".
//
// The cue is the ROUND popup's look and timing (menu-theme.css .round-popup):
// small "next weapon" over the weapon's name, with a short rising chime
// (falling for "knocked back"). Nothing is new on the wire: the host's match
// state carries the ladder and everyone's level (arena.js matchState `gun`;
// BOTS: duel.js gunState), and the cue is this screen seeing yours change.
//
// `gunHudView` is pure (tested); the DOM is only touched in createGunGameHud.
// Styled in styles/gungame.css.
import { weapon as weaponById } from '../items.js';
import { ladderText } from '../gungame.js';

const esc = text => String(text ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nameOf = id => weaponById(id)?.name || id || '';

// What the ladder line shows for `gun` ({ ladder, levels }) as `myId` sees
// it, in match `key` (a new key: a new match, no cue). Null: nothing to show.
// -> { key, level, size, step ('4/8'), weapon, name, next (name or null:
// the last), last (true on the last weapon), leader (the furthest level) }
export function gunHudView(gun, myId, key = '') {
 if (!gun?.ladder?.length || !gun.levels || !(myId in gun.levels)) return null;
 const size = gun.ladder.length, level = Math.max(0, Math.min(size - 1, gun.levels[myId] | 0));
 const last = level === size - 1, weapon = gun.ladder[level];
 const leader = Math.max(0, ...Object.values(gun.levels).map(v => v | 0));
 return { key, level, size, step: ladderText(level, size), weapon, name: nameOf(weapon), next: last ? null : nameOf(gun.ladder[level + 1]), last, leader, ladder: gun.ladder };
}

// The ladder line's markup for a view (pure).
export function gunLineHTML(v) {
 if (!v) return '';
 const pips = v.ladder.map((id, i) => `<i class="${i < v.level ? 'done' : i === v.level ? 'here' : ''}${i === v.leader && v.leader > v.level ? ' lead' : ''}" title="${esc(nameOf(id))}"></i>`).join('');
 return `<span class="gun-ladder-head"><span class="gun-ladder-step"><i class="gun-ladder-word">weapon </i><b>${esc(v.step)}</b></span><span class="gun-ladder-name">${esc(v.name)}</span>`
  + `<span class="gun-ladder-next">${v.last ? 'a kill wins' : 'next <b>' + esc(v.next) + '</b>'}</span></span><span class="gun-ladder-pips" aria-hidden="true">${pips}</span>`;
}

// What a change of level says: 'up' (a kill: the next weapon), 'down' (a
// blade knocked you back), or null (the same, or a new match).
export function gunCue(before, after) {
 if (!before || !after || before.key !== after.key || before.level === after.level) return null;
 return after.level > before.level ? 'up' : 'down';
}

// `parent`: #game (the cue); `under`: where the line goes (the health bar).
export function createGunGameHud(parent, { sound = null, under = parent } = {}) {
 const line = document.createElement('div');
 line.className = 'gun-ladder'; line.hidden = true; line.setAttribute('role', 'status'); line.setAttribute('aria-label', 'Gun Game ladder');
 const cue = document.createElement('div');
 cue.className = 'round-popup gun-cue'; cue.setAttribute('role', 'status'); cue.setAttribute('aria-live', 'polite');
 under.append(line); parent.append(cue);
 let shown = '', last = null;
 const chime = up => {
  if (!sound?.tone) return;
  if (up) { sound.tone(520, 700, .1, .07, 'triangle'); sound.tone(700, 1040, .16, .07, 'triangle', .09); }
  else { sound.tone(420, 300, .14, .07, 'triangle'); sound.tone(300, 210, .18, .06, 'triangle', .1); }
 };
 const api = {
  // `view`: gunHudView(...) or null (not a Gun Game: hidden).
  update(view) {
   const html = gunLineHTML(view);
   if (html !== shown) { shown = html; line.innerHTML = html; line.hidden = !html; line.dataset.last = view?.last ? '1' : ''; }
   const kind = gunCue(last, view);
   last = view;
   if (kind) api.cue(kind, view);
  },
  // The cue in the middle: 'up' (the next weapon) or 'down' (knocked back).
  cue(kind, view) {
   const label = kind === 'down' ? 'knocked back' : view.last ? 'last weapon' : 'next weapon';
   cue.innerHTML = `<small>${label}</small>${esc(view.name)}`;
   cue.classList.toggle('gun-cue-down', kind === 'down'); cue.classList.toggle('gun-cue-last', kind === 'up' && view.last);
   cue.classList.remove('show'); void cue.offsetWidth; cue.classList.add('show');
   chime(kind === 'up');
  },
  get line() { return line; },
 };
 return api;
}
