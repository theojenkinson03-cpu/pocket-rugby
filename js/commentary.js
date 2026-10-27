// Turns engine events into commentary lines, tray headlines and big moments.

import { METRES_PER_POINT, PLAYERS } from './dice.js';

const pick = lines => lines[Math.floor(Math.random() * lines.length)];
const pct = p => `${Math.round(p * 100)}%`;
export const metres = n => `${n * METRES_PER_POINT} m`;

// Returns { lines: [{text, team, tone}], headline, detail, moments: [{kind, team, title, sub}] }
export function narrate(events, match) {
  const name = team => match.teams[team].name;
  const pos = p => PLAYERS[p].name;
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

      case 'possession':
        if (e.reason === 'kickoff') say(`${name(e.team)} gather the kick-off. Scrum Half to play.`, e.team);
        break;

      case 'run': {
        const who = `${name(e.team)} ${pos(e.pos)}`;
        if (e.special) {
          say(pick([`${e.label.toUpperCase()}! The ${pos(e.pos)} has a go. Intensity ${e.intensity}.`, `${who}: ${e.label}! Intensity ${e.intensity}.`]), e.team, 'big');
        } else {
          say(pick([`${who} takes it up. Hit Up ${e.intensity}.`, `${who} carries hard into contact. Hit Up ${e.intensity}.`, `The ${pos(e.pos)} runs straight at them. Hit Up ${e.intensity}.`]), e.team);
        }
        const notes = [];
        if (match.quickTap > 0) notes.push('+1 quick tap');
        const hurt = match.teams[e.team].injuries[e.pos];
        if (hurt) notes.push(`−${hurt} injury`);
        const why = notes.length ? ` (${e.value} ${notes.join(', ')})` : '';
        head(`${e.label} ${e.intensity}`, `Defence need ${e.intensity}+ from two brown dice${why}.`);
        break;
      }

      case 'pass':
        if (e.chosen) say(`${pos(e.from)} moves it on to the ${pos(e.to)}.`, e.team);
        else say(pick([`Scrum Half fires it out to the ${pos(e.to)}.`, `Quick ball. Scrum Half finds the ${pos(e.to)}.`]), e.team);
        head(`Pass to ${pos(e.to)}`, `${pos(e.to)} rolls next.`);
        break;

      case 'passChoice':
        say(`The ${pos(e.pos)} looks for support.`, e.team);
        head('Pass', 'Choose who takes the ball.');
        break;

      case 'dropChance':
        say(`The ${pos(e.pos)} drops into the pocket. Drop goal on?`, e.team);
        head('Drop goal chance', 'Roll the brown die to see the range.');
        break;

      case 'error': {
        const other = 1 - e.team;
        if (e.error === 'knockon') say(`Knock on by the ${name(e.team)} ${pos(e.pos)}. Scrum, ${name(other)} feed.`, e.team, 'bad');
        else say(`The ${pos(e.pos)} puts it into touch. Lineout, ${name(other)} throw.`, e.team, 'bad');
        head(e.error === 'knockon' ? 'Knock on' : 'Into touch', `${e.piece === 'scrum' ? 'Scrum' : 'Lineout'} to ${name(other)}.`);
        break;
      }

      case 'intercept':
        say(`INTERCEPTED! ${name(e.team)} read the pass from the ${pos(e.pos)}.`, e.team, 'big');
        head('Intercepted', `Turnover. ${name(e.team)} have the ball.`);
        out.moments.push({ kind: 'turnover', team: e.team, title: 'Intercepted', sub: `${name(e.team)} ball` });
        break;

      case 'tackle': {
        const sum = `${e.total}${e.modifier ? ` (incl. ${e.modifier})` : ''} vs ${e.need}`;
        if (e.outcome === 'ruck') {
          say(`BIG HIT! ${name(e.team)} drive them back and go for the ball.`, e.team, 'big');
          head('Big hit!', `Low hit up. ${name(e.team)} contest the ruck: they need RUCK WIN on the black die.`);
          out.moments.push({ kind: 'bighit', team: e.team, title: 'Big hit', sub: 'Ruck contest' });
        } else if (e.outcome === 'bighit') {
          say(pick([`BIG HIT! ${name(e.team)} smash the ${pos(e.pos)} backwards.`, `What a hit by ${name(e.team)}! Stopped dead.`]), e.team, 'big');
          head('Big hit!', 'A Big Hit on the second die always completes the tackle.');
          out.moments.push({ kind: 'bighit', team: e.team, title: 'Big hit', sub: 'Tackle made' });
        } else {
          say(pick([`Tackled. ${sum}.`, `${name(e.team)} hold firm. ${sum}.`, `Brought down. ${sum}.`]), e.team);
          head('Tackled', `Tackle total ${sum}. Back to the Scrum Half.`);
        }
        break;
      }

      case 'lineBreak':
        say(pick([`LINE BREAK! The ${pos(e.pos)} is through!`, `They can't hold the ${pos(e.pos)}! LINE BREAK!`]), e.team, 'big');
        head('Line break!', `Tackle total ${e.total}${e.modifier ? ` (incl. ${e.modifier})` : ''} couldn't reach ${e.need}. Roll the black die for the try.`);
        out.moments.push({ kind: 'break', team: e.team, title: 'Line break', sub: `${pos(e.pos)} is away` });
        break;

      case 'injury':
        say(`The ${name(e.team)} ${pos(e.pos)} is hurt after two big hits. −${e.penalty} on their runs for the match.`, e.team, 'bad');
        out.moments.push({ kind: 'injury', team: e.team, title: 'Injury', sub: `${pos(e.pos)} −${e.penalty} for the match` });
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
        break;

      case 'try':
        say(pick([`TRY! The ${name(e.team)} ${pos(e.pos)} dots it down!`, `TRY! ${name(e.team)} score through the ${pos(e.pos)}!`]), e.team, 'score');
        head('Try!', '5 points. Roll the brown die for the conversion range.');
        out.moments.push({ kind: 'try', team: e.team, title: 'Try!', sub: `${name(e.team)} +5` });
        break;

      case 'noTry':
        say(e.heldUp ? 'Held up over the line! No try.' : 'Ruled out. No try, and it\'s a changeover.', e.team, 'bad');
        head('No try', `Changeover. ${name(1 - e.team)} have the ball.`);
        break;

      case 'range': {
        const need = `Kick must reach ${metres(e.range)}`;
        if (e.kick === 'conversion') say(`Conversion from ${metres(e.range)}.`, e.team);
        if (e.kick === 'drop') say(`Drop goal range: ${metres(e.range)}.`, e.team);
        if (e.kick === 'penalty') say(`The posts are ${metres(e.range)} away.`, e.team);
        head(`Range ${metres(e.range)}`, `${cardNote}${need}: ${pct(e.chance)} chance.`);
        break;
      }

      case 'dropAttempt':
        say('They go for the drop goal…', e.team);
        break;
      case 'dropDeclined':
        say('Out of range. They keep it in hand.', e.team);
        break;
      case 'penaltyAttempt':
        say('They point to the posts.', e.team);
        break;

      case 'kick': {
        const what = { conversion: 'Conversion', penalty: 'Penalty goal', drop: 'Drop goal' }[e.kick];
        if (e.good) {
          say(`${what}! ${metres(e.distance)} clears the ${metres(e.range)} needed.`, e.team, 'score');
          head(`${what}!`, `Struck ${metres(e.distance)}, needed ${metres(e.range)}.`);
          if (e.kick !== 'conversion') out.moments.push({ kind: 'goal', team: e.team, title: what, sub: `${name(e.team)} +3` });
          else out.moments.push({ kind: 'conversion', team: e.team, title: 'Converted', sub: `${name(e.team)} +2` });
        } else {
          say(`${what} missed. Only ${metres(e.distance)}, needed ${metres(e.range)}.`, e.team, 'bad');
          head('Missed', `Struck ${metres(e.distance)}, needed ${metres(e.range)}.${e.kick === 'conversion' ? '' : ' Changeover.'}`);
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
        head(e.piece === 'scrum' ? 'Scrum' : 'Lineout', lines[1] + '.');
        break;
      }

      case 'penalty':
        out.moments.push({ kind: 'penalty', team: e.team, title: 'Penalty', sub: `to ${name(e.team)}` });
        head(`Penalty to ${name(e.team)}`, 'Roll to check for a card and find the range.');
        break;

      case 'card':
        if (e.color === 'yellow') {
          say(`YELLOW CARD! ${name(e.team)} lose a player to the sin bin. −1 on their tackles this half.`, e.team, 'bad');
          out.moments.push({ kind: 'yellow', team: e.team, title: 'Yellow card', sub: `${name(e.team)} −1 on tackles this half` });
          cardNote = `Yellow card for ${name(e.team)}. `;
        } else {
          say(`Second yellow. RED CARD! ${name(e.team)} are −2 on tackles for the rest of the match.`, e.team, 'bad');
          out.moments.push({ kind: 'red', team: e.team, title: 'Red card', sub: `${name(e.team)} −2 on tackles for the match` });
          cardNote = `Red card for ${name(e.team)}. `;
        }
        break;
      case 'noCard':
        say('No card from the referee.', e.team);
        cardNote = 'No card. ';
        break;

      case 'quickTap':
        say(`${name(e.team)} tap and go! +1 intensity for the next 3 runs.`, e.team, 'big');
        break;
      case 'advantageOver':
        say('Quick-tap advantage over.', e.team);
        break;

      case 'halftime':
        say(`Half time. ${scoreLine(match)}.`, null, 'score');
        out.moments.push({ kind: 'whistle', team: null, title: 'Half time', sub: scoreLine(match) });
        break;
      case 'secondHalf':
        say('The second half is under way.', null);
        break;
      case 'fulltime':
        say(`FULL TIME! ${name(e.winner)} win. ${scoreLine(match)}.`, e.winner, 'score');
        break;
    }
  }
  return out;
}

export function scoreLine(match) {
  const [a, b] = match.teams;
  return `${a.name} ${a.score}–${b.score} ${b.name}`;
}
