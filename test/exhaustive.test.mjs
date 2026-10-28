// Every face of every die, every pair of tackle dice, every kick, every set
// piece and every score threshold, checked against the rules-sheet reading in
// helpers.mjs. Nothing here is sampled: all combinations are played.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { act, breakChance, kickChance, MATCH_LENGTHS, QUICK_TAP_RUNS, receiverOdds, resolveTackle } from '../js/engine.js';
import { DICE, POSITIONS } from '../js/dice.js';
import { choose, dice, expectedAfterScore, faceOf, OUTSIDE_BACKS, roll, RULES, stateAt } from './helpers.mjs';

const range6 = [0, 1, 2, 3, 4, 5];
const YELLOW_STATES = [
  { name: 'no card', sinBin: false, yellows: 0, perDie: 0 },
  { name: 'sin bin', sinBin: true, yellows: 1, perDie: -1 },
  { name: 'first-half yellow served', sinBin: false, yellows: 1, perDie: 0 },
  { name: 'red (two yellows)', sinBin: false, yellows: 2, perDie: -2 },
];

test('every positional face, with and without quick tap and injuries', () => {
  let cases = 0;
  for (const pos of POSITIONS) {
    for (const [faceIndex, face] of DICE[pos].faces.entries()) {
      for (const quickTap of [0, 1, QUICK_TAP_RUNS]) {
        for (const injury of [0, 1, 2, 6]) {
          const before = stateAt({ carrier: pos, quickTap, injuries: [{ [pos]: injury }, {}] });
          const { state: m, events } = roll(before, dice(faceIndex));
          const label = `${pos} face ${faceIndex} (${face.label}) qt=${quickTap} inj=${injury}`;
          assert.deepEqual(m.roll, { dice: [pos], faces: [faceIndex], purpose: 'attack', team: 0 }, label);

          switch (face.kind) {
            case 'run': {
              const intensity = RULES.intensity(face.value, { quickTap, injury });
              assert.equal(m.step.purpose, 'tackle', label);
              assert.equal(m.step.team, 1, `${label}: the other side tackles`);
              assert.equal(m.step.intensity, intensity, label);
              assert.equal(m.step.carrier, pos, label);
              assert.equal(m.step.ruck, !face.special && intensity <= 4, `${label}: ruck only off a low Hit Up`);
              assert.equal(m.teams[0].stats.runs, 1, label);
              assert.equal(m.quickTap, quickTap, `${label}: running does not use up quick tap`);
              break;
            }
            case 'pass':
              if (face.to) {
                assert.equal(m.carrier, face.to, label);
                assert.deepEqual(m.step, { type: 'roll', purpose: 'attack', dice: [face.to], team: 0 }, label);
              } else {
                assert.equal(m.step.purpose, 'pass', label);
                assert.deepEqual(m.step.options, OUTSIDE_BACKS.filter(p => p !== pos), `${label}: any outside player but the passer`);
              }
              break;
            case 'drop':
              assert.ok(RULES.dropGoalKickers.includes(pos), label);
              assert.deepEqual(m.step, { type: 'roll', purpose: 'range', dice: ['D'], team: 0, kick: 'drop' }, `${label}: range first`);
              break;
            case 'error':
              assert.equal(m.step.purpose, 'setpiece', label);
              assert.equal(m.step.piece, face.error === 'knockon' ? 'scrum' : 'lineout', label);
              assert.equal(m.step.team, 1, `${label}: the defending side feeds or throws`);
              assert.equal(m.quickTap, 0, `${label}: an error ends quick tap`);
              assert.equal(m.teams[0].stats.errors, 1, label);
              break;
            case 'intercept':
              assert.equal(m.attacker, 1, label);
              assert.deepEqual(m.step, { type: 'roll', purpose: 'attack', dice: ['S'], team: 1 }, `${label}: Scrum Half after a turnover`);
              assert.equal(m.quickTap, 0, label);
              assert.equal(m.teams[1].stats.turnoversWon, 1, label);
              break;
            default:
              assert.fail(`unknown face kind ${face.kind}`);
          }
          assert.ok(events.length > 0, `${label}: something is said`);
          cases++;
        }
      }
    }
  }
  assert.equal(cases, 5 * 6 * 3 * 4);
});

