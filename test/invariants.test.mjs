// Fuzzing: thousands of complete matches with random and CPU decisions. After
// every single action the whole state is checked against things that must
// always be true. Set FUZZ_MATCHES to play more.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { act, controllerOf, defenceModifier, isLegal, MATCH_LENGTHS, newMatch, QUICK_TAP_RUNS, seededRng } from '../js/engine.js';
import { cpuChoice } from '../js/ai.js';
import { CARD_BY_ID, CARD_IDS } from '../js/cards.js';
import { narrate } from '../js/commentary.js';
import { DICE, POSITIONS } from '../js/dice.js';
import { BROKEN_TEXT, RULES } from './helpers.mjs';

const MATCHES = Number(process.env.FUZZ_MATCHES || 1500);
const LENGTHS = Object.keys(MATCH_LENGTHS);
const POINTS_BY_KIND = { try: 5, conversion: 2, penalty: 3, drop: 3 };

// Records the random numbers an action uses so it can be replayed exactly.
function recording(rng) {
  const used = [];
  const wrapped = () => {
    const v = rng();
    used.push(v);
    return v;
  };
  wrapped.used = used;
  return wrapped;
}
const replay = values => {
  const queue = [...values];
  return () => queue.shift();
};

function pickAction(m, rng, style) {
  if (m.step.type === 'roll') return { type: 'roll' };
  if (m.step.type === 'halftime') return { type: 'continue' };
  if (style === 'random') return { type: 'choose', value: m.step.options[Math.floor(rng() * m.step.options.length)] };
  return { type: 'choose', value: cpuChoice({ ...m, cpuLevel: style }, rng) };
}

// A side's card effects, read straight from the card list.
const fx = (m, team) => CARD_BY_ID[m.teams[team].card]?.effects || {};
const PLAYER_SUMS = [['tries', 'tries'], ['carries', 'runs'], ['lineBreaks', 'lineBreaks'], ['tackles', 'tackles'], ['bigHits', 'bigHits'], ['turnovers', 'turnoversWon'], ['errors', 'errors']];

function checkCards(m, label) {
  const drafted = m.teams.map(t => t.card);
  if (!m.cards) {
    assert.deepEqual(drafted, [null, null], `${label}: no cards when they are off`);
    return;
  }
  if (m.attacker !== null) {
    assert.ok(drafted.every(id => CARD_IDS.includes(id)), `${label}: both sides have a card once play starts`);
    assert.notEqual(drafted[0], drafted[1], `${label}: different cards`);
    assert.ok(drafted.every(id => m.deal.includes(id)), `${label}: cards come from the deal`);
  }
  m.teams.forEach((t, i) => {
    for (const [key, used] of Object.entries(t.cardUses)) {
      const limit = fx(m, i).uses?.[key];
      assert.ok(used <= (limit ? limit.n : 0), `${label}: team ${i} ${key} used ${used}`);
    }
  });
}

