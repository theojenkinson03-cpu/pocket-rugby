// Tournaments: a Nations Cup (two pools of four, then semi-finals and a
// final) and four real leagues, each with its own play-off format. Other
// fixtures are played out by the engine, CPU against CPU.

import { act, newMatch } from './engine.js';
import { cpuChoice } from './ai.js';
import { playerOfTheMatch, randomRoster } from './players.js';
import { packPlayers } from './season.js';

export const NATIONS = [
  { id: 'nzl', name: 'New Zealand', short: 'NZL', color: '#121314', alt: '#f4f4f0', flavour: 'kiwi', personality: 'run', level: 'expert', ground: 'Eden Park' },
  { id: 'rsa', name: 'South Africa', short: 'RSA', color: '#0b6e3b', alt: '#f2c230', flavour: 'southern', personality: 'pack', level: 'expert', ground: 'Ellis Park' },
  { id: 'irl', name: 'Ireland', short: 'IRL', color: '#12854a', alt: '#f4f4f0', flavour: 'irish', personality: 'balanced', level: 'expert', ground: 'Aviva Stadium' },
  { id: 'fra', name: 'France', short: 'FRA', color: '#1d3577', alt: '#f4f4f0', flavour: 'french', personality: 'run', level: 'pro', ground: 'Stade de France' },
  { id: 'eng', name: 'England', short: 'ENG', color: '#f4f4f0', alt: '#1c2b4a', flavour: 'english', personality: 'boot', level: 'pro', ground: 'Allianz Stadium, Twickenham' },
  { id: 'aus', name: 'Australia', short: 'AUS', color: '#f2c230', alt: '#1a4d2e', flavour: 'aussie', personality: 'run', level: 'pro', ground: 'Accor Stadium' },
  { id: 'sco', name: 'Scotland', short: 'SCO', color: '#20305f', alt: '#9fb7d9', flavour: 'scottish', personality: 'balanced', level: 'pro', ground: 'Murrayfield' },
  { id: 'arg', name: 'Argentina', short: 'ARG', color: '#74acdf', alt: '#1d3577', flavour: 'latin', personality: 'pack', level: 'pro', ground: 'Estadio José Amalfitani', kit: ['hoops', '#74acdf', '#f4f4f0'] },
  { id: 'wal', name: 'Wales', short: 'WAL', color: '#c8102e', alt: '#f4f4f0', flavour: 'welsh', personality: 'balanced', level: 'pro', ground: 'Principality Stadium' },
  { id: 'fij', name: 'Fiji', short: 'FIJ', color: '#e9eef2', alt: '#121314', flavour: 'pacific', personality: 'run', level: 'pro', ground: 'HFC Bank Stadium' },
  { id: 'jpn', name: 'Japan', short: 'JPN', color: '#d4001a', alt: '#f4f4f0', flavour: 'japanese', personality: 'run', level: 'pro', ground: 'Japan National Stadium', kit: ['hoops', '#d4001a', '#f4f4f0'] },
  { id: 'ita', name: 'Italy', short: 'ITA', color: '#0a5ec0', alt: '#f4f4f0', flavour: 'italian', personality: 'boot', level: 'rookie', ground: 'Stadio Olimpico' },
];

// The real leagues and their teams. Names identify the real clubs; kit
// colours are approximations; level and style are this game's own flavour.
// Line-ups: Super Rugby Pacific 2026, and the 2026-27 Prem, URC and Top 14.
//
// Play-off formats:
//   top4    semi-finals 1v4 and 2v3, then the final (the Prem)
//   top6    barrages 3v6 and 4v5; semi-finals 1 v the 4v5 winner and
//           2 v the 3v6 winner (Top 14)
//   top8    quarter-finals 1v8, 4v5, 2v7, 3v6; the first two winners meet in
//           one semi-final, the last two in the other (URC)
//   super6  qualifying finals 1v6, 2v5, 3v4; the three winners and the
//           best-placed loser go through, the loser as fourth seed (Super Rugby)
//
// Each side has a home ground and may have a patterned kit: [pattern,
// ...colours], the first colour its main one (see color.js).
const team = (id, name, short, color, alt, flavour, personality, level, extra = {}) => ({ id, name, short, color, alt, flavour, personality, level, ...extra });

