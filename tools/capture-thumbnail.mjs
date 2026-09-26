// Photographs a map's menu card picture in Extreme (ambient occlusion, bloom,
// grade, weathered surfaces, dense detail) and writes it as a WebP the game
// ships as an image (src/assets/thumbnails/<map>.webp). Run with the dev
// server up:  node tools/capture-thumbnail.mjs [mapId]
// It uses the map's `thumbnail: { x, z, height }` spot (the same framing the
// card always had) at 3x the card's size, supersampled down.
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

const mapId = process.argv[2] || 'deadwater';
const [W, H, DPR] = [460, 570, 3];
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: DPR });
await page.addInitScript(() => localStorage.setItem('deadshift-settings', JSON.stringify({ quality: 'extreme', fps: 1, motion: false })));
await page.goto(`http://127.0.0.1:${process.env.PORT || 5173}/?play=1&map=${mapId}&weapon=rifle&capture=thumbnail`);
await page.waitForFunction(() => window.__capture && document.body.classList.contains('playing'), null, { timeout: 60000 });
// Extreme's passes load and the shadows settle over a few frames.
await page.waitForFunction(() => !!window.__capture.view.post, null, { timeout: 60000 });
await page.waitForTimeout(10000);
// One synchronous pose-draw-read, between the game's own frames: the camera
// on the card's spot, nothing that moves or flashes, then the canvas as is.
if (process.env.NOPOST) await page.evaluate(() => { window.__noPost = true; });
if (process.env.NOAO) await page.evaluate(() => { window.__noAO = true; });
if (process.env.NOBLOOM) await page.evaluate(() => { window.__noBloom = true; });
const dataUrl = await page.evaluate(() => {
 const { view, sim, map } = window.__capture, shot = map.thumbnail || map.card?.thumbnail || map.spawn; // (s3-look: a card's spot)
 sim.dev = { ...sim.dev, ghost: true };
 view.setPickView({ x: shot.x, z: shot.z, height: shot.height || 44 });
 for (let i = 0; i < 3; i++) { view.sun.shadow.needsUpdate = true; view.update(sim, 1 / 60, false, 0, sim.player, 1); }
 // A vulture gliding over the scene, caught mid-frame, its shadow on the ground.
 const focus = { x: shot.x, z: shot.z };
 view.birds.clear?.();
 const vulture = map.birds === false ? null : view.birds.spawn('vulture', focus, view.birdView()); // (s3-look: no vulture where the map has no birds)
 // Put it over open ground up and left of centre (clear of the roof), let it
 // settle into a wing beat there, its shadow thrown by the sun.
 if (vulture) {
  vulture.x = shot.x - 7; vulture.z = shot.z - 7; vulture.y = 12.5;
  for (let i = 0; i < 20; i++) { view.birds.schedule?.reset?.(); view.birds.update(.001, focus, view.birdView()); }
  // Drifting dust thins out over the bird (the game clears it the same way
  // round the player), so it reads clearly.
  view.wispClear.player.value.set(vulture.x, vulture.z); view.wispClear.aim.value.set(vulture.x, vulture.z + 4);
 }
 const best = 0;
 window.__vulture = vulture ? { x: vulture.x, y: vulture.y, z: vulture.z, best } : null;
 for (const o of [view.player, view.motes, ...view.tumbleweeds, ...(view.fx?.meshes || []), ...(view.particlePool || [])]) if (o) o.visible = false;
 if (window.__noPost) { view.savedPost = view.post; view.post = null; }
 if (window.__noAO) view.post.ao.enabled = false;
 if (window.__noBloom) view.post.bloom.enabled = false;
 view.sun.shadow.needsUpdate = true; view.drawFrame();
 if (view.savedPost) view.post = view.savedPost;
 return view.renderer.domElement.toDataURL('image/png');
});
console.log('vulture', JSON.stringify(await page.evaluate(() => window.__vulture)));
mkdirSync('src/assets/thumbnails', { recursive: true });
const png = `/tmp/thumbnail-${mapId}.png`;
writeFileSync(png, Buffer.from(dataUrl.split(',')[1], 'base64'));
await browser.close();
// 920 x 1140 captured (Extreme's 2x); shipped at 690 x 855 (enough for a 3x phone), WebP.
execFileSync('python3', ['-c', `
from PIL import Image, ImageFilter
im = Image.open('${png}').convert('RGB').resize((690, 855), Image.LANCZOS)
im = im.filter(ImageFilter.UnsharpMask(radius=1.2, percent=35, threshold=2))
im.save('src/assets/thumbnails/${mapId}.webp', 'WEBP', quality=82, method=6)
`]);
console.log('wrote src/assets/thumbnails/' + mapId + '.webp');
