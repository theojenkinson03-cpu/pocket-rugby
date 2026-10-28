// Player names, ratings and Player of the Match.

import { PLAYERS, POSITIONS } from './dice.js';

// Common surnames, grouped by the flavour of a side. Picked at random, so any
// match with a real person is a coincidence; the most famous rugby surnames
// are left out so that real clubs never seem to field real players.
export const SURNAMES = {
  any: ['Harris', 'Walker', 'Morgan', 'Price', 'Hughes', 'Clarke', 'Ward', 'Turner', 'Baker', 'Bennett', 'Carter', 'Fletcher', 'Hayes', 'Lowe', 'Marsh', 'Nash', 'Pearce', 'Reid', 'Shaw', 'Webb', 'Young', 'Grant', 'Hale', 'Kerr', 'Lane', 'Moss', 'Pike', 'Rowe', 'Stone', 'Vance'],
  english: ['Ashworth', 'Barker', 'Cooper', 'Dawson', 'Ellis', 'Foster', 'Hodges', 'Kemp', 'Mills', 'Parsons', 'Saunders', 'Tolley'],
  welsh: ['Jones', 'Davies', 'Evans', 'Griffiths', 'Lloyd', 'Morris', 'Pritchard', 'Rees', 'Vaughan', 'Powell', 'Bevan', 'Howells'],
  irish: ['Byrne', 'Doyle', 'Flynn', 'Keane', 'Lynch', 'Murphy', 'Nolan', 'Quinn', 'Ryan', 'Walsh', 'Brennan', 'Healy'],
  scottish: ['Campbell', 'Fraser', 'Gordon', 'Mackay', 'Munro', 'Ross', 'Sinclair', 'Stewart', 'Wallace', 'Cameron', 'Graham', 'Hendry'],
  french: ['Dubois', 'Laurent', 'Moreau', 'Girard', 'Roux', 'Fournier', 'Mercier', 'Blanc', 'Garnier', 'Faure', 'Chevalier', 'Lambert'],
  italian: ['Rossi', 'Bianchi', 'Ferrari', 'Esposito', 'Ricci', 'Marino', 'Greco', 'Bruno', 'Gallo', 'Conti', 'Costa', 'Fontana'],
  southern: ['Botha', 'Naidoo', 'Pretorius', 'Steyn', 'Mokoena', 'Fourie', 'Visser', 'Dlamini', 'Coetzee', 'Smit', 'Nel', 'Kruger'],
  pacific: ['Leota', 'Mahe', 'Naivalu', 'Ravouvou', 'Tamani', 'Koroi', 'Seru', 'Waqa', 'Lomani', 'Tuala', 'Fonua', 'Moala'],
  kiwi: ['Ngata', 'Parata', 'Tane', 'Walker', 'Rangi', 'Hohaia', 'Paewai', 'Kingi', 'Reweti', 'Tipene', 'Herewini', 'Mason'],
  aussie: ['Murray', 'Kelly', 'Brown', 'Wilson', 'Mitchell', 'Gibson', 'Holloway', 'Kennedy', 'Lucas', 'Sutton', 'Tobin', 'Kerr'],
  latin: ['Fernández', 'González', 'Rodríguez', 'Martínez', 'Sánchez', 'Romero', 'Álvarez', 'Benítez', 'Correa', 'Ledesma', 'Medina', 'Sosa'],
  japanese: ['Sato', 'Suzuki', 'Takahashi', 'Tanaka', 'Watanabe', 'Ito', 'Yamamoto', 'Nakamura', 'Kobayashi', 'Kato', 'Yoshida', 'Matsuda'],
};

const INITIALS = 'ABCDEGHJKLMNPRSTW';

// A fresh roster of five names, all different.
export function randomRoster(flavour = 'any', rng = Math.random) {
  const pool = [...(SURNAMES[flavour] || []), ...(flavour === 'any' ? [] : SURNAMES.any.slice(0, 6))];
  const names = pool.length >= 5 ? pool : SURNAMES.any;
  const picked = new Set();
  const roster = {};
  for (const pos of POSITIONS) {
    let name;
    do name = names[Math.floor(rng() * names.length)];
    while (picked.has(name));
    picked.add(name);
    roster[pos] = `${INITIALS[Math.floor(rng() * INITIALS.length)]}. ${name}`;
  }
  return roster;
}

// "Ravens' card", "Wales's card": an apostrophe alone after a final s.
export const possessive = name => (/s$/i.test(name) ? `${name}'` : `${name}'s`);

// "Harris" from "T. Harris"; the position name when a side has no roster.
export function surname(match, team, pos) {
  const full = match.teams[team].roster?.[pos];
  return full ? full.replace(/^[A-Z]\.\s*/, '') : null;
}

// How commentary names a player: "Harris (Outside Back)", or "the Ravens Outside Back".
export function who(match, team, pos) {
  const name = surname(match, team, pos);
  return name ? `${name} (${PLAYERS[pos].one})` : `the ${match.teams[team].name} ${PLAYERS[pos].one}`;
}

export function fullName(match, team, pos) {
  return match.teams[team].roster?.[pos] || `${match.teams[team].name} ${PLAYERS[pos].one}`;
}

// One number for a player's match: tries and turnovers count most, errors cost.
export function rating(p) {
  return p.tries * 6 + p.lineBreaks * 2.5 + p.carries * 0.6 + p.tackles + p.bigHits * 1.5 + p.turnovers * 3 + p.points * 0.8 - p.errors * 1.5;
}

export function playerRatings(match) {
  const rows = [];
  match.teams.forEach((t, team) => {
    for (const pos of POSITIONS) {
      const stats = t.players?.[pos];
      if (stats) rows.push({ team, pos, name: fullName(match, team, pos), stats, rating: rating(stats) });
    }
  });
  return rows.sort((a, b) => b.rating - a.rating);
}

// The best rating wins, with a small lift for the side that won the match.
export function playerOfTheMatch(match) {
  const rows = playerRatings(match);
  if (!rows.length) return null;
  const lifted = row => row.rating * (row.team === match.winner ? 1.15 : 1);
  return rows.reduce((best, row) => (lifted(row) > lifted(best) ? row : best));
}

// A short line of what they did: "2 tries · 6 tackles · 1 turnover".
export function statLine(p) {
  const parts = [];
  const add = (n, one, many) => n && parts.push(`${n} ${n === 1 ? one : many}`);
  add(p.tries, 'try', 'tries');
  add(p.lineBreaks, 'line break', 'line breaks');
  add(p.points, 'kicking point', 'kicking points');
  add(p.tackles, 'tackle', 'tackles');
  add(p.bigHits, 'big hit', 'big hits');
  add(p.turnovers, 'turnover', 'turnovers');
  add(p.carries, 'carry', 'carries');
  return parts.slice(0, 4).join(' · ') || 'A quiet day';
}
