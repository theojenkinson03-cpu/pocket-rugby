// Screen controller: setup, the match loop, animation and persistence.

import { act, controllerOf, kickChance, MATCH_LENGTHS, newMatch, QUICK_TAP_RUNS, receiverOdds } from './engine.js';
import { cpuChoice, suggestedChoice } from './ai.js';
import { DICE, PLAYERS, POSITIONS } from './dice.js';
import { metres, narrate, scoreLine } from './commentary.js';
import { createDie, dieChip, faceTile, rollTo, setFace, wait } from './dice-view.js';
import { createCinema } from './cinema.js';
import { createPitch } from './pitch.js';
import { buzz, play, setSoundEnabled, unlockAudio } from './audio.js';
import { kitVars } from './color.js';
import { load, save } from './store.js';

const $ = sel => document.querySelector(sel);

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = text;
  return node;
}

const KITS = [
  { name: 'Navy', color: '#1d3577' },
  { name: 'Scarlet', color: '#c62a2f' },
  { name: 'Emerald', color: '#0f7a44' },
  { name: 'Gold', color: '#e3b31d' },
  { name: 'Sky', color: '#4aa2df' },
  { name: 'Black', color: '#18191b' },
  { name: 'Claret', color: '#7b1e3c' },
  { name: 'Orange', color: '#e8701c' },
];

const DEFAULT_SETUP = { mode: '1p', names: ['Ravens', 'Foxes'], colors: ['#1d3577', '#e8701c'], length: 'standard', cpu: 'pro' };
const DEFAULT_PREFS = { sound: true, odds: true, fast: false, autoDefence: false, haptics: true, cinema: 'full' };

const DIE_NOTES = {
  S: 'Plays first after every tackle',
  F: 'Big move: Line Break 6',
  C: 'Big move: Thru the Gap 7. Can drop goal',
  W: 'Big move: Into the Corner 8. Risky',
  B: 'Big move: High Ball 6. Can drop goal',
  D: 'Brown: tackles (two rolls) and kick range',
  K: 'Black: tries, kick distance, rucks, the card dot',
  R: 'White: scrums, lineouts and penalties',
};

const ui = {
  view: 'home',
  match: null,
  feed: [],
  busy: false,
  cpuTimer: null,
  pitch: null,
  shownScores: [0, 0],
  prefs: { ...DEFAULT_PREFS, ...load('prefs', {}) },
  setup: { ...DEFAULT_SETUP, ...load('setup', {}) },
  skip: null,
  wakeLock: null,
};

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const speed = () => (ui.prefs.fast ? 0.55 : 1);

// ---------- Views ----------

function showView(name) {
  ui.view = name;
  for (const v of ['home', 'setup', 'match']) $(`#view-${v}`).hidden = v !== name;
  if (name === 'home') renderHome();
  if (name === 'match') requestWakeLock();
  else releaseWakeLock();
}

function renderHome() {
  const saved = load('match', null);
  const resume = $('#btn-resume');
  const live = saved?.match && saved.match.step.type !== 'fulltime';
  resume.hidden = !live;
  if (live) {
    const m = saved.match;
    $('#resume-detail').textContent = `${scoreLine(m)} · ${m.half === 1 ? '1st' : '2nd'} half`;
  }
}

function buildHeroDice() {
  const host = $('#hero-dice');
  const show = { S: 0, F: 3, C: 2, W: 2, B: 2, D: 5, K: 0, R: 0 };
  host.innerHTML = '';
  Object.entries(show).forEach(([id, face], i) => {
    const die = createDie(id, face);
    host.append(die);
    if (!reducedMotion.matches) rollTo(die, face, { duration: 1100, delay: 120 + i * 90 });
  });
}

// ---------- Setup ----------

function renderSetup() {
  const s = ui.setup;
  $(`#mode-${s.mode}`).checked = true;
  $(`#len-${s.length}`).checked = true;
  $(`#cpu-${s.cpu}`).checked = true;
  $('#seg-cpu').hidden = s.mode !== '1p';
  $('#team0-tag').textContent = s.mode === '1p' ? 'You' : 'Player 1';
  $('#team1-tag').textContent = s.mode === '1p' ? 'CPU' : 'Player 2';
  for (const team of [0, 1]) {
    const input = $(`#team${team}-name`);
    if (document.activeElement !== input) input.value = s.names[team];
    const editor = document.querySelector(`.team-editor[data-team="${team}"]`);
    editor.style.setProperty('--kit', s.colors[team]);
    const host = $(`#team${team}-kits`);
    host.innerHTML = '';
    for (const kit of KITS) {
      const sw = el('button', 'swatch');
      sw.type = 'button';
      sw.style.setProperty('--kit', kit.color);
      sw.setAttribute('role', 'radio');
      sw.setAttribute('aria-label', kit.name);
      sw.setAttribute('aria-checked', String(s.colors[team] === kit.color));
      const taken = s.colors[1 - team] === kit.color;
      if (taken) sw.setAttribute('aria-disabled', 'true');
      sw.addEventListener('click', () => {
        if (taken) return;
        s.colors[team] = kit.color;
        renderSetup();
      });
      host.append(sw);
    }
  }
}

