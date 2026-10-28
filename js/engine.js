// Pure rules engine. A match is a plain object; act() returns the next match
// and a list of events describing what happened, for the UI to narrate.

import { DICE, POSITIONS } from './dice.js';
import { CARD_IDS, cardEffects, cardsWith, cardWith, DEAL_SIZE, DRAFT_ORDER, rollRarity } from './cards.js';

export const VERSION = 6;

// Two ways to play a match. 'points': first to `full` wins, with half time
// when either side reaches `half`. 'rolls': a match clock of `rolls` dice
// rolls, half each way; when a half's rolls run out, play goes on until the
// ball is dead, and the match can end at any score, a draw included.
export const FORMATS = ['points', 'rolls'];
//
// Roll counts from simulated matches at each length: about half as long as
// first to 20, 30 and 50 (133, 210 and 350 rolls on average, with a long
// tail), and never much longer than the clock: last plays add about 11 rolls
// a match. Each side scores 9, 14 and 21 points on average; 8%, 6% and 3%
// of matches are drawn.
export const MATCH_LENGTHS = {
  quick: { half: 10, full: 20, rolls: 60, label: 'Quick' },
  standard: { half: 15, full: 30, rolls: 100, label: 'Standard' },
  long: { half: 25, full: 50, rolls: 160, label: 'Marathon' },
};

export const QUICK_TAP_RUNS = 3;

// ---- Weather and the bench (optional rules) ----------------------------------
//
// Weather: rain makes the ball slippery, so the Forwards' and Centres' free
// ‹Pass› faces become knock-ons (the Scrum Half's passes are safe). Wind is
// worth 10 m on every kick: with it at your back, +10 m; into it, −10 m.
// One side has it at their backs in the first half and the ends change at
// half time.
//
// The bench: once a half each side may bring on a replacement for an
// injured player, which clears that player's injury penalty. The choice
// comes when a player is hurt (any injured player may be replaced then) and
// at half time, with the second half's replacement.
export const WET_HANDS = ['F', 'C'];
export const WIND_METRES = 1;

// Conditions for a match: rain on about one match in three, wind on half of
// them, blowing towards either end.
export function rollWeather(rng = Math.random) {
  const rain = rng() < 0.35;
  const wind = rng() < 0.5 ? (rng() < 0.5 ? 0 : 1) : null;
  return { rain, wind };
}

// Which side has the wind at their backs now, or null in still air.
export function windWith(match) {
  const w = match.weather?.wind;
  if (w === null || w === undefined) return null;
  return match.half === 1 ? w : other(w);
}

// +1 (10 m) for the side with the wind, −1 for the side kicking into it.
export function windBonus(match, team) {
  const w = windWith(match);
  if (w === null) return 0;
  return team === w ? WIND_METRES : -WIND_METRES;
}

const other = team => 1 - team;
const rollDie = rng => Math.floor(rng() * 6);

function emptyStats() {
  return {
    tries: 0,
    conversions: 0,
    conversionAttempts: 0,
    penaltyGoals: 0,
    penaltyAttempts: 0,
    dropGoals: 0,
    dropAttempts: 0,
    runs: 0,
    lineBreaks: 0,
    tackles: 0,
    missedTackles: 0,
    bigHits: 0,
    errors: 0,
    turnoversWon: 0,
    penaltiesConceded: 0,
    cards: 0,
    possessions: 0,
    phases: 0,
    metres: 0,
  };
}

// What each of the five players did. Tackles (and missed tackles) go to the
// defender's opposite number (their Outside Backs tackle yours); place kicks
// are the Fly Half's.
export function emptyPlayer() {
  return { carries: 0, metres: 0, lineBreaks: 0, tries: 0, tackles: 0, missed: 0, bigHits: 0, turnovers: 0, passes: 0, points: 0, errors: 0 };
}

// Run metres: how far a carry gets, read from the dice. Tackled, the carrier
// makes twice the intensity less the tackle total, never below 0, so a tackle
// that only just stops a Hit Up 5 (total 5) gives up 5 m and a crushing one
// none. A Big Hit or a ruck contest stops the carry dead. A line break makes
// 10 m and 5 m more for each point the tackle fell short, and a try adds the
// run-in.
export const TRY_RUN_IN = 10;
export function carryMetres(outcome, intensity, total) {
  if (outcome === 'break') return 10 + 5 * (intensity - total);
  if (outcome === 'tackle') return Math.max(0, 2 * intensity - total);
  return 0;
}

const NO_EFFECTS = Object.freeze({});
const emptyPlayers = () => Object.fromEntries(POSITIONS.map(p => [p, emptyPlayer()]));
const freshUses = () => ({ tryRerolls: 0, ownFeedPenalty: 0, theirFeedPenalty: 0 });

// Spends one of a card's limited uses (e.g. "once a half"), if one is left.
// Uses 'per try' count the rerolls on this try attempt; 'always' never run out.
function chargeLeft(m, team, key) {
  const limit = cardEffects(m, team).uses?.[key];
  if (!limit) return false;
  if (limit.per === 'always') return true;
  if (limit.per === 'try') return (m.step.rerolled || 0) < limit.n;
  return (m.teams[team].cardUses[key] || 0) < limit.n;
}

function useCharge(m, team, key) {
  if (!chargeLeft(m, team, key)) return false;
  const { per } = cardEffects(m, team).uses[key];
  if (per === 'match' || per === 'half') m.teams[team].cardUses[key] = (m.teams[team].cardUses[key] || 0) + 1;
  return true;
}

// Whether a goal of this kind ('penalty' or 'drop') would win `team` the
// ball back: a kicking card with a use left, and time to play on.
export function keepsBall(m, team, kind) {
  return !timeUp(m) && (cardEffects(m, team).keepBall || []).includes(kind) && chargeLeft(m, team, 'keepBall');
}

