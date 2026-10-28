// CPU decision making. Rookie plays on instinct, Pro weighs the odds, and
// Expert plays out many matches from the current position for each option
// and picks the one that wins most often. Personalities flavour the choices.

import { act, actInPlace, halfRolls, keepsBall, kickBonus, kickChance, receiverOdds, seededRng, tryChance } from './engine.js';
import { cardTier, cardWorth, RARITY_IDS } from './cards.js';
import { possessionsLeft, winFromPossession, winProbability } from './winprob.js';

export const LEVELS = {
  rookie: { name: 'Rookie', blurb: 'Plays on instinct' },
  pro: { name: 'Pro', blurb: 'Plays the odds' },
  expert: { name: 'Expert', blurb: 'Thinks ahead' },
};

// dropAt / penaltyAt: the kick chance at which they go for goal. Since a
// score hands the other side the ball, a kick has to be likely to be worth
// it: over 4,000 matches in each format, kicking at 2 in 3 or better beat
// kicking at 1 in 2 or better by 3 to 4 points in a hundred.
// pass: extra liking for a receiver. cards: extra liking for a team card.
export const PERSONALITIES = {
  balanced: { name: 'Balanced', blurb: 'Takes the points when they are there', dropAt: 2 / 3, penaltyAt: 2 / 3, pass: {}, cards: {} },
  boot: {
    name: 'Boot it',
    blurb: 'Kicks for goal at every chance',
    dropAt: 1 / 3,
    penaltyAt: 1 / 3,
    pass: { B: 0.12, C: 0.08 },
    cards: { 'golden-boot': 0.05, 'drop-artist': 0.05 },
  },
  run: {
    name: 'Run it',
    blurb: 'Taps penalties and spreads it wide',
    dropAt: 5 / 6,
    penaltyAt: 5 / 6,
    pass: { W: 0.22, C: 0.08 },
    cards: { 'sure-hands': 0.04, 'midfield-maestro': 0.04, 'up-and-under': 0.04 },
  },
  pack: {
    name: 'Forward-heavy',
    blurb: 'Keeps it tight through the Forwards',
    dropAt: 2 / 3,
    penaltyAt: 2 / 3,
    pass: { F: 0.3 },
    cards: { 'big-pack': 0.05, 'set-piece-kings': 0.05, 'rush-defence': 0.03 },
  },
};

const TRY_VALUE = 6.3; // a try plus a typical conversion

const personalityOf = match => PERSONALITIES[match.cpuPersonality] || PERSONALITIES.balanced;
const pointsToWin = (match, team) => match.target.full - match.teams[team].score;

export function receiverValue(match, team, pos, personality = PERSONALITIES.balanced) {
  const odds = receiverOdds(match, team, pos);
  return odds.lineBreak * tryChance() * TRY_VALUE - odds.error * 2 + (personality.pass[pos] || 0);
}

function bestReceiver(match, team, options, personality) {
  return options
    .map(pos => ({ pos, value: receiverValue(match, team, pos, personality) }))
    .sort((a, b) => b.value - a.value)[0].pos;
}

function goesForGoal(match, team, kick, range, threshold) {
  const chance = kickChance(range, kickBonus(match, team, kick));
  // Sudden death: any score wins it.
  if (match.suddenDeath) return chance >= 1 / 3;
  // Three points and the ball back: worth a go at one in three.
  if (keepsBall(match, team, kick)) return chance >= 1 / 3;
  if (match.format === 'rolls') {
    // Near the end, three points are only worth it if they draw or win the match.
    if (match.half === 2 && possessionsLeft(match) <= 2) {
      const behind = match.teams[1 - team].score - match.teams[team].score;
      return behind <= 3 && chance >= 1 / 3;
    }
  } else if (3 >= pointsToWin(match, team)) return chance >= 1 / 3;
  return chance >= threshold - 1e-9;
}

// A dealt card's worth: its measured value at its rarity in this format, plus the style's liking.
export function cardValue(id, personality = PERSONALITIES.balanced, rarity = 'common', format = 'points') {
  return cardWorth(cardTier(id, rarity), format) + (personality.cards[id] || 0);
}

