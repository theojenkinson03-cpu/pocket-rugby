// Players: names, how commentary refers to them, ratings and Player of the
// Match, and every player's numbers adding up to the team's.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { act, emptyPlayer, migrate, newMatch, seededRng } from '../js/engine.js';
import { cpuChoice } from '../js/ai.js';
import { POSITIONS } from '../js/dice.js';
import { fullName, playerOfTheMatch, playerRatings, possessive, randomRoster, rating, statLine, surname, SURNAMES, who } from '../js/players.js';
import { choose, dice, roll, stateAt } from './helpers.mjs';

test('a roster is five different names in "A. Surname" form, from the side\'s pool', () => {
  for (const flavour of Object.keys(SURNAMES)) {
    for (let i = 0; i < 50; i++) {
      const roster = randomRoster(flavour, seededRng(i + 1));
      assert.deepEqual(Object.keys(roster), POSITIONS);
      const names = Object.values(roster);
      assert.equal(new Set(names.map(n => n.slice(3))).size, 5, `${flavour}: different surnames`);
      for (const n of names) assert.match(n, /^[A-Z]\. \S/);
    }
  }
  assert.equal(Object.keys(randomRoster('nonsense', seededRng(1))).length, 5, 'unknown flavours fall back');
});

test('names in commentary, with and without a roster', () => {
  const m = stateAt();
  m.teams[0].name = 'Ravens';
  m.teams[0].roster = { S: 'T. Harris', F: 'Jonny', C: 'A. B. Price', W: 'K. Lowe', B: 'M. Webb' };
  assert.equal(surname(m, 0, 'S'), 'Harris');
  assert.equal(surname(m, 0, 'F'), 'Jonny', 'a single name stays as it is');
  assert.equal(who(m, 0, 'W'), 'Lowe (Wing)');
  assert.equal(fullName(m, 0, 'B'), 'M. Webb');
  m.teams[1].name = 'Foxes';
  assert.equal(surname(m, 1, 'S'), null);
  assert.equal(who(m, 1, 'C'), 'the Foxes Centre');
  assert.equal(fullName(m, 1, 'C'), 'Foxes Centre');
});

test('ratings reward tries, breaks, tackles and turnovers, and errors cost', () => {
  const base = rating(emptyPlayer());
  assert.equal(base, 0);
  for (const key of ['tries', 'lineBreaks', 'carries', 'tackles', 'bigHits', 'turnovers', 'points']) {
    assert.ok(rating({ ...emptyPlayer(), [key]: 1 }) > 0, key);
  }
  assert.ok(rating({ ...emptyPlayer(), errors: 1 }) < 0);
  assert.ok(rating({ ...emptyPlayer(), tries: 1 }) > rating({ ...emptyPlayer(), tackles: 3 }), 'a try beats three tackles');
});

test('Player of the Match: the best rating, with a small lift for the winners', () => {
  const m = stateAt();
  m.winner = 0;
  m.teams[0].players.W.tries = 2;
  m.teams[1].players.F.tries = 2;
  m.teams[1].players.F.tackles = 1;
  // The loser's Forward rates a little higher, but the lift for winning decides it.
  assert.ok(rating(m.teams[1].players.F) > rating(m.teams[0].players.W));
  assert.deepEqual([playerOfTheMatch(m).team, playerOfTheMatch(m).pos], [0, 'W']);
  m.teams[1].players.F.tries = 4;
  assert.deepEqual([playerOfTheMatch(m).team, playerOfTheMatch(m).pos], [1, 'F'], 'a big enough game wins it from the losing side');
  assert.equal(playerRatings(m).length, 10);
  assert.ok(playerRatings(m).every((r, i, all) => i === 0 || all[i - 1].rating >= r.rating));
});

test('possessives and stat lines read naturally', () => {
  assert.equal(possessive('Ravens'), "Ravens'");
  assert.equal(possessive('Japan'), "Japan's");
  assert.equal(statLine({ ...emptyPlayer(), tries: 1, tackles: 2 }), '1 try · 2 tackles');
  assert.equal(statLine({ ...emptyPlayer(), tries: 2, lineBreaks: 1, points: 4, tackles: 1, carries: 9 }), '2 tries · 1 line break · 4 kicking points · 1 tackle');
  assert.equal(statLine(emptyPlayer()), 'A quiet day');
});

