import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { xAbilityState } from '../src/ui/x-ability-state.js';

test('X ability colour states: red recharging, pink ready, yellow charging, blue in use', () => {
 const rifle = surge => ({ weapon: 'rifle', surge });
 assert.equal(xAbilityState(rifle({ phase: 'idle', cooldown: 0 })), 'ready');
 assert.equal(xAbilityState(rifle({ phase: 'idle', cooldown: 12 })), 'cooldown');
 assert.equal(xAbilityState(rifle({ phase: 'charging', cooldown: 0 })), 'charging');
 assert.equal(xAbilityState(rifle({ phase: 'active', cooldown: 0 })), 'active');
 const stat = o => ({ weapon: 'static', hexOrbs: [], hexSpin: null, hexCooldown: 0, ...o });
 assert.equal(xAbilityState(stat({})), 'ready');
 assert.equal(xAbilityState(stat({ hexCooldown: 5 })), 'cooldown');
 assert.equal(xAbilityState(stat({ hexCooldown: 5, hexOrbs: [{}] })), 'charging', 'orbs forming or spreading');
 assert.equal(xAbilityState(stat({ hexCooldown: 5, hexSpin: {} })), 'active');
 const bal = o => ({ weapon: 'shotgun', scatter: { armed: false, cooldown: 0 }, scatterShells: [], ...o });
 assert.equal(xAbilityState(bal({})), 'ready');
 assert.equal(xAbilityState(bal({ scatter: { armed: true, cooldown: 0 } })), 'charging', 'Scatter readied');
 assert.equal(xAbilityState(bal({ scatter: { armed: false, cooldown: 39 }, scatterShells: [{}] })), 'active', 'shells in the air');
 assert.equal(xAbilityState(bal({ scatter: { armed: false, cooldown: 20 } })), 'cooldown');
 const css = readFileSync(new URL('../src/styles/x-ability.css', import.meta.url), 'utf8');
 for (const s of ['cooldown', 'ready', 'charging', 'active']) assert.match(css, new RegExp(`\\[data-x-state=${s}\\]`));
 assert.match(readFileSync(new URL('../src/main.js', import.meta.url), 'utf8'), /import '\.\/styles\/x-ability\.css'/);
});
