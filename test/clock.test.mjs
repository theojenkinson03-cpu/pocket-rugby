// The rolls format: a match clock of dice rolls, last plays, draws and
// sudden death. Also the restart after a score, the Fly Half's drop goals,
// and an online decision that runs out of time.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { act, DECISION_SECONDS, FORMATS, halfRolls, isLegal, MATCH_LENGTHS, migrate, newMatch, rollsLeft, seededRng, TIMED_DECISIONS, timeUp } from '../js/engine.js';
import { cpuChoice } from '../js/ai.js';
import { possessionsLeft, winFromPossession, winProbability } from '../js/winprob.js';
import { choose, dice, faceOf, roll, stateAt } from './helpers.mjs';

const KNOCK_ON = faceOf('F', f => f.error === 'knockon');
const TO_FORWARD = faceOf('S', f => f.to === 'F');
const HIT_UP_5 = faceOf('F', f => f.kind === 'run' && f.value === 5);
const TACKLE_3 = faceOf('D', f => f.value === 3);
const TACKLE_1 = faceOf('D', f => f.value === 1);
const TRY = faceOf('K', f => f.result === 'try');
const NO_TRY = faceOf('K', f => f.result === 'notry');
const SCRUM_WIN = faceOf('R', f => f.scrum === 'win' && f.lineout === 'win');
const PENALTY_WON = faceOf('R', f => f.penalty === 'won');

// A match on the clock with `left` rolls to go in the half.
const onClock = (left, opts = {}) => {
  const m = stateAt({ format: 'rolls', length: 'quick', ...opts });
  m.clock = halfRolls(m) - left;
  return m;
};

test('two formats; the clock lengths; a rolls match counts every roll', () => {
  assert.deepEqual(FORMATS, ['points', 'rolls']);
  assert.deepEqual(Object.values(MATCH_LENGTHS).map(l => l.rolls), [60, 100, 160]);
  const m = newMatch({ mode: '2p', length: 'quick', format: 'rolls' });
  assert.deepEqual([m.format, m.rolls, m.clock, m.lastPlay, m.suddenDeath, m.decider], ['rolls', 0, 0, false, false, false]);
  assert.equal(halfRolls(m), 30);
  assert.equal(rollsLeft(m), 30);
  assert.equal(newMatch({ format: 'nonsense' }).format, 'points');
  assert.equal(rollsLeft(newMatch()), null, 'no clock in a points match');
  // Choices don't use the clock; rolls do, one per roll whatever the dice.
  let s = act(m, { type: 'choose', value: 'heads' }, seededRng(3)).state;
  assert.equal(s.clock, 0);
  s = roll(s, dice(TO_FORWARD)).state;
  s = roll(s, dice(HIT_UP_5)).state;
  s = roll(s, dice(TACKLE_1, TACKLE_1)).state;
  assert.deepEqual([s.rolls, s.clock, rollsLeft(s)], [3, 3, 27]);
});

test('when the clock runs out with the ball alive, play goes on: last play', () => {
  const m = onClock(1, { step: { type: 'roll', purpose: 'attack', dice: ['F'], team: 0 }, carrier: 'F' });
  const { state, events } = roll(m, dice(HIT_UP_5));
  assert.ok(timeUp(state));
  assert.equal(state.lastPlay, true);
  assert.deepEqual(events.at(-1), { type: 'lastPlay', half: 1 });
  assert.equal(state.step.purpose, 'tackle', 'the tackle is still to come');
  // The tackle is made: next phase, still alive, and no second last-play call.
  const on = roll(state, dice(TACKLE_3, TACKLE_3));
  assert.equal(on.state.step.purpose, 'attack');
  assert.ok(!on.events.some(e => e.type === 'lastPlay'));
  // A knock on kills the ball: half time, before any scrum.
  let s = roll(on.state, dice(TO_FORWARD)).state;
  const dead = roll(s, dice(KNOCK_ON));
  assert.equal(dead.state.step.type, 'halftime');
  assert.deepEqual(dead.events.slice(-1), [{ type: 'halftime' }]);
  // The second half starts the clock again from the top.
  const second = act(dead.state, { type: 'continue' }).state;
  assert.deepEqual([second.half, second.clock, second.lastPlay], [2, 0, false]);
  assert.equal(second.attacker, 1, 'the other side receives the second half');
});

