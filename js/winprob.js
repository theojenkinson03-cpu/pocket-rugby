// Win probability. A possession ends in one of a few ways (measured over
// 20,000 simulated matches, scripts/possessions in the README); from those
// odds, exact dynamic programming over the score gives each side's chance of
// winning from any score, ball and half. In the rolls format the clock, not
// the score, ends the match: the same odds over the possessions left. Used
// for the live win meter and as the Expert CPU's judge at the end of each
// look-ahead.

import { halfRolls, keepsBall, kickBonus, kickChance, rollsLeft, timeUp, tryChance } from './engine.js';
import { cardWorth, teamCards } from './cards.js';

// How a possession ends: points the attackers scored, and who has the next
// one. Measured over 4,000 simulated matches, both formats, cards on and off.
export const POSSESSION = {
  turnover: 0.4942, // 0 points, the other side's ball
  retained: 0.1473, // 0 points, same side again (won back at a set piece, or a tapped penalty)
  three: 0.1492, // penalty or drop goal, then the other side has the ball
  five: 0.0662, // try, conversion missed
  seven: 0.1431, // try and conversion
};

const tables = new Map();

// table(half, full)(a, b, ball, half, secondHalfBall) -> chance the side
// with score `a` wins. ball / secondHalfBall: 0 = that side, 1 = the other.
function table(halfAt, full) {
  const key = `${halfAt}/${full}`;
  if (tables.has(key)) return tables.get(key);
  const max = full + 8;
  const idx = (a, b) => a * max + b;
  // second half: [a][b] -> [x (our ball), y (their ball)]
  const h2 = new Float64Array(max * max * 2);
  // first half: [a][b][shr] -> [x, y]
  const h1 = new Float64Array(max * max * 4);
  const { turnover: po, retained: ps, three, five, seven } = POSSESSION;

  const v2 = (a, b, ball) => (a >= full ? 1 : b >= full ? 0 : h2[idx(a, b) * 2 + ball]);
  // After our try (5) and then perhaps the conversion (+2).
  const ourScore = (a, b, value) => three * value(a + 3, b) + five * (a + 5 >= full ? 1 : value(a + 5, b)) + seven * (a + 5 >= full ? 1 : value(a + 7, b));
  const theirScore = (a, b, value) => three * value(a, b + 3) + five * (b + 5 >= full ? 0 : value(a, b + 5)) + seven * (b + 5 >= full ? 0 : value(a, b + 7));
  const solve = (sx, sy) => {
    const d = (1 - ps) ** 2 - po ** 2;
    return [(sx * (1 - ps) + po * sy) / d, (sy * (1 - ps) + po * sx) / d];
  };

  for (let a = max - 1; a >= 0; a--) {
    for (let b = max - 1; b >= 0; b--) {
      if (a >= full || b >= full) continue;
      // After a score the other side has the ball.
      const [x, y] = solve(ourScore(a, b, (p, q) => v2(p, q, 1)), theirScore(a, b, (p, q) => v2(p, q, 0)));
      h2[idx(a, b) * 2] = x;
      h2[idx(a, b) * 2 + 1] = y;
    }
  }
  for (let shr = 0; shr < 2; shr++) {
    const v1 = (a, b, ball) => {
      if (a >= halfAt || b >= halfAt) return v2(a, b, shr);
      return h1[(idx(a, b) * 2 + shr) * 2 + ball];
    };
    for (let a = halfAt - 1; a >= 0; a--) {
      for (let b = halfAt - 1; b >= 0; b--) {
        const [x, y] = solve(ourScore(a, b, (p, q) => v1(p, q, 1)), theirScore(a, b, (p, q) => v1(p, q, 0)));
        h1[(idx(a, b) * 2 + shr) * 2] = x;
        h1[(idx(a, b) * 2 + shr) * 2 + 1] = y;
      }
    }
  }
  const value = (a, b, ball, half, shr) => {
    if (a >= full) return 1;
    if (b >= full) return 0;
    if (half === 2 || a >= halfAt || b >= halfAt) return v2(a, b, half === 2 ? ball : shr);
    return h1[(idx(a, b) * 2 + shr) * 2 + ball];
  };
  tables.set(key, value);
  return value;
}

// ---- The rolls format ----

// Dice rolls on the clock for each possession, from the same matches.
export const ROLLS_PER_POSSESSION = 8.8;

const MAX_POSSESSIONS = 80;
const SPAN = 90;
let clockTable = null;

