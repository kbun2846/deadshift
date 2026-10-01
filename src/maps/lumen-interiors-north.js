// Lumen's interiors, the north district (stage 4; design 5 rows 1-9, 5c, 6,
// 18b): the Stacks' main block (the U round the courtyard), Tenement A,
// Tenement B (the dumpling shop and its shrine), the Night Market's hall, the
// stall storage shed, the lock-up, the convenience store, the noodle bar, the
// pawn and repair shop and the arcade. Every piece is data (the format and the
// shared kinds: world/city-interiors.js's header); the rules are checked by
// tests/city-interiors.test.js. Rooms and doors: maps/lumen-buildings-north.js.
// World coordinates: x east, z south.
//
// Each building tells how it was left (design 5): the Stacks' six lives
// stopped mid-evening (a pot still steaming, a TV of static, a shrine's
// candles still lit, a door kicked in) and the mattress dragged into the
// corridor beside its dead; the X-taped door with the sprayed trefoil (5c);
// Tenement A's keys gone from the super's board and the washer left open;
// the dumpling shop's dough still on the board and the shrine's bowl dropped;
// the market's ice melting and its cash box emptied; the lock-up someone
// slept in; the convenience store's basket dropped mid-aisle and its till
// open; the noodle bar's wok on the floor; the pawn shop's safe open and
// empty; the arcade's cabinets still in attract mode to nobody.
//
// Nearly every kind here is this district's own, made from parts (NORTH_KINDS
// below, drawn by render/city-interior-models.js drawParts): only the basic
// fittings (floors, ceiling lights, exit signs, extinguishers, outlets,
// stains, litter) and the dead come from the shared catalogue. The parts are
// written with a small builder (Parts) so a kind reads as a little model:
// sub-assemblies turned and moved, seeded variety (the same on every load).

// Light colours (never a team colour, nor near one: tests/city-interiors.test.js):
// a warm bulb, cold tube white, emergency red, pink, green, lemon (hazard),
// magenta, a deep blue (gas flames, a tank), a screen's static grey.
const WARM = '#ffe0b8', COLD = '#e2f0ff', RED = '#ff3040', PINK = '#ff5a8c', GREEN = '#7aff5a', LEMON = '#fcee0a';
const MAGENTA = '#ff2a7a', BLUE = '#4a64ff', STATIC = '#c8d0d8', FLAME = '#5a78ff', EMBER = '#ff3a2a', CANDLE = '#fff2e6';
// Matter.
const STEEL = '#8a9099', STEEL_D = '#4c525b', DARK = '#23262c', BLACK = '#15171b', WHITE = '#d9dde2', CHROME = '#b6bcc4';
const WOOD = '#6e5642', WOOD_D = '#4a3a2c', WOOD_L = '#8c7258', CARD = '#9a7b58', CARD_D = '#7d6246', GLASS = '#a8bab4', RUBBER = '#1c1d20';
const LACQUER = '#7a2226', GILT = '#a08648', PAPER = '#dcd8cc', CONCRETE = '#8a8a86';
// Everyday cloth: muted (washing, bedding, garments).
const CLOTH = ['#7a8a8a', '#b8a890', '#6a4a4a', '#4a5a4a', '#c8c0b0', '#8a6a8a', '#3a4a6a', '#d0c8b8', '#9a5a4a', '#5a6a7a', '#a89a7a', '#6a7a6a'];
const STOCK = ['#c8574a', '#4f7fb0', '#e8e2d4', '#5a9a6a', '#d8d880', '#8f5a9a', '#e88a4a', '#3f6f8f', '#c84a6a', '#7a9a4a'];
const FY = .036; // flats sit this far above the floor (render/city-interior-models.js INTERIOR_LOOK.floorY)

// This district's data is made on first use, not when the module loads (see
// lumen-interiors-south.js): northDistrict() at the bottom.
const r3 = v => Math.round(v * 1000) / 1000;

