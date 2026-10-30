// The dice on the table, split between the sides: what the attacking side
// rolled and what it comes to after every plus and minus, and the same for
// the defence, with the verdict between them. Pure data for the tray to draw.
//
// duelOf(before, after, events) describes the roll just made; restingDuel(m)
// the last roll of a match, for when the screen is drawn without one (a
// resumed match).
//
// A column: { team, role, dice: [{ id, face, rolled, ghost }], terms, total }
// where terms are [{ n, label }] (n a signed number as text) and total is
// what they come to. A duel: { columns, verdict: { text, tone, team? } | null },
// where team is the side the roll went for, when one end clearly won it.

import { DICE } from './dice.js';
import { CARD_BY_ID, cardsWith } from './cards.js';
import { defenceModifier, intensityParts, playerRating, tackleBonusFor } from './engine.js';

const signed = n => (n > 0 ? `+${n}` : `−${-n}`);
const metres = n => `${n * 10} m`;
const names = cards => cards.map(c => CARD_BY_ID[c.id].name).join(' + ');
const find = (events, type) => events.find(e => e.type === type);
const other = team => 1 - team;

// A run: the die, then quick tap, cards and injuries.
export function runTerms(match, team, pos, face) {
  const p = intensityParts(match, team, pos, face.value, face);
  const terms = [{ n: String(face.value), label: face.special ? face.label : 'Hit Up' }];
  if (p.quickTap) terms.push({ n: signed(p.quickTap), label: 'quick tap' });
  if (p.card) terms.push({ n: signed(p.card), label: names(cardsWith(match, team, fx => fx.runBonus?.[pos])) });
  if (p.fortress) terms.push({ n: signed(-p.fortress), label: names(cardsWith(match, other(team), fx => fx.specialDefence || fx.hitUpDefence)) });
  if (p.injury) terms.push({ n: signed(-p.injury), label: 'injured' });
  if (p.offPos) terms.push({ n: signed(-p.offPos), label: 'out of position' });
  if (p.rating) terms.push({ n: signed(p.rating), label: `rated ${playerRating(match, team, pos)}` });
  return { terms, total: p.intensity };
}

// What the tackling side's dice carry: the sin bin or a red card on each die,
// and a card's bonus.
function defenceTerms(match, def, special) {
  const terms = [];
  const mod = defenceModifier(match, def);
  if (mod) terms.push({ n: signed(2 * mod), label: mod === -2 ? 'red card' : 'sin bin' });
  const bonus = tackleBonusFor(match, def, special);
  const b = bonus[0] + bonus[1];
  if (b) terms.push({ n: signed(b), label: names(cardsWith(match, def, fx => fx.tackleBonus)) });
  return terms;
}

const column = (team, role, dice, terms = [], total = null) => ({ team, role, dice, terms, total });

