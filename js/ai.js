// CPU decision making. "Pro" weighs the odds; "Rookie" plays on instinct.

import { kickChance, receiverOdds, tryChance } from './engine.js';

const TRY_VALUE = 6.3; // a try plus a typical conversion

function pointsToWin(match, team) {
  return match.target.full - match.teams[team].score;
}

function receiverValue(match, team, pos) {
  const odds = receiverOdds(match, team, pos);
  return odds.lineBreak * tryChance() * TRY_VALUE - odds.error * 2;
}

function bestReceiver(match, team, options) {
  return options
    .map(pos => ({ pos, value: receiverValue(match, team, pos) }))
    .sort((a, b) => b.value - a.value)[0].pos;
}

function shouldKick(match, team, range, points) {
  const chance = kickChance(range);
  if (points >= pointsToWin(match, team)) return chance >= 1 / 3;
  return chance >= 0.5;
}

export function cpuChoice(match, rng = Math.random) {
  const step = match.step;
  const rookie = match.cpuLevel === 'rookie';
  const pick = options => options[Math.floor(rng() * options.length)];

  switch (step.purpose) {
    case 'toss':
      return pick(step.options);
    case 'pass':
      if (rookie && rng() < 0.5) return pick(step.options);
      return bestReceiver(match, step.team, step.options);
    case 'drop':
      if (rookie) return kickChance(step.range) >= 0.5 && rng() < 0.7 ? 'kick' : 'pass';
      return shouldKick(match, step.team, step.range, 3) ? 'kick' : 'pass';
    case 'penalty':
      if (rookie) return rng() < 0.6 ? 'kick' : 'tap';
      return shouldKick(match, step.team, step.range, 3) ? 'kick' : 'tap';
  }
  return step.options[0];
}

// What the CPU would do, used to offer the human a gentle hint.
export function suggestedChoice(match) {
  const pro = { ...match, cpuLevel: 'pro' };
  return cpuChoice(pro, () => 0.99);
}
