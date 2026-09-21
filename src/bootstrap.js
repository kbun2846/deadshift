import { installButtonTypography } from './button-typography.js';

const game=document.getElementById('game');
const loading=document.getElementById('loading-screen');
const paint=()=>new Promise(resolve=>requestAnimationFrame(resolve));
const minimumSplash=new Promise(resolve=>setTimeout(resolve,500));

function reveal(){
 game.inert=false;
 document.body.classList.remove('loading');
 loading.remove();
}

async function boot(){
 // Paint the splash before world creation and shader setup occupy the main thread.
 await paint();await paint();
 try{
  const [app]=await Promise.all([import('./main.js'),minimumSplash]);
  await document.fonts.ready;
  installButtonTypography(game);
  await paint();
  reveal();
  app.finishLoading();
 }catch(error){
  console.error('Deadshift startup failed:',error);
  const message=document.getElementById('error-message');
  if(!message.textContent)message.textContent='The game could not finish loading. Reload the page to try again.';
  document.getElementById('error').classList.remove('hidden');
  reveal();
 }
}
void boot();
