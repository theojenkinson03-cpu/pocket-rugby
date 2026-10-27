// Tournaments: a Nations Cup (two pools of four, then semi-finals and a
// final) and a League (eight clubs, everyone plays everyone, then a top-four
// play-off). Other fixtures are played out by the engine, CPU against CPU.

import { act, newMatch } from './engine.js';
import { cpuChoice } from './ai.js';
import { randomRoster } from './players.js';

export const NATIONS = [
  { id: 'nzl', name: 'New Zealand', short: 'NZL', color: '#121314', alt: '#f4f4f0', flavour: 'kiwi', personality: 'run', level: 'expert' },
  { id: 'rsa', name: 'South Africa', short: 'RSA', color: '#0b6e3b', alt: '#f2c230', flavour: 'southern', personality: 'pack', level: 'expert' },
  { id: 'irl', name: 'Ireland', short: 'IRL', color: '#12854a', alt: '#f4f4f0', flavour: 'irish', personality: 'balanced', level: 'expert' },
  { id: 'fra', name: 'France', short: 'FRA', color: '#1d3577', alt: '#f4f4f0', flavour: 'french', personality: 'run', level: 'pro' },
  { id: 'eng', name: 'England', short: 'ENG', color: '#f4f4f0', alt: '#1c2b4a', flavour: 'english', personality: 'boot', level: 'pro' },
  { id: 'aus', name: 'Australia', short: 'AUS', color: '#f2c230', alt: '#1a4d2e', flavour: 'aussie', personality: 'run', level: 'pro' },
  { id: 'sco', name: 'Scotland', short: 'SCO', color: '#20305f', alt: '#9fb7d9', flavour: 'scottish', personality: 'balanced', level: 'pro' },
  { id: 'arg', name: 'Argentina', short: 'ARG', color: '#74acdf', alt: '#1d3577', flavour: 'latin', personality: 'pack', level: 'pro' },
  { id: 'wal', name: 'Wales', short: 'WAL', color: '#c8102e', alt: '#f4f4f0', flavour: 'welsh', personality: 'balanced', level: 'pro' },
  { id: 'fij', name: 'Fiji', short: 'FIJ', color: '#e9eef2', alt: '#121314', flavour: 'pacific', personality: 'run', level: 'pro' },
  { id: 'jpn', name: 'Japan', short: 'JPN', color: '#d4001a', alt: '#f4f4f0', flavour: 'japanese', personality: 'run', level: 'pro' },
  { id: 'ita', name: 'Italy', short: 'ITA', color: '#0a5ec0', alt: '#f4f4f0', flavour: 'italian', personality: 'boot', level: 'rookie' },
];

export const CLUBS = [
  { id: 'ravens', name: 'Harbour Ravens', short: 'RAV', color: '#1d3577', alt: '#f4f4f0', flavour: 'english', personality: 'balanced', level: 'pro' },
  { id: 'foxes', name: 'Valley Foxes', short: 'FOX', color: '#e8701c', alt: '#18191b', flavour: 'welsh', personality: 'run', level: 'pro' },
  { id: 'stags', name: 'Northport Stags', short: 'STA', color: '#7b1e3c', alt: '#e3b31d', flavour: 'scottish', personality: 'pack', level: 'expert' },
  { id: 'kestrels', name: 'Riverside Kestrels', short: 'KES', color: '#0f7a44', alt: '#f4f4f0', flavour: 'irish', personality: 'boot', level: 'pro' },
  { id: 'wolves', name: 'Highland Wolves', short: 'WOL', color: '#4b5563', alt: '#f2c230', flavour: 'scottish', personality: 'pack', level: 'rookie' },
  { id: 'bulls', name: 'Eastgate Bulls', short: 'BUL', color: '#c62a2f', alt: '#18191b', flavour: 'southern', personality: 'pack', level: 'expert' },
  { id: 'gulls', name: 'Westcliff Gulls', short: 'GUL', color: '#4aa2df', alt: '#1d3577', flavour: 'pacific', personality: 'run', level: 'pro' },
  { id: 'saints', name: 'Southbank Saints', short: 'SAI', color: '#18191b', alt: '#f4f4f0', flavour: 'any', personality: 'balanced', level: 'rookie' },
];

export const POINTS = { win: 4, tryBonus: 1, losingBonus: 1, tryBonusAt: 4, losingBonusWithin: 7 };

