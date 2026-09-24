// The title: the main menu's home page. The game version, "deadshift" in the
// heavy display lettering, the menu's buttons below it, and blood, drawn flat
// and a little cartoony like the game's own blood, but messy and clean-edged
// (the brief is in AGENTS.md, Design > Title screen blood):
//   - it wells up inside the first d's bowl, then spreads from there across
//     the lower part of every letter, each letter bleeding its own way (its
//     own level, a finger pushed higher, a dip, a wet rounded edge), covering
//     every letter edge (a flat layer under the wet one), nothing above it;
//   - the other bowls (the second d, the a, the e) partly fill as it passes,
//     with a liquid level and a few bubbles, sitting on the blood below;
//   - it hangs off the letters' feet, and from a few places only it droops in
//     long drips that stretch under their own weight, let go and fall;
//   - drops that hit a button collect on its top edge (the buttons are solid:
//     the blood pools there and spreads), creep over the front in short runs,
//     and once a pool reaches an end it runs down the side and drips off
//     onto the next button; landings stain the button faces;
//   - a button's blood moves with the button (hover lift, press), so the
//     button never slides out from under it; blood runs off one end of each
//     button, the end the keyboard / mobile pair has free (its selected one's
//     pink tab sticks out past the other end, which does not spill); switching
//     them clears the blood from the tab that went away, at once, and moves
//     the spilling end, without redoing anything else.
// It is an animation, not a fluid simulation: flat shapes on a timeline,
// merged into one liquid by an SVG "goo" filter (blur, then a hard alpha
// threshold), no lighting. The intro plays once (about seven seconds) the
// first time the menu shows, then it keeps dripping. It only runs while the
// home page is on screen and the tab is visible, and after the intro it draws
// at 30 frames a second.
const SVG = 'http://www.w3.org/2000/svg';
// The game's blood (gore.js, blood-drops.js): the body colour and the stains.
const BLOOD = '#8c1c2a', BLOOD_DEEP = '#5e0f18', BLOOD_SHADE = '#6d1320', STAIN = '#7a1824';
const INTRO = 7;

const make = (tag, attrs = {}, parent = null) => { const e = document.createElementNS(SVG, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); parent?.append(e); return e; };
const ease = t => t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// A letter's shape facts, as fractions of its ink box: where its enclosed
// counter is (the d's bowl) and where its feet touch the baseline. Drawn big
// on a canvas; flooding the outside leaves the hole.
function glyphInfo(char, css) {
 const size = 200, W = 260, H = 260, c = document.createElement('canvas'); c.width = W; c.height = H;
 const g = c.getContext('2d', { willReadFrequently: true }); g.font = `${css.fontWeight} ${size}px ${css.fontFamily}`;
 const m = g.measureText(char), ox = 30 + m.actualBoundingBoxLeft, oy = 30 + m.actualBoundingBoxAscent;
 g.fillText(char, ox, oy);
 const data = g.getImageData(0, 0, W, H).data, ink = i => data[i * 4 + 3] > 110, seen = new Uint8Array(W * H), stack = [0];
 seen[0] = 1;
 while (stack.length) {
  const i = stack.pop(), x = i % W, y = (i - x) / W;
  for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, y > 0 ? i - W : -1, y < H - 1 ? i + W : -1]) if (j >= 0 && !seen[j] && !ink(j)) { seen[j] = 1; stack.push(j); }
 }
 const left = ox - m.actualBoundingBoxLeft, top = oy - m.actualBoundingBoxAscent, w = m.actualBoundingBoxLeft + m.actualBoundingBoxRight, h = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent;
 let n = 0, sx = 0, sy = 0, x0 = W, x1 = 0, y0 = H, y1 = 0;
 for (let i = 0; i < W * H; i++) if (!seen[i] && !ink(i)) { const x = i % W, y = (i - x) / W; n++; sx += x; sy += y; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
 const counter = n ? { x: (sx / n - left) / w, y: (sy / n - top) / h, w: (x1 - x0) / w, h: (y1 - y0) / h, left: (x0 - left) / w, right: (x1 + 1 - left) / w, top: (y0 - top) / h, bottom: (y1 + 1 - top) / h } : null;
 // Feet: runs of ink along a row just above the baseline.
 const feet = [], row = Math.round(oy - h * .05);
 for (let x = 0, run = -1; x <= W; x++) {
  const on = x < W && ink(row * W + x);
  if (on && run < 0) run = x;
  if (!on && run >= 0) { feet.push([(run - left) / w, (x - left) / w]); run = -1; }
 }
 // The crevice between the first two feet (the V where a d's or an a's
 // bowl meets its stem): the open pixels there, row by row up from the
 // baseline until it closes, as a polygon (fractions of the ink box).
 let notch = null;
 if (feet.length >= 2) {
  const g0 = Math.round(left + feet[0][1] * w), g1 = Math.round(left + feet[1][0] * w), rows = [];
  let cx = Math.round((g0 + g1) / 2);
  for (let y = Math.round(oy - h * .02); y > oy - h * .6; y--) {
   if (ink(y * W + cx)) { let found = -1; for (let d = 1; d < 6 && found < 0; d++) { if (!ink(y * W + cx - d)) found = cx - d; else if (!ink(y * W + cx + d)) found = cx + d; } if (found < 0) break; cx = found; }
   let a = cx, b = cx; while (a > 0 && !ink(y * W + a - 1)) a--; while (b < W - 1 && !ink(y * W + b + 1)) b++;
   if (b - a > (g1 - g0) * 3 + 6) break;
   rows.push([(a - left) / w, (b + 1 - left) / w, (y - top) / h]); cx = Math.round((a + b) / 2);
  }
  if (rows.length > 1) notch = rows;
 }
 return { counter, feet, notch };
}