test('resolveTackle agrees with the rules for all 36 dice pairs at every intensity and card state', () => {
  let cases = 0;
  for (const a of range6) {
    for (const b of range6) {
      for (let intensity = 1; intensity <= 10; intensity++) {
        for (const { perDie } of YELLOW_STATES) {
          for (const plainHitUp of [true, false]) {
            const want = RULES.tackle(a, b, intensity, { perDie, plainHitUp });
            const got = resolveTackle(a, b, intensity, perDie, plainHitUp && intensity <= 4);
            const outcome = got.outcome === 'bighit' ? 'tackle' : got.outcome;
            assert.equal(outcome, want.result, `dice ${a},${b} vs ${intensity} perDie ${perDie} hitUp ${plainHitUp}`);
            assert.equal(got.injury, want.injury);
            assert.equal(got.total, DICE.D.faces[a].value + DICE.D.faces[b].value + 2 * perDie, 'the card applies to each die');
            cases++;
          }
        }
      }
    }
  }
  assert.equal(cases, 36 * 10 * 4 * 2);
});

test('every tackle played through the engine moves the match on correctly', () => {
  let cases = 0;
  for (const a of range6) {
    for (const b of range6) {
      for (let intensity = 2; intensity <= 9; intensity++) {
        for (const ys of YELLOW_STATES) {
          for (const ruck of [true, false]) {
            for (const quickTap of [0, 1, QUICK_TAP_RUNS]) {
              const before = stateAt({
                step: { type: 'roll', purpose: 'tackle', dice: ['D', 'D'], team: 1, intensity, carrier: 'W', ruck: ruck && intensity <= 4 },
                carrier: 'W',
                phase: 4,
                quickTap,
                sinBin: [false, ys.sinBin],
                yellows: [0, ys.yellows],
              });
              const want = RULES.tackle(a, b, intensity, { perDie: ys.perDie, plainHitUp: ruck });
              const { state: m, events } = roll(before, dice(a, b));
              const label = `dice ${a},${b} vs ${intensity} ${ys.name} ruck=${ruck} qt=${quickTap}`;

              assert.equal(m.teams[0].injuries.W, want.injury ? 1 : 0, `${label}: injury`);
              assert.equal(events.some(e => e.type === 'injury'), want.injury, label);
              if (want.result === 'break') {
                assert.deepEqual(m.step, { type: 'roll', purpose: 'try', dice: ['K'], team: 0, carrier: 'W', videos: 0 }, label);
                assert.equal(m.quickTap, quickTap, `${label}: a break doesn't use up quick tap`);
                assert.equal(m.teams[0].stats.lineBreaks, 1);
                assert.equal(m.teams[1].stats.missedTackles, 1);
              } else {
                assert.equal(m.teams[1].stats.tackles, 1, label);
                assert.equal(m.quickTap, Math.max(0, quickTap - 1), `${label}: a completed tackle uses one quick-tap run`);
                assert.equal(events.some(e => e.type === 'advantageOver'), quickTap === 1, `${label}: advantage over message`);
                if (want.result === 'ruck') {
                  assert.deepEqual(m.step, { type: 'roll', purpose: 'ruck', dice: ['K'], team: 1 }, label);
                } else {
                  assert.deepEqual(m.step, { type: 'roll', purpose: 'attack', dice: ['S'], team: 0 }, `${label}: back to the Scrum Half`);
                  assert.equal(m.phase, 5, label);
                  assert.equal(m.carrier, 'S');
                }
              }
              cases++;
            }
          }
        }
      }
    }
  }
  assert.equal(cases, 36 * 8 * 4 * 2 * 3);
});

test('every ruck contest face', () => {
  for (const face of range6) {
    const before = stateAt({ step: { type: 'roll', purpose: 'ruck', dice: ['K'], team: 1 }, phase: 3, carrier: 'S' });
    const { state: m } = roll(before, dice(face));
    if (RULES.ruckWon(face)) {
      assert.equal(m.attacker, 1, `face ${face}: ruck stolen`);
      assert.equal(m.phase, 1);
      assert.equal(m.teams[1].stats.turnoversWon, 1);
    } else {
      assert.equal(m.attacker, 0, `face ${face}: "your opponent's attack continues as normal"`);
      assert.equal(m.phase, 4);
    }
    assert.deepEqual(m.step.dice, ['S']);
  }
});

