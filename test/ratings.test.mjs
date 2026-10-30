// Player ratings: who gets what, and what they do to the dice.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { act, ELITE, intensityParts, kickOdds, kickParts, kickReach, NEUTRAL_RATING, newMatch, POOR, runRating } from '../js/engine.js';
import { DICE, POSITIONS } from '../js/dice.js';
import { playerRatingFor, rateSquad, realSquad, STARS, tierOf } from '../js/squads.js';
import { createCup, kits, matchOptions } from '../js/tournament.js';
import { ratingsEdge } from '../js/winprob.js';
import { duelOf, runTerms } from '../js/duel.js';
import { dieBadges } from '../js/guide.js';
import { dice, faceOf, roll, stateAt } from './helpers.mjs';

const rated = (ratings, opts = {}) => {
  const m = stateAt(opts);
  m.teams[0].ratings = ratings;
  return m;
};
const all = r => Object.fromEntries(POSITIONS.map(p => [p, r]));

test('the bands: 88 and up +1 on runs, under 70 −1, and the Fly Half\'s boot', () => {
  assert.deepEqual([97, 88, 87, 70, 69, 50].map(runRating), [1, 1, 0, 0, -1, -1]);
  assert.deepEqual([60, 69, 70, 77, 78, 87, 88].map(r => kickReach(r)), [
    { cap: 4, star: 0 }, { cap: 4, star: 0 }, { cap: 5, star: 0 }, { cap: 5, star: 0 }, { cap: 6, star: 0 }, { cap: 6, star: 0 }, { cap: 6, star: 1 },
  ]);
  assert.equal(runRating(NEUTRAL_RATING), 0);
  assert.deepEqual(kickReach(NEUTRAL_RATING), { cap: 6, star: 0 });
  assert.deepEqual([ELITE, POOR], [88, 70]);
});

test('a run carries its player\'s rating; unrated sides are untouched', () => {
  const face = DICE.F.faces[0];
  assert.equal(intensityParts(stateAt(), 0, 'F', 5, face).intensity, 5);
  assert.equal(intensityParts(rated(all(92)), 0, 'F', 5, face).intensity, 6);
  assert.equal(intensityParts(rated(all(60)), 0, 'F', 5, face).intensity, 4);
  assert.equal(intensityParts(rated({ ...all(80), F: 60 }), 0, 'C', 5, face).intensity, 5, 'only the player rolling');
  // Never below 1.
  assert.equal(intensityParts(rated(all(60), { injuries: [{ S: 3 }, {}] }), 0, 'S', 4, DICE.S.faces[0]).intensity, 1);
  // The roll itself: the run event, and the tackle needs the higher number.
  const m = rated(all(91), { carrier: 'F' });
  const { state, events } = roll(m, dice(faceOf('F', f => f.kind === 'run' && f.value === 5)));
  assert.deepEqual([events.find(e => e.type === 'run').rating, state.step.intensity], [1, 6]);
  const [first] = runTerms(m, 0, 'F', DICE.F.faces[0]).terms.slice(-1);
  assert.deepEqual(first, { n: '+1', label: 'rated 91' });
});

test('a short boot: every face past its reach lands where the boot does', () => {
  const kickAt = (r, range, face) => {
    const m = rated({ ...all(80), B: r }, { step: { type: 'roll', purpose: 'kick', dice: ['K'], team: 0, kick: 'penalty', range, kicker: 'B' } });
    return roll(m, dice(face)).events.find(e => e.type === 'kick');
  };
  const six = faceOf('K', f => f.kick === 6);
  assert.deepEqual([kickAt(65, 5, six).distance, kickAt(65, 5, six).good], [4, false], 'rated 65: 40 m at most');
  assert.deepEqual([kickAt(75, 5, six).distance, kickAt(75, 5, six).good], [5, true], 'rated 75: 50 m');
  assert.equal(kickAt(85, 5, six).distance, 6);
  assert.equal(kickAt(90, 5, faceOf('K', f => f.kick === 4)).distance, 5, 'rated 90: +10 m');
  // The odds agree, every range.
  for (const r of [60, 72, 80, 92]) {
    const m = rated({ ...all(80), B: r });
    const { cap, star } = kickReach(r);
    for (let range = 1; range <= 6; range++) {
      assert.equal(kickOdds(m, 0, 'penalty', range), DICE.K.faces.filter(f => Math.min(f.kick, cap) + star >= range).length / 6);
    }
  }
  // The duel shows the boot's reach; the badge warns before the roll.
  const before = rated({ ...all(80), B: 65 }, { step: { type: 'roll', purpose: 'kick', dice: ['K'], team: 0, kick: 'penalty', range: 3, kicker: 'B' } });
  const after = act(before, { type: 'roll' }, dice(six));
  const [col] = duelOf(before, after.state, after.events).columns;
  assert.deepEqual(col.terms.map(t => t.n), ['60 m', '−20 m']);
  assert.equal(col.total, '40 m');
  assert.deepEqual(dieBadges(before)[0].kinds[0], 'reach');
  assert.equal(kickParts(before, 1, 'penalty').cap, 6, 'the other side is unrated');
});

