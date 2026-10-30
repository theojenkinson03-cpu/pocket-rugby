// Dream Team: this game's own take on building a club from player cards.
// Open packs of real players (bought with coins you earn by playing), pick
// five to start and three on the bench from any nation or club, and climb
// ten divisions against real sides. Every player's rating changes their
// dice, as everywhere else (see the ratings in engine.js). Pure state:
// dream-view.js draws it and app.js plays the matches.

import { POSITIONS } from './dice.js';
import { seededRng } from './engine.js';
import { realSquad, SQUADS, tierOf } from './squads.js';
import { ratingOf, TEAM_BY_ID } from './tournament.js';

export const DREAM_VERSION = 1;
export const TIERS = ['bronze', 'silver', 'gold', 'elite'];
export const TIER_NAMES = { bronze: 'Bronze', silver: 'Silver', gold: 'Gold', elite: 'Elite' };

// ---- The players ----

// Every real player in the game, once each: where a player is in a nation's
// squad and a club's, the higher rating (usually the nation's) counts.
// [{pid, name, pos, rating, tier, team, short, color, alt}], best first.
let pool = null;
export function playerPool() {
  if (pool) return pool;
  const best = new Map();
  for (const team of Object.values(TEAM_BY_ID)) {
    if (!SQUADS[team.id]) continue;
    const real = new Set(POSITIONS.flatMap(p => SQUADS[team.id][p]));
    for (const p of realSquad(team.id, team.flavour, ratingOf(team))) {
      if (!real.has(p.name)) continue;
      const card = { pid: `${team.id}/${p.name}`, name: p.name, pos: p.pos, rating: p.rating, tier: tierOf(p.rating), team: team.id, side: team.name, short: team.short || team.name.slice(0, 3).toUpperCase(), color: team.color, alt: team.alt || '#f4f4f0' };
      const seen = best.get(p.name);
      if (!seen || card.rating > seen.rating) best.set(p.name, card);
    }
  }
  pool = [...best.values()].sort((a, b) => b.rating - a.rating || a.name.localeCompare(b.name));
  return pool;
}
export const playerById = pid => playerPool().find(p => p.pid === pid) || null;

// ---- Packs ----

// What each pack costs, how many players it holds, the chance of each tier
// for every player, and the tier at least one is guaranteed to be.
export const PACKS = [
  { id: 'bronze', name: 'Bronze pack', cost: 300, count: 3, odds: { bronze: 70, silver: 28, gold: 2, elite: 0 }, least: 'bronze' },
  { id: 'silver', name: 'Silver pack', cost: 900, count: 3, odds: { bronze: 25, silver: 60, gold: 14, elite: 1 }, least: 'silver' },
  { id: 'gold', name: 'Gold pack', cost: 2500, count: 3, odds: { bronze: 0, silver: 40, gold: 55, elite: 5 }, least: 'gold' },
  { id: 'elite', name: 'Elite pack', cost: 7000, count: 3, odds: { bronze: 0, silver: 0, gold: 70, elite: 30 }, least: 'elite' },
];
export const PACK_BY_ID = Object.fromEntries(PACKS.map(p => [p.id, p]));

// Coins for a player you let go.
export const SELL_PRICE = { bronze: 40, silver: 120, gold: 400, elite: 1200 };

const pickWeighted = (odds, rng) => {
  const total = Object.values(odds).reduce((a, b) => a + b, 0);
  let x = rng() * total;
  for (const [tier, w] of Object.entries(odds)) {
    if ((x -= w) < 0) return tier;
  }
  return Object.keys(odds).find(t => odds[t]);
};
const ofTier = tier => playerPool().filter(p => p.tier === tier);
const anyOf = (list, rng) => list[Math.floor(rng() * list.length)];

// The players in a pack of this kind: [pid], best last (for the reveal).
export function packPlayers(packId, rng) {
  const pack = PACK_BY_ID[packId];
  const tiers = Array.from({ length: pack.count }, () => pickWeighted(pack.odds, rng));
  const floor = TIERS.indexOf(pack.least);
  if (!tiers.some(t => TIERS.indexOf(t) >= floor)) tiers[0] = pack.least;
  return tiers.map(t => anyOf(ofTier(t), rng).pid).sort((a, b) => playerById(a).rating - playerById(b).rating);
}

// ---- The club ----

// Ten divisions, ten (the start) to one. Each has a target strength for
// the sides you meet, and the CPU plays harder as you climb.
export const DIVISIONS = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
const TARGET = { 10: 66, 9: 69, 8: 72, 7: 75, 6: 77, 5: 79, 4: 81, 3: 83, 2: 85, 1: 87 };
export const levelFor = div => (div >= 8 ? 'rookie' : div >= 4 ? 'pro' : 'expert');
export const REWARDS = { win: 250, draw: 120, loss: 80, perDivision: 50, perTry: 25, title: 1000 };
export const STARTING_COINS = 600;