// Half time refreshes the "once a half" uses and keeps the "once a match" ones.
function refreshUses(m, team) {
  const limits = cardEffects(m, team).uses || {};
  const used = m.teams[team].cardUses;
  for (const key of Object.keys(used)) if (limits[key]?.per !== 'match') used[key] = 0;
}

// Rush Defence and the like: +1 on one or both tackle dice, by kind of run.
// The card gives how many dice: 1 is the first, 2 is both.
export function tackleBonusFor(m, def, special) {
  const n = (special ? cardEffects(m, def).tackleBonus?.special : cardEffects(m, def).tackleBonus?.hitUp) || 0;
  return [n >= 1 ? 1 : 0, n >= 2 ? 1 : 0];
}

export function newMatch({
  mode = '1p',
  teams,
  length = 'standard',
  cpuLevel = 'pro',
  cpuPersonality = 'balanced',
  cards = false,
  tossCaller = 0,
  controllers = null,
  venue = null,
  weather = null,
  bench = false,
  format = 'points',
  decider = false,
} = {}) {
  const kits = teams || [
    { name: 'Home', color: '#1d4ed8' },
    { name: 'Away', color: '#b91c1c' },
  ];
  return {
    version: VERSION,
    mode,
    length,
    cpuLevel,
    cpuPersonality,
    cards,
    deal: [],
    dealRarity: {},
    format: format === 'rolls' ? 'rolls' : 'points',
    target: { ...MATCH_LENGTHS[length] },
    // A knockout match: in the rolls format a draw goes to sudden death.
    decider: !!decider,
    // Dice rolled in the match, and in this half (the match clock).
    rolls: 0,
    clock: 0,
    // The rolls have run out: play on until the ball is dead.
    lastPlay: false,
    suddenDeath: false,
    controllers: controllers || (mode === '1p' ? ['human', 'cpu'] : ['human', 'human']),
    // Where it's played, for the kick-off title card: {name, neutral}.
    venue: venue ? { name: venue.name, neutral: !!venue.neutral } : null,
    // {rain, wind}: wind is the side with it at their backs in the first half.
    weather: weather ? { rain: !!weather.rain, wind: weather.wind === 0 || weather.wind === 1 ? weather.wind : null } : null,
    bench: !!bench,
    teams: kits.map(kit => ({
      name: kit.name,
      color: kit.color,
      // A patterned shirt (see color.js), or null for plain.
      kit: kit.kit || null,
      roster: kit.roster ? { ...kit.roster } : null,
      score: 0,
      injuries: { S: 0, F: 0, C: 0, W: 0, B: 0 },
      yellows: 0,
      sinBin: false,
      // Replacements left this half.
      bench: bench ? 1 : 0,
      // Team cards drafted for this match: [{id, rarity}].
      cards: [],
      cardUses: freshUses(),
      stats: emptyStats(),
      players: emptyPlayers(),
    })),
    half: 1,
    attacker: null,
    firstReceiver: null,
    carrier: 'S',
    phase: 0,
    // Metres made in this possession, for the pitch's gain line.
    gained: 0,
    quickTap: 0,
    // Where the +1 runs came from: a quick tap ('tap') or a team card ('card').
    quickTapFrom: null,
    step: { type: 'choose', purpose: 'toss', team: tossCaller, options: ['heads', 'tails'] },
    roll: null,
    toss: null,
    winner: null,
    seq: 0,
  };
}

// Brings a match saved by an older version up to date.
export function migrate(match) {
  if (!match || match.version >= VERSION) return match;
  const m = structuredClone(match);
  m.cards ??= false;
  m.deal ??= [];
  // Cards from before rarities were Common.
  m.dealRarity ??= Object.fromEntries(m.deal.map(id => [id, 'common']));
  m.cpuPersonality ??= 'balanced';
  m.quickTapFrom ??= m.quickTap ? 'tap' : null;
  m.gained ??= 0;
  m.venue ??= null;
  m.weather ??= null;
  m.bench ??= false;
  m.format ??= 'points';
  m.decider ??= false;
  m.rolls ??= 0;
  m.clock ??= 0;
  m.lastPlay ??= false;
  m.suddenDeath ??= false;
  m.target = { ...MATCH_LENGTHS[m.length], ...m.target };
  // A draft saved part way through: the picks so far say whose turn it is.
  if (m.step.purpose === 'draft' && m.step.pick === undefined) {
    m.step.pick = m.teams.reduce((n, t) => n + (t.cards?.length || (t.card ? 1 : 0)), 0);
    delete m.step.first;
  }
  for (const t of m.teams) {
    t.kit ??= null;
    t.bench ??= 0;
    t.roster ??= null;
    // One card each before version 6.
    t.cards ??= t.card ? [{ id: t.card, rarity: t.cardRarity || 'common' }] : [];
    delete t.card;
    delete t.cardRarity;
    t.cardUses = { ...freshUses(), ...t.cardUses };
    t.players = Object.fromEntries(POSITIONS.map(p => [p, { ...emptyPlayer(), ...t.players?.[p] }]));
    t.stats = { ...emptyStats(), ...t.stats };
  }
  m.version = VERSION;
  return m;
}

// ---- Modifiers -----------------------------------------------------------

// Rules: a yellow card is "-1 on all Defensive dice rolls" for the half; a
// second yellow makes it -2 for the match. It applies to each tackle die.
export function defenceModifier(match, team) {
  const t = match.teams[team];
  if (t.yellows >= 2) return -2;
  return t.sinBin ? -1 : 0;
}

