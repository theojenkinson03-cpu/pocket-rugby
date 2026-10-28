// The daily challenge: one rigged situation a day, the same for everyone.
// The date picks two real clubs, the score, who has the ball and the
// conditions; it also seeds the dice, so the same choices meet the same
// rolls. Only the first finished attempt counts for the leaderboard.

import { POSITIONS } from './dice.js';
import { CARD_IDS, rollRarity } from './cards.js';
import { MATCH_LENGTHS, newMatch, rollWeather, seededRng, TRY_RUN_IN } from './engine.js';
import { randomRoster } from './players.js';
import { LEAGUES } from './tournament.js';
import { winMeter } from './winprob.js';

// Day 1 of the daily challenge.
export const FIRST_DAY = '2026-10-28';

// Today's key: the UTC date, so everyone everywhere plays the same one.
export const dayKey = (date = new Date()) => date.toISOString().slice(0, 10);

export function dayNumber(key) {
  const ms = Date.parse(`${key}T00:00:00Z`) - Date.parse(`${FIRST_DAY}T00:00:00Z`);
  return Math.floor(ms / 86400000) + 1;
}

// A 32-bit seed from the day's key.
export function daySeed(key) {
  let h = 0x811c9dc5;
  for (const ch of `pocket-rugby-daily:${key}`) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

const pick = (list, rng) => list[Math.floor(rng() * list.length)];

// Scores a side can have: 1, 2 and 4 can't be made from tries, conversions and goals.
const reachable = n => n === 0 || n === 3 || n >= 5;

// Tries, conversions, penalty and drop goals that make `points`, with
// every conversion after a try. Picks a plausible split.
export function scoreParts(points, rng) {
  if (!reachable(points)) throw new Error(`${points} can't be scored`);
  for (let guard = 0; guard < 200; guard++) {
    const tries = Math.floor(rng() * (Math.floor(points / 5) + 1));
    const conversions = Math.floor(rng() * (tries + 1));
    const rest = points - tries * 5 - conversions * 2;
    if (rest < 0 || rest % 3) continue;
    const goals = rest / 3;
    const drops = Math.floor(rng() * (Math.min(goals, 2) + 1));
    return { tries, conversions, penaltyGoals: goals - drops, dropGoals: drops };
  }
  // Always possible: tries and goals alone.
  for (let tries = 0; tries * 5 <= points; tries++) {
    if ((points - tries * 5) % 3 === 0) return { tries, conversions: 0, penaltyGoals: (points - tries * 5) / 3, dropGoals: 0 };
  }
  throw new Error(`no split for ${points}`);
}

// Where the match stands when you take over.
export const SITUATIONS = {
  ball: { text: 'Your ball', detail: 'Your Scrum Half has it, phase 1.' },
  penalty: { text: 'Penalty to you', detail: 'Kick for goal or tap and go.' },
  scrum: { text: 'Your scrum', detail: 'Your feed.' },
  lineout: { text: 'Their lineout', detail: 'They throw in.' },
  defend: { text: 'Their ball', detail: 'Stop them: they have it, phase 1.' },
};

// Something else the day throws in.
const TWISTS = ['none', 'none', 'injured', 'sinbinned', 'theirSinBin', 'theirInjury'];

// How hard a day may be: the win model's chance for you when you take over.
export const DIFFICULTY = [0.12, 0.42];

// The day's scenario: plain data, the same for everyone that day. The
// score and the situation are drawn until the win model gives you a real
// but uphill chance (between 12% and 42%).
export function dailyScenario(key) {
  const rng = seededRng(daySeed(key));
  const leagueId = pick(['prem', 'urc', 'top14', 'super'], rng);
  const league = LEAGUES[leagueId];
  const clubs = [...league.teams];
  const you = clubs.splice(Math.floor(rng() * clubs.length), 1)[0];
  const them = pick(clubs, rng);
  const base = {
    key,
    number: dayNumber(key),
    league: leagueId,
    teams: [you.id, them.id],
    home: rng() < 0.5 ? 0 : 1,
    length: 'standard',
    personality: them.personality,
    rosters: [randomRoster(you.flavour, rng), randomRoster(them.flavour, rng)],
    diceSeed: (daySeed(key) ^ 0x9e3779b9) >>> 0,
  };
  const full = MATCH_LENGTHS[base.length].full;
  let best = null;
  for (let attempt = 0; attempt < 40; attempt++) {
    // They need a score or two to win; you need more.
    const need = pick([3, 5, 6, 7, 8, 10], rng);
    const theirs = full - need;
    let yours = theirs - pick([3, 5, 6, 7, 8, 10, 12], rng);
    while (!reachable(yours)) yours--;
    const cards = rng() < 0.5 ? [0, 1].map(() => ({ id: null, rarity: rollRarity(rng) })) : null;
    if (cards) {
      const pool = [...CARD_IDS];
      cards.forEach(c => (c.id = pool.splice(Math.floor(rng() * pool.length), 1)[0]));
    }
    const candidate = {
      ...base,
      score: [yours, theirs],
      situation: pick(Object.keys(SITUATIONS), rng),
      range: 1 + Math.floor(rng() * 4),
      cards,
      weather: rng() < 0.6 ? rollWeather(rng) : null,
      twist: pick(TWISTS, rng),
      twistPos: pick(POSITIONS.filter(p => p !== 'S'), rng),
    };
    const chance = winMeter(dailyMatch(candidate), 0);
    const [lo, hi] = DIFFICULTY;
    const miss = chance < lo ? lo - chance : chance > hi ? chance - hi : 0;
    if (!best || miss < best.miss) best = { scenario: { ...candidate, chance: Math.round(chance * 1000) / 1000 }, miss };
    if (miss === 0) break;
  }
  return best.scenario;
}

// "7 down, 5 to play": the headline. In a points race the clock is the
// other side's score: they need `need` more to win.
export function scenarioTitle(s) {
  const full = MATCH_LENGTHS[s.length].full;
  const down = s.score[1] - s.score[0];
  return `${down} down, ${full - s.score[1]} to play`;
}

const clubOf = (s, i) => LEAGUES[s.league].teams.find(t => t.id === s.teams[i]);

// Gives a side stats that add up to its score, as if the match so far had happened.
function backfill(team, points, rng) {
  const parts = scoreParts(points, rng);
  Object.assign(team.stats, parts, {
    conversionAttempts: parts.tries,
    penaltyAttempts: parts.penaltyGoals,
    dropAttempts: parts.dropGoals,
    metres: parts.tries * TRY_RUN_IN,
  });
  for (let i = 0; i < parts.tries; i++) {
    const pos = pick(['F', 'C', 'W', 'W', 'B'], rng);
    team.players[pos].tries++;
    team.players[pos].metres += TRY_RUN_IN;
  }
  // The Fly Half took the place kicks; the Centres dropped the goals.
  team.players.B.points = parts.conversions * 2 + parts.penaltyGoals * 3;
  team.players.C.points = parts.dropGoals * 3;
  team.score = points;
}

// The match at the moment you take over, and the seeded dice for it.
export function dailyMatch(s) {
  const rng = seededRng(s.diceSeed ^ 0x1234567);
  const sides = [0, 1].map(i => {
    const club = clubOf(s, i);
    return { name: club.name, color: club.color, kit: club.kit || null, roster: s.rosters[i] };
  });
  // Two clubs in the same colours: the visitors change.
  const away = 1 - s.home;
  const clash = (a, b) => {
    const rgb = hex => [1, 3, 5].map(k => parseInt(hex.slice(k, k + 2), 16));
    const [x, y] = [rgb(a), rgb(b)];
    return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]) < 110;
  };
  if (clash(sides[0].color, sides[1].color)) {
    const club = clubOf(s, away);
    sides[away] = { ...sides[away], color: [club.alt, '#f4f4f0', '#18191b', '#e8701c'].find(c => !clash(c, sides[s.home].color)), kit: null };
  }
  const homeClub = clubOf(s, s.home);
  const m = newMatch({
    mode: '1p',
    teams: sides,
    length: s.length,
    cards: !!s.cards,
    cpuLevel: 'pro',
    cpuPersonality: s.personality,
    bench: true,
    weather: s.weather,
    venue: { name: homeClub.ground, neutral: false },
  });
  m.half = 2;
  m.firstReceiver = 1;
  m.toss = { call: 'heads', result: 'tails', caller: 1, winner: 1 };
  m.teams.forEach((t, i) => backfill(t, s.score[i], rng));
  if (s.cards) {
    m.deal = [s.cards[0].id, s.cards[1].id];
    m.dealRarity = { [s.cards[0].id]: s.cards[0].rarity, [s.cards[1].id]: s.cards[1].rarity };
    m.teams.forEach((t, i) => {
      t.card = s.cards[i].id;
      t.cardRarity = s.cards[i].rarity;
    });
  }
  const [me, cpu] = m.teams;
  if (s.twist === 'injured') me.injuries[s.twistPos] = 1;
  if (s.twist === 'theirInjury') cpu.injuries[s.twistPos] = 1;
  if (s.twist === 'sinbinned') {
    me.yellows = 1;
    me.sinBin = true;
    me.stats.cards = 1;
  }
  if (s.twist === 'theirSinBin') {
    cpu.yellows = 1;
    cpu.sinBin = true;
    cpu.stats.cards = 1;
  }
  // Who has the ball, and what happens next.
  const attack = team => {
    m.attacker = team;
    m.carrier = 'S';
    m.phase = 1;
    m.step = { type: 'roll', purpose: 'attack', dice: ['S'], team };
  };
  switch (s.situation) {
    case 'ball': attack(0); break;
    case 'defend': attack(1); break;
    case 'penalty':
      attack(0);
      m.step = { type: 'choose', purpose: 'penalty', team: 0, range: s.range, options: ['kick', 'tap'] };
      break;
    case 'scrum':
      m.attacker = 1;
      m.step = { type: 'roll', purpose: 'setpiece', dice: ['R'], team: 0, piece: 'scrum' };
      break;
    case 'lineout':
      m.attacker = 0;
      m.step = { type: 'roll', purpose: 'setpiece', dice: ['R'], team: 1, piece: 'lineout' };
      break;
  }
  m.teams.forEach(t => t.stats.possessions = Math.max(1, t.stats.tries + t.stats.penaltyGoals + t.stats.dropGoals));
  return m;
}