function checkState(m, label) {
  const { step } = m;
  assert.ok(['roll', 'choose', 'halftime', 'fulltime'].includes(step.type), `${label}: step type ${step.type}`);
  if (step.type === 'roll' || step.type === 'choose') assert.ok(step.team === 0 || step.team === 1, `${label}: step team`);
  if (step.type === 'roll') {
    assert.ok(Array.isArray(step.dice) && step.dice.length >= 1 && step.dice.length <= 2, `${label}: dice`);
    for (const d of step.dice) assert.ok(DICE[d], `${label}: die ${d}`);
  }
  if (step.type === 'choose') assert.ok(step.options.length >= 2, `${label}: options`);
  if (step.purpose === 'attack') {
    assert.equal(step.team, m.attacker, `${label}: only the side in possession attacks`);
    assert.equal(step.dice[0], m.carrier, `${label}: the ball carrier rolls`);
  }
  if (step.purpose === 'tackle' || step.purpose === 'ruck') assert.equal(step.team, 1 - m.attacker, `${label}: the defence tackles`);
  if (step.purpose === 'tackle') {
    assert.ok(Number.isInteger(step.intensity) && step.intensity >= 1, `${label}: intensity`);
    const face = DICE[step.carrier].faces;
    assert.ok(face.some(f => f.kind === 'run'), `${label}: carrier can run`);
  }
  if (step.purpose === 'setpiece') assert.ok(['scrum', 'lineout'].includes(step.piece));
  if (step.purpose === 'kick') assert.ok(step.range >= 1 && step.range <= 5, `${label}: range`);
  if (step.purpose === 'pass') assert.ok(!step.options.includes('S') && !step.options.includes(step.from), `${label}: pass options`);

  assert.ok(POSITIONS.includes(m.carrier), `${label}: carrier`);
  assert.ok(m.quickTap >= 0 && m.quickTap <= QUICK_TAP_RUNS, `${label}: quick tap ${m.quickTap}`);
  assert.ok(m.half === 1 || m.half === 2, `${label}: half`);

  const { half: halfAt, full } = m.target;
  m.teams.forEach((t, i) => {
    const s = t.stats;
    assert.equal(t.score, 5 * s.tries + 2 * s.conversions + 3 * s.penaltyGoals + 3 * s.dropGoals, `${label}: team ${i} score adds up`);
    assert.ok(s.conversions <= s.conversionAttempts && s.conversionAttempts <= s.tries, `${label}: conversions`);
    assert.ok(s.penaltyGoals <= s.penaltyAttempts && s.dropGoals <= s.dropAttempts, `${label}: kicks`);
    for (const pos of POSITIONS) assert.ok(Number.isInteger(t.injuries[pos]) && t.injuries[pos] >= 0, `${label}: injuries`);
    assert.ok(t.yellows >= 0, `${label}: yellows`);
    if (t.sinBin) assert.equal(t.yellows, 1, `${label}: only a first yellow sits in the sin bin`);
    assert.equal(defenceModifier(m, i), t.yellows >= 2 ? -2 : t.sinBin ? -1 : 0);
    // Every run ends in a tackle or a break, unless the tackle is still to be rolled.
    const pending = step.purpose === 'tackle' && m.attacker === i ? 1 : 0;
    assert.equal(s.runs, m.teams[1 - i].stats.tackles + s.lineBreaks + pending, `${label}: team ${i} runs = tackles faced + breaks`);
    assert.equal(s.lineBreaks, m.teams[1 - i].stats.missedTackles, `${label}: breaks = missed tackles`);
    for (const [player, team] of PLAYER_SUMS) {
      assert.equal(POSITIONS.reduce((n, p) => n + t.players[p][player], 0), s[team], `${label}: team ${i} players' ${player} add up`);
    }
  });
  checkCards(m, label);

  const scores = m.teams.map(t => t.score);
  if (step.type === 'fulltime') {
    assert.ok(m.winner === 0 || m.winner === 1, `${label}: winner`);
    assert.ok(scores[m.winner] >= full, `${label}: winner reached full time`);
    assert.ok(scores[1 - m.winner] < full, `${label}: loser did not`);
    assert.equal(m.half, 2, `${label}: matches finish in the second half`);
  } else {
    assert.ok(scores.every(s => s < full), `${label}: nobody has reached full time yet`);
    const converting = step.purpose === 'range' && step.kick === 'conversion' || step.purpose === 'kick' && step.kick === 'conversion';
    if (m.half === 1 && step.type !== 'halftime' && !converting) {
      assert.ok(scores.every(s => s < halfAt), `${label}: half time is called at ${halfAt}`);
    }
    // Every try gets its conversion unless it ended the match.
    m.teams.forEach((t, i) => {
      const owed = converting && step.team === i ? 1 : 0;
      assert.equal(t.stats.conversionAttempts + owed, t.stats.tries, `${label}: team ${i} conversion for every try`);
    });
  }
  if (step.type === 'halftime') assert.ok(scores.some(s => s >= halfAt) && m.half === 1, `${label}: half time`);
}

