// QUICK PLAY on the page (main.js calls installQuickPlay once): the title's
// QUICK PLAY button, the matchmaking line (net/quick-queue.js), the bot fight,
// the PLAYER FOUND prompt (ui/quick-prompt.js), the adapting bot
// (bots/adaptive-bot.js) and the end card's QUICK PLAY AGAIN. The decisions
// are quick-play.js's; this file only connects them to the game.
//
// The bot fight is BOTS' 1V1 (duel.js) with its usual rules (the duel circle,
// rounds: DUEL_DEFAULTS' 5) against one Normal, blend-style bot with a random
// weapon; you play your last-used weapon (`deadstab-last-weapon`, kept while
// any game runs; else BOTS' saved pick; else the default). It plays on this
// page's map when BOTS can play there (no reload, so the matchmaking line
// stays open), else on the first BOTS map (a reload: the line reopens there,
// `deadstab.quick-resume`).
import { openQuickQueue } from './net/quick-queue.js';
import { playerId } from './net/player-id.js';
import { NETWORK } from './config/network.js';
import { createQuickPlay } from './quick-play.js';
import { createAdaptiveWatch } from './bots/adaptive-bot.js';
import { createQuickPrompt } from './ui/quick-prompt.js';
import { showBusy, hideBusy } from './ui/busy-screen.js';
import { setLaunch, launchTo } from './launch.js';
import { savedName, saveName } from './online-play.js';
import { duelParam, DUEL_DEFAULTS } from './duel.js';
import { readDuelChoices } from './ui/duel-menu.js';
import { soloMaps, DEFAULT_MAP } from './maps.js';
import { DEFAULT_WEAPON } from './items.js';
import { playableOr } from './weapon-maintenance.js';
import { readLastWeapon, saveLastWeapon } from './ui/remembered-choices.js';

const RESUME = 'deadstab.quick-resume';
const read = (store, key) => { try { return globalThis[store]?.getItem(key) ?? null; } catch { return null; } };
const write = (store, key, value) => { try { if (value === null) globalThis[store]?.removeItem(key); else globalThis[store]?.setItem(key, value); } catch { /* private window */ } };
// The bot fight's settings: BOTS' 1V1 at its defaults, a Normal bot.
export const QUICK_BOT_FIGHT = Object.freeze({ ...DUEL_DEFAULTS, mode: '1v1', skill: 'normal', botWeapon: null });

let installed = null;
// returnToMenu (main.js): quick play stops, unless it is what is leaving the
// bot fight for an online match.
export function quickPlayLeft() { installed?.left(); }

// `gameServer`: a development build's ?server= (else NETWORK.gameServer);
// `devFlags`: what a reload must carry for it. `toast(text, ms)`.
export function installQuickPlay({ $, map, sim, duel, bots, online, start, returnToMenu, toast, gameServer = null, devFlags = '' }) {
 const button = $('quick-play');
 if (button) button.hidden = false;
 // The name online: the saved username, else a default (one per page; saved
 // as the username only when a match is joined, so a page that reloads onto
 // the match's map joins with it).
 let fallback = null;
 const quickName = () => savedName().trim() || (fallback ||= 'player' + String(Math.floor(Math.random() * 9000) + 1000));
 const lastWeapon = () => {
  const saved = readLastWeapon();
  if (saved) return saved;
  return playableOr(readDuelChoices().weapon || DEFAULT_WEAPON);
 };
 const botMap = () => (soloMaps(map).some(m => m.id === map.id) && !map.training ? map.id : soloMaps()[0]?.id || DEFAULT_MAP);
 function botFight() {
  const target = botMap(), weapon = lastWeapon();
  const query = new URLSearchParams({ map: target, weapon, play: '1', mode: 'duel', duel: duelParam(QUICK_BOT_FIGHT) });
  if (map.id === target) { setLaunch(query); void start(weapon); return; }
  // Another map: the page reloads into the fight and opens the line again there.
  write('sessionStorage', RESUME, '1'); showBusy(); launchTo(query);
 }
 let keep = false;
 const prompt = createQuickPrompt($('game'), { accept: () => quick.accept(), ignore: () => quick.ignore() });
 const watch = createAdaptiveWatch();
 const quick = createQuickPlay({
  openQueue: handlers => {
   if (!NETWORK.enabled) throw new Error('offline');
   return openQuickQueue({ url: gameServer || NETWORK.gameServer, pid: playerId(), name: quickName(), handlers });
  },
  botFight,
  // Out of the bot fight, into the online match (quick play carries on).
  leaveBotFight: () => { keep = true; try { returnToMenu(); } finally { keep = false; } },
  // The room's map is this page's: join here. Another: reload onto it and join there.
  join: async match => {
   const name = quickName();
   if (match.map && match.map !== map.id) { saveName(name); showBusy(); location.href = '?map=' + encodeURIComponent(match.map) + '&join=' + encodeURIComponent(match.code) + '&autojoin=1' + devFlags; return; }
   await online.request({ role: 'join', code: match.code, name, via: 'server' }, () => {});
  },
  prompt,
  busy: on => (on ? showBusy() : hideBusy()),
  toast: text => toast(text, 3200),
 });
 if (button) button.onclick = () => quick.begin();
 // A page that reloaded into the bot fight: the line opens again once it is on.
 let resume = read('sessionStorage', RESUME) === '1';
 write('sessionStorage', RESUME, null);
 let remembered = null;
 const api = {
  quick, watch, prompt,
  // Leaving a game: quick play stops (not while it moves you online itself).
  left() { if (!keep) quick.stop(); },
  // The end card's main button: look again (an online match, or a new bot fight).
  again() { returnToMenu(); quick.begin(); },
  // Once a frame.
  frame() {
   const playing = globalThis.document?.body?.classList.contains('playing');
   if (resume && playing && duel.active) { resume = false; quick.begin({ inBots: true }); }
   quick.tick();
   if (quick.state === 'bots' && duel.active) watch.frame(duel, bots);
   // Your last-used weapon (the next bot fight's), while any game runs.
   if (playing && sim.weapon && sim.weapon !== remembered) { remembered = sim.weapon; saveLastWeapon(sim.weapon); }
  },
  // The end card's buttons in quick play (else null: the usual ones).
  // `where`: 'solo' (the bot fight) or 'online'.
  endButtons(where) {
   const mine = where === 'online' ? !!online.session?.transport?.room?.quick : quick.state === 'bots' && duel.active;
   return mine ? [{ id: 'quick-again', label: 'QUICK PLAY AGAIN', primary: true }, { id: 'menu', label: 'MAIN MENU' }] : null;
  },
 };
 installed = api;
 if (import.meta.env?.DEV) globalThis.__quick = api;
 return api;
}
