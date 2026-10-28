// The dice guide: what each face of the next roll would do, shown before the
// roll so the player knows what they are hoping for. Every face is played
// through the rules engine with the dice set to it, so the guide always
// agrees with the rules, the team cards, injuries, the sin bin, the weather
// and the clock. Each face gets a tone (good, so-so or bad for the side
// rolling), a caption of a few words, and a sentence for anyone who taps it.

import { act, defenceModifier, intensityParts, kickParts, tackleBonusFor } from './engine.js';
import { DICE, METRES_PER_POINT, PLAYERS } from './dice.js';

const pct = p => `${Math.round(p * 100)}%`;
const metres = n => `${n * METRES_PER_POINT} m`;

// An rng that rolls the given faces, in order.
const scripted = (...faces) => {
  const queue = [...faces];
  return () => (queue.length ? queue.shift() + 0.5 : 0.5) / 6;
};

const rollWith = (m, ...faces) => act(m, { type: 'roll' }, scripted(...faces));
const find = (events, type) => events.find(e => e.type === type);

// Chance the run just made breaks the line: every pair of tackle dice.
function breakAfter(state) {
  if (state.step.purpose !== 'tackle') return 0;
  let breaks = 0;
  for (let a = 0; a < 6; a++) {
    for (let b = 0; b < 6; b++) if (find(rollWith(state, a, b).events, 'lineBreak')) breaks++;
  }
  return breaks / 36;
}

// When the clock is out, a face can end the half or the match.
function whistle(events, team) {
  const ft = find(events, 'fulltime');
  if (ft) return { note: 'Full time', tone: ft.winner === null ? 'ok' : ft.winner === team ? 'good' : 'bad' };
  if (find(events, 'halftime')) return { note: 'Half time' };
  if (find(events, 'suddenDeath')) return { note: 'Sudden death' };
  return null;
}

function attackFace(m, i) {
  const team = m.step.team;
  const pos = m.step.dice[0];
  const { state, events } = rollWith(m, i);
  const card = find(events, 'cardPlayed') ? ' (team card)' : '';
  const run = find(events, 'run');
  if (run) {
    const p = breakAfter(state);
    const label = run.special ? run.label : 'Hit Up';
    const changed = run.intensity !== run.value ? ` (${run.value} on the die)` : '';
    return {
      tone: run.special || p >= 0.3 ? 'good' : 'ok',
      caption: `Run ${run.intensity}`,
      note: `${pct(p)} break`,
      text: `${label}: a run at intensity ${run.intensity}${changed}. The defence need ${run.intensity}+ on two brown dice to stop it; ${pct(p)} chance of a line break.`,
    };
  }
  const pass = find(events, 'pass');
  if (pass) return { tone: 'ok', caption: `Pass ${PLAYERS[pass.to].short}`, note: 'keeps it', text: `A pass to the ${PLAYERS[pass.to].name}, who rolls next.` };
  if (find(events, 'passChoice')) return { tone: 'ok', caption: 'Pass', note: `you pick${card}`, text: `A pass to anyone you choose${card}.` };
  const drop = find(events, 'dropChance');
  if (drop) {
    return {
      tone: 'good',
      caption: 'Drop goal',
      note: 'chance',
      text: `${drop.from ? `The ${PLAYERS[drop.from].one} gives it back to the Fly Half` : 'The Fly Half drops into the pocket'}: a drop-goal chance${card}. Roll for the range, then kick or pass.`,
    };
  }
  const end = whistle(events, team);
  const error = find(events, 'error');
  if (error) {
    const caption = error.wet ? 'Wet ball' : error.error === 'knockon' ? 'Knock on' : 'Into touch';
    return { tone: 'bad', caption, note: end?.note || (error.piece === 'scrum' ? 'their scrum' : 'their lineout'), text: `${error.wet ? 'In the rain this pass slips loose: knock on.' : `${caption}.`} ${end ? `The ball is dead: ${end.note.toLowerCase()}.` : `${error.piece === 'scrum' ? 'Scrum' : 'Lineout'} to the other side.`}` };
  }
  if (find(events, 'intercept')) return { tone: 'bad', caption: 'Intercept', note: end?.note || 'their ball', text: 'Intercepted: the other side have the ball.' };
  return { tone: 'ok', caption: DICE[pos].faces[i].label, note: '', text: DICE[pos].faces[i].label };
}

