// Settings panel wiring: the graphics preset, FPS limit slider, control hint
// and mobile opacity options, and the volume sliders. Reads and writes the
// shared `settings` object, saves it, and tells the game what changed through
// the callbacks. The option markup lives in index.html (and menu.js for the
// sliders it builds).
import { GRAPHICS, isDemanding, fpsToSlider, fpsFromSlider, fpsLabel, snapFps, FPS_STOPS, FPS_MIN, FPS_UNCAPPED_SLIDER, VOLUME_CHANNELS } from '../settings.js';
const byId = id => document.getElementById(id);
const save = settings => { try { localStorage.setItem('deadshift-settings', JSON.stringify(settings)); } catch { /* Incognito still plays normally. */ } };
const sliderFraction = at => (Number(at) - FPS_MIN) / (FPS_UNCAPPED_SLIDER - FPS_MIN);

// hooks: { setQuality(name), setFps(fps), setMotion(on), setVolumes(volume), changed() }
export function installSettingsPanel(settings, hooks) {
 function applyVolume() {
  for (const channel of VOLUME_CHANNELS) {
   const slider = byId('volume-' + channel);
   settings.volume[channel] = Number(slider.value) / 100;
   byId('volume-' + channel + '-value').textContent = Math.round(settings.volume[channel] * 100) + '%';
   slider.style.setProperty('--fill', slider.value + '%');
   slider.setAttribute('aria-valuetext', Math.round(settings.volume[channel] * 100) + ' percent');
  }
  hooks.setVolumes(settings.volume);
  save(settings);
 }
 function applySettings() {
  settings.quality = byId('graphics-preset').value;
  // Weighted stops: near one of the common rates the handle is pulled onto it,
  // and outside that pull it settles wherever it was let go.
  const settled = snapFps(byId('fps-limit').value);
  if (String(settled) !== byId('fps-limit').value) byId('fps-limit').value = String(settled);
  settings.fps = fpsFromSlider(settled);
  byId('fps-limit-value').textContent = fpsLabel(settings.fps);
  byId('fps-limit').setAttribute('aria-valuetext', fpsLabel(settings.fps));
  // Paint the travelled part of the track; the thumb pseudo-element cannot.
  byId('fps-limit').style.setProperty('--fill', sliderFraction(settled) * 100 + '%');
  settings.controlHints = byId('control-hints').checked;
  settings.aimAssist = byId('aim-assist').checked;
  settings.fullscreen = byId('fullscreen-play').checked;
  settings.vibration = byId('vibration').checked;
  settings.mobileOpacity = Number(byId('mobile-opacity').value);
  document.body.style.setProperty('--mobile-opacity', settings.mobileOpacity);
  byId('weapon').classList.toggle('hide-control-hints', !settings.controlHints);
  hooks.setQuality(settings.quality); hooks.setMotion(settings.motion); hooks.setFps(settings.fps);
  byId('graphics-description').textContent = GRAPHICS[settings.quality].description;
  byId('graphics-warning').classList.toggle('hidden', !isDemanding(settings.quality));
  save(settings);
  hooks.changed();
 }
 // One prong per weighted stop, positioned on the same scale as the handle.
 byId('fps-limit-ticks').replaceChildren(...FPS_STOPS.map(stop => {
  const prong = document.createElement('i');
  prong.style.left = sliderFraction(stop) * 100 + '%';
  prong.title = fpsLabel(stop);
  return prong;
 }));
 byId('graphics-preset').value = settings.quality; byId('fps-limit').value = String(fpsToSlider(settings.fps));
 byId('control-hints').checked = settings.controlHints;
 byId('aim-assist').checked = settings.aimAssist;
 byId('fullscreen-play').checked = settings.fullscreen;
 byId('vibration').checked = settings.vibration;
 byId('mobile-opacity').value = String(settings.mobileOpacity);
 for (const id of ['graphics-preset', 'fps-limit', 'control-hints', 'mobile-opacity', 'aim-assist', 'fullscreen-play', 'vibration']) byId(id).addEventListener('change', applySettings);
 // The slider needs to read live while dragged, not only on release.
 byId('fps-limit').addEventListener('input', applySettings);
 for (const channel of VOLUME_CHANNELS) {
  const slider = byId('volume-' + channel);
  slider.value = String(Math.round(settings.volume[channel] * 100));
  slider.addEventListener('input', applyVolume);
  slider.addEventListener('change', applyVolume);
 }
 applySettings(); applyVolume();
 return { applySettings, applyVolume };
}