function buildKinds() {
  // --- The builder -------------------------------------------------------------
  // A seeded random per kind (its name hashed), so the parts are the same on
  // every load.
  function seeded(text) {
    let s = 2166136261;
    for (let i = 0; i < text.length; i++) s = Math.imul(s ^ text.charCodeAt(i), 16777619);
    return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  // Parts in a kind's frame (origin at its footprint's centre on the floor, +z
  // its front, y up; a part's y is its bottom). `at` nests a sub-assembly moved
  // and turned about y (a turn adds to each part's own ry: three.js's y turn is
  // the outermost, so the two compose exactly).
  class Parts {
    constructor(name) { this.list = []; this.x = 0; this.y = 0; this.z = 0; this.ry = 0; this.r = seeded(name); }
    pos(x, z) { const c = Math.cos(this.ry), s = Math.sin(this.ry); return [r3(this.x + x * c + z * s), r3(this.z - x * s + z * c)]; }
    opt(o) { return this.ry ? { ...o, ry: r3((o?.ry || 0) + this.ry) } : o; }
    box(x, y, z, w, h, d, col, o) { const [X, Z] = this.pos(x, z); this.list.push(['box', X, r3(this.y + y), Z, w, h, d, col, this.opt(o)]); return this; }
    cyl(x, y, z, r, h, col, o) { const [X, Z] = this.pos(x, z); this.list.push(['cyl', X, r3(this.y + y), Z, r, h, col, this.opt(o)]); return this; }
    flat(x, y, z, w, d, col, o) { const [X, Z] = this.pos(x, z); this.list.push(['flat', X, r3(this.y + y), Z, w, d, col, this.opt(o)]); return this; }
    at(x, y, z, ry, fn) {
      const keep = [this.x, this.y, this.z, this.ry], [X, Z] = this.pos(x, z);
      this.x = X; this.y += y; this.z = Z; this.ry += ry; fn(this);
      [this.x, this.y, this.z, this.ry] = keep; return this;
    }
    rand(a = 0, b = 1) { return a + this.r() * (b - a); }
    pick(list) { return list[Math.floor(this.r() * list.length) % list.length]; }
  }

  // Shared bits (drawn into a kind's parts).
  const HALF_PI = Math.PI / 2;
  // Four legs under a top.
  function legs(P, w, d, h, t, col, inset = .04) { for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.box(sx * (w / 2 - inset - t / 2), 0, sz * (d / 2 - inset - t / 2), t, h, t, col); }
  // Steam rising: pale puffs, faintly lit (fine detail).
  function steam(P, x, y, z, n = 5, s = .14) {
    for (let k = 0; k < n; k++) { const q = s * (1 - k * .08); P.box(x + P.rand(-.05, .05) + k * .015, y + k * .13, z + P.rand(-.05, .05), q, q * .8, q, k % 2 ? '#dde2e6' : '#cfd5da', { glow: .25, ry: P.rand(0, 3), rx: P.rand(-.3, .3), fine: true }); }
  }
  // A bowl (optionally with what is left in it) and chopsticks.
  function bowl(P, x, y, z, col = '#e8e4da', left = 'noodles') {
    P.cyl(x, y, z, .075, .055, col, { sides: 8, top: .09 });
    if (left === 'noodles') { P.cyl(x, y + .045, z, .07, .012, '#b8864a', { sides: 8 }); for (let k = 0; k < 3; k++) P.box(x + P.rand(-.03, .03), y + .057, z + P.rand(-.03, .03), .09, .006, .008, '#e8d8a0', { ry: P.rand(0, 3), fine: true }); P.box(x + .02, y + .056, z - .02, .03, .01, .03, '#4a7a3a', { fine: true }); }
    else if (left === 'rice') P.cyl(x, y + .045, z, .068, .014, '#f0ece2', { sides: 8 });
    else if (left === 'dumplings') for (let k = 0; k < 3; k++) P.box(x + P.rand(-.03, .03), y + .045, z + P.rand(-.03, .03), .045, .025, .035, '#ece2c8', { ry: P.rand(0, 3) });
  }
  function chopsticks(P, x, y, z, ry = 0) { P.box(x, y, z, .22, .008, .008, WOOD_L, { ry, fine: true }); P.box(x + .01, y, z + .018, .22, .008, .008, WOOD_L, { ry: ry + .08, fine: true }); }
  // A bottle standing.
  function bottle(P, x, y, z, col, r = .03, h = .2, o = {}) { P.cyl(x, y, z, r, h * .72, col, { sides: 6, ...o }); P.cyl(x, y + h * .72, z, r * .45, h * .28, col, { sides: 5, ...o }); }
  // A garment hung by its top at (x, top, z) facing +z: a shirt, towel, trousers or socks.
  function garment(P, x, top, z, col, type, sway = 0) {
    P.at(x, top, z, 0, () => {
      if (type === 'shirt') { P.box(0, -.52, 0, .36, .5, .02, col, { rx: sway }); P.box(-.25, -.2, 0, .16, .18, .02, col, { rz: .5, rx: sway }); P.box(.25, -.2, 0, .16, .18, .02, col, { rz: -.5, rx: sway }); }
      else if (type === 'towel') P.box(0, -.62, 0, .34, .62, .02, col, { rx: sway });
      else if (type === 'trousers') { P.box(-.08, -.76, 0, .14, .74, .02, col, { rx: sway }); P.box(.08, -.76, 0, .14, .74, .02, col, { rx: sway }); P.box(0, -.12, 0, .32, .12, .02, col, { rx: sway }); }
      else { P.box(-.05, -.22, 0, .07, .22, .02, col); P.box(.06, -.2, 0, .07, .2, .02, col); }
      P.box(-.06, -.02, 0, .02, .05, .03, P.pick(['#e8e4da', '#c84a4a', '#4a7ac8']), { fine: true });
    });
  }
  // The biohazard trefoil sprayed on a vertical face (facing +z), centre (x, y) at depth z.
  function trefoil(P, x, y, z, s, col) {
    for (let k = 0; k < 3; k++) { const a = k * 2.094 + HALF_PI; P.cyl(x + Math.cos(a) * s * .5, y + Math.sin(a) * s * .5 - s * .42, z, s * .42, .006, col, { rx: HALF_PI, sides: 8 }); }
    P.cyl(x, y - s * .18, z + .004, s * .2, .006, '#2a2a2a', { rx: HALF_PI, sides: 8 });
    P.cyl(x, y - s * .12, z + .007, s * .1, .006, col, { rx: HALF_PI, sides: 6 });
    for (let k = 0; k < 3; k++) P.box(x - s * .3 + k * s * .3, y - s * 1.1 - k * .03, z, .012, s * .35 + k * .04, .004, col, { fine: true }); // drips
  }
  // A screen's picture in lit blocks (no lettering): attract-mode colour
  // blocks and a pictogram, static, or a split of camera feeds. On a face
  // facing +z at depth z, centre (x, y).
  function screen(P, x, y, z, w, h, col, mode, glow = 1.6) {
    P.box(x, y - h / 2, z, w, h, .01, mode === 'static' ? '#6a7074' : '#1a1c22', { glow: mode === 'static' ? 1.2 : .6 });
    const f = z + .008;
    if (mode === 'static') for (let k = 0; k < 10; k++) P.box(x + P.rand(-.4, .4) * w, y + P.rand(-.45, .4) * h, f, w * P.rand(.08, .3), h * .05, .004, STATIC, { glow: P.rand(.6, 1.6), fine: true });
    else if (mode === 'feeds') for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) { P.box(x + (i - .5) * w * .5, y + (j - .5) * h * .5 - h * .22, f, w * .46, h * .44, .004, '#56605a', { glow: .9 }); P.box(x + (i - .5) * w * .5 + P.rand(-.1, .1) * w, y + (j - .5) * h * .5 - h * .3, f + .003, w * .12, h * .16, .003, '#9aa49c', { glow: 1, fine: true }); }
    else { // attract mode: a figure-glyph, a block of colour, a bar
      P.box(x - w * .2, y - h * .38, f, w * .36, h * .7, .004, col, { glow });
      P.box(x + w * .22, y - h * .05, f, h * .3, h * .3, .004, '#f2f2f2', { glow });
      P.box(x + w * .22, y - h * .38, f, w * .3, h * .1, .004, col, { glow: glow * .8 });
    }
  }
  // A lit bulb on a short flex.
  function bulb(P, x, y, z, col = WARM, g = 2.6) { P.box(x, y, z, .012, .12, .012, BLACK, { fine: true }); P.cyl(x, y - .08, z, .045, .08, col, { sides: 6, glow: g }); }

  // The kinds. K(name, w, d, h, class, draw) records one: its parts drawn by
  // `draw(P, w, d, h)` in its own frame.
  const NORTH_KINDS = {};
  // Thin things on the floor (cables, tokens, chopsticks, shards, flats) are
  // lifted clear of the room's floor (.024) and the fittings' pools of light
  // that paint it up to .031, or they would vanish under them.
  const FLOOR_TOP = .034;
  function K(name, w, d, h, cls, draw) {
    const P = new Parts(name); draw(P, w, d, h);
    for (const q of P.list) {
      if (q[0] === 'flat') { if (q[2] < FLOOR_TOP) q[2] = FY; }
      else if (q[2] < FLOOR_TOP && q[2] + q[5] < .08) q[2] = r3(q[2] + FLOOR_TOP);
    }
    const lit = P.list.some(p => (p[p.length - 1] || {}).glow);
    NORTH_KINDS[name] = Object.freeze({ w, d, h, cls, parts: Object.freeze(P.list), ...(lit && { lit: true }), district: 'north' });
  }

  // ============================================================ the Stacks
  // The X-taped door at the corridor's end (5c): a flat door, hazard tape in an
  // X, the trefoil sprayed over it, a pictogram sheet taped beside the handle.
  K('stacks-x-door', 1.1, .14, 2.25, 'walkOver', P => {
    const fr = '#4a5054', z = -.07;
    P.box(-.52, 0, z + .05, .06, 2.2, .1, fr).box(.52, 0, z + .05, .06, 2.2, .1, fr).box(0, 2.14, z + .05, 1.1, .08, .1, fr);
    P.box(0, .02, z + .04, .98, 2.1, .05, '#5d6a6e').box(.38, .98, z + .07, .1, .04, .04, CHROME).box(0, .02, z + .065, .96, .22, .01, STEEL_D);
    for (const s of [1, -1]) {
      P.box(0, 1.03, z + .072, 2.25, .09, .008, LEMON, { rz: s * 1.13 });
      for (let k = -3; k <= 3; k++) P.box(k * .14 * Math.cos(1.13) * s, 1.07 + k * .14 * Math.sin(1.13), z + .077, .06, .092, .004, BLACK, { rz: s * 1.13, fine: true });
    }
    trefoil(P, 0, 1.72, z + .068, .2, '#a8242c');
    P.box(-.3, .9, z + .07, .2, .28, .005, '#e8e4da').box(-.3, 1.05, z + .074, .08, .08, .004, '#a8242c').box(-.3, .95, z + .074, .12, .02, .004, BLACK);
    for (let k = 0; k < 4; k++) P.flat(P.rand(-.4, .4), FY + k * .001, P.rand(.1, .5), .12, .04, LEMON, { ry: P.rand(0, 3), fine: true });
  });
  // Washing on a line strung across a corridor (three different lines): up at
  // 2.3 m, the washing's hems above 1.5 m.
  for (const [name, n] of [['stacks-laundry-a', 4], ['stacks-laundry-b', 3], ['stacks-laundry-c', 5]]) K(name, 1.6, .3, 2.5, 'walkOver', (P, w) => {
    P.box(0, 2.3, 0, w, .012, .012, '#c8c4bc').box(-w / 2 + .02, 2.2, -.03, .04, .14, .04, STEEL_D).box(w / 2 - .02, 2.2, -.03, .04, .14, .04, STEEL_D);
    const types = ['shirt', 'towel', 'trousers', 'socks', 'shirt'];
    for (let k = 0; k < n; k++) garment(P, -w / 2 + (k + .5) * w / n + P.rand(-.05, .05), 2.3, 0, P.pick(CLOTH), P.pick(types), P.rand(-.12, .12));
  });
  // The mattress dragged out of unit 4 into the corridor: skewed, its blanket
  // trailing, old dark stains and the scuffs of the drag behind it.
  K('stacks-mattress', .95, 1.95, .2, 'walkOver', P => {
    P.at(0, 0, 0, .06, () => {
      P.box(0, 0, 0, .88, .15, 1.86, '#c4bca8', { top: '#cec6b2' });
      for (let k = 0; k < 5; k++) P.box(0, .15, -.8 + k * .4, .86, .004, .01, '#aca48f', { fine: true });
      P.box(-.1, .15, -.7, .5, .09, .3, '#e2ddd0', { ry: .2 });
      P.box(.1, .15, .3, .8, .05, .9, '#5a6a7a', { ry: -.15 }); P.box(.45, 0, .55, .3, .12, .6, '#5a6a7a', { rz: -.9 });
      P.flat(-.15, .153, -.1, .4, .35, '#5a4636', { ry: .7 }); P.flat(.1, .154, -.35, .2, .18, '#4a3a2e', { ry: .2 });
    });
    for (let k = 0; k < 3; k++) P.flat(-.2 + k * .2, FY, 1.0 + k * .02, .06, .5, '#3a3430', { fine: true });
  });
  // A home shrine on a lacquered cabinet: a seated figure, candles still lit,
  // red lamps, incense burnt low, a plate of fruit.
  K('stacks-shrine', .9, .45, 1.6, 'cover', (P, w, d) => {
    P.box(0, 0, 0, w, .9, d, LACQUER).box(0, .1, d / 2, w - .06, .7, .01, '#5a181c').box(-.06, .42, d / 2 + .005, .02, .1, .02, GILT).box(.06, .42, d / 2 + .005, .02, .1, .02, GILT);
    P.box(0, .9, 0, w + .04, .04, d + .04, GILT).box(0, .94, -d / 2 + .04, w - .1, .62, .04, '#8a2a2c').box(0, 1.56, -d / 2 + .1, w, .06, .2, LACQUER);
    P.box(0, .94, -.08, .22, .14, .16, '#d8ccb0').box(0, 1.08, -.1, .16, .2, .12, '#d8ccb0').box(0, 1.28, -.1, .1, .1, .1, '#d8ccb0'); // the seated figure
    for (const sx of [-1, 1]) { P.cyl(sx * .32, .94, .08, .025, .12, '#e8e0d0', { sides: 6 }); P.cyl(sx * .32, 1.06, .08, .012, .03, CANDLE, { sides: 5, glow: 2 }); P.cyl(sx * .3, 1.36, -.12, .045, .08, RED, { sides: 8, glow: 1.6 }); }
    P.cyl(.18, .94, .1, .06, .07, GILT, { sides: 8 }); for (let k = 0; k < 4; k++) P.box(.16 + k * .015, 1.0, .1, .006, .06, .006, '#6a2a1a', { fine: true });
    P.box(.17, 1.06, .1, .05, .006, .006, EMBER, { glow: 2, fine: true });
    P.cyl(-.15, .94, .1, .1, .02, '#e8e4da', { sides: 8 }); for (let k = 0; k < 4; k++) P.cyl(-.15 + P.rand(-.05, .05), .96, .1 + P.rand(-.05, .05), .035, .05, '#d8682a', { sides: 6 });
  });
  // The couple's bed: a quilt, two pillows, a folded blanket at its foot (head at -z).
  K('stacks-double-bed', 1.4, 2.0, .55, 'low', (P, w, d) => {
    P.box(0, 0, 0, w, .28, d, WOOD).box(0, 0, -d / 2 + .03, w, .8, .06, WOOD_D);
    P.box(0, .28, .02, w - .06, .14, d - .1, '#e2dccf').box(0, .42, .25, w - .02, .06, d * .7, '#8a4a5a');
    for (let k = 0; k < 6; k++) P.box(P.rand(-.5, .5), .48, P.rand(-.2, .8), .12, .005, .12, '#b87a6a', { fine: true });
    for (const sx of [-.33, .33]) P.box(sx, .42, -d / 2 + .3, .55, .1, .3, '#ece8de');
    P.box(0, .48, d / 2 - .22, w - .2, .08, .3, '#6a7a8a');
    P.box(-w / 2 - .01, 0, .4, .02, .25, .8, '#8a4a5a', { fine: true });
  });
  // A low table (tea set, a bowl of seeds) and the flat floor cushions round it.
  K('stacks-low-table', .9, .6, .35, 'low', (P, w, d, h) => {
    P.box(0, h - .04, 0, w, .04, d, WOOD_L); legs(P, w, d, h - .04, .05, WOOD_D);
    P.cyl(-.2, h, -.05, .07, .1, '#e8e2d4', { sides: 8 }); P.box(-.13, h + .05, -.05, .06, .015, .015, '#e8e2d4', { fine: true });
    for (let k = 0; k < 3; k++) P.cyl(.05 + k * .1, h, .12, .03, .045, '#e8e2d4', { sides: 6 });
    P.cyl(.25, h, -.12, .08, .04, '#4a6a8a', { sides: 8 }); P.cyl(.25, h + .03, -.12, .07, .012, '#3a3028', { sides: 8 });
    P.box(-.3, h, .15, .12, .02, .05, BLACK, { fine: true });
  });
  K('stacks-cushions', 1.8, 1.2, .1, 'walkOver', P => {
    for (const [x, z, c] of [[-.66, 0, '#8a4a5a'], [.66, -.05, '#6a7a5a'], [0, .42, '#8a6a4a']]) P.box(x, 0, z, .4, .08, .36, c, { ry: P.rand(-.2, .2), top: c });
  });
  // Unit 3's own bed: a futon on the floor, rumpled, a pillow thrown off.
  K('stacks-futon', 1.0, 2.0, .15, 'walkOver', P => {
    P.box(0, 0, 0, .9, .1, 1.9, '#7a8a8a', { ry: .05 }).box(.05, .1, .3, .85, .05, 1.0, '#3a4a5a', { ry: -.2 }).box(-.45, 0, -.9, .45, .1, .28, '#e2ddd0', { ry: .7 });
  });
  // Three kitchenettes: the couple's (rice cooker, thermos, tidy), the family's
  // (the pot still steaming on a lit ring, a wok, a chopping board), the old
  // man's (one ring, a kettle, dirty bowls, his pill box).
  function kitchenBase(P, w, d, h) {
    P.box(0, 0, 0, w, h - .04, d, '#c8c2b4').box(0, h - .04, 0, w + .02, .04, d + .02, '#8a8a84');
    P.box(-w / 4, .08, d / 2, w / 2 - .04, h - .2, .01, '#b8b2a4').box(w / 4, .08, d / 2, w / 2 - .04, h - .2, .01, '#b8b2a4');
    P.box(-.04, h * .55, d / 2 + .01, .015, .1, .015, CHROME, { fine: true }).box(.04, h * .55, d / 2 + .01, .015, .1, .015, CHROME, { fine: true });
  }
  K('stacks-kitchenette-a', 1.4, .55, .9, 'low', (P, w, d, h) => {
    kitchenBase(P, w, d, h);
    P.cyl(-.45, h, 0, .13, .2, '#eceae4', { sides: 10 }).cyl(-.45, h + .2, 0, .12, .03, '#c8c4bc', { sides: 10 }).box(-.45, h + .08, .12, .05, .03, .02, GREEN, { glow: 1.8, fine: true });
    P.cyl(-.15, h, -.1, .05, .28, '#b8423a', { sides: 8 }).cyl(.1, h, .05, .07, .09, '#e8e2d4', { sides: 8 });
    P.box(.4, h, -.05, .4, .02, .3, '#b8bcc2'); for (let k = 0; k < 3; k++) P.cyl(.3 + k * .1, h + .02, -.05, .06, .05, '#e8e4da', { sides: 8, rx: .3 });
  });
  K('stacks-kitchenette-b', 1.4, .55, .9, 'low', (P, w, d, h) => {
    kitchenBase(P, w, d, h);
    P.box(-.35, h, 0, .36, .05, .32, BLACK).cyl(-.35, h + .05, 0, .11, .006, EMBER, { sides: 8, glow: 1.6 });
    P.cyl(-.35, h + .056, 0, .14, .18, '#9aa2aa', { sides: 10 }).cyl(-.3, h + .24, .02, .13, .015, '#8a9099', { sides: 10, rz: .25 });
    P.box(-.18, h + .16, 0, .08, .02, .02, BLACK); steam(P, -.4, h + .3, .02, 6, .16);
    P.cyl(.15, h, -.05, .16, .06, '#2a2d33', { sides: 10 }).box(.33, h + .03, -.05, .2, .02, .03, WOOD_D);
    P.box(.45, h, .12, .3, .02, .2, WOOD_L); for (let k = 0; k < 5; k++) P.box(.38 + k * .04, h + .02, .12, .03, .02, .03, '#5a9a4a', { fine: true });
    bottle(P, .02, h, -.18, '#5a3020', .03, .22); bottle(P, .08, h, -.2, '#c8b890', .025, .18);
  });
  K('stacks-kitchenette-c', 1.4, .55, .9, 'low', (P, w, d, h) => {
    kitchenBase(P, w, d, h);
    P.box(-.4, h, 0, .3, .05, .3, '#3a3d42').cyl(-.4, h + .05, 0, .09, .16, '#c8ccd2', { sides: 8 }).box(-.3, h + .12, 0, .08, .02, .02, BLACK);
    for (let k = 0; k < 3; k++) P.cyl(.05 + (k % 2) * .03, h + k * .045, 0, .075, .045, '#e8e4da', { sides: 8, top: .085 });
    P.box(.4, h, .05, .22, .03, .09, '#6a9ac8'); for (let k = 0; k < 7; k++) P.box(.31 + k * .03, h + .03, .05, .02, .006, .07, ['#e8e2d4', '#d86a5a', '#e8e2d4'][k % 3], { fine: true });
    bottle(P, .25, h, -.15, '#8a5a3a', .035, .14);
  });
  // Water jugs (the taps are not trusted): two big jugs, one half empty.
  K('stacks-jugs', .7, .35, .5, 'low', (P, w) => {
    for (const [x, full] of [[-.17, 1], [.17, .5]]) { P.cyl(x, 0, 0, .15, .42, '#a4b4b4', { sides: 7 }); P.cyl(x, .005, 0, .145, .38 * full, '#6a90b0', { sides: 7 }); P.cyl(x, .42, 0, .05, .06, '#a4b4b4', { sides: 6 }); P.cyl(x, .47, 0, .052, .03, '#3a6ab0', { sides: 6 }); }
  });
  K('stacks-jugs-b', .7, .35, .5, 'low', P => {
    P.cyl(-.17, 0, 0, .15, .42, '#a4b4b4', { sides: 8 }).cyl(-.17, .42, 0, .05, .06, '#a4b4b4', { sides: 6 }).cyl(-.17, .47, 0, .052, .03, '#3a6ab0', { sides: 6 });
    P.cyl(.18, .15, .02, .15, .42, '#b4c0bc', { sides: 8, rz: HALF_PI, ry: .4 }); // an empty one on its side
    P.box(.1, 0, 0, .2, .12, .2, '#3a6ab0', { ry: .3 });
  });
  // A zip-up fabric wardrobe with a suitcase on top.
  K('stacks-wardrobe', .9, .55, 1.9, 'cover', (P, w, d, h) => {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.box(sx * (w / 2 - .02), 0, sz * (d / 2 - .02), .025, h - .25, .025, STEEL_D);
    P.box(0, .1, 0, w - .02, h - .35, d - .02, '#6a7a8a').box(0, .12, d / 2, .012, h - .4, .006, '#4a5460', { fine: true });
    P.box(0, h - .25, 0, w - .1, .25, d - .1, '#3a3d44').box(0, h, 0, .2, .03, .03, BLACK, { fine: true });
  });
  // The children's bunk (steel, two mattresses, a ladder, a plush on the top).
  K('stacks-bunk', .95, 2.0, 1.75, 'cover', (P, w, d, h) => {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.box(sx * (w / 2 - .025), 0, sz * (d / 2 - .025), .05, h, .05, '#3a5a8a');
    for (const y of [.25, 1.15]) { P.box(0, y, 0, w - .04, .05, d - .04, '#3a5a8a'); P.box(0, y + .05, 0, w - .1, .12, d - .1, '#dcd6c8'); }
    P.box(0, .42, .2, w - .08, .05, d * .6, '#c85a5a').box(0, 1.32, .15, w - .08, .05, d * .6, '#5a7ac8');
    P.box(0, .42, -d / 2 + .25, w * .5, .08, .22, '#ece8de').box(0, 1.32, -d / 2 + .25, w * .5, .08, .22, '#ece8de');
    P.box(0, 1.2, d / 2 - .03, w - .06, .5, .03, '#3a5a8a');
    for (let k = 0; k < 4; k++) P.box(w / 2 - .02, .35 + k * .3, d / 2 - .25, .03, .03, .2, '#3a5a8a');
    P.box(.15, 1.37, .5, .14, .16, .12, '#d8a8b8').box(.15, 1.53, .5, .1, .08, .08, '#d8a8b8');
    P.box(-w / 2 - .01, .3, -.1, .02, .75, 1.2, '#8a9a5a', { fine: true }); // a curtain on the lower bunk
  });
  // The family's table with its plastic stools tucked under it, bowls, a drawing.
  K('stacks-family-table', .9, .9, .72, 'low', (P, w, d, h) => {
    P.box(0, h - .03, 0, w, .03, .6, '#d8d2c4'); legs(P, w, .6, h - .03, .03, STEEL_D);
    for (const [x, z, c] of [[-.25, .32, '#c84a4a'], [.25, .32, '#4a7ac8'], [0, -.32, '#c84a4a']]) { P.box(x, .4, z, .28, .03, .26, c); legs(P, .26, .24, .4, .025, c, .02); }
    bowl(P, -.2, h, -.1, '#e8e4da', 'rice'); bowl(P, .15, h, .05, '#e8e4da', 'noodles'); chopsticks(P, .05, h, .15, .3);
    P.flat(.2, h + .002, -.15, .26, .2, PAPER, { ry: .3 }); for (let k = 0; k < 3; k++) P.flat(.16 + k * .04, h + .004, -.16, .05, .08, P.pick(['#c84a4a', '#4a8a4a', '#e8e05a']), { ry: P.rand(0, 3), fine: true });
  });
  // Children's toys on the floor: blocks, a ball, a toy car, crayons.
  K('stacks-toys', 1.0, .8, .12, 'walkOver', P => {
    for (let k = 0; k < 7; k++) P.box(P.rand(-.4, .4), 0, P.rand(-.3, .3), .07, .07, .07, P.pick(['#c84a4a', '#4a7ac8', '#e8e05a', '#5a9a5a']), { ry: P.rand(0, 3) });
    P.cyl(.3, 0, .2, .09, .16, '#c85a8a', { sides: 8 }); P.box(-.25, 0, .25, .18, .07, .09, '#4a7ac8', { ry: .6 }); P.box(-.25, .07, .25, .09, .04, .07, '#a4b4b4', { ry: .6 });
    for (let k = 0; k < 4; k++) P.box(.05 + k * .03, 0, -.2, .07, .012, .012, P.pick(['#c84a4a', '#4a8a4a', '#e8e05a', '#4a4aa8']), { ry: P.rand(0, 3), fine: true });
  });
  // A folding clothes horse with the children's washing.
  K('stacks-drying-rack', 1.2, .55, 1.1, 'low', (P, w, d, h) => {
    for (const sz of [-1, 1]) { P.box(-w / 2 + .02, 0, sz * .2, .025, h, .025, CHROME, { rx: sz * .2 }); P.box(w / 2 - .02, 0, sz * .2, .025, h, .025, CHROME, { rx: sz * .2 }); }
    for (const y of [.55, .8, 1.05]) P.box(0, y, 0, w, .015, .015, CHROME);
    for (let k = 0; k < 5; k++) { const c = P.pick(CLOTH); P.box(-w / 2 + .15 + k * .22, .62 + (k % 2) * .25, 0, .18, .01, .42, c, { rx: .05 }); }
  });
  // The coder's desk (unit 3): three screens of scrolling glyph bars, a tower with its lights, cans.
  K('stacks-pc-desk', 1.4, .7, .76, 'low', (P, w, d, h) => {
    P.box(0, h - .04, 0, w, .04, d, '#2e3036'); P.box(-w / 2 + .03, 0, 0, .04, h - .04, d, STEEL_D).box(w / 2 - .03, 0, 0, .04, h - .04, d, STEEL_D);
    for (const [x, ry] of [[-.45, .35], [0, 0], [.45, -.35]]) P.at(x, h, -d / 2 + .15, ry, () => {
      P.box(0, 0, 0, .06, .18, .06, BLACK).box(0, .15, 0, .44, .28, .03, BLACK);
      P.box(0, .17, .016, .4, .24, .004, '#12241a', { glow: .5 });
      for (let k = 0; k < 6; k++) P.box(P.rand(-.1, .05), .19 + k * .035, .02, P.rand(.08, .26), .012, .003, k % 3 ? GREEN : '#e8f4ea', { glow: 1.4, fine: true });
    });
    P.box(.52, 0, .05, .2, .45, .45, '#1a1c22').box(.52, .05, .276, .005, .35, .005, MAGENTA, { glow: 2 }).box(.52, .38, .276, .12, .02, .005, GREEN, { glow: 2, fine: true });
    P.box(-.05, h, .12, .45, .02, .15, '#2a2d33').box(.28, h, .15, .06, .02, .1, '#2a2d33');
    for (let k = 0; k < 4; k++) P.cyl(-.55 + k * .07, h, .2 + (k % 2) * .05, .03, .12, P.pick(['#3a8a4a', '#c84a4a', '#e8e2d4', BLACK]), { sides: 6 });
    P.cyl(-.45, h + .03, .05, .07, .03, '#2a2d33', { sides: 8, rz: .2 });
  });
  // A home-built rack of gear, lights blinking, cables spilling out of it.
  K('stacks-server-rack', .6, .6, 1.6, 'cover', (P, w, d, h) => {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.box(sx * (w / 2 - .02), 0, sz * (d / 2 - .02), .035, h, .035, BLACK);
    for (let k = 0; k < 7; k++) {
      const y = .1 + k * .2; P.box(0, y, 0, w - .06, .14, d - .08, k % 2 ? '#2a2d33' : '#3a3d44');
      for (let j = 0; j < 4; j++) P.box(-.2 + j * .05, y + .06, d / 2 - .035, .015, .015, .005, P.pick([GREEN, GREEN, RED, '#e8f4ea']), { glow: 2 });
    }
    for (let k = 0; k < 5; k++) P.box(P.rand(-.2, .2), 0, d / 2 + P.rand(.05, .3), .015, .015, P.rand(.3, .6), P.pick([BLACK, '#3a3d44', '#c84a4a']), { ry: P.rand(-1, 1), fine: true });
  });
  // Cables tangled over the floor: extension leads, a power strip lit, bricks.
  K('stacks-tangle', 1.6, 1.2, .05, 'walkOver', (P, w, d) => {
    for (let c = 0; c < 5; c++) {
      let x = P.rand(-w / 2, w / 2) * .8, z = P.rand(-d / 2, d / 2) * .8, a = P.rand(0, 6.28); const col = P.pick([BLACK, '#2a2d33', '#e8e2d4', '#3a3d44']);
      for (let k = 0; k < 7; k++) { const l = P.rand(.15, .3); a += P.rand(-1.1, 1.1); const nx = Math.max(-w / 2 + .05, Math.min(w / 2 - .05, x + Math.cos(a) * l)), nz = Math.max(-d / 2 + .05, Math.min(d / 2 - .05, z + Math.sin(a) * l)); P.box((x + nx) / 2, 0, (z + nz) / 2, Math.hypot(nx - x, nz - z) + .02, .016, .016, col, { ry: -Math.atan2(nz - z, nx - x) }); x = nx; z = nz; }
    }
    for (const [x, z] of [[-.3, .2], [.35, -.3]]) { P.box(x, 0, z, .3, .04, .07, WHITE, { ry: .4 }); P.box(x + .1, .04, z - .04, .03, .01, .02, RED, { glow: 2, ry: .4 }); }
    P.box(.1, 0, .35, .08, .04, .12, BLACK, { ry: 1.1 });
  });
  // Unit 3, ransacked: drawers pulled and dumped, clothes flung, a box upturned.
  K('stacks-ransacked', 1.6, 1.4, .25, 'walkOver', P => {
    for (let k = 0; k < 3; k++) P.box(P.rand(-.6, .4), 0, P.rand(-.5, .4), .45, .14, .35, WOOD_L, { ry: P.rand(0, 3), rz: k === 1 ? Math.PI : 0 });
    for (let k = 0; k < 7; k++) P.box(P.rand(-.7, .7), 0, P.rand(-.6, .6), P.rand(.2, .4), .04, P.rand(.15, .35), P.pick(CLOTH), { ry: P.rand(0, 3) });
    for (let k = 0; k < 6; k++) P.flat(P.rand(-.7, .7), FY + k * .001, P.rand(-.6, .6), .21, .28, PAPER, { ry: P.rand(0, 3), fine: true });
    P.box(.5, 0, .45, .4, .25, .35, CARD, { rz: Math.PI, ry: .5 });
  });
  // The door of unit 3, kicked off its hinges and lying just inside.
  K('stacks-kicked-door', 1.0, 2.1, .1, 'walkOver', P => {
    P.box(0, 0, 0, .95, .05, 2.02, '#6a5a4a', { rz: .03 }).box(.3, .05, .1, .1, .01, .04, CHROME, { fine: true });
    P.flat(-.1, .052, -.3, .22, .12, '#2a2622', { ry: .4 });
    for (let k = 0; k < 6; k++) P.box(P.rand(-.5, .5), 0, P.rand(-1.1, -.9), P.rand(.08, .3), .03, .03, '#8a7258', { ry: P.rand(0, 3) });
    P.box(-.49, .03, -.6, .04, .02, .1, STEEL_D).box(-.49, .03, .6, .04, .02, .1, STEEL_D);
  });
  // The old man's bed frame: its mattress gone (dragged into the corridor), a
  // blanket left on the bare slats.
  K('stacks-bed-frame', .9, 1.95, .45, 'low', (P, w, d) => {
    P.box(-w / 2 + .03, .15, 0, .05, .1, d, STEEL_D).box(w / 2 - .03, .15, 0, .05, .1, d, STEEL_D);
    for (const sz of [-1, 1]) { P.box(0, .15, sz * (d / 2 - .03), w, .1, .05, STEEL_D); for (const sx of [-1, 1]) P.box(sx * (w / 2 - .03), 0, sz * (d / 2 - .03), .05, .45, .05, STEEL_D); }
    for (let k = 0; k < 9; k++) P.box(0, .22, -d / 2 + .12 + k * .21, w - .1, .02, .08, WOOD_L);
    P.box(.1, .24, .3, .6, .05, .5, '#7a6a5a', { ry: .3 }); P.box(-.2, .24, -.7, .4, .08, .25, '#e2ddd0');
  });
  // His TV on its cabinet, showing static; rabbit ears, a video box.
  K('stacks-tv', .9, .4, 1.0, 'low', (P, w, d) => {
    P.box(0, 0, 0, w, .48, d, WOOD_D).box(0, .06, d / 2, w - .1, .3, .01, '#3a2c20').box(0, .5, 0, .5, .08, .34, '#2a2d33');
    P.box(0, .58, -.02, .64, .44, .38, '#3a3a3e').box(0, .6, .17, .56, .38, .01, BLACK);
    screen(P, -.04, 1.0, .176, .44, .32, STATIC, 'static');
    P.box(.25, .62, .176, .05, .3, .005, '#2a2d33'); P.box(-.1, 1.02, 0, .01, .35, .01, CHROME, { rz: .5 }).box(.1, 1.02, 0, .01, .35, .01, CHROME, { rz: -.5 });
  });
  // His worn armchair, a throw over its back.
  K('stacks-armchair', .8, .8, .9, 'low', (P, w, d, h) => {
    const c = '#6a5a48';
    P.box(0, .05, 0, w, .35, d, c).box(0, .4, .05, w - .24, .1, d - .15, '#7a6a56').box(0, .4, -d / 2 + .1, w, h - .4, .2, c, { rx: -.1 });
    for (const sx of [-1, 1]) P.box(sx * (w / 2 - .1), .4, 0, .2, .2, d - .1, c);
    P.box(0, h - .08, -d / 2 + .15, w - .1, .06, .3, '#b86a4a', { rx: .2 }); P.box(0, .52, .1, .3, .02, .22, '#9a9c9e', { ry: .3, fine: true });
  });
  // The seamstress's table (unit 5): the machine, its lamp lit, cut pieces, spools.
  K('stacks-sewing-table', 1.2, .6, .75, 'low', (P, w, d, h) => {
    P.box(0, h - .04, 0, w, .04, d, WOOD_L); legs(P, w, d, h - .04, .04, STEEL_D);
    P.box(-.1, h, 0, .45, .08, .2, '#e2e0da').box(-.28, h + .08, 0, .1, .22, .16, '#e2e0da').box(-.08, h + .26, 0, .45, .08, .14, '#e2e0da').box(.12, h + .1, 0, .06, .16, .06, '#c8c6c0');
    P.box(.4, h, -.18, .1, .03, .1, BLACK).box(.4, h + .03, -.18, .015, .35, .015, BLACK, { rz: .3 }).cyl(.33, h + .3, -.14, .06, .06, WARM, { sides: 6, glow: 2.2, rx: .6 });
    for (let k = 0; k < 4; k++) P.box(P.rand(-.2, .4), h, P.rand(.05, .22), .25, .01, .18, P.pick(CLOTH), { ry: P.rand(0, 3) });
    for (let k = 0; k < 5; k++) P.cyl(.1 + k * .06, h, -.2, .018, .05, P.pick(['#c84a4a', '#4a7ac8', '#e8e2d4', BLACK, '#5a9a5a']), { sides: 6 });
  });
  // Bundles of cut cloth tied for the piece-work (unit 5).
  K('stacks-bundles', .9, .6, .6, 'low', (P, w, d) => {
    for (let k = 0; k < 5; k++) { const x = -.25 + (k % 2) * .45 + P.rand(-.03, .03), y = Math.floor(k / 2) * .2, c = P.pick(CLOTH); P.box(x, y, 0, .42, .2, .55, c, { ry: P.rand(-.1, .1) }); P.box(x, y, 0, .43, .21, .02, '#e8e2d4', { fine: true }); }
  });
  // A rolling rail of finished garments in plastic (unit 5).
  K('stacks-cloth-rack', 1.2, .5, 1.6, 'cover', (P, w, d, h) => {
    for (const sx of [-1, 1]) { P.box(sx * (w / 2 - .03), 0, 0, .03, h, .03, CHROME); P.box(sx * (w / 2 - .03), 0, 0, .04, .03, d, CHROME); }
    P.box(0, h - .03, 0, w, .025, .025, CHROME);
    for (let k = 0; k < 9; k++) { const x = -w / 2 + .12 + k * .12; P.box(x, h - .95, 0, .04, .9, .42, P.pick(CLOTH), { ry: P.rand(-.1, .1) }); P.box(x, h - .98, 0, .045, .95, .44, '#dfe6ea', { fine: true }); }
  });
  // A foam mattress on pallets (unit 5's bed), a blanket and a pillow.
  K('stacks-pallet-bed', .75, 1.9, .45, 'low', (P, w, d) => {
    for (const sz of [-.48, .48]) { P.box(0, 0, sz, w, .14, .9, WOOD_L); for (let k = 0; k < 5; k++) P.box(0, .14, sz - .36 + k * .18, w, .02, .1, '#9a8264'); }
    P.box(0, .16, 0, w - .05, .12, d - .06, '#9aa8a4').box(0, .28, .25, w - .02, .05, d * .6, '#6a4a5a').box(0, .28, -d / 2 + .25, w * .6, .08, .25, '#e2ddd0');
  });
  // The rider's loft bed (unit 6): a bed up on posts, a desk under it with a laptop lit.
  K('stacks-loft-bed', 1.0, 2.0, 1.8, 'cover', (P, w, d, h) => {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.box(sx * (w / 2 - .03), 0, sz * (d / 2 - .03), .05, h, .05, '#2a2d33');
    P.box(0, 1.35, 0, w, .06, d, '#2a2d33').box(0, 1.41, 0, w - .08, .12, d - .08, '#d8d2c4').box(0, 1.53, .2, w - .06, .06, d * .6, '#3a4a5a').box(0, 1.53, -d / 2 + .25, w * .5, .08, .25, '#e2ddd0');
    P.box(0, 1.41, d / 2 - .03, w, .35, .03, '#2a2d33');
    P.box(0, .72, .2, w - .1, .03, .7, WOOD_L); P.box(0, .75, .15, .32, .015, .22, '#3a3d44').box(0, .76, .04, .32, .2, .015, '#3a3d44', { rx: -.25 }).box(0, .78, .05, .28, .15, .004, '#dde8ff', { glow: 1.5, rx: -.25 });
    P.box(0, .4, .6, .3, .04, .3, '#c84a4a'); legs(P, .3, .3, .4, .025, '#c84a4a', .01);
  });
  // Scooter batteries charging on a shelf, green lamps lit, a strip overloaded.
  K('stacks-battery-shelf', .8, .4, .9, 'low', (P, w, d, h) => {
    for (const sx of [-1, 1]) P.box(sx * (w / 2 - .02), 0, 0, .03, h, d, STEEL_D);
    for (const y of [.02, .45, h - .03]) P.box(0, y, 0, w - .04, .03, d, STEEL);
    for (let k = 0; k < 4; k++) { const x = -.27 + k * .18, y = k < 2 ? .05 : .48; P.box(x, y, 0, .12, .32, .25, '#2a2d33'); P.box(x, y + .25, .126, .04, .02, .005, k === 3 ? RED : GREEN, { glow: 2 }); }
    P.box(0, h, .05, .5, .04, .07, WHITE); for (let k = 0; k < 4; k++) P.box(-.18 + k * .12, h + .04, .05, .03, .01, .02, RED, { glow: 1.8, fine: true });
    for (let k = 0; k < 4; k++) P.box(P.rand(-.3, .3), 0, d / 2 + .1, .015, .015, .3, BLACK, { ry: P.rand(-.8, .8), fine: true });
  });
  // The rider's insulated delivery box, set down by the door.
  K('stacks-delivery-box', .45, .45, .5, 'low', (P, w, d, h) => {
    P.box(0, 0, 0, w, h, d, '#b83a3a').box(0, h, 0, w + .01, .02, d + .01, '#9a2e2e').box(0, h * .45, d / 2, w, .05, .005, '#c8ccd2');
    P.box(-.12, .1, -d / 2 - .02, .04, .35, .03, BLACK).box(.12, .1, -d / 2 - .02, .04, .35, .03, BLACK);
  });
  K('stacks-noodle-cups', .5, .4, .2, 'walkOver', P => {
    for (let k = 0; k < 4; k++) P.cyl(-.12 + (k % 2) * .12, Math.floor(k / 2) * .09, -.05, .045, .09, P.pick(['#e8e2d4', '#c84a4a']), { sides: 6, top: .052 });
    for (let k = 0; k < 3; k++) P.cyl(P.rand(-.2, .2), .045, P.rand(0, .15), .045, .09, '#e8e2d4', { sides: 6, rz: HALF_PI, ry: P.rand(0, 3) });
  });
  // The shared washroom: squat stalls (one door off), a trough of taps, a
  // shower cubicle, a bucket tipped and the mop down.
  function stall(P, w, d, h, doorOff) {
    const c = '#5a6a60';
    P.box(-w / 2 + .02, 0, 0, .04, h, d, c).box(w / 2 - .02, 0, 0, .04, h, d, c).box(0, 0, -d / 2 + .02, w - .08, h, .04, shade(c, .9));
    P.flat(0, FY, -.05, .36, .55, '#e3e5e7').flat(0, FY + .002, -.02, .16, .3, '#b8c0c4');
    P.cyl(.3, 0, -.4, .12, .25, '#4a7ac8', { sides: 8 });
    if (doorOff) P.box(-.1, 0, d / 2 + .15, .85, .04, 1.7, shade(c, 1.1), { ry: .3, rx: 0 });
    else P.at(-w / 2 + .04, 0, d / 2 - .02, .9, () => P.box(w / 2 - .06, .12, 0, w - .12, h - .3, .03, shade(c, 1.1)));
  }
  function shade(hex, f) { const v = parseInt(hex.slice(1), 16), c = [v >> 16 & 255, v >> 8 & 255, v & 255].map(x => Math.max(0, Math.min(255, Math.round(x * f)))); return '#' + c.map(x => x.toString(16).padStart(2, '0')).join(''); }
  K('stacks-stall', 1.0, 1.3, 2.0, 'cover', (P, w, d, h) => stall(P, w, d, h, false));
  K('stacks-stall-b', 1.0, 1.3, 2.0, 'cover', (P, w, d, h) => stall(P, w, d, h, true));
  K('stacks-trough', 1.8, .5, .85, 'low', (P, w, d, h) => {
    P.box(0, 0, 0, w, h - .15, d, CONCRETE).box(0, h - .15, 0, w, .15, d, '#9a9a96').flat(0, h + .002, .03, w - .12, d - .15, '#6a7070');
    for (let k = 0; k < 3; k++) { const x = -w / 3 + k * w / 3; P.box(x, h, -d / 2 + .05, .03, .2, .03, CHROME).box(x, h + .17, -d / 2 + .08, .03, .03, .1, CHROME); P.box(x, 1.2, -d / 2 + .005, .35, .45, .01, '#a9c0cc', { glow: .12 }); P.cyl(x + .12, h, -d / 2 + .08, .025, .09, P.pick(['#c84a4a', '#4a7ac8', '#e8e2d4']), { sides: 6 }); }
    P.box(-w / 3, h + .03, -d / 2 + .12, .01, .12, .01, '#d0ece4', { glow: .6, fine: true });
    P.cyl(.5, 0, .38, .14, .3, '#c84a4a', { sides: 8 });
  });
  K('stacks-shower', .9, .9, 2.0, 'cover', (P, w, d, h) => {
    P.box(-w / 2 + .02, 0, 0, .04, h, d, '#b8c4c4').box(w / 2 - .02, 0, 0, .04, h, d, '#b8c4c4').box(0, 0, -d / 2 + .02, w - .08, h, .04, '#c4cece');
    P.flat(0, FY, 0, w - .1, d - .1, '#9aa6a8').cyl(0, FY, 0, .04, .005, BLACK, { sides: 6 });
    P.box(0, 1.8, -d / 2 + .1, .1, .04, .12, CHROME).box(0, 1.2, -d / 2 + .04, .03, .6, .03, CHROME);
    for (let k = 0; k < 6; k++) P.box(w / 2 - .06 - k * .06, .15, d / 2 - .02, .06, 1.75, .02, k % 2 ? '#8ab0a0' : '#7aa090', { ry: k % 2 ? .3 : -.3 });
    P.box(-.2, 0, 0, .25, .3, .25, '#4a7ac8'); bottle(P, .25, .02, -.3, '#e8e2d4', .03, .18);
  });
  K('stacks-tipped-bucket', .9, .6, .3, 'walkOver', P => {
    P.cyl(-.2, .14, 0, .14, .3, '#4a7ac8', { sides: 8, rz: HALF_PI, ry: .3 });
    P.box(.15, 0, .05, 1.1, .03, .03, WOOD_L, { ry: -.4 }).box(.55, 0, -.1, .2, .06, .15, '#c8c0a8', { ry: -.4 });
    P.flat(.05, FY, 0, .8, .5, '#4a5a64', { ry: .2 }).flat(-.1, FY + .001, .15, .4, .3, '#52626c', { ry: 1 });
  });
  // The mail nook: a bank of battered steel mail lockers (doors bent open,
  // papers sticking out), parcels, a notice board of pictograms, a bike.
  K('stacks-mail-lockers', 2.4, .35, 1.9, 'cover', (P, w, d, h) => {
    P.box(0, 0, 0, w, h, d, '#6a7078');
    const cols = 6, rows = 5, cw = (w - .1) / cols, rh = (h - .3) / rows;
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      const x = -w / 2 + .05 + cw * (i + .5), y = .2 + rh * j, open = P.r() < .22;
      if (open) { P.box(x, y + .02, d / 2 - .01, cw - .04, rh - .04, .01, BLACK); P.at(x - cw / 2 + .02, y + .02, d / 2, P.rand(-1.4, -.6), () => P.box(cw / 2 - .02, 0, .005, cw - .04, rh - .04, .01, '#8a9098')); if (P.r() < .6) P.flat(x, y + .03, d / 2 - .06, cw * .6, .12, PAPER); }
      else { P.box(x, y + .02, d / 2, cw - .04, rh - .04, .008, '#7a8088'); P.box(x + cw * .3, y + rh * .5, d / 2 + .008, .02, .03, .01, CHROME, { fine: true }); if (P.r() < .3) P.box(x, y + rh - .08, d / 2 + .01, cw * .5, .015, .05, PAPER, { fine: true }); }
    }
  });
  K('stacks-parcels', .9, .6, .5, 'low', (P, w, d) => {
    for (const [x, y, z, bw, bh, bd] of [[-.2, 0, 0, .45, .28, .5], [.25, 0, .05, .35, .22, .4], [-.18, .28, 0, .35, .2, .35], [.25, .22, 0, .25, .15, .28]]) { P.box(x, y, z, bw, bh, bd, P.pick([CARD, CARD_D, '#a88a64']), { ry: P.rand(-.15, .15) }); P.box(x, y + bh, z, bw * .9, .005, .05, '#c9b99a', { ry: P.rand(-.15, .15), fine: true }); }
    P.box(.3, 0, .35, .3, .08, .2, '#c8c0b0', { ry: .8 }); // a burst one, its contents
  });
  // A cork board of pictogram notices (a trefoil warning, a crossed-out port,
  // an arrow to the metro), pinned over older ones; one half torn off.
  K('stacks-noticeboard', 1.2, .06, 1.9, 'walkOver', (P, w, d, h) => {
    const z = -d / 2;
    P.box(0, 1.1, z + .015, w, .8, .03, '#a8844e').box(0, 1.08, z + .012, w + .04, .84, .02, WOOD_D);
    const sheet = (x, y, sw, sh, c, fn) => { P.box(x, y - sh / 2, z + .032, sw, sh, .004, c); P.at(x, y, z + .036, 0, fn || (() => {})); };
    sheet(-.35, 1.7, .3, .4, LEMON, () => { trefoil(P, 0, .05, 0, .08, BLACK); });
    sheet(.02, 1.62, .28, .36, '#e8e4da', () => { P.cyl(0, -.02, 0, .08, .004, '#8a9098', { rx: HALF_PI, sides: 8 }); P.box(0, -.02, .004, .22, .025, .003, '#c8262e', { rz: .8 }); });
    sheet(.35, 1.72, .3, .3, '#e8e4da', () => { P.box(-.03, -.04, 0, .16, .04, .003, '#3a8a4a'); P.box(.06, -.06, 0, .06, .08, .003, '#3a8a4a', { rz: .8 }); });
    sheet(-.2, 1.2, .35, .3, '#c8c0a8'); sheet(.25, 1.25, .3, .25, '#b8c8d8'); sheet(-.4, 1.3, .15, .2, '#e8e4da');
    P.box(0, .02, z + .1, .2, .002, .15, '#e8e4da', { rx: -HALF_PI + .1, fine: true });
  });
  // A bicycle leaning against the wall (its length along w).
  function bike(P, x, z, col) {
    P.at(x, 0, z, 0, () => {
      for (const sx of [-.55, .55]) { P.cyl(sx, .33, 0, .33, .03, RUBBER, { rx: HALF_PI, sides: 10 }); P.cyl(sx, .33, .005, .05, .04, CHROME, { rx: HALF_PI, sides: 6 }); }
      P.box(0, .55, 0, .9, .035, .035, col, { rz: .1 }).box(-.2, .3, 0, .6, .03, .03, col, { rz: .75 }).box(.3, .35, 0, .6, .03, .03, col, { rz: -.9 });
      P.box(-.28, .62, 0, .03, .35, .03, col).box(-.28, .95, 0, .18, .04, .1, BLACK).box(.45, .6, 0, .03, .4, .03, col, { rz: -.2 }).box(.5, .98, 0, .05, .03, .45, BLACK);
    });
  }
  K('stacks-bike', 1.7, .5, 1.0, 'low', P => { bike(P, 0, .02, '#3a6a5a'); P.box(0, .05, -.2, .1, .1, .06, BLACK, { fine: true }); });
  // The corridor's electrics: meters, an open junction box with cable
  // spaghetti, a spark or two (lemon, tiny).
  K('stacks-junction', .7, .15, 2.2, 'walkOver', (P, w, d) => {
    const z = -d / 2;
    for (let k = 0; k < 3; k++) { P.box(-.22 + k * .22, 1.5, z + .06, .18, .26, .12, '#c8c4bc'); P.box(-.22 + k * .22, 1.62, z + .122, .1, .04, .004, '#3a4a3a', { glow: .8 }); }
    P.box(0, .9, z + .05, .5, .45, .1, '#6a7078').box(-.15, .92, z + .1, .45, .43, .02, '#7a8088', { ry: -1.1 });
    for (let k = 0; k < 7; k++) P.box(P.rand(-.2, .2), .95 + P.rand(0, .3), z + .08 + P.rand(0, .08), P.rand(.1, .3), .015, .015, P.pick([BLACK, '#c84a4a', '#4a7ac8', '#e8e2d4', '#5a9a5a']), { rz: P.rand(-1, 1), fine: true });
    P.box(.12, 1.05, z + .18, .02, .02, .02, LEMON, { glow: 2.4 }).box(.16, 1.1, z + .2, .015, .015, .015, '#fff8c0', { glow: 2.4, fine: true });
    for (let k = 0; k < 4; k++) P.box(-.3 + k * .05, 1.8, z + .03, .03, .4, .03, BLACK);
  });

  // Wall pictures: image-only posters (a figure, a mountain and sun, colour blocks)
  // and a calendar of dots (no digits).
  K('stacks-poster-a', .6, .03, 1.9, 'walkOver', (P, w, d) => {
    const z = -d / 2 + .01;
    P.box(0, 1.2, z, .5, .7, .006, '#2a3a5a').box(0, 1.25, z + .005, .5, .2, .004, '#c84a3a').box(-.08, 1.5, z + .006, .12, .28, .004, '#e8e2d4').cyl(-.08, 1.78, z + .004, .06, .004, '#e8e2d4', { rx: HALF_PI, sides: 8 });
    P.box(.14, 1.6, z + .006, .14, .14, .004, '#e8d86a');
  });
  K('stacks-poster-b', .6, .03, 1.9, 'walkOver', (P, w, d) => {
    const z = -d / 2 + .01;
    P.box(0, 1.15, z, .55, .75, .006, '#9ab8a8').box(-.1, 1.15, z + .005, .4, .3, .004, '#4a6a4a', { rz: .5 }).box(.12, 1.15, z + .006, .35, .25, .004, '#3a5a3a', { rz: -.6 });
    P.cyl(.15, 1.62, z + .004, .07, .004, '#e8e05a', { rx: HALF_PI, sides: 8 }); P.box(0, 1.14, z + .007, .55, .04, .003, '#e8e4da', { fine: true });
  });
  K('stacks-calendar', .4, .03, 1.9, 'walkOver', (P, w, d) => {
    const z = -d / 2 + .01;
    P.box(0, 1.2, z, .34, .5, .006, '#e8e4da').box(0, 1.52, z + .005, .34, .18, .004, '#c84a4a');
    for (let j = 0; j < 4; j++) P.box(0, 1.26 + j * .06, z + .006, .28, .03, .003, j > 1 ? '#3a3d44' : '#b8b0a0', { fine: true }); // the rows of days (dots, no digits)
    P.box(-.12 + 1 * .06, 1.26 + 2 * .06, z + .008, .05, .05, .002, '#c84a4a', { fine: true });
  });

  // More of each unit's life: rugs, the herb pots, coats on hooks, school bags,
  // crates of parts, bolts of cloth, the rider's e-bike.
  K('stacks-rug-a', 2.2, 1.6, .02, 'walkOver', (P, w, d) => {
    // (Flats sit above the fittings' pools of light, which paint the floor up to .031.)
    P.flat(0, FY, 0, w, d, '#7a3a3a'); P.flat(0, FY + .001, 0, w - .2, d - .2, '#8a4a42'); P.flat(0, FY + .002, 0, w - .6, d - .6, '#6a3434');
    for (let k = 0; k < 4; k++) P.flat(-w / 2 + .35 + k * .5, FY + .003, 0, .12, .12, '#c8a878', { ry: .78, fine: true });
  });
  K('stacks-rug-b', 1.8, 1.4, .02, 'walkOver', (P, w, d) => {
    for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) P.flat(-w / 2 + (i + .5) * w / 4, FY, -d / 2 + (j + .5) * d / 3, w / 4 - .01, d / 3 - .01, ['#4a7ac8', '#e8e05a', '#c84a4a', '#5a9a5a'][(i + j) % 4]);
  });
  K('stacks-herb-pots', .9, .35, .3, 'walkOver', P => { for (let k = 0; k < 4; k++) { const x = -.33 + k * .22; P.cyl(x, 0, 0, .08, .12, '#9a5a3a', { sides: 6, top: .1 }); for (let j = 0; j < 3; j++) P.box(x + P.rand(-.04, .04), .12, P.rand(-.04, .04), .03, P.rand(.08, .16), .03, '#4a8a3a', { rz: P.rand(-.4, .4) }); } });
  K('stacks-coat-hooks', 1.0, .25, 1.9, 'walkOver', (P, w, d) => {
    const z = -d / 2;
    P.box(0, 1.7, z + .015, w, .06, .03, WOOD_D); for (let k = 0; k < 4; k++) { const x = -.36 + k * .24; P.box(x, 1.66, z + .05, .02, .02, .06, CHROME); if (k !== 2) P.box(x, 1.0, z + .1, .3, .66, .08, P.pick(CLOTH), { rx: .05 }); }
    P.box(-.36, .0, z + .15, .3, .06, .12, '#3b3f46');
  });
  K('stacks-school-bags', .9, .6, .3, 'walkOver', P => {
    P.box(-.2, 0, 0, .32, .28, .18, '#c84a4a', { ry: .3, rz: .1 }).box(-.2, .2, .1, .2, .08, .04, '#a83a3a', { ry: .3 });
    P.box(.22, 0, .05, .3, .14, .36, '#4a7ac8', { ry: -.5 }); P.flat(.1, FY, -.2, .21, .28, PAPER, { ry: .4 }); P.box(.3, 0, -.2, .15, .04, .2, '#e8e05a', { ry: .9 });
  });
  K('stacks-parts-crates', 1.2, .5, .6, 'low', (P, w, d) => {
    for (const x of [-.3, .3]) { P.box(x, 0, 0, .58, .3, .48, '#3a3d44'); P.box(x, .3, 0, .56, .28, .46, '#2a2d33', { ry: P.rand(-.05, .05) }); for (let k = 0; k < 4; k++) P.box(x + P.rand(-.2, .2), .58, P.rand(-.15, .15), .12, .03, .08, P.pick(['#2a6a3a', BLACK, '#c8ccd2']), { ry: P.rand(0, 3), fine: true }); }
  });
  K('stacks-cloth-bolts', 1.4, .8, .2, 'walkOver', P => { for (let k = 0; k < 4; k++) P.cyl(P.rand(-.15, .15), .07, -.3 + k * .2, .07, 1.2, P.pick(CLOTH), { rz: HALF_PI, ry: P.rand(-.2, .2), sides: 8 }); });
  K('stacks-ebike', 1.7, .5, 1.0, 'low', P => {
    bike(P, 0, .02, '#2a2d33'); P.box(-.1, .3, .02, .35, .14, .1, BLACK); P.box(-.1, .34, .076, .06, .02, .004, GREEN, { glow: 2 });
    P.box(-.62, .62, .02, .4, .03, .3, STEEL_D).box(-.62, .65, .02, .38, .32, .32, '#b83a3a');
  });

  // ============================================================ Tenement A
  // The lobby's wall of brass mail slots in a wooden frame; letters jammed in some.
  K('tena-mail-slots', 3.0, .3, 1.8, 'cover', (P, w, d, h) => {
    P.box(0, 0, 0, w, h, d, WOOD_D).box(0, .25, d / 2, w - .12, h - .4, .01, '#8a7a50');
    const cols = 10, rows = 6, cw = (w - .16) / cols, rh = (h - .45) / rows;
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      const x = -w / 2 + .08 + cw * (i + .5), y = .28 + rh * j;
      P.box(x, y + rh * .55, d / 2 + .006, cw * .6, .025, .005, BLACK); P.box(x, y + rh * .25, d / 2 + .006, cw * .5, .03, .004, '#c8c0a0', { fine: true });
      if (P.r() < .25) P.box(x, y + rh * .5, d / 2 + .02, cw * .5, .05, .04, PAPER, { rx: -.3 });
    }
    P.box(0, h - .12, d / 2 + .01, w - .12, .08, .02, '#8a7a50');
  });
  K('tena-parcels', 1.0, .5, .45, 'low', P => {
    for (const [x, y, bw, bh, bd] of [[-.28, 0, .4, .3, .45], [.18, 0, .5, .2, .4], [.18, .2, .35, .18, .3], [-.28, .3, .3, .15, .3]]) P.box(x, y, 0, bw, bh, bd, P.pick([CARD, CARD_D, '#a88a64', '#8a8a84']), { ry: P.rand(-.2, .2) });
    P.box(.35, 0, .25, .25, .3, .12, '#e8e2d4', { ry: -.4 }); // a shopping bag
  });
  // The lift: closed steel doors, a pictogram arrow lit above, the call button lit.
  K('tena-lift', 1.5, .15, 2.4, 'walkOver', (P, w, d) => {
    const z = -d / 2;
    P.box(0, 0, z + .06, w, 2.3, .12, '#5a6068').box(-.34, .02, z + .1, .66, 2.08, .04, '#9aa0a8').box(.34, .02, z + .1, .66, 2.08, .04, '#949aa2');
    P.box(0, .02, z + .122, .01, 2.08, .005, BLACK);
    P.box(0, 2.18, z + .13, .3, .1, .01, BLACK).box(-.06, 2.2, z + .137, .06, .06, .004, RED, { glow: 2 }).box(.06, 2.2, z + .137, .03, .06, .004, RED, { glow: 2 });
    P.box(w / 2 + .12, 1.0, z + .03, .1, .22, .02, CHROME).box(w / 2 + .12, 1.1, z + .042, .04, .04, .004, GREEN, { glow: 2 });
  });
  K('tena-bench', 1.6, .45, .48, 'low', (P, w, d, h) => {
    for (let k = 0; k < 4; k++) P.box(0, h - .04, -d / 2 + .06 + k * .11, w, .04, .09, WOOD_L);
    for (const sx of [-1, 1]) { P.box(sx * (w / 2 - .12), 0, 0, .05, h - .04, d - .04, '#2a2d33'); }
    P.box(-.4, h, .05, .35, .02, .25, '#9a9c9e', { ry: .2, fine: true });
  });
  // A pram left in the lobby, its blanket half out.
  K('tena-pram', .6, .9, 1.0, 'low', (P, w, d) => {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.cyl(sx * .25, .1, sz * .32, .1, .03, RUBBER, { rz: HALF_PI, sides: 8 });
    P.box(0, .2, 0, .02, .02, .7, CHROME).box(0, .3, 0, .5, .3, .6, '#3a4a5a').box(0, .6, -.2, .52, .3, .25, '#2e3a48', { rx: -.5 });
    P.box(0, .9, .4, .5, .03, .03, BLACK).box(0, .3, .35, .03, .6, .03, CHROME, { rx: -.35 });
    P.box(.1, .6, .1, .35, .05, .3, '#d8c8b8', { rz: -.3 }); P.box(.35, 0, .2, .2, .03, .25, '#d8c8b8', { ry: .5 });
  });
  // The super's hatch: a ledge under a steel mesh window, a bell.
  K('tena-cage-hatch', 1.4, .3, 2.1, 'walkOver', (P, w, d) => {
    const z = -d / 2;
    P.box(0, .95, z + .15, w, .05, .3, '#5a4a3c').box(0, 1.0, z + .03, w, 1.0, .03, '#2a2d33', { glow: .1 });
    for (let k = 0; k <= 10; k++) P.box(-w / 2 + k * w / 10, 1.0, z + .06, .012, 1.0, .012, STEEL);
    for (let k = 0; k <= 7; k++) P.box(0, 1.0 + k * .14, z + .06, w, .012, .012, STEEL);
    P.box(0, 1.0, z + .05, .3, .06, .04, BLACK).cyl(.45, 1.0, z + .2, .05, .05, CHROME, { sides: 8 });
  });
  K('tena-noticecase', 1.0, .08, 1.9, 'walkOver', (P, w, d) => {
    const z = -d / 2;
    P.box(0, 1.1, z + .03, w, .7, .06, '#3a3d44').box(0, 1.14, z + .061, w - .08, .62, .004, '#e8e4da');
    for (let k = 0; k < 4; k++) P.box(-.3 + (k % 2) * .5, 1.5 - Math.floor(k / 2) * .3, z + .066, .3, .22, .004, P.pick(['#c8d8e8', '#e8d8c8', LEMON, '#d8e8c8']));
    P.box(-.3, 1.28, z + .07, .1, .1, .003, '#3a6a9a'); P.box(.2, 1.3, z + .07, .14, .03, .003, '#c8262e');
    P.box(0, 1.1, z + .07, w, .7, .004, GLASS, { glow: .08 });
  });
  // A drinks machine, lit front of bottle rows, its buttons lit.
  K('tena-vending', .9, .8, 1.85, 'cover', (P, w, d, h) => {
    P.box(0, 0, 0, w, h, d, '#8a2a3a').box(-.1, .45, d / 2, w - .3, h - .65, .02, '#e6eef2', { glow: .8 });
    for (let r = 0; r < 4; r++) for (let k = 0; k < 5; k++) bottle(P, -.35 + k * .12, .52 + r * .27, d / 2 - .06, STOCK[(r * 5 + k) % STOCK.length], .025, .16);
    P.box(w / 2 - .12, .9, d / 2, .14, .5, .02, BLACK); for (let k = 0; k < 5; k++) P.box(w / 2 - .12, .95 + k * .09, d / 2 + .012, .06, .03, .004, k === 2 ? RED : '#e8f4ea', { glow: 1.6 });
    P.box(0, .1, d / 2, w - .2, .18, .02, BLACK);
  });
  K('tena-umbrella', 1.0, .4, .15, 'walkOver', P => {
    P.box(0, .02, 0, .85, .07, .07, '#2a3a5a', { ry: .15, rx: .1 }).box(-.47, .02, -.05, .12, .03, .03, BLACK, { ry: .15 });
    P.flat(.1, FY, .1, .9, .3, '#3a4650', { ry: .1 });
  });
  K('tena-wet-prints', 2.4, .7, .02, 'walkOver', (P, w) => {
    for (let k = 0; k < 8; k++) P.flat(-w / 2 + .15 + k * .3, FY, (k % 2 ? .12 : -.12) + P.rand(-.03, .03), .11, .26, '#4a5058', { ry: HALF_PI + P.rand(-.2, .2) });
  });
  K('tena-shopping-spill', 1.2, .9, .2, 'walkOver', P => {
    P.box(-.3, 0, -.1, .3, .12, .35, '#e8e2d4', { ry: .7, rz: HALF_PI });
    for (let k = 0; k < 6; k++) P.cyl(P.rand(-.1, .5), 0, P.rand(-.3, .35), .045, .08, P.pick(['#c84a3a', '#b8402a', '#8ab04a']), { sides: 6 });
    P.box(.1, 0, .2, .25, .06, .12, '#e8d8a0', { ry: .4 }).cyl(.35, .04, -.25, .04, .2, '#e8e2d4', { rz: HALF_PI, sides: 6 });
  });
  // The super's office: the cage gate left open, the key board with keys
  // missing, his desk with the radio on and the camera feeds, a filing
  // cabinet, his tools.
  K('tena-cage-gate', 1.2, .1, 2.1, 'walkOver', (P, w, d) => {
    const z = -d / 2 + .04;
    P.box(-w / 2 + .02, 0, z, .04, 2.05, .04, STEEL_D).box(w / 2 - .02, 0, z, .04, 2.05, .04, STEEL_D).box(0, 2.0, z, w, .04, .04, STEEL_D).box(0, 0, z, w, .04, .04, STEEL_D);
    for (let k = 1; k < 10; k++) P.box(-w / 2 + k * w / 10, .04, z, .01, 1.96, .01, STEEL);
    for (let k = 1; k < 14; k++) P.box(0, k * .145, z, w, .01, .01, STEEL);
    P.box(w / 2 - .1, .98, z + .04, .06, .08, .03, '#8a7a50').box(w / 2 - .1, .9, z + .05, .02, .06, .02, CHROME);
  });
  K('tena-key-board', .8, .06, 1.9, 'walkOver', (P, w, d) => {
    const z = -d / 2;
    P.box(0, 1.25, z + .015, w, .6, .03, WOOD_L);
    for (let i = 0; i < 6; i++) for (let j = 0; j < 4; j++) {
      const x = -w / 2 + .08 + i * .128, y = 1.75 - j * .14;
      P.box(x, y, z + .04, .012, .012, .03, CHROME, { fine: true });
      if (P.r() < .35) { P.box(x, y - .08, z + .05, .025, .06, .008, P.pick(['#c8b870', CHROME])); P.box(x, y - .1, z + .052, .03, .03, .005, P.pick(['#c84a4a', '#4a7ac8', '#e8e2d4'])); }
      else P.box(x, y - .05, z + .045, .03, .03, .004, '#e8e4da', { fine: true }); // an empty hook's tag
    }
    P.box(-.1, 0, z + .3, .03, .01, .07, '#c8b870', { ry: .6 }).box(.15, 0, z + .4, .03, .01, .07, CHROME, { ry: 2 });
  });
  K('tena-super-desk', 1.4, .7, .76, 'low', (P, w, d, h) => {
    P.box(0, h - .04, 0, w, .04, d, '#5a4a3c').box(-w / 2 + .25, 0, 0, .45, h - .04, d - .04, '#4a3c30').box(w / 2 - .03, 0, 0, .04, h - .04, d, '#4a3c30');
    P.box(-.3, h, -.12, .5, .38, .35, '#3a3a3e'); screen(P, -.3, h + .34, .056, .42, .3, '#56605a', 'feeds');
    P.box(.25, h, -.15, .3, .16, .12, '#2a2d33').box(.33, h + .16, -.18, .01, .35, .01, CHROME, { rz: -.3 }).box(.18, h + .1, -.088, .06, .03, .004, GREEN, { glow: 2 }).cyl(.3, h + .08, -.088, .03, .005, '#6a7078', { rx: HALF_PI, sides: 8 });
    P.flat(.3, h + .002, .12, .3, .22, PAPER, { ry: .2 }); P.cyl(.1, h, .15, .04, .1, '#e8e2d4', { sides: 6 }); P.cyl(-.55, h, .2, .06, .02, '#6a6a6a', { sides: 8 });
  });
  K('tena-filing', .5, .6, 1.35, 'cover', (P, w, d, h) => {
    P.box(0, 0, 0, w, h, d, '#6a7078');
    for (let k = 0; k < 4; k++) { const y = .05 + k * .32; if (k === 2) { P.box(0, y, d / 2 + .2, w - .04, .28, .4, '#7a8088'); for (let j = 0; j < 6; j++) P.box(0, y + .05, d / 2 + .05 + j * .06, w - .1, .25, .01, P.pick(['#c8b890', '#d8c8a0', '#e8e4da'])); } else P.box(0, y, d / 2, w - .04, .28, .01, '#7a8088'); P.box(0, y + .2, d / 2 + .01, .12, .02, .02, CHROME, { fine: true }); }
  });
  K('tena-tool-board', 1.6, .08, 2.0, 'walkOver', (P, w, d) => {
    const z = -d / 2;
    P.box(0, 1.1, z + .01, w, .8, .02, '#a88a64');
    for (let k = 0; k < 8; k++) P.box(-.65 + k * .18, 1.3 + P.rand(0, .3), z + .03, .04, P.rand(.2, .35), .02, P.pick([STEEL, '#c84a4a', BLACK, '#e8e05a', WOOD]), { rz: P.rand(-.2, .2) });
    P.cyl(.5, 1.2, z + .06, .06, .05, '#c84a4a', { rx: HALF_PI, sides: 8 }).box(.5, 1.25, z + .05, .02, .4, .02, WOOD);
  });
  K('tena-workbench', 1.6, .6, .9, 'low', (P, w, d, h) => {
    P.box(0, h - .05, 0, w, .05, d, WOOD); legs(P, w, d, h - .05, .06, WOOD_D); P.box(0, .15, 0, w - .1, .03, d - .1, WOOD_D);
    P.box(-.5, h, 0, .4, .18, .22, '#c84a4a').box(-.5, h + .18, 0, .3, .03, .03, BLACK);
    for (let k = 0; k < 4; k++) P.cyl(.1 + k * .09, h, .1, .03, .09, '#e8e8e0', { sides: 6, glow: .1 });
    P.box(.5, h, -.1, .12, .1, .1, STEEL_D).box(.3, h, .1, .25, .04, .08, CHROME, { ry: .5 });
    for (let k = 0; k < 3; k++) P.cyl(P.rand(-.6, .6), 0, .1, .1, .14, P.pick(['#c8c4bc', '#8a9a96']), { sides: 8 });
  });
  K('tena-ladder', .5, .15, 1.9, 'walkOver', (P, w, d) => {
    P.box(-w / 2 + .03, 0, -d / 2 + .08, .04, 1.85, .04, '#c8ccd2', { rx: -.08 }).box(w / 2 - .03, 0, -d / 2 + .08, .04, 1.85, .04, '#c8ccd2', { rx: -.08 });
    for (let k = 0; k < 5; k++) P.box(0, .3 + k * .33, -d / 2 + .06 + k * .026, w - .06, .03, .08, '#b8bcc2');
  });
  K('tena-paint-tins', .7, .5, .3, 'walkOver', P => {
    for (let k = 0; k < 4; k++) P.cyl(-.22 + k * .15, 0, P.rand(-.1, .1), .08, .18, P.pick(['#c8c4bc', '#8a9a96', '#b8a890']), { sides: 8 });
    P.cyl(.25, .05, .15, .08, .18, '#c8c4bc', { rz: HALF_PI, sides: 8 }); P.flat(.3, FY, .2, .3, .2, '#d8d0c0', { ry: .5 });
  });
  // The laundry: old top-loaders (one left open, the wet washing spilled
  // over its lip and the floor), stacked dryers, a tub, a folding counter.
  function topLoader(P, w, d, h, open) {
    P.box(0, 0, 0, w, h - .05, d, '#d8d4c8').box(0, h - .05, 0, w, .05, d, '#e2ded2').box(0, h - .05, -d / 2 + .06, w, .2, .12, '#c8c4b8');
    P.box(-.15, h + .08, -d / 2 + .125, .12, .05, .005, '#3a3d42').cyl(.18, h + .1, -d / 2 + .125, .025, .01, '#6a7078', { rx: HALF_PI, sides: 6 });
    P.cyl(0, h - .049, .06, .24, .003, '#6a6c70', { sides: 10 });
    if (open) { P.box(0, h + .1, -d / 2 + .15, w - .04, .5, .03, '#dcd8cc', { rx: -.25 }); for (let k = 0; k < 3; k++) P.box(P.rand(-.1, .1), h - .3, d / 2 - .02, .2, .3, .03, P.pick(CLOTH), { rx: .3 }); }
    else P.box(0, h, .06, w - .06, .015, d - .16, '#e2ded2');
  }
  K('tena-washer', .7, .7, .95, 'low', (P, w, d, h) => topLoader(P, w, d, h, false));
  K('tena-washer-open', .7, .7, .95, 'low', (P, w, d, h) => topLoader(P, w, d, h, true));
  K('tena-wet-spill', 1.2, 1.0, .15, 'walkOver', P => {
    P.flat(0, FY, 0, 1.1, .9, '#3e4a52', { ry: .1 }).flat(.2, FY + .001, .1, .6, .5, '#46525a', { ry: .7 });
    for (let k = 0; k < 6; k++) P.box(P.rand(-.4, .4), 0, P.rand(-.35, .35), P.rand(.2, .4), .04, P.rand(.15, .3), P.pick(CLOTH), { ry: P.rand(0, 3) });
    P.box(.35, .1, .25, .5, .2, .35, '#e8e2d4', { rx: HALF_PI - .2, ry: .4 });
  });
  K('tena-dryers', .75, .75, 1.8, 'cover', (P, w, d, h) => {
    P.box(0, 0, 0, w, h, d, '#cfc8b4');
    for (const y of [.42, 1.3]) { P.cyl(0, y, d / 2 - .01, .22, .03, '#8a8474', { rx: HALF_PI, sides: 10 }); P.cyl(0, y, d / 2 + .01, .18, .02, '#3a3630', { rx: HALF_PI, sides: 10 }); P.box(.22, y + .3, d / 2 + .005, .12, .05, .005, '#3a3d42'); }
    P.box(0, .87, d / 2, w - .04, .02, .01, '#9a947e');
  });
  K('tena-tub', .7, .6, .9, 'low', (P, w, d, h) => {
    P.box(0, .1, 0, w, h - .1, d, '#c8ccd0').flat(0, h + .002, .03, w - .1, d - .14, '#8a9096'); legs(P, w, d, .1, .05, STEEL_D, .02);
    P.box(0, h, -d / 2 + .04, .03, .22, .03, CHROME).box(0, h + .19, -d / 2 + .08, .03, .03, .12, CHROME);
    P.box(.1, h - .1, 0, .3, .08, .25, '#6a7fa8', { ry: .3 });
  });
  K('tena-fold-counter', 2.0, .6, .9, 'low', (P, w, d, h) => {
    P.box(0, 0, 0, w, h - .04, d, '#9a9488').box(0, h - .04, 0, w + .02, .04, d + .02, '#c8c4b8');
    for (let k = 0; k < 5; k++) { const c = P.pick(CLOTH); for (let j = 0; j < 3; j++) P.box(-w / 2 + .25 + k * .38, h + j * .045, P.rand(-.05, .05), .3, .04, .28, j === 2 ? shade(c, 1.1) : c); }
    P.box(.8, h, .15, .25, .1, .15, '#c8c4bc', { ry: .3 });
  });
  K('tena-detergent', 1.2, .4, 1.6, 'cover', (P, w, d, h) => {
    for (const sx of [-1, 1]) P.box(sx * (w / 2 - .02), 0, 0, .04, h, d, WOOD_D);
    for (let k = 0; k < 4; k++) { const y = .05 + k * .5; P.box(0, y, 0, w - .04, .03, d, WOOD); if (k < 3) for (let j = 0; j < 6; j++) { const c = P.pick(['#4a7ac8', '#e8e2d4', '#5a9a6a', '#c84a6a', '#e8d86a']); if (j % 2) bottle(P, -w / 2 + .12 + j * .18, y + .03, 0, c, .05, .28); else P.box(-w / 2 + .12 + j * .18, y + .03, 0, .14, .26, .2, c); } }
  });
  K('tena-drying-rack', 1.4, .6, 1.2, 'low', (P, w, d, h) => {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.box(sx * (w / 2 - .02), 0, sz * .22, .025, h, .025, CHROME, { rx: sz * .15 });
    for (let k = 0; k < 4; k++) P.box(0, h - k * .15, 0, w, .015, .015, CHROME);
    for (let k = 0; k < 6; k++) garment(P, -w / 2 + .15 + k * .22, h, 0, P.pick(CLOTH), P.pick(['towel', 'shirt', 'socks']));
  });
  K('tena-line-long', 4.0, .3, 2.5, 'walkOver', (P, w) => {
    P.box(0, 2.35, 0, w, .012, .012, '#c8c4bc');
    for (let k = 0; k < 9; k++) garment(P, -w / 2 + .25 + k * .44, 2.35, 0, P.pick(CLOTH), P.pick(['shirt', 'towel', 'trousers', 'socks', 'towel']), P.rand(-.1, .1));
  });
  // The back corridor: two bikes chained to a rack, bin bags, meters and
  // pipes, a fuse box sparking, someone's moving boxes.
  K('tena-bike-rack', 2.0, .5, 1.0, 'low', P => { P.box(0, 0, -.2, 1.9, .05, .06, STEEL_D); bike(P, -.1, -.05, '#8a3a3a'); bike(P, .1, .12, '#3a4a6a'); P.box(-.5, .3, 0, .02, .02, .25, '#c8c84a', { fine: true }); });
  K('tena-bin-bags', 1.0, .6, .6, 'low', P => {
    for (let k = 0; k < 4; k++) P.cyl(-.3 + k * .2 + P.rand(-.05, .05), 0, P.rand(-.1, .1), .18 + P.rand(0, .06), .42 + P.rand(0, .15), P.pick(['#1e2024', '#2a2d33', '#3a4a3a']), { sides: 7, top: .1 });
    P.box(.3, 0, .15, .2, .08, .12, '#e8e2d4', { ry: .6 });
  });
  K('tena-meters', 1.2, .2, 1.8, 'walkOver', (P, w, d) => {
    const z = -d / 2;
    for (let k = 0; k < 4; k++) { const x = -.45 + k * .3; P.box(x, 1.2, z + .06, .22, .3, .12, '#c8c4bc'); P.box(x, 1.36, z + .122, .12, .05, .004, '#2a3a2a', { glow: .6 }); P.box(x, 0, z + .03, .04, 1.2, .04, '#9a8a3a'); }
    P.box(0, 1.65, z + .04, w, .05, .05, '#9a8a3a');
  });
  K('tena-fuse-spark', .5, .15, 2.0, 'walkOver', (P, w, d) => {
    const z = -d / 2;
    P.box(0, 1.3, z + .05, .4, .5, .1, '#5a6068').box(-.25, 1.32, z + .12, .02, .46, .38, '#6a7078', { ry: -.3 });
    for (let k = 0; k < 6; k++) P.box(P.rand(-.15, .15), 1.35 + k * .07, z + .1, .12, .03, .015, P.pick([BLACK, '#c84a4a', '#e8e2d4']), { fine: true });
    P.box(.05, 1.4, z + .14, .03, .03, .03, LEMON, { glow: 2.6 }).box(.09, 1.36, z + .16, .015, .015, .015, '#fff8c0', { glow: 2.6, fine: true }).box(.03, 1.2, z + .18, .012, .012, .012, LEMON, { glow: 2.4, fine: true });
    P.flat(0, FY, .3, .3, .2, '#2a2622', { ry: .4 });
  });
  K('tena-moving-boxes', 1.0, .8, 1.5, 'cover', (P, w, d, h) => {
    for (let k = 0; k < 3; k++) for (const sx of [-1, 1]) P.box(sx * .24, k * .45, 0, .47, .44, .76, P.pick([CARD, CARD_D, '#a88a64']), { ry: P.rand(-.05, .05) });
    P.cyl(.2, 1.35, 0, .1, .15, '#e8e2d4', { sides: 8, top: .16 }).box(-.2, 1.35, 0, .5, .12, .12, '#8a4a3a', { ry: .3 });
  });

  // ============================================================ Tenement B
  // The dumpling shop: the counter with its lit warm case of steamer baskets,
  // the till open, tables with plates half eaten, a menu board of pictograms.
  function steamerStack(P, x, y, z, n, r = .16) { for (let k = 0; k < n; k++) { P.cyl(x, y + k * .07, z, r, .065, k % 2 ? '#c8a878' : '#b89868', { sides: 10 }); P.cyl(x, y + k * .07 + .06, z, r + .005, .01, '#9a7a50', { sides: 10, fine: true }); } P.cyl(x, y + n * .07, z, r * .96, .04, '#c8a878', { sides: 10, top: r * .5 }); }
  K('tenb-counter', 2.4, .7, 1.05, 'low', (P, w, d, h) => {
    P.box(0, 0, 0, w, h - .05, d, '#b83a36').box(0, h - .05, 0, w + .04, .05, d + .04, '#d8d4cc').box(0, .08, d / 2 + .005, w - .1, .08, .01, '#8a2a28');
    P.box(-.45, h, .05, 1.1, .45, .5, '#ffe8c8', { glow: .9 }); P.box(-.45, h, .05, 1.14, .47, .52, GLASS, { glow: .12 });
    for (let k = 0; k < 3; k++) steamerStack(P, -.85 + k * .4, h + .02, .05, 3, .14);
    P.box(.65, h, -.1, .35, .12, .3, '#2e3138').box(.65, h + .12, -.18, .3, .18, .03, BLACK, { rx: -.3 }).box(.65, h + .14, -.16, .24, .12, .004, '#3a4a3a', { glow: .7, rx: -.3 });
    P.box(.65, h - .2, d / 2 + .1, .3, .08, .25, '#3a3e46'); // the till's drawer out, empty
    P.box(.95, h, .1, .1, .12, .1, '#e8e2d4').box(.95, h + .12, .1, .06, .08, .06, '#e8e2d4').box(.98, h + .17, .1, .02, .06, .02, '#e8e2d4', { rz: -.4 }); // the beckoning cat
  });
  function dumplingTable(P, w, d, h, spilled) {
    P.cyl(0, h - .03, 0, .38, .03, '#d8d2c4', { sides: 10 }).cyl(0, 0, 0, .05, h - .03, STEEL_D, { sides: 6 }).cyl(0, 0, 0, .22, .03, STEEL_D, { sides: 8 });
    const stools = spilled ? [[-.48, 0], [0, -.48], [.48, 0]] : [[-.48, 0], [.48, 0], [0, .48], [0, -.48]];
    for (const [x, z] of stools) { P.cyl(x, .38, z, .15, .05, P.pick(['#c84a4a', '#4a7ac8']), { sides: 8 }); P.cyl(x, 0, z, .12, .38, P.pick(['#b83a3a', '#3a6ab8']), { sides: 6, top: .14 }); }
    bowl(P, -.12, h, -.1, '#e8e4da', 'dumplings'); bowl(P, .15, h, .05, '#e8e4da', 'noodles'); chopsticks(P, .05, h, -.2, .9);
    P.cyl(.2, h, -.2, .04, .07, '#c8a878', { sides: 6 }); bottle(P, -.25, h, .18, '#3a2018', .025, .15); bottle(P, -.18, h, .22, '#b82a1a', .02, .13);
    if (spilled) { P.cyl(.1, h + .02, .2, .035, .06, '#e8e4da', { sides: 6, rz: HALF_PI, ry: .5 }); P.flat(.15, h + .002, .25, .25, .15, '#8a6a3a', { ry: .4 }); P.box(.52, 0, .35, .3, .3, .3, '#c84a4a', { rz: HALF_PI, ry: .3 }); }
  }
  K('tenb-table-a', 1.3, 1.3, .75, 'low', (P, w, d, h) => dumplingTable(P, w, d, h, false));
  K('tenb-table-b', 1.3, 1.3, .75, 'low', (P, w, d, h) => dumplingTable(P, w, d, h, true));
  K('tenb-menu', 1.6, .08, 2.3, 'walkOver', (P, w, d) => {
    const z = -d / 2;
    P.box(0, 1.7, z + .02, w, .5, .04, '#2a1a18');
    for (let k = 0; k < 4; k++) { const x = -w / 2 + .2 + k * .4; P.box(x, 1.74, z + .045, .34, .42, .004, '#fff0d8', { glow: .9 }); P.cyl(x, 1.88, z + .05, .08, .006, '#d8c8b0', { rx: HALF_PI, sides: 8, glow: .6 }); for (let j = 0; j < k % 3 + 1; j++) P.box(x - .1 + j * .08, 1.78, z + .05, .05, .05, .003, '#b83a36', { glow: .6 }); }
  });
  K('tenb-cooler', .6, .6, 1.8, 'cover', (P, w, d, h) => {
    P.box(0, 0, 0, w, h - .1, d, WHITE).cyl(0, h - .1, 0, w / 2, .1, WHITE, { sides: 8 }).box(0, .1, d / 2, w - .08, h - .35, .015, '#e8f4ee', { glow: .8 });
    for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) bottle(P, -.18 + k * .12, .15 + r * .35, d / 2 - .1, STOCK[(r * 4 + k + 3) % STOCK.length], .025, .17);
    P.box(0, h - .3, d / 2 + .01, w - .1, .12, .01, PINK, { glow: 1.6 });
  });
  K('tenb-lanterns', 3.0, .3, 2.7, 'walkOver', (P, w) => {
    P.box(0, 2.62, 0, w, .012, .012, BLACK);
    for (let k = 0; k < 4; k++) { const x = -w / 2 + .4 + k * .73, y = 2.62 - .1 - (k % 2) * .05; P.box(x, y - .08, 0, .01, .08, .01, BLACK); P.cyl(x, y - .42, 0, .15, .34, '#e83a3a', { sides: 8, glow: 1.2 }); P.cyl(x, y - .44, 0, .1, .03, GILT, { sides: 8 }); P.cyl(x, y - .1, 0, .1, .03, GILT, { sides: 8 }); P.box(x, y - .6, 0, .01, .14, .01, '#e8e05a', { fine: true }); }
  });
  // The kitchen: the range with baskets steaming, the floured dough bench,
  // sacks, a steel sink, shelving, the big fridge.
  K('tenb-range', 1.8, .8, .9, 'low', (P, w, d, h) => {
    P.box(0, 0, 0, w, h - .05, d, STEEL).box(0, h - .05, 0, w, .05, d, STEEL_D).box(0, .1, d / 2, w - .1, .3, .01, '#6a7078');
    for (let k = 0; k < 3; k++) { const x = -.6 + k * .6; P.cyl(x, h, 0, .16, .02, BLACK, { sides: 8 }); P.cyl(x, h + .01, 0, .1, .012, FLAME, { sides: 8, glow: 1.8 }); }
    P.cyl(-.6, h + .02, 0, .22, .15, '#9aa2aa', { sides: 10 }); steamerStack(P, -.6, h + .17, 0, 3, .2); steam(P, -.6, h + .45, 0, 6, .18);
    P.cyl(0, h + .02, 0, .22, .15, '#9aa2aa', { sides: 10 }); steamerStack(P, 0, h + .17, 0, 2, .2); steam(P, 0, h + .38, 0, 5, .16);
    P.cyl(.6, h + .02, 0, .2, .3, '#8a9099', { sides: 10 }); P.box(.82, h + .25, 0, .25, .03, .03, STEEL_D);
    for (let k = 0; k < 5; k++) P.box(-.8 + k * .4, .5, d / 2 + .02, .05, .05, .03, BLACK, { fine: true });
  });
  K('tenb-dough-bench', 1.8, .8, .9, 'low', (P, w, d, h) => {
    P.box(0, h - .06, 0, w, .06, d, '#9a8264'); legs(P, w, d, h - .06, .06, '#6a5642'); P.box(0, .15, 0, w - .1, .03, d - .1, '#6a5642');
    P.flat(-.2, h + .002, 0, 1.1, .6, '#e8e4dc', { ry: .05 }); P.cyl(-.45, h, 0, .16, .1, '#ece6d8', { sides: 8, top: .12 });
    P.cyl(0, h + .03, .1, .025, .45, WOOD_L, { rz: HALF_PI, sides: 6 });
    for (let k = 0; k < 8; k++) P.cyl(-.1 + (k % 4) * .1, h + .003, -.2 + Math.floor(k / 4) * .12, .045, .004, '#f0ece2', { sides: 8 });
    P.box(.55, h, 0, .5, .02, .35, CHROME); for (let k = 0; k < 10; k++) P.box(.38 + (k % 5) * .08, h + .02, -.08 + Math.floor(k / 5) * .14, .05, .03, .04, '#ece2c8', { ry: .3 });
    for (let k = 0; k < 3; k++) P.cyl(-.7 + k * .08, .18, 0, .14, .3, '#e8e2d4', { sides: 8 }); // flour tubs under
  });
  K('tenb-sink', 1.2, .6, .9, 'low', (P, w, d, h) => {
    P.box(0, 0, 0, w, h, d, STEEL).flat(-.25, h + .002, .03, .5, .4, '#6a7078').flat(.3, h + .002, .03, .45, .4, '#6a7078');
    P.box(0, h, -d / 2 + .05, .03, .3, .03, CHROME).box(0, h + .27, -d / 2 + .1, .03, .03, .2, CHROME);
    for (let k = 0; k < 4; k++) P.cyl(-.25, h - .15 + k * .045, 0, .09, .045, '#e8e4da', { sides: 8, top: .1 });
    for (let k = 0; k < 3; k++) steamerStack(P, .3, h - .1 + k * .0, 0, 1, .14);
  });
  K('tenb-flour', .9, .6, .5, 'low', P => {
    for (const [x, y, ry] of [[-.2, 0, .1], [.22, 0, -.1], [0, .22, .3]]) { P.box(x, y, 0, .42, .22, .55, '#e8e2d4', { ry }); P.box(x, y + .22, 0, .2, .004, .15, '#b83a36', { ry, fine: true }); }
    P.flat(.35, FY, .35, .3, .2, '#ece8e0', { ry: .4 });
  });
  K('tenb-shelf', 1.2, .45, 1.8, 'cover', (P, w, d, h) => {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.box(sx * (w / 2 - .02), 0, sz * (d / 2 - .02), .035, h, .035, CHROME);
    for (let k = 0; k < 4; k++) { const y = .1 + k * .55; P.box(0, y, 0, w - .02, .025, d - .02, STEEL);
      if (k === 0) { steamerStack(P, -.3, y + .03, 0, 4, .17); steamerStack(P, .15, y + .03, 0, 3, .17); }
      else if (k < 3) for (let j = 0; j < 5; j++) { if (j % 2) P.cyl(-.45 + j * .22, y + .03, 0, .07, .2, P.pick(['#c8a878', '#e8e2d4', '#b83a36', '#3a2018']), { sides: 8 }); else bottle(P, -.45 + j * .22, y + .03, 0, P.pick(['#3a2018', '#b82a1a', '#a89060']), .04, .26); } }
  });
  K('tenb-fridge', .9, .75, 2.0, 'cover', (P, w, d, h) => {
    P.box(0, 0, 0, w, h, d, '#b8bec4');
    for (const sx of [-1, 1]) { P.box(sx * w / 4, .1, d / 2, w / 2 - .02, h - .2, .01, '#c8ced4'); P.box(sx * .05, h * .5, d / 2 + .01, .03, .4, .03, CHROME); }
    P.box(0, h - .15, d / 2 + .012, .12, .06, .005, '#2a3a2a', { glow: .7 }).box(-.03, h - .14, d / 2 + .016, .02, .04, .003, GREEN, { glow: 1.6 });
  });
  // The shrine room (behind the bead curtain): the altar, the incense urn
  // burnt down, offerings, lanterns, photographs, the bowl dropped.
  K('tenb-altar', 1.6, .6, 1.9, 'cover', (P, w, d, h) => {
    P.box(0, 0, 0, w, .85, d, LACQUER).box(0, .85, 0, w + .04, .05, d + .04, GILT);
    for (let k = 0; k < 3; k++) P.box(-w / 3 + k * w / 3, .1, d / 2 + .005, w / 3 - .06, .65, .01, '#5a181c');
    P.box(0, .9, -d / 2 + .06, w - .1, .9, .06, '#8a2a2c').box(0, 1.8, -d / 2 + .15, w + .06, .1, .32, LACQUER).box(0, 1.78, -d / 2 + .3, w, .04, .02, GILT);
    P.box(0, .9, -.1, w - .2, .3, .3, LACQUER).box(0, 1.2, -.1, w - .18, .03, .32, GILT);
    for (const [x, s] of [[0, 1.1], [-.45, .8], [.45, .8]]) { P.box(x, 1.23, -.12, .2 * s, .12 * s, .16 * s, '#d8c8a0'); P.box(x, 1.23 + .12 * s, -.14, .15 * s, .2 * s, .12 * s, '#d8c8a0'); P.box(x, 1.23 + .32 * s, -.14, .09 * s, .09 * s, .09 * s, '#d8c8a0'); }
    for (const sx of [-1, 1]) { P.cyl(sx * .68, .9, .12, .03, .2, '#e8e0d0', { sides: 6 }); P.cyl(sx * .68, 1.1, .12, .014, .035, CANDLE, { sides: 5, glow: 2 }); P.cyl(sx * .6, 1.55, -.18, .06, .12, RED, { sides: 8, glow: 1.6 }); }
    P.cyl(0, .9, .15, .09, .08, GILT, { sides: 8 }); for (let k = 0; k < 5; k++) P.box(-.04 + k * .02, .98, .15 + P.rand(-.02, .02), .006, .03, .006, '#6a2a1a', { fine: true }); // burnt to stubs
    P.flat(0, .982, .15, .14, .14, '#8a8680');
    for (const x of [-.35, .3]) { P.cyl(x, .9, .15, .12, .02, '#e8e4da', { sides: 8 }); for (let k = 0; k < 5; k++) P.cyl(x + P.rand(-.06, .06), .92 + (k > 3 ? .07 : 0), .15 + P.rand(-.06, .06), .04, .07, x < 0 ? '#d8682a' : '#b83a2a', { sides: 6 }); }
  });
  K('tenb-offerings', 1.0, .5, .8, 'low', (P, w, d, h) => {
    P.box(0, h - .04, 0, w, .04, d, LACQUER); legs(P, w, d, h - .04, .05, '#5a181c');
    P.cyl(-.3, h, 0, .14, .02, '#e8e4da', { sides: 8 }); for (let k = 0; k < 6; k++) P.cyl(-.3 + P.rand(-.07, .07), h + .02 + (k > 3 ? .06 : 0), P.rand(-.07, .07), .045, .07, '#d8682a', { sides: 6 });
    P.cyl(.05, h, 0, .1, .1, '#b8d06a', { sides: 8, top: .07 }); P.box(.3, h, -.1, .25, .04, .15, '#a88a58'); P.box(.3, h + .04, -.1, .22, .03, .12, '#b82a2a');
    for (let k = 0; k < 3; k++) P.cyl(.25 + k * .08, h, .15, .03, .04, '#e8e4da', { sides: 6 });
  });
  K('tenb-bead-curtain', 1.6, .1, 2.2, 'walkOver', (P, w) => {
    P.box(0, 2.12, 0, w, .04, .04, WOOD_D);
    for (let k = 0; k < 16; k++) { const x = -w / 2 + .05 + k * .1, swing = k < 5 ? (5 - k) * .03 : 0; for (let j = 0; j < 7; j++) P.box(x + swing * j, 1.95 - j * .27, 0, .025, .22, .025, j % 2 ? '#c83a3a' : GILT, { fine: j % 3 === 2 }); }
  });
  K('tenb-incense-urn', .5, .5, .7, 'low', (P, w, d, h) => {
    P.cyl(0, 0, 0, .18, .1, '#5a4a30', { sides: 8 }).cyl(0, .1, 0, .12, .3, '#6a5a3a', { sides: 8 }).cyl(0, .4, 0, .24, .22, '#7a6a44', { sides: 10, top: .26 });
    P.cyl(0, .62, 0, .22, .01, '#9a968e', { sides: 10 }); for (let k = 0; k < 7; k++) P.box(P.rand(-.12, .12), .62, P.rand(-.12, .12), .008, P.rand(.02, .06), .008, '#7a2a1a', { rx: P.rand(-.3, .3), fine: true });
    P.box(.04, .65, .02, .008, .008, .008, EMBER, { glow: 2 });
  });
  K('tenb-cushions', 1.2, .6, .1, 'walkOver', P => { for (const x of [-.32, .32]) P.box(x, 0, 0, .48, .09, .45, '#b8862a', { ry: P.rand(-.2, .2), top: '#a8762a' }); });
  K('tenb-dropped-bowl', .9, .7, .08, 'walkOver', P => {
    P.cyl(-.15, .02, 0, .08, .05, '#e8e4da', { sides: 8, top: .1, rz: 1.9 });
    for (let k = 0; k < 4; k++) P.box(P.rand(0, .3), 0, P.rand(-.2, .2), .06, .02, .05, '#e8e4da', { ry: P.rand(0, 3) });
    P.flat(.1, FY, .05, .35, .25, '#e8e4d8', { ry: .3 }); for (let k = 0; k < 3; k++) P.cyl(P.rand(-.3, .35), 0, P.rand(-.25, .3), .045, .07, '#d8682a', { sides: 6 });
  });
  K('tenb-photos', 1.2, .05, 1.9, 'walkOver', (P, w, d) => {
    const z = -d / 2;
    for (let k = 0; k < 5; k++) { const x = -.45 + k * .22, y = 1.45 + (k % 2) * .18; P.box(x, y, z + .015, .18, .24, .03, '#2a1a18'); P.box(x, y + .03, z + .031, .13, .18, .004, P.pick(['#8a8478', '#6a6458', '#9a9488'])); P.box(x, y + .1, z + .034, .06, .07, .003, '#4a443c'); }
  });
  // The back hall: gas bottles in their cage, crates of cabbage, a rack of
  // steamer baskets drying, the mop.
  K('tenb-gas-cage', 1.2, .6, 1.2, 'low', (P, w, d, h) => {
    P.box(0, 0, 0, w, .04, d, STEEL_D);
    for (let k = 0; k < 3; k++) { P.cyl(-.35 + k * .35, .04, 0, .15, .8, '#8a8f95', { sides: 8 }); P.cyl(-.35 + k * .35, .84, 0, .1, .1, '#8a8f95', { sides: 8, top: .05 }); P.cyl(-.35 + k * .35, .94, 0, .03, .06, '#a89868', { sides: 6 }); }
    for (let k = 0; k <= 6; k++) P.box(-w / 2 + k * w / 6, 0, d / 2 - .01, .015, h, .015, '#6a7078');
    P.box(0, h - .02, 0, w, .02, d, '#6a7078').box(0, h / 2, d / 2 - .01, w, .02, .015, '#6a7078');
  });
  K('tenb-cabbages', .9, .6, .6, 'low', P => {
    for (const [x, y] of [[-.22, 0], [.22, 0], [0, .3]]) { P.box(x, y, 0, .42, .28, .55, '#3a6a9a'); for (let k = 0; k < 4; k++) P.cyl(x + (k % 2 - .5) * .18, y + .2, (Math.floor(k / 2) - .5) * .24, .1, .12, '#9ac070', { sides: 7, top: .06 }); }
  });
  K('tenb-basket-rack', 1.0, .5, 1.6, 'cover', (P, w, d, h) => {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.box(sx * (w / 2 - .02), 0, sz * (d / 2 - .02), .03, h, .03, CHROME);
    for (let k = 0; k < 4; k++) { const y = .05 + k * .45; P.box(0, y, 0, w, .02, d, '#a9b0b8'); if (k < 3) { steamerStack(P, -.22, y + .02, 0, 3 - k % 2, .19); steamerStack(P, .24, y + .02, 0, 2, .19); } }
  });
  K('tenb-mop', .5, .4, .95, 'low', (P, w, d, h) => {
    P.cyl(0, 0, 0, .18, .32, '#e8d84a', { sides: 8 }).box(0, .32, .1, .2, .1, .12, '#c8b83a');
    P.box(0, 0, -.1, .04, 1.3, .04, WOOD_L, { rx: -.2 }); P.cyl(0, .05, .02, .12, .2, '#d8d0c0', { sides: 6 });
  });

  // ============================================================ the Night Market's hall
  // Stalls: each a trestle with its goods, a scale or a price board of tally
  // marks and pictograms, crates under it, a gas bottle.
  function stallFrame(P, w, d, h, cloth) {
    P.box(0, h - .05, 0, w, .05, d, '#6a5a48'); legs(P, w, d, h - .05, .05, STEEL_D, .06);
    P.box(0, .1, d / 2 - .02, w - .1, h - .2, .01, cloth);
    P.box(0, 0, -d / 2 + .25, w * .4, .3, .4, '#3a6a9a'); P.cyl(w / 2 - .2, 0, -d / 2 + .2, .12, .5, '#5a8a5a', { sides: 8 });
  }
  function priceBoard(P, x, y, z, n) {
    P.box(x, y, z, .3, .22, .02, '#1e2024');
    for (let k = 0; k < n; k++) P.box(x - .1 + k * .035, y + .06, z + .012, .012, .1, .004, '#e8e4da');
    P.box(x - .1 + (n / 2) * .035, y + .1, z + .014, n * .035, .012, .004, '#e8e4da', { rz: -.35 });
    P.cyl(x + .09, y + .11, z + .012, .035, .004, '#c84a4a', { rx: HALF_PI, sides: 6 });
  }
  function scale(P, x, y, z) { P.box(x, y, z, .2, .08, .2, '#c8ccd2').cyl(x, y + .08, z, .1, .02, CHROME, { sides: 8 }).box(x, y + .1, z, .05, .04, .05, '#4a4c50').box(x, y + .06, z + .101, .1, .03, .004, '#2a3a2a', { glow: .5 }); }
  K('market-veg-stall', 2.0, 1.0, .95, 'low', (P, w, d, h) => {
    stallFrame(P, w, d, h, '#3a6a4a');
    const goods = [['#4a8a3a', 'leaf'], ['#c83a2a', 'round'], ['#5a3a6a', 'long'], ['#d8d8c0', 'round'], ['#6a9a3a', 'leaf'], ['#e84a2a', 'long']];
    for (let k = 0; k < 6; k++) { const x = -w / 2 + .2 + (k % 3) * .55, z = k < 3 ? -.2 : .2, y = h + (k < 3 ? .12 : 0), [c, t] = goods[k];
      P.box(x, h, z, .5, k < 3 ? .12 : .02, .36, '#4a7ab0'); for (let j = 0; j < 6; j++) { const gx = x + P.rand(-.18, .18), gz = z + P.rand(-.12, .12); if (t === 'leaf') P.box(gx, y, gz, .12, .08, .08, c, { ry: P.rand(0, 3) }); else if (t === 'long') P.box(gx, y, gz, .16, .05, .05, c, { ry: P.rand(0, 3) }); else P.cyl(gx, y, gz, .045, .07, c, { sides: 6 }); } }
    scale(P, .75, h, .38); priceBoard(P, -.6, h + .02, d / 2 - .06, 4);
  });
  K('market-fruit-stall', 2.0, 1.0, .95, 'low', (P, w, d, h) => {
    stallFrame(P, w, d, h, '#6a3a3a');
    const cols = ['#d8682a', '#c83a2a', '#e8d86a', '#8ab04a', '#b8d06a', '#9a3a5a'];
    for (let k = 0; k < 6; k++) { const x = -w / 2 + .2 + (k % 3) * .55, z = k < 3 ? -.2 : .2, y = h + (k < 3 ? .12 : 0);
      P.box(x, h, z, .5, k < 3 ? .12 : .02, .36, '#8a6a4a'); for (let j = 0; j < 7; j++) P.cyl(x + P.rand(-.18, .18), y + (j > 4 ? .06 : 0), z + P.rand(-.12, .12), k === 2 ? .03 : .055, .08, cols[k], { sides: 6 }); }
    P.box(.7, h + .12, -.25, .3, .03, .12, '#e8d86a', { ry: .3 }); priceBoard(P, .6, h + .02, d / 2 - .06, 3);
    for (let k = 0; k < 3; k++) P.cyl(P.rand(-.8, .8), 0, d / 2 + P.rand(.1, .4), .055, .08, P.pick(cols), { sides: 6 }); // rolled off
  });
  // The fish stall: an ice bed melting (water dripping, puddles), fish on it, a
  // bubbling tank lit deep blue, a board and cleaver.
  K('market-fish-stall', 2.0, 1.0, 1.0, 'low', (P, w, d, h) => {
    stallFrame(P, w, d, h - .05, '#3a4a6a');
    P.box(-.25, h - .05, 0, 1.4, .1, .85, '#c8ccd2'); P.box(-.25, h + .05, 0, 1.3, .06, .75, '#dce8ec', { top: '#e4eef0' });
    for (let k = 0; k < 7; k++) P.at(-.75 + (k % 4) * .33, h + .11, -.2 + Math.floor(k / 4) * .38, P.rand(-.3, .3), () => { P.box(0, 0, 0, .26, .06, .08, P.pick(['#8a9a96', '#a8b0b8', '#c86a5a']), { top: '#6a7a88' }); P.box(.15, 0, 0, .06, .05, .07, '#6a7a88', { ry: .8 }); P.box(-.12, .04, 0, .02, .02, .02, BLACK, { fine: true }); });
    P.box(.75, h - .05, -.05, .45, .45, .45, '#1a2a4a', { glow: .3 }); P.box(.75, h - .05, -.05, .47, .47, .47, GLASS, { glow: .15 });
    for (let k = 0; k < 5; k++) P.cyl(.75 + P.rand(-.12, .12), h + .05 + k * .07, P.rand(-.1, .1), .012, .012, '#d8e4ff', { sides: 5, glow: 1.4, fine: true });
    P.box(.75, h + .02, -.05, .12, .05, .03, '#e87a4a'); P.box(.72, h + .2, .05, .1, .04, .03, '#c8ccd2');
    for (let k = 0; k < 6; k++) P.box(-.9 + k * .3, h - .3, d / 2 + .005, .01, P.rand(.05, .25), .01, '#b8d0ff', { glow: .8, fine: true });
    P.flat(-.2, FY, d / 2 + .3, 1.6, .5, '#3a4a58', { ry: .05 }); P.flat(.3, FY + .001, d / 2 + .5, .6, .35, '#42525e', { ry: .5 });
    P.box(.85, h + .45, .05, .3, .02, .2, WOOD_L).box(.8, h + .47, .02, .18, .01, .07, CHROME);
  });
  // The meat stall: a counter, a rail over it with plastic-wrapped cuts hanging.
  K('market-meat-stall', 2.0, 1.0, 1.0, 'low', (P, w, d, h) => {
    stallFrame(P, w, d, h, '#6a2a2a'); P.box(0, h, 0, w - .1, .08, d - .1, '#e8e2d8');
    for (const sx of [-1, 1]) P.box(sx * (w / 2 - .05), h, -d / 2 + .08, .04, 1.2, .04, CHROME);
    P.box(0, h + 1.15, -d / 2 + .08, w, .04, .04, CHROME);
    for (let k = 0; k < 6; k++) { const x = -.8 + k * .32, l = P.rand(.3, .5); P.box(x, h + 1.05, -d / 2 + .08, .01, .12, .01, CHROME); P.box(x, h + 1.05 - l, -d / 2 + .08, P.rand(.12, .18), l, .1, '#b85a5a', { ry: P.rand(-.3, .3) }); P.box(x, h + 1.02 - l, -d / 2 + .08, .2, l + .05, .12, '#e4e8ea', { glow: .08, fine: true }); }
    P.box(-.4, h + .08, .1, .45, .04, .3, WOOD_L); P.box(-.4, h + .12, .1, .2, .015, .08, CHROME); P.box(.4, h + .08, .1, .3, .05, .25, '#c86a6a');
    scale(P, .75, h + .08, .3);
  });
  K('market-dry-stall', 2.0, 1.0, .9, 'low', (P, w, d, h) => {
    stallFrame(P, w, d, h, '#5a4a3a');
    for (let k = 0; k < 5; k++) { const x = -.8 + k * .4, c = P.pick(['#e8e2d4', '#a88a6a', '#8a3a2a', '#e8d880', '#5a3a2a']); P.box(x, h, -.1, .34, .35, .5, '#c8b890'); P.box(x, h + .35, -.1, .3, .02, .44, c); P.box(x, h + .37, -.1, .12, .03, .1, '#c8ccd2', { fine: true }); }
    for (let k = 0; k < 4; k++) P.box(-.6 + k * .4, h, .32, .25, .12, .18, P.pick(['#c84a3a', '#e8e2d4', '#5a7a3a']));
    priceBoard(P, .6, h + .02, d / 2 - .06, 5);
  });
  K('market-noodle-stall', 2.0, 1.0, .95, 'low', (P, w, d, h) => {
    stallFrame(P, w, d, h, '#6a5a2a');
    for (let k = 0; k < 4; k++) { const x = -.7 + k * .45; P.box(x, h, -.15, .4, .1, .5, '#c8b890'); for (let j = 0; j < 4; j++) P.box(x + P.rand(-.12, .12), h + .1 + j * .03, -.15 + P.rand(-.15, .15), .12, .03, .2, '#e8d8a0', { ry: P.rand(-.4, .4) }); }
    for (let k = 0; k < 6; k++) P.box(-.75 + k * .3, h, .3, .22, .06, .14, P.pick(['#c84a3a', '#e8d880', '#3a6a3a']), { ry: P.rand(-.2, .2) });
    scale(P, .8, h, .1); priceBoard(P, -.6, h + .02, d / 2 - .06, 2);
  });
  K('market-herb-stall', 2.0, 1.0, .95, 'low', (P, w, d, h) => {
    stallFrame(P, w, d, h, '#3a5a3a');
    for (let k = 0; k < 8; k++) { const x = -.75 + (k % 4) * .5, z = k < 4 ? -.2 : .2; P.cyl(x, h, z, .16, .08, '#6a5a48', { sides: 8 }); P.cyl(x, h + .06, z, .14, .04, P.pick(['#4a8a3a', '#8a3a1a', '#9a7a3a', '#6a2a1a', '#3a6a2a', '#d8c890']), { sides: 8, top: .06 }); }
    for (let k = 0; k < 5; k++) P.box(-.8 + k * .4, h + .9, -d / 2 + .1, .1, .3, .06, '#4a7a3a', { rz: .1 }); P.box(0, h + 1.15, -d / 2 + .1, w - .2, .02, .02, WOOD_D);
    priceBoard(P, .6, h + .02, d / 2 - .06, 6);
  });
  K('market-tofu-stall', 2.0, 1.0, .95, 'low', (P, w, d, h) => {
    stallFrame(P, w, d, h, '#5a6a7a');
    for (let k = 0; k < 3; k++) { const x = -.6 + k * .6; P.box(x, h, -.1, .5, .06, .45, '#c8ccd2'); P.box(x, h + .06, -.1, .46, .02, .41, '#b8c8c4', { glow: .05 }); for (let j = 0; j < 6; j++) P.box(x - .15 + (j % 3) * .15, h + .06, -.22 + Math.floor(j / 3) * .22, .12, .06, .12, '#ece8dc'); }
    for (let k = 0; k < 2; k++) { P.box(-.5 + k * 1.0, h, .32, .4, .08, .25, '#c8b890'); for (let j = 0; j < 8; j++) P.cyl(-.65 + k * 1.0 + (j % 4) * .1, h + .08, .26 + Math.floor(j / 4) * .1, .035, .06, j % 3 ? '#e8dcc8' : '#c8a080', { sides: 6 }); }
    scale(P, .8, h, .35);
  });
  K('market-sweets-stall', 2.0, 1.0, .95, 'low', (P, w, d, h) => {
    stallFrame(P, w, d, h, '#7a3a5a');
    for (let k = 0; k < 8; k++) { const x = -.75 + (k % 4) * .5, z = k < 4 ? -.2 : .2; P.box(x, h, z, .4, .12, .32, '#e8e4da'); P.box(x, h + .12, z, .36, .01, .28, GLASS); for (let j = 0; j < 6; j++) P.box(x + P.rand(-.14, .14), h + .02, z + P.rand(-.1, .1), .05, .05, .05, P.pick(['#ff5a8c', '#7aff5a', '#e8e05a', '#4a7ac8', '#e8e4da', '#c84a4a']), { ry: P.rand(0, 3) }); }
    for (let k = 0; k < 5; k++) P.cyl(-.8 + k * .4, h + .9, -d / 2 + .1, .05, .3, P.pick(['#ff5a8c', '#e8e05a', '#c84a4a']), { sides: 6 }); P.box(0, h + 1.2, -d / 2 + .1, w - .2, .02, .02, WOOD_D);
    for (const sx of [-1, 1]) P.box(sx * (w / 2 - .05), h, -d / 2 + .1, .03, 1.25, .03, WOOD_D);
  });
  // The skewer cart: a grill over coals still glowing, skewers left on it.
  K('market-skewer-cart', 1.4, .7, 1.0, 'low', (P, w, d, h) => {
    for (const sx of [-1, 1]) P.cyl(sx * (w / 2 - .15), .15, d / 2 - .1, .15, .06, RUBBER, { rz: HALF_PI, sides: 8 });
    P.box(0, .2, 0, w, h - .3, d, '#b83a3a').box(0, h - .1, 0, w, .1, d, STEEL_D);
    P.box(-.2, h, 0, .8, .06, .5, BLACK); for (let k = 0; k < 8; k++) P.box(-.55 + k * .1, h + .03, P.rand(-.15, .15), .06, .03, .06, EMBER, { glow: 1.6 });
    for (let k = 0; k < 7; k++) { P.box(-.2, h + .08, -.2 + k * .07, .9, .01, .01, WOOD_L, { ry: HALF_PI + .05 }); for (let j = 0; j < 4; j++) P.box(-.35 + j * .1, h + .07, -.2 + k * .07, .05, .04, .04, '#8a3a2a'); }
    P.box(.5, h, 0, .25, .15, .4, '#c8ccd2').box(-w / 2 - .05, .6, 0, .08, .04, d, CHROME);
  });
  K('market-bulbs-8', 8.0, .2, 3.0, 'walkOver', (P, w) => {
    P.box(0, 2.9, 0, w, .01, .01, BLACK);
    for (let k = 0; k < 16; k++) { const x = -w / 2 + .25 + k * .5, sag = Math.sin((k + .5) / 16 * Math.PI) * .25; P.box(x, 2.9 - sag, 0, .5, .01, .01, BLACK, { rz: (k < 8 ? 1 : -1) * .06 }); bulb(P, x, 2.8 - sag, 0, k === 11 ? '#6a6a6a' : WARM, k === 11 ? 0 : 2.6); }
  });
  K('market-bulbs-5', 5.0, .2, 3.0, 'walkOver', (P, w) => {
    for (let k = 0; k < 10; k++) { const x = -w / 2 + .25 + k * .5, sag = Math.sin((k + .5) / 10 * Math.PI) * .2; P.box(x, 2.9 - sag, 0, .5, .01, .01, BLACK); bulb(P, x, 2.8 - sag, 0, WARM, 2.6); }
  });
  K('market-gas-bottles', .8, .4, .6, 'low', P => {
    for (const x of [-.2, .2]) { P.cyl(x, 0, 0, .17, .45, '#3a6a9a', { sides: 8 }); P.cyl(x, .45, 0, .11, .08, '#3a6a9a', { sides: 8, top: .05 }); P.cyl(x, .53, 0, .03, .06, '#a89868', { sides: 6 }); }
    P.box(0, .5, .05, .5, .015, .015, BLACK, { fine: true });
  });
  K('market-crates', .8, .6, 1.0, 'low', P => {
    for (let k = 0; k < 3; k++) { const c = ['#3a6a9a', '#c84a3a', '#4a8a4a'][k]; P.box(P.rand(-.03, .03), k * .32, 0, .75, .3, .55, c, { ry: P.rand(-.06, .06) }); P.box(0, k * .32 + .29, 0, .68, .015, .48, shade(c, .5), { fine: true }); }
    for (let k = 0; k < 5; k++) P.cyl(P.rand(-.25, .25), .96, P.rand(-.15, .15), .05, .06, '#9ac070', { sides: 6 });
  });
  K('market-produce-spill', 1.6, 1.0, .12, 'walkOver', P => {
    P.box(-.4, 0, -.1, .55, .3, .4, '#4a8a4a', { rz: HALF_PI + .1, ry: .5 });
    for (let k = 0; k < 12; k++) P.cyl(P.rand(-.6, .7), 0, P.rand(-.4, .4), .05, .07, P.pick(['#c83a2a', '#d8682a', '#9ac070', '#e8d86a']), { sides: 6 });
    for (let k = 0; k < 3; k++) P.box(P.rand(-.2, .6), 0, P.rand(-.3, .3), .14, .08, .09, '#4a8a3a', { ry: P.rand(0, 3) });
    P.flat(.1, FY, .1, .5, .3, '#3a2a22', { ry: .7 });
  });
  // The cold room's sliding door, run back along its track (the doorway open),
  // and the cold fog spilling out across the hall's floor.
  K('market-cold-slider', 1.8, .2, 2.4, 'walkOver', (P, w, d) => {
    const z = -d / 2;
    P.box(0, 2.25, z + .06, w + .9, .08, .1, STEEL_D).box(0, .05, z + .12, w - .1, 2.1, .1, '#dfe4e8').box(0, .05, z + .175, w - .2, 2.0, .005, '#e8ecef');
    P.box(-w / 2 + .12, .95, z + .19, .06, .4, .06, CHROME).box(0, 1.95, z + .18, .5, .12, .01, '#3a4a5a').box(0, 1.98, z + .186, .2, .06, .004, '#b8d8ff', { glow: 1.2 });
    P.box(0, 0, z + .12, w, .06, .12, BLACK);
  });
  K('market-fog', 2.6, 2.0, .08, 'walkOver', (P, w, d) => {
    // Overlapping soft octagons, palest at the doorway end (+x), fading into the
    // floor: fog pooled low (no see-through layers).
    const cols = ['#646c6a', '#6e7876', '#7a8684', '#86928e', '#929e9a'];
    for (let k = 0; k < 5; k++) { const t = k / 4, r = .95 - t * .45; P.cyl(-w / 2 + r + t * (w - 2 * r), FY - .004 + k * .001, P.rand(-.15, .15), r, .004, cols[k], { sides: 8, glow: .06 + t * .06 }); }
    for (let k = 0; k < 4; k++) P.cyl(P.rand(-.6, 1.0), FY + .002, P.rand(-.7, .7), P.rand(.12, .25), .004, '#8a9692', { sides: 8, glow: .08, fine: true });
  });
  K('market-cold-rack', 1.8, .55, 1.9, 'cover', (P, w, d, h) => {
    for (const sx of [-1, 0, 1]) for (const sz of [-1, 1]) P.box(sx * (w / 2 - .02), 0, sz * (d / 2 - .02), .035, h, .035, CHROME);
    for (let k = 0; k < 4; k++) { const y = .08 + k * .55; P.box(0, y, 0, w, .025, d, '#c8d4d8', { top: '#e2eaee' });
      if (k < 3) for (let j = 0; j < 4; j++) { const x = -w / 2 + .25 + j * .43; P.box(x, y + .025, 0, .38, .22, .42, P.pick(['#e8ecef', '#c8d4dc', '#3a6a9a', '#4a8a4a'])); P.box(x, y + .25, 0, .3, .03, .34, '#eef4f6', { glow: .1, fine: true }); } }
  });
  K('market-carcass-rail', 1.8, .6, 2.0, 'cover', (P, w, d, h) => {
    for (const sx of [-1, 1]) P.box(sx * (w / 2 - .03), 0, 0, .05, h, .05, CHROME);
    P.box(0, h - .08, 0, w, .05, .05, CHROME);
    for (let k = 0; k < 4; k++) { const x = -.6 + k * .4; P.box(x, h - .3, 0, .01, .22, .01, CHROME); P.box(x, .5, 0, .28, 1.1, .22, '#a85050', { top: '#e8d8d0', ry: P.rand(-.3, .3) }); P.box(x, .9, .02, .3, .5, .2, '#e8dcd4', { ry: P.rand(-.3, .3) }); }
    P.flat(0, FY, .1, 1.2, .4, '#4a2a2a', { ry: .05 });
  });
  K('market-ice-bins', .9, .6, .7, 'low', P => {
    for (const x of [-.22, .22]) { P.box(x, 0, 0, .42, .6, .55, '#e8ecef'); P.box(x, .6, 0, .44, .06, .57, '#d0d8dc'); }
    P.box(.22, .66, 0, .38, .08, .5, '#e0eef2', { glow: .12 });
  });
  // The back office: the desk with the cash box open and emptied, cash bags
  // thrown down, ledgers, a wall of camera feeds.
  K('market-desk', 1.3, .65, .76, 'low', (P, w, d, h) => {
    P.box(0, h - .04, 0, w, .04, d, '#4a4e56').box(-w / 2 + .25, 0, 0, .45, h - .04, d - .04, '#3e424a').box(w / 2 - .03, 0, 0, .04, h - .04, d, '#3e424a');
    P.box(.2, h, 0, .38, .1, .28, '#3a5a3a').box(.2, h + .1, -.2, .38, .25, .02, '#3a5a3a', { rx: -.5 }); for (let k = 0; k < 4; k++) P.box(.08 + k * .08, h + .02, 0, .07, .06, .24, '#2a3a2a');
    P.box(-.3, h, .05, .15, .02, .2, '#2a2d33').box(-.3, h + .02, .0, .1, .004, .04, '#b8e8c8', { glow: 1.2 });
    for (let k = 0; k < 5; k++) P.flat(P.rand(-.5, .5), h + .002 + k * .002, P.rand(-.2, .2), .12, .25, PAPER, { ry: P.rand(0, 3), fine: true });
    P.cyl(-.5, h, -.2, .1, .02, '#6a6a6a', { sides: 8 }).cyl(-.5, h + .02, -.2, .012, .25, CHROME, { sides: 5 });
    P.box(.5, h, -.15, .12, .35, .12, '#2a2d33').cyl(.5, h + .33, -.1, .12, .02, '#3a3d44', { rx: HALF_PI, sides: 8 });
  });
  K('market-cash-bags', .8, .6, .1, 'walkOver', P => {
    for (let k = 0; k < 3; k++) P.box(P.rand(-.25, .25), 0, P.rand(-.2, .2), .28, .05, .2, P.pick(['#4a5a7a', '#8a7a5a']), { ry: P.rand(0, 3) });
    for (let k = 0; k < 4; k++) P.box(P.rand(-.3, .3), 0, P.rand(-.25, .25), .05, .01, .02, '#c84a4a', { ry: P.rand(0, 3), fine: true });
    P.flat(.1, FY, .1, .3, .2, PAPER, { ry: .6 });
  });
  K('market-ledgers', 1.0, .4, 1.8, 'cover', (P, w, d, h) => {
    P.box(0, 0, -d / 2 + .02, w, h, .04, WOOD_D); for (const sx of [-1, 1]) P.box(sx * (w / 2 - .02), 0, 0, .04, h, d, WOOD_D);
    for (let k = 0; k < 5; k++) { const y = .05 + k * .42; P.box(0, y, 0, w - .04, .03, d, WOOD); if (k < 4) for (let j = 0; j < 7; j++) P.box(-w / 2 + .1 + j * .12, y + .03, 0, .09, P.rand(.25, .32), .28, P.pick(['#3a4a6a', '#6a2a2a', '#2a4a3a', '#c8b890', '#5a4a3a']), { rz: j === 6 ? .3 : 0 }); }
  });
  K('market-cctv', 1.2, .08, 2.0, 'walkOver', (P, w, d) => {
    const z = -d / 2;
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) { P.box(-.3 + i * .6, 1.3 + j * .38, z + .03, .56, .36, .06, BLACK); screen(P, -.3 + i * .6, 1.3 + j * .38 + .34, z + .062, .5, .3, '#56605a', i + j === 1 ? 'static' : 'feeds'); }
  });

  // ============================================================ the stall storage shed
  K('shed-folded-carts', 1.3, .6, 1.5, 'cover', (P, w, d, h) => {
    for (let k = 0; k < 3; k++) { const z = -.18 + k * .18; P.box(0, .1, z, w - .1, 1.3, .08, P.pick(['#6a7078', '#8a3a3a', '#3a5a7a']), { rx: -.05 }); for (const sx of [-1, 1]) P.cyl(sx * (w / 2 - .15), 0, z, .1, .05, RUBBER, { rz: HALF_PI, sides: 8 }); }
    P.box(0, h - .08, 0, w, .06, d - .1, '#7a8088');
  });
  K('shed-gas-row', 1.0, .4, .7, 'low', P => {
    for (let k = 0; k < 3; k++) { const x = -.32 + k * .32; P.cyl(x, 0, 0, .15, .5, P.pick(['#8a8f95', '#3a6a9a']), { sides: 8 }); P.cyl(x, .5, 0, .1, .1, '#8a8f95', { sides: 8, top: .05 }); P.cyl(x, .6, 0, .03, .06, '#a89868', { sides: 6 }); }
  });
  K('shed-generator', 1.0, .6, .75, 'low', (P, w, d, h) => {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.box(sx * (w / 2 - .03), 0, sz * (d / 2 - .03), .04, h, .04, BLACK);
    P.box(0, h - .04, 0, w, .04, d, BLACK).box(-.15, .1, 0, .55, .45, .45, '#b83a36').box(.3, .1, 0, .3, .35, .4, '#4c525b');
    P.box(.3, .3, d / 2 - .04, .16, .08, .01, '#2a3a2a', { glow: .5 }).box(.25, .31, d / 2 - .03, .03, .03, .004, GREEN, { glow: 2 });
    P.cyl(-.15, .55, 0, .1, .05, '#a89868', { sides: 6 }); P.box(.4, .25, -d / 2 - .02, .05, .05, .2, BLACK);
  });
  K('shed-stool-stack', .45, .45, 1.2, 'low', P => { for (let k = 0; k < 7; k++) { P.cyl(0, k * .15, 0, .17 + k * .003, .05, k % 3 ? '#c84a4a' : '#4a7ac8', { sides: 8 }); P.cyl(0, k * .15 + .05, 0, .14, .1, k % 3 ? '#b83a3a' : '#3a6ab8', { sides: 6, top: .16 }); } });
  K('shed-tarps', 1.0, .8, .25, 'walkOver', P => {
    P.box(0, 0, 0, .9, .12, .6, '#3a6a9a', { ry: .1 }).box(.05, .12, 0, .7, .1, .45, '#8a3a3a', { ry: -.1 });
    for (let k = 0; k < 4; k++) P.box(-.1 + k * .05, .02, .3, 1.4, .03, .03, CHROME, { ry: HALF_PI - .1 + k * .04 });
  });
  K('shed-cot', .8, 1.9, .45, 'low', (P, w, d) => {
    for (const sx of [-1, 1]) P.box(sx * (w / 2 - .03), .32, 0, .03, .03, d, '#4a5a3a');
    for (const sz of [-.42, .42]) for (const sx of [-1, 1]) P.box(sx * (w / 2 - .06), 0, sz * d, .03, .34, .03, '#4a5a3a', { rx: sz > 0 ? .18 : -.18 });
    P.box(0, .32, 0, w - .06, .03, d - .04, '#5a6a4a').box(0, .35, .15, w - .12, .1, d * .7, '#3a5a7a').box(0, .35, -d / 2 + .25, w * .55, .09, .28, '#d8d2c4');
    P.box(.2, 0, .9, .08, .012, .16, BLACK).box(.2, .012, .9, .06, .002, .13, '#b8e8c8', { glow: 1.6 }); // a phone, face up, lit
  });
  K('shed-crate-table', .6, .5, .6, 'low', (P, w, d, h) => {
    P.box(0, 0, 0, w, h - .02, d, '#3a6a9a').box(0, h - .02, 0, w - .06, .02, d - .06, '#2a4a6a');
    P.box(-.12, h, 0, .26, .05, .26, BLACK).cyl(-.12, h + .05, 0, .09, .15, '#c8ccd2', { sides: 8 }).box(.15, h, -.1, .15, .08, .1, '#e8d880');
    P.box(.15, h, .12, .18, .03, .12, '#c84a4a', { ry: .3 });
  });
  K('shed-doorway-curtain', 1.6, .1, 2.2, 'walkOver', (P, w) => {
    P.box(0, 2.1, 0, w + .2, .025, .025, CHROME);
    for (let k = 0; k < 6; k++) P.box(-w / 2 + .05 + k * .06, .3, 0, .08, 1.8, .03, '#6a4a6a', { rz: -.05 * k });
    P.box(-w / 2 + .1, .9, .02, .1, .05, .06, '#4a3a4a');
  });
  K('shed-shelf', 1.2, .4, 1.6, 'cover', (P, w, d, h) => {
    for (const sx of [-1, 1]) P.box(sx * (w / 2 - .02), 0, 0, .04, h, d, WOOD_L);
    for (let k = 0; k < 4; k++) { const y = .05 + k * .5; P.box(0, y, 0, w - .04, .03, d, WOOD_L); }
    for (let k = 0; k < 4; k++) P.box(-.35 + k * .22, .08, 0, .2, .12, .3, P.pick(CLOTH));
    P.box(-.3, .58, 0, .25, .15, .15, '#2a2d33').box(-.24, .66, .076, .06, .03, .004, GREEN, { glow: 2 }); P.cyl(.1, .58, 0, .05, .15, '#e8e2d4', { sides: 6 }); P.box(.35, .58, -.1, .2, .3, .02, '#a9c0cc', { glow: .1 });
    for (let k = 0; k < 5; k++) P.box(-.4 + k * .18, 1.08, 0, .14, .1, .2, P.pick(['#e8d880', '#c84a4a', '#e8e2d4']));
  });
  K('shed-poles', 2.0, .4, .15, 'walkOver', (P, w) => { for (let k = 0; k < 5; k++) P.box(P.rand(-.05, .05), .02 + (k > 2 ? .04 : 0), -.12 + k * .06, w - .1, .04, .04, CHROME, { ry: P.rand(-.05, .05) }); });

  K('shed-price-boards', .7, .15, 1.0, 'walkOver', (P, w, d) => {
    for (let k = 0; k < 3; k++) P.at(-.18 + k * .18, 0, -d / 2 + .06 + k * .02, 0, () => { P.box(0, 0, 0, .36, .5, .02, '#1e2024', { rx: -.2 }); for (let j = 0; j <= k + 1; j++) P.box(-.1 + j * .05, .2, .012, .015, .12, .004, '#e8e4da', { rx: -.2, fine: true }); P.cyl(.1, .36, .012, .04, .004, ['#c84a4a', '#4a8a4a', '#e8e05a'][k], { rx: HALF_PI - .2, sides: 6 }); });
  });
  K('shed-bulb-coil', .6, .5, .15, 'walkOver', P => {
    for (let k = 0; k < 3; k++) P.cyl(0, k * .02, 0, .2 - k * .03, .015, BLACK, { sides: 10 });
    for (let k = 0; k < 7; k++) { const a = k * .9; P.cyl(Math.cos(a) * .2, .02, Math.sin(a) * .2, .035, .06, '#e8e4d8', { sides: 6, rz: HALF_PI, ry: a }); }
  });
  K('shed-cardboard', 1.0, .8, .1, 'walkOver', P => { for (let k = 0; k < 4; k++) P.box(P.rand(-.1, .1), k * .015, P.rand(-.08, .08), .8, .012, .6, k % 2 ? CARD : CARD_D, { ry: P.rand(-.3, .3) }); });
  K('shed-clothes-line', 2.4, .3, 2.3, 'walkOver', (P, w) => {
    P.box(0, 2.1, 0, w, .01, .01, '#c8c4bc'); for (let k = 0; k < 4; k++) garment(P, -w / 2 + .4 + k * .5, 2.1, 0, P.pick(CLOTH), P.pick(['shirt', 'towel', 'socks']), P.rand(-.1, .1));
  });
  K('shed-basin', .6, .5, .2, 'walkOver', P => { P.cyl(0, 0, 0, .22, .12, '#c84a4a', { sides: 10, top: .26 }); P.cyl(0, .02, 0, .2, .08, '#8a9a96', { sides: 10 }); P.box(.2, .1, .1, .25, .02, .35, '#e8e2d4', { rz: -.5 }); });

  // ============================================================ the lock-up
  K('lockup-shutter', 1.8, .3, 2.6, 'walkOver', (P, w, d) => {
    const z = -d / 2;
    P.cyl(0, 2.35, z + .15, .14, w, '#6a7078', { rz: HALF_PI, sides: 8 });
    P.box(0, 1.95, z + .04, w - .1, .4, .03, '#7a8088'); for (let k = 0; k < 5; k++) P.box(0, 1.97 + k * .08, z + .058, w - .1, .012, .006, '#5a6068');
    P.box(0, 1.93, z + .06, .2, .03, .04, STEEL_D);
  });
  K('lockup-scooters', 1.8, .6, 1.1, 'low', P => {
    for (let k = 0; k < 3; k++) P.at(-.55 + k * .55, 0, 0, 0, () => {
      P.box(0, .08, 0, .14, .04, .55, '#2a2d33').cyl(0, .06, -.25, .06, .04, RUBBER, { rx: HALF_PI, sides: 8 }).cyl(0, .06, .25, .06, .04, RUBBER, { rx: HALF_PI, sides: 8 });
      P.box(0, .1, -.26, .03, .95, .03, '#3a3d44', { rx: .1 }).box(0, 1.02, -.3, .4, .03, .03, BLACK).box(.05, .12, 0, .1, .03, .3, ['#c84a4a', WHITE, '#4a8a4a'][k]);
    });
    P.box(0, 0, -.25, 1.7, .06, .06, STEEL_D);
  });
  K('lockup-battery-bench', 1.4, .6, .9, 'low', (P, w, d, h) => {
    P.box(0, h - .04, 0, w, .04, d, WOOD); legs(P, w, d, h - .04, .05, STEEL_D);
    for (let k = 0; k < 4; k++) { P.box(-.5 + k * .25, h, -.1, .16, .1, .35, '#2a2d33'); P.box(-.5 + k * .25, h + .1, .05, .04, .012, .02, k === 1 ? RED : GREEN, { glow: 2 }); }
    P.box(.45, h, .1, .25, .12, .2, '#3a3d44').box(.45, h + .12, .1, .08, .03, .004, '#2a3a2a', { glow: .7 });
    for (let k = 0; k < 4; k++) P.box(P.rand(-.5, .5), h, .2, .3, .012, .012, BLACK, { ry: P.rand(-.5, .5), fine: true });
    P.box(0, .12, 0, w - .1, .03, d - .1, WOOD_D); for (let k = 0; k < 3; k++) P.box(-.4 + k * .4, .15, 0, .3, .15, .3, P.pick([CARD, '#3a6a9a']));
  });
  K('lockup-parts-drawers', .8, .4, 1.5, 'cover', (P, w, d, h) => {
    P.box(0, 0, 0, w, h, d, '#3a5a7a');
    for (let i = 0; i < 4; i++) for (let j = 0; j < 8; j++) { const x = -w / 2 + .1 + i * .2, y = .1 + j * .17; P.box(x, y, d / 2, .17, .14, .01, P.pick(['#c84a4a', '#e8e2d4', '#e8d86a', '#4a7ac8'])); if (P.r() < .15) P.box(x, y, d / 2 + .1, .16, .12, .2, '#c84a4a'); }
  });
  function shoeboxes(P, w, d, h, tilt) {
    const rows = Math.round(h / .13);
    for (let j = 0; j < rows; j++) for (let i = 0; i < 2; i++) { const c = P.pick(['#e8e2d4', '#c84a4a', '#2a2d33', '#e8d880', '#5a8ac8', '#e8e2d4']); P.box(-w / 4 + i * w / 2 + P.rand(-.02, .02), j * .13, P.rand(-.02, .02), w / 2 - .03, .12, d - .05, c, { ry: j === rows - 1 && tilt ? .3 : 0 }); P.box(-w / 4 + i * w / 2, j * .13 + .05, d / 2 - .02, .12, .02, .006, shade(c, .6), { fine: true }); }
  }
  K('lockup-shoeboxes-a', .9, .6, 1.5, 'cover', (P, w, d, h) => shoeboxes(P, w, d, h, false));
  K('lockup-shoeboxes-b', .9, .6, 1.4, 'cover', (P, w, d, h) => shoeboxes(P, w, d, h, true));
  K('lockup-sneakers', 1.0, .8, .15, 'walkOver', P => {
    for (let k = 0; k < 5; k++) { const c = P.pick(['#e8e2d4', '#c84a4a', '#2a2d33', '#5a8ac8']); P.box(P.rand(-.4, .4), 0, P.rand(-.3, .3), .1, .08, .26, c, { ry: P.rand(0, 3), top: '#e8e2d4' }); }
    P.box(.2, 0, .1, .3, .12, .2, '#e8e2d4', { rz: 1.2, ry: .5 }); P.flat(-.2, FY, .2, .3, .2, PAPER, { ry: .3 });
  });
  K('lockup-sleeping-bag', 1.0, 2.0, .15, 'walkOver', P => {
    P.flat(0, FY, 0, .95, 1.95, CARD, { ry: .02 }); P.flat(.1, FY + .002, .2, .5, .7, CARD_D, { ry: .3 });
    P.box(0, .01, .1, .75, .12, 1.6, '#3a5a4a', { ry: -.05 }).box(0, .01, -.75, .5, .1, .3, '#5a4a6a');
    P.box(.25, .01, .6, .4, .08, .5, '#4a6a5a', { ry: .4 });
  });
  K('lockup-lantern', .2, .2, .3, 'walkOver', P => { P.cyl(0, 0, 0, .07, .03, BLACK, { sides: 6 }).cyl(0, .03, 0, .06, .16, WARM, { sides: 6, glow: 2.2 }).cyl(0, .19, 0, .07, .03, BLACK, { sides: 6 }).box(0, .22, 0, .1, .04, .01, BLACK); });
  K('lockup-tins', .7, .5, .15, 'walkOver', P => {
    for (let k = 0; k < 5; k++) P.cyl(P.rand(-.25, .25), 0, P.rand(-.2, .2), .04, .1, P.pick(['#c84a4a', '#c8ccd2', '#4a8a4a']), { sides: 6 });
    P.cyl(.2, .04, .1, .04, .1, '#c8ccd2', { sides: 6, rz: HALF_PI }); P.cyl(-.2, 0, .15, .1, .32, '#a4b4b4', { sides: 8 });
    P.box(0, 0, -.15, .12, .02, .05, BLACK, { ry: .5 });
  });
  K('lockup-cut-locks', .6, .4, .06, 'walkOver', P => {
    for (let k = 0; k < 3; k++) { const x = P.rand(-.2, .2), z = P.rand(-.15, .15); P.box(x, 0, z, .07, .03, .09, '#8a8478', { ry: P.rand(0, 3) }); P.box(x + .04, 0, z, .012, .02, .08, CHROME, { ry: P.rand(0, 3) }); }
    P.box(.15, 0, .1, .45, .03, .03, '#c84a4a', { ry: .4 }).box(.35, 0, .05, .12, .04, .04, STEEL_D, { ry: .4 });
  });
  K('lockup-hand-truck', .6, 1.3, .2, 'walkOver', (P, w, d) => {
    for (const sx of [-1, 1]) P.box(sx * .2, .04, 0, .035, .035, d - .1, '#c84a4a');
    for (let k = 0; k < 3; k++) P.box(0, .04, -.4 + k * .35, .4, .03, .03, '#c84a4a');
    P.box(0, .01, d / 2 - .05, .45, .02, .2, STEEL_D); for (const sx of [-1, 1]) P.cyl(sx * .25, .1, .4, .1, .06, RUBBER, { rz: HALF_PI, sides: 8 });
  });

  // Spray tags on the corridor wall: pictogram shapes and colour (a crown, an
  // arrow, an eye, drips), no letters.
  K('lockup-tags', 1.0, .05, 2.2, 'walkOver', (P, w, d) => {
    const z = -d / 2 + .01;
    P.box(-.25, 1.1, z, .45, .3, .004, '#c84a6a').box(-.25, 1.16, z + .004, .3, .18, .003, BLACK); for (let k = 0; k < 3; k++) P.box(-.4 + k * .15, 1.4, z + .004, .06, .12, .003, '#c84a6a', { rz: .3 - k * .3 });
    P.box(.2, 1.5, z, .4, .06, .004, '#4a8a5a', { rz: .3 }).box(.36, 1.55, z + .002, .14, .06, .004, '#4a8a5a', { rz: -.6 });
    P.cyl(.25, 1.0, z + .004, .12, .004, '#e8e2d4', { rx: HALF_PI, sides: 10 }).cyl(.25, 1.0, z + .008, .05, .004, BLACK, { rx: HALF_PI, sides: 8 });
    for (let k = 0; k < 4; k++) P.box(-.35 + k * .1, .85 - k * .03, z + .002, .012, .2, .003, '#c84a6a', { fine: true });
  });

  // ============================================================ the convenience store
  // Aisles of stock, glowing fridges (one open), the till open, a basket dropped mid-aisle.
  function shelfStock(P, w, d, y, fill = .9) {
    let x = -w / 2 + .03;
    while (x < w / 2 - .08) { const bw = P.rand(.08, .18), bh = P.rand(.1, .25); if (P.r() < fill && x + bw < w / 2 - .02) { if (P.r() < .3) bottle(P, x + bw / 2, y, 0, P.pick(STOCK), bw * .35, bh * 1.2); else P.box(x + bw / 2, y, P.rand(-.02, .02), bw, bh, d * P.rand(.6, .85), P.pick(STOCK)); } x += bw + .015; }
  }
  K('conv-gondola', 1.2, .8, 1.5, 'cover', (P, w, d, h) => {
    P.box(0, 0, 0, w, .12, d, '#e8e6e2').box(0, .12, 0, w - .04, h - .12, .06, '#dcdad6').box(0, h - .03, 0, w, .03, d * .3, '#c8262e');
    for (const s of [-1, 1]) for (let k = 0; k < 4; k++) { const y = .14 + k * .33; P.at(0, 0, s * d / 4, s > 0 ? 0 : Math.PI, () => { P.box(0, y, 0, w - .04, .02, d / 2 - .04, '#f0eeea'); P.box(0, y - .05, d / 4 - .02, w - .04, .05, .01, '#c8262e', { fine: true }); if (k < 4) shelfStock(P, w - .08, d / 2 - .1, y + .02, .9); }); }
    for (let k = 0; k < 3; k++) P.box(-w / 2 + .2 + k * .4, h, 0, .08, .01, .08, '#e8e4da', { fine: true });
  });
  K('conv-wall-shelf', 1.6, .45, 1.8, 'cover', (P, w, d, h) => {
    P.box(0, 0, -d / 2 + .02, w, h, .04, '#dcdad6').box(0, 0, 0, w, .1, d, '#e8e6e2');
    for (let k = 0; k < 5; k++) { const y = .12 + k * .34; P.box(0, y, 0, w - .02, .02, d - .02, '#f0eeea'); P.box(0, y - .05, d / 2 - .01, w, .05, .01, '#3a6ab0', { fine: true }); shelfStock(P, w - .06, d - .1, y + .02, k === 2 ? .45 : .9); }
  });
  function convFridge(P, w, d, h, open) {
    P.box(0, 0, -.04, w, h, d - .08, '#2c3036').box(0, h - .2, d / 2 - .06, w, .18, .03, '#3a404a').box(0, h - .14, d / 2 - .04, w * .75, .08, .006, PINK, { glow: 1.6 });
    P.box(0, .1, -d / 2 + .1, w - .1, h - .35, .02, '#e8f2ee', { glow: .9 });
    P.box(0, h, d / 2 - .1, w, .14, .05, '#3a404a').box(0, h + .02, d / 2 - .07, w - .06, .1, .006, PINK, { glow: 1.6 }).box(0, h + .14, d / 2 - .1, w, .01, .05, PINK, { glow: 1.2 }); // the lit header on top
    for (let k = 0; k < 5; k++) { const y = .14 + k * (h - .45) / 5; P.box(0, y, 0, w - .12, .015, d - .3, '#c9d6e2', { glow: .5 }); for (let j = 0; j < 5; j++) bottle(P, -w / 2 + .12 + j * .14, y + .015, 0, P.pick(['#e84a5a', '#4a8ae8', '#e8d24a', '#5ae88a', '#e8e8e8', '#c84a8a']), .03, .2); }
    for (const sx of [-1, 1]) P.box(sx * (w / 2 - .02), .08, d / 2 - .04, .03, h - .3, .03, '#e8f2ee', { glow: 1.4 });
    if (open) { P.at(w / 2, 0, d / 2 - .04, -1.3, () => P.box(-w / 2, .08, 0, w - .04, h - .32, .04, '#9aaaa6', { glow: .25 })); for (let k = 0; k < 3; k++) P.cyl(P.rand(-.2, .3), .03, d / 2 + P.rand(.15, .5), .03, .2, P.pick(['#e84a5a', '#4a8ae8']), { sides: 6, rz: HALF_PI, ry: P.rand(0, 3) }); P.flat(0, FY, d / 2 + .35, .5, .3, '#3a4650', { ry: .3 }); }
    else P.box(0, .08, d / 2 - .04, w - .04, h - .32, .015, GLASS, { glow: .35 });
  }
  K('conv-fridge', .8, .75, 1.95, 'cover', (P, w, d, h) => convFridge(P, w, d, h, false));
  K('conv-fridge-open', .8, .75, 1.95, 'cover', (P, w, d, h) => convFridge(P, w, d, h, true));
  K('conv-counter', 2.0, .6, 1.05, 'low', (P, w, d, h) => {
    P.box(0, .08, 0, w, h - .12, d, '#3a3e46').box(0, 0, .02, w - .06, .08, d - .06, BLACK).box(0, h - .04, .02, w + .04, .04, d + .04, '#5a5e66');
    P.box(-.5, h, -.05, .35, .1, .3, '#2e3138').box(-.5, h + .1, -.12, .3, .18, .03, BLACK, { rx: -.3 }).box(-.5, h + .12, -.1, .24, .12, .004, '#b8d8c8', { glow: 1.1, rx: -.3 });
    P.box(-.5, h - .16, -d / 2 - .15, .32, .08, .3, '#3a3e46'); // the till drawer, out and empty
    P.box(.4, h, 0, .5, .3, .35, '#c8ccd2').box(.4, h + .03, .176, .46, .24, .005, '#ffe8c8', { glow: 1.1 }); for (let k = 0; k < 4; k++) P.box(.25 + k * .1, h + .05, .05, .06, .02, .2, '#b8763a');
    P.box(.85, h, .1, .15, .2, .15, '#2a2d33').box(.85, h + .15, .176, .1, .03, .003, '#8aff4a', { glow: 1.6 });
    for (let k = 0; k < 3; k++) P.box(-.1 + k * .1, h, .15, .06, .1, .04, P.pick(STOCK));
  });
  K('conv-back-shelf', 1.8, .4, 1.5, 'cover', (P, w, d, h) => {
    P.box(0, 0, 0, w, .6, d, '#3a3e46').box(0, .6, -d / 2 + .02, w, h - .6, .04, '#2a2d33');
    for (let k = 0; k < 3; k++) { const y = .65 + k * .28; P.box(0, y, 0, w, .015, d - .05, '#4a4e56'); for (let j = 0; j < 14; j++) P.box(-w / 2 + .08 + j * .12, y + .015, 0, .1, .14, .08, P.pick(['#e8e2d4', '#c8262e', '#3a6ab0', '#e8e2d4', '#2a2d33'])); }
  });
  K('conv-freezer', 1.0, .6, .85, 'low', (P, w, d, h) => {
    P.box(0, 0, 0, w, h - .05, d, WHITE).box(0, h - .05, 0, w, .05, d, '#c8ccd2').box(0, h - .02, 0, w - .1, .02, d - .1, '#dff0f4', { glow: .5 });
    for (let k = 0; k < 8; k++) P.box(P.rand(-.35, .35), h - .15, P.rand(-.2, .2), .12, .06, .08, P.pick(['#e84a8a', '#4a8ae8', '#e8e2d4', '#8a5a3a']));
    P.box(0, .1, d / 2 + .005, w - .2, .12, .01, '#3a6ab0');
  });
  K('conv-basket', .8, .6, .2, 'walkOver', P => {
    P.box(-.1, 0, 0, .45, .22, .32, '#c8262e', { rz: HALF_PI - .15, ry: .4 }); P.box(-.25, .02, .1, .02, .02, .3, BLACK, { ry: .4 });
    for (let k = 0; k < 6; k++) { if (k % 2) P.cyl(P.rand(0, .35), .03, P.rand(-.25, .25), .03, .18, P.pick(STOCK), { sides: 6, rz: HALF_PI, ry: P.rand(0, 3) }); else P.box(P.rand(0, .35), 0, P.rand(-.25, .25), .12, .05, .09, P.pick(STOCK), { ry: P.rand(0, 3) }); }
  });
  K('conv-chime', .25, .08, 2.45, 'walkOver', (P, w, d) => { const z = -d / 2; P.box(0, 2.25, z + .03, .2, .1, .06, WHITE).box(0, 2.28, z + .061, .04, .04, .004, RED, { glow: 2.2 }); });
  K('conv-stock-rack', 2.6, .4, 1.9, 'cover', (P, w, d, h) => {
    for (const sx of [-1, 0, 1]) for (const sz of [-1, 1]) P.box(sx * (w / 2 - .02), 0, sz * (d / 2 - .02), .035, h, .035, '#3a6ab0');
    for (let k = 0; k < 4; k++) { const y = .1 + k * .58; P.box(0, y, 0, w, .025, d, '#c8ccd2'); if (k < 3) for (let j = 0; j < 7; j++) if (P.r() < .8) P.box(-w / 2 + .2 + j * .36, y + .025, 0, .32, P.rand(.2, .4), d - .06, P.pick([CARD, CARD_D, '#a88a64', '#c8c0a8'])); }
  });
  K('conv-box-spill', 1.2, 1.0, .3, 'walkOver', P => {
    P.box(-.2, 0, -.1, .4, .3, .35, CARD, { ry: .4, rz: HALF_PI });
    for (let k = 0; k < 10; k++) P.box(P.rand(-.5, .5), 0, P.rand(-.4, .4), .1, .04, .14, P.pick(STOCK), { ry: P.rand(0, 3) });
    P.box(.3, 0, .2, .35, .25, .3, CARD_D, { ry: -.3 });
  });
  K('conv-wc', .45, .7, .8, 'low', (P, w, d) => { P.box(0, 0, .05, w * .7, .38, d * .6, '#e3e5e7').box(0, .38, .06, w, .04, d * .65, '#eceeef').box(0, .38, .08, w - .02, .03, d * .6, '#dfe1e3', { rx: -1.4 }).box(0, 0, -d / 2 + .1, w, .8, .18, '#dfe1e3'); });
  K('conv-basin', .55, .4, .9, 'low', (P, w, d, h) => {
    P.box(0, h - .18, 0, w, .18, d, '#e3e5e7').flat(0, h + .002, .02, w - .12, d - .12, '#aab3ba').box(0, 0, -d / 2 + .08, .1, h - .18, .1, '#dfe1e3');
    P.box(0, h, -d / 2 + .05, .03, .15, .03, CHROME).box(0, 1.2, -d / 2 + .005, .45, .5, .01, '#a9c0cc', { glow: .12 });
    P.cyl(.2, h, -.1, .03, .1, '#e8e2d4', { sides: 6 });
  });
  K('conv-toilet-rolls', .5, .4, .25, 'walkOver', P => { for (let k = 0; k < 5; k++) P.cyl(-.15 + (k % 3) * .14, Math.floor(k / 3) * .11, P.rand(-.05, .05), .06, .11, '#eeeae4', { sides: 8 }); P.cyl(.18, .05, .12, .06, .11, '#eeeae4', { sides: 8, rz: HALF_PI }); });

  // ============================================================ the noodle bar
  function booth(P, w, d, table) {
    const c = '#8a2a2a';
    for (const sx of [-1, 1]) { P.box(sx * (w / 2 - .225), 0, 0, .45, .45, d, shade(c, .8)); P.box(sx * (w / 2 - .225), .45, 0, .4, .08, d - .04, c); P.box(sx * (w / 2 - .04), .45, 0, .08, .55, d, c); }
    P.box(0, .72, .02, .7, .04, d - .15, '#2a2226').box(0, 0, 0, .08, .72, .08, STEEL_D);
    table(P);
  }
  K('noodle-booth-a', 1.6, 1.35, 1.0, 'low', (P, w, d) => booth(P, w, d, P => {
    bowl(P, -.15, .76, -.3, '#e8e4da', 'noodles'); bowl(P, .15, .76, .2, '#2a2d33', 'noodles'); chopsticks(P, -.05, .77, -.1, .4); chopsticks(P, .2, .77, .4, -.2);
    P.cyl(0, .76, .45, .04, .08, '#e8e4da', { sides: 6 }); bottle(P, -.2, .76, .5, '#3a2018', .025, .15);
    P.box(.15, .76, -.35, .08, .012, .16, BLACK).box(.15, .772, -.35, .07, .002, .14, '#b8e8c8', { glow: 1.6 });
  }));
  K('noodle-booth-b', 1.6, 1.35, 1.0, 'low', (P, w, d) => booth(P, w, d, P => {
    bowl(P, 0, .76, -.1, '#e8e4da', 'noodles'); P.cyl(.2, .76, .3, .075, .055, '#e8e4da', { sides: 8, top: .09, rz: 1.7 }); P.flat(.15, .762, .35, .3, .2, '#b8864a', { ry: .4 });
    P.cyl(-.2, .76, .35, .035, .06, '#e8e4da', { sides: 6 }).cyl(-.2, .76, .45, .035, .06, '#e8e4da', { sides: 6 });
    chopsticks(P, 0, .01, .8, 1.2); // dropped on the floor at its end
  }));
  K('noodle-ledge', 2.4, .9, 1.05, 'low', (P, w, d, h) => {
    P.box(0, h - .05, -d / 2 + .22, w, .05, .45, '#6a4a32').box(0, 0, -d / 2 + .06, w, h - .05, .1, '#4a3424');
    for (let k = 0; k < 4; k++) { const x = -w / 2 + .3 + k * .6; P.cyl(x, .72, d / 2 - .2, .16, .05, '#2a2226', { sides: 8 }); P.cyl(x, .02, d / 2 - .2, .03, .7, CHROME, { sides: 6 }); P.cyl(x, 0, d / 2 - .2, .14, .02, STEEL_D, { sides: 8 }); P.cyl(x, .3, d / 2 - .2, .12, .015, CHROME, { sides: 8, fine: true }); }
    bowl(P, -.9, h, -.2, '#e8e4da', 'noodles'); bowl(P, .3, h, -.2, '#2a2d33', 'noodles'); chopsticks(P, -.7, h + .005, -.15, .2); chopsticks(P, .5, h + .005, -.25, 1.4);
    for (let k = 0; k < 3; k++) { bottle(P, -.3 + k * .06, h, -.35, ['#3a2018', '#b82a1a', '#a89060'][k], .02, .14); }
    P.cyl(.9, h, -.25, .04, .09, '#e8e4da', { sides: 6 });
  });
  K('noodle-pass', 1.4, .6, 1.05, 'low', (P, w, d, h) => {
    P.box(0, 0, 0, w, h - .05, d, '#6a4a32').box(0, h - .05, 0, w + .04, .05, d + .04, CHROME);
    for (let k = 0; k < 4; k++) P.cyl(-.45, h + k * .05, -.1, .09, .05, '#e8e4da', { sides: 8, top: .1 }); bowl(P, .1, h, 0, '#2a2d33', 'noodles'); bowl(P, .35, h, -.05, '#2a2d33', 'noodles');
    P.cyl(.55, h, .15, .04, .03, CHROME, { sides: 8 }).box(.55, h + .03, .15, .01, .02, .01, CHROME);
    for (let k = 0; k < 4; k++) P.box(-.3 + k * .15, h + .6, -d / 2 + .05, .1, .14, .004, '#f0ece0'); P.box(0, h + .72, -d / 2 + .04, w, .01, .01, CHROME);
    bulb(P, 0, 2.3, 0, WARM, 2.4);
  });
  K('noodle-menu', 2.0, .08, 2.4, 'walkOver', (P, w, d) => {
    const z = -d / 2;
    P.box(0, 1.8, z + .02, w, .5, .04, '#1e1a18');
    for (let k = 0; k < 5; k++) { const x = -w / 2 + .2 + k * .4; P.box(x, 1.84, z + .045, .34, .42, .004, '#fff4e4', { glow: 1.0 }); P.cyl(x, 1.94, z + .05, .1, .006, '#c8a898', { rx: HALF_PI, sides: 8, glow: .6 }); P.box(x, 2.06, z + .05, .02, .12, .003, '#3a2018', { rz: .3 }); for (let j = 0; j <= k % 3; j++) P.box(x - .1 + j * .06, 1.88, z + .05, .03, .03, .003, '#c83a2a', { glow: .6 }); }
  });
  K('noodle-lanterns', 2.4, .3, 2.7, 'walkOver', (P, w) => {
    for (let k = 0; k < 3; k++) { const x = -w / 2 + .4 + k * .8; P.box(x, 2.3, 0, .01, .4, .01, BLACK); P.cyl(x, 1.9, 0, .17, .4, '#ffe4c8', { sides: 8, glow: 1.4 }); P.cyl(x, 1.88, 0, .12, .03, '#2a1a18', { sides: 8 }); P.cyl(x, 2.29, 0, .12, .03, '#2a1a18', { sides: 8 }); }
  });
  K('noodle-spilled-bowl', .8, .6, .08, 'walkOver', P => {
    P.cyl(-.1, .02, 0, .075, .055, '#e8e4da', { sides: 8, top: .09, rz: 2.2, ry: .5 }); P.flat(.1, FY, .05, .4, .3, '#8a6a3a', { ry: .3 });
    for (let k = 0; k < 6; k++) P.box(P.rand(-.1, .3), 0, P.rand(-.15, .2), .15, .008, .01, '#e8d8a0', { ry: P.rand(0, 3) }); chopsticks(P, .2, 0, -.2, 2.1);
  });
  K('noodle-range', 2.0, .8, .9, 'low', (P, w, d, h) => {
    P.box(0, 0, 0, w, h - .05, d, STEEL).box(0, h - .05, 0, w, .05, d, STEEL_D);
    for (let k = 0; k < 3; k++) { const x = -.65 + k * .65; P.cyl(x, h, 0, .2, .02, BLACK, { sides: 8 }); P.cyl(x, h + .01, 0, .12, .012, FLAME, { sides: 8, glow: 1.8 }); P.cyl(x, h + .02, 0, .26, .4 - k * .08, '#9aa2aa', { sides: 10 }); P.cyl(x, h + .4 - k * .08, 0, .24, .01, '#c8a878', { sides: 10 }); steam(P, x, h + .45 - k * .08, 0, 6 - k, .18); }
    P.box(.95, h + .1, 0, .08, .5, .5, STEEL_D); for (let k = 0; k < 3; k++) P.cyl(.9, h + .5, -.15 + k * .15, .07, .15, '#c8ccd2', { sides: 6, rz: .3 });
  });
  K('noodle-wok-burner', 1.1, .8, .9, 'low', (P, w, d, h) => {
    P.box(0, 0, 0, w, h - .05, d, STEEL).box(0, h - .05, 0, w, .05, d, STEEL_D);
    P.cyl(0, h, 0, .25, .06, BLACK, { sides: 10 }).cyl(0, h + .06, 0, .15, .01, FLAME, { sides: 10, glow: 2 }); // the ring still lit, no wok on it
    P.box(.42, h, -.2, .1, .3, .1, CHROME).box(.4, h + .28, -.1, .03, .03, .3, CHROME);
    for (let k = 0; k < 3; k++) P.cyl(-.4, h, -.25 + k * .15, .05, .08, P.pick(['#3a2018', '#b82a1a', '#e8e2d4']), { sides: 6 });
  });
  K('noodle-floor-wok', .9, .8, .15, 'walkOver', P => {
    P.cyl(-.1, .0, 0, .3, .1, '#2a2d33', { sides: 10, top: .2, rz: Math.PI - .3 }); P.box(.25, .02, .05, .35, .03, .04, WOOD_D, { ry: .2 });
    for (let k = 0; k < 10; k++) P.box(P.rand(-.4, .4), 0, P.rand(-.35, .35), .12, .01, .012, P.pick(['#e8d8a0', '#e8d8a0', '#4a8a3a', '#c83a2a']), { ry: P.rand(0, 3) });
    P.flat(0, FY, .1, .6, .4, '#6a4a2a', { ry: .6 }); P.cyl(.3, 0, -.25, .09, .03, CHROME, { sides: 8 }).box(.4, .02, -.3, .25, .015, .02, CHROME, { ry: .7 });
  });
  K('noodle-prep', 1.6, .7, .9, 'low', (P, w, d, h) => {
    P.box(0, 0, 0, w, h - .04, d, STEEL).box(0, h - .04, 0, w, .04, d, CHROME);
    P.box(-.4, h, 0, .5, .04, .35, '#e8e2d4'); P.box(-.35, h + .04, .05, .22, .01, .08, CHROME).box(-.2, h + .04, .05, .1, .02, .03, BLACK);
    for (let k = 0; k < 8; k++) P.cyl(.1 + (k % 4) * .14, h, -.12 + Math.floor(k / 4) * .2, .06, .04, '#e8d8a0', { sides: 7 });
    for (let k = 0; k < 3; k++) P.cyl(-.65 + k * .0, h, -.2 + k * .15, .07, .06, '#e8e4da', { sides: 8 }); P.box(-.4, h + .04, -.05, .2, .015, .08, '#4a8a3a', { fine: true });
  });
  K('noodle-sink', 1.1, .6, .9, 'low', (P, w, d, h) => {
    P.box(0, 0, 0, w, h, d, STEEL).flat(0, h + .002, .03, w - .2, d - .15, '#6a7078');
    P.box(0, h, -d / 2 + .05, .03, .35, .03, CHROME).box(0, h + .32, -d / 2 + .1, .03, .03, .25, CHROME);
    for (let k = 0; k < 6; k++) P.cyl(-.2 + (k % 3) * .02, h - .2 + k * .045, 0, .09, .045, k % 2 ? '#2a2d33' : '#e8e4da', { sides: 8, top: .1 });
    for (let k = 0; k < 3; k++) P.cyl(.3, h - .15 + k * .045, .05, .09, .045, '#e8e4da', { sides: 8, top: .1 });
  });
  K('noodle-reachin', .9, .75, 2.0, 'cover', (P, w, d, h) => {
    P.box(0, 0, 0, w, h, d, '#9aa0a6').box(0, .1, d / 2, w - .04, h - .2, .01, '#a8aeb4').box(w / 2 - .1, .8, d / 2 + .01, .04, .5, .03, CHROME);
    P.box(0, h - .12, d / 2 + .012, .2, .06, .005, '#2a3a2a', { glow: .6 }).box(-.05, h - .11, d / 2 + .016, .04, .04, .003, RED, { glow: 1.6 });
  });
  K('noodle-dry-store', 1.2, .45, 1.8, 'cover', (P, w, d, h) => {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.box(sx * (w / 2 - .02), 0, sz * (d / 2 - .02), .035, h, .035, CHROME);
    for (let k = 0; k < 4; k++) { const y = .1 + k * .55; P.box(0, y, 0, w - .02, .025, d - .02, STEEL);
      if (k === 0) for (let j = 0; j < 2; j++) P.box(-.3 + j * .55, y + .025, 0, .5, .3, .38, '#e8e2d4');
      else if (k < 3) for (let j = 0; j < 6; j++) P.box(-.48 + j * .19, y + .025, 0, .16, P.rand(.12, .3), .3, P.pick(['#e8d880', '#c84a4a', '#e8e2d4', '#c8a878'])); }
  });
  K('noodle-bins', .9, .45, .8, 'low', P => {
    P.cyl(-.22, 0, 0, .2, .75, '#3a4a3a', { sides: 8 }).cyl(-.22, .75, 0, .21, .04, '#2a3a2a', { sides: 8 });
    P.box(.22, 0, 0, .4, .3, .4, '#3a6a9a'); for (let k = 0; k < 4; k++) bottle(P, .12 + (k % 2) * .18, .3, -.1 + Math.floor(k / 2) * .18, '#6a8a5a', .03, .2);
  });
  K('noodle-mat', 1.2, .8, .02, 'walkOver', P => { P.flat(0, FY, 0, 1.1, .7, '#2a2d33'); for (let k = 0; k < 6; k++) P.flat(-.45 + k * .18, FY + .001, 0, .04, .6, '#3a3d44'); });

  // ============================================================ pawn and repair
  K('pawn-caged-counter', 2.0, .6, 2.4, 'cover', (P, w, d, h) => {
    P.box(0, 0, 0, w, 1.0, d, '#3a3d44').box(0, 1.0, 0, w + .04, .04, d + .04, '#5a5e66').box(0, .1, d / 2 + .005, w - .1, .8, .01, '#2a2d33');
    for (let k = 0; k <= 12; k++) P.box(-w / 2 + k * w / 12, 1.04, 0, .012, h - 1.04, .012, STEEL);
    for (let k = 0; k <= 8; k++) P.box(0, 1.04 + k * .17, 0, w, .012, .012, STEEL);
    P.box(0, 1.04, 0, .45, .18, .1, '#3a3d44'); // the pass slot
    P.box(.6, 1.04, -.15, .3, .15, .22, '#2e3138').box(.6, 1.19, -.2, .26, .14, .02, BLACK).box(.6, 1.2, -.19, .22, .1, .004, '#3a4a5a', { glow: .7 });
    P.box(-.6, 1.04, -.1, .2, .02, .25, PAPER, { fine: true }).box(-.35, 1.04, -.15, .06, .06, .06, '#c8b870');
  });
  K('pawn-back-rack', 2.0, .3, 1.9, 'cover', (P, w, d, h) => {
    P.box(0, 0, -d / 2 + .02, w, h, .04, '#2a2d33');
    for (let k = 0; k < 5; k++) { const y = .05 + k * .42; P.box(0, y, 0, w, .025, d, '#4a4e56');
      if (k < 4) for (let j = 0; j < 6; j++) { const x = -w / 2 + .18 + j * .32, t = P.r(); if (t < .3) P.box(x, y + .025, 0, .22, .16, .18, '#2a2d33').box(x, y + .06, .091, .16, .1, .004, '#3a4048'); else if (t < .55) P.cyl(x, y + .025, 0, .06, .1, '#1e2024', { sides: 8 }); else if (t < .75) P.box(x, y + .025, 0, .08, .14, .02, BLACK); else P.box(x, y + .025, 0, .25, .08, .2, P.pick(['#6a4a32', '#8a8f95', '#3a4a6a'])); P.box(x + .08, y + .12, .1, .03, .04, .003, '#e8e4da', { fine: true }); } }
  });
  K('pawn-display-case', .6, 1.2, 1.0, 'low', (P, w, d, h) => {
    P.box(0, 0, 0, w, .7, d, '#2a2d33').box(0, .7, 0, w - .04, .02, d - .04, '#3a2a2a', { glow: .2 }).box(0, .7, 0, w, .28, d, GLASS, { glow: .15 }).box(0, h - .02, 0, w, .02, d, CHROME);
    for (let k = 0; k < 10; k++) P.cyl(P.rand(-.2, .2), .72, P.rand(-.5, .5), .03, .015, P.pick(['#c8ccd2', '#d8c890', '#e8e4da']), { sides: 6 });
    for (let k = 0; k < 3; k++) P.box(P.rand(-.15, .15), .72, -.3 + k * .3, .1, .02, .14, '#1e2024');
  });
  K('pawn-guitars', 1.4, .15, 2.0, 'walkOver', (P, w, d) => {
    const z = -d / 2;
    for (let k = 0; k < 3; k++) { const x = -.45 + k * .45; P.at(x, 0, z + .06, 0, () => { P.box(0, .7, 0, .34, .45, .07, P.pick(['#8a4a2a', '#2a2d33', '#c83a3a']), { rz: .05 }); P.box(0, 1.08, 0, .28, .3, .07, P.pick(['#8a4a2a', '#6a3a1a']), { rz: .05 }); P.cyl(0, .92, .036, .05, .005, BLACK, { rx: HALF_PI, sides: 8 }); P.box(0, 1.35, 0, .05, .5, .03, WOOD_D); P.box(0, 1.85, 0, .08, .12, .03, BLACK); P.box(0, 1.93, -.02, .03, .05, .03, STEEL_D); P.box(.02, .98, .038, .06, .03, .004, '#e8e4da', { fine: true }); }); }
  });
  K('pawn-tv-stack', 1.0, .55, 1.4, 'cover', (P, w, d, h) => {
    P.box(-.2, 0, 0, .55, .45, .5, '#2a2d33').box(.27, 0, 0, .42, .38, .45, '#3a3d44');
    P.box(-.2, .47, .23, .47, .36, .01, BLACK); P.box(.27, .4, .2, .36, .3, .01, BLACK);
    P.box(0, .45, 0, .8, .5, .5, '#3a3a3e'); screen(P, -.05, .9, .251, .6, .38, STATIC, 'static');
    P.box(-.1, .95, 0, .6, .45, .4, '#2a2d33').box(-.1, 1.0, .201, .5, .35, .01, BLACK);
    for (let k = 0; k < 4; k++) P.box(-.4 + k * .25, P.rand(.1, 1.2), d / 2 + .01, .05, .06, .004, '#e8e4da', { fine: true });
  });
  K('pawn-open-safe', .7, .55, 1.1, 'low', (P, w, d, h) => {
    P.box(0, 0, 0, w, h, d, '#3a4048').box(0, .08, d / 2 - .02, w - .12, h - .16, .02, '#15171b');
    P.box(0, .45, 0, w - .14, .02, d - .12, '#2a2d33');
    P.at(-w / 2, 0, d / 2, -1.9, () => { P.box(w / 2 - .03, .04, .05, w - .06, h - .08, .1, '#4a5058'); P.cyl(w / 2, .6, .1, .07, .03, CHROME, { rx: HALF_PI, sides: 10 }); P.box(w / 2 - .15, .35, .1, .03, .12, .03, CHROME); });
    P.flat(.1, FY, d / 2 + .3, .3, .2, PAPER, { ry: .6 });
  });
  K('pawn-deposit-boxes', .76, .35, 1.8, 'cover', (P, w, d, h) => {
    P.box(0, 0, 0, w, h, d, '#6a6e74');
    for (let i = 0; i < 3; i++) for (let j = 0; j < 7; j++) { const x = -w / 2 + .13 + i * .25, y = .1 + j * .24; if (P.r() < .45) P.box(x, y, d / 2 - .02, .21, .2, .02, BLACK); else { P.box(x, y, d / 2, .21, .2, .01, '#8a8e94'); P.cyl(x, y + .1, d / 2 + .01, .015, .01, CHROME, { rx: HALF_PI, sides: 6, fine: true }); } }
  });
  K('pawn-dumped-drawers', 1.2, 1.0, .15, 'walkOver', P => {
    for (let k = 0; k < 4; k++) P.box(P.rand(-.4, .4), 0, P.rand(-.35, .35), .21, .12, .35, '#8a8e94', { ry: P.rand(0, 3), rz: k % 2 ? Math.PI : 0 });
    for (let k = 0; k < 7; k++) P.flat(P.rand(-.5, .5), FY + k * .001, P.rand(-.4, .4), .21, .28, P.pick([PAPER, '#c8c0a8']), { ry: P.rand(0, 3), fine: true });
    P.box(.3, 0, .3, .12, .03, .08, '#8a4a3a', { ry: .5 });
  });
  K('pawn-fuse-panel', .5, .12, 2.0, 'walkOver', (P, w, d) => {
    const z = -d / 2;
    P.box(0, 1.2, z + .05, .45, .6, .1, '#8a8e94'); for (let k = 0; k < 6; k++) P.box(-.15 + (k % 3) * .15, 1.4 + Math.floor(k / 3) * .2, z + .101, .06, .1, .01, BLACK);
    P.box(.15, 1.72, z + .103, .03, .03, .004, GREEN, { glow: 2 });
  });
  K('pawn-cctv-cam', .3, .3, 2.5, 'walkOver', (P, w, d) => {
    const z = -d / 2;
    P.box(0, 2.3, z + .03, .1, .1, .06, WHITE).box(0, 2.25, z + .15, .1, .1, .22, WHITE, { rx: .4 }).box(.03, 2.22, z + .27, .015, .015, .005, RED, { glow: 2.4 });
  });
  K('pawn-repair-bench', 2.0, .7, .9, 'low', (P, w, d, h) => {
    P.box(0, h - .04, 0, w, .04, d, '#4a5058').box(0, 0, -d / 2 + .05, w, h - .04, .06, '#3a3e46'); for (const sx of [-1, 1]) P.box(sx * (w / 2 - .03), 0, 0, .05, h - .04, d, '#3a3e46');
    P.box(0, h + .6, -d / 2 + .03, w, .5, .02, '#6a6e74'); for (let k = 0; k < 7; k++) P.box(-.8 + k * .26, h + .7 + (k % 2) * .15, -d / 2 + .06, .05, .2, .02, P.pick([STEEL, BLACK, '#c84a4a']));
    P.at(-.2, h, .05, .3, () => { P.box(0, 0, 0, .38, .015, .26, '#2a2d33'); P.box(0, .015, 0, .34, .006, .22, '#2a6a3a'); for (let k = 0; k < 5; k++) P.box(P.rand(-.12, .12), .02, P.rand(-.08, .08), .04, .015, .03, P.pick([BLACK, '#c8b870', CHROME]), { fine: true }); P.box(0, .01, -.2, .36, .01, .22, BLACK, { rx: -1.2 }); }); // the gutted laptop
    P.box(.45, h, 0, .12, .06, .12, '#2a2d33').box(.45, h + .06, 0, .02, .1, .02, CHROME).box(.35, h + .1, .02, .22, .02, .02, '#e8e2d4', { rz: .4 }).box(.26, h + .06, .03, .04, .012, .012, EMBER, { glow: 2.4, rz: .4 }); // the iron, its tip glowing
    P.box(.75, h, -.15, .1, .05, .1, BLACK).box(.75, h + .05, -.15, .02, .4, .02, BLACK, { rz: -.3 }).cyl(.65, h + .4, -.12, .1, .03, '#e8f0f4', { sides: 8, glow: 1.4, rx: .5 });
    for (let k = 0; k < 6; k++) P.box(.2 + k * .06, h, .25, .05, .03, .05, P.pick(['#c84a4a', '#4a7ac8', '#e8e2d4']), { fine: true });
    P.box(-.75, h, 0, .3, .2, .2, '#3a5a7a');
  });
  K('pawn-repair-shelf', 1.6, .5, 1.9, 'cover', (P, w, d, h) => {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.box(sx * (w / 2 - .02), 0, sz * (d / 2 - .02), .035, h, .035, STEEL_D);
    for (let k = 0; k < 5; k++) { const y = .05 + k * .45; P.box(0, y, 0, w, .025, d, '#8a8f95');
      if (k < 4) for (let j = 0; j < 4; j++) { const x = -w / 2 + .22 + j * .38; P.box(x, y + .025, 0, .3, P.rand(.12, .3), .3, P.pick(['#2a2d33', '#8a8f95', '#3a4a6a', '#c8c0a8'])); P.box(x + .1, y + .12, .16, .06, .06, .004, P.pick(['#e8e4da', '#e8d86a', '#c84a4a']), { fine: true }); } }
    P.box(0, h - .03, 0, .5, .1, .4, '#3a3d44').box(0, h + .05, 0, .6, .02, .06, BLACK);
  });
  K('pawn-cable-coils', .8, .6, .1, 'walkOver', P => { for (let k = 0; k < 3; k++) P.cyl(P.rand(-.25, .25), 0, P.rand(-.15, .15), P.rand(.1, .18), .04, P.pick([BLACK, '#e8e2d4', '#3a3d44']), { sides: 10 }); P.box(.2, 0, .2, .15, .05, .08, BLACK); });

  // ============================================================ the arcade
  // Cabinets in attract mode: each its own marquee colour and screen art.
  function cabinet(P, w, d, h, col, art) {
    P.box(0, 0, -.05, w, h - .25, d - .1, '#15171b', { front: '#1e2026' }).box(0, h - .25, -.1, w, .25, d - .2, '#15171b', { top: shade(col, .45) });
    P.box(0, h, -.1, w - .12, .01, d - .32, shade(col, .6), { glow: 1.1 }); // the marquee's lit top, seen from above
    P.box(0, h - .22, d / 2 - .19, w - .06, .18, .02, col, { glow: 1.8 }); P.box(0, h - .19, d / 2 - .175, w * .5, .1, .004, '#f2f2f2', { glow: 1.4 });
    P.box(0, 1.0, d / 2 - .3, w - .1, .55, .05, BLACK, { rx: -.25 }); P.at(0, 1.02, d / 2 - .27, 0, () => screen(P, 0, .5, 0, w - .2, .44, col, art, 1.6));
    P.box(0, .82, d / 2 - .12, w, .12, .3, '#2a2d33', { rx: .15 });
    for (let k = 0; k < 4; k++) P.cyl(-.15 + k * .1, .93, d / 2 - .06, .025, .02, P.pick([RED, GREEN, LEMON, PINK]), { sides: 6, glow: 1.6 });
    P.box(-.25, .94, d / 2 - .1, .02, .08, .02, BLACK).cyl(-.25, 1.02, d / 2 - .1, .03, .03, RED, { sides: 6 });
    P.box(0, .35, d / 2 - .09, .2, .12, .01, '#2a2d33').box(0, .4, d / 2 - .084, .06, .04, .004, RED, { glow: 1.8 });
    P.box(-w / 2 - .005, .2, -.05, .01, h - .5, d * .6, col, { glow: .5 }).box(w / 2 + .005, .2, -.05, .01, h - .5, d * .6, col, { glow: .5 });
  }
  K('arcade-cab-a', .8, .8, 1.8, 'cover', (P, w, d, h) => cabinet(P, w, d, h, MAGENTA, 'attract'));
  K('arcade-cab-c', .8, .8, 1.8, 'cover', (P, w, d, h) => cabinet(P, w, d, h, BLUE, 'attract'));
  K('arcade-cab-d', .8, .8, 1.8, 'cover', (P, w, d, h) => cabinet(P, w, d, h, RED, 'static'));
  // The carpet's printed glyphs (triangles, rings, zigzags), faintly lit by the screens.
  K('arcade-carpet-glyphs', 3.0, 2.2, .01, 'walkOver', (P, w, d) => {
    for (let k = 0; k < 16; k++) { const x = P.rand(-w / 2 + .2, w / 2 - .2), z = P.rand(-d / 2 + .2, d / 2 - .2), c = P.pick([PINK, BLUE, GREEN, MAGENTA]), t = k % 3;
      if (t === 0) P.cyl(x, FY - .004, z, .12, .004, c, { sides: 3, glow: .35 }); else if (t === 1) { P.cyl(x, FY - .004, z, .1, .004, c, { sides: 10, glow: .35 }); P.cyl(x, FY - .003, z, .06, .004, '#221a2e', { sides: 10 }); } else P.flat(x, FY, z, .3, .04, c, { ry: P.rand(0, 3), glow: .35 }); }
  });
  K('arcade-claw', 1.0, 1.0, 1.9, 'cover', (P, w, d, h) => {
    P.box(0, 0, 0, w, .8, d, PINK, { glow: .2 }).box(0, .8, 0, w, .95, d, GLASS, { glow: .15 }).box(0, 1.75, 0, w, .15, d, PINK, { glow: 1.2 });
    for (let k = 0; k < 14; k++) P.box(P.rand(-.35, .35), .8, P.rand(-.35, .35), .13, .12, .12, P.pick(['#e8a8c8', '#a8d8a8', '#e8e2a8', '#a8c8e8', '#e8e2d4']), { ry: P.rand(0, 3) });
    P.box(.1, 1.3, -.1, .01, .45, .01, CHROME); for (let k = 0; k < 3; k++) P.box(.1, 1.22, -.1, .02, .12, .02, CHROME, { rz: .5, ry: k * 2.1 });
    P.box(0, .75, d / 2 + .02, .4, .06, .08, '#2a2d33').cyl(-.1, .81, d / 2 + .04, .02, .1, BLACK, { sides: 6 }).cyl(.1, .81, d / 2 + .04, .03, .02, RED, { sides: 6, glow: 1.6 });
  });
  K('arcade-prize-counter', 1.3, .6, 1.05, 'low', (P, w, d, h) => {
    P.box(0, 0, 0, w, .3, d, '#1a1c22').box(0, .3, 0, w, .7, d, GLASS, { glow: .18 }).box(0, h - .05, 0, w + .02, .05, d + .02, '#2a2d33').box(0, .3, 0, w - .04, .02, d - .04, '#3a2a3a', { glow: .3 });
    for (let k = 0; k < 12; k++) P.box(P.rand(-.6, .6), .32 + (k % 2) * .3, P.rand(-.2, .2), .1, .1, .1, P.pick(['#e8a8c8', '#a8d8a8', '#e8e2a8', '#a8c8e8', '#e8e2d4', '#c84a4a']), { ry: P.rand(0, 3) });
    P.box(0, .62, 0, w - .04, .015, d - .04, '#c8d8e0', { glow: .2 });
    P.box(.45, h, 0, .3, .15, .25, '#2e3138').box(-.45, h, .1, .15, .08, .15, '#8a8f95');
    P.box(0, .12, d / 2 + .005, w - .1, .04, .005, MAGENTA, { glow: 1.6 });
  });
  K('arcade-prize-wall', 2.0, .15, 2.2, 'walkOver', (P, w, d) => {
    const z = -d / 2;
    P.box(0, 1.1, z + .015, w, 1.0, .03, '#2a2d33');
    for (let r = 0; r < 3; r++) { P.box(0, 1.12 + r * .33, z + .05, w - .1, .015, .06, '#4a4e56'); for (let k = 0; k < 7; k++) { const x = -w / 2 + .2 + k * .27; P.box(x, 1.14 + r * .33, z + .08, .16 + r * .03, .18 + r * .03, .12, P.pick(['#e8a8c8', '#a8d8a8', '#e8e2a8', '#a8c8e8', '#e8e2d4', '#c84a4a', '#e8b8c0'])); } for (let k = 0; k <= r; k++) P.box(-w / 2 + .1 + k * .06, 1.24 + r * .33, z + .1, .03, .03, .004, LEMON, { glow: 1.4 }); }
    P.box(0, 2.14, z + .02, w, .04, .04, MAGENTA, { glow: 1.8 });
  });
  K('arcade-token-machine', .6, .5, 1.5, 'cover', (P, w, d, h) => {
    P.box(0, 0, 0, w, h, d, '#2a2d38').box(0, .9, d / 2, w - .1, .4, .02, BLACK).box(0, 1.0, d / 2 + .012, w - .2, .25, .004, '#3a6a3a', { glow: .9 });
    P.box(0, 1.1, d / 2 + .016, .12, .06, .003, '#f2f2f2', { glow: 1.2 }); P.cyl(0, 1.12, d / 2 + .02, .02, .004, '#c8b870', { rx: HALF_PI, sides: 8 });
    P.box(0, .35, d / 2 - .05, .3, .15, .15, BLACK); P.box(0, h - .08, 0, w, .08, d, GREEN, { glow: 1.4 });
  });
  K('arcade-tokens', 1.0, .8, .03, 'walkOver', P => {
    for (let k = 0; k < 26; k++) P.cyl(P.rand(-.45, .45) * (k < 14 ? .5 : 1), .0, P.rand(-.35, .35) * (k < 14 ? .5 : 1), .018, .006, P.pick(['#c8ccd2', '#b8b090', '#c8ccd2']), { sides: 6 });
    P.box(.1, 0, -.1, .15, .1, .1, '#c8b870', { rz: HALF_PI, ry: .5 });
  });
  // The VR booths: padded open cubicles (open to +x), a lit floor ring, a
  // ceiling boom: one headset hanging on its cable, one dropped, one booth's
  // screen showing static.
  function vrBooth(P, w, d, h, story) {
    const pad = '#2a2438';
    P.box(0, 0, -d / 2 + .04, w, h, .08, pad).box(0, 0, d / 2 - .04, w, h, .08, pad).box(-w / 2 + .04, 0, 0, .08, h, d, pad);
    for (let k = 0; k < 4; k++) P.box(-w / 2 + .09, .3 + k * .45, 0, .02, .35, d - .2, '#3a3448');
    P.cyl(.1, FY, 0, .45, .006, '#1a1c22', { sides: 12 }); P.cyl(.1, FY + .003, 0, .44, .004, story === 'static' ? '#3a4a3a' : PINK, { sides: 12, glow: 1.2 }); P.cyl(.1, FY + .006, 0, .38, .004, '#1a1c22', { sides: 12 });
    P.box(-.3, h - .1, 0, .7, .05, .05, BLACK).box(.05, h - .15, 0, .06, .06, .06, BLACK);
    if (story === 'hanging') { /* the headset and its cable: effects/lumen-interior-life.js (it swings) */ }
    else if (story === 'dropped') { P.box(.05, 1.0, 0, .01, 1.1, .01, BLACK, { rz: .05 }); P.box(.3, 0, .2, .2, .1, .14, WHITE, { ry: .9 }); P.box(.3, .02, .28, .16, .06, .01, '#2a2d33', { ry: .9 }); P.box(-.2, 0, -.3, .06, .04, .15, BLACK, { ry: 1.5 }); }
    else { P.box(-w / 2 + .09, 1.1, 0, .02, .6, .9, BLACK); P.at(-w / 2 + .1, 1.4, 0, HALF_PI, () => screen(P, 0, .28, 0, .8, .5, STATIC, 'static')); }
    P.box(-w / 2 + .15, 1.3, -d / 2 + .15, .08, .15, .05, '#3a3d44').box(-w / 2 + .15, 1.3, d / 2 - .15, .08, .15, .05, '#3a3d44');
  }
  K('vr-booth-a', 1.6, 1.25, 2.2, 'cover', (P, w, d, h) => vrBooth(P, w, d, h, 'hanging'));
  K('vr-booth-b', 1.6, 1.25, 2.2, 'cover', (P, w, d, h) => vrBooth(P, w, d, h, 'dropped'));
  K('vr-booth-c', 1.6, 1.25, 2.2, 'cover', (P, w, d, h) => vrBooth(P, w, d, h, 'static'));

  return NORTH_KINDS;
}

