// The dice on the table: each side's dice and what they come to. Every
// total must add up from its terms, and agree with what the engine did.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { act, newMatch, rollWeather, seededRng } from '../js/engine.js';
import { cpuChoice } from '../js/ai.js';
import { duelOf, restingDuel } from '../js/duel.js';
import { dice, stateAt } from './helpers.mjs';

// "+3", "−2", "30 m", "+20 m": the number in a term.
const value = n => {
  const m = String(n).replace('−', '-').match(/-?\+?\d+/);
  return Number(m[0].replace('+', ''));
};
const added = terms => terms.reduce((sum, t) => sum + value(t.n), 0);

test('a run: the attack adds up to the intensity, and the defence waits with two brown dice', () => {
  const m = stateAt({ carrier: 'F', injuries: [{ F: 1 }, {}], sinBin: [false, true], yellows: [0, 1] });
  m.teams[0].cards = [{ id: 'big-pack', rarity: 'common' }];
  m.teams[1].cards = [{ id: 'rush-defence', rarity: 'rare' }];
  const { state, events } = act(m, { type: 'roll' }, dice(0)); // Hit Up 5
  const d = duelOf(m, state, events);
  const [att, def] = d.columns;
  assert.deepEqual([att.team, att.role, def.team, def.role], [0, 'Attack', 1, 'Defence']);
  assert.deepEqual(att.terms.map(t => [t.n, t.label]), [['5', 'Hit Up'], ['+1', 'Big Pack'], ['−1', 'injured']]);
  assert.equal(att.total, state.step.intensity);
  assert.equal(added(att.terms), att.total);
  assert.ok(def.dice.every(x => x.ghost) && def.dice.length === 2);
  assert.deepEqual(def.terms.map(t => [t.n, t.label]), [['−2', 'sin bin'], ['+2', 'Rush Defence']]);
  assert.equal(def.total, `${state.step.intensity}+`);
});

test('a tackle: the run on one side, the two brown dice and their plus and minus on the other', () => {
  let m = stateAt({ carrier: 'W', sinBin: [false, true], yellows: [0, 1] });
  m = act(m, { type: 'roll' }, dice(1)).state; // Hit Up 5
  const { state, events } = act(m, { type: 'roll' }, dice(2, 3)); // 3 + 3, −1 each
  const d = duelOf(m, state, events);
  const [att, def] = d.columns;
  assert.equal(att.dice[0].id, 'W');
  assert.equal(att.dice[0].rolled, false, 'the run was the roll before');
  assert.equal(att.total, 5);
  assert.deepEqual(def.terms.map(t => t.n), ['3', '+3', '−2']);
  assert.equal(def.total, 4);
  assert.equal(added(def.terms), def.total);
  assert.match(d.verdict.text, /5 beats 4: line break/);
  // Tackled the other way.
  const stopped = act(m, { type: 'roll' }, dice(4, 4)); // 4 + 4 − 2
  assert.match(duelOf(m, stopped.state, stopped.events).verdict.text, /6 stops 5: tackled/);
});

test('kicks: the distance and what adds to it, against the posts', () => {
  const m = stateAt({ step: { type: 'roll', purpose: 'kick', dice: ['K'], team: 0, kick: 'penalty', range: 4, kicker: 'B' } });
  m.teams[0].cards = [{ id: 'golden-boot', rarity: 'common' }];
  m.weather = { rain: false, wind: 1 };
  const { state, events } = act(m, { type: 'roll' }, dice(2)); // kick 2
  const [col] = duelOf(m, state, events).columns;
  assert.deepEqual(col.terms.map(t => [t.n, t.label]), [['20 m', 'kick'], ['+20 m', 'Golden Boot'], ['−10 m', 'wind']]);
  assert.equal(col.total, '30 m');
  assert.match(duelOf(m, state, events).verdict.text, /30 m v 40 m to the posts: short/);
});

test('a penalty: the posts for one side, the card check for the other', () => {
  const m = stateAt({ step: { type: 'roll', purpose: 'penalty', dice: ['K', 'D'], team: 0, offender: 1 } });
  const { state, events } = act(m, { type: 'roll' }, dice(5, 1)); // the yellow dot, 20 m
  const d = duelOf(m, state, events);
  assert.deepEqual(d.columns.map(c => [c.team, c.dice[0].id, c.dice[0].slot, c.total]), [[0, 'D', 1, '20 m'], [1, 'K', 0, 'Yellow']]);
});

test('in whole matches every roll has a table, and every total adds up from its terms', () => {
  const rng = seededRng(41);
  let checked = 0;
  for (let n = 0; n < 30; n++) {
    let m = newMatch({ mode: '2p', length: 'quick', format: n % 2 ? 'rolls' : 'points', cards: true, weather: rollWeather(rng) });
    while (m.step.type !== 'fulltime') {
      const a = m.step.type === 'roll' ? { type: 'roll' } : m.step.type === 'halftime' ? { type: 'continue' } : { type: 'choose', value: cpuChoice(m, rng) };
      const { state, events } = act(m, a, rng);
      const d = duelOf(m, state, events);
      if (m.step.type === 'roll') {
        assert.ok(d && d.columns.length >= 1, m.step.purpose);
        const rolled = d.columns.flatMap(c => c.dice.filter(x => x.rolled));
        assert.deepEqual(rolled.map(x => x.slot).sort(), state.roll.dice.map((_, i) => i), `${m.step.purpose}: every die rolled is on the table once`);
        for (const c of d.columns) {
          if (c.terms.length > 1 && !c.dice.some(x => x.ghost)) {
            assert.equal(added(c.terms), value(c.total), `${m.step.purpose}: ${JSON.stringify(c.terms)} = ${c.total}`);
            checked++;
          }
        }
        const run = events.find(e => e.type === 'run');
        if (run) assert.equal(d.columns[0].total, run.intensity);
      } else assert.equal(d, null);
      m = state;
    }
    assert.ok(restingDuel(m).columns[0].dice.length);
  }
  assert.ok(checked > 200, `${checked} totals checked`);
});
