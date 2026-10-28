// Friends league screens: start or join a league, the lobby while friends
// pick their clubs, and the season hub with whose match is next.

import { LEVELS, PERSONALITIES } from './ai.js';
import { MATCH_LENGTHS } from './engine.js';
import { button, el, tallButton, toggleRow } from './dom.js';
import { kitVars } from './color.js';
import { bothHuman, humanOf } from './friends.js';
import { LEAGUES, SHORT_SEASON, stageName, teamOf, userAlive, venue } from './tournament.js';
import { bracket, fixtureLabel, kitChip, PLAYOFF_TEXT, results, seasonStats, seg, table } from './tournament-view.js';

const LEAGUE_IDS = ['prem', 'urc', 'top14', 'super'];
const STRENGTH = { expert: ['Favourites', 3], pro: ['Contenders', 2], rookie: ['Outsiders', 1] };
const fullRounds = n => (n % 2 ? n : n - 1);

function clubGrid(teams, chosen, taken, onPick) {
  const grid = el('div', 'team-grid');
  grid.setAttribute('role', 'radiogroup');
  grid.setAttribute('aria-label', 'Your club');
  for (const r of teams) {
    const tile = el('button', 'team-tile');
    tile.type = 'button';
    tile.setAttribute('role', 'radio');
    tile.setAttribute('aria-checked', String(r.id === chosen));
    kitVars(tile, r);
    tile.style.setProperty('--alt', r.alt);
    const by = taken[r.id];
    const [label, stars] = STRENGTH[r.level];
    tile.append(el('span', 'tt-kit'), el('b', 'tt-short', r.short), el('span', 'tt-name', r.name), el('small', 'tt-strength', by ? `Taken · ${by}` : `${'★'.repeat(stars)}${'☆'.repeat(3 - stars)} ${label}`));
    if (by) {
      tile.disabled = true;
      tile.classList.add('taken');
    } else tile.addEventListener('click', () => onPick(r.id));
    grid.append(tile);
  }
  return grid;
}

function unavailable(handlers) {
  const card = el('section', 'ol-card');
  card.append(
    el('h3', 'page-h', 'Friends leagues need claude.ai'),
    el('p', null, 'A friends league lives in this page’s shared data on claude.ai. Open the game there, signed in, on every phone.'),
    el('p', null, 'Share the page with your friends from the Share menu, as Contributors so they can save their results. Each of you picks a club; the CPU plays the rest.'),
  );
  const page = el('div', 'page-inner');
  page.append(card, button('Back', handlers.onBack, 'btn btn-wide'));
  return page;
}

function startPage(state, handlers) {
  const page = el('div', 'page-inner');
  const f = state.form;
  if (state.error) {
    const err = el('p', 'ol-error', state.error);
    err.setAttribute('role', 'alert');
    page.append(err);
  }
  page.append(el('p', 'page-note', 'Several phones, one league. Each friend takes a club; the CPU plays every other one. Matches between friends are played online, phone to phone; everyone else’s results come in as you go.'));

  const create = el('section', 'ol-card friends-create');
  create.append(el('h3', 'page-h', 'Start a league'));
  create.append(seg('League', 'f-league', LEAGUE_IDS.map(id => [id, LEAGUES[id].short]), f.league, v => handlers.onForm({ league: v, team: null })));
  const league = LEAGUES[f.league];
  const team = f.team && league.teams.some(t => t.id === f.team) ? f.team : league.teams[0].id;
  create.append(el('p', 'br-title', 'Your club'), clubGrid(league.teams, team, {}, id => handlers.onForm({ team: id })));
  create.append(
    seg('Season', 'f-season', [['short', 'Short', `${SHORT_SEASON} rounds`], ['full', 'Full', `${fullRounds(league.teams.length)} rounds`]], f.season, v => handlers.onForm({ season: v })),
    seg('Match type', 'f-format', [['rolls', 'On the clock', 'A set number of rolls'], ['points', 'Race', 'First to a score']], f.format || 'rolls', v => handlers.onForm({ format: v })),
    seg('Match length', 'f-length', Object.entries(MATCH_LENGTHS).map(([k, v]) => [k, v.label, (f.format || 'rolls') === 'rolls' ? `${v.rolls} rolls` : `FT ${v.full}`]), f.length, v => handlers.onForm({ length: v })),
    toggleRow('Team cards', 'A draft before every match', f.cards, on => handlers.onForm({ cards: on })),
    toggleRow('Bench', 'One replacement a half clears an injury', f.bench, on => handlers.onForm({ bench: on })),
    toggleRow('Weather', 'Rain and wind, different every match', f.weather, on => handlers.onForm({ weather: on })),
  );
  create.append(button('Start the league', () => handlers.onCreate({ ...f, team }), 'btn btn-primary btn-wide', { primary: true }));
  page.append(create);

  const join = el('section', 'ol-card');
  const form = el('form', 'ol-join');
  const code = el('input', 'ol-code-input');
  code.id = 'friends-code';
  code.placeholder = 'Code';
  code.autocomplete = 'off';
  code.autocapitalize = 'characters';
  code.spellcheck = false;
  code.maxLength = 8;
  code.value = f.code || '';
  code.setAttribute('aria-label', 'League code');
  const go = el('button', 'btn', 'Join');
  go.type = 'submit';
  form.append(code, go);
  form.addEventListener('submit', e => {
    e.preventDefault();
    handlers.onJoin(code.value);
  });
  join.append(el('h3', 'page-h', 'Join a league'), el('p', null, 'Type the six-letter code from your friend’s screen, then pick a club.'), form);
  page.append(join);
  page.append(el('p', 'fineprint', 'Real team names, made-up players. Not affiliated with or endorsed by any league, union or club.'));
  return page;
}