function bindSetup() {
  const form = $('#setup-form');
  form.addEventListener('change', e => {
    const s = ui.setup;
    if (e.target.name === 'mode') s.mode = e.target.value;
    if (e.target.name === 'length') s.length = e.target.value;
    if (e.target.name === 'cpu') s.cpu = e.target.value;
    renderSetup();
  });
  for (const team of [0, 1]) {
    $(`#team${team}-name`).addEventListener('input', e => {
      ui.setup.names[team] = e.target.value;
    });
  }
  form.addEventListener('submit', e => {
    e.preventDefault();
    const s = ui.setup;
    s.names = s.names.map((n, i) => (n || '').trim().slice(0, 14) || DEFAULT_SETUP.names[i]);
    if (s.names[0].toLowerCase() === s.names[1].toLowerCase()) s.names[1] += ' II';
    save('setup', s);
    unlockAudio();
    startMatch({ mode: s.mode, teams: [0, 1].map(i => ({ name: s.names[i], color: s.colors[i] })), length: s.length, cpuLevel: s.cpu });
  });
  $('#btn-setup-back').addEventListener('click', () => showView('home'));
}

// ---------- Match lifecycle ----------

function startMatch(options) {
  clearTimeout(ui.cpuTimer);
  ui.match = newMatch(options);
  ui.feed = [];
  ui.shownScores = [0, 0];
  persist();
  showView('match');
  showCoin();
  setHeadline('Coin toss', `${ui.match.teams[0].name} to call. The winner receives the kick-off.`);
  renderFeed(0);
  render();
  schedule();
}

function resumeMatch(saved) {
  clearTimeout(ui.cpuTimer);
  ui.match = saved.match;
  ui.feed = saved.feed || [];
  ui.shownScores = ui.match.teams.map(t => t.score);
  showView('match');
  const roll = ui.match.roll;
  if (roll) showDice(roll.dice, roll.faces, roll);
  else showCoin();
  setHeadline('Welcome back', scoreLine(ui.match));
  renderFeed(0);
  render();
  if (ui.match.step.type === 'halftime') openBreak();
  schedule();
}

function persist() {
  const m = ui.match;
  if (!m) return;
  save('match', m.step.type === 'fulltime' ? null : { match: m, feed: ui.feed.slice(0, 400) });
}

// ---------- Acting ----------

function humanAct(action) {
  unlockAudio();
  if (ui.busy) {
    ui.skip?.();
    return;
  }
  if (isAutomatic(ui.match)) {
    clearTimeout(ui.cpuTimer);
    runAutomatic();
    return;
  }
  dispatch(action);
}

async function dispatch(action) {
  if (ui.busy) return;
  clearTimeout(ui.cpuTimer);
  const before = ui.match;
  let result;
  try {
    result = act(before, action);
  } catch (err) {
    console.error(err);
    return;
  }
  ui.busy = true;
  ui.match = result.state;
  const story = narrate(result.events, ui.match);
  const half = before.half;
  ui.feed.unshift(...story.lines.slice().reverse().map(l => ({ ...l, half })));
  persist();
  lockDock();
  try {
    await present(before, ui.match, result.events, story);
  } catch (err) {
    console.error(err);
  }
  ui.busy = false;
  ui.skip = null;
  render();
  if (ui.match.step.type === 'halftime' || ui.match.step.type === 'fulltime') openBreak();
  schedule();
}

function isAutomatic(m) {
  if (!m || m.step.type === 'halftime' || m.step.type === 'fulltime') return false;
  if (controllerOf(m) === 'cpu') return true;
  return ui.prefs.autoDefence && m.mode === '1p' && m.step.type === 'roll' && (m.step.purpose === 'tackle' || m.step.purpose === 'ruck');
}

function schedule() {
  clearTimeout(ui.cpuTimer);
  if (ui.view !== 'match' || !isAutomatic(ui.match)) return;
  const thinking = ui.match.step.type === 'choose' ? 1000 : 750;
  ui.cpuTimer = setTimeout(runAutomatic, thinking * speed());
}

function runAutomatic() {
  if (ui.busy || document.querySelector('dialog[open]')) return;
  const m = ui.match;
  if (!isAutomatic(m)) return;
  dispatch(m.step.type === 'roll' ? { type: 'roll' } : { type: 'choose', value: cpuChoice(m) });
}

// Resolves after `ms`, or sooner if the player taps to hurry things along.
function skippable(ms) {
  return new Promise(resolve => {
    const done = () => {
      clearTimeout(timer);
      ui.skip = null;
      resolve();
    };
    const timer = setTimeout(done, ms);
    ui.skip = done;
  });
}

// ---------- Presentation ----------

const FOCUS = { kick: 'kick', penalty: 'card', try: 'result', ruck: 'result' };

// Which big moments get a full cinematic scene at each setting.
const SHORT_SCENES = new Set(['kickoff', 'try', 'kickcam', 'card', 'turnover', 'whistle', 'linebreak', 'bighit', 'notry']);
const cinemaLevel = () => (reducedMotion.matches ? 'off' : ui.prefs.cinema);
const wantsScene = kind => cinemaLevel() === 'full' || (cinemaLevel() === 'short' && SHORT_SCENES.has(kind));
const cinemaSpeed = () => (ui.prefs.cinema === 'short' ? 0.7 : 1) * (ui.prefs.fast ? 0.7 : 1);

