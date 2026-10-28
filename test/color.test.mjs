// Kit colours and patterns: readable ink, and patterned shirts drawn the
// same way as shapes (pitch tokens, score cards) and as CSS (chips, scenes).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { customKit, inkFor, isPatterned, kitBackground, kitShapes, PATTERN_NAMES, PATTERNS } from '../js/color.js';

const HEX = /^#[0-9a-f]{6}$/i;

// Approximate cover of the unit square by a list of shapes, by sampling.
function coverage(shapes) {
  let covered = 0;
  const n = 40;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const [x, y] = [(i + 0.5) / n, (j + 0.5) / n];
      if (shapes.some(s => s.type === 'rect' && x >= s.x && x <= s.x + s.w && y >= s.y && y <= s.y + s.h && s.opacity === 1)) covered++;
    }
  }
  return covered / (n * n);
}

test('ink: dark text on light kits, white on dark ones', () => {
  assert.equal(inkFor('#f4f4f0'), '#141414');
  assert.equal(inkFor('#f2c230'), '#141414');
  assert.equal(inkFor('#18191b'), '#ffffff');
  assert.equal(inkFor('#1d3577'), '#ffffff');
});

test('every pattern has a name, draws as shapes that fill the shirt, and as CSS', () => {
  for (const pattern of PATTERNS) {
    assert.ok(PATTERN_NAMES[pattern], pattern);
    const team = { color: '#1d3577', kit: customKit(pattern, '#1d3577') };
    const shapes = kitShapes(team);
    assert.ok(shapes.length >= 1);
    for (const s of shapes) {
      assert.ok(HEX.test(s.fill), `${pattern}: ${s.fill}`);
      assert.ok(s.opacity > 0 && s.opacity <= 1);
      if (s.type === 'rect') assert.ok(s.x >= 0 && s.y >= 0 && s.x + s.w <= 1 + 1e-9 && s.y + s.h <= 1 + 1e-9, pattern);
      else s.points.forEach(([x, y]) => assert.ok(x >= 0 && x <= 1 && y >= 0 && y <= 1, pattern));
    }
    // Solid rectangles cover the whole shirt (a sash and a tartan lie over a full base).
    assert.ok(coverage(shapes) > 0.999, `${pattern} covers the shirt`);
    const css = kitBackground(team);
    assert.equal(typeof css, 'string');
    if (pattern === 'plain') assert.equal(css, '#1d3577');
    else assert.match(css, /gradient\(/, pattern);
    assert.equal(isPatterned(team), pattern !== 'plain');
  }
});

test('hoops and stripes cycle through every colour; quarters use all four', () => {
  const leicester = { color: '#0f6b3a', kit: ['hoops', '#0f6b3a', '#c8102e', '#f4f4f0'] };
  const hoops = kitShapes(leicester);
  assert.deepEqual(hoops.slice(0, 3).map(s => s.fill), ['#0f6b3a', '#c8102e', '#f4f4f0']);
  assert.ok(hoops.every(s => s.w === 1), 'hoops run across');
  const zebre = kitShapes({ color: '#18191b', kit: ['stripes', '#18191b', '#f4f4f0'] });
  assert.ok(zebre.every(s => s.h === 1), 'stripes run down');
  assert.deepEqual(new Set(zebre.map(s => s.fill)), new Set(['#18191b', '#f4f4f0']));
  const quins = { color: '#c4166b', kit: ['quarters', '#c4166b', '#6ec1e4', '#5a3a22', '#9aa3ad'] };
  assert.equal(new Set(kitShapes(quins).map(s => s.fill)).size, 4);
  for (const c of quins.kit.slice(1)) assert.ok(kitBackground(quins).includes(c));
});

test('the soft wash keeps the main colour and mixes the others towards it', () => {
  const gloucester = { color: '#c8102e', kit: ['hoops', '#c8102e', '#f4f4f0'] };
  const wash = kitBackground(gloucester, 0.3);
  assert.match(wash, /color-mix\(in srgb, #f4f4f0 30%, #c8102e\)/);
  assert.ok(!/color-mix\(in srgb, #c8102e/.test(wash), 'the main colour is left alone');
});

test('custom kits: none for plain, white on dark and black on light, quarters and tartan in full', () => {
  assert.equal(customKit('plain', '#1d3577'), null);
  assert.equal(customKit(undefined, '#1d3577'), null);
  assert.deepEqual(customKit('hoops', '#1d3577'), ['hoops', '#1d3577', '#f4f4f0']);
  assert.deepEqual(customKit('stripes', '#e3b31d'), ['stripes', '#e3b31d', '#18191b']);
  assert.equal(customKit('quarters', '#0f7a44').length, 5);
  assert.equal(customKit('tartan', '#0f7a44').length, 4);
  // Sides without a kit, or with an unknown pattern, are plain.
  assert.equal(isPatterned({ color: '#123456' }), false);
  assert.equal(isPatterned({ color: '#123456', kit: ['zigzag', '#123456', '#ffffff'] }), false);
  assert.equal(kitBackground({ color: '#123456', kit: ['zigzag', '#123456', '#ffffff'] }), '#123456');
});
