// A quiet FPS and latency line under the masthead buttons. Deliberately not a
// live region: it changes every second and would talk over everything else, so
// the settings panel keeps the announced copy and this stays decorative.

export const PING_INTERVAL = 4;
export const PING_TIMEOUT = 3;
// Thresholds are for colour only; the number is always shown as measured.
export const pingGrade = ms => ms === null ? 'unknown' : ms < 80 ? 'good' : ms < 180 ? 'fair' : 'poor';
export const formatPing = ms => ms === null ? '— MS' : `${Math.min(999, Math.round(ms))} MS`;
export const formatFPS = fps => `${fps ? Math.min(999, Math.round(fps)) : '—'} FPS`;

// There is no game server yet, so this measures the round trip to the origin the
// build is served from. It is a connection readout, not a netcode figure; when
// multiplayer lands, point the probe at the session socket instead.
export const originProbe = async () => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PING_TIMEOUT * 1000);
  const start = performance.now();
  try {
    await fetch(`${location.pathname}?ping=${Date.now()}`, { method: 'HEAD', cache: 'no-store', signal: controller.signal });
    return performance.now() - start;
  } finally { clearTimeout(timer); }
};

export class PingMonitor {
  constructor(probe = originProbe, interval = PING_INTERVAL) {
    this.probe = probe; this.interval = interval; this.clock = 0; this.inFlight = false; this.value = null;
  }
  update(dt) {
    this.clock -= dt;
    if (this.clock > 0 || this.inFlight) return;
    this.clock = this.interval; this.inFlight = true;
    // A failed or aborted probe reads as unknown rather than freezing the last
    // good number, so a dropped connection is visible instead of stale. The
    // probe is invoked directly so it starts on this frame and keeps its own
    // binding; a synchronous throw is caught the same way a rejection is.
    let pending;
    try { pending = Promise.resolve(this.probe()); }
    catch { this.value = null; this.inFlight = false; return; }
    pending.then(
      ms => { this.value = Number.isFinite(ms) ? ms : null; },
      () => { this.value = null; },
    ).finally(() => { this.inFlight = false; });
  }
  reset() { this.clock = 0; this.inFlight = false; this.value = null; }
}

export function createPerfReadout(parent, { probe, document: doc = globalThis.document } = {}) {
  const root = doc.createElement('div');
  root.className = 'perf-readout';
  root.setAttribute('aria-hidden', 'true');
  const fpsLine = doc.createElement('span'); fpsLine.className = 'perf-fps';
  const pingLine = doc.createElement('span'); pingLine.className = 'perf-ping';
  root.append(fpsLine, pingLine);
  parent.append(root);
  const monitor = new PingMonitor(probe);
  let lastFPS = null, lastPing = null, lastGrade = null;
  return {
    root, monitor,
    update(dt, fps) {
      monitor.update(dt);
      // Touch the DOM only when the rendered text actually changes.
      if (fps !== lastFPS) { lastFPS = fps; fpsLine.textContent = formatFPS(fps); }
      if (monitor.value !== lastPing) {
        lastPing = monitor.value;
        pingLine.textContent = formatPing(monitor.value);
        const grade = pingGrade(monitor.value);
        if (grade !== lastGrade) { lastGrade = grade; pingLine.dataset.grade = grade; }
      }
    },
    reset() { monitor.reset(); lastPing = lastFPS = lastGrade = null; },
  };
}
