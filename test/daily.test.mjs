// The daily challenge: the same rigged situation for everyone each day,
// built from the date; a fair-but-uphill difficulty; ranking and the
// shareable result.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { act, MATCH_LENGTHS, seededRng } from '../js/engine.js';
import { cpuChoice } from '../js/ai.js';
import { POSITIONS } from '../js/dice.js';
import { dailyMatch, dailyResult, dailyScenario, dayKey, dayNumber, daySeed, DIFFICULTY, FIRST_DAY, scenarioTitle, scoreParts, shareText, SITUATIONS } from '../js/daily.js';
import { LEAGUES } from '../js/tournament.js';
import { winMeter } from '../js/winprob.js';

const days = n => Array.from({ length: n }, (_, i) => new Date(Date.UTC(2026, 9, 28 + i)).toISOString().slice(0, 10));

test('days: a UTC date key, numbered from the first day, each with its own seed', () => {
  assert.equal(dayKey(new Date('2026-10-28T23:59:59Z')), '2026-10-28');
  assert.equal(dayKey(new Date('2026-10-29T00:00:00Z')), '2026-10-29');
  assert.equal(dayNumber(FIRST_DAY), 1);
  assert.equal(dayNumber('2026-11-27'), 31);
  assert.equal(dayNumber('2027-10-28'), 366);
  const seeds = days(365).map(daySeed);
  assert.equal(new Set(seeds).size, 365, 'no two days alike');
  assert.equal(daySeed('2026-10-28'), daySeed('2026-10-28'));
});

