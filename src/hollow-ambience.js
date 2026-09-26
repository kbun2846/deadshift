// Where Hollow Wick's crows (effects/crows.js) and its soundscape
// (audio-hollow.js) meet the view and the Soundscape (stage 3, s3-sound).
// main.js makes one after the view (before the shader warm-up, so the crows'
// meshes are warmed with everything else) and feeds it the game's events and
// frames. On every other map it is null and nothing here runs.
import { Crows, hasCrows } from './effects/crows.js';
import { HollowSound, hasHollowSound } from './audio-hollow.js';

export function hollowAmbience(map, view, sound) {
  if (!hasCrows(map) && !hasHollowSound(map)) return null;
  const crows = hasCrows(map) && view ? new Crows(view, map) : null;
  const voice = hasHollowSound(map) && sound ? (sound.hollow = new HollowSound(sound, { map, view })) : null;
  // The crows' calls are placed sounds; the water's are too.
  if (crows && voice) crows.onCall = (kind, x, y, z, n) => voice.crow(kind, x, y, z, n);
  // When everything falls silent, the crows do too (and a while longer).
  if (crows && voice) voice.onSilence = seconds => crows.flock.quiet(seconds);
  if (voice && view?.waterFX) view.waterFX.onSound = (kind, x, z, strength) => voice.water(kind, x, z, strength);
  const players = [];
  return {
    crows, voice,
    // Every event of yours (shooter: you) and of everyone else (their shooter
    // and slot: whose body a death leaves, one each).
    event(e, shooter, slot) { crows?.event(e, shooter, slot); },
    // Each drawn frame: the living players scare the crows; indoors the beds soften.
    update(dt, sim, others = view?.remotePlayers || []) {
      players.length = 0;
      const me = sim?.player;
      if (me && !me.dead && !(me.hp <= 0)) players.push(me);
      // (Not those the view hides from you: a crow taking off would give them away.)
      for (const o of others) if (!o.dead && !(o.hp <= 0) && view?.remote?.avatars?.get(o.id)?.root?.visible !== false) players.push(o);
      if (!players.length && me) players.push(me); // (dead: the camera still stands there)
      const room = sim?.interior?.id ?? null;
      if (voice) voice.indoors = !!room;
      // Which perch props stand, twice a second (a reset, a restore, a late join).
      if (crows && sim?.props && (this.syncIn = (this.syncIn ?? 0) - dt) <= 0) { this.syncIn = .5; crows.flock.syncBroken(sim.props); }
      crows?.update(dt, players, room);
    },
    reset() { crows?.reset(); voice?.reset(); },
  };
}
