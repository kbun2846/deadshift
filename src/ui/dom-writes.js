// Cached DOM writes for the HUD's per-frame and per-tick updates.
//
// Writing a value an element already has is not free: a textContent write
// replaces the text node and an attribute or style write marks the element
// for a style recalculation (and often a layout), even when nothing changed.
// The HUD rewrote dozens of identical values every tick. These remember the
// last value written through them (on the element) and skip repeats.
// Only write through them for a given property, or the memory goes stale.
export function setText(el, text) {
  if (el.__text !== text) { el.__text = text; el.textContent = text; }
}
export function setStyle(el, prop, value) {
  const memo = el.__style ||= {};
  if (memo[prop] === value) return;
  memo[prop] = value;
  if (prop.startsWith('--')) el.style.setProperty(prop, String(value)); else el.style[prop] = value;
}
export function setAttr(el, name, value) {
  const memo = el.__attr ||= {};
  if (memo[name] === value) return;
  memo[name] = value; el.setAttribute(name, value);
}
