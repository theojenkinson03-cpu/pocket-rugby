// Optional rules: the weather (rain makes the Forwards and Centres knock on
// with their free ‹Pass› face; wind is 10 m on every kick and swaps ends at
// half time) and the bench (one replacement a half clears an injury).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { act, attackFace, injuredPositions, isLegal, kickBonus, kickParts, migrate, newMatch, receiverOdds, rollWeather, seededRng, VERSION, WET_HANDS, windBonus, windWith } from '../js/engine.js';
import { benchChoice, cpuChoice, CARRY_SHARE } from '../js/ai.js';
import { narrate } from '../js/commentary.js';
import { tipFor } from '../js/coach.js';
import { DICE, POSITIONS } from '../js/dice.js';
import { BROKEN_TEXT, choose, dice, faceOf, roll, stateAt } from './helpers.mjs';

const freePass = pos => faceOf(pos, f => f.kind === 'pass' && !f.to);
const bigHit = faceOf('D', f => f.kind === 'bighit');
const tackle1 = faceOf('D', f => f.kind === 'tackle' && f.value === 1);

test('conditions: rain on about a third of matches, wind on half, either way', () => {
  const rng = seededRng(4);
  const n = 20000;
  let rain = 0;
  const wind = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    const w = rollWeather(rng);
    if (w.rain) rain++;
    wind[w.wind === null ? 2 : w.wind]++;
  }
  assert.ok(Math.abs(rain / n - 0.35) < 0.015, `rain ${rain / n}`);
  assert.ok(Math.abs(wind[2] / n - 0.5) < 0.015, `still ${wind[2] / n}`);
  assert.ok(Math.abs(wind[0] - wind[1]) / n < 0.02, 'either end');
  const m = newMatch({ weather: { rain: 1, wind: 7 } });
  assert.deepEqual(m.weather, { rain: true, wind: null }, 'cleaned up');
  assert.equal(newMatch().weather, null, 'off by default');
});

test('wind: +10 m with it, −10 m into it, and the ends change at half time', () => {
  const m = stateAt();
  m.weather = { rain: false, wind: 1 };
  assert.equal(windWith(m), 1);
  assert.deepEqual([windBonus(m, 0), windBonus(m, 1)], [-1, 1]);
  m.half = 2;
  assert.equal(windWith(m), 0);
  assert.deepEqual([windBonus(m, 0), windBonus(m, 1)], [1, -1]);
  m.weather.wind = null;
  assert.deepEqual([windBonus(m, 0), windBonus(m, 1)], [0, 0]);
  m.weather = null;
  assert.equal(windWith(m), null);
});

test('a kick into the wind falls 10 m short; with it, carries 10 m further', () => {
  const kickAt = (range, wind) => {
    const m = stateAt({ step: { type: 'roll', purpose: 'kick', dice: ['K'], team: 0, kick: 'penalty', range, kicker: 'B' } });
    m.weather = { rain: false, wind };
    return m;
  };
  const forty = faceOf('K', f => f.kick === 4);
  // 40 m struck, 40 m needed: good in still air, short into the wind.
  let { state, events } = roll(kickAt(4, null), dice(forty));
  assert.equal(events.find(e => e.type === 'kick').good, true);
  ({ state, events } = roll(kickAt(4, 1), dice(forty)));
  const short = events.find(e => e.type === 'kick');
  assert.deepEqual([short.good, short.distance, short.wind, short.card], [false, 3, -1, 0]);
  assert.equal(state.attacker, 1, 'a missed penalty is a changeover');
  // 40 m struck, 50 m needed: wide in still air, over with the wind behind.
  ({ events } = roll(kickAt(5, 0), dice(forty)));
  assert.equal(events.find(e => e.type === 'kick').good, true);
  const line = narrate(events, kickAt(5, 0)).lines.find(l => /Penalty goal/.test(l.text)).text;
  assert.match(line, /\+10 m wind/);
  // The chance shown to the player counts the wind too.
  const m = kickAt(5, 0);
  assert.deepEqual(kickParts(m, 0, 'penalty'), { card: 0, wind: 1 });
  assert.equal(kickBonus(m, 0, 'penalty'), 1);
});

