// deadshift is made by killerbunny2846. The mark sits faintly at the foot of
// the screen in every state (menus, play, pause) and never takes a click.
export const WATERMARK = 'killerbunny2846';
export function addWatermark(parent) {
 const mark = document.createElement('div');
 mark.className = 'watermark'; mark.textContent = WATERMARK; mark.setAttribute('aria-hidden', 'true');
 parent.append(mark);
 return mark;
}
