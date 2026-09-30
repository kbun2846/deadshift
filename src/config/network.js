// Online play settings. The game talks only to the Transport interface in
// net/transport.js; net/online.js picks the wire: the game server (a
// WebSocket, net/socket-transport.js) or, from the developer tools,
// browser-to-browser PeerJS.
//
// Units: seconds, ticks of the 60 Hz simulation, players.
export const NETWORK = Object.freeze({
 // Multiplayer ships in a later alpha. The code is built and tested; this
 // keeps the ONLINE menu and ?join= / ?host= links out of this build.
 enabled: true,
 // The game server (server/, on the owner's VPS; 2026-09-30): JOIN, HOST
 // and the always-open rooms play there. A development build can point at
 // another with ?server=ws://127.0.0.1:8787 (AGENTS.md > The game server).
 gameServer: 'wss://play.deadstab.com',
 // The peer-to-peer game (developer tools only now): 'peerjs' =
 // browser-to-browser WebRTC, one player hosts.
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
 // Room codes: five digits (owner, 2026-09-30: numbers only; easy to read out
 // and to type on a phone's number pad; 100,000 codes).
 roomPrefix: 'deadstab-',
 codeLength: 5,
 codeAlphabet: '0123456789',
 maxPlayers: 8, // (4V4, 2026-09-29; config/match.js MAX_SEATS)
 // The host sends the world state 20 times a second (every 3rd tick).
 snapshotEvery: 3,
 // Clients draw other players this far in the past, so there are always two
 // snapshots to glide between even when one arrives late.
 interpolationDelay: .1,
 // A jittery link (a phone hotspot) is drawn up to this far back instead
 // (client-session.js interpolationDelayFor), eased (v0.999a).
 maxInterpolationDelay: .3,
 // Each input message repeats the last few inputs, so a lost packet costs
 // nothing: the next one carries it again. (v0.999a: 10, a sixth of a second
 // of loss or a late burst on a phone hotspot; packed they are ~30 bytes each.)
 inputRedundancy: 10,
 // Your own player is predicted locally. When the host disagrees, small
 // differences are eased out (this share per snapshot); big ones snap.
 correctionBlend: .35,
 snapDistance: 1.5,
 // A remote player whose inputs stop arriving is held this long before they
 // are treated as gone.
 timeout: 6,
 // A player who just joined is still loading the map and sends nothing until
 // that is done: they get this long before the first word.
 loadGrace: 45,
 // A client far behind the host catches up by running up to this many of its
 // queued inputs in one tick.
 maxCatchUp: 4,
});
