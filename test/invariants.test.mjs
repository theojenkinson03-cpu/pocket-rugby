// Fuzzing: thousands of complete matches with random and CPU decisions. After
// every single action the whole state is checked against things that must
// always be true. Set FUZZ_MATCHES to play more.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { act, carryMetres, controllerOf, defenceModifier, halfRolls, isLegal, MATCH_LENGTHS, newMatch, QUICK_TAP_RUNS, rollWeather, seededRng, TIMED_DECISIONS, timeUp, TRY_RUN_IN, WET_HANDS, windBonus } from '../js/engine.js';
import { cpuChoice } from '../js/ai.js';
import { cardEffects, CARD_IDS, RARITY_IDS } from '../js/cards.js';
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
  // Now and then an online player runs out of time.
  if (style === 'random' && TIMED_DECISIONS.includes(m.step.purpose) && rng() < 0.05) return { type: 'timeout' };
  if (style === 'random') return { type: 'choose', value: m.step.options[Math.floor(rng() * m.step.options.length)] };
  return { type: 'choose', value: cpuChoice({ ...m, cpuLevel: style }, rng) };
}

// A side's card effects, both cards together (the merge has its own tests in cards).
const fx = (m, team) => cardEffects(m, team);
const cardKey = c => `${c.id}:${c.rarity}`;
const PLAYER_SUMS = [['tries', 'tries'], ['carries', 'runs'], ['metres', 'metres'], ['lineBreaks', 'lineBreaks'], ['tackles', 'tackles'], ['missed', 'missedTackles'], ['bigHits', 'bigHits'], ['turnovers', 'turnoversWon'], ['errors', 'errors']];

function checkCards(m, label) {
  const drafted = m.teams.flatMap(t => t.cards.map(c => c.id));
  if (!m.cards) {
    assert.deepEqual(m.teams.map(t => t.cards), [[], []], `${label}: no cards when they are off`);
    return;
  }
  if (m.attacker !== null) {
    assert.deepEqual(m.teams.map(t => t.cards.length), [2, 2], `${label}: two cards each once play starts`);
    assert.ok(drafted.every(id => CARD_IDS.includes(id)), `${label}: known cards`);
    assert.equal(new Set(drafted).size, 4, `${label}: four different cards`);
    assert.ok(drafted.every(id => m.deal.includes(id)), `${label}: cards come from the deal`);
    assert.equal(m.deal.length, 5, `${label}: five dealt`);
  }
  // Every card at the rarity it was dealt at: no catching up.
  m.teams.forEach((t, i) => t.cards.forEach(c => assert.equal(c.rarity, m.dealRarity[c.id], `${label}: team ${i} ${c.id} at its dealt rarity`)));
  assert.ok(Object.values(m.dealRarity).every(r => RARITY_IDS.includes(r)), `${label}: rarities`);
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
  if (m.quickTap > 0) assert.ok(['tap', 'card'].includes(m.quickTapFrom), `${label}: where the +1 runs came from`);
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

  // The bench: at most one replacement a half, none with the bench off.
  m.teams.forEach((t, i) => assert.ok(m.bench ? t.bench === 0 || t.bench === 1 : t.bench === 0, `${label}: team ${i} bench ${t.bench}`));
  if (step.purpose === 'bench') {
    const T = m.teams[step.team];
    assert.ok(m.bench && T.bench === 1, `${label}: a replacement is only offered with one on the bench`);
    assert.deepEqual(step.options, [...POSITIONS.filter(p => T.injuries[p] > 0), 'stay'], `${label}: any injured player, or play on`);
    assert.ok(step.options.length >= 2, `${label}: someone is injured`);
    if (step.when === 'injury') assert.ok(T.injuries[step.pos] > 0, `${label}: the player just hurt`);
  }

  const scores = m.teams.map(t => t.score);
  const rolls = m.format === 'rolls';
  assert.ok(m.suddenDeath ? rolls && m.decider && m.half === 2 : true, `${label}: sudden death only settles a drawn knockout on the clock`);
  if (step.type === 'fulltime') {
    assert.equal(m.half, 2, `${label}: matches finish in the second half`);
    if (m.suddenDeath) {
      assert.ok(m.winner === 0 || m.winner === 1, `${label}: sudden death has a winner`);
      assert.ok(scores[m.winner] > scores[1 - m.winner], `${label}: the next score won it`);
    } else if (rolls) {
      assert.ok(timeUp(m), `${label}: the clock ran out`);
      const want = scores[0] === scores[1] ? null : scores[0] > scores[1] ? 0 : 1;
      assert.equal(m.winner, want, `${label}: the higher score wins; level is a draw`);
      if (m.decider) assert.notEqual(m.winner, null, `${label}: a knockout always has a winner`);
    } else {
      assert.ok(m.winner === 0 || m.winner === 1, `${label}: winner`);
      assert.ok(scores[m.winner] >= full, `${label}: winner reached full time`);
      assert.ok(scores[1 - m.winner] < full, `${label}: loser did not`);
    }
  } else {
    if (!rolls) assert.ok(scores.every(s => s < full), `${label}: nobody has reached full time yet`);
    const converting = step.purpose === 'range' && step.kick === 'conversion' || step.purpose === 'kick' && step.kick === 'conversion';
    if (!rolls && m.half === 1 && step.type !== 'halftime' && !converting) {
      assert.ok(scores.every(s => s < halfAt), `${label}: half time is called at ${halfAt}`);
    }
    // Every try gets its conversion unless it ended the match.
    m.teams.forEach((t, i) => {
      const owed = converting && step.team === i ? 1 : 0;
      assert.equal(t.stats.conversionAttempts + owed, t.stats.tries, `${label}: team ${i} conversion for every try`);
    });
  }
  if (step.type === 'halftime') {
    assert.equal(m.half, 1, `${label}: half time`);
    if (rolls) assert.ok(m.clock >= halfRolls(m), `${label}: half time on the clock`);
    else assert.ok(scores.some(s => s >= halfAt), `${label}: half time at ${halfAt}`);
  }
  // The clock: last play once the half's rolls are gone, and only then.
  if (!rolls) assert.ok(!m.lastPlay, `${label}: no clock in a points match`);
  else if (step.type !== 'halftime' && step.type !== 'fulltime') assert.equal(m.lastPlay, timeUp(m), `${label}: last play when the clock runs out`);
  assert.ok(m.rolls >= m.clock, `${label}: rolls`);
}

