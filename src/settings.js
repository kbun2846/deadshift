// Shadow map sizes came down when the shadow camera was fitted to the ground
// the overhead camera can actually frame: that raised texel density 2.2x, so
// 512 and 1024 now resolve finer than 640 and 1536 did over the old box, while
// halving the depth target's bandwidth — which on a mobile tiler is the
// cheapest saving available.
//
// Performance and Balanced draw the world off-screen at the sizes below and
// are written to the screen by one crisp upscale pass (crisp-output.js):
// FXAA-lite on Performance, 4x multisampling on Balanced, contrast-limited
// sharpening on both. Screen multisampling is a context-creation flag, chosen
// once from the saved tier (and not needed by those two).
export const GRAPHICS = Object.freeze({
  potato: { label: 'Potato', pixelRatio: 1, scale: .55, maxPixels: 750000, shadows: 0, texture: 32, effects: .1, particleCap: 48, motes: 0, glow: false, light: false, antialias: false, anisotropy: 1, relief: null,
    description: 'Barebones · half resolution · flat terrain · no decorative foliage, shadows or ambient dust' },
  performance: { label: 'Performance', pixelRatio: 1.15, scale: .82, maxPixels: 1150000, shadows: 768, shadowFPS: 24, texture: 256, effects: .3, particleCap: 140, motes: 20, glow: false, light: true, antialias: false, anisotropy: 2, relief: null,
    description: 'Smoothed, sharpened upscale · adaptive resolution · simplified foliage · contact shadows on landmarks · lit effects' },
  balanced: { label: 'Balanced', pixelRatio: 1.3, scale: 1, maxPixels: 1800000, shadows: 1024, shadowFPS: 30, texture: 512, effects: .75, particleCap: 400, motes: 72, glow: true, light: true, antialias: true, anisotropy: 4, relief: 'ground',
    description: 'Antialiased, sharpened upscale · adaptive resolution · soft shadows on buildings, props & entities · raised sand grain · detailed foliage & effects' },
  quality: { label: 'Quality', pixelRatio: 2, scale: 1, maxPixels: 3700000, shadows: 2048, shadowFPS: 45, texture: 1024, effects: 2, particleCap: 1300, motes: 190, glow: true, light: true, antialias: true, anisotropy: 8, relief: 'full',
    description: 'Raised sand & wood grain · dense vegetation · richer landmark detail & effects' },
  // Everything Quality has, and on top: ambient occlusion, bloom and a colour
  // grade (extreme-post.js), a 4096 shadow map redrawn every frame, varied and
  // weathered ground and surfaces (extreme-surfaces.js), rounder models, lit
  // birds with shadows, brighter tracers and denser effects. Additive only:
  // Extreme shares every Quality code path and adds to it.
  extreme: { label: 'Extreme', pixelRatio: 2, scale: 1, maxPixels: 3700000, shadows: 4096, shadowFPS: 60, texture: 2048, effects: 2.6, particleCap: 2200, motes: 260, glow: true, light: true, antialias: true, anisotropy: 16, relief: 'full',
    description: 'Everything in Quality plus ambient occlusion, bloom, sharper every-frame shadows, weathered ground & surfaces, rounder models and richer effects' },
});

// The tiers that warn before they are chosen, and the ones that turn on the
// quality-only detail. Named rather than compared by string at each use site,
// so adding a tier above Quality does not silently miss one of them.
export const DEMANDING_TIERS = Object.freeze(['quality', 'extreme']);
export const isDemanding = name => DEMANDING_TIERS.includes(name);

export const DEFAULT_SETTINGS = { quality: 'balanced', fps: 60, motion: true, controlHints: true, mobileOpacity: .4, aimAssist: true, fullscreen: true, keyLock: true, vibration: true,
  volume: { master: .6, ambient: .8, weapons: 1, effects: 1 } };
// Every channel is a plain 0..1 multiplier so the mixer stays predictable:
// master scales the bus, the rest scale within it.
export const VOLUME_CHANNELS = Object.freeze(['master', 'ambient', 'weapons', 'effects']);
export const clampVolume = value => {
  const level = Number(value);
  return Number.isFinite(level) ? Math.min(1, Math.max(0, level)) : null;
};
export function validateVolume(value = {}) {
  const mix = {};
  for (const channel of VOLUME_CHANNELS) mix[channel] = clampVolume(value?.[channel]) ?? DEFAULT_SETTINGS.volume[channel];
  return mix;
}
// The frame cap is continuous now, not a short list of presets. The slider
// walks 1..240 and ends on Uncapped, with weighted stops at the rates people
// actually target: near one of them the handle is pulled onto it, and past the
// pull it keeps moving and settles wherever it is let go.
export const FPS_MIN = 1, FPS_MAX = 240;
export const FPS_STOPS = Object.freeze([20, 30, 45, 60, 90, 120, 180, 240]);
// In slider units. Wide enough to feel, narrow enough that 20 and 30 stay
// separately reachable.
export const FPS_PULL = 4;
// One position past the top of the range carries Uncapped.
export const FPS_UNCAPPED_SLIDER = FPS_MAX + 1;