// Moment kinds from the commentary, mapped to cinema scenes and their data.
function sceneFor(moment, after, events) {
  const team = moment.team === null || moment.team === undefined ? null : after.teams[moment.team];
  switch (moment.kind) {
    case 'try': return ['try', { team, pos: moment.pos, scoreline: scoreLine(after) }];
    case 'break': return ['linebreak', { team, pos: moment.pos }];
    case 'bighit': return ['bighit', { team, ruck: !!moment.ruck }];
    case 'turnover': return ['turnover', { team, title: moment.title, sub: moment.sub }];
    case 'injury': return ['injury', { team, pos: moment.pos, penalty: moment.penalty }];
    case 'yellow':
    case 'red': return ['card', { color: moment.kind, team }];
    case 'penalty': return ['penalty', { team }];
    case 'tmo': return ['tmo', {}];
    case 'notry': return ['notry', { team, heldUp: moment.heldUp }];
    case 'quicktap': return ['quicktap', { team }];
    case 'halftime': return ['whistle', { full: false, teams: after.teams }];
    case 'fulltime': return ['whistle', { full: true, teams: after.teams, winner: after.winner }];
    // Goals are shown by the kick cam when it plays.
    case 'goal':
    case 'conversion': return events.some(e => e.type === 'kick') && wantsScene('kickcam') ? ['none'] : null;
  }
  return null;
}

// Big hits read better before the injury they cause.
const MOMENT_ORDER = ['bighit', 'injury', 'break', 'try', 'notry', 'tmo', 'turnover', 'penalty', 'yellow', 'red', 'quicktap', 'goal', 'conversion', 'halftime', 'fulltime'];

async function present(before, after, events, story) {
  const has = type => events.find(e => e.type === type);
  const step = before.step;
  const covered = new Set();

  // Calls before the scrum feed or lineout throw.
  if (step.type === 'roll' && step.purpose === 'setpiece' && wantsScene('setpiece')) {
    await ui.cinema.play('setpiece', { piece: step.piece });
  }

  // Dice or coin.
  if (step.type === 'choose' && step.purpose === 'toss') {
    play('coin');
    await flipCoin(after.toss.result);
  } else if (step.type === 'roll' && after.roll) {
    const roll = after.roll;
    const dramatic = ['try', 'ruck', 'penalty', 'kick'].includes(step.purpose) && cinemaLevel() !== 'off';
    play('dice', roll.dice.length);
    if (dramatic) play('heartbeat', ui.prefs.fast ? 1 : 2);
    await showDice(roll.dice, roll.faces, roll, true, dramatic);
    play('land');
    if (ui.prefs.haptics) buzz(12);
  }

  // A kick needs its flight before the verdict.
  const kick = has('kick');
  if (kick) {
    if (wantsScene('kickcam')) {
      covered.add('kick');
      await ui.cinema.play('kickcam', { team: after.teams[kick.team], kick: kick.kick, range: kick.range, distance: kick.distance, good: kick.good });
    } else {
      play('kick');
      await ui.pitch.flourish('kick', after, { team: kick.team, good: kick.good });
    }
  }

  const tryEvent = has('try');
  if (tryEvent) ui.pitch.flourish('try', after, { team: tryEvent.team, pos: tryEvent.pos });

  if (story.headline) setHeadline(story.headline, story.detail);
  renderFeed(story.lines.length);

  const moments = story.moments
    .map(moment => ({ moment, scene: sceneFor(moment, after, events) }))
    .sort((a, b) => MOMENT_ORDER.indexOf(a.moment.kind) - MOMENT_ORDER.indexOf(b.moment.kind));
  for (const { scene } of moments) if (scene && wantsScene(scene[0])) covered.add(scene[0]);
  soundFor(events, covered);

  if (tryEvent) await wait(450 * speed());
  ui.pitch.update(after, { slow: !!has('lineBreak') && wantsScene('linebreak') });
  renderBoard(after);
  renderSituation(after);

  // The second half (and the match) opens with a title card.
  if (has('toss') || has('secondHalf')) {
    if (wantsScene('kickoff')) await ui.cinema.play('kickoff', { teams: after.teams, half: after.half, target: after.target });
  }

  for (const { moment, scene } of moments) {
    if (scene?.[0] === 'none') continue;
    if (scene && wantsScene(scene[0])) await ui.cinema.play(scene[0], scene[1]);
    else await showMoment(moment);
  }
}

// Scenes play their own sound; anything they cover is skipped here.
function soundFor(events, covered) {
  const haptic = pattern => ui.prefs.haptics && buzz(pattern);
  const quiet = scene => covered.has(scene);
  for (const e of events) {
    switch (e.type) {
      case 'tackle':
        if (e.outcome !== 'tackle' && quiet('bighit')) break;
        play('thud', e.outcome !== 'tackle');
        if (e.outcome !== 'tackle') haptic([30, 40, 50]);
        break;
      case 'lineBreak': if (!quiet('linebreak')) { play('cheer'); haptic(40); } break;
      case 'try': if (!quiet('try')) { play('whistle'); play('cheer'); } haptic([60, 50, 140]); break;
      case 'noTry': if (!quiet('notry')) play('groan'); break;
      case 'kick': if (!quiet('kick')) play(e.good ? 'cheer' : 'groan'); break;
      case 'error': play('whistle'); break;
      case 'intercept': if (!quiet('turnover')) { play('cheer'); haptic(40); } break;
      case 'penalty': if (!quiet('penalty')) play('whistle'); break;
      case 'card': if (!quiet('card')) { play('whistle'); haptic([80, 60, 80]); } break;
      case 'injury': if (!quiet('injury')) play('groan'); break;
      case 'ruck': if (e.won && !quiet('turnover')) play('whistle'); break;
      case 'videoRef': if (!quiet('tmo')) play('beep'); break;
      case 'halftime':
      case 'fulltime': if (!quiet('whistle')) { play('whistle', true); if (e.type === 'fulltime') play('cheer'); } break;
      case 'secondHalf': if (!wantsScene('kickoff')) play('whistle'); break;
    }
  }
}

