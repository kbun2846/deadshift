// Picks the graphics preset for this device at the start of a game (owner,
// v0.995a: "make the game auto select between performance, balanced and
// quality for users device at start of game"). Settings > Graphics > AUTO
// (the default) uses it; choosing a preset by hand turns it off.
//
// From what the browser will say about the machine: the graphics chip's name
// (WEBGL_debug_renderer_info, read from a throwaway context before the game's
// own, because screen multisampling is fixed when a context is made), whether
// it is a phone or tablet, its processor cores and memory. Then a learned step
// (`step`, 0 or below): a device whose automatic preset ran well short of its
// frame target is given the one below next time (AutoQualityWatch), and one
// that has since run smoothly a step lower climbs back.
//
// Pure except `gpuInfo()`; tests/device-tier.test.js.
export const AUTO_TIERS = Object.freeze(['performance', 'balanced', 'quality']);

export function gpuInfo(doc = globalThis.document) {
  try {
    const canvas = doc.createElement('canvas'), gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return null;
    const debug = gl.getExtension('WEBGL_debug_renderer_info');
    const info = {
      renderer: String((debug && gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)) || gl.getParameter(gl.RENDERER) || ''),
      vendor: String((debug && gl.getParameter(debug.UNMASKED_VENDOR_WEBGL)) || gl.getParameter(gl.VENDOR) || ''),
      maxTexture: gl.getParameter(gl.MAX_TEXTURE_SIZE) || 0,
    };
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return info;
  } catch { return null; }
}

// `gpu` { renderer, vendor, maxTexture } or null; `mobile` a phone or tablet;
// `cores` navigator.hardwareConcurrency; `memory` navigator.deviceMemory (GB,
// Chromium only, capped at 8 by the browser). Returns one of AUTO_TIERS and
// why, for the settings note.
export function detectTier({ gpu = null, mobile = false, cores = 0, memory = 0 } = {}) {
  const g = `${gpu?.renderer || ''} ${gpu?.vendor || ''}`.toLowerCase();
  // Drawn in software (no graphics chip, or it is switched off): the lightest.
  if (/swiftshader|llvmpipe|softpipe|software|basic render|microsoft basic/.test(g)) return { tier: 'performance', why: 'software drawing' };
  let tier = 'balanced', why = 'unknown graphics chip';
  if (mobile) {
    tier = 'performance'; why = 'phone or tablet';
    // This year's and last year's flagship phone chips, and big-core tablets.
    if (/adreno[^0-9]*(7[3-9]\d|8\d\d)|immortalis|mali-g(7[7-9]|[79]\d\d)|xclipse 9/.test(g)) { tier = 'balanced'; why = 'flagship phone graphics'; }
    else if (/apple/.test(g) && cores >= 8) { tier = 'balanced'; why = 'tablet-class Apple chip'; }
  } else if (/nvidia|geforce|quadro|rtx|gtx/.test(g)) {
    const older = /gtx\s?(6|7|9)\d\d|gt\s?\d{3,4}\b|mx\s?\d{3}|quadro [kmp]\d/.test(g);
    tier = older ? 'balanced' : 'quality'; why = older ? 'older NVIDIA graphics' : 'NVIDIA graphics';
  } else if (/radeon|amd|ati /.test(g)) {
    // "AMD Radeon(TM) Graphics" / "Vega 8 Graphics": the chip inside the processor.
    const inside = /radeon\s*(\(tm\))?\s*(graphics|vega \d+\b)|vega \d+ graphics|radeon\s*(\(tm\))?\s*\d{3}m\b/.test(g) && !/rx|pro w|vii|fury/.test(g);
    tier = inside ? 'balanced' : 'quality'; why = inside ? 'AMD graphics in the processor' : 'AMD graphics card';
  } else if (/apple m\d/.test(g)) {
    tier = /apple m\d (pro|max|ultra)/.test(g) ? 'quality' : 'balanced'; why = 'Apple M chip';
  } else if (/apple/.test(g)) { tier = 'balanced'; why = 'Apple graphics'; }
  else if (/intel/.test(g)) {
    tier = /arc/.test(g) ? 'quality' : /iris\s*(\(r\))?\s*xe/.test(g) ? 'balanced' : 'performance';
    why = tier === 'quality' ? 'Intel Arc graphics' : tier === 'balanced' ? 'Intel Iris Xe graphics' : 'Intel graphics';
  } else if (/mali|adreno|powervr|videocore|tegra/.test(g)) { tier = 'performance'; why = 'mobile graphics chip'; }
  // Few cores or little memory hold it back whatever the chip.
  const cap = memory && memory <= 2 ? 'performance' : (cores && cores <= 4) || (memory && memory <= 4) ? 'balanced' : 'quality';
  if (AUTO_TIERS.indexOf(tier) > AUTO_TIERS.indexOf(cap)) { tier = cap; why += ', few cores or little memory'; }
  return { tier, why };
}

// The detected tier moved by the learned step (never below Performance).
export function autoQuality(detected, step = 0) {
  const i = Math.max(0, Math.min(AUTO_TIERS.length - 1, AUTO_TIERS.indexOf(detected) + Math.min(0, Math.round(step) || 0)));
  return AUTO_TIERS[i];
}

// Watches an automatic preset in play (running, the page visible). Well short
// of its frame target for a while, it asks for a step down next time; a step
// already taken and play smooth for a good while, a step back up. Only the
// next start changes: switching presets mid-fight would stall the game.
export const AUTO_WATCH = Object.freeze({ window: 20, slow: .72, smooth: .97, smoothFor: 90 });
export class AutoQualityWatch {
  constructor() { this.time = 0; this.frames = 0; this.smooth = 0; this.done = false; }
  // `dt` seconds of play with `drawn` frames drawn, against `target` fps.
  // Returns -1 (step down next time), +1 (step up next time) or 0.
  sample(dt, drawn, target, step = 0) {
    if (this.done || !(dt > 0) || dt > .25 || !(target > 0)) return 0;
    this.time += dt; this.frames += drawn;
    if (this.time < AUTO_WATCH.window) return 0;
    const rate = this.frames / this.time; this.time = 0; this.frames = 0;
    if (rate < target * AUTO_WATCH.slow) { this.done = true; return -1; }
    if (step < 0 && rate >= target * AUTO_WATCH.smooth) { this.smooth += AUTO_WATCH.window; if (this.smooth >= AUTO_WATCH.smoothFor) { this.done = true; return 1; } }
    else this.smooth = 0;
    return 0;
  }
}