// Wires the blood to the menu's home page. `page` is [data-page=home], `shell`
// the menu (#intro), `overlay` the svg drawn over it. Surfaces are the
// visible children of .title-buttons except the dev tools link.
export function installTitle({ page, shell, overlay }) {
 const word = page.querySelector('.title-word'), text = word.querySelector('text');
 const surfaces = () => [...page.querySelectorAll('.title-buttons > :not(.title-dev)')].filter(e => !e.hidden && e.getClientRects().length);
 let anim = null, frame = 0, last = 0, drawn = 0, geoKey = '', pending = 0, checked = 0, laidKey = '';
 // Where each thing sits in the layout, without any hover lift or press
 // (those are the buttons' own transforms, which the blood follows anyway).
 // Everything is measured in the page's own coordinates (relative to the
 // home page's top left) and the blood's svg sits inside the page: so the
 // blood is attached to the letters and buttons and moves with them when the
 // page is dragged, scrolled or resized, with no frame of lag.
 const origin = () => page.getBoundingClientRect();
 const untransformed = e => { const o = origin(), r = e.getBoundingClientRect(), t = getComputedStyle(e).transform, m = t && t !== 'none' ? new DOMMatrix(t) : null, dx = (m ? m.e : 0) + o.left, dy = (m ? m.f : 0) + o.top; return { left: r.left - dx, top: r.top - dy, right: r.right - dx, bottom: r.bottom - dy }; };
 // The keyboard / mobile pair: the selected one's pink tab sticks out 15 px
 // past that side of the group (menu-theme.css .input-choice::before/after),
 // so the surface reaches out there too.
 // `free` is the side without the tab (0 left, 1 right): easier to spill
 // over, so that is the end blood runs off.
 const pairFree = e => e.querySelector('[aria-pressed=true]') === e.querySelector('button') ? 1 : 0;
 const surfaceRect = e => {
  const r = untransformed(e);
  if (e.classList.contains('input-choice')) { const free = pairFree(e); if (free === 1) r.left -= 15; else r.right += 15; r.pair = { free }; }
  return r;
 };
 // The layout key leaves the pair's selection out: switching keyboard and
 // mobile is handled in place (BloodAnimation.switchPair), not by a re-lay.
 const quickKey = () => { const o = origin(); return [word, ...surfaces()].map(e => { const r = untransformed(e); return [r.left, r.top, r.right, r.bottom].map(v => Math.round(v)).join(); }).join('|') + Math.round(o.width) + 'x' + Math.round(o.height) + '/' + innerWidth + 'x' + innerHeight; };

 // Fit the word's viewBox to its letter ink (the menus' stretched look).
 function fitWord() {
  const box = text.getBBox(), c = document.createElement('canvas').getContext('2d'), css = getComputedStyle(text);
  c.font = `${css.fontWeight} ${css.fontSize} ${css.fontFamily}`;
  const m = c.measureText(text.textContent), ink = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent;
  word.setAttribute('viewBox', `${box.x} ${25 - m.actualBoundingBoxAscent} ${box.width} ${ink}`);
 }

 // Letters (their ink, not their advance), their bowls and feet, and the
 // buttons, in screen pixels.
 function measure() {
  fitWord(); const o = origin(), ctm = text.getScreenCTM(), point = (x, y) => { const q = new DOMPoint(x, y).matrixTransform(ctm); return { x: q.x - o.left, y: q.y - o.top }; };
  const css = getComputedStyle(text), c = document.createElement('canvas').getContext('2d');
  c.font = `${css.fontWeight} ${css.fontSize} ${css.fontFamily}`;
  const chars = text.textContent, letters = [], info = {};
  for (let i = 0; i < chars.length; i++) {
   const e = text.getExtentOfChar(i), m = c.measureText(chars[i]);
   const a = point(e.x - m.actualBoundingBoxLeft, 25), b = point(e.x + m.actualBoundingBoxRight, 25 - m.actualBoundingBoxAscent);
   const l = { x0: a.x, x1: b.x, bottom: a.y, top: b.y, char: chars[i] }, g = info[l.char] ||= glyphInfo(l.char, css), W = l.x1 - l.x0, H = l.bottom - l.top;
   l.feet = g.feet.map(([f0, f1]) => [l.x0 + W * f0, l.x0 + W * f1]);
   if (g.notch) l.notch = g.notch.map(([a, b, y]) => [l.x0 + W * a, l.x0 + W * b, l.top + H * y]);
   if (g.counter) { const k = g.counter; l.hole = { x: l.x0 + W * k.x, x0: l.x0 + W * k.left, x1: l.x0 + W * k.right, top: l.top + H * k.top, bottom: l.top + H * k.bottom, w: W * k.w, h: H * k.h }; }
   letters.push(l);
  }
  const capH = letters[0].bottom - letters[0].top, source = chars.indexOf('d');
  // The letters again, for the clip and the bowls' mask: the same font, and
  // every glyph pinned at the exact x the word's own glyph starts at. The
  // word inherits letter-spacing from the menu's h1 (.02em) that a copy
  // elsewhere does not, so a copy set as one run drifted right along the
  // word: by the t the red sat visibly off the letters.
  const xs = Array.from(chars, (_, i) => text.getStartPositionOfChar(i).x.toFixed(3)).join(' ');
  const glyphs = { matrix: [ctm.a, ctm.b, ctm.c, ctm.d, ctm.e - o.left, ctm.f - o.top].join(' '), font: `${css.fontStyle} ${css.fontWeight} ${css.fontSize} ${css.fontFamily}`, xs, text: chars };
  const buttons = surfaces().map(el => ({ el, ...surfaceRect(el) }));
  // The svg is the page's size; masks and falling drops reach the whole
  // screen around it (left/top are the screen's corner in page terms).
  return { letters, capH, source, hole: letters[source].hole, glyphs, buttons, pageW: o.width, pageH: o.height, left: -o.left, top: -o.top, width: innerWidth, height: innerHeight };
 }
 const keyOf = geo => [geo.width, geo.height, ...geo.letters.map(l => l.x0.toFixed(0) + ',' + l.bottom.toFixed(0)), ...geo.buttons.map(b => b.pair ? { left: b.left + (b.pair.free === 1 ? 15 : 0), right: b.right - (b.pair.free === 0 ? 15 : 0), top: b.top, bottom: b.bottom } : b).map(b => [b.left, b.top, b.right, b.bottom].map(v => v.toFixed(0)).join())].join('|');

 const active = () => !shell.classList.contains('hidden') && !page.hidden && document.visibilityState !== 'hidden';
 function tick(now) {
  const dt = Math.min(.05, (now - last) / 1000); last = now;
  anim.step(dt);
  // Full rate for the intro; after it, the drips are slow enough for 30.
  if (anim.time < INTRO + .5 || now - drawn >= 32) { anim.render(); drawn = now; } else anim.follow();
  // Twice a second: has the layout moved under it (a font arriving, a button
  // shown or hidden, the window, the page settling)? Then lay it again.
  if (now - checked > 500) { checked = now; if (quickKey() !== laidKey) { later(); return; } }
  // Keyboard / mobile switched: only the blood on the tab that went away
  // goes, at once; the free side moves; nothing else changes.
  anim.geo.buttons.forEach((b, i) => { if (b.pair && pairFree(b.el) !== b.pair.free) anim.switchPair(i, surfaceRect(b.el)); });
  frame = requestAnimationFrame(tick);
 }
 function run() {
  cancelAnimationFrame(frame); frame = 0;
  // Off screen (another menu page, the game, a hidden tab): nothing drawn,
  // nothing running, and none of it left showing over the next page.
  const on = active(); overlay.style.visibility = on ? '' : 'hidden';
  if (!on) return;
  const geo = measure(), key = keyOf(geo);
  if (!geo.buttons.length || !(geo.capH > 4)) return;
  if (!anim) { anim = new BloodAnimation(overlay, geo); }
  else if (key !== geoKey) { const elapsed = anim.time; anim.dispose(); anim = new BloodAnimation(overlay, geo); anim.fastForward(Math.max(elapsed, INTRO)); }
  geoKey = key; laidKey = quickKey(); last = drawn = checked = performance.now();
  frame = requestAnimationFrame(tick);
 }
 // Re-check on the next frame after anything that could show, hide or move
 // it (layout and the fitted button lettering have settled by then).
 const later = () => { if (pending) return; pending = requestAnimationFrame(() => { pending = 0; run(); }); };
 new MutationObserver(later).observe(shell, { attributes: true, attributeFilter: ['class'] });
 new MutationObserver(later).observe(page, { attributes: true, attributeFilter: ['hidden'], subtree: true });
 new ResizeObserver(later).observe(page);
 addEventListener('resize', later); globalThis.visualViewport?.addEventListener('resize', later); addEventListener('orientationchange', later); document.addEventListener('visibilitychange', later);
 document.fonts?.ready.then(later);
 later();
 return { get anim() { return anim; }, refresh: later };
}

