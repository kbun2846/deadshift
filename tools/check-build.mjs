// Run after `pnpm build` (the deploy workflow does): fails if the built game
// lost the online handler calls. Vite 7.1.7 once tree-shook
// transport.onMessage(...) and transport.onLeave(...) out of
// socket-transport.js (they are empty methods in its literal until a session
// sets them), so the page connected to the game server but never saw a
// message, and every JOIN and HOST ended in "left the game" (v0.1.0-alpha;
// fixed in v0.1.1). The unit tests run the source unbundled and can't see it.
import { readdirSync, readFileSync } from 'node:fs';

const dir = new URL('../dist/assets/', import.meta.url);
const files = readdirSync(dir).filter(name => name.endsWith('.js'));
const problems = [];
const socket = files.find(name => name.startsWith('socket-transport-'));
if (!socket) problems.push('no socket-transport chunk in dist/assets');
else {
 const code = readFileSync(new URL(socket, dir), 'utf8');
 if (!code.includes('onMessage.call(')) problems.push(socket + ': the call that hands server messages to the game is missing');
 if (!code.includes('onLeave.call(')) problems.push(socket + ': the call that reports a closed connection is missing');
 // (The admin page's messages: collected for the cards, and asked for on joining.)
 if (!code.includes('adminMessages.push(') || !code.includes('cards:1')) problems.push(socket + ': the admin messages (cards) are not collected');
}
const peer = files.find(name => name.startsWith('peer-transport-'));
if (peer) {
 const code = readFileSync(new URL(peer, dir), 'utf8');
 if (!/onMessage\(/.test(code.replace(/onMessage\(\)\{\}/g, ''))) problems.push(peer + ': no onMessage call left');
}
if (problems.length) { console.error('Build check failed:\n - ' + problems.join('\n - ')); process.exit(1); }
console.log('Build check: online handler calls present (' + [socket, peer].filter(Boolean).join(', ') + ').');