function checkEvents(before, after, events, label) {
  const delta = after.teams.map((t, i) => t.score - before.teams[i].score);
  const fromEvents = [0, 0];
  for (const e of events) {
    assert.ok(typeof e.type === 'string', `${label}: event type`);
    if (e.type === 'score') {
      assert.equal(e.points, POINTS_BY_KIND[e.kind], `${label}: ${e.kind} is worth ${POINTS_BY_KIND[e.kind]}`);
      fromEvents[e.team] += e.points;
    }
    if (e.type === 'possession') {
      assert.equal(after.attacker, e.team, `${label}: possession goes to ${e.team}`);
      assert.deepEqual(after.step.dice, ['S'], `${label}: "The Scrum Half (S) will always roll first"`);
      assert.equal(after.phase, 1, `${label}: new possession starts at phase 1`);
    }
  }
  assert.deepEqual(delta, fromEvents, `${label}: scores only move with score events`);
  assert.ok(delta.every(d => d >= 0), `${label}: scores never go down`);
  assert.equal(after.seq, before.seq + 1, `${label}: seq`);

  // Possession only changes hands for a reason the rules give.
  if (before.attacker !== null && after.attacker !== before.attacker && after.step.type !== 'fulltime') {
    const reasons = new Set(['intercept', 'ruck', 'noTry', 'setPiece', 'kick', 'secondHalf', 'penalty']);
    assert.ok(events.some(e => reasons.has(e.type)), `${label}: possession changed without a reason (${events.map(e => e.type)})`);
  }

  // Injuries come only from two Big Hits.
  const injured = events.filter(e => e.type === 'injury').length;
  const injuryDelta = after.teams.reduce((n, t, i) => n + POSITIONS.reduce((k, p) => k + t.injuries[p] - before.teams[i].injuries[p], 0), 0);
  assert.equal(injuryDelta, injured, `${label}: injuries`);
  if (injured) {
    const [a, b] = after.roll.faces;
    assert.ok(DICE.D.faces[a].kind === 'bighit' && DICE.D.faces[b].kind === 'bighit', `${label}: injury needs two Big Hits`);
  }

  // A tackle outcome always agrees with the rules reading, cards included.
  if (before.step.purpose === 'tackle') {
    const [a, b] = after.roll.faces;
    const def = before.step.team;
    const card = fx(before, def);
    const special = !!before.step.special;
    const ruckMax = card.ruckMax || 4;
    assert.equal(before.step.ruck, !special && before.step.intensity <= ruckMax, `${label}: who can contest the ruck`);
    const want = RULES.tackle(a, b, before.step.intensity, {
      perDie: defenceModifier(before, def),
      plainHitUp: !special,
      firstBonus: (special ? card.tackleBonus?.special : card.tackleBonus?.hitUp) || 0,
      ruckMax,
      ruckOnSecond: !!card.ruckOnSecond,
    });
    const brokeThrough = events.some(e => e.type === 'lineBreak');
    assert.equal(brokeThrough, want.result === 'break', `${label}: tackle outcome`);
    assert.equal(after.step.purpose === 'ruck', want.result === 'ruck', `${label}: ruck`);
  }

  // A run's intensity: the die, quick tap, cards and injuries, never below 1.
  for (const e of events.filter(x => x.type === 'run')) {
    const face = DICE[e.pos].faces[after.roll.faces[0]];
    assert.equal(e.value, face.value, `${label}: the die's value`);
    const bonus = fx(before, e.team).runBonus?.[e.pos];
    assert.equal(e.card, bonus ? (face.special ? bonus.special : bonus.hitUp) : 0, `${label}: card bonus`);
    assert.equal(e.fortress, face.special ? fx(before, 1 - e.team).specialDefence || 0 : 0, `${label}: Fortress`);
    assert.equal(e.quickTap, before.attacker === e.team && before.quickTap > 0 ? 1 : 0, `${label}: quick tap`);
    assert.equal(e.injury, before.teams[e.team].injuries[e.pos], `${label}: injury`);
    assert.equal(e.intensity, Math.max(1, e.value + e.quickTap + e.card - e.fortress - e.injury), `${label}: intensity`);
  }

  // Cards: never change once picked; only play for the side holding them.
  for (const i of [0, 1]) if (before.teams[i].card) assert.equal(after.teams[i].card, before.teams[i].card, `${label}: cards stay`);
  for (const e of events.filter(x => x.type === 'cardPlayed')) {
    assert.ok(before.cards, `${label}: a card played with cards off`);
    assert.equal(e.card, after.teams[e.team].card, `${label}: ${e.card} played by the side that holds it`);
  }
}