class BloodAnimation {
 constructor(svg, geo) {
  this.svg = svg; this.geo = geo; this.time = 0; this.seed = 11;
  svg.replaceChildren(); svg.setAttribute('viewBox', `0 0 ${geo.pageW} ${geo.pageH}`);
  const s = geo.capH, blur = Math.max(2.2, s * .026);
  const defs = make('defs', {}, svg);
  // Goo, flat: blur + hard alpha threshold makes separate shapes one liquid;
  // inside it the shapes keep their own flat colours, and
  // the joins between them are filled with the body colour. No lighting.
  // A plain goo too (no rim, no shadow) for blood that lies on or in the
  // letters: a rim there drew lines round the inside of the letter edges.
  const flat = make('filter', { id: 'title-goo-flat', x: '-10%', y: '-10%', width: '120%', height: '140%', 'color-interpolation-filters': 'sRGB' }, defs);
  make('feGaussianBlur', { in: 'SourceGraphic', stdDeviation: blur, result: 'blur' }, flat);
  make('feColorMatrix', { in: 'blur', type: 'matrix', values: '0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 30 -13', result: 'goo' }, flat);
  make('feFlood', { 'flood-color': BLOOD, result: 'red' }, flat);
  make('feComposite', { in: 'red', in2: 'goo', operator: 'in', result: 'base' }, flat);
  // Shapes keep their own flat colours inside the liquid (the darker and
  // wetter patches low in the smear: the sample's depth); joins are body red.
  make('feComposite', { in: 'SourceGraphic', in2: 'goo', operator: 'in', result: 'own' }, flat);
  make('feComposite', { in: 'own', in2: 'base', operator: 'over' }, flat);
  // A finer plain goo for the smear's top edge: a smaller blur keeps its
  // little curves and tongues (the big one rounded them away).
  const fine = make('filter', { id: 'title-goo-fine', x: '-10%', y: '-10%', width: '120%', height: '140%', 'color-interpolation-filters': 'sRGB' }, defs);
  make('feGaussianBlur', { in: 'SourceGraphic', stdDeviation: blur * .5, result: 'blur' }, fine);
  make('feColorMatrix', { in: 'blur', type: 'matrix', values: '0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 30 -13', result: 'goo' }, fine);
  make('feFlood', { 'flood-color': BLOOD, result: 'red' }, fine);
  make('feComposite', { in: 'red', in2: 'goo', operator: 'in' }, fine);
  const filter = make('filter', { id: 'title-goo', x: '-10%', y: '-10%', width: '120%', height: '140%', 'color-interpolation-filters': 'sRGB' }, defs);
  make('feGaussianBlur', { in: 'SourceGraphic', stdDeviation: blur, result: 'blur' }, filter);
  make('feColorMatrix', { in: 'blur', type: 'matrix', values: '0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 30 -13', result: 'goo' }, filter);
  // Definition, still flat (no light, no sheen): a thin darker rim round
  // every edge of the liquid (the blur at a higher threshold is its inside)
  // and a faint shadow just below it, so what hangs off a letter or sits on
  // a button reads as lying on top of it (the first sample's look).
  make('feColorMatrix', { in: 'blur', type: 'matrix', values: '0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 14 -8.6', result: 'core' }, filter);
  make('feFlood', { 'flood-color': BLOOD_DEEP, result: 'deep' }, filter);
  make('feComposite', { in: 'deep', in2: 'goo', operator: 'in', result: 'rim' }, filter);
  make('feFlood', { 'flood-color': BLOOD, result: 'red' }, filter);
  make('feComposite', { in: 'red', in2: 'core', operator: 'in', result: 'inner' }, filter);
  make('feComposite', { in: 'inner', in2: 'rim', operator: 'over', result: 'body' }, filter);
  make('feOffset', { in: 'goo', dx: blur * .25, dy: blur * .55, result: 'drop' }, filter);
  make('feGaussianBlur', { in: 'drop', stdDeviation: blur * .45, result: 'dropSoft' }, filter);
  make('feFlood', { 'flood-color': '#0b0405', 'flood-opacity': .38, result: 'dark' }, filter);
  make('feComposite', { in: 'dark', in2: 'dropSoft', operator: 'in', result: 'shadow' }, filter);
  make('feComposite', { in: 'body', in2: 'shadow', operator: 'over' }, filter);
  // The letters as a clip (blood on them), and as a mask with the letters cut
  // out (blood in their bowls).
  const glyphText = parent => { const t = make('text', { x: geo.glyphs.xs, y: 25, transform: `matrix(${geo.glyphs.matrix})`, style: `font:${geo.glyphs.font};letter-spacing:0;word-spacing:0;font-kerning:none;text-transform:none` }, parent); t.textContent = geo.glyphs.text; return t; };
  glyphText(make('clipPath', { id: 'title-glyphs' }, defs));
  // The smear's own mask: the letters grown by about a pixel on screen, so
  // the red also covers the soft (anti-aliased) rim of each cream letter
  // instead of leaving a pale hairline round it.
  const ink = make('mask', { id: 'title-ink', maskUnits: 'userSpaceOnUse', x: geo.left, y: geo.top, width: geo.width, height: geo.height }, defs);
  const inkText = glyphText(ink); inkText.setAttribute('fill', '#fff'); inkText.setAttribute('stroke', '#fff'); inkText.setAttribute('stroke-width', '1'); inkText.setAttribute('vector-effect', 'non-scaling-stroke'); inkText.setAttribute('stroke-linejoin', 'round');
  const holes = make('mask', { id: 'title-holes', maskUnits: 'userSpaceOnUse', x: geo.left, y: geo.top, width: geo.width, height: geo.height }, defs);
  make('rect', { x: geo.left, y: geo.top, width: geo.width, height: geo.height, fill: '#fff' }, holes);
  glyphText(holes).setAttribute('fill', '#000');
  this.clipRects = geo.buttons.map((b, i) => { const c = make('clipPath', { id: `title-clip-${i}` }, defs); return make('rect', { x: b.left, y: b.top, width: b.right - b.left, height: b.bottom - b.top, rx: 5 }, c); });
  // Drawing order: the smear on the letters (flat, clipped to them: it meets
  // every edge exactly, and a goo filter there rounded it off unevenly at
  // each stroke), the bowls (flat, through the holes mask), the hanging
  // liquid (gooed: lips, beads, drips, which overlap the letters' feet so
  // they join the smear), each button's layer, the falling drops.
  // Bowls: gooed (a liquid level with a rounded meniscus and a few bubbles),
  // then masked to the holes.
  this.bowls = make('g', { mask: 'url(#title-holes)' }, svg);
  this.bowlsGoo = make('g', { filter: 'url(#title-goo-flat)', fill: BLOOD }, this.bowls);
  // Inside each bowl, where the letter overhangs the pool, a cartoon shadow:
  // a band of darker red hugging the bowl's inner wall, only within the
  // pooled blood (clipped to the fills), the same shape language as the rim.
  this.bowlClip = make('clipPath', { id: 'title-bowl-fill' }, defs);
  const shade = glyphText(make('g', { 'clip-path': 'url(#title-bowl-fill)' }, this.bowls));
  shade.setAttribute('fill', 'none'); shade.setAttribute('stroke', BLOOD_SHADE); shade.setAttribute('stroke-width', (s * .07).toFixed(1)); shade.setAttribute('vector-effect', 'non-scaling-stroke'); shade.setAttribute('stroke-linejoin', 'round');
  // The letters' undersides, for the band below: just the bottom of the
  // word (where round letters curve under and the feet stand).
  { const bottom = Math.max(...geo.letters.map(l => l.bottom)), x0 = geo.letters[0].x0 - s, x1 = geo.letters[geo.letters.length - 1].x1 + s;
   make('rect', { x: x0, y: bottom - s * .11, width: x1 - x0, height: s * .4 }, make('clipPath', { id: 'title-smear-area' }, defs)); }
  // The wet top of the smear: clipped to the letters, plain goo (rounded top).
  // The smear: shaped past the letters' sides, gooed (rim, shadow), then cut
  // to the letters (grown a pixel, over their soft rims).
  // Plain goo (no rim, no cast shadow): just red, then the pale letter.
  this.smear = make('g', { filter: 'url(#title-goo-fine)', fill: BLOOD }, make('g', { mask: 'url(#title-ink)' }, svg));
  // What hangs off the letters (lips, beads, drips): the rimmed goo with its
  // faint shadow, shown only outside the letters (the holes mask), so its
  // edge never draws a line inside a letter; it meets the smear exactly at
  // each letter's foot.
  this.liquid = make('g', { filter: 'url(#title-goo)', mask: 'url(#title-holes)', fill: BLOOD }, svg);
  // Blood wrapping round the letters' undersides: the glyphs stroked, kept
  // only along the bottom of the word and (the mask) outside the letters,
  // gooed with the lips and drips. So the liquid hugs each bottom and the
  // round undersides (not the sides), and closes the crevices.
  // The underside band and the crevices come in with the spreading blood
  // (the reach clip: a strip round each source, widening as the pour
  // spreads), not already there before it arrives.
  this.reachClip = make('clipPath', { id: 'title-reach' }, defs);
  const hug = glyphText(make('g', { 'clip-path': 'url(#title-smear-area)' }, make('g', { 'clip-path': 'url(#title-reach)' }, this.liquid)));
  hug.setAttribute('fill', 'none'); hug.setAttribute('stroke', BLOOD); hug.setAttribute('stroke-width', (s * .034).toFixed(1)); hug.setAttribute('vector-effect', 'non-scaling-stroke'); hug.setAttribute('stroke-linejoin', 'round');
  // Crevices: flat red, not masked (they sit low, where the letter is red
  // anyway), and drawn a pixel or two fat so the V's tip is covered too.
  this.crevices = make('g', { fill: BLOOD, stroke: BLOOD, 'stroke-width': 3, 'stroke-linejoin': 'round', 'clip-path': 'url(#title-reach)' }, svg); // over the hanging blood's rim

  // The smear's wet top layer lives in the same goo as the lips and drips
  // (clipped to the letters first), so where the blood leaves a letter's
  // foot and hangs, it is one smooth piece of liquid.
  // The buttons' blood: stains per button, and all the liquid (pools, runs,
  // front runs) in ONE goo, each button's in its own group inside it (moved
  // with its button). One goo means a run coming down off a button and the
  // pool it lands in on the next are one piece of liquid: separate goos drew
  // a rimmed border where they met.
  const stainsRoot = make('g', {}, svg), buttonGoo = make('g', { filter: 'url(#title-goo)', fill: BLOOD }, svg);
  this.layers = geo.buttons.map((b, i) => { const layer = make('g', {}, stainsRoot); return { layer, stains: make('g', { 'clip-path': `url(#title-clip-${i})` }, layer), liquid: make('g', {}, buttonGoo), matrix: '' }; });
  this.flecks = make('g', { fill: BLOOD }, svg);
  const L = geo.letters, x0 = L[0].x0, x1 = L[L.length - 1].x1;
  this.span = x1 - x0;
  // It comes out of the bowls: the d, the a, the second d (not the e's eye).
  this.sources = L.filter(l => l.hole && l.char !== 'e').map(l => l.hole.x);
  this.reachRects = this.sources.map(() => make('rect', { x: 0, y: geo.top, width: 0, height: geo.height }, this.reachClip));
  if (!this.sources.length) this.sources = [L[0].x0];
  // The top of the blood, as in the sample the owner liked: one pour across
  // the word, about a third up, rising and falling in slow and quicker waves,
  // with a few thin streaks where it ran higher, its top edge rounded by the
  // goo (the wet layer) rather than cut. A letter with a bowl comes up at
  // least to the bowl, eased in over the letter so it does not step.
  const ph = [this.rand() * 9, this.rand() * 9, this.rand() * 9];
  const streaks = Array.from({ length: 8 }, () => ({ x: x0 + this.span * this.rand(), w: s * (.04 + this.rand() * .06), h: s * (this.rand() < .75 ? .03 + this.rand() * .08 : -(.02 + this.rand() * .03)) }));
  // A little bunched near the top: small rounded tongues and sags.
  const tongues = Array.from({ length: 30 }, () => ({ x: x0 + this.span * this.rand(), w: s * (.022 + this.rand() * .045), h: s * (this.rand() < .6 ? .01 + this.rand() * .03 : -(.008 + this.rand() * .02)) }));
  const pour = x => {
   // Liquid, not lumps: long smooth swells and a few broad rounded tongues
   // where it crept higher, with soft shoulders (cos^2), which the goo rounds.
   let h = s * .27 * (1 + .18 * Math.sin(x / s * 2.1 + ph[0]) + .14 * Math.sin(x / s * 4.7 + ph[1]) + .06 * Math.sin(x / s * 10 + ph[2]) + .03 * Math.sin(x / s * 21 + ph[1] * 2));
   for (const k of streaks) { const d = (x - k.x) / k.w; if (Math.abs(d) < 1) h += k.h * Math.cos(d * Math.PI / 2) ** 2; }
   for (const k of tongues) { const d = (x - k.x) / k.w; if (Math.abs(d) < 1) h += k.h * Math.cos(d * Math.PI / 2) ** 2; }
   return h;
  };
  // Each letter's own height (its bowl, the low e and s), then ONE path
  // across the whole word, blending from letter to letter in the gaps: no
  // side edges between letters for the goo to round off unevenly.
  const heights = L.map((l, li) => {
   // Every other letter: a nice round swell rising a little further onto
   // the pale part, across the middle of the letter.
   const arch = li % 2 === 1 ? s * (.045 + this.rand() * .03) : 0, archAt = .35 + this.rand() * .3;
   // The e and the s end in a tail at the bottom that sticks out: blood
   // well up over it made a red hook. On those two it stays low (under the
   // tail's top), and the e's eye is not filled (it sat apart, high up).
   const low = l.char === 'e' || l.char === 's';
   const need = l.hole && !low ? l.bottom - l.hole.bottom + s * .03 : 0, w = l.x1 - l.x0;
   return x => { const u = clamp((x - l.x0) / w, 0, 1), bell = Math.sin(u * Math.PI) ** .7, swell = arch * Math.max(0, Math.cos(clamp((u - archAt) / .38, -1, 1) * Math.PI / 2)) ** 2, h = Math.max(pour(x) + swell, need * (.55 + .45 * bell)); return low ? Math.min(h, s * (.15 + .04 * Math.sin(x / s * 9 + ph[1]))) : h; };
  });
  const heightAt = x => {
   let i = L.findIndex(l => x <= l.x1); if (i < 0) i = L.length - 1;
   if (x >= L[i].x0 || i === 0) return heights[i](x);
   const k = ease((x - L[i - 1].x1) / (L[i].x0 - L[i - 1].x1));
   return heights[i - 1](x) * (1 - k) + heights[i](x) * k;
  };
  const over = s * .07, step = Math.max(1.5, s * .009), xs = [], base = Math.max(...L.map(l => l.bottom));
  for (let x = x0 - over; x < x1 + over; x += step) xs.push(x);
  xs.push(x1 + over);
  this.letters = [{ l: { bottom: base }, xs, h: xs.map(heightAt), el: this.shape('path', this.smear) }];
  // Bowls: the first d fills well up from the start (the source); the others
  // part fill as the smear reaches them. A few bubbles ride the surface.
  this.fills = L.filter(l => l.hole && l.char !== 'e').map(l => {
   const first = l === L[geo.source], h = l.hole, order = this.sources.indexOf(h.x);
   const bubbles = Array.from({ length: 2 + Math.floor(this.rand() * 2) }, () => ({ u: .15 + this.rand() * .7, r: s * (.012 + this.rand() * .018), el: this.shape('circle', this.bowlsGoo) }));
   return { l, h, first, level: .3 + this.rand() * .12, start: Math.max(0, order) * .35, time: 1.3, el: this.shape('rect', this.bowlsGoo), clip: this.shape('rect', this.bowlClip), bubbles };
  });
  // Hanging from each foot: a sagging lip, drawn as a row of overlapping
  // blobs of different sizes that the goo joins into one uneven hanging edge.
  this.feet = [];
  for (const l of L) for (const [a, b] of l.feet) if (b - a > s * .04) {
   const thick = s * (.024 + this.rand() * .018), n = Math.max(2, Math.round((b - a) / (s * .045))), blobs = [];
   for (let k = 0; k < n; k++) blobs.push({ x: a + (b - a) * (k + .5) / n, r: thick * (.85 + this.rand() * .35), el: this.shape('circle', this.liquid) });
   this.feet.push({ l, a, b, thick, blobs });
  }
  this.beads = [];
  for (const f of this.feet) if (this.rand() < .3) this.beads.push({ f, x: f.a + (f.b - f.a) * (.25 + .5 * this.rand()), r: s * (.028 + this.rand() * .022), el: this.shape('circle', this.liquid) });
  // Every letter can drip: one site under each (its widest foot). They take
  // turns (no more than two filling at once), so it never drips everywhere
  // at the same moment; two are long hangers that stay. The letter nearest
  // the top button's free end drips over that end, so the pool there
  // reaches it and the blood keeps working its way down the buttons.
  this.sites = [];
  this.freeSide = geo.buttons.find(b => b.pair)?.pair.free ?? 1;
  // Drips hang in the gap and never over the buttons: the longest reaches
  // 70% of the way down to the first button (a falling drop lands on it).
  const gapTop = Math.max(...L.map(l => l.bottom)), room = geo.buttons.length ? Math.max(s * .2, (Math.min(...geo.buttons.map(b => b.top)) - gapTop) * .7) : s;
  this.room = room;
  // Two feeders: the letters nearest each end of the top button drip over
  // those ends, so blood reaches both sides of the buttons (the keyboard /
  // mobile tab side too, where it pools up).
  const b0 = geo.buttons[0], wants = b0 ? [b0.left + s * .14, b0.right - s * .14] : [];
  const widest = L.map(l => this.feet.filter(f => f.l === l).sort((p, q) => (q.b - q.a) - (p.b - p.a))[0]).filter(Boolean);
  const feeders = new Map();
  for (const want of wants) { const f = widest.reduce((best, g) => Math.abs((g.a + g.b) / 2 - want) < Math.abs((best.a + best.b) / 2 - want) ? g : best, widest[0]); if (!feeders.has(f)) feeders.set(f, want); }
  const hangers = new Set([widest[Math.floor(widest.length * .3)], widest[Math.floor(widest.length * .75)]].filter(f => f && !feeders.has(f)));
  // The crevice at the bottom of the d's and the a (where the bowl meets the
  // stem): blood comes out of it. A bridging blob joins the two feet there,
  // and that letter's drip hangs from the crevice itself.
  const crevices = new Map();
  for (const l of L) {
   if (!l.hole || l.char === 'e') continue;
   const own = this.feet.filter(f => f.l === l).sort((p, q) => p.a - q.a);
   if (own.length < 2) continue;
   const gapA = own[0].b, gapB = own[1].a, thick = (own[0].thick + own[1].thick) / 2;
   const bridge = { l, a: gapA - s * .02, b: gapB + s * .02, thick, blobs: [{ x: (gapA + gapB) / 2, r: Math.max(thick * 1.3, (gapB - gapA) * .75), el: this.shape('circle', this.liquid) }] };
   this.feet.push(bridge); crevices.set(l, bridge);
   // The V of the crevice itself runs up into the letter, too narrow for the
   // goo to reach: fill it flat (traced from the glyph, so it fits the V).
   if (l.notch) {
    const pts = [...l.notch.map(([a, , y]) => `${(a - 1).toFixed(1)},${(y - .5).toFixed(1)}`), ...l.notch.slice().reverse().map(([, b, y]) => `${(b + 1).toFixed(1)},${(y - .5).toFixed(1)}`)];
    make('polygon', { points: pts.join(' ') }, this.crevices);
   }
  }
  for (const w of widest) {
   const f = !feeders.has(w) && crevices.get(w.l) || w;
   const feeder = feeders.has(f), hang = hangers.has(w) && f === w, x = feeder ? clamp(feeders.get(f), f.a + s * .02, f.b - s * .02) : f === w ? f.a + (f.b - f.a) * (.3 + .4 * this.rand()) : (f.a + f.b) / 2;
   this.sites.push({ f, x, hang, feeds: feeder, r: s * (.03 + this.rand() * .018), len: Math.min(room, s * (hang ? .75 + this.rand() * .5 : .35 + this.rand() * .45)), state: 'wait', next: this.reachAt(x) + .7 + this.rand() * (feeder ? 1 : 4), born: 0, grow: 1, el: this.shape('path', this.liquid), tip: this.shape('ellipse', this.liquid) });
  }
  // Two quick drippers and two doubles (two drops hanging off one letter),
  // on letters that are not feeding the buttons or hanging long.
  const plain = this.sites.filter(o => !o.hang && !o.feeds);
  for (const o of plain.filter((_, k) => k % 3 === 1).slice(0, 2)) { o.kind = 'fast'; o.len = Math.min(room, s * (.16 + this.rand() * .18)); o.r *= .8; }
  for (const o of plain.filter((_, k) => k % 3 === 2).slice(0, 2)) {
   const side = o.x + s * .05 < o.f.b - s * .01 ? 1 : -1, x = clamp(o.x + side * s * .05, o.f.a + s * .01, o.f.b - s * .01);
   const twin = { ...o, x, r: o.r * .85, len: o.len * (.6 + this.rand() * .3), state: 'wait', next: 1e9, twinOf: o, twin: null, el: this.shape('path', this.liquid), tip: this.shape('ellipse', this.liquid) };
   o.twin = twin; this.sites.push(twin);
  }
  this.drops = []; this.pools = geo.buttons.map(() => []); this.runs = []; this.spray = []; this.stainCount = [];
  // Which end of each button blood runs off: one end per button (runs down
  // both read as a frame). All take the side the keyboard / mobile pair has
  // free (its selected button's tab sticks out on the other side, which is
  // harder to spill over), so a run keeps finding the next button down.
  const pairAt = geo.buttons.findIndex(b => b.pair);
  // Buttons above the pair spill off both ends (so blood also reaches its
  // tab side and heaps up there); the pair only off its free end; buttons
  // below it off that same end.
  this.edgeOpen = geo.buttons.map((b, i) => b.pair ? [b.pair.free === 0, b.pair.free === 1] : pairAt > i ? [true, true] : [this.freeSide === 0, this.freeSide === 1]);
  this.settled = false;
 }
 rand() { this.seed = (this.seed * 16807) % 2147483647; return this.seed / 2147483647; }
 shape(tag, parent, attrs) { return make(tag, attrs, parent); }
 // When the smear reaches x, spreading out from the source d.
 reachAt(x) { return 1.1 + Math.min(...this.sources.map(c => Math.abs(x - c))) / this.span * 5; }
 grown(x, t = this.time) { return ease((t - this.reachAt(x)) / .9); }
 layerOf(i) { return this.layers[i].liquid; }

