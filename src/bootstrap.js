import { installButtonTypography } from './ui/button-typography.js';
import { fitSvgWords, watchSvgWords } from './ui/svg-fit.js';
import { rememberWheel } from './ui/busy-screen.js';

const game=document.getElementById('game');
const loading=document.getElementById('loading-screen');
const paint=()=>new Promise(resolve=>requestAnimationFrame(resolve));
// (No minimum time on the loading screen, v0.999a, owner: gone as soon as the game is ready.)
const minimumSplash=Promise.resolve();
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const READY_WAIT=20000,FONT_WAIT=3000;

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
  console.error('Deadshift startup failed:',error);
  const message=document.getElementById('error-message');
  if(!message.textContent)message.textContent='The game could not finish loading. Reload the page to try again.';
  document.getElementById('error').classList.remove('hidden');
  void reveal();
 }
}
void boot();
