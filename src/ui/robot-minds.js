// Developer tools: "show what robots are thinking". A small label over each
// robot: its mode (engage, hunt, cover...), its plan for the fight (push,
// kite, close, fall, trade: robot-brain.js tactic) and its skill and style.
// One absolutely placed div per robot, moved by transform; nothing is made
// while the option is off.
import { moodName } from '../bots/robot-profile.js';
export function createRobotMinds(parent) {
 const labels = new Map();
 const hideAll = () => { for (const el of labels.values()) el.remove(); labels.clear(); };
 return {
  // `bots`: BotMatch; `view`: WorldView (screenPoint); `show`: the option.
  update(bots, view, show) {
   if (!show || !bots?.active) { if (labels.size) hideAll(); return; }
   const seen = new Set();
   for (const b of bots.living()) {
    seen.add(b.id);
    let el = labels.get(b.id);
    if (!el) { el = document.createElement('div'); el.className = 'robot-mind'; parent.append(el); labels.set(b.id, el); }
    const brain = b.brain, fight = brain.fight?.kind || '-', target = brain.targetId ? (brain.memory.get(brain.targetId)?.human ? 'you' : brain.targetId.replace(/^robot-/, 'r')) : '';
    // A tempered robot's mood now (robot-profile.js): calm / even / aggressive.
    const mood = b.profile.temper ? ' · ' + moodName(b.profile.mood) + ' ' + (b.profile.mood >= 0 ? '+' : '') + b.profile.mood.toFixed(2) : '';
    const text = `${brain.mode} · ${fight}${target ? ' → ' + target : ''}${mood}\n${b.profile.label} · ${Math.round(b.sim.player.hp)}`;
    if (el.textContent !== text) el.textContent = text;
    const at = view.screenPoint(b.sim.player.x, b.sim.player.z, 1.7);
    el.style.transform = `translate(${at.x.toFixed(0)}px,${at.y.toFixed(0)}px) translate(-50%,-100%)`;
   }
   for (const [id, el] of labels) if (!seen.has(id)) { el.remove(); labels.delete(id); }
  },
  clear: hideAll,
 };
}