// Intensity of a run once quick tap, team cards and injuries are counted.
// With no face given, only the quick tap and the injury apply.
export function intensityParts(match, team, pos, value, face = null) {
  const quickTap = match.attacker === team && match.quickTap > 0 ? 1 : 0;
  const bonus = face ? cardEffects(match, team).runBonus?.[pos] : null;
  const card = bonus ? (face.special ? bonus.special : bonus.hitUp) : 0;
  const defence = face ? cardEffects(match, other(team)) : NO_EFFECTS;
  const fortress = (face?.special ? defence.specialDefence : value >= (defence.hitUpDefenceFrom || 0) ? defence.hitUpDefence : 0) || 0;
  const injury = match.teams[team].injuries[pos];
  return { value, quickTap, card, fortress, injury, intensity: Math.max(1, value + quickTap + card - fortress - injury) };
}

export function runIntensity(match, team, pos, value, face = null) {
  return intensityParts(match, team, pos, value, face).intensity;
}

// Rules: a Big Hit on the first die against a Hit Up of 3 or 4 sets up a
// ruck contest. Only plain Hit Ups qualify, never a player's big move
// (unless a card says so).
export function ruckEligible(face, intensity, max = 4, onSpecial = false) {
  return face.kind === 'run' && (face.special ? onSpecial : intensity <= max);
}

// The ruck limits a defending side's card sets.
export function ruckFor(match, def, face, intensity) {
  const fx = cardEffects(match, def);
  return ruckEligible(face, intensity, fx.ruckMax || 4, !!fx.ruckOnSpecial);
}

// Resolve a pair of defence dice against an intensity. `modifier` applies to
// each die and `bonus` ([first, second], or a number for the first) is a
// card's extra. Shared by the engine and the odds helpers so they never disagree.
export function resolveTackle(firstFace, secondFace, intensity, modifier = 0, canRuck = intensity <= 4, bonus = 0, ruckOnSecond = false) {
  const first = DICE.D.faces[firstFace];
  const second = DICE.D.faces[secondFace];
  const [b1, b2] = Array.isArray(bonus) ? bonus : [bonus, 0];
  const values = [first.value + modifier + b1, second.value + modifier + b2];
  const total = values[0] + values[1];
  const firstHit = first.kind === 'bighit';
  const secondHit = second.kind === 'bighit';
  let outcome;
  if (firstHit && canRuck) outcome = 'ruck';
  else if (secondHit && canRuck && ruckOnSecond) outcome = 'ruck';
  else if (secondHit) outcome = 'bighit';
  else if (total >= intensity) outcome = 'tackle';
  else outcome = 'break';
  return { outcome, total, values, injury: firstHit && secondHit, bigHit: outcome !== 'break' && (firstHit || secondHit) };
}

// ---- Odds ------------------------------------------------------------------

export function breakChance(intensity, modifier = 0, canRuck = intensity <= 4, bonus = 0) {
  let breaks = 0;
  for (let a = 0; a < 6; a++) {
    for (let b = 0; b < 6; b++) {
      if (resolveTackle(a, b, intensity, modifier, canRuck, bonus).outcome === 'break') breaks++;
    }
  }
  return breaks / 36;
}

export function tryChance() {
  const faces = DICE.K.faces;
  const tries = faces.filter(f => f.result === 'try').length / 6;
  const videos = faces.filter(f => f.result === 'video').length / 6;
  return tries / (1 - videos);
}

export function kickChance(range, bonus = 0) {
  return DICE.K.faces.filter(f => f.kick + bonus >= range).length / 6;
}

// A kick's extra distance: the team cards', and the wind's.
export function kickParts(match, team, kick) {
  return { card: cardEffects(match, team).kickBonus?.[kick] || 0, wind: windBonus(match, team) };
}

// Ids of a side's cards that lengthen this kind of kick.
export const kickCards = (match, team, kick) => cardsWith(match, team, fx => fx.kickBonus?.[kick]).map(c => c.id);

export function kickBonus(match, team, kick) {
  const { card, wind } = kickParts(match, team, kick);
  return card + wind;
}

const WET_PASS = Object.freeze({ kind: 'error', label: 'Knock On', error: 'knockon', wet: true });

// What an attacking die's face does once the weather and team cards have
// had their say: {face, wet, swapped, dropped}. In the rain a free ‹Pass›
// for the Forwards or Centres slips loose; Sure Hands and the like turn an
// error back into a pass; Drop-Goal Artist turns a free pass into a drop.
export function attackFace(match, team, pos, faceIndex) {
  const rolled = DICE[pos].faces[faceIndex];
  let face = rolled;
  const wet = !!match.weather?.rain && WET_HANDS.includes(pos) && rolled.kind === 'pass' && !rolled.to;
  if (wet) face = WET_PASS;
  const fx = cardEffects(match, team);
  const lost = face.error || (face.kind === 'intercept' ? 'intercept' : null);
  const swapped = lost && fx.faceSwap?.[pos]?.[lost] === 'pass' ? lost : null;
  if (swapped) face = { kind: 'pass', label: 'Pass' };
  const dropped = face.kind === 'pass' && !face.to && face === rolled && (fx.passToDrop || []).includes(pos);
  if (dropped) face = { kind: 'drop', label: 'Drop Goal' };
  return { face, rolled, wet, swapped, dropped };
}

export function receiverOdds(match, team, pos) {
  const def = other(team);
  const modifier = defenceModifier(match, def);
  let lineBreak = 0;
  let error = 0;
  DICE[pos].faces.forEach((_, i) => {
    const { face } = attackFace(match, team, pos, i);
    if (face.kind === 'run') {
      const intensity = runIntensity(match, team, pos, face.value, face);
      const canRuck = ruckFor(match, def, face, intensity);
      lineBreak += breakChance(intensity, modifier, canRuck, tackleBonusFor(match, def, !!face.special)) / 6;
    }
    if (face.kind === 'error' || face.kind === 'intercept') error += 1 / 6;
  });
  return { lineBreak, error, special: DICE[pos].faces.find(f => f.special) };
}

