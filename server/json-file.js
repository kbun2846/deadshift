// Small JSON files in DATA_DIR (maintenance, the admin log, the traffic
// counter): read with a fallback, written to a spare file and swapped in so
// a crash mid-write never leaves half a file.
import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import { join, dirname } from 'node:path';

export const dataFile = (dir, name) => (dir ? join(dir, name) : null);

export function readJson(file, fallback) {
 if (!file) return fallback;
 try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return fallback; }
}

export function writeJson(file, value, { mode = 0o640 } = {}) {
 if (!file) return false;
 try {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file + '.tmp', JSON.stringify(value, null, 1), { mode });
  renameSync(file + '.tmp', file);
  return true;
 } catch (error) { console.error('Could not save', file + ':', error.message); return false; }
}