 fall(x, y, r, vy = 0) { this.drops.push({ x, y, r, vy, el: this.shape('ellipse', this.flecks) }); }

 step(dt) {
  this.time += dt;
  const t = this.time, geo = this.geo, s = geo.capH, g = s * 14;
  for (const d of this.sites) {
   // Normal drips take turns (two at once at most); a fast one and the
   // second of a double do not wait their turn.
   const free = d.kind === 'fast' || d.twinOf || this.sites.filter(o => o.state === 'grow' && !o.hang && o.kind !== 'fast' && !o.twinOf).length < 2;
   if (d.state === 'wait' && t >= d.next && free) {
    d.state = 'grow'; d.born = t; d.grow = d.hang ? 2.6 + this.rand() : d.kind === 'fast' ? .35 + this.rand() * .25 : 1.1 + this.rand() * 1.3;
    // A double: its twin starts a moment later, on the same letter.
    if (d.twin && d.twin.state === 'wait') d.twin.next = t + .25 + this.rand() * .25;
   }
   if (d.state === 'grow' && t - d.born >= d.grow) {
    if (d.hang) d.state = 'hang';
    else { d.state = 'retract'; d.let = t; this.fall(d.x, d.f.l.bottom + d.len + s * .02, d.r * 1.15, s * .6); }
   }
   if (d.state === 'retract' && t - d.let > (d.kind === 'fast' ? .25 : .7)) {
    d.state = 'wait';
    // Fast drips come in bursts of a few quick drops, then rest.
    if (d.kind === 'fast') { d.burst = (d.burst || 0) + 1; d.next = t + (d.burst % 3 ? .2 + this.rand() * .35 : 4 + this.rand() * 5); d.len = Math.min(this.room, s * (.16 + this.rand() * .18)); }
    else { d.next = t + (d.twinOf ? 1e9 : d.feeds ? 1.5 + this.rand() * 2 : 3 + this.rand() * 6); d.len = Math.min(this.room, s * (.35 + this.rand() * .45)); }
   }
  }
  // Falling drops: gravity, then the first button top they meet (buttons are
  // solid), else off the bottom of the screen.
  for (const drop of [...this.drops]) {
   const y0 = drop.y; drop.vy += g * dt; drop.y += drop.vy * dt;
   const hit = geo.buttons.findIndex(b => drop.x > b.left + 1 && drop.x < b.right - 1 && y0 + drop.r <= b.top + 1 && drop.y + drop.r >= b.top);
   if (hit >= 0) { this.land(hit, drop); this.remove(this.drops, drop); continue; }
   if (drop.y > geo.top + geo.height + 40) this.remove(this.drops, drop);
  }
  // Pools spread along the top edge; they creep over the front and, at an
  // open end, run down the side and drip off.
  this.pools.forEach((pools, i) => {
   const b = geo.buttons[i];
   for (const p of pools) {
    p.rx += (p.target - p.rx) * Math.min(1, dt * 1.6);
    // On the pair, blood creeps toward the tab end and heaps up there.
    // (A pool at the free end stays: that is where it spills to the next.)
    if (b.pair) { const closed = b.pair.free === 1 ? b.left : b.right, free = b.pair.free === 1 ? b.right : b.left, dir = Math.sign(closed - p.x); if (Math.abs(p.x - free) > s * .45) p.x = clamp(p.x + dir * dt * s * .05, b.left + p.rx * .6, b.right - p.rx * .6); }
    for (const f of p.face) f.len = Math.min(f.max, f.len + dt * f.speed * (1 - f.len / (f.max * 1.15)));
    for (const side of [-1, 1]) {
     const edge = side < 0 ? b.left : b.right;
     if (Math.abs(p.x + side * p.rx - edge) < s * .04 || (side < 0 ? p.x - p.rx < edge : p.x + p.rx > edge)) {
      if (this.edgeOpen[i][side < 0 ? 0 : 1] && p.rx > s * .22 && !this.runs.some(r => r.button === i && r.side === side)) this.runs.push({ button: i, side, x: edge - side * s * .028, born: t, len: 0, next: t + 1.2, el: this.shape('rect', this.layerOf(i)), tip: this.shape('circle', this.layerOf(i)) });
     }
    }
   }
  });
  for (const run of this.runs) {
   // A run reaches right down onto the next button when one is below it
   // (it joins the pool it feeds), else just past this one's bottom.
   const b = geo.buttons[run.button], below = geo.buttons.find(n => n.top >= b.bottom - 1 && run.x > n.left + 2 && run.x < n.right - 2);
   const full = below && below.top - b.bottom < s * .6 ? below.top - b.top + s * .015 : b.bottom - b.top + s * .05;
   run.len = Math.min(full, run.len + dt * s * .35);
   if (run.len >= full && t >= run.next) { if (below && below.top - b.bottom < s * .6) this.land(geo.buttons.indexOf(below), { x: run.x, r: s * .03, stream: true }); else this.fall(run.x, b.bottom + s * .04, s * .03, s * .3); run.next = t + 1.8 + this.rand() * 2.6; }
  }
  for (const f of [...this.spray]) { f.vy += g * dt; f.x += f.vx * dt; f.y += f.vy * dt; f.life -= dt; if (f.life <= 0) this.remove(this.spray, f); }
 }

