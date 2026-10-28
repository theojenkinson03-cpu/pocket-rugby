// Win probability. A possession ends in one of a few ways (measured over
// 20,000 simulated matches, scripts/possessions in the README); from those
// odds, exact dynamic programming over the score gives each side's chance of
// winning from any score, ball and half. Used for the live win meter and as
// the Expert CPU's judge at the end of each look-ahead.

import { kickBonus, kickChance, tryChance } from './engine.js';
import { teamCard } from './cards.js';

// How a possession ends: points the attackers scored, and who has the next one.
export const POSSESSION = {
  turnover: 0.5448, // 0 points, the other side's ball
  retained: 0.1074, // 0 points, same side again (won back at a set piece)
  three: 0.1401, // penalty or drop goal, then the scorers receive
  five: 0.0716, // try, conversion missed
  seven: 0.1361, // try and conversion
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
      const [x, y] = solve(ourScore(a, b, (p, q) => v2(p, q, 0)), theirScore(a, b, (p, q) => v2(p, q, 1)));
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
        const [x, y] = solve(ourScore(a, b, (p, q) => v1(p, q, 0)), theirScore(a, b, (p, q) => v1(p, q, 1)));
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

// Chance `team` wins from the start of a possession by `attacker`.
export function winFromPossession(match, team, attacker = match.attacker) {
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
  if (step.type === 'fulltime') return match.winner === team ? 1 : 0;
  if (match.attacker === null || match.firstReceiver === null) return 0.5;
  if (step.type === 'halftime') return winFromPossession(match, team, 1 - match.firstReceiver);
  const v = table(match.target.half, match.target.full);
  const att = match.attacker;
  const shr = 1 - match.firstReceiver === team ? 0 : 1;
  const scores = match.teams.map(t => t.score);
  const at = (extra, ball) => {
    const s = [...scores];
    s[att] += extra;
    return v(s[team], s[1 - team], ball === team ? 0 : 1, match.half, shr);
  };
  if (step.purpose === 'try') {
    const p = tryChance();
    const conv = 4 / 6;
    return p * (conv * at(7, att) + (1 - conv) * at(5, att)) + (1 - p) * at(0, 1 - att);
  }
  if (step.purpose === 'kick') {
    const p = kickChance(step.range, kickBonus(match, att, step.kick));
    const points = step.kick === 'conversion' ? 2 : 3;
    const miss = step.kick === 'conversion' ? at(0, att) : at(0, 1 - att);
    return p * at(points, att) + (1 - p) * miss;
  }
  return winFromPossession(match, team);
}

// The live meter: the model above, plus the team cards. Each card's measured
// lift (its value: the win rate it adds from the kick-off) becomes an edge
// for its side that fades as the points run out. Four times the difference on
// the log-odds matches the lift at the kick-off. The Expert CPU judges by the
// model alone, since both sides' cards are already in its look-ahead.
export function winMeter(match, team) {
  const p = winProbability(match, team);
  if (p <= 0 || p >= 1) return p;
  const value = i => teamCard(match, i)?.value || 0;
  const diff = value(team) - value(1 - team);
  if (!diff) return p;
  const left = Math.max(0, 1 - Math.max(...match.teams.map(t => t.score)) / match.target.full);
  return 1 / (1 + Math.exp(-(Math.log(p / (1 - p)) + 4 * diff * left)));
}
