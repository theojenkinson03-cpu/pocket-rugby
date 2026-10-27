// Team cards: every card's effect, played through the engine with exact
// dice, against the same move without the card. Then the draft, and the
// odds the game shows with cards in play, checked by counting every roll.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { act, breakChance, isLegal, kickChance, newMatch, receiverOdds, seededRng } from '../js/engine.js';
import { CARD_BY_ID, CARD_IDS, CARDS, cardEffects, DEAL_SIZE } from '../js/cards.js';
import { DICE } from '../js/dice.js';
import { choose, dice, OUTSIDE_BACKS, roll, stateAt } from './helpers.mjs';

// A state with the given team cards: [attacking side's, defending side's].
function carded(cards, opts = {}) {
  const m = stateAt(opts);
  m.cards = true;
  m.teams.forEach((t, i) => (t.card = cards[i] ?? null));
  return m;
}

const attackWith = (cards, pos, opts = {}) => carded(cards, { carrier: pos, ...opts });
const runOf = events => events.find(e => e.type === 'run');
const played = events => events.filter(e => e.type === 'cardPlayed');
const KNOWN_EFFECTS = ['runBonus', 'faceSwap', 'passToDrop', 'kickBonus', 'tackleBonus', 'ruckMax', 'ruckOnSecond', 'ruckAlsoWins', 'specialDefence', 'setPieceTies', 'setPieceAdvantage', 'uses'];

test('twelve cards, each with a name, a kind, a description and only known effects', () => {
  assert.equal(CARDS.length, 12);
  assert.equal(new Set(CARD_IDS).size, 12, 'ids are unique');
  assert.equal(new Set(CARDS.map(c => c.name)).size, 12, 'names are unique');
  for (const c of CARDS) {
    assert.ok(c.name && c.text.endsWith('.') && c.tag, c.id);
    for (const key of Object.keys(c.effects)) assert.ok(KNOWN_EFFECTS.includes(key), `${c.id}: unknown effect ${key}`);
    // Measured value against no card (scripts/balance-cards.mjs): all within a few points of each other.
    assert.ok(c.value >= 0.06 && c.value <= 0.1, `${c.id} value ${c.value}`);
  }
  assert.equal(CARD_BY_ID['sure-hands'].name, 'Sure Hands');
  assert.equal(DEAL_SIZE, 3);
  assert.deepEqual(cardEffects(stateAt(), 0), {}, 'no card, no effects');
  assert.ok(Object.isFrozen(cardEffects(stateAt(), 0)));
});

test('Big Pack: Forward Hit Ups +1 and Line Break 8; nobody else changes', () => {
  for (let f = 0; f < 6; f++) {
    for (const pos of OUTSIDE_BACKS) {
      const face = DICE[pos].faces[f];
      if (face.kind !== 'run') continue;
      const plain = runOf(roll(attackWith([null, null], pos), dice(f)).events);
      const { state, events } = roll(attackWith(['big-pack', null], pos), dice(f));
      const run = runOf(events);
      const want = pos === 'F' ? face.value + (face.special ? 2 : 1) : face.value;
      assert.equal(run.intensity, want, `${pos} face ${f}`);
      assert.equal(state.step.intensity, want);
      assert.equal(run.card, want - plain.intensity);
      // A Forward Hit Up of 5 is past the ruck limit.
      assert.equal(state.step.ruck, !face.special && want <= 4);
      // The other side's Big Pack does nothing for you.
      assert.equal(runOf(roll(attackWith([null, 'big-pack'], pos), dice(f)).events).intensity, face.value);
    }
  }
});

