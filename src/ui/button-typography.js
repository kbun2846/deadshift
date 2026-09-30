// Keep a common font size; fit the visible glyph bounds, not the font's padded line box.
let fitNow=null;
// Readable lettering (owner, 2026-09-29: "see how these are so stretched in
// they can't be read? make it easier to read. do this everywhere"): the
// stretch never makes a letter narrower than this share of its height
// (horizontal scale / vertical scale). A label that would need more squeeze
// than that to fit its button is drawn shorter instead, centred in the
// button, keeping these proportions, rather than as a row of hairlines. (The
// usual buttons sit near .44: .86 wide over about 1.95 tall.)
export const MIN_LETTER_RATIO=.3;
// How tall a label is drawn: its fitted vertical scale `sy`, unless the
// horizontal scale `sx` it gets would squeeze it past MIN_LETTER_RATIO.
export const readableScale=(sx,sy)=>Math.min(sy,sx/MIN_LETTER_RATIO);
// A menu page was just shown: fit everything on it now, before it is painted
// (the observers alone could leave a map card's small badge for a later frame).
export function refreshTypography(){fitNow?.();}
export function installButtonTypography(root){
 const context=document.createElement('canvas').getContext('2d');
 const tracked=new Set();let queued=false;
 const schedule=()=>{if(!queued){queued=true;requestAnimationFrame(()=>{queued=false;refresh();});}};
 // Fitted before the first paint, not a frame later: a page that has just been
 // shown gets its size (ResizeObserver) and new buttons arrive (MutationObserver)
 // after layout but before the browser paints, so fitting right there means the
 // stretched lettering is what is painted first. Deferring it to the next frame
 // painted one frame of plain text first. Labels not fitted yet stay invisible
 // (menu-theme.css), so nothing unfitted is ever shown.
 let fitting=false;
 const now=()=>{if(fitting)return;fitting=true;try{refresh();}finally{fitting=false;}};
 const resize=new ResizeObserver(now);fitNow=now;
 function refresh(){
  // All map-mode badges use the same fitted ink treatment, including new cards.
  for(const badge of root.querySelectorAll('.map-mode')){
   if(badge.querySelector('svg'))continue;
   const label=badge.textContent.trim().toUpperCase();if(!label)continue;
   const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
   const text=document.createElementNS(svg.namespaceURI,'text');
   svg.setAttribute('preserveAspectRatio','none');svg.setAttribute('aria-hidden','true');
   text.setAttribute('x','0');text.setAttribute('y','25');text.textContent=label;
   svg.append(text);badge.setAttribute('aria-label',label);badge.replaceChildren(svg);
  }
  for(const svg of root.querySelectorAll('.map-caption strong svg,.map-mode svg')){
   if(!tracked.has(svg)){tracked.add(svg);resize.observe(svg);}
   const text=svg.querySelector('text');if(!text||!svg.getClientRects().length)continue;
   const box=text.getBBox();if(box.width<=0||box.height<=0)continue;
   const css=getComputedStyle(text);context.font=`${css.fontWeight} ${css.fontSize} ${css.fontFamily}`;
   const metrics=context.measureText(text.textContent),inkHeight=metrics.actualBoundingBoxAscent+metrics.actualBoundingBoxDescent;
   if(inkHeight<=0)continue;
   // Fit actual letter ink, with the same slight edge crop as menu labels.
   svg.setAttribute('viewBox',`${box.x} ${Number(text.getAttribute('y'))-metrics.actualBoundingBoxAscent+inkHeight*.02} ${box.width} ${inkHeight*.96}`);
   // (v0.995a) Chrome does not restyle on a later camel-case `viewBox`, so the
   // badge's show-when-fitted rule keys on this instead: PRACTICE was blank.
   svg.dataset.fit='1';
  }
  // The stretched, cropped lettering is the game's display voice. Developer
  // controls are not part of that surface, so they keep ordinary UI text.
  // Measured first, placed after: buttons side by side (the same parent: a
  // tab row, a menu page, the pause card) share one horizontal stretch, the
  // narrowest any of them needs, so their letters are the same width; a
  // short label no longer comes out fatter than its long neighbour.
  const fits=[];
  for(const button of root.querySelectorAll('button:not(.map-choice):not(.plain-text):not(.dev-tools button):not(.dev-window button)')){
   if(!tracked.has(button)){tracked.add(button);resize.observe(button);}
   if(button.childNodes.length&&[...button.childNodes].every(n=>n.nodeType===Node.TEXT_NODE)){
    const label=document.createElement('span');label.className='button-label';label.textContent=button.textContent;button.replaceChildren(label);
   }
   const label=button.querySelector(':scope > .button-label, :scope > .weapon-name > .button-label');
   if(!label||!button.clientHeight||!button.getClientRects().length)continue;
   const css=getComputedStyle(button),size=parseFloat(css.fontSize),text=css.textTransform==='uppercase'?label.textContent.toUpperCase():label.textContent.toLowerCase();
   context.font=`${css.fontWeight} ${size}px ${css.fontFamily}`;
   const m=context.measureText(text),ascent=m.actualBoundingBoxAscent,descent=m.actualBoundingBoxDescent;
   if(ascent+descent<=0)continue;
   const fa=m.fontBoundingBoxAscent??size*.8,fd=m.fontBoundingBoxDescent??size*.2;
   const baseline=(size-fa-fd)/2+fa,top=baseline-ascent;
   const inkWidth=m.actualBoundingBoxLeft+m.actualBoundingBoxRight;
   // (Side room: 10 px a side, less on a narrow segment so its label keeps
   // what little width it has.)
   const available=Math.max(1,button.clientWidth-Math.min(20,Math.max(6,button.clientWidth*.14)));
   // (A weapon card's name fits its own box, whose height the layout sets.)
   const height=button.classList.contains('weapon-choice')?(button.querySelector('.weapon-name')?.clientHeight||40):button.clientHeight-parseFloat(css.paddingBottom);
   const sx=Math.min(.86,available/Math.max(1,inkWidth,m.width)),sy=height*1.08/(ascent+descent);
   fits.push({button,label,css,m,top,inkWidth,available,height,sx,sy,group:button.closest('#touch-controls')?button:button.parentElement});
  }
  const shared=new Map();
  for(const f of fits)shared.set(f.group,Math.min(shared.get(f.group)??Infinity,f.sx/f.sy));
  for(const f of fits){
   const {label,css,m,top,inkWidth,available,height}=f,sx=Math.min(f.sx,shared.get(f.group)*f.sy),sy=readableScale(sx,f.sy);
   // Full height: the ink fills the button (a slight crop top and bottom).
   // Squeezed past readable: shorter, centred in the button's height.
   const inkTop=sy<f.sy?(height-(m.actualBoundingBoxAscent+m.actualBoundingBoxDescent)*sy)/2:-height*.04;
   // Centred buttons keep a narrower label centred; others stay on their side.
   const x=css.textAlign==='right'?available-m.actualBoundingBoxRight*sx:css.textAlign==='center'?(available-inkWidth*sx)/2+m.actualBoundingBoxLeft*sx:Math.max(0,m.actualBoundingBoxLeft)*sx;
   label.style.transform=`matrix(${sx},0,0,${sy},${x},${inkTop-top*sy})`;
   label.dataset.fit='';
  }
 }
 new MutationObserver(records=>{
  if(records.some(r=>r.target.nodeType===1&&(r.target.closest('button')||[...r.addedNodes].some(n=>n.nodeType===1&&(n.matches('button')||n.querySelector('button'))))))now();
 }).observe(root,{childList:true,subtree:true});
 document.fonts.ready.then(schedule);refresh();
}
