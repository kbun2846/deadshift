// The feel pass (owner, 2026-10-01: "Make the kills feel amazing and do that
// for FFA too, and the spawn protection. ... then do all the feel and
// feedback things"): everything that makes a hit, a kill, a streak and low
// health felt, in one place so main.js only hands it what it already has.
//
// What it does (numbers in config/feel.js):
// - Hit markers by damage (hit-tiers.js, hit-markers.js): a tick for a graze,
//   bigger for a big hit, a red X for a kill, a one-shot's own burst; a
//   grey ring when a shot meets spawn protection.
// - A kill of a player or a robot: the sharp kill sound (a one-shot its own,
//   audio-feel.js), a ~40 ms hitstop and a small screen kick toward the kill
//   (less on phones, none with reduced motion).
// - Streaks and shutdowns (streaks.js): your own as a banner with a call
//   (streak-banner.js); others' notable ones as kill-feed lines in FFA.
//   Online the host counts them (net/arena.js: each feed line's `streak`,
//   `ended`, `endedBy`); offline BotMatch's death log feeds the same counter.
// - The round's (or match's) last kill: a short slow motion (time-feel.js).
// - Low health: the screen's edge pulses with a heartbeat (low-health.js).
// - Spawn protection's shimmer on every protected body (render/spawn-shimmer.js).
//
// The rule for time (owner): hitstop and slow motion never change the
// simulation's time online. They set the renderer's effect clock
// (WorldView.timeScale: effects, blood, bodies falling) and, offline only,
// simScale() scales the fixed-step accumulator (main.js), which keeps every
// tick exactly the same. Everything here runs on real seconds.
import { FEEL } from '../config/feel.js';
import { createTimeFeel, createFinaleWatch } from './time-feel.js';
import { createLowHealth } from './low-health.js';
import { createHitBatch, killKind, markerKind, hitWeight } from './hit-tiers.js';
import { createHitMarkers } from './hit-markers.js';
import { createStreakBanner } from './streak-banner.js';
import { createLowHealthEdge } from './low-health-edge.js';
import { createStreaks, recordDeath, streakNews } from '../streaks.js';
import { feedNote } from '../ui/multiplayer-hud.js';
import { SpawnShimmer } from '../render/spawn-shimmer.js';
import { killSound, streakSound, shutdownSound, finaleSound, heartbeat } from '../audio-feel.js';