// clockTable[n][d + SPAN][ball]: chance of winning with n possessions left,
// d points ahead, and the next possession ours (0) or theirs (1). A draw
// counts as half.
function clockValues() {
  if (clockTable) return clockTable;
  const { turnover: po, retained: ps, three, five, seven } = POSSESSION;
  const width = 2 * SPAN + 1;
  const at = (row, d, ball) => row[Math.max(0, Math.min(width - 1, d + SPAN)) * 2 + ball];
  clockTable = [];
  let prev = new Float64Array(width * 2);
  for (let d = -SPAN; d <= SPAN; d++) prev[(d + SPAN) * 2] = prev[(d + SPAN) * 2 + 1] = d > 0 ? 1 : d < 0 ? 0 : 0.5;
  clockTable.push(prev);
  for (let n = 1; n <= MAX_POSSESSIONS; n++) {
    const row = new Float64Array(width * 2);
    for (let d = -SPAN; d <= SPAN; d++) {
      const i = (d + SPAN) * 2;
      // After a score the other side has the ball.
      row[i] = po * at(prev, d, 1) + ps * at(prev, d, 0) + three * at(prev, d + 3, 1) + five * at(prev, d + 5, 1) + seven * at(prev, d + 7, 1);
      row[i + 1] = po * at(prev, d, 0) + ps * at(prev, d, 1) + three * at(prev, d - 3, 0) + five * at(prev, d - 5, 0) + seven * at(prev, d - 7, 0);
    }
    clockTable.push(row);
    prev = row;
  }
  return clockTable;
}

// Sudden death: the chance the side with the ball (ball 0) or without it
// (ball 1) scores next.
function nextScore(ball) {
  const { turnover: po, retained: ps, three, five, seven } = POSSESSION;
  const s = three + five + seven;
  const x = s / (1 - ps - (po * po) / (1 - ps));
  return ball === 0 ? x : 1 - x;
}

// Rolls still to play in the match, both halves.
const rollsToGo = match => rollsLeft(match) + (match.half === 1 ? halfRolls(match) : 0);

// Possessions to come after the current one ends: none once the clock has
// run out in the second half; otherwise the rolls left, plus half a
// possession for the last play that runs past the clock.
export function possessionsAfter(match) {
  if (match.suddenDeath) return Infinity;
  if (match.half === 2 && timeUp(match)) return 0;
  return rollsToGo(match) / ROLLS_PER_POSSESSION + 0.5;
}

// Possessions left counting the one starting (or going on) now.
export const possessionsLeft = match => (match.suddenDeath ? Infinity : Math.max(1, possessionsAfter(match)));

// Chance of winning `d` points ahead with `n` possessions to play.
function clockWin(d, ball, n) {
  if (n === Infinity) return d > 0 ? 1 : d < 0 ? 0 : nextScore(ball);
  const table = clockValues();
  const k = Math.min(MAX_POSSESSIONS, n);
  const lo = Math.floor(k);
  const hi = Math.min(MAX_POSSESSIONS, lo + 1);
  const value = row => row[Math.max(0, Math.min(2 * SPAN, d + SPAN)) * 2 + ball];
  return value(table[lo]) * (1 - (k - lo)) + value(table[hi]) * (k - lo);
}

const clocked = match => match.format === 'rolls' || match.suddenDeath;
const lead = (match, team) => match.teams[team].score - match.teams[1 - team].score;

// Chance `team` wins from the start of a possession by `attacker`.
export function winFromPossession(match, team, attacker = match.attacker) {
  if (clocked(match)) return clockWin(lead(match, team), attacker === team ? 0 : 1, possessionsLeft(match));
  const v = table(match.target.half, match.target.full);
  const a = match.teams[team].score;
  const b = match.teams[1 - team].score;
  const shr = match.firstReceiver === null ? 0 : (1 - match.firstReceiver === team ? 0 : 1);
  return v(a, b, attacker === team ? 0 : 1, match.half, shr);
}

