// Career record and achievements: what counts, what doesn't, and every
// achievement unlocked by the exact thing it describes and nothing less.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { act, newMatch, seededRng } from '../js/engine.js';
import { cpuChoice } from '../js/ai.js';
import { ACHIEVEMENT_BY_ID, ACHIEVEMENTS, newCareer, newTracker, recordMatch, track } from '../js/career.js';
import { stateAt } from './helpers.mjs';

// A finished match: team 0 is "me".
function finished({ scores = [30, 10], winner = scores[0] > scores[1] ? 0 : 1, length = 'standard', stats = [{}, {}], players = [{}, {}], sinBin = [false, false], yellows = [0, 0], cards = [null, null] } = {}) {
  const m = stateAt({ step: { type: 'fulltime' }, scores, length, sinBin, yellows, half: 2 });
  m.winner = winner;
  m.teams.forEach((t, i) => {
    Object.assign(t.stats, stats[i]);
    for (const [pos, p] of Object.entries(players[i])) Object.assign(t.players[pos], p);
    t.cards = (cards[i] || '').split('+').filter(Boolean).map(card => {
      const [id, rarity] = card.split(':');
      return { id, rarity: rarity || 'common' };
    });
  });
  return m;
}

const ctx = (over = {}) => ({ mode: '1p', level: 'pro', tournament: null, ...over });
const unlocks = (match, tracker = newTracker(0), context = ctx(), career = newCareer()) => recordMatch(career, match, tracker, context);

test('36 achievements, each with a name and a description', () => {
  assert.equal(ACHIEVEMENTS.length, 36);
  assert.equal(new Set(ACHIEVEMENTS.map(a => a.id)).size, 36);
  for (const a of ACHIEVEMENTS) assert.ok(a.name && a.text.endsWith('.') && typeof a.check === 'function', a.id);
  assert.equal(ACHIEVEMENT_BY_ID['first-win'].name, 'First Win');
});

test('the record: played, won, lost, points, tries, streaks and levels', () => {
  const c = newCareer();
  const play = (scores, level = 'pro', tries = 3) => recordMatch(c, finished({ scores, stats: [{ tries }, {}] }), newTracker(0), ctx({ level }));
  play([30, 10]);
  play([31, 12], 'expert', 4);
  play([20, 30], 'rookie', 2);
  play([30, 29]);
  assert.deepEqual([c.played, c.won, c.lost], [4, 3, 1]);
  assert.equal(c.pointsFor, 111);
  assert.equal(c.pointsAgainst, 81);
  assert.equal(c.tries, 12);
  assert.equal(c.streak, 1);
  assert.equal(c.bestStreak, 2);
  assert.deepEqual(c.byLevel.pro, { played: 2, won: 2 });
  assert.deepEqual(c.byLevel.expert, { played: 1, won: 1 });
  assert.deepEqual(c.byLevel.rookie, { played: 1, won: 0 });
  assert.deepEqual(c.biggestWin, { margin: 20, score: '30–10', against: 'Away' });
});

test('two players on one phone only counts as a match played together', () => {
  const c = newCareer();
  assert.deepEqual(recordMatch(c, finished(), newTracker(null), ctx({ mode: '2p' })), []);
  assert.equal(c.twoPlayer, 1);
  assert.equal(c.played, 0);
  assert.deepEqual(c.achievements, {});
});

test('online matches count separately and leave the CPU streak alone', () => {
  const c = newCareer();
  recordMatch(c, finished(), newTracker(0), ctx());
  const online = finished({ scores: [12, 30] });
  recordMatch(c, online, newTracker(1), ctx({ mode: 'online' }));
  assert.deepEqual(c.online, { played: 1, won: 1 });
  assert.equal(c.streak, 1, 'unchanged by the online match');
  assert.equal(c.won, 2, 'but it is a win');
  assert.ok(c.achievements['online-win']);
});