test('every try roll face, early in the match and on the brink of full time', () => {
  for (const face of range6) {
    for (const [scores, half] of [[[0, 0], 1], [[12, 3], 1], [[26, 20], 2], [[25, 29], 2], [[24, 0], 2]]) {
      const before = stateAt({ step: { type: 'roll', purpose: 'try', dice: ['K'], team: 0, carrier: 'C', videos: 0 }, carrier: 'C', scores, half, quickTap: 2 });
      const { state: m } = roll(before, dice(face));
      const label = `face ${face} at ${scores}`;
      const outcome = RULES.tryRoll(face);
      if (outcome === 'try') {
        assert.equal(m.teams[0].score, scores[0] + 5, label);
        assert.equal(m.teams[0].stats.tries, 1);
        if (scores[0] + 5 >= 30) {
          assert.equal(m.step.type, 'fulltime', `${label}: reaching 30 ends it`);
          assert.equal(m.winner, 0);
        } else {
          assert.deepEqual(m.step, { type: 'roll', purpose: 'range', dice: ['D'], team: 0, kick: 'conversion' }, `${label}: conversion follows`);
          assert.equal(m.quickTap, 0);
        }
      } else if (outcome === 'reroll') {
        assert.equal(m.step.purpose, 'try', label);
        assert.equal(m.step.videos, 1);
        assert.deepEqual(m.teams.map(t => t.score), scores);
      } else {
        assert.equal(m.attacker, 1, `${label}: changeover`);
        assert.deepEqual(m.step, { type: 'roll', purpose: 'attack', dice: ['S'], team: 1 }, `${label}: "opponent restarting play with their Scrum Half"`);
        assert.deepEqual(m.teams.map(t => t.score), scores);
      }
    }
  }
});

test('video ref can be rolled again and again until a decision', () => {
  const video = faceOf('K', f => f.result === 'video');
  const tryFace = faceOf('K', f => f.result === 'try');
  let m = stateAt({ step: { type: 'roll', purpose: 'try', dice: ['K'], team: 0, carrier: 'F', videos: 0 }, carrier: 'F' });
  for (let i = 1; i <= 5; i++) {
    m = roll(m, dice(video)).state;
    assert.equal(m.step.videos, i);
  }
  m = roll(m, dice(tryFace)).state;
  assert.equal(m.teams[0].score, 5);
});

test('every conversion: all 36 range and kick pairs', () => {
  for (const r of range6) {
    for (const k of range6) {
      let m = stateAt({ step: { type: 'roll', purpose: 'range', dice: ['D'], team: 0, kick: 'conversion' }, scores: [5, 0] });
      m = roll(m, dice(r)).state;
      const range = DICE.D.faces[r].value;
      assert.deepEqual(m.step, { type: 'roll', purpose: 'kick', dice: ['K'], team: 0, kick: 'conversion', range, kicker: 'B' }, 'conversions are always kicked, by the Back');
      const { state: after, events } = roll(m, dice(k));
      const good = RULES.kickGood(r, k);
      assert.equal(after.teams[0].score, good ? 7 : 5, `range ${r} kick ${k}`);
      assert.equal(after.teams[0].stats.conversionAttempts, 1);
      assert.equal(after.teams[0].stats.conversions, good ? 1 : 0);
      assert.equal(after.attacker, 0, 'the scoring team receives, made or missed');
      assert.deepEqual(after.step.dice, ['S']);
      const kick = events.find(e => e.type === 'kick');
      assert.equal(kick.distance, DICE.K.faces[k].kick);
      assert.equal(kick.range, range);
    }
  }
});

