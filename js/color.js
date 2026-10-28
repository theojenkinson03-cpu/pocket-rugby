// Picks readable text for a kit colour, and draws patterned kits.

export function inkFor(hex) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [n >> 16, (n >> 8) & 255, n & 255].map(v => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.32 ? '#141414' : '#ffffff';
}

// A kit is [pattern, ...colours], the first colour the shirt's main one.
// Hoops and stripes cycle through the colours; halves and quarters split the
// shirt; a sash crosses it corner to corner; a band goes across the chest;
// tartan checks it. A side with no kit, or a plain one, is its colour.
export const PATTERNS = ['plain', 'hoops', 'stripes', 'halves', 'quarters', 'sash', 'band', 'tartan'];
export const PATTERN_NAMES = { plain: 'Plain', hoops: 'Hoops', stripes: 'Stripes', halves: 'Halves', quarters: 'Quarters', sash: 'Sash', band: 'Band', tartan: 'Tartan' };

const HOOPS = 6;
const STRIPES = 7;

function parts(team) {
  const [pattern = 'plain', ...colors] = team.kit || [];
  const known = PATTERNS.includes(pattern) ? pattern : 'plain';
  return { pattern: known, colors: colors.length ? colors : [team.color] };
}

export const isPatterned = team => parts(team).pattern !== 'plain' && parts(team).colors.length > 1;

// A kit for a side the player made up: the main colour with white (or black
// on a light shirt) as the second.
export function customKit(pattern, color) {
  if (!pattern || pattern === 'plain') return null;
  const second = inkFor(color) === '#ffffff' ? '#f4f4f0' : '#18191b';
  if (pattern === 'quarters') return [pattern, color, second, color, second];
  if (pattern === 'tartan') return [pattern, color, '#18191b', second];
  return [pattern, color, second];
}

// The shirt as shapes on a 1×1 square: rectangles and polygons, each with a
// fill and an optional opacity. Pitch tokens and drawn score cards use these.
export function kitShapes(team) {
  const { pattern, colors } = parts(team);
  const [a, b = a, c = b, d = a] = colors;
  const rect = (x, y, w, h, fill, opacity = 1) => ({ type: 'rect', x, y, w, h, fill, opacity });
  const base = rect(0, 0, 1, 1, a);
  switch (pattern) {
    case 'hoops': return Array.from({ length: HOOPS }, (_, i) => rect(0, i / HOOPS, 1, 1 / HOOPS, colors[i % colors.length]));
    case 'stripes': return Array.from({ length: STRIPES }, (_, i) => rect(i / STRIPES, 0, 1 / STRIPES, 1, colors[i % colors.length]));
    case 'halves': return [rect(0, 0, 0.5, 1, a), rect(0.5, 0, 0.5, 1, b)];
    // Clockwise from the top right, as the CSS conic gradient runs.
    case 'quarters': return [rect(0.5, 0, 0.5, 0.5, a), rect(0.5, 0.5, 0.5, 0.5, b), rect(0, 0.5, 0.5, 0.5, c), rect(0, 0, 0.5, 0.5, d)];
    case 'sash': return [base, { type: 'poly', points: [[0.72, 0], [1, 0], [1, 0.28], [0.28, 1], [0, 1], [0, 0.72]], fill: b, opacity: 1 }];
    case 'band': return colors.length > 2
      ? [base, rect(0, 0.3, 1, 0.22, b), rect(0, 0.38, 1, 0.06, c)]
      : [base, rect(0, 0.3, 1, 0.22, b)];
    case 'tartan': return [
      base,
      rect(0.15, 0, 0.2, 1, b, 0.55), rect(0.65, 0, 0.2, 1, b, 0.55),
      rect(0, 0.15, 1, 0.2, b, 0.55), rect(0, 0.65, 1, 0.2, b, 0.55),
      rect(0.47, 0, 0.04, 1, c, 0.8), rect(0, 0.47, 1, 0.04, c, 0.8),
    ];
  }
  return [base];
}

const pc = n => `${(n * 100).toFixed(2)}%`;
const bands = (colors, n) => Array.from({ length: n }, (_, i) => `${colors[i % colors.length]} ${pc(i / n)} ${pc((i + 1) / n)}`).join(', ');

// The kit as a CSS background. `strength` below 1 mixes the other colours
// towards the main one, a softer wash for big panels with text on them.
export function kitBackground(team, strength = 1) {
  const { pattern, colors } = parts(team);
  const main = colors[0];
  const soft = strength >= 1 ? colors : colors.map((col, i) => (i ? `color-mix(in srgb, ${col} ${Math.round(strength * 100)}%, ${main})` : col));
  const [a, b = a, c = b, d = a] = soft;
  const glass = (col, alpha) => `color-mix(in srgb, ${col} ${Math.round(alpha * 100)}%, transparent)`;
  switch (pattern) {
    case 'hoops': return `linear-gradient(180deg, ${bands(soft, HOOPS)})`;
    case 'stripes': return `linear-gradient(90deg, ${bands(soft, STRIPES)})`;
    case 'halves': return `linear-gradient(90deg, ${a} 0 50%, ${b} 50%)`;
    case 'quarters': return `conic-gradient(${a} 0 25%, ${b} 0 50%, ${c} 0 75%, ${d} 0)`;
    case 'sash': return `linear-gradient(135deg, ${a} 0 36%, ${b} 36% 64%, ${a} 64%)`;
    case 'band': return soft.length > 2
      ? `linear-gradient(180deg, ${a} 0 30%, ${b} 30% 38%, ${c} 38% 44%, ${b} 44% 52%, ${a} 52%)`
      : `linear-gradient(180deg, ${a} 0 30%, ${b} 30% 52%, ${a} 52%)`;
    case 'tartan': {
      const check = deg => `linear-gradient(${deg}deg, transparent 0 15%, ${glass(b, 0.55)} 15% 35%, transparent 35% 47%, ${glass(c, 0.8)} 47% 51%, transparent 51% 65%, ${glass(b, 0.55)} 65% 85%, transparent 85%)`;
      return `${check(0)}, ${check(90)}, ${a}`;
    }
  }
  return a;
}

// Sets a node's kit variables: --kit (the main colour), --kit-ink (text on
// it), and for patterned kits --kit-bg (the full pattern) and --kit-wash (a
// softer one under text). A plain kit sets those two to 'initial', so a
// pattern set further up the page doesn't show through and the CSS falls
// back to the plain colour.
export function kitVars(node, team) {
  const patterned = isPatterned(team);
  node.style.setProperty('--kit', team.color);
  node.style.setProperty('--kit-ink', inkFor(team.color));
  node.style.setProperty('--kit-bg', patterned ? kitBackground(team) : 'initial');
  node.style.setProperty('--kit-wash', patterned ? kitBackground(team, 0.3) : 'initial');
}