// Everyone in the league: their club, their name, and where they stand.
function membersCard(state, title = 'In this league') {
  const box = el('section', 'ol-card friends-members');
  box.append(el('h3', 'page-h', title));
  const ul = el('ul', 'members');
  for (const m of state.members) {
    const li = el('li', `member${m.me ? ' me' : ''}`);
    const team = LEAGUES[state.settings.league].teams.find(t => t.id === m.club);
    li.append(kitChip(team, 'kit'), el('b', null, team.name), el('span', null, m.me ? 'You' : m.name || 'A friend'));
    const tags = el('span', 'member-tags');
    if (m.uid === state.settings.host) tags.append(el('small', 'member-tag', 'Started it'));
    if (m.status) tags.append(el('small', `member-status ${m.status.kind}`, m.status.text));
    li.append(tags);
    ul.append(li);
  }
  if (!state.members.length) ul.append(el('li', 'member', 'Nobody yet.'));
  box.append(ul);
  return box;
}

function codeCard(state, handlers) {
  const box = el('section', 'ol-card ol-code-card');
  box.append(el('p', 'nc-kicker', 'League code'));
  const big = el('p', 'ol-code', state.settings.code.toUpperCase().split('').join(' '));
  big.setAttribute('aria-label', `Code ${state.settings.code.split('').join(' ')}`);
  box.append(big, button(state.copied ? 'Copied' : 'Copy code', handlers.onCopy, 'btn ol-copy'));
  box.append(el('p', null, 'Friends open this game on claude.ai, tap Friends league, then Join a league and type the code.'));
  return box;
}

const settingsLine = s => {
  const L = LEAGUES[s.league];
  const rounds = s.season === 'full' ? fullRounds(L.teams.length) : SHORT_SEASON;
  const format = (s.format || 'points') === 'rolls' ? `${MATCH_LENGTHS[s.length].rolls} rolls` : `first to ${MATCH_LENGTHS[s.length].full}`;
  return [`${L.short}`, `${rounds} rounds`, `${MATCH_LENGTHS[s.length].label} matches (${format})`, s.cards && 'team cards', s.bench && 'bench', s.weather && 'weather'].filter(Boolean).join(' · ');
};

function lobbyPage(state, handlers) {
  const page = el('div', 'page-inner');
  if (state.error) page.append(el('p', 'ol-error', state.error));
  page.append(codeCard(state, handlers));
  page.append(el('p', 'page-note', `${settingsLine(state.settings)}. ${PLAYOFF_TEXT[LEAGUES[state.settings.league].playoff]}`));
  page.append(membersCard(state, 'Friends in so far'));
  const L = LEAGUES[state.settings.league];
  if (!state.myClub) {
    const pick = el('section', 'pick');
    pick.append(el('h3', 'page-h', 'Pick your club'));
    const taken = Object.fromEntries(state.members.map(m => [m.club, m.me ? 'You' : m.name || 'a friend']));
    pick.append(clubGrid(L.teams, null, taken, handlers.onPickClub));
    page.append(pick);
  }
  const host = state.me === state.settings.host;
  if (host) {
    const go = tallButton('Start the season', state.members.length < 2 ? 'Wait for at least one friend to join' : `${state.members.length} friends, ${L.teams.length - state.members.length} clubs for the CPU`, handlers.onStart, 'btn btn-primary btn-wide');
    go.disabled = state.members.length < 2;
    page.append(go);
  } else {
    page.append(el('p', 'page-note', 'The friend who started the league kicks off the season once everyone’s in.'));
  }
  page.append(button('Leave this league', handlers.onLeave, 'btn btn-quiet btn-wide'));
  return page;
}

const nameOf = (state, uid) => (uid === state.me ? 'you' : state.names[uid] || 'a friend');