function checkEvents(before, after, events, label) {
  // After a score the side that conceded restarts, unless a kicking card wins
  // the ball back after its own kind of goal.
  const scored = events.find(e => e.type === 'score');
  const restart = events.find(e => e.type === 'possession' && e.reason === 'restart');
  const kept = events.find(e => e.type === 'cardPlayed' && e.what === 'keepBall');
  if (scored && restart) {
    assert.equal(restart.team, kept ? scored.team : 1 - scored.team, `${label}: the restart after a score`);
    if (kept) assert.ok((fx(before, scored.team).keepBall || []).includes(scored.kind), `${label}: kept the ball after a ${scored.kind}`);
  }
  if (kept) assert.ok(scored && restart, `${label}: the ball is only kept after a goal`);
  // Squeaky Clean (Rare up) is never shown a card.
  before.teams.forEach((t, i) => {
    if (fx(before, i).noCards) assert.equal(after.teams[i].yellows, t.yellows, `${label}: team ${i} shown a card with Squeaky Clean`);
  });

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
    const reasons = new Set(['intercept', 'ruck', 'noTry', 'setPiece', 'kick', 'secondHalf', 'penalty', 'replacement', 'playOn', 'suddenDeath']);
    assert.ok(events.some(e => reasons.has(e.type)), `${label}: possession changed without a reason (${events.map(e => e.type)})`);
  }

  // Injuries come only from two Big Hits, and go only with a replacement.
  const injured = events.filter(e => e.type === 'injury').length;
  const cleared = events.filter(e => e.type === 'replacement').reduce((n, e) => n + e.cleared, 0);
  const injuryDelta = after.teams.reduce((n, t, i) => n + POSITIONS.reduce((k, p) => k + t.injuries[p] - before.teams[i].injuries[p], 0), 0);
  assert.equal(injuryDelta, injured - cleared, `${label}: injuries`);
  for (const e of events.filter(x => x.type === 'replacement')) {
    assert.equal(before.step.purpose, 'bench', `${label}: replacements come from the bench decision`);
    assert.equal(after.teams[e.team].injuries[e.pos], 0, `${label}: a fresh player has no injury`);
    assert.equal(after.teams[e.team].bench, before.teams[e.team].bench - 1, `${label}: the replacement is used up`);
  }
  // An injury with a replacement on the bench always asks the question.
  const hurt = events.find(e => e.type === 'injury');
  if (hurt && before.teams[hurt.team].bench > 0) {
    assert.equal(after.step.purpose, 'bench', `${label}: bench decision after an injury`);
    assert.equal(after.step.team, hurt.team, `${label}: the injured side decides`);
  }
  if (events.some(e => e.type === 'secondHalf')) after.teams.forEach((t, i) => assert.equal(t.bench, before.bench ? 1 : 0, `${label}: team ${i} has a fresh replacement for the second half`));

  // Weather: a wet ball only for the Forwards and Centres, in the rain, on a free pass.
  for (const e of events.filter(x => x.type === 'wetBall')) {
    assert.ok(before.weather?.rain, `${label}: a wet ball needs rain`);
    assert.ok(WET_HANDS.includes(e.pos), `${label}: ${e.pos} has wet hands`);
    const face = DICE[e.pos].faces[after.roll.faces[0]];
    assert.ok(face.kind === 'pass' && !face.to, `${label}: the rolled face was a free pass`);
  }
  if (before.step.purpose === 'attack' && before.weather?.rain && WET_HANDS.includes(before.step.dice[0])) {
    const face = DICE[before.step.dice[0]].faces[after.roll.faces[0]];
    if (face.kind === 'pass' && !face.to) assert.ok(events.some(e => e.type === 'wetBall'), `${label}: every free pass is wet in the rain`);
  }
  // Every kick: the black die, the card and the wind.
  for (const e of events.filter(x => x.type === 'kick')) {
    assert.equal(e.wind, windBonus(before, e.team), `${label}: wind on the kick`);
    assert.equal(e.card, fx(before, e.team).kickBonus?.[e.kick] || 0, `${label}: card on the kick`);
    assert.equal(e.distance, e.rolled + e.card + e.wind, `${label}: kick distance`);
    assert.equal(e.good, e.distance >= e.range, `${label}: a kick lands when it reaches the range`);
  }
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
    assert.equal(before.step.ruck, special ? !!card.ruckOnSpecial : before.step.intensity <= ruckMax, `${label}: who can contest the ruck`);
    const dice = (special ? card.tackleBonus?.special : card.tackleBonus?.hitUp) || 0;
    const want = RULES.tackle(a, b, before.step.intensity, {
      perDie: defenceModifier(before, def),
      plainHitUp: !special,
      bonus: [dice >= 1 ? 1 : 0, dice >= 2 ? 1 : 0],
      ruckMax,
      ruckOnSecond: !!card.ruckOnSecond,
      onSpecial: !!card.ruckOnSpecial,
    });
    const brokeThrough = events.some(e => e.type === 'lineBreak');
    assert.equal(brokeThrough, want.result === 'break', `${label}: tackle outcome`);
    // After an injury the bench decision comes first, then play goes on.
    const next = after.step.purpose === 'bench' ? after.step.next : after.step;
    assert.equal(next.purpose === 'ruck', want.result === 'ruck', `${label}: ruck`);
  }

  // Run metres: from the tackle dice, and the run-in for a try.
  for (const e of events.filter(x => x.type === 'tackle' || x.type === 'lineBreak')) {
    const outcome = e.type === 'lineBreak' ? 'break' : e.outcome;
    assert.equal(e.metres, carryMetres(outcome, e.need, e.total), `${label}: metres for a ${outcome}`);
  }
  const metresEvents = events.reduce((n, e) => n + (['tackle', 'lineBreak', 'try'].includes(e.type) ? e.metres : 0), 0);
  const metresMade = after.teams.reduce((n, t, i) => n + t.stats.metres - before.teams[i].stats.metres, 0);
  assert.equal(metresMade, metresEvents, `${label}: metres only from carries and tries`);
  for (const e of events.filter(x => x.type === 'try')) assert.equal(e.metres, TRY_RUN_IN);
  if (events.some(e => e.type === 'possession')) assert.equal(after.gained, 0, `${label}: a new possession starts at the gain line`);

  // A run's intensity: the die, quick tap, cards and injuries, never below 1.
  for (const e of events.filter(x => x.type === 'run')) {
    const face = DICE[e.pos].faces[after.roll.faces[0]];
    assert.equal(e.value, face.value, `${label}: the die's value`);
    const bonus = fx(before, e.team).runBonus?.[e.pos];
    assert.equal(e.card, bonus ? (face.special ? bonus.special : bonus.hitUp) : 0, `${label}: card bonus`);
    const fort = fx(before, 1 - e.team);
    assert.equal(e.fortress, (face.special ? fort.specialDefence : face.value >= (fort.hitUpDefenceFrom || 0) ? fort.hitUpDefence : 0) || 0, `${label}: Fortress`);
    assert.equal(e.quickTap, before.attacker === e.team && before.quickTap > 0 ? 1 : 0, `${label}: quick tap`);
    assert.equal(e.injury, before.teams[e.team].injuries[e.pos], `${label}: injury`);
    assert.equal(e.intensity, Math.max(1, e.value + e.quickTap + e.card - e.fortress - e.injury), `${label}: intensity`);
  }

  // Cards: never change once picked; only play for the side holding them.
  for (const i of [0, 1]) {
    const kept = before.teams[i].cards.map(cardKey);
    assert.deepEqual(after.teams[i].cards.map(cardKey).slice(0, kept.length), kept, `${label}: cards stay`);
  }
  for (const e of events.filter(x => x.type === 'cardPlayed')) {
    assert.ok(before.cards, `${label}: a card played with cards off`);
    assert.ok(after.teams[e.team].cards.map(cardKey).includes(cardKey({ id: e.card, rarity: e.rarity })), `${label}: ${e.card} played by the side that holds it, at its rarity`);
  }
  // A decision that runs out of time: a penalty to the other side.
  const timedOut = events.find(e => e.type === 'timeout');
  if (timedOut) {
    assert.ok(TIMED_DECISIONS.includes(before.step.purpose), `${label}: only decisions in play time out`);
    assert.equal(timedOut.team, before.step.team);
    assert.deepEqual(events.find(e => e.type === 'penalty'), { type: 'penalty', team: 1 - timedOut.team, offender: timedOut.team }, `${label}: penalty to the other side`);
  }
}