const shuffle = (list, rng) => {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

// Round robin by the circle method: every pair meets once. Home goes to
// whichever side has had fewer home matches, so everyone gets a fair share.
export function roundRobin(ids) {
  const list = [...ids];
  if (list.length % 2) list.push(null);
  const homes = new Map();
  const rounds = [];
  for (let r = 0; r < list.length - 1; r++) {
    const pairs = [];
    for (let i = 0; i < list.length / 2; i++) {
      const a = list[i];
      const b = list[list.length - 1 - i];
      if (!a || !b) continue;
      const [ha, hb] = [homes.get(a) || 0, homes.get(b) || 0];
      const pair = ha < hb ? [a, b] : hb < ha ? [b, a] : r % 2 ? [b, a] : [a, b];
      homes.set(pair[0], (homes.get(pair[0]) || 0) + 1);
      pairs.push(pair);
    }
    rounds.push(pairs);
    list.splice(1, 0, list.pop());
  }
  return rounds;
}

function fixture(id, stage, round, home, away, group = null) {
  return { id, stage, round, group, home, away, result: null };
}

function makeTeams(roster, rng) {
  return roster.map(team => ({ ...team, roster: randomRoster(team.flavour, rng) }));
}

export function createCup({ userTeam, length = 'quick', cards = true, rng = Math.random }) {
  const others = shuffle(NATIONS.filter(n => n.id !== userTeam), rng).slice(0, 7);
  const field = shuffle([NATIONS.find(n => n.id === userTeam), ...others], rng);
  const pools = { A: field.slice(0, 4).map(n => n.id), B: field.slice(4).map(n => n.id) };
  const fixtures = [];
  for (const [group, ids] of Object.entries(pools)) {
    roundRobin(ids).forEach((pairs, round) => pairs.forEach(([home, away]) => {
      fixtures.push(fixture(`${group}${round}${home}`, 'pool', round, home, away, group));
    }));
  }
  return { kind: 'cup', name: 'Nations Cup', length, cards, userTeam, teams: makeTeams(field, rng), pools, fixtures, stage: 'pool', champion: null };
}

export function createLeague({ userTeam, length = 'quick', cards = true, rng = Math.random }) {
  const field = CLUBS.map(c => c.id);
  const fixtures = [];
  roundRobin(shuffle(field, rng)).forEach((pairs, round) => pairs.forEach(([home, away]) => {
    fixtures.push(fixture(`L${round}${home}`, 'league', round, home, away, 'L'));
  }));
  return { kind: 'league', name: 'League', length, cards, userTeam, teams: makeTeams(CLUBS, rng), pools: { L: field }, fixtures, stage: 'league', champion: null };
}

export const teamOf = (t, id) => t.teams.find(team => team.id === id);

export function isUserFixture(t, f) {
  return f.home === t.userTeam || f.away === t.userTeam;
}

// The stage's earliest round that still has fixtures to play.
export function currentRound(t) {
  const open = t.fixtures.filter(f => f.stage === t.stage && !f.result);
  return open.length ? Math.min(...open.map(f => f.round)) : null;
}

// The user's next match, or null if they have none left in this stage.
export function userFixture(t) {
  const round = currentRound(t);
  if (round === null) return null;
  return t.fixtures.find(f => f.stage === t.stage && f.round === round && !f.result && isUserFixture(t, f)) || null;
}

// Colours too close to tell apart on the pitch.
export function clash(a, b) {
  const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  const [x, y] = [rgb(a), rgb(b)];
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]) < 110;
}

// Kits for a fixture, home first. The away side changes strip on a clash.
export function kits(t, f) {
  const home = teamOf(t, f.home);
  const away = teamOf(t, f.away);
  const awayColor = clash(home.color, away.color) ? away.alt : away.color;
  return [
    { name: home.name, color: home.color, roster: home.roster },
    { name: away.name, color: awayColor, roster: away.roster },
  ];
}

// The user's match, with the user always as team 0.
export function matchOptions(t, f) {
  const [home, away] = kits(t, f);
  const userHome = f.home === t.userTeam;
  const opponent = teamOf(t, userHome ? f.away : f.home);
  const mine = userHome ? home : away;
  let theirs = userHome ? away : home;
  if (clash(mine.color, theirs.color)) theirs = { ...theirs, color: clash(mine.color, opponent.alt) ? opponent.color : opponent.alt };
  return { mode: '1p', teams: [mine, theirs], length: t.length, cards: t.cards, cpuLevel: opponent.level, cpuPersonality: opponent.personality };
}

export function resultFromMatch(f, match, userIsHome) {
  const [mine, theirs] = match.teams;
  const home = userIsHome ? mine : theirs;
  const away = userIsHome ? theirs : mine;
  return {
    score: [home.score, away.score],
    tries: [home.stats.tries, away.stats.tries],
    winner: (match.winner === 0) === userIsHome ? 'home' : 'away',
  };
}

