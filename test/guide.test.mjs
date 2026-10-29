// The dice guide: what each face of the coming roll would do, as good, bad
// or neither for the side asking, and the badges on the dice.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { act, halfRolls, newMatch, rollWeather, seededRng } from '../js/engine.js';
import { cpuChoice } from '../js/ai.js';
import { dieBadges, faceOrder, playerBadge, rollGuide as shownGuide } from '../js/guide.js';
import { DICE } from '../js/dice.js';
import { dice, faceOf, stateAt } from './helpers.mjs';

const attack = (pos, opts = {}) => stateAt({ step: { type: 'roll', purpose: 'attack', dice: [pos], team: 0 }, carrier: pos, ...opts });
const tones = g => g.faces.map(f => f.tone);
// The guide as shown is in reading order (1 to 6); these tests look faces up by the die's own order.
const rollGuide = (...args) => {
  const g = shownGuide(...args);
  return g && { ...g, faces: [...g.faces].sort((a, b) => a.index - b.index) };
};

test('the guide reads 1 to 6 left to right: the black die by its numbers, the others as they come', () => {
  const kick = shownGuide(stateAt({ step: { type: 'roll', purpose: 'kick', dice: ['K'], team: 0, kick: 'penalty', range: 4, kicker: 'B' } }));
  assert.deepEqual(kick.faces.map(f => DICE.K.faces[f.index].kick), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(faceOrder('K').map(i => DICE.K.faces[i].kick), [1, 2, 3, 4, 5, 6]);
  for (const id of ['S', 'F', 'C', 'W', 'B', 'D', 'R']) assert.deepEqual(faceOrder(id), [0, 1, 2, 3, 4, 5], id);
  const tackle = shownGuide(stateAt({ step: { type: 'roll', purpose: 'tackle', dice: ['D', 'D'], team: 1, intensity: 5, carrier: 'F' } }));
  assert.deepEqual(tackle.faces.map(f => DICE.D.faces[f.index].value), [1, 2, 3, 3, 4, 5]);
});

test('the kick-off guide: 4, 5 and 6 win it back for the side kicking', () => {
  const m = stateAt({ step: { type: 'roll', purpose: 'restart', dice: ['K'], team: 1, receiver: 0 } });
  const kicker = shownGuide(m);
  assert.deepEqual(kicker.faces.map(f => f.tone), ['bad', 'bad', 'bad', 'good', 'good', 'good']);
  assert.deepEqual(shownGuide(m, 0).faces.map(f => f.tone), ['good', 'good', 'good', 'bad', 'bad', 'bad'], 'the other way round for the scorers');
});

test('the guide only speaks when a roll is coming', () => {
  assert.equal(rollGuide(stateAt({ step: { type: 'choose', purpose: 'pass', team: 0, from: 'F', options: ['C', 'W', 'B'] } })), null);
  assert.equal(rollGuide(stateAt({ step: { type: 'halftime' } })), null);
  const g = rollGuide(attack('F'));
  assert.equal(g.faces.length, 6);
  assert.deepEqual(g.faces.map(f => f.index), [0, 1, 2, 3, 4, 5]);
  assert.ok(g.faces.every(f => f.caption && f.text && ['good', 'ok', 'bad'].includes(f.tone)));
});

test('every face tells the truth: the guide agrees with the roll it describes', () => {
  for (const pos of ['S', 'F', 'C', 'W', 'B']) {
    const m = attack(pos);
    const g = rollGuide(m);
    DICE[pos].faces.forEach((face, i) => {
      const { events } = act(m, { type: 'roll' }, dice(i));
      const f = g.faces[i];
      if (events.some(e => e.type === 'error' || e.type === 'intercept')) assert.equal(f.tone, 'bad', `${pos} face ${i}`);
      if (events.some(e => e.type === 'run')) assert.match(f.caption, new RegExp(`^Run ${events.find(e => e.type === 'run').intensity}$`), `${pos} face ${i}`);
      if (events.some(e => e.type === 'dropChance')) assert.deepEqual([f.tone, f.caption], ['good', 'Drop goal']);
      if (events.some(e => e.type === 'pass' || e.type === 'passChoice')) assert.equal(f.tone, 'ok');
    });
  }
  // The Forwards: Line Break is the big chance, the knock-on the risk.
  assert.deepEqual(tones(rollGuide(attack('F'))), ['ok', 'ok', 'ok', 'good', 'ok', 'bad']);
});

// Plays every face of every one-die roll in whole matches (cards, weather,
// both formats, CPU and random choices) and checks the guide against what
// that face then does.
test('in real matches, every face of every roll is what the guide says', () => {
  const rng = seededRng(2027);
  let checked = 0;
  for (let n = 0; n < 60; n++) {
    let m = newMatch({ mode: '2p', length: 'quick', format: n % 2 ? 'rolls' : 'points', decider: n % 4 === 1, cards: n % 3 !== 0, weather: n % 2 ? rollWeather(rng) : null });
    for (let guard = 0; m.step.type !== 'fulltime' && guard < 3000; guard++) {
      const step = m.step;
      if (step.type === 'roll' && step.dice.length === 1) {
        const g = rollGuide(m);
        const team = step.team;
        g.faces.forEach(f => {
          const i = f.index;
          const { state, events } = act(m, { type: 'roll' }, dice(i));
          const label = `${step.purpose} face ${i}: ${f.caption}`;
          const gained = state.teams[team].score - m.teams[team].score;
          const conceded = state.teams[1 - team].score - m.teams[1 - team].score;
          const ft = events.find(e => e.type === 'fulltime');
          if (ft) assert.ok(['Full time', 'wins it'].includes(f.note), `${label}: the whistle goes`);
          else if (gained > 0) assert.equal(f.tone, 'good', label);
          if (conceded > 0) assert.equal(f.tone, 'bad', label);
          if (events.some(e => ['error', 'intercept', 'noTry'].includes(e.type))) assert.equal(f.tone, 'bad', label);
          if (events.some(e => e.type === 'kick' && !e.good) && !ft) assert.equal(f.tone, 'bad', label);
          if (step.purpose === 'ruck') assert.equal(f.tone, events.some(e => e.type === 'ruck' && e.won) ? 'good' : 'bad', label);
          checked++;
        });
      }
      let action;
      if (step.type === 'roll') action = { type: 'roll' };
      else if (step.type === 'halftime') action = { type: 'continue' };
      else action = { type: 'choose', value: n % 2 ? step.options[Math.floor(rng() * step.options.length)] : cpuChoice({ ...m, cpuLevel: 'pro' }, rng) };
      m = act(m, action, rng).state;
    }
  }
  assert.ok(checked > 5000, `${checked} faces checked`);
});

test('injuries, the rain and the sin bin change what the faces say', () => {
  const fit = rollGuide(attack('F'));
  const hurt = rollGuide(attack('F', { injuries: [{ F: 1 }, {}] }));
  assert.equal(fit.faces[0].caption, 'Run 5');
  assert.equal(hurt.faces[0].caption, 'Run 4');
  assert.match(hurt.faces[0].text, /\(5 on the die\)/);
  const wet = attack('C');
  wet.weather = { rain: true, wind: null };
  assert.deepEqual([rollGuide(wet).faces[4].tone, rollGuide(wet).faces[4].caption], ['bad', 'Wet ball']);
  // Line-break chances rise against fourteen men.
  const binned = rollGuide(attack('F', { sinBin: [false, true], yellows: [0, 1] }));
  assert.ok(parseInt(binned.faces[0].note) > parseInt(fit.faces[0].note));
});

test('good for one side is bad for the other: tones and notes turn round', () => {
  const m = stateAt({ step: { type: 'roll', purpose: 'setpiece', dice: ['R'], team: 1, piece: 'lineout' }, attacker: 0 });
  const theirs = rollGuide(m);
  const mine = rollGuide(m, 0);
  theirs.faces.forEach((f, i) => {
    assert.equal(mine.faces[i].tone, { good: 'bad', bad: 'good', ok: 'ok' }[f.tone]);
  });
  assert.equal(theirs.faces[0].note, 'our ball');
  assert.equal(mine.faces[0].note, 'their ball');
  assert.deepEqual([mine.good, mine.bad], [theirs.bad, theirs.good]);
});

test('the tackle: what the brown dice need, and the chance of stopping the run', () => {
  const m = stateAt({ step: { type: 'roll', purpose: 'tackle', dice: ['D', 'D'], team: 1, intensity: 6, carrier: 'F', ruck: false, special: true } });
  const g = rollGuide(m);
  let stops = 0;
  for (let a = 0; a < 6; a++) for (let b = 0; b < 6; b++) if (!act(m, { type: 'roll' }, dice(a, b)).events.some(e => e.type === 'lineBreak')) stops++;
  assert.equal(g.chance, stops / 36);
  assert.match(g.summary, /need 6\+/);
  assert.deepEqual(g.faces.map(f => f.caption), ['Counts 1', 'Counts 2', 'Counts 3', 'Counts 3', 'Counts 4', 'Big Hit']);
  // In the sin bin each die counts one less.
  const binned = rollGuide({ ...structuredClone(m), teams: m.teams.map((t, i) => ({ ...t, sinBin: i === 1, yellows: i === 1 ? 1 : 0 })) });
  assert.equal(binned.faces[1].caption, 'Counts 1');
  assert.equal(binned.faces[1].note, '2 −1');
  assert.ok(binned.chance < g.chance);
});

test('tries, kicks, ranges, rucks and the penalty check', () => {
  const t = rollGuide(stateAt({ step: { type: 'roll', purpose: 'try', dice: ['K'], team: 0, carrier: 'W', videos: 0 } }));
  assert.deepEqual(t.faces.map(f => f.caption), ['TRY', 'TRY', 'TRY', 'No try', 'Video ref', 'Held up']);
  const k = rollGuide(stateAt({ step: { type: 'roll', purpose: 'kick', dice: ['K'], team: 0, kick: 'penalty', range: 4, kicker: 'B' } }));
  assert.deepEqual(tones(k), DICE.K.faces.map(f => (f.kick >= 4 ? 'good' : 'bad')));
  // With Golden Boot's use left, a penalty goal wins the ball back.
  const boot = stateAt({ step: { type: 'roll', purpose: 'kick', dice: ['K'], team: 0, kick: 'penalty', range: 4, kicker: 'B' } });
  boot.teams[0].cards = [{ id: 'golden-boot', rarity: 'common' }];
  const over = rollGuide(boot).faces.filter(f => f.tone === 'good');
  assert.ok(over.length && over.every(f => f.note === 'ball back' && /wins the restart back/.test(f.text)));
  const r = rollGuide(stateAt({ step: { type: 'roll', purpose: 'range', dice: ['D'], team: 0, kick: 'conversion' }, scores: [5, 0] }));
  assert.deepEqual(r.faces.map(f => f.caption), ['100%', '83%', '67%', '67%', '50%', '33%']);
  assert.ok(r.faces.every(f => f.note === 'to land'));
  assert.match(r.faces[1].text, /The posts 20 m away: 83% chance/);
  const ruck = rollGuide(stateAt({ step: { type: 'roll', purpose: 'ruck', dice: ['K'], team: 1 } }));
  assert.deepEqual(tones(ruck), DICE.K.faces.map(f => (f.result === 'ruck' ? 'good' : 'bad')));
  const pen = rollGuide(stateAt({ step: { type: 'roll', purpose: 'penalty', dice: ['K', 'D'], team: 0, offender: 1 } }));
  assert.equal(pen.faces[faceOf('K', f => f.card)].caption, 'Yellow');
  assert.ok(pen.summary);
});

test('on the last play, the guide says when a face ends the match', () => {
  const m = stateAt({ format: 'rolls', length: 'quick', half: 2, scores: [3, 0], step: { type: 'roll', purpose: 'attack', dice: ['F'], team: 1 }, attacker: 1, carrier: 'F' });
  m.clock = halfRolls(m);
  m.lastPlay = true;
  const g = rollGuide(m, 0);
  const knock = g.faces[5];
  assert.equal(knock.note, 'Full time');
  assert.equal(knock.tone, 'good', 'their knock-on ends it with us ahead');
});

test('badges: injuries and advantage on a runner, the sin bin and cards on the tackle dice, the wind on a kick', () => {
  assert.equal(playerBadge(attack('F'), 0, 'F'), null);
  const hurt = playerBadge(attack('F', { injuries: [{ F: 2 }, {}] }), 0, 'F');
  assert.deepEqual([hurt.kind, hurt.text], ['injury', '−2']);
  const both = playerBadge(attack('W', { injuries: [{ W: 1 }, {}], quickTap: 2 }), 0, 'W');
  assert.deepEqual([both.kinds, both.text], [['injury', 'advantage'], '0']);
  const tackle = stateAt({ step: { type: 'roll', purpose: 'tackle', dice: ['D', 'D'], team: 1, intensity: 5, carrier: 'F', ruck: true, special: false }, sinBin: [false, true], yellows: [0, 1] });
  assert.deepEqual(dieBadges(tackle).map(b => b?.text), ['−1', '−1']);
  tackle.teams[1].cards = [{ id: 'rush-defence', rarity: 'common' }];
  assert.deepEqual(dieBadges(tackle).map(b => b?.kinds), [['sinbin', 'card'], ['sinbin']]);
  const red = stateAt({ step: { type: 'roll', purpose: 'tackle', dice: ['D', 'D'], team: 1, intensity: 5, carrier: 'F', ruck: true, special: false }, yellows: [0, 2] });
  assert.deepEqual(dieBadges(red).map(b => [b.kind, b.text]), [['red', '−2'], ['red', '−2']]);
  const kick = stateAt({ step: { type: 'roll', purpose: 'kick', dice: ['K'], team: 0, kick: 'penalty', range: 4, kicker: 'B' } });
  assert.deepEqual(dieBadges(kick), [null]);
  kick.weather = { rain: false, wind: 1 };
  kick.teams[0].cards = [{ id: 'golden-boot', rarity: 'common' }];
  assert.deepEqual(dieBadges(kick).map(b => [b.kinds, b.text]), [[['wind', 'card'], '+10 m']]);
  assert.deepEqual(dieBadges(stateAt({ step: { type: 'roll', purpose: 'try', dice: ['K'], team: 0, carrier: 'W', videos: 0 } })), [null]);
  assert.deepEqual(dieBadges(stateAt({ step: { type: 'halftime' } })), []);
});