export function passOptions(from) {
  return POSITIONS.filter(p => p !== 'S' && p !== from);
}

// ---- Flow helpers -------------------------------------------------------

const player = (m, team, pos) => m.teams[team].players[pos];

function attackStep(team, pos) {
  return { type: 'roll', purpose: 'attack', dice: [pos], team };
}

// ---- The match clock (the rolls format) ----

// Rolls in each half.
export const halfRolls = match => Math.round(match.target.rolls / 2);

// The rolls have run out for this half: the next dead ball ends it.
export function timeUp(match) {
  return match.format === 'rolls' && !match.suddenDeath && match.clock >= halfRolls(match);
}

// Rolls left in this half, or null in the points format.
export const rollsLeft = match => (match.format === 'rolls' ? Math.max(0, halfRolls(match) - match.clock) : null);

// The ball is dead with the clock run out: half time, or full time. A draw
// at full time stands, unless the match needs a winner: then the next score
// wins it, the side that received the first kick-off starting with the ball.
function endHalf(m, ev) {
  if (m.half === 1) {
    m.step = { type: 'halftime' };
    ev.push({ type: 'halftime' });
    return;
  }
  const [a, b] = m.teams.map(t => t.score);
  if (a === b && m.decider) {
    m.suddenDeath = true;
    m.lastPlay = false;
    ev.push({ type: 'suddenDeath' });
    startPossession(m, ev, m.firstReceiver, 'kickoff');
    return;
  }
  m.winner = a === b ? null : a > b ? 0 : 1;
  m.step = { type: 'fulltime' };
  ev.push({ type: 'fulltime', winner: m.winner, ...(m.winner === null ? { draw: true } : {}) });
}

function startPossession(m, ev, team, reason) {
  // A tapped penalty plays on; anything else restarts play, and with the
  // clock run out the ball is dead.
  if (reason !== 'quickTap' && timeUp(m)) {
    endHalf(m, ev);
    return;
  }
  const changed = m.attacker !== team;
  m.attacker = team;
  m.carrier = 'S';
  m.phase = 1;
  m.gained = 0;
  m.quickTap = 0;
  m.teams[team].stats.possessions++;
  ev.push({ type: 'possession', team, reason, changed });
  m.step = attackStep(team, 'S');
}

function setPiece(m, ev, piece, feeder) {
  if (timeUp(m)) {
    endHalf(m, ev);
    return;
  }
  m.quickTap = 0;
  m.step = { type: 'roll', purpose: 'setpiece', dice: ['R'], team: feeder, piece };
}

function awardPenalty(m, ev, team) {
  const offender = other(team);
  m.teams[offender].stats.penaltiesConceded++;
  m.attacker = team;
  ev.push({ type: 'penalty', team, offender });
  m.step = { type: 'roll', purpose: 'penalty', dice: ['K', 'D'], team, offender };
}

function addPoints(m, ev, team, points, kind) {
  m.teams[team].score += points;
  ev.push({ type: 'score', team, points, kind, score: m.teams.map(t => t.score) });
}

// Points format: the first to the target wins. Sudden death: any score wins.
function reachedFullTime(m, ev, team) {
  if (!m.suddenDeath && (m.format === 'rolls' || m.teams[team].score < m.target.full)) return false;
  m.winner = team;
  m.step = { type: 'fulltime' };
  ev.push({ type: 'fulltime', winner: team });
  return true;
}

// After any score the side that conceded gets the ball from the restart.
// (The printed rules give it to the scorers; over 2,000 simulated matches a
// side that keeps the ball after scoring runs away with too many games:
// handing it back made the median margin 11 instead of 15 and lead changes
// 40% more common, and makes kicking at goal a real choice.)
// After a score the other side restart with the ball, unless a kicking card
// wins it back after its own kind of goal (`keepBall`).
function afterScore(m, ev, team, kind = null) {
  if (reachedFullTime(m, ev, team)) return;
  if (m.format === 'points' && m.half === 1 && m.teams.some(t => t.score >= m.target.half)) {
    m.step = { type: 'halftime' };
    ev.push({ type: 'halftime' });
    return;
  }
  // With the clock out the ball goes dead anyway: nothing to win back.
  const keep = kind !== null && keepsBall(m, team, kind) && useCharge(m, team, 'keepBall');
  if (keep) cardPlayed(ev, m, team, 'keepBall', fx => (fx.keepBall || []).includes(kind), { kick: kind });
  startPossession(m, ev, keep ? team : other(team), 'restart');
}

// A completed tackle uses up one run of any quick-tap advantage.
function countTackle(m, ev) {
  if (m.quickTap === 0) return;
  m.quickTap--;
  if (m.quickTap === 0) ev.push({ type: 'advantageOver', team: m.attacker });
}

function nextPhase(m) {
  m.phase++;
  m.teams[m.attacker].stats.phases++;
  m.carrier = 'S';
  m.step = attackStep(m.attacker, 'S');
}

// A team card just did something: `test` picks out which of the side's cards.
function cardPlayed(ev, m, team, what, test, extra = {}) {
  const card = cardWith(m, team, test) || m.teams[team].cards[0];
  ev.push({ type: 'cardPlayed', team, card: card.id, rarity: card.rarity, what, ...extra });
}

// ---- Step handlers ----------------------------------------------------------

