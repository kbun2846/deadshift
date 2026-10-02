// The killcam on screen (killcam.js has the rules and the timing): a small
// health bar over your body (your health just before the killing hit, running
// out) and one over the killer (their health now), and a plaque low in the
// middle: KILLED BY <name> · <weapon>, with how to skip it. The HUD's look:
// the health bar's dark track and pink fill, the streak banner's dark panel
// with pink edges and its stretched lettering. Media mode: `data-media=
// "killcam"` (shown in both presets: a killcam makes a good clip).
// Also the camera's hook for the renderer (`camera`) and the skip (any attack
// key, a click or a tap; `skipKey`, the pointer listener installed here).
// Styles: styles/killcam.css.
import { createKillcamState, startKillcam, setKiller, seeKiller, stepKillcam, skipKillcam, fitKillcam, killcamCamera, killcamBars, plaqueText, killcamShowing } from '../killcam.js';
import { setStyle, setAttr, setText } from './dom-writes.js';

const esc = text => String(text ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// The keys that skip: the attack keys (as bound: `gameCode` turns a pressed
// key into its action's token) and the menus' confirm.
export const SKIP_TOKENS = Object.freeze(['Space', 'KeyE', 'KeyX', 'KeyC', 'Enter']);

// `root` the #game box, `view` the WorldView (screenPoint), `weaponName(id)`,
// `touch()` whether the prompts are touch ones (the skip line's wording).
// `skipLabel()`: the attack key's name as bound (Settings > Controls).
export function createKillcam({ root, view, weaponName = id => id, touch = () => false, skipLabel = () => 'space' }) {
 const s = createKillcamState(), bars = killcamBars(s), cam = { x: 0, z: 0, height: 0 };
 const el = document.createElement('div');
 el.className = 'killcam'; el.setAttribute('data-media', 'killcam'); el.setAttribute('aria-hidden', 'true');
 el.innerHTML = '<div class="killcam-bar" data-who="you"><small>you</small><span class="killcam-track"><i class="killcam-fill"></i></span></div>'
  + '<div class="killcam-bar" data-who="killer"><small>killer</small><span class="killcam-track"><i class="killcam-fill"></i></span></div>'
  + '<div class="killcam-plaque" role="status" aria-live="polite"><small class="killcam-by"></small><span class="killcam-name"><b></b></span><span class="killcam-weapon"></span><kbd class="killcam-skip"></kbd></div>';
 root.append(el);
 const you = el.querySelector('[data-who=you]'), them = el.querySelector('[data-who=killer]'), plaque = el.querySelector('.killcam-plaque');
 const youFill = you.querySelector('i'), themFill = them.querySelector('i');
 let shownFor = null, onSkip = null;

 const place = (bar, fillEl, b, y) => {
  setAttr(bar, 'data-show', b.show ? '1' : '');
  if (!b.show) return;
  const at = view.screenPoint(b.x, b.z, y);
  setStyle(bar, 'transform', `translate(${Math.round(at.x)}px,${Math.round(at.y)}px)`);
  setStyle(fillEl, 'transform', `scaleX(${b.fill.toFixed(3)})`);
 };
 const fillPlaque = () => {
  const words = plaqueText(s.killer, weaponName);
  const key = words ? words.by + '|' + words.name + '|' + words.weapon + '|' + touch() + '|' + skipLabel() : '';
  if (key === shownFor) return; shownFor = key;
  if (!words) return;
  setText(plaque.querySelector('.killcam-by'), words.by);
  setText(plaque.querySelector('.killcam-name b'), words.name);
  plaque.querySelector('.killcam-weapon').innerHTML = words.weapon ? `<i>·</i> ${esc(words.weapon)}` : '';
  setText(plaque.querySelector('.killcam-skip'), touch() ? 'tap to skip' : String(skipLabel()).toLowerCase() + ' to skip');
  // (A long name is drawn narrower so it keeps to the plaque.)
  setStyle(plaque, '--letters', String(Math.max(6, words.name.length)));
 };

 // A press anywhere but a control skips (a tap on a phone, a click).
 window.addEventListener('pointerdown', e => {
  if (!killcamShowing(s) || e.target?.closest?.('button,input,select,a,.dev-window,#dev-panel')) return;
  if (skipKillcam(s)) onSkip?.();
 }, true);

 const api = {
  el, state: s,
  // A death. `e` the playerDeath event (null: only that you are down), `hp0`
  // your health share just before, `wait` the respawn wait (Infinity: none),
  // `killer` ({ id, name, weapon, oneShot }) if known now.
  start(e, { hp0 = 1, wait = Infinity, killer = null, fallback = null } = {}) {
   startKillcam(s, { body: e || fallback, hp0, wait, killer });
   shownFor = null; setAttr(el, 'data-on', '');
  },
  // The killer, when learned after the death (online: the kill feed).
  killer(k) { setKiller(s, k); },
  get killerId() { return s.killer?.id ?? null; },
  // Each frame while down: the clock since the death, everyone drawn now
  // (view.remotePlayers: the killer is found among them by id), and the
  // seconds to the respawn as they stand (Infinity: none; fitKillcam).
  frame(age, others = [], left = Infinity) {
   if (!s.active) return;
   stepKillcam(s, age); fitKillcam(s, left);
   if (s.on && s.killer) { let found = null; for (const o of others || []) if (o.id === s.killer.id) { found = o; break; } seeKiller(s, found); }
   killcamBars(s, bars);
   const any = bars.you.show || bars.killer.show || bars.plaque;
   setAttr(el, 'data-on', any ? '1' : '');
   if (!any) return;
   // (Your body lies on the ground; the killer stands.)
   place(you, youFill, bars.you, 1.15);
   place(them, themFill, bars.killer, 2.35);
   if (bars.plaque) fillPlaque();
   setAttr(plaque, 'data-show', bars.plaque ? '1' : '');
  },
  // The renderer's death camera: the killcam's, or the plain shot's.
  camera(deathView, aspect, aside) {
   const base = deathView.cameraFrame(aspect, aside);
   return killcamCamera(s, deathView.cameraStart, base, aspect, cam) || base;
  },
  // When the death card comes (seconds after the death).
  get cardAt() { return s.cardAt; },
  get showing() { return killcamShowing(s); },
  // An attack key while it runs: straight to the card. True when it skipped.
  skipKey(e, gameCode = c => c) {
   if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || !killcamShowing(s)) return false;
   if (!SKIP_TOKENS.includes(gameCode(e.code)) && e.code !== 'Enter') return false;
   if (!skipKillcam(s)) return false;
   onSkip?.(); return true;
  },
  set onSkip(fn) { onSkip = fn; },
  clear() { s.active = false; s.on = false; setAttr(el, 'data-on', ''); setAttr(plaque, 'data-show', ''); },
 };
 return api;
}
