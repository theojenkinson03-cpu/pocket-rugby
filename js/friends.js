// Friends league: several phones each pick a club in the same league and
// the CPU plays the rest. What the phones share (on claude.ai, in the
// page's shared data) is small: the league's settings and seed, who has
// which club, and the results of the matches people played. Every phone
// rebuilds the same league from that: the fixtures from the seed, and every
// CPU-against-CPU match played out by the engine with dice seeded by the
// league and the fixture, so each phone gets the same result without
// anyone sending it.

import { seededRng } from './engine.js';
import { makeCode } from './online.js';
import { advance, createLeague, currentRound, LEAGUES, ledBy, recordResult, simulateFixture, teamOf } from './tournament.js';

export const FRIENDS_VERSION = 1;

// A 32-bit hash of some text, for seeds.
export function hashText(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// The league's settings, as stored in its shared document.
export function newFriendsLeague({ code, league = 'prem', season = 'short', length = 'quick', format = 'rolls', cards = true, bench = true, weather = false, host, seed }) {
  if (!LEAGUES[league]) throw new Error(`no league ${league}`);
  return { v: FRIENDS_VERSION, code, league, season, length, format: format === 'points' ? 'points' : 'rolls', cards: !!cards, bench: !!bench, weather: !!weather, host, seed: seed >>> 0, status: 'lobby', created: Date.now() };
}

// The dice for a CPU-against-CPU fixture: the same on every phone.
export const fixtureRng = (settings, fixtureId) => seededRng(hashText(`${settings.seed}:${settings.code}:${fixtureId}`));

// The room for a match between two friends: a code of its own, from the league and the fixture.
export const fixtureRoomCode = (settings, fixtureId) => makeCode(seededRng(hashText(`room:${settings.code}:${fixtureId}`)));

// clubs: {clubId: {uid, roster?}}. A fixture is someone's to play when
// either side is a person's club.
export const humanOf = (clubs, clubId) => clubs[clubId]?.uid || null;
export const isHumanFixture = (clubs, f) => !!(humanOf(clubs, f.home) || humanOf(clubs, f.away));

// Rebuilds the league from the shared settings, clubs and results, as far
// as it can go: each round is complete once every person's match in it has
// a result (the CPU's are played out here). `me` is this viewer's id;
// `cache` keeps played-out results between rebuilds.
export function rebuild(settings, clubs, results, me, cache = {}) {
  const myClub = Object.keys(clubs).find(id => clubs[id].uid === me) || null;
  const t = createLeague({
    league: settings.league,
    userTeam: myClub || '__watching',
    season: settings.season,
    length: settings.length,
    // Leagues made before the clock were first to a score.
    format: settings.format || 'points',
    cards: settings.cards,
    bench: settings.bench,
    weather: settings.weather,
    rng: seededRng(settings.seed),
  });
  t.friends = { code: settings.code, myClub };
  for (const [id, club] of Object.entries(clubs)) {
    const team = teamOf(t, id);
    if (team && club.roster) {
      team.roster = { ...club.roster };
      team.squad = ledBy(team.squad, club.roster);
    }
  }
  const pending = [];
  for (let guard = 0; guard < 200 && t.stage !== 'done'; guard++) {
    const round = currentRound(t);
    if (round === null) {
      advance(t);
      continue;
    }
    const open = t.fixtures.filter(f => f.stage === t.stage && f.round === round && !f.result);
    for (const f of open) {
      if (results[f.id]) recordResult(t, f.id, results[f.id]);
      else if (!isHumanFixture(clubs, f)) {
        const key = `${settings.seed}:${f.id}`;
        cache[key] ||= simulateFixture(t, f, fixtureRng(settings, f.id));
        f.result = cache[key];
      } else pending.push(f);
    }
    if (pending.length) break;
    advance(t);
  }
  return { t, pending, myClub };
}

// The person's own match still to play this round, if any.
export const myPending = (built, me, clubs) => built.pending.find(f => humanOf(clubs, f.home) === me || humanOf(clubs, f.away) === me) || null;

// A fixture between two people.
export const bothHuman = (clubs, f) => !!(humanOf(clubs, f.home) && humanOf(clubs, f.away));

// Who plays a two-person match from which phone: the home side hosts.
export function roleIn(clubs, f, me) {
  if (humanOf(clubs, f.home) === me) return 'host';
  if (humanOf(clubs, f.away) === me) return 'guest';
  return null;
}

// Codes for friends leagues: six easy-to-read characters.
export const newLeagueCode = rng => makeCode(rng);
