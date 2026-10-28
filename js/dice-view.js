// Renders the dice: 3D cubes that tumble onto a face, and flat face tiles.

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

export function faceHTML(dieId, index) {
  const f = DICE[dieId].faces[index];
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

export function faceLabel(dieId, index) {
  const f = DICE[dieId].faces[index];
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

export function createDie(dieId, faceIndex = 0) {
  const die = document.createElement('div');
  die.className = 'die';
  paint(die, dieId);
  die.setAttribute('role', 'img');
  const cube = document.createElement('div');
  cube.className = 'cube';
  DICE[dieId].faces.forEach((_, i) => {
    const face = document.createElement('div');
    face.className = 'face';
    face.style.transform = `${SIDE_TRANSFORMS[i]} translateZ(var(--half))`;
    face.innerHTML = faceHTML(dieId, i);
    cube.append(face);
  });
  die.append(cube);
  die._angle = { x: 0, y: 0 };
  setFace(die, faceIndex);
  return die;
}

export function setFace(die, faceIndex) {
  const [x, y] = SHOW_SIDE[faceIndex];
  die._angle = { x, y };
  const cube = die.firstChild;
  cube.style.transition = 'none';
  cube.style.transform = `rotateX(${x}deg) rotateY(${y}deg)`;
  markFace(die, faceIndex);
}

function markFace(die, faceIndex) {
  die.dataset.face = faceIndex;
  die.setAttribute('aria-label', `${DICE[die.dataset.die].name} die: ${faceLabel(die.dataset.die, faceIndex)}`);
  [...die.firstChild.children].forEach((f, i) => f.classList.toggle('up', i === faceIndex));
}

// Next angle equal to `base` (mod 360) that is at least `min` degrees past `from`.
const ahead = (from, base, min) => base + 360 * Math.ceil((from + min - base) / 360);

export function rollTo(die, faceIndex, { duration = 950, delay = 0, reduced = false } = {}) {
  const cube = die.firstChild;
  const [bx, by] = SHOW_SIDE[faceIndex];
  die.classList.remove('landed');
  [...cube.children].forEach(f => f.classList.remove('up'));

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

  const drift = (Math.random() - 0.5) * 60;
  die.animate([
    { transform: `translate(${drift}px, -70px) scale(.55)`, opacity: 0 },
    { opacity: 1, offset: 0.15 },
    { transform: `translate(${drift * 0.3}px, 8px) scale(1.06)`, offset: 0.62 },
    { transform: 'translate(0, -6px) scale(.99)', offset: 0.8 },
    { transform: 'none' },
  ], { duration, delay, easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'backwards' });

  return wait(duration + delay).then(() => {
    markFace(die, faceIndex);
    die.classList.add('landed');
  });
}

export function faceTile(dieId, index, extraClass = '') {
  const tile = document.createElement('div');
  tile.className = `face flat ${extraClass}`.trim();
  paint(tile, dieId);
  tile.innerHTML = faceHTML(dieId, index);
  tile.setAttribute('role', 'img');
  tile.setAttribute('aria-label', faceLabel(dieId, index));
  return tile;
}

export function dieChip(dieId, text = PLAYERS[dieId]?.short ?? '') {
  const chip = document.createElement('span');
  chip.className = 'die-chip';
  paint(chip, dieId);
  chip.textContent = text;
  chip.setAttribute('aria-hidden', 'true');
  return chip;
}

export function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
