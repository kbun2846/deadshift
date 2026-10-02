// The short main menu (owner, 2026-10-02: "Keep the main menu short: PLAY
// (quick play) big, everything else smaller ... make the play and quickplay
// buttons bigger, but keep the blood effects"): the sizes in menu-theme.css.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/styles/menu-theme.css', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const px = (re, text = css) => { const m = text.match(re); assert.ok(m, String(re)); return Number(m[1]); };

test('PLAY and QUICK PLAY are the big ones; the rest are about half their height but still 44 px to tap', () => {
 const big = px(/\.title-buttons>button\.title-big:not\(\.plain-text\)\{height:(\d+)px/);
 const minor = px(/#game #intro\{--title-minor-w:[\d.]+%;--title-minor-h:(\d+)px/);
 assert.equal(big, 58);
 assert.ok(minor <= big * .55, `secondary ${minor} px against ${big}`);
 const short = css.slice(css.indexOf('@media(max-height:520px){\n #game #intro{--title-minor-w'));
 const shortBig = px(/@media\(max-height:520px\)\{\n #game \.menu-shell \.title-buttons>button\.title-big:not\(\.plain-text\)\{height:(\d+)px/);
 const shortMinor = px(/--title-minor-h:(\d+)px/, short);
 assert.ok(shortMinor < shortBig && shortMinor >= 22, `short screens: ${shortMinor} under ${shortBig}`);
 // The secondary buttons' invisible tap area reaches 44 px whatever their face.
 assert.match(css, /\.title-buttons>button:not\(\.title-big\):not\(\.plain-text\)::after,#game \.menu-shell \.title-buttons>\.input-choice button::after\{content:'';position:absolute;left:0;right:0;top:calc\(\(var\(--title-minor-h\) - 44px\) \/ 2\);bottom:calc\(\(var\(--title-minor-h\) - 44px\) \/ 2\)\}/);
 // Narrower than the column (PLAY and QUICK PLAY keep its full width).
 const width = px(/--title-minor-w:(\d+)%/);
 assert.ok(width < 100 && width >= 60);
 // The blood is laid out from the buttons' boxes: the tap area is a pseudo
 // element, never part of the box (title-screen.js measures getBoundingClientRect).
 assert.doesNotMatch(css, /\.title-buttons>button:not\(\.title-big\)[^{]*\{[^}]*padding:[^0]/);
});

test('the title still has PLAY and QUICK PLAY first and big, then TUTORIAL, SKINS, keyboard / mobile, SETTINGS', () => {
 const buttons = html.slice(html.indexOf('<div class="title-buttons">'), html.indexOf('<svg class="title-blood"'));
 const ids = [...buttons.matchAll(/id="([^"]+)"/g)].map(m => m[1]);
 assert.deepEqual(ids, ['gamemodes', 'quick-play', 'tutorial-entry', 'title-skins', 'input-preference', 'input-keyboard', 'input-mobile', 'menu-settings']);
 assert.match(buttons, /id="gamemodes" class="primary title-play title-big"/);
 assert.match(buttons, /id="quick-play" class="primary title-play title-big"/);
});
