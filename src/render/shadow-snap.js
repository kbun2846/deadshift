// Keeps the sun's shadow map from crawling as the camera moves.
//
// The sun follows the camera focus, which is a smoothed float, so every shadow
// update used to move the shadow map by some fraction of a texel. Each edge was
// then rasterised onto a slightly different texel grid than the frame before,
// and shadow edges shimmered and crept -- worst on Balanced, whose 1024 map
// spreads each texel over roughly four centimetres and refreshes at 30Hz, and
// most visible indoors, where walls and furniture throw hard straight shadows
// right under the camera.
//
// The fix is the standard one: only ever move the light by whole texels in
// its own view plane. The grid then stays put relative to the world and an
// edge falls on the same texels every update. Movement along the light's own
// direction does not change where anything lands on the map, so only the two
// axes across the map are snapped.

// The light looks along `direction` (from the sun toward its target) with
// its shadow camera's up vector (three.js's default unless given), which is
// how three orients that camera (Matrix4.lookAt).
const UP = Object.freeze({ x: 0, y: 1, z: 0 });
export function lightBasis(direction, up = UP) {
  const len = Math.hypot(direction.x, direction.y, direction.z) || 1;
  // Camera-space z points from the target back toward the eye.
  const z = { x: -direction.x / len, y: -direction.y / len, z: -direction.z / len };
  // x = up × z.
  let x = { x: up.y * z.z - up.z * z.y, y: up.z * z.x - up.x * z.z, z: up.x * z.y - up.y * z.x };
  const xl = Math.hypot(x.x, x.y, x.z) || 1;
  x = { x: x.x / xl, y: x.y / xl, z: x.z / xl };
  // y = z × x.
  const y = { x: z.y * x.z - z.z * x.y, y: z.z * x.x - z.x * x.z, z: z.x * x.y - z.y * x.x };
  return { x, y };
}

const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;

// Returns the focus moved by less than one texel so that its position across
// the shadow map is an exact multiple of the texel size.
export function snapShadowFocus(focus, basis, texelX, texelY) {
  const a = dot(focus, basis.x), b = dot(focus, basis.y);
  const da = Math.round(a / texelX) * texelX - a;
  const db = Math.round(b / texelY) * texelY - b;
  return {
    x: focus.x + basis.x.x * da + basis.y.x * db,
    y: focus.y + basis.x.y * da + basis.y.y * db,
    z: focus.z + basis.x.z * da + basis.y.z * db,
  };
}

// ---- Fitting the shadow map to the screen ----
//
// The sun's shadow map is an orthographic box that follows the camera. It used
// to be a fixed 42 x 30 m box, which is too small in places: with Deadwater's
// sun the north-west corner of a 16:9 screen lay outside it (up to 6 m), a
// phone held upright sees further north and south than any fixed box allowed
// for, and on hills the ground below the focus spreads the view wider still.
// There a shadow simply stopped, a visible line short of the screen's edge.
//
// Now the box is worked out from what the camera sees. Everything drawn on
// screen that takes a shadow lies inside the view's frustum between the lowest
// ground in view and the tops of the tallest things standing on the highest
// (`receivers` above it). That slab's eight corners, turned into the light's
// frame, give the box across the map. Nothing outside it matters: anything
// that throws a shadow onto a point is on the same line to the sun, so it has
// the same place across the map. What it needs is depth: the box reaches
// toward the sun until it is above the tallest caster (`casters` above the
// highest ground anywhere), and past the view to the lowest ground in it.
//
// The box is also turned about the light (its roll) to hug the view: the view
// is a trapezoid and a high sun sees it at an angle, so the square-on box that
// three.js picks by default wastes up to half its texels. The roll is chosen
// once per screen shape, the box's edges move in whole metres and it only
// shrinks when it has become well too big, so it changes rarely: each change
// moves every texel, so a change is a small pop of every shadow edge.
export const SHADOW_FIT = Object.freeze({
  receivers: 8,   // m: the tallest things on screen that take shadows (roof tops)
  casters: 16,    // m: the tallest caster; only sets how far toward the sun the box reaches
  margin: 1.2,    // m round the box: the view moves on between shadow updates
  step: 1,        // m: the box's edges move in whole steps...
  depthStep: 2,   // ...and its depth in these
  shrink: 1.3,    // it shrinks only once this much bigger than needed (by area)
  slack: 1,       // m: on hills a box that must change grows this much more all round
  maxSide: 120,   // m: never wider than this (the weapon-pick view from high above)
  bias: .005,     // m of depth bias: the old -0.00008 over Deadwater's 62 m range
});