test('every drop goal: all 36 range and kick pairs, kicked or passed', () => {
  for (const pos of RULES.dropGoalKickers) {
    for (const r of range6) {
      let m = stateAt({ carrier: pos });
      m = roll(m, dice(faceOf(pos, f => f.kind === 'drop'))).state;
      m = roll(m, dice(r)).state;
      const range = DICE.D.faces[r].value;
      assert.deepEqual(m.step, { type: 'choose', purpose: 'drop', team: 0, range, from: pos, options: ['kick', 'pass'] });

      const passed = choose(m, 'pass').state;
      assert.equal(passed.step.purpose, 'pass', '"If you feel your kicker is out of range, then you will opt to PASS"');
      assert.deepEqual(passed.step.options, OUTSIDE_BACKS.filter(p => p !== pos));
      assert.equal(passed.teams[0].stats.dropAttempts, 0);

      for (const k of range6) {
        const kicked = choose(m, 'kick').state;
        const { state: after } = roll(kicked, dice(k));
        const good = RULES.kickGood(r, k);
        assert.equal(after.teams[0].score, good ? 3 : 0, `${pos} range ${r} kick ${k}`);
        assert.equal(after.teams[0].stats.dropAttempts, 1);
        assert.equal(after.attacker, good ? 0 : 1, good ? 'scorers receive' : 'a miss hands the ball over');
      }
    }
  }
});

test('every penalty: all card and range faces, from every card history', () => {
  for (const c of range6) {
    for (const r of range6) {
      for (const ys of YELLOW_STATES) {
        const before = stateAt({
          step: { type: 'roll', purpose: 'penalty', dice: ['K', 'D'], team: 0, offender: 1 },
          sinBin: [false, ys.sinBin],
          yellows: [0, ys.yellows],
        });
        const { state: m, events } = roll(before, dice(c, r));
        const label = `card face ${c} range face ${r} from ${ys.name}`;
        const carded = RULES.yellow(c);
        const O = m.teams[1];
        assert.equal(O.yellows, ys.yellows + (carded ? 1 : 0), label);
        if (carded) {
          const card = events.find(e => e.type === 'card');
          if (ys.yellows + 1 >= 2) {
            assert.equal(card.color, 'red', `${label}: a second yellow is a red`);
            assert.equal(O.sinBin, false);
          } else {
            assert.equal(card.color, 'yellow', label);
            assert.equal(O.sinBin, true);
          }
        } else {
          assert.equal(O.sinBin, ys.sinBin, `${label}: no card leaves things as they were`);
          assert.ok(events.some(e => e.type === 'noCard'));
        }
        assert.equal(m.teams[0].yellows, 0, 'the side awarded the penalty is never carded');
        assert.deepEqual(m.step, { type: 'choose', purpose: 'penalty', team: 0, range: DICE.D.faces[r].value, options: ['kick', 'tap'] }, label);
      }
    }
  }
});

test('every penalty kick and every quick tap', () => {
  for (const r of range6) {
    const range = DICE.D.faces[r].value;
    const m = stateAt({ step: { type: 'choose', purpose: 'penalty', team: 1, range, options: ['kick', 'tap'] }, attacker: 1 });
    for (const k of range6) {
      const kicked = choose(m, 'kick').state;
      assert.deepEqual(kicked.step, { type: 'roll', purpose: 'kick', dice: ['K'], team: 1, kick: 'penalty', range, kicker: 'B' });
      const { state: after } = roll(kicked, dice(k));
      const good = DICE.K.faces[k].kick >= range;
      assert.equal(after.teams[1].score, good ? 3 : 0, `range ${range} kick ${k}`);
      assert.equal(after.teams[1].stats.penaltyAttempts, 1);
      assert.equal(after.attacker, good ? 1 : 0);
    }
    const tapped = choose(m, 'tap').state;
    assert.equal(tapped.quickTap, QUICK_TAP_RUNS);
    assert.equal(tapped.attacker, 1);
    assert.deepEqual(tapped.step, { type: 'roll', purpose: 'attack', dice: ['S'], team: 1 });
  }
});

test('every white die face at every scrum and lineout, for either feeder', () => {
  for (const piece of ['scrum', 'lineout']) {
    for (const feeder of [0, 1]) {
      for (const face of range6) {
        const before = stateAt({ step: { type: 'roll', purpose: 'setpiece', dice: ['R'], team: feeder, piece }, attacker: 1 - feeder, phase: 6, carrier: 'W' });
        const { state: m } = roll(before, dice(face));
        const want = RULES.setPiece(face, piece, feeder);
        const label = `${piece} feeder ${feeder} face ${face}`;
        if ('ball' in want) {
          assert.equal(m.attacker, want.ball, label);
          assert.deepEqual(m.step, { type: 'roll', purpose: 'attack', dice: ['S'], team: want.ball }, `${label}: "plays on as normal"`);
          assert.equal(m.phase, 1);
        } else if ('rollAgain' in want) {
          assert.deepEqual(m.step, { type: 'roll', purpose: 'setpiece', dice: ['R'], team: want.rollAgain, piece }, label);
        } else {
          assert.equal(m.step.purpose, 'penalty', label);
          assert.equal(m.step.team, want.penaltyTo, label);
          assert.equal(m.step.offender, 1 - want.penaltyTo);
          assert.equal(m.teams[1 - want.penaltyTo].stats.penaltiesConceded, 1);
        }
      }
    }
  }
});

