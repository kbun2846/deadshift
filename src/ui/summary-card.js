// Your part of the end card (match-summary.js works it out): the highlight in
// the stretched display lettering, pink, and a row of your numbers: kills,
// deaths, best streak, damage, accuracy and your favourite weapon with its
// picture. One strip across the end card (ui/match-end.js `summary`), above
// the table; phones fold the numbers into three across. Styles:
// styles/death-flow.css.
import { weapon as weaponInfo } from '../items.js';
import { weaponImage } from './weapon-grid.js';

const esc = text => String(text ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const accuracyText = a => (a == null ? '—' : Math.round(a * 100) + '%');

export function summaryCardHTML(s) {
 if (!s) return '';
 const fav = s.favourite ? weaponInfo(s.favourite) : null, pic = fav ? weaponImage(fav.id) : null;
 // (`label` is markup: "best" hides on phones, summary-long.)
 const stat = (label, value, extra = '') => `<div class="summary-stat${extra}"><dt>${label}</dt><dd>${value}</dd></div>`;
 return `<section class="summary-you" aria-label="your match">`
  + `<p class="summary-highlight"><small>your match</small>${s.highlight ? `<b data-highlight="${esc(s.highlight.id)}">${esc(s.highlight.text)}</b>` : ''}</p>`
  + `<dl class="summary-stats">`
  + stat('kills', esc(s.kills)) + stat('deaths', esc(s.deaths)) + stat('<span class="summary-long">best </span>streak', esc(s.bestStreak))
  + stat('damage', esc(s.damage)) + stat('acc<span class="summary-long">uracy</span>', esc(accuracyText(s.accuracy)))
  + stat('fav<span class="summary-long">ourite</span>', `${pic ? `<img src="${pic}" alt="${esc(fav?.name || '')}" title="${esc(fav?.name || '')}" draggable="false" decoding="async">` : ''}<span>${esc(fav?.name || '—')}</span>`, ' summary-fav')
  + `</dl></section>`;
}