function onAttack(m, ev, rng) {
  const team = m.attacker;
  const def = other(team);
  const pos = m.step.dice[0];
  const faceIndex = rollDie(rng);
  const T = m.teams[team];
  m.roll = { dice: [pos], faces: [faceIndex], purpose: 'attack', team };

  // Rain, then Sure Hands and the like (an error becomes a free pass), then
  // Drop-Goal Artist (other players' free passes become drop-goal chances).
  const { face, wet, swapped, dropped } = attackFace(m, team, pos, faceIndex);
  if (wet) ev.push({ type: 'wetBall', team, pos });
  if (swapped) cardPlayed(ev, m, team, swapped, fx => fx.faceSwap?.[pos]?.[swapped] === 'pass', wet ? { wet: true } : {});
  if (dropped) cardPlayed(ev, m, team, 'dropChance', fx => (fx.passToDrop || []).includes(pos));

  switch (face.kind) {
    case 'run': {
      T.stats.runs++;
      player(m, team, pos).carries++;
      const parts = intensityParts(m, team, pos, face.value, face);
      const ruck = ruckFor(m, def, face, parts.intensity);
      ev.push({ type: 'run', team, pos, label: face.label, ...parts, special: !!face.special, ruck });
      m.step = { type: 'roll', purpose: 'tackle', dice: ['D', 'D'], team: def, intensity: parts.intensity, carrier: pos, ruck, special: !!face.special };
      break;
    }
    case 'pass':
      if (face.to) {
        player(m, team, pos).passes++;
        ev.push({ type: 'pass', team, from: pos, to: face.to });
        m.carrier = face.to;
        m.step = attackStep(team, face.to);
      } else {
        ev.push({ type: 'passChoice', team, pos });
        m.step = { type: 'choose', purpose: 'pass', team, from: pos, options: passOptions(pos) };
      }
      break;
    case 'drop':
      // The Fly Half takes every drop goal: anyone else gives it back to them.
      if (pos !== 'B') {
        player(m, team, pos).passes++;
        m.carrier = 'B';
      }
      ev.push({ type: 'dropChance', team, pos: 'B', ...(pos !== 'B' ? { from: pos } : {}) });
      m.step = { type: 'roll', purpose: 'range', dice: ['D'], team, kick: 'drop' };
      break;
    case 'error': {
      T.stats.errors++;
      player(m, team, pos).errors++;
      const piece = face.error === 'knockon' ? 'scrum' : 'lineout';
      ev.push({ type: 'error', team, pos, error: face.error, piece, ...(face.wet ? { wet: true } : {}) });
      setPiece(m, ev, piece, def);
      break;
    }
    case 'intercept':
      T.stats.errors++;
      player(m, team, pos).errors++;
      m.teams[def].stats.turnoversWon++;
      player(m, def, pos).turnovers++;
      ev.push({ type: 'intercept', team: def, from: team, pos });
      startPossession(m, ev, def, 'intercept');
      break;
  }
}

function onTackle(m, ev, rng) {
  const def = m.step.team;
  const att = other(def);
  const { intensity, carrier } = m.step;
  const a = rollDie(rng);
  const b = rollDie(rng);
  m.roll = { dice: ['D', 'D'], faces: [a, b], purpose: 'tackle', team: def };
  const modifier = defenceModifier(m, def);
  const bonus = tackleBonusFor(m, def, !!m.step.special);
  const result = resolveTackle(a, b, intensity, modifier, m.step.ruck, bonus, !!cardEffects(m, def).ruckOnSecond);
  const D = m.teams[def];
  const A = m.teams[att];

  if (result.injury) {
    A.injuries[carrier]++;
    ev.push({ type: 'injury', team: att, pos: carrier, penalty: A.injuries[carrier] });
  }
  const hurt = result.injury && A.bench > 0;

  const metres = carryMetres(result.outcome, intensity, result.total);
  A.stats.metres += metres;
  player(m, att, carrier).metres += metres;
  m.gained += metres;

  if (result.outcome === 'break') {
    A.stats.lineBreaks++;
    D.stats.missedTackles++;
    player(m, att, carrier).lineBreaks++;
    player(m, def, carrier).missed++;
    ev.push({ type: 'lineBreak', team: att, pos: carrier, total: result.total, values: result.values, need: intensity, modifier, bonus, metres });
    m.step = { type: 'roll', purpose: 'try', dice: ['K'], team: att, carrier, videos: 0 };
    return;
  }

  D.stats.tackles++;
  player(m, def, carrier).tackles++;
  if (result.bigHit) {
    D.stats.bigHits++;
    player(m, def, carrier).bigHits++;
  }
  ev.push({
    type: 'tackle',
    team: def,
    pos: carrier,
    outcome: result.outcome,
    total: result.total,
    values: result.values,
    need: intensity,
    modifier,
    bonus,
    metres,
  });
  countTackle(m, ev);
  if (result.outcome === 'ruck') {
    m.step = { type: 'roll', purpose: 'ruck', dice: ['K'], team: def };
  } else {
    nextPhase(m);
  }
  // A replacement on the bench: the injured side decides before play goes on.
  if (hurt) offerBench(m, att, 'injury', carrier, m.step);
}

// The injured positions a replacement could come on for.
export const injuredPositions = (match, team) => POSITIONS.filter(p => match.teams[team].injuries[p] > 0);

// Asks `team` whether to bring on a replacement, then carries on with
// `next` (a step, or 'kickoff' for the second half's kick-off).
function offerBench(m, team, when, pos, next) {
  const options = [...injuredPositions(m, team), 'stay'];
  m.step = { type: 'choose', purpose: 'bench', team, when, pos, options, next };
}