test('wind and a team card add up on a kick', () => {
  const m = stateAt({ step: { type: 'roll', purpose: 'kick', dice: ['K'], team: 0, kick: 'conversion', range: 5, kicker: 'B' } });
  m.cards = true;
  m.teams[0].card = 'golden-boot';
  m.teams[0].cardRarity = 'mythic';
  m.weather = { rain: false, wind: 1 };
  const ten = faceOf('K', f => f.kick === 1);
  const { events } = roll(m, dice(ten));
  const kick = events.find(e => e.type === 'kick');
  assert.deepEqual([kick.rolled, kick.card, kick.wind, kick.distance, kick.good], [1, 4, -1, 4, false], 'even a Mythic Golden Boot can fall short into the wind');
  assert.match(narrate(events, m).lines.find(l => /missed/.test(l.text)).text, /into the wind/);
});

test('rain: the Forwards and Centres knock on with their free pass; nobody else does', () => {
  const m = stateAt();
  m.weather = { rain: true, wind: null };
  for (const pos of POSITIONS) {
    DICE[pos].faces.forEach((f, i) => {
      const { face, wet } = attackFace(m, 0, pos, i);
      const slips = WET_HANDS.includes(pos) && f.kind === 'pass' && !f.to;
      assert.equal(wet, slips, `${pos} face ${i}`);
      if (slips) assert.deepEqual([face.kind, face.error], ['error', 'knockon']);
      else assert.equal(face, f, 'every other face is as printed');
    });
  }
  // In the dry, as printed.
  m.weather.rain = false;
  assert.equal(attackFace(m, 0, 'F', freePass('F')).face, DICE.F.faces[freePass('F')]);
  // A wet knock-on gives the scrum to the other side.
  m.weather.rain = true;
  const at = stateAt({ step: { type: 'roll', purpose: 'attack', dice: ['C'], team: 0 }, carrier: 'C' });
  at.weather = { rain: true, wind: null };
  const { state, events } = roll(at, dice(freePass('C')));
  assert.ok(events.some(e => e.type === 'wetBall' && e.pos === 'C'));
  const error = events.find(e => e.type === 'error');
  assert.deepEqual([error.error, error.wet, error.piece], ['knockon', true, 'scrum']);
  assert.deepEqual([state.step.purpose, state.step.team], ['setpiece', 1]);
  assert.match(narrate(events, state).lines[0].text, /wet ball/i);
  assert.equal(state.teams[0].players.C.errors, 1);
});

test('rain shows in the odds: one more error face in six for the Forwards and Centres', () => {
  const m = stateAt();
  const dry = Object.fromEntries(POSITIONS.map(p => [p, receiverOdds(m, 0, p).error]));
  m.weather = { rain: true, wind: null };
  for (const pos of POSITIONS) {
    const wet = receiverOdds(m, 0, pos).error;
    assert.ok(Math.abs(wet - dry[pos] - (WET_HANDS.includes(pos) ? 1 / 6 : 0)) < 1e-9, pos);
  }
});

test('an Epic Big Pack keeps hold of a wet ball', () => {
  const m = stateAt({ step: { type: 'roll', purpose: 'attack', dice: ['F'], team: 0 }, carrier: 'F' });
  m.cards = true;
  m.teams[0].card = 'big-pack';
  m.teams[0].cardRarity = 'epic';
  m.weather = { rain: true, wind: null };
  const { face, wet, swapped } = attackFace(m, 0, 'F', freePass('F'));
  assert.ok(wet && swapped === 'knockon' && face.kind === 'pass', 'the card turns the wet knock-on back into a pass');
  const { state, events } = roll(m, dice(freePass('F')));
  assert.ok(events.some(e => e.type === 'cardPlayed' && e.what === 'knockon' && e.wet));
  assert.equal(state.step.purpose, 'pass');
});

// An injury from two Big Hits on a Hit Up 4 (a ruck contest follows).
function injuredState({ bench = true, injuries = [{}, {}], half = 1, scores = [0, 0] } = {}) {
  const m = stateAt({ step: { type: 'roll', purpose: 'tackle', dice: ['D', 'D'], team: 1, intensity: 4, carrier: 'F', ruck: true, special: false }, carrier: 'F', injuries, half, scores });
  m.bench = bench;
  m.teams.forEach(t => (t.bench = bench ? 1 : 0));
  return m;
}

