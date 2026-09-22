// Shadow map sizes came down when the shadow camera was fitted to the ground
// the overhead camera can actually frame: that raised texel density 2.2x, so
// 512 and 1024 now resolve finer than 640 and 1536 did over the old box, while
// halving the depth target's bandwidth — which on a mobile tiler is the
// cheapest saving available.
//
// Multisampling is a context-creation flag, so it is chosen once from the saved
// tier. Below Balanced the same budget buys more real pixels than smoothed ones:
// dropping MSAA and raising the render scale reads as sharper, not softer.
export const GRAPHICS = Object.freeze({
  potato: { label: 'Potato', pixelRatio: 1, scale: .55, maxPixels: 750000, shadows: 0, texture: 32, effects: .1, particleCap: 48, motes: 0, glow: false, light: false, antialias: false, anisotropy: 1, relief: null,
    description: 'Barebones · half resolution · flat terrain · no decorative foliage, shadows or ambient dust' },
  performance: { label: 'Performance', pixelRatio: 1.15, scale: .82, maxPixels: 1150000, shadows: 512, shadowFPS: 24, texture: 128, effects: .3, particleCap: 140, motes: 20, glow: false, light: true, antialias: false, anisotropy: 2, relief: null,
    description: 'Sharper adaptive resolution · simplified foliage · contact shadows on landmarks · lit effects' },
  balanced: { label: 'Balanced', pixelRatio: 1.3, scale: 1, maxPixels: 1800000, shadows: 1024, shadowFPS: 30, texture: 512, effects: .75, particleCap: 400, motes: 72, glow: true, light: true, antialias: true, anisotropy: 4, relief: 'ground',
    description: 'Adaptive resolution · soft shadows on buildings, props & entities · raised sand grain · detailed foliage & effects' },
  quality: { label: 'Quality', pixelRatio: 2, scale: 1, maxPixels: 3700000, shadows: 2048, shadowFPS: 45, texture: 1024, effects: 2, particleCap: 1300, motes: 190, glow: true, light: true, antialias: true, anisotropy: 8, relief: 'full',
    description: 'Raised sand & wood grain · dense vegetation · richer landmark detail & effects' },
  // A tier above Quality with somewhere to grow. Identical to Quality for now
  // by design, so it is selectable and saved before anything is built on it;
  // whatever goes here later must be additive, since the two share every
  // quality-gated code path today.
  extreme: { label: 'Extreme', pixelRatio: 2, scale: 1, maxPixels: 3700000, shadows: 2048, shadowFPS: 45, texture: 1024, effects: 2, particleCap: 1300, motes: 190, glow: true, light: true, antialias: true, anisotropy: 8, relief: 'full',
    description: 'Raised sand & wood grain · dense vegetation · richer landmark detail & effects' },
});

// The tiers that warn before they are chosen, and the ones that turn on the
// quality-only detail. Named rather than compared by string at each use site,
// so adding a tier above Quality does not silently miss one of them.
export const DEMANDING_TIERS = Object.freeze(['quality', 'extreme']);
export const isDemanding = name => DEMANDING_TIERS.includes(name);

export const DEFAULT_SETTINGS = { quality: 'balanced', fps: 60, motion: true, controlHints: true, mobileOpacity: .4,
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
// Adjust only the 3D buffer, never the UI or simulation. Long windows and slower
// recovery avoid resolution flicker; paused/background/loading time is excluded.
export class AdaptiveResolution {
  constructor(){this.reset();}
  reset(){this.scale=1;this.elapsed=0;this.frames=0;this.healthy=0;this.key='';}
  sample(dt, rendered, quality, fps){
    const key=quality+':'+fps;
    if(key!==this.key){this.reset();this.key=key;}
    if(!['performance','balanced'].includes(quality)||fps===1)return 1;
    if(!(dt>0)||dt>.25)return this.scale;
    this.elapsed+=dt;this.frames+=Number(rendered);
    if(this.elapsed<2)return this.scale;
    const target=Math.min(fps||60,60),rate=this.frames/this.elapsed;
    if(rate<target*.85){this.scale=Math.max(.7,this.scale-.1);this.healthy=0;}
    else if(rate>=target*.96){
      this.healthy+=this.elapsed;
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
}
