// Statistics: the engine's dice are fair and the odds shown to players are
// what actually happens over many rolls.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { act, breakChance, kickChance, newMatch, receiverOdds, seededRng, tryChance } from '../js/engine.js';
import { cpuChoice } from '../js/ai.js';
import { DICE } from '../js/dice.js';
import { stateAt } from './helpers.mjs';

// Within `sigmas` standard errors of the expected proportion.
function close(observed, expected, n, sigmas = 4.5, label = '') {
  const se = Math.sqrt((expected * (1 - expected)) / n) || 1 / n;
  assert.ok(Math.abs(observed - expected) <= sigmas * se + 1e-9, `${label}: observed ${observed.toFixed(4)} expected ${expected.toFixed(4)} (n=${n})`);
}

test('every die is fair: each face comes up a sixth of the time', () => {
  const rng = seededRng(42);
  const n = 60000;
  for (const die of Object.keys(DICE)) {
    const counts = [0, 0, 0, 0, 0, 0];
    let m = stateAt({ step: { type: 'roll', purpose: 'attack', dice: ['S'], team: 0 } });
    for (let i = 0; i < n / 6; i++) {
      // Roll through the engine so its own die-rolling is what's measured.
      const step = die === 'D' ? { type: 'roll', purpose: 'range', dice: ['D'], team: 0, kick: 'conversion' }
        : die === 'K' ? { type: 'roll', purpose: 'ruck', dice: ['K'], team: 1 }
          : die === 'R' ? { type: 'roll', purpose: 'setpiece', dice: ['R'], team: 1, piece: 'scrum' }
            : { type: 'roll', purpose: 'attack', dice: [die], team: 0 };
      m = stateAt({ step, carrier: ['D', 'K', 'R'].includes(die) ? 'S' : die });
      counts[act(m, { type: 'roll' }, rng).state.roll.faces[0]]++;
    }
    const expected = n / 6 / 6;
    const chi2 = counts.reduce((sum, c) => sum + (c - expected) ** 2 / expected, 0);
    assert.ok(chi2 < 20.5, `${die} chi-square ${chi2.toFixed(2)} (5 dof, p<0.001 cut-off 20.5): ${counts}`);
  }
});

test('line breaks happen as often as the shown break chance', () => {
  const rng = seededRng(7);
  for (const [intensity, perDie, ruck] of [[3, 0, true], [4, 0, true], [5, 0, false], [6, 0, false], [7, 0, false], [8, 0, false], [5, -1, false], [6, -2, false], [4, -2, true]]) {
    const n = 12000;
    let breaks = 0;
    const yellows = perDie === -2 ? 2 : perDie === -1 ? 1 : 0;
    const base = stateAt({
      step: { type: 'roll', purpose: 'tackle', dice: ['D', 'D'], team: 1, intensity, carrier: 'F', ruck },
      carrier: 'F',
      sinBin: [false, perDie === -1],
      yellows: [0, yellows],
    });
    for (let i = 0; i < n; i++) if (act(base, { type: 'roll' }, rng).state.step.purpose === 'try') breaks++;
    close(breaks / n, breakChance(intensity, perDie, ruck), n, 4.5, `intensity ${intensity} per die ${perDie}`);
  }
});

test('tries land as often as the try chance, video refs included', () => {
  const rng = seededRng(9);
  const n = 30000;
  let tries = 0;
  for (let i = 0; i < n; i++) {
    let m = stateAt({ step: { type: 'roll', purpose: 'try', dice: ['K'], team: 0, carrier: 'W', videos: 0 } });
    while (m.step.purpose === 'try') m = act(m, { type: 'roll' }, rng).state;
    if (m.teams[0].score === 5) tries++;
  }
  close(tries / n, tryChance(), n, 4.5, 'try chance');
});

test('kicks land as often as the kick chance for every range', () => {
  const rng = seededRng(11);
  for (let range = 1; range <= 5; range++) {
    const n = 12000;
    let good = 0;
    const m = stateAt({ step: { type: 'roll', purpose: 'kick', dice: ['K'], team: 0, kick: 'penalty', range } });
    for (let i = 0; i < n; i++) if (act(m, { type: 'roll' }, rng).state.teams[0].score === 3) good++;
    close(good / n, kickChance(range), n, 4.5, `range ${range}`);
  }
});

test("each receiver's shown break and error chances match a long run of their die", () => {
  const rng = seededRng(13);
  for (const pos of ['F', 'C', 'W', 'B']) {
    const n = 20000;
    let breaks = 0;
    let errors = 0;
    const base = stateAt({ carrier: pos });
    const odds = receiverOdds(base, 0, pos);
    for (let i = 0; i < n; i++) {
      let m = act(base, { type: 'roll' }, rng).state;
      if (m.step.purpose === 'setpiece' || m.attacker === 1) errors++;
      if (m.step.purpose === 'tackle') {
        m = act(m, { type: 'roll' }, rng).state;
        if (m.step.purpose === 'try') breaks++;
      }
    }
    close(breaks / n, odds.lineBreak, n, 4.5, `${pos} break`);
    close(errors / n, odds.error, n, 4.5, `${pos} error`);
  }
});

test('whole-match balance stays in a sensible range', () => {
  const n = 600;
  let firstReceiverWins = 0;
  let tries = 0;
  let actions = 0;
  for (let g = 0; g < n; g++) {
    const rng = seededRng(5000 + g);
    let m = newMatch({ mode: '2p' });
    while (m.step.type !== 'fulltime') {
      const action = m.step.type === 'roll' ? { type: 'roll' } : m.step.type === 'halftime' ? { type: 'continue' } : { type: 'choose', value: cpuChoice(m, rng) };
      m = act(m, action, rng).state;
      actions++;
    }
    if (m.winner === m.firstReceiver) firstReceiverWins++;
    tries += m.teams[0].stats.tries + m.teams[1].stats.tries;
  }
  const rate = firstReceiverWins / n;
  assert.ok(rate > 0.42 && rate < 0.58, `receiving first is no big advantage (${rate})`);
  assert.ok(tries / n > 3.5 && tries / n < 8, `tries per match ${tries / n}`);
  assert.ok(actions / n > 120 && actions / n < 350, `actions per match ${actions / n}`);
});
