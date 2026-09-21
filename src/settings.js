export const GRAPHICS = Object.freeze({
  potato: { label: 'Potato', pixelRatio: 1, scale: .5, maxPixels: 600000, shadows: 0, texture: 16, effects: .1, particleCap: 48, motes: 0, glow: false, light: false,
    description: 'Barebones · half resolution · flat terrain · no decorative foliage, shadows or ambient dust' },
  performance: { label: 'Performance', pixelRatio: 1, scale: .75, maxPixels: 900000, shadows: 0, texture: 64, effects: .22, particleCap: 100, motes: 12, glow: false, light: false,
    description: 'Adaptive resolution · simplified foliage · no shadows · light effects' },
  balanced: { label: 'Balanced', pixelRatio: 1.25, scale: 1, maxPixels: 1600000, shadows: 1024, shadowFPS: 30, texture: 256, effects: .65, particleCap: 360, motes: 48, glow: true, light: true,
    description: 'Adaptive resolution · soft shadows · detailed foliage & effects' },
  quality: { label: 'Quality', pixelRatio: 2, scale: 1, maxPixels: 3700000, shadows: 2048, texture: 1024, effects: 1.8, particleCap: 1200, motes: 140, glow: true, light: true,
    description: 'Raised sand & wood grain · dense vegetation · richer landmark detail & effects' },
});

export const FPS_LIMITS = [1, 30, 45, 60, 90, 120, 0];
// Bound GPU work on high-DPI phones and large displays without scaling the HTML UI.
export function renderPixelRatio(quality,dpr,width,height){
 return Math.min(Math.min(dpr,quality.pixelRatio)*quality.scale,Math.sqrt(quality.maxPixels/Math.max(1,width*height)));
}
export const DEFAULT_SETTINGS = { quality: 'balanced', fps: 60, motion: true, controlHints: true, mobileOpacity: .4 };
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
    fps: FPS_LIMITS.includes(Number(value.fps)) ? Number(value.fps) : DEFAULT_SETTINGS.fps,
    motion: typeof value.motion === 'boolean' ? value.motion : true,
    controlHints: typeof value.controlHints === 'boolean' ? value.controlHints : true,
    mobileOpacity: [1,.7,.4].includes(Number(value.mobileOpacity)) ? Number(value.mobileOpacity) : DEFAULT_SETTINGS.mobileOpacity };
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
