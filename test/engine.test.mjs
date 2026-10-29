import { test } from 'node:test';
import assert from 'node:assert/strict';

import { act, breakChance, defenceModifier, kickChance, newMatch, resolveTackle, seededRng, tryChance } from '../js/engine.js';
import { cpuChoice } from '../js/ai.js';
import { DICE } from '../js/dice.js';

// Feeds exact die faces (0-5) to the engine. A toss draws a raw number.
const dice = (...faces) => () => {
  if (!faces.length) throw new Error('ran out of scripted dice');
  return (faces.shift() + 0.5) / 6;
};
const face = (die, predicate) => DICE[die].faces.findIndex(predicate);
const TACKLE_1 = face('D', f => f.value === 1);
const TACKLE_3 = face('D', f => f.value === 3);
const TACKLE_4 = face('D', f => f.value === 4);
const BIG_HIT = face('D', f => f.kind === 'bighit');
const TRY = face('K', f => f.result === 'try');
const NO_TRY = face('K', f => f.result === 'notry');
const VIDEO = face('K', f => f.result === 'video');
const CARD = face('K', f => f.card);
const RUCK = face('K', f => f.result === 'ruck');

const roll = (m, rng) => act(m, { type: 'roll' }, rng);
const choose = (m, value, rng) => act(m, { type: 'choose', value }, rng);

// Toss won by team 0 (heads called, rng < 0.5 gives heads); team 0 attacks.
function kickedOff() {
  return act(newMatch({ mode: '2p' }), { type: 'choose', value: 'heads' }, () => 0.1).state;
}

// A match where team 0's Forward has just run with the given intensity.
function forwardRun(value) {
  let m = kickedOff();
  m = roll(m, dice(face('S', f => f.to === 'F'))).state;
  const index = face('F', f => f.kind === 'run' && f.value === value);
  return roll(m, dice(index)).state;
}

test('toss winner receives and the Scrum Half plays first', () => {
  const m = kickedOff();
  assert.equal(m.attacker, 0);
  assert.equal(m.firstReceiver, 0);
  assert.deepEqual(m.step, { type: 'roll', purpose: 'attack', dice: ['S'], team: 0 });
});

test('losing the toss hands the kick-off reception to the other team', () => {
  const { state } = act(newMatch(), { type: 'choose', value: 'tails' }, () => 0.1);
  assert.equal(state.attacker, 1);
});

test('a Scrum Half pass goes to the named player', () => {
  const { state, events } = roll(kickedOff(), dice(face('S', f => f.to === 'W')));
  assert.equal(state.carrier, 'W');
  assert.deepEqual(state.step.dice, ['W']);
  assert.ok(events.some(e => e.type === 'pass' && e.to === 'W'));
});

test('an open pass lets the attacker pick any outside player but themselves', () => {
  let m = roll(kickedOff(), dice(face('S', f => f.to === 'F'))).state;
  m = roll(m, dice(face('F', f => f.kind === 'pass'))).state;
  assert.equal(m.step.purpose, 'pass');
  assert.deepEqual(m.step.options, ['C', 'W', 'B']);
  m = choose(m, 'W').state;
  assert.equal(m.carrier, 'W');
});

test('a hit up asks the defence for two dice against its intensity', () => {
  const m = forwardRun(5);
  assert.equal(m.step.purpose, 'tackle');
  assert.equal(m.step.team, 1);
  assert.equal(m.step.intensity, 5);
});

test('a tackle total that matches the intensity stops the runner', () => {
  const { state, events } = roll(forwardRun(5), dice(TACKLE_1, TACKLE_4));
  assert.ok(events.some(e => e.type === 'tackle' && e.total === 5));
  assert.equal(state.step.purpose, 'attack');
  assert.equal(state.carrier, 'S');
  assert.equal(state.phase, 2);
});

test('falling short of the intensity is a line break and a try roll', () => {
  const { state, events } = roll(forwardRun(5), dice(TACKLE_1, TACKLE_3));
  assert.ok(events.some(e => e.type === 'lineBreak'));
  assert.equal(state.step.purpose, 'try');
  assert.equal(state.step.team, 0);
});

test('Big Hit on the first die against a low hit up starts a ruck contest', () => {
  assert.equal(resolveTackle(BIG_HIT, TACKLE_1, 4, 0).outcome, 'ruck');
  assert.equal(resolveTackle(BIG_HIT, TACKLE_1, 5, 0).outcome, 'tackle');
});