test(`${MATCHES} fuzzed matches keep every invariant after every action`, () => {
  const styles = ['random', 'pro', 'rookie'];
  const totals = { actions: 0, events: new Set(), steps: new Set(), winners: [0, 0], draws: 0, replayed: 0 };
  for (let g = 0; g < MATCHES; g++) {
    const rng = seededRng(1000 + g);
    const length = LENGTHS[g % LENGTHS.length];
    const style = styles[g % styles.length];
    let m = newMatch({
      mode: g % 2 ? '1p' : '2p',
      length,
      cpuLevel: g % 4 ? 'pro' : 'rookie',
      cards: g % 3 !== 2,
      cpuPersonality: ['balanced', 'boot', 'run', 'pack'][g % 4],
      bench: g % 5 !== 4,
      weather: g % 2 ? rollWeather(rng) : null,
      format: g % 7 < 3 ? 'rolls' : 'points',
      decider: g % 7 === 1,
    });
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
    if (m.winner === null) totals.draws++;
    else totals.winners[m.winner]++;
  }

  // The fuzzing really did reach every corner of the game.
  const everyEvent = ['toss', 'possession', 'run', 'pass', 'passChoice', 'dropChance', 'error', 'intercept', 'tackle', 'lineBreak',
    'injury', 'ruck', 'videoRef', 'try', 'noTry', 'range', 'dropAttempt', 'dropDeclined', 'penaltyAttempt', 'kick', 'setPiece',
    'penalty', 'card', 'noCard', 'quickTap', 'advantageOver', 'score', 'halftime', 'secondHalf', 'fulltime', 'deal', 'draft', 'discard',
    'wetBall', 'replacement', 'playOn', 'lastPlay', 'suddenDeath', 'timeout',
    ...['knockon', 'touch', 'intercept', 'dropChance', 'ruck', 'heldUp', 'noTry', 'penalty', 'reset', 'notstraight', 'advantage'].map(w => `cardPlayed:${w}`)];
  for (const e of everyEvent) assert.ok(totals.events.has(e), `event ${e} was reached`);
  for (const s of ['roll:attack', 'roll:tackle', 'roll:ruck', 'roll:try', 'roll:range', 'roll:penalty', 'roll:kick', 'roll:setpiece',
    'choose:pass', 'choose:drop', 'choose:penalty', 'choose:draft', 'choose:bench', 'halftime:', 'fulltime:']) {
    assert.ok(totals.steps.has(s), `step ${s} was reached`);
  }
  assert.ok(totals.winners[0] > MATCHES * 0.33 && totals.winners[1] > MATCHES * 0.33, `both sides win (${totals.winners})`);
  assert.ok(totals.draws > 0, 'some matches on the clock are drawn');
  assert.ok(totals.replayed > MATCHES * 10, 'replays were checked');
});

