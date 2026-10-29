// Optional rules: the weather (rain makes the Forwards and Centres knock on
// with their free ‹Pass› face; wind is 10 m on every kick and swaps ends at
// half time) and the bench (three named replacements, each on once, for
// injured players; out of position they run at −1).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { act, attackFace, benchOptions, isLegal, kickBonus, kickParts, migrate, newMatch, receiverOdds, rollWeather, seededRng, VERSION, WET_HANDS, windBonus, windWith } from '../js/engine.js';
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
  m.teams[0].cards = [{ id: 'golden-boot', rarity: 'mythic' }];
  m.weather = { rain: false, wind: 1 };
  const ten = faceOf('K', f => f.kick === 1);
  const { events } = roll(m, dice(ten));
  const kick = events.find(e => e.type === 'kick');
  assert.deepEqual([kick.rolled, kick.card, kick.wind, kick.distance, kick.good], [1, 4, -1, 4, false], 'even a Mythic Golden Boot can fall short into the wind');
  assert.match(narrate(events, m).lines.find(l => /missed/.test(l.text)).text, /into the wind/);
});

test('rain: the Forwards and Centres knock on with their free pass; nobody else does', () => {
  assert.deepEqual(WET_HANDS, ['F', 'C']);
  const m = stateAt();
  m.weather = { rain: true, wind: null };
  for (const pos of ['W', 'B']) assert.equal(attackFace(m, 0, pos, freePass(pos)).face.kind, 'pass', `${pos} keeps hold in the rain`);
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
  m.teams[0].cards = [{ id: 'big-pack', rarity: 'epic' }];
  m.weather = { rain: true, wind: null };
  const { face, wet, swapped } = attackFace(m, 0, 'F', freePass('F'));
  assert.ok(wet && swapped === 'knockon' && face.kind === 'pass', 'the card turns the wet knock-on back into a pass');
  const { state, events } = roll(m, dice(freePass('F')));
  assert.ok(events.some(e => e.type === 'cardPlayed' && e.what === 'knockon' && e.wet));
  assert.equal(state.step.purpose, 'pass');
});

// An injury from two Big Hits on a Hit Up 4 (a ruck contest follows). The
// injured side's bench: a Forward, a Centre and an Outside Back, by name.
const BENCH = [{ name: 'A. Prop', pos: 'F' }, { name: 'B. Centre', pos: 'C' }, { name: 'C. Wing', pos: 'W' }];
function injuredState({ bench = true, injuries = [{}, {}], half = 1, scores = [0, 0] } = {}) {
  const m = stateAt({ step: { type: 'roll', purpose: 'tackle', dice: ['D', 'D'], team: 1, intensity: 4, carrier: 'F', ruck: true, special: false }, carrier: 'F', injuries, half, scores });
  m.bench = bench;
  m.teams.forEach(t => {
    t.roster = { S: 'S. Nine', F: 'F. Eight', C: 'C. Twelve', W: 'W. Eleven', B: 'B. Ten' };
    t.subs = bench ? BENCH.map(x => ({ ...x, used: false })) : [];
  });
  return m;
}

