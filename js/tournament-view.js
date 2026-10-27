// Tournament screens: picking a competition and team, then the hub with the
// next match, the tables, the knockout bracket and every result.

import { CLUBS, currentRound, NATIONS, POINTS, STAGE_NAMES, standings, teamOf, userAlive, userFixture, userRecord } from './tournament.js';
import { LEVELS, PERSONALITIES } from './ai.js';
import { MATCH_LENGTHS } from './engine.js';
import { button, el, tallButton } from './dom.js';
import { kitVars } from './color.js';

const STRENGTH = { expert: ['Favourites', 3], pro: ['Contenders', 2], rookie: ['Outsiders', 1] };

const kitChip = (team, className = 'kit') => {
  const chip = el('span', className);
  kitVars(chip, team);
  chip.style.setProperty('--alt', team.alt || team.color);
  return chip;
};

function seg(legend, name, options, value, onChange) {
  const box = el('fieldset', `seg${options.length === 3 ? ' seg-3' : ''}`);
  box.append(el('legend', null, legend));
  for (const [v, label, note] of options) {
    const lab = el('label');
    const input = el('input');
    input.type = 'radio';
    input.name = name;
    input.value = v;
    input.checked = v === value;
    input.addEventListener('change', () => onChange(v));
    const span = el('span', null, label);
    if (note) span.append(el('small', null, note));
    lab.append(input, span);
    box.append(lab);
  }
  return box;
}

// ---- Setup ---------------------------------------------------------------------

export function tournamentSetup(state, { onChange, onStart }) {
  const page = el('div', 'page-inner');
  page.append(seg('Competition', 't-kind', [['cup', 'Nations Cup', 'Two pools, then knockouts'], ['league', 'League', 'Eight clubs, then play-offs']], state.kind, v => onChange({ kind: v, team: null })));

  const roster = state.kind === 'cup' ? NATIONS : CLUBS;
  const team = state.team && roster.some(r => r.id === state.team) ? state.team : roster[0].id;
  const pick = el('div', 'pick');
  pick.append(el('h3', 'page-h', 'Pick your team'));
  const grid = el('div', 'team-grid');
  grid.setAttribute('role', 'radiogroup');
  grid.setAttribute('aria-label', 'Your team');
  for (const r of roster) {
    const tile = el('button', 'team-tile');
    tile.type = 'button';
    tile.setAttribute('role', 'radio');
    tile.setAttribute('aria-checked', String(r.id === team));
    kitVars(tile, r);
    tile.style.setProperty('--alt', r.alt);
    const [label, stars] = STRENGTH[r.level];
    tile.append(el('span', 'tt-kit'), el('b', 'tt-short', r.short), el('span', 'tt-name', r.name), el('small', 'tt-strength', `${'★'.repeat(stars)}${'☆'.repeat(3 - stars)} ${label}`));
    tile.addEventListener('click', () => onChange({ team: r.id }));
    grid.append(tile);
  }
  pick.append(grid);
  page.append(pick);

  page.append(seg('Match length', 't-length', Object.entries(MATCH_LENGTHS).map(([k, v]) => [k, v.label, `HT ${v.half} · FT ${v.full}`]), state.length, v => onChange({ length: v })));

  const cards = el('label', 'toggle toggle-card');
  const text = el('span');
  text.append(el('b', null, 'Team cards'), el('small', null, 'A draft before every match'));
  const box = el('input');
  box.type = 'checkbox';
  box.checked = state.cards;
  box.addEventListener('change', () => onChange({ cards: box.checked }));
  cards.append(text, box, el('i'));
  cards.querySelector('i').setAttribute('aria-hidden', 'true');
  page.append(cards);

  const games = state.kind === 'cup' ? 'Up to 5 matches: 3 in your pool, then a semi-final and the final.' : 'Up to 9 matches: 7 in the season, then a semi-final and the final.';
  page.append(el('p', 'page-note', `${games} Win 4 points, plus a bonus point for 4 tries and one for losing by ${POINTS.losingBonusWithin} or fewer.`));
  page.append(button(state.kind === 'cup' ? 'Start the Nations Cup' : 'Start the League', () => onStart({ ...state, team }), 'btn btn-primary btn-wide', { primary: true }));
  return page;
}

