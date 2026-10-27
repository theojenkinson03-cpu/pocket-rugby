// Pure rules engine. A match is a plain object; act() returns the next match
// and a list of events describing what happened, for the UI to narrate.

import { DICE, POSITIONS } from './dice.js';

export const MATCH_LENGTHS = {
  quick: { half: 10, full: 20, label: 'Quick' },
  standard: { half: 15, full: 30, label: 'Standard' },
  long: { half: 25, full: 50, label: 'Marathon' },
};

export const QUICK_TAP_RUNS = 3;

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
  };
}

export function newMatch({ mode = '1p', teams, length = 'standard', cpuLevel = 'pro' } = {}) {
  const kits = teams || [
    { name: 'Home', color: '#1d4ed8' },
    { name: 'Away', color: '#b91c1c' },
  ];
  return {
    version: 1,
    mode,
    length,
    cpuLevel,
    target: { ...MATCH_LENGTHS[length] },
    controllers: mode === '1p' ? ['human', 'cpu'] : ['human', 'human'],
    teams: kits.map(kit => ({
      name: kit.name,
      color: kit.color,
      score: 0,
      injuries: { S: 0, F: 0, C: 0, W: 0, B: 0 },
      yellows: 0,
      sinBin: false,
      stats: emptyStats(),
    })),
    half: 1,
    attacker: null,
    firstReceiver: null,
    carrier: 'S',
    phase: 0,
    quickTap: 0,
    step: { type: 'choose', purpose: 'toss', team: 0, options: ['heads', 'tails'] },
    roll: null,
    toss: null,
    winner: null,
    seq: 0,
  };
}

// ---- Modifiers -----------------------------------------------------------

export function defenceModifier(match, team) {
  const t = match.teams[team];
  if (t.yellows >= 2) return -2;
  return t.sinBin ? -1 : 0;
}

export function runIntensity(match, team, pos, value) {
  const bonus = match.attacker === team && match.quickTap > 0 ? 1 : 0;
  return Math.max(1, value + bonus - match.teams[team].injuries[pos]);
}

// Resolve a pair of defence dice against an intensity. Shared by the engine
// and the odds helpers so they can never disagree.
export function resolveTackle(firstFace, secondFace, intensity, modifier) {
  const first = DICE.D.faces[firstFace];
  const second = DICE.D.faces[secondFace];
  const total = first.value + second.value + modifier;
  const firstHit = first.kind === 'bighit';
  const secondHit = second.kind === 'bighit';
  let outcome;
  if (firstHit && intensity <= 4) outcome = 'ruck';
  else if (secondHit) outcome = 'bighit';
  else if (total >= intensity) outcome = 'tackle';
  else outcome = 'break';
  return { outcome, total, injury: firstHit && secondHit, bigHit: outcome !== 'break' && (firstHit || secondHit) };
}

// ---- Odds ------------------------------------------------------------------