const dealtRarity = (match, id) => match.dealRarity?.[id] || 'common';

function bestCard(match, personality) {
  const worth = id => cardValue(id, personality, dealtRarity(match, id), match.format);
  return [...match.step.options].sort((a, b) => worth(b) - worth(a))[0];
}

// How much each position's injury costs: roughly how often each carries the
// ball. The Forwards carry most; the Scrum Half mostly passes.
export const CARRY_SHARE = { S: 0.1, F: 0.34, C: 0.2, W: 0.2, B: 0.16 };

// How far through the half (or, in the second half, the match) play is:
// 0 at the kick-off, 1 at the whistle, from the leading score.
function halfProgress(match) {
  if (match.format === 'rolls') return Math.min(1, match.clock / halfRolls(match));
  const lead = Math.max(...match.teams.map(t => t.score));
  return match.half === 1 ? Math.min(1, lead / match.target.half) : Math.min(1, (lead - match.target.half) / (match.target.full - match.target.half));
}

// The bench: replace the injury that costs most. `hold` is a cost below
// which to keep the replacement for something worse, early in a half. Over
// 40,000 simulated matches for each, holding at 0.18, 0.25 or always did no
// better than replacing at once (49.9%, 49.8% and 49.6%), so the CPU
// doesn't hold.
export const BENCH_HOLD = 0;

export function benchChoice(match, hold = BENCH_HOLD) {
  const step = match.step;
  const T = match.teams[step.team];
  const injured = step.options.filter(o => o !== 'stay');
  const cost = pos => CARRY_SHARE[pos] * T.injuries[pos];
  const worst = injured.sort((a, b) => cost(b) - cost(a))[0];
  if (!worst) return 'stay';
  // Late in the half, a replacement left on the bench is wasted.
  if (step.when === 'halftime' || halfProgress(match) >= 0.6) return worst;
  return cost(worst) >= hold ? worst : 'stay';
}

function proChoice(match, personality) {
  const step = match.step;
  switch (step.purpose) {
    case 'pass': return bestReceiver(match, step.team, step.options, personality);
    case 'drop': return goesForGoal(match, step.team, 'drop', step.range, personality.dropAt) ? 'kick' : 'pass';
    case 'penalty': return goesForGoal(match, step.team, 'penalty', step.range, personality.penaltyAt) ? 'kick' : 'tap';
    case 'draft': return bestCard(match, personality);
    case 'bench': return benchChoice(match);
  }
  return step.options[0];
}

function rookieChoice(match, rng, personality) {
  const step = match.step;
  const pick = () => step.options[Math.floor(rng() * step.options.length)];
  switch (step.purpose) {
    case 'pass': return rng() < 0.5 ? pick() : bestReceiver(match, step.team, step.options, personality);
    case 'drop': return kickChance(step.range, kickBonus(match, step.team, 'drop')) >= 0.5 && rng() < 0.7 ? 'kick' : 'pass';
    case 'penalty': return rng() < 0.6 ? 'kick' : 'tap';
    // Instinct: the injured player comes off straight away.
    case 'bench': return step.pos && step.options.includes(step.pos) ? step.pos : step.options[0];
    case 'draft': {
      // Instinct: grab the rarest card on the table, any of them if they tie.
      const rank = id => RARITY_IDS.indexOf(dealtRarity(match, id));
      const best = Math.max(...step.options.map(rank));
      const rarest = step.options.filter(id => rank(id) === best);
      return rarest[Math.floor(rng() * rarest.length)];
    }
    default: return pick();
  }
}

// ---- Expert: look-ahead by simulation -------------------------------------------

const proAction = m => {
  const step = m.step;
  if (step.type === 'roll') return { type: 'roll' };
  if (step.type === 'halftime') return { type: 'continue' };
  return { type: 'choose', value: step.purpose === 'toss' ? 'heads' : proChoice(m, PERSONALITIES.balanced) };
};