test('Big Hit on the second die always completes the tackle', () => {
  assert.equal(resolveTackle(TACKLE_1, BIG_HIT, 8, -2).outcome, 'bighit');
});

test('two Big Hits injure the ball carrier for the rest of the match', () => {
  const { state, events } = roll(forwardRun(5), dice(BIG_HIT, BIG_HIT));
  assert.ok(events.some(e => e.type === 'injury' && e.pos === 'F'));
  assert.equal(state.teams[0].injuries.F, 1);
  // The injured Forward now runs one lower.
  let m = roll(state, dice(face('S', f => f.to === 'F'))).state;
  m = roll(m, dice(face('F', f => f.kind === 'run' && f.value === 5))).state;
  assert.equal(m.step.intensity, 4);
});

test('winning the ruck turns the ball over', () => {
  let m = kickedOff();
  m = roll(m, dice(face('S', f => f.kind === 'run'))).state; // Hit Up 4
  m = roll(m, dice(BIG_HIT, TACKLE_1)).state;
  assert.equal(m.step.purpose, 'ruck');
  const lost = roll(m, dice(TRY)).state;
  assert.equal(lost.attacker, 0);
  const won = roll(m, dice(RUCK)).state;
  assert.equal(won.attacker, 1);
});

test('a try scores five, video ref re-rolls, and the conversion follows', () => {
  let m = roll(forwardRun(5), dice(TACKLE_1, TACKLE_1)).state;
  m = roll(m, dice(VIDEO)).state;
  assert.equal(m.step.purpose, 'try');
  m = roll(m, dice(TRY)).state;
  assert.equal(m.teams[0].score, 5);
  assert.equal(m.step.purpose, 'range');
  m = roll(m, dice(TACKLE_3)).state; // range 3
  assert.equal(m.step.purpose, 'kick');
  const { state, events } = roll(m, dice(face('K', f => f.kick === 3)));
  assert.equal(state.teams[0].score, 7);
  // The side that conceded kicks off; caught, the scorers have the ball.
  assert.ok(events.some(e => e.type === 'kick' && e.good));
  assert.deepEqual(state.step, { type: 'roll', purpose: 'restart', dice: ['K'], team: 1, receiver: 0 });
  const caught = roll(state, dice(face('K', f => f.kick === 1)));
  assert.equal(caught.state.attacker, 0);
  assert.equal(caught.events.find(e => e.type === 'possession').reason, 'restart');
  assert.equal(roll(state, dice(face('K', f => f.kick === 6))).state.attacker, 1, 'won back');
});

test('no try is a changeover', () => {
  let m = roll(forwardRun(5), dice(TACKLE_1, TACKLE_1)).state;
  m = roll(m, dice(NO_TRY)).state;
  assert.equal(m.attacker, 1);
  assert.equal(m.teams[0].score, 0);
});

test('a knock on gives the defence the scrum feed', () => {
  let m = roll(kickedOff(), dice(face('S', f => f.to === 'F'))).state;
  m = roll(m, dice(face('F', f => f.error === 'knockon'))).state;
  assert.equal(m.step.purpose, 'setpiece');
  assert.equal(m.step.piece, 'scrum');
  assert.equal(m.step.team, 1);
  const reset = roll(m, dice(face('R', f => f.scrum === 'reset'))).state;
  assert.deepEqual(reset.step, m.step);
  const won = roll(m, dice(face('R', f => f.scrum === 'win' && f.lineout === 'win'))).state;
  assert.equal(won.attacker, 1);
});

test('a lineout not straight hands the throw to the other side', () => {
  let m = roll(kickedOff(), dice(face('S', f => f.to === 'W'))).state;
  m = roll(m, dice(face('W', f => f.error === 'touch'))).state;
  assert.equal(m.step.piece, 'lineout');
  assert.equal(m.step.team, 1);
  m = roll(m, dice(face('R', f => f.lineout === 'notstraight'))).state;
  assert.equal(m.step.team, 0);
});

