// Keep a common font size; fit the visible glyph bounds, not the font's padded line box.
export function installButtonTypography(root){
 const context=document.createElement('canvas').getContext('2d');
 const tracked=new Set();let queued=false;
 const schedule=()=>{if(!queued){queued=true;requestAnimationFrame(()=>{queued=false;refresh();});}};
 const resize=new ResizeObserver(schedule);
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
  }
  // The stretched, cropped lettering is the game's display voice. Developer
  // controls are not part of that surface, so they keep ordinary UI text.
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
   const available=Math.max(1,button.clientWidth-20);
   const height=button.classList.contains('weapon-choice')?40:button.clientHeight-parseFloat(css.paddingBottom);
   const sx=Math.min(.86,available/Math.max(1,inkWidth,m.width)),sy=height*1.08/(ascent+descent);
   const x=css.textAlign==='right'?available-m.actualBoundingBoxRight*sx:Math.max(0,m.actualBoundingBoxLeft)*sx;
   label.style.transform=`matrix(${sx},0,0,${sy},${x},${-top*sy-height*.04})`;
  }
 }
 new MutationObserver(records=>{
  if(records.some(r=>r.target.nodeType===1&&(r.target.closest('button')||[...r.addedNodes].some(n=>n.nodeType===1&&(n.matches('button')||n.querySelector('button'))))))schedule();
 }).observe(root,{childList:true,subtree:true});
 document.fonts.ready.then(schedule);refresh();
}