const reducedMotion = () => { try { return !!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };

// `root`: the #game box; `markerHost`: the old #hit-marker element; `view`
// the WorldView; `sound` the Soundscape; `mpHud` the multiplayer HUD (its
// kill feed); `player()` your sim's player; `touch()` whether this is a phone.
// `onNews(news)`: each piece of your own streak news (the match summary's shutdowns).
export function createFeel({ root, markerHost, view, sound, mpHud, player, touch = () => false, cfg = FEEL, onNews = null }) {
 const time = createTimeFeel(cfg), finale = createFinaleWatch(cfg.slowmo.window), low = createLowHealth(cfg.lowHealth);
 const batch = createHitBatch(), markers = createHitMarkers(markerHost, cfg.marker);
 const banner = createStreakBanner(root, cfg.banner), edge = createLowHealthEdge(root);
 const shimmer = new SpawnShimmer(view);
 const streaks = createStreaks();
 let clock = 0, duelMatch = null, duelEnded = false;
 const seen = { number: null, played: 0, phase: null }; // (online: the last round state)
 const offLine = { killer: null, killerName: null, victims: [null], victimNames: [null], streak: 0, ended: 0, endedBy: null };

 const kick = (e, strength) => {
  if (!view.motion || reducedMotion() || !view.kick) return;
  const p = player(), dx = e.x - p.x, dz = e.z - p.z, d = Math.hypot(dx, dz);
  if (!(d > .01)) return;
  const amp = strength * (touch() ? cfg.kill.touchKick : 1);
  view.kick.x += dx / d * amp; view.kick.z += dz / d * amp;
 };
 const slowmo = () => { time.slowmo(); finaleSound(sound); view.timeScale = time.scale; };
 const death = () => { if (finale.death(clock)) slowmo(); };
 const roundEnded = () => { if (finale.ended(clock)) slowmo(); };
 // A piece of streak news: yours on the banner, everyone's in an FFA feed.
 const announce = (news, myId, feedNow, inFeed) => {
  for (const n of news) {
   if (n.mine) { onNews?.(n); banner.show(n); if (n.kind === 'shutdown') shutdownSound(sound); else streakSound(sound, n.n); }
   else if (inFeed) mpHud.addNote(feedNote(n, myId), feedNow);
  }
 };

 const api = {
  banner, markers, edge, time, low, shimmer,
  // Every event of your own sim (online: the host's word for it), before the
  // view and the sound see it (so the old kill sound can stand aside).
  event(e) {
   const t = e.type;
   if (t === 'hit' || t === 'kill') {
    batch.add(e);
    const kind = killKind(e);
    if (kind === 'kill' || kind === 'oneShot') {
     const one = kind === 'oneShot';
     e.felt = true; killSound(sound, one);
     time.hitstop(one ? cfg.kill.oneShotStop : cfg.kill.hitstop); view.timeScale = time.scale;
     kick(e, one ? cfg.kill.oneShotKick : cfg.kill.kick);
    }
    return;
   }
   if (t === 'guardBlock') { const at = view.screenPoint(e.x, e.z); markers.show('blocked', at.x, at.y, .5); return; }
   if (t === 'playerDamage' && e.damageType !== 'ichorCost') { low.hurt(); return; }
   if (t === 'playerDeath') { low.reset(); edge.clear(); death(); }
  },
  // Online: the kill feed's new lines (the host's), with streaks on them.
  feed(lines, myId, feedNow, mode) {
   for (const line of lines) {
    death();
    announce(streakNews(line, myId), myId, feedNow, mode !== 'practice');
   }
  },
  // The simulation's clock this frame (main.js's fixed-step accumulator):
  // online never anything but 1.
  simScale(online) { return time.simScale(online); },
  // Once a frame, after the steps: `s` = { sim, online, bots, duel, started,
  // paused, live (you are up and playing), elapsed, feedNow }.
  frame(dt, s) {
   if (!s.paused) clock += dt;
   time.step(s.paused ? 0 : dt);
   view.timeScale = s.started ? time.scale : 1;
   // This frame's hits, one marker per target.
   for (const h of batch.take()) {
    const kind = markerKind(h.damage, h.kill), at = view.screenPoint(h.x, h.z);
    markers.show(kind, at.x, at.y, kind === 'kill' || kind === 'oneshot' ? 1 : hitWeight(h.damage));
   }
   markers.update(dt); banner.update(dt);
   // Offline (BOTS, practice with robots): BotMatch's death log, streaks and shutdowns.
   const bots = s.bots, duel = s.duel;
   if (!s.online?.active && bots) {
    if (duel?.active && duel.matchId !== duelMatch) { duelMatch = duel.matchId; streaks.reset(); finale.reset(); duelEnded = false; }
    const ffa = !!(duel?.active && duel.ffa);
    mpHud.feedShown = ffa && s.started;
    const myId = s.sim.player.id;
    const log = bots.deaths;
    for (let i = 0; log && i < log.length; i++) {
     const d = log[i];
     death();
     const { streak, ended } = recordDeath(streaks, d.victim, d.killer);
     if (d.killer == null) continue;
     offLine.killer = d.killer; offLine.killerName = d.killerName; offLine.victims[0] = d.victim; offLine.victimNames[0] = d.victimName;
     offLine.streak = streak; offLine.ended = ended; offLine.endedBy = d.victim;
     announce(streakNews(offLine, myId), myId, s.feedNow, ffa);
    }
    if (log) log.length = 0;
    if (ffa) mpHud.renderFeed(s.feedNow);
    // A round (or the match) just ended: the last kill slows down.
    const ended = !!(duel?.active && (duel.pointBreak || duel.finalBreak || duel.over));
    if (ended && !duelEnded) roundEnded();
    duelEnded = ended;
   }
   // Online: the round state the host sends (elimination: one more round
   // played; FFA: the match over); the kill that did it came in the feed.
   const m = s.online?.active ? s.online.match?.() : null;
   if (m && seen.number === m.number && ((m.elimination && (m.played || 0) > seen.played) || (seen.phase === 'playing' && m.phase === 'results'))) roundEnded();
   seen.number = m ? m.number : null; seen.played = m?.played || 0; seen.phase = m ? m.phase : null;
   // Low health: the edge and the heartbeat, only while you are up and playing.
   const p = s.sim.player, st = low.step(dt, p.hp, p.maxHp, s.live);
   edge.set(st.level, st.pulse);
   if (st.beat) heartbeat(sound, st.volume);
   // Spawn protection: a shimmer on every protected body you can see.
   shimmer.begin(s.elapsed);
   if (s.started) {
    if (p.guard > 0 && !p.dead && view.player?.visible) shimmer.add(view.player.position.x, view.player.position.z, p.guard, view.player.position.y);
    for (const o of view.remotePlayers || []) if (o.guard > 0) { const a = view.remote?.avatars?.get(o.id); shimmer.add(o.x, o.z, o.guard, a ? a.root.position.y : null, a ? a.root.visible : true); }
   }
   shimmer.end();
  },
  // Leaving a game, a restart: nothing carries over.
  clear() {
   time.clear(); low.reset(); edge.clear(); markers.clear(); banner.clear(); batch.take(); shimmer.clear(); streaks.reset(); finale.reset();
   duelMatch = null; duelEnded = false; seen.number = seen.phase = null; seen.played = 0; view.timeScale = 1; mpHud.feedShown = false;
  },
  // A new life: the warning stops (it starts again if you are low again).
  revive() { low.reset(); edge.clear(); },
 };
 return api;
}