test('the ball goes dead with the clock out: a turnover, a missed kick, a won set piece, a score', () => {
  // No try: changeover, so full time.
  const noTry = onClock(0, { half: 2, step: { type: 'roll', purpose: 'try', dice: ['K'], team: 0, carrier: 'F', videos: 0 } });
  noTry.lastPlay = true;
  noTry.teams[1].score = 3;
  const lost = roll(noTry, dice(NO_TRY));
  assert.equal(lost.state.step.type, 'fulltime');
  assert.equal(lost.state.winner, 1);
  // A try on the last play: the conversion is still taken, then the whistle.
  const tryIt = onClock(0, { half: 2, scores: [0, 7], step: { type: 'roll', purpose: 'try', dice: ['K'], team: 0, carrier: 'F', videos: 0 } });
  tryIt.lastPlay = true;
  let s = roll(tryIt, dice(TRY)).state;
  assert.equal(s.step.purpose, 'range', 'the conversion comes after the hooter');
  s = roll(s, dice(TACKLE_1)).state;
  const conv = roll(s, dice(faceOf('K', f => f.kick >= 1)));
  assert.equal(conv.state.step.type, 'fulltime');
  assert.equal(conv.state.winner, null, '7-7: a draw');
  assert.deepEqual(conv.events.at(-1), { type: 'fulltime', winner: null, draw: true });
  // A scrum that would restart play: the ball is dead, so it's over.
  const scrum = onClock(0, { half: 2, scores: [5, 0], step: { type: 'roll', purpose: 'attack', dice: ['F'], team: 0 }, carrier: 'F' });
  scrum.lastPlay = true;
  const ko = roll(scrum, dice(KNOCK_ON));
  assert.equal(ko.state.step.type, 'fulltime');
  assert.equal(ko.state.winner, 0);
  assert.ok(!ko.events.some(e => e.type === 'setPiece'));
});

test('a penalty on the last play may still be kicked at goal or tapped', () => {
  const m = onClock(0, { half: 2, scores: [3, 5], step: { type: 'roll', purpose: 'setpiece', dice: ['R'], team: 0, piece: 'scrum' } });
  m.lastPlay = true;
  let s = roll(m, dice(PENALTY_WON)).state;
  assert.equal(s.step.purpose, 'penalty');
  s = roll(s, dice(0, TACKLE_1)).state;
  assert.deepEqual(s.step.options, ['kick', 'tap']);
  // Kicked: in or out, that's the end.
  const kicked = choose(s, 'kick').state;
  const over = roll(kicked, dice(faceOf('K', f => f.kick >= 1)));
  assert.equal(over.state.step.type, 'fulltime');
  assert.equal(over.state.winner, 0, '6-5');
  // Tapped: play goes on.
  const tapped = choose(s, 'tap').state;
  assert.equal(tapped.step.purpose, 'attack');
  assert.equal(tapped.step.team, 0);
});

test('a knockout drawn on the clock goes to sudden death: the next score wins', () => {
  const m = onClock(0, { half: 2, scores: [7, 7], decider: true, firstReceiver: 1, step: { type: 'roll', purpose: 'try', dice: ['K'], team: 0, carrier: 'F', videos: 0 } });
  m.lastPlay = true;
  const { state, events } = roll(m, dice(NO_TRY));
  assert.ok(events.some(e => e.type === 'suddenDeath'));
  assert.equal(state.suddenDeath, true);
  assert.equal(state.step.type, 'roll');
  assert.equal(state.attacker, 1, 'the side that received the first kick-off has the ball');
  assert.equal(timeUp(state), false, 'no clock in sudden death');
  // A try wins it at once: no conversion.
  const breakState = { ...structuredClone(state), step: { type: 'roll', purpose: 'try', dice: ['K'], team: 1, carrier: 'W', videos: 0 } };
  const won = roll(breakState, dice(TRY));
  assert.equal(won.state.step.type, 'fulltime');
  assert.equal(won.state.winner, 1);
  assert.deepEqual(won.state.teams.map(t => t.score), [7, 12]);
  // A penalty goal wins it too.
  const pen = { ...structuredClone(state), step: { type: 'roll', purpose: 'kick', dice: ['K'], team: 0, kick: 'penalty', range: 1, kicker: 'B' } };
  assert.equal(roll(pen, dice(0)).state.winner, 0);
  // Not a knockout: the draw stands.
  const league = onClock(0, { half: 2, scores: [7, 7], step: { type: 'roll', purpose: 'try', dice: ['K'], team: 0, carrier: 'F', videos: 0 } });
  league.lastPlay = true;
  assert.equal(roll(league, dice(NO_TRY)).state.winner, null);
});

