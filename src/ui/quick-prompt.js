// QUICK PLAY's "PLAYER FOUND — JOIN?" prompt (quick-play.js): shown over the
// bot fight when the game server finds another player. Non-intrusive (owner,
// 2026-10-01): a small slate card like the admins' messages
// (admin-message.js), top left under the map and mode line on a wide screen,
// on a narrow one top centre under the score and health bar (cardTop); never
// over the fight's middle or the touch controls, and the game keeps running
// under it. JOIN
// takes it (the bot fight ends and the online match loads); the X, or letting
// its line run out (QUICK_PLAY.promptSeconds), leaves it and the fight goes on.
// Its presses never reach the game as shots.
import { cardTop } from './admin-message.js';

export function createQuickPrompt(parent, { accept, ignore, doc = document } = {}) {
 const root = doc.createElement('div');
 root.className = 'quick-prompt'; root.hidden = true;
 root.setAttribute('role', 'alertdialog'); root.setAttribute('aria-label', 'Player found');
 root.innerHTML = '<div class="quick-prompt-card"><span class="quick-prompt-label">quick play</span><strong class="quick-prompt-title">PLAYER FOUND — JOIN?</strong>'
  + '<span class="quick-prompt-note">online match ready</span>'
  + '<div class="quick-prompt-actions"><button type="button" class="quick-prompt-join plain-text">JOIN</button><button type="button" class="quick-prompt-close plain-text" aria-label="Keep playing" title="Keep playing">✕</button></div>'
  + '<i class="quick-prompt-time" aria-hidden="true"></i></div>';
 parent.append(root);
 for (const type of ['pointerdown', 'mousedown', 'touchstart']) root.addEventListener(type, event => event.stopPropagation(), { passive: true });
 root.querySelector('.quick-prompt-join').addEventListener('click', event => { event.stopPropagation(); accept?.(); });
 root.querySelector('.quick-prompt-close').addEventListener('click', event => { event.stopPropagation(); ignore?.(); });
 const place = () => {
  // (Narrow screens: under the health bar, as the admins' cards are.)
  const narrow = doc.defaultView?.matchMedia?.('(max-width: 760px)').matches;
  const hud = narrow ? doc.querySelector('#game .health-hud') : null;
  const top = hud ? cardTop(hud.getBoundingClientRect(), doc.defaultView?.innerHeight || 0) : null;
  root.style.top = top === null ? '' : top + 'px';
 };
 return {
  element: root,
  get open() { return !root.hidden; },
  show(match, seconds = 20) {
   place();
   root.querySelector('.quick-prompt-time').style.animationDuration = Math.round(seconds * 1000) + 'ms';
   // (Restart the line's animation for a new offer.)
   const card = root.querySelector('.quick-prompt-card'); card.classList.remove('run'); void card.offsetWidth; card.classList.add('run');
   root.hidden = false;
  },
  hide() { root.hidden = true; },
 };
}