function setHeadline(headline, detail) {
  $('#headline').textContent = headline || '';
  $('#detail').textContent = detail || '';
}

async function showDice(ids, faces, roll, animate = false, dramatic = false) {
  const host = $('#tray-dice');
  const tray = $('#tray');
  tray.classList.toggle('dramatic', dramatic);
  tray.dataset.focus = roll.purpose === 'setpiece' ? roll.piece : FOCUS[roll.purpose] || '';
  host.innerHTML = '';
  const dice = ids.map((id, i) => createDie(id, faces[i]));
  dice.forEach(d => host.append(d));
  if (!animate) {
    dice.forEach((d, i) => {
      setFace(d, faces[i]);
      d.classList.add('landed');
    });
    return;
  }
  // Rolls that decide a try, a kick, a card or a ruck tumble for longer.
  const duration = 950 * speed() * (dramatic ? 1.7 : 1);
  const reduced = reducedMotion.matches;
  dice.forEach(d => setFace(d, Math.floor(Math.random() * 6)));
  await Promise.all(dice.map((d, i) => rollTo(d, faces[i], { duration, delay: i * 160 * speed(), reduced })));
  tray.classList.remove('dramatic');
}

function showCoin() {
  const host = $('#tray-dice');
  $('#tray').dataset.focus = '';
  host.innerHTML = `
    <div class="coin" role="img" aria-label="Coin">
      <div class="coin-inner"><div class="coin-side heads">Heads</div><div class="coin-side tails">Tails</div></div>
    </div>`;
}

async function flipCoin(result) {
  showCoin();
  const inner = $('#tray-dice .coin-inner');
  const turns = 5 * 360 + (result === 'tails' ? 180 : 0);
  if (reducedMotion.matches) {
    inner.style.transform = `rotateX(${turns}deg)`;
    return;
  }
  inner.animate([
    { transform: 'translateY(0) rotateX(0deg)' },
    { transform: `translateY(-60px) rotateX(${turns / 2}deg)`, offset: 0.5 },
    { transform: `translateY(0) rotateX(${turns}deg)` },
  ], { duration: 1300 * speed(), easing: 'cubic-bezier(.3,.6,.4,1)', fill: 'forwards' });
  await wait(1300 * speed());
}

async function showMoment(moment) {
  const host = $('#moment');
  if (moment.kind === 'halftime' || moment.kind === 'fulltime') return;
  host.innerHTML = '';
  const band = el('div', 'moment-band');
  if (moment.kind === 'yellow' || moment.kind === 'red') {
    band.classList.add('card', moment.kind);
    band.style.setProperty('--card-color', moment.kind === 'yellow' ? '#f5cf1d' : '#e2382c');
  } else if (moment.team !== null) {
    kitVars(band, ui.match.teams[moment.team]);
  }
  band.append(el('b', null, moment.title), el('span', null, moment.sub));
  host.append(band);
  host.hidden = false;
  if (moment.kind === 'try' || moment.kind === 'goal') confetti(ui.match.teams[moment.team].color);
  const ms = { try: 1800, goal: 1400, conversion: 1000, break: 850, bighit: 800, turnover: 1100, injury: 1400, yellow: 1500, red: 1700, penalty: 900 }[moment.kind] || 1000;
  await skippable(ms * speed());
  band.classList.add('out');
  await wait(240);
  host.hidden = true;
  host.innerHTML = '';
}

function confetti(color) {
  if (reducedMotion.matches) return;
  const canvas = $('#confetti');
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  const c = canvas.getContext('2d');
  c.scale(dpr, dpr);
  const colors = [color, '#ffffff', '#f5cf1d', color];
  const bits = Array.from({ length: 110 }, () => ({
    x: rect.width / 2 + (Math.random() - 0.5) * rect.width * 0.4,
    y: rect.height * 0.45,
    vx: (Math.random() - 0.5) * 9,
    vy: -6 - Math.random() * 9,
    r: Math.random() * Math.PI,
    vr: (Math.random() - 0.5) * 0.4,
    w: 5 + Math.random() * 6,
    h: 3 + Math.random() * 4,
    color: colors[Math.floor(Math.random() * colors.length)],
  }));
  const start = performance.now();
  const frame = now => {
    const t = now - start;
    c.clearRect(0, 0, rect.width, rect.height);
    for (const b of bits) {
      b.vy += 0.32;
      b.vx *= 0.99;
      b.x += b.vx;
      b.y += b.vy;
      b.r += b.vr;
      c.save();
      c.globalAlpha = Math.max(0, 1 - t / 2200);
      c.translate(b.x, b.y);
      c.rotate(b.r);
      c.fillStyle = b.color;
      c.fillRect(-b.w / 2, -b.h / 2, b.w, b.h);
      c.restore();
    }
    if (t < 2200) requestAnimationFrame(frame);
    else c.clearRect(0, 0, rect.width, rect.height);
  };
  requestAnimationFrame(frame);
}

// ---------- Rendering ----------

function render() {
  const m = ui.match;
  if (!m) return;
  $('#period').textContent = `${m.mode === '1p' ? '1 player' : '2 players'} · ${MATCH_LENGTHS[m.length].label}`;
  renderBoard(m);
  renderSituation(m);
  ui.pitch.update(m);
  renderDock(m, false);
}

