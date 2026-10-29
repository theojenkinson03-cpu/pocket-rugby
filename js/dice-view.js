// Renders the dice: 3D cubes that tumble onto a face, and flat face tiles.
// Given the roll they're part of, faces read for it: a brown die setting a
// kick's range shows metres, not a tackle.
// A cube has six faces round a solid core (so no gaps show at the rounded
// edges as it turns) and a shadow on the table under it, drawn as its own
// element: a filter on the cube's parent would flatten the 3D in Safari.
// Badges in a die's top-right corner show what changes its numbers: an
// injury, the sin bin, a red card, advantage, the wind or a team card.

import { DICE, PLAYERS } from './dice.js';

export const DIE_COLORS = {
  S: { fill: '#d4433b', ink: '#ffffff', name: 'red' },
  F: { fill: '#2f8f4e', ink: '#ffffff', name: 'green' },
  C: { fill: '#f2d044', ink: '#2b2300', name: 'yellow' },
  W: { fill: '#f08a2c', ink: '#2b1500', name: 'orange' },
  B: { fill: '#3b6cc4', ink: '#ffffff', name: 'blue' },
  D: { fill: '#6f4a33', ink: '#ffffff', name: 'brown' },
  K: { fill: '#1c1c1e', ink: '#ffffff', name: 'black' },
  R: { fill: '#f7f6f1', ink: '#1c1c1e', name: 'white' },
};

// Face i sits on cube side i: front, right, back, left, top, bottom.
const SIDE_TRANSFORMS = ['rotateY(0deg)', 'rotateY(90deg)', 'rotateY(180deg)', 'rotateY(-90deg)', 'rotateX(90deg)', 'rotateX(-90deg)'];
const SHOW_SIDE = [[0, 0], [0, -90], [0, -180], [0, 90], [-90, 0], [90, 0]];

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function refRow(label, result) {
  const text = { win: 'Won', lose: 'Lost', reset: 'Reset', notstraight: 'Not straight' }[result];
  const light = result === 'win' ? 'green' : result === 'lose' ? 'red' : 'none';
  return `<span class="ref-row" data-row="${label.toLowerCase()}"><i class="light ${light}" aria-hidden="true"></i><b>${label}</b><em>${text}</em></span>`;
}

const RESULT_WORD = { try: 'Try', notry: 'No try', video: 'Video ref', ruck: 'Held up' };
const PIECE_WORD = { win: 'Won', lose: 'Lost', reset: 'Reset', notstraight: 'Crooked' };
const metresHTML = n => `<span class="fv">${n * 10}<small>m</small></span>`;

// What a face reads in the roll at hand (`roll`: {purpose, piece, ruckWins}):
// the brown die sets a kick's range in metres, the black die a kick's
// distance, a yellow card or not, a try or a ruck; the white die shows only
// the piece being played. Null where the printed face says it best.
function rollHTML(dieId, f, roll) {
  const { purpose } = roll;
  if (dieId === 'D' && (purpose === 'range' || purpose === 'penalty')) return `<span class="fl">To the posts</span>${metresHTML(f.value)}`;
  if (dieId === 'K') {
    if (purpose === 'kick') return `<span class="fl">Kick</span>${metresHTML(f.kick)}`;
    if (purpose === 'penalty') return f.card ? '<i class="fcard" aria-hidden="true"></i><span class="fword">Yellow card</span>' : '<span class="fword dim">No card</span>';
    if (purpose === 'try') return `<span class="fword${f.result === 'try' ? ' big' : ''}">${RESULT_WORD[f.result]}</span>`;
    if (purpose === 'ruck') return (roll.ruckWins || ['ruck']).includes(f.result) ? '<span class="fword big">Turn&shy;over</span>' : '<span class="fword dim">Held</span>';
  }
  if (dieId === 'R' && purpose === 'setpiece' && !f.penalty) {
    return `<span class="fl">${roll.piece === 'scrum' ? 'Scrum' : 'Lineout'}</span><span class="fword${f[roll.piece] === 'win' ? ' big' : ''}">${PIECE_WORD[f[roll.piece]]}</span>`;
  }
  return null;
}