test('an achievement is only unlocked once, and dated', () => {
  const c = newCareer();
  assert.ok(recordMatch(c, finished(), newTracker(0), ctx()).includes('first-win'));
  assert.ok(!recordMatch(c, finished(), newTracker(0), ctx()).includes('first-win'));
  assert.match(c.achievements['first-win'], /^\d{4}-\d{2}-\d{2}$/);
});

// Each achievement: a match that earns it, and a near miss that doesn't.
const CASES = {
  'first-win': [() => finished(), () => finished({ scores: [10, 30] })],
  'hat-trick': [() => finished({ players: [{ W: { tries: 3 } }, {}] }), () => finished({ players: [{ W: { tries: 2 }, C: { tries: 2 } }, {}] })],
  'try-fest': [() => finished({ stats: [{ tries: 6 }, {}] }), () => finished({ stats: [{ tries: 5 }, { tries: 6 }] })],
  'shut-out': [() => finished({ scores: [30, 0] }), () => finished({ scores: [30, 3] })],
  'hundred-metres': [() => finished({ players: [{ F: { metres: 100 } }, {}] }), () => finished({ players: [{ F: { metres: 99 }, W: { metres: 99 } }, { C: { metres: 140 } }] })],
  'gain-line': [() => finished({ stats: [{ metres: 250 }, {}] }), () => finished({ stats: [{ metres: 249 }, { metres: 300 }] })],
  'mr-reliable': [() => finished({ stats: [{ conversions: 4, conversionAttempts: 4 }, {}] }), () => finished({ stats: [{ conversions: 4, conversionAttempts: 5 }, {}] })],
  'boot-camp': [() => finished({ stats: [{ conversions: 3, penaltyGoals: 2 }, {}] }), () => finished({ stats: [{ conversions: 1, penaltyGoals: 3 }, {}] })],
  'brick-wall': [() => finished({ stats: [{ tackles: 25 }, {}] }), () => finished({ stats: [{ tackles: 24 }, { tackles: 30 }] })],
  'big-hitter': [() => finished({ stats: [{ bigHits: 4 }, {}] }), () => finished({ stats: [{ bigHits: 3 }, {}] })],
  fourteen: [() => finished({ sinBin: [true, false], yellows: [1, 0] }), () => finished({ scores: [10, 30], sinBin: [true, false], yellows: [1, 0] })],
  'against-odds': [() => finished({ yellows: [2, 0] }), () => finished({ yellows: [1, 0] })],
  marathon: [() => finished({ length: 'long', scores: [50, 3] }), () => finished({ length: 'standard' })],
};

test('match achievements: earned exactly when the description says', () => {
  for (const [id, [yes, no]] of Object.entries(CASES)) {
    assert.ok(unlocks(yes()).includes(id), `${id} earned`);
    assert.ok(!unlocks(no()).includes(id), `${id} not earned by a near miss`);
  }
});

