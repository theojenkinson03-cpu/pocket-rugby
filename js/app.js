// Screen controller: menus, the match loop, animation and persistence.

import { act, controllerOf, kickBonus, kickChance, MATCH_LENGTHS, migrate, newMatch, QUICK_TAP_RUNS, receiverOdds } from './engine.js';
import { cpuChoiceAsync, LEVELS, suggestedChoice } from './ai.js';
import { DICE, PLAYERS, POSITIONS } from './dice.js';
import { CARD_BY_ID, CARDS } from './cards.js';
import { metres, narrate, scoreLine } from './commentary.js';
import { playerOfTheMatch, possessive, randomRoster, statLine, surname } from './players.js';
import { winProbability } from './winprob.js';
import { ACHIEVEMENT_BY_ID, newCareer, newTracker, recordMatch, track } from './career.js';
import { tipFor, tipText } from './coach.js';
import { advance, clash, createCup, createLeague, matchOptions, recordResult, resultFromMatch, simulateRound, STAGE_NAMES, standings, teamOf, userAlive, userFixture, userRecord } from './tournament.js';
import { applyRemote, encodeAction, hashState, makeCode, normaliseCode, OnlineSession, pendingEntries, recordingRng, startingMatch, strongRandom, validCode } from './online.js';
import { $, button, el } from './dom.js';
import { createDie, dieChip, faceTile, rollTo, setFace, wait } from './dice-view.js';
import { cardArt, cardChip, cardUses } from './card-view.js';
import { careerPage } from './career-view.js';
import { fixtureLabel, tournamentHub, tournamentSetup } from './tournament-view.js';
import { lobbyPage } from './online-view.js';
import { momentumChart, momentumFacts, playersTables, potmCard } from './report.js';
import { createCinema } from './cinema.js';
import { createPitch } from './pitch.js';
import { buzz, play, setSoundEnabled, unlockAudio } from './audio.js';
import { kitVars } from './color.js';
import { load, save } from './store.js';

// Both phones in an online match must run the same rules: bump this when
// anything that changes a match's outcome changes.
const BUILD = 'pr-2.0';

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

const DEFAULT_SETUP = { mode: '1p', names: ['Ravens', 'Foxes'], colors: ['#1d3577', '#e8701c'], length: 'standard', cpu: 'pro', style: 'balanced', cards: true, rosters: null };
const DEFAULT_PREFS = { sound: true, odds: true, fast: false, autoDefence: false, haptics: true, cinema: 'full', meter: true, coach: true };

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
  // What kind of match this is: {kind: 'quick'|'2p'|'learn'|'tournament'|'online', ...}
  context: null,
  feed: [],
  history: [],
  tracker: null,
  outcome: null,
  busy: false,
  thinking: false,
  cpuTimer: null,
  pitch: null,
  cinema: null,
  shownScores: [0, 0],
  prefs: { ...DEFAULT_PREFS, ...load('prefs', {}) },
  setup: { ...DEFAULT_SETUP, ...load('setup', {}) },
  career: { ...newCareer(), ...load('career', {}) },
  coachSeen: load('coach', []),
  coach: null,
  tournament: load('tournament', null),
  tsetup: { kind: 'cup', team: null, length: 'quick', cards: true },
  online: null,
  lobby: null,
  roomPromise: null,
  netError: null,
  squad: null,
  skip: null,
  wakeLock: null,
};

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const speed = () => (ui.prefs.fast ? 0.55 : 1);
const pct = p => `${Math.round(p * 100)}%`;
const other = team => 1 - team;
const ordinal = n => `${n}${['th', 'st', 'nd', 'rd'][(n % 100 > 10 && n % 100 < 14) || n % 10 > 3 ? 0 : n % 10]}`;
const showOdds = () => ui.prefs.odds || ui.context?.kind === 'learn';

// ---------- Views ----------

const VIEWS = ['home', 'setup', 'match', 'tournament', 'career', 'online'];

function showView(name) {
  ui.view = name;
  for (const v of VIEWS) $(`#view-${v}`).hidden = v !== name;
  if (name === 'home') renderHome();
  if (name === 'match') requestWakeLock();
  else {
    releaseWakeLock();
    hideCoach(false);
  }
}

function contextLabel(context) {
  if (!context) return null;
  if (context.kind === 'learn') return 'Guided match';
  if (context.kind === 'online') return 'Online';
  if (context.kind === 'tournament') {
    const t = ui.tournament;
    const f = t?.fixtures.find(x => x.id === context.fixture);
    return f ? `${t.name} · ${fixtureLabel(t, f)}` : null;
  }
  return null;
}

