// Turns engine events into commentary lines, tray headlines and big moments.

import { METRES_PER_POINT, PLAYERS } from './dice.js';
import { CARD_BY_ID, cardTier, RARITY_BY_ID } from './cards.js';
import { fullName, possessive, who } from './players.js';

const pick = lines => lines[Math.floor(Math.random() * lines.length)];
const pct = p => `${Math.round(p * 100)}%`;
export const metres = n => `${n * METRES_PER_POINT} m`;
const signed = n => (n < 0 ? `−${-n}` : `+${n}`);
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const cardName = (match, team) => CARD_BY_ID[match.teams[team].card]?.name || 'team card';

// "5 (3 + 3, −1 each for the card, +1 Rush Defence)": the dice as rolled, then adjustments.
function tackleSum(e, match) {
  const bonus = Array.isArray(e.bonus) ? e.bonus : [e.bonus || 0, 0];
  const rolled = e.values.map((v, i) => v - e.modifier - bonus[i]);
  const extra = bonus[0] + bonus[1];
  const notes = [];
  if (e.modifier) notes.push(`${signed(e.modifier)} each for the card`);
  if (extra) notes.push(`${signed(extra)} ${cardName(match, e.team)}`);
  return `${e.total} (${rolled.join(' + ')}${notes.length ? `, ${notes.join(', ')}` : ''})`;
}

// Why a run's intensity differs from the number on the die.
function runNotes(e, match) {
  const notes = [];
  if (e.quickTap) notes.push('+1 advantage');
  if (e.card) notes.push(`${signed(e.card)} ${cardName(match, e.team)}`);
  if (e.fortress) notes.push(`${signed(-e.fortress)} ${cardName(match, 1 - e.team)}`);
  if (e.injury) notes.push(`−${e.injury} injury`);
  return notes.length ? ` (${e.value} ${notes.join(', ')})` : '';
}

// What a card did, after the team's name: "Foxes keep hold of…".
const CARD_LINES = {
  knockon: 'keep hold of a ball that was going to ground',
  touch: 'keep it in play instead of finding touch',
  intercept: 'see the interception coming and pass instead',
  dropChance: 'set up a drop-goal chance',
  ruck: e => `win the ruck on ${RUCK_ROLLS[e.result] || 'the roll'}`,
  heldUp: 'are held up, but roll again',
  noTry: 'are ruled out, but roll again',
  penalty: 'talk the referee round: penalty to them',
  reset: 'take the reset scrum',
  notstraight: 'take the crooked throw',
  advantage: e => `carry the shove on: +1 on the next ${e.runs > 1 ? `${e.runs} runs` : 'run'}`,
  ownFeed: 'hold on to their own ball at the set piece',
  steal: "steal the other side's ball at the set piece",
};
const RUCK_ROLLS = { video: 'the video ref', notry: 'a NO TRY', try: 'a TRY roll' };
const cardLine = e => {
  const line = CARD_LINES[e.what];
  return (typeof line === 'function' ? line(e) : line) || 'play their card';
};
// "Golden Boot", or "Golden Boot (Mythic)" above Common.
const cardLabel = (id, rarity) => `${CARD_BY_ID[id].name}${rarity && rarity !== 'common' ? ` (${RARITY_BY_ID[rarity].name})` : ''}`;