test('points never end a match on the clock, and half time waits for the clock', () => {
  const m = onClock(10, { half: 1, scores: [9, 0], step: { type: 'roll', purpose: 'kick', dice: ['K'], team: 0, kick: 'penalty', range: 1, kicker: 'B' } });
  const s = roll(m, dice(0)).state;
  assert.equal(s.teams[0].score, 12, 'past the points format\'s half-time mark');
  assert.equal(s.step.type, 'roll', 'play goes on');
  const late = onClock(10, { half: 2, scores: [40, 0], step: { type: 'roll', purpose: 'kick', dice: ['K'], team: 0, kick: 'penalty', range: 1, kicker: 'B' } });
  assert.equal(roll(late, dice(0)).state.step.type, 'roll', 'no target score on the clock');
});

test('after any score the side that conceded has the ball', () => {
  for (const format of FORMATS) {
    const m = stateAt({ format, step: { type: 'roll', purpose: 'kick', dice: ['K'], team: 0, kick: 'penalty', range: 1, kicker: 'B' } });
    const { state, events } = roll(m, dice(0));
    assert.equal(state.attacker, 1, format);
    assert.deepEqual(events.find(e => e.type === 'possession'), { type: 'possession', team: 1, reason: 'restart', changed: true });
  }
});

test('the Fly Half takes every drop goal: the Centre gives the chance to them', () => {
  const m = stateAt({ step: { type: 'roll', purpose: 'attack', dice: ['C'], team: 0 }, carrier: 'C' });
  const { state, events } = roll(m, dice(faceOf('C', f => f.kind === 'drop')));
  assert.equal(state.carrier, 'B');
  assert.deepEqual(events.find(e => e.type === 'dropChance'), { type: 'dropChance', team: 0, pos: 'B', from: 'C' });
  assert.equal(state.teams[0].players.C.passes, 1, 'the Centre passes it back');
  let s = roll(state, dice(TACKLE_1)).state;
  assert.equal(s.step.from, 'B');
  s = choose(s, 'kick').state;
  assert.equal(s.step.kicker, 'B');
  const kick = roll(s, dice(0));
  assert.equal(kick.state.teams[0].players.B.points, 3);
  // Passing instead: the Fly Half picks a receiver.
  const passed = choose(roll(state, dice(TACKLE_1)).state, 'pass').state;
  assert.deepEqual([passed.step.from, passed.step.options], ['B', ['F', 'C', 'W']]);
  // The Fly Half's own drop-goal face: no pass needed.
  const own = roll(stateAt({ step: { type: 'roll', purpose: 'attack', dice: ['B'], team: 0 }, carrier: 'B' }), dice(faceOf('B', f => f.kind === 'drop')));
  assert.deepEqual(own.events.find(e => e.type === 'dropChance'), { type: 'dropChance', team: 0, pos: 'B' });
});

test('online: a decision that runs out of time gives the other side a penalty', () => {
  assert.equal(DECISION_SECONDS, 10);
  assert.deepEqual(TIMED_DECISIONS, ['pass', 'drop', 'penalty', 'bench']);
  const pass = stateAt({ step: { type: 'choose', purpose: 'pass', team: 0, from: 'F', options: ['C', 'W', 'B'] }, carrier: 'F' });
  assert.ok(isLegal(pass, { type: 'timeout' }));
  const { state, events } = act(pass, { type: 'timeout' }, dice());
  assert.deepEqual(events.map(e => e.type), ['timeout', 'penalty']);
  assert.deepEqual([state.step.purpose, state.step.team, state.attacker], ['penalty', 1, 1]);
  assert.equal(state.teams[0].stats.penaltiesConceded, 1);
  // Not for rolls, the toss or the draft: those are picked for you.
  assert.ok(!isLegal(stateAt(), { type: 'timeout' }));
  assert.ok(!isLegal(newMatch(), { type: 'timeout' }));
  const draft = stateAt({ step: { type: 'choose', purpose: 'draft', team: 0, options: ['jackal', 'fortress'], pick: 3 } });
  assert.ok(!isLegal(draft, { type: 'timeout' }));
});

