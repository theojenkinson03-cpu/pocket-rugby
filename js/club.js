// Club career: season after season with one club. A finished league season
// rolls into the next with the same squads; a club in the Champions Cup
// plays it after the league, and the top eight in its league qualify for
// the next one. The club keeps a season-by-season history, a records book
// and a trophy cabinet.

import { CHAMPIONS_CUP, createChampions, createLeague, LEAGUE_OF, LEAGUES, standings, teamOf } from './tournament.js';
import { seasonPlayers, totalPoints } from './season.js';

const FIRST_YEAR = 2026;
export const EUROPE_PLACES = 8;

// "2026–27" for the European leagues, "2026" for Super Rugby.
export function seasonName(league, number) {
  const year = FIRST_YEAR + number - 1;
  return league === 'super' ? `${year}` : `${year}–${String((year + 1) % 100).padStart(2, '0')}`;
}

const shuffle = (list, rng) => {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

// The clubs in this season's Champions Cup, by league: the real 2026-27 field to start with.
function realField() {
  const field = { prem: [], urc: [], top14: [] };
  for (const ids of Object.values(CHAMPIONS_CUP.pools)) for (const id of ids) field[LEAGUE_OF[id]].push(id);
  return field;
}

// Four pools of six, two from each league, drawn at random.
export function drawPools(field, rng = Math.random) {
  const leagues = Object.keys(field).map(league => shuffle(field[league], rng));
  return Object.fromEntries([1, 2, 3, 4].map(n => [n, leagues.flatMap(ids => ids.slice((n - 1) * 2, n * 2))]));
}

const emptySeason = (club, number) => ({ number, name: seasonName(club.league, number), league: null, europe: null, won: 0, lost: 0, players: {} });

// Starts a club career from a finished first season of a league.
export function newClub(t) {
  const club = {
    team: t.userTeam,
    league: t.league,
    seasonLength: t.season,
    number: 1,
    // This season's Champions Cup field, and the next one's as it is decided.
    cupField: realField(),
    nextField: null,
    rosters: {},
    current: null,
    seasons: [],
    trophies: [],
    players: {},
    records: {},
    run: 0,
  };
  club.current = emptySeason(club, 1);
  return club;
}

export const playsEurope = club => !!club.cupField?.[club.league]?.includes(club.team);

// How far a side got, in words, from the last stage they played.
export function outcomeOf(t, team) {
  if (t.champion === team) return { stage: 'champion', text: t.kind === 'league' ? 'Champions' : 'Winners' };
  const played = t.fixtures.filter(f => f.result && (f.home === team || f.away === team));
  const last = played[played.length - 1];
  const words = { final: 'Runners-up', semi: 'Semi-finals', qf: t.kind === 'league' && t.playoff === 'top6' ? 'Barrages' : t.kind === 'league' && t.playoff === 'super6' ? 'Qualifying finals' : 'Quarter-finals', r16: 'Round of 16' };
  if (last && words[last.stage]) return { stage: last.stage, text: words[last.stage] };
  return { stage: 'group', text: t.kind === 'league' ? 'Missed the play-offs' : 'Pool stage' };
}

const STAGE_RANK = { group: 0, r16: 1, qf: 2, semi: 3, final: 4, champion: 5 };

function keepRecord(records, key, entry, better) {
  if (!records[key] || better(entry, records[key])) records[key] = entry;
}

// Folds a finished competition into the club: results, records, players,
// trophies, and for a league the table place and next season's Europe.
export function closeCompetition(club, t) {
  if (t.closed) return club;
  t.closed = true;
  const season = club.current;
  const comp = t.kind === 'league' ? LEAGUES[t.league].short : t.short || t.name;
  const team = club.team;
  const records = club.records;
  // Every club's squad carries over to next season.
  for (const side of t.teams) if (side.roster) club.rosters[side.id] = { ...side.roster };

  // The club's matches in order: wins, defeats, runs and match records.
  for (const f of t.fixtures) {
    if (!f.result || (f.home !== team && f.away !== team)) continue;
    const side = f.home === team ? 0 : 1;
    const [mine, theirs] = [f.result.score[side], f.result.score[1 - side]];
    const drawn = f.result.winner === 'draw';
    const won = !drawn && (f.result.winner === 'home') === (side === 0);
    const against = teamOf(t, side ? f.home : f.away)?.name || '';
    const base = { score: `${mine}–${theirs}`, against, season: season.name, comp };
    if (drawn) {
      season.drawn = (season.drawn || 0) + 1;
      club.run = 0;
    } else if (won) {
      season.won++;
      club.run++;
      keepRecord(records, 'biggestWin', { ...base, margin: mine - theirs }, (a, b) => a.margin > b.margin);
      keepRecord(records, 'bestRun', { wins: club.run, season: season.name }, (a, b) => a.wins > b.wins);
    } else {
      season.lost++;
      club.run = 0;
      keepRecord(records, 'heaviestDefeat', { ...base, margin: theirs - mine }, (a, b) => a.margin > b.margin);
    }
    keepRecord(records, 'mostPoints', { ...base, points: mine }, (a, b) => a.points > b.points);
    keepRecord(records, 'mostTries', { ...base, tries: f.result.tries[side] }, (a, b) => a.tries > b.tries);
  }

  // The club's players: this season's totals, by name.
  for (const p of seasonPlayers(t).filter(row => row.team === team)) {
    const row = (season.players[p.name] ||= { name: p.name, pos: p.pos, apps: 0, tries: 0, points: 0, metres: 0, tackles: 0 });
    row.apps += p.apps;
    row.tries += p.tries;
    row.points += totalPoints(p);
    row.metres += p.metres;
    row.tackles += p.tackles;
  }

  const outcome = outcomeOf(t, team);
  if (t.kind === 'league') {
    const table = standings(t, 'L').map(r => r.id);
    const place = table.indexOf(team) + 1;
    season.league = { comp, place, of: table.length, outcome: outcome.text, stage: outcome.stage };
    keepRecord(records, 'bestFinish', { place, outcome: outcome.text, stage: outcome.stage, season: season.name }, (a, b) => STAGE_RANK[a.stage] > STAGE_RANK[b.stage] || (a.stage === b.stage && a.place < b.place));
    if (place === 1) club.trophies.push({ kind: 'leaders', comp, season: season.name, title: `${comp} table-toppers` });
    // The top eight go into next season's Champions Cup.
    if (club.cupField?.[club.league]) club.nextField = { ...club.cupField, [club.league]: table.slice(0, EUROPE_PLACES) };
  } else {
    season.europe = { comp, outcome: outcome.text, stage: outcome.stage };
  }
  if (t.champion === team) club.trophies.push({ kind: t.kind === 'league' ? 'league' : 'europe', comp, season: season.name, title: `${comp} ${t.kind === 'league' ? 'champions' : 'winners'}` });
  return club;
}

// Ends the season: its summary goes into the history, the season's best
// players into the records and the club's all-time totals.
export function finishSeason(club) {
  const season = club.current;
  const records = club.records;
  const players = Object.values(season.players);
  const best = key => players.reduce((top, p) => (!top || p[key] > top[key] ? p : top), null);
  const top = best('tries');
  for (const [key, field] of [['seasonTries', 'tries'], ['seasonPoints', 'points'], ['seasonMetres', 'metres'], ['seasonTackles', 'tackles']]) {
    const p = best(field);
    if (p && p[field] > 0) keepRecord(records, key, { name: p.name, pos: p.pos, value: p[field], season: season.name }, (a, b) => a.value > b.value);
  }
  for (const p of players) {
    const all = (club.players[p.name] ||= { name: p.name, pos: p.pos, seasons: 0, apps: 0, tries: 0, points: 0, metres: 0, tackles: 0 });
    all.seasons++;
    for (const k of ['apps', 'tries', 'points', 'metres', 'tackles']) all[k] += p[k];
  }
  if (season.league?.stage === 'champion' && season.europe?.stage === 'champion') club.trophies.push({ kind: 'double', comp: 'The Double', season: season.name, title: 'League and Champions Cup double' });
  club.seasons.push({
    number: season.number,
    name: season.name,
    league: season.league,
    europe: season.europe,
    won: season.won,
    drawn: season.drawn || 0,
    lost: season.lost,
    topScorer: top && top.tries ? { name: top.name, tries: top.tries } : null,
  });
  club.number++;
  club.current = emptySeason(club, club.number);
  if (club.nextField) club.cupField = club.nextField;
  club.nextField = null;
  return club;
}

// Gives every side the squad it had last season.
function keepSquads(t, club) {
  for (const side of t.teams) if (club.rosters[side.id]) side.roster = { ...club.rosters[side.id] };
  return t;
}

// What comes after a finished competition: the Champions Cup if the club is
// in it this season, otherwise next season's league. Returns the new
// tournament with the club attached.
export function continueClub(t, rng = Math.random) {
  const club = t.club || newClub(t);
  closeCompetition(club, t);
  const options = { userTeam: club.team, length: t.length, cards: t.cards, bench: !!t.bench, weather: !!t.weather, rng };
  let next;
  if (t.kind === 'league' && playsEurope(club)) {
    // Season one's Champions Cup is the real draw; after that, a fresh one.
    const pools = club.number === 1 ? CHAMPIONS_CUP.pools : drawPools(club.cupField, rng);
    next = createChampions({ ...options, pools });
  } else {
    finishSeason(club);
    next = createLeague({ ...options, league: club.league, season: club.seasonLength });
  }
  keepSquads(next, club);
  next.club = club;
  next.seasonName = club.current.name;
  return next;
}

// What the button after a finished competition says.
export function nextStep(t) {
  const club = t.club || newClub(t);
  if (t.kind === 'league' && playsEurope(club)) return { europe: true, label: `Play the ${seasonName(club.league, club.number)} Champions Cup` };
  return { europe: false, label: `Start the ${seasonName(club.league, club.number + 1)} season` };
}

// Can this finished competition roll on into a club career?
export const canContinue = t => t?.stage === 'done' && (t.kind === 'league' || !!t.club);

// The club's all-time leaders, from finished seasons.
export function clubLeaders(club, key, n = 3) {
  return Object.values(club.players).filter(p => p[key] > 0).sort((a, b) => b[key] - a[key] || a.name.localeCompare(b.name)).slice(0, n);
}

export const TROPHY_ORDER = ['double', 'europe', 'league', 'leaders'];
