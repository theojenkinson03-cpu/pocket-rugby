// Season stats: every player's numbers collected from every fixture, the
// user's and the simulated ones, the leaders and the Team of the Season.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { POSITIONS } from '../js/dice.js';
import { emptyPlayer, seededRng } from '../js/engine.js';
import { rating } from '../js/players.js';
import { advance, createLeague, simulateRound, teamOf } from '../js/tournament.js';
import { leaders, LEADER_STATS, packPlayers, playerOfTheSeason, seasonPlayers, STAT_KEYS, teamOfTheSeason, totalPoints, unpackPlayer } from '../js/season.js';

const line = (patch = {}) => Object.fromEntries(POSITIONS.map(p => [p, { ...emptyPlayer(), ...patch[p] }]));

test('player numbers pack small and come back the same', () => {
  const players = line({ S: { carries: 4, metres: 31, passes: 7 }, B: { points: 8, tackles: 2 } });
  const packed = packPlayers(players);
  assert.deepEqual(Object.keys(packed), POSITIONS);
  for (const pos of POSITIONS) {
    assert.equal(packed[pos].length, STAT_KEYS.length);
    assert.deepEqual(unpackPlayer(packed[pos]), players[pos]);
  }
  assert.deepEqual(unpackPlayer(undefined), emptyPlayer(), 'a missing row is an empty one');
  assert.equal(totalPoints({ tries: 2, points: 7 }), 17);
});

// A tiny competition with hand-made results.
function hand() {
  const t = createLeague({ league: 'prem', userTeam: 'bath', rng: seededRng(2) });
  t.fixtures = [];
  const result = (home, away, homeLine, awayLine, potm = null) => t.fixtures.push({ id: `${home}${away}`, stage: 'league', round: 0, group: 'L', home, away, result: { score: [20, 10], tries: [2, 1], winner: 'home', players: [packPlayers(line(homeLine)), packPlayers(line(awayLine))], potm } });
  result('bath', 'sale', { W: { tries: 2, metres: 40, carries: 5 } }, { F: { tackles: 7 } }, { side: 0, pos: 'W' });
  result('sale', 'bath', { B: { points: 9, tries: 1 } }, { W: { tries: 1, metres: 12 }, F: { tackles: 3 } }, { side: 0, pos: 'B' });
  result('exeter', 'gloucester', { C: { turnovers: 2 } }, { W: { tries: 3, lineBreaks: 3, metres: 70 } }, { side: 1, pos: 'W' });
  // A fixture from before season stats: counted in the table, not here.
  t.fixtures.push({ id: 'old', stage: 'league', round: 0, group: 'L', home: 'bath', away: 'exeter', result: { score: [10, 3], tries: [1, 0], winner: 'home' } });
  t.fixtures.push({ id: 'open', stage: 'league', round: 1, group: 'L', home: 'bath', away: 'gloucester', result: null });
  return t;
}

test('season totals add up across fixtures, home and away, with appearances and awards', () => {
  const t = hand();
  const players = seasonPlayers(t);
  const get = key => players.find(p => p.key === key);
  const bathW = get('bath:W');
  assert.equal(bathW.apps, 2);
  assert.equal(bathW.tries, 3);
  assert.equal(bathW.metres, 52);
  assert.equal(bathW.potm, 1);
  assert.equal(bathW.name, teamOf(t, 'bath').roster.W, 'named from the squad');
  assert.equal(get('sale:F').tackles, 7);
  assert.equal(get('sale:B').points, 9);
  assert.equal(get('sale:B').potm, 1);
  assert.equal(get('gloucester:W').apps, 1);
  assert.equal(players.length, 4 * 5, 'four clubs have played, five players each');
  const sum = key => players.reduce((n, p) => n + p[key], 0);
  assert.equal(sum('tries'), 7);
  assert.equal(sum('apps'), 6 * 5);
  // Ratings are the sum of match ratings.
  assert.ok(Math.abs(bathW.rating - (rating({ ...emptyPlayer(), tries: 2, metres: 40, carries: 5 }) + rating({ ...emptyPlayer(), tries: 1, metres: 12 }))) < 1e-9);
});

