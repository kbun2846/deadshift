// A read-only record whose contents are made the first time anything looks at
// it. Lumen's furniture catalogue and placements are large tables built from
// many small parts; building them when `maps.js` is imported cost every page
// load (every map, phones included) a quarter of a second, so the exports that
// used to be plain frozen objects are these, and the work happens on first use
// (a Lumen room's colliders, its models, or a test reading the table).
// `make()` runs once; keys, `in`, `Object.keys/entries` and property reads all
// behave as they did on the frozen object it returns.
export function lazyRecord(make) {
  let real = null;
  const load = () => real ??= make();
  const readOnly = () => false; // (a frozen table: writes fail as they did)
  return new Proxy({}, {
    get: (_, key) => Reflect.get(load(), key),
    has: (_, key) => Reflect.has(load(), key),
    ownKeys: () => Reflect.ownKeys(load()),
    // (An own property the empty target lacks must be reported configurable.)
    getOwnPropertyDescriptor: (_, key) => { const d = Reflect.getOwnPropertyDescriptor(load(), key); return d && { ...d, configurable: true }; },
    set: readOnly, defineProperty: readOnly, deleteProperty: readOnly,
  });
}
