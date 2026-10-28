// Tournament screens: picking a competition and team, then the hub with the
// next match, the tables, the knockout bracket and every result.

import { CHAMPIONS_CUP, WORLD_CUP, currentRound, isUserFixture, LEAGUE_OF, LEAGUES, NATIONS, POINTS, QUALIFY, roundName, SHORT_SEASON, stageName, standings, TEAM_BY_ID, teamOf, userAlive, userFixture, userRecord, venue } from './tournament.js';
import { LEVELS, PERSONALITIES } from './ai.js';
import { leaders, LEADER_STATS, playerOfTheSeason, seasonPlayers, teamOfTheSeason } from './season.js';
import { statLine } from './players.js';
import { PLAYERS, POSITIONS } from './dice.js';
import { dieChip } from './dice-view.js';
import { canContinue, nextStep } from './club.js';
import { clubSection } from './club-view.js';
import { MATCH_LENGTHS } from './engine.js';
import { button, el, tallButton, toggleRow } from './dom.js';

const WORLD_CUP_TEXT = 'The top two in each pool and the four best third-placed sides go through to the round of 16.';

// How the table works, in a sentence.
export const POINTS_TEXT = `A win is worth ${POINTS.win} points and a draw ${POINTS.draw}, with a bonus point for winning by ${POINTS.bigWinBy} or more or losing by ${POINTS.losingBonusWithin} or fewer.`;
import { kitVars } from './color.js';

const STRENGTH = { expert: ['Favourites', 3], pro: ['Contenders', 2], rookie: ['Outsiders', 1] };

export const kitChip = (team, className = 'kit') => {
  const chip = el('span', className);
  kitVars(chip, team);
  chip.style.setProperty('--alt', team.alt || team.color);
  return chip;
};