export const LEAGUES = {
  super: {
    name: 'Super Rugby Pacific',
    short: 'Super Rugby',
    season: '2026 season',
    playoff: 'super6',
    rounds: { qf: ['Qualifying final', 'Qualifying finals'], final: ['Grand final', 'Grand final'] },
    teams: [
      team('blues', 'Blues', 'BLU', '#1f4e9d', '#f4f4f0', 'kiwi', 'run', 'expert', { ground: 'Eden Park' }),
      team('chiefs', 'Chiefs', 'CHI', '#1b1b1d', '#f2c230', 'kiwi', 'run', 'expert', { ground: 'FMG Stadium Waikato', kit: ['band', '#1b1b1d', '#f2c230', '#c8102e'] }),
      team('crusaders', 'Crusaders', 'CRU', '#c8102e', '#18191b', 'kiwi', 'balanced', 'expert', { ground: 'One New Zealand Stadium' }),
      team('highlanders', 'Highlanders', 'HIG', '#1c2f6b', '#e3b31d', 'kiwi', 'balanced', 'pro', { ground: 'Forsyth Barr Stadium' }),
      team('hurricanes', 'Hurricanes', 'HUR', '#f2c230', '#18191b', 'kiwi', 'run', 'expert', { ground: 'Sky Stadium' }),
      team('brumbies', 'Brumbies', 'BRU', '#0b2a5b', '#e3b31d', 'aussie', 'pack', 'pro', { ground: 'GIO Stadium' }),
      team('reds', 'Queensland Reds', 'RED', '#a6192e', '#f4f4f0', 'aussie', 'balanced', 'pro', { ground: 'Suncorp Stadium' }),
      team('waratahs', 'NSW Waratahs', 'WAR', '#4aa2df', '#1d3577', 'aussie', 'run', 'pro', { ground: 'Allianz Stadium, Sydney' }),
      team('force', 'Western Force', 'FOR', '#0f4c9c', '#e3b31d', 'aussie', 'pack', 'rookie', { ground: 'HBF Park' }),
      team('drua', 'Fijian Drua', 'DRU', '#f4f4f0', '#1d4f91', 'pacific', 'run', 'pro', { ground: 'HFC Bank Stadium' }),
      team('moana', 'Moana Pasifika', 'MOA', '#00a19a', '#4b2b78', 'pacific', 'run', 'rookie', { ground: 'North Harbour Stadium' }),
    ],
  },
  prem: {
    name: 'Prem Rugby',
    short: 'Prem',
    season: '2026–27 season',
    playoff: 'top4',
    rounds: {},
    teams: [
      team('bath', 'Bath', 'BAT', '#00508f', '#18191b', 'english', 'balanced', 'expert', { ground: 'The Recreation Ground', kit: ['hoops', '#00508f', '#18191b', '#f4f4f0'] }),
      team('bristol', 'Bristol Bears', 'BRI', '#13284b', '#c8102e', 'english', 'run', 'expert', { ground: 'Ashton Gate' }),
      team('exeter', 'Exeter Chiefs', 'EXE', '#18191b', '#f4f4f0', 'english', 'pack', 'pro', { ground: 'Sandy Park' }),
      team('gloucester', 'Gloucester', 'GLO', '#c8102e', '#f4f4f0', 'english', 'pack', 'pro', { ground: 'Kingsholm', kit: ['hoops', '#c8102e', '#f4f4f0'] }),
      team('harlequins', 'Harlequins', 'HAR', '#c4166b', '#6ec1e4', 'english', 'run', 'pro', { ground: 'Twickenham Stoop', kit: ['quarters', '#c4166b', '#6ec1e4', '#5a3a22', '#9aa3ad'] }),
      team('leicester', 'Leicester Tigers', 'LEI', '#0f6b3a', '#c8102e', 'english', 'pack', 'expert', { ground: 'Mattioli Woods Welford Road', kit: ['hoops', '#0f6b3a', '#c8102e', '#f4f4f0'] }),
      team('newcastle', 'Newcastle Red Bulls', 'NEW', '#d6001c', '#1d2c5e', 'english', 'balanced', 'rookie', { ground: 'Kingston Park' }),
      team('northampton', 'Northampton Saints', 'NOR', '#18191b', '#0f7a44', 'english', 'run', 'expert', { ground: 'cinch Stadium at Franklin’s Gardens', kit: ['hoops', '#18191b', '#0f7a44', '#c9a227'] }),
      team('sale', 'Sale Sharks', 'SAL', '#1c4f9c', '#f4f4f0', 'english', 'boot', 'pro', { ground: 'Salford Community Stadium' }),
      team('saracens', 'Saracens', 'SAR', '#18191b', '#c8102e', 'english', 'boot', 'pro', { ground: 'StoneX Stadium' }),
    ],
  },
  urc: {
    name: 'United Rugby Championship',
    short: 'URC',
    season: '2026–27 season',
    playoff: 'top8',
    rounds: { final: ['Grand Final', 'Grand Final'] },
    teams: [
      team('leinster', 'Leinster', 'LNS', '#0a3d91', '#f4f4f0', 'irish', 'run', 'expert', { ground: 'Aviva Stadium' }),
      team('munster', 'Munster', 'MUN', '#c8102e', '#18191b', 'irish', 'pack', 'pro', { ground: 'Thomond Park' }),
      team('ulster', 'Ulster', 'ULS', '#f4f4f0', '#c8102e', 'irish', 'balanced', 'pro', { ground: 'Affidea Stadium' }),
      team('connacht', 'Connacht', 'CON', '#0f7a44', '#18191b', 'irish', 'run', 'pro', { ground: 'Dexcom Stadium' }),
      team('cardiff', 'Cardiff', 'CAR', '#6ca9d8', '#18191b', 'welsh', 'balanced', 'pro', { ground: 'Cardiff Arms Park', kit: ['hoops', '#6ca9d8', '#18191b'] }),
      team('dragons', 'Dragons', 'DRA', '#c8102e', '#18191b', 'welsh', 'pack', 'rookie', { ground: 'Rodney Parade' }),
      team('ospreys', 'Ospreys', 'OSP', '#18191b', '#f4f4f0', 'welsh', 'balanced', 'pro', { ground: 'St Helen’s' }),
      team('scarlets', 'Scarlets', 'SCA', '#b3102e', '#f4f4f0', 'welsh', 'run', 'pro', { ground: 'Parc y Scarlets' }),
      team('glasgow', 'Glasgow Warriors', 'GLA', '#1b2a57', '#c8102e', 'scottish', 'run', 'expert', { ground: 'Scotstoun Stadium', kit: ['tartan', '#1b2a57', '#18191b', '#6ca9d8'] }),
      team('edinburgh', 'Edinburgh', 'EDI', '#18191b', '#c8102e', 'scottish', 'pack', 'pro', { ground: 'Hive Stadium' }),
      team('benetton', 'Benetton', 'BEN', '#0f7a44', '#f4f4f0', 'italian', 'pack', 'pro', { ground: 'Stadio Monigo' }),
      team('zebre', 'Zebre Parma', 'ZEB', '#18191b', '#f4f4f0', 'italian', 'balanced', 'rookie', { ground: 'Stadio Sergio Lanfranchi', kit: ['stripes', '#18191b', '#f4f4f0'] }),
      team('bulls', 'Bulls', 'BUL', '#1d5fae', '#f4f4f0', 'southern', 'pack', 'expert', { ground: 'Loftus Versfeld' }),
      team('lions', 'Lions', 'LIO', '#c8102e', '#f4f4f0', 'southern', 'run', 'pro', { ground: 'Ellis Park' }),
      team('sharks', 'Sharks', 'SHA', '#18191b', '#f4f4f0', 'southern', 'pack', 'pro', { ground: 'Hollywoodbets Kings Park' }),
      team('stormers', 'Stormers', 'STO', '#0e4c92', '#f4f4f0', 'southern', 'balanced', 'expert', { ground: 'DHL Stadium' }),
    ],
  },
  top14: {
    name: 'Top 14',
    short: 'Top 14',
    season: '2026–27 season',
    playoff: 'top6',
    rounds: { qf: ['Barrage', 'Barrages'] },
    teams: [
      team('toulouse', 'Toulouse', 'TOU', '#c8102e', '#18191b', 'french', 'run', 'expert', { ground: 'Stade Ernest-Wallon' }),
      team('bordeaux', 'Bordeaux Bègles', 'UBB', '#7b1e3c', '#4aa2df', 'french', 'run', 'expert', { ground: 'Stade Chaban-Delmas' }),
      team('toulon', 'Toulon', 'RCT', '#c00020', '#18191b', 'french', 'pack', 'expert', { ground: 'Stade Mayol' }),
      team('larochelle', 'La Rochelle', 'LAR', '#f2c230', '#18191b', 'french', 'pack', 'pro', { ground: 'Stade Marcel-Deflandre' }),
      team('clermont', 'Clermont', 'ASM', '#f2c230', '#1d3577', 'french', 'balanced', 'pro', { ground: 'Stade Marcel-Michelin' }),
      team('racing', 'Racing 92', 'R92', '#4aa2df', '#f4f4f0', 'french', 'run', 'pro', { ground: 'Paris La Défense Arena', kit: ['hoops', '#4aa2df', '#f4f4f0'] }),
      team('stadefrancais', 'Stade Français', 'SFP', '#e83e8c', '#1d3577', 'french', 'balanced', 'pro', { ground: 'Stade Jean-Bouin' }),
      team('castres', 'Castres', 'CAS', '#1d3577', '#f4f4f0', 'french', 'pack', 'pro', { ground: 'Stade Pierre-Fabre' }),
      team('montpellier', 'Montpellier', 'MHR', '#1c2b4a', '#e8701c', 'french', 'pack', 'pro', { ground: 'GGL Stadium' }),
      team('pau', 'Pau', 'PAU', '#0f7a44', '#f4f4f0', 'french', 'balanced', 'pro', { ground: 'Stade du Hameau' }),
      team('bayonne', 'Bayonne', 'BAY', '#5bb3e6', '#f4f4f0', 'french', 'pack', 'pro', { ground: 'Stade Jean-Dauger' }),
      team('lyon', 'Lyon', 'LYO', '#c8102e', '#18191b', 'french', 'run', 'pro', { ground: 'Matmut Stadium de Gerland' }),
      team('perpignan', 'Perpignan', 'PER', '#c8102e', '#f2c230', 'french', 'pack', 'rookie', { ground: 'Stade Aimé-Giral', kit: ['stripes', '#c8102e', '#f2c230'] }),
      team('vannes', 'Vannes', 'VAN', '#1d3577', '#f4f4f0', 'french', 'balanced', 'rookie', { ground: 'Stade de la Rabine' }),
    ],
  },
};