function renderHome() {
  const saved = load('match', null);
  const resume = $('#btn-resume');
  const live = saved?.match && saved.match.step.type !== 'fulltime';
  resume.hidden = !live;
  if (live) {
    const m = saved.match;
    const where = contextLabel(saved.context);
    $('#resume-detail').textContent = `${scoreLine(m)} · ${m.half === 1 ? '1st' : '2nd'} half${where ? ` · ${where}` : ''}`;
  }
  const newcomer = ui.career.played === 0 && !ui.career.achievements.graduate;
  $('#btn-learn').hidden = !newcomer;
  $('#link-learn').hidden = newcomer;
  const t = ui.tournament;
  if (t && t.stage !== 'done') {
    $('#tournament-label').textContent = `Continue the ${t.name}`;
    $('#tournament-detail').textContent = `${teamOf(t, t.userTeam).name} · ${STAGE_NAMES[t.stage]}`;
  } else {
    $('#tournament-label').textContent = 'Nations Cup & League';
    $('#tournament-detail').textContent = 'Pools, knockouts and a trophy';
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

function ensureRosters() {
  const s = ui.setup;
  if (!Array.isArray(s.rosters) || s.rosters.length !== 2 || !s.rosters.every(r => r && POSITIONS.every(p => typeof r[p] === 'string'))) {
    s.rosters = [randomRoster(), randomRoster()];
    save('setup', s);
  }
}

const squadLine = roster => POSITIONS.map(p => (roster[p] || '').replace(/^[A-Z]\.\s*/, '')).filter(Boolean).join(', ');

function renderSetup() {
  const s = ui.setup;
  ensureRosters();
  $(`#mode-${s.mode}`).checked = true;
  $(`#len-${s.length}`).checked = true;
  $(`#cpu-${s.cpu}`).checked = true;
  $(`#style-${s.style}`).checked = true;
  $('#setup-cards').checked = s.cards;
  $('#seg-cpu').hidden = s.mode !== '1p';
  $('#seg-style').hidden = s.mode !== '1p';
  $('#team0-tag').textContent = s.mode === '1p' ? 'You' : 'Player 1';
  $('#team1-tag').textContent = s.mode === '1p' ? 'CPU' : 'Player 2';
  for (const team of [0, 1]) {
    const input = $(`#team${team}-name`);
    if (document.activeElement !== input) input.value = s.names[team];
    const editor = document.querySelector(`.team-editor[data-team="${team}"]`);
    editor.style.setProperty('--kit', s.colors[team]);
    $(`#team${team}-squad`).textContent = squadLine(s.rosters[team]);
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

const cleanName = (text, fallback) => (text || '').trim().slice(0, 14) || fallback;

function bindSetup() {
  const form = $('#setup-form');
  form.addEventListener('change', e => {
    const s = ui.setup;
    if (e.target.name === 'mode') s.mode = e.target.value;
    if (e.target.name === 'length') s.length = e.target.value;
    if (e.target.name === 'cpu') s.cpu = e.target.value;
    if (e.target.name === 'style') s.style = e.target.value;
    if (e.target.id === 'setup-cards') s.cards = e.target.checked;
    renderSetup();
  });
  for (const team of [0, 1]) {
    $(`#team${team}-name`).addEventListener('input', e => {
      ui.setup.names[team] = e.target.value;
    });
  }
  document.querySelectorAll('[data-squad]').forEach(btn => btn.addEventListener('click', () => {
    const team = Number(btn.dataset.squad);
    const name = cleanName(ui.setup.names[team], DEFAULT_SETUP.names[team]);
    openSquad(`${name} squad`, ui.setup.rosters[team], roster => {
      ui.setup.rosters[team] = roster;
      save('setup', ui.setup);
      renderSetup();
    });
  }));
  form.addEventListener('submit', e => {
    e.preventDefault();
    const s = ui.setup;
    s.names = s.names.map((n, i) => cleanName(n, DEFAULT_SETUP.names[i]));
    if (s.names[0].toLowerCase() === s.names[1].toLowerCase()) s.names[1] = `${s.names[1].slice(0, 11)} II`;
    save('setup', s);
    unlockAudio();
    startMatch({
      mode: s.mode,
      teams: [0, 1].map(i => ({ name: s.names[i], color: s.colors[i], roster: s.rosters[i] })),
      length: s.length,
      cpuLevel: s.cpu,
      cpuPersonality: s.style,
      cards: s.cards,
    }, { kind: s.mode === '1p' ? 'quick' : '2p' });
  });
  $('#btn-setup-back').addEventListener('click', () => showView('home'));
}

function openSetup() {
  renderSetup();
  showView('setup');
}

function startLearn() {
  unlockAudio();
  ensureRosters();
  const s = ui.setup;
  startMatch({
    mode: '1p',
    teams: [0, 1].map(i => ({ name: cleanName(s.names[i], DEFAULT_SETUP.names[i]), color: s.colors[i], roster: s.rosters[i] })),
    length: 'quick',
    cpuLevel: 'rookie',
    cpuPersonality: 'balanced',
    cards: true,
  }, { kind: 'learn', seen: [] });
}

// ---------- Squad editor (any team: setup, tournament or online) ----------

function openSquad(title, roster, onSave, flavour = 'any') {
  ui.squad = { roster: { ...roster }, onSave, flavour };
  $('#squad-title').textContent = title;
  renderSquadList();
  openDialog('dlg-squad');
}

function renderSquadList() {
  const host = $('#squad-list');
  host.innerHTML = '';
  for (const pos of POSITIONS) {
    const row = el('label', 'squad-row');
    const input = el('input', 'squad-input');
    input.value = ui.squad.roster[pos] || '';
    input.maxLength = 20;
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.addEventListener('input', () => {
      ui.squad.roster[pos] = input.value;
    });
    row.append(dieChip(pos, pos), el('span', 'squad-pos', PLAYERS[pos].name), input);
    host.append(row);
  }
}

function bindSquad() {
  $('#btn-squad-shuffle').addEventListener('click', () => {
    ui.squad.roster = randomRoster(ui.squad.flavour);
    renderSquadList();
  });
  $('#btn-squad-done').addEventListener('click', () => {
    const fresh = randomRoster(ui.squad.flavour);
    const roster = Object.fromEntries(POSITIONS.map(p => [p, (ui.squad.roster[p] || '').trim().slice(0, 20) || fresh[p]]));
    ui.squad.onSave(roster);
    $('#dlg-squad').close();
  });
}

// ---------- Match lifecycle ----------

const meOf = context => (context.kind === '2p' ? null : context.kind === 'online' ? context.team : 0);

function tossText(m) {
  const caller = m.teams[m.step.team].name;
  return `${caller} to call. The winner receives the kick-off${m.cards ? ' and the loser picks a team card first' : ''}.`;
}

function stopAutomation() {
  clearTimeout(ui.cpuTimer);
  ui.thinking = false;
}

// `prebuilt`: a match made elsewhere (online), instead of one from options.
function startMatch(options, context = { kind: 'quick' }, prebuilt = null) {
  stopAutomation();
  ui.match = prebuilt || newMatch(options);
  ui.context = context;
  ui.feed = [];
  ui.history = [];
  ui.outcome = null;
  ui.netError = null;
  ui.netErrorShown = false;
  ui.tracker = newTracker(meOf(context));
  ui.shownScores = [0, 0];
  hideCoach(false);
  closeDialogs();
  persist();
  showView('match');
  showCoin();
  setHeadline('Coin toss', tossText(ui.match));
  renderFeed(0);
  render();
  afterTurn([]);
}

function resumeMatch(saved) {
  stopAutomation();
  ui.match = migrate(saved.match);
  ui.context = saved.context || { kind: ui.match.mode === '2p' ? '2p' : 'quick' };
  if (ui.context.kind === 'tournament' && !openTournamentFixture(ui.context.fixture)) ui.context = { kind: 'quick' };
  ui.feed = saved.feed || [];
  ui.history = saved.history || [];
  ui.tracker = saved.tracker || newTracker(meOf(ui.context));
  ui.outcome = null;
  ui.netError = null;
  ui.shownScores = ui.match.teams.map(t => t.score);
  hideCoach(false);
  showView('match');
  const roll = ui.match.roll;
  if (roll) showDice(roll.dice, roll.faces, roll);
  else showCoin();
  setHeadline('Welcome back', scoreLine(ui.match));
  renderFeed(0);
  render();
  if (ui.context.kind === 'online') reconnectOnline(saved.online);
  if (ui.match.step.type === 'halftime') openBreak();
  afterTurn([]);
}

function persist() {
  const m = ui.match;
  if (!m) return;
  if (m.step.type === 'fulltime') {
    save('match', null);
    return;
  }
  save('match', {
    match: m,
    feed: ui.feed.slice(0, 400),
    context: ui.context,
    tracker: ui.tracker,
    history: ui.history,
    online: ui.online ? onlineSnapshot() : null,
  });
}

function rematchOptions(m) {
  return {
    mode: m.mode,
    teams: m.teams.map(t => ({ name: t.name, color: t.color, roster: t.roster })),
    length: m.length,
    cpuLevel: m.cpuLevel,
    cpuPersonality: m.cpuPersonality,
    cards: m.cards,
  };
}

// ---------- Acting ----------

function humanAct(action) {
  unlockAudio();
  if (ui.coach) hideCoach(true);
  if (ui.busy) {
    ui.skip?.();
    return;
  }
  const m = ui.match;
  if (!m || controllerOf(m) === 'remote') return;
  if (isAutomatic(m)) {
    clearTimeout(ui.cpuTimer);
    runAutomatic();
    return;
  }
  dispatch(action);
}

async function dispatch(action) {
  if (ui.busy || !ui.match) return;
  const before = ui.match;
  const online = ui.context?.kind === 'online' && ui.online;
  const rng = online ? recordingRng() : Math.random;
  let result;
  try {
    result = act(before, action, rng);
  } catch (err) {
    console.error(err);
    return;
  }
  if (online) ui.online.session.shareMove(result.state, { s: before.seq, a: encodeAction(action), r: rng.used });
  await applyOutcome(before, result);
}

// Shows one move, whoever made it: this phone, the CPU or the other phone.
async function applyOutcome(before, result) {
  clearTimeout(ui.cpuTimer);
  ui.busy = true;
  ui.match = result.state;
  const events = result.events;
  if (ui.tracker && ui.tracker.me !== null && ui.tracker.me !== undefined) track(ui.tracker, before, events, ui.match);
  recordHistory(events);
  const story = narrate(events, ui.match);
  const half = before.half;
  ui.feed.unshift(...story.lines.slice().reverse().map(l => ({ ...l, half })));
  if (ui.match.step.type === 'fulltime') finishMatch();
  persist();
  if (before.step.type === 'halftime' && $('#dlg-break').open) $('#dlg-break').close();
  lockDock();
  try {
    await present(before, ui.match, events, story);
  } catch (err) {
    console.error(err);
  }
  ui.busy = false;
  ui.skip = null;
  render();
  if (ui.match.step.type === 'halftime' || ui.match.step.type === 'fulltime') openBreak();
  afterTurn(events);
}

function isAutomatic(m) {
  if (!m || m.step.type === 'halftime' || m.step.type === 'fulltime') return false;
  const who = controllerOf(m);
  if (who === 'cpu') return true;
  if (who !== 'human') return false;
  return ui.prefs.autoDefence && m.mode === '1p' && m.step.type === 'roll' && (m.step.purpose === 'tackle' || m.step.purpose === 'ruck');
}

// After every move: a coach tip if one is due, then whoever plays next.
function afterTurn(events) {
  if (ui.view !== 'match' || !ui.match || ui.busy) return;
  if (ui.context?.kind === 'online' && checkRematch()) return;
  if (!ui.coach) maybeCoach(events);
  schedule();
}

function schedule() {
  clearTimeout(ui.cpuTimer);
  const m = ui.match;
  if (ui.view !== 'match' || !m || ui.busy) return;
  if (controllerOf(m) === 'remote') {
    applyPendingRemote();
    return;
  }
  if (ui.coach || document.querySelector('dialog[open]') || !isAutomatic(m)) return;
  const thinking = m.step.type === 'choose' ? 1000 : 750;
  ui.cpuTimer = setTimeout(runAutomatic, thinking * speed());
}

async function runAutomatic() {
  if (ui.busy || ui.thinking || ui.coach || document.querySelector('dialog[open]')) return;
  const m = ui.match;
  if (!isAutomatic(m)) return;
  if (m.step.type === 'roll') {
    dispatch({ type: 'roll' });
    return;
  }
  ui.thinking = true;
  renderDock(m, false);
  renderDraft(m);
  let value;
  try {
    value = await cpuChoiceAsync(m);
  } finally {
    ui.thinking = false;
  }
  if (ui.match !== m || ui.view !== 'match') return;
  dispatch({ type: 'choose', value });
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

// One point on the momentum chart per move: team 0's chance of winning.
function recordHistory(events) {
  const m = ui.match;
  if (m.attacker === null && m.step.type !== 'fulltime') return;
  if (!ui.history.length) ui.history.push({ p: 0.5, h: 1 });
  const entry = { p: Math.round(winProbability(m, 0) * 1000) / 1000, h: m.half };
  const score = events.find(e => e.type === 'score');
  if (score) Object.assign(entry, { k: score.kind, t: score.team, s: score.score });
  ui.history.push(entry);
}

// ---------- Full time: career, tournament ----------

function finishMatch() {
  if (ui.outcome) return;
  const m = ui.match;
  const context = ui.context || { kind: 'quick' };
  const outcome = { unlocked: [], potm: playerOfTheMatch(m), note: null, champion: null };
  let cup = null;
  if (context.kind === 'tournament' && ui.tournament) {
    const t = ui.tournament;
    const f = t.fixtures.find(x => x.id === context.fixture);
    if (f && !f.result) {
      recordResult(t, f.id, resultFromMatch(f, m, f.home === t.userTeam));
      simulateRound(t);
      advance(t);
      outcome.note = tournamentNote(t, f, m.winner === 0);
      if (t.stage === 'done' && t.champion === t.userTeam) {
        outcome.champion = { title: `${t.name} winners` };
        cup = { kind: t.kind, champion: true, lost: userRecord(t).lost };
      }
      save('tournament', t);
    }
  }
  const mode = context.kind === 'online' ? 'online' : context.kind === 'learn' ? 'learn' : m.mode;
  outcome.unlocked = recordMatch(ui.career, m, ui.tracker || newTracker(null), { mode, level: m.cpuLevel, tournament: cup });
  save('career', ui.career);
  const facts = momentumFacts(ui.history, m);
  if (facts?.comeback && !outcome.note) outcome.note = `${m.teams[facts.winner].name} came back from a ${pct(facts.low)} chance of winning.`;
  ui.outcome = outcome;
}

function tournamentNote(t, f, won) {
  const me = teamOf(t, t.userTeam).name;
  if (f.stage === 'final') return won ? `${me} win the ${t.name}!` : `${me} are runners-up. ${teamOf(t, t.champion).name} win the ${t.name}.`;
  if (f.stage === 'semi') return won ? `${me} are through to the final!` : `${me} are out in the semi-finals.`;
  const rows = standings(t, f.group);
  const place = ordinal(rows.findIndex(r => r.id === t.userTeam) + 1);
  const where = f.group === 'L' ? 'in the League' : `in Pool ${f.group}`;
  if (t.stage === 'semi') {
    return userAlive(t) ? `${me} finish ${place} ${where} and go through to the semi-finals!` : `${me} finish ${place} ${where}. That’s the end of the road.`;
  }
  return `${me} are ${place} ${where}.`;
}

// ---------- Presentation ----------

const FOCUS = { kick: 'kick', penalty: 'card', try: 'result', ruck: 'result' };

// Which big moments get a full cinematic scene at each setting.
const SHORT_SCENES = new Set(['kickoff', 'try', 'kickcam', 'card', 'turnover', 'whistle', 'linebreak', 'bighit', 'notry', 'cardplay', 'trophy', 'achievement']);
const cinemaLevel = () => (reducedMotion.matches ? 'off' : ui.prefs.cinema);
const wantsScene = kind => cinemaLevel() === 'full' || (cinemaLevel() === 'short' && SHORT_SCENES.has(kind));
const cinemaSpeed = () => (ui.prefs.cinema === 'short' ? 0.7 : 1) * (ui.prefs.fast ? 0.7 : 1);

// Moment kinds from the commentary, mapped to cinema scenes and their data.
function sceneFor(moment, after, events) {
  const team = moment.team === null || moment.team === undefined ? null : after.teams[moment.team];
  switch (moment.kind) {
    case 'try': return ['try', { team, pos: moment.pos, scoreline: scoreLine(after), player: moment.player }];
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
    case 'cardplay': return ['cardplay', { team, card: moment.card, line: moment.sub }];
    case 'halftime': return ['whistle', { full: false, teams: after.teams }];
    case 'fulltime': return ['whistle', { full: true, teams: after.teams, winner: after.winner }];
    // Shown by the draft panel and the team-cards scene.
    case 'draft': return ['none'];
    // Goals are shown by the kick cam when it plays.
    case 'goal':
    case 'conversion': return events.some(e => e.type === 'kick') && wantsScene('kickcam') ? ['none'] : null;
  }
  return null;
}

// A card changes the dice before anything else happens; big hits read
// better before the injury they cause.
const MOMENT_ORDER = ['cardplay', 'bighit', 'injury', 'break', 'try', 'notry', 'tmo', 'turnover', 'penalty', 'yellow', 'red', 'quicktap', 'goal', 'conversion', 'draft', 'halftime', 'fulltime'];

function stageLabel() {
  const c = ui.context;
  if (!c) return null;
  if (c.kind === 'tournament') return contextLabel(c);
  if (c.kind === 'online') return 'Online match';
  if (c.kind === 'learn') return 'Guided match';
  return null;
}

async function present(before, after, events, story) {
  const has = type => events.find(e => e.type === type);
  const step = before.step;
  const covered = new Set();

  // Calls before the scrum feed or lineout throw.
  if (step.type === 'roll' && step.purpose === 'setpiece' && wantsScene('setpiece')) {
    await ui.cinema.play('setpiece', { piece: step.piece });
  }

  // Dice, coin or a card pick.
  if (step.type === 'choose' && step.purpose === 'toss') {
    play('coin');
    await flipCoin(after.toss.result);
  } else if (step.type === 'choose' && step.purpose === 'draft') {
    await showDraftPick(after, has('draft'));
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
      const note = kick.bonus ? `+${metres(kick.bonus)} ${CARD_BY_ID[after.teams[kick.team].card]?.name || ''}`.trim() : null;
      await ui.cinema.play('kickcam', { team: after.teams[kick.team], kick: kick.kick, range: kick.range, distance: kick.distance, good: kick.good, note });
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

  // With team cards, the coin shows for a moment before the draft.
  if (has('deal')) await skippable(900 * speed());

  // The match opens with a title card (after the draft, with team cards), and so does the second half.
  const drafted = events.some(e => e.type === 'draft' && !e.first);
  if ((has('toss') && !has('deal')) || drafted || has('secondHalf')) {
    if (drafted && wantsScene('draft')) await ui.cinema.play('draft', { teams: after.teams });
    if (wantsScene('kickoff')) await ui.cinema.play('kickoff', { teams: after.teams, half: after.half, target: after.target, label: stageLabel() });
  }

  for (const { moment, scene } of moments) {
    if (scene?.[0] === 'none') continue;
    if (scene && wantsScene(scene[0])) await ui.cinema.play(scene[0], scene[1]);
    else await showMoment(moment);
  }

  if (after.step.type === 'fulltime' && ui.outcome) await fullTimeScenes(after);
}

// Player of the Match, a trophy and any achievements, after the final whistle.
async function fullTimeScenes(m) {
  const o = ui.outcome;
  if (o.potm && wantsScene('potm')) {
    await ui.cinema.play('potm', { name: o.potm.name, team: m.teams[o.potm.team], position: PLAYERS[o.potm.pos].name, line: statLine(o.potm.stats) });
  }
  if (o.champion && wantsScene('trophy')) await ui.cinema.play('trophy', { team: m.teams[0], title: o.champion.title });
  if (o.unlocked.length && wantsScene('achievement')) {
    await ui.cinema.play('achievement', { items: o.unlocked.map(id => ACHIEVEMENT_BY_ID[id]) });
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
      case 'cardPlayed': if (!quiet('cardplay')) play('stamp'); break;
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
  const ms = { try: 1800, goal: 1400, conversion: 1000, break: 850, bighit: 800, turnover: 1100, injury: 1400, yellow: 1500, red: 1700, penalty: 900, cardplay: 1300 }[moment.kind] || 1000;
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

function periodText(m) {
  const length = MATCH_LENGTHS[m.length].label;
  const where = contextLabel(ui.context);
  if (where) return `${where} · ${length}`;
  if (m.mode === '1p') return `v ${LEVELS[m.cpuLevel]?.name || 'Pro'} CPU · ${length}`;
  return `2 players · ${length}`;
}

function render() {
  const m = ui.match;
  if (!m) return;
  $('#period').textContent = periodText(m);
  renderBoard(m);
  renderSituation(m);
  ui.pitch.update(m);
  renderDraft(m);
  renderDock(m, false);
  renderNet();
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

    const cardBtn = side.querySelector('.side-card');
    if (t.card) {
      cardBtn.hidden = false;
      cardBtn.replaceChildren(cardChip(t.card, 'tc-chip on-board'));
      const uses = cardUses(m, team);
      cardBtn.classList.toggle('spent', !!uses && !uses.left);
      cardBtn.setAttribute('aria-label', `${possessive(t.name)} team card: ${CARD_BY_ID[t.card].name}. Show what it does.`);
      cardBtn.onclick = () => openCardDialog(team);
    } else {
      cardBtn.hidden = true;
    }

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
  renderMeter(m);
}

function renderMeter(m) {
  const meter = $('#meter');
  const on = ui.prefs.meter && m.attacker !== null;
  meter.hidden = !on;
  if (!on) return;
  const p = winProbability(m, 0);
  $('#meter-0').textContent = pct(p);
  $('#meter-1').textContent = pct(1 - p);
  meter.style.setProperty('--kit-a', m.teams[0].color);
  meter.style.setProperty('--kit-b', m.teams[1].color);
  $('#meter-fill').style.width = `${(p * 100).toFixed(1)}%`;
  $('#meter-bar').setAttribute('aria-label', `Chance of winning: ${m.teams[0].name} ${pct(p)}, ${m.teams[1].name} ${pct(1 - p)}`);
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
  if (m.quickTap > 0 && open) host.append(chip(`${m.quickTap === 1 && m.teams[m.attacker].card === 'set-piece-kings' ? 'Advantage' : 'Quick tap'} +1 · ${m.quickTap} left`, null, 'tap'));
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

// ---------- Draft ----------

// The three dealt cards, while the sides pick. `picked`: a card picked just
// now, stamped with a flourish.
function renderDraft(m, picked = null) {
  const panel = $('#draft');
  const on = m.step.purpose === 'draft' || !!picked;
  $('#view-match').classList.toggle('drafting', on);
  panel.hidden = !on;
  if (!on) return;
  const step = m.step;
  const drafting = step.purpose === 'draft';
  const winner = m.teams[m.firstReceiver];
  const loser = m.teams[other(m.firstReceiver)];
  const picker = drafting ? m.teams[step.team] : null;
  const who = drafting ? controllerOf(m) : null;
  $('#draft-title').textContent = drafting ? `${picker.name} to pick` : 'Cards picked';
  $('#draft-sub').textContent = drafting && !step.first
    ? `${loser.name} picked first. ${picker.name} take one of the other two.`
    : `${winner.name} won the toss and receive the kick-off, so ${loser.name} pick first.`;

  const host = $('#draft-cards');
  host.innerHTML = '';
  for (const id of m.deal) {
    const takenBy = m.teams.findIndex(t => t.card === id);
    const node = cardArt(id, { taken: takenBy >= 0 ? m.teams[takenBy] : null, tag: 'button' });
    node.type = 'button';
    const pickable = drafting && takenBy < 0 && who === 'human' && !ui.busy;
    node.disabled = !pickable;
    if (pickable) {
      node.dataset.choice = '';
      node.addEventListener('click', () => humanAct({ type: 'choose', value: id }));
    }
    const card = CARD_BY_ID[id];
    node.setAttribute('aria-label', `${card.name}, ${card.tag}. ${card.text}${takenBy >= 0 ? ` Picked by ${m.teams[takenBy].name}.` : ''}`);
    if (picked === id) node.classList.add('just-picked');
    host.append(node);
  }

  const status = $('#draft-status');
  status.innerHTML = '';
  if (!drafting) return;
  const kit = el('span', 'kit');
  kitVars(kit, picker);
  if (who === 'human') {
    status.append(kit, el('b', null, picker.name), document.createTextNode(m.mode === '2p' ? ', your pick: tap a card' : ': tap a card to pick it'));
  } else {
    status.classList.add('waiting');
    status.append(el('i', 'spin'), kit, el('b', null, picker.name), document.createTextNode(who === 'remote' ? ' are picking on their phone…' : ' are picking…'));
  }
  status.classList.toggle('waiting', who !== 'human');
}

async function showDraftPick(after, e) {
  renderDraft(after, e.card);
  play('stamp');
  if (ui.prefs.haptics) buzz(25);
  await skippable(e.first ? 900 * speed() : 1100 * speed());
}

// ---------- Dock ----------

const ROLL_TEXT = {
  attack: step => [`Roll ${PLAYERS[step.dice[0]].name}`, step.dice],
  tackle: () => ['Tackle!', ['D', 'D']],
  ruck: () => ['Contest the ruck', ['K']],
  try: step => [step.videos ? 'Video ref: roll again' : step.rerolled ? 'Clinical: roll again' : 'Go for the line', ['K']],
  range: step => [step.kick === 'conversion' ? 'Roll conversion range' : 'Roll drop-goal range', ['D']],
  penalty: () => ['Card check & range', ['K', 'D']],
  kick: step => [`Kick! Need ${metres(step.range)}`, ['K']],
  setpiece: step => [step.piece === 'scrum' ? 'Feed the scrum' : 'Throw in', ['R']],
};

// "Harris (Wing)", or just "Wing" for a side without names.
function playerName(m, team, pos) {
  const name = surname(m, team, pos);
  return name ? `${name} (${PLAYERS[pos].name})` : PLAYERS[pos].name;
}

function promptText(m) {
  const step = m.step;
  const team = step.team;
  switch (step.purpose) {
    case 'toss': return 'Call the coin toss';
    case 'draft': return 'Pick a team card';
    case 'attack': return `Phase ${m.phase} · ${playerName(m, team, step.dice[0])} has the ball`;
    case 'tackle': return `Defending · stop intensity ${step.intensity}`;
    case 'ruck': return 'Big hit · fight for the ball';
    case 'try': return `${playerName(m, team, step.carrier)} is through`;
    case 'range': return step.kick === 'conversion' ? 'Conversion' : `Drop goal chance · ${playerName(m, team, m.carrier)}`;
    case 'penalty': return 'Penalty awarded';
    case 'kick': return `${{ conversion: 'Conversion', penalty: 'Penalty kick', drop: 'Drop goal' }[step.kick]} · ${pct(kickChance(step.range, kickBonus(m, team, step.kick)))} to land`;
    case 'setpiece': return step.piece === 'scrum' ? 'Scrum feed' : 'Lineout throw';
    case 'pass': return `${playerName(m, team, step.from)} passes · pick a receiver`;
    case 'drop': return `${metres(step.range)} out · kick or pass?`;
  }
  return '';
}

// While the dice are in the air the old buttons stay put, greyed out.
function lockDock() {
  document.querySelectorAll('#actions button, #draft-cards button').forEach(b => {
    if (!b.classList.contains('waiting')) b.disabled = true;
  });
}

function waitingButton(team, text) {
  const btn = el('button', 'roll-btn waiting');
  btn.type = 'button';
  btn.disabled = true;
  kitVars(btn, team);
  btn.append(el('span', null, text));
  return btn;
}

function renderDock(m, locked) {
  const prompt = $('#prompt');
  const actions = $('#actions');
  prompt.innerHTML = '';
  actions.innerHTML = '';
  actions.className = 'actions';
  const step = m.step;
  const who = controllerOf(m);

  if (step.type === 'halftime') {
    prompt.append(el('span', null, 'Half time'));
    const next = m.teams[other(m.firstReceiver)];
    if (who === 'remote') actions.append(waitingButton(next, `Waiting for ${next.name} to start the second half`));
    else actions.append(simpleButton('Start the second half', () => dispatch({ type: 'continue' }), 'btn btn-primary'));
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

  if (who === 'remote') {
    actions.append(waitingButton(team, `Waiting for ${team.name}…`));
    return;
  }
  if (step.purpose === 'draft') return;

  if (step.type === 'roll' || cpuTurn) {
    const [label, chips] = step.type === 'roll' ? ROLL_TEXT[step.purpose](step) : ['Thinking', []];
    const btn = el('button', 'roll-btn');
    btn.type = 'button';
    btn.dataset.primary = '';
    kitVars(btn, team);
    if (cpuTurn) {
      btn.classList.add('waiting');
      const name = who === 'cpu' ? team.name : 'Auto-tackle';
      btn.append(el('span', null, step.type === 'roll' ? `${name}: ${label}` : ui.thinking && m.cpuLevel === 'expert' ? `${name} thinking ahead…` : `${name} deciding`));
      btn.setAttribute('aria-label', `${name} is playing. Tap to hurry.`);
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
  const tip = showOdds() ? suggestedChoice(m) : null;
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
      const name = surname(m, step.team, pos);
      actions.append(choiceButton({
        die: pos,
        title: PLAYERS[pos].name,
        sub: `${name ? `${name} · ` : ''}${odds.special.label} ${odds.special.value}`,
        odds: showOdds() ? [[`Break ${pct(odds.lineBreak)}`, 'up'], [`Error ${pct(odds.error)}`, 'down']] : null,
        suggested: tip === pos,
        onClick: choose(pos),
        locked,
      }));
    }
    return;
  }
  if (step.purpose === 'drop' || step.purpose === 'penalty') {
    actions.classList.add('two');
    const kick = step.purpose === 'drop' ? 'drop' : 'penalty';
    const bonus = kickBonus(m, step.team, kick);
    const p = kickChance(step.range, bonus);
    actions.append(choiceButton({
      icon: '3',
      title: kick === 'drop' ? 'Drop goal' : 'Kick at goal',
      sub: `Need a ${metres(step.range)} kick${bonus ? ` (+${metres(bonus)} ${CARD_BY_ID[m.teams[step.team].card].name})` : ''}`,
      odds: showOdds() ? [[`${pct(p)} to land`, p >= 0.5 ? 'up' : 'down']] : null,
      suggested: tip === 'kick',
      onClick: choose('kick'),
      locked,
    }));
    if (kick === 'drop') actions.append(choiceButton({ icon: '→', title: 'Pass', sub: 'Keep it in hand', suggested: tip === 'pass', onClick: choose('pass'), locked }));
    else actions.append(choiceButton({ icon: '+1', title: 'Quick tap', sub: `+1 intensity on your next ${QUICK_TAP_RUNS} runs`, suggested: tip === 'tap', onClick: choose('tap'), locked }));
  }
}

function simpleButton(text, onClick, className) {
  const b = button(text, () => {
    unlockAudio();
    onClick();
  }, className, { primary: true });
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

// ---------- Coach ----------

const coachOn = () => (ui.context?.kind === 'learn' ? !ui.context.quiet : ui.prefs.coach);
const coachSeen = () => (ui.context?.kind === 'learn' ? (ui.context.seen ||= []) : ui.coachSeen);

function maybeCoach(events) {
  if (!coachOn() || ui.view !== 'match' || document.querySelector('dialog[open]')) return false;
  const m = ui.match;
  const humanTurn = controllerOf(m) === 'human' && !isAutomatic(m);
  const id = tipFor(m, events, coachSeen(), humanTurn);
  if (!id) return false;
  const tip = tipText(id, events, m);
  ui.coach = id;
  $('#coach-title').textContent = tip.title;
  $('#coach-text').textContent = tip.text;
  $('#coach-off').textContent = ui.context?.kind === 'learn' ? 'Skip the tips' : 'Turn tips off';
  const coach = $('#coach');
  // During the draft the tip sits in the page above the cards; otherwise it
  // floats over the pitch, pointing at the dock.
  const drafting = $('#view-match').classList.contains('drafting');
  if (drafting) $('#draft').insertBefore(coach, $('#draft-cards'));
  else if (coach.parentElement !== $('#view-match')) $('#view-match').insertBefore(coach, $('#dock'));
  coach.classList.toggle('inline', drafting);
  coach.style.setProperty('--coach-bottom', `${$('#dock').offsetHeight + 8}px`);
  coach.hidden = false;
  return true;
}

function hideCoach(markSeen = true) {
  if (!ui.coach) return;
  if (markSeen) {
    const seen = coachSeen();
    if (!seen.includes(ui.coach)) seen.push(ui.coach);
    if (ui.context?.kind === 'learn') persist();
    else save('coach', ui.coachSeen);
  }
  ui.coach = null;
  $('#coach').hidden = true;
}

function bindCoach() {
  $('#coach-ok').addEventListener('click', () => {
    hideCoach(true);
    afterTurn([]);
  });
  $('#coach-off').addEventListener('click', () => {
    hideCoach(true);
    if (ui.context?.kind === 'learn') ui.context.quiet = true;
    else setPref('coach', false);
    persist();
    afterTurn([]);
  });
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

function setTab(id) {
  for (const t of ['team', 'players', 'momentum']) {
    const tab = $(`#tab-${t}`);
    tab.setAttribute('aria-selected', String(t === id));
    tab.tabIndex = t === id ? 0 : -1;
    $(`#panel-${t}`).hidden = t !== id;
  }
}

function bindTabs() {
  const ids = ['team', 'players', 'momentum'];
  for (const id of ids) {
    const tab = $(`#tab-${id}`);
    tab.addEventListener('click', () => setTab(id));
    tab.addEventListener('keydown', e => {
      const step = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
      if (!step) return;
      const next = ids[(ids.indexOf(id) + step + ids.length) % ids.length];
      setTab(next);
      $(`#tab-${next}`).focus();
      e.preventDefault();
    });
  }
}

function breakTitle(m, full) {
  if (!full) return 'Half time';
  const winner = m.teams[m.winner].name;
  const kind = ui.context?.kind;
  const me = kind === 'online' ? ui.context.team : kind === '2p' ? null : 0;
  if (me === null) return `${winner} win`;
  return m.winner === me ? 'You win!' : `${winner} win`;
}

function openBreak() {
  const m = ui.match;
  if (!m) return;
  const full = m.step.type === 'fulltime';
  const dlg = $('#dlg-break');
  const [a, b] = m.teams;
  const where = contextLabel(ui.context);
  $('#break-kicker').textContent = full ? (where ? `${where} · Full time` : 'Full time') : `${where || MATCH_LENGTHS[m.length].label + ' match'}`;
  $('#break-title').textContent = breakTitle(m, full);

  const score = $('#break-score');
  score.innerHTML = '';
  const teamCell = (t, team) => {
    const cell = el('div', 'bs-team');
    const name = el('span', 'bs-name');
    const kit = el('span', 'kit');
    kitVars(kit, t);
    name.append(kit, el('span', null, t.name));
    cell.append(name, el('span', 'bs-num', t.score));
    if (t.card) cell.append(cardChip(t.card, 'tc-chip on-board'));
    cell.dataset.team = team;
    return cell;
  };
  score.append(teamCell(a, 0), el('span', 'bs-dash', '–'), teamCell(b, 1));

  const o = full ? ui.outcome : null;
  const note = $('#break-note');
  note.hidden = !o?.note;
  note.textContent = o?.note || '';

  const potm = $('#break-potm');
  potm.hidden = !full;
  potm.replaceChildren(...(full ? [potmCard(m, o?.potm)] : []));

  const awards = $('#break-awards');
  awards.innerHTML = '';
  awards.hidden = !o?.unlocked.length;
  if (o?.unlocked.length) {
    awards.append(el('p', 'awards-title', o.unlocked.length > 1 ? `${o.unlocked.length} achievements unlocked` : 'Achievement unlocked'));
    for (const id of o.unlocked) {
      const a = ACHIEVEMENT_BY_ID[id];
      const item = el('div', 'award');
      item.append(el('b', null, a.name), el('span', null, a.text));
      awards.append(item);
    }
  }

  const table = $('#break-stats');
  table.innerHTML = '';
  const rows = full ? STAT_ROWS : STAT_ROWS.filter(([label]) => ['Tries', 'Line breaks', 'Tackles made', 'Turnovers won', 'Penalties conceded', 'Cards'].includes(label));
  for (const [label, show, rank = show] of rows) {
    const tr = el('tr');
    const [ra, rb] = [rank(a.stats), rank(b.stats)];
    tr.append(el('td', ra > rb ? 'lead' : '', show(a.stats)), el('td', 'label', label), el('td', rb > ra ? 'lead' : '', show(b.stats)));
    table.append(tr);
  }
  $('#panel-players').replaceChildren(playersTables(m, full ? o?.potm : null));
  $('#panel-momentum').replaceChildren(momentumChart(ui.history, m));
  setTab('team');

  const actions = $('#break-actions');
  actions.innerHTML = '';
  const close = fn => () => {
    dlg.close();
    fn();
  };
  if (full) {
    const kind = ui.context?.kind;
    if (kind === 'tournament') {
      actions.append(simpleButton(`Back to the ${ui.tournament?.name || 'tournament'}`, close(openTournament), 'btn btn-primary'));
      actions.append(button('Title screen', close(() => showView('home')), 'btn btn-quiet'));
    } else if (kind === 'learn') {
      actions.append(simpleButton('Play a full match', close(openSetup), 'btn btn-primary'));
      actions.append(button('Play the guided match again', close(startLearn), 'btn'));
      actions.append(button('Title screen', close(() => showView('home')), 'btn btn-quiet'));
    } else if (kind === 'online') {
      if (ui.online?.role === 'host') actions.append(simpleButton('Rematch', close(onlineRematch), 'btn btn-primary'));
      else {
        const wait = button(ui.online ? 'Waiting for a rematch…' : 'Connection lost', () => {}, 'btn');
        wait.disabled = true;
        actions.append(wait);
      }
      actions.append(button('Leave', close(leaveOnline), 'btn btn-quiet'));
    } else {
      actions.append(simpleButton('Rematch', close(() => startMatch(rematchOptions(m), ui.context)), 'btn btn-primary'));
      actions.append(button('New team sheet', close(openSetup), 'btn'));
      actions.append(button('Title screen', close(() => showView('home')), 'btn btn-quiet'));
    }
  } else {
    const notes = m.teams.filter(t => t.sinBin).map(t => `${possessive(t.name)} sin-binned player returns.`);
    if (controllerOf(m) === 'remote') {
      const next = m.teams[other(m.firstReceiver)];
      const wait = button(`Waiting for ${next.name} to start the second half`, () => {}, 'btn');
      wait.disabled = true;
      actions.append(wait);
    } else {
      actions.append(simpleButton('Start the second half', close(() => dispatch({ type: 'continue' })), 'btn btn-primary'));
    }
    if (notes.length) actions.prepend(el('p', null, notes.join(' ')));
    actions.append(button('Keep looking at the pitch', () => dlg.close(), 'btn btn-quiet'));
  }
  if (!dlg.open) dlg.showModal();
  dlg.scrollTop = 0;
  $('#break-title').focus({ preventScroll: true });
}

function openCardDialog(team) {
  const m = ui.match;
  const t = m.teams[team];
  if (!t.card) return;
  $('#card-team').textContent = 'Team card';
  $('#card-title').textContent = `${possessive(t.name)} card`;
  $('#card-detail').replaceChildren(cardArt(t.card, { uses: cardUses(m, team) }));
  openDialog('dlg-card');
}

// ---------- Tournaments ----------

function openTournamentFixture(id) {
  const t = ui.tournament;
  const f = t?.fixtures.find(x => x.id === id);
  return f && !f.result ? f : null;
}

function openTournament() {
  renderTournament();
  showView('tournament');
  $('#view-tournament').scrollTop = 0;
}

function renderTournament() {
  const t = ui.tournament;
  $('#tournament-title').textContent = t ? t.name : 'Tournament';
  const host = $('#tournament-body');
  if (!t) {
    host.replaceChildren(tournamentSetup(ui.tsetup, {
      onChange: patch => {
        Object.assign(ui.tsetup, patch);
        renderTournament();
      },
      onStart: startTournament,
    }));
    return;
  }
  host.replaceChildren(tournamentHub(t, {
    onPlay: playTournamentMatch,
    onSimRest: () => {
      for (let guard = 0; t.stage !== 'done' && guard < 40; guard++) {
        simulateRound(t);
        advance(t);
      }
      save('tournament', t);
      renderTournament();
    },
    onNew: () => {
      ui.tournament = null;
      save('tournament', null);
      renderTournament();
    },
    onAbandon: () => ask('Abandon the tournament?', 'Your results so far are lost. Your career record keeps the matches you played.', [
      ['Abandon', () => {
        const saved = load('match', null);
        if (saved?.context?.kind === 'tournament') save('match', null);
        ui.tournament = null;
        save('tournament', null);
        renderTournament();
      }, 'btn btn-danger'],
      ['Keep playing', null, 'btn'],
    ]),
    onSquad: () => {
      const me = teamOf(t, t.userTeam);
      openSquad(`${me.name} squad`, me.roster, roster => {
        me.roster = roster;
        save('tournament', t);
      }, me.flavour);
    },
  }));
}

function startTournament(state) {
  unlockAudio();
  const make = state.kind === 'cup' ? createCup : createLeague;
  ui.tournament = make({ userTeam: state.team, length: state.length, cards: state.cards });
  ui.tsetup = { ...state };
  save('tournament', ui.tournament);
  renderTournament();
  $('#view-tournament').scrollTop = 0;
}

function playTournamentMatch() {
  unlockAudio();
  const t = ui.tournament;
  const f = userFixture(t);
  if (!f) return;
  const saved = load('match', null);
  if (saved?.context?.kind === 'tournament' && saved.context.fixture === f.id && saved.match.step.type !== 'fulltime') {
    resumeMatch(saved);
    return;
  }
  startMatch(matchOptions(t, f), { kind: 'tournament', fixture: f.id });
}

// ---------- Career ----------

function openCareer() {
  renderCareer();
  showView('career');
  $('#view-career').scrollTop = 0;
}

function renderCareer() {
  $('#career-body').replaceChildren(careerPage(ui.career, {
    onReset: () => ask('Reset your career?', 'Your record, trophies and achievements go back to zero. This can’t be undone.', [
      ['Reset', () => {
        ui.career = newCareer();
        save('career', ui.career);
        renderCareer();
      }, 'btn btn-danger'],
      ['Keep it', null, 'btn'],
    ]),
  }));
}

// ---------- Online ----------

function roomCapability() {
  if (!ui.roomPromise) {
    const use = window.claude?.use;
    ui.roomPromise = typeof use === 'function' ? Promise.resolve(window.claude.use('room')).catch(() => null) : Promise.resolve(null);
  }
  return ui.roomPromise;
}

function myOnlineTeam() {
  ensureRosters();
  const s = ui.setup;
  return { name: cleanName(s.names[0], DEFAULT_SETUP.names[0]), color: s.colors[0], roster: s.rosters[0] };
}

const NET_ERRORS = {
  not_permitted: 'This page can’t open online matches for you here. Check you’re signed in to claude.ai and have access to the page.',
  limit_reached: 'Too many matches are open on this page. Close other copies of the game and try again.',
  not_granted: 'Online play isn’t available for this viewer. Open the game on claude.ai, signed in.',
  revoked: 'Access to this page changed, so the match was closed.',
};
const netMessage = code => NET_ERRORS[code] || 'Couldn’t connect. Check your connection and try again.';

async function openOnline() {
  unlockAudio();
  ui.lobby = { phase: 'checking', length: 'quick', cards: true, team: myOnlineTeam(), code: '', error: null };
  showView('online');
  renderLobby();
  const room = await roomCapability();
  if (ui.view !== 'online' || ui.lobby?.phase !== 'checking') return;
  ui.lobby.phase = room ? 'start' : 'unavailable';
  renderLobby();
}

function renderLobby() {
  if (ui.view !== 'online' || !ui.lobby) return;
  const l = ui.lobby;
  const s = l.session;
  $('#online-body').replaceChildren(lobbyPage({
    ...l,
    kits: KITS,
    peer: s?.peer || null,
    mismatch: !!s?.versionMismatch,
    connected: s ? s.connected : true,
  }, lobbyHandlers));
}

const lobbyHandlers = {
  onTeam(patch) {
    if ('name' in patch) ui.setup.names[0] = patch.name;
    if (patch.color) {
      ui.setup.colors[0] = patch.color;
      if (ui.setup.colors[1] === patch.color) ui.setup.colors[1] = KITS.find(k => k.color !== patch.color).color;
    }
    save('setup', ui.setup);
    ui.lobby.team = myOnlineTeam();
    if (patch.color) renderLobby();
  },
  onSquad() {
    openSquad('Your squad', ui.setup.rosters[0], roster => {
      ui.setup.rosters[0] = roster;
      save('setup', ui.setup);
      ui.lobby.team = myOnlineTeam();
    });
  },
  onHost: () => hostOnline(),
  onJoin: text => joinOnline(text),
  onKickOff: () => kickOffOnline(),
  onCancel: () => leaveLobby(),
  onCopy() {
    const code = ui.lobby.code.toUpperCase();
    navigator.clipboard?.writeText(code).then(() => {
      ui.lobby.copied = true;
      renderLobby();
    }).catch(() => {});
  },
  onSettings(patch) {
    Object.assign(ui.lobby, patch);
    renderLobby();
  },
};

async function openSession(role, code) {
  const room = await roomCapability();
  if (!room) {
    ui.lobby.phase = 'unavailable';
    renderLobby();
    return;
  }
  const session = new OnlineSession({ room, code, role, team: myOnlineTeam(), build: BUILD, onChange: kind => onSessionChange(session, kind) });
  Object.assign(ui.lobby, { phase: role === 'host' ? 'hosting' : 'joined', code, role, session, error: null, copied: false });
  renderLobby();
  try {
    await session.join();
  } catch (e) {
    if (ui.lobby?.session !== session) return;
    session.leave();
    Object.assign(ui.lobby, { phase: 'start', session: null, error: netMessage(e?.code) });
  }
  renderLobby();
}

function hostOnline() {
  openSession('host', makeCode(strongRandom));
}

function joinOnline(text) {
  const code = normaliseCode(text);
  if (!validCode(code)) {
    Object.assign(ui.lobby, { code: text, error: 'Codes are six letters and numbers, like K7MP2Q.' });
    renderLobby();
    return;
  }
  openSession('guest', code);
}

function leaveLobby() {
  ui.lobby?.session?.leave();
  ui.lobby = null;
  showView('home');
}

async function kickOffOnline() {
  const s = ui.lobby?.session;
  if (!s?.peer || s.versionMismatch) return;
  ui.lobby.starting = true;
  renderLobby();
  const me = s.team;
  let guest = s.peer.team;
  if (clash(me.color, guest.color)) guest = { ...guest, color: KITS.find(k => !clash(k.color, me.color)).color };
  if (guest.name.toLowerCase() === me.name.toLowerCase()) guest = { ...guest, name: `${guest.name.slice(0, 11)} II` };
  const start = await s.kickOff({ length: ui.lobby.length, cards: ui.lobby.cards, guestTeam: guest });
  beginOnlineMatch(s, start);
}

function beginOnlineMatch(session, start) {
  const role = session.role;
  const team = role === 'host' ? 0 : 1;
  if (role === 'guest' && (session.peer?.seq || 0) > 0) {
    // The host is already well into this match: there's nothing to join.
    if (ui.lobby) {
      ui.lobby.error = 'That match has already started. Ask your friend to host a new one.';
      renderLobby();
    }
    return;
  }
  ui.online = { session, role, team, code: session.code, mid: start.mid, start };
  ui.lobby = null;
  if (role === 'guest') session.beginGuest(start.mid);
  startMatch(null, { kind: 'online', team, mid: start.mid }, startingMatch(start, role));
}

function onlineSnapshot() {
  const o = ui.online;
  return { code: o.code, role: o.role, team: o.team, mid: o.mid, start: o.role === 'host' ? o.start : null, log: o.session.log };
}

async function reconnectOnline(saved) {
  if (!saved) return;
  const room = await roomCapability();
  if (!room) {
    ui.netError = 'Online play isn’t available here. Open the game on claude.ai to carry on.';
    renderNet();
    return;
  }
  const m = ui.match;
  const session = new OnlineSession({ room, code: saved.code, role: saved.role, team: m.teams[saved.team], build: BUILD, log: saved.log || [], onChange: kind => onSessionChange(session, kind) });
  Object.assign(session.presence, { ready: true, mid: saved.mid, seq: m.seq, hash: hashState(m), ...(saved.role === 'host' ? { start: saved.start } : {}) });
  session.mid = saved.mid;
  ui.online = { session, role: saved.role, team: saved.team, code: saved.code, mid: saved.mid, start: saved.start };
  try {
    await session.join();
  } catch (e) {
    ui.netError = netMessage(e?.code);
  }
  renderNet();
  if (!ui.busy) applyPendingRemote();
}

function onSessionChange(session, kind) {
  if (ui.lobby?.session === session) {
    const peer = session.peer;
    if (session.role === 'guest' && peer?.start && peer.mid === peer.start.mid && !session.versionMismatch) {
      beginOnlineMatch(session, peer.start);
      return;
    }
    if (kind === 'error') Object.assign(ui.lobby, { error: netMessage(session.error) });
    renderLobby();
    return;
  }
  if (ui.online?.session !== session) return;
  if (checkRematch()) return;
  checkDesync();
  renderNet();
  if (ui.match?.step.type === 'fulltime' && $('#dlg-break').open) return;
  if (!ui.busy) applyPendingRemote();
}

// Guest: the host has started a rematch. Waits for the full-time scenes to finish.
function checkRematch() {
  const o = ui.online;
  const session = o?.session;
  const peer = session?.peer;
  if (!o || o.role !== 'guest' || ui.busy || ui.match?.step.type !== 'fulltime') return false;
  if (!peer?.start || peer.start.mid === o.mid || peer.mid !== peer.start.mid || session.versionMismatch) return false;
  ui.online = { ...o, mid: peer.start.mid, start: peer.start };
  session.beginGuest(peer.start.mid);
  startMatch(null, { kind: 'online', team: o.team, mid: peer.start.mid }, startingMatch(peer.start, 'guest'));
  return true;
}

function checkDesync() {
  const o = ui.online;
  const peer = o?.session.peer;
  if (!peer || peer.mid !== o.mid || ui.busy || !ui.match) return;
  if (peer.seq === ui.match.seq && peer.hash && peer.hash !== hashState(ui.match)) {
    ui.netError = 'The two phones disagree about this match. Leave it and start a new one.';
  }
}

// Plays the other phone's next move, if it has made one.
async function applyPendingRemote() {
  const o = ui.online;
  if (!o || ui.busy || ui.view !== 'match' || ui.context?.kind !== 'online') return;
  const m = ui.match;
  if (controllerOf(m) !== 'remote') return;
  const peer = o.session.peer;
  if (!peer || peer.mid !== o.mid) return;
  const [entry] = pendingEntries(m, peer.log);
  if (!entry) return;
  const result = applyRemote(m, entry, other(o.team));
  if (!result.ok) {
    ui.netError = `A move from ${possessive(m.teams[other(o.team)].name)} phone didn't follow the rules (${result.reason}).`;
    renderNet();
    return;
  }
  await applyOutcome(m, result);
  o.session.shareProgress(ui.match);
}

function onlineRematch() {
  const o = ui.online;
  if (!o || o.role !== 'host') return;
  const m = ui.match;
  o.session.kickOff({ length: m.length, cards: m.cards, guestTeam: { name: m.teams[1].name, color: m.teams[1].color, roster: m.teams[1].roster } }).then(start => {
    ui.online = { ...o, mid: start.mid, start };
    startMatch(null, { kind: 'online', team: 0, mid: start.mid }, startingMatch(start, 'host'));
  });
}

function leaveOnline() {
  ui.online?.session.leave();
  ui.online = null;
  if (ui.context?.kind === 'online') save('match', null);
  showView('home');
}

function renderNet() {
  const net = $('#net');
  const o = ui.online;
  const onlineMatch = ui.context?.kind === 'online';
  net.hidden = !onlineMatch;
  $('#btn-restart').hidden = onlineMatch;
  if (!onlineMatch) return;
  const s = o?.session;
  const them = ui.match.teams[other(ui.context.team)].name;
  let text = 'Online';
  let state = 'good';
  if (ui.netError || s?.error || !s) {
    text = 'Connection problem';
    state = 'bad';
  } else if (!s.connected) {
    text = 'Reconnecting…';
    state = 'warn';
  } else if (!s.peer) {
    text = `${them} away`;
    state = 'warn';
  }
  net.textContent = text;
  net.dataset.state = state;
  net.title = ui.netError || (s?.error ? netMessage(s.error) : text);
  if (ui.netError && !ui.netErrorShown) {
    ui.netErrorShown = true;
    ask('Connection problem', ui.netError, [['Leave the match', leaveOnline, 'btn btn-danger'], ['Keep waiting', null, 'btn']]);
  }
}

// ---------- Dialogs & settings ----------

function openDialog(id) {
  const dlg = document.getElementById(id);
  document.querySelectorAll('dialog[open]').forEach(d => d !== dlg && d.close());
  if (id === 'dlg-log') renderLog();
  if (id === 'dlg-settings') renderSettings();
  if (!dlg.open) dlg.showModal();
}

function closeDialogs() {
  document.querySelectorAll('dialog[open]').forEach(d => d.close());
}

function ask(title, text, actions) {
  $('#ask-title').textContent = title;
  $('#ask-text').textContent = text;
  $('#ask-actions').replaceChildren(...actions.map(([label, fn, className]) => button(label, () => {
    $('#dlg-ask').close();
    fn?.();
  }, className)));
  openDialog('dlg-ask');
}

function bindDialogs() {
  document.addEventListener('click', e => {
    const opener = e.target.closest('[data-open]');
    if (opener) openDialog(opener.dataset.open);
    const closer = e.target.closest('[data-close]');
    if (closer) closer.closest('dialog').close();
    if (e.target.closest('[data-home]')) showView('home');
  });
  document.querySelectorAll('dialog').forEach(dlg => {
    dlg.addEventListener('click', e => {
      if (e.target === dlg && dlg.id !== 'dlg-break') dlg.close();
    });
    dlg.addEventListener('close', () => {
      if (!document.querySelector('dialog[open]')) afterTurn([]);
    });
  });
  $('#btn-menu').addEventListener('click', () => openDialog('dlg-menu'));
  $('#feed').addEventListener('click', e => {
    if (!e.target.closest('button')) openDialog('dlg-log');
  });
  $('#btn-restart').addEventListener('click', () => openDialog('dlg-confirm'));
  $('#btn-confirm-restart').addEventListener('click', () => {
    $('#dlg-confirm').close();
    startMatch(rematchOptions(ui.match), ui.context);
  });
  $('#btn-quit').addEventListener('click', () => {
    $('#dlg-menu').close();
    stopAutomation();
    persist();
    if (ui.online) {
      ui.online.session.leave();
      ui.online = null;
    }
    showView(ui.context?.kind === 'tournament' ? 'tournament' : 'home');
    if (ui.context?.kind === 'tournament') renderTournament();
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
  $('#set-meter').checked = ui.prefs.meter;
  $('#set-coach').checked = ui.prefs.coach;
  $('#set-cinema').value = ui.prefs.cinema;
}

function bindSettings() {
  const map = { 'set-sound': 'sound', 'set-odds': 'odds', 'set-fast': 'fast', 'set-autodef': 'autoDefence', 'set-haptics': 'haptics', 'set-meter': 'meter', 'set-coach': 'coach' };
  for (const [id, key] of Object.entries(map)) {
    $(`#${id}`).addEventListener('change', e => {
      // Turning tips back on starts them from the beginning.
      if (key === 'coach' && e.target.checked) {
        ui.coachSeen = [];
        save('coach', ui.coachSeen);
      }
      setPref(key, e.target.checked);
    });
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
  $('#rules-cards').replaceChildren(...CARDS.map(c => cardArt(c.id)));
}

// ---------- Keyboard ----------

function bindKeys() {
  document.addEventListener('keydown', e => {
    if (ui.view !== 'match' || document.querySelector('dialog[open]')) return;
    if (e.target.closest('input, textarea, select')) return;
    if (e.key === ' ' || e.key === 'Enter') {
      const primary = document.querySelector('#actions [data-primary]:not([disabled])');
      if (ui.coach && !primary && !e.target.closest('button')) {
        e.preventDefault();
        $('#coach-ok').click();
      } else if (primary && !e.target.closest('button')) {
        e.preventDefault();
        primary.click();
      } else if (ui.busy) {
        e.preventDefault();
        if (ui.cinema.active) ui.cinema.skip();
        else ui.skip?.();
      }
    }
    const n = Number(e.key);
    if (n >= 1 && n <= 4) document.querySelectorAll('#draft:not([hidden]) [data-choice], #actions [data-choice]')[n - 1]?.click();
    if (e.key === 'Escape') openDialog('dlg-menu');
  });
  $('#tray').addEventListener('click', () => ui.skip?.());
  $('#draft').addEventListener('click', e => {
    if (!e.target.closest('button:not([disabled])')) ui.skip?.();
  });
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
  bindSquad();
  bindDialogs();
  bindSettings();
  bindTabs();
  bindCoach();
  bindKeys();
  applyPrefs();

  document.querySelectorAll('[data-start]').forEach(btn => btn.addEventListener('click', () => {
    unlockAudio();
    ui.setup.mode = btn.dataset.start;
    openSetup();
  }));
  $('#btn-learn').addEventListener('click', startLearn);
  $('#link-learn').addEventListener('click', startLearn);
  $('#btn-tournament').addEventListener('click', openTournament);
  $('#btn-career').addEventListener('click', openCareer);
  $('#btn-online').addEventListener('click', openOnline);
  $('#btn-online-back').addEventListener('click', leaveLobby);
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