export function breakChance(intensity, modifier = 0) {
  let breaks = 0;
  for (let a = 0; a < 6; a++) {
    for (let b = 0; b < 6; b++) {
      if (resolveTackle(a, b, intensity, modifier).outcome === 'break') breaks++;
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

export function kickChance(range) {
  return DICE.K.faces.filter(f => f.kick >= range).length / 6;
}

export function receiverOdds(match, team, pos) {
  const modifier = defenceModifier(match, other(team));
  let lineBreak = 0;
  let error = 0;
  for (const face of DICE[pos].faces) {
    if (face.kind === 'run') lineBreak += breakChance(runIntensity(match, team, pos, face.value), modifier) / 6;
    if (face.kind === 'error' || face.kind === 'intercept') error += 1 / 6;
  }
  return { lineBreak, error, special: DICE[pos].faces.find(f => f.special) };
}

export function passOptions(from) {
  return POSITIONS.filter(p => p !== 'S' && p !== from);
}

// ---- Flow helpers -------------------------------------------------------

function attackStep(team, pos) {
  return { type: 'roll', purpose: 'attack', dice: [pos], team };
}

function startPossession(m, ev, team, reason) {
  const changed = m.attacker !== team;
  m.attacker = team;
  m.carrier = 'S';
  m.phase = 1;
  m.quickTap = 0;
  m.teams[team].stats.possessions++;
  ev.push({ type: 'possession', team, reason, changed });
  m.step = attackStep(team, 'S');
}

function setPiece(m, ev, piece, feeder) {
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

function reachedFullTime(m, ev, team) {
  if (m.teams[team].score < m.target.full) return false;
  m.winner = team;
  m.step = { type: 'fulltime' };
  ev.push({ type: 'fulltime', winner: team });
  return true;
}

// After any score the conceding side kicks off to the scoring side.
function afterScore(m, ev, team) {
  if (reachedFullTime(m, ev, team)) return;
  if (m.half === 1 && m.teams.some(t => t.score >= m.target.half)) {
    m.step = { type: 'halftime' };
    ev.push({ type: 'halftime' });
    return;
  }
  startPossession(m, ev, team, 'kickoff');
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

// ---- Step handlers ----------------------------------------------------------

function onAttack(m, ev, rng) {
  const team = m.attacker;
  const pos = m.step.dice[0];
  const faceIndex = rollDie(rng);
  const face = DICE[pos].faces[faceIndex];
  const T = m.teams[team];
  m.roll = { dice: [pos], faces: [faceIndex], purpose: 'attack', team };

  switch (face.kind) {
    case 'run': {
      T.stats.runs++;
      const intensity = runIntensity(m, team, pos, face.value);
      ev.push({ type: 'run', team, pos, label: face.label, value: face.value, intensity, special: !!face.special });
      m.step = { type: 'roll', purpose: 'tackle', dice: ['D', 'D'], team: other(team), intensity, carrier: pos };
      break;
    }
    case 'pass':
      if (face.to) {
        ev.push({ type: 'pass', team, from: pos, to: face.to });
        m.carrier = face.to;
        m.step = attackStep(team, face.to);
      } else {
        ev.push({ type: 'passChoice', team, pos });
        m.step = { type: 'choose', purpose: 'pass', team, from: pos, options: passOptions(pos) };
      }
      break;
    case 'drop':
      ev.push({ type: 'dropChance', team, pos });
      m.step = { type: 'roll', purpose: 'range', dice: ['D'], team, kick: 'drop' };
      break;
    case 'error': {
      T.stats.errors++;
      const piece = face.error === 'knockon' ? 'scrum' : 'lineout';
      ev.push({ type: 'error', team, pos, error: face.error, piece });
      setPiece(m, ev, piece, other(team));
      break;
    }
    case 'intercept':
      T.stats.errors++;
      m.teams[other(team)].stats.turnoversWon++;
      ev.push({ type: 'intercept', team: other(team), from: team, pos });
      startPossession(m, ev, other(team), 'intercept');
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
  const result = resolveTackle(a, b, intensity, modifier);
  const D = m.teams[def];
  const A = m.teams[att];

  if (result.injury) {
    A.injuries[carrier]++;
    ev.push({ type: 'injury', team: att, pos: carrier, penalty: A.injuries[carrier] });
  }

  if (result.outcome === 'break') {
    A.stats.lineBreaks++;
    D.stats.missedTackles++;
    ev.push({ type: 'lineBreak', team: att, pos: carrier, total: result.total, need: intensity, modifier });
    m.step = { type: 'roll', purpose: 'try', dice: ['K'], team: att, carrier, videos: 0 };
    return;
  }

  D.stats.tackles++;
  if (result.bigHit) D.stats.bigHits++;
  ev.push({
    type: 'tackle',
    team: def,
    pos: carrier,
    outcome: result.outcome,
    total: result.total,
    need: intensity,
    modifier,
  });
  countTackle(m, ev);
  if (result.outcome === 'ruck') {
    m.step = { type: 'roll', purpose: 'ruck', dice: ['K'], team: def };
  } else {
    nextPhase(m);
  }
}

function onRuck(m, ev, rng) {
  const def = m.step.team;
  const faceIndex = rollDie(rng);
  m.roll = { dice: ['K'], faces: [faceIndex], purpose: 'ruck', team: def };
  if (DICE.K.faces[faceIndex].result === 'ruck') {
    m.teams[def].stats.turnoversWon++;
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
    ev.push({ type: 'try', team, pos: m.step.carrier });
    addPoints(m, ev, team, 5, 'try');
    if (reachedFullTime(m, ev, team)) return;
    m.quickTap = 0;
    m.step = { type: 'roll', purpose: 'range', dice: ['D'], team, kick: 'conversion' };
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
  m.roll = { dice: ['D'], faces: [faceIndex], purpose: 'range', team };
  ev.push({ type: 'range', team, kick, range, chance: kickChance(range) });
  if (kick === 'conversion') {
    m.step = { type: 'roll', purpose: 'kick', dice: ['K'], team, kick, range };
  } else {
    m.step = { type: 'choose', purpose: 'drop', team, range, from: m.carrier, options: ['kick', 'pass'] };
  }
}

function onPenaltyCheck(m, ev, rng) {
  const { team, offender } = m.step;
  const cardFace = rollDie(rng);
  const rangeFace = rollDie(rng);
  m.roll = { dice: ['K', 'D'], faces: [cardFace, rangeFace], purpose: 'penalty', team };

  if (DICE.K.faces[cardFace].card) {
    const O = m.teams[offender];
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
  ev.push({ type: 'range', team, kick: 'penalty', range, chance: kickChance(range) });
  m.step = { type: 'choose', purpose: 'penalty', team, range, options: ['kick', 'tap'] };
}

function onKick(m, ev, rng) {
  const { team, kick, range } = m.step;
  const faceIndex = rollDie(rng);
  const distance = DICE.K.faces[faceIndex].kick;
  const good = distance >= range;
  const S = m.teams[team].stats;
  m.roll = { dice: ['K'], faces: [faceIndex], purpose: 'kick', team };

  const tally = { conversion: ['conversions', 'conversionAttempts', 2], penalty: ['penaltyGoals', 'penaltyAttempts', 3], drop: ['dropGoals', 'dropAttempts', 3] }[kick];
  S[tally[1]]++;
  ev.push({ type: 'kick', team, kick, range, distance, good });

  if (good) {
    S[tally[0]]++;
    addPoints(m, ev, team, tally[2], kick);
    afterScore(m, ev, team);
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
    const awarded = face.penalty === 'won' ? team : other(team);
    ev.push({ type: 'setPiece', team, piece, outcome: face.penalty === 'won' ? 'penaltyWon' : 'penaltyAgainst', awarded });
    awardPenalty(m, ev, awarded);
    return;
  }
  const outcome = face[piece];
  ev.push({ type: 'setPiece', team, piece, outcome });
  if (outcome === 'win') startPossession(m, ev, team, piece);
  else if (outcome === 'lose') startPossession(m, ev, other(team), piece);
  else if (outcome === 'notstraight') m.step = { ...m.step, team: other(team) };
  // A reset scrum leaves the step as it is: same feed, roll again.
}

function onChoose(m, ev, value) {
  const step = m.step;
  switch (step.purpose) {
    case 'pass':
      ev.push({ type: 'pass', team: step.team, from: step.from, to: value, chosen: true });
      m.carrier = value;
      m.step = attackStep(step.team, value);
      break;
    case 'drop':
      if (value === 'kick') {
        ev.push({ type: 'dropAttempt', team: step.team, pos: m.carrier, range: step.range });
        m.step = { type: 'roll', purpose: 'kick', dice: ['K'], team: step.team, kick: 'drop', range: step.range };
      } else {
        ev.push({ type: 'dropDeclined', team: step.team, pos: m.carrier });
        m.step = { type: 'choose', purpose: 'pass', team: step.team, from: m.carrier, options: passOptions(m.carrier) };
      }
      break;
    case 'penalty':
      if (value === 'kick') {
        ev.push({ type: 'penaltyAttempt', team: step.team, range: step.range });
        m.step = { type: 'roll', purpose: 'kick', dice: ['K'], team: step.team, kick: 'penalty', range: step.range };
      } else {
        ev.push({ type: 'quickTap', team: step.team });
        startPossession(m, ev, step.team, 'quickTap');
        m.quickTap = QUICK_TAP_RUNS;
      }
      break;
  }
}

// ---- Public API ---------------------------------------------------------------

export function isLegal(match, action) {
  const step = match.step;
  if (!action) return false;
  if (step.type === 'roll') return action.type === 'roll';
  if (step.type === 'choose') return action.type === 'choose' && step.options.includes(action.value);
  if (step.type === 'halftime') return action.type === 'continue';
  return false;
}

export function act(match, action, rng = Math.random) {
  if (!isLegal(match, action)) {
    throw new Error(`Illegal action ${JSON.stringify(action)} for step ${JSON.stringify(match.step)}`);
  }
  const m = structuredClone(match);
  const ev = [];
  const step = m.step;

  if (step.type === 'halftime') {
    m.half = 2;
    for (const t of m.teams) t.sinBin = false;
    ev.push({ type: 'secondHalf' });
    startPossession(m, ev, other(m.firstReceiver), 'kickoff');
  } else if (step.type === 'choose' && step.purpose === 'toss') {
    const result = rng() < 0.5 ? 'heads' : 'tails';
    const winner = result === action.value ? step.team : other(step.team);
    m.toss = { call: action.value, result, caller: step.team, winner };
    m.firstReceiver = winner;
    ev.push({ type: 'toss', ...m.toss });
    startPossession(m, ev, winner, 'kickoff');
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

  m.seq++;
  return { state: m, events: ev };
}

// Who must act next: 'human' or 'cpu'.
export function controllerOf(match) {
  const step = match.step;
  if (step.type === 'halftime' || step.type === 'fulltime') return 'human';
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
