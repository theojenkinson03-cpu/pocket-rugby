// Friends league: every phone rebuilds the same league from the shared
// settings, the claimed clubs and the results people played; CPU matches
// are played out identically on every phone from seeded dice.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { seededRng } from '../js/engine.js';
import { validCode } from '../js/online.js';
import { bothHuman, fixtureRoomCode, fixtureRng, hashText, humanOf, isHumanFixture, myPending, newFriendsLeague, rebuild, roleIn } from '../js/friends.js';
import { selectSide, simulateFixture, standings, teamOf } from '../js/tournament.js';

const settingsFor = (over = {}) => ({ ...newFriendsLeague({ code: 'k7mp2q', league: 'prem', season: 'short', length: 'quick', host: 'u_a', seed: 12345, ...over }), status: 'season' });
const clubs = { bath: { uid: 'u_a' }, gloucester: { uid: 'u_b' }, sale: { uid: 'u_c' } };

// What a person's match produces: a real played-out result.
const played = (built, f) => simulateFixture(built.t, f, seededRng(hashText(`played:${f.id}`)));

test('settings: a known league, sensible defaults, waiting in the lobby', () => {
  const s = newFriendsLeague({ code: 'abc234', host: 'u_a', seed: 2 ** 33 + 5 });
  assert.deepEqual([s.league, s.season, s.length, s.cards, s.bench, s.weather, s.status], ['prem', 'short', 'quick', true, true, false, 'lobby']);
  assert.equal(s.seed, 5, 'a 32-bit seed');
  assert.throws(() => newFriendsLeague({ code: 'x', league: 'nope', host: 'u', seed: 1 }));
});

test('every phone builds the same league, and the same CPU results', () => {
  const s = settingsFor();
  const a = rebuild(s, clubs, {}, 'u_a');
  const b = rebuild(s, clubs, {}, 'u_b');
  const watcher = rebuild(s, clubs, {}, 'u_z');
  assert.equal(a.myClub, 'bath');
  assert.equal(b.myClub, 'gloucester');
  assert.equal(watcher.myClub, null);
  const strip = built => built.t.fixtures.map(f => [f.id, f.home, f.away, f.result && f.result.score]);
  assert.deepEqual(strip(a), strip(b));
  assert.deepEqual(strip(a), strip(watcher));
  assert.deepEqual(a.pending.map(f => f.id), b.pending.map(f => f.id));
  // The CPU's matches in the first round are played; the people's are waiting.
  const first = a.t.fixtures.filter(f => f.round === 0);
  for (const f of first) assert.equal(!!f.result, !isHumanFixture(clubs, f), f.id);
  assert.ok(a.pending.length >= 1 && a.pending.every(f => f.round === 0));
});

test('a round waits for its people, then the league moves on', () => {
  const s = settingsFor();
  const results = {};
  let built = rebuild(s, clubs, results, 'u_a');
  const round0 = built.pending.map(f => f.id);
  // One person plays: still waiting for the rest.
  results[round0[0]] = played(built, built.pending[0]);
  built = rebuild(s, clubs, results, 'u_a');
  if (round0.length > 1) assert.ok(built.pending.every(f => f.round === 0));
  for (const f of built.pending) results[f.id] = played(built, f);
  built = rebuild(s, clubs, results, 'u_a');
  assert.ok(built.pending.every(f => f.round === 1) || built.pending.length === 0);
  // Round one complete; round two's CPU matches are in while its people's wait.
  const round1 = built.t.fixtures.filter(f => f.round === 1);
  assert.ok(round1.every(f => !!f.result === !isHumanFixture(clubs, f)));
  const table = standings(built.t, 'L');
  const cpuRound1 = round1.filter(f => !isHumanFixture(clubs, f)).length;
  assert.equal(table.reduce((n, r) => n + r.played, 0), 2 * (5 + cpuRound1), 'every finished match counted once for each side');
});