// Neutral grounds for the big days: the Prem final at Twickenham, the Top 14
// semi-finals in Bordeaux and the final at the Stade de France (2026-27).
// Everywhere else the home side, or the better seed, plays at home.
export const NEUTRAL_GROUNDS = {
  prem: { final: 'Allianz Stadium, Twickenham' },
  top14: { semi: 'Stade Atlantique, Bordeaux', final: 'Stade de France' },
};

// The 2026-27 Champions Cup: 24 clubs from the Prem, the URC and the Top 14
// in four pools of six, two from each league. A club plays the four in its
// pool from the other leagues, two at home and two away. The top three in
// each pool go through to the round of 16 with the four best-placed of the
// rest; the final is at OL Stadium, Lyon.
export const CHAMPIONS_CUP = {
  name: 'Champions Cup',
  short: 'Champions Cup',
  season: '2026–27 season',
  pools: {
    1: ['leinster', 'glasgow', 'pau', 'sale', 'leicester', 'clermont'],
    2: ['toulouse', 'lions', 'saracens', 'larochelle', 'exeter', 'connacht'],
    3: ['bordeaux', 'stormers', 'racing', 'munster', 'bristol', 'gloucester'],
    4: ['northampton', 'bath', 'cardiff', 'montpellier', 'stadefrancais', 'bulls'],
  },
  neutral: { final: 'OL Stadium, Lyon' },
  poolRounds: 4,
  through: 3,
  bestOthers: 4,
};

