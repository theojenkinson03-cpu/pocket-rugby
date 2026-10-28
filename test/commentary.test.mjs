// Commentary: every event reads properly and the numbers in it are right.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { metres, narrate, scoreLine } from '../js/commentary.js';
import { BROKEN_TEXT, stateAt } from './helpers.mjs';

const match = (named = false) => {
  const m = stateAt({ scores: [12, 7] });
  m.teams[0].name = 'Ravens';
  m.teams[1].name = 'Foxes';
  m.teams[0].cards = [{ id: 'golden-boot', rarity: 'common' }, { id: 'big-pack', rarity: 'common' }];
  m.teams[1].cards = [{ id: 'jackal', rarity: 'common' }];
  if (named) m.teams[0].roster = { S: 'T. Harris', F: 'J. Lowe', C: 'A. Price', W: 'K. Webb', B: 'M. Shaw' };
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
  // Team cards.
  { type: 'deal', cards: ['sure-hands', 'jackal', 'golden-boot', 'fortress', 'clinical'], first: 1 },
  { type: 'draft', team: 1, card: 'jackal', rarity: 'common', pick: 0, last: false },
  { type: 'draft', team: 0, card: 'golden-boot', rarity: 'rare', pick: 3, last: true },
  { type: 'discard', card: 'clinical', rarity: 'common' },
  // The clock and the timer.
  { type: 'lastPlay', half: 1 },
  { type: 'lastPlay', half: 2 },
  { type: 'fulltime', winner: null, draw: true },
  { type: 'suddenDeath' },
  { type: 'timeout', team: 1, purpose: 'penalty' },
  { type: 'possession', team: 1, reason: 'restart' },
  { type: 'dropChance', team: 0, pos: 'B', from: 'C' },
  ...['knockon', 'touch', 'intercept', 'dropChance', 'ruck', 'heldUp', 'noTry', 'penalty', 'reset', 'notstraight', 'advantage', 'mystery']
    .map(what => ({ type: 'cardPlayed', team: 0, card: 'golden-boot', what })),
  { type: 'run', team: 0, pos: 'F', label: 'Line Break', value: 6, quickTap: 0, card: 2, fortress: 0, injury: 0, intensity: 8, special: true, ruck: false },
  { type: 'run', team: 0, pos: 'W', label: 'Into the Corner', value: 8, quickTap: 1, card: 0, fortress: 2, injury: 1, intensity: 6, special: true, ruck: false },
  { type: 'tackle', team: 1, pos: 'F', outcome: 'tackle', total: 7, values: [4, 3], need: 5, modifier: 0, bonus: 1 },
  { type: 'range', team: 0, kick: 'penalty', range: 5, bonus: 2, chance: 4 / 6 },
  { type: 'kick', team: 0, kick: 'conversion', range: 5, distance: 6, rolled: 4, bonus: 2, good: true, kicker: 'B' },
  { type: 'kick', team: 0, kick: 'drop', range: 3, distance: 2, rolled: 2, bonus: 0, good: false, kicker: 'C' },
];