test('a whole friends season to a champion, with the people\'s results fed in as they come', () => {
  const s = settingsFor({ league: 'top14' });
  const people = { toulouse: { uid: 'u_a' }, racing: { uid: 'u_b' }, pau: { uid: 'u_c' }, lyon: { uid: 'u_d' } };
  const results = {};
  const cache = {};
  let built;
  for (let guard = 0; guard < 50; guard++) {
    built = rebuild(s, people, results, 'u_a', cache);
    if (built.t.stage === 'done') break;
    assert.ok(built.pending.length, 'something to play');
    for (const f of built.pending) results[f.id] = played(built, f);
  }
  assert.equal(built.t.stage, 'done');
  assert.ok(teamOf(built.t, built.t.champion));
  // The same, rebuilt from scratch by another phone with no cache.
  const again = rebuild(s, people, results, 'u_c');
  assert.equal(again.t.champion, built.t.champion);
  assert.deepEqual(again.t.fixtures.map(f => f.result.score), built.t.fixtures.map(f => f.result.score));
  assert.ok(Object.keys(cache).length > 15, 'CPU results are kept between rebuilds');
});

test('your own match: found, hosted by the home side, in a room every phone agrees on', () => {
  const s = settingsFor();
  const built = rebuild(s, clubs, {}, 'u_a');
  const mine = myPending(built, 'u_a', clubs);
  assert.ok(!mine || mine.home === 'bath' || mine.away === 'bath');
  for (const f of built.t.fixtures) {
    if (!bothHuman(clubs, f)) continue;
    const home = humanOf(clubs, f.home);
    const away = humanOf(clubs, f.away);
    assert.equal(roleIn(clubs, f, home), 'host');
    assert.equal(roleIn(clubs, f, away), 'guest');
    assert.equal(roleIn(clubs, f, 'u_z'), null);
    const code = fixtureRoomCode(s, f.id);
    assert.ok(validCode(code));
    assert.equal(code, fixtureRoomCode({ ...s }, f.id), 'the same on both phones');
  }
  const codes = new Set(built.t.fixtures.map(f => fixtureRoomCode(s, f.id)));
  assert.equal(codes.size, built.t.fixtures.length, 'a room per fixture');
  assert.notEqual(fixtureRoomCode(s, 'L0bath'), fixtureRoomCode({ ...s, code: 'zzzzzz' }, 'L0bath'), 'and per league');
});

test('CPU dice depend on the league and the fixture only', () => {
  const s = settingsFor();
  const a = fixtureRng(s, 'L3sale');
  const b = fixtureRng(s, 'L3sale');
  assert.deepEqual([a(), a(), a()], [b(), b(), b()]);
  assert.notEqual(fixtureRng(s, 'L3sale')(), fixtureRng(s, 'L4sale')());
  assert.notEqual(fixtureRng(s, 'L3sale')(), fixtureRng({ ...s, seed: 99 }, 'L3sale')());
});

test('a friend who leaves hands their club to the CPU; squads people edited are used', () => {
  const s = settingsFor();
  const before = rebuild(s, clubs, {}, 'u_a');
  const theirs = before.pending.find(f => f.home === 'sale' || f.away === 'sale');
  const left = { bath: clubs.bath, gloucester: clubs.gloucester };
  const after = rebuild(s, left, {}, 'u_a');
  if (theirs && !isHumanFixture(left, theirs)) {
    const f = after.t.fixtures.find(x => x.id === theirs.id);
    assert.ok(f.result, 'played out by the CPU now');
  }
  const squad = { S: 'A. One', F: 'B. Two', C: 'C. Three', W: 'D. Four', B: 'E. Five' };
  const withSquad = rebuild(s, { ...clubs, bath: { uid: 'u_a', roster: squad } }, {}, 'u_a');
  assert.deepEqual(teamOf(withSquad.t, 'bath').roster, squad);
  // The renamed five lead the squad, so they're the ones picked.
  assert.deepEqual(selectSide(teamOf(withSquad.t, 'bath')).roster, squad);
  assert.equal(teamOf(withSquad.t, 'bath').squad.length, 15);
});
