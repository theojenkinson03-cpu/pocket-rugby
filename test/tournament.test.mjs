// Tournaments: fixtures, the table and its bonus points, the knockouts, and
// whole competitions played out to a champion.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { act, MATCH_LENGTHS, newMatch, seededRng } from '../js/engine.js';
import { cpuChoice } from '../js/ai.js';
import {
  advance, clash, CLUBS, createCup, createLeague, currentRound, isUserFixture, kits, matchOptions, NATIONS, POINTS,
  recordResult, resultFromMatch, roundRobin, simulateFixture, simulateRound, standings, teamOf, userAlive, userFixture, userRecord,
} from '../js/tournament.js';

const pairKey = (a, b) => [a, b].sort().join('-');

test('round robin: every pair meets once and nobody plays twice in a round', () => {
  for (const n of [2, 3, 4, 5, 8]) {
    const ids = Array.from({ length: n }, (_, i) => `t${i}`);
    const rounds = roundRobin(ids);
    const seen = new Set();
    for (const pairs of rounds) {
      const playing = pairs.flat();
      assert.equal(new Set(playing).size, playing.length, `n=${n}: nobody twice in a round`);
      for (const [a, b] of pairs) {
        assert.notEqual(a, b);
        assert.ok(!seen.has(pairKey(a, b)), `n=${n}: ${a} v ${b} twice`);
        seen.add(pairKey(a, b));
      }
    }
    assert.equal(seen.size, (n * (n - 1)) / 2, `n=${n}: every pair`);
    // Home and away are shared out fairly.
    const games = n - 1;
    for (const id of ids) {
      const home = rounds.flat().filter(([h]) => h === id).length;
      assert.ok(home === Math.floor(games / 2) || home === Math.ceil(games / 2), `n=${n}: ${id} at home ${home} of ${games}`);
    }
  }
});

test('the Nations Cup: eight nations in two pools of four, the user in one of them', () => {
  for (let seed = 0; seed < 40; seed++) {
    const user = NATIONS[seed % NATIONS.length].id;
    const t = createCup({ userTeam: user, rng: seededRng(seed) });
    assert.equal(t.teams.length, 8);
    assert.equal(new Set(t.teams.map(x => x.id)).size, 8);
    assert.ok(t.teams.some(x => x.id === user));
    assert.deepEqual(Object.keys(t.pools), ['A', 'B']);
    assert.equal(t.pools.A.length + t.pools.B.length, 8);
    assert.equal(t.fixtures.length, 12, 'six matches a pool');
    assert.ok(t.fixtures.every(f => f.stage === 'pool' && t.pools[f.group].includes(f.home) && t.pools[f.group].includes(f.away)));
    assert.equal(t.fixtures.filter(f => isUserFixture(t, f)).length, 3);
    // Every side has a roster of five different names.
    for (const team of t.teams) assert.equal(new Set(Object.values(team.roster)).size, 5);
    assert.equal(currentRound(t), 0);
    assert.ok(isUserFixture(t, userFixture(t)));
  }
});

test('the League: all eight clubs, 28 fixtures over 7 rounds', () => {
  const t = createLeague({ userTeam: 'foxes', rng: seededRng(3) });
  assert.equal(t.teams.length, CLUBS.length);
  assert.equal(t.fixtures.length, 28);
  assert.equal(new Set(t.fixtures.map(f => f.round)).size, 7);
  assert.equal(t.fixtures.filter(f => isUserFixture(t, f)).length, 7);
  for (let r = 0; r < 7; r++) assert.equal(t.fixtures.filter(f => f.round === r).length, 4);
});

// A small hand-made pool to check the table exactly.
function pool(results) {
  const t = createCup({ userTeam: 'nzl', rng: seededRng(1) });
  const ids = t.pools.A;
  t.fixtures = results.map(([h, a, score, tries], i) => ({ id: `x${i}`, stage: 'pool', round: 0, group: 'A', home: ids[h], away: ids[a], result: { score, tries, winner: score[0] > score[1] ? 'home' : 'away' } }));
  return { t, ids };
}

