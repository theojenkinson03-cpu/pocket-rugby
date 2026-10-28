// The club career on the tournament hub: the trophy cabinet, the records
// book, the club's all-time leaders and every season so far.

import { clubLeaders, playsEurope, TROPHY_ORDER } from './club.js';
import { LEAGUES } from './tournament.js';
import { PLAYERS } from './dice.js';
import { el, svgEl } from './dom.js';

const ordinal = n => `${n}${['th', 'st', 'nd', 'rd'][(n % 100 > 10 && n % 100 < 14) || n % 10 > 3 ? 0 : n % 10]}`;

const METAL = { double: ['#7a5cff', '#d9cfff'], europe: ['#1c4fa8', '#9fc0ff'], league: ['#a8740c', '#fbe08a'], leaders: ['#7d8590', '#e3e7ec'] };

// A small trophy: gold for a title, blue for Europe, purple for the double,
// silver for topping the table.
export function trophyIcon(kind) {
  const [dark, light] = METAL[kind] || METAL.league;
  const icon = svgEl('svg', { viewBox: '0 0 24 30', class: `trophy-icon t-${kind}`, 'aria-hidden': 'true' });
  svgEl('path', { d: 'M6 2h12v6c0 5-3 8-6 8.5C9 16 6 13 6 8z', fill: light, stroke: dark, 'stroke-width': 1.2 }, icon);
  svgEl('path', { d: 'M6 4H3c0 4 1.5 6 3.5 6.5M18 4h3c0 4-1.5 6-3.5 6.5', fill: 'none', stroke: dark, 'stroke-width': 1.2, 'stroke-linecap': 'round' }, icon);
  svgEl('path', { d: 'M11 16.5h2V21h-2zM7.5 21h9l1 3.5h-11z', fill: dark }, icon);
  svgEl('rect', { x: 5, y: 24.5, width: 14, height: 3.5, rx: 0.8, fill: dark }, icon);
  return icon;
}

function cabinet(club) {
  const box = el('div', 'cabinet');
  box.append(el('p', 'br-title', 'Trophy cabinet'));
  const shelf = el('ul', 'shelf');
  const trophies = [...club.trophies].sort((a, b) => TROPHY_ORDER.indexOf(a.kind) - TROPHY_ORDER.indexOf(b.kind) || a.season.localeCompare(b.season));
  if (!trophies.length) shelf.append(el('li', 'shelf-empty', 'Empty for now. Every title you win goes on this shelf.'));
  for (const t of trophies) {
    const li = el('li', `trophy t-${t.kind}`);
    li.append(trophyIcon(t.kind), el('b', null, t.title), el('small', null, t.season));
    shelf.append(li);
  }
  box.append(shelf);
  return box;
}

function record(label, value, note) {
  const row = el('div', 'rb-row');
  row.append(el('span', 'rb-label', label), el('b', 'rb-value', value));
  if (note) row.append(el('small', 'rb-note', note));
  return row;
}