// The next-match card for a friends league.
function nextCard(state, handlers) {
  const { t, pending } = state.built;
  const card = el('section', 'next-card');
  const me = state.myClub ? teamOf(t, state.myClub) : null;
  if (me) kitVars(card, me);
  if (t.stage === 'done') {
    const champ = teamOf(t, t.champion);
    kitVars(card, champ);
    card.classList.add('champions');
    const who = humanOf(state.clubs, t.champion);
    card.append(el('p', 'nc-kicker', `${LEAGUES[state.settings.league].short} · Final whistle`), el('h3', 'nc-title', who === state.me ? 'Champions!' : `${champ.name} win the league`));
    if (who && who !== state.me) card.append(el('p', 'nc-meta', `${champ.name} were ${nameOf(state, who)}’s club.`));
    card.append(button('Leave this league', handlers.onLeave, 'btn'));
    return card;
  }
  const f = state.mine;
  if (f) {
    const them = teamOf(t, f.home === state.myClub ? f.away : f.home);
    const friend = humanOf(state.clubs, them.id);
    card.append(el('p', 'nc-kicker', `Next · ${fixtureLabel(t, f)}`));
    const vs = el('div', 'nc-vs');
    const side = (team, mine) => {
      const s = el('div', `nc-side${mine ? ' mine' : ''}`);
      const where = f.home === team.id ? 'Home' : 'Away';
      const label = mine ? `You · ${where}` : friend ? `${nameOf(state, friend)} · ${where}` : `${LEVELS[team.level].name} · ${PERSONALITIES[team.personality].name}`;
      s.append(kitChip(team, 'nc-kit'), el('b', null, team.name), el('small', null, label));
      return s;
    };
    vs.append(side(me, true), el('span', 'nc-v', 'v'), side(them, false));
    card.append(vs);
    const ground = venue(t, f);
    if (ground) card.append(el('p', `nc-venue${ground.neutral ? ' neutral' : ''}`, ground.name));
    const note = friend ? 'Online, phone to phone' : `${MATCH_LENGTHS[t.length].label} match against the CPU`;
    card.append(tallButton(friend ? `Play ${nameOf(state, friend)}` : 'Play', note, handlers.onPlay, 'btn btn-primary btn-play'));
    card.querySelector('.btn-play').dataset.primary = '';
    return card;
  }
  // Nothing to play: waiting on friends, a bye, or out.
  const waiting = pending.filter(x => !(humanOf(state.clubs, x.home) === state.me || humanOf(state.clubs, x.away) === state.me));
  card.classList.add('bye');
  card.append(el('p', 'nc-kicker', `${LEAGUES[state.settings.league].short} · ${stageName(t)}`));
  if (state.myClub && !userAlive(t)) card.append(el('h3', 'nc-title', 'Out of the running'));
  else card.append(el('h3', 'nc-title', 'Waiting for friends'));
  const list = el('ul', 'waiting-list');
  for (const x of waiting) {
    const [h, a] = [teamOf(t, x.home), teamOf(t, x.away)];
    const people = [humanOf(state.clubs, x.home), humanOf(state.clubs, x.away)].filter(Boolean).map(uid => nameOf(state, uid));
    list.append(el('li', null, `${h.name} v ${a.name} · ${people.join(' and ')} to play${bothHuman(state.clubs, x) ? ' (online)' : ''}`));
  }
  if (waiting.length) card.append(el('p', 'nc-meta', 'The round moves on once these are played:'), list);
  return card;
}

function seasonPage(state, handlers) {
  const { t } = state.built;
  const page = el('div', 'page-inner');
  if (state.error) page.append(el('p', 'ol-error', state.error));
  const head = el('div', 'hub-head');
  const me = state.myClub ? teamOf(t, state.myClub) : null;
  if (me) head.append(kitChip(me, 'hub-kit'));
  const text = el('div');
  text.append(el('b', 'hub-name', me ? me.name : 'Watching'), el('small', null, `Friends league ${state.settings.code.toUpperCase()} · ${LEAGUES[state.settings.league].short} · ${stageName(t)}`));
  head.append(text);
  page.append(head, nextCard(state, handlers), membersCard(state));
  if (t.stage !== 'league') page.append(bracket(t));
  page.append(table(t, 'L'));
  const stats = seasonStats(t);
  if (stats) page.append(stats);
  const res = results(t);
  if (res) page.append(res);
  const foot = el('div', 'page-foot');
  if (state.myClub) foot.append(button('Edit squad', handlers.onSquad, 'btn'));
  foot.append(button(state.copied ? 'Copied' : `Copy code ${state.settings.code.toUpperCase()}`, handlers.onCopy, 'btn btn-quiet'));
  if (t.stage !== 'done') foot.append(button('Leave this league', handlers.onLeave, 'btn btn-quiet'));
  page.append(foot);
  return page;
}

export function friendsPage(state, handlers) {
  if (state.phase === 'unavailable') return unavailable(handlers);
  if (state.phase === 'loading') {
    const page = el('div', 'page-inner');
    page.append(el('p', 'page-note', 'Loading the league…'));
    return page;
  }
  if (state.phase === 'start') return startPage(state, handlers);
  if (state.phase === 'lobby') return lobbyPage(state, handlers);
  return seasonPage(state, handlers);
}
