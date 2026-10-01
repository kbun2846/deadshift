// Messages from the game's admins (server/admin.js: an announcement to every
// player, a message to one room, or a private one), shown as a card at the
// top of the screen in the game's own look (menu-theme.css .admin-card): a
// slate panel with a pink edge, a small lowercase label and the words in the
// HUD's type. In a game, in the lobby, on the death screen: anywhere online.
//
// A card stays up for 6 to 10 seconds depending on its length, at most two
// show at once (a third pushes the oldest out), and a tap or click closes it.
// The rules (cleanAdminMessage, messageLifetime, createMessageStack) and the
// card's markup (messageCardHTML) are plain functions; installAdminMessages
// puts them on the page. In a game the cards sit just under the health bar
// and the storm readout under it (cardTop), never over them.

export const ADMIN_MESSAGE_LABELS = Object.freeze({ global: 'announcement', room: 'message to the room', private: 'private message' });
export const ADMIN_MESSAGE_MAX = 140;
export const ADMIN_MESSAGE_SHOWN = 2;
// Milliseconds on screen: base + per character, kept between min and max.
export const ADMIN_MESSAGE_TIME = Object.freeze({ min: 6000, max: 10000, base: 4500, perChar: 45 });

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// A message as the server sent it, or null when it isn't one to show.
export function cleanAdminMessage(message) {
 if (!message || typeof message !== 'object' || !Object.hasOwn(ADMIN_MESSAGE_LABELS, message.kind)) return null;
 const text = String(message.text ?? '').replace(/[\u0000-\u001f\u007f\u2028\u2029]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, ADMIN_MESSAGE_MAX);
 return text ? { kind: message.kind, text } : null;
}

export function messageLifetime(text) {
 const t = ADMIN_MESSAGE_TIME;
 return Math.round(Math.min(t.max, Math.max(t.min, t.base + String(text ?? '').length * t.perChar)));
}

// The card's inside: the label, the words, and a thin bar that runs down
// over the card's lifetime.
export function messageCardHTML({ kind, text }, lifetime = messageLifetime(text)) {
 return '<span class="admin-card-label">' + esc(ADMIN_MESSAGE_LABELS[kind] || 'message') + '</span>' +
  '<span class="admin-card-text">' + esc(text) + '</span>' +
  '<i class="admin-card-time" style="animation-duration:' + Math.round(lifetime) + 'ms" aria-hidden="true"></i>';
}

// Which cards are up: add (the oldest beyond `max` drops out), dismiss, and
// expire at a time. Times are milliseconds on any one clock.
export function createMessageStack({ max = ADMIN_MESSAGE_SHOWN } = {}) {
 let items = [], serial = 0;
 return {
  add(message, now) {
   const clean = cleanAdminMessage(message);
   if (!clean) return null;
   const lifetime = messageLifetime(clean.text);
   const item = { id: ++serial, ...clean, at: now, lifetime, until: now + lifetime };
   items.push(item);
   const dropped = items.splice(0, Math.max(0, items.length - max));
   return { item, dropped };
  },
  dismiss(id) { const before = items.length; items = items.filter(i => i.id !== id); return items.length !== before; },
  expire(now) { const gone = items.filter(i => now >= i.until); items = items.filter(i => now < i.until); return gone; },
  next() { return items.length ? Math.min(...items.map(i => i.until)) : null; },
  get items() { return [...items]; },
 };
}

// Where the cards start in a game: under the health bar (and the storm
// readout in it) when it shows in the top half of the screen, else null
// (the stylesheet's place). `rect`: the health bar's box, or null.
export function cardTop(rect, viewHeight, gap = 12) {
 if (!rect || !(rect.height > 0) || rect.bottom > viewHeight / 2) return null;
 return Math.round(rect.bottom + gap);
}

export function installAdminMessages(parent, { now = () => performance.now(), doc = document } = {}) {
 const box = doc.createElement('div');
 box.className = 'admin-messages'; box.setAttribute('aria-live', 'polite');
 parent.append(box);
 const stack = createMessageStack(), cards = new Map();
 let timer = 0;
 const remove = item => {
  const el = cards.get(item.id); cards.delete(item.id);
  if (!el) return;
  el.classList.add('leaving');
  setTimeout(() => el.remove(), 240);
 };
 const place = () => {
  const hud = doc.querySelector('#game .health-hud');
  const top = cardTop(hud ? hud.getBoundingClientRect() : null, doc.defaultView?.innerHeight || 0);
  box.style.top = top === null ? '' : top + 'px';
 };
 const schedule = () => {
  clearTimeout(timer); place();
  for (const item of stack.expire(now())) remove(item);
  const next = stack.next();
  if (next !== null) timer = setTimeout(schedule, Math.max(30, next - now() + 20));
 };
 doc.defaultView?.addEventListener?.('resize', place);
 function show(message) {
  const added = stack.add(message, now());
  if (!added) return null;
  for (const item of added.dropped) remove(item);
  const { item } = added, el = doc.createElement('div');
  el.className = 'admin-card admin-card-' + item.kind;
  el.setAttribute('role', item.kind === 'private' ? 'alert' : 'status');
  el.title = 'Tap to close';
  el.innerHTML = messageCardHTML(item, item.lifetime);
  // (Its own press: it never reaches the game under it as a shot.)
  el.addEventListener('pointerdown', event => event.stopPropagation());
  el.addEventListener('click', event => { event.stopPropagation(); stack.dismiss(item.id); remove(item); schedule(); });
  box.append(el); cards.set(item.id, el);
  schedule();
  return item;
 }
 function clear() { for (const item of stack.items) { stack.dismiss(item.id); remove(item); } schedule(); }
 return { show, clear, element: box, get shown() { return stack.items; } };
}