test('older saved matches load as points matches', () => {
  const old = stateAt();
  old.version = 5;
  for (const key of ['format', 'decider', 'rolls', 'clock', 'lastPlay', 'suddenDeath']) delete old[key];
  delete old.target.rolls;
  const m = migrate(old);
  assert.deepEqual([m.format, m.decider, m.rolls, m.clock, m.lastPlay, m.suddenDeath, m.target.rolls], ['points', false, 0, 0, false, false, 100]);
});

test('the CPU on the clock: late on, three points only if they draw or win it', () => {
  const pen = (scores, left, half = 2) => {
    const m = onClock(left, { half, scores, step: { type: 'choose', purpose: 'penalty', team: 0, range: 2, options: ['kick', 'tap'] } });
    return cpuChoice({ ...m, cpuLevel: 'pro' });
  };
  assert.equal(pen([0, 7], 2), 'tap', 'seven down at the end: go for the try');
  assert.equal(pen([0, 3], 2), 'kick', 'three down: the kick draws it');
  assert.equal(pen([5, 3], 2), 'kick', 'ahead: take the points');
  assert.equal(pen([0, 7], 30, 1), 'kick', 'early on, the points are worth having');
  // Sudden death: any score wins.
  const sd = onClock(0, { half: 2, scores: [7, 7], decider: true, step: { type: 'choose', purpose: 'penalty', team: 0, range: 5, options: ['kick', 'tap'] } });
  sd.suddenDeath = true;
  assert.equal(cpuChoice({ ...sd, cpuLevel: 'pro' }), 'kick');
});

test('the win model on the clock: probabilities, more points help, the end is the end', () => {
  for (const half of [1, 2]) {
    for (const left of [0, 5, 15, 30]) {
      for (let d = -14; d <= 14; d += 7) {
        const m = onClock(left, { half, scores: [Math.max(0, d), Math.max(0, -d)] });
        if (left === 0 && half === 2) m.lastPlay = true;
        const p0 = winFromPossession(m, 0);
        const p1 = winFromPossession(m, 1);
        assert.ok(p0 >= 0 && p0 <= 1);
        assert.ok(Math.abs(p0 + p1 - 1) < 1e-9, `half ${half} left ${left} lead ${d}: ${p0} + ${p1}`);
        const ahead = onClock(left, { half, scores: [Math.max(0, d) + 3, Math.max(0, -d)] });
        assert.ok(winFromPossession(ahead, 0) >= p0 - 1e-12, 'more points never hurt');
      }
    }
  }
  // Time running out: a lead counts for more.
  const early = onClock(30, { half: 1, scores: [7, 0], attacker: 1 });
  const late = onClock(2, { half: 2, scores: [7, 0], attacker: 1 });
  assert.ok(winFromPossession(late, 0) > winFromPossession(early, 0));
  assert.ok(possessionsLeft(early) > possessionsLeft(late));
  // Last play, 3 down, their ball: about the chance they don't score...
  const last = onClock(0, { half: 2, scores: [0, 3], attacker: 1 });
  last.lastPlay = true;
  assert.equal(winFromPossession(last, 0), 0, 'they have the last ball and the lead');
  // A draw at full time is half a win.
  const drawn = onClock(0, { half: 2, scores: [7, 7], step: { type: 'fulltime' } });
  drawn.winner = null;
  assert.equal(winProbability(drawn, 0), 0.5);
});

test('the model on the clock agrees with simulated matches from the kick-off', () => {
  const N = 600;
  let wins = 0;
  let predicted = 0;
  for (let g = 0; g < N; g++) {
    const rng = seededRng(900 + g);
    let m = newMatch({ mode: '2p', length: 'quick', format: 'rolls' });
    m = act(m, { type: 'choose', value: 'heads' }, rng).state;
    // Give side 0 a 5-point start.
    m.teams[0].score = 5;
    predicted += winProbability(m, 0);
    while (m.step.type !== 'fulltime') {
      const s = m.step;
      const a = s.type === 'roll' ? { type: 'roll' } : s.type === 'halftime' ? { type: 'continue' } : { type: 'choose', value: cpuChoice({ ...m, cpuLevel: 'pro' }, rng) };
      m = act(m, a, rng).state;
    }
    wins += m.winner === null ? 0.5 : m.winner === 0 ? 1 : 0;
  }
  assert.ok(Math.abs(wins / N - predicted / N) < 0.06, `model ${(predicted / N).toFixed(3)} vs played ${(wins / N).toFixed(3)}`);
});
