// The coach: one tip the first time each part of the game comes up, never
// on the CPU's turn (except to explain something that just happened).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { act, newMatch, seededRng } from '../js/engine.js';
import { cpuChoice } from '../js/ai.js';
import { tipFor, tipText, TIPS } from '../js/coach.js';
import { BROKEN_TEXT, stateAt } from './helpers.mjs';

const at = step => stateAt({ step });

test('every tip has a title and words to read', () => {
  for (const [id, tip] of Object.entries(TIPS)) {
    assert.ok(tip.title, id);
    if (id !== 'card-played') assert.ok(tip.text.length > 40 && tip.text.endsWith('.'), id);
  }
});

test('each step has its tip, once', () => {
  const cases = [
    [{ type: 'choose', purpose: 'toss', team: 0, options: ['heads', 'tails'] }, 'toss'],
    [{ type: 'choose', purpose: 'draft', team: 0, options: ['a', 'b', 'c'], first: true }, 'draft'],
    [{ type: 'roll', purpose: 'attack', dice: ['S'], team: 0 }, 'scrum-half'],
    [{ type: 'roll', purpose: 'attack', dice: ['W'], team: 0 }, 'runner'],
    [{ type: 'choose', purpose: 'pass', team: 0, from: 'F', options: ['C', 'W', 'B'] }, 'pass'],
    [{ type: 'roll', purpose: 'tackle', dice: ['D', 'D'], team: 0 }, 'tackle'],
    [{ type: 'roll', purpose: 'try', dice: ['K'], team: 0 }, 'try'],
    [{ type: 'roll', purpose: 'range', dice: ['D'], team: 0, kick: 'conversion' }, 'conversion'],
    [{ type: 'roll', purpose: 'range', dice: ['D'], team: 0, kick: 'drop' }, 'drop-range'],
    [{ type: 'roll', purpose: 'kick', dice: ['K'], team: 0, kick: 'penalty', range: 3 }, 'kick'],
    [{ type: 'choose', purpose: 'drop', team: 0, range: 2, options: ['kick', 'pass'] }, 'drop'],
    [{ type: 'roll', purpose: 'penalty', dice: ['K', 'D'], team: 0 }, 'penalty'],
    [{ type: 'choose', purpose: 'penalty', team: 0, range: 2, options: ['kick', 'tap'] }, 'penalty-choice'],
    [{ type: 'roll', purpose: 'setpiece', dice: ['R'], team: 0, piece: 'scrum' }, 'setpiece'],
    [{ type: 'roll', purpose: 'ruck', dice: ['K'], team: 0 }, 'ruck'],
    [{ type: 'halftime' }, 'halftime'],
  ];
  for (const [step, id] of cases) {
    assert.equal(tipFor(at(step), [], [], true), id, step.purpose || step.type);
    assert.equal(tipFor(at(step), [], [id], true), null, `${id} only once`);
    if (step.type !== 'halftime') assert.equal(tipFor(at(step), [], [], false), null, `${id}: not on the CPU's turn`);
  }
  assert.equal(tipFor(at({ type: 'fulltime' }), [], [], true), null);
});

test('something that just happened is explained first, even on the CPU\'s turn', () => {
  const m = at({ type: 'roll', purpose: 'try', dice: ['K'], team: 1 });
  const events = [{ type: 'tackle' }, { type: 'lineBreak', team: 1 }];
  assert.equal(tipFor(m, events, [], false), 'line-break');
  assert.equal(tipFor(m, events, ['line-break'], true), 'try');
  for (const [type, id] of [['card', 'sin-bin'], ['injury', 'injury'], ['cardPlayed', 'card-played'], ['quickTap', 'quick-tap']]) {
    assert.equal(tipFor(m, [{ type }], [], false), id);
  }
});

test('the card-played tip says which card did what', () => {
  const m = stateAt();
  m.teams[1].name = 'Gulls';
  const tip = tipText('card-played', [{ type: 'cardPlayed', team: 1, card: 'sure-hands', what: 'touch' }], m);
  assert.match(tip.text, /^Gulls' Sure Hands: Your Outside Backs never lose it/);
  m.teams[1].name = 'Japan';
  assert.match(tipText('card-played', [{ type: 'cardPlayed', team: 1, card: 'jackal', what: 'ruck' }], m).text, /^Japan's Jackal/);
  assert.equal(tipText('tackle', [], m), TIPS.tackle);
});

test('a guided match meets most of the tips, each exactly once', () => {
  const seen = [];
  const rng = seededRng(21);
  let m = newMatch({ mode: '1p', length: 'quick', cards: true, cpuLevel: 'rookie' });
  let events = [];
  for (let guard = 0; m.step.type !== 'fulltime' && guard < 3000; guard++) {
    const human = m.controllers[m.step.team ?? 0] === 'human';
    const id = tipFor(m, events, seen, human);
    if (id) {
      assert.ok(!seen.includes(id), `${id} twice`);
      const tip = tipText(id, events, m);
      assert.doesNotMatch(`${tip.title} ${tip.text}`, BROKEN_TEXT);
      seen.push(id);
    }
    const s = m.step;
    const a = s.type === 'roll' ? { type: 'roll' } : s.type === 'halftime' ? { type: 'continue' } : { type: 'choose', value: cpuChoice({ ...m, cpuLevel: 'pro' }, rng) };
    ({ state: m, events } = act(m, a, rng));
  }
  assert.ok(seen.length >= 10, `${seen.length} tips: ${seen.join(', ')}`);
  for (const id of ['toss', 'scrum-half', 'runner', 'tackle']) assert.ok(seen.includes(id), id);
});
