// Menu and button sounds: a short, dry clack for pressing anything, and a
// lower, softer, falling version for going back (back arrows, closing a panel,
// Esc). Synthesized like every other sound in the game.
//
// They run on their own small audio context rather than the game's, because
// the game's is suspended whenever play is (menus, pause, settings), which is
// exactly when these are heard. The context starts on the first gesture.
const BACK = '.menu-back, #settings-back, #map-close, .dev-code-close, #main-menu';

export function installUiSounds({ muted = () => false, level = () => .6 } = {}) {
 let ctx = null, noise = null;
 const ready = () => {
  if (!ctx) {
   const Context = window.AudioContext || window.webkitAudioContext;
   if (!Context) return null;
   ctx = new Context();
   noise = ctx.createBuffer(1, Math.floor(ctx.sampleRate * .08), ctx.sampleRate);
   const data = noise.getChannelData(0);
   for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** 3;
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
 };
 function play(kind) {
  if (muted() || !ready()) return;
  const now = ctx.currentTime, volume = Math.max(0, Math.min(1, level())) * (kind === 'back' ? .5 : .55);
  if (volume <= 0) return;
  const out = ctx.createGain(); out.gain.value = volume; out.connect(ctx.destination);
  // The clack: a click of band-passed noise (the hard edge of it)...
  const click = ctx.createBufferSource(); click.buffer = noise;
  const band = ctx.createBiquadFilter(); band.type = 'bandpass'; band.Q.value = 1.4;
  band.frequency.value = kind === 'back' ? 1300 : 2600;
  const clickGain = ctx.createGain();
  clickGain.gain.setValueAtTime(kind === 'back' ? .28 : .42, now); clickGain.gain.exponentialRampToValueAtTime(.0001, now + (kind === 'back' ? .05 : .035));
  click.connect(band); band.connect(clickGain); clickGain.connect(out); click.start(now); click.stop(now + .08);
  // ...over a short wooden knock. A press knocks up a touch; going back
  // knocks lower and drops, which is what makes it read as "undo".
  const knock = ctx.createOscillator(); knock.type = 'triangle';
  const knockGain = ctx.createGain();
  const [from, to, length] = kind === 'back' ? [520, 330, .085] : [880, 1020, .045];
  knock.frequency.setValueAtTime(from, now); knock.frequency.exponentialRampToValueAtTime(to, now + length);
  knockGain.gain.setValueAtTime(.0001, now); knockGain.gain.exponentialRampToValueAtTime(kind === 'back' ? .2 : .16, now + .004);
  knockGain.gain.exponentialRampToValueAtTime(.0001, now + length);
  knock.connect(knockGain); knockGain.connect(out); knock.start(now); knock.stop(now + length + .02);
  knock.onended = () => { for (const node of [click, band, clickGain, knock, knockGain, out]) node.disconnect(); };
 }
 // Buttons, tabs, the weapon and map cards, toggles and drop-downs: anything
 // that is UI. The on-screen game controls (FIRE, dodge...) are not UI and stay silent.
 document.addEventListener('click', e => {
  const target = e.target instanceof Element ? e.target.closest('button, summary, [role=tab], [role=option], select, input[type=checkbox], input[type=range]') : null;
  if (!target || target.closest('#touch-controls') || target.disabled) return;
  play(target.matches(BACK) ? 'back' : 'press');
 }, true);
 document.addEventListener('keydown', e => { if (e.code === 'Escape' && !e.repeat) play('back'); }, true);
 return { play };
}