test(`${MATCHES} fuzzed matches keep every invariant after every action`, () => {
  const styles = ['random', 'pro', 'rookie'];
  const totals = { actions: 0, events: new Set(), steps: new Set(), winners: [0, 0], replayed: 0 };
  for (let g = 0; g < MATCHES; g++) {
    const rng = seededRng(1000 + g);
    const length = LENGTHS[g % LENGTHS.length];
    const style = styles[g % styles.length];
    let m = newMatch({ mode: g % 2 ? '1p' : '2p', length, cpuLevel: g % 4 ? 'pro' : 'rookie', cards: g % 3 !== 2, cpuPersonality: ['balanced', 'boot', 'run', 'pack'][g % 4] });
    checkState(m, `match ${g} start`);
    let actions = 0;
    while (m.step.type !== 'fulltime') {
      const label = `match ${g} action ${actions} (${m.step.type}/${m.step.purpose || ''})`;
      const action = pickAction(m, rng, style);
      assert.ok(isLegal(m, action), `${label}: chosen action is legal`);
      assert.ok(['human', 'cpu'].includes(controllerOf(m)));

      const rec = recording(rng);
      const frozen = JSON.stringify(m);
      const { state, events } = act(m, action, rec);
      assert.equal(JSON.stringify(m), frozen, `${label}: act never mutates its input`);

      // Saving and reloading mid-match gives exactly the same game.
      if (actions % 7 === 0) {
        const again = act(JSON.parse(frozen), action, replay(rec.used));
        assert.deepEqual(again.state, state, `${label}: replay from saved state`);
        assert.deepEqual(again.events, events, `${label}: replay events`);
        totals.replayed++;
      }

      checkEvents(m, state, events, label);
      checkState(state, label);

      const story = narrate(events, state);
      for (const line of story.lines) assert.doesNotMatch(line.text, BROKEN_TEXT, `${label}: "${line.text}"`);
      for (const t of [story.headline, story.detail]) if (t) assert.doesNotMatch(t, BROKEN_TEXT, `${label}: "${t}"`);
      for (const mo of story.moments) assert.doesNotMatch(`${mo.title} ${mo.sub}`, BROKEN_TEXT, label);

      for (const e of events) {
        totals.events.add(e.type);
        if (e.type === 'cardPlayed') totals.events.add(`cardPlayed:${e.what}`);
      }
      totals.steps.add(`${state.step.type}:${state.step.purpose || ''}`);
      m = state;
      actions++;
      assert.ok(actions < 3000, `match ${g} did not finish`);
    }
    totals.actions += actions;
    totals.winners[m.winner]++;
  }

  // The fuzzing really did reach every corner of the game.
  const everyEvent = ['toss', 'possession', 'run', 'pass', 'passChoice', 'dropChance', 'error', 'intercept', 'tackle', 'lineBreak',
    'injury', 'ruck', 'videoRef', 'try', 'noTry', 'range', 'dropAttempt', 'dropDeclined', 'penaltyAttempt', 'kick', 'setPiece',
    'penalty', 'card', 'noCard', 'quickTap', 'advantageOver', 'score', 'halftime', 'secondHalf', 'fulltime', 'deal', 'draft',
    ...['knockon', 'touch', 'intercept', 'dropChance', 'ruck', 'heldUp', 'noTry', 'penalty', 'reset', 'notstraight', 'advantage'].map(w => `cardPlayed:${w}`)];
  for (const e of everyEvent) assert.ok(totals.events.has(e), `event ${e} was reached`);
  for (const s of ['roll:attack', 'roll:tackle', 'roll:ruck', 'roll:try', 'roll:range', 'roll:penalty', 'roll:kick', 'roll:setpiece',
    'choose:pass', 'choose:drop', 'choose:penalty', 'choose:draft', 'halftime:', 'fulltime:']) {
    assert.ok(totals.steps.has(s), `step ${s} was reached`);
  }
  assert.ok(totals.winners[0] > MATCHES * 0.35 && totals.winners[1] > MATCHES * 0.35, `both sides win (${totals.winners})`);
  assert.ok(totals.replayed > MATCHES * 10, 'replays were checked');
});

test('a red card is reachable and sticks for the rest of the match', () => {
  let seen = false;
  for (let g = 0; g < 4000 && !seen; g++) {
    const rng = seededRng(77 + g);
    let m = newMatch({ mode: '2p', length: 'long' });
    while (m.step.type !== 'fulltime') {
      m = act(m, pickAction(m, rng, 'pro'), rng).state;
      const red = m.teams.findIndex(t => t.yellows >= 2);
      if (red >= 0) {
        seen = true;
        assert.equal(defenceModifier(m, red), -2);
        // It must still be -2 after half time and to the end.
        while (m.step.type !== 'fulltime') {
          m = act(m, pickAction(m, rng, 'pro'), rng).state;
          assert.equal(defenceModifier(m, red), -2);
        }
      }
    }
  }
  assert.ok(seen, 'a red card happened somewhere in 4000 marathon matches');
});