// ---- Hub -----------------------------------------------------------------------

const ROUND_NAMES = { semi: 'Semi-final', final: 'Final' };

export function fixtureLabel(t, f) {
  if (f.stage === 'pool') return `Pool ${f.group} · Round ${f.round + 1} of 3`;
  if (f.stage === 'league') return `Round ${f.round + 1} of 7`;
  return ROUND_NAMES[f.stage];
}

function nextMatchCard(t, handlers) {
  const card = el('section', 'next-card');
  const f = userFixture(t);
  if (t.stage === 'done') {
    const champ = teamOf(t, t.champion);
    kitVars(card, champ);
    card.classList.add('champions');
    const mine = t.champion === t.userTeam;
    card.append(el('p', 'nc-kicker', `${t.name} · Final whistle`), el('h3', 'nc-title', mine ? 'Champions!' : `${champ.name} win the ${t.name}`));
    const rec = userRecord(t);
    card.append(el('p', 'nc-meta', `Your record: won ${rec.won}, lost ${rec.lost}.`));
    card.append(button('New tournament', handlers.onNew, 'btn btn-primary', { primary: true }));
    return card;
  }
  if (!userAlive(t) || !f) {
    card.classList.add('out');
    const out = t.stage === 'final' ? 'Out in the semi-finals' : t.kind === 'league' ? 'Missed the play-offs' : 'Out in the pool stage';
    card.append(el('p', 'nc-kicker', `${t.name} · ${STAGE_NAMES[t.stage]}`), el('h3', 'nc-title', out));
    card.append(el('p', 'nc-meta', 'Play out the rest to see who lifts the trophy.'));
    card.append(button('Play out the rest', handlers.onSimRest, 'btn btn-primary', { primary: true }));
    return card;
  }
  const me = teamOf(t, t.userTeam);
  const them = teamOf(t, f.home === t.userTeam ? f.away : f.home);
  kitVars(card, me);
  card.append(el('p', 'nc-kicker', `Next · ${fixtureLabel(t, f)}`));
  const vs = el('div', 'nc-vs');
  const side = (team, mine) => {
    const s = el('div', `nc-side${mine ? ' mine' : ''}`);
    s.append(kitChip(team, 'nc-kit'), el('b', null, team.name), el('small', null, mine ? 'You' : `${LEVELS[team.level].name} · ${PERSONALITIES[team.personality].name}`));
    return s;
  };
  vs.append(side(me, true), el('span', 'nc-v', 'v'), side(them, false));
  card.append(vs);
  card.append(tallButton('Play', `${MATCH_LENGTHS[t.length].label} match${t.cards ? ' · team cards' : ''}`, handlers.onPlay, 'btn btn-primary btn-play'));
  card.querySelector('.btn-play').dataset.primary = '';
  return card;
}

function table(t, group) {
  const rows = standings(t, group);
  const qualify = group === 'L' ? 4 : 2;
  const wrap = el('section', 'standings');
  wrap.append(el('h3', 'page-h', group === 'L' ? 'League table' : `Pool ${group}`));
  const tbl = el('table', 'table');
  const head = el('tr');
  for (const [h, title] of [['', ''], ['Team', ''], ['P', 'Played'], ['W', 'Won'], ['L', 'Lost'], ['PD', 'Points difference'], ['BP', 'Bonus points'], ['Pts', 'Table points']]) {
    const th = el('th', null, h);
    if (title) th.title = title;
    head.append(th);
  }
  const thead = el('thead');
  thead.append(head);
  const body = el('tbody');
  rows.forEach((row, i) => {
    const team = teamOf(t, row.id);
    const tr = el('tr', `${row.id === t.userTeam ? 'mine' : ''}${i === qualify - 1 ? ' cut' : ''}`.trim());
    const name = el('td', 'tn');
    name.append(kitChip(team), el('span', 'tn-long', team.name), el('span', 'tn-short', team.short));
    const pd = row.for - row.against;
    tr.append(el('td', 'pos', i + 1), name, el('td', null, row.played), el('td', null, row.won), el('td', null, row.lost), el('td', null, pd > 0 ? `+${pd}` : pd), el('td', null, row.bonus), el('td', 'pts', row.points));
    body.append(tr);
  });
  tbl.append(thead, body);
  wrap.append(tbl);
  wrap.append(el('p', 'table-note', group === 'L' ? 'Top four go to the play-offs.' : 'Top two go through to the semi-finals.'));
  return wrap;
}

