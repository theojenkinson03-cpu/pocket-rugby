// Tournaments: the 2027 World Cup (six pools, then a round of 16 and on to
// the final), the Champions Cup and four real leagues, each with its own
// play-off format. Other fixtures are played out by the engine, CPU against
// CPU, with the stronger side given the edge.

import { act, lineup, newMatch, rollWeather } from './engine.js';
import { cpuChoice } from './ai.js';
import { CARD_IDS } from './cards.js';
import { playerOfTheMatch } from './players.js';
import { packLineup } from './season.js';
import { realSquad } from './squads.js';
import { POSITIONS } from './dice.js';

// The 24 nations at the 2027 World Cup. rating: how strong a side is, 1 to
// 5, which gives the stronger side the edge in matches the CPU plays out
// (see classCards). Level and style are this game's own flavour.
export const NATIONS = [
  { id: 'nzl', name: 'New Zealand', short: 'NZL', color: '#121314', alt: '#f4f4f0', flavour: 'kiwi', personality: 'run', level: 'expert', rating: 5, ground: 'Eden Park' },
  { id: 'rsa', name: 'South Africa', short: 'RSA', color: '#0b6e3b', alt: '#f2c230', flavour: 'southern', personality: 'pack', level: 'expert', rating: 5, ground: 'Ellis Park' },
  { id: 'irl', name: 'Ireland', short: 'IRL', color: '#12854a', alt: '#f4f4f0', flavour: 'irish', personality: 'balanced', level: 'expert', rating: 5, ground: 'Aviva Stadium' },
  { id: 'fra', name: 'France', short: 'FRA', color: '#1d3577', alt: '#f4f4f0', flavour: 'french', personality: 'run', level: 'expert', rating: 5, ground: 'Stade de France' },
  { id: 'eng', name: 'England', short: 'ENG', color: '#f4f4f0', alt: '#1c2b4a', flavour: 'english', personality: 'boot', level: 'expert', rating: 5, ground: 'Allianz Stadium, Twickenham' },
  { id: 'aus', name: 'Australia', short: 'AUS', color: '#f2c230', alt: '#1a4d2e', flavour: 'aussie', personality: 'run', level: 'pro', rating: 4, ground: 'Stadium Australia' },
  { id: 'sco', name: 'Scotland', short: 'SCO', color: '#20305f', alt: '#9fb7d9', flavour: 'scottish', personality: 'balanced', level: 'pro', rating: 4, ground: 'Murrayfield' },
  { id: 'arg', name: 'Argentina', short: 'ARG', color: '#74acdf', alt: '#1d3577', flavour: 'latin', personality: 'pack', level: 'pro', rating: 4, ground: 'Estadio José Amalfitani', kit: ['hoops', '#74acdf', '#f4f4f0'] },
  { id: 'fij', name: 'Fiji', short: 'FIJ', color: '#e9eef2', alt: '#121314', flavour: 'pacific', personality: 'run', level: 'pro', rating: 3, ground: 'HFC Bank Stadium' },
  { id: 'ita', name: 'Italy', short: 'ITA', color: '#0a5ec0', alt: '#f4f4f0', flavour: 'italian', personality: 'boot', level: 'pro', rating: 3, ground: 'Stadio Olimpico' },
  { id: 'wal', name: 'Wales', short: 'WAL', color: '#c8102e', alt: '#f4f4f0', flavour: 'welsh', personality: 'balanced', level: 'pro', rating: 3, ground: 'Principality Stadium' },
  { id: 'jpn', name: 'Japan', short: 'JPN', color: '#d4001a', alt: '#f4f4f0', flavour: 'japanese', personality: 'run', level: 'pro', rating: 3, ground: 'Japan National Stadium', kit: ['hoops', '#d4001a', '#f4f4f0'] },
  { id: 'geo', name: 'Georgia', short: 'GEO', color: '#b01e2f', alt: '#f4f4f0', flavour: 'any', personality: 'pack', level: 'pro', rating: 3, ground: 'Boris Paichadze Dinamo Arena' },
  { id: 'sam', name: 'Samoa', short: 'SAM', color: '#1d4f91', alt: '#f4f4f0', flavour: 'pacific', personality: 'run', level: 'pro', rating: 2, ground: 'Apia Park' },
  { id: 'ton', name: 'Tonga', short: 'TGA', color: '#c8102e', alt: '#f4f4f0', flavour: 'pacific', personality: 'run', level: 'rookie', rating: 2, ground: 'Teufaiva Sport Stadium' },
  { id: 'uru', name: 'Uruguay', short: 'URU', color: '#7fb8e8', alt: '#1c2b4a', flavour: 'latin', personality: 'pack', level: 'rookie', rating: 2, ground: 'Estadio Charrúa' },
  { id: 'por', name: 'Portugal', short: 'POR', color: '#b5121b', alt: '#0f7a44', flavour: 'latin', personality: 'run', level: 'rookie', rating: 2, ground: 'Estádio Nacional, Jamor' },
  { id: 'esp', name: 'Spain', short: 'ESP', color: '#d0103a', alt: '#f2c230', flavour: 'latin', personality: 'balanced', level: 'rookie', rating: 2, ground: 'Estadio Central, Madrid' },
  { id: 'usa', name: 'USA', short: 'USA', color: '#1c2b4a', alt: '#f4f4f0', flavour: 'any', personality: 'balanced', level: 'rookie', rating: 2, ground: 'Dignity Health Sports Park', kit: ['band', '#1c2b4a', '#f4f4f0', '#c8102e'] },
  { id: 'can', name: 'Canada', short: 'CAN', color: '#d52b1e', alt: '#18191b', flavour: 'any', personality: 'pack', level: 'rookie', rating: 2, ground: 'Starlight Stadium' },
  { id: 'rou', name: 'Romania', short: 'ROU', color: '#f2c230', alt: '#1d3577', flavour: 'any', personality: 'pack', level: 'rookie', rating: 2, ground: 'Arcul de Triumf Stadium' },
  { id: 'chi', name: 'Chile', short: 'CHL', color: '#d52b1e', alt: '#1d3577', flavour: 'latin', personality: 'run', level: 'rookie', rating: 1, ground: 'Estadio Santa Laura' },
  { id: 'hkg', name: 'Hong Kong China', short: 'HKG', color: '#e8eef2', alt: '#c8102e', flavour: 'any', personality: 'balanced', level: 'rookie', rating: 1, ground: 'Kai Tak Stadium', kit: ['band', '#e8eef2', '#c8102e'] },
  { id: 'zim', name: 'Zimbabwe', short: 'ZIM', color: '#0f7a44', alt: '#f4f4f0', flavour: 'southern', personality: 'pack', level: 'rookie', rating: 1, ground: 'Hartsfield Rugby Ground', kit: ['hoops', '#0f7a44', '#f4f4f0'] },
];