 land(i, drop) {
  const b = this.geo.buttons[i], s = this.geo.capH, pools = this.pools[i];
  // Joins a pool only near its middle; nearer an end it starts its own (the
  // goo joins them to look like one), so blood landing near a button's end
  // builds up there and reaches the end instead of feeding one big middle pool.
  let pool = pools.find(p => Math.abs(p.x - drop.x) < p.rx * .6 + s * .03);
  // A pool is a puddle, not an oval: a body and a few lobes of different
  // sizes along it that the goo joins into an uneven edge, thicker as more
  // lands. The keyboard / mobile pair holds more (its tab end does not spill,
  // so blood heaps up against it).
  const add = drop.r * 5, cap = (b.right - b.left) * (b.pair ? .55 : .42);
  if (pool) { pool.target = Math.min(cap, pool.target + add * .5); pool.volume += 1; }
  else {
   pool = { x: drop.x, rx: drop.r * .6, target: add, volume: 1, el: this.shape('ellipse', this.layerOf(i)), face: [],
    lobes: Array.from({ length: 4 }, (_, k) => ({ u: (k / 3 - .5) * 1.5 + (this.rand() - .5) * .3, k: .28 + this.rand() * .22, h: .75 + this.rand() * .6, el: this.shape('ellipse', this.layerOf(i)) })) };
   pools.push(pool);
  }
  // Some of it creeps over the front of the button in slow runs.
  if (pool.face.length < 4 && this.rand() < .7) pool.face.push({ x: clamp(drop.x + (this.rand() - .5) * pool.rx * 1.4, b.left + s * .03, b.right - s * .03), len: 0, max: (b.bottom - b.top) * (.25 + this.rand() * .6), speed: s * (.04 + this.rand() * .08), w: s * (.03 + this.rand() * .024), el: this.shape('rect', this.layerOf(i)), tip: this.shape('circle', this.layerOf(i)) });
  if (!drop.stream) for (let k = 0; k < 5; k++) this.spray.push({ x: drop.x, y: b.top - 1, vx: (this.rand() - .5) * s * 3, vy: -s * (1 + this.rand() * 1.6), r: s * (.006 + this.rand() * .01), life: .35, el: this.shape('circle', this.flecks) });
  if ((this.stainCount[i] = (this.stainCount[i] || 0) + 1) <= 7) {
   const g = make('g', { opacity: (.6 + this.rand() * .3).toFixed(2) }, this.layers[i].stains), sx = drop.x + (this.rand() - .5) * s * .3; g.stainX = sx;
   this.splatShapes(g, sx, b.top + (b.bottom - b.top) * (.15 + this.rand() * .55), drop.r, STAIN);
  }
 }