export const fpsToSlider = value => {
  const fps = Number(value);
  if (fps === 0) return FPS_UNCAPPED_SLIDER;
  return Number.isFinite(fps) ? Math.min(FPS_MAX, Math.max(FPS_MIN, Math.round(fps))) : DEFAULT_SETTINGS.fps;
};
export const fpsFromSlider = position => {
  const at = Math.round(Number(position));
  if (!Number.isFinite(at)) return DEFAULT_SETTINGS.fps;
  if (at >= FPS_UNCAPPED_SLIDER) return 0;
  return Math.min(FPS_MAX, Math.max(FPS_MIN, at));
};
// Weighting, applied to the raw handle position before it becomes a frame cap.
export function snapFps(position, pull = FPS_PULL) {
  const at = Math.round(Number(position));
  if (!Number.isFinite(at) || at >= FPS_UNCAPPED_SLIDER) return FPS_UNCAPPED_SLIDER;
  let best = at, distance = pull + 1;
  for (const stop of FPS_STOPS) {
    const gap = Math.abs(at - stop);
    if (gap <= pull && gap < distance) { best = stop; distance = gap; }
  }
  return best;
}
export const fpsLabel = value => Number(value) === 0 ? 'UNCAPPED' : `${Number(value)} FPS`;
// Kept for anything still thinking in the old fixed steps.
export const FPS_LIMITS = Object.freeze([1, ...FPS_STOPS, 0]);

export function renderPixelRatio(quality,dpr,width,height){
 return Math.min(Math.min(dpr,quality.pixelRatio)*quality.scale,Math.sqrt(quality.maxPixels/Math.max(1,width*height)));
}
// The lowest render scale each tier may drop to under load (absent: fixed).
export const ADAPTIVE_FLOOR=Object.freeze({performance:.7,balanced:.7,quality:.85,extreme:.8});
// Adjust only the 3D buffer, never the UI or simulation. Long windows and slower
// recovery avoid resolution flicker; paused/background/loading time is excluded.
export class AdaptiveResolution {
  constructor(){this.reset();}
  reset(){this.scale=1;this.elapsed=0;this.frames=0;this.healthy=0;this.key='';this.strained=false;}
  sample(dt, rendered, quality, fps){
    const key=quality+':'+fps;
    if(key!==this.key){this.reset();this.key=key;}
    // Quality and Extreme may shed a little resolution (never below 85% and
    // 80%) rather than frames: their extra work scales with pixel count.
    // Still short of the target at that floor, the tier is `strained`, and the
    // renderer eases its most expensive extras (setStrain) until it recovers.
    if(!ADAPTIVE_FLOOR[quality]||fps===1)return 1;
    if(!(dt>0)||dt>.25)return this.scale;
    this.elapsed+=dt;this.frames+=Number(rendered);
    if(this.elapsed<2)return this.scale;
    const target=Math.min(fps||60,60),rate=this.frames/this.elapsed;
    const floor=ADAPTIVE_FLOOR[quality];
    if(rate<target*.85){if(this.scale<=floor+1e-9)this.strained=true;this.scale=Math.max(floor,this.scale-.1);this.healthy=0;}
    else if(rate>=target*.96){
      this.healthy+=this.elapsed;
      if(this.healthy>=4)this.strained=false;
      if(this.healthy>=8){this.scale=Math.min(1,this.scale+.05);this.healthy=0;}
    }else this.healthy=0;
    this.elapsed=0;this.frames=0;return this.scale;
  }
}
export function validateSettings(value = {}, {mobile=false} = {}) {
  value ||= {};
  return { quality: GRAPHICS[value.quality] ? value.quality : mobile ? 'performance' : DEFAULT_SETTINGS.quality,
    fps: Number(value.fps) === 0 ? 0
      : Number.isFinite(Number(value.fps)) && Number(value.fps) >= FPS_MIN && Number(value.fps) <= FPS_MAX
        ? Math.round(Number(value.fps)) : DEFAULT_SETTINGS.fps,
    motion: typeof value.motion === 'boolean' ? value.motion : true,
    controlHints: typeof value.controlHints === 'boolean' ? value.controlHints : true,
    // Touch aim assist (aim-assist.js); on unless turned off in Settings > Mobile.
    aimAssist: typeof value.aimAssist === 'boolean' ? value.aimAssist : true,
    // Touch: short buzzes when hit and on a kill (haptics.js).
    vibration: typeof value.vibration === 'boolean' ? value.vibration : true,
    // Touch: ask for full screen when a game starts (mobile-browser.js).
    fullscreen: typeof value.fullscreen === 'boolean' ? value.fullscreen : true,
    // Keyboard: full screen with the browser's shortcuts held (ui/key-lock.js).
    keyLock: typeof value.keyLock === 'boolean' ? value.keyLock : true,
    mobileOpacity: [1,.7,.4].includes(Number(value.mobileOpacity)) ? Number(value.mobileOpacity) : DEFAULT_SETTINGS.mobileOpacity,
    volume: validateVolume(value.volume) };
}

// Rendering is capped independently from the fixed-rate gameplay simulation.
export class RenderBudget {
  constructor(fps = 60) { this.fps = fps; this.elapsed = 0; this.sinceRender = 0; }
  tick(dt) {
    this.elapsed += dt; this.sinceRender += dt;
    const interval = this.fps ? 1 / this.fps : 0;
    if (interval && this.elapsed + 1e-7 < interval) return 0;
    const delta = this.sinceRender;
    this.elapsed = interval ? Math.max(0, this.elapsed - interval * Math.floor((this.elapsed + 1e-7) / interval)) : 0;
    this.sinceRender = 0; return delta;
  }
  // A frame not drawn on purpose (the GPU is still busy, see gpuBusy): time
  // still passes for the cap, and the next drawn frame covers it.
  hold(dt) { this.elapsed += dt; this.sinceRender += dt; return 0; }
}
