// The JOIN page's list (join-list.js): which open games to show, and in what
// order. Kept apart from the page so the tests can run it.
export const SORTS = Object.freeze([{ id: 'fewest', name: 'FEWEST FIRST' }, { id: 'most', name: 'MOST FIRST' }]);

// The rows to show: the chosen map and mode ('any' for all), ordered by how
// many players are in them (then map, then mode, so the order holds still).
export function pickRooms(rooms, { map = 'any', mode = 'any', sort = 'fewest' } = {}, { mapOrder = [], modeOrder = [] } = {}) {
 const at = (list, id) => { const i = list.indexOf(id); return i < 0 ? list.length : i; };
 const way = sort === 'most' ? -1 : 1;
 return (rooms || [])
  .filter(r => (map === 'any' || r.map === map) && (mode === 'any' || r.mode === mode))
  .sort((a, b) => way * ((a.players || 0) - (b.players || 0)) || at(mapOrder, a.map) - at(mapOrder, b.map) || at(modeOrder, a.mode) - at(modeOrder, b.mode) || String(a.code).localeCompare(String(b.code)));
}