 // A splatter: a soaked blot (a few overlapping lobes), flecks thrown to one
 // side of it, sometimes a thin trickle.
 splatShapes(g, x, y, r, fill, trickle = true) {
  const s = this.geo.capH; g.setAttribute('fill', fill);
  const lobes = 2 + Math.floor(this.rand() * 3), size = r * (.7 + this.rand() * .8);
  for (let k = 0; k < lobes; k++) make('ellipse', { cx: (x + (this.rand() - .5) * size * 1.2).toFixed(1), cy: (y + (this.rand() - .5) * size * .8).toFixed(1), rx: (size * (.5 + this.rand() * .6)).toFixed(1), ry: (size * (.35 + this.rand() * .4)).toFixed(1) }, g);
  const dir = this.rand() < .5 ? -1 : 1;
  for (let k = 0, n = 3 + Math.floor(this.rand() * 4); k < n; k++) {
   const d = size * (1.2 + this.rand() * 3.2), a = (this.rand() - .5) * 1.4;
   make('ellipse', { cx: (x + dir * Math.cos(a) * d).toFixed(1), cy: (y + Math.sin(a) * d * .6).toFixed(1), rx: (s * (.006 + this.rand() * .012) * (1.6 - d / (size * 4.4))).toFixed(1), ry: (s * (.005 + this.rand() * .008)).toFixed(1), transform: `rotate(${(a * 57).toFixed(0)} ${x.toFixed(1)} ${y.toFixed(1)})` }, g);
  }
  if (trickle && this.rand() < .3) make('rect', { x: (x - s * .007).toFixed(1), y: y.toFixed(1), width: (s * .014).toFixed(1), height: (s * (.08 + this.rand() * .18)).toFixed(1), rx: (s * .007).toFixed(1) }, g);
 }

