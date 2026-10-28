// Tournaments: fixtures, the table and its bonus points, the knockouts, and
// whole competitions played out to a champion.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { act, MATCH_LENGTHS, newMatch, seededRng } from '../js/engine.js';
import { cpuChoice } from '../js/ai.js';
import {
  advance, clash, createCup, createLeague, currentRound, isUserFixture, kits, LEAGUES, matchOptions, NATIONS, POINTS, QUALIFY,
  recordResult, resultFromMatch, roundName, roundRobin, SHORT_SEASON, simulateFixture, simulateRound, stageName, standings, teamOf,
  userAlive, userFixture, userRecord,
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

// The real line-ups: Super Rugby Pacific 2026, and the 2026-27 Prem, URC and Top 14.
const LINE_UPS = {
  super: ['Blues', 'Chiefs', 'Crusaders', 'Highlanders', 'Hurricanes', 'Brumbies', 'Queensland Reds', 'NSW Waratahs', 'Western Force', 'Fijian Drua', 'Moana Pasifika'],
  prem: ['Bath', 'Bristol Bears', 'Exeter Chiefs', 'Gloucester', 'Harlequins', 'Leicester Tigers', 'Newcastle Red Bulls', 'Northampton Saints', 'Sale Sharks', 'Saracens'],
  urc: ['Leinster', 'Munster', 'Ulster', 'Connacht', 'Cardiff', 'Dragons', 'Ospreys', 'Scarlets', 'Glasgow Warriors', 'Edinburgh', 'Benetton', 'Zebre Parma', 'Bulls', 'Lions', 'Sharks', 'Stormers'],
  top14: ['Toulouse', 'Bordeaux Bègles', 'Toulon', 'La Rochelle', 'Clermont', 'Racing 92', 'Stade Français', 'Castres', 'Montpellier', 'Pau', 'Bayonne', 'Lyon', 'Perpignan', 'Vannes'],
};
const FORMATS = { super: 'super6', prem: 'top4', urc: 'top8', top14: 'top6' };

test('four real leagues with their real teams and play-off formats', () => {
  assert.deepEqual(Object.keys(LEAGUES), ['super', 'prem', 'urc', 'top14']);
  for (const [id, names] of Object.entries(LINE_UPS)) {
    const L = LEAGUES[id];
    assert.deepEqual(L.teams.map(x => x.name), names, id);
    assert.equal(L.playoff, FORMATS[id]);
    assert.equal(new Set(L.teams.map(x => x.id)).size, names.length, `${id}: unique ids`);
    assert.equal(new Set(L.teams.map(x => x.short)).size, names.length, `${id}: unique short names`);
    for (const team of L.teams) {
      assert.match(team.color, /^#[0-9a-f]{6}$/);
      assert.match(team.alt, /^#[0-9a-f]{6}$/);
      assert.ok(['rookie', 'pro', 'expert'].includes(team.level) && ['balanced', 'boot', 'run', 'pack'].includes(team.personality), team.id);
    }
  }
  // Ids never repeat across competitions, so saved tournaments can't mix them up.
  const all = [...Object.values(LEAGUES).flatMap(L => L.teams.map(x => x.id)), ...NATIONS.map(n => n.id)];
  assert.equal(new Set(all).size, all.length);
});

test('league seasons: short is six rounds, full is everyone once, with a bye each round for an odd number of teams', () => {
  for (const [id, L] of Object.entries(LEAGUES)) {
    const n = L.teams.length;
    for (const season of ['short', 'full']) {
      const t = createLeague({ league: id, userTeam: L.teams[0].id, season, rng: seededRng(n) });
      const rounds = season === 'full' ? (n % 2 ? n : n - 1) : SHORT_SEASON;
      assert.equal(t.rounds, rounds, `${id} ${season}`);
      assert.equal(new Set(t.fixtures.map(f => f.round)).size, rounds);
      assert.equal(t.fixtures.length, rounds * Math.floor(n / 2), `${id} ${season}: every round full`);
      for (let r = 0; r < rounds; r++) {
        const playing = t.fixtures.filter(f => f.round === r).flatMap(f => [f.home, f.away]);
        assert.equal(new Set(playing).size, playing.length, `${id} round ${r}: nobody twice`);
        assert.equal(playing.length, n - (n % 2), `${id} round ${r}: ${n % 2 ? 'one bye' : 'no byes'}`);
      }
      const pairs = new Set(t.fixtures.map(f => pairKey(f.home, f.away)));
      assert.equal(pairs.size, t.fixtures.length, `${id} ${season}: no repeat fixtures`);
      if (season === 'full') assert.equal(pairs.size, (n * (n - 1)) / 2, `${id}: everyone meets once`);
      assert.equal(t.name, L.name);
      assert.equal(t.short, L.short);
    }
  }
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

// A league with the regular season played out so that the table order is
// known, ready for its play-offs. Lower-seeded sides win when `upsets`.
function seasonDone(league, seed = 4) {
  const L = LEAGUES[league];
  const t = createLeague({ league, userTeam: L.teams[0].id, season: 'full', rng: seededRng(seed) });
  // The team listed first wins every match: the table follows the list.
  const rank = id => L.teams.findIndex(x => x.id === id);
  for (const f of t.fixtures) {
    const homeWins = rank(f.home) < rank(f.away);
    recordResult(t, f.id, { score: homeWins ? [30, 10] : [10, 30], tries: homeWins ? [4, 1] : [1, 4], winner: homeWins ? 'home' : 'away' });
  }
  const table = standings(t, 'L').map(r => r.id);
  assert.deepEqual(table, L.teams.map(x => x.id), 'the table follows the results');
  advance(t);
  return { t, seed: n => L.teams[n - 1].id };
}

const pairsOf = (t, stage) => t.fixtures.filter(f => f.stage === stage).map(f => [f.home, f.away]);
const play = (t, id, winner) => {
  const f = t.fixtures.find(x => x.id === id);
  recordResult(t, id, { score: winner === f.home ? [20, 10] : [10, 20], tries: [2, 1], winner: winner === f.home ? 'home' : 'away' });
};

test('Prem play-offs: semi-finals 1 v 4 and 2 v 3, the better seed at home, then the final', () => {
  const { t, seed } = seasonDone('prem');
  assert.equal(t.stage, 'semi');
  assert.deepEqual(pairsOf(t, 'semi'), [[seed(1), seed(4)], [seed(2), seed(3)]]);
  play(t, 'SF1', seed(4));
  play(t, 'SF2', seed(2));
  advance(t);
  assert.deepEqual(pairsOf(t, 'final'), [[seed(2), seed(4)]], 'the better seed hosts the final');
  play(t, 'F', seed(4));
  advance(t);
  assert.equal(t.champion, seed(4));
  assert.equal(roundName(t, 'final'), 'Final');
});

test('URC play-offs: quarter-finals 1v8, 4v5, 2v7, 3v6, then a fixed bracket', () => {
  const { t, seed } = seasonDone('urc');
  assert.equal(t.stage, 'qf');
  assert.equal(stageName(t), 'Quarter-finals');
  assert.deepEqual(pairsOf(t, 'qf'), [[seed(1), seed(8)], [seed(4), seed(5)], [seed(2), seed(7)], [seed(3), seed(6)]]);
  play(t, 'QF1', seed(8));
  play(t, 'QF2', seed(4));
  play(t, 'QF3', seed(2));
  play(t, 'QF4', seed(6));
  advance(t);
  assert.deepEqual(pairsOf(t, 'semi'), [[seed(4), seed(8)], [seed(2), seed(6)]], 'QF1 and QF2 winners meet; the better seed hosts');
  play(t, 'SF1', seed(8));
  play(t, 'SF2', seed(6));
  advance(t);
  assert.deepEqual(pairsOf(t, 'final'), [[seed(6), seed(8)]]);
  assert.equal(roundName(t, 'final'), 'Grand Final');
});

test('Top 14 play-offs: barrages 3v6 and 4v5 while the top two wait, then 1 v the 4v5 winner and 2 v the 3v6 winner', () => {
  const { t, seed } = seasonDone('top14');
  assert.equal(t.stage, 'qf');
  assert.equal(stageName(t), 'Barrages');
  assert.equal(roundName(t, 'qf'), 'Barrage');
  assert.deepEqual(pairsOf(t, 'qf'), [[seed(3), seed(6)], [seed(4), seed(5)]]);
  assert.deepEqual(t.byes, [seed(1), seed(2)]);
  // The user, top of the table, is still in it with no barrage to play.
  assert.equal(t.userTeam, seed(1));
  assert.equal(userFixture(t), null);
  assert.ok(userAlive(t));
  play(t, 'QF1', seed(6));
  play(t, 'QF2', seed(4));
  advance(t);
  assert.deepEqual(pairsOf(t, 'semi'), [[seed(1), seed(4)], [seed(2), seed(6)]]);
  assert.deepEqual(t.byes, []);
  assert.ok(isUserFixture(t, userFixture(t)));
});

test('Super Rugby finals: 1v6, 2v5, 3v4, and the best-placed loser goes through as fourth seed', () => {
  const { t, seed } = seasonDone('super');
  assert.equal(stageName(t), 'Qualifying finals');
  assert.deepEqual(pairsOf(t, 'qf'), [[seed(1), seed(6)], [seed(2), seed(5)], [seed(3), seed(4)]]);
  // Upsets: 6 beats 1, 5 beats 2, 3 beats 4. Best-placed loser: 1st.
  play(t, 'QF1', seed(6));
  play(t, 'QF2', seed(5));
  play(t, 'QF3', seed(3));
  assert.equal(t.userTeam, seed(1));
  advance(t);
  // Winners ranked 3, 5, 6 become seeds 1-3; the lucky loser (1st) is seed 4 and plays away.
  assert.deepEqual(pairsOf(t, 'semi'), [[seed(3), seed(1)], [seed(5), seed(6)]]);
  assert.ok(userAlive(t), 'the lucky loser is still in it');
  play(t, 'SF1', seed(1));
  play(t, 'SF2', seed(6));
  advance(t);
  // As fourth seed the lucky loser plays the final away, even from first in the table.
  assert.deepEqual(pairsOf(t, 'final'), [[seed(6), seed(1)]]);
  assert.equal(roundName(t, 'final'), 'Grand final');
});

test('the play-offs take exactly the qualifiers', () => {
  for (const league of Object.keys(LEAGUES)) {
    const { t } = seasonDone(league);
    const playing = new Set([...t.fixtures.filter(f => f.stage !== 'league').flatMap(f => [f.home, f.away]), ...(t.byes || [])]);
    assert.equal(playing.size, QUALIFY[t.playoff], league);
  }
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
  // Every pairing in every competition, home or away: two kits that tell apart.
  for (const roster of [NATIONS, ...Object.values(LEAGUES).map(L => L.teams)]) {
    for (const x of roster) {
      for (const y of roster) {
        if (x.id === y.id) continue;
        const comp = { teams: [x, y], userTeam: x.id, length: 'quick', cards: true };
        for (const f of [{ home: y.id, away: x.id }, { home: x.id, away: y.id }]) {
          const opts = matchOptions(comp, f);
          assert.ok(!clash(opts.teams[0].color, opts.teams[1].color), `${x.id} v ${y.id}`);
          assert.equal(opts.teams[0].color, x.color, 'the user always wears their own colours');
          const [home, away] = kits(comp, f);
          assert.ok(!clash(home.color, away.color), `sim ${f.home} v ${f.away}`);
        }
      }
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

test('whole tournaments play out to one champion, the user alive exactly while they have a match or a bye', () => {
  const comps = ['cup', ...Object.keys(LEAGUES)];
  for (let seed = 0; seed < 15; seed++) {
    const rng = seededRng(100 + seed);
    const comp = comps[seed % comps.length];
    const roster = comp === 'cup' ? NATIONS : LEAGUES[comp].teams;
    const userTeam = roster[(seed * 3) % roster.length].id;
    const t = comp === 'cup' ? createCup({ userTeam, length: 'quick', rng }) : createLeague({ league: comp, userTeam, length: 'quick', season: seed < 10 ? 'short' : 'full', rng });
    let won = 0;
    let lost = 0;
    for (let guard = 0; t.stage !== 'done' && guard < 40; guard++) {
      if (userFixture(t)) {
        assert.ok(userAlive(t));
        if (playUser(t, rng)) won++;
        else lost++;
      } else {
        // No match: knocked out, a league bye, or a top-two wait in the Top 14.
        const bye = t.stage === 'league' || (t.byes || []).includes(t.userTeam);
        assert.equal(userAlive(t), bye, `${comp} ${t.stage}: alive only with a bye`);
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
    assert.equal(t.fixtures.filter(f => f.stage === 'qf').length, { cup: 0, super: 3, prem: 0, urc: 4, top14: 2 }[comp], comp);
    // Tournaments survive being saved and loaded.
    assert.deepEqual(JSON.parse(JSON.stringify(t)), t);
  }
});