export function duelOf(before, after, events) {
  const step = before.step;
  const roll = after.roll;
  if (step.type !== 'roll' || !roll) return null;
  // slot: the die's place in the roll, for its badge.
  const rolled = roll.dice.map((id, i) => ({ id, face: roll.faces[i], rolled: true, slot: i }));
  const team = step.team;
  switch (step.purpose) {
    case 'attack': {
      const run = find(events, 'run');
      if (!run) return { columns: [column(team, 'Attack', rolled)], verdict: null };
      const face = DICE[run.pos].faces[roll.faces[0]];
      const { terms, total } = runTerms(before, team, run.pos, face);
      const def = other(team);
      const ghosts = [{ id: 'D', ghost: true }, { id: 'D', ghost: true }];
      return {
        columns: [
          column(team, 'Attack', rolled, terms, total),
          column(def, 'Defence', ghosts, defenceTerms(after, def, run.special), `${total}+`),
        ],
        verdict: null,
      };
    }
    case 'tackle': {
      const att = other(team);
      const pos = step.carrier;
      const cols = [];
      // The run being tackled: the die it came from, if that was the last roll.
      if (before.roll?.purpose === 'attack' && before.roll.dice[0] === pos) {
        const face = DICE[pos].faces[before.roll.faces[0]];
        const { terms, total } = runTerms(before, att, pos, face);
        cols.push(column(att, 'Attack', [{ id: pos, face: before.roll.faces[0], rolled: false }], terms, total));
      } else {
        cols.push(column(att, 'Attack', [], [{ n: String(step.intensity), label: 'run' }], step.intensity));
      }
      const e = find(events, 'lineBreak') || find(events, 'tackle');
      const [a, b] = roll.faces.map(f => DICE.D.faces[f]);
      const word = f => (f.kind === 'bighit' ? 'Big Hit' : 'tackle');
      const terms = [{ n: String(a.value), label: word(a) }, { n: signed(b.value), label: word(b) }, ...defenceTerms(before, team, step.special)];
      const big = e.type === 'tackle' && e.outcome !== 'tackle';
      cols.push(column(team, 'Defence', rolled, terms, e.total));
      const verdict = e.type === 'lineBreak'
        ? { text: `${step.intensity} beats ${e.total}: line break`, tone: 'attack' }
        : big
          ? { text: e.outcome === 'ruck' ? 'Big Hit: they contest the ruck' : 'Big Hit: tackled', tone: 'defence' }
          : { text: `${e.total} stops ${step.intensity}: tackled`, tone: 'defence' };
      verdict.team = e.type === 'lineBreak' ? att : team;
      return { columns: cols, verdict };
    }
    case 'kick': {
      const k = find(events, 'kick');
      const terms = [{ n: metres(k.rolled), label: 'kick' }];
      const rated = `rated ${playerRating(before, team, 'B')}`;
      if (k.cap < k.rolled) terms.push({ n: `−${metres(k.rolled - k.cap)}`, label: `reaches ${metres(k.cap)}, ${rated}` });
      if (k.star) terms.push({ n: `+${metres(k.star)}`, label: rated });
      if (k.card) terms.push({ n: `${k.card > 0 ? '+' : '−'}${metres(Math.abs(k.card))}`, label: names(cardsWith(before, team, fx => fx.kickBonus?.[k.kick])) });
      if (k.wind) terms.push({ n: `${k.wind > 0 ? '+' : '−'}${metres(Math.abs(k.wind))}`, label: 'wind' });
      return {
        columns: [column(team, 'Kick', rolled, terms, metres(k.distance))],
        verdict: { text: `${metres(k.distance)} v ${metres(k.range)} to the posts: ${k.good ? 'over' : 'short'}`, tone: k.good ? 'attack' : 'defence', team: k.good ? team : null },
      };
    }
    case 'range': {
      const r = find(events, 'range');
      return {
        columns: [column(team, 'Kick', rolled, [], metres(r.range))],
        verdict: { text: `${Math.round(r.chance * 100)}% to land from ${metres(r.range)}`, tone: 'ok' },
      };
    }
    case 'penalty': {
      const card = find(events, 'card');
      const r = find(events, 'range');
      return {
        columns: [
          column(team, 'Penalty', [rolled[1]], [], metres(r.range)),
          column(step.offender, 'Card?', [rolled[0]], [], card ? (card.color === 'red' ? 'Red' : 'Yellow') : 'None'),
        ],
        verdict: { text: card ? `${card.color === 'red' ? 'Red' : 'Yellow'} card, and the posts are ${metres(r.range)} away` : `No card. The posts are ${metres(r.range)} away`, tone: 'ok' },
      };
    }
    case 'restart': {
      const r = find(events, 'restart');
      return {
        columns: [column(team, 'Kick-off', rolled, [], String(r.kick))],
        verdict: { text: `${r.kick}: ${r.regathered ? 'won back' : 'caught'} (4+ wins it back)`, tone: r.regathered ? 'attack' : 'defence', team: r.regathered ? team : r.receiver },
      };
    }
    default:
      // A try, a ruck or a set piece: one side's die, and the headline says the rest.
      return { columns: [column(team, ROLE[step.purpose] || 'Roll', rolled)], verdict: null };
  }
}

const ROLE = { try: 'Try?', ruck: 'Ruck', setpiece: 'Feed', restart: 'Kick-off' };

// The last roll on its own, for drawing the screen fresh.
export function restingDuel(match) {
  const roll = match.roll;
  if (!roll) return null;
  const dice = roll.dice.map((id, i) => ({ id, face: roll.faces[i], rolled: false }));
  return { columns: [column(roll.team, ROLE[roll.purpose] || 'Last roll', dice)], verdict: null };
}
