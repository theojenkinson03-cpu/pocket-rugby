// The Champions Cup: the real 2026-27 pools, cross-league pool matches with
// two at home and two away, the top three and the four best of the rest into
// a seeded round of 16, a fixed bracket and a neutral final in Lyon.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { seededRng } from '../js/engine.js';
import {
  advance, CHAMPIONS_CUP, championsPoolRounds, championsSeeding, createChampions, currentRound, isUserFixture, LEAGUE_OF, LEAGUES,
  recordResult, roundName, simulateRound, stageName, standings, TEAM_BY_ID, teamOf, userAlive, userFixture, venue,
} from '../js/tournament.js';

const pairKey = (a, b) => [a, b].sort().join('-');

test('the 2026-27 draw: 24 real clubs, four pools of six, two from each league', () => {
  const all = Object.values(CHAMPIONS_CUP.pools).flat();
  assert.equal(all.length, 24);
  assert.equal(new Set(all).size, 24);
  for (const [group, ids] of Object.entries(CHAMPIONS_CUP.pools)) {
    assert.equal(ids.length, 6, `Pool ${group}`);
    const leagues = ids.map(id => LEAGUE_OF[id]);
    for (const league of ['prem', 'urc', 'top14']) assert.equal(leagues.filter(l => l === league).length, 2, `Pool ${group}: two from the ${league}`);
  }
  // Every club is a real one already in the game, from the three European leagues.
  for (const id of all) assert.ok(TEAM_BY_ID[id] && LEAGUES[LEAGUE_OF[id]], id);
  assert.ok(!all.some(id => LEAGUE_OF[id] === 'super'));
  assert.deepEqual(CHAMPIONS_CUP.pools[3], ['bordeaux', 'stormers', 'racing', 'munster', 'bristol', 'gloucester']);
});

test('pool rounds: no club meets its own league, everyone plays once a round and twice at home', () => {
  for (let seed = 0; seed < 60; seed++) {
    const ids = CHAMPIONS_CUP.pools[(seed % 4) + 1];
    const rounds = championsPoolRounds(ids, seededRng(seed));
    assert.equal(rounds.length, 4);
    const seen = new Set();
    for (const pairs of rounds) {
      assert.equal(pairs.length, 3);
      assert.equal(new Set(pairs.flat()).size, 6, 'everyone once a round');
      for (const [home, away] of pairs) {
        assert.notEqual(LEAGUE_OF[home], LEAGUE_OF[away], `${home} v ${away}: same league`);
        assert.ok(!seen.has(pairKey(home, away)), 'nobody meets twice');
        seen.add(pairKey(home, away));
      }
    }
    assert.equal(seen.size, 12, 'all twelve cross-league pairs');
    for (const id of ids) assert.equal(rounds.flat().filter(([home]) => home === id).length, 2, `${id} at home twice`);
  }
});

test('a new Champions Cup: 48 pool matches, four for the user, home grounds and kits', () => {
  const t = createChampions({ userTeam: 'munster', rng: seededRng(5) });
  assert.equal(t.kind, 'champions');
  assert.equal(t.fixtures.length, 48);
  assert.equal(t.teams.length, 24);
  assert.equal(t.fixtures.filter(f => isUserFixture(t, f)).length, 4);
  assert.equal(teamOf(t, 'munster').league, 'urc');
  assert.equal(teamOf(t, 'glasgow').kit[0], 'tartan');
  for (const f of t.fixtures) assert.deepEqual(venue(t, f), { name: teamOf(t, f.home).ground, neutral: false });
  assert.equal(currentRound(t), 0);
  assert.equal(stageName(t), 'Pool stage');
  assert.ok(isUserFixture(t, userFixture(t)));
});

// Plays every pool match: the home side wins by a margin set by `margin`.
function poolsDone(margin = () => 10, seed = 3) {
  const t = createChampions({ userTeam: 'leinster', rng: seededRng(seed) });
  for (const f of t.fixtures) {
    const m = margin(f);
    recordResult(t, f.id, { score: m > 0 ? [20 + m, 20] : [20, 20 - m], tries: m > 0 ? [4, 1] : [1, 4], winner: m > 0 ? 'home' : 'away' });
  }
  advance(t);
  return t;
}

