// Club career: seasons that roll on with the same squads, the Champions Cup
// for clubs in it and qualification from the table, the records book, the
// trophy cabinet and the season-by-season history.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { seededRng } from '../js/engine.js';
import {
  advance, CHAMPIONS_CUP, createLeague, LEAGUE_OF, recordResult, simulateFixture, simulateRound, standings, teamOf, userFixture,
} from '../js/tournament.js';
import { canContinue, closeCompetition, clubLeaders, continueClub, drawPools, EUROPE_PLACES, finishSeason, newClub, nextStep, outcomeOf, playsEurope, seasonName } from '../js/club.js';

// Plays a competition to the end, the user's matches included.
function playOut(t, rng, userWins = null) {
  for (let guard = 0; t.stage !== 'done' && guard < 80; guard++) {
    const f = userFixture(t);
    if (f) {
      const r = simulateFixture(t, f, rng);
      if (userWins !== null) {
        // Make the user's result go their way (or not), keeping the numbers.
        const userHome = f.home === t.userTeam;
        const want = userWins ? (userHome ? 'home' : 'away') : (userHome ? 'away' : 'home');
        if (r.winner !== want) {
          // The players keep their sides: only the score turns round.
          r.score.reverse();
          r.tries.reverse();
          r.winner = want;
        }
      }
      recordResult(t, f.id, r);
    }
    simulateRound(t, rng);
    advance(t);
  }
  return t;
}

test('season names: two years for the European leagues, one for Super Rugby', () => {
  assert.equal(seasonName('prem', 1), '2026–27');
  assert.equal(seasonName('urc', 4), '2029–30');
  assert.equal(seasonName('top14', 74), '2099–00');
  assert.equal(seasonName('super', 2), '2027');
});

test('a finished league season can roll on; a standalone cup cannot', () => {
  const rng = seededRng(1);
  const t = createLeague({ league: 'super', userTeam: 'chiefs', rng });
  assert.ok(!canContinue(t), 'not before it ends');
  playOut(t, rng);
  assert.ok(canContinue(t));
  assert.deepEqual(nextStep(t), { europe: false, label: 'Start the 2027 season' }, 'no Europe for Super Rugby');
  assert.ok(!canContinue(null));
});

test('the next season: same league, same squads for everyone, the club and its records carried', () => {
  const rng = seededRng(2);
  const t = playOut(createLeague({ league: 'super', userTeam: 'blues', season: 'short', length: 'quick', cards: false, rng }), rng);
  teamOf(t, 'blues').roster.S = 'Z. Custom';
  // The club's own team sheet goes into next season with it.
  const sheet = { start: { F: teamOf(t, 'blues').squad.filter(x => x.pos === 'F')[2].name }, bench: [teamOf(t, 'blues').squad.find(x => x.pos === 'S').name] };
  t.picks = { blues: sheet };
  const next = continueClub(t, rng);
  assert.deepEqual(next.picks.blues, sheet);
  for (const side of t.teams) assert.deepEqual(teamOf(next, side.id).squad.map(x => x.name).sort(), side.squad.map(x => x.name).filter(n => n !== teamOf(t, 'blues').squad.find(x => x.pos === 'S').name || side.id !== 'blues').concat(side.id === 'blues' ? ['Z. Custom'] : []).sort(), `${side.id} keep their squad`);
  assert.equal(next.kind, 'league');
  assert.equal(next.league, 'super');
  assert.equal(next.userTeam, 'blues');
  assert.equal(next.season, 'short');
  assert.equal(next.length, 'quick');
  assert.equal(next.cards, false);
  assert.equal(next.seasonName, '2027');
  assert.equal(next.stage, 'league');
  assert.ok(next.fixtures.every(f => !f.result));
  for (const side of t.teams) assert.deepEqual(teamOf(next, side.id).roster, side.roster, `${side.id} keep their squad`);
  assert.equal(teamOf(next, 'blues').roster.S, 'Z. Custom');
  const club = next.club;
  assert.equal(club.number, 2);
  assert.equal(club.seasons.length, 1);
  const first = club.seasons[0];
  assert.equal(first.name, '2026');
  const place = standings(t, 'L').findIndex(r => r.id === 'blues') + 1;
  assert.deepEqual([first.league.place, first.league.of, first.league.outcome], [place, 11, outcomeOf(t, 'blues').text]);
  const played = t.fixtures.filter(f => f.result && (f.home === 'blues' || f.away === 'blues'));
  assert.equal(first.won + first.lost, played.length);
  assert.ok(club.records.mostPoints && club.records.bestFinish);
  // Closing the same competition twice changes nothing.
  const before = JSON.stringify(club);
  closeCompetition(club, t);
  assert.equal(JSON.stringify(club), before);
});

