// Basics is what the home screen's tutorial button offers until it is done.
// Weapon courses are tracked separately. Lessons were rewritten in v0.5, so
// these keys are new: finishing the old tutorial says nothing about the new one.
const key = course => 'deadshift-tutorial-v3-' + (['static', 'rifle', 'shotgun'].includes(course) ? course : 'basics');
export function readTutorialComplete(course = 'basics') {
 try { return localStorage.getItem(key(course)) === '1'; } catch { return false; }
}
export function saveTutorialComplete(tutorial) {
 if (!tutorial?.complete) return false;
 try { localStorage.setItem(key(tutorial.course), '1'); return true; } catch { return false; }
}
