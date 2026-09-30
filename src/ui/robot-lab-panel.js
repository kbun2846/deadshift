// The robot lab's panel (developer tools > Robots > Robot lab; the lab
// itself is bots/robot-lab.js). A floating window like the dev window (its
// look, dragged by its bar), with three tabs:
//   SETUP    placing (PLACE: click the ground to drop a robot, right-click a
//            spot to take it away; a card's MOVE, then a click, moves it), the
//            next robot's side, weapon (fixed, random each round, every
//            matchup), skill, style, temper, health and aim; the rounds (how
//            many, a time limit, the pause between, each matchup's repeats,
//            props rebuilt, whether they know where each other are); the
//            camera (free: walk to fly, you are a ghost; or follow a robot),
//            fly speed, game speed, freeze, health bars and spot markers.
//   ROBOTS   a live card per robot: health, ammo, reload, every ability's
//            state and seconds, dodges, its head (mode, plan, target, mood),
//            this round's numbers and its averages; edit, move, follow, remove.
//   RESULTS  per weapon (rounds, win %, K/D, damage a round, hits per attack,
//            time to kill), every matchup's wins, the last rounds, and the
//            whole log as CSV (copy or download).
// Over the world: a health bar over each lab robot and a marker on each spot.
// No game rules here: everything goes through the lab.
import { WEAPONS, weapon as weaponInfo } from '../items.js';
import { playableWeapons } from '../weapon-maintenance.js';
import { LAB_SIDES, averages } from '../bots/robot-lab.js';
import { labReadout } from '../bots/lab-readout.js';