test('a replacement brings their own rating on', () => {
  const m = newMatch({ mode: '2p', bench: true, teams: [{ name: 'A', color: '#111111', roster: { S: 'a', F: 'b', C: 'c', W: 'd', B: 'e' }, ratings: all(85), bench: [{ name: 'Big Sub', pos: 'F', rating: 93 }] }, { name: 'B', color: '#eeeeee' }] });
  m.attacker = 0;
  m.teams[0].injuries.F = 1;
  m.step = { type: 'choose', purpose: 'bench', team: 0, when: 'injury', pos: 'F', options: ['0>F', 'stay'], next: { type: 'roll', purpose: 'attack', dice: ['S'], team: 0 } };
  const { state } = act(m, { type: 'choose', value: '0>F' });
  assert.equal(state.teams[0].ratings.F, 93);
  assert.equal(state.teams[0].ratings.C, 85);
});

test('ratings for real squads: the side\'s strength, first choices, stars, made-up players', () => {
  const nzl = realSquad('nzl', 'kiwi', 5);
  const chi = realSquad('chi', 'latin', 1);
  assert.ok(nzl.every(p => Number.isInteger(p.rating) && p.rating >= 50 && p.rating <= 99));
  const avg = s => s.reduce((n, p) => n + p.rating, 0) / s.length;
  assert.ok(avg(nzl) > avg(chi) + 12, `${avg(nzl)} v ${avg(chi)}`);
  for (const pos of POSITIONS) {
    const at = nzl.filter(p => p.pos === pos);
    assert.ok(at[0].rating >= at.at(-1).rating, `${pos}: the first choice is rated at least the last`);
  }
  const star = nzl.find(p => STARS.has(p.name));
  assert.ok(star.rating >= ELITE - 1, `${star.name} ${star.rating}`);
  assert.deepEqual(realSquad('nzl', 'kiwi', 5), nzl, 'the same every time');
  assert.ok(playerRatingFor('X. Made', 0, 3, false) < playerRatingFor('X. Made', 0, 3, true));
  // A renamed player is rated as made up; real ones keep theirs.
  const renamed = rateSquad([{ name: 'Z. Nobody', pos: 'S' }, ...nzl.slice(1).map(({ name, pos }) => ({ name, pos }))], 'nzl', 'kiwi', 5);
  assert.equal(renamed[1].rating, nzl[1].rating);
  assert.ok(renamed[0].rating < nzl[0].rating);
  assert.deepEqual(['bronze', 'silver', 'gold', 'elite', 'none'], [69, 70, 80, 88, undefined].map(tierOf));
});

test('a cup match takes the field with its players\' ratings; background fixtures without', () => {
  const t = createCup({ userTeam: 'nzl', length: 'quick', cards: false, bench: true, seed: 3 });
  const f = t.fixtures.find(x => x.home === 'nzl' || x.away === 'nzl');
  const opts = matchOptions(t, f);
  const me = t.teams.find(x => x.id === 'nzl');
  for (const pos of POSITIONS) assert.equal(opts.teams[0].ratings[pos], me.squad.find(p => p.name === opts.teams[0].roster[pos]).rating);
  assert.ok(opts.teams[0].bench.every(b => Number.isFinite(b.rating)));
  assert.ok(kits(t, f).every(k => k.ratings));
  const m = newMatch(opts);
  assert.ok(ratingsEdge(m, 0) > ratingsEdge(m, 1), 'New Zealand rate higher than their pool opponents');
});

test('the win meter counts ratings: better players, better odds', () => {
  const m = stateAt();
  assert.equal(ratingsEdge(m, 0), 0);
  m.teams[0].ratings = all(90);
  m.teams[1].ratings = all(65);
  assert.ok(ratingsEdge(m, 0) > 0.4 && ratingsEdge(m, 1) < -0.4);
});