// The 2027 World Cup in Australia: the real draw, six pools of four. The top
// two in each pool and the four best third-placed sides go through to the
// round of 16, then a fixed bracket to the final at Stadium Australia.
export const WORLD_CUP = {
  name: 'World Cup 2027',
  short: 'World Cup',
  pools: {
    A: ['nzl', 'aus', 'chi', 'hkg'],
    B: ['rsa', 'ita', 'geo', 'rou'],
    C: ['arg', 'fij', 'esp', 'can'],
    D: ['irl', 'sco', 'uru', 'por'],
    E: ['fra', 'jpn', 'usa', 'sam'],
    F: ['eng', 'wal', 'ton', 'zim'],
  },
  // The eight grounds, in the seven host cities.
  venues: ['Perth Stadium', 'Brisbane Stadium', 'Stadium Australia, Sydney', 'Sydney Football Stadium', 'Docklands Stadium, Melbourne', 'Adelaide Oval', 'Newcastle Stadium', 'North Queensland Stadium, Townsville'],
  // The round of 16: [home slot, away slot, ground]. Slots: '1A' pool A
  // winners, '2B' runners-up, '3:CEF' a best third from pool C, E or F.
  r16: [
    ['2C', '2F', 'Sydney Football Stadium'],
    ['1A', '3:CEF', 'Brisbane Stadium'],
    ['1E', '2D', 'Docklands Stadium, Melbourne'],
    ['1B', '3:DEF', 'Perth Stadium'],
    ['1C', '3:AEF', 'Sydney Football Stadium'],
    ['1D', '3:BEF', 'Docklands Stadium, Melbourne'],
    ['2A', '2E', 'Brisbane Stadium'],
    ['1F', '2B', 'Perth Stadium'],
  ],
  // Quarter-finals from the round of 16's matches (1-8), then the semis.
  qf: [[2, 4, 'Stadium Australia, Sydney'], [1, 3, 'Brisbane Stadium'], [5, 6, 'Brisbane Stadium'], [7, 8, 'Stadium Australia, Sydney']],
  semi: [[1, 2, 'Stadium Australia, Sydney'], [3, 4, 'Stadium Australia, Sydney']],
  final: 'Stadium Australia, Sydney',
  host: 'aus',
};

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

