// Top-down pitch that shows who has the ball and what the dice just did.
// Coordinates are worked out as if the attack runs left to right, then
// mirrored for the team that attacks the other way.

import { inkFor } from './color.js';
import { POSITIONS } from './dice.js';

const W = 400;
const H = 150;
const TRY_LINE = 376; // attacking try line; the other is at 24
const PX_PER_M = 3.52;
const SVG_NS = 'http://www.w3.org/2000/svg';

const FORMATION = {
  S: [-12, 75],
  F: [-6, 46],
  C: [-34, 101],
  W: [-50, 128],
  B: [-64, 64],
};
const DEFENCE_Y = [26, 51, 76, 101, 126];

function svg(tag, attrs = {}, parent = null) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (parent) parent.append(node);
  return node;
}

export function createPitch(root) {
  root.setAttribute('viewBox', `0 0 ${W} ${H}`);
  root.innerHTML = '';
  const field = svg('g', { class: 'field' }, root);
  svg('rect', { x: 0, y: 0, width: W, height: H, class: 'turf' }, field);
  for (let i = 0; i < 10; i++) {
    if (i % 2) svg('rect', { x: 24 + i * 35.2, y: 0, width: 35.2, height: H, class: 'stripe' }, field);
  }
  svg('rect', { x: 0, y: 0, width: 24, height: H, class: 'ingoal' }, field);
  svg('rect', { x: TRY_LINE, y: 0, width: 24, height: H, class: 'ingoal' }, field);
  const lines = svg('g', { class: 'lines' }, field);
  svg('rect', { x: 1, y: 3, width: W - 2, height: H - 6, class: 'chalk', fill: 'none' }, lines);
  for (const x of [24, TRY_LINE, 200, 24 + 22 * PX_PER_M, TRY_LINE - 22 * PX_PER_M]) {
    svg('line', { x1: x, y1: 3, x2: x, y2: H - 3, class: 'chalk' }, lines);
  }
  for (const x of [200 - 10 * PX_PER_M, 200 + 10 * PX_PER_M, 24 + 5 * PX_PER_M, TRY_LINE - 5 * PX_PER_M]) {
    svg('line', { x1: x, y1: 3, x2: x, y2: H - 3, class: 'chalk dashed' }, lines);
  }
  for (const x of [24, TRY_LINE]) {
    const posts = svg('g', { class: 'posts' }, field);
    svg('line', { x1: x, y1: 68, x2: x, y2: 82, class: 'crossbar' }, posts);
    svg('circle', { cx: x, cy: 68, r: 2.2, class: 'upright' }, posts);
    svg('circle', { cx: x, cy: 82, r: 2.2, class: 'upright' }, posts);
  }
  const gainLine = svg('line', { x1: 0, y1: 6, x2: 0, y2: H - 6, class: 'gain-line' }, root);
  const players = svg('g', { class: 'players' }, root);

  const tokens = [0, 1].map(team => {
    const map = {};
    for (const pos of POSITIONS) {
      const g = svg('g', { class: 'tok', 'data-team': team, 'data-pos': pos }, players);
      svg('circle', { r: 9.5, class: 'halo' }, g);
      svg('circle', { r: 7, class: 'body' }, g);
      const label = svg('text', { class: 'tok-label', 'text-anchor': 'middle', 'dominant-baseline': 'central', y: 0.5 }, g);
      label.textContent = pos;
      map[pos] = g;
    }
    return map;
  });
  const ball = svg('g', { class: 'ball' }, root);
  svg('ellipse', { rx: 3.6, ry: 2.4, class: 'ball-shape' }, ball);
  svg('line', { x1: -1.6, y1: 0, x2: 1.6, y2: 0, class: 'ball-lace' }, ball);

  const place = (node, x, y) => {
    node.style.transform = `translate(${x}px, ${y}px)`;
    node._at = [x, y];
  };

  let colors = null;
  function setKits(teams) {
    const key = teams.map(t => t.color).join();
    if (key === colors) return;
    colors = key;
    teams.forEach((t, team) => {
      for (const pos of POSITIONS) {
        tokens[team][pos].style.setProperty('--kit', t.color);
        tokens[team][pos].style.setProperty('--kit-ink', inkFor(t.color));
      }
    });
  }

  // Positions for every token and the ball for the current moment.
  function layout(match) {
    const step = match.step;
    const att = match.attacker ?? 0;
    const def = 1 - att;
    const mirror = att === 1;
    const X = x => (mirror ? W - x : x);
    const spots = { 0: {}, 1: {} };
    let ballAt = null;
    let gain = null;
    let focus = null;
    const carrier = match.carrier || 'S';

    const kickSpot = range => TRY_LINE - range * 10 * PX_PER_M;
    const purpose = step.purpose;
    const kicking = (purpose === 'kick' || purpose === 'drop' || (step.type === 'choose' && purpose === 'penalty'));

    if (step.type === 'halftime' || step.type === 'fulltime' || purpose === 'toss' || match.attacker === null) {
      POSITIONS.forEach((pos, i) => {
        spots[0][pos] = [150 - (i % 2) * 22, 22 + i * 26];
        spots[1][pos] = [250 + (i % 2) * 22, 22 + i * 26];
      });
      ballAt = [200, 75];
    } else if (purpose === 'setpiece') {
      const feeder = step.team;
      if (step.piece === 'scrum') {
        POSITIONS.forEach((pos, i) => {
          const pack = i < 3;
          spots[att][pos] = pack ? [X(190 - (i % 2) * 9), 66 + i * 9] : [X(150 - i * 12), 60 + i * 18];
          spots[def][pos] = pack ? [X(210 + (i % 2) * 9), 66 + i * 9] : [X(250 + i * 12), 60 + i * 18];
        });
        ballAt = [X(feeder === att ? 192 : 208), 92];
      } else {
        POSITIONS.forEach((pos, i) => {
          spots[att][pos] = i < 3 ? [X(195), 16 + i * 12] : [X(150 - i * 10), 70 + i * 20];
          spots[def][pos] = i < 3 ? [X(205), 16 + i * 12] : [X(250 + i * 10), 70 + i * 20];
        });
        ballAt = [X(200), 6];
      }
    } else if (kicking || (purpose === 'range' && step.kick === 'conversion')) {
      // Drop goals come off the boot of whoever has the ball; the Back takes the place kicks.
      const kicker = step.kick === 'drop' || purpose === 'drop' ? carrier : 'B';
      const kx = step.range ? kickSpot(step.range) : TRY_LINE - 22 * PX_PER_M;
      POSITIONS.forEach((pos, i) => {
        spots[att][pos] = pos === kicker ? [X(kx), 75] : [X(kx - 40 - i * 6), 30 + i * 22];
        spots[def][pos] = [X(TRY_LINE + 8 + (i % 2) * 6), 20 + i * 27];
      });
      ballAt = [X(kx + 5), 77];
      if (step.range) focus = { x: (X(kx) + X(TRY_LINE)) / 2, y: 75, zoom: Math.min(2.2, W / (TRY_LINE - kx + 90)) };
    } else {
      // Open play: the gain line creeps forward with each phase.
      const phase = Math.max(1, match.phase || 1);
      gain = 150 + Math.min(phase - 1, 8) * 14;
      for (const pos of POSITIONS) {
        const [dx, y] = FORMATION[pos];
        spots[att][pos] = [X(gain + dx), y];
      }
      POSITIONS.forEach((pos, i) => (spots[def][pos] = [X(gain + 14), DEFENCE_Y[i]]));

      const [, cy] = FORMATION[carrier];
      const gaps = DEFENCE_Y.map(y => Math.abs(y - cy));
      const nearest = POSITIONS[gaps.indexOf(Math.min(...gaps))];
      if (purpose === 'tackle' || purpose === 'ruck') {
        spots[att][carrier] = [X(gain + 6), cy];
        spots[def][nearest] = [X(gain + 14), cy];
        if (purpose === 'ruck') spots[def][POSITIONS[(POSITIONS.indexOf(nearest) + 1) % 5]] = [X(gain + 20), cy + 6];
      }
      if (purpose === 'try') {
        const runY = Math.min(Math.max(cy, 20), 130);
        spots[att][carrier] = [X(TRY_LINE - 14), runY];
        POSITIONS.forEach((pos, i) => (spots[def][pos] = [X(TRY_LINE - 50 + i * 4), 20 + i * 28]));
        focus = { x: X(TRY_LINE - 34), y: runY, zoom: 1.9 };
      }
      ballAt = spots[att][carrier];
    }
    return { spots, ballAt, gain: gain === null ? null : X(gain + 10), att, focus };
  }

  // ---- Camera: pans and zooms the viewBox onto the action ----
  let view = [0, 0, W, H];
  let cameraFrame = 0;
  let cameraOn = true;
  const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

  function camera(target, duration = 750) {
    const to = target && cameraOn
      ? (() => {
        const w = W / target.zoom;
        const h = H / target.zoom;
        return [clamp(target.x - w / 2, 0, W - w), clamp(target.y - h / 2, 0, H - h), w, h];
      })()
      : [0, 0, W, H];
    const from = [...view];
    if (to.every((v, i) => Math.abs(v - from[i]) < 0.5)) return;
    cancelAnimationFrame(cameraFrame);
    if (!duration) {
      view = to;
      root.setAttribute('viewBox', view.join(' '));
      return;
    }
    const start = performance.now();
    const tick = now => {
      const t = Math.min(1, (now - start) / duration);
      const e = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
      view = from.map((v, i) => v + (to[i] - v) * e);
      root.setAttribute('viewBox', view.map(v => v.toFixed(2)).join(' '));
      if (t < 1) cameraFrame = requestAnimationFrame(tick);
    };
    cameraFrame = requestAnimationFrame(tick);
  }

  function setCamera(on) {
    cameraOn = on;
    if (!on) camera(null, 0);
  }

  // `slow` plays the token moves in slow motion, for line breaks.
  function update(match, { slow = false } = {}) {
    setKits(match.teams);
    root.style.setProperty('--tok-speed', slow ? '1300ms' : '520ms');
    const { spots, ballAt, gain, att, focus } = layout(match);
    camera(focus, slow ? 1300 : 750);
    for (const team of [0, 1]) {
      for (const pos of POSITIONS) {
        const node = tokens[team][pos];
        const [x, y] = spots[team][pos];
        place(node, x, y);
        node.classList.toggle('carrier', team === att && pos === match.carrier && match.step.type === 'roll' && ['attack', 'tackle', 'try', 'ruck'].includes(match.step.purpose));
        node.classList.toggle('attacking', team === att);
      }
    }
    if (ballAt) {
      ball.getAnimations().forEach(a => a.cancel());
      place(ball, ballAt[0] + 5, ballAt[1] - 5);
    }
    gainLine.style.opacity = gain === null ? 0 : 1;
    if (gain !== null) gainLine.style.transform = `translateX(${gain}px)`;
  }

  // One-shot flourishes layered on top of the layout.
  function flourish(kind, match, extra = {}) {
    if (kind === 'kick') {
      const att = extra.team;
      const mirror = att === 1;
      const postX = mirror ? 24 : TRY_LINE;
      const [bx, by] = ball._at || [200, 75];
      const endY = extra.good ? 75 : (Math.random() < 0.5 ? 58 : 92);
      const endX = postX + (mirror ? -14 : 14);
      return ball.animate([
        { transform: `translate(${bx}px, ${by}px) scale(1)` },
        { transform: `translate(${(bx + endX) / 2}px, ${(by + endY) / 2 - 18}px) scale(2.1)`, offset: 0.5 },
        { transform: `translate(${endX}px, ${endY}px) scale(1)` },
      ], { duration: 900, easing: 'ease-in-out', fill: 'forwards' }).finished.catch(() => {});
    }
    if (kind === 'try') {
      const att = extra.team;
      const node = tokens[att][extra.pos];
      const [, y] = node._at || [0, 75];
      const x = att === 1 ? 12 : W - 12;
      place(node, x, y);
      place(ball, x + 4, y - 4);
      camera({ x, y, zoom: 2.6 }, 500);
    }
    return Promise.resolve();
  }

  return { update, flourish, setCamera };
}