test('the bench: an injury asks the injured side whether to bring on a replacement', () => {
  const { state, events } = roll(injuredState(), dice(bigHit, bigHit));
  assert.ok(events.some(e => e.type === 'injury' && e.pos === 'F'));
  assert.equal(state.step.type, 'choose');
  assert.equal(state.step.purpose, 'bench');
  assert.equal(state.step.team, 0, 'the injured side decides');
  assert.equal(state.step.pos, 'F');
  assert.deepEqual(state.step.options, ['F', 'stay']);
  assert.equal(state.step.next.purpose, 'ruck', 'then the ruck contest goes on');
  // Replace: the injury goes and so does the replacement.
  const replaced = choose(state, 'F', dice());
  assert.equal(replaced.state.teams[0].injuries.F, 0);
  assert.equal(replaced.state.teams[0].bench, 0);
  assert.deepEqual(replaced.state.step, state.step.next);
  const e = replaced.events.find(x => x.type === 'replacement');
  assert.deepEqual([e.team, e.pos, e.cleared, e.when], [0, 'F', 1, 'injury']);
  // Play on: the injury stays, the replacement waits.
  const stayed = choose(state, 'stay', dice());
  assert.equal(stayed.state.teams[0].injuries.F, 1);
  assert.equal(stayed.state.teams[0].bench, 1);
  assert.ok(stayed.events.some(x => x.type === 'playOn'));
  for (const r of [replaced, stayed]) for (const line of narrate(r.events, r.state).lines) assert.doesNotMatch(line.text, BROKEN_TEXT);
});

test('the bench: any injured player can come off, and none is offered without a replacement', () => {
  const { state } = roll(injuredState({ injuries: [{ S: 1, W: 2 }, {}] }), dice(bigHit, bigHit));
  assert.deepEqual(state.step.options, ['S', 'F', 'W', 'stay']);
  const r = choose(state, 'W', dice());
  assert.equal(r.events.find(e => e.type === 'replacement').cleared, 2, 'a fresh player: the whole penalty goes');
  assert.ok(!isLegal(state, { type: 'choose', value: 'C' }), 'only injured players');
  // No bench (off, or used this half): no question.
  for (const m of [injuredState({ bench: false }), (() => {
    const used = injuredState();
    used.teams[0].bench = 0;
    return used;
  })()]) {
    const out = roll(m, dice(bigHit, bigHit));
    assert.equal(out.state.step.purpose, 'ruck');
  }
  // An ordinary tackle never asks.
  assert.notEqual(roll(injuredState(), dice(tackle1, tackle1)).state.step.purpose, 'bench');
});

test('the bench at half time: a fresh replacement each, and the chance to use it on an old injury', () => {
  const m = stateAt({ step: { type: 'halftime' }, half: 1, scores: [15, 6], firstReceiver: 0, injuries: [{ C: 1 }, { B: 1 }] });
  m.bench = true;
  m.teams.forEach(t => (t.bench = 0));
  let { state, events } = act(m, { type: 'continue' }, dice());
  assert.ok(events.some(e => e.type === 'secondHalf'));
  assert.deepEqual(state.teams.map(t => t.bench), [1, 1], 'a fresh replacement each');
  // The side kicking off decides first, the side receiving it last.
  assert.deepEqual([state.step.purpose, state.step.when, state.step.team], ['bench', 'halftime', 0]);
  ({ state, events } = choose(state, 'C', dice()));
  assert.deepEqual([state.step.purpose, state.step.team], ['bench', 1]);
  ({ state, events } = choose(state, 'stay', dice()));
  assert.ok(events.some(e => e.type === 'possession' && e.reason === 'kickoff' && e.team === 1), 'then the kick-off');
  assert.deepEqual([state.teams[0].injuries.C, state.teams[0].bench, state.teams[1].injuries.B, state.teams[1].bench], [0, 0, 1, 1]);
  // Nobody hurt: straight to the kick-off.
  const fit = stateAt({ step: { type: 'halftime' }, half: 1, scores: [15, 6] });
  fit.bench = true;
  assert.equal(act(fit, { type: 'continue' }, dice()).state.step.purpose, 'attack');
});

