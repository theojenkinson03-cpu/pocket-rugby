// Dream Team: the player pool, packs, the squad, matches and the ladder.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { act, newMatch, seededRng } from '../js/engine.js';
import { cpuChoice } from '../js/ai.js';
import { POSITIONS } from '../js/dice.js';
import { SQUADS } from '../js/squads.js';
import {
  autoSquad, canSell, cardById, dreamMatchOptions, migrateDream, newDream, opponentFor, openPack, PACKS, packPlayers, placeCard,
  playerById, playerOf, playerPool, recordDream, REWARDS, SELL_PRICE, sellCard, squadReady, STARTING_COINS, teamRating, TIERS,
} from '../js/dream.js';

const realNames = new Set(Object.values(SQUADS).flatMap(s => POSITIONS.flatMap(p => s[p])));

test('the pool: every real player once, rated, in all four tiers', () => {
  const pool = playerPool();
  assert.ok(pool.length > 700, `${pool.length} players`);
  assert.equal(new Set(pool.map(p => p.name)).size, pool.length, 'each player once');
  assert.ok(pool.every(p => realNames.has(p.name)), 'real players only');
  for (const tier of TIERS) assert.ok(pool.some(p => p.tier === tier), tier);
  assert.ok(pool.every((p, i) => i === 0 || pool[i - 1].rating >= p.rating), 'best first');
  assert.equal(playerById(pool[0].pid), pool[0]);
});

test('a new club: coins, and a starter squad of eight with every position covered', () => {
  const s = newDream({ seed: 7 });
  assert.equal(s.coins, STARTING_COINS);
  assert.equal(s.cards.length, 8);
  for (const pos of POSITIONS) assert.ok(s.cards.some(c => playerById(c.pid).pos === pos), pos);
  assert.ok(s.cards.every(c => ['bronze', 'silver'].includes(playerById(c.pid).tier)));
  assert.ok(squadReady(s));
  assert.equal(s.squad.bench.length, 3);
  for (const pos of POSITIONS) assert.equal(playerOf(s, s.squad.start[pos]).pos, pos, 'everyone in position');
  assert.deepEqual(newDream({ seed: 7 }).cards, s.cards, 'the same seed, the same squad');
  assert.equal(s.division, 10);
});

test('packs: the cost, the count, the guarantee, best last', () => {
  for (const pack of PACKS) {
    for (let seed = 0; seed < 40; seed++) {
      const pids = packPlayers(pack.id, seededRng(seed));
      const tiers = pids.map(pid => playerById(pid).tier);
      assert.equal(pids.length, pack.count);
      assert.ok(tiers.some(t => TIERS.indexOf(t) >= TIERS.indexOf(pack.least)), `${pack.id}: at least one ${pack.least}`);
      assert.ok(tiers.every(t => pack.odds[t] > 0 || t === pack.least), `${pack.id}: only tiers it can hold`);
      const ratings = pids.map(pid => playerById(pid).rating);
      assert.deepEqual(ratings, [...ratings].sort((a, b) => a - b), 'the best is revealed last');
    }
  }
  const s = newDream({ seed: 1 });
  assert.throws(() => openPack(s, 'elite'), /not enough coins/);
  s.coins = 1000;
  const cards = openPack(s, 'silver');
  assert.equal(s.coins, 100);
  assert.equal(cards.length, 3);
  assert.equal(s.cards.length, 11);
  assert.equal(s.packs, 1);
});

test('the squad: place and swap, the best side, the team rating, out of position', () => {
  const s = newDream({ seed: 3 });
  const benchId = s.squad.bench[0];
  const startF = s.squad.start.F;
  placeCard(s, 'start:F', benchId);
  assert.equal(s.squad.start.F, benchId);
  assert.equal(s.squad.bench[0], startF, 'the two swap');
  // Out of position costs a point on the team rating.
  const r = s.squad.start;
  const fit = teamRating(autoSquad(s));
  const sOut = JSON.parse(JSON.stringify(s));
  [sOut.squad.start.S, sOut.squad.start.F] = [s.squad.start.F, s.squad.start.S];
  assert.ok(teamRating(sOut) <= fit);
  const opts = dreamMatchOptions(sOut);
  assert.deepEqual(opts.teams[0].offPos, { S: 1, F: 1 });
  assert.ok(r);
});