// Every card at every rarity, held by one side against a random card at a
// random rarity, through whole matches with every check after every action.
// The new things each rarity adds must happen somewhere.
test('every card at every rarity plays whole matches within the rules', () => {
  const GAMES = 8;
  const played = {};
  for (const [c, id] of CARD_IDS.entries()) {
    for (const [r, rarity] of RARITY_IDS.entries()) {
      const seen = (played[`${id}:${rarity}`] = new Set());
      for (let g = 0; g < GAMES; g++) {
        const rng = seededRng(50000 + c * 100 + r * 10 + g);
        let m = newMatch({ mode: '2p', length: 'standard', cards: true });
        const label0 = `${id} ${rarity} match ${g}`;
        // Play the toss and the draft, then swap in the cards under test: the
        // card under test and one other for one side, two others for the other.
        while (m.attacker === null) m = act(m, pickAction(m, rng, 'pro'), rng).state;
        const holder = 1 - m.firstReceiver;
        const others = CARD_IDS.filter(x => x !== id).sort(() => rng() - 0.5).slice(0, 4);
        const deal = [{ id, rarity }, ...others.map(x => ({ id: x, rarity: RARITY_IDS[Math.floor(rng() * 4)] }))];
        m.deal = deal.map(x => x.id);
        m.dealRarity = Object.fromEntries(deal.map(x => [x.id, x.rarity]));
        m.teams[holder].cards = [deal[0], deal[1]];
        m.teams[1 - holder].cards = [deal[2], deal[3]];
        checkState(m, `${label0} start`);
        for (let n = 0; m.step.type !== 'fulltime'; n++) {
          const label = `${label0} action ${n}`;
          const { state, events } = act(m, pickAction(m, rng, n % 3 ? 'pro' : 'random'), rng);
          checkEvents(m, state, events, label);
          checkState(state, label);
          for (const e of events) if (e.type === 'cardPlayed' && e.team === holder) seen.add(e.what === 'ruck' ? `ruck:${e.result}` : e.what);
          m = state;
          assert.ok(n < 3000, `${label0} did not finish`);
        }
      }
    }
  }
  // Set pieces come only from errors, so a few matches see few of them: look across the rarities that share an effect.
  const has = (id, rarities, what) => assert.ok(rarities.some(r => played[`${id}:${r}`].has(what)), `${id} (${rarities}) played ${what}`);
  has('set-piece-kings', ['rare', 'epic', 'mythic'], 'ownFeed');
  has('set-piece-kings', ['epic', 'mythic'], 'steal');
  has('jackal', ['mythic'], 'ruck:try');
  has('jackal', ['rare', 'epic', 'mythic'], 'ruck:notry');
  has('jackal', RARITY_IDS, 'ruck:video');
  has('big-pack', ['epic', 'mythic'], 'knockon');
  has('sure-hands', ['epic', 'mythic'], 'touch');
  has('drop-artist', ['epic', 'mythic'], 'dropChance');
  has('golden-boot', ['mythic'], 'dropChance');
  has('golden-boot', RARITY_IDS, 'keepBall');
  has('drop-artist', RARITY_IDS, 'keepBall');
  has('squeaky-clean', ['rare', 'epic', 'mythic'], 'noCard');
  has('clinical', ['epic', 'mythic'], 'noTry');
  has('squeaky-clean', ['rare', 'epic', 'mythic'], 'penalty');
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