test('Midfield Maestro: an intercepted Centre pass becomes a free pass', () => {
  const C_INTERCEPT = 5;
  const without = roll(attackWith([null, null], 'C'), dice(C_INTERCEPT));
  assert.equal(without.state.attacker, 1, 'normally a turnover');
  const { state, events } = roll(attackWith(['midfield-maestro', null], 'C'), dice(C_INTERCEPT));
  assert.deepEqual(played(events).map(e => [e.team, e.card, e.what]), [[0, 'midfield-maestro', 'intercept']]);
  assert.equal(state.attacker, 0);
  assert.deepEqual([state.step.purpose, state.step.from, state.step.options], ['pass', 'C', ['F', 'W', 'B']]);
  assert.equal(state.teams[0].stats.errors, 0);
  assert.equal(state.teams[1].stats.turnoversWon, 0);
  // Other players still lose it.
  assert.equal(roll(attackWith(['midfield-maestro', null], 'W'), dice(5)).state.step.purpose, 'setpiece');
});

test('Sure Hands: the Wing never knocks on or finds touch', () => {
  for (const [f, what] of [[5, 'knockon'], [4, 'touch']]) {
    assert.equal(roll(attackWith([null, null], 'W'), dice(f)).state.step.purpose, 'setpiece');
    const { state, events } = roll(attackWith(['sure-hands', null], 'W'), dice(f));
    assert.deepEqual(played(events).map(e => e.what), [what]);
    assert.equal(state.step.purpose, 'pass');
    assert.equal(state.teams[0].players.W.errors, 0);
  }
  // The Forward's knock on is still a knock on.
  assert.equal(roll(attackWith(['sure-hands', null], 'F'), dice(5)).state.step.piece, 'scrum');
});

test('Up and Under: High Ball 8, Back Hit Ups +1, and the Back keeps it in play', () => {
  const runs = [[0, 4], [1, 5], [2, 8]];
  for (const [f, want] of runs) {
    const { state } = roll(attackWith(['up-and-under', null], 'B'), dice(f));
    assert.equal(state.step.intensity, want, `face ${f}`);
  }
  const { state, events } = roll(attackWith(['up-and-under', null], 'B'), dice(5));
  assert.equal(state.step.purpose, 'pass');
  assert.deepEqual(played(events).map(e => e.what), ['touch']);
  // Only the Back: the Wing still finds touch.
  assert.equal(roll(attackWith(['up-and-under', null], 'W'), dice(4)).state.step.piece, 'lineout');
});

test('Golden Boot: +2 on every conversion and penalty kick, not drop goals', () => {
  for (const kick of ['conversion', 'penalty', 'drop']) {
    for (let range = 1; range <= 5; range++) {
      for (let k = 0; k < 6; k++) {
        const rolled = DICE.K.faces[k].kick;
        const m = carded(['golden-boot', null], { step: { type: 'roll', purpose: 'kick', dice: ['K'], team: 0, kick, range, kicker: kick === 'drop' ? 'C' : 'B' }, carrier: 'C' });
        const { events } = roll(m, dice(k));
        const e = events.find(x => x.type === 'kick');
        const bonus = kick === 'drop' ? 0 : 2;
        assert.equal(e.bonus, bonus);
        assert.equal(e.rolled, rolled);
        assert.equal(e.distance, rolled + bonus);
        assert.equal(e.good, rolled + bonus >= range, `${kick} range ${range} kick ${rolled}`);
      }
    }
  }
  // The range roll's shown chance includes the boost.
  const m = carded(['golden-boot', null], { step: { type: 'roll', purpose: 'range', dice: ['D'], team: 0, kick: 'conversion' } });
  const range = roll(m, dice(5)).events.find(e => e.type === 'range');
  assert.equal(range.bonus, 2);
  assert.equal(range.chance, kickChance(5, 2));
  assert.equal(kickChance(5, 2), 4 / 6, "kicks of 3, 5, 4 and 6 now reach 50 m");
});

