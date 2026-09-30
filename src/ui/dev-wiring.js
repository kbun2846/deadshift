// Developer tools wired into the game (see dev-options.js, dev-tools.js,
// dev-window.js, dev-unlock-dialog.js). Nothing about them shows until the
// player pauses, presses Shift+P (or uses the title's link) and enters the
// code, which is checked against a hash (dev-code.js) and never stored here.
//
// `ctx` gives what main.js owns: the solo sim and view, the robots, getters
// for things made later or that change (online, settingsPanel, started,
// paused), and callbacks to redraw.
import { explosionFor } from '../simulation.js';
import { showBusy } from './busy-screen.js';
import { launchTo } from '../launch.js';
import { RULES } from '../config/gameplay.js';
import { installDevTools } from './dev-tools.js';
import { createDevWindow } from './dev-window.js';
import { createDevUnlockDialog } from './dev-unlock-dialog.js';
import { weaponFromChoice } from './weapon-grid.js';
import { weapon as weaponInfo } from '../items.js';
import { workMaps } from '../maps.js';
import { setMaintenanceLifted } from '../weapon-maintenance.js';

export function installDevWiring(ctx) {
 const { $, sim, view, bots, toast } = ctx;
 const spawnBird = () => view.birds.spawnNext(view.focus, view.birdView())?.name;
 function closeDevPanel() {
  $('dev-panel').classList.add('hidden');
  $('settings-panel').classList.remove('with-dev');
  $('dev-open').setAttribute('aria-expanded', 'false');
 }
 function showDevEntry(unlocked) {
  $('dev-open').hidden = !unlocked;
  document.body.classList.toggle('dev-unlocked', !!unlocked);
  if (!unlocked) closeDevPanel();
 }
 function devChanged() {
  if (ctx.online().active) delete sim.dev.targetHealth;
  else sim.syncTargetHealth();
  ctx.changed();
  document.body.classList.toggle('dev-hide-hud', !!sim.dev.hideHud);
  setMaintenanceLifted(!!sim.dev.maintenanceOff);
  devTools.sync(); devWindow.sync();
 }
 const robotsAllowed = () => {
  if (ctx.online().active) { toast('ROBOTS ARE SOLO ONLY'); return false; }
  if (!ctx.started()) { toast('START A GAME FIRST'); return false; }
  return true;
 };
 const hooks = {
  spawnBird: () => { const name = spawnBird(); if (name) toast('BIRD · ' + String(name).toUpperCase()); },
  hurt: () => sim.damagePlayer(10, 'dev', false, false, null, 'gunshot'),
  kill: () => sim.damagePlayer(sim.player.hp, 'dev', false, false, null, 'gunshot'),
  respawnTargets: () => toast(sim.respawnTargets() + ' TARGETS BACK'),
  restoreProps: () => toast(sim.restoreAllProps() + ' PROPS REBUILT'),
  // A map still being built (Test Hill and the like), with the weapon in hand.
  loadWorkMap: () => {
   const map = workMaps()[sim.dev.workMap || 0]; if (!map) return;
   if (ctx.online().active) { toast('MAPS ARE SOLO ONLY'); return; }
   // (The note says this load was asked for, so it starts the game: menu.js markLaunch.)
   const query = 'play=1&map=' + encodeURIComponent(map.id) + '&weapon=' + encodeURIComponent(sim.weapon || 'static');
   showBusy(); launchTo(query);
  },
  // Robots (bots/): a solo game only. Weapon, side, skill and style as set
  // in the tools (or at random), as many as "Robots per spawn".
  spawnRobot: (body=sim.dev.robotBody) => {
   if (!robotsAllowed()) return;
   const weapon = weaponFromChoice(sim.dev.robotWeapon);
   // Skill and style (bots/robot-profile.js): picked here, or at random.
   // Untouched, a robot is a normal one, as the menus' are: normal skill, a
   // blend of styles, a shifting temper (owner, v0.990a: "make it so all bot
   // settings default to normal"; they were random, steady).
   const skill = [null, 'easy', 'normal', 'hard', 'rookie', 'expert', 'perfect'][sim.dev.robotSkill ?? 2] || null, style = [null, 'balanced', 'rusher', 'marksman', 'flanker', 'cautious', 'blend'][sim.dev.robotStyle ?? 6] || null;
   const temper = [null, 'calm', 'shifting', 'aggressive'][sim.dev.robotTemper ?? 2] || null;
   const made = [];
   for (let i = 0; i < (sim.dev.robotCount || 1); i++) { const bot = bots.spawn(sim, weapon, { team: ['ffa', 'red', 'blue'][sim.dev.robotSide || 0] || 'ffa', skill, style, temper, human:body===1 }); if (bot) made.push(bot); else break; }
   const bot = made[0];
   toast(!bot ? 'ROBOT LIMIT REACHED' : made.length > 1 ? made.length + ' ROBOTS IN' : [bot.name, bot.make, weaponInfo(bot.sim.weapon)?.name || bot.sim.weapon, bot.profile.label].join(' · ').toUpperCase());
  },
  spawnHumanBot: () => hooks.spawnRobot(1),
  // Four enemies, every weapon and skill at random, free for all.
  spawnBrawl: () => {
   if (!robotsAllowed()) return;
   let n = 0; for (let i = 0; i < 4; i++) if (bots.spawn(sim, null, { team: 'ffa' })) n++;
   toast(n ? n + ' ROBOTS IN · FREE FOR ALL' : 'ROBOT LIMIT REACHED');
  },
  hurtRobots: () => toast(bots.hurtAll(100) + ' ROBOTS HURT'),
  destroyRobots: () => toast(bots.destroyAll() + ' ROBOTS DESTROYED'),
  randomSpot: () => { toast(ctx.randomSpot() ? 'MOVED' : 'NO SPOT FOUND'); },
  breakNearby: () => { const p = sim.player; sim.breakAround(p.x, p.z, 8); },
  // Everyday overrides all on at once.
  everything: () => { Object.assign(sim.dev, { ammo: true, stamina: true, cooldowns: true, orbs: true, rifleInstantReload: true, shotgunInstantReload: true, grenadeCooldown: true }); toast('UNLIMITED EVERYTHING'); },
  // Every override off (the tools stay unlocked).
  resetDev: () => { for (const key of Object.keys(sim.dev)) delete sim.dev[key]; sim.dev.speed = 1; sim.player.maxHp = RULES.playerHealth; sim.player.hp = Math.min(sim.player.hp, sim.player.maxHp); toast('DEV SETTINGS RESET'); },
  fillOrbs: () => {
   if (sim.weapon !== 'static') { toast('STATIC ONLY'); return; }
   sim.ammo = 12; for (let i = 0; i < 12 && sim.seeds.length < 12 && sim.ammo > 0; i++) sim.seed();
   toast('ORBS PLACED');
  },
  surgeNow: () => {
   if (sim.weapon !== 'rifle' || !sim.surge) { toast('NOMINAL ONLY'); return; }
   const s = sim.surge; Object.assign(s, { phase: 'active', t: 0, active: true, cooldown: 0 }); sim.rifle.ammo = sim.rifle.capacity; sim.rifle.reload = 0;
   sim.events.push({ type: 'surgeStart', x: sim.player.x, z: sim.player.z, duration: 5 });
  },
  sheathReady: () => { if (sim.weapon !== 'sheath') { toast('SHEATH ONLY'); return; } sim.sheath.eCooldown = sim.sheath.xCooldown = 0; toast('READY'); },
  sheathBlood: () => { if (sim.weapon !== 'sheath') { toast('SHEATH ONLY'); return; } sim.sheath.blood = 1; toast('BLADE BLOODIED'); },
  scatterNow: () => {
   if (sim.weapon !== 'shotgun' || !sim.scatter) { toast('BALLAST ONLY'); return; }
   sim.scatter.cooldown = 0; sim.scatter.armed = true; sim.events.push({ type: 'scatterArm', x: sim.player.x, z: sim.player.z });
  },
  killTargets: () => { let n = 0; for (const t of sim.targets) if (t.hp > 0 && t.kind !== 'robot' && t.kind !== 'player') { sim.hit(t, { damage: t.hp, owner: 'dev' }); n++; } toast(n + ' TARGETS DOWN'); },
  removeRobots: () => { const n = bots.count; for(const b of bots.bots)if(b.human)view.remoteCorpses?.remove(b.slot); bots.clear(); view.robotWrecks?.clear(); view.remote?.clear(); toast(n + ' ROBOTS REMOVED'); },
  // Looks only: the same event a real volley sends, with no damage behind it.
  previewBlast: () => {
   const p = sim.player, count = sim.dev.blastOrbs || 6, blast = explosionFor(count);
   sim.events.push({ type: 'explosion', x: p.x + p.aimX * 6, z: p.z + p.aimZ * 6, count, radius: blast.radius, damage: 0, preview: true });
  },
 };
 const devTools = installDevTools(sim, $('dev-panel'), () => devChanged(), {
  ...hooks,
  onUnlock: () => showDevEntry(true),
  onLock: () => { showDevEntry(false); devWindow.hide(); },
 });
 if ($('dev-open') && $('dev-panel')) $('dev-open').onclick = () => {
  const opening = $('dev-panel').classList.contains('hidden');
  $('dev-panel').classList.toggle('hidden', !opening);
  $('settings-panel').classList.toggle('with-dev', opening);
  $('dev-open').setAttribute('aria-expanded', String(opening));
  if (opening) $('dev-panel').querySelector('summary,select,input,button')?.focus();
 };
 const devWindow = createDevWindow($('game'), {
  sim, hooks,
  quality: () => ctx.settings().quality,
  setQuality: name => { $('graphics-preset').value = name; ctx.settingsPanel().applySettings(); },
  changed: () => devChanged(),
 });
 // Opened from the pause menu, and returns to it.
 let fromTitle = false;
 const devDialog = createDevUnlockDialog($('game'), {
  unlock: code => devTools.unlock(code),
  open: () => { $('pause-panel').classList.add('hidden'); },
  close: () => { if (ctx.paused()) { $('pause-panel').classList.remove('hidden'); $('resume').focus(); } else if (fromTitle) { $('title-dev').focus(); queueMicrotask(() => { fromTitle = false; }); } },
  enabled: () => { if (fromTitle) { fromTitle = false; devWindow.show(); } toast('DEV TOOLS UNLOCKED · O OPENS THE WINDOW', 2600); },
 });
 // The title's quick link: the code first (the same dialog as Shift+P), then
 // it just opens and closes the developer window.
 $('title-dev').onclick = () => { if (devTools.isUnlocked()) devWindow.toggle(); else { fromTitle = true; devDialog.show(); } };
 const showDevNotice = enabled => toast(enabled ? 'DEV TOOLS ON' : 'DEV TOOLS OFF');
 return { devTools, devWindow, devDialog, showDevNotice };
}
