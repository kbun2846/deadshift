import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fitPlacement } from '../src/ui/menu-fit.js';
import { panelPlacement } from '../src/ui/weapon-grid.js';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

// Menus stay in place (owner, 2026-09-29): a page taller than the visible
// screen is scaled to fit and centred, never scrolled.
test('a menu page that fits is left alone; a taller one is scaled to fit and centred', () => {
 assert.deepEqual(fitPlacement(600, 640), { scale: 1, shift: 0 });
 assert.deepEqual(fitPlacement(640, 640), { scale: 1, shift: 0 });
 assert.deepEqual(fitPlacement(0, 640), { scale: 1, shift: 0 });
 for (const [natural, available] of [[966, 640], [1002, 374], [831, 640], [700, 699]]) {
  const { scale, shift } = fitPlacement(natural, available);
  assert.ok(scale < 1 && scale > 0);
  assert.ok(natural * scale <= available, `${natural} in ${available}`);
  assert.ok(available - natural * scale < 2, 'uses the height');
  assert.ok(Math.abs(shift - (available - natural * scale) / 2) < 1e-9);
 }
});

test('an open dropdown fits on the screen: capped under its bar, or opened upward', () => {
 assert.deepEqual(panelPlacement({ natural: 200, below: 400, above: 100 }), { up: false, max: null });
 // Little room below, more above: opens up, whole.
 assert.deepEqual(panelPlacement({ natural: 200, below: 80, above: 500 }), { up: true, max: null });
 // Neither fits it: the roomier side, capped to it.
 assert.deepEqual(panelPlacement({ natural: 300, below: 250, above: 100, chrome: 10 }), { up: false, max: 240 });
 assert.deepEqual(panelPlacement({ natural: 300, below: 90, above: 200, chrome: 10 }), { up: true, max: 190 });
 // In a page scaled to fit, screen px become the page's px.
 assert.deepEqual(panelPlacement({ natural: 300, below: 200, above: 50, scale: .8 }), { up: false, max: 250 });
});

test('the full-screen menus are the visible viewport, clipped, and fitted', () => {
 const css = read('../src/styles/menu-theme.css');
 const at = css.indexOf('#game .menu-shell,#game .lobby-screen{');
 assert.ok(at > 0);
 const rule = css.slice(at, css.indexOf('}', at));
 for (const part of ['height:100vh', 'height:100dvh', 'overflow:hidden', 'overflow:clip', 'overscroll-behavior:none']) assert.ok(rule.includes(part), part);
 assert.match(css, /#game \.menu-shell\{--pad-y:28px;--pad-x:28px;padding:max\(var\(--pad-y\),env\(safe-area-inset-top\)\)/);
 assert.match(css, /#game \.menu-fitted\{align-self:start;transform-origin:50% 0;transform:translateY\(var\(--fit-shift,0px\)\) scale\(var\(--fit-scale,1\)\)\}/);
 // The page itself never scrolls either (body fixed, as before).
 assert.match(css, /html,body\{height:100%;overflow:hidden;overscroll-behavior:none\}/);
 // Both full-screen menus install the fit.
 assert.match(read('../src/ui/menu.js'), /installMenuFit\(shell,/);
 assert.match(read('../src/ui/lobby-screen.js'), /installMenuFit\(root,/);
});