// The view camera (renderer.js / camera-framing.js): its eye `height` above
// the focus and `height * tilt` south of it, looking at the focus, `fov`
// degrees high on a screen `aspect` wide. The four corner rays from the eye.
function viewRays(view) {
  const len = Math.hypot(1, view.tilt), tan = Math.tan(view.fov * Math.PI / 360), side = tan * view.aspect;
  const rays = [];
  for (const sx of [-1, 1]) for (const sy of [-1, 1])
    rays.push({ x: sx * side, y: (-1 + sy * tan * view.tilt) / len, z: (-view.tilt - sy * tan) / len });
  return rays;
}

// The corners of what the view sees between heights `low` and `high` (metres,
// relative to the focus), relative to the focus. The top is kept under the
// camera's near plane (a room's low camera under a tall roof).
export function viewSlab(view, low, high) {
  const eye = { x: 0, y: view.height, z: view.height * view.tilt }, points = [];
  const top = Math.max(low, Math.min(high, view.height - (view.near ?? 2)));
  for (const ray of viewRays(view)) for (const h of [low, top]) {
    const t = (h - eye.y) / ray.y;
    points.push({ x: eye.x + t * ray.x, y: h, z: eye.z + t * ray.z });
  }
  return points;
}

// The ground (x/z, relative to the focus) the view can show between those
// heights: where to look up the lowest and highest ground in view.
export function viewSpan(view, low, high) {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const p of viewSlab(view, low, high)) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z); }
  return { x0, x1, z0, z1 };
}

const across = (points, basis) => {
  let left = Infinity, right = -Infinity, bottom = Infinity, top = -Infinity;
  for (const p of points) {
    const a = dot(p, basis.x), b = dot(p, basis.y);
    left = Math.min(left, a); right = Math.max(right, a); bottom = Math.min(bottom, b); top = Math.max(top, b);
  }
  return { left, right, bottom, top };
};

// The light's frame for a screen shape: the roll about the light (whole
// degrees) whose box round the usual outdoor view on flat ground is smallest.
// Returns the basis across the map and the up vector that gives three's
// shadow camera that frame (up = the frame's y: three takes x = up × z).
export function shadowFrame(sunOffset, view, receivers = SHADOW_FIT.receivers) {
  const base = lightBasis({ x: -sunOffset.x, y: -sunOffset.y, z: -sunOffset.z });
  const points = viewSlab(view, 0, receivers);
  let best = null;
  for (let deg = 0; deg < 180; deg++) {
    const r = deg * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
    const basis = {
      x: { x: c * base.x.x + s * base.y.x, y: c * base.x.y + s * base.y.y, z: c * base.x.z + s * base.y.z },
      y: { x: c * base.y.x - s * base.x.x, y: c * base.y.y - s * base.x.y, z: c * base.y.z - s * base.x.z },
    };
    const box = across(points, basis), area = (box.right - box.left) * (box.top - box.bottom);
    // (Ties keep the smaller roll, so the choice is the same every time.)
    if (!best || area < best.area - 1e-9) best = { roll: deg, area, basis };
  }
  return { roll: best.roll, basis: best.basis, up: { ...best.basis.y } };
}

