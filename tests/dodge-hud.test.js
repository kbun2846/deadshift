// Dodge charges on the weapon panel and the touch DODGE button (ui/dodge-hud.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { dodgeReadout, createDodgeTracker, createDodgeHUD, DODGE_FLASH } from '../src/ui/dodge-hud.js';
import { Simulation } from '../src/simulation.js';
import { RULES } from '../src/config/gameplay.js';
const make = weapon => { const s = new Simulation({ width: 80, depth: 80, spawn: { x: 0, z: 0 }, buildings: [], fences: [], props: [], targets: [] }); s.weapon = weapon; s.reset(); return s; };

test('the readout counts ready dodges and how far the next one has refilled', () => {
  const full = dodgeReadout(2, 2);
  assert.equal(full.max, 2); assert.equal(full.ready, 2); assert.equal(full.full, true); assert.equal(full.fraction, 0);
  assert.deepEqual(full.cells.map(c => c.state), ['ready', 'ready']);
  const part = dodgeReadout(1.4, 2);
  assert.equal(part.ready, 1); assert.ok(Math.abs(part.fraction - .4) < 1e-9);
  assert.deepEqual(part.cells.map(c => c.state), ['ready', 'filling']);
  assert.deepEqual(part.cells.map(c => c.fill), [1, .4]);
  const three = dodgeReadout(.25, 3);
  assert.deepEqual(three.cells.map(c => c.state), ['filling', 'empty', 'empty'], 'one refills at a time, the rest wait');
  assert.deepEqual(three.cells.map(c => c.fill), [.25, 0, 0]);
  const one = dodgeReadout(0, 1);
  assert.equal(one.ready, 0); assert.deepEqual(one.cells.map(c => c.state), ['filling']);
  // Float dust at a whole charge still counts it as ready; out-of-range input is clamped.
  assert.equal(dodgeReadout(2 - 1e-10, 2).ready, 2);
  assert.equal(dodgeReadout(5, 2).ready, 2); assert.equal(dodgeReadout(-1, 2).ready, 0);
  assert.equal(dodgeReadout(undefined, 2).ready, 0);
});

test('every weapon shows its own number of charges', () => {
  for (const weapon of ['static', 'rifle', 'shotgun', 'omen', 'sidekick', 'sightline', 'ichor', 'sheath']) {
    const sim = make(weapon);
    const r = dodgeReadout(sim.player.stamina, sim.maxStamina);
    assert.ok(r.max >= 1 && r.max <= 3, weapon);
    assert.equal(r.max, Math.round(sim.maxStamina / RULES.dodgeStaminaCost), weapon);
    assert.equal(r.ready, r.max, weapon + ' starts full');
  }
});

test('a charge coming back is reported once (the flash), a spent one is not', () => {
  const step = createDodgeTracker();
  assert.deepEqual(step({ stamina: 2, max: 2 }).regained, [], 'the first look never flashes');
  assert.deepEqual(step({ stamina: 1, max: 2 }).regained, [], 'spending one does not flash');
  assert.deepEqual(step({ stamina: 1.6, max: 2 }).regained, []);
  assert.deepEqual(step({ stamina: 2, max: 2 }).regained, [1], 'the second charge is back');
  assert.deepEqual(step({ stamina: 2, max: 2 }).regained, [], 'and only once');
  step({ stamina: .9, max: 2 });
  assert.deepEqual(step({ stamina: 2, max: 2 }).regained, [0, 1], 'two back between ticks flash both');
  // A weapon change (new max) or a respawn is a fresh start, not a refill.
  step({ stamina: 0, max: 2 });
  assert.deepEqual(step({ stamina: 1, max: 1 }).regained, [], 'new weapon');
  step({ stamina: 0, max: 1, alive: false });
  assert.deepEqual(step({ stamina: 1, max: 1 }).regained, [], 'respawned full');
});

test('dodge pressed with no charge ready is reported, once per press', () => {
  const step = createDodgeTracker();
  step({ stamina: .3, max: 2, queued: 0 });
  assert.equal(step({ stamina: .3, max: 2, queued: RULES.dodgeBuffer }).denied, true, 'a press with nothing ready');
  assert.equal(step({ stamina: .32, max: 2, queued: RULES.dodgeBuffer - .08 }).denied, false, 'the same press, still held in the buffer');
  assert.equal(step({ stamina: .34, max: 2, queued: RULES.dodgeBuffer }).denied, true, 'pressed again (the buffer refreshed)');
  assert.equal(step({ stamina: .4, max: 2, queued: 0 }).denied, false);
  // With a charge, a buffered press (e.g. mid-dodge) is not refused.
  assert.equal(step({ stamina: 1.2, max: 2, queued: RULES.dodgeBuffer }).denied, false);
  // Dead: nothing to refuse.
  const dead = createDodgeTracker(); dead({ stamina: 0, max: 1, alive: false });
  assert.equal(dead({ stamina: 0, max: 1, queued: RULES.dodgeBuffer, alive: false }).denied, false);
});