// Plays a CPU-vs-CPU fixture to the end and returns its result.
export function simulateFixture(t, f, rng = Math.random) {
  const [home, away] = kits(t, f);
  const sides = [teamOf(t, f.home), teamOf(t, f.away)];
  let m = newMatch({ mode: '2p', teams: [home, away], length: t.length, cards: t.cards });
  for (let guard = 0; m.step.type !== 'fulltime' && guard < 5000; guard++) {
    const step = m.step;
    let action;
    if (step.type === 'roll') action = { type: 'roll' };
    else if (step.type === 'halftime') action = { type: 'continue' };
    else {
      const side = sides[step.team];
      // Background fixtures use Pro decisions in each side's style: fast and close to Expert.
      action = { type: 'choose', value: cpuChoice({ ...m, cpuLevel: side.level === 'rookie' ? 'rookie' : 'pro', cpuPersonality: side.personality }, rng) };
    }
    m = act(m, action, rng).state;
  }
  return { score: m.teams.map(x => x.score), tries: m.teams.map(x => x.stats.tries), winner: m.winner === 0 ? 'home' : 'away' };
}

export function recordResult(t, fixtureId, result) {
  const f = t.fixtures.find(x => x.id === fixtureId);
  if (!f || f.result) throw new Error(`fixture ${fixtureId} is not open`);
  f.result = result;
  return t;
}

// Plays every other fixture of the current round.
export function simulateRound(t, rng = Math.random) {
  const round = currentRound(t);
  if (round === null) return [];
  const played = [];
  for (const f of t.fixtures) {
    if (f.stage === t.stage && f.round === round && !f.result && !isUserFixture(t, f)) {
      f.result = simulateFixture(t, f, rng);
      played.push(f);
    }
  }
  return played;
}

export function standings(t, group) {
  const ids = t.pools[group];
  const rows = Object.fromEntries(ids.map(id => [id, { id, played: 0, won: 0, lost: 0, for: 0, against: 0, triesFor: 0, bonus: 0, points: 0 }]));
  for (const f of t.fixtures) {
    if (f.group !== group || !f.result) continue;
    const r = f.result;
    [[f.home, 0], [f.away, 1]].forEach(([id, side]) => {
      const row = rows[id];
      const won = (r.winner === 'home') === (side === 0);
      row.played++;
      row.for += r.score[side];
      row.against += r.score[1 - side];
      row.triesFor += r.tries[side];
      if (won) {
        row.won++;
        row.points += POINTS.win;
      } else {
        row.lost++;
        if (r.score[1 - side] - r.score[side] <= POINTS.losingBonusWithin) {
          row.points += POINTS.losingBonus;
          row.bonus++;
        }
      }
      if (r.tries[side] >= POINTS.tryBonusAt) {
        row.points += POINTS.tryBonus;
        row.bonus++;
      }
    });
  }
  // Points, then points difference, then tries, then name for a stable order.
  return Object.values(rows).sort((a, b) => b.points - a.points || (b.for - b.against) - (a.for - a.against) || b.triesFor - a.triesFor || a.id.localeCompare(b.id));
}

const winnerOf = f => (f.result.winner === 'home' ? f.home : f.away);

// Moves to the next stage once every fixture in this one is played.
export function advance(t) {
  if (currentRound(t) !== null || t.stage === 'done') return t;
  if (t.stage === 'pool') {
    const [a, b] = [standings(t, 'A'), standings(t, 'B')];
    t.fixtures.push(fixture('SF1', 'semi', 0, a[0].id, b[1].id), fixture('SF2', 'semi', 0, b[0].id, a[1].id));
    t.stage = 'semi';
  } else if (t.stage === 'league') {
    const table = standings(t, 'L');
    t.fixtures.push(fixture('SF1', 'semi', 0, table[0].id, table[3].id), fixture('SF2', 'semi', 0, table[1].id, table[2].id));
    t.stage = 'semi';
  } else if (t.stage === 'semi') {
    const [s1, s2] = ['SF1', 'SF2'].map(id => t.fixtures.find(f => f.id === id));
    t.fixtures.push(fixture('F', 'final', 0, winnerOf(s1), winnerOf(s2)));
    t.stage = 'final';
  } else if (t.stage === 'final') {
    t.champion = winnerOf(t.fixtures.find(f => f.id === 'F'));
    t.stage = 'done';
  }
  return t;
}

// Whether the user is still in it: always in the group stage, and in the
// knockouts only while they have a fixture in the current round.
export function userAlive(t) {
  if (t.stage === 'pool' || t.stage === 'league') return true;
  if (t.stage === 'done') return t.champion === t.userTeam;
  return t.fixtures.some(f => f.stage === t.stage && isUserFixture(t, f));
}

// The user's record in this tournament so far.
export function userRecord(t) {
  let won = 0;
  let lost = 0;
  for (const f of t.fixtures) {
    if (!f.result || !isUserFixture(t, f)) continue;
    if (winnerOf(f) === t.userTeam) won++;
    else lost++;
  }
  return { won, lost };
}

export const STAGE_NAMES = { pool: 'Pool stage', league: 'League season', semi: 'Semi-finals', final: 'Final', done: 'Finished' };
