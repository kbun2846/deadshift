// Spectating and the point banner (v0.999a, owner: "after a player dies, they
// should see the death screen, which turns into a spectating screen
// maintaining game design and ui -- which then allows player to use arrow keys
// or click or tap to change which teammate they're spectating (can't spectate
// other team)").
//
// In the modes played by elimination (SOLO's 1v1/2v2/3v3, every multiplayer
// mode but FFA and practice) nobody comes back until a side is out, so a
// fallen player watches a living teammate: behind the death screen, which
// stays as it is (owner: "the spectate should happen behind the death
// screen, not replace it"), the camera follows the teammate (framed in the
// half the death card leaves clear: renderer.js `spectating`)
// (main.js passes the renderer a stand-in of your sim at their place:
// `spectateView`), and this bar names who you watch, with arrows either side.
// ← / → (A / D), the arrows, or a click or tap on the world move to the next
// teammate. Only your own side is ever listed. (The score between points:
// score-flash.js.)
// Seconds after the death screen comes up before it turns into spectating.
export const SPECTATE_AFTER = 3.5; // (owner: the death screen shows a little longer first)

// Which of `list` (teammates: { id, name, x, z }) is watched: the one watched
// before while still standing, else the first. `step` moves along the list.
export function pickWatched(list, current, step = 0) {
  if (!list.length) return null;
  const at = list.findIndex(m => m.id === current);
  const i = ((Math.max(0, at) + (at < 0 ? 0 : step)) % list.length + list.length) % list.length;
  return list[i];
}

// Your sim as the renderer should draw it while you watch `mate`: the same
// sim, with the player standing where the teammate is (camera, room, roofs
// and sight lines follow them; your own body stays where it fell).
export function spectateView(sim, mate) {
  const view = Object.create(sim);
  view.player = { ...sim.player, x: mate.x, z: mate.z, vx: 0, vz: 0, hp: 0, dead: true };
  return view;
}

export function createSpectate(parent, { change } = {}) {
  const bar = document.createElement('div');
  bar.id = 'spectate-bar'; bar.className = 'spectate-bar hidden'; bar.setAttribute('role', 'status'); bar.setAttribute('aria-live', 'polite');
  bar.innerHTML = '<button type="button" class="plain-text spectate-step" data-step="-1" aria-label="Previous teammate"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5 8 12l7 7"/></svg></button>'
    + '<div class="spectate-who"><small>spectating</small><strong></strong><span class="spectate-count"></span></div>'
    + '<button type="button" class="plain-text spectate-step" data-step="1" aria-label="Next teammate"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg></button>';
  parent.append(bar);
  let list = [], watched = null, shown = '';
  for (const button of bar.querySelectorAll('.spectate-step')) button.onclick = event => { event.stopPropagation(); api.step(Number(button.dataset.step)); };
  const render = () => {
    const key = watched ? watched.id + '|' + watched.name + '|' + list.length + '|' + (watched.colour || '') : '';
    if (key === shown) return; shown = key;
    const name = bar.querySelector('strong');
    name.textContent = watched ? watched.name : '';
    name.style.color = watched?.colour || '';
    const i = watched ? list.findIndex(m => m.id === watched.id) : -1;
    bar.querySelector('.spectate-count').textContent = list.length > 1 ? `${i + 1} of ${list.length} · ${globalThis.matchMedia?.('(pointer: coarse)').matches ? 'tap' : 'arrows or click'} to switch` : '';
    for (const button of bar.querySelectorAll('.spectate-step')) button.hidden = list.length < 2;
  };
  const api = {
    get open() { return !bar.classList.contains('hidden'); },
    // The teammate being watched this frame (null: nobody left to watch).
    get watched() { return api.open ? watched : null; },
    // Every frame while spectating: the living teammates, in a steady order.
    update(mates) {
      list = mates;
      const next = pickWatched(list, watched?.id);
      if (next?.id !== watched?.id) change?.(next);
      watched = next;
      bar.classList.toggle('hidden', !watched);
      render();
      return watched;
    },
    step(by) {
      if (list.length < 2) return;
      watched = pickWatched(list, watched?.id, by); change?.(watched); render();
    },
    hide() { bar.classList.add('hidden'); list = []; watched = null; shown = ''; },
  };
  return api;
}