function fixtureRow(t, f) {
  const row = el('li', 'fx');
  if (f.home === t.userTeam || f.away === t.userTeam) row.classList.add('mine');
  const side = (id, i) => {
    const team = teamOf(t, id);
    const s = el('span', `fx-team${i ? ' away' : ''}`);
    const won = f.result && (f.result.winner === 'home') === (i === 0);
    if (won) s.classList.add('won');
    s.append(kitChip(team), el('span', 'tn-long', team.name), el('span', 'tn-short', team.short));
    return s;
  };
  const score = el('b', 'fx-score', f.result ? `${f.result.score[0]}–${f.result.score[1]}` : 'v');
  row.append(side(f.home, 0), score, side(f.away, 1));
  return row;
}

function bracket(t) {
  const wrap = el('section', 'bracket');
  wrap.append(el('h3', 'page-h', 'Knockouts'));
  const semis = t.fixtures.filter(f => f.stage === 'semi');
  const final = t.fixtures.find(f => f.stage === 'final');
  const col = (title, list) => {
    const c = el('div', 'br-col');
    c.append(el('p', 'br-title', title));
    const ul = el('ul', 'fixtures');
    if (list.length) list.forEach(f => ul.append(fixtureRow(t, f)));
    else {
      const li = el('li', 'fx tbd');
      li.textContent = 'To be decided';
      ul.append(li);
    }
    c.append(ul);
    return c;
  };
  wrap.append(col('Semi-finals', semis), col('Final', final ? [final] : []));
  if (t.champion) {
    const champ = teamOf(t, t.champion);
    const trophy = el('p', 'br-champ');
    trophy.append(kitChip(champ), document.createTextNode(`${champ.name} win the ${t.name}`));
    wrap.append(trophy);
  }
  return wrap;
}

function results(t) {
  const played = t.fixtures.filter(f => f.result);
  if (!played.length) return null;
  const wrap = el('section', 'results');
  wrap.append(el('h3', 'page-h', 'Results'));
  const groups = new Map();
  for (const f of played) {
    const key = f.stage === 'pool' || f.stage === 'league' ? `Round ${f.round + 1}` : ROUND_NAMES[f.stage];
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(f);
  }
  const keys = [...groups.keys()].reverse();
  keys.forEach((key, i) => {
    const block = el(i === 0 ? 'div' : 'details', 'res-block');
    const title = el(i === 0 ? 'p' : 'summary', 'br-title', key);
    const ul = el('ul', 'fixtures');
    groups.get(key).forEach(f => ul.append(fixtureRow(t, f)));
    block.append(title, ul);
    wrap.append(block);
  });
  return wrap;
}

export function tournamentHub(t, handlers) {
  const page = el('div', 'page-inner');
  const me = teamOf(t, t.userTeam);
  const head = el('div', 'hub-head');
  head.append(kitChip(me, 'hub-kit'));
  const text = el('div');
  const round = currentRound(t);
  const stage = STAGE_NAMES[t.stage] + (round !== null && (t.stage === 'pool' || t.stage === 'league') ? ` · Round ${round + 1}` : '');
  text.append(el('b', 'hub-name', me.name), el('small', null, `${t.name} · ${stage}`));
  head.append(text);
  page.append(head);
  page.append(nextMatchCard(t, handlers));

  if (t.stage !== 'pool' && t.stage !== 'league') page.append(bracket(t));
  for (const group of Object.keys(t.pools)) page.append(table(t, group));
  const res = results(t);
  if (res) page.append(res);

  const foot = el('div', 'page-foot');
  foot.append(button('Edit squad', handlers.onSquad, 'btn'));
  if (t.stage !== 'done') foot.append(button('Abandon tournament', handlers.onAbandon, 'btn btn-quiet'));
  page.append(foot);
  return page;
}
