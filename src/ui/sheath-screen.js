// Sheath's screen-space touches (owner's brief, 2026-09-28), page markup over
// the 3D view so they cost the renderer nothing:
//  - Gold Rush: while it runs, your own view takes a subtle gold tint (a
//    warm wash, stronger toward the edges so the middle of the screen, where
//    you read the fight, stays clear). Only you see it.
//  - Draw-cut: a brief gold slash streak across the screen, for the one who
//    made it and for anyone it cut.
// Honours reduced motion (the streak only flashes).
const STYLE = `
.sheath-rush{position:fixed;inset:0;pointer-events:none;z-index:4;opacity:0;transition:opacity .25s ease;
 background:radial-gradient(ellipse at center,rgba(255,214,110,.06) 0%,rgba(255,196,64,.08) 55%,rgba(232,160,24,.22) 100%);mix-blend-mode:screen}
.sheath-rush.on{opacity:1}
.sheath-rush.flare{animation:sheath-rush-flare .45s ease-out}
@keyframes sheath-rush-flare{0%{filter:brightness(2.2)}100%{filter:brightness(1)}}
.sheath-streak{position:fixed;left:-20vmax;top:50%;width:140vmax;height:0;pointer-events:none;z-index:5;transform-origin:50% 50%;opacity:0}
.sheath-streak::before,.sheath-streak::after{content:'';position:absolute;left:0;right:0;top:0;border-radius:50%}
.sheath-streak::before{height:10px;margin-top:-5px;background:linear-gradient(90deg,transparent 0%,rgba(255,200,72,.9) 35%,#fffbe8 55%,rgba(255,214,110,.9) 75%,transparent 100%);box-shadow:0 0 22px 8px rgba(255,190,60,.5)}
.sheath-streak::after{height:2px;margin-top:11px;background:linear-gradient(90deg,transparent 10%,rgba(255,226,140,.85) 60%,transparent 95%)}
.sheath-streak.go{animation:sheath-streak .34s cubic-bezier(.2,.8,.3,1) forwards}
@keyframes sheath-streak{0%{opacity:0;clip-path:inset(0 100% 0 0)}12%{opacity:1}45%{opacity:1;clip-path:inset(0 0 0 0)}100%{opacity:0;clip-path:inset(0 0 0 0)}}
@media (prefers-reduced-motion:reduce){.sheath-streak.go{animation:sheath-streak-still .3s forwards}@keyframes sheath-streak-still{0%{opacity:.8}100%{opacity:0}}}
`;

export function createSheathScreen(parent = document.body) {
 if (!document.getElementById('sheath-screen-style')) {
  const style = document.createElement('style'); style.id = 'sheath-screen-style'; style.textContent = STYLE; document.head.append(style);
 }
 const rush = document.createElement('div'); rush.className = 'sheath-rush'; rush.setAttribute('aria-hidden', 'true');
 const streak = document.createElement('div'); streak.className = 'sheath-streak'; streak.setAttribute('aria-hidden', 'true');
 parent.append(rush, streak);
 let rushing = false;
 return {
  // On while your Gold Rush runs; it flares as it starts.
  rush(on) {
   if (on === rushing) return;
   rushing = on; rush.classList.toggle('on', on);
   if (on) { rush.classList.remove('flare'); void rush.offsetWidth; rush.classList.add('flare'); }
  },
  // A streak across the screen at `angle` (radians, screen space).
  streak(angle = -.35) {
   streak.style.transform = `rotate(${angle}rad)`;
   streak.classList.remove('go'); void streak.offsetWidth; streak.classList.add('go');
  },
  clear() { this.rush(false); streak.classList.remove('go'); },
 };
}
