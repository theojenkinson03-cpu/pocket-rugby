// Team cards: every card's effect at every rarity, played through the engine
// with exact dice, against the same move without the card. Then the draft
// and its rarities, and the odds the game shows with cards in play, checked
// by counting every roll.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { act, breakChance, draftRarity, isLegal, kickChance, migrate, newMatch, receiverOdds, seededRng, VERSION } from '../js/engine.js';
import { CARD_BY_ID, CARD_IDS, CARDS, cardEffects, cardTier, catchUp, DEAL_SIZE, RARITIES, RARITY_IDS, rollRarity, teamCard } from '../js/cards.js';
import { DICE } from '../js/dice.js';
import { choose, dice, OUTSIDE_BACKS, roll, stateAt } from './helpers.mjs';

// A state with the given team cards: [attacking side's, defending side's],
// each an id ('jackal', a Common card) or an id and a rarity ('jackal:mythic').
function carded(cards, opts = {}) {
  const m = stateAt(opts);
  m.cards = true;
  m.teams.forEach((t, i) => {
    const [id, rarity] = (cards[i] ?? '').split(':');
    t.card = id || null;
    t.cardRarity = id ? rarity || 'common' : null;
  });
  return m;
}

const attackWith = (cards, pos, opts = {}) => carded(cards, { carrier: pos, ...opts });
const runOf = events => events.find(e => e.type === 'run');
const played = events => events.filter(e => e.type === 'cardPlayed');
const KNOWN_EFFECTS = ['runBonus', 'faceSwap', 'passToDrop', 'kickBonus', 'tackleBonus', 'ruckMax', 'ruckOnSecond', 'ruckOnSpecial', 'ruckAlsoWins',
  'specialDefence', 'hitUpDefence', 'hitUpDefenceFrom', 'setPieceTies', 'setPieceAdvantage', 'ownFeedWins', 'stealFeed', 'uses'];

test('twelve cards, each in four rarities with a name, a kind, a description and only known effects', () => {
  assert.equal(CARDS.length, 12);
  assert.equal(new Set(CARD_IDS).size, 12, 'ids are unique');
  assert.equal(new Set(CARDS.map(c => c.name)).size, 12, 'names are unique');
  assert.deepEqual(RARITY_IDS, ['common', 'rare', 'epic', 'mythic']);
  assert.ok(Math.abs(RARITIES.reduce((n, r) => n + r.odds, 0) - 1) < 1e-12, 'the odds add up to 1');
  assert.ok(RARITIES.every((r, i) => i === 0 || r.odds < RARITIES[i - 1].odds), 'each rarity is rarer than the one below');
  for (const c of CARDS) {
    assert.ok(c.name && c.tag, c.id);
    assert.deepEqual(Object.keys(c.tiers), RARITY_IDS, `${c.id}: one of each rarity`);
    for (const r of RARITY_IDS) {
      const t = cardTier(c.id, r);
      assert.deepEqual([t.id, t.name, t.tag, t.rarity], [c.id, c.name, c.tag, r]);
      assert.ok(t.text.endsWith('.') && !/undefined|NaN/.test(t.text), `${c.id} ${r}: text`);
      for (const key of Object.keys(t.effects)) assert.ok(KNOWN_EFFECTS.includes(key), `${c.id} ${r}: unknown effect ${key}`);
      assert.ok(Object.isFrozen(t));
    }
    assert.equal(new Set(RARITY_IDS.map(r => c.tiers[r].text)).size, 4, `${c.id}: each rarity reads differently`);
  }
  assert.equal(CARD_BY_ID['sure-hands'].name, 'Sure Hands');
  assert.equal(cardTier('jackal').rarity, 'common', 'Common by default');
  assert.equal(cardTier('jackal', 'nonsense').rarity, 'common');
  assert.equal(cardTier('nonsense'), null);
  assert.equal(DEAL_SIZE, 3);
  assert.deepEqual(cardEffects(stateAt(), 0), {}, 'no card, no effects');
  assert.ok(Object.isFrozen(cardEffects(stateAt(), 0)));
  assert.equal(teamCard(stateAt(), 0), null);
  const m = carded(['fortress:epic', 'fortress']);
  assert.deepEqual([teamCard(m, 0).rarity, cardEffects(m, 0).specialDefence], ['epic', 4]);
  assert.deepEqual([teamCard(m, 1).rarity, cardEffects(m, 1).specialDefence], ['common', 2]);
  // A card from before rarities (no rarity saved) is Common.
  m.teams[0].cardRarity = undefined;
  assert.equal(cardEffects(m, 0).specialDefence, 2);
});

// Measured by scripts/balance-cards.mjs: how far each card lifts the win
// rate above 50% against a side with no card, over 10,000 matches.
const BANDS = { common: [0.06, 0.1], rare: [0.1, 0.145], epic: [0.145, 0.2], mythic: [0.2, 0.29] };

