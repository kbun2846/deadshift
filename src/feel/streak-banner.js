// Kill streak callouts and shutdowns on your screen (owner-approved: "kill
// streak callouts at 3, 5 and 8 kills and a 'shutdown' when you end someone's
// streak"). One small banner high in the middle, under the health bar and the
// match clock, clear of the fight round you: the HUD's dark panel with a pink
// edge, a small pink line ("3 kill streak", "ended BOT 2's 5 kill streak")
// over the word in the stretched display lettering (SPREE, RAMPAGE,
// UNSTOPPABLE, SHUTDOWN). A new callout replaces the one showing. Media mode
// hides it with the round banners (data-media="banners"). Styles: feel.css.
import { FEEL } from '../config/feel.js';
import { setStyle, setAttr, setText } from '../ui/dom-writes.js';

// The banner's two lines for a piece of news (streaks.js streakNews).
export function bannerText(news) {
 if (news.kind === 'shutdown') return { small: `ended ${news.victimName}'s ${news.n} kill streak`, big: 'shutdown' };
 return { small: `${news.n} kill streak`, big: news.word };
}

export function createStreakBanner(parent, cfg = FEEL.banner) {
 const root = document.createElement('div');
 root.className = 'streak-banner'; root.setAttribute('data-media', 'banners'); root.setAttribute('role', 'status'); root.setAttribute('aria-live', 'polite');
 root.innerHTML = '<small></small><span class="streak-word"><b></b></span>';
 parent.append(root);
 const small = root.querySelector('small'), word = root.querySelector('b');
 let left = 0, play = 'a';
 return {
  root,
  show(news) {
   const text = bannerText(news);
   setText(small, text.small); setText(word, text.big.toUpperCase());
   setAttr(root, 'data-kind', news.kind);
   // (Longer words are drawn narrower so UNSTOPPABLE fits the same box.)
   setStyle(root, '--letters', String(Math.max(5, text.big.length)));
   play = play === 'a' ? 'b' : 'a'; setAttr(root, 'data-play', play);
   left = news.kind === 'shutdown' ? cfg.shutdownLife : cfg.life;
   setStyle(root, '--life', left + 's');
  },
  update(dt) { if (left > 0) { left -= dt; if (left <= 0) setAttr(root, 'data-play', ''); } },
  clear() { left = 0; setAttr(root, 'data-play', ''); },
  get showing() { return left > 0; },
 };
}