const esc = text => String(text ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const weaponName = id => weaponInfo(id)?.name || id || '-';
const SIDE_CLASS = { red: 'lab-a', blue: 'lab-b', ffa: 'lab-f' };
const secs = n => n >= 10 ? Math.round(n) + 's' : n.toFixed(1) + 's';
const pct = n => Math.round(n * 100) + '%';
export const LAB_CHOICES = Object.freeze({
 side: LAB_SIDES.map(s => [s.id, s.label]),
 weaponMode: [['fixed', 'Fixed weapon'], ['random', 'Random each round'], ['matchup', 'Every matchup in turn']],
 skill: [['', 'Random'], ['rookie', 'Rookie'], ['easy', 'Easy'], ['normal', 'Normal'], ['hard', 'Hard'], ['expert', 'Expert'], ['perfect', 'Perfect']],
 style: [['', 'Random'], ['balanced', 'Balanced'], ['rusher', 'Rusher'], ['marksman', 'Marksman'], ['flanker', 'Flanker'], ['cautious', 'Cautious'], ['blend', 'Blend']],
 temper: [['', 'None (steady)'], ['calm', 'Calm'], ['shifting', 'Shifting'], ['aggressive', 'Aggressive']],
 health: [['50', '50'], ['100', '100'], ['150', '150'], ['200', '200'], ['300', '300'], ['500', '500']],
 aim: [['1', 'As its skill'], ['0.6', 'Sharper'], ['1.6', 'Sloppier']],
 rounds: [['0', 'Endless'], ['5', '5'], ['10', '10'], ['25', '25'], ['50', '50'], ['100', '100'], ['cycle', 'Every matchup once']],
 timeLimit: [['0', 'None'], ['30', '30 s'], ['60', '60 s'], ['90', '90 s'], ['120', '120 s'], ['180', '180 s']],
 gap: [['0.5', '0.5 s'], ['1.5', '1.5 s'], ['3', '3 s'], ['5', '5 s']],
 repeat: [['1', '1'], ['2', '2'], ['3', '3'], ['5', '5'], ['10', '10']],
 fly: [['1', '1×'], ['2', '2×'], ['4', '4×']],
 timeScale: [['0.25', '¼×'], ['0.5', '½×'], ['1', '1×'], ['2', '2×']],
});
const options = (list, value) => list.map(([v, n]) => `<option value="${esc(v)}"${String(v) === String(value ?? '') ? ' selected' : ''}>${esc(n)}</option>`).join('');
const weaponOptions = value => options(playableWeapons().map(w => [w.id, w.name]), value);
const select = (attr, key, list, value, label) => `<label class="lab-field"><span>${esc(label)}</span><select ${attr}="${esc(key)}">${options(list, value)}</select></label>`;
const check = (attr, key, on, label) => `<label class="lab-check"><input type="checkbox" ${attr}="${esc(key)}"${on ? ' checked' : ''}><span>${esc(label)}</span></label>`;

export function createRobotLabPanel(root, { lab, bots, sim, toast = () => {}, close = () => {}, canRun = () => null, document: doc = globalThis.document }) {
 const panel = doc.createElement('section');
 panel.className = 'dev-window robot-lab hidden';
 panel.setAttribute('aria-label', 'Robot lab');
 // The next robot placed gets these.
 const next = { side: 'red', weaponMode: 'fixed', weapon: playableWeapons()[0]?.id || WEAPONS[0].id, skill: 'normal', style: 'blend', temper: 'shifting', health: 100, aim: 1 };
 const view = { tab: 'setup', bars: true, spots: true };
 let placing = false, moving = null, cardsAt = 0, resultsAt = 0, resultsKey = '';
 panel.innerHTML = `<header class="dev-window-bar lab-bar"><span>ROBOT LAB</span><span class="dev-window-actions"><button type="button" class="dev-window-close plain-text" data-act="fold" aria-label="Fold the robot lab to its status" aria-pressed="false">–</button><button type="button" class="dev-window-close plain-text" data-act="close" aria-label="Close the robot lab">×</button></span></header>
  <div class="lab-status" role="status" aria-live="polite"><b class="lab-state">STOPPED</b><span class="lab-round"></span><span class="lab-last"></span></div>
  <div class="lab-controls"><button type="button" data-act="start">START</button><button type="button" data-act="stop">STOP</button><button type="button" data-act="skip">NEXT ROUND</button><button type="button" data-act="reset">RESET STATS</button></div>
  <nav class="lab-tabs" role="tablist"><button type="button" role="tab" data-tab="setup" aria-selected="true">SETUP</button><button type="button" role="tab" data-tab="robots" aria-selected="false">ROBOTS</button><button type="button" role="tab" data-tab="results" aria-selected="false">RESULTS</button></nav>
  <div class="lab-body">
   <div class="lab-page" data-page="setup"></div>
   <div class="lab-page" data-page="robots" hidden></div>
   <div class="lab-page" data-page="results" hidden></div>
  </div>`;
 root.append(panel);
 const $ = s => panel.querySelector(s), page = name => panel.querySelector(`.lab-page[data-page="${name}"]`);

 // --- over the world: health bars and spot markers ----------------------------
 const overlay = doc.createElement('div'); overlay.className = 'lab-overlay'; overlay.setAttribute('aria-hidden', 'true');
 root.append(overlay);
 const bars = new Map(), marks = new Map();
 const drop = (map, key) => { map.get(key)?.remove(); map.delete(key); };

 // --- SETUP ---------------------------------------------------------------------------
 function drawSetup() {
  const s = lab.settings;
  const follow = [['', 'Free (walk to fly)'], ...lab.entries.map(e => [e.key, 'Follow ' + e.label])];
  page('setup').innerHTML = `
   <button type="button" class="lab-place${placing ? ' on' : ''}" data-act="place" aria-pressed="${placing}">${placing ? 'PLACING: CLICK THE GROUND' : 'PLACE ROBOTS'}</button>
   <p class="lab-note">${placing ? 'Left click: drop a robot · right click on a spot: take it away' : lab.count + ' of 8 placed · ' + (lab.count ? 'START runs them' : 'place at least one on each side')}</p>
   <fieldset class="lab-group"><legend>next robot</legend>
    ${select('data-next', 'side', LAB_CHOICES.side, next.side, 'Side')}
    ${select('data-next', 'weaponMode', LAB_CHOICES.weaponMode, next.weaponMode, 'Weapon')}
    ${next.weaponMode === 'fixed' ? `<label class="lab-field"><span>Which</span><select data-next="weapon">${weaponOptions(next.weapon)}</select></label>` : ''}
    ${select('data-next', 'skill', LAB_CHOICES.skill, next.skill, 'Skill')}
    ${select('data-next', 'style', LAB_CHOICES.style, next.style, 'Style')}
    ${select('data-next', 'temper', LAB_CHOICES.temper, next.temper, 'Temper')}
    ${select('data-next', 'health', LAB_CHOICES.health, next.health, 'Health')}
    ${select('data-next', 'aim', LAB_CHOICES.aim, next.aim, 'Aim')}
   </fieldset>
   <fieldset class="lab-group"><legend>rounds</legend>
    ${select('data-set', 'rounds', LAB_CHOICES.rounds, s.rounds, 'Rounds')}
    ${select('data-set', 'timeLimit', LAB_CHOICES.timeLimit, s.timeLimit, 'Time limit')}
    ${select('data-set', 'gap', LAB_CHOICES.gap, s.gap, 'Pause between')}
    ${select('data-set', 'repeat', LAB_CHOICES.repeat, s.repeat, 'Each matchup ×')}
    ${check('data-set', 'rebuild', s.rebuild, 'Rebuild broken props each round')}
    ${check('data-set', 'seeAll', s.seeAll, 'They know where each other are')}
   </fieldset>
   <fieldset class="lab-group"><legend>watching</legend>
    ${select('data-view', 'follow', follow, lab.follow || '', 'Camera')}
    ${select('data-dev', 'speed', LAB_CHOICES.fly, sim.dev.speed || 1, 'Fly speed')}
    ${select('data-dev', 'timeScale', LAB_CHOICES.timeScale, sim.dev.timeScale || 1, 'Game speed')}
    ${check('data-dev', 'freeze', !!sim.dev.freeze, 'Freeze (robots hold still)')}
    ${check('data-view', 'bars', view.bars, 'Health bars over robots')}
    ${check('data-view', 'spots', view.spots, 'Show spots')}
    ${check('data-dev', 'robotMinds', !!sim.dev.robotMinds, 'Thoughts over robots')}
   </fieldset>
   <button type="button" class="lab-danger" data-act="clear">CLEAR ALL SPOTS</button>`;
 }

 // --- ROBOTS -------------------------------------------------------------------------
 const card = e => `<article class="lab-card ${SIDE_CLASS[e.side]}" data-key="${esc(e.key)}">
   <header><b class="lab-tag">${esc(e.label)}</b><span class="lab-weapon"></span><span class="lab-card-actions"><button type="button" class="plain-text" data-card="follow" aria-pressed="${lab.follow === e.key}" title="Follow with the camera">FOLLOW</button><button type="button" class="plain-text" data-card="move" title="Move its spot: then click the ground">MOVE</button><button type="button" class="plain-text" data-card="remove" title="Take it away">×</button></span></header>
   <div class="lab-hp"><i></i><span></span></div>
   <p class="lab-line lab-gun"></p>
   <p class="lab-abilities"></p>
   <p class="lab-line lab-mind"></p>
   <p class="lab-line lab-profile"></p>
   <p class="lab-line lab-round-stats"></p>
   <p class="lab-line lab-totals"></p>
   <p class="lab-line lab-used"></p>
   <details class="lab-edit"><summary>edit</summary>
    ${select('data-edit', 'side', LAB_CHOICES.side, e.side, 'Side')}
    ${select('data-edit', 'weaponMode', LAB_CHOICES.weaponMode, e.weaponMode, 'Weapon')}
    <label class="lab-field"><span>Which</span><select data-edit="weapon">${weaponOptions(e.weapon)}</select></label>
    ${select('data-edit', 'skill', LAB_CHOICES.skill, e.skill, 'Skill')}
    ${select('data-edit', 'style', LAB_CHOICES.style, e.style, 'Style')}
    ${select('data-edit', 'temper', LAB_CHOICES.temper, e.temper, 'Temper')}
    ${select('data-edit', 'health', LAB_CHOICES.health, e.health, 'Health')}
    ${select('data-edit', 'aim', LAB_CHOICES.aim, e.aim, 'Aim')}
    <p class="lab-note">Changes take effect next round.</p>
   </details>
  </article>`;
 let cardKeys = '';
 function drawCards() {
  const keys = lab.entries.map(e => e.key + e.side + e.label + (lab.follow === e.key)).join();
  if (keys !== cardKeys) {
   cardKeys = keys;
   page('robots').innerHTML = lab.count ? lab.entries.map(card).join('') : '<p class="lab-note">No robots yet. SETUP → PLACE ROBOTS, then click the ground.</p>';
  }
  const name = id => lab.nameOf(id);
  for (const e of lab.entries) {
   const el = page('robots').querySelector(`.lab-card[data-key="${CSS.escape(e.key)}"]`); if (!el) continue;
   const set = (sel, text) => { const n = el.querySelector(sel); if (n && n.textContent !== text) n.textContent = text; };
   const mode = e.weaponMode === 'fixed' ? '' : e.weaponMode === 'random' ? ' · random' : ' · matchups';
   const st = lab.stats.robots.get(e.key), avg = st ? averages(st) : null;
   const totals = st ? `W ${st.wins} · L ${st.losses} · D ${st.draws} · K/D ${st.kills}/${st.deaths} · ${Math.round(avg.dealtPerRound)} dmg/round · ${avg.hitsPerAttack.toFixed(2)} hits/attack${avg.ttk != null ? ' · TTK ' + secs(avg.ttk) : ''}` : 'no rounds yet';
   set('.lab-used', st && Object.keys(st.abilities).length ? 'used: ' + Object.entries(st.abilities).sort((x, y) => y[1] - x[1]).map(([k, n]) => k + ' ' + n).join(' · ') + ' · ' + st.attacks + ' attacks' : '');
   if (!e.bot) {
    set('.lab-weapon', weaponName(e.weapon) + mode); set('.lab-hp span', 'not in the world (START)'); el.querySelector('.lab-hp i').style.width = '0%';
    for (const s of ['.lab-gun', '.lab-mind', '.lab-profile', '.lab-round-stats']) set(s, ''); el.querySelector('.lab-abilities').textContent = ''; set('.lab-totals', totals); continue;
   }
   const r = labReadout(e.bot, name);
   set('.lab-weapon', weaponName(r.weapon) + mode + ' · ' + String(e.bot.make || '').toUpperCase());
   el.querySelector('.lab-hp i').style.width = (r.maxHp ? Math.max(0, Math.min(1, r.hp / r.maxHp)) * 100 : 0).toFixed(1) + '%';
   el.classList.toggle('down', !r.alive);
   set('.lab-hp span', r.alive ? Math.ceil(r.hp) + ' / ' + r.maxHp : 'DOWN');
   set('.lab-gun', [r.ammo && 'ammo ' + r.ammo, r.reload > 0 ? 'reloading ' + secs(r.reload) : r.reloading ? 'empty' : '', 'dodges ' + r.dodges + (r.dodging ? ' (dodging)' : ''), 'speed ' + r.speed.toFixed(1)].filter(Boolean).join(' · '));
   const chips = r.abilities.map(a => `<span class="lab-chip" data-state="${a.state}">${esc(a.name)} ${a.state === 'ready' ? 'ready' : a.state === 'locked' ? 'locked' : a.left > 0 ? secs(a.left) : a.state}</span>`).join('');
   const box = el.querySelector('.lab-abilities'); if (box.dataset.html !== chips) { box.dataset.html = chips; box.innerHTML = chips; }
   const m = r.mind;
   set('.lab-mind', r.alive ? [m.mode + (m.why ? ' (' + m.why + ')' : ''), m.plan, m.target && '→ ' + m.target, m.mood].filter(Boolean).join(' · ') : 'down');
   set('.lab-profile', m.profile);
   set('.lab-round-stats', `this round: ${Math.round(e.bot.roundDealt || 0)} dealt · ${Math.round(e.bot.roundTaken || 0)} taken · ${e.bot.roundKills || 0} kills`);
   set('.lab-totals', totals);
  }
 }

 // --- RESULTS ------------------------------------------------------------------------
 function drawResults() {
  const key = lab.round + '|' + lab.stats.weapons.size + '|' + lab.log.length;
  if (key === resultsKey) return; resultsKey = key;
  const weapons = [...lab.stats.weapons.entries()].sort((a, b) => averages(b[1]).winRate - averages(a[1]).winRate);
  const wrows = weapons.map(([id, s]) => { const a = averages(s); return `<tr><th scope="row">${esc(weaponName(id))}</th><td>${s.rounds}</td><td>${pct(a.winRate)}</td><td>${s.kills}/${s.deaths}</td><td>${Math.round(a.dealtPerRound)}</td><td>${a.hitsPerAttack.toFixed(2)}</td><td>${a.ttk == null ? '-' : secs(a.ttk)}</td></tr>`; }).join('');
  const matchups = [...lab.stats.matchups.values()].sort((a, b) => b.rounds - a.rounds);
  const mrows = matchups.map(m => `<tr><th scope="row">${m.lineups.map((l, i) => esc(l.split('+').map(weaponName).join('+')) + ' <b>' + m.wins[i] + '</b>').join(' vs ')}</th><td>${m.draws}</td><td>${m.rounds}</td><td>${secs(m.time / m.rounds)}</td></tr>`).join('');
  const log = lab.log.slice(-12).reverse().map(r => `<li><b>#${r.round}</b> ${r.winner ? esc(r.winner) + ' wins' : 'draw'} <small>(${esc(r.reason)}, ${secs(r.time)}${r.matchup ? ', matchup ' + r.matchup.index + '/' + r.matchup.total : ''})</small><br>${r.robots.map(b => `<span class="${SIDE_CLASS[b.side]}">${esc(b.label)} ${esc(weaponName(b.weapon))} ${b.hp}hp ${b.dealt}dmg</span>`).join(' · ')}</li>`).join('');
  page('results').innerHTML = `
   <p class="lab-note">${lab.round} rounds · ${secs(lab.totalTime || 0)} of fighting${lab.matchupCount ? ' · ' + lab.matchupCount + ' matchups' : ''}</p>
   <p class="lab-note">A hit is a tick in which it hurt someone, so a stream or a hex counts many a trigger pull; TTK runs from a victim's first hit to its death.</p>
   <h4>by weapon</h4>
   ${wrows ? `<table class="lab-table"><thead><tr><th>weapon</th><th>rounds</th><th>win</th><th>K/D</th><th>dmg/rd</th><th>hits/atk</th><th>TTK</th></tr></thead><tbody>${wrows}</tbody></table>` : '<p class="lab-note">No rounds yet.</p>'}
   <h4>matchups</h4>
   ${mrows ? `<table class="lab-table"><thead><tr><th>line-up (wins)</th><th>draws</th><th>rounds</th><th>avg time</th></tr></thead><tbody>${mrows}</tbody></table>` : '<p class="lab-note">-</p>'}
   <h4>last rounds</h4>
   <ol class="lab-log">${log || '<li>-</li>'}</ol>
   <div class="lab-controls"><button type="button" data-act="copy">COPY CSV</button><button type="button" data-act="download">DOWNLOAD CSV</button></div>`;
 }

 // --- the status line ----------------------------------------------------------------
 function drawStatus() {
  const state = !lab.running ? 'STOPPED' : sim.dev.freeze ? 'FROZEN' : lab.phase === 'fighting' ? 'FIGHTING' : lab.phase === 'between' ? 'NEXT ROUND' : lab.phase === 'done' ? 'DONE' : 'READY';
  const limit = lab.roundLimit, m = lab.running ? lab.matchupAt() : null;
  const round = lab.running ? `round ${lab.round + (lab.phase === 'fighting' ? 1 : 0)}${limit ? '/' + limit : ''} · ${secs(lab.clock)}${m ? ' · matchup ' + m.index + '/' + m.total : ''}` : lab.round ? lab.round + ' rounds run' : '';
  const r = lab.lastRound, last = r ? `last: ${r.winner ? r.winner + ' won' : 'draw'} (${r.reason}, ${secs(r.time)})` : '';
  for (const [sel, text] of [['.lab-state', state], ['.lab-round', round], ['.lab-last', last]]) { const n = $(sel); if (n.textContent !== text) n.textContent = text; }
  $('.lab-state').dataset.state = state.toLowerCase().replace(' ', '-');
 }

 const showTab = name => {
  view.tab = name;
  for (const b of panel.querySelectorAll('[data-tab]')) b.setAttribute('aria-selected', String(b.dataset.tab === name));
  for (const p of panel.querySelectorAll('.lab-page')) p.hidden = p.dataset.page !== name;
  if (name === 'setup') drawSetup(); if (name === 'robots') { cardKeys = ''; drawCards(); } if (name === 'results') { resultsKey = ''; drawResults(); }
 };

 // --- clicks and changes ---------------------------------------------------------------
 const csvFile = () => { const blob = new Blob([lab.csv()], { type: 'text/csv' }), a = doc.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'robot-lab-' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-') + '.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); };
 panel.addEventListener('click', e => {
  const tab = e.target.closest('[data-tab]'); if (tab) { showTab(tab.dataset.tab); return; }
  const act = e.target.closest('[data-act]')?.dataset.act;
  if (act === 'close') { api.setPlacing(false); close(); return; }
  // Folded: only the status and the buttons (a phone keeps the fight in view).
  if (act === 'fold') { const on = panel.classList.toggle('folded'); e.target.closest('[data-act]').setAttribute('aria-pressed', String(on)); return; }
  if (act === 'place') { api.setPlacing(!placing); return; }
  if (act === 'start') { const why = canRun() || lab.start(sim); if (why) toast(why.toUpperCase()); else { api.setPlacing(false); toast('ROBOT LAB RUNNING'); showTab('robots'); } drawStatus(); return; }
  if (act === 'stop') { lab.stop(sim); toast('ROBOT LAB STOPPED'); cardKeys = ''; drawCards(); return; }
  if (act === 'skip') { lab.skip(sim); return; }
  if (act === 'reset') { lab.resetStats(); resultsKey = ''; drawResults(); toast('LAB STATS RESET'); return; }
  if (act === 'clear') { lab.clear(sim); cardKeys = ''; drawSetup(); toast('ALL SPOTS CLEARED'); return; }
  if (act === 'copy') { navigator.clipboard?.writeText(lab.csv()).then(() => toast('CSV COPIED'), () => toast('COULD NOT COPY')); return; }
  if (act === 'download') { csvFile(); return; }
  const c = e.target.closest('[data-card]'); if (!c) return;
  const key = c.closest('.lab-card')?.dataset.key;
  if (c.dataset.card === 'remove') { lab.remove(sim, key); cardKeys = ''; drawCards(); }
  if (c.dataset.card === 'follow') { lab.follow = lab.follow === key ? null : key; cardKeys = ''; drawCards(); }
  if (c.dataset.card === 'move') { moving = key; placing = true; toast('CLICK THE GROUND TO MOVE ' + (lab.byKey(key)?.label || '')); }
 });
 const value = el => el.type === 'checkbox' ? el.checked : el.value;
 const numberish = (k, v) => ['health', 'aim', 'timeLimit', 'gap', 'repeat'].includes(k) ? Number(v) : k === 'rounds' ? (v === 'cycle' ? 'cycle' : Number(v)) : ['skill', 'style', 'temper'].includes(k) ? v || null : v;
 panel.addEventListener('change', e => {
  const el = e.target;
  if (el.dataset.next) { next[el.dataset.next] = numberish(el.dataset.next, value(el)); if (el.dataset.next === 'weaponMode') drawSetup(); return; }
  if (el.dataset.set) { lab.settings[el.dataset.set] = numberish(el.dataset.set, value(el)); if (el.dataset.set === 'repeat') lab.matchups = lab.schedule(); return; }
  if (el.dataset.view) { if (el.dataset.view === 'follow') lab.follow = el.value || null; else view[el.dataset.view] = value(el); return; }
  if (el.dataset.dev) { const k = el.dataset.dev, v = value(el); if (typeof v === 'boolean') { if (v) sim.dev[k] = true; else delete sim.dev[k]; } else sim.dev[k] = Number(v); return; }
  if (el.dataset.edit) { const key = el.closest('.lab-card')?.dataset.key, k = el.dataset.edit; lab.change(sim, key, { [k]: numberish(k, value(el)) }); if (k === 'side') { cardKeys = ''; drawCards(); } }
 });
 // (Keys typed in the panel's controls stay in the panel, not the game.)
 panel.addEventListener('keydown', e => e.stopPropagation());

 // Dragged by its bar, like the dev window.
 { const bar = $('.lab-bar'); let from = null;
  bar.addEventListener('pointerdown', e => { if (e.target.closest('button')) return; const r = panel.getBoundingClientRect(); from = { x: e.clientX - r.left, y: e.clientY - r.top }; bar.setPointerCapture(e.pointerId); panel.classList.add('dragging'); });
  bar.addEventListener('pointermove', e => { if (!from) return; const host = root.getBoundingClientRect(); panel.style.left = Math.max(0, Math.min(host.width - 80, e.clientX - host.left - from.x)) + 'px'; panel.style.top = Math.max(0, Math.min(host.height - 40, e.clientY - host.top - from.y)) + 'px'; panel.style.right = 'auto'; });
  for (const type of ['pointerup', 'pointercancel']) bar.addEventListener(type, () => { from = null; panel.classList.remove('dragging'); }); }

 const api = {
  panel, overlay,
  get open() { return !panel.classList.contains('hidden'); },
  get placing() { return this.open && placing; },
  setPlacing(on) { placing = !!on; if (!on) moving = null; panel.classList.toggle('placing', placing); if (view.tab === 'setup') drawSetup(); },
  // A click on the ground in PLACE mode (main.js): left adds (or moves the
  // spot being moved), right takes the nearest spot away.
  place(x, z, button = 0) {
   if (button === 2) { const e = lab.nearest(x, z); if (e) { lab.remove(sim, e.key); toast(e.label + ' REMOVED'); } cardKeys = ''; if (view.tab === 'setup') drawSetup(); return; }
   if (moving) { const e = lab.byKey(moving); if (lab.move(sim, moving, x, z)) toast((e?.label || '') + ' MOVED'); else toast('NO OPEN GROUND THERE'); moving = null; placing = false; panel.classList.remove('placing'); if (view.tab === 'setup') drawSetup(); return; }
   const made = lab.add(sim, x, z, next);
   toast(made.error ? made.error.toUpperCase() : (made.entry.label + ' · ' + (made.entry.weaponMode === 'fixed' ? weaponName(made.entry.weapon) : made.entry.weaponMode === 'random' ? 'random weapon' : 'every matchup')).toUpperCase());
   cardKeys = ''; if (view.tab === 'setup') drawSetup();
  },
  // Shown while the dev option is on (and a solo game is going).
  sync(show) {
   if (show === this.open) return;
   panel.classList.toggle('hidden', !show);
   // (Closed any way, the option off or every dev setting reset, a run stops with it.)
   if (show) showTab(view.tab); else { if (lab.running) lab.stop(sim); this.setPlacing(false); for (const m of [bars, marks]) for (const k of [...m.keys()]) drop(m, k); }
  },
  // Every drawn frame: the panel's live parts, and the bars and markers over the world.
  frame(worldView, now = performance.now()) {
   if (!this.open) return;
   if (lab.stoppedWhy) { toast(lab.stoppedWhy.toUpperCase()); lab.stoppedWhy = null; cardKeys = ''; }
   drawStatus();
   if (view.tab === 'robots' && now - cardsAt > 120) { cardsAt = now; drawCards(); }
   if (view.tab === 'results' && now - resultsAt > 400) { resultsAt = now; drawResults(); }
   // Health bars over the lab's robots (standing ones).
   const seen = new Set();
   if (view.bars) for (const e of lab.entries) {
    const b = e.bot, p = b?.sim.player; if (!b || !b.alive || !(p.hp > 0)) continue;
    seen.add(e.key);
    let el = bars.get(e.key);
    if (!el) { el = doc.createElement('div'); el.innerHTML = '<b></b><i><s></s></i>'; overlay.append(el); bars.set(e.key, el); }
    const barClass = 'lab-bar-over ' + SIDE_CLASS[e.side]; if (el.className !== barClass) el.className = barClass;
    const at = worldView.screenPoint(p.x, p.z, 2.05), text = e.label + ' ' + Math.ceil(p.hp);
    if (el.firstChild.textContent !== text) el.firstChild.textContent = text;
    el.querySelector('s').style.transform = `scaleX(${Math.max(0, Math.min(1, p.hp / (p.maxHp || 100))).toFixed(3)})`;
    el.style.transform = `translate(${at.x.toFixed(0)}px,${at.y.toFixed(0)}px) translate(-50%,-100%)`;
   }
   for (const k of [...bars.keys()]) if (!seen.has(k)) drop(bars, k);
   // A ring and label on each spot (always while placing).
   const shown = new Set();
   if (view.spots || placing) for (const e of lab.entries) {
    shown.add(e.key);
    let el = marks.get(e.key);
    if (!el) { el = doc.createElement('div'); el.className = 'lab-spot'; overlay.append(el); marks.set(e.key, el); }
    const cls = 'lab-spot ' + SIDE_CLASS[e.side] + (moving === e.key ? ' moving' : '');
    if (el.className !== cls) el.className = cls;
    if (el.textContent !== e.label) el.textContent = e.label;
    const at = worldView.screenPoint(e.x, e.z, .05);
    el.style.transform = `translate(${at.x.toFixed(0)}px,${at.y.toFixed(0)}px) translate(-50%,-50%)`;
   }
   for (const k of [...marks.keys()]) if (!shown.has(k)) drop(marks, k);
  },
 };
 return api;
}
