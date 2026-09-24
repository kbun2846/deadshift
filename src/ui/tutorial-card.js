// The lesson card on the training range: progress, the current lesson's
// instructions for this player's controls, the counter and meter, and the
// highlight on whichever HUD element the lesson is about. It only redraws
// when something it shows has changed.
import { COURSE_NAMES, lessonMarkup } from '../tutorial.js';
const byId = id => document.getElementById(id);

export function createTutorialCard() {
 let shownKey = '', highlighted = null;
 const guide = byId('tutorial-guide');
 return {
  // Forget what is drawn, e.g. after switching between touch and keys.
  invalidate() { shownKey = ''; highlighted = undefined; },
  render(tutorial, touchPrompts) {
   if (!tutorial) return;
   const key = `${tutorial.course}:${tutorial.index}:${tutorial.count}:${tutorial.celebrating}:${touchPrompts}`;
   if (key === shownKey) return; shownKey = key;
   const lesson = tutorial.lesson;
   const highlight = lesson ? (touchPrompts && lesson.touchHighlight) || lesson.highlight : null;
   if (highlighted !== highlight) {
    document.querySelectorAll('.tutorial-highlight').forEach(el => el.classList.remove('tutorial-highlight'));
    if (highlight) byId(highlight)?.classList.add('tutorial-highlight');
    highlighted = highlight;
   }
   const course = COURSE_NAMES[tutorial.course];
   guide.dataset.state = tutorial.complete ? 'complete' : tutorial.celebrating ? 'done' : 'practicing';
   byId('tutorial-progress').textContent = tutorial.complete ? course : `${course} · ${tutorial.index + 1} / ${tutorial.lessons.length}`;
   byId('tutorial-title').textContent = tutorial.complete ? `${course} done` : lesson.title;
   const text = tutorial.complete ? (tutorial.course === 'basics' ? 'weapon tutorials are in gamemodes' : 'try another weapon in the tutorial menu') : touchPrompts ? lesson.touch : lesson.keys;
   byId('tutorial-hint').innerHTML = lessonMarkup(text);
   const note = lesson && ((touchPrompts && lesson.touchNote) || lesson.note);
   byId('tutorial-note').hidden = !note; byId('tutorial-note').innerHTML = note ? lessonMarkup(note) : '';
   const count = byId('tutorial-count');
   count.hidden = tutorial.complete;
   count.textContent = `${tutorial.count} / ${tutorial.goal}`;
   count.setAttribute('aria-label', `${tutorial.count} of ${tutorial.goal} done`);
   byId('tutorial-meter').hidden = tutorial.complete;
   byId('tutorial-meter').style.setProperty('--progress', String(Math.min(1, tutorial.count / tutorial.goal)));
   byId('tutorial-finish').hidden = !tutorial.complete;
  },
 };
}