test('Drop-Goal Artist: +2 on drop goals and the Wing\'s open pass is a drop-goal chance', () => {
  const W_PASS = 3;
  const plain = roll(attackWith([null, null], 'W'), dice(W_PASS));
  assert.equal(plain.state.step.purpose, 'pass');
  const { state, events } = roll(attackWith(['drop-artist', null], 'W'), dice(W_PASS));
  assert.deepEqual(played(events).map(e => e.what), ['dropChance']);
  assert.deepEqual([state.step.purpose, state.step.kick], ['range', 'drop']);
  // Range 5 (face 5), then kick: only the 6 and the 5 would land without the card; with it, 4 and 6 and 5.
  let s = roll(state, dice(5)).state;
  assert.deepEqual(s.step.options, ['kick', 'pass']);
  s = choose(s, 'kick').state;
  assert.equal(s.step.kicker, 'W');
  const kick = roll(s, dice(1)).events.find(e => e.type === 'kick');
  assert.deepEqual([kick.rolled, kick.bonus, kick.good, kick.kicker], [4, 2, true, 'W']);
  // Other players' open passes stay passes.
  for (const pos of ['F', 'C', 'B']) {
    const f = DICE[pos].faces.findIndex(x => x.kind === 'pass' && !x.to);
    assert.equal(roll(attackWith(['drop-artist', null], pos), dice(f)).state.step.purpose, 'pass', pos);
  }
});

// The tackle as the rules read it, with a card's tweaks spelled out separately.
function cardTackle(a, b, intensity, { special, perDie = 0, firstBonus = 0, ruckMax = 4, ruckOnSecond = false }) {
  const [x, y] = [DICE.D.faces[a], DICE.D.faces[b]];
  const big = f => f.kind === 'bighit';
  const canRuck = !special && intensity <= ruckMax;
  if (canRuck && (big(x) || (ruckOnSecond && big(y)))) return 'ruck';
  if (big(y)) return 'tackle';
  return x.value + perDie + firstBonus + y.value + perDie >= intensity ? 'tackle' : 'break';
}

function tackleOutcome(m) {
  return (events, state) => (events.some(e => e.type === 'lineBreak') ? 'break' : state.step.purpose === 'ruck' ? 'ruck' : 'tackle');
}

test('Rush Defence: +1 on the first brown die against Hit Ups only', () => {
  for (const pos of OUTSIDE_BACKS) {
    DICE[pos].faces.forEach((face, f) => {
      if (face.kind !== 'run') return;
      const tackleStep = roll(attackWith([null, 'rush-defence'], pos), dice(f)).state;
      for (let a = 0; a < 6; a++) {
        for (let b = 0; b < 6; b++) {
          const { state, events } = roll(tackleStep, dice(a, b));
          const want = cardTackle(a, b, tackleStep.step.intensity, { special: !!face.special, firstBonus: face.special ? 0 : 1 });
          assert.equal(tackleOutcome()(events, state), want, `${pos} ${face.label} dice ${a},${b}`);
          const t = events.find(e => e.type === 'tackle' || e.type === 'lineBreak');
          assert.equal(t.bonus, face.special ? 0 : 1);
        }
      }
    });
  }
});

test('Jackal: either Big Hit contests rucks against Hit Ups up to 5, and VIDEO REF wins them', () => {
  const F_HIT_UP_5 = 0;
  const step = roll(attackWith([null, 'jackal'], 'F'), dice(F_HIT_UP_5)).state;
  assert.equal(step.step.ruck, true, 'a Hit Up of 5 can be contested');
  for (let a = 0; a < 6; a++) {
    for (let b = 0; b < 6; b++) {
      const { state, events } = roll(step, dice(a, b));
      assert.equal(tackleOutcome()(events, state), cardTackle(a, b, 5, { special: false, ruckMax: 5, ruckOnSecond: true }), `dice ${a},${b}`);
    }
  }
  // Never against a big move.
  const special = roll(attackWith([null, 'jackal'], 'F'), dice(3)).state;
  assert.equal(special.step.ruck, false);
  // The ruck: RUCK WIN or VIDEO REF steals it; only the video ref is the card's doing.
  const ruck = carded([null, 'jackal'], { step: { type: 'roll', purpose: 'ruck', dice: ['K'], team: 1 } });
  for (let k = 0; k < 6; k++) {
    const { state, events } = roll(ruck, dice(k));
    const result = DICE.K.faces[k].result;
    const won = result === 'ruck' || result === 'video';
    assert.equal(state.attacker, won ? 1 : 0, `ruck face ${k}`);
    assert.equal(played(events).length, result === 'video' ? 1 : 0);
  }
  // Without the card the video ref does nothing.
  const noCard = roll(carded([null, null], { step: { type: 'roll', purpose: 'ruck', dice: ['K'], team: 1 } }), dice(4)).state;
  assert.equal(noCard.attacker, 0);
});

