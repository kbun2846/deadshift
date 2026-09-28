// Renders each weapon's menu picture (weapon-photos.js: one shared studio,
// photo-only detail on the game's low-poly models) and writes them as WebP with transparency to src/assets/weapons/, which
// the game ships as images. Run with the dev server up:
//   node tools/capture-weapons.mjs [omen ...]   (omitted: every weapon)
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WEAPON_IDS } from '../src/items.js';

const ids=process.argv.slice(2).length?process.argv.slice(2):WEAPON_IDS;
if(ids.some(id=>!WEAPON_IDS.includes(id)))throw new Error('Unknown weapon id');
const browser = await chromium.launch({ ...(process.env.CHROMIUM_CHANNEL?{channel:process.env.CHROMIUM_CHANNEL}:{}), args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
await page.goto(`http://127.0.0.1:${process.env.PORT||5173}/`);
const shots = await page.evaluate(async ids => {
 const { weaponPhoto } = await import('/src/weapons/weapon-photos.js');
 return Object.fromEntries(ids.map(id=>[id,weaponPhoto(id)]));
},ids);
await browser.close();
mkdirSync('src/assets/weapons', { recursive: true });
for (const [id, url] of Object.entries(shots)) {
 const png = join(tmpdir(),`weapon-${id}.png`);
 writeFileSync(png, Buffer.from(url.split(',')[1], 'base64'));
 // 600 x 720 rendered; shipped at 400 x 480 (the weapon card at 2x), WebP with alpha.
 execFileSync(process.env.PYTHON||(process.platform==='win32'?'python':'python3'), ['-c', `
import sys
from PIL import Image
im = Image.open(sys.argv[1]).convert('RGBA').resize((400, 480), Image.LANCZOS)
im.save(sys.argv[2], 'WEBP', quality=86, method=6)
`,png,join('src/assets/weapons',id+'.webp')]);
 console.log('wrote src/assets/weapons/' + id + '.webp');
}