 // The keyboard / mobile pair switched (its tab now sticks out on the other
 // side): the button's reach changes to `rect`. Blood that was on the tab
 // that went away goes at once (pools, runs over the front, stains, a run
 // off that end); the end without the tab is the one that spills now.
 switchPair(i, rect) {
  const b = this.geo.buttons[i], s = this.geo.capH, inside = x => x >= rect.left && x <= rect.right;
  b.left = rect.left; b.right = rect.right; b.pair = rect.pair;
  const c = this.clipRects[i]; c.setAttribute('x', rect.left); c.setAttribute('width', rect.right - rect.left);
  for (const p of [...this.pools[i]]) {
   if (!inside(p.x)) { for (const f of p.face) { f.el.remove(); f.tip.remove(); } for (const o of p.lobes) o.el.remove(); this.remove(this.pools[i], p); continue; }
   p.face = p.face.filter(f => { if (inside(f.x)) return true; f.el.remove(); f.tip.remove(); return false; });
   p.target = Math.min(p.target, Math.min(p.x - rect.left, rect.right - p.x) + s * .02); p.rx = Math.min(p.rx, p.target);
  }
  for (const g of [...this.layers[i].stains.children]) if (g.stainX !== undefined && !inside(g.stainX)) g.remove();
  for (const r of this.runs.filter(r => r.button === i)) { r.el.remove(); r.tip.remove(); this.runs.splice(this.runs.indexOf(r), 1); }
  this.edgeOpen[i] = [rect.pair.free === 0, rect.pair.free === 1];
 }

 remove(list, item) { const i = list.indexOf(item); if (i >= 0) list.splice(i, 1); item.el.remove(); }