test('Fortress: the other side\'s big moves are 2 lower against you, never below 1, Hit Ups unchanged', () => {
  for (const pos of OUTSIDE_BACKS) {
    DICE[pos].faces.forEach((face, f) => {
      if (face.kind !== 'run') return;
      const { events } = roll(attackWith([null, 'fortress'], pos), dice(f));
      const run = runOf(events);
      assert.equal(run.intensity, face.special ? face.value - 2 : face.value, `${pos} ${face.label}`);
      assert.equal(run.fortress, face.special ? 2 : 0);
      // Your own Fortress does nothing when you attack.
      assert.equal(runOf(roll(attackWith(['fortress', null], pos), dice(f)).events).intensity, face.value);
    });
  }
  // A big move lowered to 4 still can't be contested at the ruck.
  assert.equal(roll(attackWith([null, 'fortress'], 'F'), dice(3)).state.step.ruck, false);
  // Floors at 1, injuries and all.
  const hurt = attackWith([null, 'fortress'], 'F', { injuries: [{ F: 9 }, {}] });
  assert.equal(roll(hurt, dice(3)).state.step.intensity, 1);
});

test('Clinical Finisher: one failed try roll a match is rolled again', () => {
  const tryStep = { type: 'roll', purpose: 'try', dice: ['K'], team: 0, carrier: 'W', videos: 0 };
  for (const [face, what] of [[3, 'noTry'], [5, 'heldUp']]) {
    const m = carded(['clinical', null], { step: tryStep });
    const first = roll(m, dice(face));
    assert.deepEqual(played(first.events).map(e => e.what), [what]);
    assert.equal(first.state.step.purpose, 'try', 'roll again');
    assert.equal(first.state.step.rerolled, 1);
    assert.equal(first.state.attacker, 0);
    assert.equal(first.state.teams[0].cardUses.tryRerolls, 1);
    // The second failure is final.
    const second = roll(first.state, dice(3));
    assert.equal(second.state.attacker, 1);
    assert.equal(played(second.events).length, 0);
  }
  // A try needs no card.
  const scored = roll(carded(['clinical', null], { step: tryStep }), dice(0));
  assert.equal(played(scored.events).length, 0);
  assert.equal(scored.state.teams[0].cardUses.tryRerolls, 0);
  // Used up in the first half, it stays used up after half time.
  const ht = carded(['clinical', null], { step: { type: 'halftime' }, scores: [15, 0] });
  ht.teams[0].cardUses.tryRerolls = 1;
  const after = act(ht, { type: 'continue' }).state;
  assert.equal(after.teams[0].cardUses.tryRerolls, 1);
  assert.equal(roll(carded(['clinical', null], { step: tryStep, half: 2 }), dice(3)).state.step.purpose, 'try', 'fresh in a new match');
});