function renderBoard(m) {
  const over = m.step.type === 'fulltime';
  $('#board-half').textContent = over ? 'Full time' : m.step.type === 'halftime' ? 'Half time' : m.half === 1 ? '1st half' : '2nd half';
  $('#board-target').textContent = m.half === 1 ? `HT ${m.target.half}\nFT ${m.target.full}` : `First to\n${m.target.full}`;
  for (const team of [0, 1]) {
    const t = m.teams[team];
    const side = document.querySelector(`.side[data-team="${team}"]`);
    kitVars(side, t);
    side.querySelector('.side-name').textContent = t.name;
    const score = side.querySelector('.side-score');
    if (t.score !== ui.shownScores[team]) {
      // Flip the digits like a stadium board: the new number shows at the halfway turn.
      score.classList.remove('flip');
      void score.offsetWidth;
      score.classList.add('flip');
      const value = t.score;
      setTimeout(() => (score.textContent = value), 250);
      ui.shownScores[team] = t.score;
    } else {
      score.textContent = t.score;
    }
    side.querySelector('.side-bar i').style.width = `${Math.min(100, (t.score / m.target.full) * 100)}%`;
    const hasBall = m.attacker === team && !over && m.step.type !== 'halftime';
    side.classList.toggle('has-ball', hasBall);
    side.querySelector('.poss').hidden = !hasBall;

    const status = side.querySelector('.side-status');
    status.innerHTML = '';
    if (t.yellows >= 2) status.append(chip('Red −2/die', 'red'));
    else if (t.sinBin) status.append(chip('Sin bin −1/die', 'yellow'));
    for (const pos of POSITIONS) {
      if (t.injuries[pos]) {
        const c = chip(`${pos} −${t.injuries[pos]}`, null, 'inj');
        c.title = `${PLAYERS[pos].name} injured: runs at −${t.injuries[pos]}`;
        status.append(c);
      }
    }
    if (m.attacker === team && m.quickTap > 0) status.append(chip(`Tap +1 ×${m.quickTap}`, null, 'tap'));
  }
}

function chip(text, card = null, extra = '') {
  const c = el('span', `chip ${extra}`.trim());
  if (card) c.append(el('i', `card ${card}`));
  if (extra === 'inj') c.append(el('i', 'cross'));
  c.append(document.createTextNode(text));
  return c;
}

function renderSituation(m) {
  const host = $('#situation');
  host.innerHTML = '';
  const step = m.step;
  if (m.attacker === null || step.type !== 'roll' && step.type !== 'choose') return;
  const open = ['attack', 'tackle', 'ruck', 'try', 'pass'].includes(step.purpose);
  if (open) host.append(chip(`Phase ${m.phase}`));
  if (m.quickTap > 0 && open) host.append(chip(`Quick tap +1 · ${m.quickTap} left`, null, 'tap'));
  if (step.purpose === 'setpiece') host.append(chip(step.piece === 'scrum' ? 'Scrum' : 'Lineout'));
  if (step.purpose === 'kick' || step.purpose === 'drop' || (step.type === 'choose' && step.purpose === 'penalty')) {
    host.append(chip(`${metres(step.range)} out`));
  }
}

function renderFeed(freshCount) {
  const list = $('#feed-list');
  list.innerHTML = '';
  ui.feed.slice(0, 3).forEach((line, i) => list.append(feedItem(line, i < freshCount)));
  if (freshCount) $('#announcer').textContent = ui.feed.slice(0, freshCount).reverse().map(l => l.text).join(' ');
}

function feedItem(line, fresh) {
  const li = el('li', `${line.tone || ''}${fresh ? ' fresh' : ''}`);
  const dot = el('i');
  if (line.team !== null && line.team !== undefined && ui.match) dot.style.setProperty('--kit', ui.match.teams[line.team].color);
  li.append(dot, el('span', null, line.text));
  return li;
}

function renderLog() {
  const list = $('#log-list');
  list.innerHTML = '';
  let half = null;
  for (const line of ui.feed) {
    if (line.half !== half) {
      half = line.half;
      const head = el('li');
      head.append(el('span', 'log-half', half === 2 ? 'Second half' : 'First half'));
      head.style.display = 'block';
      list.append(head);
    }
    list.append(feedItem(line, false));
  }
  if (!ui.feed.length) list.append(el('li', null, 'Nothing has happened yet.'));
}

// ---------- Dock ----------

const ROLL_TEXT = {
  attack: step => [`Roll ${PLAYERS[step.dice[0]].name}`, step.dice],
  tackle: () => ['Tackle!', ['D', 'D']],
  ruck: () => ['Contest the ruck', ['K']],
  try: step => [step.videos ? 'Video ref: roll again' : 'Go for the line', ['K']],
  range: step => [step.kick === 'conversion' ? 'Roll conversion range' : 'Roll drop-goal range', ['D']],
  penalty: () => ['Card check & range', ['K', 'D']],
  kick: step => [`Kick! Need ${metres(step.range)}`, ['K']],
  setpiece: step => [step.piece === 'scrum' ? 'Feed the scrum' : 'Throw in', ['R']],
};

function promptText(m) {
  const step = m.step;
  const pos = PLAYERS[m.carrier]?.name;
  switch (step.purpose) {
    case 'toss': return 'Call the coin toss';
    case 'attack': return `Phase ${m.phase} · ${PLAYERS[step.dice[0]].name} has the ball`;
    case 'tackle': return `Defending · stop intensity ${step.intensity}`;
    case 'ruck': return 'Big hit · fight for the ball';
    case 'try': return `${PLAYERS[step.carrier].name} is through`;
    case 'range': return step.kick === 'conversion' ? 'Conversion' : `Drop goal chance · ${pos}`;
    case 'penalty': return 'Penalty awarded';
    case 'kick': return `${{ conversion: 'Conversion', penalty: 'Penalty kick', drop: 'Drop goal' }[step.kick]} · ${Math.round(kickChance(step.range) * 100)}% to land`;
    case 'setpiece': return step.piece === 'scrum' ? 'Your scrum feed' : 'Your lineout throw';
    case 'pass': return `${PLAYERS[step.from].name} passes · pick a receiver`;
    case 'drop': return `${metres(step.range)} out · kick or pass?`;
  }
  if (step.type === 'halftime') return 'Half time';
  if (step.type === 'fulltime') return 'Full time';
  return '';
}