// The face as printed, or as it reads in `roll` when one is given.
export function faceHTML(dieId, index, roll = null) {
  const f = DICE[dieId].faces[index];
  const inRoll = roll && rollHTML(dieId, f, roll);
  if (inRoll) return inRoll;
  if (dieId === 'K') {
    return `<span class="fk" title="Kick distance">${f.kick}</span><span class="fr${f.label.length > 6 ? ' long' : ''}">${esc(f.label)}</span>${f.card ? '<i class="card-dot" aria-label="yellow card dot"></i>' : ''}`;
  }
  if (dieId === 'R') {
    if (f.penalty) return `<span class="fl">Penalty</span><span class="fpen">${f.penalty === 'won' ? 'Won' : 'Against'}</span>`;
    return refRow('Scrum', f.scrum) + refRow('Lineout', f.lineout);
  }
  if (dieId === 'D') {
    return f.kind === 'bighit'
      ? `<span class="fl">Big Hit</span><span class="fv">${f.value}</span><span class="fs">(ruck)</span>`
      : `<span class="fl">Tackle</span><span class="fv">${f.value}</span>`;
  }
  switch (f.kind) {
    case 'run':
      return f.special
        ? `<span class="fl sp">${esc(f.label)}!</span><span class="fv">${f.value}</span>`
        : `<span class="fl">Hit Up</span><span class="fv">${f.value}</span>`;
    case 'pass':
      return f.to
        ? `<span class="fl">Pass</span><span class="fto${PLAYERS[f.to].name.length > 9 ? ' long' : ''}">${PLAYERS[f.to].name}</span>`
        : '<span class="fpass">&lsaquo;Pass&rsaquo;</span>';
    case 'drop':
      return '<span class="fl">Drop goal</span><span class="fs">&lsaquo;Pass&rsaquo;</span>';
    case 'error':
      return `<span class="ferr">${esc(f.label)}</span>`;
    case 'intercept':
      return '<span class="ferr">Inter&shy;cepted</span>';
  }
  return '';
}

export function faceLabel(dieId, index, roll = null) {
  const f = DICE[dieId].faces[index];
  if (roll) {
    const { purpose } = roll;
    if (dieId === 'D' && (purpose === 'range' || purpose === 'penalty')) return `${f.value * 10} m to the posts`;
    if (dieId === 'K' && purpose === 'kick') return `Kick of ${f.kick * 10} m`;
    if (dieId === 'K' && purpose === 'penalty') return f.card ? 'Yellow card' : 'No card';
    if (dieId === 'K' && purpose === 'try') return RESULT_WORD[f.result];
    if (dieId === 'K' && purpose === 'ruck') return (roll.ruckWins || ['ruck']).includes(f.result) ? 'Turnover' : 'Held';
    if (dieId === 'R' && purpose === 'setpiece' && !f.penalty) return `${roll.piece === 'scrum' ? 'Scrum' : 'Lineout'} ${PIECE_WORD[f[roll.piece]].toLowerCase()}`;
  }
  if (dieId === 'K') return `${f.label}, kick ${f.kick}${f.card ? ', yellow dot' : ''}`;
  if (dieId === 'R') return f.penalty ? `Penalty ${f.penalty}` : `Scrum ${f.scrum}, lineout ${f.lineout}`;
  if (f.kind === 'pass') return f.to ? `Pass to ${PLAYERS[f.to].name}` : 'Pass';
  return f.value ? `${f.label} ${f.value}` : f.label;
}

function paint(node, dieId) {
  const c = DIE_COLORS[dieId];
  node.style.setProperty('--die', c.fill);
  node.style.setProperty('--die-ink', c.ink);
  node.dataset.die = dieId;
}

// The core: three planes through the middle, in the die's colour.
const CORE = ['rotateX(90deg)', 'rotateY(90deg)', 'none'];

export function createDie(dieId, faceIndex = 0, badges = [], roll = null) {
  const die = document.createElement('div');
  die.className = 'die';
  paint(die, dieId);
  die.setAttribute('role', 'img');
  const shadow = document.createElement('i');
  shadow.className = 'die-shadow';
  shadow.setAttribute('aria-hidden', 'true');
  const cube = document.createElement('div');
  cube.className = 'cube';
  for (const t of CORE) {
    const plane = document.createElement('i');
    plane.className = 'core';
    plane.style.transform = t;
    cube.append(plane);
  }
  DICE[dieId].faces.forEach((_, i) => {
    const face = document.createElement('div');
    face.className = 'face';
    face.style.transform = `${SIDE_TRANSFORMS[i]} translateZ(var(--half))`;
    face.innerHTML = faceHTML(dieId, i, roll);
    cube.append(face);
  });
  // The lift carries the perspective and the drop; the cube turns inside it.
  const lift = document.createElement('div');
  lift.className = 'lift';
  lift.append(cube);
  die.append(shadow, lift);
  addBadges(die, badges);
  die._roll = roll;
  die._angle = { x: 0, y: 0 };
  setFace(die, faceIndex);
  return die;
}

const faceNodes = die => die.querySelectorAll('.cube > .face');

