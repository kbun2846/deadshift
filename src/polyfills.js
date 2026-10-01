// Older browsers (owner, 2026-09-30: his mom's MacBook showed a giant, cut-off
// "deadsta" with no blood and dead buttons, on GitHub Pages too). Safari before
// 15.4 (macOS updates from before March 2022) has no Array/String .at() and no
// Object.hasOwn, which the game uses everywhere, so startup threw
// "x.at is not a function" and left the bare menu on screen. These fill in only
// what is missing and change nothing where the browser already has them.
// bootstrap.js imports this FIRST, before anything else runs.
function define(proto, name, fn) {
  if (proto && typeof proto[name] !== 'function') {
    Object.defineProperty(proto, name, { value: fn, writable: true, configurable: true, enumerable: false });
  }
}
function at(index) {
  const length = this.length >>> 0;
  let i = Math.trunc(Number(index)) || 0;
  if (i < 0) i += length;
  return i < 0 || i >= length ? undefined : this[i];
}
define(Array.prototype, 'at', at);
define(String.prototype, 'at', function (index) { return at.call(String(this), index); });
const TypedArray = Object.getPrototypeOf(Int8Array.prototype);
define(TypedArray, 'at', at);
define(Array.prototype, 'findLast', function (test, self) { for (let i = this.length - 1; i >= 0; i--) if (test.call(self, this[i], i, this)) return this[i]; return undefined; });
define(Array.prototype, 'findLastIndex', function (test, self) { for (let i = this.length - 1; i >= 0; i--) if (test.call(self, this[i], i, this)) return i; return -1; });
if (typeof Object.hasOwn !== 'function') {
  Object.defineProperty(Object, 'hasOwn', { value: (object, key) => Object.prototype.hasOwnProperty.call(Object(object), key), writable: true, configurable: true });
}