// Table points: 4 for a win, 2 for a draw, and a bonus point for winning by
// 10 or more or losing by 5 or fewer. (Not rugby's usual four-try bonus:
// here the bonus is for the margin, so it means the same in every format.)
export const POINTS = { win: 4, draw: 2, bigWinBonus: 1, bigWinBy: 10, losingBonus: 1, losingBonusWithin: 5 };

// The bonus point a result earns a side: {kind: 'big'|'close'} or null.
export function bonusFor(mine, theirs) {
  const margin = mine - theirs;
  if (margin >= POINTS.bigWinBy) return 'big';
  if (margin < 0 && -margin <= POINTS.losingBonusWithin) return 'close';
  return null;
}

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

// Every side with its squad of fifteen (see squads.js) and its first-choice five.
function makeTeams(roster) {
  return roster.map(team => {
    const squad = realSquad(team.id, team.flavour);
    return { ...team, squad, roster: firstFive(squad) };
  });
}
const firstFive = squad => Object.fromEntries(POSITIONS.map(p => [p, squad.find(x => x.pos === p)?.name ?? null]));

// A squad with `roster` first at each position: a name already in the squad
// moves up, a new one takes the first player's place.
export function ledBy(squad, roster) {
  const led = squad.map(x => ({ ...x }));
  for (const pos of POSITIONS) {
    const name = roster?.[pos];
    const first = led.findIndex(x => x.pos === pos);
    const at = led.findIndex(x => x.name === name && x.pos === pos);
    if (!name || first < 0 || at === first) continue;
    if (at < 0) led[first] = { name, pos };
    else [led[first], led[at]] = [led[at], led[first]];
  }
  return led;
}

// ---- Squads, the team sheet and injuries -------------------------------------
//
// A match day picks five to start, one for each die, and three replacements
// of any position. Anyone hurt in a side's last match misses this one.

// Who is out injured for a side's next match: those hurt in its last one.
export function unavailable(t, id) {
  const fixtures = t.fixtures || [];
  for (let i = fixtures.length - 1; i >= 0; i--) {
    const f = fixtures[i];
    if (!f.result || (f.home !== id && f.away !== id)) continue;
    return f.result.injured?.[f.home === id ? 0 : 1] || [];
  }
  return [];
}

// The replacements a side picks by itself: a Forward, a Centre and an
// Outside Back (the players who carry, and get hurt, most), then anyone.
const BENCH_ORDER = ['F', 'C', 'W', 'B', 'S'];

