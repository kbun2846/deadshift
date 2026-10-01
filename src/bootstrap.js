import './polyfills.js'; // FIRST: fills in .at() / Object.hasOwn on older Safari before any game code runs
import { installButtonTypography } from './ui/button-typography.js';
import { fitSvgWords, watchSvgWords } from './ui/svg-fit.js';
import { rememberWheel } from './ui/busy-screen.js';
import { migrateGameStorage } from './storage-migration.js';

window.__deadstabStarted=true; // index.html's watchdog: the game's code did load and run
const game=document.getElementById('game');
const loading=document.getElementById('loading-screen');
const paint=()=>new Promise(resolve=>requestAnimationFrame(resolve));
// (No minimum time on the loading screen, v0.999a, owner: gone as soon as the game is ready.)
const minimumSplash=Promise.resolve();
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
// (The warm-up waits as long as shaders keep compiling, warm-up.js programsSettled; this is the last guard.)
const READY_WAIT=65000,FONT_WAIT=3000;

rememberWheel(loading);
// The game is live under the loading screen first (it can take focus and
// start drawing), and the screen goes only once a frame of it has been
// painted (v0.999a: a game opened straight from the menu showed the page's
// empty background for a moment before its first frame).
function uncover(){
 game.inert=false;
 document.body.classList.remove('loading');
}
async function reveal(){
 uncover();
 await paint();await paint();
 loading.classList.add('leaving');
 setTimeout(()=>loading.remove(),200);
}

async function boot(){
 // Paint the splash before world creation and shader setup occupy the main thread.
 await paint();await paint();
 try{
  fitSvgWords(loading);
  // (v0.999a, owner, on a MacBook: the game stayed on the loading screen for
  // good, its menu dead underneath. Nothing here may wait for ever: the shader
  // warm-up is given READY_WAIT at most, the fonts FONT_WAIT; past them the
  // game opens and whatever is unfinished finishes as it is first drawn.)
  // (Saves under the game's old names carried across before anything reads them: storage-migration.js.)
  for(const kind of ['localStorage','sessionStorage']){try{migrateGameStorage(globalThis[kind]);}catch{}}
  const [app]=await Promise.all([import('./main.js'),minimumSplash]);
  await Promise.race([app.ready,wait(READY_WAIT)]);
  await Promise.race([document.fonts.ready,wait(FONT_WAIT)]);
  fitSvgWords(document);watchSvgWords();
  installButtonTypography(game);
  await paint();
  uncover();
  app.finishLoading();
  await reveal();
 }catch(error){
  console.error('Deadstab startup failed:',error);
  // (2026-09-30, owner: on an older MacBook this used to fail silently and
  // leave a dead menu on screen. Now it always says so, on top of everything.)
  window.__deadstabStartupFailed?.(error);
  void reveal();
 }
}
void boot();