test('a penalty checks for a card, then offers a kick or a quick tap', () => {
  let m = roll(kickedOff(), dice(face('S', f => f.to === 'F'))).state;
  m = roll(m, dice(face('F', f => f.error === 'knockon'))).state;
  m = roll(m, dice(face('R', f => f.penalty === 'against'))).state; // team 1 fed, so team 0 gets it
  assert.equal(m.step.purpose, 'penalty');
  assert.equal(m.step.team, 0);
  m = roll(m, dice(CARD, TACKLE_4)).state;
  assert.equal(m.teams[1].sinBin, true);
  assert.equal(m.step.purpose, 'penalty');
  assert.equal(m.step.range, 4);

  const kicked = choose(m, 'kick').state;
  const good = roll(kicked, dice(face('K', f => f.kick === 6))).state;
  assert.equal(good.teams[0].score, 3);
  const missed = roll(kicked, dice(face('K', f => f.kick === 2))).state;
  assert.equal(missed.teams[0].score, 0);
  assert.equal(missed.attacker, 1);
});

test('a quick tap adds one to intensity until three tackles are made', () => {
  let m = roll(kickedOff(), dice(face('S', f => f.to === 'F'))).state;
  m = roll(m, dice(face('F', f => f.error === 'knockon'))).state;
  m = roll(m, dice(face('R', f => f.penalty === 'against'))).state;
  m = roll(m, dice(TRY, TACKLE_4)).state;
  m = choose(m, 'tap').state;
  assert.equal(m.quickTap, 3);
  for (let i = 0; i < 3; i++) {
    m = roll(m, dice(face('S', f => f.kind === 'run'))).state;
    assert.equal(m.step.intensity, 5);
    m = roll(m, dice(TACKLE_4, TACKLE_4)).state;
  }
  assert.equal(m.quickTap, 0);
  m = roll(m, dice(face('S', f => f.kind === 'run'))).state;
  assert.equal(m.step.intensity, 4);
});

test('yellow card weakens tackles for the half, a second costs two for the match', () => {
  const m = newMatch();
  m.teams[1].sinBin = true;
  m.teams[1].yellows = 1;
  assert.equal(defenceModifier(m, 1), -1);
  m.step = { type: 'halftime' };
  m.firstReceiver = 0;
  const second = act(m, { type: 'continue' }).state;
  assert.equal(second.teams[1].sinBin, false);
  assert.equal(defenceModifier(second, 1), 0);
  assert.equal(second.attacker, 1, 'the side that did not receive first starts the second half');

  second.teams[1].yellows = 2;
  assert.equal(defenceModifier(second, 1), -2);
});

test('half time comes at 15 and full time ends the match at 30', () => {
  let m = roll(forwardRun(5), dice(TACKLE_1, TACKLE_1)).state;
  m.teams[0].score = 10;
  m = roll(m, dice(TRY)).state;
  assert.equal(m.teams[0].score, 15);
  m = roll(m, dice(TACKLE_3)).state;
  m = roll(m, dice(face('K', f => f.kick === 1))).state; // missed conversion
  assert.equal(m.step.type, 'halftime');

  let late = roll(forwardRun(5), dice(TACKLE_1, TACKLE_1)).state;
  late.half = 2;
  late.teams[0].score = 26;
  late = roll(late, dice(TRY)).state;
  assert.equal(late.step.type, 'fulltime');
  assert.equal(late.winner, 0);
});

test('odds helpers agree with the dice', () => {
  assert.equal(kickChance(1), 1);
  assert.equal(kickChance(6), 1 / 6);
  assert.ok(Math.abs(tryChance() - 0.6) < 1e-9);
  assert.ok(breakChance(3) < breakChance(5));
  assert.ok(breakChance(5, -1) > breakChance(5, 0));
});

test('illegal actions are refused', () => {
  assert.throws(() => act(kickedOff(), { type: 'choose', value: 'kick' }));
});

test('hundreds of CPU matches all finish with a winner on the target', () => {
  for (let g = 0; g < 300; g++) {
    const rng = seededRng(g + 7);
    let m = newMatch({ mode: '2p', length: 'quick', cpuLevel: g % 2 ? 'pro' : 'rookie' });
    let guard = 0;
    while (m.step.type !== 'fulltime') {
      const action = m.step.type === 'roll' ? { type: 'roll' }
        : m.step.type === 'halftime' ? { type: 'continue' }
          : { type: 'choose', value: cpuChoice(m, rng) };
      m = act(m, action, rng).state;
      assert.ok(++guard < 4000, 'match did not end');
    }
    assert.ok(m.teams[m.winner].score >= m.target.full);
    assert.ok(m.teams[1 - m.winner].score < m.target.full);
    assert.equal(m.half, 2);
  }
});
