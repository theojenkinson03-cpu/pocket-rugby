// Shared test helpers: scripted dice, hand-built match states, and an
// independent reading of the rules sheet to check the engine against.

import { act, newMatch } from '../js/engine.js';
import { DICE, POSITIONS } from '../js/dice.js';

// An rng that yields exact die faces (0-5) in order.
export function dice(...faces) {
  const queue = [...faces];
  const rng = () => {
    if (!queue.length) throw new Error('ran out of scripted dice');
    return (queue.shift() + 0.5) / 6;
  };
  rng.remaining = () => queue.length;
  return rng;
}

export const faceOf = (die, predicate) => {
  const index = DICE[die].faces.findIndex(predicate);
  if (index < 0) throw new Error(`no ${die} face matches`);
  return index;
};

export const roll = (m, rng) => act(m, { type: 'roll' }, rng);
export const choose = (m, value, rng) => act(m, { type: 'choose', value }, rng);

// A match frozen at any moment, without playing up to it.
export function stateAt({
  step,
  attacker = 0,
  carrier = 'S',
  phase = 1,
  quickTap = 0,
  half = 1,
  scores = [0, 0],
  injuries = [{}, {}],
  sinBin = [false, false],
  yellows = [0, 0],
  length = 'standard',
  firstReceiver = 0,
  format = 'points',
  decider = false,
  clock = 0,
} = {}) {
  const m = newMatch({ mode: '2p', length, format, decider });
  m.clock = clock;
  m.rolls = clock + (half === 2 ? Math.round(m.target.rolls / 2) : 0);
  m.attacker = attacker;
  m.firstReceiver = firstReceiver;
  m.carrier = carrier;
  m.phase = phase;
  m.quickTap = quickTap;
  m.half = half;
  m.teams.forEach((t, i) => {
    t.score = scores[i];
    Object.assign(t.injuries, injuries[i]);
    t.sinBin = sinBin[i];
    t.yellows = yellows[i];
  });
  m.step = step || { type: 'roll', purpose: 'attack', dice: [carrier], team: attacker };
  return m;
}

// ---- The rules sheet, read independently of the engine ----------------------
// Each function answers one question the way the printed rules do, using only
// the dice data. The engine must agree with every one of them.

