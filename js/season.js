// Season stats: every player's numbers across a competition, from the
// user's matches and the ones the engine plays out, then the leaders and a
// Team of the Season. Fixture results keep each side's player numbers in a
// compact form: per position, the values of STAT_KEYS in order.

import { POSITIONS } from './dice.js';
import { emptyPlayer } from './engine.js';
import { rating } from './players.js';

export const STAT_KEYS = ['carries', 'metres', 'lineBreaks', 'tries', 'tackles', 'missed', 'bigHits', 'turnovers', 'passes', 'points', 'errors'];

// A side's player numbers for a fixture result.
export function packPlayers(players) {
  return Object.fromEntries(POSITIONS.map(pos => [pos, STAT_KEYS.map(k => players?.[pos]?.[k] || 0)]));
}

export function unpackPlayer(row) {
  const p = emptyPlayer();
  STAT_KEYS.forEach((k, i) => (p[k] = row?.[i] || 0));
  return p;
}

// Points from tries and kicks: what a points-scoring table counts.
export const totalPoints = p => p.tries * 5 + p.points;

// The categories leaders are listed for: [id, title, value, unit].
export const LEADER_STATS = [
  ['tries', 'Top try scorers', p => p.tries, ['try', 'tries']],
  ['points', 'Top points scorers', totalPoints, ['pt', 'pts']],
  ['metres', 'Most metres', p => p.metres, ['m', 'm']],
  ['tackles', 'Most tackles', p => p.tackles, ['tackle', 'tackles']],
  ['turnovers', 'Most turnovers won', p => p.turnovers, ['turnover', 'turnovers']],
  ['lineBreaks', 'Most line breaks', p => p.lineBreaks, ['line break', 'line breaks']],
];

// Everyone who has played: one row per team and position, with their
// totals, appearances, summed match rating and Player of the Match awards.
export function seasonPlayers(t) {
  const rows = new Map();
  const teams = new Map(t.teams.map(team => [team.id, team]));
  for (const f of t.fixtures) {
    const lines = f.result?.players;
    if (!lines) continue;
    [f.home, f.away].forEach((id, side) => {
      const team = teams.get(id);
      for (const pos of POSITIONS) {
        const key = `${id}:${pos}`;
        if (!rows.has(key)) rows.set(key, { key, team: id, pos, name: team?.roster?.[pos] || pos, apps: 0, rating: 0, potm: 0, ...emptyPlayer() });
        const row = rows.get(key);
        const match = unpackPlayer(lines[side]?.[pos]);
        row.apps++;
        for (const k of STAT_KEYS) row[k] += match[k];
        row.rating += rating(match);
        if (f.result.potm && f.result.potm.side === side && f.result.potm.pos === pos) row.potm++;
      }
    });
  }
  return [...rows.values()];
}

// Ties go to fewer appearances (the better rate), then the name.
export function leaders(players, stat, n = 5) {
  const [, , value] = LEADER_STATS.find(([id]) => id === stat);
  return players
    .map(p => ({ ...p, value: value(p) }))
    .filter(p => p.value > 0)
    .sort((a, b) => b.value - a.value || a.apps - b.apps || a.name.localeCompare(b.name))
    .slice(0, n);
}

// The best at each position by average match rating, among players with at
// least half as many appearances as the most at that position.
export function teamOfTheSeason(players) {
  const team = {};
  for (const pos of POSITIONS) {
    const field = players.filter(p => p.pos === pos);
    if (!field.length) continue;
    const most = Math.max(...field.map(p => p.apps));
    const eligible = field.filter(p => p.apps * 2 >= most);
    team[pos] = eligible.reduce((best, p) => {
      const [a, b] = [p.rating / p.apps, best.rating / best.apps];
      return a > b || (a === b && p.rating > best.rating) ? p : best;
    });
  }
  return team;
}

// The best of the Team of the Season.
export function playerOfTheSeason(players) {
  const picks = Object.values(teamOfTheSeason(players));
  return picks.reduce((best, p) => (!best || p.rating / p.apps > best.rating / best.apps ? p : best), null);
}