// --- The placements ------------------------------------------------------------
// A room's own floor (world/city-interiors.js 'floor': it fills the room).
const F = (room, pattern, col, col2, size) => ({ kind: 'floor', room, pattern, col, ...(col2 && { col2 }), ...(size && { size }) });

// A piece against a slanted wall of a quad room (wall pieces need rect rooms):
// the wall from a to b, `t` metres along it, its back `off` off the wall's
// inner face, its front facing into the room (toward `inside`).
function onSlant(a, b, inside, t, depth, off = .02) {
  const l = Math.hypot(b[0] - a[0], b[1] - a[1]), ux = (b[0] - a[0]) / l, uz = (b[1] - a[1]) / l;
  let nx = -uz, nz = ux; if ((inside[0] - a[0]) * nx + (inside[1] - a[1]) * nz < 0) { nx = -nx; nz = -nz; }
  const k = .19 + off + depth / 2;
  return { x: r3(a[0] + ux * t + nx * k), z: r3(a[1] + uz * t + nz * k), deg: r3(Math.atan2(nx, nz) * 180 / Math.PI) };
}
// Everyday civilians (design 6): muted everyday clothes, visible hair, never a
// hat, a long coat or a team colour. The Stacks' dead died in the panic (not infected).
const STACKS_DEAD = { skin: '#8a6248', hair: '#1e1a16', cloth: '#5a6470', legs: '#3a3f48' };
const DRIED = '#3a2e2a'; // old stains, darkened by days (never fresh blood)