function tackleGuide(m) {
  const { intensity, ruck } = m.step;
  let stops = 0;
  let rucks = 0;
  for (let a = 0; a < 6; a++) {
    for (let b = 0; b < 6; b++) {
      const { events } = rollWith(m, a, b);
      if (!find(events, 'lineBreak')) stops++;
      if (find(events, 'tackle')?.outcome === 'ruck') rucks++;
    }
  }
  // Each face as the first die, with the sin bin's and the cards' changes.
  const faces = DICE.D.faces.map((f, i) => {
    const t = find(rollWith(m, i, 0).events, 'tackle') || find(rollWith(m, i, 0).events, 'lineBreak');
    const value = t ? t.values[0] : f.value;
    if (f.kind === 'bighit') {
      return {
        tone: 'good',
        caption: 'Big Hit',
        note: ruck ? 'ruck on 1st die' : 'stops it on 2nd',
        text: ruck ? 'Big Hit: on the first die it sets up a ruck contest for the ball; on the second it always completes the tackle.' : 'Big Hit: on the second die it always completes the tackle. Against a big move there is no ruck contest.',
      };
    }
    const diff = value - f.value;
    return {
      tone: value * 2 >= intensity ? 'good' : 'ok',
      caption: `Counts ${value}`,
      note: diff ? `${f.value} ${diff > 0 ? '+' : '−'}${Math.abs(diff)}` : `of ${intensity}`,
      text: `${value}${diff ? ` (${f.value} on the die, ${diff > 0 ? '+' : '−'}${Math.abs(diff)})` : ''} towards the ${intensity} needed, with the other brown die.`,
    };
  });
  const summary = `Two brown dice need ${intensity}+ to stop the run: ${pct(stops / 36)} stopped${rucks ? `, ${pct(rucks / 36)} a ruck contest` : ''}.`;
  return { faces, summary, chance: stops / 36 };
}

function ruckFace(m, i) {
  const { events } = rollWith(m, i);
  const won = find(events, 'ruck')?.won;
  const card = find(events, 'cardPlayed') ? ' (team card)' : '';
  const end = whistle(events, m.step.team);
  return won
    ? { tone: 'good', caption: 'Turnover', note: end?.note || (card ? 'card' : 'ball won'), text: `The ruck is won${card}: the ball changes hands${end ? `, and the ball is dead: ${end.note.toLowerCase()}` : ''}.` }
    : { tone: 'bad', caption: 'Held', note: 'their ball', text: 'The attackers keep the ball and go again.' };
}

function tryFace(m, i) {
  const team = m.step.team;
  const { events } = rollWith(m, i);
  if (find(events, 'try')) {
    const end = whistle(events, team);
    return { tone: 'good', caption: 'TRY', note: end?.note === 'Full time' ? 'wins it' : '+5', text: end?.note === 'Full time' ? 'A try, and that wins the match.' : 'A try: 5 points, then the conversion.' };
  }
  if (find(events, 'videoRef')) return { tone: 'ok', caption: 'Video ref', note: 'roll again', text: 'Over to the video referee: roll the black die again.' };
  if (find(events, 'cardPlayed')) return { tone: 'ok', caption: 'Roll again', note: 'team card', text: 'Not this time, but the team card gives another roll.' };
  const no = find(events, 'noTry');
  const end = whistle(events, team);
  return { tone: 'bad', caption: no?.heldUp ? 'Held up' : 'No try', note: end?.note || 'their ball', text: `${no?.heldUp ? 'Held up over the line' : 'No try'}: the other side have the ball.` };
}

function rangeFace(m, i) {
  const { events } = rollWith(m, i);
  const r = find(events, 'range');
  const tone = r.chance >= 2 / 3 ? 'good' : r.chance >= 1 / 3 ? 'ok' : 'bad';
  const extra = r.bonus ? ` (${r.bonus > 0 ? '+' : '−'}${metres(Math.abs(r.bonus))} on the kick)` : '';
  return { tone, caption: metres(r.range), note: `${pct(r.chance)} kick`, text: `The posts ${metres(r.range)} away: ${pct(r.chance)} chance the kick lands${extra}.` };
}

function kickFace(m, i) {
  const team = m.step.team;
  const { events } = rollWith(m, i);
  const k = find(events, 'kick');
  const end = whistle(events, team);
  const what = { conversion: 'Conversion', penalty: 'Penalty goal', drop: 'Drop goal' }[k.kick];
  const after = end ? ` ${end.note}.` : '';
  return k.good
    ? { tone: 'good', caption: 'Over', note: end?.note === 'Full time' && end.tone === 'good' ? 'wins it' : end?.note || metres(k.distance), text: `${what}: ${metres(k.distance)} reaches the ${metres(k.range)} needed.${after}` }
    : { tone: 'bad', caption: 'Short', note: end?.note || metres(k.distance), text: `${metres(k.distance)} falls short of the ${metres(k.range)} needed.${after}` };
}

function penaltyFace(m, i) {
  const { events } = rollWith(m, i, 0);
  const card = find(events, 'card');
  if (card) return { tone: 'good', caption: card.color === 'red' ? 'Red card' : 'Yellow', note: 'for them', text: `The yellow dot: ${card.color === 'red' ? 'a second yellow, so a red card: −2 on each of their tackle dice for the match' : 'a yellow card: −1 on each of their tackle dice this half'}.` };
  return { tone: 'ok', caption: 'No card', note: 'range next', text: 'No card. The brown die sets the distance for a kick at goal.' };
}