// How many teams each play-off format takes.
export const QUALIFY = { top4: 4, top6: 6, top8: 8, super6: 6 };
export const SHORT_SEASON = 6;

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
  // One of the eight hosts the semi-finals and the final.
  const host = field[Math.floor(rng() * field.length)].id;
  return { kind: 'cup', name: 'Nations Cup', short: 'Nations Cup', length, cards, userTeam, host, teams: makeTeams(field, rng), pools, fixtures, stage: 'pool', champion: null, byes: [] };
}

// season: 'full' (everyone plays everyone once) or 'short' (the first
// SHORT_SEASON rounds of that schedule). With an odd number of teams, one
// side has a bye each round.
export function createLeague({ league = 'prem', userTeam, length = 'quick', cards = true, season = 'short', rng = Math.random }) {
  const L = LEAGUES[league];
  const field = L.teams.map(c => c.id);
  const schedule = roundRobin(shuffle(field, rng));
  const rounds = season === 'full' ? schedule : schedule.slice(0, SHORT_SEASON);
  const fixtures = [];
  rounds.forEach((pairs, round) => pairs.forEach(([home, away]) => {
    fixtures.push(fixture(`L${round}${home}`, 'league', round, home, away, 'L'));
  }));
  return {
    kind: 'league',
    league,
    name: L.name,
    short: L.short,
    playoff: L.playoff,
    season,
    rounds: rounds.length,
    length,
    cards,
    userTeam,
    teams: makeTeams(L.teams, rng),
    pools: { L: field },
    fixtures,
    stage: 'league',
    champion: null,
    byes: [],
  };
}