// Half time: each side with an injury and a replacement may make a change,
// the side receiving the kick-off last. Returns false when nobody can.
function halfTimeBench(m, after = null) {
  const receiver = other(m.firstReceiver);
  const order = [other(receiver), receiver].filter(t => after === null || (after !== receiver && t === receiver));
  const team = order.find(t => m.teams[t].bench > 0 && injuredPositions(m, t).length);
  if (team === undefined) return false;
  offerBench(m, team, 'halftime', null, 'kickoff');
  return true;
}

function onRuck(m, ev, rng) {
  const def = m.step.team;
  const faceIndex = rollDie(rng);
  const result = DICE.K.faces[faceIndex].result;
  m.roll = { dice: ['K'], faces: [faceIndex], purpose: 'ruck', team: def };
  const byCard = (cardEffects(m, def).ruckAlsoWins || []).includes(result);
  if (result === 'ruck' || byCard) {
    if (byCard) cardPlayed(ev, m, def, 'ruck', fx => (fx.ruckAlsoWins || []).includes(result), { result });
    m.teams[def].stats.turnoversWon++;
    player(m, def, 'F').turnovers++;
    ev.push({ type: 'ruck', team: def, won: true });
    startPossession(m, ev, def, 'ruck');
  } else {
    ev.push({ type: 'ruck', team: def, won: false });
    nextPhase(m);
  }
}

function onTry(m, ev, rng) {
  const team = m.step.team;
  const faceIndex = rollDie(rng);
  const face = DICE.K.faces[faceIndex];
  m.roll = { dice: ['K'], faces: [faceIndex], purpose: 'try', team };

  if (face.result === 'video') {
    m.step = { ...m.step, videos: m.step.videos + 1 };
    ev.push({ type: 'videoRef', team, pos: m.step.carrier });
    return;
  }
  if (face.result === 'try') {
    m.teams[team].stats.tries++;
    player(m, team, m.step.carrier).tries++;
    m.teams[team].stats.metres += TRY_RUN_IN;
    player(m, team, m.step.carrier).metres += TRY_RUN_IN;
    m.gained += TRY_RUN_IN;
    ev.push({ type: 'try', team, pos: m.step.carrier, metres: TRY_RUN_IN });
    addPoints(m, ev, team, 5, 'try');
    if (reachedFullTime(m, ev, team)) return;
    m.quickTap = 0;
    m.step = { type: 'roll', purpose: 'range', dice: ['D'], team, kick: 'conversion' };
    return;
  }
  // Clinical Finisher: a failed try roll is rolled again, while uses last.
  if (useCharge(m, team, 'tryRerolls')) {
    cardPlayed(ev, m, team, face.result === 'ruck' ? 'heldUp' : 'noTry', fx => fx.uses?.tryRerolls);
    m.step = { ...m.step, rerolled: (m.step.rerolled || 0) + 1 };
    return;
  }
  ev.push({ type: 'noTry', team, pos: m.step.carrier, heldUp: face.result === 'ruck' });
  startPossession(m, ev, other(team), 'notry');
}

function onRange(m, ev, rng) {
  const team = m.step.team;
  const kick = m.step.kick;
  const faceIndex = rollDie(rng);
  const range = DICE.D.faces[faceIndex].value;
  const parts = kickParts(m, team, kick);
  const bonus = parts.card + parts.wind;
  m.roll = { dice: ['D'], faces: [faceIndex], purpose: 'range', team };
  ev.push({ type: 'range', team, kick, range, bonus, card: parts.card, wind: parts.wind, chance: kickChance(range, bonus) });
  if (kick === 'conversion') {
    m.step = { type: 'roll', purpose: 'kick', dice: ['K'], team, kick, range, kicker: 'B' };
  } else {
    m.step = { type: 'choose', purpose: 'drop', team, range, from: m.carrier, options: ['kick', 'pass'] };
  }
}

function onPenaltyCheck(m, ev, rng) {
  const { team, offender } = m.step;
  const cardFace = rollDie(rng);
  const rangeFace = rollDie(rng);
  m.roll = { dice: ['K', 'D'], faces: [cardFace, rangeFace], purpose: 'penalty', team };

  const O = m.teams[offender];
  // Squeaky Clean (Rare up): the referee keeps the cards in their pocket.
  const spared = DICE.K.faces[cardFace].card && cardEffects(m, offender).noCards;
  if (spared) cardPlayed(ev, m, offender, 'noCard', fx => fx.noCards);
  if (DICE.K.faces[cardFace].card && !spared) {
    O.yellows++;
    O.stats.cards++;
    if (O.yellows >= 2) {
      O.sinBin = false;
      ev.push({ type: 'card', team: offender, color: 'red', modifier: -2 });
    } else {
      O.sinBin = true;
      ev.push({ type: 'card', team: offender, color: 'yellow', modifier: -1 });
    }
  } else {
    ev.push({ type: 'noCard', team: offender });
  }

  const range = DICE.D.faces[rangeFace].value;
  const parts = kickParts(m, team, 'penalty');
  const bonus = parts.card + parts.wind;
  ev.push({ type: 'range', team, kick: 'penalty', range, bonus, card: parts.card, wind: parts.wind, chance: kickChance(range, bonus) });
  m.step = { type: 'choose', purpose: 'penalty', team, range, options: ['kick', 'tap'] };
}

