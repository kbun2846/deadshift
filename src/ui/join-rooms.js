// The JOIN page's list (join-list.js): which open games to show, and in what
// order. Kept apart from the page so the tests can run it.
// (Labels kept short, owner 2026-09-30: the filters' fitted lettering has to
// read at a glance; the row says "players", the buttons which come first.)
export const SORTS = Object.freeze([{ id: 'fewest', name: 'FEWEST' }, { id: 'most', name: 'MOST' }]);
// A map's name on a filter button: its first word when the whole name is long
// ("Deadwater Outpost" → DEADWATER); the rows still show the full name.
export const filterName = name => String(name).length > 12 ? String(name).split(/\s+/)[0] : String(name);

// The rows to show: the chosen map and mode ('any' for all), ordered by how
// many players are in them (then map, then mode, so the order holds still).
export function pickRooms(rooms, { map = 'any', mode = 'any', sort = 'fewest' } = {}, { mapOrder = [], modeOrder = [] } = {}) {
 const at = (list, id) => { const i = list.indexOf(id); return i < 0 ? list.length : i; };
 const way = sort === 'most' ? -1 : 1;
 return (rooms || [])
  .filter(r => (map === 'any' || r.map === map) && (mode === 'any' || r.mode === mode))
  .sort((a, b) => way * ((a.players || 0) - (b.players || 0)) || at(mapOrder, a.map) - at(mapOrder, b.map) || at(modeOrder, a.mode) - at(modeOrder, b.mode) || String(a.code).localeCompare(String(b.code)));
}