export function seg(legend, name, options, value, onChange) {
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

export const CHAMPIONS_TEXT = 'The top three in each pool go through to the round of 16, with the four best-placed of the rest.';

// What each play-off format means, in a sentence.
export const PLAYOFF_TEXT = {
  top4: 'The top four go to the semi-finals.',
  top6: 'The top six go to the play-offs: the top two go straight into the semi-finals, the next four play barrages.',
  top8: 'The top eight go to the quarter-finals.',
  super6: 'The top six go to the qualifying finals; the three winners and the best-placed loser reach the semi-finals.',
};

const COMPETITIONS = [
  { id: 'cup', name: WORLD_CUP.name, note: '24 nations · the real pools in Australia, then knockouts' },
  { id: 'champions', name: CHAMPIONS_CUP.name, note: '24 clubs from the Prem, URC and Top 14 · four pools of six, then knockouts', season: CHAMPIONS_CUP.season },
  { id: 'super', name: LEAGUES.super.name, note: `${LEAGUES.super.teams.length} teams · top six to the finals`, season: LEAGUES.super.season },
  { id: 'prem', name: LEAGUES.prem.name, note: `${LEAGUES.prem.teams.length} clubs · top four to the semi-finals`, season: LEAGUES.prem.season },
  { id: 'urc', name: LEAGUES.urc.name, note: `${LEAGUES.urc.teams.length} teams · top eight to the quarter-finals`, season: LEAGUES.urc.season },
  { id: 'top14', name: LEAGUES.top14.name, note: `${LEAGUES.top14.teams.length} clubs · top six to the play-offs`, season: LEAGUES.top14.season },
];

// Rounds in a full season: everyone plays everyone once (plus a bye each with an odd number of teams).
const fullRounds = n => (n % 2 ? n : n - 1);

export function tournamentSetup(state, { onChange, onStart }) {
  const page = el('div', 'page-inner');
  const comps = el('fieldset', 'comp-list');
  comps.append(el('legend', null, 'Competition'));
  for (const c of COMPETITIONS) {
    const lab = el('label', 'comp');
    const input = el('input');
    input.type = 'radio';
    input.name = 't-comp';
    input.value = c.id;
    input.checked = c.id === state.comp;
    input.addEventListener('change', () => onChange({ comp: c.id, team: null }));
    const text = el('span', 'comp-text');
    text.append(el('b', null, c.name), el('small', null, c.note));
    if (c.season) text.append(el('small', 'comp-season', c.season));
    lab.append(input, text);
    comps.append(lab);
  }
  page.append(comps);

  const league = LEAGUES[state.comp];
  const europe = state.comp === 'champions';
  // The Champions Cup's clubs come pool by pool, as drawn.
  const groups = europe
    ? Object.entries(CHAMPIONS_CUP.pools).map(([group, ids]) => [`Pool ${group}`, ids.map(id => TEAM_BY_ID[id])])
    : [[null, league ? league.teams : NATIONS]];
  const roster = groups.flatMap(([, teams]) => teams);
  const team = state.team && roster.some(r => r.id === state.team) ? state.team : roster[0].id;
  const pick = el('div', 'pick');
  pick.append(el('h3', 'page-h', 'Pick your team'));
  for (const [title, teams] of groups) {
    if (title) pick.append(el('p', 'br-title pool-title', title));
    const grid = el('div', 'team-grid');
    grid.setAttribute('role', 'radiogroup');
    grid.setAttribute('aria-label', title ? `Your team: ${title}` : 'Your team');
    for (const r of teams) {
      const tile = el('button', 'team-tile');
      tile.type = 'button';
      tile.setAttribute('role', 'radio');
      tile.setAttribute('aria-checked', String(r.id === team));
      kitVars(tile, r);
      tile.style.setProperty('--alt', r.alt);
      const [label, stars] = STRENGTH[r.level];
      // In the Champions Cup the stars sit beside the club's league.
      const note = europe ? LEAGUES[LEAGUE_OF[r.id]].short : label;
      tile.append(el('span', 'tt-kit'), el('b', 'tt-short', r.short), el('span', 'tt-name', r.name), el('small', 'tt-strength', `${'★'.repeat(stars)}${'☆'.repeat(3 - stars)} ${note}`));
      tile.title = `${r.name}: ${label}`;
      tile.addEventListener('click', () => onChange({ team: r.id }));
      grid.append(tile);
    }
    pick.append(grid);
  }
  page.append(pick);

  const full = league ? fullRounds(league.teams.length) : 0;
  if (league) {
    page.append(seg('Season', 't-season', [['short', 'Short', `${SHORT_SEASON} rounds`], ['full', 'Full', `${full} rounds · everyone once`]], state.season, v => onChange({ season: v })));
  }
  page.append(seg('Match type', 't-format', [['rolls', 'On the clock', 'A set number of rolls'], ['points', 'Race', 'First to a score']], state.format || 'rolls', v => onChange({ format: v })));
  page.append(seg('Match length', 't-length', Object.entries(MATCH_LENGTHS).map(([k, v]) => [k, v.label, (state.format || 'rolls') === 'rolls' ? `${v.rolls} rolls` : `HT ${v.half} · FT ${v.full}`]), state.length, v => onChange({ length: v })));

  page.append(
    toggleRow('Team cards', 'A draft before every match', state.cards, on => onChange({ cards: on })),
    toggleRow('Bench', 'One replacement a half clears an injury', state.bench, on => onChange({ bench: on })),
    toggleRow('Weather', 'Rain and wind, different every match', state.weather, on => onChange({ weather: on })),
  );

  const rounds = league ? (state.season === 'full' ? full : SHORT_SEASON) : 3;
  const what = league
    ? `${rounds} rounds${league.teams.length % 2 ? ' (one side sits out each round)' : ''}. ${PLAYOFF_TEXT[league.playoff]}`
    : europe
      ? `Up to 8 matches: 4 in your pool, against the clubs from the other two leagues, then a round of 16, quarter-finals, semi-finals and the final in Lyon. ${CHAMPIONS_TEXT}`
      : `Up to 7 matches: 3 in your pool, then the round of 16, quarter-finals, semi-finals and the final at Stadium Australia. ${WORLD_CUP_TEXT}`;
  page.append(el('p', 'page-note', `${what} ${POINTS_TEXT}${(state.format || 'rolls') === 'rolls' ? ' A knockout match level at full time goes to sudden death: the next score wins.' : ''}`));
  const name = league ? league.short : europe ? CHAMPIONS_CUP.short : WORLD_CUP.short;
  page.append(button(`Start the ${name}`, () => onStart({ ...state, team }), 'btn btn-primary btn-wide', { primary: true }));
  if (league) page.append(el('p', 'page-note', 'When the season ends, carry on with your club into the next one, squad and all. Clubs in the Champions Cup play it after the league; the top eight qualify for the next.'));
  page.append(el('p', 'fineprint', 'Real teams and players, named for fun: squads are a best guess at the current season and players move clubs. Not affiliated with or endorsed by any player, league, union or club.'));
  return page;
}

// ---- Hub -----------------------------------------------------------------------

export function fixtureLabel(t, f) {
  if (f.stage === 'pool') return `Pool ${f.group} · Round ${f.round + 1} of ${t.poolRounds || 3}`;
  if (f.stage === 'league') return `Round ${f.round + 1} of ${t.rounds || 7}`;
  return roundName(t, f.stage);
}

const tName = t => t.short || t.name;

function nextMatchCard(t, handlers) {
  const card = el('section', 'next-card');
  const f = userFixture(t);
  const me = teamOf(t, t.userTeam);
  if (t.stage === 'done') {
    const champ = teamOf(t, t.champion);
    kitVars(card, champ);
    card.classList.add('champions');
    const mine = t.champion === t.userTeam;
    card.append(el('p', 'nc-kicker', `${tName(t)} · Final whistle`), el('h3', 'nc-title', mine ? 'Champions!' : `${champ.name} win the ${tName(t)}`));
    const rec = userRecord(t);
    card.append(el('p', 'nc-meta', `Your record: won ${rec.won}${rec.drawn ? `, drawn ${rec.drawn}` : ''}, lost ${rec.lost}.`));
    const best = playerOfTheSeason(seasonPlayers(t));
    if (best) card.append(el('p', 'nc-meta', `Player of the ${t.kind === 'league' ? 'season' : 'tournament'}: ${best.name}, ${teamOf(t, best.team).name} (${PLAYERS[best.pos].one}).`));
    // A league season (or a club career's Champions Cup) rolls on.
    if (canContinue(t)) {
      const next = nextStep(t);
      card.append(el('p', 'nc-meta', next.europe ? `${me.name} are in this season's Champions Cup.` : `Carry on with ${me.name}: same squad, a new season.`));
      card.append(button(next.label, handlers.onContinue, 'btn btn-primary', { primary: true }), button('New tournament', handlers.onNew, 'btn btn-quiet'));
    } else {
      card.append(button('New tournament', handlers.onNew, 'btn btn-primary', { primary: true }));
    }
    return card;
  }
  if (!f && userAlive(t)) {
    // A bye: a round off in a league with an odd number of teams, or a top-two
    // finish straight into the semi-finals.
    kitVars(card, me);
    card.classList.add('bye');
    const round = currentRound(t);
    const knockout = t.stage !== 'league' && t.stage !== 'pool';
    card.append(
      el('p', 'nc-kicker', `${tName(t)} · ${knockout ? stageName(t) : `Round ${round + 1} of ${t.rounds || 7}`}`),
      el('h3', 'nc-title', knockout ? 'Straight into the semi-finals' : 'Bye this round'),
      el('p', 'nc-meta', knockout ? `${me.name} finished in the top two. Play out the ${stageName(t).toLowerCase()} to meet your semi-final opponent.` : `${me.name} sit this round out while the others play.`),
    );
    card.append(button(knockout ? `Play out the ${stageName(t).toLowerCase()}` : `Play out round ${round + 1}`, handlers.onSimRound, 'btn btn-primary', { primary: true }));
    return card;
  }
  if (!userAlive(t) || !f) {
    card.classList.add('out');
    // Where it ended: the last knockout tie the user played, if any.
    const last = t.fixtures.filter(x => x.result && isUserFixture(t, x) && x.stage !== 'pool' && x.stage !== 'league').pop();
    const out = last ? `Out in the ${roundName(t, last.stage, true).toLowerCase()}` : t.kind === 'league' ? 'Missed the play-offs' : 'Out in the pool stage';
    card.append(el('p', 'nc-kicker', `${tName(t)} · ${stageName(t)}`), el('h3', 'nc-title', out));
    card.append(el('p', 'nc-meta', 'Play out the rest to see who lifts the trophy.'));
    card.append(button('Play out the rest', handlers.onSimRest, 'btn btn-primary', { primary: true }));
    return card;
  }
  const them = teamOf(t, f.home === t.userTeam ? f.away : f.home);
  kitVars(card, me);
  card.append(el('p', 'nc-kicker', `Next · ${fixtureLabel(t, f)}`));
  const vs = el('div', 'nc-vs');
  const side = (team, mine) => {
    const s = el('div', `nc-side${mine ? ' mine' : ''}`);
    const ground = venue(t, f);
    const where = ground?.neutral ? 'Neutral' : f.home === team.id ? 'Home' : 'Away';
    s.append(kitChip(team, 'nc-kit'), el('b', null, team.name), el('small', null, mine ? `You · ${where}` : `${LEVELS[team.level].name} · ${PERSONALITIES[team.personality].name}`));
    return s;
  };
  vs.append(side(me, true), el('span', 'nc-v', 'v'), side(them, false));
  card.append(vs);
  const ground = venue(t, f);
  if (ground) card.append(el('p', `nc-venue${ground.neutral ? ' neutral' : ''}`, ground.neutral ? `${ground.name} · neutral ground` : ground.name));
  const extras = [t.cards && 'team cards', t.bench && 'bench', t.weather && 'weather'].filter(Boolean);
  const format = (t.format || 'points') === 'rolls' ? `${MATCH_LENGTHS[t.length].rolls} rolls` : `first to ${MATCH_LENGTHS[t.length].full}`;
  card.append(tallButton('Play', [`${MATCH_LENGTHS[t.length].label} match, ${format}`, ...extras].join(' · '), handlers.onPlay, 'btn btn-primary btn-play'));
  card.querySelector('.btn-play').dataset.primary = '';
  return card;
}

export function table(t, group) {
  const rows = standings(t, group);
  const europe = t.kind === 'champions';
  const qualify = group === 'L' ? QUALIFY[t.playoff || 'top4'] : europe ? CHAMPIONS_CUP.through : 2;
  const wrap = el('section', 'standings');
  wrap.append(el('h3', 'page-h', group === 'L' ? `${tName(t)} table` : `Pool ${group}`));
  const tbl = el('table', 'table');
  const head = el('tr');
  const draws = rows.some(r => r.drawn);
  for (const [h, title] of [['', ''], ['Team', ''], ['P', 'Played'], ['W', 'Won'], ...(draws ? [['D', 'Drawn']] : []), ['L', 'Lost'], ['PD', 'Points difference'], ['BP', 'Bonus points'], ['Pts', 'Table points']]) {
    const th = el('th', null, h);
    if (title) th.title = title;
    head.append(th);
  }
  const thead = el('thead');
  thead.append(head);
  const body = el('tbody');
  rows.forEach((row, i) => {
    const team = teamOf(t, row.id);
    const tr = el('tr', `${row.id === t.userTeam ? 'mine' : ''}${i === qualify - 1 ? ' cut' : ''}${t.playoff === 'top6' && i === 1 ? ' cut2' : ''}`.trim());
    const name = el('td', 'tn');
    name.append(kitChip(team), el('span', 'tn-long', team.name), el('span', 'tn-short', team.short));
    const pd = row.for - row.against;
    tr.append(el('td', 'pos', i + 1), name, el('td', null, row.played), el('td', null, row.won), ...(draws ? [el('td', null, row.drawn)] : []), el('td', null, row.lost), el('td', null, pd > 0 ? `+${pd}` : pd), el('td', null, row.bonus), el('td', 'pts', row.points));
    body.append(tr);
  });
  tbl.append(thead, body);
  wrap.append(tbl);
  wrap.append(el('p', 'table-note', `${group === 'L' ? PLAYOFF_TEXT[t.playoff || 'top4'] : europe ? CHAMPIONS_TEXT : t.worldCup ? WORLD_CUP_TEXT : 'The top two go through to the semi-finals.'} ${POINTS_TEXT}`));
  return wrap;
}

function fixtureRow(t, f) {
  const row = el('li', 'fx');
  if (f.home === t.userTeam || f.away === t.userTeam) row.classList.add('mine');
  const side = (id, i) => {
    const team = teamOf(t, id);
    const s = el('span', `fx-team${i ? ' away' : ''}`);
    const won = f.result && f.result.winner !== 'draw' && (f.result.winner === 'home') === (i === 0);
    if (won) s.classList.add('won');
    s.append(kitChip(team), el('span', 'tn-long', team.name), el('span', 'tn-short', team.short));
    return s;
  };
  const score = el('b', 'fx-score', f.result ? `${f.result.score[0]}–${f.result.score[1]}` : 'v');
  row.append(side(f.home, 0), score, side(f.away, 1));
  return row;
}

export function bracket(t) {
  const wrap = el('section', 'bracket');
  wrap.append(el('h3', 'page-h', 'Knockouts'));
  const col = (title, list, note = null) => {
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
    if (note) c.append(el('p', 'table-note', note));
    return c;
  };
  const stage = name => t.fixtures.filter(f => f.stage === name);
  const r16 = stage('r16');
  if (r16.length) wrap.append(col(roundName(t, 'r16', true), r16));
  const qf = stage('qf');
  if (qf.length) {
    const byes = t.playoff === 'top6' && t.seeds && !r16.length ? Object.entries(t.seeds).filter(([, n]) => n <= 2).map(([id]) => teamOf(t, id).name) : [];
    const note = byes.length ? `${byes.join(' and ')} go straight into the semi-finals.` : t.playoff === 'super6' ? 'The best-placed loser also goes through.' : null;
    wrap.append(col(roundName(t, 'qf', true), qf, note));
  }
  const final = t.fixtures.find(f => f.stage === 'final');
  wrap.append(col(roundName(t, 'semi', true), stage('semi')), col(roundName(t, 'final'), final ? [final] : []));
  if (t.champion) {
    const champ = teamOf(t, t.champion);
    const trophy = el('p', 'br-champ');
    trophy.append(kitChip(champ), document.createTextNode(`${champ.name} win the ${tName(t)}`));
    wrap.append(trophy);
  }
  return wrap;
}

export function results(t) {
  const played = t.fixtures.filter(f => f.result);
  if (!played.length) return null;
  const wrap = el('section', 'results');
  wrap.append(el('h3', 'page-h', 'Results'));
  const groups = new Map();
  for (const f of played) {
    const key = f.stage === 'pool' || f.stage === 'league' ? `Round ${f.round + 1}` : roundName(t, f.stage, true);
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

// ---- Season stats -----------------------------------------------------------

const surnameOf = name => name.replace(/^[A-Z]\.\s*/, '');
const SHOWN_LEADERS = ['tries', 'points', 'metres', 'tackles'];

function playerCell(t, p) {
  const team = teamOf(t, p.team);
  const cell = el('span', 'sp-who');
  cell.append(kitChip(team), el('b', null, surnameOf(p.name)), el('small', null, team.short));
  return cell;
}

function leaderBoard(t, players, stat) {
  const [, title, , [one, many]] = LEADER_STATS.find(([id]) => id === stat);
  const list = leaders(players, stat);
  const box = el('div', 'leader-box');
  box.append(el('p', 'br-title', title));
  const ol = el('ol', 'leaders');
  if (!list.length) ol.append(el('li', 'tbd', 'Nobody yet'));
  for (const p of list) {
    const li = el('li', p.team === t.userTeam ? 'mine' : '');
    li.append(playerCell(t, p), el('span', 'sp-num', `${p.value} ${p.value === 1 ? one : many}`));
    ol.append(li);
  }
  box.append(ol);
  return box;
}

// Leaders and the Team of the Season (so far, until the competition is over).
export function seasonStats(t) {
  const players = seasonPlayers(t);
  if (!players.length) return null;
  const done = t.stage === 'done';
  const wrap = el('section', 'season-stats');
  const word = t.kind === 'league' ? 'Season' : 'Tournament';
  wrap.append(el('h3', 'page-h', `${word} stats`));
  const grid = el('div', 'leader-grid');
  for (const stat of SHOWN_LEADERS) grid.append(leaderBoard(t, players, stat));
  wrap.append(grid);

  const team = teamOfTheSeason(players);
  const best = playerOfTheSeason(players);
  const tots = el('div', 'tots');
  tots.append(el('p', 'br-title', `Team of the ${word.toLowerCase()}${done ? '' : ' so far'}`));
  const ul = el('ul', 'tots-list');
  for (const pos of POSITIONS) {
    const p = team[pos];
    if (!p) continue;
    const li = el('li', `${p.team === t.userTeam ? 'mine' : ''}${p === best ? ' best' : ''}`.trim());
    const head = el('span', 'tots-head');
    head.append(dieChip(pos), playerCell(t, p));
    if (p === best) head.append(el('span', 'tots-star', done ? `Player of the ${word.toLowerCase()}` : 'Best so far'));
    li.append(head, el('small', 'tots-line', `${PLAYERS[pos].one} · ${p.apps} ${p.apps === 1 ? 'match' : 'matches'} · ${statLine(p)}`));
    ul.append(li);
  }
  tots.append(ul);
  wrap.append(tots);
  return wrap;
}

export function tournamentHub(t, handlers) {
  const page = el('div', 'page-inner');
  const me = teamOf(t, t.userTeam);
  const head = el('div', 'hub-head');
  head.append(kitChip(me, 'hub-kit'));
  const text = el('div');
  const round = currentRound(t);
  const stage = stageName(t) + (round !== null && (t.stage === 'pool' || t.stage === 'league') ? ` · Round ${round + 1}` : '');
  text.append(el('b', 'hub-name', me.name), el('small', null, `${tName(t)}${t.seasonName ? ` ${t.seasonName}` : ''} · ${stage}`));
  head.append(text);
  page.append(head);
  page.append(nextMatchCard(t, handlers));

  if (t.stage !== 'pool' && t.stage !== 'league') page.append(bracket(t));
  for (const group of Object.keys(t.pools)) page.append(table(t, group));
  const stats = seasonStats(t);
  if (stats) page.append(stats);
  const club = clubSection(t);
  if (club) page.append(club);
  const res = results(t);
  if (res) page.append(res);

  const foot = el('div', 'page-foot');
  foot.append(button('Edit squad', handlers.onSquad, 'btn'));
  if (t.stage !== 'done') foot.append(button('Abandon tournament', handlers.onAbandon, 'btn btn-quiet'));
  page.append(foot);
  return page;
}