// The dice for the day: a seeded stream, rebuilt after `used` numbers.
export function dailyDice(s, used = 0) {
  const base = seededRng(s.diceSeed);
  for (let i = 0; i < used; i++) base();
  let count = used;
  const rng = () => {
    count++;
    return base();
  };
  rng.used = () => count;
  return rng;
}

// A finished attempt, ranked: wins first by the winning margin, then
// defeats by how close they came. Higher is better.
export function dailyResult(match) {
  const [me, cpu] = match.teams;
  const won = match.winner === 0;
  const margin = me.score - cpu.score;
  return { won, score: [me.score, cpu.score], margin, rank: won ? 1000 + margin : 500 + margin };
}

// The shareable line: "Pocket Rugby Daily #12 · Won 30–27 from 7 down".
export function shareText(s, result, history = []) {
  const head = `Pocket Rugby Daily #${s.number}`;
  const outcome = result.won ? `Won ${result.score[0]}–${result.score[1]}` : `Lost ${result.score[0]}–${result.score[1]}`;
  // One square per score after you took over: green yours, red theirs.
  const squares = history.map(team => (team === 0 ? '🟩' : '🟥')).join('');
  return [`${head} 🏉`, `${scenarioTitle(s)} · ${outcome}`, squares].filter(Boolean).join('\n');
}

export const SITUATION_IDS = Object.keys(SITUATIONS);
