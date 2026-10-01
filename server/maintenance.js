// Maintenance mode (admin page): while it is on, new rooms and joins are
// refused with its message; matches already running carry on. Kept in
// DATA_DIR/maintenance.json so a restart (often the reason for it) keeps it.
import { dataFile, readJson, writeJson } from './json-file.js';

export const MAINTENANCE_TEXT = 'Servers are updating, back in a few minutes.';

export class Maintenance {
 constructor(dir) {
  this.file = dataFile(dir, 'maintenance.json');
  const saved = readJson(this.file, null);
  this.state = { on: !!saved?.on, text: typeof saved?.text === 'string' && saved.text ? saved.text.slice(0, 140) : MAINTENANCE_TEXT, by: saved?.by || null, at: saved?.at || null };
 }

 get on() { return this.state.on; }
 get text() { return this.state.text || MAINTENANCE_TEXT; }

 set({ on, text, by }) {
  this.state = { on: !!on, text: String(text || '').trim().slice(0, 140) || MAINTENANCE_TEXT, by: String(by || '').slice(0, 24), at: new Date().toISOString() };
  writeJson(this.file, this.state);
  return this.state;
 }
}
