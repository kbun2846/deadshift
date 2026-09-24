// Renders each weapon's menu picture (weapon-photos.js: one shared studio,
// photo-only detail on the game's low-poly models) and writes them as WebP with transparency to src/assets/weapons/, which
// the game ships as images. Run with the dev server up:
//   node tools/capture-weapons.mjs
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
await page.goto('http://127.0.0.1:5173/');
const shots = await page.evaluate(async () => {
 const { weaponPhoto } = await import('/src/weapon-photos.js');
 return { static: weaponPhoto('static'), rifle: weaponPhoto('rifle'), shotgun: weaponPhoto('shotgun') };
});
await browser.close();
mkdirSync('src/assets/weapons', { recursive: true });
for (const [id, url] of Object.entries(shots)) {
 const png = `/tmp/weapon-${id}.png`;
 writeFileSync(png, Buffer.from(url.split(',')[1], 'base64'));
 // 600 x 720 rendered; shipped at 400 x 480 (the weapon card at 2x), WebP with alpha.
 execFileSync('python3', ['-c', `
from PIL import Image
im = Image.open('${png}').convert('RGBA').resize((400, 480), Image.LANCZOS)
im.save('src/assets/weapons/${id}.webp', 'WEBP', quality=86, method=6)
`]);
 console.log('wrote src/assets/weapons/' + id + '.webp');
}