function onKick(m, ev, rng) {
  const { team, kick, range } = m.step;
  const faceIndex = rollDie(rng);
  const rolled = DICE.K.faces[faceIndex].kick;
  const parts = kickParts(m, team, kick);
  const bonus = parts.card + parts.wind;
  const distance = rolled + bonus;
  const good = distance >= range;
  const S = m.teams[team].stats;
  // The Fly Half kicks everything.
  const kicker = m.step.kicker || 'B';
  m.roll = { dice: ['K'], faces: [faceIndex], purpose: 'kick', team };

  const tally = { conversion: ['conversions', 'conversionAttempts', 2], penalty: ['penaltyGoals', 'penaltyAttempts', 3], drop: ['dropGoals', 'dropAttempts', 3] }[kick];
  S[tally[1]]++;
  ev.push({ type: 'kick', team, kick, range, distance, rolled, bonus, card: parts.card, wind: parts.wind, good, kicker });

  if (good) {
    S[tally[0]]++;
    player(m, team, kicker).points += tally[2];
    addPoints(m, ev, team, tally[2], kick);
    afterScore(m, ev, team, kick);
  } else if (kick === 'conversion') {
    afterScore(m, ev, team);
  } else {
    startPossession(m, ev, other(team), 'missedKick');
  }
}

function onSetPiece(m, ev, rng) {
  const { team, piece } = m.step;
  const faceIndex = rollDie(rng);
  const face = DICE.R.faces[faceIndex];
  m.roll = { dice: ['R'], faces: [faceIndex], purpose: 'setpiece', team, piece };

  if (face.penalty) {
    let awarded = face.penalty === 'won' ? team : other(team);
    let outcome = face.penalty === 'won' ? 'penaltyWon' : 'penaltyAgainst';
    // Squeaky Clean: the referee never pings them on their own feed (and,
    // Mythic, not on the other side's either).
    if (outcome === 'penaltyAgainst' && useCharge(m, team, 'ownFeedPenalty')) {
      cardPlayed(ev, m, team, 'penalty', fx => fx.uses?.ownFeedPenalty);
      awarded = team;
      outcome = 'penaltyWon';
    } else if (outcome === 'penaltyWon' && useCharge(m, other(team), 'theirFeedPenalty')) {
      cardPlayed(ev, m, other(team), 'penalty', fx => fx.uses?.theirFeedPenalty);
      awarded = other(team);
      outcome = 'penaltyAgainst';
    }
    ev.push({ type: 'setPiece', team, piece, outcome, awarded });
    awardPenalty(m, ev, awarded);
    return;
  }
  let outcome = face[piece];
  // Set-Piece Kings: higher rarities never lose their own feed, and steal the other side's.
  if (outcome === 'lose' && cardEffects(m, team).ownFeedWins) {
    cardPlayed(ev, m, team, 'ownFeed', fx => fx.ownFeedWins);
    outcome = 'win';
  } else if (outcome === 'win' && (cardEffects(m, other(team)).stealFeed || []).includes(piece)) {
    cardPlayed(ev, m, other(team), 'steal', fx => (fx.stealFeed || []).includes(piece));
    outcome = 'lose';
  }
  ev.push({ type: 'setPiece', team, piece, outcome });
  if (outcome === 'win' || outcome === 'lose') {
    const winner = outcome === 'win' ? team : other(team);
    startPossession(m, ev, winner, piece);
    // Set-Piece Kings carry the shove on: +1 on their next run.
    const boost = cardEffects(m, winner).setPieceAdvantage || 0;
    if (boost) {
      cardPlayed(ev, m, winner, 'advantage', fx => fx.setPieceAdvantage, { runs: boost });
      m.quickTap = boost;
      m.quickTapFrom = 'card';
    }
    return;
  }
  // Set-Piece Kings take every reset scrum and crooked throw.
  const kings = [0, 1].find(t => cardEffects(m, t).setPieceTies);
  if (kings !== undefined) {
    cardPlayed(ev, m, kings, outcome, fx => fx.setPieceTies);
    startPossession(m, ev, kings, piece);
    m.quickTap = cardEffects(m, kings).setPieceAdvantage || 0;
    m.quickTapFrom = 'card';
    return;
  }
  if (outcome === 'notstraight') m.step = { ...m.step, team: other(team) };
  // A reset scrum leaves the step as it is: same feed, roll again.
}

function onChoose(m, ev, value) {
  const step = m.step;
  switch (step.purpose) {
    case 'pass':
      player(m, step.team, step.from).passes++;
      ev.push({ type: 'pass', team: step.team, from: step.from, to: value, chosen: true });
      m.carrier = value;
      m.step = attackStep(step.team, value);
      break;
    case 'drop':
      if (value === 'kick') {
        ev.push({ type: 'dropAttempt', team: step.team, pos: m.carrier, range: step.range });
        m.step = { type: 'roll', purpose: 'kick', dice: ['K'], team: step.team, kick: 'drop', range: step.range, kicker: m.carrier };
      } else {
        ev.push({ type: 'dropDeclined', team: step.team, pos: m.carrier });
        m.step = { type: 'choose', purpose: 'pass', team: step.team, from: m.carrier, options: passOptions(m.carrier) };
      }
      break;
    case 'penalty':
      if (value === 'kick') {
        ev.push({ type: 'penaltyAttempt', team: step.team, range: step.range });
        m.step = { type: 'roll', purpose: 'kick', dice: ['K'], team: step.team, kick: 'penalty', range: step.range, kicker: 'B' };
      } else {
        ev.push({ type: 'quickTap', team: step.team });
        startPossession(m, ev, step.team, 'quickTap');
        m.quickTap = QUICK_TAP_RUNS;
        m.quickTapFrom = 'tap';
      }
      break;
    case 'bench': {
      const T = m.teams[step.team];
      if (value === 'stay') {
        ev.push({ type: 'playOn', team: step.team, pos: step.pos, when: step.when });
      } else {
        const cleared = T.injuries[value];
        T.injuries[value] = 0;
        T.bench--;
        ev.push({ type: 'replacement', team: step.team, pos: value, cleared, when: step.when });
      }
      if (step.next !== 'kickoff') m.step = step.next;
      else if (!halfTimeBench(m, step.team)) startPossession(m, ev, other(m.firstReceiver), 'kickoff');
      break;
    }
    case 'draft': {
      const rarity = m.dealRarity?.[value] || 'common';
      m.teams[step.team].cards.push({ id: value, rarity });
      const rest = step.options.filter(id => id !== value);
      // The draft ends with one card left over (or none to pick from).
      const last = step.pick + 1 >= DRAFT_ORDER.length || rest.length <= 1;
      ev.push({ type: 'draft', team: step.team, card: value, rarity, pick: step.pick, last });
      if (!last) {
        m.step = draftStep(m, step.pick + 1, rest);
        break;
      }
      for (const id of rest) ev.push({ type: 'discard', card: id, rarity: m.dealRarity?.[id] || 'common' });
      startPossession(m, ev, m.firstReceiver, 'kickoff');
      break;
    }
  }
}