// The box the shadow camera needs (relative to its target at the focus, which
// the sun stands `sunOffset` from): across the map from the view's slab
// between `low` and `high` + receivers, and in depth from `casterTop` (the
// tallest caster's top, relative to the focus) toward the sun down to the
// slab's far bottom. All heights are relative to the focus.
export function fitShadowBox(view, sunOffset, basis, low, high, casterTop, fit = SHADOW_FIT) {
  const points = viewSlab(view, low, high + fit.receivers), box = across(points, basis);
  const length = Math.hypot(sunOffset.x, sunOffset.y, sunOffset.z);
  const sun = { x: sunOffset.x / length, y: sunOffset.y / length, z: sunOffset.z / length };
  let toward = -Infinity, away = Infinity;
  for (const p of points) {
    const d = dot(p, sun);
    // Up the line to the sun until above the tallest caster.
    toward = Math.max(toward, d + Math.max(0, casterTop - p.y) / sun.y);
    away = Math.min(away, d);
  }
  const m = fit.margin;
  return { left: box.left - m, right: box.right + m, bottom: box.bottom - m, top: box.top + m,
    near: length - toward - m, far: length - away + m };
}

// The box a view needs over `ground` (world/heightfield.js: FLAT or a terrain
// map's Ground), with the focus at (fx, fy, fz). On a terrain map the heights
// are the ground's own in view (the lowest and highest in the 4 m tiles
// under the widest view the map's whole height range allows), so a view over
// a level stretch is not fitted to the map's deepest hollow.
export function shadowBoxOver(view, sunOffset, basis, ground, fx, fy, fz, fit = SHADOW_FIT) {
  let low = ground.minY - fy, high = ground.maxY - fy;
  if (!ground.flat) {
    const s = viewSpan(view, low, high + fit.receivers), x0 = fx + s.x0, z0 = fz + s.z0, x1 = fx + s.x1, z1 = fz + s.z1;
    low = Math.max(low, ground.minInBox(x0, z0, x1, z1) - fy);
    high = Math.max(low, Math.min(high, ground.maxInBox(x0, z0, x1, z1) - fy));
  }
  return fitShadowBox(view, sunOffset, basis, low, high, ground.maxY - fy + fit.casters, fit);
}

// The box to use: `needed` with its edges moved out to whole steps. The
// current box stays while it holds that and is not far too big, so a box that
// has settled (outdoors on flat ground: always) never changes. Returns
// `current` itself when nothing changes. `slack` (m, terrain maps): a box
// that has to change is made that much bigger all round, so walking up and
// down the hills (the view's heights change with every step) moves it only
// now and then; the first box, and every box on flat ground, is exact.
export function settleShadowBox(current, needed, fit = SHADOW_FIT, slack = 0) {
  const step = fit.step, deep = fit.depthStep, half = fit.maxSide / 2;
  const quantise = (b, pad) => ({
    left: Math.max(-half, Math.floor((b.left - pad) / step) * step), right: Math.min(half, Math.ceil((b.right + pad) / step) * step),
    bottom: Math.max(-half, Math.floor((b.bottom - pad) / step) * step), top: Math.min(half, Math.ceil((b.top + pad) / step) * step),
    near: Math.floor((b.near - pad) / deep) * deep, far: Math.ceil((b.far + pad) / deep) * deep,
  });
  const q = quantise(needed, 0);
  if (!current) return q;
  const area = b => (b.right - b.left) * (b.top - b.bottom);
  const holds = current.left <= q.left && current.right >= q.right && current.bottom <= q.bottom && current.top >= q.top;
  const keepAcross = holds && area(current) <= fit.shrink * area(quantise(needed, slack));
  const keepDepth = current.near <= q.near && current.far >= q.far;
  if (keepAcross && keepDepth) return current;
  const roomy = quantise(needed, slack), next = keepAcross ? { ...current } : { ...roomy };
  if (keepDepth) { next.near = current.near; next.far = current.far; } else { next.near = roomy.near; next.far = roomy.far; }
  return next;
}
