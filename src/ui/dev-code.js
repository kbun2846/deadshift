// The developer tools' access code, checked without the code itself being in
// the source (the repository is public): only a salted, stretched SHA-256 of
// it is here, and what is typed is put through the same and compared.
//
// Honest limits: this keeps the code from being read off the page or GitHub.
// It cannot stop someone determined from trying every 8-digit code against the
// hash, or from editing their own copy of the game to skip the check (it is
// all client-side). Changing the code: put the new one through devCodeHash
// (node -e "import('./src/ui/dev-code.js').then(m=>console.log(m.devCodeHash('NEW')))")
// and paste the result into DEV_CODE_HASH. Never write the code itself into
// the repository (AGENTS.md included).
export const DEV_CODE_SALT = 'deadshift/dev-tools/v2';
export const DEV_CODE_ROUNDS = 4000;
export const DEV_CODE_HASH = 'd8fb7ea24df4d5864fc1619d360f6320bae5e54c94531959100f024fa20fb412';

const K = new Uint32Array([0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2]);
const rotr = (x, n) => (x >>> n) | (x << (32 - n));
// SHA-256 of bytes, as bytes (plain JS: works on an http page too, where
// crypto.subtle is missing).
export function sha256(bytes) {
 const len = bytes.length, total = ((len + 9 + 63) >> 6) << 6, m = new Uint8Array(total);
 m.set(bytes); m[len] = 0x80;
 const bits = len * 8; for (let i = 0; i < 4; i++) m[total - 1 - i] = (bits / 2 ** (8 * i)) & 255;
 const h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]), w = new Uint32Array(64);
 for (let o = 0; o < total; o += 64) {
  for (let i = 0; i < 16; i++) w[i] = (m[o + i * 4] << 24) | (m[o + i * 4 + 1] << 16) | (m[o + i * 4 + 2] << 8) | m[o + i * 4 + 3];
  for (let i = 16; i < 64; i++) {
   const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3), s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
   w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
  }
  let [a, b, c, d, e, f, g, k] = h;
  for (let i = 0; i < 64; i++) {
   const t1 = (k + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) | 0;
   const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
   k = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
  }
  h[0] += a; h[1] += b; h[2] += c; h[3] += d; h[4] += e; h[5] += f; h[6] += g; h[7] += k;
 }
 const out = new Uint8Array(32); for (let i = 0; i < 8; i++) for (let j = 0; j < 4; j++) out[i * 4 + j] = (h[i] >>> (24 - 8 * j)) & 255;
 return out;
}
const hex = b => Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
export function devCodeHash(code) {
 let d = sha256(new TextEncoder().encode(DEV_CODE_SALT + ':' + String(code).trim()));
 for (let i = 1; i < DEV_CODE_ROUNDS; i++) d = sha256(d);
 return hex(d);
}
export const checkDevCode = code => devCodeHash(code) === DEV_CODE_HASH;