test('a club in the Champions Cup plays it after the league, with the real draw in season one', () => {
  const rng = seededRng(3);
  const t = playOut(createLeague({ league: 'urc', userTeam: 'munster', rng }), rng);
  assert.deepEqual(nextStep(t), { europe: true, label: 'Play the 2026–27 Champions Cup' });
  const cup = continueClub(t, rng);
  assert.equal(cup.kind, 'champions');
  assert.equal(cup.seasonName, '2026–27');
  assert.deepEqual(cup.pools, Object.fromEntries(Object.entries(CHAMPIONS_CUP.pools).map(([g, ids]) => [g, ids])));
  assert.equal(cup.club.number, 1, 'still season one');
  assert.equal(cup.club.seasons.length, 0);
  // URC clubs keep their league squads in Europe.
  for (const side of t.teams) if (teamOf(cup, side.id)) assert.deepEqual(teamOf(cup, side.id).roster, side.roster);
  playOut(cup, rng);
  assert.ok(canContinue(cup));
  assert.equal(nextStep(cup).label, 'Start the 2027–28 season');
  const next = continueClub(cup, rng);
  assert.equal(next.kind, 'league');
  const season = next.club.seasons[0];
  assert.ok(season.league && season.europe, 'one season, both competitions');
  assert.equal(season.europe.comp, 'Champions Cup');
  assert.equal(season.won + season.lost, [...t.fixtures, ...cup.fixtures].filter(f => f.result && (f.home === 'munster' || f.away === 'munster')).length);
});

test('qualification: the top eight of the table go into next season\'s Champions Cup', () => {
  const rng = seededRng(4);
  // Bath lose everything: bottom of the Prem, so no Europe next season.
  const t = playOut(createLeague({ league: 'prem', userTeam: 'bath', rng }), rng, false);
  const table = standings(t, 'L').map(r => r.id);
  assert.ok(table.indexOf('bath') >= EUROPE_PLACES, 'bottom half');
  const cup = continueClub(t, rng);
  assert.equal(cup.kind, 'champions', 'Bath were in the 2026-27 draw, so they play it');
  playOut(cup, rng, false);
  const next = continueClub(cup, rng);
  const club = next.club;
  assert.equal(EUROPE_PLACES, 8, 'eight from each league');
  assert.deepEqual(club.cupField.prem, table.slice(0, 8));
  assert.ok(!playsEurope(club));
  assert.equal(club.cupField.urc.length, 8);
  // A season with no Europe goes straight to the next one.
  playOut(next, rng, true);
  assert.equal(nextStep(next).europe, false);
  const third = continueClub(next, rng);
  assert.equal(third.kind, 'league');
  assert.equal(third.club.number, 3);
  assert.ok(playsEurope(third.club), 'won everything, so in Europe again');
});

test('a drawn Champions Cup: four pools, two clubs from each league in each', () => {
  for (let seed = 0; seed < 20; seed++) {
    const field = {
      prem: ['bath', 'bristol', 'exeter', 'gloucester', 'harlequins', 'leicester', 'newcastle', 'northampton'],
      urc: ['leinster', 'glasgow', 'munster', 'connacht', 'ulster', 'cardiff', 'bulls', 'lions'],
      top14: ['toulouse', 'bordeaux', 'toulon', 'larochelle', 'clermont', 'racing', 'pau', 'castres'],
    };
    const pools = drawPools(field, seededRng(seed));
    assert.deepEqual(Object.keys(pools), ['1', '2', '3', '4']);
    const all = Object.values(pools).flat();
    assert.equal(new Set(all).size, 24);
    for (const ids of Object.values(pools)) {
      for (const league of ['prem', 'urc', 'top14']) assert.equal(ids.filter(id => LEAGUE_OF[id] === league).length, 2);
    }
  }
});

