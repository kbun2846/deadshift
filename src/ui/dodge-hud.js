// Dodge charges (owner, 2026-10-01: "The dodge like bars, the refill, the
// dodge things that refill should be clearer and more prominent ... This
// applies to every weapon, everything in the game, on keyboard and mobile.
// The dodge thing should be better.").
//
// One row on the weapon panel (#dodge-stamina) and the same charges inside
// the touch DODGE button (#touch-dodge). Every weapon has its own number of
// dodges (sim.maxStamina, 1-3) and refill pace, but they all read the same:
// a slanted cell per dodge; a ready one is solid and bright, the one
// refilling fills left to right with a bright leading edge, the ones after it
// are an empty track. A charge coming back pops (a short flash); pressing
// dodge with none ready shakes the row and the button red for a moment.
//
// The display logic is pure (dodgeReadout, createDodgeTracker; tests in
// tests/dodge-hud.test.js). The DOM side writes only on change (dom-writes.js)
// and slides the fill with a transform (eased by a CSS transition as long as
// the tick), so there is no layout work on the 80 ms HUD tick.
import { RULES } from '../config/gameplay.js';
import { setAttr, setStyle } from './dom-writes.js';

// How long the pop and the shake are shown (ms); the attribute is cleared
// afterwards so a panel shown again (display none -> block replays CSS
// animations) does not replay an old one.
export const DODGE_FLASH = Object.freeze({ pop: 520, deny: 420 });
// Fill steps: the fill is written in 1/200ths so a slow refill is not a new
// style value every tick for nothing.
const STEPS = 200;

// What the row shows for `stamina` (0..max, fractional while refilling).
// Each dodge costs one charge (RULES.dodgeStaminaCost).
export function dodgeReadout(stamina, max, cost = RULES.dodgeStaminaCost) {
  const count = Math.max(0, Math.round(max / cost));
  const value = Math.max(0, Math.min(count, (stamina || 0) / cost));
  const ready = Math.min(count, Math.floor(value + 1e-8));
  const fraction = ready >= count ? 0 : Math.max(0, Math.min(1, value - ready));
  const cells = [];
  for (let i = 0; i < count; i++) {
    const fill = i < ready ? 1 : i === ready ? Math.round(fraction * STEPS) / STEPS : 0;
    cells.push({ state: i < ready ? 'ready' : i === ready ? 'filling' : 'empty', fill });
  }
  return { max: count, ready, fraction, full: ready >= count, cells };
}

// Follows the readout from tick to tick and reports what changed: which
// charges just came back (`regained`, cell indexes) and whether a dodge was
// just pressed with none to spend (`denied`).
// The sim holds a dodge pressed too early for RULES.dodgeBuffer
// (player.dodgeQueued, refreshed on every press, cleared when it happens), so
// a queue that is new or refreshed while short of a charge is a refused press.
// A change of weapon (a new max) or a death/respawn resets without flashing.
export function createDodgeTracker(cost = RULES.dodgeStaminaCost) {
  let lastReady = -1, lastMax = -1, lastQueued = 0, lastAlive = false;
  return function step({ stamina, max, queued = 0, alive = true }) {
    const readout = dodgeReadout(stamina, max, cost);
    const fresh = readout.max !== lastMax || !alive || !lastAlive;
    const regained = [];
    if (!fresh && readout.ready > lastReady) for (let i = Math.max(0, lastReady); i < readout.ready; i++) regained.push(i);
    const short = (stamina || 0) + 1e-8 < cost;
    const denied = alive && !fresh && short && queued > 0 && (lastQueued <= 0 || queued > lastQueued + 1e-6);
    lastReady = readout.ready; lastMax = readout.max; lastQueued = queued || 0; lastAlive = alive;
    return { readout, regained, denied };
  };
}

const cellHTML = () => { const cell = document.createElement('i'); cell.className = 'dodge-cell'; const fill = document.createElement('b'); fill.className = 'dodge-fill'; cell.append(fill); return cell; };

// One set of cells (the panel row or the touch button's).
function cellGroup(host) {
  let cells = [];
  return {
    host,
    sync(readout, now, popUntil) {
      if (cells.length !== readout.max) { cells = Array.from({ length: readout.max }, cellHTML); host.replaceChildren(...cells); }
      for (let i = 0; i < cells.length; i++) {
        const c = readout.cells[i], el = cells[i];
        setAttr(el, 'data-state', c.state);
        // Slid in from the left (not scaled), so its bright leading edge stays crisp.
        setStyle(el.firstChild, 'transform', `translateX(${((c.fill - 1) * 100).toFixed(1)}%)`);
        setAttr(el, 'data-pop', popUntil[i] > now ? 'on' : '');
      }
    },
  };
}

// root: #dodge-stamina on the weapon panel; touchButton: #touch-dodge (its
// label is rebuilt by main.js on a weapon change, so the charges are put back
// in when missing).
export function createDodgeHUD(root, touchButton, { clock = () => performance.now() } = {}) {
  const track = createDodgeTracker();
  root.replaceChildren();
  const word = document.createElement('span'); word.className = 'dodge-word'; word.textContent = 'dodge'; word.setAttribute('aria-hidden', 'true');
  const cellsHost = document.createElement('span'); cellsHost.className = 'dodge-cells';
  root.append(word, cellsHost);
  const panel = cellGroup(cellsHost);
  const touchHost = document.createElement('span'); touchHost.className = 'touch-dodge-charges'; touchHost.setAttribute('aria-hidden', 'true');
  const touch = cellGroup(touchHost);
  let popUntil = [], denyUntil = 0, denyToken = 'a';
  return {
    update(sim) {
      const p = sim.player, now = clock();
      const { readout, regained, denied } = track({ stamina: p.stamina, max: sim.maxStamina, queued: p.dodgeQueued || 0, alive: !p.dead && p.hp > 0 });
      if (popUntil.length !== readout.max) popUntil = new Array(readout.max).fill(0);
      for (const i of regained) popUntil[i] = now + DODGE_FLASH.pop;
      if (denied) { denyUntil = now + DODGE_FLASH.deny; denyToken = denyToken === 'a' ? 'b' : 'a'; }
      const deny = denyUntil > now ? denyToken : '';
      panel.sync(readout, now, popUntil);
      setAttr(root, 'data-ready', String(readout.ready)); setAttr(root, 'data-max', String(readout.max));
      setAttr(root, 'data-deny', deny);
      setAttr(root, 'aria-label', `${readout.ready} of ${readout.max} ${readout.max === 1 ? 'dodge' : 'dodges'} ready`);
      if (touchButton) {
        if (touchHost.parentNode !== touchButton) touchButton.append(touchHost);
        touch.sync(readout, now, popUntil);
        setAttr(touchButton, 'data-dodge', readout.ready ? 'ready' : 'empty');
        setAttr(touchButton, 'data-dodge-pop', regained.length || popUntil.some(t => t > now) ? 'on' : '');
        setAttr(touchButton, 'data-deny', deny);
      }
    },
  };
}
