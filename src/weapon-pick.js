// The multiplayer weapon pick: at the start of a round, and after a death when
// the player chooses CHANGE WEAPON. A see-through panel in the menus' grey over
// a top-down view of the world (pick-view.js). The timer runs at the top; each
// weapon is a rounded, slightly see-through square with only its picture and
// name, five to a row (the grid scrolls when there are more). Hovering or
// picking one lifts the square and its picture a little. GO (pink) goes in at
// once with the picked weapon; at zero the player goes in with the one picked,
// or a random one.
import { WEAPONS } from './items.js';
import { staticPreview } from './weapon-preview.js';
import { riflePreview } from './rifle-model.js';
import { shotgunPreview } from './shotgun-model.js';

const PREVIEWS = { static: staticPreview, rifle: riflePreview, shotgun: shotgunPreview };
const esc = text => String(text ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function createWeaponPick(parent, { pick, go }) {
  const root = document.createElement('section');
  root.id = 'weapon-pick'; root.className = 'weapon-pick hidden'; root.setAttribute('role', 'dialog'); root.setAttribute('aria-label', 'Choose a weapon');
  root.innerHTML = `<div class="weapon-pick-card">
    <header class="weapon-pick-head"><span class="weapon-pick-title">choose weapon</span><span class="weapon-pick-timer" role="timer"><b>10</b><i aria-hidden="true"><s></s></i></span></header>
    <div class="weapon-pick-grid">${WEAPONS.map(w => `<button type="button" class="weapon-pick-choice plain-text" data-weapon="${w.id}" aria-pressed="false" aria-label="${esc(w.name)}"><span class="weapon-pick-art"><img alt="" draggable="false"></span><span class="weapon-pick-name">${esc(w.name)}</span></button>`).join('')}</div>
    <footer class="weapon-pick-foot"><button type="button" class="weapon-pick-go plain-text" disabled>GO</button></footer>
  </div>`;
  parent.append(root);
  const $ = selector => root.querySelector(selector);
  let selected = null;
  const choices = [...root.querySelectorAll('.weapon-pick-choice')];
  const mark = id => {
    selected = id;
    for (const button of choices) button.setAttribute('aria-pressed', String(button.dataset.weapon === id));
    $('.weapon-pick-go').disabled = !id;
  };
  for (const button of choices) {
    button.onclick = () => { mark(button.dataset.weapon); pick(selected); };
    button.ondblclick = () => { mark(button.dataset.weapon); go(selected); };
  }
  $('.weapon-pick-go').onclick = () => { if (selected) go(selected); };

  const api = {
    root,
    get open() { return !root.classList.contains('hidden'); },
    get selected() { return selected; },
    // `current`: the weapon already picked (the host's record), if any.
    show(current = null) {
      for (const button of choices) {
        const img = button.querySelector('img');
        if (!img.src) { try { const src = PREVIEWS[button.dataset.weapon]?.(); if (src) img.src = src; } catch (error) { console.warn('Weapon preview unavailable:', error); } }
      }
      mark(current);
      root.classList.remove('hidden');
      (choices.find(b => b.dataset.weapon === current) || choices[0])?.focus();
    },
    hide() { root.classList.add('hidden'); },
    setTimer(left, total = 10) {
      const s = Math.max(0, left);
      $('.weapon-pick-timer b').textContent = String(Math.ceil(s));
      $('.weapon-pick-timer s').style.transform = `scaleX(${Math.min(1, s / total)})`;
      root.classList.toggle('weapon-pick-hurry', s <= 3);
    },
  };
  return api;
}
