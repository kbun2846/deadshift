// The living menu on the page (attract-mode.js is the match itself): when it
// starts, how often it is drawn, how it fades in under the menu, and that it
// is gone the moment anything else wants the screen. main.js makes it once,
// calls `schedule()` when the menu is shown (the page has loaded, or a game
// was left), `frame(dt)` from its frame loop whenever no game is running, and
// `stop()` as a game starts (before anything of the game is set up).
//
// Cost (it must be cheap: phones and laptops on Performance and Potato):
//  - off on Potato, in software drawing, on small devices, with reduced
//    motion, on the tutorial's range (attractAllowed); then the menu keeps its
//    still dark backdrop, exactly as before;
//  - drawn at most ATTRACT.fps (30) a second, at a share of the preset's own
//    drawing size (ATTRACT.scale; less on a phone), 3 bots on a phone, 4 else;
//  - nothing while the tab is hidden (no frames come) or a game, the online
//    lobby or the touch layout editor has the screen;
//  - it starts ATTRACT_START after the menu is shown, so the menu's first
//    paint and the title's intro are not held up by it;
//  - the bots' thinking over THINK_BUDGET (150 ms a second): one bot fewer,
//    down to two;
//  - a device that cannot keep it smooth (under SLOW.fps on screen for
//    SLOW.window seconds once it has settled) stops it and is left alone for
//    SLOW.days days (`deadstab-attract`).
// Nothing of it is heard. It never changes a setting.
import { AttractMatch, ATTRACT, attractAllowed, attractSpot } from './attract-mode.js';

export const ATTRACT_START = 700;      // ms after the menu shows
export const SLOW = Object.freeze({ fps: 20, settle: 2.5, window: 4, days: 7 });
// The bots' thinking over budget (ms of stepping per second, over a 4 s
// window): one bot fewer, down to two.
export const THINK_BUDGET = Object.freeze({ msPerSecond: 150, window: 4 });
export const ATTRACT_KEY = 'deadstab-attract';
const DAY = 864e5;

export function readAttractStore(storage) {
 try { const v = JSON.parse(storage?.getItem(ATTRACT_KEY) || '{}'); return { turn: Number.isInteger(v?.turn) && v.turn >= 0 ? v.turn : 0, slowUntil: Number.isFinite(v?.slowUntil) ? v.slowUntil : 0 }; }
 catch { return { turn: 0, slowUntil: 0 }; }
}
const writeAttractStore = (storage, value) => { try { storage?.setItem(ATTRACT_KEY, JSON.stringify(value)); } catch { /* private window */ } };

// `blocked()`: a game, the online lobby or the layout editor has the screen.
// `quality()`: the preset drawn now. `tier`: device-tier.js detectTier's
// answer. `touch()`: a phone layout. `force`: 'on' / 'off' / null (dev).
// `device()`: { memory, cores, reducedMotion } (the browser's, by default).
const browserDevice = () => ({ memory: globalThis.navigator?.deviceMemory || 0, cores: globalThis.navigator?.hardwareConcurrency || 0, reducedMotion: !!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches });
export function installAttract({ map, view, sim, blocked, quality, tier = null, touch = () => false, force = null, device = browserDevice, body = globalThis.document?.body, storage = (() => { try { return globalThis.localStorage || null; } catch { return null; } })(), random = Math.random }) {
 let match = null, timer = 0, since = 0, live = false, turnTaken = false, resume = false;
 let watch = { time: 0, frames: 0, settled: 0 }, think = { ms: 0, time: 0 };
 const env = () => ({
  map, quality: quality(), software: tier?.why === 'software drawing', ...device(),
  slowUntil: readAttractStore(storage).slowUntil, force,
 });
 const setLive = on => { if (live === on) return; live = on; body?.classList.toggle('attract-live', on); };
 function begin() {
  timer = 0;
  if (match || blocked() || !attractAllowed(env()).ok) return;
  // The next of the map's spots on each page load (one turn per load).
  const saved = readAttractStore(storage);
  if (!turnTaken) { turnTaken = true; writeAttractStore(storage, { ...saved, turn: saved.turn + 1 }); }
  const phone = touch();
  try {
   match = new AttractMatch({ map, spot: attractSpot(map, saved.turn), bots: phone ? ATTRACT.phoneBots : ATTRACT.bots, random }).start();
  } catch (error) { console.warn('Menu match unavailable:', error); match = null; return; }
  view.setResolutionScale(phone ? ATTRACT.phoneScale : ATTRACT.scale);
  view.cutCamera?.();
  since = 1; watch = { time: 0, frames: 0, settled: 0 }; think = { ms: 0, time: 0 };
 }
 function stop() {
  clearTimeout(timer); timer = 0; resume = false;
  if (!match) { setLive(false); return false; }
  const m = match; match = null; setLive(false);
  m.stop(view, sim);
  view.setResolutionScale(1);
  return true;
 }
 return {
  get active() { return !!match; },
  get live() { return live; },
  get match() { return match; },
  // The menu is showing: start a little later (if this device may).
  schedule(ms = ATTRACT_START) { clearTimeout(timer); timer = 0; if (match) return; timer = setTimeout(begin, ms); },
  stop,
  // Each display frame while no game runs.
  frame(dt) {
   // (Stopped because something else took the screen, e.g. a JOIN that went
   // nowhere: back once it has let go.)
   if (!match) { if (resume && !blocked() && !timer) { resume = false; this.schedule(); } return; }
   if (blocked()) { stop(); resume = true; return; }
   if (!attractAllowed(env()).ok) { stop(); return; }
   if (globalThis.document?.hidden) return;
   const began = performance.now(), events = match.step(dt);
   think.ms += performance.now() - began; think.time += dt;
   if (think.time >= THINK_BUDGET.window) { if (think.ms / think.time > THINK_BUDGET.msPerSecond) match.shed(); think.ms = think.time = 0; }
   match.feed(view, events);
   since += dt;
   const want = 1 / ATTRACT.fps - .004;
   if (since >= want && !view.gpuBusy?.() && !view.holdRender) {
    match.draw(view, Math.min(since, .1)); since = 0;
    setLive(true);
   }
   // The self-check: frames on screen, once it has settled in.
   if (force !== 'on' && dt > 0 && dt < 1) {
    watch.settled += dt;
    if (watch.settled > SLOW.settle) {
     watch.time += dt; watch.frames++;
     if (watch.time >= SLOW.window) {
      const rate = watch.frames / watch.time; watch.time = 0; watch.frames = 0;
      if (rate < SLOW.fps) { writeAttractStore(storage, { ...readAttractStore(storage), slowUntil: Date.now() + SLOW.days * DAY }); stop(); }
     }
    }
   }
  },
 };
}