function buildInteriors() {
  return {
    // ------------------------------------------------------------------ the Stacks' main block (design 5 row 1)
    'stacks-main': [
      F('corridor-w', 'concrete', '#6e6c66', '#5c5a55'), F('corridor-n', 'concrete', '#6e6c66', '#5c5a55'), F('corridor-s', 'concrete', '#6e6c66', '#5c5a55'),
      F('unit-1', 'planks', '#6a5440'), F('unit-2', 'planks', '#5e4c3a'), F('unit-3', 'planks', '#584636'), F('unit-4', 'planks', '#5a4a3a'),
      F('unit-5', 'planks', '#6a5846'), F('unit-6', 'concrete', '#5e5c58'), F('washroom', 'checker', '#8a9290', '#6e7674', .4), F('mail-nook', 'tiles', '#7e7a70', '#66625a', .4),
      // The long corridor: washing strung across it, the dead end's door taped in an X
      // with the trefoil sprayed over it (the stairwell sealed), the electrics open, and
      // unit 4's mattress dragged out with its dead beside it, reaching for the courtyard door.
      { kind: 'stacks-x-door', room: 'corridor-w', wall: 'n', at: -51 },
      { kind: 'stacks-laundry-a', room: 'corridor-w', x: -51, z: -41.8 },
      { kind: 'stacks-laundry-b', room: 'corridor-w', x: -51, z: -31.2 },
      { kind: 'stacks-laundry-c', room: 'corridor-w', x: -51, z: -24.4 },
      { kind: 'stacks-junction', room: 'corridor-w', wall: 'w', at: -37.0 },
      { kind: 'stacks-mattress', room: 'corridor-w', x: -51.25, z: -22.2, deg: 3 },
      { kind: 'body', room: 'corridor-w', x: -50.55, z: -24.6, deg: 180, pose: 'reach', look: STACKS_DEAD },
      { kind: 'stain', room: 'corridor-w', x: -51.3, z: -20.3, w: .5, d: 1.3, col: DRIED },
      { kind: 'stain', room: 'corridor-w', x: -50.6, z: -25.6, w: .5, d: .5, col: DRIED },
      { kind: 'shoes', room: 'corridor-w', x: -51.5, z: -39.4, deg: 90, w: .6, v: 2, col: '#3b3f46' },
      { kind: 'shoes', room: 'corridor-w', x: -51.55, z: -32.4, deg: 80, w: .6, v: 2, col: '#6a5a4c' },
      { kind: 'shoes', room: 'corridor-w', x: -50.6, z: -35.9, deg: 20, col: '#8a3a3a' },
      { kind: 'litter', room: 'corridor-w', x: -51.0, z: -29.0, w: 1.2, d: 1.6, v: 3 },
      { kind: 'litter', room: 'corridor-w', x: -51.0, z: -18.0, w: 1.2, d: 1.2, v: 2 },
      { kind: 'ceiling-light', room: 'corridor-w', x: -51, z: -38.5, deg: 90, col: '#dcefe2' },
      { kind: 'ceiling-light', room: 'corridor-w', x: -51, z: -28.0, deg: 90, col: '#dcefe2' },
      { kind: 'ceiling-light', room: 'corridor-w', x: -51, z: -19.0, deg: 90, col: '#dcefe2' },
      { kind: 'exit-sign', room: 'corridor-w', wall: 'e', at: -28 },
      { kind: 'extinguisher', room: 'corridor-w', wall: 'e', at: -24.2 },
      { kind: 'extinguisher', room: 'corridor-w', wall: 'w', at: -30.5, v: 1, off: .15 },
      // The arms' corridors: washing, shoes left at the units' doors.
      { kind: 'stacks-laundry-c', room: 'corridor-n', x: -48.6, z: -35, deg: 90 },
      { kind: 'stacks-laundry-a', room: 'corridor-n', x: -41.2, z: -35, deg: 90 },
      { kind: 'shoes', room: 'corridor-n', x: -47.5, z: -35.6, w: .8, v: 3, col: '#5a4a3c' },
      { kind: 'shoes', room: 'corridor-n', x: -42.4, z: -35.55, w: .5, v: 1, col: '#c8c4bc' },
      { kind: 'ceiling-light', room: 'corridor-n', x: -45, z: -35, col: '#dcefe2' },
      { kind: 'litter', room: 'corridor-n', x: -44.2, z: -34.9, w: 1.4, d: .8, v: 2 },
      { kind: 'stacks-laundry-b', room: 'corridor-s', x: -41.4, z: -21, deg: 90 },
      { kind: 'ceiling-light', room: 'corridor-s', x: -45, z: -21, col: '#dcefe2' },
      { kind: 'litter', room: 'corridor-s', x: -48.4, z: -21.1, w: 1.2, d: .8, v: 2 },
      // Unit 1, the old couple: the home shrine (its candles still lit), their bed, tea
      // left on the low table among the cushions, a tidy kitchenette, the water jugs.
      { kind: 'stacks-shrine', room: 'unit-1', wall: 'w', at: -40.5 },
      { kind: 'stacks-double-bed', room: 'unit-1', wall: 'n', at: -57.4 },
      { kind: 'stacks-wardrobe', room: 'unit-1', wall: 'n', at: -53.0 },
      { kind: 'stacks-low-table', room: 'unit-1', x: -56.5, z: -38.9 },
      { kind: 'stacks-cushions', room: 'unit-1', x: -56.5, z: -38.9 },
      { kind: 'stacks-kitchenette-a', room: 'unit-1', wall: 's', at: -53.0 },
      { kind: 'stacks-jugs', room: 'unit-1', wall: 'w', at: -37.9 },
      { kind: 'shoes', room: 'unit-1', x: -53.0, z: -41.9, deg: 90, w: .5, v: 1, col: '#6a4a3a' },
      { kind: 'ceiling-light', room: 'unit-1', x: -56.2, z: -40.5, col: '#ffe6c4' },
      { kind: 'outlet', room: 'unit-1', wall: 's', at: -55.4 },
      { kind: 'stacks-calendar', room: 'unit-1', wall: 'e', at: -42.6 },
      { kind: 'stacks-rug-a', room: 'unit-1', x: -56.4, z: -38.9 },
      { kind: 'stacks-herb-pots', room: 'unit-1', x: -55.2, z: -43.4 },
      { kind: 'stacks-coat-hooks', room: 'unit-1', wall: 'e', at: -38.3 },
      // Unit 2, the family: the children's bunk and toys, the pot still steaming on the
      // lit ring, the table with its stools, a clothes horse.
      { kind: 'stacks-bunk', room: 'unit-2', wall: 'w', at: -35.6, deg: 90 },
      { kind: 'stacks-kitchenette-b', room: 'unit-2', wall: 'n', at: -53.0 },
      { kind: 'stacks-jugs-b', room: 'unit-2', wall: 'n', at: -54.2 },
      { kind: 'stacks-family-table', room: 'unit-2', wall: 's', at: -56.5 },
      { kind: 'stacks-drying-rack', room: 'unit-2', wall: 's', at: -53.0 },
      { kind: 'stacks-toys', room: 'unit-2', x: -57.4, z: -32.6 },
      { kind: 'shoes', room: 'unit-2', x: -53.0, z: -34.9, deg: 90, w: .8, v: 3, col: '#c84a4a' },
      { kind: 'ceiling-light', room: 'unit-2', x: -56.2, z: -33.5, col: '#ffe6c4' },
      { kind: 'wall-screen', room: 'unit-2', wall: 's', at: -58.6, v: 4, col: GREEN, w: .7 },
      { kind: 'stacks-poster-b', room: 'unit-2', wall: 'e', at: -31.3 },
      { kind: 'stacks-rug-b', room: 'unit-2', x: -56.8, z: -33.0 },
      { kind: 'stacks-futon', room: 'unit-2', x: -55.3, z: -35.75, deg: 90 },
      { kind: 'stacks-school-bags', room: 'unit-2', x: -58.2, z: -31.3, deg: 20 },
      // Unit 3, the coder's, its door kicked in: the desk of screens still scrolling, the
      // rack blinking, cables tangled, the futon, everything pulled out and thrown down.
      { kind: 'stacks-pc-desk', room: 'unit-3', wall: 'w', at: -26.5 },
      { kind: 'stacks-server-rack', room: 'unit-3', wall: 'n', at: -58.9 },
      { kind: 'stacks-tangle', room: 'unit-3', x: -57.9, z: -28.2 },
      { kind: 'stacks-futon', room: 'unit-3', x: -58.6, z: -24.3, deg: 90 },
      { kind: 'stacks-ransacked', room: 'unit-3', x: -55.6, z: -24.6 },
      { kind: 'stacks-kicked-door', room: 'unit-3', x: -53.45, z: -26.9, deg: 80 },
      { kind: 'tipped-chair', room: 'unit-3', x: -58.3, z: -26.1, deg: 100, col: '#2e3138' },
      { kind: 'stacks-noodle-cups', room: 'unit-3', x: -57.2, z: -29.3 },
      { kind: 'stacks-poster-a', room: 'unit-3', wall: 's', at: -57.4 },
      { kind: 'stacks-parts-crates', room: 'unit-3', wall: 's', at: -53.2 },
      { kind: 'ceiling-light', room: 'unit-3', x: -56.2, z: -26.5, col: '#e8f0ff' },
      // Unit 4, the old man's: the TV of static in front of his armchair, the bed frame
      // stripped (its mattress is in the corridor), his kitchenette, the drag marks out.
      { kind: 'stacks-bed-frame', room: 'unit-4', wall: 'w', at: -21.5, deg: 90 },
      { kind: 'stacks-tv', room: 'unit-4', wall: 's', at: -56.0 },
      { kind: 'stacks-armchair', room: 'unit-4', x: -56.0, z: -17.61, deg: 180 },
      { kind: 'stacks-kitchenette-c', room: 'unit-4', wall: 'n', at: -53.0 },
      { kind: 'stacks-jugs', room: 'unit-4', wall: 's', at: -52.6 },
      { kind: 'stain', room: 'unit-4', x: -55.4, z: -20.4, w: 1.6, d: .5, col: DRIED },
      { kind: 'shoes', room: 'unit-4', x: -58.3, z: -19.9, deg: 90, w: .3, v: 1, col: '#5a4a3c' },
      { kind: 'stacks-calendar', room: 'unit-4', wall: 'n', at: -55.6 },
      { kind: 'stacks-wardrobe', room: 'unit-4', wall: 'n', at: -58.3 },
      { kind: 'stacks-rug-a', room: 'unit-4', x: -56.0, z: -18.9, deg: 90 },
      { kind: 'ceiling-light', room: 'unit-4', x: -56.2, z: -19.6, col: '#ffe6c4' },
      // Unit 5, the seamstress: her machine and lamp, bundles of piece-work, the rail of
      // finished garments, her pallet bed.
      { kind: 'stacks-sewing-table', room: 'unit-5', wall: 'w', at: -42.5 },
      { kind: 'stacks-bundles', room: 'unit-5', wall: 'n', at: -48.9 },
      { kind: 'stacks-cloth-rack', room: 'unit-5', wall: 'e', at: -43.1 },
      { kind: 'stacks-pallet-bed', room: 'unit-5', wall: 'e', at: -39.5, deg: 90 },
      { kind: 'stacks-jugs', room: 'unit-5', wall: 'w', at: -37.0 },
      { kind: 'stacks-cloth-bolts', room: 'unit-5', x: -48.6, z: -39.0, deg: 10 },
      { kind: 'litter', room: 'unit-5', x: -48.3, z: -41.0, w: 1.0, d: 1.0, v: 3 },
      { kind: 'ceiling-light', room: 'unit-5', x: -47.5, z: -40.2, deg: 90, col: '#ffe6c4' },
      // Unit 6, the delivery rider: the loft bed over a desk, batteries charging, the
      // delivery box by the door, noodle cups.
      { kind: 'stacks-loft-bed', room: 'unit-6', wall: 'w', at: -42.8, deg: 90 },
      { kind: 'stacks-battery-shelf', room: 'unit-6', wall: 'e', at: -43.4 },
      { kind: 'stacks-delivery-box', room: 'unit-6', wall: 'e', at: -36.45 },
      { kind: 'stacks-noodle-cups', room: 'unit-6', x: -43.9, z: -40.3 },
      { kind: 'stacks-poster-a', room: 'unit-6', wall: 'n', at: -41.5 },
      { kind: 'stacks-ebike', room: 'unit-6', wall: 'w', at: -38.6 },
      { kind: 'cable-run', room: 'unit-6', x: -41.2, z: -41.5, deg: 90, w: 2 },
      { kind: 'wall-screen', room: 'unit-6', wall: 'e', at: -39.6, v: 0, col: PINK, w: .7 },
      { kind: 'ceiling-light', room: 'unit-6', x: -42.5, z: -40.2, deg: 90, col: '#e8f0ff' },
      // The shared washroom: two squat stalls (one door gone), the trough of taps, the
      // shower, a bucket tipped and the mop down in a puddle.
      { kind: 'stacks-stall', room: 'washroom', wall: 's', at: -45.7 },
      { kind: 'stacks-stall-b', room: 'washroom', wall: 's', at: -46.7 },
      { kind: 'stacks-shower', room: 'washroom', wall: 's', at: -49.35 },
      { kind: 'stacks-trough', room: 'washroom', wall: 'w', at: -18.4 },
      { kind: 'stacks-tipped-bucket', room: 'washroom', x: -47.9, z: -18.2 },
      { kind: 'ceiling-panel', room: 'washroom', x: -47.5, z: -18.3, col: COLD },
      // The mail nook: the battered lockers, parcels, the notice board, a bike.
      { kind: 'stacks-mail-lockers', room: 'mail-nook', wall: 's', at: -42.5 },
      { kind: 'stacks-parcels', room: 'mail-nook', wall: 'e', at: -17.0 },
      { kind: 'stacks-bike', room: 'mail-nook', wall: 'w', at: -17.06 },
      { kind: 'stacks-noticeboard', room: 'mail-nook', wall: 'e', at: -18.8 },
      { kind: 'litter', room: 'mail-nook', x: -42.6, z: -17.6, w: 1.4, d: .8, v: 3 },
      { kind: 'ceiling-panel', room: 'mail-nook', x: -42.5, z: -18.0, col: '#e8f0ff' },
    ],

    // ------------------------------------------------------------------ Tenement A (row 2)
    'tenement-a': [
      F('lobby', 'checker', '#8a8478', '#6e6a60', .6), F('supers-office', 'plain', '#6a6660'), F('laundry', 'tiles', '#8e9290', '#767a78', .4), F('back-corridor', 'concrete', '#6a6864', '#58565a'),
      // Lobby: the wall of mail slots with parcels piled beneath, the lift closed and
      // lit, the super's caged hatch, a bench and a pram left by it, wet footprints in from
      // the street, a dropped bag of fruit.
      { kind: 'tena-mail-slots', room: 'lobby', wall: 'n', at: -44.0 },
      { kind: 'tena-parcels', room: 'lobby', wall: 'n', at: -41.9 },
      { kind: 'tena-lift', room: 'lobby', wall: 'n', at: -48.6 },
      { kind: 'tena-cage-hatch', room: 'lobby', wall: 'w', at: -50.5 },
      { kind: 'tena-bench', room: 'lobby', wall: 's', at: -46.5 },
      { kind: 'tena-pram', room: 'lobby', x: -45.35, z: -45.2 },
      { kind: 'tena-noticecase', room: 'lobby', wall: 'e', at: -46.8 },
      { kind: 'tena-vending', room: 'lobby', wall: 'e', at: -55.0 },
      { kind: 'potted-plant', room: 'lobby', wall: 's', at: -36.5 },
      { kind: 'potted-plant', room: 'lobby', wall: 'n', at: -51.4 },
      { kind: 'tena-umbrella', room: 'lobby', x: -37.5, z: -50.3, deg: 20 },
      { kind: 'tena-wet-prints', room: 'lobby', x: -38.9, z: -52.1 },
      { kind: 'tena-shopping-spill', room: 'lobby', x: -41.2, z: -48.4, deg: 30 },
      { kind: 'litter', room: 'lobby', x: -43.4, z: -54.6, w: 2.0, d: .8, v: 3 },
      { kind: 'ceiling-panel', room: 'lobby', x: -47.5, z: -50.0, col: '#fff0dc' },
      { kind: 'ceiling-panel', room: 'lobby', x: -40.5, z: -50.0, col: '#fff0dc' },
      { kind: 'exit-sign', room: 'lobby', wall: 'e', at: -52.0 },
      { kind: 'extinguisher', room: 'lobby', wall: 'w', at: -45.2 },
      // The super's office: the cage gate open, the key board with keys missing (two on the
      // floor), his radio still on and the camera feeds, a filing drawer out, tools, a ladder.
      { kind: 'tena-cage-gate', room: 'supers-office', wall: 'e', at: -55.1 },
      { kind: 'tena-key-board', room: 'supers-office', wall: 'n', at: -54.2 },
      { kind: 'tena-super-desk', room: 'supers-office', wall: 'n', at: -57.5 },
      { kind: 'office-chair', room: 'supers-office', x: -57.5, z: -54.66, deg: 170 },
      { kind: 'tena-filing', room: 'supers-office', wall: 'n', at: -58.45 },
      { kind: 'tena-tool-board', room: 'supers-office', wall: 's', at: -60.5 },
      { kind: 'tena-workbench', room: 'supers-office', wall: 's', at: -60.5 },
      { kind: 'tena-ladder', room: 'supers-office', wall: 'w', at: -52.6 },
      { kind: 'tena-paint-tins', room: 'supers-office', x: -62.7, z: -54.6, deg: 30 },
      { kind: 'ceiling-light', room: 'supers-office', x: -58.5, z: -53.5, col: '#fff0dc' },
      // The laundry: five old top-loaders (one left open, its wet washing spilled out),
      // stacked dryers, the tub, the folding counter, detergents, washing on the lines.
      ...[-63.45, -62.75, -62.05, -61.35, -60.65].map((at, i) => ({ kind: i === 2 ? 'tena-washer-open' : 'tena-washer', room: 'laundry', wall: 'n', at })),
      { kind: 'tena-wet-spill', room: 'laundry', x: -62.0, z: -49.55, deg: 10 },
      { kind: 'tena-dryers', room: 'laundry', wall: 'w', at: -49.6 },
      { kind: 'tena-tub', room: 'laundry', wall: 'n', at: -59.95 },
      { kind: 'tena-detergent', room: 'laundry', wall: 's', at: -63.2 },
      { kind: 'tena-fold-counter', room: 'laundry', wall: 's', at: -61.55 },
      { kind: 'tena-drying-rack', room: 'laundry', wall: 's', at: -55.0 },
      { kind: 'tena-line-long', room: 'laundry', x: -57.0, z: -47.4 },
      { kind: 'ceiling-light', room: 'laundry', x: -61.0, z: -47.5, deg: 90, col: '#e8f0ff' },
      { kind: 'ceiling-light', room: 'laundry', x: -55.0, z: -47.5, deg: 90, col: '#e8f0ff' },
      // The back corridor: bikes chained up, bin bags, the meters, a fuse box sparking,
      // someone's boxes packed to leave.
      { kind: 'tena-bike-rack', room: 'back-corridor', wall: 'w', at: -42.8 },
      { kind: 'tena-bin-bags', room: 'back-corridor', wall: 'w', at: -34.9 },
      { kind: 'tena-meters', room: 'back-corridor', wall: 'w', at: -38.6 },
      { kind: 'tena-fuse-spark', room: 'back-corridor', wall: 'e', at: -42.6 },
      { kind: 'tena-moving-boxes', room: 'back-corridor', wall: 'e', at: -41.3 },
      { kind: 'ceiling-light', room: 'back-corridor', x: -38, z: -39, deg: 90, col: '#dcefe2' },
      { kind: 'litter', room: 'back-corridor', x: -37.8, z: -36.4, w: 1.2, d: 1.2, v: 2 },
    ],

    // ------------------------------------------------------------------ Tenement B (row 3)
    'tenement-b': [
      F('shop', 'checker', '#c8c0b0', '#8a3a36', .5), F('kitchen', 'tiles', '#8a8a84', '#6e6e68', .3), F('shrine', 'planks', '#5a3a2c'), F('back-hall', 'concrete', '#6a6864'),
      // The dumpling shop: the counter's warm case of steamer baskets, the till open, two
      // tables with plates half eaten (tea spilled, a stool down), the pictogram menu, lanterns.
      { kind: 'tenb-counter', room: 'shop', wall: 'n', at: -42.8 },
      { kind: 'tenb-cooler', room: 'shop', wall: 'n', at: -40.8 },
      { kind: 'tenb-menu', room: 'shop', wall: 'n', at: -42.8 },
      { kind: 'tenb-table-a', room: 'shop', x: -44.6, z: -11.5 },
      { kind: 'tenb-table-b', room: 'shop', x: -38.6, z: -11.5 },
      { kind: 'tenb-lanterns', room: 'shop', x: -41.0, z: -13.2 },
      { kind: 'phone', room: 'shop', x: -40.2, z: -12.9, deg: 30 },
      { kind: 'litter', room: 'shop', x: -42.0, z: -13.6, w: 1.4, d: 1.0, v: 2 },
      { kind: 'ceiling-light', room: 'shop', x: -42.8, z: -14.2, col: '#ffe0b8' },
      { kind: 'ceiling-light', room: 'shop', x: -39.0, z: -12.6, col: '#ffe0b8' },
      // The kitchen: the range's baskets still steaming, dough on the floured board with
      // the dumplings half made, the sink of bowls, flour sacks, shelving, the fridge.
      { kind: 'tenb-range', room: 'kitchen', wall: 'n', at: -50.0 },
      { kind: 'tenb-sink', room: 'kitchen', wall: 'n', at: -51.5 },
      { kind: 'tenb-shelf', room: 'kitchen', wall: 'n', at: -47.0 },
      { kind: 'tenb-dough-bench', room: 'kitchen', wall: 's', at: -50.2 },
      { kind: 'tenb-flour', room: 'kitchen', wall: 's', at: -51.55 },
      { kind: 'tenb-fridge', room: 'kitchen', wall: 's', at: -47.0 },
      { kind: 'stain', room: 'kitchen', x: -50.6, z: -12.3, w: .8, d: .6, col: '#d8d4c8' },
      { kind: 'ceiling-light', room: 'kitchen', x: -50.0, z: -13.25, col: '#e8f0ff' },
      // The shrine room behind its bead curtain: the altar (candles lit, incense burnt to
      // stubs, fruit offered), the urn, cushions, lanterns, the family photographs, and the
      // bowl dropped on the floor.
      { kind: 'tenb-bead-curtain', room: 'shrine', wall: 'e', at: -13.25 },
      { kind: 'tenb-altar', room: 'shrine', wall: 'w', at: -13.25 },
      { kind: 'tenb-offerings', room: 'shrine', wall: 'w', at: -14.8 },
      { kind: 'tenb-incense-urn', room: 'shrine', x: -58.4, z: -13.25 },
      { kind: 'tenb-cushions', room: 'shrine', x: -57.5, z: -12.2, deg: 90 },
      { kind: 'tenb-dropped-bowl', room: 'shrine', x: -56.6, z: -11.6, deg: 40 },
      { kind: 'tenb-lanterns', room: 'shrine', x: -56.6, z: -13.25, deg: 90 },
      { kind: 'tenb-photos', room: 'shrine', wall: 'n', at: -56.6 },
      { kind: 'ceiling-panel', room: 'shrine', x: -57.2, z: -13.25, col: '#ff8a70' },
      // The back hall: gas bottles caged, cabbages, baskets drying, the mop.
      { kind: 'tenb-gas-cage', room: 'back-hall', wall: 'w', at: -19.0 },
      { kind: 'tenb-cabbages', room: 'back-hall', wall: 'e', at: -19.3 },
      { kind: 'tenb-basket-rack', room: 'back-hall', wall: 'e', at: -17.9 },
      { kind: 'tenb-mop', room: 'back-hall', wall: 'w', at: -17.9 },
      { kind: 'ceiling-light', room: 'back-hall', x: -38, z: -19, deg: 90, col: '#dcefe2' },
    ],

    // ------------------------------------------------------------------ the Night Market's hall (row 4)
    'market-hall': [
      F('hall', 'concrete', '#5e5c56', '#4c4a45'), F('cold-room', 'grate', '#a8b4b8', '#7a8684', .15), F('office', 'planks', '#5a4a3c'),
      // The stall rows: produce, fruit, dry goods, the meat rail, the fish on melting ice
      // along the back; the noodle and herb stalls and the skewer cart (its coals still
      // glowing) in the middle row; crates and gas bottles; bulb strings overhead; a
      // crate of produce dropped in the aisle as they ran.
      { kind: 'market-veg-stall', room: 'hall', wall: 'n', at: -22.79 },
      { kind: 'market-fruit-stall', room: 'hall', wall: 'n', at: -20.79 },
      { kind: 'market-dry-stall', room: 'hall', wall: 'n', at: -18.79 },
      { kind: 'market-meat-stall', room: 'hall', wall: 'n', at: -16.79 },
      { kind: 'market-fish-stall', room: 'hall', wall: 'n', at: -14.79 },
      { kind: 'market-crates', room: 'hall', wall: 'n', at: -13.38 },
      { kind: 'market-gas-bottles', room: 'hall', wall: 'n', at: -12.58 },
      { kind: 'market-noodle-stall', room: 'hall', x: -20.8, z: -49.89 },
      { kind: 'market-herb-stall', room: 'hall', x: -18.8, z: -49.89 },
      { kind: 'market-skewer-cart', room: 'hall', x: -11.5, z: -50.04 },
      { kind: 'market-crates', room: 'hall', x: -10.4, z: -50.09 },
      { kind: 'market-crates', room: 'hall', wall: 's', at: -23.39 },
      { kind: 'market-tofu-stall', room: 'hall', x: -20.5, z: -47.4 },
      { kind: 'market-sweets-stall', room: 'hall', x: -18.5, z: -47.4 },
      { kind: 'market-crates', room: 'hall', wall: 's', at: -17.0 },
      { kind: 'market-gas-bottles', room: 'hall', wall: 's', at: -11.5 },
      { kind: 'market-ice-bins', room: 'hall', wall: 'e', at: -47.5 },
      { kind: 'market-cold-slider', room: 'hall', wall: 'e', at: -51.75 },
      { kind: 'market-fog', room: 'hall', x: -7.6, z: -50.0 },
      { kind: 'market-produce-spill', room: 'hall', x: -15.6, z: -46.8, deg: 20 },
      { kind: 'market-bulbs-8', room: 'hall', x: -17.6, z: -51.1 },
      { kind: 'market-bulbs-8', room: 'hall', x: -14.4, z: -47.2 },
      { kind: 'market-bulbs-5', room: 'hall', x: -18.5, z: -44.3 },
      { kind: 'dropped-jacket', room: 'hall', x: -12.9, z: -45.4, deg: 60, col: '#4f5d4a' },
      { kind: 'phone', room: 'hall', x: -19.4, z: -46.2, deg: -20 },
      { kind: 'litter', room: 'hall', x: -20.5, z: -47.4, w: 2.0, d: 1.4, v: 4 },
      { kind: 'litter', room: 'hall', x: -9.6, z: -45.6, w: 1.6, d: 1.2, v: 3 },
      // The cold room, its slider run back and the fog pouring out: racks of boxed fish
      // and produce, the carcass rail, crates.
      { kind: 'market-cold-rack', room: 'cold-room', wall: 'e', at: -49.4 },
      { kind: 'market-carcass-rail', room: 'cold-room', wall: 'n', at: -3.1 },
      { kind: 'market-crates', room: 'cold-room', wall: 'e', at: -47.9 },
      { kind: 'market-fog', room: 'cold-room', x: -4.2, z: -50.0, deg: 90 },
      { kind: 'ceiling-panel', room: 'cold-room', x: -4.0, z: -50.0, col: COLD },
      // The back office: the desk with the cash box open and emptied, the cash bags thrown
      // down, ledgers, the camera feeds.
      { kind: 'market-desk', room: 'office', wall: 'n', at: -3.2 },
      { kind: 'office-chair', room: 'office', x: -3.2, z: -45.7, deg: 200 },
      { kind: 'market-ledgers', room: 'office', wall: 's', at: -2.7 },
      { kind: 'market-cctv', room: 'office', wall: 'e', at: -45.0 },
      { kind: 'market-cash-bags', room: 'office', x: -4.5, z: -44.3, deg: 30 },
      { kind: 'ceiling-panel', room: 'office', x: -4.0, z: -45.0, col: '#fff0dc' },
    ],

    // ------------------------------------------------------------------ the stall storage shed (row 5)
    'stall-shed': [
      F('storage', 'concrete', '#5c5a56'), F('sleeping-corner', 'planks', '#5a4a3a'),
      // Folded carts, gas bottles, the generator, stools stacked, tarps and poles.
      { kind: 'shed-folded-carts', room: 'storage', wall: 'n', at: -18.5 },
      { kind: 'shed-generator', room: 'storage', wall: 's', at: -18.2 },
      { kind: 'shed-gas-row', room: 'storage', wall: 's', at: -23.2 },
      { kind: 'shed-stool-stack', room: 'storage', wall: 'n', at: -23.5 },
      { kind: 'shed-tarps', room: 'storage', x: -22.9, z: -29.0, deg: 10 },
      { kind: 'shed-poles', room: 'storage', x: -20.5, z: -27.5, deg: 8 },
      { kind: 'shed-price-boards', room: 'storage', wall: 's', at: -19.3 },
      { kind: 'shed-cardboard', room: 'storage', x: -21.6, z: -26.4, deg: -15 },
      { kind: 'shed-bulb-coil', room: 'storage', x: -18.3, z: -28.3 },
      { kind: 'ceiling-light', room: 'storage', x: -20.5, z: -27.75, col: '#fff0dc' },
      // The sleeping corner behind its curtain: a cot (the phone on it still lit), a crate
      // table with a hot plate, a shelf of someone's things.
      { kind: 'shed-doorway-curtain', room: 'sleeping-corner', wall: 'w', at: -27.75 },
      { kind: 'shed-cot', room: 'sleeping-corner', wall: 'e', at: -27.75, deg: 90 },
      { kind: 'shed-crate-table', room: 'sleeping-corner', wall: 'e', at: -29.3 },
      { kind: 'shed-shelf', room: 'sleeping-corner', wall: 'n', at: -16.2 },
      { kind: 'shoes', room: 'sleeping-corner', x: -14.6, z: -26.2, w: .3, v: 1, col: '#3b3f46' },
      { kind: 'shed-clothes-line', room: 'sleeping-corner', x: -15.0, z: -28.9 },
      { kind: 'shed-basin', room: 'sleeping-corner', x: -15.6, z: -26.2, deg: 20 },
      { kind: 'ceiling-panel', room: 'sleeping-corner', x: -15.0, z: -27.75, col: '#ffe0b8' },
    ],

    // ------------------------------------------------------------------ the lock-up
    'lock-up': [
      F('corridor', 'concrete', '#5e5c58'), F('unit-a', 'concrete', '#56544f'), F('unit-b', 'concrete', '#5a5853'), F('unit-c', 'concrete', '#54524e'),
      // The corridor: its shutters, padlocks cut off and dropped, a hand truck down.
      { kind: 'lockup-cut-locks', room: 'corridor', x: -7.3, z: -27.2, deg: 20 },
      { kind: 'lockup-hand-truck', room: 'corridor', x: -6.6, z: -28.9, deg: -15 },
      { kind: 'lockup-tags', room: 'corridor', wall: 'w', at: -29.2 },
      { kind: 'litter', room: 'corridor', x: -7.0, z: -26.3, w: 1.2, d: .8, v: 2 },
      { kind: 'ceiling-light', room: 'corridor', x: -7, z: -27.75, deg: 90, col: '#dcefe2' },
      // Unit A, a scooter repairer's: scooters racked, batteries charging, parts drawers.
      { kind: 'lockup-shutter', room: 'unit-a', wall: 'e', at: -27.75 },
      { kind: 'lockup-scooters', room: 'unit-a', wall: 'w', at: -27.75 },
      { kind: 'lockup-battery-bench', room: 'unit-a', wall: 'n', at: -10.0 },
      { kind: 'lockup-parts-drawers', room: 'unit-a', wall: 's', at: -9.3 },
      { kind: 'cable-run', room: 'unit-a', x: -10.6, z: -28.5, deg: 30, w: 1.2 },
      { kind: 'ceiling-light', room: 'unit-a', x: -10.75, z: -27.75, col: '#e8f0ff' },
      // Unit B, a stock of knock-off trainers in their boxes, some torn open.
      { kind: 'lockup-shutter', room: 'unit-b', wall: 'w', at: -28.875, w: 1.8 },
      { kind: 'lockup-shoeboxes-a', room: 'unit-b', wall: 'e', at: -28.88 },
      { kind: 'lockup-shoeboxes-b', room: 'unit-b', wall: 'n', at: -3.3 },
      { kind: 'lockup-sneakers', room: 'unit-b', x: -4.3, z: -28.9, deg: 20 },
      { kind: 'ceiling-panel', room: 'unit-b', x: -3.75, z: -28.875, col: '#e8f0ff' },
      // Unit C, where someone had been sleeping: cardboard and a bag, the lantern still
      // on, tins, a water jug.
      { kind: 'lockup-sleeping-bag', room: 'unit-c', x: -3.35, z: -26.6, deg: 90 },
      { kind: 'lockup-lantern', room: 'unit-c', x: -2.5, z: -27.45 },
      { kind: 'lockup-tins', room: 'unit-c', x: -4.75, z: -27.3 },
      { kind: 'ceiling-panel', room: 'unit-c', x: -3.75, z: -26.6, col: '#ffe0b8', pool: false },
    ],

    // ------------------------------------------------------------------ the convenience store (row 6)
    convenience: [
      F('shop', 'tiles', '#b8bcc0', '#9a9ea4', .5), F('stockroom', 'concrete', '#63676d'), F('staff-toilet', 'checker', '#9ea3a7', '#7a8084', .3),
      // The shop floor: the fridges glowing along the east wall (one left open, bottles
      // rolled out), the aisle, the wall shelf and the ice-cream freezer, the counter with
      // its till open and the warmer still lit, the basket dropped mid-aisle.
      ...[-16.05, -15.25, -14.45, -13.65].map(at => ({ kind: at === -14.45 ? 'conv-fridge-open' : 'conv-fridge', room: 'shop', wall: 'e', at })),
      { kind: 'conv-back-shelf', room: 'shop', wall: 'e', at: -12.0 },
      { kind: 'conv-counter', room: 'shop', x: -19.5, z: -12.0, deg: -90 },
      { kind: 'conv-gondola', room: 'shop', x: -20.9, z: -15.8, deg: 90 },
      { kind: 'conv-wall-shelf', room: 'shop', wall: 'w', at: -12.0 },
      { kind: 'conv-freezer', room: 'shop', wall: 'w', at: -15.95 },
      { kind: 'conv-basket', room: 'shop', x: -21.4, z: -14.6, deg: 25 },
      { kind: 'conv-chime', room: 'shop', wall: 's', at: -21.9 },
      { kind: 'litter', room: 'shop', x: -21.2, z: -12.8, w: 1.2, d: .8, v: 2 },
      { kind: 'ceiling-light', room: 'shop', x: -21.0, z: -16.3, col: COLD },
      { kind: 'ceiling-light', room: 'shop', x: -21.0, z: -13.2, col: COLD },
      { kind: 'ceiling-light', room: 'shop', x: -21.0, z: -11.4, col: COLD, pool: false },
      // The stockroom: racks both sides, a box spilled.
      { kind: 'conv-stock-rack', room: 'stockroom', wall: 'w', at: -20.0 },
      { kind: 'conv-stock-rack', room: 'stockroom', wall: 'e', at: -20.0 },
      { kind: 'conv-box-spill', room: 'stockroom', x: -22.25, z: -20.0, deg: 15 },
      { kind: 'ceiling-light', room: 'stockroom', x: -22.25, z: -20, deg: 90, col: COLD },
      // The staff toilet.
      { kind: 'conv-wc', room: 'staff-toilet', wall: 'n', at: -20.08 },
      { kind: 'conv-basin', room: 'staff-toilet', wall: 'n', at: -19.125 },
      { kind: 'conv-toilet-rolls', room: 'staff-toilet', x: -19.5, z: -19.2 },
      { kind: 'ceiling-panel', room: 'staff-toilet', x: -19.25, z: -20.0, col: COLD },
    ],

    // ------------------------------------------------------------------ the noodle bar (row 7)
    'noodle-bar': [
      F('dining', 'planks', '#5a4232', '#4a3628'), F('kitchen', 'tiles', '#8a8a84', '#6e6e68', .3),
      // Counter and booths: bowls half eaten, chopsticks dropped, a bowl spilled on the
      // floor, the pass with orders still clipped, the lit menu of pictograms, lanterns.
      { kind: 'noodle-booth-a', room: 'dining', wall: 'w', at: -14.95 },
      { kind: 'noodle-booth-b', room: 'dining', wall: 'w', at: -13.35 },
      { kind: 'noodle-ledge', room: 'dining', wall: 'e', at: -13.95 },
      { kind: 'noodle-pass', room: 'dining', wall: 'n', at: -13.4 },
      { kind: 'noodle-menu', room: 'dining', wall: 'n', at: -13.7 },
      { kind: 'noodle-lanterns', room: 'dining', x: -15.25, z: -13.2, deg: 90 },
      { kind: 'noodle-spilled-bowl', room: 'dining', x: -15.7, z: -12.1, deg: 30 },
      { kind: 'dropped-jacket', room: 'dining', x: -14.4, z: -11.6, deg: -30, col: '#6a5a4c' },
      { kind: 'wall-screen', room: 'dining', wall: 's', at: -13.3, v: 0, col: PINK, w: .8 },
      { kind: 'ceiling-light', room: 'dining', x: -16.6, z: -13.25, deg: 90, col: '#ffe0b8' },
      // The kitchen: stock pots steaming, the wok burner's ring still lit with the wok on
      // the floor, the prep bench of noodle nests, the sink of bowls, the back door.
      { kind: 'noodle-range', room: 'kitchen', wall: 'w', at: -18.3 },
      { kind: 'noodle-wok-burner', room: 'kitchen', wall: 'w', at: -16.75 },
      { kind: 'noodle-floor-wok', room: 'kitchen', x: -15.9, z: -17.9, deg: 20 },
      { kind: 'noodle-prep', room: 'kitchen', wall: 'e', at: -20.24 },
      { kind: 'noodle-reachin', room: 'kitchen', wall: 'n', at: -13.3 },
      { kind: 'noodle-bins', room: 'kitchen', wall: 'e', at: -18.67 },
      { kind: 'noodle-sink', room: 'kitchen', wall: 'e', at: -17.35 },
      { kind: 'noodle-dry-store', room: 'kitchen', wall: 'n', at: -17.2 },
      { kind: 'noodle-mat', room: 'kitchen', x: -15.25, z: -21.2 },
      { kind: 'exit-sign', room: 'kitchen', wall: 'n', at: -15.25 },
      { kind: 'extinguisher', room: 'kitchen', wall: 'w', at: -20.9 },
      { kind: 'ceiling-light', room: 'kitchen', x: -15.25, z: -19.0, deg: 90, col: '#e8f0ff' },
    ],

    // ------------------------------------------------------------------ pawn and repair (row 9)
    pawn: [
      F('counter', 'tiles', '#6a6c70', '#55575b', .5), F('safe-room', 'plain', '#4e5054'), F('passage', 'plain', '#5a5c60'), F('workshop', 'concrete', '#5c5e62'),
      // The caged front counter and the rack of pledges behind it, the display case of
      // rings and watches, the TV stack (one set on static), guitars on the wall, a camera.
      { kind: 'pawn-caged-counter', room: 'counter', x: -11.3, z: -14.9 },
      { kind: 'pawn-back-rack', room: 'counter', x: -11.3, z: -15.64 },
      { kind: 'pawn-display-case', room: 'counter', x: -8.49, z: -13.8 },
      { kind: 'pawn-tv-stack', room: 'counter', x: -12.025, z: -14.1, deg: 90 },
      { kind: 'pawn-guitars', room: 'counter', x: -12.235, z: -12.6, deg: 90 },
      { kind: 'pawn-cctv-cam', room: 'counter', x: -8.43, z: -15.57, deg: -135 },
      { kind: 'litter', room: 'counter', x: -10.0, z: -13.0, w: 1.0, d: .8, v: 2 },
      { kind: 'ceiling-panel', room: 'counter', x: -10.3, z: -13.8, col: COLD },
      // The safe room: the safe open and empty, deposit drawers pulled and dumped.
      { kind: 'pawn-deposit-boxes', room: 'safe-room', wall: 'w', at: -17.93 },
      { kind: 'pawn-open-safe', room: 'safe-room', wall: 'w', at: -17.15 },
      { kind: 'pawn-dumped-drawers', room: 'safe-room', x: -11.1, z: -17.3, deg: 20 },
      { kind: 'ceiling-panel', room: 'safe-room', x: -11.25, z: -17.25, col: COLD },
      // The passage: the fuse panel and a camera.
      { kind: 'pawn-fuse-panel', room: 'passage', wall: 'e', at: -17.25 },
      { kind: 'ceiling-panel', room: 'passage', x: -9.0, z: -17.25, col: COLD, pool: false },
      // The workshop: the bench with its soldering iron still glowing over a gutted
      // laptop, the shelf of tagged repairs, cable coils.
      { kind: 'pawn-repair-bench', room: 'workshop', wall: 's', at: -11.29 },
      { kind: 'pawn-repair-shelf', room: 'workshop', wall: 'e', at: -20.9 },
      { kind: 'pawn-cable-coils', room: 'workshop', x: -11.6, z: -21.0, deg: 15 },
      { kind: 'extinguisher', room: 'workshop', wall: 'w', at: -20.2 },
      { kind: 'ceiling-light', room: 'workshop', x: -10.25, z: -20.25, col: COLD },
    ],

    // ------------------------------------------------------------------ the arcade and VR parlour (row 8)
    arcade: [
      F('cabinet-hall', 'carpet', '#2a2236', '#1a1422'), F('vr-corridor', 'carpet', '#1e1a2a', '#141018'),
      // The cabinet hall: cabinets still in attract mode to nobody, the claw machine, the
      // token changer and the tokens spilled from it, the prize wall.
      { kind: 'arcade-cab-a', room: 'cabinet-hall', x: -6.58, z: -18.39 },
      { kind: 'arcade-cab-c', room: 'cabinet-hall', x: -7.39, z: -18.39, deg: 90 },
      { kind: 'arcade-cab-d', room: 'cabinet-hall', x: -7.39, z: -17.585, deg: 90 },
      { kind: 'arcade-token-machine', room: 'cabinet-hall', ...onSlant([-8, -12.94], [-2, -16.2], [-5, -17], .95, .5) },
      { kind: 'arcade-claw', room: 'cabinet-hall', ...onSlant([-8, -12.94], [-2, -16.2], [-5, -17], 1.78, 1.0) },
      { kind: 'arcade-prize-wall', room: 'cabinet-hall', x: -3.2, z: -18.71 },
      { kind: 'arcade-tokens', room: 'cabinet-hall', x: -5.9, z: -15.6, deg: 20 },
      { kind: 'arcade-tokens', room: 'cabinet-hall', x: -3.4, z: -17.0, deg: -40 },
      { kind: 'floor-strip', room: 'cabinet-hall', x: -6.8, z: -17.2, deg: 90, w: 1.6, col: MAGENTA },
      { kind: 'arcade-carpet-glyphs', room: 'cabinet-hall', x: -4.9, z: -16.9 },
      { kind: 'arcade-carpet-glyphs', room: 'vr-corridor', x: -5.0, z: -20.5 },
      { kind: 'ceiling-panel', room: 'cabinet-hall', x: -5.0, z: -17.4, col: PINK },
      { kind: 'ceiling-panel', room: 'cabinet-hall', x: -4.4, z: -16.0, col: BLUE },
      // The VR corridor: three booths (one headset hanging on its cable, one dropped,
      // one booth's screen on static), the prize counter, tokens.
      { kind: 'vr-booth-a', room: 'vr-corridor', x: -7.0, z: -21.175 },
      { kind: 'vr-booth-b', room: 'vr-corridor', x: -7.0, z: -19.825 },
      { kind: 'vr-booth-c', room: 'vr-corridor', x: -3.0, z: -21.175, deg: 180 },
      { kind: 'arcade-prize-counter', room: 'vr-corridor', x: -2.51, z: -19.87, deg: -90 },
      { kind: 'arcade-tokens', room: 'vr-corridor', x: -5.2, z: -20.3, deg: 70 },
      { kind: 'floor-strip', room: 'vr-corridor', x: -5.0, z: -21.6, w: 2.0, col: MAGENTA },
      { kind: 'ceiling-panel', room: 'vr-corridor', x: -5.0, z: -20.5, col: MAGENTA },
    ],
  };
}

let district;
/** The north district's `{ INTERIORS, KINDS }` (building id -> pieces; data-made kinds), made once on first call. */
export function northDistrict() {
  return district ??= { INTERIORS: buildInteriors(), KINDS: buildKinds() };
}
