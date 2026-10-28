// The match report: Player of the Match, every player's numbers, and a
// momentum chart of each side's chance of winning through the match.

import { PLAYERS, POSITIONS } from './dice.js';
import { playerOfTheMatch, possessive, statLine, surname } from './players.js';
import { dieChip } from './dice-view.js';
import { el, svgEl } from './dom.js';
import { kitVars } from './color.js';

const pct = p => `${Math.round(p * 100)}%`;
const KIND_NAMES = { try: 'Try', conversion: 'Conversion', penalty: 'Penalty goal', drop: 'Drop goal' };

export function potmCard(match, potm = playerOfTheMatch(match)) {
  const box = el('div', 'potm-card');
  if (!potm) return box;
  const team = match.teams[potm.team];
  kitVars(box, team);
  const head = el('div', 'potm-head');
  head.append(el('span', 'potm-kicker', 'Player of the Match'), el('b', 'potm-name', potm.name));
  const meta = el('div', 'potm-meta');
  meta.append(dieChip(potm.pos), el('span', null, `${PLAYERS[potm.pos].one} · ${team.name}`));
  box.append(head, meta, el('p', 'potm-line', statLine(potm.stats)));
  return box;
}

// The last column (errors) is the only one where more is worse.
const COLUMNS = [
  ['Tries', 'TRY', p => p.tries],
  ['Metres made', 'M', p => p.metres || 0],
  ['Carries', 'RUN', p => p.carries],
  ['Line breaks', 'LB', p => p.lineBreaks],
  ['Tackles', 'TKL', p => p.tackles],
  ['Missed tackles', 'MT', p => p.missed || 0],
  ['Turnovers won', 'TO', p => p.turnovers],
  ['Kicking points', 'KCK', p => p.points],
  ['Errors', 'ERR', p => p.errors],
];
const WORSE = new Set(['MT', 'ERR']);

// One table per side: each player's numbers, best in each column marked.
export function playersTables(match, potm = playerOfTheMatch(match)) {
  const wrap = el('div', 'players');
  match.teams.forEach((team, t) => {
    const table = el('table', 'players-table');
    const caption = el('caption');
    const kit = el('span', 'kit');
    kitVars(kit, team);
    caption.append(kit, document.createTextNode(team.name));
    table.append(caption);
    const head = el('tr');
    head.append(el('th', 'pl-name', 'Player'));
    for (const [title, short] of COLUMNS) {
      const th = el('th', null, short);
      th.title = title;
      th.setAttribute('abbr', title);
      head.append(th);
    }
    const thead = el('thead');
    thead.append(head);
    const body = el('tbody');
    const best = COLUMNS.map(([, short, get]) => (WORSE.has(short) ? null : Math.max(1, ...POSITIONS.map(p => get(team.players[p])))));
    for (const pos of POSITIONS) {
      const p = team.players[pos];
      const row = el('tr');
      const name = el('th', 'pl-name');
      name.scope = 'row';
      name.append(dieChip(pos), el('span', null, surname(match, t, pos) || PLAYERS[pos].name));
      if (potm && potm.team === t && potm.pos === pos) {
        const star = el('span', 'pl-star', '★');
        star.title = 'Player of the Match';
        name.append(star);
      }
      row.append(name);
      COLUMNS.forEach(([, , get], i) => {
        const v = get(p);
        row.append(el('td', best[i] !== null && v === best[i] ? 'top' : v ? '' : 'zero', v));
      });
      body.append(row);
    }
    table.append(thead, body);
    wrap.append(table);
  });
  const key = el('p', 'players-key', COLUMNS.map(([title, short]) => `${short} ${title.toLowerCase()}`).join(' · '));
  wrap.append(key);
  return wrap;
}

// ---- Momentum ------------------------------------------------------------
//
// history: one entry per action, {p: team 0's chance of winning after it,
// h: half}, plus {k, t, s} on the actions that scored (kind, team, score).

const W = 320;
const H = 150;
const PAD = { top: 14, right: 34, bottom: 18, left: 8 };