function recordsBook(club) {
  const r = club.records;
  const box = el('div', 'records-book');
  box.append(el('p', 'br-title', 'Club records'));
  const match = m => `${m.comp} · ${m.season}`;
  const rows = [
    r.biggestWin && record('Biggest win', `${r.biggestWin.score} v ${r.biggestWin.against}`, match(r.biggestWin)),
    r.heaviestDefeat && record('Heaviest defeat', `${r.heaviestDefeat.score} v ${r.heaviestDefeat.against}`, match(r.heaviestDefeat)),
    r.mostPoints && record('Most points in a match', `${r.mostPoints.points}, v ${r.mostPoints.against}`, match(r.mostPoints)),
    r.mostTries && record('Most tries in a match', `${r.mostTries.tries}, v ${r.mostTries.against}`, match(r.mostTries)),
    r.bestRun && record('Longest winning run', `${r.bestRun.wins} in a row`, r.bestRun.season),
    r.bestFinish && record('Best league season', r.bestFinish.stage === 'champion' ? `Champions (${ordinal(r.bestFinish.place)} in the table)` : `${ordinal(r.bestFinish.place)} · ${r.bestFinish.outcome}`, r.bestFinish.season),
    r.seasonTries && record('Most tries in a season', `${r.seasonTries.value} · ${r.seasonTries.name}`, r.seasonTries.season),
    r.seasonPoints && record('Most points in a season', `${r.seasonPoints.value} · ${r.seasonPoints.name}`, r.seasonPoints.season),
    r.seasonMetres && record('Most metres in a season', `${r.seasonMetres.value} m · ${r.seasonMetres.name}`, r.seasonMetres.season),
    r.seasonTackles && record('Most tackles in a season', `${r.seasonTackles.value} · ${r.seasonTackles.name}`, r.seasonTackles.season),
  ].filter(Boolean);
  if (!rows.length) box.append(el('p', 'table-note', 'Records start with your first finished competition.'));
  box.append(...rows);
  return box;
}

function allTime(club) {
  const box = el('div', 'all-time');
  box.append(el('p', 'br-title', 'All-time leaders'));
  const list = (title, key, unit) => {
    const leaders = clubLeaders(club, key);
    if (!leaders.length) return null;
    const ol = el('ol', 'leaders');
    for (const p of leaders) {
      const li = el('li');
      const who = el('span', 'sp-who');
      who.append(el('b', null, p.name.replace(/^[A-Z]\.\s*/, '')), el('small', null, PLAYERS[p.pos].one));
      li.append(who, el('span', 'sp-num', `${p[key].toLocaleString('en-GB')}${unit}`));
      ol.append(li);
    }
    const wrap = el('div', 'leader-box');
    wrap.append(el('p', 'br-title', title), ol);
    return wrap;
  };
  const grid = el('div', 'leader-grid');
  grid.append(...[list('Tries', 'tries', ''), list('Points', 'points', ''), list('Appearances', 'apps', '')].filter(Boolean));
  if (!grid.children.length) return null;
  box.append(grid);
  return box;
}

function history(club) {
  const box = el('div', 'history');
  box.append(el('p', 'br-title', 'Season by season'));
  const ul = el('ul', 'seasons');
  for (const s of [...club.seasons].reverse()) {
    const li = el('li', 'season-row');
    const head = el('span', 'sr-head');
    head.append(el('b', null, s.name), el('span', null, `Won ${s.won}${s.drawn ? `, drawn ${s.drawn}` : ''}, lost ${s.lost}`));
    li.append(head);
    if (s.league) li.append(el('span', 'sr-line', `${s.league.comp}: ${ordinal(s.league.place)} of ${s.league.of} · ${s.league.outcome}`));
    if (s.europe) li.append(el('span', 'sr-line', `${s.europe.comp}: ${s.europe.outcome}`));
    if (s.topScorer) li.append(el('small', 'sr-note', `Top try scorer: ${s.topScorer.name}, ${s.topScorer.tries}`));
    ul.append(li);
  }
  if (!club.seasons.length) ul.append(el('li', 'season-row empty', 'Your first season is under way.'));
  box.append(ul);
  return box;
}

export function clubSection(t) {
  const club = t.club;
  if (!club) return null;
  const wrap = el('section', 'club');
  wrap.append(el('h3', 'page-h', 'Club career'));
  const league = LEAGUES[club.league].short;
  const then = t.kind === 'league' && playsEurope(club) ? ` After the ${league}, the Champions Cup.` : '';
  wrap.append(el('p', 'page-note', `Season ${club.number} · ${club.current.name}.${then} Your squad carries over from season to season.`));
  wrap.append(cabinet(club), recordsBook(club));
  const leaders = allTime(club);
  if (leaders) wrap.append(leaders);
  wrap.append(history(club));
  return wrap;
}