test('a collapsed scrum is rolled until there is a result', () => {
  const reset = faceOf('R', f => f.scrum === 'reset');
  const win = faceOf('R', f => f.scrum === 'win');
  let m = stateAt({ step: { type: 'roll', purpose: 'setpiece', dice: ['R'], team: 1, piece: 'scrum' } });
  for (let i = 0; i < 4; i++) {
    m = roll(m, dice(reset)).state;
    assert.equal(m.step.team, 1, 'the same side keeps the feed');
  }
  m = roll(m, dice(win)).state;
  assert.equal(m.attacker, 1);
});

test('a crooked lineout passes the throw back and forth until someone wins it', () => {
  const crooked = faceOf('R', f => f.lineout === 'notstraight');
  let m = stateAt({ step: { type: 'roll', purpose: 'setpiece', dice: ['R'], team: 1, piece: 'lineout' } });
  for (let i = 0; i < 5; i++) {
    m = roll(m, dice(crooked)).state;
    assert.equal(m.step.team, i % 2 === 0 ? 0 : 1);
  }
});

test('every pass choice from every passer', () => {
  for (const from of OUTSIDE_BACKS) {
    const options = OUTSIDE_BACKS.filter(p => p !== from);
    const m = stateAt({ step: { type: 'choose', purpose: 'pass', team: 0, from, options }, carrier: from });
    for (const to of options) {
      const after = choose(m, to).state;
      assert.equal(after.carrier, to);
      assert.deepEqual(after.step, { type: 'roll', purpose: 'attack', dice: [to], team: 0 });
    }
    for (const bad of ['S', from]) assert.throws(() => choose(m, bad), `cannot pass from ${from} to ${bad}`);
  }
});

test('score thresholds: every scoring kind from every score, in both halves and all lengths', () => {
  let cases = 0;
  for (const [length, target] of Object.entries(MATCH_LENGTHS)) {
    for (const half of [1, 2]) {
      for (let mine = 0; mine < target.full; mine++) {
        for (const theirs of [0, target.half - 1, target.full - 1]) {
          if (half === 1 && (mine >= target.half || theirs >= target.half)) continue;
          for (const kind of ['penalty', 'drop', 'conversion']) {
            const points = RULES.points[kind];
            const before = stateAt({
              step: { type: 'roll', purpose: 'kick', dice: ['K'], team: 0, kick: kind, range: 1 },
              scores: [mine, theirs],
              half,
              length,
            });
            const { state: m } = roll(before, dice(0));
            const scores = [mine + points, theirs];
            const want = expectedAfterScore(scores, 0, half, target);
            assert.equal(m.teams[0].score, mine + points);
            assert.equal(m.step.type, want.type, `${length} half ${half} ${mine}-${theirs} ${kind}`);
            if (want.type === 'roll') {
              assert.equal(m.attacker, 0, 'scorers receive');
              assert.deepEqual(m.step.dice, ['S']);
            }
            if (want.type === 'fulltime') assert.equal(m.winner, 0);
            cases++;
          }
          // A try, then the conversion (or the final whistle straight away).
          const tryBefore = stateAt({ step: { type: 'roll', purpose: 'try', dice: ['K'], team: 0, carrier: 'F', videos: 0 }, scores: [mine, theirs], half, length });
          const { state: afterTry } = roll(tryBefore, dice(faceOf('K', f => f.result === 'try')));
          if (mine + 5 >= target.full) assert.equal(afterTry.step.type, 'fulltime');
          else assert.equal(afterTry.step.purpose, 'range', 'the conversion comes before half time');
          cases++;
        }
      }
    }
  }
  assert.ok(cases > 500, `${cases} threshold cases`);
});