// A pool's four rounds: three matches a round, nobody meeting a club from
// their own league, everyone at home twice. `ids` lists the pool's clubs.
export function championsPoolRounds(ids, rng = Math.random) {
  const byLeague = {};
  for (const id of ids) (byLeague[LEAGUE_OF[id]] ||= []).push(id);
  const [[a1, a2], [b1, b2], [c1, c2]] = shuffle(Object.values(byLeague), rng).map(pair => shuffle(pair, rng));
  // The six-club pool, two from each league, is the octahedron: these four
  // rounds cover its twelve cross-league pairs once each.
  const rounds = shuffle([
    [[a1, b1], [a2, c1], [b2, c2]],
    [[a1, b2], [a2, c2], [b1, c1]],
    [[a1, c1], [a2, b2], [b1, c2]],
    [[a1, c2], [a2, b1], [b2, c1]],
  ], rng);
  // Home and away: the first way round, from a random start, that gives
  // every club two of each.
  const pairs = rounds.flat();
  const start = Math.floor(rng() * 4096);
  for (let n = 0; n < 4096; n++) {
    const mask = (start + n) % 4096;
    const homes = new Map();
    pairs.forEach(([x, y], i) => {
      const home = mask & (1 << i) ? y : x;
      homes.set(home, (homes.get(home) || 0) + 1);
    });
    if (ids.every(id => homes.get(id) === 2)) {
      let i = 0;
      return rounds.map(round => round.map(([x, y]) => (mask & (1 << i++) ? [y, x] : [x, y])));
    }
  }
  throw new Error('no fair home and away');
}

