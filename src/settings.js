export const GRAPHICS = Object.freeze({
  potato: { label: 'Potato', pixelRatio: 1, scale: .5, shadows: 0, texture: 16, effects: .1, particleCap: 48, motes: 0, glow: false, light: false,
    description: 'Barebones · half resolution · flat terrain · no decorative foliage, shadows or ambient dust' },
  performance: { label: 'Performance', pixelRatio: 1, scale: .8, shadows: 0, texture: 64, effects: .3, particleCap: 160, motes: 28, glow: false, light: false,
    description: 'Reduced resolution · no shadows · light effects' },
  balanced: { label: 'Balanced', pixelRatio: 2, scale: 1, shadows: 2048, texture: 512, effects: 1, particleCap: 650, motes: 140, glow: true, light: true,
    description: 'Dense foliage · soft shadows · electric & blast lighting' },
  quality: { label: 'Quality', pixelRatio: 2.25, scale: 1, shadows: 4096, texture: 1024, effects: 2.4, particleCap: 1800, motes: 140, glow: true, light: true,
    description: 'Raised sand & wood grain · dense vegetation · richer landmark detail & effects' },
});

export const FPS_LIMITS = [1, 30, 60, 90, 120, 0];
export const DEFAULT_SETTINGS = { quality: 'balanced', fps: 60, motion: true, controlHints: true, mobileOpacity: 1 };
export function validateSettings(value = {}) {
  return { quality: GRAPHICS[value.quality] ? value.quality : DEFAULT_SETTINGS.quality,
    fps: FPS_LIMITS.includes(Number(value.fps)) ? Number(value.fps) : DEFAULT_SETTINGS.fps,
    motion: typeof value.motion === 'boolean' ? value.motion : true,
    controlHints: typeof value.controlHints === 'boolean' ? value.controlHints : true,
    mobileOpacity: [1,.7,.4].includes(Number(value.mobileOpacity)) ? Number(value.mobileOpacity) : 1 };
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