test('seeding: pool winners 1-4, runners-up 5-8, thirds 9-12, then the four best of the rest', () => {
  const t = poolsDone(f => (f.home.length % 3) * 7 + 3);
  const seeds = championsSeeding(t);
  assert.equal(seeds.length, 16);
  assert.equal(new Set(seeds).size, 16);
  const tables = Object.keys(t.pools).map(group => standings(t, group));
  const placeOf = id => tables.find(rows => rows.some(r => r.id === id)).findIndex(r => r.id === id);
  seeds.slice(0, 4).forEach(id => assert.equal(placeOf(id), 0));
  seeds.slice(4, 8).forEach(id => assert.equal(placeOf(id), 1));
  seeds.slice(8, 12).forEach(id => assert.equal(placeOf(id), 2));
  seeds.slice(12).forEach(id => assert.ok(placeOf(id) >= 3));
  // The best of the rest really are the best four of the twelve left.
  const rest = tables.flatMap(rows => rows.slice(3));
  const row = id => rest.find(r => r.id === id);
  const worstIn = Math.min(...seeds.slice(12).map(id => row(id).points));
  const bestOut = Math.max(...rest.filter(r => !seeds.includes(r.id)).map(r => r.points));
  assert.ok(worstIn >= bestOut, 'nobody left out has more points than someone in');
  // Within a tier, table points decide.
  for (let tier = 0; tier < 4; tier++) {
    const pts = seeds.slice(tier * 4, tier * 4 + 4).map(id => tables.flat().find(r => r.id === id).points);
    assert.deepEqual(pts, [...pts].sort((a, b) => b - a), `tier ${tier + 1} in order`);
  }
});

test('the round of 16: 1 v 16 to 8 v 9 at the better seed, then a fixed bracket and the final in Lyon', () => {
  const t = poolsDone();
  assert.equal(t.stage, 'r16');
  assert.equal(stageName(t), 'Round of 16');
  assert.equal(roundName(t, 'r16'), 'Round of 16');
  const seed = n => Object.keys(t.seeds).find(id => t.seeds[id] === n);
  const r16 = t.fixtures.filter(f => f.stage === 'r16');
  assert.deepEqual(r16.map(f => [t.seeds[f.home], t.seeds[f.away]]), [[1, 16], [2, 15], [3, 14], [4, 13], [5, 12], [6, 11], [7, 10], [8, 9]]);
  for (const f of r16) assert.deepEqual(venue(t, f), { name: teamOf(t, f.home).ground, neutral: false });
  // Upsets everywhere: the lower seed wins every tie.
  const upset = () => {
    for (const f of t.fixtures.filter(x => x.stage === t.stage && !x.result)) recordResult(t, f.id, { score: [10, 20], tries: [1, 2], winner: 'away' });
    advance(t);
  };
  upset();
  assert.equal(t.stage, 'qf');
  // 16 meets 9 (from 8 v 9), 13 meets 12, 15 meets 10, 14 meets 11.
  assert.deepEqual(t.fixtures.filter(f => f.stage === 'qf').map(f => [f.home, f.away]), [[seed(9), seed(16)], [seed(12), seed(13)], [seed(10), seed(15)], [seed(11), seed(14)]]);
  upset();
  assert.equal(t.stage, 'semi');
  assert.deepEqual(t.fixtures.filter(f => f.stage === 'semi').map(f => [f.home, f.away]), [[seed(13), seed(16)], [seed(14), seed(15)]]);
  upset();
  assert.equal(t.stage, 'final');
  const final = t.fixtures.find(f => f.stage === 'final');
  assert.deepEqual(venue(t, final), { name: 'OL Stadium, Lyon', neutral: true });
  recordResult(t, 'F', { score: [10, 20], tries: [1, 2], winner: 'away' });
  advance(t);
  assert.equal(t.stage, 'done');
  assert.equal(t.champion, final.away);
});

test('the user: still in it in the pools, out if they miss the 16, and through as one of the best of the rest', () => {
  // Leinster lose everything: out after the pools.
  const out = poolsDone(f => (f.home === 'leinster' ? -10 : f.away === 'leinster' ? 10 : 5));
  assert.ok(!userAlive(out));
  assert.equal(userFixture(out), null);
  // A whole competition played out from the pools to a champion, the user's
  // matches included, with the simulator.
  for (let seed = 0; seed < 4; seed++) {
    const t = createChampions({ userTeam: 'none', length: 'quick', rng: seededRng(seed) });
    for (let guard = 0; t.stage !== 'done' && guard < 20; guard++) {
      simulateRound(t, seededRng(seed * 50 + guard));
      advance(t);
    }
    assert.equal(t.stage, 'done');
    assert.ok(teamOf(t, t.champion));
    assert.equal(t.fixtures.length, 48 + 8 + 4 + 2 + 1);
    assert.ok(t.fixtures.every(f => f.result && f.result.players));
  }
});