// Who picks with the draft's `pick` (0-3): the toss loser first and fourth,
// the winner (who also receives the kick-off) second and third.
export const drafterOf = (match, pick) => (DRAFT_ORDER[pick] === 'winner' ? match.firstReceiver : other(match.firstReceiver));

function draftStep(m, pick, options) {
  return { type: 'choose', purpose: 'draft', team: drafterOf(m, pick), options, pick };
}

// Deal DEAL_SIZE different cards, each at a rarity of its own, for the
// draft: two each, and the last card left is discarded.
function dealCards(m, ev, rng) {
  const pool = [...CARD_IDS];
  const deal = [];
  const rarity = {};
  while (deal.length < DEAL_SIZE) {
    const id = pool.splice(Math.floor(rng() * pool.length), 1)[0];
    deal.push(id);
    rarity[id] = rollRarity(rng);
  }
  m.deal = deal;
  m.dealRarity = rarity;
  ev.push({ type: 'deal', cards: deal, rarity, first: drafterOf(m, 0) });
  m.step = draftStep(m, 0, [...deal]);
}

// ---- Public API ---------------------------------------------------------------

// Online, a decision has a time limit. Running out of time in play gives the
// other side a penalty; the toss and the draft are picked for you instead.
export const DECISION_SECONDS = 10;
export const TIMED_DECISIONS = ['pass', 'drop', 'penalty', 'bench'];

export function isLegal(match, action) {
  const step = match.step;
  if (!action) return false;
  if (action.type === 'timeout') return step.type === 'choose' && TIMED_DECISIONS.includes(step.purpose);
  if (step.type === 'roll') return action.type === 'roll';
  if (step.type === 'choose') return action.type === 'choose' && step.options.includes(action.value);
  if (step.type === 'halftime') return action.type === 'continue';
  return false;
}

export function act(match, action, rng = Math.random) {
  const m = structuredClone(match);
  const events = actInPlace(m, action, rng);
  return { state: m, events };
}

// The same step as act(), changing `m` itself instead of a copy. For the
// CPU's look-ahead simulations, where copying every state would be slow.
export function actInPlace(m, action, rng = Math.random) {
  if (!isLegal(m, action)) {
    throw new Error(`Illegal action ${JSON.stringify(action)} for step ${JSON.stringify(m.step)}`);
  }
  const ev = [];
  const step = m.step;

  if (step.type === 'roll') {
    m.rolls++;
    m.clock++;
  }
  if (action.type === 'timeout') {
    ev.push({ type: 'timeout', team: step.team, purpose: step.purpose });
    awardPenalty(m, ev, other(step.team));
  } else if (step.type === 'halftime') {
    m.half = 2;
    m.clock = 0;
    m.lastPlay = false;
    m.teams.forEach((t, i) => {
      t.sinBin = false;
      t.bench = m.bench ? 1 : 0;
      refreshUses(m, i);
    });
    ev.push({ type: 'secondHalf', ...(windWith(m) !== null ? { wind: windWith(m) } : {}) });
    if (!halfTimeBench(m)) startPossession(m, ev, other(m.firstReceiver), 'kickoff');
  } else if (step.type === 'choose' && step.purpose === 'toss') {
    const result = rng() < 0.5 ? 'heads' : 'tails';
    const winner = result === action.value ? step.team : other(step.team);
    m.toss = { call: action.value, result, caller: step.team, winner };
    m.firstReceiver = winner;
    ev.push({ type: 'toss', ...m.toss });
    if (m.cards) dealCards(m, ev, rng);
    else startPossession(m, ev, winner, 'kickoff');
  } else if (step.type === 'choose') {
    onChoose(m, ev, action.value);
  } else {
    const handlers = {
      attack: onAttack,
      tackle: onTackle,
      ruck: onRuck,
      try: onTry,
      range: onRange,
      penalty: onPenaltyCheck,
      kick: onKick,
      setpiece: onSetPiece,
    };
    handlers[step.purpose](m, ev, rng);
  }
  // The clock has just run out with the ball still alive: last play.
  if (timeUp(m) && !m.lastPlay && m.step.type !== 'halftime' && m.step.type !== 'fulltime') {
    m.lastPlay = true;
    ev.push({ type: 'lastPlay', half: m.half });
  }

  m.seq++;
  return ev;
}

// Which team must act next, or null when nobody does (full time). Half time
// belongs to the side that receives the second-half kick-off.
export function actingTeam(match) {
  const step = match.step;
  if (step.type === 'fulltime') return null;
  if (step.type === 'halftime') return other(match.firstReceiver);
  return step.team;
}

// Who must act next: 'human', 'cpu' or 'remote'.
export function controllerOf(match) {
  const step = match.step;
  if (step.type === 'halftime' || step.type === 'fulltime') {
    return match.controllers.includes('remote') ? match.controllers[actingTeam(match) ?? 0] : 'human';
  }
  return match.controllers[step.team];
}

// Seeded generator for tests and simulations.
export function seededRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
