// The death screen, the same in practice and online: the red wash, DEAD, who
// killed you (online), the respawn countdown with a bar running down, and the
// buttons for the mode:
//  practice        (solo) RESPAWN NOW, CHANGE WEAPON, RESTART, MAIN MENU
//  online          (ffa) CHANGE WEAPON, LOBBY, LEAVE MULTIPLAYER; the host's
//                  respawn wait counts down
//  online-practice RESPAWN, CHANGE WEAPON, LOBBY, LEAVE MULTIPLAYER; no wait
// How long the death plays before the screen comes up, and the respawn (both
// modes use the online match's 5 seconds, counted from the death).
// The screen waits for the camera to finish zooming onto the body
// (death-view.js DEATH_ZOOM), so the gore is seen first.
export const DEATH_MENU_DELAY=2.6;
export const RESPAWN_TIME=5;
const esc=text=>String(text??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function createDeathScreen(parent,{restart,menu,respawn,changeWeapon,lobby}){
 const root=document.createElement('section');root.id='death-screen';root.className='hidden';root.setAttribute('role','dialog');root.setAttribute('aria-modal','true');root.setAttribute('aria-labelledby','death-title');
 root.innerHTML=`<div class="death-card"><div class="death-wash" aria-hidden="true"><svg viewBox="0 0 1000 760" preserveAspectRatio="none">
 <path d="M184 274C153 255 138 236 145 222Q150 211 165 230L218 264C239 246 209 187 172 136Q151 109 167 106Q181 104 196 136C218 178 247 209 277 218C298 193 292 161 286 141C277 110 291 89 305 95C319 105 299 135 319 158C347 171 360 139 374 129C402 110 432 118 451 106Q470 94 471 55Q474 29 486 44L490 99C503 126 534 100 553 112C582 130 601 123 625 105Q656 78 665 47Q677 27 685 43C688 55 674 73 668 92C656 127 679 145 708 147C745 147 770 127 784 142C800 163 767 178 778 200C798 223 840 193 881 172Q907 160 910 173Q911 183 884 191C842 212 813 240 818 265C834 287 858 271 874 279C895 291 868 315 889 327L950 333Q974 337 965 348Q960 354 942 348L885 347C864 360 906 386 881 411C861 429 874 445 895 454Q931 469 924 481Q919 491 897 477C870 459 848 461 834 475C819 503 850 529 866 548Q879 568 866 574Q856 578 845 558C821 519 800 516 786 537C777 560 792 575 779 593C759 616 739 593 721 609C707 623 728 640 720 664C715 683 702 688 695 676C690 668 709 647 689 632C662 617 654 665 641 683Q631 698 623 686Q616 677 631 655C642 625 616 635 601 634C578 633 578 660 557 666C536 672 512 641 489 649Q477 661 481 707Q480 743 467 739Q457 736 460 715L460 677C452 646 425 641 402 651C373 665 353 642 336 618C313 598 290 620 281 640Q270 662 256 651Q247 644 267 619C287 588 269 565 243 568C217 571 206 593 181 591C164 588 164 575 180 573C214 568 223 540 206 521C184 503 154 528 128 532Q101 532 109 518L157 502C186 481 174 458 153 454Q125 451 96 465Q74 474 71 461Q70 450 97 447C133 437 133 411 148 398C126 376 92 362 57 357Q31 352 39 342Q42 335 65 345C116 360 145 354 155 339C150 312 166 292 184 274Z"/>
 <g class="death-satellite"><ellipse cx="126" cy="100" rx="8" ry="17" transform="rotate(-38 126 100)"/><ellipse cx="104" cy="75" rx="4" ry="8" transform="rotate(-38 104 75)"/><ellipse cx="222" cy="80" rx="5" ry="9"/><ellipse cx="444" cy="22" rx="4" ry="7"/><ellipse cx="716" cy="33" rx="6" ry="11" transform="rotate(38 716 33)"/><ellipse cx="897" cy="128" rx="12" ry="5" transform="rotate(-25 897 128)"/><circle cx="936" cy="114" r="4"/><ellipse cx="962" cy="236" rx="10" ry="6"/><ellipse cx="985" cy="375" rx="8" ry="4"/><ellipse cx="941" cy="554" rx="7" ry="12" transform="rotate(-35 941 554)"/><circle cx="925" cy="608" r="4"/><ellipse cx="786" cy="690" rx="7" ry="12"/><ellipse cx="723" cy="725" rx="5" ry="10"/><ellipse cx="351" cy="710" rx="6" ry="9"/><ellipse cx="228" cy="688" rx="6" ry="14" transform="rotate(30 228 688)"/><circle cx="90" cy="577" r="6"/><ellipse cx="60" cy="535" rx="11" ry="6"/><circle cx="31" cy="409" r="5"/><ellipse cx="75" cy="260" rx="7" ry="4"/></g>
 </svg></div><h2 id="death-title" aria-label="DEAD"><svg viewBox="0 0 360 100" preserveAspectRatio="none" aria-hidden="true"><text x="0" y="84" font-size="100" textLength="360" lengthAdjust="spacingAndGlyphs">DEAD</text></svg></h2><div class="death-actions"><p class="death-by" hidden></p><div class="death-respawn" role="timer" aria-live="off"><span class="death-respawn-label">respawn</span><span class="death-respawn-count">5</span><i class="death-respawn-bar" aria-hidden="true"><b></b></i></div><button id="death-respawn-now" data-modes="practice online-practice">RESPAWN NOW</button><button id="death-change-weapon">CHANGE WEAPON</button><button id="death-restart" data-modes="practice">RESTART</button><button id="death-lobby" data-modes="online online-practice">LOBBY</button><button id="death-menu">MAIN MENU</button></div></div>`;
 parent.append(root);
 const $=selector=>root.querySelector(selector);
 $('#death-respawn-now').onclick=()=>respawn?.();$('#death-change-weapon').onclick=()=>changeWeapon?.();
 $('#death-restart').onclick=restart;$('#death-lobby').onclick=()=>lobby?.();$('#death-menu').onclick=menu;
 let mode='practice';
 const api={root,
  get open(){return !root.classList.contains('hidden');},
  show(next='practice'){
   mode=next;root.dataset.mode=mode;
   for(const button of root.querySelectorAll('[data-modes]'))button.hidden=!button.dataset.modes.split(' ').includes(mode);
   $('#death-respawn-now').textContent=mode==='practice'?'RESPAWN NOW':'RESPAWN';
   $('#death-menu').textContent=mode==='practice'?'MAIN MENU':'LEAVE MULTIPLAYER';
   // Online practice has no wait: no countdown.
   $('.death-respawn').hidden=mode==='online-practice';
   root.classList.remove('hidden');root.querySelector('.death-actions button:not([hidden])')?.focus();
  },
  hide(){root.classList.add('hidden');api.setKiller(undefined);},
  // Online: "killed by NAME", or your own blast; undefined hides the line.
  // oneShot: "one shot by NAME" (from full health in one hit).
  setKiller(name,oneShot=false){
   const line=$('.death-by');line.hidden=name===undefined;
   line.innerHTML=name===undefined?'':name?`${oneShot?'one shot':'killed'} by <span class="death-killer">${esc(name)}</span>`:'you took yourself out';
  },
  // Seconds left of `total`; at zero it reads "now".
  setTimer(left,total=RESPAWN_TIME){
   const s=Math.max(0,left);$('.death-respawn-count').textContent=s>0?String(Math.ceil(s)):'now';
   $('.death-respawn-bar b').style.transform=`scaleX(${Math.min(1,s/total)})`;
  },
 };
 return api;
}