// A badge: {kind, kinds, text, label}: an icon for each kind of change
// ('injury', 'sinbin', 'red', 'advantage', 'wind', 'card') and the total.
export function badgeNode({ kind, kinds = [kind], text, label }) {
  const b = document.createElement('span');
  b.className = `die-badge b-${kind}${kinds.length > 1 ? ' multi' : ''}`;
  for (const k of kinds) {
    const icon = document.createElement('i');
    icon.className = `bi-${k}`;
    icon.setAttribute('aria-hidden', 'true');
    b.append(icon);
  }
  b.append(document.createTextNode(text));
  if (label) b.title = label;
  return b;
}

function addBadges(node, badges = []) {
  badges = badges.filter(Boolean);
  if (!badges.length) return;
  const host = document.createElement('span');
  host.className = 'die-badges';
  badges.forEach(badge => host.append(badgeNode(badge)));
  node.append(host);
  node.dataset.badges = badges.flatMap(b => b.kinds || [b.kind]).join(' ');
}

export function setFace(die, faceIndex) {
  const [x, y] = SHOW_SIDE[faceIndex];
  die._angle = { x, y };
  const cube = die.querySelector('.cube');
  cube.style.transition = 'none';
  cube.style.transform = `rotateX(${x}deg) rotateY(${y}deg)`;
  markFace(die, faceIndex);
}

function markFace(die, faceIndex) {
  die.dataset.face = faceIndex;
  const badges = [...die.querySelectorAll('.die-badge')].map(b => b.title).filter(Boolean);
  die.setAttribute('aria-label', `${DICE[die.dataset.die].name} die: ${faceLabel(die.dataset.die, faceIndex, die._roll)}${badges.length ? `. ${badges.join('. ')}` : ''}`);
  faceNodes(die).forEach((f, i) => f.classList.toggle('up', i === faceIndex));
}

// Next angle equal to `base` (mod 360) that is at least `min` degrees past `from`.
const ahead = (from, base, min) => base + 360 * Math.ceil((from + min - base) / 360);

export function rollTo(die, faceIndex, { duration = 950, delay = 0, reduced = false } = {}) {
  const cube = die.querySelector('.cube');
  const [bx, by] = SHOW_SIDE[faceIndex];
  die.classList.remove('landed');
  faceNodes(die).forEach(f => f.classList.remove('up'));

  if (reduced) {
    setFace(die, faceIndex);
    die.animate([{ opacity: 0.2 }, { opacity: 1 }], { duration: 200, delay, fill: 'backwards' });
    return wait(200 + delay).then(() => die.classList.add('landed'));
  }

  const x = ahead(die._angle.x, bx, 720 + 360 * Math.floor(Math.random() * 2));
  const y = ahead(die._angle.y, by, 360 + 360 * Math.floor(Math.random() * 2));
  die._angle = { x, y };
  cube.style.transition = `transform ${duration}ms cubic-bezier(.12,.62,.22,1) ${delay}ms`;
  // Force the browser to commit the start angle before the transition target.
  void cube.offsetWidth;
  cube.style.transform = `rotateX(${x}deg) rotateY(${y}deg)`;

  // The cube drops in and bounces; its shadow grows as it nears the table.
  const drift = (Math.random() - 0.5) * 60;
  die.querySelector('.lift').animate([
    { transform: `translate(${drift}px, -70px) scale(.55)`, opacity: 0 },
    { opacity: 1, offset: 0.15 },
    { transform: `translate(${drift * 0.3}px, 8px) scale(1.06)`, offset: 0.62 },
    { transform: 'translate(0, -6px) scale(.99)', offset: 0.8 },
    { transform: 'none' },
  ], { duration, delay, easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'backwards' });
  die.querySelector('.die-shadow')?.animate([
    { transform: 'scale(.3)', opacity: 0 },
    { transform: 'scale(.6)', opacity: 0.5, offset: 0.3 },
    { transform: 'scale(1.05)', opacity: 1, offset: 0.62 },
    { transform: 'scale(.9)', opacity: 0.85, offset: 0.8 },
    { transform: 'none', opacity: 1 },
  ], { duration, delay, easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'backwards' });

  return wait(duration + delay).then(() => {
    markFace(die, faceIndex);
    die.classList.add('landed');
  });
}

export function faceTile(dieId, index, extraClass = '', roll = null) {
  const tile = document.createElement('div');
  tile.className = `face flat ${extraClass}`.trim();
  paint(tile, dieId);
  tile.innerHTML = faceHTML(dieId, index, roll);
  tile.setAttribute('role', 'img');
  tile.setAttribute('aria-label', faceLabel(dieId, index, roll));
  return tile;
}

export function dieChip(dieId, text = PLAYERS[dieId]?.short ?? '', badges = []) {
  const chip = document.createElement('span');
  chip.className = 'die-chip';
  paint(chip, dieId);
  chip.textContent = text;
  chip.setAttribute('aria-hidden', 'true');
  addBadges(chip, badges);
  return chip;
}

export function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