const rngFor = s => seededRng((s.seed + s.draws * 7919) >>> 0);
const draw = s => {
  const rng = rngFor(s);
  s.draws++;
  return rng;
};

// A new club: a name, your coins and a free starter squad of eight, one at
// each position and three more, from Bronze and Silver.
export function newDream({ name = 'Dream XV', color = '#1d3577', seed = Date.now() >>> 0 } = {}) {
  const s = { version: DREAM_VERSION, name, color, coins: STARTING_COINS, seed, draws: 0, next: 1, cards: [], squad: { start: {}, bench: [] }, division: 10, best: 10, titles: 0, played: 0, won: 0, drawn: 0, lost: 0, packs: 0, last: null };
  const rng = draw(s);
  const pick = (tier, pos) => anyOf(playerPool().filter(p => p.tier === tier && (!pos || p.pos === pos)), rng).pid;
  for (const pos of POSITIONS) addCard(s, pick(rng() < 0.6 ? 'bronze' : 'silver', pos));
  for (let i = 0; i < 3; i++) addCard(s, pick('silver'));
  autoSquad(s);
  return s;
}

function addCard(s, pid) {
  const card = { id: s.next++, pid };
  s.cards.push(card);
  return card;
}
export const cardById = (s, id) => s.cards.find(c => c.id === id) || null;
export const playerOf = (s, id) => playerById(cardById(s, id)?.pid);
const inSquad = (s, id) => Object.values(s.squad.start).includes(id) || s.squad.bench.includes(id);

// The best side the club can pick by itself: the highest rated at each
// position (anyone, out of position, if nobody plays there), then the
// three best of the rest on the bench.
export function autoSquad(s) {
  const players = s.cards.map(c => ({ id: c.id, p: playerById(c.pid) })).filter(x => x.p).sort((a, b) => b.p.rating - a.p.rating);
  const used = new Set();
  const start = {};
  for (const pos of POSITIONS) {
    const x = players.find(y => !used.has(y.id) && y.p.pos === pos);
    if (x) {
      start[pos] = x.id;
      used.add(x.id);
    }
  }
  for (const pos of POSITIONS) {
    if (start[pos]) continue;
    const x = players.find(y => !used.has(y.id));
    if (x) {
      start[pos] = x.id;
      used.add(x.id);
    }
  }
  s.squad = { start, bench: players.filter(y => !used.has(y.id)).slice(0, 3).map(y => y.id) };
  return s;
}

// Put a card in a slot ('start:F' or 'bench:0'), swapping with wherever it
// was; null empties a bench slot.
export function placeCard(s, slot, id) {
  const [kind, key] = slot.split(':');
  const get = sl => (sl.startsWith('start:') ? s.squad.start[sl.slice(6)] : s.squad.bench[Number(sl.slice(6))]);
  const set = (sl, v) => {
    if (sl.startsWith('start:')) s.squad.start[sl.slice(6)] = v;
    else s.squad.bench[Number(sl.slice(6))] = v;
  };
  const slots = [...POSITIONS.map(p => `start:${p}`), ...[0, 1, 2].map(i => `bench:${i}`)];
  const from = slots.find(sl => get(sl) === id);
  const was = get(slot);
  set(slot, id);
  if (from && from !== slot) set(from, was ?? null);
  s.squad.bench = s.squad.bench.slice(0, 3);
  if (kind === 'bench' && Number(key) > s.squad.bench.length) s.squad.bench = s.squad.bench.filter(x => x != null);
  return s;
}

// The side's rating: the starters' average, a point off for each player
// out of position.
export function teamRating(s) {
  const r = POSITIONS.map(pos => {
    const p = playerOf(s, s.squad.start[pos]);
    return p ? p.rating - (p.pos === pos ? 0 : 1) : 50;
  });
  return Math.round(r.reduce((a, b) => a + b, 0) / r.length);
}
export const squadReady = s => POSITIONS.every(pos => playerOf(s, s.squad.start[pos]));

// ---- The store ----

// Buy and open a pack: the coins go and the players join the club.
// Returns the new cards, best last, or throws when you can't afford it.
export function openPack(s, packId) {
  const pack = PACK_BY_ID[packId];
  if (!pack) throw new Error(`no pack ${packId}`);
  if (s.coins < pack.cost) throw new Error('not enough coins');
  s.coins -= pack.cost;
  s.packs++;
  const cards = packPlayers(packId, draw(s)).map(pid => addCard(s, pid));
  // Fill any empty place in the side with the new players.
  if (!squadReady(s) || s.squad.bench.length < 3) autoSquad(s);
  return cards;
}

// Let a player go for coins. Not someone in the side.
export function sellCard(s, id) {
  const card = cardById(s, id);
  if (!card) throw new Error(`no card ${id}`);
  if (inSquad(s, id)) throw new Error('in the side');
  const p = playerById(card.pid);
  s.cards = s.cards.filter(c => c.id !== id);
  s.coins += SELL_PRICE[p.tier];
  return SELL_PRICE[p.tier];
}
export const canSell = (s, id) => !!cardById(s, id) && !inSquad(s, id);