test('Set-Piece Kings: resets and crooked throws go their way, and a won set piece gives +1 on the next run', () => {
  const setpiece = (piece, feeder) => ({ type: 'roll', purpose: 'setpiece', dice: ['R'], team: feeder, piece });
  for (const kings of [0, 1]) {
    for (const feeder of [0, 1]) {
      for (const piece of ['scrum', 'lineout']) {
        const cards = kings === 0 ? ['set-piece-kings', null] : [null, 'set-piece-kings'];
        const { state, events } = roll(carded(cards, { step: setpiece(piece, feeder), attacker: feeder }), dice(3));
        assert.equal(state.attacker, kings, `${piece} fed by ${feeder}, kings ${kings}`);
        assert.equal(state.quickTap, 1);
        assert.deepEqual(played(events).map(e => [e.team, e.what]), [[kings, piece === 'scrum' ? 'reset' : 'notstraight']]);
      }
    }
  }
  // Winning your own feed: +1 for one run.
  const won = roll(carded(['set-piece-kings', null], { step: setpiece('scrum', 0) }), dice(0));
  assert.deepEqual(played(won.events).map(e => e.what), ['advantage']);
  assert.equal(won.state.quickTap, 1);
  let s = roll(won.state, dice(0)).state; // Scrum Half Hit Up 4
  assert.equal(s.step.intensity, 5);
  const tackled = roll(s, dice(4, 4));
  assert.equal(tackled.state.quickTap, 0);
  assert.ok(tackled.events.some(e => e.type === 'advantageOver'));
  // The other side winning the ball gets nothing extra.
  const lost = roll(carded([null, 'set-piece-kings'], { step: setpiece('scrum', 0) }), dice(0));
  assert.equal(lost.state.quickTap, 0);
  assert.equal(played(lost.events).length, 0);
});

test('Squeaky Clean: once a match, a penalty against on their own feed becomes a penalty to them', () => {
  const step = { type: 'roll', purpose: 'setpiece', dice: ['R'], team: 0, piece: 'scrum' };
  const AGAINST = 5;
  const first = roll(carded(['squeaky-clean', null], { step }), dice(AGAINST));
  assert.deepEqual(played(first.events).map(e => e.what), ['penalty']);
  assert.equal(first.state.step.purpose, 'penalty');
  assert.equal(first.state.step.team, 0);
  assert.equal(first.events.find(e => e.type === 'setPiece').outcome, 'penaltyWon');
  // Only once.
  const again = carded(['squeaky-clean', null], { step });
  again.teams[0].cardUses.ownFeedPenalty = 1;
  assert.equal(roll(again, dice(AGAINST)).state.step.team, 1);
  // Only on their own feed: the other side's penalty against goes to Squeaky Clean anyway.
  const theirFeed = roll(carded(['squeaky-clean', null], { step: { ...step, team: 1 } }), dice(AGAINST));
  assert.equal(theirFeed.state.step.team, 0);
  assert.equal(played(theirFeed.events).length, 0);
  assert.equal(theirFeed.state.teams[0].cardUses.ownFeedPenalty, 0);
});