// While the dice are in the air the old buttons stay put, greyed out.
function lockDock() {
  document.querySelectorAll('#actions button').forEach(b => {
    if (!b.classList.contains('waiting')) b.disabled = true;
  });
}

function renderDock(m, locked) {
  const prompt = $('#prompt');
  const actions = $('#actions');
  prompt.innerHTML = '';
  actions.innerHTML = '';
  actions.className = 'actions';
  const step = m.step;

  if (step.type === 'halftime') {
    prompt.append(el('span', null, 'Half time'));
    actions.append(simpleButton('Start the second half', () => dispatch({ type: 'continue' }), 'btn btn-primary'));
    return;
  }
  if (step.type === 'fulltime') {
    prompt.append(el('span', null, 'Full time'));
    actions.append(simpleButton('Full-time report', openBreak, 'btn btn-primary'));
    return;
  }

  const team = m.teams[step.team];
  const swatch = el('span', 'kit');
  kitVars(swatch, team);
  const cpuTurn = isAutomatic(m);
  prompt.append(swatch, el('b', null, team.name), el('span', null, `· ${promptText(m)}`));

  if (step.type === 'roll' || cpuTurn) {
    const [label, chips] = step.type === 'roll' ? ROLL_TEXT[step.purpose](step) : ['Thinking', []];
    const btn = el('button', 'roll-btn');
    btn.type = 'button';
    btn.dataset.primary = '';
    kitVars(btn, team);
    if (cpuTurn) {
      btn.classList.add('waiting');
      const who = controllerOf(m) === 'cpu' ? team.name : 'Auto-tackle';
      btn.append(el('span', null, step.type === 'roll' ? `${who}: ${label}` : `${who} deciding`));
      btn.setAttribute('aria-label', `${who} is playing. Tap to hurry.`);
    } else {
      const chipRow = el('span', 'chips');
      chips.forEach(id => chipRow.append(dieChip(id, POSITIONS.includes(id) ? id : '')));
      btn.append(chipRow, el('span', null, label));
    }
    btn.disabled = locked && !cpuTurn;
    btn.addEventListener('click', () => humanAct({ type: 'roll' }));
    actions.append(btn);
    return;
  }

  // Human decisions.
  const tip = ui.prefs.odds ? suggestedChoice(m) : null;
  const choose = value => () => humanAct({ type: 'choose', value });
  if (step.purpose === 'toss') {
    actions.classList.add('two');
    actions.append(choiceButton({ icon: 'H', title: 'Heads', onClick: choose('heads'), locked }));
    actions.append(choiceButton({ icon: 'T', title: 'Tails', onClick: choose('tails'), locked }));
    return;
  }
  if (step.purpose === 'pass') {
    actions.classList.add(step.options.length === 3 ? 'three' : 'two');
    for (const pos of step.options) {
      const odds = receiverOdds(m, step.team, pos);
      actions.append(choiceButton({
        die: pos,
        title: PLAYERS[pos].name,
        sub: `${odds.special.label} ${odds.special.value}`,
        odds: ui.prefs.odds ? [[`Break ${pct(odds.lineBreak)}`, 'up'], [`Error ${pct(odds.error)}`, 'down']] : null,
        suggested: tip === pos,
        onClick: choose(pos),
        locked,
      }));
    }
    return;
  }
  if (step.purpose === 'drop') {
    actions.classList.add('two');
    const p = kickChance(step.range);
    actions.append(choiceButton({
      icon: '3',
      title: 'Drop goal',
      sub: `Need a ${metres(step.range)} kick`,
      odds: ui.prefs.odds ? [[`${pct(p)} to land`, p >= 0.5 ? 'up' : 'down']] : null,
      suggested: tip === 'kick',
      onClick: choose('kick'),
      locked,
    }));
    actions.append(choiceButton({ icon: '→', title: 'Pass', sub: 'Keep it in hand', suggested: tip === 'pass', onClick: choose('pass'), locked }));
    return;
  }
  if (step.purpose === 'penalty') {
    actions.classList.add('two');
    const p = kickChance(step.range);
    actions.append(choiceButton({
      icon: '3',
      title: 'Kick at goal',
      sub: `Need a ${metres(step.range)} kick`,
      odds: ui.prefs.odds ? [[`${pct(p)} to land`, p >= 0.5 ? 'up' : 'down']] : null,
      suggested: tip === 'kick',
      onClick: choose('kick'),
      locked,
    }));
    actions.append(choiceButton({ icon: '+1', title: 'Quick tap', sub: `+1 intensity on your next ${QUICK_TAP_RUNS} runs`, suggested: tip === 'tap', onClick: choose('tap'), locked }));
  }
}

const pct = p => `${Math.round(p * 100)}%`;

function simpleButton(text, onClick, className) {
  const b = el('button', className, text);
  b.type = 'button';
  b.dataset.primary = '';
  b.addEventListener('click', () => {
    unlockAudio();
    onClick();
  });
  return b;
}