export const RULES = {
  // "half time is called when either team amasses 15 points, with full time
  // being reached when 30 points are attained."
  points: { try: 5, conversion: 2, penalty: 3, drop: 3 },

  // "Each player die features one action with extra 'intensity'...
  // Forward - Line Break 6; Centre - Thru the gap 7; Wing - Into the corner 8; Back - High ball 6."
  specials: { F: ['Line Break', 6], C: ['Thru the Gap', 7], W: ['Into the Corner', 8], B: ['High Ball', 6] },

  // "DROP GOAL: a specialized kicking option for the Centre and Back." This
  // game's change: the Centre gives the chance to the Fly Half, who kicks.
  dropGoalKickers: ['C', 'B'],
  dropGoalKicker: 'B',

  // Run value after modifiers. Quick tap: "+1 to all 'intensity' levels ... for
  // the next 3 attacking efforts". Injury: "-1 to that player's position run values".
  intensity(value, { quickTap = 0, injury = 0 } = {}) {
    return Math.max(1, value + (quickTap > 0 ? 1 : 0) - injury);
  },

  // Tackle. "The defending team's tacklers have to equal or better this
  // 'intensity' level with the sum of two rolls of the BROWN die."
  // "BIG HIT: rolling this on the first tackle against a lower HIT UP intensity
  // level (3 or 4) allows you to attempt to steal the ball in the ruck ... A BIG
  // HIT on the second roll of the die simply completes the tackle."
  // "Rolling consecutive BIG HITS ... causes an injury".
  // Sin bin: "-1 on all Defensive dice rolls"; second yellow "-2".
  //
  // Team cards change a few numbers here, read from the card's own wording:
  // +1 on the first die or both (Rush Defence), a higher Hit Up limit for the
  // ruck, a Big Hit on either die contesting it, and contests against big
  // moves too (Jackal).
  tackle(firstFace, secondFace, intensity, { perDie = 0, plainHitUp = true, bonus = [0, 0], ruckMax = 4, ruckOnSecond = false, onSpecial = false } = {}) {
    const [a, b] = [DICE.D.faces[firstFace], DICE.D.faces[secondFace]];
    const isBigHit = f => f.label === 'Big Hit';
    const injury = isBigHit(a) && isBigHit(b);
    const contest = plainHitUp ? intensity <= ruckMax : onSpecial;
    if (contest && (isBigHit(a) || (ruckOnSecond && isBigHit(b)))) return { result: 'ruck', injury };
    if (isBigHit(b)) return { result: 'tackle', injury };
    const sum = a.value + perDie + bonus[0] + (b.value + perDie + bonus[1]);
    return { result: sum >= intensity ? 'tackle' : 'break', injury };
  },

  // "TRY scores your team 5 points ... NO TRY will result in a changeover ...
  // VIDEO REF requires you to reroll". Anything else on the black die is no try.
  tryRoll(face) {
    const f = DICE.K.faces[face];
    if (f.label === 'TRY') return 'try';
    if (f.label === 'VIDEO REF') return 'reroll';
    return 'changeover';
  },

  // "If your 'kick' distance is lower than the 'range' specified, the attempt has missed."
  kickGood(rangeFace, kickFace) {
    return DICE.K.faces[kickFace].kick >= DICE.D.faces[rangeFace].value;
  },

  // "To win the breakdown, you must now roll 'Ruck win' using the BLACK die".
  ruckWon(face) {
    return DICE.K.faces[face].label === 'RUCK WIN';
  },

  // "If the YELLOW dot appears, the team who committed the infringement will have a player sent to the Sin Bin".
  yellow(face) {
    return !!DICE.K.faces[face].card;
  },

  // SCRUM / LINEOUT: the non-offending side rolls the white die. "A green light
  // indicates you have won ... a red one means that it has gone to your
  // opponent." A collapsed scrum is reset and rolled again; a lineout "not
  // straight sees the ball handed over to the opposition for them to retake."
  // "PENALTY AGAINST, your OPPONENT will have the chance to kick ... PENALTY WON gives YOU a chance".
  setPiece(face, piece, feeder) {
    const f = DICE.R.faces[face];
    const opp = 1 - feeder;
    if (f.penalty === 'won') return { penaltyTo: feeder };
    if (f.penalty === 'against') return { penaltyTo: opp };
    const light = f[piece];
    if (light === 'win') return { ball: feeder };
    if (light === 'lose') return { ball: opp };
    if (light === 'reset') return { rollAgain: feeder };
    return { rollAgain: opp };
  },
};

// Where play goes after points: full time, half time, or the restart. The
// printed rules give the restart to the scorers ("Play then restarts with
// the scoring team receiving the kick off"); this game's change gives it to
// the side that conceded (see RULES.md).
export function expectedAfterScore(scores, scorer, half, target) {
  if (scores[scorer] >= target.full) return { type: 'fulltime' };
  if (half === 1 && scores.some(s => s >= target.half)) return { type: 'halftime' };
  // The side that conceded kicks off, to the scorers.
  return { type: 'roll', purpose: 'restart', team: 1 - scorer, receiver: scorer };
}

// The kick-off after a score: `kicker` (the side that conceded) to roll.
export const kickOffBy = kicker => ({ type: 'roll', purpose: 'restart', dice: ['K'], team: kicker, receiver: 1 - kicker });

export const OUTSIDE_BACKS = POSITIONS.filter(p => p !== 'S');

// Text that should never reach a player.
export const BROKEN_TEXT = /undefined|NaN|\[object|null|Infinity/;