function setPieceFace(m, i) {
  const team = m.step.team;
  const { events } = rollWith(m, i);
  const sp = find(events, 'setPiece');
  const pen = find(events, 'penalty');
  const card = find(events, 'cardPlayed') ? ' (team card)' : '';
  if (pen) return pen.team === team ? { tone: 'good', caption: 'Penalty', note: `to us${card}`, text: `Penalty to the side feeding${card}.` } : { tone: 'bad', caption: 'Penalty', note: 'to them', text: `Penalty to the other side${card}.` };
  const end = whistle(events, team);
  const got = find(events, 'possession');
  if (got || end) {
    const ours = got ? got.team === team : end.tone === 'good';
    const word = sp.outcome === 'reset' ? 'Reset' : sp.outcome === 'notstraight' ? 'Crooked' : ours ? 'Clean ball' : 'Stolen';
    return { tone: ours ? 'good' : 'bad', caption: word, note: end?.note || (ours ? `our ball${card}` : 'their ball'), text: `${ours ? 'The feeding side keep the ball' : 'The other side take it'}${card}.` };
  }
  if (sp.outcome === 'reset') return { tone: 'ok', caption: 'Reset', note: 'roll again', text: 'The scrum collapses: reset, roll again.' };
  return { tone: 'bad', caption: 'Crooked', note: 'their throw', text: 'Not straight: the other side throw in instead.' };
}

const FACES = { attack: attackFace, ruck: ruckFace, try: tryFace, range: rangeFace, kick: kickFace, penalty: penaltyFace, setpiece: setPieceFace };
const FLIP = { good: 'bad', bad: 'good', ok: 'ok' };
// Notes are written for the side rolling; for the other side, "our" is "their".
const SWAP = { our: 'their', their: 'our', us: 'them', them: 'us' };
const swapped = note => note.replace(/\b(our|their|us|them)\b/g, w => SWAP[w]);

// The guide for the roll the match is waiting on, or null when it isn't
// waiting on a roll. Tones are for `forTeam` (by default the side rolling):
// what's good for one side is bad for the other.
export function rollGuide(match, forTeam = match.step.team) {
  const step = match.step;
  if (step.type !== 'roll') return null;
  const flip = forTeam !== step.team;
  let faces;
  let summary = null;
  let chance = null;
  if (step.purpose === 'tackle') {
    ({ faces, summary, chance } = tackleGuide(match));
  } else {
    faces = DICE[step.dice[0]].faces.map((_, i) => FACES[step.purpose](match, i));
    if (step.purpose === 'penalty') summary = 'The black die checks for a card; the brown die sets the distance for a kick at goal.';
  }
  const shown = faces.map((f, index) => ({ index, ...f, tone: flip ? FLIP[f.tone] : f.tone, note: flip ? swapped(f.note) : f.note }));
  const good = shown.filter(f => f.tone === 'good').length;
  const bad = shown.filter(f => f.tone === 'bad').length;
  return { team: step.team, purpose: step.purpose, die: step.dice[0], dice: step.dice, faces: shown, summary, chance, good, bad };
}

// ---- Badges: what changes a die's numbers ----

const signed = n => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0');

// One badge for a die, or null: the kinds of change behind it (most
// pressing first) and their total.
function badge(parts, unit = '') {
  const kinds = parts.filter(p => p.value).map(p => p.kind);
  if (!kinds.length) return null;
  const total = parts.reduce((n, p) => n + p.value, 0);
  return { kinds, kind: kinds[0], value: total, text: `${signed(unit ? total * METRES_PER_POINT : total)}${unit}`, label: parts.filter(p => p.value).map(p => p.label).join('. ') };
}

// An attacking player's die: their injury, and any advantage.
export function playerBadge(match, team, pos) {
  const parts = intensityParts(match, team, pos, 0);
  return badge([
    { kind: 'injury', value: -parts.injury, label: `Injured: ${signed(-parts.injury)} on every run` },
    { kind: 'advantage', value: parts.quickTap, label: 'Advantage: +1 on every run' },
  ]);
}

// Badges for the dice of the roll the match is waiting on, one per die (or null).
export function dieBadges(match) {
  const step = match.step;
  if (step.type !== 'roll') return [];
  const none = step.dice.map(() => null);
  if (step.purpose === 'attack') return [playerBadge(match, step.team, step.dice[0])];
  if (step.purpose === 'tackle') {
    const mod = defenceModifier(match, step.team);
    const bonus = tackleBonusFor(match, step.team, !!step.special);
    const card = { kind: mod <= -2 ? 'red' : 'sinbin', value: mod, label: mod <= -2 ? 'Red card: −2 on each tackle die' : 'Sin bin: −1 on each tackle die' };
    return bonus.map(b => badge([card, { kind: 'card', value: b, label: 'Team card: +1 on this tackle die' }]));
  }
  if (step.purpose === 'kick') {
    const { card, wind } = kickParts(match, step.team, step.kick);
    return [badge([
      { kind: 'wind', value: wind, label: wind > 0 ? 'Wind behind: +10 m' : 'Into the wind: −10 m' },
      { kind: 'card', value: card, label: `Team card: +${card * METRES_PER_POINT} m` },
    ], ' m')];
  }
  return none;
}
