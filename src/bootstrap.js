import { installButtonTypography } from './button-typography.js';
import { createMenuNavigation } from './menu-navigation.js';
import { readTutorialComplete } from './tutorial-progress.js';

// Fit the menu before downloading/initializing the much heavier game module.
// Typography remains active even if WebGL startup cannot complete.
installButtonTypography(document.getElementById('game'));
const $=id=>document.getElementById(id);
const complete=readTutorialComplete();
$('tutorial-entry').hidden=complete;
$('tutorial-mode').hidden=false;
let page='home',pending=null;
function show(name){
 page=name;
 document.querySelectorAll('[data-page]').forEach(el=>el.hidden=el.dataset.page!==name);
 document.querySelector(`[data-page="${name}"] button:not(.menu-back):not([hidden])`)?.focus();
}
function back(){if(page!=='home')show(page==='maps'?'modes':'home');}
$('gamemodes').onclick=()=>show('modes');
$('practice-mode').onclick=()=>show('maps');
document.querySelectorAll('.menu-back').forEach(button=>button.onclick=back);
for(const id of ['tutorial-entry','tutorial-mode'])$(id).onclick=()=>{pending=id;};
for(const id of ['start','menu-settings'])$(id).onclick=()=>{pending=id;};
const navigate=createMenuNavigation();
const onKey=event=>navigate(event,$('intro'),()=>{pending=null;back();});
window.addEventListener('keydown',onKey);
void import('./main.js').then(()=>{
 window.removeEventListener('keydown',onKey);
 if(pending)$(pending).click();
});
