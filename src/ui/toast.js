// The short notice line at the top of the game ("DEV TOOLS ON", "MAP RESET").
// One element, reused: a new notice replaces the one showing.
export function createToast(parent) {
 const el = document.createElement('div'); el.className = 'toast'; el.setAttribute('role', 'status'); parent.append(el);
 let timer;
 return (text, time = 1800) => {
  el.textContent = text; el.classList.add('visible'); clearTimeout(timer);
  timer = setTimeout(() => el.classList.remove('visible'), time);
 };
}