test('the sim leaves a refused press in its buffer for the HUD to see', () => {
  const sim = make('shotgun');
  const step = createDodgeTracker(), look = () => step({ stamina: sim.player.stamina, max: sim.maxStamina, queued: sim.player.dodgeQueued || 0 });
  const input = dodge => ({ moveX: 1, moveZ: 0, aimX: 1, aimZ: 0, dodge });
  look();
  sim.step(input(true)); assert.equal(look().denied, false, 'a dodge with charges happens');
  sim.player.stamina = .2; sim.player.staminaWait = 5;
  for (let i = 0; i < 20; i++) sim.step(input(false));
  look();
  sim.step(input(true)); assert.equal(look().denied, true, 'none left: refused');
});

// A small stand-in for the DOM: just what dodge-hud.js touches.
function fakeDom() {
  const make = tag => {
    const el = { tagName: tag, children: [], attrs: {}, style: { setProperty(k, v) { this[k] = v; } }, className: '', textContent: '', parentNode: null,
      get firstChild() { return this.children[0]; },
      setAttribute(k, v) { this.attrs[k] = String(v); }, getAttribute(k) { return this.attrs[k]; },
      append(...kids) { for (const k of kids) { if (k.parentNode) k.parentNode.children = k.parentNode.children.filter(c => c !== k); k.parentNode = this; this.children.push(k); } },
      replaceChildren(...kids) { for (const c of this.children) c.parentNode = null; this.children = []; this.append(...kids); } };
    return el;
  };
  return { createElement: make };
}

test('the panel row and the touch button draw the same charges, writing only on change', () => {
  const previous = globalThis.document; globalThis.document = fakeDom();
  try {
    const root = document.createElement('div'), button = document.createElement('button');
    let now = 1000;
    const hud = createDodgeHUD(root, button, { clock: () => now });
    const sim = { maxStamina: 2, player: { stamina: 2, hp: 100, dodgeQueued: 0 } };
    hud.update(sim);
    const cells = root.children[1].children;
    assert.equal(root.children[0].textContent, 'dodge');
    assert.equal(cells.length, 2);
    assert.deepEqual(cells.map(c => c.attrs['data-state']), ['ready', 'ready']);
    assert.equal(root.attrs['aria-label'], '2 of 2 dodges ready');
    const charges = button.children.find(c => c.className === 'touch-dodge-charges');
    assert.ok(charges, 'the touch button carries the charges');
    assert.equal(charges.children.length, 2);
    // Spent one, the next part refilled: the fill slides in from the left.
    sim.player.stamina = 1.25; now += 80; hud.update(sim);
    assert.deepEqual(cells.map(c => c.attrs['data-state']), ['ready', 'filling']);
    assert.equal(cells[1].children[0].style.transform, 'translateX(-75.0%)');
    assert.equal(charges.children[1].children[0].style.transform, 'translateX(-75.0%)');
    assert.equal(button.attrs['data-dodge'], 'ready');
    // Back to full: that cell pops, then the pop is cleared.
    sim.player.stamina = 2; now += 80; hud.update(sim);
    assert.equal(cells[1].attrs['data-pop'], 'on'); assert.equal(cells[0].attrs['data-pop'], '');
    assert.equal(button.attrs['data-dodge-pop'], 'on');
    now += DODGE_FLASH.pop + 1; hud.update(sim);
    assert.equal(cells[1].attrs['data-pop'], ''); assert.equal(button.attrs['data-dodge-pop'], '');
    // None ready and dodge pressed: the row and the button shake.
    sim.player.stamina = .1; now += 80; hud.update(sim);
    assert.equal(button.attrs['data-dodge'], 'empty');
    sim.player.dodgeQueued = RULES.dodgeBuffer; now += 80; hud.update(sim);
    assert.match(root.attrs['data-deny'], /^[ab]$/); assert.equal(button.attrs['data-deny'], root.attrs['data-deny']);
    const first = root.attrs['data-deny'];
    sim.player.dodgeQueued = 0; now += 80; hud.update(sim);
    sim.player.dodgeQueued = RULES.dodgeBuffer; now += 80; hud.update(sim);
    assert.notEqual(root.attrs['data-deny'], first, 'a second press restarts the shake');
    now += DODGE_FLASH.deny + 1; hud.update(sim);
    assert.equal(root.attrs['data-deny'], '');
    // main.js rebuilds the button's label on a weapon change; the charges come back.
    button.replaceChildren(); sim.maxStamina = 1; sim.player.stamina = 1; now += 80; hud.update(sim);
    assert.ok(button.children.includes(charges)); assert.equal(charges.children.length, 1); assert.equal(cells.length, 2, '(old cell list)');
    assert.equal(root.children[1].children.length, 1);
    // No writes when nothing changed.
    const writes = []; const cell = root.children[1].children[0], set = cell.setAttribute;
    cell.setAttribute = (k, v) => { writes.push(k); set.call(cell, k, v); };
    now += 80; hud.update(sim); now += 80; hud.update(sim);
    assert.deepEqual(writes, []);
  } finally { if (previous === undefined) delete globalThis.document; else globalThis.document = previous; }
});