test('table points: 4 for a win, a bonus for 4 tries, a bonus for losing by 7 or fewer', () => {
  assert.deepEqual(POINTS, { win: 4, tryBonus: 1, losingBonus: 1, tryBonusAt: 4, losingBonusWithin: 7 });
  const { t, ids } = pool([
    [0, 1, [30, 25], [4, 4]], // home win with try bonus; away lose by 5 with tries: 1 + 1
    [2, 3, [30, 22], [2, 3]], // lose by 8: nothing
    [0, 2, [12, 30], [1, 5]], // away win with try bonus; home lose by 18: nothing
  ]);
  const rows = Object.fromEntries(standings(t, 'A').map(r => [r.id, r]));
  assert.deepEqual([rows[ids[0]].points, rows[ids[0]].bonus, rows[ids[0]].won, rows[ids[0]].lost], [5, 1, 1, 1]);
  assert.deepEqual([rows[ids[1]].points, rows[ids[1]].bonus], [2, 2], 'losing bonus and try bonus');
  assert.deepEqual([rows[ids[2]].points, rows[ids[2]].played], [9, 2]);
  assert.deepEqual([rows[ids[3]].points, rows[ids[3]].for, rows[ids[3]].against], [0, 22, 30]);
  // Lose by exactly 7: the bonus; by 8: none.
  const edge = pool([[0, 1, [27, 20], [0, 0]], [2, 3, [28, 20], [0, 0]]]);
  const e = Object.fromEntries(standings(edge.t, 'A').map(r => [r.id, r.points]));
  assert.equal(e[edge.ids[1]], 1);
  assert.equal(e[edge.ids[3]], 0);
});

test('table order: points, then points difference, then tries', () => {
  const { t, ids } = pool([
    [0, 1, [30, 0], [0, 0]],
    [2, 3, [30, 25], [0, 0]],
  ]);
  const order = standings(t, 'A').map(r => r.id);
  assert.deepEqual(order.slice(0, 2), [ids[0], ids[2]], 'same points: bigger difference first');
  const tied = pool([[0, 1, [30, 20], [2, 0]], [2, 3, [30, 20], [3, 0]]]);
  assert.equal(standings(tied.t, 'A')[0].id, tied.ids[2], 'same points and difference: more tries first');
});

test('knockouts: pool winners meet the other pool\'s runners-up, then a final, then a champion', () => {
  const t = createCup({ userTeam: 'eng', rng: seededRng(9) });
  // Home side always wins: the pool tables are fixed by the fixture list.
  for (const f of t.fixtures) recordResult(t, f.id, { score: [30, 10], tries: [4, 1], winner: 'home' });
  assert.equal(currentRound(t), null);
  advance(t);
  assert.equal(t.stage, 'semi');
  const [a, b] = [standings(t, 'A'), standings(t, 'B')];
  const semis = t.fixtures.filter(f => f.stage === 'semi');
  assert.deepEqual(semis.map(f => [f.home, f.away]), [[a[0].id, b[1].id], [b[0].id, a[1].id]]);
  // Nothing moves on until every semi is played.
  recordResult(t, 'SF1', { score: [10, 30], tries: [1, 4], winner: 'away' });
  advance(t);
  assert.equal(t.stage, 'semi');
  recordResult(t, 'SF2', { score: [30, 3], tries: [4, 0], winner: 'home' });
  advance(t);
  assert.equal(t.stage, 'final');
  const final = t.fixtures.find(f => f.stage === 'final');
  assert.deepEqual([final.home, final.away], [b[1].id, b[0].id]);
  recordResult(t, 'F', { score: [30, 29], tries: [3, 3], winner: 'away' });
  advance(t);
  assert.equal(t.stage, 'done');
  assert.equal(t.champion, b[0].id);
  assert.throws(() => recordResult(t, 'F', { score: [1, 0], tries: [0, 0], winner: 'home' }), /not open/);
});

test('League play-offs: first v fourth and second v third', () => {
  const t = createLeague({ userTeam: 'ravens', rng: seededRng(4) });
  for (const f of t.fixtures) recordResult(t, f.id, { score: [30, 10], tries: [4, 1], winner: 'home' });
  advance(t);
  const table = standings(t, 'L');
  const semis = t.fixtures.filter(f => f.stage === 'semi');
  assert.deepEqual(semis.map(f => [f.home, f.away]), [[table[0].id, table[3].id], [table[1].id, table[2].id]]);
});

