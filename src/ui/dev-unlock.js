// The developer tools' access check. The code is never in the page: what is
// typed goes to the game server, which answers yes or no. Nothing here can
// tell a right code from a wrong one.
import { NETWORK } from '../config/network.js';

// The game server's web address (wss: -> https:, ws: -> http:), as fetchRooms
// (net/socket-transport.js) makes it.
export const unlockUrl = (server = NETWORK.gameServer) => String(server).replace(/^ws(s?):/, 'http$1:').replace(/\/+$/, '') + '/dev/unlock';

export const UNLOCK_MESSAGES = Object.freeze({
 wrong: 'incorrect code',
 busy: 'too many tries · wait a while',
 unreachable: "can't reach the server",
 unset: 'not set up yet',
});
const answer = reason => ({ ok: reason === 'ok', reason, message: UNLOCK_MESSAGES[reason] || '' });

// { ok, reason, message }: reason 'ok', 'wrong' (401/403), 'busy' (429),
// 'unset' (503, or no such address yet: 404/501) or 'unreachable' (no answer,
// a network or CORS failure, a timeout, anything else).
// The body is the raw code and no headers are set, so the browser sends it as
// a CORS simple request (no preflight).
export async function requestUnlock(code, options = {}) {
 const typed = String(code ?? '').trim();
 if (!typed || typed.length > 256) return answer('wrong');
 return ask(typed, options);
}

async function ask(payload, { url = unlockUrl(), fetchImpl = globalThis.fetch, timeout = 10000 } = {}) {
 if (typeof fetchImpl !== 'function') return answer('unreachable');
 const abort = typeof AbortController === 'function' ? new AbortController() : null;
 const timer = abort ? setTimeout(() => abort.abort(), timeout) : null;
 try {
  const reply = await fetchImpl(url, { method: 'POST', body: payload, cache: 'no-store', ...(abort ? { signal: abort.signal } : {}) });
  if (reply.status === 401 || reply.status === 403) return answer('wrong');
  if (reply.status === 429) return answer('busy');
  if (reply.status === 503 || reply.status === 404 || reply.status === 501) return answer('unset');
  if (!reply.ok) return answer('unreachable');
  let body = null;
  try { body = await reply.json(); } catch { return answer('unreachable'); }
  return answer(body?.ok === true ? 'ok' : 'wrong');
 } catch { return answer('unreachable'); }
 finally { if (timer) clearTimeout(timer); }
}

// A one-time link from the admin page: `#devticket=<ticket>` on the address.
// Taken off the address bar at once (so it is never bookmarked, shared or
// reloaded) and returned: null when there is none, '' when it is malformed.
export const DEV_TICKET = /^[A-Za-z0-9_-]{43}$/;
export function takeDevTicket(loc = globalThis.location, hist = globalThis.history) {
 const hash = String(loc?.hash || '');
 const match = /^#?(?:.*&)?devticket=([^&]*)/.exec(hash);
 if (!match) return null;
 const rest = hash.replace(/^#/, '').split('&').filter(part => !part.startsWith('devticket=')).join('&');
 try { hist?.replaceState?.(hist.state ?? null, '', String(loc.pathname || '') + String(loc.search || '') + (rest ? '#' + rest : '')); } catch { /* the address keeps it; it is used up below anyway */ }
 let ticket = match[1];
 try { ticket = decodeURIComponent(ticket); } catch { return ''; }
 return DEV_TICKET.test(ticket) ? ticket : '';
}

// The ticket goes to the game server like a code does: `ticket:<ticket>`.
export function redeemDevTicket(ticket, options = {}) {
 if (!DEV_TICKET.test(String(ticket ?? ''))) return Promise.resolve(answer('wrong'));
 return ask('ticket:' + ticket, options);
}

// What a ticket's answer says on screen when it didn't work.
export const TICKET_MESSAGES = Object.freeze({ wrong: 'THIS LINK HAS EXPIRED', busy: 'TOO MANY TRIES · WAIT A WHILE', unreachable: "CAN'T REACH THE SERVER", unset: "CAN'T REACH THE SERVER" });

// At startup: a ticket on the address is taken off it and sent; `unlock`
// runs when it works (as a right code does), `toast` says why when it doesn't.
export async function applyDevTicket({ location: loc = globalThis.location, history: hist = globalThis.history, redeem = redeemDevTicket, unlock, toast, url } = {}) {
 const ticket = takeDevTicket(loc, hist);
 if (ticket === null) return null;
 // (A malformed one is only taken off the address: nothing to send.)
 const result = ticket ? await redeem(ticket, url ? { url } : {}) : answer('wrong');
 if (result.ok) unlock?.();
 else toast?.(TICKET_MESSAGES[result.reason] || TICKET_MESSAGES.wrong);
 return result;
}
