// Commentary: every event reads properly and the numbers in it are right.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { metres, narrate, scoreLine } from '../js/commentary.js';
import { BROKEN_TEXT, stateAt } from './helpers.mjs';

const match = () => {
  const m = stateAt({ scores: [12, 7] });
  m.teams[0].name = 'Ravens';
  m.teams[1].name = 'Foxes';
  return m;
};

const EVERY_EVENT = [
  { type: 'toss', call: 'heads', result: 'tails', caller: 0, winner: 1 },
  { type: 'possession', team: 0, reason: 'kickoff' },
  { type: 'run', team: 0, pos: 'F', label: 'Hit Up', value: 5, intensity: 5, special: false, ruck: false },
  { type: 'run', team: 0, pos: 'W', label: 'Into the Corner', value: 8, intensity: 8, special: true, ruck: false },
  { type: 'run', team: 0, pos: 'S', label: 'Hit Up', value: 4, intensity: 4, special: false, ruck: true },
  { type: 'pass', team: 0, from: 'S', to: 'W' },
  { type: 'pass', team: 0, from: 'F', to: 'C', chosen: true },
  { type: 'passChoice', team: 0, pos: 'F' },
  { type: 'dropChance', team: 0, pos: 'B' },
  { type: 'error', team: 0, pos: 'W', error: 'knockon', piece: 'scrum' },
  { type: 'error', team: 0, pos: 'B', error: 'touch', piece: 'lineout' },
  { type: 'intercept', team: 1, from: 0, pos: 'C' },
  { type: 'tackle', team: 1, pos: 'F', outcome: 'tackle', total: 6, values: [3, 3], need: 5, modifier: 0 },
  { type: 'tackle', team: 1, pos: 'F', outcome: 'bighit', total: 6, values: [1, 5], need: 8, modifier: 0 },
  { type: 'tackle', team: 1, pos: 'S', outcome: 'ruck', total: 6, values: [5, 1], need: 4, modifier: 0 },
  { type: 'lineBreak', team: 0, pos: 'C', total: 4, values: [2, 2], need: 7, modifier: -1 },
  { type: 'injury', team: 0, pos: 'F', penalty: 1 },
  { type: 'ruck', team: 1, won: true },
  { type: 'ruck', team: 1, won: false },
  { type: 'videoRef', team: 0, pos: 'W' },
  { type: 'try', team: 0, pos: 'W' },
  { type: 'noTry', team: 0, pos: 'W', heldUp: true },
  { type: 'noTry', team: 0, pos: 'W', heldUp: false },
  { type: 'range', team: 0, kick: 'conversion', range: 3, chance: 4 / 6 },
  { type: 'range', team: 0, kick: 'drop', range: 2, chance: 5 / 6 },
  { type: 'range', team: 0, kick: 'penalty', range: 5, chance: 2 / 6 },
  { type: 'dropAttempt', team: 0, pos: 'B', range: 2 },
  { type: 'dropDeclined', team: 0, pos: 'B' },
  { type: 'penaltyAttempt', team: 0, range: 3 },
  ...['conversion', 'penalty', 'drop'].flatMap(kick => [
    { type: 'kick', team: 0, kick, range: 3, distance: 4, good: true },
    { type: 'kick', team: 0, kick, range: 3, distance: 2, good: false },
  ]),
  ...['scrum', 'lineout'].flatMap(piece => ['win', 'lose', 'reset', 'notstraight', 'penaltyWon', 'penaltyAgainst']
    .filter(o => !(piece === 'scrum' && o === 'notstraight') && !(piece === 'lineout' && o === 'reset'))
    .map(outcome => ({ type: 'setPiece', team: 1, piece, outcome }))),
  { type: 'penalty', team: 0, offender: 1 },
  { type: 'card', team: 1, color: 'yellow', modifier: -1 },
  { type: 'card', team: 1, color: 'red', modifier: -2 },
  { type: 'noCard', team: 1 },
  { type: 'quickTap', team: 0 },
  { type: 'advantageOver', team: 0 },
  { type: 'score', team: 0, points: 5, kind: 'try', score: [17, 7] },
  { type: 'halftime' },
  { type: 'secondHalf' },
  { type: 'fulltime', winner: 0 },
];

test('every event type has clean commentary', () => {
  for (const event of EVERY_EVENT) {
    for (let i = 0; i < 20; i++) {
      const story = narrate([event], match());
      const all = [...story.lines.map(l => l.text), story.headline, story.detail, ...story.moments.flatMap(m => [m.title, m.sub])].filter(Boolean);
      for (const text of all) assert.doesNotMatch(text, BROKEN_TEXT, `${event.type}: "${text}"`);
      if (!['possession', 'score', 'secondHalf', 'fulltime', 'injury', 'card', 'noCard', 'quickTap', 'advantageOver',
        'dropAttempt', 'dropDeclined', 'penaltyAttempt', 'halftime'].includes(event.type)) {
        assert.ok(story.headline, `${event.type} sets a headline`);
      }
    }
  }
});

test('tackle sums show the dice as rolled and the card penalty', () => {
  const story = narrate([{ type: 'lineBreak', team: 0, pos: 'C', total: 4, values: [2, 2], need: 7, modifier: -1 }], match());
  assert.match(story.detail, /4 \(3 \+ 3, −1 each for the card\)/);
  const plain = narrate([{ type: 'tackle', team: 1, pos: 'F', outcome: 'tackle', total: 7, values: [3, 4], need: 5, modifier: 0 }], match());
  assert.match(plain.detail, /7 \(3 \+ 4\) vs 5/);
});

test('names, metres and scorelines', () => {
  assert.equal(metres(3), '30 m');
  assert.equal(scoreLine(match()), 'Ravens 12–7 Foxes');
  const story = narrate([{ type: 'try', team: 1, pos: 'B' }], match());
  assert.match(story.lines[0].text, /Foxes/);
  assert.equal(story.moments[0].kind, 'try');
});

test('a penalty headline says whether there was a card', () => {
  const noCard = narrate([{ type: 'noCard', team: 1 }, { type: 'range', team: 0, kick: 'penalty', range: 2, chance: 5 / 6 }], match());
  assert.match(noCard.detail, /^No card\./);
  const yellow = narrate([{ type: 'card', team: 1, color: 'yellow', modifier: -1 }, { type: 'range', team: 0, kick: 'penalty', range: 2, chance: 5 / 6 }], match());
  assert.match(yellow.detail, /^Yellow card for Foxes\./);
});

test('run headlines explain quick tap, injuries and the ruck chance', () => {
  const m = match();
  m.quickTap = 2;
  m.teams[0].injuries.F = 1;
  const story = narrate([{ type: 'run', team: 0, pos: 'F', label: 'Hit Up', value: 4, intensity: 4, special: false, ruck: true }], m);
  assert.match(story.detail, /\+1 quick tap/);
  assert.match(story.detail, /−1 injury/);
  assert.match(story.detail, /ruck contest/);
});