// Chance `team` wins from any moment, reading the big single-roll moments
// (try, kicks) a step ahead so the meter moves when they happen.
export function winProbability(match, team) {
  const step = match.step;
  if (step.type === 'fulltime') return match.winner === null ? 0.5 : match.winner === team ? 1 : 0;
  if (match.attacker === null || match.firstReceiver === null) return 0.5;
  if (step.type === 'halftime') return winFromPossession(match, team, 1 - match.firstReceiver);
  const att = match.attacker;
  const scores = match.teams.map(t => t.score);
  let at;
  if (clocked(match)) {
    // A score in sudden death wins it; otherwise play goes on as the clock allows.
    const n = possessionsAfter(match);
    at = (extra, ball) => {
      const d = lead(match, team) + (att === team ? extra : -extra);
      return match.suddenDeath && extra ? (d > 0 ? 1 : 0) : clockWin(d, ball === team ? 0 : 1, n);
    };
  } else {
    const v = table(match.target.half, match.target.full);
    const shr = 1 - match.firstReceiver === team ? 0 : 1;
    at = (extra, ball) => {
      const s = [...scores];
      s[att] += extra;
      return v(s[team], s[1 - team], ball === team ? 0 : 1, match.half, shr);
    };
  }
  if (step.purpose === 'try') {
    const p = tryChance();
    const conv = 4 / 6;
    // Whatever happens, the other side has the ball next.
    return p * (conv * at(7, 1 - att) + (1 - conv) * at(5, 1 - att)) + (1 - p) * at(0, 1 - att);
  }
  // After a goal the other side has the ball, unless a kicking card wins it back.
  const after = kind => (keepsBall(match, att, kind) ? att : 1 - att);
  if (step.purpose === 'kick') {
    const p = kickChance(step.range, kickBonus(match, att, step.kick));
    const points = step.kick === 'conversion' ? 2 : 3;
    return p * at(points, after(step.kick)) + (1 - p) * at(0, 1 - att);
  }
  // A shot at goal on offer: the side with the ball takes whichever is better.
  if (step.type === 'choose' && (step.purpose === 'penalty' || step.purpose === 'drop')) {
    const p = kickChance(step.range, kickBonus(match, att, step.purpose));
    const kick = p * at(3, after(step.purpose)) + (1 - p) * at(0, 1 - att);
    const play = winFromPossession(match, team);
    return team === att ? Math.max(kick, play) : Math.min(kick, play);
  }
  return winFromPossession(match, team);
}

// A side's cards as an edge on the log-odds: each card's measured lift (its
// value, the win rate it adds from the kick-off against no card) as log-odds,
// added up for the side's two cards.
const logit = p => Math.log(p / (1 - p));
export const cardsEdge = (match, team) => teamCards(match, team).reduce((sum, card) => sum + logit(0.5 + cardWorth(card, match.format)), 0);

// What a sin bin (for a whole half), a red card and an injury (for the whole
// match) cost the side that has them, as win rate given away from the
// kick-off. Over 3,000 matches each: the other side sin-binned won 58.5% on
// the clock and 60.9% in a race, red-carded 69.0% and 74.9%; an injury costs
// about 12 points in a hundred per point of injury, times the share of runs
// that player carries (Forwards −1: −4.5 and −3.8).
const CONDITIONS = {
  rolls: { sinBin: 0.085, red: 0.19 },
  points: { sinBin: 0.121, red: 0.261 },
};
const INJURY = 0.12;
const CARRIES = { S: 0.1, F: 0.34, C: 0.2, W: 0.2, B: 0.16 };

// How much of the match, and of this half, is still to play: 1 at the start, 0 at the end.
function stillToPlay(match) {
  const top = Math.max(...match.teams.map(t => t.score));
  if (clocked(match)) {
    const match_ = Math.min(1, possessionsAfter(match) * ROLLS_PER_POSSESSION / match.target.rolls);
    return { match: match_, half: match.suddenDeath ? 1 : rollsLeft(match) / halfRolls(match) };
  }
  const { half, full } = match.target;
  return {
    match: Math.max(0, 1 - top / full),
    half: match.half === 1 ? Math.max(0, 1 - top / half) : Math.min(1, Math.max(0, (full - top) / (full - half))),
  };
}

// What a side's sin bin, red card and injuries cost it now, as log-odds.
function setbacks(match, team, left) {
  const t = match.teams[team];
  const c = CONDITIONS[match.format === 'rolls' ? 'rolls' : 'points'];
  let cost = t.yellows >= 2 ? logit(0.5 + c.red) * left.match : t.sinBin ? logit(0.5 + c.sinBin) * left.half : 0;
  for (const [pos, n] of Object.entries(t.injuries || {})) if (n) cost += logit(0.5 + Math.min(0.4, INJURY * CARRIES[pos] * n)) * left.match;
  return cost;
}

// The live meter: the model above, plus what the model can't see: the team
// cards, sin bins, red cards and injuries. The difference in the sides' card
// edges counts in full at the kick-off and fades as the match runs out; a
// sin bin fades with the half. The Expert CPU judges by the model alone,
// since all of these are already in its look-ahead.
export function winMeter(match, team) {
  const p = winProbability(match, team);
  if (p <= 0 || p >= 1) return p;
  const left = stillToPlay(match);
  const cards = cardsEdge(match, team) - cardsEdge(match, 1 - team);
  const diff = cards * left.match + setbacks(match, 1 - team, left) - setbacks(match, team, left);
  if (!diff) return p;
  return 1 / (1 + Math.exp(-(logit(p) + diff)));
}
