import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DEV_OPTIONS } from '../src/ui/dev-options.js';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('the title is the main menu home page, with the blood installed on it', () => {
 const html = read('../index.html'), main = read('../src/main.js');
 assert.match(html, /data-page="home" class="title-home"><p class="title-version game-version">/, 'version above the word');
 assert.match(html, /<svg class="title-word"[^>]*><text[^>]*>deadshift<\/text>/);
 for (const id of ['gamemodes', 'tutorial-entry', 'input-preference', 'menu-settings', 'title-dev']) assert.ok(html.includes(`id="${id}"`), id);
 assert.match(main, /installTitle\(\{page:/);
 assert.match(html, /<button id="title-dev"[^>]*>dev tools<\/button><\/div><svg class="title-blood"[^>]*><\/svg><\/div>/, 'the blood svg lives inside the home page, attached to it');
 assert.ok(!DEV_OPTIONS.some(o => o.key === 'titleScreen'), 'no longer a dev-only screen');
});

test('the dev tools link asks for the code until the tools are unlocked', () => {
 const main = read('../src/main.js');
 assert.match(main, /\$\('title-dev'\)\.onclick=\(\)=>\{if\(devTools\.isUnlocked\(\)\)devWindow\.toggle\(\);else\{devFromTitle=true;devDialog\.show\(\);\}\};/);
});

test('title blood: the game\'s colours, flat, clipped to the letters, bowls filled, buttons followed', () => {
 const src = read('../src/ui/title-screen.js');
 assert.match(src, /BLOOD = '#8c1c2a'/, 'the game\'s own blood colour (gore.js)');
 assert.doesNotMatch(src, /feSpecularLighting|feDiffuseLighting/, 'flat, no lighting');
 assert.match(src, /make\('g', \{ mask: 'url\(#title-ink\)' \}, svg\)/, 'the smear is cut to the letters grown a pixel (covers their soft rims)');
 assert.match(src, /getStartPositionOfChar\(i\)/, 'the copy of the letters is pinned glyph by glyph to the word (no drift from inherited spacing)');
 assert.match(read('../src/styles/menu-theme.css'), /#game \.title-word text\{letter-spacing:0;word-spacing:0\}/);
 assert.doesNotMatch(src, /this\.splats/, 'no splatters on the letters');
 assert.doesNotMatch(src, /this\.patches/, 'one red: no patches of other shades');
 assert.match(src, /this\.smear = make\('g', \{ filter: 'url\(#title-goo-fine\)'/, 'on the letters: just red then pale (no shadow on top), fine goo keeps the curvy edge');
 assert.match(src, /classList\.contains\('input-choice'\)/, 'the keyboard / mobile tab that sticks out counts as surface');
 assert.match(src, /switchPair\(i, rect\)/, 'switching keyboard / mobile is handled in place');
 assert.match(src, /this\.liquid = make\('g', \{ filter: 'url\(#title-goo\)', mask: 'url\(#title-holes\)'/, 'hanging blood is rimmed and shown only outside the letters (no lines inside them)');
 assert.match(src, /id: 'title-goo-flat'/, 'blood on and in the letters uses the plain goo');
 assert.doesNotMatch(src, /feSpecularLighting|feDiffuseLighting/);
 assert.match(src, /overlay\.style\.visibility = on \? '' : 'hidden'/, 'nothing left over other pages');
 assert.match(src, /mask: 'url\(#title-holes\)'/, 'bowls fill through the holes mask');
 assert.match(src, /Math\.min\(room,/, 'drips stop short of the buttons');
 assert.match(src, /getComputedStyle\(b\.el\)\.transform/, 'button blood follows the button');
});