test('context achievements: Expert, tournaments, online, the guided match', () => {
  assert.ok(unlocks(finished(), newTracker(0), ctx({ level: 'expert' })).includes('giant-killer'));
  assert.ok(!unlocks(finished({ scores: [9, 30] }), newTracker(0), ctx({ level: 'expert' })).includes('giant-killer'));
  assert.ok(!unlocks(finished(), newTracker(0), ctx({ level: 'pro' })).includes('giant-killer'));
  const cup = { kind: 'cup', champion: true, lost: 1 };
  const won = unlocks(finished(), newTracker(0), ctx({ tournament: cup }));
  assert.ok(won.includes('cup-winners') && !won.includes('champions') && !won.includes('invincibles'));
  const league = unlocks(finished(), newTracker(0), ctx({ tournament: { kind: 'league', champion: true, lost: 0 } }));
  assert.ok(league.includes('champions') && league.includes('invincibles'));
  const europe = unlocks(finished(), newTracker(0), ctx({ tournament: { kind: 'champions', champion: true, lost: 1 } }));
  assert.ok(europe.includes('european-champions') && !europe.includes('champions') && !europe.includes('cup-winners'));
  const double = unlocks(finished(), newTracker(0), ctx({ tournament: { kind: 'champions', champion: true, lost: 1, double: true, leagueTitles: 1 } }));
  assert.ok(double.includes('the-double') && !double.includes('dynasty'));
  const dynasty = unlocks(finished(), newTracker(0), ctx({ tournament: { kind: 'league', champion: true, lost: 1, leagueTitles: 3 } }));
  assert.ok(dynasty.includes('dynasty') && !dynasty.includes('the-double'));
  assert.ok(!unlocks(finished(), newTracker(0), ctx({ tournament: { kind: 'league', champion: true, lost: 1, leagueTitles: 2 } })).includes('dynasty'));
  assert.ok(unlocks(finished(), newTracker(0), ctx({ daily: true })).includes('late-show'));
  assert.ok(!unlocks(finished({ scores: [20, 30] }), newTracker(0), ctx({ daily: true })).includes('late-show'), 'a daily lost');
  assert.ok(unlocks(finished(), newTracker(0), ctx({ friendsFinal: true })).includes('friends-champions'));
  assert.ok(!unlocks(finished(), newTracker(0), ctx()).includes('friends-champions'));
  const c = newCareer();
  recordMatch(c, finished(), newTracker(0), ctx({ tournament: cup }));
  recordMatch(c, finished(), newTracker(0), ctx({ tournament: { kind: 'league', champion: true, lost: 2 } }));
  recordMatch(c, finished(), newTracker(0), ctx({ tournament: { kind: 'champions', champion: true, lost: 0 } }));
  assert.deepEqual([c.cups, c.leagues, c.europe], [1, 1, 1]);
  assert.ok(unlocks(finished({ scores: [3, 30] }), newTracker(0), ctx({ mode: 'learn' })).includes('graduate'), 'win or lose');
  assert.ok(!unlocks(finished({ scores: [3, 30] }), newTracker(0), ctx({ mode: 'online' })).includes('online-win'), 'an online defeat');
  assert.ok(unlocks(finished({ scores: [3, 30] }), newTracker(1), ctx({ mode: 'online' })).includes('online-win'), 'the guest won');
});

test('career achievements: five in a row, six cards', () => {
  const c = newCareer();
  for (let i = 0; i < 4; i++) recordMatch(c, finished(), newTracker(0), ctx());
  assert.ok(!c.achievements['on-a-roll']);
  recordMatch(c, finished(), newTracker(0), ctx());
  assert.ok(c.achievements['on-a-roll']);

  const d = newCareer();
  const cards = ['big-pack', 'jackal', 'fortress', 'clinical', 'golden-boot'];
  for (const card of cards) recordMatch(d, finished({ cards: [card, null] }), newTracker(0), ctx());
  recordMatch(d, finished({ cards: ['jackal', null] }), newTracker(0), ctx());
  recordMatch(d, finished({ scores: [3, 30], cards: ['sure-hands', null] }), newTracker(0), ctx());
  assert.equal(d.cardsWon.length, 5, 'a repeat or a defeat does not count');
  assert.ok(!d.achievements['card-sharp']);
  recordMatch(d, finished({ cards: ['sure-hands', null] }), newTracker(0), ctx());
  assert.ok(d.achievements['card-sharp']);
});