test('leaders: highest first, fewer appearances first on a tie, nobody on zero', () => {
  const players = seasonPlayers(hand());
  const tries = leaders(players, 'tries');
  assert.deepEqual(tries.map(p => [p.key, p.value]), [['gloucester:W', 3], ['bath:W', 3], ['sale:B', 1]], 'three in one match beats three in two');
  assert.deepEqual(leaders(players, 'points').map(p => [p.key, p.value]), [['gloucester:W', 15], ['bath:W', 15], ['sale:B', 14]], 'tries and kicks');
  assert.deepEqual(leaders(players, 'metres', 2).map(p => p.value), [70, 52]);
  assert.deepEqual(leaders(players, 'tackles').map(p => [p.key, p.value]), [['sale:F', 7], ['bath:F', 3]]);
  assert.equal(leaders(players, 'turnovers')[0].key, 'exeter:C');
  assert.equal(leaders(players, 'lineBreaks').length, 1);
  for (const [id] of LEADER_STATS) assert.ok(leaders(players, id).length <= 5, id);
});

test('Team of the Season: one per position, the best average rating among regulars', () => {
  const t = hand();
  const players = seasonPlayers(t);
  const team = teamOfTheSeason(players);
  assert.deepEqual(Object.keys(team).sort(), [...POSITIONS].sort());
  // Gloucester's Outside Back has one appearance to Bath's two: half the
  // most at the position, which is enough.
  assert.equal(team.W.key, 'gloucester:W', '3 tries and 70 m in one match, the best average');
  assert.equal(team.F.key, 'sale:F');
  const best = playerOfTheSeason(players);
  assert.ok(Object.values(team).includes(best));
  assert.equal(best.key, 'gloucester:W');
  // Someone with a single great match among regulars with many is left out.
  const regulars = [
    { key: 'a:S', pos: 'S', apps: 6, rating: 60, name: 'A' },
    { key: 'b:S', pos: 'S', apps: 2, rating: 40, name: 'B' },
    { key: 'c:S', pos: 'S', apps: 3, rating: 33, name: 'C' },
  ];
  assert.equal(teamOfTheSeason(regulars).S.key, 'c:S', 'B has too few appearances; C averages 11 to A\'s 10');
  assert.equal(playerOfTheSeason([]), null);
});

test('a played-out season: every match counted, numbers that match the scores', () => {
  const t = createLeague({ league: 'urc', userTeam: 'munster', length: 'quick', rng: seededRng(7) });
  // Play the user's matches out too, as if simulated.
  t.userTeam = 'nobody';
  for (let guard = 0; t.stage === 'league' && guard < 20; guard++) {
    simulateRound(t, seededRng(guard + 1));
    advance(t);
  }
  const played = t.fixtures.filter(f => f.result && f.stage === 'league');
  assert.ok(played.length >= 6 * 8);
  for (const f of played) {
    assert.ok(f.result.players && f.result.potm, f.id);
    f.result.players.forEach((side, i) => {
      const tries = POSITIONS.reduce((n, pos) => n + unpackPlayer(side[pos]).tries, 0);
      assert.equal(tries, f.result.tries[i], `${f.id}: tries add up`);
      const points = POSITIONS.reduce((n, pos) => n + totalPoints(unpackPlayer(side[pos])), 0);
      assert.equal(points, f.result.score[i], `${f.id}: points add up`);
    });
  }
  const players = seasonPlayers(t);
  assert.equal(players.length, 16 * 5, 'all sixteen teams');
  const team = teamOfTheSeason(players);
  assert.equal(Object.keys(team).length, 5);
  const top = leaders(players, 'tries')[0];
  assert.ok(top.value >= 3, `the top try scorer has ${top.value}`);
  // Played-out matches and the table agree.
  assert.equal(players.reduce((n, p) => n + p.tries, 0), played.reduce((n, f) => n + f.result.tries[0] + f.result.tries[1], 0));
});