function choiceButton({ die, icon, title, sub, odds, suggested, onClick, locked }) {
  const b = el('button', `choice${suggested ? ' suggested' : ''}${sub || odds ? '' : ' simple'}`);
  b.type = 'button';
  b.dataset.choice = '';
  if (die) b.append(dieChip(die));
  else b.append(el('span', 'ico', icon));
  b.append(el('b', null, title));
  if (sub) b.append(el('small', null, sub));
  if (odds) {
    const row = el('span', 'odds');
    for (const [text, cls] of odds) row.append(el('span', cls, text));
    b.append(row);
  }
  b.disabled = locked;
  b.addEventListener('click', onClick);
  return b;
}

// ---------- Break screens ----------

const STAT_ROWS = [
  ['Tries', s => s.tries],
  ['Conversions', s => `${s.conversions}/${s.conversionAttempts}`, s => s.conversions],
  ['Penalty goals', s => `${s.penaltyGoals}/${s.penaltyAttempts}`, s => s.penaltyGoals],
  ['Drop goals', s => `${s.dropGoals}/${s.dropAttempts}`, s => s.dropGoals],
  ['Line breaks', s => s.lineBreaks],
  ['Tackles made', s => s.tackles],
  ['Big hits', s => s.bigHits],
  ['Turnovers won', s => s.turnoversWon],
  ['Errors', s => s.errors, s => -s.errors],
  ['Penalties conceded', s => s.penaltiesConceded, s => -s.penaltiesConceded],
  ['Cards', s => s.cards, s => -s.cards],
];

function openBreak() {
  const m = ui.match;
  const full = m.step.type === 'fulltime';
  const dlg = $('#dlg-break');
  const [a, b] = m.teams;
  let title = full ? `${m.teams[m.winner].name} win` : 'Half time';
  if (full && m.mode === '1p') title = m.winner === 0 ? 'You win!' : `${m.teams[m.winner].name} win`;
  $('#break-kicker').textContent = full ? 'Full time' : `${MATCH_LENGTHS[m.length].label} match`;
  $('#break-title').textContent = title;

  const score = $('#break-score');
  score.innerHTML = '';
  const teamCell = (t, team) => {
    const cell = el('div', 'bs-team');
    const name = el('span', 'bs-name');
    const kit = el('span', 'kit');
    kitVars(kit, t);
    name.append(kit, el('span', null, t.name));
    cell.append(name, el('span', 'bs-num', t.score));
    cell.dataset.team = team;
    return cell;
  };
  score.append(teamCell(a, 0), el('span', 'bs-dash', '–'), teamCell(b, 1));

  const table = $('#break-stats');
  table.innerHTML = '';
  const rows = full ? STAT_ROWS : STAT_ROWS.filter(([label]) => ['Tries', 'Line breaks', 'Tackles made', 'Penalties conceded', 'Cards'].includes(label));
  for (const [label, show, rank = show] of rows) {
    const tr = el('tr');
    const [ra, rb] = [rank(a.stats), rank(b.stats)];
    const left = el('td', ra > rb ? 'lead' : '', show(a.stats));
    const right = el('td', rb > ra ? 'lead' : '', show(b.stats));
    tr.append(left, el('td', 'label', label), right);
    table.append(tr);
  }

  const actions = $('#break-actions');
  actions.innerHTML = '';
  if (full) {
    actions.append(simpleButton('Rematch', () => {
      dlg.close();
      startMatch(matchOptions(m));
    }, 'btn btn-primary'));
    actions.append(simpleButton('New team sheet', () => {
      dlg.close();
      openSetup();
    }, 'btn'));
    actions.append(simpleButton('Title screen', () => {
      dlg.close();
      showView('home');
    }, 'btn btn-quiet'));
  } else {
    const notes = m.teams.filter(t => t.sinBin).map(t => `${t.name}'s sin-binned player returns.`);
    actions.append(simpleButton('Start the second half', () => {
      dlg.close();
      dispatch({ type: 'continue' });
    }, 'btn btn-primary'));
    if (notes.length) actions.prepend(el('p', null, notes.join(' ')));
    actions.append(simpleButton('Keep looking at the pitch', () => dlg.close(), 'btn btn-quiet'));
  }
  if (!dlg.open) dlg.showModal();
  dlg.scrollTop = 0;
  $('#break-title').focus({ preventScroll: true });
}

function matchOptions(m) {
  return { mode: m.mode, teams: m.teams.map(t => ({ name: t.name, color: t.color })), length: m.length, cpuLevel: m.cpuLevel };
}

function openSetup() {
  renderSetup();
  showView('setup');
}

// ---------- Dialogs & settings ----------

function openDialog(id) {
  const dlg = document.getElementById(id);
  document.querySelectorAll('dialog[open]').forEach(d => d !== dlg && d.close());
  if (id === 'dlg-log') renderLog();
  if (id === 'dlg-settings') renderSettings();
  if (!dlg.open) dlg.showModal();
}

