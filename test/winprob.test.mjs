// The win model: always a probability, the two sides' chances add up to
// one, more points never hurt, and it agrees with real simulated matches.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { act, MATCH_LENGTHS, newMatch, seededRng } from '../js/engine.js';
import { cpuChoice } from '../js/ai.js';
import { POSSESSION, winFromPossession, winProbability } from '../js/winprob.js';
import { stateAt } from './helpers.mjs';

test('possession outcomes are a probability distribution', () => {
  const total = Object.values(POSSESSION).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(total - 1) < 1e-3, `sums to ${total}`);
});

test('chances are probabilities that add up to one, from every score', () => {
  for (const length of Object.keys(MATCH_LENGTHS)) {
    const { half, full } = MATCH_LENGTHS[length];
    for (let a = 0; a < full; a += 2) {
      for (let b = 0; b < full; b += 3) {
        for (const h of [1, 2]) {
          if (h === 1 && (a >= half || b >= half)) continue;
          for (const attacker of [0, 1]) {
            for (const firstReceiver of [0, 1]) {
              const m = stateAt({ scores: [a, b], half: h, attacker, length, firstReceiver });
              const p0 = winFromPossession(m, 0);
              const p1 = winFromPossession(m, 1);
              assert.ok(p0 >= 0 && p0 <= 1, `${length} ${a}-${b}`);
              assert.ok(Math.abs(p0 + p1 - 1) < 1e-9, `${length} ${a}-${b} half ${h}: ${p0} + ${p1}`);
            }
          }
        }
      }
    }
  }
});

test('more points and the ball never make it less likely you win', () => {
  for (let a = 0; a < 29; a++) {
    for (let b = 0; b < 30; b++) {
      const m = stateAt({ scores: [a, b], half: 2, attacker: 0 });
      const more = stateAt({ scores: [a + 1, b], half: 2, attacker: 0 });
      assert.ok(winFromPossession(more, 0) >= winFromPossession(m, 0) - 1e-12, `${a}-${b}`);
      const theirBall = stateAt({ scores: [a, b], half: 2, attacker: 1 });
      assert.ok(winFromPossession(m, 0) >= winFromPossession(theirBall, 0), `${a}-${b}: having the ball helps`);
    }
  }
  // At 0-0 the first ball is worth almost nothing, because the other side
  // receives the second-half kick-off (the simulation below agrees).
  const kickoff = stateAt({ scores: [0, 0], attacker: 0 });
  const p = winFromPossession(kickoff, 0);
  assert.ok(Math.abs(p - 0.5) < 0.03, `${p}`);
  // But with the second-half kick-off as well, it is an edge.
  assert.ok(winFromPossession(stateAt({ scores: [0, 0], attacker: 0, firstReceiver: 1 }), 0) > p);
});

test('special moments: full time, half time, a try roll, a kick', () => {
  const ft = stateAt({ step: { type: 'fulltime' }, scores: [30, 10], half: 2 });
  ft.winner = 0;
  assert.equal(winProbability(ft, 0), 1);
  assert.equal(winProbability(ft, 1), 0);
  const fresh = newMatch();
  assert.equal(winProbability(fresh, 0), 0.5, 'before the toss');
  const ht = stateAt({ step: { type: 'halftime' }, scores: [15, 10], firstReceiver: 0 });
  // Team 1 receives the second half.
  assert.ok(Math.abs(winProbability(ht, 0) - winFromPossession({ ...ht, half: 2 }, 0, 1)) < 0.02);
  // Through on a try: better than just having the ball.
  const tryRoll = stateAt({ step: { type: 'roll', purpose: 'try', dice: ['K'], team: 0, carrier: 'W', videos: 0 }, scores: [10, 10] });
  assert.ok(winProbability(tryRoll, 0) > winFromPossession(tryRoll, 0));
  // A kick that wins the match is worth its chance of going over, and more.
  const kick = stateAt({ step: { type: 'roll', purpose: 'kick', dice: ['K'], team: 0, kick: 'penalty', range: 1 }, scores: [27, 20], half: 2 });
  assert.ok(winProbability(kick, 0) >= 5 / 6);
  for (const m of [tryRoll, kick, ht]) assert.ok(Math.abs(winProbability(m, 0) + winProbability(m, 1) - 1) < 1e-9);
});

test('the model agrees with simulated matches from the kick-off and from a lead', () => {
  const runs = 1500;
  const play = (setup, seed) => {
    const rng = seededRng(seed);
    let m = setup();
    while (m.step.type !== 'fulltime') {
      const s = m.step;
      const a = s.type === 'roll' ? { type: 'roll' } : s.type === 'halftime' ? { type: 'continue' } : { type: 'choose', value: cpuChoice({ ...m, cpuLevel: 'pro' }, rng) };
      m = act(m, a, rng).state;
    }
    return m.winner;
  };
  // The receiving side at 0-0.
  let wins = 0;
  for (let i = 0; i < runs; i++) {
    const winner = play(() => {
      const m = newMatch({ mode: '2p' });
      return act(m, { type: 'choose', value: 'heads' }, () => 0.2).state; // heads: team 0 receives
    }, 7000 + i);
    if (winner === 0) wins++;
  }
  const kickoff = act(newMatch({ mode: '2p' }), { type: 'choose', value: 'heads' }, () => 0.2).state;
  assert.ok(Math.abs(wins / runs - winProbability(kickoff, 0)) < 0.04, `receivers won ${wins / runs}, model says ${winProbability(kickoff, 0)}`);

  // 10 points up in the second half, their ball.
  wins = 0;
  const lead = () => stateAt({ scores: [18, 8], half: 2, attacker: 1, step: { type: 'roll', purpose: 'attack', dice: ['S'], team: 1 } });
  for (let i = 0; i < runs; i++) if (play(lead, 9000 + i) === 0) wins++;
  assert.ok(Math.abs(wins / runs - winProbability(lead(), 0)) < 0.04, `leaders won ${wins / runs}, model says ${winProbability(lead(), 0)}`);
});
