// Cinematic moments: short full-screen scenes for the big events of a match.
// Every scene can be skipped with a tap and scales with the player's speed.

import { inkFor } from './color.js';
import { metres } from './commentary.js';
import { PLAYERS } from './dice.js';
import { buzz, play } from './audio.js';
import { cardArt } from './card-view.js';
import { medal } from './career-view.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

export function createCinema(stage, shakeTarget, { speed, haptics }) {
  let skipper = null;
  let timers = [];
  stage.addEventListener('pointerdown', () => skipper?.());

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function svg(tag, attrs = {}, parent = null) {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    if (parent) parent.append(node);
    return node;
  }

  const kit = (node, color) => {
    node.style.setProperty('--kit', color);
    node.style.setProperty('--kit-ink', inkFor(color));
  };

  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

  // Holds the scene on screen for `ms`, or until the player taps.
  function hold(ms) {
    return new Promise(resolve => {
      const done = () => {
        clearTimeout(timer);
        skipper = null;
        resolve();
      };
      const timer = setTimeout(done, ms);
      skipper = done;
    });
  }

  // Runs `fn` part-way through a scene, unless the scene has ended.
  const at = k => (ms, fn) => timers.push(setTimeout(fn, ms * k));

  function shake(strength = 10, duration = 450) {
    const frames = Array.from({ length: 8 }, (_, i) => {
      const s = strength * (1 - i / 8);
      return { transform: `translate(${(Math.random() - 0.5) * 2 * s}px, ${(Math.random() - 0.5) * 2 * s}px)` };
    });
    shakeTarget.animate([...frames, { transform: 'none' }], { duration, easing: 'linear' });
    if (haptics()) buzz([40, 30, 60]);
  }

  async function run({ tone = 'dark', letterbox = true, duration, color = null }, build) {
    const k = speed();
    timers.forEach(clearTimeout);
    timers = [];
    stage.innerHTML = '';
    stage.className = `cinema ${tone}`;
    if (color) kit(stage, color);
    if (letterbox) stage.append(el('div', 'bar top'), el('div', 'bar bottom'));
    const scene = el('div', 'scene');
    stage.append(scene, el('div', 'skip', 'Tap to skip'));
    stage.style.setProperty('--k', k);
    stage.hidden = false;
    build(scene, at(k), k);
    await hold(duration * k);
    stage.classList.add('out');
    await wait(240);
    timers.forEach(clearTimeout);
    timers = [];
    stage.hidden = true;
    stage.innerHTML = '';
    stage.className = 'cinema';
  }

  function confetti(host, colors, count = 140) {
    const canvas = el('canvas', 'cine-confetti');
    host.append(canvas);
    const rect = host.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const c = canvas.getContext('2d');
    c.scale(dpr, dpr);
    const bits = Array.from({ length: count }, (_, i) => {
      const fromLeft = i % 2 === 0;
      return {
        x: fromLeft ? -10 : rect.width + 10,
        y: rect.height * (0.55 + Math.random() * 0.3),
        vx: (fromLeft ? 1 : -1) * (4 + Math.random() * 9),
        vy: -9 - Math.random() * 10,
        r: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.5,
        w: 6 + Math.random() * 7,
        h: 3 + Math.random() * 5,
        color: colors[i % colors.length],
      };
    });
    const start = performance.now();
    const frame = now => {
      if (!canvas.isConnected) return;
      const t = now - start;
      c.clearRect(0, 0, rect.width, rect.height);
      for (const b of bits) {
        b.vy += 0.28;
        b.vx *= 0.985;
        b.x += b.vx;
        b.y += b.vy;
        b.r += b.vr;
        c.save();
        c.globalAlpha = Math.max(0, 1 - t / 3200);
        c.translate(b.x, b.y);
        c.rotate(b.r);
        c.fillStyle = b.color;
        c.fillRect(-b.w / 2, -b.h / 2, b.w, b.h);
        c.restore();
      }
      if (t < 3200) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  const title = (text, extra = '') => el('div', `cine-title ${extra}`.trim(), text);
  const sub = (text, extra = '') => el('div', `cine-sub ${extra}`.trim(), text);

  // ---------------------------------------------------------------- scenes

  const scenes = {
    kickoff({ teams, half, target, label = null }) {
      return run({ duration: label ? 2300 : 2000 }, (scene, later) => {
        scene.classList.add('kickoff');
        const sides = teams.map((t, i) => {
          const side = el('div', `ko-side ${i ? 'right' : 'left'}`);
          kit(side, t.color);
          side.append(el('span', 'ko-name', t.name));
          return side;
        });
        scene.append(
          ...sides,
          el('div', 'ko-v', 'v'),
          el('div', 'ko-top', half === 1 ? 'Kick off' : 'Second half'),
          el('div', 'ko-bottom', half === 1 ? `First to ${target.full} · half time at ${target.half}` : `First to ${target.full}`),
        );
        if (label) scene.append(el('div', 'ko-label', label));
        later(550, () => play('whistle'));
      });
    },

    setpiece({ piece }) {
      const words = piece === 'scrum' ? ['Crouch', 'Bind', 'Set!'] : ['Lineout', 'Jumpers up', 'Throw!'];
      return run({ tone: 'clear', duration: 1150 }, (scene, later) => {
        scene.classList.add('calls');
        words.forEach((w, i) => {
          const word = el('div', `call${i === words.length - 1 ? ' last' : ''}`, w);
          word.style.animationDelay = `calc(${i * 330}ms * var(--k))`;
          scene.append(word);
          later(i * 330, () => play(i === words.length - 1 ? 'thud' : 'tick', i === words.length - 1));
        });
      });
    },

    linebreak({ team, pos, player = null }) {
      return run({ tone: 'clear', duration: 1500, color: team.color }, (scene, later) => {
        scene.classList.add('linebreak');
        scene.append(el('div', 'speedlines'));
        const slab = el('div', 'slab');
        slab.append(title('Line break'), sub(`${player || `${team.name} ${PLAYERS[pos].one}`} is through`));
        scene.append(slab);
        play('whoosh');
        later(250, () => play('cheer'));
      });
    },

    try({ team, pos, scoreline, player = null }) {
      return run({ tone: 'team', duration: 2700, color: team.color }, (scene, later, k) => {
        scene.classList.add('try');
        scene.append(el('div', 'rays'));
        const word = el('div', 'try-word');
        [...'TRY'].forEach((ch, i) => {
          const letter = el('span', 'try-letter', ch);
          letter.style.animationDelay = `${i * 150 * k}ms`;
          word.append(letter);
          later(i * 150 + 260, () => {
            play('stamp');
            shake(7 + i * 3, 260);
          });
        });
        scene.append(word, sub(`${player ? `${player}, ${team.name}` : `${team.name} ${PLAYERS[pos].one}`} · +5`, 'late'), sub(scoreline, 'late score'));
        play('whistle');
        later(380, () => play('roar'));
        later(500, () => confetti(scene, [team.color, '#ffffff', '#f5cf1d', inkFor(team.color)]));
      });
    },

    tmo() {
      return run({ duration: 1700 }, (scene, later) => {
        const tv = el('div', 'tv');
        const head = el('div', 'tv-head');
        head.append(el('span', 'rec'), el('b', null, 'TMO review'), el('span', 'tv-time', '00:00'));
        const body = el('div', 'tv-body');
        body.append(el('div', 'tv-text', 'Checking the grounding'), el('div', 'tv-bar'));
        tv.append(head, body);
        scene.append(tv);
        play('beep');
        later(900, () => play('beep'));
        let s = 0;
        const clock = setInterval(() => {
          if (!tv.isConnected) return clearInterval(clock);
          s++;
          tv.querySelector('.tv-time').textContent = `00:${String(s).padStart(2, '0')}`;
        }, 300);
      });
    },

    notry({ heldUp, team }) {
      return run({ duration: 1350 }, (scene, later) => {
        const stamp = el('div', 'stamp');
        stamp.append(el('b', null, 'No try'), el('span', null, heldUp ? 'Held up over the line' : `Changeover · ${team.name} lose it`));
        scene.append(stamp);
        later(120, () => {
          play('stamp');
          shake(6, 250);
        });
        later(300, () => play('groan'));
      });
    },

    kickcam({ team, kick, range, distance, good, note = null }) {
      const miss = range - distance;
      const outcome = good ? 'good' : miss === 1 ? 'post' : miss === 2 ? 'wide' : 'short';
      const verdict = {
        good: { conversion: 'Converted!', penalty: "It's over!", drop: 'Drop goal!' }[kick],
        post: 'Off the post!',
        wide: 'Wide!',
        short: 'Short!',
      }[outcome];
      const label = { conversion: 'Conversion', penalty: 'Penalty goal', drop: 'Drop goal' }[kick];
      return run({ duration: 3000 }, (scene, later, k) => {
        scene.classList.add('kickcam');
        kit(scene, team.color);
        scene.append(el('div', 'kc-label', `${team.name} · ${label} · ${metres(range)}${note ? ` · ${note}` : ''}`));

        const view = svg('svg', { viewBox: '0 0 360 300', class: 'kc-view', role: 'img', 'aria-label': `${label} from ${metres(range)}` });
        const defs = svg('defs', {}, view);
        const sky = svg('linearGradient', { id: 'kc-sky', x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
        svg('stop', { offset: '0', 'stop-color': '#08121f' }, sky);
        svg('stop', { offset: '1', 'stop-color': '#1b3346' }, sky);
        const glow = svg('radialGradient', { id: 'kc-glow' }, defs);
        svg('stop', { offset: '0', 'stop-color': '#fffbe6', 'stop-opacity': '0.9' }, glow);
        svg('stop', { offset: '1', 'stop-color': '#fffbe6', 'stop-opacity': '0' }, glow);
        svg('rect', { x: 0, y: 0, width: 360, height: 300, fill: 'url(#kc-sky)' }, view);
        for (const x of [40, 320]) svg('circle', { cx: x, cy: 34, r: 48, fill: 'url(#kc-glow)' }, view);
        // The crowd: a dark stand with a scatter of faces.
        svg('rect', { x: 0, y: 132, width: 360, height: 58, fill: '#101a20' }, view);
        for (let i = 0; i < 160; i++) {
          svg('circle', { cx: (i * 37) % 360, cy: 138 + ((i * 13) % 48), r: 1.3, fill: i % 5 ? '#3a4a52' : team.color, opacity: 0.8 }, view);
        }
        // Turf, striped and running away to the posts.
        svg('rect', { x: 0, y: 190, width: 360, height: 110, fill: '#245a36' }, view);
        for (let i = -6; i <= 6; i += 2) {
          svg('polygon', { points: `${180 + i * 60},300 ${180 + (i + 1) * 60},300 ${180 + (i + 1) * 9},190 ${180 + i * 9},190`, fill: '#2b6a40' }, view);
        }
        svg('line', { x1: 0, y1: 190, x2: 360, y2: 190, stroke: '#f2f5ee', 'stroke-width': 1.5 }, view);
        const tenLine = 190 + Math.max(10, 90 - range * 14);
        svg('line', { x1: 0, y1: tenLine, x2: 360, y2: tenLine, stroke: '#f2f5ee', 'stroke-opacity': 0.4, 'stroke-dasharray': '6 8' }, view);

        // The posts shrink with distance.
        const s = 1.25 - range * 0.15;
        const half = 34 * s;
        const bar = 190 - 46 * s;
        const top = 190 - 150 * s;
        const posts = svg('g', { class: 'kc-posts' }, view);
        for (const x of [180 - half, 180 + half]) {
          svg('line', { x1: x, y1: 190, x2: x, y2: top, stroke: '#f7f7f2', 'stroke-width': Math.max(2, 5 * s), 'stroke-linecap': 'round' }, posts);
          svg('rect', { x: x - 4 * s, y: 190 - 18 * s, width: 8 * s, height: 18 * s, fill: team.color, rx: 1 }, posts);
        }
        svg('line', { x1: 180 - half, y1: bar, x2: 180 + half, y2: bar, stroke: '#f7f7f2', 'stroke-width': Math.max(2, 5 * s) }, posts);

        // Touch judges' flags go up for a goal.
        const flags = [24, 336].map(x => {
          const g = svg('g', { class: 'kc-flag' }, view);
          svg('line', { x1: 0, y1: 0, x2: 0, y2: -46, stroke: '#ddd', 'stroke-width': 2.5 }, g);
          svg('rect', { x: x < 180 ? 0 : -24, y: -46, width: 24, height: 16, fill: '#f2c230' }, g);
          g.style.setProperty('--x', `${x}px`);
          return g;
        });

        const ball = svg('g', { class: 'kc-ball' }, view);
        svg('ellipse', { rx: 15, ry: 10, fill: '#f6f1e6', stroke: '#3b2a1a', 'stroke-width': 1.5 }, ball);
        svg('line', { x1: -6, y1: 0, x2: 6, y2: 0, stroke: '#3b2a1a', 'stroke-width': 1.5 }, ball);
        scene.append(view);

        // Distance gauge: fills as the ball travels; the marker is what's needed.
        const gauge = el('div', 'gauge');
        const track = el('div', 'gauge-track');
        const fill = el('div', 'gauge-fill');
        const need = el('div', 'gauge-need');
        need.style.left = `${(range / 6) * 100}%`;
        need.append(el('span', null, `need ${metres(range)}`));
        track.append(fill, need);
        const readout = el('div', 'gauge-readout', '0 m');
        gauge.append(track, readout);
        scene.append(gauge);

        const verdictEl = el('div', `kc-verdict ${good ? 'good' : 'bad'}`, verdict);
        scene.append(verdictEl);

        // Ball flight.
        const flight = 1250 * k;
        const runUp = 450 * k;
        const start = [180, 286];
        const side = Math.random() < 0.5 ? -1 : 1;
        const end = {
          good: [180 + side * half * 0.25, bar - 26 * s],
          post: [180 + side * half, bar - 30 * s],
          wide: [180 + side * (half + 26 * s), bar - 34 * s],
          short: [180 + side * half * 0.3, bar + 10 * s],
        }[outcome];
        const endScale = 0.18 + s * 0.12;
        const frames = [
          { transform: `translate(${start[0]}px, ${start[1]}px) scale(1) rotate(0deg)` },
          { transform: `translate(${(start[0] + end[0]) / 2}px, ${Math.min(start[1], end[1]) - 70 * s - 20}px) scale(${(1 + endScale) / 2}) rotate(260deg)`, offset: 0.55 },
          { transform: `translate(${end[0]}px, ${end[1]}px) scale(${endScale}) rotate(520deg)` },
        ];
        if (outcome === 'post') frames.push({ transform: `translate(${end[0] + side * 40}px, ${end[1] + 70}px) scale(${endScale}) rotate(700deg)` });
        if (outcome === 'short') frames.push({ transform: `translate(${end[0]}px, 192px) scale(${endScale}) rotate(600deg)` });
        ball.style.transform = `translate(${start[0]}px, ${start[1]}px)`;
        const total = flight * (frames.length > 3 ? 1.3 : 1);
        ball.animate(frames, { duration: total, delay: runUp, easing: 'cubic-bezier(.25,.55,.35,1)', fill: 'forwards' });

        later(450, () => play('kick'));
        later(500, () => play('whoosh'));
        // Count the readout up with the flight.
        const counter = performance.now() + runUp;
        const tick = now => {
          if (!readout.isConnected) return;
          const t = Math.min(1, Math.max(0, (now - counter) / flight));
          const shown = distance * t;
          fill.style.width = `${(shown / 6) * 100}%`;
          readout.textContent = `${Math.round(shown * 10)} m`;
          need.classList.toggle('passed', shown >= range);
          if (t < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);

        later(450 + 1250, () => {
          verdictEl.classList.add('show');
          if (good) {
            play('roar');
            flags.forEach(f => f.classList.add('up'));
            confetti(scene, [team.color, '#ffffff', '#f5cf1d'], 70);
          } else if (outcome === 'post') {
            play('post');
            later(150, () => play('ooh'));
          } else {
            play('groan');
          }
        });
      });
    },

    bighit({ team, ruck }) {
      return run({ tone: 'clear', letterbox: false, duration: 1050, color: team.color }, (scene, later) => {
        scene.classList.add('bighit');
        for (let i = 0; i < 3; i++) {
          const ring = el('div', 'ring');
          ring.style.animationDelay = `calc(${i * 110}ms * var(--k))`;
          scene.append(ring);
        }
        const slab = el('div', 'slab hit');
        slab.append(title('Big hit!'), sub(ruck ? 'Fight for the ball at the ruck' : `${team.name} stop them dead`));
        scene.append(slab);
        play('thud', true);
        shake(14, 480);
        later(90, () => play('ooh'));
      });
    },

    injury({ team, pos, penalty, player = null }) {
      return run({ duration: 1500 }, scene => {
        scene.classList.add('injury');
        scene.append(el('div', 'cross'), title('Injury', 'small'), sub(`${player || `${team.name} ${PLAYERS[pos].one}`} runs at −${penalty} for the rest of the match`));
        play('groan');
      });
    },

    card({ color, team }) {
      return run({ duration: 2100 }, (scene, later) => {
        scene.classList.add('card-scene');
        const card = el('div', `ref-card ${color}`);
        scene.append(
          card,
          title(color === 'yellow' ? 'Yellow card' : 'Red card', 'small late'),
          sub(color === 'yellow' ? `${team.name} to the sin bin · −1 on each tackle die this half` : `Second yellow · ${team.name} −2 on each tackle die for the match`, 'late'),
        );
        play('whistle');
        later(420, () => {
          play('stamp');
          if (haptics()) buzz([80, 60, 80]);
        });
      });
    },

    turnover({ team, title: heading, sub: text }) {
      return run({ tone: 'clear', duration: 1350, color: team.color }, scene => {
        scene.classList.add('turnover');
        const band = el('div', 'sweep');
        band.append(title(heading), sub(text));
        scene.append(band);
        play('whoosh');
      });
    },

    penalty({ team }) {
      return run({ tone: 'clear', duration: 1100, color: team.color }, scene => {
        scene.classList.add('penalty');
        const slab = el('div', 'slab');
        slab.append(title('Penalty'), sub(`to ${team.name}`));
        scene.append(slab);
        play('whistle');
      });
    },

    quicktap({ team }) {
      return run({ tone: 'clear', duration: 1050, color: team.color }, scene => {
        scene.classList.add('quicktap');
        scene.append(el('div', 'speedlines gold'));
        const slab = el('div', 'slab');
        slab.append(title('Tap & go!'), sub('+1 intensity for 3 runs'));
        scene.append(slab);
        play('whoosh');
      });
    },

    whistle({ full, teams, winner }) {
      const color = full ? teams[winner].color : null;
      return run({ tone: full ? 'team' : 'dark', duration: full ? 3000 : 2100, color }, (scene, later) => {
        scene.classList.add('whistle');
        scene.append(el('div', 'wh-kicker', full ? 'Full time' : 'Half time'));
        const board = el('div', 'wh-board');
        teams.forEach((t, i) => {
          const side = el('div', 'wh-team');
          const chip = el('span', 'wh-kit');
          kit(chip, t.color);
          const name = el('div', 'wh-name');
          name.append(chip, document.createTextNode(t.name));
          side.append(name, el('div', 'wh-score', t.score));
          board.append(side);
          if (i === 0) board.append(el('div', 'wh-dash', '–'));
        });
        scene.append(board);
        if (full) scene.append(title(`${teams[winner].name} win`, 'small late'));
        play('whistle', true);
        if (full) {
          later(300, () => play('roar'));
          later(400, () => confetti(scene, [teams[winner].color, '#ffffff', '#f5cf1d', inkFor(teams[winner].color)], 180));
        }
      });
    },

    // Both sides' team cards, face to face, before the kick-off.
    draft({ teams }) {
      return run({ duration: 2600 }, (scene, later) => {
        scene.classList.add('draft-scene');
        scene.append(el('div', 'ds-kicker', 'Team cards'));
        const row = el('div', 'ds-row');
        teams.forEach((t, i) => {
          const col = el('div', `ds-col ${i ? 'right' : 'left'}`);
          kit(col, t.color);
          col.append(el('div', 'ds-team', t.name), cardArt(t.card));
          row.append(col);
          if (i === 0) row.append(el('div', 'ds-v', 'v'));
        });
        scene.append(row);
        play('whoosh');
        later(420, () => play('stamp'));
        later(620, () => play('stamp'));
      });
    },

    // A team card changes what the dice said.
    cardplay({ team, card, line }) {
      return run({ tone: 'clear', letterbox: false, duration: 1700, color: team.color }, (scene, later) => {
        scene.classList.add('cardplay');
        const glow = el('div', 'cp-glow');
        const art = cardArt(card);
        art.classList.add('cp-card');
        scene.append(glow, art, sub(`${team.name} · ${line}`, 'cp-line'));
        play('whoosh');
        later(260, () => {
          play('stamp');
          if (haptics()) buzz(30);
        });
      });
    },

    // Player of the Match, in the spotlight.
    potm({ name, team, position, line }) {
      return run({ duration: 2800 }, (scene, later) => {
        scene.classList.add('potm-scene');
        scene.append(el('div', 'spot'));
        const card = el('div', 'pm-card');
        kit(card, team.color);
        card.append(el('div', 'pm-kicker', 'Player of the Match'), el('div', 'pm-name', name), el('div', 'pm-pos', `${position} · ${team.name}`));
        scene.append(card, sub(line, 'late'));
        later(200, () => play('cheer'));
      });
    },

    // One or more achievements unlocked at full time.
    achievement({ items }) {
      return run({ duration: 2000 + 500 * (items.length - 1) }, (scene, later) => {
        scene.classList.add('ach-scene');
        scene.append(el('div', 'ach-kicker', items.length > 1 ? `${items.length} achievements unlocked` : 'Achievement unlocked'));
        const list = el('div', 'ach-cards');
        items.forEach((a, i) => {
          const card = el('div', 'ach-card');
          card.style.animationDelay = `calc(${180 + i * 260}ms * var(--k))`;
          const text = el('div', 'ach-card-text');
          text.append(el('b', null, a.name), el('span', null, a.text));
          card.append(medal('ach-medal'), text);
          list.append(card);
          later(180 + i * 260, () => play('stamp'));
        });
        scene.append(list);
        later(120, () => play('cheer'));
      });
    },

    // The trophy goes up.
    trophy({ team, title }) {
      return run({ tone: 'team', duration: 3600, color: team.color }, (scene, later) => {
        scene.classList.add('trophy-scene');
        scene.append(el('div', 'rays'));
        const cup = svg('svg', { viewBox: '0 0 120 150', class: 'cup', 'aria-hidden': 'true' });
        const gold = svg('linearGradient', { id: 'cup-gold', x1: 0, y1: 0, x2: 1, y2: 0 }, svg('defs', {}, cup));
        svg('stop', { offset: '0', 'stop-color': '#a8740c' }, gold);
        svg('stop', { offset: '0.45', 'stop-color': '#fbe08a' }, gold);
        svg('stop', { offset: '1', 'stop-color': '#b9810f' }, gold);
        svg('path', { d: 'M30 10h60v28c0 22-13 38-30 40-17-2-30-18-30-40z', fill: 'url(#cup-gold)' }, cup);
        svg('path', { d: 'M30 18H14c0 18 8 28 18 30M90 18h16c0 18-8 28-18 30', fill: 'none', stroke: 'url(#cup-gold)', 'stroke-width': 6, 'stroke-linecap': 'round' }, cup);
        svg('path', { d: 'M54 78h12v22H54z', fill: 'url(#cup-gold)' }, cup);
        svg('path', { d: 'M36 100h48l6 18H30z', fill: 'url(#cup-gold)' }, cup);
        svg('rect', { x: 24, y: 118, width: 72, height: 16, rx: 3, fill: '#3a2a10' }, cup);
        svg('ellipse', { cx: 50, cy: 30, rx: 6, ry: 14, fill: '#fff', opacity: 0.35 }, cup);
        scene.append(cup, el('div', 'cine-title small late', 'Champions'), sub(`${team.name} · ${title}`, 'late'));
        play('whistle', true);
        later(300, () => play('roar'));
        later(500, () => confetti(scene, [team.color, '#ffffff', '#f5cf1d', inkFor(team.color)], 220));
        later(1400, () => confetti(scene, ['#f5cf1d', '#ffffff', team.color], 120));
      });
    },
  };

  return {
    play: (kind, data) => (scenes[kind] ? scenes[kind](data) : Promise.resolve()),
    skip: () => skipper?.(),
    get active() {
      return !stage.hidden;
    },
  };
}