test('every event type has clean commentary', () => {
  for (const event of EVERY_EVENT) {
    for (let i = 0; i < 20; i++) {
      const story = narrate([event], match(i % 2 === 1));
      const all = [...story.lines.map(l => l.text), story.headline, story.detail, ...story.moments.flatMap(m => [m.title, m.sub])].filter(Boolean);
      for (const text of all) assert.doesNotMatch(text, BROKEN_TEXT, `${event.type}: "${text}"`);
      if (!['possession', 'score', 'secondHalf', 'fulltime', 'injury', 'card', 'noCard', 'quickTap', 'advantageOver',
        'dropAttempt', 'dropDeclined', 'penaltyAttempt', 'halftime', 'discard'].includes(event.type)) {
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

test('the toss welcomes everyone to the ground, and says when it is neutral', () => {
  const toss = { type: 'toss', call: 'heads', result: 'tails', caller: 0, winner: 1 };
  const m = match();
  assert.ok(!narrate([toss], m).lines.some(l => /Welcome/.test(l.text)), 'no ground, no welcome');
  m.venue = { name: 'Thomond Park', neutral: false };
  assert.equal(narrate([toss], m).lines[0].text, 'Welcome to Thomond Park.');
  m.venue = { name: 'Stade de France', neutral: true };
  assert.match(narrate([toss], m).lines[0].text, /^Welcome to Stade de France, a neutral ground/);
});

test('a penalty headline says whether there was a card', () => {
  const noCard = narrate([{ type: 'noCard', team: 1 }, { type: 'range', team: 0, kick: 'penalty', range: 2, chance: 5 / 6 }], match());
  assert.match(noCard.detail, /^No card\./);
  const yellow = narrate([{ type: 'card', team: 1, color: 'yellow', modifier: -1 }, { type: 'range', team: 0, kick: 'penalty', range: 2, chance: 5 / 6 }], match());
  assert.match(yellow.detail, /^Yellow card for Foxes\./);
});

test('run headlines explain quick tap, injuries and the ruck chance', () => {
  const m = match();
  const run = { type: 'run', team: 0, pos: 'F', label: 'Hit Up', value: 4, quickTap: 1, card: 0, fortress: 0, injury: 1, intensity: 4, special: false, ruck: true };
  const story = narrate([run], m);
  assert.match(story.detail, /\(4 \+1 advantage, −1 injury\)/);
  assert.match(story.detail, /ruck contest/);
  const plain = narrate([{ ...run, quickTap: 0, injury: 0, ruck: false }], m);
  assert.doesNotMatch(plain.detail, /\(/, 'no notes when nothing changed the number');
  assert.doesNotMatch(plain.detail, /ruck/);
});

test('players are named when their side has a roster', () => {
  const named = match(true);
  const run = narrate([{ type: 'run', team: 0, pos: 'W', label: 'Hit Up', value: 4, quickTap: 0, card: 0, fortress: 0, injury: 0, intensity: 4, special: false, ruck: false }], named);
  assert.match(run.lines[0].text, /Webb/);
  const tryStory = narrate([{ type: 'try', team: 0, pos: 'C' }], named);
  assert.match(tryStory.lines[0].text, /Price/);
  assert.equal(tryStory.moments[0].player, 'A. Price');
  // The other side has no roster: their positions, by team name.
  const tackle = narrate([{ type: 'tackle', team: 1, pos: 'F', outcome: 'bighit', total: 6, values: [1, 5], need: 8, modifier: 0 }], named);
  assert.match(tackle.lines[0].text, /Foxes Forward|the Foxes Forward/);
});

test('cards in the commentary: the draft, a card at work, and its numbers', () => {
  const m = match();
  const five = ['sure-hands', 'jackal', 'golden-boot', 'fortress', 'clinical'];
  const deal = narrate([{ type: 'deal', cards: five, first: 1 }], m);
  assert.match(deal.detail, /^Foxes pick first\. Two cards each; the last one left is discarded\.$/);
  assert.match(deal.lines[0].text, /^Five team cards are dealt\. Foxes lost the toss, so they pick first and fourth; Ravens pick second and third\.$/);
  m.step = { type: 'choose', purpose: 'draft', team: 0, options: five.slice(1), pick: 1 };
  const first = narrate([{ type: 'draft', team: 1, card: 'jackal', rarity: 'common', pick: 0, last: false }], m);
  assert.equal(first.headline, 'Foxes: Jackal');
  assert.equal(first.detail, 'Ravens to pick.');
  assert.match(first.lines[0].text, /^Foxes take Jackal: A Big Hit on either die contests the ruck against Hit Ups up to 5, and VIDEO REF also wins it\.$/);
  const epic = narrate([{ type: 'draft', team: 1, card: 'jackal', rarity: 'epic', pick: 0, last: false }], m);
  assert.match(epic.lines[0].text, /^Foxes take Jackal \(Epic\): .*big moves too/);
  // A Mythic in the deal is news, with a scene of its own.
  assert.equal(deal.moments.length, 0);
  const mythic = narrate([{ type: 'deal', cards: five, rarity: { 'sure-hands': 'common', jackal: 'mythic', 'golden-boot': 'rare', fortress: 'common', clinical: 'common' }, first: 1 }], m);
  assert.equal(mythic.headline, 'Mythic card!');
  assert.match(mythic.lines[0].text, /One of them is MYTHIC!/);
  assert.deepEqual([mythic.moments[0].kind, mythic.moments[0].cards, mythic.moments[0].team], ['mythic', ['jackal'], 1]);
  const two = narrate([{ type: 'deal', cards: five, rarity: { 'sure-hands': 'mythic', jackal: 'mythic', 'golden-boot': 'rare' }, first: 0 }], m);
  assert.match(two.lines[0].text, /2 of them are MYTHIC!/);
  assert.equal(first.moments.length, 0, 'the scene waits for the last pick');
  const last = narrate([{ type: 'draft', team: 1, card: 'golden-boot', rarity: 'rare', pick: 3, last: true }, { type: 'discard', card: 'clinical', rarity: 'epic' }], m);
  assert.equal(last.moments[0].kind, 'draft');
  assert.equal(last.detail, 'Both sides have their two cards. Kick-off!');
  assert.equal(last.lines[1].text, 'Clinical Finisher (Epic) is left over and goes back in the pack.');
  const play = narrate([{ type: 'cardPlayed', team: 1, card: 'jackal', rarity: 'rare', what: 'ruck', result: 'video' }], m);
  assert.match(play.lines[0].text, /^Jackal! Foxes win the ruck on the video ref\.$/);
  assert.deepEqual([play.moments[0].kind, play.moments[0].card, play.moments[0].rarity], ['cardplay', 'jackal', 'rare']);
  assert.match(narrate([{ type: 'cardPlayed', team: 1, card: 'jackal', rarity: 'mythic', what: 'ruck', result: 'try' }], m).lines[0].text, /win the ruck on a TRY roll\.$/);
  assert.match(narrate([{ type: 'cardPlayed', team: 0, card: 'set-piece-kings', what: 'advantage', runs: 3 }], m).lines[0].text, /\+1 on the next 3 runs\.$/);
  assert.match(narrate([{ type: 'cardPlayed', team: 0, card: 'set-piece-kings', what: 'advantage', runs: 1 }], m).lines[0].text, /\+1 on the next run\.$/);
  assert.match(narrate([{ type: 'cardPlayed', team: 0, card: 'set-piece-kings', what: 'steal' }], m).lines[0].text, /steal the other side's ball/);
  assert.match(narrate([{ type: 'cardPlayed', team: 0, card: 'set-piece-kings', what: 'ownFeed' }], m).lines[0].text, /hold on to their own ball/);
  m.teams[1].cards = [{ id: 'jackal', rarity: 'common' }, { id: 'fortress', rarity: 'common' }];
  const run = narrate([{ type: 'run', team: 0, pos: 'W', label: 'Into the Corner', value: 8, quickTap: 1, card: 0, fortress: 2, injury: 1, intensity: 6, special: true, ruck: false }], m);
  assert.match(run.detail, /\(8 \+1 advantage, −2 Fortress, −1 injury\)/);
  m.teams[1].cards = [{ id: 'rush-defence', rarity: 'common' }];
  const tackle = narrate([{ type: 'tackle', team: 1, pos: 'F', outcome: 'tackle', total: 7, values: [4, 3], need: 5, modifier: 0, bonus: [1, 0] }], m);
  assert.match(tackle.detail, /7 \(3 \+ 3, \+1 Rush Defence\) vs 5/);
  const both = narrate([{ type: 'tackle', team: 1, pos: 'F', outcome: 'tackle', total: 8, values: [4, 4], need: 5, modifier: 0, bonus: [1, 1] }], m);
  assert.match(both.detail, /8 \(3 \+ 3, \+2 Rush Defence\) vs 5/);
  const kick = narrate([{ type: 'kick', team: 0, kick: 'conversion', range: 5, distance: 6, rolled: 4, bonus: 2, good: true, kicker: 'B' }], m);
  assert.match(kick.detail, /Struck 60 m \(40 m \+20 m Golden Boot\), needed 50 m/);
  const range = narrate([{ type: 'range', team: 0, kick: 'penalty', range: 5, bonus: 2, chance: 4 / 6 }], m);
  assert.match(range.detail, /with 20 m from Golden Boot: 67% chance/);
  // Two cards on the same kick are both named.
  m.teams[0].cards = [{ id: 'golden-boot', rarity: 'common' }, { id: 'up-and-under', rarity: 'rare' }];
  const twoKick = narrate([{ type: 'kick', team: 0, kick: 'penalty', range: 5, distance: 7, rolled: 4, bonus: 3, card: 3, wind: 0, good: true, kicker: 'B' }], m);
  assert.match(twoKick.detail, /\+30 m Golden Boot and Up and Under/);
});

test('the clock, draws, sudden death and running out of time', () => {
  const m = match();
  assert.match(narrate([{ type: 'lastPlay', half: 1 }], m).lines[0].text, /last play! The next time the ball goes dead it's half time\.$/);
  const last = narrate([{ type: 'lastPlay', half: 2 }], m);
  assert.match(last.lines[0].text, /full time\.$/);
  assert.equal(last.moments[0].kind, 'lastplay');
  const draw = narrate([{ type: 'fulltime', winner: null, draw: true }], m);
  assert.equal(draw.lines[0].text, "FULL TIME! It's a draw. Ravens 12–7 Foxes.");
  assert.equal(draw.moments[0].team, null);
  const sudden = narrate([{ type: 'suddenDeath' }], m);
  assert.equal(sudden.headline, 'Sudden death');
  assert.equal(sudden.moments[0].kind, 'suddendeath');
  const late = narrate([{ type: 'timeout', team: 0, purpose: 'pass' }, { type: 'penalty', team: 1, offender: 0 }], m);
  assert.equal(late.lines[0].text, 'Ravens ran out of time to decide. Penalty to Foxes!');
  // A Centre's drop-goal face gives the Fly Half the chance.
  const named = match(true);
  assert.equal(narrate([{ type: 'dropChance', team: 0, pos: 'B', from: 'C' }], named).lines[0].text, 'Price (Centre) gives it back to Shaw (Fly Half) in the pocket. Drop goal on?');
  assert.equal(narrate([{ type: 'possession', team: 1, reason: 'restart' }], m).lines[0].text, 'Foxes take the restart. Scrum Half to play.');
});