test('Mythic: a win with a Mythic card, and the rarest version of each card you have won with', () => {
  const c = newCareer();
  recordMatch(c, finished({ cards: ['jackal:rare', null] }), newTracker(0), ctx());
  assert.deepEqual(c.cardRarity, { jackal: 'rare' });
  recordMatch(c, finished({ cards: ['jackal', null] }), newTracker(0), ctx());
  assert.equal(c.cardRarity.jackal, 'rare', 'a Common win keeps the Rare');
  recordMatch(c, finished({ scores: [10, 30], cards: ['jackal:mythic', null] }), newTracker(0), ctx());
  assert.equal(c.cardRarity.jackal, 'rare', 'a defeat does not count');
  assert.ok(!c.achievements.mythic);
  recordMatch(c, finished({ cards: ['jackal:epic', null] }), newTracker(0), ctx());
  assert.equal(c.cardRarity.jackal, 'epic');
  recordMatch(c, finished({ cards: ['fortress:mythic', null] }), newTracker(0), ctx());
  assert.deepEqual(c.cardRarity, { jackal: 'epic', fortress: 'mythic' });
  assert.ok(c.achievements.mythic);
  // The other side's Mythic is not yours.
  assert.ok(!unlocks(finished({ cards: ['jackal', 'fortress:mythic'] })).includes('mythic'));
  // Both of the side's cards count.
  recordMatch(c, finished({ cards: ['golden-boot+sure-hands:rare', null] }), newTracker(0), ctx());
  assert.deepEqual(c.cardRarity, { jackal: 'epic', fortress: 'mythic', 'golden-boot': 'common', 'sure-hands': 'rare' });
  // A draw on the clock is neither a win nor a defeat.
  const drawn = newCareer();
  recordMatch(drawn, finished({ scores: [14, 14], winner: null }), newTracker(0), ctx());
  assert.deepEqual([drawn.played, drawn.won, drawn.lost, drawn.drawn, drawn.streak], [1, 0, 0, 1, 0]);
  // A career saved before rarities had no record of them.
  const old = newCareer();
  delete old.cardRarity;
  recordMatch(old, finished({ cards: ['clinical:rare', null] }), newTracker(0), ctx());
  assert.deepEqual(old.cardRarity, { clinical: 'rare' });
});

// ---- The tracker: things only the match's events show ------------------

const at = (scores, extra = {}) => ({ ...stateAt({ scores }), ...extra });