// A side for a match: {roster, bench, offPos}. `pick` is a team sheet,
// {start: {pos: name}, bench: [name]}, kept where those players are fit;
// the rest is the first fit player at each position, and the bench as above.
// With nobody fit at a position, the first fit player plays out of position.
export function selectSide(team, out = [], pick = null) {
  const squad = team.squad?.length ? team.squad : POSITIONS.map(pos => ({ name: team.roster?.[pos] ?? null, pos }));
  const fit = squad.filter(p => !out.includes(p.name));
  const used = new Set();
  const roster = {};
  const offPos = {};
  for (const pos of POSITIONS) {
    const free = p => !used.has(p.name);
    const player = fit.find(p => free(p) && p.name === pick?.start?.[pos]) || fit.find(p => free(p) && p.pos === pos) || fit.find(free);
    if (!player) continue;
    used.add(player.name);
    roster[pos] = player.name;
    if (player.pos !== pos) offPos[pos] = 1;
  }
  const bench = [];
  for (const name of pick?.bench || []) {
    const player = fit.find(p => p.name === name && !used.has(p.name));
    if (player && bench.length < 3) {
      used.add(player.name);
      bench.push(player);
    }
  }
  for (let round = 0; bench.length < 3 && round < 3; round++) {
    for (const pos of BENCH_ORDER) {
      const player = fit.find(p => p.pos === pos && !used.has(p.name));
      if (player && bench.length < 3 && (round > 0 || !bench.some(b => b.pos === pos))) {
        used.add(player.name);
        bench.push(player);
      }
    }
  }
  return { roster, bench: bench.map(({ name, pos }) => ({ name, pos })), offPos };
}

// A side picked for a fixture: the user's team sheet for the user's side.
export const sideFor = (t, id) => selectSide(teamOf(t, id), unavailable(t, id), t.picks?.[id]);

// The World Cup: the real pools, three matches each, at the eight grounds.
export function createCup({ userTeam, length = 'quick', format = 'points', cards = true, bench = false, weather = false, rng = Math.random }) {
  const W = WORLD_CUP;
  const pools = Object.fromEntries(Object.entries(W.pools).map(([group, ids]) => [group, [...ids]]));
  const fixtures = [];
  let n = 0;
  for (const [group, ids] of Object.entries(pools)) {
    roundRobin(ids).forEach((pairs, round) => pairs.forEach(([home, away]) => {
      const f = fixture(`${group}${round}${home}`, 'pool', round, home, away, group);
      f.venue = W.venues[n++ % W.venues.length];
      fixtures.push(f);
    }));
  }
  const field = Object.values(pools).flat().map(id => NATIONS.find(x => x.id === id));
  return { kind: 'cup', worldCup: true, name: W.name, short: W.short, length, format, cards, bench, weather, userTeam, host: W.host, teams: makeTeams(field), pools, fixtures, stage: 'pool', champion: null, byes: [] };
}

// The round of 16 from the pool tables: winners and runners-up into their
// slots, then the four best thirds, each into the slot open to its pool.
export function worldCupRound16(t) {
  const W = WORLD_CUP;
  const tables = Object.fromEntries(Object.keys(t.pools).map(group => [group, standings(t, group)]));
  const thirds = Object.entries(tables).map(([group, rows]) => ({ ...rows[2], group })).sort(tableOrder).slice(0, 4);
  const slots = W.r16.flatMap(([a, b]) => [a, b]).filter(slot => slot.startsWith('3:'));
  // A third from pools A to D fits one slot only; E's and F's take what's left, in order.
  const placed = {};
  for (const third of [...thirds].sort((a, b) => 'EF'.includes(a.group) - 'EF'.includes(b.group))) {
    const slot = slots.find(x => !placed[x] && x.slice(2).includes(third.group));
    placed[slot] = third.id;
  }
  const team = slot => (slot.startsWith('3:') ? placed[slot] : tables[slot[1]][Number(slot[0]) - 1].id);
  return W.r16.map(([a, b, ground], i) => ({ ...fixture(`R${i + 1}`, 'r16', 0, team(a), team(b)), venue: ground }));
}

// season: 'full' (everyone plays everyone once) or 'short' (the first
// SHORT_SEASON rounds of that schedule). With an odd number of teams, one
// side has a bye each round.
export function createLeague({ league = 'prem', userTeam, length = 'quick', format = 'points', cards = true, bench = false, weather = false, season = 'short', rng = Math.random }) {
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
    format,
    cards,
    bench,
    weather,
    userTeam,
    teams: makeTeams(L.teams),
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

// `pools`: the draw, by default the real 2026-27 one.
export function createChampions({ userTeam, length = 'quick', format = 'points', cards = true, bench = false, weather = false, rng = Math.random, pools: drawn = CHAMPIONS_CUP.pools }) {
  const C = CHAMPIONS_CUP;
  const pools = Object.fromEntries(Object.entries(drawn).map(([group, ids]) => [group, [...ids]]));
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
    format,
    cards,
    bench,
    weather,
    userTeam,
    teams: makeTeams(field),
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
  const order = rows => [...rows].sort(tableOrder);
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
    side.rating ??= known.rating;
    if (known.kit) side.kit ??= known.kit;
    // Squads of fifteen came with the team sheet: the five already playing start.
    side.squad ??= ledBy(realSquad(side.id, known.flavour), side.roster);
  }
  t.picks ??= {};
  t.byes ??= [];
  t.format ??= 'points';
  return t;
}

