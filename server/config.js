// The game server's settings. Everything that differs between the owner's
// VPS and a test run comes from environment variables (set in the systemd
// unit, server/deploy/deadstab.service); the rest are the house rules.
//
// Units: seconds, bytes, players.
const env = process.env;
const list = text => String(text || '').split(',').map(s => s.trim()).filter(Boolean);

export const SERVER = Object.freeze({
 // Where it listens. Behind Caddy (which adds HTTPS) it only needs to be
 // reachable from the same machine.
 host: env.HOST || '127.0.0.1',
 port: Number(env.PORT) || 8787,
 // The admin page and its API (/admin) are off until a token is set. The
 // owner picks it on the VPS (server/deploy/SETUP.md); it is never in the repo.
 adminToken: env.ADMIN_TOKEN || '',
 // Bans and the like live here (a folder the server can write).
 dataDir: env.DATA_DIR || new URL('./data/', import.meta.url).pathname,
 // Behind Caddy: the player's address is in X-Forwarded-For. Off when the
 // server faces the internet directly (then that header could be faked).
 trustProxy: env.TRUST_PROXY === '1',
 // Pages allowed to open a game connection (a browser sends its page's
 // origin; other programs can fake it, so this only keeps other websites
 // from embedding the game's servers). ALLOWED_ORIGINS adds more, comma
 // separated; ALLOW_ANY_ORIGIN=1 turns the check off (local testing).
 allowedOrigins: Object.freeze(['https://deadstab.com', 'https://www.deadstab.com', 'https://kbun2846.github.io', 'http://127.0.0.1:5173', 'http://localhost:5173', 'http://127.0.0.1:4173', 'http://localhost:4173', ...list(env.ALLOWED_ORIGINS)]),
 allowAnyOrigin: env.ALLOW_ANY_ORIGIN === '1',

 // The JOIN page's list (owner, 2026-09-30: "every combination of gamemode
 // and map"): a room for every released multiplayer map in each of these
 // modes (practice is only for hosted rooms). Anyone can join them from the
 // list; each keeps its map and mode, runs itself and fills with robots
 // (room.js). When every room of a kind is full another opens, up to
 // `listedPerKind`; spare empty ones close again.
 listedModes: Object.freeze(['ffa', '1v1', '2v2', '3v3', '4v4', '2v2v2']),
 listedPerKind: Number(env.LISTED_PER_KIND) || 6,
 // A listed room starts afresh after this long with nobody in it.
 publicReset: 20,
 // A player-made room closes after this long with nobody in it (long enough
 // for everyone to reload onto a new map and come back).
 privateIdle: 60,
 maxPrivateRooms: Number(env.MAX_PRIVATE_ROOMS) || 40,

 // Abuse limits. One address may be a whole school behind one router, so
 // the per-address numbers are generous.
 maxConnections: Number(env.MAX_CONNECTIONS) || 400,
 maxConnectionsPerIp: Number(env.MAX_CONNECTIONS_PER_IP) || 32,
 createsPerMinutePerIp: 6,
 // New connections a minute from one address (a map move reconnects everyone
 // in the room once; a class on one address joining together fits too).
 connectsPerMinutePerIp: Number(env.CONNECTS_PER_MINUTE_PER_IP) || 90,
 // Bytes in one message from a player (inputs are ~400).
 maxMessageBytes: 8192,
 // Messages a second from one player (inputs come 60 a second).
 maxMessagesPerSecond: 180,
 // A player's socket with this much still waiting to go out gets no new
 // snapshot until it drains (the next snapshot replaces it anyway).
 backlogBytes: 256 * 1024,
 // Seconds a connection gets to say which room it wants.
 helloTimeout: 10,
});
