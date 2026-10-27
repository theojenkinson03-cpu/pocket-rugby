// The CPU: always legal, Pro follows the odds, styles lean the way they
// say, and Expert plays out the options before it chooses.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { act, kickChance, newMatch, receiverOdds, seededRng, tryChance } from '../js/engine.js';
import { cardValue, cpuChoice, cpuChoiceAsync, evaluateOptions, expertChoice, LEVELS, PERSONALITIES, suggestedChoice } from '../js/ai.js';
import { CARD_IDS } from '../js/cards.js';
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

// ---- Expert and personalities -------------------------------------------------


const withStyle = (m, cpuLevel, cpuPersonality) => Object.assign(m, { cpuLevel, cpuPersonality });

test('three levels and four styles, each described', () => {
  assert.deepEqual(Object.keys(LEVELS), ['rookie', 'pro', 'expert']);
  assert.deepEqual(Object.keys(PERSONALITIES), ['balanced', 'boot', 'run', 'pack']);
  for (const p of Object.values(PERSONALITIES)) assert.ok(p.name && p.blurb && p.dropAt > 0 && p.penaltyAt <= 1);
});

test('styles: Boot it kicks long, Run it taps unless it is a sitter', () => {
  const at = (range, style) => withStyle(penaltyAt(range), 'pro', style);
  // From 50 m a kick lands 2 times in 6; from 30 m, 4 in 6; from 20 m, 5 in 6.
  assert.equal(cpuChoice(at(5, 'boot')), 'kick');
  assert.equal(cpuChoice(at(5, 'balanced')), 'tap');
  assert.equal(cpuChoice(at(2, 'run')), 'kick', '5 in 6');
  assert.equal(cpuChoice(at(3, 'run')), 'tap', '4 in 6');
  assert.equal(cpuChoice(at(3, 'balanced')), 'kick');
  assert.equal(cpuChoice(at(4, 'balanced')), 'kick', 'evens');
  // Every style takes three points that win the match.
  for (const style of Object.keys(PERSONALITIES)) assert.equal(cpuChoice(withStyle(penaltyAt(4, [0, 27]), 'pro', style)), 'kick', style);
});

test('styles lean towards their players when the odds are close', () => {
  const picks = { balanced: {}, run: {}, pack: {}, boot: {} };
  for (const from of OUTSIDE_BACKS) {
    for (const [sinBin, yellows] of [[false, 0], [true, 1], [false, 2]]) {
      for (const quickTap of [0, 2]) {
        for (const injured of [null, 'F', 'W']) {
          const options = OUTSIDE_BACKS.filter(p => p !== from);
          const m = stateAt({ step: { type: 'choose', purpose: 'pass', team: 1, from, options }, attacker: 1, carrier: from, quickTap, sinBin: [sinBin, false], yellows: [yellows, 0], injuries: [{}, injured ? { [injured]: 1 } : {}] });
          for (const style of Object.keys(picks)) {
            const pick = cpuChoice(withStyle({ ...m }, 'pro', style));
            picks[style][pick] = (picks[style][pick] || 0) + 1;
          }
        }
      }
    }
  }
  assert.ok((picks.pack.F || 0) > (picks.balanced.F || 0), `Forwards: ${JSON.stringify(picks.pack)}`);
  assert.ok((picks.run.W || 0) > (picks.balanced.W || 0), `Run it: ${JSON.stringify(picks.run)}`);
  assert.ok((picks.boot.B || 0) >= (picks.balanced.B || 0), `Boot it: ${JSON.stringify(picks.boot)}`);
});

test('the draft: the best card for the style', () => {
  const draft = options => stateAt({ step: { type: 'choose', purpose: 'draft', team: 1, options, first: true }, attacker: null });
  const options = ['sure-hands', 'golden-boot', 'big-pack'];
  assert.equal(cpuChoice(withStyle(draft(options), 'pro', 'balanced')), 'sure-hands', 'the strongest card');
  assert.equal(cpuChoice(withStyle(draft(options), 'pro', 'boot')), 'golden-boot');
  assert.equal(cpuChoice(withStyle(draft(options), 'pro', 'pack')), 'big-pack');
  assert.equal(cpuChoice(withStyle(draft(options), 'expert', 'boot')), 'sure-hands', 'Expert drafts on value alone');
  for (const id of CARD_IDS) assert.ok(cardValue(id) > 0);
  // Every pair of options, every style: always one of them.
  for (const a of CARD_IDS) {
    for (const b of CARD_IDS) {
      if (a === b) continue;
      for (const style of Object.keys(PERSONALITIES)) assert.ok([a, b].includes(cpuChoice(withStyle(draft([a, b]), 'pro', style))));
    }
  }
});

test('Expert: always a legal choice, the same one for the same position, and it takes the winning kick', async () => {
  const rng = seededRng(5);
  let m = newMatch({ mode: '1p', length: 'quick', cards: true, cpuLevel: 'expert' });
  let decisions = 0;
  while (m.step.type !== 'fulltime' && decisions < 25) {
    const s = m.step;
    let action;
    if (s.type === 'roll') action = { type: 'roll' };
    else if (s.type === 'halftime') action = { type: 'continue' };
    else {
      const value = expertChoice(withStyle({ ...m }, 'expert', 'balanced'), { rollouts: 40 });
      assert.ok(s.options.includes(value), `${s.purpose}: ${value}`);
      assert.equal(expertChoice({ ...m, cpuLevel: 'expert' }, { rollouts: 40 }), value, 'repeatable');
      if (s.purpose !== 'toss') assert.equal(await cpuChoiceAsync({ ...m, cpuLevel: 'expert' }), expertChoice({ ...m, cpuLevel: 'expert' }));
      decisions++;
      action = { type: 'choose', value };
    }
    m = act(m, action, rng).state;
  }
  assert.ok(decisions >= 5);
  // Three points from a 5-in-6 kick wins it.
  const winner = withStyle(penaltyAt(1, [0, 27]), 'expert', 'balanced');
  assert.equal(expertChoice(winner, { rollouts: 60 }), 'kick');
});

test('Expert measures each option on the same dice and reports win chances', () => {
  const m = withStyle(stateAt({ step: { type: 'choose', purpose: 'drop', team: 1, range: 1, from: 'B', options: ['kick', 'pass'] }, attacker: 1, carrier: 'B', scores: [10, 28], half: 2 }), 'expert', 'balanced');
  const gen = evaluateOptions(m, 30, 3);
  let next = gen.next();
  let steps = 0;
  while (!next.done) {
    steps++;
    assert.equal(next.value, steps);
    next = gen.next();
  }
  assert.equal(steps, 30);
  const [kick, pass] = next.value;
  for (const p of [kick, pass]) assert.ok(p >= 0 && p <= 1);
  assert.ok(kick > pass, 'a 5-in-6 drop goal to win beats passing it on');
});
