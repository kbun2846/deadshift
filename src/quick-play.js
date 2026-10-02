// QUICK PLAY (owner, 2026-10-01: "Make it so that it loads into an online
// multiplayer match if there's another person waiting for quickplay, if not
// just load the player into a bot fight against a normal bot that
// slightly/subtly adapts to the player's gameplay").
//
// The title's QUICK PLAY button runs this little state machine (no DOM, no
// game code: main.js hands it what it needs, so tests drive it directly):
//
//   idle ─ begin() ─> connecting ──match──> joining ──> online
//                        │                     ▲ (accept)
//              queued / no answer in           │
//              QUICK_PLAY.answerWait /    bots ── match ──> prompt "PLAYER FOUND · JOIN?"
//              server unreachable ──────> bots     (ignored for promptSeconds: it goes, play on)
//
//  - connecting: the matchmaking line (net/quick-queue.js) is opening and the
//    loading wheel shows, for at most `answerWait` seconds.
//  - match while connecting: someone was waiting (or a quick room is open):
//    straight into that online room (the ordinary JOIN by code).
//  - queued, no answer, refused or unreachable: the bot fight starts at once
//    (a 1V1 against a Normal bot that adapts: bots/adaptive-bot.js). With a
//    line open, the page stays in the queue for `queueSeconds`.
//  - match during the bot fight: the prompt; JOIN leaves the bot fight and
//    joins; ignoring it keeps playing (the server withdraws the offer when
//    that room stops taking people, and may offer the next one).
//  - stop(): the menu (or leaving a game) closes the line and the prompt.
export const QUICK_PLAY = Object.freeze({
 answerWait: 2.5,    // seconds to wait for the server's word before the bot fight starts anyway
 queueSeconds: 240,  // seconds a bot fight stays in the queue looking for a player
 promptSeconds: 20,  // seconds the PLAYER FOUND prompt waits for an answer
});

// `openQueue(handlers)`: opens the matchmaking line (net/quick-queue.js
// openQuickQueue with the url, pid and name filled in), returns { close() }.
// `botFight()`: starts the local bot fight. `leaveBotFight()`: ends it.
// `join(match)`: joins the online room ({ code, map, mode }); a promise,
// rejected with an Error whose message is shown when it fails.
// `prompt`: { show(match, seconds), hide() }. `busy(on)`: the loading wheel.
// `toast(text)`. `now()`: seconds. `later(fn, ms)`: a timer (so the wait for
// an answer ends on time even if frames stop coming; tests pass their own).
export function createQuickPlay({ openQueue, botFight, leaveBotFight = () => {}, join, prompt = { show() {}, hide() {} }, busy = () => {}, toast = () => {}, now = () => performance.now() / 1000, later = (fn, ms) => setTimeout(fn, ms), settings = QUICK_PLAY }) {
 let state = 'idle', line = null, offer = null, since = 0, busyOn = false, serial = 0;
 const setBusy = on => { if (busyOn !== on) { busyOn = on; busy(on); } };
 const closeLine = () => { const l = line; line = null; try { l?.close(); } catch {} };
 const dropOffer = () => { if (offer) { offer = null; prompt.hide(); } };
 // Into the bot fight (from connecting only). `note`: a toast saying why.
 const toBots = note => {
  if (state !== 'connecting') return;
  state = 'bots'; since = now(); setBusy(false);
  botFight();
  if (note) toast(note);
 };
 async function goOnline(match) {
  const mine = ++serial;
  state = 'joining'; dropOffer(); closeLine(); setBusy(true);
  try { await join(match); if (mine === serial && state === 'joining') { state = 'online'; setBusy(false); } }
  catch (error) {
   if (mine !== serial || state !== 'joining') return;
   setBusy(false);
   toast(String(error?.message || 'Could not join that game.').toUpperCase());
   // Back to a bot fight, still looking (another offer comes as the prompt,
   // never an automatic retry of the same room).
   state = 'idle'; api.begin({ inBots: true }); botFight();
  }
 }
 const handlers = mine => ({
  onQueued() {
   if (mine !== serial) return;
   if (state === 'connecting') toBots('NOBODY WAITING · FIGHT A BOT WHILE WE LOOK');
   // (An offer withdrawn: that room stopped taking people.)
   else dropOffer();
  },
  onMatch(match) {
   if (mine !== serial) return;
   if (state === 'connecting') { void goOnline(match); return; }
   if (state === 'bots' && !offer) { offer = { ...match, until: now() + settings.promptSeconds }; prompt.show(match, settings.promptSeconds); }
  },
  onEnd(reason, refused = false) {
   if (mine !== serial) return;
   line = null;
   // Unreachable, refused, or closed before it answered: the bot fight, no
   // queue. (Refused: the server's words, maintenance or an update, say why.)
   if (state === 'connecting') toBots(refused && reason ? String(reason).toUpperCase() : 'PLAYING A BOT · NO ONLINE MATCH RIGHT NOW');
   else if (state === 'bots') dropOffer();
  },
 });
 const api = {
  get state() { return state; },
  // Looking for a player in the background (the bot fight with a line open).
  get searching() { return !!line && (state === 'bots' || state === 'connecting'); },
  get offer() { return offer ? { ...offer } : null; },
  // Quick play's bot fight or its online match is what is being played.
  get active() { return state === 'bots' || state === 'joining' || state === 'online'; },
  // QUICK PLAY: look for a match; the bot fight if there is none.
  // `{ inBots: true }`: the bot fight is already on (a page reloaded into
  // it): only the line opens.
  begin({ inBots = false } = {}) {
   if (state !== 'idle') api.stop();
   const mine = ++serial;
   state = inBots ? 'bots' : 'connecting'; since = now();
   if (!inBots) { setBusy(true); later(() => { if (mine === serial) api.tick(); }, settings.answerWait * 1000 + 50); }
   try { line = openQueue(handlers(mine)); }
   catch { line = null; if (!inBots) toBots('PLAYING A BOT · NO ONLINE MATCH RIGHT NOW'); }
  },
  // Once a frame: the wait for an answer, the prompt's time, the queue's time.
  tick() {
   const t = now();
   if (state === 'connecting' && t - since >= settings.answerWait) toBots('NOBODY WAITING · FIGHT A BOT WHILE WE LOOK');
   if (offer && t >= offer.until) dropOffer();
   if (state === 'bots' && line && !offer && t - since >= settings.queueSeconds) closeLine();
  },
  // PLAYER FOUND · JOIN: out of the bot fight and into that room.
  accept() {
   if (state !== 'bots' || !offer) return false;
   const match = { code: offer.code, map: offer.map, mode: offer.mode };
   leaveBotFight();
   void goOnline(match);
   return true;
  },
  // The prompt's X (or letting it run out): play on.
  ignore() { dropOffer(); },
  // The menu: everything quick play had going stops (the game itself is the caller's).
  stop() { serial++; closeLine(); dropOffer(); setBusy(false); state = 'idle'; },
 };
 return api;
}
