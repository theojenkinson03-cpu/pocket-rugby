// Tournaments: fixtures, the table and its bonus points, the knockouts, and
// whole competitions played out to a champion.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { act, MATCH_LENGTHS, newMatch, seededRng } from '../js/engine.js';
import { cpuChoice } from '../js/ai.js';
import {
  bonusFor, classCards, ratingOf, selectSide, unavailable, WORLD_CUP, worldCupRound16,
  advance, clash, createCup, createLeague, currentRound, isUserFixture, kits, LEAGUES, matchOptions, migrateTournament, NATIONS, NEUTRAL_GROUNDS,
  POINTS, QUALIFY, recordResult, resultFromMatch, roundName, roundRobin, SHORT_SEASON, simulateFixture, simulateRound, stageName, standings,
  TEAM_BY_ID, teamOf, userAlive, userFixture, userRecord, venue,
} from '../js/tournament.js';
import { PATTERNS } from '../js/color.js';
import { realRoster, realSquad, SQUAD_SHAPE, SQUADS } from '../js/squads.js';
import { STAT_KEYS } from '../js/season.js';
import { POSITIONS } from '../js/dice.js';

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

test('the World Cup: the real 2027 pools, 24 nations, the user in one of them', () => {
  assert.equal(NATIONS.length, 24);
  assert.equal(new Set(NATIONS.map(n => n.id)).size, 24);
  assert.deepEqual(WORLD_CUP.pools, {
    A: ['nzl', 'aus', 'chi', 'hkg'],
    B: ['rsa', 'ita', 'geo', 'rou'],
    C: ['arg', 'fij', 'esp', 'can'],
    D: ['irl', 'sco', 'uru', 'por'],
    E: ['fra', 'jpn', 'usa', 'sam'],
    F: ['eng', 'wal', 'ton', 'zim'],
  });
  assert.deepEqual(Object.values(WORLD_CUP.pools).flat().sort(), NATIONS.map(n => n.id).sort(), 'every nation in one pool');
  for (const n of NATIONS) assert.ok(n.rating >= 1 && n.rating <= 5 && n.ground && n.name && n.short, n.id);
  for (let seed = 0; seed < 24; seed++) {
    const user = NATIONS[seed].id;
    const t = createCup({ userTeam: user, rng: seededRng(seed) });
    assert.equal(t.teams.length, 24);
    assert.ok(t.worldCup);
    assert.equal(t.fixtures.length, 36, 'six matches a pool');
    assert.ok(t.fixtures.every(f => f.stage === 'pool' && t.pools[f.group].includes(f.home) && t.pools[f.group].includes(f.away)));
    assert.equal(t.fixtures.filter(f => isUserFixture(t, f)).length, 3);
    // Every match at one of the eight grounds in Australia.
    assert.ok(t.fixtures.every(f => WORLD_CUP.venues.includes(f.venue)));
    // Every side has its real five.
    for (const team of t.teams) assert.deepEqual(team.roster, realRoster(team.id));
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
  t.fixtures = results.map(([h, a, score, tries, winner], i) => ({ id: `x${i}`, stage: 'pool', round: 0, group: 'A', home: ids[h], away: ids[a], result: { score, tries, winner: winner || (score[0] > score[1] ? 'home' : 'away') } }));
  return { t, ids };
}

test('table points: 4 for a win, 2 for a draw, a bonus for winning by 10+ or losing by 5 or fewer', () => {
  assert.deepEqual(POINTS, { win: 4, draw: 2, bigWinBonus: 1, bigWinBy: 10, losingBonus: 1, losingBonusWithin: 5 });
  const { t, ids } = pool([
    [0, 1, [30, 25], [4, 4]], // home win by 5: 4; away lose by 5: 1 (tries don't matter)
    [2, 3, [30, 22], [2, 3]], // win by 8: 4; lose by 8: nothing
    [0, 2, [12, 30], [1, 5]], // away win by 18: 4 + 1; home lose by 18: nothing
  ]);
  const rows = Object.fromEntries(standings(t, 'A').map(r => [r.id, r]));
  assert.deepEqual([rows[ids[0]].points, rows[ids[0]].bonus, rows[ids[0]].won, rows[ids[0]].lost], [4, 0, 1, 1]);
  assert.deepEqual([rows[ids[1]].points, rows[ids[1]].bonus], [1, 1], 'the losing bonus');
  assert.deepEqual([rows[ids[2]].points, rows[ids[2]].played, rows[ids[2]].bonus], [9, 2, 1], 'a big-win bonus');
  assert.deepEqual([rows[ids[3]].points, rows[ids[3]].for, rows[ids[3]].against], [0, 22, 30]);
  // The edges: win by exactly 10 and by 9; lose by exactly 5 and by 6.
  const edge = pool([[0, 1, [20, 10], [0, 0]], [2, 3, [19, 10], [0, 0]]]);
  const e = Object.fromEntries(standings(edge.t, 'A').map(r => [r.id, r.points]));
  assert.deepEqual([e[edge.ids[0]], e[edge.ids[2]]], [5, 4]);
  const close = pool([[0, 1, [20, 15], [0, 0]], [2, 3, [21, 15], [0, 0]]]);
  const c = Object.fromEntries(standings(close.t, 'A').map(r => [r.id, r.points]));
  assert.deepEqual([c[close.ids[1]], c[close.ids[3]]], [1, 0]);
  // A draw: 2 each, no bonus, in the drawn column.
  const drawn = pool([[0, 1, [14, 14], [2, 2], 'draw']]);
  const d = standings(drawn.t, 'A').filter(r => r.played);
  assert.deepEqual(d.map(r => [r.points, r.drawn, r.won, r.lost, r.bonus]), [[2, 1, 0, 0, 0], [2, 1, 0, 0, 0]]);
  assert.deepEqual([bonusFor(30, 20), bonusFor(30, 21), bonusFor(10, 15), bonusFor(10, 16), bonusFor(7, 7)], ['big', null, 'close', null, null]);
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

// Pool results that leave the tables in fixture-list order: the home side wins.
function poolsPlayed(t, winsBig = () => true) {
  for (const f of t.fixtures) recordResult(t, f.id, winsBig(f) ? { score: [30, 10], tries: [4, 1], winner: 'home' } : { score: [20, 18], tries: [2, 2], winner: 'home' });
}

test('the World Cup knockouts: the round of 16 as drawn, best thirds into their slots, then the bracket to the final', () => {
  const t = createCup({ userTeam: 'eng', rng: seededRng(9) });
  poolsPlayed(t);
  assert.equal(currentRound(t), null);
  advance(t);
  assert.equal(t.stage, 'r16');
  const tables = Object.fromEntries(Object.keys(t.pools).map(g => [g, standings(t, g).map(r => r.id)]));
  const r16 = t.fixtures.filter(f => f.stage === 'r16');
  assert.equal(r16.length, 8);
  const at = (place, group) => tables[group][place - 1];
  // Winners and runners-up exactly where the draw puts them.
  assert.deepEqual([r16[0].home, r16[0].away], [at(2, 'C'), at(2, 'F')]);
  assert.equal(r16[1].home, at(1, 'A'));
  assert.deepEqual([r16[2].home, r16[2].away], [at(1, 'E'), at(2, 'D')]);
  assert.equal(r16[3].home, at(1, 'B'));
  assert.equal(r16[4].home, at(1, 'C'));
  assert.equal(r16[5].home, at(1, 'D'));
  assert.deepEqual([r16[6].home, r16[6].away], [at(2, 'A'), at(2, 'E')]);
  assert.deepEqual([r16[7].home, r16[7].away], [at(1, 'F'), at(2, 'B')]);
  // The four thirds: from the pools their slots allow, all different, the best four.
  const thirds = [r16[1].away, r16[3].away, r16[4].away, r16[5].away];
  const poolOf = id => Object.keys(t.pools).find(g => t.pools[g].includes(id));
  assert.equal(new Set(thirds).size, 4);
  ['CEF', 'DEF', 'AEF', 'BEF'].forEach((allowed, i) => {
    assert.equal(tables[poolOf(thirds[i])][2], thirds[i], 'a third-placed side');
    assert.ok(allowed.includes(poolOf(thirds[i])), `slot ${i} takes a third from ${allowed}`);
  });
  assert.deepEqual(r16.map(f => f.venue), WORLD_CUP.r16.map(x => x[2]));
  // Home sides win every knockout: follow the bracket.
  const play = stage => t.fixtures.filter(f => f.stage === stage).forEach(f => recordResult(t, f.id, { score: [20, 10], tries: [2, 1], winner: 'home' }));
  play('r16');
  advance(t);
  assert.equal(t.stage, 'qf');
  const qf = t.fixtures.filter(f => f.stage === 'qf');
  assert.deepEqual(qf.map(f => [f.home, f.away]), [[r16[1].home, r16[3].home], [r16[0].home, r16[2].home], [r16[4].home, r16[5].home], [r16[6].home, r16[7].home]]);
  assert.deepEqual(qf.map(f => f.venue), ['Stadium Australia, Sydney', 'Brisbane Stadium', 'Brisbane Stadium', 'Stadium Australia, Sydney']);
  play('qf');
  advance(t);
  const sf = t.fixtures.filter(f => f.stage === 'semi');
  assert.deepEqual(sf.map(f => [f.home, f.away]), [[qf[0].home, qf[1].home], [qf[2].home, qf[3].home]]);
  // Nothing moves on until both semis are played.
  recordResult(t, 'SF1', { score: [10, 30], tries: [1, 4], winner: 'away' });
  advance(t);
  assert.equal(t.stage, 'semi');
  recordResult(t, 'SF2', { score: [30, 3], tries: [4, 0], winner: 'home' });
  advance(t);
  const final = t.fixtures.find(f => f.stage === 'final');
  assert.deepEqual([final.home, final.away, final.venue], [sf[0].away, sf[1].home, 'Stadium Australia, Sydney']);
  recordResult(t, 'F', { score: [30, 29], tries: [3, 3], winner: 'away' });
  advance(t);
  assert.equal(t.stage, 'done');
  assert.equal(t.champion, sf[1].home);
  assert.throws(() => recordResult(t, 'F', { score: [1, 0], tries: [0, 0], winner: 'home' }), /not open/);
});

test('best thirds: every way four of the six can go through fills the four slots', () => {
  const groups = ['A', 'B', 'C', 'D', 'E', 'F'];
  let cases = 0;
  for (let mask = 0; mask < 64; mask++) {
    const through = groups.filter((_, i) => mask & (1 << i));
    if (through.length !== 4) continue;
    const t = createCup({ userTeam: 'eng', rng: seededRng(1) });
    // In every pool the first beats everyone and the second the other two
    // by 30; the third beats the fourth by 40 (a bonus point: through) or by 1.
    t.fixtures = [];
    for (const g of groups) {
      const [p1, p2, p3, p4] = t.pools[g];
      const win = (home, away, by) => t.fixtures.push({ id: `${g}${home}${away}`, stage: 'pool', round: 0, group: g, home, away, result: { score: [10 + by, 10], tries: [1, 1], winner: 'home' } });
      win(p1, p2, 30);
      win(p1, p3, 30);
      win(p1, p4, 30);
      win(p2, p3, 30);
      win(p2, p4, 30);
      win(p3, p4, through.includes(g) ? 40 : 1);
    }
    const r16 = worldCupRound16(t);
    const thirds = [r16[1].away, r16[3].away, r16[4].away, r16[5].away];
    const poolOf = id => groups.find(g => t.pools[g].includes(id));
    assert.deepEqual(thirds.map(poolOf).sort(), [...through].sort(), `${through}`);
    ['CEF', 'DEF', 'AEF', 'BEF'].forEach((allowed, i) => assert.ok(allowed.includes(poolOf(thirds[i])), `${through}: slot ${i}`));
    cases++;
  }
  assert.equal(cases, 15);
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

test('home grounds: every nation and club has one, and patterned kits are well formed', () => {
  const all = [...NATIONS, ...Object.values(LEAGUES).flatMap(L => L.teams)];
  for (const team of all) {
    assert.ok(typeof team.ground === 'string' && team.ground.length > 3, `${team.id} has a ground`);
    if (!team.kit) continue;
    const [pattern, ...colors] = team.kit;
    assert.ok(PATTERNS.includes(pattern) && pattern !== 'plain', `${team.id}: ${pattern}`);
    assert.equal(colors[0], team.color, `${team.id}: the kit's main colour is the team colour`);
    assert.ok(colors.length >= 2 && colors.every(c => /^#[0-9a-f]{6}$/i.test(c)), `${team.id}: colours`);
  }
  // Clubs that share a league never share a ground.
  for (const L of Object.values(LEAGUES)) assert.equal(new Set(L.teams.map(x => x.ground)).size, L.teams.length, L.name);
  // A few the kits are known for.
  assert.equal(TEAM_BY_ID.gloucester.kit[0], 'hoops');
  assert.equal(TEAM_BY_ID.harlequins.kit[0], 'quarters');
  assert.equal(TEAM_BY_ID.glasgow.kit[0], 'tartan');
  assert.equal(TEAM_BY_ID.leicester.kit[0], 'hoops');
  assert.equal(TEAM_BY_ID.munster.ground, 'Thomond Park');
});

test('venues: home grounds in the season, neutral Prem and Top 14 finals, the better seed at home elsewhere', () => {
  const league = createLeague({ league: 'urc', userTeam: 'munster', rng: seededRng(3) });
  for (const f of league.fixtures) {
    assert.deepEqual(venue(league, f), { name: teamOf(league, f.home).ground, neutral: false }, `${f.home} v ${f.away}`);
  }
  // Prem: semi-finals at the better seed's ground, the final at Twickenham.
  const prem = seasonDone('prem');
  for (const f of prem.t.fixtures.filter(x => x.stage === 'semi')) assert.equal(venue(prem.t, f).name, teamOf(prem.t, f.home).ground);
  play(prem.t, 'SF1', prem.seed(1));
  play(prem.t, 'SF2', prem.seed(2));
  advance(prem.t);
  const premFinal = prem.t.fixtures.find(f => f.stage === 'final');
  assert.deepEqual(venue(prem.t, premFinal), { name: 'Allianz Stadium, Twickenham', neutral: true });
  // Top 14: barrages at home, semi-finals in Bordeaux, the final at the Stade de France.
  const top14 = seasonDone('top14');
  for (const f of top14.t.fixtures.filter(x => x.stage === 'qf')) assert.equal(venue(top14.t, f).neutral, false);
  play(top14.t, 'QF1', top14.seed(3));
  play(top14.t, 'QF2', top14.seed(4));
  advance(top14.t);
  for (const f of top14.t.fixtures.filter(x => x.stage === 'semi')) assert.deepEqual(venue(top14.t, f), { name: NEUTRAL_GROUNDS.top14.semi, neutral: true });
  play(top14.t, 'SF1', top14.seed(1));
  play(top14.t, 'SF2', top14.seed(2));
  advance(top14.t);
  assert.deepEqual(venue(top14.t, top14.t.fixtures.find(f => f.stage === 'final')), { name: 'Stade de France', neutral: true });
  // URC and Super Rugby: the better seed hosts the final.
  for (const id of ['urc', 'super']) {
    const done = seasonDone(id);
    for (let guard = 0; done.t.stage !== 'done' && done.t.stage !== 'final' && guard < 10; guard++) {
      for (const f of done.t.fixtures.filter(x => x.stage === done.t.stage && !x.result)) play(done.t, f.id, f.home);
      advance(done.t);
    }
    const final = done.t.fixtures.find(f => f.stage === 'final');
    assert.deepEqual(venue(done.t, final), { name: teamOf(done.t, final.home).ground, neutral: false }, id);
  }
});

test('World Cup grounds: neutral unless Australia, the hosts, are playing', () => {
  const t = createCup({ userTeam: 'wal', rng: seededRng(3) });
  assert.equal(t.host, 'aus');
  for (const f of t.fixtures) {
    const v = venue(t, f);
    assert.equal(v.name, f.venue);
    assert.equal(v.neutral, f.home !== 'aus' && f.away !== 'aus');
  }
  // An eight-nation cup saved before the World Cup carries on as it was.
  const old = { kind: 'cup', host: 'eng', teams: [{ id: 'eng', ground: 'Allianz Stadium, Twickenham' }, { id: 'wal', ground: 'Principality Stadium' }], fixtures: [], stage: 'semi', pools: { A: ['eng'], B: ['wal'] } };
  assert.deepEqual(venue(migrateTournament(old), { stage: 'semi', home: 'wal', away: 'eng' }), { name: 'Allianz Stadium, Twickenham', neutral: false });
});

test('class: the stronger side gets team cards for the gap in ratings in matches the CPU plays out', () => {
  assert.deepEqual([1, 2, 3, 4].map(gap => classCards(gap, seededRng(gap)).map(c => c.rarity)), [['epic'], ['epic', 'epic'], ['mythic', 'epic', 'epic'], ['mythic', 'mythic', 'epic', 'epic']]);
  assert.deepEqual(classCards(0, seededRng(1)), []);
  assert.deepEqual(classCards(-2, seededRng(5)), classCards(2, seededRng(5)), 'the same cards whichever side is stronger');
  for (let gap = 1; gap <= 6; gap++) assert.equal(new Set(classCards(gap, seededRng(gap)).map(c => c.id)).size, Math.min(4, gap));
  assert.deepEqual([ratingOf({ rating: 5 }), ratingOf({ level: 'expert' }), ratingOf({ level: 'pro' }), ratingOf({ level: 'rookie' }), ratingOf({})], [5, 4, 3, 2, 3]);
  // New Zealand against Hong Kong China: a big favourite, not a certainty.
  const t = createCup({ userTeam: 'wal', length: 'quick', rng: seededRng(1) });
  let wins = 0;
  for (let i = 0; i < 120; i++) if (simulateFixture(t, { id: 'x', stage: 'pool', home: 'hkg', away: 'nzl' }, seededRng(i)).winner === 'away') wins++;
  assert.ok(wins > 95 && wins < 120, `New Zealand won ${wins} of 120`);
});
test('kits for a match: the first choice keeps its pattern, a change strip is plain, and the venue goes along', () => {
  const comp = { teams: [TEAM_BY_ID.gloucester, TEAM_BY_ID.munster, TEAM_BY_ID.harlequins], userTeam: 'harlequins', length: 'quick', cards: true };
  // Gloucester (cherry and white) at home to Munster (red): Munster change.
  const [home, away] = kits(comp, { home: 'gloucester', away: 'munster', stage: 'league' });
  assert.deepEqual(home.kit, TEAM_BY_ID.gloucester.kit);
  assert.equal(away.kit, null);
  assert.notEqual(away.color, TEAM_BY_ID.munster.color);
  // Gloucester's cherry and white hoops away at red Munster: a plain change strip.
  const [, visitors] = kits(comp, { home: 'munster', away: 'gloucester', stage: 'league' });
  assert.equal(visitors.kit, null, 'the change strip drops the hoops');
  assert.equal(visitors.color, TEAM_BY_ID.gloucester.alt);
  const user = matchOptions({ ...comp, userTeam: 'munster' }, { home: 'gloucester', away: 'munster', stage: 'league' });
  assert.equal(user.teams[1].kit, null, 'and so does a CPU side that changes against the user');
  const opts = matchOptions(comp, { home: 'gloucester', away: 'harlequins', stage: 'league' });
  assert.deepEqual(opts.teams[0].kit, TEAM_BY_ID.harlequins.kit, 'the user wears their own pattern');
  assert.deepEqual(opts.venue, { name: 'Kingsholm', neutral: false });
  const m = newMatch(opts);
  assert.deepEqual(m.venue, { name: 'Kingsholm', neutral: false });
  assert.deepEqual(m.teams[0].kit, TEAM_BY_ID.harlequins.kit);
});

test('tournaments saved before grounds and kits get them on load', () => {
  const t = createLeague({ league: 'prem', userTeam: 'bath', rng: seededRng(1) });
  const old = structuredClone(t);
  for (const team of old.teams) {
    delete team.ground;
    delete team.kit;
  }
  delete old.byes;
  const m = migrateTournament(old);
  assert.equal(teamOf(m, 'bath').ground, 'The Recreation Ground');
  assert.deepEqual(teamOf(m, 'gloucester').kit, ['hoops', '#c8102e', '#f4f4f0']);
  assert.equal(teamOf(m, 'exeter').kit, undefined, 'plain clubs stay plain');
  assert.deepEqual(m.byes, []);
  assert.equal(migrateTournament(null), null);
});

test('a match result is recorded from the right side', () => {
  const names = side => Object.fromEntries(POSITIONS.map(p => [p, `${side}. ${p}name`]));
  const m = newMatch({ mode: '1p', teams: [{ name: 'Mine', color: '#123456', roster: names('M') }, { name: 'Theirs', color: '#654321', roster: names('T') }] });
  m.teams[0].score = 30;
  m.teams[1].score = 12;
  m.teams[0].stats.tries = 5;
  m.teams[1].stats.tries = 2;
  m.winner = 0;
  m.teams[0].players.W.tries = 3;
  m.teams[1].players.F.tackles = 9;
  const f = { home: 'a', away: 'b' };
  const brief = r => ({ score: r.score, tries: r.tries, winner: r.winner });
  const home = resultFromMatch(f, m, true);
  const away = resultFromMatch(f, m, false);
  assert.deepEqual(brief(home), { score: [30, 12], tries: [5, 2], winner: 'home' });
  assert.deepEqual(brief(away), { score: [12, 30], tries: [2, 5], winner: 'away' });
  // Player numbers go with their side, by name, and so does the Player of the Match.
  const tries = (r, side, pos) => r.lines[side].find(([, p]) => p === pos)[2 + STAT_KEYS.indexOf('tries')];
  assert.equal(tries(home, 0, 'W'), 3, 'the user at home: their Outside Back scored 3');
  assert.equal(tries(away, 1, 'W'), 3, 'the user away: their numbers are the away side\'s');
  assert.equal(away.lines[0].find(([, p]) => p === 'F')[2 + STAT_KEYS.indexOf('tackles')], 9);
  assert.equal(home.lines[0].find(([, p]) => p === 'W')[0], m.teams[0].roster.W);
  assert.deepEqual(home.potm, { side: 0, pos: 'W', name: m.teams[0].roster.W });
  assert.deepEqual(away.potm, { side: 1, pos: 'W', name: m.teams[0].roster.W });
  // Who was hurt goes with their side too.
  m.teams[0].injured = [m.teams[0].roster.F];
  assert.deepEqual(resultFromMatch(f, m, false).injured, [[], [m.teams[0].roster.F]]);
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
  // On the clock, a knockout is never drawn: it goes to sudden death.
  if (f.stage !== 'pool' && f.stage !== 'league') assert.notEqual(m.winner, null, `${f.stage} decided`);
  recordResult(t, f.id, resultFromMatch(f, m, f.home === t.userTeam));
  return m.winner === null ? 'drawn' : m.winner === 0 ? 'won' : 'lost';
}

test('whole tournaments play out to one champion, the user alive exactly while they have a match or a bye', () => {
  const comps = ['cup', ...Object.keys(LEAGUES)];
  for (let seed = 0; seed < 15; seed++) {
    const rng = seededRng(100 + seed);
    const comp = comps[seed % comps.length];
    const roster = comp === 'cup' ? NATIONS : LEAGUES[comp].teams;
    const userTeam = roster[(seed * 3) % roster.length].id;
    const format = seed % 2 ? 'rolls' : 'points';
    const t = comp === 'cup' ? createCup({ userTeam, length: 'quick', format, rng }) : createLeague({ league: comp, userTeam, length: 'quick', format, season: seed < 10 ? 'short' : 'full', rng });
    const record = { won: 0, drawn: 0, lost: 0 };
    for (let guard = 0; t.stage !== 'done' && guard < 40; guard++) {
      if (userFixture(t)) {
        assert.ok(userAlive(t));
        record[playUser(t, rng)]++;
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
    assert.deepEqual(userRecord(t), record);
    // Knockouts never end level; league and pool matches on the clock can.
    assert.ok(t.fixtures.every(f => f.result.winner !== 'draw' || f.stage === 'pool' || f.stage === 'league'));
    assert.equal(userAlive(t), t.champion === t.userTeam);
    // Every fixture has a result, and the knockouts have the right shape.
    assert.ok(t.fixtures.every(f => f.result));
    assert.equal(t.fixtures.filter(f => f.stage === 'semi').length, 2);
    assert.equal(t.fixtures.filter(f => f.stage === 'final').length, 1);
    assert.equal(t.fixtures.filter(f => f.stage === 'qf').length, { cup: 4, super: 3, prem: 0, urc: 4, top14: 2 }[comp], comp);
    assert.equal(t.fixtures.filter(f => f.stage === 'r16').length, comp === 'cup' ? 8 : 0, comp);
    // Tournaments survive being saved and loaded.
    assert.deepEqual(JSON.parse(JSON.stringify(t)), t);
  }
});

test('the team sheet: five to start, three on the bench, the injured left out', () => {
  const t = createLeague({ league: 'prem', userTeam: 'bath', bench: true, rng: seededRng(3) });
  const bath = teamOf(t, 'bath');
  const at = pos => bath.squad.filter(x => x.pos === pos).map(x => x.name);
  // By itself: the first at each position, and a Forward, a Centre and an Outside Back on the bench.
  const side = selectSide(bath);
  assert.deepEqual(side.roster, bath.roster);
  assert.deepEqual(side.bench, [{ name: at('F')[1], pos: 'F' }, { name: at('C')[1], pos: 'C' }, { name: at('W')[1], pos: 'W' }]);
  assert.deepEqual(side.offPos, {});
  // Injured: the next fit player at the position starts.
  const hurt = selectSide(bath, [at('F')[0], at('S')[0]]);
  assert.deepEqual([hurt.roster.F, hurt.roster.S], [at('F')[1], at('S')[1]]);
  assert.ok(!hurt.bench.some(b => [at('F')[0], at('S')[0]].includes(b.name)));
  // Both Scrum Halves out: someone fit plays there, out of position.
  const none = selectSide(bath, at('S'));
  assert.ok(!at('S').includes(none.roster.S));
  assert.deepEqual(none.offPos, { S: 1 });
  // A team sheet is kept where its players are fit, the rest filled in.
  const pick = { start: { F: at('F')[3], W: at('C')[2] }, bench: [at('S')[1], at('B')[1]] };
  const picked = selectSide(bath, [], pick);
  assert.deepEqual([picked.roster.F, picked.roster.W, picked.roster.S], [at('F')[3], at('C')[2], at('S')[0]]);
  assert.deepEqual(picked.offPos, { W: 1 }, 'a Centre on the wing plays out of position');
  assert.deepEqual(picked.bench.map(b => b.name), [at('S')[1], at('B')[1], at('F')[0]]);
  assert.deepEqual(selectSide(bath, [at('F')[3]], pick).roster.F, at('F')[0], 'an injured pick sits out');
  // No duplicates, ever.
  for (const s2 of [side, hurt, none, picked]) {
    const names = [...Object.values(s2.roster), ...s2.bench.map(b => b.name)];
    assert.equal(new Set(names).size, 8);
  }
});

test('injuries: a player hurt in a match misses the side\'s next one, then is back', () => {
  const t = createLeague({ league: 'urc', userTeam: 'munster', length: 'quick', bench: true, rng: seededRng(4) });
  t.userTeam = 'nobody';
  let checked = 0;
  for (let guard = 0; t.stage === 'league' && guard < 20; guard++) {
    // Before the round: each side's injured from its last match are out of its picked side.
    const round = currentRound(t);
    for (const f of t.fixtures.filter(x => x.round === round && !x.result)) {
      for (const id of [f.home, f.away]) {
        const out = unavailable(t, id);
        const [home, away] = kits(t, f);
        const side = id === f.home ? home : away;
        const playing = [...Object.values(side.roster), ...side.bench.map(b => b.name)];
        assert.ok(out.every(name => !playing.includes(name)), `${id}: the injured sit out`);
        checked += out.length;
      }
    }
    simulateRound(t, seededRng(guard + 1));
    advance(t);
  }
  assert.ok(checked > 3, `${checked} injured players kept out`);
  // A match with injuries, then the side's next.
  const f = t.fixtures.find(x => x.result?.injured?.[0]?.length);
  const id = f.home;
  const later = t.fixtures.filter(x => x.result && (x.home === id || x.away === id));
  const i = later.indexOf(f);
  assert.ok(i >= 0);
  if (i + 1 < later.length) {
    const next = later[i + 1];
    const lines = next.result.lines[next.home === id ? 0 : 1].map(([name]) => name);
    assert.ok(f.result.injured[0].every(name => !lines.includes(name)), 'missed the next match');
  }
});

test('real squads: fifteen different players for every nation and club, by position, short enough for the dice', () => {
  const sides = [...NATIONS, ...Object.values(LEAGUES).flatMap(l => l.teams)];
  assert.equal(sides.length, 24 + 51);
  let real = 0;
  for (const side of sides) {
    const known = SQUADS[side.id];
    assert.ok(known, `${side.id} has a squad`);
    assert.deepEqual(Object.keys(known), ['S', 'F', 'C', 'W', 'B']);
    for (const pos of POSITIONS) assert.ok(known[pos].length >= 1 && known[pos].length <= SQUAD_SHAPE[pos], `${side.id} ${pos}`);
    real += POSITIONS.reduce((n, p) => n + known[p].length, 0);
    const squad = realSquad(side.id, side.flavour);
    assert.equal(squad.length, 15);
    assert.deepEqual(POSITIONS.map(p => squad.filter(x => x.pos === p).length), [2, 5, 3, 3, 2]);
    assert.equal(new Set(squad.map(x => x.name)).size, 15, `${side.id}: fifteen different players`);
    for (const pos of POSITIONS) assert.deepEqual(squad.filter(x => x.pos === pos).slice(0, known[pos].length).map(x => x.name), known[pos], 'the real ones first');
    assert.deepEqual(realSquad(side.id, side.flavour), squad, 'the same every time');
    for (const { name } of squad) {
      assert.match(name, /^[A-Z]\. [\p{L}' -]+$/u, `${side.id}: "${name}"`);
      assert.ok(name.length <= 26, `${side.id}: "${name}" fits`);
    }
    assert.deepEqual(realRoster(side.id), Object.fromEntries(POSITIONS.map(p => [p, known[p][0]])));
  }
  assert.ok(real > 900, `${real} real players`);
  assert.equal(Object.keys(SQUADS).length, sides.length, 'no squad without a side');
  // Leagues and the Champions Cup field real players too.
  const t = createLeague({ league: 'urc', userTeam: 'munster', rng: seededRng(2) });
  assert.deepEqual(teamOf(t, 'leinster').roster, realRoster('leinster'));
  assert.equal(teamOf(t, 'leinster').squad.length, 15);
});