test('each rarity is measured stronger than the one below, in a band of its own', () => {
  for (const c of CARDS) {
    const values = RARITY_IDS.map(r => c.tiers[r].value);
    assert.ok(values.every((v, i) => i === 0 || v > values[i - 1]), `${c.id}: ${values}`);
    RARITY_IDS.forEach((r, i) => assert.ok(values[i] >= BANDS[r][0] && values[i] <= BANDS[r][1], `${c.id} ${r} value ${values[i]}`));
  }
  // Every card of a rarity beats every card of the rarity below.
  for (let i = 1; i < RARITY_IDS.length; i++) {
    const below = Math.max(...CARDS.map(c => c.tiers[RARITY_IDS[i - 1]].value));
    const above = Math.min(...CARDS.map(c => c.tiers[RARITY_IDS[i]].value));
    assert.ok(above > below, `${RARITY_IDS[i]} ${above} over ${RARITY_IDS[i - 1]} ${below}`);
  }
});

// Whether effects `hi` keep everything `lo` has: numbers at least as big,
// lists at least as long, switches still on, uses at least as generous.
const USES_RANK = { match: 1, half: 2, try: 10, always: 100 };
const usesRank = limit => (limit.per === 'always' ? USES_RANK.always : USES_RANK[limit.per] * limit.n);
function covers(hi, lo) {
  return Object.entries(lo).every(([key, low]) => {
    const high = hi[key];
    if (high === undefined) return false;
    if (key === 'hitUpDefenceFrom') return high <= low;
    if (typeof low === 'number') return high >= low;
    if (typeof low === 'boolean' || typeof low === 'string') return high === low;
    if (Array.isArray(low)) return low.every(x => high.includes(x));
    if (key === 'uses') return Object.entries(low).every(([k, l]) => high[k] && usesRank(high[k]) >= usesRank(l));
    return covers(high, low);
  });
}

test('each rarity keeps everything the one below has, and adds to it', () => {
  for (const c of CARDS) {
    for (let i = 1; i < RARITY_IDS.length; i++) {
      const [lo, hi] = [c.tiers[RARITY_IDS[i - 1]].effects, c.tiers[RARITY_IDS[i]].effects];
      assert.ok(covers(hi, lo), `${c.id} ${RARITY_IDS[i]} keeps ${RARITY_IDS[i - 1]}`);
      assert.ok(!covers(lo, hi), `${c.id} ${RARITY_IDS[i]} adds something`);
    }
  }
  assert.ok(!covers({ uses: { tryRerolls: { n: 1, per: 'match' } } }, { uses: { tryRerolls: { n: 1, per: 'half' } } }));
  assert.ok(covers({ kickBonus: { conversion: 2, penalty: 2 } }, { kickBonus: { conversion: 2 } }));
});

test('rarity odds: Common 55%, Rare 28%, Epic 13%, Mythic 4%', () => {
  const rng = seededRng(77);
  const counts = Object.fromEntries(RARITY_IDS.map(r => [r, 0]));
  const N = 200000;
  for (let i = 0; i < N; i++) counts[rollRarity(rng)]++;
  for (const r of RARITIES) assert.ok(Math.abs(counts[r.id] / N - r.odds) < 0.004, `${r.id} ${counts[r.id] / N}`);
  // The boundaries, exactly.
  const at = x => rollRarity(() => x);
  assert.deepEqual([at(0), at(0.5499), at(0.5501), at(0.8299), at(0.8301), at(0.9599), at(0.9601), at(0.9999)], ['common', 'common', 'rare', 'rare', 'epic', 'epic', 'mythic', 'mythic']);
});