export function createChampions({ userTeam, length = 'quick', cards = true, rng = Math.random }) {
  const C = CHAMPIONS_CUP;
  const pools = Object.fromEntries(Object.entries(C.pools).map(([group, ids]) => [group, [...ids]]));
  const fixtures = [];
  for (const [group, ids] of Object.entries(pools)) {
    championsPoolRounds(ids, rng).forEach((pairs, round) => pairs.forEach(([home, away]) => {
      fixtures.push(fixture(`P${group}${round}${home}`, 'pool', round, home, away, group));
    }));
  }
  const field = Object.values(pools).flat().map(id => ({ ...TEAM_BY_ID[id], league: LEAGUE_OF[id] }));
  return {
    kind: 'champions',
    name: C.name,
    short: C.short,
    length,
    cards,
    userTeam,
    teams: makeTeams(field, rng),
    pools,
    poolRounds: C.poolRounds,
    neutral: { ...C.neutral },
    fixtures,
    stage: 'pool',
    champion: null,
    byes: [],
  };
}

// The 16 for the round of 16, seeded: pool winners 1-4, runners-up 5-8,
// thirds 9-12, each in table order, then the four best of the rest.
export function championsSeeding(t) {
  const C = CHAMPIONS_CUP;
  const tables = Object.keys(t.pools).map(group => standings(t, group));
  const order = rows => [...rows].sort((a, b) => b.points - a.points || (b.for - b.against) - (a.for - a.against) || b.triesFor - a.triesFor || a.id.localeCompare(b.id));
  const seeds = [];
  for (let place = 0; place < C.through; place++) seeds.push(...order(tables.map(rows => rows[place])).map(r => r.id));
  seeds.push(...order(tables.flatMap(rows => rows.slice(C.through))).slice(0, C.bestOthers).map(r => r.id));
  return seeds;
}

export const teamOf = (t, id) => t.teams.find(team => team.id === id);

// Every nation and club as listed above, by id, and each club's league.
export const TEAM_BY_ID = Object.fromEntries([...NATIONS, ...Object.values(LEAGUES).flatMap(l => l.teams)].map(x => [x.id, x]));
export const LEAGUE_OF = Object.fromEntries(Object.entries(LEAGUES).flatMap(([league, L]) => L.teams.map(x => [x.id, league])));

// Brings a tournament saved by an older version up to date: grounds and
// kits for its sides.
export function migrateTournament(t) {
  if (!t) return t;
  for (const side of t.teams) {
    const known = TEAM_BY_ID[side.id];
    if (!known) continue;
    side.ground ??= known.ground;
    if (known.kit) side.kit ??= known.kit;
  }
  t.byes ??= [];
  return t;
}

// Where a fixture is played: {name, neutral}. The Nations Cup's knockouts go
// to the host nation's ground, which is neutral unless the hosts are playing.
export function venue(t, f) {
  const home = teamOf(t, f.home);
  const fixed = NEUTRAL_GROUNDS[t.league]?.[f.stage] || t.neutral?.[f.stage];
  const hosted = t.host && f.stage !== 'pool' ? teamOf(t, t.host) : null;
  const name = fixed || hosted?.ground || home?.ground || null;
  if (!name) return null;
  return { name, neutral: name !== home?.ground && name !== teamOf(t, f.away)?.ground };
}

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

// A side's kit for a match against a side in `other` (a colour): first
// choice, then the change strip, then plain white, black or orange,
// whichever tells apart. Only the first choice carries the club's pattern.
const NEUTRALS = ['#f4f4f0', '#18191b', '#e8701c'];
function stripAgainst(team, other) {
  if (!clash(team.color, other)) return { color: team.color, kit: team.kit || null };
  return { color: [team.alt, ...NEUTRALS].find(c => c && !clash(c, other)) || team.color, kit: null };
}

const dressed = (team, strip) => ({ name: team.name, ...strip, roster: team.roster });

// Kits for a fixture, home first. The away side changes strip on a clash.
export function kits(t, f) {
  const home = teamOf(t, f.home);
  const away = teamOf(t, f.away);
  return [dressed(home, { color: home.color, kit: home.kit || null }), dressed(away, stripAgainst(away, home.color))];
}