test('letting a player go: coins by tier, never someone in the side', () => {
  const s = newDream({ seed: 5 });
  s.coins = 5000;
  openPack(s, 'gold');
  autoSquad(s);
  const spare = s.cards.find(c => canSell(s, c.id));
  const inSide = s.squad.start.F;
  assert.throws(() => sellCard(s, inSide), /in the side/);
  const before = s.coins;
  const got = sellCard(s, spare.id);
  assert.equal(got, SELL_PRICE[playerById(spare.pid).tier]);
  assert.equal(s.coins, before + got);
  assert.equal(cardById(s, spare.id), null);
});

test('opponents get stronger, and the CPU harder, as you climb', () => {
  const s = newDream({ seed: 9 });
  const at = div => {
    s.division = div;
    return opponentFor(s).rating;
  };
  assert.ok(at(1) > at(5) && at(5) > at(10), `${at(10)} ${at(5)} ${at(1)}`);
  s.division = 10;
  const opts = dreamMatchOptions(s);
  assert.equal(opts.cpuLevel, 'rookie');
  assert.deepEqual(Object.keys(opts.teams[0].ratings), POSITIONS);
  assert.deepEqual(Object.keys(opts.teams[1].ratings), POSITIONS);
  assert.ok(opts.teams[0].bench.every(b => Number.isFinite(b.rating)));
  s.division = 2;
  assert.equal(dreamMatchOptions(s).cpuLevel, 'expert');
  // A real match plays out with both sides rated.
  const rng = seededRng(4);
  let m = newMatch(dreamMatchOptions(s));
  while (m.step.type !== 'fulltime') {
    const a = m.step.type === 'roll' ? { type: 'roll' } : m.step.type === 'halftime' ? { type: 'continue' } : { type: 'choose', value: cpuChoice(m, rng) };
    m = act(m, a, rng).state;
  }
  assert.ok(m.teams.every(t => t.ratings));
});

test('results: coins, up a division for a win, a title at the top', () => {
  const s = newDream({ seed: 2 });
  const match = (winner, tries = 2) => ({ winner, teams: [{ score: 20, stats: { tries } }, { score: 10, stats: { tries: 1 } }] });
  const won = recordDream(s, match(0), 'Chile');
  assert.deepEqual([won.result, won.promoted, s.division], ['win', true, 9]);
  assert.equal(won.coins, REWARDS.win + REWARDS.perTry * 2);
  const lost = recordDream(s, match(1, 0), 'Fiji');
  assert.deepEqual([lost.result, s.division, lost.coins], ['loss', 9, REWARDS.loss + REWARDS.perDivision]);
  recordDream(s, match(null, 0), 'Fiji');
  assert.deepEqual([s.played, s.won, s.drawn, s.lost], [3, 1, 1, 1]);
  s.division = 1;
  const top = recordDream(s, match(0, 0), 'New Zealand');
  assert.deepEqual([top.title, s.division, s.titles], [true, 1, 1]);
  assert.equal(top.coins, REWARDS.win + REWARDS.perDivision * 9 + REWARDS.title);
  assert.equal(s.best, 9);
  assert.equal(s.last.opponent, 'New Zealand');
});

test('a saved club with a player no longer in the game picks a new side', () => {
  const s = newDream({ seed: 11 });
  const gone = s.squad.start.C;
  cardById(s, gone).pid = 'nowhere/Nobody';
  migrateDream(s);
  assert.equal(cardById(s, gone), null);
  assert.ok(squadReady(s));
});
