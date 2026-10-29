// Players: names, how commentary refers to them, ratings and Player of the
// Match, and every player's numbers adding up to the team's.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { act, carryMetres, emptyPlayer, migrate, newMatch, seededRng, TRY_RUN_IN, VERSION } from '../js/engine.js';
import { cpuChoice } from '../js/ai.js';
import { POSITIONS } from '../js/dice.js';
import { fullName, playerOfTheMatch, playerRatings, possessive, randomBench, randomRoster, rating, statLine, surname, SURNAMES, who } from '../js/players.js';
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
  assert.equal(who(m, 0, 'W'), 'Lowe (Outside Back)');
  assert.equal(fullName(m, 0, 'B'), 'M. Webb');
  m.teams[1].name = 'Foxes';
  assert.equal(surname(m, 1, 'S'), null);
  assert.equal(who(m, 1, 'C'), 'the Foxes Centre');
  assert.equal(fullName(m, 1, 'C'), 'Foxes Centre');
});

test('ratings reward tries, breaks, tackles and turnovers, and errors cost', () => {
  const base = rating(emptyPlayer());
  assert.equal(base, 0);
  for (const key of ['tries', 'lineBreaks', 'carries', 'metres', 'tackles', 'bigHits', 'turnovers', 'passes', 'points']) {
    assert.ok(rating({ ...emptyPlayer(), [key]: 1 }) > 0, key);
  }
  assert.ok(rating({ ...emptyPlayer(), errors: 1 }) < 0);
  assert.ok(rating({ ...emptyPlayer(), missed: 1 }) < 0);
  assert.equal(rating({ ...emptyPlayer(), metres: 10 }), rating({ ...emptyPlayer(), tackles: 1 }), 'every 10 m is worth a tackle');
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
  assert.equal(statLine({ ...emptyPlayer(), tries: 1, metres: 42, carries: 6 }), '1 try · 42 m · 6 carries');
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
      assert.equal(sum(t, 'metres'), s.metres, `${label} metres`);
      assert.equal(sum(t, 'missed'), s.missedTackles, `${label} missed tackles`);
      assert.ok(s.metres >= s.lineBreaks * 15 + s.tries * TRY_RUN_IN, `${label}: every line break makes 15 m or more, every try 5 more`);
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
  assert.equal(m.version, VERSION);
  assert.equal(m.cards, false);
  assert.deepEqual(m.teams[0].players.S, emptyPlayer());
  assert.deepEqual(m.teams[1].cardUses, { tryRerolls: 0, ownFeedPenalty: 0, theirFeedPenalty: 0 });
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

test('run metres: each position\'s usual gain when tackled, a long way on a line break, and the run-in', () => {
  // Tackled: the usual gain, 1 m less for each point the tackle won by after the first.
  assert.deepEqual([[5, 5], [5, 6], [5, 7], [5, 9], [4, 8]].map(([i, t]) => carryMetres('tackle', i, t, 'W')), [6, 6, 5, 3, 3]);
  assert.deepEqual(['S', 'F', 'C', 'W', 'B'].map(p => carryMetres('tackle', 5, 5, p)), [3, 2, 4, 6, 4]);
  assert.equal(carryMetres('tackle', 4, 10, 'F'), 0, 'never below 0');
  // A line break: by position, 3 m more a point short.
  assert.deepEqual(['S', 'F', 'C', 'W', 'B'].map(p => carryMetres('break', 5, 4, p)), [23, 15, 28, 38, 28]);
  assert.equal(carryMetres('break', 8, 2, 'W'), 53);
  assert.equal(carryMetres('bighit', 5, 6, 'W'), 0, 'a Big Hit stops the carry dead');
  assert.equal(carryMetres('ruck', 4, 5, 'F'), 0);
  assert.equal(TRY_RUN_IN, 5);

  // A Wing's Hit Up 4 tackled with 2 + 3: the usual 6 m.
  let m = roll(stateAt({ carrier: 'W' }), dice(0)).state;
  const tackled = roll(m, dice(1, 2));
  assert.equal(tackled.events.find(e => e.type === 'tackle').metres, 6);
  assert.deepEqual([tackled.state.teams[0].players.W.metres, tackled.state.teams[0].stats.metres, tackled.state.gained], [6, 6, 6]);
  // The same Hit Up through a 1 + 1 tackle: a line break of 41 m, then the try's 5.
  const broke = roll(m, dice(0, 0));
  assert.equal(broke.events.find(e => e.type === 'lineBreak').metres, 41);
  assert.equal(broke.state.teams[1].players.W.missed, 1, 'the missed tackle is the opposite number\'s');
  const scored = roll(broke.state, dice(0));
  assert.deepEqual([scored.state.teams[0].players.W.metres, scored.events.find(e => e.type === 'try').metres], [46, 5]);
  // A Big Hit on the second die: no ground.
  assert.equal(roll(m, dice(2, 5)).events.find(e => e.type === 'tackle').metres, 0);
  // Passes: the Scrum Half's named pass, and a chosen one.
  const sh = roll(stateAt({ carrier: 'S' }), dice(1));
  assert.equal(sh.state.teams[0].players.S.passes, 1);
  const open = roll(stateAt({ carrier: 'W' }), dice(3)).state;
  assert.equal(choose(open, 'C').state.teams[0].players.W.passes, 1);
  // A new possession starts back at the gain line.
  assert.equal(roll(stateAt({ carrier: 'C', step: undefined }), dice(5)).state.gained, 0, 'an interception starts a new possession');
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

test('a made-up bench: a Forward, a Centre and an Outside Back, none sharing a surname with the five', () => {
  const rng = seededRng(12);
  for (let i = 0; i < 200; i++) {
    const roster = randomRoster('welsh', rng);
    const bench = randomBench(roster, 'welsh', rng);
    assert.deepEqual(bench.map(b => b.pos), ['F', 'C', 'W']);
    const surnames = [...Object.values(roster), ...bench.map(b => b.name)].map(n => n.replace(/^[A-Z]\.\s*/, ''));
    assert.equal(new Set(surnames).size, 8, surnames.join(', '));
  }
});

test('everyone who played is rated: a replacement and the player they replaced both count', () => {
  const m = newMatch({ mode: '2p', bench: true, teams: [{ name: 'A', color: '#111111', roster: randomRoster(), bench: [{ name: 'R. Sub', pos: 'F' }] }, { name: 'B', color: '#eeeeee', roster: randomRoster() }] });
  m.teams[0].injuries.F = 1;
  m.attacker = 0;
  m.teams[0].players.F.tries = 2;
  m.step = { type: 'choose', purpose: 'bench', team: 0, when: 'injury', pos: 'F', options: ['0>F', 'stay'], next: { type: 'roll', purpose: 'attack', dice: ['S'], team: 0 } };
  const after = act(m, { type: 'choose', value: '0>F' }).state;
  after.teams[0].players.F.tackles = 3;
  const rows = playerRatings(after).filter(r => r.team === 0);
  assert.equal(rows.length, 6, 'five on the field and one off');
  assert.equal(rows.find(r => r.name === m.teams[0].roster.F).stats.tries, 2);
  assert.equal(rows.find(r => r.name === 'R. Sub').stats.tackles, 3);
  assert.deepEqual(after.teams[0].starters, m.teams[0].roster, 'the five who started, for a rematch');
});