function bindDialogs() {
  document.addEventListener('click', e => {
    const opener = e.target.closest('[data-open]');
    if (opener) openDialog(opener.dataset.open);
    const closer = e.target.closest('[data-close]');
    if (closer) closer.closest('dialog').close();
  });
  document.querySelectorAll('dialog').forEach(dlg => {
    dlg.addEventListener('click', e => {
      if (e.target === dlg && dlg.id !== 'dlg-break') dlg.close();
    });
    dlg.addEventListener('close', () => {
      if (!document.querySelector('dialog[open]')) schedule();
    });
  });
  $('#btn-menu').addEventListener('click', () => openDialog('dlg-menu'));
  $('#feed').addEventListener('click', e => {
    if (!e.target.closest('button')) openDialog('dlg-log');
  });
  $('#btn-restart').addEventListener('click', () => openDialog('dlg-confirm'));
  $('#btn-confirm-restart').addEventListener('click', () => {
    $('#dlg-confirm').close();
    startMatch(matchOptions(ui.match));
  });
  $('#btn-quit').addEventListener('click', () => {
    $('#dlg-menu').close();
    clearTimeout(ui.cpuTimer);
    persist();
    showView('home');
  });
  $('#btn-sound').addEventListener('click', () => {
    setPref('sound', !ui.prefs.sound);
    unlockAudio();
    play('tick');
  });
}

function renderSettings() {
  $('#set-sound').checked = ui.prefs.sound;
  $('#set-odds').checked = ui.prefs.odds;
  $('#set-fast').checked = ui.prefs.fast;
  $('#set-autodef').checked = ui.prefs.autoDefence;
  $('#set-haptics').checked = ui.prefs.haptics;
  $('#set-cinema').value = ui.prefs.cinema;
}

function bindSettings() {
  const map = { 'set-sound': 'sound', 'set-odds': 'odds', 'set-fast': 'fast', 'set-autodef': 'autoDefence', 'set-haptics': 'haptics' };
  for (const [id, key] of Object.entries(map)) {
    $(`#${id}`).addEventListener('change', e => setPref(key, e.target.checked));
  }
  $('#set-cinema').addEventListener('change', e => setPref('cinema', e.target.value));
}

function setPref(key, value) {
  ui.prefs[key] = value;
  save('prefs', ui.prefs);
  applyPrefs();
  if (ui.view === 'match' && !ui.busy) render();
}

function applyPrefs() {
  setSoundEnabled(ui.prefs.sound);
  ui.pitch.setCamera(cinemaLevel() !== 'off');
  const btn = $('#btn-sound');
  btn.setAttribute('aria-pressed', String(ui.prefs.sound));
  btn.setAttribute('aria-label', ui.prefs.sound ? 'Sound on' : 'Sound off');
}

function buildDiceReference() {
  const host = $('#dice-ref');
  host.innerHTML = '';
  for (const id of ['S', 'F', 'C', 'W', 'B', 'D', 'K', 'R']) {
    const row = el('div', 'dice-ref-row');
    const h = el('h4');
    h.append(dieChip(id, POSITIONS.includes(id) ? id : ''), el('span', null, DICE[id].name), el('small', null, DIE_NOTES[id]));
    const faces = el('div', 'dice-ref-faces');
    DICE[id].faces.forEach((_, i) => faces.append(faceTile(id, i)));
    row.append(h, faces);
    host.append(row);
  }
}

// ---------- Keyboard ----------

function bindKeys() {
  document.addEventListener('keydown', e => {
    if (ui.view !== 'match' || document.querySelector('dialog[open]')) return;
    if (e.target.closest('input, textarea')) return;
    if (e.key === ' ' || e.key === 'Enter') {
      const primary = document.querySelector('#actions [data-primary]');
      if (primary && !e.target.closest('button')) {
        e.preventDefault();
        primary.click();
      } else if (ui.busy) {
        e.preventDefault();
        if (ui.cinema.active) ui.cinema.skip();
        else ui.skip?.();
      }
    }
    const n = Number(e.key);
    if (n >= 1 && n <= 4) document.querySelectorAll('#actions [data-choice]')[n - 1]?.click();
    if (e.key === 'Escape') openDialog('dlg-menu');
  });
  $('#tray').addEventListener('click', () => ui.skip?.());
}

// ---------- Screen wake lock ----------

async function requestWakeLock() {
  try {
    if (!ui.wakeLock && navigator.wakeLock && document.visibilityState === 'visible') {
      ui.wakeLock = await navigator.wakeLock.request('screen');
      ui.wakeLock.addEventListener('release', () => (ui.wakeLock = null));
    }
  } catch {
    ui.wakeLock = null;
  }
}

function releaseWakeLock() {
  ui.wakeLock?.release().catch(() => {});
  ui.wakeLock = null;
}

// ---------- Boot ----------

function start(data = {}) {
  ui.pitch = createPitch($('#pitch'));
  ui.cinema = createCinema($('#cinema'), $('#view-match'), { speed: cinemaSpeed, haptics: () => ui.prefs.haptics });
  buildHeroDice();
  buildDiceReference();
  bindSetup();
  bindDialogs();
  bindSettings();
  bindKeys();
  applyPrefs();

  document.querySelectorAll('[data-start]').forEach(btn => btn.addEventListener('click', () => {
    unlockAudio();
    ui.setup.mode = btn.dataset.start;
    openSetup();
  }));
  $('#btn-resume').addEventListener('click', () => {
    unlockAudio();
    const saved = load('match', null);
    if (saved?.match) resumeMatch(saved);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && ui.view === 'match') requestWakeLock();
    else persist();
  });

  window.claude?.hot?.snapshot?.(() => ({ match: ui.match, feed: ui.feed, view: ui.view }));

  if (data.match && data.view === 'match') resumeMatch(data);
  else showView('home');

  if ('serviceWorker' in navigator && window.isSecureContext && window.self === window.top && document.documentElement.classList.contains('standalone')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

const hot = window.claude?.hot;
if (hot?.ready) hot.ready(start);
else start(hot?.data ?? {});
