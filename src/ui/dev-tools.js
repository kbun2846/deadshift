// The Developer tools panel beside Settings. It stays empty and hidden until
// the code is entered (pause, Shift+P, the access code: dev-code.js); before that nothing in the
// game mentions the tools. The options themselves come from dev-options.js,
// shared with the floating window on O.
import { buildDevOptions, refill, toggleDevOverrides } from './dev-options.js';
import { checkDevCode } from './dev-code.js';
import { RULES } from '../config/gameplay.js';
export { toggleDevOverrides };

// Stands in for the panel when the markup it needs is not there. Every caller
// keeps working; the tools are simply absent and permanently locked.
const devToolsStub = () => ({ isUnlocked: () => false, sync() {}, syncSpeed() {}, unlock: () => false, toggleAll: () => null, lock() {} });

export function installDevTools(sim, panel, changed, hooks = {}) {
  // The developer panel is optional scaffolding, so it must never be able to
  // take the game down with it: an index.html that has gone out of step with
  // the script -- a stale deploy, say -- used to throw here and abort startup
  // entirely, leaving the menu on screen with nothing wired up behind it.
  if (!panel) return devToolsStub();
  const root = document.createElement('section'); root.className = 'dev-tools';
  root.innerHTML = '<div id="dev-options" hidden><p class="small">P switches the everyday overrides on or off together · O opens the floating window</p><div class="dev-option-list"></div><button type="button" id="dev-lock" class="secondary plain-text">DISABLE & LOCK TOOLS</button></div>';
  panel.append(root);
  const options = root.querySelector('#dev-options');
  let unlocked = false, built = null;

  function unlock(code) {
    if (!checkDevCode(code)) return false;
    unlocked = true; options.hidden = false;
    // Built on unlock, not at startup: until then the page holds no trace of the tools.
    built ||= buildDevOptions(root.querySelector('.dev-option-list'), { sim, where: 'settings', hooks: { refill: () => refill(sim), ...hooks }, changed });
    built.sync(); hooks.onUnlock?.();
    return true;
  }
  function lock() {
    sim.dev = {}; unlocked = false;
    // Anything the tools changed on the body goes back (dev max health).
    sim.player.maxHp = RULES.playerHealth; sim.player.hp = Math.min(sim.player.hp, sim.player.maxHp); options.hidden = true; built?.sync(); hooks.onLock?.(); changed();
  }
  root.querySelector('#dev-lock').onclick = lock;
  return {
    isUnlocked() { return unlocked; },
    sync() { built?.sync(); },
    syncSpeed() { built?.sync(); },
    unlock, lock,
    toggleAll() {
      if (!unlocked) return null;
      const enabled = toggleDevOverrides(sim.dev);
      built?.sync(); changed(); return enabled;
    },
  };
}