test('the draft: three different cards, the toss loser picks first, the winner from the other two', () => {
  const counts = Object.fromEntries(CARD_IDS.map(id => [id, 0]));
  const DEALS = 3000;
  for (let g = 0; g < DEALS; g++) {
    const rng = seededRng(g + 5);
    const caller = g % 2;
    let m = newMatch({ mode: '2p', cards: true, tossCaller: caller });
    const toss = act(m, { type: 'choose', value: g % 3 ? 'heads' : 'tails' }, rng);
    m = toss.state;
    const deal = toss.events.find(e => e.type === 'deal');
    assert.equal(deal.cards.length, 3);
    assert.equal(new Set(deal.cards).size, 3, 'three different cards');
    deal.cards.forEach(id => counts[id]++);
    const loser = 1 - m.firstReceiver;
    assert.equal(deal.first, loser);
    assert.deepEqual(m.step, { type: 'choose', purpose: 'draft', team: loser, options: deal.cards, first: true });
    assert.ok(!isLegal(m, { type: 'choose', value: CARD_IDS.find(id => !deal.cards.includes(id)) }), 'only dealt cards');
    const firstPick = deal.cards[g % 3];
    m = choose(m, firstPick).state;
    assert.equal(m.teams[loser].card, firstPick);
    assert.equal(m.step.team, m.firstReceiver);
    assert.deepEqual(m.step.options, deal.cards.filter(id => id !== firstPick));
    assert.ok(!isLegal(m, { type: 'choose', value: firstPick }), "can't take the same card");
    const second = m.step.options[g % 2];
    const done = choose(m, second);
    m = done.state;
    assert.equal(m.teams[m.firstReceiver].card, second);
    assert.notEqual(m.teams[0].card, m.teams[1].card);
    assert.equal(m.attacker, m.firstReceiver, 'the toss winner receives the kick-off');
    assert.deepEqual(m.step.dice, ['S']);
    assert.deepEqual(done.events.map(e => e.type), ['draft', 'possession']);
  }
  // Every card is dealt about a quarter of the time.
  for (const id of CARD_IDS) assert.ok(Math.abs(counts[id] / DEALS - 0.25) < 0.035, `${id} dealt ${counts[id]} times`);
  // With cards off there is no draft.
  const off = act(newMatch({ mode: '2p' }), { type: 'choose', value: 'heads' }, seededRng(1));
  assert.ok(!off.events.some(e => e.type === 'deal'));
  assert.equal(off.state.step.purpose, 'attack');
});

// The odds the game shows, checked by playing every face and every pair of
// tackle dice through the engine.
function counted(m, team, pos) {
  const start = attackWith([m.teams[0].card, m.teams[1].card], pos, { sinBin: [false, m.teams[1].sinBin], yellows: [0, m.teams[1].yellows] });
  let lineBreak = 0;
  let error = 0;
  for (let f = 0; f < 6; f++) {
    const { state, events } = roll(start, dice(f));
    if (events.some(e => e.type === 'error' || e.type === 'intercept')) error += 1 / 6;
    if (state.step.purpose !== 'tackle') continue;
    for (let a = 0; a < 6; a++) {
      for (let b = 0; b < 6; b++) if (roll(state, dice(a, b)).events.some(e => e.type === 'lineBreak')) lineBreak += 1 / 216;
    }
  }
  return { lineBreak, error };
}

test('pass odds with any card on either side match a count of every roll', () => {
  const combos = [[null, null], ...CARD_IDS.map(id => [id, null]), ...CARD_IDS.map(id => [null, id])];
  for (const cards of combos) {
    for (const sinBin of [false, true]) {
      const m = carded(cards, { sinBin: [false, sinBin], yellows: [0, sinBin ? 1 : 0] });
      for (const pos of OUTSIDE_BACKS) {
        const shown = receiverOdds(m, 0, pos);
        const real = counted(m, 0, pos);
        const label = `${cards.join('/')} ${pos}${sinBin ? ' sin bin' : ''}`;
        assert.ok(Math.abs(shown.lineBreak - real.lineBreak) < 1e-9, `${label}: break ${shown.lineBreak} vs ${real.lineBreak}`);
        assert.ok(Math.abs(shown.error - real.error) < 1e-9, `${label}: error ${shown.error} vs ${real.error}`);
      }
    }
  }
  // A card on each side at once.
  const both = carded(['big-pack', 'rush-defence']);
  for (const pos of OUTSIDE_BACKS) assert.ok(Math.abs(receiverOdds(both, 0, pos).lineBreak - counted(both, 0, pos).lineBreak) < 1e-9);
});

test('breakChance with a first-die bonus counts the 36 pairs', () => {
  for (let intensity = 1; intensity <= 10; intensity++) {
    for (const bonus of [0, 1]) {
      let n = 0;
      for (let a = 0; a < 6; a++) for (let b = 0; b < 6; b++) if (cardTackle(a, b, intensity, { special: true, firstBonus: bonus }) === 'break') n++;
      assert.equal(breakChance(intensity, 0, false, bonus), n / 36, `intensity ${intensity} bonus ${bonus}`);
    }
  }
});