test('records, trophies and the history across seasons', () => {
  const rng = seededRng(5);
  // Super Rugby, winning every match: a title a season.
  let t = createLeague({ league: 'super', userTeam: 'reds', rng });
  for (let n = 0; n < 3; n++) {
    playOut(t, rng, true);
    assert.equal(t.champion, 'reds');
    t = continueClub(t, rng);
  }
  const club = t.club;
  assert.equal(club.seasons.length, 3);
  const titles = club.trophies.filter(x => x.kind === 'league');
  assert.deepEqual(titles.map(x => x.season), ['2026', '2027', '2028']);
  assert.ok(club.trophies.some(x => x.kind === 'leaders'), 'topped the table too');
  assert.equal(club.records.bestFinish.stage, 'champion');
  const wins = club.seasons.reduce((n, s) => n + s.won, 0);
  assert.equal(club.records.bestRun.wins, wins, 'never lost: one long run');
  assert.ok(!club.records.heaviestDefeat);
  assert.ok(club.records.biggestWin.margin > 0);
  assert.ok(club.records.seasonTries.value >= club.seasons[0].topScorer.tries);
  // All-time leaders add up over the seasons.
  const leaders = clubLeaders(club, 'apps');
  assert.equal(leaders[0].apps, wins, 'played every match');
  assert.equal(leaders[0].seasons, 3);
  assert.ok(clubLeaders(club, 'tries').length >= 1);
});

test('the double: league and Champions Cup in one season', () => {
  const club = newClub({ userTeam: 'leinster', league: 'urc', season: 'short' });
  club.current.league = { comp: 'URC', place: 1, of: 16, outcome: 'Champions', stage: 'champion' };
  club.current.europe = { comp: 'Champions Cup', outcome: 'Winners', stage: 'champion' };
  finishSeason(club);
  assert.ok(club.trophies.some(x => x.kind === 'double' && x.season === '2026–27'));
  assert.equal(club.number, 2);
  assert.equal(club.current.name, '2027–28');
});

test('how far a side got, in words', () => {
  const rng = seededRng(6);
  const t = playOut(createLeague({ league: 'top14', userTeam: 'toulouse', rng }), rng);
  const words = new Set(t.teams.map(x => outcomeOf(t, x.id).text));
  assert.ok(words.has('Champions'));
  assert.ok(words.has('Runners-up'));
  assert.ok(words.has('Semi-finals'));
  assert.ok(words.has('Barrages'));
  assert.ok(words.has('Missed the play-offs'));
});

test('the winning run: the longest unbroken run of wins, reset by a defeat', () => {
  const t = createLeague({ league: 'prem', userTeam: 'bath', rng: seededRng(8) });
  const others = ['sale', 'exeter', 'bristol', 'gloucester', 'harlequins', 'leicester'];
  // Won, won, lost, won, won, won: the record is three in a row, not five.
  const wins = [true, true, false, true, true, true];
  t.fixtures = others.map((id, i) => ({ id: `X${i}`, stage: 'league', round: i, group: 'L', home: 'bath', away: id, result: { score: wins[i] ? [20, 10] : [10, 20], tries: [2, 1], winner: wins[i] ? 'home' : 'away' } }));
  const club = newClub(t);
  closeCompetition(club, t);
  assert.equal(club.records.bestRun.wins, 3);
  assert.equal(club.run, 3, 'the current run carries into next season');
  assert.equal(club.current.won, 5);
  assert.equal(club.current.lost, 1);
  assert.equal(club.records.heaviestDefeat.score, '10–20');
});