test('every player\'s numbers add up to the team\'s, over hundreds of matches', () => {
  const sum = (t, key) => POSITIONS.reduce((n, p) => n + t.players[p][key], 0);
  for (let g = 0; g < 250; g++) {
    const rng = seededRng(900 + g);
    let m = newMatch({ mode: '2p', length: ['quick', 'standard', 'long'][g % 3], cards: g % 2 === 0 });
    while (m.step.type !== 'fulltime') {
      const s = m.step;
      const a = s.type === 'roll' ? { type: 'roll' } : s.type === 'halftime' ? { type: 'continue' } : { type: 'choose', value: cpuChoice({ ...m, cpuLevel: 'pro' }, rng) };
      m = act(m, a, rng).state;
    }
    m.teams.forEach((t, i) => {
      const s = t.stats;
      const label = `match ${g} team ${i}`;
      assert.equal(sum(t, 'tries'), s.tries, `${label} tries`);
      assert.equal(sum(t, 'carries'), s.runs, `${label} carries`);
      assert.equal(sum(t, 'lineBreaks'), s.lineBreaks, `${label} line breaks`);
      assert.equal(sum(t, 'tackles'), s.tackles, `${label} tackles`);
      assert.equal(sum(t, 'bigHits'), s.bigHits, `${label} big hits`);
      assert.equal(sum(t, 'turnovers'), s.turnoversWon, `${label} turnovers`);
      assert.equal(sum(t, 'errors'), s.errors, `${label} errors`);
      assert.equal(sum(t, 'points'), 2 * s.conversions + 3 * (s.penaltyGoals + s.dropGoals), `${label} kicking points`);
      assert.equal(t.players.S.points, 0, 'the Scrum Half never kicks');
      assert.equal(sum(t, 'tries') * 5 + sum(t, 'points'), t.score, `${label} score`);
    });
    const potm = playerOfTheMatch(m);
    assert.ok(potm && POSITIONS.includes(potm.pos));
  }
});

test('a match saved before players and cards existed still loads and plays', () => {
  const old = newMatch({ mode: '1p' });
  old.version = 1;
  for (const key of ['cards', 'deal', 'cpuPersonality']) delete old[key];
  for (const t of old.teams) for (const key of ['roster', 'card', 'cardUses', 'players']) delete t[key];
  const m = migrate(old);
  assert.equal(m.version, 2);
  assert.equal(m.cards, false);
  assert.deepEqual(m.teams[0].players.S, emptyPlayer());
  assert.deepEqual(m.teams[1].cardUses, { tryRerolls: 0, ownFeedPenalty: 0 });
  assert.equal(m.cpuPersonality, 'balanced');
  assert.equal(migrate(m), m, 'up-to-date saves are left alone');
  let state = m;
  const rng = seededRng(4);
  for (let i = 0; i < 200 && state.step.type !== 'fulltime'; i++) {
    const s = state.step;
    const a = s.type === 'roll' ? { type: 'roll' } : s.type === 'halftime' ? { type: 'continue' } : { type: 'choose', value: s.options[0] };
    state = act(state, a, rng).state;
  }
  assert.ok(state.seq > 0);
});

test('each number goes to the player who earned it', () => {
  // A Wing break and try: the carry, the break and the try are the Wing's;
  // the missed tackle is nobody's.
  let m = stateAt({ carrier: 'W' });
  m = roll(m, dice(0)).state; // Wing Hit Up 4
  m = roll(m, dice(0, 0)).state; // 1 + 1: through
  const tryRoll = roll(m, dice(0));
  const w = tryRoll.state.teams[0].players.W;
  assert.deepEqual([w.carries, w.lineBreaks, w.tries], [1, 1, 1]);
  // The conversion is the Back's.
  let c = roll(tryRoll.state, dice(0)).state; // range 1
  c = roll(c, dice(0)).state;
  assert.equal(c.teams[0].players.B.points, 2);

  // A tackle goes to the defender's opposite number.
  const tackled = roll(roll(stateAt({ carrier: 'C' }), dice(1)).state, dice(4, 4)).state;
  assert.equal(tackled.teams[1].players.C.tackles, 1);
  assert.equal(tackled.teams[1].players.F.tackles, 0);
  // Big hits too.
  const hit = roll(roll(stateAt({ carrier: 'F' }), dice(3)).state, dice(1, 5)).state;
  assert.deepEqual([hit.teams[1].players.F.tackles, hit.teams[1].players.F.bigHits], [1, 1]);

  // An interception is the opposite number's turnover, and the passer's error.
  const pick = roll(stateAt({ carrier: 'C' }), dice(5)).state;
  assert.equal(pick.teams[1].players.C.turnovers, 1);
  assert.equal(pick.teams[0].players.C.errors, 1);
  // A ruck won is the Forward's.
  const ruck = roll(stateAt({ step: { type: 'roll', purpose: 'ruck', dice: ['K'], team: 1 } }), dice(5)).state;
  assert.equal(ruck.teams[1].players.F.turnovers, 1);

  // A drop goal is the kicker's, not the Back's.
  let d = stateAt({ step: { type: 'choose', purpose: 'drop', team: 0, range: 1, from: 'C', options: ['kick', 'pass'] }, carrier: 'C' });
  d = choose(d, 'kick').state;
  d = roll(d, dice(0)).state;
  assert.deepEqual([d.teams[0].players.C.points, d.teams[0].players.B.points], [3, 0]);
});
