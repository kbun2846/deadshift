// The death screen, one card for every mode: the red wash, DEAD, who killed
// you (online), and the buttons for the mode (competitive overhaul, owner
// 2026-09-29: "most menus should be the same kind of menu with 1 or 2
// different buttons"):
//  practice        (solo) RESPAWN NOW, CHANGE WEAPON, RESTART, MAIN MENU; the
//                  respawn counts down
//  online-practice RESPAWN, CHANGE WEAPON, LOBBY, LEAVE MULTIPLAYER; no wait
//  ffa             (online) QUIT; the host's respawn wait counts down
//  duel            (1V1, online and SOLO) FORFEIT, QUIT: a quick pop-up in
//                  place (owner: "a quick pop up on the screen ... without
//                  wasting time moving the whole death menu to the right"),
//                  up until both are back
//  team            (2V2, 3V3, 4V4, 2V2V2) VIEW STATS, FORFEIT (a team vote),
//                  QUIT, off to the side while you spectate your teammates
// No CHANGE WEAPON in the counted modes (floor loot will replace it).
// A mode with a match clock (FFA, online and BOTS) also shows TIME LEFT under
// the respawn, counting down; near the end, when respawns close
// (config/match.js NO_RESPAWN_LEFT), the respawn line becomes NO RESPAWNS in
// the card's stretched lettering (or NO RESPAWN, early, when your own wait
// would end after the cutoff): `setClock`.
// The screen waits for the camera to finish zooming onto the body
// (death-view.js DEATH_ZOOM), so the gore is seen first.
import { fitSvgText } from './svg-fit.js';
export const DEATH_MENU_DELAY=2.6;
// The card's first beat: only the blood and DEAD (owner, 2026-09-29: "the
// initial dead screen should show only the dead word"); then the rest.
export const DEATH_WORD_ONLY=1;
export const RESPAWN_TIME=5;
// m:ss (a match's time left).
export const clockText=s=>{const t=Math.max(0,Math.ceil(s));return Math.floor(t/60)+':'+String(t%60).padStart(2,'0');};
const esc=text=>String(text??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// Which buttons each mode has (the ids below); the rest are hidden.
export const DEATH_BUTTONS=Object.freeze({
 practice:['death-respawn-now','death-change-weapon','death-restart','death-menu'],
 'online-practice':['death-respawn-now','death-change-weapon','death-lobby','death-menu'],
 ffa:['death-menu'],
 duel:['death-forfeit','death-menu'],
 team:['death-stats','death-forfeit','death-menu'],
});
// The modes with a respawn countdown on the card.
export const COUNTDOWN_MODES=Object.freeze(['practice','ffa']);
// The last button: where it takes you.
const MENU_LABEL={practice:'MAIN MENU','online-practice':'LEAVE MULTIPLAYER'};
export function createDeathScreen(parent,{restart,menu,respawn,changeWeapon,lobby,viewStats,forfeit}){
 const root=document.createElement('section');root.id='death-screen';root.className='hidden';root.setAttribute('role','dialog');root.setAttribute('aria-modal','true');root.setAttribute('aria-labelledby','death-title');
 root.innerHTML=`<div class="death-card"><div class="death-wash" aria-hidden="true"><svg viewBox="0 0 1000 760" preserveAspectRatio="none">
 <path d="M184 274C153 255 138 236 145 222Q150 211 165 230L218 264C239 246 209 187 172 136Q151 109 167 106Q181 104 196 136C218 178 247 209 277 218C298 193 292 161 286 141C277 110 291 89 305 95C319 105 299 135 319 158C347 171 360 139 374 129C402 110 432 118 451 106Q470 94 471 55Q474 29 486 44L490 99C503 126 534 100 553 112C582 130 601 123 625 105Q656 78 665 47Q677 27 685 43C688 55 674 73 668 92C656 127 679 145 708 147C745 147 770 127 784 142C800 163 767 178 778 200C798 223 840 193 881 172Q907 160 910 173Q911 183 884 191C842 212 813 240 818 265C834 287 858 271 874 279C895 291 868 315 889 327L950 333Q974 337 965 348Q960 354 942 348L885 347C864 360 906 386 881 411C861 429 874 445 895 454Q931 469 924 481Q919 491 897 477C870 459 848 461 834 475C819 503 850 529 866 548Q879 568 866 574Q856 578 845 558C821 519 800 516 786 537C777 560 792 575 779 593C759 616 739 593 721 609C707 623 728 640 720 664C715 683 702 688 695 676C690 668 709 647 689 632C662 617 654 665 641 683Q631 698 623 686Q616 677 631 655C642 625 616 635 601 634C578 633 578 660 557 666C536 672 512 641 489 649Q477 661 481 707Q480 743 467 739Q457 736 460 715L460 677C452 646 425 641 402 651C373 665 353 642 336 618C313 598 290 620 281 640Q270 662 256 651Q247 644 267 619C287 588 269 565 243 568C217 571 206 593 181 591C164 588 164 575 180 573C214 568 223 540 206 521C184 503 154 528 128 532Q101 532 109 518L157 502C186 481 174 458 153 454Q125 451 96 465Q74 474 71 461Q70 450 97 447C133 437 133 411 148 398C126 376 92 362 57 357Q31 352 39 342Q42 335 65 345C116 360 145 354 155 339C150 312 166 292 184 274Z"/>
 <g class="death-satellite"><ellipse cx="126" cy="100" rx="8" ry="17" transform="rotate(-38 126 100)"/><ellipse cx="104" cy="75" rx="4" ry="8" transform="rotate(-38 104 75)"/><ellipse cx="222" cy="80" rx="5" ry="9"/><ellipse cx="444" cy="22" rx="4" ry="7"/><ellipse cx="716" cy="33" rx="6" ry="11" transform="rotate(38 716 33)"/><ellipse cx="897" cy="128" rx="12" ry="5" transform="rotate(-25 897 128)"/><circle cx="936" cy="114" r="4"/><ellipse cx="962" cy="236" rx="10" ry="6"/><ellipse cx="985" cy="375" rx="8" ry="4"/><ellipse cx="941" cy="554" rx="7" ry="12" transform="rotate(-35 941 554)"/><circle cx="925" cy="608" r="4"/><ellipse cx="786" cy="690" rx="7" ry="12"/><ellipse cx="723" cy="725" rx="5" ry="10"/><ellipse cx="351" cy="710" rx="6" ry="9"/><ellipse cx="228" cy="688" rx="6" ry="14" transform="rotate(30 228 688)"/><circle cx="90" cy="577" r="6"/><ellipse cx="60" cy="535" rx="11" ry="6"/><circle cx="31" cy="409" r="5"/><ellipse cx="75" cy="260" rx="7" ry="4"/></g>
 </svg></div><h2 id="death-title" aria-label="DEAD"><svg viewBox="0 0 360 100" preserveAspectRatio="none" aria-hidden="true"><text x="0" y="84" font-size="100" textLength="360" lengthAdjust="spacingAndGlyphs">DEAD</text></svg></h2><div class="death-actions"><p class="death-by" hidden></p><div class="death-respawn" role="timer" aria-live="off"><span class="death-respawn-label">respawn</span><span class="death-respawn-count">5</span><span class="death-respawn-none" data-fate="closed" hidden><svg viewBox="0 0 440 64" preserveAspectRatio="none" aria-hidden="true"><text x="0" y="57" font-size="64" textLength="440" lengthAdjust="spacingAndGlyphs">NO RESPAWNS</text></svg></span><span class="death-respawn-none" data-fate="late" hidden><svg viewBox="0 0 400 64" preserveAspectRatio="none" aria-hidden="true"><text x="0" y="57" font-size="64" textLength="400" lengthAdjust="spacingAndGlyphs">NO RESPAWN</text></svg></span><i class="death-respawn-bar" aria-hidden="true"><b></b></i><span class="death-respawn-note" hidden></span><span class="death-left" hidden><span class="death-left-label">time left</span><b class="death-left-count">0:00</b></span></div><button id="death-respawn-now">RESPAWN NOW</button><button id="death-change-weapon">CHANGE WEAPON</button><button id="death-restart">RESTART</button><button id="death-lobby">LOBBY</button><button id="death-stats" aria-pressed="false">VIEW STATS</button><button id="death-forfeit" aria-pressed="false">FORFEIT</button><button id="death-menu">MAIN MENU</button><p class="death-hint">hold <kbd>TAB</kbd> for the scoreboard</p></div></div>`;
 parent.append(root);
 const $=selector=>root.querySelector(selector);
 $('#death-respawn-now').onclick=()=>respawn?.();$('#death-change-weapon').onclick=()=>changeWeapon?.();
 $('#death-restart').onclick=restart;$('#death-lobby').onclick=()=>lobby?.();$('#death-menu').onclick=menu;
 $('#death-stats').onclick=()=>viewStats?.();$('#death-forfeit').onclick=()=>forfeit?.();
 let mode='practice',reveal=0;
 const label=(id,text)=>{const b=$('#'+id);if(b.textContent!==text)b.textContent=text;};
 const api={root,
  get open(){return !root.classList.contains('hidden');},
  // `next`: one of DEATH_BUTTONS' modes ('online' is the old name of 'ffa').
  show(next='practice'){
   mode=next==='online'?'ffa':DEATH_BUTTONS[next]?next:'practice';root.dataset.mode=mode;
   // (1V1: the quick pop-up; team modes: beside the teammate you watch.)
   root.classList.toggle('quick',mode==='duel');root.classList.toggle('elimination',mode==='duel'||mode==='team');
   const shown=DEATH_BUTTONS[mode];
   for(const button of root.querySelectorAll('.death-actions button'))button.hidden=!shown.includes(button.id);
   label('death-respawn-now',mode==='practice'?'RESPAWN NOW':'RESPAWN');
   label('death-menu',MENU_LABEL[mode]||'QUIT');
   api.setForfeit();api.setStats(false);
   $('.death-respawn').hidden=!COUNTDOWN_MODES.includes(mode);
   api.setClock(null);
   // (Keyboard: Tab shows the scoreboard while down; touch has VIEW STATS.)
   $('.death-hint').hidden=!['ffa','duel','team'].includes(mode);
   root.classList.remove('hidden');
   root.classList.add('word-only');clearTimeout(reveal);
   reveal=setTimeout(()=>{root.classList.remove('word-only');if(api.open)root.querySelector('.death-actions button:not([hidden])')?.focus();},DEATH_WORD_ONLY*1000);
  },
  get mode(){return mode;},
  // FORFEIT: `votes` of `needed` on your side so far (a team vote shows the
  // count, "FORFEIT 1/2"); `mine`: your own vote is in (pressed).
  setForfeit(votes=0,needed=1,mine=false){
   label('death-forfeit',needed>1?`FORFEIT ${votes}/${needed}`:'FORFEIT');
   $('#death-forfeit').setAttribute('aria-pressed',String(!!mine));
  },
  // VIEW STATS pressed while the stats panel is open.
  setStats(open){$('#death-stats').setAttribute('aria-pressed',String(!!open));},
  hide(){clearTimeout(reveal);root.classList.add('hidden');root.classList.remove('word-only');api.setKiller(undefined);},
  // Online: "killed by NAME", or your own blast; undefined hides the line.
  // oneShot: "one shot by NAME" (from full health in one hit).
  setKiller(name,oneShot=false){
   const line=$('.death-by');line.hidden=name===undefined;
   line.innerHTML=name===undefined?'':name?`${oneShot?'one shot':'killed'} by <span class="death-killer">${esc(name)}</span>`:'you took yourself out';
  },
  // The match clock (FFA): `left` seconds of the match (null: no clock, the
  // row goes), and what that means for your respawn (config/match.js
  // respawnFate): 'open' / 'none' the countdown as ever; 'late' NO RESPAWN
  // (yours would end after the cutoff, `cutoff` seconds left); 'closed' NO
  // RESPAWNS for the rest of the match.
  setClock(left,fate='none',cutoff=0){
   const row=$('.death-left'),box=$('.death-respawn'),none=fate==='late'||fate==='closed';
   const text=Number.isFinite(left)?clockText(left):'';
   row.hidden=!text;if(text&&$('.death-left-count').textContent!==text)$('.death-left-count').textContent=text;
   if(box.dataset.fate!==fate){
    box.dataset.fate=fate;box.classList.toggle('no-respawn',none);
    for(const word of root.querySelectorAll('.death-respawn-none')){word.hidden=word.dataset.fate!==fate;if(!word.hidden)fitSvgText(word.querySelector('text'));}
    box.setAttribute('aria-label',fate==='closed'?'no respawns':fate==='late'?'no respawn':'respawn');
   }
   const note=$('.death-respawn-note'),say=fate==='late'&&cutoff>0?'respawns end at '+clockText(cutoff):'';
   note.hidden=!say;if(note.textContent!==say)note.textContent=say;
  },
  // Seconds left of `total`; at zero it reads "now".
  setTimer(left,total=RESPAWN_TIME){
   const s=Math.max(0,left);$('.death-respawn-count').textContent=s>0?String(Math.ceil(s)):'now';
   $('.death-respawn-bar b').style.transform=`scaleX(${Math.min(1,s/total)})`;
  },
 };
 return api;
}