test('the bench: an injury asks the injured side which replacement to bring on', () => {
  const { state, events } = roll(injuredState(), dice(bigHit, bigHit));
  assert.ok(events.some(e => e.type === 'injury' && e.pos === 'F'));
  assert.deepEqual(state.teams[0].injured, ['F. Eight'], 'noted for the next match');
  assert.deepEqual([state.step.type, state.step.purpose, state.step.team, state.step.pos], ['choose', 'bench', 0, 'F']);
  assert.deepEqual(state.step.options, ['0>F', '1>F', '2>F', 'stay'], 'the Forward on the bench first');
  assert.equal(state.step.next.purpose, 'ruck', 'then the ruck contest goes on');
  // The Forward comes on: no injury, in position, and the player off keeps his numbers.
  const replaced = choose(state, '0>F', dice());
  const T = replaced.state.teams[0];
  assert.deepEqual([T.injuries.F, T.offPos.F, T.roster.F, T.subs[0].used], [0, 0, 'A. Prop', true]);
  assert.deepEqual(T.off, [{ name: 'F. Eight', pos: 'F', stats: state.teams[0].players.F }]);
  assert.equal(T.players.F.carries, 0, 'the replacement starts afresh');
  assert.deepEqual(replaced.state.step, state.step.next);
  const e = replaced.events.find(x => x.type === 'replacement');
  assert.deepEqual([e.team, e.pos, e.cleared, e.when, e.on, e.off, e.offPos], [0, 'F', 1, 'injury', 'A. Prop', 'F. Eight', false]);
  // The Centre on for the Forward: out of position, so the Forwards run at −1.
  const misfit = choose(state, '1>F', dice()).state;
  assert.deepEqual([misfit.teams[0].injuries.F, misfit.teams[0].offPos.F], [0, 1]);
  const run = roll({ ...structuredClone(misfit), step: { type: 'roll', purpose: 'attack', dice: ['F'], team: 0 }, attacker: 0, carrier: 'F', quickTap: 0 }, dice(0)).events.find(x => x.type === 'run');
  assert.deepEqual([run.value, run.offPos, run.intensity], [5, 1, 4]);
  // Play on: the injury stays, the bench waits.
  const stayed = choose(state, 'stay', dice());
  assert.equal(stayed.state.teams[0].injuries.F, 1);
  assert.ok(stayed.state.teams[0].subs.every(x => !x.used));
  assert.ok(stayed.events.some(x => x.type === 'playOn'));
  for (const r of [replaced, stayed, choose(state, '1>F', dice())]) for (const line of narrate(r.events, r.state).lines) assert.doesNotMatch(line.text, BROKEN_TEXT);
});

test('the bench: any injured player can come off, each replacement once, and none is offered without one', () => {
  const { state } = roll(injuredState({ injuries: [{ S: 1, W: 2 }, {}] }), dice(bigHit, bigHit));
  assert.deepEqual(state.step.options, ['0>F', '1>F', '2>F', '0>S', '1>S', '2>S', '2>W', '0>W', '1>W', 'stay'], 'the one just hurt first, in-position replacements first');
  const r = choose(state, '2>W', dice());
  assert.equal(r.events.find(e => e.type === 'replacement').cleared, 2, 'a fresh player: the whole penalty goes');
  assert.ok(!isLegal(state, { type: 'choose', value: '0>C' }), 'only injured players');
  // No bench (off, or all three used): no question.
  for (const m of [injuredState({ bench: false }), (() => {
    const used = injuredState();
    used.teams[0].subs.forEach(x => (x.used = true));
    return used;
  })()]) {
    const out = roll(m, dice(bigHit, bigHit));
    assert.equal(out.state.step.purpose, 'ruck');
  }
  // An ordinary tackle never asks.
  assert.notEqual(roll(injuredState(), dice(tackle1, tackle1)).state.step.purpose, 'bench');
});

test('the bench at half time: as many changes as there are replacements for the injured, the side kicking off first', () => {
  const m = stateAt({ step: { type: 'halftime' }, half: 1, scores: [15, 6], firstReceiver: 0, injuries: [{ C: 1, F: 1 }, { B: 1 }] });
  m.bench = true;
  m.teams.forEach(t => (t.subs = BENCH.map(x => ({ ...x, used: false }))));
  let { state, events } = act(m, { type: 'continue' }, dice());
  assert.ok(events.some(e => e.type === 'secondHalf'));
  // The side kicking off decides first, and may make two changes.
  assert.deepEqual([state.step.purpose, state.step.when, state.step.team], ['bench', 'halftime', 0]);
  ({ state } = choose(state, '1>C', dice()));
  assert.deepEqual([state.step.purpose, state.step.team], ['bench', 0], 'another change for the same side');
  assert.deepEqual(state.step.options, ['0>F', '2>F', 'stay']);
  ({ state } = choose(state, '0>F', dice()));
  assert.deepEqual([state.step.purpose, state.step.team], ['bench', 1], 'then the side receiving');
  ({ state, events } = choose(state, 'stay', dice()));
  assert.ok(events.some(e => e.type === 'possession' && e.reason === 'kickoff' && e.team === 1), 'then the kick-off');
  assert.deepEqual([state.teams[0].injuries.C, state.teams[0].injuries.F, state.teams[1].injuries.B], [0, 0, 1]);
  assert.equal(state.teams[0].subs.filter(x => x.used).length, 2);
  // Nobody hurt: straight to the kick-off.
  const fit = stateAt({ step: { type: 'halftime' }, half: 1, scores: [15, 6] });
  fit.bench = true;
  assert.equal(act(fit, { type: 'continue' }, dice()).state.step.purpose, 'attack');
});