// ---- Matches ----

// The side waiting in your division: a real nation or club whose first five
// are about the division's strength, picked from the closest few.
const sidesByStrength = () => {
  const sides = Object.values(TEAM_BY_ID).filter(t => SQUADS[t.id]).map(t => {
    const squad = realSquad(t.id, t.flavour, ratingOf(t));
    const five = POSITIONS.map(pos => squad.find(p => p.pos === pos));
    return { team: t, squad, rating: Math.round(five.reduce((n, p) => n + p.rating, 0) / 5) };
  });
  return sides.sort((a, b) => a.rating - b.rating);
};
let strengths = null;
export function opponentFor(s) {
  strengths ??= sidesByStrength();
  const target = TARGET[s.division];
  const near = [...strengths].sort((a, b) => Math.abs(a.rating - target) - Math.abs(b.rating - target)).slice(0, 4);
  const rng = seededRng((s.seed ^ (s.played * 2654435761)) >>> 0);
  return near[Math.floor(rng() * near.length)];
}

// The match: your side as team 0, the opponent as team 1, each player at
// their rating; a quick match on the clock, with team cards and the bench.
export function dreamMatchOptions(s) {
  const opp = opponentFor(s);
  const roster = {};
  const ratings = {};
  const offPos = {};
  for (const pos of POSITIONS) {
    const p = playerOf(s, s.squad.start[pos]);
    roster[pos] = p.name;
    ratings[pos] = p.rating;
    if (p.pos !== pos) offPos[pos] = 1;
  }
  const bench = s.squad.bench.map(id => playerOf(s, id)).filter(Boolean).map(p => ({ name: p.name, pos: p.pos, rating: p.rating }));
  const theirs = opp.squad;
  const five = Object.fromEntries(POSITIONS.map(pos => [pos, theirs.find(p => p.pos === pos)]));
  const subs = ['F', 'C', 'W'].map(pos => theirs.filter(p => p.pos === pos)[1]).filter(Boolean);
  const t = opp.team;
  const clash = sameColour(s.color, t.color);
  return {
    mode: '1p',
    length: 'quick',
    format: 'rolls',
    cards: true,
    bench: true,
    cpuLevel: levelFor(s.division),
    cpuPersonality: t.personality || 'balanced',
    venue: { name: t.ground || `${t.name} home`, neutral: false },
    teams: [
      { name: s.name, color: s.color, roster, ratings, bench, offPos },
      {
        name: t.name,
        color: clash ? (sameColour(t.alt || '#f4f4f0', s.color) ? '#e8701c' : t.alt || '#f4f4f0') : t.color,
        kit: clash ? null : t.kit || null,
        roster: Object.fromEntries(POSITIONS.map(pos => [pos, five[pos].name])),
        ratings: Object.fromEntries(POSITIONS.map(pos => [pos, five[pos].rating])),
        bench: subs.map(p => ({ name: p.name, pos: p.pos, rating: p.rating })),
      },
    ],
  };
}
function sameColour(a, b) {
  const rgb = hex => [1, 3, 5].map(k => parseInt(hex.slice(k, k + 2), 16));
  const [x, y] = [rgb(a), rgb(b)];
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]) < 110;
}

// A finished match: coins, and up a division for a win (a title for winning
// in Division 1). Returns {result, coins, promoted, title, division}.
export function recordDream(s, match, opponent) {
  const result = match.winner === 0 ? 'win' : match.winner === null ? 'draw' : 'loss';
  const tries = match.teams[0].stats.tries;
  let coins = REWARDS[result] + REWARDS.perDivision * (10 - s.division) + REWARDS.perTry * tries;
  let promoted = false;
  let title = false;
  s.played++;
  if (result === 'win') {
    s.won++;
    if (s.division === 1) {
      title = true;
      s.titles++;
      coins += REWARDS.title;
    } else {
      s.division--;
      promoted = true;
      s.best = Math.min(s.best, s.division);
    }
  } else if (result === 'draw') s.drawn++;
  else s.lost++;
  s.coins += coins;
  s.last = { result, score: match.teams.map(t => t.score), opponent, coins, promoted, title };
  return { result, coins, promoted, title, division: s.division };
}

// Brings a saved club up to date (none yet: version 1).
export function migrateDream(s) {
  if (!s || s.version !== DREAM_VERSION) return s;
  s.cards = s.cards.filter(c => playerById(c.pid));
  for (const pos of POSITIONS) if (!cardById(s, s.squad.start[pos])) delete s.squad.start[pos];
  s.squad.bench = s.squad.bench.filter(id => cardById(s, id));
  if (!squadReady(s)) autoSquad(s);
  return s;
}
