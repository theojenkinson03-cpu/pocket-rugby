// Team cards: one each per match, drafted after the toss. Every card is data
// the engine reads at a named hook, so each effect is small and testable.
//
// value: how much the card lifts a side's chance of winning against a side
// with no card, measured over 5,000 CPU matches each (scripts/balance-cards.mjs).
// They sit between +6.8% and +9.7%, inside the simulation's ±1.4% noise of
// each other, so no pick is a trap.
//
// Effects:
//   runBonus        {pos: {hitUp, special}}  added to that player's run intensity
//   faceSwap        {pos: {knockon|touch|intercept: 'pass'}}  a losing face becomes a free pass
//   passToDrop      [pos]  that player's free pass becomes a drop-goal chance
//   kickBonus       {conversion|penalty|drop: n}  added to the black die's kick distance
//   tackleBonus     {hitUp, special}  added to the first brown die when you tackle that kind of run
//   ruckMax         n   highest Hit Up a Big Hit can contest (rules: 4)
//   ruckOnSecond    true  a Big Hit on the second die also contests the ruck
//   ruckAlsoWins    ['video']  extra black-die results that win you the ruck
//   specialDefence  n   opponents' big moves are this much lower against you
//   setPieceTies    true  scrum resets and crooked lineouts go to you
//   setPieceAdvantage n  quick-tap style bonus after winning a set piece
//   uses            {tryRerolls|ownFeedPenalty: {n, per: 'half'|'match'}}  limited effects

export const CARDS = [
  {
    id: 'big-pack',
    name: 'Big Pack',
    tag: 'Attack',
    text: 'Forward Hit Ups are +1, and Line Break is 8.',
    value: 0.068,
    effects: { runBonus: { F: { hitUp: 1, special: 2 } } },
  },
  {
    id: 'midfield-maestro',
    name: 'Midfield Maestro',
    tag: 'Attack',
    text: 'Your Centre is never intercepted: Intercepted becomes a pass.',
    value: 0.088,
    effects: { faceSwap: { C: { intercept: 'pass' } } },
  },
  {
    id: 'sure-hands',
    name: 'Sure Hands',
    tag: 'Attack',
    text: 'Your Wing never loses it: Knock On and Into Touch become passes.',
    value: 0.097,
    effects: { faceSwap: { W: { knockon: 'pass', touch: 'pass' } } },
  },
  {
    id: 'up-and-under',
    name: 'Up and Under',
    tag: 'Attack',
    text: "The Back's High Ball is 8, Back Hit Ups are +1, and Into Touch becomes a pass.",
    value: 0.078,
    effects: { runBonus: { B: { hitUp: 1, special: 2 } }, faceSwap: { B: { touch: 'pass' } } },
  },
  {
    id: 'golden-boot',
    name: 'Golden Boot',
    tag: 'Kicking',
    text: '+20 m on every conversion and penalty kick.',
    value: 0.076,
    effects: { kickBonus: { conversion: 2, penalty: 2 } },
  },
  {
    id: 'drop-artist',
    name: 'Drop-Goal Artist',
    tag: 'Kicking',
    text: "+20 m on drop goals, and the Wing's ‹Pass› face is a drop-goal chance too.",
    value: 0.087,
    effects: { kickBonus: { drop: 2 }, passToDrop: ['W'] },
  },
  {
    id: 'rush-defence',
    name: 'Rush Defence',
    tag: 'Defence',
    text: '+1 on the first brown die when you tackle a Hit Up.',
    value: 0.077,
    effects: { tackleBonus: { hitUp: 1, special: 0 } },
  },
  {
    id: 'jackal',
    name: 'Jackal',
    tag: 'Defence',
    text: 'A Big Hit on either die contests the ruck against Hit Ups up to 5, and VIDEO REF also wins it.',
    value: 0.091,
    effects: { ruckMax: 5, ruckOnSecond: true, ruckAlsoWins: ['video'] },
  },
  {
    id: 'fortress',
    name: 'Fortress',
    tag: 'Defence',
    text: "Your opponents' big moves are −2 intensity against you.",
    value: 0.092,
    effects: { specialDefence: 2 },
  },
  {
    id: 'clinical',
    name: 'Clinical Finisher',
    tag: 'Finishing',
    text: 'Once a match, a NO TRY or held-up roll is rolled again.',
    value: 0.088,
    effects: { uses: { tryRerolls: { n: 1, per: 'match' } } },
  },
  {
    id: 'set-piece-kings',
    name: 'Set-Piece Kings',
    tag: 'Set piece',
    text: 'Collapsed scrums and crooked lineouts go your way, and your first run after a set piece you win is +1.',
    value: 0.078,
    effects: { setPieceTies: true, setPieceAdvantage: 1 },
  },
  {
    id: 'squeaky-clean',
    name: 'Squeaky Clean',
    tag: 'Discipline',
    text: 'Once a match, PENALTY AGAINST on your own feed becomes PENALTY WON.',
    value: 0.083,
    effects: { uses: { ownFeedPenalty: { n: 1, per: 'match' } } },
  },
];

export const CARD_BY_ID = Object.fromEntries(CARDS.map(c => [c.id, c]));
export const CARD_IDS = CARDS.map(c => c.id);
export const DEAL_SIZE = 3;

const NONE = Object.freeze({});

// The effects a team's card gives it, or none.
export function cardEffects(match, team) {
  const id = match.teams[team].card;
  return id ? CARD_BY_ID[id].effects : NONE;
}