test('half time: sin bins expire, red cards stay, and the other side receives', () => {
  for (const firstReceiver of [0, 1]) {
    for (const ys of YELLOW_STATES) {
      const before = stateAt({ step: { type: 'halftime' }, firstReceiver, sinBin: [ys.sinBin, ys.sinBin], yellows: [ys.yellows, ys.yellows], quickTap: 2, scores: [15, 3] });
      const { state: m, events } = act(before, { type: 'continue' });
      assert.equal(m.half, 2);
      assert.equal(m.attacker, 1 - firstReceiver);
      assert.equal(m.quickTap, 0);
      assert.deepEqual(m.step, { type: 'roll', purpose: 'attack', dice: ['S'], team: 1 - firstReceiver });
      for (const t of m.teams) {
        assert.equal(t.sinBin, false);
        assert.equal(t.yellows, ys.yellows, 'cards are remembered for the second-yellow rule');
      }
      assert.ok(events.some(e => e.type === 'secondHalf'));
    }
  }
});

test('the toss: both calls, both results, either caller', () => {
  for (const call of ['heads', 'tails']) {
    for (const [value, result] of [[0.1, 'heads'], [0.9, 'tails']]) {
      const m = stateAt();
      m.step = { type: 'choose', purpose: 'toss', team: 0, options: ['heads', 'tails'] };
      m.attacker = null;
      const { state } = act(m, { type: 'choose', value: call }, () => value);
      const winner = call === result ? 0 : 1;
      assert.equal(state.toss.result, result);
      assert.equal(state.firstReceiver, winner, '"Flip a coin to determine who receives the kick"');
      assert.equal(state.attacker, winner);
      assert.deepEqual(state.step.dice, ['S']);
    }
  }
});

test('odds helpers match a full count of the dice', () => {
  for (let intensity = 1; intensity <= 10; intensity++) {
    for (const { perDie } of YELLOW_STATES) {
      for (const canRuck of [true, false]) {
        let breaks = 0;
        for (const a of range6) for (const b of range6) if (RULES.tackle(a, b, intensity, { perDie, plainHitUp: canRuck }).result === 'break') breaks++;
        assert.equal(breakChance(intensity, perDie, canRuck && intensity <= 4), breaks / 36, `intensity ${intensity} perDie ${perDie}`);
      }
    }
  }
  for (let range = 1; range <= 6; range++) {
    assert.equal(kickChance(range), DICE.K.faces.filter(f => f.kick >= range).length / 6);
  }
});

test('the pass odds shown to players count every face of the receiver, cards, quick tap and injuries included', () => {
  for (const pos of OUTSIDE_BACKS) {
    for (const ys of YELLOW_STATES) {
      for (const quickTap of [0, 2]) {
        for (const injury of [0, 1]) {
          const m = stateAt({ carrier: pos, quickTap, injuries: [{ [pos]: injury }, {}], sinBin: [false, ys.sinBin], yellows: [0, ys.yellows] });
          let breaks = 0;
          let errors = 0;
          for (const face of DICE[pos].faces) {
            if (face.kind === 'error' || face.kind === 'intercept') errors++;
            if (face.kind !== 'run') continue;
            const intensity = RULES.intensity(face.value, { quickTap, injury });
            for (const a of range6) {
              for (const b of range6) {
                if (RULES.tackle(a, b, intensity, { perDie: ys.perDie, plainHitUp: !face.special }).result === 'break') breaks++;
              }
            }
          }
          const odds = receiverOdds(m, 0, pos);
          const label = `${pos} ${ys.name} qt=${quickTap} inj=${injury}`;
          assert.ok(Math.abs(odds.lineBreak - breaks / 216) < 1e-12, `${label}: break ${odds.lineBreak} vs ${breaks / 216}`);
          assert.ok(Math.abs(odds.error - errors / 6) < 1e-12, `${label}: error`);
          assert.equal(odds.special, DICE[pos].faces.find(f => f.special));
        }
      }
    }
  }
});

test('a penalty won during a quick tap resets the advantage to three runs', () => {
  for (const left of [1, 2, 3]) {
    const m = stateAt({ step: { type: 'choose', purpose: 'penalty', team: 0, range: 3, options: ['kick', 'tap'] }, quickTap: left });
    assert.equal(choose(m, 'tap').state.quickTap, QUICK_TAP_RUNS, `from ${left} left`);
  }
});