// Plays on in place, with Pro decisions on both sides, until the current
// possession is settled, then asks the win model how good that is for `team`.
// Stopping there keeps the luck of later possessions out of the comparison.
function lookAhead(m, rng, team) {
  for (let guard = 0; guard < 500; guard++) {
    if (m.step.type === 'fulltime') return m.winner === null ? 0.5 : m.winner === team ? 1 : 0;
    if (m.step.type === 'halftime') return winProbability(m, team);
    const events = actInPlace(m, proAction(m), rng);
    // A quick-tap advantage is still being played out: keep going.
    if (events.some(e => e.type === 'possession') && m.quickTap === 0 && m.step.type === 'roll') return winFromPossession(m, team);
  }
  return winProbability(m, team);
}

// Average win chance for each option over `rollouts` look-aheads. Every
// option faces the same dice streams (common random numbers), so the
// comparison measures the decision rather than the luck.
export function* evaluateOptions(match, rollouts = 200, seed = 1) {
  const team = match.step.team;
  const totals = match.step.options.map(() => 0);
  for (let i = 0; i < rollouts; i++) {
    match.step.options.forEach((value, k) => {
      const rng = seededRng(seed + i * 7919);
      const m = act(match, { type: 'choose', value }, rng).state;
      totals[k] += lookAhead(m, rng, team);
    });
    yield i + 1;
  }
  return totals.map(t => t / rollouts);
}

function pickFromWinChances(match, chances, personality) {
  const fallback = proChoice(match, personality);
  const best = Math.max(...chances);
  // Within a fraction of a percent of the best, stay in character.
  const near = match.step.options.filter((_, k) => chances[k] >= best - 0.003);
  return near.includes(fallback) ? fallback : match.step.options[chances.indexOf(best)];
}

// Team cards matter over a whole match, so the draft goes on measured value;
// so does an injury, so the bench goes on the Pro rule.
const expertDraft = match => bestCard(match, PERSONALITIES.balanced);
const LONG_TERM = { draft: expertDraft, bench: match => benchChoice(match) };

export function expertChoice(match, { rollouts = 200, seed = match.seq + 1 } = {}) {
  const step = match.step;
  const personality = personalityOf(match);
  if (step.purpose === 'toss') return 'heads';
  if (LONG_TERM[step.purpose]) return LONG_TERM[step.purpose](match);
  const gen = evaluateOptions(match, rollouts, seed);
  let next = gen.next();
  while (!next.done) next = gen.next();
  return pickFromWinChances(match, next.value, personality);
}

// The same, yielding to the page between batches so animations stay smooth.
export async function expertChoiceAsync(match, { rollouts = 200, seed = match.seq + 1, batch = 10 } = {}) {
  const step = match.step;
  const personality = personalityOf(match);
  if (step.purpose === 'toss') return 'heads';
  if (LONG_TERM[step.purpose]) return LONG_TERM[step.purpose](match);
  const gen = evaluateOptions(match, rollouts, seed);
  let next = gen.next();
  let n = 0;
  while (!next.done) {
    if (++n % batch === 0) await new Promise(resolve => setTimeout(resolve, 0));
    next = gen.next();
  }
  return pickFromWinChances(match, next.value, personality);
}

// ---- Public choice ------------------------------------------------------------------

export function cpuChoice(match, rng = Math.random) {
  const step = match.step;
  const personality = personalityOf(match);
  if (step.purpose === 'toss') return step.options[Math.floor(rng() * step.options.length)];
  if (match.cpuLevel === 'rookie') return rookieChoice(match, rng, personality);
  if (match.cpuLevel === 'expert') return expertChoice(match);
  return proChoice(match, personality);
}

export async function cpuChoiceAsync(match, rng = Math.random) {
  if (match.cpuLevel === 'expert' && match.step.purpose !== 'toss') return expertChoiceAsync(match);
  return cpuChoice(match, rng);
}

// What a Pro would do, used to offer the human a tip.
export function suggestedChoice(match) {
  return proChoice(match, PERSONALITIES.balanced);
}