test('the CPU and the bench: a replacement in position for the costliest injury; out of position only for a bad one', () => {
  const ask = (pos, injuries, subs = BENCH, when = 'injury') => {
    const m = stateAt({ injuries: [injuries, {}] });
    m.bench = true;
    m.teams[0].subs = subs.map(x => ({ ...x, used: false }));
    m.step = { type: 'choose', purpose: 'bench', team: 0, when, pos, options: benchOptions(m, 0, pos), next: null };
    return m;
  };
  assert.equal(benchChoice(ask('F', { F: 1 })), '0>F');
  assert.equal(benchChoice(ask('W', { W: 1 })), '2>W');
  // Nobody of that position on the bench: a −1 injury is no worse than a replacement out of position.
  assert.equal(benchChoice(ask('S', { S: 1 })), 'stay');
  assert.equal(benchChoice(ask('S', { S: 2 })), '0>S', 'a −2 is worth a replacement at −1');
  // With two hurt, the one who carries more goes off first.
  assert.equal(benchChoice(ask('C', { C: 1, F: 1 })), '0>F');
  assert.equal(benchChoice(ask(null, { C: 1 }, BENCH, 'halftime')), '1>C');
  assert.ok(CARRY_SHARE.F > CARRY_SHARE.S);
  // Rookie: the first offered; Expert uses the Pro rule.
  assert.equal(cpuChoice({ ...ask('S', { S: 1 }), cpuLevel: 'rookie' }, seededRng(1)), '0>S');
  assert.equal(cpuChoice({ ...ask('S', { S: 1 }), cpuLevel: 'expert' }), 'stay');
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

test('saves from before the weather and the bench load with both off; an old bench gets three nameless replacements', () => {
  const old = structuredClone(newMatch({ mode: '1p', cards: true }));
  old.version = 4;
  delete old.weather;
  delete old.bench;
  old.teams.forEach(t => {
    delete t.subs;
    delete t.off;
    delete t.offPos;
    delete t.injured;
  });
  const m = migrate(old);
  assert.equal(m.version, VERSION);
  assert.equal(m.weather, null);
  assert.equal(m.bench, false);
  assert.deepEqual(m.teams.map(t => t.subs), [[], []]);
  // Version 6, the bench on, mid-decision: positions become replacements.
  const v6 = injuredState();
  const asked = roll(v6, dice(bigHit, bigHit)).state;
  asked.version = 6;
  asked.step.options = ['F', 'stay'];
  asked.teams.forEach(t => {
    t.bench = 1;
    delete t.subs;
    delete t.off;
    delete t.offPos;
    delete t.injured;
  });
  const up = migrate(asked);
  assert.deepEqual(up.teams[0].subs.map(x => [x.name, x.pos]), [[null, 'F'], [null, 'C'], [null, 'W']]);
  assert.deepEqual(up.step.options, ['0>F', '1>F', '2>F', 'stay']);
  assert.ok(up.teams.every(t => !('bench' in t)));
  assert.equal(choose(up, '0>F', dice()).state.teams[0].injuries.F, 0);
});

test('whole matches with the weather and the bench, CPU against CPU, finish within the rules', () => {
  const seen = { wet: 0, replaced: 0, kept: 0, halftimeChanges: 0 };
  for (let g = 0; g < 120; g++) {
    const rng = seededRng(500 + g);
    let m = newMatch({ mode: '2p', length: 'standard', cards: g % 2 === 0, bench: true, weather: { rain: true, wind: g % 2 } });
    for (let guard = 0; m.step.type !== 'fulltime'; guard++) {
      assert.ok(guard < 4000);
      const s = m.step;
      // A third of the matches pick changes at random, so out-of-position ones come up.
      const random = s.purpose === 'bench' && g % 3 === 0 ? s.options[Math.floor(rng() * s.options.length)] : null;
      const a = s.type === 'roll' ? { type: 'roll' } : s.type === 'halftime' ? { type: 'continue' } : { type: 'choose', value: random ?? cpuChoice({ ...m, cpuLevel: g % 3 ? 'pro' : 'rookie' }, rng) };
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