// The user's match, with the user always as team 0 in their first-choice
// kit; the CPU side changes strip if need be.
export function matchOptions(t, f) {
  const userHome = f.home === t.userTeam;
  const me = teamOf(t, t.userTeam);
  const opponent = teamOf(t, userHome ? f.away : f.home);
  const mine = dressed(me, { color: me.color, kit: me.kit || null });
  const theirs = dressed(opponent, stripAgainst(opponent, me.color));
  return { mode: '1p', teams: [mine, theirs], length: t.length, cards: t.cards, cpuLevel: opponent.level, cpuPersonality: opponent.personality, venue: venue(t, f) };
}

// A finished match as a fixture result, home side first: the score, tries,
// each player's numbers (for the season stats) and the Player of the Match.
export function resultFromMatch(f, match, userIsHome) {
  const [mine, theirs] = match.teams;
  const home = userIsHome ? mine : theirs;
  const away = userIsHome ? theirs : mine;
  const potm = playerOfTheMatch(match);
  return {
    score: [home.score, away.score],
    tries: [home.stats.tries, away.stats.tries],
    winner: (match.winner === 0) === userIsHome ? 'home' : 'away',
    players: [packPlayers(home.players), packPlayers(away.players)],
    potm: potm ? { side: (potm.team === 0) === userIsHome ? 0 : 1, pos: potm.pos } : null,
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
  return resultFromMatch(f, m, true);
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
const loserOf = f => (f.result.winner === 'home' ? f.away : f.home);
const byId = (t, id) => t.fixtures.find(f => f.id === id);

// A knockout tie with the better seed at home. `seeds` maps team -> seed (1 is best).
function tie(t, id, stage, a, b) {
  const [home, away] = t.seeds[a] <= t.seeds[b] ? [a, b] : [b, a];
  return fixture(id, stage, 0, home, away);
}

// From the final league table to the first knockout round.
function startPlayoffs(t) {
  const table = standings(t, 'L').map(r => r.id);
  t.seeds = Object.fromEntries(table.map((id, i) => [id, i + 1]));
  const at = n => table[n - 1];
  const format = t.playoff || 'top4';
  if (format === 'top4') {
    t.fixtures.push(tie(t, 'SF1', 'semi', at(1), at(4)), tie(t, 'SF2', 'semi', at(2), at(3)));
    t.stage = 'semi';
  } else if (format === 'top8') {
    t.fixtures.push(tie(t, 'QF1', 'qf', at(1), at(8)), tie(t, 'QF2', 'qf', at(4), at(5)), tie(t, 'QF3', 'qf', at(2), at(7)), tie(t, 'QF4', 'qf', at(3), at(6)));
    t.stage = 'qf';
  } else if (format === 'top6') {
    t.fixtures.push(tie(t, 'QF1', 'qf', at(3), at(6)), tie(t, 'QF2', 'qf', at(4), at(5)));
    t.byes = [at(1), at(2)];
    t.stage = 'qf';
  } else if (format === 'super6') {
    t.fixtures.push(tie(t, 'QF1', 'qf', at(1), at(6)), tie(t, 'QF2', 'qf', at(2), at(5)), tie(t, 'QF3', 'qf', at(3), at(4)));
    t.stage = 'qf';
  }
}

// From the quarter-finals (or barrages, or qualifying finals) to the semis.
function startSemis(t) {
  const format = t.playoff;
  if (format === 'top8') {
    const w = ['QF1', 'QF2', 'QF3', 'QF4'].map(id => winnerOf(byId(t, id)));
    t.fixtures.push(tie(t, 'SF1', 'semi', w[0], w[1]), tie(t, 'SF2', 'semi', w[2], w[3]));
  } else if (format === 'top6') {
    const [first, second] = t.byes;
    t.fixtures.push(tie(t, 'SF1', 'semi', first, winnerOf(byId(t, 'QF2'))), tie(t, 'SF2', 'semi', second, winnerOf(byId(t, 'QF1'))));
    t.byes = [];
  } else if (format === 'super6') {
    // The three winners, best placed first, then the best-placed loser as fourth seed.
    const qfs = ['QF1', 'QF2', 'QF3'].map(id => byId(t, id));
    const winners = qfs.map(winnerOf).sort((a, b) => t.seeds[a] - t.seeds[b]);
    const lucky = qfs.map(loserOf).sort((a, b) => t.seeds[a] - t.seeds[b])[0];
    const order = [...winners, lucky];
    t.seeds = { ...t.seeds, ...Object.fromEntries(order.map((id, i) => [id, i + 1])) };
    t.fixtures.push(tie(t, 'SF1', 'semi', order[0], order[3]), tie(t, 'SF2', 'semi', order[1], order[2]));
  }
  t.stage = 'semi';
}

// Moves to the next stage once every fixture in this one is played.
export function advance(t) {
  if (currentRound(t) !== null || t.stage === 'done') return t;
  if (t.stage === 'pool' && t.kind === 'champions') {
    const seeds = championsSeeding(t);
    t.seeds = Object.fromEntries(seeds.map((id, i) => [id, i + 1]));
    // 1 v 16, 2 v 15 ... 8 v 9, the better seed at home.
    for (let i = 0; i < 8; i++) t.fixtures.push(tie(t, `R${i + 1}`, 'r16', seeds[i], seeds[15 - i]));
    t.stage = 'r16';
  } else if (t.stage === 'r16') {
    // A fixed bracket: the 1/16 winner meets the 8/9 winner, and so on;
    // from the quarter-finals on it runs like the URC's.
    const w = n => winnerOf(byId(t, `R${n}`));
    t.fixtures.push(tie(t, 'QF1', 'qf', w(1), w(8)), tie(t, 'QF2', 'qf', w(4), w(5)), tie(t, 'QF3', 'qf', w(2), w(7)), tie(t, 'QF4', 'qf', w(3), w(6)));
    t.playoff = 'top8';
    t.stage = 'qf';
  } else if (t.stage === 'pool') {
    const [a, b] = [standings(t, 'A'), standings(t, 'B')];
    t.fixtures.push(fixture('SF1', 'semi', 0, a[0].id, b[1].id), fixture('SF2', 'semi', 0, b[0].id, a[1].id));
    t.stage = 'semi';
  } else if (t.stage === 'league') {
    startPlayoffs(t);
  } else if (t.stage === 'qf') {
    startSemis(t);
  } else if (t.stage === 'semi') {
    const [w1, w2] = ['SF1', 'SF2'].map(id => winnerOf(byId(t, id)));
    // League finals go to the better seed; the cup's to the first semi's winner.
    t.fixtures.push(t.seeds ? tie(t, 'F', 'final', w1, w2) : fixture('F', 'final', 0, w1, w2));
    t.stage = 'final';
  } else if (t.stage === 'final') {
    t.champion = winnerOf(byId(t, 'F'));
    t.stage = 'done';
  }
  return t;
}

// Whether the user is still in it: always in the group stage, and in the
// knockouts while they have a fixture in the current round or a bye past it.
export function userAlive(t) {
  if (t.stage === 'pool' || t.stage === 'league') return true;
  if (t.stage === 'done') return t.champion === t.userTeam;
  return (t.byes || []).includes(t.userTeam) || t.fixtures.some(f => f.stage === t.stage && isUserFixture(t, f));
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

export const STAGE_NAMES = { pool: 'Pool stage', league: 'Regular season', r16: 'Round of 16', qf: 'Quarter-finals', semi: 'Semi-finals', final: 'Final', done: 'Finished' };

// A knockout round's name in this competition: one tie, or the round.
// Barrages in the Top 14, qualifying finals in Super Rugby, and so on.
const ROUND_NAMES = { r16: ['Round of 16', 'Round of 16'], qf: ['Quarter-final', 'Quarter-finals'], semi: ['Semi-final', 'Semi-finals'], final: ['Final', 'Final'] };
export function roundName(t, stage, many = false) {
  const names = LEAGUES[t.league]?.rounds?.[stage] || ROUND_NAMES[stage];
  return names ? names[many ? 1 : 0] : STAGE_NAMES[stage];
}

export function stageName(t, stage = t.stage) {
  return ROUND_NAMES[stage] ? roundName(t, stage, true) : STAGE_NAMES[stage];
}