test('Big Pack: Forwards\' Hit Ups +1 and Line Break 8; nobody else changes', () => {
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

test('Sure Hands: the Outside Backs never knock on or find touch', () => {
  for (const [f, what] of [[5, 'knockon'], [4, 'touch']]) {
    assert.equal(roll(attackWith([null, null], 'W'), dice(f)).state.step.purpose, 'setpiece');
    const { state, events } = roll(attackWith(['sure-hands', null], 'W'), dice(f));
    assert.deepEqual(played(events).map(e => e.what), [what]);
    assert.equal(state.step.purpose, 'pass');
    assert.equal(state.teams[0].players.W.errors, 0);
  }
  // The Forwards' knock on is still a knock on, and the Fly Half still finds touch.
  assert.equal(roll(attackWith(['sure-hands', null], 'F'), dice(5)).state.step.piece, 'scrum');
  assert.equal(roll(attackWith(['sure-hands', null], 'B'), dice(5)).state.step.piece, 'lineout');
});

test('Up and Under: High Ball 8, Fly Half Hit Ups +1, and the Fly Half keeps it in play', () => {
  const runs = [[0, 4], [1, 5], [2, 8]];
  for (const [f, want] of runs) {
    const { state } = roll(attackWith(['up-and-under', null], 'B'), dice(f));
    assert.equal(state.step.intensity, want, `face ${f}`);
  }
  const { state, events } = roll(attackWith(['up-and-under', null], 'B'), dice(5));
  assert.equal(state.step.purpose, 'pass');
  assert.deepEqual(played(events).map(e => e.what), ['touch']);
  // Only the Fly Half: the Outside Backs still find touch.
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

test('Drop-Goal Artist: +2 on drop goals and the Outside Backs\' open pass is a drop-goal chance', () => {
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
function cardTackle(a, b, intensity, { special, perDie = 0, bonus = [0, 0], ruckMax = 4, ruckOnSecond = false, onSpecial = false }) {
  const [x, y] = [DICE.D.faces[a], DICE.D.faces[b]];
  const big = f => f.kind === 'bighit';
  const canRuck = special ? onSpecial : intensity <= ruckMax;
  if (canRuck && (big(x) || (ruckOnSecond && big(y)))) return 'ruck';
  if (big(y)) return 'tackle';
  return x.value + perDie + bonus[0] + y.value + perDie + bonus[1] >= intensity ? 'tackle' : 'break';
}

function tackleOutcome(m) {
  return (events, state) => (events.some(e => e.type === 'lineBreak') ? 'break' : state.step.purpose === 'ruck' ? 'ruck' : 'tackle');
}

// Rush Defence at each rarity: +1 on [the first die, the second die], against [Hit Ups, big moves].
const RUSH = {
  common: { hitUp: [1, 0], special: [0, 0] },
  rare: { hitUp: [1, 1], special: [0, 0] },
  epic: { hitUp: [1, 1], special: [0, 0] },
  mythic: { hitUp: [1, 1], special: [1, 0] },
};

test('Rush Defence: +1 on the first brown die against Hit Ups; both dice, big moves and ruck contests at higher rarities', () => {
  for (const rarity of RARITY_IDS) {
    const ruckOnSecond = rarity === 'epic' || rarity === 'mythic';
    for (const pos of OUTSIDE_BACKS) {
      DICE[pos].faces.forEach((face, f) => {
        if (face.kind !== 'run') return;
        const tackleStep = roll(attackWith([null, `rush-defence:${rarity}`], pos), dice(f)).state;
        const bonus = RUSH[rarity][face.special ? 'special' : 'hitUp'];
        for (let a = 0; a < 6; a++) {
          for (let b = 0; b < 6; b++) {
            const { state, events } = roll(tackleStep, dice(a, b));
            const want = cardTackle(a, b, tackleStep.step.intensity, { special: !!face.special, bonus, ruckOnSecond });
            assert.equal(tackleOutcome()(events, state), want, `${rarity} ${pos} ${face.label} dice ${a},${b}`);
            const t = events.find(e => e.type === 'tackle' || e.type === 'lineBreak');
            assert.deepEqual(t.bonus, bonus);
          }
        }
      });
    }
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

// ---- Higher rarities -----------------------------------------------------------
// Each test plays the new things a rarity adds, with exact dice.

const intensityOf = (cards, pos, face) => roll(attackWith(cards, pos), dice(face)).state.step.intensity;
const outcomeOf = (cards, pos, face, opts = {}) => roll(attackWith(cards, pos, opts), dice(face));
const kickWith = (card, kick, k, range = 3) => {
  const m = carded([card, null], { step: { type: 'roll', purpose: 'kick', dice: ['K'], team: 0, kick, range, kicker: kick === 'drop' ? 'C' : 'B' }, carrier: 'C' });
  return roll(m, dice(k)).events.find(e => e.type === 'kick');
};
const openPass = pos => DICE[pos].faces.findIndex(f => f.kind === 'pass' && !f.to);

test('Big Pack: Hit Ups +2 (Rare), no knock ons (Epic), then Hit Ups +3, Line Break 10 and the Scrum Half +2 behind them (Mythic)', () => {
  const [HU5, HU4, LB, KO] = [0, 2, 3, 5];
  assert.deepEqual([HU5, HU4, LB].map(f => intensityOf(['big-pack:rare', null], 'F', f)), [7, 6, 8]);
  assert.equal(outcomeOf(['big-pack:rare', null], 'F', KO).state.step.piece, 'scrum', 'Rare still knocks on');
  const epic = outcomeOf(['big-pack:epic', null], 'F', KO);
  assert.deepEqual([epic.state.step.purpose, played(epic.events).map(e => [e.what, e.rarity])], ['pass', [['knockon', 'epic']]]);
  assert.deepEqual([HU5, HU4, LB].map(f => intensityOf(['big-pack:mythic', null], 'F', f)), [8, 7, 10]);
  assert.equal(intensityOf(['big-pack:mythic', null], 'S', 0), 6, "the Scrum Half's Hit Up 4");
  assert.equal(intensityOf(['big-pack:epic', null], 'S', 0), 4, 'only the Mythic helps the Scrum Half');
  assert.equal(outcomeOf(['big-pack:mythic', null], 'F', KO).state.step.purpose, 'pass');
});

test('Midfield Maestro: Centre Hit Ups +1 (Rare), Thru the Gap 9 and +20 m drop goals (Epic), Hit Ups +2 and the open pass a drop chance (Mythic)', () => {
  const [HU4, HU5, TTG] = [0, 1, 2];
  assert.deepEqual([HU4, HU5, TTG].map(f => intensityOf(['midfield-maestro:rare', null], 'C', f)), [5, 6, 7]);
  assert.deepEqual([HU4, HU5, TTG].map(f => intensityOf(['midfield-maestro:epic', null], 'C', f)), [5, 6, 9]);
  assert.deepEqual([HU4, HU5, TTG].map(f => intensityOf(['midfield-maestro:mythic', null], 'C', f)), [6, 7, 9]);
  assert.equal(kickWith('midfield-maestro:rare', 'drop', 0).bonus, 0);
  assert.equal(kickWith('midfield-maestro:epic', 'drop', 0).bonus, 2);
  assert.equal(kickWith('midfield-maestro:epic', 'conversion', 0).bonus, 0, 'drop goals only');
  assert.equal(outcomeOf(['midfield-maestro:epic', null], 'C', openPass('C')).state.step.purpose, 'pass');
  const mythic = outcomeOf(['midfield-maestro:mythic', null], 'C', openPass('C'));
  assert.deepEqual([mythic.state.step.purpose, mythic.state.step.kick], ['range', 'drop']);
  assert.deepEqual(played(mythic.events).map(e => e.what), ['dropChance']);
  // Still never intercepted.
  assert.equal(outcomeOf(['midfield-maestro:mythic', null], 'C', 5).state.attacker, 0);
});

test('Sure Hands: Hit Ups +1 (Rare), Hit Ups +2 and Into the Corner 10 (Epic), and the Fly Half keeps it in play too (Mythic)', () => {
  const [HU4, HU5, ITC] = [0, 1, 2];
  const B_TOUCH = 5;
  assert.deepEqual([HU4, HU5, ITC].map(f => intensityOf(['sure-hands:rare', null], 'W', f)), [5, 6, 8]);
  assert.equal(outcomeOf(['sure-hands:rare', null], 'B', B_TOUCH).state.step.piece, 'lineout');
  assert.deepEqual([HU4, HU5, ITC].map(f => intensityOf(['sure-hands:epic', null], 'W', f)), [6, 7, 10]);
  assert.equal(outcomeOf(['sure-hands:epic', null], 'B', B_TOUCH).state.step.piece, 'lineout');
  const mythic = outcomeOf(['sure-hands:mythic', null], 'B', B_TOUCH);
  assert.deepEqual([mythic.state.step.purpose, played(mythic.events).map(e => e.what)], ['pass', ['touch']]);
  assert.deepEqual([HU4, HU5, ITC].map(f => intensityOf(['sure-hands:mythic', null], 'W', f)), [6, 7, 10]);
  for (const [f, what] of [[5, 'knockon'], [4, 'touch']]) assert.equal(outcomeOf(['sure-hands:mythic', null], 'W', f).state.step.purpose, 'pass', what);
  assert.equal(outcomeOf(['sure-hands:mythic', null], 'F', 5).state.step.piece, 'scrum', 'the Forwards still knock on');
});

test('Up and Under: +10 m on place kicks (Rare), High Ball 9, Hit Ups +2 and +10 m on every kick (Epic), High Ball 10 and +20 m (Mythic)', () => {
  const [HU3, HU4, HB] = [0, 1, 2];
  assert.deepEqual([HU3, HU4, HB].map(f => intensityOf(['up-and-under:rare', null], 'B', f)), [4, 5, 8]);
  assert.deepEqual(['conversion', 'penalty', 'drop'].map(k => kickWith('up-and-under:rare', k, 0).bonus), [1, 1, 0]);
  assert.deepEqual([HU3, HU4, HB].map(f => intensityOf(['up-and-under:epic', null], 'B', f)), [5, 6, 9]);
  assert.deepEqual(['conversion', 'penalty', 'drop'].map(k => kickWith('up-and-under:epic', k, 0).bonus), [1, 1, 1]);
  assert.deepEqual([HU3, HU4, HB].map(f => intensityOf(['up-and-under:mythic', null], 'B', f)), [5, 6, 10]);
  assert.deepEqual(['conversion', 'penalty', 'drop'].map(k => kickWith('up-and-under:mythic', k, 0).bonus), [2, 2, 2]);
});

test('Golden Boot: +30 m and drop goals +10 m (Rare), place kicks never miss (Epic), every kick never misses and the Fly Half and Centres drop at will (Mythic)', () => {
  assert.deepEqual(['conversion', 'penalty', 'drop'].map(k => kickWith('golden-boot:rare', k, 0).bonus), [3, 3, 1]);
  assert.deepEqual(['conversion', 'penalty', 'drop'].map(k => kickWith('golden-boot:epic', k, 0).bonus), [4, 4, 3]);
  assert.deepEqual(['conversion', 'penalty', 'drop'].map(k => kickWith('golden-boot:mythic', k, 0).bonus), [4, 4, 4]);
  // Never misses: the shortest kick (1) from the longest range (5).
  const SHORTEST = DICE.K.faces.findIndex(f => f.kick === 1);
  for (const kick of ['conversion', 'penalty']) assert.ok(kickWith('golden-boot:epic', kick, SHORTEST, 5).good, kick);
  assert.ok(!kickWith('golden-boot:epic', 'drop', SHORTEST, 5).good, 'Epic drop goals can still miss');
  assert.ok(kickWith('golden-boot:mythic', 'drop', SHORTEST, 5).good);
  for (const pos of ['B', 'C']) assert.equal(outcomeOf(['golden-boot:mythic', null], pos, openPass(pos)).state.step.kick, 'drop', pos);
  for (const pos of ['F', 'W']) assert.equal(outcomeOf(['golden-boot:mythic', null], pos, openPass(pos)).state.step.purpose, 'pass', pos);
  assert.equal(outcomeOf(['golden-boot:epic', null], 'B', openPass('B')).state.step.purpose, 'pass');
});

test('Drop-Goal Artist: +30 m (Rare), never misses and the Fly Half joins in (Epic), every ‹Pass› face (Mythic)', () => {
  const SHORTEST = DICE.K.faces.findIndex(f => f.kick === 1);
  assert.equal(kickWith('drop-artist:rare', 'drop', 0).bonus, 3);
  assert.equal(outcomeOf(['drop-artist:rare', null], 'B', openPass('B')).state.step.purpose, 'pass');
  assert.equal(kickWith('drop-artist:epic', 'drop', 0).bonus, 4);
  assert.ok(kickWith('drop-artist:epic', 'drop', SHORTEST, 5).good);
  assert.equal(kickWith('drop-artist:epic', 'penalty', 0).bonus, 0, 'drop goals only');
  const want = { rare: ['W'], epic: ['W', 'B'], mythic: ['F', 'C', 'W', 'B'] };
  for (const [rarity, drops] of Object.entries(want)) {
    for (const pos of OUTSIDE_BACKS) {
      const { state } = outcomeOf([`drop-artist:${rarity}`, null], pos, openPass(pos));
      assert.equal(state.step.kick === 'drop', drops.includes(pos), `${rarity} ${pos}`);
    }
  }
});

test('Jackal: NO TRY wins the ruck too (Rare), big moves can be contested (Epic), every ruck roll wins (Mythic)', () => {
  const ruckWith = card => carded([null, card], { step: { type: 'roll', purpose: 'ruck', dice: ['K'], team: 1 } });
  const wins = { common: ['ruck', 'video'], rare: ['ruck', 'video', 'notry'], epic: ['ruck', 'video', 'notry'], mythic: ['ruck', 'video', 'notry', 'try'] };
  for (const [rarity, results] of Object.entries(wins)) {
    for (let k = 0; k < 6; k++) {
      const result = DICE.K.faces[k].result;
      const { state, events } = roll(ruckWith(`jackal:${rarity}`), dice(k));
      assert.equal(state.attacker === 1, results.includes(result), `${rarity} ruck ${result}`);
      const plays = played(events);
      assert.deepEqual(plays.map(e => e.result), results.includes(result) && result !== 'ruck' ? [result] : [], `${rarity} ${result}: the card played`);
    }
  }
  // Big moves: contested from Epic, by a Big Hit on either die.
  const LB = 3;
  assert.equal(outcomeOf([null, 'jackal:rare'], 'F', LB).state.step.ruck, false);
  for (const rarity of ['epic', 'mythic']) {
    const step = outcomeOf([null, `jackal:${rarity}`], 'F', LB).state;
    assert.equal(step.step.ruck, true, rarity);
    for (let a = 0; a < 6; a++) {
      for (let b = 0; b < 6; b++) {
        const { state, events } = roll(step, dice(a, b));
        assert.equal(tackleOutcome()(events, state), cardTackle(a, b, 6, { special: true, ruckMax: 5, ruckOnSecond: true, onSpecial: true }), `${rarity} dice ${a},${b}`);
      }
    }
  }
});

test('Fortress: big moves −3 (Rare) and −4 (Epic), then Hit Ups of 5 −1 too (Mythic)', () => {
  const at = (rarity, pos, f) => runOf(roll(attackWith([null, `fortress:${rarity}`], pos), dice(f)).events);
  for (const [rarity, cut] of [['rare', 3], ['epic', 4], ['mythic', 4]]) {
    for (const pos of OUTSIDE_BACKS) {
      DICE[pos].faces.forEach((face, f) => {
        if (face.kind !== 'run') return;
        const hitUpCut = rarity === 'mythic' && face.value >= 5 ? 1 : 0;
        const run = at(rarity, pos, f);
        assert.equal(run.intensity, Math.max(1, face.value - (face.special ? cut : hitUpCut)), `${rarity} ${pos} ${face.label} ${face.value}`);
        assert.equal(run.fortress, face.special ? cut : hitUpCut);
      });
    }
  }
  // A Hit Up of 5 cut to 4 can be contested at the ruck.
  assert.equal(roll(attackWith([null, 'fortress:mythic'], 'F'), dice(0)).state.step.ruck, true);
  assert.equal(roll(attackWith([null, 'fortress:epic'], 'F'), dice(0)).state.step.ruck, false);
});

test('Clinical Finisher: once a half (Rare), every try attempt (Epic), up to twice on every attempt (Mythic)', () => {
  const tryStep = { type: 'roll', purpose: 'try', dice: ['K'], team: 0, carrier: 'W', videos: 0 };
  const NO_TRY = 3;
  // Rare: used in the first half, back after half time.
  const ht = carded(['clinical:rare', null], { step: { type: 'halftime' }, scores: [15, 0] });
  ht.teams[0].cardUses.tryRerolls = 1;
  assert.equal(act(ht, { type: 'continue' }).state.teams[0].cardUses.tryRerolls, 0);
  const rare = carded(['clinical:rare', null], { step: tryStep });
  rare.teams[0].cardUses.tryRerolls = 1;
  assert.equal(roll(rare, dice(NO_TRY)).state.attacker, 1, 'once a half means once');
  // Epic: one reroll on every attempt, counted on the attempt, not the match.
  let epic = roll(carded(['clinical:epic', null], { step: tryStep }), dice(NO_TRY));
  assert.deepEqual([epic.state.step.purpose, epic.state.step.rerolled, epic.state.teams[0].cardUses.tryRerolls], ['try', 1, 0]);
  epic = roll(epic.state, dice(NO_TRY));
  assert.equal(epic.state.attacker, 1, 'the second failure is final');
  const again = carded(['clinical:epic', null], { step: tryStep });
  again.teams[0].cardUses.tryRerolls = 5;
  assert.equal(roll(again, dice(NO_TRY)).state.step.purpose, 'try', 'a new attempt gets its reroll');
  // Mythic: twice on the same attempt.
  let mythic = roll(carded(['clinical:mythic', null], { step: tryStep }), dice(NO_TRY));
  mythic = roll(mythic.state, dice(5));
  assert.deepEqual([mythic.state.step.purpose, mythic.state.step.rerolled], ['try', 2]);
  assert.deepEqual(played(mythic.events).map(e => e.what), ['heldUp']);
  assert.equal(roll(mythic.state, dice(NO_TRY)).state.attacker, 1, 'the third failure is final');
  const scored = roll(mythic.state, dice(0));
  assert.equal(scored.state.teams[0].score, 5);
});

test('Set-Piece Kings: never lose your own feed (Rare), steal their lineouts (Epic), every scrum and lineout (Mythic)', () => {
  const setpiece = (piece, feeder) => ({ type: 'roll', purpose: 'setpiece', dice: ['R'], team: feeder, piece });
  // White die: 0 wins both, 1 wins the scrum and loses the lineout, 2 the other way round.
  const LOSE = { scrum: 2, lineout: 1 };
  const WIN = { scrum: 0, lineout: 0 };
  for (const rarity of RARITY_IDS) {
    const runs = { common: 1, rare: 1, epic: 2, mythic: 3 }[rarity];
    const steals = { common: [], rare: [], epic: ['lineout'], mythic: ['scrum', 'lineout'] }[rarity];
    for (const piece of ['scrum', 'lineout']) {
      // Their own feed, lost on the die.
      const own = roll(carded([`set-piece-kings:${rarity}`, null], { step: setpiece(piece, 0) }), dice(LOSE[piece]));
      const keeps = rarity !== 'common';
      assert.equal(own.state.attacker, keeps ? 0 : 1, `${rarity} own ${piece}`);
      assert.equal(played(own.events).some(e => e.what === 'ownFeed'), keeps);
      if (keeps) assert.deepEqual([own.state.quickTap, own.state.quickTapFrom], [runs, 'card']);
      // The other side's feed, won on the die.
      const theirs = roll(carded([`set-piece-kings:${rarity}`, null], { step: setpiece(piece, 1), attacker: 1 }), dice(WIN[piece]));
      const stolen = steals.includes(piece);
      assert.equal(theirs.state.attacker, stolen ? 0 : 1, `${rarity} their ${piece}`);
      assert.equal(played(theirs.events).some(e => e.what === 'steal'), stolen);
      if (stolen) assert.equal(theirs.state.quickTap, runs, 'a stolen ball carries the shove on');
    }
  }
  // Penalties are never stolen.
  const pen = roll(carded(['set-piece-kings:mythic', null], { step: setpiece('scrum', 1), attacker: 1 }), dice(4));
  assert.equal(pen.state.step.team, 1);
});

test('Squeaky Clean: always on your own feed (Rare), their feed once a match (Epic), never give away a set-piece penalty (Mythic)', () => {
  const step = feeder => ({ type: 'roll', purpose: 'setpiece', dice: ['R'], team: feeder, piece: 'scrum' });
  const [WON, AGAINST] = [4, 5];
  // Rare: every time, without counting.
  const rare = carded(['squeaky-clean:rare', null], { step: step(0) });
  rare.teams[0].cardUses.ownFeedPenalty = 3;
  const r = roll(rare, dice(AGAINST));
  assert.deepEqual([r.state.step.team, r.state.teams[0].cardUses.ownFeedPenalty], [0, 3]);
  // Their feed, PENALTY WON: theirs below Epic.
  assert.equal(roll(carded(['squeaky-clean:rare', null], { step: step(1), attacker: 1 }), dice(WON)).state.step.team, 1);
  // Epic: once a match.
  const epic = roll(carded(['squeaky-clean:epic', null], { step: step(1), attacker: 1 }), dice(WON));
  assert.deepEqual([epic.state.step.team, epic.state.teams[0].cardUses.theirFeedPenalty], [0, 1]);
  assert.deepEqual(played(epic.events).map(e => [e.team, e.what]), [[0, 'penalty']]);
  assert.equal(epic.events.find(e => e.type === 'setPiece').outcome, 'penaltyAgainst');
  const used = carded(['squeaky-clean:epic', null], { step: step(1), attacker: 1 });
  used.teams[0].cardUses.theirFeedPenalty = 1;
  assert.equal(roll(used, dice(WON)).state.step.team, 1);
  // Mythic: always, both feeds.
  const mythic = carded(['squeaky-clean:mythic', null], { step: step(1), attacker: 1 });
  mythic.teams[0].cardUses.theirFeedPenalty = 4;
  assert.equal(roll(mythic, dice(WON)).state.step.team, 0);
  assert.equal(roll(carded(['squeaky-clean:mythic', null], { step: step(0) }), dice(AGAINST)).state.step.team, 0);
  // The penalty against them on their feed was always theirs anyway.
  assert.equal(roll(carded(['squeaky-clean:mythic', null], { step: step(1), attacker: 1 }), dice(AGAINST)).state.step.team, 0);
});

test('catch-up: picking second, a card goes up one rarity when the first pick was rarer', () => {
  assert.equal(catchUp('mythic', 'common'), 'rare', 'one rarity, not all the way');
  assert.equal(catchUp('rare', 'common'), 'rare');
  assert.equal(catchUp('epic', 'rare'), 'epic');
  assert.equal(catchUp('mythic', 'epic'), 'mythic');
  assert.equal(catchUp('rare', 'rare'), 'rare', 'no catch-up from level');
  assert.equal(catchUp('common', 'epic'), 'epic', 'never down');
  // The first pick sees the cards as dealt; the second sees them caught up.
  let m = newMatch({ mode: '2p', cards: true });
  m = act(m, { type: 'choose', value: 'heads' }, () => 0.1).state;
  m.deal = ['jackal', 'fortress', 'clinical'];
  m.dealRarity = { jackal: 'mythic', fortress: 'common', clinical: 'epic' };
  m.step = { ...m.step, options: [...m.deal] };
  assert.deepEqual(m.deal.map(id => draftRarity(m, id)), ['mythic', 'common', 'epic']);
  m = choose(m, 'jackal').state;
  assert.deepEqual(m.step.options.map(id => draftRarity(m, id)), ['rare', 'mythic']);
  const { state, events } = choose(m, 'fortress');
  assert.equal(state.teams[state.firstReceiver].cardRarity, 'rare');
  assert.deepEqual(events.filter(e => e.type !== 'possession').map(e => [e.type, e.rarity ?? e.to, e.dealt ?? e.from]), [['draft', 'rare', 'common'], ['catchUp', 'rare', 'common']]);
  // Took the rarer card first? Nothing to catch up.
  let n = newMatch({ mode: '2p', cards: true });
  n = act(n, { type: 'choose', value: 'heads' }, () => 0.1).state;
  n.deal = ['jackal', 'fortress', 'clinical'];
  n.dealRarity = { jackal: 'common', fortress: 'rare', clinical: 'common' };
  n.step = { ...n.step, options: [...n.deal] };
  n = choose(n, 'jackal').state;
  const level = choose(n, 'fortress');
  assert.equal(level.state.teams[level.state.firstReceiver].cardRarity, 'rare');
  assert.ok(!level.events.some(e => e.type === 'catchUp'));
});

test('a saved match from before rarities loads with Common cards', () => {
  const old = carded(['jackal', 'fortress']);
  old.version = 2;
  old.deal = ['jackal', 'fortress', 'clinical'];
  delete old.dealRarity;
  delete old.quickTapFrom;
  for (const t of old.teams) {
    delete t.cardRarity;
    t.cardUses = { tryRerolls: 0, ownFeedPenalty: 1 };
  }
  const m = migrate(old);
  assert.equal(m.version, VERSION);
  assert.deepEqual(m.dealRarity, { jackal: 'common', fortress: 'common', clinical: 'common' });
  assert.deepEqual(m.teams.map(t => t.cardRarity), ['common', 'common']);
  assert.deepEqual(m.teams[0].cardUses, { tryRerolls: 0, ownFeedPenalty: 1, theirFeedPenalty: 0 });
  assert.equal(m.quickTapFrom, null);
});

test('the draft: three different cards, the toss loser picks first, the winner from the other two', () => {
  const counts = Object.fromEntries(CARD_IDS.map(id => [id, 0]));
  const rarities = Object.fromEntries(RARITY_IDS.map(r => [r, 0]));
  let catchUps = 0;
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
    // Each card at a rarity of its own.
    assert.deepEqual(Object.keys(deal.rarity).sort(), [...deal.cards].sort());
    assert.deepEqual(m.dealRarity, deal.rarity);
    for (const id of deal.cards) rarities[deal.rarity[id]]++;
    const loser = 1 - m.firstReceiver;
    assert.equal(deal.first, loser);
    assert.deepEqual(m.step, { type: 'choose', purpose: 'draft', team: loser, options: deal.cards, first: true });
    assert.ok(!isLegal(m, { type: 'choose', value: CARD_IDS.find(id => !deal.cards.includes(id)) }), 'only dealt cards');
    const firstPick = deal.cards[g % 3];
    const picked = choose(m, firstPick);
    m = picked.state;
    assert.equal(m.teams[loser].card, firstPick);
    assert.equal(m.teams[loser].cardRarity, deal.rarity[firstPick]);
    assert.equal(picked.events[0].rarity, deal.rarity[firstPick]);
    assert.equal(m.step.team, m.firstReceiver);
    assert.deepEqual(m.step.options, deal.cards.filter(id => id !== firstPick));
    assert.ok(!isLegal(m, { type: 'choose', value: firstPick }), "can't take the same card");
    const second = m.step.options[g % 2];
    const caughtUp = catchUp(deal.rarity[firstPick], deal.rarity[second]);
    assert.equal(draftRarity(m, second), caughtUp);
    const done = choose(m, second);
    m = done.state;
    assert.equal(m.teams[m.firstReceiver].card, second);
    assert.equal(m.teams[m.firstReceiver].cardRarity, caughtUp);
    if (caughtUp !== deal.rarity[second]) {
      catchUps++;
      assert.deepEqual(done.events.find(e => e.type === 'catchUp'), { type: 'catchUp', team: m.firstReceiver, card: second, from: deal.rarity[second], to: caughtUp });
      done.events = done.events.filter(e => e.type !== 'catchUp');
    }
    assert.notEqual(m.teams[0].card, m.teams[1].card);
    assert.equal(m.attacker, m.firstReceiver, 'the toss winner receives the kick-off');
    assert.deepEqual(m.step.dice, ['S']);
    assert.deepEqual(done.events.map(e => e.type), ['draft', 'possession']);
  }
  // Every card is dealt about a quarter of the time, at the rarities' odds.
  for (const id of CARD_IDS) assert.ok(Math.abs(counts[id] / DEALS - 0.25) < 0.035, `${id} dealt ${counts[id]} times`);
  for (const r of RARITIES) assert.ok(Math.abs(rarities[r.id] / (3 * DEALS) - r.odds) < 0.015, `${r.id} dealt ${rarities[r.id]} times`);
  assert.ok(catchUps > DEALS * 0.15, `the second pick caught up in ${catchUps} of ${DEALS} drafts`);
  // With cards off there is no draft.
  const off = act(newMatch({ mode: '2p' }), { type: 'choose', value: 'heads' }, seededRng(1));
  assert.ok(!off.events.some(e => e.type === 'deal'));
  assert.equal(off.state.step.purpose, 'attack');
});

// The odds the game shows, checked by playing every face and every pair of
// tackle dice through the engine.
function counted(m, team, pos) {
  const cardOf = t => (t.card ? `${t.card}:${t.cardRarity}` : null);
  const start = attackWith([cardOf(m.teams[0]), cardOf(m.teams[1])], pos, { sinBin: [false, m.teams[1].sinBin], yellows: [0, m.teams[1].yellows] });
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

test('pass odds with any card at any rarity on either side match a count of every roll', () => {
  const each = CARD_IDS.flatMap(id => RARITY_IDS.map(r => `${id}:${r}`));
  const combos = [[null, null], ...each.map(c => [c, null]), ...each.map(c => [null, c])];
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
  const both = carded(['big-pack:mythic', 'rush-defence:mythic']);
  for (const pos of OUTSIDE_BACKS) assert.ok(Math.abs(receiverOdds(both, 0, pos).lineBreak - counted(both, 0, pos).lineBreak) < 1e-9);
});

test('breakChance with a bonus on one or both dice counts the 36 pairs', () => {
  for (let intensity = 1; intensity <= 10; intensity++) {
    for (const bonus of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
      let n = 0;
      for (let a = 0; a < 6; a++) for (let b = 0; b < 6; b++) if (cardTackle(a, b, intensity, { special: true, bonus }) === 'break') n++;
      assert.equal(breakChance(intensity, 0, false, bonus), n / 36, `intensity ${intensity} bonus ${bonus}`);
    }
    assert.equal(breakChance(intensity, 0, false, 1), breakChance(intensity, 0, false, [1, 0]), 'a number is the first die');
  }
});