test('the tracker follows comebacks, video-ref tries, tap tries and long kicks', () => {
  const t = newTracker(0);
  track(t, at([0, 0]), [], at([0, 12]));
  track(t, at([0, 12]), [], at([5, 12]));
  assert.equal(t.maxDeficit, 12);
  assert.ok(unlocks(finished(), t).includes('comeback'));
  assert.ok(!unlocks(finished(), (() => { const x = newTracker(0); track(x, at([0, 0]), [], at([0, 9])); return x; })()).includes('comeback'));

  // Two video refs, then the try.
  const v = newTracker(0);
  track(v, at([0, 0]), [{ type: 'videoRef', team: 0 }], at([0, 0]));
  track(v, at([0, 0]), [{ type: 'videoRef', team: 0 }], at([0, 0]));
  track(v, at([0, 0]), [{ type: 'try', team: 0 }], at([5, 0]));
  assert.ok(v.videoTry);
  // One review is not enough, and a no-try resets the count.
  const w = newTracker(0);
  track(w, at([0, 0]), [{ type: 'videoRef', team: 0 }], at([0, 0]));
  track(w, at([0, 0]), [{ type: 'noTry', team: 0 }], at([0, 0]));
  track(w, at([0, 0]), [{ type: 'videoRef', team: 0 }], at([0, 0]));
  track(w, at([0, 0]), [{ type: 'try', team: 0 }], at([5, 0]));
  assert.ok(!w.videoTry);

  // A try while the quick tap is running.
  const tap = newTracker(0);
  track(tap, at([0, 0], { quickTap: 2, attacker: 0 }), [{ type: 'try', team: 0 }], at([5, 0]));
  assert.ok(tap.tapTry);
  const noTap = newTracker(0);
  track(noTap, at([0, 0], { quickTap: 0, attacker: 0 }), [{ type: 'try', team: 0 }], at([5, 0]));
  assert.ok(!noTap.tapTry);

  // 50 m kicks, and hitting the post (missing by exactly 10 m).
  const k = newTracker(0);
  track(k, at([0, 0]), [{ type: 'kick', team: 0, kick: 'drop', range: 5, distance: 6, good: true }], at([3, 0]));
  track(k, at([0, 0]), [{ type: 'kick', team: 0, kick: 'penalty', range: 5, distance: 5, good: true }], at([6, 0]));
  track(k, at([0, 0]), [{ type: 'kick', team: 0, kick: 'conversion', range: 4, distance: 3, good: false }], at([6, 0]));
  track(k, at([0, 0]), [{ type: 'kick', team: 0, kick: 'penalty', range: 5, distance: 3, good: false }], at([6, 0]));
  track(k, at([0, 0]), [{ type: 'kick', team: 1, kick: 'drop', range: 5, distance: 6, good: true }], at([6, 3]));
  assert.ok(k.longDrop && k.longPenalty);
  assert.equal(k.postHits, 1, 'only the miss by 10 m hit the post');
  const got = unlocks(finished(), k);
  for (const id of ['from-halfway', 'monster-boot', 'so-close']) assert.ok(got.includes(id), id);

  // Rucks and interceptions, ours only.
  const r = newTracker(0);
  for (const e of [{ type: 'ruck', team: 0, won: true }, { type: 'ruck', team: 0, won: false }, { type: 'ruck', team: 1, won: true }, { type: 'intercept', team: 0 }, { type: 'intercept', team: 1 }]) track(r, at([0, 0]), [e], at([0, 0]));
  assert.deepEqual([r.rucksWon, r.intercepts], [1, 1]);
  track(r, at([0, 0]), [{ type: 'ruck', team: 0, won: true }, { type: 'intercept', team: 0 }], at([0, 0]));
  const ri = unlocks(finished(), r);
  assert.ok(ri.includes('ball-thief') && ri.includes('read-it'));

  // Winning it with a kick: the last score of the match.
  const ice = newTracker(0);
  track(ice, at([27, 28]), [{ type: 'score', team: 0, kind: 'penalty' }], at([30, 28]));
  assert.ok(unlocks(finished({ scores: [30, 28] }), ice).includes('ice-cold'));
  const tryWin = newTracker(0);
  track(tryWin, at([25, 28]), [{ type: 'score', team: 0, kind: 'try' }], at([30, 28]));
  assert.ok(!unlocks(finished({ scores: [30, 28] }), tryWin).includes('ice-cold'));

  // Nobody to follow in a two-player match.
  const none = newTracker(null);
  track(none, at([0, 0]), [{ type: 'try', team: 0 }], at([5, 0]));
  assert.deepEqual(none, newTracker(null));
});

test('real matches: the tracker and record never break, and every unlock is genuine', () => {
  const c = newCareer();
  for (let g = 0; g < 150; g++) {
    const rng = seededRng(400 + g);
    let m = newMatch({ mode: '1p', length: ['quick', 'standard', 'long'][g % 3], cards: g % 2 === 0 });
    const tracker = newTracker(0);
    while (m.step.type !== 'fulltime') {
      const s = m.step;
      const a = s.type === 'roll' ? { type: 'roll' } : s.type === 'halftime' ? { type: 'continue' } : { type: 'choose', value: cpuChoice({ ...m, cpuLevel: 'pro' }, rng) };
      const { state, events } = act(m, a, rng);
      track(tracker, m, events, state);
      m = state;
    }
    assert.ok(tracker.maxDeficit >= 0);
    const got = recordMatch(c, m, tracker, ctx());
    for (const id of got) assert.ok(ACHIEVEMENT_BY_ID[id].check(m, 0, tracker, ctx(), c), id);
    if (got.includes('hat-trick')) assert.ok(Object.values(m.teams[0].players).some(p => p.tries >= 3));
  }
  assert.equal(c.played, 150);
  assert.equal(c.won + c.lost + (c.drawn || 0), 150);
  assert.ok(c.won > 30 && c.lost > 30);
  assert.ok(Object.keys(c.achievements).length >= 8, `${Object.keys(c.achievements).length} achievements in 150 matches`);
});
