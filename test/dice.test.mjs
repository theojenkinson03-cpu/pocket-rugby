// The dice themselves: every face is well formed and matches the rules sheet.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { DICE, PLAYERS, POSITIONS } from '../js/dice.js';
import { RULES } from './helpers.mjs';

test('there are eight dice and each has six faces', () => {
  assert.deepEqual(Object.keys(DICE).sort(), ['B', 'C', 'D', 'F', 'K', 'R', 'S', 'W']);
  for (const [id, die] of Object.entries(DICE)) assert.equal(die.faces.length, 6, `${id} has six faces`);
});

test('the five positions are Scrum Half, Forward, Centre, Wing and Back', () => {
  assert.deepEqual(POSITIONS, ['S', 'F', 'C', 'W', 'B']);
  assert.deepEqual(POSITIONS.map(p => PLAYERS[p].name), ['Scrum Half', 'Forward', 'Centre', 'Wing', 'Back']);
});

test('each outside player has exactly the one big move the rules name', () => {
  for (const pos of ['F', 'C', 'W', 'B']) {
    const specials = DICE[pos].faces.filter(f => f.special);
    assert.equal(specials.length, 1, `${pos} has one big move`);
    const [label, value] = RULES.specials[pos];
    assert.equal(specials[0].label, label);
    assert.equal(specials[0].value, value);
  }
  assert.equal(DICE.S.faces.filter(f => f.special).length, 0, 'the Scrum Half has no big move');
});

test('big moves are harder to stop than any Hit Up', () => {
  for (const pos of POSITIONS) {
    const hitUps = DICE[pos].faces.filter(f => f.kind === 'run' && !f.special).map(f => f.value);
    const special = DICE[pos].faces.find(f => f.special);
    if (special) assert.ok(special.value > Math.max(...hitUps), `${pos}'s big move beats its Hit Ups`);
    for (const v of hitUps) assert.ok(v >= 3 && v <= 5, `${pos} Hit Up ${v} is between 3 and 5`);
  }
});

test('only the Centre and Back can drop goal', () => {
  for (const pos of POSITIONS) {
    const hasDrop = DICE[pos].faces.some(f => f.kind === 'drop');
    assert.equal(hasDrop, RULES.dropGoalKickers.includes(pos), `${pos} drop goal face`);
  }
});

test('the Scrum Half passes to named players, never to itself', () => {
  const named = DICE.S.faces.filter(f => f.kind === 'pass');
  assert.ok(named.length >= 4);
  for (const f of named) {
    assert.ok(f.to, 'every Scrum Half pass names a receiver');
    assert.ok(['F', 'C', 'W', 'B'].includes(f.to));
  }
  assert.deepEqual([...new Set(named.map(f => f.to))].sort(), ['B', 'C', 'F', 'W'], 'every outside player can be reached');
});

test('outside players pass by choice, and every face kind is known', () => {
  const kinds = new Set(['run', 'pass', 'drop', 'error', 'intercept']);
  for (const pos of ['F', 'C', 'W', 'B']) {
    assert.ok(DICE[pos].faces.some(f => f.kind === 'pass' && !f.to), `${pos} has a free pass`);
    for (const f of DICE[pos].faces) {
      assert.ok(kinds.has(f.kind), `${pos} face kind ${f.kind}`);
      if (f.kind === 'error') assert.ok(['knockon', 'touch'].includes(f.error));
    }
  }
});

test('the brown die has tackle values and one Big Hit', () => {
  const faces = DICE.D.faces;
  assert.equal(faces.filter(f => f.kind === 'bighit').length, 1);
  assert.equal(faces.find(f => f.kind === 'bighit').value, 5, 'Big Hit 5, as printed');
  assert.ok(faces.some(f => f.kind === 'tackle' && f.value === 3), 'Tackle 3, as printed');
  for (const f of faces) assert.ok(Number.isInteger(f.value) && f.value >= 1 && f.value <= 5);
});

test('the black die covers try, no try, video ref, ruck win and one yellow dot', () => {
  const labels = DICE.K.faces.map(f => f.label);
  for (const l of ['TRY', 'NO TRY', 'VIDEO REF', 'RUCK WIN']) assert.ok(labels.includes(l), `has ${l}`);
  assert.equal(DICE.K.faces.filter(f => f.card).length, 1, 'one yellow dot');
  assert.deepEqual(DICE.K.faces.map(f => f.kick).sort(), [1, 2, 3, 4, 5, 6], 'kick distances 1 to 6');
  assert.equal(DICE.K.faces.find(f => f.label === 'NO TRY').kick, 5, '"5 NO TRY", as printed');
  assert.ok(DICE.K.faces.some(f => f.label === 'TRY' && f.kick === 2), '"2 TRY", as printed');
});

test('the white die settles scrums and lineouts and awards penalties both ways', () => {
  const faces = DICE.R.faces;
  assert.equal(faces.filter(f => f.penalty === 'won').length, 1);
  assert.equal(faces.filter(f => f.penalty === 'against').length, 1);
  const plays = faces.filter(f => !f.penalty);
  for (const f of plays) {
    assert.ok(['win', 'lose', 'reset'].includes(f.scrum));
    assert.ok(['win', 'lose', 'notstraight'].includes(f.lineout));
    assert.equal(f.scrum === 'reset', f.lineout === 'notstraight', 'reset and not straight share a face');
  }
  for (const piece of ['scrum', 'lineout']) {
    assert.ok(plays.some(f => f[piece] === 'win'), `${piece} can be won`);
    assert.ok(plays.some(f => f[piece] === 'lose'), `${piece} can be lost`);
  }
});

test('every pass a Scrum Half can make, and every error, keeps the game moving', () => {
  // A die with no way to lose the ball would let a team keep it forever.
  for (const pos of ['F', 'C', 'W', 'B']) {
    assert.ok(DICE[pos].faces.some(f => f.kind === 'error' || f.kind === 'intercept'), `${pos} can lose the ball`);
  }
});