 render() {
  const t = this.time, geo = this.geo, s = geo.capH;
  // The word only changes during the intro.
  if (!this.settled) {
   for (const L of this.letters) {
    // One wet pour across the word (gooed, rimmed, cut to the letters).
    const bottom = L.l.bottom + s * .08;
    let d = `M${L.xs[0].toFixed(1)} ${bottom.toFixed(1)}`;
    L.xs.forEach((x, k) => { const g = this.grown(x), h = L.h[k] * g; d += `L${x.toFixed(1)} ${(L.l.bottom - h + (1 - g) * s * .08).toFixed(1)}`; }); // not yet reached: flat along the band's foot, below the letter (no red hairline under it)
    const end = `L${L.xs[L.xs.length - 1].toFixed(1)} ${bottom.toFixed(1)}Z`;
    L.el.setAttribute('d', d + end);
   }
   for (const f of this.fills) {
    const k = ease((t - f.start) / f.time), depth = (f.h.bottom - f.h.top) * f.level * k, top = f.h.bottom + 1 - depth;
    f.el.setAttribute('x', (f.h.x0 - 2).toFixed(1)); f.el.setAttribute('width', (f.h.x1 - f.h.x0 + 4).toFixed(1));
    f.el.setAttribute('y', top.toFixed(1)); f.el.setAttribute('height', (depth > .5 ? depth + 3 : 0).toFixed(1));
    f.clip.setAttribute('x', (f.h.x0 - 2).toFixed(1)); f.clip.setAttribute('width', (f.h.x1 - f.h.x0 + 4).toFixed(1)); f.clip.setAttribute('y', (top + s * .01).toFixed(1)); f.clip.setAttribute('height', (depth > .5 ? depth + 3 : 0).toFixed(1));
    for (const q of f.bubbles) { q.el.setAttribute('cx', (f.h.x0 + (f.h.x1 - f.h.x0) * q.u).toFixed(1)); q.el.setAttribute('cy', (top + q.r * .2).toFixed(1)); q.el.setAttribute('r', (depth > 2 ? q.r * k : 0).toFixed(2)); }
   }
   for (const f of this.feet) {
    const k = ease((t - this.reachAt((f.a + f.b) / 2) - .3) / .9);
    for (const o of f.blobs) { o.el.setAttribute('cx', o.x.toFixed(1)); o.el.setAttribute('cy', (f.l.bottom + (o.r * .2 - s * .008) * k).toFixed(1)); o.el.setAttribute('r', (o.r * k).toFixed(2)); }
   }
   // How far the pour has spread from each source: x is inside once the
   // smear has started to rise there (reachAt(x) + a little).
   const reach = t > INTRO ? this.span * 4 : Math.max(0, (t - 1.1 - .25) / 5 * this.span);
   this.sources.forEach((c, i) => { const r = this.reachRects[i]; r.setAttribute('x', (c - reach).toFixed(1)); r.setAttribute('width', (reach * 2).toFixed(1)); });
   if (t > INTRO) this.settled = true;
  }
  for (const bead of this.beads) {
   const k = ease((t - this.reachAt(bead.x) - .8) / 1.4), sway = Math.sin(t * 1.1 + bead.x) * .05;
   bead.el.setAttribute('cx', bead.x.toFixed(1)); bead.el.setAttribute('cy', (bead.f.l.bottom + bead.f.thick * .7 + bead.r * .45 * k).toFixed(1)); bead.el.setAttribute('r', (bead.r * k * (1 + sway)).toFixed(2));
  }
  // Drips: a neck narrowing under the foot to a heavy bulb.
  for (const d of this.sites) {
   const top = d.f.l.bottom + d.f.thick * .4;
   let len;
   if (d.state === 'wait') len = d.len * .12 * ease((t - this.reachAt(d.x) - .5) / .8);
   else if (d.state === 'grow') { const k = clamp((t - d.born) / d.grow, 0, 1); len = d.len * (.12 + .88 * (k < .7 ? ease(k / .7) * .65 : .65 + .35 * ((k - .7) / .3) ** 2)); }
   else if (d.state === 'retract') len = d.len * (1 - ease((t - d.let) / .7) * .88);
   else len = d.len * (1 + Math.sin(t * .7 + d.x) * .035);
   // A drip site shows up with the blood reaching it, not before.
   const appear = this.settled ? 1 : ease((t - this.reachAt(d.x) - .2) / .6);
   const r = d.r * (d.state === 'wait' || d.state === 'retract' ? .8 : 1) * (d.hang ? 1.15 : 1) * appear, neck = r * .42, tip = top + len;
   d.el.setAttribute('d', `M${(d.x - r * 1.4).toFixed(1)} ${top.toFixed(1)} Q${(d.x - neck).toFixed(1)} ${(top + len * .3).toFixed(1)} ${(d.x - neck).toFixed(1)} ${(tip - r * .6).toFixed(1)} L${(d.x + neck).toFixed(1)} ${(tip - r * .6).toFixed(1)} Q${(d.x + neck).toFixed(1)} ${(top + len * .3).toFixed(1)} ${(d.x + r * 1.4).toFixed(1)} ${top.toFixed(1)} Z`);
   d.tip.setAttribute('cx', d.x.toFixed(1)); d.tip.setAttribute('cy', tip.toFixed(2)); d.tip.setAttribute('rx', (r * .95).toFixed(2)); d.tip.setAttribute('ry', (r * 1.15).toFixed(2));
  }
  for (const drop of this.drops) {
   const stretch = 1 + Math.min(1.4, drop.vy / (s * 18));
   drop.el.setAttribute('cx', drop.x.toFixed(1)); drop.el.setAttribute('cy', drop.y.toFixed(1)); drop.el.setAttribute('rx', (drop.r / Math.sqrt(stretch)).toFixed(2)); drop.el.setAttribute('ry', (drop.r * stretch).toFixed(2));
  }
  this.pools.forEach((pools, i) => {
   const b = geo.buttons[i];
   for (const p of pools) {
    const rx = p.rx, left = Math.max(b.left - s * .008, p.x - rx), right = Math.min(b.right + s * .008, p.x + rx), cx = (left + right) / 2, half = (right - left) / 2;
    // Heaped on top of the edge: most of its thickness above the button, so
    // it never covers the lettering.
    let ry = Math.max(s * .02, Math.min(s * (b.pair ? .055 : .045), rx * .08 + p.volume * s * .003));
    const closed = b.pair ? (b.pair.free === 1 ? b.left : b.right) : null, dammed = closed !== null && Math.abs(closed - (b.pair.free === 1 ? left : right)) < s * .02;
    p.el.setAttribute('cx', cx.toFixed(1)); p.el.setAttribute('rx', half.toFixed(1)); p.el.setAttribute('cy', (b.top - ry * .3).toFixed(1)); p.el.setAttribute('ry', ry.toFixed(2));
    for (const o of p.lobes) {
     let ox = clamp(cx + o.u * half * .6, left + half * o.k * .5, right - half * o.k * .5), oy = ry * o.h;
     if (dammed && Math.abs(ox - closed) < half * .5) oy *= 1.35;
     o.el.setAttribute('cx', ox.toFixed(1)); o.el.setAttribute('cy', (b.top - oy * .15).toFixed(1)); o.el.setAttribute('rx', (half * o.k).toFixed(1)); o.el.setAttribute('ry', oy.toFixed(2));
    }
    for (const f of p.face) {
     f.el.setAttribute('x', (f.x - f.w / 2).toFixed(1)); f.el.setAttribute('width', f.w.toFixed(1)); f.el.setAttribute('y', b.top); f.el.setAttribute('height', f.len.toFixed(1)); f.el.setAttribute('rx', (f.w / 2).toFixed(1));
     f.tip.setAttribute('cx', f.x.toFixed(1)); f.tip.setAttribute('cy', (b.top + f.len).toFixed(1)); f.tip.setAttribute('r', (f.w * .8 * Math.min(1, f.len / (f.w * 2))).toFixed(2));
    }
   }
  });
  for (const r of this.runs) {
   const b = geo.buttons[r.button], w = s * .052;
   r.el.setAttribute('x', (r.x - w / 2).toFixed(1)); r.el.setAttribute('width', w.toFixed(1)); r.el.setAttribute('y', b.top); r.el.setAttribute('height', r.len.toFixed(1)); r.el.setAttribute('rx', (w / 2).toFixed(1));
   r.tip.setAttribute('cx', r.x.toFixed(1)); r.tip.setAttribute('cy', (b.top + r.len).toFixed(1)); r.tip.setAttribute('r', (w * .75).toFixed(2));
  }
  for (const f of this.spray) { f.el.setAttribute('cx', f.x.toFixed(1)); f.el.setAttribute('cy', f.y.toFixed(1)); f.el.setAttribute('r', (f.r * Math.max(0, f.life / .35)).toFixed(2)); }
  this.follow();
 }

 // A button's blood rides with the button: its own lift/press transform
 // (about its centre, as CSS applies it) on the layer holding its pool, runs
 // and stains. Written only when it changes.
 follow() {
  this.geo.buttons.forEach((b, i) => {
   // A group (the keyboard / mobile pair) moves with whichever of its
   // buttons is lifted.
   let css = getComputedStyle(b.el).transform; const layer = this.layers[i];
   if ((!css || css === 'none' || css === 'matrix(1, 0, 0, 1, 0, 0)') && b.el.tagName !== 'BUTTON') for (const child of b.el.querySelectorAll('button')) { const c = getComputedStyle(child).transform; if (c && c !== 'none' && c !== 'matrix(1, 0, 0, 1, 0, 0)') { css = c; break; } }
   let value = '';
   if (css && css !== 'none') { const cx = (b.left + b.right) / 2, cy = (b.top + b.bottom) / 2; value = `translate(${cx} ${cy}) ${css.replace(/,/g, ' ')} translate(${-cx} ${-cy})`; }
   if (value !== layer.matrix) { layer.matrix = value; for (const g of [layer.layer, layer.liquid]) { if (value) g.setAttribute('transform', value); else g.removeAttribute('transform'); } }
  });
 }

 // Skip ahead (after a resize): run the timeline without drawing.
 fastForward(seconds) { for (let t = 0; t < seconds; t += 1 / 30) this.step(1 / 30); this.settled = false; this.render(); }

 dispose() { this.svg.replaceChildren(); }
}