// Where a fixture is played: {name, neutral}. World Cup matches have a
// ground of their own, neutral unless the hosts are playing; the old eight-
// nation cup's knockouts went to the host nation's ground.
export function venue(t, f) {
  if (f.venue) return { name: f.venue, neutral: f.home !== t.host && f.away !== t.host };
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

const dressed = (team, strip, side) => ({ name: team.name, ...strip, roster: side.roster, bench: side.bench, offPos: side.offPos });

// Kits and sides for a fixture, home first. The away side changes strip on a clash.
export function kits(t, f) {
  const home = teamOf(t, f.home);
  const away = teamOf(t, f.away);
  return [dressed(home, { color: home.color, kit: home.kit || null }, sideFor(t, f.home)), dressed(away, stripAgainst(away, home.color), sideFor(t, f.away))];
}

// A competition's rules for one of its matches: length and format, cards,
// bench, and fresh weather for each match when it's on. Knockout matches on
// the clock can't end level: a draw goes to sudden death.
export const isKnockout = f => !!f && f.stage !== 'pool' && f.stage !== 'league';
export function matchRules(t, rng = Math.random, f = null) {
  return { length: t.length, format: t.format || 'points', decider: isKnockout(f), cards: t.cards, bench: !!t.bench, weather: t.weather ? rollWeather(rng) : null };
}

// The user's match, with the user always as team 0 in their first-choice
// kit; the CPU side changes strip if need be.
export function matchOptions(t, f) {
  const userHome = f.home === t.userTeam;
  const me = teamOf(t, t.userTeam);
  const opponent = teamOf(t, userHome ? f.away : f.home);
  const mine = dressed(me, { color: me.color, kit: me.kit || null }, sideFor(t, me.id));
  const theirs = dressed(opponent, stripAgainst(opponent, me.color), sideFor(t, opponent.id));
  return { mode: '1p', teams: [mine, theirs], ...matchRules(t, Math.random, f), cpuLevel: opponent.level, cpuPersonality: opponent.personality, venue: venue(t, f) };
}

// A finished match as a fixture result, home side first: the score, tries,
// everyone who played with their numbers (for the season stats), who was
// hurt (they miss the side's next match) and the Player of the Match.
export function resultFromMatch(f, match, userIsHome) {
  const [mine, theirs] = match.teams;
  const home = userIsHome ? mine : theirs;
  const away = userIsHome ? theirs : mine;
  const sides = userIsHome ? [0, 1] : [1, 0];
  const potm = playerOfTheMatch(match);
  return {
    score: [home.score, away.score],
    tries: [home.stats.tries, away.stats.tries],
    winner: match.winner === null ? 'draw' : (match.winner === 0) === userIsHome ? 'home' : 'away',
    lines: sides.map(i => packLineup(lineup(match, i))),
    injured: [[...(home.injured || [])], [...(away.injured || [])]],
    potm: potm ? { side: (potm.team === 0) === userIsHome ? 0 : 1, pos: potm.pos, name: potm.name } : null,
  };
}

// A side's strength, 1 to 5: a nation's rating, or from a club's level.
export const ratingOf = team => team?.rating ?? { expert: 4, pro: 3, rookie: 2 }[team?.level] ?? 3;

// Class tells in matches the CPU plays out: the stronger side gets team
// cards for the gap in ratings, in place of the draft (one Epic for a gap of
// one, up to two Mythics and two Epics for four). Over 300 quick matches
// each, the stronger side won 61% (on the clock) to 68% (first to 20) with a
// gap of one, and 85% to 95% with a gap of four. Picked by `rng`, so a
// seeded fixture always gets the same cards.
const CLASS_CARDS = [[], ['epic'], ['epic', 'epic'], ['mythic', 'epic', 'epic'], ['mythic', 'mythic', 'epic', 'epic']];
export function classCards(gap, rng) {
  const pool = [...CARD_IDS];
  return CLASS_CARDS[Math.min(4, Math.abs(gap))].map(rarity => ({ id: pool.splice(Math.floor(rng() * pool.length), 1)[0], rarity }));
}

// Plays a CPU-vs-CPU fixture to the end and returns its result.
export function simulateFixture(t, f, rng = Math.random) {
  const [home, away] = kits(t, f);
  const sides = [teamOf(t, f.home), teamOf(t, f.away)];
  let m = newMatch({ mode: '2p', teams: [home, away], ...matchRules(t, rng, f), cards: false });
  const gap = ratingOf(sides[0]) - ratingOf(sides[1]);
  if (gap) m.teams[gap > 0 ? 0 : 1].cards = classCards(gap, rng);
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

// Table order: points, then points difference, then tries, then name for a
// stable order. Pool tables and the Champions Cup's seeding both use it.
function tableOrder(a, b) {
  return b.points - a.points || (b.for - b.against) - (a.for - a.against) || b.triesFor - a.triesFor || a.id.localeCompare(b.id);
}

export function standings(t, group) {
  const ids = t.pools[group];
  const rows = Object.fromEntries(ids.map(id => [id, { id, played: 0, won: 0, drawn: 0, lost: 0, for: 0, against: 0, triesFor: 0, bonus: 0, points: 0 }]));
  for (const f of t.fixtures) {
    if (f.group !== group || !f.result) continue;
    const r = f.result;
    [[f.home, 0], [f.away, 1]].forEach(([id, side]) => {
      const row = rows[id];
      row.played++;
      row.for += r.score[side];
      row.against += r.score[1 - side];
      row.triesFor += r.tries[side];
      if (r.winner === 'draw') {
        row.drawn++;
        row.points += POINTS.draw;
      } else if ((r.winner === 'home') === (side === 0)) {
        row.won++;
        row.points += POINTS.win;
      } else {
        row.lost++;
      }
      const bonus = bonusFor(r.score[side], r.score[1 - side]);
      if (bonus) {
        row.points += bonus === 'big' ? POINTS.bigWinBonus : POINTS.losingBonus;
        row.bonus++;
      }
    });
  }
  return Object.values(rows).sort(tableOrder);
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
  } else if (t.stage === 'pool' && t.worldCup) {
    t.fixtures.push(...worldCupRound16(t));
    t.stage = 'r16';
  } else if (t.stage === 'r16' && t.worldCup) {
    const w = n => winnerOf(byId(t, `R${n}`));
    WORLD_CUP.qf.forEach(([a, b, ground], i) => t.fixtures.push({ ...fixture(`QF${i + 1}`, 'qf', 0, w(a), w(b)), venue: ground }));
    t.stage = 'qf';
  } else if (t.stage === 'qf' && t.worldCup) {
    const w = n => winnerOf(byId(t, `QF${n}`));
    WORLD_CUP.semi.forEach(([a, b, ground], i) => t.fixtures.push({ ...fixture(`SF${i + 1}`, 'semi', 0, w(a), w(b)), venue: ground }));
    t.stage = 'semi';
  } else if (t.stage === 'semi' && t.worldCup) {
    t.fixtures.push({ ...fixture('F', 'final', 0, winnerOf(byId(t, 'SF1')), winnerOf(byId(t, 'SF2'))), venue: WORLD_CUP.final });
    t.stage = 'final';
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
  let drawn = 0;
  let lost = 0;
  for (const f of t.fixtures) {
    if (!f.result || !isUserFixture(t, f)) continue;
    if (f.result.winner === 'draw') drawn++;
    else if (winnerOf(f) === t.userTeam) won++;
    else lost++;
  }
  return { won, drawn, lost };
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
