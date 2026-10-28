// Career screen: the record against the CPU and online, trophies, the team
// cards won with, and every achievement.

import { ACHIEVEMENTS } from './career.js';
import { CARDS } from './cards.js';
import { LEVELS } from './ai.js';
import { cardChip } from './card-view.js';
import { button, el, svgEl } from './dom.js';

const pct = (won, played) => (played ? `${Math.round((won / played) * 100)}%` : '–');

export function medal(className = 'medal') {
  const icon = svgEl('svg', { viewBox: '0 0 24 24', class: className, 'aria-hidden': 'true' });
  svgEl('path', { d: 'M8 2h3l1 5-3 1zM16 2h-3l-1 5 3 1z', class: 'ribbon' }, icon);
  svgEl('circle', { cx: 12, cy: 15, r: 6.5, class: 'disc' }, icon);
  svgEl('path', { d: 'M12 11.5l1.1 2.2 2.4.3-1.8 1.6.5 2.4-2.2-1.2-2.2 1.2.5-2.4-1.8-1.6 2.4-.3z', class: 'star' }, icon);
  return icon;
}

function tile(label, value, note) {
  const t = el('div', 'stat-tile');
  t.append(el('span', 'st-label', label), el('b', 'st-value', value));
  if (note) t.append(el('small', 'st-note', note));
  return t;
}

function recordRow(name, won, played) {
  const row = el('div', 'rec-row');
  const bar = el('span', 'rec-bar');
  const fill = el('i');
  fill.style.width = played ? `${(won / played) * 100}%` : '0';
  bar.append(fill);
  row.append(el('span', 'rec-name', name), bar, el('span', 'rec-num', played ? `${won}/${played}` : 'Not played'));
  row.setAttribute('aria-label', `${name}: won ${won} of ${played}`);
  return row;
}

export function careerPage(career, { onReset }) {
  const c = career;
  const page = el('div', 'page-inner');

  const tiles = el('div', 'stat-tiles');
  tiles.append(
    tile('Played', c.played, c.twoPlayer ? `+ ${c.twoPlayer} two-player` : null),
    tile('Won', c.won, `Win rate ${pct(c.won, c.played)}`),
    tile('Best streak', c.bestStreak, c.streak ? `Current ${c.streak}` : null),
    tile('Tries', c.tries, c.played ? `${(c.tries / c.played).toFixed(1)} a match` : null),
  );
  page.append(tiles);

  const facts = el('div', 'facts');
  const fact = (label, value) => {
    const f = el('p', 'fact');
    f.append(el('span', null, label), el('b', null, value));
    facts.append(f);
  };
  fact('Points', c.played ? `${c.pointsFor} for, ${c.pointsAgainst} against` : '–');
  fact('Metres made', c.metres ? `${c.metres.toLocaleString('en-GB')} m, ${Math.round(c.metres / Math.max(1, c.played))} a match` : '–');
  fact('Biggest win', c.biggestWin ? `${c.biggestWin.score} v ${c.biggestWin.against}` : '–');
  fact('Trophies', c.cups + c.leagues ? [c.cups && `${c.cups} Nations Cup${c.cups > 1 ? 's' : ''}`, c.leagues && `${c.leagues} League title${c.leagues > 1 ? 's' : ''}`].filter(Boolean).join(', ') : 'None yet');
  page.append(facts);

  const levels = el('section', 'records');
  levels.append(el('h3', 'page-h', 'Against the CPU'));
  for (const [id, level] of Object.entries(LEVELS)) {
    const r = c.byLevel[id] || { played: 0, won: 0 };
    levels.append(recordRow(level.name, r.won, r.played));
  }
  levels.append(recordRow('Online', c.online.won, c.online.played));
  page.append(levels);

  const cards = el('section', 'cards-won');
  cards.append(el('h3', 'page-h', 'Team cards won with'));
  const grid = el('div', 'chip-grid');
  for (const card of CARDS) {
    const chip = cardChip(card.id, 'tc-chip', c.cardRarity?.[card.id] || 'common');
    if (!c.cardsWon.includes(card.id)) chip.classList.add('dim');
    grid.append(chip);
  }
  cards.append(grid, el('p', 'table-note', `${c.cardsWon.length} of ${CARDS.length}, each at the rarest you've won with. Win with six for Card Sharp.`));
  page.append(cards);

  const got = ACHIEVEMENTS.filter(a => c.achievements[a.id]).length;
  const ach = el('section', 'achievements');
  const head = el('div', 'ach-head');
  head.append(el('h3', 'page-h', 'Achievements'), el('span', 'ach-count', `${got} of ${ACHIEVEMENTS.length}`));
  const progress = el('span', 'ach-progress');
  const fill = el('i');
  fill.style.width = `${(got / ACHIEVEMENTS.length) * 100}%`;
  progress.append(fill);
  ach.append(head, progress);
  const list = el('ul', 'ach-list');
  // Unlocked first, newest first; then the rest in their usual order.
  const order = [...ACHIEVEMENTS].sort((a, b) => {
    const da = c.achievements[a.id] || '';
    const db = c.achievements[b.id] || '';
    if (!!da !== !!db) return da ? -1 : 1;
    return db.localeCompare(da);
  });
  for (const a of order) {
    const when = c.achievements[a.id];
    const li = el('li', `ach${when ? ' got' : ''}`);
    const text = el('span', 'ach-text');
    text.append(el('b', null, a.name), el('small', null, a.text));
    li.append(medal(), text);
    if (when) li.append(el('time', 'ach-date', when));
    li.setAttribute('aria-label', `${a.name}: ${a.text} ${when ? `Unlocked ${when}` : 'Locked'}`);
    list.append(li);
  }
  ach.append(list);
  page.append(ach);

  const foot = el('div', 'page-foot');
  foot.append(button('Reset career', onReset, 'btn btn-quiet'));
  page.append(foot);
  return page;
}