export function momentumChart(history, match) {
  const box = el('figure', 'momentum');
  const [a, b] = match.teams;
  if (history.length < 2) {
    box.append(el('p', 'momentum-empty', 'The chart fills in as the match goes on.'));
    return box;
  }
  const n = history.length;
  const x = i => PAD.left + (i / (n - 1)) * (W - PAD.left - PAD.right);
  const y = p => PAD.top + (1 - p) * (H - PAD.top - PAD.bottom);
  const mid = y(0.5);

  const legend = el('div', 'momentum-legend');
  for (const t of [a, b]) {
    const item = el('span', 'mk');
    const sw = el('i');
    kitVars(sw, t);
    item.append(sw, document.createTextNode(t.name));
    legend.append(item);
  }
  box.append(legend);

  const id = `m${Math.floor(Math.random() * 1e9)}`;
  const chart = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, class: 'momentum-svg', role: 'img', 'aria-label': `${possessive(a.name)} chance of winning through the match: above the middle line ${a.name} are favourites, below it ${b.name} are.` });
  const defs = svgEl('defs', {}, chart);
  const topClip = svgEl('clipPath', { id: `${id}t` }, defs);
  svgEl('rect', { x: 0, y: 0, width: W, height: mid }, topClip);
  const bottomClip = svgEl('clipPath', { id: `${id}b` }, defs);
  svgEl('rect', { x: 0, y: mid, width: W, height: H - mid }, bottomClip);

  // Hairline grid at 100%, 50% (the even line) and 0% of the first side's
  // chance, labelled on the right; who is ahead is written inside the plot.
  for (const [p, label] of [[1, '100%'], [0.5, '50%'], [0, '0%']]) {
    svgEl('line', { x1: PAD.left, x2: W - PAD.right, y1: y(p), y2: y(p), class: p === 0.5 ? 'mm-even' : 'mm-grid' }, chart);
    const tick = svgEl('text', { x: W - PAD.right + 4, y: y(p) + 3.5, class: 'mm-tick' }, chart);
    tick.textContent = label;
  }
  for (const [team, at] of [[a, y(1) + 11], [b, y(0) - 4]]) {
    const label = svgEl('text', { x: PAD.left + 2, y: at, class: 'mm-side' }, chart);
    label.textContent = `${team.name} ahead`;
  }

  // Half time.
  const ht = history.findIndex(e => e.h === 2);
  if (ht > 0) {
    svgEl('line', { x1: x(ht), x2: x(ht), y1: PAD.top, y2: H - PAD.bottom, class: 'mm-grid' }, chart);
    const label = svgEl('text', { x: x(ht), y: H - 5, class: 'mm-tick', 'text-anchor': 'middle' }, chart);
    label.textContent = 'HT';
  }

  const points = history.map((e, i) => `${x(i).toFixed(1)},${y(e.p).toFixed(1)}`);
  const area = `M${x(0).toFixed(1)},${mid} L${points.join(' L')} L${x(n - 1).toFixed(1)},${mid} Z`;
  const washA = svgEl('path', { d: area, class: 'mm-wash', 'clip-path': `url(#${id}t)` }, chart);
  washA.style.setProperty('--kit', a.color);
  const washB = svgEl('path', { d: area, class: 'mm-wash', 'clip-path': `url(#${id}b)` }, chart);
  washB.style.setProperty('--kit', b.color);
  svgEl('polyline', { points: points.join(' '), class: 'mm-line' }, chart);

  // A dot for every score, in the scorers' colour.
  const scores = [];
  history.forEach((e, i) => {
    if (!e.k) return;
    scores.push(i);
    const dot = svgEl('circle', { cx: x(i), cy: y(e.p), r: 4, class: 'mm-dot' }, chart);
    dot.style.setProperty('--kit', match.teams[e.t].color);
  });

  // Hover and keyboard: a crosshair that snaps to the nearest action.
  const cross = svgEl('line', { y1: PAD.top, y2: H - PAD.bottom, class: 'mm-cross', visibility: 'hidden' }, chart);
  const focus = svgEl('circle', { r: 4, class: 'mm-focus', visibility: 'hidden' }, chart);
  const plot = el('div', 'momentum-plot');
  plot.tabIndex = 0;
  plot.setAttribute('aria-label', 'Momentum chart. Use the arrow keys to step through the match.');
  const tip = el('div', 'mm-tip');
  tip.hidden = true;
  plot.append(chart, tip);
  box.append(plot);

  let at = null;
  const scoreAt = i => {
    for (let j = i; j >= 0; j--) if (history[j].s) return history[j].s;
    return [0, 0];
  };
  const show = i => {
    at = Math.max(0, Math.min(n - 1, i));
    const e = history[at];
    cross.setAttribute('x1', x(at));
    cross.setAttribute('x2', x(at));
    cross.setAttribute('visibility', 'visible');
    focus.setAttribute('cx', x(at));
    focus.setAttribute('cy', y(e.p));
    focus.setAttribute('visibility', 'visible');
    tip.replaceChildren();
    for (const [t, p] of [[a, e.p], [b, 1 - e.p]]) {
      const row = el('span', 'mm-row');
      const key = el('i');
      kitVars(key, t);
      row.append(key, el('b', null, pct(p)), el('span', null, t.name));
      tip.append(row);
    }
    const s = scoreAt(at);
    const what = e.k ? `${KIND_NAMES[e.k]}, ${match.teams[e.t].name} · ` : '';
    tip.append(el('small', null, `${what}${s[0]}–${s[1]} · ${e.h === 2 ? '2nd' : '1st'} half`));
    tip.hidden = false;
    const left = (x(at) / W) * 100;
    tip.style.left = `${Math.min(70, Math.max(0, left - 15))}%`;
  };
  const hide = () => {
    at = null;
    tip.hidden = true;
    cross.setAttribute('visibility', 'hidden');
    focus.setAttribute('visibility', 'hidden');
  };
  const fromPointer = ev => {
    const rect = chart.getBoundingClientRect();
    const sx = ((ev.clientX - rect.left) / rect.width) * W;
    show(Math.round(((sx - PAD.left) / (W - PAD.left - PAD.right)) * (n - 1)));
  };
  plot.addEventListener('pointermove', fromPointer);
  plot.addEventListener('pointerdown', fromPointer);
  plot.addEventListener('pointerleave', ev => ev.pointerType === 'mouse' && hide());
  plot.addEventListener('blur', hide);
  plot.addEventListener('keydown', ev => {
    const next = { ArrowRight: 1, ArrowLeft: -1 }[ev.key];
    if (ev.key === 'Home') show(0);
    else if (ev.key === 'End') show(n - 1);
    else if (next) {
      // Plain arrows jump between scores; with Shift they step one action.
      if (ev.shiftKey || !scores.length) show((at ?? (next > 0 ? -1 : n)) + next);
      else {
        const from = at ?? (next > 0 ? -1 : n);
        const target = next > 0 ? scores.find(i => i > from) : [...scores].reverse().find(i => i < from);
        show(target ?? (next > 0 ? n - 1 : 0));
      }
    } else return;
    ev.preventDefault();
  });

  // The same story as a list: every score and where it left the match.
  if (scores.length) {
    const list = el('ol', 'timeline');
    for (const i of scores) {
      const e = history[i];
      const li = el('li');
      const key = el('i');
      kitVars(key, match.teams[e.t]);
      li.append(key, el('b', null, `${e.s[0]}–${e.s[1]}`), el('span', null, `${KIND_NAMES[e.k]}, ${match.teams[e.t].name}`), el('small', null, `${match.teams[e.t].name} ${pct(e.t === 0 ? e.p : 1 - e.p)}`));
      list.append(li);
    }
    const cap = el('figcaption', 'momentum-cap', 'Every score, and each side’s chance of winning straight after it.');
    box.append(cap, list);
  }
  return box;
}

// For the report's headline numbers: the biggest swing and the low point
// the winners came back from.
export function momentumFacts(history, match) {
  if (history.length < 2 || match.winner === null) return null;
  const w = match.winner;
  const chance = e => (w === 0 ? e.p : 1 - e.p);
  const low = Math.min(...history.map(chance));
  return { winner: w, low, comeback: low < 0.25 };
}