test('kits never clash, and the user always plays as team 0 against the right CPU', () => {
  assert.ok(clash('#1d3577', '#1d3577'));
  assert.ok(!clash('#1d3577', '#e8701c'));
  const t = createCup({ userTeam: 'fra', rng: seededRng(2) });
  for (const f of t.fixtures) {
    const [home, away] = kits(t, f);
    assert.ok(!clash(home.color, away.color) || clash(teamOf(t, f.away).color, teamOf(t, f.away).alt), `${f.home} v ${f.away}`);
    if (!isUserFixture(t, f)) continue;
    const opts = matchOptions(t, f);
    assert.equal(opts.teams[0].name, teamOf(t, 'fra').name);
    const them = teamOf(t, f.home === 'fra' ? f.away : f.home);
    assert.equal(opts.teams[1].name, them.name);
    assert.equal(opts.cpuLevel, them.level);
    assert.equal(opts.cpuPersonality, them.personality);
    assert.ok(!clash(opts.teams[0].color, opts.teams[1].color), 'colours tell apart');
    assert.deepEqual(opts.teams[0].roster, teamOf(t, 'fra').roster);
  }
  // Every nation against every other: always two kits that tell apart.
  for (const x of NATIONS) {
    for (const y of NATIONS) {
      if (x.id === y.id) continue;
      const cup = { teams: [x, y], userTeam: x.id, length: 'quick', cards: true };
      const opts = matchOptions(cup, { home: y.id, away: x.id });
      assert.ok(!clash(opts.teams[0].color, opts.teams[1].color), `${x.id} v ${y.id}`);
    }
  }
});

test('a match result is recorded from the right side', () => {
  const m = newMatch({ mode: '1p' });
  m.teams[0].score = 30;
  m.teams[1].score = 12;
  m.teams[0].stats.tries = 5;
  m.teams[1].stats.tries = 2;
  m.winner = 0;
  const f = { home: 'a', away: 'b' };
  assert.deepEqual(resultFromMatch(f, m, true), { score: [30, 12], tries: [5, 2], winner: 'home' });
  assert.deepEqual(resultFromMatch(f, m, false), { score: [12, 30], tries: [2, 5], winner: 'away' });
});

test('simulated fixtures are real matches: a winner on the target, tries that add up', () => {
  const t = createCup({ userTeam: 'jpn', length: 'quick', rng: seededRng(5) });
  for (const f of t.fixtures.slice(0, 8)) {
    const r = simulateFixture(t, f, seededRng(f.id.length + 11));
    const w = r.winner === 'home' ? 0 : 1;
    assert.ok(r.score[w] >= MATCH_LENGTHS.quick.full && r.score[1 - w] < MATCH_LENGTHS.quick.full);
    assert.ok(r.tries.every(n => n >= 0 && n * 5 <= 60));
  }
});

// Plays the user's fixtures too, as a CPU, through the same path the app uses.
function playUser(t, rng) {
  const f = userFixture(t);
  let m = newMatch(matchOptions(t, f));
  while (m.step.type !== 'fulltime') {
    const s = m.step;
    const a = s.type === 'roll' ? { type: 'roll' } : s.type === 'halftime' ? { type: 'continue' } : { type: 'choose', value: cpuChoice({ ...m, cpuLevel: 'pro' }, rng) };
    m = act(m, a, rng).state;
  }
  recordResult(t, f.id, resultFromMatch(f, m, f.home === t.userTeam));
  return m.winner === 0;
}

test('whole tournaments play out to one champion, the user alive exactly while they have a match', () => {
  for (let seed = 0; seed < 12; seed++) {
    const rng = seededRng(100 + seed);
    const make = seed % 2 ? createLeague : createCup;
    const roster = seed % 2 ? CLUBS : NATIONS;
    const t = make({ userTeam: roster[seed % roster.length].id, length: 'quick', rng });
    let won = 0;
    let lost = 0;
    for (let guard = 0; t.stage !== 'done' && guard < 40; guard++) {
      if (userFixture(t)) {
        assert.ok(userAlive(t));
        if (playUser(t, rng)) won++;
        else lost++;
      } else {
        assert.ok(!userAlive(t) || t.stage === 'pool' || t.stage === 'league', 'no fixture means knocked out');
      }
      simulateRound(t);
      advance(t);
    }
    assert.equal(t.stage, 'done');
    assert.ok(t.teams.some(x => x.id === t.champion));
    assert.deepEqual(userRecord(t), { won, lost });
    assert.equal(userAlive(t), t.champion === t.userTeam);
    // Every fixture has a result, and the knockouts have the right shape.
    assert.ok(t.fixtures.every(f => f.result));
    assert.equal(t.fixtures.filter(f => f.stage === 'semi').length, 2);
    assert.equal(t.fixtures.filter(f => f.stage === 'final').length, 1);
    // Tournaments survive being saved and loaded.
    assert.deepEqual(JSON.parse(JSON.stringify(t)), t);
  }
});