test('scores are made of tries, conversions and goals that add up', () => {
  const rng = seededRng(3);
  for (let points = 0; points <= 45; points++) {
    if ([1, 2, 4].includes(points)) {
      assert.throws(() => scoreParts(points, rng), /can't be scored/);
      continue;
    }
    for (let k = 0; k < 20; k++) {
      const p = scoreParts(points, rng);
      assert.equal(p.tries * 5 + p.conversions * 2 + (p.penaltyGoals + p.dropGoals) * 3, points, `${points}`);
      assert.ok(p.conversions <= p.tries && p.penaltyGoals >= 0 && p.dropGoals >= 0);
    }
  }
});

test('a scenario is the same for everyone that day, and a different one the next', () => {
  for (const key of days(30)) {
    const a = dailyScenario(key);
    const b = dailyScenario(key);
    assert.deepEqual(a, b, key);
    assert.deepEqual(dailyMatch(a), dailyMatch(b), `${key}: the starting match`);
  }
  const titles = new Set(days(30).map(k => `${dailyScenario(k).teams}|${scenarioTitle(dailyScenario(k))}`));
  assert.ok(titles.size > 25, 'days differ');
});

test('scenarios: two clubs from one league, behind with the clock running, every situation and twist', () => {
  const seen = { situation: new Set(), twist: new Set(), league: new Set(), cards: 0, weather: 0 };
  const full = MATCH_LENGTHS.standard.full;
  let inBand = 0;
  for (const key of days(150)) {
    const s = dailyScenario(key);
    const clubs = LEAGUES[s.league].teams.map(t => t.id);
    assert.ok(clubs.includes(s.teams[0]) && clubs.includes(s.teams[1]) && s.teams[0] !== s.teams[1], key);
    assert.ok(s.score[1] < full && s.score[0] < s.score[1], `${key}: behind, not beaten`);
    assert.ok(![1, 2, 4].includes(s.score[0]) && ![1, 2, 4].includes(s.score[1]));
    assert.ok(SITUATIONS[s.situation]);
    assert.match(scenarioTitle(s), /^\d+ down, \d+ to play$/);
    if (s.chance >= DIFFICULTY[0] && s.chance <= DIFFICULTY[1]) inBand++;
    seen.situation.add(s.situation);
    seen.twist.add(s.twist);
    seen.league.add(s.league);
    if (s.cards) seen.cards++;
    if (s.weather) seen.weather++;
  }
  assert.ok(inBand >= 145, `${inBand} of 150 days in the difficulty band`);
  assert.equal(seen.situation.size, Object.keys(SITUATIONS).length);
  assert.ok(seen.twist.size >= 5 && seen.league.size === 4);
  assert.ok(seen.cards > 40 && seen.weather > 40);
});

test('the starting match: second half, scores that add up, the situation and twist in place', () => {
  for (const key of days(120)) {
    const s = dailyScenario(key);
    const m = dailyMatch(s);
    assert.equal(m.half, 2);
    assert.equal(m.mode, '1p');
    assert.deepEqual(m.controllers, ['human', 'cpu']);
    assert.equal(m.cpuLevel, 'pro');
    assert.ok(m.bench);
    m.teams.forEach((t, i) => {
      const st = t.stats;
      assert.equal(t.score, s.score[i]);
      assert.equal(t.score, st.tries * 5 + st.conversions * 2 + st.penaltyGoals * 3 + st.dropGoals * 3, `${key}: team ${i}`);
      assert.equal(POSITIONS.reduce((n, p) => n + t.players[p].tries, 0), st.tries);
      assert.equal(POSITIONS.reduce((n, p) => n + t.players[p].metres, 0), st.metres);
      assert.equal(t.bench, 1);
    });
    assert.ok(m.venue?.name);
    if (s.cards) {
      assert.deepEqual(m.teams.map(t => t.cards), s.cards);
      assert.equal(new Set(s.cards.flat().map(c => c.id)).size, 4, 'four different cards');
    } else assert.deepEqual(m.teams.map(t => t.cards), [[], []]);
    assert.deepEqual(m.weather, s.weather);
    const step = m.step;
    const expected = { ball: ['attack', 0], defend: ['attack', 1], penalty: ['penalty', 0], scrum: ['setpiece', 0], lineout: ['setpiece', 1] }[s.situation];
    assert.deepEqual([step.purpose, step.team], expected, `${key}: ${s.situation}`);
    if (s.situation === 'penalty') assert.deepEqual(step.options, ['kick', 'tap']);
    if (s.twist === 'injured') assert.equal(m.teams[0].injuries[s.twistPos], 1);
    if (s.twist === 'theirInjury') assert.equal(m.teams[1].injuries[s.twistPos], 1);
    if (s.twist === 'sinbinned') assert.ok(m.teams[0].sinBin);
    if (s.twist === 'theirSinBin') assert.ok(m.teams[1].sinBin);
    assert.ok(Math.abs(winMeter(m, 0) - s.chance) < 0.001, 'the recorded chance is the model\'s');
  }
});

test('uphill but winnable: Pro against Pro from the day\'s position wins sometimes, not usually', () => {
  for (const key of days(6)) {
    const s = dailyScenario(key);
    let wins = 0;
    const n = 150;
    for (let i = 0; i < n; i++) {
      const rng = seededRng(i * 31 + 7);
      let m = dailyMatch(s);
      while (m.step.type !== 'fulltime') {
        const st = m.step;
        const a = st.type === 'roll' ? { type: 'roll' } : st.type === 'halftime' ? { type: 'continue' } : { type: 'choose', value: cpuChoice({ ...m, cpuLevel: 'pro' }, rng) };
        m = act(m, a, rng).state;
      }
      if (m.winner === 0) wins++;
    }
    const rate = wins / n;
    assert.ok(rate > 0.03 && rate < 0.65, `${key}: won ${rate} (model said ${s.chance})`);
  }
});

test('ranking: any win beats any defeat; bigger wins, then closer defeats, rank higher', () => {
  const at = (mine, theirs, winner) => dailyResult({ winner, teams: [{ score: mine }, { score: theirs }] });
  const ranks = [at(30, 29, 0), at(35, 20, 0), at(28, 30, 1), at(10, 32, 1)].map(r => r.rank);
  assert.ok(ranks[1] > ranks[0] && ranks[0] > ranks[2] && ranks[2] > ranks[3]);
  assert.deepEqual(at(30, 27, 0), { won: true, score: [30, 27], margin: 3, rank: 1003 });
});

test('the shareable result: the day, the situation, the score and a square for every score', () => {
  const s = dailyScenario(FIRST_DAY);
  const text = shareText(s, { won: true, score: [30, 27], margin: 3 }, [0, 1, 0, 0]);
  const lines = text.split('\n');
  assert.equal(lines[0], 'Pocket Rugby Daily #1 🏉');
  assert.equal(lines[1], `${scenarioTitle(s)} · Won 30–27`);
  assert.equal(lines[2], '🟩🟥🟩🟩');
  assert.equal(shareText(s, { won: false, score: [20, 30] }).split('\n').length, 2, 'no squares, no line');
});
