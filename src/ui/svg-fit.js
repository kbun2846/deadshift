// Stretched SVG words (the loading screen's and the title's "deadshift", the
// menu's stretched labels, DEAD) rely on textLength + lengthAdjust. Some
// WebKit browsers on a Mac drew the word at its natural width instead: far too
// wide, cut off at "deads" (v0.999a, owner, on a MacBook). Where the drawn
// width does not match the asked one, the stretch is done by hand instead: a
// horizontal scale about the text's own start. Where the browser already
// obeys textLength (Chrome, Firefox) nothing changes.
const done = new WeakSet();
export function fitSvgText(text) {
  if (done.has(text) || !text.isConnected) return;
  const want = parseFloat(text.getAttribute('textLength'));
  if (!(want > 0)) return;
  let drawn;
  try { drawn = text.getBBox().width; } catch { return; } // not rendered (display:none): try later
  if (!(drawn > 0)) return;
  done.add(text);
  if (Math.abs(drawn - want) / want < .03) return;
  text.removeAttribute('textLength'); text.removeAttribute('lengthAdjust');
  let natural; try { natural = text.getBBox().width; } catch { return; }
  if (!(natural > 0)) return;
  const x = parseFloat(text.getAttribute('x')) || 0;
  const transform = `translate(${x} 0) scale(${want / natural} 1) translate(${-x} 0)`;
  text.setAttribute('transform', transform);
  // The same word used as a clip (the loading screen's pour) is never drawn,
  // so it cannot be measured: it takes the visible word's stretch.
  for (const clip of text.ownerSVGElement?.querySelectorAll('clipPath text[textLength]') || []) {
    if (clip.textContent !== text.textContent) continue;
    clip.removeAttribute('textLength'); clip.removeAttribute('lengthAdjust'); clip.setAttribute('transform', transform); done.add(clip);
  }
}
export function fitSvgWords(root = document) {
  for (const text of root.querySelectorAll('svg text[textLength]')) if (!text.closest('clipPath')) fitSvgText(text);
}
// Words added later (menus, the death screen): checked as they arrive.
export function watchSvgWords(root = document.body) {
  if (typeof MutationObserver !== 'function') return;
  let queued = false;
  // (Not while a game is on: the words are all in hidden menus then, and the
  // HUD's own changes would re-measure them every frame, v0.999a.)
  new MutationObserver(() => { if (queued || document.body?.classList.contains('playing')) return; queued = true; requestAnimationFrame(() => { queued = false; fitSvgWords(root); }); })
    .observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'class'] });
}
