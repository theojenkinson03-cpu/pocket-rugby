// The coach: a short tip the first time each part of the game comes up.

import { CARD_BY_ID } from './cards.js';
import { possessive } from './players.js';

export const TIPS = {
  toss: { title: 'The coin toss', text: 'Call heads or tails. The winner receives the kick-off. With team cards on, the loser picks a card first.' },
  draft: { title: 'Pick a team card', text: 'Three cards are dealt. The toss loser picks first; the other side picks from the two left. Your card lasts the whole match.' },
  'scrum-half': { title: 'Your Scrum Half', text: 'The Scrum Half always plays first: after the kick-off, after every tackle and after winning the ball back. Tap to roll.' },
  runner: { title: 'Run, pass or lose it', text: "This player's die decides. A run has an intensity the defence must match, a pass moves the ball on, and an error gives it away." },
  pass: { title: 'Choose a receiver', text: 'Break is the chance this player makes a line break, Error the chance they lose the ball. The Tip badge marks the best odds.' },
  tackle: { title: 'Make the tackle', text: "Roll two brown dice. If they add up to the intensity or more, the tackle is made. Fall short and they're through." },
  try: { title: 'Go for the line', text: 'Black die: TRY scores 5 points, VIDEO REF means roll again, and anything else is a changeover.' },
  conversion: { title: 'Conversion', text: 'Every try earns a kick for 2 more points. First the brown die sets the range: each pip is 10 metres.' },
  kick: { title: 'Kick at goal', text: "The black die's number, in tens of metres, must reach the range. Watch the gauge fill on the kick cam." },
  'drop-range': { title: 'Drop-goal chance', text: 'The Centre and Back can drop goal for 3 points. Roll the brown die for the range, then decide.' },
  drop: { title: 'Kick or keep it?', text: 'Kick for 3 points now, or pass and keep the attack going. The percentage is your chance of landing it.' },
  penalty: { title: 'Penalty', text: 'One roll does two jobs: the black die checks for a yellow card (the yellow dot) and the brown die sets the range for a kick.' },
  'penalty-choice': { title: 'Kick or tap?', text: 'Kick at goal for 3 points, or quick tap for +1 intensity on your next 3 runs. The advantage ends after 3 tackles or an error.' },
  setpiece: { title: 'Scrum or lineout', text: "The side that didn't make the error feeds the scrum or throws in. White die: green wins the ball, red loses it." },
  ruck: { title: 'Ruck contest', text: 'A Big Hit against a low Hit Up lets the defence go for the ball. RUCK WIN on the black die steals it.' },
  halftime: { title: 'Half time', text: "Sin-binned players come back. The side that didn't receive first gets the second-half kick-off." },
  'line-break': { title: 'Line break!', text: 'The tackle total fell short of the intensity. The black die decides whether it ends in a try.' },
  'sin-bin': { title: 'Sin bin', text: 'A yellow card means −1 on each brown die that side rolls in a tackle, for the rest of the half. A second yellow makes it −2 for the match.' },
  injury: { title: 'Injury', text: 'Two Big Hits in one tackle hurt the ball carrier: that player runs at −1 for the rest of the match.' },
  'card-played': { title: 'Team card in play', text: '' },
  'quick-tap': { title: 'Quick-tap advantage', text: 'Every run gets +1 intensity until the defence makes 3 tackles or you make an error.' },
};

// The tip for this moment, if there is one not yet seen. Events are checked
// first, so a line break is explained as it happens.
export function tipFor(match, events, seen, humanTurn) {
  const fresh = id => (seen.includes(id) ? null : id);
  for (const e of events) {
    const id = {
      lineBreak: 'line-break',
      card: 'sin-bin',
      injury: 'injury',
      cardPlayed: 'card-played',
      quickTap: 'quick-tap',
    }[e.type];
    if (id && fresh(id)) return id;
  }
  if (!humanTurn) return null;
  const step = match.step;
  const byStep = {
    toss: 'toss',
    draft: 'draft',
    attack: step.dice?.[0] === 'S' ? 'scrum-half' : 'runner',
    pass: 'pass',
    tackle: 'tackle',
    try: 'try',
    range: step.kick === 'conversion' ? 'conversion' : 'drop-range',
    kick: 'kick',
    drop: 'drop',
    penalty: step.type === 'choose' ? 'penalty-choice' : 'penalty',
    setpiece: 'setpiece',
    ruck: 'ruck',
  }[step.purpose];
  if (step.type === 'halftime') return fresh('halftime');
  return byStep ? fresh(byStep) : null;
}

// The text for a tip, filled in for the moment (the card that was played).
export function tipText(id, events, match) {
  const tip = TIPS[id];
  if (id !== 'card-played') return tip;
  const e = events.find(x => x.type === 'cardPlayed');
  const card = e && CARD_BY_ID[e.card];
  return { title: tip.title, text: card ? `${possessive(match.teams[e.team].name)} ${card.name}: ${card.text}` : 'A team card just changed the result.' };
}
