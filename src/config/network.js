// Online play settings. Switching from peer-to-peer to a dedicated server is a
// change here (transport: 'websocket' plus its url), not a rewrite: the game
// only talks to the Transport interface in net/transport.js.
//
// Units: seconds, ticks of the 60 Hz simulation, players.
export const NETWORK = Object.freeze({
 // Multiplayer ships in a later alpha. The code is built and tested; this
 // keeps the ONLINE menu and ?join= / ?host= links out of this build.
 enabled: true,
 // 'peerjs' = browser-to-browser WebRTC, one player hosts.
 // 'websocket' = a dedicated server (not built yet; see AGENTS.md).
 transport: 'peerjs',
 // The PeerJS signalling server only introduces the two browsers; game
 // traffic then flows directly between them. null uses the free public PeerJS
 // cloud. For local testing run `npx peer --port 9000` and open the game with
 // ?peerhost=127.0.0.1:9000 (development builds only).
 peerServer: null,
 // STUN lets a browser learn its public address so two players behind home
 // routers can reach each other. Some networks (many phone carriers, strict
 // office Wi-Fi) block direct connections entirely; those need a TURN relay,
 // which forwards the traffic. A TURN entry looks like
 // { urls: 'turn:host:3478', username: '...', credential: '...' } and comes
 // from a relay provider account (see AGENTS.md > Networking).
 iceServers: [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
 ],
 // Room codes: short, easy to read out loud, no 0/O or 1/I mix-ups.
 roomPrefix: 'deadshift-',
 codeLength: 5,
 codeAlphabet: 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
 maxPlayers: 4,
 // The host sends the world state 20 times a second (every 3rd tick).
 snapshotEvery: 3,
 // Clients draw other players this far in the past, so there are always two
 // snapshots to glide between even when one arrives late.
 interpolationDelay: .1,
 // Each input message repeats the last few inputs, so a lost packet costs
 // nothing: the next one carries it again.
 inputRedundancy: 4,
 // Your own player is predicted locally. When the host disagrees, small
 // differences are eased out (this share per snapshot); big ones snap.
 correctionBlend: .35,
 snapDistance: 1.5,
 // A remote player whose inputs stop arriving is held this long before they
 // are treated as gone.
 timeout: 6,
 // A client far behind the host catches up by running up to this many of its
 // queued inputs in one tick.
 maxCatchUp: 4,
});
