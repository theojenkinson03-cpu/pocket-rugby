// The CPU: always legal, and Pro follows the odds it is meant to.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { kickChance, receiverOdds, tryChance } from '../js/engine.js';
import { cpuChoice, suggestedChoice } from '../js/ai.js';
import { OUTSIDE_BACKS, stateAt } from './helpers.mjs';

const penaltyAt = (range, scores = [0, 0], cpuLevel = 'pro') => {
  const m = stateAt({ step: { type: 'choose', purpose: 'penalty', team: 1, range, options: ['kick', 'tap'] }, attacker: 1, scores });
  m.cpuLevel = cpuLevel;
  return m;
};

test('Pro kicks penalties at evens or better and taps otherwise', () => {
  for (let range = 1; range <= 5; range++) {
    const want = kickChance(range) >= 0.5 ? 'kick' : 'tap';
    assert.equal(cpuChoice(penaltyAt(range)), want, `range ${range}`);
  }
});

test('Pro takes a long shot when three points win the match', () => {
  assert.equal(cpuChoice(penaltyAt(5, [0, 28])), 'kick', '33% for the win');
  assert.equal(cpuChoice(penaltyAt(5, [0, 20])), 'tap', 'but not when it would not win');
});

test('Pro drop-goals in range and passes out of it', () => {
  for (let range = 1; range <= 5; range++) {
    const m = stateAt({ step: { type: 'choose', purpose: 'drop', team: 1, range, from: 'C', options: ['kick', 'pass'] }, attacker: 1, carrier: 'C' });
    m.cpuLevel = 'pro';
    assert.equal(cpuChoice(m), kickChance(range) >= 0.5 ? 'kick' : 'pass', `range ${range}`);
  }
});

test('Pro passes to the receiver with the best value', () => {
  for (const from of OUTSIDE_BACKS) {
    for (const [sinBin, yellows] of [[false, 0], [true, 1], [false, 2]]) {
      const options = OUTSIDE_BACKS.filter(p => p !== from);
      const m = stateAt({ step: { type: 'choose', purpose: 'pass', team: 1, from, options }, attacker: 1, carrier: from, sinBin: [sinBin, false], yellows: [yellows, 0] });
      m.cpuLevel = 'pro';
      const value = pos => {
        const o = receiverOdds(m, 1, pos);
        return o.lineBreak * tryChance() * 6.3 - o.error * 2;
      };
      const best = Math.max(...options.map(value));
      assert.equal(value(cpuChoice(m)), best, `from ${from}, defence card state ${yellows}`);
    }
  }
});

test('every CPU level always returns one of the options', () => {
  const steps = [
    { type: 'choose', purpose: 'toss', team: 1, options: ['heads', 'tails'] },
    { type: 'choose', purpose: 'pass', team: 1, from: 'W', options: ['F', 'C', 'B'] },
    { type: 'choose', purpose: 'drop', team: 1, range: 3, from: 'B', options: ['kick', 'pass'] },
    { type: 'choose', purpose: 'penalty', team: 1, range: 4, options: ['kick', 'tap'] },
  ];
  for (const step of steps) {
    for (const cpuLevel of ['pro', 'rookie']) {
      for (let i = 0; i < 200; i++) {
        const m = stateAt({ step, attacker: 1 });
        m.cpuLevel = cpuLevel;
        let x = i;
        const rng = () => ((x = (x * 9301 + 49297) % 233280) / 233280);
        assert.ok(step.options.includes(cpuChoice(m, rng)), `${cpuLevel} ${step.purpose}`);
      }
    }
  }
});

test('the tip shown to players is the Pro choice', () => {
  const m = penaltyAt(2, [0, 0], 'rookie');
  assert.equal(suggestedChoice(m), 'kick');
  assert.equal(suggestedChoice(penaltyAt(5, [0, 0], 'rookie')), 'tap');
});
