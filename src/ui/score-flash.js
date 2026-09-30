// The score, big, as a point is won (v0.999a, owner: "it shouldn't say point
// to enemies but it should show the new score updating on the screen, it
// should be the same text/format as the top ui that shows points except it
// should be bigger and show the change in numbers as an animation").
//
// A copy of the top score as it now stands (SOLO the VS ROBOTS score,
// duel.js; online the sides beside the match clock, multiplayer-hud.js), in
// the middle of the screen and scaled up; the number that changed rolls from
// the old value to the new one, and the whole thing goes when everyone comes
// back. A small line under it counts down to the next round.
export function createScoreFlash(parent) {
  const el = document.createElement('div');
  el.id = 'score-flash'; el.className = 'score-flash hidden'; el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite');
  parent.append(el);
  let key = '', next = null;
  const api = {
    get open() { return !el.classList.contains('hidden'); },
    // `id`: this point (a new one starts the animation again); `look`: the
    // top score's class ('duel-score' or 'match-clock'); `html`: its markup
    // now; `changed`: selector of the number that went up (from `to - 1`).
    show(id, { look, html, changed, to }) {
      if (id === key) return;
      key = id;
      el.className = 'score-flash ' + look;
      el.innerHTML = `<div class="score-flash-body">${html}</div><p class="score-flash-next"></p>`;
      next = el.querySelector('.score-flash-next');
      const number = changed ? el.querySelector(changed) : null;
      if (number && Number.isFinite(to)) {
        number.classList.add('score-flash-changed');
        number.innerHTML = `<span class="score-flash-roll"><i class="score-flash-old">${Math.max(0, to - 1)}</i><i class="score-flash-new">${to}</i></span>`;
      }
    },
    // Seconds to the next round (under the score).
    countdown(left) { if (next) { const text = left > 0 ? 'next round in ' + Math.max(1, Math.ceil(left)) : ''; if (next.textContent !== text) next.textContent = text; } },
    hide() { if (!key) return; key = ''; next = null; el.className = 'score-flash hidden'; el.replaceChildren(); },
  };
  return api;
}

// A number turning over from `from` to `to` (competitive overhaul, 2026-09-29):
// the top score in 1V1 as both come back (owner: the one who died sees the
// point "after" the death card; duel.js, main.js for the match clock). Its
// look: `.score-roll` in menu-theme.css (Task B's block).
export const rollHTML = (from, to) => `<span class="score-roll"><i class="score-roll-old">${from}</i><i class="score-roll-new">${to}</i></span>`;
