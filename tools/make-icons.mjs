// Renders the game's icon (public/favicon.svg: a pink tile with a blood
// splatter in its lower right corner, v0.990a) to the PNGs the page and its
// manifest use: favicon-32.png, icon-192.png, icon-512.png. Run after
// changing the SVG:  node tools/make-icons.mjs
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const svg = readFileSync('public/favicon.svg', 'utf8');
const browser = await chromium.launch();
for (const size of [32, 192, 512]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
  const out = size === 32 ? 'public/favicon-32.png' : `public/icon-${size}.png`;
  await page.screenshot({ path: out, omitBackground: true });
  await page.close();
  console.log('wrote ' + out);
}
await browser.close();