test('the CPU and the bench: off comes the costliest injury, at once', () => {
  const ask = (pos, injuries, { when = 'injury', half = 1, scores = [0, 0] } = {}) => stateAt({ step: { type: 'choose', purpose: 'bench', team: 0, when, pos, options: [...injuredPositions(stateAt({ injuries: [injuries, {}] }), 0), 'stay'], next: null }, half, scores, injuries: [injuries, {}] });
  assert.equal(benchChoice(ask('F', { F: 1 })), 'F');
  assert.equal(benchChoice(ask('S', { S: 1 })), 'S', 'holding on measured no better');
  assert.equal(benchChoice(ask(null, { S: 1 }, { when: 'halftime' })), 'S');
  // With two hurt, the one who carries more goes off; a −2 outweighs a −1.
  assert.equal(benchChoice(ask('B', { B: 1, F: 1 })), 'F');
  assert.equal(benchChoice(ask('F', { S: 2, F: 1 })), 'F', 'Forwards −1 (0.34) beats Scrum Half −2 (0.2)');
  assert.equal(benchChoice(ask('W', { B: 2, W: 1 })), 'B');
  assert.ok(CARRY_SHARE.F > CARRY_SHARE.S);
  // A threshold keeps a small injury early in a half, but not late or at half time.
  assert.equal(benchChoice(ask('S', { S: 1 }), 0.18), 'stay');
  assert.equal(benchChoice(ask('S', { S: 1 }, { scores: [12, 4] }), 0.18), 'S');
  assert.equal(benchChoice(ask(null, { S: 1 }, { when: 'halftime' }), 0.18), 'S');
  assert.equal(benchChoice(ask('S', { S: 2 }), 0.18), 'S');
  // Rookie: whoever was just hurt, straight off; Expert uses the Pro rule.
  assert.equal(cpuChoice({ ...ask('B', { B: 1, F: 1 }), cpuLevel: 'rookie' }, seededRng(1)), 'B');
  assert.equal(cpuChoice({ ...ask('B', { B: 1, F: 1 }), cpuLevel: 'expert' }), 'F');
});

test('the coach explains the bench, the rain and the wind the first time', () => {
  const m = stateAt({ step: { type: 'choose', purpose: 'bench', team: 0, when: 'injury', pos: 'F', options: ['F', 'stay'], next: null }, injuries: [{ F: 1 }, {}] });
  assert.equal(tipFor(m, [], [], true), 'bench');
  assert.equal(tipFor(m, [], ['bench'], true), null);
  assert.equal(tipFor(stateAt(), [{ type: 'wetBall', team: 0, pos: 'F' }], [], false), 'rain');
  const kick = stateAt({ step: { type: 'roll', purpose: 'kick', dice: ['K'], team: 0, kick: 'penalty', range: 3 } });
  assert.equal(tipFor(kick, [], ['kick'], true), null, 'no wind, no tip');
  kick.weather = { rain: false, wind: 0 };
  assert.equal(tipFor(kick, [], ['kick'], true), 'wind');
});

test('saves from before the weather and the bench load with both off', () => {
  const old = structuredClone(newMatch({ mode: '1p', cards: true }));
  old.version = 4;
  delete old.weather;
  delete old.bench;
  old.teams.forEach(t => delete t.bench);
  const m = migrate(old);
  assert.equal(m.version, VERSION);
  assert.equal(m.weather, null);
  assert.equal(m.bench, false);
  assert.deepEqual(m.teams.map(t => t.bench), [0, 0]);
});

test('whole matches with the weather and the bench, CPU against CPU, finish within the rules', () => {
  const seen = { wet: 0, replaced: 0, kept: 0, halftimeChanges: 0 };
  for (let g = 0; g < 120; g++) {
    const rng = seededRng(500 + g);
    let m = newMatch({ mode: '2p', length: 'standard', cards: g % 2 === 0, bench: true, weather: { rain: true, wind: g % 2 } });
    for (let guard = 0; m.step.type !== 'fulltime'; guard++) {
      assert.ok(guard < 4000);
      const s = m.step;
      // Half the matches keep a small injury's replacement early on, so both choices come up.
      const bench = s.purpose === 'bench' && g % 2 ? benchChoice(m, 0.18) : null;
      const a = s.type === 'roll' ? { type: 'roll' } : s.type === 'halftime' ? { type: 'continue' } : { type: 'choose', value: bench ?? cpuChoice({ ...m, cpuLevel: g % 3 ? 'pro' : 'rookie' }, rng) };
      const out = act(m, a, rng);
      for (const e of out.events) {
        if (e.type === 'wetBall') seen.wet++;
        if (e.type === 'replacement') seen[e.when === 'halftime' ? 'halftimeChanges' : 'replaced']++;
        if (e.type === 'playOn') seen.kept++;
      }
      m = out.state;
    }
  }
  assert.ok(seen.wet > 100 && seen.replaced > 20 && seen.kept > 5 && seen.halftimeChanges > 0, JSON.stringify(seen));
});