// Returns { lines: [{text, team, tone}], headline, detail, moments: [{kind, team, title, sub}] }
export function narrate(events, match) {
  const name = team => match.teams[team].name;
  const pos = p => PLAYERS[p].name;
  const player = (team, p) => who(match, team, p);
  const out = { lines: [], headline: null, detail: null, moments: [] };
  let cardNote = '';
  const say = (text, team = null, tone = 'info') => out.lines.push({ text, team, tone });
  const head = (headline, detail = null) => {
    out.headline = headline;
    out.detail = detail;
  };

  for (const e of events) {
    switch (e.type) {
      case 'toss':
        say(`${name(e.caller)} call ${e.call}. It lands ${e.result}. ${name(e.winner)} receive the kick-off.`, e.winner);
        head(e.result === 'heads' ? 'Heads' : 'Tails', `${name(e.winner)} win the toss and receive.`);
        break;

      case 'deal': {
        const mythic = e.cards.filter(id => e.rarity?.[id] === 'mythic');
        const best = mythic.length ? ` ${mythic.length > 1 ? `${mythic.length} of them are` : 'One of them is'} MYTHIC!` : '';
        say(`Three team cards are dealt.${best} ${name(e.first)} lost the toss, so they pick first.`, e.first, mythic.length ? 'big' : 'info');
        head(mythic.length ? 'Mythic card!' : 'Team cards', `${name(e.first)} pick first. ${name(1 - e.first)} take one of the other two.`);
        if (mythic.length) out.moments.push({ kind: 'mythic', team: e.first, cards: mythic, title: 'Mythic card', sub: '' });
        break;
      }

      case 'draft': {
        const card = cardTier(e.card, e.rarity);
        say(`${name(e.team)} take ${cardLabel(e.card, e.rarity)}: ${card.text}`, e.team, 'big');
        head(`${name(e.team)}: ${card.name}`, e.first ? `${name(1 - e.team)} pick from the other two.` : 'Both sides have their card. Kick-off!');
        if (!e.first) out.moments.push({ kind: 'draft', team: e.team, title: 'Team cards', sub: '' });
        break;
      }

      case 'catchUp': {
        const card = CARD_BY_ID[e.card];
        say(`Catch-up: the first pick was rarer, so ${possessive(name(e.team))} ${card.name} goes up from ${RARITY_BY_ID[e.from].name} to ${RARITY_BY_ID[e.to].name}.`, e.team, 'big');
        out.detail = `Catch-up: ${card.name} goes up to ${RARITY_BY_ID[e.to].name}. Kick-off!`;
        break;
      }

      case 'cardPlayed': {
        const card = CARD_BY_ID[e.card];
        const line = cardLine(e);
        say(`${card.name}! ${name(e.team)} ${line}.`, e.team, 'big');
        head(card.name, `${name(e.team)} ${line}.`);
        out.moments.push({ kind: 'cardplay', team: e.team, card: e.card, rarity: e.rarity, title: card.name, sub: cap(line) });
        break;
      }

      case 'possession':
        if (e.reason === 'kickoff') say(`${name(e.team)} gather the kick-off. Scrum Half to play.`, e.team);
        break;

      case 'run': {
        const runner = player(e.team, e.pos);
        if (e.special) {
          say(pick([`${e.label.toUpperCase()}! ${cap(runner)} has a go. Intensity ${e.intensity}.`, `${cap(runner)}: ${e.label}! Intensity ${e.intensity}.`]), e.team, 'big');
        } else {
          say(pick([`${cap(runner)} takes it up. Hit Up ${e.intensity}.`, `${cap(runner)} carries hard into contact. Hit Up ${e.intensity}.`, `${cap(runner)} runs straight at them. Hit Up ${e.intensity}.`]), e.team);
        }
        const ruckNote = e.ruck ? ' A Big Hit sets up a ruck contest.' : '';
        head(`${e.label} ${e.intensity}`, `Defence need ${e.intensity}+ from two brown dice${runNotes(e, match)}.${ruckNote}`);
        break;
      }

      case 'pass':
        if (e.chosen) say(`${cap(player(e.team, e.from))} moves it on to ${player(e.team, e.to)}.`, e.team);
        else say(pick([`The Scrum Half fires it out to ${player(e.team, e.to)}.`, `Quick ball. The Scrum Half finds ${player(e.team, e.to)}.`]), e.team);
        head(`Pass to ${pos(e.to)}`, `${fullName(match, e.team, e.to)} rolls next.`);
        break;

      case 'passChoice':
        say(`${cap(player(e.team, e.pos))} looks for support.`, e.team);
        head('Pass', 'Choose who takes the ball.');
        break;

      case 'dropChance':
        say(`${cap(player(e.team, e.pos))} drops into the pocket. Drop goal on?`, e.team);
        head('Drop-goal chance', 'Roll the brown die to see the range.');
        break;

      case 'error': {
        const other = 1 - e.team;
        if (e.error === 'knockon') say(`Knock on by ${player(e.team, e.pos)}. Scrum, ${name(other)} feed.`, e.team, 'bad');
        else say(`${cap(player(e.team, e.pos))} puts it into touch. Lineout, ${name(other)} throw.`, e.team, 'bad');
        head(e.error === 'knockon' ? 'Knock on' : 'Into touch', `${e.piece === 'scrum' ? 'Scrum' : 'Lineout'} to ${name(other)}.`);
        break;
      }

      case 'intercept':
        say(`INTERCEPTED! ${cap(player(e.team, e.pos))} reads the pass.`, e.team, 'big');
        head('Intercepted', `Turnover. ${name(e.team)} have the ball.`);
        out.moments.push({ kind: 'turnover', team: e.team, title: 'Intercepted', sub: `${fullName(match, e.team, e.pos)} reads it` });
        break;

      case 'tackle': {
        const sum = `${tackleSum(e, match)} vs ${e.need}`;
        const tackler = player(e.team, e.pos);
        if (e.outcome === 'ruck') {
          say(`BIG HIT from ${tackler}! ${name(e.team)} go for the ball.`, e.team, 'big');
          head('Big hit!', `${name(e.team)} contest the ruck: they need RUCK WIN on the black die.`);
          out.moments.push({ kind: 'bighit', team: e.team, title: 'Big hit', sub: 'Ruck contest', ruck: true, player: fullName(match, e.team, e.pos) });
        } else if (e.outcome === 'bighit') {
          say(pick([`BIG HIT! ${cap(tackler)} smashes them backwards.`, `What a hit by ${tackler}! Stopped dead.`]), e.team, 'big');
          head('Big hit!', 'A Big Hit on the second die always completes the tackle.');
          out.moments.push({ kind: 'bighit', team: e.team, title: 'Big hit', sub: 'Tackle made', player: fullName(match, e.team, e.pos) });
        } else {
          say(pick([`Tackled by ${tackler}. ${sum}.`, `${name(e.team)} hold firm. ${sum}.`, `${cap(tackler)} brings them down. ${sum}.`]), e.team);
          head('Tackled', `Tackle total ${sum}. Back to the Scrum Half.`);
        }
        break;
      }

      case 'lineBreak':
        say(pick([`LINE BREAK! ${cap(player(e.team, e.pos))} is through!`, `They can't hold ${player(e.team, e.pos)}! LINE BREAK!`]), e.team, 'big');
        head('Line break!', `Tackle total ${tackleSum({ ...e, team: 1 - e.team }, match)} couldn't reach ${e.need}. Roll the black die for the try.`);
        out.moments.push({ kind: 'break', team: e.team, pos: e.pos, title: 'Line break', sub: `${fullName(match, e.team, e.pos)} is away`, player: fullName(match, e.team, e.pos) });
        break;

      case 'injury':
        say(`${cap(player(e.team, e.pos))} is hurt after two big hits. −${e.penalty} on their runs for the match.`, e.team, 'bad');
        out.moments.push({ kind: 'injury', team: e.team, pos: e.pos, penalty: e.penalty, title: 'Injury', sub: `${fullName(match, e.team, e.pos)} −${e.penalty} for the match`, player: fullName(match, e.team, e.pos) });
        break;

      case 'ruck':
        if (e.won) {
          say(`TURNOVER! ${name(e.team)} win the ruck.`, e.team, 'big');
          head('Ruck won', `${name(e.team)} steal the ball.`);
          out.moments.push({ kind: 'turnover', team: e.team, title: 'Turnover', sub: 'Won at the ruck' });
        } else {
          say(`Ball recycled. ${name(1 - e.team)} keep it.`, 1 - e.team);
          head('Ruck held', `${name(1 - e.team)} keep the ball.`);
        }
        break;

      case 'videoRef':
        say('Over to the video referee…', e.team);
        head('Video ref', 'Roll the black die again.');
        out.moments.push({ kind: 'tmo', team: e.team, title: 'Video ref', sub: 'Roll again' });
        break;

      case 'try':
        say(pick([`TRY! ${cap(player(e.team, e.pos))} dots it down!`, `TRY! ${name(e.team)} score through ${player(e.team, e.pos)}!`]), e.team, 'score');
        head('Try!', '5 points. Roll the brown die for the conversion range.');
        out.moments.push({ kind: 'try', team: e.team, pos: e.pos, title: 'Try!', sub: `${name(e.team)} +5`, player: fullName(match, e.team, e.pos) });
        break;

      case 'noTry':
        say(e.heldUp ? 'Held up over the line! No try.' : "Ruled out. No try, and it's a changeover.", e.team, 'bad');
        head('No try', `Changeover. ${name(1 - e.team)} have the ball.`);
        out.moments.push({ kind: 'notry', team: e.team, heldUp: e.heldUp, title: 'No try', sub: e.heldUp ? 'Held up' : 'Changeover' });
        break;

      case 'range': {
        const boost = e.bonus ? ` with ${metres(e.bonus)} from ${cardName(match, e.team)}` : '';
        if (e.kick === 'conversion') say(`Conversion from ${metres(e.range)}.`, e.team);
        if (e.kick === 'drop') say(`Drop-goal range: ${metres(e.range)}.`, e.team);
        if (e.kick === 'penalty') say(`The posts are ${metres(e.range)} away.`, e.team);
        head(`Range ${metres(e.range)}`, `${cardNote}Kick must reach ${metres(e.range)}${boost}: ${pct(e.chance)} chance.`);
        break;
      }

      case 'dropAttempt':
        say(`${cap(player(e.team, e.pos))} goes for the drop goal…`, e.team);
        break;
      case 'dropDeclined':
        say('Out of range. They keep it in hand.', e.team);
        break;
      case 'penaltyAttempt':
        say('They point to the posts.', e.team);
        break;

      case 'kick': {
        const what = { conversion: 'Conversion', penalty: 'Penalty goal', drop: 'Drop goal' }[e.kick];
        const kicker = e.kicker ? player(e.team, e.kicker) : name(e.team);
        const struck = e.bonus ? `${metres(e.distance)} (${metres(e.rolled)} ${signed(e.bonus * METRES_PER_POINT)} m ${cardName(match, e.team)})` : metres(e.distance);
        if (e.good) {
          say(`${what}! ${cap(kicker)} strikes it ${struck}, ${metres(e.range)} needed.`, e.team, 'score');
          head(`${what}!`, `Struck ${struck}, needed ${metres(e.range)}.`);
          if (e.kick !== 'conversion') out.moments.push({ kind: 'goal', team: e.team, title: what, sub: `${name(e.team)} +3` });
          else out.moments.push({ kind: 'conversion', team: e.team, title: 'Converted', sub: `${name(e.team)} +2` });
        } else {
          say(`${what} missed. ${cap(kicker)} only finds ${struck}, ${metres(e.range)} needed.`, e.team, 'bad');
          head('Missed', `Struck ${struck}, needed ${metres(e.range)}.${e.kick === 'conversion' ? '' : ' Changeover.'}`);
        }
        break;
      }

      case 'setPiece': {
        const piece = e.piece === 'scrum' ? 'scrum' : 'lineout';
        const other = 1 - e.team;
        const lines = {
          win: [`${name(e.team)} win their own ${piece}.`, `Green light: ${name(e.team)} ${piece} ball`],
          lose: [`${name(other)} steal the ${piece}!`, `Red light: ${name(other)} take it`],
          reset: ['The scrum collapses. Reset.', 'Reset: roll the white die again'],
          notstraight: [`Not straight! ${name(other)} take the throw.`, `${name(other)} now throw in`],
          penaltyWon: [`Penalty to ${name(e.team)} at the ${piece}.`, `Penalty to ${name(e.team)}`],
          penaltyAgainst: [`Penalty against ${name(e.team)} at the ${piece}.`, `Penalty to ${name(other)}`],
        }[e.outcome];
        say(lines[0], e.outcome === 'lose' || e.outcome === 'notstraight' ? other : e.team, e.outcome === 'lose' ? 'big' : 'info');
        head(e.piece === 'scrum' ? 'Scrum' : 'Lineout', `${lines[1]}.`);
        break;
      }

      case 'penalty':
        out.moments.push({ kind: 'penalty', team: e.team, title: 'Penalty', sub: `to ${name(e.team)}` });
        head(`Penalty to ${name(e.team)}`, 'Roll to check for a card and find the range.');
        break;

      case 'card':
        if (e.color === 'yellow') {
          say(`YELLOW CARD! ${name(e.team)} lose a player to the sin bin. −1 on each tackle die this half.`, e.team, 'bad');
          out.moments.push({ kind: 'yellow', team: e.team, title: 'Yellow card', sub: `${name(e.team)} −1 on each tackle die this half` });
          cardNote = `Yellow card for ${name(e.team)}. `;
        } else {
          say(`Second yellow. RED CARD! ${name(e.team)} are −2 on each tackle die for the rest of the match.`, e.team, 'bad');
          out.moments.push({ kind: 'red', team: e.team, title: 'Red card', sub: `${name(e.team)} −2 on each tackle die for the match` });
          cardNote = `Red card for ${name(e.team)}. `;
        }
        break;
      case 'noCard':
        say('No card from the referee.', e.team);
        cardNote = 'No card. ';
        break;

      case 'quickTap':
        say(`${name(e.team)} tap and go! +1 intensity for the next 3 runs.`, e.team, 'big');
        out.moments.push({ kind: 'quicktap', team: e.team, title: 'Tap and go', sub: '+1 for 3 runs' });
        break;
      case 'advantageOver':
        say('Advantage over.', e.team);
        break;

      case 'halftime':
        say(`Half time. ${scoreLine(match)}.`, null, 'score');
        out.moments.push({ kind: 'halftime', team: null, title: 'Half time', sub: scoreLine(match) });
        break;
      case 'secondHalf':
        say('The second half is under way.', null);
        break;
      case 'fulltime':
        say(`FULL TIME! ${name(e.winner)} win. ${scoreLine(match)}.`, e.winner, 'score');
        out.moments.push({ kind: 'fulltime', team: e.winner, title: 'Full time', sub: scoreLine(match) });
        break;
    }
  }
  return out;
}

export function scoreLine(match) {
  const [a, b] = match.teams;
  return `${a.name} ${a.score}–${b.score} ${b.name}`;
}
